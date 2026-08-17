import type {
  Actor,
  CivilianRoleProfile,
  RoleProfileStatus,
  RuntimeState
} from '../runtime/types';

export interface PlayerCivilianRoleProfilePatch {
  reason: string;
  status?: RoleProfileStatus;
  civilianProfileId?: string | null;
  occupationGroupId?: string | null;
  employmentStatusId?: string | null;
  publicOccupation?: string;
  workplacePlaceId?: string | null;
  employerOrganizationId?: string | null;
  employerRelationType?: string | null;
  employerRelationSummary?: string | null;
  workUnitSummary?: string | null;
  positionSummary?: string | null;
  dutySummary?: string | null;
  decisionScopeSummary?: string | null;
  accessSummary?: string | null;
  sectorIds?: string[];
  roleTags?: string[];
  livelihoodActorIds?: string[];
  communitySummary?: string;
  familyEconomicSummary?: string;
  legalStatusSummary?: string;
}

export interface PlayerCivilianRoleProfileApplyResult {
  state: RuntimeState;
  applied: boolean;
  diagnostic?: string;
}

const nullableKeys = [
  'civilianProfileId',
  'occupationGroupId',
  'employmentStatusId',
  'workplacePlaceId',
  'employerOrganizationId',
  'employerRelationType',
  'employerRelationSummary',
  'workUnitSummary',
  'positionSummary',
  'dutySummary',
  'decisionScopeSummary',
  'accessSummary'
] as const;

const currentJobNullableKeys = [
  'civilianProfileId',
  'occupationGroupId',
  'workplacePlaceId',
  'employerRelationType',
  'employerRelationSummary',
  'workUnitSummary',
  'positionSummary',
  'dutySummary',
  'decisionScopeSummary',
  'accessSummary'
] as const;

