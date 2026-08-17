import { z } from 'zod';
import { MAX_MONEY_AMOUNT } from '../finance/moneyAmount';
import { normalizeReputationCircle, reputationCircleValues } from '../reputation/reputation';
import { optionalCurrentIdentitySchema } from '../runtime/currentIdentity';
import { storyPresentationHintsSchema } from '../runtime/storyBlocks';
import type { OrganizationStructureNode, StoryDiagnosticIssue } from '../runtime/types';

export const visibilitySchema = z.enum(['public', 'player_known', 'private', 'hidden']);
export const certaintySchema = z.enum(['fact', 'claim', 'rumor', 'disputed', 'unknown']);
export const memoryKindValues = ['turn', 'actor', 'case', 'place', 'world', 'player'] as const;

function normalizeMemoryKind(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const aliases: Record<string, (typeof memoryKindValues)[number]> = {
    turn: 'turn',
    event: 'turn',
    scene: 'turn',
    action: 'turn',
    actor: 'actor',
    npc: 'actor',
    character: 'actor',
    case: 'case',
    investigation: 'case',
    file: 'case',
    place: 'place',
    location: 'place',
    world: 'world',
    historical: 'world',
    history: 'world',
    background: 'world',
    news: 'world',
    era: 'world',
    society: 'world',
    player: 'player',
    protagonist: 'player',
    self: 'player'
  };

  return aliases[normalized] ?? value;
}

export const memoryKindSchema = z.preprocess(normalizeMemoryKind, z.enum(memoryKindValues));
export const reputationCircleSchema = z.preprocess(normalizeReputationCircle, z.enum(reputationCircleValues));

function normalizeWritebackGameTime(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes()
  };
}

function isValidCalendarDate(value: { year: number; month: number; day: number }): boolean {
  const leapYear = value.year % 4 === 0 && (value.year % 100 !== 0 || value.year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return value.day <= (daysInMonth[value.month - 1] ?? 0);
}

export const writebackGameTimeSchema = z.preprocess(
  normalizeWritebackGameTime,
  z
    .object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59)
    })
    .refine(isValidCalendarDate, { path: ['day'], message: 'Invalid calendar date.' })
);

export const timePatchSchema = z
  .object({
    elapsedMinutes: z.number().int().min(0).max(1440).optional(),
    targetTime: writebackGameTimeSchema.optional(),
    reason: z.string().min(1)
  })
  .refine((patch) => patch.elapsedMinutes !== undefined || patch.targetTime !== undefined, {
    message: 'timePatch must include elapsedMinutes for short actions or targetTime for long-span actions.'
  });

export const memorySuggestionSchema = z.object({
  text: z.string().min(1),
  kind: memoryKindSchema.default('world'),
  importance: z.number().int().min(0).max(100).default(50),
  visibility: visibilitySchema.default('player_known'),
  certainty: certaintySchema.default('claim')
});

export const actorMemorySuggestionSchema = z.object({
  actorId: z.string().min(1),
  actorName: z.string().min(1).optional(),
  text: z.string().min(1),
  importance: z.number().int().min(0).max(100).optional().default(50),
  visibility: visibilitySchema.default('player_known')
});

export const traitProgressSuggestionSchema = z.object({
  actorId: z.string().min(1),
  traitId: z.string().min(1),
  name: z.string().min(1),
  delta: z.number().int().min(-100).max(100),
  maxProgress: z.number().int().min(1).max(1000),
  reason: z.string().min(1)
});

export const traitGainSuggestionSchema = z.object({
  actorId: z.string().min(1),
  traitId: z.string().min(1),
  name: z.string().min(1),
  source: z.enum(['opening', 'worldpack', 'fixed_actor', 'llm_generated', 'story_earned', 'training_earned']),
  description: z.string().min(1),
  effectSummary: z.string().min(1),
  scopes: z.array(z.string()).default([]),
  visibility: visibilitySchema.default('player_known')
});

export const actorActiveTraitPatchSchema = z.object({
  traitId: z.string().min(1),
  name: z.string().min(1),
  source: z.enum(['opening', 'worldpack', 'fixed_actor', 'llm_generated', 'story_earned', 'training_earned']),
  description: z.string().min(1),
  effectSummary: z.string().min(1),
  scopes: z.array(z.string().min(1)).default([]),
  status: z.enum(['active', 'dormant', 'weakened', 'removed']).default('active'),
  evidenceMemoryId: z.string().min(1).optional(),
  visibility: visibilitySchema.default('player_known')
});

export const vitalsPatchSchema = z.object({
  healthDelta: z.number().int().min(-100).max(100).default(0),
  staminaDelta: z.number().int().min(-100).max(100).default(0),
  conditionSummary: z.string().min(1).optional(),
  conditionPersistence: z.enum(['stable', 'transient', 'persistent', 'unknown']).optional()
});

export const playerVitalsReviewSchema = z.object({
  changed: z.boolean(),
  reason: z.string().trim().min(1)
});

export const pregnancyLifecycleReviewEventSchema = z.object({
  actorId: z.string().min(1),
  event: z.enum(['pregnancy_risk', 'pregnancy_confirmed', 'pregnancy_ended', 'live_birth']),
  reason: z.string().trim().min(1)
});

export const pregnancyLifecycleReviewSchema = z
  .object({
    changed: z.boolean(),
    events: z.array(pregnancyLifecycleReviewEventSchema).max(4).default([]),
    reason: z.string().trim().min(1)
  })
  .superRefine((review, context) => {
    if (review.changed && review.events.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['events'],
        message: '妊娠生命周期发生变化时必须列出对应人物和事件。'
      });
    }
    if (!review.changed && review.events.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['events'],
        message: '妊娠生命周期没有变化时 events 必须为空。'
      });
    }
  });

const actorPresenceSchema = z.enum(['present', 'nearby', 'mentioned', 'absent']);
const actorGenderSchema = z.enum(['male', 'female', 'nonbinary', 'unknown']);
const roleProfileStatusSchema = z.enum(['active', 'hidden', 'suspended', 'retired', 'cover', 'none']);
const optionalNonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
  z.string().min(1).optional()
);

export function boundedIntSchema(min: number, max: number) {
  return z.preprocess((value) => {
    const numericValue =
      typeof value === 'string' && value.trim().length > 0 ? Number(value) : value;
    if (typeof numericValue !== 'number' || !Number.isFinite(numericValue)) return value;
    return Math.max(min, Math.min(max, Math.round(numericValue)));
  }, z.number().int().min(min).max(max));
}

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

const actorAttributesPatchSchema = z.object({
  body: z.number().int().min(0).max(100).optional(),
  action: z.number().int().min(0).max(100).optional(),
  perception: z.number().int().min(0).max(100).optional(),
  thinking: z.number().int().min(0).max(100).optional(),
  negotiation: z.number().int().min(0).max(100).optional(),
  will: z.number().int().min(0).max(100).optional()
});

export const policeRoleProfilePatchSchema = z
  .object({
    status: roleProfileStatusSchema.default('active'),
    agencyId: optionalNonEmptyStringSchema,
    stationOrPost: optionalNonEmptyStringSchema,
    department: optionalNonEmptyStringSchema,
    rank: optionalNonEmptyStringSchema,
    assignmentSummary: optionalNonEmptyStringSchema,
    postRole: optionalNonEmptyStringSchema,
    supervisorActorIds: z.array(z.string().min(1)).default([]),
    peerActorIds: z.array(z.string().min(1)).default([]),
    authoritySummary: z.string().default(''),
    accessSummary: z.string().default(''),
    dutySummary: z.string().default(''),
    institutionalReputation: z.string().default(''),
    disciplinePressureSummary: z.string().default(''),
    covertStatus: optionalNonEmptyStringSchema
  })
  .passthrough();

export const triadRoleProfilePatchSchema = z
  .object({
    status: roleProfileStatusSchema.default('active'),
    organizationId: optionalNonEmptyStringSchema,
    societyName: optionalNonEmptyStringSchema,
    roleTitle: optionalNonEmptyStringSchema,
    rankSummary: optionalNonEmptyStringSchema,
    territorySummary: optionalNonEmptyStringSchema,
    patronActorIds: z.array(z.string().min(1)).default([]),
    peerActorIds: z.array(z.string().min(1)).default([]),
    rivalActorIds: z.array(z.string().min(1)).default([]),
    coverIdentitySummary: optionalNonEmptyStringSchema,
    obligationSummary: z.string().default(''),
    riskSummary: z.string().default('')
  })
  .passthrough();

export const civilianRoleProfilePatchSchema = z
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

const nullableOptionalNonEmptyStringSchema = z.union([z.string().trim().min(1), z.null()]).optional();

export const playerCivilianRoleProfilePatchSchema = z
  .object({
    reason: z.string().trim().min(1),
    status: roleProfileStatusSchema.optional(),
    civilianProfileId: nullableOptionalNonEmptyStringSchema,
    occupationGroupId: nullableOptionalNonEmptyStringSchema,
    employmentStatusId: nullableOptionalNonEmptyStringSchema,
    publicOccupation: z.string().trim().min(1).optional(),
    workplacePlaceId: nullableOptionalNonEmptyStringSchema,
    employerOrganizationId: nullableOptionalNonEmptyStringSchema,
    employerRelationType: nullableOptionalNonEmptyStringSchema,
    employerRelationSummary: nullableOptionalNonEmptyStringSchema,
    workUnitSummary: nullableOptionalNonEmptyStringSchema,
    positionSummary: nullableOptionalNonEmptyStringSchema,
    dutySummary: nullableOptionalNonEmptyStringSchema,
    decisionScopeSummary: nullableOptionalNonEmptyStringSchema,
    accessSummary: nullableOptionalNonEmptyStringSchema,
    sectorIds: z.array(z.string().trim().min(1)).max(12).optional(),
    roleTags: z.array(z.string().trim().min(1)).max(16).optional(),
    livelihoodActorIds: z.array(z.string().trim().min(1)).max(12).optional(),
    communitySummary: z.string().trim().optional(),
    familyEconomicSummary: z.string().trim().optional(),
    legalStatusSummary: z.string().trim().optional()
  })
  .strict()
  .refine(
    (patch) =>
      Object.keys(patch).some((key) => key !== 'reason'),
    { message: 'At least one civilian role profile field is required.' }
  );

export const playerPoliceRoleProfilePatchSchema = z
  .object({
    reason: z.string().trim().min(1),
    stationOrPost: z.string().trim().min(1),
    department: z.string().trim().min(1),
    assignmentSummary: z.string().trim().min(1),
    postRole: z.string().trim().min(1).optional(),
    publicIdentity: z.string().trim().min(1).optional(),
    supervisorActorIds: z.array(z.string().trim().min(1)).max(12).optional(),
    peerActorIds: z.array(z.string().trim().min(1)).max(12).optional(),
    authoritySummary: z.string().trim().min(1).optional(),
    accessSummary: z.string().trim().min(1).optional(),
    dutySummary: z.string().trim().min(1).optional()
  })
  .strict();

const actorRoleProfilesPatchSchema = z
  .object({
    police: policeRoleProfilePatchSchema.optional(),
    triad: triadRoleProfilePatchSchema.optional(),
    civilian: civilianRoleProfilePatchSchema.optional()
  })
  .default({})
  .transform((profiles) => {
    const next: Partial<typeof profiles> = {};
    if (hasRoleProfileContent(profiles.police)) next.police = profiles.police;
    if (hasRoleProfileContent(profiles.triad)) next.triad = profiles.triad;
    if (hasRoleProfileContent(profiles.civilian)) next.civilian = profiles.civilian;
    return next;
  });

const actorKeyMemoryPatchSchema = z.object({
  text: z.string().min(1),
  importance: z.number().int().min(0).max(100).default(50),
  visibility: visibilitySchema.default('player_known')
});

