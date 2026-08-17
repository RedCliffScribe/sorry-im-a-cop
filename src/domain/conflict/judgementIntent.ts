import { z } from 'zod';
import type {
  AttributeKey,
  GameTime,
  JudgementCategory,
  JudgementDifficultyTier,
  JudgementFactor,
  JudgementFactorSourceType,
  JudgementOutcome,
  StoryDiagnosticIssue,
  Visibility
} from '../runtime/types';
import type { NarratorResponse } from '../writeback/schema';
import {
  LOCAL_JUDGEMENT_RULESET_VERSION,
  type LocalJudgementIntent
} from './localJudgement';

const intentObjectSchema = z
  .object({
    rulesetVersion: z.unknown().optional(),
    checkId: z.unknown().optional(),
    turnId: z.unknown().optional(),
    gameTime: z.unknown().optional(),
    title: z.unknown().optional(),
    category: z.unknown().optional(),
    targetSummary: z.unknown().optional(),
    relatedActorIds: z.unknown().optional(),
    relatedPlaceIds: z.unknown().optional(),
    relatedCaseIds: z.unknown().optional(),
    difficulty: z.unknown().optional(),
    score: z.unknown().optional(),
    primaryAttribute: z.unknown().optional(),
    secondaryAttribute: z.unknown().optional(),
    difficultyTier: z.unknown().optional(),
    presetRoll: z.unknown().optional(),
    effectiveTarget: z.unknown().optional(),
    outcome: z.unknown().optional(),
    shortSummary: z.unknown().optional(),
    consequenceSummary: z.unknown().optional(),
    factors: z.unknown().optional(),
    relatedCombatEventId: z.unknown().optional(),
    visibility: z.unknown().optional()
  })
  .passthrough();

export const judgementCheckIntentSchema = intentObjectSchema;

const factorIntentSchema = z
  .object({
    sourceType: z.unknown().optional(),
    sourceId: z.unknown().optional(),
    label: z.string().trim().min(1),
    value: z.number().finite(),
    reason: z.string().trim().min(1)
  })
  .passthrough();

const finalCategories = new Set<JudgementCategory>([
  'observation',
  'chase',
  'melee',
  'armed',
  'firearm',
  'crowd',
  'negotiation',
  'endurance',
  'will',
  'thinking',
  'other'
]);

const categoryAliases: Readonly<Record<string, JudgementCategory>> = {
  notice: 'observation',
  search: 'observation',
  perception: 'observation',
  investigation: 'thinking',
  reasoning: 'thinking',
  shooting: 'firearm',
  gunfight: 'firearm',
  persuasion: 'negotiation',
  social: 'negotiation',
  stamina: 'endurance',
  physical: 'endurance',
  mental: 'will',
  self_control: 'will',
  观察: 'observation',
  观察力: 'observation',
  搜查: 'observation',
  搜索: 'observation',
  感知: 'observation',
  追逐: 'chase',
  追捕: 'chase',
  近战: 'melee',
  格斗: 'melee',
  搏斗: 'melee',
  持械: 'armed',
  武器: 'armed',
  射击: 'firearm',
  枪战: 'firearm',
  枪械: 'firearm',
  群体: 'crowd',
  人群: 'crowd',
  交涉: 'negotiation',
  谈判: 'negotiation',
  说服: 'negotiation',
  体魄: 'endurance',
  耐力: 'endurance',
  意志: 'will',
  自制: 'will',
  思考: 'thinking',
  推理: 'thinking',
  分析: 'thinking',
  其他: 'other'
};

