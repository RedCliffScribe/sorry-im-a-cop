import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, CaseFile, NpcEvolutionTrack, OrganizationEvolutionTrack } from '../runtime/types';
import { selectBackgroundEvolutionCandidates } from './selection';
import { addGameHours } from './time';

function addRemoteActor(state: ReturnType<typeof createInitialRuntimeState>, actorId = 'actor_liu'): void {
  const player = state.actors.player;
  state.actors[actorId] = {
    ...player,
    actorId,
    name: '刘启',
    aliases: [],
    presence: 'absent',
    currentPlaceId: 'place_mong_kok_police_station',
    currentSceneId: undefined,
    visibility: 'player_known'
  } as Actor;
}

function addCase(state: ReturnType<typeof createInitialRuntimeState>): CaseFile {
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
    relatedOrganizationIds: ['org_hk_police'],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: state.time,
    updatedAt: state.time
  };
  state.cases[caseFile.caseId] = caseFile;
  return caseFile;
}

function activeTrack(state: ReturnType<typeof createInitialRuntimeState>): NpcEvolutionTrack {
  return {
    trackId: 'npc_track_liu_case',
    actorId: 'actor_liu',
    status: 'active',
    actionKind: 'case',
    objective: '核对失车案目击时间',
    currentAction: '走访夜班工人',
    currentStatus: '调查中',
    currentPlaceId: 'place_mong_kok_police_station',
    startedAt: { ...state.time, hour: 8 },
    expectedEndAt: { ...state.time, day: state.time.day + 2, hour: 12 },
    nextReviewAt: { ...state.time, hour: state.time.hour + 6 },
    relatedActorIds: ['actor_liu'],
    relatedOrganizationIds: ['org_hk_police'],
    relatedPlaceIds: ['place_mong_kok_police_station'],
    relatedCaseIds: ['case_stolen_car'],
    relatedRelationshipThreadIds: [],
    relatedCityTrackIds: [],
    relatedDeferredEventIds: [],
    visibility: 'player_known'
  };
}

function activeOrganizationTrack(state: ReturnType<typeof createInitialRuntimeState>): OrganizationEvolutionTrack {
  return {
    trackId: 'organization_track_tvb',
    organizationId: 'org_tvb',
    status: 'active',
    objective: '稳定晚间新闻采访安排',
    currentAction: '协调采访组与新闻编辑台',
    currentStatus: '正在核对采访资源',
    startedAt: { ...state.time },
    expectedEndAt: addGameHours(state.time, 48),
    nextReviewAt: addGameHours(state.time, 24),
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedCityTrackIds: [],
    lastEvolvedAt: { ...state.time },
    visibility: 'player_known'
  };
}

