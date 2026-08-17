import { describe, expect, it } from 'vitest';
import type {
  NarratorClient,
  NarratorInput,
  NarratorStreamOptions
} from '../narrator/NarratorClient';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { RuntimeState } from '../runtime/types';
import { runPlayerTurn } from './TurnEngine';

function inputText(input: NarratorInput): string {
  return typeof input === 'string'
    ? input
    : input.messages.map((message) => message.content).join('\n');
}

class SequentialNarrator implements NarratorClient {
  readonly prompts: NarratorInput[] = [];
  readonly purposes: Array<NarratorStreamOptions['requestPurpose']> = [];
  readonly options: NarratorStreamOptions[] = [];

  constructor(private readonly responses: unknown[]) {}

  async complete(
    prompt: NarratorInput,
    options?: NarratorStreamOptions
  ): Promise<unknown> {
    this.prompts.push(prompt);
    this.purposes.push(options?.requestPurpose);
    this.options.push({ ...options });
    const response =
      this.responses[
        Math.min(this.prompts.length - 1, this.responses.length - 1)
      ];
    const rawText = JSON.stringify(response);
    const attemptId = `attempt_${this.prompts.length}`;
    const startedAt = new Date().toISOString();
    options?.onAttemptStart?.({
      attemptId,
      purpose: options?.requestPurpose ?? 'main_turn',
      stream: Boolean(options?.onTextDelta),
      requestedMaxTokens: options?.maxTokensOverride,
      startedAt
    });
    options?.onRawText?.(rawText);
    if (options?.requestPurpose === 'main_turn') {
      options?.onTextDelta?.(rawText);
    }
    options?.onAttempt?.({
      attemptId,
      purpose: options?.requestPurpose ?? 'main_turn',
      stream: Boolean(options?.onTextDelta),
      requestedMaxTokens: options?.maxTokensOverride,
      finishReason: 'stop',
      rawText,
      parseStatus: 'success',
      startedAt,
      finishedAt: new Date().toISOString()
    });
    return response;
  }
}

function createMainResponse(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    writebackVersion: '1.6',
    narrativeText: '【旁白】你按眼前事实完成行动，现场给出清楚回应。',
    turnSummary: '玩家完成了本回合行动。',
    suggestedActions: ['继续处理', '观察现场'],
    playerVitalsReview: {
      changed: false,
      reason: '本回合没有身体状态变化。'
    },
    timePatch: {
      elapsedMinutes: 5,
      reason: '处理当前行动。'
    },
    writeback: {},
    ...overrides
  };
}

function createJudgementPreflight(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    hasJudgement: true,
    reasonSummary: '行动结果存在真实不确定性，失败会改变后续局面。',
    title: '核对关键记录',
    category: 'thinking',
    primaryAttribute: 'thinking',
    difficultyTier: 'standard',
    stakesSummary: '成功能确认矛盾，失败会暂时接受错误口径。',
    combatIntent: 'none',
    factorProposals: [],
    ...overrides
  };
}

function createReportedCheck({
  outcome,
  presetRoll = 42,
  effectiveTarget = 50
}: {
  outcome: 'critical_success' | 'success' | 'partial_success' | 'failure' | 'critical_failure';
  presetRoll?: number;
  effectiveTarget?: number;
}) {
  return {
    rulesetVersion: 'v1.1-local-d100',
    checkId: 'check_turn_0001_1',
    turnId: 'turn_0001',
    gameTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: 21,
      minute: 30
    },
    title: '核对关键记录',
    category: 'thinking',
    relatedActorIds: ['player'],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    primaryAttribute: 'thinking',
    difficultyTier: 'standard',
    presetRoll,
    effectiveTarget,
    outcome,
    shortSummary: `模型回显结果为 ${outcome}。`,
    factors: [],
    visibility: 'player_known'
  };
}

