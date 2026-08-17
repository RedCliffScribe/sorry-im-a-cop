import { strFromU8, strToU8, unzip, zip } from 'fflate';
import { z } from 'zod';
import type {
  AvgOverrideAssetMetadata,
  AvgVisualOverridePartitionSnapshot
} from './types';

export const PORTABLE_AVG_OVERRIDE_ARCHIVE_FORMAT = 'sorry-im-a-cop-v2-avg-overrides';
export const PORTABLE_AVG_OVERRIDE_ARCHIVE_VERSION = 2;
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 4096;

const anchorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('runtime_scene'), id: z.string().min(1) }).strict(),
  z.object({ type: z.literal('runtime_place'), id: z.string().min(1) }).strict()
]);

const assetSchema = z.object({
  assetId: z.string().min(1),
  visualPartitionId: z.string().min(1),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteLength: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  source: z.enum(['manual_upload', 'image_generation']).optional(),
  sourceTaskId: z.string().min(1).optional(),
  originalFileName: z.string().optional(),
  createdAt: z.string().min(1)
}).strict();

const actorOverrideSchema = z.object({
  visualPartitionId: z.string().min(1),
  worldpackId: z.string().min(1),
  actorId: z.string().min(1),
  scope: z.literal('actor_all_variants'),
  assetId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict();

const sceneOverrideSchema = z.object({
  visualPartitionId: z.string().min(1),
  worldpackId: z.string().min(1),
  anchor: anchorSchema,
  assetId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict();

const userOutfitSchema = z.object({
  outfitId: z.string().min(1),
  visualPartitionId: z.string().min(1),
  worldpackId: z.string().min(1),
  actorId: z.string().min(1),
  displayName: z.string().min(1),
  visualDescription: z.string().optional(),
  semanticTags: z.array(z.string()).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict();

const outfitSelectionSchema = z.object({
  visualPartitionId: z.string().min(1),
  worldpackId: z.string().min(1),
  actorId: z.string().min(1),
  activeUserOutfitId: z.string().min(1).optional(),
  resourceOutfitIdsByBasePack: z.record(z.string(), z.string()),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict();

const outfitTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('resource_outfit'),
    basePackId: z.string().min(1),
    outfitId: z.string().min(1)
  }).strict(),
  z.object({
    type: z.literal('user_outfit'),
    outfitId: z.string().min(1)
  }).strict()
]);

const outfitOverrideSchema = z.object({
  visualPartitionId: z.string().min(1),
  worldpackId: z.string().min(1),
  actorId: z.string().min(1),
  scope: z.literal('actor_outfit_all_variants'),
  outfit: outfitTargetSchema,
  assetId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict();

const snapshotVersionOneSchema = z.object({
  visualPartitionId: z.string().min(1),
  actorOverrides: z.array(actorOverrideSchema),
  sceneOverrides: z.array(sceneOverrideSchema),
  assets: z.array(assetSchema)
}).strict();

const snapshotSchema = snapshotVersionOneSchema.extend({
  userOutfits: z.array(userOutfitSchema),
  outfitSelections: z.array(outfitSelectionSchema),
  outfitOverrides: z.array(outfitOverrideSchema)
}).strict();

const manifestBaseSchema = z.object({
  format: z.literal(PORTABLE_AVG_OVERRIDE_ARCHIVE_FORMAT),
  exportedAt: z.string().min(1),
  visualPartitionId: z.string().min(1),
  snapshotPath: z.literal('snapshot.json'),
  images: z.array(z.object({
    assetId: z.string().min(1),
    path: z.string().min(1),
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    byteLength: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u)
  }).strict())
}).strict();

const manifestSchema = z.discriminatedUnion('version', [
  manifestBaseSchema.extend({ version: z.literal(1) }).strict(),
  manifestBaseSchema.extend({
    version: z.literal(PORTABLE_AVG_OVERRIDE_ARCHIVE_VERSION)
  }).strict()
]);

function zipAsync(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => error ? reject(error) : resolve(data));
  });
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, (error, entries) => error ? reject(error) : resolve(entries));
  });
}