export const actorOrganizationRelationPatchSchema = z.object({
  organizationId: z.string().min(1),
  relationType: z.string().min(1),
  roleTitle: z.string().min(1).optional(),
  departmentOrUnit: z.string().min(1).optional(),
  summary: z.string().min(1),
  visibility: z.enum(['public', 'player_known', 'hidden']).default('player_known'),
  isPrimary: z.boolean().optional()
});

const actorAdultPrivateWombRecordPatchSchema = z
  .object({
    date: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    pregnancyCheckDate: z.string().min(1).optional(),
    日期: z.string().min(1).optional(),
    描述: z.string().min(1).optional(),
    怀孕判定日: z.string().min(1).optional()
  })
  .passthrough();

const actorAdultPrivateWombPatchSchema = z
  .object({
    status: z.string().min(1).optional(),
    cervixStatus: z.string().min(1).optional(),
    records: z.array(actorAdultPrivateWombRecordPatchSchema).optional(),
    状态: z.string().min(1).optional(),
    宫口状态: z.string().min(1).optional(),
    内射记录: z.array(actorAdultPrivateWombRecordPatchSchema).optional()
  })
  .passthrough();

const actorAdultPrivatePartPatchSchema = z
  .object({
    description: z.string().min(1).optional(),
    imagePromptAnchor: z.string().min(1).optional(),
    描述: z.string().min(1).optional(),
    生图词组: z.string().min(1).optional()
  })
  .passthrough();

const actorAdultPrivatePartProfilesPatchSchema = z
  .object({
    胸部: actorAdultPrivatePartPatchSchema.optional(),
    小穴: actorAdultPrivatePartPatchSchema.optional(),
    屁穴: actorAdultPrivatePartPatchSchema.optional()
  })
  .passthrough();

const actorAdultPrivateProfilePatchSchema = z
  .object({
    enabled: z.boolean().default(true),
    ageConfirmedAdult: z.boolean().default(false),
    profileStatus: z.string().min(1).optional(),
    femaleProfileStatus: z.string().min(1).optional(),
    女性扩展档案状态: z.string().min(1).optional(),
    womb: actorAdultPrivateWombPatchSchema.optional(),
    子宫: actorAdultPrivateWombPatchSchema.optional(),
    partProfiles: actorAdultPrivatePartProfilesPatchSchema.optional(),
    香闺秘档部位档案: actorAdultPrivatePartProfilesPatchSchema.optional(),
    fetishNotes: z.string().min(1).optional(),
    sensitivePoints: z.string().min(1).optional(),
    性癖: z.string().min(1).optional(),
    敏感点: z.string().min(1).optional(),
    胸部描述: z.string().min(1).optional(),
    小穴描述: z.string().min(1).optional(),
    屁穴描述: z.string().min(1).optional(),
    summary: z.string().min(1).optional(),
    preferenceNotes: z.string().min(1).optional(),
    boundaryNotes: z.string().min(1).optional(),
    sensitiveNotes: z.string().min(1).optional(),
    relationshipRiskNotes: z.string().min(1).optional()
  })
  .passthrough();

const actorFemaleRelationshipEdgePatchSchema = z
  .object({
    targetName: z.string().min(1).optional(),
    relation: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
    对象姓名: z.string().min(1).optional(),
    关系: z.string().min(1).optional(),
    备注: z.string().min(1).optional()
  })
  .passthrough();

export const actorFemaleProfilePatchSchema = z
  .object({
    birthday: z.string().min(1).optional(),
    addressToPlayer: z.string().min(1).optional(),
    relationshipNotes: z.string().min(1).optional(),
    publicIntimacyNotes: z.string().min(1).optional(),
    appearanceDescription: z.string().min(1).optional(),
    bodyDescription: z.string().min(1).optional(),
    clothingStyle: z.string().min(1).optional(),
    appearanceExtension: z.string().min(1).optional(),
    personalityCore: z.string().min(1).optional(),
    affectionProgressionCondition: z.string().min(1).optional(),
    relationshipProgressionCondition: z.string().min(1).optional(),
    relationshipNetwork: z.array(z.string().min(1)).optional(),
    relationshipNetworkEdges: z.array(actorFemaleRelationshipEdgePatchSchema).optional(),
    关系网变量: z.union([z.array(z.union([actorFemaleRelationshipEdgePatchSchema, z.string().min(1)])), z.string().min(1)]).optional(),
    emotionalBoundary: z.string().min(1).optional(),
    adultPrivateProfile: actorAdultPrivateProfilePatchSchema.optional(),
    source: z.enum(['opening', 'writeback', 'manual', 'imported']).optional()
  })
  .passthrough();

const actorWorldpackDataPatchSchema = z.record(z.string(), z.unknown()).default({});

export const actorPatchSchema = z.object({
  actorId: z.string().min(1),
  name: z.string().optional(),
  englishName: z.string().optional(),
  aliases: z.array(z.string().min(1)).optional(),
  callName: z.string().min(1).optional(),
  gender: actorGenderSchema.optional(),
  policeNumber: z.string().min(1).optional(),
  birthDate: z.string().min(1).optional(),
  computedAge: z.number().int().min(0).max(130).optional(),
  visualAgeAnchor: z.string().min(1).optional(),
  currentIdentity: optionalCurrentIdentitySchema,
  publicIdentity: z.string().min(1).optional(),
  actualIdentitySummary: z.string().min(1).optional(),
  roleProfiles: actorRoleProfilesPatchSchema,
  organizationIds: z.array(z.string().min(1)).optional(),
  organizationRelations: z.array(actorOrganizationRelationPatchSchema).default([]),
  positionSummary: z.string().min(1).optional(),
  currentPlaceId: z.string().optional(),
  currentSceneId: z.string().optional(),
  presence: actorPresenceSchema.optional(),
  profileSummary: z.string().min(1).optional(),
  appearance: z.string().min(1).optional(),
  clothing: z.string().min(1).optional(),
  equipment: z.array(z.string().min(1)).max(3).optional(),
  personality: z.string().min(1).optional(),
  speechStyle: z.string().min(1).optional(),
  motivation: z.string().min(1).optional(),
  longTermGoal: z.string().min(1).optional(),
  values: z.string().min(1).optional(),
  attributes: actorAttributesPatchSchema.optional(),
  activeTraits: z.array(actorActiveTraitPatchSchema).optional(),
  relationshipSummary: z.string().optional(),
  attitudeTowardPlayer: z.string().optional(),
  interactionScore: boundedIntSchema(0, 100).optional(),
  trustTendency: z.string().min(1).optional(),
  entanglementSummary: z.string().min(1).optional(),
  longTermMemorySummary: z.string().min(1).optional(),
  recentInteractionMemory: z.string().min(1).optional(),
  keyMemories: z.array(actorKeyMemoryPatchSchema).default([]),
  femaleProfile: actorFemaleProfilePatchSchema.optional(),
  statusSummary: z.string().optional(),
  bodyConditionSummary: z.string().min(1).optional(),
  visibility: visibilitySchema.optional(),
  importance: z.number().int().min(0).max(100).optional(),
  worldpackActorData: actorWorldpackDataPatchSchema,
  vitalsPatch: vitalsPatchSchema.optional()
});

export const economyPatchSchema = z.object({
  // Legacy v1.5 player economy writeback. New prompts use financePatch instead.
  moneyDelta: z.number().int().min(-MAX_MONEY_AMOUNT).max(MAX_MONEY_AMOUNT).optional(),
  moneySet: z.number().int().min(0).max(MAX_MONEY_AMOUNT).optional(),
  monthlyPressureDelta: z.number().int().min(-100).max(100).optional(),
  monthlyPressureSet: z.number().int().min(0).max(100).optional(),
  financeSummary: z.string().min(1).optional()
});

export const progressionPatchSchema = z.object({
  experienceGain: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
    },
    z.number().int().min(0).max(1_000)
  ),
  reason: z.string().trim().min(1).optional()
});

export const weatherConditionSchema = z.enum([
  'clear',
  'cloudy',
  'light_rain',
  'heavy_rain',
  'thunderstorm',
  'typhoon_signal',
  'foggy',
  'humid_hot',
  'cool_dry'
]);

export const weatherPatchSchema = z
  .object({
    condition: weatherConditionSchema,
    label: z.string().min(1).optional(),
    intensity: boundedIntSchema(0, 100).optional(),
    impactSummary: z.string().min(1).optional(),
    validForMinutes: z.number().int().min(10).max(1440).optional(),
    tags: z.array(z.string().min(1)).max(8).default([]),
    reason: z.string().min(1).optional()
  })
  .strict();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/[^\d.+-]/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function normalizeFinanceAccount(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const aliases: Record<string, 'cash' | 'bank'> = {
    cash: 'cash',
    wallet: 'cash',
    hand: 'cash',
    现金: 'cash',
    随身现金: 'cash',
    钱包: 'cash',
    bank: 'bank',
    account: 'bank',
    deposit: 'bank',
    银行: 'bank',
    存款: 'bank',
    银行存款: 'bank'
  };

  return aliases[normalized] ?? value;
}

function normalizeFinanceDirection(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const aliases: Record<string, 'income' | 'expense' | 'adjustment'> = {
    income: 'income',
    in: 'income',
    earn: 'income',
    earning: 'income',
    received: 'income',
    receive: 'income',
    收入: 'income',
    入账: 'income',
    进账: 'income',
    expense: 'expense',
    out: 'expense',
    spend: 'expense',
    spent: 'expense',
    cost: 'expense',
    paid: 'expense',
    pay: 'expense',
    支出: 'expense',
    花费: 'expense',
    消费: 'expense',
    付款: 'expense',
    adjustment: 'adjustment',
    adjust: 'adjustment',
    修正: 'adjustment',
    调整: 'adjustment'
  };

  return aliases[normalized] ?? value;
}

function inferFinanceDirection(record: Record<string, unknown>): unknown {
  const explicit = record.direction ?? record.type ?? record.transactionType ?? record.flow;
  if (explicit !== undefined) return explicit;

  const delta = readNumber(record, ['moneyDelta', 'delta', 'amountDelta', 'change']);
  if (delta === undefined) return undefined;
  if (delta < 0) return 'expense';
  if (delta > 0) return 'income';
  return 'adjustment';
}

function normalizeFinanceLedgerEntry(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const rawAmount = readNumber(value, ['amountHKD', 'amountHkd', 'amount_hkd', 'amount', 'money', 'value', 'moneyDelta', 'delta']);
  const summary = readText(value, ['summary', 'description', 'desc', 'note', 'reason', 'detail']);
  const title =
    readText(value, ['title', 'category', 'label', 'name']) ??
    (summary ? summary.slice(0, 18) : undefined);

  return {
    ...value,
    direction: normalizeFinanceDirection(inferFinanceDirection(value)),
    amount: rawAmount === undefined ? value.amount : Math.abs(Math.trunc(rawAmount)),
    account: normalizeFinanceAccount(value.account ?? value.accountType ?? value.balanceType ?? 'cash'),
    title: title ?? value.title,
    summary: summary ?? value.summary
  };
}

function normalizeFinanceCashflow(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const amount = readNumber(value, ['amount', 'amountHKD', 'amountHkd', 'amount_hkd', 'money', 'value']);
  const kind = typeof value.kind === 'string' ? value.kind : '';
  const defaultAccount = ['salary', 'rent', 'asset_income', 'asset_expense', 'debt_payment'].includes(kind)
    ? 'bank'
    : 'cash';
  return {
    ...value,
    amount: amount === undefined ? value.amount : Math.abs(Math.trunc(amount)),
    account: normalizeFinanceAccount(value.account ?? value.accountType ?? defaultAccount)
  };
}

function normalizeFinancePatch(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    cashDelta: value.cashDelta ?? value.moneyDelta,
    cashSet: value.cashSet ?? value.moneySet
  };
}

