import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { CurrentMatter } from '../runtime/types';
import { narratorResponseSchema, type NarratorResponse } from '../writeback/schema';
import { defaultDramaticContentSettings, resolveDramaMaterialBudget } from './settings';
import { applyNarrativeArcProgress } from './narrativeArc';
import {
  reconcileDramaExecutionTraceAfterWriteback,
  validateDramaExecutionTrace
} from './trace';
import type { DramaPlan, DramaPlanningContext, PlanningSource } from './types';

const source: PlanningSource = {
  ref: {
    providerId: 'runtime-dynamic',
    sourceType: 'current_matter',
    sourceId: 'matter_1'
  },
  title: '待处理事项',
  plannerSummary: '既有事项',
  sourceStatus: 'active_process',
  reusePolicy: 'context_reusable',
  priorityClass: 'normal',
  channelIds: ['cases_law'],
  softAffinities: {},
  mandatory: false,
  score: 1,
  relatedActorIds: [],
  relatedOrganizationIds: [],
  relatedPlaceIds: [],
  relatedCaseIds: []
};

const settings = {
  ...defaultDramaticContentSettings,
  pacing: 'balanced' as const
};

const context: DramaPlanningContext = {
  planningScope: 'turn',
  planningMode: 'full',
  turnCounter: 4,
  currentTime: { year: 1984, month: 12, day: 28, hour: 12, minute: 0 },
  playerInput: '继续',
  playerRoleContext: {
    identity: 'police',
    publicRole: '警员',
    stableContactActorIds: [],
    activeMatterIds: []
  },
  currentPlaceId: 'place_mong_kok_police_station',
  settings,
  pacing: 'balanced',
  materialBudget: resolveDramaMaterialBudget(settings),
  recentTurnSummaries: [],
  requiredContextSources: [source],
  userPrioritySources: [],
  optionalDynamicSources: [],
  staticSeedSources: [],
  recentExecutions: [],
  filterRuleIds: []
};

const plan: DramaPlan = {
  planId: 'drama_plan_turn_4',
  planningScope: 'turn',
  mode: 'continue_existing',
  primarySource: source.ref,
  supportSources: [],
  sceneFunction: 'pressure',
  intensity: 'medium',
  playerMayIgnore: true,
  maxNewActors: 0,
  reasonSummary: '延续当前已经存在的事项。'
};

const customEventSource: PlanningSource = {
  ...source,
  ref: {
    providerId: 'custom-event-group',
    sourceType: 'custom_event_group_instance',
    sourceId: 'event-instance:seal'
  },
  title: '封条异常',
  sourceStatus: 'active_process',
  reusePolicy: 'context_reusable',
  channelIds: ['custom_events']
};

const customEventContext: DramaPlanningContext = {
  ...context,
  requiredContextSources: [customEventSource]
};

const customEventPlan: DramaPlan = {
  ...plan,
  primarySource: customEventSource.ref
};

function response(trace: NarratorResponse['dramaExecutionTrace']): NarratorResponse {
  const parsed = narratorResponseSchema.parse({
    writebackVersion: '1.0',
    narrativeText: '正文',
    turnSummary: '摘要',
    suggestedActions: []
  });
  const writeback = parsed.writeback;
  writeback.currentMatterPatches.push({
    id: 'matter_1',
    status: 'active'
  });
  return {
    writebackVersion: '1.0',
    narrativeText: '正文',
    turnSummary: '摘要',
    suggestedActions: [],
    dramaExecutionTrace: trace,
    writeback
  };
}

