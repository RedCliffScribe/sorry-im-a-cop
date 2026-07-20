import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { MemoryItem, RuntimeState } from '../../domain/runtime/types';
import { MemoryArchiveModal } from './MemoryArchiveModal';

function addMemory(state: RuntimeState, memory: Partial<MemoryItem> & Pick<MemoryItem, 'memoryId' | 'text'>) {
  state.memories[memory.memoryId] = {
    memoryId: memory.memoryId,
    text: memory.text,
    kind: memory.kind ?? 'turn',
    tier: memory.tier,
    relatedActorIds: memory.relatedActorIds ?? [],
    relatedCaseIds: memory.relatedCaseIds ?? [],
    relatedPlaceIds: memory.relatedPlaceIds ?? [],
    relatedOrganizationIds: memory.relatedOrganizationIds ?? [],
    relatedTurnId: memory.relatedTurnId,
    gameTime: memory.gameTime ?? state.time,
    importance: memory.importance ?? 50,
    visibility: memory.visibility ?? 'player_known',
    certainty: memory.certainty ?? 'fact',
    embeddingText: memory.embeddingText ?? memory.text,
    compressedIntoMemoryId: memory.compressedIntoMemoryId,
    compressedAtTurnId: memory.compressedAtTurnId,
    periodStart: memory.periodStart,
    periodEnd: memory.periodEnd
  };
}

function createStateWithMemories() {
  const state = createInitialRuntimeState();
  state.memories = {};
  addMemory(state, {
    memoryId: 'memory_flash_1',
    text: '你记得早班交接时电话声一直没停。',
    kind: 'world',
    importance: 40
  });
  addMemory(state, {
    memoryId: 'memory_short_1',
    text: '你刚把小说初稿投给报社，留下了回信地址。',
    tier: 'short_term',
    importance: 70
  });
  addMemory(state, {
    memoryId: 'memory_mid_1',
    text: '红姑相信你能替她挡住麻烦，但仍担心被街坊议论。',
    tier: 'mid_term',
    importance: 80
  });
  addMemory(state, {
    memoryId: 'memory_long_1',
    text: '你一直想在警队和现实生活中找到自己的位置。',
    tier: 'long_term',
    importance: 90
  });
  addMemory(state, {
    memoryId: 'memory_hidden_1',
    text: '隐藏记忆不应显示。',
    tier: 'short_term',
    visibility: 'hidden'
  });
  addMemory(state, {
    memoryId: 'memory_actor_1',
    text: 'NPC个人记忆不属于主角回忆分层。',
    kind: 'actor',
    tier: 'short_term'
  });
  addMemory(state, {
    memoryId: 'memory_compressed_1',
    text: '已经被中期摘要接替的短期来源不应显示。',
    tier: 'short_term',
    compressedIntoMemoryId: 'memory_mid_1'
  });
  return state;
}

describe('MemoryArchiveModal', () => {
  it('renders only real memory layer tabs without a subtitle or raw text tab', () => {
    render(<MemoryArchiveModal state={createStateWithMemories()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '回忆' });
    expect(within(dialog).getByRole('heading', { name: '回忆' })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('MEMORY LOG');
    expect(dialog).not.toHaveTextContent('原文片段');

    expect(within(dialog).getByRole('tab', { name: /短期记忆/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: /中期记忆/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: /长期记忆/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: /零散记忆/ })).not.toBeInTheDocument();
  });

  it('shows only the selected memory layer and filters hidden or unlayered memories', () => {
    render(<MemoryArchiveModal state={createStateWithMemories()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '回忆' });
    expect(dialog).toHaveTextContent('你刚把小说初稿投给报社');
    expect(dialog).not.toHaveTextContent('你记得早班交接时电话声一直没停');
    expect(dialog).not.toHaveTextContent('隐藏记忆不应显示');
    expect(dialog).not.toHaveTextContent('NPC个人记忆不属于主角回忆分层');
    expect(dialog).not.toHaveTextContent('已经被中期摘要接替的短期来源不应显示');

    fireEvent.click(within(dialog).getByRole('tab', { name: /中期记忆/ }));
    expect(dialog).toHaveTextContent('红姑相信你能替她挡住麻烦');
    expect(dialog).not.toHaveTextContent('你一直想在警队和现实生活中找到自己的位置');

    fireEvent.click(within(dialog).getByRole('tab', { name: /长期记忆/ }));
    expect(dialog).toHaveTextContent('你一直想在警队和现实生活中找到自己的位置');
  });

  it('does not repeat a short-term summary while its turn is still shown as recent raw prose', () => {
    const state = createStateWithMemories();
    state.storyLog = [
      {
        turnId: 'turn_recent',
        speaker: 'narrator',
        text: '最近一回合正文仍由原文负责。',
        summaryText: '最近一回合短期摘要不应同时显示。',
        gameTime: state.time
      }
    ];
    addMemory(state, {
      memoryId: 'memory_recent_turn',
      text: '最近一回合短期摘要不应同时显示。',
      kind: 'turn',
      tier: 'short_term',
      relatedTurnId: 'turn_recent'
    });

    render(<MemoryArchiveModal state={state} recentRawTurnLimit={1} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '回忆' });
    expect(dialog).toHaveTextContent('你刚把小说初稿投给报社');
    expect(dialog).not.toHaveTextContent('最近一回合短期摘要不应同时显示');
  });
});
