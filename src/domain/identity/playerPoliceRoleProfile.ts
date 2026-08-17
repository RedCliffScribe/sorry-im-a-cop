import { createInitialPolicePanel } from '../police/policePanel';
import type {
  Actor,
  PoliceRoleProfile,
  RuntimeState
} from '../runtime/types';

export interface PlayerPoliceRoleProfilePatch {
  reason: string;
  stationOrPost: string;
  department: string;
  assignmentSummary: string;
  postRole?: string;
  publicIdentity?: string;
  supervisorActorIds?: string[];
  peerActorIds?: string[];
  authoritySummary?: string;
  accessSummary?: string;
  dutySummary?: string;
}

export interface PlayerPoliceRoleProfileApplyResult {
  state: RuntimeState;
  applied: boolean;
  diagnostic?: string;
}

function unique(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function updatePrimaryPoliceRelation(actor: Actor, profile: PoliceRoleProfile): Actor {
  const agencyId = profile.agencyId;
  if (!agencyId) return actor;

  const relationIndex = actor.organizationRelations.findIndex(
    (relation) => relation.organizationId === agencyId && relation.isPrimary
  );
  const fallbackRelationIndex = actor.organizationRelations.findIndex(
    (relation) => relation.organizationId === agencyId
  );
  const targetIndex = relationIndex >= 0 ? relationIndex : fallbackRelationIndex;
  const nextRelation = {
    organizationId: agencyId,
    relationType: targetIndex >= 0
      ? actor.organizationRelations[targetIndex].relationType
      : 'employee',
    roleTitle: profile.postRole ?? profile.rank,
    departmentOrUnit: profile.department ?? profile.stationOrPost,
    summary: profile.assignmentSummary ?? profile.dutySummary,
    visibility: targetIndex >= 0
      ? actor.organizationRelations[targetIndex].visibility
      : 'player_known' as const,
    isPrimary: true
  };
  const organizationRelations = [...actor.organizationRelations];
  if (targetIndex >= 0) {
    organizationRelations[targetIndex] = {
      ...organizationRelations[targetIndex],
      ...nextRelation
    };
  } else {
    organizationRelations.push(nextRelation);
  }

  return {
    ...actor,
    organizationIds: Array.from(new Set([...actor.organizationIds, agencyId])),
    organizationRelations
  };
}

function defaultPolicePublicIdentity(profile: PoliceRoleProfile): string {
  return Array.from(
    new Set(
      [
        profile.rank,
        profile.department ?? profile.stationOrPost,
        profile.postRole
      ].filter((value): value is string => Boolean(value?.trim()))
    )
  ).join(' · ');
}

export function applyPlayerPoliceRoleProfilePatch(
  state: RuntimeState,
  patch: PlayerPoliceRoleProfilePatch
): PlayerPoliceRoleProfileApplyResult {
  if (state.player.currentIdentity !== 'police') {
    return {
      state,
      applied: false,
      diagnostic: 'Police role profile changes require the player public identity to be police.'
    };
  }

  const playerActor = state.actors[state.player.actorId];
  const previousProfile = playerActor?.roleProfiles.police;
  if (!playerActor || !previousProfile) {
    return {
      state,
      applied: false,
      diagnostic: 'The player has no police role profile to update.'
    };
  }

  const supervisorActorIds = unique(patch.supervisorActorIds);
  const peerActorIds = unique(patch.peerActorIds);
  const referencedActorIds = [...(supervisorActorIds ?? []), ...(peerActorIds ?? [])];
  const invalidActorId = referencedActorIds.find(
    (actorId) => actorId === state.player.actorId || !state.actors[actorId]
  );
  if (invalidActorId) {
    return {
      state,
      applied: false,
      diagnostic: `Invalid police assignment actorId "${invalidActorId}".`
    };
  }

  const nextProfile: PoliceRoleProfile = {
    ...previousProfile,
    stationOrPost: patch.stationOrPost.trim(),
    department: patch.department.trim(),
    assignmentSummary: patch.assignmentSummary.trim(),
    ...(patch.postRole !== undefined ? { postRole: patch.postRole.trim() } : {}),
    ...(supervisorActorIds !== undefined ? { supervisorActorIds } : {}),
    ...(peerActorIds !== undefined ? { peerActorIds } : {}),
    ...(patch.authoritySummary !== undefined
      ? { authoritySummary: patch.authoritySummary.trim() }
      : {}),
    ...(patch.accessSummary !== undefined
      ? { accessSummary: patch.accessSummary.trim() }
      : {}),
    ...(patch.dutySummary !== undefined
      ? { dutySummary: patch.dutySummary.trim() }
      : {})
  };
  const publicIdentity =
    patch.publicIdentity?.trim() || defaultPolicePublicIdentity(nextProfile);
  const actorWithProfile: Actor = {
    ...playerActor,
    publicIdentity: publicIdentity || playerActor.publicIdentity,
    positionSummary:
      nextProfile.postRole ??
      nextProfile.assignmentSummary ??
      playerActor.positionSummary,
    roleProfiles: {
      ...playerActor.roleProfiles,
      police: nextProfile
    }
  };
  const nextPlayerActor = updatePrimaryPoliceRelation(actorWithProfile, nextProfile);
  const nextLawIdentity = {
    ...state.lawIdentity,
    stationOrPost: nextProfile.stationOrPost,
    department: nextProfile.department,
    assignmentSummary: nextProfile.assignmentSummary,
    supervisorActorIds: [...nextProfile.supervisorActorIds],
    peerActorIds: [...nextProfile.peerActorIds],
    authoritySummary: nextProfile.authoritySummary,
    accessSummary: nextProfile.accessSummary,
    dutySummary: nextProfile.dutySummary
  };
  const projectedPanel = createInitialPolicePanel(
    nextPlayerActor,
    nextLawIdentity,
    state.time
  );
  const nextPolicePanel = {
    ...state.policePanel,
    localChain: projectedPanel.localChain,
    unitName: projectedPanel.unitName,
    unitSummary: projectedPanel.unitSummary,
    relatedActorIds: projectedPanel.relatedActorIds,
    updatedAt: { ...state.time }
  };

  return {
    state: {
      ...state,
      actors: {
        ...state.actors,
        [state.player.actorId]: nextPlayerActor
      },
      lawIdentity: nextLawIdentity,
      policePanel: nextPolicePanel
    },
    applied: true
  };
}
