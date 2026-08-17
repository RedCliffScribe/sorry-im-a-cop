import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState, withRuntimeDefaults } from '../runtime/initialState';
import type { DramaExecutionTrace, DramaPlanningContext, PlanningSource } from './types';
import {
  applyNarrativeArcProgress,
  bridgeNarrativeArcCreation,
  buildNarrativeArcPlanningSources,
  buildNarrativeArcSummaries,
  validateNarrativeArcProgressShape
} from './narrativeArc';

const sourceRef = {
  providerId: 'official-dlc',
  sourceType: 'official_dlc_event',
  sourceId: 'urban_legends_alpha:midnight_bus',
  dlcId: 'urban_legends_alpha'
};

const source: PlanningSource = {
  ref: sourceRef,
  title: '午夜末班车',
  plannerSummary: '香港1988的夜间巴士传闻。',
  sourceStatus: 'active_process',
  reusePolicy: 'context_reusable',
  priorityClass: 'user_requested',
  channelIds: ['city_news'],
  softAffinities: {},
  mandatory: false,
  score: 10,
  relatedActorIds: [],
  relatedOrganizationIds: [],
  relatedPlaceIds: [],
  relatedCaseIds: [],
  arcProgressContract: {
    stageIds: ['street_rumor', 'first_clues', 'conflict'],
    nodeIdsByStage: {
      street_rumor: ['rumor_node'],
      first_clues: ['clue_node'],
      conflict: ['conflict_node']
    },
  allowedNextStageIds: {
    street_rumor: ['first_clues'],
    first_clues: ['conflict'],
    conflict: []
  },
  completionStageIds: ['conflict']
  }
};

const context = {
  requiredContextSources: [source],
  userPrioritySources: [],
  optionalDynamicSources: [],
  staticSeedSources: [],
  officialDlcSources: [source]
} as unknown as DramaPlanningContext;

function trace(progress: NonNullable<DramaExecutionTrace['narrativeArcProgress']>[number]): DramaExecutionTrace {
  return {
    planId: 'drama_plan_turn_1',
    status: 'used_persistently',
    usedSourceRefs: [sourceRef],
    resultingWritebackRefs: progress.supportingWritebackRefs,
    narrativeArcProgress: [progress]
  };
}

const writebackRef = { kind: 'matter', id: 'matter_midnight_bus' };

