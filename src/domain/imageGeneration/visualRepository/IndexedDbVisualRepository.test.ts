import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbImageProbeStore } from '../probe/IndexedDbImageProbeStore';
import {
  IndexedDbVisualRepository,
  VisualAssetBlobMismatchError,
  VisualAssetBoundError,
  VisualStorageQuotaError,
  createVisualBindingId
} from './IndexedDbVisualRepository';
import {
  createImageGenerationTask,
  markTaskDownloading,
  markTaskPersisting,
  prepareTaskDraft,
  startTaskAttempt,
  submitTask
} from './taskStateMachine';
import {
  createCancelledRemoteTask,
  createDraft,
  createImageInput,
  createPersistingTask,
  createSubmittedRequest,
  TEST_ANCHOR
} from './testFixtures';
import type { SceneImageIntent, StoredScenePlan } from './types';

const DB_NAME = 'visual-repository-test';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

beforeEach(async () => {
  await Promise.all([
    deleteDatabase(DB_NAME),
    deleteDatabase('visual-import-replacement-test'),
    deleteDatabase('visual-isolation-test'),
    deleteDatabase('probe-isolation-test')
  ]);
});

describe('IndexedDbVisualRepository', () => {
  it('safely initializes an empty visual partition for an old save with no visual data', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);

    const snapshot = await repository.loadSnapshot('legacy_save');

    expect(snapshot).toEqual({
      schemaVersion: 1,
      saveId: 'legacy_save',
      characterAnchors: {},
      scenePlans: {},
      tasks: {},
      characterBatches: {},
      assets: {},
      bindings: {},
      storySceneDisplayStates: {}
    });
  });

  it('replaces the unique current actor anchor instead of creating an anchor version chain', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    await repository.saveCharacterAnchor({
      anchorId: 'anchor_old',
      saveId: 'save_a',
      actorId: 'actor_mei',
      anchorText: TEST_ANCHOR,
      source: 'actor-profile-api',
      sourceImageIds: [],
      updatedAt: '2026-07-22T00:00:00.000Z'
    });
    await repository.saveCharacterAnchor({
      anchorId: 'anchor_current',
      saveId: 'save_a',
      actorId: 'actor_mei',
      anchorText: `${TEST_ANCHOR}\n玩家已修改`,
      persistentAdditionalRequirementText: '保留红色发夹',
      source: 'user-edited',
      sourceImageIds: [],
      updatedAt: '2026-07-22T00:01:00.000Z'
    });

    const snapshot = await repository.loadSnapshot('save_a');
    expect(Object.keys(snapshot.characterAnchors)).toEqual(['anchor_current']);
    expect(snapshot.characterAnchors.anchor_current.persistentAdditionalRequirementText).toBe('保留红色发夹');
  });

  it('persists every returned image and blob atomically while binding only the first image', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const task = createPersistingTask();
    await repository.saveTask(task);

    const assets = await repository.completeTaskWithImages('save_a', task.taskId, [
      createImageInput('image_primary'),
      createImageInput('image_candidate')
    ], '2026-07-22T00:00:06.000Z');
    const snapshot = await repository.loadSnapshot('save_a');
    const subject = { type: 'actor' as const, saveId: 'save_a', actorId: 'actor_mei' };
    const bindingId = createVisualBindingId('save_a', subject, 'half-body-medium');

    expect(assets.map((asset) => asset.imageId)).toEqual(['image_primary', 'image_candidate']);
    expect(Object.keys(snapshot.assets)).toHaveLength(2);
    expect(await repository.getBlob('blob_image_primary')).toBeInstanceOf(Blob);
    expect(await repository.getBlob('blob_image_candidate')).toBeInstanceOf(Blob);
    expect(snapshot.tasks[task.taskId]).toMatchObject({
      status: 'succeeded',
      resultImageIds: ['image_primary', 'image_candidate'],
      primaryImageId: 'image_primary'
    });
    expect(snapshot.bindings[bindingId].imageId).toBe('image_primary');
    expect(await repository.getStorageSummary('save_a')).toEqual({
      saveId: 'save_a',
      metadataAssetCount: 2,
      storedBlobCount: 2,
      storedBytes: 16,
      missingBlobCount: 0,
      missingImageIds: [],
      corruptBlobCount: 0,
      corruptImageIds: [],
      orphanBlobCount: 0
    });

    const db = await openDatabase(DB_NAME);
    try {
      const transaction = db.transaction(['visual-partitions', 'visual-blobs'], 'readonly');
      const rawPartition = await requestToPromise<unknown>(transaction.objectStore('visual-partitions').get('save_a'));
      const storedBlobCount = await requestToPromise<number>(transaction.objectStore('visual-blobs').count());
      expect(JSON.stringify(rawPartition)).not.toContain('"bytes"');
      expect(storedBlobCount).toBe(2);
    } finally {
      db.close();
    }

    const exported = await repository.exportSave('save_a');
    await repository.replaceSaveFromArchive(exported.snapshot, []);
    expect(await repository.getStorageSummary('save_a')).toEqual({
      saveId: 'save_a',
      metadataAssetCount: 2,
      storedBlobCount: 0,
      storedBytes: 0,
      missingBlobCount: 2,
      missingImageIds: ['image_candidate', 'image_primary'],
      corruptBlobCount: 0,
      corruptImageIds: [],
      orphanBlobCount: 0
    });
  });

  it('atomically saves a character batch with its complete task set', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const first = createPersistingTask('task_half', 'half-body-medium');
    const second = createPersistingTask('task_full', 'full-body');
    await repository.saveCharacterBatchWithTasks({
      batchId: 'batch_actor_mei',
      saveId: 'save_a',
      actorId: 'actor_mei',
      anchorSnapshot: TEST_ANCHOR,
      anchorHash: 'a'.repeat(64),
      additionalRequirementText: '保留红色发夹',
      additionalRequirementMode: 'persistent',
      selectedPurposes: ['half-body-medium', 'full-body'],
      source: 'manual-generate',
      status: 'running',
      taskIds: [first.taskId, second.taskId],
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:05.000Z'
    }, [first, second]);

    const snapshot = await repository.loadSnapshot('save_a');
    expect(Object.keys(snapshot.tasks).sort()).toEqual(['task_full', 'task_half']);
    expect(snapshot.characterBatches.batch_actor_mei.taskIds).toEqual(['task_half', 'task_full']);

    expect(() => repository.saveCharacterBatchWithTasks({
      ...snapshot.characterBatches.batch_actor_mei,
      taskIds: ['task_half']
    }, [first])).toThrow();
    expect(Object.keys((await repository.loadSnapshot('save_a')).tasks)).toHaveLength(2);
  });

  it('allows an existing actor asset to be rebound and unbound without deleting it', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const task = createPersistingTask();
    await repository.saveTask(task);
    await repository.completeTaskWithImages('save_a', task.taskId, [
      createImageInput('image_primary'),
      createImageInput('image_candidate')
    ], '2026-07-22T00:00:06.000Z');
    const subject = { type: 'actor' as const, saveId: 'save_a', actorId: 'actor_mei' };
    const bindingId = createVisualBindingId('save_a', subject, 'half-body-medium');

    await repository.bindAsset({
      bindingId,
      saveId: 'save_a',
      subject,
      purpose: 'half-body-medium',
      imageId: 'image_candidate',
      updatedAt: '2026-07-22T00:01:00.000Z'
    });
    expect((await repository.loadSnapshot('save_a')).bindings[bindingId].imageId).toBe('image_candidate');

    await repository.unbindAsset('save_a', bindingId);
    const snapshot = await repository.loadSnapshot('save_a');
    expect(snapshot.bindings).toEqual({});
    expect(snapshot.assets.image_candidate).toBeDefined();
  });

  it('keeps ScenePlan immutable and atomically reconciles scene binding, display restoration, unbinding and deletion', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const plan: StoredScenePlan = {
      planId: 'plan_1',
      saveId: 'save_a',
      sourceTurnId: 'turn_1',
      sourceStoryTextHash: 'b'.repeat(64),
      mode: 'manual',
      requestedMaxScenes: 1,
      shots: [{
        shotId: 'shot_1',
        placement: { blockIndex: 0, blockHash: 'c'.repeat(64) },
        order: 0,
        sceneSummary: '雨夜街头',
        knownActorIds: ['actor_mei'],
        actorVisualStates: [{ actorId: 'actor_mei', sceneSpecificAppearance: '湿透的白衬衣' }],
        unboundCharacterDescriptions: [],
        locationDescription: '香港街头',
        actionDescription: '站在路灯下',
        atmosphere: '潮湿',
        composition: '中景'
      }],
      createdAt: '2026-07-22T00:00:00.000Z'
    };
    await repository.saveScenePlan(plan);
    await expect(repository.saveScenePlan({ ...plan, mode: 'automatic' })).rejects.toThrow('不可原地改写');
    await repository.saveStorySceneDisplayState({
      saveId: 'save_a',
      turnId: 'turn_1',
      activeShotIds: ['shot_1'],
      updatedAt: '2026-07-22T00:00:01.000Z'
    });
    const intent: SceneImageIntent = {
      type: 'scene-image',
      intentId: 'intent_scene',
      saveId: 'save_a',
      turnId: 'turn_1',
      scenePlanId: 'plan_1',
      shotId: 'shot_1',
      participantAnchorSnapshots: [{ actorId: 'actor_mei', anchorText: TEST_ANCHOR }],
      oneTimeInstruction: '',
      referenceImageIds: [],
      createdAt: '2026-07-22T00:00:00.000Z'
    };
    let task = createImageGenerationTask({
      taskId: 'task_scene', saveId: 'save_a', source: 'manual', submissionMode: 'manual', intent,
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    task = prepareTaskDraft(task, createDraft(intent.intentId), '2026-07-22T00:00:01.000Z');
    task = submitTask(task, createSubmittedRequest(intent.intentId), '2026-07-22T00:00:02.000Z');
    task = startTaskAttempt(task, '2026-07-22T00:00:03.000Z');
    task = markTaskDownloading(task, '2026-07-22T00:00:04.000Z');
    task = markTaskPersisting(task, '2026-07-22T00:00:05.000Z');
    await repository.saveTask(task);
    await repository.completeTaskWithImages('save_a', task.taskId, [createImageInput('image_scene')], '2026-07-22T00:00:06.000Z');

    let snapshot = await repository.loadSnapshot('save_a');
    expect(snapshot.scenePlans.plan_1).toEqual(plan);
    expect(snapshot.storySceneDisplayStates.turn_1.activeShotIds).toEqual(['shot_1']);
    expect(Object.values(snapshot.bindings)).toEqual([
      expect.objectContaining({ purpose: 'turn-scene', variantKey: 'shot_1', imageId: 'image_scene' })
    ]);

    const bindingId = Object.keys(snapshot.bindings)[0]!;
    await repository.unbindAsset('save_a', bindingId);
    snapshot = await repository.loadSnapshot('save_a');
    expect(snapshot.bindings).toEqual({});
    expect(snapshot.storySceneDisplayStates.turn_1.activeShotIds).toEqual([]);
    expect(snapshot.assets.image_scene).toBeDefined();

    await repository.restoreSceneAssetToStory('save_a', 'image_scene', '2026-07-22T00:01:00.000Z');
    snapshot = await repository.loadSnapshot('save_a');
    expect(snapshot.storySceneDisplayStates.turn_1.activeShotIds).toEqual(['shot_1']);
    expect(Object.values(snapshot.bindings)).toEqual([
      expect.objectContaining({ purpose: 'turn-scene', variantKey: 'shot_1', imageId: 'image_scene' })
    ]);

    await repository.saveStorySceneDisplayState({
      saveId: 'save_a',
      turnId: 'turn_1',
      activeShotIds: ['shot_1'],
      pendingReplacement: {
        scenePlanId: 'plan_pending',
        operation: 'replace-shot',
        shotIds: ['shot_pending'],
        targetShotIds: ['shot_1']
      },
      updatedAt: '2026-07-22T00:01:01.000Z'
    });
    const snapshotBeforeBlockedDelete = await repository.loadSnapshot('save_a');
    await expect(repository.deleteAsset('save_a', 'image_scene', true)).rejects.toThrow('仍在结算');
    await expect(repository.unbindAsset('save_a', Object.keys(snapshot.bindings)[0]!)).rejects.toThrow('仍在结算');
    expect(await repository.loadSnapshot('save_a')).toEqual(snapshotBeforeBlockedDelete);
    await repository.saveStorySceneDisplayState({
      saveId: 'save_a',
      turnId: 'turn_1',
      activeShotIds: ['shot_1'],
      updatedAt: '2026-07-22T00:01:02.000Z'
    });

    await repository.deleteAsset('save_a', 'image_scene', true);
    snapshot = await repository.loadSnapshot('save_a');
    expect(snapshot.bindings).toEqual({});
    expect(snapshot.storySceneDisplayStates.turn_1.activeShotIds).toEqual([]);
    expect(snapshot.assets).not.toHaveProperty('image_scene');
    expect(await repository.getBlob('blob_image_scene')).toBeNull();
  });

  it('preserves the old binding and task state when a later image transaction is invalid', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const oldTask = createPersistingTask('task_old');
    await repository.saveTask(oldTask);
    await repository.completeTaskWithImages('save_a', oldTask.taskId, [createImageInput('image_old')], '2026-07-22T00:00:06.000Z');
    const newTask = createPersistingTask('task_new');
    await repository.saveTask(newTask);

    await expect(repository.completeTaskWithImages('save_a', newTask.taskId, [
      createImageInput('image_new', 'blob_image_old')
    ], '2026-07-22T00:01:00.000Z')).rejects.toThrow('blobKey 重复');

    const snapshot = await repository.loadSnapshot('save_a');
    expect(snapshot.tasks.task_new.status).toBe('persisting');
    expect(Object.values(snapshot.bindings)).toEqual([expect.objectContaining({ imageId: 'image_old' })]);
    expect(snapshot.assets).not.toHaveProperty('image_new');
  });

  it('rolls back metadata and bindings when browser image storage reports quota exhaustion', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const task = createPersistingTask();
    await repository.saveTask(task);
    const addSpy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
      throw new DOMException('storage full', 'QuotaExceededError');
    });

    try {
      await expect(repository.completeTaskWithImages(
        'save_a',
        task.taskId,
        [createImageInput('image_quota')],
        '2026-07-22T00:00:06.000Z'
      )).rejects.toBeInstanceOf(VisualStorageQuotaError);
    } finally {
      addSpy.mockRestore();
    }

    const snapshot = await repository.loadSnapshot('save_a');
    expect(snapshot.tasks[task.taskId].status).toBe('persisting');
    expect(snapshot.assets).toEqual({});
    expect(snapshot.bindings).toEqual({});
    expect(await repository.getBlob('blob_image_quota')).toBeNull();

    await repository.completeTaskWithImages(
      'save_a',
      task.taskId,
      [createImageInput('image_after_quota')],
      '2026-07-22T00:00:07.000Z'
    );
    expect((await repository.loadSnapshot('save_a')).assets.image_after_quota).toBeDefined();
  });

  it('rolls back the whole transaction when an asynchronous IndexedDB request fails', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    await repository.importUserImage({
      ...createImageInput('image_other_save', 'blob_global_collision'),
      saveId: 'save_b',
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    const task = createPersistingTask();
    await repository.saveTask(task);

    await expect(repository.completeTaskWithImages(
      'save_a',
      task.taskId,
      [createImageInput('image_collision', 'blob_global_collision')],
      '2026-07-22T00:00:06.000Z'
    )).rejects.toBeDefined();

    const snapshot = await repository.loadSnapshot('save_a');
    expect(snapshot.tasks[task.taskId].status).toBe('persisting');
    expect(snapshot.assets).toEqual({});
    expect(snapshot.bindings).toEqual({});
    expect((await repository.loadSnapshot('save_b')).assets.image_other_save).toBeDefined();
  });

  it('keeps the previous archive intact when replacement is interrupted during Blob writes', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const oldTask = createPersistingTask('task_old_archive');
    await repository.saveTask(oldTask);
    await repository.completeTaskWithImages(
      'save_a',
      oldTask.taskId,
      [createImageInput('image_old_archive')],
      '2026-07-22T00:00:06.000Z'
    );
    const before = await repository.loadSnapshot('save_a');

    const source = new IndexedDbVisualRepository('visual-import-replacement-test');
    const replacementTask = createPersistingTask('task_replacement_archive');
    await source.saveTask(replacementTask);
    await source.completeTaskWithImages(
      'save_a',
      replacementTask.taskId,
      [createImageInput('image_replacement_archive')],
      '2026-07-22T00:01:06.000Z'
    );
    const replacement = await source.exportSave('save_a');
    const addSpy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
      throw new DOMException('storage full', 'QuotaExceededError');
    });

    try {
      await expect(repository.replaceSaveFromArchive(
        replacement.snapshot,
        replacement.blobs
      )).rejects.toBeInstanceOf(VisualStorageQuotaError);
    } finally {
      addSpy.mockRestore();
    }

    expect(await repository.loadSnapshot('save_a')).toEqual(before);
    expect(await repository.getBlob('blob_image_old_archive')).toBeInstanceOf(Blob);
    expect(await repository.getBlob('blob_image_replacement_archive')).toBeNull();
  });

  it('rolls back asset deletion when the Blob delete step is interrupted', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const task = createPersistingTask();
    await repository.saveTask(task);
    await repository.completeTaskWithImages(
      'save_a',
      task.taskId,
      [createImageInput('image_delete_rollback')],
      '2026-07-22T00:00:06.000Z'
    );
    const before = await repository.loadSnapshot('save_a');
    const deleteSpy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(() => {
      throw new Error('injected delete interruption');
    });

    try {
      await expect(repository.deleteAsset('save_a', 'image_delete_rollback', true))
        .rejects.toThrow('injected delete interruption');
    } finally {
      deleteSpy.mockRestore();
    }

    expect(await repository.loadSnapshot('save_a')).toEqual(before);
    expect(await repository.getBlob('blob_image_delete_rollback')).toBeInstanceOf(Blob);
  });

  it('reports corrupt and orphaned Blob rows without hiding the rest of the storage summary', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    await repository.importUserImage({
      ...createImageInput('image_corrupt'),
      saveId: 'save_a',
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    const db = await openDatabase(DB_NAME);
    try {
      const transaction = db.transaction('visual-blobs', 'readwrite');
      const store = transaction.objectStore('visual-blobs');
      store.put({
        blobKey: 'blob_image_corrupt',
        saveId: 'save_a',
        imageId: 'image_corrupt',
        mimeType: 'image/png',
        bytes: 'not-an-array-buffer'
      });
      store.add({
        blobKey: 'blob_orphan',
        saveId: 'save_a',
        imageId: 'image_orphan',
        mimeType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]).buffer
      });
      await transactionDone(transaction);
    } finally {
      db.close();
    }

    expect(await repository.getStorageSummary('save_a')).toEqual({
      saveId: 'save_a',
      metadataAssetCount: 1,
      storedBlobCount: 2,
      storedBytes: 3,
      missingBlobCount: 0,
      missingImageIds: [],
      corruptBlobCount: 1,
      corruptImageIds: ['image_corrupt'],
      orphanBlobCount: 1
    });
    await expect(repository.getBlob('blob_image_corrupt')).rejects.toThrow('Blob 字段无效');

    await repository.clearSave('save_a');
    expect(await repository.getBlob('blob_image_corrupt')).toBeNull();
    expect(await repository.getBlob('blob_orphan')).toBeNull();
  });

  it('deep-checks content hashes one Blob at a time and keeps metadata and bindings after corrupt cleanup', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const task = createPersistingTask();
    await repository.saveTask(task);
    await repository.completeTaskWithImages(
      'save_a',
      task.taskId,
      [createImageInput('image_hash_corrupt')],
      '2026-07-22T00:00:06.000Z'
    );
    const db = await openDatabase(DB_NAME);
    try {
      const transaction = db.transaction('visual-blobs', 'readwrite');
      const store = transaction.objectStore('visual-blobs');
      const row = await requestToPromise<Record<string, unknown>>(store.get('blob_image_hash_corrupt'));
      const bytes = new Uint8Array(row.bytes as ArrayBuffer);
      bytes[bytes.length - 1] ^= 0xff;
      store.put({ ...row, bytes: bytes.buffer });
      await transactionDone(transaction);
    } finally {
      db.close();
    }

    expect((await repository.getStorageSummary('save_a')).corruptBlobCount).toBe(0);
    const progress: Array<[number, number]> = [];
    const report = await repository.inspectStorageIntegrity('save_a', {
      onProgress: (value) => progress.push([value.checkedBlobCount, value.totalBlobCount])
    });
    expect(progress).toEqual([[0, 1], [1, 1]]);
    expect(report.deepCheckedBlobCount).toBe(1);
    expect(report.summary.corruptImageIds).toEqual(['image_hash_corrupt']);
    const corruptIssue = report.issues.find((issue) => issue.imageId === 'image_hash_corrupt');
    expect(corruptIssue).toMatchObject({
      kind: 'corrupt',
      reason: 'content-hash-mismatch',
      blobKey: 'blob_image_hash_corrupt'
    });

    const bindingBefore = (await repository.loadSnapshot('save_a')).bindings;
    const result = await repository.cleanupStorageIssues('save_a', [corruptIssue!]);
    expect(result).toMatchObject({
      removedBlobCount: 1,
      affectedImageIds: ['image_hash_corrupt']
    });
    const snapshot = await repository.loadSnapshot('save_a');
    expect(snapshot.assets.image_hash_corrupt).toBeDefined();
    expect(snapshot.bindings).toEqual(bindingBefore);
    expect(await repository.getBlob('blob_image_hash_corrupt')).toBeNull();
    expect(await repository.getStorageSummary('save_a')).toMatchObject({
      missingBlobCount: 1,
      corruptBlobCount: 0,
      orphanBlobCount: 0
    });
  });

  it('restores only the exact original file while preserving the immutable asset and current binding', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const task = createPersistingTask();
    const original = createImageInput('image_restore');
    await repository.saveTask(task);
    await repository.completeTaskWithImages(
      'save_a',
      task.taskId,
      [original],
      '2026-07-22T00:00:06.000Z'
    );
    const before = await repository.loadSnapshot('save_a');
    const archive = await repository.exportSave('save_a');
    await repository.replaceSaveFromArchive(archive.snapshot, []);
    expect(await repository.getBlob(original.blobKey)).toBeNull();

    const originalBytes = new Uint8Array(await original.blob.arrayBuffer());
    const differentBytes = new Uint8Array(originalBytes.byteLength + 1);
    differentBytes.set(originalBytes);
    differentBytes[differentBytes.length - 1] = 1;
    await expect(repository.restoreAssetBlob('save_a', 'image_restore', {
      blob: new Blob([differentBytes], { type: 'image/png' }),
      width: 1,
      height: 1
    })).rejects.toBeInstanceOf(VisualAssetBlobMismatchError);
    expect(await repository.getBlob(original.blobKey)).toBeNull();

    const restored = await repository.restoreAssetBlob('save_a', 'image_restore', {
      blob: original.blob,
      width: 1,
      height: 1
    });
    expect(restored).toEqual(before.assets.image_restore);
    const after = await repository.loadSnapshot('save_a');
    expect(after.assets.image_restore).toEqual(before.assets.image_restore);
    expect(after.bindings).toEqual(before.bindings);
    expect(await repository.getBlob(original.blobKey)).toBeInstanceOf(Blob);
  });

  it('cleans only the explicitly inspected orphan rows from the current save partition', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    await repository.loadSnapshot('save_a');
    const db = await openDatabase(DB_NAME);
    try {
      const transaction = db.transaction('visual-blobs', 'readwrite');
      const store = transaction.objectStore('visual-blobs');
      store.add({
        blobKey: 'blob_orphan_a',
        saveId: 'save_a',
        imageId: 'image_orphan_a',
        mimeType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]).buffer
      });
      store.add({
        blobKey: 'blob_orphan_b',
        saveId: 'save_b',
        imageId: 'image_orphan_b',
        mimeType: 'image/png',
        bytes: new Uint8Array([4, 5, 6, 7]).buffer
      });
      await transactionDone(transaction);
    } finally {
      db.close();
    }

    const report = await repository.inspectStorageIntegrity('save_a');
    const orphanIssues = report.issues.filter((issue) => issue.kind === 'orphan');
    expect(orphanIssues).toEqual([expect.objectContaining({
      blobKey: 'blob_orphan_a',
      byteLength: 3
    })]);
    expect(await repository.cleanupStorageIssues('save_a', orphanIssues)).toEqual({
      removedBlobCount: 1,
      removedBytes: 3,
      affectedImageIds: ['image_orphan_a']
    });
    expect(await repository.getBlob('blob_orphan_a')).toBeNull();
    expect(await repository.getBlob('blob_orphan_b')).toBeInstanceOf(Blob);
  });

  it('rolls back the complete maintenance cleanup when a Blob delete is interrupted', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    await repository.loadSnapshot('save_a');
    const db = await openDatabase(DB_NAME);
    try {
      const transaction = db.transaction('visual-blobs', 'readwrite');
      const store = transaction.objectStore('visual-blobs');
      for (const blobKey of ['blob_cleanup_a', 'blob_cleanup_b']) {
        store.add({
          blobKey,
          saveId: 'save_a',
          imageId: blobKey.replace('blob_', 'image_'),
          mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]).buffer
        });
      }
      await transactionDone(transaction);
    } finally {
      db.close();
    }
    const issues = (await repository.inspectStorageIntegrity('save_a')).issues
      .filter((issue) => issue.kind === 'orphan');
    const deleteSpy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(() => {
      throw new Error('injected maintenance delete interruption');
    });

    try {
      await expect(repository.cleanupStorageIssues('save_a', issues))
        .rejects.toThrow('injected maintenance delete interruption');
    } finally {
      deleteSpy.mockRestore();
    }
    expect(await repository.getBlob('blob_cleanup_a')).toBeInstanceOf(Blob);
    expect(await repository.getBlob('blob_cleanup_b')).toBeInstanceOf(Blob);
  });

  it('rolls back an exact-file restore on quota exhaustion and keeps the write queue usable', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const task = createPersistingTask();
    const original = createImageInput('image_restore_quota');
    await repository.saveTask(task);
    await repository.completeTaskWithImages(
      'save_a',
      task.taskId,
      [original],
      '2026-07-22T00:00:06.000Z'
    );
    const archive = await repository.exportSave('save_a');
    await repository.replaceSaveFromArchive(archive.snapshot, []);
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('storage full', 'QuotaExceededError');
    });

    try {
      await expect(repository.restoreAssetBlob('save_a', original.imageId, {
        blob: original.blob,
        width: original.width,
        height: original.height
      })).rejects.toBeInstanceOf(VisualStorageQuotaError);
    } finally {
      putSpy.mockRestore();
    }
    expect(await repository.getBlob(original.blobKey)).toBeNull();
    await repository.restoreAssetBlob('save_a', original.imageId, {
      blob: original.blob,
      width: original.width,
      height: original.height
    });
    expect(await repository.getBlob(original.blobKey)).toBeInstanceOf(Blob);
  });

  it('cancels a requested deep inspection without changing the visual partition', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    await repository.importUserImage({
      ...createImageInput('image_cancel_scan'),
      saveId: 'save_a',
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    const before = await repository.exportSave('save_a');
    const controller = new AbortController();
    controller.abort();

    await expect(repository.inspectStorageIntegrity('save_a', { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(await repository.loadSnapshot('save_a')).toEqual(before.snapshot);
    expect(await repository.getBlob('blob_image_cancel_scan')).toBeInstanceOf(Blob);
  });

  it('reads export metadata and Blob rows without delegating to a separate snapshot read', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    await repository.importUserImage({
      ...createImageInput('image_export'),
      saveId: 'save_a',
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    const splitReadSpy = vi.spyOn(repository, 'loadSnapshot');

    const archive = await repository.exportSave('save_a');

    expect(splitReadSpy).not.toHaveBeenCalled();
    expect(archive.snapshot.assets.image_export).toBeDefined();
    expect(archive.blobs).toHaveLength(1);
  });

  it('stores a cancelled task late result as an unbound asset and never changes the cancelled task', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const task = createCancelledRemoteTask();
    await repository.saveTask(task);

    const assets = await repository.persistLateTaskImages('save_a', task.taskId, [
      createImageInput('image_late')
    ], '2026-07-22T00:01:00.000Z');
    const snapshot = await repository.loadSnapshot('save_a');

    expect(assets[0]).toMatchObject({ lateResultOfTaskId: task.taskId, sourceTaskId: task.taskId });
    expect(snapshot.tasks[task.taskId]).toEqual(task);
    expect(snapshot.bindings).toEqual({});
    expect(snapshot.assets.image_late.lateResultOfTaskId).toBe(task.taskId);
  });

  it('imports a player image into the save partition and can atomically bind it as the current character view', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const image = createImageInput('image_imported');
    const subject = { type: 'actor' as const, saveId: 'save_a', actorId: 'actor_mei' };

    const result = await repository.importUserImage({
      ...image,
      saveId: 'save_a',
      createdAt: '2026-07-22T00:00:00.000Z',
      originSubject: subject,
      originPurpose: 'half-body-medium',
      bindAsCurrent: true
    });
    const snapshot = await repository.loadSnapshot('save_a');

    expect(result.created).toBe(true);
    expect(result.asset).toMatchObject({ source: 'user-imported', originPurpose: 'half-body-medium' });
    expect(result.binding?.imageId).toBe('image_imported');
    expect(snapshot.assets.image_imported.source).toBe('user-imported');
    expect(Object.values(snapshot.bindings)).toEqual([
      expect.objectContaining({ imageId: 'image_imported', purpose: 'half-body-medium', subject })
    ]);
    expect(await repository.getBlob(image.blobKey)).toBeInstanceOf(Blob);
  });

  it('atomically binds an explicitly imported replacement to its original SceneShot', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const plan: StoredScenePlan = {
      planId: 'plan_import_scene',
      saveId: 'save_a',
      sourceTurnId: 'turn_import_scene',
      sourceStoryTextHash: 'd'.repeat(64),
      mode: 'manual',
      requestedMaxScenes: 1,
      shots: [{
        shotId: 'shot_import_scene',
        placement: { blockIndex: 0, blockHash: 'e'.repeat(64) },
        order: 0,
        sceneSummary: '雨夜街口',
        knownActorIds: [],
        actorVisualStates: [],
        unboundCharacterDescriptions: [],
        locationDescription: '街口',
        actionDescription: '等待',
        atmosphere: '压抑',
        composition: '中景'
      }],
      createdAt: '2026-07-22T00:00:00.000Z'
    };
    await repository.saveScenePlan(plan);
    const subject = {
      type: 'scene-shot' as const,
      saveId: 'save_a',
      turnId: plan.sourceTurnId,
      scenePlanId: plan.planId,
      shotId: plan.shots[0].shotId
    };
    const result = await repository.importUserImage({
      ...createImageInput('image_imported_scene'),
      saveId: 'save_a',
      createdAt: '2026-07-22T00:01:00.000Z',
      originSubject: subject,
      originPurpose: 'turn-scene',
      bindAsCurrent: true
    });

    const snapshot = await repository.loadSnapshot('save_a');
    const bindingId = createVisualBindingId('save_a', subject, 'turn-scene', subject.shotId);
    expect(result.binding).toMatchObject({
      bindingId,
      variantKey: subject.shotId,
      imageId: 'image_imported_scene'
    });
    expect(snapshot.bindings[bindingId]).toEqual(result.binding);
    expect(snapshot.storySceneDisplayStates[subject.turnId].activeShotIds).toEqual([subject.shotId]);
  });

  it('deduplicates player imports by content hash and can bind the existing asset without writing another Blob', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const first = createImageInput('image_first');
    const subject = { type: 'actor' as const, saveId: 'save_a', actorId: 'actor_mei' };
    await repository.importUserImage({
      ...first,
      saveId: 'save_a',
      createdAt: '2026-07-22T00:00:00.000Z',
      originSubject: subject,
      originPurpose: 'avatar-close-up'
    });

    const duplicate = await repository.importUserImage({
      ...createImageInput('image_duplicate'),
      saveId: 'save_a',
      createdAt: '2026-07-22T00:01:00.000Z',
      originSubject: subject,
      originPurpose: 'avatar-close-up',
      bindAsCurrent: true
    });
    const snapshot = await repository.loadSnapshot('save_a');

    expect(duplicate.created).toBe(false);
    expect(duplicate.asset.imageId).toBe('image_first');
    expect(Object.keys(snapshot.assets)).toEqual(['image_first']);
    expect(duplicate.binding?.imageId).toBe('image_first');
    expect(await repository.getBlob('blob_image_duplicate')).toBeNull();
  });

  it('requires explicit unbinding confirmation and then removes metadata, binding and Blob together', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const task = createPersistingTask();
    await repository.saveTask(task);
    await repository.completeTaskWithImages('save_a', task.taskId, [
      createImageInput('image_primary'),
      createImageInput('image_candidate')
    ], '2026-07-22T00:00:06.000Z');

    const impact = await repository.getAssetDeletionImpact('save_a', 'image_primary');
    expect(impact.bindingIds).toHaveLength(1);
    await expect(repository.deleteAsset('save_a', 'image_primary', false)).rejects.toBeInstanceOf(VisualAssetBoundError);
    expect(await repository.getBlob('blob_image_primary')).toBeInstanceOf(Blob);

    await repository.deleteAsset('save_a', 'image_primary', true);
    const snapshot = await repository.loadSnapshot('save_a');
    expect(snapshot.assets).not.toHaveProperty('image_primary');
    expect(snapshot.assets).toHaveProperty('image_candidate');
    expect(snapshot.bindings).toEqual({});
    expect(await repository.getBlob('blob_image_primary')).toBeNull();
    expect(await repository.getBlob('blob_image_candidate')).toBeInstanceOf(Blob);
  });

  it('uses a database and object stores distinct from ImageProbeStore', async () => {
    const visual = new IndexedDbVisualRepository('visual-isolation-test');
    const probe = new IndexedDbImageProbeStore('probe-isolation-test');
    await visual.loadSnapshot('save_a');
    await probe.clearAll();

    const visualDb = await openDatabase('visual-isolation-test');
    const probeDb = await openDatabase('probe-isolation-test');
    try {
      expect(Array.from(visualDb.objectStoreNames)).toEqual(['visual-blobs', 'visual-partitions']);
      expect(Array.from(probeDb.objectStoreNames)).toEqual(['probe-artifacts', 'verification-records']);
    } finally {
      visualDb.close();
      probeDb.close();
    }
  });

  it('clears every visual partition and blob, including orphaned save ids', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    await repository.importUserImage({
      ...createImageInput('image_a'),
      saveId: 'orphan_a',
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    await repository.importUserImage({
      ...createImageInput('image_b'),
      saveId: 'orphan_b',
      createdAt: '2026-07-22T00:00:00.000Z'
    });

    await repository.clearAll();

    expect((await repository.loadSnapshot('orphan_a')).assets).toEqual({});
    expect((await repository.loadSnapshot('orphan_b')).assets).toEqual({});
    expect(await repository.getBlob('blob_image_a')).toBeNull();
    expect(await repository.getBlob('blob_image_b')).toBeNull();
  });
});
