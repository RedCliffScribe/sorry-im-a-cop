import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { Actor, RuntimeState } from '../../domain/runtime/types';
import { FatePanelModal } from './FatePanelModal';

function addActor(state: RuntimeState, actor: Partial<Actor> & Pick<Actor, 'actorId' | 'name'>) {
  const baseActor: Actor = {
    actorId: actor.actorId,
    name: actor.name,
    englishName: actor.englishName,
    aliases: [],
    gender: 'female',
    currentIdentity: 'civilian',
    roleProfiles: {},
    organizationIds: [],
    organizationRelations: [],
    positionSummary: '熟人',
    presence: 'absent',
    profileSummary: '与玩家有稳定私人联系。',
    appearance: '清秀。',
    clothing: '便服。',
    equipment: [],
    personality: '敏感但真诚。',
    speechStyle: '轻声细语。',
    motivation: '希望生活稳定。',
    longTermGoal: '离开复杂环境。',
    values: '重视安全感。',
    attributes: { body: 45, action: 48, perception: 60, thinking: 56, negotiation: 58, will: 62 },
    activeTraits: [],
    traitProgress: [],
    statusSummary: '正常。',
    relationshipSummary: '与玩家关系亲近。',
    attitudeTowardPlayer: '信任但有顾虑。',
    interactionScore: 65,
    trustTendency: '较高',
    entanglementSummary: '私人关系会牵动玩家日常选择。',
    longTermMemorySummary: '',
    recentInteractionMemory: '',
    keyMemories: [],
    femaleProfile: undefined,
    visibility: 'player_known',
    importance: 70
  };
  state.actors[actor.actorId] = { ...baseActor, ...actor };
}

function createStateWithThreads() {
  const state = createInitialRuntimeState();
  addActor(state, { actorId: 'actor_may', name: '陈美玲', englishName: 'May Chan' });
  state.relationshipThreads.thread_may_fate = {
    threadId: 'thread_may_fate',
    kind: 'fate',
    title: '雨夜旧约',
    summary: '陈美玲和玩家在旧雨夜结下私人牵连，关系会影响玩家下班后的选择。',
    relatedActorIds: ['actor_may'],
    primaryActorId: 'actor_may',
    relationshipRole: '私人牵连',
    status: 'active',
    intimacySummary: '双方有明显亲近感，但仍受身份和环境约束。',
    trustSummary: '她愿意相信玩家，但害怕被卷入麻烦。',
    conflictSummary: '玩家的警察身份让她不安。',
    promiseSummary: '玩家答应有空去深水埗见她。',
    riskSummary: '这段关系可能被街坊和社团注意。',
    currentPull: '她最近想见玩家一面。',
    nextNaturalBeatHint: '可通过电话或茶餐厅留言触发。',
    milestones: [
      {
        milestoneId: 'ms_may_1',
        gameTime: state.time,
        summary: '两人在雨夜互相袒露过各自的难处。',
        importance: 70,
        relatedActorIds: ['actor_may'],
        visibility: 'player_known'
      }
    ],
    visibility: 'player_known',
    importance: 80,
    createdAt: state.time,
    updatedAt: state.time
  };
  state.relationshipThreads.thread_network = {
    ...state.relationshipThreads.thread_may_fate,
    threadId: 'thread_network',
    kind: 'network',
    title: '街坊人脉',
    visibility: 'player_known'
  };
  state.relationshipThreads.thread_hidden = {
    ...state.relationshipThreads.thread_may_fate,
    threadId: 'thread_hidden',
    title: '隐藏缘份',
    visibility: 'hidden'
  };
  return state;
}

describe('FatePanelModal', () => {
  it('renders visible fate threads and filters hidden or network threads', () => {
    render(<FatePanelModal state={createStateWithThreads()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '缘份' });
    expect(dialog).toHaveTextContent('雨夜旧约');
    expect(dialog).toHaveTextContent('陈美玲 / May Chan');
    expect(dialog).toHaveTextContent('私人牵连');
    expect(dialog).toHaveTextContent('她最近想见玩家一面');
    expect(dialog).toHaveTextContent('两人在雨夜互相袒露过各自的难处');
    expect(dialog).not.toHaveTextContent('街坊人脉');
    expect(dialog).not.toHaveTextContent('隐藏缘份');
  });

  it('shows an empty state when no visible fate threads exist', () => {
    render(<FatePanelModal state={createInitialRuntimeState()} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: '缘份' })).toHaveTextContent('暂无已知缘份');
  });

  it('closes from the header button', () => {
    const onClose = vi.fn();
    render(<FatePanelModal state={createStateWithThreads()} onClose={onClose} />);

    fireEvent.click(within(screen.getByRole('dialog', { name: '缘份' })).getByRole('button', { name: '关闭' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation before deleting a fate relationship', async () => {
    const onDeleteThread = vi.fn(async () => undefined);
    render(
      <FatePanelModal
        state={createStateWithThreads()}
        onClose={vi.fn()}
        onDeleteThread={onDeleteThread}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '删除缘份：雨夜旧约' }));
    const confirmation = screen.getByRole('alertdialog', { name: '确认删除缘份' });
    expect(onDeleteThread).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(onDeleteThread).toHaveBeenCalledWith('thread_may_fate'));
  });
});
