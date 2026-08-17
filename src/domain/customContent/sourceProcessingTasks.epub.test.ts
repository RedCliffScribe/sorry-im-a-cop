import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CustomSourceDocument } from './assetTypes';
import { createCustomContentBlobChecksum } from './checksum';
import { customContentProcessingTaskSchema } from './contentPackageSchemas';
import { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import {
  createCustomSourceChunkTask,
  createCustomSourceParseTask,
  runCustomSourceProcessingTask
} from './sourceProcessingTasks';

const databaseName = 'cop-v2-test-source-processing-epub';
const timestamp = '2026-07-26T11:00:00.000Z';

if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    configurable: true,
    value(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    }
  });
}

class EpubTestRepository extends IndexedDbCustomContentRepository {
  readonly #sourceBlobs = new Map<string, Blob>();

  override async saveSourceDocument(
    document: CustomSourceDocument,
    blob: Blob
  ): Promise<void> {
    this.#sourceBlobs.set(document.sourceDocumentId, blob);
    await super.saveSourceDocument(document, blob);
  }

  override async loadSourceDocument(sourceDocumentId: string) {
    const loaded = await super.loadSourceDocument(sourceDocumentId);
    const blob = this.#sourceBlobs.get(sourceDocumentId);
    return loaded && blob ? { ...loaded, blob } : loaded;
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function createEpub(): Blob {
  const files = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
        '<rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'
    ),
    'OPS/book.opf': strToU8(
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0">' +
        '<manifest>' +
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
        '<item id="one" href="one.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="two" href="two.xhtml" media-type="application/xhtml+xml"/>' +
        '</manifest><spine><itemref idref="one"/><itemref idref="two"/></spine>' +
        '</package>'
    ),
    'OPS/nav.xhtml': strToU8(
      '<html xmlns="http://www.w3.org/1999/xhtml" ' +
        'xmlns:epub="http://www.idpf.org/2007/ops"><body>' +
        '<nav epub:type="toc"><a href="one.xhtml">卷一</a>' +
        '<a href="two.xhtml">卷二</a></nav></body></html>'
    ),
    'OPS/one.xhtml': strToU8(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
        '<h1>第一章</h1><p>正文甲。</p></body></html>'
    ),
    'OPS/two.xhtml': strToU8(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
        '<h1>第二章</h1><p>正文乙。</p></body></html>'
    )
  };
  return new Blob([Uint8Array.from(zipSync(files))], {
    type: 'application/epub+zip'
  });
}

beforeEach(async () => {
  await deleteDatabase(databaseName);
});

describe('custom EPUB source processing tasks', () => {
  it('runs EPUB parse and chunk tasks through the persisted state machine', async () => {
    const repository = new EpubTestRepository(databaseName);
    const blob = createEpub();
    const document: CustomSourceDocument = {
      sourceDocumentId: 'source-epub-task',
      fileName: 'book.epub',
      sourceFormat: 'epub',
      mediaType: 'application/epub+zip',
      byteLength: blob.size,
      checksum: await createCustomContentBlobChecksum(blob),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await repository.saveSourceDocument(document, blob);

    const parseTask = await createCustomSourceParseTask(
      repository,
      document.sourceDocumentId,
      { timestamp }
    );
    expect(parseTask.task.sourceProcessing?.sourceFormat).toBe('epub');
    expect(customContentProcessingTaskSchema.parse(parseTask.task)).toEqual(
      parseTask.task
    );
    const parsed = await runCustomSourceProcessingTask(
      repository,
      parseTask.task.taskId,
      { automaticRetry: false }
    );
    expect(parsed.task.lastError).toBeUndefined();
    expect(parsed.task.status).toBe('completed');
    expect(parsed.unit.resultRef).toMatch(
      /^canonical-text-sha256:[a-f0-9]{64}$/u
    );
    expect(
      (await repository.loadSourceDocument(document.sourceDocumentId))?.document
        .characterCount
    ).toBe('第一章\n正文甲。\n\n第二章\n正文乙。'.length);

    const chunkTask = await createCustomSourceChunkTask(
      repository,
      parseTask.task.taskId,
      { timestamp: '2026-07-26T11:01:00.000Z' }
    );
    const chunked = await runCustomSourceProcessingTask(
      repository,
      chunkTask.task.taskId,
      { automaticRetry: false }
    );
    expect(chunked.task.status).toBe('completed');
    const structure = await repository.loadSourceStructure(
      chunked.unit.resultRef!
    );
    expect(structure?.chapters.map((chapter) => chapter.title)).toEqual([
      '卷一',
      '卷二'
    ]);
    expect(
      structure?.chapters.every(
        (chapter) => chapter.detectionMethod === 'epub_navigation'
      )
    ).toBe(true);
  });

  it('rejects an EPUB text encoding override before creating a task', async () => {
    const repository = new EpubTestRepository(databaseName);
    const blob = createEpub();
    const document: CustomSourceDocument = {
      sourceDocumentId: 'source-epub-encoding-task',
      fileName: 'book.epub',
      sourceFormat: 'epub',
      mediaType: 'application/epub+zip',
      byteLength: blob.size,
      checksum: await createCustomContentBlobChecksum(blob),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await repository.saveSourceDocument(document, blob);

    await expect(
      createCustomSourceParseTask(repository, document.sourceDocumentId, {
        encoding: 'utf-8',
        timestamp
      })
    ).rejects.toThrow('不接受文本编码覆盖');
    expect(await repository.listProcessingTasks()).toHaveLength(0);
  });
});
