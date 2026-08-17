import { useMemo, useState } from 'react';
import type {
  CustomContentConversionMode,
  CustomContentProcessingTask
} from '../../domain/customContent/assetTypes';
import type {
  CreateCustomSourceProjectBuildTaskOptions,
  ReauthorizeCustomSourceProjectBuildTaskOptions
} from '../../domain/customContent/sourceProjectBuildTasks';
import type { CustomSourceProjectDraftResult } from '../../domain/customContent/sourceProjectBuildSchemas';
import {
  requiresApiKey,
  supportsAuxiliaryRouting
} from '../../domain/settings/apiCapabilities';
import type { ApiProfile } from '../../domain/settings/types';
import type { LongTextSourceLibraryEntry } from './longTextSourceLibrary';

interface LongTextProjectBuildControlsProps {
  entry: LongTextSourceLibraryEntry;
  profiles: ApiProfile[];
  defaultProfileId: string;
  defaultModel: string;
  onCreateTask?: (
    options: CreateCustomSourceProjectBuildTaskOptions
  ) => Promise<void>;
  onRunTask?: (taskId: string) => Promise<void>;
  onPauseTask?: (taskId: string) => Promise<void>;
  onResumeTask?: (taskId: string) => Promise<void>;
  onCancelTask?: (taskId: string) => Promise<void>;
  onRetryTask?: (taskId: string) => Promise<void>;
  onReauthorizeTask?: (
    taskId: string,
    options: ReauthorizeCustomSourceProjectBuildTaskOptions
  ) => Promise<void>;
  onReviewDraft?: (result: CustomSourceProjectDraftResult) => void;
}

const conversionModes: Array<{
  value: CustomContentConversionMode;
  label: string;
  description: string;
}> = [
  {
    value: 'structural_adaptation',
    label: '结构适配',
    description: '保留事件结构，允许人物、机构和时代载体变化。'
  },
  {
    value: 'character_retention',
    label: '人物保留',
    description: '优先保留人物与关系，允许事件明显偏转。'
  },
  {
    value: 'source_direction_priority',
    label: '来源方向优先',
    description: '优先保留来源方向，但仍服从当前世界与存档事实。'
  }
];

function taskFor(
  entry: LongTextSourceLibraryEntry,
  kind: CustomContentProcessingTask['taskKind']
): CustomContentProcessingTask | undefined {
  return entry.tasks.find((task) => task.taskKind === kind);
}

function profileReady(
  profile: ApiProfile | undefined,
  model: string
): boolean {
  return Boolean(
    profile &&
      profile.baseUrl.trim() &&
      model.trim() &&
      supportsAuxiliaryRouting(profile.interfaceType) &&
      (!requiresApiKey(profile.interfaceType) || profile.apiKey.trim())
  );
}

function statusLabel(task: CustomContentProcessingTask): string {
  const labels = {
    queued: '已授权，等待开始',
    running: '正在生成项目草稿',
    paused: '已暂停，可恢复',
    failed: '失败，可重试',
    completed: '草稿已生成，等待人工审核',
    cancelled: '已取消'
  };
  return labels[task.status];
}

function modeLabel(mode: CustomContentConversionMode): string {
  return (
    conversionModes.find((item) => item.value === mode)?.label ?? mode
  );
}

