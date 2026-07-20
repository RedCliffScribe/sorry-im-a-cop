import { z } from 'zod';
import type { StoryDiagnosticIssue } from '../runtime/types';
import {
  actorOrganizationRelationPatchSchema,
  actorMemorySuggestionSchema,
  actorPatchSchema,
  assetItemSchema,
  assetRemoveItemSchema,
  caseEvidencePatchSchema,
  casePatchSchema,
  combatEventPatchSchema,
  citySituationTrackPatchSchema,
  currentMatterPatchSchema,
  deferredEventPatchSchema,
  financeCashflowPatchSchema,
  financeLedgerEntryPatchSchema,
  financePatchScalarSchema,
  grayLedgerEntryPatchSchema,
  grayLedgerPatchSchema,
  identityContextPatchSchema,
  judgementCheckPatchSchema,
  locationPatchSchema,
  sanitizeGrayNetworkPatches,
  memorySuggestionSchema,
  narratorResponseSchema,
  newsIssuePatchSchema,
  organizationPatchSchema,
  placePatchSchema,
  playerPatchSchema,
  pregnancyResolutionPatchSchema,
  pregnancyRiskPatchSchema,
  reputationPatchSchema,
  relationshipThreadPatchSchema,
  scenePatchSchema,
  secretFactPatchSchema,
  signalPatchSchema,
  timePatchSchema,
  traitGainSuggestionSchema,
  traitProgressSuggestionSchema,
  weatherPatchSchema,
  type NarratorResponse
} from './schema';

const responseEnvelopeSchema = z
  .object({
    writebackVersion: z.string().default('1.0'),
    narrativeText: z.string().min(1),
    turnSummary: z.string().trim().min(1),
    suggestedActions: z.array(z.string()).catch([]),
    timePatch: z.unknown().optional(),
    writeback: z.unknown().default({})
  })
  .passthrough();

const actorPatchWithoutOrganizationRelationsSchema = actorPatchSchema.omit({
  organizationRelations: true
});

type SafeSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: z.ZodError };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addIssues(warnings: StoryDiagnosticIssue[], prefix: Array<string | number>, error: z.ZodError) {
  for (const issue of error.issues) {
    warnings.push({
      path: [...prefix, ...issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment)))],
      message: issue.message,
      code: issue.code
    });
  }
}

function parseOptional<T>(
  schema: SafeSchema<T>,
  value: unknown,
  path: Array<string | number>,
  warnings: StoryDiagnosticIssue[]
): T | undefined {
  if (value === undefined) return undefined;
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  addIssues(warnings, path, parsed.error);
  return undefined;
}

function parseArrayItems<T>(
  schema: SafeSchema<T>,
  value: unknown,
  path: Array<string | number>,
  warnings: StoryDiagnosticIssue[]
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push({
      path,
      message: 'Expected an array; omitted this writeback module.',
      code: 'invalid_type'
    });
    return [];
  }

  const items: T[] = [];
  value.forEach((item, index) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) {
      items.push(parsed.data);
      return;
    }
    addIssues(warnings, [...path, index], parsed.error);
  });
  return items;
}

function sanitizeAssetPatch(rawAssetPatch: unknown, warnings: StoryDiagnosticIssue[]) {
  if (rawAssetPatch === undefined) return undefined;
  if (!isRecord(rawAssetPatch)) {
    warnings.push({
      path: ['writeback', 'assetPatch'],
      message: 'Expected an assetPatch object; omitted this writeback module.',
      code: 'invalid_type'
    });
    return undefined;
  }

  return {
    upsertItems: parseArrayItems(assetItemSchema, rawAssetPatch.upsertItems, ['writeback', 'assetPatch', 'upsertItems'], warnings),
    removeItems: parseArrayItems(assetRemoveItemSchema, rawAssetPatch.removeItems, ['writeback', 'assetPatch', 'removeItems'], warnings)
  };
}

