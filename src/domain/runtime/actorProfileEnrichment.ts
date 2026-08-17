import type { Actor, ActorProfileEnrichmentField, PendingActorProfileEnrichment } from './types';
import type { NarratorResponse } from '../writeback/schema';

export type ActorProfilePatch = NarratorResponse['writeback']['actorPatches'][number];

export const ACTOR_PROFILE_ENRICHMENT_FIELDS: ActorProfileEnrichmentField[] = [
  'publicIdentity',
  'actualIdentitySummary',
  'roleProfiles',
  'positionSummary',
  'profileSummary',
  'appearance',
  'clothing',
  'personality',
  'speechStyle',
  'motivation',
  'longTermGoal',
  'values',
  'attributes',
  'relationshipSummary',
  'attitudeTowardPlayer',
  'interactionScore',
  'trustTendency',
  'entanglementSummary',
  'statusSummary',
  'bodyConditionSummary',
  'longTermMemorySummary',
  'recentInteractionMemory',
  'femaleProfile'
];

const ATTRIBUTE_KEYS: Array<keyof Actor['attributes']> = [
  'body',
  'action',
  'perception',
  'thinking',
  'negotiation',
  'will'
];

const SEMANTICALLY_EMPTY_TEXTS = new Set([
  '无',
  '暂无',
  '未知',
  '待明确',
  '待补充',
  'none',
  'n/a',
  'na',
  'unknown'
]);

function hasText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !SEMANTICALLY_EMPTY_TEXTS.has(normalized);
}

function hasRoleProfile(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some(
    (profile) => profile && typeof profile === 'object' && !Array.isArray(profile) && Object.keys(profile).length > 0
  );
}

function hasAttributes(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const attributes = value as Partial<Actor['attributes']>;
  return ATTRIBUTE_KEYS.every((key) => typeof attributes[key] === 'number' && Number.isFinite(attributes[key]));
}

function hasCompletePublicFemaleProfile(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Partial<NonNullable<Actor['femaleProfile']>>;
  return [
    profile.addressToPlayer,
    profile.appearanceDescription,
    profile.bodyDescription,
    profile.clothingStyle,
    profile.personalityCore,
    profile.affectionProgressionCondition,
    profile.relationshipProgressionCondition
  ].every(hasText);
}

export function actorProfileFieldIsComplete(
  value: Pick<ActorProfilePatch, ActorProfileEnrichmentField> | Partial<Actor>,
  field: ActorProfileEnrichmentField
): boolean {
  const record = value as Record<string, unknown>;
  if (field === 'roleProfiles') return hasRoleProfile(record[field]);
  if (field === 'attributes') return hasAttributes(record[field]);
  if (field === 'femaleProfile') return hasCompletePublicFemaleProfile(record[field]);
  if (field === 'interactionScore') {
    return typeof record[field] === 'number' && Number.isInteger(record[field]) && record[field] >= 0 && record[field] <= 100;
  }
  return hasText(record[field]);
}

export function missingActorProfileEnrichmentFields(
  value: Pick<ActorProfilePatch, ActorProfileEnrichmentField> | Partial<Actor>
): ActorProfileEnrichmentField[] {
  const gender = (value as Partial<ActorProfilePatch> & Partial<Actor>).gender;
  return ACTOR_PROFILE_ENRICHMENT_FIELDS.filter(
    (field) => (field !== 'femaleProfile' || gender === 'female') && !actorProfileFieldIsComplete(value, field)
  );
}

export function completedActorProfileEnrichmentFields(
  patch: ActorProfilePatch,
  requestedFields: ActorProfileEnrichmentField[]
): ActorProfileEnrichmentField[] {
  return requestedFields.filter((field) => actorProfileFieldIsComplete(patch, field));
}

export function retainRequestedActorProfileFields(
  patch: ActorProfilePatch,
  requestedFields: ActorProfileEnrichmentField[]
): ActorProfilePatch {
  const requested = new Set(requestedFields);
  const source = patch as Record<string, unknown>;
  const retained: Record<string, unknown> = { actorId: patch.actorId };
  for (const field of ACTOR_PROFILE_ENRICHMENT_FIELDS) {
    if (!requested.has(field) || !actorProfileFieldIsComplete(patch, field)) continue;
    if (field === 'femaleProfile') {
      const { adultPrivateProfile: _adultPrivateProfile, ...publicFemaleProfile } = source[field] as NonNullable<
        ActorProfilePatch['femaleProfile']
      >;
      retained[field] = publicFemaleProfile;
      continue;
    }
    retained[field] = source[field];
  }
  return retained as ActorProfilePatch;
}

export function normalizePendingActorProfileEnrichment(
  pending: PendingActorProfileEnrichment
): PendingActorProfileEnrichment | undefined {
  if (!pending?.actorId || !pending?.sourceTurnId) return undefined;
  const validFields = new Set(ACTOR_PROFILE_ENRICHMENT_FIELDS);
  const missingFields = Array.from(new Set(pending.missingFields ?? [])).filter((field) => validFields.has(field));
  if (missingFields.length === 0) return undefined;
  return {
    ...pending,
    missingFields,
    attemptCount: Number.isFinite(pending.attemptCount) ? Math.max(0, pending.attemptCount) : 0,
    consecutiveFailureCount:
      typeof pending.consecutiveFailureCount === 'number' && Number.isFinite(pending.consecutiveFailureCount)
        ? Math.max(0, pending.consecutiveFailureCount)
        : 0
  };
}
