import { describe, expect, it } from 'vitest';
import { selectContext } from '../context/selectContext';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  clusterDramaPlanningSources,
  createForegroundContract,
  focusPromptContext
} from './coherence';
import { defaultDramaticContentSettings, resolveDramaMaterialBudget } from './settings';
import type { DramaPlan, DramaPlanningContext, PlanningSource } from './types';

function source(overrides: Partial<PlanningSource> & Pick<PlanningSource, 'ref'>): PlanningSource {
  return {
    title: overrides.ref.sourceId,
    plannerSummary: `${overrides.ref.sourceId} 摘要`,
    sourceStatus: 'active_process',
    reusePolicy: 'context_reusable',
    priorityClass: 'normal',
    channelIds: ['cases_law'],
    softAffinities: {},
    mandatory: false,
    score: 50,
    relatedActorIds: [],
    relatedOrganizationIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    ...overrides
  };
}

describe('dramatic foreground coherence', () => {
  it('collapses several structured projections of the same case into one arc with all evidence refs', () => {
    const sources = clusterDramaPlanningSources([
      source({
        ref: {
          providerId: 'runtime-dynamic',
          sourceType: 'current_matter',
          sourceId: 'matter_case_1'
        },
        relatedCaseIds: ['case_1'],
        caseContinuityPolicy: 'reuse_linked_when_present'
      }),
      source({
        ref: {
          providerId: 'runtime-case',
          sourceType: 'case',
          sourceId: 'case_1'
        },
        score: 80,
        relatedCaseIds: ['case_1']
      })
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0]?.arcKey).toBe('case:case_1');
    expect(sources[0]?.evidenceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'current_matter', sourceId: 'matter_case_1' }),
      expect.objectContaining({ sourceType: 'case', sourceId: 'case_1' })
    ]));
    expect(sources[0]?.caseContinuityPolicy).toBe('reuse_linked_when_present');
  });

  it('creates an ephemeral contract and keeps due matters while filtering unrelated optional matters', () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '继续处理眼前的事情');
    context.dynamicProjection.currentMatters = [
      {
        id: 'matter_selected',
        title: '已选事项',
        summary: '与本回合计划直接相关。',
        status: 'active',
        priority: 80,
        visibility: 'known',
        source: 'test',
        matterKind: 'world',
        relatedActorIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedOrganizationIds: [],
        createdAt: state.time,
        updatedAt: state.time
      },
      {
        id: 'matter_due',
        title: '到期事项',
        summary: '已经到期，必须保留。',
        status: 'active',
        priority: 80,
        visibility: 'known',
        source: 'test',
        matterKind: 'world',
        relatedActorIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedOrganizationIds: [],
        createdAt: state.time,
        updatedAt: state.time
      },
      {
        id: 'matter_unrelated',
        title: '无关事项',
        summary: '仍在后台，不进入本回合前台。',
        status: 'active',
        priority: 50,
        visibility: 'known',
        source: 'test',
        matterKind: 'world',
        relatedActorIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedOrganizationIds: [],
        createdAt: state.time,
        updatedAt: state.time
      }
    ];
    context.dynamicProjection.diagnostics = {
      ...context.dynamicProjection.diagnostics,
      dueCurrentMatterIds: ['matter_due']
    };
    const selected = source({
      ref: {
        providerId: 'runtime-dynamic',
        sourceType: 'current_matter',
        sourceId: 'matter_selected'
      },
      relatedCaseIds: ['case_selected'],
      caseContinuityPolicy: 'reuse_linked_when_present'
    });
    const settings = {
      ...defaultDramaticContentSettings,
      pacing: 'balanced' as const
    };
    const planningContext: DramaPlanningContext = {
      planningScope: 'turn',
      planningMode: 'full',
      turnCounter: state.turnCounter,
      currentTime: state.time,
      playerInput: '继续处理眼前的事情',
      playerRoleContext: {
        identity: 'police',
        publicRole: '警员',
        stableContactActorIds: [],
        activeMatterIds: []
      },
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      settings,
      pacing: settings.pacing,
      materialBudget: resolveDramaMaterialBudget(settings),
      recentTurnSummaries: [],
      requiredContextSources: [],
      userPrioritySources: [],
      optionalDynamicSources: [selected],
      staticSeedSources: [],
      recentExecutions: [],
      filterRuleIds: []
    };
    const plan: DramaPlan = {
      planId: `drama_plan_turn_${state.turnCounter}`,
      planningScope: 'turn',
      mode: 'continue_existing',
      primarySource: selected.ref,
      supportSources: [],
      sceneFunction: 'information',
      intensity: 'low',
      playerMayIgnore: true,
      maxNewActors: 0,
      reasonSummary: '只承接一条已选事项。'
    };
    const contract = createForegroundContract({
      context: planningContext,
      promptContext: context,
      plan,
      origin: 'main_two_pass'
    });
    const focused = focusPromptContext(context, contract);

    expect(contract.allowedMatterIds).toEqual(['matter_selected']);
    expect(contract.caseContinuityPolicy).toBe('reuse_linked_when_present');
    expect(contract.caseContinuityCaseIds).toEqual(['case_selected']);
    expect(focused.dynamicProjection.currentMatters.map((matter) => matter.id)).toEqual([
      'matter_selected',
      'matter_due'
    ]);
  });
});
