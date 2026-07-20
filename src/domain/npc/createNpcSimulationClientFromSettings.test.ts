import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings } from '../settings/defaultSettings';
import type { AiSettings } from '../settings/types';
import { createNpcSimulationClientFromSettings } from './createNpcSimulationClientFromSettings';

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
        createdAt: '2026-07-03T00:00:00.000Z',
        updatedAt: '2026-07-03T00:00:00.000Z'
      },
      {
        id: 'api_npc',
        name: 'NPC API',
        providerLabel: 'OpenAI compatible',
        interfaceType: 'openai-compatible',
        baseUrl: 'https://npc.example.com/v1',
        apiKey: 'sk-npc',
        models: ['npc-model'],
        defaultMaxTokens: 2048,
        defaultTemperature: 0.2,
        createdAt: '2026-07-03T00:00:00.000Z',
        updatedAt: '2026-07-03T00:00:00.000Z'
      }
    ],
    mainNarrator: {
      apiProfileId: 'api_main',
      model: 'story-model'
    }
  };
}

describe('createNpcSimulationClientFromSettings', () => {
  it('returns null when the route follows main so the main prompt handles fallback simulation', () => {
    expect(createNpcSimulationClientFromSettings(createSettings())).toBeNull();
  });

  it('uses the custom NPC simulation route when configured', async () => {
    const fetchCalls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push([input, init]);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"presentReactions":[{"actorId":"npc_a","actorName":"阿玲","hint":"压低声音提醒。"}],"remotePresence":[],"notes":[]}'
              }
            }
          ]
        })
      } as Response;
    });
    const baseSettings = createSettings();
    const settings = {
      ...baseSettings,
      featureRoutes: {
        ...baseSettings.featureRoutes,
        npcSimulation: {
          mode: 'custom',
          apiProfileId: 'api_npc',
          model: 'npc-model',
          maxTokens: 1024,
          temperature: 0.1
        }
      }
    } satisfies AiSettings;

    const client = createNpcSimulationClientFromSettings(settings, fetchImpl);

    await expect(client?.complete('simulate')).resolves.toEqual({
      presentReactions: [{ actorId: 'npc_a', actorName: '阿玲', hint: '压低声音提醒。' }],
      remotePresence: [],
      notes: []
    });
    const [, requestInit] = fetchCalls[0];
    if (!requestInit) throw new Error('missing request init');
    const body = JSON.parse(String(requestInit.body));
    expect(String(fetchCalls[0][0])).toBe('https://npc.example.com/v1/chat/completions');
    expect(body.model).toBe('npc-model');
    expect(body.max_tokens).toBe(1024);
    expect(body.temperature).toBe(0.1);
  });
});
