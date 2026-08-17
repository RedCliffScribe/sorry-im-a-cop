import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatAvgOverrideByteLength,
  MAX_AVG_OVERRIDE_IMAGE_BYTES,
  validateAvgOverrideImage
} from './assetValidation';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50
]);

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubDecode(width = 1536, height = 2304) {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close })));
  return close;
}

describe('AVG override image validation', () => {
  it.each([
    ['portrait.png', 'image/png', PNG],
    ['portrait.jpg', 'image/jpeg', JPEG],
    ['portrait.webp', 'image/webp', WEBP]
  ] as const)('accepts and hashes a decodable %s', async (name, type, bytes) => {
    const close = stubDecode();
    const file = new File([bytes.slice().buffer], name, { type });

    const result = await validateAvgOverrideImage(file);

    expect(result).toMatchObject({
      mediaType: type,
      width: 1536,
      height: 2304,
      byteLength: bytes.byteLength,
      originalFileName: name
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects unsupported or disguised content before storage', async () => {
    stubDecode();
    const svg = new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' });
    const disguised = new File([PNG.slice().buffer], 'fake.jpg', { type: 'image/jpeg' });

    await expect(validateAvgOverrideImage(svg)).rejects.toThrow('只支持 PNG、WebP 或 JPEG/JPG');
    await expect(validateAvgOverrideImage(disguised)).rejects.toThrow('文件内容与图片格式不一致');
  });

  it('rejects empty, oversized, and undecodable images without returning metadata', async () => {
    await expect(validateAvgOverrideImage(
      new File([], 'empty.png', { type: 'image/png' })
    )).rejects.toThrow('图片文件为空');

    const oversized = {
      size: MAX_AVG_OVERRIDE_IMAGE_BYTES + 1,
      type: 'image/png',
      name: 'oversized.png',
      arrayBuffer: vi.fn()
    } as unknown as Blob & { name: string };
    await expect(validateAvgOverrideImage(oversized)).rejects.toThrow('不能超过 32 MiB');
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();

    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      throw new Error('decode failed');
    }));
    const corrupt = new File([PNG.slice().buffer], 'corrupt.png', { type: 'image/png' });
    await expect(validateAvgOverrideImage(corrupt)).rejects.toThrow('图片无法解码或文件已损坏');
  });

  it('formats byte sizes for the import preview', () => {
    expect(formatAvgOverrideByteLength(1)).toBe('1 KiB');
    expect(formatAvgOverrideByteLength(2048)).toBe('2 KiB');
    expect(formatAvgOverrideByteLength(2.5 * 1024 * 1024)).toBe('2.50 MiB');
  });
});
