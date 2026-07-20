import type { ApiInterfaceType, FeatureRouteId } from './types';

export interface ApiCapabilities {
  label: string;
  modelCatalog: boolean;
  mainNarration: boolean;
  auxiliaryRouting: boolean;
  embeddingRouting: boolean;
  apiKeyRequired: boolean;
}

export const apiInterfaceTypes: ApiInterfaceType[] = [
  'openai-compatible',
  'openai',
  'azure-openai',
  'anthropic',
  'google-gemini',
  'deepseek',
  'openrouter',
  'siliconflow',
  'ollama',
  'custom'
];

const openAiCompatibleCapabilities: Omit<ApiCapabilities, 'label'> = {
  modelCatalog: true,
  mainNarration: true,
  auxiliaryRouting: true,
  embeddingRouting: true,
  apiKeyRequired: true
};

export const apiCapabilities: Record<ApiInterfaceType, ApiCapabilities> = {
  'openai-compatible': { label: 'OpenAI 兼容', ...openAiCompatibleCapabilities },
  openai: { label: 'OpenAI 官方', ...openAiCompatibleCapabilities },
  'azure-openai': {
    label: 'Azure OpenAI',
    modelCatalog: true,
    mainNarration: false,
    auxiliaryRouting: false,
    embeddingRouting: false,
    apiKeyRequired: true
  },
  anthropic: {
    label: 'Anthropic Claude',
    modelCatalog: true,
    mainNarration: false,
    auxiliaryRouting: false,
    embeddingRouting: false,
    apiKeyRequired: true
  },
  'google-gemini': {
    label: 'Google Gemini',
    modelCatalog: true,
    mainNarration: false,
    auxiliaryRouting: false,
    embeddingRouting: false,
    apiKeyRequired: true
  },
  deepseek: { label: 'DeepSeek', ...openAiCompatibleCapabilities },
  openrouter: { label: 'OpenRouter', ...openAiCompatibleCapabilities },
  siliconflow: { label: 'SiliconFlow', ...openAiCompatibleCapabilities },
  ollama: {
    label: 'Ollama 本地',
    modelCatalog: true,
    mainNarration: false,
    auxiliaryRouting: false,
    embeddingRouting: false,
    apiKeyRequired: false
  },
  custom: { label: '自定义接口', ...openAiCompatibleCapabilities }
};

export function getApiCapabilities(interfaceType: ApiInterfaceType): ApiCapabilities {
  return apiCapabilities[interfaceType];
}

export function canFetchModels(interfaceType: ApiInterfaceType): boolean {
  return getApiCapabilities(interfaceType).modelCatalog;
}

export function supportsMainNarration(interfaceType: ApiInterfaceType): boolean {
  return getApiCapabilities(interfaceType).mainNarration;
}

export function supportsAuxiliaryRouting(interfaceType: ApiInterfaceType): boolean {
  return getApiCapabilities(interfaceType).auxiliaryRouting;
}

export function supportsEmbeddingRouting(interfaceType: ApiInterfaceType): boolean {
  return getApiCapabilities(interfaceType).embeddingRouting;
}

export function supportsFeatureRoute(interfaceType: ApiInterfaceType, routeId: FeatureRouteId): boolean {
  return routeId === 'memoryVector'
    ? supportsEmbeddingRouting(interfaceType)
    : supportsAuxiliaryRouting(interfaceType);
}

export function requiresApiKey(interfaceType: ApiInterfaceType): boolean {
  return getApiCapabilities(interfaceType).apiKeyRequired;
}
