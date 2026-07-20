import { describe, expect, it } from 'vitest';
import type { PromptContext } from '../context/selectContext';
import { selectContext } from '../context/selectContext';
import type { NarratorClient } from '../narrator/NarratorClient';
import { selectNpcSimulationMemoryProjection } from '../npc/npcSimulation';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { MemoryItem } from '../runtime/types';
import { compressNpcMemories } from './compressNpcMemories';
import { indexActiveNpcMemories } from './npcMemoryLayers';

class FakeMemorySummaryClient implements NarratorClient {
  prompts: string[] = [];

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    return {
      summary: {
        text: `结构化人物记忆摘要 ${this.prompts.length}`,
        certainty: 'fact'
      }
    };
  }
}

function actorMemory(memoryId: string, actorId: string, index: number, tier: MemoryItem['tier'] = 'short_term'): MemoryItem {
  return {
    memoryId,
    text: `第 ${index} 次持续互动`,
    kind: 'actor',
    tier,
    relatedActorIds: [actorId],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    relatedTurnId: `turn_${index}`,
    gameTime: { year: 1984 + Math.floor(index / 360), month: 1 + Math.floor((index % 360) / 30), day: 1 + (index % 30), hour: 12, minute: index % 60 },
    importance: index % 2 === 0 ? 100 : 1,
    visibility: 'player_known',
    certainty: 'fact',
    embeddingText: `第 ${index} 次持续互动`,
    embeddingVector: [index, 1],
    embeddingModel: 'test-vector',
    embeddingUpdatedAt: '2026-07-16T00:00:00.000Z'
  };
}

function setupNpcState() {
  const state = createInitialRuntimeState();
  const actorId = 'npc_memory_stress';
  const sceneId = state.location.currentSceneId!;
  state.actors[actorId] = createActorDefaults({
    actorId,
    name: '长期测试人物',
    currentIdentity: 'civilian',
    currentPlaceId: state.location.currentPlaceId,
    currentSceneId: sceneId,
    presence: 'present',
    interactionScore: 80,
    importance: 90,
    visibility: 'player_known'
  });
  state.scenes[sceneId].presentActorIds = [state.player.actorId, actorId];
  return { state, actorId };
}

