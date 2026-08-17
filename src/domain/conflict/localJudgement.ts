import { getGameDifficultyProfile, normalizeGameDifficulty } from '../settings/gameDifficulty';
import type {
  AttributeBlock,
  AttributeKey,
  GameDifficultyLevel,
  JudgementCheck,
  JudgementDifficultyTier,
  JudgementFactor,
  JudgementFactorSourceType,
  JudgementOutcome,
  RuntimeState,
  StoryDiagnosticIssue
} from '../runtime/types';

export const LOCAL_JUDGEMENT_RULESET_VERSION = 'v1.1-local-d100' as const;

export const judgementDifficultyModifiers: Readonly<Record<JudgementDifficultyTier, number>> = {
  easy: 15,
  standard: 0,
  hard: -10,
  dangerous: -20,
  extreme: -35
};

export const judgementAttributeLabels: Readonly<Record<AttributeKey, string>> = {
  body: '体魄',
  action: '行动',
  perception: '观察',
  thinking: '思考',
  negotiation: '交涉',
  will: '意志'
};

export const judgementDifficultyLabels: Readonly<Record<JudgementDifficultyTier, string>> = {
  easy: '容易',
  standard: '标准',
  hard: '困难',
  dangerous: '危险',
  extreme: '极端'
};

export const judgementFactorSourceLabels: Readonly<Record<JudgementFactorSourceType, string>> = {
  trait: '特质',
  equipment: '装备',
  status: '状态',
  environment: '环境',
  preparation: '准备',
  other: '其他'
};

export interface LocalJudgementTraitSource {
  sourceId: string;
  name: string;
  effectSummary: string;
  scopes: string[];
  status: 'active' | 'weakened';
}

export interface LocalJudgementEquipmentSource {
  sourceId: string;
  name: string;
  summary: string;
}

export interface LocalJudgementSourceSnapshot {
  traits: LocalJudgementTraitSource[];
  equipment: LocalJudgementEquipmentSource[];
}

export function collectLocalJudgementSources(state: RuntimeState): LocalJudgementSourceSnapshot {
  const traits = state.player.activeTraits.flatMap<LocalJudgementTraitSource>((trait) => {
    if (
      (trait.status !== 'active' && trait.status !== 'weakened') ||
      trait.visibility === 'hidden'
    ) {
      return [];
    }
    return [{
      sourceId: trait.traitId,
      name: trait.name,
      effectSummary: trait.effectSummary,
      scopes: trait.scopes,
      status: trait.status
    }];
  });
  const equipment = state.assets.equippedItemIds.flatMap<LocalJudgementEquipmentSource>(
    (sourceId) => {
      const item = state.assets.items[sourceId];
      if (!item || item.category !== 'equipment') return [];
      return [{
        sourceId,
        name: item.name,
        summary: item.summary
      }];
    }
  );

  return { traits, equipment };
}

export interface LocalJudgementIntent {
  rulesetVersion?: typeof LOCAL_JUDGEMENT_RULESET_VERSION;
  checkId: string;
  turnId: string;
  gameTime: JudgementCheck['gameTime'];
  title: string;
  category: JudgementCheck['category'];
  targetSummary?: string;
  relatedActorIds: string[];
  relatedPlaceIds: string[];
  relatedCaseIds: string[];
  primaryAttribute: AttributeKey;
  secondaryAttribute?: AttributeKey;
  difficultyTier: JudgementDifficultyTier;
  difficulty?: number;
  score?: number;
  presetRoll?: number;
  effectiveTarget?: number;
  outcome?: JudgementOutcome;
  shortSummary: string;
  consequenceSummary?: string;
  factors: JudgementFactor[];
  relatedCombatEventId?: string;
  visibility: JudgementCheck['visibility'];
}

