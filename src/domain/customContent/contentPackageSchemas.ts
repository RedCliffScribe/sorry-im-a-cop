import { z } from 'zod';
import {
  customCharacterTemporalPolicies,
  customContentWorldDeploymentModes
} from './worldAdaptation';

export const customContentPackageKinds = [
  'character',
  'event_group',
  'project',
  'author_backup'
] as const;

export const customContentPackageEntryKinds = [
  'revision_bundle',
  'source_document',
  'source_blob',
  'source_structure',
  'processing_task',
  'processing_unit',
  'processing_units',
  'extraction_results',
  'carry_ledger_entries',
  'aggregation_results',
  'project_draft_result'
] as const;

export const customContentAssetKindSchema = z.enum([
  'character',
  'event_group',
  'content_project'
]);

export const customContentLifecycleSchema = z.strictObject({
  generationStatus: z.enum(['idle', 'processing', 'ready', 'failed']),
  reviewStatus: z.enum(['draft', 'needs_review', 'approved']),
  availabilityStatus: z.enum(['enabled', 'disabled', 'archived'])
});

export const customContentWorldDeploymentSchema = z.strictObject({
  worldpackId: z.string().trim().min(1),
  mode: z.enum(customContentWorldDeploymentModes),
  defaultEnabledForNewGame: z.boolean()
});

export const customContentSourceSpanSchema = z.strictObject({
  sourceDocumentId: z.string().trim().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  chapterId: z.string().trim().min(1).optional(),
  sequence: z.number().int().nonnegative(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/)
});

export const customContentRevisionRefSchema = z.strictObject({
  assetKind: customContentAssetKindSchema,
  assetId: z.string().trim().min(1),
  revision: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/)
});

