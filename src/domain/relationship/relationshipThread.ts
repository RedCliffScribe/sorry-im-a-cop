import type {
  Actor,
  ActorId,
  GameTime,
  RelationshipHeartbeatCandidate,
  RelationshipThread,
  RelationshipCreationBasis,
  RelationshipEvidenceRef,
  RelationshipThreadKind,
  RelationshipThreadMilestone,
  RelationshipThreadStatus,
  Visibility
} from '../runtime/types';

export interface RelationshipMilestonePatch {
  milestoneId: string;
  summary?: string;
  importance?: number;
  relatedActorIds?: ActorId[];
  visibility?: Visibility;
}

export interface RelationshipThreadPatch {
  threadId: string;
  kind?: RelationshipThreadKind;
  title?: string;
  summary?: string;
  relatedActorIds?: ActorId[];
  primaryActorId?: ActorId;
  relationshipRole?: string;
  creationBasis?: RelationshipCreationBasis;
  evidenceRefs?: RelationshipEvidenceRef[];
  status?: RelationshipThreadStatus;
  intimacySummary?: string;
  trustSummary?: string;
  conflictSummary?: string;
  promiseSummary?: string;
  riskSummary?: string;
  currentPull?: string;
  nextNaturalBeatHint?: string;
  heartbeatCooldownUntil?: GameTime;
  milestoneUpdates?: RelationshipMilestonePatch[];
  visibility?: Visibility;
  importance?: number;
}

export interface ApplyRelationshipThreadResult {
  thread?: RelationshipThread;
  diagnostics: string[];
}

export interface RelationshipHeartbeatOptions {
  now: GameTime;
  presentActorIds: Set<string>;
  maxCandidates?: number;
}

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

function timeValue(time: GameTime): number {
  return (((time.year * 100 + time.month) * 100 + time.day) * 100 + time.hour) * 100 + time.minute;
}

