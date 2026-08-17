import type { Actor } from '../runtime/types';
import { hkLateColonialEraSeedFigures } from './hkLateColonialEraSeedFigures';
import type { EraSeedFigureCard } from './eraSeedFigureTypes';

export type SeedIdentityMatchKind = 'displayName' | 'englishName' | 'recognitionAlias' | 'protectedRealName';

export interface SeedIdentityMatch {
  seedFigureId: string;
  canonicalSeedId: string;
  displayName: string;
  englishName?: string;
  runtimeActorId: string;
  recognitionAliases: string[];
  protectedRealNames: string[];
  matchedBy: SeedIdentityMatchKind;
  matchedText: string;
}

interface SeedIdentityStoredData {
  canonicalSeedId?: unknown;
  seedFigureId?: unknown;
  displayName?: unknown;
}

interface SeedIdentityWorldpackData {
  eraSeedIdentity?: SeedIdentityStoredData;
}

export function seedCanonicalId(card: Pick<EraSeedFigureCard, 'id' | 'canonicalSeedId'>): string {
  return card.canonicalSeedId?.trim() || card.id;
}

export function seedRuntimeActorId(canonicalSeedId: string): string {
  return `npc_seed_${canonicalSeedId}`;
}

function normalizeIdentityText(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return normalized ? normalized : undefined;
}

function makeMatch(
  card: EraSeedFigureCard,
  matchedBy: SeedIdentityMatchKind,
  matchedText: string
): SeedIdentityMatch {
  const canonicalSeedId = seedCanonicalId(card);
  return {
    seedFigureId: card.id,
    canonicalSeedId,
    displayName: card.displayName,
    englishName: card.englishName,
    runtimeActorId: seedRuntimeActorId(canonicalSeedId),
    recognitionAliases: [...card.recognitionAliases],
    protectedRealNames: [...(card.protectedRealNames ?? [])],
    matchedBy,
    matchedText
  };
}

function matchCardByValue(card: EraSeedFigureCard, normalized: string): SeedIdentityMatch | undefined {
  if (normalizeIdentityText(card.displayName) === normalized) {
    return makeMatch(card, 'displayName', card.displayName);
  }
  if (normalizeIdentityText(card.englishName) === normalized) {
    return makeMatch(card, 'englishName', card.englishName!);
  }
  const alias = card.recognitionAliases.find((value) => normalizeIdentityText(value) === normalized);
  if (alias) return makeMatch(card, 'recognitionAlias', alias);
  const protectedName = card.protectedRealNames?.find((value) => normalizeIdentityText(value) === normalized);
  if (protectedName) return makeMatch(card, 'protectedRealName', protectedName);
  return undefined;
}

export function findSeedIdentityMatch(
  value: string | undefined,
  cards: EraSeedFigureCard[] = hkLateColonialEraSeedFigures
): SeedIdentityMatch | undefined {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return undefined;

  for (const card of cards) {
    const match = matchCardByValue(card, normalized);
    if (match) return match;
  }

  return undefined;
}

export function findSeedIdentityByCanonicalId(
  canonicalSeedId: string | undefined,
  cards: EraSeedFigureCard[] = hkLateColonialEraSeedFigures
): SeedIdentityMatch | undefined {
  if (!canonicalSeedId?.trim()) return undefined;
  const card = cards.find((item) => seedCanonicalId(item) === canonicalSeedId.trim());
  return card ? makeMatch(card, 'displayName', card.displayName) : undefined;
}

export function findSeedIdentityMatchInText(
  value: string | undefined,
  cards: EraSeedFigureCard[] = hkLateColonialEraSeedFigures
): SeedIdentityMatch | undefined {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return undefined;

  for (const card of cards) {
    const candidates: Array<[SeedIdentityMatchKind, string]> = [
      ['displayName', card.displayName],
      ...(card.englishName ? ([['englishName', card.englishName]] as Array<[SeedIdentityMatchKind, string]>) : []),
      ...card.recognitionAliases.map((alias): [SeedIdentityMatchKind, string] => ['recognitionAlias', alias]),
      ...(card.protectedRealNames ?? []).map(
        (protectedName): [SeedIdentityMatchKind, string] => ['protectedRealName', protectedName]
      )
    ];
    for (const [matchedBy, candidate] of candidates) {
      const normalizedCandidate = normalizeIdentityText(candidate);
      if (normalizedCandidate && normalized.includes(normalizedCandidate)) {
        return makeMatch(card, matchedBy, candidate);
      }
    }
  }

  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactSeedProtectedNames(value: string, match: SeedIdentityMatch): string {
  return match.protectedRealNames.reduce((current, protectedName) => {
    if (!protectedName.trim()) return current;
    return current.replace(new RegExp(escapeRegExp(protectedName), 'gi'), match.displayName);
  }, value);
}

export function isProtectedSeedName(value: string | undefined, match: SeedIdentityMatch): boolean {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return false;
  return match.protectedRealNames.some((protectedName) => normalizeIdentityText(protectedName) === normalized);
}

export function seedMatchFromStoredActor(actor: Actor): SeedIdentityMatch | undefined {
  const hk1988 = actor.worldpackActorData?.hk1988 as SeedIdentityWorldpackData | undefined;
  const stored = hk1988?.eraSeedIdentity;
  const canonicalSeedId = typeof stored?.canonicalSeedId === 'string' ? stored.canonicalSeedId : undefined;
  if (!canonicalSeedId) return undefined;

  const card = hkLateColonialEraSeedFigures.find((item) => seedCanonicalId(item) === canonicalSeedId);
  if (!card) return undefined;
  return makeMatch(card, 'displayName', card.displayName);
}

export function actorMatchesSeedIdentity(actor: Actor, match: SeedIdentityMatch): boolean {
  const stored = seedMatchFromStoredActor(actor);
  if (stored?.canonicalSeedId === match.canonicalSeedId) return true;
  return actor.actorId === match.runtimeActorId;
}
