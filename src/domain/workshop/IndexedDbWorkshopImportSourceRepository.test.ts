import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbWorkshopImportSourceRepository } from './IndexedDbWorkshopImportSourceRepository';
import type { WorkshopImportSourceRecord } from './types';

function createRecord(overrides: Partial<WorkshopImportSourceRecord> = {}): WorkshopImportSourceRecord {
  return {
    sourceRecordId: 'workshop-source:item-1:variant-1',
    originKey: 'item:item-1',
    localPresetId: 'image-preset:profile-1:half-body-medium',
    localProfileId: 'profile-1',
    variantKey: 'half-body-medium',
    variantRef: 'variant-1',
    packageSha256: 'a'.repeat(64),
    itemId: 'item-1',
    revisionId: 'revision-1',
    authorDisplayName: '测试作者',
    importedStylePresetIds: ['style-1'],
    importedDialectPresetIds: ['dialect-1'],
    importedComfyRecipeIds: [],
    importedAt: '2026-08-02T00:00:00.000Z',
    ...overrides
  };
}

describe('IndexedDbWorkshopImportSourceRepository', () => {
  it('persists, indexes, updates and removes strict source records', async () => {
    const dbName = `workshop-import-sources-${crypto.randomUUID()}`;
    const repository = new IndexedDbWorkshopImportSourceRepository(dbName);
    const first = createRecord();
    const second = createRecord({
      sourceRecordId: 'workshop-source:item-1:variant-2',
      localPresetId: 'image-preset:profile-1:narrative-scene',
      variantKey: 'narrative-scene',
      variantRef: 'variant-2'
    });

    await repository.save(first);
    await repository.save(second);
    await expect(new IndexedDbWorkshopImportSourceRepository(dbName).get(first.localPresetId))
      .resolves.toEqual(first);
    await expect(repository.listByOriginKey('item:item-1')).resolves.toEqual([first, second]);

    const updated = { ...first, revisionId: 'revision-2', importedAt: '2026-08-02T01:00:00.000Z' };
    await repository.save(updated);
    await expect(repository.get(first.localPresetId)).resolves.toEqual(updated);

    await repository.delete(first.localPresetId);
    await expect(repository.get(first.localPresetId)).resolves.toBeUndefined();
    await repository.clearAll();
    await expect(repository.listByOriginKey('item:item-1')).resolves.toEqual([]);
  });

  it('rejects unknown fields and malformed hashes before writing', async () => {
    const repository = new IndexedDbWorkshopImportSourceRepository(
      `workshop-import-source-strict-${crypto.randomUUID()}`
    );
    expect(() => repository.save({
      ...createRecord(),
      packageSha256: 'not-a-hash'
    })).toThrow();
    expect(() => repository.save({
      ...createRecord(),
      credentialId: 'must-not-persist'
    } as WorkshopImportSourceRecord)).toThrow();
  });
});
