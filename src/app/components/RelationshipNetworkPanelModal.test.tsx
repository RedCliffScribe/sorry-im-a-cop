import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { Actor, RuntimeState } from '../../domain/runtime/types';
import { RelationshipNetworkPanelModal } from './RelationshipNetworkPanelModal';

function addActor(state: RuntimeState, actor: Partial<Actor> & Pick<Actor, 'actorId' | 'name'>) {
  const baseActor: Actor = {
    actorId: actor.actorId,
    name: actor.name,
    englishName: actor.englishName,
    aliases: [],
    gender: 'male',
    currentIdentity: 'civilian',
    roleProfiles: {},
    organizationIds: [],
    organizationRelations: [],
    positionSummary: '街坊熟人',
    presence: 'absent',
    profileSummary: '经常在旺角一带出现。',
    appearance: '普通街坊打扮。',
    clothing: '便服。',
    equipment: [],
    personality: '圆滑。',
    speechStyle: '港式口语。',
    motivation: '维持生活。',
    longTermGoal: '安稳过日子。',
    values: '现实。',
    attributes: { body: 50, action: 50, perception: 50, thinking: 50, negotiation: 50, will: 50 },
    activeTraits: [],
    traitProgress: [],
    statusSummary: '正常。',
    relationshipSummary: '与玩家有点交情。',
    attitudeTowardPlayer: '谨慎。',
    interactionScore: 20,
    trustTendency: '中等',
    entanglementSummary: '偶尔帮忙带话。',
    longTermMemorySummary: '',
    recentInteractionMemory: '',
    keyMemories: [],
    femaleProfile: undefined,
    visibility: 'player_known',
    importance: 50
  };
  state.actors[actor.actorId] = { ...baseActor, ...actor };
}

function createStateWithThreads() {
  const state = createInitialRuntimeState();
  addActor(state, { actorId: 'actor_lam', name: '林志明', englishName: 'Jimmy Lam' });
  addActor(state, { actorId: 'actor_ho', name: '何家荣', englishName: 'Gary Ho' });
  state.relationshipThreads.thread_lam_network = {
    threadId: 'thread_lam_network',
    kind: 'network',
    title: '旺角旧街坊',
    summary: '林志明在街坊圈里消息灵通，偶尔愿意帮玩家探听风声。',
    relatedActorIds: ['actor_lam'],
    primaryActorId: 'actor_lam',
    relationshipRole: '街坊线人',
    status: 'active',
    trustSummary: '愿意帮小忙，但不会冒大风险。',
    conflictSummary: '',
    promiseSummary: '答应有消息会托茶餐厅老板转告。',
    riskSummary: '过度接触可能让社团注意。',
    currentPull: '最近有社团人在找他问话。',
    nextNaturalBeatHint: '可在茶餐厅偶遇。',
    milestones: [
      {
        milestoneId: 'ms_lam_1',
        gameTime: state.time,
        summary: '玩家替他挡过一次无理盘查。',
        importance: 50,
        relatedActorIds: ['actor_lam'],
        visibility: 'player_known'
      }
    ],
    visibility: 'player_known',
    importance: 70,
    createdAt: state.time,
    updatedAt: state.time
  };
  state.relationshipThreads.thread_hidden = {
    ...state.relationshipThreads.thread_lam_network,
    threadId: 'thread_hidden',
    title: '隐藏人脉',
    visibility: 'hidden'
  };
  state.relationshipThreads.thread_fate = {
    ...state.relationshipThreads.thread_lam_network,
    threadId: 'thread_fate',
    kind: 'fate',
    title: '旧情缘',
    visibility: 'player_known'
  };
  return state;
}

