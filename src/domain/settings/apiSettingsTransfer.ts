import { createDefaultAiSettings } from './defaultSettings';
import {
  apiInterfaceTypes,
  requiresApiKey,
  supportsFeatureRoute,
  supportsMainNarration
} from './apiCapabilities';
import type {
  AiSettings,
  ApiInterfaceType,
  ApiProfile,
  FeatureModelRoute,
  FeatureRouteId,
  MainNarratorRoute
} from './types';

export const API_SETTINGS_EXPORT_APP = 'sorry-im-a-cop-v2';
export const API_SETTINGS_EXPORT_SCHEMA_VERSION = 1;

export interface ApiSettingsExportPayload {
  app: typeof API_SETTINGS_EXPORT_APP;
  schemaVersion: typeof API_SETTINGS_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  apiProfiles: ApiProfile[];
  mainNarrator: MainNarratorRoute | null;
  featureRoutes: Record<FeatureRouteId, FeatureModelRoute>;
}

const featureRouteIds: FeatureRouteId[] = [
  'writebackRepair',
  'memorySummary',
  'memoryVector',
  'npcSimulation',
  'backgroundEvolution',
  'auxiliaryGeneration'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readModels(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((model) => readString(model)).filter(Boolean)
    : [];
}

function normalizeInterfaceType(value: unknown): ApiInterfaceType {
  return typeof value === 'string' && apiInterfaceTypes.includes(value as ApiInterfaceType)
    ? (value as ApiInterfaceType)
    : 'openai-compatible';
}

function normalizeApiProfile(value: unknown): ApiProfile {
  if (!isRecord(value)) {
    throw new Error('API 设置文件里的 API 档案格式无效。');
  }

  const id = readString(value.id);
  const name = readString(value.name);
  const baseUrl = readString(value.baseUrl);
  const apiKey = readString(value.apiKey);
  const interfaceType = normalizeInterfaceType(value.interfaceType);
  if (!id || !name || !baseUrl || (requiresApiKey(interfaceType) && !apiKey)) {
    throw new Error('API 设置文件里的 API 档案缺少名称、Base URL 或 API Key。');
  }

  const now = new Date().toISOString();
  return {
    id,
    name,
    providerLabel: readString(value.providerLabel) || interfaceType,
    interfaceType,
    baseUrl,
    apiKey,
    models: readModels(value.models),
    defaultMaxTokens: readNumber(value.defaultMaxTokens),
    defaultTemperature: readNumber(value.defaultTemperature),
    createdAt: readString(value.createdAt) || now,
    updatedAt: readString(value.updatedAt) || now
  };
}

function normalizeMainNarrator(
  value: unknown,
  profilesById: Map<string, ApiProfile>
): MainNarratorRoute | null {
  if (!isRecord(value)) {
    return null;
  }

  const apiProfileId = readString(value.apiProfileId);
  const model = readString(value.model);
  const profile = profilesById.get(apiProfileId);
  if (!profile || !model || !supportsMainNarration(profile.interfaceType)) {
    return null;
  }

  return {
    apiProfileId,
    model,
    maxTokens: readNumber(value.maxTokens),
    temperature: readNumber(value.temperature)
  };
}

function normalizeFeatureRoute(
  routeId: FeatureRouteId,
  value: unknown,
  profilesById: Map<string, ApiProfile>
): FeatureModelRoute {
  const defaults = createDefaultAiSettings().featureRoutes;
  if (!isRecord(value)) {
    return defaults[routeId];
  }

  const mode = value.mode;
  if (mode === 'follow-main') {
    return { mode: 'follow-main' };
  }
  if (mode === 'disabled') {
    return { mode: 'disabled' };
  }
  if (mode === 'custom') {
    const apiProfileId = readString(value.apiProfileId);
    const model = readString(value.model);
    const profile = profilesById.get(apiProfileId);
    const routeSupported = profile ? supportsFeatureRoute(profile.interfaceType, routeId) : false;
    if (!profile || !model || !routeSupported) {
      return defaults[routeId];
    }
    return {
      mode: 'custom',
      apiProfileId,
      model,
      maxTokens: readNumber(value.maxTokens),
      temperature: readNumber(value.temperature)
    };
  }

  return defaults[routeId];
}

function normalizeFeatureRoutes(
  value: unknown,
  profilesById: Map<string, ApiProfile>
): Record<FeatureRouteId, FeatureModelRoute> {
  const routes = isRecord(value) ? value : {};
  return featureRouteIds.reduce(
    (result, routeId) => ({
      ...result,
      [routeId]: normalizeFeatureRoute(routeId, routes[routeId], profilesById)
    }),
    {} as Record<FeatureRouteId, FeatureModelRoute>
  );
}

export function exportApiSettings(
  settings: AiSettings,
  exportedAt = new Date().toISOString()
): ApiSettingsExportPayload {
  return {
    app: API_SETTINGS_EXPORT_APP,
    schemaVersion: API_SETTINGS_EXPORT_SCHEMA_VERSION,
    exportedAt,
    apiProfiles: settings.apiProfiles,
    mainNarrator: settings.mainNarrator,
    featureRoutes: settings.featureRoutes
  };
}

export function importApiSettings(currentSettings: AiSettings, rawJson: string): AiSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('API 设置文件不是有效 JSON。');
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.apiProfiles)) {
    throw new Error('API 设置文件缺少 apiProfiles。');
  }

  const apiProfiles = parsed.apiProfiles.map(normalizeApiProfile);
  const profilesById = new Map<string, ApiProfile>();
  for (const profile of apiProfiles) {
    if (profilesById.has(profile.id)) {
      throw new Error('API 设置文件包含重复的 API 档案 ID。');
    }
    profilesById.set(profile.id, profile);
  }

  return {
    ...currentSettings,
    apiProfiles,
    mainNarrator: normalizeMainNarrator(parsed.mainNarrator, profilesById),
    featureRoutes: normalizeFeatureRoutes(parsed.featureRoutes, profilesById)
  };
}
