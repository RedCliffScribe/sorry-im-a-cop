import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  createOpeningBlueprintFromSession,
  createOpeningInitializationFromSession
} from './openingFinalization';
import { createOpeningLocalSkeleton } from './openingLocalSkeleton';
import {
  createOpeningSessionDraft,
  saveOpeningActorProfileCheckpoint,
  saveOpeningCastCheckpoint,
  type OpeningSessionDraft
} from './openingSessionDraft';

describe('opening finalization', () => {
  it('carries narrative presentation hints into the final opening initialization', () => {
    const draft = {
      narrativeDraft: {
        openingSessionId: 'opening_hints',
        narrativeText: '【梁志强】先看记录。',
        presentationHints: { dialogueEmotions: ['serious'] },
        suggestedActions: [
          { actionId: 'opening_action_1', text: '查看记录。' },
          { actionId: 'opening_action_2', text: '询问任务。' }
        ]
      },
      runtimeDraft: {
        openingSessionId: 'opening_hints',
        playerPresentationPatch: {
          clothing: '整齐便服。',
          equipment: [],
          statusSummary: '状态正常。'
        },
        playerStatePatch: {
          economy: {
            cashOnHand: 800,
            bankBalance: 5_000,
            monthlyPressure: 35,
            financeSummary: '收支普通。'
          },
          homeBase: {
            placeId: 'place_home',
            placeName: '旺角旧楼住宅',
            regionId: 'mong_kok',
            housingType: '租住单位',
            summary: '靠近工作地点。',
            householdSummary: '独居。'
          }
        }
      }
    } as unknown as OpeningSessionDraft;

    expect(createOpeningInitializationFromSession(draft).presentationHints).toEqual({
      dialogueEmotions: ['serious']
    });
  });

  it('reconstructs actor and action IDs from local slots rather than model values', async () => {
    const setup = {
      currentIdentity: 'police' as const,
      policePostingId: 'cid_headquarters'
    };
    const state = createInitialRuntimeState(setup);
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_finalize'
    });
    let draft = await createOpeningSessionDraft({ setup, skeleton });
    draft = saveOpeningCastCheckpoint(draft, {
      openingSessionId: skeleton.openingSessionId,
      openingFacts: {
        situationSummary: '完成交更。',
        centralMatter: '确认任务。',
        playerDecisionBoundary: '玩家决定行动。'
      },
      actors: [
        {
          slotId: 'opening_actor_police_relation_1',
          name: '梁志强',
          gender: 'male',
          currentIdentity: 'police',
          publicIdentity: '警长',
          actualIdentitySummary: '当值警长。',
          playerRoleRelation: 'police_supervisor',
          organizationIds: ['org_hk_police'],
          positionSummary: '当值警长',
          profileSummary: '负责交更。',
          personality: '谨慎。',
          speechStyle: '简短。',
          motivation: '完成任务。',
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
    });
    draft = saveOpeningActorProfileCheckpoint(
      draft,
      'opening_actor_police_relation_1',
      {
        actorId: 'opening_actor_police_relation_1',
        name: '梁志强',
        aliases: [],
        gender: 'male',
        computedAge: 42,
        visualAgeAnchor: '四十岁出头。',
        currentIdentity: 'police',
        publicIdentity: '警长',
        actualIdentitySummary: '当值警长。',
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
            authoritySummary: '负责分派。',
            accessSummary: '可查交更记录。',
            dutySummary: '分派案件。',
            institutionalReputation: '经验可靠。',
            disciplinePressureSummary: '重视程序。'
          }
        },
        playerRoleRelation: 'police_supervisor',
        organizationIds: ['org_hk_police'],
        positionSummary: '当值警长',
        profileSummary: '负责交更。',
        appearance: '短发。',
        clothing: '便装。',
        equipment: [],
        personality: '谨慎。',
        speechStyle: '简短。',
        motivation: '完成任务。',
        longTermGoal: '带好队伍。',
        values: '程序。',
        attributes: {
          body: 55,
          action: 52,
          perception: 68,
          thinking: 63,
          negotiation: 61,
          will: 70
        },
        relationshipSummary: '当值上司。',
        attitudeTowardPlayer: '观察中。',
        interactionScore: 18,
        trustTendency: '看表现。',
        entanglementSummary: '工作联系。',
        longTermMemorySummary: '知道玩家到任。',
        recentInteractionMemory: '刚完成交更。',
        statusSummary: '正在当值。',
        bodyConditionSummary: '略有疲惫。',
        presence: 'present',
        currentPlaceId: skeleton.currentPlaceId,
        currentSceneId: skeleton.currentSceneId,
        visibility: 'player_known',
        importance: 72,
        keyMemories: [],
        worldpackActorData: {}
      }
    );

    const { blueprint } = createOpeningBlueprintFromSession(draft, state);
    expect(blueprint.initialActors[0].actorId).toBe(
      'opening_actor_police_relation_1'
    );
    expect(blueprint.actionIntents[0].relatedActorIds).toEqual([
      'opening_actor_police_relation_1'
    ]);
  });
});
