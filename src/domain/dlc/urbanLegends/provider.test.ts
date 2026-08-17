import { describe, expect, it, vi } from 'vitest';
import { selectContext, type PromptContext } from '../../context/selectContext';
import {
  bridgeNarrativeArcCreation,
  buildNarrativeArcPlanningSources,
  buildNarrativeArcSummaries
} from '../../drama/narrativeArc';
import {
  allDramaPlanningSources,
  assembleOfficialDlcPlanningContext
} from '../../drama/assemblePlanningContext';
import { planDramaticTurn } from '../../drama/planner';
import {
  formatDramaExecutionPrompt,
  resolveSelectedDramaPayloads
} from '../../drama/prompt';
import { projectedDramaSourceProviders } from '../../drama/sourceRegistry';
import {
  defaultDramaticContentSettings,
  resolveDramaMaterialBudget
} from '../../drama/settings';
import type {
  DramaPlan,
  DramaPayloadResolutionOptions,
  DramaPlanningContext,
  DramaSourceRef,
  ForegroundContract,
  PlanningSource
} from '../../drama/types';
import type { NarratorClient } from '../../narrator/NarratorClient';
import { createInitialRuntimeState } from '../../runtime/initialState';
import {
  urbanLegendsAlphaEventGroup,
  urbanLegendsAlphaManifest
} from '../urbanLegendsAlpha/content';
import { urbanLegendsAlphaProvider } from '../urbanLegendsAlpha/provider';
import {
  urbanLegendsEntryRouteMatrix,
  urbanLegendsFormalCharacters,
  urbanLegendsFormalIds,
  urbanLegendsFormalManifest,
  urbanLegendsFormalV1Manifest,
  urbanLegendsReleaseGate
} from './content';
import {
  buildUrbanLegendsFormalPlanningSource,
  urbanLegendsFormalProvider
} from './provider';
import {
  urbanLegendsFormalContentIdentity,
  urbanLegendsFormalSourceRef
} from './stagePayload';
import { urbanLegendsFormalStageContracts } from './stageContracts';

type TestIdentity = 'police' | 'civilian' | 'gang_member';

function contextFor(
  identity: TestIdentity,
  status: 'active' | 'paused' | 'completed' = 'active'
): { context: PromptContext; state: ReturnType<typeof createInitialRuntimeState> } {
  const state = createInitialRuntimeState({ currentIdentity: identity });
  state.world.worldpackId = 'hk_1988';
  state.world.officialDlcBindings = [{
    dlcId: urbanLegendsFormalManifest.dlcId,
    version: urbanLegendsFormalManifest.version,
    status
  }];
  return { state, context: selectContext(state, '继续当前行动') };
}

function planningContext(
  source: PlanningSource,
  state?: ReturnType<typeof createInitialRuntimeState>
): DramaPlanningContext {
  const settings = { ...defaultDramaticContentSettings };
  return {
    planningScope: 'turn',
    planningMode: 'official_dlc_only',
    planningRoute: 'official_dlc_only',
    turnCounter: 3,
    currentTime: contextFor('police').state.time,
    playerInput: '核对当前可以确认的记录',
    playerRoleContext: {
      identity: 'police',
      publicRole: '基层警员',
      stableContactActorIds: [],
      activeMatterIds: []
    },
    currentPlaceId: 'place_mong_kok',
    currentSceneId: 'scene_mong_kok',
    settings,
    pacing: 'original',
    materialBudget: resolveDramaMaterialBudget(settings),
    recentTurnSummaries: [],
    requiredContextSources: [],
    userPrioritySources: [],
    optionalDynamicSources: [],
    staticSeedSources: [],
    officialDlcSources: [source],
    narrativeArcSummaries: state ? buildNarrativeArcSummaries(state) : [],
    recentExecutions: [],
    filterRuleIds: ['planning.official_dlc_only']
  };
}

