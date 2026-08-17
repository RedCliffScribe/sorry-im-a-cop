import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  createOpeningLocalSkeleton,
  openingLocalSkeletonSchema
} from './openingLocalSkeleton';

describe('opening local skeleton', () => {
  it('locks player, world, time, location, actions, and a police relation slot locally', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      policePostingId: 'cid_headquarters'
    });
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_police'
    });

    expect(skeleton).toMatchObject({
      openingSessionId: 'opening_police',
      worldpackId: 'hk_1988',
      playerActorId: 'player',
      playerIdentity: 'police',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      requiredOrganizationIds: ['org_hk_police'],
      homeBasePlaceId: 'place_home_player_opening',
      currentMatterId: 'matter_opening_police',
      turnMemoryId: 'memory_opening_fact'
    });
    expect(skeleton.actorSlots[0]).toEqual({
      slotId: 'opening_actor_police_relation_1',
      actorId: 'opening_actor_police_relation_1',
      required: true,
      allowedPlayerRoleRelations: ['police_supervisor', 'police_peer'],
      requiredOrganizationIds: ['org_hk_police']
    });
    expect(new Set(skeleton.actionIds).size).toBe(4);
  });

  it('locks separate triad patron and peer slots without asking the model for IDs', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'gang_member'
    });
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_triad'
    });
    const required = skeleton.actorSlots.filter((slot) => slot.required);

    expect(required.map((slot) => slot.slotId)).toEqual([
      'opening_actor_triad_patron',
      'opening_actor_triad_peer'
    ]);
    expect(required.map((slot) => slot.allowedPlayerRoleRelations)).toEqual([
      ['triad_patron'],
      ['triad_peer']
    ]);
    expect(required.every((slot) => slot.requiredOrganizationIds.length === 1)).toBe(
      true
    );
  });

  it('reserves the selected first-act custom character stable actor ID in the extra slot', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      policePostingId: 'cid_headquarters',
      dramaticOpeningId: 'classic_hong_kong'
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
          payload: {} as never
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
          adaptedPublicIdentity: '法证科化验师',
          adaptedOccupation: '法证人员',
          adaptedSocialPosition: '专业人员',
          adaptedOrganizationRefs: [],
          adaptedPlaceRefs: [],
          adaptedBackgroundSummary: '受邀协助第一幕现场。',
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

    expect(
      skeleton.actorSlots.find(
        (slot) => slot.slotId === 'opening_actor_extra_1'
      )
    ).toMatchObject({
      actorId: 'actor_custom_forensic_lam',
      required: false
    });
  });

  it('locks one civilian work-relation slot and rejects duplicate stable IDs', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'office_clerk'
    });
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_civilian'
    });

    expect(skeleton.actorSlots[0]).toMatchObject({
      slotId: 'opening_actor_civilian_work_relation_1',
      actorId: 'opening_actor_civilian_work_relation_1',
      allowedPlayerRoleRelations: ['civilian_work_relation']
    });

    const invalid = structuredClone(skeleton);
    invalid.actorSlots[1].actorId = invalid.actorSlots[0].actorId;
    expect(() => openingLocalSkeletonSchema.parse(invalid)).toThrow(
      '人物稳定 actorId 必须唯一'
    );
  });

  it('uses a social-relation slot when free text mentions work but no formal employer was registered', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'custom_occupation',
      originBackground: {
        originBackgroundId: 'custom',
        name: '自定义背景',
        definition: '我在金龙贸易公司工作，但没有填写结构化雇主字段。',
        backgroundSummary: '自由背景提到一间公司。'
      },
      civilianCustomProfile: {
        publicOccupation: '贸易文员',
        workplacePlaceId: 'place_central_ferry_piers',
        workplaceLabel: '中环'
      }
    });
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_civilian_without_employer'
    });

    expect(state.organizations.org_player_custom_employer).toBeUndefined();
    expect(skeleton.requiredOrganizationIds).toEqual([]);
    expect(skeleton.actorSlots[0]).toEqual({
      slotId: 'opening_actor_civilian_social_relation_1',
      actorId: 'opening_actor_civilian_social_relation_1',
      required: true,
      allowedPlayerRoleRelations: ['civilian_social_relation'],
      requiredOrganizationIds: []
    });
  });

  it('keeps a work-relation slot for a structured custom employer', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'custom_occupation',
      civilianCustomProfile: {
        publicOccupation: '摄影助理',
        workplacePlaceId: 'place_broadcast_drive',
        workplaceLabel: '广播道',
        employerName: '明光摄影社'
      }
    });
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_civilian_with_employer'
    });

    expect(state.organizations.org_player_custom_employer?.name).toBe(
      '明光摄影社'
    );
    expect(skeleton.actorSlots[0]).toMatchObject({
      allowedPlayerRoleRelations: ['civilian_work_relation'],
      requiredOrganizationIds: ['org_player_custom_employer']
    });
  });
});
