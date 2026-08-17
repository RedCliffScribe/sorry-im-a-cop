import { strFromU8, strToU8, unzip, zip } from 'fflate';
import { z } from 'zod';
import { createGeneratedImage } from '../providers/providerProtocol';
import { parseVisualRepositorySnapshot } from './schemas';
import type { PortableVisualBlob, VisualArchiveData, VisualAsset } from './types';

export const PORTABLE_VISUAL_ARCHIVE_FORMAT = 'sorry-im-a-cop-v2-visual-archive';
export const PORTABLE_VISUAL_ARCHIVE_VERSION = 1 as const;

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_001;
const MAX_EXPANDED_BYTES = 1024 * 1024 * 1024;

const blobManifestEntrySchema = z.object({
  imageId: z.string().trim().min(1).max(1000),
  blobKey: z.string().trim().min(1).max(1000),
  path: z.string().regex(/^images\/[A-Za-z0-9._-]+\.(png|jpg|webp|gif)$/),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  byteLength: z.number().int().positive().max(64 * 1024 * 1024),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

const manifestSchema = z.object({
  format: z.literal(PORTABLE_VISUAL_ARCHIVE_FORMAT),
  version: z.literal(PORTABLE_VISUAL_ARCHIVE_VERSION),
  exportedAt: z.string().trim().min(1).max(100),
  saveId: z.string().trim().min(1).max(1000),
  includeImages: z.boolean(),
  blobCount: z.number().int().nonnegative(),
  snapshot: z.unknown(),
  blobs: z.array(blobManifestEntrySchema).max(10_000)
}).strict();

function zipAsync(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    let entryCount = 0;
    let expandedBytes = 0;
    let limitError: Error | undefined;
    unzip(data, {
      filter: (file) => {
        entryCount += 1;
        expandedBytes += file.originalSize;
        if (entryCount > MAX_ARCHIVE_ENTRIES || expandedBytes > MAX_EXPANDED_BYTES) {
          limitError = new Error('视觉资料包展开大小或文件数量超过安全上限。');
          return false;
        }
        return true;
      }
    }, (error, entries) => {
      if (limitError) reject(limitError);
      else if (error) reject(error);
      else resolve(entries);
    });
  });
}

function extensionForMime(mimeType: VisualAsset['mimeType']): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function safeImageFileName(imageId: string, index: number, mimeType: VisualAsset['mimeType']): string {
  const safe = imageId.normalize('NFKC').replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '').slice(0, 160);
  return `images/${String(index + 1).padStart(4, '0')}-${safe || 'image'}.${extensionForMime(mimeType)}`;
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copyArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validateBlobAgainstAsset(blob: Blob, asset: VisualAsset): Promise<Uint8Array> {
  const source = new Uint8Array(await blob.arrayBuffer());
  const image = createGeneratedImage(source, blob.type || asset.mimeType);
  const bytes = new Uint8Array(image.bytes);
  const hash = await sha256Hex(bytes);
  if (
    image.mimeType !== asset.mimeType ||
    bytes.byteLength !== asset.byteLength ||
    hash !== asset.contentHash
  ) {
    throw new Error(`图片 ${asset.imageId} 的 Blob 与元数据不一致。`);
  }
  return bytes;
}

