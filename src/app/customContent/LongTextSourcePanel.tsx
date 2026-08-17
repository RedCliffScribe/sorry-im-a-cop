import { useEffect, useRef, useState } from 'react';
import type {
  CustomContentProcessingTask,
  CustomContentProcessingTaskStatus
} from '../../domain/customContent/assetTypes';
import type {
  CreateCustomLocalExtractionTaskOptions,
  ReauthorizeCustomLocalExtractionTaskOptions
} from '../../domain/customContent/sourceExtractionTasks';
import type {
  CreateCustomSourceAggregationTaskOptions,
  ReauthorizeCustomSourceAggregationTaskOptions
} from '../../domain/customContent/sourceAggregationTasks';
import type {
  CreateCustomSourceProjectBuildTaskOptions,
  ReauthorizeCustomSourceProjectBuildTaskOptions
} from '../../domain/customContent/sourceProjectBuildTasks';
import type { CustomSourceProjectDraftResult } from '../../domain/customContent/sourceProjectBuildSchemas';
import type { ImportCustomSourceFileResult } from '../../domain/customContent/sourceImport';
import type { ApiProfile } from '../../domain/settings/types';
import { LongTextExtractionControls } from './LongTextExtractionControls';
import { LongTextAggregationControls } from './LongTextAggregationControls';
import { LongTextProjectBuildControls } from './LongTextProjectBuildControls';
import type { LongTextSourceLibraryEntry } from './longTextSourceLibrary';

interface LongTextSourcePanelProps {
  entries: LongTextSourceLibraryEntry[];
  profiles?: ApiProfile[];
  defaultProfileId?: string;
  defaultModel?: string;
  isLoading?: boolean;
  onClose: () => void;
  onImportSource?: (file: File) => Promise<ImportCustomSourceFileResult>;
  onRunTask?: (taskId: string) => Promise<void>;
  onBuildStructure?: (parseTaskId: string) => Promise<void>;
  onPauseTask?: (taskId: string) => Promise<void>;
  onResumeTask?: (taskId: string) => Promise<void>;
  onCancelTask?: (taskId: string) => Promise<void>;
  onRetryTask?: (taskId: string) => Promise<void>;
  onCreateExtractionTask?: (
    options: CreateCustomLocalExtractionTaskOptions
  ) => Promise<void>;
  onRunExtractionTask?: (taskId: string) => Promise<void>;
  onPauseExtractionTask?: (taskId: string) => Promise<void>;
  onResumeExtractionTask?: (taskId: string) => Promise<void>;
  onCancelExtractionTask?: (taskId: string) => Promise<void>;
  onRetryExtractionTask?: (taskId: string) => Promise<void>;
  onReauthorizeExtractionTask?: (
    taskId: string,
    options: ReauthorizeCustomLocalExtractionTaskOptions
  ) => Promise<void>;
  onCreateAggregationTask?: (
    options: CreateCustomSourceAggregationTaskOptions
  ) => Promise<void>;
  onRunAggregationTask?: (taskId: string) => Promise<void>;
  onPauseAggregationTask?: (taskId: string) => Promise<void>;
  onResumeAggregationTask?: (taskId: string) => Promise<void>;
  onCancelAggregationTask?: (taskId: string) => Promise<void>;
  onRetryAggregationTask?: (taskId: string) => Promise<void>;
  onReauthorizeAggregationTask?: (
    taskId: string,
    options: ReauthorizeCustomSourceAggregationTaskOptions
  ) => Promise<void>;
  onCreateProjectBuildTask?: (
    options: CreateCustomSourceProjectBuildTaskOptions
  ) => Promise<void>;
  onRunProjectBuildTask?: (taskId: string) => Promise<void>;
  onPauseProjectBuildTask?: (taskId: string) => Promise<void>;
  onResumeProjectBuildTask?: (taskId: string) => Promise<void>;
  onCancelProjectBuildTask?: (taskId: string) => Promise<void>;
  onRetryProjectBuildTask?: (taskId: string) => Promise<void>;
  onReauthorizeProjectBuildTask?: (
    taskId: string,
    options: ReauthorizeCustomSourceProjectBuildTaskOptions
  ) => Promise<void>;
  onReviewProjectDraft?: (result: CustomSourceProjectDraftResult) => void;
}

