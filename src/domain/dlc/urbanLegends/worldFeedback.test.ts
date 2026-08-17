import { describe, expect, it } from 'vitest';
import { selectContext } from '../../context/selectContext';
import {
  applyNarrativeArcProgress,
  validateNarrativeArcProgressShape
} from '../../drama/narrativeArc';
import type { DramaExecutionTrace, DramaPlanningContext } from '../../drama/types';
import { createInitialRuntimeState } from '../../runtime/initialState';
import { buildUrbanLegendsFormalPlanningSource } from './provider';
import {
  urbanLegendsFormalIds,
  urbanLegendsFormalManifest
} from './content';
import { buildUrbanLegendsFormalExecutionPayload, urbanLegendsFormalSourceRef } from './stagePayload';
import { urbanLegendsFormalStageContracts } from './stageContracts';
import {
  getUrbanLegendsNewsEvolutionTemplatesForStage,
  getUrbanLegendsResolutionContractsForStage,
  urbanLegendsDlcCompletionPolicy,
  urbanLegendsNewsEvolutionTemplates,
  urbanLegendsResolutionContracts,
  urbanLegendsStageWorldFeedbackContracts
} from './worldFeedback';

function promptContext() {
  const state = createInitialRuntimeState({ currentIdentity: 'police' });
  state.world.worldpackId = 'hk_1988';
  state.world.officialDlcBindings = [{
    dlcId: urbanLegendsFormalManifest.dlcId,
    version: urbanLegendsFormalManifest.version,
    status: 'active'
  }];
  return { state, context: selectContext(state, '继续当前行动') };
}

