import { describe, expect, it } from 'vitest';
import { DefaultAvgResourceResolver } from '../avgResourcePack';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, CivilianRoleProfile } from '../runtime/types';
import { MemoryAvgGenericPortraitBindingRepository } from './bindingRepository';
import { resolveAvgPortraitForActor } from './portraitResolver';
import {
  fixtureFixed,
  fixtureGeneric,
  fixtureOutfit,
  fixturePack
} from './testFixtures';

const identity = {
  worldpackId: 'hk1988',
  kind: 'screen_character',
  canonicalId: 'fixed_portrait_test'
} as const;

function civilianProfile(): CivilianRoleProfile {
  return {
    status: 'active',
    publicOccupation: '普通市民',
    sectorIds: ['civilian'],
    roleTags: [],
    livelihoodActorIds: [],
    communitySummary: '',
    familyEconomicSummary: '',
    legalStatusSummary: ''
  };
}

function actorFixture(stable = true): Actor {
  const actor = structuredClone(createInitialRuntimeState().actors.player!);
  actor.actorId = 'npc_test';
  actor.name = '测试人物';
  actor.gender = 'female';
  actor.computedAge = 30;
  actor.currentIdentity = 'civilian';
  actor.roleProfiles = { civilian: civilianProfile() };
  actor.stableIdentityRef = stable ? identity : undefined;
  return actor;
}

function activePack(basePackId = 'fixture_base') {
  return {
    worldpackId: 'hk1988',
    basePackId,
    basePackVersion: '1.0.0'
  };
}

describe('AVG portrait resolver', () => {
  it('resolves fixed exact emotions and conservative fallbacks without generic scoring', async () => {
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        fixed: [fixtureFixed(identity, ['default', 'serious'])],
        generic: [fixtureGeneric({ portraitSetId: 'generic_should_not_win', gender: 'female' })]
      })
    });

    const exact = await resolveAvgPortraitForActor({
      saveId: 'save_a', actor: actorFixture(), emotion: 'serious', resolver,
      activePack: activePack(), bindingRepository: new MemoryAvgGenericPortraitBindingRepository()
    });
    const fallback = await resolveAvgPortraitForActor({
      saveId: 'save_a', actor: actorFixture(), emotion: 'angry', resolver,
      activePack: activePack(), bindingRepository: new MemoryAvgGenericPortraitBindingRepository()
    });

    expect(exact.portrait).toMatchObject({ source: 'fixed', resolvedVariantId: 'serious' });
    expect(fallback.portrait).toMatchObject({ source: 'fixed', resolvedVariantId: 'serious' });
    expect(fallback.portrait?.fallbackChain).toEqual(['angry', 'serious']);
    expect(fallback.diagnostic.reasons).toEqual(['stable-identity-fixed-match']);
  });

  it('returns null for a structurally invalid matched fixed entry instead of changing identity', async () => {
    const invalidFixed = fixtureFixed(identity, ['serious']);
    invalidFixed.outfits.default = fixtureOutfit(['serious'], 'serious');
    const repository = new MemoryAvgGenericPortraitBindingRepository();
    const result = await resolveAvgPortraitForActor({
      saveId: 'save_a',
      actor: actorFixture(),
      emotion: 'neutral',
      resolver: new DefaultAvgResourceResolver({
        basePack: fixturePack({
          fixed: [invalidFixed],
          generic: [fixtureGeneric({ portraitSetId: 'generic_available', gender: 'female' })]
        })
      }),
      activePack: activePack(),
      bindingRepository: repository
    });

    expect(result.portrait).toBeNull();
    expect(result.diagnostic.reasons).toContain('fixed-default-outfit-or-variant-missing');
    expect(await repository.listForSavePack('save_a', 'hk1988', 'fixture_base')).toEqual([]);
  });

  it('falls back to and freezes a generic portrait when stable identity has no fixed art', async () => {
    const repository = new MemoryAvgGenericPortraitBindingRepository();
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        generic: [fixtureGeneric({
          portraitSetId: 'generic_fallback', gender: 'female', ageBand: '25_34', roleFamily: 'civilian'
        })]
      })
    });
    const result = await resolveAvgPortraitForActor({
      saveId: 'save_a', actor: actorFixture(), emotion: 'happy', resolver,
      activePack: activePack(), bindingRepository: repository
    });

    expect(result.portrait).toMatchObject({ source: 'generic_new', portraitSetId: 'generic_fallback' });
    expect(result.diagnostic.reasons).toContain('fixed-registry-miss');
    expect(await repository.get('save_a', 'npc_test', 'hk1988', 'fixture_base'))
      .toMatchObject({ portraitSetId: 'generic_fallback' });
  });

  it('keeps independent frozen bindings for the same actor in different base packs', async () => {
    const repository = new MemoryAvgGenericPortraitBindingRepository();
    const actor = actorFixture(false);
    const resolverA = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        packId: 'pack_a',
        generic: [fixtureGeneric({ portraitSetId: 'portrait_a', gender: 'female', roleFamily: 'civilian' })]
      })
    });
    const resolverB = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        packId: 'pack_b',
        generic: [fixtureGeneric({ portraitSetId: 'portrait_b', gender: 'female', roleFamily: 'civilian' })]
      })
    });

    const resolve = (resolver: DefaultAvgResourceResolver, basePackId: string) =>
      resolveAvgPortraitForActor({
        saveId: 'save_a', actor, emotion: 'neutral', resolver,
        activePack: activePack(basePackId), bindingRepository: repository
      });
    const firstA = await resolve(resolverA, 'pack_a');
    const firstB = await resolve(resolverB, 'pack_b');
    const secondA = await resolve(resolverA, 'pack_a');

    expect(firstA.portrait?.portraitSetId).toBe('portrait_a');
    expect(firstB.portrait?.portraitSetId).toBe('portrait_b');
    expect(secondA.portrait).toMatchObject({ portraitSetId: 'portrait_a', source: 'generic_bound' });
  });
});
