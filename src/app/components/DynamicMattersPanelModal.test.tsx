import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { RuntimeState } from '../../domain/runtime/types';
import { DynamicMattersPanelModal } from './DynamicMattersPanelModal';

function withDynamicFixtures(): RuntimeState {
  const state = createInitialRuntimeState();
  state.dynamicEvents.currentMatters.matter_media_pressure = {
    id: 'matter_media_pressure',
    title: 'Media pressure around Mong Kok',
    summary: 'Reporters are asking why several patrol reports mention the same arcade.',
    status: 'active',
    priority: 70,
    visibility: 'known',
    source: 'media',
    matterKind: 'social',
    pressureLevel: 2,
    responseWindow: 'today',
    currentHook: 'A tabloid reporter may call the station before noon.',
    consequenceHint: 'Ignoring it lets the story grow without the player response.',
    dueAt: state.time,
    unread: true,
    relatedActorIds: ['player'],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: [],
    relatedOrganizationIds: ['org_tvb'],
    createdAt: state.time,
    updatedAt: state.time
  };
  state.dynamicEvents.currentMatters.matter_hidden_editor = {
    id: 'matter_hidden_editor',
    title: 'Hidden editor pressure',
    summary: 'This should not appear in normal UI.',
    status: 'active',
    priority: 90,
    visibility: 'hidden',
    source: 'media',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: state.time,
    updatedAt: state.time
  };
  state.dynamicEvents.currentMatters.matter_archived_dock_panic = {
    id: 'matter_archived_dock_panic',
    title: 'Archived dock panic',
    summary: 'The port-side panic has been filed away after the night shift.',
    status: 'archived',
    priority: 30,
    visibility: 'known',
    source: 'street',
    matterKind: 'social',
    pressureLevel: 1,
    responseWindow: 'open',
    relatedActorIds: [],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: state.time,
    updatedAt: state.time
  };
  state.dynamicEvents.signals.signal_street_rumor = {
    id: 'signal_street_rumor',
    title: 'Street says a manager is paying protection money',
    summary: 'A food stall owner heard the arcade manager has started paying a new group.',
    signalType: 'rumor',
    reliability: 'unknown',
    status: 'active',
    visibility: 'known',
    relatedActorIds: [],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: state.time,
    updatedAt: state.time
  };
  state.dynamicEvents.signals.signal_archived_teahouse = {
    id: 'signal_archived_teahouse',
    title: 'Archived tea-house rumor',
    summary: 'The old tea-house rumor has gone cold and should stay out of the current feed.',
    signalType: 'street',
    reliability: 'low',
    status: 'archived',
    visibility: 'known',
    relatedActorIds: [],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: state.time,
    updatedAt: state.time
  };
  state.dynamicEvents.signals.signal_hidden = {
    id: 'signal_hidden',
    title: 'Hidden signal',
    summary: 'This should not appear.',
    signalType: 'other',
    reliability: 'high',
    status: 'active',
    visibility: 'hidden',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: state.time,
    updatedAt: state.time
  };
  return state;
}

function renderPanel(state = withDynamicFixtures()) {
  return render(<DynamicMattersPanelModal state={state} onClose={vi.fn()} />);
}

