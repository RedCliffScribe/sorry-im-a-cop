import { syncPlayerPoliceSalaryCashflow } from '../finance/playerSalaryCashflow';
import { createInitialPolicePanel } from '../police/policePanel';
import type {
  ActorOrganizationRelation,
  CivilianRoleProfile,
  CurrentIdentity,
  GameTime,
  LawIdentityRuntime,
  PlayerIdentityTransitionKind,
  PoliceRoleProfile,
  RuntimeState,
  SecretFact,
  TriadRoleProfile
} from '../runtime/types';

export type PlayerIdentityTargetRoleProfile =
  | { identity: 'police'; profile: PoliceRoleProfile }
  | { identity: 'gang_member'; profile: TriadRoleProfile }
  | { identity: 'civilian'; profile: CivilianRoleProfile };

export type SecretFactPatch =
  | {
      operation: 'upsert';
      fact: Omit<SecretFact, 'createdAt' | 'updatedAt'> & Partial<Pick<SecretFact, 'createdAt' | 'updatedAt'>>;
    }
  | { operation: 'remove'; secretId: string };

export interface PlayerIdentityContextPatch {
  transitionId: string;
  kind: PlayerIdentityTransitionKind;
  fromIdentity: CurrentIdentity;
  toIdentity: CurrentIdentity;
  publicIdentity: string;
  policeNumber?: string;
  actualIdentitySummary?: string;
  reason: string;
  targetRoleProfile: PlayerIdentityTargetRoleProfile;
  secretFactPatches?: SecretFactPatch[];
}

export interface PlayerIdentityContextApplyResult {
  state: RuntimeState;
  applied: boolean;
  idempotent: boolean;
  diagnostic?: string;
}

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizePoliceNumber(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const candidate = value.trim();
  return /^\d{4}$/.test(candidate) ? candidate : undefined;
}

function allocatePoliceNumber(state: RuntimeState, transitionId: string): string | undefined {
  const used = new Set(
    Object.values(state.actors)
      .map((actor) => normalizePoliceNumber(actor.policeNumber))
      .filter((value): value is string => Boolean(value))
  );
  let hash = 0x811c9dc5;
  const seed = `${state.player.actorId}:${transitionId}`;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const start = hash >>> 0;
  for (let offset = 0; offset < 9_000; offset += 1) {
    const candidate = String(1_000 + ((start + offset) % 9_000));
    if (!used.has(candidate)) return candidate;
  }
  return undefined;
}

function inactiveStatus(kind: PlayerIdentityTransitionKind): 'hidden' | 'suspended' | 'retired' {
  if (kind === 'cover_enter' || kind === 'cover_exit' || kind === 'exposure') return 'hidden';
  if (kind === 'leave') return 'retired';
  return 'suspended';
}

function targetStatus(kind: PlayerIdentityTransitionKind): 'active' | 'cover' {
  return kind === 'cover_enter' ? 'cover' : 'active';
}

function targetOrganizationRelation(
  target: PlayerIdentityTargetRoleProfile
): ActorOrganizationRelation | undefined {
  if (target.identity === 'police') {
    const organizationId = target.profile.agencyId ?? 'org_hk_police';
    return {
      organizationId,
      relationType: 'officer',
      roleTitle: target.profile.rank,
      departmentOrUnit: target.profile.department ?? target.profile.stationOrPost,
      summary: target.profile.assignmentSummary ?? target.profile.dutySummary,
      visibility: 'player_known',
      isPrimary: true
    };
  }
  if (target.identity === 'gang_member' && target.profile.organizationId) {
    return {
      organizationId: target.profile.organizationId,
      relationType: 'member',
      roleTitle: target.profile.roleTitle ?? target.profile.rankSummary,
      summary: target.profile.obligationSummary,
      visibility: 'player_known',
      isPrimary: true
    };
  }
  return undefined;
}

function identityOrganizationId(
  identity: CurrentIdentity,
  profiles: RuntimeState['actors'][string]['roleProfiles']
): string | undefined {
  if (identity === 'police') return profiles.police?.agencyId ?? 'org_hk_police';
  if (identity === 'gang_member') return profiles.triad?.organizationId;
  return undefined;
}

