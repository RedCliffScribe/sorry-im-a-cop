import { deriveActorAgeAt, isAdultFemaleActorAt } from '../runtime/actorAge';
import { createActorDefaults } from '../runtime/actorFactory';
import type {
  Actor,
  ActorAdultPrivateWombProfile,
  ActorPregnancyHistoryRecord,
  ActorPregnancyPaternityCandidate,
  ActorPregnancyState,
  GameTime,
  PregnancyRiskType,
  RelationshipThread,
  RuntimeState,
  StoryDiagnosticIssue,
  Visibility
} from '../runtime/types';
import type { PregnancyMode } from '../settings/types';

const DAY_MS = 86_400_000;
const MAX_WOMB_RECORDS = 12;
const MAX_PREGNANCY_HISTORY = 8;
const MAX_RISK_SUMMARIES = 6;
const NEGATIVE_CHECK_COOLDOWN_DAYS = 30;
const CONFIRMATION_DAY = 45;
const DELIVERY_WINDOW_DAY = 260;
const DUE_DAY = 270;
const DELIVERY_DEADLINE_DAY = 280;
const POSTPARTUM_DAYS = 90;
const MAX_CHANCE_PERCENT = 30;

export interface PregnancyRiskPatchInput {
  actorId: string;
  riskType: PregnancyRiskType;
  summary: string;
  fatherActorId?: string;
  fatherName?: string;
  fatherVisibility?: Visibility;
}

export interface PregnancyResolutionPatchInput {
  actorId: string;
  outcome: 'live_birth' | 'pregnancy_ended';
  summary: string;
  childName?: string;
  childGender?: 'male' | 'female';
  fatherActorId?: string;
}

export interface ApplyPregnancyLifecycleInput {
  actors: RuntimeState['actors'];
  relationshipThreads: RuntimeState['relationshipThreads'];
  currentTime: GameTime;
  worldpackId: string;
  playerActorId: string;
  mode: PregnancyMode;
  riskPatches?: PregnancyRiskPatchInput[];
  resolutionPatches?: PregnancyResolutionPatchInput[];
}

export interface ApplyPregnancyLifecycleResult {
  actors: RuntimeState['actors'];
  relationshipThreads: RuntimeState['relationshipThreads'];
  diagnostics: StoryDiagnosticIssue[];
}

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

function timeValue(time: GameTime): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
}

function isAtOrAfter(time: GameTime, target: GameTime): boolean {
  return timeValue(time) >= timeValue(target);
}

function shiftDays(time: GameTime, days: number): GameTime {
  const shifted = new Date(timeValue(time) + days * DAY_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

function formatDate(time: GameTime): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}

function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableRollPercent(seed: string): number {
  return (stableHash(seed) % 1_000_000) / 10_000;
}

function compactId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 42) || 'actor';
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function compactText(values: string[], limit: number): string[] {
  return unique(values.map((value) => value.trim()).filter(Boolean)).slice(-limit);
}

function clonePregnancy(pregnancy: ActorPregnancyState): ActorPregnancyState {
  return {
    ...pregnancy,
    registeredAt: cloneTime(pregnancy.registeredAt),
    checkDueAt: cloneTime(pregnancy.checkDueAt),
    confirmationDueAt: cloneTime(pregnancy.confirmationDueAt),
    deliveryWindowAt: cloneTime(pregnancy.deliveryWindowAt),
    dueAt: cloneTime(pregnancy.dueAt),
    deliveryDeadlineAt: cloneTime(pregnancy.deliveryDeadlineAt),
    suspectedAt: pregnancy.suspectedAt ? cloneTime(pregnancy.suspectedAt) : undefined,
    confirmedAt: pregnancy.confirmedAt ? cloneTime(pregnancy.confirmedAt) : undefined,
    deliveredAt: pregnancy.deliveredAt ? cloneTime(pregnancy.deliveredAt) : undefined,
    postpartumUntil: pregnancy.postpartumUntil ? cloneTime(pregnancy.postpartumUntil) : undefined,
    riskTypes: [...pregnancy.riskTypes],
    riskSummaries: [...pregnancy.riskSummaries],
    paternityCandidates: pregnancy.paternityCandidates.map((candidate) => ({ ...candidate }))
  };
}

