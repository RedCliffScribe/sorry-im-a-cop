import { LEGACY_RUNTIME_STORAGE_KEY } from '../../domain/persistence/LocalStorageRuntimeRepository';
import { IndexedDbImageAutomationSettingsRepository } from '../../domain/imageGeneration/automationSettings';
import { IndexedDbImageGenerationPresetRepository } from '../../domain/imageGeneration/generationPresets';
import { IndexedDbImageProbeStore } from '../../domain/imageGeneration/probe';
import {
  IndexedDbImageCredentialRepository,
  IndexedDbImageProfileRepository
} from '../../domain/imageGeneration/profile';
import { IndexedDbImagePromptTemplateRepository } from '../../domain/imageGeneration/promptConversion';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import type { AiSettings } from '../../domain/settings/types';
import {
  ANALYTICS_SESSION_STORAGE_KEY,
  ANALYTICS_VISITOR_STORAGE_KEY
} from '../analytics/operationalAnalytics';
import { CHANGELOG_STORAGE_KEY } from '../changelog/releaseNotes';
import { OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY } from '../legal/openingLegalDisclaimer';
import { FIRST_USE_GUIDE_STORAGE_KEY } from '../onboarding/firstUseGuide';
import { CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY } from '../opening/customOriginStorage';

export type DataClearTarget =
  | 'gameData'
  | 'apiSettings'
  | 'promptSettings'
  | 'tavernSettings'
  | 'gameSettings'
  | 'displaySettings'
  | 'memorySettings'
  | 'customOrigins'
  | 'localRecords'
  | 'allExceptApi'
  | 'allData';

const settingsTargets = new Set<DataClearTarget>([
  'apiSettings',
  'promptSettings',
  'tavernSettings',
  'gameSettings',
  'displaySettings',
  'memorySettings',
  'allExceptApi',
  'allData'
]);

export const LOCAL_INTERFACE_RECORD_KEYS = [
  CHANGELOG_STORAGE_KEY,
  OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY,
  FIRST_USE_GUIDE_STORAGE_KEY,
  ANALYTICS_VISITOR_STORAGE_KEY
] as const;

export function clearsGameData(target: DataClearTarget): boolean {
  return target === 'gameData' || target === 'allExceptApi' || target === 'allData';
}

export function changesSettings(target: DataClearTarget): boolean {
  return settingsTargets.has(target);
}

export function createSettingsAfterDataClear(current: AiSettings, target: DataClearTarget): AiSettings {
  const defaults = createDefaultAiSettings();

  switch (target) {
    case 'apiSettings':
      return {
        ...current,
        apiProfiles: defaults.apiProfiles,
        mainNarrator: defaults.mainNarrator,
        featureRoutes: defaults.featureRoutes
      };
    case 'promptSettings':
      return { ...current, prompts: defaults.prompts };
    case 'tavernSettings':
      return { ...current, tavern: defaults.tavern };
    case 'gameSettings':
      return { ...current, game: defaults.game };
    case 'displaySettings':
      return { ...current, display: defaults.display };
    case 'memorySettings':
      return { ...current, memory: defaults.memory };
    case 'allExceptApi':
      return {
        ...defaults,
        apiProfiles: current.apiProfiles,
        mainNarrator: current.mainNarrator,
        featureRoutes: current.featureRoutes
      };
    case 'allData':
      return defaults;
    default:
      return current;
  }
}

export interface ImageGenerationDataLifecycleDependencies {
  profiles: Pick<IndexedDbImageProfileRepository, 'clearAll'>;
  credentials: Pick<IndexedDbImageCredentialRepository, 'clearAll'>;
  probes: Pick<IndexedDbImageProbeStore, 'clearAll'>;
  promptTemplates: Pick<IndexedDbImagePromptTemplateRepository, 'clearAll'>;
  automationSettings: Pick<IndexedDbImageAutomationSettingsRepository, 'clearAll'>;
  generationPresets: Pick<IndexedDbImageGenerationPresetRepository, 'clearAll'>;
}

function createImageGenerationDataLifecycleDependencies(): ImageGenerationDataLifecycleDependencies {
  return {
    profiles: new IndexedDbImageProfileRepository(),
    credentials: new IndexedDbImageCredentialRepository(),
    probes: new IndexedDbImageProbeStore(),
    promptTemplates: new IndexedDbImagePromptTemplateRepository(),
    automationSettings: new IndexedDbImageAutomationSettingsRepository(),
    generationPresets: new IndexedDbImageGenerationPresetRepository()
  };
}

export async function clearImageGenerationManagedSettings(
  target: DataClearTarget,
  dependencies = createImageGenerationDataLifecycleDependencies()
): Promise<void> {
  const clearApiConfiguration = () => Promise.all([
    dependencies.profiles.clearAll(),
    dependencies.credentials.clearAll(),
    dependencies.probes.clearAll(),
    dependencies.automationSettings.clearAll(),
    dependencies.generationPresets.clearAll()
  ]);

  switch (target) {
    case 'apiSettings':
      await clearApiConfiguration();
      return;
    case 'promptSettings':
      await dependencies.promptTemplates.clearAll();
      return;
    case 'allExceptApi':
      await Promise.all([
        dependencies.probes.clearAll(),
        dependencies.promptTemplates.clearAll(),
        dependencies.automationSettings.clearAll(),
        dependencies.generationPresets.clearAll()
      ]);
      return;
    case 'allData':
      await Promise.all([
        clearApiConfiguration(),
        dependencies.promptTemplates.clearAll()
      ]);
      return;
    default:
      return;
  }
}

function safeRemove(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage cleanup is best effort; database/settings failures remain visible to the caller.
  }
}

export function clearProjectStorageRecords(
  target: DataClearTarget,
  local: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
  session: Storage | undefined = typeof window === 'undefined' ? undefined : window.sessionStorage
): void {
  if (clearsGameData(target)) {
    safeRemove(local, LEGACY_RUNTIME_STORAGE_KEY);
  }

  if (target === 'customOrigins' || target === 'allExceptApi' || target === 'allData') {
    safeRemove(local, CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY);
  }

  if (target === 'localRecords' || target === 'allExceptApi' || target === 'allData') {
    for (const key of LOCAL_INTERFACE_RECORD_KEYS) {
      safeRemove(local, key);
    }
    safeRemove(session, ANALYTICS_SESSION_STORAGE_KEY);
  }
}

export function readCustomOriginCount(
  storage: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage
): number {
  try {
    const parsed = JSON.parse(storage?.getItem(CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function countLocalInterfaceRecords(
  local: Storage | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
  session: Storage | undefined = typeof window === 'undefined' ? undefined : window.sessionStorage
): number {
  let count = 0;
  try {
    count += LOCAL_INTERFACE_RECORD_KEYS.filter((key) => local?.getItem(key) !== null).length;
  } catch {
    // Ignore unavailable browser storage.
  }
  try {
    if (session?.getItem(ANALYTICS_SESSION_STORAGE_KEY) !== null) count += 1;
  } catch {
    // Ignore unavailable browser storage.
  }
  return count;
}