function updateOrganizationRelations(
  state: RuntimeState,
  fromIdentity: CurrentIdentity,
  target: PlayerIdentityTargetRoleProfile
): { relations: ActorOrganizationRelation[]; organizationIds: string[] } {
  const actor = state.actors[state.player.actorId];
  const previousOrganizationId = identityOrganizationId(fromIdentity, actor.roleProfiles);
  const targetRelation = targetOrganizationRelation(target);
  const nextRelations = actor.organizationRelations.map((relation) => {
    if (targetRelation && relation.organizationId === targetRelation.organizationId) {
      return { ...targetRelation };
    }
    if (previousOrganizationId && relation.organizationId === previousOrganizationId) {
      return { ...relation, visibility: 'hidden' as const, isPrimary: false };
    }
    return relation.isPrimary ? { ...relation, isPrimary: false } : { ...relation };
  });

  if (targetRelation && !nextRelations.some((relation) => relation.organizationId === targetRelation.organizationId)) {
    nextRelations.push(targetRelation);
  }

  return {
    relations: nextRelations,
    organizationIds: unique(
      nextRelations.filter((relation) => relation.visibility !== 'hidden').map((relation) => relation.organizationId)
    )
  };
}

export function applySecretFactPatches(
  current: RuntimeState['secretFacts'],
  patches: SecretFactPatch[] | undefined,
  time: GameTime
): RuntimeState['secretFacts'] {
  if (!patches?.length) return current;
  const next = { ...current };
  for (const patch of patches) {
    if (patch.operation === 'remove') {
      delete next[patch.secretId];
      continue;
    }
    const existing = next[patch.fact.secretId];
    next[patch.fact.secretId] = {
      ...patch.fact,
      knownByActorIds: unique(patch.fact.knownByActorIds),
      revealConditions: unique(patch.fact.revealConditions),
      createdAt: cloneTime(existing?.createdAt ?? patch.fact.createdAt ?? time),
      updatedAt: cloneTime(patch.fact.updatedAt ?? time)
    };
  }
  return next;
}

function toLawIdentity(
  current: LawIdentityRuntime,
  target: PlayerIdentityTargetRoleProfile,
  nextProfiles: RuntimeState['actors'][string]['roleProfiles']
): LawIdentityRuntime {
  if (target.identity !== 'police') {
    return {
      ...current,
      status: nextProfiles.police ? 'hidden' : 'none',
      authoritySummary: '当前公开身份没有可用的警务权限。',
      accessSummary: '当前公开身份不能使用警队内部权限。',
      dutySummary: '当前没有可公开履行的警务职责。'
    };
  }

  const profile = target.profile;
  return {
    status: 'active',
    agencyId: profile.agencyId ?? 'org_hk_police',
    stationOrPost: profile.stationOrPost,
    department: profile.department,
    rank: profile.rank,
    assignmentSummary: profile.assignmentSummary,
    supervisorActorIds: [...profile.supervisorActorIds],
    peerActorIds: [...profile.peerActorIds],
    authoritySummary: profile.authoritySummary,
    accessSummary: profile.accessSummary,
    dutySummary: profile.dutySummary,
    institutionalReputation: profile.institutionalReputation,
    disciplinePressureSummary: profile.disciplinePressureSummary,
    covertStatus: profile.covertStatus
  };
}

function reject(state: RuntimeState, diagnostic: string): PlayerIdentityContextApplyResult {
  return { state, applied: false, idempotent: false, diagnostic };
}

