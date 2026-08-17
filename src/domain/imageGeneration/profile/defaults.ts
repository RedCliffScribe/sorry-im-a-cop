import type { ImageProviderType } from '../probe';
import type { ImageApiProfile } from './types';

const providerLabels: Record<ImageProviderType, string> = {
  'openai-images': 'OpenAI Images',
  'xai-images': 'Grok（xAI）',
  'gemini-image': 'Gemini 图片',
  'alibaba-model-studio': '阿里云百炼',
  'novelai-image': 'NovelAI',
  'comfyui-workflow': 'ComfyUI',
  'sd-webui': 'SD WebUI / Forge'
};

const baseFields = (providerType: ImageProviderType, profileId: string, now: string) => ({
  profileId,
  name: providerLabels[providerType],
  enabled: false,
  credentialId: undefined,
  requestTimeoutMs: 120_000,
  downloadTimeoutMs: 60_000,
  revision: 1,
  createdAt: now,
  updatedAt: now
});

export function createDefaultImageApiProfile(
  providerType: ImageProviderType,
  profileId: string = crypto.randomUUID(),
  now: string = new Date().toISOString()
): ImageApiProfile {
  const common = baseFields(providerType, profileId, now);
  switch (providerType) {
    case 'openai-images':
      return {
        ...common,
        providerType,
        apiBaseUrl: 'https://api.openai.com/v1',
        models: [],
        config: {
          apiVariant: 'openai-official',
          resultTransportPreference: 'auto',
          modelDiscovery: 'standard-models-endpoint'
        }
      };
    case 'xai-images':
      return {
        ...common,
        providerType,
        apiBaseUrl: 'https://api.x.ai/v1',
        models: [],
        config: {
          apiVariant: 'xai-images-v1',
          resultTransportPreference: 'auto',
          modelDiscovery: 'xai-image-generation-models'
        }
      };
    case 'gemini-image':
      return {
        ...common,
        providerType,
        apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        models: [],
        config: { apiMode: 'interactions', apiVersion: 'v1beta', responseMode: 'image-only' }
      };
    case 'alibaba-model-studio':
      return {
        ...common,
        providerType,
        apiBaseUrl: 'https://dashscope-intl.aliyuncs.com/api/v1',
        models: [],
        config: {
          region: 'ap-southeast-1',
          endpointMode: 'regional-shared-domain',
          protocolVariant: 'multimodal-generation-sync',
          pollIntervalMs: 1_000,
          maxPollDurationMs: 120_000
        }
      };
    case 'novelai-image':
      return {
        ...common,
        providerType,
        apiBaseUrl: 'https://image.novelai.net',
        models: [],
        config: {
          apiVariant: 'novelai-image-current',
          responseFormat: 'auto',
          usageNoticeVersion: '2026-07'
        }
      };
    case 'comfyui-workflow':
      return {
        ...common,
        providerType,
        apiBaseUrl: 'http://127.0.0.1:8188',
        config: {
          deployment: 'core-server',
          authMode: 'none',
          eventTransport: 'websocket-preferred',
          pollIntervalMs: 1_000,
          maxPollDurationMs: 120_000,
          exclusiveInstance: false
        }
      };
    case 'sd-webui':
      return {
        ...common,
        providerType,
        apiBaseUrl: 'http://127.0.0.1:7860',
        models: [],
        config: {
          dialect: 'automatic1111-core',
          authMode: 'none',
          schemaDiscovery: 'live-docs-preferred',
          exclusiveInstance: false
        }
      };
  }
}

export function getImageProviderLabel(providerType: ImageProviderType): string {
  return providerLabels[providerType];
}