describe('TurnEngine judgement preflight V2', () => {
  it('finishes a no-judgement turn without exposing or persisting the reserved roll', async () => {
    const state = createInitialRuntimeState();
    const narrator = new SequentialNarrator([
      {
        hasJudgement: false,
        reasonSummary: '只是抄录已确认资料，没有阻力或失败分支。',
        combatIntent: 'none',
        factorProposals: []
      },
      createMainResponse()
    ]);
    const attemptStarts: string[] = [];
    const completedAttempts: string[] = [];

    const next = await runPlayerTurn({
      state,
      playerInput: '我抄录已经确认的值班编号。',
      narrator,
      judgementRoll: 73,
      enableJudgementPreflight: true,
      onNarratorAttemptStart: (attempt) =>
        attemptStarts.push(`${attempt.attemptId}:${attempt.purpose}`),
      onNarratorAttempt: (attempt) =>
        completedAttempts.push(`${attempt.attemptId}:${attempt.purpose}`)
    });

    expect(narrator.purposes).toEqual([
      'main_turn_judgement_preflight',
      'main_turn'
    ]);
    expect(inputText(narrator.prompts[0])).not.toContain('d100=73');
    expect(inputText(narrator.prompts[1])).toContain('本回合不需要核心判定');
    expect(inputText(narrator.prompts[1])).not.toContain('presetRoll=73');
    expect(next.judgementChecks).toEqual({});
    expect(next.turnCounter).toBe(state.turnCounter + 1);
    expect(attemptStarts).toEqual([
      'attempt_1:main_turn_judgement_preflight',
      'attempt_2:main_turn'
    ]);
    expect(completedAttempts).toEqual(attemptStarts);
  });

  it('settles once before narration and injects the canonical check when the model omits its echo', async () => {
    const state = createInitialRuntimeState({
      gameDifficulty: 'standard',
      attributes: {
        body: 50,
        action: 50,
        perception: 50,
        thinking: 60,
        negotiation: 50,
        will: 50
      }
    });
    const narrator = new SequentialNarrator([
      createJudgementPreflight(),
      createMainResponse({
        narrativeText: '【旁白】你逐项核对记录，成功找出两处互相矛盾的时间。',
        turnSummary: '玩家成功确认记录矛盾。'
      })
    ]);
    const stages: string[] = [];
    let latestTrace:
      | Parameters<
          NonNullable<
            Parameters<typeof runPlayerTurn>[0]['onJudgementRecoveryTrace']
          >
        >[0]
      | undefined;

    const next = await runPlayerTurn({
      state,
      playerInput: '我核对两份互相矛盾的值班记录。',
      narrator,
      judgementRoll: 42,
      enableJudgementPreflight: true,
      onStageChange: (stage) => stages.push(stage),
      onJudgementRecoveryTrace: (trace) => {
        latestTrace = trace;
      }
    });

    expect(narrator.purposes).toEqual([
      'main_turn_judgement_preflight',
      'main_turn'
    ]);
    expect(inputText(narrator.prompts[1])).toContain(
      '判定已经由本地系统在正文生成前完成'
    );
    expect(inputText(narrator.prompts[1])).toContain('presetRoll=42');
    expect(inputText(narrator.prompts[1])).toContain('effectiveTarget=60');
    expect(inputText(narrator.prompts[1])).toContain('outcome=success');
    expect(next.judgementChecks.check_turn_0001_1).toMatchObject({
      presetRoll: 42,
      effectiveTarget: 60,
      outcome: 'success',
      score: 42,
      difficulty: 60,
      margin: 18
    });
    expect(stages.indexOf('preflighting_judgement')).toBeLessThan(
      stages.indexOf('generating_narrative')
    );
    expect(latestTrace?.stages.map((stage) => stage.stage)).toEqual(
      expect.arrayContaining([
        'preflight_parse',
        'evidence_validation',
        'local_settlement',
        'raw_parse',
        'final_validation'
      ])
    );
  });

  it('repairs only an invalid preflight before making the first narrative request', async () => {
    const state = createInitialRuntimeState();
    const narrator = new SequentialNarrator([
      {
        hasJudgement: true,
        reasonSummary: '存在风险。'
      },
      createJudgementPreflight(),
      createMainResponse()
    ]);

    const next = await runPlayerTurn({
      state,
      playerInput: '我判断记录是否被人改过。',
      narrator,
      judgementRoll: 50,
      enableJudgementPreflight: true
    });

    expect(narrator.purposes).toEqual([
      'main_turn_judgement_preflight',
      'main_turn_judgement_preflight_repair',
      'main_turn'
    ]);
    expect(inputText(narrator.prompts[1])).toContain(
      'JUDGEMENT_PREFLIGHT_REPAIR'
    );
    expect(narrator.purposes.filter((purpose) => purpose === 'main_turn')).toHaveLength(
      1
    );
    expect(next.judgementChecks.check_turn_0001_1.presetRoll).toBe(50);
  });

  it('uses the bounded 8192-token stage budget for preflight and its focused repair', async () => {
    const narrator = new SequentialNarrator([
      {
        hasJudgement: true,
        reasonSummary: '存在风险。'
      },
      createJudgementPreflight(),
      createMainResponse()
    ]);

    await runPlayerTurn({
      state: createInitialRuntimeState(),
      playerInput: '我判断记录是否被人改过。',
      narrator,
      judgementRoll: 50,
      enableJudgementPreflight: true
    });

    expect(narrator.options[0]).toMatchObject({
      requestPurpose: 'main_turn_judgement_preflight',
      stageMaxTokens: 8_192
    });
    expect(narrator.options[0].maxTokensOverride).toBeUndefined();
    expect(narrator.options[1]).toMatchObject({
      requestPurpose: 'main_turn_judgement_preflight_repair',
      stageMaxTokens: 8_192
    });
    expect(narrator.options[1].maxTokensOverride).toBeUndefined();
    expect(narrator.options[2].stageMaxTokens).toBeUndefined();
  });

  it('stops atomically when the small preflight repair is still incomplete', async () => {
    const state = createInitialRuntimeState();
    const originalState: RuntimeState = structuredClone(state);
    const narrator = new SequentialNarrator([
      {
        hasJudgement: true,
        reasonSummary: '存在风险。'
      },
      {
        hasJudgement: true,
        reasonSummary: '仍然缺少核心语义。'
      }
    ]);

    await expect(
      runPlayerTurn({
        state,
        playerInput: '我判断记录是否被人改过。',
        narrator,
        judgementRoll: 73,
        enableJudgementPreflight: true
      })
    ).rejects.toThrow('judgement_intent_failed');

    expect(narrator.purposes).toEqual([
      'main_turn_judgement_preflight',
      'main_turn_judgement_preflight_repair'
    ]);
    expect(narrator.purposes).not.toContain('main_turn');
    expect(state).toEqual(originalState);
  });

  it('uses only the minimal narrative repair when a model echo contradicts the pre-set outcome', async () => {
    const state = createInitialRuntimeState({
      gameDifficulty: 'standard',
      attributes: {
        body: 50,
        action: 50,
        perception: 50,
        thinking: 50,
        negotiation: 50,
        will: 50
      }
    });
    const narrator = new SequentialNarrator([
      createJudgementPreflight(),
      createMainResponse({
        narrativeText: '【旁白】你没能找出记录里的矛盾。',
        turnSummary: '玩家核对失败。',
        writeback: {
          judgementCheckPatches: [
            {
              ...createReportedCheck({
                outcome: 'failure',
                presetRoll: 99,
                effectiveTarget: 5
              }),
              category: 'unmapped_category',
              effectiveTarget: 'not-a-number'
            }
          ],
          assetPatch: {
            upsertItems: [
              {
                itemId: 'asset_preflight_preserved',
                category: 'document',
                name: '值班记录副本',
                summary: '首份主叙事建立的资产写回。'
              }
            ]
          }
        }
      }),
      {
        narrativeText: '【旁白】你成功找出记录里的两处矛盾。',
        turnSummary: '玩家成功完成核对。',
        judgementSummaries: [
          {
            checkId: 'check_turn_0001_1',
            shortSummary: '本地判定成功，玩家确认了矛盾。'
          }
        ],
        combatSummaries: []
      }
    ]);
    const stages: string[] = [];

    const next = await runPlayerTurn({
      state,
      playerInput: '我核对两份互相矛盾的值班记录。',
      narrator,
      judgementRoll: 42,
      enableJudgementPreflight: true,
      onStageChange: (stage) => stages.push(stage)
    });

    expect(narrator.purposes).toEqual([
      'main_turn_judgement_preflight',
      'main_turn',
      'main_turn_judgement_narrative_repair'
    ]);
    expect(narrator.purposes.filter((purpose) => purpose === 'main_turn')).toHaveLength(
      1
    );
    expect(stages).toContain('repairing_judgement_narrative');
    expect(stages).not.toContain('regenerating_judgement');
    expect(next.judgementChecks.check_turn_0001_1).toMatchObject({
      presetRoll: 42,
      effectiveTarget: 50,
      outcome: 'success'
    });
    expect(next.assets.items.asset_preflight_preserved.name).toBe(
      '值班记录副本'
    );
    expect(next.storyLog.at(-1)?.text).toContain('成功找出');
  });

  it('fails atomically when the minimal narrative repair is invalid without regenerating the full turn', async () => {
    const state = createInitialRuntimeState({
      gameDifficulty: 'standard',
      attributes: {
        body: 50,
        action: 50,
        perception: 50,
        thinking: 50,
        negotiation: 50,
        will: 50
      }
    });
    const originalState: RuntimeState = structuredClone(state);
    const narrator = new SequentialNarrator([
      createJudgementPreflight(),
      createMainResponse({
        narrativeText: '【旁白】你没能找出记录里的矛盾。',
        turnSummary: '玩家核对失败。',
        writeback: {
          judgementCheckPatches: [
            createReportedCheck({
              outcome: 'failure',
              presetRoll: 99,
              effectiveTarget: 5
            })
          ],
          assetPatch: {
            upsertItems: [
              {
                itemId: 'asset_must_not_persist',
                category: 'document',
                name: '未提交的值班记录',
                summary: '叙事校正失败时不得写入。'
              }
            ]
          }
        }
      }),
      {
        narrativeText: 123,
        turnSummary: null,
        judgementSummaries: []
      }
    ]);
    const stages: string[] = [];

    await expect(
      runPlayerTurn({
        state,
        playerInput: '我核对两份互相矛盾的值班记录。',
        narrator,
        judgementRoll: 42,
        enableJudgementPreflight: true,
        onStageChange: (stage) => stages.push(stage)
      })
    ).rejects.toThrow('judgement_narrative_repair_failed');

    expect(narrator.purposes).toEqual([
      'main_turn_judgement_preflight',
      'main_turn',
      'main_turn_judgement_narrative_repair'
    ]);
    expect(narrator.purposes.filter((purpose) => purpose === 'main_turn')).toHaveLength(
      1
    );
    expect(stages).toContain('repairing_judgement_narrative');
    expect(stages).not.toContain('regenerating_judgement');
    expect(state).toEqual(originalState);
    expect(state.assets.items.asset_must_not_persist).toBeUndefined();
  });

  it('uses the configured auxiliary route only for preflight and keeps the main narrator for prose', async () => {
    const state = createInitialRuntimeState();
    const mainNarrator = new SequentialNarrator([createMainResponse()]);
    const auxiliaryNarrator = new SequentialNarrator([
      {
        hasJudgement: false,
        reasonSummary: '只是把已经确认的号码抄到表格中。',
        combatIntent: 'none',
        factorProposals: []
      }
    ]);

    await runPlayerTurn({
      state,
      playerInput: '我把已经确认的号码抄到表格中。',
      narrator: mainNarrator,
      auxiliaryGeneration: auxiliaryNarrator,
      auxiliaryGenerationMode: 'custom',
      judgementRoll: 50,
      enableJudgementPreflight: true
    });

    expect(auxiliaryNarrator.purposes.filter(Boolean)).toEqual([
      'main_turn_judgement_preflight'
    ]);
    expect(mainNarrator.purposes).toEqual(['main_turn']);
  });

  it('binds one required combat event to the preflight canonical check', async () => {
    const state = createInitialRuntimeState();
    const narrator = new SequentialNarrator([
      createJudgementPreflight({
        title: '近身制服',
        category: 'armed',
        primaryAttribute: 'action',
        difficultyTier: 'hard',
        combatIntent: 'armed'
      }),
      createMainResponse({
        narrativeText: '【旁白】你依照本地结果与持刀者完成一次近身交锋。',
        turnSummary: '玩家完成近身交锋。',
        writeback: {
          combatEventPatches: [
            {
              combatId: 'combat_preflight_1',
              turnId: 'turn_0001',
              gameTime: {
                year: 1988,
                month: 9,
                day: 12,
                hour: 21,
                minute: 30
              },
              title: '室内持械冲突',
              type: 'armed',
              locationId: state.location.currentPlaceId,
              participants: [
                {
                  actorId: 'player',
                  name: '玩家',
                  side: 'player',
                  roleSummary: '执行控制'
                }
              ],
              outcome: 'wounded_grappling',
              intensity: 60,
              combatText: '双方在狭窄室内近身交锋，玩家依照本地判定结果完成动作转折。',
              judgementCheckIds: [],
              relatedActorIds: ['player'],
              relatedPlaceIds: [],
              relatedCaseIds: [],
              visibility: 'player_known',
              unread: true
            }
          ]
        }
      })
    ]);

    const next = await runPlayerTurn({
      state,
      playerInput: '我贴近并控制持刀者。',
      narrator,
      judgementRoll: 50,
      enableJudgementPreflight: true
    });

    expect(next.combatEvents.combat_preflight_1.judgementCheckIds).toEqual([
      'check_turn_0001_1'
    ]);
    expect(next.combatEvents.combat_preflight_1.outcome).toBe(
      'player_wounded'
    );
    expect(next.combatEvents.combat_preflight_1.locationSummary).toBe(
      state.places[state.location.currentPlaceId].name
    );
    expect(next.combatEvents.combat_preflight_1.createdAt).toEqual(
      next.combatEvents.combat_preflight_1.gameTime
    );
    expect(next.judgementChecks.check_turn_0001_1.relatedCombatEventId).toBe(
      'combat_preflight_1'
    );
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'combat_event_structure_recovered'
        }),
        expect.objectContaining({
          code: 'combat_event_local_normalized',
          path: expect.arrayContaining(['locationSummary'])
        }),
        expect.objectContaining({
          code: 'combat_event_local_normalized',
          path: expect.arrayContaining(['createdAt'])
        }),
        expect.objectContaining({
          code: 'combat_event_local_normalized',
          path: expect.arrayContaining(['outcome'])
        }),
        expect.objectContaining({
          code: 'combat_event_local_normalized',
          path: expect.arrayContaining(['resultSummary'])
        }),
        expect.objectContaining({
          code: 'combat_event_local_normalized',
          path: expect.arrayContaining(['consequenceSummary'])
        })
      ])
    );
  });
});
