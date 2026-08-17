import { useMemo, useState } from 'react';
import type {
  CustomContentProcessingTask,
  CustomSourceAggregationLevel
} from '../../domain/customContent/assetTypes';
import type {
  CreateCustomSourceAggregationTaskOptions,
  ReauthorizeCustomSourceAggregationTaskOptions
} from '../../domain/customContent/sourceAggregationTasks';
import {
  requiresApiKey,
  supportsAuxiliaryRouting
} from '../../domain/settings/apiCapabilities';
import type { ApiProfile } from '../../domain/settings/types';
import type { LongTextSourceLibraryEntry } from './longTextSourceLibrary';

interface LongTextAggregationControlsProps {
  entry: LongTextSourceLibraryEntry;
  profiles: ApiProfile[];
  defaultProfileId: string;
  defaultModel: string;
  onCreateTask?: (
    options: CreateCustomSourceAggregationTaskOptions
  ) => Promise<void>;
  onRunTask?: (taskId: string) => Promise<void>;
  onPauseTask?: (taskId: string) => Promise<void>;
  onResumeTask?: (taskId: string) => Promise<void>;
  onCancelTask?: (taskId: string) => Promise<void>;
  onRetryTask?: (taskId: string) => Promise<void>;
  onReauthorizeTask?: (
    taskId: string,
    options: ReauthorizeCustomSourceAggregationTaskOptions
  ) => Promise<void>;
}

interface AggregationCardProps extends LongTextAggregationControlsProps {
  level: CustomSourceAggregationLevel;
}

function taskFor(
  entry: LongTextSourceLibraryEntry,
  kind: CustomContentProcessingTask['taskKind']
): CustomContentProcessingTask | undefined {
  return entry.tasks.find((task) => task.taskKind === kind);
}

function ready(profile: ApiProfile | undefined, model: string): boolean {
  return Boolean(
    profile &&
      profile.baseUrl.trim() &&
      model.trim() &&
      supportsAuxiliaryRouting(profile.interfaceType) &&
      (!requiresApiKey(profile.interfaceType) || profile.apiKey.trim())
  );
}

function taskStatus(task: CustomContentProcessingTask): string {
  const labels = {
    queued: '已授权，等待开始',
    running: '正在聚合',
    paused: '已暂停',
    failed: '失败，可重试',
    completed: '已完成，等待人工审核',
    cancelled: '已取消'
  };
  return labels[task.status];
}

