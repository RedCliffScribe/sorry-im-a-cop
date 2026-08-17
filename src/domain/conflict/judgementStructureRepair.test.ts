import { describe, expect, it } from 'vitest';
import {
  createJudgementStructureRepairRequest,
  mergeJudgementStructureRepair,
  parseJudgementStructureRepair
} from './judgementStructureRepair';
import { validateNarratorResponse } from '../writeback/validateWriteback';

describe('judgement structure repair', () => {
  it('requests only one judgement intent and excludes unrelated writeback', () => {
    const response = validateNarratorResponse({
      narrativeText: '玩家在桌前核对记录。',
      turnSummary: '玩家核对记录。',
      suggestedActions: ['继续'],
      writeback: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_secret_from_structure_prompt',
              category: 'document',
              name: '不应进入请求的文件',
              summary: '首份世界写回。'
            }
          ]
        }
      }
    });
    const request = createJudgementStructureRepairRequest({
      playerInput: '核对记录。',
      response,
      rawIntent: {
        category: 'unknown_category',
        effectiveTarget: '80'
      },
      missingFields: ['category', 'primaryAttribute']
    });
    const text = request.messages.map((message) => message.content).join('\n');

    expect(text).toContain('JUDGEMENT_STRUCTURE_REPAIR');
    expect(text).toContain('"effectiveTarget":"80"');
    expect(text).not.toContain('asset_secret_from_structure_prompt');
    expect(text).toContain('不得返回 presetRoll');
    expect(text).toContain('不得返回 narrativeText');
  });

  it('merges only repaired semantic fields into the preserved raw intent', () => {
    const repair = parseJudgementStructureRepair({
      value: {
        hasJudgement: true,
        intent: {
          title: '观察门缝',
          category: 'observation',
          primaryAttribute: 'perception',
          difficultyTier: 'hard',
          shortSummary: '玩家尝试从门缝观察。'
        }
      },
      hasCombat: false
    });

    expect(
      mergeJudgementStructureRepair(
        {
          checkId: 'check_preserved',
          presetRoll: 73,
          factors: [{ label: '昏暗', value: -3, reason: '光线不足' }]
        },
        repair
      )
    ).toMatchObject({
      checkId: 'check_preserved',
      presetRoll: 73,
      category: 'observation',
      primaryAttribute: 'perception',
      difficultyTier: 'hard',
      factors: [{ label: '昏暗', value: -3, reason: '光线不足' }]
    });
  });

  it('rejects invalid repair fields with precise schema paths', () => {
    expect(() =>
      parseJudgementStructureRepair({
        value: {
          hasJudgement: true,
          intent: {
            title: '缺字段'
          }
        },
        hasCombat: false
      })
    ).toThrow(/intent\.category|intent\.primaryAttribute/);
  });
});
