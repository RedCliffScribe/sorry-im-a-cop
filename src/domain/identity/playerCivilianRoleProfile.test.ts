import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, Organization } from '../runtime/types';
import { applyPlayerCivilianRoleProfilePatch } from './playerCivilianRoleProfile';

describe('applyPlayerCivilianRoleProfilePatch', () => {
  it('updates a civilian livelihood without creating an identity transition', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'unemployed'
    });
    const initialHistory = [...state.player.identityHistory];
    state.organizations.org_new_employer = {
      ...Object.values(state.organizations)[0],
      organizationId: 'org_new_employer',
      name: '永昌印务公司',
      type: 'business',
      visibility: 'player_known'
    } as Organization;
    state.actors.actor_manager = {
      ...state.actors.player,
      actorId: 'actor_manager',
      name: '何志强',
      publicIdentity: '印务公司主管',
      presence: 'mentioned',
      visibility: 'player_known'
    } as Actor;

    const result = applyPlayerCivilianRoleProfilePatch(state, {
      reason: '玩家已经正式获聘并开始上班。',
      employmentStatusId: 'employed',
      publicOccupation: '印刷公司制作员',
      employerOrganizationId: 'org_new_employer',
      employerRelationType: 'employee',
      workUnitSummary: '制作组',
      positionSummary: '印刷制作员',
      livelihoodActorIds: ['actor_manager'],
      sectorIds: ['printing', 'media_production'],
      roleTags: ['production', 'shift_work']
    });

    expect(result.applied).toBe(true);
    expect(result.state.player.currentIdentity).toBe('civilian');
    expect(result.state.player.identityHistory).toEqual(initialHistory);
    expect(
      result.state.actors.player.roleProfiles.civilian?.employerOrganizationId
    ).toBe('org_new_employer');
    expect(
      result.state.actors.player.roleProfiles.civilian?.livelihoodActorIds
    ).toEqual(['actor_manager']);
    expect(
      result.state.actors.player.organizationRelations
    ).toContainEqual(
      expect.objectContaining({
        organizationId: 'org_new_employer',
        relationType: 'employee',
        departmentOrUnit: '制作组',
        isPrimary: true
      })
    );
  });

  it('allows a civilian to become unemployed while preserving identity', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'hospital_nurse'
    });
    const previousEmployer =
      state.actors.player.roleProfiles.civilian?.employerOrganizationId;

    const result = applyPlayerCivilianRoleProfilePatch(state, {
      reason: '玩家已经正式离职。',
      employmentStatusId: 'unemployed',
      publicOccupation: '暂时无业',
      employerOrganizationId: null,
      employerRelationType: null,
      employerRelationSummary: null,
      workplacePlaceId: null,
      workUnitSummary: null,
      positionSummary: '暂时无业',
      dutySummary: null,
      decisionScopeSummary: '可以自行安排求职和临时工作。',
      accessSummary: null,
      livelihoodActorIds: []
    });

    expect(result.applied).toBe(true);
    expect(result.state.player.currentIdentity).toBe('civilian');
    expect(
      result.state.actors.player.roleProfiles.civilian?.employerOrganizationId
    ).toBeUndefined();
    expect(
      result.state.actors.player.organizationRelations.some(
        (relation) =>
          relation.organizationId === previousEmployer && relation.isPrimary
      )
    ).toBe(false);
  });

  it('clears stale current-job fields when unemployment omits explicit nulls', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'hospital_nurse'
    });
    const previousProfile = state.actors.player.roleProfiles.civilian!;
    state.actors.actor_colleague = {
      ...state.actors.player,
      actorId: 'actor_colleague',
      name: '陈美仪',
      publicIdentity: '同班护士'
    } as Actor;
    state.actors.player = {
      ...state.actors.player,
      roleProfiles: {
        ...state.actors.player.roleProfiles,
        civilian: {
          ...previousProfile,
          civilianProfileId: 'hospital_nurse',
          occupationGroupId: 'medical',
          employmentStatusId: 'employed',
          publicOccupation: '急症室护士',
          workUnitSummary: '急症室夜班',
          dutySummary: '负责分流与护理。',
          decisionScopeSummary: '可安排一般护理次序。',
          accessSummary: '可接触当值病历。',
          sectorIds: ['healthcare'],
          roleTags: ['nursing'],
          livelihoodActorIds: ['actor_colleague']
        }
      }
    };

    const result = applyPlayerCivilianRoleProfilePatch(state, {
      reason: '玩家已经离职，模型只写了失业状态。',
      employmentStatusId: 'unemployed'
    });

    const profile = result.state.actors.player.roleProfiles.civilian!;
    expect(result.applied).toBe(true);
    expect(profile).toMatchObject({
      employmentStatusId: 'unemployed',
      publicOccupation: '暂时无业',
      positionSummary: '暂时无业',
      sectorIds: [],
      roleTags: [],
      livelihoodActorIds: []
    });
    expect(profile.civilianProfileId).toBeUndefined();
    expect(profile.occupationGroupId).toBeUndefined();
    expect(profile.employerOrganizationId).toBeUndefined();
    expect(profile.workplacePlaceId).toBeUndefined();
    expect(profile.workUnitSummary).toBeUndefined();
    expect(profile.dutySummary).toBeUndefined();
    expect(profile.accessSummary).toBeUndefined();
  });

  it('does not carry omitted old-employer details into a new employer', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'hospital_nurse'
    });
    const previousProfile = state.actors.player.roleProfiles.civilian!;
    state.organizations.org_new_employer = {
      ...Object.values(state.organizations)[0],
      organizationId: 'org_new_employer',
      name: '明报记者部',
      type: 'media',
      visibility: 'player_known'
    } as Organization;
    state.actors.player = {
      ...state.actors.player,
      roleProfiles: {
        ...state.actors.player.roleProfiles,
        civilian: {
          ...previousProfile,
          employmentStatusId: 'employed',
          publicOccupation: '急症室护士',
          workUnitSummary: '急症室夜班',
          dutySummary: '负责护理。',
          accessSummary: '可接触病历。',
          sectorIds: ['healthcare'],
          roleTags: ['nursing']
        }
      }
    };

    const result = applyPlayerCivilianRoleProfilePatch(state, {
      reason: '玩家转到报馆任职。',
      employmentStatusId: 'employed',
      employerOrganizationId: 'org_new_employer',
      publicOccupation: '港闻记者'
    });

    const profile = result.state.actors.player.roleProfiles.civilian!;
    expect(profile.employerOrganizationId).toBe('org_new_employer');
    expect(profile.publicOccupation).toBe('港闻记者');
    expect(profile.positionSummary).toBeUndefined();
    expect(profile.workUnitSummary).toBeUndefined();
    expect(profile.dutySummary).toBeUndefined();
    expect(profile.accessSummary).toBeUndefined();
    expect(profile.sectorIds).toEqual([]);
    expect(profile.roleTags).toEqual([]);
  });

  it('rejects unknown references and non-civilian public identities', () => {
    const civilianState = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'unemployed'
    });
    const unknownEmployer = applyPlayerCivilianRoleProfilePatch(civilianState, {
      reason: '无效雇主测试',
      employerOrganizationId: 'org_missing'
    });
    expect(unknownEmployer.applied).toBe(false);
    expect(unknownEmployer.diagnostic).toContain('Unknown employerOrganizationId');

    const policeState = createInitialRuntimeState({
      currentIdentity: 'police'
    });
    const policeResult = applyPlayerCivilianRoleProfilePatch(policeState, {
      reason: '不应允许',
      publicOccupation: '记者'
    });
    expect(policeResult.applied).toBe(false);
    expect(policeResult.state).toBe(policeState);
  });
});
