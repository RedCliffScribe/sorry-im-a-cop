import { describe, expect, it } from 'vitest';
import { selectContext } from '../../context/selectContext';
import { assembleOfficialDlcPlanningContext } from '../../drama/assemblePlanningContext';
import { bridgeNarrativeArcCreation } from '../../drama/narrativeArc';
import { defaultDramaticContentSettings } from '../../drama/settings';
import { dramaSourceKey } from '../../drama/types';
import { createInitialRuntimeState } from '../../runtime/initialState';
import {
  urbanLegendsFormalManifest,
  urbanLegendsFormalV1_1Manifest,
  urbanLegendsFormalV1Manifest
} from './content';
import {
  buildUrbanLegendsExpandedArcExecutionPayload,
  buildUrbanLegendsShortRumorExecutionPayload,
  urbanLegendsCharSiuBunArc,
  urbanLegendsExpandedArcDefinitions,
  urbanLegendsLastDeliveryArc,
  urbanLegendsVacantFlatArc,
  urbanLegendsV1_1ExpandedArcDefinitions,
  urbanLegendsShortRumorSeeds
} from './expandedContent';
import { urbanLegendsFormalProvider } from './provider';

function contextFor(version: string, identity: 'police' | 'civilian' | 'gang_member' = 'police') {
  const state = createInitialRuntimeState({ currentIdentity: identity });
  state.world.worldpackId = 'hk_1988';
  state.world.officialDlcBindings = [{
    dlcId: urbanLegendsFormalManifest.dlcId,
    version,
    status: 'active'
  }];
  return selectContext(state, '继续当前行动');
}

