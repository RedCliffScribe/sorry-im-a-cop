import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { RelationshipThread, RuntimeState } from '../runtime/types';
import { preserveRelationshipContinuity } from './relationshipContinuity';

function addActor(state: RuntimeState, actorId: string) {
  const player = state.actors[state.player.actorId];
  state.actors[actorId] = {
    ...player,
    actorId,
    name: actorId,
    aliases: [],
    visibility: 'player_known'
  };
}

function createThread(threadId: string, actorId: string, minute: number): RelationshipThread {
  return {
    threadId,
    kind: 'network',
    title: `${actorId}的人脉`,
    summary: '此前已经建立的持续往来。',
    relatedActorIds: [actorId],
    primaryActorId: actorId,
    relationshipRole: '旧识',
    status: 'dormant',
    milestones: [
      {
        milestoneId: `${threadId}_old`,
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute },
        summary: '旧关系记录。',
        importance: 60,
        relatedActorIds: [actorId],
        visibility: 'player_known'
      }
    ],
    visibility: 'player_known',
    importance: 60,
    createdAt: { year: 1988, month: 9, day: 12, hour: 20, minute },
    updatedAt: { year: 1988, month: 9, day: 12, hour: 20, minute }
  };
}

describe('relationship continuity guard', () => {
  it('restores older threads when a forward-turn candidate only contains the newest contact', () => {
    const previous = createInitialRuntimeState();
    addActor(previous, 'actor_old');
    addActor(previous, 'actor_new');
    previous.relationshipThreads.rel_old = createThread('rel_old', 'actor_old', 0);
    const candidate = structuredClone(previous);
    candidate.relationshipThreads = {
      rel_new: createThread('rel_new', 'actor_new', 30)
    };

    const result = preserveRelationshipContinuity(previous, candidate);

    expect(Object.keys(result.state.relationshipThreads).sort()).toEqual(['rel_new', 'rel_old']);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_thread_history_restored' })
      ])
    );
  });

  it('keeps old members, milestones and player visibility when an existing thread is updated', () => {
    const previous = createInitialRuntimeState();
    addActor(previous, 'actor_old');
    addActor(previous, 'actor_related');
    previous.relationshipThreads.rel_old = createThread('rel_old', 'actor_old', 0);
    const candidate = structuredClone(previous);
    candidate.relationshipThreads.rel_old = {
      ...candidate.relationshipThreads.rel_old,
      kind: 'fate',
      relatedActorIds: ['actor_related'],
      visibility: 'hidden',
      milestones: [
        {
          milestoneId: 'rel_old_new',
          gameTime: { year: 1988, month: 9, day: 13, hour: 9, minute: 0 },
          summary: '新进展。',
          importance: 70,
          relatedActorIds: ['actor_related'],
          visibility: 'player_known'
        }
      ]
    };

    const result = preserveRelationshipContinuity(previous, candidate).state.relationshipThreads.rel_old;

    expect(result.kind).toBe('fate');
    expect(result.visibility).toBe('player_known');
    expect(result.relatedActorIds).toEqual(['actor_old', 'actor_related']);
    expect(result.milestones.map((milestone) => milestone.milestoneId).sort()).toEqual([
      'rel_old_new',
      'rel_old_old'
    ]);
  });

  it('consolidates legacy network and fate duplicates for the same actor and remaps background references', () => {
    const previous = createInitialRuntimeState();
    addActor(previous, 'actor_old');
    previous.relationshipThreads.rel_network = createThread('rel_network', 'actor_old', 0);
    previous.relationshipThreads.rel_fate = {
      ...createThread('rel_fate', 'actor_old', 30),
      kind: 'fate',
      title: 'actor_old 的缘分',
      relationshipRole: '恋人'
    };
    previous.backgroundEvolution.npcTracks.track_old = {
      trackId: 'track_old',
      actorId: 'actor_old',
      status: 'active',
      actionKind: 'relationship',
      objective: '维持关系',
      currentAction: '准备联系玩家',
      currentStatus: '等待合适时机',
      nextReviewAt: { year: 1988, month: 9, day: 13, hour: 9, minute: 0 },
      relatedActorIds: ['actor_old'],
      relatedOrganizationIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedRelationshipThreadIds: ['rel_fate'],
      relatedCityTrackIds: [],
      relatedDeferredEventIds: [],
      visibility: 'player_known'
    };
    const candidate = structuredClone(previous);

    const result = preserveRelationshipContinuity(previous, candidate);

    expect(Object.keys(result.state.relationshipThreads)).toEqual(['rel_network']);
    expect(result.state.relationshipThreads.rel_network).toMatchObject({
      kind: 'fate',
      title: 'actor_old 的缘分',
      relationshipRole: '恋人'
    });
    expect(result.state.relationshipThreads.rel_network.milestones).toHaveLength(2);
    expect(result.state.backgroundEvolution.npcTracks.track_old.relatedRelationshipThreadIds).toEqual([
      'rel_network'
    ]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_thread_subtype_consolidated' })
      ])
    );
  });

  it('does not resurrect a relationship whose only actor was explicitly removed', () => {
    const previous = createInitialRuntimeState();
    addActor(previous, 'actor_deleted');
    previous.relationshipThreads.rel_deleted = createThread('rel_deleted', 'actor_deleted', 0);
    const candidate = structuredClone(previous);
    delete candidate.actors.actor_deleted;
    candidate.relationshipThreads = {};

    const result = preserveRelationshipContinuity(previous, candidate);

    expect(result.state.relationshipThreads).toEqual({});
    expect(result.diagnostics).toEqual([]);
  });
});
