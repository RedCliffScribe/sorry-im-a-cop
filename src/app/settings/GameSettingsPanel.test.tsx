import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import { GameSettingsPanel } from './GameSettingsPanel';

describe('GameSettingsPanel', () => {
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
});