describe('Urban Legends versioned multi-arc expansion', () => {
  it('keeps the three v1.1 additions frozen and adds Last Delivery only in v1.2', () => {
    expect(urbanLegendsV1_1ExpandedArcDefinitions).toHaveLength(3);
    expect(urbanLegendsV1_1ExpandedArcDefinitions.map((arc) => arc.title)).toEqual([
      '空屋来电',
      '海旁无名灯',
      '深夜叉烧包'
    ]);
    expect(urbanLegendsExpandedArcDefinitions).toHaveLength(4);
    expect(urbanLegendsExpandedArcDefinitions.map((arc) => arc.title)).toEqual([
      '空屋来电',
      '海旁无名灯',
      '深夜叉烧包',
      '最后一份外卖'
    ]);
    for (const arc of urbanLegendsExpandedArcDefinitions) {
      expect(arc.stages).toHaveLength(5);
      expect(arc.stages.flatMap((stage) => stage.nodes)).toHaveLength(15);
      expect(arc.stages[0]?.stageId).toBe(arc.initialStageId);
      expect(arc.entryRoutes.police.contactSources.length).toBeGreaterThan(0);
      expect(arc.entryRoutes.civilian.contactSources.length).toBeGreaterThan(0);
      expect(arc.entryRoutes.gang_member.contactSources.length).toBeGreaterThan(0);
    }
  });

  it('keeps every expanded content, Arc, stage, node, actor and place identity unique', () => {
    const contentIds = urbanLegendsExpandedArcDefinitions.map((arc) => arc.contentId);
    const arcKeys = urbanLegendsExpandedArcDefinitions.map((arc) => arc.arcKey);
    const stageIds = urbanLegendsExpandedArcDefinitions.flatMap((arc) =>
      arc.stages.map((stage) => stage.stageId)
    );
    const nodeIds = urbanLegendsExpandedArcDefinitions.flatMap((arc) =>
      arc.stages.flatMap((stage) => stage.nodes.map((node) => node.nodeId))
    );
    const actorIds = urbanLegendsExpandedArcDefinitions.flatMap((arc) =>
      arc.actors.map((actor) => actor.actorId)
    );
    const placeIds = urbanLegendsExpandedArcDefinitions.flatMap((arc) =>
      arc.places.map((place) => place.placeId)
    );
    for (const values of [contentIds, arcKeys, stageIds, nodeIds, actorIds, placeIds]) {
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('treats the char-siu-bun story as a grounded long arc rather than a gore claim', () => {
    expect(urbanLegendsCharSiuBunArc.stages).toHaveLength(5);
    expect(urbanLegendsCharSiuBunArc.plannerSummary).toContain('供应链');
    expect(urbanLegendsCharSiuBunArc.plannerSummary).toContain('不能替证据作结论');
    const forbidden = [
      ...urbanLegendsCharSiuBunArc.actors.flatMap((actor) => actor.forbiddenConfirmations),
      ...urbanLegendsCharSiuBunArc.stages.flatMap((stage) => stage.forbiddenConfirmations),
      ...urbanLegendsCharSiuBunArc.resolutionBoundaries
    ].join('\n');
    expect(forbidden).toMatch(/不得|不能|不以此/);
    expect(forbidden).toMatch(/食人|人肉/);
    const payload = buildUrbanLegendsExpandedArcExecutionPayload(
      contextFor(urbanLegendsFormalManifest.version),
      urbanLegendsCharSiuBunArc,
      urbanLegendsCharSiuBunArc.initialStageId,
      'first_exposure'
    )!;
    const serialized = JSON.stringify(payload);
    expect(serialized).toContain('同一间忠记烧味包点铺');
    expect(serialized).toContain('同一名失联杂工周炳强');
    expect(serialized).toContain('不得改写成第二间同类店铺');
    expect(serialized).toContain('不得退回首次街坊恶闻模板');
    expect(
      urbanLegendsFormalProvider.list(contextFor(urbanLegendsFormalManifest.version))
        .find((source) => source.title === '深夜叉烧包')?.caseContinuityPolicy
    ).toBe('reuse_linked_when_present');
  });

  it('keeps Last Delivery evidence-led without objectively confirming ghost orders', () => {
    expect(urbanLegendsLastDeliveryArc.stages).toHaveLength(5);
    expect(urbanLegendsLastDeliveryArc.stages.flatMap((stage) => stage.nodes)).toHaveLength(15);
    expect(urbanLegendsLastDeliveryArc.plannerSummary).toContain('纸钱');
    expect(urbanLegendsLastDeliveryArc.plannerSummary).toContain('证据链');
    const boundaries = [
      ...urbanLegendsLastDeliveryArc.actors.flatMap((actor) => actor.forbiddenConfirmations),
      ...urbanLegendsLastDeliveryArc.stages.flatMap((stage) => stage.forbiddenConfirmations),
      ...urbanLegendsLastDeliveryArc.stages.flatMap((stage) =>
        stage.nodes.flatMap((node) => node.forbiddenConfirmations)
      ),
      ...urbanLegendsLastDeliveryArc.resolutionBoundaries
    ].join('\n');
    expect(boundaries).toMatch(/不得|不能|不表示|绝不/);
    expect(boundaries).toMatch(/鬼魂|超自然|死后点餐/);
    expect(boundaries).toContain('胃内容物不能独自证明食物来自目标订单');
  });

  it('treats Vacant Flat Calls as one stable incident with one witness cast', () => {
    const context = contextFor(urbanLegendsFormalManifest.version, 'police');
    const payload = buildUrbanLegendsExpandedArcExecutionPayload(
      context,
      urbanLegendsVacantFlatArc,
      urbanLegendsVacantFlatArc.initialStageId,
      'first_exposure'
    )!;
    const serialized = JSON.stringify(payload);

    expect(serialized).toContain('同一间空置单位');
    expect(serialized).toContain('同一宗持续事件');
    expect(serialized).toContain('冯玉琴是住在空屋楼下的固定目击者');
    expect(serialized).toContain('不得将她换名复制为新的来电受害者');
    expect(serialized).toContain('复用对应稳定 ID 更新同一事件');
    expect(serialized).toContain('不得退回首次报警模板');
    const source = urbanLegendsFormalProvider.list(context)
      .find((candidate) => candidate.title === '空屋来电');
    expect(source?.caseContinuityPolicy).toBe('reuse_linked_when_present');
    expect(source?.exposureEvidenceTextSignatures).toEqual([
      { allTerms: ['空屋'], anyTerms: ['来电', '电话', '铃声'] },
      { allTerms: ['空置单位'], anyTerms: ['来电', '电话', '铃声'] }
    ]);
  });

  it('provides twelve unique one-shot rumor seeds without creating narrative arcs', () => {
    expect(urbanLegendsShortRumorSeeds).toHaveLength(12);
    expect(new Set(urbanLegendsShortRumorSeeds.map((seed) => seed.sourceId)).size).toBe(12);
    for (const seed of urbanLegendsShortRumorSeeds) {
      const payload = buildUrbanLegendsShortRumorExecutionPayload(
        contextFor(urbanLegendsFormalManifest.version),
        seed
      );
      expect(payload.arcKey).toBeUndefined();
      expect(payload.contentIdentity).toBeUndefined();
      expect(payload.initialStageId).toBeUndefined();
      expect(payload.currentStageId).toBeUndefined();
      expect(payload.detailedContext).toContain('不创建 NarrativeArcInstance');
    }
  });

  it('keeps v1 and v1.1 frozen while exposing Last Delivery as the seventeenth v1.2 source', () => {
    const v1Sources = urbanLegendsFormalProvider.list(
      contextFor(urbanLegendsFormalV1Manifest.version)
    );
    const v1_1Sources = urbanLegendsFormalProvider.list(
      contextFor(urbanLegendsFormalV1_1Manifest.version)
    );
    const latestSources = urbanLegendsFormalProvider.list(
      contextFor(urbanLegendsFormalManifest.version)
    );
    expect(v1Sources).toHaveLength(1);
    expect(v1_1Sources).toHaveLength(16);
    expect(v1_1Sources.some((source) => source.title === '最后一份外卖')).toBe(false);
    expect(latestSources).toHaveLength(17);
    expect(new Set(latestSources.map((source) => dramaSourceKey(source.ref))).size).toBe(17);
    expect(latestSources.filter((source) => source.contentIdentity)).toHaveLength(5);
    expect(latestSources.filter((source) => source.reusePolicy === 'save_single_use')).toHaveLength(12);
    expect(latestSources.some((source) => source.title === '最后一份外卖')).toBe(true);
  });

  it('serializes only the current stage of an expanded Arc and preserves continuation evidence', () => {
    const definition = urbanLegendsCharSiuBunArc;
    const currentStage = definition.stages[1]!;
    const payload = buildUrbanLegendsExpandedArcExecutionPayload(
      contextFor(urbanLegendsFormalManifest.version, 'civilian'),
      definition,
      currentStage.stageId,
      'continuation',
      {
        lastProgressTurn: 8,
        usedNodeIds: [definition.stages[0]!.nodes[0]!.nodeId],
        progressSummary: '肉料传闻与杂工失联被证实是两个不同来源的消息。',
        groundedSummary: '卫生巡查记录与供货簿存在可核对差异。',
        appliedWritebackRefs: [{ kind: 'signal', id: 'signal_supply_gap' }],
        groundedFacts: [],
        unresolvedContext: ['谁最早把两条消息拼成同一个版本仍未确认。']
      }
    )!;
    expect(payload.currentStageId).toBe(currentStage.stageId);
    expect(payload.initialStageId).toBeUndefined();
    expect(payload.detailedContext).toContain('肉料传闻与杂工失联');
    expect(payload.detailedContext).toContain('signal:signal_supply_gap');
    expect(payload.detailedContext).toContain(definition.stages[0]!.nodes[0]!.nodeId);
    for (const futureStage of definition.stages.slice(2)) {
      expect(payload.detailedContext).not.toContain(futureStage.title);
      for (const node of futureStage.nodes) {
        expect(JSON.stringify(payload)).not.toContain(node.nodeId);
      }
    }
  });

  it('keeps used current-stage nodes in the contract but removes them from first-use choices', () => {
    const definition = urbanLegendsVacantFlatArc;
    const currentStage = definition.stages[0]!;
    const identityNodes = currentStage.nodes.filter((node) =>
      node.compatibleIdentities.includes('police')
    );
    const usedNodeId = identityNodes[0]!.nodeId;
    const unusedNodeId = identityNodes[1]!.nodeId;
    const payload = buildUrbanLegendsExpandedArcExecutionPayload(
      contextFor(urbanLegendsFormalManifest.version, 'police'),
      definition,
      currentStage.stageId,
      'continuation',
      {
        lastProgressTurn: 22,
        usedNodeIds: [usedNodeId],
        progressSummary: '楼下住客已经完成首次报称，线路与门锁仍待核对。',
        groundedSummary: '同一间空置单位及同一名目击者已进入既有事项。',
        appliedWritebackRefs: [{ kind: 'current_matter', id: 'matter_vacant_flat' }],
        groundedFacts: [],
        unresolvedContext: ['铃声来源仍未确认。']
      }
    )!;

    expect(payload.detailedContext).toContain(`本阶段已使用节点（仅可承接既有结果，不得重新作为首次发现）：${usedNodeId}`);
    expect(payload.mutableElements).not.toContain(`当前可用节点=${usedNodeId}`);
    expect(payload.mutableElements).toContain(`当前可用节点=${unusedNodeId}`);
    expect(payload.arcProgressContract?.nodeIdsByStage[currentStage.stageId]).toContain(usedNodeId);
  });

  it('bridges a long story into one Arc while keeping short rumors arc-free', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.world.worldpackId = 'hk_1988';
    state.world.officialDlcBindings = [{
      dlcId: urbanLegendsFormalManifest.dlcId,
      version: urbanLegendsFormalManifest.version,
      status: 'active'
    }];
    const context = selectContext(state, '查看附近情况');
    const sources = urbanLegendsFormalProvider.list(context);
    const longSource = sources.find((source) => source.title === '深夜叉烧包')!;
    const rumorSource = sources.find((source) => source.reusePolicy === 'save_single_use')!;

    const longPlanning = assembleOfficialDlcPlanningContext(
      state,
      context,
      defaultDramaticContentSettings,
      '查看附近情况',
      [longSource]
    );
    const longBridge = bridgeNarrativeArcCreation({
      state,
      context: longPlanning,
      trace: {
        planId: 'plan_long_arc',
        status: 'used_as_texture',
        usedSourceRefs: [longSource.ref],
        resultingWritebackRefs: []
      },
      resolveExecutionPayload: (ref, options) =>
        urbanLegendsFormalProvider.getExecutionPayload(context, ref, options)
    });
    expect(longBridge.trace?.narrativeArcProgress).toEqual([
      expect.objectContaining({
        sourceRef: longSource.ref,
        decision: 'remain',
        currentStageId: urbanLegendsCharSiuBunArc.initialStageId
      })
    ]);

    const rumorPlanning = assembleOfficialDlcPlanningContext(
      state,
      context,
      defaultDramaticContentSettings,
      '听听街坊传闻',
      [rumorSource]
    );
    const rumorBridge = bridgeNarrativeArcCreation({
      state,
      context: rumorPlanning,
      trace: {
        planId: 'plan_short_rumor',
        status: 'used_as_texture',
        usedSourceRefs: [rumorSource.ref],
        resultingWritebackRefs: []
      },
      resolveExecutionPayload: (ref, options) =>
        urbanLegendsFormalProvider.getExecutionPayload(context, ref, options)
    });
    expect(rumorBridge.trace?.narrativeArcProgress).toBeUndefined();
    expect(rumorBridge.diagnostics).toEqual([]);
  });
});
