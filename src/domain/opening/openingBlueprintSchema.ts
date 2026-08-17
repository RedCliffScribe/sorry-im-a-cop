import { z } from 'zod';
import {
  actorFemaleProfilePatchSchema,
  visibilitySchema
} from '../writeback/schema';
import { openingActorSeedSchema } from './openingSchema';

const requiredRoleProfilesSchema = z.preprocess(
  (value) => (value === undefined ? '__missing_role_profiles__' : value),
  openingActorSeedSchema.shape.roleProfiles
);

const nullableOptionalNonEmptyStringSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().min(1).optional()
);

const openingCoreActorInputSchema = openingActorSeedSchema
  .omit({ activeTraits: true })
  .extend({
    actorId: z.string().min(1),
    englishName: nullableOptionalNonEmptyStringSchema,
    aliases: z.array(z.string().min(1)).default([]),
    callName: nullableOptionalNonEmptyStringSchema,
    visualAgeAnchor: z.string().min(1),
    currentIdentity: z.enum(['civilian', 'gang_member', 'police']),
    publicIdentity: z.string().min(1),
    actualIdentitySummary: z.string().min(1),
    roleProfiles: requiredRoleProfilesSchema,
    organizationIds: z.array(z.string().min(1)),
    appearance: z.string().min(1),
    clothing: z.string().min(1),
    equipment: z.array(z.string().min(1)).max(3).default([]),
    personality: z.string().min(1),
    speechStyle: z.string().min(1),
    motivation: z.string().min(1),
    longTermGoal: z.string().min(1),
    values: z.string().min(1),
    attributes: z.object({
      body: z.number().int().min(0).max(100),
      action: z.number().int().min(0).max(100),
      perception: z.number().int().min(0).max(100),
      thinking: z.number().int().min(0).max(100),
      negotiation: z.number().int().min(0).max(100),
      will: z.number().int().min(0).max(100)
    }),
    relationshipSummary: z.string().min(1),
    attitudeTowardPlayer: z.string().min(1),
    interactionScore: z.number().int().min(0).max(100),
    trustTendency: z.string().min(1),
    entanglementSummary: z.string().min(1),
    longTermMemorySummary: z.string().min(1),
    recentInteractionMemory: z.string().min(1),
    statusSummary: z.string().min(1),
    bodyConditionSummary: nullableOptionalNonEmptyStringSchema,
    presence: z.enum(['present', 'nearby', 'mentioned', 'absent']),
    currentPlaceId: nullableOptionalNonEmptyStringSchema,
    currentSceneId: nullableOptionalNonEmptyStringSchema,
    visibility: visibilitySchema,
    importance: z.number().int().min(0).max(100),
    femaleProfile: actorFemaleProfilePatchSchema.optional(),
    keyMemories: openingActorSeedSchema.shape.keyMemories,
    worldpackActorData: openingActorSeedSchema.shape.worldpackActorData
  })
  .strict()
  .superRefine((actor, context) => {
    const isProjected = actor.presence === 'present' || actor.presence === 'nearby';
    if (isProjected && !actor.currentPlaceId) {
      context.addIssue({
        code: 'custom',
        path: ['currentPlaceId'],
        message: 'present/nearby 人物必须填写 currentPlaceId'
      });
    }
    if (isProjected && !actor.currentSceneId) {
      context.addIssue({
        code: 'custom',
        path: ['currentSceneId'],
        message: 'present/nearby 人物必须填写 currentSceneId'
      });
    }
    if (!actor.currentPlaceId && actor.currentSceneId) {
      context.addIssue({
        code: 'custom',
        path: ['currentSceneId'],
        message: '填写 currentSceneId 时必须同时填写匹配的 currentPlaceId'
      });
    }
  });

export const openingCoreActorSchema = openingCoreActorInputSchema.transform((actor) => ({
  ...actor,
  bodyConditionSummary: actor.bodyConditionSummary ?? actor.statusSummary
}));

export const openingBlueprintSchema = z
  .object({
    openingSessionId: z.string().min(1),
    openingFacts: z
      .object({
        placeId: z.string().min(1),
        sceneId: z.string().min(1),
        situationSummary: z.string().min(1),
        centralMatter: z.string().min(1),
        playerDecisionBoundary: z.string().min(1)
      })
      .strict(),
    playerPresentationPatch: z
      .object({
        name: z.string().min(1).optional(),
        englishName: nullableOptionalNonEmptyStringSchema,
        policeNumber: nullableOptionalNonEmptyStringSchema,
        clothing: z.string().min(1),
        equipment: z.array(z.string().min(1)).max(3),
        statusSummary: z.string().min(1)
      })
      .strict(),
    initialActors: z.array(openingCoreActorSchema).min(1),
    dramaPlan: z.unknown().optional(),
    actionIntents: z
      .array(
        z
          .object({
            actionId: z.string().min(1),
            intent: z.string().min(1),
            relatedActorIds: z.array(z.string().min(1)),
            requiredFacts: z.array(z.string().min(1))
          })
          .strict()
      )
      .min(2)
      .max(4)
  })
  .strict();

export type OpeningCoreActor = z.infer<typeof openingCoreActorSchema>;
export type OpeningBlueprint = z.infer<typeof openingBlueprintSchema>;
export type OpeningNonCoreFallbackField =
  | 'englishName'
  | 'aliases'
  | 'callName'
  | 'keyMemories'
  | 'worldpackActorData'
  | 'bodyConditionSummary'
  | 'equipment';

export interface OpeningNonCoreFallback {
  actorId: string;
  field: OpeningNonCoreFallbackField;
}

export function validateOpeningBlueprint(raw: unknown): OpeningBlueprint {
  return openingBlueprintSchema.parse(raw);
}

export function getOpeningNonCoreFallbacks(
  raw: unknown,
  blueprint: OpeningBlueprint
): OpeningNonCoreFallback[] {
  if (!raw || typeof raw !== 'object') return [];
  const rawActors = (raw as { initialActors?: unknown }).initialActors;
  if (!Array.isArray(rawActors)) return [];

  const fallbacks: OpeningNonCoreFallback[] = [];
  blueprint.initialActors.forEach((actor, index) => {
    const rawActor =
      rawActors[index] && typeof rawActors[index] === 'object'
        ? (rawActors[index] as Record<string, unknown>)
        : {};
    const actorId = actor.actorId || `initialActors[${index}]`;
    if (!Object.hasOwn(rawActor, 'englishName') || rawActor.englishName === null) {
      fallbacks.push({ actorId, field: 'englishName' });
    }
    if (!Object.hasOwn(rawActor, 'aliases') || rawActor.aliases === null) {
      fallbacks.push({ actorId, field: 'aliases' });
    }
    if (!Object.hasOwn(rawActor, 'callName') || rawActor.callName === null) {
      fallbacks.push({ actorId, field: 'callName' });
    }
    if (!Object.hasOwn(rawActor, 'keyMemories')) {
      fallbacks.push({ actorId, field: 'keyMemories' });
    }
    if (!Object.hasOwn(rawActor, 'worldpackActorData')) {
      fallbacks.push({ actorId, field: 'worldpackActorData' });
    }
    if (
      !Object.hasOwn(rawActor, 'bodyConditionSummary') ||
      rawActor.bodyConditionSummary === null
    ) {
      fallbacks.push({ actorId, field: 'bodyConditionSummary' });
    }
    if (!Object.hasOwn(rawActor, 'equipment')) {
      fallbacks.push({ actorId, field: 'equipment' });
    }
  });
  return fallbacks;
}
