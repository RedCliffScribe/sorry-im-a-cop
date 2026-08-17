import { useEffect, useState } from 'react';
import type {
  NarratorAttemptRecord,
  NarratorAttemptStartRecord,
  NarratorRequestPurpose
} from '../../domain/narrator/NarratorClient';
import type { TurnExecutionDiagnostic } from '../diagnostics/createNarrativeDiagnostic';

interface AiProcessTracePanelProps {
  turnNumber: number;
  scopeLabel?: string;
  execution: TurnExecutionDiagnostic | null;
  stageLabels: Readonly<Record<string, string>>;
  attemptStarts: NarratorAttemptStartRecord[];
  attempts: NarratorAttemptRecord[];
  streamingCharacterCount: number;
  reasoningText: string;
  reasoningEnabled: boolean;
  safeError?: string | null;
  onClose: () => void;
}

const requestPurposeLabels: Record<NarratorRequestPurpose, string> = {
  opening_blueprint: '开局蓝图',
  opening_initialization: '开局初始化',
  opening_json_repair: '开局格式修复',
  opening_compact_retry: '开局紧凑重试',
  opening_blueprint_field_repair: '开局蓝图字段修复',
  opening_cast: '开局人物阵容',
  opening_cast_field_repair: '开局人物阵容修复',
  opening_actor_enrichment: '开局人物档案',
  opening_actor_enrichment_repair: '开局人物档案修复',
  opening_narrative: '开局正文',
  opening_narrative_trace_repair: '开局正文轨迹修复',
  opening_runtime: '开局运行态',
  opening_runtime_domain_repair: '开局运行态修复',
  main_turn: '剧情正文',
  main_turn_judgement_preflight: '判定预检',
  main_turn_judgement_preflight_repair: '判定预检修复',
  main_turn_judgement_retry: '判定结果校正',
  main_turn_judgement_structure_repair: '判定结构修复',
  main_turn_judgement_narrative_repair: '判定正文校正',
  main_turn_actor_writeback_repair: '人物建档修复',
  main_turn_case_lead_repair: '案件主办者修复',
  main_turn_json_repair: '正文格式修复',
  save_actor_writeback_repair: '存档人物修复',
  auxiliary: '辅助规划'
};

