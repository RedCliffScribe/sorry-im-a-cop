import { applyCitySituationTrackPatches } from '../cityPower/citySituationTrackPatch';
import { applyRelationshipThreadPatch } from '../relationship/relationshipThread';
import type {
  CaseFile,
  EvolutionChronicleEntry,
  EvolutionOutcomeRecord,
  EvolutionSourceRefs,
  GameTime,
  MemoryItem,
  NpcEvolutionOutcomeKind,
  NpcEvolutionTrack,
  OrganizationEvolutionTrack,
  RuntimeState,
  StoryDiagnosticIssue
} from '../runtime/types';
import {
  applyCasePatch,
  applyCurrentMatterPatch,
  applyDeferredEventPatch,
  applyNewsIssuePatch,
  applySignalPatch
} from '../writeback/applyWriteback';
import {
  stableBackgroundActivityId,
  stableBackgroundMemoryId,
  stableBackgroundOutcomeId
} from './ids';
import type { BackgroundEvolutionWriteback } from './protocol';
import type {
  BackgroundEvolutionSelection,
  BackgroundNpcCandidate,
  BackgroundOrganizationCandidate
} from './selection';
import { addGameHours, cloneGameTime, compareGameTimes } from './time';

const MAX_ACTIVE_NPC_TRACKS = 8;
const MAX_NEW_NPC_TRACKS_PER_RUN = 2;
const MAX_ACTIVE_ORGANIZATION_TRACKS = 12;
const MAX_NEW_ORGANIZATION_TRACKS_PER_RUN = 2;
const MAX_OUTCOMES_PER_RUN = 4;
const MAX_RECENT_OUTCOMES = 24;
const MAX_CHRONICLE_PER_RUN = 1;
const MAX_CHRONICLE = 256;

const terminalOperations = new Set(['settle', 'cancel']);
const materialOutcomeKinds = new Set<NpcEvolutionOutcomeKind>([
  'progress',
  'no_result',
  'blocked',
  'failed',
  'handoff',
  'abandoned'
]);

type NpcTrackPatch = BackgroundEvolutionWriteback['npcTrackPatches'][number];
type OrganizationTrackPatch = BackgroundEvolutionWriteback['organizationEvolutionPatches'][number];
type CasePatch = BackgroundEvolutionWriteback['casePatches'][number];

export interface ApplyBackgroundEvolutionInput {
  state: RuntimeState;
  selection: BackgroundEvolutionSelection;
  writeback: BackgroundEvolutionWriteback;
  foregroundTurnId: string;
}

export interface ApplyBackgroundEvolutionResult {
  state: RuntimeState;
  diagnostics: StoryDiagnosticIssue[];
  appliedPatchCount: number;
  droppedPatchCount: number;
}

interface AcceptedNpcTransition {
  candidate: BackgroundNpcCandidate;
  patch: NpcTrackPatch;
  previous?: NpcEvolutionTrack;
  track: NpcEvolutionTrack;
  terminal: boolean;
}

interface AcceptedOrganizationTransition {
  candidate: BackgroundOrganizationCandidate;
  patch: OrganizationTrackPatch;
  previous?: OrganizationEvolutionTrack;
  track: OrganizationEvolutionTrack;
  terminal: boolean;
}

function diagnostic(
  diagnostics: StoryDiagnosticIssue[],
  path: Array<string | number>,
  code: string,
  message: string
): void {
  diagnostics.push({ path, code, message });
}

function uniqueExisting(ids: string[] | undefined, exists: (id: string) => boolean): string[] {
  return [...new Set((ids ?? []).filter(exists))];
}

function cloneSourceRefs(sourceRefs: EvolutionSourceRefs): EvolutionSourceRefs {
  return {
    actorIds: [...sourceRefs.actorIds],
    caseIds: [...sourceRefs.caseIds],
    placeIds: [...sourceRefs.placeIds],
    organizationIds: [...sourceRefs.organizationIds],
    relationshipThreadIds: [...sourceRefs.relationshipThreadIds],
    cityTrackIds: [...sourceRefs.cityTrackIds],
    deferredEventIds: [...sourceRefs.deferredEventIds],
    outcomeIds: [...sourceRefs.outcomeIds]
  };
}

function sourceIncludesTarget(
  patch: { sourceRefs: BackgroundEvolutionWriteback['npcTrackPatches'][number]['sourceRefs'] },
  kind: keyof typeof patch.sourceRefs,
  id: string
): boolean {
  return patch.sourceRefs[kind].includes(id);
}

function isForegroundSecretOrganization(
  state: RuntimeState,
  candidate: BackgroundOrganizationCandidate | undefined
): boolean {
  if (!candidate || candidate.trigger !== 'foreground-impact') return false;
  return Boolean(
    state.actors[state.player.actorId]?.organizationRelations.some(
      (relation) => relation.organizationId === candidate.organizationId && relation.visibility === 'hidden'
    )
  );
}

function capOrganizationVisibility(
  state: RuntimeState,
  candidate: BackgroundOrganizationCandidate,
  visibility: OrganizationEvolutionTrack['visibility']
): OrganizationEvolutionTrack['visibility'] {
  return isForegroundSecretOrganization(state, candidate) && visibility === 'public' ? 'player_known' : visibility;
}

function reviewCandidate(
  selection: BackgroundEvolutionSelection,
  reviewKey: string,
  actorId?: string
): BackgroundNpcCandidate | undefined {
  return selection.npcCandidates.find(
    (candidate) => candidate.reviewKey === reviewKey && (!actorId || candidate.actorId === actorId)
  );
}

function organizationReviewCandidate(
  selection: BackgroundEvolutionSelection,
  reviewKey: string,
  organizationId?: string
): BackgroundOrganizationCandidate | undefined {
  return selection.organizationCandidates.find(
    (candidate) => candidate.reviewKey === reviewKey && (!organizationId || candidate.organizationId === organizationId)
  );
}

