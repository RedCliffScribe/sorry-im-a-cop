import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_RUNTIME_STORAGE_KEY } from '../../domain/persistence/LocalStorageRuntimeRepository';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import type { AiSettings } from '../../domain/settings/types';
import { ANALYTICS_SESSION_STORAGE_KEY, ANALYTICS_VISITOR_STORAGE_KEY } from '../analytics/operationalAnalytics';
import { CHANGELOG_STORAGE_KEY } from '../changelog/releaseNotes';
import { OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY } from '../legal/openingLegalDisclaimer';
import { FIRST_USE_GUIDE_STORAGE_KEY } from '../onboarding/firstUseGuide';
import { CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY } from '../opening/customOriginStorage';
import {
  clearImageGenerationManagedSettings,
  clearProjectStorageRecords,
  countLocalInterfaceRecords,
  createSettingsAfterDataClear,
  readCustomOriginCount,
  type ImageGenerationDataLifecycleDependencies
} from './dataManagement';

function createConfiguredSettings(): AiSettings {
  const defaults = createDefaultAiSettings();
  return {
    ...defaults,
    apiProfiles: [
      {
        id: 'api_preserved',
        name: '保留 API',
        providerLabel: 'OpenAI compatible',
        interfaceType: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-preserved',
        models: ['story-model'],
        createdAt: '2026-07-22T00:00:00.000Z',
        updatedAt: '2026-07-22T00:00:00.000Z'
      }
    ],
    mainNarrator: { apiProfileId: 'api_preserved', model: 'story-model' },
    featureRoutes: {
      ...defaults.featureRoutes,
      memorySummary: { mode: 'custom', apiProfileId: 'api_preserved', model: 'story-model' }
    },
    game: { ...defaults.game, storyRenderLimit: 7, narrativePerspective: 'third_person' },
    display: { ...defaults.display, uiTheme: 'light', narrationFontSize: 21 },
    prompts: {
      overrides: { main: '自定义提示词' },
      persistentPrompts: [
        { id: 'persistent-one', content: '不要替玩家作决定。', enabled: true }
      ]
    },
    tavern: {
      ...defaults.tavern,
      enabled: true,
      activePresetId: 'preset_one',
      entries: [
        {
          id: 'preset_one',
          name: '测试预设',
          importedAt: '2026-07-22T00:00:00.000Z',
          sourceHash: 'fnv1a-test',
          selectedCharacterId: 100001,
          preset: {
            prompts: [{ identifier: 'main', role: 'system', content: '测试', systemPrompt: true }],
            promptOrder: [{ characterId: 100001, order: [{ identifier: 'main', enabled: true }] }]
          },
          customization: { version: 1, itemOverrides: {} }
        }
      ],
      customCot: {
        ...defaults.tavern.customCot,
        enabled: true,
        content: '自定义规划',
        templateId: 'custom'
      }
    },
    memory: { ...defaults.memory, recentRawTurnLimit: 99 }
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('data management settings boundaries', () => {
  it('resets every non-API setting while preserving API profiles and all model routes', () => {
    const current = createConfiguredSettings();
    const next = createSettingsAfterDataClear(current, 'allExceptApi');
    const defaults = createDefaultAiSettings();

    expect(next.apiProfiles).toEqual(current.apiProfiles);
    expect(next.mainNarrator).toEqual(current.mainNarrator);
    expect(next.featureRoutes).toEqual(current.featureRoutes);
    expect(next.game).toEqual(defaults.game);
    expect(next.display).toEqual(defaults.display);
    expect(next.prompts).toEqual(defaults.prompts);
    expect(next.tavern).toEqual(defaults.tavern);
    expect(next.memory).toEqual(defaults.memory);
  });

  it('clears API profiles and dependent model routes without changing other settings', () => {
    const current = createConfiguredSettings();
    const next = createSettingsAfterDataClear(current, 'apiSettings');
    const defaults = createDefaultAiSettings();

    expect(next.apiProfiles).toEqual([]);
    expect(next.mainNarrator).toBeNull();
    expect(next.featureRoutes).toEqual(defaults.featureRoutes);
    expect(next.game).toEqual(current.game);
    expect(next.display).toEqual(current.display);
    expect(next.prompts).toEqual(current.prompts);
    expect(next.tavern).toEqual(current.tavern);
  });

  it('returns a complete default configuration for a full reset', () => {
    expect(createSettingsAfterDataClear(createConfiguredSettings(), 'allData')).toEqual(createDefaultAiSettings());
  });

  it('clears prompt overrides and permanent prompts together', () => {
    const current = createConfiguredSettings();
    const next = createSettingsAfterDataClear(current, 'promptSettings');

    expect(next.prompts).toEqual(createDefaultAiSettings().prompts);
    expect(next.tavern).toEqual(current.tavern);
    expect(next.apiProfiles).toEqual(current.apiProfiles);
  });
});

describe('data management browser storage boundaries', () => {
  it('clears only custom origins for the custom-origin target', () => {
    localStorage.setItem(CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY, JSON.stringify([{ name: '旧楼家庭' }]));
    localStorage.setItem(ANALYTICS_VISITOR_STORAGE_KEY, 'visitor_keep');
    localStorage.setItem('unrelated-key', 'keep');

    clearProjectStorageRecords('customOrigins');

    expect(localStorage.getItem(CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(ANALYTICS_VISITOR_STORAGE_KEY)).toBe('visitor_keep');
    expect(localStorage.getItem('unrelated-key')).toBe('keep');
  });

  it('clears all project-owned non-settings records but never unrelated site storage', () => {
    localStorage.setItem(LEGACY_RUNTIME_STORAGE_KEY, 'legacy-save');
    localStorage.setItem(CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY, JSON.stringify([{ name: '旧楼家庭' }]));
    localStorage.setItem(CHANGELOG_STORAGE_KEY, 'changelog');
    localStorage.setItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY, 'legal');
    localStorage.setItem(FIRST_USE_GUIDE_STORAGE_KEY, 'guide');
    localStorage.setItem(ANALYTICS_VISITOR_STORAGE_KEY, 'visitor');
    sessionStorage.setItem(ANALYTICS_SESSION_STORAGE_KEY, 'session');
    localStorage.setItem('unrelated-key', 'keep');

    expect(readCustomOriginCount()).toBe(1);
    expect(countLocalInterfaceRecords()).toBe(5);

    clearProjectStorageRecords('allExceptApi');

    expect(localStorage.getItem(LEGACY_RUNTIME_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CUSTOM_ORIGIN_BACKGROUNDS_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(CHANGELOG_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(OPENING_LEGAL_ACCEPTANCE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(FIRST_USE_GUIDE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(ANALYTICS_VISITOR_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('unrelated-key')).toBe('keep');
  });
});

describe('image generation data lifecycle boundaries', () => {
  function lifecycleSpies(): ImageGenerationDataLifecycleDependencies {
    return {
      profiles: { clearAll: vi.fn().mockResolvedValue(undefined) },
      credentials: { clearAll: vi.fn().mockResolvedValue(undefined) },
      probes: { clearAll: vi.fn().mockResolvedValue(undefined) },
      promptTemplates: { clearAll: vi.fn().mockResolvedValue(undefined) },
      automationSettings: { clearAll: vi.fn().mockResolvedValue(undefined) },
      generationPresets: { clearAll: vi.fn().mockResolvedValue(undefined) }
    };
  }

  it.each([
    ['apiSettings', ['profiles', 'credentials', 'probes', 'automationSettings', 'generationPresets']],
    ['promptSettings', ['promptTemplates']],
    ['allExceptApi', ['probes', 'promptTemplates', 'automationSettings', 'generationPresets']],
    ['allData', ['profiles', 'credentials', 'probes', 'promptTemplates', 'automationSettings', 'generationPresets']],
    ['gameData', []]
  ] as const)('clears exactly the image-generation stores owned by %s', async (target, expected) => {
    const dependencies = lifecycleSpies();
    await clearImageGenerationManagedSettings(target, dependencies);

    for (const [name, repository] of Object.entries(dependencies)) {
      expect(repository.clearAll).toHaveBeenCalledTimes(expected.includes(name as never) ? 1 : 0);
    }
  });
});
