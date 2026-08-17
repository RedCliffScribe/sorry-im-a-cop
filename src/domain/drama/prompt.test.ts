import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { selectContext } from '../context/selectContext';
import { defaultDramaticContentSettings, resolveDramaMaterialBudget } from './settings';
import { formatDramaExecutionPrompt } from './prompt';
import type { DramaPlan, DramaPlanningContext, ForegroundContract } from './types';

describe('drama execution prompt', () => {
  it('normally executes a valid non-quiet plan and documents object-shaped trace refs', () => {
    const state = createInitialRuntimeState();
    const settings = {
      ...defaultDramaticContentSettings,
      pacing: 'dramatic' as const
    };
    const context = selectContext(state, '继续观察');
    const planningContext: DramaPlanningContext = {
      planningScope: 'turn',
      planningMode: 'full',
      turnCounter: 1,
      currentTime: state.time,
      playerInput: '继续观察',
      playerRoleContext: {
        identity: 'police',
        publicRole: '警员',
        stableContactActorIds: [],
        activeMatterIds: []
      },
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      settings,
      pacing: 'dramatic',
      materialBudget: resolveDramaMaterialBudget(settings),
      recentTurnSummaries: [],
      requiredContextSources: [],
      userPrioritySources: [],
      optionalDynamicSources: [],
      staticSeedSources: [],
      recentExecutions: [],
      filterRuleIds: []
    };
    const plan: DramaPlan = {
      planId: 'drama_plan_turn_1',
      planningScope: 'turn',
      mode: 'surface',
      primarySource: {
        providerId: 'runtime-dynamic',
        sourceType: 'signal',
        sourceId: 'signal_1'
      },
      supportSources: [],
      sceneFunction: 'information',
      intensity: 'low',
      playerMayIgnore: true,
      maxNewActors: 0,
      reasonSummary: '让既有动态自然浮到前台。'
    };
    const contract: ForegroundContract = {
      planId: plan.planId,
      mode: plan.mode,
      origin: 'main_two_pass',
      selectedSourceRefs: [plan.primarySource!],
      evidenceSourceRefs: [plan.primarySource!],
      mandatorySourceRefs: [],
      allowedActorIds: [],
      allowedOrganizationIds: [],
      allowedPlaceIds: [state.location.currentPlaceId],
      allowedCaseIds: [],
      allowedMatterIds: [],
      allowedRelationshipThreadIds: [],
      allowedCityTrackIds: [],
      maxForegroundArcs: 1,
      maxNewActors: 0,
      maxNewDurableThreads: 1
    };

    const prompt = formatDramaExecutionPrompt({
      context,
      planningContext,
      plan,
      contract
    });

    expect(prompt).toContain('合法的非 quiet 计划是本回合预期采用的前台方向');
    expect(prompt).toContain('只有计划与玩家当前行动');
    expect(prompt).toContain('usedSourceRefs 的每一项必须是 {"providerId":"..."');
    expect(prompt).toContain('resultingWritebackRefs 的每一项必须是 {"kind":"..."');
    expect(prompt).toContain('仅引用、延续或描写既有事项');
    expect(prompt).toContain('status 为 not_used、used_as_texture 或 partially_used 时必须返回 []');
    expect(prompt).toContain('前台契约');
    expect(prompt).toContain('只允许一个主要剧情弧');
    expect(prompt).toContain('不要重复返回 dramaPlan');
  });
});
