import { describe, expect, it } from 'vitest';
import type { NarratorAttemptRecord } from '../../src/domain/narrator/NarratorClient';
import { OpenAiCompatibleNarratorClient } from '../../src/domain/narrator/OpenAiCompatibleNarratorClient';
import { countVisibleNarrativeCharacters } from '../../src/domain/narrator/narrativeLengthGuard';
import { runOpening } from '../../src/domain/opening/runOpening';
import type { OpeningSetup } from '../../src/domain/runtime/initialState';

const shouldRun =
  process.env.COPV2_RUN_TWO_PHASE_OPENING_REAL_API === '1' &&
  Boolean(process.env.DEEPSEEK_API_KEY?.trim());
const baseUrl =
  process.env.COPV2_DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1';
const model =
  process.env.COPV2_DEEPSEEK_MODEL?.trim() || 'deepseek-v4-pro';
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_DEEPSEEK_OPENING_TIMEOUT_MS ?? 600_000)
);

const forbiddenPlaceholders = [
  '待生成',
  '随剧情明确',
  '开局生成人物',
  '需要通过后续判断'
];

function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 800);
}

function summarizeAttempt(attempt: NarratorAttemptRecord) {
  return {
    purpose: attempt.purpose,
    requestedMaxTokens: attempt.requestedMaxTokens,
    finishReason: attempt.finishReason,
    parseStatus: attempt.parseStatus,
    rawCharacters: attempt.rawText.length,
    usage: attempt.usage
  };
}

describe.skipIf(!shouldRun)('DeepSeek official two-phase opening real API acceptance', () => {
  it(
    'atomically creates a complete civilian opening and preserves a fifty-billion bank balance',
    async () => {
      const attempts: NarratorAttemptRecord[] = [];
      const stages: string[] = [];
      const actionPreviews: string[][] = [];
      const narrator = new OpenAiCompatibleNarratorClient({
        baseUrl,
        apiKey: process.env.DEEPSEEK_API_KEY!,
        model,
        maxTokens: 8192,
        temperature: 0.55,
        requestTimeoutMs
      });
      const setup: OpeningSetup = {
        playerName: '何家俊',
        englishName: 'Jason Ho',
        gender: 'male',
        age: 32,
        currentIdentity: 'civilian',
        civilianProfileId: 'self_employed_merchant',
        personality: '务实、冷静，重视合法凭据和长期信誉。',
        appearance: '身形中等，衣着整洁，神情沉着。',
        startTime: {
          year: 1988,
          month: 9,
          day: 14,
          hour: 9,
          minute: 30
        },
        openingPressure: 'routine',
        openingNote:
          '这是必须原值写入运行态的合法开局事实：玩家随身现金 HK$8,000；个人银行存款 HK$50,000,000,000（五百亿港元），资金来源为已经完成法律及银行审查的海外家族信托分配，不是企业估值、资产总值、贷款或待到账款项。playerStatePatch.economy 必须逐项写 cashOnHand=8000、bankBalance=50000000000，不得缩写、调换或调整数量级。开局仍以花园街商铺的正常早晨为中心，不要因为财富制造突发犯罪或替玩家作出投资决定。'
      };

      let state;
      try {
        state = await runOpening({
          setup,
          narrator,
          narrativeLengthLevel: 'standard',
          narrativePerspective: 'second_person',
          playerPortrayalMode: 'natural',
          locale: 'zh-CN',
          onAttempt: (attempt) => attempts.push(attempt),
          onStageChange: (stage) => stages.push(stage),
          onActionPreview: (actions) => actionPreviews.push(actions)
        });
      } catch (error) {
        console.log(
          `[two-phase-opening-real] model=${model} attempts=${JSON.stringify(
            attempts.map(summarizeAttempt)
          )} error=${sanitizeError(error)}`
        );
        throw error;
      }

      const successfulBlueprint = attempts.find(
        (attempt) =>
          attempt.purpose === 'opening_blueprint' &&
          attempt.parseStatus === 'success'
      );
      const successfulInitialization = attempts.find(
        (attempt) =>
          attempt.purpose === 'opening_initialization' &&
          attempt.parseStatus === 'success'
      );
      expect(successfulBlueprint).toBeDefined();
      expect(successfulInitialization).toBeDefined();
      expect(attempts.length).toBeGreaterThanOrEqual(2);
      expect(
        attempts.every((attempt) => attempt.requestedMaxTokens === 32_768)
      ).toBe(true);
      expect(
        attempts.every((attempt) => attempt.finishReason !== 'length')
      ).toBe(true);

      expect(state.turnCounter).toBe(0);
      expect(state.storyLog).toHaveLength(1);
      expect(countVisibleNarrativeCharacters(state.storyLog[0].text)).toBeGreaterThanOrEqual(
        900
      );
      expect(state.storyLog[0].suggestedActions?.length).toBeGreaterThanOrEqual(2);
      expect(stages).toContain('validating_opening_blueprint');
      expect(stages).toContain('validating_opening_data');
      expect(stages.at(-1)).toBe('applying_opening');
      expect(actionPreviews.some((preview) => preview.length >= 2)).toBe(true);

      expect(state.player.economy).toMatchObject({
        cashOnHand: 8_000,
        bankBalance: 50_000_000_000
      });
      expect(state.finance).toMatchObject({
        cashOnHand: 8_000,
        bankBalance: 50_000_000_000
      });

      const openingActors = Object.values(state.actors).filter(
        (actor) => actor.actorId !== state.player.actorId
      );
      expect(openingActors.length).toBeGreaterThanOrEqual(1);
      for (const actor of openingActors) {
        const requiredText = [
          actor.name,
          actor.publicIdentity,
          actor.actualIdentitySummary,
          actor.positionSummary,
          actor.profileSummary,
          actor.appearance,
          actor.clothing,
          actor.personality,
          actor.speechStyle,
          actor.motivation,
          actor.longTermGoal,
          actor.values,
          actor.relationshipSummary,
          actor.attitudeTowardPlayer,
          actor.trustTendency,
          actor.entanglementSummary,
          actor.longTermMemorySummary,
          actor.recentInteractionMemory,
          actor.statusSummary,
          actor.bodyConditionSummary
        ];
        expect(requiredText.every((value) => value.trim().length > 0)).toBe(true);
        expect(
          requiredText.every((value) =>
            forbiddenPlaceholders.every((placeholder) => !value.includes(placeholder))
          )
        ).toBe(true);
        expect(Object.keys(actor.attributes).sort()).toEqual(
          ['action', 'body', 'negotiation', 'perception', 'thinking', 'will'].sort()
        );
        expect(actor.computedAge).toBeGreaterThan(0);
        expect(actor.currentPlaceId).toBeTruthy();
        expect(actor.presence).toBeTruthy();
        expect(actor.visibility).toBeTruthy();
        expect(Number.isInteger(actor.importance)).toBe(true);
      }

      const playerCivilianProfile = state.actors[state.player.actorId].roleProfiles.civilian;
      expect(playerCivilianProfile?.livelihoodActorIds.length).toBeGreaterThanOrEqual(1);
      expect(
        Object.values(state.dynamicEvents.currentMatters).filter(
          (matter) => matter.matterKind === 'livelihood'
        )
      ).toHaveLength(1);

      console.log(
        `[two-phase-opening-real] model=${model} success=true narrativeChars=${countVisibleNarrativeCharacters(
          state.storyLog[0].text
        )} actors=${openingActors.length} previews=${actionPreviews.at(-1)?.length ?? 0} attempts=${JSON.stringify(
          attempts.map(summarizeAttempt)
        )}`
      );
    },
    1_200_000
  );
});
