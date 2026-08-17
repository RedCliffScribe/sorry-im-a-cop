import { z } from 'zod';
import type { StoryDiagnosticIssue } from '../runtime/types';
import {
  casePatchSchema,
  citySituationTrackPatchSchema,
  currentMatterPatchSchema,
  deferredEventPatchSchema,
  newsIssuePatchSchema,
  relationshipMilestonePatchSchema,
  signalPatchSchema,
  triadOrganizationStatePatchSchema,
  visibilitySchema,
  writebackGameTimeSchema
} from '../writeback/schema';

export const backgroundSourceRefsSchema = z.object({
  actorIds: z.array(z.string().min(1)).default([]),
  caseIds: z.array(z.string().min(1)).default([]),
  placeIds: z.array(z.string().min(1)).default([]),
  organizationIds: z.array(z.string().min(1)).default([]),
  relationshipThreadIds: z.array(z.string().min(1)).default([]),
  cityTrackIds: z.array(z.string().min(1)).default([]),
  deferredEventIds: z.array(z.string().min(1)).default([]),
  outcomeIds: z.array(z.string().min(1)).default([])
});

const evolutionVisibilitySchema = z.enum(['hidden', 'rumor', 'public', 'player_known']);
const outcomeKindSchema = z.enum(['progress', 'no_result', 'blocked', 'failed', 'handoff', 'abandoned']);
const actionKindSchema = z.enum(['work', 'relationship', 'case', 'organization', 'movement', 'personal', 'risk', 'other']);
const trackStatusSchema = z.enum(['planned', 'active', 'blocked']);
const patchMetadata = {
  reviewKey: z.string().min(1),
  reason: z.string().min(1),
  sourceRefs: backgroundSourceRefsSchema
};

export const npcEvolutionTrackPatchSchema = z.object({
  ...patchMetadata,
  operation: z.enum(['create', 'update', 'settle', 'cancel']),
  trackId: z.string().min(1),
  actorId: z.string().min(1),
  status: trackStatusSchema.optional(),
  actionKind: actionKindSchema.optional(),
  objective: z.string().min(1).max(240).optional(),
  currentAction: z.string().min(1).max(320).optional(),
  currentStatus: z.string().min(1).max(180).optional(),
  currentPlaceId: z.string().min(1).optional(),
  startedAt: writebackGameTimeSchema.optional(),
  expectedEndAt: writebackGameTimeSchema.optional(),
  nextReviewAt: writebackGameTimeSchema.optional(),
  relatedActorIds: z.array(z.string().min(1)).max(8).optional(),
  relatedOrganizationIds: z.array(z.string().min(1)).max(6).optional(),
  relatedPlaceIds: z.array(z.string().min(1)).max(6).optional(),
  relatedCaseIds: z.array(z.string().min(1)).max(3).optional(),
  relatedRelationshipThreadIds: z.array(z.string().min(1)).max(4).optional(),
  relatedCityTrackIds: z.array(z.string().min(1)).max(4).optional(),
  relatedDeferredEventIds: z.array(z.string().min(1)).max(4).optional(),
  outcomeKind: outcomeKindSchema.optional(),
  outcomeSummary: z.string().min(1).max(360).optional(),
  consequence: z.string().min(1).max(260).optional(),
  persistToMemory: z.boolean().optional(),
  visibility: evolutionVisibilitySchema.optional()
});

export const organizationEvolutionPatchSchema = z
  .object({
    ...patchMetadata,
    operation: z.enum(['activate', 'update', 'settle']),
    trackId: z.string().min(1),
    organizationId: z.string().min(1),
    status: trackStatusSchema.optional(),
    objective: z.string().min(1).max(240).optional(),
    currentAction: z.string().min(1).max(320).optional(),
    currentStatus: z.string().min(1).max(180).optional(),
    startedAt: writebackGameTimeSchema.optional(),
    expectedEndAt: writebackGameTimeSchema.optional(),
    nextReviewAt: writebackGameTimeSchema.optional(),
    relatedActorIds: z.array(z.string().min(1)).max(6).optional(),
    relatedPlaceIds: z.array(z.string().min(1)).max(6).optional(),
    relatedCaseIds: z.array(z.string().min(1)).max(3).optional(),
    relatedCityTrackIds: z.array(z.string().min(1)).max(4).optional(),
    outcomeKind: outcomeKindSchema.optional(),
    outcomeSummary: z.string().min(1).max(360).optional(),
    consequence: z.string().min(1).max(260).optional(),
    visibility: evolutionVisibilitySchema.optional(),
    currentState: z.string().min(1).max(360).optional(),
    pressureSummary: z.string().min(1).max(300).optional(),
    stanceTowardPlayer: z.string().min(1).max(260).optional(),
    triadState: triadOrganizationStatePatchSchema.optional()
  })
  .strict();

