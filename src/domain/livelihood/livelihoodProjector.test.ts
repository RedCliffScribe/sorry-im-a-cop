import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, EvolutionOutcomeRecord } from '../runtime/types';
import { projectLivelihoodContext } from './livelihoodProjector';

describe('projectLivelihoodContext', () => {
  it('projects one civilian source of truth into role, relations, matters and outcomes', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'hospital_nurse'
    });
    const profile = state.actors.player.roleProfiles.civilian!;
    const organizationId = profile.employerOrganizationId!;
    state.actors.actor_charge_nurse = {
      ...state.actors.player,
      actorId: 'actor_charge_nurse',
      name: '陈美珍',
      publicIdentity: '急症室护士长',
      presence: 'mentioned',
      visibility: 'player_known',
      organizationIds: [organizationId],
      organizationRelations: [
        {
          organizationId,
          relationType: 'manager',
          roleTitle: '护士长',
          departmentOrUnit: '急症室',
          summary: '负责排班和交接。',
          visibility: 'player_known',
          isPrimary: true
        }
      ]
    } as Actor;
    state.actors.player.roleProfiles.civilian = {
      ...profile,
      workUnitSummary: '急症室',
      livelihoodActorIds: ['actor_charge_nurse']
    };
    state.dynamicEvents.currentMatters.matter_night_shift = {
      id: 'matter_night_shift',
      title: '夜班顶更',
      summary: '护士长询问玩家是否能顶今晚的夜班。',
      status: 'active',
      priority: 70,
      visibility: 'known',
      source: 'workplace_notice',
      matterKind: 'livelihood',
      pressureLevel: 2,
      relatedActorIds: ['actor_charge_nurse'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [organizationId],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.backgroundEvolution.recentOutcomes.push({
      outcomeId: 'outcome_hospital_roster',
      sourceReviewKey: 'review_hospital',
      occurredAt: state.time,
      sourceKind: 'organization',
      sourceId: organizationId,
      title: '急症室调整夜班',
      summary: '急症室重新安排了本周夜班。',
      relatedActorIds: ['actor_charge_nurse'],
      relatedOrganizationIds: [organizationId],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedRelationshipThreadIds: [],
      visibility: 'player_known',
      significance: 'notable'
    } as EvolutionOutcomeRecord);

    const projection = projectLivelihoodContext(state);

    expect(projection.available).toBe(true);
    expect(projection.primaryOrganization?.organizationId).toBe(organizationId);
    expect(projection.workSchedule.scheduleLabel).toBe('周一至周五 · 轮班日更');
    expect(projection.workSchedule.scheduleWindow).toBe('08:00–16:00');
    expect(projection.workRelations[0]).toEqual(
      expect.objectContaining({
        actorId: 'actor_charge_nurse',
        roleTitle: '护士长'
      })
    );
    expect(projection.activeMatters.map((matter) => matter.id)).toContain(
      'matter_night_shift'
    );
    expect(projection.recentOutcomes[0]?.outcomeId).toBe(
      'outcome_hospital_roster'
    );
    expect(projection.actionHints.join(' ')).toContain('陈美珍');
  });

  it('does not expose livelihood for another public identity', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    expect(projectLivelihoodContext(state).available).toBe(false);
  });
});
