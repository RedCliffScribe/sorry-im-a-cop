import type { RuntimeState, StoryDiagnosticIssue, StoryEntry } from '../runtime/types';
import type { MemoryEmbeddingClient } from './MemoryEmbeddingClient';

export interface EmbedRuntimeMemoriesResult {
  state: RuntimeState;
  diagnostics: StoryDiagnosticIssue[];
}

export interface EmbedRuntimeMemoriesOptions {
  maxItems?: number;
  maxStoryEntries?: number;
  signal?: AbortSignal;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Aborted', 'AbortError');
}

function memoryTextForEmbedding(text: string): string {
  return text.trim().slice(0, 2000);
}

function memoryTimeValue(memory: RuntimeState['memories'][string]): number {
  const { year, month, day, hour, minute } = memory.gameTime;
  return (((year * 100 + month) * 100 + day) * 100 + hour) * 100 + minute;
}

function storyTextForEmbedding(entry: StoryEntry, storyLog: StoryEntry[]): string {
  const playerInput = storyLog.find(
    (candidate) => candidate.turnId === entry.turnId && candidate.speaker === 'player' && candidate.text.trim()
  )?.text;
  return [
    playerInput ? `玩家输入：${playerInput}` : '',
    entry.summaryText?.trim() ? `回合摘要：${entry.summaryText}` : '',
    `AI正文：${entry.text}`
  ]
    .filter(Boolean)
    .join('\n')
    .trim()
    .slice(0, 4000);
}

export async function embedRuntimeMemories(
  state: RuntimeState,
  memoryEmbedding: MemoryEmbeddingClient | undefined,
  options: EmbedRuntimeMemoriesOptions = {}
): Promise<EmbedRuntimeMemoriesResult> {
  if (!memoryEmbedding) {
    return { state, diagnostics: [] };
  }

  const maxItems = Math.max(1, Math.floor(options.maxItems ?? 12));
  const maxStoryEntries = Math.max(1, Math.floor(options.maxStoryEntries ?? 12));
  const signal = options.signal;
  const memories = { ...state.memories };
  const storyLog = state.storyLog.map((entry) => ({ ...entry }));
  const diagnostics: StoryDiagnosticIssue[] = [];
  let changed = false;

  const missingVectorMemories = Object.values(memories)
    .filter(
      (memory) => !memory.embeddingVector && !memory.compressedIntoMemoryId && memory.visibility !== 'hidden'
    )
    .sort(
      (left, right) =>
        Number(right.kind === 'actor') - Number(left.kind === 'actor') ||
        memoryTimeValue(right) - memoryTimeValue(left) ||
        left.memoryId.localeCompare(right.memoryId)
    )
    .slice(0, maxItems);

  for (const memory of missingVectorMemories) {
    try {
      throwIfAborted(signal);
      const embeddingVector = await memoryEmbedding.embed(memoryTextForEmbedding(memory.embeddingText || memory.text), {
        signal
      });
      memories[memory.memoryId] = {
        ...memory,
        embeddingVector,
        embeddingModel: memoryEmbedding.model,
        embeddingUpdatedAt: new Date().toISOString()
      };
      changed = true;
    } catch (error) {
      throwIfAborted(signal);
      diagnostics.push({
        path: ['memories', memory.memoryId, 'embeddingVector'],
        code: 'memory_embedding_failed',
        message: error instanceof Error ? error.message : 'Memory embedding failed.'
      });
    }
  }

  const missingVectorStoryEntries = storyLog
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.speaker === 'narrator' && entry.text.trim() && !entry.embeddingVector)
    .slice(0, maxStoryEntries);

  for (const { entry, index } of missingVectorStoryEntries) {
    try {
      throwIfAborted(signal);
      const embeddingText = storyTextForEmbedding(entry, storyLog);
      const embeddingVector = await memoryEmbedding.embed(embeddingText, { signal });
      storyLog[index] = {
        ...entry,
        embeddingVector,
        embeddingModel: memoryEmbedding.model,
        embeddingUpdatedAt: new Date().toISOString()
      };
      changed = true;
    } catch (error) {
      throwIfAborted(signal);
      diagnostics.push({
        path: ['storyLog', index, 'embeddingVector'],
        code: 'story_embedding_failed',
        message: error instanceof Error ? error.message : 'Story embedding failed.'
      });
    }
  }

  return {
    state: changed ? { ...state, memories, storyLog } : state,
    diagnostics
  };
}
