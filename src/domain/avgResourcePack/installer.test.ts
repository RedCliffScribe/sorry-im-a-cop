import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type {
  AvgResourcePackSelection,
  InstalledAvgResourcePackRecord
} from './types';
import { AvgResourcePackInstaller } from './installer';
import type {
  AvgResourceBinaryStore,
  AvgResourcePackMetadataRepository,
  AvgResourcePackStorage
} from './storage';

class MemoryMetadata implements AvgResourcePackMetadataRepository {
  packs = new Map<string, InstalledAvgResourcePackRecord>();
  selections = new Map<string, AvgResourcePackSelection>();
  getInstalledPack(packId: string) { return Promise.resolve(this.packs.get(packId)); }
  listInstalledPacks(worldpackId?: string) {
    return Promise.resolve([...this.packs.values()].filter(
      (record) => !worldpackId || record.manifest.worldpackId === worldpackId
    ));
  }
  putInstalledPack(record: InstalledAvgResourcePackRecord) {
    this.packs.set(record.manifest.packId, record);
    return Promise.resolve();
  }
  removeInstalledPack(packId: string) {
    this.packs.delete(packId);
    return Promise.resolve();
  }
  getSelection(worldpackId: string) { return Promise.resolve(this.selections.get(worldpackId)); }
  putSelection(selection: AvgResourcePackSelection) {
    this.selections.set(selection.worldpackId, structuredClone(selection));
    return Promise.resolve();
  }
}

class MemoryBinaries implements AvgResourceBinaryStore {
  readonly backend = 'indexeddb' as const;
  files = new Map<string, Blob>();
  removed: string[] = [];
  write(namespace: string, path: string, blob: Blob) {
    this.files.set(`${namespace}:${path}`, blob);
    return Promise.resolve();
  }
  read(namespace: string, path: string) {
    return Promise.resolve(this.files.get(`${namespace}:${path}`));
  }
  removeNamespace(namespace: string) {
    this.removed.push(namespace);
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(`${namespace}:`)) this.files.delete(key);
    }
    return Promise.resolve();
  }
}

function pngHeader(width = 2, height = 3): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([0, 0, 0, width], 16);
  bytes.set([0, 0, 0, height], 20);
  return bytes;
}

function archive(version: string, options: { omitImage?: boolean; extraImage?: boolean } = {}): Blob {
  const imagePath = 'portraits/accepted.png';
  const manifest = {
    schemaVersion: 1,
    packId: 'hk1988_avg_default',
    worldpackId: 'hk1988',
    version,
    displayName: 'HK1988 AVG Default',
    packType: 'base',
    registries: {
      fixedCharacters: 'metadata/fixed.json',
      genericPortraits: 'metadata/generic.json',
      scenes: 'metadata/scenes.json'
    }
  };
  const fixed = {
    schemaVersion: 1,
    worldpackId: 'hk1988',
    entries: [{
      stableIdentity: { worldpackId: 'hk1988', kind: 'era_seed', canonicalId: 'figure_1' },
      portraitSetId: 'figure_1',
      defaultOutfitId: 'default',
      outfits: { default: {
        outfitId: 'default',
        defaultVariantId: 'default',
        variants: { default: {
          variantId: 'default',
          emotionId: 'default',
          image: {
            assetId: 'accepted_image',
            path: imagePath,
            mediaType: 'image/png',
            width: 2,
            height: 3,
            byteLength: 24,
            provenance: { status: 'user_accepted', userAcceptanceEvidence: '用户明确通过' }
          }
        } }
      } }
    }]
  };
  const emptyRegistry = { schemaVersion: 1, worldpackId: 'hk1988', entries: [] };
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'metadata/fixed.json': strToU8(JSON.stringify(fixed)),
    'metadata/generic.json': strToU8(JSON.stringify(emptyRegistry)),
    'metadata/scenes.json': strToU8(JSON.stringify(emptyRegistry))
  };
  if (!options.omitImage) files[imagePath] = pngHeader();
  if (options.extraImage) files['portraits/unregistered.png'] = pngHeader();
  const zipped = zipSync(files, { level: 1 });
  const bytes = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
  return new Blob([bytes], { type: 'application/zip' });
}

function fixture(): { storage: AvgResourcePackStorage; metadata: MemoryMetadata; binaries: MemoryBinaries } {
  const metadata = new MemoryMetadata();
  const binaries = new MemoryBinaries();
  return { storage: { metadata, binaries }, metadata, binaries };
}

describe('AvgResourcePackInstaller', () => {
  it('streams, validates, installs and activates a valid base pack', async () => {
    const { storage, metadata } = fixture();
    const installer = new AvgResourcePackInstaller(storage, {
      requireUserAcceptedProvenance: true,
      now: () => new Date('2026-08-09T00:00:00.000Z')
    });
    const result = await installer.install(archive('1.0.0'));
    expect(result.record).toMatchObject({
      storageBackend: 'indexeddb',
      assetCount: 1,
      manifest: { version: '1.0.0' },
      validation: { status: 'valid' }
    });
    expect(metadata.selections.get('hk1988')?.basePackId).toBe('hk1988_avg_default');
  });

  it('keeps the installed version when a replacement ZIP is invalid', async () => {
    const { storage, metadata, binaries } = fixture();
    const installer = new AvgResourcePackInstaller(storage);
    const original = await installer.install(archive('1.0.0'));
    await expect(installer.install(archive('2.0.0', { omitImage: true }))).rejects.toThrow(/不存在/u);
    expect(metadata.packs.get('hk1988_avg_default')?.manifest.version).toBe('1.0.0');
    expect(binaries.files.has(`${original.record.storageNamespace}:portraits/accepted.png`)).toBe(true);
  });

  it('rejects images that are present but absent from Registry', async () => {
    const { storage } = fixture();
    const installer = new AvgResourcePackInstaller(storage);
    await expect(installer.install(archive('1.0.0', { extraImage: true }))).rejects.toThrow(/未被 Registry 登记/u);
  });

  it('uninstalls only the selected AVG pack namespace', async () => {
    const { storage, metadata, binaries } = fixture();
    const installer = new AvgResourcePackInstaller(storage);
    const result = await installer.install(archive('1.0.0'));
    binaries.files.set('unrelated-save-visuals:keep.png', new Blob(['keep']));
    await installer.uninstall('hk1988_avg_default');
    expect(metadata.packs.has('hk1988_avg_default')).toBe(false);
    expect(binaries.removed).toContain(result.record.storageNamespace);
    expect(binaries.files.has('unrelated-save-visuals:keep.png')).toBe(true);
  });
});
