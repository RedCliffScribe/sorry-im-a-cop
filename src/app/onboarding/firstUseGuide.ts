import {
  requiresApiKey,
  supportsFeatureRoute,
  supportsMainNarration
} from '../../domain/settings/apiCapabilities';
import type { AiSettings, FeatureRouteId } from '../../domain/settings/types';

export const FIRST_USE_GUIDE_VERSION = '2026-07-19.1';
export const FIRST_USE_GUIDE_STORAGE_KEY = 'sorry-im-a-cop-v2-first-use-guide';

interface FirstUseGuideRecord {
  version: string;
  dismissedAt: string;
}
export function isMainNarratorReady(settings: AiSettings): boolean {
  const route = settings.mainNarrator;
  if (!route?.model.trim()) return false;

  const profile = settings.apiProfiles.find((item) => item.id === route.apiProfileId);
  if (!profile) return false;

  return Boolean(
    profile.baseUrl.trim() &&
      (!requiresApiKey(profile.interfaceType) || profile.apiKey.trim()) &&
      supportsMainNarration(profile.interfaceType)
  );
}

export function hasDismissedFirstUseGuide(): boolean {
  try {
    const raw = localStorage.getItem(FIRST_USE_GUIDE_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<FirstUseGuideRecord>;
    return parsed.version === FIRST_USE_GUIDE_VERSION && Boolean(parsed.dismissedAt);
  } catch {
    return false;
  }
}

export function recordFirstUseGuideDismissal(): void {
  const record: FirstUseGuideRecord = {
    version: FIRST_USE_GUIDE_VERSION,
    dismissedAt: new Date().toISOString()
  };
  localStorage.setItem(FIRST_USE_GUIDE_STORAGE_KEY, JSON.stringify(record));
}

export function shouldOfferFirstUseGuide(settings: AiSettings): boolean {
  return !isMainNarratorReady(settings) && !hasDismissedFirstUseGuide();
}

export function describeFeatureRouteStatus(settings: AiSettings, routeId: FeatureRouteId): string {
  const route = settings.featureRoutes[routeId];
  if (route.mode === 'disabled') return '当前：未启用';
  if (route.mode === 'follow-main') {
    return isMainNarratorReady(settings) ? '当前：跟随主剧情' : '当前：待主剧情配置';
  }

  const profile = settings.apiProfiles.find((item) => item.id === route.apiProfileId);
  if (
    !profile ||
    !profile.baseUrl.trim() ||
    (requiresApiKey(profile.interfaceType) && !profile.apiKey.trim()) ||
    !route.model.trim() ||
    !supportsFeatureRoute(profile.interfaceType, routeId)
  ) {
    return '当前：独立配置不完整';
  }

  return `当前：独立 · ${profile.name} / ${route.model}`;
}
