import type { ApiInterfaceType } from './types';
import { canFetchModels } from './apiCapabilities';

interface FetchAvailableModelsOptions {
  interfaceType: ApiInterfaceType;
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface ModelRequest {
  url: string;
  headers: Record<string, string>;
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function joinUrl(baseUrl: string, path: string) {
  return `${trimTrailingSlash(baseUrl)}/${path.replace(/^\/+/, '')}`;
}

function buildModelRequest(interfaceType: ApiInterfaceType, baseUrl: string, apiKey: string): ModelRequest {
  const cleanBaseUrl = trimTrailingSlash(baseUrl);
  if (!cleanBaseUrl) {
    throw new Error('请先填写 Base URL。');
  }

  if (interfaceType === 'google-gemini') {
    const separator = cleanBaseUrl.includes('?') ? '&' : '?';
    return {
      url: `${joinUrl(cleanBaseUrl, 'models')}${separator}key=${encodeURIComponent(apiKey.trim())}`,
      headers: {}
    };
  }

  if (interfaceType === 'anthropic') {
    return {
      url: joinUrl(cleanBaseUrl, 'models'),
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      }
    };
  }

  if (interfaceType === 'azure-openai') {
    return {
      url: `${joinUrl(cleanBaseUrl, 'openai/deployments')}?api-version=2024-10-21`,
      headers: { 'api-key': apiKey.trim() }
    };
  }

  if (interfaceType === 'ollama') {
    return {
      url: joinUrl(cleanBaseUrl, 'api/tags'),
      headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}
    };
  }

  return {
    url: joinUrl(cleanBaseUrl, 'models'),
    headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}
  };
}

function normalizeModelName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const modelName = value.trim().replace(/^models\//, '');
  return modelName || null;
}

function collectModelNames(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const containers = [record.data, record.models].filter(Array.isArray) as unknown[][];
  const names = containers.flatMap((items) =>
    items
      .map((item) => {
        if (typeof item === 'string') {
          return normalizeModelName(item);
        }
        if (!item || typeof item !== 'object') {
          return null;
        }
        const model = item as Record<string, unknown>;
        return normalizeModelName(model.id) ?? normalizeModelName(model.name) ?? normalizeModelName(model.model);
      })
      .filter((modelName): modelName is string => Boolean(modelName))
  );

  return Array.from(new Set(names));
}

export async function fetchAvailableModels({
  interfaceType,
  baseUrl,
  apiKey,
  fetchImpl = fetch
}: FetchAvailableModelsOptions): Promise<string[]> {
  if (!canFetchModels(interfaceType)) {
    throw new Error('当前接口类型暂不支持获取模型列表。');
  }
  const request = buildModelRequest(interfaceType, baseUrl, apiKey);
  const response = await fetchImpl(request.url, { headers: request.headers });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`模型列表获取失败：${response.status}${message ? ` ${message}` : ''}`);
  }

  const payload = await response.json();
  const models = collectModelNames(payload);
  if (models.length === 0) {
    throw new Error('模型列表获取失败：接口没有返回可用模型。');
  }

  return models;
}