function buildOrganizationTrack(
  state: RuntimeState,
  candidate: BackgroundOrganizationCandidate,
  patch: OrganizationTrackPatch,
  existing: OrganizationEvolutionTrack | undefined
): OrganizationEvolutionTrack | undefined {
  const organization = state.organizations[patch.organizationId];
  if (!organization || organization.type === 'police_force') return undefined;
  const terminal = patch.operation === 'settle';
  const nextReviewAt = patch.nextReviewAt ?? existing?.nextReviewAt;
  if (!nextReviewAt || compareGameTimes(nextReviewAt, addGameHours(state.time, 24)) < 0) return undefined;

  if (terminal) {
    if (!existing || !candidate.allowMaterialProgress || !patch.outcomeKind || !patch.outcomeSummary) return undefined;
    return {
      ...existing,
      status: 'quiet',
      objective: undefined,
      currentAction: undefined,
      currentStatus: undefined,
      startedAt: undefined,
      expectedEndAt: undefined,
      nextReviewAt: cloneGameTime(nextReviewAt),
      latestOutcomeKind: patch.outcomeKind,
      latestOutcome: patch.outcomeSummary,
      lastEvolvedAt: cloneGameTime(state.time),
      lastAppliedReviewKey: patch.reviewKey,
      sourceRefs: cloneSourceRefs(patch.sourceRefs),
      visibility: patch.visibility ?? existing.visibility
    };
  }

  const status = patch.status ?? existing?.status ?? (patch.operation === 'activate' ? 'planned' : undefined);
  const objective = patch.objective ?? existing?.objective;
  const currentAction = patch.currentAction ?? existing?.currentAction;
  const currentStatus = patch.currentStatus ?? existing?.currentStatus;
  const expectedEndAt = patch.expectedEndAt ?? existing?.expectedEndAt;
  if (!status || status === 'quiet' || !objective || !currentAction || !currentStatus || !expectedEndAt) return undefined;
  const startedAt = patch.startedAt ?? existing?.startedAt ?? state.time;
  if (compareGameTimes(expectedEndAt, startedAt) <= 0) return undefined;

  const candidateActors = new Set(candidate.relatedActorIds);
  const candidatePlaces = new Set(candidate.relatedPlaceIds);
  const candidateCases = new Set(candidate.relatedCaseIds);
  const candidateCityTracks = new Set(candidate.relatedCityTrackIds);
  const relatedActorIds = uniqueExisting(
    patch.relatedActorIds ?? existing?.relatedActorIds ?? candidate.relatedActorIds,
    (actorId) => candidateActors.has(actorId) && Boolean(state.actors[actorId]) && actorId !== state.player.actorId && actorId !== 'player'
  );
  const relatedPlaceIds = uniqueExisting(
    patch.relatedPlaceIds ?? existing?.relatedPlaceIds ?? candidate.relatedPlaceIds,
    (placeId) => candidatePlaces.has(placeId) && Boolean(state.places[placeId])
  );
  const relatedCaseIds = uniqueExisting(
    patch.relatedCaseIds ?? existing?.relatedCaseIds ?? candidate.relatedCaseIds,
    (caseId) => candidateCases.has(caseId) && Boolean(state.cases[caseId])
  );
  const relatedCityTrackIds = uniqueExisting(
    patch.relatedCityTrackIds ?? existing?.relatedCityTrackIds ?? candidate.relatedCityTrackIds,
    (trackId) => candidateCityTracks.has(trackId) && Boolean(state.citySituationTracks[trackId])
  );
  const defaultVisibility = organization.visibility === 'public'
    ? 'public'
    : organization.visibility === 'player_known'
      ? 'player_known'
      : 'hidden';
  const visibility = capOrganizationVisibility(
    state,
    candidate,
    patch.visibility ?? existing?.visibility ?? defaultVisibility
  );
  if (
    ((organization.visibility === 'hidden' || organization.visibility === 'private') && visibility !== 'hidden') ||
    (organization.visibility === 'player_known' && visibility === 'public')
  ) {
    return undefined;
  }

  return {
    trackId: patch.trackId,
    organizationId: patch.organizationId,
    status,
    objective,
    currentAction,
    currentStatus,
    startedAt: cloneGameTime(startedAt),
    expectedEndAt: cloneGameTime(expectedEndAt),
    nextReviewAt: cloneGameTime(nextReviewAt),
    relatedActorIds,
    relatedPlaceIds,
    relatedCaseIds,
    relatedCityTrackIds,
    latestOutcomeKind: patch.outcomeKind ?? existing?.latestOutcomeKind,
    latestOutcome: patch.outcomeSummary ?? existing?.latestOutcome,
    lastEvolvedAt: cloneGameTime(state.time),
    lastAppliedReviewKey: patch.reviewKey,
    sourceRefs: cloneSourceRefs(patch.sourceRefs),
    visibility
  };
}

function validNextReviewAt(
  state: RuntimeState,
  candidate: BackgroundNpcCandidate,
  patch: NpcTrackPatch,
  proposed: GameTime
): boolean {
  let earliest = addGameHours(state.time, 6);
  for (const eventId of patch.relatedDeferredEventIds ?? []) {
    const event = state.deferredEvents[eventId];
    if (!event || event.status !== 'pending') continue;
    const related =
      event.relatedIds.actorId === candidate.actorId ||
      Boolean(event.relatedIds.caseId && candidate.relatedCaseIds.includes(event.relatedIds.caseId));
    if (!related || compareGameTimes(event.triggerAt, state.time) <= 0) continue;
    if (compareGameTimes(event.triggerAt, earliest) < 0) earliest = event.triggerAt;
  }
  return compareGameTimes(proposed, earliest) >= 0;
}

