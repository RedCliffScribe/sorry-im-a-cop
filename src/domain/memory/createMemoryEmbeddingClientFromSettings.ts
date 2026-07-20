import { requiresApiKey, supportsEmbeddingRouting } from '../settings/apiCapabilities';
import type { AiSettings } from '../settings/types';
import type { MemoryEmbeddingClient } from './MemoryEmbeddingClient';
import { OpenAiCompatibleMemoryEmbeddingClient } from './OpenAiCompatibleMemoryEmbeddingClient';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createMemoryEmbeddingClientFromSettings(
  settings: AiSettings,
  fetchImpl?: FetchLike
): MemoryEmbeddingClient | null {
  const route = settings.featureRoutes.memoryVector;
  if (!route || route.mode !== 'custom') {
    return null;
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
  if (!supportsEmbeddingRouting(profile.interfaceType)) {
    return null;
  }

  return new OpenAiCompatibleMemoryEmbeddingClient({
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: route.model,
    fetchImpl
  });
}