const financeLedgerDirectionSchema = z.preprocess(
  normalizeFinanceDirection,
  z.enum(['income', 'expense', 'adjustment'])
);

const financeAccountSchema = z.preprocess(normalizeFinanceAccount, z.enum(['cash', 'bank']));

export const financeCashflowPatchSchema = z.preprocess(
  normalizeFinanceCashflow,
  z.object({
    itemId: z.string().min(1),
    direction: z.enum(['income', 'expense']),
    kind: z.enum([
      'salary',
      'rent',
      'family_support',
      'debt_payment',
      'asset_income',
      'asset_expense',
      'living_cost',
      'other'
    ]),
    title: z.string().min(1),
    amount: z.number().int().min(0).max(MAX_MONEY_AMOUNT),
    account: financeAccountSchema,
    identityBinding: z.enum(['civilian', 'gang_member', 'police']).optional(),
    summary: z.string().min(1),
    activeFromMonth: z.string().min(1),
    activeToMonth: z.string().min(1).optional(),
    relatedAssetItemIds: z.array(z.string().min(1)).default([]),
    relatedActorIds: z.array(z.string().min(1)).default([]),
    relatedPlaceIds: z.array(z.string().min(1)).default([]),
    source: z.enum(['opening', 'writeback', 'monthly_settlement', 'manual']).default('writeback'),
    status: z.enum(['active', 'paused', 'ended']).default('active'),
    visibility: visibilitySchema.default('player_known')
  })
);

export const financeLedgerEntryPatchSchema = z.preprocess(
  normalizeFinanceLedgerEntry,
  z.object({
    entryId: z.string().min(1).optional(),
    gameTime: writebackGameTimeSchema.optional(),
    direction: financeLedgerDirectionSchema,
    amount: z.number().int().min(0).max(MAX_MONEY_AMOUNT),
    account: financeAccountSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    relatedCashflowItemId: z.string().min(1).optional(),
    relatedAssetItemIds: z.array(z.string().min(1)).default([]),
    relatedActorIds: z.array(z.string().min(1)).default([]),
    relatedPlaceIds: z.array(z.string().min(1)).default([]),
    source: z.enum(['writeback', 'monthly_settlement', 'manual', 'legacy_economy_patch']).default('writeback'),
    visibility: visibilitySchema.default('player_known')
  })
);

export const financePatchScalarFieldSchemas = {
  cashDelta: z.number().int().min(-MAX_MONEY_AMOUNT).max(MAX_MONEY_AMOUNT).optional(),
  cashSet: z.number().int().min(0).max(MAX_MONEY_AMOUNT).optional(),
  bankDelta: z.number().int().min(-MAX_MONEY_AMOUNT).max(MAX_MONEY_AMOUNT).optional(),
  bankSet: z.number().int().min(0).max(MAX_MONEY_AMOUNT).optional(),
  summary: z.string().min(1).optional()
} as const;

const financePatchObjectSchema = z.object({
  ...financePatchScalarFieldSchemas,
  upsertCashflows: z.array(financeCashflowPatchSchema).default([]),
  removeCashflowItemIds: z.array(z.string().min(1)).default([]),
  ledgerEntries: z.array(financeLedgerEntryPatchSchema).default([])
});

export const financePatchScalarSchema = z.preprocess(
  normalizeFinancePatch,
  financePatchObjectSchema.omit({
    upsertCashflows: true,
    removeCashflowItemIds: true,
    ledgerEntries: true
  })
);

export const financePatchSchema = z.preprocess(normalizeFinancePatch, financePatchObjectSchema);

export const grayLedgerEntryPatchSchema = z.object({
  ledgerId: z.string().min(1).optional(),
  gameTime: writebackGameTimeSchema.optional(),
  kind: z.enum(['cash', 'gift', 'favor', 'service', 'other']),
  amount: z.number().int().min(0).max(MAX_MONEY_AMOUNT).optional(),
  itemSummary: z.string().min(1).optional(),
  fromActorId: z.string().min(1).optional(),
  fromSummary: z.string().min(1),
  relatedActorIds: z.array(z.string().min(1)).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  relatedCaseIds: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1),
  playerExplanation: z.string().min(1).optional(),
  exposureRisk: z.number().int().min(0).max(100).default(50),
  status: z.enum(['hidden', 'suspected', 'exposed', 'settled']).default('hidden'),
  visibility: visibilitySchema.default('player_known')
});

export const grayLedgerPatchSchema = z.object({
  entries: z.array(grayLedgerEntryPatchSchema).default([])
});

export const homeBasePatchSchema = z.object({
  placeId: z.string().min(1).optional(),
  placeName: z.string().min(1).optional(),
  housingType: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  householdSummary: z.string().min(1).optional()
});

export const reputationPatchSchema = z.object({
  circle: reputationCircleSchema,
  visibilityDelta: z.number().int().min(-1000).max(1000).optional(),
  visibilitySet: z.number().int().min(0).max(1000).optional(),
  standingDelta: z.number().int().min(-100).max(100).optional(),
  standingSet: z.number().int().min(-100).max(100).optional(),
  summary: z.string().min(1).optional(),
  reason: z.string().min(1).optional()
});

export const playerReputationPatchSchema = z.object({
  notorietyDelta: z.number().int().min(-1000).max(1000).optional(),
  notorietySet: z.number().int().min(0).max(1000).optional(),
  overallReputationDelta: z.number().int().min(-100).max(100).optional(),
  overallReputationSet: z.number().int().min(-100).max(100).optional(),
  summary: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  circlePatches: z.array(reputationPatchSchema).default([])
});

const clothingModeSchema = z.enum(['duty_uniform', 'off_duty_plain', 'formal', 'disguise', 'special', 'sleepwear', 'other']);

const playerClothingPatchSchema = z.object({
  currentSummary: z.string().min(1),
  mode: clothingModeSchema,
  sourceItemId: z.string().min(1).optional(),
  sourceItemSignificance: z.string().min(1).optional(),
  lastChangedReason: z.string().min(1).optional()
});

const policeClimateKeySchema = z.enum([
  'discipline_pressure',
  'integrity_pressure',
  'media_attention',
  'triad_activity',
  'public_trust',
  'internal_morale',
  'supervisor_attitude',
  'district_pressure',
  'other'
]);

const policeRankBoundaryPatchSchema = z
  .object({
    can: z.array(z.string().min(1)).max(8).optional(),
    cannot: z.array(z.string().min(1)).max(8).optional(),
    contacts: z.array(z.string().min(1)).max(8).optional()
  })
  .passthrough();

const policeCareerPathPatchSchema = z
  .object({
    currentRank: z.string().min(1).optional(),
    targetRank: z.string().min(1).optional(),
    routeSummary: z.string().min(1).optional(),
    knownRequirements: z.array(z.string().min(1)).max(8).optional(),
    dynamicAssessment: z.record(z.string(), z.string().min(1)).optional(),
    opportunities: z.array(z.string().min(1)).max(8).optional(),
    obstacles: z.array(z.string().min(1)).max(8).optional(),
    suggestedActions: z.array(z.string().min(1)).max(8).optional()
  })
  .passthrough();

const policeClimatePatchSchema = z
  .object({
    key: policeClimateKeySchema,
    label: z.string().min(1),
    level: z.string().min(1),
    summary: z.string().min(1)
  })
  .passthrough();

const policePanelPatchSchema = z
  .object({
    unitSummary: z.string().min(1).optional(),
    rankBoundary: policeRankBoundaryPatchSchema.optional(),
    careerPath: policeCareerPathPatchSchema.optional(),
    climate: z.array(policeClimatePatchSchema).max(8).optional(),
    relatedActorIds: z.array(z.string().min(1)).max(12).optional(),
    actionHints: z.array(z.string().min(1)).max(6).optional()
  })
  .passthrough();

const grayNetworkConfidenceSchema = z.enum(['low', 'medium', 'high']);
const grayNetworkVisibilityLevelSchema = z.enum(['hidden', 'rumor', 'known', 'confirmed']);
const grayNetworkClimateLevelSchema = z.enum([
  'unknown',
  'low',
  'medium',
  'high',
  'rising',
  'falling',
  'active',
  'quiet',
  'tense',
  'rumor',
  'known',
  'confirmed'
]);
const grayNetworkRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
const currentIdentitySchema = z.enum(['civilian', 'gang_member', 'police']);

const identityVisibilitySchema = z
  .object({
    police: grayNetworkVisibilityLevelSchema.optional(),
    gang_member: grayNetworkVisibilityLevelSchema.optional(),
    civilian: grayNetworkVisibilityLevelSchema.optional()
  })
  .default({});

const grayNetworkClimateItemSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  level: grayNetworkClimateLevelSchema,
  summary: z.string().min(1),
  confidence: grayNetworkConfidenceSchema,
  lastUpdatedTurn: z.number().int().optional()
});

const knownGrayOrganizationSchema = z.object({
  organizationId: z.string().min(1).optional(),
  name: z.string().min(1),
  visibleName: z.string().min(1),
  summary: z.string().min(1),
  knownScope: z.string().min(1),
  confidence: grayNetworkConfidenceSchema,
  visibility: identityVisibilitySchema,
  relatedActorIds: z.array(z.string().min(1)).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  relatedCaseIds: z.array(z.string().min(1)).default([]),
  updatedAtTurn: z.number().int().optional()
});

const grayNetworkPlaceProjectionSchema = z.object({
  placeId: z.string().min(1),
  visibleRole: z.string().min(1),
  tieSummary: z.string().min(1),
  riskSummary: z.string().min(1),
  confidence: grayNetworkConfidenceSchema,
  visibility: identityVisibilitySchema,
  relatedActorIds: z.array(z.string().min(1)).default([]),
  relatedOrganizationIds: z.array(z.string().min(1)).default([]),
  relatedCaseIds: z.array(z.string().min(1)).default([]),
  updatedAtTurn: z.number().int().optional()
});

const grayNetworkPersonProjectionSchema = z.object({
  actorId: z.string().min(1),
  visibleRole: z.string().min(1),
  knownTieSummary: z.string().min(1),
  attitudeToPlayer: z.string().min(1).optional(),
  contactDepth: z.number().int().min(0).optional(),
  riskNote: z.string().min(1).optional(),
  confidence: grayNetworkConfidenceSchema,
  visibility: identityVisibilitySchema,
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  relatedOrganizationIds: z.array(z.string().min(1)).default([]),
  relatedCaseIds: z.array(z.string().min(1)).default([]),
  updatedAtTurn: z.number().int().optional()
});

const grayNetworkRelationClueSchema = z.object({
  clueId: z.string().min(1),
  summary: z.string().min(1),
  certainty: certaintySchema,
  confidence: grayNetworkConfidenceSchema,
  visibility: identityVisibilitySchema,
  relatedActorIds: z.array(z.string().min(1)).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  relatedOrganizationIds: z.array(z.string().min(1)).default([]),
  relatedCaseIds: z.array(z.string().min(1)).default([]),
  updatedAtTurn: z.number().int().optional()
});

const identityProjectedActionRiskSchema = z.object({
  riskId: z.string().min(1),
  identity: currentIdentitySchema,
  title: z.string().min(1),
  level: grayNetworkRiskLevelSchema,
  summary: z.string().min(1),
  suggestedMitigation: z.string().min(1).optional(),
  relatedActorIds: z.array(z.string().min(1)).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  updatedAtTurn: z.number().int().optional()
});

const identityProjectedSuggestedActionSchema = z.object({
  actionId: z.string().min(1),
  identity: currentIdentitySchema,
  text: z.string().min(1),
  rationale: z.string().min(1),
  riskLevel: grayNetworkRiskLevelSchema,
  relatedActorIds: z.array(z.string().min(1)).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  updatedAtTurn: z.number().int().optional()
});