function cloneWomb(womb: ActorAdultPrivateWombProfile): ActorAdultPrivateWombProfile {
  return {
    ...womb,
    records: womb.records.map((record) => ({ ...record })),
    pregnancy: womb.pregnancy ? clonePregnancy(womb.pregnancy) : undefined,
    lastPregnancyCheck: womb.lastPregnancyCheck
      ? {
          ...womb.lastPregnancyCheck,
          checkedAt: cloneTime(womb.lastPregnancyCheck.checkedAt),
          cooldownUntil: cloneTime(womb.lastPregnancyCheck.cooldownUntil)
        }
      : undefined,
    pregnancyHistory: womb.pregnancyHistory?.map((record) => ({
      ...record,
      startedAt: cloneTime(record.startedAt),
      endedAt: cloneTime(record.endedAt)
    }))
  };
}

function getEligibleWomb(actor: Actor, currentTime: GameTime): ActorAdultPrivateWombProfile | undefined {
  if (!isAdultFemaleActorAt(actor, currentTime)) return undefined;
  const privateProfile = actor.femaleProfile?.adultPrivateProfile;
  if (!privateProfile || privateProfile.enabled === false) return undefined;
  return privateProfile.womb;
}

function withWomb(actor: Actor, womb: ActorAdultPrivateWombProfile): Actor {
  const femaleProfile = actor.femaleProfile;
  const adultPrivateProfile = femaleProfile?.adultPrivateProfile;
  if (!femaleProfile || !adultPrivateProfile) return actor;
  return {
    ...actor,
    femaleProfile: {
      ...femaleProfile,
      adultPrivateProfile: {
        ...adultPrivateProfile,
        womb
      }
    }
  };
}

function appendWombRecord(
  womb: ActorAdultPrivateWombProfile,
  record: ActorAdultPrivateWombProfile['records'][number]
): ActorAdultPrivateWombProfile['records'] {
  return [...womb.records.map((item) => ({ ...item })), record].slice(-MAX_WOMB_RECORDS);
}

function appendHistory(
  womb: ActorAdultPrivateWombProfile,
  record: ActorPregnancyHistoryRecord
): ActorPregnancyHistoryRecord[] {
  return [...(womb.pregnancyHistory ?? []).map((item) => ({ ...item })), record].slice(-MAX_PREGNANCY_HISTORY);
}

function ageBaseChancePercent(age: number): number {
  if (age <= 24) return 22;
  if (age <= 29) return 20;
  if (age <= 34) return 16;
  if (age <= 39) return 10;
  if (age <= 44) return 5;
  if (age <= 49) return 1.5;
  return 0.2;
}

const modeMultipliers: Record<Exclude<PregnancyMode, 'off'>, number> = {
  low: 0.45,
  standard: 1,
  high: 1.5
};

const riskMultipliers: Record<PregnancyRiskType, number> = {
  unprotected: 1,
  tryingToConceive: 1.25,
  reducedRisk: 0.25
};

function chancePercentFor(actor: Actor, currentTime: GameTime, mode: Exclude<PregnancyMode, 'off'>, riskType: PregnancyRiskType): number {
  const age = deriveActorAgeAt(actor, currentTime);
  if (age === undefined) return 0;
  return Math.min(
    MAX_CHANCE_PERCENT,
    Math.round(ageBaseChancePercent(age) * modeMultipliers[mode] * riskMultipliers[riskType] * 100) / 100
  );
}

function createPaternityCandidate(
  patch: PregnancyRiskPatchInput,
  playerActorId: string
): ActorPregnancyPaternityCandidate | undefined {
  const actorId = patch.fatherActorId?.trim();
  const name = patch.fatherName?.trim();
  if (!actorId && !name) return undefined;
  return {
    ...(actorId ? { actorId } : {}),
    ...(name ? { name } : {}),
    visibility: patch.fatherVisibility ?? (actorId === playerActorId ? 'player_known' : 'hidden')
  };
}