function clampImportance(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueActorIds(actorIds: ActorId[] | undefined): ActorId[] {
  return [...new Set((actorIds ?? []).filter(Boolean))];
}

function missingActorIds(actorIds: ActorId[], actors: Record<string, Actor>): string[] {
  return actorIds.filter((actorId) => actorId !== 'player' && !actors[actorId]);
}

function mergeMilestone(
  existing: RelationshipThreadMilestone | undefined,
  patch: RelationshipMilestonePatch,
  now: GameTime
): RelationshipThreadMilestone | undefined {
  const summary = patch.summary ?? existing?.summary;
  if (!summary) return undefined;

  return {
    milestoneId: patch.milestoneId,
    gameTime: existing?.gameTime ? cloneTime(existing.gameTime) : cloneTime(now),
    summary,
    importance: clampImportance(patch.importance, existing?.importance ?? 50),
    relatedActorIds: uniqueActorIds(patch.relatedActorIds ?? existing?.relatedActorIds),
    visibility: patch.visibility ?? existing?.visibility ?? 'player_known'
  };
}

function mergeMilestones(
  existing: RelationshipThreadMilestone[],
  patches: RelationshipMilestonePatch[] | undefined,
  now: GameTime
): RelationshipThreadMilestone[] {
  if (!patches?.length) return existing.map((milestone) => ({ ...milestone, gameTime: cloneTime(milestone.gameTime) }));

  const byId = new Map(existing.map((milestone) => [milestone.milestoneId, milestone]));
  for (const patch of patches) {
    if (!patch.milestoneId) continue;
    const merged = mergeMilestone(byId.get(patch.milestoneId), patch, now);
    if (merged) byId.set(patch.milestoneId, merged);
  }

  return [...byId.values()].sort(
    (left, right) =>
      timeValue(right.gameTime) - timeValue(left.gameTime) ||
      right.importance - left.importance ||
      right.milestoneId.localeCompare(left.milestoneId)
  );
}

export function applyRelationshipThreadPatch(
  existingThreads: Record<string, RelationshipThread>,
  patch: RelationshipThreadPatch,
  now: GameTime,
  actors: Record<string, Actor>
): ApplyRelationshipThreadResult {
  const existing = existingThreads[patch.threadId];
  const diagnostics: string[] = [];
  const relatedActorIds = uniqueActorIds(patch.relatedActorIds ?? existing?.relatedActorIds);
  const missingActors = missingActorIds(relatedActorIds, actors);
  if (missingActors.length > 0) {
    diagnostics.push(`Relationship thread "${patch.threadId}" references missing actors: ${missingActors.join(', ')}.`);
  }

  if (!existing) {
    const missingFields: string[] = [];
    if (!patch.kind) missingFields.push('kind');
    if (!patch.title) missingFields.push('title');
    if (!patch.summary) missingFields.push('summary');
    if (!relatedActorIds.length) missingFields.push('relatedActorIds');
    if (!patch.relationshipRole) missingFields.push('relationshipRole');
    if (missingFields.length > 0) {
      return {
        diagnostics: [
          `New relationship thread "${patch.threadId}" requires ${missingFields.join(', ')}.`
        ]
      };
    }
  }

  const primaryActorId = patch.primaryActorId ?? existing?.primaryActorId ?? relatedActorIds[0];
  const thread: RelationshipThread = {
    threadId: patch.threadId,
    kind: patch.kind ?? existing?.kind ?? 'network',
    title: patch.title ?? existing?.title ?? patch.threadId,
    summary: patch.summary ?? existing?.summary ?? '',
    relatedActorIds,
    primaryActorId,
    relationshipRole: patch.relationshipRole ?? existing?.relationshipRole ?? '',
    creationBasis: patch.creationBasis ?? existing?.creationBasis,
    evidenceRefs: (patch.evidenceRefs ?? existing?.evidenceRefs)?.map((ref) => ({ ...ref })),
    status: patch.status ?? existing?.status ?? 'active',
    intimacySummary: patch.intimacySummary ?? existing?.intimacySummary,
    trustSummary: patch.trustSummary ?? existing?.trustSummary,
    conflictSummary: patch.conflictSummary ?? existing?.conflictSummary,
    promiseSummary: patch.promiseSummary ?? existing?.promiseSummary,
    riskSummary: patch.riskSummary ?? existing?.riskSummary,
    currentPull: patch.currentPull ?? existing?.currentPull,
    nextNaturalBeatHint: patch.nextNaturalBeatHint ?? existing?.nextNaturalBeatHint,
    lastHeartbeatAt: existing?.lastHeartbeatAt ? cloneTime(existing.lastHeartbeatAt) : undefined,
    heartbeatCooldownUntil: patch.heartbeatCooldownUntil
      ? cloneTime(patch.heartbeatCooldownUntil)
      : existing?.heartbeatCooldownUntil
        ? cloneTime(existing.heartbeatCooldownUntil)
        : undefined,
    milestones: mergeMilestones(existing?.milestones ?? [], patch.milestoneUpdates, now),
    visibility: patch.visibility ?? existing?.visibility ?? 'player_known',
    importance: clampImportance(patch.importance, existing?.importance ?? 50),
    createdAt: existing?.createdAt ? cloneTime(existing.createdAt) : cloneTime(now),
    updatedAt: cloneTime(now)
  };

  return { thread, diagnostics };
}

function isDue(cooldown: GameTime | undefined, now: GameTime): boolean {
  return !cooldown || timeValue(cooldown) <= timeValue(now);
}

function resolveBeatType(thread: RelationshipThread): RelationshipHeartbeatCandidate['beatType'] {
  if (thread.riskSummary) return 'risk';
  if (thread.promiseSummary) return 'obligation';
  if (thread.currentPull) return 'message';
  return thread.kind === 'fate' ? 'memory' : 'encounter';
}

function heartbeatReason(thread: RelationshipThread): string {
  return thread.nextNaturalBeatHint || thread.currentPull || thread.promiseSummary || thread.riskSummary || thread.summary;
}

export function buildRelationshipHeartbeatCandidates(
  threads: RelationshipThread[],
  options: RelationshipHeartbeatOptions
): RelationshipHeartbeatCandidate[] {
  const maxCandidates = options.maxCandidates ?? 3;

  return threads
    .filter((thread) => thread.visibility !== 'hidden')
    .filter((thread) => thread.status === 'active' || thread.status === 'strained')
    .filter((thread) => thread.relatedActorIds.every((actorId) => !options.presentActorIds.has(actorId)))
    .filter((thread) => isDue(thread.heartbeatCooldownUntil, options.now))
    .filter((thread) => Boolean(thread.currentPull || thread.nextNaturalBeatHint || thread.promiseSummary || thread.riskSummary))
    .sort(sortRelationshipThreads)
    .slice(0, maxCandidates)
    .map((thread) => ({
      threadId: thread.threadId,
      kind: thread.kind,
      title: thread.title,
      relatedActorIds: [...thread.relatedActorIds],
      beatType: resolveBeatType(thread),
      summary: thread.summary,
      reason: heartbeatReason(thread),
      importance: thread.importance
    }));
}

function sortRelationshipThreads(left: RelationshipThread, right: RelationshipThread): number {
  const statusWeight: Record<RelationshipThreadStatus, number> = {
    strained: 0,
    active: 1,
    dormant: 2,
    ended: 3
  };
  return (
    statusWeight[left.status] - statusWeight[right.status] ||
    timeValue(right.updatedAt) - timeValue(left.updatedAt) ||
    right.threadId.localeCompare(left.threadId)
  );
}

export function sortRelationshipThreadsForPanel(threads: RelationshipThread[]): RelationshipThread[] {
  return [...threads].filter((thread) => thread.visibility !== 'hidden').sort(sortRelationshipThreads);
}