const grayNetworkRemoveIdsSchema = z.object({
  climateKeys: z.array(z.string().min(1)).optional(),
  organizationIds: z.array(z.string().min(1)).optional(),
  organizationKeys: z.array(z.string().min(1)).optional(),
  placeIds: z.array(z.string().min(1)).optional(),
  actorIds: z.array(z.string().min(1)).optional(),
  clueIds: z.array(z.string().min(1)).optional(),
  riskIds: z.array(z.string().min(1)).optional(),
  actionIds: z.array(z.string().min(1)).optional(),
  suggestedActionIds: z.array(z.string().min(1)).optional()
});

const grayNetworkScalarPatchSchema = z.object({
  areaId: z.string().min(1).optional(),
  areaName: z.string().min(1).optional()
});

export const grayNetworkPatchSchema = z.object({
  areaId: z.string().min(1).optional(),
  areaName: z.string().min(1).optional(),
  climate: z.array(grayNetworkClimateItemSchema).optional(),
  knownOrganizations: z.array(knownGrayOrganizationSchema).optional(),
  keyPlaces: z.array(grayNetworkPlaceProjectionSchema).optional(),
  relatedPeople: z.array(grayNetworkPersonProjectionSchema).optional(),
  relationClues: z.array(grayNetworkRelationClueSchema).optional(),
  actionRisks: z.array(identityProjectedActionRiskSchema).optional(),
  suggestedActions: z.array(identityProjectedSuggestedActionSchema).optional(),
  removeIds: grayNetworkRemoveIdsSchema.optional()
});

function isWritebackRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addGrayNetworkIssues(warnings: StoryDiagnosticIssue[], prefix: Array<string | number>, error: z.ZodError) {
  for (const issue of error.issues) {
    warnings.push({
      path: [...prefix, ...issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment)))],
      message: issue.message,
      code: issue.code
    });
  }
}

function parseGrayNetworkScalarPatch(
  value: Record<string, unknown>,
  path: Array<string | number>,
  warnings: StoryDiagnosticIssue[]
): z.infer<typeof grayNetworkScalarPatchSchema> {
  const parsed = grayNetworkScalarPatchSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  addGrayNetworkIssues(warnings, path, parsed.error);
  return {
    areaId: typeof value.areaId === 'string' && value.areaId.trim() ? value.areaId : undefined,
    areaName: typeof value.areaName === 'string' && value.areaName.trim() ? value.areaName : undefined
  };
}

function parseGrayNetworkArrayItems<T>(
  schema: z.ZodType<T>,
  value: unknown,
  path: Array<string | number>,
  warnings: StoryDiagnosticIssue[]
): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    warnings.push({
      path,
      message: 'Expected an array; omitted this gray-network field.',
      code: 'invalid_type'
    });
    return undefined;
  }

  const items: T[] = [];
  value.forEach((item, index) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) {
      items.push(parsed.data);
    } else {
      addGrayNetworkIssues(warnings, [...path, index], parsed.error);
    }
  });
  return items;
}

function parseGrayNetworkRemoveIds(
  value: unknown,
  path: Array<string | number>,
  warnings: StoryDiagnosticIssue[]
): z.infer<typeof grayNetworkRemoveIdsSchema> | undefined {
  if (value === undefined) return undefined;
  if (!isWritebackRecord(value)) {
    warnings.push({
      path,
      message: 'Expected a gray-network removal object; omitted this field.',
      code: 'invalid_type'
    });
    return undefined;
  }

  const keys = [
    'climateKeys',
    'organizationIds',
    'organizationKeys',
    'placeIds',
    'actorIds',
    'clueIds',
    'riskIds',
    'actionIds',
    'suggestedActionIds'
  ] as const;
  const removeIds: z.infer<typeof grayNetworkRemoveIdsSchema> = {};

  for (const key of keys) {
    const raw = value[key];
    if (raw === undefined) continue;
    const parsed = z.array(z.string().min(1)).safeParse(raw);
    if (parsed.success) {
      removeIds[key] = parsed.data;
    } else {
      addGrayNetworkIssues(warnings, [...path, key], parsed.error);
    }
  }

  return Object.keys(removeIds).length ? removeIds : undefined;
}

function sanitizeGrayNetworkPatch(
  value: unknown,
  path: Array<string | number>,
  warnings: StoryDiagnosticIssue[]
): z.infer<typeof grayNetworkPatchSchema> | undefined {
  if (!isWritebackRecord(value)) {
    warnings.push({
      path,
      message: 'Expected a gray-network patch object; omitted this item.',
      code: 'invalid_type'
    });
    return undefined;
  }

  const scalarPatch = parseGrayNetworkScalarPatch(value, path, warnings);

  return {
    ...scalarPatch,
    climate: parseGrayNetworkArrayItems(grayNetworkClimateItemSchema, value.climate, [...path, 'climate'], warnings),
    knownOrganizations: parseGrayNetworkArrayItems(
      knownGrayOrganizationSchema,
      value.knownOrganizations,
      [...path, 'knownOrganizations'],
      warnings
    ),
    keyPlaces: parseGrayNetworkArrayItems(grayNetworkPlaceProjectionSchema, value.keyPlaces, [...path, 'keyPlaces'], warnings),
    relatedPeople: parseGrayNetworkArrayItems(
      grayNetworkPersonProjectionSchema,
      value.relatedPeople,
      [...path, 'relatedPeople'],
      warnings
    ),
    relationClues: parseGrayNetworkArrayItems(
      grayNetworkRelationClueSchema,
      value.relationClues,
      [...path, 'relationClues'],
      warnings
    ),
    actionRisks: parseGrayNetworkArrayItems(
      identityProjectedActionRiskSchema,
      value.actionRisks,
      [...path, 'actionRisks'],
      warnings
    ),
    suggestedActions: parseGrayNetworkArrayItems(
      identityProjectedSuggestedActionSchema,
      value.suggestedActions,
      [...path, 'suggestedActions'],
      warnings
    ),
    removeIds: parseGrayNetworkRemoveIds(value.removeIds, [...path, 'removeIds'], warnings)
  };
}

export function sanitizeGrayNetworkPatches(
  rawPatches: unknown,
  warnings: StoryDiagnosticIssue[],
  path: Array<string | number> = ['writeback', 'grayNetworkPatches']
): z.infer<typeof grayNetworkPatchSchema>[] {
  const grayNetworkPatches = Array.isArray(rawPatches)
    ? rawPatches.flatMap((patch, index) => {
        const sanitized = sanitizeGrayNetworkPatch(patch, [...path, index], warnings);
        return sanitized ? [sanitized] : [];
      })
    : [];

  if (!Array.isArray(rawPatches)) {
    warnings.push({
      path,
      message: 'Expected an array; omitted this writeback module.',
      code: 'invalid_type'
    });
  }

  return grayNetworkPatches;
}

function sanitizeNarratorGrayNetworkPatches(value: unknown): unknown {
  if (!isWritebackRecord(value) || !isWritebackRecord(value.writeback)) return value;
  if (value.writeback.grayNetworkPatches === undefined) return value;

  const warnings: StoryDiagnosticIssue[] = [];
  const grayNetworkPatches = sanitizeGrayNetworkPatches(value.writeback.grayNetworkPatches, warnings);

  return {
    ...value,
    validationWarnings: [...((value.validationWarnings as StoryDiagnosticIssue[] | undefined) ?? []), ...warnings],
    writeback: {
      ...value.writeback,
      grayNetworkPatches
    }
  };
}

const dramaWritebackRefSchema = z
  .object({
    kind: z.string().min(1),
    id: z.string().min(1)
  })
  .strict();

const customEventFactStateChangeSchema = z
  .object({
    factId: z.string().min(1),
    state: z.enum(['established_in_save', 'invalidated_in_save']),
    supportingWritebackRefs: z.array(dramaWritebackRefSchema).min(1)
  })
  .strict();

const customEventProgressTraceSchema = z
  .object({
    instanceId: z.string().min(1),
    stageId: z.string().min(1),
    usedNodeIds: z.array(z.string().min(1)).default([]),
    decision: z.enum(['stay', 'advance', 'complete', 'diverge']),
    nextStageId: z.string().min(1).optional(),
    supportingWritebackRefs: z.array(dramaWritebackRefSchema).min(1),
    factStateChanges: z.array(customEventFactStateChangeSchema).default([])
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.usedNodeIds).size !== value.usedNodeIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['usedNodeIds'],
        message: 'usedNodeIds 不能重复'
      });
    }
    const factIds = value.factStateChanges.map((change) => change.factId);
    if (new Set(factIds).size !== factIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['factStateChanges'],
        message: '同一 factId 不能在一次进度回执中重复修改'
      });
    }
    if (value.decision === 'advance' && !value.nextStageId) {
      context.addIssue({
        code: 'custom',
        path: ['nextStageId'],
        message: 'advance 必须提供 nextStageId'
      });
    }
    if (value.decision !== 'advance' && value.nextStageId) {
      context.addIssue({
        code: 'custom',
        path: ['nextStageId'],
        message: '只有 advance 可以提供 nextStageId'
      });
    }
  });

const narrativeArcProgressTraceSchema = z.preprocess(
  (value) => {
    if (!isWritebackRecord(value) || value.decision !== 'remain') return value;
    const supportingWritebackRefs = Array.isArray(value.supportingWritebackRefs)
      ? value.supportingWritebackRefs.flatMap((ref) => {
          const parsed = dramaWritebackRefSchema.safeParse(ref);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    return {
      ...value,
      supportingWritebackRefs
    };
  },
  z.object({
    arcInstanceId: z.string().min(1),
    sourceRef: z
      .object({
        providerId: z.string().min(1),
        sourceType: z.string().min(1),
        sourceId: z.string().min(1),
        dlcId: z.string().min(1).optional()
      })
      .strict(),
    decision: z.enum(['remain', 'advance_stage', 'complete', 'abandon']),
    currentStageId: z.string().min(1).optional(),
    previousStageId: z.string().min(1).optional(),
    nextStageId: z.string().min(1).optional(),
    usedNodeIds: z.array(z.string().min(1)).default([]),
    supportingWritebackRefs: z.array(dramaWritebackRefSchema).default([]),
    summary: z.string().trim().min(1).max(2000).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.usedNodeIds).size !== value.usedNodeIds.length) {
      context.addIssue({ code: 'custom', path: ['usedNodeIds'], message: 'usedNodeIds 不能重复' });
    }
    if (value.decision === 'advance_stage' && !value.nextStageId) {
      context.addIssue({ code: 'custom', path: ['nextStageId'], message: 'advance_stage 必须提供 nextStageId' });
    }
    if (value.decision !== 'advance_stage' && value.nextStageId) {
      context.addIssue({ code: 'custom', path: ['nextStageId'], message: '只有 advance_stage 可以提供 nextStageId' });
    }
    if (value.decision !== 'remain' && value.supportingWritebackRefs.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['supportingWritebackRefs'],
        message: '推进、完成或放弃剧情弧必须引用至少一项本回合写回'
      });
    }
  })
);

export const dramaExecutionTraceSchema = z
  .object({
    planId: z.string().min(1),
    status: z.enum([
      'not_used',
      'used_as_texture',
      'partially_used',
      'used_persistently'
    ]),
    usedSourceRefs: z
      .array(
        z
          .object({
            providerId: z.string().min(1),
            sourceType: z.string().min(1),
            sourceId: z.string().min(1),
            dlcId: z.string().min(1).optional()
          })
          .strict()
      )
      .default([]),
    resultingWritebackRefs: z
      .array(dramaWritebackRefSchema)
      .default([]),
    customEventProgress: z.array(customEventProgressTraceSchema).optional(),
    narrativeArcProgress: z.array(narrativeArcProgressTraceSchema).optional()
  })
  .strict();

