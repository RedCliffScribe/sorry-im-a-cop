import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);
const gameTimeSchema = z
  .object({
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59)
  })
  .passthrough();

const adaptationStatusSchema = z.enum([
  'ready',
  'needs_review',
  'incompatible'
]);

const boundRevisionSchema = z
  .object({
    bindingId: nonEmptyText,
    assetKind: z.enum(['character', 'event_group', 'content_project']),
    assetId: nonEmptyText,
    revision: z.number().int().positive(),
    checksum: nonEmptyText,
    payload: z.unknown()
  })
  .passthrough();

const projectAdaptationSchema = z
  .object({
    adaptationId: nonEmptyText,
    projectId: nonEmptyText,
    projectRevision: z.number().int().positive(),
    worldpackId: nonEmptyText,
    worldpackDescriptorVersion: z.number().int().nonnegative(),
    scenarioId: nonEmptyText.optional(),
    anchorTime: gameTimeSchema,
    chronologyMapping: z.array(nonEmptyText),
    characterAgeRelations: z.array(nonEmptyText),
    placeMappings: z.record(z.string(), z.string()),
    organizationMappings: z.record(z.string(), z.string()),
    technologyMappings: z.record(z.string(), z.string()),
    culturalAndLegalAdaptation: z.array(nonEmptyText),
    hardWorldConstraints: z.array(nonEmptyText),
    status: adaptationStatusSchema
  })
  .passthrough();

const characterAdaptationSchema = z
  .object({
    adaptationId: nonEmptyText,
    characterAssetId: nonEmptyText,
    sourceRevision: z.number().int().positive(),
    projectAdaptationId: nonEmptyText.optional(),
    worldpackId: nonEmptyText,
    anchorTime: gameTimeSchema,
    runtimeActorId: nonEmptyText,
    adaptedBirthDate: nonEmptyText.optional(),
    adaptedAgeAtAnchor: z.number().int().min(0).max(130).optional(),
    adaptedPublicIdentity: nonEmptyText,
    adaptedOccupation: nonEmptyText,
    adaptedSocialPosition: nonEmptyText,
    adaptedOrganizationRefs: z.array(nonEmptyText),
    adaptedPlaceRefs: z.array(nonEmptyText),
    adaptedBackgroundSummary: nonEmptyText,
    adaptedContactRoutes: z.array(nonEmptyText),
    status: adaptationStatusSchema
  })
  .passthrough();

const characterAdaptationIntentSchema = z
  .object({
    intentId: nonEmptyText,
    bindingId: nonEmptyText,
    instanceId: nonEmptyText,
    reason: z.enum(['current_stage', 'manual']),
    status: z.enum([
      'pending',
      'ready',
      'needs_review',
      'incompatible'
    ]),
    requestedStageId: nonEmptyText.optional(),
    requestedTurn: z.number().int().nonnegative(),
    adaptationId: nonEmptyText.optional()
  })
  .passthrough();

const eventAdaptationSchema = z
  .object({
    adaptationId: nonEmptyText,
    eventGroupId: nonEmptyText,
    sourceRevision: z.number().int().positive(),
    projectAdaptationId: nonEmptyText,
    worldpackId: nonEmptyText,
    adaptedSummary: nonEmptyText,
    adaptedInvariantCore: z.array(nonEmptyText),
    adaptedMutableElements: z.array(nonEmptyText),
    adaptedRoleBindings: z.array(nonEmptyText),
    adaptedEntryRoutes: z.array(nonEmptyText),
    technologySubstitutions: z.array(nonEmptyText),
    institutionSubstitutions: z.array(nonEmptyText),
    placeSubstitutions: z.array(nonEmptyText),
    unresolvedConflicts: z.array(nonEmptyText),
    status: adaptationStatusSchema
  })
  .passthrough();

const characterIntentSchema = z
  .object({
    intentId: nonEmptyText,
    bindingId: nonEmptyText,
    mode: z.enum(['manual', 'natural', 'priority', 'asap_contact']),
    status: z.enum([
      'queued',
      'seeking_anchor',
      'known_of',
      'contactable',
      'met',
      'established',
      'paused',
      'cancelled'
    ]),
    statusBeforePause: z
      .enum([
        'queued',
        'seeking_anchor',
        'known_of',
        'contactable',
        'met',
        'established',
        'cancelled'
      ])
      .optional(),
    targetOutcome: z.enum(['contactable', 'met']),
    priorityOrder: z.number().int().positive().optional(),
    lastPlannedTurn: z.number().int().nonnegative().optional(),
    lastConfirmedExposureTurn: z.number().int().nonnegative().optional()
  })
  .passthrough();

