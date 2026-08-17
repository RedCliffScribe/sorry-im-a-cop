// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import {
  detectCustomSourceFormat,
  importCustomSourceFile
} from './sourceImport';

const databaseName = 'cop-v2-test-source-import';
const timestamp = '2026-07-26T12:00:00.000Z';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function sourceFile(
  name: string,
  content: BlobPart,
  type: string
): File {
  const blob = new Blob([content], { type });
  return Object.assign(blob, {
    name,
    lastModified: Date.parse(timestamp)
  }) as File;
}

beforeEach(async () => {
  await deleteDatabase(databaseName);
});

describe('custom source file import', () => {
  it('recognizes the V1 source formats and rejects PDF', () => {
    expect(detectCustomSourceFormat('story.TXT')).toBe('txt');
    expect(detectCustomSourceFormat('story.md')).toBe('markdown');
    expect(detectCustomSourceFormat('story.markdown')).toBe('markdown');
    expect(detectCustomSourceFormat('story.epub')).toBe('epub');
    expect(() =>
      detectCustomSourceFormat('story.pdf', 'application/pdf')
    ).toThrow('V1 不支持 PDF');
    expect(() => detectCustomSourceFormat('story.docx')).toThrow(
      '无法识别文件格式'
    );
  });

  it('stores the raw blob once and creates an idempotent queued parse task', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const file = sourceFile(
      '长篇.md',
      '# 第一章\n正文。\n\n# 第二章\n后续正文。',
      'text/markdown'
    );

    const first = await importCustomSourceFile({
      repository,
      file,
      timestamp
    });
    const second = await importCustomSourceFile({
      repository,
      file,
      timestamp: '2026-07-26T12:01:00.000Z'
    });

    expect(first.alreadyPresent).toBe(false);
    expect(first.document).toMatchObject({
      fileName: '长篇.md',
      sourceFormat: 'markdown',
      mediaType: 'text/markdown',
      byteLength: file.size,
      createdAt: timestamp
    });
    expect(first.parseTask).toMatchObject({
      taskKind: 'parse_source',
      status: 'queued',
      sourceDocumentId: first.document.sourceDocumentId,
      totalUnitCount: 1
    });
    expect(second).toMatchObject({
      alreadyPresent: true,
      document: {
        sourceDocumentId: first.document.sourceDocumentId
      },
      parseTask: {
        taskId: first.parseTask.taskId
      }
    });
    expect(await repository.listSourceDocuments()).toHaveLength(1);
    expect(await repository.listProcessingTasks()).toHaveLength(1);
    expect(
      (
        await repository.loadSourceDocument(first.document.sourceDocumentId)
      )?.blob.size
    ).toBe(file.size);
  });

  it('rejects an empty source before creating local records', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);

    await expect(
      importCustomSourceFile({
        repository,
        file: sourceFile('empty.txt', '', 'text/plain'),
        timestamp
      })
    ).rejects.toThrow('来源文件不能为空');

    expect(await repository.listSourceDocuments()).toEqual([]);
    expect(await repository.listProcessingTasks()).toEqual([]);
  });
});
