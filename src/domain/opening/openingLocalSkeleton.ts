import { z } from 'zod';
import type { CurrentIdentity, RuntimeState } from '../runtime/types';

export const openingPlayerRoleRelationSchema = z.enum([
  'police_supervisor',
  'police_peer',
  'triad_patron',
  'triad_peer',
  'civilian_work_relation',
  'civilian_social_relation'
]);

export type OpeningPlayerRoleRelation = z.infer<
  typeof openingPlayerRoleRelationSchema
>;

export const openingActorSlotSchema = z
  .object({
    slotId: z.string().min(1),
    actorId: z.string().min(1),
    required: z.boolean(),
    allowedPlayerRoleRelations: z.array(openingPlayerRoleRelationSchema).max(2),
    requiredOrganizationIds: z.array(z.string().min(1))
  })
  .strict();

export type OpeningActorSlot = z.infer<typeof openingActorSlotSchema>;

export const openingLocalSkeletonSchema = z
  .object({
    schemaVersion: z.literal(1),
    openingSessionId: z.string().min(1),
    worldpackId: z.string().min(1),
    playerActorId: z.string().min(1),
    playerIdentity: z.enum(['civilian', 'gang_member', 'police']),
    openingTime: z
      .object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59)
      })
      .strict(),
    currentPlaceId: z.string().min(1),
    currentSceneId: z.string().min(1),
    requiredOrganizationIds: z.array(z.string().min(1)),
    actorSlots: z.array(openingActorSlotSchema).min(3).max(4),
    homeBasePlaceId: z.string().min(1),
    currentMatterId: z.string().min(1),
    turnMemoryId: z.string().min(1),
    actionIds: z.array(z.string().min(1)).length(4)
  })
  .strict()
  .superRefine((skeleton, context) => {
    const slotIds = skeleton.actorSlots.map((slot) => slot.slotId);
    const actorIds = skeleton.actorSlots.map((slot) => slot.actorId);
    if (new Set(slotIds).size !== slotIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['actorSlots'],
        message: '人物槽位 ID 必须唯一'
      });
    }
    if (new Set(actorIds).size !== actorIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['actorSlots'],
        message: '人物稳定 actorId 必须唯一'
      });
    }
    if (new Set(skeleton.actionIds).size !== skeleton.actionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['actionIds'],
        message: '行动 ID 必须唯一'
      });
    }
  });

export type OpeningLocalSkeleton = z.infer<typeof openingLocalSkeletonSchema>;

function createOpeningSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `opening_${globalThis.crypto.randomUUID()}`;
  }
  return `opening_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getPlayerOrganizationIds(
  state: RuntimeState,
  identity: CurrentIdentity
): string[] {
  const player = state.actors[state.player.actorId];
  const organizationId =
    identity === 'police'
      ? player?.roleProfiles.police?.agencyId ?? state.lawIdentity.agencyId
      : identity === 'gang_member'
        ? player?.roleProfiles.triad?.organizationId
        : player?.roleProfiles.civilian?.employerOrganizationId;
  return organizationId ? [organizationId] : [];
}

function createIdentitySlots(
  identity: CurrentIdentity,
  requiredOrganizationIds: string[]
): OpeningActorSlot[] {
  if (identity === 'gang_member') {
    return [
      {
        slotId: 'opening_actor_triad_patron',
        actorId: 'opening_actor_triad_patron',
        required: true,
        allowedPlayerRoleRelations: ['triad_patron'],
        requiredOrganizationIds
      },
      {
        slotId: 'opening_actor_triad_peer',
        actorId: 'opening_actor_triad_peer',
        required: true,
        allowedPlayerRoleRelations: ['triad_peer'],
        requiredOrganizationIds
      }
    ];
  }
  if (identity === 'civilian') {
    if (requiredOrganizationIds.length === 0) {
      return [
        {
          slotId: 'opening_actor_civilian_social_relation_1',
          actorId: 'opening_actor_civilian_social_relation_1',
          required: true,
          allowedPlayerRoleRelations: ['civilian_social_relation'],
          requiredOrganizationIds: []
        }
      ];
    }
    return [
      {
        slotId: 'opening_actor_civilian_work_relation_1',
        actorId: 'opening_actor_civilian_work_relation_1',
        required: true,
        allowedPlayerRoleRelations: ['civilian_work_relation'],
        requiredOrganizationIds
      }
    ];
  }
  return [
    {
      slotId: 'opening_actor_police_relation_1',
      actorId: 'opening_actor_police_relation_1',
      required: true,
      allowedPlayerRoleRelations: ['police_supervisor', 'police_peer'],
      requiredOrganizationIds
    }
  ];
}

function getOpeningSupportActorId(state: RuntimeState): string | undefined {
  const ref = state.dramaticContent?.openingSupportSourceRef;
  const customContent = state.customContent;
  if (
    !ref ||
    ref.providerId !== 'custom-character' ||
    ref.sourceType !== 'custom_character_binding' ||
    !customContent
  ) {
    return undefined;
  }
  const binding = customContent.characterBindings.find(
    (candidate) =>
      candidate.bindingId === ref.sourceId &&
      candidate.assetKind === 'character'
  );
  if (!binding) return undefined;
  const adaptation = Object.values(
    customContent.characterAdaptations
  ).find(
    (candidate) =>
      candidate.characterAssetId === binding.assetId &&
      candidate.sourceRevision === binding.revision &&
      candidate.worldpackId === state.world.worldpackId &&
      candidate.status === 'ready'
  );
  const runtimeActorId = adaptation?.runtimeActorId.trim();
  if (
    !runtimeActorId ||
    runtimeActorId === state.player.actorId ||
    runtimeActorId in state.actors
  ) {
    return undefined;
  }
  return runtimeActorId;
}

export function createOpeningLocalSkeleton({
  state,
  openingSessionId = createOpeningSessionId()
}: {
  state: RuntimeState;
  openingSessionId?: string;
}): OpeningLocalSkeleton {
  const identity = state.player.currentIdentity;
  const requiredOrganizationIds = getPlayerOrganizationIds(state, identity);
  const identitySlots = createIdentitySlots(identity, requiredOrganizationIds);
  const openingSupportActorId = getOpeningSupportActorId(state);
  const actorSlots: OpeningActorSlot[] = [
    ...identitySlots,
    {
      slotId: 'opening_actor_extra_1',
      actorId: openingSupportActorId ?? 'opening_actor_extra_1',
      required: false,
      allowedPlayerRoleRelations: [],
      requiredOrganizationIds: []
    },
    {
      slotId: 'opening_actor_extra_2',
      actorId: 'opening_actor_extra_2',
      required: false,
      allowedPlayerRoleRelations: [],
      requiredOrganizationIds: []
    }
  ];

  return openingLocalSkeletonSchema.parse({
    schemaVersion: 1,
    openingSessionId,
    worldpackId: state.world.worldpackId,
    playerActorId: state.player.actorId,
    playerIdentity: identity,
    openingTime: { ...state.time },
    currentPlaceId: state.location.currentPlaceId,
    currentSceneId: state.location.currentSceneId,
    requiredOrganizationIds,
    actorSlots,
    homeBasePlaceId: 'place_home_player_opening',
    currentMatterId: `matter_opening_${identity}`,
    turnMemoryId: 'memory_opening_fact',
    actionIds: [
      'opening_action_1',
      'opening_action_2',
      'opening_action_3',
      'opening_action_4'
    ]
  });
}
