import { z } from 'zod';
import { createInitialReputationState, normalizePlayerReputationState, normalizeReputationCircles } from '../reputation/reputation';
import { defaultCurrentIdentitySchema } from '../runtime/currentIdentity';
import { MAX_MONEY_AMOUNT } from '../finance/moneyAmount';
import { storyPresentationHintsSchema } from '../runtime/storyBlocks';
import type { StoryDiagnosticIssue } from '../runtime/types';
import {
  actorActiveTraitPatchSchema,
  actorFemaleProfilePatchSchema,
  assetPatchSchema,
  boundedIntSchema,
  caseEvidencePatchSchema,
  casePatchSchema,
  certaintySchema,
  currentMatterPatchSchema,
  deferredEventPatchSchema,
  financeCashflowPatchSchema,
  memoryKindSchema,
  secretFactSchema,
  visibilitySchema
} from '../writeback/schema';

const actorPresenceSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (
    [
      'just_left',
      'left',
      'departed',
      'recently_left',
      'has_left',
      'leaving',
      'offscreen',
      'off_screen',
      '刚离开',
      '已离开',
      '离开',
      '离场',
      '刚走'
    ].includes(normalized)
  ) {
    return 'mentioned';
  }
  return value;
}, z.enum(['present', 'nearby', 'mentioned', 'absent']));
const equipmentSchema = z.array(z.string().min(1)).transform((items) => items.slice(0, 3));
const reputationEntrySchema = z.object({
  visibility: z.number().int().min(0).max(1000),
  standing: z.number().int().min(-100).max(100),
  summary: z.string().min(1)
});

const defaultOpeningReputation = createInitialReputationState('police');

const reputationByCircleSchema = z
  .record(z.string(), reputationEntrySchema)
  .transform((circles) => normalizeReputationCircles(circles, defaultOpeningReputation.circles));

const playerReputationStateSchema = z
  .object({
    notoriety: z.number().int().min(0).max(1000).default(0),
    overallReputation: z.number().int().min(-100).max(100).default(0),
    summary: z.string().min(1).default(defaultOpeningReputation.summary),
    circles: reputationByCircleSchema.default(defaultOpeningReputation.circles),
    logs: z.array(z.any()).default([])
  })
  .transform((reputation) => normalizePlayerReputationState(reputation, defaultOpeningReputation));

const moneyAmountSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_MONEY_AMOUNT, { message: `金额必须在 0 至 ${MAX_MONEY_AMOUNT} 港元之间。` });

const normalizeOpeningEconomyInput = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const economy = value as Record<string, unknown>;
  if (
    economy.cashOnHand === undefined &&
    economy.bankBalance === undefined &&
    typeof economy.money === 'number'
  ) {
    return {
      ...economy,
      cashOnHand: 0,
      bankBalance: economy.money
    };
  }
  return value;
};

const playerEconomyFieldSchemas = {
  cashOnHand: moneyAmountSchema.optional(),
  bankBalance: moneyAmountSchema.optional(),
  monthlyPressure: z.number().int().min(0).max(100).optional(),
  financeSummary: z.string().min(1).optional()
};

const playerEconomySchema = z.preprocess(
  normalizeOpeningEconomyInput,
  z.object(playerEconomyFieldSchemas)
);

const vitalsSchema = z.object({
  health: z.number().int().min(0).max(100).default(100),
  maxHealth: z.number().int().min(1).max(100).default(100),
  stamina: z.number().int().min(0).max(100).default(100),
  maxStamina: z.number().int().min(1).max(100).default(100),
  conditionSummary: z.string().min(1).default('状态正常。'),
  conditionPersistence: z.enum(['stable', 'transient', 'persistent', 'unknown']).optional()
});

const defaultVitals = {
  health: 100,
  maxHealth: 100,
  stamina: 100,
  maxStamina: 100,
  conditionSummary: '状态正常。'
};

const homeBaseSchema = z.object({
  placeId: z.string().min(1),
  placeName: z.string().min(1),
  regionId: z.string().min(1).default('region_unknown'),
  housingType: z.string().min(1),
  summary: z.string().min(1),
  householdSummary: z.string().min(1)
});