const attributeAliases: Readonly<Record<string, AttributeKey>> = {
  body: 'body',
  physique: 'body',
  strength: 'body',
  体魄: 'body',
  体力: 'body',
  action: 'action',
  agility: 'action',
  reflex: 'action',
  行动: 'action',
  敏捷: 'action',
  perception: 'perception',
  observation: 'perception',
  观察: 'perception',
  感知: 'perception',
  thinking: 'thinking',
  reasoning: 'thinking',
  思考: 'thinking',
  推理: 'thinking',
  negotiation: 'negotiation',
  persuasion: 'negotiation',
  交涉: 'negotiation',
  谈判: 'negotiation',
  will: 'will',
  mental: 'will',
  self_control: 'will',
  意志: 'will',
  自制: 'will'
};

const difficultyAliases: Readonly<Record<string, JudgementDifficultyTier>> = {
  easy: 'easy',
  simple: 'easy',
  容易: 'easy',
  简单: 'easy',
  standard: 'standard',
  normal: 'standard',
  标准: 'standard',
  普通: 'standard',
  hard: 'hard',
  difficult: 'hard',
  困难: 'hard',
  dangerous: 'dangerous',
  danger: 'dangerous',
  危险: 'dangerous',
  extreme: 'extreme',
  极端: 'extreme'
};

const outcomeAliases: Readonly<Record<string, JudgementOutcome>> = {
  critical_success: 'critical_success',
  success: 'success',
  partial_success: 'partial_success',
  failure: 'failure',
  critical_failure: 'critical_failure',
  大成功: 'critical_success',
  成功: 'success',
  有限成功: 'partial_success',
  部分成功: 'partial_success',
  失败: 'failure',
  大失败: 'critical_failure'
};

const sourceTypeAliases: Readonly<Record<string, JudgementFactorSourceType>> = {
  trait: 'trait',
  equipment: 'equipment',
  status: 'status',
  environment: 'environment',
  preparation: 'preparation',
  other: 'other',
  特质: 'trait',
  装备: 'equipment',
  状态: 'status',
  环境: 'environment',
  准备: 'preparation',
  其他: 'other'
};

function normalizedToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized || undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeStringArray(
  value: unknown,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push({
      path,
      code: 'local_judgement_intent_field_normalized',
      message: '模型返回的关联 ID 不是数组，本地已按空数组处理。'
    });
    return [];
  }
  return [...new Set(value.flatMap((item) => {
    const normalized = nonEmptyString(item);
    return normalized ? [normalized] : [];
  }))];
}

function normalizeVisibility(value: unknown): Visibility {
  return value === 'hidden' || value === 'private' || value === 'public' || value === 'player_known'
    ? value
    : 'player_known';
}

function normalizeCategory(
  value: unknown,
  relatedCombatType: string | undefined
): JudgementCategory | undefined {
  const token = normalizedToken(value);
  if (!token) return undefined;
  if (finalCategories.has(token as JudgementCategory)) return token as JudgementCategory;
  const direct = categoryAliases[token];
  if (direct) return direct;
  if (!['combat', 'fight', 'physical_combat'].includes(token)) return undefined;
  if (relatedCombatType === 'armed') return 'armed';
  if (relatedCombatType === 'firearm') return 'firearm';
  if (relatedCombatType === 'chase') return 'chase';
  if (relatedCombatType === 'crowd') return 'crowd';
  if (relatedCombatType === 'melee' || relatedCombatType === 'arrest') return 'melee';
  return undefined;
}

function normalizeAttribute(value: unknown): AttributeKey | undefined {
  const token = normalizedToken(value);
  return token ? attributeAliases[token] : undefined;
}

function normalizeDifficulty(value: unknown): JudgementDifficultyTier | undefined {
  const token = normalizedToken(value);
  return token ? difficultyAliases[token] : undefined;
}

function normalizeOutcome(value: unknown): JudgementOutcome | undefined {
  const token = normalizedToken(value);
  return token ? outcomeAliases[token] : undefined;
}

export function normalizeJudgementOutcome(
  value: unknown
): JudgementOutcome | undefined {
  return normalizeOutcome(value);
}

function normalizeSourceType(value: unknown): JudgementFactorSourceType | undefined {
  const token = normalizedToken(value);
  return token ? sourceTypeAliases[token] : undefined;
}

