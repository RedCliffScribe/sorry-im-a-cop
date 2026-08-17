import { describe, expect, it } from 'vitest';
import { selectContext } from '../context/selectContext';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { CurrentMatter, NewsIssue } from '../runtime/types';
import { allDramaPlanningSources, assembleDramaPlanningContext } from './assemblePlanningContext';
import { defaultDramaticContentSettings } from './settings';
import {
  findProjectedDramaSourceCollisions,
  getProjectedDramaPayload,
  isDramaSourceAlreadyConsumed,
  isDramaSourceAlreadyExposed,
  listProjectedDramaSources,
  resolveProjectedDramaProvider,
  validateProjectedDramaRef,
  type ProjectedDramaSourceProvider
} from './sourceRegistry';
import type { DramaSourceRef, ExecutionPayload, PlanningSource } from './types';

function registryTestSource(ref: DramaSourceRef, title: string): PlanningSource {
  return {
    ref: { ...ref },
    arcKey: `arc:${ref.sourceId}`,
    title,
    plannerSummary: `${title}规划摘要。`,
    sourceStatus: 'active_process',
    reusePolicy: 'context_reusable',
    priorityClass: 'normal',
    channelIds: ['custom_events'],
    softAffinities: {},
    mandatory: false,
    score: 80,
    relatedActorIds: [],
    relatedOrganizationIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: []
  };
}

function registryTestProvider(
  source: PlanningSource,
  payloadLabel: string
): ProjectedDramaSourceProvider {
  return {
    providerId: source.ref.providerId,
    list: () => [source],
    getExecutionPayload: (): ExecutionPayload => ({
      ref: { ...source.ref },
      detailedContext: payloadLabel,
      confirmedFacts: [],
      mutableElements: [],
      forbiddenAdaptations: []
    })
  };
}

