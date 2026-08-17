import { imageGenerationTaskSchema, submittedImageRequestSchema, compiledImageRequestDraftSchema } from './schemas';
import type {
  CompiledImageRequestDraftSnapshot,
  ImageGenerationErrorSummary,
  ImageGenerationTask,
  ImageTaskCancellation,
  RemoteImageTaskHandle,
  SubmittedImageRequestSnapshot,
  VisualGenerationIntent
} from './types';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

const ALLOWED_TRANSITIONS: Record<ImageGenerationTask['status'], ImageGenerationTask['status'][]> = {
  compiling: ['compiling', 'awaiting-confirmation', 'queued', 'failed', 'cancelled'],
  'awaiting-confirmation': ['awaiting-confirmation', 'queued', 'failed', 'cancelled'],
  queued: ['submitting', 'failed', 'cancelled'],
  submitting: ['remote-pending', 'downloading', 'failed', 'cancelled'],
  'remote-pending': ['downloading', 'failed', 'cancelled'],
  downloading: ['persisting', 'failed', 'cancelled'],
  persisting: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: []
};

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function ensureStatus(task: ImageGenerationTask, allowed: ImageGenerationTask['status'][]): void {
  if (!allowed.includes(task.status)) {
    throw new Error(`任务 ${task.taskId} 不能从 ${task.status} 执行该操作。`);
  }
}

function finishRunningAttempt(
  task: ImageGenerationTask,
  outcome: 'succeeded' | 'failed' | 'cancelled',
  finishedAt: string,
  error?: ImageGenerationErrorSummary
): ImageGenerationTask['attempts'] {
  const attempts = task.attempts.map((attempt) => ({ ...attempt }));
  const last = attempts.at(-1);
  if (last?.outcome === 'running') {
    attempts[attempts.length - 1] = { ...last, outcome, finishedAt, error };
  }
  return attempts;
}

function draftFromSubmitted(request: SubmittedImageRequestSnapshot): CompiledImageRequestDraftSnapshot {
  const { requestFingerprint: _requestFingerprint, submittedAt: _submittedAt, userEdited: _userEdited, ...draft } = request;
  return draft;
}

export function createImageGenerationTask(input: {
  taskId: string;
  saveId: string;
  source: ImageGenerationTask['source'];
  submissionMode: ImageGenerationTask['submissionMode'];
  sourceTaskId?: string;
  intent: VisualGenerationIntent;
  createdAt: string;
}): ImageGenerationTask {
  return imageGenerationTaskSchema.parse({
    ...input,
    status: 'compiling',
    attempts: [],
    resultImageIds: [],
    updatedAt: input.createdAt
  });
}

export function prepareTaskDraft(
  task: ImageGenerationTask,
  draft: CompiledImageRequestDraftSnapshot,
  updatedAt: string
): ImageGenerationTask {
  ensureStatus(task, task.submissionMode === 'manual' ? ['compiling', 'awaiting-confirmation'] : ['compiling']);
  const parsedDraft = compiledImageRequestDraftSchema.parse(draft);
  return imageGenerationTaskSchema.parse({
    ...task,
    status: task.submissionMode === 'manual' ? 'awaiting-confirmation' : 'compiling',
    draft: parsedDraft,
    updatedAt
  });
}

export function submitTask(
  task: ImageGenerationTask,
  request: SubmittedImageRequestSnapshot,
  updatedAt: string
): ImageGenerationTask {
  ensureStatus(task, task.submissionMode === 'manual' ? ['awaiting-confirmation'] : ['compiling']);
  if (!task.draft) throw new Error('任务尚未完成提示词编译。');
  const parsedRequest = submittedImageRequestSchema.parse(request);
  if (stable(task.draft) !== stable(draftFromSubmitted(parsedRequest))) {
    throw new Error('提交快照必须来自玩家看到或自动编译的当前草稿。');
  }
  return imageGenerationTaskSchema.parse({ ...task, status: 'queued', submittedRequest: parsedRequest, updatedAt });
}

export function startTaskAttempt(task: ImageGenerationTask, startedAt: string): ImageGenerationTask {
  ensureStatus(task, ['queued']);
  return imageGenerationTaskSchema.parse({
    ...task,
    status: 'submitting',
    attempts: [...task.attempts, { attemptNumber: task.attempts.length + 1, startedAt, outcome: 'running' }],
    updatedAt: startedAt
  });
}