function mergePaternityCandidates(
  existing: ActorPregnancyPaternityCandidate[],
  candidate: ActorPregnancyPaternityCandidate | undefined
): ActorPregnancyPaternityCandidate[] {
  if (!candidate) return existing.map((item) => ({ ...item }));
  const key = `${candidate.actorId ?? ''}|${candidate.name ?? ''}`;
  const candidates = new Map<string, ActorPregnancyPaternityCandidate>(
    existing.map((item) => [`${item.actorId ?? ''}|${item.name ?? ''}`, { ...item }] as const)
  );
  candidates.set(key, candidate);
  return [...candidates.values()].slice(-4);
}

function diagnostic(index: number, area: 'risk' | 'resolution', code: string, message: string): StoryDiagnosticIssue {
  return {
    path: ['writeback', area === 'risk' ? 'pregnancyRiskPatches' : 'pregnancyResolutionPatches', index],
    code,
    message
  };
}

function advanceActorPregnancy(actor: Actor, currentTime: GameTime): Actor {
  const sourceWomb = actor.femaleProfile?.adultPrivateProfile?.womb;
  if (!sourceWomb?.pregnancy) return actor;
  let womb = cloneWomb(sourceWomb);
  let pregnancy = womb.pregnancy;
  if (!pregnancy) return actor;

  if (pregnancy.status === 'postpartum') {
    if (pregnancy.postpartumUntil && isAtOrAfter(currentTime, pregnancy.postpartumUntil)) {
      womb = {
        ...womb,
        status: '未受孕',
        pregnancy: undefined
      };
      return withWomb(actor, womb);
    }
    return actor;
  }

  if (pregnancy.status === 'pending_check' && isAtOrAfter(currentTime, pregnancy.checkDueAt)) {
    const successful = pregnancy.rollPercent < pregnancy.chancePercent;
    const checkedAt = cloneTime(pregnancy.checkDueAt);
    if (!successful) {
      womb = {
        ...womb,
        status: '未受孕',
        pregnancy: undefined,
        lastPregnancyCheck: {
          checkedAt,
          result: 'negative',
          cooldownUntil: shiftDays(checkedAt, NEGATIVE_CHECK_COOLDOWN_DAYS)
        },
        records: appendWombRecord(womb, {
          date: formatDate(checkedAt),
          description: '按期验孕，结果为阴性。',
          pregnancyCheckDate: formatDate(checkedAt)
        })
      };
      return withWomb(actor, womb);
    }

    pregnancy = {
      ...pregnancy,
      status: 'suspected',
      suspectedAt: checkedAt
    };
    womb = {
      ...womb,
      status: '疑似怀孕',
      pregnancy,
      lastPregnancyCheck: {
        checkedAt,
        result: 'positive',
        cooldownUntil: shiftDays(checkedAt, NEGATIVE_CHECK_COOLDOWN_DAYS)
      },
      records: appendWombRecord(womb, {
        date: formatDate(checkedAt),
        description: '按期验孕，结果为阳性，进入观察确认阶段。',
        pregnancyCheckDate: formatDate(checkedAt)
      })
    };
  }

  pregnancy = womb.pregnancy;
  if (!pregnancy) return withWomb(actor, womb);
  if (pregnancy.status === 'suspected' && isAtOrAfter(currentTime, pregnancy.confirmationDueAt)) {
    pregnancy = {
      ...pregnancy,
      status: 'confirmed',
      confirmedAt: cloneTime(pregnancy.confirmationDueAt)
    };
    womb = {
      ...womb,
      status: '已确认怀孕',
      pregnancy
    };
  }

  pregnancy = womb.pregnancy;
  if (pregnancy?.status === 'confirmed' && isAtOrAfter(currentTime, pregnancy.deliveryWindowAt)) {
    womb = {
      ...womb,
      status: '待产',
      pregnancy: {
        ...pregnancy,
        status: 'delivery_due'
      }
    };
  }

  return withWomb(actor, womb);
}

function selectFatherActorId(pregnancy: ActorPregnancyState, requestedFatherActorId?: string): string | undefined {
  if (requestedFatherActorId?.trim()) return requestedFatherActorId.trim();
  const candidateIds = unique(
    pregnancy.paternityCandidates
      .map((candidate) => candidate.actorId)
      .filter((actorId): actorId is string => Boolean(actorId))
  );
  return candidateIds.length === 1 ? candidateIds[0] : undefined;
}