function sanitizeFinancePatch(rawFinancePatch: unknown, warnings: StoryDiagnosticIssue[]) {
  if (rawFinancePatch === undefined) return undefined;
  if (!isRecord(rawFinancePatch)) {
    warnings.push({
      path: ['writeback', 'financePatch'],
      message: 'Expected a financePatch object; omitted this writeback module.',
      code: 'invalid_type'
    });
    return undefined;
  }

  return {
    ...(parseOptional(financePatchScalarSchema, rawFinancePatch, ['writeback', 'financePatch'], warnings) ?? {}),
    upsertCashflows: parseArrayItems(
      financeCashflowPatchSchema,
      rawFinancePatch.upsertCashflows,
      ['writeback', 'financePatch', 'upsertCashflows'],
      warnings
    ),
    removeCashflowItemIds: parseArrayItems(
      z.string().min(1),
      rawFinancePatch.removeCashflowItemIds,
      ['writeback', 'financePatch', 'removeCashflowItemIds'],
      warnings
    ),
    ledgerEntries: parseArrayItems(
      financeLedgerEntryPatchSchema,
      rawFinancePatch.ledgerEntries,
      ['writeback', 'financePatch', 'ledgerEntries'],
      warnings
    )
  };
}

function sanitizeGrayLedgerPatch(rawGrayLedgerPatch: unknown, warnings: StoryDiagnosticIssue[]) {
  if (rawGrayLedgerPatch === undefined) return undefined;
  if (!isRecord(rawGrayLedgerPatch)) {
    warnings.push({
      path: ['writeback', 'grayLedgerPatch'],
      message: 'Expected a grayLedgerPatch object; omitted this writeback module.',
      code: 'invalid_type'
    });
    return undefined;
  }

  return {
    ...grayLedgerPatchSchema.parse({}),
    entries: parseArrayItems(grayLedgerEntryPatchSchema, rawGrayLedgerPatch.entries, ['writeback', 'grayLedgerPatch', 'entries'], warnings)
  };
}

function sanitizeActorPatches(rawActorPatches: unknown, warnings: StoryDiagnosticIssue[]) {
  if (rawActorPatches === undefined) return [];
  if (!Array.isArray(rawActorPatches)) {
    warnings.push({
      path: ['writeback', 'actorPatches'],
      message: 'Expected an array; omitted this writeback module.',
      code: 'invalid_type'
    });
    return [];
  }

  const actorPatches: z.infer<typeof actorPatchSchema>[] = [];
  rawActorPatches.forEach((item, index) => {
    const rawRelationItems = isRecord(item) ? item.organizationRelations : undefined;
    const actorPatchCandidate = isRecord(item) ? { ...item, organizationRelations: undefined } : item;
    const parsed = actorPatchWithoutOrganizationRelationsSchema.safeParse(actorPatchCandidate);
    if (!parsed.success) {
      addIssues(warnings, ['writeback', 'actorPatches', index], parsed.error);
      return;
    }

    actorPatches.push({
      ...parsed.data,
      organizationRelations: parseArrayItems(
        actorOrganizationRelationPatchSchema,
        rawRelationItems,
        ['writeback', 'actorPatches', index, 'organizationRelations'],
        warnings
      )
    });
  });
  return actorPatches;
}