describe('dramatic execution trace validation', () => {
  it('records a missing trace without rejecting the narrator response', () => {
    const result = validateDramaExecutionTrace({
      response: response(undefined),
      context,
      plan
    });

    expect(result.trace).toBeUndefined();
    expect(result.diagnostics).toEqual([{
      code: 'execution_trace_missing',
      message: '主叙事没有返回本回合的 DramaExecutionTrace；正文与合法写回已保留。',
      turnCounter: 4
    }]);
  });

  it('recovers a selected official DLC source as texture when the model omits its trace', () => {
    const officialSource: PlanningSource = {
      ...source,
      ref: {
        providerId: 'official-dlc',
        sourceType: 'official_dlc_event',
        sourceId: 'official_dlc_urban_legends_hk1988_vacant_flat_calls',
        dlcId: 'urban_legends'
      },
      title: '空屋来电',
      sourceStatus: 'static_seed',
      priorityClass: 'user_requested'
    };
    const officialContext: DramaPlanningContext = {
      ...context,
      planningMode: 'official_dlc_only',
      requiredContextSources: [],
      officialDlcSources: [officialSource]
    };
    const officialPlan: DramaPlan = {
      ...plan,
      mode: 'foreshadow',
      primarySource: officialSource.ref,
      sceneFunction: 'foreshadow',
      intensity: 'low'
    };

    const result = validateDramaExecutionTrace({
      response: response(undefined),
      context: officialContext,
      plan: officialPlan
    });

    expect(result.trace).toEqual({
      planId: officialPlan.planId,
      status: 'used_as_texture',
      usedSourceRefs: [officialSource.ref],
      resultingWritebackRefs: []
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'execution_trace_missing',
      'execution_trace_official_dlc_exposure_recovered'
    ]);
  });

  it('accepts a persistent trace only when source and writeback both exist this turn', () => {
    const trace = {
      planId: 'drama_plan_turn_4',
      status: 'used_persistently' as const,
      usedSourceRefs: [source.ref],
      resultingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }]
    };
    expect(validateDramaExecutionTrace({ response: response(trace), context, plan })).toEqual({
      trace,
      diagnostics: []
    });
  });

  it('preserves official DLC provenance in a persistent execution trace', () => {
    const officialRef = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: 'urban_legends_alpha:midnight_bus',
      dlcId: 'urban_legends_alpha'
    };
    const officialPlan = {
      ...plan,
      primarySource: officialRef
    };
    const result = validateDramaExecutionTrace({
      response: response({
        planId: 'drama_plan_turn_4',
        status: 'used_persistently',
        usedSourceRefs: [officialRef],
        resultingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }]
      }),
      context: {
        ...context,
        planningMode: 'official_dlc_only',
        planningRoute: 'official_dlc_only',
        requiredContextSources: [],
        officialDlcSources: [{
          ...source,
          ref: officialRef,
          title: '午夜末班车',
          plannerSummary: '夜间巴士传闻。',
          channelIds: ['city_news'],
          priorityClass: 'user_requested'
        }]
      },
      plan: officialPlan
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.trace?.usedSourceRefs).toEqual([officialRef]);
  });

  it('ignores a mismatched plan without validating unrelated trace fields', () => {
    const result = validateDramaExecutionTrace({
      response: response({
        planId: 'wrong',
        status: 'used_persistently',
        usedSourceRefs: [source.ref],
        resultingWritebackRefs: [{ kind: 'signal', id: 'missing' }]
      }),
      context,
      plan
    });

    expect(result.trace).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'execution_trace_plan_mismatch'
    ]);
  });

  it('keeps the valid trace subset when individual source or writeback refs are invalid', () => {
    const result = validateDramaExecutionTrace({
      response: response({
        planId: 'drama_plan_turn_4',
        status: 'used_persistently',
        usedSourceRefs: [
          source.ref,
          {
            providerId: 'runtime-dynamic',
            sourceType: 'current_matter',
            sourceId: 'matter_missing'
          }
        ],
        resultingWritebackRefs: [
          { kind: 'current_matter', id: 'matter_1' },
          { kind: 'signal', id: 'missing' }
        ]
      }),
      context,
      plan
    });

    expect(result.trace).toEqual({
      planId: 'drama_plan_turn_4',
      status: 'used_persistently',
      usedSourceRefs: [source.ref],
      resultingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }]
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'execution_trace_source_missing',
      'execution_trace_writeback_missing'
    ]);
  });

  it('counts an actor memory as a persistent writeback receipt', () => {
    const narratorResponse = response({
      planId: 'drama_plan_turn_4',
      status: 'used_persistently',
      usedSourceRefs: [source.ref],
      resultingWritebackRefs: [{ kind: 'actor_memory', id: 'npc_editor' }]
    });
    narratorResponse.writeback.actorMemories.push({
      actorId: 'npc_editor',
      actorName: '刘编辑',
      text: '记住玩家交回了核实后的稿件。',
      importance: 60,
      visibility: 'player_known'
    });

    expect(validateDramaExecutionTrace({
      response: narratorResponse,
      context,
      plan
    })).toEqual({
      trace: {
        planId: 'drama_plan_turn_4',
        status: 'used_persistently',
        usedSourceRefs: [source.ref],
        resultingWritebackRefs: [{ kind: 'actor_memory', id: 'npc_editor' }]
      },
      diagnostics: []
    });
  });

  it('accepts JSON writeback property aliases and stores canonical kinds', () => {
    const narratorResponse = response({
      planId: 'drama_plan_turn_4',
      status: 'used_persistently',
      usedSourceRefs: [source.ref],
      resultingWritebackRefs: [
        { kind: 'currentMatterPatches', id: 'matter_1' },
        { kind: 'actorMemories', id: 'npc_editor' }
      ]
    });
    narratorResponse.writeback.actorMemories.push({
      actorId: 'npc_editor',
      actorName: '刘编辑',
      text: '记住玩家交回了核实后的稿件。',
      importance: 60,
      visibility: 'player_known'
    });

    expect(validateDramaExecutionTrace({
      response: narratorResponse,
      context,
      plan
    })).toEqual({
      trace: {
        planId: 'drama_plan_turn_4',
        status: 'used_persistently',
        usedSourceRefs: [source.ref],
        resultingWritebackRefs: [
          { kind: 'current_matter', id: 'matter_1' },
          { kind: 'actor_memory', id: 'npc_editor' }
        ]
      },
      diagnostics: []
    });
  });

  it('still rejects unknown writeback kind aliases', () => {
    const result = validateDramaExecutionTrace({
      response: response({
        planId: 'drama_plan_turn_4',
        status: 'used_persistently',
        usedSourceRefs: [source.ref],
        resultingWritebackRefs: [{ kind: 'inventedMatterPatches', id: 'matter_1' }]
      }),
      context,
      plan
    });

    expect(result.trace).toEqual({
      planId: 'drama_plan_turn_4',
      status: 'used_as_texture',
      usedSourceRefs: [source.ref],
      resultingWritebackRefs: []
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'execution_trace_writeback_missing',
      'execution_trace_status_invalid'
    ]);
  });

  it('ignores a trace when no validated plan exists', () => {
    const result = validateDramaExecutionTrace({
      response: response({
        planId: 'drama_plan_turn_4',
        status: 'used_as_texture',
        usedSourceRefs: [source.ref],
        resultingWritebackRefs: []
      }),
      context
    });

    expect(result.trace).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'execution_trace_plan_mismatch'
    ]);
  });

  it('removes a submitted writeback ref when it did not survive runtime application', () => {
    const before = createInitialRuntimeState();
    const trace = {
      planId: 'drama_plan_turn_4',
      status: 'used_persistently' as const,
      usedSourceRefs: [source.ref],
      resultingWritebackRefs: [{ kind: 'current_matter', id: 'matter_rejected' }]
    };
    const result = reconcileDramaExecutionTraceAfterWriteback({
      stateBeforeWriteback: before,
      stateAfterWriteback: {
        ...before,
        turnCounter: 1
      },
      trace
    });

    expect(result.trace).toEqual({
      ...trace,
      status: 'used_as_texture',
      resultingWritebackRefs: []
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'execution_trace_writeback_not_applied',
        turnCounter: 1
      })
    ]);
  });

  it('keeps only writeback refs that materially changed the applied runtime state', () => {
    const before = createInitialRuntimeState();
    const matter: CurrentMatter = {
      id: 'matter_applied',
      title: '已落地事项',
      summary: '结构化事项已经进入运行时。',
      status: 'active',
      priority: 80,
      visibility: 'known',
      source: 'test',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: { ...before.time },
      updatedAt: { ...before.time }
    };
    const after = {
      ...before,
      turnCounter: 1,
      dynamicEvents: {
        ...before.dynamicEvents,
        currentMatters: {
          ...before.dynamicEvents.currentMatters,
          [matter.id]: matter
        }
      }
    };
    const trace = {
      planId: 'drama_plan_turn_4',
      status: 'used_persistently' as const,
      usedSourceRefs: [source.ref],
      resultingWritebackRefs: [
        { kind: 'current_matter', id: matter.id },
        { kind: 'signal', id: 'signal_rejected' }
      ]
    };
    const result = reconcileDramaExecutionTraceAfterWriteback({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      trace
    });

    expect(result.trace).toEqual({
      ...trace,
      resultingWritebackRefs: [
        { kind: 'current_matter', id: matter.id }
      ]
    });
    expect(result.diagnostics[0]?.code).toBe(
      'execution_trace_writeback_not_applied'
    );
  });

  it('keeps a bounded custom-event progress receipt and canonicalizes its refs', () => {
    const narratorResponse = response({
      planId: 'drama_plan_turn_4',
      status: 'used_persistently',
      usedSourceRefs: [customEventSource.ref],
      resultingWritebackRefs: [
        { kind: 'currentMatterPatches', id: 'matter_1' }
      ],
      customEventProgress: [
        {
          instanceId: 'event-instance:seal',
          stageId: 'stage-discovery',
          usedNodeIds: ['node-check-ledger'],
          decision: 'advance',
          nextStageId: 'stage-investigation',
          supportingWritebackRefs: [
            { kind: 'currentMatterPatches', id: 'matter_1' }
          ],
          factStateChanges: [
            {
              factId: 'fact-ledger-tampered',
              state: 'established_in_save',
              supportingWritebackRefs: [
                { kind: 'currentMatterPatches', id: 'matter_1' }
              ]
            }
          ]
        }
      ]
    });

    const result = validateDramaExecutionTrace({
      response: narratorResponse,
      context: customEventContext,
      plan: customEventPlan
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.trace?.customEventProgress).toEqual([
      expect.objectContaining({
        instanceId: 'event-instance:seal',
        decision: 'advance',
        supportingWritebackRefs: [
          { kind: 'current_matter', id: 'matter_1' }
        ],
        factStateChanges: [
          expect.objectContaining({
            supportingWritebackRefs: [
              { kind: 'current_matter', id: 'matter_1' }
            ]
          })
        ]
      })
    ]);
  });

  it('keeps custom-event progress when its actor evidence is applied through a stable alias', () => {
    const temporaryActorId = 'npc_custom_event_temporary';
    const canonicalActorId = 'npc_custom_event_canonical';
    const initial = createInitialRuntimeState();
    const actorTemplate = Object.values(initial.actors)[0]!;
    const before = {
      ...initial,
      actors: {
        ...initial.actors,
        [canonicalActorId]: {
          ...actorTemplate,
          actorId: canonicalActorId,
          profileSummary: '尚未进入长期事件。'
        }
      }
    };
    const after = {
      ...before,
      actors: {
        ...before.actors,
        [canonicalActorId]: {
          ...before.actors[canonicalActorId],
          profileSummary: '已成为长期事件的可靠证人。'
        }
      },
      actorIdAliases: {
        ...(before.actorIdAliases ?? {}),
        [temporaryActorId]: canonicalActorId
      }
    };
    const result = reconcileDramaExecutionTraceAfterWriteback({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      trace: {
        planId: 'drama_plan_turn_4',
        status: 'used_persistently',
        usedSourceRefs: [customEventSource.ref],
        resultingWritebackRefs: [{ kind: 'actor', id: temporaryActorId }],
        customEventProgress: [{
          instanceId: 'event-instance:seal',
          stageId: 'stage-discovery',
          usedNodeIds: ['node-check-ledger'],
          decision: 'advance',
          nextStageId: 'stage-investigation',
          supportingWritebackRefs: [{ kind: 'actor', id: temporaryActorId }],
          factStateChanges: [{
            factId: 'fact-witness-confirmed',
            state: 'established_in_save',
            supportingWritebackRefs: [{ kind: 'actor', id: temporaryActorId }]
          }]
        }]
      }
    });

    expect(result.trace?.customEventProgress).toEqual([
      expect.objectContaining({
        instanceId: 'event-instance:seal',
        supportingWritebackRefs: [{ kind: 'actor', id: canonicalActorId }],
        factStateChanges: [expect.objectContaining({
          supportingWritebackRefs: [{ kind: 'actor', id: canonicalActorId }]
        })]
      })
    ]);
  });

  it('drops custom-event progress that claims another source or unrelated writeback', () => {
    const result = validateDramaExecutionTrace({
      response: response({
        planId: 'drama_plan_turn_4',
        status: 'used_persistently',
        usedSourceRefs: [customEventSource.ref],
        resultingWritebackRefs: [
          { kind: 'current_matter', id: 'matter_1' }
        ],
        customEventProgress: [
          {
            instanceId: 'event-instance:other',
            stageId: 'stage-discovery',
            usedNodeIds: [],
            decision: 'stay',
            supportingWritebackRefs: [
              { kind: 'current_matter', id: 'matter_1' }
            ],
            factStateChanges: []
          },
          {
            instanceId: 'event-instance:seal',
            stageId: 'stage-discovery',
            usedNodeIds: [],
            decision: 'stay',
            supportingWritebackRefs: [
              { kind: 'signal', id: 'signal-unrelated' }
            ],
            factStateChanges: []
          }
        ]
      }),
      context: customEventContext,
      plan: customEventPlan
    });

    expect(result.trace?.customEventProgress).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'execution_trace_custom_progress_invalid'
      })
    ]);
  });

  it('rejects advance progress without a next stage while preserving the response', () => {
    const parsed = narratorResponseSchema.parse({
        writebackVersion: '1.0',
        narrativeText: '正文',
        turnSummary: '摘要',
        suggestedActions: [],
        dramaExecutionTrace: {
          planId: 'drama_plan_turn_4',
          status: 'used_persistently',
          usedSourceRefs: [customEventSource.ref],
          resultingWritebackRefs: [
            { kind: 'current_matter', id: 'matter_1' }
          ],
          customEventProgress: [
            {
              instanceId: 'event-instance:seal',
              stageId: 'stage-discovery',
              usedNodeIds: [],
              decision: 'advance',
              supportingWritebackRefs: [
                { kind: 'current_matter', id: 'matter_1' }
              ],
              factStateChanges: []
            }
          ]
        }
      });
    expect(parsed.dramaExecutionTrace).toMatchObject({
      planId: 'drama_plan_turn_4',
      status: 'used_persistently',
      customEventProgress: []
    });
    expect(parsed.validationWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'custom_event_progress_schema_invalid'
        })
      ])
    );
  });

  it('validates and carries a persistent narrative arc progress receipt', () => {
    const officialRef = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: 'urban_legends_alpha:midnight_bus',
      dlcId: 'urban_legends_alpha'
    };
    const officialSource: PlanningSource = {
      ...source,
      ref: officialRef,
      title: '午夜末班车',
      plannerSummary: '夜间巴士传闻。',
      channelIds: ['city_news'],
      priorityClass: 'user_requested',
      arcKey: 'official-dlc:urban_legends_alpha:midnight_bus',
      arcProgressContract: {
        stageIds: ['street_rumor', 'first_clues'],
        nodeIdsByStage: { street_rumor: ['rumor_node'], first_clues: ['clue_node'] },
        allowedNextStageIds: { street_rumor: ['first_clues'], first_clues: [] }
      }
    };
    const officialPlan = {
      ...plan,
      primarySource: officialRef
    };
    const narratorResponse = response({
      planId: 'drama_plan_turn_4',
      status: 'used_persistently',
      usedSourceRefs: [officialRef],
      resultingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }],
      narrativeArcProgress: [{
        arcInstanceId: 'official_dlc_urban_legends_alpha_midnight_bus',
        sourceRef: officialRef,
        decision: 'remain',
        currentStageId: 'street_rumor',
        usedNodeIds: ['rumor_node'],
        supportingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }],
        summary: '街坊开始谈论夜间巴士。'
      }]
    });
    const result = validateDramaExecutionTrace({
      response: narratorResponse,
      context: {
        ...context,
        planningMode: 'official_dlc_only',
        planningRoute: 'official_dlc_only',
        requiredContextSources: [],
        officialDlcSources: [officialSource]
      },
      plan: officialPlan
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.trace?.narrativeArcProgress).toEqual([
      expect.objectContaining({
        arcInstanceId: 'arc_official-dlc_urban_legends_alpha_midnight_bus',
        decision: 'remain',
        currentStageId: 'street_rumor',
        supportingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }]
      })
    ]);
  });

  it('returns post-writeback arc audits without turning accepted progress into an error', () => {
    const officialRef = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: 'urban_legends_alpha:midnight_bus',
      dlcId: 'urban_legends_alpha'
    };
    const officialSource: PlanningSource = {
      ...source,
      ref: officialRef,
      title: '午夜末班车',
      arcProgressContract: {
        stageIds: ['street_rumor', 'first_clues'],
        nodeIdsByStage: { street_rumor: ['rumor_node'], first_clues: ['clue_node'] },
        allowedNextStageIds: { street_rumor: ['first_clues'], first_clues: [] }
      }
    };
    const officialContext = {
      ...context,
      planningMode: 'official_dlc_only' as const,
      planningRoute: 'official_dlc_only' as const,
      requiredContextSources: [officialSource],
      officialDlcSources: []
    };
    const officialPlan = { ...plan, primarySource: officialRef };
    const trace = {
      planId: 'drama_plan_turn_4',
      status: 'used_persistently' as const,
      usedSourceRefs: [officialRef],
      resultingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }],
      narrativeArcProgress: [{
        arcInstanceId: 'arc_midnight_bus',
        sourceRef: officialRef,
        decision: 'remain' as const,
        currentStageId: 'street_rumor',
        usedNodeIds: ['rumor_node'],
        supportingWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }]
      }]
    };
    const before = createInitialRuntimeState();
    const matter: CurrentMatter = {
      id: 'matter_1',
      title: '已落地事项',
      summary: '结构化事项已经进入运行时。',
      status: 'active',
      priority: 80,
      visibility: 'known',
      source: 'test',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: { ...before.time },
      updatedAt: { ...before.time }
    };
    const after = {
      ...before,
      dynamicEvents: {
        ...before.dynamicEvents,
        currentMatters: { ...before.dynamicEvents.currentMatters, [matter.id]: matter }
      }
    };
    const result = reconcileDramaExecutionTraceAfterWriteback({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      trace,
      context: officialContext,
      plan: officialPlan,
      existingNarrativeArcs: [],
      includeNarrativeArcProgressAudit: true,
      requestId: 'request_test',
      turnId: 'turn_test'
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.narrativeArcProgressAudits?.[0]).toEqual(expect.objectContaining({
      classification: 'remain',
      accepted: true,
      turnId: 'turn_test',
      supportingWritebackRefs: [expect.objectContaining({ appliedToRuntime: true })]
    }));
    expect(result.narrativeArcProgressAudits?.[0]?.writebackReferenceAudit).toEqual(
      expect.objectContaining({
        rawResponseRefs: [{ kind: 'current_matter', id: 'matter_1' }],
        appliedWritebackRefs: [{ kind: 'current_matter', id: 'matter_1' }]
      })
    );
  });

  it('keeps valid Arc progress when an actor writeback is applied through a canonical actor alias', () => {
    const officialRef = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: 'urban_legends_alpha:midnight_bus',
      dlcId: 'urban_legends_alpha'
    };
    const officialSource: PlanningSource = {
      ...source,
      ref: officialRef,
      title: '午夜末班车',
      arcProgressContract: {
        stageIds: ['street_rumor', 'first_clues'],
        nodeIdsByStage: { street_rumor: ['rumor_node'], first_clues: ['clue_node'] },
        allowedNextStageIds: { street_rumor: ['first_clues'], first_clues: [] }
      }
    };
    const officialContext = {
      ...context,
      planningMode: 'official_dlc_only' as const,
      planningRoute: 'official_dlc_only' as const,
      requiredContextSources: [officialSource],
      officialDlcSources: []
    };
    const officialPlan = { ...plan, primarySource: officialRef };
    const canonicalActorId = 'npc_canonical_bus_driver';
    const temporaryActorId = 'npc_generated_bus_driver';
    const initial = createInitialRuntimeState();
    const actorTemplate = Object.values(initial.actors)[0]!;
    const existingArc = {
      arcInstanceId: 'arc_midnight_bus',
      sourceRef: officialRef,
      arcType: 'official_dlc' as const,
      status: 'active' as const,
      currentStageId: 'street_rumor',
      usedNodeIds: [],
      createdTurn: 1,
      lastProgressTurn: 3,
      writebackRefs: []
    };
    const before = {
      ...initial,
      narrativeArcs: [existingArc],
      actors: {
        ...initial.actors,
        [canonicalActorId]: {
          ...actorTemplate,
          actorId: canonicalActorId,
          name: '夜班巴士司机',
          profileSummary: '尚未核对证词。'
        }
      }
    };
    const after = {
      ...before,
      actors: {
        ...before.actors,
        [canonicalActorId]: {
          ...before.actors[canonicalActorId],
          profileSummary: '已核对第一轮证词。'
        }
      },
      actorIdAliases: {
        ...(before.actorIdAliases ?? {}),
        [temporaryActorId]: canonicalActorId
      }
    };
    const trace = {
      planId: 'drama_plan_turn_4',
      status: 'used_persistently' as const,
      usedSourceRefs: [officialRef],
      resultingWritebackRefs: [{ kind: 'actor', id: temporaryActorId }],
      narrativeArcProgress: [{
        arcInstanceId: 'arc_midnight_bus',
        sourceRef: officialRef,
        decision: 'advance_stage' as const,
        currentStageId: 'street_rumor',
        previousStageId: 'street_rumor',
        nextStageId: 'first_clues',
        usedNodeIds: ['rumor_node'],
        supportingWritebackRefs: [{ kind: 'actor', id: temporaryActorId }]
      }]
    };

    const result = reconcileDramaExecutionTraceAfterWriteback({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      trace,
      context: officialContext,
      plan: officialPlan,
      existingNarrativeArcs: [existingArc],
      includeNarrativeArcProgressAudit: true,
      requestId: 'request_alias_test',
      turnId: 'turn_alias_test'
    });

    expect(result.trace?.resultingWritebackRefs).toEqual([
      { kind: 'actor', id: canonicalActorId }
    ]);
    expect(result.trace?.narrativeArcProgress).toEqual([
      expect.objectContaining({
        decision: 'advance_stage',
        nextStageId: 'first_clues',
        supportingWritebackRefs: [{ kind: 'actor', id: canonicalActorId }]
      })
    ]);
    expect(result.narrativeArcProgressAudits?.[0]).toEqual(expect.objectContaining({
      accepted: true,
      classification: 'advance_accepted',
      advisoryReasons: ['writeback_ref_canonicalization_mismatch'],
      supportingWritebackRefs: [expect.objectContaining({
        originalRefId: temporaryActorId,
        normalizedRefId: canonicalActorId,
        appliedToRuntime: true
      })]
    }));

    const committed = applyNarrativeArcProgress(after, result.trace);
    expect(committed.actors[canonicalActorId]?.profileSummary).toBe(
      '已核对第一轮证词。'
    );
    expect(committed.narrativeArcs).toEqual([
      expect.objectContaining({
        arcInstanceId: 'arc_midnight_bus',
        previousStageId: 'street_rumor',
        currentStageId: 'first_clues',
        writebackRefs: [{ kind: 'actor', id: canonicalActorId }]
      })
    ]);
  });
});
