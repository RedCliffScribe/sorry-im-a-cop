import type { Actor, ActorId, ActorManualProfileField, RelationshipThread } from '../runtime/types';
import { sortRelationshipThreadsForPanel } from './relationshipThread';

export type RelationshipActorProfileReconciliationMode = 'synchronize' | 'hydrate_missing';

export interface ReconcileActorRelationshipProfilesOptions {
  mode?: RelationshipActorProfileReconciliationMode;
  threadIds?: Iterable<string>;
}

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function resolveProfileActorId(
  thread: RelationshipThread,
  actors: Record<ActorId, Actor>,
  playerActorId: ActorId
): ActorId | undefined {
  const primaryActorId = thread.primaryActorId;
  if (
    primaryActorId &&
    primaryActorId !== playerActorId &&
    thread.relatedActorIds.includes(primaryActorId) &&
    actors[primaryActorId]
  ) {
    return primaryActorId;
  }

  const nonPlayerActorIds = [...new Set(thread.relatedActorIds)].filter(
    (actorId) => actorId !== playerActorId && Boolean(actors[actorId])
  );
  return nonPlayerActorIds.length === 1 ? nonPlayerActorIds[0] : undefined;
}

function deriveAttitudeSummary(thread: RelationshipThread): string | undefined {
  if (thread.status === 'strained') {
    return cleanText(thread.conflictSummary) ?? cleanText(thread.trustSummary) ?? cleanText(thread.intimacySummary);
  }
  return cleanText(thread.intimacySummary) ?? cleanText(thread.trustSummary);
}

function deriveEntanglementSummary(thread: RelationshipThread): string | undefined {
  const parts = [
    cleanText(thread.promiseSummary) ? `承诺：${cleanText(thread.promiseSummary)}` : undefined,
    cleanText(thread.conflictSummary) ? `冲突：${cleanText(thread.conflictSummary)}` : undefined,
    cleanText(thread.riskSummary) ? `风险：${cleanText(thread.riskSummary)}` : undefined,
    cleanText(thread.currentPull) ? `当前牵引：${cleanText(thread.currentPull)}` : undefined
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return undefined;
  return parts.join('；').slice(0, 800);
}

function isManuallyLocked(actor: Actor, field: ActorManualProfileField): boolean {
  return actor.manualProfileOverride?.lockedFields.includes(field) ?? false;
}

function shouldApplyText(
  actor: Actor,
  field: 'relationshipSummary' | 'attitudeTowardPlayer' | 'trustTendency' | 'entanglementSummary',
  value: string | undefined,
  mode: RelationshipActorProfileReconciliationMode
): value is string {
  if (!value || isManuallyLocked(actor, field)) return false;
  if (mode === 'hydrate_missing' && cleanText(actor[field])) return false;
  return actor[field] !== value;
}

function projectThreadToActor(
  actor: Actor,
  thread: RelationshipThread,
  mode: RelationshipActorProfileReconciliationMode
): Actor {
  const relationshipSummary = cleanText(thread.summary);
  const attitudeTowardPlayer =
    deriveAttitudeSummary(thread) ?? (!cleanText(actor.attitudeTowardPlayer) ? cleanText(thread.relationshipRole) : undefined);
  const trustTendency = cleanText(thread.trustSummary);
  const entanglementSummary = deriveEntanglementSummary(thread);
  const patch: Partial<Actor> = {};

  if (shouldApplyText(actor, 'relationshipSummary', relationshipSummary, mode)) {
    patch.relationshipSummary = relationshipSummary;
  }
  if (shouldApplyText(actor, 'attitudeTowardPlayer', attitudeTowardPlayer, mode)) {
    patch.attitudeTowardPlayer = attitudeTowardPlayer;
  }
  if (shouldApplyText(actor, 'trustTendency', trustTendency, mode)) {
    patch.trustTendency = trustTendency;
  }
  if (shouldApplyText(actor, 'entanglementSummary', entanglementSummary, mode)) {
    patch.entanglementSummary = entanglementSummary;
  }

  return Object.keys(patch).length > 0 ? { ...actor, ...patch } : actor;
}

export function reconcileActorRelationshipProfiles(
  actors: Record<ActorId, Actor>,
  relationshipThreads: Record<string, RelationshipThread>,
  playerActorId: ActorId,
  options: ReconcileActorRelationshipProfilesOptions = {}
): Record<ActorId, Actor> {
  const mode = options.mode ?? 'synchronize';
  const selectedThreadIds = options.threadIds ? new Set(options.threadIds) : undefined;
  const candidateThreads = sortRelationshipThreadsForPanel(
    Object.values(relationshipThreads).filter((thread) => !selectedThreadIds || selectedThreadIds.has(thread.threadId))
  );
  const selectedByActor = new Map<ActorId, RelationshipThread>();

  for (const thread of candidateThreads) {
    const actorId = resolveProfileActorId(thread, actors, playerActorId);
    if (!actorId || selectedByActor.has(actorId)) continue;
    selectedByActor.set(actorId, thread);
  }

  let changed = false;
  const nextActors = { ...actors };
  for (const [actorId, thread] of selectedByActor) {
    const actor = nextActors[actorId];
    if (!actor) continue;
    const projected = projectThreadToActor(actor, thread, mode);
    if (projected === actor) continue;
    nextActors[actorId] = projected;
    changed = true;
  }

  return changed ? nextActors : actors;
}
