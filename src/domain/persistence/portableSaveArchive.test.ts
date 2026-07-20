import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { MemoryItem, StoryEntry } from '../runtime/types';
import type { RuntimeSaveRecord } from './SaveRepository';
import { createPortableSaveRecord, stripRuntimeEmbeddingCache } from './portableSaveArchive';

function createEmbeddingMemory(): MemoryItem {
  return {
    memoryId: 'memory_test',
    text: 'Player submitted the manuscript.',
    kind: 'player',
    tier: 'short_term',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
    importance: 70,
    visibility: 'player_known',
    certainty: 'fact',
    embeddingText: 'submitted manuscript newspaper',
    embeddingVector: [0.1, 0.2, 0.3],
    embeddingModel: 'test-embedding-model',
    embeddingUpdatedAt: '2026-07-16T00:00:00.000Z'
  } as MemoryItem;
}

function createEmbeddingStoryEntry(): StoryEntry {
  return {
    turnId: 'turn_test',
    speaker: 'narrator',
    text: 'The editor accepted the manuscript.',
    summaryText: 'Manuscript accepted.',
    embeddingText: 'editor accepted manuscript',
    embeddingVector: [0.4, 0.5, 0.6],
    embeddingModel: 'test-embedding-model',
    embeddingUpdatedAt: '2026-07-16T00:00:00.000Z',
    rawNarratorResponse: '{"story":"accepted"}',
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 30 }
  } as StoryEntry;
}

describe('portable save archives', () => {
  it('removes only rebuildable embedding cache fields without mutating the live state', () => {
    const runtimeState = createInitialRuntimeState();
    const memory = createEmbeddingMemory();
    const storyEntry = createEmbeddingStoryEntry();
    runtimeState.memories[memory.memoryId] = memory;
    runtimeState.storyLog.push(storyEntry);

    const portableState = stripRuntimeEmbeddingCache(runtimeState);
    const portableMemory = portableState.memories[memory.memoryId];
    const portableEntry = portableState.storyLog.at(-1);

    expect(portableMemory).not.toHaveProperty('embeddingVector');
    expect(portableMemory).not.toHaveProperty('embeddingModel');
    expect(portableMemory).not.toHaveProperty('embeddingUpdatedAt');
    expect(portableMemory.embeddingText).toBe(memory.embeddingText);
    expect(portableEntry).not.toHaveProperty('embeddingVector');
    expect(portableEntry).not.toHaveProperty('embeddingModel');
    expect(portableEntry).not.toHaveProperty('embeddingUpdatedAt');
    expect(portableEntry?.embeddingText).toBe(storyEntry.embeddingText);
    expect(portableEntry?.rawNarratorResponse).toBe(storyEntry.rawNarratorResponse);

    expect(runtimeState.memories[memory.memoryId].embeddingVector).toEqual([0.1, 0.2, 0.3]);
    expect(runtimeState.storyLog.at(-1)?.embeddingVector).toEqual([0.4, 0.5, 0.6]);
  });

  it('creates a portable record while preserving save metadata', () => {
    const runtimeState = createInitialRuntimeState();
    const memory = createEmbeddingMemory();
    runtimeState.memories[memory.memoryId] = memory;
    const record: RuntimeSaveRecord = {
      saveId: 'save_test',
      saveName: 'Test save',
      saveKind: 'manual',
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      playerName: runtimeState.player.name,
      worldpackId: runtimeState.world.worldpackId,
      gameDateLabel: '1988-09-12 21:15',
      turnCounter: 10,
      runtimeState
    };

    const portableRecord = createPortableSaveRecord(record);

    expect(portableRecord.saveId).toBe(record.saveId);
    expect(portableRecord.runtimeState.memories[memory.memoryId]).not.toHaveProperty(
      'embeddingVector'
    );
  });
});