function unique(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeCivilianRoleProfile(
  profile: CivilianRoleProfile
): CivilianRoleProfile {
  return {
    ...profile,
    sectorIds: unique(profile.sectorIds) ?? [],
    roleTags: unique(profile.roleTags) ?? [],
    livelihoodActorIds: unique(profile.livelihoodActorIds) ?? []
  };
}

function normalizeRoleTransitionPatch(
  previousProfile: CivilianRoleProfile,
  patch: PlayerCivilianRoleProfilePatch
): PlayerCivilianRoleProfilePatch {
  const endsEmployment =
    patch.employmentStatusId === 'unemployed' ||
    patch.employerOrganizationId === null;
  const changesEmployer =
    typeof patch.employerOrganizationId === 'string' &&
    patch.employerOrganizationId !== previousProfile.employerOrganizationId;

  if (!endsEmployment && !changesEmployer) return patch;

  const normalized: PlayerCivilianRoleProfilePatch = { ...patch };
  for (const key of currentJobNullableKeys) {
    if (normalized[key] === undefined) {
      Object.assign(normalized, { [key]: null });
    }
  }
  if (normalized.sectorIds === undefined) normalized.sectorIds = [];
  if (normalized.roleTags === undefined) normalized.roleTags = [];
  if (normalized.livelihoodActorIds === undefined) normalized.livelihoodActorIds = [];

  if (endsEmployment) {
    normalized.employmentStatusId = 'unemployed';
    normalized.employerOrganizationId = null;
    normalized.publicOccupation = normalized.publicOccupation?.trim() || '暂时无业';
    normalized.positionSummary = normalized.positionSummary ?? '暂时无业';
    normalized.decisionScopeSummary =
      normalized.decisionScopeSummary ?? '可以自行安排求职、临时工作与生活事务。';
  }

  return normalized;
}

function applyOptionalString(
  target: Record<string, unknown>,
  patch: PlayerCivilianRoleProfilePatch,
  key: (typeof nullableKeys)[number]
) {
  const value = patch[key];
  if (value === undefined) return;
  if (value === null) {
    delete target[key];
    return;
  }
  target[key] = value.trim();
}

function replacePrimaryCivilianEmployerRelation(
  actor: Actor,
  previousEmployerOrganizationId: string | undefined,
  profile: CivilianRoleProfile
): Actor {
  const retainedRelations = actor.organizationRelations.filter(
    (relation) =>
      !(
        relation.isPrimary &&
        previousEmployerOrganizationId &&
        relation.organizationId === previousEmployerOrganizationId
      )
  );
  const nextRelations = profile.employerOrganizationId
    ? [
        ...retainedRelations,
        {
          organizationId: profile.employerOrganizationId,
          relationType: profile.employerRelationType ?? 'employee',
          roleTitle: profile.positionSummary ?? profile.publicOccupation,
          departmentOrUnit: profile.workUnitSummary,
          summary:
            profile.employerRelationSummary ??
            `玩家以“${profile.publicOccupation ?? '市民'}”身份与该机构保持工作关系。`,
          visibility: 'player_known' as const,
          isPrimary: true
        }
      ]
    : retainedRelations;
  const relationOrganizationIds = nextRelations.map((relation) => relation.organizationId);
  const retainedOrganizationIds = actor.organizationIds.filter(
    (organizationId) =>
      organizationId !== previousEmployerOrganizationId ||
      relationOrganizationIds.includes(organizationId)
  );

  return {
    ...actor,
    publicIdentity: profile.publicOccupation ?? actor.publicIdentity,
    positionSummary: profile.positionSummary ?? profile.publicOccupation ?? actor.positionSummary,
    roleProfiles: {
      ...actor.roleProfiles,
      civilian: profile
    },
    organizationRelations: nextRelations,
    organizationIds: Array.from(
      new Set([
        ...retainedOrganizationIds,
        ...relationOrganizationIds,
        ...(profile.employerOrganizationId ? [profile.employerOrganizationId] : [])
      ])
    )
  };
}

export function applyPlayerCivilianRoleProfilePatch(
  state: RuntimeState,
  patch: PlayerCivilianRoleProfilePatch
): PlayerCivilianRoleProfileApplyResult {
  if (state.player.currentIdentity !== 'civilian') {
    return {
      state,
      applied: false,
      diagnostic: 'Civilian role profile changes require the player public identity to be civilian.'
    };
  }

  const playerActor = state.actors[state.player.actorId];
  if (!playerActor?.roleProfiles.civilian) {
    return {
      state,
      applied: false,
      diagnostic: 'The player has no civilian role profile to update.'
    };
  }

  if (
    typeof patch.workplacePlaceId === 'string' &&
    !state.places[patch.workplacePlaceId]
  ) {
    return {
      state,
      applied: false,
      diagnostic: `Unknown workplacePlaceId "${patch.workplacePlaceId}".`
    };
  }
  if (
    typeof patch.employerOrganizationId === 'string' &&
    !state.organizations[patch.employerOrganizationId]
  ) {
    return {
      state,
      applied: false,
      diagnostic: `Unknown employerOrganizationId "${patch.employerOrganizationId}".`
    };
  }

  const livelihoodActorIds = unique(patch.livelihoodActorIds);
  const missingActorId = livelihoodActorIds?.find(
    (actorId) => actorId === state.player.actorId || !state.actors[actorId]
  );
  if (missingActorId) {
    return {
      state,
      applied: false,
      diagnostic: `Invalid livelihoodActorId "${missingActorId}".`
    };
  }

  const previousProfile = normalizeCivilianRoleProfile(playerActor.roleProfiles.civilian);
  const normalizedPatch = normalizeRoleTransitionPatch(previousProfile, patch);
  const nextProfileDraft: Record<string, unknown> = {
    ...previousProfile,
    ...(normalizedPatch.status ? { status: normalizedPatch.status } : {}),
    ...(normalizedPatch.publicOccupation
      ? { publicOccupation: normalizedPatch.publicOccupation.trim() }
      : {}),
    ...(normalizedPatch.sectorIds
      ? { sectorIds: unique(normalizedPatch.sectorIds) ?? [] }
      : {}),
    ...(normalizedPatch.roleTags
      ? { roleTags: unique(normalizedPatch.roleTags) ?? [] }
      : {}),
    ...(livelihoodActorIds ? { livelihoodActorIds } : {}),
    ...(normalizedPatch.communitySummary !== undefined
      ? { communitySummary: normalizedPatch.communitySummary.trim() }
      : {}),
    ...(normalizedPatch.familyEconomicSummary !== undefined
      ? { familyEconomicSummary: normalizedPatch.familyEconomicSummary.trim() }
      : {}),
    ...(normalizedPatch.legalStatusSummary !== undefined
      ? { legalStatusSummary: normalizedPatch.legalStatusSummary.trim() }
      : {})
  };
  if (normalizedPatch.livelihoodActorIds !== undefined) {
    nextProfileDraft.livelihoodActorIds = unique(normalizedPatch.livelihoodActorIds) ?? [];
  }
  for (const key of nullableKeys) {
    applyOptionalString(nextProfileDraft, normalizedPatch, key);
  }
  const nextProfile = normalizeCivilianRoleProfile(
    nextProfileDraft as unknown as CivilianRoleProfile
  );
  const nextPlayerActor = replacePrimaryCivilianEmployerRelation(
    playerActor,
    previousProfile.employerOrganizationId,
    nextProfile
  );

  return {
    state: {
      ...state,
      actors: {
        ...state.actors,
        [state.player.actorId]: nextPlayerActor
      }
    },
    applied: true
  };
}