function taskForKind(
  entry: LongTextSourceLibraryEntry,
  taskKind: 'parse_source' | 'chunk_source'
): CustomContentProcessingTask | undefined {
  return entry.tasks.find((task) => task.taskKind === taskKind);
}

function formatLabel(format: string): string {
  if (format === 'markdown') return 'Markdown';
  return format.toUpperCase();
}

function statusLabel(status: CustomContentProcessingTaskStatus): string {
  const labels: Record<CustomContentProcessingTaskStatus, string> = {
    queued: '等待处理',
    running: '处理中',
    paused: '已暂停',
    failed: '失败',
    completed: '已完成',
    cancelled: '已取消'
  };
  return labels[status];
}

function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) {
    return `${(byteLength / 1024).toFixed(1)} KB`;
  }
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

function StageStatus({
  label,
  task
}: {
  label: string;
  task?: CustomContentProcessingTask;
}) {
  const status = task?.status ?? 'queued';
  return (
    <div className="ccw-source-stage" data-status={task ? status : 'pending'}>
      <span aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <small>{task ? statusLabel(status) : '尚未建立'}</small>
      </div>
    </div>
  );
}

export function LongTextSourcePanel({
  entries,
  profiles = [],
  defaultProfileId = '',
  defaultModel = '',
  isLoading = false,
  onClose,
  onImportSource,
  onRunTask,
  onBuildStructure,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onRetryTask,
  onCreateExtractionTask,
  onRunExtractionTask,
  onPauseExtractionTask,
  onResumeExtractionTask,
  onCancelExtractionTask,
  onRetryExtractionTask,
  onReauthorizeExtractionTask,
  onCreateAggregationTask,
  onRunAggregationTask,
  onPauseAggregationTask,
  onResumeAggregationTask,
  onCancelAggregationTask,
  onRetryAggregationTask,
  onReauthorizeAggregationTask,
  onCreateProjectBuildTask,
  onRunProjectBuildTask,
  onPauseProjectBuildTask,
  onResumeProjectBuildTask,
  onCancelProjectBuildTask,
  onRetryProjectBuildTask,
  onReauthorizeProjectBuildTask,
  onReviewProjectDraft
}: LongTextSourcePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string>();
  const [controlTaskId, setControlTaskId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function importFile(file: File | undefined) {
    if (!file || !onImportSource) return;
    setIsImporting(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await onImportSource(file);
      setMessage(
        result.alreadyPresent
          ? '相同来源文件已在本地，已保留原任务进度。'
          : '原始文件已保存一次，解析任务已进入等待队列。'
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '无法导入来源文件。'
      );
    } finally {
      setIsImporting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function runTask(
    taskId: string,
    operation: () => Promise<void>,
    successMessage: string
  ) {
    setActiveTaskId(taskId);
    setError(undefined);
    setMessage(undefined);
    try {
      await operation();
      setMessage(successMessage);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '来源处理任务执行失败。'
      );
    } finally {
      setActiveTaskId(undefined);
    }
  }

  async function controlTask(
    taskId: string,
    operation: () => Promise<void>,
    successMessage: string
  ) {
    setControlTaskId(taskId);
    setError(undefined);
    setMessage(undefined);
    try {
      await operation();
      setMessage(successMessage);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '无法更新来源任务状态。'
      );
    } finally {
      setControlTaskId(undefined);
    }
  }

  return (
    <div className="ccw-modal-backdrop">
      <section
        className="ccw-source-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ccw-source-panel-title"
      >
        <header>
          <div>
            <p>LONG-FORM SOURCE</p>
            <h2 id="ccw-source-panel-title">导入长篇内容</h2>
            <span>本地解析 TXT、Markdown 与 EPUB，再建立章节和分块</span>
          </div>
          <button type="button" aria-label="关闭长篇导入" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="ccw-source-panel-body">
          <section className="ccw-source-import-card">
            <div>
              <strong>选择原始文件</strong>
              <p>
                原文只在本地 Blob 中保存一份，不会放入运行时状态，也不会在本阶段发送给模型。
              </p>
            </div>
            <button
              type="button"
              className="primary"
              disabled={!onImportSource || isImporting}
              onClick={() => inputRef.current?.click()}
            >
              {isImporting ? '正在保存…' : '选择 TXT / Markdown / EPUB'}
            </button>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept=".txt,.md,.markdown,.epub,text/plain,text/markdown,application/epub+zip"
              aria-label="选择长篇来源文件"
              onChange={(event) => void importFile(event.target.files?.[0])}
            />
            <small>V1 不支持 PDF。百万字文本不会因超过 1 MB 被直接拒绝。</small>
          </section>

          {message ? (
            <div className="ccw-operation-message" role="status">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="ccw-operation-error" role="alert">
              {error}
            </div>
          ) : null}

          <section className="ccw-source-library" aria-label="长篇来源任务">
            <div className="ccw-source-library-heading">
              <div>
                <h3>本地来源与任务</h3>
                <p>页面关闭后任务停止；重新打开可从持久化状态继续。</p>
              </div>
              <span>{entries.length} 份来源</span>
            </div>

            {isLoading ? (
              <div className="ccw-loading" role="status">
                正在读取来源任务…
              </div>
            ) : entries.length === 0 ? (
              <div className="ccw-source-empty">
                <span aria-hidden="true">文</span>
                <div>
                  <strong>还没有长篇来源</strong>
                  <p>选择一个本地文件后，先解析规范文本，再生成章节和分块。</p>
                </div>
              </div>
            ) : (
              <div className="ccw-source-list">
                {entries.map((entry) => {
                  const parseTask = taskForKind(entry, 'parse_source');
                  const chunkTask = taskForKind(entry, 'chunk_source');
                  const currentTask =
                    parseTask?.status !== 'completed' ? parseTask : chunkTask;
                  const completedStages =
                    (parseTask?.status === 'completed' ? 1 : 0) +
                    (chunkTask?.status === 'completed' ? 1 : 0);
                  const isRunningLocally =
                    currentTask !== undefined &&
                    currentTask.taskId === activeTaskId;
                  const isControlling =
                    currentTask !== undefined &&
                    currentTask.taskId === controlTaskId;
                  return (
                    <article
                      key={entry.document.sourceDocumentId}
                      className="ccw-source-card"
                    >
                      <div className="ccw-source-card-heading">
                        <div>
                          <span>{formatLabel(entry.document.sourceFormat)}</span>
                          <h4>{entry.document.fileName}</h4>
                          <p>
                            {formatBytes(entry.document.byteLength)}
                            {entry.document.characterCount !== undefined
                              ? ` · ${entry.document.characterCount.toLocaleString()} 字符`
                              : ''}
                          </p>
                        </div>
                        <strong>{completedStages}/2</strong>
                      </div>
                      <progress
                        value={completedStages}
                        max={2}
                        aria-label={`${entry.document.fileName} 本地处理进度`}
                      />
                      <div className="ccw-source-stages">
                        <StageStatus label="规范文本解析" task={parseTask} />
                        <StageStatus label="章节与分块" task={chunkTask} />
                      </div>
                      {entry.structure ? (
                        <div className="ccw-source-structure-summary">
                          <span>{entry.structure.chapters.length} 章</span>
                          <span>{entry.structure.chunks.length} 个分块</span>
                          <span>
                            约 {entry.structure.estimatedTokenCount.toLocaleString()} tokens
                          </span>
                        </div>
                      ) : null}
                      <LongTextExtractionControls
                        entry={entry}
                        profiles={profiles}
                        defaultProfileId={defaultProfileId}
                        defaultModel={defaultModel}
                        onCreateTask={onCreateExtractionTask}
                        onRunTask={onRunExtractionTask}
                        onPauseTask={onPauseExtractionTask}
                        onResumeTask={onResumeExtractionTask}
                        onCancelTask={onCancelExtractionTask}
                        onRetryTask={onRetryExtractionTask}
                        onReauthorizeTask={onReauthorizeExtractionTask}
                      />
                      <LongTextAggregationControls
                        entry={entry}
                        profiles={profiles}
                        defaultProfileId={defaultProfileId}
                        defaultModel={defaultModel}
                        onCreateTask={onCreateAggregationTask}
                        onRunTask={onRunAggregationTask}
                        onPauseTask={onPauseAggregationTask}
                        onResumeTask={onResumeAggregationTask}
                        onCancelTask={onCancelAggregationTask}
                        onRetryTask={onRetryAggregationTask}
                        onReauthorizeTask={onReauthorizeAggregationTask}
                      />
                      <LongTextProjectBuildControls
                        entry={entry}
                        profiles={profiles}
                        defaultProfileId={defaultProfileId}
                        defaultModel={defaultModel}
                        onCreateTask={onCreateProjectBuildTask}
                        onRunTask={onRunProjectBuildTask}
                        onPauseTask={onPauseProjectBuildTask}
                        onResumeTask={onResumeProjectBuildTask}
                        onCancelTask={onCancelProjectBuildTask}
                        onRetryTask={onRetryProjectBuildTask}
                        onReauthorizeTask={onReauthorizeProjectBuildTask}
                        onReviewDraft={onReviewProjectDraft}
                      />
                      {currentTask?.lastError ? (
                        <p className="ccw-source-task-error">
                          {currentTask.lastError}
                        </p>
                      ) : null}
                      <div className="ccw-source-actions">
                        {parseTask?.status === 'completed' && !chunkTask ? (
                          <button
                            type="button"
                            disabled={!onBuildStructure || isRunningLocally}
                            onClick={() =>
                              void runTask(
                                parseTask.taskId,
                                () => onBuildStructure!(parseTask.taskId),
                                '章节与分块已经生成。'
                              )
                            }
                          >
                            生成章节与分块
                          </button>
                        ) : currentTask?.status === 'queued' ? (
                          <button
                            type="button"
                            disabled={!onRunTask || isRunningLocally}
                            onClick={() =>
                              void runTask(
                                currentTask.taskId,
                                () => onRunTask!(currentTask.taskId),
                                currentTask.taskKind === 'parse_source'
                                  ? '规范文本解析完成。'
                                  : '章节与分块已经生成。'
                              )
                            }
                          >
                            {isRunningLocally
                              ? '处理中…'
                              : currentTask.taskKind === 'parse_source'
                                ? '开始解析'
                                : '生成章节与分块'}
                          </button>
                        ) : currentTask?.status === 'running' ? (
                          isRunningLocally ? (
                            <button
                              type="button"
                              disabled={!onPauseTask || isControlling}
                              onClick={() =>
                                void controlTask(
                                  currentTask.taskId,
                                  () => onPauseTask!(currentTask.taskId),
                                  '任务已暂停。'
                                )
                              }
                            >
                              暂停
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!onResumeTask || isRunningLocally}
                              onClick={() =>
                                void runTask(
                                  currentTask.taskId,
                                  () => onResumeTask!(currentTask.taskId),
                                  '中断任务已继续执行。'
                                )
                              }
                            >
                              继续
                            </button>
                          )
                        ) : currentTask?.status === 'paused' ? (
                          <button
                            type="button"
                            disabled={!onResumeTask || isRunningLocally}
                            onClick={() =>
                              void runTask(
                                currentTask.taskId,
                                () => onResumeTask!(currentTask.taskId),
                                '任务已继续执行。'
                              )
                            }
                          >
                            继续
                          </button>
                        ) : currentTask?.status === 'failed' ? (
                          <button
                            type="button"
                            disabled={!onRetryTask || isRunningLocally}
                            onClick={() =>
                              void runTask(
                                currentTask.taskId,
                                () => onRetryTask!(currentTask.taskId),
                                '失败任务已重试。'
                              )
                            }
                          >
                            重试
                          </button>
                        ) : null}
                        {currentTask &&
                        currentTask.status !== 'completed' &&
                        currentTask.status !== 'cancelled' ? (
                          <button
                            type="button"
                            className="danger"
                            disabled={!onCancelTask || isControlling}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  '取消后会保留原始文件与现有结果，但当前任务不能继续。确认取消吗？'
                                )
                              ) {
                                return;
                              }
                              void controlTask(
                                currentTask.taskId,
                                () => onCancelTask!(currentTask.taskId),
                                '任务已取消；原始文件和已有结果仍保留在本地。'
                              );
                            }}
                          >
                            取消
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <footer>
          <p>
            本地解析不调用模型；AI 局部提取与逐层聚合都必须先保存独立授权，再由你明确开始。
          </p>
          <button type="button" onClick={onClose}>
            完成
          </button>
        </footer>
      </section>
    </div>
  );
}