function ProjectDraftReview({
  result,
  onReviewDraft
}: {
  result: CustomSourceProjectDraftResult;
  onReviewDraft?: (result: CustomSourceProjectDraftResult) => void;
}) {
  return (
    <section className="ccw-project-draft-review" aria-label="长篇项目草稿摘要">
      <div className="ccw-project-draft-heading">
        <div>
          <span>待人工审核 · {modeLabel(result.conversionMode)}</span>
          <h4>{result.draft.project.title}</h4>
          <p>{result.draft.project.summary}</p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={!onReviewDraft}
          onClick={() => onReviewDraft?.(result)}
        >
          在项目编辑器中审阅
        </button>
      </div>
      <div className="ccw-project-draft-metrics">
        <span>{result.draft.eventGroups.length} 个事件组</span>
        <span>{result.draft.characterCandidates.length} 名人物候选</span>
        <span>{result.storyArcIds.length} 个故事弧已覆盖</span>
        <span>
          {(result.inputTokens + result.outputTokens).toLocaleString()} tokens
        </span>
      </div>
      <div className="ccw-project-draft-groups">
        {result.draft.eventGroups.map((group) => {
          const source = result.eventGroupSources.find(
            (item) => item.eventGroupKey === group.eventGroupKey
          );
          return (
            <article key={group.eventGroupKey}>
              <div>
                <strong>{group.title}</strong>
                <span>
                  {group.entryMode === 'asap' ? '当前焦点' : '后续手动'}
                </span>
              </div>
              <p>{group.summary}</p>
              <small>
                {group.stages.length} 个阶段 ·{' '}
                {source?.storyArcIds.length ?? 0} 个来源故事弧
              </small>
            </article>
          );
        })}
      </div>
      {result.draft.characterCandidates.length > 0 ? (
        <div className="ccw-project-draft-characters">
          <strong>人物候选</strong>
          <p>
            {result.draft.characterCandidates
              .map((candidate) => candidate.character.displayName)
              .join('、')}
          </p>
        </div>
      ) : null}
      {result.contentGaps.length > 0 ||
      result.consistencyIssues.length > 0 ? (
        <div className="ccw-project-draft-warnings">
          <strong>
            审阅提示（{result.contentGaps.length} 个内容缺口 ·{' '}
            {result.consistencyIssues.length} 个一致性问题）
          </strong>
          <ul>
            {result.contentGaps.slice(0, 4).map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
            {result.consistencyIssues.slice(0, 4).map((issue) => (
              <li key={`${issue.code}:${issue.path ?? ''}`}>
                {issue.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="ccw-project-draft-boundary">
        此处仍是来源草稿，不会自动建立 Runtime Actor、案件、关系、新闻或已发生事实。
      </p>
    </section>
  );
}

export function LongTextProjectBuildControls({
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
  onReauthorizeTask,
  onReviewDraft
}: LongTextProjectBuildControlsProps) {
  const arcTask = taskFor(entry, 'aggregate_arc');
  const task = taskFor(entry, 'build_project');
  const result = task
    ? entry.projectDraftResults.find((item) => item.taskId === task.taskId)
    : undefined;
  const [editing, setEditing] = useState(false);
  const [conversionMode, setConversionMode] =
    useState<CustomContentConversionMode>(
      task?.aiProcessing?.conversionMode ?? 'structural_adaptation'
    );
  const [profileId, setProfileId] = useState(
    task?.apiProfileId ?? defaultProfileId
  );
  const [model, setModel] = useState(task?.model ?? defaultModel);
  const [authorizedTokens, setAuthorizedTokens] = useState(
    String(task?.aiProcessing?.authorizedTotalTokens ?? 40_000)
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
  const selectedMode = conversionModes.find(
    (item) => item.value === conversionMode
  )!;
  const lowerReady = arcTask?.status === 'completed';
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
        caught instanceof Error ? caught.message : '项目草稿操作失败。'
      );
    } finally {
      setBusy(undefined);
    }
  }

  function beginEditing() {
    setConversionMode(
      task?.aiProcessing?.conversionMode ?? 'structural_adaptation'
    );
    setProfileId(task?.apiProfileId ?? defaultProfileId);
    setModel(task?.model ?? defaultModel);
    setAuthorizedTokens(
      String(task?.aiProcessing?.authorizedTotalTokens ?? 40_000)
    );
    setConsent(false);
    setEditing(true);
  }

  if (!arcTask) return null;

  return (
    <section className="ccw-project-build-panel" aria-label="长篇项目草稿生成">
      <div className="ccw-aggregation-panel-heading">
        <div>
          <strong>多事件组项目草稿</strong>
          <p>
            只读取故事弧结果；独立故事弧拆分为事件组，生成后仍需玩家审阅。
          </p>
        </div>
        <span>{task ? statusLabel(task) : lowerReady ? '可建立' : '等待故事弧'}</span>
      </div>

      {task ? (
        <>
          <progress
            value={task.completedUnitCount}
            max={task.totalUnitCount}
            aria-label="项目草稿生成进度"
          />
          <div className="ccw-aggregation-metrics">
            <span>{modeLabel(task.aiProcessing!.conversionMode!)}</span>
            <span>
              {task.completedUnitCount}/{task.totalUnitCount} 单元
            </span>
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
          {!task ? (
            <fieldset className="ccw-project-mode-options">
              <legend>转换模式</legend>
              {conversionModes.map((item) => (
                <label key={item.value}>
                  <input
                    type="radio"
                    name={`project-mode-${entry.document.sourceDocumentId}`}
                    value={item.value}
                    checked={conversionMode === item.value}
                    onChange={() => setConversionMode(item.value)}
                  />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="ccw-project-mode-locked">
              转换模式已锁定为“{selectedMode.label}”；更换模型或扩授权不会改写模式。
            </p>
          )}
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
                list={`ccw-project-build-models-${entry.document.sourceDocumentId}`}
              />
              <datalist
                id={`ccw-project-build-models-${entry.document.sourceDocumentId}`}
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
            我确认只把故事弧结构摘要发送给所选模型；保存授权本身不会调用模型，结果不会自动写入运行时。
          </label>
          {!profileReady(selectedProfile, model) ? (
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
                !profileReady(selectedProfile, model) ||
                (!task && (!onCreateTask || !arcTask)) ||
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
                          inputTaskId: arcTask.taskId,
                          conversionMode,
                          apiProfileId: profileId,
                          model,
                          authorization: authorization!
                        }),
                  task
                    ? '项目草稿新授权已保存；已有结果和历史费用不变。'
                    : '项目草稿授权已保存，尚未调用模型。'
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
                  : '授权并建立项目草稿任务'}
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
              配置并授权项目生成
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
                  '项目草稿已运行到当前持久化状态。'
                )
              }
            >
              {busy === 'run' ? '生成中…' : '开始生成项目草稿'}
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
                  '项目草稿生成已暂停。'
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
                  '项目草稿生成已继续。'
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
                  '项目草稿失败单元已重试。'
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
            <button
              type="button"
              disabled={busy !== undefined}
              onClick={beginEditing}
            >
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
                if (
                  !window.confirm(
                    '确认取消项目草稿任务吗？已有结果会保留。'
                  )
                ) {
                  return;
                }
                void perform(
                  'cancel',
                  () => onCancelTask!(task.taskId),
                  '项目草稿任务已取消；已有结果仍保留。'
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
      {result ? (
        <ProjectDraftReview result={result} onReviewDraft={onReviewDraft} />
      ) : null}
    </section>
  );
}