const grayLedgerEntrySchema = z.object({
  ledgerId: z.string().min(1).optional(),
  kind: z.enum(['cash', 'gift', 'favor', 'service', 'other']),
  amount: moneyAmountSchema.optional(),
  itemSummary: z.string().min(1).optional(),
  fromActorId: z.string().min(1).optional(),
  fromSummary: z.string().min(1),
  relatedActorIds: z.array(z.string()).default([]),
  relatedPlaceIds: z.array(z.string()).default([]),
  relatedCaseIds: z.array(z.string()).default([]),
  summary: z.string().min(1),
  playerExplanation: z.string().min(1).optional(),
  exposureRisk: z.number().int().min(0).max(100).default(30),
  status: z.enum(['hidden', 'suspected', 'exposed', 'settled']).default('hidden'),
  visibility: visibilitySchema.default('hidden')
});

const roleProfileStatusSchema = z.enum(['active', 'hidden', 'suspended', 'retired', 'cover', 'none']);
const optionalNonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
  z.string().min(1).optional()
);

function hasRoleProfileContent(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') return false;

  return Object.entries(profile as Record<string, unknown>).some(([key, value]) => {
    if (key === 'status') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return value !== undefined && value !== null;
  });
}

const policeRoleProfileSeedSchema = z
  .object({
    status: roleProfileStatusSchema.default('active'),
    agencyId: optionalNonEmptyStringSchema,
    stationOrPost: optionalNonEmptyStringSchema,
    department: optionalNonEmptyStringSchema,
    rank: optionalNonEmptyStringSchema,
    assignmentSummary: optionalNonEmptyStringSchema,
    postRole: optionalNonEmptyStringSchema,
    supervisorActorIds: z.array(z.string()).default([]),
    peerActorIds: z.array(z.string()).default([]),
    authoritySummary: z.string().default(''),
    accessSummary: z.string().default(''),
    dutySummary: z.string().default(''),
    institutionalReputation: z.string().default(''),
    disciplinePressureSummary: z.string().default(''),
    covertStatus: optionalNonEmptyStringSchema
  })
  .passthrough();

const triadRoleProfileSeedSchema = z
  .object({
    status: roleProfileStatusSchema.default('active'),
    organizationId: optionalNonEmptyStringSchema,
    societyName: optionalNonEmptyStringSchema,
    roleTitle: optionalNonEmptyStringSchema,
    rankSummary: optionalNonEmptyStringSchema,
    territorySummary: optionalNonEmptyStringSchema,
    patronActorIds: z.array(z.string()).default([]),
    peerActorIds: z.array(z.string()).default([]),
    rivalActorIds: z.array(z.string()).default([]),
    coverIdentitySummary: optionalNonEmptyStringSchema,
    obligationSummary: z.string().default(''),
    riskSummary: z.string().default('')
  })
  .passthrough();

const civilianRoleProfileSeedSchema = z
  .object({
    status: roleProfileStatusSchema.default('active'),
    civilianProfileId: optionalNonEmptyStringSchema,
    occupationGroupId: optionalNonEmptyStringSchema,
    employmentStatusId: optionalNonEmptyStringSchema,
    publicOccupation: optionalNonEmptyStringSchema,
    workplacePlaceId: optionalNonEmptyStringSchema,
    employerOrganizationId: optionalNonEmptyStringSchema,
    employerRelationType: optionalNonEmptyStringSchema,
    employerRelationSummary: optionalNonEmptyStringSchema,
    workUnitSummary: optionalNonEmptyStringSchema,
    positionSummary: optionalNonEmptyStringSchema,
    dutySummary: optionalNonEmptyStringSchema,
    decisionScopeSummary: optionalNonEmptyStringSchema,
    accessSummary: optionalNonEmptyStringSchema,
    sectorIds: z.array(z.string().min(1)).default([]),
    roleTags: z.array(z.string().min(1)).default([]),
    livelihoodActorIds: z.array(z.string().min(1)).default([]),
    communitySummary: z.string().default(''),
    familyEconomicSummary: z.string().default(''),
    legalStatusSummary: z.string().default('')
  })
  .passthrough();

const actorRoleProfilesSeedSchema = z
  .object({
    police: policeRoleProfileSeedSchema.optional(),
    triad: triadRoleProfileSeedSchema.optional(),
    civilian: civilianRoleProfileSeedSchema.optional()
  })
  .default({})
  .transform((profiles) => {
    const next: Partial<typeof profiles> = {};
    if (hasRoleProfileContent(profiles.police)) next.police = profiles.police;
    if (hasRoleProfileContent(profiles.triad)) next.triad = profiles.triad;
    if (hasRoleProfileContent(profiles.civilian)) next.civilian = profiles.civilian;
    return next;
  });

