import { createNarratorClientFromSettings } from '../narrator/createNarratorClientFromSettings';
import type { NarratorClient } from '../narrator/NarratorClient';
import { OpenAiCompatibleNarratorClient } from '../narrator/OpenAiCompatibleNarratorClient';
import { requiresApiKey, supportsAuxiliaryRouting } from '../settings/apiCapabilities';
import type { AiSettings } from '../settings/types';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createMemorySummaryClientFromSettings(
  settings: AiSettings,
  fetchImpl?: FetchLike
): NarratorClient | null {
  const route = settings.featureRoutes.memorySummary;
  if (!route || route.mode === 'disabled') return null;

  if (route.mode === 'follow-main') {
    return createNarratorClientFromSettings(settings, fetchImpl);
  }

  const profile = settings.apiProfiles.find((item) => item.id === route.apiProfileId);
  if (
    !profile ||
    !profile.baseUrl.trim() ||
    (requiresApiKey(profile.interfaceType) && !profile.apiKey.trim()) ||
    !route.model.trim()
  ) {
    return null;
  }
  if (!supportsAuxiliaryRouting(profile.interfaceType)) {
    return null;
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