export const backgroundCitySituationTrackPatchSchema = citySituationTrackPatchSchema.extend(patchMetadata);

export const backgroundCasePatchSchema = casePatchSchema.extend({
  ...patchMetadata,
  actorId: z.string().min(1),
  outcomeKind: outcomeKindSchema
});

export const backgroundRelationshipPatchSchema = z.object({
  ...patchMetadata,
  threadId: z.string().min(1),
  actorId: z.string().min(1),
  summary: z.string().min(1).max(360).optional(),
  status: z.enum(['active', 'dormant', 'strained', 'ended']).optional(),
  intimacySummary: z.string().min(1).max(260).optional(),
  trustSummary: z.string().min(1).max(260).optional(),
  conflictSummary: z.string().min(1).max(260).optional(),
  promiseSummary: z.string().min(1).max(260).optional(),
  riskSummary: z.string().min(1).max(260).optional(),
  currentPull: z.string().min(1).max(260).optional(),
  nextNaturalBeatHint: z.string().min(1).max(260).optional(),
  heartbeatCooldownUntil: writebackGameTimeSchema.optional(),
  milestoneUpdates: z.array(relationshipMilestonePatchSchema).max(2).default([]),
  visibility: visibilitySchema.optional()
});

export const backgroundActorPatchSchema = z.object({
  ...patchMetadata,
  actorId: z.string().min(1),
  currentPlaceId: z.string().min(1).optional(),
  statusSummary: z.string().min(1).max(240).optional()
});

export const backgroundDeferredEventPatchSchema = deferredEventPatchSchema.extend({
  ...patchMetadata,
  actorId: z.string().min(1)
});

export const backgroundActorMemoryPatchSchema = z.object({
  ...patchMetadata,
  actorId: z.string().min(1),
  text: z.string().min(1).max(520),
  importance: z.number().int().min(0).max(100).default(55),
  visibility: visibilitySchema.default('hidden'),
  certainty: z.enum(['fact', 'claim', 'rumor', 'disputed', 'unknown']).default('fact'),
  gameTime: writebackGameTimeSchema.optional(),
  periodStart: writebackGameTimeSchema.optional(),
  periodEnd: writebackGameTimeSchema.optional(),
  relatedCaseIds: z.array(z.string().min(1)).max(3).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).max(4).default([]),
  relatedOrganizationIds: z.array(z.string().min(1)).max(4).default([])
});

export const evolutionOutcomeRecordPatchSchema = z.object({
  ...patchMetadata,
  outcomeId: z.string().min(1),
  occurredAt: writebackGameTimeSchema.optional(),
  sourceKind: z.enum(['npc', 'organization', 'city', 'case', 'relationship', 'deferred_event']),
  sourceId: z.string().min(1),
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(420),
  consequence: z.string().min(1).max(300).optional(),
  relatedActorIds: z.array(z.string().min(1)).max(8).default([]),
  relatedOrganizationIds: z.array(z.string().min(1)).max(6).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).max(6).default([]),
  relatedCaseIds: z.array(z.string().min(1)).max(4).default([]),
  relatedRelationshipThreadIds: z.array(z.string().min(1)).max(4).default([]),
  visibility: evolutionVisibilitySchema,
  significance: z.enum(['routine', 'notable', 'historic']).default('routine')
});

