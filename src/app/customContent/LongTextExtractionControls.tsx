import { useEffect, useMemo, useState } from 'react';
import type { ApiProfile } from '../../domain/settings/types';
import {
  requiresApiKey,
  supportsAuxiliaryRouting
} from '../../domain/settings/apiCapabilities';
import type {
  CreateCustomLocalExtractionTaskOptions,
  ReauthorizeCustomLocalExtractionTaskOptions
} from '../../domain/customContent/sourceExtractionTasks';
import {
  calculateCustomAiCost,
  DEFAULT_LOCAL_EXTRACTION_MAX_OUTPUT_TOKENS,
  estimateCustomLocalExtractionTaskUsage
} from '../../domain/customContent/sourceExtractionTasks';
import type { LongTextSourceLibraryEntry } from './longTextSourceLibrary';

interface LongTextExtractionControlsProps {
  entry: LongTextSourceLibraryEntry;
  profiles: ApiProfile[];
  defaultProfileId: string;
  defaultModel: string;
  onCreateTask?: (
    options: CreateCustomLocalExtractionTaskOptions
  ) => Promise<void>;
  onRunTask?: (taskId: string) => Promise<void>;
  onPauseTask?: (taskId: string) => Promise<void>;
  onResumeTask?: (taskId: string) => Promise<void>;
  onCancelTask?: (taskId: string) => Promise<void>;
  onRetryTask?: (taskId: string) => Promise<void>;
  onReauthorizeTask?: (
    taskId: string,
    options: ReauthorizeCustomLocalExtractionTaskOptions
  ) => Promise<void>;
}

function positiveNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function nonnegativeNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: '已授权，等待开始',
    running: '正在逐块提取',
    paused: '已暂停',
    failed: '提取失败',
    completed: '局部提取完成',
    cancelled: '已取消'
  };
  return labels[status] ?? status;
}

function pauseReasonLabel(reason: string | undefined): string | undefined {
  if (reason === 'token_limit') return '继续处理会超过 token 授权上限。';
  if (reason === 'cost_limit') return '继续处理会超过 USD 费用上限。';
  if (reason === 'rate_limit') return '服务商持续限流，任务已安全暂停。';
  if (reason === 'page_interrupted') return '页面或请求中断，可从当前分块继续。';
  if (reason === 'user') return '任务由你主动暂停。';
  return undefined;
}

function profileIsReady(profile: ApiProfile | undefined, model: string): boolean {
  return Boolean(
    profile &&
      profile.baseUrl.trim() &&
      model.trim() &&
      supportsAuxiliaryRouting(profile.interfaceType) &&
      (!requiresApiKey(profile.interfaceType) || profile.apiKey.trim())
  );
}

