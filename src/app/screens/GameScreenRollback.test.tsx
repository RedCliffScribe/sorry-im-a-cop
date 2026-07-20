import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TurnSnapshotRepository } from '../../domain/persistence/TurnSnapshotRepository';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { RuntimeState, StoryEntry } from '../../domain/runtime/types';
import { createTurnRollbackSnapshot } from '../../domain/turn/TurnRollback';
import { GameScreen, getPlayerFacingTurnFailureReason } from './GameScreen';

const runPlayerTurnMock = vi.hoisted(() => vi.fn());

vi.mock('../../domain/turn/TurnEngine', () => ({
  runPlayerTurn: runPlayerTurnMock
}));

function createRepositoryMock(): TurnSnapshotRepository {
  return {
    saveTurnSnapshot: vi.fn(async () => undefined),
    loadTurnSnapshot: vi.fn(async () => null),
    listTurnSnapshots: vi.fn(async () => []),
    deleteTurnSnapshotsAfter: vi.fn(async () => undefined),
    clearTurnSnapshotsForChain: vi.fn(async () => undefined)
  };
}

function createCompletedTurnState(actionText = '先查后巷。'): RuntimeState {
  const state = createInitialRuntimeState();
  const playerEntry: StoryEntry = {
    turnId: 'player_1',
    speaker: 'player',
    text: actionText,
    gameTime: state.time
  };
  const narratorEntry: StoryEntry = {
    turnId: 'turn_1',
    speaker: 'narrator',
    text: '后巷没有明显血迹。',
    gameTime: state.time
  };
  return {
    ...state,
    storyLog: [playerEntry, narratorEntry],
    turnCounter: 1
  };
}

