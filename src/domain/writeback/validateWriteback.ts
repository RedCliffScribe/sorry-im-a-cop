import { z } from 'zod';
import { isSpendableCashAsset } from '../assets/assetWritebackPolicy';
import {
  getRawAssetPatch,
  getRawAssetUpsertItems,
  isVehicleAssetIntent,
  reconcileVehicleAssetIntent
} from '../assets/assetWritebackIntent';
import {
  getRawJudgementCheckPatches,
  judgementCheckIntentSchema
} from '../conflict/judgementIntent';
import { getRawCombatEventPatches } from '../conflict/combatEventIntent';
import { getRawCasePatches } from '../cases/caseWritebackIntent';
import {
  getRawRelationshipThreadPatches,
  normalizeRelationshipEvidenceRefs
} from '../relationship/relationshipEvidence';
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
  financePatchScalarFieldSchemas,
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
  playerCivilianRoleProfilePatchSchema,
  playerPoliceRoleProfilePatchSchema,
  playerPatchSchema,
  playerReputationPatchSchema,
  pregnancyLifecycleReviewSchema,
  playerVitalsReviewSchema,
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
    playerVitalsReview: z.unknown().optional(),
    pregnancyLifecycleReview: z.unknown().optional(),
    timePatch: z.unknown().optional(),
    writeback: z.unknown().default({})
  })
  .passthrough();

const nestedWritebackKeys = [
  'actorPatches',
  'playerPatch',
  'identityContextPatch',
  'policeRoleProfilePatch',
  'civilianRoleProfilePatch',
  'secretFactPatches',
  'locationPatch',
  'weatherPatch',
  'placePatches',
  'scenePatches',
  'casePatches',
  'caseEvidencePatches',
  'deferredEventPatches',
  'currentMatterPatches',
  'signalPatches',
  'newsIssuePatches',
  'organizationPatches',
  'citySituationTrackPatches',
  'judgementCheckPatches',
  'combatEventPatches',
  'relationshipThreadPatches',
  'pregnancyRiskPatches',
  'pregnancyResolutionPatches',
  'grayNetworkPatches',
  'assetPatch',
  'financePatch',
  'grayLedgerPatch',
  'memories',
  'actorMemories',
  'traitProgress',
  'traitGains'
] as const;

const actorPatchWithoutOrganizationRelationsSchema = actorPatchSchema.omit({
  organizationRelations: true
});

type SafeSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: z.ZodError };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMisplacedWriteback(value: unknown): {
  value: unknown;
  warnings: StoryDiagnosticIssue[];
} {
  if (!isRecord(value)) return { value, warnings: [] };

  const nested = isRecord(value.writeback) ? value.writeback : {};
  const promoted: Record<string, unknown> = {};
  for (const key of nestedWritebackKeys) {
    if (nested[key] === undefined && value[key] !== undefined) {
      promoted[key] = value[key];
    }
  }
  const promotedKeys = Object.keys(promoted);
  if (promotedKeys.length === 0) return { value, warnings: [] };

  return {
    value: {
      ...value,
      writeback: {
        ...nested,
        ...promoted
      }
    },
    warnings: promotedKeys.map((key) => ({
      path: ['writeback', key],
      code: 'misplaced_writeback_promoted',
      message: `主剧情把 ${key} 放在了顶层；兼容层已将其恢复到 writeback.${key} 后再校验。`
    }))
  };
}

function appendValidationWarnings(
  response: NarratorResponse,
  warnings: StoryDiagnosticIssue[]
): NarratorResponse {
  if (warnings.length === 0) return response;
  return {
    ...response,
    validationWarnings: [
      ...(response.validationWarnings ?? []),
      ...warnings.map((warning) => ({
        path: warning.path,
        message: warning.message,
        code: warning.code ?? 'writeback_warning'
      }))
    ]
  };
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

function parseCurrentMatterPatches(
  value: unknown,
  path: Array<string | number>,
  warnings: StoryDiagnosticIssue[]
): z.infer<typeof currentMatterPatchSchema>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push({
      path,
      message: 'Expected an array; omitted this writeback module.',
      code: 'invalid_type'
    });
    return [];
  }

  const items: z.infer<typeof currentMatterPatchSchema>[] = [];
  value.forEach((item, index) => {
    const itemPath = [...path, index];
    const candidate = isRecord(item) && item.visibility === 'player_known'
      ? { ...item, visibility: 'known' }
      : item;
    if (candidate !== item) {
      warnings.push({
        path: [...itemPath, 'visibility'],
        code: 'current_matter_visibility_alias_normalized',
        message: 'currentMatterPatches.visibility 使用了无歧义别名 player_known；本地已规范为 known 后继续严格校验。'
      });
    }
    const parsed = currentMatterPatchSchema.safeParse(candidate);
    if (parsed.success) {
      items.push(parsed.data);
      return;
    }
    addIssues(warnings, itemPath, parsed.error);
  });
  return items;
}