function normalizeFactors(
  value: unknown,
  diagnostics: StoryDiagnosticIssue[]
): JudgementFactor[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push({
      path: ['factors'],
      code: 'local_judgement_factor_rejected',
      message: '模型返回的判定因素不是数组，本地未采用任何未验证修正。'
    });
    return [];
  }
  return value.flatMap<JudgementFactor>((candidate, index) => {
    const parsed = factorIntentSchema.safeParse(candidate);
    if (!parsed.success) {
      diagnostics.push({
        path: ['factors', index],
        code: 'local_judgement_factor_rejected',
        message: `第 ${index + 1} 项判定因素缺少合法的名称、数值或原因，本地未采用该修正。`
      });
      return [];
    }
    const sourceType = normalizeSourceType(parsed.data.sourceType);
    const sourceId = nonEmptyString(parsed.data.sourceId);
    return [{
      ...(sourceType ? { sourceType } : {}),
      ...(sourceId ? { sourceId } : {}),
      label: parsed.data.label,
      value: parsed.data.value,
      reason: parsed.data.reason
    }];
  });
}

function snapshotValue(value: unknown, depth = 0): unknown {
  if (depth >= 4) return '[depth-limited]';
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => snapshotValue(item, depth + 1));
  if (typeof value !== 'object' || !value) return String(value);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .map(([key, item]) => [key, snapshotValue(item, depth + 1)])
  );
}

export interface JudgementIntentNormalization {
  intent?: LocalJudgementIntent;
  missingFields: string[];
  diagnostics: StoryDiagnosticIssue[];
  rawSnapshot: unknown;
}

