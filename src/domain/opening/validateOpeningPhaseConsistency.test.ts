import { describe, expect, it } from 'vitest';
import {
  normalizeCivilianOpeningMatterAnchor,
  normalizeGangOpeningMatterAnchor
} from './validateOpeningPhaseConsistency';

describe('opening phase consistency normalization', () => {
  it('adds the only locked civilian relation to one livelihood matter', () => {
    const initialization = {
      currentMatterPatches: [
        {
          id: 'matter_opening_livelihood',
          matterKind: 'livelihood',
          relatedActorIds: ['actor_opening_extra_1']
        }
      ]
    } as never;
    const normalized = normalizeCivilianOpeningMatterAnchor(
      {
        initialActors: [
          {
            actorId: 'actor_opening_civilian_social_relation_1',
            playerRoleRelation: 'civilian_social_relation'
          },
          {
            actorId: 'actor_opening_extra_1'
          }
        ]
      } as never,
      initialization
    );

    expect(normalized.currentMatterPatches?.[0].relatedActorIds).toEqual([
      'actor_opening_extra_1',
      'actor_opening_civilian_social_relation_1'
    ]);
  });

  it('does not guess when more than one civilian relation is available', () => {
    const initialization = {
      currentMatterPatches: [
        {
          id: 'matter_opening_livelihood',
          matterKind: 'livelihood',
          relatedActorIds: []
        }
      ]
    } as never;
    const normalized = normalizeCivilianOpeningMatterAnchor(
      {
        initialActors: [
          {
            actorId: 'actor_relation_1',
            playerRoleRelation: 'civilian_social_relation'
          },
          {
            actorId: 'actor_relation_2',
            playerRoleRelation: 'civilian_work_relation'
          }
        ]
      } as never,
      initialization
    );

    expect(normalized).toBe(initialization);
  });

  it('normalizes one gang matter into the locked organization responsibility', () => {
    const initialization = {
      currentMatterPatches: [
        {
          id: 'matter_opening_triad',
          source: 'opening',
          matterKind: 'personal',
          relatedActorIds: []
        }
      ]
    } as never;
    const normalized = normalizeGangOpeningMatterAnchor(
      {
        initialActors: [
          {
            actorId: 'actor_patron',
            playerRoleRelation: 'triad_patron'
          },
          {
            actorId: 'actor_peer',
            playerRoleRelation: 'triad_peer'
          }
        ]
      } as never,
      initialization
    );

    expect(normalized.currentMatterPatches?.[0]).toEqual(
      expect.objectContaining({
        source: 'triad_responsibility',
        matterKind: 'social',
        status: 'active',
        visibility: 'known',
        relatedActorIds: ['actor_patron', 'actor_peer']
      })
    );
  });

  it('does not guess which of two gang matters is the organization responsibility', () => {
    const initialization = {
      currentMatterPatches: [
        { id: 'matter_a', source: 'opening' },
        { id: 'matter_b', source: 'opening' }
      ]
    } as never;
    const normalized = normalizeGangOpeningMatterAnchor(
      {
        initialActors: [
          {
            actorId: 'actor_patron',
            playerRoleRelation: 'triad_patron'
          },
          {
            actorId: 'actor_peer',
            playerRoleRelation: 'triad_peer'
          }
        ]
      } as never,
      initialization
    );

    expect(normalized).toBe(initialization);
  });
});
