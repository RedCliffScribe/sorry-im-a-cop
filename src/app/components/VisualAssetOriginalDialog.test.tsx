import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VisualAsset, VisualRepository } from '../../domain/imageGeneration/visualRepository';
import { VisualAssetOriginalDialog } from './VisualAssetOriginalDialog';

const asset: VisualAsset = {
  imageId: 'image_original',
  scope: 'save',
  saveId: 'save_original',
  source: 'user-imported',
  mimeType: 'image/png',
  width: 1024,
  height: 576,
  byteLength: 4096,
  contentHash: 'a'.repeat(64),
  blobKey: 'blob_original',
  createdAt: '2026-07-24T00:00:00.000Z'
};

describe('VisualAssetOriginalDialog', () => {
  it('shows the original dimensions, downloads the original Blob, and closes with Escape', async () => {
    const getBlob = vi.fn(async () => new Blob(['image'], { type: 'image/png' }));
    const onClose = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:original') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<VisualAssetOriginalDialog
      repository={{ getBlob } as Pick<VisualRepository, 'getBlob'>}
      asset={asset}
      alt="雨夜街头"
      onClose={onClose}
    />);

    expect(screen.getByRole('dialog', { name: '原图预览：雨夜街头' })).toHaveTextContent('1024 × 576');
    expect(await screen.findByRole('img', { name: '雨夜街头' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下载原文件' }));
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(getBlob).toHaveBeenCalledWith('blob_original');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
