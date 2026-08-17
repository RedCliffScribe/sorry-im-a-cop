import { z } from 'zod';
import type {
  CustomSourceAggregationResult,
  CustomSourceCarryLedgerEntry
} from './assetTypes';
import { customContentSourceSpanSchema } from './contentPackageSchemas';

const boundedText = z.string().trim().min(1).max(8_000);
const shortText = z.string().trim().min(1).max(500);
const id = z.string().trim().min(1);

const noteSchema = z.strictObject({
  observationId: id,
  summary: boundedText
});

const visibilitySchema = noteSchema.extend({
  holder: shortText,
  information: boundedText
});

const continuationSchema = z.strictObject({
  summary: boundedText,
  openThreads: z.array(boundedText).max(128)
});

export const customSourceCarryLedgerEntrySchema = z
  .strictObject({
    carryLedgerEntryId: id,
    extractionTaskId: id,
    extractionResultId: id,
    unitId: id,
    sourceDocumentId: id,
    sourceStructureId: id,
    chunkId: id,
    sequence: z.number().int().nonnegative(),
    sourceSpan: customContentSourceSpanSchema,
    continuation: continuationSchema,
    characterObservationIds: z.array(id).max(128),
    eventObservationIds: z.array(id).max(128),
    unresolvedContradictionObservationIds: z.array(id).max(128),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .superRefine((entry, context) => {
    if (entry.sourceSpan.sourceDocumentId !== entry.sourceDocumentId) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSpan', 'sourceDocumentId'],
        message: '承接账本的 sourceSpan 必须属于同一来源文档。'
      });
    }
    for (const [key, values] of Object.entries({
      characterObservationIds: entry.characterObservationIds,
      eventObservationIds: entry.eventObservationIds,
      unresolvedContradictionObservationIds:
        entry.unresolvedContradictionObservationIds
    })) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: '承接账本中的观察引用必须唯一。'
        });
      }
    }
  });

const mergeSuggestionSchema = z.strictObject({
  suggestionId: id,
  displayName: shortText,
  aliases: z.array(shortText).max(64),
  sourceObservationIds: z.array(id).max(256),
  rationale: boundedText
});

const storyArcSchema = z.strictObject({
  storyArcId: id,
  title: shortText,
  summary: boundedText,
  sourceResultRefs: z.array(id).min(1).max(128),
  sourceObservationIds: z.array(id).max(512),
  characterMergeSuggestionIds: z.array(id).max(128),
  invariantCore: z.array(boundedText).min(1).max(128),
  mutableSlots: z.array(boundedText).max(128),
  forbiddenAdaptations: z.array(boundedText).max(128),
  contentGaps: z.array(boundedText).max(128),
  continuationHints: z.array(boundedText).max(128)
});

