import { requiresApiKey, supportsMainNarration } from '../settings/apiCapabilities';
import type { AiSettings } from '../settings/types';
import { OpenAiCompatibleNarratorClient } from './OpenAiCompatibleNarratorClient';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const missingMainNarratorMessage = '请先在设置里配置主剧情 API 和模型。';

export function createNarratorClientFromSettings(settings: AiSettings, fetchImpl?: FetchLike) {
  const route = settings.mainNarrator;
  if (!route) {
    throw new Error(missingMainNarratorMessage);
  }

  const profile = settings.apiProfiles.find((item) => item.id === route.apiProfileId);
  if (!profile) {
    throw new Error(missingMainNarratorMessage);
  }
  if (
    !profile.baseUrl.trim() ||
    (requiresApiKey(profile.interfaceType) && !profile.apiKey.trim()) ||
    !route.model.trim()
  ) {
    throw new Error(missingMainNarratorMessage);
  }
  if (!supportsMainNarration(profile.interfaceType)) {
    throw new Error(`当前主剧情接口类型暂不支持开局调用：${profile.interfaceType}`);
  }

  return new OpenAiCompatibleNarratorClient({
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: route.model,
    maxTokens: route.maxTokens ?? profile.defaultMaxTokens,
    temperature: route.temperature ?? profile.defaultTemperature,
    fetchImpl
  });
}