const actorWorldpackDataSeedSchema = z.record(z.string(), z.unknown()).default({});

const actorAttributesSeedSchema = z.object({
  body: z.number().int().min(0).max(100),
  action: z.number().int().min(0).max(100),
  perception: z.number().int().min(0).max(100),
  thinking: z.number().int().min(0).max(100),
  negotiation: z.number().int().min(0).max(100),
  will: z.number().int().min(0).max(100)
});

const openingActorActiveTraitSeedSchema = actorActiveTraitPatchSchema
  .extend({
    source: z.enum(['opening', 'worldpack', 'fixed_actor', 'llm_generated', 'story_earned', 'training_earned']).default('opening'),
    effectSummary: z.string().min(1).optional()
  })
  .transform((trait) => ({
    ...trait,
    effectSummary: trait.effectSummary ?? trait.description
  }));

export const openingActorMemorySeedSchema = z.object({
  text: z.string().min(1),
  importance: z.number().int().min(0).max(100).optional().default(50),
  visibility: visibilitySchema.default('player_known')
});

const descriptorNamePatterns = [
  /的手下/,
  /的马仔/,
  /手下$/,
  /马仔$/,
  /小弟$/,
  /可疑/,
  /未知/,
  /不明/,
  /^某/,
  /男子$/,
  /女子$/,
  /男人$/,
  /女人$/,
  /青年$/,
  /descriptor/i,
  /unknown/i,
  /shop\s*owner/i,
  /triad\s*member/i,
  /gang\s*member/i
];

const openingActorNameSchema = z
  .string()
  .min(1)
  .refine((name) => !descriptorNamePatterns.some((pattern) => pattern.test(name.trim())), {
    message: 'Opening actor name must be a real personal name, not a descriptive label.'
  });

export const openingActorSeedSchema = z.object({
  actorId: z.string().min(1).optional(),
  name: openingActorNameSchema,
  englishName: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).default([]),
  callName: z.string().min(1).optional(),
  gender: z.enum(['male', 'female', 'nonbinary']),
  birthDate: z.string().min(1).optional(),
  computedAge: z.number().int().min(0).max(130),
  visualAgeAnchor: z.string().min(1).optional(),
  currentIdentity: defaultCurrentIdentitySchema,
  publicIdentity: z.string().min(1).optional(),
  actualIdentitySummary: z.string().min(1).optional(),
  roleProfiles: actorRoleProfilesSeedSchema,
  playerRoleRelation: z
    .enum([
      'police_supervisor',
      'police_peer',
      'triad_patron',
      'triad_peer',
      'civilian_work_relation',
      'civilian_social_relation'
    ])
    .optional(),
  organizationIds: z.array(z.string().min(1)).default([]),
  positionSummary: z.string().min(1),
  profileSummary: z.string().min(1),
  clothing: z.string().default('开局尚未生成衣着。'),
  equipment: equipmentSchema.default([]),
  appearance: z.string().default('开局尚未形成稳定外貌描写。'),
  personality: z.string().default('开局尚未形成稳定性格描写。'),
  speechStyle: z.string().default('按世界包与人物身份自然说话。'),
  motivation: z.string().default('维持自身处境与利益。'),
  longTermGoal: z.string().default('随剧情逐渐明确。'),
  values: z.string().default('随剧情逐渐明确。'),
  attributes: actorAttributesSeedSchema.optional(),
  activeTraits: z.array(openingActorActiveTraitSeedSchema).default([]),
  relationshipSummary: z.string().default('与主角关系刚开始形成。'),
  attitudeTowardPlayer: z.string().default('观察中'),
  interactionScore: boundedIntSchema(0, 100).default(0),
  trustTendency: z.string().default('需要通过后续互动判断。'),
  entanglementSummary: z.string().default('暂无明确牵连。'),
  longTermMemorySummary: z.string().default('开局生成人物。'),
  recentInteractionMemory: z.string().default('开局与主角产生联系。'),
  keyMemories: z.array(openingActorMemorySeedSchema).default([]),
  femaleProfile: actorFemaleProfilePatchSchema.optional(),
  statusSummary: z.string().default('状态正常。'),
  bodyConditionSummary: z.string().min(1).optional(),
  presence: actorPresenceSchema.default('mentioned'),
  currentPlaceId: z.string().min(1).optional(),
  currentSceneId: z.string().min(1).optional(),
  visibility: visibilitySchema.default('player_known'),
  importance: z.number().int().min(0).max(100).default(50),
  worldpackActorData: actorWorldpackDataSeedSchema
});

