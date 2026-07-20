import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../settings/defaultSettings';
import type { AiSettings } from '../settings/types';
import { createWritebackRepairClientFromSettings } from './createWritebackRepairClientFromSettings';

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
        id: 'api_repair',
        name: 'Repair API',
        providerLabel: 'OpenAI compatible',
        interfaceType: 'openai-compatible',
        baseUrl: 'https://repair.example.com/v1',
        apiKey: 'sk-repair',
        models: ['repair-model'],
        defaultMaxTokens: 2048,
        defaultTemperature: 0.1,
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

describe('createWritebackRepairClientFromSettings', () => {
  it('falls back to the main narrator when writeback repair route follows main', async () => {
    const fetchCalls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push([input, init]);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"deferredEventPatches":[]}' } }] })
      } as Response;
    });

    const client = createWritebackRepairClientFromSettings(createSettings(), fetchImpl);

    await expect(client?.complete('repair')).resolves.toEqual({ deferredEventPatches: [] });
    const [, requestInit] = fetchCalls[0];
    if (!requestInit) throw new Error('missing request init');
    const body = JSON.parse(String(requestInit.body));
    expect(String(fetchCalls[0][0])).toBe('https://main.example.com/v1/chat/completions');
    expect(body.model).toBe('story-model');
  });

  it('uses the custom writeback repair route when configured', async () => {
    const fetchCalls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push([input, init]);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"deferredEventPatches":[]}' } }] })
      } as Response;
    });
    const baseSettings = createSettings();
    const settings = {
      ...baseSettings,
      featureRoutes: {
        ...baseSettings.featureRoutes,
        writebackRepair: {
          mode: 'custom',
          apiProfileId: 'api_repair',
          model: 'repair-model',
          maxTokens: 1024,
          temperature: 0
        }
      }
    } satisfies AiSettings;

    const client = createWritebackRepairClientFromSettings(settings, fetchImpl);

    await expect(client?.complete('repair')).resolves.toEqual({ deferredEventPatches: [] });
    const [, requestInit] = fetchCalls[0];
    if (!requestInit) throw new Error('missing request init');
    const body = JSON.parse(String(requestInit.body));
    expect(String(fetchCalls[0][0])).toBe('https://repair.example.com/v1/chat/completions');
    expect(body.model).toBe('repair-model');
    expect(body.max_tokens).toBe(1024);
    expect(body.temperature).toBe(0);
  });
});