export function markTaskRemotePending(
  task: ImageGenerationTask,
  remoteHandle: RemoteImageTaskHandle,
  updatedAt: string
): ImageGenerationTask {
  ensureStatus(task, ['submitting']);
  return imageGenerationTaskSchema.parse({ ...task, status: 'remote-pending', remoteHandle, updatedAt });
}

export function markTaskDownloading(task: ImageGenerationTask, updatedAt: string): ImageGenerationTask {
  ensureStatus(task, ['submitting', 'remote-pending']);
  return imageGenerationTaskSchema.parse({ ...task, status: 'downloading', updatedAt });
}

export function markTaskPersisting(task: ImageGenerationTask, updatedAt: string): ImageGenerationTask {
  ensureStatus(task, ['downloading']);
  return imageGenerationTaskSchema.parse({ ...task, status: 'persisting', updatedAt });
}

export function succeedTask(
  task: ImageGenerationTask,
  resultImageIds: string[],
  primaryImageId: string,
  finishedAt: string
): ImageGenerationTask {
  ensureStatus(task, ['persisting']);
  return imageGenerationTaskSchema.parse({
    ...task,
    status: 'succeeded',
    resultImageIds,
    primaryImageId,
    attempts: finishRunningAttempt(task, 'succeeded', finishedAt),
    updatedAt: finishedAt,
    finishedAt
  });
}

export function failTask(
  task: ImageGenerationTask,
  error: ImageGenerationErrorSummary,
  finishedAt: string
): ImageGenerationTask {
  if (TERMINAL_STATUSES.has(task.status)) throw new Error(`终态任务 ${task.taskId} 不可再次失败。`);
  return imageGenerationTaskSchema.parse({
    ...task,
    status: 'failed',
    error,
    attempts: finishRunningAttempt(task, 'failed', finishedAt, error),
    updatedAt: finishedAt,
    finishedAt
  });
}

export function cancelTask(
  task: ImageGenerationTask,
  cancellation: ImageTaskCancellation
): ImageGenerationTask {
  if (TERMINAL_STATUSES.has(task.status)) throw new Error(`终态任务 ${task.taskId} 不可再次取消。`);
  return imageGenerationTaskSchema.parse({
    ...task,
    status: 'cancelled',
    cancellation,
    attempts: finishRunningAttempt(task, 'cancelled', cancellation.cancelledAt),
    updatedAt: cancellation.cancelledAt,
    finishedAt: cancellation.cancelledAt
  });
}

export function assertTaskEvolution(previous: ImageGenerationTask, next: ImageGenerationTask): void {
  const parsedPrevious = imageGenerationTaskSchema.parse(previous);
  const parsedNext = imageGenerationTaskSchema.parse(next);
  const immutableBefore = {
    taskId: parsedPrevious.taskId,
    saveId: parsedPrevious.saveId,
    source: parsedPrevious.source,
    submissionMode: parsedPrevious.submissionMode,
    sourceTaskId: parsedPrevious.sourceTaskId,
    intent: parsedPrevious.intent,
    createdAt: parsedPrevious.createdAt
  };
  const immutableAfter = {
    taskId: parsedNext.taskId,
    saveId: parsedNext.saveId,
    source: parsedNext.source,
    submissionMode: parsedNext.submissionMode,
    sourceTaskId: parsedNext.sourceTaskId,
    intent: parsedNext.intent,
    createdAt: parsedNext.createdAt
  };
  if (stable(immutableBefore) !== stable(immutableAfter)) throw new Error('任务不可变身份或意图被改写。');
  if (!ALLOWED_TRANSITIONS[parsedPrevious.status].includes(parsedNext.status)) {
    throw new Error(`非法任务状态迁移：${parsedPrevious.status} → ${parsedNext.status}`);
  }
  if (parsedPrevious.submittedRequest && stable(parsedPrevious.submittedRequest) !== stable(parsedNext.submittedRequest)) {
    throw new Error('不可变提交快照被改写。');
  }
  if (parsedNext.attempts.length < parsedPrevious.attempts.length) throw new Error('任务尝试记录不可删除。');
  if (stable(parsedNext.attempts.slice(0, parsedPrevious.attempts.length)) !== stable(parsedPrevious.attempts)) {
    const mayFinishLast = parsedPrevious.attempts.at(-1)?.outcome === 'running';
    const immutablePrefixLength = mayFinishLast ? Math.max(0, parsedPrevious.attempts.length - 1) : parsedPrevious.attempts.length;
    if (stable(parsedNext.attempts.slice(0, immutablePrefixLength)) !== stable(parsedPrevious.attempts.slice(0, immutablePrefixLength))) {
      throw new Error('历史任务尝试记录被改写。');
    }
  }
}