export const openingMemorySeedSchema = z.object({
  text: z.string().min(1),
  kind: memoryKindSchema.default('world'),
  relatedActorIds: z.array(z.string()).default([]),
  relatedCaseIds: z.array(z.string()).default([]),
  relatedPlaceIds: z.array(z.string()).default([]),
  relatedOrganizationIds: z.array(z.string()).default([]),
  importance: z.number().int().min(0).max(100).default(50),
  visibility: visibilitySchema.default('player_known'),
  certainty: certaintySchema.default('claim')
});

export const openingPressureSeedSchema = z.object({
  pressureId: z.string().min(1).optional(),
  kind: z.string().min(1),
  summary: z.string().min(1),
  severity: z.number().int().min(0).max(100).default(30),
  exposureLikelihood: z.number().int().min(0).max(100).default(20),
  sourceSummary: z.string().default('开局生成'),
  relatedActorIds: z.array(z.string()).default([]),
  relatedCaseIds: z.array(z.string()).default([]),
  relatedPlaceIds: z.array(z.string()).default([]),
  relatedOrganizationIds: z.array(z.string()).default([]),
  allowedUses: z.array(z.string()).default([]),
  forbiddenUses: z.array(z.string()).default([]),
  escalationConditions: z.array(z.string()).default([]),
  visibility: visibilitySchema.default('hidden')
});

const openingPlayerPatchFieldSchemas = {
  name: z.string().min(1).optional(),
  englishName: z.string().min(1).optional(),
  policeNumber: z.string().optional(),
  clothing: z.string().min(1).optional(),
  equipment: equipmentSchema.optional(),
  vitals: vitalsSchema.optional(),
  economy: playerEconomySchema.optional(),
  reputation: playerReputationStateSchema.optional(),
  reputationByCircle: reputationByCircleSchema.optional(),
  homeBase: homeBaseSchema.optional(),
  statusSummary: z.string().min(1).optional(),
  longTermMemorySummary: z.string().min(1).optional(),
  recentInteractionMemory: z.string().min(1).optional()
};
const {
  economy: _openingEconomyFieldSchema,
  ...openingPlayerPatchNonEconomyFieldSchemas
} = openingPlayerPatchFieldSchemas;

const openingPlayerPatchSchema = z.object(openingPlayerPatchFieldSchemas).default({});

const openingFinancePatchSchema = z.object({
  upsertCashflows: z.array(financeCashflowPatchSchema).max(2).default([])
});

export const openingNarratorResponseSchema = z.object({
  narrativeText: z.string().min(1),
  presentationHints: storyPresentationHintsSchema,
  suggestedActions: z.array(z.string()).default([]),
  playerPatch: openingPlayerPatchSchema,
  financePatch: openingFinancePatchSchema.optional(),
  initialActors: z.array(openingActorSeedSchema).default([]),
  memories: z.array(openingMemorySeedSchema).default([]),
  secretFacts: z.array(secretFactSchema).default([]),
  pressureSeeds: z.array(openingPressureSeedSchema).default([]),
  grayLedger: z.array(grayLedgerEntrySchema).default([]),
  casePatches: z.array(casePatchSchema).default([]),
  caseEvidencePatches: z.array(caseEvidencePatchSchema).default([]),
  currentMatterPatches: z.array(currentMatterPatchSchema).default([]),
  deferredEventPatches: z.array(deferredEventPatchSchema).default([]),
  assetPatch: assetPatchSchema.optional()
});

export type OpeningNarratorResponse = z.infer<typeof openingNarratorResponseSchema> & {
  validationWarnings?: StoryDiagnosticIssue[];
};