function addSecondVisibleNetworkThread(state: RuntimeState) {
  state.relationshipThreads.thread_ho_network = {
    ...state.relationshipThreads.thread_lam_network,
    threadId: 'thread_ho_network',
    title: '报馆消息线',
    summary: '何家荣在小报编辑部有人脉，偶尔能听到媒体准备追哪条新闻。',
    relatedActorIds: ['actor_ho'],
    primaryActorId: 'actor_ho',
    relationshipRole: '媒体线',
    currentPull: '他听说有记者在问旺角警署夜间处置的细节。',
    riskSummary: '消息走漏会让玩家被媒体盯上。',
    nextNaturalBeatHint: '可通过电话或报摊老板转接。',
    importance: 62,
    milestones: [
      {
        milestoneId: 'ms_ho_1',
        gameTime: state.time,
        summary: '何家荣曾经帮玩家确认一则小报传闻没有登版。',
        importance: 45,
        relatedActorIds: ['actor_ho'],
        visibility: 'player_known'
      }
    ]
  };
}

describe('RelationshipNetworkPanelModal', () => {
  it('renders visible network threads and filters hidden or fate threads', () => {
    render(<RelationshipNetworkPanelModal state={createStateWithThreads()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '人脉' });
    expect(dialog).toHaveTextContent('旺角旧街坊');
    expect(dialog).toHaveTextContent('林志明 / Jimmy Lam');
    expect(dialog).toHaveTextContent('街坊线人');
    expect(dialog).toHaveTextContent('玩家替他挡过一次无理盘查');
    expect(dialog).not.toHaveTextContent('隐藏人脉');
    expect(dialog).not.toHaveTextContent('旧情缘');
  });

  it('shows an empty state when no visible network threads exist', () => {
    render(<RelationshipNetworkPanelModal state={createInitialRuntimeState()} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: '人脉' })).toHaveTextContent('暂无已知人脉');
  });

  it('closes from the header button', () => {
    const onClose = vi.fn();
    render(<RelationshipNetworkPanelModal state={createStateWithThreads()} onClose={onClose} />);

    fireEvent.click(within(screen.getByRole('dialog', { name: '人脉' })).getByRole('button', { name: '关闭' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('requires a second confirmation before deleting a network relationship', async () => {
    const onDeleteThread = vi.fn(async () => undefined);
    render(
      <RelationshipNetworkPanelModal
        state={createStateWithThreads()}
        onClose={vi.fn()}
        onDeleteThread={onDeleteThread}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '删除人脉：旺角旧街坊' }));
    const confirmation = screen.getByRole('alertdialog', { name: '确认删除人脉' });
    expect(confirmation).toHaveTextContent('不会移除人物、过往正文或已写入记忆');

    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }));
    expect(onDeleteThread).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '删除人脉：旺角旧街坊' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog', { name: '确认删除人脉' })).getByRole('button', {
        name: '确认删除'
      })
    );

    await waitFor(() => expect(onDeleteThread).toHaveBeenCalledWith('thread_lam_network'));
  });

  it('uses the left list as tabs and only renders the selected thread detail', () => {
    const state = createStateWithThreads();
    addSecondVisibleNetworkThread(state);

    render(<RelationshipNetworkPanelModal state={state} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '人脉' });
    expect(dialog).toHaveTextContent('旺角旧街坊');
    expect(dialog).toHaveTextContent('报馆消息线');
    expect(dialog).toHaveTextContent('林志明 / Jimmy Lam');
    expect(dialog).toHaveTextContent('玩家替他挡过一次无理盘查');
    expect(dialog).not.toHaveTextContent('何家荣 / Gary Ho');
    expect(dialog).not.toHaveTextContent('何家荣曾经帮玩家确认一则小报传闻没有登版');

    fireEvent.click(within(dialog).getByRole('button', { name: /报馆消息线/ }));

    expect(dialog).toHaveTextContent('何家荣 / Gary Ho');
    expect(dialog).toHaveTextContent('何家荣曾经帮玩家确认一则小报传闻没有登版');
    expect(dialog).not.toHaveTextContent('林志明 / Jimmy Lam');
    expect(dialog).not.toHaveTextContent('玩家替他挡过一次无理盘查');
  });

  it('keeps dormant and ended contacts discoverable in an explicit history filter', () => {
    const state = createStateWithThreads();
    state.relationshipThreads.thread_lam_network.status = 'dormant';
    addSecondVisibleNetworkThread(state);
    state.relationshipThreads.thread_ho_network.status = 'active';

    render(<RelationshipNetworkPanelModal state={state} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '人脉' });
    expect(within(dialog).getByLabelText('人脉统计')).toHaveTextContent('已知 2');
    expect(within(dialog).getByLabelText('人脉统计')).toHaveTextContent('过往 1');

    fireEvent.click(within(dialog).getByRole('button', { name: '沉寂与结束（1）' }));

    expect(within(dialog).getByRole('button', { name: /旺角旧街坊/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /报馆消息线/ })).not.toBeInTheDocument();
  });

  it('shows a related NPC current action and known outcome without engineering scores', () => {
    const state = createStateWithThreads();
    state.backgroundEvolution.npcTracks.track_lam = {
      trackId: 'track_lam',
      actorId: 'actor_lam',
      status: 'active',
      actionKind: 'relationship',
      objective: '避开社团注意并维持消息渠道。',
      currentAction: '到旧茶餐厅确认最近是谁在打听玩家',
      currentStatus: '正在等老板打烊后单独说话',
      expectedEndAt: { year: 1988, month: 6, day: 1, hour: 22, minute: 0 },
      nextReviewAt: { year: 1988, month: 6, day: 1, hour: 22, minute: 0 },
      relatedActorIds: [],
      relatedOrganizationIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedRelationshipThreadIds: ['thread_lam_network'],
      relatedCityTrackIds: [],
      relatedDeferredEventIds: [],
      visibility: 'player_known'
    };
    state.backgroundEvolution.recentOutcomes = [
      {
        outcomeId: 'outcome_lam_warning',
        sourceReviewKey: 'review_lam_warning',
        occurredAt: state.time,
        sourceKind: 'relationship',
        sourceId: 'thread_lam_network',
        title: '林志明传来提醒',
        summary: '林志明确认有人在茶餐厅附近打听玩家的夜间巡逻路线。',
        relatedActorIds: ['actor_lam'],
        relatedOrganizationIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedRelationshipThreadIds: ['thread_lam_network'],
        visibility: 'player_known',
        significance: 'notable'
      }
    ];

    render(<RelationshipNetworkPanelModal state={state} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '人脉' });
    expect(dialog).toHaveTextContent('人物动向');
    expect(dialog).toHaveTextContent('到旧茶餐厅确认最近是谁在打听玩家');
    expect(dialog).toHaveTextContent('林志明确认有人在茶餐厅附近打听玩家的夜间巡逻路线');
    expect(dialog).toHaveTextContent('过往记录');
    expect(dialog).not.toHaveTextContent('重要度');
    expect(dialog).not.toHaveTextContent('信任度');
    expect(dialog).not.toHaveTextContent('亲密度');
  });

  it('hides a stale remote action after the same NPC re-enters foreground story', () => {
    const state = createStateWithThreads();
    state.backgroundEvolution.npcTracks.track_lam = {
      trackId: 'track_lam',
      actorId: 'actor_lam',
      status: 'blocked',
      actionKind: 'relationship',
      objective: '维持消息渠道',
      currentAction: '这条被打断的旧行动不应显示',
      currentStatus: '前台已经介入',
      nextReviewAt: state.time,
      relatedActorIds: [],
      relatedOrganizationIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedRelationshipThreadIds: ['thread_lam_network'],
      relatedCityTrackIds: [],
      relatedDeferredEventIds: [],
      foregroundInterruption: {
        interruptedAt: state.time,
        foregroundTurnId: 'turn_foreground',
        reason: 'foreground_writeback'
      },
      visibility: 'player_known'
    };

    render(<RelationshipNetworkPanelModal state={state} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '人脉' });
    expect(dialog).toHaveTextContent('近期没有可确认的动向');
    expect(dialog).not.toHaveTextContent('这条被打断的旧行动不应显示');
  });
});