export const evolutionChronicleEntryPatchSchema = z.object({
  ...patchMetadata,
  entryId: z.string().min(1),
  occurredAt: writebackGameTimeSchema.optional(),
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(360),
  longTermImpact: z.string().min(1).max(420),
  sourceOutcomeIds: z.array(z.string().min(1)).min(1).max(4),
  relatedActorIds: z.array(z.string().min(1)).max(8).default([]),
  relatedOrganizationIds: z.array(z.string().min(1)).max(6).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).max(6).default([]),
  relatedCaseIds: z.array(z.string().min(1)).max(4).default([]),
  visibility: evolutionVisibilitySchema
});

export const backgroundCurrentMatterPatchSchema = currentMatterPatchSchema.extend(patchMetadata);
export const backgroundSignalPatchSchema = signalPatchSchema.extend(patchMetadata);
export const backgroundNewsIssuePatchSchema = newsIssuePatchSchema.extend(patchMetadata);

const arraySchemas = {
  npcTrackPatches: npcEvolutionTrackPatchSchema,
  organizationEvolutionPatches: organizationEvolutionPatchSchema,
  citySituationTrackPatches: backgroundCitySituationTrackPatchSchema,
  casePatches: backgroundCasePatchSchema,
  backgroundRelationshipPatches: backgroundRelationshipPatchSchema,
  backgroundActorPatches: backgroundActorPatchSchema,
  deferredEventPatches: backgroundDeferredEventPatchSchema,
  actorMemories: backgroundActorMemoryPatchSchema,
  outcomeRecords: evolutionOutcomeRecordPatchSchema,
  chronicleEntries: evolutionChronicleEntryPatchSchema,
  currentMatterPatches: backgroundCurrentMatterPatchSchema,
  signalPatches: backgroundSignalPatchSchema,
  newsIssuePatches: backgroundNewsIssuePatchSchema
} as const;

type SchemaMap = typeof arraySchemas;

export type BackgroundEvolutionWriteback = {
  [K in keyof SchemaMap]: Array<z.infer<SchemaMap[K]>>;
};

export interface ParsedBackgroundEvolutionWriteback {
  writeback: BackgroundEvolutionWriteback;
  diagnostics: StoryDiagnosticIssue[];
  droppedItemCount: number;
}

export class BackgroundEvolutionProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackgroundEvolutionProtocolError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addZodDiagnostics(
  diagnostics: StoryDiagnosticIssue[],
  prefix: Array<string | number>,
  error: z.ZodError
): void {
  for (const issue of error.issues) {
    diagnostics.push({
      path: [...prefix, ...issue.path.map((part) => (typeof part === 'number' ? part : String(part)))],
      code: issue.code,
      message: issue.message
    });
  }
}

export function parseBackgroundEvolutionWriteback(value: unknown): ParsedBackgroundEvolutionWriteback {
  if (!isRecord(value)) {
    throw new BackgroundEvolutionProtocolError('后台演化 API 没有返回 JSON object。');
  }
  const source = isRecord(value.writeback) ? value.writeback : value;
  const diagnostics: StoryDiagnosticIssue[] = [];
  let droppedItemCount = 0;
  const writeback = {} as BackgroundEvolutionWriteback;

  for (const [key, schema] of Object.entries(arraySchemas) as Array<[
    keyof SchemaMap,
    SchemaMap[keyof SchemaMap]
  ]>) {
    const rawItems = source[key];
    if (rawItems === undefined) {
      (writeback[key] as unknown[]) = [];
      continue;
    }
    if (!Array.isArray(rawItems)) {
      diagnostics.push({
        path: ['backgroundEvolution', key],
        code: 'invalid_type',
        message: `${key} 必须是数组；该字段已丢弃。`
      });
      droppedItemCount += 1;
      (writeback[key] as unknown[]) = [];
      continue;
    }

    const parsedItems: unknown[] = [];
    rawItems.forEach((item, index) => {
      const parsed = schema.safeParse(item);
      if (parsed.success) {
        parsedItems.push(parsed.data);
      } else {
        droppedItemCount += 1;
        addZodDiagnostics(diagnostics, ['backgroundEvolution', key, index], parsed.error);
      }
    });
    (writeback[key] as unknown[]) = parsedItems;
  }

  return { writeback, diagnostics, droppedItemCount };
}
