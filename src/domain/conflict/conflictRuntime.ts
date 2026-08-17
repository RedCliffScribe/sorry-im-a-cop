import type {
  CombatEvent,
  CombatEventId,
  GameTime,
  JudgementCheck,
  JudgementCheckId,
  RuntimeState,
  TurnId
} from '../runtime/types';
import {
  LOCAL_JUDGEMENT_RULESET_VERSION,
  resolveLocalJudgementIntent,
  type LocalJudgementIntent
} from './localJudgement';

export interface ConflictRuntimeStores {
  judgementChecks: Record<JudgementCheckId, JudgementCheck>;
  combatEvents: Record<CombatEventId, CombatEvent>;
}

export function createInitialConflictStores(): ConflictRuntimeStores {
  return {
    judgementChecks: {},
    combatEvents: {}
  };
}

export type JudgementCheckPatch = Omit<JudgementCheck, 'margin' | 'difficulty' | 'score'> & {
  margin?: number;
  difficulty?: number;
  score?: number;
};
export type CombatEventPatch = CombatEvent;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cloneGameTime(time: GameTime): GameTime {
  return { ...time };
}

export function applyJudgementCheckPatch(state: RuntimeState, patch: JudgementCheckPatch): JudgementCheck {
  if (patch.rulesetVersion === LOCAL_JUDGEMENT_RULESET_VERSION) {
    const resolution = resolveLocalJudgementIntent({
      state,
      intent: patch as LocalJudgementIntent,
      expectedRoll: patch.presetRoll ?? patch.score ?? 50
    });
    if (!resolution.check || resolution.issues.length > 0) {
      throw new Error(`本地判定写回不一致：${resolution.issues.join('；')}`);
    }
    const check: JudgementCheck = {
      ...resolution.check,
      gameTime: cloneGameTime(patch.gameTime),
      relatedActorIds: [...(patch.relatedActorIds ?? [])],
      relatedPlaceIds: [...(patch.relatedPlaceIds ?? [])],
      relatedCaseIds: [...(patch.relatedCaseIds ?? [])],
      factors: [...resolution.check.factors],
      visibility: patch.visibility ?? 'player_known'
    };
    state.judgementChecks[check.checkId] = check;
    return check;
  }

  if (patch.difficulty === undefined || patch.score === undefined) {
    throw new Error('旧版判定写回缺少 difficulty 或 score。');
  }
  const difficulty = clamp(Math.round(patch.difficulty), 0, 100);
  const score = clamp(Math.round(patch.score), 0, 100);
  const check: JudgementCheck = {
    ...patch,
    gameTime: cloneGameTime(patch.gameTime),
    difficulty,
    score,
    margin: score - difficulty,
    relatedActorIds: [...(patch.relatedActorIds ?? [])],
    relatedPlaceIds: [...(patch.relatedPlaceIds ?? [])],
    relatedCaseIds: [...(patch.relatedCaseIds ?? [])],
    factors: [...(patch.factors ?? [])],
    visibility: patch.visibility ?? 'player_known'
  };

  state.judgementChecks[check.checkId] = check;
  return check;
}

export function applyCombatEventPatch(state: RuntimeState, patch: CombatEventPatch): CombatEvent {
  const event: CombatEvent = {
    ...patch,
    gameTime: cloneGameTime(patch.gameTime),
    participants: [...(patch.participants ?? [])],
    intensity: clamp(Math.round(patch.intensity), 0, 100),
    judgementCheckIds: [...(patch.judgementCheckIds ?? [])],
    relatedActorIds: [...(patch.relatedActorIds ?? [])],
    relatedPlaceIds: [...(patch.relatedPlaceIds ?? [])],
    relatedCaseIds: [...(patch.relatedCaseIds ?? [])],
    visibility: patch.visibility ?? 'player_known',
    unread: patch.unread ?? true,
    createdAt: cloneGameTime(patch.createdAt ?? patch.gameTime)
  };

  state.combatEvents[event.combatId] = event;
  for (const checkId of event.judgementCheckIds) {
    const check = state.judgementChecks[checkId];
    if (check) {
      state.judgementChecks[checkId] = { ...check, relatedCombatEventId: event.combatId };
    }
  }
  return event;
}

export function linkConflictRecordsToStoryEntry(state: RuntimeState, turnId: TurnId): void {
  const entry = [...state.storyLog].reverse().find((candidate) => candidate.turnId === turnId);
  if (!entry) return;

  const judgementCheckIds = Object.values(state.judgementChecks)
    .filter((check) => check.turnId === turnId && check.visibility !== 'hidden')
    .map((check) => check.checkId);
  const combatEventIds = Object.values(state.combatEvents)
    .filter((event) => event.turnId === turnId && event.visibility !== 'hidden')
    .map((event) => event.combatId);

  entry.judgementCheckIds = Array.from(new Set([...(entry.judgementCheckIds ?? []), ...judgementCheckIds]));
  entry.combatEventIds = Array.from(new Set([...(entry.combatEventIds ?? []), ...combatEventIds]));
}

export function getCombatEventsForStoryEntry(state: RuntimeState, combatEventIds: CombatEventId[] | undefined): CombatEvent[] {
  return (combatEventIds ?? []).map((combatId) => state.combatEvents[combatId]).filter((event): event is CombatEvent => Boolean(event));
}

export function getJudgementChecksForStoryEntry(
  state: RuntimeState,
  judgementCheckIds: JudgementCheckId[] | undefined
): JudgementCheck[] {
  return (judgementCheckIds ?? [])
    .map((checkId) => state.judgementChecks[checkId])
    .filter((check): check is JudgementCheck => Boolean(check));
}
