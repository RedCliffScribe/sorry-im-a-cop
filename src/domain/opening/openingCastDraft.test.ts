import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  applyOpeningCastFieldRepair,
  getOpeningCastRepairIssues,
  lockOpeningCastDraft,
  normalizeOpeningCastCandidate,
  validateOpeningCastDraft
} from './openingCastDraft';
import { getDramaticOpeningSourceRef } from '../drama/openingRegistry';
import { createOpeningLocalSkeleton } from './openingLocalSkeleton';

function createFixture() {
  const state = createInitialRuntimeState({
    currentIdentity: 'police',
    policePostingId: 'cid_headquarters'
  });
  const skeleton = createOpeningLocalSkeleton({
    state,
    openingSessionId: 'opening_cast'
  });
  const cast = {
    openingSessionId: skeleton.openingSessionId,
    openingFacts: {
      situationSummary: '刑事侦缉处完成早班交接。',
      centralMatter: '确认需要优先跟进的线索。',
      playerDecisionBoundary: '玩家自行决定先问上司还是查看档案。'
    },
    actors: [
      {
        slotId: 'opening_actor_police_relation_1',
        name: '梁志强',
        gender: 'male' as const,
        currentIdentity: 'police' as const,
        publicIdentity: '刑事侦缉处警长',
        actualIdentitySummary: '皇家香港警察刑事侦缉处当值警长。',
        playerRoleRelation: 'police_supervisor' as const,
        organizationIds: ['org_hk_police'],
        positionSummary: '刑事侦缉处当值警长',
        profileSummary: '熟悉案件分派的老资格警长。',
        personality: '谨慎务实，重视程序。',
        speechStyle: '说话简短直接，偶尔使用警队行话。',
        motivation: '把早班遗留案件妥善分派。',
        presence: 'present' as const,
        currentPlaceId: skeleton.currentPlaceId,
        currentSceneId: skeleton.currentSceneId
      },
      {
        slotId: 'opening_actor_extra_1',
        name: '陈秀兰',
        gender: 'female' as const,
        currentIdentity: 'civilian' as const,
        publicIdentity: '玩家母亲',
        actualIdentitySummary: '居于广州的玩家母亲。',
        organizationIds: [],
        positionSummary: '退休工人',
        profileSummary: '与玩家保持书信联系的远场亲属。',
        personality: '节俭而关心家人。',
        speechStyle: '说话温和但爱反复叮嘱。',
        motivation: '确认玩家在香港生活安稳。',
        presence: 'mentioned' as const
      }
    ],
    actionIntents: [
      {
        actionId: 'opening_action_1',
        intent: '向警长询问最急的案件。',
        relatedActorSlotIds: ['opening_actor_police_relation_1'],
        requiredFacts: ['警长正在分派案件']
      },
      {
        actionId: 'opening_action_2',
        intent: '先查看交更档案。',
        relatedActorSlotIds: [],
        requiredFacts: ['交更档案已经放在桌上']
      }
    ]
  };
  return { state, skeleton, cast };
}

