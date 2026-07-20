import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, CaseFile } from '../runtime/types';
import { applyBackgroundEvolution } from './applyBackgroundEvolution';
import { parseBackgroundEvolutionWriteback } from './protocol';
import { selectBackgroundEvolutionCandidates } from './selection';
import { addGameHours } from './time';

function addRemoteCaseLead(state: ReturnType<typeof createInitialRuntimeState>): void {
  state.actors.actor_liu = {
    ...state.actors.player,
    actorId: 'actor_liu',
    name: '刘启',
    aliases: [],
    presence: 'absent',
    currentSceneId: undefined,
    currentPlaceId: 'place_mong_kok_police_station',
    visibility: 'player_known'
  } as Actor;
  const caseFile: CaseFile = {
    caseId: 'case_stolen_car',
    title: '失车案',
    caseType: 'theft',
    status: 'investigating',
    playerRole: 'aware',
    leadActorId: 'actor_liu',
    leadActorName: '刘启',
    summary: '一辆私家车失窃。',
    currentFocus: '核对目击时间。',
    playerVisibleProgress: '由刘启主办。',
    internalProgressSummary: '等待走访。',
    relatedActorIds: ['actor_liu'],
    relatedPlaceIds: ['place_mong_kok_police_station'],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: state.time,
    updatedAt: state.time
  };
  state.cases[caseFile.caseId] = caseFile;
}

function sourceRefs(reviewActorId = 'actor_liu') {
  return {
    actorIds: [reviewActorId],
    caseIds: ['case_stolen_car'],
    placeIds: ['place_mong_kok_police_station'],
    organizationIds: [],
    relationshipThreadIds: [],
    cityTrackIds: [],
    deferredEventIds: [],
    outcomeIds: []
  };
}

function createTrackPatch(state: ReturnType<typeof createInitialRuntimeState>, reviewKey: string) {
  return {
    operation: 'create' as const,
    trackId: 'npc_track_liu_case',
    actorId: 'actor_liu',
    status: 'active' as const,
    actionKind: 'case' as const,
    objective: '核对失车案目击时间',
    currentAction: '在油麻地果栏走访夜班工人，核对目击时间',
    currentStatus: '走访中',
    currentPlaceId: 'place_mong_kok_police_station',
    startedAt: state.time,
    expectedEndAt: addGameHours(state.time, 51),
    nextReviewAt: addGameHours(state.time, 6),
    relatedActorIds: ['actor_liu'],
    relatedOrganizationIds: [],
    relatedPlaceIds: ['place_mong_kok_police_station'],
    relatedCaseIds: ['case_stolen_car'],
    relatedRelationshipThreadIds: [],
    relatedCityTrackIds: [],
    relatedDeferredEventIds: [],
    visibility: 'player_known' as const,
    reviewKey,
    reason: '主办人按计划开始走访。',
    sourceRefs: sourceRefs()
  };
}

function writebackWith(patch: object, field = 'npcTrackPatches') {
  return parseBackgroundEvolutionWriteback({ [field]: [patch] }).writeback;
}

function addPlayerOrganizationLink(state: ReturnType<typeof createInitialRuntimeState>): void {
  state.actors.player.organizationRelations.push({
    organizationId: 'org_tvb',
    relationType: 'contractor',
    summary: '协助电视台采访',
    visibility: 'player_known'
  });
}

function organizationSourceRefs(actorIds: string[] = [], cityTrackIds: string[] = []) {
  return {
    actorIds,
    caseIds: [],
    placeIds: [],
    organizationIds: ['org_tvb'],
    relationshipThreadIds: [],
    cityTrackIds,
    deferredEventIds: [],
    outcomeIds: []
  };
}

function createOrganizationTrackPatch(state: ReturnType<typeof createInitialRuntimeState>, reviewKey: string) {
  return {
    operation: 'activate' as const,
    trackId: 'organization_track_tvb',
    organizationId: 'org_tvb',
    status: 'active' as const,
    objective: '安排一轮晚间新闻采访',
    currentAction: '协调采访组与新闻编辑台',
    currentStatus: '正在确认采访档期',
    startedAt: state.time,
    expectedEndAt: addGameHours(state.time, 48),
    nextReviewAt: addGameHours(state.time, 24),
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedCityTrackIds: [],
    visibility: 'player_known' as const,
    currentState: '采访组正在协调一轮晚间新闻采访。',
    pressureSummary: '档期与新闻编辑资源仍待确认。',
    reviewKey,
    reason: '玩家与电视台已有结构化采访关系。',
    sourceRefs: organizationSourceRefs()
  };
}

