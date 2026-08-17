import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandBar } from './CommandBar';

describe('CommandBar', () => {
  it('appends clicked suggested actions instead of replacing the current draft', () => {
    render(
      <CommandBar
        disabled={false}
        onSubmit={vi.fn()}
        suggestedActions={['先守住门口。', '同时呼叫支援。']}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '先守住门口。' }));
    fireEvent.click(screen.getByRole('button', { name: '同时呼叫支援。' }));

    expect(screen.getByLabelText('玩家行动')).toHaveValue('先守住门口。\n同时呼叫支援。');
  });

  it('shows a compact option label while preserving the complete action in the draft', () => {
    const action = '顺水推舟，既然家明已经发话，把手按在腰间枪袋上，盯着黄毛插在兜里的手。';

    render(
      <CommandBar
        disabled={false}
        onSubmit={vi.fn()}
        suggestedActions={[action]}
      />
    );

    const option = screen.getByRole('button', { name: action });
    expect(option).toHaveTextContent('顺水推舟 · 既然家明已经发话');
    expect(option).not.toHaveTextContent(action);
    expect(option).toHaveAttribute('title', action);

    fireEvent.click(option);
    expect(screen.getByLabelText('玩家行动')).toHaveValue(action);
  });

  it('appends drafted panel actions to existing player input', () => {
    const { rerender } = render(<CommandBar disabled={false} onSubmit={vi.fn()} draftActionText={null} />);
    fireEvent.change(screen.getByLabelText('玩家行动'), { target: { value: '先观察后巷。' } });

    rerender(<CommandBar disabled={false} onSubmit={vi.fn()} draftActionText="前往油麻地警署。" draftActionVersion={1} />);

    expect(screen.getByLabelText('玩家行动')).toHaveValue('先观察后巷。\n前往油麻地警署。');
  });

  it('clears an action draft when a different save becomes active', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <CommandBar disabled={false} onSubmit={onSubmit} draftScopeKey="save_a" />
    );
    fireEvent.change(screen.getByLabelText('玩家行动'), {
      target: { value: '只属于存档 A 的行动。' }
    });

    rerender(<CommandBar disabled={false} onSubmit={onSubmit} draftScopeKey="save_b" />);

    expect(screen.getByLabelText('玩家行动')).toHaveValue('');
  });

  it('confirms mobile editor text back into the compact action draft', () => {
    render(<CommandBar disabled={false} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '打开行动编辑器' }));
    fireEvent.change(screen.getByLabelText('编辑行动内容'), { target: { value: '先绕到后门观察。' } });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    expect(screen.queryByRole('dialog', { name: '编辑玩家行动' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('玩家行动')).toHaveValue('先绕到后门观察。');
    expect(screen.getByRole('button', { name: '打开行动编辑器' })).toHaveTextContent('先绕到后门观察。');
  });

  it('cancels mobile editor without replacing the saved action draft', () => {
    render(<CommandBar disabled={false} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('玩家行动'), { target: { value: '保留这段行动。' } });

    fireEvent.click(screen.getByRole('button', { name: '打开行动编辑器' }));
    fireEvent.change(screen.getByLabelText('编辑行动内容'), { target: { value: '不要保存这段。' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByRole('dialog', { name: '编辑玩家行动' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('玩家行动')).toHaveValue('保留这段行动。');
  });

  it('keeps Enter available for multiline input without submitting', () => {
    const onSubmit = vi.fn();
    render(<CommandBar disabled={false} onSubmit={onSubmit} />);
    const input = screen.getByLabelText('玩家行动');

    fireEvent.change(input, { target: { value: '先观察后巷。' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue('先观察后巷。');
  });

  it('submits with Right Ctrl plus Enter', async () => {
    const onSubmit = vi.fn();
    render(<CommandBar disabled={false} onSubmit={onSubmit} />);
    const input = screen.getByLabelText('玩家行动');

    fireEvent.change(input, { target: { value: '先观察后巷。' } });
    fireEvent.keyDown(input, { key: 'Control', code: 'ControlRight' });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', ctrlKey: true });

    expect(onSubmit).toHaveBeenCalledWith('先观察后巷。');
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('shows latest reroll as a compact button beside the action input', () => {
    const onRollbackLatestTurn = vi.fn();

    render(
      <CommandBar
        disabled={false}
        onSubmit={vi.fn()}
        canRollbackLatestTurn
        onRollbackLatestTurn={onRollbackLatestTurn}
      />
    );

    const rerollButton = screen.getByRole('button', { name: '重ROLL上一回合' });

    expect(rerollButton).toHaveTextContent('↺');
    expect(rerollButton).toHaveClass('command-reroll-button');
    fireEvent.click(rerollButton);
    expect(onRollbackLatestTurn).toHaveBeenCalledTimes(1);
  });

  it('keeps latest reroll visible but disabled when no rollback snapshot exists', () => {
    render(
      <CommandBar
        disabled={false}
        onSubmit={vi.fn()}
        canRollbackLatestTurn={false}
        rollbackUnavailableReason="没有可用快照"
        onRollbackLatestTurn={vi.fn()}
      />
    );

    const rerollButton = screen.getByRole('button', { name: '重ROLL上一回合' });

    expect(rerollButton).toBeDisabled();
    expect(rerollButton).toHaveAttribute('title', '没有可用快照');
  });

  it('replaces the submit action with a working abort button during generation', () => {
    const onAbort = vi.fn();

    render(
      <CommandBar
        disabled
        isTurnRunning
        onAbort={onAbort}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText('玩家行动')).toBeDisabled();
    expect(screen.queryByRole('button', { name: '执行行动' })).not.toBeInTheDocument();
    const abortButton = screen.getByRole('button', { name: '中止生成' });
    expect(abortButton).not.toBeDisabled();

    expect(fireEvent.click(abortButton)).toBe(false);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('opens permanent prompt management from the right side of the action row', () => {
    render(
      <CommandBar
        disabled={false}
        onSubmit={vi.fn()}
        suggestedActions={['继续观察。']}
        persistentPrompts={[
          { id: 'persistent-one', content: '对白保持自然。', enabled: true }
        ]}
        onPersistentPromptsChange={vi.fn()}
      />
    );

    const trigger = screen.getByRole('button', { name: '管理永久提示词' });
    expect(trigger).toHaveTextContent('永久提示词');
    expect(trigger).toHaveTextContent('1');

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: '永久提示词' })).toBeInTheDocument();
    expect(screen.getByText('对白保持自然。')).toBeInTheDocument();
  });

  it('keeps permanent prompts behind the compact mobile tools disclosure', () => {
    render(
      <CommandBar
        disabled={false}
        onSubmit={vi.fn()}
        suggestedActions={['继续观察。']}
        persistentPrompts={[
          { id: 'persistent-one', content: '对白保持自然。', enabled: true }
        ]}
        onPersistentPromptsChange={vi.fn()}
      />
    );

    const toolsTrigger = screen.getByRole('button', { name: '展开行动功能' });
    expect(toolsTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu', { name: '行动功能' })).not.toBeInTheDocument();

    fireEvent.click(toolsTrigger);
    expect(toolsTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: '行动功能' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /永久提示词/ }));
    expect(screen.getByRole('dialog', { name: '永久提示词' })).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: '行动功能' })).not.toBeInTheDocument();
  });
});