function buildTrack(
  state: RuntimeState,
  candidate: BackgroundNpcCandidate,
  patch: NpcTrackPatch,
  existing: NpcEvolutionTrack | undefined
): NpcEvolutionTrack | undefined {
  const actor = state.actors[patch.actorId];
  if (!actor) return undefined;
  if (patch.currentPlaceId && !state.places[patch.currentPlaceId]) return undefined;

  const status = patch.status ?? existing?.status ?? (patch.operation === 'create' ? 'planned' : undefined);
  const actionKind = patch.actionKind ?? existing?.actionKind;
  const objective = patch.objective ?? existing?.objective;
  const currentAction = patch.currentAction ?? existing?.currentAction;
  const currentStatus = patch.currentStatus ?? existing?.currentStatus;
  const nextReviewAt = patch.nextReviewAt ?? existing?.nextReviewAt;
  if (!status || !actionKind || !objective || !currentAction || !currentStatus || !nextReviewAt) return undefined;
  if (!validNextReviewAt(state, candidate, patch, nextReviewAt) && !terminalOperations.has(patch.operation)) {
    return undefined;
  }

  const relatedActorIds = uniqueExisting(
    patch.relatedActorIds ?? existing?.relatedActorIds,
    (actorId) => Boolean(state.actors[actorId]) && actorId !== state.player.actorId && actorId !== 'player'
  );
  const relatedOrganizationIds = uniqueExisting(
    patch.relatedOrganizationIds ?? existing?.relatedOrganizationIds,
    (organizationId) => Boolean(state.organizations[organizationId])
  );
  const relatedPlaceIds = uniqueExisting(
    patch.relatedPlaceIds ?? existing?.relatedPlaceIds,
    (placeId) => Boolean(state.places[placeId])
  );
  const relatedCaseIds = uniqueExisting(
    patch.relatedCaseIds ?? existing?.relatedCaseIds,
    (caseId) => Boolean(state.cases[caseId]) && candidate.relatedCaseIds.includes(caseId)
  );
  const relatedRelationshipThreadIds = uniqueExisting(
    patch.relatedRelationshipThreadIds ?? existing?.relatedRelationshipThreadIds,
    (threadId) =>
      Boolean(state.relationshipThreads[threadId]) && candidate.relatedRelationshipThreadIds.includes(threadId)
  );
  const relatedCityTrackIds = uniqueExisting(
    patch.relatedCityTrackIds ?? existing?.relatedCityTrackIds,
    (trackId) => Boolean(state.citySituationTracks[trackId])
  );
  const relatedDeferredEventIds = uniqueExisting(
    patch.relatedDeferredEventIds ?? existing?.relatedDeferredEventIds,
    (eventId) => Boolean(state.deferredEvents[eventId])
  );

  if (actionKind === 'case') {
    if (relatedCaseIds.length === 0 || !patch.expectedEndAt && !existing?.expectedEndAt) return undefined;
    if (relatedCaseIds.some((caseId) => state.cases[caseId]?.leadActorId !== patch.actorId)) return undefined;
  }

  const startedAt = patch.startedAt ?? existing?.startedAt ?? state.time;
  const expectedEndAt = patch.expectedEndAt ?? existing?.expectedEndAt;
  if (expectedEndAt && compareGameTimes(expectedEndAt, startedAt) <= 0) return undefined;

  return {
    trackId: patch.trackId,
    actorId: patch.actorId,
    status,
    actionKind,
    objective,
    currentAction,
    currentStatus,
    currentPlaceId: patch.currentPlaceId ?? existing?.currentPlaceId,
    startedAt: cloneGameTime(startedAt),
    expectedEndAt: expectedEndAt ? cloneGameTime(expectedEndAt) : undefined,
    nextReviewAt: cloneGameTime(nextReviewAt),
    relatedActorIds,
    relatedOrganizationIds,
    relatedPlaceIds,
    relatedCaseIds,
    relatedRelationshipThreadIds,
    relatedCityTrackIds,
    relatedDeferredEventIds,
    latestOutcomeKind: patch.outcomeKind ?? existing?.latestOutcomeKind,
    latestOutcome: patch.outcomeSummary ?? existing?.latestOutcome,
    lastEvolvedAt: cloneGameTime(state.time),
    lastAppliedReviewKey: patch.reviewKey,
    sourceRefs: cloneSourceRefs(patch.sourceRefs),
    visibility:
      patch.visibility ??
      existing?.visibility ??
      (relatedCaseIds.some((caseId) => state.cases[caseId]?.visibility !== 'hidden') ? 'player_known' : 'hidden')
  };
}

function caseStatusTransitionAllowed(
  current: CaseFile['status'],
  next: CaseFile['status'],
  outcome: NpcEvolutionOutcomeKind
): boolean {
  if (current === next) return true;
  const normal: Partial<Record<CaseFile['status'], CaseFile['status'][]>> = {
    intake: ['investigating'],
    investigating: ['submitted_to_prosecutions', 'returned', 'cold'],
    submitted_to_prosecutions: ['prosecution_review', 'returned'],
    prosecution_review: ['charged', 'returned'],
    charged: ['court_scheduled', 'returned'],
    court_scheduled: ['tried', 'returned'],
    tried: ['sentenced', 'returned'],
    returned: ['investigating', 'cold'],
    cold: ['investigating', 'archived']
  };
  if (outcome === 'no_result' || outcome === 'blocked' || outcome === 'handoff') return false;
  if (outcome === 'abandoned') return next === 'cold' || next === 'archived';
  return normal[current]?.includes(next) ?? false;
}

function writeMemory(state: RuntimeState, memory: MemoryItem): boolean {
  if (state.memories[memory.memoryId]) return false;
  state.memories[memory.memoryId] = memory;
  return true;
}

