import { characterImageGenerationBatchSchema, imageGenerationTaskSchema } from './schemas';
import { createImageGenerationTask } from './taskStateMachine';
import type {
  CharacterImageGenerationBatch,
  CharacterVisualPurpose,
  ImageGenerationTask
} from './types';

const ACTIVE_TASK_STATUSES = new Set([
  'compiling',
  'awaiting-confirmation',
  'queued',
  'submitting',
  'remote-pending',
  'downloading',
  'persisting'
]);

export function deriveCharacterBatchStatus(
  batch: CharacterImageGenerationBatch,
  tasksById: Record<string, ImageGenerationTask>
): CharacterImageGenerationBatch['status'] {
  const tasks = batch.taskIds.map((taskId) => {
    const task = tasksById[taskId];
    if (!task) throw new Error(`批次缺少任务 ${taskId}。`);
    return imageGenerationTaskSchema.parse(task);
  });
  if (tasks.some((task) => ACTIVE_TASK_STATUSES.has(task.status))) {
    if (tasks.every((task) => task.status === 'compiling')) return 'compiling';
    if (tasks.every((task) => ['compiling', 'awaiting-confirmation'].includes(task.status))) {
      return 'awaiting-confirmation';
    }
    return 'running';
  }
  const succeeded = tasks.filter((task) => task.status === 'succeeded').length;
  if (succeeded === tasks.length) return 'succeeded';
  if (succeeded > 0) return 'partially-succeeded';
  if (tasks.every((task) => task.status === 'cancelled')) return 'cancelled';
  return 'failed';
}

export function refreshCharacterBatchStatus(
  batch: CharacterImageGenerationBatch,
  tasksById: Record<string, ImageGenerationTask>,
  updatedAt: string
): CharacterImageGenerationBatch {
  return characterImageGenerationBatchSchema.parse({
    ...batch,
    status: deriveCharacterBatchStatus(batch, tasksById),
    updatedAt
  });
}

export function createFailedPurposeRetryBatch(input: {
  previousBatch: CharacterImageGenerationBatch;
  tasksById: Record<string, ImageGenerationTask>;
  batchId: string;
  taskIdForPurpose: (purpose: CharacterVisualPurpose) => string;
  intentIdForPurpose: (purpose: CharacterVisualPurpose) => string;
  createdAt: string;
}): { batch: CharacterImageGenerationBatch; tasks: ImageGenerationTask[] } {
  const previous = characterImageGenerationBatchSchema.parse(input.previousBatch);
  const failedTasks = previous.taskIds
    .map((taskId) => input.tasksById[taskId])
    .filter((task): task is ImageGenerationTask => Boolean(task) && task.status === 'failed');
  if (!failedTasks.length) throw new Error('原批次没有可重试的失败景别。');

  const tasks = failedTasks.map((oldTask) => {
    if (oldTask.intent.type !== 'character-image') throw new Error('角色批次引用了非角色图片任务。');
    const purpose = oldTask.intent.purpose;
    return createImageGenerationTask({
      taskId: input.taskIdForPurpose(purpose),
      saveId: previous.saveId,
      source: 'retry',
      submissionMode: 'manual',
      sourceTaskId: oldTask.taskId,
      intent: {
        ...oldTask.intent,
        intentId: input.intentIdForPurpose(purpose),
        createdAt: input.createdAt
      },
      createdAt: input.createdAt
    });
  });
  const selectedPurposes = tasks.map((task) => {
    if (task.intent.type !== 'character-image') throw new Error('重试任务意图无效。');
    return task.intent.purpose;
  });
  const batch = characterImageGenerationBatchSchema.parse({
    ...previous,
    batchId: input.batchId,
    sourceBatchId: previous.batchId,
    selectedPurposes,
    source: 'manual-retry-failed',
    status: 'compiling',
    taskIds: tasks.map((task) => task.taskId),
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  });
  return { batch, tasks };
}