function sanitizeInvalidDramaExecutionTrace(value: unknown): unknown {
  if (!isWritebackRecord(value) || value.dramaExecutionTrace === undefined) return value;
  let traceCandidate = value.dramaExecutionTrace;
  const progressWarnings: StoryDiagnosticIssue[] = [];
  if (
    isWritebackRecord(traceCandidate) &&
    traceCandidate.customEventProgress !== undefined
  ) {
    const rawProgress = traceCandidate.customEventProgress;
    const validProgress = Array.isArray(rawProgress)
      ? rawProgress.flatMap((item, index) => {
          const parsedItem = customEventProgressTraceSchema.safeParse(item);
          if (parsedItem.success) return [parsedItem.data];
          progressWarnings.push({
            path: ['dramaExecutionTrace', 'customEventProgress', index],
            code: 'custom_event_progress_schema_invalid',
            message: `自定义事件进度项格式无效，已忽略该项并保留基础执行回执：${parsedItem.error.issues
              .map(
                (issue) =>
                  `${issue.path.join('.') || 'progress'} ${issue.message}`
              )
              .join('；')}`
          });
          return [];
        })
      : [];
    if (!Array.isArray(rawProgress)) {
      progressWarnings.push({
        path: ['dramaExecutionTrace', 'customEventProgress'],
        code: 'custom_event_progress_schema_invalid',
        message: 'customEventProgress 必须是数组；已忽略该字段并保留基础执行回执。'
      });
    }
    traceCandidate = {
      ...traceCandidate,
      customEventProgress: validProgress
    };
  }
  if (
    isWritebackRecord(traceCandidate) &&
    traceCandidate.narrativeArcProgress !== undefined
  ) {
    const rawProgress = traceCandidate.narrativeArcProgress;
    const validProgress = Array.isArray(rawProgress)
      ? rawProgress.flatMap((item, index) => {
          const parsedItem = narrativeArcProgressTraceSchema.safeParse(item);
          if (parsedItem.success) {
            if (isWritebackRecord(item) && item.decision === 'remain') {
              const rawRefs = item.supportingWritebackRefs;
              const ignoredRefCount = Array.isArray(rawRefs)
                ? rawRefs.filter((ref) => !dramaWritebackRefSchema.safeParse(ref).success).length
                : rawRefs === undefined
                  ? 0
                  : 1;
              if (ignoredRefCount > 0) {
                progressWarnings.push({
                  path: ['dramaExecutionTrace', 'narrativeArcProgress', index, 'supportingWritebackRefs'],
                  code: 'narrative_arc_remain_evidence_ignored',
                  message: `remain 不依赖写回证据；已忽略 ${ignoredRefCount} 项格式无效的 supportingWritebackRefs，并保留当前阶段。`
                });
              }
            }
            return [parsedItem.data];
          }
          progressWarnings.push({
            path: ['dramaExecutionTrace', 'narrativeArcProgress', index],
            code: 'narrative_arc_progress_schema_invalid',
            message: `剧情弧进度项格式无效，已忽略该项并保留基础执行回执：${parsedItem.error.issues
              .map((issue) => `${issue.path.join('.') || 'progress'} ${issue.message}`)
              .join('；')}`
          });
          return [];
        })
      : [];
    if (!Array.isArray(rawProgress)) {
      progressWarnings.push({
        path: ['dramaExecutionTrace', 'narrativeArcProgress'],
        code: 'narrative_arc_progress_schema_invalid',
        message: 'narrativeArcProgress 必须是数组；已忽略该字段并保留基础执行回执。'
      });
    }
    traceCandidate = {
      ...traceCandidate,
      narrativeArcProgress: validProgress
    };
  }
  const parsed = dramaExecutionTraceSchema.safeParse(traceCandidate);
  if (parsed.success) {
    return {
      ...value,
      dramaExecutionTrace: parsed.data,
      ...(progressWarnings.length > 0
        ? {
            validationWarnings: [
              ...(Array.isArray(value.validationWarnings)
                ? (value.validationWarnings as StoryDiagnosticIssue[])
                : []),
              ...progressWarnings
            ]
          }
        : {})
    };
  }
  const validationWarnings = Array.isArray(value.validationWarnings)
    ? value.validationWarnings
    : [];
  const { dramaExecutionTrace: _ignored, ...rest } = value;
  return {
    ...rest,
    validationWarnings: [
      ...validationWarnings,
      {
        path: ['dramaExecutionTrace'],
        code: 'drama_execution_trace_schema_invalid',
        message: `戏剧执行回执格式无效，已忽略回执并保留正文与合法写回：${parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'trace'} ${issue.message}`)
          .join('；')}`
      }
    ]
  };
}

function normalizeNestedDramaExecutionTrace(value: unknown): unknown {
  if (!isWritebackRecord(value) || value.dramaExecutionTrace !== undefined) return value;
  const writeback = value.writeback;
  if (!isWritebackRecord(writeback) || writeback.dramaExecutionTrace === undefined) return value;
  return {
    ...value,
    dramaExecutionTrace: writeback.dramaExecutionTrace
  };
}

function sanitizeNarratorResponse(value: unknown): unknown {
  return sanitizeInvalidDramaExecutionTrace(
    normalizeNestedDramaExecutionTrace(sanitizeNarratorGrayNetworkPatches(value))
  );
}

export const playerPatchSchema = z.object({
  economy: economyPatchSchema.optional(),
  progression: progressionPatchSchema.optional(),
  homeBase: homeBasePatchSchema.optional(),
  clothing: playerClothingPatchSchema.optional(),
  equipment: z.array(z.string().min(1)).max(3).optional(),
  reputation: playerReputationPatchSchema.optional(),
  policePanel: policePanelPatchSchema.optional(),
  reputationPatches: z.array(reputationPatchSchema).default([])
});

export const secretFactSchema = z.object({
  secretId: z.string().min(1),
  ownerType: z.enum(['actor', 'player', 'organization', 'case', 'place']),
  ownerId: z.string().min(1),
  kind: z.enum(['identity', 'loyalty', 'relationship', 'risk', 'control', 'other']),
  summary: z.string().min(1),
  playerCharacterKnown: z.boolean().default(false),
  publicKnown: z.boolean().default(false),
  knownByActorIds: z.array(z.string().min(1)).default([]),
  revealState: z
    .enum(['hidden', 'known_to_player_character', 'known_to_some_actors', 'publicly_revealed'])
    .default('hidden'),
  revealConditions: z.array(z.string().min(1)).default([]),
  visibility: z.enum(['hidden', 'player_known', 'public']).default('hidden'),
  importance: z.number().int().min(0).max(100).default(50),
  createdAt: writebackGameTimeSchema.optional(),
  updatedAt: writebackGameTimeSchema.optional()
});

function normalizeSecretFactPatchInput(value: unknown): unknown {
  if (!isWritebackRecord(value) || value.operation !== 'add') return value;

  const knownByActorIds = Array.isArray(value.knownByActorIds)
    ? value.knownByActorIds.filter((actorId): actorId is string => typeof actorId === 'string' && actorId.trim().length > 0)
    : [];
  const revealConditions = Array.isArray(value.revealConditions)
    ? value.revealConditions
    : typeof value.revealConditions === 'string' && value.revealConditions.trim()
      ? [value.revealConditions]
      : [];
  const rawKind = typeof value.factType === 'string' ? value.factType : '';
  const kind = ['identity', 'loyalty', 'relationship', 'risk', 'control', 'other'].includes(rawKind)
    ? rawKind
    : rawKind === 'actual_allegiance'
      ? 'loyalty'
      : 'other';
  const playerCharacterKnown = knownByActorIds.includes('player');

  return {
    operation: 'upsert',
    fact: {
      secretId: value.factId,
      ownerType: 'player',
      ownerId: 'player',
      kind,
      summary: value.description,
      playerCharacterKnown,
      publicKnown: false,
      knownByActorIds,
      revealState: playerCharacterKnown ? 'known_to_player_character' : 'known_to_some_actors',
      revealConditions,
      visibility: playerCharacterKnown ? 'player_known' : 'hidden',
      importance: 70
    }
  };
}

const canonicalSecretFactPatchSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('upsert'), fact: secretFactSchema }),
  z.object({ operation: z.literal('remove'), secretId: z.string().min(1) })
]);

export const secretFactPatchSchema = z.preprocess(normalizeSecretFactPatchInput, canonicalSecretFactPatchSchema);

export const identityTargetRoleProfileSchema = z.discriminatedUnion('identity', [
  z.object({ identity: z.literal('police'), profile: policeRoleProfilePatchSchema }),
  z.object({ identity: z.literal('gang_member'), profile: triadRoleProfilePatchSchema }),
  z.object({ identity: z.literal('civilian'), profile: civilianRoleProfilePatchSchema })
]);

function createDeterministicTransitionId(value: Record<string, unknown>): string | undefined {
  const requiredFields = ['kind', 'fromIdentity', 'toIdentity', 'publicIdentity', 'reason'] as const;
  if (requiredFields.some((field) => typeof value[field] !== 'string' || value[field].trim().length === 0)) {
    return undefined;
  }

  const source = JSON.stringify({
    kind: value.kind,
    fromIdentity: value.fromIdentity,
    toIdentity: value.toIdentity,
    publicIdentity: value.publicIdentity,
    policeNumber: value.policeNumber,
    reason: value.reason,
    targetRoleProfile: value.targetRoleProfile
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `transition_auto_${(hash >>> 0).toString(36)}`;
}

function normalizeIdentityContextPatchInput(value: unknown): unknown {
  if (!isWritebackRecord(value)) return value;

  const normalized = { ...value };
  if (value.kind === 'status_change') {
    if (value.fromIdentity === 'civilian' && value.toIdentity !== 'civilian') normalized.kind = 'join';
    else if (value.fromIdentity !== 'civilian' && value.toIdentity === 'civilian') normalized.kind = 'leave';
    else if (value.fromIdentity === value.toIdentity) normalized.kind = 'correction';
  }

  if (
    (typeof normalized.reason !== 'string' || normalized.reason.trim().length === 0) &&
    typeof normalized.kind === 'string' &&
    typeof normalized.fromIdentity === 'string' &&
    typeof normalized.toIdentity === 'string'
  ) {
    normalized.reason = `结构化身份转换：${normalized.fromIdentity} -> ${normalized.toIdentity}（${normalized.kind}）。`;
  }

  let targetRoleProfile = value.targetRoleProfile;
  if (isWritebackRecord(targetRoleProfile) && !isWritebackRecord(targetRoleProfile.profile)) {
    const identity = value.toIdentity;
    const nestedProfile =
      identity === 'police'
        ? targetRoleProfile.police
        : identity === 'gang_member'
          ? targetRoleProfile.gang_member ?? targetRoleProfile.triad
          : identity === 'civilian'
            ? targetRoleProfile.civilian
            : undefined;
    if (isWritebackRecord(nestedProfile)) {
      targetRoleProfile = { identity, profile: nestedProfile };
    }
  }

  if (isWritebackRecord(targetRoleProfile) && isWritebackRecord(targetRoleProfile.profile)) {
    const normalizedTargetRoleProfile = { ...targetRoleProfile };
    const profile = { ...targetRoleProfile.profile };
    if (targetRoleProfile.identity === 'gang_member') {
      profile.organizationId ??= profile.affiliation;
      profile.roleTitle ??= profile.role;
      profile.coverIdentitySummary ??= profile.coverOccupation;
      profile.riskSummary ??= profile.legalStatusSummary;
    } else if (targetRoleProfile.identity === 'police') {
      profile.agencyId ??= profile.affiliation ?? profile.organizationId;
      profile.rank ??= profile.role ?? profile.roleTitle;
      profile.stationOrPost ??= profile.station;
      profile.department ??= profile.unit;
      profile.assignmentSummary ??= profile.assignment;
      profile.postRole ??= profile.position;
    } else if (targetRoleProfile.identity === 'civilian') {
      profile.publicOccupation ??= profile.occupation;
      profile.workplacePlaceId ??= profile.workplace;
    }
    normalizedTargetRoleProfile.profile = profile;
    normalized.targetRoleProfile = normalizedTargetRoleProfile;
  }

  normalized.transitionId ??= createDeterministicTransitionId(normalized);

  return normalized;
}

const canonicalIdentityContextPatchSchema = z
  .object({
    transitionId: z.string().min(1),
    kind: z.enum(['join', 'leave', 'cover_enter', 'cover_exit', 'exposure', 'correction']),
    fromIdentity: currentIdentitySchema,
    toIdentity: currentIdentitySchema,
    publicIdentity: z.string().min(1),
    policeNumber: z.string().regex(/^\d{4}$/).optional(),
    actualIdentitySummary: z.string().min(1).optional(),
    reason: z.string().min(1),
    targetRoleProfile: identityTargetRoleProfileSchema,
    secretFactPatches: z.array(secretFactPatchSchema).default([])
  })
  .superRefine((patch, context) => {
    if (patch.toIdentity !== patch.targetRoleProfile.identity) {
      context.addIssue({
        code: 'custom',
        path: ['targetRoleProfile', 'identity'],
        message: 'targetRoleProfile.identity must match toIdentity.'
      });
    }
    if (patch.toIdentity !== 'police' && patch.policeNumber !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['policeNumber'],
        message: 'policeNumber is only valid when toIdentity is police.'
      });
    }
  });

export const identityContextPatchSchema = z.preprocess(
  normalizeIdentityContextPatchInput,
  canonicalIdentityContextPatchSchema
);

export const locationPatchSchema = z
  .object({
    currentPlaceId: z.string().min(1).optional(),
    currentSceneId: z.string().min(1).optional(),
    reason: z.string().min(1).optional()
  })
  .refine((patch) => patch.currentPlaceId !== undefined || patch.currentSceneId !== undefined, {
    message: 'At least one current location field is required.'
  });

const assetGameTimeSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59)
});

const assetEvidenceSchema = z.object({
  caseId: z.string().min(1),
  caseTitle: z.string().min(1).optional(),
  summary: z.string().min(1),
  disputed: z.boolean().default(false),
  disputeSummary: z.string().min(1).optional()
});

const assetWearableSchema = z.object({
  wearSummary: z.string().min(1),
  significance: z.string().min(1).optional()
});

const assetBaseSchema = z
  .object({
    itemId: z.string().min(1),
    name: z.string().min(1),
    summary: z.string().min(1),
    detail: z.string().min(1).optional(),
    acquiredAt: assetGameTimeSchema.optional(),
    relatedActorIds: z.array(z.string().min(1)).default([]),
    relatedCaseIds: z.array(z.string().min(1)).default([]),
    relatedPlaceIds: z.array(z.string().min(1)).default([]),
    evidence: assetEvidenceSchema.optional(),
    wearable: assetWearableSchema.optional(),
    visibility: visibilitySchema.default('player_known'),
    importance: z.number().int().min(0).max(100).default(50),
    worldpackAssetData: z.record(z.string(), z.unknown()).default({})
  })
  .passthrough();

const equipmentAssetItemSchema = assetBaseSchema.extend({
  category: z.literal('equipment')
});

const generalAssetItemSchema = assetBaseSchema.extend({
  category: z.literal('general')
});

const documentAssetItemSchema = assetBaseSchema.extend({
  category: z.literal('document')
});

const valuableAssetItemSchema = assetBaseSchema.extend({
  category: z.literal('valuable')
});

const fixedAssetSchema = assetBaseSchema.extend({
  category: z.literal('fixedAsset'),
  fixedAssetType: z.enum(['residence', 'rentalProperty', 'businessPremise', 'storage', 'parkingSpace', 'investment', 'other']),
  holdingRelation: z.enum(['owned', 'rented', 'assigned', 'familyOwned', 'managed', 'mortgaged', 'unknown']),
  primaryUse: z.enum(['home', 'rentalIncome', 'business', 'storage', 'parking', 'investment', 'other']),
  locationSummary: z.string().min(1),
  placeId: z.string().min(1).optional(),
  ownershipSummary: z.string().min(1),
  accessSummary: z.string().min(1),
  valueAmount: z.number().optional(),
  incomeSettlementItemIds: z.array(z.string().min(1)).default([]),
  expenseSettlementItemIds: z.array(z.string().min(1)).default([])
});

const vehicleAssetSchema = assetBaseSchema.extend({
  category: z.literal('vehicle'),
  vehicleType: z.enum(['privateCar', 'motorcycle', 'taxi', 'policeVehicle', 'boat', 'publicTransportPass', 'other']),
  holdingRelation: z.enum(['owned', 'rented', 'assigned', 'borrowed', 'keptForOther', 'seized', 'unknown']),
  condition: z.enum(['good', 'usable', 'poor', 'broken', 'unknown']),
  locationSummary: z.string().min(1),
  accessSummary: z.string().min(1),
  valueAmount: z.number().optional(),
  mobilityProfile: z
    .object({
      mode: z.enum(['walk', 'publicTransit', 'taxi', 'car', 'motorcycle', 'boat', 'policeVehicle']),
      timeMultiplier: z.number().positive(),
      availabilitySummary: z.string().min(1)
    })
    .optional(),
  incomeSettlementItemIds: z.array(z.string().min(1)).default([]),
  expenseSettlementItemIds: z.array(z.string().min(1)).default([])
});

export const assetItemSchema = z.discriminatedUnion('category', [
  equipmentAssetItemSchema,
  generalAssetItemSchema,
  documentAssetItemSchema,
  valuableAssetItemSchema,
  fixedAssetSchema,
  vehicleAssetSchema
]);

export const assetRemoveItemSchema = z.object({
  itemId: z.string().min(1),
  reason: z.string().min(1),
  movedToCaseId: z.string().min(1).optional()
});

export const assetPatchSchema = z.object({
  upsertItems: z.array(assetItemSchema).default([]),
  removeItems: z.array(assetRemoveItemSchema).default([]),
  equippedItemIds: z.array(z.string().min(1)).max(3).optional()
});

export const visualAnchorPatchSchema = z.object({
  mapId: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  precision: z.enum(['exact', 'approximate', 'district_only']),
  source: z.enum(['worldpack_canonical', 'manual_calibration', 'runtime_inferred']).optional(),
  basisPlaceIds: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional()
});

export const placePatchSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1).optional(),
  nameZh: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).optional(),
  regionId: z.string().min(1).optional(),
  districtId: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  publicKnowledge: z.string().min(1).optional(),
  currentState: z.string().min(1).optional(),
  streetAddressText: z.string().min(1).optional(),
  roadAnchors: z.array(z.string().min(1)).optional(),
  playerKnownSummary: z.string().min(1).optional(),
  canonical: z.boolean().optional(),
  source: z.enum(['worldpack_canonical', 'runtime_generated']).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  historicalNote: z.string().min(1).optional(),
  researchNote: z.string().min(1).optional(),
  owningOrganizationId: z.string().min(1).optional(),
  relatedActorIds: z.array(z.string().min(1)).optional(),
  relatedCaseIds: z.array(z.string().min(1)).optional(),
  relatedPressureIds: z.array(z.string().min(1)).optional(),
  visualAnchor: visualAnchorPatchSchema.optional()
});

export const scenePatchSchema = z.object({
  sceneId: z.string().min(1),
  placeId: z.string().min(1),
  name: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  temporaryState: z.string().min(1).optional(),
  presentActorIds: z.array(z.string().min(1)).optional()
});

const caseStatusSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  const legacyMap: Record<string, string> = {
    open: 'investigating',
    dormant: 'cold',
    closed: 'archived',
    sealed: 'archived'
  };
  return legacyMap[normalized] ?? normalized;
}, z.enum(['intake', 'investigating', 'submitted_to_prosecutions', 'prosecution_review', 'charged', 'court_scheduled', 'tried', 'sentenced', 'returned', 'archived', 'cold']));

const casePlayerRoleSchema = z.enum(['lead', 'assist', 'execute', 'involved', 'aware']);
const caseEvidenceTypeSchema = z.enum(['physical', 'document', 'statement', 'photo', 'recording', 'scene_record', 'report', 'other']);
const caseActivityKindSchema = z.enum([
  'created',
  'evidence_added',
  'status_changed',
  'lead_changed',
  'actor_added',
  'place_added',
  'instruction',
  'prosecution_update',
  'court_update',
  'archived',
  'note'
]);

export const caseEvidencePatchSchema = z.object({
  evidenceId: z.string().min(1),
  caseId: z.string().min(1),
  title: z.string().min(1).optional(),
  evidenceType: caseEvidenceTypeSchema.optional(),
  summary: z.string().min(1).optional(),
  sourceSummary: z.string().min(1).optional(),
  submittedByActorId: z.string().min(1).optional(),
  submittedAt: writebackGameTimeSchema.optional(),
  relatedActorIds: z.array(z.string().min(1)).optional(),
  relatedPlaceIds: z.array(z.string().min(1)).optional(),
  relatedAssetItemId: z.string().min(1).optional(),
  disputeSummary: z.string().min(1).optional(),
  visibility: visibilitySchema.optional(),
  createdAt: writebackGameTimeSchema.optional(),
  updatedAt: writebackGameTimeSchema.optional()
});

export const caseActivityPatchSchema = z.object({
  activityId: z.string().min(1).optional(),
  kind: caseActivityKindSchema.default('note'),
  gameTime: writebackGameTimeSchema.optional(),
  summary: z.string().min(1),
  actorId: z.string().min(1).optional(),
  relatedEvidenceIds: z.array(z.string().min(1)).default([]),
  relatedActorIds: z.array(z.string().min(1)).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  visibleToPlayer: z.boolean().default(true)
});

export const casePatchSchema = z.object({
  caseId: z.string().min(1),
  title: z.string().min(1).optional(),
  caseType: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  status: caseStatusSchema.optional(),
  playerRole: casePlayerRoleSchema.optional(),
  leadActorId: z.string().min(1).optional(),
  leadActorName: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  currentFocus: z.string().min(1).optional(),
  playerVisibleProgress: z.string().min(1).optional(),
  internalProgressSummary: z.string().min(1).optional(),
  // Legacy aliases are accepted during the transition, but RuntimeState stores V1 fields only.
  playerKnownSummary: z.string().min(1).optional(),
  officialRecordSummary: z.string().min(1).optional(),
  publicNarrativeSummary: z.string().min(1).optional(),
  conflictSummary: z.string().min(1).optional(),
  involvedActorIds: z.array(z.string().min(1)).optional(),
  relatedActorIds: z.array(z.string().min(1)).optional(),
  relatedOrganizationIds: z.array(z.string().min(1)).optional(),
  relatedPlaceIds: z.array(z.string().min(1)).optional(),
  evidenceIds: z.array(z.string().min(1)).optional(),
  activityLog: z.array(caseActivityPatchSchema).optional(),
  unreadActivityCount: z.number().int().min(0).optional(),
  lastActivityAt: writebackGameTimeSchema.optional(),
  lastSeenActivityAt: writebackGameTimeSchema.optional(),
  visibility: visibilitySchema.optional(),
  createdAt: writebackGameTimeSchema.optional(),
  updatedAt: writebackGameTimeSchema.optional(),
  archivedAt: writebackGameTimeSchema.optional()
});

export const deferredEventPatchSchema = z.object({
  eventId: z.string().min(1),
  sourceModule: z
    .enum([
      'case',
      'npc',
      'news',
      'finance',
      'faction',
      'police',
      'world',
      'organization',
      'grayNetwork',
      'reputation',
      'storypack',
      'relationship',
      'dynamic'
    ])
    .optional(),
  relatedIds: z
    .object({
      caseId: z.string().min(1).optional(),
      actorId: z.string().min(1).optional(),
      placeId: z.string().min(1).optional(),
      organizationId: z.string().min(1).optional()
    })
    .default({}),
  title: z.string().min(1).optional(),
  summary: z.string().min(1),
  triggerAt: writebackGameTimeSchema.optional(),
  visibility: z.enum(['hidden', 'player_visible', 'dev_only']).default('hidden'),
  promptInstruction: z.string().min(1).optional(),
  status: z.enum(['pending', 'resolved', 'cancelled']).default('pending'),
  createdAt: writebackGameTimeSchema.optional(),
  resolvedAt: writebackGameTimeSchema.optional()
});

const dynamicVisibilitySchema = z.enum(['known', 'hidden']);
const currentMatterStatusSchema = z.enum(['active', 'dormant', 'resolved', 'archived']);
const currentMatterKindSchema = z.enum([
  'personal',
  'police_work',
  'livelihood',
  'relationship',
  'family',
  'social',
  'risk',
  'opportunity',
  'case',
  'world'
]);
const currentMatterPressureLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const currentMatterResponseWindowSchema = z.enum(['now', 'today', 'soon', 'open']);
const signalTypeSchema = z.enum(['rumor', 'street', 'police', 'media', 'organization', 'family', 'other']);
const signalReliabilitySchema = z.enum(['unknown', 'low', 'medium', 'high']);
const signalStatusSchema = z.enum(['active', 'stale', 'resolved', 'archived']);
const newsArticleSectionSchema = z.enum([
  'front_page',
  'local',
  'crime',
  'entertainment',
  'business',
  'politics',
  'world',
  'society',
  'gossip',
  'other'
]);
const citySituationTrackTypeSchema = z.enum([
  'film_production',
  'triad_expansion',
  'leadership_transition',
  'police_operation',
  'icac_investigation',
  'government_policy',
  'media_campaign',
  'market_pressure',
  'public_safety',
  'labor_dispute'
]);
const citySituationTrackStatusSchema = z.enum(['latent', 'active', 'escalating', 'cooling', 'resolved']);
const citySituationTrackVisibilitySchema = z.enum(['hidden', 'rumor', 'public', 'player_known']);
const citySituationTrackPatchOperationSchema = z.enum(['upsert', 'update', 'resolve']);

export const currentMatterPatchSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  status: currentMatterStatusSchema.optional(),
  priority: z.number().int().min(0).max(100).optional(),
  visibility: dynamicVisibilitySchema.optional(),
  source: z.string().min(1).optional(),
  matterKind: currentMatterKindSchema.optional(),
  pressureLevel: currentMatterPressureLevelSchema.optional(),
  responseWindow: currentMatterResponseWindowSchema.optional(),
  consequenceHint: z.string().min(1).optional(),
  dueAt: writebackGameTimeSchema.optional(),
  currentHook: z.string().min(1).optional(),
  unread: z.boolean().optional(),
  relatedActorIds: z.array(z.string().min(1)).optional(),
  relatedPlaceIds: z.array(z.string().min(1)).optional(),
  relatedCaseIds: z.array(z.string().min(1)).optional(),
  relatedOrganizationIds: z.array(z.string().min(1)).optional(),
  createdAt: writebackGameTimeSchema.optional(),
  updatedAt: writebackGameTimeSchema.optional(),
  lastSeenAt: writebackGameTimeSchema.optional()
});

export const signalPatchSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  signalType: signalTypeSchema.optional(),
  reliability: signalReliabilitySchema.optional(),
  status: signalStatusSchema.optional(),
  visibility: dynamicVisibilitySchema.optional(),
  relatedActorIds: z.array(z.string().min(1)).optional(),
  relatedPlaceIds: z.array(z.string().min(1)).optional(),
  relatedCaseIds: z.array(z.string().min(1)).optional(),
  relatedOrganizationIds: z.array(z.string().min(1)).optional(),
  createdAt: writebackGameTimeSchema.optional(),
  updatedAt: writebackGameTimeSchema.optional()
});

export const newsArticlePatchSchema = z.object({
  id: z.string().min(1),
  section: newsArticleSectionSchema.default('other'),
  headline: z.string().min(1),
  body: z.string().min(1),
  tone: z.string().min(1).optional(),
  playerRelated: z.boolean().default(false),
  relatedActorIds: z.array(z.string().min(1)).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  relatedCaseIds: z.array(z.string().min(1)).default([]),
  relatedOrganizationIds: z.array(z.string().min(1)).default([])
});

export const newsIssuePatchSchema = z.object({
  id: z.string().min(1),
  date: writebackGameTimeSchema.optional(),
  outletName: z.string().min(1).optional(),
  headline: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  articles: z.array(newsArticlePatchSchema).default([]),
  createdAt: writebackGameTimeSchema.optional(),
  updatedAt: writebackGameTimeSchema.optional(),
  read: z.boolean().optional()
});

const organizationStructureConfidenceSchema = z.enum(['low', 'medium', 'high', 'unknown']);
const triadLeadershipPhaseSchema = z.enum(['stable', 'consultation', 'contested', 'transition']);

const organizationStructureNodeSchema: z.ZodType<OrganizationStructureNode> = z.lazy(() =>
  z.object({
    nodeId: z.string().min(1).max(120),
    label: z.string().min(1).max(40),
    role: z.string().min(1).max(80),
    personName: z.string().min(1).max(80).optional(),
    actorId: z.string().min(1).max(120).optional(),
    status: z.string().min(1).max(160).optional(),
    confidence: organizationStructureConfidenceSchema.optional(),
    summary: z.string().min(1).max(240).optional(),
    children: z.array(organizationStructureNodeSchema).max(20).default([])
  })
);

export const triadOrganizationStatePatchSchema = z
  .object({
    leadership: z
      .object({
        phase: triadLeadershipPhaseSchema.optional(),
        visibleSummary: z.string().min(1).max(320).optional(),
        nextMilestone: z.string().min(1).max(240).optional(),
        currentLeaderActorId: z.string().min(1).max(120).optional(),
        knownCandidateActorIds: z.array(z.string().min(1).max(120)).max(4).optional(),
        confidence: organizationStructureConfidenceSchema.optional()
      })
      .strict()
      .optional(),
    activityAreas: z
      .array(
        z
          .object({
            placeId: z.string().min(1).max(120),
            statusSummary: z.string().min(1).max(320).optional(),
            pressureSummary: z.string().min(1).max(260).optional(),
            confidence: organizationStructureConfidenceSchema.optional()
          })
          .strict()
      )
      .max(2)
      .optional()
  })
  .strict();

export const organizationPatchSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1).optional(),
  aliases: z.array(z.string().trim().min(1)).max(20).optional(),
  type: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  publicKnowledge: z.string().min(1).optional(),
  currentState: z.string().min(1).optional(),
  stanceTowardPlayer: z.string().min(1).optional(),
  pressureSummary: z.string().min(1).optional(),
  structureTree: z.array(organizationStructureNodeSchema).max(40).optional(),
  triadState: triadOrganizationStatePatchSchema.optional(),
  relatedActorIds: z.array(z.string().min(1)).optional(),
  relatedPlaceIds: z.array(z.string().min(1)).optional(),
  relatedCaseIds: z.array(z.string().min(1)).optional(),
  visibility: visibilitySchema.optional(),
  importance: z.number().int().min(0).max(100).optional()
});

export const citySituationTrackPatchSchema = z.object({
  operation: citySituationTrackPatchOperationSchema,
  trackId: z.string().min(1),
  title: z.string().min(1).max(80).optional(),
  trackType: citySituationTrackTypeSchema.optional(),
  status: citySituationTrackStatusSchema.optional(),
  pressureLevel: z.number().int().min(0).max(5).optional(),
  visibility: citySituationTrackVisibilitySchema.optional(),
  startedAt: writebackGameTimeSchema.optional(),
  nextReviewAt: writebackGameTimeSchema.optional(),
  cadenceDays: z.number().int().min(1).max(90).optional(),
  relatedOrganizationIds: z.array(z.string().min(1)).default([]),
  relatedPowerFigureIds: z.array(z.string().min(1)).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  relatedActorIds: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1).max(280).optional(),
  currentBeat: z.string().min(1).max(220).optional(),
  possibleDevelopments: z.array(z.string().min(1).max(80)).max(5).default([])
});

const judgementCategorySchema = z.enum([
  'observation',
  'chase',
  'melee',
  'armed',
  'firearm',
  'crowd',
  'negotiation',
  'endurance',
  'will',
  'thinking',
  'other'
]);
const judgementOutcomeSchema = z.enum(['critical_success', 'success', 'partial_success', 'failure', 'critical_failure']);
const judgementAttributeSchema = z.enum([
  'body',
  'action',
  'perception',
  'thinking',
  'negotiation',
  'will'
]);
const judgementDifficultyTierSchema = z.enum([
  'easy',
  'standard',
  'hard',
  'dangerous',
  'extreme'
]);
const combatEventTypeSchema = z.enum(['chase', 'melee', 'armed', 'firearm', 'crowd', 'arrest', 'escape', 'other']);
const combatEventOutcomeSchema = z.enum([
  'player_advantage',
  'opponent_advantage',
  'player_wounded',
  'opponent_subdued',
  'opponent_escaped',
  'stalemate',
  'interrupted',
  'escalated',
  'other'
]);

export const judgementFactorPatchSchema = z.object({
  sourceType: z.enum([
    'trait',
    'equipment',
    'status',
    'environment',
    'preparation',
    'other'
  ]).optional(),
  sourceId: z.string().min(1).optional(),
  label: z.string().min(1),
  value: z.number().int().min(-100).max(100),
  reason: z.string().min(1)
});

export const judgementCheckPatchSchema = z.object({
  rulesetVersion: z.enum(['v1', 'v1.1-local-d100']).optional(),
  checkId: z.string().min(1),
  turnId: z.string().min(1),
  gameTime: writebackGameTimeSchema,
  title: z.string().min(1),
  category: judgementCategorySchema,
  targetSummary: z.string().min(1).optional(),
  relatedActorIds: z.array(z.string().min(1)).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  relatedCaseIds: z.array(z.string().min(1)).default([]),
  difficulty: z.number().int().min(-1000).max(1000).optional(),
  score: z.number().int().min(-1000).max(1000).optional(),
  primaryAttribute: judgementAttributeSchema.optional(),
  secondaryAttribute: judgementAttributeSchema.optional(),
  difficultyTier: judgementDifficultyTierSchema.optional(),
  presetRoll: z.number().int().min(1).max(100).optional(),
  effectiveTarget: z.number().int().min(5).max(95).optional(),
  outcome: judgementOutcomeSchema,
  margin: z.number().int().min(-100).max(100).optional(),
  primaryAttributeValue: z.number().int().min(0).max(100).optional(),
  secondaryAttributeValue: z.number().int().min(0).max(100).optional(),
  secondaryModifier: z.number().int().min(-10).max(10).optional(),
  difficultyModifier: z.number().int().min(-45).max(15).optional(),
  gameDifficulty: z.enum(['story', 'easy', 'standard', 'hard', 'brutal']).optional(),
  gameDifficultyModifier: z.number().int().min(-20).max(20).optional(),
  contextModifierTotal: z.number().int().min(-20).max(20).optional(),
  shortSummary: z.string().min(1),
  consequenceSummary: z.string().min(1).optional(),
  factors: z.array(judgementFactorPatchSchema).default([]),
  relatedCombatEventId: z.string().min(1).optional(),
  visibility: visibilitySchema.default('player_known')
}).superRefine((patch, context) => {
  if (patch.rulesetVersion === 'v1.1-local-d100') {
    (
      [
        ['primaryAttribute', patch.primaryAttribute],
        ['difficultyTier', patch.difficultyTier],
        ['presetRoll', patch.presetRoll],
        ['effectiveTarget', patch.effectiveTarget]
      ] as const
    ).forEach(([field, value]) => {
      if (value === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `本地骰制判定缺少 ${field}`
        });
      }
    });
    if (patch.factors.length > 5) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['factors'],
        message: '本地骰制判定的情境因素最多五项'
      });
    }
    patch.factors.forEach((factor, index) => {
      if (factor.value < -10 || factor.value > 10) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['factors', index, 'value'],
          message: '本地骰制判定的单项情境修正必须在 -10..+10'
        });
      }
    });
    return;
  }

  if (patch.difficulty === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['difficulty'],
      message: '旧版判定缺少 difficulty'
    });
  }
  if (patch.score === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['score'],
      message: '旧版判定缺少 score'
    });
  }
});

export const canonicalLocalJudgementCheckSchema = judgementCheckPatchSchema.superRefine(
  (patch, context) => {
    if (patch.rulesetVersion !== 'v1.1-local-d100') return;
    (
      [
        ['difficulty', patch.difficulty],
        ['score', patch.score],
        ['margin', patch.margin],
        ['primaryAttributeValue', patch.primaryAttributeValue],
        ['secondaryModifier', patch.secondaryModifier],
        ['difficultyModifier', patch.difficultyModifier],
        ['gameDifficulty', patch.gameDifficulty],
        ['gameDifficultyModifier', patch.gameDifficultyModifier],
        ['contextModifierTotal', patch.contextModifierTotal]
      ] as const
    ).forEach(([field, value]) => {
      if (value === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `本地结算后的判定记录缺少 ${field}`
        });
      }
    });
  }
);

export const combatParticipantPatchSchema = z.object({
  actorId: z.string().min(1).optional(),
  name: z.string().min(1),
  side: z.enum(['player', 'ally', 'opponent', 'third_party', 'unknown']),
  roleSummary: z.string().min(1),
  conditionAfter: z.string().min(1).optional()
});

export const combatEventPatchSchema = z.object({
  combatId: z.string().min(1),
  turnId: z.string().min(1),
  gameTime: writebackGameTimeSchema,
  title: z.string().min(1),
  type: combatEventTypeSchema,
  locationId: z.string().min(1).optional(),
  locationSummary: z.string().min(1),
  participants: z.array(combatParticipantPatchSchema).min(1),
  outcome: combatEventOutcomeSchema,
  intensity: z.number().int().min(-1000).max(1000),
  animationKey: z.string().min(1).optional(),
  combatText: z.string().min(1),
  resultSummary: z.string().min(1),
  consequenceSummary: z.string().min(1),
  judgementCheckIds: z.array(z.string().min(1)).default([]),
  relatedActorIds: z.array(z.string().min(1)).default([]),
  relatedPlaceIds: z.array(z.string().min(1)).default([]),
  relatedCaseIds: z.array(z.string().min(1)).default([]),
  visibility: visibilitySchema.default('player_known'),
  unread: z.boolean().default(true),
  createdAt: writebackGameTimeSchema
});

const relationshipThreadKindSchema = z.enum(['network', 'fate']);
const relationshipThreadStatusSchema = z.enum(['active', 'dormant', 'strained', 'ended']);
const relationshipCreationBasisSchema = z.enum([
  'family',
  'formal_partner',
  'formal_informant',
  'debt_or_promise',
  'protection',
  'ongoing_joint_matter',
  'repeated_contact',
  'sustained_conflict'
]);
const relationshipEvidenceRefSchema = z.object({
  kind: z.enum(['current_turn', 'memory', 'case', 'deferred_event']),
  refId: z.string().min(1),
  summary: z.string().min(1).max(240)
});

export const relationshipMilestonePatchSchema = z.object({
  milestoneId: z.string().min(1),
  gameTime: writebackGameTimeSchema.optional(),
  summary: z.string().min(1).optional(),
  importance: z.number().int().min(0).max(100).optional(),
  relatedActorIds: z.array(z.string().min(1)).optional(),
  visibility: visibilitySchema.optional()
});

export const relationshipThreadPatchSchema = z.object({
  threadId: z.string().min(1),
  kind: relationshipThreadKindSchema.optional(),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  relatedActorIds: z.array(z.string().min(1)).optional(),
  primaryActorId: z.string().min(1).optional(),
  relationshipRole: z.string().min(1).optional(),
  creationBasis: relationshipCreationBasisSchema.optional(),
  evidenceRefs: z.array(relationshipEvidenceRefSchema).max(6).optional(),
  status: relationshipThreadStatusSchema.optional(),
  intimacySummary: z.string().min(1).optional(),
  trustSummary: z.string().min(1).optional(),
  conflictSummary: z.string().min(1).optional(),
  promiseSummary: z.string().min(1).optional(),
  riskSummary: z.string().min(1).optional(),
  currentPull: z.string().min(1).optional(),
  nextNaturalBeatHint: z.string().min(1).optional(),
  lastHeartbeatAt: writebackGameTimeSchema.optional(),
  heartbeatCooldownUntil: writebackGameTimeSchema.optional(),
  milestoneUpdates: z.array(relationshipMilestonePatchSchema).default([]),
  visibility: visibilitySchema.optional(),
  importance: z.number().int().min(0).max(100).optional()
});

const pregnancyPaternityCandidatePatchSchema = z
  .object({
    actorId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    visibility: visibilitySchema.optional()
  })
  .refine((candidate) => Boolean(candidate.actorId || candidate.name), {
    message: '父系候选至少需要 actorId 或 name。'
  });

export const pregnancyRiskPatchSchema = z.object({
  actorId: z.string().min(1),
  riskType: z.enum(['unprotected', 'tryingToConceive', 'reducedRisk']),
  summary: z.string().min(1),
  paternityCandidates: z.array(pregnancyPaternityCandidatePatchSchema).max(4).optional(),
  fatherActorId: z.string().min(1).optional(),
  fatherName: z.string().min(1).optional(),
  fatherVisibility: visibilitySchema.optional()
});

export const pregnancyResolutionPatchSchema = z.object({
  actorId: z.string().min(1),
  outcome: z.enum(['pregnancy_confirmed', 'live_birth', 'pregnancy_ended']),
  summary: z.string().min(1),
  childName: z.string().min(1).optional(),
  childGender: z.enum(['male', 'female']).optional(),
  fatherActorId: z.string().min(1).optional()
});

export const writebackSchema = z
  .object({
    actorPatches: z.array(actorPatchSchema).default([]),
    playerPatch: playerPatchSchema.optional(),
    identityContextPatch: identityContextPatchSchema.optional(),
    policeRoleProfilePatch: playerPoliceRoleProfilePatchSchema.optional(),
    civilianRoleProfilePatch: playerCivilianRoleProfilePatchSchema.optional(),
    secretFactPatches: z.array(secretFactPatchSchema).default([]),
    locationPatch: locationPatchSchema.optional(),
    weatherPatch: weatherPatchSchema.optional(),
    placePatches: z.array(placePatchSchema).default([]),
    scenePatches: z.array(scenePatchSchema).default([]),
    casePatches: z.array(casePatchSchema).default([]),
    caseEvidencePatches: z.array(caseEvidencePatchSchema).default([]),
    deferredEventPatches: z.array(deferredEventPatchSchema).default([]),
    currentMatterPatches: z.array(currentMatterPatchSchema).default([]),
    signalPatches: z.array(signalPatchSchema).default([]),
    newsIssuePatches: z.array(newsIssuePatchSchema).default([]),
    organizationPatches: z.array(organizationPatchSchema).default([]),
    citySituationTrackPatches: z.array(citySituationTrackPatchSchema).default([]),
    judgementCheckPatches: z.array(judgementCheckPatchSchema).default([]),
    combatEventPatches: z.array(combatEventPatchSchema).default([]),
    relationshipThreadPatches: z.array(relationshipThreadPatchSchema).default([]),
    pregnancyRiskPatches: z.array(pregnancyRiskPatchSchema).default([]),
    pregnancyResolutionPatches: z.array(pregnancyResolutionPatchSchema).default([]),
    grayNetworkPatches: z.array(grayNetworkPatchSchema).default([]),
    assetPatch: assetPatchSchema.optional(),
    financePatch: financePatchSchema.optional(),
    grayLedgerPatch: grayLedgerPatchSchema.optional(),
    memories: z.array(memorySuggestionSchema).default([]),
    actorMemories: z.array(actorMemorySuggestionSchema).default([]),
    traitProgress: z.array(traitProgressSuggestionSchema).default([]),
    traitGains: z.array(traitGainSuggestionSchema).default([])
  })
  .passthrough();

function createEmptyWriteback() {
  return {
    actorPatches: [],
    identityContextPatch: undefined,
    policeRoleProfilePatch: undefined,
    civilianRoleProfilePatch: undefined,
    secretFactPatches: [],
    locationPatch: undefined,
    weatherPatch: undefined,
    placePatches: [],
    scenePatches: [],
    casePatches: [],
    caseEvidencePatches: [],
    deferredEventPatches: [],
    currentMatterPatches: [],
    signalPatches: [],
    newsIssuePatches: [],
    organizationPatches: [],
    citySituationTrackPatches: [],
    judgementCheckPatches: [],
    combatEventPatches: [],
    relationshipThreadPatches: [],
    pregnancyRiskPatches: [],
    pregnancyResolutionPatches: [],
    grayNetworkPatches: [],
    memories: [],
    actorMemories: [],
    traitProgress: [],
    traitGains: []
  };
}

export const narratorResponseSchema = z.preprocess(
  sanitizeNarratorResponse,
  z.object({
    writebackVersion: z.string().default('1.0'),
    narrativeText: z.string().min(1),
    presentationHints: storyPresentationHintsSchema,
    turnSummary: z.string().trim().min(1),
    suggestedActions: z.array(z.string()).default([]),
    playerVitalsReview: playerVitalsReviewSchema.optional(),
    pregnancyLifecycleReview: pregnancyLifecycleReviewSchema.optional(),
    dramaPlan: z.unknown().optional(),
    dramaExecutionTrace: dramaExecutionTraceSchema.optional(),
    timePatch: timePatchSchema.optional(),
    writeback: writebackSchema.default(createEmptyWriteback),
    validationWarnings: z
      .array(
        z.object({
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
          code: z.string()
        })
      )
      .optional()
  })
    .passthrough()
);

export type NarratorResponse = z.infer<typeof narratorResponseSchema> & {
  validationWarnings?: import('../runtime/types').StoryDiagnosticIssue[];
  /**
   * Ephemeral copy of the model's raw asset patch. It is attached before
   * tolerant per-item validation can discard an incomplete vehicle, and is
   * only available to the current turn's recovery chain.
   */
  rawAssetPatch?: unknown;
  /**
   * Ephemeral raw asset upsert candidates retained for stable-ID, field-level
   * vehicle recovery. These values never enter canonical runtime state.
   */
  rawAssetUpsertItems?: unknown[];
  /**
   * Ephemeral copy of the model's raw judgement intent candidates. It is attached by
   * validateNarratorResponse before tolerant item validation can discard an invalid
   * candidate, and is never persisted as runtime state.
  */
  rawJudgementCheckPatches?: unknown[];
  /**
   * Ephemeral copy of the model's raw major-combat record candidates. It lets the
   * turn engine restore locally determined envelope fields before strict
   * persistence validation, without regenerating the narrative.
   */
  rawCombatEventPatches?: unknown[];
  /**
   * Ephemeral copy of the model's raw case intent candidates. It is attached
   * before tolerant item validation so a locally recoverable enum or array
   * shape error cannot erase the whole case update. It is never persisted.
   */
  rawCasePatches?: unknown[];
  /**
   * Ephemeral copy of the model's raw relationship intent candidates. It is kept
   * before tolerant item validation so a malformed evidence reference cannot erase
   * the whole relationship intent. It is never persisted as runtime state.
   */
  rawRelationshipThreadPatches?: unknown[];
};
