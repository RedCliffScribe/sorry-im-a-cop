import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEmbeddingClient } from '../memory/MemoryEmbeddingClient';
import type { NarratorClient, NarratorStreamOptions } from '../narrator/NarratorClient';
import { TurnUsageMeter } from './TurnUsageMeter';

class RawNarratorClient implements NarratorClient {
  async complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const rawText = JSON.stringify({ narrativeText: `回应：${prompt}` });
    options?.onRawText?.(rawText);
    return { narrativeText: `回应：${prompt}` };
  }
}

class FakeEmbeddingClient implements MemoryEmbeddingClient {
  readonly model = 'embedding-test';

  async embed(): Promise<number[]> {
    return [0.25, 0.75];
  }
}

describe('TurnUsageMeter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates narrator usage by logical route and preserves raw-text callbacks', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(140)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(260);
    const meter = new TurnUsageMeter();
    const client = meter.wrapNarrator('writebackRepair', new RawNarratorClient());
    const rawTexts: string[] = [];

    await client.complete('第一次修复', { onRawText: (rawText) => rawTexts.push(rawText) });
    await client.complete('第二次修复');

    expect(rawTexts).toHaveLength(1);
    expect(meter.snapshot()).toEqual([
      expect.objectContaining({
        route: 'writebackRepair',
        callCount: 2,
        responseMs: 100
      })
    ]);
    expect(meter.snapshot()[0].inputTokens).toBeGreaterThan(0);
    expect(meter.snapshot()[0].outputTokens).toBeGreaterThan(0);
  });

  it('counts failed calls without swallowing the original error', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(10).mockReturnValueOnce(35);
    const meter = new TurnUsageMeter();
    const client = meter.wrapNarrator('npcSimulation', {
      async complete() {
        throw new Error('npc route unavailable');
      }
    });

    await expect(client.complete('模拟在场 NPC')).rejects.toThrow('npc route unavailable');
    expect(meter.snapshot()).toEqual([
      {
        route: 'npcSimulation',
        callCount: 1,
        inputTokens: expect.any(Number),
        outputTokens: 0,
        responseMs: 25
      }
    ]);
  });

  it('measures memory embedding calls while preserving the configured model', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(20).mockReturnValueOnce(50);
    const meter = new TurnUsageMeter();
    const client = meter.wrapMemoryEmbedding(new FakeEmbeddingClient());

    await expect(client.embed('旧码头线人的回忆')).resolves.toEqual([0.25, 0.75]);
    expect(client.model).toBe('embedding-test');
    expect(meter.snapshot()).toEqual([
      {
        route: 'memoryEmbedding',
        callCount: 1,
        inputTokens: expect.any(Number),
        outputTokens: 0,
        responseMs: 30
      }
    ]);
  });
});