export interface LocalJudgementResolution {
  check?: JudgementCheck;
  issues: string[];
  diagnostics: StoryDiagnosticIssue[];
  outcomeMismatch?: {
    reported: JudgementOutcome;
    canonical: JudgementOutcome;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createLocalD100Roll(random: () => number = Math.random): number {
  const sample = random();
  if (!Number.isFinite(sample)) return 50;
  return clamp(Math.floor(sample * 100) + 1, 1, 100);
}

const LOCAL_D100_BAG_DECILES = 10;
const LOCAL_D100_FACES_PER_DECILE = 10;
const LOCAL_D100_HIGH_ROLL_THRESHOLD = 80;

function randomIndex(length: number, random: () => number): number {
  const sample = random();
  if (!Number.isFinite(sample)) return Math.floor(length / 2);
  return clamp(Math.floor(sample * length), 0, length - 1);
}

function compareJudgementChecksBySequence(
  left: JudgementCheck,
  right: JudgementCheck
): number {
  const leftTime = left.gameTime;
  const rightTime = right.gameTime;
  for (const key of ['year', 'month', 'day', 'hour', 'minute'] as const) {
    const difference = leftTime[key] - rightTime[key];
    if (difference !== 0) return difference;
  }
  const turnDifference = left.turnId.localeCompare(right.turnId, undefined, { numeric: true });
  return turnDifference !== 0
    ? turnDifference
    : left.checkId.localeCompare(right.checkId, undefined, { numeric: true });
}

/**
 * Draws from a ten-decile shuffle bag built from already-persisted local checks.
 *
 * Every completed bag contains one result from each 10-point band, so d100 remains
 * uniform over time while unusually long clusters of very high rolls are avoided.
 * Failed/no-judgement turns never consume a slot because only canonical persisted
 * checks participate in the history. The exact face inside a selected band remains
 * random, and the existing critical/result rules are unchanged.
 */
export function createBalancedLocalD100Roll(
  state: Pick<RuntimeState, 'judgementChecks'>,
  random: () => number = Math.random
): number {
  const persistedRolls = Object.values(state.judgementChecks)
    .filter(
      (check) =>
        check.rulesetVersion === LOCAL_JUDGEMENT_RULESET_VERSION &&
        Number.isInteger(check.presetRoll) &&
        (check.presetRoll ?? 0) >= 1 &&
        (check.presetRoll ?? 0) <= 100
    )
    .sort(compareJudgementChecksBySequence)
    .map((check) => check.presetRoll as number);

  const currentBagOffset = persistedRolls.length % LOCAL_D100_BAG_DECILES;
  const currentBagRolls = currentBagOffset > 0
    ? persistedRolls.slice(-currentBagOffset)
    : [];
  const usedDeciles = new Set(
    currentBagRolls.map((roll) => Math.floor((roll - 1) / LOCAL_D100_FACES_PER_DECILE))
  );
  const availableDeciles = Array.from(
    { length: LOCAL_D100_BAG_DECILES },
    (_, decile) => decile
  ).filter((decile) => !usedDeciles.has(decile));

  const recentRolls = persistedRolls.slice(-2);
  const hasTwoConsecutiveHighRolls =
    recentRolls.length === 2 &&
    recentRolls.every((roll) => roll > LOCAL_D100_HIGH_ROLL_THRESHOLD);
  const streakSafeDeciles = hasTwoConsecutiveHighRolls
    ? availableDeciles.filter(
        (decile) =>
          decile * LOCAL_D100_FACES_PER_DECILE + 1 <= LOCAL_D100_HIGH_ROLL_THRESHOLD
      )
    : availableDeciles;
  const selectableDeciles = streakSafeDeciles.length > 0
    ? streakSafeDeciles
    : availableDeciles;
  const selectedDecile = selectableDeciles[randomIndex(selectableDeciles.length, random)] ?? 4;
  const faceOffset = randomIndex(LOCAL_D100_FACES_PER_DECILE, random);

  return selectedDecile * LOCAL_D100_FACES_PER_DECILE + faceOffset + 1;
}

export function calculateSecondaryAttributeModifier(value: number): number {
  return clamp(Math.round((value - 50) / 5), -10, 10);
}

export function deriveLocalJudgementOutcome(
  presetRoll: number,
  effectiveTarget: number
): JudgementOutcome {
  if (presetRoll <= 5) return 'critical_success';
  if (presetRoll >= 96) return 'critical_failure';
  if (presetRoll <= effectiveTarget) return 'success';
  if (presetRoll <= effectiveTarget + 10) return 'partial_success';
  return 'failure';
}

export function calculateEffectiveTarget({
  attributes,
  primaryAttribute,
  secondaryAttribute,
  difficultyTier,
  gameDifficulty,
  factors
}: {
  attributes: AttributeBlock;
  primaryAttribute: AttributeKey;
  secondaryAttribute?: AttributeKey;
  difficultyTier: JudgementDifficultyTier;
  gameDifficulty: GameDifficultyLevel;
  factors: JudgementFactor[];
}) {
  const primaryAttributeValue = attributes[primaryAttribute];
  const secondaryAttributeValue = secondaryAttribute
    ? attributes[secondaryAttribute]
    : undefined;
  const secondaryModifier =
    secondaryAttributeValue === undefined
      ? 0
      : calculateSecondaryAttributeModifier(secondaryAttributeValue);
  const difficultyModifier = judgementDifficultyModifiers[difficultyTier];
  const gameDifficultyProfile = getGameDifficultyProfile(gameDifficulty);
  const contextModifierTotal = clamp(
    factors.reduce((total, factor) => total + factor.value, 0),
    -20,
    20
  );
  const effectiveTarget = clamp(
    primaryAttributeValue +
      secondaryModifier +
      contextModifierTotal +
      difficultyModifier +
      gameDifficultyProfile.modifier,
    5,
    95
  );

  return {
    primaryAttributeValue,
    secondaryAttributeValue,
    secondaryModifier,
    difficultyModifier,
    gameDifficultyModifier: gameDifficultyProfile.modifier,
    contextModifierTotal,
    effectiveTarget
  };
}

export function resolveLocalJudgementIntent({
  state,
  intent,
  expectedRoll
}: {
  state: RuntimeState;
  intent: LocalJudgementIntent;
  expectedRoll: number;
}): LocalJudgementResolution {
  const issues: string[] = [];
  const diagnostics: StoryDiagnosticIssue[] = [];
  const normalizedExpectedRoll = clamp(Math.round(expectedRoll), 1, 100);
  const gameDifficulty = normalizeGameDifficulty(state.world.gameDifficulty);
  const availableSources = collectLocalJudgementSources(state);
  const availableTraits = new Map(
    availableSources.traits.map((source) => [source.sourceId, source])
  );
  const availableEquipment = new Map(
    availableSources.equipment.map((source) => [source.sourceId, source])
  );
  const usedStableSources = new Set<string>();
  const normalizedFactors: JudgementFactor[] = [];
  const normalizedSecondaryAttribute =
    intent.primaryAttribute === intent.secondaryAttribute
      ? undefined
      : intent.secondaryAttribute;

  if (intent.primaryAttribute === intent.secondaryAttribute) {
    diagnostics.push({
      path: ['secondaryAttribute'],
      code: 'local_judgement_secondary_attribute_removed',
      message: '模型把副属性回显为主属性，本地已移除重复副属性，避免同一能力重复加成。'
    });
  }
  intent.factors.forEach((factor, index) => {
    const factorNumber = index + 1;
    const normalizedValue = clamp(Math.round(factor.value), -10, 10);
    if (normalizedValue !== factor.value) {
      diagnostics.push({
        path: ['factors', index, 'value'],
        code: 'local_judgement_factor_value_clamped',
        message: `第 ${factorNumber} 项情境修正 ${factor.value} 已按本地规则限制为 ${normalizedValue}。`
      });
    }
    let sourceType = factor.sourceType;
    if (!sourceType && factor.sourceId) {
      const matchesTrait = availableTraits.has(factor.sourceId);
      const matchesEquipment = availableEquipment.has(factor.sourceId);
      if (matchesTrait !== matchesEquipment) {
        sourceType = matchesTrait ? 'trait' : 'equipment';
        diagnostics.push({
          path: ['factors', index, 'sourceType'],
          code: 'local_judgement_factor_source_inferred',
          message: `第 ${factorNumber} 项修正的稳定来源 ${factor.sourceId} 可唯一核验，本地已补齐来源类别 ${sourceType}。`
        });
      }
    }
    if (!sourceType) {
      diagnostics.push({
        path: ['factors', index],
        code: 'local_judgement_factor_rejected',
        message: `第 ${factorNumber} 项修正缺少可核验的来源类别，未采用该修正。`
      });
      return;
    }
    if (sourceType === 'trait' || sourceType === 'equipment') {
      if (!factor.sourceId) {
        diagnostics.push({
          path: ['factors', index],
          code: 'local_judgement_factor_rejected',
          message: `第 ${factorNumber} 项${judgementFactorSourceLabels[sourceType]}修正缺少稳定来源 ID，未采用该修正。`
        });
        return;
      }
      const sourceExists =
        sourceType === 'trait'
          ? availableTraits.has(factor.sourceId)
          : availableEquipment.has(factor.sourceId);
      if (!sourceExists) {
        diagnostics.push({
          path: ['factors', index],
          code: 'local_judgement_factor_rejected',
          message:
            sourceType === 'trait'
              ? `第 ${factorNumber} 项引用的特质 ${factor.sourceId} 当前不可用于判定，未采用该修正。`
              : `第 ${factorNumber} 项引用的装备 ${factor.sourceId} 当前未装备或不存在，未采用该修正。`
        });
        return;
      }
      const sourceKey = `${sourceType}:${factor.sourceId}`;
      if (usedStableSources.has(sourceKey)) {
        diagnostics.push({
          path: ['factors', index],
          code: 'local_judgement_factor_deduplicated',
          message: `第 ${factorNumber} 项重复使用了同一${judgementFactorSourceLabels[sourceType]}来源 ${factor.sourceId}，未重复计算。`
        });
        return;
      }
      usedStableSources.add(sourceKey);
    }
    if (normalizedFactors.length >= 5) {
      diagnostics.push({
        path: ['factors', index],
        code: 'local_judgement_factor_limit_applied',
        message: `本地判定最多采用五项情境修正，第 ${factorNumber} 项未参与计算。`
      });
      return;
    }
    normalizedFactors.push({
      ...factor,
      sourceType,
      value: normalizedValue
    });
  });

  const calculation = calculateEffectiveTarget({
    attributes: state.player.attributes,
    primaryAttribute: intent.primaryAttribute,
    secondaryAttribute: normalizedSecondaryAttribute,
    difficultyTier: intent.difficultyTier,
    gameDifficulty,
    factors: normalizedFactors
  });
  const outcome = deriveLocalJudgementOutcome(
    normalizedExpectedRoll,
    calculation.effectiveTarget
  );

  if (intent.presetRoll !== undefined && intent.presetRoll !== normalizedExpectedRoll) {
    diagnostics.push({
      path: ['presetRoll'],
      code: 'local_judgement_echo_overridden',
      message: `模型回显 d100=${intent.presetRoll}，本地已使用本回合唯一骰点 d100=${normalizedExpectedRoll}。`
    });
  }
  if (intent.effectiveTarget !== undefined && intent.effectiveTarget !== calculation.effectiveTarget) {
    diagnostics.push({
      path: ['effectiveTarget'],
      code: 'local_judgement_echo_overridden',
      message: `模型回显目标值 ${intent.effectiveTarget}，本地已按有效因素重算为 ${calculation.effectiveTarget}。`
    });
  }
  if (intent.difficulty !== undefined && intent.difficulty !== calculation.effectiveTarget) {
    diagnostics.push({
      path: ['difficulty'],
      code: 'local_judgement_echo_overridden',
      message: `模型回显兼容难度 ${intent.difficulty}，本地已改为 ${calculation.effectiveTarget}。`
    });
  }
  if (intent.score !== undefined && intent.score !== normalizedExpectedRoll) {
    diagnostics.push({
      path: ['score'],
      code: 'local_judgement_echo_overridden',
      message: `模型回显兼容骰点 ${intent.score}，本地已改为 ${normalizedExpectedRoll}。`
    });
  }
  const outcomeMismatch =
    intent.outcome === undefined || intent.outcome === outcome
      ? undefined
      : {
          reported: intent.outcome,
          canonical: outcome
        };
  if (outcomeMismatch) {
    diagnostics.push({
      path: ['outcome'],
      code: 'local_judgement_outcome_overridden',
      message: `模型提交结果 ${intent.outcome}，本地结算结果为 ${outcome}；结构字段已以本地结果为准。`
    });
  }

  return {
    issues,
    diagnostics,
    ...(outcomeMismatch ? { outcomeMismatch } : {}),
    check: {
      ...intent,
      rulesetVersion: LOCAL_JUDGEMENT_RULESET_VERSION,
      ...(normalizedSecondaryAttribute
        ? { secondaryAttribute: normalizedSecondaryAttribute }
        : { secondaryAttribute: undefined }),
      factors: normalizedFactors,
      difficulty: calculation.effectiveTarget,
      score: normalizedExpectedRoll,
      margin: calculation.effectiveTarget - normalizedExpectedRoll,
      primaryAttributeValue: calculation.primaryAttributeValue,
      secondaryAttributeValue: calculation.secondaryAttributeValue,
      secondaryModifier: calculation.secondaryModifier,
      difficultyModifier: calculation.difficultyModifier,
      gameDifficulty,
      gameDifficultyModifier: calculation.gameDifficultyModifier,
      contextModifierTotal: calculation.contextModifierTotal,
      effectiveTarget: calculation.effectiveTarget,
      presetRoll: normalizedExpectedRoll,
      outcome
    }
  };
}
