import { describe, expect, it } from 'vitest';
import { ImageProbeAdapterRegistry } from './ImageProbeAdapterRegistry';
import { IMAGE_PROVIDER_TYPES } from './types';
import type { ImageGenerationProbeAdapter, ImageProviderType } from './types';

function createAdapter(providerType: ImageProviderType): ImageGenerationProbeAdapter {
  return {
    providerType,
    validate: () => ({ ok: true }),
    generate: async () => ({ images: [{ bytes: new Uint8Array([1]).buffer, mimeType: 'image/png' }] })
  };
}

describe('ImageProbeAdapterRegistry', () => {
  it('reports missing providers in the frozen first-release order', () => {
    const registry = new ImageProbeAdapterRegistry([createAdapter('openai-images'), createAdapter('sd-webui')]);

    expect(registry.listRegisteredProviderTypes()).toEqual(['openai-images', 'sd-webui']);
    expect(registry.listMissingProviderTypes()).toEqual([
      'xai-images',
      'gemini-image',
      'alibaba-model-studio',
      'novelai-image',
      'comfyui-workflow'
    ]);
    expect(() => registry.assertComplete()).toThrow('覆盖不完整');
  });

  it('accepts exactly one adapter for every first-release provider', () => {
    const registry = new ImageProbeAdapterRegistry(IMAGE_PROVIDER_TYPES.map(createAdapter));

    expect(() => registry.assertComplete()).not.toThrow();
    expect(registry.get('gemini-image').providerType).toBe('gemini-image');
  });

  it('rejects duplicate provider registrations', () => {
    expect(
      () => new ImageProbeAdapterRegistry([createAdapter('novelai-image'), createAdapter('novelai-image')])
    ).toThrow('重复注册');
  });
});