export function normalizeJudgementCheckIntent({
  value,
  turnId,
  gameTime,
  fallbackCheckId,
  combatEventPatches
}: {
  value: unknown;
  turnId: string;
  gameTime: GameTime;
  fallbackCheckId: string;
  combatEventPatches: NarratorResponse['writeback']['combatEventPatches'];
}): JudgementIntentNormalization {
  const diagnostics: StoryDiagnosticIssue[] = [];
  const parsed = judgementCheckIntentSchema.safeParse(value);
  const rawSnapshot = snapshotValue(value);
  if (!parsed.success) {
    return {
      missingFields: ['judgementIntent'],
      diagnostics: [{
        path: [],
        code: 'local_judgement_intent_invalid',
        message: '模型返回的判定意图不是对象，需要小型结构修复。'
      }],
      rawSnapshot
    };
  }

  const raw = parsed.data;
  const relatedCombatEventId = nonEmptyString(raw.relatedCombatEventId);
  const matchingCombat = relatedCombatEventId
    ? combatEventPatches.find((combat) => combat.combatId === relatedCombatEventId)
    : combatEventPatches.length === 1
      ? combatEventPatches[0]
      : undefined;
  const category = normalizeCategory(raw.category, matchingCombat?.type);
  const primaryAttribute = normalizeAttribute(raw.primaryAttribute);
  const difficultyTier = normalizeDifficulty(raw.difficultyTier);
  const title = nonEmptyString(raw.title);
  const shortSummary = nonEmptyString(raw.shortSummary);
  const missingFields = [
    ...(category ? [] : ['category']),
    ...(primaryAttribute ? [] : ['primaryAttribute']),
    ...(difficultyTier ? [] : ['difficultyTier']),
    ...(title ? [] : ['title']),
    ...(shortSummary ? [] : ['shortSummary'])
  ];

  const categoryToken = normalizedToken(raw.category);
  if (category && categoryToken !== category) {
    diagnostics.push({
      path: ['category'],
      code: 'local_judgement_category_normalized',
      message: `模型判定类别 ${JSON.stringify(raw.category)} 已归一化为 ${category}。`
    });
  }
  if (raw.effectiveTarget !== undefined && finiteNumber(raw.effectiveTarget) === undefined) {
    diagnostics.push({
      path: ['effectiveTarget'],
      code: 'local_judgement_echo_ignored',
      message: `模型回显的 effectiveTarget=${JSON.stringify(snapshotValue(raw.effectiveTarget))} 不是合法数字；本地将忽略并重新计算。`
    });
  }
  if (raw.presetRoll !== undefined && finiteNumber(raw.presetRoll) === undefined) {
    diagnostics.push({
      path: ['presetRoll'],
      code: 'local_judgement_echo_ignored',
      message: `模型回显的 presetRoll=${JSON.stringify(snapshotValue(raw.presetRoll))} 不是合法数字；本地将继续使用唯一预置骰。`
    });
  }
  if (raw.outcome !== undefined && !normalizeOutcome(raw.outcome)) {
    diagnostics.push({
      path: ['outcome'],
      code: 'local_judgement_echo_ignored',
      message: `模型回显的 outcome=${JSON.stringify(snapshotValue(raw.outcome))} 无法识别；最终结果仍由本地计算。`
    });
  }

  if (missingFields.length > 0 || !category || !primaryAttribute || !difficultyTier || !title || !shortSummary) {
    return {
      missingFields,
      diagnostics,
      rawSnapshot
    };
  }

  const checkId = nonEmptyString(raw.checkId) ?? fallbackCheckId;
  const secondaryAttribute = normalizeAttribute(raw.secondaryAttribute);
  const targetSummary = nonEmptyString(raw.targetSummary);
  const consequenceSummary = nonEmptyString(raw.consequenceSummary);
  return {
    missingFields: [],
    diagnostics,
    rawSnapshot,
    intent: {
      rulesetVersion: LOCAL_JUDGEMENT_RULESET_VERSION,
      checkId,
      turnId,
      gameTime,
      title,
      category,
      ...(targetSummary ? { targetSummary } : {}),
      relatedActorIds: normalizeStringArray(
        raw.relatedActorIds,
        ['relatedActorIds'],
        diagnostics
      ),
      relatedPlaceIds: normalizeStringArray(
        raw.relatedPlaceIds,
        ['relatedPlaceIds'],
        diagnostics
      ),
      relatedCaseIds: normalizeStringArray(
        raw.relatedCaseIds,
        ['relatedCaseIds'],
        diagnostics
      ),
      primaryAttribute,
      ...(secondaryAttribute ? { secondaryAttribute } : {}),
      difficultyTier,
      ...(finiteNumber(raw.presetRoll) !== undefined
        ? { presetRoll: finiteNumber(raw.presetRoll) }
        : {}),
      ...(finiteNumber(raw.effectiveTarget) !== undefined
        ? { effectiveTarget: finiteNumber(raw.effectiveTarget) }
        : {}),
      ...(finiteNumber(raw.difficulty) !== undefined
        ? { difficulty: finiteNumber(raw.difficulty) }
        : {}),
      ...(finiteNumber(raw.score) !== undefined
        ? { score: finiteNumber(raw.score) }
        : {}),
      ...(normalizeOutcome(raw.outcome) ? { outcome: normalizeOutcome(raw.outcome) } : {}),
      shortSummary,
      ...(consequenceSummary ? { consequenceSummary } : {}),
      factors: normalizeFactors(raw.factors, diagnostics),
      ...(matchingCombat ? { relatedCombatEventId: matchingCombat.combatId } : {}),
      visibility: normalizeVisibility(raw.visibility)
    }
  };
}

export function getRawJudgementCheckPatches(value: unknown): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const writeback = (value as { writeback?: unknown }).writeback;
  if (!writeback || typeof writeback !== 'object' || Array.isArray(writeback)) return [];
  const patches = (writeback as { judgementCheckPatches?: unknown }).judgementCheckPatches;
  if (patches === undefined) return [];
  return Array.isArray(patches) ? patches : [patches];
}