describe('selectBackgroundEvolutionCandidates', () => {
  it('does not advance an active NPC merely because another player turn occurred', () => {
    const state = createInitialRuntimeState();
    addRemoteActor(state);
    addCase(state);
    const track = activeTrack(state);
    state.backgroundEvolution.npcTracks[track.trackId] = track;

    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_1'
    });

    expect(selection.npcCandidates).toEqual([]);
  });

  it('selects a due active NPC once game time reaches nextReviewAt', () => {
    const state = createInitialRuntimeState();
    addRemoteActor(state);
    addCase(state);
    const track = activeTrack(state);
    state.backgroundEvolution.npcTracks[track.trackId] = track;
    state.time = { ...track.nextReviewAt };

    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_2' });

    expect(selection.npcCandidates).toHaveLength(1);
    expect(selection.npcCandidates[0]).toMatchObject({
      actorId: 'actor_liu',
      trackId: track.trackId,
      trigger: 'due',
      allowMaterialProgress: true
    });
  });

  it('uses a non-player case lead as an NPC candidate without creating a case scheduler', () => {
    const state = createInitialRuntimeState();
    addRemoteActor(state);
    addCase(state);

    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_1' });

    expect(selection.npcCandidates[0]).toMatchObject({
      actorId: 'actor_liu',
      trigger: 'case-lead',
      allowMaterialProgress: false,
      relatedCaseIds: ['case_stolen_car']
    });
    expect(state.cases.case_stolen_car).not.toHaveProperty('nextBackgroundReviewAt');
  });

  it('excludes present and foreground-touched actors from concurrent evolution', () => {
    const state = createInitialRuntimeState();
    addRemoteActor(state);
    addCase(state);
    state.actors.actor_liu.presence = 'present';

    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_1',
      foregroundTouchedActorIds: ['actor_liu']
    });

    expect(selection.npcCandidates).toEqual([]);
    expect(selection.excludedActorIds).toContain('actor_liu');
  });

  it('uses the last applied evolution time instead of a later empty-run status for the six-hour gate', () => {
    const state = createInitialRuntimeState();
    addRemoteActor(state);
    addCase(state);
    const appliedAt = { ...state.time };
    state.backgroundEvolution.lastAppliedAt = appliedAt;
    state.time = addGameHours(appliedAt, 5);
    state.backgroundEvolution.lastRun = {
      runId: 'background_run_empty',
      reason: 'due',
      status: 'skipped',
      requestedAt: { ...state.time },
      finishedAt: { ...state.time },
      selectedReviewKeys: [],
      appliedPatchCount: 0,
      droppedPatchCount: 0,
      errorReason: 'no_candidates'
    };

    expect(selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_5h' }).npcCandidates).toEqual([]);

    state.time = addGameHours(appliedAt, 6);
    expect(selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_6h' }).npcCandidates).toHaveLength(1);
  });

  it('does not activate a visible high-importance organization without a structural player intersection', () => {
    const state = createInitialRuntimeState();
    expect(state.organizations.org_tvb.importance).toBeGreaterThan(0);

    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_static' });

    expect(selection.organizationCandidates).toEqual([]);
  });

  it('activates a non-police organization through a visible player relation and caps candidates at two', () => {
    const state = createInitialRuntimeState();
    state.organizations.org_test_media_2 = {
      ...state.organizations.org_tvb,
      organizationId: 'org_test_media_2',
      name: '测试报馆二号'
    };
    state.organizations.org_test_business_3 = {
      ...state.organizations.org_tvb,
      organizationId: 'org_test_business_3',
      name: '测试商行三号',
      type: 'business'
    };
    state.actors.player.organizationRelations.push(
      { organizationId: 'org_tvb', relationType: 'contractor', summary: '协助采访', visibility: 'player_known' },
      { organizationId: 'org_test_media_2', relationType: 'source', summary: '报料关系', visibility: 'player_known' },
      { organizationId: 'org_test_business_3', relationType: 'customer', summary: '业务往来', visibility: 'player_known' }
    );

    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_links' });

    expect(selection.organizationCandidates).toHaveLength(2);
    expect(selection.organizationCandidates.every((candidate) => candidate.trigger === 'player-link')).toBe(true);
    expect(selection.truncatedOrganizationCount).toBe(1);
    expect(selection.organizationCandidates.every((candidate) => candidate.allowMaterialProgress === false)).toBe(true);
  });

  it('keeps the current public triad first and carries its patron, peer, and responsibility actors', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member', playerName: '陈启明' });
    const profile = state.actors.player.roleProfiles.triad!;
    const organizationId = profile.organizationId!;
    state.actors.actor_patron = {
      ...state.actors.player,
      actorId: 'actor_patron',
      name: '阿成',
      presence: 'absent'
    } as Actor;
    state.actors.actor_peer = {
      ...state.actors.player,
      actorId: 'actor_peer',
      name: '阿杰',
      presence: 'absent'
    } as Actor;
    state.actors.actor_contact = {
      ...state.actors.player,
      actorId: 'actor_contact',
      name: '摊档联系人',
      presence: 'absent'
    } as Actor;
    state.actors.player.roleProfiles.triad = {
      ...profile,
      patronActorIds: ['actor_patron'],
      peerActorIds: ['actor_peer']
    };
    state.dynamicEvents.currentMatters.matter_triad_responsibility = {
      id: 'matter_triad_responsibility',
      title: '了解摊档争执',
      summary: '先了解来龙去脉。',
      status: 'active',
      priority: 70,
      visibility: 'known',
      source: 'triad_responsibility',
      matterKind: 'social',
      relatedActorIds: ['actor_contact'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [organizationId],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.actors.player.organizationRelations.push(
      { organizationId: 'org_tvb', relationType: 'contractor', summary: '协助采访', visibility: 'player_known' },
      { organizationId: 'org_atv', relationType: 'source', summary: '报料关系', visibility: 'player_known' }
    );

    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_triad_priority' });

    expect(selection.organizationCandidates[0]?.organizationId).toBe(organizationId);
    expect(selection.organizationCandidates[0]?.relatedActorIds.slice(0, 3)).toEqual([
      'actor_patron',
      'actor_peer',
      'actor_contact'
    ]);
  });

  it('reviews an active organization only when due and never bypasses the 24-hour material gate', () => {
    const state = createInitialRuntimeState();
    const track = activeOrganizationTrack(state);
    state.backgroundEvolution.organizationTracks[track.trackId] = track;

    expect(selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_early' }).organizationCandidates).toEqual([]);

    state.time = addGameHours(state.time, 23);
    const manual = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_manual', manual: true });
    expect(manual.organizationCandidates[0]).toMatchObject({ organizationId: 'org_tvb', allowMaterialProgress: false });

    state.time = addGameHours(track.startedAt!, 24);
    const due = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_due' });
    expect(due.organizationCandidates[0]).toMatchObject({
      organizationId: 'org_tvb',
      trackId: track.trackId,
      trigger: 'due',
      allowMaterialProgress: true
    });
  });

  it('selects an important known remote actor even without a case or relationship thread', () => {
    const state = createInitialRuntimeState();
    addRemoteActor(state, 'actor_known_supervisor');
    Object.assign(state.actors.actor_known_supervisor, {
      name: '陈国斌',
      importance: 80,
      interactionScore: 30,
      relationshipSummary: '玩家的直属上司，答应替玩家探听消息。',
      recentInteractionMemory: '刚交代玩家低调整理旧案卷宗。'
    });

    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_important_actor'
    });

    expect(selection.npcCandidates).toContainEqual(
      expect.objectContaining({
        actorId: 'actor_known_supervisor',
        trigger: 'important-actor',
        visibilityHint: 'rumor'
      })
    );
  });

  it('keeps an active relationship eligible even when its optional pull fields are empty', () => {
    const state = createInitialRuntimeState();
    addRemoteActor(state);
    state.relationshipThreads.thread_liu = {
      threadId: 'thread_liu',
      kind: 'network',
      title: '同僚',
      summary: '与玩家共同办过事。',
      relatedActorIds: ['player', 'actor_liu'],
      primaryActorId: 'actor_liu',
      relationshipRole: '同僚',
      status: 'active',
      milestones: [],
      visibility: 'player_known',
      importance: 60,
      createdAt: state.time,
      updatedAt: state.time
    };

    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_relationship_without_pull'
    });

    expect(selection.npcCandidates[0]).toMatchObject({
      actorId: 'actor_liu',
      trigger: 'relationship',
      visibilityHint: 'player_known'
    });
  });

  it.each(['network', 'fate'] as const)(
    'keeps a %s relationship actor eligible when the model incorrectly used the player as primaryActorId',
    (kind) => {
      const state = createInitialRuntimeState();
      addRemoteActor(state, `actor_${kind}`);
      state.relationshipThreads[`thread_${kind}`] = {
        threadId: `thread_${kind}`,
        kind,
        title: kind === 'network' ? '长期人脉' : '长期缘分',
        summary: '这名人物与玩家存在持续关系。',
        relatedActorIds: ['player', `actor_${kind}`],
        primaryActorId: 'player',
        relationshipRole: kind === 'network' ? '长期联系人' : '情感对象',
        status: 'active',
        milestones: [],
        visibility: 'player_known',
        importance: 60,
        createdAt: state.time,
        updatedAt: state.time
      };

      const selection = selectBackgroundEvolutionCandidates({
        state,
        foregroundTurnId: `turn_${kind}_fallback_actor`
      });

      expect(selection.npcCandidates).toContainEqual(
        expect.objectContaining({
          actorId: `actor_${kind}`,
          trigger: 'relationship',
          relatedRelationshipThreadIds: [`thread_${kind}`]
        })
      );
    }
  );

  it('keeps every remote NPC in a multi-actor relationship eligible for bounded evolution', () => {
    const state = createInitialRuntimeState();
    addRemoteActor(state, 'actor_family_a');
    addRemoteActor(state, 'actor_family_b');
    state.relationshipThreads.thread_family = {
      threadId: 'thread_family',
      kind: 'network',
      title: '家庭关系',
      summary: '两名亲属都与玩家保持长期联系。',
      relatedActorIds: ['player', 'actor_family_a', 'actor_family_b'],
      primaryActorId: 'actor_family_a',
      relationshipRole: '家人',
      status: 'active',
      milestones: [],
      visibility: 'player_known',
      importance: 70,
      createdAt: state.time,
      updatedAt: state.time
    };

    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_multi_actor_relationship'
    });

    expect(selection.npcCandidates.map((candidate) => candidate.actorId)).toEqual(
      expect.arrayContaining(['actor_family_a', 'actor_family_b'])
    );
    expect(selection.npcCandidates.every((candidate) => candidate.relatedRelationshipThreadIds.includes('thread_family'))).toBe(true);
  });

  it('uses per-actor review cooldowns and importance ordering to avoid candidate starvation', () => {
    const state = createInitialRuntimeState();
    addRemoteActor(state, 'actor_lower');
    addRemoteActor(state, 'actor_higher');
    Object.assign(state.actors.actor_lower, {
      importance: 65,
      interactionScore: 10,
      relationshipSummary: '近期见过玩家。'
    });
    Object.assign(state.actors.actor_higher, {
      importance: 90,
      interactionScore: 10,
      relationshipSummary: '近期见过玩家。'
    });
    state.backgroundEvolution.npcReviewCooldownUntil = {
      actor_lower: addGameHours(state.time, 24)
    };

    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_fairness'
    });

    expect(selection.npcCandidates.map((candidate) => candidate.actorId)).toEqual([
      'actor_higher'
    ]);
  });
});
