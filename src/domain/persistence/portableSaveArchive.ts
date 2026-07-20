import type { MemoryItem, RuntimeState, StoryEntry } from '../runtime/types';
import type { RuntimeSaveRecord } from './SaveRepository';

function stripMemoryEmbeddingCache(memory: MemoryItem): MemoryItem {
  const {
    embeddingVector: _embeddingVector,
    embeddingModel: _embeddingModel,
    embeddingUpdatedAt: _embeddingUpdatedAt,
    ...portableMemory
  } = memory;
  return portableMemory;
}

function stripStoryEmbeddingCache(entry: StoryEntry): StoryEntry {
  const {
    embeddingVector: _embeddingVector,
    embeddingModel: _embeddingModel,
    embeddingUpdatedAt: _embeddingUpdatedAt,
    ...portableEntry
  } = entry;
  return portableEntry;
}

/**
 * Embedding vectors are derived caches. Portable archives omit them to avoid
 * duplicating hundreds of megabytes across manual and automatic saves.
 */
export function stripRuntimeEmbeddingCache(runtimeState: RuntimeState): RuntimeState {
  const memories = Object.fromEntries(
    Object.entries(runtimeState.memories).map(([memoryId, memory]) => [
      memoryId,
      stripMemoryEmbeddingCache(memory)
    ])
  ) as RuntimeState['memories'];

  return {
    ...runtimeState,
    memories,
    storyLog: runtimeState.storyLog.map(stripStoryEmbeddingCache)
  };
}

export function createPortableSaveRecord(record: RuntimeSaveRecord): RuntimeSaveRecord {
  return {
    ...record,
    runtimeState: stripRuntimeEmbeddingCache(record.runtimeState)
  };
}
