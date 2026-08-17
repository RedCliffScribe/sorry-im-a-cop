import { describe, expect, it, vi } from 'vitest';
import type {
  AvgResourcePackSelection,
  InstalledAvgResourcePackRecord
} from './types';
import type {
  AvgResourceBinaryStore,
  AvgResourcePackMetadataRepository,
  AvgResourcePackStorage
} from './storage';
import { AvgAssetUrlManager } from './manager';

function installedRecord(version: string): InstalledAvgResourcePackRecord {
  return {
    manifest: {
      schemaVersion: 1,
      packId: 'fixture_pack',
      worldpackId: 'hk1988',
      version,
      displayName: 'Fixture Pack',
      packType: 'base',
      registries: {
        fixedCharacters: 'metadata/fixed.json',
        genericPortraits: 'metadata/generic.json',
        scenes: 'metadata/scenes.json'
      }
    },
    fixedCharacters: { schemaVersion: 1, worldpackId: 'hk1988', entries: [] },
    genericPortraits: { schemaVersion: 1, worldpackId: 'hk1988', entries: [] },
    scenes: { schemaVersion: 1, worldpackId: 'hk1988', entries: [] },
    storageNamespace: `fixture_pack_${version}`,
    storageBackend: 'indexeddb',
    installedAt: '2026-08-10T00:00:00.000Z',
    archiveByteLength: 100,
    expandedByteLength: 200,
    assetCount: 1,
    validation: {
      status: 'valid',
      checkedAt: '2026-08-10T00:00:00.000Z',
      warnings: []
    }
  };
}

describe('AvgAssetUrlManager', () => {
  it('caches by pack version and asset id, then revokes every URL on dispose', async () => {
    let record = installedRecord('1.0.0');
    const metadata: AvgResourcePackMetadataRepository = {
      getInstalledPack: vi.fn(async () => record),
      listInstalledPacks: vi.fn(async () => [record]),
      putInstalledPack: vi.fn(async () => undefined),
      removeInstalledPack: vi.fn(async () => undefined),
      getSelection: vi.fn(async () => undefined),
      putSelection: vi.fn(async (_selection: AvgResourcePackSelection) => undefined)
    };
    const binaries: AvgResourceBinaryStore = {
      backend: 'indexeddb',
      write: vi.fn(async () => undefined),
      read: vi.fn(async () => new Blob(['asset'])),
      removeNamespace: vi.fn(async () => undefined)
    };
    const storage: AvgResourcePackStorage = { metadata, binaries };
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:fixture-v1')
      .mockReturnValueOnce('blob:fixture-v2');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const manager = new AvgAssetUrlManager(storage);
    const asset = {
      assetId: 'portrait_default',
      path: 'portraits/default.png',
      mediaType: 'image/png' as const
    };

    await expect(manager.getAssetUrl('fixture_pack', asset)).resolves.toBe('blob:fixture-v1');
    await expect(manager.getAssetUrl('fixture_pack', asset)).resolves.toBe('blob:fixture-v1');
    expect(binaries.read).toHaveBeenCalledTimes(1);

    record = installedRecord('2.0.0');
    await expect(manager.getAssetUrl('fixture_pack', asset)).resolves.toBe('blob:fixture-v2');
    expect(binaries.read).toHaveBeenCalledTimes(2);

    manager.dispose();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:fixture-v1');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:fixture-v2');
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });
});
