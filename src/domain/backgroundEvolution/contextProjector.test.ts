import { describe, expect, it } from 'vitest';
import { composePrompt } from '../context/composePrompt';
import { selectContext } from '../context/selectContext';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { NpcEvolutionTrack, OrganizationEvolutionTrack } from '../runtime/types';
import {
  MAX_BACKGROUND_NPC_ACTIONS_IN_PROMPT,
  MAX_BACKGROUND_ORGANIZATION_ACTIONS_IN_PROMPT,
  projectBackgroundEvolutionContext
} from './contextProjector';

function createTrack(index: number, overrides: Partial<NpcEvolutionTrack> = {}): NpcEvolutionTrack {
  return {
    trackId: `npc_track_${index}`,
    actorId: `npc_remote_${index}`,
    status: 'active',
    actionKind: 'work',
    objective: `完成远场目标 ${index}`,
    currentAction: `执行远场行动 ${index}`,
    currentStatus: `行动 ${index} 正在进行`,
    currentPlaceId: 'place_mong_kok_station',
    startedAt: { year: 1988, month: 6, day: 1, hour: index, minute: 0 },
    expectedEndAt: { year: 1988, month: 6, day: 2, hour: index, minute: 0 },
    nextReviewAt: { year: 1988, month: 6, day: 1, hour: index + 6, minute: 0 },
    relatedActorIds: [],
    relatedOrganizationIds: [],
    relatedPlaceIds: ['place_mong_kok_station'],
    relatedCaseIds: [],
    relatedRelationshipThreadIds: [],
    relatedCityTrackIds: [],
    relatedDeferredEventIds: [],
    visibility: 'player_known',
    ...overrides
  };
}

function createOrganizationTrack(
  organizationId: string,
  index: number,
  overrides: Partial<OrganizationEvolutionTrack> = {}
): OrganizationEvolutionTrack {
  return {
    trackId: `organization_track_${index}`,
    organizationId,
    status: 'active',
    objective: `完成组织目标 ${index}`,
    currentAction: `执行组织行动 ${index}`,
    currentStatus: `组织行动 ${index} 正在进行`,
    startedAt: { year: 1988, month: 6, day: 1, hour: index, minute: 0 },
    expectedEndAt: { year: 1988, month: 6, day: 3, hour: index, minute: 0 },
    nextReviewAt: { year: 1988, month: 6, day: 2, hour: index, minute: 0 },
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedCityTrackIds: [],
    visibility: 'player_known',
    ...overrides
  };
}