describe('NPC memory compression', () => {
  it('compresses short-term overflow through the configured LLM and removes cold-source vectors', async () => {
    const { state, actorId } = setupNpcState();
    for (let index = 1; index <= 17; index += 1) {
      const memory = actorMemory(`npc_memory_${index}`, actorId, index);
      state.memories[memory.memoryId] = memory;
    }
    const client = new FakeMemorySummaryClient();

    const result = await compressNpcMemories(state, client, undefined, { maxOperations: 1 });
    const layers = indexActiveNpcMemories(result.state.memories).get(actorId)!;
    const coldSources = Object.values(result.state.memories).filter((memory) => memory.compressedIntoMemoryId);

    expect(result.operationCount).toBe(1);
    expect(layers.shortTerm).toHaveLength(9);
    expect(layers.midTerm).toHaveLength(1);
    expect(layers.longTerm).toHaveLength(0);
    expect(coldSources).toHaveLength(8);
    expect(coldSources.every((memory) => !memory.embeddingVector && !memory.embeddingText)).toBe(true);
    expect(layers.midTerm[0].importance).toBe(50);
    expect(result.state.actors[actorId].recentInteractionMemory).toBe('第 17 次持续互动');
    expect(client.prompts[0]).toContain('MEMORY_SUBJECT=NPC');
    expect(client.prompts[0]).not.toContain('"importance"');
  });

  it('rolls overflowing mid-term summaries into long-term and merges the oldest long-term batch', async () => {
    const { state, actorId } = setupNpcState();
    for (let index = 1; index <= 7; index += 1) {
      const mid = actorMemory(`mid_memory_${index}`, actorId, index, 'mid_term');
      const long = actorMemory(`long_memory_${index}`, actorId, 20 + index, 'long_term');
      state.memories[mid.memoryId] = mid;
      state.memories[long.memoryId] = long;
    }
    const client = new FakeMemorySummaryClient();

    const result = await compressNpcMemories(state, client, undefined, { maxOperations: 2 });
    const layers = indexActiveNpcMemories(result.state.memories).get(actorId)!;

    expect(result.operationCount).toBe(2);
    expect(layers.midTerm).toHaveLength(3);
    expect(layers.longTerm).toHaveLength(6);
    expect(client.prompts[0]).toContain('sourceTier=mid_term');
    expect(client.prompts[1]).toContain('sourceTier=long_term');
  });

  it('compresses eight short memories when their game-time span exceeds seven days', async () => {
    const { state, actorId } = setupNpcState();
    for (let index = 1; index <= 8; index += 1) {
      const memory = actorMemory(`aged_memory_${index}`, actorId, index);
      memory.gameTime = { year: 1984, month: 12, day: index === 8 ? 10 : index, hour: 12, minute: 0 };
      state.memories[memory.memoryId] = memory;
    }

    const result = await compressNpcMemories(state, new FakeMemorySummaryClient());
    const layers = indexActiveNpcMemories(result.state.memories).get(actorId)!;

    expect(result.operationCount).toBe(1);
    expect(layers.shortTerm).toHaveLength(0);
    expect(layers.midTerm).toHaveLength(1);
  });

  it('does not create a new summary for an orphaned legacy actor reference', async () => {
    const state = createInitialRuntimeState();
    const orphanActorId = 'npc_missing_legacy';
    for (let index = 1; index <= 17; index += 1) {
      const memory = actorMemory(`orphan_memory_${index}`, orphanActorId, index);
      state.memories[memory.memoryId] = memory;
    }
    const client = new FakeMemorySummaryClient();

    const result = await compressNpcMemories(state, client, undefined, { maxOperations: 1 });

    expect(result.operationCount).toBe(0);
    expect(client.prompts).toEqual([]);
    expect(Object.values(result.state.memories).some((memory) => memory.tier === 'mid_term')).toBe(false);
  });

  it('keeps a one-NPC stream bounded across 1000 synthetic in-memory iterations', async () => {
    const { state: initialState, actorId } = setupNpcState();
    const client = new FakeMemorySummaryClient();
    let state = initialState;

    for (let turn = 1; turn <= 1000; turn += 1) {
      const memory = actorMemory(`stress_memory_${turn}`, actorId, turn);
      state = {
        ...state,
        turnCounter: turn,
        memories: { ...state.memories, [memory.memoryId]: memory }
      };
      state = (await compressNpcMemories(state, client)).state;
    }

    const layers = indexActiveNpcMemories(state.memories).get(actorId)!;
    const activeIds = new Set(
      [...layers.shortTerm, ...layers.midTerm, ...layers.longTerm].map((memory) => memory.memoryId)
    );
    const coldSources = Object.values(state.memories).filter((memory) => memory.compressedIntoMemoryId);
    const context: PromptContext = selectContext(state, '继续和长期测试人物谈之前的承诺', {
      queryEmbedding: [1, 0]
    });
    const simulationProjection = selectNpcSimulationMemoryProjection(context);

    expect(layers.shortTerm.length).toBeLessThanOrEqual(16);
    expect(layers.midTerm.length).toBeLessThanOrEqual(6);
    expect(layers.longTerm.length).toBeLessThanOrEqual(6);
    expect(activeIds.size).toBeLessThanOrEqual(28);
    expect(coldSources.length).toBeGreaterThan(900);
    expect(coldSources.every((memory) => !memory.embeddingVector && !memory.embeddingText)).toBe(true);
    expect(context.npcMemoryProjection.entries.length).toBeLessThanOrEqual(12);
    expect(context.npcMemoryProjection.entries.every((entry) => activeIds.has(entry.memoryId))).toBe(true);
    expect(simulationProjection.entries.length).toBeLessThanOrEqual(8);
    expect(
      simulationProjection.diagnostics.selectedMemoryIds.every((memoryId) =>
        context.npcMemoryProjection.diagnostics.selectedMemoryIds.includes(memoryId)
      )
    ).toBe(true);
  }, 30000);
});
