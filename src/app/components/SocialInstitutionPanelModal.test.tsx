import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { Actor } from '../../domain/runtime/types';
import { SocialInstitutionPanelModal } from './SocialInstitutionPanelModal';

function renderPanel(state = createInitialRuntimeState()) {
  return render(<SocialInstitutionPanelModal state={state} onClose={vi.fn()} />);
}

describe('SocialInstitutionPanelModal', () => {
  it('renders known institutions without exposing internal ids', () => {
    const state = createInitialRuntimeState();

    renderPanel(state);

    const dialog = screen.getByRole('dialog', { name: '机构' });
    expect(dialog).not.toHaveTextContent('皇家香港警察');
    expect(dialog).toHaveTextContent('廉政公署');
    expect(dialog).toHaveTextContent('公众认知');
    expect(dialog).not.toHaveTextContent('org_icac');
    expect(dialog).not.toHaveTextContent('org_hk_police');
  });

  it('keeps triad organizations in the separate triad panel instead of the institution panel', () => {
    const state = createInitialRuntimeState();

    renderPanel(state);

    const list = screen.getByLabelText('机构列表');
    const triadOrganizations = Object.values(state.organizations).filter((organization) => organization.type === 'triad');
    expect(triadOrganizations.length).toBeGreaterThan(0);
    triadOrganizations.forEach((organization) => {
      expect(list).not.toHaveTextContent(organization.name);
    });
  });

  it('filters institutions by type', () => {
    const state = createInitialRuntimeState();

    renderPanel(state);

    const dialog = screen.getByRole('dialog', { name: '机构' });
    fireEvent.click(within(screen.getByLabelText('机构分类')).getByRole('button', { name: /媒体/ }));

    expect(within(screen.getByLabelText('机构列表')).getByRole('button', { name: /TVB/ })).toBeInTheDocument();
    expect(screen.getByLabelText('机构详情')).not.toHaveTextContent('廉政公署');
  });

  it('shows related actors through visible organization relations', () => {
    const state = createInitialRuntimeState();
    const actor: Actor = {
      ...state.actors.player,
      actorId: 'actor_reporter',
      name: '方敏',
      englishName: 'Mandy Fong',
      currentIdentity: 'civilian',
      organizationIds: ['org_tvb'],
      organizationRelations: [
        {
          organizationId: 'org_tvb',
          relationType: 'employee',
          roleTitle: '记者',
          departmentOrUnit: '新闻部',
          summary: '负责旺角街头新闻采访。',
          visibility: 'player_known',
          isPrimary: true
        }
      ],
      visibility: 'player_known'
    };
    state.actors[actor.actorId] = actor;

    renderPanel(state);

    const dialog = screen.getByRole('dialog', { name: '机构' });
    fireEvent.click(within(screen.getByLabelText('机构分类')).getByRole('button', { name: /媒体/ }));
    fireEvent.click(within(screen.getByLabelText('机构列表')).getByRole('button', { name: /TVB/ }));

    expect(dialog).toHaveTextContent('方敏 / Mandy Fong');
    expect(dialog).toHaveTextContent('任职 / 记者 / 新闻部');
    expect(dialog).toHaveTextContent('负责旺角街头新闻采访。');
  });

  it('filters hidden institutions and hidden actor relations', () => {
    const state = createInitialRuntimeState();
    state.organizations.org_secret = {
      organizationId: 'org_secret',
      name: '秘密机构',
      type: 'government',
      summary: '不应展示。',
      publicKnowledge: '不应展示。',
      currentState: '不应展示。',
      stanceTowardPlayer: '不应展示。',
      pressureSummary: '不应展示。',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      visibility: 'hidden',
      importance: 100
    };
    state.actors.actor_hidden_contact = {
      ...state.actors.player,
      actorId: 'actor_hidden_contact',
      name: '隐蔽线人',
      organizationIds: [],
      organizationRelations: [
        {
          organizationId: 'org_icac',
          relationType: 'source',
          roleTitle: '秘密消息源',
          summary: '不应展示。',
          visibility: 'hidden'
        }
      ],
      visibility: 'player_known'
    };

    renderPanel(state);

    const dialog = screen.getByRole('dialog', { name: '机构' });
    expect(dialog).not.toHaveTextContent('秘密机构');
    fireEvent.click(within(screen.getByLabelText('机构分类')).getByRole('button', { name: /法律与廉政/ }));
    expect(dialog).toHaveTextContent('廉政公署');
    expect(dialog).not.toHaveTextContent('隐蔽线人');
    expect(dialog).not.toHaveTextContent('秘密消息源');
  });

  it('does not project a hidden former player role as a current institution membership', () => {
    const state = createInitialRuntimeState();
    const player = state.actors[state.player.actorId];
    const mediaOrganization = state.organizations.org_tvb;
    player.organizationRelations.push({
      organizationId: 'org_tvb',
      relationType: 'employee',
      roleTitle: '前制作助理',
      summary: '已经离职的旧工作。',
      visibility: 'hidden'
    });
    mediaOrganization.stanceTowardPlayer = '玩家仍是电视台制作人员。';
    mediaOrganization.relatedActorIds = [state.player.actorId];
    const relatedCaseId = Object.keys(state.cases)[0];
    if (relatedCaseId) mediaOrganization.relatedCaseIds = [relatedCaseId];

    renderPanel(state);
    fireEvent.click(within(screen.getByLabelText('机构分类')).getByRole('button', { name: /媒体/ }));
    fireEvent.click(within(screen.getByLabelText('机构列表')).getByRole('button', { name: /TVB/ }));

    const detail = screen.getByLabelText('机构详情');
    expect(detail).toHaveTextContent('当前身份下没有公开的直接关系。');
    expect(detail).not.toHaveTextContent('玩家仍是电视台制作人员');
    expect(detail).not.toHaveTextContent(state.player.name);
    if (relatedCaseId) expect(detail).not.toHaveTextContent(state.cases[relatedCaseId].title);
  });

  it('derives the current public player role from the visible organization relation', () => {
    const state = createInitialRuntimeState();
    const player = state.actors[state.player.actorId];
    player.organizationRelations.push({
      organizationId: 'org_tvb',
      relationType: 'employee',
      roleTitle: '新闻助理',
      departmentOrUnit: '新闻部',
      summary: '负责采访联络。',
      visibility: 'player_known',
      isPrimary: true
    });
    state.organizations.org_tvb.stanceTowardPlayer = '暂无直接组织关系。';

    renderPanel(state);
    fireEvent.click(within(screen.getByLabelText('机构分类')).getByRole('button', { name: /媒体/ }));
    fireEvent.click(within(screen.getByLabelText('机构列表')).getByRole('button', { name: /TVB/ }));

    expect(screen.getByLabelText('机构详情')).toHaveTextContent(
      '玩家当前以新闻助理 / 新闻部身份与该机构保持直接关系。'
    );
    expect(screen.getByLabelText('机构详情')).not.toHaveTextContent('暂无直接组织关系。');
  });

  it('renders city power anchors when no runtime institution is visible', () => {
    const state = createInitialRuntimeState();
    Object.values(state.organizations).forEach((organization) => {
      organization.visibility = 'hidden';
    });

    renderPanel(state);

    const dialog = screen.getByRole('dialog', { name: '机构' });
    expect(dialog).toHaveTextContent('公开资料');
    expect(dialog).not.toHaveTextContent('时代锚点');
    expect(dialog).toHaveTextContent('汇丰银行');
    expect(dialog).not.toHaveTextContent('TVB');
  });

  it('does not fall back to same-id anchor when runtime institution is hidden', () => {
    const state = createInitialRuntimeState();
    state.organizations.org_tvb.visibility = 'hidden';

    renderPanel(state);

    const dialog = screen.getByRole('dialog', { name: '机构' });
    expect(dialog).not.toHaveTextContent('TVB');
    expect(dialog).not.toHaveTextContent('电视广播城');
  });

  it('shows public city power organization anchors as read-only era records', () => {
    const state = createInitialRuntimeState();

    renderPanel(state);

    const dialog = screen.getByRole('dialog', { name: '机构' });
    expect(dialog).toHaveTextContent('公开资料');
    expect(dialog).not.toHaveTextContent('时代锚点');
    expect(dialog).toHaveTextContent('汇丰银行');
    expect(dialog).toHaveTextContent('长江实业');
    expect(dialog).not.toHaveTextContent('org_hsbc');
  });

  it('separates finance and property anchors into their registered filters', () => {
    const state = createInitialRuntimeState();

    renderPanel(state);

    fireEvent.click(within(screen.getByLabelText('机构分类')).getByRole('button', { name: /商业/ }));

    const list = screen.getByLabelText('机构列表');
    expect(list).toHaveTextContent('汇丰银行');
    expect(list).not.toHaveTextContent('长江实业');
    expect(screen.getByLabelText('机构详情')).not.toHaveTextContent('廉政公署');

    fireEvent.click(within(screen.getByLabelText('机构分类')).getByRole('button', { name: /地产与专业服务/ }));
    expect(list).toHaveTextContent('长江实业');
    expect(list).not.toHaveTextContent('汇丰银行');
  });

  it('keeps transport, utilities, medical and social-service anchors in distinct filters', () => {
    const state = createInitialRuntimeState();

    renderPanel(state);
    fireEvent.click(within(screen.getByLabelText('机构分类')).getByRole('button', { name: /交通与公用事业/ }));

    const list = screen.getByLabelText('机构列表');
    expect(list).toHaveTextContent('地下铁路公司');
    expect(list).toHaveTextContent('九龙巴士');
    expect(list).not.toHaveTextContent('伊利沙伯医院');
    expect(list).not.toHaveTextContent('廉政公署');

    fireEvent.click(within(screen.getByLabelText('机构分类')).getByRole('button', { name: /医疗与社会服务/ }));
    expect(list).toHaveTextContent('伊利沙伯医院');
    expect(list).not.toHaveTextContent('九龙巴士');
  });

  it('marks the shared civilian employer and links back to livelihood', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'hospital_nurse'
    });
    const organizationId =
      state.actors.player.roleProfiles.civilian?.employerOrganizationId;
    const onOpenLivelihood = vi.fn();

    render(
      <SocialInstitutionPanelModal
        state={state}
        initialOrganizationId={organizationId}
        onClose={vi.fn()}
        onOpenLivelihood={onOpenLivelihood}
      />
    );

    const detail = screen.getByLabelText('机构详情');
    expect(detail).toHaveTextContent('当前任职');
    expect(detail).toHaveTextContent('医院护士');
    fireEvent.click(screen.getByRole('button', { name: '查看我的营生' }));
    expect(onOpenLivelihood).toHaveBeenCalledTimes(1);
  });

  it('shows the correct stock-market institution for the opening year', () => {
    const state1984 = createInitialRuntimeState({
      startTime: { year: 1984, month: 12, day: 19, hour: 20, minute: 0 }
    });
    const firstRender = renderPanel(state1984);
    expect(screen.getByRole('dialog', { name: '机构' })).toHaveTextContent('香港证券市场（四会时期）');
    expect(screen.getByRole('dialog', { name: '机构' })).not.toHaveTextContent('香港联合交易所');
    firstRender.unmount();

    const state1986 = createInitialRuntimeState({
      startTime: { year: 1986, month: 4, day: 2, hour: 9, minute: 0 }
    });
    renderPanel(state1986);
    expect(screen.getByRole('dialog', { name: '机构' })).toHaveTextContent('香港联合交易所');
    expect(screen.getByRole('dialog', { name: '机构' })).not.toHaveTextContent('香港证券市场（四会时期）');
  });

  it('keeps triad and identity-gated city power anchors out of the civilian institution panel', () => {
    const state = createInitialRuntimeState();
    state.player.currentIdentity = 'civilian';
    Object.entries(state.organizations).forEach(([organizationId, organization]) => {
      if (organization.type === 'triad') delete state.organizations[organizationId];
    });

    renderPanel(state);

    const dialog = screen.getByRole('dialog', { name: '机构' });
    expect(dialog).not.toHaveTextContent('新义安');
    expect(dialog).not.toHaveTextContent('社团坐馆');
    expect(dialog).not.toHaveTextContent('龙头');
  });

  it('shows an activated institution action and its recent outcome only in the selected institution detail', () => {
    const state = createInitialRuntimeState();
    state.backgroundEvolution.organizationTracks.track_tvb = {
      trackId: 'track_tvb',
      organizationId: 'org_tvb',
      status: 'active',
      objective: '安排街头采访',
      currentAction: '协调采访组与新闻编辑台',
      currentStatus: '正在确认采访档期',
      startedAt: state.time,
      expectedEndAt: { ...state.time, day: state.time.day + 2 },
      nextReviewAt: { ...state.time, day: state.time.day + 1 },
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedCityTrackIds: [],
      visibility: 'player_known'
    };
    state.backgroundEvolution.recentOutcomes.push({
      outcomeId: 'outcome_tvb_prior',
      sourceReviewKey: 'review_tvb_prior',
      occurredAt: state.time,
      sourceKind: 'organization',
      sourceId: 'org_tvb',
      title: '上一轮采访延期',
      summary: '采访对象临时取消档期。',
      relatedActorIds: [],
      relatedOrganizationIds: ['org_tvb'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedRelationshipThreadIds: [],
      visibility: 'player_known',
      significance: 'routine'
    });

    renderPanel(state);
    fireEvent.click(within(screen.getByLabelText('机构分类')).getByRole('button', { name: /媒体/ }));
    fireEvent.click(within(screen.getByLabelText('机构列表')).getByRole('button', { name: /TVB/ }));
    const detail = screen.getByLabelText('机构详情');

    expect(detail).toHaveTextContent('机构动态');
    expect(detail).toHaveTextContent('协调采访组与新闻编辑台');
    expect(detail).toHaveTextContent('上一轮采访延期');
  });
});
