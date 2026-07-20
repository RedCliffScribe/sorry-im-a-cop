import { describe, expect, it } from 'vitest';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { MemoryItem } from '../runtime/types';
import {
  countActiveNpcMemories,
  deriveNpcMemoryCache,
  indexActiveNpcMemories,
  resolveNpcMemoryTier
} from './npcMemoryLayers';

function actorMemory(
  memoryId: string,
  actorId: string,
  minute: number,
  overrides: Partial<MemoryItem> = {}
): MemoryItem {
  return {
    memoryId,
    text: `memory ${memoryId}`,
    kind: 'actor',
    tier: 'short_term',
    relatedActorIds: [actorId],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    gameTime: { year: 1984, month: 12, day: 27, hour: 18, minute },
    importance: 99,
    visibility: 'player_known',
    certainty: 'fact',
    embeddingText: `memory ${memoryId}`,
    ...overrides
  };
}

describe('NPC memory layers', () => {
  it('indexes only active actor memories into one chronological three-layer stream', () => {
    const memories: Record<string, MemoryItem> = {
      short: actorMemory('short', 'npc_test', 30),
      short_older: actorMemory('short_older', 'npc_test', 10),
      mid: actorMemory('mid', 'npc_test', 20, { tier: 'mid_term' }),
      long: actorMemory('long', 'npc_test', 5, { tier: 'long_term' }),
      compressed: actorMemory('compressed', 'npc_test', 1, { compressedIntoMemoryId: 'mid' }),
      hidden: actorMemory('hidden', 'npc_test', 2, { visibility: 'hidden' }),
      private: actorMemory('private', 'npc_test', 3, { visibility: 'private' }),
      turn: { ...actorMemory('turn', 'npc_test', 4), kind: 'turn' }
    };

    const layers = indexActiveNpcMemories(memories).get('npc_test');

    expect(layers?.shortTerm.map((memory) => memory.memoryId)).toEqual(['short_older', 'short']);
    expect(layers?.midTerm.map((memory) => memory.memoryId)).toEqual(['mid']);
    expect(layers?.longTerm.map((memory) => memory.memoryId)).toEqual(['long']);
    expect(countActiveNpcMemories(layers!)).toBe(4);
    expect(resolveNpcMemoryTier(memories.turn)).toBeNull();
  });

  it('derives compatibility caches from the active stream instead of a separate latest-interaction source', () => {
    const state = createInitialRuntimeState();
    const actor = createActorDefaults({
      actorId: 'npc_test',
      name: '测试人物',
      currentIdentity: 'civilian',
      recentInteractionMemory: 'stale cache',
      longTermMemorySummary: 'legacy long fallback'
    });
    const memories = {
      recent_1: actorMemory('recent_1', actor.actorId, 10, { text: '较早互动' }),
      recent_2: actorMemory('recent_2', actor.actorId, 30, { text: '最新互动' }),
      long_1: actorMemory('long_1', actor.actorId, 20, { tier: 'long_term', text: '长期承接摘要' })
    };
    state.memories = memories;
    const layers = indexActiveNpcMemories(memories).get(actor.actorId)!;

    const derived = deriveNpcMemoryCache(actor, layers);

    expect(derived.recentInteractionMemory).toBe('最新互动');
    expect(derived.longTermMemorySummary).toBe('长期承接摘要');
  });
});
