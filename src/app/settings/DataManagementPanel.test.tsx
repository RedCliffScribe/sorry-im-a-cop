import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import { DataManagementPanel } from './DataManagementPanel';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('DataManagementPanel', () => {
  it('requires two explicit confirmations before clearing one data category', async () => {
    const onClear = vi.fn().mockResolvedValue(undefined);
    render(
      <DataManagementPanel
        settings={createDefaultAiSettings()}
        saves={[]}
        hasActiveGame={false}
        onClear={onClear}
      />
    );

    const apiCard = screen.getByRole('heading', { name: 'API 与模型配置' }).closest('article');
    expect(apiCard).not.toBeNull();
    fireEvent.click(within(apiCard as HTMLElement).getByRole('button', { name: '清空' }));

    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('第 1 次确认 · 共 2 次')).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: '继续，进入第二次确认' }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('第 2 次确认 · 共 2 次')).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: '确认清空：API 与模型配置' }));

    await waitFor(() => expect(onClear).toHaveBeenCalledWith('apiSettings'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('API 与模型配置已清空。');
  });

  it('cancels safely at the second confirmation', () => {
    const onClear = vi.fn().mockResolvedValue(undefined);
    render(
      <DataManagementPanel
        settings={createDefaultAiSettings()}
        saves={[]}
        hasActiveGame={false}
        onClear={onClear}
      />
    );

    const originCard = screen.getByRole('heading', { name: '自定义开局背景' }).closest('article');
    fireEvent.click(within(originCard as HTMLElement).getByRole('button', { name: '清空' }));
    fireEvent.click(screen.getByRole('button', { name: '继续，进入第二次确认' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('states the precise API preservation boundary for the partial full reset', async () => {
    const onClear = vi.fn().mockResolvedValue(undefined);
    render(
      <DataManagementPanel
        settings={createDefaultAiSettings()}
        saves={[]}
        hasActiveGame={false}
        onClear={onClear}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '清空全部数据（保留 API）' }));
    expect(screen.getByText('保留：主剧情及文生图 API 地址与密钥、模型列表、ComfyUI 工作流、主剧情模型、辅助功能模型路由。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续，进入第二次确认' }));
    fireEvent.click(screen.getByRole('button', { name: '确认清空：清空全部数据（保留 API 设置）' }));

    await waitFor(() => expect(onClear).toHaveBeenCalledWith('allExceptApi'));
  });

  it('states that prompt clearing includes permanent prompts', () => {
    const settings = createDefaultAiSettings();
    settings.prompts.persistentPrompts = [
      { id: 'persistent-one', content: '不要替玩家作决定。', enabled: true }
    ];

    render(
      <DataManagementPanel
        settings={settings}
        saves={[]}
        hasActiveGame={false}
        onClear={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const promptCard = screen
      .getByRole('heading', { name: '提示词修改与永久提示词' })
      .closest('article');
    expect(promptCard).not.toBeNull();
    expect(within(promptCard as HTMLElement).getByText(/1 条永久提示词/)).toBeInTheDocument();
    fireEvent.click(within(promptCard as HTMLElement).getByRole('button', { name: '清空' }));
    expect(screen.getByText('全部剧情及图片自定义提示词修改和永久提示词将被删除。')).toBeInTheDocument();
  });
});
