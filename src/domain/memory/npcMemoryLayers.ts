import type { Actor, MemoryItem, RuntimeState } from '../runtime/types';

export type NpcMemoryTier = 'short_term' | 'mid_term' | 'long_term';

export interface NpcMemoryLayers {
  shortTerm: MemoryItem[];
  midTerm: MemoryItem[];
  longTerm: MemoryItem[];
}

export const NPC_MEMORY_ACTIVE_LIMITS: Record<NpcMemoryTier, number> = {
  short_term: 16,
  mid_term: 6,
  long_term: 6
};

export const NPC_MEMORY_COMPRESSION_BATCH_SIZES: Record<NpcMemoryTier, number> = {
  short_term: 8,
  mid_term: 4,
  long_term: 3
};

export const NPC_MEMORY_MAX_COMPRESSION_OPERATIONS_PER_TURN = 12;

export function npcMemoryTimeValue(memory: MemoryItem): number {
  const { year, month, day, hour, minute } = memory.gameTime;
  return (((year * 100 + month) * 100 + day) * 100 + hour) * 100 + minute;
}

export function compareNpcMemoriesChronologically(left: MemoryItem, right: MemoryItem): number {
  return npcMemoryTimeValue(left) - npcMemoryTimeValue(right) || left.memoryId.localeCompare(right.memoryId);
}

export function resolveNpcMemoryTier(memory: MemoryItem): NpcMemoryTier | null {
  if (memory.kind !== 'actor') return null;
  if (memory.tier === 'mid_term' || memory.tier === 'long_term') return memory.tier;
  return 'short_term';
}

export function isActiveNpcMemory(memory: MemoryItem): boolean {
  return memory.kind === 'actor' && !memory.compressedIntoMemoryId;
}

function createEmptyLayers(): NpcMemoryLayers {
  return { shortTerm: [], midTerm: [], longTerm: [] };
}

export function indexActiveNpcMemories(
  memories: Record<string, MemoryItem>,
  options: { includeHidden?: boolean; includePrivate?: boolean } = {}
): Map<string, NpcMemoryLayers> {
  const byActor = new Map<string, NpcMemoryLayers>();

  for (const memory of Object.values(memories)) {
    if (!isActiveNpcMemory(memory)) continue;
    if (!options.includeHidden && memory.visibility === 'hidden') continue;
    if (!options.includePrivate && memory.visibility === 'private') continue;
    const tier = resolveNpcMemoryTier(memory);
    if (!tier) continue;

    for (const actorId of memory.relatedActorIds) {
      const layers = byActor.get(actorId) ?? createEmptyLayers();
      if (tier === 'short_term') layers.shortTerm.push(memory);
      else if (tier === 'mid_term') layers.midTerm.push(memory);
      else layers.longTerm.push(memory);
      byActor.set(actorId, layers);
    }
  }

  for (const layers of byActor.values()) {
    layers.shortTerm.sort(compareNpcMemoriesChronologically);
    layers.midTerm.sort(compareNpcMemoriesChronologically);
    layers.longTerm.sort(compareNpcMemoriesChronologically);
  }

  return byActor;
}

export function selectActiveNpcMemoryLayers(
  memories: Record<string, MemoryItem>,
  actorId: string,
  options: { includeHidden?: boolean; includePrivate?: boolean } = {}
): NpcMemoryLayers {
  return indexActiveNpcMemories(memories, options).get(actorId) ?? createEmptyLayers();
}

export function countActiveNpcMemories(layers: NpcMemoryLayers): number {
  return layers.shortTerm.length + layers.midTerm.length + layers.longTerm.length;
}

export function deriveNpcMemoryCache(actor: Actor, layers: NpcMemoryLayers): Actor {
  const activeCount = countActiveNpcMemories(layers);
  if (activeCount === 0) return actor;

  const latestShort = layers.shortTerm.at(-1);
  const latestLong = layers.longTerm.at(-1);
  const recentInteractionMemory = latestShort?.text ?? '';
  const longTermMemorySummary = latestLong?.text ?? actor.longTermMemorySummary;

  if (
    actor.recentInteractionMemory === recentInteractionMemory &&
    actor.longTermMemorySummary === longTermMemorySummary
  ) {
    return actor;
  }

  return {
    ...actor,
    recentInteractionMemory,
    longTermMemorySummary
  };
}

export function synchronizeNpcMemoryCaches(state: RuntimeState): RuntimeState {
  const index = indexActiveNpcMemories(state.memories, { includeHidden: true, includePrivate: true });
  let changed = false;
  const actors = { ...state.actors };

  for (const [actorId, layers] of index) {
    const actor = actors[actorId];
    if (!actor) continue;
    const nextActor = deriveNpcMemoryCache(actor, layers);
    if (nextActor === actor) continue;
    actors[actorId] = nextActor;
    changed = true;
  }

  return changed ? { ...state, actors } : state;
}
