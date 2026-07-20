import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../settings/defaultSettings';
import type { AiSettings } from '../settings/types';
import { createNarratorClientFromSettings } from './createNarratorClientFromSettings';

function createSettings(): AiSettings {
  return {
    ...createDefaultAiSettings(),
    apiProfiles: [
      {
        id: 'api_main',
        name: 'Main API',
        providerLabel: 'OpenAI compatible',
        interfaceType: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        models: ['story-model'],
        defaultMaxTokens: 8192,
        defaultTemperature: 0.8,
        createdAt: '2026-06-23T00:00:00.000Z',
        updatedAt: '2026-06-23T00:00:00.000Z'
      }
    ],
    mainNarrator: {
      apiProfileId: 'api_main',
      model: 'story-model',
      maxTokens: 4096,
      temperature: 0.6
    }
  };
}

describe('createNarratorClientFromSettings', () => {
  it('requires a configured main narrator route', () => {
  expect(() => createNarratorClientFromSettings(createDefaultAiSettings())).toThrow('请先在设置里配置主剧情 API 和模型');
  });

  it('creates a runnable OpenAI-compatible narrator client from saved settings', async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"narrativeText":"OK"}' } }] })
      } as Response;
    });
    const client = createNarratorClientFromSettings(createSettings(), fetchImpl);

    await expect(client.complete('hello')).resolves.toEqual({ narrativeText: 'OK' });
    const [, requestInit] = fetchImpl.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.model).toBe('story-model');
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.6);
  });

  it('rejects profiles without an adapted narration client', () => {
    const settings = createSettings();
    settings.apiProfiles[0] = {
      ...settings.apiProfiles[0],
      interfaceType: 'anthropic'
    };

    expect(() => createNarratorClientFromSettings(settings)).toThrow(
      '当前主剧情接口类型暂不支持开局调用：anthropic'
    );
  });
});
