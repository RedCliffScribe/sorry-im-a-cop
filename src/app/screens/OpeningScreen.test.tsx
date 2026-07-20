import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpeningScreen } from './OpeningScreen';
import {
  OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY,
  OPENING_LEGAL_DISCLAIMER_VERSION
} from '../legal/openingLegalDisclaimer';

function renderOpeningScreen() {
  render(<OpeningScreen onStartGame={vi.fn()} onBack={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /04 能力与特质/ }));
}

function renderOpeningScreenForSubmission() {
  const onStartGame = vi.fn();
  window.localStorage.setItem(
    OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY,
    JSON.stringify({ version: OPENING_LEGAL_DISCLAIMER_VERSION, acceptedAt: '2026-07-19T00:00:00.000Z' })
  );
  render(<OpeningScreen onStartGame={onStartGame} onBack={vi.fn()} />);
  return onStartGame;
}

describe('OpeningScreen ability and trait setup', () => {
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('starts balanced attributes with 60 free points', () => {
    renderOpeningScreen();

    expect(screen.getByText('剩余自由点：60')).toBeInTheDocument();
  });

  it('keeps opening traits useful instead of pure burden hooks', () => {
    renderOpeningScreen();

    expect(screen.queryByRole('checkbox', { name: '家累' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '手头紧' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '茶餐厅耳' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '街坊底' })).toBeInTheDocument();
  });

  it('repeats attribute changes while holding a stepper button', () => {
    vi.useFakeTimers();
    renderOpeningScreen();

    const bodyInput = screen.getByRole('spinbutton', { name: '体魄' }) as HTMLInputElement;
    const increaseBody = screen.getByRole('button', { name: '增加体魄' });

    fireEvent.mouseDown(increaseBody);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    fireEvent.mouseUp(increaseBody);

    expect(Number(bodyInput.value)).toBeGreaterThan(51);
  });

  it('requires explicit versioned legal acceptance before starting a new opening', () => {
    const onStartGame = vi.fn();
    render(<OpeningScreen onStartGame={onStartGame} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /05 确认生成/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));

    const dialog = screen.getByRole('dialog', { name: '《对唔住，我系差人》' });
    expect(onStartGame).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Sorry, I'm a Cop")).toBeInTheDocument();
    expect(within(dialog).getByText(/《对唔住，我系差人》（英文名：Sorry, I'm a Cop/)).toBeInTheDocument();
    expect(within(dialog).getByText('十二、确认与接受')).toBeInTheDocument();
    expect(within(dialog).getByText('项目纠错与权利通知渠道：电子邮箱')).toBeInTheDocument();
    expect(within(dialog).getByText('kale014@gmail.com')).toBeInTheDocument();
    expect(within(dialog).queryByText(/待配置/)).not.toBeInTheDocument();

    const acceptButton = within(dialog).getByRole('button', { name: '同意并生成开局' });
    expect(acceptButton).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: '我已阅读、理解并同意上述法律声明、人工智能动态内容说明及使用条款。'
      })
    );
    expect(acceptButton).toBeEnabled();
    fireEvent.click(acceptButton);

    expect(onStartGame).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: OPENING_LEGAL_DISCLAIMER_VERSION,
      acceptedAt: expect.any(String)
    });
  });

  it('returns to the confirmation page without starting when the notice is declined', () => {
    const onStartGame = vi.fn();
    render(<OpeningScreen onStartGame={onStartGame} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /05 确认生成/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));
    fireEvent.click(screen.getByRole('button', { name: '不同意并返回' }));

    expect(screen.queryByRole('dialog', { name: '《对唔住，我系差人》' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '确认生成' })).toBeInTheDocument();
    expect(onStartGame).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY)).toBeNull();
  });

  it('submits a civilian livelihood without police-only fields', () => {
    const onStartGame = renderOpeningScreenForSubmission();

    fireEvent.click(screen.getByRole('button', { name: /02 身份选择/ }));
    fireEvent.click(screen.getByRole('button', { name: '普通市民' }));
    fireEvent.click(screen.getByRole('button', { name: /03 基础档案/ }));

    expect(screen.queryByRole('textbox', { name: '警员编号' })).not.toBeInTheDocument();
    expect(screen.getByText('市民生活档案')).toBeInTheDocument();
    expect(screen.getByText('粤语风味')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '果栏运输帮工' }));
    fireEvent.click(screen.getByRole('button', { name: '全粤语' }));
    fireEvent.click(screen.getByRole('button', { name: /05 确认生成/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));

    expect(onStartGame).toHaveBeenCalledWith(
      expect.objectContaining({
        currentIdentity: 'civilian',
        civilianProfileId: 'market_transport_helper',
        triadProfileId: undefined,
        policePostingId: undefined,
        policeNumber: undefined,
        lawIdentity: undefined,
        cantoneseFlavor: 'full',
        appearance: '穿着符合当前生活与收入状况的日常衣服，神情带着普通生活的疲惫和警觉。'
      })
    );
  });

  it('supports unemployed and validated custom civilian occupations', () => {
    const onStartGame = renderOpeningScreenForSubmission();

    fireEvent.click(screen.getByRole('button', { name: /02 身份选择/ }));
    fireEvent.click(screen.getByRole('button', { name: '普通市民' }));
    fireEvent.click(screen.getByRole('button', { name: /03 基础档案/ }));

    expect(screen.getByRole('button', { name: '无业' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '自定义职业' }));
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: '自定义职业' }), { target: { value: '自由摄影师' } });
    fireEvent.change(screen.getByRole('combobox', { name: '自定义职业地点' }), {
      target: { value: 'place_broadcast_drive' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: '自定义职业接触面' }), {
      target: { value: '常接触记者、冲印店和夜场宣传人员。' }
    });
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /05 确认生成/ }));
    expect(screen.getByText(/自由摄影师 \/ 广播道/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));

    expect(onStartGame).toHaveBeenCalledWith(
      expect.objectContaining({
        currentIdentity: 'civilian',
        civilianProfileId: 'custom_occupation',
        civilianCustomProfile: {
          publicOccupation: '自由摄影师',
          workplacePlaceId: 'place_broadcast_drive',
          workplaceLabel: '广播道',
          communitySummary: '常接触记者、冲印店和夜场宣传人员。'
        }
      })
    );
  });

  it('submits a bounded middle-rank triad opening as the public game shell', () => {
    const onStartGame = renderOpeningScreenForSubmission();

    fireEvent.click(screen.getByRole('button', { name: /02 身份选择/ }));
    fireEvent.click(screen.getByRole('button', { name: '社团分子' }));
    fireEvent.click(screen.getByRole('button', { name: /03 基础档案/ }));

    expect(screen.queryByRole('textbox', { name: '警员编号' })).not.toBeInTheDocument();
    expect(screen.getByText('社团身份档案')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /话事人|坐馆|叔伯/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '社团字头' }), {
      target: { value: 'org_14k' }
    });
    const territorySelect = screen.getByRole('combobox', { name: '社团活动区域' });
    expect(within(territorySelect).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '重庆大厦',
      '启德机场',
      '港澳码头'
    ]);
    fireEvent.change(territorySelect, {
      target: { value: 'place_macau_ferry_terminal' }
    });
    fireEvent.change(screen.getByRole('combobox', { name: '社团层级' }), {
      target: { value: 'district_cadre' }
    });
    fireEvent.change(screen.getByRole('combobox', { name: '社团职务' }), {
      target: { value: 'district_affairs_coordinator' }
    });
    fireEvent.click(screen.getByRole('button', { name: /05 确认生成/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));

    expect(onStartGame).toHaveBeenCalledWith(
      expect.objectContaining({
        currentIdentity: 'gang_member',
        triadSocietyId: 'org_14k',
        triadTerritoryPlaceId: 'place_macau_ferry_terminal',
        triadRankId: 'district_cadre',
        triadRoleId: 'district_affairs_coordinator',
        triadProfileId: undefined,
        civilianProfileId: undefined,
        policePostingId: undefined,
        policeNumber: undefined,
        lawIdentity: undefined,
        appearance: '穿着不起眼的街头便服，神情谨慎，不敢把字头名号挂在脸上。'
      })
    );
  });
});
