import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { createActorDefaults } from '../../domain/runtime/actorFactory';
import type { AssetItem, CaseFile, GameTime, RuntimeState } from '../../domain/runtime/types';
import { CaseArchiveModal } from './CaseArchiveModal';

const time: GameTime = {
  year: 1988,
  month: 9,
  day: 12,
  hour: 22,
  minute: 15
};

function caseFile(caseId: string, overrides: Partial<CaseFile> = {}): CaseFile {
  return {
    caseId,
    title: caseId,
    caseType: 'assault',
    status: 'investigating',
    playerRole: 'assist',
    leadActorName: '林警长',
    summary: `${caseId} summary`,
    currentFocus: '先确认现场证词。',
    playerVisibleProgress: '玩家已取得一份证词。',
    internalProgressSummary: '主办者还在等报告。',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: time,
    updatedAt: time,
    ...overrides
  };
}

function evidenceAsset(itemId: string, caseId = 'case_bar_assault'): AssetItem {
  return {
    itemId,
    category: 'document',
    name: '酒吧老板口供',
    summary: '酒吧老板签下的口供。',
    evidence: {
      caseId,
      caseTitle: '酒吧伤人案',
      summary: '老板说看见两个人从后门离开。',
      disputed: false
    },
    relatedActorIds: [],
    relatedCaseIds: [caseId],
    relatedPlaceIds: [],
    visibility: 'player_known',
    importance: 70
  };
}

function createState(): RuntimeState {
  const state = createInitialRuntimeState();
  state.time = time;
  state.cases.case_bar_assault = caseFile('case_bar_assault', {
    title: '酒吧伤人案',
    unreadActivityCount: 2,
    activityLog: [
      {
        activityId: 'activity_1',
        kind: 'instruction',
        gameTime: time,
        summary: '主办者要求玩家补一份口供。',
        relatedEvidenceIds: [],
        relatedActorIds: [],
        relatedPlaceIds: [],
        visibleToPlayer: true
      }
    ]
  });
  state.cases.case_old = caseFile('case_old', {
    title: '旧案',
    status: 'archived',
    playerRole: 'aware',
    archivedAt: time
  });
  return state;
}

