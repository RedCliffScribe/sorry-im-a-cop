import { elapsedGameHours, gameDateKey } from '../backgroundEvolution/time';
import type {
  GameTime,
  Vitals,
  VitalsConditionLifecycle,
  VitalsConditionPersistence
} from '../runtime/types';

export const DEFAULT_PLAYER_CONDITION_SUMMARY = '状态正常。';
export const TRANSIENT_CONDITION_REVIEW_HOURS = 8;

export type PlayerVitalsLifecycleReviewReason =
  | 'legacy_unreviewed_condition'
  | 'transient_condition_crossed_day'
  | 'transient_condition_elapsed'
  | 'condition_lifecycle_conflict';

export interface PlayerVitalsLifecycleReview {
  required: boolean;
  reason?: PlayerVitalsLifecycleReviewReason;
  detail?: string;
}

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

function normalizedSummary(summary: string): string {
  return summary.replace(/\s+/g, '').replace(/[。.!！]+$/g, '');
}

export function isCanonicalNormalPlayerCondition(summary: string): boolean {
  return normalizedSummary(summary) === normalizedSummary(DEFAULT_PLAYER_CONDITION_SUMMARY);
}

export function hasFullPlayerVitals(
  vitals: Pick<Vitals, 'health' | 'maxHealth' | 'stamina' | 'maxStamina'>
): boolean {
  return vitals.health >= vitals.maxHealth && vitals.stamina >= vitals.maxStamina;
}

export function createVitalsConditionLifecycle(
  persistence: VitalsConditionPersistence,
  establishedAt: GameTime,
  lastReviewedAt: GameTime = establishedAt
): VitalsConditionLifecycle {
  return {
    persistence,
    establishedAt: cloneTime(establishedAt),
    lastReviewedAt: cloneTime(lastReviewedAt)
  };
}

export function inferConditionPersistence(
  vitals: Pick<Vitals, 'health' | 'maxHealth' | 'stamina' | 'maxStamina' | 'conditionSummary'>
): VitalsConditionPersistence {
  return hasFullPlayerVitals(vitals) && isCanonicalNormalPlayerCondition(vitals.conditionSummary)
    ? 'stable'
    : 'unknown';
}

export function normalizeLoadedPlayerVitals(vitals: Vitals, currentTime: GameTime): Vitals {
  if (vitals.conditionLifecycle) {
    return {
      ...vitals,
      conditionLifecycle: {
        ...vitals.conditionLifecycle,
        establishedAt: cloneTime(vitals.conditionLifecycle.establishedAt),
        lastReviewedAt: cloneTime(vitals.conditionLifecycle.lastReviewedAt)
      }
    };
  }

  if (!hasFullPlayerVitals(vitals) || !isCanonicalNormalPlayerCondition(vitals.conditionSummary)) {
    return { ...vitals };
  }

  return {
    ...vitals,
    conditionLifecycle: createVitalsConditionLifecycle('stable', currentTime)
  };
}

export function resolvePlayerVitalsLifecycleReview({
  vitals,
  currentTime,
  turnEndTime
}: {
  vitals: Vitals;
  currentTime: GameTime;
  turnEndTime: GameTime;
}): PlayerVitalsLifecycleReview {
  const lifecycle = vitals.conditionLifecycle;
  if (!lifecycle) {
    if (hasFullPlayerVitals(vitals) && isCanonicalNormalPlayerCondition(vitals.conditionSummary)) {
      return { required: false };
    }
    return {
      required: true,
      reason: 'legacy_unreviewed_condition',
      detail: '旧存档的非默认身体状态没有建立时间或持续性，需要在下一次成功回合做一次轻量复核。'
    };
  }

  if (
    lifecycle.persistence === 'stable' &&
    (!hasFullPlayerVitals(vitals) || !isCanonicalNormalPlayerCondition(vitals.conditionSummary))
  ) {
    return {
      required: true,
      reason: 'condition_lifecycle_conflict',
      detail: '身体状态被标记为稳定正常，但数值或摘要并非默认正常状态，需要轻量复核。'
    };
  }

  if (lifecycle.persistence === 'persistent' || lifecycle.persistence === 'stable') {
    return { required: false };
  }

  const reviewTo = elapsedGameHours(currentTime, turnEndTime) >= 0 ? turnEndTime : currentTime;
  const elapsedHours = elapsedGameHours(lifecycle.lastReviewedAt, reviewTo);
  if (!Number.isFinite(elapsedHours) || elapsedHours < 0) {
    return {
      required: true,
      reason: 'condition_lifecycle_conflict',
      detail: '身体状态的复核时间无效或晚于当前游戏时间，需要重新建立生命周期。'
    };
  }
  if (gameDateKey(lifecycle.lastReviewedAt) !== gameDateKey(reviewTo)) {
    return {
      required: true,
      reason: 'transient_condition_crossed_day',
      detail: '短期或未确认持续性的身体状态已经跨过游戏日期，需要轻量复核。'
    };
  }
  if (elapsedHours >= TRANSIENT_CONDITION_REVIEW_HOURS) {
    return {
      required: true,
      reason: 'transient_condition_elapsed',
      detail: `短期或未确认持续性的身体状态已超过 ${TRANSIENT_CONDITION_REVIEW_HOURS} 个游戏小时未复核。`
    };
  }
  return { required: false };
}
