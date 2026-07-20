import { describe, expect, it } from 'vitest';
import type { NarratorClient } from '../narrator/NarratorClient';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { MemoryItem, RuntimeState } from '../runtime/types';
import type { MemoryCompressionSettings } from '../settings/types';
import { compressRuntimeMemories } from './compressRuntimeMemories';

class FakeMemorySummaryClient implements NarratorClient {
  prompts: string[] = [];

  constructor(private readonly responses: unknown[]) {}

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return response ?? { summary: null };
  }
}

function createMemory(memoryId: string, overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    memoryId,
    text: memoryId,
    kind: 'turn',
    tier: 'short_term',
    relatedActorIds: ['player'],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    relatedTurnId: memoryId.replace('memory_', 'turn_'),
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 10 },
    importance: 50,
    visibility: 'player_known',
    certainty: 'fact',
    embeddingText: memoryId,
    ...overrides
  };
}

function settings(overrides: Partial<MemoryCompressionSettings> = {}): MemoryCompressionSettings {
  return {
    autoCompressionEnabled: true,
    recentRawTurnLimit: 2,
    shortTermBatchSize: 2,
    midTermBatchSize: 15,
    longTermPromptTokenBudget: 24000,
    ...overrides
  };
}

function stateWithMemories(memories: MemoryItem[]): RuntimeState {
  const state = createInitialRuntimeState();
  return {
    ...state,
    memories: Object.fromEntries(memories.map((memory) => [memory.memoryId, memory]))
  };
}