function planFor(source: PlanningSource): DramaPlan {
  return {
    planId: 'drama_plan_turn_3',
    planningScope: 'turn',
    mode: 'continue_existing',
    primarySource: { ...source.ref },
    supportSources: [],
    sceneFunction: 'information',
    intensity: 'low',
    playerMayIgnore: true,
    maxNewActors: 1,
    reasonSummary: '玩家行动与当前阶段存在自然接触。'
  };
}

function foregroundContract(source: PlanningSource): ForegroundContract {
  return {
    planId: 'drama_plan_turn_3',
    mode: 'continue_existing',
    origin: 'auxiliary',
    primaryArcKey: source.arcKey,
    selectedSourceRefs: [{ ...source.ref }],
    evidenceSourceRefs: [{ ...source.ref }],
    mandatorySourceRefs: [],
    allowedActorIds: [...source.relatedActorIds],
    allowedOrganizationIds: [],
    allowedPlaceIds: [...source.relatedPlaceIds],
    allowedCaseIds: [],
    allowedMatterIds: [],
    allowedRelationshipThreadIds: [],
    allowedCityTrackIds: [],
    maxForegroundArcs: 1,
    maxNewActors: 1,
    maxNewDurableThreads: 1
  };
}

function persistedStageSource(identity: TestIdentity, stageId: string) {
  const { context, state } = contextFor(identity);
  const firstSource = urbanLegendsFormalProvider.list(context)[0]!;
  state.dynamicEvents.signals.signal_midnight_bus_contradiction = {
    id: 'signal_midnight_bus_contradiction',
    title: '车次时间矛盾',
    summary: '司机证词称零时十分离站，纸本更表却记录零时二十五分。',
    signalType: 'police',
    reliability: 'medium',
    status: 'active',
    visibility: 'known',
    relatedActorIds: [urbanLegendsFormalIds.actors.driver],
    relatedPlaceIds: [urbanLegendsFormalIds.places.terminal],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: state.time,
    updatedAt: state.time
  };
  state.dynamicEvents.signals.signal_unrelated = {
    id: 'signal_unrelated',
    title: '无关街头消息',
    summary: '另一条与午夜末班车无关的市场传闻。',
    signalType: 'rumor',
    reliability: 'low',
    status: 'active',
    visibility: 'known',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: state.time,
    updatedAt: state.time
  };
  state.narrativeArcs = [{
    arcInstanceId: 'arc_urban_legends_midnight_bus',
    sourceRef: { ...urbanLegendsFormalSourceRef },
    arcType: 'official_dlc',
    status: 'active',
    currentStageId: stageId,
    usedNodeIds: [urbanLegendsFormalIds.nodes.neighborhoodRumor],
    createdTurn: 1,
    lastProgressTurn: 2,
    writebackRefs: [{ kind: 'signal', id: 'signal_midnight_bus_contradiction' }],
    lastSummary: '司机证词与纸本更表形成了尚未解决的具体时间矛盾。'
  }];
  const compact = buildNarrativeArcPlanningSources(state, [firstSource])[0]!;
  return { context, state, compact };
}

function executionPromptForStage(identity: TestIdentity, stageId: string): string {
  const { context, state, compact } = persistedStageSource(identity, stageId);
  const dramaContext = planningContext(compact, state);
  return formatDramaExecutionPrompt({
    context,
    planningContext: dramaContext,
    plan: planFor(compact),
    contract: foregroundContract(compact),
    resolvePayload: (promptContext, ref, options) =>
      urbanLegendsFormalProvider.getExecutionPayload(promptContext, ref, options)
  });
}

