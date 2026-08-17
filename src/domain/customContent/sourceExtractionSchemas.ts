import { z } from 'zod';
import type { CustomLocalExtractionResult } from './assetTypes';
import { customContentSourceSpanSchema } from './contentPackageSchemas';

const boundedText = z.string().trim().min(1).max(8_000);
const shortText = z.string().trim().min(1).max(500);

const extractionNoteSchema = z.strictObject({
  observationId: z.string().trim().min(1),
  summary: boundedText
});

const characterObservationSchema = extractionNoteSchema.extend({
  displayName: shortText,
  aliases: z.array(shortText).max(32)
});

const eventObservationSchema = extractionNoteSchema.extend({
  title: shortText.optional()
});

const informationVisibilitySchema = extractionNoteSchema.extend({
  holder: shortText,
  information: boundedText
});

export const customLocalExtractionResultSchema = z
  .strictObject({
    extractionResultId: z.string().trim().min(1),
    taskId: z.string().trim().min(1),
    unitId: z.string().trim().min(1),
    sourceDocumentId: z.string().trim().min(1),
    sourceStructureId: z.string().trim().min(1),
    chunkId: z.string().trim().min(1),
    sourceSpan: customContentSourceSpanSchema,
    localSummary: boundedText,
    establishedFacts: z.array(extractionNoteSchema).max(128),
    characterObservations: z.array(characterObservationSchema).max(128),
    eventObservations: z.array(eventObservationSchema).max(128),
    informationVisibility: z.array(informationVisibilitySchema).max(128),
    unresolvedContradictions: z.array(extractionNoteSchema).max(128),
    continuation: z.strictObject({
      summary: boundedText,
      openThreads: z.array(boundedText).max(128)
    }),
    apiProfileId: z.string().trim().min(1),
    model: z.string().trim().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    usageSource: z.enum(['provider', 'estimated']),
    estimatedCost: z.number().nonnegative().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .superRefine((result, context) => {
    if (result.sourceSpan.sourceDocumentId !== result.sourceDocumentId) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSpan', 'sourceDocumentId'],
        message: '局部提取结果的 sourceSpan 必须属于同一来源文档。'
      });
    }
    const observationIds = [
      ...result.establishedFacts,
      ...result.characterObservations,
      ...result.eventObservations,
      ...result.informationVisibility,
      ...result.unresolvedContradictions
    ].map((item) => item.observationId);
    if (new Set(observationIds).size !== observationIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['establishedFacts'],
        message: '同一局部提取结果中的 observationId 必须唯一。'
      });
    }
  });

export const generatedLocalExtractionPayloadSchema = z.strictObject({
  localSummary: boundedText,
  establishedFacts: z.array(boundedText).max(128).default([]),
  characterObservations: z
    .array(
      z.strictObject({
        displayName: shortText,
        aliases: z.array(shortText).max(32).default([]),
        summary: boundedText
      })
    )
    .max(128)
    .default([]),
  eventObservations: z
    .array(
      z.strictObject({
        title: shortText.optional(),
        summary: boundedText
      })
    )
    .max(128)
    .default([]),
  informationVisibility: z
    .array(
      z.strictObject({
        holder: shortText,
        information: boundedText,
        summary: boundedText
      })
    )
    .max(128)
    .default([]),
  unresolvedContradictions: z.array(boundedText).max(128).default([]),
  continuation: z.strictObject({
    summary: boundedText,
    openThreads: z.array(boundedText).max(128).default([])
  })
});

export function parseCustomLocalExtractionResult(
  value: unknown
): CustomLocalExtractionResult {
  return customLocalExtractionResultSchema.parse(value);
}
