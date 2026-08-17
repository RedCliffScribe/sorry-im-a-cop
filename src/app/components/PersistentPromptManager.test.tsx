import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PersistentPromptEntry } from '../../domain/settings/types';
import { PersistentPromptManager } from './PersistentPromptManager';

function StatefulManager({
  initialEntries = [],
  onEntriesChange = vi.fn()
}: {
  initialEntries?: PersistentPromptEntry[];
  onEntriesChange?: (entries: PersistentPromptEntry[]) => void;
}) {
  const [entries, setEntries] = useState(initialEntries);
  return (
    <PersistentPromptManager
      entries={entries}
      onChange={(nextEntries) => {
        setEntries(nextEntries);
        onEntriesChange(nextEntries);
      }}
      onClose={vi.fn()}
    />
  );
}

describe('PersistentPromptManager', () => {
  it('adds a new prompt as enabled and renders it as a list entry', () => {
    const onEntriesChange = vi.fn();
    render(<StatefulManager onEntriesChange={onEntriesChange} />);

    fireEvent.change(screen.getByLabelText('新增永久提示词'), {
      target: { value: '不要替玩家接受邀约。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '新增' }));

    expect(screen.getByText('不要替玩家接受邀约。')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '启用永久提示词：不要替玩家接受邀约。' })).toBeChecked();
    expect(onEntriesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        content: '不要替玩家接受邀约。',
        enabled: true
      })
    ]);
  });

  it('allows each prompt to be disabled and deleted independently', () => {
    const onEntriesChange = vi.fn();
    render(
      <StatefulManager
        initialEntries={[
          { id: 'prompt-one', content: '对白保持自然。', enabled: true },
          { id: 'prompt-two', content: '场景描写简洁。', enabled: true }
        ]}
        onEntriesChange={onEntriesChange}
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '启用永久提示词：对白保持自然。' }));
    expect(onEntriesChange).toHaveBeenLastCalledWith([
      { id: 'prompt-one', content: '对白保持自然。', enabled: false },
      { id: 'prompt-two', content: '场景描写简洁。', enabled: true }
    ]);

    fireEvent.click(screen.getByRole('button', { name: '删除永久提示词：场景描写简洁。' }));
    expect(screen.queryByText('场景描写简洁。')).not.toBeInTheDocument();
  });

  it('explains global persistence and exposes a dedicated bounded list region', () => {
    render(
      <StatefulManager
        initialEntries={[
          { id: 'prompt-one', content: '对白保持自然。', enabled: true }
        ]}
      />
    );

    expect(screen.getByText(/保存在当前浏览器的全局设置中/)).toBeInTheDocument();
    expect(screen.getByLabelText('永久提示词列表')).toHaveClass('persistent-prompt-list');
  });
});
