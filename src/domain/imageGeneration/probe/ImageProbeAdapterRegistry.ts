import { IMAGE_PROVIDER_TYPES } from './types';
import type { ImageGenerationProbeAdapter, ImageProviderType } from './types';

export class ImageProbeAdapterRegistry {
  private readonly adapters = new Map<ImageProviderType, ImageGenerationProbeAdapter>();

  constructor(adapters: ImageGenerationProbeAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: ImageGenerationProbeAdapter): void {
    if (this.adapters.has(adapter.providerType)) {
      throw new Error(`图片探针适配器重复注册：${adapter.providerType}`);
    }
    this.adapters.set(adapter.providerType, adapter);
  }

  get(providerType: ImageProviderType): ImageGenerationProbeAdapter {
    const adapter = this.adapters.get(providerType);
    if (!adapter) throw new Error(`图片探针适配器尚未注册：${providerType}`);
    return adapter;
  }

  listRegisteredProviderTypes(): ImageProviderType[] {
    return IMAGE_PROVIDER_TYPES.filter((providerType) => this.adapters.has(providerType));
  }

  listMissingProviderTypes(): ImageProviderType[] {
    return IMAGE_PROVIDER_TYPES.filter((providerType) => !this.adapters.has(providerType));
  }

  assertComplete(): void {
    const missing = this.listMissingProviderTypes();
    if (missing.length > 0) throw new Error(`图片探针适配器覆盖不完整：${missing.join(', ')}`);
  }
}