function isFatherVisibleToPlayer(
  pregnancy: ActorPregnancyState,
  fatherActorId: string | undefined,
  playerActorId: string
): boolean {
  if (!fatherActorId) return false;
  if (fatherActorId === playerActorId) return true;
  const candidate = pregnancy.paternityCandidates.find((item) => item.actorId === fatherActorId);
  return candidate ? candidate.visibility !== 'hidden' : true;
}

function createOrUpdateFamilyThread(
  threads: RuntimeState['relationshipThreads'],
  mother: Actor,
  child: Actor,
  father: Actor | undefined,
  pregnancy: ActorPregnancyState,
  currentTime: GameTime,
  summary: string
): RuntimeState['relationshipThreads'] {
  const threadId = `rel_family_${compactId(pregnancy.pregnancyId)}`;
  const existing = threads[threadId];
  const relatedActorIds = unique([mother.actorId, father?.actorId, child.actorId].filter((actorId): actorId is string => Boolean(actorId)));
  const milestoneId = `milestone_birth_${compactId(pregnancy.pregnancyId)}`;
  const visibility: Visibility = mother.visibility === 'hidden' ? 'hidden' : 'player_known';
  const milestone = {
    milestoneId,
    gameTime: cloneTime(currentTime),
    summary,
    importance: 90,
    relatedActorIds,
    visibility
  };
  const milestones = existing?.milestones.some((item) => item.milestoneId === milestoneId)
    ? existing.milestones.map((item) => ({ ...item, gameTime: cloneTime(item.gameTime), relatedActorIds: [...item.relatedActorIds] }))
    : [...(existing?.milestones ?? []).map((item) => ({ ...item, gameTime: cloneTime(item.gameTime), relatedActorIds: [...item.relatedActorIds] })), milestone];
  const thread: RelationshipThread = {
    threadId,
    kind: 'fate',
    title: `${mother.name}与${child.name}的家庭牵连`,
    summary,
    relatedActorIds,
    primaryActorId: mother.actorId,
    relationshipRole: '亲子与家庭',
    status: 'active',
    intimacySummary: '新生儿使家庭关系进入需要持续照料与承诺的新阶段。',
    currentPull: '照料新生儿并处理父母双方的责任与关系。',
    milestones: milestones.slice(-12),
    visibility,
    importance: Math.max(existing?.importance ?? 0, 85),
    createdAt: existing ? cloneTime(existing.createdAt) : cloneTime(currentTime),
    updatedAt: cloneTime(currentTime)
  };
  return {
    ...threads,
    [threadId]: thread
  };
}