export function applyPlayerIdentityContextPatch(
  state: RuntimeState,
  patch: PlayerIdentityContextPatch
): PlayerIdentityContextApplyResult {
  const transitionId = patch.transitionId.trim();
  if (!transitionId) return reject(state, 'identityContextPatch.transitionId 不能为空。');
  if (state.player.identityHistory.some((record) => record.transitionId === transitionId)) {
    return { state, applied: false, idempotent: true };
  }
  if (state.player.currentIdentity !== patch.fromIdentity) {
    return reject(
      state,
      `身份切换软拒绝：当前身份为 ${state.player.currentIdentity}，但补丁声明 fromIdentity=${patch.fromIdentity}。`
    );
  }
  if (patch.targetRoleProfile.identity !== patch.toIdentity) {
    return reject(state, '身份切换软拒绝：toIdentity 与 targetRoleProfile.identity 不一致。');
  }
  const playerActor = state.actors[state.player.actorId];
  if (!playerActor) return reject(state, `身份切换软拒绝：找不到玩家 Actor ${state.player.actorId}。`);
  if (!patch.publicIdentity.trim()) return reject(state, '身份切换软拒绝：publicIdentity 不能为空。');
  if (!patch.reason.trim()) return reject(state, '身份切换软拒绝：reason 不能为空。');
  const suppliedPoliceNumber = normalizePoliceNumber(patch.policeNumber);
  if (patch.policeNumber !== undefined && !suppliedPoliceNumber) {
    return reject(state, '身份切换软拒绝：policeNumber 必须是四位数字。');
  }
  if (patch.toIdentity !== 'police' && patch.policeNumber !== undefined) {
    return reject(state, '身份切换软拒绝：只有目标身份为 police 时才能写 policeNumber。');
  }
  const existingPoliceNumber = normalizePoliceNumber(state.player.policeNumber);
  const allocatedPoliceNumber =
    patch.toIdentity === 'police' && !suppliedPoliceNumber && !existingPoliceNumber
      ? allocatePoliceNumber(state, transitionId)
      : undefined;
  if (patch.toIdentity === 'police' && !suppliedPoliceNumber && !existingPoliceNumber && !allocatedPoliceNumber) {
    return reject(state, '身份切换软拒绝：没有可分配的四位 policeNumber。');
  }
  const nextPoliceNumber =
    patch.toIdentity === 'police'
      ? suppliedPoliceNumber ?? existingPoliceNumber ?? allocatedPoliceNumber
      : state.player.policeNumber;

  const nextRoleProfiles = { ...playerActor.roleProfiles };
  if (patch.fromIdentity !== patch.toIdentity) {
    const status = inactiveStatus(patch.kind);
    if (patch.fromIdentity === 'police' && nextRoleProfiles.police) {
      nextRoleProfiles.police = { ...nextRoleProfiles.police, status };
    } else if (patch.fromIdentity === 'gang_member' && nextRoleProfiles.triad) {
      nextRoleProfiles.triad = { ...nextRoleProfiles.triad, status };
    } else if (patch.fromIdentity === 'civilian' && nextRoleProfiles.civilian) {
      nextRoleProfiles.civilian = { ...nextRoleProfiles.civilian, status };
    }
  }
  const status = targetStatus(patch.kind);
  if (patch.targetRoleProfile.identity === 'police') {
    nextRoleProfiles.police = { ...patch.targetRoleProfile.profile, status };
  } else if (patch.targetRoleProfile.identity === 'gang_member') {
    nextRoleProfiles.triad = { ...patch.targetRoleProfile.profile, status };
  } else {
    nextRoleProfiles.civilian = { ...patch.targetRoleProfile.profile, status };
  }

  const organizationProjection = updateOrganizationRelations(state, patch.fromIdentity, patch.targetRoleProfile);
  const secretFacts = applySecretFactPatches(state.secretFacts, patch.secretFactPatches, state.time);
  const touchedSecretFactIds = unique(
    (patch.secretFactPatches ?? []).map((secretPatch) =>
      secretPatch.operation === 'remove' ? secretPatch.secretId : secretPatch.fact.secretId
    )
  );
  const actor = {
    ...playerActor,
    currentIdentity: patch.toIdentity,
    publicIdentity: patch.publicIdentity.trim(),
    policeNumber: nextPoliceNumber,
    actualIdentitySummary: patch.actualIdentitySummary?.trim() || patch.publicIdentity.trim(),
    roleProfiles: nextRoleProfiles,
    organizationIds: organizationProjection.organizationIds,
    organizationRelations: organizationProjection.relations,
    positionSummary: patch.publicIdentity.trim()
  };
  const lawIdentity = toLawIdentity(state.lawIdentity, patch.targetRoleProfile, nextRoleProfiles);
  const player = {
    ...state.player,
    currentIdentity: patch.toIdentity,
    policeNumber: nextPoliceNumber,
    identityHistory: [
      ...state.player.identityHistory,
      {
        transitionId,
        kind: patch.kind,
        fromIdentity: patch.fromIdentity,
        toIdentity: patch.toIdentity,
        publicIdentity: patch.publicIdentity.trim(),
        reason: patch.reason.trim(),
        occurredAt: cloneTime(state.time),
        secretFactIds: touchedSecretFactIds
      }
    ]
  };
  const finance = syncPlayerPoliceSalaryCashflow({
    finance: state.finance,
    time: state.time,
    currentIdentity: patch.toIdentity,
    lawIdentity
  });

  const nextState: RuntimeState = {
    ...state,
    player,
    actors: { ...state.actors, [player.actorId]: actor },
    secretFacts,
    lawIdentity,
    policePanel: createInitialPolicePanel(actor, lawIdentity, state.time),
    finance
  };

  return { state: nextState, applied: true, idempotent: false };
}
