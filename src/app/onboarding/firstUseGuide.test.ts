import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import type { AiSettings } from '../../domain/settings/types';
import {
  FIRST_USE_GUIDE_STORAGE_KEY,
  FIRST_USE_GUIDE_VERSION,
  describeFeatureRouteStatus,
  hasDismissedFirstUseGuide,
  isMainNarratorReady,
  recordFirstUseGuideDismissal,
  shouldOfferFirstUseGuide
} from './firstUseGuide';

function createReadySettings(): AiSettings {
  return {
    ...createDefaultAiSettings(),
    apiProfiles: [
      {
        id: 'main',
        name: '主剧情线路',
        providerLabel: 'OpenAI compatible',
        interfaceType: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        models: ['story-model'],
        createdAt: '2026-07-19T00:00:00.000Z',
        updatedAt: '2026-07-19T00:00:00.000Z'
      }
    ],
    mainNarrator: {
      apiProfileId: 'main',
      model: 'story-model'
    }
  };
}

describe('first-use guide state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('offers the guide until a usable main narrator route exists or the current guide is dismissed', () => {
    const empty = createDefaultAiSettings();
    expect(isMainNarratorReady(empty)).toBe(false);
    expect(shouldOfferFirstUseGuide(empty)).toBe(true);

    recordFirstUseGuideDismissal();
    expect(hasDismissedFirstUseGuide()).toBe(true);
    expect(shouldOfferFirstUseGuide(empty)).toBe(false);
    expect(JSON.parse(localStorage.getItem(FIRST_USE_GUIDE_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: FIRST_USE_GUIDE_VERSION,
      dismissedAt: expect.any(String)
    });

    expect(isMainNarratorReady(createReadySettings())).toBe(true);
  });

  it('ignores stale or malformed dismissal data', () => {
    localStorage.setItem(FIRST_USE_GUIDE_STORAGE_KEY, JSON.stringify({ version: 'old', dismissedAt: 'yesterday' }));
    expect(hasDismissedFirstUseGuide()).toBe(false);

    localStorage.setItem(FIRST_USE_GUIDE_STORAGE_KEY, '{broken');
    expect(hasDismissedFirstUseGuide()).toBe(false);
  });

  it('describes the real follow-main, disabled and custom feature routes', () => {
    const ready = createReadySettings();
    expect(describeFeatureRouteStatus(ready, 'memorySummary')).toBe('当前：跟随主剧情');
    expect(describeFeatureRouteStatus(ready, 'memoryVector')).toBe('当前：未启用');

    const custom: AiSettings = {
      ...ready,
      featureRoutes: {
        ...ready.featureRoutes,
        auxiliaryGeneration: { mode: 'custom', apiProfileId: 'main', model: 'story-model' }
      }
    };
    expect(describeFeatureRouteStatus(custom, 'auxiliaryGeneration')).toBe(
      '当前：独立 · 主剧情线路 / story-model'
    );
  });
});