export const customContentProjectAssetSchema = z.strictObject({
  projectId: z.string().trim().min(1),
  latestRevision: z.number().int().positive(),
  revisionCount: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const customCharacterAssetSchema = z.strictObject({
  characterAssetId: z.string().trim().min(1),
  latestRevision: z.number().int().positive(),
  revisionCount: z.number().int().positive(),
  global: z.boolean(),
  projectIds: z.array(z.string().trim().min(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const customEventGroupAssetSchema = z.strictObject({
  eventGroupId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  latestRevision: z.number().int().positive(),
  revisionCount: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const customContentProjectRevisionSchema = z.strictObject({
  projectId: z.string().trim().min(1),
  revision: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  conversionMode: z.enum([
    'structural_adaptation',
    'character_retention',
    'source_direction_priority'
  ]),
  characterAssetIds: z.array(z.string().trim().min(1)),
  eventGroupIds: z.array(z.string().trim().min(1)),
  deployments: z.array(customContentWorldDeploymentSchema),
  sourceDocumentIds: z.array(z.string().trim().min(1)),
  lifecycle: customContentLifecycleSchema
});

export const customCharacterRevisionSchema = z.strictObject({
  characterAssetId: z.string().trim().min(1),
  revision: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  displayName: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)),
  gender: z.string().trim().min(1),
  profileSummary: z.string().trim().min(1),
  backgroundSummary: z.string().trim().min(1),
  corePersonality: z.array(z.string().trim().min(1)),
  values: z.array(z.string().trim().min(1)),
  coreMotivations: z.array(z.string().trim().min(1)),
  majorRelationships: z.array(
    z.strictObject({
      relationshipId: z.string().trim().min(1),
      targetCharacterAssetId: z.string().trim().min(1).optional(),
      label: z.string().trim().min(1),
      summary: z.string().trim().min(1)
    })
  ),
  sourceProfile: z
    .strictObject({
      temporalAnchor: z
        .strictObject({
          lifeStage: z.string().trim().min(1).optional(),
          exactAge: z.number().int().min(0).max(130).optional(),
          birthDate: z.string().trim().min(1).optional()
        })
        .optional(),
      publicIdentity: z.string().trim().min(1).optional(),
      occupation: z.string().trim().min(1).optional(),
      socialPosition: z.string().trim().min(1).optional(),
      appearance: z.string().trim().min(1).optional(),
      speechStyle: z.string().trim().min(1).optional(),
      longTermGoal: z.string().trim().min(1).optional(),
      usualPlaceHints: z.array(z.string().trim().min(1)),
      contactRoutes: z.array(z.string().trim().min(1))
    })
    .optional(),
  entryMode: z.enum([
    'manual',
    'natural',
    'priority',
    'asap_contact',
    'follow_project'
  ]),
  adaptationPolicy: z.strictObject({
    temporalPolicy: z.enum(customCharacterTemporalPolicies),
    lockedFields: z.array(z.string().trim().min(1)),
    adaptableFields: z.array(z.string().trim().min(1)),
    identityAnchors: z.array(z.string().trim().min(1)).optional(),
    permittedTransformations: z
      .array(z.string().trim().min(1))
      .optional(),
    forbiddenTransformations: z
      .array(z.string().trim().min(1))
      .optional(),
    conflictNotes: z.array(z.string().trim().min(1)).optional()
  }),
  deployments: z.array(customContentWorldDeploymentSchema),
  sourceSpans: z.array(customContentSourceSpanSchema),
  lifecycle: customContentLifecycleSchema
});

const customImportedFactSchema = z.strictObject({
  factId: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  state: z.enum([
    'source_only',
    'established_in_save',
    'invalidated_in_save'
  ]),
  sourceSpans: z.array(customContentSourceSpanSchema)
});

const customEventCharacterUsageSchema = z.strictObject({
  usageId: z.string().trim().min(1),
  roleSlotId: z.string().trim().min(1).optional(),
  characterRef: customContentRevisionRefSchema.optional(),
  usageSummary: z.string().trim().min(1),
  required: z.boolean()
});

const customEventNodeSchema = z.strictObject({
  nodeId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  prerequisites: z.array(z.string()),
  entryConditions: z.array(z.string()),
  blockers: z.array(z.string()),
  characterUsages: z.array(customEventCharacterUsageSchema),
  knowledgeBoundary: z.strictObject({
    knownBy: z.array(z.string().trim().min(1)),
    hiddenFrom: z.array(z.string().trim().min(1)),
    readerOnly: z.boolean()
  }),
  possibleOutcomes: z.array(z.string()),
  downstreamEffects: z.array(z.string())
});

const customEventStageSchema = z.strictObject({
  stageId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  establishedSourceFacts: z.array(customImportedFactSchema),
  continuationSourceFacts: z.array(customImportedFactSchema),
  hardSourceConstraints: z.array(customImportedFactSchema),
  foreshadowingOptions: z.array(z.string()),
  eventNodes: z.array(customEventNodeSchema),
  completionHints: z.array(z.string()),
  nextStageHints: z.array(z.string())
});

export const customEventGroupRevisionSchema = z.strictObject({
  eventGroupId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  revision: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  invariantCore: z.array(z.string()),
  mutableSlots: z.array(z.string()),
  forbiddenAdaptations: z.array(z.string()),
  characterRefs: z.array(customContentRevisionRefSchema),
  roleSlots: z.array(
    z.strictObject({
      roleSlotId: z.string().trim().min(1),
      title: z.string().trim().min(1),
      summary: z.string().trim().min(1),
      bindingMode: z.enum([
        'fixed_character',
        'current_player',
        'project_or_runtime',
        'global_allowed'
      ]),
      fixedCharacterRef: customContentRevisionRefSchema.optional(),
      requirements: z.array(z.string())
    })
  ),
  stages: z.array(customEventStageSchema),
  entryMode: z.enum(['manual', 'natural', 'priority', 'asap']),
  reusePolicy: z.enum(['save_single_use', 'repeatable_motif']),
  deployments: z.array(customContentWorldDeploymentSchema).optional(),
  inheritProjectDeployments: z.boolean(),
  sourceSpans: z.array(customContentSourceSpanSchema),
  lifecycle: customContentLifecycleSchema
});

export const customContentDependencySchema = z.strictObject({
  dependencyId: z.string().trim().min(1),
  owner: customContentRevisionRefSchema,
  target: customContentRevisionRefSchema,
  kind: z.enum(['required', 'optional', 'role_slot_fallback'])
});

export const customContentRevisionBundleSchema = z.discriminatedUnion(
  'assetKind',
  [
    z.strictObject({
      assetKind: z.literal('content_project'),
      sourceRevisionRef: customContentRevisionRefSchema,
      asset: customContentProjectAssetSchema,
      revision: customContentProjectRevisionSchema,
      dependencies: z.array(customContentDependencySchema)
    }),
    z.strictObject({
      assetKind: z.literal('character'),
      sourceRevisionRef: customContentRevisionRefSchema,
      asset: customCharacterAssetSchema,
      revision: customCharacterRevisionSchema,
      dependencies: z.array(customContentDependencySchema)
    }),
    z.strictObject({
      assetKind: z.literal('event_group'),
      sourceRevisionRef: customContentRevisionRefSchema,
      asset: customEventGroupAssetSchema,
      revision: customEventGroupRevisionSchema,
      dependencies: z.array(customContentDependencySchema)
    })
  ]
);

export const customSourceDocumentSchema = z.strictObject({
  sourceDocumentId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  fileName: z.string().trim().min(1),
  sourceFormat: z.enum(['txt', 'markdown', 'epub']),
  mediaType: z.string().trim().min(1),
  byteLength: z.number().int().nonnegative(),
  characterCount: z.number().int().nonnegative().optional(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const customSourceProcessingChunkingConfigSchema = z
  .strictObject({
    targetTokenCount: z.number().int().positive(),
    maxTokenCount: z.number().int().positive(),
    overlapTokenCount: z.number().int().nonnegative()
  })
  .superRefine((chunking, context) => {
    if (chunking.maxTokenCount < chunking.targetTokenCount) {
      context.addIssue({
        code: 'custom',
        path: ['maxTokenCount'],
        message: 'maxTokenCount 不能小于 targetTokenCount。'
      });
    }
    if (chunking.overlapTokenCount >= chunking.targetTokenCount) {
      context.addIssue({
        code: 'custom',
        path: ['overlapTokenCount'],
        message: 'overlapTokenCount 必须小于 targetTokenCount。'
      });
    }
  });

const customSourceProcessingTaskConfigSchema = z.strictObject({
  sourceFormat: z.enum(['txt', 'markdown', 'epub']),
  encoding: z.enum(['auto', 'utf-8', 'utf-16le', 'utf-16be']),
  parserVersion: z.string().trim().min(1).max(64),
  canonicalTextChecksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  chunking: customSourceProcessingChunkingConfigSchema.optional()
});

const customAiProcessingPricingSchema = z.strictObject({
  currency: z.literal('USD'),
  inputPerMillionTokens: z.number().nonnegative(),
  outputPerMillionTokens: z.number().nonnegative()
});

const customAiProcessingTaskConfigSchema = z.strictObject({
  sourceStructureId: z.string().trim().min(1),
  promptVersion: z.enum([
    'phase9-local-extraction-v1',
    'phase9-chapter-aggregation-v1',
    'phase9-stage-aggregation-v1',
    'phase9-story-arc-aggregation-v1',
    'phase9-project-build-v1'
  ]),
  maxOutputTokensPerUnit: z.number().int().positive().max(32_768),
  authorizedTotalTokens: z.number().int().positive(),
  authorizedAt: z.string().datetime(),
  pricing: customAiProcessingPricingSchema.optional(),
  inputTaskIds: z.array(z.string().trim().min(1)).max(128).optional(),
  aggregationLevel: z.enum(['chapter', 'stage', 'arc']).optional(),
  conversionMode: z
    .enum([
      'structural_adaptation',
      'character_retention',
      'source_direction_priority'
    ])
    .optional(),
  maxLowerResultsPerUnit: z.number().int().positive().max(128).optional()
});

export const customContentProcessingTaskSchema = z.strictObject({
  taskId: z.string().trim().min(1),
  taskKind: z.enum([
    'parse_source',
    'chunk_source',
    'extract_local',
    'aggregate_chapter',
    'aggregate_stage',
    'aggregate_arc',
    'build_project'
  ]),
  projectId: z.string().trim().min(1).optional(),
  sourceDocumentId: z.string().trim().min(1).optional(),
  status: z.enum([
    'queued',
    'running',
    'paused',
    'failed',
    'completed',
    'cancelled'
  ]),
  apiProfileId: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  concurrency: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  maxRetries: z.number().int().nonnegative(),
  completedUnitCount: z.number().int().nonnegative(),
  totalUnitCount: z.number().int().nonnegative(),
  estimatedInputTokens: z.number().int().nonnegative(),
  consumedInputTokens: z.number().int().nonnegative(),
  consumedOutputTokens: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative().optional(),
  consumedCost: z.number().nonnegative().optional(),
  costLimit: z.number().nonnegative().optional(),
  cursor: z.string().optional(),
  inputChecksum: z.string().trim().min(1).optional(),
  sourceProcessing: customSourceProcessingTaskConfigSchema.optional(),
  aiProcessing: customAiProcessingTaskConfigSchema.optional(),
  stateRevision: z.number().int().nonnegative().optional(),
  pauseReason: z
    .enum([
      'user',
      'token_limit',
      'cost_limit',
      'rate_limit',
      'page_interrupted'
    ])
    .optional(),
  lastError: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const customContentProcessingUnitSchema = z.strictObject({
  unitId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
  sequence: z.number().int().nonnegative(),
  status: z.enum([
    'queued',
    'running',
    'paused',
    'failed',
    'completed',
    'cancelled'
  ]),
  sourceSpan: customContentSourceSpanSchema.optional(),
  inputRefs: z.array(z.string().trim().min(1)).max(128).optional(),
  retryCount: z.number().int().nonnegative(),
  resultRef: z.string().optional(),
  lastError: z.string().optional(),
  updatedAt: z.string().datetime()
});

export const customContentPackageManifestEntrySchema = z.strictObject({
  path: z.string().trim().min(1),
  entryKind: z.enum(customContentPackageEntryKinds),
  mediaType: z.string().trim().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
  assetKind: customContentAssetKindSchema.optional(),
  assetId: z.string().trim().min(1).optional(),
  revision: z.number().int().positive().optional(),
  sourceDocumentId: z.string().trim().min(1).optional(),
  sourceStructureId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  unitId: z.string().trim().min(1).optional()
});

export const customContentPackageManifestSchema = z.strictObject({
  format: z.literal('sorry-im-a-cop-v2-custom-content'),
  schemaVersion: z.literal(1),
  packageKind: z.enum(customContentPackageKinds),
  packageId: z.string().trim().min(1),
  exportedAt: z.string().datetime(),
  rootRevisionRefs: z.array(customContentRevisionRefSchema).min(1),
  dependencies: z.array(customContentRevisionRefSchema),
  entries: z.array(customContentPackageManifestEntrySchema).min(1),
  includesSourceText: z.boolean()
});

export const customEventGroupJsonPackageSchema = z.strictObject({
  format: z.literal('sorry-im-a-cop-v2-custom-content'),
  schemaVersion: z.literal(1),
  packageKind: z.literal('event_group'),
  packageId: z.string().trim().min(1),
  exportedAt: z.string().datetime(),
  rootRevisionRefs: z.array(customContentRevisionRefSchema).min(1),
  dependencies: z.array(customContentRevisionRefSchema),
  bundles: z.array(customContentRevisionBundleSchema).min(1),
  includesSourceText: z.literal(false)
});
