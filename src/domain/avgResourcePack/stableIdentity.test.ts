import { describe, expect, it } from 'vitest';
import { hkLateColonialPowerFigures } from '../cityPower/hkLateColonialPowerFigures';
import { cityPowerCanonicalId } from '../cityPower/cityPowerIdentityLock';
import { hkLateColonialEraSeedFigures } from '../eraSeed/hkLateColonialEraSeedFigures';
import { seedCanonicalId } from '../eraSeed/seedIdentityLock';
import { hkLateColonialScreenCharacterSeeds } from '../screenCharacterSeed/hkLateColonialScreenCharacterSeeds';
import { screenCharacterCanonicalId } from '../screenCharacterSeed/screenCharacterIdentityLock';
import {
  parseStableIdentityKey,
  projectStableIdentityRef,
  toStableIdentityKey
} from './stableIdentity';

describe('StableIdentityRef', () => {
  it('serializes the namespace kind so equal canonical IDs do not collide', () => {
    const era = { worldpackId: 'hk1988', kind: 'era_seed', canonicalId: 'same:id' } as const;
    const power = { worldpackId: 'hk1988', kind: 'city_power', canonicalId: 'same:id' } as const;
    expect(toStableIdentityKey(era)).not.toBe(toStableIdentityKey(power));
    expect(parseStableIdentityKey(toStableIdentityKey(era))).toEqual(era);
  });

  it('projects all three existing hk1988 identity namespaces deterministically', () => {
    const eraId = seedCanonicalId(hkLateColonialEraSeedFigures[0]!);
    const screenId = screenCharacterCanonicalId(hkLateColonialScreenCharacterSeeds[0]!);
    const powerId = cityPowerCanonicalId(hkLateColonialPowerFigures[0]!);
    expect(projectStableIdentityRef({
      worldpackActorData: { hk1988: { eraSeedIdentity: { canonicalSeedId: eraId } } }
    })).toEqual({ worldpackId: 'hk1988', kind: 'era_seed', canonicalId: eraId });
    expect(projectStableIdentityRef({
      worldpackActorData: { hk1988: { screenCharacterIdentity: { canonicalCharacterId: screenId } } }
    })).toEqual({ worldpackId: 'hk1988', kind: 'screen_character', canonicalId: screenId });
    expect(projectStableIdentityRef({
      worldpackActorData: { hk1988: { cityPowerIdentity: { canonicalSeedId: powerId } } }
    })).toEqual({ worldpackId: 'hk1988', kind: 'city_power', canonicalId: powerId });
  });

  it('supports validated canonical runtime IDs but never guesses from display names', () => {
    const eraId = seedCanonicalId(hkLateColonialEraSeedFigures[0]!);
    expect(projectStableIdentityRef({ actorId: `npc_seed_${eraId}` })).toEqual({
      worldpackId: 'hk1988',
      kind: 'era_seed',
      canonicalId: eraId
    });
    expect(projectStableIdentityRef({ actorId: 'opening_support_1' })).toBeUndefined();
    expect(projectStableIdentityRef({ actorId: 'npc_1', worldpackActorData: { name: '钟楚红' } })).toBeUndefined();
  });

  it('does not choose when incompatible legacy namespaces coexist', () => {
    const eraId = seedCanonicalId(hkLateColonialEraSeedFigures[0]!);
    const powerId = cityPowerCanonicalId(hkLateColonialPowerFigures[0]!);
    expect(projectStableIdentityRef({
      worldpackActorData: {
        hk1988: {
          eraSeedIdentity: { canonicalSeedId: eraId },
          cityPowerIdentity: { canonicalSeedId: powerId }
        }
      }
    })).toBeUndefined();
  });
});