describe('applyBackgroundEvolution', () => {
  it('creates one formal case action, one deterministic NPC memory, and one case activity', () => {
    const state = createInitialRuntimeState();
    addRemoteCaseLead(state);
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_1' });
    const patch = createTrackPatch(state, selection.npcCandidates[0].reviewKey);

    const result = applyBackgroundEvolution({
      state,
      selection,
      writeback: writebackWith(patch),
      foregroundTurnId: 'turn_1'
    });

    expect(result.state.backgroundEvolution.npcTracks.npc_track_liu_case).toMatchObject({
      actorId: 'actor_liu',
      currentAction: '在油麻地果栏走访夜班工人，核对目击时间',
      relatedCaseIds: ['case_stolen_car']
    });
    const memories = Object.values(result.state.memories).filter((memory) =>
      memory.memoryId.startsWith('memory_bg_npc_track_liu_case_created_')
    );
    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({
      kind: 'actor',
      tier: 'short_term',
      certainty: 'claim',
      relatedCaseIds: ['case_stolen_car'],
      periodStart: state.time,
      periodEnd: patch.expectedEndAt
    });
    expect(memories[0].text).toContain('刘启开始办理案件行动');
    expect(memories[0].text).toContain('在油麻地果栏走访夜班工人，核对目击时间');
    expect(memories[0].text).toContain('预计持续至');
    expect(result.state.cases.case_stolen_car.activityLog).toHaveLength(1);
    expect(result.state.cases.case_stolen_car.activityLog[0].summary).toContain('正在');
  });

  it('settles a due case action as no_result without falsely advancing CaseStatus', () => {
    const initial = createInitialRuntimeState();
    addRemoteCaseLead(initial);
    const createSelection = selectBackgroundEvolutionCandidates({ state: initial, foregroundTurnId: 'turn_1' });
    const created = applyBackgroundEvolution({
      state: initial,
      selection: createSelection,
      writeback: writebackWith(createTrackPatch(initial, createSelection.npcCandidates[0].reviewKey)),
      foregroundTurnId: 'turn_1'
    }).state;
    created.time = addGameHours(created.time, 30);
    const settleSelection = selectBackgroundEvolutionCandidates({ state: created, foregroundTurnId: 'turn_2' });
    expect(settleSelection.npcCandidates[0].allowMaterialProgress).toBe(true);
    const settlePatch = {
      operation: 'settle' as const,
      trackId: 'npc_track_liu_case',
      actorId: 'actor_liu',
      outcomeKind: 'no_result' as const,
      outcomeSummary: '夜班工人的口供互相矛盾，本轮走访没有取得可用结果。',
      reviewKey: settleSelection.npcCandidates[0].reviewKey,
      reason: '预计复核时间已到。',
      sourceRefs: sourceRefs()
    };

    const result = applyBackgroundEvolution({
      state: created,
      selection: settleSelection,
      writeback: writebackWith(settlePatch),
      foregroundTurnId: 'turn_2'
    });

    expect(result.state.backgroundEvolution.npcTracks.npc_track_liu_case).toBeUndefined();
    expect(result.state.cases.case_stolen_car.status).toBe('investigating');
    expect(result.state.cases.case_stolen_car.activityLog).toHaveLength(2);
    expect(Object.values(result.state.memories).filter((memory) => memory.memoryId.includes('_settled_'))).toHaveLength(1);
    expect(result.state.backgroundEvolution.recentOutcomes.at(-1)).toMatchObject({
      sourceKind: 'case',
      sourceId: 'case_stolen_car',
      summary: settlePatch.outcomeSummary
    });
  });

  it('lets a non-player lead advance case facts only when a paired due action produces progress', () => {
    const initial = createInitialRuntimeState();
    addRemoteCaseLead(initial);
    const createSelection = selectBackgroundEvolutionCandidates({ state: initial, foregroundTurnId: 'turn_1' });
    const created = applyBackgroundEvolution({
      state: initial,
      selection: createSelection,
      writeback: writebackWith(createTrackPatch(initial, createSelection.npcCandidates[0].reviewKey)),
      foregroundTurnId: 'turn_1'
    }).state;
    created.time = addGameHours(created.time, 30);
    const settleSelection = selectBackgroundEvolutionCandidates({ state: created, foregroundTurnId: 'turn_2' });
    const reviewKey = settleSelection.npcCandidates[0].reviewKey;
    const resultSummary = '夜班工人确认失车在凌晨二时后被拖向货运档口，取得可复核的新方向。';
    const parsed = parseBackgroundEvolutionWriteback({
      npcTrackPatches: [
        {
          operation: 'settle',
          trackId: 'npc_track_liu_case',
          actorId: 'actor_liu',
          outcomeKind: 'progress',
          outcomeSummary: resultSummary,
          reviewKey,
          reason: '复核节点已到并取得有效口供。',
          sourceRefs: sourceRefs()
        }
      ],
      casePatches: [
        {
          caseId: 'case_stolen_car',
          actorId: 'actor_liu',
          outcomeKind: 'progress',
          currentFocus: '核对凌晨二时后的货运档口与拖车记录。',
          playerVisibleProgress: resultSummary,
          internalProgressSummary: '已有新方向，但尚未锁定车辆去向或嫌疑人。',
          reviewKey,
          reason: '将同一行动节点的有效结果投影到案件事实。',
          sourceRefs: sourceRefs()
        }
      ]
    });

    const result = applyBackgroundEvolution({
      state: created,
      selection: settleSelection,
      writeback: parsed.writeback,
      foregroundTurnId: 'turn_2'
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.state.cases.case_stolen_car).toMatchObject({
      status: 'investigating',
      currentFocus: '核对凌晨二时后的货运档口与拖车记录。',
      playerVisibleProgress: resultSummary,
      internalProgressSummary: '已有新方向，但尚未锁定车辆去向或嫌疑人。'
    });
    expect(Object.values(result.state.memories).find((memory) => memory.memoryId.includes('_settled_'))?.text)
      .toContain(resultSummary);
  });

  it('is idempotent when the same review key is retried', () => {
    const state = createInitialRuntimeState();
    addRemoteCaseLead(state);
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_1' });
    const writeback = writebackWith(createTrackPatch(state, selection.npcCandidates[0].reviewKey));
    const first = applyBackgroundEvolution({ state, selection, writeback, foregroundTurnId: 'turn_1' });
    const second = applyBackgroundEvolution({ state: first.state, selection, writeback, foregroundTurnId: 'turn_1' });

    expect(Object.values(second.state.memories).filter((memory) => memory.memoryId.includes('npc_track_liu_case'))).toHaveLength(1);
    expect(second.state.cases.case_stolen_car.activityLog).toHaveLength(1);
    expect(second.appliedPatchCount).toBe(0);
    expect(second.droppedPatchCount).toBeGreaterThan(0);
  });

  it('rejects an actor patch with an invalid stable place reference and its paired track', () => {
    const state = createInitialRuntimeState();
    addRemoteCaseLead(state);
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_1' });
    const reviewKey = selection.npcCandidates[0].reviewKey;
    const parsed = parseBackgroundEvolutionWriteback({
      npcTrackPatches: [createTrackPatch(state, reviewKey)],
      backgroundActorPatches: [
        {
          actorId: 'actor_liu',
          currentPlaceId: 'missing_place',
          reviewKey,
          reason: '移动到调查地点。',
          sourceRefs: sourceRefs()
        }
      ]
    });

    const result = applyBackgroundEvolution({ state, selection, writeback: parsed.writeback, foregroundTurnId: 'turn_1' });

    expect(result.state.backgroundEvolution.npcTracks).toEqual({});
    expect(result.state.memories).toEqual(state.memories);
    expect(result.diagnostics.some((issue) => issue.code === 'invalid_actor_patch')).toBe(true);
  });

  it('writes exactly one deterministic memory for a meaningful terminal non-case action', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_liu = {
      ...state.actors.player,
      actorId: 'actor_liu',
      name: '刘启',
      aliases: [],
      presence: 'absent',
      currentSceneId: undefined,
      visibility: 'player_known'
    } as Actor;
    state.relationshipThreads.thread_liu = {
      threadId: 'thread_liu',
      kind: 'network',
      title: '同僚联络',
      summary: '刘启与玩家会交换调查消息。',
      relatedActorIds: ['actor_liu'],
      primaryActorId: 'actor_liu',
      relationshipRole: '同僚',
      status: 'active',
      currentPull: '刘启正在确认一条可靠的夜班联络渠道。',
      milestones: [],
      visibility: 'player_known',
      importance: 60,
      createdAt: state.time,
      updatedAt: state.time
    };
    const createSelection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_non_case_1' });
    const createReviewKey = createSelection.npcCandidates[0].reviewKey;
    const refs = {
      actorIds: ['actor_liu'],
      caseIds: [],
      placeIds: [],
      organizationIds: [],
      relationshipThreadIds: ['thread_liu'],
      cityTrackIds: [],
      deferredEventIds: [],
      outcomeIds: []
    };
    const created = applyBackgroundEvolution({
      state,
      selection: createSelection,
      writeback: writebackWith({
        operation: 'create',
        trackId: 'npc_track_liu_contact',
        actorId: 'actor_liu',
        status: 'active',
        actionKind: 'relationship',
        objective: '确认可靠的夜班联络渠道',
        currentAction: '与旧同僚核对可以安全传话的电话和值班时间',
        currentStatus: '正在逐一确认联络人',
        nextReviewAt: addGameHours(state.time, 6),
        relatedRelationshipThreadIds: ['thread_liu'],
        visibility: 'player_known',
        reviewKey: createReviewKey,
        reason: '已有关系牵引需要一次远场行动。',
        sourceRefs: refs
      }),
      foregroundTurnId: 'turn_non_case_1'
    }).state;
    expect(Object.values(created.memories).filter((memory) => memory.memoryId.includes('npc_track_liu_contact'))).toEqual([]);

    created.time = addGameHours(created.time, 6);
    const settleSelection = selectBackgroundEvolutionCandidates({ state: created, foregroundTurnId: 'turn_non_case_2' });
    const settlePatch = {
      operation: 'settle' as const,
      trackId: 'npc_track_liu_contact',
      actorId: 'actor_liu',
      outcomeKind: 'progress' as const,
      outcomeSummary: '刘启确认可通过夜更值日台安全转达紧急消息。',
      consequence: '之后遇到突发情况时，他会优先使用这条联络渠道。',
      persistToMemory: true,
      reviewKey: settleSelection.npcCandidates[0].reviewKey,
      reason: '结果会持续改变刘启未来的联络行为。',
      sourceRefs: refs
    };
    const settled = applyBackgroundEvolution({
      state: created,
      selection: settleSelection,
      writeback: writebackWith(settlePatch),
      foregroundTurnId: 'turn_non_case_2'
    });
    const memories = Object.values(settled.state.memories).filter((memory) =>
      memory.memoryId.includes('npc_track_liu_contact_settled')
    );

    expect(memories).toHaveLength(1);
    expect(memories[0].text).toContain(settlePatch.outcomeSummary);
    expect(memories[0].text).toContain(settlePatch.consequence);
    expect(settled.state.backgroundEvolution.recentOutcomes.at(-1)?.sourceRefs).toEqual(refs);

    const retried = applyBackgroundEvolution({
      state: settled.state,
      selection: settleSelection,
      writeback: writebackWith(settlePatch),
      foregroundTurnId: 'turn_non_case_2'
    });
    expect(Object.values(retried.state.memories).filter((memory) => memory.memoryId.includes('npc_track_liu_contact_settled'))).toHaveLength(1);
  });

  it('activates and later settles one organization heartbeat without creating a second organization profile', () => {
    const state = createInitialRuntimeState();
    addPlayerOrganizationLink(state);
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_org_1' });
    const reviewKey = selection.organizationCandidates[0].reviewKey;
    const created = applyBackgroundEvolution({
      state,
      selection,
      writeback: writebackWith(createOrganizationTrackPatch(state, reviewKey), 'organizationEvolutionPatches'),
      foregroundTurnId: 'turn_org_1'
    }).state;

    expect(created.backgroundEvolution.organizationTracks.organization_track_tvb).toMatchObject({
      organizationId: 'org_tvb',
      status: 'active',
      currentAction: '协调采访组与新闻编辑台'
    });
    expect(created.organizations.org_tvb).toMatchObject({
      organizationId: 'org_tvb',
      name: state.organizations.org_tvb.name,
      type: state.organizations.org_tvb.type,
      currentState: '采访组正在协调一轮晚间新闻采访。'
    });

    created.time = addGameHours(created.time, 24);
    const settleSelection = selectBackgroundEvolutionCandidates({ state: created, foregroundTurnId: 'turn_org_2' });
    expect(settleSelection.organizationCandidates[0].allowMaterialProgress).toBe(true);
    const settleReviewKey = settleSelection.organizationCandidates[0].reviewKey;
    const settlePatch = {
      operation: 'settle' as const,
      trackId: 'organization_track_tvb',
      organizationId: 'org_tvb',
      outcomeKind: 'no_result' as const,
      outcomeSummary: '采访对象临时取消档期，本轮协调没有形成节目。',
      currentState: '采访安排暂时搁置，编辑台等待新的切入点。',
      pressureSummary: '采访资源已经释放，但原定节目未能播出。',
      nextReviewAt: addGameHours(created.time, 48),
      reviewKey: settleReviewKey,
      reason: '复核时间已到，档期协调产生了明确但未成功的结果。',
      sourceRefs: organizationSourceRefs()
    };
    const settled = applyBackgroundEvolution({
      state: created,
      selection: settleSelection,
      writeback: writebackWith(settlePatch, 'organizationEvolutionPatches'),
      foregroundTurnId: 'turn_org_2'
    });

    expect(settled.state.backgroundEvolution.organizationTracks.organization_track_tvb).toMatchObject({
      organizationId: 'org_tvb',
      status: 'quiet',
      latestOutcomeKind: 'no_result',
      latestOutcome: settlePatch.outcomeSummary
    });
    expect(settled.state.backgroundEvolution.organizationTracks.organization_track_tvb.currentAction).toBeUndefined();
    expect(settled.state.backgroundEvolution.recentOutcomes.at(-1)).toMatchObject({
      sourceKind: 'organization',
      sourceId: 'org_tvb',
      summary: settlePatch.outcomeSummary
    });
    expect(settled.state.organizations.org_tvb.currentState).toBe(settlePatch.currentState);
  });

  it('caps a foreground organization heartbeat at player-known when the player relation is hidden', () => {
    const state = createInitialRuntimeState();
    addPlayerOrganizationLink(state);
    const playerRelation = state.actors.player.organizationRelations.find(
      (relation) => relation.organizationId === 'org_tvb'
    );
    expect(playerRelation).toBeDefined();
    if (!playerRelation) return;
    playerRelation.visibility = 'hidden';
    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_secret_org',
      foregroundTouchedOrganizationIds: ['org_tvb']
    });
    const candidate = selection.organizationCandidates.find((item) => item.organizationId === 'org_tvb');
    expect(candidate?.trigger).toBe('foreground-impact');
    if (!candidate) return;
    const patch = {
      ...createOrganizationTrackPatch(state, candidate.reviewKey),
      visibility: 'public' as const,
      currentState: undefined,
      pressureSummary: undefined
    };

    const result = applyBackgroundEvolution({
      state,
      selection,
      writeback: writebackWith(patch, 'organizationEvolutionPatches'),
      foregroundTurnId: 'turn_secret_org'
    });

    expect(result.state.backgroundEvolution.organizationTracks.organization_track_tvb.visibility).toBe('player_known');
  });

  it('writes at most one affected NPC memory from an accepted organization transition', () => {
    const state = createInitialRuntimeState();
    addPlayerOrganizationLink(state);
    state.actors.actor_editor = {
      ...state.actors.player,
      actorId: 'actor_editor',
      name: '陈编辑',
      aliases: [],
      presence: 'absent',
      organizationIds: ['org_tvb'],
      organizationRelations: [
        { organizationId: 'org_tvb', relationType: 'employee', summary: '新闻编辑', visibility: 'player_known' }
      ],
      visibility: 'player_known'
    } as Actor;
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_org_memory' });
    expect(selection.organizationCandidates[0].relatedActorIds).toContain('actor_editor');
    const reviewKey = selection.organizationCandidates[0].reviewKey;
    const trackPatch = {
      ...createOrganizationTrackPatch(state, reviewKey),
      relatedActorIds: ['actor_editor'],
      sourceRefs: organizationSourceRefs(['actor_editor'])
    };
    const memoryPatch = {
      actorId: 'actor_editor',
      text: '陈编辑开始协调晚间新闻采访档期，等待采访对象确认。',
      importance: 60,
      visibility: 'hidden' as const,
      certainty: 'fact' as const,
      relatedOrganizationIds: ['org_tvb'],
      reviewKey,
      reason: '该组织行动直接由陈编辑执行，对后续行为有持续价值。',
      sourceRefs: organizationSourceRefs(['actor_editor'])
    };
    const parsed = parseBackgroundEvolutionWriteback({
      organizationEvolutionPatches: [trackPatch],
      actorMemories: [memoryPatch, { ...memoryPatch, text: '不应重复写入的第二条记忆。' }]
    });

    const result = applyBackgroundEvolution({
      state,
      selection,
      writeback: parsed.writeback,
      foregroundTurnId: 'turn_org_memory'
    });
    const organizationMemories = Object.values(result.state.memories).filter((memory) =>
      memory.relatedOrganizationIds.includes('org_tvb') && memory.relatedActorIds.includes('actor_editor')
    );
    expect(organizationMemories).toHaveLength(1);
    expect(organizationMemories[0].text).toContain('协调晚间新闻采访档期');
    expect(result.diagnostics.some((issue) => issue.code === 'rejected_actor_memory')).toBe(true);
  });

  it('allows a settled organization outcome to advance one explicitly paired city track', () => {
    const state = createInitialRuntimeState();
    addPlayerOrganizationLink(state);
    state.citySituationTracks.track_media = {
      trackId: 'track_media',
      title: '电视新闻追访升温',
      trackType: 'media_campaign',
      status: 'active',
      pressureLevel: 2,
      visibility: 'public',
      startedAt: state.time,
      nextReviewAt: addGameHours(state.time, 24 * 10),
      cadenceDays: 10,
      relatedOrganizationIds: ['org_tvb'],
      relatedPowerFigureIds: [],
      relatedPlaceIds: [],
      relatedActorIds: [],
      summary: '新闻编辑台持续关注街头治安议题。',
      currentBeat: '尚在收集采访材料。',
      possibleDevelopments: []
    };
    const createSelection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_org_city_1' });
    const createReviewKey = createSelection.organizationCandidates[0].reviewKey;
    const created = applyBackgroundEvolution({
      state,
      selection: createSelection,
      writeback: writebackWith(
        {
          ...createOrganizationTrackPatch(state, createReviewKey),
          relatedCityTrackIds: ['track_media'],
          sourceRefs: organizationSourceRefs([], ['track_media'])
        },
        'organizationEvolutionPatches'
      ),
      foregroundTurnId: 'turn_org_city_1'
    }).state;
    created.time = addGameHours(created.time, 24);
    const settleSelection = selectBackgroundEvolutionCandidates({ state: created, foregroundTurnId: 'turn_org_city_2' });
    expect(settleSelection.cityCandidates).toEqual([]);
    const reviewKey = settleSelection.organizationCandidates[0].reviewKey;
    const refs = organizationSourceRefs([], ['track_media']);
    const parsed = parseBackgroundEvolutionWriteback({
      organizationEvolutionPatches: [
        {
          operation: 'settle',
          trackId: 'organization_track_tvb',
          organizationId: 'org_tvb',
          outcomeKind: 'progress',
          outcomeSummary: '采访对象确认出镜，编辑台取得可播出的第一轮材料。',
          nextReviewAt: addGameHours(created.time, 72),
          reviewKey,
          reason: '组织行动到达复核节点并形成有限结果。',
          sourceRefs: refs
        }
      ],
      citySituationTrackPatches: [
        {
          operation: 'update',
          trackId: 'track_media',
          pressureLevel: 3,
          currentBeat: '编辑台已经取得第一轮可播材料，准备安排晚间播出。',
          nextReviewAt: addGameHours(created.time, 72),
          reviewKey,
          reason: '同一组织结果对配对的媒体城市轨道产生有限影响。',
          sourceRefs: refs
        }
      ]
    });

    const result = applyBackgroundEvolution({
      state: created,
      selection: settleSelection,
      writeback: parsed.writeback,
      foregroundTurnId: 'turn_org_city_2'
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.state.citySituationTracks.track_media).toMatchObject({
      pressureLevel: 3,
      currentBeat: '编辑台已经取得第一轮可播材料，准备安排晚间播出。'
    });
  });
});
