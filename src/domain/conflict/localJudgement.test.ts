import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type {
  GameDifficultyLevel,
  JudgementCheck,
  JudgementDifficultyTier,
  JudgementFactor
} from '../runtime/types';
import {
  calculateEffectiveTarget,
  calculateSecondaryAttributeModifier,
  collectLocalJudgementSources,
  createBalancedLocalD100Roll,
  createLocalD100Roll,
  deriveLocalJudgementOutcome,
  judgementDifficultyModifiers,
  LOCAL_JUDGEMENT_RULESET_VERSION,
  resolveLocalJudgementIntent
} from './localJudgement';

const neutralAttributes = {
  body: 50,
  action: 50,
  perception: 50,
  thinking: 50,
  negotiation: 50,
  will: 50
};

function calculate(
  difficultyTier: JudgementDifficultyTier,
  gameDifficulty: GameDifficultyLevel,
  factors: JudgementFactor[] = []
) {
  return calculateEffectiveTarget({
    attributes: neutralAttributes,
    primaryAttribute: 'action',
    secondaryAttribute: 'body',
    difficultyTier,
    gameDifficulty,
    factors
  });
}

function createGroundedIntent(
  factors: JudgementFactor[],
  expectedRoll = 50
) {
  const calculation = calculateEffectiveTarget({
    attributes: neutralAttributes,
    primaryAttribute: 'action',
    difficultyTier: 'standard',
    gameDifficulty: 'standard',
    factors
  });
  return {
    rulesetVersion: LOCAL_JUDGEMENT_RULESET_VERSION,
    checkId: 'check_grounded',
    turnId: 'turn_1',
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 30 },
    title: '测试来源核验',
    category: 'chase' as const,
    relatedActorIds: ['player'],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    primaryAttribute: 'action' as const,
    difficultyTier: 'standard' as const,
    presetRoll: expectedRoll,
    effectiveTarget: calculation.effectiveTarget,
    outcome: deriveLocalJudgementOutcome(expectedRoll, calculation.effectiveTarget),
    shortSummary: '测试',
    factors,
    visibility: 'player_known' as const
  };
}

function persistRoll(
  state: ReturnType<typeof createInitialRuntimeState>,
  roll: number,
  index: number,
  rulesetVersion: JudgementCheck['rulesetVersion'] = LOCAL_JUDGEMENT_RULESET_VERSION
) {
  const checkId = `check_bag_${index}`;
  state.judgementChecks[checkId] = {
    rulesetVersion,
    checkId,
    turnId: `turn_${String(index).padStart(4, '0')}`,
    gameTime: {
      ...state.time,
      minute: (state.time.minute + index) % 60
    },
    title: `洗袋测试 ${index}`,
    category: 'other',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    difficulty: 60,
    score: roll,
    margin: 60 - roll,
    outcome: deriveLocalJudgementOutcome(roll, 60),
    shortSummary: '洗袋测试',
    factors: [],
    primaryAttribute: 'action',
    primaryAttributeValue: 60,
    difficultyTier: 'standard',
    effectiveTarget: 60,
    presetRoll: roll,
    visibility: 'player_known'
  };
}

