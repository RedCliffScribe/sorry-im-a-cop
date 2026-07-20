import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../settings/defaultSettings';
import { createBackgroundEvolutionClientFromSettings } from './createBackgroundEvolutionClientFromSettings';

function configuredSettings() {
  const settings = createDefaultAiSettings();
  settings.apiProfiles = [
    {
      id: 'profile_main',
      name: 'Main',
      providerLabel: 'OpenAI compatible',
      interfaceType: 'openai-compatible',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      models: ['test-model'],
      createdAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z'
    }
  ];
  settings.mainNarrator = { apiProfileId: 'profile_main', model: 'test-model' };
  return settings;
}

describe('createBackgroundEvolutionClientFromSettings', () => {
  it('follows the main narrator by default', () => {
    const client = createBackgroundEvolutionClientFromSettings(configuredSettings(), vi.fn());

    expect(client).not.toBeNull();
  });

  it('returns null when the background route is disabled', () => {
    const settings = configuredSettings();
    settings.featureRoutes.backgroundEvolution = { mode: 'disabled' };

    expect(createBackgroundEvolutionClientFromSettings(settings, vi.fn())).toBeNull();
  });
});