describe('background evolution context projector', () => {
  it('projects bounded visible facts and prioritizes a directly named NPC', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_remote_5 = createActorDefaults({
      actorId: 'npc_remote_5',
      name: '刘启',
      currentIdentity: 'police',
      publicIdentity: '便衣探员'
    });
    for (let index = 1; index <= 6; index += 1) {
      state.backgroundEvolution.npcTracks[`npc_track_${index}`] = createTrack(index, {
        visibility: index === 6 ? 'hidden' : 'player_known'
      });
    }
    state.backgroundEvolution.recentOutcomes = [
      {
        outcomeId: 'outcome_visible',
        sourceReviewKey: 'review_visible',
        occurredAt: { ...state.time },
        sourceKind: 'npc',
        sourceId: 'npc_track_5',
        title: '走访暂时没有结果',
        summary: '刘启走访夜班工人后尚未找到可靠目击者。',
        relatedActorIds: ['npc_remote_5'],
        relatedOrganizationIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedRelationshipThreadIds: [],
        visibility: 'player_known',
        significance: 'routine'
      },
      {
        outcomeId: 'outcome_hidden',
        sourceReviewKey: 'review_hidden',
        occurredAt: { ...state.time },
        sourceKind: 'npc',
        sourceId: 'npc_track_6',
        title: '玩家不应知道',
        summary: '隐藏结果。',
        relatedActorIds: [],
        relatedOrganizationIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedRelationshipThreadIds: [],
        visibility: 'hidden',
        significance: 'notable'
      }
    ];

    const projection = projectBackgroundEvolutionContext(state, '问刘启调查得怎么样');

    expect(projection.activeNpcActions).toHaveLength(MAX_BACKGROUND_NPC_ACTIONS_IN_PROMPT);
    expect(projection.activeNpcActions[0]?.actorId).toBe('npc_remote_5');
    expect(projection.activeNpcActions.some((track) => track.trackId === 'npc_track_6')).toBe(false);
    expect(projection.recentOutcomes.map((outcome) => outcome.outcomeId)).toEqual(['outcome_visible']);
    expect(projection.diagnostics.omittedHiddenCount).toBe(2);
  });

  it('feeds ongoing actions and completed outcomes to the main prompt as different fact classes', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_remote_1 = createActorDefaults({
      actorId: 'npc_remote_1',
      name: '刘启',
      currentIdentity: 'police',
      publicIdentity: '便衣探员'
    });
    state.backgroundEvolution.npcTracks.npc_track_1 = createTrack(1, {
      actorId: 'npc_remote_1',
      actionKind: 'case',
      currentAction: '在油麻地果栏走访夜班工人，核对目击时间',
      currentStatus: '已问过两名工人，尚未找到一致口供',
      relatedCaseIds: ['case_remote_1']
    });
    state.backgroundEvolution.recentOutcomes = [
      {
        outcomeId: 'outcome_no_result',
        sourceReviewKey: 'review_no_result',
        occurredAt: { ...state.time },
        sourceKind: 'case',
        sourceId: 'case_remote_1',
        title: '第一轮走访无果',
        summary: '现有目击说法互相矛盾，案件没有因此结案。',
        consequence: '刘启需要决定继续走访、受阻或移交。',
        relatedActorIds: ['npc_remote_1'],
        relatedOrganizationIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: ['case_remote_1'],
        relatedRelationshipThreadIds: [],
        visibility: 'player_known',
        significance: 'notable'
      }
    ];

    const prompt = composePrompt(selectContext(state, '问刘启手上的案件'), '问刘启手上的案件');

    expect(prompt).toContain('BACKGROUND_EVOLUTION_FACTS');
    expect(prompt).toContain('在油麻地果栏走访夜班工人，核对目击时间');
    expect(prompt).toContain('第一轮走访无果');
    expect(prompt).toContain('activeNpcActions 是正在发生的既有事实');
    expect(prompt).toContain('expectedEndAt 只是预计时间，不保证成功');
  });

  it('projects at most three visible organization actions and feeds them to the main prompt', () => {
    const state = createInitialRuntimeState();
    const organizationIds = ['org_tvb', 'org_ming_pao', 'org_hsbc', 'org_golden_harvest'];
    organizationIds.forEach((organizationId, index) => {
      state.backgroundEvolution.organizationTracks[`organization_track_${index}`] = createOrganizationTrack(
        organizationId,
        index
      );
    });

    const playerInput = `询问${state.organizations.org_tvb.name}的采访安排`;
    const projection = projectBackgroundEvolutionContext(state, playerInput);
    expect(projection.activeOrganizationActions).toHaveLength(MAX_BACKGROUND_ORGANIZATION_ACTIONS_IN_PROMPT);
    expect(projection.activeOrganizationActions[0].organizationId).toBe('org_tvb');
    expect(projection.diagnostics.omittedOrganizationActionCount).toBe(1);

    const prompt = composePrompt(selectContext(state, playerInput), playerInput);
    expect(prompt).toContain('activeOrganizationActions:');
    expect(prompt).toContain('执行组织行动 0');
    expect(prompt).toContain('组织的低频后台行动事实');
  });

  it('keeps the current public triad organization ahead of unrelated organization actions', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member', playerName: '陈启明' });
    const organizationId = state.actors.player.roleProfiles.triad?.organizationId;
    expect(organizationId).toBeTruthy();

    ['org_tvb', 'org_ming_pao', 'org_hsbc'].forEach((candidateId, index) => {
      state.backgroundEvolution.organizationTracks[`organization_track_unrelated_${index}`] = createOrganizationTrack(
        candidateId,
        index
      );
    });
    state.backgroundEvolution.organizationTracks.organization_track_player = createOrganizationTrack(
      organizationId!,
      9,
      { objective: '维持所属地区的内部协调' }
    );

    const projection = projectBackgroundEvolutionContext(state, '先看看今晚街面有没有异常');

    expect(projection.activeOrganizationActions[0]?.organizationId).toBe(organizationId);
    expect(projection.activeOrganizationActions[0]?.objective).toBe('维持所属地区的内部协调');
  });

  it('omits foreground-interrupted NPC actions from the main prompt projection', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_remote_1 = createActorDefaults({
      actorId: 'npc_remote_1',
      name: '刘启',
      currentIdentity: 'police',
      publicIdentity: '便衣探员'
    });
    state.actors.npc_remote_1.presence = 'absent';
    state.backgroundEvolution.npcTracks.npc_track_1 = createTrack(1, {
      actorId: 'npc_remote_1',
      foregroundInterruption: {
        interruptedAt: state.time,
        foregroundTurnId: 'turn_foreground',
        reason: 'foreground_writeback'
      }
    });

    const projection = projectBackgroundEvolutionContext(state, '问刘启现在在做什么');

    expect(projection.activeNpcActions).toEqual([]);
  });

  it('ranks an older but directly relevant chronicle entry ahead of newer unrelated history', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_remote_1 = createActorDefaults({
      actorId: 'npc_remote_1',
      name: '刘启',
      currentIdentity: 'police',
      publicIdentity: '便衣探员'
    });
    state.backgroundEvolution.chronicle = [
      {
        entryId: 'chronicle_lau',
        occurredAt: { ...state.time, month: 5, day: 30 },
        title: '刘启建立夜班联络线',
        summary: '刘启确认了夜班值日台的安全传话方式。',
        longTermImpact: '突发情况可由值日台转达。',
        sourceOutcomeIds: ['outcome_lau'],
        relatedActorIds: ['npc_remote_1'],
        relatedOrganizationIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        visibility: 'player_known'
      },
      {
        entryId: 'chronicle_unrelated_new',
        occurredAt: { ...state.time },
        title: '无关的新史册',
        summary: '另一处市场改变了收档时间。',
        longTermImpact: '夜间人流减少。',
        sourceOutcomeIds: ['outcome_other'],
        relatedActorIds: [],
        relatedOrganizationIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        visibility: 'public'
      },
      {
        entryId: 'chronicle_unrelated_old',
        occurredAt: { ...state.time, month: 5, day: 31 },
        title: '另一条无关史册',
        summary: '报馆调整了版面。',
        longTermImpact: '社会版缩短。',
        sourceOutcomeIds: ['outcome_press'],
        relatedActorIds: [],
        relatedOrganizationIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        visibility: 'public'
      }
    ];

    const projection = projectBackgroundEvolutionContext(state, '问刘启的旧联络安排');

    expect(projection.chronicle[0]?.entryId).toBe('chronicle_lau');
    expect(projection.chronicle).toHaveLength(2);
  });
});