export const customSourceAggregationResultSchema = z
  .strictObject({
    aggregationResultId: id,
    taskId: id,
    unitId: id,
    aggregationLevel: z.enum(['chapter', 'stage', 'arc']),
    sourceDocumentId: id,
    sourceStructureId: id,
    sourceSpans: z.array(customContentSourceSpanSchema).min(1).max(128),
    lowerResultRefs: z.array(id).min(1).max(128),
    chapterIds: z.array(id).min(1).max(128),
    summary: boundedText,
    establishedFacts: z.array(noteSchema).max(256),
    characterMergeSuggestions: z.array(mergeSuggestionSchema).max(128),
    eventThreads: z.array(noteSchema).max(256),
    informationVisibility: z.array(visibilitySchema).max(256),
    unresolvedContradictions: z.array(noteSchema).max(256),
    contentGaps: z.array(noteSchema).max(256),
    continuation: continuationSchema,
    storyArcs: z.array(storyArcSchema).min(1).max(64).optional(),
    reviewStatus: z.enum(['needs_review', 'approved', 'rejected']),
    apiProfileId: id,
    model: id,
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    usageSource: z.enum(['provider', 'estimated']),
    estimatedCost: z.number().nonnegative().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .superRefine((result, context) => {
    if (
      result.sourceSpans.some(
        (span) => span.sourceDocumentId !== result.sourceDocumentId
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSpans'],
        message: '聚合结果的全部 sourceSpan 必须属于同一来源文档。'
      });
    }
    const observationIds = [
      ...result.establishedFacts,
      ...result.eventThreads,
      ...result.informationVisibility,
      ...result.unresolvedContradictions,
      ...result.contentGaps
    ].map((item) => item.observationId);
    const suggestionIds = result.characterMergeSuggestions.map(
      (item) => item.suggestionId
    );
    if (new Set(observationIds).size !== observationIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['establishedFacts'],
        message: '聚合结果中的 observationId 必须唯一。'
      });
    }
    if (new Set(suggestionIds).size !== suggestionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['characterMergeSuggestions'],
        message: '聚合结果中的 suggestionId 必须唯一。'
      });
    }
    if (result.aggregationLevel === 'arc' && !result.storyArcs?.length) {
      context.addIssue({
        code: 'custom',
        path: ['storyArcs'],
        message: '故事弧聚合结果必须至少包含一个故事弧。'
      });
    }
    if (result.aggregationLevel !== 'arc' && result.storyArcs !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['storyArcs'],
        message: '章节和阶段聚合结果不能提前包含故事弧。'
      });
    }
    const storyArcIds = result.storyArcs?.map((arc) => arc.storyArcId) ?? [];
    if (new Set(storyArcIds).size !== storyArcIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['storyArcs'],
        message: '故事弧结果中的 storyArcId 必须唯一。'
      });
    }
    for (const [index, arc] of (result.storyArcs ?? []).entries()) {
      for (const [key, values] of Object.entries({
        sourceResultRefs: arc.sourceResultRefs,
        sourceObservationIds: arc.sourceObservationIds,
        characterMergeSuggestionIds: arc.characterMergeSuggestionIds
      })) {
        if (new Set(values).size !== values.length) {
          context.addIssue({
            code: 'custom',
            path: ['storyArcs', index, key],
            message: '故事弧中的来源引用必须唯一。'
          });
        }
      }
      if (
        arc.sourceResultRefs.some(
          (ref) => !result.lowerResultRefs.includes(ref)
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['storyArcs', index, 'sourceResultRefs'],
          message: '故事弧只能引用当前聚合结果声明的下级结果。'
        });
      }
    }
  });

export const generatedSourceAggregationPayloadSchema = z.strictObject({
  summary: boundedText,
  establishedFacts: z.array(boundedText).max(256).default([]),
  characterMergeSuggestions: z
    .array(
      z.strictObject({
        displayName: shortText,
        aliases: z.array(shortText).max(64).default([]),
        sourceObservationIds: z.array(id).max(256).default([]),
        rationale: boundedText
      })
    )
    .max(128)
    .default([]),
  eventThreads: z.array(boundedText).max(256).default([]),
  informationVisibility: z
    .array(
      z.strictObject({
        holder: shortText,
        information: boundedText,
        summary: boundedText
      })
    )
    .max(256)
    .default([]),
  unresolvedContradictions: z.array(boundedText).max(256).default([]),
  contentGaps: z.array(boundedText).max(256).default([]),
  continuation: z.strictObject({
    summary: boundedText,
    openThreads: z.array(boundedText).max(128).default([])
  })
});

export const generatedSourceStoryArcAggregationPayloadSchema =
  generatedSourceAggregationPayloadSchema.extend({
    storyArcs: z
      .array(
        z.strictObject({
          title: shortText,
          summary: boundedText,
          sourceResultRefs: z.array(id).min(1).max(128),
          sourceObservationIds: z.array(id).max(512).default([]),
          characterMergeSuggestionIds: z.array(id).max(128).default([]),
          invariantCore: z.array(boundedText).min(1).max(128),
          mutableSlots: z.array(boundedText).max(128).default([]),
          forbiddenAdaptations: z.array(boundedText).max(128).default([]),
          contentGaps: z.array(boundedText).max(128).default([]),
          continuationHints: z.array(boundedText).max(128).default([])
        })
      )
      .min(1)
      .max(64)
  });

export function parseCustomSourceCarryLedgerEntry(
  value: unknown
): CustomSourceCarryLedgerEntry {
  return customSourceCarryLedgerEntrySchema.parse(value);
}

export function parseCustomSourceAggregationResult(
  value: unknown
): CustomSourceAggregationResult {
  return customSourceAggregationResultSchema.parse(value);
}
