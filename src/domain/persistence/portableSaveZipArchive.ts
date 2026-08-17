import { strFromU8, strToU8, unzip, zip } from 'fflate';
import { z } from 'zod';
import type { RuntimeSaveRecord } from './SaveRepository';
import { createPortableSaveRecord } from './portableSaveArchive';
import { parseRuntimeSaveRecord, parseSaveArchive } from './saveArchiveSchema';

export const PORTABLE_SAVE_ZIP_FORMAT = 'sorry-im-a-cop-v2-save-archive';
export const PORTABLE_SAVE_ZIP_VERSION = 5;

export interface PortableSaveBundle {
  records: RuntimeSaveRecord[];
  visualArchives: Record<string, Uint8Array>;
  avgOverrideArchives?: Record<string, Uint8Array>;
}

export interface PortableSaveZipOptions {
  visualArchives?: Record<string, Uint8Array>;
  avgOverrideArchives?: Record<string, Uint8Array>;
}

interface PortableSaveManifestEntry {
  path: string;
  saveId: string;
  saveKind: 'manual' | 'auto';
  saveName: string;
  playerName: string;
  gameDateLabel: string;
  turnCounter: number;
}

interface PortableSaveZipManifest {
  format: typeof PORTABLE_SAVE_ZIP_FORMAT;
  version: typeof PORTABLE_SAVE_ZIP_VERSION;
  exportedAt: string;
  saveCount: number;
  saves: PortableSaveManifestEntry[];
  assetFolders: {
    characters: string;
    locations: string;
    events: string;
    objects: string;
  };
  visuals: Array<{ partitionId: string; path: string }>;
  avgOverrides: Array<{ partitionId: string; path: string }>;
}

const manifestEntrySchema = z.object({
  path: z.string().min(1),
  saveId: z.string().min(1),
  saveKind: z.enum(['manual', 'auto']),
  saveName: z.string(),
  playerName: z.string(),
  gameDateLabel: z.string(),
  turnCounter: z.number().int().nonnegative()
});

const manifestBaseSchema = z.object({
  format: z.literal(PORTABLE_SAVE_ZIP_FORMAT),
  exportedAt: z.string().min(1),
  saveCount: z.number().int().nonnegative(),
  saves: z.array(manifestEntrySchema),
  assetFolders: z.object({
    characters: z.string().min(1),
    locations: z.string().min(1),
    events: z.string().min(1),
    objects: z.string().min(1)
  })
});

const legacyManifestSchema = manifestBaseSchema.extend({
  version: z.literal(2)
});

const versionThreeManifestSchema = manifestBaseSchema.extend({
  version: z.literal(3),
  visuals: z.array(z.object({
    partitionId: z.string().min(1),
    path: z.string().min(1)
  }))
});

const versionFourManifestSchema = manifestBaseSchema.extend({
  version: z.literal(4),
  visuals: z.array(z.object({
    partitionId: z.string().min(1),
    path: z.string().min(1)
  })),
  avgOverrides: z.array(z.object({
    partitionId: z.string().min(1),
    path: z.string().min(1)
  }))
});

const manifestSchema = versionFourManifestSchema.extend({
  version: z.literal(PORTABLE_SAVE_ZIP_VERSION)
});

const ASSET_FOLDERS = {
  characters: 'assets/images/characters',
  locations: 'assets/images/locations',
  events: 'assets/images/events',
  objects: 'assets/images/objects'
} as const;

function safeFileSegment(value: string, fallback: string): string {
  const printableValue = Array.from(value.normalize('NFKC'), (character) =>
    character.charCodeAt(0) < 32 ? '-' : character
  ).join('');
  const cleaned = printableValue
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[.\s]+$/g, '')
    .trim();
  return cleaned || fallback;
}

function savePath(record: RuntimeSaveRecord, index: number): string {
  const kind = record.saveKind === 'auto' ? 'auto' : 'manual';
  const order = String(index + 1).padStart(4, '0');
  const playerName = safeFileSegment(record.playerName, 'unknown-player');
  return `saves/${kind}/${order}-${playerName}-turn-${record.turnCounter}.json`;
}

function zipAsync(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, (error, entries) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(entries);
    });
  });
}

export async function createPortableSaveZip(
  records: RuntimeSaveRecord[],
  exportedAt = new Date().toISOString(),
  options: PortableSaveZipOptions = {}
): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  const manifestEntries: PortableSaveManifestEntry[] = [];

  records.forEach((sourceRecord, index) => {
    const record = createPortableSaveRecord(sourceRecord);
    const path = savePath(record, index);
    const saveKind = record.saveKind === 'auto' ? 'auto' : 'manual';
    entries[path] = strToU8(JSON.stringify(record, null, 2));
    manifestEntries.push({
      path,
      saveId: record.saveId,
      saveKind,
      saveName: record.saveName,
      playerName: record.playerName,
      gameDateLabel: record.gameDateLabel,
      turnCounter: record.turnCounter
    });
  });

  const knownPartitionIds = new Set(records.map((record) => record.rollbackChainId ?? record.saveId));
  const visualEntries: Array<{ partitionId: string; path: string }> = [];
  for (const [partitionId, archive] of Object.entries(options.visualArchives ?? {})) {
    if (!knownPartitionIds.has(partitionId)) throw new Error(`视觉资料不属于导出存档链：${partitionId}`);
    if (!(archive instanceof Uint8Array) || archive.byteLength === 0) throw new Error(`视觉资料包无效：${partitionId}`);
    const index = visualEntries.length;
    const path = `visuals/${String(index + 1).padStart(4, '0')}-${safeFileSegment(partitionId, 'partition')}.zip`;
    entries[path] = archive;
    visualEntries.push({ partitionId, path });
  }

  const avgOverrideEntries: Array<{ partitionId: string; path: string }> = [];
  for (const [partitionId, archive] of Object.entries(options.avgOverrideArchives ?? {})) {
    if (!knownPartitionIds.has(partitionId)) {
      throw new Error(`AVG 自定义视觉资料不属于导出存档链：${partitionId}`);
    }
    if (!(archive instanceof Uint8Array) || archive.byteLength === 0) {
      throw new Error(`AVG 自定义视觉资料包无效：${partitionId}`);
    }
    const index = avgOverrideEntries.length;
    const path = `avg-overrides/${String(index + 1).padStart(4, '0')}-${safeFileSegment(partitionId, 'partition')}.zip`;
    entries[path] = archive;
    avgOverrideEntries.push({ partitionId, path });
  }

  const manifest: PortableSaveZipManifest = {
    format: PORTABLE_SAVE_ZIP_FORMAT,
    version: PORTABLE_SAVE_ZIP_VERSION,
    exportedAt,
    saveCount: manifestEntries.length,
    saves: manifestEntries,
    assetFolders: ASSET_FOLDERS,
    visuals: visualEntries,
    avgOverrides: avgOverrideEntries
  };
  entries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  Object.values(ASSET_FOLDERS).forEach((folder) => {
    entries[`${folder}/.keep`] = new Uint8Array();
  });

  return zipAsync(entries);
}

