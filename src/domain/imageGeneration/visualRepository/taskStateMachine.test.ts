import { describe, expect, it } from 'vitest';
import {
  assertTaskEvolution,
  cancelTask,
  createImageGenerationTask,
  failTask,
  markTaskDownloading,
  markTaskPersisting,
  markTaskRemotePending,
  prepareTaskDraft,
  startTaskAttempt,
  submitTask,
  succeedTask
} from './taskStateMachine';
import { createCharacterIntent, createDraft, createSubmittedRequest } from './testFixtures';

describe('image generation task state machine', () => {
  it('keeps a manual task unsubmitted while awaiting player confirmation', () => {
    const intent = createCharacterIntent();
    const compiling = createImageGenerationTask({
      taskId: 'task_manual',
      saveId: intent.saveId,
      source: 'manual',
      submissionMode: 'manual',
      intent,
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    const awaiting = prepareTaskDraft(compiling, createDraft(intent.intentId), '2026-07-22T00:00:01.000Z');

    expect(awaiting.status).toBe('awaiting-confirmation');
    expect(awaiting.submittedRequest).toBeUndefined();
    expect(awaiting.attempts).toEqual([]);
  });

  it('runs a synchronous task through an immutable submission into success', () => {
    const intent = createCharacterIntent();
    let task = createImageGenerationTask({
      taskId: 'task_success',
      saveId: intent.saveId,
      source: 'automatic',
      submissionMode: 'automatic',
      intent,
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    task = prepareTaskDraft(task, createDraft(intent.intentId), '2026-07-22T00:00:01.000Z');
    task = submitTask(task, createSubmittedRequest(intent.intentId), '2026-07-22T00:00:02.000Z');
    task = startTaskAttempt(task, '2026-07-22T00:00:03.000Z');
    task = markTaskDownloading(task, '2026-07-22T00:00:04.000Z');
    task = markTaskPersisting(task, '2026-07-22T00:00:05.000Z');
    task = succeedTask(task, ['image_1', 'image_2'], 'image_1', '2026-07-22T00:00:06.000Z');

    expect(task).toMatchObject({
      status: 'succeeded',
      resultImageIds: ['image_1', 'image_2'],
      primaryImageId: 'image_1'
    });
    expect(task.attempts).toEqual([expect.objectContaining({ outcome: 'succeeded' })]);
  });

  it('rejects skipped transitions and submitted request mutation', () => {
    const intent = createCharacterIntent();
    const compiling = createImageGenerationTask({
      taskId: 'task_guard',
      saveId: intent.saveId,
      source: 'automatic',
      submissionMode: 'automatic',
      intent,
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    expect(() => markTaskDownloading(compiling, '2026-07-22T00:00:01.000Z')).toThrow('不能从 compiling');

    const prepared = prepareTaskDraft(compiling, createDraft(intent.intentId), '2026-07-22T00:00:01.000Z');
    const queued = submitTask(prepared, createSubmittedRequest(intent.intentId), '2026-07-22T00:00:02.000Z');
    const submitting = startTaskAttempt(queued, '2026-07-22T00:00:03.000Z');
    const mutated = {
      ...submitting,
      submittedRequest: { ...submitting.submittedRequest!, positivePrompt: 'silently changed' }
    };
    expect(() => assertTaskEvolution(queued, mutated)).toThrow('提交快照被改写');
  });

  it('rejects a broad or mismatched provider parameter snapshot', () => {
    const intent = createCharacterIntent();
    const task = createImageGenerationTask({
      taskId: 'task_parameters',
      saveId: intent.saveId,
      source: 'automatic',
      submissionMode: 'automatic',
      intent,
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    const draft = createDraft(intent.intentId);

    expect(() => prepareTaskDraft(task, {
      ...draft,
      generationParameters: {
        providerType: 'xai-images',
        requestedImageCount: 1,
        aspectRatio: '3:4',
        resolution: '1k'
      }
    }, '2026-07-22T00:00:01.000Z')).toThrow('参数供应商与任务供应商不一致');
    expect(() => prepareTaskDraft(task, {
      ...draft,
      providerParams: { arbitrary: true }
    } as unknown as typeof draft, '2026-07-22T00:00:01.000Z')).toThrow();
  });

  it('cancels a remote task while preserving its remote handle and closing the attempt', () => {
    const intent = createCharacterIntent();
    let task = createImageGenerationTask({
      taskId: 'task_remote',
      saveId: intent.saveId,
      source: 'automatic',
      submissionMode: 'automatic',
      intent,
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    task = prepareTaskDraft(task, createDraft(intent.intentId), '2026-07-22T00:00:01.000Z');
    task = submitTask(task, createSubmittedRequest(intent.intentId), '2026-07-22T00:00:02.000Z');
    task = startTaskAttempt(task, '2026-07-22T00:00:03.000Z');
    task = markTaskRemotePending(task, {
      providerType: 'openai-images',
      remoteTaskId: 'remote_1',
      submittedAt: '2026-07-22T00:00:03.000Z'
    }, '2026-07-22T00:00:04.000Z');
    task = cancelTask(task, {
      reason: 'save-switched',
      remoteCancellation: 'unsupported',
      cancelledAt: '2026-07-22T00:00:05.000Z'
    });

    expect(task.status).toBe('cancelled');
    expect(task.remoteHandle?.remoteTaskId).toBe('remote_1');
    expect(task.attempts[0].outcome).toBe('cancelled');
  });

  it('records explicit terminal failure without creating image results', () => {
    const intent = createCharacterIntent();
    const compiling = createImageGenerationTask({
      taskId: 'task_failed',
      saveId: intent.saveId,
      source: 'automatic',
      submissionMode: 'automatic',
      intent,
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    const failed = failTask(compiling, { code: 'compile-failed', message: '转换失败', retriable: false }, '2026-07-22T00:00:01.000Z');
    expect(failed).toMatchObject({ status: 'failed', resultImageIds: [], error: { code: 'compile-failed' } });
  });
});
