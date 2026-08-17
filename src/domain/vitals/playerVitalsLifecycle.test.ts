import { describe, expect, it } from 'vitest';
import type { GameTime, Vitals } from '../runtime/types';
import {
  createVitalsConditionLifecycle,
  normalizeLoadedPlayerVitals,
  resolvePlayerVitalsLifecycleReview
} from './playerVitalsLifecycle';

const DAY_ONE: GameTime = { year: 1988, month: 9, day: 12, hour: 22, minute: 0 };

function createVitals(overrides: Partial<Vitals> = {}): Vitals {
  return {
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
    conditionSummary: '状态正常。',
    ...overrides
  };
}

describe('player vitals lifecycle', () => {
  it('adds stable lifecycle metadata to a healthy legacy save without requesting AI review', () => {
    const vitals = normalizeLoadedPlayerVitals(createVitals(), DAY_ONE);

    expect(vitals.conditionLifecycle).toEqual({
      persistence: 'stable',
      establishedAt: DAY_ONE,
      lastReviewedAt: DAY_ONE
    });
    expect(
      resolvePlayerVitalsLifecycleReview({
        vitals,
        currentTime: DAY_ONE,
        turnEndTime: { ...DAY_ONE, minute: 5 }
      })
    ).toEqual({ required: false });
  });

  it('keeps a non-default legacy condition unclassified so the next turn requests one review', () => {
    const vitals = normalizeLoadedPlayerVitals(
      createVitals({ conditionSummary: '熬夜值守一整晚后精神松弛，强烈的疲惫感。' }),
      DAY_ONE
    );

    expect(vitals.conditionLifecycle).toBeUndefined();
    expect(
      resolvePlayerVitalsLifecycleReview({
        vitals,
        currentTime: DAY_ONE,
        turnEndTime: { ...DAY_ONE, minute: 5 }
      })
    ).toMatchObject({
      required: true,
      reason: 'legacy_unreviewed_condition'
    });
  });

  it('reviews transient conditions after crossing a game date or eight game hours', () => {
    const transient = createVitals({
      stamina: 70,
      conditionSummary: '通宵执勤后明显疲惫。',
      conditionLifecycle: createVitalsConditionLifecycle('transient', DAY_ONE)
    });

    expect(
      resolvePlayerVitalsLifecycleReview({
        vitals: transient,
        currentTime: { ...DAY_ONE, hour: 23 },
        turnEndTime: { year: 1988, month: 9, day: 13, hour: 0, minute: 10 }
      })
    ).toMatchObject({ required: true, reason: 'transient_condition_crossed_day' });
    expect(
      resolvePlayerVitalsLifecycleReview({
        vitals: transient,
        currentTime: DAY_ONE,
        turnEndTime: { year: 1988, month: 9, day: 12, hour: 23, minute: 0 }
      })
    ).toEqual({ required: false });

    const morning = { ...DAY_ONE, hour: 8, minute: 0 };
    const sameDayTransient = createVitals({
      stamina: 70,
      conditionSummary: '清晨连续执勤后明显疲惫。',
      conditionLifecycle: createVitalsConditionLifecycle('transient', morning)
    });
    expect(
      resolvePlayerVitalsLifecycleReview({
        vitals: sameDayTransient,
        currentTime: { ...morning, hour: 15, minute: 55 },
        turnEndTime: { ...morning, hour: 16, minute: 0 }
      })
    ).toMatchObject({ required: true, reason: 'transient_condition_elapsed' });
  });

  it('does not auto-review or clear a persistent injury merely because time passed', () => {
    const injury = createVitals({
      health: 72,
      conditionSummary: '左肩伤口仍需包扎与休养。',
      conditionLifecycle: createVitalsConditionLifecycle('persistent', DAY_ONE)
    });

    expect(
      resolvePlayerVitalsLifecycleReview({
        vitals: injury,
        currentTime: { year: 1988, month: 9, day: 20, hour: 9, minute: 0 },
        turnEndTime: { year: 1988, month: 9, day: 20, hour: 9, minute: 5 }
      })
    ).toEqual({ required: false });
  });
});