function formatMemoryTime(time: RuntimeState['time']): string {
  return `${time.year}年${time.month}月${time.day}日${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function lifecycleMemory(
  state: RuntimeState,
  transition: AcceptedNpcTransition,
  phase: 'created' | 'settled'
): MemoryItem | undefined {
  const track = transition.track;
  const isCaseLifecycle = track.actionKind === 'case' && track.relatedCaseIds.length > 0;
  const isPersistedNonCaseOutcome =
    phase === 'settled' && track.actionKind !== 'case' && transition.patch.persistToMemory === true;
  if (!isCaseLifecycle && !isPersistedNonCaseOutcome) return undefined;
  const actor = state.actors[track.actorId];
  if (!actor) return undefined;
  const start = track.startedAt ?? state.time;
  const end = phase === 'created' ? track.expectedEndAt : state.time;
  const place = track.currentPlaceId
    ? state.places[track.currentPlaceId]?.nameZh ?? state.places[track.currentPlaceId]?.name ?? track.currentPlaceId
    : undefined;
  const text = isPersistedNonCaseOutcome
    ? `${formatMemoryTime(start)}至${formatMemoryTime(state.time)}，${actor.name}完成一次远场行动。行动内容：${track.currentAction}；结果：${track.latestOutcome ?? track.currentStatus}${transition.patch.consequence ? `；后续影响：${transition.patch.consequence}` : ''}。`
    : phase === 'created'
      ? `${formatMemoryTime(start)}，${actor.name}开始办理案件行动。行动地点：${place ?? '未注明'}；行动内容：${track.currentAction}；目标：${track.objective}${end ? `；预计持续至${formatMemoryTime(end)}` : ''}。`
      : `${formatMemoryTime(start)}至${formatMemoryTime(state.time)}，${actor.name}完成一次案件办理节点。行动地点：${place ?? '未注明'}；行动内容：${track.currentAction}；结果：${track.latestOutcome ?? track.currentStatus}。`;
  return {
    memoryId: stableBackgroundMemoryId(track.trackId, phase, transition.patch.reviewKey),
    text,
    kind: 'actor',
    tier: 'short_term',
    relatedActorIds: [...new Set([track.actorId, ...track.relatedActorIds])],
    relatedCaseIds: [...track.relatedCaseIds],
    relatedPlaceIds: [...track.relatedPlaceIds],
    relatedOrganizationIds: [...track.relatedOrganizationIds],
    relatedTurnId: undefined,
    gameTime: cloneGameTime(state.time),
    periodStart: cloneGameTime(start),
    periodEnd: end ? cloneGameTime(end) : undefined,
    importance: isPersistedNonCaseOutcome ? 64 : phase === 'created' ? 58 : 68,
    visibility: track.visibility === 'rumor' ? 'player_known' : track.visibility,
    certainty: phase === 'created' ? 'claim' : 'fact'
  };
}

function appendCaseLifecycleActivity(
  state: RuntimeState,
  transition: AcceptedNpcTransition,
  phase: 'created' | 'settled',
  foregroundTurnId: string
): number {
  let applied = 0;
  const track = transition.track;
  for (const caseId of track.relatedCaseIds) {
    const existing = state.cases[caseId];
    if (!existing) continue;
    const activityId = stableBackgroundActivityId(track.trackId, phase, transition.patch.reviewKey);
    if (existing.activityLog.some((activity) => activity.activityId === activityId)) continue;
    const summary =
      phase === 'created'
        ? `${state.actors[track.actorId]?.name ?? track.actorId}正在${track.currentPlaceId ? `${state.places[track.currentPlaceId]?.nameZh ?? state.places[track.currentPlaceId]?.name ?? track.currentPlaceId}进行` : ''}${track.currentAction}${track.expectedEndAt ? '，已有预计复核时间。' : '。'}`
        : `${state.actors[track.actorId]?.name ?? track.actorId}的承办行动已有结果：${track.latestOutcome ?? track.currentStatus}`;
    state.cases[caseId] = applyCasePatch(
      existing,
      {
        caseId,
        activityLog: [
          {
            activityId,
            kind: 'note',
            gameTime: state.time,
            summary,
            actorId: track.actorId,
            relatedEvidenceIds: [],
            relatedActorIds: [...new Set([track.actorId, ...track.relatedActorIds])],
            relatedPlaceIds: [...track.relatedPlaceIds],
            visibleToPlayer: track.visibility !== 'hidden'
          }
        ]
      },
      foregroundTurnId,
      state.time
    );
    applied += 1;
  }
  return applied;
}

function automaticOutcome(state: RuntimeState, transition: AcceptedNpcTransition): EvolutionOutcomeRecord | undefined {
  if (!transition.terminal || !transition.patch.outcomeKind || !transition.patch.outcomeSummary) return undefined;
  const track = transition.track;
  return {
    outcomeId: stableBackgroundOutcomeId(track.trackId, transition.patch.reviewKey),
    sourceReviewKey: transition.patch.reviewKey,
    occurredAt: cloneGameTime(state.time),
    sourceKind: track.actionKind === 'case' ? 'case' : 'npc',
    sourceId: track.actionKind === 'case' ? track.relatedCaseIds[0] ?? track.trackId : track.trackId,
    title: `${state.actors[track.actorId]?.name ?? track.actorId}的后台行动结果`,
    summary: transition.patch.outcomeSummary,
    consequence: transition.patch.consequence,
    relatedActorIds: [...new Set([track.actorId, ...track.relatedActorIds])],
    relatedOrganizationIds: [...track.relatedOrganizationIds],
    relatedPlaceIds: [...track.relatedPlaceIds],
    relatedCaseIds: [...track.relatedCaseIds],
    relatedRelationshipThreadIds: [...track.relatedRelationshipThreadIds],
    sourceRefs: track.sourceRefs ? cloneSourceRefs(track.sourceRefs) : undefined,
    visibility: track.visibility,
    significance: 'routine'
  };
}

function automaticOrganizationOutcome(
  state: RuntimeState,
  transition: AcceptedOrganizationTransition
): EvolutionOutcomeRecord | undefined {
  if (!transition.terminal || !transition.patch.outcomeKind || !transition.patch.outcomeSummary) return undefined;
  const track = transition.track;
  return {
    outcomeId: stableBackgroundOutcomeId(track.trackId, transition.patch.reviewKey),
    sourceReviewKey: transition.patch.reviewKey,
    occurredAt: cloneGameTime(state.time),
    sourceKind: 'organization',
    sourceId: track.organizationId,
    title: `${state.organizations[track.organizationId]?.name ?? track.organizationId}的后台行动结果`,
    summary: transition.patch.outcomeSummary,
    consequence: transition.patch.consequence,
    relatedActorIds: [...track.relatedActorIds],
    relatedOrganizationIds: [track.organizationId],
    relatedPlaceIds: [...track.relatedPlaceIds],
    relatedCaseIds: [...track.relatedCaseIds],
    relatedRelationshipThreadIds: [],
    sourceRefs: track.sourceRefs ? cloneSourceRefs(track.sourceRefs) : undefined,
    visibility: track.visibility,
    significance: 'routine'
  };
}

function addOutcome(state: RuntimeState, outcome: EvolutionOutcomeRecord): boolean {
  if (state.backgroundEvolution.recentOutcomes.some((item) => item.outcomeId === outcome.outcomeId)) return false;
  state.backgroundEvolution.recentOutcomes = [...state.backgroundEvolution.recentOutcomes, outcome].slice(-MAX_RECENT_OUTCOMES);
  return true;
}

function selectedOutcomeSource(
  selection: BackgroundEvolutionSelection,
  sourceKind: EvolutionOutcomeRecord['sourceKind'],
  sourceId: string,
  reviewKey: string
): boolean {
  if (sourceKind === 'city') {
    return selection.cityCandidates.some((candidate) => candidate.trackId === sourceId && candidate.reviewKey === reviewKey);
  }
  if (sourceKind === 'organization') {
    return selection.organizationCandidates.some(
      (candidate) =>
        candidate.reviewKey === reviewKey &&
        (candidate.organizationId === sourceId || candidate.trackId === sourceId)
    );
  }
  return selection.npcCandidates.some(
    (candidate) =>
      candidate.reviewKey === reviewKey &&
      (candidate.actorId === sourceId || candidate.trackId === sourceId || candidate.relatedCaseIds.includes(sourceId) || candidate.relatedRelationshipThreadIds.includes(sourceId))
  );
}

function canProjectPublicOutcome(
  state: RuntimeState,
  reviewKey: string,
  outcomeIds: string[]
): boolean {
  return outcomeIds.some((outcomeId) => {
    const outcome = state.backgroundEvolution.recentOutcomes.find((item) => item.outcomeId === outcomeId);
    return outcome?.sourceReviewKey === reviewKey && outcome.visibility !== 'hidden';
  });
}

function validCityStatusTransition(
  current: RuntimeState['citySituationTracks'][string]['status'],
  next: RuntimeState['citySituationTracks'][string]['status']
): boolean {
  if (current === next) return true;
  const allowed: Record<typeof current, typeof current[]> = {
    latent: ['active'],
    active: ['escalating', 'cooling', 'resolved'],
    escalating: ['active', 'cooling'],
    cooling: ['active', 'resolved'],
    resolved: []
  };
  return allowed[current].includes(next);
}

export function applyBackgroundEvolution({
  state,
  selection,
  writeback,
  foregroundTurnId
}: ApplyBackgroundEvolutionInput): ApplyBackgroundEvolutionResult {
  const next = structuredClone(state);
  const diagnostics: StoryDiagnosticIssue[] = [];
  let appliedPatchCount = 0;
  let droppedPatchCount = 0;
  const excludedActors = new Set(selection.excludedActorIds);
  const touchedCases = new Set(selection.foregroundTouchedCaseIds);
  const touchedRelationships = new Set(selection.foregroundTouchedRelationshipThreadIds);
  const touchedCityTracks = new Set(selection.foregroundTouchedCityTrackIds);
  const touchedOrganizations = new Set(selection.foregroundTouchedOrganizationIds);
  const acceptedTransitions: AcceptedNpcTransition[] = [];
  const acceptedOrganizationTransitions: AcceptedOrganizationTransition[] = [];
  const acceptedActors = new Set<string>();
  const acceptedOrganizations = new Set<string>();
  const lifecycleMemoryActors = new Set<string>();
  const organizationMemoryIds = new Set<string>();
  let outcomesAddedThisRun = 0;
  let newTrackCount = 0;
  let newOrganizationTrackCount = 0;

  const actorPatchByActor = new Map<string, BackgroundEvolutionWriteback['backgroundActorPatches'][number]>();
  const invalidActorPatchActors = new Set<string>();
  writeback.backgroundActorPatches.forEach((patch, index) => {
    const candidate = reviewCandidate(selection, patch.reviewKey, patch.actorId);
    const valid =
      Boolean(candidate) &&
      !excludedActors.has(patch.actorId) &&
      sourceIncludesTarget(patch, 'actorIds', patch.actorId) &&
      !actorPatchByActor.has(patch.actorId) &&
      Boolean(next.actors[patch.actorId]) &&
      (!patch.currentPlaceId || Boolean(next.places[patch.currentPlaceId]));
    if (!valid) {
      invalidActorPatchActors.add(patch.actorId);
      droppedPatchCount += 1;
      diagnostic(diagnostics, ['backgroundEvolution', 'backgroundActorPatches', index], 'invalid_actor_patch', `后台 Actor patch ${patch.actorId} 已丢弃。`);
      return;
    }
    actorPatchByActor.set(patch.actorId, patch);
  });

  writeback.npcTrackPatches.forEach((patch, index) => {
    const path = ['backgroundEvolution', 'npcTrackPatches', index];
    const candidate = reviewCandidate(selection, patch.reviewKey, patch.actorId);
    const existing = next.backgroundEvolution.npcTracks[patch.trackId];
    const activeTrackCount = Object.keys(next.backgroundEvolution.npcTracks).length;
    const invalid =
      !candidate ||
      excludedActors.has(patch.actorId) ||
      invalidActorPatchActors.has(patch.actorId) ||
      acceptedActors.has(patch.actorId) ||
      !sourceIncludesTarget(patch, 'actorIds', patch.actorId) ||
      (candidate.trackId ? candidate.trackId !== patch.trackId : patch.operation !== 'create') ||
      (patch.operation === 'create' && Boolean(existing)) ||
      (patch.operation !== 'create' && !existing) ||
      (patch.operation === 'create' && (newTrackCount >= MAX_NEW_NPC_TRACKS_PER_RUN || activeTrackCount >= MAX_ACTIVE_NPC_TRACKS)) ||
      (terminalOperations.has(patch.operation) && (!candidate.allowMaterialProgress || !patch.outcomeKind || !patch.outcomeSummary)) ||
      Boolean(patch.persistToMemory && !terminalOperations.has(patch.operation)) ||
      (patch.outcomeKind && !materialOutcomeKinds.has(patch.outcomeKind));
    if (invalid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'rejected_npc_track_patch', `NPC 行动 patch ${patch.trackId} 不符合候选、门控或幂等约束，已丢弃。`);
      return;
    }
    if (existing?.lastAppliedReviewKey === patch.reviewKey) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'duplicate_review_key', `reviewKey ${patch.reviewKey} 已应用，重试项已忽略。`);
      return;
    }
    const built = buildTrack(next, candidate, patch, existing);
    if (!built) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'invalid_npc_track_shape', `NPC 行动 patch ${patch.trackId} 缺少必要字段、时间非法或引用无效。`);
      return;
    }
    const terminal = terminalOperations.has(patch.operation);
    const transition: AcceptedNpcTransition = { candidate, patch, previous: existing, track: built, terminal };
    acceptedTransitions.push(transition);
    acceptedActors.add(patch.actorId);
    if (patch.operation === 'create') newTrackCount += 1;
    if (terminal) delete next.backgroundEvolution.npcTracks[patch.trackId];
    else next.backgroundEvolution.npcTracks[patch.trackId] = built;
    appliedPatchCount += 1;

    const actorPatch = actorPatchByActor.get(patch.actorId);
    if (actorPatch) {
      const actor = next.actors[patch.actorId];
      next.actors[patch.actorId] = {
        ...actor,
        currentPlaceId: actorPatch.currentPlaceId ?? actor.currentPlaceId,
        statusSummary: actorPatch.statusSummary ?? actor.statusSummary
      };
      appliedPatchCount += 1;
      actorPatchByActor.delete(patch.actorId);
    }

    const phase = patch.operation === 'create' ? 'created' : terminal ? 'settled' : undefined;
    if (phase) {
      const memory = lifecycleMemory(next, transition, phase);
      if (memory && writeMemory(next, memory)) {
        lifecycleMemoryActors.add(patch.actorId);
        appliedPatchCount += 1;
      }
      appliedPatchCount += appendCaseLifecycleActivity(next, transition, phase, foregroundTurnId);
    }
    const outcome = automaticOutcome(next, transition);
    if (outcome && outcomesAddedThisRun < MAX_OUTCOMES_PER_RUN && addOutcome(next, outcome)) {
      outcomesAddedThisRun += 1;
      appliedPatchCount += 1;
    } else if (outcome) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'outcome_run_cap', `本次演化结果已达到 ${MAX_OUTCOMES_PER_RUN} 条上限。`);
    }
  });

  for (const [actorId, patch] of actorPatchByActor) {
    droppedPatchCount += 1;
    diagnostic(diagnostics, ['backgroundEvolution', 'backgroundActorPatches', actorId], 'orphan_actor_patch', `Actor patch ${patch.actorId} 没有同批通过的行动 patch，已丢弃。`);
  }

  writeback.organizationEvolutionPatches.forEach((patch, index) => {
    const path = ['backgroundEvolution', 'organizationEvolutionPatches', index];
    const candidate = organizationReviewCandidate(selection, patch.reviewKey, patch.organizationId);
    const existing = next.backgroundEvolution.organizationTracks[patch.trackId];
    const activeTrackCount = Object.values(next.backgroundEvolution.organizationTracks)
      .filter((track) => track.status !== 'quiet').length;
    const terminal = patch.operation === 'settle';
    const existingIsQuiet = existing?.status === 'quiet';
    const invalid =
      !candidate ||
      acceptedOrganizations.has(patch.organizationId) ||
      !sourceIncludesTarget(patch, 'organizationIds', patch.organizationId) ||
      (candidate.trackId ? candidate.trackId !== patch.trackId : patch.operation !== 'activate') ||
      (patch.operation === 'activate' && Boolean(existing && !existingIsQuiet)) ||
      (patch.operation !== 'activate' && (!existing || existingIsQuiet)) ||
      (patch.operation === 'activate' &&
        ((!existing && newOrganizationTrackCount >= MAX_NEW_ORGANIZATION_TRACKS_PER_RUN) || activeTrackCount >= MAX_ACTIVE_ORGANIZATION_TRACKS)) ||
      (terminal && (!candidate.allowMaterialProgress || !patch.outcomeKind || !patch.outcomeSummary)) ||
      (patch.outcomeKind && !materialOutcomeKinds.has(patch.outcomeKind)) ||
      Boolean(patch.stanceTowardPlayer && !candidate.allowPlayerStanceChange) ||
      Boolean(touchedOrganizations.has(patch.organizationId) && (patch.currentState || patch.pressureSummary || patch.stanceTowardPlayer)) ||
      Boolean((patch.currentState || patch.pressureSummary || patch.stanceTowardPlayer) && patch.visibility === 'hidden');
    if (invalid) {
      droppedPatchCount += 1;
      diagnostic(
        diagnostics,
        path,
        touchedOrganizations.has(patch.organizationId) ? 'foreground_organization_conflict' : 'rejected_organization_patch',
        `组织行动 patch ${patch.organizationId} 不符合候选、权限或节奏约束，已丢弃。`
      );
      return;
    }
    if (existing?.lastAppliedReviewKey === patch.reviewKey) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'duplicate_review_key', `reviewKey ${patch.reviewKey} 已应用，组织重试项已忽略。`);
      return;
    }
    const built = buildOrganizationTrack(next, candidate, patch, existing);
    if (!built) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'invalid_organization_track_shape', `组织行动 patch ${patch.organizationId} 缺少必要字段、时间非法或引用越界。`);
      return;
    }

    const transition: AcceptedOrganizationTransition = { candidate, patch, previous: existing, track: built, terminal };
    acceptedOrganizationTransitions.push(transition);
    acceptedOrganizations.add(patch.organizationId);
    if (patch.operation === 'activate' && !existing) newOrganizationTrackCount += 1;
    next.backgroundEvolution.organizationTracks[patch.trackId] = built;

    if (built.visibility !== 'hidden') {
      const organization = next.organizations[patch.organizationId];
      next.organizations[patch.organizationId] = {
        ...organization,
        currentState: patch.currentState ?? organization.currentState,
        pressureSummary: patch.pressureSummary ?? organization.pressureSummary,
        stanceTowardPlayer: candidate.allowPlayerStanceChange
          ? patch.stanceTowardPlayer ?? organization.stanceTowardPlayer
          : organization.stanceTowardPlayer
      };
    }
    appliedPatchCount += 1;

    const outcome = automaticOrganizationOutcome(next, transition);
    if (outcome && outcomesAddedThisRun < MAX_OUTCOMES_PER_RUN && addOutcome(next, outcome)) {
      outcomesAddedThisRun += 1;
      appliedPatchCount += 1;
    } else if (outcome) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'outcome_run_cap', `本次演化结果已达到 ${MAX_OUTCOMES_PER_RUN} 条上限。`);
    }
  });

  writeback.casePatches.forEach((patch: CasePatch, index) => {
    const path = ['backgroundEvolution', 'casePatches', index];
    const candidate = reviewCandidate(selection, patch.reviewKey, patch.actorId);
    const transition = acceptedTransitions.find(
      (item) => item.patch.reviewKey === patch.reviewKey && item.patch.actorId === patch.actorId && item.track.relatedCaseIds.includes(patch.caseId)
    );
    const existing = next.cases[patch.caseId];
    const valid =
      Boolean(candidate && transition && existing) &&
      !touchedCases.has(patch.caseId) &&
      sourceIncludesTarget(patch, 'caseIds', patch.caseId) &&
      existing?.leadActorId === patch.actorId &&
      transition?.patch.outcomeKind === patch.outcomeKind &&
      (!patch.status || caseStatusTransitionAllowed(existing!.status, patch.status, patch.outcomeKind));
    if (!valid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, touchedCases.has(patch.caseId) ? 'foreground_case_conflict' : 'rejected_case_patch', `案件 patch ${patch.caseId} 已丢弃。`);
      return;
    }
    next.cases[patch.caseId] = applyCasePatch(existing, patch, foregroundTurnId, next.time);
    appliedPatchCount += 1;
  });

  writeback.citySituationTrackPatches.forEach((patch, index) => {
    const path = ['backgroundEvolution', 'citySituationTrackPatches', index];
    const cityCandidate = selection.cityCandidates.find(
      (item) => item.reviewKey === patch.reviewKey && item.trackId === patch.trackId
    );
    const organizationTransition = acceptedOrganizationTransitions.find(
      (item) =>
        item.terminal &&
        item.patch.reviewKey === patch.reviewKey &&
        item.track.relatedCityTrackIds.includes(patch.trackId) &&
        sourceIncludesTarget(patch, 'organizationIds', item.track.organizationId)
    );
    const existing = next.citySituationTracks[patch.trackId];
    const valid =
      Boolean((cityCandidate || organizationTransition) && existing) &&
      !touchedCityTracks.has(patch.trackId) &&
      sourceIncludesTarget(patch, 'cityTrackIds', patch.trackId) &&
      patch.operation !== 'upsert' &&
      (patch.pressureLevel === undefined || Math.abs(patch.pressureLevel - existing!.pressureLevel) <= 1) &&
      (!patch.status || validCityStatusTransition(existing!.status, patch.status)) &&
      (!patch.nextReviewAt || compareGameTimes(patch.nextReviewAt, addGameHours(next.time, 6)) >= 0);
    if (!valid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, touchedCityTracks.has(patch.trackId) ? 'foreground_city_conflict' : 'rejected_city_patch', `城市轨道 patch ${patch.trackId} 已丢弃。`);
      return;
    }
    const result = applyCitySituationTrackPatches(next, [patch]);
    next.citySituationTracks = result.tracks;
    next.citySituationTracks[patch.trackId] = {
      ...next.citySituationTracks[patch.trackId],
      lastOutputTurnId: foregroundTurnId
    };
    diagnostics.push(...result.diagnostics.map((issue) => ({ ...issue, path })));
    appliedPatchCount += 1;
  });

  writeback.backgroundRelationshipPatches.forEach((patch, index) => {
    const path = ['backgroundEvolution', 'backgroundRelationshipPatches', index];
    const candidate = reviewCandidate(selection, patch.reviewKey, patch.actorId);
    const existing = next.relationshipThreads[patch.threadId];
    const material = Boolean(
      patch.summary || patch.status || patch.conflictSummary || patch.promiseSummary || patch.riskSummary || patch.currentPull || patch.nextNaturalBeatHint || patch.milestoneUpdates.length
    );
    const valid =
      Boolean(candidate && existing && material) &&
      candidate?.relatedRelationshipThreadIds.includes(patch.threadId) &&
      !touchedRelationships.has(patch.threadId) &&
      sourceIncludesTarget(patch, 'relationshipThreadIds', patch.threadId) &&
      existing?.relatedActorIds.includes(patch.actorId);
    if (!valid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, touchedRelationships.has(patch.threadId) ? 'foreground_relationship_conflict' : 'rejected_relationship_patch', `关系 patch ${patch.threadId} 已丢弃。`);
      return;
    }
    const result = applyRelationshipThreadPatch(
      next.relationshipThreads,
      {
        threadId: patch.threadId,
        summary: patch.summary,
        status: patch.status,
        conflictSummary: patch.conflictSummary,
        promiseSummary: patch.promiseSummary,
        riskSummary: patch.riskSummary,
        currentPull: patch.currentPull,
        nextNaturalBeatHint: patch.nextNaturalBeatHint,
        heartbeatCooldownUntil: patch.heartbeatCooldownUntil,
        milestoneUpdates: patch.milestoneUpdates,
        visibility: patch.visibility
      },
      next.time,
      next.actors
    );
    if (!result.thread || result.diagnostics.length > 0) {
      droppedPatchCount += 1;
      result.diagnostics.forEach((message) => diagnostic(diagnostics, path, 'relationship_patch_warning', message));
      return;
    }
    next.relationshipThreads[patch.threadId] = { ...result.thread, lastHeartbeatAt: cloneGameTime(next.time) };
    appliedPatchCount += 1;
  });

  writeback.deferredEventPatches.forEach((patch, index) => {
    const path = ['backgroundEvolution', 'deferredEventPatches', index];
    const candidate = reviewCandidate(selection, patch.reviewKey, patch.actorId);
    const existing = next.deferredEvents[patch.eventId];
    const relatedActorId = patch.relatedIds.actorId ?? existing?.relatedIds.actorId;
    const valid =
      Boolean(candidate) &&
      relatedActorId === patch.actorId &&
      sourceIncludesTarget(patch, 'actorIds', patch.actorId) &&
      (sourceIncludesTarget(patch, 'deferredEventIds', patch.eventId) || !existing) &&
      (patch.status !== 'pending' || Boolean(patch.triggerAt ?? existing?.triggerAt) && compareGameTimes(patch.triggerAt ?? existing!.triggerAt, next.time) > 0);
    if (!valid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'rejected_deferred_event_patch', `延迟事件 patch ${patch.eventId} 已丢弃。`);
      return;
    }
    const event = applyDeferredEventPatch(existing, patch, next.time);
    if (!event) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'incomplete_deferred_event_patch', `延迟事件 patch ${patch.eventId} 缺少必要字段。`);
      return;
    }
    next.deferredEvents[patch.eventId] = event;
    appliedPatchCount += 1;
  });

  writeback.actorMemories.forEach((patch, index) => {
    const path = ['backgroundEvolution', 'actorMemories', index];
    const candidate = reviewCandidate(selection, patch.reviewKey, patch.actorId);
    const organizationCandidate = organizationReviewCandidate(selection, patch.reviewKey);
    const organizationTransition = organizationCandidate
      ? acceptedOrganizationTransitions.find(
          (item) =>
            item.patch.reviewKey === patch.reviewKey &&
            item.track.organizationId === organizationCandidate.organizationId
        )
      : undefined;
    const organizationMemoryKey = organizationTransition?.track.organizationId;
    const memoryId = stableBackgroundMemoryId(
      organizationTransition?.track.trackId ?? patch.actorId,
      organizationTransition ? `organization_${patch.actorId}` : 'supplemental',
      patch.reviewKey
    );
    const validNpcMemory = Boolean(candidate);
    const validOrganizationMemory = Boolean(
      organizationCandidate &&
      organizationTransition &&
      organizationCandidate.relatedActorIds.includes(patch.actorId) &&
      sourceIncludesTarget(patch, 'organizationIds', organizationCandidate.organizationId) &&
      !organizationMemoryIds.has(organizationCandidate.organizationId)
    );
    const valid =
      (validNpcMemory || validOrganizationMemory) &&
      !lifecycleMemoryActors.has(patch.actorId) &&
      !excludedActors.has(patch.actorId) &&
      sourceIncludesTarget(patch, 'actorIds', patch.actorId) &&
      Boolean(next.actors[patch.actorId]) &&
      !next.memories[memoryId];
    if (!valid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'rejected_actor_memory', `NPC 记忆 ${patch.actorId} 已丢弃或被正式行动记忆优先覆盖。`);
      return;
    }
    const memory: MemoryItem = {
      memoryId,
      text: patch.text,
      kind: 'actor',
      tier: 'short_term',
      relatedActorIds: [patch.actorId],
      relatedCaseIds: uniqueExisting(patch.relatedCaseIds, (id) => Boolean(next.cases[id])),
      relatedPlaceIds: uniqueExisting(patch.relatedPlaceIds, (id) => Boolean(next.places[id])),
      relatedOrganizationIds: uniqueExisting(
        [...patch.relatedOrganizationIds, ...(organizationMemoryKey ? [organizationMemoryKey] : [])],
        (id) => Boolean(next.organizations[id])
      ),
      gameTime: cloneGameTime(patch.gameTime ?? next.time),
      periodStart: patch.periodStart ? cloneGameTime(patch.periodStart) : undefined,
      periodEnd: patch.periodEnd ? cloneGameTime(patch.periodEnd) : undefined,
      importance: patch.importance,
      visibility: patch.visibility,
      certainty: patch.certainty
    };
    writeMemory(next, memory);
    if (organizationMemoryKey) organizationMemoryIds.add(organizationMemoryKey);
    appliedPatchCount += 1;
  });

  writeback.outcomeRecords.forEach((patch, index) => {
    const path = ['backgroundEvolution', 'outcomeRecords', index];
    const valid =
      outcomesAddedThisRun < MAX_OUTCOMES_PER_RUN &&
      selectedOutcomeSource(selection, patch.sourceKind, patch.sourceId, patch.reviewKey) &&
      !next.backgroundEvolution.recentOutcomes.some((item) => item.outcomeId === patch.outcomeId);
    if (!valid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'rejected_outcome_record', `演化结果 ${patch.outcomeId} 已丢弃。`);
      return;
    }
    const outcome: EvolutionOutcomeRecord = {
      outcomeId: patch.outcomeId,
      sourceReviewKey: patch.reviewKey,
      occurredAt: cloneGameTime(patch.occurredAt ?? next.time),
      sourceKind: patch.sourceKind,
      sourceId: patch.sourceId,
      title: patch.title,
      summary: patch.summary,
      consequence: patch.consequence,
      relatedActorIds: uniqueExisting(patch.relatedActorIds, (id) => Boolean(next.actors[id])),
      relatedOrganizationIds: uniqueExisting(patch.relatedOrganizationIds, (id) => Boolean(next.organizations[id])),
      relatedPlaceIds: uniqueExisting(patch.relatedPlaceIds, (id) => Boolean(next.places[id])),
      relatedCaseIds: uniqueExisting(patch.relatedCaseIds, (id) => Boolean(next.cases[id])),
      relatedRelationshipThreadIds: uniqueExisting(patch.relatedRelationshipThreadIds, (id) => Boolean(next.relationshipThreads[id])),
      sourceRefs: cloneSourceRefs(patch.sourceRefs),
      visibility:
        patch.sourceKind === 'organization'
          ? capOrganizationVisibility(
              next,
              organizationReviewCandidate(selection, patch.reviewKey, patch.sourceId)!,
              patch.visibility
            )
          : patch.visibility,
      significance: patch.significance
    };
    if (addOutcome(next, outcome)) {
      outcomesAddedThisRun += 1;
      appliedPatchCount += 1;
    }
  });

  writeback.chronicleEntries.slice(0, MAX_CHRONICLE_PER_RUN).forEach((patch, index) => {
    const path = ['backgroundEvolution', 'chronicleEntries', index];
    const knownOutcomeIds = new Set(next.backgroundEvolution.recentOutcomes.map((item) => item.outcomeId));
    const valid =
      patch.sourceOutcomeIds.every((id) => knownOutcomeIds.has(id)) &&
      !next.backgroundEvolution.chronicle.some((item) => item.entryId === patch.entryId);
    if (!valid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'rejected_chronicle_entry', `史册条目 ${patch.entryId} 已丢弃。`);
      return;
    }
    const entry: EvolutionChronicleEntry = {
      entryId: patch.entryId,
      occurredAt: cloneGameTime(patch.occurredAt ?? next.time),
      title: patch.title,
      summary: patch.summary,
      longTermImpact: patch.longTermImpact,
      sourceOutcomeIds: [...patch.sourceOutcomeIds],
      relatedActorIds: uniqueExisting(patch.relatedActorIds, (id) => Boolean(next.actors[id])),
      relatedOrganizationIds: uniqueExisting(patch.relatedOrganizationIds, (id) => Boolean(next.organizations[id])),
      relatedPlaceIds: uniqueExisting(patch.relatedPlaceIds, (id) => Boolean(next.places[id])),
      relatedCaseIds: uniqueExisting(patch.relatedCaseIds, (id) => Boolean(next.cases[id])),
      sourceRefs: cloneSourceRefs(patch.sourceRefs),
      visibility: patch.visibility
    };
    next.backgroundEvolution.chronicle = [...next.backgroundEvolution.chronicle, entry].slice(-MAX_CHRONICLE);
    appliedPatchCount += 1;
  });
  if (writeback.chronicleEntries.length > MAX_CHRONICLE_PER_RUN) {
    droppedPatchCount += writeback.chronicleEntries.length - MAX_CHRONICLE_PER_RUN;
  }

  writeback.currentMatterPatches.forEach((patch, index) => {
    const path = ['backgroundEvolution', 'currentMatterPatches', index];
    const existing = next.dynamicEvents.currentMatters[patch.id];
    const valid = canProjectPublicOutcome(next, patch.reviewKey, patch.sourceRefs.outcomeIds) && Boolean(existing || patch.title && patch.summary && patch.source);
    if (!valid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'rejected_current_matter_projection', `动态事项 ${patch.id} 缺少可公开来源或完整字段。`);
      return;
    }
    next.dynamicEvents.currentMatters[patch.id] = applyCurrentMatterPatch(existing, patch, next.time);
    appliedPatchCount += 1;
  });
  writeback.signalPatches.forEach((patch, index) => {
    const path = ['backgroundEvolution', 'signalPatches', index];
    const existing = next.dynamicEvents.signals[patch.id];
    const valid = canProjectPublicOutcome(next, patch.reviewKey, patch.sourceRefs.outcomeIds) && Boolean(existing || patch.title && patch.summary);
    if (!valid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'rejected_signal_projection', `信号 ${patch.id} 缺少可公开来源或完整字段。`);
      return;
    }
    next.dynamicEvents.signals[patch.id] = applySignalPatch(existing, patch, next.time);
    appliedPatchCount += 1;
  });
  writeback.newsIssuePatches.forEach((patch, index) => {
    const path = ['backgroundEvolution', 'newsIssuePatches', index];
    const existing = next.dynamicEvents.newsIssues[patch.id];
    const valid = canProjectPublicOutcome(next, patch.reviewKey, patch.sourceRefs.outcomeIds) && Boolean(existing || patch.outletName && patch.headline && patch.summary);
    if (!valid) {
      droppedPatchCount += 1;
      diagnostic(diagnostics, path, 'rejected_news_projection', `新闻 ${patch.id} 缺少可公开来源或完整字段。`);
      return;
    }
    next.dynamicEvents.newsIssues[patch.id] = applyNewsIssuePatch(existing, patch, next.time);
    appliedPatchCount += 1;
  });

  return { state: next, diagnostics, appliedPatchCount, droppedPatchCount };
}