function sanitizePlayerPatch(rawPlayerPatch: unknown, warnings: StoryDiagnosticIssue[]) {
  if (rawPlayerPatch === undefined) return undefined;
  if (!isRecord(rawPlayerPatch)) {
    warnings.push({
      path: ['writeback', 'playerPatch'],
      message: 'Expected a playerPatch object; omitted this writeback module.',
      code: 'invalid_type'
    });
    return undefined;
  }

  const economy = parseOptional(
    playerPatchSchema.shape.economy,
    rawPlayerPatch.economy,
    ['writeback', 'playerPatch', 'economy'],
    warnings
  );
  const homeBase = parseOptional(
    playerPatchSchema.shape.homeBase,
    rawPlayerPatch.homeBase,
    ['writeback', 'playerPatch', 'homeBase'],
    warnings
  );
  const clothing = parseOptional(
    playerPatchSchema.shape.clothing,
    rawPlayerPatch.clothing,
    ['writeback', 'playerPatch', 'clothing'],
    warnings
  );
  const equipment = parseOptional(
    playerPatchSchema.shape.equipment,
    rawPlayerPatch.equipment,
    ['writeback', 'playerPatch', 'equipment'],
    warnings
  );
  const reputation = parseOptional(
    playerPatchSchema.shape.reputation,
    rawPlayerPatch.reputation,
    ['writeback', 'playerPatch', 'reputation'],
    warnings
  );
  const policePanel = parseOptional(
    playerPatchSchema.shape.policePanel,
    rawPlayerPatch.policePanel,
    ['writeback', 'playerPatch', 'policePanel'],
    warnings
  );
  const progression = parseOptional(
    playerPatchSchema.shape.progression,
    rawPlayerPatch.progression,
    ['writeback', 'playerPatch', 'progression'],
    warnings
  );

  return {
    ...(economy !== undefined ? { economy } : {}),
    ...(homeBase !== undefined ? { homeBase } : {}),
    ...(clothing !== undefined ? { clothing } : {}),
    ...(equipment !== undefined ? { equipment } : {}),
    ...(reputation !== undefined ? { reputation } : {}),
    ...(policePanel !== undefined ? { policePanel } : {}),
    ...(progression !== undefined ? { progression } : {}),
    reputationPatches: parseArrayItems(
      reputationPatchSchema,
      rawPlayerPatch.reputationPatches,
      ['writeback', 'playerPatch', 'reputationPatches'],
      warnings
    )
  };
}