function completeLiveBirth(
  actors: RuntimeState['actors'],
  threads: RuntimeState['relationshipThreads'],
  motherActorId: string,
  currentTime: GameTime,
  summary: string,
  options: { childName?: string; childGender?: 'male' | 'female'; fatherActorId?: string },
  playerActorId: string
): { actors: RuntimeState['actors']; relationshipThreads: RuntimeState['relationshipThreads'] } {
  const mother = actors[motherActorId];
  const sourceWomb = mother?.femaleProfile?.adultPrivateProfile?.womb;
  const pregnancy = sourceWomb?.pregnancy;
  if (!mother || !sourceWomb || !pregnancy) return { actors, relationshipThreads: threads };

  const fatherActorId = selectFatherActorId(pregnancy, options.fatherActorId);
  const father = fatherActorId ? actors[fatherActorId] : undefined;
  const visibleFather = isFatherVisibleToPlayer(pregnancy, father?.actorId, playerActorId) ? father : undefined;
  const childActorId = pregnancy.childActorId ?? `npc_child_${compactId(pregnancy.pregnancyId)}`;
  const childGender = options.childGender ?? (stableHash(`${pregnancy.pregnancyId}|gender`) % 2 === 0 ? 'female' : 'male');
  const childName = options.childName?.trim() || `${mother.name}的新生${childGender === 'female' ? '女婴' : '男婴'}`;
  const parentActorIds = unique([mother.actorId, father?.actorId].filter((actorId): actorId is string => Boolean(actorId)));
  const child =
    actors[childActorId] ??
    createActorDefaults({
      actorId: childActorId,
      name: childName,
      gender: childGender,
      birthDate: formatDate(currentTime),
      computedAge: 0,
      currentIdentity: 'civilian',
      publicIdentity: '新生婴儿',
      actualIdentitySummary: `${mother.name}的孩子。`,
      roleProfiles: {},
      positionSummary: '新生婴儿',
      currentPlaceId: mother.currentPlaceId,
      currentSceneId: mother.currentSceneId,
      presence: mother.presence,
      profileSummary: `${mother.name}于${formatDate(currentTime)}生下的孩子。`,
      appearance: '新生婴儿。',
      clothing: '裹在襁褓中。',
      personality: '尚未形成稳定性格。',
      speechStyle: '尚不会说话。',
      motivation: '依赖照料与陪伴。',
      longTermGoal: '健康成长。',
      values: '尚未形成。',
      statusSummary: '新生，需由成年人照料。',
      bodyConditionSummary: '新生儿状态。',
      relationshipSummary: `${mother.name}的孩子${visibleFather ? `，父亲为${visibleFather.name}` : ''}。`,
      parentActorIds,
      visibility: mother.visibility === 'hidden' ? 'hidden' : 'player_known',
      importance: 80,
      worldpackActorData: {
        pregnancyLifecycle: {
          pregnancyId: pregnancy.pregnancyId,
          motherActorId: mother.actorId,
          ...(father ? { fatherActorId: father.actorId } : {})
        }
      }
    });

  let nextActors: RuntimeState['actors'] = {
    ...actors,
    [childActorId]: child
  };
  const womb = cloneWomb(sourceWomb);
  const deliveredPregnancy: ActorPregnancyState = {
    ...clonePregnancy(pregnancy),
    status: 'postpartum',
    deliveredAt: cloneTime(currentTime),
    postpartumUntil: shiftDays(currentTime, POSTPARTUM_DAYS),
    childActorId,
    childName
  };
  const historyRecord: ActorPregnancyHistoryRecord = {
    pregnancyId: pregnancy.pregnancyId,
    startedAt: cloneTime(pregnancy.registeredAt),
    endedAt: cloneTime(currentTime),
    outcome: 'live_birth',
    summary,
    childActorId,
    ...(father ? { fatherActorId: father.actorId } : {})
  };
  const nextWomb: ActorAdultPrivateWombProfile = {
    ...womb,
    status: '产后恢复',
    pregnancy: deliveredPregnancy,
    pregnancyHistory: appendHistory(womb, historyRecord),
    records: appendWombRecord(womb, {
      date: formatDate(currentTime),
      description: summary
    })
  };
  nextActors[mother.actorId] = withWomb(
    {
      ...mother,
      childActorIds: unique([...(mother.childActorIds ?? []), childActorId])
    },
    nextWomb
  );
  if (father) {
    nextActors[father.actorId] = {
      ...father,
      childActorIds: unique([...(father.childActorIds ?? []), childActorId])
    };
  }

  return {
    actors: nextActors,
    relationshipThreads: createOrUpdateFamilyThread(
      threads,
      nextActors[mother.actorId],
      child,
      visibleFather,
      pregnancy,
      currentTime,
      summary
    )
  };
}

function endPregnancy(actor: Actor, currentTime: GameTime, summary: string): Actor {
  const sourceWomb = actor.femaleProfile?.adultPrivateProfile?.womb;
  const pregnancy = sourceWomb?.pregnancy;
  if (!sourceWomb || !pregnancy) return actor;
  const womb = cloneWomb(sourceWomb);
  return withWomb(actor, {
    ...womb,
    status: '未受孕',
    pregnancy: undefined,
    pregnancyHistory: appendHistory(womb, {
      pregnancyId: pregnancy.pregnancyId,
      startedAt: cloneTime(pregnancy.registeredAt),
      endedAt: cloneTime(currentTime),
      outcome: 'pregnancy_ended',
      summary
    }),
    records: appendWombRecord(womb, {
      date: formatDate(currentTime),
      description: summary
    })
  });
}

