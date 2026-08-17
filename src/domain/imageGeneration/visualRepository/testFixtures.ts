import {
  cancelTask,
  createImageGenerationTask,
  markTaskDownloading,
  markTaskPersisting,
  markTaskRemotePending,
  prepareTaskDraft,
  startTaskAttempt,
  submitTask
} from './taskStateMachine';
import type {
  CharacterImageIntent,
  CharacterVisualPurpose,
  CompiledImageRequestDraftSnapshot,
  ImageGenerationTask,
  SubmittedImageRequestSnapshot
} from './types';

export const TEST_ANCHOR = `【固定外观】黑发棕眼
【默认服装】深色夹克
【一致性要求】保持五官一致
【避免偏移】避免改变发色`;

export const TEST_PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export function createCharacterIntent(
  purpose: CharacterVisualPurpose = 'half-body-medium',
  suffix: string = purpose
): CharacterImageIntent {
  return {
    type: 'character-image',
    intentId: `intent_${suffix}`,
    saveId: 'save_a',
    actorId: 'actor_mei',
    purpose,
    anchorSnapshot: TEST_ANCHOR,
    additionalRequirementText: '保留红色发夹',
    additionalRequirementMode: 'persistent',
    referenceImageIds: [],
    createdAt: '2026-07-22T00:00:00.000Z'
  };
}

export function createDraft(intentId: string): CompiledImageRequestDraftSnapshot {
  return {
    intentId,
    imageProfileId: 'profile_openai',
    providerType: 'openai-images',
    connectionFingerprint: 'connection-fingerprint',
    executionFingerprint: 'execution-fingerprint',
    imageGenerationPresetId: 'preset_character',
    imageGenerationPresetRevision: 1,
    promptDialectPresetId: 'builtin-dialect-general-en',
    executionTarget: { kind: 'model', modelId: 'gpt-image-test' },
    positivePrompt: 'character portrait',
    negativePrompt: 'blurry',
    negativePromptMode: 'separate',
    targetAspectRatio: '3:4',
    generationParameters: {
      providerType: 'openai-images',
      requestedImageCount: 1,
      size: { mode: 'dimensions', width: 768, height: 1024 },
      quality: 'medium',
      outputFormat: 'png',
      background: 'opaque'
    },
    referenceImages: [],
    referenceImageTransport: { kind: 'none' },
    sourceAnchorHashes: ['a'.repeat(64)],
    compiledAt: '2026-07-22T00:00:01.000Z'
  };
}

export function createSubmittedRequest(intentId: string): SubmittedImageRequestSnapshot {
  return {
    ...createDraft(intentId),
    requestFingerprint: 'request-fingerprint',
    submittedAt: '2026-07-22T00:00:02.000Z',
    userEdited: false
  };
}

export function createPersistingTask(
  taskId = 'task_half',
  purpose: CharacterVisualPurpose = 'half-body-medium'
): ImageGenerationTask {
  const intent = createCharacterIntent(purpose, taskId);
  let task = createImageGenerationTask({
    taskId,
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
  return markTaskPersisting(task, '2026-07-22T00:00:05.000Z');
}

export function createCancelledRemoteTask(taskId = 'task_cancelled'): ImageGenerationTask {
  const intent = createCharacterIntent('avatar-close-up', taskId);
  let task = createImageGenerationTask({
    taskId,
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
  return cancelTask(task, {
    reason: 'turn-invalidated',
    remoteCancellation: 'unsupported',
    cancelledAt: '2026-07-22T00:00:05.000Z'
  });
}

export function createImageInput(imageId: string, blobKey = `blob_${imageId}`) {
  return {
    imageId,
    blobKey,
    blob: new Blob([TEST_PNG_BYTES.slice().buffer], { type: 'image/png' }),
    width: 1,
    height: 1
  };
}
