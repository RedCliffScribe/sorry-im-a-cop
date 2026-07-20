import type { MemoryItem, RuntimeState, TurnId } from '../runtime/types';

export type PlayerMemoryTier = 'short_term' | 'mid_term' | 'long_term';

export interface PlayerMemoryLayers {
  recentRawTurnIds: Set<TurnId>;
  shortTerm: MemoryItem[];
  midTerm: MemoryItem[];
  longTerm: MemoryItem[];
}

function gameTimeValue(memory: MemoryItem): number {
  const { year, month, day, hour, minute } = memory.gameTime;
  return (((year * 100 + month) * 100 + day) * 100 + hour) * 100 + minute;
}

export function resolvePlayerMemoryTier(memory: MemoryItem): PlayerMemoryTier | null {
  if (memory.kind !== 'turn') return null;
  if (memory.tier === 'mid_term' || memory.tier === 'long_term') return memory.tier;
  return 'short_term';
}

export function selectRecentNarratorTurnIds(state: RuntimeState, limit: number): Set<TurnId> {
  const normalizedLimit = Math.max(0, Math.floor(Number.isFinite(limit) ? limit : 0));
  if (normalizedLimit === 0) return new Set<TurnId>();
  const narratorTurnIds = state.storyLog
    .filter((entry) => entry.speaker === 'narrator' && entry.text.trim())
    .map((entry) => entry.turnId);
  return new Set(narratorTurnIds.slice(-normalizedLimit));
}

export function selectPlayerMemoryLayers(state: RuntimeState, recentRawTurnLimit: number): PlayerMemoryLayers {
  const recentRawTurnIds = selectRecentNarratorTurnIds(state, recentRawTurnLimit);
  const active = Object.values(state.memories)
    .filter((memory) => memory.visibility !== 'hidden')
    .filter((memory) => !memory.compressedIntoMemoryId)
    .filter((memory) => resolvePlayerMemoryTier(memory) !== null)
    .sort((left, right) => gameTimeValue(left) - gameTimeValue(right) || left.memoryId.localeCompare(right.memoryId));

  return {
    recentRawTurnIds,
    shortTerm: active.filter(
      (memory) => resolvePlayerMemoryTier(memory) === 'short_term' && (!memory.relatedTurnId || !recentRawTurnIds.has(memory.relatedTurnId))
    ),
    midTerm: active.filter((memory) => resolvePlayerMemoryTier(memory) === 'mid_term'),
    longTerm: active.filter((memory) => resolvePlayerMemoryTier(memory) === 'long_term')
  };
}
