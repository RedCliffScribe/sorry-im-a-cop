import { describe, expect, it, vi } from 'vitest';
import {
  assertSupportedUserImage,
  blobToNarratorImageInput,
  loadAnchorSourceImages
} from './userImageImport';
import type { VisualAsset } from './visualRepository';

function asset(imageId: string, byteLength = 1): VisualAsset {
  return {
    imageId,
    scope: 'save',
    saveId: 'save_a',
    source: 'user-imported',
    mimeType: 'image/png',
    width: 1,
    height: 1,
    byteLength,
    contentHash: imageId.padEnd(64, 'a').slice(0, 64),
    blobKey: `blob:${imageId}`,
    createdAt: '2026-07-22T00:00:00.000Z'
  };
}

describe('user image import boundaries', () => {
  it('accepts supported local image MIME types and rejects unrelated files', () => {
    expect(() => assertSupportedUserImage(new Blob([new Uint8Array([1])], { type: 'image/png' }))).not.toThrow();
    expect(() => assertSupportedUserImage(new Blob([new Uint8Array([1])], { type: 'text/plain' }))).toThrow(/只支持 PNG/);
  });

  it('encodes a selected image as a MIME-matched data URL for the multimodal route', async () => {
    await expect(blobToNarratorImageInput(new Blob([new Uint8Array([0, 1, 2])], { type: 'image/png' }))).resolves.toEqual({
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAEC'
    });
  });

  it('loads at most four selected anchor sources and fails when a Blob is missing', async () => {
    const getBlob = vi.fn(async () => new Blob([new Uint8Array([1])], { type: 'image/png' }));
    await expect(loadAnchorSourceImages([asset('one'), asset('two')], getBlob)).resolves.toHaveLength(2);
    await expect(loadAnchorSourceImages(
      [asset('1'), asset('2'), asset('3'), asset('4'), asset('5')],
      getBlob
    )).rejects.toThrow(/最多选择 4 张/);
    await expect(loadAnchorSourceImages([asset('missing')], async () => null)).rejects.toThrow(/找不到来源图片/);
  });
});
