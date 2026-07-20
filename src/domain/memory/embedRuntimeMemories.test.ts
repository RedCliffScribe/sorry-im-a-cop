import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { MemoryEmbeddingClient } from './MemoryEmbeddingClient';
import { embedRuntimeMemories } from './embedRuntimeMemories';

class RecordingEmbeddingClient implements MemoryEmbeddingClient {
  readonly model = 'recording-embedding';
  readonly texts: string[] = [];

  async embed(text: string): Promise<number[]> {
    this.texts.push(text);
    return [0.25, 0.75];
  }
}

describe('runtime memory embedding', () => {
  it('does not rebuild vectors for source memories that were already compressed', async () => {
    const state = createInitialRuntimeState();
    state.memories = {
      memory_compressed: {
        memoryId: 'memory_compressed',
        text: '已经压缩的旧事实。',
        kind: 'turn',
        tier: 'short_term',
        relatedActorIds: [],
        relatedCaseIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: [],
        gameTime: { ...state.time },
        importance: 40,
        visibility: 'player_known',
        certainty: 'fact',
        compressedIntoMemoryId: 'memory_summary'
      },
      memory_fresh: {
        memoryId: 'memory_fresh',
        text: '尚未嵌入的新事实。',
        kind: 'turn',
        tier: 'short_term',
        relatedActorIds: [],
        relatedCaseIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: [],
        gameTime: { ...state.time },
        importance: 40,
        visibility: 'player_known',
        certainty: 'fact'
      }
    };
    const embedding = new RecordingEmbeddingClient();

    const result = await embedRuntimeMemories(state, embedding, { maxItems: 2 });

    expect(embedding.texts).toContain('尚未嵌入的新事实。');
    expect(embedding.texts).not.toContain('已经压缩的旧事实。');
    expect(result.state.memories.memory_compressed.embeddingVector).toBeUndefined();
    expect(result.state.memories.memory_fresh.embeddingVector).toEqual([0.25, 0.75]);
  });

  it('builds story embedding text transiently from player input, summary, and narrator text', async () => {
    const state = createInitialRuntimeState();
    state.storyLog = [
      {
        turnId: 'turn_0001',
        speaker: 'player',
        text: '把小说初稿交给报社。',
        gameTime: { ...state.time }
      },
      {
        turnId: 'turn_0001',
        speaker: 'narrator',
        text: '编辑收下稿件并登记作者姓名。',
        summaryText: '玩家已经向报社投稿。',
        gameTime: { ...state.time }
      }
    ];
    const embedding = new RecordingEmbeddingClient();

    const result = await embedRuntimeMemories(state, embedding, { maxStoryEntries: 1 });

    expect(embedding.texts).toEqual([
      expect.stringContaining('玩家输入：把小说初稿交给报社。')
    ]);
    expect(embedding.texts[0]).toContain('回合摘要：玩家已经向报社投稿。');
    expect(embedding.texts[0]).toContain('AI正文：编辑收下稿件并登记作者姓名。');
    expect(result.state.storyLog[1].embeddingVector).toEqual([0.25, 0.75]);
    expect(result.state.storyLog[1].embeddingText).toBeUndefined();
  });
});
