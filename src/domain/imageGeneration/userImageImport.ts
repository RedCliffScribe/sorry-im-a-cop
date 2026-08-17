import type { NarratorImageInput } from '../narrator/NarratorClient';
import type { VisualAsset } from './visualRepository';

export const USER_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const MAX_USER_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_RESTORABLE_IMAGE_BYTES = 64 * 1024 * 1024;
export const MAX_ANCHOR_SOURCE_IMAGES = 4;
export const MAX_ANCHOR_SOURCE_TOTAL_BYTES = 30 * 1024 * 1024;

export type UserImageMimeType = (typeof USER_IMAGE_MIME_TYPES)[number];

export function assertSupportedUserImage(blob: Blob): asserts blob is Blob & { type: UserImageMimeType } {
  if (!USER_IMAGE_MIME_TYPES.includes(blob.type as UserImageMimeType)) {
    throw new Error('只支持 PNG、JPEG、WebP 或 GIF 图片。');
  }
  if (blob.size <= 0) throw new Error('图片文件为空。');
  if (blob.size > MAX_USER_IMAGE_BYTES) throw new Error('单张图片不能超过 15 MB。');
}

function assertSupportedRestorableImage(blob: Blob): asserts blob is Blob & { type: UserImageMimeType } {
  if (!USER_IMAGE_MIME_TYPES.includes(blob.type as UserImageMimeType)) {
    throw new Error('只支持 PNG、JPEG、WebP 或 GIF 图片。');
  }
  if (blob.size <= 0) throw new Error('图片文件为空。');
  if (blob.size > MAX_RESTORABLE_IMAGE_BYTES) throw new Error('待恢复图片不能超过 64 MB。');
}

async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      if (!bitmap.width || !bitmap.height) throw new Error('无法读取图片真实尺寸。');
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('当前浏览器不支持读取本地图片尺寸。');
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth && image.naturalHeight
        ? resolve({ width: image.naturalWidth, height: image.naturalHeight })
        : reject(new Error('无法读取图片真实尺寸。'));
      image.onerror = () => reject(new Error('图片无法解码或文件已损坏。'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readUserImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  assertSupportedUserImage(blob);
  return readImageDimensions(blob);
}

export async function readRestorableImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  assertSupportedRestorableImage(blob);
  return readImageDimensions(blob);
}

export async function blobToNarratorImageInput(blob: Blob): Promise<NarratorImageInput> {
  assertSupportedUserImage(blob);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return {
    mimeType: blob.type,
    dataUrl: `data:${blob.type};base64,${btoa(binary)}`
  };
}

export async function loadAnchorSourceImages(
  assets: readonly VisualAsset[],
  getBlob: (blobKey: string) => Promise<Blob | null>
): Promise<NarratorImageInput[]> {
  if (!assets.length) throw new Error('至少选择一张角色图片。');
  if (assets.length > MAX_ANCHOR_SOURCE_IMAGES) throw new Error('一次最多选择 4 张角色图片。');
  const totalBytes = assets.reduce((sum, asset) => sum + asset.byteLength, 0);
  if (totalBytes > MAX_ANCHOR_SOURCE_TOTAL_BYTES) throw new Error('所选图片总大小不能超过 30 MB。');
  return Promise.all(assets.map(async (asset) => {
    const blob = await getBlob(asset.blobKey);
    if (!blob) throw new Error(`找不到来源图片 ${asset.imageId} 的本地文件。`);
    return blobToNarratorImageInput(blob);
  }));
}

export function createLocalVisualId(prefix: 'image' | 'blob'): string {
  const random = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:user:${random}`;
}
