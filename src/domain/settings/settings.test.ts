import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultAiSettings } from './defaultSettings';
import { LocalStorageSettingsRepository } from './LocalStorageSettingsRepository';
import {
  deleteApiProfile,
  setFeatureRoute,
  setMainNarratorRoute,
  upsertApiProfile
} from './settingsOperations';
import { exportApiSettings, importApiSettings } from './apiSettingsTransfer';
import type { ApiProfile, FeatureModelRoute } from './types';

const profileA: ApiProfile = {
  id: 'api_a',
  name: 'A API',
  providerLabel: 'ggchan',
  interfaceType: 'openai-compatible',
  baseUrl: 'https://a.example.com/v1',
  apiKey: 'sk-a',
  models: ['pro', 'flash'],
  defaultMaxTokens: 8192,
  defaultTemperature: 0.7,
  createdAt: '2026-06-23T00:00:00.000Z',
  updatedAt: '2026-06-23T00:00:00.000Z'
};

const profileB: ApiProfile = {
  ...profileA,
  id: 'api_b',
  name: 'B API',
  baseUrl: 'https://b.example.com/v1',
  apiKey: 'sk-b',
  models: ['story']
};

beforeEach(() => {
  localStorage.clear();
});

describe('AI settings', () => {
  it('creates default routes that follow the main narrator for feature tasks', () => {
    const settings = createDefaultAiSettings();

    expect(settings.apiProfiles).toEqual([]);
    expect(settings.mainNarrator).toBeNull();
    expect(settings.featureRoutes.writebackRepair.mode).toBe('follow-main');
    expect(settings.featureRoutes.memorySummary.mode).toBe('follow-main');
    expect(settings.featureRoutes.memoryVector.mode).toBe('disabled');
    expect(settings.featureRoutes.npcSimulation.mode).toBe('follow-main');
    expect((settings.featureRoutes as Record<string, FeatureModelRoute>).auxiliaryGeneration?.mode).toBe('follow-main');
    expect(settings.game.storyRenderLimit).toBe(30);
    expect(settings.game.narrativeLengthLevel).toBe('standard');
    expect(settings.game.narrativePerspective).toBe('second_person');
    expect(settings.game.autoSaveLimit).toBe(20);
    expect(settings.game.autoSaveIntervalTurns).toBe(1);
    expect(settings.game.rollbackSnapshotLimit).toBe(20);
    expect(settings.game.pregnancyMode).toBe('standard');
    expect(settings.display.uiTheme).toBe('dark');
    expect(settings.display.interfaceFontFamily).toBe('readable');
    expect(settings.display.narrationFontFamily).toBe('system');
    expect(settings.display.dialogueFontFamily).toBe('system');
    expect(settings.display.narrationFontSize).toBe(16);
    expect(settings.display.dialogueFontSize).toBe(16);
    expect(settings.prompts.overrides).toEqual({});
    expect(settings.memory.autoCompressionEnabled).toBe(true);
    expect(settings.memory.recentRawTurnLimit).toBe(12);
    expect(settings.memory.shortTermBatchSize).toBe(20);
    expect(settings.memory.midTermBatchSize).toBe(15);
    expect(settings.memory.longTermPromptTokenBudget).toBe(24000);
  });

  it('adds default game settings when loading an older saved settings payload', async () => {
    const repository = new LocalStorageSettingsRepository('cop-v2-test-ai-settings');
    localStorage.setItem(
      'cop-v2-test-ai-settings',
      JSON.stringify({
        version: 1,
        apiProfiles: [],
        mainNarrator: null,
        featureRoutes: {
          writebackRepair: { mode: 'follow-main' }
        }
      })
    );

    const loaded = await repository.load();

    expect(loaded.game.storyRenderLimit).toBe(30);
    expect(loaded.game.narrativeLengthLevel).toBe('standard');
    expect(loaded.game.narrativePerspective).toBe('second_person');
    expect(loaded.game.autoSaveLimit).toBe(20);
    expect(loaded.game.autoSaveIntervalTurns).toBe(1);
    expect(loaded.game.rollbackSnapshotLimit).toBe(20);
    expect(loaded.game.pregnancyMode).toBe('standard');
    expect(loaded.memory.recentRawTurnLimit).toBe(12);
    expect(loaded.memory.shortTermBatchSize).toBe(20);
    expect(loaded.memory.midTermBatchSize).toBe(15);
    expect(loaded.memory.longTermPromptTokenBudget).toBe(24000);
    expect(loaded.featureRoutes.memorySummary.mode).toBe('follow-main');
    expect(loaded.featureRoutes.memoryVector.mode).toBe('disabled');
    expect(loaded.featureRoutes.npcSimulation.mode).toBe('follow-main');
    expect((loaded.featureRoutes as Record<string, FeatureModelRoute>).auxiliaryGeneration?.mode).toBe('follow-main');
    expect(loaded.display.uiTheme).toBe('dark');
    expect(loaded.display.interfaceFontFamily).toBe('readable');
    expect(loaded.display.narrationFontSize).toBe(16);
    expect(loaded.display.dialogueFontSize).toBe(16);
    expect(loaded.prompts.overrides).toEqual({});
  });

  it('upserts profiles and stores the main narrator route', () => {
    let settings = createDefaultAiSettings();

    settings = upsertApiProfile(settings, profileA);
    settings = setMainNarratorRoute(settings, {
      apiProfileId: 'api_a',
      model: 'pro',
      maxTokens: 8192,
      temperature: 0.8
    });

    expect(settings.apiProfiles).toHaveLength(1);
    expect(settings.mainNarrator?.apiProfileId).toBe('api_a');
    expect(settings.mainNarrator?.model).toBe('pro');
  });

  it('uses player-facing wording for invalid main story route settings', () => {
    const settings = createDefaultAiSettings();

    expect(() => setMainNarratorRoute(settings, { apiProfileId: 'missing', model: 'pro' })).toThrow(
      '主剧情 API 配置不存在。'
    );

    const withProfile = upsertApiProfile(settings, profileA);
    expect(() => setMainNarratorRoute(withProfile, { apiProfileId: 'api_a', model: '   ' })).toThrow(
      '主剧情必须选择模型。'
    );
  });

  it('allows feature routes to choose a different profile and model', () => {
    let settings = createDefaultAiSettings();
    settings = upsertApiProfile(settings, profileA);
    settings = upsertApiProfile(settings, profileB);

    settings = setFeatureRoute(settings, 'memorySummary', {
      mode: 'custom',
      apiProfileId: 'api_b',
      model: 'story',
      maxTokens: 4096,
      temperature: 0.3
    });

    expect(settings.featureRoutes.memorySummary).toMatchObject({
      mode: 'custom',
      apiProfileId: 'api_b',
      model: 'story'
    });

    settings = setFeatureRoute(settings, 'memoryVector', {
      mode: 'custom',
      apiProfileId: 'api_a',
      model: 'embedding'
    });

    expect(settings.featureRoutes.memoryVector).toMatchObject({
      mode: 'custom',
      apiProfileId: 'api_a',
      model: 'embedding'
    });

    settings = setFeatureRoute(settings, 'npcSimulation', {
      mode: 'custom',
      apiProfileId: 'api_b',
      model: 'story'
    });

    expect(settings.featureRoutes.npcSimulation).toMatchObject({
      mode: 'custom',
      apiProfileId: 'api_b',
      model: 'story'
    });

    settings = setFeatureRoute(settings, 'auxiliaryGeneration' as never, {
      mode: 'custom',
      apiProfileId: 'api_b',
      model: 'story'
    });

    expect((settings.featureRoutes as Record<string, FeatureModelRoute>).auxiliaryGeneration).toMatchObject({
      mode: 'custom',
      apiProfileId: 'api_b',
      model: 'story'
    });
  });

  it('normalizes unknown narrative perspectives and preserves valid choices', async () => {
    const repository = new LocalStorageSettingsRepository('cop-v2-test-ai-settings');
    const settings = createDefaultAiSettings();

    localStorage.setItem(
      'cop-v2-test-ai-settings',
      JSON.stringify({
        ...settings,
        game: { ...settings.game, narrativePerspective: 'omniscient' }
      })
    );
    expect((await repository.load()).game.narrativePerspective).toBe('second_person');

    await repository.save({
      ...settings,
      game: { ...settings.game, narrativePerspective: 'first_person' }
    });
    expect((await repository.load()).game.narrativePerspective).toBe('first_person');
  });

  it('normalizes unknown themes and preserves the bright theme', async () => {
    const repository = new LocalStorageSettingsRepository('cop-v2-test-ai-settings');
    const settings = createDefaultAiSettings();

    localStorage.setItem(
      'cop-v2-test-ai-settings',
      JSON.stringify({ ...settings, display: { ...settings.display, uiTheme: 'neon' } })
    );
    expect((await repository.load()).display.uiTheme).toBe('dark');

    await repository.save({ ...settings, display: { ...settings.display, uiTheme: 'light' } });
    expect((await repository.load()).display.uiTheme).toBe('light');
  });

  it('allows Ollama profiles without an API key', () => {
    const settings = createDefaultAiSettings();
    const ollamaProfile: ApiProfile = {
      ...profileA,
      id: 'api_ollama',
      name: 'Local Ollama',
      interfaceType: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      apiKey: ''
    };

    expect(upsertApiProfile(settings, ollamaProfile).apiProfiles).toContainEqual(ollamaProfile);
  });

  it('rejects unsupported profiles for main and auxiliary routes', () => {
    const unsupportedProfile: ApiProfile = {
      ...profileA,
      id: 'api_anthropic',
      name: 'Anthropic',
      interfaceType: 'anthropic'
    };
    const settings = upsertApiProfile(createDefaultAiSettings(), unsupportedProfile);

    expect(() =>
      setMainNarratorRoute(settings, { apiProfileId: unsupportedProfile.id, model: 'claude' })
    ).toThrow('当前接口类型暂不支持主剧情调用。');
    expect(() =>
      setFeatureRoute(settings, 'memorySummary', {
        mode: 'custom',
        apiProfileId: unsupportedProfile.id,
        model: 'claude'
      })
    ).toThrow('当前接口类型暂不支持功能调用。');
    expect(() =>
      setFeatureRoute(settings, 'memoryVector', {
        mode: 'custom',
        apiProfileId: unsupportedProfile.id,
        model: 'embedding'
      })
    ).toThrow('当前接口类型暂不支持向量调用。');
  });

  it('clears narrator routes when an existing profile becomes unsupported', () => {
    let settings = upsertApiProfile(createDefaultAiSettings(), profileA);
    settings = setMainNarratorRoute(settings, { apiProfileId: profileA.id, model: 'pro' });
    settings = setFeatureRoute(settings, 'memorySummary', {
      mode: 'custom',
      apiProfileId: profileA.id,
      model: 'flash'
    });
    settings = setFeatureRoute(settings, 'memoryVector', {
      mode: 'custom',
      apiProfileId: profileA.id,
      model: 'embedding'
    });

    settings = upsertApiProfile(settings, { ...profileA, interfaceType: 'anthropic' });

    expect(settings.mainNarrator).toBeNull();
    expect(settings.featureRoutes.memorySummary).toEqual({ mode: 'follow-main' });
    expect(settings.featureRoutes.memoryVector).toEqual({ mode: 'disabled' });
  });

  it('resets routes when their API profile is deleted', () => {
    let settings = createDefaultAiSettings();
    settings = upsertApiProfile(settings, profileA);
    settings = setMainNarratorRoute(settings, { apiProfileId: 'api_a', model: 'pro' });
    settings = setFeatureRoute(settings, 'writebackRepair', {
      mode: 'custom',
      apiProfileId: 'api_a',
      model: 'flash'
    });
    settings = setFeatureRoute(settings, 'memoryVector', {
      mode: 'custom',
      apiProfileId: 'api_a',
      model: 'embedding'
    });
    settings = setFeatureRoute(settings, 'npcSimulation', {
      mode: 'custom',
      apiProfileId: 'api_a',
      model: 'flash'
    });
    settings = setFeatureRoute(settings, 'auxiliaryGeneration' as never, {
      mode: 'custom',
      apiProfileId: 'api_a',
      model: 'flash'
    });

    settings = deleteApiProfile(settings, 'api_a');

    expect(settings.apiProfiles).toEqual([]);
    expect(settings.mainNarrator).toBeNull();
    expect(settings.featureRoutes.writebackRepair.mode).toBe('follow-main');
    expect(settings.featureRoutes.memoryVector.mode).toBe('disabled');
    expect(settings.featureRoutes.npcSimulation.mode).toBe('follow-main');
    expect((settings.featureRoutes as Record<string, FeatureModelRoute>).auxiliaryGeneration?.mode).toBe('follow-main');
  });

  it('persists settings through localStorage', async () => {
    const repository = new LocalStorageSettingsRepository('cop-v2-test-ai-settings');
    let settings = createDefaultAiSettings();
    settings = upsertApiProfile(settings, profileA);
    settings = setMainNarratorRoute(settings, { apiProfileId: 'api_a', model: 'pro' });

    await repository.save(settings);
    const loaded = await repository.load();

    expect(loaded.apiProfiles[0].name).toBe('A API');
    expect(loaded.mainNarrator?.model).toBe('pro');
  });

  it('exports only API settings with secrets for local test transfer', () => {
    let settings = createDefaultAiSettings();
    settings = upsertApiProfile(settings, profileA);
    settings = setMainNarratorRoute(settings, { apiProfileId: 'api_a', model: 'pro' });
    settings = setFeatureRoute(settings, 'memorySummary', {
      mode: 'custom',
      apiProfileId: 'api_a',
      model: 'flash'
    });

    const exported = exportApiSettings(settings, '2026-07-04T10:00:00.000Z');

    expect(exported).toMatchObject({
      app: 'sorry-im-a-cop-v2',
      schemaVersion: 1,
      exportedAt: '2026-07-04T10:00:00.000Z',
      apiProfiles: [
        {
          id: 'api_a',
          apiKey: 'sk-a',
          models: ['pro', 'flash']
        }
      ],
      mainNarrator: {
        apiProfileId: 'api_a',
        model: 'pro'
      },
      featureRoutes: {
        memorySummary: {
          mode: 'custom',
          apiProfileId: 'api_a',
          model: 'flash'
        }
      }
    });
    expect(exported).not.toHaveProperty('game');
    expect(exported).not.toHaveProperty('display');
    expect(exported).not.toHaveProperty('prompts');
    expect(exported).not.toHaveProperty('memory');
  });

  it('imports API settings while preserving non-API settings and resetting broken routes', () => {
    const current = {
      ...createDefaultAiSettings(),
      game: {
        storyRenderLimit: 8,
        narrativeLengthLevel: 'immersive' as const,
        narrativePerspective: 'third_person' as const,
        autoSaveLimit: 5,
        autoSaveIntervalTurns: 2,
        rollbackSnapshotLimit: 12,
        pregnancyMode: 'high' as const
      },
      prompts: {
        overrides: {
          narrator: 'custom prompt'
        }
      },
      memory: {
        autoCompressionEnabled: false,
        recentRawTurnLimit: 18,
        shortTermBatchSize: 24,
        midTermBatchSize: 16,
        longTermPromptTokenBudget: 18000
      }
    };
    const payload = JSON.stringify({
      app: 'sorry-im-a-cop-v2',
      schemaVersion: 1,
      exportedAt: '2026-07-04T10:00:00.000Z',
      apiProfiles: [profileA],
      mainNarrator: {
        apiProfileId: 'api_a',
        model: 'pro'
      },
      featureRoutes: {
        writebackRepair: { mode: 'follow-main' },
        memorySummary: {
          mode: 'custom',
          apiProfileId: 'api_a',
          model: 'flash'
        },
        memoryVector: {
          mode: 'custom',
          apiProfileId: 'missing',
          model: 'embedding'
        },
        npcSimulation: { mode: 'follow-main' },
        auxiliaryGeneration: {
          mode: 'custom',
          apiProfileId: 'api_a',
          model: 'flash'
        }
      }
    });

    const imported = importApiSettings(current, payload);

    expect(imported.apiProfiles).toEqual([profileA]);
    expect(imported.mainNarrator).toEqual({ apiProfileId: 'api_a', model: 'pro' });
    expect(imported.featureRoutes.memorySummary).toEqual({
      mode: 'custom',
      apiProfileId: 'api_a',
      model: 'flash'
    });
    expect(imported.featureRoutes.memoryVector).toEqual({ mode: 'disabled' });
    expect(imported.featureRoutes.backgroundEvolution).toEqual({ mode: 'follow-main' });
    expect((imported.featureRoutes as Record<string, FeatureModelRoute>).auxiliaryGeneration).toEqual({
      mode: 'custom',
      apiProfileId: 'api_a',
      model: 'flash'
    });
    expect(imported.game).toBe(current.game);
    expect(imported.prompts).toBe(current.prompts);
    expect(imported.memory).toBe(current.memory);
  });

  it('imports Ollama profiles without a key and resets unsupported narrator routes', () => {
    const current = createDefaultAiSettings();
    const payload = JSON.stringify({
      app: 'sorry-im-a-cop-v2',
      schemaVersion: 1,
      apiProfiles: [
        {
          ...profileA,
          id: 'api_ollama',
          name: 'Local Ollama',
          interfaceType: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
          apiKey: ''
        }
      ],
      mainNarrator: {
        apiProfileId: 'api_ollama',
        model: 'qwen3'
      },
      featureRoutes: {
        writebackRepair: {
          mode: 'custom',
          apiProfileId: 'api_ollama',
          model: 'qwen3'
        },
        memoryVector: {
          mode: 'custom',
          apiProfileId: 'api_ollama',
          model: 'embedding'
        }
      }
    });

    const imported = importApiSettings(current, payload);

    expect(imported.apiProfiles[0].apiKey).toBe('');
    expect(imported.mainNarrator).toBeNull();
    expect(imported.featureRoutes.writebackRepair).toEqual({ mode: 'follow-main' });
    expect(imported.featureRoutes.memoryVector).toEqual({ mode: 'disabled' });
  });

  it('rejects malformed API settings import payloads with player-facing errors', () => {
    const settings = createDefaultAiSettings();

    expect(() => importApiSettings(settings, '{bad json')).toThrow('API 设置文件不是有效 JSON。');
    expect(() => importApiSettings(settings, JSON.stringify({ schemaVersion: 1 }))).toThrow(
      'API 设置文件缺少 apiProfiles。'
    );
  });
});