function applyRiskPatch(
  actors: RuntimeState['actors'],
  patch: PregnancyRiskPatchInput,
  currentTime: GameTime,
  worldpackId: string,
  playerActorId: string,
  mode: PregnancyMode
): { actors: RuntimeState['actors']; error?: string; code?: string } {
  if (mode === 'off') {
    return { actors, code: 'pregnancy_feature_disabled', error: '怀孕机制已关闭，本回合风险事件未登记。' };
  }
  const actor = actors[patch.actorId];
  if (!actor) return { actors, code: 'pregnancy_actor_missing', error: `人物 "${patch.actorId}" 不存在，风险事件未登记。` };
  const sourceWomb = getEligibleWomb(actor, currentTime);
  if (!sourceWomb) {
    return {
      actors,
      code: 'pregnancy_actor_ineligible',
      error: `人物 "${patch.actorId}" 不是已确认成年的女性香闺秘档对象，风险事件未登记。`
    };
  }
  if (sourceWomb.pregnancy && sourceWomb.pregnancy.status !== 'pending_check') {
    return { actors, code: 'pregnancy_already_active', error: `人物 "${patch.actorId}" 已处于孕期或产后阶段，新的风险事件未登记。` };
  }
  if (
    !sourceWomb.pregnancy &&
    sourceWomb.lastPregnancyCheck?.result === 'negative' &&
    !isAtOrAfter(currentTime, sourceWomb.lastPregnancyCheck.cooldownUntil)
  ) {
    return { actors, code: 'pregnancy_check_cooldown', error: `人物 "${patch.actorId}" 仍在最近一次阴性验孕后的冷却期。` };
  }

  const womb = cloneWomb(sourceWomb);
  const candidate = createPaternityCandidate(patch, playerActorId);
  if (womb.pregnancy?.status === 'pending_check') {
    const addedChance = chancePercentFor(actor, currentTime, mode, patch.riskType) * 0.35;
    const pregnancy: ActorPregnancyState = {
      ...clonePregnancy(womb.pregnancy),
      chancePercent: Math.min(MAX_CHANCE_PERCENT, Math.round((womb.pregnancy.chancePercent + addedChance) * 100) / 100),
      riskTypes: unique([...womb.pregnancy.riskTypes, patch.riskType]),
      riskSummaries: compactText([...womb.pregnancy.riskSummaries, patch.summary], MAX_RISK_SUMMARIES),
      paternityCandidates: mergePaternityCandidates(womb.pregnancy.paternityCandidates, candidate)
    };
    const nextWomb: ActorAdultPrivateWombProfile = {
      ...womb,
      status: '待验孕',
      pregnancy,
      records: appendWombRecord(womb, {
        date: formatDate(currentTime),
        description: patch.summary,
        pregnancyCheckDate: formatDate(pregnancy.checkDueAt)
      })
    };
    return { actors: { ...actors, [actor.actorId]: withWomb(actor, nextWomb) } };
  }

  const dateKey = formatDate(currentTime).replaceAll('-', '');
  const seed = `${worldpackId}|${actor.actorId}|${dateKey}|pregnancy`;
  const checkOffsetDays = 21 + (stableHash(`${seed}|check`) % 10);
  const pregnancyId = `preg_${compactId(actor.actorId)}_${dateKey}_${stableHash(seed).toString(36)}`;
  const pregnancy: ActorPregnancyState = {
    pregnancyId,
    status: 'pending_check',
    registeredAt: cloneTime(currentTime),
    checkDueAt: shiftDays(currentTime, checkOffsetDays),
    confirmationDueAt: shiftDays(currentTime, CONFIRMATION_DAY),
    deliveryWindowAt: shiftDays(currentTime, DELIVERY_WINDOW_DAY),
    dueAt: shiftDays(currentTime, DUE_DAY),
    deliveryDeadlineAt: shiftDays(currentTime, DELIVERY_DEADLINE_DAY),
    chancePercent: chancePercentFor(actor, currentTime, mode, patch.riskType),
    rollPercent: stableRollPercent(`${seed}|roll`),
    riskTypes: [patch.riskType],
    riskSummaries: compactText([patch.summary], MAX_RISK_SUMMARIES),
    paternityCandidates: candidate ? [candidate] : []
  };
  const nextWomb: ActorAdultPrivateWombProfile = {
    ...womb,
    status: '待验孕',
    pregnancy,
    records: appendWombRecord(womb, {
      date: formatDate(currentTime),
      description: patch.summary,
      pregnancyCheckDate: formatDate(pregnancy.checkDueAt)
    })
  };
  return { actors: { ...actors, [actor.actorId]: withWomb(actor, nextWomb) } };
}

