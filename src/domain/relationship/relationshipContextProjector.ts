import type {
  RelationshipHeartbeatCandidate,
  RelationshipThread,
  RelationshipThreadMilestone,
  RuntimeState
} from '../runtime/types';
import { buildRelationshipHeartbeatCandidates } from './relationshipThread';

export interface ProjectedRelationshipThread extends RelationshipThread {
  reasons: string[];
  milestones: RelationshipThreadMilestone[];
}

export interface RelationshipProjectionDiagnostics {
  sourceThreadCount: number;
  projectedThreadCount: number;
  projectedThreadIds: string[];
  heartbeatCandidateCount: number;
  heartbeatCandidateThreadIds: string[];
  identityRegistryCount: number;
  identityRegistryTruncatedCount: number;
  omittedHiddenCount: number;
  omittedIrrelevantCount: number;
  missingActorRefs: string[];
}

export interface RelationshipContextProjection {
  threads: ProjectedRelationshipThread[];
  heartbeatCandidates: RelationshipHeartbeatCandidate[];
  identityRegistry: Array<{
    threadId: string;
    kind: RelationshipThread['kind'];
    primaryActorId?: string;
    relatedActorIds: string[];
    status: RelationshipThread['status'];
  }>;
  diagnostics: RelationshipProjectionDiagnostics;
}

export interface RelationshipProjectionOptions {
  maxThreads?: number;
  maxHeartbeatCandidates?: number;
  maxIdentityRegistry?: number;
  presentActorIds?: Iterable<string>;
}

interface ScoredThread {
  thread: RelationshipThread;
  score: number;
  reasons: string[];
}

const DEFAULT_MAX_THREADS = 5;
const DEFAULT_MAX_HEARTBEAT_CANDIDATES = 3;
const DEFAULT_MAX_IDENTITY_REGISTRY = 80;

function activeActorIds(state: RuntimeState, presentActorIds?: Iterable<string>): Set<string> {
  const ids = new Set<string>([state.player.actorId]);
  for (const actorId of presentActorIds ?? []) ids.add(actorId);

  const currentScene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  for (const actorId of currentScene?.presentActorIds ?? []) ids.add(actorId);
  for (const actor of Object.values(state.actors)) {
    if (actor.presence === 'present' || actor.presence === 'nearby') ids.add(actor.actorId);
  }

  return ids;
}

function intersects(actorIds: string[], activeIds: Set<string>): boolean {
  return actorIds.some((actorId) => activeIds.has(actorId));
}

function missingActorRefs(state: RuntimeState, thread: RelationshipThread): string[] {
  return thread.relatedActorIds.filter((actorId) => actorId !== state.player.actorId && !state.actors[actorId]);
}

function gameTimeValue(time: { year: number; month: number; day: number; hour: number; minute: number }): number {
  return (((time.year * 100 + time.month) * 100 + time.day) * 100 + time.hour) * 100 + time.minute;
}

function scoreThread(thread: RelationshipThread, activeIds: Set<string>, playerActorId: string): ScoredThread {
  let score = 0;
  const reasons: string[] = [];

  if (thread.relatedActorIds.includes(playerActorId)) {
    score += 45;
    reasons.push('player_related');
  }
  if (intersects(thread.relatedActorIds, activeIds)) {
    score += 90;
    reasons.push('active_actor');
  }
  if (thread.currentPull) {
    score += 25;
    reasons.push('current_pull');
  }
  if (thread.promiseSummary || thread.riskSummary) {
    score += 20;
    reasons.push('promise_or_risk');
  }
  if (thread.status === 'strained') {
    score += 12;
    reasons.push('strained');
  }
  if (thread.status === 'dormant') score -= 35;
  if (thread.status === 'ended') score -= 80;

  return { thread, score, reasons };
}

function projectThread(scored: ScoredThread): ProjectedRelationshipThread {
  return {
    ...scored.thread,
    relatedActorIds: [...scored.thread.relatedActorIds],
    milestones: scored.thread.milestones
      .filter((milestone) => milestone.visibility !== 'hidden')
      .map((milestone) => ({
        ...milestone,
        gameTime: { ...milestone.gameTime },
        relatedActorIds: [...milestone.relatedActorIds]
      })),
    reasons: [...scored.reasons]
  };
}

export function projectRelationshipContext(
  state: RuntimeState,
  options: RelationshipProjectionOptions = {}
): RelationshipContextProjection {
  const maxThreads = options.maxThreads ?? DEFAULT_MAX_THREADS;
  const maxHeartbeatCandidates = options.maxHeartbeatCandidates ?? DEFAULT_MAX_HEARTBEAT_CANDIDATES;
  const maxIdentityRegistry = options.maxIdentityRegistry ?? DEFAULT_MAX_IDENTITY_REGISTRY;
  const activeIds = activeActorIds(state, options.presentActorIds);

  const allThreads = Object.values(state.relationshipThreads ?? {});
  let omittedHiddenCount = 0;
  const missingRefs = new Set<string>();

  const visibleThreads = allThreads.filter((thread) => {
    if (thread.visibility === 'hidden') {
      omittedHiddenCount += 1;
      return false;
    }
    for (const actorId of missingActorRefs(state, thread)) {
      missingRefs.add(`${thread.threadId}:${actorId}`);
    }
    return true;
  });

  const scored = visibleThreads
    .map((thread) => scoreThread(thread, activeIds, state.player.actorId))
    .filter((entry) => entry.reasons.length > 0 || entry.score >= 70)
    .sort(
      (left, right) =>
        right.score - left.score ||
        gameTimeValue(right.thread.updatedAt) - gameTimeValue(left.thread.updatedAt) ||
        left.thread.threadId.localeCompare(right.thread.threadId)
    );

  const threads = scored.slice(0, maxThreads).map(projectThread);
  const heartbeatCandidates = buildRelationshipHeartbeatCandidates(visibleThreads, {
    now: state.time,
    presentActorIds: activeIds,
    maxCandidates: maxHeartbeatCandidates
  });
  const identityRegistry = visibleThreads
    .sort(
      (left, right) =>
        gameTimeValue(right.updatedAt) - gameTimeValue(left.updatedAt) || left.threadId.localeCompare(right.threadId)
    )
    .slice(0, maxIdentityRegistry)
    .map((thread) => ({
      threadId: thread.threadId,
      kind: thread.kind,
      primaryActorId: thread.primaryActorId,
      relatedActorIds: [...thread.relatedActorIds],
      status: thread.status
    }))
    .sort((left, right) => left.threadId.localeCompare(right.threadId));

  return {
    threads,
    heartbeatCandidates,
    identityRegistry,
    diagnostics: {
      sourceThreadCount: allThreads.length,
      projectedThreadCount: threads.length,
      projectedThreadIds: threads.map((thread) => thread.threadId),
      heartbeatCandidateCount: heartbeatCandidates.length,
      heartbeatCandidateThreadIds: heartbeatCandidates.map((candidate) => candidate.threadId),
      identityRegistryCount: identityRegistry.length,
      identityRegistryTruncatedCount: Math.max(0, visibleThreads.length - identityRegistry.length),
      omittedHiddenCount,
      omittedIrrelevantCount: Math.max(0, visibleThreads.length - scored.length),
      missingActorRefs: Array.from(missingRefs).sort()
    }
  };
}