function sanitizeWriteback(rawWriteback: unknown, warnings: StoryDiagnosticIssue[]) {
  if (!isRecord(rawWriteback)) {
    warnings.push({
      path: ['writeback'],
      message: 'Expected a writeback object; using an empty writeback.',
      code: 'invalid_type'
    });
    return {};
  }

  return {
    actorPatches: sanitizeActorPatches(rawWriteback.actorPatches, warnings),
    playerPatch: sanitizePlayerPatch(rawWriteback.playerPatch, warnings),
    identityContextPatch: parseOptional(
      identityContextPatchSchema,
      rawWriteback.identityContextPatch,
      ['writeback', 'identityContextPatch'],
      warnings
    ),
    secretFactPatches: parseArrayItems(
      secretFactPatchSchema,
      rawWriteback.secretFactPatches,
      ['writeback', 'secretFactPatches'],
      warnings
    ),
    locationPatch: parseOptional(locationPatchSchema, rawWriteback.locationPatch, ['writeback', 'locationPatch'], warnings),
    weatherPatch: parseOptional(weatherPatchSchema, rawWriteback.weatherPatch, ['writeback', 'weatherPatch'], warnings),
    placePatches: parseArrayItems(placePatchSchema, rawWriteback.placePatches, ['writeback', 'placePatches'], warnings),
    scenePatches: parseArrayItems(scenePatchSchema, rawWriteback.scenePatches, ['writeback', 'scenePatches'], warnings),
    casePatches: parseArrayItems(casePatchSchema, rawWriteback.casePatches, ['writeback', 'casePatches'], warnings),
    caseEvidencePatches: parseArrayItems(
      caseEvidencePatchSchema,
      rawWriteback.caseEvidencePatches,
      ['writeback', 'caseEvidencePatches'],
      warnings
    ),
    deferredEventPatches: parseArrayItems(
      deferredEventPatchSchema,
      rawWriteback.deferredEventPatches,
      ['writeback', 'deferredEventPatches'],
      warnings
    ),
    currentMatterPatches: parseArrayItems(
      currentMatterPatchSchema,
      rawWriteback.currentMatterPatches,
      ['writeback', 'currentMatterPatches'],
      warnings
    ),
    signalPatches: parseArrayItems(signalPatchSchema, rawWriteback.signalPatches, ['writeback', 'signalPatches'], warnings),
    newsIssuePatches: parseArrayItems(
      newsIssuePatchSchema,
      rawWriteback.newsIssuePatches,
      ['writeback', 'newsIssuePatches'],
      warnings
    ),
    organizationPatches: parseArrayItems(
      organizationPatchSchema,
      rawWriteback.organizationPatches,
      ['writeback', 'organizationPatches'],
      warnings
    ),
    citySituationTrackPatches: parseArrayItems(
      citySituationTrackPatchSchema,
      rawWriteback.citySituationTrackPatches,
      ['writeback', 'citySituationTrackPatches'],
      warnings
    ),
    judgementCheckPatches: parseArrayItems(
      judgementCheckPatchSchema,
      rawWriteback.judgementCheckPatches,
      ['writeback', 'judgementCheckPatches'],
      warnings
    ),
    combatEventPatches: parseArrayItems(
      combatEventPatchSchema,
      rawWriteback.combatEventPatches,
      ['writeback', 'combatEventPatches'],
      warnings
    ),
    relationshipThreadPatches: parseArrayItems(
      relationshipThreadPatchSchema,
      rawWriteback.relationshipThreadPatches,
      ['writeback', 'relationshipThreadPatches'],
      warnings
    ),
    pregnancyRiskPatches: parseArrayItems(
      pregnancyRiskPatchSchema,
      rawWriteback.pregnancyRiskPatches,
      ['writeback', 'pregnancyRiskPatches'],
      warnings
    ),
    pregnancyResolutionPatches: parseArrayItems(
      pregnancyResolutionPatchSchema,
      rawWriteback.pregnancyResolutionPatches,
      ['writeback', 'pregnancyResolutionPatches'],
      warnings
    ),
    grayNetworkPatches:
      rawWriteback.grayNetworkPatches === undefined
        ? []
        : sanitizeGrayNetworkPatches(rawWriteback.grayNetworkPatches, warnings),
    assetPatch: sanitizeAssetPatch(rawWriteback.assetPatch, warnings),
    financePatch: sanitizeFinancePatch(rawWriteback.financePatch, warnings),
    grayLedgerPatch: sanitizeGrayLedgerPatch(rawWriteback.grayLedgerPatch, warnings),
    memories: parseArrayItems(memorySuggestionSchema, rawWriteback.memories, ['writeback', 'memories'], warnings),
    actorMemories: parseArrayItems(actorMemorySuggestionSchema, rawWriteback.actorMemories, ['writeback', 'actorMemories'], warnings),
    traitProgress: parseArrayItems(traitProgressSuggestionSchema, rawWriteback.traitProgress, ['writeback', 'traitProgress'], warnings),
    traitGains: parseArrayItems(traitGainSuggestionSchema, rawWriteback.traitGains, ['writeback', 'traitGains'], warnings)
  };
}

export function validateNarratorResponse(value: unknown): NarratorResponse {
  const strict = narratorResponseSchema.safeParse(value);
  if (strict.success) return strict.data;

  const envelope = responseEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    throw strict.error;
  }

  const warnings: StoryDiagnosticIssue[] = [];
  const timePatch = parseOptional(timePatchSchema, envelope.data.timePatch, ['timePatch'], warnings);
  const writeback = sanitizeWriteback(envelope.data.writeback, warnings);
  const sanitized = narratorResponseSchema.parse({
    writebackVersion: envelope.data.writebackVersion,
    narrativeText: envelope.data.narrativeText,
    turnSummary: envelope.data.turnSummary,
    suggestedActions: envelope.data.suggestedActions,
    ...(timePatch ? { timePatch } : {}),
    writeback
  }) as NarratorResponse;

  if (warnings.length > 0) {
    sanitized.validationWarnings = warnings.map((warning) => ({
      path: warning.path,
      message: warning.message,
      code: warning.code ?? 'writeback_warning'
    }));
  }
  return sanitized;
}