export function applyPregnancyLifecycle(input: ApplyPregnancyLifecycleInput): ApplyPregnancyLifecycleResult {
  let actors = { ...input.actors };
  let relationshipThreads = { ...input.relationshipThreads };
  const diagnostics: StoryDiagnosticIssue[] = [];

  for (const actor of Object.values(actors)) {
    const advanced = advanceActorPregnancy(actor, input.currentTime);
    if (advanced !== actor) actors[actor.actorId] = advanced;
  }

  for (const [index, patch] of (input.resolutionPatches ?? []).entries()) {
    const actor = actors[patch.actorId];
    const pregnancy = actor?.femaleProfile?.adultPrivateProfile?.womb?.pregnancy;
    if (!actor || !pregnancy || pregnancy.status === 'postpartum') {
      diagnostics.push(
        diagnostic(index, 'resolution', 'pregnancy_resolution_without_active_state', `人物 "${patch.actorId}" 没有可结算的活动妊娠。`)
      );
      continue;
    }
    if (patch.outcome === 'pregnancy_ended') {
      if (pregnancy.status === 'pending_check') {
        diagnostics.push(
          diagnostic(index, 'resolution', 'pregnancy_resolution_too_early', `人物 "${patch.actorId}" 尚未验孕，不能写回妊娠终止结局。`)
        );
        continue;
      }
      actors[actor.actorId] = endPregnancy(actor, input.currentTime, patch.summary);
      continue;
    }
    if (!isAtOrAfter(input.currentTime, pregnancy.deliveryWindowAt)) {
      diagnostics.push(
        diagnostic(index, 'resolution', 'pregnancy_delivery_too_early', `人物 "${patch.actorId}" 尚未进入可分娩窗口，活产写回被拒绝。`)
      );
      continue;
    }
    const completed = completeLiveBirth(
      actors,
      relationshipThreads,
      actor.actorId,
      input.currentTime,
      patch.summary,
      patch,
      input.playerActorId
    );
    actors = completed.actors;
    relationshipThreads = completed.relationshipThreads;
  }

  for (const actor of Object.values(actors)) {
    const pregnancy = actor.femaleProfile?.adultPrivateProfile?.womb?.pregnancy;
    if (!pregnancy || pregnancy.status === 'postpartum' || !isAtOrAfter(input.currentTime, pregnancy.deliveryDeadlineAt)) continue;
    const summary = `${actor.name}于${formatDate(input.currentTime)}安全分娩，母婴进入产后照料阶段。`;
    const completed = completeLiveBirth(
      actors,
      relationshipThreads,
      actor.actorId,
      input.currentTime,
      summary,
      {},
      input.playerActorId
    );
    actors = completed.actors;
    relationshipThreads = completed.relationshipThreads;
  }

  const riskActorIds = new Set<string>();
  for (const [index, patch] of (input.riskPatches ?? []).entries()) {
    if (riskActorIds.has(patch.actorId)) {
      diagnostics.push(
        diagnostic(index, 'risk', 'extra_pregnancy_risk_ignored', `人物 "${patch.actorId}" 本回合已有一条受孕风险，重复条目已忽略。`)
      );
      continue;
    }
    riskActorIds.add(patch.actorId);
    const result = applyRiskPatch(
      actors,
      patch,
      input.currentTime,
      input.worldpackId,
      input.playerActorId,
      input.mode
    );
    actors = result.actors;
    if (result.error && result.code) diagnostics.push(diagnostic(index, 'risk', result.code, result.error));
  }

  return { actors, relationshipThreads, diagnostics };
}