export function LongTextExtractionControls({
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
}: LongTextExtractionControlsProps) {
  const extractionTask = entry.tasks.find(
    (task) => task.taskKind === 'extract_local'
  );
  const extractionTaskId = extractionTask?.taskId;
  const taskProfileId = extractionTask?.apiProfileId;
  const taskModel = extractionTask?.model;
  const taskMaxOutputTokens =
    extractionTask?.aiProcessing?.maxOutputTokensPerUnit;
  const taskAuthorizedTokens =
    extractionTask?.aiProcessing?.authorizedTotalTokens;
  const taskInputPrice =
    extractionTask?.aiProcessing?.pricing?.inputPerMillionTokens;
  const taskOutputPrice =
    extractionTask?.aiProcessing?.pricing?.outputPerMillionTokens;
  const taskCostLimit = extractionTask?.costLimit;
  const defaultAuthorizedTokens = useMemo(
    () =>
      entry.structure
        ? estimateCustomLocalExtractionTaskUsage(
            entry.structure,
            DEFAULT_LOCAL_EXTRACTION_MAX_OUTPUT_TOKENS
          ).totalTokens
        : undefined,
    [entry.structure]
  );
  const taskResults = extractionTask
    ? entry.extractionResults.filter(
        (result) => result.taskId === extractionTask.taskId
      )
    : [];
  const [isEditingAuthorization, setIsEditingAuthorization] = useState(
    !extractionTask
  );
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [model, setModel] = useState(defaultModel);
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    String(DEFAULT_LOCAL_EXTRACTION_MAX_OUTPUT_TOKENS)
  );
  const [authorizedTokens, setAuthorizedTokens] = useState('');
  const [usePricing, setUsePricing] = useState(false);
  const [inputPrice, setInputPrice] = useState('');
  const [outputPrice, setOutputPrice] = useState('');
  const [costLimit, setCostLimit] = useState('');
  const [consent, setConsent] = useState(false);
  const [busyAction, setBusyAction] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const selectedProfile = profiles.find((profile) => profile.id === profileId);
  const parsedMaxOutput =
    positiveNumber(maxOutputTokens) ??
    DEFAULT_LOCAL_EXTRACTION_MAX_OUTPUT_TOKENS;
  const usage = useMemo(
    () =>
      entry.structure
        ? estimateCustomLocalExtractionTaskUsage(
            entry.structure,
            parsedMaxOutput
          )
        : undefined,
    [entry.structure, parsedMaxOutput]
  );
  const parsedInputPrice = nonnegativeNumber(inputPrice);
  const parsedOutputPrice = nonnegativeNumber(outputPrice);
  const parsedCostLimit = positiveNumber(costLimit);
  const estimatedCost =
    usePricing &&
    usage &&
    parsedInputPrice !== undefined &&
    parsedOutputPrice !== undefined
      ? calculateCustomAiCost(usage.inputTokens, usage.outputTokens, {
          currency: 'USD',
          inputPerMillionTokens: parsedInputPrice,
          outputPerMillionTokens: parsedOutputPrice
        })
      : undefined;
  const canAuthorize = Boolean(
    entry.structure &&
      profileIsReady(selectedProfile, model) &&
      positiveNumber(authorizedTokens) &&
      positiveNumber(maxOutputTokens) &&
      consent &&
      (!usePricing ||
        (parsedInputPrice !== undefined &&
          parsedOutputPrice !== undefined &&
          parsedCostLimit !== undefined))
  );

  useEffect(() => {
    if (extractionTaskId) {
      setProfileId(taskProfileId ?? defaultProfileId);
      setModel(taskModel ?? defaultModel);
      setMaxOutputTokens(
        String(
          taskMaxOutputTokens ??
            DEFAULT_LOCAL_EXTRACTION_MAX_OUTPUT_TOKENS
        )
      );
      setAuthorizedTokens(String(taskAuthorizedTokens ?? ''));
      setUsePricing(
        taskInputPrice !== undefined && taskOutputPrice !== undefined
      );
      setInputPrice(
        taskInputPrice !== undefined ? String(taskInputPrice) : ''
      );
      setOutputPrice(
        taskOutputPrice !== undefined ? String(taskOutputPrice) : ''
      );
      setCostLimit(
        taskCostLimit !== undefined
          ? String(taskCostLimit)
          : ''
      );
      setIsEditingAuthorization(false);
      setConsent(false);
      return;
    }
    setProfileId(defaultProfileId);
    setModel(defaultModel);
    setAuthorizedTokens(String(defaultAuthorizedTokens ?? ''));
    setIsEditingAuthorization(true);
  }, [
    defaultAuthorizedTokens,
    defaultModel,
    defaultProfileId,
    extractionTaskId,
    taskAuthorizedTokens,
    taskCostLimit,
    taskInputPrice,
    taskMaxOutputTokens,
    taskModel,
    taskOutputPrice,
    taskProfileId
  ]);

  async function perform(
    action: string,
    operation: () => Promise<void>,
    successMessage: string
  ) {
    setBusyAction(action);
    setError(undefined);
    setMessage(undefined);
    try {
      await operation();
      setMessage(successMessage);
      setConsent(false);
      if (action === 'authorize') setIsEditingAuthorization(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '无法更新 AI 提取任务。'
      );
    } finally {
      setBusyAction(undefined);
    }
  }

  function authorizationOptions() {
    const pricing =
      usePricing &&
      parsedInputPrice !== undefined &&
      parsedOutputPrice !== undefined
        ? {
            currency: 'USD' as const,
            inputPerMillionTokens: parsedInputPrice,
            outputPerMillionTokens: parsedOutputPrice
          }
        : undefined;
    return {
      authorizedTotalTokens: positiveNumber(authorizedTokens)!,
      maxOutputTokensPerUnit: positiveNumber(maxOutputTokens)!,
      pricing,
      costLimit: pricing ? parsedCostLimit : undefined
    };
  }

  if (!entry.structure) return null;

  return (
    <section
      className="ccw-extraction"
      aria-label={`${entry.document.fileName} AI 局部提取`}
    >
      <div className="ccw-extraction-heading">
        <div>
          <span>AI LOCAL EXTRACTION</span>
          <strong>逐分块局部提取</strong>
          <p>
            每块只生成摘要、事实、人物/事件观察、可见性、矛盾和承接；不会直接生成事件组。
          </p>
        </div>
        {extractionTask ? (
          <span data-status={extractionTask.status}>
            {statusLabel(extractionTask.status)}
          </span>
        ) : (
          <span data-status="draft">尚未授权</span>
        )}
      </div>

      {extractionTask ? (
        <div className="ccw-extraction-receipt">
          <div>
            <span>进度</span>
            <strong>
              {extractionTask.completedUnitCount}/{extractionTask.totalUnitCount}
            </strong>
          </div>
          <div>
            <span>token</span>
            <strong>
              {(
                extractionTask.consumedInputTokens +
                extractionTask.consumedOutputTokens
              ).toLocaleString()}
              {' / '}
              {extractionTask.aiProcessing?.authorizedTotalTokens.toLocaleString()}
            </strong>
          </div>
          <div>
            <span>模型</span>
            <strong>{extractionTask.model}</strong>
          </div>
          <div>
            <span>已写入结果</span>
            <strong>{taskResults.length}</strong>
          </div>
          {extractionTask.consumedCost !== undefined ? (
            <div>
              <span>已发生费用</span>
              <strong>
                ${extractionTask.consumedCost.toFixed(6)}
                {extractionTask.costLimit !== undefined
                  ? ` / $${extractionTask.costLimit.toFixed(4)}`
                  : ''}
              </strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {extractionTask ? (
        <progress
          value={extractionTask.completedUnitCount}
          max={extractionTask.totalUnitCount}
          aria-label="AI 局部提取进度"
        />
      ) : null}

      {pauseReasonLabel(extractionTask?.pauseReason) ? (
        <p className="ccw-extraction-notice">
          {pauseReasonLabel(extractionTask?.pauseReason)}
        </p>
      ) : null}
      {extractionTask?.lastError ? (
        <p className="ccw-extraction-error">{extractionTask.lastError}</p>
      ) : null}

      {isEditingAuthorization ? (
        <div className="ccw-extraction-authorization">
          <div className="ccw-extraction-fields">
            <label>
              API Profile
              <select
                value={profileId}
                onChange={(event) => {
                  const nextProfile = profiles.find(
                    (profile) => profile.id === event.target.value
                  );
                  setProfileId(event.target.value);
                  setModel(nextProfile?.models[0] ?? '');
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
                list={`ccw-extraction-models-${entry.document.sourceDocumentId}`}
                onChange={(event) => setModel(event.target.value)}
              />
              <datalist
                id={`ccw-extraction-models-${entry.document.sourceDocumentId}`}
              >
                {selectedProfile?.models.map((profileModel) => (
                  <option key={profileModel} value={profileModel} />
                ))}
              </datalist>
            </label>
            <label>
              每块最大输出 token
              <input
                type="number"
                min="1"
                step="1"
                value={maxOutputTokens}
                onChange={(event) => setMaxOutputTokens(event.target.value)}
              />
            </label>
            <label>
              本次 token 硬上限
              <input
                type="number"
                min="1"
                step="1"
                value={authorizedTokens}
                onChange={(event) => setAuthorizedTokens(event.target.value)}
              />
            </label>
          </div>
          {usage ? (
            <p className="ccw-extraction-estimate">
              当前按 {usage.inputTokens.toLocaleString()} 输入 +{' '}
              {usage.outputTokens.toLocaleString()} 最大输出估算，共{' '}
              {usage.totalTokens.toLocaleString()} tokens。
            </p>
          ) : null}
          <label className="ccw-extraction-check">
            <input
              type="checkbox"
              checked={usePricing}
              onChange={(event) => setUsePricing(event.target.checked)}
            />
            我知道服务商单价，并设置 USD 费用上限
          </label>
          {usePricing ? (
            <>
              <div className="ccw-extraction-fields is-pricing">
                <label>
                  输入 USD / 百万 token
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={inputPrice}
                    onChange={(event) => setInputPrice(event.target.value)}
                  />
                </label>
                <label>
                  输出 USD / 百万 token
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={outputPrice}
                    onChange={(event) => setOutputPrice(event.target.value)}
                  />
                </label>
                <label>
                  本次 USD 硬上限
                  <input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={costLimit}
                    onChange={(event) => setCostLimit(event.target.value)}
                  />
                </label>
              </div>
              <p className="ccw-extraction-estimate">
                单价由你填写，系统不会猜测服务商价格。
                {estimatedCost !== undefined
                  ? ` 当前最大估算约 $${estimatedCost.toFixed(6)}。`
                  : ''}
              </p>
            </>
          ) : null}
          {!profileIsReady(selectedProfile, model) ? (
            <p className="ccw-extraction-error">
              所选 Profile 尚未配置可用的辅助模型接口。
            </p>
          ) : null}
          <label className="ccw-extraction-check is-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            我确认开始任务后，每个原文分块会发送给所选模型；建立授权本身不会发起调用。
          </label>
          <div className="ccw-extraction-actions">
            <button
              type="button"
              className="primary"
              disabled={
                !canAuthorize ||
                busyAction !== undefined ||
                (!extractionTask ? !onCreateTask : !onReauthorizeTask)
              }
              onClick={() =>
                void perform(
                  'authorize',
                  () =>
                    extractionTask
                      ? onReauthorizeTask!(extractionTask.taskId, {
                          apiProfileId: profileId,
                          model,
                          authorization: authorizationOptions()
                        })
                      : onCreateTask!({
                          sourceStructureId: entry.structure!.sourceStructureId,
                          apiProfileId: profileId,
                          model,
                          authorization: authorizationOptions()
                        }),
                  extractionTask
                    ? '新授权已保存；已有结果和历史费用保持不变。'
                    : '授权凭据已保存，尚未调用模型。'
                )
              }
            >
              {busyAction === 'authorize'
                ? '正在保存…'
                : extractionTask
                  ? '保存新授权'
                  : '授权并建立任务'}
            </button>
            {extractionTask ? (
              <button
                type="button"
                disabled={busyAction !== undefined}
                onClick={() => {
                  setIsEditingAuthorization(false);
                  setConsent(false);
                }}
              >
                取消调整
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

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

      {extractionTask && !isEditingAuthorization ? (
        <div className="ccw-extraction-actions">
          {extractionTask.status === 'queued' ? (
            <button
              type="button"
              className="primary"
              disabled={!onRunTask || busyAction !== undefined}
              onClick={() =>
                void perform(
                  'run',
                  () => onRunTask!(extractionTask.taskId),
                  'AI 局部提取已运行到当前持久化状态。'
                )
              }
            >
              {busyAction === 'run' ? '正在提取…' : '开始 AI 局部提取'}
            </button>
          ) : null}
          {extractionTask.status === 'running' ? (
            <button
              type="button"
              disabled={!onPauseTask || busyAction !== undefined}
              onClick={() =>
                void perform(
                  'pause',
                  () => onPauseTask!(extractionTask.taskId),
                  '任务已在当前分块安全暂停。'
                )
              }
            >
              暂停
            </button>
          ) : null}
          {extractionTask.status === 'paused' ? (
            <button
              type="button"
              className="primary"
              disabled={!onResumeTask || busyAction !== undefined}
              onClick={() =>
                void perform(
                  'resume',
                  () => onResumeTask!(extractionTask.taskId),
                  '任务已继续运行。'
                )
              }
            >
              继续
            </button>
          ) : null}
          {extractionTask.status === 'failed' ? (
            <button
              type="button"
              className="primary"
              disabled={!onRetryTask || busyAction !== undefined}
              onClick={() =>
                void perform(
                  'retry',
                  () => onRetryTask!(extractionTask.taskId),
                  '失败分块已重试。'
                )
              }
            >
              重试失败分块
            </button>
          ) : null}
          {(extractionTask.status === 'queued' ||
            extractionTask.status === 'paused' ||
            extractionTask.status === 'failed') && (
            <button
              type="button"
              disabled={!onReauthorizeTask || busyAction !== undefined}
              onClick={() => {
                setMessage(undefined);
                setError(undefined);
                setIsEditingAuthorization(true);
              }}
            >
              调整授权 / 更换模型
            </button>
          )}
          {extractionTask.status !== 'completed' &&
          extractionTask.status !== 'cancelled' ? (
            <button
              type="button"
              className="danger"
              disabled={!onCancelTask || busyAction !== undefined}
              onClick={() => {
                if (
                  !window.confirm(
                    '取消后会保留已完成分块和局部结果，但该任务不能继续。确认取消吗？'
                  )
                ) {
                  return;
                }
                void perform(
                  'cancel',
                  () => onCancelTask!(extractionTask.taskId),
                  '任务已取消；已有结果仍保存在本地。'
                );
              }}
            >
              取消任务
            </button>
          ) : null}
        </div>
      ) : null}

      {extractionTask?.status === 'completed' ? (
        <p className="ccw-extraction-complete">
          局部提取结果已逐块持久化；承接账本、章节聚合与事件组生成属于后续阶段。
        </p>
      ) : null}
    </section>
  );
}
