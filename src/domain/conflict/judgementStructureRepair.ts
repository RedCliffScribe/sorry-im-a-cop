import { z } from 'zod';
import type { StructuredNarratorRequest } from '../narrator/NarratorClient';
import type { NarratorResponse } from '../writeback/schema';

const repairedIntentSchema = z
  .object({
    title: z.string().trim().min(1),
    category: z.enum([
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
    ]),
    primaryAttribute: z.enum([
      'body',
      'action',
      'perception',
      'thinking',
      'negotiation',
      'will'
    ]),
    secondaryAttribute: z
      .enum(['body', 'action', 'perception', 'thinking', 'negotiation', 'will'])
      .optional(),
    difficultyTier: z.enum(['easy', 'standard', 'hard', 'dangerous', 'extreme']),
    shortSummary: z.string().trim().min(1),
    targetSummary: z.string().trim().min(1).optional(),
    consequenceSummary: z.string().trim().min(1).optional(),
    relatedCombatEventId: z.string().trim().min(1).optional()
  })
  .strict();

export const judgementStructureRepairSchema = z
  .object({
    hasJudgement: z.boolean(),
    intent: repairedIntentSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.hasJudgement && !value.intent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['intent'],
        message: 'hasJudgement=true 时必须返回 intent'
      });
    }
    if (!value.hasJudgement && value.intent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['intent'],
        message: 'hasJudgement=false 时不得返回 intent'
      });
    }
  });

export type JudgementStructureRepair = z.infer<typeof judgementStructureRepairSchema>;

function compactNarrative(text: string): string {
  return text.length <= 4_000 ? text : `${text.slice(0, 4_000)}…`;
}

export function createJudgementStructureRepairRequest({
  playerInput,
  response,
  rawIntent,
  missingFields
}: {
  playerInput: string;
  response: NarratorResponse;
  rawIntent: unknown;
  missingFields: string[];
}): StructuredNarratorRequest {
  const combatContext = response.writeback.combatEventPatches.map((combat) => ({
    combatId: combat.combatId,
    type: combat.type,
    title: combat.title,
    locationSummary: combat.locationSummary,
    resultSummary: combat.resultSummary,
    judgementCheckIds: combat.judgementCheckIds
  }));

  return {
    messages: [
      {
        role: 'system',
        source: 'game_protocol',
        content:
          '你是判定意图结构修复器。你只恢复一次判定的语义字段；本地系统拥有唯一骰点、目标值、难度修正和最终结果。'
      },
      {
        role: 'user',
        source: 'repair_protocol',
        content: [
          'JUDGEMENT_STRUCTURE_REPAIR',
          '只返回一个合法 JSON object，不要 Markdown、代码块、解释、思考过程或正文。',
          '严格形状：',
          '{"hasJudgement":true,"intent":{"title":"判定标题","category":"合法类别","primaryAttribute":"合法六维","secondaryAttribute":"可选合法六维","difficultyTier":"easy|standard|hard|dangerous|extreme","shortSummary":"判定意图短摘要","targetSummary":"可选目标","consequenceSummary":"可选后果语义","relatedCombatEventId":"可选既有对抗ID"}}',
          '若本回合确实没有需要判定的不确定行动，返回 {"hasJudgement":false}。',
          'category 只能是 observation/chase/melee/armed/firearm/crowd/negotiation/endurance/will/thinking/other。',
          'primaryAttribute/secondaryAttribute 只能是 body/action/perception/thinking/negotiation/will。',
          '不得返回 presetRoll、effectiveTarget、difficulty、score、margin、outcome、rulesetVersion、turnId 或 gameTime。',
          '不得返回 narrativeText、turnSummary、writeback、人物、案件、资产、关系、时间或其他世界写回。',
          '若存在重大对抗记录，hasJudgement 必须为 true，并仅引用给定 combatId。',
          `missingFields=${JSON.stringify(missingFields)}`,
          `playerInput=${JSON.stringify(playerInput)}`,
          `rawJudgementIntent=${JSON.stringify(rawIntent)}`,
          `combatContext=${JSON.stringify(combatContext)}`,
          `visibleContext=${JSON.stringify({
            narrativeText: compactNarrative(response.narrativeText),
            turnSummary: response.turnSummary
          })}`
        ].join('\n')
      }
    ]
  };
}

export function parseJudgementStructureRepair({
  value,
  hasCombat
}: {
  value: unknown;
  hasCombat: boolean;
}): JudgementStructureRepair {
  const parsed = judgementStructureRepairSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `判定结构修复失败：${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'response'} ${issue.message}`)
        .join('；')}`
    );
  }
  if (hasCombat && !parsed.data.hasJudgement) {
    throw new Error('判定结构修复失败：hasJudgement 与既有重大对抗记录冲突');
  }
  return parsed.data;
}

export function mergeJudgementStructureRepair(
  rawIntent: unknown,
  repair: JudgementStructureRepair
): unknown {
  if (!repair.hasJudgement || !repair.intent) return undefined;
  const base =
    rawIntent && typeof rawIntent === 'object' && !Array.isArray(rawIntent)
      ? rawIntent as Record<string, unknown>
      : {};
  return {
    ...base,
    ...repair.intent
  };
}
