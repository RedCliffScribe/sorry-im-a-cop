import { strFromU8, strToU8, unzip, zip } from 'fflate';
import { z } from 'zod';
import type { RuntimeSaveRecord } from './SaveRepository';
import { createPortableSaveRecord } from './portableSaveArchive';
import { parseRuntimeSaveRecord, parseSaveArchive } from './saveArchiveSchema';

export const PORTABLE_SAVE_ZIP_FORMAT = 'sorry-im-a-cop-v2-save-archive';
export const PORTABLE_SAVE_ZIP_VERSION = 2;

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

const manifestSchema = z.object({
  format: z.literal(PORTABLE_SAVE_ZIP_FORMAT),
  version: z.literal(PORTABLE_SAVE_ZIP_VERSION),
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
  exportedAt = new Date().toISOString()
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

  const manifest: PortableSaveZipManifest = {
    format: PORTABLE_SAVE_ZIP_FORMAT,
    version: PORTABLE_SAVE_ZIP_VERSION,
    exportedAt,
    saveCount: manifestEntries.length,
    saves: manifestEntries,
    assetFolders: ASSET_FOLDERS
  };
  entries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  Object.values(ASSET_FOLDERS).forEach((folder) => {
    entries[`${folder}/.keep`] = new Uint8Array();
  });

  return zipAsync(entries);
}

export async function parsePortableSaveZip(data: Uint8Array): Promise<RuntimeSaveRecord[]> {
  const entries = await unzipAsync(data);
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes) {
    throw new Error('Save archive manifest is missing.');
  }

  const manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
  if (manifest.saveCount !== manifest.saves.length) {
    throw new Error('Save archive count does not match its manifest.');
  }

  const paths = new Set<string>();
  const saveIds = new Set<string>();
  return manifest.saves.map((summary) => {
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
  const bytes = await readFileBytes(file);
  if (isZipBytes(bytes)) {
    return parsePortableSaveZip(bytes);
  }

  return parseSaveArchive(JSON.parse(strFromU8(bytes))).saves;
}
