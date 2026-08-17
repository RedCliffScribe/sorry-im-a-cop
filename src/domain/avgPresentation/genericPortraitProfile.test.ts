import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, CivilianRoleProfile, PoliceRoleProfile } from '../runtime/types';
import { hk1988GenericPortraitProfileAdapter } from '../worldpack/hk1988AvgPortraitProfile';
import { buildGenericPortraitIdentityProfile } from './genericPortraitProfile';
import { getBuiltInGenericPortraitProfileAdapter } from './profileAdapters';
import { areAvgWorldpackIdsCompatible, normalizeAvgWorldpackId } from './worldpackId';

function actorFixture(): Actor {
  return structuredClone(createInitialRuntimeState().actors.player!);
}

function policeProfile(status: PoliceRoleProfile['status']): PoliceRoleProfile {
  return {
    status,
    department: 'CID',
    rank: 'Detective Constable',
    postRole: 'detective',
    supervisorActorIds: [],
    peerActorIds: [],
    authoritySummary: '',
    accessSummary: '',
    dutySummary: '',
    institutionalReputation: '',
    disciplinePressureSummary: ''
  };
}

function civilianProfile(publicOccupation: string, sectorIds: string[]): CivilianRoleProfile {
  return {
    status: 'active',
    publicOccupation,
    sectorIds,
    roleTags: [],
    livelihoodActorIds: [],
    communitySummary: '',
    familyEconomicSummary: '',
    legalStatusSummary: ''
  };
}

describe('generic AVG portrait profile', () => {
  it('uses structured current police role data and actor age without another LLM call', () => {
    const actor = actorFixture();
    actor.actorId = 'npc_detective';
    actor.gender = 'female';
    actor.computedAge = 31;
    actor.currentIdentity = 'police';
    actor.roleProfiles = { police: policeProfile('active') };

    expect(buildGenericPortraitIdentityProfile(actor, hk1988GenericPortraitProfileAdapter))
      .toMatchObject({
        gender: 'female',
        visualAge: 31,
        visualAgeBand: '25_34',
        roleFamily: 'police',
        roleSubtype: 'detective'
      });
  });

  it('does not promote a civilian from a retired or none police profile', () => {
    const actor = actorFixture();
    actor.currentIdentity = 'civilian';
    actor.publicIdentity = '急症室医生';
    actor.appearance = '穿着旧警察风格夹克';
    actor.roleProfiles = {
      police: policeProfile('none'),
      civilian: civilianProfile('急症室医生', ['medical'])
    };

    expect(buildGenericPortraitIdentityProfile(actor, hk1988GenericPortraitProfileAdapter))
      .toMatchObject({ roleFamily: 'medical' });
  });

  it('normalizes the runtime and resource-pack identifiers only at the AVG boundary', () => {
    expect(normalizeAvgWorldpackId('hk_1988')).toBe('hk1988');
    expect(areAvgWorldpackIdsCompatible('hk_1988', 'hk1988')).toBe(true);
    expect(getBuiltInGenericPortraitProfileAdapter('hk_1988')).toBe(
      hk1988GenericPortraitProfileAdapter
    );
    expect(areAvgWorldpackIdsCompatible('hk_1988', 'another_world')).toBe(false);
  });
});