export async function parsePortableSaveBundle(data: Uint8Array): Promise<PortableSaveBundle> {
  const entries = await unzipAsync(data);
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) {
    throw new Error('Save archive manifest is missing.');
  }

  const rawManifest = JSON.parse(strFromU8(manifestBytes)) as { version?: unknown };
  const manifest = rawManifest.version === 2
    ? { ...legacyManifestSchema.parse(rawManifest), visuals: [], avgOverrides: [] }
    : rawManifest.version === 3
      ? { ...versionThreeManifestSchema.parse(rawManifest), avgOverrides: [] }
      : rawManifest.version === 4
        ? versionFourManifestSchema.parse(rawManifest)
        : manifestSchema.parse(rawManifest);
  if (manifest.saveCount !== manifest.saves.length) {
    throw new Error('Save archive count does not match its manifest.');
  }

  const paths = new Set<string>();
  const saveIds = new Set<string>();
  const records = manifest.saves.map((summary) => {
    if (
      paths.has(summary.path) ||
      !summary.path.startsWith('saves/') ||
      !summary.path.endsWith('.json')
    ) {
      throw new Error('Save archive contains an invalid save path.');
    }
    paths.add(summary.path);

    const saveBytes = entries[summary.path];
    if (!saveBytes) {
      throw new Error(`Save payload is missing: ${summary.path}`);
    }
    const record = parseRuntimeSaveRecord(JSON.parse(strFromU8(saveBytes)));
    if (record.saveId !== summary.saveId || saveIds.has(record.saveId)) {
      throw new Error('Save archive contains mismatched or duplicate save identifiers.');
    }
    saveIds.add(record.saveId);
    return record;
  });

  const visualArchives: Record<string, Uint8Array> = {};
  const visualPaths = new Set<string>();
  const knownPartitionIds = new Set(records.map((record) => record.rollbackChainId ?? record.saveId));
  for (const visual of manifest.visuals) {
    if (
      !knownPartitionIds.has(visual.partitionId) ||
      visualArchives[visual.partitionId] ||
      visualPaths.has(visual.path) ||
      !visual.path.startsWith('visuals/') ||
      !visual.path.endsWith('.zip') ||
      !entries[visual.path]
    ) {
      throw new Error('Save archive contains an invalid visual archive entry.');
    }
    visualPaths.add(visual.path);
    visualArchives[visual.partitionId] = entries[visual.path];
  }


  const avgOverrideArchives: Record<string, Uint8Array> = {};
  const avgOverridePaths = new Set<string>();
  for (const visual of manifest.avgOverrides) {
    if (
      !knownPartitionIds.has(visual.partitionId) ||
      avgOverrideArchives[visual.partitionId] ||
      avgOverridePaths.has(visual.path) ||
      !visual.path.startsWith('avg-overrides/') ||
      !visual.path.endsWith('.zip') ||
      !entries[visual.path]
    ) {
      throw new Error('Save archive contains an invalid AVG override archive entry.');
    }
    avgOverridePaths.add(visual.path);
    avgOverrideArchives[visual.partitionId] = entries[visual.path];
  }

  const allowedPaths = new Set([
    'manifest.json',
    ...manifest.saves.map((save) => save.path),
    ...manifest.visuals.map((visual) => visual.path),
    ...manifest.avgOverrides.map((visual) => visual.path),
    ...Object.values(ASSET_FOLDERS).map((folder) => `${folder}/.keep`)
  ]);
  if (Object.keys(entries).some((path) => !allowedPaths.has(path))) {
    throw new Error('Save archive contains an unregistered file.');
  }
  return { records, visualArchives, avgOverrideArchives };
}

export async function parsePortableSaveZip(data: Uint8Array): Promise<RuntimeSaveRecord[]> {
  return (await parsePortableSaveBundle(data)).records;
}

function isZipBytes(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }
  return strToU8(await file.text());
}

export async function readPortableSaveArchiveFile(file: File): Promise<RuntimeSaveRecord[]> {
  return (await readPortableSaveBundleFile(file)).records;
}

export async function readPortableSaveBundleFile(file: File): Promise<PortableSaveBundle> {
  const bytes = await readFileBytes(file);
  if (isZipBytes(bytes)) {
    return parsePortableSaveBundle(bytes);
  }
  return {
    records: parseSaveArchive(JSON.parse(strFromU8(bytes))).saves,
    visualArchives: {},
    avgOverrideArchives: {}
  };
}
