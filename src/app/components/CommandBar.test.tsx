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

  it('appends drafted panel actions to existing player input', () => {
    const { rerender } = render(<CommandBar disabled={false} onSubmit={vi.fn()} draftActionText={null} />);
    fireEvent.change(screen.getByLabelText('玩家行动'), { target: { value: '先观察后巷。' } });

    rerender(<CommandBar disabled={false} onSubmit={vi.fn()} draftActionText="前往油麻地警署。" draftActionVersion={1} />);

    expect(screen.getByLabelText('玩家行动')).toHaveValue('先观察后巷。\n前往油麻地警署。');
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
});
