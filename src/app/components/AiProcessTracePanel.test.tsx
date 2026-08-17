import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NarratorAttemptRecord } from '../../domain/narrator/NarratorClient';
import type { TurnExecutionDiagnostic } from '../diagnostics/createNarrativeDiagnostic';
import { AiProcessTraceButton, AiProcessTracePanel } from './AiProcessTracePanel';

const execution: TurnExecutionDiagnostic = {
  requestId: 'turn_request_4',
  turnId: 'turn_0004',
  status: 'running',
  stage: 'generating_narrative',
  startedAt: '2026-07-31T01:00:00.000Z',
  stages: [
    {
      stage: 'preparing_turn',
      startedAt: '2026-07-31T01:00:00.000Z',
      finishedAt: '2026-07-31T01:00:01.000Z'
    },
    {
      stage: 'generating_narrative',
      startedAt: '2026-07-31T01:00:01.000Z'
    }
  ]
};

describe('AiProcessTracePanel', () => {
  it('shows a zero-byte pending request separately from completed local stages', () => {
    render(
      <AiProcessTracePanel
        turnNumber={3}
        execution={execution}
        stageLabels={{ preparing_turn: '整理回合上下文', generating_narrative: '生成剧情正文' }}
        attemptStarts={[{
          attemptId: 'attempt_main',
          purpose: 'main_turn',
          stream: true,
          requestedMaxTokens: 18_768,
          startedAt: '2026-07-31T01:00:01.000Z'
        }]}
        attempts={[]}
        streamingCharacterCount={0}
        reasoningText=""
        reasoningEnabled={false}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('第 4 回合 · 处理中')).toBeInTheDocument();
    expect(screen.getByText('整理回合上下文')).toBeInTheDocument();
    expect(screen.getByText('生成剧情正文')).toBeInTheDocument();
    expect(screen.getByText('请求已提交，尚未收到可展示的数据。')).toBeInTheDocument();
    expect(screen.getByText(/当前未启用推理摘要接收/)).toBeInTheDocument();
  });

  it('streams provider-returned reasoning without exposing raw provider errors', () => {
    const failedAttempt: NarratorAttemptRecord = {
      attemptId: 'attempt_main',
      purpose: 'main_turn',
      stream: true,
      requestedMaxTokens: 18_768,
      finishReason: 'unknown',
      rawText: '',
      parseStatus: 'empty',
      errorMessage: '401 invalid sk-private-secret',
      startedAt: '2026-07-31T01:00:01.000Z',
      finishedAt: '2026-07-31T01:00:11.000Z'
    };

    render(
      <AiProcessTracePanel
        turnNumber={3}
        execution={{ ...execution, status: 'failed', finishedAt: failedAttempt.finishedAt }}
        stageLabels={{ preparing_turn: '整理回合上下文', generating_narrative: '生成剧情正文' }}
        attemptStarts={[]}
        attempts={[failedAttempt]}
        streamingCharacterCount={0}
        reasoningText="正在核对场景与人物。"
        reasoningEnabled
        safeError="行动未完成：网络连接失败。"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('正在核对场景与人物。')).toBeInTheDocument();
    expect(screen.getByText('未收到可解析内容 · 原始响应 0 字符')).toBeInTheDocument();
    expect(screen.getByText('行动未完成：网络连接失败。')).toBeInTheDocument();
    expect(screen.queryByText(/sk-private-secret/)).not.toBeInTheDocument();
  });

  it('provides an accessible brain button that is closed by default', () => {
    const onClick = vi.fn();
    render(<AiProcessTraceButton open={false} active onClick={onClick} />);

    const button = screen.getByRole('button', { name: '查看 AI 处理轨迹' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