describe('CaseArchiveModal', () => {
  it('groups active and archived cases and clears unread count when selected', () => {
    const state = createState();
    state.cases.case_related = caseFile('case_related', {
      title: '移交反黑案件',
      playerRole: 'aware'
    });
    const onStateChange = vi.fn();

    render(<CaseArchiveModal state={state} onClose={vi.fn()} onStateChange={onStateChange} />);

    expect(screen.getByRole('dialog', { name: '案件' })).toBeInTheDocument();
    const activeSection = screen.getByRole('region', { name: '办理中' });
    const relatedSection = screen.getByRole('region', { name: '相关案件' });
    const archivedSection = screen.getByRole('region', { name: '已归档' });
    expect(activeSection).toBeInTheDocument();
    expect(relatedSection).toBeInTheDocument();
    expect(archivedSection).toBeInTheDocument();
    expect(within(activeSection).getByText('酒吧伤人案')).toBeInTheDocument();
    expect(within(activeSection).queryByText('移交反黑案件')).not.toBeInTheDocument();
    expect(within(relatedSection).getByText('移交反黑案件')).toBeInTheDocument();
    expect(within(archivedSection).getByText('旧案')).toBeInTheDocument();
    expect(screen.getByText('未读 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /酒吧伤人案/ }));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls[0][0].cases.case_bar_assault.unreadActivityCount).toBe(0);
    expect(onStateChange.mock.calls[0][0].cases.case_bar_assault.lastSeenActivityAt).toEqual(time);
  });

  it('shows evidence submission for assist cases but hides lead-only formal buttons', () => {
    const state = createState();

    render(<CaseArchiveModal state={state} onClose={vi.fn()} onStateChange={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '案件' });
    expect(within(dialog).getByRole('button', { name: '提交证据' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '提交检控意见' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '申请归档' })).not.toBeInTheDocument();
  });

  it('shows player-facing Chinese evidence types instead of runtime enum values', () => {
    const state = createState();
    state.caseEvidence.evidence_1 = {
      evidenceId: 'evidence_1',
      caseId: 'case_bar_assault',
      title: '破裂酒瓶',
      evidenceType: 'physical',
      sourceSummary: '现场检获',
      summary: '从酒吧后门检获的破裂酒瓶。',
      relatedActorIds: [],
      relatedPlaceIds: [],
      visibility: 'player_known',
      createdAt: time,
      updatedAt: time
    };
    state.cases.case_bar_assault.evidenceIds = ['evidence_1'];

    render(<CaseArchiveModal state={state} onClose={vi.fn()} onStateChange={vi.fn()} />);

    expect(screen.getByText(/实物 · 1988-09-12 22:15/)).toBeInTheDocument();
    expect(screen.queryByText(/physical/)).not.toBeInTheDocument();
  });

  it('treats player-aware cases as related cases without evidence submission actions', () => {
    const state = createState();
    state.cases = {
      case_related: caseFile('case_related', {
        title: '移交反黑案件',
        playerRole: 'aware',
        playerVisibleProgress: '反黑组已接手，玩家只保留知情身份。'
      })
    };

    render(<CaseArchiveModal state={state} onClose={vi.fn()} onStateChange={vi.fn()} />);

    const relatedSection = screen.getByRole('region', { name: '相关案件' });
    expect(within(relatedSection).getByText('移交反黑案件')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '办理中' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '提交证据' })).not.toBeInTheDocument();
    expect(screen.getByText(/反黑组已接手/)).toBeInTheDocument();
  });

  it('shows formal buttons for lead cases', () => {
    const state = createState();
    state.cases.case_bar_assault.playerRole = 'lead';

    render(<CaseArchiveModal state={state} onClose={vi.fn()} onStateChange={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '案件' });
    expect(within(dialog).getByRole('button', { name: '提交证据' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '提交检控意见' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '申请归档' })).toBeInTheDocument();
  });

  it('turns lead formal actions into player action drafts without mutating the case locally', () => {
    const state = createState();
    state.cases.case_bar_assault.playerRole = 'lead';
    const onStateChange = vi.fn();
    const onDraftPlayerAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CaseArchiveModal
        state={state}
        onClose={onClose}
        onStateChange={onStateChange}
        onDraftPlayerAction={onDraftPlayerAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '提交检控意见' }));

    expect(onDraftPlayerAction).toHaveBeenCalledWith('我整理案件材料，向检控部门提交对【酒吧伤人案】的检控意见。');
    expect(onStateChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('turns archive requests into player action drafts for lead cases', () => {
    const state = createState();
    state.cases.case_bar_assault.playerRole = 'lead';
    const onDraftPlayerAction = vi.fn();

    render(
      <CaseArchiveModal
        state={state}
        onClose={vi.fn()}
        onStateChange={vi.fn()}
        onDraftPlayerAction={onDraftPlayerAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '申请归档' }));

    expect(onDraftPlayerAction).toHaveBeenCalledWith('我申请将【酒吧伤人案】归档，并说明理由。');
  });

  it('submits matching asset evidence into the case and removes it from assets', () => {
    const state = createState();
    state.assets.items.statement = evidenceAsset('statement');
    const onStateChange = vi.fn();

    render(<CaseArchiveModal state={state} onClose={vi.fn()} onStateChange={onStateChange} />);

    fireEvent.click(screen.getByRole('button', { name: '提交证据' }));
    fireEvent.click(screen.getByRole('button', { name: /酒吧老板口供/ }));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const next = onStateChange.mock.calls[0][0] as RuntimeState;
    expect(next.assets.items.statement).toBeUndefined();
    expect(Object.values(next.caseEvidence)[0]).toMatchObject({
      title: '酒吧老板口供',
      caseId: 'case_bar_assault'
    });
    expect(next.cases.case_bar_assault.evidenceIds).toHaveLength(1);
  });

  it('shows the lead investigator current action inside the existing case activity section', () => {
    const state = createState();
    state.actors.actor_lau = createActorDefaults({
      actorId: 'actor_lau',
      name: '刘启',
      currentIdentity: 'police',
      publicIdentity: '便衣探员'
    });
    state.cases.case_bar_assault.leadActorId = 'actor_lau';
    state.cases.case_bar_assault.leadActorName = '刘启';
    state.backgroundEvolution.npcTracks.track_lau_case = {
      trackId: 'track_lau_case',
      actorId: 'actor_lau',
      status: 'active',
      actionKind: 'case',
      objective: '核实后门目击时间。',
      currentAction: '在油麻地果栏走访夜班工人，核对目击时间',
      currentStatus: '已问过两人，口供仍有出入',
      currentPlaceId: state.location.currentPlaceId,
      startedAt: { year: 1988, month: 9, day: 12, hour: 9, minute: 0 },
      expectedEndAt: { year: 1988, month: 9, day: 14, hour: 12, minute: 0 },
      nextReviewAt: { year: 1988, month: 9, day: 13, hour: 9, minute: 0 },
      relatedActorIds: [],
      relatedOrganizationIds: [],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: ['case_bar_assault'],
      relatedRelationshipThreadIds: [],
      relatedCityTrackIds: [],
      relatedDeferredEventIds: [],
      visibility: 'player_known'
    };

    render(<CaseArchiveModal state={state} onClose={vi.fn()} onStateChange={vi.fn()} />);

    const currentAction = screen.getByRole('article', { name: '主办人当前行动' });
    expect(currentAction).toHaveTextContent('刘启 · 主办人');
    expect(currentAction).toHaveTextContent('在油麻地果栏走访夜班工人，核对目击时间');
    expect(currentAction).toHaveTextContent('已问过两人，口供仍有出入');
    expect(currentAction).toHaveTextContent('预计剩余约 2 天');
    expect(screen.getAllByText('案件动态')).toHaveLength(1);
  });

  it('marks an overdue investigator action as waiting for review instead of claiming success', () => {
    const state = createState();
    state.cases.case_bar_assault.leadActorId = 'actor_lau';
    state.backgroundEvolution.npcTracks.track_lau_case = {
      trackId: 'track_lau_case',
      actorId: 'actor_lau',
      status: 'blocked',
      actionKind: 'case',
      objective: '寻找目击者。',
      currentAction: '继续核对果栏工人的口供',
      currentStatus: '尚未取得一致证词',
      expectedEndAt: { year: 1988, month: 9, day: 12, hour: 18, minute: 0 },
      nextReviewAt: time,
      relatedActorIds: [],
      relatedOrganizationIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: ['case_bar_assault'],
      relatedRelationshipThreadIds: [],
      relatedCityTrackIds: [],
      relatedDeferredEventIds: [],
      visibility: 'player_known'
    };

    render(<CaseArchiveModal state={state} onClose={vi.fn()} onStateChange={vi.fn()} />);

    expect(screen.getByRole('article', { name: '主办人当前行动' })).toHaveTextContent('等待复核');
    expect(screen.getByRole('article', { name: '主办人当前行动' })).not.toHaveTextContent('已侦破');
  });

  it('hides a stale investigator action while foreground story is handling that NPC', () => {
    const state = createState();
    state.actors.actor_lau = createActorDefaults({
      actorId: 'actor_lau',
      name: '刘启',
      currentIdentity: 'police',
      publicIdentity: '便衣探员'
    });
    state.actors.actor_lau.presence = 'absent';
    state.cases.case_bar_assault.leadActorId = 'actor_lau';
    state.backgroundEvolution.npcTracks.track_lau_case = {
      trackId: 'track_lau_case',
      actorId: 'actor_lau',
      status: 'blocked',
      actionKind: 'case',
      objective: '核对口供',
      currentAction: '这条被打断的承办行动不应显示',
      currentStatus: '前台已经介入',
      nextReviewAt: time,
      relatedActorIds: [],
      relatedOrganizationIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: ['case_bar_assault'],
      relatedRelationshipThreadIds: [],
      relatedCityTrackIds: [],
      relatedDeferredEventIds: [],
      foregroundInterruption: {
        interruptedAt: time,
        foregroundTurnId: 'turn_foreground',
        reason: 'foreground_writeback'
      },
      visibility: 'player_known'
    };

    render(<CaseArchiveModal state={state} onClose={vi.fn()} onStateChange={vi.fn()} />);

    expect(screen.queryByRole('article', { name: '主办人当前行动' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '案件' })).not.toHaveTextContent('这条被打断的承办行动不应显示');
  });
});
