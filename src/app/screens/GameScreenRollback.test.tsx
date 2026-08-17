import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TurnSnapshotRepository } from '../../domain/persistence/TurnSnapshotRepository';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { RuntimeState, StoryEntry } from '../../domain/runtime/types';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import type { RunPlayerTurnInput } from '../../domain/turn/TurnEngine';
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
  it('streams provider reasoning and request progress into the optional AI trace panel', async () => {
    const state = createInitialRuntimeState();
    const next = createCompletedTurnState('观察柜台后的动静。');
    const tavernSettings = createDefaultAiSettings().tavern;
    tavernSettings.reasoningOutput = {
      mode: 'provider',
      maxCharacters: 4000,
      showInUi: true
    };
    let resolveTurn!: (nextState: RuntimeState) => void;
    const pendingTurn = new Promise<RuntimeState>((resolve) => {
      resolveTurn = resolve;
    });

    runPlayerTurnMock.mockImplementationOnce(async (input: RunPlayerTurnInput) => {
      input.onStageChange?.('generating_narrative');
      input.onNarratorAttemptStart?.({
        attemptId: 'attempt_main_trace',
        purpose: 'main_turn',
        stream: true,
        requestedMaxTokens: 18_768,
        startedAt: '2026-07-31T01:00:01.000Z'
      });
      input.onReasoningDelta?.('正在核对人物与现场。');
      const completed = await pendingTurn;
      input.onNarrativeDelta?.('正文已经开始返回。');
      input.onNarratorAttempt?.({
        attemptId: 'attempt_main_trace',
        purpose: 'main_turn',
        stream: true,
        requestedMaxTokens: 18_768,
        finishReason: 'stop',
        rawText: '{"narrativeText":"正文已经开始返回。"}',
        parseStatus: 'success',
        reasoningText: '正在核对人物与现场。',
        startedAt: '2026-07-31T01:00:01.000Z',
        finishedAt: '2026-07-31T01:00:10.000Z'
      });
      return completed;
    });

    render(
      <GameScreen
        state={state}
        onStateChange={vi.fn()}
        createNarrator={vi.fn()}
        tavernSettings={tavernSettings}
        onSave={vi.fn()}
        onAutoSave={vi.fn(async () => undefined)}
        onLoad={vi.fn()}
        onSettings={vi.fn()}
        onHome={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '查看 AI 处理轨迹' }));
    fireEvent.change(screen.getByLabelText('玩家行动'), { target: { value: '观察柜台后的动静。' } });
    fireEvent.click(screen.getByRole('button', { name: /执行行动/ }));

    await waitFor(() => {
      const trace = screen.getByRole('region', { name: 'AI 处理轨迹' });
      expect(within(trace).getByText('生成剧情正文')).toBeInTheDocument();
      expect(within(trace).getByText('正在核对人物与现场。')).toBeInTheDocument();
      expect(screen.getByText(/已收到 10 个推理字符，正文尚未开始/)).toBeInTheDocument();
    });

    await act(async () => resolveTurn(next));
    await waitFor(() => expect(screen.getByText(/已返回并通过解析/)).toBeInTheDocument());
  });

  it.each([
    ['接口响应超时（120 秒）。', '接口响应超时'],
    ['429 Too Many Requests', '接口请求受限'],
    ['401 Unauthorized: invalid API key sk-secret-value', 'API 鉴权失败'],
    ['TypeError: Failed to fetch', '网络连接失败'],
    ['请先在设置里配置主剧情 API 和模型。', 'API 配置不完整'],
    ['当前接口类型暂不支持主剧情调用。', '当前接口类型不支持此操作'],
    ['主叙事返回不是合法 JSON。', '接口返回格式无效'],
    ['本地判定叙事校正返回格式无效。', '判定叙事校正未返回有效格式'],
    [
      '判定结构修复失败：仍缺少 writeback.judgementCheckPatches.0.category、writeback.judgementCheckPatches.0.primaryAttribute',
      '判定记录仍缺少必要字段：category、primaryAttribute'
    ],
    ['本地判定缺少可安全结算的结构。', '判定记录缺少必要信息'],
    ['本地判定重试返回 JSON 仍无效。', '判定结果重写仍未返回有效格式'],
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

  it('distinguishes local judgement normalization from an actual outcome narrative repair', async () => {
    const state = createInitialRuntimeState();
    let onStageChange:
      | ((stage: 'normalizing_judgement' | 'regenerating_judgement') => void)
      | undefined;
    let resolveTurn!: (next: RuntimeState) => void;
    runPlayerTurnMock.mockImplementationOnce(
      (input: {
        onStageChange?: (
          stage: 'normalizing_judgement' | 'regenerating_judgement'
        ) => void;
      }) => {
        onStageChange = input.onStageChange;
        return new Promise<RuntimeState>((resolve) => {
          resolveTurn = resolve;
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

    fireEvent.change(screen.getByLabelText('玩家行动'), { target: { value: '尝试制服持刀男子。' } });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));

    act(() => onStageChange?.('normalizing_judgement'));
    expect(
      await screen.findByText('正在按本地规则校正判定记录')
    ).toBeInTheDocument();
    expect(screen.queryByText(/骰点不一致|重新掷骰/)).not.toBeInTheDocument();

    act(() => onStageChange?.('regenerating_judgement'));
    expect(
      await screen.findByText('判定结果与本地结算不一致，正在校正相关正文')
    ).toBeInTheDocument();

    await act(async () => resolveTurn({ ...state, turnCounter: 1 }));
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

  it('shows the historical branch in place while regenerating instead of appending at the current tip', async () => {
    const base = createInitialRuntimeState();
    const firstTurnEntries: StoryEntry[] = [
      { turnId: 'player_1', speaker: 'player', text: '第一回合行动。', gameTime: base.time },
      { turnId: 'turn_1', speaker: 'narrator', text: '第一回合回应。', gameTime: base.time }
    ];
    const beforeSecondTurn: RuntimeState = {
      ...base,
      storyLog: firstTurnEntries,
      turnCounter: 1
    };
    const currentState: RuntimeState = {
      ...base,
      storyLog: [
        ...firstTurnEntries,
        { turnId: 'player_2', speaker: 'player', text: '第二回合原行动。', gameTime: base.time },
        { turnId: 'turn_2', speaker: 'narrator', text: '第二回合旧回应。', gameTime: base.time },
        { turnId: 'player_3', speaker: 'player', text: '第三回合行动。', gameTime: base.time },
        { turnId: 'turn_3', speaker: 'narrator', text: '第三回合回应。', gameTime: base.time }
      ],
      turnCounter: 3
    };
    const snapshot = createTurnRollbackSnapshot({
      beforeState: beforeSecondTurn,
      actionText: '第二回合原行动。',
      createdAt: '2026-07-07T00:00:00.000Z'
    });
    const repository = createRepositoryMock();
    vi.mocked(repository.listTurnSnapshots).mockResolvedValue([
      {
        chainId: 'chain_a',
        turnNumber: 2,
        createdAt: snapshot.createdAt,
        actionText: snapshot.actionText
      }
    ]);
    vi.mocked(repository.loadTurnSnapshot).mockResolvedValue(snapshot);
    let resolveTurn!: (state: RuntimeState) => void;
    runPlayerTurnMock.mockImplementationOnce(
      ({ state: turnState, playerInput }: RunPlayerTurnInput) =>
        new Promise<RuntimeState>((resolve) => {
          resolveTurn = () => resolve({
            ...turnState,
            turnCounter: 2,
            storyLog: [
              ...turnState.storyLog,
              { turnId: 'player_2', speaker: 'player', text: playerInput, gameTime: turnState.time },
              { turnId: 'turn_2', speaker: 'narrator', text: '第二回合新回应。', gameTime: turnState.time }
            ]
          });
        })
    );
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

    expect(screen.getByText('第三回合回应。')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '重发原行动' }));

    await waitFor(() => expect(runPlayerTurnMock).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({ turnCounter: 1 }),
      playerInput: '第二回合原行动。'
    })));
    expect(screen.queryByText('第二回合旧回应。')).not.toBeInTheDocument();
    expect(screen.queryByText('第三回合行动。')).not.toBeInTheDocument();
    expect(screen.queryByText('第三回合回应。')).not.toBeInTheDocument();
    expect(screen.getByText('第二回合原行动。')).toBeInTheDocument();
    expect(screen.getByText('已发送 · 等待回应')).toBeInTheDocument();

    await act(async () => resolveTurn(beforeSecondTurn));
    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({
      turnCounter: 2,
      storyLog: expect.arrayContaining([
        expect.objectContaining({ text: '第二回合新回应。' })
      ])
    })));
    const regenerated = onStateChange.mock.calls.at(-1)?.[0] as RuntimeState;
    expect(regenerated.storyLog.some((entry) => entry.text === '第三回合回应。')).toBe(false);
    expect(repository.deleteTurnSnapshotsAfter).toHaveBeenCalledWith('chain_a', 2);
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

  it('exports the exact failed main-turn request instead of leaving the trace unfinished', async () => {
    const state = createInitialRuntimeState();
    runPlayerTurnMock.mockImplementationOnce(
      async (input: RunPlayerTurnInput) => {
        const startedAt = '2026-07-29T19:10:00.000Z';
        input.onStageChange?.('generating_narrative');
        input.onJudgementRecoveryTrace?.({
          requestId: 'judgement_turn_0001',
          turnId: 'turn_0001',
          startedAt,
          terminalStatus: 'running',
          presetRoll: 51,
          persisted: false,
          rawJudgementPatches: [],
          stages: []
        });
        input.onNarratorAttemptStart?.({
          attemptId: 'attempt_main_1',
          purpose: 'main_turn',
          stream: true,
          requestedMaxTokens: 65_536,
          startedAt
        });
        input.onNarratorAttempt?.({
          attemptId: 'attempt_main_1',
          purpose: 'main_turn',
          stream: true,
          requestedMaxTokens: 65_536,
          finishReason: 'unknown',
          rawText: '',
          parseStatus: 'empty',
          errorMessage: 'Failed to fetch',
          startedAt,
          finishedAt: '2026-07-29T19:10:10.000Z'
        });
        throw new Error('Failed to fetch');
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

    fireEvent.change(screen.getByLabelText('玩家行动'), {
      target: { value: '我打开房门。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '执行行动' }));

    expect(
      await screen.findByText(
        '行动未完成：网络连接失败。行动内容已放回输入框。'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '诊断导出' }));

    const diagnostic = (
      screen.getByLabelText('诊断导出原文') as HTMLTextAreaElement
    ).value;
    expect(diagnostic).toContain('status=failed（失败）');
    expect(diagnostic).toContain('error=Failed to fetch');
    expect(diagnostic).toContain('请求状态：失败');
    expect(diagnostic).toContain('失败分类：browser_transport_or_cors');
    expect(diagnostic).toContain('terminalStatus=failed');
    expect(diagnostic).not.toContain(
      'finishedAt=未完成\nterminalStatus=failed'
    );
  });
});