describe('GameScreen rollback chain', () => {
  it.each([
    ['接口响应超时（120 秒）。', '接口响应超时'],
    ['429 Too Many Requests', '接口请求受限'],
    ['401 Unauthorized: invalid API key sk-secret-value', 'API 鉴权失败'],
    ['TypeError: Failed to fetch', '网络连接失败'],
    ['请先在设置里配置主剧情 API 和模型。', 'API 配置不完整'],
    ['当前接口类型暂不支持主剧情调用。', '当前接口类型不支持此操作'],
    ['主叙事返回不是合法 JSON。', '接口返回格式无效'],
    ['unexpected internal failure', '系统处理异常']
  ])('turns technical failure "%s" into the safe reason "%s"', (message, expected) => {
    const reason = getPlayerFacingTurnFailureReason(new Error(message));

    expect(reason).toBe(expected);
    expect(reason).not.toContain('sk-secret-value');
  });

  it('shows the sent action and real stage immediately, then aborts and restores the draft', async () => {
    const state = createInitialRuntimeState();
    let receivedSignal: AbortSignal | undefined;
    runPlayerTurnMock.mockImplementationOnce(
      (input: { signal: AbortSignal; onStageChange?: (stage: 'simulating_npcs') => void }) => {
        receivedSignal = input.signal;
        input.onStageChange?.('simulating_npcs');
        return new Promise<RuntimeState>((_resolve, reject) => {
          input.signal.addEventListener(
            'abort',
            () => reject(input.signal.reason ?? new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        });
      }
    );

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('玩家行动'), { target: { value: '我先封锁后巷，再呼叫支援。' } });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));

    expect(await screen.findByText('我先封锁后巷，再呼叫支援。')).toBeInTheDocument();
    expect(screen.getByText('已发送 · 等待回应')).toBeInTheDocument();
    expect(await screen.findByText('模拟相关 NPC')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '中止生成' }));

    await waitFor(() => {
      expect(screen.getByText('本回合已中止，行动内容已放回输入框。')).toBeInTheDocument();
      expect(screen.getByLabelText('玩家行动')).toHaveValue('我先封锁后巷，再呼叫支援。');
      expect(screen.queryByText('模拟相关 NPC')).not.toBeInTheDocument();
    });
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('disables save, load, settings, and home navigation while a turn is running', async () => {
    const state = createInitialRuntimeState();
    let resolveTurn!: (next: RuntimeState) => void;
    runPlayerTurnMock.mockReturnValueOnce(
      new Promise<RuntimeState>((resolve) => {
        resolveTurn = resolve;
      })
    );

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('玩家行动'), { target: { value: '继续巡逻。' } });
    fireEvent.click(screen.getByRole('button', { name: /执行行动/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '← 返回首页' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '保存进度' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '读取进度' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '设置' })).toBeDisabled();
    });

    resolveTurn({ ...state, turnCounter: 1 });
    await waitFor(() => expect(screen.getByRole('button', { name: '读取进度' })).not.toBeDisabled());
  });

  it('rolls back the latest turn and puts the old action back into the command input', async () => {
    const beforeState = createInitialRuntimeState();
    const snapshot = createTurnRollbackSnapshot({
      beforeState,
      actionText: '先查后巷。',
      createdAt: '2026-07-07T00:00:00.000Z'
    });
    const repository = createRepositoryMock();
    vi.mocked(repository.listTurnSnapshots).mockResolvedValue([
      {
        chainId: 'chain_a',
        turnNumber: 1,
        createdAt: snapshot.createdAt,
        actionText: snapshot.actionText
      }
    ]);
    vi.mocked(repository.loadTurnSnapshot).mockResolvedValue(snapshot);
    const onStateChange = vi.fn();

    render(
      <GameScreen
        state={createCompletedTurnState()}
        onStateChange={onStateChange}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
        rollbackChainId="chain_a"
        turnSnapshotRepository={repository}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '重ROLL上一回合' }));

    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ turnCounter: 0 })));
    expect(repository.deleteTurnSnapshotsAfter).toHaveBeenCalledWith('chain_a', 0);
    await waitFor(() => expect(screen.getByLabelText('玩家行动')).toHaveValue('先查后巷。'));
  });

  it('restores a past action snapshot before sending the edited action', async () => {
    const beforeState = createInitialRuntimeState();
    const snapshot = createTurnRollbackSnapshot({
      beforeState,
      actionText: '先查后巷。',
      createdAt: '2026-07-07T00:00:00.000Z'
    });
    const repository = createRepositoryMock();
    vi.mocked(repository.listTurnSnapshots).mockResolvedValue([
      {
        chainId: 'chain_a',
        turnNumber: 1,
        createdAt: snapshot.createdAt,
        actionText: snapshot.actionText
      }
    ]);
    vi.mocked(repository.loadTurnSnapshot).mockResolvedValue(snapshot);
    runPlayerTurnMock.mockImplementation(async ({ state, playerInput }) => ({
      ...state,
      turnCounter: 1,
      storyLog: [
        ...state.storyLog,
        {
          turnId: 'turn_1',
          speaker: 'narrator',
          text: `结果：${playerInput}`,
          gameTime: state.time
        }
      ]
    }));

    render(
      <GameScreen
        state={createCompletedTurnState()}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
        rollbackChainId="chain_a"
        turnSnapshotRepository={repository}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '编辑重发' }));
    fireEvent.change(screen.getByLabelText('编辑第 1 回合行动'), { target: { value: '改为先问店员。' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(runPlayerTurnMock).toHaveBeenCalledWith(expect.objectContaining({ playerInput: '改为先问店员。' })));
    expect(repository.deleteTurnSnapshotsAfter).toHaveBeenCalledWith('chain_a', 1);
    expect(repository.saveTurnSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 'chain_a',
        turnNumber: 1,
        maxDepth: 20
      })
    );
    expect(vi.mocked(repository.saveTurnSnapshot).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repository.deleteTurnSnapshotsAfter).mock.invocationCallOrder[0]
    );
  });

  it('keeps the original state and rollback branch when an edited resend fails', async () => {
    const beforeState = createInitialRuntimeState();
    const currentState = createCompletedTurnState();
    const snapshot = createTurnRollbackSnapshot({
      beforeState,
      actionText: '先查后巷。',
      createdAt: '2026-07-07T00:00:00.000Z'
    });
    const repository = createRepositoryMock();
    vi.mocked(repository.listTurnSnapshots).mockResolvedValue([
      {
        chainId: 'chain_a',
        turnNumber: 1,
        createdAt: snapshot.createdAt,
        actionText: snapshot.actionText
      }
    ]);
    vi.mocked(repository.loadTurnSnapshot).mockResolvedValue(snapshot);
    runPlayerTurnMock.mockRejectedValueOnce(new Error('turn failed'));
    const onStateChange = vi.fn();

    render(
      <GameScreen
        state={currentState}
        onStateChange={onStateChange}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
        rollbackChainId="chain_a"
        turnSnapshotRepository={repository}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '编辑重发' }));
    fireEvent.change(screen.getByLabelText('编辑第 1 回合行动'), { target: { value: '改为先问店员。' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(screen.getByText('行动未完成：系统处理异常。行动内容已放回输入框。')).toBeInTheDocument()
    );
    expect(repository.deleteTurnSnapshotsAfter).not.toHaveBeenCalled();
    expect(repository.saveTurnSnapshot).not.toHaveBeenCalled();
    expect(onStateChange).toHaveBeenLastCalledWith(currentState);
  });

  it('passes the untouched pre-turn story log into the turn engine', async () => {
    const state = createInitialRuntimeState();
    const onStateChange = vi.fn();
    runPlayerTurnMock.mockImplementationOnce(async ({ state: turnState, playerInput }) => ({
      ...turnState,
      turnCounter: 1,
      storyLog: [
        ...turnState.storyLog,
        {
          turnId: 'turn_1',
          speaker: 'player',
          text: playerInput,
          gameTime: turnState.time
        },
        {
          turnId: 'turn_1',
          speaker: 'narrator',
          text: '茶餐厅里仍有几个空位。',
          gameTime: turnState.time
        }
      ]
    }));

    render(
      <GameScreen
        state={state}
        onStateChange={onStateChange}
        createNarrator={vi.fn()}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('玩家行动'), { target: { value: '走进茶餐厅。' } });
    fireEvent.click(screen.getByRole('button', { name: /执行行动/ }));

    await waitFor(() => expect(runPlayerTurnMock).toHaveBeenCalled());
    const turnState = runPlayerTurnMock.mock.calls.at(-1)?.[0]?.state as RuntimeState;
    expect(turnState.storyLog).toEqual(state.storyLog);
    await waitFor(() => {
      const completed = onStateChange.mock.calls.at(-1)?.[0] as RuntimeState;
      expect(completed.storyLog.filter((entry) => entry.speaker === 'player')).toHaveLength(1);
    });
  });
});