function rawValueAtPath(value: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  return path.reduce<unknown>((current, segment) => {
    if ((!isRecord(current) && !Array.isArray(current)) || current === null) {
      return undefined;
    }
    return (current as Record<PropertyKey, unknown>)[segment];
  }, value);
}

function describeRawType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function sanitizeAssetUpsertItems(
  value: unknown,
  warnings: StoryDiagnosticIssue[]
): NonNullable<NarratorResponse['writeback']['assetPatch']>['upsertItems'] {
  const path = ['writeback', 'assetPatch', 'upsertItems'] as const;
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push({
      path: [...path],
      message: `Expected an array; preserved the raw asset candidate for recovery (rawType=${describeRawType(value)}).`,
      code: 'invalid_type'
    });
    return [];
  }

  const items: NonNullable<NarratorResponse['writeback']['assetPatch']>['upsertItems'] = [];
  value.forEach((item, index) => {
    const parsed = assetItemSchema.safeParse(item);
    if (parsed.success) {
      items.push(parsed.data);
      return;
    }

    if (isVehicleAssetIntent(item)) {
      const reconciled = reconcileVehicleAssetIntent({
        rawMain: item,
        path: [...path, index]
      });
      warnings.push(...reconciled.diagnostics);
      if (reconciled.item) {
        items.push(reconciled.item);
        warnings.push({
          path: [...path, index],
          code: 'asset_repair_reconciled_from_raw',
          message: `车辆 "${reconciled.item.itemId}" 的确定性字段漂移已在本地归一化，并重新通过最终严格 Schema。`
        });
        return;
      }
    }

    for (const issue of parsed.error.issues) {
      warnings.push({
        path: [...path, index, ...issue.path.map((segment) => String(segment))],
        message: `${issue.message}; rawType=${describeRawType(rawValueAtPath(item, issue.path))}`,
        code: issue.code
      });
    }
  });
  return items;
}

