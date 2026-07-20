import { createDefaultAiSettings } from './defaultSettings';
import type {
  AiSettings,
  ApiProfile,
  FeatureModelRoute,
  FeatureRouteId,
  MainNarratorRoute,
  MemoryCompressionSettings
} from './types';
import {
  requiresApiKey,
  supportsFeatureRoute,
  supportsMainNarration
} from './apiCapabilities';

function isProfileUsable(profile: ApiProfile): boolean {
  return Boolean(
    profile.id &&
      profile.name.trim() &&
      profile.baseUrl.trim() &&
      (!requiresApiKey(profile.interfaceType) || profile.apiKey.trim())
  );
}

export function upsertApiProfile(settings: AiSettings, profile: ApiProfile): AiSettings {
  if (!isProfileUsable(profile)) {
    throw new Error('API 配置缺少名称、Base URL 或 API Key。');
  }

  const cleanedProfile: ApiProfile = {
    ...profile,
    models: profile.models.map((model) => model.trim()).filter(Boolean)
  };

  const existingIndex = settings.apiProfiles.findIndex((item) => item.id === profile.id);
  const apiProfiles =
    existingIndex >= 0
      ? settings.apiProfiles.map((item) => (item.id === profile.id ? cleanedProfile : item))
      : [...settings.apiProfiles, cleanedProfile];

  const defaults = createDefaultAiSettings();
  const featureRoutes = { ...settings.featureRoutes };
  (Object.keys(featureRoutes) as FeatureRouteId[]).forEach((routeId) => {
    const route = featureRoutes[routeId];
    if (route.mode !== 'custom' || route.apiProfileId !== cleanedProfile.id) {
      return;
    }
    if (!supportsFeatureRoute(cleanedProfile.interfaceType, routeId)) {
      featureRoutes[routeId] = defaults.featureRoutes[routeId];
    }
  });

  return {
    ...settings,
    apiProfiles,
    mainNarrator:
      settings.mainNarrator?.apiProfileId === cleanedProfile.id &&
      !supportsMainNarration(cleanedProfile.interfaceType)
        ? null
        : settings.mainNarrator,
    featureRoutes
  };
}

export function updateApiProfileModels(settings: AiSettings, apiProfileId: string, models: string[]): AiSettings {
  const profile = settings.apiProfiles.find((item) => item.id === apiProfileId);
  if (!profile) {
    throw new Error('API 配置不存在。');
  }

  return upsertApiProfile(settings, {
    ...profile,
    models,
    updatedAt: new Date().toISOString()
  });
}

export function setMainNarratorRoute(settings: AiSettings, route: MainNarratorRoute | null): AiSettings {
  if (!route) {
    return { ...settings, mainNarrator: null };
  }

  const profile = settings.apiProfiles.find((item) => item.id === route.apiProfileId);
  if (!profile) {
    throw new Error('主剧情 API 配置不存在。');
  }
  if (!route.model.trim()) {
    throw new Error('主剧情必须选择模型。');
  }
  if (!supportsMainNarration(profile.interfaceType)) {
    throw new Error('当前接口类型暂不支持主剧情调用。');
  }

  return {
    ...settings,
    mainNarrator: {
      ...route,
      model: route.model.trim()
    }
  };
}

export function setFeatureRoute(settings: AiSettings, routeId: FeatureRouteId, route: FeatureModelRoute): AiSettings {
  if (route.mode === 'custom') {
    const profile = settings.apiProfiles.find((item) => item.id === route.apiProfileId);
    if (!profile) {
      throw new Error('功能配置选择的 API 配置不存在。');
    }
    if (!route.model.trim()) {
      throw new Error('功能配置必须选择模型。');
    }
    if (!supportsFeatureRoute(profile.interfaceType, routeId)) {
      throw new Error(
        routeId === 'memoryVector'
          ? '当前接口类型暂不支持向量调用。'
          : '当前接口类型暂不支持功能调用。'
      );
    }
  }

  return {
    ...settings,
    featureRoutes: {
      ...settings.featureRoutes,
      [routeId]: route.mode === 'custom' ? { ...route, model: route.model.trim() } : route
    }
  };
}

export function setMemoryCompressionSettings(
  settings: AiSettings,
  patch: Partial<MemoryCompressionSettings>
): AiSettings {
  return {
    ...settings,
    memory: {
      ...settings.memory,
      ...patch
    }
  };
}

export function deleteApiProfile(settings: AiSettings, apiProfileId: string): AiSettings {
  const apiProfiles = settings.apiProfiles.filter((profile) => profile.id !== apiProfileId);
  const mainNarrator = settings.mainNarrator?.apiProfileId === apiProfileId ? null : settings.mainNarrator;
  const defaults = createDefaultAiSettings();
  const memoryVectorRoute = settings.featureRoutes.memoryVector ?? defaults.featureRoutes.memoryVector;
  const npcSimulationRoute = settings.featureRoutes.npcSimulation ?? defaults.featureRoutes.npcSimulation;
  const backgroundEvolutionRoute =
    settings.featureRoutes.backgroundEvolution ?? defaults.featureRoutes.backgroundEvolution;
  const auxiliaryGenerationRoute =
    settings.featureRoutes.auxiliaryGeneration ?? defaults.featureRoutes.auxiliaryGeneration;

  return {
    ...settings,
    apiProfiles,
    mainNarrator,
    featureRoutes: {
      writebackRepair:
        settings.featureRoutes.writebackRepair.mode === 'custom' &&
        settings.featureRoutes.writebackRepair.apiProfileId === apiProfileId
          ? defaults.featureRoutes.writebackRepair
          : settings.featureRoutes.writebackRepair,
      memorySummary:
        settings.featureRoutes.memorySummary.mode === 'custom' &&
        settings.featureRoutes.memorySummary.apiProfileId === apiProfileId
          ? defaults.featureRoutes.memorySummary
          : settings.featureRoutes.memorySummary,
      memoryVector:
        memoryVectorRoute.mode === 'custom' &&
        memoryVectorRoute.apiProfileId === apiProfileId
          ? defaults.featureRoutes.memoryVector
          : memoryVectorRoute,
      npcSimulation:
        npcSimulationRoute.mode === 'custom' &&
        npcSimulationRoute.apiProfileId === apiProfileId
          ? defaults.featureRoutes.npcSimulation
          : npcSimulationRoute,
      backgroundEvolution:
        backgroundEvolutionRoute.mode === 'custom' &&
        backgroundEvolutionRoute.apiProfileId === apiProfileId
          ? defaults.featureRoutes.backgroundEvolution
          : backgroundEvolutionRoute,
      auxiliaryGeneration:
        auxiliaryGenerationRoute.mode === 'custom' &&
        auxiliaryGenerationRoute.apiProfileId === apiProfileId
          ? defaults.featureRoutes.auxiliaryGeneration
          : auxiliaryGenerationRoute
    }
  };
}
