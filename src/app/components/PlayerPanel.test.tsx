import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { PlayerPanel } from './PlayerPanel';

describe('PlayerPanel', () => {
  it('does not show unknown gender as 未指定 under the player name', () => {
    const state = createInitialRuntimeState({
      playerName: '刘博',
      gender: 'unknown',
      age: 25
    });

    render(<PlayerPanel state={state} />);

    expect(screen.queryByText(/未指定/)).not.toBeInTheDocument();
    expect(screen.getByText('25岁')).toBeInTheDocument();
  });

  it('shows player health and stamina as current runtime state', () => {
    const state = createInitialRuntimeState();
    state.player.vitals = {
      health: 82,
      maxHealth: 100,
      stamina: 47,
      maxStamina: 100,
      conditionSummary: '跑过一段路，体力下降。'
    };

    render(<PlayerPanel state={state} />);

    expect(screen.getByText('生命')).toBeInTheDocument();
    expect(screen.getByText('82/100')).toBeInTheDocument();
    expect(screen.getByText('体力')).toBeInTheDocument();
    expect(screen.getByText('47/100')).toBeInTheDocument();
  });

  it('shows compact level progress from the real player experience state', () => {
    const state = createInitialRuntimeState();
    state.player.progression = {
      level: 2,
      experience: 45,
      unspentAttributePoints: 0
    };

    render(<PlayerPanel state={state} />);

    expect(screen.getByText('Lv.2')).toBeInTheDocument();
    expect(screen.getByText('45/200')).toBeInTheDocument();
    const experience = screen.getByRole('progressbar', { name: '等级经验' });
    expect(experience).toHaveAttribute('aria-valuemin', '0');
    expect(experience).toHaveAttribute('aria-valuemax', '200');
    expect(experience).toHaveAttribute('aria-valuenow', '45');
    expect(experience.querySelector('b')).toHaveStyle({ width: '23%' });
  });

  it('keeps dynamic ability bars and exposes free point spending beside the ability title', () => {
    const state = createInitialRuntimeState();
    state.player.attributes.body = 66;
    state.player.progression.unspentAttributePoints = 3;
    const onSpendAttributePoint = vi.fn();

    render(<PlayerPanel state={state} onSpendAttributePoint={onSpendAttributePoint} />);

    expect(screen.getByText('3点自由点数')).toBeInTheDocument();
    const bodyRow = screen.getByText('体魄').closest('.player-attribute-row');
    expect(bodyRow?.querySelector('b')).toHaveStyle({ width: '66%' });

    fireEvent.click(screen.getByRole('button', { name: '提升体魄' }));
    expect(onSpendAttributePoint).toHaveBeenCalledWith('body');
  });

  it('shows canonical finance money instead of legacy economy money', () => {
    const state = createInitialRuntimeState();
    state.player.economy.bankBalance = 100;
    state.finance.cashOnHand = 350;
    state.finance.bankBalance = 2350;

    render(<PlayerPanel state={state} />);

    expect(screen.getByText('现金')).toBeInTheDocument();
    expect(screen.getByText('存款')).toBeInTheDocument();
    expect(screen.getByText('HK$350')).toBeInTheDocument();
    expect(screen.getByText('HK$2,350')).toBeInTheDocument();
    expect(screen.queryByText('HK$100')).not.toBeInTheDocument();
  });

  it('renders police identity as a bilingual police card separate from other personal details', () => {
    const state = createInitialRuntimeState({
      playerName: '王博',
      englishName: 'Gordon Wong',
      gender: 'male',
      age: 25,
      policeNumber: '8426',
      lawIdentity: {
        rank: 'Senior Constable（高级警员 SPC）',
        stationOrPost: 'Mong Kok Police Station（旺角警署）',
        assignmentSummary: 'Report Room Officer（报案室值日）'
      }
    });
    state.finance.cashOnHand = 350;
    state.finance.bankBalance = 2350;
    state.player.economy.bankBalance = 100;
    state.player.homeBase = {
      housingType: '屋邨',
      placeName: '石硖尾邨第21座',
      summary: '固定住所。',
      householdSummary: '家人同住。'
    };
    state.player.clothing = '香港警队夏季军装制服。';
    state.player.equipment = ['Smith & Wesson M10 左轮手枪', 'Motorola 通讯对讲机', '木制警棍与手铐'];

    render(<PlayerPanel state={state} />);

    const card = screen.getByRole('region', { name: '皇家香港警察个人信息卡' });
    expect(card).toHaveTextContent('皇家香港警察');
    expect(card).toHaveTextContent('ROYAL HONG KONG POLICE');
    expect(card).toHaveTextContent('王博');
    expect(card).toHaveTextContent('Gordon Wong');
    expect(screen.getByRole('img', { name: '皇家香港警察警章' })).toBeInTheDocument();
    expect(card).toHaveTextContent('性别 / Sex');
    expect(card).toHaveTextContent('男');
    expect(card).toHaveTextContent('年龄 / Age');
    expect(card).toHaveTextContent('25岁');
    expect(card).toHaveTextContent('警员编号');
    expect(card).toHaveTextContent('Badge No.');
    expect(card).toHaveTextContent('8426');
    expect(card).toHaveTextContent('职级 / Rank');
    expect(card).toHaveTextContent('高级警员 / Senior Police Constable');
    expect(card).not.toHaveTextContent('警司 / Superintendent');
    const rankInsignia = screen.getByRole('img', { name: '高级警员职级标志' });
    const badgeNumberRow = card.querySelector('.police-id-number-row');
    const rankField = screen.getByText('职级 / Rank').closest('div');
    expect(rankInsignia).toBeInTheDocument();
    expect(badgeNumberRow).toContainElement(rankInsignia);
    expect(badgeNumberRow).toHaveTextContent('8426');
    expect(rankField).not.toContainElement(rankInsignia);
    const rankSlide = rankInsignia.querySelector('svg');
    expect(rankSlide).toHaveAttribute('viewBox', '0 0 156 50');
    expect(rankSlide).toHaveAttribute('data-orientation', 'horizontal');
    expect(rankSlide).toHaveAttribute('data-direction', 'right');
    expect(rankSlide).toHaveAttribute('data-badge-number-end', 'left');
    const shoulderChevron = rankInsignia.querySelector('.rank-shoulder-chevron');
    expect(shoulderChevron).toBeInTheDocument();
    expect(shoulderChevron?.parentElement?.tagName.toLowerCase()).toBe('svg');
    expect(shoulderChevron).toHaveAttribute('data-direction', 'left');
    expect(shoulderChevron).toHaveAttribute('data-points-to', 'badge-number');
    expect(shoulderChevron).toHaveAttribute('d', 'M83 11L62 25L83 39');
    expect(card).toHaveTextContent('所属单位 / Station / Unit');
    expect(card).toHaveTextContent('旺角警署 · 报案室值日');
    expect(card).not.toHaveTextContent('香港警队基层警员');
    expect(card).not.toHaveTextContent('HK$2,350');

    const otherInfo = screen.getByRole('region', { name: '玩家其他信息' });
    expect(otherInfo).toHaveTextContent('HK$350');
    expect(otherInfo).toHaveTextContent('HK$2,350');
    expect(otherInfo).toHaveTextContent('石硖尾邨第21座');
    expect(otherInfo).toHaveTextContent('香港警队夏季军装制服。');
    expect(otherInfo).toHaveTextContent('Smith & Wesson M10 左轮手枪');
    expect(otherInfo).toHaveTextContent('Motorola 通讯对讲机');
    expect(otherInfo).toHaveTextContent('木制警棍与手铐');
  });

  it('keeps the RHKP slide facing right while junior-rank chevrons point toward the UI number', () => {
    const sergeantState = createInitialRuntimeState({
      policeNumber: '2718',
      lawIdentity: {
        rank: 'Sergeant（警长 SGT）',
        stationOrPost: 'Mong Kok Police Station（旺角警署）',
        assignmentSummary: 'Response Officer（快速应对警员）'
      }
    });
    const { rerender } = render(<PlayerPanel state={sergeantState} />);

    const sergeantInsignia = screen.getByRole('img', { name: '警长职级标志' });
    const sergeantSlide = sergeantInsignia.querySelector('svg');
    const sergeantChevrons = sergeantInsignia.querySelectorAll('.rank-shoulder-chevron');
    expect(sergeantSlide).toHaveAttribute('data-orientation', 'horizontal');
    expect(sergeantSlide).toHaveAttribute('data-direction', 'right');
    expect(sergeantSlide).toHaveAttribute('data-badge-number-end', 'left');
    expect(sergeantSlide?.querySelector('.rank-shoulder-board')).toHaveAttribute(
      'd',
      'M2 2h121c18 0 31 10 31 23s-13 23-31 23H2z'
    );
    expect(sergeantChevrons).toHaveLength(3);
    Array.from(sergeantChevrons).forEach((chevron) => {
      expect(chevron).toHaveAttribute('data-direction', 'left');
      expect(chevron).toHaveAttribute('data-points-to', 'badge-number');
    });
    expect(sergeantChevrons[0]).toHaveAttribute('d', 'M65 12L53 25L65 38');
    expect(sergeantChevrons[1]).toHaveAttribute('d', 'M79 12L67 25L79 38');
    expect(sergeantChevrons[2]).toHaveAttribute('d', 'M93 12L81 25L93 38');
    expect(sergeantSlide?.querySelector('.rank-board-label')).toHaveTextContent('2718');

    const inspectorState = createInitialRuntimeState({
      policeNumber: '3141',
      lawIdentity: {
        rank: 'Inspector（督察）',
        stationOrPost: 'Mong Kok Police Station（旺角警署）',
        assignmentSummary: 'Investigation Team Member（调查小组成员）'
      }
    });
    rerender(<PlayerPanel state={inspectorState} />);

    const inspectorInsignia = screen.getByRole('img', { name: '督察职级标志' });
    const inspectorSlide = inspectorInsignia.querySelector('svg');
    expect(inspectorSlide).toHaveAttribute('data-direction', 'right');
    expect(inspectorInsignia.querySelectorAll('.rank-bath-star')).toHaveLength(2);
    expect(inspectorInsignia.querySelectorAll('.rank-shoulder-chevron')).toHaveLength(0);
    expect(inspectorSlide?.querySelector('.rank-board-label')).toHaveTextContent('RHKP');
  });

  it('does not render unresolved internal asset ids as equipment labels', () => {
    const state = createInitialRuntimeState();
    state.player.equipment = ['asset_equipment_9999', '警棍'];
    state.assets.equippedItemIds = [];

    render(<PlayerPanel state={state} />);

    expect(screen.queryByText('asset_equipment_9999')).not.toBeInTheDocument();
    expect(screen.getAllByText('空槽')).toHaveLength(2);
    expect(screen.getByText('警棍')).toBeInTheDocument();
  });

  it('switches away from the police card when the current player identity is not police', () => {
    const state = createInitialRuntimeState({
      playerName: '王博',
      englishName: 'Gordon Wong',
      gender: 'male',
      age: 25,
      policeNumber: '8426',
      lawIdentity: {
        rank: 'Senior Constable（高级警员 SPC）',
        stationOrPost: 'Mong Kok Police Station（旺角警署）',
        assignmentSummary: 'Report Room Officer（报案室值日）'
      }
    });
    state.player.currentIdentity = 'gang_member';
    state.actors.player.currentIdentity = 'gang_member';
    state.actors.player.publicIdentity = '夜场跑腿';
    state.actors.player.roleProfiles.triad = {
      status: 'cover',
      organizationId: 'org_sun_yee_on',
      societyName: '新义安',
      roleTitle: '夜场跑腿',
      rankSummary: '外围新人',
      territorySummary: '旺角砵兰街',
      patronActorIds: [],
      peerActorIds: [],
      rivalActorIds: [],
      obligationSummary: '替上线传话。',
      riskSummary: '身份仍在被观察。'
    };

    render(<PlayerPanel state={state} />);

    expect(screen.queryByRole('region', { name: '皇家香港警察个人信息卡' })).not.toBeInTheDocument();
    expect(screen.queryByText('ROYAL HONG KONG POLICE')).not.toBeInTheDocument();
    const card = screen.getByRole('region', { name: '社团公开身份卡' });
    const photo = screen.getByRole('img', { name: '玩家照片预留位' });
    expect(card.querySelector('.identity-route-person')).toContainElement(photo);
    expect(photo.nextElementSibling).toHaveTextContent(state.player.name);
    expect(card).toHaveTextContent('新义安');
    expect(card).toHaveTextContent('夜场跑腿');
    expect(card).toHaveTextContent('外围新人');
    expect(card).toHaveTextContent('旺角砵兰街');
  });

  it('renders a civilian livelihood card from only the current civilian profile', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'market_transport_helper',
      playerName: '刘启',
      englishName: 'Kai Lau'
    });

    render(<PlayerPanel state={state} />);

    const card = screen.getByRole('region', { name: '市民公开身份卡' });
    const photo = screen.getByRole('img', { name: '玩家照片预留位' });
    expect(card.querySelector('.identity-route-person')).toContainElement(photo);
    expect(photo.nextElementSibling).toHaveTextContent('刘启');
    expect(card).toHaveTextContent('社区生活档案');
    expect(card).toHaveTextContent('刘启');
    expect(card).toHaveTextContent('油麻地果栏运输帮工');
    expect(card).toHaveTextContent('油麻地果栏');
    expect(card).toHaveTextContent('夜班工人');
    expect(screen.queryByRole('region', { name: '皇家香港警察个人信息卡' })).not.toBeInTheDocument();
  });

  it('shows the triad shell for a police undercover identity without leaking police truth', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      playerName: '陈启明',
      policeNumber: '9527'
    });
    state.player.currentIdentity = 'gang_member';
    state.player.originIdentity = 'police';
    state.actors.player.currentIdentity = 'gang_member';
    state.actors.player.publicIdentity = '和胜和庙街外围跑腿';
    state.actors.player.actualIdentitySummary = '警队派入和胜和的卧底警员';
    if (state.actors.player.roleProfiles.police) state.actors.player.roleProfiles.police.status = 'hidden';
    state.actors.player.roleProfiles.triad = {
      status: 'cover',
      organizationId: 'org_wo_shing_wo',
      societyName: '和胜和',
      roleTitle: '庙街外围跑腿',
      rankSummary: '外围新人',
      territorySummary: '庙街与油麻地一带',
      patronActorIds: [],
      peerActorIds: [],
      rivalActorIds: [],
      obligationSummary: '替上线传话。',
      riskSummary: '需要维持掩护。'
    };
    state.secretFacts.secret_player_undercover = {
      secretId: 'secret_player_undercover',
      ownerType: 'player',
      ownerId: 'player',
      kind: 'identity',
      summary: '玩家实际为警队卧底。',
      playerCharacterKnown: true,
      publicKnown: false,
      knownByActorIds: ['player'],
      revealState: 'known_to_player_character',
      revealConditions: ['身份暴露。'],
      visibility: 'player_known',
      importance: 100,
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };

    render(<PlayerPanel state={state} />);

    expect(screen.getByRole('region', { name: '社团公开身份卡' })).toHaveTextContent('和胜和');
    expect(screen.queryByRole('region', { name: '皇家香港警察个人信息卡' })).not.toBeInTheDocument();
    expect(screen.queryByText('9527')).not.toBeInTheDocument();
    expect(screen.queryByText('警队派入和胜和的卧底警员')).not.toBeInTheDocument();
    expect(screen.queryByText('玩家实际为警队卧底。')).not.toBeInTheDocument();
  });

  it('shows the police shell for a triad operative embedded in the police without leaking triad truth', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'gang_member',
      triadProfileId: 'wo_shing_wo_temple_street_runner',
      playerName: '陈启明'
    });
    state.player.currentIdentity = 'police';
    state.player.originIdentity = 'gang_member';
    state.player.policeNumber = '7742';
    state.actors.player.currentIdentity = 'police';
    state.actors.player.policeNumber = '7742';
    state.actors.player.publicIdentity = '旺角警署军装巡逻警员';
    state.actors.player.actualIdentitySummary = '受和胜和指派进入警队的社团成员';
    if (state.actors.player.roleProfiles.triad) state.actors.player.roleProfiles.triad.status = 'hidden';
    state.actors.player.roleProfiles.police = {
      status: 'cover',
      agencyId: 'org_hk_police',
      stationOrPost: '旺角警署',
      department: '军装巡逻',
      rank: '警员',
      assignmentSummary: '街面巡逻',
      supervisorActorIds: [],
      peerActorIds: [],
      authoritySummary: '基层警务权限。',
      accessSummary: '当值资料。',
      dutySummary: '按更巡逻。',
      institutionalReputation: '新人。',
      disciplinePressureSummary: '受纪律约束。'
    };
    state.lawIdentity = {
      ...state.lawIdentity,
      status: 'active',
      agencyId: 'org_hk_police',
      stationOrPost: '旺角警署',
      department: '军装巡逻',
      rank: '警员',
      assignmentSummary: '街面巡逻'
    };
    state.secretFacts.secret_player_triad_loyalty = {
      secretId: 'secret_player_triad_loyalty',
      ownerType: 'player',
      ownerId: 'player',
      kind: 'loyalty',
      summary: '玩家真实效忠和胜和上线。',
      playerCharacterKnown: true,
      publicKnown: false,
      knownByActorIds: ['player'],
      revealState: 'known_to_player_character',
      revealConditions: ['身份暴露。'],
      visibility: 'player_known',
      importance: 100,
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };

    render(<PlayerPanel state={state} />);

    const card = screen.getByRole('region', { name: '皇家香港警察个人信息卡' });
    expect(card).toHaveTextContent('7742');
    expect(card).toHaveTextContent('旺角警署 · 街面巡逻');
    expect(screen.queryByRole('region', { name: '社团公开身份卡' })).not.toBeInTheDocument();
    expect(screen.queryByText('和胜和')).not.toBeInTheDocument();
    expect(screen.queryByText('受和胜和指派进入警队的社团成员')).not.toBeInTheDocument();
    expect(screen.queryByText('玩家真实效忠和胜和上线。')).not.toBeInTheDocument();
  });
});
