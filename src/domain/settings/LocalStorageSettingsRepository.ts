import { createDefaultAiSettings } from './defaultSettings';
import { resolveNarrativePerspective } from './narrativePerspective';
import type { AiSettings } from './types';

export class LocalStorageSettingsRepository {
  constructor(private readonly key = 'sorry-im-a-cop-v2-ai-settings') {}

  async load(): Promise<AiSettings> {
    const raw = localStorage.getItem(this.key);
    if (!raw) return createDefaultAiSettings();

    try {
      const parsed = JSON.parse(raw) as AiSettings;
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
          narrativePerspective: resolveNarrativePerspective(parsed.game?.narrativePerspective)
        },
        display: {
          ...defaults.display,
          ...parsed.display,
          uiTheme: parsed.display?.uiTheme === 'light' ? 'light' : 'dark'
        },
        prompts: {
          ...defaults.prompts,
          ...parsed.prompts,
          overrides: {
            ...defaults.prompts.overrides,
            ...parsed.prompts?.overrides
          }
        },
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
    localStorage.setItem(this.key, JSON.stringify(settings));
  }
}