describe('narrative arc persistence', () => {
  it('migrates absent or malformed arc state to an empty list', () => {
    expect(withRuntimeDefaults(createInitialRuntimeState()).narrativeArcs).toEqual([]);
    expect(withRuntimeDefaults({ ...createInitialRuntimeState(), narrativeArcs: [{ bad: true }] as unknown as never[] }).narrativeArcs).toEqual([]);
  });

  it('creates an arc and advances the same instance without storing world facts', () => {
    const initial = createInitialRuntimeState();
    const created = applyNarrativeArcProgress(initial, trace({
      arcInstanceId: 'arc_midnight_bus',
      sourceRef,
      decision: 'remain',
      currentStageId: 'street_rumor',
      usedNodeIds: ['rumor_node'],
      supportingWritebackRefs: [writebackRef],
      summary: '街坊开始谈论夜间巴士。'
    }));

    expect(created.narrativeArcs).toHaveLength(1);
    expect(created.narrativeArcs?.[0]).toMatchObject({
      arcInstanceId: 'arc_midnight_bus',
      currentStageId: 'street_rumor',
      createdTurn: 0,
      lastProgressTurn: 0,
      status: 'active'
    });
    expect(created.narrativeArcs?.[0]?.writebackRefs).toEqual([writebackRef]);

    const advanced = applyNarrativeArcProgress(
      { ...created, turnCounter: 1 },
      trace({
        arcInstanceId: 'arc_midnight_bus',
        sourceRef,
        decision: 'advance_stage',
        currentStageId: 'street_rumor',
        nextStageId: 'first_clues',
        previousStageId: 'street_rumor',
        usedNodeIds: ['clue_node'],
        supportingWritebackRefs: [{ kind: 'case', id: 'case_bus' }],
        summary: '司机证词与旧线路资料出现矛盾。'
      })
    );

    expect(advanced.narrativeArcs).toHaveLength(1);
    expect(advanced.narrativeArcs?.[0]).toMatchObject({
      arcInstanceId: 'arc_midnight_bus',
      currentStageId: 'first_clues',
      previousStageId: 'street_rumor',
      lastProgressTurn: 1
    });
    expect(advanced.narrativeArcs?.[0]?.usedNodeIds).toEqual(['rumor_node', 'clue_node']);
    expect(advanced.narrativeArcs?.[0]?.writebackRefs).toEqual([writebackRef, { kind: 'case', id: 'case_bus' }]);
    expect(advanced.storyLog).toEqual(initial.storyLog);
    expect(advanced.actors).toEqual(initial.actors);
  });

  it('completes an arc and keeps it out of compact active planning summaries', () => {
    const initial = createInitialRuntimeState();
    const active = applyNarrativeArcProgress(initial, trace({
      arcInstanceId: 'arc_midnight_bus',
      sourceRef,
      decision: 'remain',
      currentStageId: 'street_rumor',
      usedNodeIds: ['rumor_node'],
      supportingWritebackRefs: [writebackRef]
    }));
    const completed = applyNarrativeArcProgress(
      { ...active, turnCounter: 2 },
      trace({
        arcInstanceId: 'arc_midnight_bus',
        sourceRef,
        decision: 'complete',
        currentStageId: 'conflict',
        usedNodeIds: ['conflict_node'],
        supportingWritebackRefs: [writebackRef],
        summary: '传闻的现实后果已经处理完毕。'
      })
    );

    expect(completed.narrativeArcs?.[0]?.status).toBe('completed');
    expect(buildNarrativeArcSummaries(completed)).toEqual([]);
  });

  it('honors a provider-declared completion stage without changing legacy contracts', () => {
    const existingArc = {
      arcInstanceId: 'arc_midnight_bus',
      sourceRef,
      arcType: 'official_dlc' as const,
      status: 'active' as const,
      currentStageId: 'street_rumor',
      usedNodeIds: ['rumor_node'],
      createdTurn: 0,
      lastProgressTurn: 0,
      writebackRefs: [writebackRef]
    };
    expect(validateNarrativeArcProgressShape({
      progress: {
        arcInstanceId: existingArc.arcInstanceId,
        sourceRef,
        decision: 'complete',
        currentStageId: 'street_rumor',
        usedNodeIds: ['rumor_node'],
        supportingWritebackRefs: [writebackRef]
      },
      context,
      existingArcs: [existingArc]
    })).toBe('当前阶段不允许完成剧情弧。');
    expect(validateNarrativeArcProgressShape({
      progress: {
        arcInstanceId: existingArc.arcInstanceId,
        sourceRef,
        decision: 'complete',
        currentStageId: 'conflict',
        usedNodeIds: ['conflict_node'],
        supportingWritebackRefs: [writebackRef]
      },
      context,
      existingArcs: [{ ...existingArc, currentStageId: 'conflict' }]
    })).toBeUndefined();
  });

  it('projects an active arc as one compact current-stage source', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: sourceRef.dlcId!,
      version: '1.0.0',
      status: 'active'
    }];
    state.narrativeArcs = [{
      arcInstanceId: 'arc_midnight_bus',
      sourceRef,
      arcType: 'official_dlc',
      status: 'active',
      currentStageId: 'street_rumor',
      usedNodeIds: ['rumor_node'],
      createdTurn: 1,
      lastProgressTurn: 2,
      writebackRefs: [{ kind: 'case', id: 'case_midnight_bus' }],
      lastSummary: '司机证词与旧线路资料出现矛盾。'
    }];
    const compact = buildNarrativeArcPlanningSources(state, [
      { ...source, arcKey: 'official-dlc:midnight-bus' },
      {
        ...source,
        ref: { ...source.ref, sourceType: 'official_dlc_news', sourceId: 'news_midnight_bus' },
        arcKey: 'official-dlc:midnight-bus'
      }
    ]);

    expect(compact).toHaveLength(1);
    expect(compact[0]).toMatchObject({
      ref: sourceRef,
      sourceStatus: 'active_process',
      priorityClass: 'normal',
      reusePolicy: 'context_reusable',
      mandatory: false,
      title: '午夜末班车 · street_rumor'
    });
    expect(compact[0]?.plannerSummary).toContain('司机证词与旧线路资料出现矛盾');
    expect(compact[0]?.arcProgressContract).toEqual(source.arcProgressContract);
    expect(compact[0]?.relatedCaseIds).toEqual(['case_midnight_bus']);
  });

  it('does not project a paused official DLC arc as a new planning candidate', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: sourceRef.dlcId!,
      version: '1.0.0',
      status: 'paused'
    }];
    state.narrativeArcs = [{
      arcInstanceId: 'arc_midnight_bus',
      sourceRef,
      arcType: 'official_dlc',
      status: 'paused',
      currentStageId: 'street_rumor',
      usedNodeIds: [],
      createdTurn: 1,
      lastProgressTurn: 1,
      writebackRefs: []
    }];
    expect(buildNarrativeArcPlanningSources(state, [source])).toEqual([]);
  });

  it('mirrors an official DLC pause and resume on the same arc instance', () => {
    const initial = createInitialRuntimeState();
    const active = applyNarrativeArcProgress(initial, trace({
      arcInstanceId: 'arc_midnight_bus',
      sourceRef,
      decision: 'remain',
      currentStageId: 'street_rumor',
      usedNodeIds: ['rumor_node'],
      supportingWritebackRefs: [writebackRef]
    }));
    const paused = applyNarrativeArcProgress({
      ...active,
      world: {
        ...active.world,
        officialDlcBindings: [{ dlcId: sourceRef.dlcId!, version: '1.0.0', status: 'paused' }]
      }
    }, undefined);
    expect(paused.narrativeArcs?.[0]).toMatchObject({ arcInstanceId: 'arc_midnight_bus', status: 'paused' });

    const resumed = applyNarrativeArcProgress({
      ...paused,
      world: {
        ...paused.world,
        officialDlcBindings: [{ dlcId: sourceRef.dlcId!, version: '1.0.0', status: 'active' }]
      }
    }, undefined);
    expect(resumed.narrativeArcs?.[0]).toMatchObject({ arcInstanceId: 'arc_midnight_bus', status: 'active' });

    const completed = applyNarrativeArcProgress({
      ...resumed,
      world: {
        ...resumed.world,
        officialDlcBindings: [{ dlcId: sourceRef.dlcId!, version: '1.0.0', status: 'completed' }]
      }
    }, undefined);
    expect(completed.narrativeArcs?.[0]).toMatchObject({
      arcInstanceId: 'arc_midnight_bus',
      status: 'completed'
    });
  });

  it('rejects an unknown stage or illegal transition before persistence', () => {
    expect(validateNarrativeArcProgressShape({
      progress: {
        arcInstanceId: 'arc_midnight_bus',
        sourceRef,
        decision: 'advance_stage',
        currentStageId: 'not_a_stage',
        nextStageId: 'conflict',
        usedNodeIds: [],
        supportingWritebackRefs: [writebackRef]
      },
      context,
      existingArcs: []
    })).toContain('未知阶段');

    expect(validateNarrativeArcProgressShape({
      progress: {
        arcInstanceId: 'arc_midnight_bus',
        sourceRef,
        decision: 'advance_stage',
        currentStageId: 'street_rumor',
        nextStageId: 'conflict',
        usedNodeIds: [],
        supportingWritebackRefs: [writebackRef]
      },
      context,
      existingArcs: []
    })).toContain('阶段转换');

    expect(validateNarrativeArcProgressShape({
      progress: {
        arcInstanceId: 'arc_midnight_bus_new',
        sourceRef,
        decision: 'remain',
        currentStageId: 'street_rumor',
        usedNodeIds: [],
        supportingWritebackRefs: [writebackRef]
      },
      context,
      existingArcs: [{
        arcInstanceId: 'arc_midnight_bus',
        sourceRef,
        arcType: 'official_dlc',
        status: 'active',
        currentStageId: 'street_rumor',
        usedNodeIds: [],
        createdTurn: 0,
        lastProgressTurn: 0,
        writebackRefs: []
      }]
    })).toContain('不能重新创建');
  });

  it('bridges a successful official DLC execution into the first arc progress receipt', () => {
    const traceWithoutModelProgress: DramaExecutionTrace = {
      planId: 'drama_plan_turn_1',
      status: 'used_persistently',
      usedSourceRefs: [sourceRef],
      resultingWritebackRefs: [writebackRef]
    };
    const result = bridgeNarrativeArcCreation({
      state: createInitialRuntimeState(),
      context,
      trace: traceWithoutModelProgress,
      resolveExecutionPayload: () => ({
        ref: sourceRef,
        arcKey: 'official-dlc:urban_legends_alpha:midnight_bus',
        initialStageId: 'street_rumor',
        arcProgressContract: source.arcProgressContract,
        detailedContext: '事件执行上下文',
        confirmedFacts: [],
        mutableElements: [],
        forbiddenAdaptations: []
      })
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'arc_created' })
    ]);
    expect(result.trace?.narrativeArcProgress).toEqual([
      expect.objectContaining({
        arcInstanceId: 'arc_official-dlc_urban_legends_alpha_midnight_bus',
        sourceRef,
        decision: 'remain',
        currentStageId: 'street_rumor',
        supportingWritebackRefs: [writebackRef]
      })
    ]);

    const persisted = applyNarrativeArcProgress(
      createInitialRuntimeState(),
      result.trace
    );
    expect(persisted.narrativeArcs).toHaveLength(1);
    expect(persisted.narrativeArcs?.[0]).toMatchObject({
      arcInstanceId: 'arc_official-dlc_urban_legends_alpha_midnight_bus',
      arcType: 'official_dlc',
      currentStageId: 'street_rumor',
      status: 'active'
    });
  });

  it('bridges with the canonical source ref when the execution receipt omits DLC provenance', () => {
    const incompleteRef = {
      providerId: sourceRef.providerId,
      sourceType: sourceRef.sourceType,
      sourceId: sourceRef.sourceId
    };
    const result = bridgeNarrativeArcCreation({
      state: createInitialRuntimeState(),
      context,
      trace: {
        planId: 'drama_plan_turn_1',
        status: 'used_persistently',
        usedSourceRefs: [incompleteRef],
        resultingWritebackRefs: [writebackRef]
      },
      resolveExecutionPayload: () => ({
        ref: sourceRef,
        arcKey: 'official-dlc:urban_legends_alpha:midnight_bus',
        initialStageId: 'street_rumor',
        arcProgressContract: source.arcProgressContract,
        detailedContext: '事件执行上下文',
        confirmedFacts: [],
        mutableElements: [],
        forbiddenAdaptations: []
      })
    });

    expect(result.trace?.narrativeArcProgress?.[0]?.sourceRef).toEqual(sourceRef);
    const persisted = applyNarrativeArcProgress(createInitialRuntimeState(), result.trace);
    expect(persisted.narrativeArcs?.[0]?.sourceRef).toEqual(sourceRef);
  });

  it('records a texture-only official exposure without inventing a world writeback', () => {
    const result = bridgeNarrativeArcCreation({
      state: createInitialRuntimeState(),
      context,
      trace: {
        planId: 'drama_plan_turn_1',
        status: 'used_as_texture',
        usedSourceRefs: [sourceRef],
        resultingWritebackRefs: []
      },
      resolveExecutionPayload: () => ({
        ref: sourceRef,
        arcKey: 'official-dlc:urban_legends_alpha:midnight_bus',
        initialStageId: 'street_rumor',
        arcProgressContract: source.arcProgressContract,
        detailedContext: '仅作为本回合传闻背景出现',
        confirmedFacts: [],
        mutableElements: [],
        forbiddenAdaptations: []
      })
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'arc_created' })
    ]);
    expect(result.trace?.status).toBe('used_as_texture');
    expect(result.trace?.narrativeArcProgress?.[0]?.supportingWritebackRefs).toEqual([]);
    const persisted = applyNarrativeArcProgress(createInitialRuntimeState(), result.trace);
    expect(persisted.narrativeArcs).toHaveLength(1);
    expect(persisted.narrativeArcs?.[0]).toMatchObject({
      currentStageId: 'street_rumor',
      status: 'active',
      writebackRefs: []
    });
  });

  it('updates the same source arc instead of creating a duplicate', () => {
    const state = createInitialRuntimeState();
    state.narrativeArcs = [{
      arcInstanceId: 'arc_existing_midnight_bus',
      sourceRef,
      arcType: 'official_dlc',
      status: 'active',
      currentStageId: 'street_rumor',
      usedNodeIds: [],
      createdTurn: 0,
      lastProgressTurn: 0,
      writebackRefs: []
    }];
    const result = bridgeNarrativeArcCreation({
      state,
      context,
      trace: {
        planId: 'drama_plan_turn_2',
        status: 'used_persistently',
        usedSourceRefs: [sourceRef],
        resultingWritebackRefs: [writebackRef]
      },
      resolveExecutionPayload: () => ({
        ref: sourceRef,
        arcKey: 'official-dlc:urban_legends_alpha:midnight_bus',
        initialStageId: 'street_rumor',
        detailedContext: '事件执行上下文',
        confirmedFacts: [],
        mutableElements: [],
        forbiddenAdaptations: []
      })
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.trace?.narrativeArcProgress?.[0]?.arcInstanceId).toBe(
      'arc_existing_midnight_bus'
    );
    const persisted = applyNarrativeArcProgress(state, result.trace);
    expect(persisted.narrativeArcs).toHaveLength(1);
    expect(persisted.narrativeArcs?.[0]?.arcInstanceId).toBe('arc_existing_midnight_bus');
  });

  it('does not bridge paused or completed official DLC sources', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: sourceRef.dlcId!,
      version: '1.0.0',
      status: 'paused'
    }];
    const result = bridgeNarrativeArcCreation({
      state,
      context,
      trace: {
        planId: 'drama_plan_turn_3',
        status: 'used_persistently',
        usedSourceRefs: [sourceRef],
        resultingWritebackRefs: [writebackRef]
      },
      resolveExecutionPayload: () => ({
        ref: sourceRef,
        arcKey: 'official-dlc:urban_legends_alpha:midnight_bus',
        initialStageId: 'street_rumor',
        detailedContext: '事件执行上下文',
        confirmedFacts: [],
        mutableElements: [],
        forbiddenAdaptations: []
      })
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.trace?.narrativeArcProgress).toBeUndefined();
  });

  it('keeps a completed arc terminal while its DLC binding remains active', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: sourceRef.dlcId!,
      version: '1.0.0',
      status: 'active'
    }];
    state.narrativeArcs = [{
      arcInstanceId: 'arc_completed_midnight_bus',
      sourceRef,
      arcType: 'official_dlc',
      status: 'completed',
      currentStageId: 'conflict',
      usedNodeIds: ['conflict_node'],
      createdTurn: 1,
      lastProgressTurn: 9,
      writebackRefs: [writebackRef],
      lastSummary: '这条剧情弧已经完成。'
    }];

    expect(buildNarrativeArcPlanningSources(state, [source])).toEqual([]);

    const bridged = bridgeNarrativeArcCreation({
      state,
      context,
      trace: {
        planId: 'drama_plan_after_completion',
        status: 'used_persistently',
        usedSourceRefs: [sourceRef],
        resultingWritebackRefs: [writebackRef]
      },
      resolveExecutionPayload: () => ({
        ref: sourceRef,
        arcKey: 'official-dlc:urban_legends_alpha:midnight_bus',
        initialStageId: 'street_rumor',
        detailedContext: '事件执行上下文',
        confirmedFacts: [],
        mutableElements: [],
        forbiddenAdaptations: []
      })
    });
    expect(bridged.trace?.narrativeArcProgress).toBeUndefined();
    expect(applyNarrativeArcProgress(state, bridged.trace).narrativeArcs).toEqual(
      state.narrativeArcs
    );

    const paused = applyNarrativeArcProgress({
      ...state,
      world: {
        ...state.world,
        officialDlcBindings: [{
          dlcId: sourceRef.dlcId!,
          version: '1.0.0',
          status: 'paused'
        }]
      }
    }, undefined);
    const resumed = applyNarrativeArcProgress({
      ...paused,
      world: {
        ...paused.world,
        officialDlcBindings: [{
          dlcId: sourceRef.dlcId!,
          version: '1.0.0',
          status: 'active'
        }]
      }
    }, undefined);
    expect(paused.narrativeArcs?.[0]).toMatchObject({
      arcInstanceId: 'arc_completed_midnight_bus',
      status: 'completed'
    });
    expect(resumed.narrativeArcs?.[0]).toMatchObject({
      arcInstanceId: 'arc_completed_midnight_bus',
      status: 'completed'
    });
  });

  it('reuses the bridge for a custom event group without affecting ordinary sources', () => {
    const customRef = {
      providerId: 'custom-event-group',
      sourceType: 'custom_event_group_instance',
      sourceId: 'custom_event_1'
    };
    const customSource: PlanningSource = {
      ...source,
      ref: customRef,
      title: '自定义事件',
      arcProgressContract: undefined
    };
    const customContext = {
      ...context,
      requiredContextSources: [customSource],
      officialDlcSources: []
    } as unknown as DramaPlanningContext;
    const customResult = bridgeNarrativeArcCreation({
      state: createInitialRuntimeState(),
      context: customContext,
      trace: {
        planId: 'custom_plan_1',
        status: 'used_persistently',
        usedSourceRefs: [customRef],
        resultingWritebackRefs: [writebackRef]
      },
      resolveExecutionPayload: () => ({
        ref: customRef,
        arcKey: 'custom:event:one',
        initialStageId: 'opening',
        detailedContext: '自定义执行上下文',
        confirmedFacts: [],
        mutableElements: [],
        forbiddenAdaptations: []
      })
    });
    expect(customResult.diagnostics).toEqual([
      expect.objectContaining({ code: 'arc_created' })
    ]);

    const ordinaryRef = {
      providerId: 'runtime-dynamic',
      sourceType: 'current_matter',
      sourceId: 'matter_ordinary'
    };
    const ordinarySource: PlanningSource = {
      ...customSource,
      ref: ordinaryRef,
      title: '普通事项'
    };
    const ordinaryResult = bridgeNarrativeArcCreation({
      state: createInitialRuntimeState(),
      context: { ...customContext, requiredContextSources: [ordinarySource] } as unknown as DramaPlanningContext,
      trace: {
        planId: 'ordinary_plan_1',
        status: 'used_persistently',
        usedSourceRefs: [ordinaryRef],
        resultingWritebackRefs: [writebackRef]
      },
      resolveExecutionPayload: () => ({
        ref: ordinaryRef,
        detailedContext: '普通事项',
        confirmedFacts: [],
        mutableElements: [],
        forbiddenAdaptations: []
      })
    });
    expect(ordinaryResult.diagnostics).toEqual([]);
    expect(ordinaryResult.trace?.narrativeArcProgress).toBeUndefined();
  });
});
