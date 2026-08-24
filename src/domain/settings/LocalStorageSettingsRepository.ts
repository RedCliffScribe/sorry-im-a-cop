import { createDefaultAiSettings } from './defaultSettings';
import { resolveNarrativePerspective } from './narrativePerspective';
import { resolvePlayerPortrayalMode } from './playerPortrayal';
import { normalizeTavernPresetSettings } from '../prompts/tavernPreset';
import { resolveAppLocale } from '../localization/appLocale';
import type { AiSettings } from './types';
import { normalizeDramaticContentSettings } from '../drama/settings';
import { normalizePersistentPromptEntries } from '../prompts/persistentPrompt';
import { normalizeAvgPortraitLayout } from './avgPortraitLayout';

export const AI_SETTINGS_STORAGE_KEY = 'sorry-im-a-cop-v2-ai-settings';

export class LocalStorageSettingsRepository {
  constructor(private readonly key = AI_SETTINGS_STORAGE_KEY) {}

  async load(): Promise<AiSettings> {
    const raw = localStorage.getItem(this.key);
    if (!raw) return createDefaultAiSettings();

    try {
      const parsed = JSON.parse(raw) as AiSettings & {
        prompts?: AiSettings['prompts'] & { tavernPreset?: unknown };
        tavern?: unknown;
      };
      if (parsed.version !== 1 || !Array.isArray(parsed.apiProfiles)) {
        return createDefaultAiSettings();
      }

      const defaults = createDefaultAiSettings();
      return {
        ...defaults,
        ...parsed,
        featureRoutes: {
          ...defaults.featureRoutes,
          ...parsed.featureRoutes
        },
        game: {
          ...defaults.game,
          ...parsed.game,
          language: resolveAppLocale(parsed.game?.language),
          narrativePerspective: resolveNarrativePerspective(parsed.game?.narrativePerspective),
          playerPortrayalMode: resolvePlayerPortrayalMode(parsed.game?.playerPortrayalMode),
          dramaticContent: normalizeDramaticContentSettings(parsed.game?.dramaticContent)
        },
        display: {
          ...defaults.display,
          ...parsed.display,
          uiTheme: parsed.display?.uiTheme === 'light' ? 'light' : 'dark',
          storyPresentationMode:
            parsed.display?.storyPresentationMode === 'avg' ||
            parsed.display?.storyPresentationMode === 'text'
              ? parsed.display.storyPresentationMode
              : 'auto',
          avgPlayerPortraitMode:
            parsed.display?.avgPlayerPortraitMode === 'show' ? 'show' : 'hidden',
          avgPortraitLayout: normalizeAvgPortraitLayout(parsed.display?.avgPortraitLayout)
        },
        prompts: {
          ...defaults.prompts,
          ...parsed.prompts,
          overrides: {
            ...defaults.prompts.overrides,
            ...parsed.prompts?.overrides
          },
          persistentPrompts: normalizePersistentPromptEntries(parsed.prompts?.persistentPrompts)
        },
        tavern: normalizeTavernPresetSettings(parsed.tavern ?? parsed.prompts?.tavernPreset),
        memory: {
          ...defaults.memory,
          ...parsed.memory
        }
      };
    } catch {
      return createDefaultAiSettings();
    }
  }

  async save(settings: AiSettings): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify({
      ...settings,
      prompts: {
        overrides: settings.prompts.overrides,
        persistentPrompts: normalizePersistentPromptEntries(settings.prompts.persistentPrompts)
      }
    }));
  }

  async clear(): Promise<void> {
    localStorage.removeItem(this.key);
  }
}