function extension(asset: AvgOverrideAssetMetadata): string {
  if (asset.mediaType === 'image/png') return 'png';
  if (asset.mediaType === 'image/webp') return 'webp';
  return 'jpg';
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function createPortableAvgOverrideArchive(
  snapshotInput: AvgVisualOverridePartitionSnapshot,
  getBlob: (assetId: string) => Promise<Blob | undefined>,
  exportedAt = new Date().toISOString()
): Promise<Uint8Array> {
  const snapshot = snapshotSchema.parse(snapshotInput) as AvgVisualOverridePartitionSnapshot;
  const entries: Record<string, Uint8Array> = {
    'snapshot.json': strToU8(JSON.stringify(snapshot, null, 2))
  };
  const images = [];
  for (let index = 0; index < snapshot.assets.length; index += 1) {
    const asset = snapshot.assets[index]!;
    const blob = await getBlob(asset.assetId);
    if (!blob) throw new Error(`AVG 自定义图片缺失：${asset.assetId}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (
      bytes.byteLength !== asset.byteLength ||
      blob.type !== asset.mediaType ||
      await sha256(bytes) !== asset.sha256
    ) throw new Error(`AVG 自定义图片校验失败：${asset.assetId}`);
    const path = `images/${String(index + 1).padStart(4, '0')}.${extension(asset)}`;
    entries[path] = bytes;
    images.push({
      assetId: asset.assetId,
      path,
      mediaType: asset.mediaType,
      byteLength: asset.byteLength,
      sha256: asset.sha256
    });
  }
  entries['manifest.json'] = strToU8(JSON.stringify({
    format: PORTABLE_AVG_OVERRIDE_ARCHIVE_FORMAT,
    version: PORTABLE_AVG_OVERRIDE_ARCHIVE_VERSION,
    exportedAt,
    visualPartitionId: snapshot.visualPartitionId,
    snapshotPath: 'snapshot.json',
    images
  }, null, 2));
  return zipAsync(entries);
}

export async function parsePortableAvgOverrideArchive(data: Uint8Array): Promise<{
  snapshot: AvgVisualOverridePartitionSnapshot;
  blobs: Map<string, Blob>;
}> {
  if (data.byteLength > MAX_ARCHIVE_BYTES) throw new Error('AVG 自定义视觉资料包超过安全上限。');
  const entries = await unzipAsync(data);
  if (Object.keys(entries).length > MAX_ARCHIVE_ENTRIES) {
    throw new Error('AVG 自定义视觉资料包文件数量超过安全上限。');
  }
  const manifestBytes = entries['manifest.json'];
  const snapshotBytes = entries['snapshot.json'];
  if (!manifestBytes || !snapshotBytes) throw new Error('AVG 自定义视觉资料清单缺失。');
  const manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
  const rawSnapshot = JSON.parse(strFromU8(snapshotBytes));
  const snapshot = manifest.version === 1
    ? {
        ...snapshotVersionOneSchema.parse(rawSnapshot),
        userOutfits: [],
        outfitSelections: [],
        outfitOverrides: []
      }
    : snapshotSchema.parse(rawSnapshot) as AvgVisualOverridePartitionSnapshot;
  if (snapshot.visualPartitionId !== manifest.visualPartitionId) {
    throw new Error('AVG 自定义视觉资料分区不一致。');
  }
  const allowedPaths = new Set(['manifest.json', 'snapshot.json', ...manifest.images.map((item) => item.path)]);
  if (Object.keys(entries).some((path) => !allowedPaths.has(path))) {
    throw new Error('AVG 自定义视觉资料包不得隐藏携带额外文件。');
  }
  const assetById = new Map(snapshot.assets.map((asset) => [asset.assetId, asset]));
  if (manifest.images.length !== snapshot.assets.length) {
    throw new Error('AVG 自定义视觉资料图片数量不一致。');
  }
  const blobs = new Map<string, Blob>();
  for (const image of manifest.images) {
    const asset = assetById.get(image.assetId);
    const bytes = entries[image.path];
    if (
      !asset || !bytes ||
      image.mediaType !== asset.mediaType ||
      image.byteLength !== asset.byteLength ||
      bytes.byteLength !== image.byteLength ||
      image.sha256 !== asset.sha256 ||
      await sha256(bytes) !== image.sha256
    ) throw new Error(`AVG 自定义图片校验失败：${image.assetId}`);
    const buffer = new Uint8Array(bytes.byteLength);
    buffer.set(bytes);
    blobs.set(image.assetId, new Blob([buffer.buffer], { type: image.mediaType }));
  }
  return { snapshot, blobs };
}

export function rebaseAvgOverrideArchive(
  data: { snapshot: AvgVisualOverridePartitionSnapshot; blobs: ReadonlyMap<string, Blob> },
  nextVisualPartitionId: string
): { snapshot: AvgVisualOverridePartitionSnapshot; blobs: Map<string, Blob> } {
  if (!nextVisualPartitionId.trim()) throw new Error('导入 AVG 自定义视觉资料需要有效分区。');
  const assetIdMap = new Map<string, string>();
  data.snapshot.assets.forEach((asset, index) => {
    assetIdMap.set(
      asset.assetId,
      `avg-override:import:${encodeURIComponent(nextVisualPartitionId)}:${index + 1}`
    );
  });
  const assets = data.snapshot.assets.map((asset) => ({
    ...asset,
    visualPartitionId: nextVisualPartitionId,
    assetId: assetIdMap.get(asset.assetId)!
  }));
  const actorOverrides = data.snapshot.actorOverrides.map((mapping) => ({
    ...mapping,
    visualPartitionId: nextVisualPartitionId,
    assetId: assetIdMap.get(mapping.assetId)!
  }));
  const sceneOverrides = data.snapshot.sceneOverrides.map((mapping) => ({
    ...mapping,
    visualPartitionId: nextVisualPartitionId,
    assetId: assetIdMap.get(mapping.assetId)!
  }));
  const userOutfits = data.snapshot.userOutfits.map((definition) => ({
    ...definition,
    visualPartitionId: nextVisualPartitionId
  }));
  const outfitSelections = data.snapshot.outfitSelections.map((selection) => ({
    ...selection,
    visualPartitionId: nextVisualPartitionId
  }));
  const outfitOverrides = data.snapshot.outfitOverrides.map((mapping) => ({
    ...mapping,
    visualPartitionId: nextVisualPartitionId,
    assetId: assetIdMap.get(mapping.assetId)!
  }));
  const blobs = new Map<string, Blob>();
  data.snapshot.assets.forEach((asset) => {
    const blob = data.blobs.get(asset.assetId);
    if (!blob) throw new Error(`AVG 自定义图片缺失：${asset.assetId}`);
    blobs.set(assetIdMap.get(asset.assetId)!, blob);
  });
  return {
    snapshot: {
      visualPartitionId: nextVisualPartitionId,
      assets,
      actorOverrides,
      sceneOverrides,
      userOutfits,
      outfitSelections,
      outfitOverrides
    },
    blobs
  };
}
