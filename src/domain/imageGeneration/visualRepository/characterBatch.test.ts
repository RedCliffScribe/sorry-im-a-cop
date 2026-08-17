import { describe, expect, it } from 'vitest';
import { createFailedPurposeRetryBatch, deriveCharacterBatchStatus } from './characterBatch';
import { cancelTask, failTask, succeedTask } from './taskStateMachine';
import { createPersistingTask, TEST_ANCHOR } from './testFixtures';
import type { CharacterImageGenerationBatch, ImageGenerationTask } from './types';

function createBatch(tasks: ImageGenerationTask[]): CharacterImageGenerationBatch {
  return {
    batchId: 'batch_original',
    saveId: 'save_a',
    actorId: 'actor_mei',
    anchorSnapshot: TEST_ANCHOR,
    anchorHash: 'a'.repeat(64),
    additionalRequirementText: '保留红色发夹',
    additionalRequirementMode: 'persistent',
    selectedPurposes: tasks.map((task) => {
      if (task.intent.type !== 'character-image') throw new Error('invalid fixture');
      return task.intent.purpose;
    }),
    source: 'manual-generate',
    status: 'running',
    taskIds: tasks.map((task) => task.taskId),
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z'
  };
}

describe('character image batch aggregation', () => {
  it('reports partial success without rolling back successful purposes', () => {
    const succeeded = succeedTask(createPersistingTask('task_avatar', 'avatar-close-up'), ['image_avatar'], 'image_avatar', '2026-07-22T00:00:06.000Z');
    const failed = failTask(createPersistingTask('task_half', 'half-body-medium'), { code: 'provider-error', message: '失败', retriable: true }, '2026-07-22T00:00:06.000Z');
    const cancelled = cancelTask(createPersistingTask('task_knee_up', 'knee-up-medium-full'), {
      reason: 'user', remoteCancellation: 'not-needed', cancelledAt: '2026-07-22T00:00:06.000Z'
    });
    const tasks = [succeeded, failed, cancelled];
    const batch = createBatch(tasks);
    const byId = Object.fromEntries(tasks.map((task) => [task.taskId, task]));

    expect(deriveCharacterBatchStatus(batch, byId)).toBe('partially-succeeded');
    expect(succeeded.resultImageIds).toEqual(['image_avatar']);
  });

  it('creates a new batch and new tasks for failed purposes only', () => {
    const succeeded = succeedTask(createPersistingTask('task_avatar', 'avatar-close-up'), ['image_avatar'], 'image_avatar', '2026-07-22T00:00:06.000Z');
    const failed = failTask(createPersistingTask('task_half', 'half-body-medium'), { code: 'provider-error', message: '失败', retriable: true }, '2026-07-22T00:00:06.000Z');
    const cancelled = cancelTask(createPersistingTask('task_full', 'full-body'), {
      reason: 'user', remoteCancellation: 'not-needed', cancelledAt: '2026-07-22T00:00:06.000Z'
    });
    const originalTasks = [succeeded, failed, cancelled];
    const previousBatch = createBatch(originalTasks);
    const tasksById = Object.fromEntries(originalTasks.map((task) => [task.taskId, task]));

    const retry = createFailedPurposeRetryBatch({
      previousBatch,
      tasksById,
      batchId: 'batch_retry',
      taskIdForPurpose: (purpose) => `retry_${purpose}`,
      intentIdForPurpose: (purpose) => `retry_intent_${purpose}`,
      createdAt: '2026-07-22T01:00:00.000Z'
    });

    expect(retry.batch).toMatchObject({
      sourceBatchId: 'batch_original',
      selectedPurposes: ['half-body-medium'],
      source: 'manual-retry-failed'
    });
    expect(retry.tasks).toHaveLength(1);
    expect(retry.tasks[0]).toMatchObject({ sourceTaskId: 'task_half', status: 'compiling' });
    expect(previousBatch.taskIds).toEqual(['task_avatar', 'task_half', 'task_full']);
  });
});
