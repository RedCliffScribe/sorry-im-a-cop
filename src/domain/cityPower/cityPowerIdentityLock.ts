import type { Actor } from '../runtime/types';
import type { CityPowerFigureAnchor } from './cityPowerTypes';
import { cityPowerCanonicalId, cityPowerRuntimeActorId } from './cityPowerIdentityIds';
import { hkLateColonialPowerFigures } from './hkLateColonialPowerFigures';

export { cityPowerCanonicalId, cityPowerRuntimeActorId } from './cityPowerIdentityIds';

export type CityPowerIdentityMatchKind = 'displayName' | 'englishName' | 'recognitionAlias' | 'protectedRealName';

export interface CityPowerIdentityMatch {
  canonicalSeedId: string;
  displayName: string;
  englishName?: string;
  runtimeActorId: string;
  recognitionAliases: string[];
  protectedRealNames: string[];
  matchedBy: CityPowerIdentityMatchKind;
  matchedText: string;
}

interface CityPowerStoredData {
  canonicalSeedId?: unknown;
  displayName?: unknown;
}

interface CityPowerWorldpackData {
  cityPowerIdentity?: CityPowerStoredData;
}

function normalizeIdentityText(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return normalized ? normalized : undefined;
}

function makeMatch(
  anchor: CityPowerFigureAnchor,
  matchedBy: CityPowerIdentityMatchKind,
  matchedText: string
): CityPowerIdentityMatch {
  return {
    canonicalSeedId: cityPowerCanonicalId(anchor),
    displayName: anchor.displayName,
    englishName: anchor.englishName,
    runtimeActorId: anchor.runtimeActorId || cityPowerRuntimeActorId(cityPowerCanonicalId(anchor)),
    recognitionAliases: [...anchor.recognitionAliases],
    protectedRealNames: [...(anchor.protectedRealNames ?? [])],
    matchedBy,
    matchedText
  };
}

function matchAnchorByValue(anchor: CityPowerFigureAnchor, normalized: string): CityPowerIdentityMatch | undefined {
  if (normalizeIdentityText(anchor.displayName) === normalized) return makeMatch(anchor, 'displayName', anchor.displayName);
  if (normalizeIdentityText(anchor.englishName) === normalized) return makeMatch(anchor, 'englishName', anchor.englishName!);
  const alias = anchor.recognitionAliases.find((value) => normalizeIdentityText(value) === normalized);
  if (alias) return makeMatch(anchor, 'recognitionAlias', alias);
  const protectedName = anchor.protectedRealNames?.find((value) => normalizeIdentityText(value) === normalized);
  if (protectedName) return makeMatch(anchor, 'protectedRealName', protectedName);
  return undefined;
}

export function findCityPowerIdentityMatch(
  value: string | undefined,
  anchors: CityPowerFigureAnchor[] = hkLateColonialPowerFigures
): CityPowerIdentityMatch | undefined {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return undefined;
  for (const anchor of anchors) {
    const match = matchAnchorByValue(anchor, normalized);
    if (match) return match;
  }
  return undefined;
}

export function findCityPowerIdentityByCanonicalId(
  canonicalSeedId: string | undefined,
  anchors: CityPowerFigureAnchor[] = hkLateColonialPowerFigures
): CityPowerIdentityMatch | undefined {
  if (!canonicalSeedId?.trim()) return undefined;
  const anchor = anchors.find((item) => cityPowerCanonicalId(item) === canonicalSeedId.trim());
  return anchor ? makeMatch(anchor, 'displayName', anchor.displayName) : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactCityPowerProtectedNames(value: string, match: CityPowerIdentityMatch): string {
  return match.protectedRealNames.reduce((current, protectedName) => {
    if (!protectedName.trim()) return current;
    return current.replace(new RegExp(escapeRegExp(protectedName), 'gi'), match.displayName);
  }, value);
}

export function cityPowerMatchFromStoredActor(actor: Actor): CityPowerIdentityMatch | undefined {
  const hk1988 = actor.worldpackActorData?.hk1988 as CityPowerWorldpackData | undefined;
  const canonicalSeedId = typeof hk1988?.cityPowerIdentity?.canonicalSeedId === 'string'
    ? hk1988.cityPowerIdentity.canonicalSeedId
    : undefined;
  if (!canonicalSeedId) return undefined;
  const anchor = hkLateColonialPowerFigures.find((item) => cityPowerCanonicalId(item) === canonicalSeedId);
  return anchor ? makeMatch(anchor, 'displayName', anchor.displayName) : undefined;
}
