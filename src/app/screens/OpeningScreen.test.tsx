import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpeningScreen } from './OpeningScreen';
import {
  OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY,
  OPENING_LEGAL_DISCLAIMER_VERSION
} from '../legal/openingLegalDisclaimer';
import {
  loadOpeningCharacterTemplates
} from '../../domain/opening/openingCharacterTemplateStore';

const newGameLibraryMock = vi.hoisted(() => ({
  current: {
    characters: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
    projects: [] as Array<Record<string, unknown>>
  }
}));

vi.mock('../../domain/customContent/newGameSelection', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../domain/customContent/newGameSelection')
    >();
  return {
    ...original,
    loadNewGameCustomContentLibrary: vi.fn(async () => newGameLibraryMock.current)
  };
});

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
  beforeEach(() => {
    newGameLibraryMock.current = {
      characters: [],
      events: [],
      projects: []
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('starts balanced attributes with 60 free points', () => {
    renderOpeningScreen();

    expect(screen.getByText('剩余自由点：60')).toBeInTheDocument();
  });

  it('selects one of five per-save difficulty levels on the final page', () => {
    const onStartGame = renderOpeningScreenForSubmission();
    fireEvent.click(screen.getByRole('button', { name: /07 确认生成/ }));

    const difficultyGroup = screen.getByRole('radiogroup', { name: '游戏难度' });
    expect(within(difficultyGroup).getAllByRole('radio')).toHaveLength(5);
    expect(within(difficultyGroup).getByRole('radio', { name: /标准/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(within(difficultyGroup).getByRole('radio', { name: /困难/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));

    expect(onStartGame).toHaveBeenCalledWith(
      expect.objectContaining({ gameDifficulty: 'hard' })
    );
  });

  it('keeps opening traits useful instead of pure burden hooks', () => {
    renderOpeningScreen();

    expect(screen.queryByRole('checkbox', { name: '家累' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '手头紧' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '茶餐厅耳' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '街坊底' })).toBeInTheDocument();
  });

  it('allows a real digit-by-digit age edit before committing the value', async () => {
    const user = userEvent.setup();
    render(<OpeningScreen onStartGame={vi.fn()} onBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /03 基础档案/ }));
    const ageInput = screen.getByRole('spinbutton', { name: '年龄' });

    expect(ageInput).toHaveValue(25);
    await user.clear(ageInput);
    expect(ageInput).toHaveValue(null);
    await user.type(ageInput, '3');
    expect(ageInput).toHaveValue(3);
    await user.type(ageInput, '0');
    expect(ageInput).toHaveValue(30);

    await user.click(screen.getByRole('button', { name: /04 能力与特质/ }));
    await user.click(screen.getByRole('button', { name: /03 基础档案/ }));
    expect(screen.getByRole('spinbutton', { name: '年龄' })).toHaveValue(30);
  });

  it.each([
    ['15', 16],
    ['91', 90],
    ['', 25],
    ['16', 16],
    ['42', 42],
    ['89', 89],
    ['90', 90]
  ])('normalizes age draft %s to %i on blur', async (draft, expected) => {
    const user = userEvent.setup();
    render(<OpeningScreen onStartGame={vi.fn()} onBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /03 基础档案/ }));
    const ageInput = screen.getByRole('spinbutton', { name: '年龄' });

    await user.clear(ageInput);
    if (draft) await user.type(ageInput, draft);
    await user.tab();

    expect(ageInput).toHaveValue(expected);
  });

  it('submits the resolved age and matching birth year after digit-by-digit input', async () => {
    const user = userEvent.setup();
    const onStartGame = renderOpeningScreenForSubmission();
    await user.click(screen.getByRole('button', { name: /03 基础档案/ }));
    const ageInput = screen.getByRole('spinbutton', { name: '年龄' });
    await user.clear(ageInput);
    await user.type(ageInput, '31');
    await user.click(screen.getByRole('button', { name: /07 确认生成/ }));

    expect(screen.getByText('31 岁')).toBeInTheDocument();
    expect(screen.getByText('1957-04-18')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '生成开局' }));

    expect(onStartGame).toHaveBeenCalledWith(
      expect.objectContaining({
        age: 31,
        birthDate: '1957-04-18'
      })
    );
  });

  it('keeps age while scenario changes and derives the new scenario birth year', async () => {
    const user = userEvent.setup();
    render(<OpeningScreen onStartGame={vi.fn()} onBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /03 基础档案/ }));
    const ageInput = screen.getByRole('spinbutton', { name: '年龄' });
    await user.clear(ageInput);
    await user.type(ageInput, '31');

    await user.click(screen.getByRole('button', { name: /01 世界与剧本/ }));
    await user.click(
      screen.getByRole('button', { name: '1980 港城高压增长' })
    );
    await user.click(screen.getByRole('button', { name: /03 基础档案/ }));
    expect(screen.getByRole('spinbutton', { name: '年龄' })).toHaveValue(31);
    expect(screen.getByText(/1949-04-18/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /01 世界与剧本/ }));
    await user.click(
      screen.getByRole('button', { name: '1996 移交前夜' })
    );
    await user.click(screen.getByRole('button', { name: /03 基础档案/ }));
    expect(screen.getByRole('spinbutton', { name: '年龄' })).toHaveValue(31);
    expect(screen.getByText(/1965-04-18/)).toBeInTheDocument();
  });

  it('saves a reusable character template and restores it after reopening the guide', async () => {
    const user = userEvent.setup();
    const firstRender = render(
      <OpeningScreen onStartGame={vi.fn()} onBack={vi.fn()} />
    );
    await act(async () => {});
    fireEvent.click(
      screen.getByRole('button', { name: /03 基础档案/ })
    );
    fireEvent.change(screen.getByRole('textbox', { name: '玩家姓名' }), {
      target: { value: '林若晴' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: '英文名' }), {
      target: { value: 'Rachel Lam' }
    });
    fireEvent.change(screen.getByRole('combobox', { name: '性别' }), {
      target: { value: 'female' }
    });
    const ageInput = screen.getByRole('spinbutton', { name: '年龄' });
    await user.clear(ageInput);
    await user.type(ageInput, '31');
    fireEvent.change(screen.getByRole('textbox', { name: '样貌' }), {
      target: { value: '短发，衣着利落。' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: '性格' }), {
      target: { value: '冷静谨慎，重视程序。' }
    });
    fireEvent.change(
      screen.getByRole('textbox', { name: '警员编号' }),
      { target: { value: '7314' } }
    );
    fireEvent.change(screen.getByRole('combobox', { name: '警阶' }), {
      target: { value: 'sergeant' }
    });
    fireEvent.change(screen.getByRole('combobox', { name: '部门' }), {
      target: { value: 'cid' }
    });
    fireEvent.click(
      screen.getByRole('button', { name: /04 能力与特质/ })
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: '观察' }), {
      target: { value: '61' }
    });
    fireEvent.click(screen.getByRole('checkbox', { name: '文书细' }));

    fireEvent.click(screen.getByRole('button', { name: '保存人物' }));
    const saveDialog = screen.getByRole('dialog', {
      name: '保存开局人物'
    });
    fireEvent.change(
      within(saveDialog).getByRole('textbox', {
        name: '人物模板名称'
      }),
      { target: { value: '港岛女警' } }
    );
    fireEvent.click(
      within(saveDialog).getByRole('button', {
        name: '另存为新模板'
      })
    );

    expect(loadOpeningCharacterTemplates()).toEqual([
      expect.objectContaining({
        label: '港岛女警',
        profile: expect.objectContaining({
          playerName: '林若晴',
          englishName: 'Rachel Lam',
          gender: 'female',
          age: 31,
          policeNumber: '7314',
          currentIdentity: 'police',
          police: expect.objectContaining({
            rankId: 'sergeant',
            departmentId: 'cid'
          }),
          attributes: expect.objectContaining({ perception: 61 }),
          traitIds: ['trait_paperwork_clean']
        })
      })
    ]);

    firstRender.unmount();
    render(<OpeningScreen onStartGame={vi.fn()} onBack={vi.fn()} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '读取人物' }));
    const loadDialog = screen.getByRole('dialog', {
      name: '读取开局人物'
    });
    fireEvent.click(
      within(loadDialog).getByRole('button', {
        name: '读取人物模板 港岛女警'
      })
    );

    expect(
      screen.getByRole('heading', { name: '基础档案' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: '玩家姓名' })
    ).toHaveValue('林若晴');
    expect(screen.getByRole('textbox', { name: '英文名' })).toHaveValue(
      'Rachel Lam'
    );
    expect(screen.getByRole('combobox', { name: '性别' })).toHaveValue(
      'female'
    );
    expect(screen.getByRole('spinbutton', { name: '年龄' })).toHaveValue(
      31
    );
    expect(
      screen.getByRole('textbox', { name: '警员编号' })
    ).toHaveValue('7314');
    expect(screen.getByRole('combobox', { name: '警阶' })).toHaveValue(
      'sergeant'
    );
    expect(screen.getByRole('combobox', { name: '部门' })).toHaveValue(
      'cid'
    );
    expect(
      screen.getByText(/世界、剧本与戏剧化开局未改变/)
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /04 能力与特质/ })
    );
    expect(screen.getByRole('spinbutton', { name: '观察' })).toHaveValue(
      61
    );
    expect(
      screen.getByRole('checkbox', { name: '文书细' })
    ).toBeChecked();
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

    fireEvent.click(screen.getByRole('button', { name: /07 确认生成/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));

    const dialog = screen.getByRole('dialog', { name: '《对唔住，我系差人》' });
    expect(onStartGame).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Sorry, I'm a Cop")).toBeInTheDocument();
    expect(within(dialog).getByText(/《对唔住，我系差人》（英文名：Sorry, I'm a Cop/)).toBeInTheDocument();
    expect(within(dialog).getByText('三、第三方影视作品与虚构角色')).toBeInTheDocument();
    expect(within(dialog).getByText(/合理使用须结合具体使用方式及法定因素逐案判断/)).toBeInTheDocument();
    expect(within(dialog).getByText('十三、确认与接受')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /07 确认生成/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));
    fireEvent.click(screen.getByRole('button', { name: '不同意并返回' }));

    expect(screen.queryByRole('dialog', { name: '《对唔住，我系差人》' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '确认生成' })).toBeInTheDocument();
    expect(onStartGame).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY)).toBeNull();
  });

  it('submits only explicitly selected custom content and at most one first-act support source', async () => {
    newGameLibraryMock.current = {
      characters: [
        {
          selection: {
            selectionKey: 'character:reporter:1',
            kind: 'character',
            assetId: 'reporter',
            revision: 1
          },
          title: '独立记者',
          summary: '追查夜班证物异常。',
          deploymentMode: 'native',
          defaultEnabledForNewGame: true
        }
      ],
      events: [],
      projects: []
    };
    const onStartGame = renderOpeningScreenForSubmission();

    fireEvent.click(screen.getByRole('button', { name: /05 戏剧化开局/ }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: '启用戏剧化开局' })
    );
    expect(
      screen.queryByRole('region', { name: '本局自定义内容' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /06 自定义内容/ }));
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: '本局选择独立记者' })
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole('checkbox', { name: '本局选择独立记者' })
    ).not.toBeChecked();
    fireEvent.click(
      screen.getByRole('checkbox', { name: '本局选择独立记者' })
    );
    fireEvent.click(
      screen.getByRole('radio', {
        name: '将独立记者用于第一幕支持'
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /07 确认生成/ }));

    expect(
      screen.getAllByText('独立记者', { selector: 'dd' })
    ).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));

    expect(onStartGame).toHaveBeenCalledWith(
      expect.objectContaining({
        customContentSelections: [
          expect.objectContaining({
            selectionKey: 'character:reporter:1',
            kind: 'character',
            assetId: 'reporter',
            revision: 1,
            prioritized: true
          })
        ],
        openingCustomSupportSelectionKey: 'character:reporter:1',
        dramaticOpeningId: expect.any(String)
      })
    );
  });

  it('enables more than three native items without sending them all into opening priority', async () => {
    newGameLibraryMock.current = {
      characters: Array.from({ length: 5 }, (_, index) => {
        const number = index + 1;
        return {
          selection: {
            selectionKey: `character:reporter-${number}:1`,
            kind: 'character',
            assetId: `reporter-${number}`,
            revision: 1
          },
          title: `记者${number}`,
          summary: `第${number}名原生人物。`,
          deploymentMode: 'native',
          defaultEnabledForNewGame: true
        };
      }),
      events: [],
      projects: []
    };
    const onStartGame = renderOpeningScreenForSubmission();

    fireEvent.click(screen.getByRole('button', { name: /06 自定义内容/ }));
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: '本局选择记者1' })
      ).toBeInTheDocument()
    );
    for (let number = 1; number <= 5; number += 1) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: `本局选择记者${number}` })
      );
    }

    expect(
      screen.getByLabelText('本局自定义内容选择数量')
    ).toHaveTextContent('已启用 5/20 · 本局重点 3/3');
    expect(
      screen.getByRole('checkbox', { name: '将记者1设为本局重点' })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: '将记者4设为本局重点' })
    ).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /07 确认生成/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));

    const selections = onStartGame.mock.calls[0][0]
      .customContentSelections as Array<{ prioritized?: boolean }>;
    expect(selections).toHaveLength(5);
    expect(selections.map((selection) => selection.prioritized)).toEqual([
      true,
      true,
      true,
      false,
      false
    ]);
  });

  it('shows an explicit adaptation review gate before continuing the opening', () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    const reviewItems = Array.from({ length: 20 }, (_, index) => ({
      selectionKey: `character:reporter:${index + 1}`,
      kind: 'character' as const,
      assetId: `reporter-${index + 1}`,
      title: `跨世界记者${index + 1}`,
      status: 'needs_review' as const,
      summaryLines: [
        `适配为香港本地记者${index + 1}`,
        `通过报馆采访建立接触${index + 1}`
      ]
    }));
    render(
      <OpeningScreen
        onStartGame={vi.fn()}
        onBack={vi.fn()}
        customContentReview={reviewItems}
        onApproveCustomContentReview={onApprove}
        onCancelCustomContentReview={onCancel}
      />
    );

    const dialog = screen.getByRole('dialog', {
      name: '确认本局世界包适配'
    });
    const reviewList = within(dialog).getByRole('region', {
      name: '本局世界包适配项目'
    });
    expect(reviewList).toHaveAttribute('tabindex', '0');
    expect(within(reviewList).getAllByRole('article')).toHaveLength(20);
    expect(within(dialog).getByText('跨世界记者1')).toBeInTheDocument();
    expect(within(dialog).getByText('跨世界记者20')).toBeInTheDocument();
    expect(
      within(dialog).getByText('通过报馆采访建立接触20')
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: '确认适配并继续生成' })
    );
    expect(onApprove).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(dialog).getByRole('button', { name: '返回修改选择' })
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('submits a civilian livelihood without police-only fields', () => {
    const onStartGame = renderOpeningScreenForSubmission();

    fireEvent.click(screen.getByRole('button', { name: /02 身份选择/ }));
    fireEvent.click(screen.getByRole('button', { name: '普通市民' }));
    fireEvent.click(screen.getByRole('button', { name: /03 基础档案/ }));

    expect(screen.queryByRole('textbox', { name: '警员编号' })).not.toBeInTheDocument();
    expect(screen.getByText('市民生活档案')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '基层与街面职业' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '专业与办公室职业' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '中层管理与经营' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '银行职员' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '小公司经理' })).toBeInTheDocument();
    expect(screen.getByText('粤语风味')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '果栏运输帮工' }));
    fireEvent.click(screen.getByRole('button', { name: '全粤语' }));
    fireEvent.click(screen.getByRole('button', { name: /07 确认生成/ }));
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

  it('lets a probationary inspector choose uniform patrol, CID, supervised EU command, or trained PTU command', () => {
    renderOpeningScreenForSubmission();
    fireEvent.click(screen.getByRole('button', { name: /03 基础档案/ }));

    fireEvent.change(screen.getByRole('combobox', { name: '警阶' }), {
      target: { value: 'probationary_inspector' }
    });

    const departmentSelect = screen.getByRole('combobox', { name: '部门' });
    expect(within(departmentSelect).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Uniform Branch（军装巡逻）',
      'Criminal Investigation Department（刑事侦缉处 CID）',
      'Emergency Unit（冲锋队 EU）',
      'Police Tactical Unit（机动部队 PTU）'
    ]);
    expect(departmentSelect).toHaveValue('uniform');
    expect(screen.getByRole('combobox', { name: '岗位' })).toHaveValue('patrol_sub_unit_commander');
    expect(screen.getByRole('option', { name: 'Patrol Sub-Unit Commander（巡逻小队指挥官）' })).toBeInTheDocument();

    fireEvent.change(departmentSelect, { target: { value: 'ptu' } });
    expect(screen.getByRole('combobox', { name: '驻点' })).toHaveValue('ptu_barracks');
    expect(screen.getByRole('combobox', { name: '岗位' })).toHaveValue('platoon_commander');

    fireEvent.change(departmentSelect, { target: { value: 'cid' } });
    expect(screen.getByRole('combobox', { name: '岗位' })).toHaveValue('team_investigator');
    expect(screen.getByRole('option', { name: 'Serious Crime Unit Member（重案组成员）' })).toBeInTheDocument();
  });

  it('keeps EU regional posting and automatically follows the strict rank-role matrix', () => {
    renderOpeningScreenForSubmission();
    fireEvent.click(screen.getByRole('button', { name: /03 基础档案/ }));

    const rankSelect = screen.getByRole('combobox', { name: '警阶' });
    const departmentSelect = screen.getByRole('combobox', { name: '部门' });
    fireEvent.change(departmentSelect, { target: { value: 'eu' } });

    const postingSelect = screen.getByRole('combobox', { name: '驻点' });
    const roleSelect = screen.getByRole('combobox', { name: '岗位' });
    expect(within(postingSelect).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Emergency Unit Hong Kong Island（港岛总区冲锋队）',
      'Emergency Unit Kowloon East（东九龙总区冲锋队）',
      'Emergency Unit Kowloon West（西九龙总区冲锋队）',
      'Emergency Unit New Territories North（新界北总区冲锋队）',
      'Emergency Unit New Territories South（新界南总区冲锋队）'
    ]);
    expect(postingSelect).toHaveValue('eu_hong_kong_island');
    expect(within(roleSelect).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual([
      'eu_vehicle_crew',
      'eu_vehicle_driver'
    ]);

    fireEvent.change(rankSelect, { target: { value: 'sergeant' } });
    expect(postingSelect).toHaveValue('eu_hong_kong_island');
    expect(roleSelect).toHaveValue('eu_vehicle_commander');

    fireEvent.change(rankSelect, { target: { value: 'inspector' } });
    expect(postingSelect).toHaveValue('eu_hong_kong_island');
    expect(roleSelect).toHaveValue('eu_platoon_commander');

    fireEvent.change(rankSelect, { target: { value: 'chief_inspector' } });
    expect(postingSelect).toHaveValue('eu_hong_kong_island');
    expect(roleSelect).toHaveValue('eu_headquarters_operations_officer');

    fireEvent.change(departmentSelect, { target: { value: 'cid' } });
    expect(postingSelect).toHaveValue('central_police_station');
    fireEvent.change(departmentSelect, { target: { value: 'eu' } });
    expect(postingSelect).toHaveValue('eu_hong_kong_island');
  });

  it('submits EU role authority through the existing law identity setup', () => {
    const onStartGame = renderOpeningScreenForSubmission();
    fireEvent.click(screen.getByRole('button', { name: /03 基础档案/ }));

    fireEvent.change(screen.getByRole('combobox', { name: '警阶' }), { target: { value: 'sergeant' } });
    fireEvent.change(screen.getByRole('combobox', { name: '部门' }), { target: { value: 'eu' } });
    fireEvent.change(screen.getByRole('combobox', { name: '驻点' }), { target: { value: 'eu_kowloon_west' } });
    fireEvent.click(screen.getByRole('button', { name: /07 确认生成/ }));
    fireEvent.click(screen.getByRole('button', { name: '生成开局' }));

    expect(onStartGame).toHaveBeenCalledWith(
      expect.objectContaining({
        currentIdentity: 'police',
        policePostingId: 'eu_kowloon_west',
        lawIdentity: expect.objectContaining({
          stationOrPost: 'Emergency Unit Kowloon West（西九龙总区冲锋队）',
          department: 'Emergency Unit（冲锋队 EU）',
          rank: 'Sergeant（警长 SGT）',
          assignmentSummary: 'Emergency Vehicle Commander（冲锋车车长）',
          authoritySummary: expect.stringContaining('可指挥本冲锋车车组'),
          accessSummary: expect.stringContaining('本车任务详情'),
          dutySummary: expect.stringContaining('车辆指挥')
        })
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
    expect(
      screen.getByText(/只写在背景描述中的机构不会自动建档/)
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: '自定义职业' }), { target: { value: '自由摄影师' } });
    fireEvent.change(screen.getByRole('textbox', { name: '自定义职业雇主' }), { target: { value: '明光摄影社' } });
    fireEvent.change(screen.getByRole('combobox', { name: '自定义职业地点' }), {
      target: { value: 'place_broadcast_drive' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: '自定义职业接触面' }), {
      target: { value: '常接触记者、冲印店和夜场宣传人员。' }
    });
    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /07 确认生成/ }));
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
          employerName: '明光摄影社',
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
    fireEvent.click(screen.getByRole('button', { name: /07 确认生成/ }));
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