function AggregationCard({
  level,
  entry,
  profiles,
  defaultProfileId,
  defaultModel,
  onCreateTask,
  onRunTask,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onRetryTask,
  onReauthorizeTask
}: AggregationCardProps) {
  const taskKind =
    level === 'chapter'
      ? 'aggregate_chapter'
      : level === 'stage'
        ? 'aggregate_stage'
        : 'aggregate_arc';
  const lowerKind =
    level === 'chapter'
      ? 'extract_local'
      : level === 'stage'
        ? 'aggregate_chapter'
        : 'aggregate_stage';
  const task = taskFor(entry, taskKind);
  const lowerTask = taskFor(entry, lowerKind);
  const [editing, setEditing] = useState(false);
  const [profileId, setProfileId] = useState(
    task?.apiProfileId ?? defaultProfileId
  );
  const [model, setModel] = useState(task?.model ?? defaultModel);
  const [authorizedTokens, setAuthorizedTokens] = useState(
    String(
      task?.aiProcessing?.authorizedTotalTokens ??
        Math.max(10_000, (lowerTask?.totalUnitCount ?? 1) * 4_000)
    )
  );
  const [usePricing, setUsePricing] = useState(
    Boolean(task?.aiProcessing?.pricing)
  );
  const [inputPrice, setInputPrice] = useState(
    String(task?.aiProcessing?.pricing?.inputPerMillionTokens ?? '')
  );
  const [outputPrice, setOutputPrice] = useState(
    String(task?.aiProcessing?.pricing?.outputPerMillionTokens ?? '')
  );
  const [costLimit, setCostLimit] = useState(String(task?.costLimit ?? ''));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const selectedProfile = profiles.find((profile) => profile.id === profileId);
  const resultCount = entry.aggregationResults.filter(
    (result) => result.aggregationLevel === level
  ).length;
  const label =
    level === 'chapter'
      ? '章节聚合'
      : level === 'stage'
        ? '阶段聚合'
        : '故事弧聚合';
  const lowerReady = lowerTask?.status === 'completed';
  const authorization = useMemo(() => {
    const tokens = Number(authorizedTokens);
    const input = Number(inputPrice);
    const output = Number(outputPrice);
    const limit = Number(costLimit);
    if (!Number.isInteger(tokens) || tokens <= 0) return undefined;
    if (!usePricing) return { authorizedTotalTokens: tokens };
    if (
      !Number.isFinite(input) ||
      input < 0 ||
      !Number.isFinite(output) ||
      output < 0 ||
      !Number.isFinite(limit) ||
      limit <= 0
    ) {
      return undefined;
    }
    return {
      authorizedTotalTokens: tokens,
      pricing: {
        currency: 'USD' as const,
        inputPerMillionTokens: input,
        outputPerMillionTokens: output
      },
      costLimit: limit
    };
  }, [
    authorizedTokens,
    costLimit,
    inputPrice,
    outputPrice,
    usePricing
  ]);

  async function perform(
    action: string,
    operation: () => Promise<void>,
    success: string
  ) {
    setBusy(action);
    setError(undefined);
    setMessage(undefined);
    try {
      await operation();
      setMessage(success);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : `${label}操作失败。`
      );
    } finally {
      setBusy(undefined);
    }
  }

  function beginEditing() {
    setProfileId(task?.apiProfileId ?? defaultProfileId);
    setModel(task?.model ?? defaultModel);
    setAuthorizedTokens(
      String(
        task?.aiProcessing?.authorizedTotalTokens ??
          Math.max(10_000, (lowerTask?.totalUnitCount ?? 1) * 4_000)
      )
    );
    setConsent(false);
    setEditing(true);
  }

  return (
    <section className="ccw-aggregation-card" data-level={level}>
      <div className="ccw-aggregation-heading">
        <div>
          <strong>{label}</strong>
          <p>
            {level === 'chapter'
              ? '每章只读取本章分块结果与承接账本。'
              : level === 'stage'
                ? '每个小阶段最多读取 8 个连续章节结果。'
                : '只读取连续阶段摘要，识别可独立生成事件组的故事弧。'}
          </p>
        </div>
        <span>{task ? taskStatus(task) : lowerReady ? '可建立' : '等待下级结果'}</span>
      </div>

      {task ? (
        <>
          <progress
            value={task.completedUnitCount}
            max={task.totalUnitCount}
            aria-label={`${label}进度`}
          />
          <div className="ccw-aggregation-metrics">
            <span>
              {task.completedUnitCount}/{task.totalUnitCount} 单元
            </span>
            <span>{resultCount} 个结果</span>
            <span>
              {(task.consumedInputTokens + task.consumedOutputTokens).toLocaleString()}{' '}
              tokens
            </span>
          </div>
          {task.lastError ? (
            <p className="ccw-extraction-error">{task.lastError}</p>
          ) : null}
        </>
      ) : null}

      {editing ? (
        <div className="ccw-extraction-authorization">
          <div className="ccw-extraction-fields">
            <label>
              API Profile
              <select
                value={profileId}
                onChange={(event) => {
                  const next = profiles.find(
                    (profile) => profile.id === event.target.value
                  );
                  setProfileId(event.target.value);
                  setModel(next?.models[0] ?? '');
                }}
              >
                <option value="">请选择</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              模型
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                list={`ccw-${level}-aggregation-models-${entry.document.sourceDocumentId}`}
              />
              <datalist
                id={`ccw-${level}-aggregation-models-${entry.document.sourceDocumentId}`}
              >
                {selectedProfile?.models.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </label>
            <label>
              授权总 tokens
              <input
                type="number"
                min="1"
                step="1"
                value={authorizedTokens}
                onChange={(event) => setAuthorizedTokens(event.target.value)}
              />
            </label>
          </div>
          <label className="ccw-extraction-check">
            <input
              type="checkbox"
              checked={usePricing}
              onChange={(event) => setUsePricing(event.target.checked)}
            />
            同时锁定我填写的 USD 单价和费用上限
          </label>
          {usePricing ? (
            <div className="ccw-extraction-fields is-pricing">
              <label>
                输入 USD / 百万 token
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={inputPrice}
                  onChange={(event) => setInputPrice(event.target.value)}
                />
              </label>
              <label>
                输出 USD / 百万 token
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={outputPrice}
                  onChange={(event) => setOutputPrice(event.target.value)}
                />
              </label>
              <label>
                费用上限 USD
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={costLimit}
                  onChange={(event) => setCostLimit(event.target.value)}
                />
              </label>
            </div>
          ) : null}
          <label className="ccw-extraction-check is-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            我确认“开始”后只把下一级结构化摘要发送给所选模型；保存授权本身不会调用模型。
          </label>
          {!ready(selectedProfile, model) ? (
            <p className="ccw-extraction-error">
              所选 Profile 尚未配置可用的辅助模型接口。
            </p>
          ) : null}
          <div className="ccw-extraction-actions">
            <button
              type="button"
              className="primary"
              disabled={
                !authorization ||
                !consent ||
                !ready(selectedProfile, model) ||
                (!task && !onCreateTask) ||
                (Boolean(task) && !onReauthorizeTask) ||
                busy !== undefined
              }
              onClick={() =>
                void perform(
                  'authorize',
                  () =>
                    task
                      ? onReauthorizeTask!(task.taskId, {
                          apiProfileId: profileId,
                          model,
                          authorization: authorization!
                        })
                      : onCreateTask!({
                          aggregationLevel: level,
                          inputTaskId: lowerTask!.taskId,
                          apiProfileId: profileId,
                          model,
                          authorization: authorization!
                        }),
                  task
                    ? `${label}新授权已保存；已有结果和历史费用不变。`
                    : `${label}授权已保存，尚未调用模型。`
                ).then(() => {
                  setEditing(false);
                  setConsent(false);
                })
              }
            >
              {busy === 'authorize'
                ? '正在保存…'
                : task
                  ? '保存新授权'
                  : `授权并建立${label}任务`}
            </button>
            <button
              type="button"
              disabled={busy !== undefined}
              onClick={() => setEditing(false)}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="ccw-extraction-actions">
          {!task && lowerReady && onCreateTask ? (
            <button type="button" onClick={beginEditing}>
              配置并授权{label}
            </button>
          ) : null}
          {task?.status === 'queued' ? (
            <button
              type="button"
              className="primary"
              disabled={!onRunTask || busy !== undefined}
              onClick={() =>
                void perform(
                  'run',
                  () => onRunTask!(task.taskId),
                  `${label}已运行到当前持久化状态。`
                )
              }
            >
              {busy === 'run' ? '处理中…' : `开始${label}`}
            </button>
          ) : null}
          {task?.status === 'running' ? (
            <button
              type="button"
              disabled={!onPauseTask || busy !== undefined}
              onClick={() =>
                void perform(
                  'pause',
                  () => onPauseTask!(task.taskId),
                  `${label}已暂停。`
                )
              }
            >
              暂停
            </button>
          ) : null}
          {task?.status === 'paused' ? (
            <button
              type="button"
              disabled={!onResumeTask || busy !== undefined}
              onClick={() =>
                void perform(
                  'resume',
                  () => onResumeTask!(task.taskId),
                  `${label}已继续。`
                )
              }
            >
              继续
            </button>
          ) : null}
          {task?.status === 'failed' ? (
            <button
              type="button"
              disabled={!onRetryTask || busy !== undefined}
              onClick={() =>
                void perform(
                  'retry',
                  () => onRetryTask!(task.taskId),
                  `${label}失败单元已重试。`
                )
              }
            >
              重试失败单元
            </button>
          ) : null}
          {task &&
          task.status !== 'running' &&
          task.status !== 'completed' &&
          task.status !== 'cancelled' &&
          onReauthorizeTask ? (
            <button type="button" disabled={busy !== undefined} onClick={beginEditing}>
              更换模型 / 扩授权
            </button>
          ) : null}
          {task &&
          task.status !== 'completed' &&
          task.status !== 'cancelled' ? (
            <button
              type="button"
              className="danger"
              disabled={!onCancelTask || busy !== undefined}
              onClick={() => {
                if (!window.confirm(`确认取消${label}任务吗？已有结果会保留。`)) {
                  return;
                }
                void perform(
                  'cancel',
                  () => onCancelTask!(task.taskId),
                  `${label}已取消；已有结果仍保留。`
                );
              }}
            >
              取消任务
            </button>
          ) : null}
        </div>
      )}

      {message ? (
        <p className="ccw-extraction-message" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="ccw-extraction-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function LongTextAggregationControls(
  props: LongTextAggregationControlsProps
) {
  const extractionTask = taskFor(props.entry, 'extract_local');
  if (!extractionTask) return null;
  return (
    <section
      className="ccw-aggregation-panel"
      aria-label="章节、阶段与故事弧聚合"
    >
      <div className="ccw-aggregation-panel-heading">
        <div>
          <strong>树状聚合</strong>
          <p>不重新发送原文；每层只读取下一级结构化结果。</p>
        </div>
        <span>
          承接账本 {props.entry.carryLedgerEntries.length}/
          {props.entry.extractionResults.length}
        </span>
      </div>
      <AggregationCard {...props} level="chapter" />
      <AggregationCard {...props} level="stage" />
      <AggregationCard {...props} level="arc" />
    </section>
  );
}
