import type { AvgOverrideImageAssetRef, AvgVisualOverrideRepository } from './types';

/** Centralized Object URL lifecycle for player-owned AVG override Blobs. */
export class AvgOverrideAssetUrlManager {
  private readonly urls = new Map<string, string>();

  constructor(private readonly repository: AvgVisualOverrideRepository) {}

  async getAssetDisplayUrl(asset: AvgOverrideImageAssetRef): Promise<string | undefined> {
    const cached = this.urls.get(asset.assetId);
    if (cached) return cached;
    if (typeof URL.createObjectURL !== 'function') return undefined;
    const blob = await this.repository.getAssetBlob(asset.assetId);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    this.urls.set(asset.assetId, url);
    return url;
  }

  invalidate(assetId?: string): void {
    if (assetId) {
      const url = this.urls.get(assetId);
      if (url) URL.revokeObjectURL(url);
      this.urls.delete(assetId);
      return;
    }
    this.dispose();
  }

  dispose(): void {
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
  }
}
