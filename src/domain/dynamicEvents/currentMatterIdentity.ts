import type { CurrentMatter, CurrentMatterKind, GameTime } from '../runtime/types';

export interface CurrentMatterIdentityCandidate {
  id: string;
  title?: string;
  matterKind?: CurrentMatterKind;
  relatedActorIds?: string[];
  relatedPlaceIds?: string[];
  relatedCaseIds?: string[];
  relatedOrganizationIds?: string[];
}

export type CurrentMatterIdentityMatchKind =
  | 'exact_id'
  | 'shared_case'
  | 'same_title_and_scope'
  | 'new';

export interface CurrentMatterIdentityResolution {
  canonicalId: string;
  matchedBy: CurrentMatterIdentityMatchKind;
  matchedMatter?: CurrentMatter;
}

function normalizeTitle(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return normalized || undefined;
}

function hasIntersection(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left?.length || !right?.length) return false;
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function kindsAreCompatible(
  left: CurrentMatterKind | undefined,
  right: CurrentMatterKind | undefined
): boolean {
  return !left || !right || left === right;
}

function compareGameTime(left: GameTime, right: GameTime): number {
  const leftTuple = [left.year, left.month, left.day, left.hour, left.minute];
  const rightTuple = [right.year, right.month, right.day, right.hour, right.minute];
  for (let index = 0; index < leftTuple.length; index += 1) {
    const difference = (leftTuple[index] ?? 0) - (rightTuple[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function compareStableMatterOrder(left: CurrentMatter, right: CurrentMatter): number {
  return compareGameTime(left.createdAt, right.createdAt) || left.id.localeCompare(right.id);
}

function matchingScopeCount(
  existing: CurrentMatter,
  candidate: CurrentMatterIdentityCandidate
): number {
  return [
    hasIntersection(existing.relatedActorIds, candidate.relatedActorIds),
    hasIntersection(existing.relatedPlaceIds, candidate.relatedPlaceIds),
    hasIntersection(existing.relatedOrganizationIds, candidate.relatedOrganizationIds)
  ].filter(Boolean).length;
}

export function resolveCurrentMatterIdentity(
  currentMatters: Record<string, CurrentMatter>,
  candidate: CurrentMatterIdentityCandidate
): CurrentMatterIdentityResolution {
  const exact = currentMatters[candidate.id];
  if (exact) {
    return { canonicalId: exact.id, matchedBy: 'exact_id', matchedMatter: exact };
  }

  const compatible = Object.values(currentMatters).filter((matter) =>
    kindsAreCompatible(matter.matterKind, candidate.matterKind)
  );
  const sharedCaseMatches = compatible
    .filter((matter) => hasIntersection(matter.relatedCaseIds, candidate.relatedCaseIds))
    .sort(compareStableMatterOrder);
  if (sharedCaseMatches[0]) {
    return {
      canonicalId: sharedCaseMatches[0].id,
      matchedBy: 'shared_case',
      matchedMatter: sharedCaseMatches[0]
    };
  }

  const normalizedTitle = normalizeTitle(candidate.title);
  if (normalizedTitle) {
    const scopedTitleMatches = compatible
      .filter(
        (matter) =>
          normalizeTitle(matter.title) === normalizedTitle &&
          matchingScopeCount(matter, candidate) > 0
      )
      .sort((left, right) => {
        const scopeDifference =
          matchingScopeCount(right, candidate) - matchingScopeCount(left, candidate);
        return scopeDifference || compareStableMatterOrder(left, right);
      });
    if (scopedTitleMatches[0]) {
      return {
        canonicalId: scopedTitleMatches[0].id,
        matchedBy: 'same_title_and_scope',
        matchedMatter: scopedTitleMatches[0]
      };
    }
  }

  return { canonicalId: candidate.id, matchedBy: 'new' };
}