describe('opening minimal cast draft', () => {
  it('accepts a required police slot plus a remote actor with unknown location', () => {
    const { state, skeleton, cast } = createFixture();
    const parsed = validateOpeningCastDraft(cast, skeleton, state);

    expect(parsed.actors[1]).toMatchObject({
      slotId: 'opening_actor_extra_1',
      presence: 'mentioned'
    });
    expect(parsed.actors[1].currentPlaceId).toBeUndefined();
  });

  it('assigns canonical actor IDs only after the cast passes the local skeleton contract', () => {
    const { state, skeleton, cast } = createFixture();
    const locked = lockOpeningCastDraft(cast, skeleton, state);

    expect(locked.actors.map((actor) => actor.actorId)).toEqual([
      'opening_actor_police_relation_1',
      'opening_actor_extra_1'
    ]);
    expect(cast.actors[0]).not.toHaveProperty('actorId');
  });

  it('locally normalizes provider empty strings, aliases, and forbidden extra-slot relation metadata', () => {
    const { state, skeleton, cast } = createFixture();
    const normalized = normalizeOpeningCastCandidate(
      {
        ...cast,
        openingSessionId: 'model_echoed_wrong_session',
        actors: [
          {
            ...cast.actors[0],
            actorId: 'model_invented_actor_id',
            playerRoleRelation: 'supervisor',
            currentIdentity: 'civilian'
          },
          {
            ...cast.actors[1],
            playerRoleRelation: 'family_member',
            currentPlaceId: '',
            currentSceneId: '  '
          }
        ]
      },
      skeleton,
      state
    );
    const parsed = validateOpeningCastDraft(
      normalized.value,
      skeleton,
      state
    );

    expect(normalized.changes.length).toBeGreaterThan(0);
    expect(parsed.openingSessionId).toBe(skeleton.openingSessionId);
    expect(parsed.actors[0].playerRoleRelation).toBe('police_supervisor');
    expect(parsed.actors[0].currentIdentity).toBe('police');
    expect(parsed.actors[0]).not.toHaveProperty('actorId');
    expect(parsed.actors[1].playerRoleRelation).toBeUndefined();
    expect(parsed.actors[1].currentPlaceId).toBeUndefined();
    expect(parsed.actors[1].currentSceneId).toBeUndefined();
  });

  it('locks the selected first-act custom character profile to its reserved stable actor ID', () => {
    const { cast } = createFixture();
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      policePostingId: 'cid_headquarters'
    });
    state.customContent = {
      schemaVersion: 1,
      projectBindings: [],
      characterBindings: [
        {
          bindingId: 'binding_forensic_lam',
          assetKind: 'character',
          assetId: 'character_forensic_lam',
          revision: 2,
          checksum: 'checksum_forensic_lam',
          payload: {
            displayName: '林法证',
            gender: '女',
            profileSummary: '谨慎可靠的法证人员。',
            corePersonality: ['冷静', '细致'],
            coreMotivations: ['查清现场事实'],
            sourceProfile: {
              speechStyle: '用词精确，少说废话。'
            }
          } as never
        }
      ],
      eventGroupBindings: [],
      projectAdaptations: {},
      characterAdaptations: {
        adaptation_forensic_lam: {
          adaptationId: 'adaptation_forensic_lam',
          characterAssetId: 'character_forensic_lam',
          sourceRevision: 2,
          worldpackId: state.world.worldpackId,
          anchorTime: { ...state.time },
          runtimeActorId: 'actor_custom_forensic_lam',
          adaptedPublicIdentity: '政府化验所法证人员',
          adaptedOccupation: '法证化验师',
          adaptedSocialPosition: '专业人员',
          adaptedOrganizationRefs: [],
          adaptedPlaceRefs: [],
          adaptedBackgroundSummary: '负责协助警方检查第一幕现场。',
          adaptedContactRoutes: ['现场协作'],
          status: 'ready'
        }
      },
      characterAdaptationIntents: [],
      eventGroupAdaptations: {},
      characterEntryIntents: [],
      eventEntryIntents: [],
      characterRuntimeBindings: [],
      eventInstances: [],
      priorityItems: [],
      recentDiagnostics: []
    };
    state.dramaticContent = {
      ...(state.dramaticContent ?? {
        instances: [],
        recentDiagnostics: []
      }),
      openingSupportSourceRef: {
        providerId: 'custom-character',
        sourceType: 'custom_character_binding',
        sourceId: 'binding_forensic_lam'
      }
    };
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_custom_first_act'
    });
    const normalized = normalizeOpeningCastCandidate(
      {
        ...cast,
        openingSessionId: skeleton.openingSessionId,
        actors: [
          cast.actors[0],
          {
            ...cast.actors[1],
            name: '模型另造的人物',
            gender: 'male',
            currentIdentity: 'police',
            publicIdentity: '普通路人',
            actualIdentitySummary: '模型改写的背景。',
            positionSummary: '路人',
            profileSummary: '模型改写的简介。',
            personality: '急躁',
            speechStyle: '含糊',
            motivation: '离开现场'
          }
        ]
      },
      skeleton,
      state
    );
    const locked = lockOpeningCastDraft(
      normalized.value,
      skeleton,
      state
    );
    const firstActActor = locked.actors.find(
      (actor) => actor.slotId === 'opening_actor_extra_1'
    );

    expect(firstActActor).toMatchObject({
      actorId: 'actor_custom_forensic_lam',
      name: '林法证',
      gender: 'female',
      currentIdentity: 'civilian',
      publicIdentity: '政府化验所法证人员',
      actualIdentitySummary: '负责协助警方检查第一幕现场。',
      positionSummary: '法证化验师',
      profileSummary: '谨慎可靠的法证人员。',
      personality: '冷静；细致',
      speechStyle: '用词精确，少说废话。',
      motivation: '查清现场事实'
    });
    expect(normalized.changes).toContain(
      'opening_actor_extra_1 使用第一幕自定义人物的锁定档案'
    );
  });

  it('removes an optional actor invented organization without discarding the actor', () => {
    const { state, skeleton, cast } = createFixture();
    const normalized = normalizeOpeningCastCandidate(
      {
        ...cast,
        actors: [
          cast.actors[0],
          {
            ...cast.actors[1],
            organizationIds: ['org_model_invented_employer']
          }
        ]
      },
      skeleton,
      state
    );
    const parsed = validateOpeningCastDraft(
      normalized.value,
      skeleton,
      state
    );

    expect(parsed.actors[1]).toMatchObject({
      slotId: 'opening_actor_extra_1',
      name: '陈秀兰',
      organizationIds: []
    });
    expect(normalized.changes).toContain(
      'opening_actor_extra_1 移除模型提供的未知可选机构 org_model_invented_employer'
    );
    expect(state.organizations.org_model_invented_employer).toBeUndefined();
  });

  it('repairs only the missing dramaPlan path and preserves the first cast candidate', () => {
    const setup = {
      currentIdentity: 'police' as const,
      policePostingId: 'cid_headquarters',
      dramaticOpeningId: 'first_shift'
    };
    const state = createInitialRuntimeState(setup);
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_dramatic_repair'
    });
    const { cast } = createFixture();
    const rawCast = {
      ...cast,
      openingSessionId: skeleton.openingSessionId
    };
    const analysis = getOpeningCastRepairIssues(rawCast, skeleton, state);
    expect(analysis.issues).toEqual([
      expect.objectContaining({ path: 'dramaPlan' })
    ]);
    const sourceRef = getDramaticOpeningSourceRef('first_shift');
    expect(sourceRef).toBeDefined();

    const repaired = applyOpeningCastFieldRepair(
      analysis.normalized,
      {
        repairs: [
          {
            path: 'dramaPlan',
            value: {
              planId: 'drama_plan_opening_first_shift',
              planningScope: 'opening',
              mode: 'surface',
              primarySource: sourceRef,
              supportSources: [],
              sceneFunction: 'choice',
              intensity: 'medium',
              playerMayIgnore: true,
              maxNewActors: 4,
              adaptationSummary: '把第一班压力落到当前交更现场。',
              reasonSummary: '玩家可以从当值任务自然进入第一幕。'
            }
          }
        ]
      },
      analysis.issues.map((issue) => issue.path),
      skeleton,
      state
    );
    const parsed = validateOpeningCastDraft(repaired, skeleton, state);

    expect(parsed.openingFacts).toEqual(cast.openingFacts);
    expect(parsed.actors).toEqual(cast.actors);
    expect(parsed.actionIntents).toEqual(cast.actionIntents);
    expect(parsed.dramaPlan).toMatchObject({
      planId: 'drama_plan_opening_first_shift'
    });
  });

  it('repairs the action intent array without regenerating the cast', () => {
    const { state, skeleton, cast } = createFixture();
    const analysis = getOpeningCastRepairIssues(
      { ...cast, actionIntents: [] },
      skeleton,
      state
    );
    expect(analysis.issues).toEqual([
      expect.objectContaining({ path: 'actionIntents' })
    ]);

    const repaired = applyOpeningCastFieldRepair(
      analysis.normalized,
      {
        repairs: [{ path: 'actionIntents', value: cast.actionIntents }]
      },
      ['actionIntents'],
      skeleton,
      state
    );
    const parsed = validateOpeningCastDraft(repaired, skeleton, state);

    expect(parsed.actors).toEqual(cast.actors);
    expect(parsed.actionIntents).toEqual(cast.actionIntents);
  });

  it('expands a missing openingFacts object into three supported leaf repairs', () => {
    const { state, skeleton, cast } = createFixture();
    const { openingFacts: _openingFacts, ...withoutOpeningFacts } = cast;
    const analysis = getOpeningCastRepairIssues(
      withoutOpeningFacts,
      skeleton,
      state
    );

    expect(analysis.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'openingFacts.situationSummary',
        'openingFacts.centralMatter',
        'openingFacts.playerDecisionBoundary'
      ])
    );
    expect(analysis.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'openingFacts' })
      ])
    );

    const repaired = applyOpeningCastFieldRepair(
      analysis.normalized,
      {
        repairs: analysis.issues.map((issue) => ({
          path: issue.path,
          value:
            cast.openingFacts[
              issue.path.split('.')[1] as keyof typeof cast.openingFacts
            ]
        }))
      },
      analysis.issues.map((issue) => issue.path),
      skeleton,
      state
    );

    expect(validateOpeningCastDraft(repaired, skeleton, state).openingFacts).toEqual(
      cast.openingFacts
    );
  });

  it('rejects a model-supplied actorId, missing required slots, unknown organizations, and mismatched scenes', () => {
    const { state, skeleton, cast } = createFixture();
    expect(() =>
      validateOpeningCastDraft(
        {
          ...cast,
          actors: [{ ...cast.actors[0], actorId: 'model_invented_id' }]
        },
        skeleton,
        state
      )
    ).toThrow();

    expect(() =>
      validateOpeningCastDraft(
        { ...cast, actors: [cast.actors[1]] },
        skeleton,
        state
      )
    ).toThrow('缺少必需人物槽位');

    expect(() =>
      validateOpeningCastDraft(
        {
          ...cast,
          actors: [
            {
              ...cast.actors[0],
              organizationIds: ['org_model_invented']
            },
            cast.actors[1]
          ]
        },
        skeleton,
        state
      )
    ).toThrow('未知机构');

    expect(() =>
      validateOpeningCastDraft(
        {
          ...cast,
          actors: [
            {
              ...cast.actors[0],
              currentSceneId: 'scene_elsewhere'
            },
            cast.actors[1]
          ]
        },
        skeleton,
        state
      )
    ).toThrow('在场地点与本地开局场景不一致');
  });

  it('rejects an unauthorized drama plan instead of carrying it into later phases', () => {
    const setup = {
      currentIdentity: 'police' as const,
      policePostingId: 'cid_headquarters',
      dramaticOpeningId: 'first_shift'
    };
    const state = createInitialRuntimeState(setup);
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_dramatic'
    });
    const { cast } = createFixture();

    expect(() =>
      validateOpeningCastDraft(
        {
          ...cast,
          openingSessionId: skeleton.openingSessionId,
          dramaPlan: {
            planId: 'model_invented_plan',
            planningScope: 'opening',
            mode: 'surface',
            primarySource: {
              providerId: 'model',
              sourceType: 'invented',
              sourceId: 'invented'
            },
            supportSources: [],
            sceneFunction: 'choice',
            intensity: 'medium',
            playerMayIgnore: true,
            maxNewActors: 4,
            adaptationSummary: '非法来源',
            reasonSummary: '非法来源'
          }
        },
        skeleton,
        state
      )
    ).toThrow('DramaPlan');
  });
});