describe('DynamicMattersPanelModal', () => {
  it('keeps the outer panel height stable while filters change content length', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const desktopRule = css.match(/\.archive-info-modal--dynamic\s*\{[^}]+\}/)?.[0] ?? '';

    expect(desktopRule).toContain('height: calc(100dvh - 48px)');
    expect(desktopRule).toContain('min-height: 0');
    expect(desktopRule).toContain('max-height: calc(100dvh - 48px)');
  });

  it('renders current matters and signals without exposing hidden items', () => {
    renderPanel();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Media pressure around Mong Kok');
    expect(dialog).toHaveTextContent('Street says a manager is paying protection money');
    expect(dialog).not.toHaveTextContent('Hidden editor pressure');
    expect(dialog).not.toHaveTextContent('Hidden signal');
    expect(dialog).not.toHaveTextContent('隐藏项不会在普通界面显示');
    expect(dialog).not.toHaveTextContent('来源');
  });

  it('filters between current matters and signals', () => {
    const { container } = renderPanel();

    const dialog = screen.getByRole('dialog');
    const filterButtons = container.querySelectorAll('.dynamic-filter-list button');
    fireEvent.click(filterButtons[2]);

    expect(dialog).toHaveTextContent('Street says a manager is paying protection money');
    expect(dialog).not.toHaveTextContent('Media pressure around Mong Kok');
  });

  it('keeps archived entries behind an archived filter tab', () => {
    renderPanel();

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent('Archived dock panic');
    expect(dialog).not.toHaveTextContent('Archived tea-house rumor');

    const archivedFilter = screen.getByRole('button', { name: /已归档/ });
    expect(archivedFilter).toHaveTextContent('2');
    fireEvent.click(archivedFilter);

    expect(dialog).toHaveTextContent('Archived dock panic');
    expect(dialog).toHaveTextContent('Archived tea-house rumor');
    expect(dialog).not.toHaveTextContent('Media pressure around Mong Kok');
    expect(dialog).not.toHaveTextContent('Street says a manager is paying protection money');
  });

  it('treats resolved matters and signals as archived entries', () => {
    const state = withDynamicFixtures();
    state.dynamicEvents.currentMatters.matter_resolved_food_stall = {
      id: 'matter_resolved_food_stall',
      title: 'Resolved food stall argument',
      summary: 'The argument has already been settled on scene.',
      status: 'resolved',
      priority: 50,
      visibility: 'known',
      source: 'police_report',
      matterKind: 'police_work',
      pressureLevel: 0,
      responseWindow: 'open',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.dynamicEvents.signals.signal_resolved_market = {
      id: 'signal_resolved_market',
      title: 'Resolved market whisper',
      summary: 'The market whisper has been clarified.',
      signalType: 'street',
      reliability: 'medium',
      status: 'resolved',
      visibility: 'known',
      relatedActorIds: [],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };

    renderPanel(state);

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent('Resolved food stall argument');
    expect(dialog).not.toHaveTextContent('Resolved market whisper');

    const archivedFilter = screen.getByRole('button', { name: /已归档/ });
    expect(archivedFilter).toHaveTextContent('4');
    fireEvent.click(archivedFilter);

    expect(dialog).toHaveTextContent('Resolved food stall argument');
    expect(dialog).toHaveTextContent('已平息');
    expect(dialog).toHaveTextContent('Resolved market whisper');
  });

  it('moves stale and locally expired wind signals behind the archived filter', () => {
    const state = withDynamicFixtures();
    state.dynamicEvents.signals.signal_stale = {
      ...state.dynamicEvents.signals.signal_street_rumor,
      id: 'signal_stale',
      title: '已经过时的码头风声',
      status: 'stale'
    };
    state.dynamicEvents.signals.signal_expired = {
      ...state.dynamicEvents.signals.signal_street_rumor,
      id: 'signal_expired',
      title: '两周前的旧街坊风声',
      updatedAt: { ...state.time, day: state.time.day - 14 }
    };

    renderPanel(state);

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent('已经过时的码头风声');
    expect(dialog).not.toHaveTextContent('两周前的旧街坊风声');

    fireEvent.click(screen.getByRole('button', { name: /已归档/ }));
    expect(dialog).toHaveTextContent('已经过时的码头风声');
    expect(dialog).toHaveTextContent('已过时');
    expect(dialog).toHaveTextContent('两周前的旧街坊风声');
    expect(dialog).toHaveTextContent('已归档');
  });

  it('offers manual archive actions for current matters and wind signals', () => {
    const onArchiveEntry = vi.fn();
    render(
      <DynamicMattersPanelModal
        state={withDynamicFixtures()}
        onClose={vi.fn()}
        onArchiveEntry={onArchiveEntry}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '归档风声 Street says a manager is paying protection money' }));
    fireEvent.click(screen.getByRole('button', { name: '归档事项 Media pressure around Mong Kok' }));

    expect(onArchiveEntry).toHaveBeenNthCalledWith(1, 'signal', 'signal_street_rumor');
    expect(onArchiveEntry).toHaveBeenNthCalledWith(2, 'matter', 'matter_media_pressure');
  });

  it('treats dormant matters with terminal outcomes as archived entries', () => {
    const state = withDynamicFixtures();
    state.dynamicEvents.currentMatters.matter_dormant_done = {
      id: 'matter_dormant_done',
      title: '联英马仔街头寻仇（已瓦解）',
      summary: '残余马仔受到叔父辈警告及警方高压，已彻底丧失斗志。',
      status: 'dormant',
      priority: 80,
      visibility: 'known',
      source: 'street',
      matterKind: 'social',
      pressureLevel: 0,
      responseWindow: 'open',
      currentHook: '玩家确认残余马仔见警即逃，该隐患暂时解除。',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: ['org_14k'],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.dynamicEvents.currentMatters.matter_dormant_ambiguous = {
      id: 'matter_dormant_ambiguous',
      title: '报案材料等待补交',
      summary: '本轮询问告一段落，暂无后续消息。',
      status: 'dormant',
      priority: 60,
      visibility: 'known',
      source: 'police_report',
      matterKind: 'police_work',
      pressureLevel: 0,
      responseWindow: 'open',
      currentHook: '暂时等待报案人补交材料。',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };

    renderPanel(state);

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent('联英马仔街头寻仇（已瓦解）');
    expect(dialog).toHaveTextContent('报案材料等待补交');
    expect(dialog).toHaveTextContent('暂缓');

    const archivedFilter = screen.getByRole('button', { name: /已归档/ });
    expect(archivedFilter).toHaveTextContent('3');
    fireEvent.click(archivedFilter);

    expect(dialog).toHaveTextContent('联英马仔街头寻仇（已瓦解）');
    expect(dialog).toHaveTextContent('已平息');
    expect(dialog).not.toHaveTextContent('报案材料等待补交');
  });

  it('shows current matter pressure and timing without turning it into a quest card', () => {
    renderPanel();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('A tabloid reporter may call the station before noon.');
    expect(dialog).toHaveTextContent('Ignoring it lets the story grow without the player response.');
    expect(dialog).toHaveTextContent('1988-06-01 08:30');
    expect(dialog).not.toHaveTextContent(/reward|complete|progress/i);
    expect(dialog).not.toHaveTextContent(/奖励|完成|进度/);
  });

  it('renders empty state when there are no visible dynamic entries', () => {
    const state = createInitialRuntimeState();
    state.citySituationTracks = {};
    const { container } = renderPanel(state);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(container.querySelector('.dynamic-empty-state')).toBeInTheDocument();
  });

  it('renders important NPC actions, city evolution, outcomes and chronicle in bounded sections', () => {
    const state = createInitialRuntimeState();
    state.citySituationTracks = {};
    state.actors.npc_lau = {
      ...state.actors[state.player.actorId],
      actorId: 'npc_lau',
      name: '刘启',
      englishName: undefined,
      publicIdentity: '便衣探员',
      presence: 'absent'
    };
    state.backgroundEvolution.npcTracks.track_lau = {
      trackId: 'track_lau',
      actorId: 'npc_lau',
      status: 'active',
      actionKind: 'case',
      objective: '核对目击时间。',
      currentAction: '在果栏走访夜班工人',
      currentStatus: '正在进行',
      nextReviewAt: state.time,
      relatedActorIds: [],
      relatedOrganizationIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedRelationshipThreadIds: [],
      relatedCityTrackIds: [],
      relatedDeferredEventIds: [],
      sourceRefs: {
        actorIds: ['npc_lau'],
        caseIds: [],
        placeIds: [],
        organizationIds: [],
        relationshipThreadIds: [],
        cityTrackIds: [],
        deferredEventIds: [],
        outcomeIds: []
      },
      visibility: 'player_known'
    };
    state.citySituationTracks.track_market = {
      trackId: 'track_market',
      trackType: 'market_pressure',
      title: '果栏夜班收缩',
      summary: '连续盘查令部分档主提早收档。',
      status: 'active',
      currentBeat: '档主正在商量如何应对下一轮检查。',
      possibleDevelopments: [],
      pressureLevel: 2,
      startedAt: state.time,
      relatedActorIds: [],
      relatedOrganizationIds: [],
      relatedPowerFigureIds: [],
      relatedPlaceIds: [],
      visibility: 'public',
      nextReviewAt: state.time
    };
    state.backgroundEvolution.organizationTracks.track_tvb = {
      trackId: 'track_tvb',
      organizationId: 'org_tvb',
      status: 'active',
      objective: '完成一轮街头采访',
      currentAction: '协调采访组与晚间新闻编辑台',
      currentStatus: '正在等待采访对象确认档期',
      startedAt: state.time,
      expectedEndAt: { ...state.time, day: state.time.day + 2 },
      nextReviewAt: { ...state.time, day: state.time.day + 1 },
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedCityTrackIds: [],
      visibility: 'player_known'
    };
    state.backgroundEvolution.recentOutcomes = [
      {
        outcomeId: 'outcome_market',
        sourceReviewKey: 'review_market',
        occurredAt: state.time,
        sourceKind: 'city',
        sourceId: 'track_market',
        title: '第一轮走访无果',
        summary: '目击说法仍互相矛盾。',
        relatedActorIds: ['npc_lau'],
        relatedOrganizationIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedRelationshipThreadIds: [],
        visibility: 'player_known',
        significance: 'routine'
      }
    ];
    state.backgroundEvolution.chronicle = [
      {
        entryId: 'chronicle_market',
        occurredAt: state.time,
        title: '果栏夜班秩序改变',
        summary: '档主开始固定登记夜班工人。',
        longTermImpact: '以后核查夜间人员会留下更清晰记录。',
        sourceOutcomeIds: ['outcome_market'],
        relatedActorIds: ['npc_lau'],
        relatedOrganizationIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        visibility: 'public'
      }
    ];

    renderPanel(state);

    const dialog = screen.getByRole('dialog', { name: '城市脉搏' });
    expect(dialog).toHaveTextContent('在果栏走访夜班工人');
    expect(dialog).toHaveTextContent('果栏夜班收缩');
    expect(dialog).toHaveTextContent('协调采访组与晚间新闻编辑台');
    expect(dialog).toHaveTextContent('组织行动');
    expect(dialog).toHaveTextContent('第一轮走访无果');
    expect(dialog).toHaveTextContent('果栏夜班秩序改变');
    expect(dialog).toHaveTextContent('查看缘由');
  });

  it('shows only player-visible pending future consequences as events waiting to surface', () => {
    const state = createInitialRuntimeState();
    state.citySituationTracks = {};
    state.deferredEvents.event_future_public = {
      eventId: 'event_future_public',
      sourceModule: 'world',
      relatedIds: { placeId: state.location.currentPlaceId },
      title: '夜班消息即将传回',
      summary: '值日台预计会在换更后送来核对结果。',
      triggerAt: { ...state.time, hour: state.time.hour + 2 },
      visibility: 'player_visible',
      promptInstruction: '模型内部使用的处理说明不应显示。',
      status: 'pending',
      createdAt: state.time
    };
    state.deferredEvents.event_future_hidden = {
      ...state.deferredEvents.event_future_public,
      eventId: 'event_future_hidden',
      title: '隐藏的未来后果',
      visibility: 'hidden'
    };

    renderPanel(state);

    const dialog = screen.getByRole('dialog', { name: '城市脉搏' });
    expect(dialog).toHaveTextContent('即将浮出水面');
    expect(dialog).toHaveTextContent('夜班消息即将传回');
    expect(dialog).not.toHaveTextContent('隐藏的未来后果');
    expect(dialog).not.toHaveTextContent('模型内部使用的处理说明不应显示');
  });

  it('does not display an NPC remote action while foreground story has interrupted it', () => {
    const state = createInitialRuntimeState();
    state.citySituationTracks = {};
    state.actors.npc_lau = {
      ...state.actors[state.player.actorId],
      actorId: 'npc_lau',
      name: '刘启',
      presence: 'absent'
    };
    state.backgroundEvolution.npcTracks.track_lau = {
      trackId: 'track_lau',
      actorId: 'npc_lau',
      status: 'blocked',
      actionKind: 'work',
      objective: '核对值班记录',
      currentAction: '这条旧远场行动不应显示',
      currentStatus: '前台已经介入',
      nextReviewAt: state.time,
      relatedActorIds: [],
      relatedOrganizationIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedRelationshipThreadIds: [],
      relatedCityTrackIds: [],
      relatedDeferredEventIds: [],
      foregroundInterruption: {
        interruptedAt: state.time,
        foregroundTurnId: 'turn_foreground',
        reason: 'foreground_writeback'
      },
      visibility: 'player_known'
    };

    renderPanel(state);

    expect(screen.getByRole('dialog', { name: '城市脉搏' })).not.toHaveTextContent('这条旧远场行动不应显示');
  });

  it('offers manual background evolution with a real running and abort state', () => {
    const onRunEvolution = vi.fn();
    const onAbortEvolution = vi.fn();
    const { rerender } = render(
      <DynamicMattersPanelModal
        state={withDynamicFixtures()}
        onClose={vi.fn()}
        onRunEvolution={onRunEvolution}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '推演后台' }));
    expect(onRunEvolution).toHaveBeenCalledTimes(1);

    rerender(
      <DynamicMattersPanelModal
        state={withDynamicFixtures()}
        onClose={vi.fn()}
        onRunEvolution={onRunEvolution}
        onAbortEvolution={onAbortEvolution}
        isEvolutionRunning
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('系统正在推演远场人物与城市动态');
    fireEvent.click(screen.getByRole('button', { name: '中止推演' }));
    expect(onAbortEvolution).toHaveBeenCalledTimes(1);
  });
});
