import { describe, expect, it } from 'vitest';
import { createDefaultAiSettings } from '../settings/defaultSettings';
import type { AiSettings } from '../settings/types';
import { createMemoryEmbeddingClientFromSettings } from './createMemoryEmbeddingClientFromSettings';

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createSettings(overrides: Partial<AiSettings> = {}): AiSettings {
  const defaults = createDefaultAiSettings();
  return {
    ...defaults,
    apiProfiles: [],
    mainNarrator: null,
    featureRoutes: defaults.featureRoutes,
    game: defaults.game,
    memory: defaults.memory,
    ...overrides
  };
}

describe('memory embedding client settings', () => {
  it('returns no client when memory vector retrieval is disabled', () => {
    const client = createMemoryEmbeddingClientFromSettings(createSettings());

    expect(client).toBeNull();
  });

  it('creates an OpenAI-compatible embedding client from the memory vector route', async () => {
    const calls: Array<{ url: string; body: unknown; authorization: string | null }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
        authorization: new Headers(init?.headers).get('Authorization')
      });
      return createJsonResponse({
        data: [{ embedding: [0.2, 0.8, 0.4] }]
      });
    };

    const client = createMemoryEmbeddingClientFromSettings(
      createSettings({
        apiProfiles: [
          {
            id: 'api_a',
            name: 'A',
            providerLabel: 'OpenAI compatible',
            interfaceType: 'openai-compatible',
            baseUrl: 'https://example.test/v1/',
            apiKey: 'test-key',
            models: ['embedding-model'],
            defaultMaxTokens: 8192,
            defaultTemperature: 0.2,
            createdAt: '2026-06-25T00:00:00.000Z',
            updatedAt: '2026-06-25T00:00:00.000Z'
          }
        ],
        featureRoutes: {
          writebackRepair: { mode: 'follow-main' },
          memorySummary: { mode: 'follow-main' },
          memoryVector: {
            mode: 'custom',
            apiProfileId: 'api_a',
            model: 'embedding-model'
          },
          npcSimulation: { mode: 'follow-main' },
          backgroundEvolution: { mode: 'follow-main' },
          auxiliaryGeneration: { mode: 'follow-main' }
        }
      }),
      fetchImpl
    );

    expect(client).not.toBeNull();
    await expect(client?.embed('mong kok tea cafe')).resolves.toEqual([0.2, 0.8, 0.4]);
    expect(client?.model).toBe('embedding-model');
    expect(calls[0]).toEqual({
      url: 'https://example.test/v1/embeddings',
      authorization: 'Bearer test-key',
      body: {
        model: 'embedding-model',
        input: 'mong kok tea cafe'
      }
    });
  });
});
