import { z } from 'zod';
import { openingNarratorResponseSchema } from './openingSchema';

const legacyPlayerPatchSchema = openingNarratorResponseSchema.shape.playerPatch.unwrap();

const OPENING_PLACEHOLDER_PATTERN = /开局待生成|待生成|待补充|尚未生成/;

function isOpeningPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && OPENING_PLACEHOLDER_PATTERN.test(value);
}

export const completeOpeningEconomySchema = legacyPlayerPatchSchema.shape.economy
  .unwrap()
  .superRefine((economy, context) => {
    const requiredFields = [
      'cashOnHand',
      'bankBalance',
      'monthlyPressure',
      'financeSummary'
    ] as const;

    requiredFields.forEach((field) => {
      if (economy[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: '开局必须生成完整经济状态。'
        });
      }
    });

    if (isOpeningPlaceholder(economy.financeSummary)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['financeSummary'],
        message: '开局经济摘要不能保留待生成占位。'
      });
    }
  });

export const completeOpeningHomeBaseSchema = legacyPlayerPatchSchema.shape.homeBase
  .unwrap()
  .superRefine((homeBase, context) => {
    const requiredTextFields = [
      'placeId',
      'placeName',
      'regionId',
      'housingType',
      'summary',
      'householdSummary'
    ] as const;

    requiredTextFields.forEach((field) => {
      const value = homeBase[field];
      if (
        isOpeningPlaceholder(value) ||
        (field === 'placeId' && /^(?:place_|home_)?unknown$/i.test(value)) ||
        (field === 'regionId' && /^(?:region_)?unknown$/i.test(value))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: '开局必须生成具体住所，不能保留未知或待生成占位。'
        });
      }
    });
  });

export const openingPlayerStatePatchSchema = z
  .object({
    vitals: legacyPlayerPatchSchema.shape.vitals.optional(),
    economy: completeOpeningEconomySchema,
    reputation: legacyPlayerPatchSchema.shape.reputation.optional(),
    reputationByCircle: legacyPlayerPatchSchema.shape.reputationByCircle.optional(),
    homeBase: completeOpeningHomeBaseSchema,
    longTermMemorySummary: legacyPlayerPatchSchema.shape.longTermMemorySummary.optional(),
    recentInteractionMemory: legacyPlayerPatchSchema.shape.recentInteractionMemory.optional()
  })
  .strict();

export const openingInitializationSchema = z
  .object({
    openingSessionId: z.string().min(1),
    narrativeText: z.string().min(1),
    presentationHints: openingNarratorResponseSchema.shape.presentationHints,
    suggestedActions: z
      .array(
        z
          .object({
            actionId: z.string().min(1),
            text: z.string().min(1)
          })
          .strict()
      )
      .min(2)
      .max(4),
    dramaExecutionTrace: z.unknown().optional(),
    playerStatePatch: openingPlayerStatePatchSchema,
    financePatch: openingNarratorResponseSchema.shape.financePatch.optional(),
    memories: openingNarratorResponseSchema.shape.memories.optional(),
    secretFacts: openingNarratorResponseSchema.shape.secretFacts.optional(),
    pressureSeeds: openingNarratorResponseSchema.shape.pressureSeeds.optional(),
    grayLedger: openingNarratorResponseSchema.shape.grayLedger.optional(),
    casePatches: openingNarratorResponseSchema.shape.casePatches.optional(),
    caseEvidencePatches: openingNarratorResponseSchema.shape.caseEvidencePatches.optional(),
    currentMatterPatches: openingNarratorResponseSchema.shape.currentMatterPatches.optional(),
    deferredEventPatches: openingNarratorResponseSchema.shape.deferredEventPatches.optional(),
    assetPatch: openingNarratorResponseSchema.shape.assetPatch.optional()
  })
  .strict();

export type OpeningInitialization = z.infer<typeof openingInitializationSchema>;

export function validateOpeningInitialization(raw: unknown): OpeningInitialization {
  return openingInitializationSchema.parse(raw);
}
