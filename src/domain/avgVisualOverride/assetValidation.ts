import {
  AVG_OVERRIDE_IMAGE_MEDIA_TYPES,
  type AvgOverrideImageMediaType,
  type AvgValidatedOverrideImage
} from './types';

export const MAX_AVG_OVERRIDE_IMAGE_BYTES = 32 * 1024 * 1024;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function sniffImageMediaType(bytes: Uint8Array): AvgOverrideImageMediaType | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) return 'image/webp';
  return undefined;
}

async function readDimensions(blob: Blob): Promise<{ width: number; height: number }> {
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

export async function validateAvgOverrideImage(
  file: Blob & { name?: string }
): Promise<AvgValidatedOverrideImage> {
  if (file.size <= 0) throw new Error('图片文件为空。');
  if (file.size > MAX_AVG_OVERRIDE_IMAGE_BYTES) {
    throw new Error('单张 AVG 自定义图片不能超过 32 MiB。');
  }
  if (!AVG_OVERRIDE_IMAGE_MEDIA_TYPES.includes(file.type as AvgOverrideImageMediaType)) {
    throw new Error('只支持 PNG、WebP 或 JPEG/JPG 图片；不支持 SVG、GIF 或 HTML。');
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mediaType = sniffImageMediaType(bytes.subarray(0, 16));
  if (!mediaType || mediaType !== file.type) {
    throw new Error('文件内容与图片格式不一致，已拒绝导入。');
  }
  let dimensions: { width: number; height: number };
  try {
    dimensions = await readDimensions(file);
  } catch {
    throw new Error('图片无法解码或文件已损坏。');
  }
  const digest = typeof crypto !== 'undefined' && crypto.subtle
    ? await crypto.subtle.digest('SHA-256', buffer)
    : undefined;
  if (!digest) throw new Error('当前浏览器不支持安全校验本地图片。');
  return {
    blob: file,
    mediaType,
    width: dimensions.width,
    height: dimensions.height,
    byteLength: file.size,
    sha256: bytesToHex(new Uint8Array(digest)),
    source: 'manual_upload',
    ...(file.name ? { originalFileName: file.name } : {})
  };
}

export function formatAvgOverrideByteLength(byteLength: number): string {
  if (byteLength >= 1024 * 1024) return `${(byteLength / (1024 * 1024)).toFixed(2)} MiB`;
  return `${Math.max(1, Math.ceil(byteLength / 1024))} KiB`;
}
