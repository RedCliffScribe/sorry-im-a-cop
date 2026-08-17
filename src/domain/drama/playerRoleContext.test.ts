import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { deriveCanonicalPlayerRoleContext } from './playerRoleContext';

describe('canonical player role context', () => {
  it('projects police identity through the existing law identity', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const projection = deriveCanonicalPlayerRoleContext(state);

    expect(projection.identity).toBe('police');
    expect(projection.organizationName).toBe('皇家香港警察');
    expect(projection.publicRole).toBe(state.lawIdentity.rank);
    expect(projection.positionSummary).toBe(state.lawIdentity.assignmentSummary);
  });

  it('projects triad identity through the existing actor role profile', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member' });
    const projection = deriveCanonicalPlayerRoleContext(state);

    expect(projection.identity).toBe('gang_member');
    expect(projection.organizationId).toBe(state.actors.player.roleProfiles.triad?.organizationId);
    expect(projection.publicRole.length).toBeGreaterThan(0);
  });

  it('projects civilian livelihood without inventing a second employer record', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'hospital_nurse'
    });
    const profile = state.actors.player.roleProfiles.civilian!;
    const projection = deriveCanonicalPlayerRoleContext(state);

    expect(projection.identity).toBe('civilian');
    expect(projection.organizationId).toBe(profile.employerOrganizationId);
    expect(projection.placeId).toBe(profile.workplacePlaceId);
    expect(projection.stableContactActorIds).toEqual(profile.livelihoodActorIds);
  });
});
