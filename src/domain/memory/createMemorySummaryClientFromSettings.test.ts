import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../settings/defaultSettings';
import type { AiSettings } from '../settings/types';
import { createMemorySummaryClientFromSettings } from './createMemorySummaryClientFromSettings';

function createSettings(): AiSettings {
  return {
    ...createDefaultAiSettings(),
    apiProfiles: [
      {
        id: 'api_main',
        name: 'Main API',
        providerLabel: 'OpenAI compatible',
        interfaceType: 'openai-compatible',
        baseUrl: 'https://main.example.com/v1',
        apiKey: 'sk-main',
        models: ['story-model'],
        defaultMaxTokens: 8192,
        defaultTemperature: 0.8,
        createdAt: '2026-06-25T00:00:00.000Z',
        updatedAt: '2026-06-25T00:00:00.000Z'
      },
      {
        id: 'api_summary',
        name: 'Summary API',
        providerLabel: 'OpenAI compatible',
        interfaceType: 'openai-compatible',
        baseUrl: 'https://summary.example.com/v1',
        apiKey: 'sk-summary',
        models: ['summary-model'],
        defaultMaxTokens: 4096,
        defaultTemperature: 0.2,
        createdAt: '2026-06-25T00:00:00.000Z',
        updatedAt: '2026-06-25T00:00:00.000Z'
      }
    ],
    mainNarrator: {
      apiProfileId: 'api_main',
      model: 'story-model'
    }
  };
}

describe('createMemorySummaryClientFromSettings', () => {
  it('falls back to the main narrator when memory summary route follows main', async () => {
    const fetchCalls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push([input, init]);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"summaries":[]}' } }] })
      } as Response;
    });

    const client = createMemorySummaryClientFromSettings(createSettings(), fetchImpl);

    await expect(client?.complete('compress')).resolves.toEqual({ summaries: [] });
    const [, requestInit] = fetchCalls[0];
    if (!requestInit) throw new Error('missing request init');
    const body = JSON.parse(String(requestInit.body));
    expect(String(fetchCalls[0][0])).toBe('https://main.example.com/v1/chat/completions');
    expect(body.model).toBe('story-model');
  });

  it('uses the custom memory summary route when configured', async () => {
    const fetchCalls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push([input, init]);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"summaries":[]}' } }] })
      } as Response;
    });
    const settings = {
      ...createSettings(),
      featureRoutes: {
        ...createSettings().featureRoutes,
        memorySummary: {
          mode: 'custom',
          apiProfileId: 'api_summary',
          model: 'summary-model',
          maxTokens: 2048,
          temperature: 0.1
        }
      }
    } satisfies AiSettings;

    const client = createMemorySummaryClientFromSettings(settings, fetchImpl);

    await expect(client?.complete('compress')).resolves.toEqual({ summaries: [] });
    const [, requestInit] = fetchCalls[0];
    if (!requestInit) throw new Error('missing request init');
    const body = JSON.parse(String(requestInit.body));
    expect(String(fetchCalls[0][0])).toBe('https://summary.example.com/v1/chat/completions');
    expect(body.model).toBe('summary-model');
    expect(body.max_tokens).toBe(2048);
    expect(body.temperature).toBe(0.1);
  });
});
