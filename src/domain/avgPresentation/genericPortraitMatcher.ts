import type { GenericPortraitSetEntry } from '../avgResourcePack';
import type {
  AvgGenericPortraitBinding,
  GenericPortraitIdentityProfile
} from './types';

export const GENERIC_PORTRAIT_CONFIDENCE_THRESHOLD = 70;

const PROFESSIONAL_ROLE_FAMILIES = new Set([
  'business',
  'education',
  'government',
  'legal',
  'media',
  'medical',
  'professional',
  'technical'
]);

export interface ScoredGenericPortraitCandidate {
  entry: GenericPortraitSetEntry;
  score: number;
  tieBreak: number;
  usageCount: number;
  reasons: string[];
}

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, '_') ?? '';
}

function tokens(values: readonly (string | undefined)[]): Set<string> {
  return new Set(
    values
      .flatMap((value) => normalized(value).split('_'))
      .map((value) => value.trim())
      .filter((value) => value.length >= 2)
  );
}

function overlapCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function ageRange(value: string | undefined): [number, number] | undefined {
  if (!value) return undefined;
  const plus = /^(\d{2})_plus$/u.exec(value);
  if (plus) return [Number(plus[1]), 99];
  const range = /^(\d{2})_(\d{2})$/u.exec(value);
  return range ? [Number(range[1]), Number(range[2])] : undefined;
}

function distanceToRange(age: number, range: [number, number]): number {
  if (age < range[0]) return range[0] - age;
  if (age > range[1]) return age - range[1];
  return 0;
}

function rangeDistance(left: [number, number], right: [number, number]): number {
  if (left[1] < right[0]) return right[0] - left[1];
  if (right[1] < left[0]) return left[0] - right[1];
  return 0;
}

function deterministicHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function familyScore(actorFamily: string | undefined, candidateFamily: string): {
  score: number;
  reason: string;
} {
  const actor = normalized(actorFamily);
  const candidate = normalized(candidateFamily);
  if (!actor) return { score: 0, reason: 'role-family-unknown' };
  if (actor === candidate) return { score: 120, reason: 'role-family-exact' };
  if (PROFESSIONAL_ROLE_FAMILIES.has(actor) && PROFESSIONAL_ROLE_FAMILIES.has(candidate)) {
    return { score: 75, reason: 'role-family-professional-compatible' };
  }
  return { score: -160, reason: 'role-family-mismatch' };
}

function ageScore(profile: GenericPortraitIdentityProfile, candidateBand: string | undefined): {
  score: number;
  reason?: string;
} {
  const candidateRange = ageRange(candidateBand);
  if (!candidateRange) return { score: 0 };
  if (profile.visualAge !== undefined) {
    const distance = distanceToRange(profile.visualAge, candidateRange);
    if (distance === 0) return { score: 40, reason: 'age-exact' };
    if (distance <= 10) return { score: 15, reason: 'age-adjacent' };
    return { score: -25, reason: 'age-far' };
  }
  const profileRange = ageRange(profile.visualAgeBand);
  if (!profileRange) return { score: 0 };
  if (profile.visualAgeBand === candidateBand) return { score: 40, reason: 'age-band-exact' };
  const distance = rangeDistance(profileRange, candidateRange);
  if (distance === 0) return { score: 25, reason: 'age-band-overlap' };
  if (distance <= 10) return { score: 15, reason: 'age-band-adjacent' };
  return { score: -25, reason: 'age-band-far' };
}

