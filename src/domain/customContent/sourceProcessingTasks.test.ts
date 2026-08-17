// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CustomSourceDocument } from './assetTypes';
import { createCustomContentBlobChecksum } from './checksum';
import { customContentProcessingTaskSchema } from './contentPackageSchemas';
import {
  customContentStoreNames,
  IndexedDbCustomContentRepository
} from './IndexedDbCustomContentRepository';
import {
  cancelCustomSourceProcessingTask,
  createCustomSourceChunkTask,
  createCustomSourceParseTask,
  loadCustomSourceProcessingTask,
  pauseCustomSourceProcessingTask,
  resumeCustomSourceProcessingTask,
  runCustomSourceProcessingTask
} from './sourceProcessingTasks';

const databaseName = 'cop-v2-test-source-processing';
const timestamp = '2026-07-26T09:00:00.000Z';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function clearSourceStructures(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(
        customContentStoreNames.sourceStructures,
        'readwrite'
      );
      transaction
        .objectStore(customContentStoreNames.sourceStructures)
        .clear();
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveTextSource(
  repository: IndexedDbCustomContentRepository,
  options: {
    sourceDocumentId?: string;
    text?: string;
    blob?: Blob;
    sourceFormat?: 'txt' | 'markdown';
  } = {}
): Promise<CustomSourceDocument> {
  const sourceDocumentId = options.sourceDocumentId ?? 'source_task_1';
  const text = options.text ?? '第一章\r\n正文。\r\n\r\n第二章\r\n后续正文。';
  const blob = options.blob ?? new Blob([text], { type: 'text/plain' });
  const document: CustomSourceDocument = {
    sourceDocumentId,
    fileName: `${sourceDocumentId}.txt`,
    sourceFormat: options.sourceFormat ?? 'txt',
    mediaType: blob.type || 'text/plain',
    byteLength: blob.size,
    checksum: await createCustomContentBlobChecksum(blob),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await repository.saveSourceDocument(document, blob);
  return document;
}

beforeEach(async () => {
  await deleteDatabase(databaseName);
});

describe('custom source processing tasks', () => {
  it('creates an idempotent parse task and persists its canonical receipt', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const document = await saveTextSource(repository);

    const first = await createCustomSourceParseTask(
      repository,
      document.sourceDocumentId,
      { timestamp }
    );
    const second = await createCustomSourceParseTask(
      repository,
      document.sourceDocumentId,
      { timestamp: '2026-07-26T09:01:00.000Z' }
    );

    expect(second.task.taskId).toBe(first.task.taskId);
    expect(await repository.listProcessingTasks()).toHaveLength(1);
    expect(customContentProcessingTaskSchema.parse(first.task)).toEqual(
      first.task
    );

    const completed = await runCustomSourceProcessingTask(
      repository,
      first.task.taskId,
      {
        automaticRetry: false,
        now: () => '2026-07-26T09:02:00.000Z'
      }
    );
    expect(completed.task).toMatchObject({
      status: 'completed',
      completedUnitCount: 1,
      consumedInputTokens: 0,
      consumedOutputTokens: 0
    });
    expect(completed.unit.resultRef).toMatch(
      /^canonical-text-sha256:[a-f0-9]{64}$/u
    );
    expect(completed.unit.sourceSpan).toMatchObject({
      sourceDocumentId: document.sourceDocumentId,
      startOffset: 0,
      sequence: 0
    });
    expect(
      (await repository.loadSourceDocument(document.sourceDocumentId))
        ?.document.characterCount
    ).toBe('第一章\n正文。\n\n第二章\n后续正文。'.length);
  });

  it('creates a chunk task from a completed parse receipt and saves its structure atomically', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const document = await saveTextSource(repository);
    const parseTask = await createCustomSourceParseTask(
      repository,
      document.sourceDocumentId,
      { timestamp }
    );
    await runCustomSourceProcessingTask(repository, parseTask.task.taskId, {
      automaticRetry: false
    });
    const chunkTask = await createCustomSourceChunkTask(
      repository,
      parseTask.task.taskId,
      {
        chunking: {
          targetTokenCount: 8,
          maxTokenCount: 12,
          overlapTokenCount: 2
        },
        timestamp: '2026-07-26T09:03:00.000Z'
      }
    );

    const completed = await runCustomSourceProcessingTask(
      repository,
      chunkTask.task.taskId,
      { automaticRetry: false }
    );
    expect(completed.task.status).toBe('completed');
    expect(completed.unit.resultRef).toMatch(/^source-structure-/u);
    const structure = await repository.loadSourceStructure(
      completed.unit.resultRef!
    );
    expect(structure).toMatchObject({
      sourceDocumentId: document.sourceDocumentId,
      characterCount: completed.unit.sourceSpan?.endOffset
    });
    expect(structure?.chapters).toHaveLength(2);
  });

  it('pauses queued work, resumes it, and does not execute cancelled work', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const document = await saveTextSource(repository);
    const parseTask = await createCustomSourceParseTask(
      repository,
      document.sourceDocumentId,
      { timestamp }
    );

    const paused = await pauseCustomSourceProcessingTask(
      repository,
      parseTask.task.taskId,
      '2026-07-26T09:01:00.000Z'
    );
    expect(paused.task.status).toBe('paused');
    expect(
      (
        await runCustomSourceProcessingTask(
          repository,
          parseTask.task.taskId
        )
      ).task.status
    ).toBe('paused');

    await resumeCustomSourceProcessingTask(
      repository,
      parseTask.task.taskId,
      '2026-07-26T09:02:00.000Z'
    );
    expect(
      (
        await runCustomSourceProcessingTask(
          repository,
          parseTask.task.taskId,
          { automaticRetry: false }
        )
      ).task.status
    ).toBe('completed');

    const secondDocument = await saveTextSource(repository, {
      sourceDocumentId: 'source_task_cancel'
    });
    const cancelledTask = await createCustomSourceParseTask(
      repository,
      secondDocument.sourceDocumentId
    );
    await cancelCustomSourceProcessingTask(
      repository,
      cancelledTask.task.taskId
    );
    expect(
      (
        await runCustomSourceProcessingTask(
          repository,
          cancelledTask.task.taskId
        )
      ).task.status
    ).toBe('cancelled');
  });

  it('keeps a concurrent pause from being overwritten by a completed chunk result', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const document = await saveTextSource(repository);
    const parseTask = await createCustomSourceParseTask(
      repository,
      document.sourceDocumentId
    );
    await runCustomSourceProcessingTask(repository, parseTask.task.taskId, {
      automaticRetry: false
    });
    const chunkTask = await createCustomSourceChunkTask(
      repository,
      parseTask.task.taskId
    );

    const interrupted = await runCustomSourceProcessingTask(
      repository,
      chunkTask.task.taskId,
      {
        automaticRetry: false,
        beforeCommit: async () => {
          await pauseCustomSourceProcessingTask(
            repository,
            chunkTask.task.taskId
          );
        }
      }
    );
    expect(interrupted.task.status).toBe('paused');
    expect(
      await repository.listSourceStructures(document.sourceDocumentId)
    ).toEqual([]);

    await resumeCustomSourceProcessingTask(
      repository,
      chunkTask.task.taskId
    );
    const completed = await runCustomSourceProcessingTask(
      repository,
      chunkTask.task.taskId,
      { automaticRetry: false }
    );
    expect(completed.task.status).toBe('completed');
    expect(
      await repository.loadSourceStructure(completed.unit.resultRef!)
    ).not.toBeNull();
  });

  it('automatically retries transient failures up to maxRetries', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const document = await saveTextSource(repository);
    const parseTask = await createCustomSourceParseTask(
      repository,
      document.sourceDocumentId,
      { maxRetries: 2 }
    );
    let failuresRemaining = 2;

    const completed = await runCustomSourceProcessingTask(
      repository,
      parseTask.task.taskId,
      {
        beforeExecute: () => {
          if (failuresRemaining > 0) {
            failuresRemaining -= 1;
            throw new Error('transient local failure');
          }
        }
      }
    );
    expect(completed.task.status).toBe('completed');
    expect(completed.unit.retryCount).toBe(2);
    expect(completed.task.lastError).toBeUndefined();
  });

  it('stops after the retry budget and preserves the final failure', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const invalidBytes = new Uint8Array([0xc3, 0x28]);
    const document = await saveTextSource(repository, {
      sourceDocumentId: 'source_invalid_encoding',
      text: 'checksum identity',
      blob: new Blob([invalidBytes])
    });
    const parseTask = await createCustomSourceParseTask(
      repository,
      document.sourceDocumentId,
      { encoding: 'utf-8', maxRetries: 2 }
    );

    const failed = await runCustomSourceProcessingTask(
      repository,
      parseTask.task.taskId
    );
    expect(failed.task.status).toBe('failed');
    expect(failed.unit.retryCount).toBe(2);
    expect(failed.task.lastError).toContain('无法按 utf-8 解码');
  });

  it('recovers a persisted running task after an explicit resume', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const document = await saveTextSource(repository);
    const parseTask = await createCustomSourceParseTask(
      repository,
      document.sourceDocumentId
    );

    const interrupted = await runCustomSourceProcessingTask(
      repository,
      parseTask.task.taskId,
      {
        automaticRetry: false,
        beforeExecute: async () => {
          await resumeCustomSourceProcessingTask(
            repository,
            parseTask.task.taskId
          );
        }
      }
    );
    expect(interrupted.task.status).toBe('queued');
    expect(
      (
        await loadCustomSourceProcessingTask(
          repository,
          parseTask.task.taskId
        )
      )?.task.status
    ).toBe('queued');
    expect(
      (
        await runCustomSourceProcessingTask(
          repository,
          parseTask.task.taskId,
          { automaticRetry: false }
        )
      ).task.status
    ).toBe('completed');
  });

  it('rebuilds a completed chunk result when an imported backup lacks the derived structure', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const document = await saveTextSource(repository);
    const parseTask = await createCustomSourceParseTask(
      repository,
      document.sourceDocumentId
    );
    await runCustomSourceProcessingTask(repository, parseTask.task.taskId, {
      automaticRetry: false
    });
    const chunkTask = await createCustomSourceChunkTask(
      repository,
      parseTask.task.taskId
    );
    const first = await runCustomSourceProcessingTask(
      repository,
      chunkTask.task.taskId,
      { automaticRetry: false }
    );
    await clearSourceStructures(databaseName);
    expect(
      await repository.loadSourceStructure(first.unit.resultRef!)
    ).toBeNull();

    const rebuilt = await runCustomSourceProcessingTask(
      repository,
      chunkTask.task.taskId,
      { automaticRetry: false }
    );
    expect(rebuilt.task.status).toBe('completed');
    expect(
      await repository.loadSourceStructure(rebuilt.unit.resultRef!)
    ).not.toBeNull();
  });
});
