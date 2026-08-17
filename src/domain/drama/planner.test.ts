import { describe, expect, it, vi } from 'vitest';
import type { NarratorClient } from '../narrator/NarratorClient';
import { createInitialRuntimeState } from '../runtime/initialState';
import { defaultDramaticContentSettings, resolveDramaMaterialBudget } from './settings';
import {
  createFallbackDramaPlan,
  parseDramaticPlanCandidate,
  planDramaticTurn
} from './planner';
import type { DramaPlanningContext, PlanningSource } from './types';

const source: PlanningSource = {
  ref: {
    providerId: 'runtime-dynamic',
    sourceType: 'current_matter',
    sourceId: 'matter_1'
  },
  title: '仍在处理的事项',
  plannerSummary: '一个已经确认且仍在处理的事项。',
  sourceStatus: 'active_process',
  reusePolicy: 'context_reusable',
  priorityClass: 'normal',
  channelIds: ['cases_law'],
  softAffinities: {},
  mandatory: true,
  score: 100,
  relatedActorIds: [],
  relatedOrganizationIds: [],
  relatedPlaceIds: [],
  relatedCaseIds: []
};

function context(): DramaPlanningContext {
  const state = createInitialRuntimeState();
  const settings = {
    ...defaultDramaticContentSettings,
    pacing: 'balanced' as const
  };
  return {
    planningScope: 'turn',
    planningMode: 'full',
    turnCounter: state.turnCounter,
    currentTime: state.time,
    playerInput: '继续处理',
    playerRoleContext: {
      identity: 'police',
      publicRole: '警员',
      stableContactActorIds: [],
      activeMatterIds: []
    },
    currentPlaceId: state.location.currentPlaceId,
    currentSceneId: state.location.currentSceneId,
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
}

function clientReturning(value: unknown): NarratorClient {
  return {
    complete: vi.fn().mockResolvedValue(value)
  };
}

describe('dramatic turn planner', () => {
  it('accepts official DLC provenance on selected source references', () => {
    const officialRef = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: 'urban_legends_alpha:midnight_bus',
      dlcId: 'urban_legends_alpha'
    };
    const result = parseDramaticPlanCandidate({
      context: {
        ...context(),
        planningMode: 'official_dlc_only',
        planningRoute: 'official_dlc_only',
        requiredContextSources: [],
        officialDlcSources: [{
          ...source,
          ref: officialRef,
          title: '午夜末班车',
          plannerSummary: '夜间巴士传闻。',
          sourceStatus: 'static_seed',
          channelIds: ['city_news'],
          priorityClass: 'user_requested',
          mandatory: false,
          score: 80
        }]
      },
      raw: {
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'surface',
        primarySource: officialRef,
        supportSources: [],
        sceneFunction: 'information',
        intensity: 'low',
        playerMayIgnore: true,
        maxNewActors: 0,
        reasonSummary: '街坊传闻可作为自然接触点。'
      }
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.plan?.primarySource).toEqual(officialRef);
  });

  it('normalizes a surfaced active process into the existing event without new actors', () => {
    const result = parseDramaticPlanCandidate({
      context: context(),
      raw: {
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'surface',
        primarySource: source.ref,
        supportSources: [],
        sceneFunction: 'information',
        intensity: 'low',
        playerMayIgnore: true,
        maxNewActors: 2,
        reasonSummary: '把已有事项重新带到前台。'
      }
    });

    expect(result.plan).toMatchObject({
      mode: 'continue_existing',
      primarySource: source.ref,
      maxNewActors: 0
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'planning_mode_normalized'
      })
    ]);
  });

  it('projects recent orchestration outcomes and active pacing guidance into the planner prompt', async () => {
    const dramaticContext = context();
    dramaticContext.pacing = 'dramatic';
    dramaticContext.settings = {
      ...dramaticContext.settings,
      pacing: 'dramatic'
    };
    dramaticContext.recentExecutions = [{
      turnCounter: 3,
      pacing: 'dramatic',
      planningRoute: 'auto',
      materialLevel: 'standard',
      storypackInfluence: 'high',
      screenCharacterSeedsEnabled: true,
      planningCalled: true,
      planningSucceeded: true,
      planningDurationMs: 10,
      inputCandidateCount: 1,
      inputCharacterCount: 100,
      estimatedInputTokens: 25,
      planMode: 'quiet',
      supportSourceRefs: [],
      usedSourceRefs: [],
      persistentWriteCount: 0,
      filterRuleIds: []
    }];
    dramaticContext.narrativeArcSummaries = [{
      arcInstanceId: 'arc_midnight_bus',
      sourceRef: {
        providerId: 'official-dlc',
        sourceType: 'official_dlc_event',
        sourceId: 'urban_legends_alpha:midnight_bus',
        dlcId: 'urban_legends_alpha'
      },
      arcType: 'official_dlc',
      status: 'active',
      currentStageId: 'street_rumor',
      summary: '司机证词与旧线路资料存在矛盾。',
      lastProgressTurn: 3
    }];
    const client = clientReturning({
      planId: 'drama_plan_turn_0',
      planningScope: 'turn',
      mode: 'quiet',
      primarySource: null,
      supportSources: [],
      sceneFunction: 'rest',
      intensity: 'none',
      playerMayIgnore: true,
      maxNewActors: 0,
      reasonSummary: '当前行动需要留白。'
    });

    await planDramaticTurn({
      context: dramaticContext,
      client
    });

    const prompt = vi.mocked(client.complete).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('不要机械连续返回 quiet');
    expect(prompt).toContain('surface 只用于尚未在最近编排中进入前台的来源');
    expect(prompt).toContain('不得连续把同一来源重复标记为 surface');
    expect(prompt).toContain('"planMode":"quiet"');
    expect(prompt).toContain('arc_midnight_bus');
    expect(prompt).toContain('司机证词与旧线路资料存在矛盾');
    expect(prompt).toContain('已曝光剧情弧只提供紧凑摘要');
  });

  it('accepts a bounded plan that only references registered candidates', async () => {
    const result = await planDramaticTurn({
      context: context(),
      client: clientReturning({
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'continue_existing',
        primarySource: source.ref,
        supportSources: [],
        sceneFunction: 'information',
        intensity: 'low',
        playerMayIgnore: true,
        maxNewActors: 0,
        adaptationSummary: '让既有事项自然来到前台',
        reasonSummary: '既有事项已经需要玩家处理。'
      })
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.plan?.primarySource).toEqual(source.ref);
  });

  it('validates a same-turn main-narrator plan without making another request', () => {
    const result = parseDramaticPlanCandidate({
      context: context(),
      raw: {
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'continue_existing',
        primarySource: source.ref,
        supportSources: [],
        sceneFunction: 'information',
        intensity: 'low',
        playerMayIgnore: true,
        maxNewActors: 0,
        reasonSummary: '既有事项已经需要玩家处理。'
      }
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.plan?.primarySource).toEqual(source.ref);
  });

  it('unwraps candidate envelopes without relaxing registered-source validation', () => {
    const result = parseDramaticPlanCandidate({
      context: context(),
      raw: {
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'continue_existing',
        primarySource: {
          ref: source.ref,
          title: source.title,
          plannerSummary: source.plannerSummary
        },
        supportSources: [],
        sceneFunction: 'information',
        intensity: 'low',
        playerMayIgnore: true,
        maxNewActors: 0,
        adaptationSummary: null,
        reasonSummary: '既有事项已经需要玩家处理。'
      }
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.plan?.primarySource).toEqual(source.ref);
    expect(result.plan?.adaptationSummary).toBeUndefined();
  });

  it('still rejects an unknown source hidden inside a candidate envelope', () => {
    const result = parseDramaticPlanCandidate({
      context: context(),
      raw: {
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'continue_existing',
        primarySource: {
          ref: {
            providerId: 'invented',
            sourceType: 'current_matter',
            sourceId: 'missing'
          }
        },
        supportSources: [],
        sceneFunction: 'information',
        intensity: 'low',
        playerMayIgnore: true,
        maxNewActors: 0,
        reasonSummary: '尝试使用未知来源。'
      }
    });

    expect(result.plan).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('planning_failed');
  });

  it('keeps an explicit quiet decision while discarding echoed candidate refs', () => {
    const quietContext = context();
    quietContext.requiredContextSources = [];
    quietContext.optionalDynamicSources = [{
      ...source,
      mandatory: false
    }];
    const result = parseDramaticPlanCandidate({
      context: quietContext,
      raw: {
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'quiet',
        primarySource: {
          ref: source.ref,
          title: source.title
        },
        supportSources: [source],
        sceneFunction: 'pressure',
        intensity: 'high',
        playerMayIgnore: true,
        maxNewActors: 2,
        reasonSummary: '本回合保持安静。'
      }
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.plan).toMatchObject({
      mode: 'quiet',
      primarySource: null,
      supportSources: [],
      sceneFunction: 'rest',
      intensity: 'none',
      maxNewActors: 0
    });
  });

  it('rejects a quiet plan while a mandatory source is due', () => {
    const result = parseDramaticPlanCandidate({
      context: context(),
      raw: {
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'quiet',
        primarySource: null,
        supportSources: [],
        sceneFunction: 'rest',
        intensity: 'none',
        playerMayIgnore: true,
        maxNewActors: 0,
        reasonSummary: '本回合保持安静。'
      }
    });

    expect(result.plan).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'planning_failed',
        message: '规划遗漏了到期或必须进入前台的来源。'
      })
    ]);
  });

  it('turns malformed same-turn planning metadata into a diagnostic instead of throwing', () => {
    const result = parseDramaticPlanCandidate({
      context: context(),
      raw: {
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'surface'
      }
    });

    expect(result.plan).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('planning_schema_invalid');
  });

  it('turns an unknown source reference into a non-blocking diagnostic', async () => {
    const result = await planDramaticTurn({
      context: context(),
      client: clientReturning({
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'surface',
        primarySource: {
          providerId: 'invented',
          sourceType: 'current_matter',
          sourceId: 'missing'
        },
        supportSources: [],
        sceneFunction: 'information',
        intensity: 'low',
        playerMayIgnore: true,
        maxNewActors: 0,
        reasonSummary: '尝试使用未知来源。'
      })
    });

    expect(result.plan).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('planning_failed');
  });

  it('does not retry or throw when the planning route fails', async () => {
    const client: NarratorClient = {
      complete: vi.fn().mockRejectedValue(new Error('429'))
    };
    const result = await planDramaticTurn({ context: context(), client });

    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(result.plan).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({
      code: 'planning_failed',
      message: '429'
    });
  });

  it('keeps original-pacing user intent non-mandatory and quiet on local fallback', async () => {
    const narrowContext = context();
    const userPrioritySource: PlanningSource = {
      ...source,
      ref: {
        providerId: 'custom-character',
        sourceType: 'custom_character_binding',
        sourceId: 'binding_1'
      },
      priorityClass: 'user_requested',
      mandatory: false
    };
    narrowContext.planningMode = 'custom_intent_only';
    narrowContext.pacing = 'original';
    narrowContext.settings = {
      ...narrowContext.settings,
      pacing: 'original'
    };
    narrowContext.requiredContextSources = [];
    narrowContext.userPrioritySources = [userPrioritySource];

    const client = clientReturning({
      planId: 'drama_plan_turn_0',
      planningScope: 'turn',
      mode: 'quiet',
      primarySource: null,
      supportSources: [],
      sceneFunction: 'rest',
      intensity: 'none',
      playerMayIgnore: true,
      maxNewActors: 0,
      reasonSummary: '当前现场没有自然入口，保留玩家意图。'
    });
    const result = await planDramaticTurn({
      context: narrowContext,
      client
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.plan?.mode).toBe('quiet');
    expect(vi.mocked(client.complete).mock.calls[0]?.[0]).toContain(
      '规划模式：custom_intent_only'
    );
    expect(vi.mocked(client.complete).mock.calls[0]?.[0]).toContain(
      '"priorityClass":"user_requested"'
    );
    expect(createFallbackDramaPlan(narrowContext)).toMatchObject({
      mode: 'quiet',
      primarySource: null
    });
  });

  it('rejects an ordinary static seed that jumps ahead of user-requested content', () => {
    const priorityContext = context();
    const userPrioritySource: PlanningSource = {
      ...source,
      ref: {
        providerId: 'custom-character',
        sourceType: 'custom_character_binding',
        sourceId: 'binding_priority'
      },
      priorityClass: 'user_requested',
      mandatory: false
    };
    const staticSource: PlanningSource = {
      ...source,
      ref: {
        providerId: 'storypack',
        sourceType: 'drama_motif_card',
        sourceId: 'motif_ordinary'
      },
      sourceStatus: 'static_seed',
      priorityClass: 'normal',
      mandatory: false
    };
    priorityContext.requiredContextSources = [];
    priorityContext.userPrioritySources = [userPrioritySource];
    priorityContext.staticSeedSources = [staticSource];

    const result = parseDramaticPlanCandidate({
      context: priorityContext,
      raw: {
        planId: 'drama_plan_turn_0',
        planningScope: 'turn',
        mode: 'foreshadow',
        primarySource: staticSource.ref,
        supportSources: [],
        sceneFunction: 'foreshadow',
        intensity: 'low',
        playerMayIgnore: true,
        maxNewActors: 0,
        reasonSummary: '尝试让普通种子越过玩家重点。'
      }
    });

    expect(result.plan).toBeUndefined();
    expect(result.diagnostics[0]?.message).toBe(
      '规划不能让普通静态种子越过玩家明确要求的本局重点。'
    );
  });
});