describe('player memory layer compression', () => {
  it('does not call the summary model before one complete short-term batch is eligible', async () => {
    const state = stateWithMemories([createMemory('memory_1')]);
    const summaryClient = new FakeMemorySummaryClient([]);

    const result = await compressRuntimeMemories(state, summaryClient, settings());

    expect(summaryClient.prompts).toHaveLength(0);
    expect(result.state).toEqual(state);
    expect(result.diagnostics).toEqual([]);
  });

  it('compresses exactly the oldest eligible turn summaries and ignores recent raw turns and non-player memory kinds', async () => {
    const state = stateWithMemories([
      createMemory('memory_1', {
        text: '第一回合已完成投稿。',
        relatedTurnId: 'turn_1',
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: 10 }
      }),
      createMemory('memory_2', {
        text: '第二回合收到报社回信。',
        relatedTurnId: 'turn_2',
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: 20 }
      }),
      createMemory('memory_3', {
        text: '第三回合属于下一批。',
        relatedTurnId: 'turn_3',
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: 30 }
      }),
      createMemory('memory_actor', {
        text: 'NPC自己的记忆不能进入主角分层压缩。',
        kind: 'actor',
        relatedActorIds: ['npc_editor'],
        relatedTurnId: 'turn_2'
      }),
      createMemory('memory_world', {
        text: '世界事实不能进入主角分层压缩。',
        kind: 'world',
        relatedActorIds: [],
        relatedTurnId: 'turn_2'
      }),
      createMemory('memory_4', {
        text: '近期原文第四回合。',
        relatedTurnId: 'turn_4',
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: 40 }
      }),
      createMemory('memory_5', {
        text: '近期原文第五回合。',
        relatedTurnId: 'turn_5',
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: 50 }
      })
    ]);
    state.storyLog = [
      {
        turnId: 'turn_4',
        speaker: 'narrator',
        text: '第四回合正文',
        summaryText: '近期原文第四回合。',
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: 40 }
      },
      {
        turnId: 'turn_5',
        speaker: 'narrator',
        text: '第五回合正文',
        summaryText: '近期原文第五回合。',
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: 50 }
      }
    ];
    const summaryClient = new FakeMemorySummaryClient([
      {
        summaries: [
          { text: '玩家已经投稿并收到报社回信。', importance: 70, certainty: 'fact' },
          { text: '这条多余摘要不得成为第二条中期记忆。', importance: 60, certainty: 'fact' }
        ]
      }
    ]);

    const result = await compressRuntimeMemories(state, summaryClient, settings(), {
      overrides: { 'memory.compression': 'CUSTOM_MEMORY_COMPRESSION_RULES' }
    });
    const midSummaries = Object.values(result.state.memories).filter(
      (memory) => memory.kind === 'turn' && memory.tier === 'mid_term' && !memory.compressedIntoMemoryId
    );

    expect(midSummaries).toHaveLength(1);
    expect(midSummaries[0].text).toBe('玩家已经投稿并收到报社回信。');
    expect(midSummaries[0].periodStart).toEqual({ year: 1988, month: 9, day: 12, hour: 20, minute: 10 });
    expect(midSummaries[0].periodEnd).toEqual({ year: 1988, month: 9, day: 12, hour: 20, minute: 20 });
    expect(result.state.memories.memory_1.compressedIntoMemoryId).toBe(midSummaries[0].memoryId);
    expect(result.state.memories.memory_2.compressedIntoMemoryId).toBe(midSummaries[0].memoryId);
    expect(result.state.memories.memory_3.compressedIntoMemoryId).toBeUndefined();
    expect(result.state.memories.memory_actor.compressedIntoMemoryId).toBeUndefined();
    expect(result.state.memories.memory_world.compressedIntoMemoryId).toBeUndefined();
    expect(result.state.memories.memory_4.compressedIntoMemoryId).toBeUndefined();
    expect(result.state.memories.memory_5.compressedIntoMemoryId).toBeUndefined();
    expect(summaryClient.prompts[0]).toContain('exactly one');
    expect(summaryClient.prompts[0]).toContain('CUSTOM_MEMORY_COMPRESSION_RULES');
    expect(summaryClient.prompts[0]).toContain('第一回合已完成投稿');
    expect(summaryClient.prompts[0]).not.toContain('近期原文第四回合');
  });

  it('compresses exactly fifteen mid-term summaries into one long-term summary', async () => {
    const memories = Array.from({ length: 16 }, (_, index) =>
      createMemory(`memory_mid_${index + 1}`, {
        tier: 'mid_term',
        text: `中期摘要${index + 1}`,
        relatedTurnId: `turn_${(index + 1) * 20}`,
        gameTime: { year: 1988, month: 9, day: 13 + index, hour: 8, minute: 0 }
      })
    );
    const state = stateWithMemories(memories);
    const summaryClient = new FakeMemorySummaryClient([
      { summary: { text: '十五段中期经历被压成一段长期回忆。', importance: 80, certainty: 'fact' } }
    ]);

    const result = await compressRuntimeMemories(
      state,
      summaryClient,
      settings({ shortTermBatchSize: 99, midTermBatchSize: 15 })
    );
    const longSummaries = Object.values(result.state.memories).filter(
      (memory) => memory.kind === 'turn' && memory.tier === 'long_term' && !memory.compressedIntoMemoryId
    );

    expect(longSummaries).toHaveLength(1);
    expect(memories.slice(0, 15).every((memory) => result.state.memories[memory.memoryId].compressedIntoMemoryId === longSummaries[0].memoryId)).toBe(true);
    expect(result.state.memories.memory_mid_16.compressedIntoMemoryId).toBeUndefined();
  });

  it('derives summary references only from valid source IDs and ignores model-invented IDs', async () => {
    const state = stateWithMemories([
      createMemory('memory_1', {
        relatedActorIds: ['player', 'actor_missing'],
        relatedCaseIds: ['case_missing'],
        relatedPlaceIds: [
          'place_mong_kok_police_station',
          'place_missing'
        ],
        relatedOrganizationIds: ['org_hk_police', 'org_missing']
      }),
      createMemory('memory_2', {
        relatedActorIds: ['player'],
        relatedPlaceIds: ['place_mong_kok_police_station'],
        relatedOrganizationIds: ['org_hk_police']
      })
    ]);
    const summaryClient = new FakeMemorySummaryClient([
      {
        summary: {
          text: '两段经历被压成一条结构化摘要。',
          certainty: 'fact',
          relatedActorIds: ['actor_invented'],
          relatedCaseIds: ['case_invented'],
          relatedPlaceIds: ['place_invented'],
          relatedOrganizationIds: ['org_invented']
        }
      }
    ]);

    const result = await compressRuntimeMemories(
      state,
      summaryClient,
      settings({ recentRawTurnLimit: 0 })
    );
    const summary = Object.values(result.state.memories).find(
      (memory) => memory.kind === 'turn' && memory.tier === 'mid_term' && !memory.compressedIntoMemoryId
    );

    expect(summary).toMatchObject({
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: ['place_mong_kok_police_station'],
      relatedOrganizationIds: ['org_hk_police']
    });
    expect(summaryClient.prompts[0]).toContain('关联 Actor / Case / Place / Organization ID 由系统');
  });

  it('records diagnostics and preserves state when the summary model fails', async () => {
    const state = stateWithMemories([createMemory('memory_1'), createMemory('memory_2')]);
    const summaryClient = new FakeMemorySummaryClient([new Error('summary API unavailable')]);

    const result = await compressRuntimeMemories(state, summaryClient, settings({ recentRawTurnLimit: 0 }));

    expect(result.state).toEqual(state);
    expect(result.diagnostics).toEqual([
      {
        path: ['memoryCompression', 'short_term'],
        code: 'memory_compression_failed',
        message: 'summary API unavailable'
      }
    ]);
  });
});
