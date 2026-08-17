import type { Actor } from '../runtime/types';
import { hkLateColonialScreenCharacterSeeds } from './hkLateColonialScreenCharacterSeeds';
import type { ScreenCharacterSeedCard } from './screenCharacterSeedTypes';

export type ScreenCharacterIdentityMatchKind =
  | 'runtimeActorId'
  | 'storedIdentity'
  | 'displayName'
  | 'englishName'
  | 'recognitionAlias';

export interface ScreenCharacterIdentityMatch {
  seedCharacterId: string;
  canonicalCharacterId: string;
  sourceWorkId: string;
  displayName: string;
  englishName?: string;
  runtimeActorId: string;
  recognitionAliases: string[];
  matchedBy: ScreenCharacterIdentityMatchKind;
  matchedText: string;
}

interface StoredScreenCharacterIdentity {
  canonicalCharacterId?: unknown;
  seedCharacterId?: unknown;
  sourceWorkId?: unknown;
  displayName?: unknown;
}

interface ScreenCharacterWorldpackData {
  screenCharacterIdentity?: StoredScreenCharacterIdentity;
}

export function screenCharacterCanonicalId(
  card: Pick<ScreenCharacterSeedCard, 'id' | 'canonicalCharacterId'>
): string {
  return card.canonicalCharacterId?.trim() || card.id;
}

export function screenCharacterRuntimeActorId(canonicalCharacterId: string): string {
  return `npc_screen_${canonicalCharacterId}`;
}

function normalizeIdentityText(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return normalized || undefined;
}

function makeMatch(
  card: ScreenCharacterSeedCard,
  matchedBy: ScreenCharacterIdentityMatchKind,
  matchedText: string
): ScreenCharacterIdentityMatch {
  const canonicalCharacterId = screenCharacterCanonicalId(card);
  return {
    seedCharacterId: card.id,
    canonicalCharacterId,
    sourceWorkId: card.sourceWorkId,
    displayName: card.displayName,
    englishName: card.englishName,
    runtimeActorId: screenCharacterRuntimeActorId(canonicalCharacterId),
    recognitionAliases: [...card.recognitionAliases],
    matchedBy,
    matchedText
  };
}

function cardByCanonicalId(
  canonicalCharacterId: string,
  cards: ScreenCharacterSeedCard[]
): ScreenCharacterSeedCard | undefined {
  return cards.find((card) => screenCharacterCanonicalId(card) === canonicalCharacterId);
}

function matchesForNormalizedValue(
  normalized: string,
  cards: ScreenCharacterSeedCard[]
): ScreenCharacterIdentityMatch[] {
  const matches: ScreenCharacterIdentityMatch[] = [];
  for (const card of cards) {
    if (normalizeIdentityText(card.displayName) === normalized) {
      matches.push(makeMatch(card, 'displayName', card.displayName));
      continue;
    }
    if (normalizeIdentityText(card.englishName) === normalized) {
      matches.push(makeMatch(card, 'englishName', card.englishName!));
      continue;
    }
    const alias = card.recognitionAliases.find((candidate) => normalizeIdentityText(candidate) === normalized);
    if (alias) matches.push(makeMatch(card, 'recognitionAlias', alias));
  }
  return matches;
}

export function findScreenCharacterIdentityMatches(
  value: string | undefined,
  cards: ScreenCharacterSeedCard[] = hkLateColonialScreenCharacterSeeds
): ScreenCharacterIdentityMatch[] {
  const normalized = normalizeIdentityText(value);
  if (!normalized) return [];

  const runtimeMatch = cards.find(
    (card) => normalizeIdentityText(screenCharacterRuntimeActorId(screenCharacterCanonicalId(card))) === normalized
  );
  if (runtimeMatch) {
    const runtimeActorId = screenCharacterRuntimeActorId(screenCharacterCanonicalId(runtimeMatch));
    return [makeMatch(runtimeMatch, 'runtimeActorId', runtimeActorId)];
  }

  const unique = new Map<string, ScreenCharacterIdentityMatch>();
  for (const match of matchesForNormalizedValue(normalized, cards)) {
    unique.set(match.canonicalCharacterId, match);
  }
  return [...unique.values()];
}

export function findScreenCharacterIdentityMatch(
  value: string | undefined,
  cards: ScreenCharacterSeedCard[] = hkLateColonialScreenCharacterSeeds
): ScreenCharacterIdentityMatch | undefined {
  const matches = findScreenCharacterIdentityMatches(value, cards);
  return matches.length === 1 ? matches[0] : undefined;
}

export function findScreenCharacterIdentityMatchForSource(
  value: string | undefined,
  sourceWorkId: string | undefined,
  cards: ScreenCharacterSeedCard[] = hkLateColonialScreenCharacterSeeds
): ScreenCharacterIdentityMatch | undefined {
  if (!sourceWorkId?.trim()) return findScreenCharacterIdentityMatch(value, cards);
  const sourceCards = cards.filter((card) => card.sourceWorkId === sourceWorkId.trim());
  return findScreenCharacterIdentityMatch(value, sourceCards);
}

export function findScreenCharacterIdentityByCanonicalId(
  canonicalCharacterId: string | undefined,
  cards: ScreenCharacterSeedCard[] = hkLateColonialScreenCharacterSeeds
): ScreenCharacterIdentityMatch | undefined {
  if (!canonicalCharacterId?.trim()) return undefined;
  const card = cardByCanonicalId(canonicalCharacterId.trim(), cards);
  return card ? makeMatch(card, 'storedIdentity', canonicalCharacterId.trim()) : undefined;
}

export function screenCharacterMatchFromStoredActor(
  actor: Actor,
  cards: ScreenCharacterSeedCard[] = hkLateColonialScreenCharacterSeeds
): ScreenCharacterIdentityMatch | undefined {
  const hk1988 = actor.worldpackActorData?.hk1988 as ScreenCharacterWorldpackData | undefined;
  const stored = hk1988?.screenCharacterIdentity;
  const canonicalCharacterId =
    typeof stored?.canonicalCharacterId === 'string' ? stored.canonicalCharacterId : undefined;
  const canonicalMatch = findScreenCharacterIdentityByCanonicalId(canonicalCharacterId, cards);
  if (canonicalMatch) return canonicalMatch;

  const seedCharacterId = typeof stored?.seedCharacterId === 'string' ? stored.seedCharacterId : undefined;
  const seedCard = seedCharacterId ? cards.find((card) => card.id === seedCharacterId) : undefined;
  if (seedCard) return makeMatch(seedCard, 'storedIdentity', seedCharacterId!);

  const sourceWorkId = typeof stored?.sourceWorkId === 'string' ? stored.sourceWorkId : undefined;
  const displayName = typeof stored?.displayName === 'string' ? stored.displayName : undefined;
  return findScreenCharacterIdentityMatchForSource(displayName, sourceWorkId, cards);
}

export function actorMatchesScreenCharacterIdentity(
  actor: Actor,
  match: ScreenCharacterIdentityMatch,
  cards: ScreenCharacterSeedCard[] = hkLateColonialScreenCharacterSeeds
): boolean {
  const stored = screenCharacterMatchFromStoredActor(actor, cards);
  if (stored?.canonicalCharacterId === match.canonicalCharacterId) return true;

  return actor.actorId === match.runtimeActorId;
}