function scoreCandidate(
  profile: GenericPortraitIdentityProfile,
  entry: GenericPortraitSetEntry,
  usageCount: number,
  avoidPortraitSetIds: ReadonlySet<string>
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const family = familyScore(profile.roleFamily, entry.profile.roleFamily);
  score += family.score;
  reasons.push(family.reason);

  const age = ageScore(profile, entry.profile.visualAgeBand);
  score += age.score;
  if (age.reason) reasons.push(age.reason);

  const actorSubtype = normalized(profile.roleSubtype);
  const candidateSubtype = normalized(entry.profile.roleSubtype);
  if (actorSubtype && actorSubtype === candidateSubtype) {
    score += 50;
    reasons.push('role-subtype-exact');
  } else {
    const subtypeOverlap = overlapCount(
      tokens([profile.roleSubtype, ...(profile.roleTags ?? [])]),
      tokens([entry.profile.roleSubtype])
    );
    if (subtypeOverlap) {
      score += Math.min(48, subtypeOverlap * 12);
      reasons.push(`role-subtype-overlap:${subtypeOverlap}`);
    }
  }

  if (
    normalized(profile.roleTier) &&
    normalized(profile.roleTier) === normalized(entry.profile.roleTier)
  ) {
    score += 25;
    reasons.push('role-tier-exact');
  }

  if (
    normalized(profile.bodyBuild) &&
    normalized(profile.bodyBuild) === normalized(entry.profile.bodyBuild)
  ) {
    score += 15;
    reasons.push('body-build-exact');
  }

  const demeanorOverlap = overlapCount(
    tokens(profile.demeanor ?? []),
    tokens(entry.profile.demeanor ?? [])
  );
  if (demeanorOverlap) {
    score += Math.min(20, demeanorOverlap * 5);
    reasons.push(`demeanor-overlap:${demeanorOverlap}`);
  }

  const featureOverlap = overlapCount(
    tokens(profile.stableFeatureTags ?? []),
    tokens(entry.profile.stableFeatureTags ?? [])
  );
  if (featureOverlap) {
    score += Math.min(20, featureOverlap * 5);
    reasons.push(`feature-overlap:${featureOverlap}`);
  }

  score += Math.min(5, Math.max(0, (entry.priority ?? 0) / 20));

  if (entry.reusePolicy === 'limited_reuse' && usageCount > 0) {
    score -= usageCount * 25;
    reasons.push(`limited-reuse-penalty:${usageCount}`);
  } else if (entry.reusePolicy === 'background_reusable' && usageCount > 0) {
    score -= usageCount * 5;
    reasons.push(`background-reuse-penalty:${usageCount}`);
  }
  if (avoidPortraitSetIds.has(entry.portraitSetId)) {
    score -= 60;
    reasons.push('current-scene-duplicate-penalty');
  }

  return { score, reasons };
}

export function rankGenericPortraitCandidates(input: {
  saveId: string;
  actorId: string;
  profile: GenericPortraitIdentityProfile;
  candidates: readonly GenericPortraitSetEntry[];
  existingBindings: readonly AvgGenericPortraitBinding[];
  avoidPortraitSetIds?: ReadonlySet<string>;
}): ScoredGenericPortraitCandidate[] {
  const usageByPortraitSet = new Map<string, number>();
  for (const binding of input.existingBindings) {
    if (binding.actorId === input.actorId) continue;
    usageByPortraitSet.set(
      binding.portraitSetId,
      (usageByPortraitSet.get(binding.portraitSetId) ?? 0) + 1
    );
  }

  return input.candidates
    .filter((entry) => {
      const actorGender = input.profile.gender;
      const candidateGender = entry.profile.gender;
      if (
        (actorGender === 'male' || actorGender === 'female') &&
        (candidateGender === 'male' || candidateGender === 'female')
      ) {
        return actorGender === candidateGender;
      }
      return true;
    })
    .filter((entry) => {
      const usageCount = usageByPortraitSet.get(entry.portraitSetId) ?? 0;
      return entry.reusePolicy !== 'unique_per_save' || usageCount === 0;
    })
    .map((entry) => {
      const usageCount = usageByPortraitSet.get(entry.portraitSetId) ?? 0;
      const result = scoreCandidate(
        input.profile,
        entry,
        usageCount,
        input.avoidPortraitSetIds ?? new Set<string>()
      );
      return {
        entry,
        score: result.score,
        usageCount,
        reasons: result.reasons,
        tieBreak: deterministicHash(`${input.saveId}:${input.actorId}:${entry.portraitSetId}`)
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.tieBreak - right.tieBreak ||
        left.entry.portraitSetId.localeCompare(right.entry.portraitSetId)
    );
}
