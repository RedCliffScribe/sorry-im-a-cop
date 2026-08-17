import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  applyOpeningActorEnrichmentRepair,
  normalizeOpeningActorKeyMemories,
  normalizeOpeningActorRecentInteractionMemory,
  readOpeningActorEnrichmentCandidates,
  validateOpeningActorEnrichment
} from './openingActorEnrichmentSchema';
import { createOpeningActorEnrichmentRepairPrompt } from './composeOpeningActorEnrichmentPrompt';
import { lockOpeningCastDraft } from './openingCastDraft';
import { createOpeningLocalSkeleton } from './openingLocalSkeleton';

function fixture() {
  const state = createInitialRuntimeState({
    currentIdentity: 'police',
    policePostingId: 'cid_headquarters'
  });
  const skeleton = createOpeningLocalSkeleton({
    state,
    openingSessionId: 'opening_enrichment'
  });
  const cast = lockOpeningCastDraft(
    {
      openingSessionId: skeleton.openingSessionId,
      openingFacts: {
        situationSummary: '警署交更。',
        centralMatter: '确认当值任务。',
        playerDecisionBoundary: '玩家决定行动顺序。'
      },
      actors: [
        {
          slotId: 'opening_actor_police_relation_1',
          name: '梁志强',
          gender: 'male',
          currentIdentity: 'police',
          publicIdentity: '刑事侦缉处警长',
          actualIdentitySummary: '皇家香港警察刑事侦缉处警长。',
          playerRoleRelation: 'police_supervisor',
          organizationIds: ['org_hk_police'],
          positionSummary: '刑事侦缉处警长',
          profileSummary: '负责交更的老资格警长。',
          personality: '谨慎务实。',
          speechStyle: '简短直接。',
          motivation: '完成交更。',
          presence: 'present',
          currentPlaceId: skeleton.currentPlaceId,
          currentSceneId: skeleton.currentSceneId
        }
      ],
      actionIntents: [
        {
          actionId: 'opening_action_1',
          intent: '询问任务。',
          relatedActorSlotIds: ['opening_actor_police_relation_1'],
          requiredFacts: []
        },
        {
          actionId: 'opening_action_2',
          intent: '查看记录。',
          relatedActorSlotIds: [],
          requiredFacts: []
        }
      ]
    },
    skeleton,
    state
  );
  const profile = {
    actorId: 'model_must_not_control_this',
    computedAge: 42,
    visualAgeAnchor: '四十岁出头。',
    roleProfiles: {
      police: {
        status: 'active',
        agencyId: 'org_hk_police',
        stationOrPost: '湾仔警署',
        department: '刑事侦缉处',
        rank: '警长',
        assignmentSummary: '当值主管',
        postRole: 'duty_sergeant',
        supervisorActorIds: [],
        peerActorIds: [],
        authoritySummary: '负责当值分派。',
        accessSummary: '可查阅交更记录。',
        dutySummary: '分派案件。',
        institutionalReputation: '经验可靠。',
        disciplinePressureSummary: '重视程序。'
      }
    },
    appearance: '短发，神情沉稳。',
    clothing: '便装西裤。',
    equipment: [],
    longTermGoal: '带好队伍。',
    values: '程序与同僚。',
    attributes: {
      body: 55,
      action: 52,
      perception: 68,
      thinking: 63,
      negotiation: 61,
      will: 70
    },
    relationshipSummary: '玩家的当值上司。',
    attitudeTowardPlayer: '观察中。',
    interactionScore: 18,
    trustTendency: '看实际表现。',
    entanglementSummary: '工作分派形成持续联系。',
    longTermMemorySummary: '知道玩家刚到任。',
    recentInteractionMemory: '刚完成交更。',
    keyMemories: [],
    statusSummary: '正在当值。',
    bodyConditionSummary: '略有疲惫。',
    visibility: 'player_known',
    importance: 72,
    worldpackActorData: {}
  };
  return { state, skeleton, cast, profile };
}