describe('dramatic source registry', () => {
  it('blocks a previously exposed official story but keeps its persisted continuation eligible', () => {
    const state = createInitialRuntimeState();
    const ref: DramaSourceRef = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: 'official_dlc_urban_legends_hk1988_midnight_char_siu_bun',
      dlcId: 'urban_legends'
    };
    const source: PlanningSource = {
      ...registryTestSource(ref, '深夜叉烧包'),
      exposureEvidenceActorIds: ['official_dlc_urban_legends_hk1988_char_siu_bun_shop_owner'],
      contentIdentity: {
        providerId: 'official-dlc',
        contentId: ref.sourceId,
        version: '1.2.0',
        arcKey: 'official-dlc:urban_legends:hk_1988:midnight_char_siu_bun',
        dlcId: 'urban_legends',
        worldpackId: 'hk_1988'
      },
      arcProgressContract: {
        stageIds: ['street_rumor', 'first_clues'],
        nodeIdsByStage: { street_rumor: [], first_clues: [] },
        allowedNextStageIds: { street_rumor: ['first_clues'], first_clues: [] }
      }
    };
    state.actors[source.exposureEvidenceActorIds![0]!] = {
      ...state.actors.player,
      actorId: source.exposureEvidenceActorIds![0]!,
      name: '黎忠'
    };

    expect(isDramaSourceAlreadyExposed(state, source)).toBe(true);
    expect(isDramaSourceAlreadyConsumed(state, source)).toBe(true);
    expect(isDramaSourceAlreadyConsumed(state, {
      ...source,
      arcStageContext: {
        arcInstanceId: 'arc_char_siu',
        currentStageId: 'first_clues',
        mode: 'continuation',
        continuationSnapshot: {
          usedNodeIds: [],
          lastProgressTurn: 8,
          groundedSummary: '供货簿与失联时间仍在核对。',
          appliedWritebackRefs: [],
          groundedFacts: [],
          unresolvedContext: ['供货差异原因未确认。']
        }
      }
    })).toBe(false);
  });

  it('recovers a previously narrated official incident from legacy save text without trusting player prompts', () => {
    const state = createInitialRuntimeState();
    const source = {
      ...registryTestSource({
        providerId: 'official-dlc',
        sourceType: 'official_dlc_event',
        sourceId: 'official_dlc_urban_legends_hk1988_vacant_flat_calls',
        dlcId: 'urban_legends'
      }, '空屋来电'),
      contentIdentity: {
        providerId: 'official-dlc',
        contentId: 'official_dlc_urban_legends_hk1988_vacant_flat_calls',
        version: '1.2.0',
        arcKey: 'official-dlc:urban_legends:hk_1988:vacant_flat_calls',
        dlcId: 'urban_legends',
        worldpackId: 'hk_1988'
      },
      arcProgressContract: {
        stageIds: ['street_rumor', 'first_clues'],
        nodeIdsByStage: { street_rumor: [], first_clues: [] },
        allowedNextStageIds: { street_rumor: ['first_clues'], first_clues: [] }
      },
      exposureEvidenceTextSignatures: [{
        allTerms: ['空屋'],
        anyTerms: ['来电', '电话', '铃声']
      }]
    } as PlanningSource & {
      exposureEvidenceTextSignatures: Array<{
        allTerms: string[];
        anyTerms: string[];
      }>;
    };
    state.storyLog.push({
      turnId: 'turn_18',
      speaker: 'narrator',
      text: '警员再次核对砵兰街旧唐楼的空屋来电记录，楼下住客仍是同一名目击者。',
      gameTime: { ...state.time }
    });

    expect(isDramaSourceAlreadyExposed(state, source)).toBe(true);
    expect(isDramaSourceAlreadyConsumed(state, source)).toBe(true);

    const playerMentionOnly = createInitialRuntimeState();
    playerMentionOnly.storyLog.push({
      turnId: 'turn_18',
      speaker: 'player',
      text: '我想听听空屋来电的传闻。',
      gameTime: { ...playerMentionOnly.time }
    });
    expect(isDramaSourceAlreadyExposed(playerMentionOnly, source)).toBe(false);
  });

  it('recovers a legacy official incident from structured case evidence but ignores partial phrase matches', () => {
    const state = createInitialRuntimeState();
    const source = {
      ...registryTestSource({
        providerId: 'official-dlc',
        sourceType: 'official_dlc_event',
        sourceId: 'official_dlc_urban_legends_hk1988_vacant_flat_calls',
        dlcId: 'urban_legends'
      }, '空屋来电'),
      exposureEvidenceTextSignatures: [{
        allTerms: ['空屋'],
        anyTerms: ['来电', '电话', '铃声']
      }]
    } as PlanningSource & {
      exposureEvidenceTextSignatures: Array<{
        allTerms: string[];
        anyTerms: string[];
      }>;
    };
    state.cases.case_vacant_flat = {
      caseId: 'case_vacant_flat',
      title: '砵兰街空屋来电案',
      caseType: '滋扰与楼宇安全',
      status: 'investigating',
      playerRole: 'assist',
      summary: '同一间空置单位的电话记录仍在核对。',
      currentFocus: '核对旧线路。',
      playerVisibleProgress: '已确认不是辖区内第二宗事件。',
      internalProgressSummary: '继续复用同一宗事件。',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      evidenceIds: [],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'player_known',
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };
    expect(isDramaSourceAlreadyExposed(state, source)).toBe(true);

    state.cases.case_vacant_flat.title = '普通空屋盗窃案';
    state.cases.case_vacant_flat.summary = '没有电话、来电或铃声相关事实。'.replace('电话、来电或铃声', '通讯设备');
    state.cases.case_vacant_flat.currentFocus = '核对门锁。';
    state.cases.case_vacant_flat.playerVisibleProgress = '未发现住客。';
    state.cases.case_vacant_flat.internalProgressSummary = '普通盗窃调查。';
    expect(isDramaSourceAlreadyExposed(state, source)).toBe(false);
  });

  it('uses the durable exposure ledger for one-shot official rumors', () => {
    const state = createInitialRuntimeState();
    const source: PlanningSource = {
      ...registryTestSource({
        providerId: 'official-dlc',
        sourceType: 'official_dlc_event',
        sourceId: 'official_dlc_urban_legends_hk1988_rumor_test',
        dlcId: 'urban_legends'
      }, '一次性传闻'),
      reusePolicy: 'save_single_use'
    };
    state.dramaticContent!.exposedOfficialDlcSourceRefs = [{ ...source.ref }];

    expect(isDramaSourceAlreadyConsumed(state, source)).toBe(true);
  });

  it('routes livelihood, relationship, organization and world matters by structured kind', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const base: Omit<CurrentMatter, 'id' | 'title' | 'matterKind' | 'source'> = {
      summary: '结构化事项。',
      status: 'active',
      priority: 80,
      visibility: 'known',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };
    const matters: CurrentMatter[] = [
      { ...base, id: 'livelihood', title: '工作事项', matterKind: 'livelihood', source: 'test' },
      { ...base, id: 'relationship', title: '关系事项', matterKind: 'relationship', source: 'test' },
      { ...base, id: 'organization', title: '组织交代', matterKind: 'social', source: 'triad_responsibility' },
      { ...base, id: 'world', title: '城市事项', matterKind: 'world', source: 'test' }
    ];
    for (const matter of matters) state.dynamicEvents.currentMatters[matter.id] = matter;

    const sources = listProjectedDramaSources(selectContext(state, '继续处理眼前的事情'));
    const channelById = new Map(
      sources
        .filter((source) => source.ref.sourceType === 'current_matter')
        .map((source) => [source.ref.sourceId, source.channelIds[0]])
    );

    expect(channelById.get('livelihood')).toBe('work_livelihood');
    expect(channelById.get('relationship')).toBe('relationships');
    expect(channelById.get('organization')).toBe('organizations');
    expect(channelById.get('world')).toBe('city_news');
  });

  it('treats people named by a newspaper article as story subjects, not automatic readers', () => {
    const state = createInitialRuntimeState();
    const issue: NewsIssue = {
      id: 'news_subjects',
      date: state.time,
      outletName: '测试日报',
      headline: '报道提到一名人士',
      summary: '报道内容仍须由玩家实际阅读或接触。',
      articles: [{
        id: 'article_subject',
        section: 'local',
        headline: '报道人物',
        body: '文章提到一名人物。',
        tone: 'neutral',
        playerRelated: false,
        relatedActorIds: ['npc_subject'],
        relatedPlaceIds: [state.location.currentPlaceId],
        relatedCaseIds: [],
        relatedOrganizationIds: []
      }],
      createdAt: state.time,
      updatedAt: state.time,
      read: false
    };
    state.dynamicEvents.newsIssues[issue.id] = issue;

    const source = listProjectedDramaSources(selectContext(state, '看看街上的报纸'))
      .find((candidate) => candidate.ref.sourceId === issue.id);

    expect(source?.relatedActorIds).toEqual(['npc_subject']);
    expect(source?.sourceStatus).toBe('public_claim');
  });

  it('keeps mandatory due material when its channel is disabled', () => {
    const state = createInitialRuntimeState();
    const dueMatter: CurrentMatter = {
      id: 'due_world',
      title: '已经到期的城市事项',
      summary: '这是现有事实，不是可选新种子。',
      status: 'active',
      priority: 90,
      visibility: 'known',
      source: 'test',
      matterKind: 'world',
      dueAt: state.time,
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.dynamicEvents.currentMatters[dueMatter.id] = dueMatter;
    const settings = {
      ...defaultDramaticContentSettings,
      pacing: 'balanced' as const,
      channels: {
        ...defaultDramaticContentSettings.channels,
        city_news: 'off' as const
      }
    };

    const planning = assembleDramaPlanningContext(
      state,
      selectContext(state, '继续'),
      settings
    );

    expect(allDramaPlanningSources(planning).map((candidate) => candidate.ref.sourceId)).toContain('due_world');
  });

  it('keeps established world facts but excludes nonmandatory sources from a disabled channel', () => {
    const state = createInitialRuntimeState();
    const activeMatter: CurrentMatter = {
      id: 'active_world',
      title: '已经存在的城市事项',
      summary: '频道关闭只能阻止新的可选种子，不能切断已经成立的事实与过程。',
      status: 'active',
      priority: 70,
      visibility: 'known',
      source: 'test',
      matterKind: 'world',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.dynamicEvents.currentMatters[activeMatter.id] = activeMatter;
    const settings = {
      ...defaultDramaticContentSettings,
      pacing: 'balanced' as const,
      channels: {
        ...defaultDramaticContentSettings.channels,
        city_news: 'off' as const
      }
    };

    const planning = assembleDramaPlanningContext(
      state,
      selectContext(state, '继续'),
      settings
    );
    const source = allDramaPlanningSources(planning).find(
      (candidate) => candidate.ref.sourceId === activeMatter.id
    );

    expect(source).toBeUndefined();
    expect(state.dynamicEvents.currentMatters[activeMatter.id]).toEqual(activeMatter);
    expect(planning.filterRuleIds).toContain('channel.city_news.off');
  });

  it('applies continuity cooldown only after a validated trace actually used the source', () => {
    const state = createInitialRuntimeState();
    state.turnCounter = 1;
    const matter: CurrentMatter = {
      id: 'matter_trace_cooldown',
      title: '仍可继续的调查事项',
      summary: '只被规划但未采用时，不应当作已经呈现。',
      status: 'active',
      priority: 80,
      visibility: 'known',
      source: 'test',
      matterKind: 'police_work',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.dynamicEvents.currentMatters[matter.id] = matter;
    const ref = {
      providerId: 'runtime-dynamic',
      sourceType: 'current_matter',
      sourceId: matter.id
    };
    const baseReceipt = {
      turnCounter: 0,
      pacing: 'balanced' as const,
      planningRoute: 'auto' as const,
      materialLevel: 'standard' as const,
      storypackInfluence: 'high' as const,
      screenCharacterSeedsEnabled: true,
      planningCalled: true,
      planningSucceeded: true,
      planningDurationMs: 1,
      inputCandidateCount: 1,
      inputCharacterCount: 1,
      estimatedInputTokens: 1,
      primarySourceRef: ref,
      supportSourceRefs: [],
      usedSourceRefs: [],
      persistentWriteCount: 0,
      filterRuleIds: []
    };
    state.dramaticContent = {
      ...(state.dramaticContent ?? { instances: [], recentDiagnostics: [] }),
      recentExecutions: [baseReceipt]
    };

    const plannedOnly = assembleDramaPlanningContext(
      state,
      selectContext(state, '继续'),
      {
        ...defaultDramaticContentSettings,
        pacing: 'balanced'
      }
    );
    expect(
      allDramaPlanningSources(plannedOnly).find(
        (candidate) => candidate.ref.sourceId === matter.id
      )?.score
    ).toBe(80);
    expect(plannedOnly.filterRuleIds).not.toContain('continuity.cooldown');

    state.dramaticContent.recentExecutions = [
      {
        ...baseReceipt,
        usedSourceRefs: [ref],
        traceStatus: 'used_as_texture'
      }
    ];
    const actuallyUsed = assembleDramaPlanningContext(
      state,
      selectContext(state, '继续'),
      {
        ...defaultDramaticContentSettings,
        pacing: 'balanced'
      }
    );
    expect(
      allDramaPlanningSources(actuallyUsed).find(
        (candidate) => candidate.ref.sourceId === matter.id
      )?.score
    ).toBe(-10);
    expect(actuallyUsed.filterRuleIds).toContain('continuity.cooldown');
  });

  it('lets custom character intent reuse its stable Actor while preserving other entity-singleton guards', () => {
    const state = createInitialRuntimeState();
    const actorId = state.player.actorId;
    const baseSource: PlanningSource = {
      ref: {
        providerId: 'custom-character',
        sourceType: 'custom_character_binding',
        sourceId: 'binding:character:test'
      },
      arcKey: 'custom-character:binding:character:test',
      title: '测试人物',
      plannerSummary: '仍在等待结构化接触确认。',
      sourceStatus: 'undecided_suggestion',
      reusePolicy: 'entity_singleton',
      priorityClass: 'user_requested',
      channelIds: ['custom_characters'],
      softAffinities: {},
      mandatory: false,
      score: 100,
      relatedActorIds: [actorId],
      relatedOrganizationIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: []
    };

    expect(isDramaSourceAlreadyConsumed(state, baseSource)).toBe(false);
    expect(
      isDramaSourceAlreadyConsumed(state, {
        ...baseSource,
        ref: {
          providerId: 'screen-character',
          sourceType: 'screen_character_seed',
          sourceId: 'seed:test'
        }
      })
    ).toBe(true);
  });

  it('resolves an exact source key across providers sharing one providerId', () => {
    const context = selectContext(createInitialRuntimeState(), '继续');
    const refA: DramaSourceRef = {
      providerId: 'shared-test-provider',
      sourceType: 'test_event',
      sourceId: 'event_a'
    };
    const refB: DramaSourceRef = {
      providerId: 'shared-test-provider',
      sourceType: 'test_event',
      sourceId: 'event_b'
    };
    const providerA = registryTestProvider(registryTestSource(refA, '来源A'), 'payload-a');
    const providerB = registryTestProvider(registryTestSource(refB, '来源B'), 'payload-b');
    const providers = [providerA, providerB];

    expect(resolveProjectedDramaProvider(context, refA, providers)).toMatchObject({
      status: 'resolved',
      provider: providerA
    });
    expect(getProjectedDramaPayload(context, refA, undefined, providers)?.detailedContext).toBe(
      'payload-a'
    );
    expect(validateProjectedDramaRef(context, refA, providers)).toBe(true);
    expect(listProjectedDramaSources(context, providers).map((source) => source.ref.sourceId))
      .toEqual(['event_a', 'event_b']);
    expect(resolveProjectedDramaProvider(context, {
      ...refA,
      sourceId: 'missing'
    }, providers)).toMatchObject({ status: 'not_found' });
  });

  it('rejects duplicate source keys instead of silently choosing the first provider', () => {
    const context = selectContext(createInitialRuntimeState(), '继续');
    const ref: DramaSourceRef = {
      providerId: 'shared-test-provider',
      sourceType: 'test_event',
      sourceId: 'duplicate_event'
    };
    const providerA = registryTestProvider(registryTestSource(ref, '重复来源A'), 'payload-a');
    const providerB = registryTestProvider(registryTestSource(ref, '重复来源B'), 'payload-b');
    const providers = [providerA, providerB];

    expect(findProjectedDramaSourceCollisions(context, providers)).toEqual([{
      sourceKey: 'shared-test-provider:test_event:duplicate_event',
      declarationCount: 2,
      providerIndexes: [0, 1]
    }]);
    expect(resolveProjectedDramaProvider(context, ref, providers)).toEqual({
      status: 'ambiguous',
      sourceKey: 'shared-test-provider:test_event:duplicate_event',
      declarationCount: 2
    });
    expect(listProjectedDramaSources(context, providers)).toEqual([]);
    expect(getProjectedDramaPayload(context, ref, undefined, providers)).toBeUndefined();
    expect(validateProjectedDramaRef(context, ref, providers)).toBe(false);
  });
});
