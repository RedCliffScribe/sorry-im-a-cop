import type { CombatEvent, JudgementCheck, RuntimeState } from '../runtime/types';

export interface ConflictContextDiagnostics {
  sourceCount: number;
  projectedCount: number;
  omittedCount: number;
  hiddenCount: number;
  projectedCombatIds: string[];
  projectedJudgementCheckIds: string[];
}

export interface ConflictContextProjection {
  combatEvents: CombatEvent[];
  judgementChecks: JudgementCheck[];
  diagnostics: ConflictContextDiagnostics;
}

export interface ConflictContextProjectorOptions {
  limit?: number;
}

function toSortableTime(event: CombatEvent | JudgementCheck): number {
  const time = event.gameTime;
  return (((time.year * 100 + time.month) * 100 + time.day) * 100 + time.hour) * 100 + time.minute;
}

function isVisible<T extends { visibility: string }>(record: T): boolean {
  return record.visibility !== 'hidden';
}

function eventRelevanceScore(state: RuntimeState, event: CombatEvent): number {
  let score = 0;
  const currentPlaceId = state.location.currentPlaceId;
  const playerActorId = state.player.actorId;

  if (event.locationId === currentPlaceId || event.relatedPlaceIds.includes(currentPlaceId)) {
    score += 200;
  }

  if (event.relatedActorIds.includes(playerActorId)) {
    score += 160;
  }

  score += Math.min(Math.max(event.intensity, 0), 100);
  return score;
}

function collectLinkedJudgementChecks(state: RuntimeState, events: CombatEvent[]): JudgementCheck[] {
  const checks: JudgementCheck[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    for (const checkId of event.judgementCheckIds) {
      if (seen.has(checkId)) continue;
      const check = state.judgementChecks[checkId];
      if (!check || !isVisible(check)) continue;
      checks.push(check);
      seen.add(checkId);
    }
  }

  return checks;
}

export function projectConflictContext(
  state: RuntimeState,
  options: ConflictContextProjectorOptions = {}
): ConflictContextProjection {
  const limit = Math.max(0, Math.floor(options.limit ?? 3));
  const sourceEvents = Object.values(state.combatEvents);
  const hiddenCount = sourceEvents.filter((event) => !isVisible(event)).length;
  const visibleEvents = sourceEvents.filter(isVisible);

  const combatEvents = visibleEvents
    .map((event) => ({
      event,
      relevance: eventRelevanceScore(state, event),
      time: toSortableTime(event)
    }))
    .sort((left, right) => {
      if (right.relevance !== left.relevance) return right.relevance - left.relevance;
      if (right.time !== left.time) return right.time - left.time;
      return right.event.combatId.localeCompare(left.event.combatId);
    })
    .slice(0, limit)
    .map(({ event }) => event);

  const judgementChecks = collectLinkedJudgementChecks(state, combatEvents);

  return {
    combatEvents,
    judgementChecks,
    diagnostics: {
      sourceCount: sourceEvents.length,
      projectedCount: combatEvents.length,
      omittedCount: Math.max(0, visibleEvents.length - combatEvents.length),
      hiddenCount,
      projectedCombatIds: combatEvents.map((event) => event.combatId),
      projectedJudgementCheckIds: judgementChecks.map((check) => check.checkId)
    }
  };
}