export async function createPortableVisualArchive(
  data: VisualArchiveData,
  includeImages: boolean,
  exportedAt = new Date().toISOString()
): Promise<Uint8Array> {
  const snapshot = parseVisualRepositorySnapshot(data.snapshot);
  const entries: Record<string, Uint8Array> = {};
  const blobEntries: z.infer<typeof blobManifestEntrySchema>[] = [];
  if (includeImages) {
    if (data.blobs.length !== Object.keys(snapshot.assets).length) {
      throw new Error('包含图片导出要求图片元数据与 Blob 一一对应。');
    }
    if (
      new Set(data.blobs.map((blob) => blob.imageId)).size !== data.blobs.length ||
      new Set(data.blobs.map((blob) => blob.blobKey)).size !== data.blobs.length
    ) {
      throw new Error('包含图片导出不得有重复 imageId 或 blobKey。');
    }
    const blobsByImage = new Map(data.blobs.map((blob) => [blob.imageId, blob]));
    for (const [index, asset] of Object.values(snapshot.assets).entries()) {
      const source = blobsByImage.get(asset.imageId);
      if (!source || source.blobKey !== asset.blobKey) {
        throw new Error(`包含图片导出缺少 Blob：${asset.imageId}`);
      }
      const bytes = await validateBlobAgainstAsset(source.blob, asset);
      const path = safeImageFileName(asset.imageId, index, asset.mimeType);
      entries[path] = bytes;
      blobEntries.push({
        imageId: asset.imageId,
        blobKey: asset.blobKey,
        path,
        mimeType: asset.mimeType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
        byteLength: asset.byteLength,
        contentHash: asset.contentHash
      });
    }
  }
  const manifest = {
    format: PORTABLE_VISUAL_ARCHIVE_FORMAT,
    version: PORTABLE_VISUAL_ARCHIVE_VERSION,
    exportedAt,
    saveId: snapshot.saveId,
    includeImages,
    blobCount: blobEntries.length,
    snapshot,
    blobs: blobEntries
  };
  entries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const archive = await zipAsync(entries);
  if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error('视觉资料包超过安全大小上限。');
  return archive;
}

export async function parsePortableVisualArchive(data: Uint8Array): Promise<VisualArchiveData> {
  if (data.byteLength > MAX_ARCHIVE_BYTES) throw new Error('视觉资料包超过安全大小上限。');
  const entries = await unzipAsync(data);
  const entryNames = Object.keys(entries);
  if (entryNames.length > MAX_ARCHIVE_ENTRIES) throw new Error('视觉资料包文件数量超过安全上限。');
  const manifestBytes = entries['manifest.json'];
  if (!manifestBytes || manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
    throw new Error('视觉资料包 manifest 缺失或过大。');
  }
  const manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
  const snapshot = parseVisualRepositorySnapshot(manifest.snapshot);
  if (manifest.saveId !== snapshot.saveId || manifest.blobCount !== manifest.blobs.length) {
    throw new Error('视觉资料包 manifest 与元数据不一致。');
  }
  if (!manifest.includeImages) {
    if (manifest.blobs.length || entryNames.some((name) => name !== 'manifest.json')) {
      throw new Error('无图片资料包不得隐藏携带额外文件。');
    }
    return { snapshot, blobs: [] };
  }
  if (manifest.blobs.length !== Object.keys(snapshot.assets).length) {
    throw new Error('包含图片资料包必须覆盖当前存档全部图片资产。');
  }
  const paths = new Set<string>();
  const imageIds = new Set<string>();
  const blobs: PortableVisualBlob[] = [];
  for (const entry of manifest.blobs) {
    if (paths.has(entry.path) || imageIds.has(entry.imageId)) throw new Error('视觉资料包包含重复图片记录。');
    paths.add(entry.path);
    imageIds.add(entry.imageId);
    const asset = snapshot.assets[entry.imageId];
    const bytes = entries[entry.path];
    if (
      !asset ||
      !bytes ||
      asset.blobKey !== entry.blobKey ||
      asset.mimeType !== entry.mimeType ||
      asset.byteLength !== entry.byteLength ||
      asset.contentHash !== entry.contentHash
    ) {
      throw new Error(`视觉资料包图片记录不匹配：${entry.imageId}`);
    }
    const blob = new Blob([copyArrayBuffer(bytes)], { type: entry.mimeType });
    await validateBlobAgainstAsset(blob, asset);
    blobs.push({ imageId: entry.imageId, blobKey: entry.blobKey, blob });
  }
  if (entryNames.some((name) => name !== 'manifest.json' && !paths.has(name))) {
    throw new Error('视觉资料包包含未登记文件。');
  }
  return { snapshot, blobs };
}