function formatElapsed(startedAt: string, finishedAt?: string): string {
  const start = Date.parse(startedAt);
  const finish = finishedAt ? Date.parse(finishedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) return '';
  const seconds = Math.max(0, Math.round((finish - start) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function formatAttemptResult(attempt: NarratorAttemptRecord): string {
  if (attempt.parseStatus === 'success') {
    return attempt.localJsonRepairApplied ? '已返回，本地修复 JSON 后通过' : '已返回并通过解析';
  }
  if (attempt.parseStatus === 'truncated' || attempt.finishReason === 'length') return '输出被截断';
  if (attempt.parseStatus === 'empty') return '未收到可解析内容';
  if (attempt.parseStatus === 'schema_failed') return '接口已有返回，但结构不符合游戏合同';
  return '接口已有返回，但内容不是有效 JSON';
}

function BrainTraceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 4.5a3 3 0 0 0-5 2.2 3.2 3.2 0 0 0-1 5.8 3.2 3.2 0 0 0 2.2 5.2A3 3 0 0 0 11 19.5v-15a3 3 0 0 0-1.5 0Zm5 0a3 3 0 0 1 5 2.2 3.2 3.2 0 0 1 1 5.8 3.2 3.2 0 0 1-2.2 5.2A3 3 0 0 1 13 19.5v-15a3 3 0 0 1 1.5 0Z" />
      <path d="M7 8.5c1.5 0 2.5 1 2.5 2.5M17 8.5c-1.5 0-2.5 1-2.5 2.5M7 15c1.5 0 2.5-1 2.5-2.5M17 15c-1.5 0-2.5-1-2.5-2.5" />
    </svg>
  );
}

export function AiProcessTraceButton({ open, active, onClick }: {
  open: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="ai-process-trace-button"
      type="button"
      aria-label={open ? '收起 AI 处理轨迹' : '查看 AI 处理轨迹'}
      aria-expanded={open}
      aria-controls="ai-process-trace-panel"
      data-active={active || undefined}
      onClick={onClick}
    >
      <BrainTraceIcon />
    </button>
  );
}

export function AiProcessTracePanel({
  turnNumber,
  scopeLabel,
  execution,
  stageLabels,
  attemptStarts,
  attempts,
  streamingCharacterCount,
  reasoningText,
  reasoningEnabled,
  safeError,
  onClose
}: AiProcessTracePanelProps) {
  const [, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (execution?.status !== 'running') return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [execution?.status]);
  const completedAttemptIds = new Set(attempts.map((attempt) => attempt.attemptId));
  const pendingAttempts = attemptStarts.filter((attempt) => !completedAttemptIds.has(attempt.attemptId));
  const allAttempts = [
    ...attempts.map((attempt) => ({ ...attempt, pending: false as const })),
    ...pendingAttempts.map((attempt) => ({ ...attempt, pending: true as const }))
  ].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const executionStatus = execution?.status ?? 'idle';
  const statusLabel = executionStatus === 'running'
    ? '处理中'
    : executionStatus === 'succeeded'
      ? '已完成'
      : executionStatus === 'failed'
        ? '失败'
        : executionStatus === 'aborted'
          ? '已中止'
          : '等待下一回合';
  const stages = execution?.stages?.length
    ? execution.stages
    : execution
      ? [{ stage: execution.stage, startedAt: execution.startedAt, finishedAt: execution.finishedAt }]
      : [];
  const turnIdMatch = execution?.turnId.match(/turn_(\d+)/);
  const displayedTurnNumber = turnIdMatch ? Number(turnIdMatch[1]) : turnNumber;

  return (
    <section
      id="ai-process-trace-panel"
      className="ai-process-trace-panel"
      aria-label="AI 处理轨迹"
    >
      <header className="ai-process-trace-header">
        <div>
          <span className="ai-process-trace-eyebrow"><BrainTraceIcon /> AI 处理轨迹</span>
          <strong>{scopeLabel ?? `第 ${displayedTurnNumber} 回合`} · {statusLabel}</strong>
        </div>
        <button type="button" onClick={onClose}>关闭</button>
      </header>

      <div className="ai-process-trace-body">
        <p className="ai-process-trace-note">
          这里显示真实请求阶段与服务商主动返回的推理内容；系统不展示完整提示词或密钥。推理摘要可能含有尚未揭示的剧情信息，请按需查看。
        </p>

        <section className="ai-process-trace-section" aria-labelledby="ai-process-stage-heading">
          <h3 id="ai-process-stage-heading">处理阶段</h3>
          {stages.length ? (
            <ol className="ai-process-stage-list">
              {stages.map((stage, index) => {
                const isLast = index === stages.length - 1;
                const stageFinishedAt = stage.finishedAt ?? (
                  isLast && executionStatus !== 'running' ? execution?.finishedAt : undefined
                );
                const stageStatus = !isLast || stage.finishedAt
                  ? 'completed'
                  : executionStatus === 'failed'
                    ? 'failed'
                    : executionStatus === 'aborted'
                      ? 'aborted'
                      : 'running';
                return (
                  <li key={`${stage.stage}-${stage.startedAt}-${index}`} data-status={stageStatus}>
                    <span className="ai-process-stage-dot" aria-hidden="true" />
                    <div>
                      <strong>{stageLabels[stage.stage] ?? stage.stage}</strong>
                      <small>
                        {stageStatus === 'running' ? '正在执行' : stageStatus === 'failed' ? '停在这里' : stageStatus === 'aborted' ? '在此中止' : '已完成'}
                        {formatElapsed(stage.startedAt, stageFinishedAt) ? ` · ${formatElapsed(stage.startedAt, stageFinishedAt)}` : ''}
                      </small>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : <p className="muted">尚未执行普通剧情回合。</p>}
        </section>

        <section className="ai-process-trace-section" aria-labelledby="ai-process-request-heading">
          <h3 id="ai-process-request-heading">接口请求</h3>
          {allAttempts.length ? (
            <ol className="ai-process-attempt-list">
              {allAttempts.map((attempt, index) => {
                const elapsed = formatElapsed(attempt.startedAt, 'finishedAt' in attempt ? attempt.finishedAt : undefined);
                const rawLength = 'rawText' in attempt ? attempt.rawText.length : 0;
                const isActiveNarrative = attempt.pending && attempt.purpose === 'main_turn';
                return (
                  <li key={attempt.attemptId} data-status={attempt.pending ? 'running' : attempt.parseStatus === 'success' ? 'completed' : 'failed'}>
                    <div>
                      <strong>{index + 1}. {requestPurposeLabels[attempt.purpose]}</strong>
                      <small>{attempt.stream ? '流式' : '非流式'}{elapsed ? ` · ${elapsed}` : ''}</small>
                    </div>
                    <p>
                      {attempt.pending
                        ? isActiveNarrative && streamingCharacterCount > 0
                          ? `已收到 ${streamingCharacterCount} 个正文字符，仍在生成。`
                          : reasoningText
                            ? `已收到 ${reasoningText.length} 个推理字符，正文尚未开始。`
                            : '请求已提交，尚未收到可展示的数据。'
                        : `${formatAttemptResult(attempt)} · 原始响应 ${rawLength} 字符`}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : executionStatus === 'running' ? (
            <p className="muted">系统正在整理本地上下文，尚未向接口提交请求。</p>
          ) : (
            <p className="muted">本次界面会话尚无接口请求记录。</p>
          )}
          {safeError ? <p className="ai-process-trace-error">{safeError}</p> : null}
        </section>

        <section className="ai-process-trace-section" aria-labelledby="ai-process-reasoning-heading">
          <h3 id="ai-process-reasoning-heading">模型返回的思路摘要</h3>
          {reasoningText ? (
            <pre aria-label="模型返回的思路摘要">{reasoningText}</pre>
          ) : reasoningEnabled ? (
            <p className="muted">当前线路尚未返回可展示的推理内容；这不等于模型没有工作。</p>
          ) : (
            <p className="muted">当前未启用推理摘要接收。处理阶段和接口状态仍会正常显示。</p>
          )}
        </section>
      </div>
    </section>
  );
}
