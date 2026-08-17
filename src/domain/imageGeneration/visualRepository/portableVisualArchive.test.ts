import 'fake-indexeddb/auto';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbVisualRepository } from './IndexedDbVisualRepository';
import {
  createPortableVisualArchive,
  parsePortableVisualArchive,
  PORTABLE_VISUAL_ARCHIVE_FORMAT,
  PORTABLE_VISUAL_ARCHIVE_VERSION
} from './portableVisualArchive';
import { createImageInput, createPersistingTask } from './testFixtures';
import { rebaseVisualArchiveSaveId } from './rebaseVisualArchive';

const SOURCE_DB = 'visual-archive-source-test';
const DESTINATION_DB = 'visual-archive-destination-test';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await Promise.all([deleteDatabase(SOURCE_DB), deleteDatabase(DESTINATION_DB)]);
});

async function createSourceRepository(): Promise<IndexedDbVisualRepository> {
  const repository = new IndexedDbVisualRepository(SOURCE_DB);
  const task = createPersistingTask();
  await repository.saveTask(task);
  await repository.completeTaskWithImages('save_a', task.taskId, [
    createImageInput('image_primary'),
    createImageInput('image_candidate')
  ], '2026-07-22T00:00:06.000Z');
  return repository;
}

describe('portable visual archives', () => {
  it('exports complete lightweight metadata without image files when images are not selected', async () => {
    const repository = await createSourceRepository();
    const data = await repository.exportSave('save_a');

    const archive = await createPortableVisualArchive(data, false, '2026-07-22T01:00:00.000Z');
    const entries = unzipSync(archive);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    const parsed = await parsePortableVisualArchive(archive);

    expect(manifest).toMatchObject({
      format: PORTABLE_VISUAL_ARCHIVE_FORMAT,
      version: PORTABLE_VISUAL_ARCHIVE_VERSION,
      includeImages: false,
      blobCount: 0,
      saveId: 'save_a'
    });
    expect(Object.keys(entries).filter((path) => path.startsWith('images/'))).toEqual([]);
    expect(Object.keys(parsed.snapshot.assets)).toEqual(['image_primary', 'image_candidate']);
    expect(parsed.blobs).toEqual([]);
    expect(strFromU8(entries['manifest.json'])).not.toMatch(/apiKey|Authorization|Bearer /);
  });

  it('round-trips all selected image Blobs and restores them into another isolated repository', async () => {
    const source = await createSourceRepository();
    const archive = await createPortableVisualArchive(await source.exportSave('save_a'), true);

    const parsed = await parsePortableVisualArchive(archive);
    const destination = new IndexedDbVisualRepository(DESTINATION_DB);
    await destination.replaceSaveFromArchive(parsed.snapshot, parsed.blobs);
    const restored = await destination.loadSnapshot('save_a');

    expect(parsed.blobs.map((blob) => blob.imageId)).toEqual(['image_primary', 'image_candidate']);
    expect(Object.keys(restored.assets)).toEqual(['image_primary', 'image_candidate']);
    expect(await destination.getBlob('blob_image_primary')).toBeInstanceOf(Blob);
    expect(await destination.getBlob('blob_image_candidate')).toBeInstanceOf(Blob);
    expect(Object.values(restored.bindings)).toEqual([expect.objectContaining({ imageId: 'image_primary' })]);
  });

  it('imports a metadata-only archive with recoverable missing-image placeholders', async () => {
    const source = await createSourceRepository();
    const archive = await createPortableVisualArchive(await source.exportSave('save_a'), false);
    const parsed = await parsePortableVisualArchive(archive);
    const destination = new IndexedDbVisualRepository(DESTINATION_DB);

    await destination.replaceSaveFromArchive(parsed.snapshot, parsed.blobs);

    expect(Object.keys((await destination.loadSnapshot('save_a')).assets)).toHaveLength(2);
    expect(await destination.getBlob('blob_image_primary')).toBeNull();
  });

  it('rejects a package whose image bytes no longer match the immutable asset hash', async () => {
    const source = await createSourceRepository();
    const archive = await createPortableVisualArchive(await source.exportSave('save_a'), true);
    const entries = unzipSync(archive);
    const imagePath = Object.keys(entries).find((path) => path.startsWith('images/'));
    if (!imagePath) throw new Error('missing image fixture');
    entries[imagePath] = entries[imagePath].slice();
    entries[imagePath][7] ^= 0xff;
    const corrupted = zipSync(entries);

    await expect(parsePortableVisualArchive(corrupted)).rejects.toThrow();
  });

  it('rejects unregistered files even in a metadata-only archive', async () => {
    const source = await createSourceRepository();
    const archive = await createPortableVisualArchive(await source.exportSave('save_a'), false);
    const entries = unzipSync(archive);
    entries['credentials.txt'] = new TextEncoder().encode('must not be transported');

    await expect(parsePortableVisualArchive(zipSync(entries))).rejects.toThrow('不得隐藏携带额外文件');
  });

  it('rebases save-scoped ids, binding ids, and Blob keys for safe repeated import', async () => {
    const source = await createSourceRepository();
    const parsed = await parsePortableVisualArchive(await createPortableVisualArchive(await source.exportSave('save_a'), true));
    const rebased = rebaseVisualArchiveSaveId(parsed, 'imported_chain');
    const destination = new IndexedDbVisualRepository(DESTINATION_DB);
    await destination.replaceSaveFromArchive(rebased.snapshot, rebased.blobs);
    const restored = await destination.loadSnapshot('imported_chain');

    expect(restored.saveId).toBe('imported_chain');
    expect(Object.values(restored.tasks)[0].saveId).toBe('imported_chain');
    expect(Object.values(restored.bindings)[0]).toMatchObject({
      saveId: 'imported_chain',
      subject: { saveId: 'imported_chain' }
    });
    expect(Object.values(restored.assets)[0].blobKey).toMatch(/^imported_chain:/);
    expect(await destination.getBlob(Object.values(restored.assets)[0].blobKey)).toBeInstanceOf(Blob);
  });
});