describe('Urban Legends formal Phase 2D minimal payload compiler', () => {
  it('registers the formal provider and keeps it inactive outside its exact binding', () => {
    expect(urbanLegendsReleaseGate.providerRegistered).toBe(true);
    expect(projectedDramaSourceProviders).toContain(urbanLegendsFormalProvider);
    expect(urbanLegendsFormalProvider.list(contextFor('police').context)).toHaveLength(17);
    const frozenV1 = contextFor('police');
    frozenV1.context.officialDlcBindings![0]!.version = urbanLegendsFormalV1Manifest.version;
    expect(urbanLegendsFormalProvider.list(frozenV1.context)).toHaveLength(1);
    expect(urbanLegendsFormalProvider.list(contextFor('police', 'paused').context)).toEqual([]);
    expect(urbanLegendsFormalProvider.list(contextFor('police', 'completed').context)).toEqual([]);

    const wrongWorld = contextFor('police');
    wrongWorld.context.worldpackId = 'other_worldpack';
    expect(urbanLegendsFormalProvider.list(wrongWorld.context)).toEqual([]);

    const wrongVersion = contextFor('police');
    wrongVersion.context.officialDlcBindings![0]!.version = '2.0.0';
    expect(urbanLegendsFormalProvider.list(wrongVersion.context)).toEqual([]);
  });

  it('uses one stable content identity across all three entry identities', () => {
    const refs = new Set<string>();
    const contentIds = new Set<string>();
    for (const identity of ['police', 'civilian', 'gang_member'] as const) {
      const source = buildUrbanLegendsFormalPlanningSource(contextFor(identity).context);
      refs.add(JSON.stringify(source.ref));
      contentIds.add(JSON.stringify(source.contentIdentity));
      expect(source.plannerSummary).toContain(
        urbanLegendsEntryRouteMatrix.find((route) => route.identity === identity)!.contactSources[0]!
      );
      expect(source.exposureEvidenceActorIds).toContain(urbanLegendsFormalIds.actors.driver);
      expect(source.exposureEvidenceActorIds).not.toContain(urbanLegendsFormalIds.actors.reporter);
      expect(source.exposureEvidenceActorIds).not.toContain(
        urbanLegendsFormalIds.actors.societyLiaison
      );
    }
    expect(refs).toEqual(new Set([JSON.stringify(urbanLegendsFormalSourceRef)]));
    expect(contentIds).toEqual(new Set([JSON.stringify(urbanLegendsFormalContentIdentity)]));
  });

  it('keeps a persisted current-stage contract when the narrow official route is assembled', () => {
    const { context, state } = persistedStageSource(
      'gang_member',
      urbanLegendsFormalIds.stages.truthInvestigation
    );
    const initialSource = urbanLegendsFormalProvider.list(context)[0]!;
    const assembled = assembleOfficialDlcPlanningContext(
      state,
      context,
      defaultDramaticContentSettings,
      '继续核对已经成立的矛盾',
      [initialSource]
    );
    const selected = allDramaPlanningSources(assembled).filter(
      (source) => source.ref.sourceId === initialSource.ref.sourceId
    );

    expect(selected).toHaveLength(1);
    expect(selected[0]?.arcStageContext).toMatchObject({
      arcInstanceId: 'arc_urban_legends_midnight_bus',
      currentStageId: urbanLegendsFormalIds.stages.truthInvestigation,
      mode: 'continuation'
    });

    const payloads = resolveSelectedDramaPayloads({
      context,
      planningContext: assembled,
      plan: planFor(selected[0]!),
      resolvePayload: (promptContext, ref, options) =>
        urbanLegendsFormalProvider.getExecutionPayload(promptContext, ref, options)
    });
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.currentStageId).toBe(
      urbanLegendsFormalIds.stages.truthInvestigation
    );

    const prompt = formatDramaExecutionPrompt({
      context,
      planningContext: assembled,
      plan: planFor(selected[0]!),
      contract: foregroundContract(selected[0]!),
      resolvePayload: (promptContext, ref, options) =>
        urbanLegendsFormalProvider.getExecutionPayload(promptContext, ref, options)
    });
    expect(prompt).toContain(
      `"currentStageId":"${urbanLegendsFormalIds.stages.truthInvestigation}"`
    );
    expect(prompt).not.toContain('"currentStageId":"street_rumor"');
  });

  it('filters current-stage nodes by identity without creating separate arcs', () => {
    const policePayload = urbanLegendsFormalProvider.getExecutionPayload(
      contextFor('police').context,
      urbanLegendsFormalSourceRef
    )!;
    const gangPayload = urbanLegendsFormalProvider.getExecutionPayload(
      contextFor('gang_member').context,
      urbanLegendsFormalSourceRef
    )!;

    expect(policePayload.detailedContext).toContain(urbanLegendsFormalIds.nodes.reportedMissingPassenger);
    expect(gangPayload.detailedContext).not.toContain(urbanLegendsFormalIds.nodes.reportedMissingPassenger);
    expect(gangPayload.detailedContext).toContain(urbanLegendsFormalIds.nodes.routeBusinessRumor);
    expect(policePayload.ref).toEqual(gangPayload.ref);
    expect(policePayload.arcKey).toBe(gangPayload.arcKey);
  });

  it('sends only the current stage plus one allowed next-stage ID', () => {
    const { context } = contextFor('police');
    const payload = urbanLegendsFormalProvider.getExecutionPayload(
      context,
      urbanLegendsFormalSourceRef
    )!;
    const currentStage = urbanLegendsFormalStageContracts[0]!;
    const futureStages = urbanLegendsFormalStageContracts.slice(1);
    const futureNodeIds = futureStages.flatMap((stage) => stage.nodes.map((node) => node.nodeId));
    const candidateSecretIds = urbanLegendsFormalCharacters.flatMap((actor) =>
      actor.candidateSecretDomains.map((secret) => secret.secretDomainId)
    );

    expect(payload.currentStageId).toBe(currentStage.stageId);
    expect(payload.initialStageId).toBe(currentStage.stageId);
    expect(payload.arcProgressContract?.stageIds).toEqual([
      currentStage.stageId,
      urbanLegendsFormalIds.stages.firstClues
    ]);
    expect(payload.detailedContext).toContain(urbanLegendsFormalIds.stages.firstClues);
    for (const stage of futureStages) {
      expect(payload.detailedContext).not.toContain(stage.title);
    }
    for (const nodeId of futureNodeIds) {
      expect(JSON.stringify(payload)).not.toContain(nodeId);
    }
    for (const secretId of candidateSecretIds) {
      expect(JSON.stringify(payload)).not.toContain(secretId);
    }
    expect(payload.detailedContext.length).toBeLessThan(7_000);
    expect(JSON.stringify(payload).length).toBeLessThan(12_000);
  });

  it('compiles a persisted Arc from its current stage and strips the stage inventory', () => {
    const { compact } = persistedStageSource(
      'police',
      urbanLegendsFormalIds.stages.firstClues
    );
    expect(compact.arcStageContext).toMatchObject({
      arcInstanceId: 'arc_urban_legends_midnight_bus',
      currentStageId: urbanLegendsFormalIds.stages.firstClues,
      mode: 'continuation'
    });
    expect(compact.arcStageContext?.continuationSnapshot).toMatchObject({
      usedNodeIds: [urbanLegendsFormalIds.nodes.neighborhoodRumor],
      lastProgressTurn: 2,
      progressSummary: '司机证词与纸本更表形成了尚未解决的具体时间矛盾。',
      appliedWritebackRefs: [
        { kind: 'signal', id: 'signal_midnight_bus_contradiction' }
      ]
    });
    expect(compact.arcStageContext?.continuationSnapshot.groundedSummary).toContain(
      '车次时间矛盾'
    );
    expect(compact.arcStageContext?.continuationSnapshot.groundedSummary).not.toContain(
      '无关街头消息'
    );
    expect(compact.arcStageProjections).toBeUndefined();
    expect(compact.title).toContain('第一批线索');
    expect(compact.contentIdentity).toEqual(urbanLegendsFormalContentIdentity);
    expect(compact.plannerSummary.length).toBeLessThan(900);
  });

  it('passes persisted stage context through selected-payload resolution', () => {
    const { context, state, compact } = persistedStageSource(
      'police',
      urbanLegendsFormalIds.stages.firstClues
    );
    const dramaContext = planningContext(compact, state);
    const plan = planFor(compact);
    const payloads = resolveSelectedDramaPayloads({
      context,
      planningContext: dramaContext,
      plan,
      resolvePayload: (promptContext, ref, options) =>
        urbanLegendsFormalProvider.getExecutionPayload(promptContext, ref, options)
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      ref: urbanLegendsFormalSourceRef,
      contentIdentity: urbanLegendsFormalContentIdentity,
      arcKey: urbanLegendsFormalIds.arcKey,
      currentStageId: urbanLegendsFormalIds.stages.firstClues
    });
    expect(payloads[0]?.initialStageId).toBeUndefined();
    expect(payloads[0]?.detailedContext).toContain('载荷模式：continuation');
    expect(payloads[0]?.detailedContext).toContain('第一批线索');
    expect(payloads[0]?.detailedContext).toContain(
      urbanLegendsFormalIds.nodes.neighborhoodRumor
    );
    expect(payloads[0]?.detailedContext).toContain('车次时间矛盾');
    expect(payloads[0]?.detailedContext).toContain(
      'signal:signal_midnight_bus_contradiction'
    );
    expect(payloads[0]?.detailedContext).not.toContain('signal_unrelated');
    expect(payloads[0]?.detailedContext).not.toContain('无关街头消息');
    expect(payloads[0]?.detailedContext).not.toContain('结局余波');
    expect(payloads[0]?.detailedContext).not.toContain(urbanLegendsFormalIds.nodes.publicAccount);
  });

  it('passes the persisted stage to the execution-to-Arc bridge as well', () => {
    const { context, state, compact } = persistedStageSource(
      'police',
      urbanLegendsFormalIds.stages.firstClues
    );
    const dramaContext = planningContext(compact, state);
    const resolver = vi.fn((ref: DramaSourceRef, options?: DramaPayloadResolutionOptions) =>
      urbanLegendsFormalProvider.getExecutionPayload(context, ref, options)
    );
    const result = bridgeNarrativeArcCreation({
      state,
      context: dramaContext,
      trace: {
        planId: 'drama_plan_turn_3',
        status: 'used_persistently',
        usedSourceRefs: [{ ...urbanLegendsFormalSourceRef }],
        resultingWritebackRefs: [{ kind: 'signal', id: 'signal_midnight_bus' }]
      },
      resolveExecutionPayload: resolver
    });

    expect(resolver).toHaveBeenCalledWith(urbanLegendsFormalSourceRef, {
      narrativeArc: expect.objectContaining({
          arcInstanceId: 'arc_urban_legends_midnight_bus',
          currentStageId: urbanLegendsFormalIds.stages.firstClues,
          mode: 'continuation'
      })
    });
    expect(result.trace?.narrativeArcProgress?.[0]?.currentStageId).toBe(
      urbanLegendsFormalIds.stages.firstClues
    );
  });

  it('keeps future-stage inventory out of planner and execution prompts', async () => {
    const { context, state, compact } = persistedStageSource(
      'police',
      urbanLegendsFormalIds.stages.firstClues
    );
    const dramaContext = planningContext(compact, state);
    const plan = planFor(compact);
    const client: NarratorClient = {
      complete: vi.fn().mockResolvedValue(plan)
    };
    await planDramaticTurn({ context: dramaContext, client });
    const plannerPrompt = String(vi.mocked(client.complete).mock.calls[0]?.[0] ?? '');
    expect(plannerPrompt).toContain('第一批线索');
    expect(plannerPrompt).not.toContain('结局余波');
    expect(plannerPrompt).not.toContain(urbanLegendsFormalIds.nodes.publicAccount);

    const executionPrompt = formatDramaExecutionPrompt({
      context,
      planningContext: dramaContext,
      plan,
      contract: foregroundContract(compact),
      resolvePayload: (promptContext, ref, options) =>
        urbanLegendsFormalProvider.getExecutionPayload(promptContext, ref, options)
    });
    expect(executionPrompt).toContain('第一批线索');
    expect(executionPrompt).toContain(urbanLegendsFormalIds.nodes.neighborhoodRumor);
    expect(executionPrompt).toContain('司机证词称零时十分离站');
    expect(executionPrompt).toContain('signal:signal_midnight_bus_contradiction');
    expect(executionPrompt).not.toContain('signal_unrelated');
    expect(executionPrompt).not.toContain('无关街头消息');
    expect(executionPrompt).not.toContain('结局余波');
    expect(executionPrompt).not.toContain(urbanLegendsFormalIds.nodes.publicAccount);
    expect(executionPrompt.length).toBeLessThan(20_000);
  });

  it('makes first-clues progression a real remain-versus-advance decision without exhaustive collection', () => {
    const executionPrompt = executionPromptForStage(
      'civilian',
      urbanLegendsFormalIds.stages.firstClues
    );

    expect(executionPrompt).toContain('阶段进度决定');
    expect(executionPrompt).toMatch(/不得把 remain 当作默认保守答案/);
    expect(executionPrompt).toMatch(/现实利益.*塑造.*证据|压制、利用或改变叙述/);
    expect(executionPrompt).toMatch(/进入下一阶段.*不表示.*线索.*收齐|不要求收齐全部线索/);
    expect(executionPrompt).toMatch(/不得?因.*未使用节点.*阻止推进|未使用节点.*不是保持阶段的充分理由/);
  });

  it('does not mislabel a persisted Arc continuation as first exposure', () => {
    const executionPrompt = executionPromptForStage(
      'police',
      urbanLegendsFormalIds.stages.firstClues
    );

    expect(executionPrompt).not.toContain('官方 DLC 首次曝光窄路由');
    expect(executionPrompt).toContain('官方 DLC 窄路由');
    expect(executionPrompt).toMatch(/continuation.*持久阶段|已曝光 Arc.*当前阶段/);
  });

  it('keeps the no-parallel-incident continuation rule outside the DLC-only planning route', () => {
    const { context, state, compact } = persistedStageSource(
      'police',
      urbanLegendsFormalIds.stages.firstClues
    );
    const dramaContext = {
      ...planningContext(compact, state),
      planningMode: 'full' as const,
      planningRoute: 'auto' as const
    };
    const executionPrompt = formatDramaExecutionPrompt({
      context,
      planningContext: dramaContext,
      plan: planFor(compact),
      contract: foregroundContract(compact),
      resolvePayload: (promptContext, ref, options) =>
        urbanLegendsFormalProvider.getExecutionPayload(promptContext, ref, options)
    });

    expect(executionPrompt).toContain('已曝光持续剧情弧的 continuation 载荷');
    expect(executionPrompt).toContain('不得把同一弧线改写成第二宗同类报案');
    expect(executionPrompt).toContain('换名复制的人物班底');
  });

  it('states that bounded unexplained residue is compatible with truth-to-aftermath progress', () => {
    const executionPrompt = executionPromptForStage(
      'gang_member',
      urbanLegendsFormalIds.stages.truthInvestigation
    );

    expect(executionPrompt).toContain('阶段进度决定');
    expect(executionPrompt).toMatch(/有界未解释残余.*推进兼容|推进.*允许保留.*有界.*残余/);
    expect(executionPrompt).toMatch(/进入下一阶段.*不表示.*唯一真相/);
    expect(executionPrompt).toMatch(/不表示.*超自然.*确认|不得把推进等同于确认超自然/);
    expect(executionPrompt).toMatch(/现实后果.*advance_stage|advance_stage.*现实后果/);
  });

  it('allows aftermath completion with retained history, beliefs and bounded residue', () => {
    const executionPrompt = executionPromptForStage(
      'police',
      urbanLegendsFormalIds.stages.aftermath
    );

    expect(executionPrompt).toContain('阶段进度决定');
    expect(executionPrompt).toMatch(/complete.*只结束.*Arc.*主要推进/);
    expect(executionPrompt).toMatch(/有界未解释残余.*可以继续存在/);
    expect(executionPrompt).toMatch(/不自动完成整个 DLC/);
    expect(executionPrompt).toMatch(/已应用写回.*稳定.*结果.*complete|complete.*已应用写回/);
  });

  it('keeps repeated turns in the same stage as bounded continuation rather than first exposure', () => {
    const { context, state, compact: firstCompact } = persistedStageSource(
      'police',
      urbanLegendsFormalIds.stages.firstClues
    );
    const firstPayload = urbanLegendsFormalProvider.getExecutionPayload(
      context,
      urbanLegendsFormalSourceRef,
      { narrativeArc: firstCompact.arcStageContext }
    )!;
    const currentStageNode = urbanLegendsFormalStageContracts
      .find((stage) => stage.stageId === urbanLegendsFormalIds.stages.firstClues)!
      .nodes[0]!.nodeId;
    state.narrativeArcs![0]!.lastProgressTurn = 3;
    state.narrativeArcs![0]!.usedNodeIds.push(currentStageNode);
    state.narrativeArcs![0]!.lastSummary = '时间矛盾已被核对，但记录缺口仍未解决。';
    const projected = urbanLegendsFormalProvider.list(context)[0]!;
    const secondCompact = buildNarrativeArcPlanningSources(state, [projected])[0]!;
    const secondPayload = urbanLegendsFormalProvider.getExecutionPayload(
      context,
      urbanLegendsFormalSourceRef,
      { narrativeArc: secondCompact.arcStageContext }
    )!;

    for (const payload of [firstPayload, secondPayload]) {
      expect(payload.currentStageId).toBe(urbanLegendsFormalIds.stages.firstClues);
      expect(payload.initialStageId).toBeUndefined();
      expect(payload.detailedContext).toContain('载荷模式：continuation');
      expect(payload.detailedContext).not.toContain('自然接触来源');
    }
    expect(secondPayload.detailedContext).toContain(
      urbanLegendsFormalIds.nodes.neighborhoodRumor
    );
    expect(secondPayload.detailedContext).toContain(currentStageNode);
    expect(secondPayload.detailedContext).toContain('时间矛盾已被核对');
    expect(state.narrativeArcs).toHaveLength(1);
  });

  it('never resolves Alpha and formal refs through the other content provider', () => {
    const formalContext = contextFor('police').context;
    const alphaState = createInitialRuntimeState({ currentIdentity: 'police' });
    alphaState.world.worldpackId = 'hk_1988';
    alphaState.world.officialDlcBindings = [{
      dlcId: urbanLegendsAlphaManifest.dlcId,
      version: urbanLegendsAlphaManifest.version,
      status: 'active'
    }];
    const alphaContext = selectContext(alphaState, '继续当前行动');
    const alphaRef = urbanLegendsAlphaProvider
      .list(alphaContext)
      .find((source) => source.ref.sourceId === urbanLegendsAlphaEventGroup.eventGroupId)!
      .ref;

    expect(
      urbanLegendsFormalProvider.getExecutionPayload(formalContext, alphaRef)
    ).toBeUndefined();
    expect(
      urbanLegendsAlphaProvider.getExecutionPayload(alphaContext, urbanLegendsFormalSourceRef)
    ).toBeUndefined();
  });
});
