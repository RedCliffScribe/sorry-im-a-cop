import { z } from 'zod';
import type { StructuredNarratorRequest } from '../narrator/NarratorClient';
import type { JudgementOutcome } from '../runtime/types';
import type { NarratorResponse } from '../writeback/schema';

const judgementSummaryRepairSchema = z
  .object({
    checkId: z.string().min(1),
    shortSummary: z.string().min(1),
    consequenceSummary: z.string().min(1).optional()
  })
  .strict();

const combatSummaryRepairSchema = z
  .object({
    combatId: z.string().min(1),
    combatText: z.string().min(1),
    resultSummary: z.string().min(1),
    consequenceSummary: z.string().min(1).optional()
  })
  .strict();

export const judgementNarrativeRepairSchema = z
  .object({
    narrativeText: z.string().min(1),
    turnSummary: z.string().min(1),
    judgementSummaries: z.array(judgementSummaryRepairSchema).min(1),
    combatSummaries: z.array(combatSummaryRepairSchema).default([])
  })
  .strict();

export type JudgementNarrativeRepair = z.infer<typeof judgementNarrativeRepairSchema>;

const outcomeLabels: Readonly<Record<JudgementOutcome, string>> = {
  critical_success: '大成功',
  success: '成功',
  partial_success: '有限成功',
  failure: '失败',
  critical_failure: '大失败'
};

function sameIds(actualIds: string[], expectedIds: string[]): boolean {
  const actual = [...new Set(actualIds)].sort();
  const expected = [...new Set(expectedIds)].sort();
  return (
    actual.length === actualIds.length &&
    actual.length === expected.length &&
    actual.every((id, index) => id === expected[index])
  );
}

export function parseJudgementNarrativeRepair({
  value,
  expectedCheckIds,
  expectedCombatIds
}: {
  value: unknown;
  expectedCheckIds: string[];
  expectedCombatIds: string[];
}): JudgementNarrativeRepair {
  const parsed = judgementNarrativeRepairSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `判定叙事校正结构无效：${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'response'} ${issue.message}`)
        .join('；')}`
    );
  }
  if (
    !sameIds(
      parsed.data.judgementSummaries.map((summary) => summary.checkId),
      expectedCheckIds
    )
  ) {
    throw new Error('判定叙事校正结构无效：judgementSummaries 未精确覆盖待校正判定。');
  }
  if (
    !sameIds(
      parsed.data.combatSummaries.map((summary) => summary.combatId),
      expectedCombatIds
    )
  ) {
    throw new Error('判定叙事校正结构无效：combatSummaries 未精确覆盖相关对抗。');
  }
  return parsed.data;
}

export function createJudgementNarrativeRepairRequest({
  playerInput,
  response,
  checkIds
}: {
  playerInput: string;
  response: NarratorResponse;
  checkIds: string[];
}): StructuredNarratorRequest {
  const checkIdSet = new Set(checkIds);
  const judgements = response.writeback.judgementCheckPatches
    .filter((check) => checkIdSet.has(check.checkId))
    .map((check) => ({
      checkId: check.checkId,
      title: check.title,
      presetRoll: check.presetRoll,
      effectiveTarget: check.effectiveTarget,
      outcome: check.outcome,
      outcomeLabel: outcomeLabels[check.outcome],
      shortSummary: check.shortSummary,
      consequenceSummary: check.consequenceSummary
    }));
  const combatIds = new Set(
    response.writeback.combatEventPatches
      .filter((combat) =>
        combat.judgementCheckIds.some((checkId) => checkIdSet.has(checkId))
      )
      .map((combat) => combat.combatId)
  );
  const combats = response.writeback.combatEventPatches
    .filter((combat) => combatIds.has(combat.combatId))
    .map((combat) => ({
      combatId: combat.combatId,
      combatText: combat.combatText,
      resultSummary: combat.resultSummary,
      consequenceSummary: combat.consequenceSummary
    }));

  return {
    messages: [
      {
        role: 'system',
        source: 'game_protocol',
        content:
          '你是判定叙事一致性校正器。游戏本地已经完成唯一 d100 结算；你只能校正与结果冲突的可见叙事，不得改写或补造任何结构化世界事实。'
      },
      {
        role: 'user',
        source: 'repair_protocol',
        content: [
          'JUDGEMENT_NARRATIVE_REPAIR',
          '只返回一个合法 JSON object，不要 Markdown、代码块、解释或思考过程。',
          '严格使用以下形状：',
          '{"narrativeText":"完整校正后正文","turnSummary":"校正后回合摘要","judgementSummaries":[{"checkId":"原ID","shortSummary":"校正后短摘要","consequenceSummary":"可选"}],"combatSummaries":[{"combatId":"原ID","combatText":"校正后对抗正文","resultSummary":"校正后结果摘要","consequenceSummary":"可选"}]}',
          'judgementSummaries 必须逐项使用给定 checkId；combatSummaries 必须逐项使用给定 combatId。没有相关对抗时返回空数组。',
          '保留原正文已经发生的人物、地点、案件、关系、资产、时间、行动含义和其他事实，只把与 canonicalJudgements 冲突的成败表述改正确。',
          '不得返回 actorPatches、casePatches、timePatch、writeback 或完整 NarratorResponse。',
          `playerInput=${JSON.stringify(playerInput)}`,
          `canonicalJudgements=${JSON.stringify(judgements)}`,
          `relatedCombats=${JSON.stringify(combats)}`,
          `originalVisibleText=${JSON.stringify({
            narrativeText: response.narrativeText,
            turnSummary: response.turnSummary,
            judgementSummaries: judgements.map((check) => ({
              checkId: check.checkId,
              shortSummary: check.shortSummary,
              consequenceSummary: check.consequenceSummary
            })),
            combatSummaries: combats
          })}`
        ].join('\n')
      }
    ]
  };
}

export function mergeJudgementNarrativeRepair(
  response: NarratorResponse,
  repair: JudgementNarrativeRepair
): NarratorResponse {
  const judgementSummaries = new Map(
    repair.judgementSummaries.map((summary) => [summary.checkId, summary])
  );
  const combatSummaries = new Map(
    repair.combatSummaries.map((summary) => [summary.combatId, summary])
  );

  return {
    ...response,
    narrativeText: repair.narrativeText,
    turnSummary: repair.turnSummary,
    writeback: {
      ...response.writeback,
      judgementCheckPatches: response.writeback.judgementCheckPatches.map((check) => {
        const summary = judgementSummaries.get(check.checkId);
        if (!summary) return check;
        return {
          ...check,
          shortSummary: summary.shortSummary,
          ...(summary.consequenceSummary !== undefined
            ? { consequenceSummary: summary.consequenceSummary }
            : {})
        };
      }),
      combatEventPatches: response.writeback.combatEventPatches.map((combat) => {
        const summary = combatSummaries.get(combat.combatId);
        if (!summary) return combat;
        return {
          ...combat,
          combatText: summary.combatText,
          resultSummary: summary.resultSummary,
          ...(summary.consequenceSummary !== undefined
            ? { consequenceSummary: summary.consequenceSummary }
            : {})
        };
      })
    }
  };
}