function sanitizeJudgementCheckPatches(
  value: unknown,
  warnings: StoryDiagnosticIssue[]
): NarratorResponse['writeback']['judgementCheckPatches'] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push({
      path: ['writeback', 'judgementCheckPatches'],
      message: 'Expected an array; preserved the raw judgement value for intent recovery.',
      code: 'invalid_type'
    });
    return [];
  }

  const legacyPatches: NarratorResponse['writeback']['judgementCheckPatches'] = [];
  value.forEach((item, index) => {
    const intent = judgementCheckIntentSchema.safeParse(item);
    if (!intent.success) {
      addIssues(
        warnings,
        ['writeback', 'judgementCheckPatches', index],
        intent.error
      );
      return;
    }
    if (intent.data.rulesetVersion === 'v1.1-local-d100') {
      return;
    }
    const legacy = judgementCheckPatchSchema.safeParse(item);
    if (legacy.success) {
      legacyPatches.push(legacy.data);
      return;
    }
    addIssues(
      warnings,
      ['writeback', 'judgementCheckPatches', index],
      legacy.error
    );
  });
  return legacyPatches;
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
    upsertItems: sanitizeAssetUpsertItems(rawAssetPatch.upsertItems, warnings),
    removeItems: parseArrayItems(assetRemoveItemSchema, rawAssetPatch.removeItems, ['writeback', 'assetPatch', 'removeItems'], warnings),
    equippedItemIds: parseOptional(
      z.array(z.string().min(1)).max(3),
      rawAssetPatch.equippedItemIds,
      ['writeback', 'assetPatch', 'equippedItemIds'],
      warnings
    )
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

  const normalizedScalars: Record<string, unknown> = {
    ...rawFinancePatch,
    cashDelta: rawFinancePatch.cashDelta ?? rawFinancePatch.moneyDelta,
    cashSet: rawFinancePatch.cashSet ?? rawFinancePatch.moneySet
  };
  const scalarPatch: Record<string, unknown> = {};
  for (const key of Object.keys(financePatchScalarFieldSchemas) as Array<keyof typeof financePatchScalarFieldSchemas>) {
    const parsed = parseOptional<unknown>(
      financePatchScalarFieldSchemas[key] as SafeSchema<unknown>,
      normalizedScalars[key],
      ['writeback', 'financePatch', key],
      warnings
    );
    if (parsed !== undefined) scalarPatch[key] = parsed;
  }

  return {
    ...scalarPatch,
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
  const reputation = sanitizePlayerReputationPatch(rawPlayerPatch.reputation, warnings);
  const policePanel = parseOptional(
    playerPatchSchema.shape.policePanel,
    rawPlayerPatch.policePanel,
    ['writeback', 'playerPatch', 'policePanel'],
    warnings
  );
  const progression = sanitizeProgressionPatch(rawPlayerPatch.progression, warnings);

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

function sanitizePlayerReputationPatch(
  rawReputation: unknown,
  warnings: StoryDiagnosticIssue[]
): NonNullable<NonNullable<NarratorResponse['writeback']['playerPatch']>['reputation']> | undefined {
  if (rawReputation === undefined) return undefined;
  const path = ['writeback', 'playerPatch', 'reputation'] as const;
  if (!isRecord(rawReputation)) {
    warnings.push({
      path: [...path],
      message: 'Expected a reputation object; omitted this writeback module.',
      code: 'invalid_type'
    });
    return undefined;
  }

  const shape = playerReputationPatchSchema.shape;
  const notorietyDelta = parseOptional(shape.notorietyDelta, rawReputation.notorietyDelta, [...path, 'notorietyDelta'], warnings);
  const notorietySet = parseOptional(shape.notorietySet, rawReputation.notorietySet, [...path, 'notorietySet'], warnings);
  const overallReputationDelta = parseOptional(
    shape.overallReputationDelta,
    rawReputation.overallReputationDelta,
    [...path, 'overallReputationDelta'],
    warnings
  );
  const overallReputationSet = parseOptional(
    shape.overallReputationSet,
    rawReputation.overallReputationSet,
    [...path, 'overallReputationSet'],
    warnings
  );
  const summary = parseOptional(shape.summary, rawReputation.summary, [...path, 'summary'], warnings);
  const reason = parseOptional(shape.reason, rawReputation.reason, [...path, 'reason'], warnings);
  const circlePatches = parseArrayItems(
    reputationPatchSchema,
    rawReputation.circlePatches,
    [...path, 'circlePatches'],
    warnings
  );

  return {
    ...(notorietyDelta !== undefined ? { notorietyDelta } : {}),
    ...(notorietySet !== undefined ? { notorietySet } : {}),
    ...(overallReputationDelta !== undefined ? { overallReputationDelta } : {}),
    ...(overallReputationSet !== undefined ? { overallReputationSet } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(reason !== undefined ? { reason } : {}),
    circlePatches
  };
}

function sanitizeProgressionPatch(
  rawProgression: unknown,
  warnings: StoryDiagnosticIssue[]
): NonNullable<NarratorResponse['writeback']['playerPatch']>['progression'] {
  if (rawProgression === undefined) return undefined;
  const path = ['writeback', 'playerPatch', 'progression'] as const;
  if (!isRecord(rawProgression)) {
    warnings.push({
      path: [...path],
      message: 'Model progression suggestion was not an object and was ignored; local experience settlement remains active.',
      code: 'progression_model_proposal_ignored'
    });
    return undefined;
  }

  const rawGain = rawProgression.experienceGain;
  const normalizedGain =
    typeof rawGain === 'number'
      ? rawGain
      : typeof rawGain === 'string' && /^\s*\d+\s*$/.test(rawGain)
        ? Number(rawGain.trim())
        : Number.NaN;
  if (
    !Number.isFinite(normalizedGain) ||
    !Number.isInteger(normalizedGain) ||
    normalizedGain < 0
  ) {
    warnings.push({
      path: [...path, 'experienceGain'],
      message: 'Model experience suggestion was not a non-negative integer and was ignored; local experience settlement remains active.',
      code: 'progression_model_proposal_ignored'
    });
    return undefined;
  }

  const experienceGain = Math.min(1_000, normalizedGain);
  if (normalizedGain > 1_000) {
    warnings.push({
      path: [...path, 'experienceGain'],
      message: 'Model experience suggestion exceeded the proposal limit and was normalized before local settlement.',
      code: 'progression_model_proposal_normalized'
    });
  } else if (typeof rawGain === 'string') {
    warnings.push({
      path: [...path, 'experienceGain'],
      message: 'Model experience suggestion was converted from an integer string before local settlement.',
      code: 'progression_model_proposal_normalized'
    });
  }

  const reason =
    typeof rawProgression.reason === 'string' && rawProgression.reason.trim()
      ? rawProgression.reason.trim()
      : undefined;
  return {
    experienceGain,
    ...(reason ? { reason } : {})
  };
}

function sanitizeRelationshipThreadPatches(
  value: unknown,
  warnings: StoryDiagnosticIssue[]
): NarratorResponse['writeback']['relationshipThreadPatches'] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push({
      path: ['writeback', 'relationshipThreadPatches'],
      message: 'Expected an array; preserved the raw relationship value for intent recovery.',
      code: 'invalid_type'
    });
    return [];
  }

  const patches: NarratorResponse['writeback']['relationshipThreadPatches'] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      warnings.push({
        path: ['writeback', 'relationshipThreadPatches', index],
        message: 'Relationship thread patch was not an object; preserved it only as raw recovery evidence.',
        code: 'invalid_type'
      });
      return;
    }

    const normalizedEvidence = normalizeRelationshipEvidenceRefs(
      item.evidenceRefs,
      ['writeback', 'relationshipThreadPatches', index, 'evidenceRefs']
    );
    warnings.push(...normalizedEvidence.diagnostics);
    const candidate = {
      ...item,
      ...(item.evidenceRefs !== undefined ? { evidenceRefs: normalizedEvidence.evidenceRefs } : {})
    };
    const parsed = relationshipThreadPatchSchema.safeParse(candidate);
    if (parsed.success) {
      patches.push(parsed.data);
      return;
    }
    addIssues(warnings, ['writeback', 'relationshipThreadPatches', index], parsed.error);
  });
  return patches;
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
    policeRoleProfilePatch: parseOptional(
      playerPoliceRoleProfilePatchSchema,
      rawWriteback.policeRoleProfilePatch,
      ['writeback', 'policeRoleProfilePatch'],
      warnings
    ),
    civilianRoleProfilePatch: parseOptional(
      playerCivilianRoleProfilePatchSchema,
      rawWriteback.civilianRoleProfilePatch,
      ['writeback', 'civilianRoleProfilePatch'],
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
    currentMatterPatches: parseCurrentMatterPatches(
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
    judgementCheckPatches: sanitizeJudgementCheckPatches(
      rawWriteback.judgementCheckPatches,
      warnings
    ),
    combatEventPatches: parseArrayItems(
      combatEventPatchSchema,
      rawWriteback.combatEventPatches,
      ['writeback', 'combatEventPatches'],
      warnings
    ),
    relationshipThreadPatches: sanitizeRelationshipThreadPatches(
      rawWriteback.relationshipThreadPatches,
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

function enforceAssetWritebackPolicy(response: NarratorResponse): NarratorResponse {
  const assetPatch = response.writeback.assetPatch;
  if (!assetPatch?.upsertItems.length) return response;

  const rejectedItems = assetPatch.upsertItems.filter(isSpendableCashAsset);
  if (rejectedItems.length === 0) return response;
  const rejectedIds = new Set(rejectedItems.map((item) => item.itemId));

  return {
    ...response,
    writeback: {
      ...response.writeback,
      assetPatch: {
        ...assetPatch,
        upsertItems: assetPatch.upsertItems.filter((item) => !rejectedIds.has(item.itemId)),
        ...(assetPatch.equippedItemIds
          ? { equippedItemIds: assetPatch.equippedItemIds.filter((itemId) => !rejectedIds.has(itemId)) }
          : {})
      }
    },
    validationWarnings: [
      ...(response.validationWarnings ?? []),
      ...rejectedItems.map((item) => ({
        path: ['writeback', 'assetPatch', 'upsertItems', item.itemId],
        message: `Rejected spendable cash asset "${item.name}"; cash must be written through financePatch.`,
        code: 'cash_asset_rejected'
      }))
    ]
  };
}

export function validateNarratorResponse(value: unknown): NarratorResponse {
  const normalized = normalizeMisplacedWriteback(value);
  const rawAssetPatch = getRawAssetPatch(normalized.value);
  const rawAssetUpsertItems = getRawAssetUpsertItems(normalized.value);
  const rawJudgementCheckPatches = getRawJudgementCheckPatches(normalized.value);
  const rawCombatEventPatches = getRawCombatEventPatches(normalized.value);
  const rawCasePatches = getRawCasePatches(normalized.value);
  const rawRelationshipThreadPatches = getRawRelationshipThreadPatches(normalized.value);
  const strict = narratorResponseSchema.safeParse(normalized.value);
  if (strict.success) {
    const policyChecked = enforceAssetWritebackPolicy(
      appendValidationWarnings(strict.data, normalized.warnings)
    );
    if (policyChecked.suggestedActions.length > 0) {
      return {
        ...policyChecked,
        rawAssetPatch,
        rawAssetUpsertItems,
        rawJudgementCheckPatches,
        rawCombatEventPatches,
        rawCasePatches,
        rawRelationshipThreadPatches
      };
    }
    return {
      ...policyChecked,
      rawAssetPatch,
      rawAssetUpsertItems,
      rawJudgementCheckPatches,
      rawCombatEventPatches,
      rawCasePatches,
      rawRelationshipThreadPatches,
      validationWarnings: [
        ...(policyChecked.validationWarnings ?? []),
        {
          path: ['suggestedActions'],
          message: '主剧情没有返回本回合行动选项；界面将清空旧选项，避免误用上一回合内容。',
          code: 'missing_suggested_actions'
        }
      ]
    };
  }

  const envelope = responseEnvelopeSchema.safeParse(normalized.value);
  if (!envelope.success) {
    throw strict.error;
  }

  const warnings: StoryDiagnosticIssue[] = [...normalized.warnings];
  const playerVitalsReview = parseOptional(
    playerVitalsReviewSchema,
    envelope.data.playerVitalsReview,
    ['playerVitalsReview'],
    warnings
  );
  const pregnancyLifecycleReview = parseOptional(
    pregnancyLifecycleReviewSchema,
    envelope.data.pregnancyLifecycleReview,
    ['pregnancyLifecycleReview'],
    warnings
  );
  const timePatch = parseOptional(timePatchSchema, envelope.data.timePatch, ['timePatch'], warnings);
  const writeback = sanitizeWriteback(envelope.data.writeback, warnings);
  const sanitized = narratorResponseSchema.parse({
    writebackVersion: envelope.data.writebackVersion,
    narrativeText: envelope.data.narrativeText,
    turnSummary: envelope.data.turnSummary,
    suggestedActions: envelope.data.suggestedActions,
    ...(playerVitalsReview ? { playerVitalsReview } : {}),
    ...(pregnancyLifecycleReview ? { pregnancyLifecycleReview } : {}),
    ...(envelope.data.dramaPlan !== undefined
      ? { dramaPlan: envelope.data.dramaPlan }
      : {}),
    ...(envelope.data.dramaExecutionTrace !== undefined
      ? { dramaExecutionTrace: envelope.data.dramaExecutionTrace }
      : {}),
    ...(timePatch ? { timePatch } : {}),
    writeback
  }) as NarratorResponse;
  sanitized.rawAssetPatch = rawAssetPatch;
  sanitized.rawAssetUpsertItems = rawAssetUpsertItems;
  sanitized.rawJudgementCheckPatches = rawJudgementCheckPatches;
  sanitized.rawCombatEventPatches = rawCombatEventPatches;
  sanitized.rawCasePatches = rawCasePatches;
  sanitized.rawRelationshipThreadPatches = rawRelationshipThreadPatches;

  if (warnings.length > 0) {
    sanitized.validationWarnings = [
      ...(sanitized.validationWarnings ?? []),
      ...warnings.map((warning) => ({
        path: warning.path,
        message: warning.message,
        code: warning.code ?? 'writeback_warning'
      }))
    ];
  }
  if (sanitized.suggestedActions.length === 0) {
    sanitized.validationWarnings = [
      ...(sanitized.validationWarnings ?? []),
      {
        path: ['suggestedActions'],
        message: '主剧情没有返回本回合行动选项；界面将清空旧选项，避免误用上一回合内容。',
        code: 'missing_suggested_actions'
      }
    ];
  }
  return enforceAssetWritebackPolicy(sanitized);
}