describe('Urban Legends formal Phase 2E world feedback contracts', () => {
  it('covers every stage and keeps all engagement outcomes evidence-gated', () => {
    expect(urbanLegendsStageWorldFeedbackContracts.map((contract) => contract.stageId)).toEqual(
      urbanLegendsFormalStageContracts.map((stage) => stage.stageId)
    );
    for (const contract of urbanLegendsStageWorldFeedbackContracts) {
      expect(Object.keys(contract.engagement)).toEqual([
        'intervene',
        'ignore',
        'failed_attempt',
        'withdraw'
      ]);
      for (const engagement of Object.values(contract.engagement)) {
        expect(engagement).toMatchObject({
          requiresAppliedWritebackForProgress: true,
          preservesArcInstanceId: true,
          neverResetsStage: true,
          reminderPolicy: 'no_forced_reminder'
        });
        expect(engagement.allowedWritebackKinds.length).toBeGreaterThan(0);
        expect(engagement.forbiddenResults.join('\n')).toMatch(/不得.*重置剧情弧/);
      }
    }
  });

  it('allows failure, ignoring and withdrawal to create consequences without treating them as automatic success', () => {
    for (const contract of urbanLegendsStageWorldFeedbackContracts) {
      expect(contract.engagement.ignore.narrativeRule).toContain('忽略本身不是阶段进展');
      expect(contract.engagement.failed_attempt.narrativeRule).toContain('失败形成新的世界状态而不是回档');
      expect(contract.engagement.withdraw.narrativeRule).toContain('保留同一个 Arc');
      expect(contract.engagement.ignore.allowedArcDecisions).toContain('remain');
      expect(contract.engagement.failed_attempt.allowedArcDecisions).toContain('remain');
      expect(contract.engagement.withdraw.allowedArcDecisions).toContain('abandon');
    }
  });

  it('limits NPC autonomy to established actors, known channels and applied world changes', () => {
    for (const contract of urbanLegendsStageWorldFeedbackContracts) {
      expect(contract.npcAutonomy).toMatchObject({
        requiresEstablishedActorOrExplicitActorWriteback: true,
        requiresKnownInformationChannel: true,
        requiresAppliedWritebackForStageProgress: true,
        mayContinueOutsidePlayerView: true,
        mayForcePlayerReturn: false
      });
      expect(contract.npcAutonomy.eligibleActorIds.length).toBeGreaterThan(0);
      expect(contract.npcAutonomy.possibleActions.length).toBeGreaterThan(1);
      expect(contract.npcAutonomy.forbiddenResults.join('\n')).toMatch(/不得.*凭空知道|不得.*凭空知情/);
    }
  });

  it('exposes all three bounded resolution modes only at truth and aftermath stages', () => {
    expect(urbanLegendsResolutionContracts.map((resolution) => resolution.mode)).toEqual([
      'reality_leaning',
      'plural_ambiguity',
      'bounded_unexplained_residue'
    ]);
    for (const stageId of [
      urbanLegendsFormalIds.stages.streetRumor,
      urbanLegendsFormalIds.stages.firstClues,
      urbanLegendsFormalIds.stages.interestConflict
    ]) {
      expect(getUrbanLegendsResolutionContractsForStage(stageId)).toEqual([]);
    }
    for (const stageId of [
      urbanLegendsFormalIds.stages.truthInvestigation,
      urbanLegendsFormalIds.stages.aftermath
    ]) {
      expect(getUrbanLegendsResolutionContractsForStage(stageId)).toHaveLength(3);
    }
    expect(JSON.stringify(urbanLegendsResolutionContracts)).toMatch(/不得确认鬼魂|不得.*超自然/);
    expect(JSON.stringify(urbanLegendsResolutionContracts)).not.toContain('超自然已被客观证实');
  });

  it('keeps news as stage-bounded public accounts rather than objective truth', () => {
    expect(urbanLegendsNewsEvolutionTemplates).toHaveLength(4);
    expect(
      getUrbanLegendsNewsEvolutionTemplatesForStage(urbanLegendsFormalIds.stages.streetRumor)
        .map((template) => template.templateId)
    ).toEqual([urbanLegendsFormalIds.news.firstPublicRumor]);
    expect(
      getUrbanLegendsNewsEvolutionTemplatesForStage(urbanLegendsFormalIds.stages.interestConflict)
        .map((template) => template.templateId)
    ).toEqual([urbanLegendsFormalIds.news.contestedCoverage]);
    expect(
      getUrbanLegendsNewsEvolutionTemplatesForStage(urbanLegendsFormalIds.stages.aftermath)
        .map((template) => template.templateId)
    ).toEqual([
      urbanLegendsFormalIds.news.correctionOrSilence,
      urbanLegendsFormalIds.news.aftermathRetelling
    ]);
    for (const template of urbanLegendsNewsEvolutionTemplates) {
      expect(template.publicFactBoundary).toMatch(/事实|确认/);
      expect(template.forbiddenClaims.join('\n')).toMatch(/不得/);
    }
  });

  it('serializes only current-stage feedback, news and resolution data', () => {
    const { context } = promptContext();
    const rumorPayload = buildUrbanLegendsFormalExecutionPayload(
      context,
      urbanLegendsFormalIds.stages.streetRumor
    )!;
    expect(rumorPayload.detailedContext).toContain(urbanLegendsFormalIds.news.firstPublicRumor);
    expect(rumorPayload.arcProgressContract?.completionStageIds).toEqual([]);
    expect(rumorPayload.detailedContext).not.toContain(urbanLegendsFormalIds.news.contestedCoverage);
    expect(rumorPayload.detailedContext).not.toContain(urbanLegendsFormalIds.news.correctionOrSilence);
    for (const resolution of urbanLegendsResolutionContracts) {
      expect(rumorPayload.detailedContext).not.toContain(resolution.resolutionId);
    }

    const truthPayload = buildUrbanLegendsFormalExecutionPayload(
      context,
      urbanLegendsFormalIds.stages.truthInvestigation,
      'continuation'
    )!;
    expect(truthPayload.detailedContext).toContain(urbanLegendsFormalIds.news.correctionOrSilence);
    expect(truthPayload.arcProgressContract?.completionStageIds).toEqual([
      urbanLegendsFormalIds.stages.aftermath
    ]);
    expect(truthPayload.detailedContext).not.toContain(urbanLegendsFormalIds.news.aftermathRetelling);
    for (const resolution of urbanLegendsResolutionContracts) {
      expect(truthPayload.detailedContext).toContain(resolution.resolutionId);
    }

    const aftermathPayload = buildUrbanLegendsFormalExecutionPayload(
      context,
      urbanLegendsFormalIds.stages.aftermath,
      'continuation'
    )!;
    expect(aftermathPayload.detailedContext).toContain(urbanLegendsFormalIds.news.aftermathRetelling);
    expect(aftermathPayload.arcProgressContract?.completionStageIds).toEqual([
      urbanLegendsFormalIds.stages.aftermath
    ]);
    expect(aftermathPayload.detailedContext).toContain('不自动把整个 DLC 标记为 completed');
    expect(aftermathPayload.forbiddenAdaptations).toContain(
      `主 Arc 完成不自动完成整个 DLC：${urbanLegendsDlcCompletionPolicy.currentVersionPolicy}`
    );
  });

  it('permits Arc completion only in aftermath and never treats it as DLC completion', () => {
    expect(
      urbanLegendsStageWorldFeedbackContracts
        .filter((contract) => contract.completionAllowed)
        .map((contract) => contract.stageId)
    ).toEqual([urbanLegendsFormalIds.stages.aftermath]);
    expect(urbanLegendsDlcCompletionPolicy).toMatchObject({
      primaryArcId: urbanLegendsFormalIds.arcKey,
      primaryArcCompletionCompletesDlc: false,
      automaticallyMutatesBindingStatus: false,
      completedArcHistoryIsRetained: true,
      completedActorsRemainOrdinaryWorldActors: true
    });

    const { state, context } = promptContext();
    const source = buildUrbanLegendsFormalPlanningSource(context);
    const planningContext = {
      requiredContextSources: [],
      userPrioritySources: [],
      optionalDynamicSources: [],
      staticSeedSources: [],
      officialDlcSources: [source]
    } as unknown as DramaPlanningContext;
    state.narrativeArcs = [{
      arcInstanceId: 'arc_urban_legends_midnight_bus',
      sourceRef: { ...urbanLegendsFormalSourceRef },
      arcType: 'official_dlc',
      status: 'active',
      currentStageId: urbanLegendsFormalIds.stages.aftermath,
      usedNodeIds: [urbanLegendsFormalIds.nodes.publicAccount],
      createdTurn: 1,
      lastProgressTurn: 4,
      writebackRefs: [{ kind: 'newsIssue', id: 'news_midnight_bus_public_account' }]
    }];
    const earlyArc = {
      ...state.narrativeArcs[0]!,
      currentStageId: urbanLegendsFormalIds.stages.streetRumor,
      usedNodeIds: [urbanLegendsFormalIds.nodes.neighborhoodRumor]
    };
    expect(validateNarrativeArcProgressShape({
      progress: {
        arcInstanceId: earlyArc.arcInstanceId,
        sourceRef: { ...urbanLegendsFormalSourceRef },
        decision: 'complete',
        currentStageId: urbanLegendsFormalIds.stages.streetRumor,
        usedNodeIds: [urbanLegendsFormalIds.nodes.neighborhoodRumor],
        supportingWritebackRefs: [{ kind: 'signal', id: 'signal_midnight_bus_rumor' }]
      },
      context: planningContext,
      existingArcs: [earlyArc]
    })).toBe('当前阶段不允许完成剧情弧。');
    expect(validateNarrativeArcProgressShape({
      progress: {
        arcInstanceId: state.narrativeArcs[0]!.arcInstanceId,
        sourceRef: { ...urbanLegendsFormalSourceRef },
        decision: 'complete',
        currentStageId: urbanLegendsFormalIds.stages.aftermath,
        usedNodeIds: [urbanLegendsFormalIds.nodes.publicAccount],
        supportingWritebackRefs: [{ kind: 'newsIssue', id: 'news_midnight_bus_public_account' }]
      },
      context: planningContext,
      existingArcs: state.narrativeArcs
    })).toBeUndefined();
    const trace: DramaExecutionTrace = {
      planId: 'plan_aftermath',
      status: 'used_persistently',
      usedSourceRefs: [{ ...urbanLegendsFormalSourceRef }],
      resultingWritebackRefs: [{ kind: 'newsIssue', id: 'news_midnight_bus_public_account' }],
      narrativeArcProgress: [{
        arcInstanceId: 'arc_urban_legends_midnight_bus',
        sourceRef: { ...urbanLegendsFormalSourceRef },
        decision: 'complete',
        currentStageId: urbanLegendsFormalIds.stages.aftermath,
        usedNodeIds: [urbanLegendsFormalIds.nodes.publicAccount],
        supportingWritebackRefs: [{ kind: 'newsIssue', id: 'news_midnight_bus_public_account' }],
        summary: '已形成公开说法并保留一处有界疑问。'
      }]
    };
    const completed = applyNarrativeArcProgress(state, trace);
    expect(completed.narrativeArcs?.[0]?.status).toBe('completed');
    expect(completed.world.officialDlcBindings).toEqual(state.world.officialDlcBindings);
    expect(completed.world.officialDlcBindings?.[0]?.status).toBe('active');
  });
});
