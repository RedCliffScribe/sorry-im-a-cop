import { describe, expect, it } from 'vitest';
import type { GameTime, RelationshipThread } from '../runtime/types';
import { resolveRelationshipThreadIdentity } from './relationshipIdentity';

const time: GameTime = { year: 1988, month: 9, day: 12, hour: 21, minute: 0 };

function thread(overrides: Partial<RelationshipThread> = {}): RelationshipThread {
  return {
    threadId: 'rel_contact',
    kind: 'network',
    title: '刘星这条线',
    summary: '长期联络。',
    relatedActorIds: ['player', 'actor_liu'],
    primaryActorId: 'actor_liu',
    relationshipRole: '线人',
    status: 'active',
    milestones: [],
    visibility: 'player_known',
    importance: 60,
    createdAt: time,
    updatedAt: time,
    ...overrides
  };
}

describe('relationship identity resolver', () => {
  it('reuses an existing stable thread when the model changes only the id', () => {
    const existing = thread();
    const result = resolveRelationshipThreadIdentity(
      { [existing.threadId]: existing },
      {
        threadId: 'rel_liu_new',
        kind: 'network',
        relatedActorIds: ['actor_liu'],
        primaryActorId: 'actor_liu',
        summary: '本回合有新进展。'
      },
      'player_actor'
    );

    expect(result.patch.threadId).toBe('rel_contact');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'relationship_thread_id_reused' })])
    );
  });

  it('treats a partial same-id patch without actor fields as an update', () => {
    const existing = thread();
    const result = resolveRelationshipThreadIdentity(
      { [existing.threadId]: existing },
      { threadId: 'rel_contact', summary: '只更新关系摘要。' },
      'player_actor'
    );

    expect(result.patch).toMatchObject({
      threadId: 'rel_contact',
      primaryActorId: 'actor_liu',
      kind: 'network',
      relatedActorIds: ['player', 'actor_liu']
    });
  });

  it('reassigns a colliding id instead of overwriting another actor relationship', () => {
    const existing = thread();
    const result = resolveRelationshipThreadIdentity(
      { [existing.threadId]: existing },
      {
        threadId: 'rel_contact',
        kind: 'network',
        relatedActorIds: ['player', 'actor_chan'],
        primaryActorId: 'actor_chan',
        title: '陈探员这条线',
        summary: '新的正式联络。',
        relationshipRole: '同僚'
      },
      'player_actor'
    );

    expect(result.patch.threadId).not.toBe('rel_contact');
    expect(result.patch.threadId).toContain('actor_chan');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'relationship_thread_id_collision_reassigned' })])
    );
  });

  it('keeps existing anchors, panel kind, visibility, and actor members on update', () => {
    const existing = thread();
    const result = resolveRelationshipThreadIdentity(
      { [existing.threadId]: existing },
      {
        threadId: 'rel_contact',
        kind: 'fate',
        relatedActorIds: ['actor_chan'],
        primaryActorId: 'actor_chan',
        visibility: 'hidden',
        summary: '不应替换身份锚点。'
      },
      'player_actor'
    );

    expect(result.patch.threadId).not.toBe('rel_contact');
    expect(existing).toMatchObject({
      kind: 'network',
      primaryActorId: 'actor_liu',
      visibility: 'player_known',
      relatedActorIds: ['player', 'actor_liu']
    });
  });

  it('promotes the same anchored relationship from network to fate without creating a duplicate', () => {
    const existing = thread();
    const result = resolveRelationshipThreadIdentity(
      { [existing.threadId]: existing },
      {
        threadId: 'rel_contact',
        kind: 'fate',
        relatedActorIds: ['actor_liu'],
        primaryActorId: 'actor_liu',
        visibility: 'hidden'
      },
      'player_actor'
    );

    expect(result.patch).toMatchObject({
      threadId: 'rel_contact',
      kind: 'fate',
      visibility: 'player_known'
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_thread_promoted_to_fate' }),
        expect.objectContaining({ code: 'relationship_visibility_downgrade_blocked' })
      ])
    );
  });

  it('keeps a fate relationship when a later patch only describes ordinary networking', () => {
    const existing = thread({ kind: 'fate' });
    const result = resolveRelationshipThreadIdentity(
      { [existing.threadId]: existing },
      {
        threadId: 'rel_liu_new',
        kind: 'network',
        relatedActorIds: ['actor_liu'],
        primaryActorId: 'actor_liu'
      },
      'player_actor'
    );

    expect(result.patch).toMatchObject({ threadId: 'rel_contact', kind: 'fate' });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_thread_kind_downgrade_blocked' })
      ])
    );
  });
});
