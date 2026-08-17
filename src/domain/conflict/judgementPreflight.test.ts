import { describe, expect, it } from 'vitest';
import { selectContext } from '../context/selectContext';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  createJudgementPreflightRequest,
  normalizeJudgementPreflight,
  resolveJudgementPreflight
} from './judgementPreflight';

describe('judgement preflight', () => {
  it('accepts a no-judgement decision without creating a resolution', () => {
    const state = createInitialRuntimeState();
    const normalized = normalizeJudgementPreflight({
      value: {
        hasJudgement: false,
        reasonSummary: '只是抄录已经确认的值班编号，没有阻力或失败分支。',
        combatIntent: 'none',
        factorProposals: []
      },
      turnId: 'turn_0001',
      gameTime: state.time
    });

    expect(normalized).toMatchObject({
      missingFields: [],
      preflight: {
        hasJudgement: false,
        combatIntent: 'none'
      }
    });
    expect(
      resolveJudgementPreflight({
        state,
        preflight: normalized.preflight!,
        turnId: 'turn_0001',
        gameTime: state.time,
        presetRoll: 42
      })
    ).toBeUndefined();
  });

  it('normalizes semantic aliases before creating the canonical local resolution', () => {
    const state = createInitialRuntimeState({
      gameDifficulty: 'standard',
      attributes: {
        body: 50,
        action: 50,
        perception: 60,
        thinking: 50,
        negotiation: 50,
        will: 50
      },
      traits: [
        {
          traitId: 'trait_street_sense',
          name: '街头直觉',
          source: 'opening',
          description: '熟悉街面异常。',
          effectSummary: '有助于发现可疑动作。',
          scopes: ['observation'],
          status: 'active',
          visibility: 'player_known'
        }
      ]
    });
    const normalized = normalizeJudgementPreflight({
      value: {
        required: true,
        reason: '对方刻意遮挡双手，观察失败会漏掉危险动作。',
        category: '观察',
        primaryAttribute: '感知',
        difficultyTier: '普通',
        stakesSummary: '成功可提前识别危险，失败会失去反应时间。',
        targetActorId: state.player.actorId,
        factorProposals: [
          {
            sourceType: 'trait',
            sourceId: 'trait_street_sense',
            evidenceRef: {
              kind: 'trait',
              refId: 'trait_street_sense'
            },
            polarity: 'advantage',
            magnitude: 'moderate',
            reason: '街头经验直接帮助识别遮掩动作。'
          }
        ]
      },
      turnId: 'turn_0001',
      gameTime: state.time
    });

    expect(normalized.missingFields).toEqual([]);
    expect(normalized.preflight).toMatchObject({
      hasJudgement: true,
      category: 'observation',
      primaryAttribute: 'perception',
      difficultyTier: 'standard'
    });
    expect(normalized.rawSnapshot).toMatchObject({
      factorProposals: [
        {
          sourceType: 'trait',
          sourceId: 'trait_street_sense',
          evidenceRef: {
            kind: 'trait',
            refId: 'trait_street_sense'
          },
          polarity: 'advantage',
          magnitude: 'moderate'
        }
      ]
    });

    const envelope = resolveJudgementPreflight({
      state,
      preflight: normalized.preflight!,
      turnId: 'turn_0001',
      gameTime: state.time,
      presetRoll: 42,
      normalizationDiagnostics: normalized.diagnostics
    });
    expect(envelope).toMatchObject({
      checkId: 'check_turn_0001_1',
      category: 'observation',
      primaryAttribute: 'perception',
      factors: [
        {
          sourceType: 'trait',
          sourceId: 'trait_street_sense',
          label: '街头直觉',
          value: 6
        }
      ],
      effectiveTarget: 66,
      presetRoll: 42,
      outcome: 'success',
      margin: 24
    });
  });

  it('accepts each grounded trait, equipment, status, environment and preparation source', () => {
    const state = createInitialRuntimeState({
      traits: [
        {
          traitId: 'trait_street_sense',
          name: '街头直觉',
          source: 'opening',
          description: '熟悉街面异常。',
          effectSummary: '有助于观察。',
          scopes: ['action', 'armed'],
          status: 'active',
          visibility: 'player_known'
        }
      ]
    });
    state.assets.items.asset_baton = {
      itemId: 'asset_baton',
      category: 'equipment',
      name: '警棍',
      summary: '当前已经装备的执勤警棍。',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      visibility: 'player_known',
      importance: 30
    };
    state.assets.equippedItemIds = ['asset_baton'];
    const normalized = normalizeJudgementPreflight({
      value: {
        hasJudgement: true,
        reasonSummary: '需要在雨夜控制持棍目标。',
        category: 'armed',
        primaryAttribute: 'action',
        difficultyTier: 'dangerous',
        combatIntent: 'armed',
        factorProposals: [
          {
            sourceType: 'trait',
            sourceId: 'trait_street_sense',
            polarity: 'advantage',
            magnitude: 'minor',
            reason: '既有街面经验有助于预判动作。'
          },
          {
            sourceType: 'equipment',
            sourceId: 'asset_baton',
            polarity: 'advantage',
            magnitude: 'moderate',
            reason: '已经装备的警棍有助于保持控制距离。'
          },
          {
            sourceType: 'status',
            evidenceRef: {
              kind: 'player_vitals',
              refId: 'player_vitals'
            },
            polarity: 'advantage',
            magnitude: 'minor',
            reason: '玩家当前身体状态能够支持行动。'
          },
          {
            sourceType: 'environment',
            evidenceRef: {
              kind: 'current_weather',
              refId: 'current_weather'
            },
            polarity: 'disadvantage',
            magnitude: 'moderate',
            reason: '雨水令地面湿滑。'
          },
          {
            sourceType: 'preparation',
            evidenceRef: {
              kind: 'player_input',
              refId: 'current_input'
            },
            polarity: 'advantage',
            magnitude: 'minor',
            reason: '玩家明确先侧身避开再贴近控制。'
          }
        ]
      },
      turnId: 'turn_0001',
      gameTime: state.time
    });

    const envelope = resolveJudgementPreflight({
      state,
      preflight: normalized.preflight!,
      turnId: 'turn_0001',
      gameTime: state.time,
      presetRoll: 50
    });

    expect(envelope?.factors.map((factor) => factor.sourceType)).toEqual([
      'trait',
      'equipment',
      'status',
      'environment',
      'preparation'
    ]);
    expect(envelope?.diagnostics).toEqual([]);
  });

  it('rejects unsupported evidence and duplicate sources while keeping valid factors', () => {
    const state = createInitialRuntimeState({
      gameDifficulty: 'standard',
      attributes: {
        body: 50,
        action: 50,
        perception: 50,
        thinking: 50,
        negotiation: 50,
        will: 50
      },
      traits: [
        {
          traitId: 'trait_street_sense',
          name: '街头直觉',
          source: 'opening',
          description: '熟悉街面异常。',
          effectSummary: '有助于观察。',
          scopes: ['observation'],
          status: 'active',
          visibility: 'player_known'
        }
      ]
    });
    const normalized = normalizeJudgementPreflight({
      value: {
        hasJudgement: true,
        reasonSummary: '需要在混乱中识别目标。',
        category: 'observation',
        primaryAttribute: 'perception',
        difficultyTier: 'hard',
        combatIntent: 'none',
        factorProposals: [
          {
            sourceType: 'trait',
            sourceId: 'trait_street_sense',
            polarity: 'advantage',
            magnitude: 'minor',
            reason: '真实特质。'
          },
          {
            sourceType: 'trait',
            sourceId: 'trait_street_sense',
            polarity: 'advantage',
            magnitude: 'major',
            reason: '重复特质。'
          },
          {
            sourceType: 'environment',
            evidenceRef: {
              kind: 'current_place',
              refId: 'place_fictional'
            },
            polarity: 'advantage',
            magnitude: 'major',
            reason: '虚构环境。'
          },
          {
            sourceType: 'preparation',
            evidenceRef: {
              kind: 'player_input',
              refId: 'current_input'
            },
            polarity: 'advantage',
            magnitude: 'moderate',
            reason: '玩家本回合明确先观察再行动。'
          }
        ]
      },
      turnId: 'turn_0001',
      gameTime: state.time
    });
    const envelope = resolveJudgementPreflight({
      state,
      preflight: normalized.preflight!,
      turnId: 'turn_0001',
      gameTime: state.time,
      presetRoll: 50
    });

    expect(envelope?.factors).toEqual([
      expect.objectContaining({
        sourceId: 'trait_street_sense',
        value: 3
      }),
      expect.objectContaining({
        sourceType: 'preparation',
        sourceId: 'current_input',
        value: 6
      })
    ]);
    expect(
      envelope?.diagnostics.filter(
        (diagnostic) => diagnostic.code === 'judgement_evidence_rejected'
      )
    ).toHaveLength(2);
  });

  it('rejects an existing trait whose structured scope does not apply to the check', () => {
    const state = createInitialRuntimeState({
      attributes: {
        body: 50,
        action: 50,
        perception: 50,
        thinking: 60,
        negotiation: 50,
        will: 50
      },
      traits: [
        {
          traitId: 'trait_street_sense',
          name: '街面观察经验',
          source: 'opening',
          description: '熟悉街面异常痕迹。',
          effectSummary: '辨认街面风险时可能提供帮助。',
          scopes: ['observation'],
          status: 'active',
          visibility: 'player_known'
        }
      ]
    });
    const normalized = normalizeJudgementPreflight({
      value: {
        hasJudgement: true,
        reasonSummary: '需要比较三份记录并推断时序。',
        category: 'thinking',
        primaryAttribute: 'thinking',
        difficultyTier: 'standard',
        combatIntent: 'none',
        factorProposals: [
          {
            sourceType: 'trait',
            sourceId: 'trait_street_sense',
            polarity: 'advantage',
            magnitude: 'moderate',
            reason: '模型错误地把街面观察经验用于纯时序推理。'
          }
        ]
      },
      turnId: 'turn_0001',
      gameTime: state.time
    });

    const envelope = resolveJudgementPreflight({
      state,
      preflight: normalized.preflight!,
      turnId: 'turn_0001',
      gameTime: state.time,
      presetRoll: 50
    });

    expect(envelope?.factors).toEqual([]);
    expect(envelope?.diagnostics).toEqual([
      expect.objectContaining({
        code: 'judgement_evidence_rejected',
        message: expect.stringContaining('结构化作用域不适用于')
      })
    ]);
  });

  it('drops unknown target references with explicit diagnostics', () => {
    const state = createInitialRuntimeState();
    const normalized = normalizeJudgementPreflight({
      value: {
        hasJudgement: true,
        reasonSummary: '需要核对一份来历不明的命令。',
        title: '核对命令来源',
        category: 'thinking',
        primaryAttribute: 'thinking',
        difficultyTier: 'standard',
        targetActorId: 'actor_fictional',
        targetOrganizationId: 'organization_fictional',
        combatIntent: 'none',
        factorProposals: []
      },
      turnId: 'turn_0001',
      gameTime: state.time
    });

    const envelope = resolveJudgementPreflight({
      state,
      preflight: normalized.preflight!,
      turnId: 'turn_0001',
      gameTime: state.time,
      presetRoll: 50
    });

    expect(envelope?.canonicalCheck.relatedActorIds).toEqual([
      state.player.actorId
    ]);
    expect(
      envelope?.diagnostics.filter(
        (diagnostic) => diagnostic.code === 'judgement_evidence_rejected'
      )
    ).toEqual([
      expect.objectContaining({ path: ['targetActorId'] }),
      expect.objectContaining({ path: ['targetOrganizationId'] })
    ]);
  });

  it('requires only the missing semantic fields to be repaired', () => {
    const state = createInitialRuntimeState();
    const normalized = normalizeJudgementPreflight({
      value: {
        hasJudgement: true,
        reasonSummary: '行动存在真实风险。',
        category: 'unknown_category'
      },
      turnId: 'turn_0001',
      gameTime: state.time
    });

    expect(normalized.preflight).toBeUndefined();
    expect(normalized.missingFields).toEqual(
      expect.arrayContaining(['category', 'primaryAttribute', 'difficultyTier'])
    );
  });

  it('builds a small intent-only request without a roll or outcome', () => {
    const state = createInitialRuntimeState();
    const request = createJudgementPreflightRequest({
      state,
      context: selectContext(state, '我先抄录已经确认的值班编号。'),
      playerInput: '我先抄录已经确认的值班编号。'
    });
    const text = request.messages.map((message) => message.content).join('\n');

    expect(text).toContain('JUDGEMENT_PREFLIGHT');
    expect(text).toContain('playerInput=');
    expect(text).toContain('availableTraits');
    expect(text).toContain('equippedItems');
    expect(text).toContain('不得为了制造判定而自行添加');
    expect(text).toContain('已经核准且清晰可见的资料照抄');
    expect(text).toContain('thinking=比较既有事实、推理、分析与专业判断');
    expect(text).toContain('不描述失败后果有多严重');
    expect(text).toContain('不会仅因危险性自动成为 dangerous/extreme');
    expect(text).toContain('不得把存档 gameDifficulty 当成 difficultyTier');
    expect(text).toContain('来源真实存在');
    expect(text).toContain('室内文书、谈话或推理不得因为外面有天气而加减');
    expect(text).toContain('“状态正常”不是奖励');
    expect(text).toContain('不得返回 presetRoll');
    expect(text).not.toMatch(/d100=\d+/);
  });
});
