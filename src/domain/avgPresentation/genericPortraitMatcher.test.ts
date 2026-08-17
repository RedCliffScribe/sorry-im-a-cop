import { describe, expect, it } from 'vitest';
import type { AvgGenericPortraitBinding } from './types';
import { rankGenericPortraitCandidates } from './genericPortraitMatcher';
import { fixtureGeneric } from './testFixtures';

function occupied(
  portraitSetId: string,
  actorId = 'actor_other'
): AvgGenericPortraitBinding {
  return {
    saveId: 'save_a',
    actorId,
    worldpackId: 'hk1988',
    basePackId: 'base_a',
    portraitSetId,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z'
  };
}

describe('generic AVG portrait matcher', () => {
  it('hard-filters gender and strongly prefers matching role and age metadata', () => {
    const ranked = rankGenericPortraitCandidates({
      saveId: 'save_a',
      actorId: 'actor_a',
      profile: {
        gender: 'female',
        visualAge: 31,
        roleFamily: 'police',
        roleSubtype: 'detective'
      },
      existingBindings: [],
      candidates: [
        fixtureGeneric({ portraitSetId: 'female_detective', gender: 'female', ageBand: '25_34', roleFamily: 'police', roleSubtype: 'detective' }),
        fixtureGeneric({ portraitSetId: 'female_civilian', gender: 'female', ageBand: '25_34', roleFamily: 'civilian' }),
        fixtureGeneric({ portraitSetId: 'male_detective', gender: 'male', ageBand: '25_34', roleFamily: 'police', roleSubtype: 'detective' })
      ]
    });

    expect(ranked.map((candidate) => candidate.entry.portraitSetId)).not.toContain('male_detective');
    expect(ranked[0]?.entry.portraitSetId).toBe('female_detective');
    expect(ranked[0]?.reasons).toContain('role-family-exact');
  });

  it('excludes occupied unique portraits and penalizes reusable duplicates', () => {
    const unique = fixtureGeneric({ portraitSetId: 'unique', gender: 'female', roleFamily: 'civilian' });
    const limited = fixtureGeneric({ portraitSetId: 'limited', gender: 'female', roleFamily: 'civilian', reusePolicy: 'limited_reuse' });
    const fresh = fixtureGeneric({ portraitSetId: 'fresh', gender: 'female', roleFamily: 'civilian', reusePolicy: 'limited_reuse' });
    const ranked = rankGenericPortraitCandidates({
      saveId: 'save_a',
      actorId: 'actor_a',
      profile: { gender: 'female', roleFamily: 'civilian' },
      existingBindings: [occupied('unique'), occupied('limited')],
      candidates: [unique, limited, fresh]
    });

    expect(ranked.map((candidate) => candidate.entry.portraitSetId)).not.toContain('unique');
    expect(ranked.find((candidate) => candidate.entry.portraitSetId === 'limited')?.score)
      .toBeLessThan(ranked.find((candidate) => candidate.entry.portraitSetId === 'fresh')!.score);
  });

  it('is deterministic for an identical save, actor, and candidate pool', () => {
    const input = {
      saveId: 'save_a',
      actorId: 'actor_a',
      profile: { gender: 'female' as const, roleFamily: 'civilian' },
      existingBindings: [],
      candidates: [
        fixtureGeneric({ portraitSetId: 'candidate_b', gender: 'female' }),
        fixtureGeneric({ portraitSetId: 'candidate_a', gender: 'female' })
      ]
    };

    expect(rankGenericPortraitCandidates(input).map((item) => item.entry.portraitSetId))
      .toEqual(rankGenericPortraitCandidates(input).map((item) => item.entry.portraitSetId));
  });
});