const openingResponseEnvelopeSchema = z
  .object({
    narrativeText: z.string().min(1),
    presentationHints: z.unknown().optional(),
    suggestedActions: z.array(z.string()).catch([]),
    playerPatch: z.unknown().default({}),
    financePatch: z.unknown().optional(),
    initialActors: z.unknown().default([]),
    memories: z.unknown().default([]),
    secretFacts: z.unknown().default([]),
    pressureSeeds: z.unknown().default([]),
    grayLedger: z.unknown().default([]),
    casePatches: z.unknown().default([]),
    caseEvidencePatches: z.unknown().default([]),
    currentMatterPatches: z.unknown().default([]),
    deferredEventPatches: z.unknown().default([]),
    assetPatch: z.unknown().optional()
  })
  .passthrough();

type SafeSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: z.ZodError };
};

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
      message: 'Expected an array; omitted this opening writeback module.',
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

function parseObjectFields(
  schemas: Record<string, SafeSchema<unknown>>,
  value: unknown,
  path: Array<string | number>,
  warnings: StoryDiagnosticIssue[]
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    warnings.push({
      path,
      message: 'Expected an object; omitted this opening writeback module.',
      code: 'invalid_type'
    });
    return {};
  }

  const raw = value as Record<string, unknown>;
  const parsed: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(schemas)) {
    if (raw[key] === undefined) continue;
    const result = schema.safeParse(raw[key]);
    if (result.success) {
      parsed[key] = result.data;
    } else {
      addIssues(warnings, [...path, key], result.error);
    }
  }
  return parsed;
}

function parseOpeningEconomy(
  value: unknown,
  warnings: StoryDiagnosticIssue[]
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return parseObjectFields(
    playerEconomyFieldSchemas,
    normalizeOpeningEconomyInput(value),
    ['playerPatch', 'economy'],
    warnings
  );
}

function parseOpeningPlayerPatch(
  value: unknown,
  warnings: StoryDiagnosticIssue[]
): Record<string, unknown> {
  const parsed = parseObjectFields(
    openingPlayerPatchNonEconomyFieldSchemas,
    value,
    ['playerPatch'],
    warnings
  );
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const economy = parseOpeningEconomy((value as Record<string, unknown>).economy, warnings);
    if (economy !== undefined) parsed.economy = economy;
  }
  return parsed;
}

export function validateOpeningNarratorResponse(raw: unknown): OpeningNarratorResponse {
  const strict = openingNarratorResponseSchema.safeParse(raw);
  if (strict.success) return strict.data;

  const envelope = openingResponseEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw strict.error;
  }

  const warnings: StoryDiagnosticIssue[] = [];
  const sanitized = openingNarratorResponseSchema.parse({
    narrativeText: envelope.data.narrativeText,
    presentationHints: storyPresentationHintsSchema.parse(envelope.data.presentationHints),
    suggestedActions: envelope.data.suggestedActions,
    playerPatch: parseOpeningPlayerPatch(envelope.data.playerPatch, warnings),
    financePatch: parseOptional(openingFinancePatchSchema, envelope.data.financePatch, ['financePatch'], warnings),
    initialActors: parseArrayItems(openingActorSeedSchema, envelope.data.initialActors, ['initialActors'], warnings),
    memories: parseArrayItems(openingMemorySeedSchema, envelope.data.memories, ['memories'], warnings),
    secretFacts: parseArrayItems(secretFactSchema, envelope.data.secretFacts, ['secretFacts'], warnings),
    pressureSeeds: parseArrayItems(openingPressureSeedSchema, envelope.data.pressureSeeds, ['pressureSeeds'], warnings),
    grayLedger: parseArrayItems(grayLedgerEntrySchema, envelope.data.grayLedger, ['grayLedger'], warnings),
    casePatches: parseArrayItems(casePatchSchema, envelope.data.casePatches, ['casePatches'], warnings),
    caseEvidencePatches: parseArrayItems(
      caseEvidencePatchSchema,
      envelope.data.caseEvidencePatches,
      ['caseEvidencePatches'],
      warnings
    ),
    currentMatterPatches: parseArrayItems(
      currentMatterPatchSchema,
      envelope.data.currentMatterPatches,
      ['currentMatterPatches'],
      warnings
    ),
    deferredEventPatches: parseArrayItems(
      deferredEventPatchSchema,
      envelope.data.deferredEventPatches,
      ['deferredEventPatches'],
      warnings
    ),
    assetPatch: parseOptional(assetPatchSchema, envelope.data.assetPatch, ['assetPatch'], warnings)
  }) as OpeningNarratorResponse;

  if (warnings.length > 0) {
    sanitized.validationWarnings = warnings;
  }
  return sanitized;
}
