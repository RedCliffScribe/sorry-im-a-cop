import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { openingCoreActorSchema } from './openingBlueprintSchema';
import {
  classifyOpeningCivilianEmploymentStatus,
  resolveOpeningCivilianEmployerContract
} from './openingCivilianEmployerContract';

function createCivilianActor({
  playerRoleRelation,
  organizationIds = [],
  employerOrganizationId,
  employmentStatusId = 'employed'
}: {
  playerRoleRelation?: 'civilian_work_relation' | 'civilian_social_relation';
  organizationIds?: string[];
  employerOrganizationId?: string;
  employmentStatusId?: string;
}) {
  return openingCoreActorSchema.parse({
    actorId: 'opening_actor_extra_1',
    name: '梁锦青',
    gender: 'male',
    computedAge: 34,
    visualAgeAnchor: '三十岁中段。',
    currentIdentity: 'civilian',
    publicIdentity: '贸易公司职员',
    actualIdentitySummary: '一名普通受雇市民。',
    playerRoleRelation,
    roleProfiles: {
      civilian: {
        status: 'active',
        employmentStatusId,
        publicOccupation: '贸易公司职员',
        employerOrganizationId,
        positionSummary: '普通职员',
        dutySummary: '处理日常文书与联络。',
        decisionScopeSummary: '只能处理获授权的日常事务。',
        accessSummary: '接触一般业务记录。',
        sectorIds: ['trade'],
        roleTags: ['clerk'],
        livelihoodActorIds: [],
        communitySummary: '认识附近同行与街坊。',
        familyEconomicSummary: '依靠薪金生活。',
        legalStatusSummary: '普通香港市民。'
      }
    },
    organizationIds,
    positionSummary: '普通职员',
    profileSummary: '与玩家有日常接触的市民。',
    appearance: '短发，戴黑框眼镜。',
    clothing: '浅色衬衫与深色长裤。',
    equipment: [],
    personality: '谨慎而有礼。',
    speechStyle: '说话平实。',
    motivation: '完成眼前事务。',
    longTermGoal: '维持稳定生活。',
    values: '守信与务实。',
    attributes: {
      body: 45,
      action: 48,
      perception: 56,
      thinking: 60,
      negotiation: 52,
      will: 55
    },
    relationshipSummary: '与玩家保持普通联系。',
    attitudeTowardPlayer: '礼貌而审慎。',
    interactionScore: 12,
    trustTendency: '需要相处后判断。',
    entanglementSummary: '目前只有日常往来。',
    longTermMemorySummary: '记得玩家的公开身份。',
    recentInteractionMemory: '刚在现场与玩家交谈。',
    keyMemories: [],
    statusSummary: '状态正常。',
    presence: 'present',
    currentPlaceId: 'place_mong_kok_police_station',
    currentSceneId: 'scene_mong_kok_report_room',
    visibility: 'player_known',
    importance: 45,
    worldpackActorData: {}
  });
}

describe('opening civilian employer contract', () => {
  const state = createInitialRuntimeState({
    currentIdentity: 'civilian',
    civilianProfileId: 'unemployed'
  });
  const knownOrganizationIds = Object.keys(state.organizations).slice(0, 2);

  it('classifies explicit non-employed aliases without treating every unknown value as employed', () => {
    expect(classifyOpeningCivilianEmploymentStatus('家庭照料者')).toBe(
      'homemaker'
    );
    expect(classifyOpeningCivilianEmploymentStatus('student')).toBe('student');
    expect(classifyOpeningCivilianEmploymentStatus('不明职业状态')).toBe(
      'unknown'
    );
  });

  it('allows an ordinary employed NPC to keep an unknown employer when there is no registered candidate', () => {
    const result = resolveOpeningCivilianEmployerContract({
      actor: createCivilianActor({ organizationIds: [] }),
      state
    });

    expect(result.status).toBe('unresolved_allowed');
    expect(
      result.actor.roleProfiles.civilian?.employerOrganizationId
    ).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe(
      'opening_civilian_employer_unresolved_allowed'
    );
  });

  it('fills the only registered candidate locally without an AI repair', () => {
    const result = resolveOpeningCivilianEmployerContract({
      actor: createCivilianActor({
        organizationIds: [knownOrganizationIds[0]]
      }),
      state
    });

    expect(result.status).toBe('locally_inferred');
    expect(
      result.actor.roleProfiles.civilian?.employerOrganizationId
    ).toBe(knownOrganizationIds[0]);
    expect(result.diagnostics[0]?.code).toBe(
      'opening_civilian_employer_inferred'
    );
  });

  it('rejects a work-relation zero-candidate deadlock as an upstream contract issue', () => {
    const result = resolveOpeningCivilianEmployerContract({
      actor: createCivilianActor({
        playerRoleRelation: 'civilian_work_relation',
        organizationIds: []
      }),
      state
    });

    expect(result.status).toBe('upstream_contract_invalid');
    expect(result.allowedEmployerOrganizationIds).toEqual([]);
  });

  it('binds a formal work relation to the player structured custom employer', () => {
    const employerState = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'custom_occupation',
      civilianCustomProfile: {
        publicOccupation: '摄影助理',
        workplacePlaceId: 'place_broadcast_drive',
        workplaceLabel: '广播道',
        employerName: '明光摄影社'
      }
    });
    const result = resolveOpeningCivilianEmployerContract({
      actor: createCivilianActor({
        playerRoleRelation: 'civilian_work_relation',
        organizationIds: ['org_player_custom_employer']
      }),
      state: employerState
    });

    expect(result.status).toBe('locally_inferred');
    expect(
      result.actor.roleProfiles.civilian?.employerOrganizationId
    ).toBe('org_player_custom_employer');
  });

  it('requests a constrained choice only when a work relation has multiple registered candidates', () => {
    const multiEmployerState = structuredClone(state);
    multiEmployerState.actors.player.organizationRelations =
      knownOrganizationIds.map((organizationId) => ({
        organizationId,
        relationType: 'employee',
        summary: '测试中的已核验工作关系。',
        visibility: 'player_known',
        isPrimary: false
      }));
    const result = resolveOpeningCivilianEmployerContract({
      actor: createCivilianActor({
        playerRoleRelation: 'civilian_work_relation',
        organizationIds: knownOrganizationIds
      }),
      state: multiEmployerState
    });

    expect(result.status).toBe('repair_required');
    expect(result.allowedEmployerOrganizationIds).toEqual(
      knownOrganizationIds
    );
  });

  it('removes a fabricated employer and never creates a matching organization', () => {
    const result = resolveOpeningCivilianEmployerContract({
      actor: createCivilianActor({
        organizationIds: [],
        employerOrganizationId: 'org_model_invented'
      }),
      state
    });

    expect(
      result.actor.roleProfiles.civilian?.employerOrganizationId
    ).toBeUndefined();
    expect(state.organizations.org_model_invented).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe(
      'opening_civilian_employer_invalid_removed'
    );
  });

  it('does not require employers for unemployed, student, retired, or homemaker profiles', () => {
    for (const employmentStatusId of [
      'unemployed',
      'student',
      'retired',
      '家庭照料者'
    ]) {
      const result = resolveOpeningCivilianEmployerContract({
        actor: createCivilianActor({
          organizationIds: [],
          employmentStatusId
        }),
        state
      });
      expect(result.status).toBe('not_applicable');
    }
  });
});
