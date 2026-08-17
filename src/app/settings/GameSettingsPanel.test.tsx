import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { GameSettingsPanel } from './GameSettingsPanel';

describe('GameSettingsPanel', () => {
  it('separates dramatic content from general game settings', () => {
    const onChange = vi.fn();
    const settings = createDefaultAiSettings();

    const { rerender } = render(
      <GameSettingsPanel page="game" settings={settings} onChange={onChange} />
    );

    expect(screen.getByRole('heading', { name: '游戏设置' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '界面与剧情语言' })).toBeInTheDocument();
    expect(screen.queryByLabelText('长期叙事节奏')).not.toBeInTheDocument();

    rerender(<GameSettingsPanel page="gameplay" settings={settings} onChange={onChange} />);

    expect(screen.getByRole('heading', { name: '玩法设置' })).toBeInTheDocument();
    expect(screen.getByLabelText('长期叙事节奏')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '界面与剧情语言' })).not.toBeInTheDocument();
  });

  it('edits the shared interface and narrative language', () => {
    const onChange = vi.fn();
    const settings = createDefaultAiSettings();

    render(<GameSettingsPanel settings={settings} onChange={onChange} />);

    const languageSelect = screen.getByRole('combobox', { name: '界面与剧情语言' });
    expect(languageSelect).toHaveValue('zh-CN');
    fireEvent.change(languageSelect, {
      target: { value: 'zh-Hant-HK' }
    });

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        language: 'zh-Hant-HK'
      }
    });
  });

  it('changes Cantonese flavor through a current-save dialog instead of a global dropdown', () => {
    const onChange = vi.fn();
    const onRuntimeCantoneseFlavorChange = vi.fn();
    const settings = createDefaultAiSettings();
    const runtimeState = createInitialRuntimeState({ cantoneseFlavor: 'medium' });

    render(
      <GameSettingsPanel
        settings={settings}
        runtimeState={runtimeState}
        onChange={onChange}
        onRuntimeCantoneseFlavorChange={onRuntimeCantoneseFlavorChange}
      />
    );

    expect(screen.getByText('当前游戏粤语风味')).toBeInTheDocument();
    expect(screen.getByText('中等')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /粤语风味/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '粤语风味更改' }));

    const dialog = screen.getByRole('dialog', { name: '更改当前游戏粤语风味' });
    expect(dialog).toHaveTextContent('当前游戏：中等');
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(within(dialog).getAllByRole('radio')).toHaveLength(5);
    expect(within(dialog).getByRole('radio', { name: /中等/ })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(within(dialog).getByRole('radio', { name: /较多/ }));

    expect(onRuntimeCantoneseFlavorChange).toHaveBeenCalledWith('heavy');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: '更改当前游戏粤语风味' })).not.toBeInTheDocument();
  });

  it('does not expose a global Cantonese flavor control without an active game', () => {
    render(<GameSettingsPanel settings={createDefaultAiSettings()} onChange={vi.fn()} />);

    expect(screen.getAllByText(/载入或开始一局游戏后/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '粤语风味更改' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '游戏难度更改' })).not.toBeInTheDocument();
  });

  it('changes the five-level game difficulty only for the current save', () => {
    const onChange = vi.fn();
    const onRuntimeGameDifficultyChange = vi.fn();
    const runtimeState = createInitialRuntimeState({ gameDifficulty: 'standard' });

    render(
      <GameSettingsPanel
        settings={createDefaultAiSettings()}
        runtimeState={runtimeState}
        onChange={onChange}
        onRuntimeGameDifficultyChange={onRuntimeGameDifficultyChange}
      />
    );

    expect(screen.getByText('当前游戏难度')).toBeInTheDocument();
    expect(screen.getByText(/标准（判定目标值\+0）/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '游戏难度更改' }));

    const dialog = screen.getByRole('dialog', { name: '更改当前游戏难度' });
    expect(within(dialog).getAllByRole('radio')).toHaveLength(5);
    expect(within(dialog).getByRole('radio', { name: /标准/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(within(dialog).getByRole('radio', { name: /严酷/ }));

    expect(onRuntimeGameDifficultyChange).toHaveBeenCalledWith('brutal');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edits the story render limit inside game settings', () => {
    const onChange = vi.fn();
    const settings = createDefaultAiSettings();

    render(<GameSettingsPanel settings={settings} onChange={onChange} />);

    expect(screen.getByLabelText('剧情正文渲染层数')).toHaveValue(30);
    fireEvent.change(screen.getByLabelText('剧情正文渲染层数'), { target: { value: '12' } });

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        storyRenderLimit: 12
      }
    });
  });

  it('edits automatic save retention and interval inside game settings', () => {
    const onChange = vi.fn();
    const settings = createDefaultAiSettings();

    render(<GameSettingsPanel settings={settings} onChange={onChange} />);

    expect(screen.getByLabelText('自动存档保留数量')).toHaveValue(20);
    expect(screen.getByLabelText('自动保存间隔回合')).toHaveValue(1);

    fireEvent.change(screen.getByLabelText('自动存档保留数量'), { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        autoSaveLimit: 12
      }
    });

    fireEvent.change(screen.getByLabelText('自动保存间隔回合'), { target: { value: '3' } });
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        autoSaveIntervalTurns: 3
      }
    });
  });

  it('edits rollback snapshot retention inside game settings', () => {
    const onChange = vi.fn();
    const settings = createDefaultAiSettings();

    render(<GameSettingsPanel settings={settings} onChange={onChange} />);

    expect(screen.getByLabelText('回溯快照数量')).toHaveValue(20);
    fireEvent.change(screen.getByLabelText('回溯快照数量'), { target: { value: '8' } });

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        rollbackSnapshotLimit: 8
      }
    });
  });

  it('edits the pregnancy lifecycle mode inside game settings', () => {
    const onChange = vi.fn();
    const settings = createDefaultAiSettings();

    render(<GameSettingsPanel settings={settings} onChange={onChange} />);

    expect(screen.getByLabelText('怀孕机制强度')).toHaveValue('standard');
    expect(screen.getByText(/存档、读档或重开页面都不会重新掷骰/)).toBeInTheDocument();
    expect(screen.getByText(/香闺秘档 → 子宫档案/)).toBeInTheDocument();
    expect(screen.getByText(/21—30 天后揭晓/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('查看判定流程与具体概率'));
    expect(screen.getByRole('table', { name: '按年龄划分的基础怀孕概率' })).toHaveTextContent('22%');
    expect(screen.getByRole('table', { name: '按年龄划分的基础怀孕概率' })).toHaveTextContent('0.2%');
    expect(screen.getByText(/低概率：基础概率 × 0.45/)).toBeInTheDocument();
    expect(screen.getByText(/任何单次判定最高为 30%/)).toBeInTheDocument();
    expect(screen.getByText(/第 260 天进入待产窗口/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('怀孕机制强度'), { target: { value: 'high' } });

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        pregnancyMode: 'high'
      }
    });
  });

  it('edits the real narrative length level inside game settings', () => {
    const onChange = vi.fn();
    const settings = createDefaultAiSettings();

    render(<GameSettingsPanel settings={settings} onChange={onChange} />);

    expect(screen.getByRole('radio', { name: /标准/ })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: /长篇/ }));

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        narrativeLengthLevel: 'long'
      }
    });
  });

  it('edits the narrative perspective used by opening and ordinary turns', () => {
    const onChange = vi.fn();
    const settings = createDefaultAiSettings();

    render(<GameSettingsPanel settings={settings} onChange={onChange} />);

    expect(screen.getByRole('radio', { name: /第二人称/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/只约束【旁白】/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /第三人称/ }));

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        narrativePerspective: 'third_person'
      }
    });
  });

  it('selects among original, player-led, and natural narrative portrayal with explanations', () => {
    const onChange = vi.fn();
    const settings = createDefaultAiSettings();

    const { rerender } = render(<GameSettingsPanel settings={settings} onChange={onChange} />);

    const select = screen.getByRole('combobox', { name: '正文演绎风格' });
    expect(select).toHaveValue('natural');
    expect(screen.getByRole('option', { name: '原始 · 1.0 经典写法' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '玩家主导 · 严格按输入' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '自然代演 · 自然演出输入 · 默认' })).toBeInTheDocument();
    expect(screen.getByText(/把本回合输入自然写成主角对白与动作/)).toBeInTheDocument();
    expect(screen.getByText(/三种风格都遵守当前“正文篇幅”档位/)).toBeInTheDocument();
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('阿强，寻晚你去咗边');

    fireEvent.change(select, { target: { value: 'original' } });

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        playerPortrayalMode: 'original'
      }
    });

    const originalSettings = {
      ...settings,
      game: { ...settings.game, playerPortrayalMode: 'original' as const }
    };
    rerender(<GameSettingsPanel settings={originalSettings} onChange={onChange} />);
    expect(screen.getByRole('combobox', { name: '正文演绎风格' })).toHaveValue('original');
    expect(screen.getByText(/可配合酒馆预设继续调整成自己喜欢的风格/)).toBeInTheDocument();
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('吊扇把报案室里的烟气');
  });

  it('uses the backward-compatible dramatic-content defaults and edits pacing and channels', () => {
    const onChange = vi.fn();
    const settings = createDefaultAiSettings();

    render(<GameSettingsPanel page="gameplay" settings={settings} onChange={onChange} />);

    expect(screen.getByRole('combobox', { name: '长期叙事节奏' })).toHaveValue('original');
    expect(screen.getByRole('combobox', { name: '戏剧素材投喂量' })).toHaveValue('standard');
    expect(screen.getByRole('combobox', { name: '前台规划线路' })).toHaveValue('auto');
    expect(screen.getByRole('combobox', { name: '戏剧素材渠道：工作与营生' })).toHaveValue('medium');
    expect(screen.getByRole('combobox', { name: '戏剧素材渠道：自定义人物' })).toHaveValue('medium');
    expect(screen.getByRole('combobox', { name: '戏剧素材渠道：自定义事件' })).toHaveValue('medium');
    expect(screen.getByText(/关闭渠道只停止引入新的可选素材/)).toBeInTheDocument();
    expect(screen.getByText(/关闭对应渠道也不会取消该意图/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: '长期叙事节奏' }), {
      target: { value: 'balanced' }
    });

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        dramaticContent: {
          ...settings.game.dramaticContent!,
          pacing: 'balanced'
        }
      }
    });

    fireEvent.change(screen.getByRole('combobox', { name: '戏剧素材渠道：工作与营生' }), {
      target: { value: 'off' }
    });

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        dramaticContent: {
          ...settings.game.dramaticContent!,
          channels: {
            ...settings.game.dramaticContent!.channels,
            work_livelihood: 'off'
          }
        }
      }
    });
  });

  it('shows and persists bounded custom dramatic-content budgets', () => {
    const onChange = vi.fn();
    const base = createDefaultAiSettings();
    const settings = {
      ...base,
      game: {
        ...base.game,
        dramaticContent: {
          ...base.game.dramaticContent!,
          pacing: 'custom' as const
        }
      }
    };

    render(<GameSettingsPanel page="gameplay" settings={settings} onChange={onChange} />);

    expect(screen.getByLabelText('戏剧化动态素材上限')).toHaveValue(6);
    expect(screen.getByLabelText('戏剧化静态素材上限')).toHaveValue(3);
    expect(screen.getByLabelText('戏剧化辅助素材上限')).toHaveValue(1);
    expect(screen.getByLabelText('戏剧化安静窗口回合数')).toHaveValue(6);

    fireEvent.change(screen.getByLabelText('戏剧化动态素材上限'), {
      target: { value: '16' }
    });

    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        dramaticContent: {
          ...settings.game.dramaticContent,
          custom: {
            dynamicLimit: 16
          }
        }
      }
    });
  });

  it('keeps current-save drama settings separate from future new-game defaults', () => {
    const onChange = vi.fn();
    const onRuntimeDramaticContentChange = vi.fn();
    const settings = createDefaultAiSettings();
    const runtimeState = {
      ...createInitialRuntimeState(),
      world: {
        ...createInitialRuntimeState().world,
        screenCharacterSeedsEnabled: false,
        storypackInfluence: 'high' as const,
        dramaticOpeningId: 'first_shift'
      },
      dramaticContent: {
        instances: [],
        recentDiagnostics: [],
        settings: {
          ...settings.game.dramaticContent!,
          pacing: 'balanced' as const
        }
      }
    };

    render(
      <GameSettingsPanel
        page="gameplay"
        settings={settings}
        runtimeState={runtimeState}
        onChange={onChange}
        onRuntimeDramaticContentChange={onRuntimeDramaticContentChange}
      />
    );

    expect(screen.getByRole('combobox', { name: '长期叙事节奏' })).toHaveValue('balanced');
    expect(screen.getByLabelText('影视角色种子（开局锁定）')).toHaveValue('关闭');
    expect(screen.getByLabelText('Storypack 影响（开局锁定）')).toHaveValue('高');
    expect(screen.getByLabelText('戏剧化开局（开局锁定）')).toHaveValue('工作第一天');

    fireEvent.change(screen.getByRole('combobox', { name: '长期叙事节奏' }), {
      target: { value: 'dramatic' }
    });
    expect(onRuntimeDramaticContentChange).toHaveBeenCalledWith({
      ...runtimeState.dramaticContent.settings,
      pacing: 'dramatic'
    });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '设为以后新游戏默认值' }));
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      game: {
        ...settings.game,
        dramaticContent: runtimeState.dramaticContent.settings
      }
    });
  });
});
