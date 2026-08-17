import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { validateOpeningCastDraft } from './openingCastDraft';
import {
  createOpeningLocalSkeleton,
  openingLocalSkeletonSchema
} from './openingLocalSkeleton';
import {
  createOpeningSessionDraft,
  saveOpeningCastCheckpoint
} from './openingSessionDraft';
import { reconcileOpeningSessionCivilianEmployerContract } from './openingSessionEmployerMigration';

describe('opening session employer migration', () => {
  it('migrates an old zero-employer work slot in place and preserves the current cast', async () => {
    const setup = {
      currentIdentity: 'civilian' as const,
      civilianProfileId: 'custom_occupation',
      civilianCustomProfile: {
        publicOccupation: '贸易文员',
        workplacePlaceId: 'place_central_ferry_piers',
        workplaceLabel: '中环'
      }
    };
    const state = createInitialRuntimeState(setup);
    const currentSkeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_old_employer_deadlock'
    });
    const legacySkeleton = openingLocalSkeletonSchema.parse({
      ...currentSkeleton,
      actorSlots: currentSkeleton.actorSlots.map((slot, index) =>
        index === 0
          ? {
              slotId: 'opening_actor_civilian_work_relation_1',
              actorId: 'opening_actor_civilian_work_relation_1',
              required: true,
              allowedPlayerRoleRelations: ['civilian_work_relation'],
              requiredOrganizationIds: []
            }
          : slot
      )
    });
    const cast = validateOpeningCastDraft(
      {
        openingSessionId: legacySkeleton.openingSessionId,
        openingFacts: {
          situationSummary: '玩家在住所附近遇见熟人。',
          centralMatter: '一项普通生活联络。',
          playerDecisionBoundary: '玩家决定是否回应。'
        },
        actors: [
          {
            slotId: 'opening_actor_civilian_work_relation_1',
            name: '梁锦青',
            gender: 'male',
            currentIdentity: 'civilian',
            publicIdentity: '街坊熟人',
            actualIdentitySummary: '与玩家有稳定日常往来的普通市民。',
            playerRoleRelation: 'civilian_work_relation',
            organizationIds: [],
            positionSummary: '街坊熟人',
            profileSummary: '熟悉附近生活环境。',
            personality: '随和而谨慎。',
            speechStyle: '说话平实。',
            motivation: '维持日常来往。',
            presence: 'present',
            currentPlaceId: legacySkeleton.currentPlaceId,
            currentSceneId: legacySkeleton.currentSceneId
          }
        ],
        actionIntents: [
          {
            actionId: 'opening_action_1',
            intent: '与梁锦青交谈。',
            relatedActorSlotIds: [
              'opening_actor_civilian_work_relation_1'
            ],
            requiredFacts: []
          },
          {
            actionId: 'opening_action_2',
            intent: '先处理自己的事情。',
            relatedActorSlotIds: [],
            requiredFacts: []
          }
        ]
      },
      legacySkeleton,
      state
    );
    let draft = await createOpeningSessionDraft({
      setup,
      skeleton: legacySkeleton,
      now: '2026-07-29T00:00:00.000Z'
    });
    draft = saveOpeningCastCheckpoint(
      draft,
      cast,
      '2026-07-29T00:01:00.000Z'
    );

    const result = reconcileOpeningSessionCivilianEmployerContract({
      draft,
      state,
      now: '2026-07-29T00:02:00.000Z'
    });

    expect(result.changed).toBe(true);
    expect(result.draft.stage).toBe('cast_ready');
    expect(result.draft.skeleton.actorSlots[0]).toMatchObject({
      slotId: 'opening_actor_civilian_social_relation_1',
      allowedPlayerRoleRelations: ['civilian_social_relation'],
      requiredOrganizationIds: []
    });
    expect(result.draft.castDraft?.actors[0]).toMatchObject({
      slotId: 'opening_actor_civilian_social_relation_1',
      name: '梁锦青',
      playerRoleRelation: 'civilian_social_relation'
    });
    expect(
      result.draft.castDraft?.actionIntents[0].relatedActorSlotIds
    ).toEqual(['opening_actor_civilian_social_relation_1']);
    expect(
      result.draft.actorProfiles.opening_actor_civilian_social_relation_1
    ).toMatchObject({
      status: 'pending',
      actorId: 'opening_actor_civilian_work_relation_1'
    });
    expect(result.draft.actorProfiles).not.toHaveProperty(
      'opening_actor_civilian_work_relation_1'
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'opening_employer_contract_missing_upstream',
      'opening_cast_rebuilt_for_employer_contract'
    ]);
  });
});
