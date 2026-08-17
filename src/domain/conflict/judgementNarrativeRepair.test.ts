import { describe, expect, it } from 'vitest';
import { validateNarratorResponse } from '../writeback/validateWriteback';
import {
  createJudgementNarrativeRepairRequest,
  mergeJudgementNarrativeRepair,
  parseJudgementNarrativeRepair
} from './judgementNarrativeRepair';

function createResponse() {
  return validateNarratorResponse({
    writebackVersion: '1.6',
    narrativeText: '首份完整正文写成了失败。',
    turnSummary: '玩家行动失败。',
    suggestedActions: ['保留原行动一', '保留原行动二'],
    timePatch: {
      elapsedMinutes: 5,
      reason: '保留首份时间写回。'
    },
    writeback: {
      assetPatch: {
        upsertItems: [
          {
            itemId: 'asset_preserved',
            category: 'document',
            name: '保留的文件',
            summary: '不得进入轻量修复请求。'
          }
        ]
      },
      memories: [
        {
          text: '首份候选建立的记忆必须保留。',
          importance: 60
        }
      ],
      judgementCheckPatches: [
        {
          rulesetVersion: 'v1.1-local-d100',
          checkId: 'check_1',
          turnId: 'turn_1',
          gameTime: { year: 1988, month: 9, day: 12, hour: 22, minute: 42 },
          title: '制服对手',
          category: 'melee',
          relatedActorIds: ['player'],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          primaryAttribute: 'action',
          difficultyTier: 'standard',
          presetRoll: 2,
          effectiveTarget: 80,
          outcome: 'critical_success',
          shortSummary: '首份摘要写错。',
          consequenceSummary: '首份后果写错。',
          factors: [],
          visibility: 'player_known'
        }
      ],
      combatEventPatches: [
        {
          combatId: 'combat_1',
          turnId: 'turn_1',
          gameTime: { year: 1988, month: 9, day: 12, hour: 22, minute: 42 },
          title: '巷战',
          type: 'melee',
          locationSummary: '后巷',
          participants: [
            {
              actorId: 'player',
              name: '玩家',
              side: 'player',
              roleSummary: '执行控制'
            }
          ],
          outcome: 'player_advantage',
          intensity: 60,
          combatText: '首份对抗正文。',
          resultSummary: '首份对抗结果。',
          consequenceSummary: '首份对抗后果。',
          judgementCheckIds: ['check_1'],
          relatedActorIds: ['player'],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          visibility: 'player_known',
          unread: true,
          createdAt: { year: 1988, month: 9, day: 12, hour: 22, minute: 42 }
        }
      ]
    }
  });
}

describe('judgement narrative repair', () => {
  it('uses a minimal independent request without carrying unrelated writeback', () => {
    const request = createJudgementNarrativeRepairRequest({
      playerInput: '制服对手。',
      response: createResponse(),
      checkIds: ['check_1']
    });
    const text = request.messages.map((message) => message.content).join('\n');

    expect(text).toContain('JUDGEMENT_NARRATIVE_REPAIR');
    expect(text).toContain('"presetRoll":2');
    expect(text).toContain('"effectiveTarget":80');
    expect(text).not.toContain('asset_preserved');
    expect(text).not.toContain('首份候选建立的记忆必须保留');
  });

  it('merges only visible narrative summaries and preserves all unrelated fields', () => {
    const response = createResponse();
    const repair = parseJudgementNarrativeRepair({
      value: {
        narrativeText: '校正后的正文确认大成功。',
        turnSummary: '玩家以大成功完成行动。',
        judgementSummaries: [
          {
            checkId: 'check_1',
            shortSummary: '本地判定为大成功。',
            consequenceSummary: '玩家取得明显优势。'
          }
        ],
        combatSummaries: [
          {
            combatId: 'combat_1',
            combatText: '玩家迅速完成控制。',
            resultSummary: '玩家取得现场优势。',
            consequenceSummary: '对手失去反抗能力。'
          }
        ]
      },
      expectedCheckIds: ['check_1'],
      expectedCombatIds: ['combat_1']
    });

    const merged = mergeJudgementNarrativeRepair(response, repair);

    expect(merged.narrativeText).toBe('校正后的正文确认大成功。');
    expect(merged.turnSummary).toBe('玩家以大成功完成行动。');
    expect(merged.suggestedActions).toBe(response.suggestedActions);
    expect(merged.timePatch).toBe(response.timePatch);
    expect(merged.writeback.assetPatch).toBe(response.writeback.assetPatch);
    expect(merged.writeback.memories).toBe(response.writeback.memories);
    expect(merged.writeback.actorPatches).toBe(response.writeback.actorPatches);
    expect(merged.writeback.casePatches).toBe(response.writeback.casePatches);
    expect(merged.writeback.judgementCheckPatches[0]).toMatchObject({
      checkId: 'check_1',
      presetRoll: 2,
      effectiveTarget: 80,
      outcome: 'critical_success',
      shortSummary: '本地判定为大成功。'
    });
    expect(merged.writeback.combatEventPatches[0]).toMatchObject({
      combatId: 'combat_1',
      judgementCheckIds: ['check_1'],
      combatText: '玩家迅速完成控制。'
    });
  });

  it('rejects a repair that omits or invents required record ids', () => {
    expect(() =>
      parseJudgementNarrativeRepair({
        value: {
          narrativeText: '校正正文。',
          turnSummary: '校正摘要。',
          judgementSummaries: [
            {
              checkId: 'check_invented',
              shortSummary: '错误 ID。'
            }
          ],
          combatSummaries: []
        },
        expectedCheckIds: ['check_1'],
        expectedCombatIds: []
      })
    ).toThrow('judgementSummaries 未精确覆盖待校正判定');
  });
});
