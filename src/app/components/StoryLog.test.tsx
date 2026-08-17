import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameTime, JudgementCheck, StoryEntry } from '../../domain/runtime/types';
import type { DisplaySettings } from '../../domain/settings/types';
import { StoryLog } from './StoryLog';

const gameTime: GameTime = {
  year: 1988,
  month: 9,
  day: 12,
  hour: 21,
  minute: 15
};

function createEntry(partial: Partial<StoryEntry> & Pick<StoryEntry, 'turnId' | 'speaker' | 'text'>): StoryEntry {
  return {
    gameTime,
    ...partial
  };
}

describe('StoryLog', () => {
  it('renders player and narrator entries from the same turn without duplicate key warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(
        <StoryLog
          entries={[
            createEntry({ turnId: 'turn_1', speaker: 'player', text: '我去问问值日警长。' }),
            createEntry({ turnId: 'turn_1', speaker: 'narrator', text: '值日警长放下手里的更表。' })
          ]}
        />
      );

      expect(screen.getByText('我去问问值日警长。')).toBeInTheDocument();
      expect(screen.getByText('值日警长放下手里的更表。')).toBeInTheDocument();
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('same key');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('renders only the latest entries according to the configured render limit', () => {
    render(
      <StoryLog
        renderLimit={2}
        entries={[
          createEntry({ turnId: 'turn_0', speaker: 'narrator', text: '开场正文' }),
          createEntry({ turnId: 'player_1', speaker: 'player', text: '我先看看四周。' }),
          createEntry({ turnId: 'turn_1', speaker: 'narrator', text: '第一回合正文' })
        ]}
      />
    );

    expect(screen.queryByText('开场正文')).not.toBeInTheDocument();
    expect(screen.getByText('我先看看四周。')).toBeInTheDocument();
    expect(screen.getByText('第一回合正文')).toBeInTheDocument();
  });

  it('scrolls the story list to the newest rendered turn', () => {
    const { rerender } = render(
      <StoryLog entries={[createEntry({ turnId: 'turn_0', speaker: 'narrator', text: '开场正文' })]} />
    );
    const storyList = screen.getByTestId('story-list');
    Object.defineProperty(storyList, 'scrollHeight', { configurable: true, value: 1280 });
    storyList.scrollTop = 0;

    rerender(
      <StoryLog
        entries={[
          createEntry({ turnId: 'turn_0', speaker: 'narrator', text: '开场正文' }),
          createEntry({ turnId: 'player_1', speaker: 'player', text: '我先看看四周。' }),
          createEntry({ turnId: 'turn_1', speaker: 'narrator', text: '第一回合正文' })
        ]}
      />
    );

    expect(storyList.scrollTop).toBe(1280);
  });

  it('labels narrator turns and opens that turn raw response record without AI-facing wording', () => {
    render(
      <StoryLog
        entries={[
          createEntry({
            turnId: 'turn_1',
            speaker: 'narrator',
            text: '报案室里电话响起。',
            suggestedActions: ['接电话'],
            rawNarratorResponse: '{"narrativeText":"报案室里电话响起。","suggestedActions":["接电话"]}'
          } as Partial<StoryEntry> & StoryEntry)
        ]}
      />
    );

    expect(screen.getByText('第 1 回合')).toHaveClass('story-turn-label');
    const sourceButton = screen.getByRole('button', { name: '查看原文' });
    expect(sourceButton).toHaveClass('story-turn-source-button');
    fireEvent.click(sourceButton);

    const dialog = screen.getByRole('dialog', { name: '诊断导出' });
    const rawText = within(dialog).getByLabelText('诊断导出原文') as HTMLTextAreaElement;
    expect(rawText.value).toContain('# 第 1 回合 原始记录');
    expect(rawText.value).toContain('## 原始返回记录');
    expect(rawText.value).not.toMatch(/AI|模型/);
    expect(rawText.value).toContain('"narrativeText":"报案室里电话响起。"');
    expect(rawText.value).toContain('建议行动：接电话');
  });

  it('keeps player input in a separate right-side entry class', () => {
    const { container } = render(
      <StoryLog entries={[createEntry({ turnId: 'player_1', speaker: 'player', text: '我去问问值日警长。' })]} />
    );

    const playerEntry = container.querySelector('.story-entry-player');
    expect(playerEntry).not.toBeNull();
    expect(playerEntry).toHaveTextContent('我去问问值日警长。');
  });

  it('does not render blank player action placeholders', () => {
    render(
      <StoryLog
        entries={[
          createEntry({ turnId: 'player_1', speaker: 'player', text: '   ' }),
          createEntry({ turnId: 'player_2', speaker: 'player', text: '我去问问值日警长。' })
        ]}
      />
    );

    expect(screen.getByText('我去问问值日警长。')).toBeInTheDocument();
    expect(screen.getAllByText('你的行动')).toHaveLength(1);
  });

  it('allows regenerating a player action only when a rollback snapshot exists', () => {
    const onRegeneratePlayerAction = vi.fn();
    render(
      <StoryLog
        entries={[
          createEntry({ turnId: 'player_1', speaker: 'player', text: '先查后巷。' }),
          createEntry({ turnId: 'player_2', speaker: 'player', text: '再问店员。' })
        ]}
        rollbackAvailableTurnNumbers={[2]}
        onRegeneratePlayerAction={onRegeneratePlayerAction}
      />
    );

    expect(screen.getByText('先查后巷。')).toBeInTheDocument();
    expect(screen.getByText('再问店员。')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '编辑重发' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '编辑重发' }));
    const editor = screen.getByLabelText('编辑第 2 回合行动');
    fireEvent.change(editor, { target: { value: '改成先问店长。' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(onRegeneratePlayerAction).toHaveBeenCalledWith(2, '改成先问店长。');
  });

  it('allows current turn ids to edit and resend while retaining legacy player ids', () => {
    const onRegeneratePlayerAction = vi.fn();
    render(
      <StoryLog
        entries={[
          createEntry({ turnId: 'player_1', speaker: 'player', text: '旧存档行动。' }),
          createEntry({ turnId: 'turn_2', speaker: 'player', text: '当前行动。' })
        ]}
        rollbackAvailableTurnNumbers={[1, 2]}
        onRegeneratePlayerAction={onRegeneratePlayerAction}
      />
    );

    expect(screen.getAllByRole('button', { name: '编辑重发' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: '编辑重发' })[1]!);
    fireEvent.change(screen.getByLabelText('编辑第 2 回合行动'), { target: { value: '修改后的当前行动。' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(onRegeneratePlayerAction).toHaveBeenCalledWith(2, '修改后的当前行动。');
  });

  it('shows an in-world waiting panel before narrative streaming starts', () => {
    render(<StoryLog entries={[]} isWaitingForNarrative />);

    expect(screen.getByText('正在整理记录……')).toBeInTheDocument();
    expect(screen.getByText('无线电仍在沙沙作响')).toBeInTheDocument();
    expect(screen.getByText('案件记录')).toBeInTheDocument();
    expect(screen.queryByText(/AI|LLM|模型响应|Prompt|推理中/)).not.toBeInTheDocument();
  });

  it('shows a submitted player action immediately while the turn is still pending', () => {
    render(
      <StoryLog
        entries={[]}
        isWaitingForNarrative
        pendingPlayerAction={{
          text: '我先封锁后巷，再呼叫支援。',
          gameTime,
          turnNumber: 1
        }}
      />
    );

    expect(screen.getByText('我先封锁后巷，再呼叫支援。')).toBeInTheDocument();
    expect(screen.getByText('已发送 · 等待回应')).toBeInTheDocument();
    expect(screen.getByText('正在整理记录……')).toBeInTheDocument();
  });

  it('replaces the waiting panel once narrative text starts streaming', () => {
    render(
      <StoryLog
        entries={[]}
        isWaitingForNarrative
        streamingText="雨水顺着报案室窗沿往下滑。"
        streamingGameTime={gameTime}
      />
    );

    expect(screen.queryByText('正在整理记录……')).not.toBeInTheDocument();
    expect(screen.getByText('雨水顺着报案室窗沿往下滑。')).toBeInTheDocument();
    expect(screen.getByText('生成中')).toBeInTheDocument();
  });

  it('renders tagged narrator lines as narration and dialogue segments', () => {
    const { container } = render(
      <StoryLog
        entries={[
          createEntry({
            turnId: 'turn_1',
            speaker: 'narrator',
            text: '【旁白】雨刚停，报案室外的霓虹倒在积水里。\n【陈强】“阿Sir，今晚别问太深。”\n【旁白】他说完往门口看了一眼。'
          })
        ]}
      />
    );

    const narrationSegments = container.querySelectorAll('.story-segment-narration');
    const dialogueSegments = container.querySelectorAll('.story-segment-dialogue');

    expect(narrationSegments).toHaveLength(2);
    expect(dialogueSegments).toHaveLength(1);
    expect(dialogueSegments[0]).toHaveTextContent('陈强');
    expect(dialogueSegments[0]).toHaveTextContent('今晚别问太深');
  });

  it('applies separate display settings to narration and dialogue text', () => {
    const displaySettings: DisplaySettings = {
      uiTheme: 'dark',
      avgPlayerPortraitMode: 'hidden',
      interfaceFontFamily: 'readable',
      narrationFontFamily: 'serif',
      dialogueFontFamily: 'mono',
      narrationFontSize: 18,
      dialogueFontSize: 20
    };

    render(
      <StoryLog
        displaySettings={displaySettings}
        entries={[
          createEntry({
            turnId: 'turn_1',
            speaker: 'narrator',
            text: '【旁白】雨刚停，报案室外的霓虹倒在积水里。\n【陈强】“阿Sir，今晚别问太深。”'
          })
        ]}
      />
    );

    const storyList = screen.getByTestId('story-list');
    expect(storyList.style.getPropertyValue('--story-narration-font-family')).toContain('Noto Serif SC');
    expect(storyList.style.getPropertyValue('--story-dialogue-font-family')).toContain('Consolas');
    expect(storyList.style.getPropertyValue('--story-narration-font-size')).toBe('18px');
    expect(storyList.style.getPropertyValue('--story-dialogue-font-size')).toBe('20px');
  });

  it('uses the interface document font for the default story typography', () => {
    render(
      <StoryLog
        entries={[
          createEntry({
            turnId: 'turn_1',
            speaker: 'narrator',
            text: '【旁白】档案室的日光灯轻轻响了一声。'
          })
        ]}
      />
    );

    const storyList = screen.getByTestId('story-list');
    expect(storyList.style.getPropertyValue('--story-narration-font-family')).toBe('var(--font-document)');
    expect(storyList.style.getPropertyValue('--story-dialogue-font-family')).toBe('var(--font-document)');
  });

  it('renders narrator character count under each narrator turn', () => {
    render(
      <StoryLog
        entries={[
          createEntry({
            turnId: 'turn_1',
            speaker: 'narrator',
            text: '一二三四五'
          })
        ]}
      />
    );

    expect(screen.getByText('正文约 5 字')).toBeInTheDocument();
  });

  it('shows the experience award and level-up result under the matching narrative', () => {
    render(
      <StoryLog
        entries={[
          createEntry({
            turnId: 'turn_1',
            speaker: 'narrator',
            text: '你在雨中认出了可疑车辆。',
            experienceAward: {
              awardId: 'xp:turn_1',
              turnId: 'turn_1',
              total: 10,
              sources: [
                {
                  kind: 'judgement',
                  sourceId: 'judgement:check_1',
                  amount: 10,
                  reason: '困难辨认可疑车辆判定成功'
                }
              ],
              capped: false,
              levelsGained: 1,
              attributePointsGained: 5,
              levelAfter: 2
            }
          })
        ]}
      />
    );

    expect(screen.getByLabelText('本回合经验')).toHaveTextContent(
      '本回合 +10 经验 · 困难辨认可疑车辆判定成功'
    );
    expect(screen.getByText('升至 2 级，获得 5 点可分配属性。')).toBeInTheDocument();
  });

  it('renders turn token and response metrics in the turn header', () => {
    render(
      <StoryLog
        entries={[
          createEntry({
            turnId: 'turn_55',
            speaker: 'narrator',
            text: '旺角的雨还没停。',
            turnMetrics: {
              inputTokens: 100501,
              responseMs: 138000,
              outputTokens: 3413
            }
          })
        ]}
      />
    );

    const metrics = screen.getByLabelText('本回合生成指标');
    expect(metrics).toHaveTextContent('↑ 100,501');
    expect(metrics).toHaveTextContent('◷ 138s');
    expect(metrics).toHaveTextContent('↓ 3,413');
  });

  it('renders expandable judgement check cards for the matching narrator turn', () => {
    const check: JudgementCheck = {
      checkId: 'check_1',
      turnId: 'turn_1',
      gameTime,
      title: '追截巷口逃跑男子',
      category: 'chase',
      targetSummary: '目标：花衬衫青年',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      difficulty: 58,
      score: 66,
      margin: 8,
      outcome: 'success',
      shortSummary: '成功追上对方，但消耗了不少体力。',
      consequenceSummary: '对方被迫停下，现场围观者增多。',
      factors: [
        { label: '行动', value: 8, reason: '玩家行动属性较高，短距离追逐有优势。' },
        { label: '环境', value: -4, reason: '巷口地面湿滑，人群阻挡视线。' }
      ],
      visibility: 'player_known'
    };

    render(
      <StoryLog
        entries={[
          createEntry({
            turnId: 'turn_1',
            speaker: 'narrator',
            text: '你追进巷口，雨水从招牌边缘滴落。',
            judgementCheckIds: ['check_1']
          })
        ]}
        judgementChecks={{ check_1: check }}
      />
    );

    expect(screen.getByText('追截巷口逃跑男子')).toBeInTheDocument();
    expect(screen.getByText('追捕')).toBeInTheDocument();
    expect(screen.getByText('成功')).toBeInTheDocument();
    expect(screen.queryByText('难度 58')).not.toBeInTheDocument();
    const narrativeEntry = screen
      .getByText('你追进巷口，雨水从招牌边缘滴落。')
      .closest('article');
    const judgementRecord = screen.getByRole('article', {
      name: '追截巷口逃跑男子判定记录'
    });
    expect(narrativeEntry).not.toContainElement(judgementRecord);

    fireEvent.click(
      screen.getByRole('button', {
        name: '展开“追截巷口逃跑男子”判定详情'
      })
    );

    expect(screen.getByRole('region', { name: '旧版判定数值' })).toHaveTextContent(
      '难度58判定值66差额+8'
    );
    expect(screen.getByText(/这是旧版判定记录/)).toBeInTheDocument();
    expect(screen.getByText('行动 +8')).toBeInTheDocument();
    expect(screen.getByText('玩家行动属性较高，短距离追逐有优势。')).toBeInTheDocument();
  });

  it('renders the local d100 formula instead of legacy difficulty and score labels', () => {
    const check: JudgementCheck = {
      rulesetVersion: 'v1.1-local-d100',
      checkId: 'check_local',
      turnId: 'turn_1',
      gameTime,
      title: '辨认口供矛盾',
      category: 'thinking',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      difficulty: 61,
      score: 50,
      margin: 7,
      outcome: 'success',
      shortSummary: '玩家辨认出两份口供的时间矛盾。',
      factors: [
        {
          sourceType: 'preparation',
          label: '记录完整',
          value: 4,
          reason: '两份原始记录都在手边。'
        }
      ],
      primaryAttribute: 'perception',
      primaryAttributeValue: 70,
      secondaryAttribute: 'thinking',
      secondaryAttributeValue: 60,
      secondaryModifier: 2,
      difficultyTier: 'hard',
      difficultyModifier: -15,
      gameDifficulty: 'standard',
      gameDifficultyModifier: 0,
      contextModifierTotal: 4,
      effectiveTarget: 61,
      presetRoll: 50,
      visibility: 'player_known'
    };

    render(
      <StoryLog
        entries={[
          createEntry({
            turnId: 'turn_1',
            speaker: 'narrator',
            text: '你逐行核对两份口供。',
            judgementCheckIds: ['check_local']
          })
        ]}
        judgementChecks={{ check_local: check }}
      />
    );
    expect(screen.getByText('思考')).toBeInTheDocument();
    expect(screen.getByText('d100 50 / 目标 61')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: '展开“辨认口供矛盾”判定详情'
      })
    );

    expect(
      screen.getByLabelText('本地 d100 50，目标值 61，结果成功')
    ).toBeInTheDocument();
    expect(screen.getByText('余量 +7')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '判定详情' })).toBeInTheDocument();
    expect(screen.getByText('能力与现场修正')).toBeInTheDocument();
    expect(screen.queryByText('目标值怎样算出')).not.toBeInTheDocument();
    expect(screen.getByText('主属性 · 观察')).toBeInTheDocument();
    expect(screen.getByText('副属性 · 思考')).toBeInTheDocument();
    expect(screen.getByText('场景 · 困难')).toBeInTheDocument();
    expect(screen.getByText('本局 · 标准')).toBeInTheDocument();
    expect(
      screen.getByText(
        '70（主属性 · 观察） +2（副属性 · 思考） -15（场景 · 困难） +0（本局 · 标准） +4（情境合计） = 61，最终目标值 61'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('d100 50 ≤ 目标值 61，判定成功。')
    ).toBeInTheDocument();
    expect(screen.getByText('准备')).toBeInTheDocument();
    expect(screen.getByText('两份原始记录都在手边。')).toBeInTheDocument();
    expect(screen.queryByText('判定值 50')).not.toBeInTheDocument();
  });
});