function civilianExtraFixture(organizationIds: string[] = []) {
  const { state, skeleton, cast: baseCast } = fixture();
  const cast = lockOpeningCastDraft(
    {
      ...baseCast,
      actors: [
        ...baseCast.actors.map(({ actorId: _actorId, ...actor }) => actor),
        {
          slotId: 'opening_actor_extra_1',
          name: '梁锦青',
          gender: 'male',
          currentIdentity: 'civilian',
          publicIdentity: '贸易公司职员',
          actualIdentitySummary: '一名普通受雇市民。',
          organizationIds,
          positionSummary: '普通职员',
          profileSummary: '在当前场景与玩家接触的普通市民。',
          personality: '谨慎而有礼。',
          speechStyle: '说话平实。',
          motivation: '完成眼前事务。',
          presence: 'present',
          currentPlaceId: skeleton.currentPlaceId,
          currentSceneId: skeleton.currentSceneId
        }
      ]
    },
    skeleton,
    state
  );
  const profile = {
    computedAge: 34,
    visualAgeAnchor: '三十岁中段。',
    roleProfiles: {
      civilian: {
        status: 'active',
        employmentStatusId: 'employed',
        publicOccupation: '贸易公司职员',
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
    appearance: '短发，戴黑框眼镜。',
    clothing: '浅色衬衫与深色长裤。',
    equipment: [],
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
    bodyConditionSummary: '没有明显不适。',
    visibility: 'player_known',
    importance: 45,
    worldpackActorData: {}
  };
  return { state, cast, profile };
}

describe('opening actor enrichment', () => {
  it('accepts an ordinary employed NPC with no registered employer without requesting AI repair', () => {
    const { state, cast, profile } = civilianExtraFixture();
    const result = validateOpeningActorEnrichment(
      {
        actorSlotId: 'opening_actor_extra_1',
        rawProfile: profile
      },
      cast,
      state
    );

    expect(result.actor).toBeDefined();
    expect(result.repairPaths).not.toContain(
      'roleProfiles.civilian.employerOrganizationId'
    );
    expect(result.employerContractStatus).toBe('unresolved_allowed');
  });

  it('locally fills an ordinary NPC employer when the locked cast has one registered candidate', () => {
    const { state, cast, profile } = civilianExtraFixture(['org_hk_police']);
    const result = validateOpeningActorEnrichment(
      {
        actorSlotId: 'opening_actor_extra_1',
        rawProfile: profile
      },
      cast,
      state
    );

    expect(result.actor?.roleProfiles.civilian?.employerOrganizationId).toBe(
      'org_hk_police'
    );
    expect(result.employerContractStatus).toBe('locally_inferred');
    expect(result.repairPaths).not.toContain(
      'roleProfiles.civilian.employerOrganizationId'
    );
  });

  it('limits a multi-organization work relation repair to an explicit local candidate list', () => {
    const { state, cast, profile } = civilianExtraFixture();
    const allowedIds = Object.keys(state.organizations).slice(0, 2);
    state.actors.player.organizationRelations = allowedIds.map(
      (organizationId) => ({
        organizationId,
        relationType: 'employee',
        summary: '测试中的已核验工作关系。',
        visibility: 'player_known',
        isPrimary: false
      })
    );
    const workCast = structuredClone(cast);
    const lockedActor = workCast.actors.find(
      (actor) => actor.slotId === 'opening_actor_extra_1'
    )!;
    lockedActor.playerRoleRelation = 'civilian_work_relation';
    lockedActor.organizationIds = allowedIds;

    const validation = validateOpeningActorEnrichment(
      {
        actorSlotId: 'opening_actor_extra_1',
        rawProfile: profile
      },
      workCast,
      state
    );
    expect(validation.actor).toBeUndefined();
    expect(validation.employerContractStatus).toBe('repair_required');
    expect(validation.allowedEmployerOrganizationIds).toEqual(allowedIds);
    expect(validation.repairPaths).toContain(
      'roleProfiles.civilian.employerOrganizationId'
    );

    const prompt = createOpeningActorEnrichmentRepairPrompt({
      actorSlotId: lockedActor.slotId,
      lockedActor,
      rawProfile: profile,
      issues: validation.issues,
      allowedPaths: validation.repairPaths,
      allowedEmployerOrganizationIds:
        validation.allowedEmployerOrganizationIds
    });
    expect(prompt).toContain(JSON.stringify(allowedIds));
    expect(prompt).toContain('不得返回列表之外的 ID');
  });

  it('normalizes string and alias key memories without requesting actor repair', () => {
    const { state, cast, profile } = fixture();
    const result = validateOpeningActorEnrichment(
      {
        actorSlotId: 'opening_actor_police_relation_1',
        rawProfile: {
          ...profile,
          keyMemories: [
            '曾在一次巡逻中替玩家解围',
            {
              content: '过去曾与玩家共同处理一次纠纷',
              importance: '72',
              visibility: '玩家已知'
            }
          ]
        }
      },
      cast,
      state
    );

    expect(result.actor?.keyMemories).toEqual([
      {
        text: '曾在一次巡逻中替玩家解围',
        importance: 50,
        visibility: 'player_known'
      },
      {
        text: '过去曾与玩家共同处理一次纠纷',
        importance: 72,
        visibility: 'player_known'
      }
    ]);
    expect(result.repairPaths).not.toContain('keyMemories.0');
    expect(result.keyMemoryDiagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'opening_key_memory_string_normalized',
        'opening_key_memory_alias_normalized',
        'opening_key_memory_defaulted'
      ])
    );
  });

  it('keeps valid key memories and removes only unsafe items', () => {
    const valid = {
      text: '合法记忆',
      importance: 80,
      visibility: 'private'
    };
    const result = normalizeOpeningActorKeyMemories({
      keyMemories: [
        valid,
        null,
        '',
        23,
        { text: '私密事实', visibility: '无法判断的私密级别' },
        { text: '内容一', content: '内容二' }
      ]
    });

    expect(result.profile.keyMemories).toEqual([valid]);
    expect(
      result.diagnostics.filter(
        (item) => item.code === 'opening_key_memory_item_removed'
      )
    ).toHaveLength(5);
  });

  it('clears a wholly invalid non-core key memory collection', () => {
    const result = normalizeOpeningActorKeyMemories({
      keyMemories: [null, false, { summary: '' }]
    });

    expect(result.profile.keyMemories).toEqual([]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'opening_key_memories_cleared',
          path: ['keyMemories']
        })
      ])
    );
  });

  it('normalizes an object recent interaction memory without an AI repair', () => {
    const { cast, profile, state } = fixture();
    const result = validateOpeningActorEnrichment(
      {
        actorSlotId: cast.actors[0].slotId,
        rawProfile: {
          ...profile,
          recentInteractionMemory: { summary: '刚在现场完成交更。' }
        }
      },
      cast,
      state
    );

    expect(result.actor?.recentInteractionMemory).toBe(
      '刚在现场完成交更。'
    );
    expect(result.repairPaths).not.toContain('recentInteractionMemory');
    expect(result.recentInteractionMemoryDiagnostics).toEqual([
      expect.objectContaining({
        code: 'opening_recent_memory_alias_normalized'
      })
    ]);
  });

  it('combines a fully recoverable recent interaction memory array', () => {
    const result = normalizeOpeningActorRecentInteractionMemory({
      recentInteractionMemory: [
        '刚向玩家交代当值事项。',
        { content: '随后把交更记录交给玩家。' }
      ]
    });

    expect(result.profile.recentInteractionMemory).toBe(
      '刚向玩家交代当值事项。；随后把交更记录交给玩家。'
    );
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'opening_recent_memory_array_normalized'
      })
    ]);
  });

  it('leaves conflicting recent memory aliases for a bounded field repair', () => {
    const result = normalizeOpeningActorRecentInteractionMemory({
      recentInteractionMemory: {
        summary: '在警署交更。',
        content: '在码头会面。'
      }
    });

    expect(result.profile.recentInteractionMemory).toEqual({
      summary: '在警署交更。',
      content: '在码头会面。'
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('adds the exact keyMemories contract only to relevant field repairs', () => {
    const { cast, profile } = fixture();
    const prompt = createOpeningActorEnrichmentRepairPrompt({
      actorSlotId: cast.actors[0].slotId,
      lockedActor: cast.actors[0],
      rawProfile: profile,
      issues: ['keyMemories.0：必填字段缺失或类型非法'],
      allowedPaths: ['keyMemories.0']
    });

    expect(prompt).toContain(
      'value 必须是一项完整对象，不是字符串'
    );
    expect(prompt).toContain(
      '"visibility":"public|player_known|private|hidden"'
    );
  });

  it('validates each actor separately and discards model attempts to control stable IDs', () => {
    const { state, cast, profile } = fixture();
    const candidates = readOpeningActorEnrichmentCandidates(
      {
        openingSessionId: cast.openingSessionId,
        actors: [
          {
            actorSlotId: 'opening_actor_police_relation_1',
            profile
          }
        ]
      },
      cast.openingSessionId
    );
    const result = validateOpeningActorEnrichment(candidates[0], cast, state);

    expect(result.actor?.actorId).toBe('opening_actor_police_relation_1');
    expect(result.discardedPaths).toContain('actorId（本地锁定字段）');
  });

  it('repairs only the failed actor field and preserves all accepted siblings', () => {
    const { state, cast, profile } = fixture();
    const invalid = {
      ...profile,
      attributes: { ...profile.attributes, thinking: '63' }
    };
    const first = validateOpeningActorEnrichment(
      {
        actorSlotId: 'opening_actor_police_relation_1',
        rawProfile: invalid
      },
      cast,
      state
    );
    expect(first.actor).toBeUndefined();
    expect(first.repairPaths).toContain('attributes.thinking');

    const repaired = applyOpeningActorEnrichmentRepair(
      invalid,
      {
        actorSlotId: 'opening_actor_police_relation_1',
        repairs: [{ path: 'attributes.thinking', value: 63 }]
      },
      'opening_actor_police_relation_1',
      first.repairPaths
    );
    const final = validateOpeningActorEnrichment(
      {
        actorSlotId: 'opening_actor_police_relation_1',
        rawProfile: repaired
      },
      cast,
      state
    );
    expect(final.actor?.attributes.thinking).toBe(63);
    expect(final.actor?.appearance).toBe(profile.appearance);
  });

  it('treats a missing current-identity role profile as a per-actor repair path', () => {
    const { state, cast, profile } = fixture();
    const invalid = {
      ...profile,
      roleProfiles: {}
    };
    const first = validateOpeningActorEnrichment(
      {
        actorSlotId: 'opening_actor_police_relation_1',
        rawProfile: invalid
      },
      cast,
      state
    );

    expect(first.actor).toBeUndefined();
    expect(first.repairPaths).toEqual(['roleProfiles.police']);
    const repaired = applyOpeningActorEnrichmentRepair(
      invalid,
      {
        actorSlotId: 'opening_actor_police_relation_1',
        repairs: [
          {
            path: 'roleProfiles.police',
            value: profile.roleProfiles.police
          }
        ]
      },
      'opening_actor_police_relation_1',
      first.repairPaths
    );
    const final = validateOpeningActorEnrichment(
      {
        actorSlotId: 'opening_actor_police_relation_1',
        rawProfile: repaired
      },
      cast,
      state
    );

    expect(final.actor?.roleProfiles.police?.agencyId).toBe('org_hk_police');
  });

  it('projects a returned whole role profile onto only the authorized child paths', () => {
    const { profile } = fixture();
    const repaired = applyOpeningActorEnrichmentRepair(
      profile,
      {
        actorSlotId: 'opening_actor_police_relation_1',
        repairs: [
          {
            path: 'roleProfiles.police',
            value: {
              agencyId: 'org_hk_police',
              rank: '高级警长',
              department: '模型不得覆盖的部门',
              inventedField: '模型自造字段'
            }
          }
        ]
      },
      'opening_actor_police_relation_1',
      ['roleProfiles.police.agencyId', 'roleProfiles.police.rank']
    );
    const police = (
      repaired.roleProfiles as {
        police: Record<string, unknown>;
      }
    ).police;

    expect(police.agencyId).toBe('org_hk_police');
    expect(police.rank).toBe('高级警长');
    expect(police.department).toBe('刑事侦缉处');
    expect(police).not.toHaveProperty('inventedField');
  });

  it('accepts a child repair when the whole identity profile is authorized', () => {
    const { profile } = fixture();
    const repaired = applyOpeningActorEnrichmentRepair(
      profile,
      {
        actorSlotId: 'opening_actor_police_relation_1',
        repairs: [
          {
            path: 'roleProfiles.police.rank',
            value: '高级警长'
          }
        ]
      },
      'opening_actor_police_relation_1',
      ['roleProfiles.police']
    );

    expect(
      (
        repaired.roleProfiles as {
          police: Record<string, unknown>;
        }
      ).police.rank
    ).toBe('高级警长');
  });

  it('discards an unauthorized sibling repair without applying it', () => {
    const { profile } = fixture();
    const repaired = applyOpeningActorEnrichmentRepair(
      profile,
      {
        actorSlotId: 'opening_actor_police_relation_1',
        repairs: [
          {
            path: 'roleProfiles.police',
            value: { rank: '模型不得覆盖的职级' }
          },
          {
            path: 'attributes.thinking',
            value: 71
          }
        ]
      },
      'opening_actor_police_relation_1',
      ['attributes.thinking']
    );

    expect(
      (
        repaired.roleProfiles as {
          police: Record<string, unknown>;
        }
      ).police.rank
    ).toBe('警长');
    expect(
      (repaired.attributes as Record<string, unknown>).thinking
    ).toBe(71);
  });

  it('maps an unambiguous leaf repair path onto its authorized nested field', () => {
    const { profile } = fixture();
    const repaired = applyOpeningActorEnrichmentRepair(
      profile,
      {
        actorSlotId: 'opening_actor_police_relation_1',
        repairs: [{ path: 'rank', value: '高级警长' }]
      },
      'opening_actor_police_relation_1',
      ['roleProfiles.police.rank']
    );

    expect(
      (
        repaired.roleProfiles as {
          police: Record<string, unknown>;
        }
      ).police.rank
    ).toBe('高级警长');
  });

  it('allows an off-scene civilian to keep an unknown employer organization', () => {
    const { state, skeleton, cast, profile } = fixture();
    const policeActor = cast.actors[0];
    const { actorId: _actorId, ...rawPoliceActor } = policeActor;
    const remoteSlotId = 'opening_actor_extra_1';
    const remoteCast = lockOpeningCastDraft(
      {
        openingSessionId: skeleton.openingSessionId,
        openingFacts: cast.openingFacts,
        actors: [
          rawPoliceActor,
          {
            slotId: remoteSlotId,
            name: '周阿强',
            gender: 'male',
            currentIdentity: 'civilian',
            publicIdentity: '在广州工厂任职的远房亲属',
            actualIdentitySummary: '目前在广州生活和工作的远房亲属。',
            organizationIds: [],
            positionSummary: '工厂技术员',
            profileSummary: '与玩家保持书信联系。',
            personality: '务实而顾家。',
            speechStyle: '说话直白。',
            motivation: '维持家庭联系。',
            presence: 'mentioned'
          }
        ],
        actionIntents: cast.actionIntents
      },
      skeleton,
      state
    );
    const result = validateOpeningActorEnrichment(
      {
        actorSlotId: remoteSlotId,
        rawProfile: {
          ...profile,
          roleProfiles: {
            civilian: {
              status: 'active',
              employmentStatusId: 'employed',
              publicOccupation: '工厂技术员',
              positionSummary: '普通技术岗位',
              dutySummary: '维护生产设备。',
              decisionScopeSummary: '处理本人负责的设备故障。',
              accessSummary: '可接触当班生产线。',
              sectorIds: [],
              roleTags: [],
              livelihoodActorIds: [],
              communitySummary: '与工友和邻里保持普通往来。',
              familyEconomicSummary: '收入主要用于家庭生活。',
              legalStatusSummary: '合法居民。'
            }
          }
        }
      },
      remoteCast,
      state
    );

    expect(result.issues).toEqual([]);
    expect(
      result.actor?.roleProfiles.civilian?.employerOrganizationId
    ).toBeUndefined();
  });
});
