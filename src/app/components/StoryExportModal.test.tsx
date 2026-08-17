import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { RuntimeState } from '../../domain/runtime/types';
import type { StoryExportArtifact } from '../../domain/storyExport/storyExport';
import { StoryExportModal } from './StoryExportModal';

function createState(): RuntimeState {
  const state = createInitialRuntimeState();
  state.storyLog = [
    {
      turnId: 'turn_0',
      speaker: 'narrator',
      text: '开场。',
      gameTime: { ...state.time }
    },
    {
      turnId: 'turn_1',
      speaker: 'player',
      text: '先问店员。',
      gameTime: { ...state.time, minute: 5 }
    },
    {
      turnId: 'turn_1',
      speaker: 'narrator',
      text: '【店员】我刚才看见一辆红色的士。',
      gameTime: { ...state.time, minute: 10 }
    }
  ];
  return state;
}

describe('StoryExportModal', () => {
  it('opens with the recommended defaults and explains the current data boundary', () => {
    render(<StoryExportModal state={createState()} onClose={vi.fn()} onDownload={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: '导出剧情' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /当前章节/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Markdown/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '包含时间地点' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '包含角色名' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '包含章节分隔' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '包含玩家行动' })).toBeChecked();
    expect(screen.getByText('将导出 2 条剧情记录')).toBeInTheDocument();
    expect(screen.getByText(/当前版本与“当前存档全部正文”范围一致/)).toBeInTheDocument();
    expect(screen.getByText(/不会把它误写成历史地点/)).toBeInTheDocument();
  });

  it('passes the selected range, format, and optional content to the download', () => {
    const onDownload = vi.fn<(artifact: StoryExportArtifact) => void>();
    render(<StoryExportModal state={createState()} onClose={vi.fn()} onDownload={onDownload} />);

    fireEvent.click(screen.getByRole('radio', { name: /^当前存档全部正文/ }));
    fireEvent.click(screen.getByRole('radio', { name: /纯文本/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: '包含玩家行动' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '包含角色名' }));

    expect(screen.getByText('将导出 2 条剧情记录')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '生成并下载' }));

    expect(onDownload).toHaveBeenCalledTimes(1);
    const artifact = onDownload.mock.calls[0][0];
    expect(artifact.mimeType).toBe('text/plain;charset=utf-8');
    expect(artifact.fileName).toMatch(/当前存档全部正文_\d{4}-\d{2}-\d{2}\.txt$/);
    expect(artifact.content).toContain('开场。');
    expect(artifact.content).toContain('我刚才看见一辆红色的士。');
    expect(artifact.content).not.toContain('先问店员。');
    expect(artifact.content).not.toContain('店员：');
    expect(screen.getByRole('status')).toHaveTextContent('已生成');
  });

  it('closes with Escape', () => {
    const onClose = vi.fn();
    render(<StoryExportModal state={createState()} onClose={onClose} onDownload={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