describe('local d100 judgement', () => {
  it('applies all five scene difficulty modifiers', () => {
    const tiers = Object.keys(judgementDifficultyModifiers) as JudgementDifficultyTier[];
    expect(tiers.map((tier) => calculate(tier, 'standard').effectiveTarget)).toEqual([
      65,
      50,
      40,
      30,
      15
    ]);
  });

  it('applies the five per-save game difficulty levels', () => {
    const levels: GameDifficultyLevel[] = ['story', 'easy', 'standard', 'hard', 'brutal'];
    expect(levels.map((level) => calculate('standard', level).effectiveTarget)).toEqual([
      70,
      60,
      50,
      40,
      30
    ]);
  });

  it('keeps all five per-save difficulty levels meaningful in a dangerous scene', () => {
    const levels: GameDifficultyLevel[] = ['story', 'easy', 'standard', 'hard', 'brutal'];
    expect(levels.map((level) => calculate('dangerous', level).effectiveTarget)).toEqual([
      50,
      40,
      30,
      20,
      10
    ]);
  });

  it('clamps secondary and context modifiers before the final 5..95 target clamp', () => {
    expect(calculateSecondaryAttributeModifier(0)).toBe(-10);
    expect(calculateSecondaryAttributeModifier(100)).toBe(10);
    expect(
      calculate('easy', 'story', [
        { label: 'a', value: 10, reason: 'a' },
        { label: 'b', value: 10, reason: 'b' },
        { label: 'c', value: 10, reason: 'c' }
      ])
    ).toMatchObject({ contextModifierTotal: 20, effectiveTarget: 95 });
  });

  it('gives natural critical results precedence over the target', () => {
    expect(deriveLocalJudgementOutcome(1, 5)).toBe('critical_success');
    expect(deriveLocalJudgementOutcome(5, 5)).toBe('critical_success');
    expect(deriveLocalJudgementOutcome(6, 50)).toBe('success');
    expect(deriveLocalJudgementOutcome(55, 50)).toBe('partial_success');
    expect(deriveLocalJudgementOutcome(61, 50)).toBe('failure');
    expect(deriveLocalJudgementOutcome(96, 95)).toBe('critical_failure');
    expect(deriveLocalJudgementOutcome(100, 95)).toBe('critical_failure');
  });

  it('has the exact expected distribution across all one hundred d100 faces', () => {
    const counts = Array.from({ length: 100 }, (_, index) =>
      deriveLocalJudgementOutcome(index + 1, 50)
    ).reduce<Record<string, number>>((result, outcome) => {
      result[outcome] = (result[outcome] ?? 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual({
      critical_success: 5,
      success: 45,
      partial_success: 10,
      failure: 35,
      critical_failure: 5
    });
  });

  it('maps a random sample to one stable d100 value', () => {
    expect(createLocalD100Roll(() => 0)).toBe(1);
    expect(createLocalD100Roll(() => 0.499)).toBe(50);
    expect(createLocalD100Roll(() => 0.999999)).toBe(100);
    expect(createLocalD100Roll(() => 1)).toBe(100);
  });

  it('uses every d100 decile once in a complete balanced bag', () => {
    const state = createInitialRuntimeState();
    const rolls: number[] = [];

    for (let index = 1; index <= 10; index += 1) {
      const roll = createBalancedLocalD100Roll(state, () => 0);
      rolls.push(roll);
      persistRoll(state, roll, index);
    }

    expect(rolls).toEqual([1, 11, 21, 31, 41, 51, 61, 71, 81, 91]);
    expect(new Set(rolls.map((roll) => Math.floor((roll - 1) / 10))).size).toBe(10);
  });

  it('limits high-roll clustering even when the random source always picks high', () => {
    const state = createInitialRuntimeState();
    const rolls: number[] = [];

    for (let index = 1; index <= 10; index += 1) {
      const roll = createBalancedLocalD100Roll(state, () => 1);
      rolls.push(roll);
      persistRoll(state, roll, index);
    }

    expect(rolls.filter((roll) => roll > 80)).toHaveLength(2);
    expect(
      rolls.some(
        (roll, index) =>
          roll > 80 && rolls[index + 1] > 80 && rolls[index + 2] > 80
      )
    ).toBe(false);
  });

  it('does not consume a used decile again inside an incomplete bag', () => {
    const state = createInitialRuntimeState();
    persistRoll(state, 84, 1);
    persistRoll(state, 97, 2);

    const roll = createBalancedLocalD100Roll(state, () => 1);

    expect(roll).toBe(80);
  });

  it('starts a fresh bag after ten persisted local checks', () => {
    const state = createInitialRuntimeState();
    for (let index = 1; index <= 10; index += 1) {
      persistRoll(state, (index - 1) * 10 + 1, index);
    }

    expect(createBalancedLocalD100Roll(state, () => 0)).toBe(1);
  });

  it('ignores legacy checks when reconstructing the balanced bag', () => {
    const state = createInitialRuntimeState();
    persistRoll(state, 1, 1, 'v1');

    expect(createBalancedLocalD100Roll(state, () => 0)).toBe(1);
  });

  it('overrides model echoes with the canonical local roll, target and result', () => {
    const state = createInitialRuntimeState({ gameDifficulty: 'hard' });
    const result = resolveLocalJudgementIntent({
      state,
      expectedRoll: 42,
      intent: {
        rulesetVersion: LOCAL_JUDGEMENT_RULESET_VERSION,
        checkId: 'check_1',
        turnId: 'turn_1',
        gameTime: state.time,
        title: '观察后巷',
        category: 'observation',
        relatedActorIds: ['player'],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        primaryAttribute: 'perception',
        secondaryAttribute: 'thinking',
        difficultyTier: 'standard',
        presetRoll: 43,
        effectiveTarget: 99,
        outcome: 'critical_success',
        shortSummary: '测试',
        factors: [],
        visibility: 'player_known'
      }
    });

    expect(result.issues).toEqual([]);
    expect(result.check).toMatchObject({
      presetRoll: 42,
      score: 42,
      effectiveTarget: 40,
      difficulty: 40,
      margin: -2,
      outcome: 'partial_success'
    });
    expect(result.outcomeMismatch).toEqual({
      reported: 'critical_success',
      canonical: 'partial_success'
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('本回合唯一骰点 d100=42'),
        expect.stringContaining('本地已按有效因素重算为 40'),
        expect.stringContaining('本地结算结果为 partial_success')
      ])
    );
  });

  it('finalizes a valid intent with compatibility fields and a local margin', () => {
    const state = createInitialRuntimeState({
      gameDifficulty: 'standard',
      attributes: { ...neutralAttributes, perception: 70, thinking: 60 }
    });
    const result = resolveLocalJudgementIntent({
      state,
      expectedRoll: 50,
      intent: {
        rulesetVersion: LOCAL_JUDGEMENT_RULESET_VERSION,
        checkId: 'check_2',
        turnId: 'turn_1',
        gameTime: state.time,
        title: '辨认口供矛盾',
        category: 'thinking',
        relatedActorIds: ['player'],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        primaryAttribute: 'perception',
        secondaryAttribute: 'thinking',
        difficultyTier: 'hard',
        presetRoll: 50,
        effectiveTarget: 62,
        outcome: 'success',
        shortSummary: '玩家找出矛盾。',
        factors: [],
        visibility: 'player_known'
      }
    });

    expect(result.issues).toEqual([]);
    expect(result.check).toMatchObject({
      difficulty: 62,
      score: 50,
      margin: 12,
      primaryAttributeValue: 70,
      secondaryAttributeValue: 60,
      secondaryModifier: 2,
      effectiveTarget: 62,
      presetRoll: 50,
      outcome: 'success'
    });
  });

  it('collects only usable player traits and currently equipped equipment', () => {
    const state = createInitialRuntimeState({
      traits: [
        {
          traitId: 'trait_street_sense',
          name: '街头直觉',
          source: 'opening',
          description: '熟悉街面危险信号。',
          effectSummary: '在辨认街头风险时可能提供帮助。',
          scopes: ['observation'],
          status: 'active',
          visibility: 'player_known'
        },
        {
          traitId: 'trait_dormant',
          name: '休眠特质',
          source: 'opening',
          description: '当前不生效。',
          effectSummary: '当前不提供帮助。',
          scopes: ['other'],
          status: 'dormant',
          visibility: 'player_known'
        },
        {
          traitId: 'trait_hidden',
          name: '隐藏特质',
          source: 'opening',
          description: '玩家未知。',
          effectSummary: '不可作为公开判定来源。',
          scopes: ['other'],
          status: 'active',
          visibility: 'hidden'
        }
      ]
    });
    state.assets.items.asset_baton = {
      itemId: 'asset_baton',
      category: 'equipment',
      name: '警棍',
      summary: '执勤用警棍。',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      visibility: 'player_known',
      importance: 30
    };
    state.assets.items.asset_radio = {
      itemId: 'asset_radio',
      category: 'equipment',
      name: '对讲机',
      summary: '执勤联络设备。',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      visibility: 'player_known',
      importance: 20
    };
    state.assets.equippedItemIds = ['asset_baton'];

    expect(collectLocalJudgementSources(state)).toEqual({
      traits: [
        {
          sourceId: 'trait_street_sense',
          name: '街头直觉',
          effectSummary: '在辨认街头风险时可能提供帮助。',
          scopes: ['observation'],
          status: 'active'
        }
      ],
      equipment: [
        {
          sourceId: 'asset_baton',
          name: '警棍',
          summary: '执勤用警棍。'
        }
      ]
    });
  });

  it('accepts grounded trait and equipped-item factors', () => {
    const state = createInitialRuntimeState({
      attributes: neutralAttributes,
      traits: [
        {
          traitId: 'trait_street_sense',
          name: '街头直觉',
          source: 'opening',
          description: '熟悉街面危险信号。',
          effectSummary: '更容易识别埋伏。',
          scopes: ['observation'],
          status: 'active',
          visibility: 'player_known'
        }
      ]
    });
    state.assets.items.asset_baton = {
      itemId: 'asset_baton',
      category: 'equipment',
      name: '警棍',
      summary: '近身控制时可以使用。',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      visibility: 'player_known',
      importance: 30
    };
    state.assets.equippedItemIds = ['asset_baton'];
    const factors: JudgementFactor[] = [
      {
        sourceType: 'trait',
        sourceId: 'trait_street_sense',
        label: '街头直觉',
        value: 3,
        reason: '玩家及时察觉到对方的起手动作。'
      },
      {
        sourceType: 'equipment',
        sourceId: 'asset_baton',
        label: '警棍在手',
        value: 3,
        reason: '已装备的警棍有利于保持控制距离。'
      }
    ];

    const result = resolveLocalJudgementIntent({
      state,
      expectedRoll: 50,
      intent: createGroundedIntent(factors)
    });

    expect(result.issues).toEqual([]);
    expect(result.check).toMatchObject({
      effectiveTarget: 56,
      contextModifierTotal: 6,
      outcome: 'success',
      factors
    });
  });

  it('drops unverified, unavailable and duplicated stable factor sources', () => {
    const state = createInitialRuntimeState({
      attributes: neutralAttributes,
      traits: [
        {
          traitId: 'trait_street_sense',
          name: '街头直觉',
          source: 'opening',
          description: '熟悉街面危险信号。',
          effectSummary: '更容易识别埋伏。',
          scopes: ['observation'],
          status: 'active',
          visibility: 'player_known'
        }
      ]
    });
    state.assets.items.asset_radio = {
      itemId: 'asset_radio',
      category: 'equipment',
      name: '对讲机',
      summary: '执勤联络设备。',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      visibility: 'player_known',
      importance: 20
    };
    const factors: JudgementFactor[] = [
      {
        label: '无来源修正',
        value: 1,
        reason: '缺少来源类别。'
      },
      {
        sourceType: 'trait',
        sourceId: 'trait_missing',
        label: '虚构特质',
        value: 2,
        reason: '该特质并不存在。'
      },
      {
        sourceType: 'equipment',
        sourceId: 'asset_radio',
        label: '未装备对讲机',
        value: 2,
        reason: '物品存在但当前未装备。'
      },
      {
        sourceType: 'trait',
        sourceId: 'trait_street_sense',
        label: '街头直觉',
        value: 2,
        reason: '首次引用。'
      },
      {
        sourceType: 'trait',
        sourceId: 'trait_street_sense',
        label: '街头经验',
        value: 2,
        reason: '重复引用同一特质。'
      }
    ];

    const result = resolveLocalJudgementIntent({
      state,
      expectedRoll: 50,
      intent: createGroundedIntent(factors)
    });

    expect(result.issues).toEqual([]);
    expect(result.check).toMatchObject({
      effectiveTarget: 52,
      contextModifierTotal: 2,
      factors: [
        {
          sourceType: 'trait',
          sourceId: 'trait_street_sense',
          label: '街头直觉',
          value: 2
        }
      ]
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('缺少可核验的来源类别'),
        expect.stringContaining('特质 trait_missing 当前不可用于判定'),
        expect.stringContaining('装备 asset_radio 当前未装备或不存在'),
        expect.stringContaining('重复使用了同一特质来源 trait_street_sense')
      ])
    );
  });

  it('infers a missing source type only from one uniquely available stable source', () => {
    const state = createInitialRuntimeState({
      attributes: neutralAttributes,
      traits: [
        {
          traitId: 'trait_street_sense',
          name: '街头直觉',
          source: 'opening',
          description: '熟悉街面危险信号。',
          effectSummary: '更容易识别埋伏。',
          scopes: ['observation'],
          status: 'active',
          visibility: 'player_known'
        }
      ]
    });
    const factor: JudgementFactor = {
      sourceId: 'trait_street_sense',
      label: '街头直觉',
      value: 3,
      reason: '玩家及时察觉到对方的起手动作。'
    };

    const result = resolveLocalJudgementIntent({
      state,
      expectedRoll: 50,
      intent: createGroundedIntent([factor])
    });

    expect(result.issues).toEqual([]);
    expect(result.check?.factors).toEqual([
      {
        ...factor,
        sourceType: 'trait'
      }
    ]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'local_judgement_factor_source_inferred'
        })
      ])
    );
  });

  it('infers a missing source type from one currently equipped stable item', () => {
    const state = createInitialRuntimeState({
      attributes: neutralAttributes
    });
    state.assets.items.asset_baton = {
      itemId: 'asset_baton',
      category: 'equipment',
      name: '警棍',
      summary: '近身控制时可以使用。',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      visibility: 'player_known',
      importance: 30
    };
    state.assets.equippedItemIds = ['asset_baton'];
    const factor: JudgementFactor = {
      sourceId: 'asset_baton',
      label: '警棍在手',
      value: 3,
      reason: '已装备的警棍有利于保持控制距离。'
    };

    const result = resolveLocalJudgementIntent({
      state,
      expectedRoll: 50,
      intent: createGroundedIntent([factor])
    });

    expect(result.issues).toEqual([]);
    expect(result.check?.factors).toEqual([
      {
        ...factor,
        sourceType: 'equipment'
      }
    ]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'local_judgement_factor_source_inferred'
        })
      ])
    );
  });
});