const eventIntentSchema = z
  .object({
    intentId: nonEmptyText,
    instanceId: nonEmptyText,
    mode: z.enum(['manual', 'natural', 'priority', 'asap']),
    status: z.enum([
      'queued',
      'seeking_anchor',
      'anchored',
      'engaged',
      'paused',
      'cancelled'
    ]),
    statusBeforePause: z
      .enum(['queued', 'seeking_anchor', 'anchored', 'engaged', 'cancelled'])
      .optional(),
    priorityOrder: z.number().int().positive().optional(),
    lastPlannedTurn: z.number().int().nonnegative().optional(),
    lastConfirmedExposureTurn: z.number().int().nonnegative().optional()
  })
  .passthrough();

const runtimeBindingSchema = z
  .object({
    characterAssetId: nonEmptyText,
    sourceRevision: z.number().int().positive(),
    adaptationId: nonEmptyText,
    actorId: nonEmptyText
  })
  .passthrough();

const runtimeRefSchema = z
  .object({
    kind: nonEmptyText,
    id: nonEmptyText
  })
  .passthrough();

const factStateSchema = z.enum([
  'source_only',
  'established_in_save',
  'invalidated_in_save'
]);

const progressRecordSchema = z
  .object({
    turnCounter: z.number().int().nonnegative(),
    stageId: nonEmptyText,
    usedNodeIds: z.array(nonEmptyText),
    decision: z.enum(['stay', 'advance', 'complete', 'diverge']),
    nextStageId: nonEmptyText.optional(),
    supportingWritebackRefs: z.array(runtimeRefSchema),
    factStateChanges: z.array(
      z
        .object({
          factId: nonEmptyText,
          state: z.enum(['established_in_save', 'invalidated_in_save']),
          supportingWritebackRefs: z.array(runtimeRefSchema)
        })
        .passthrough()
    )
  })
  .passthrough();

const eventInstanceSchema = z
  .object({
    instanceId: nonEmptyText,
    eventGroupId: nonEmptyText,
    eventGroupRevision: z.number().int().positive(),
    projectId: nonEmptyText,
    projectRevision: z.number().int().positive(),
    adaptationId: nonEmptyText,
    status: z.enum([
      'latent',
      'seeking_anchor',
      'anchored',
      'active',
      'paused',
      'diverged',
      'completed',
      'abandoned'
    ]),
    statusBeforePause: z
      .enum([
        'latent',
        'seeking_anchor',
        'anchored',
        'active',
        'diverged',
        'completed',
        'abandoned'
      ])
      .optional(),
    currentStageId: nonEmptyText.optional(),
    projectCharacterBindings: z.record(z.string(), z.string()),
    roleBindings: z.record(z.string(), z.string()),
    usedStageIds: z.array(nonEmptyText),
    usedNodeIds: z.array(nonEmptyText),
    factStateOverrides: z.record(z.string(), factStateSchema).optional(),
    progressHistory: z.array(progressRecordSchema).optional(),
    resultingWritebackRefs: z.array(runtimeRefSchema),
    primaryRuntimeArcRef: runtimeRefSchema.optional()
  })
  .passthrough();

const priorityItemSchema = z
  .object({
    priorityItemId: nonEmptyText,
    targetKind: z.enum(['character', 'event_group']),
    targetId: nonEmptyText,
    projectId: nonEmptyText.optional(),
    status: z.enum(['active', 'paused', 'completed', 'cancelled']),
    statusBeforePause: z
      .enum(['active', 'completed', 'cancelled'])
      .optional(),
    createdAt: nonEmptyText,
    updatedAt: nonEmptyText
  })
  .passthrough();

const diagnosticSchema = z
  .object({
    diagnosticId: nonEmptyText,
    code: nonEmptyText,
    severity: z.enum(['info', 'warning', 'blocking']),
    summary: nonEmptyText,
    relatedAssetId: nonEmptyText.optional(),
    createdAt: nonEmptyText
  })
  .passthrough();

export const runtimeCustomContentStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectBindings: z.array(boundRevisionSchema),
    characterBindings: z.array(boundRevisionSchema),
    eventGroupBindings: z.array(boundRevisionSchema),
    projectAdaptations: z.record(z.string(), projectAdaptationSchema),
    characterAdaptations: z.record(z.string(), characterAdaptationSchema),
    characterAdaptationIntents: z
      .array(characterAdaptationIntentSchema)
      .default([]),
    eventGroupAdaptations: z.record(z.string(), eventAdaptationSchema),
    characterEntryIntents: z.array(characterIntentSchema),
    eventEntryIntents: z.array(eventIntentSchema),
    characterRuntimeBindings: z.array(runtimeBindingSchema),
    eventInstances: z.array(eventInstanceSchema),
    priorityItems: z
      .array(priorityItemSchema)
      .refine(
        (items) =>
          items.filter((item) => item.status === 'active').length <= 3,
        'A save cannot contain more than three active custom-content priority items.'
      ),
    recentDiagnostics: z.array(diagnosticSchema)
  })
  .passthrough();
