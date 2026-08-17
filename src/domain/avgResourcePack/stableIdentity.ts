import { findCityPowerIdentityByCanonicalId } from '../cityPower/cityPowerIdentityLock';
import {
  findSeedIdentityByCanonicalId,
  seedCanonicalId
} from '../eraSeed/seedIdentityLock';
import { hkLateColonialEraSeedFigures } from '../eraSeed/hkLateColonialEraSeedFigures';
import {
  findScreenCharacterIdentityByCanonicalId,
  screenCharacterCanonicalId
} from '../screenCharacterSeed/screenCharacterIdentityLock';
import { hkLateColonialScreenCharacterSeeds } from '../screenCharacterSeed/hkLateColonialScreenCharacterSeeds';
import type { StableIdentityKind, StableIdentityRef } from './types';
import { STABLE_IDENTITY_KINDS } from './types';

interface StableIdentityActorLike {
  actorId?: string;
  stableIdentityRef?: StableIdentityRef;
  worldpackActorData?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export function isStableIdentityKind(value: unknown): value is StableIdentityKind {
  return typeof value === 'string' && (STABLE_IDENTITY_KINDS as readonly string[]).includes(value);
}

export function normalizeStableIdentityRef(value: unknown): StableIdentityRef | undefined {
  if (!isRecord(value)) return undefined;
  const worldpackId = nonEmptyString(value.worldpackId);
  const canonicalId = nonEmptyString(value.canonicalId);
  if (!worldpackId || !canonicalId || !isStableIdentityKind(value.kind)) return undefined;
  return { worldpackId, kind: value.kind, canonicalId };
}

function escapeStableKeySegment(value: string): string {
  return value.replaceAll('%', '%25').replaceAll(':', '%3A');
}

function unescapeStableKeySegment(value: string): string {
  return value.replaceAll('%3A', ':').replaceAll('%25', '%');
}

export function toStableIdentityKey(ref: StableIdentityRef): string {
  return [ref.worldpackId, ref.kind, ref.canonicalId]
    .map(escapeStableKeySegment)
    .join(':');
}

export function parseStableIdentityKey(value: string): StableIdentityRef | undefined {
  const segments = value.split(':');
  if (segments.length !== 3) return undefined;
  return normalizeStableIdentityRef({
    worldpackId: unescapeStableKeySegment(segments[0]!),
    kind: unescapeStableKeySegment(segments[1]!),
    canonicalId: unescapeStableKeySegment(segments[2]!)
  });
}

function ref(worldpackId: string, kind: StableIdentityKind, canonicalId: string): StableIdentityRef {
  return { worldpackId, kind, canonicalId };
}

function legacyEraSeedRef(hk1988: Record<string, unknown>, worldpackId: string): StableIdentityRef | undefined {
  const stored = isRecord(hk1988.eraSeedIdentity) ? hk1988.eraSeedIdentity : undefined;
  if (!stored) return undefined;
  const canonicalId = nonEmptyString(stored.canonicalSeedId);
  if (canonicalId && findSeedIdentityByCanonicalId(canonicalId)) {
    return ref(worldpackId, 'era_seed', canonicalId);
  }
  const seedFigureId = nonEmptyString(stored.seedFigureId);
  const card = seedFigureId
    ? hkLateColonialEraSeedFigures.find((candidate) => candidate.id === seedFigureId)
    : undefined;
  return card ? ref(worldpackId, 'era_seed', seedCanonicalId(card)) : undefined;
}

function legacyScreenCharacterRef(
  hk1988: Record<string, unknown>,
  worldpackId: string
): StableIdentityRef | undefined {
  const stored = isRecord(hk1988.screenCharacterIdentity)
    ? hk1988.screenCharacterIdentity
    : undefined;
  if (!stored) return undefined;
  const canonicalId = nonEmptyString(stored.canonicalCharacterId);
  if (canonicalId && findScreenCharacterIdentityByCanonicalId(canonicalId)) {
    return ref(worldpackId, 'screen_character', canonicalId);
  }
  const seedCharacterId = nonEmptyString(stored.seedCharacterId);
  const card = seedCharacterId
    ? hkLateColonialScreenCharacterSeeds.find((candidate) => candidate.id === seedCharacterId)
    : undefined;
  return card
    ? ref(worldpackId, 'screen_character', screenCharacterCanonicalId(card))
    : undefined;
}

function legacyCityPowerRef(hk1988: Record<string, unknown>, worldpackId: string): StableIdentityRef | undefined {
  const stored = isRecord(hk1988.cityPowerIdentity) ? hk1988.cityPowerIdentity : undefined;
  const canonicalId = nonEmptyString(stored?.canonicalSeedId);
  return canonicalId && findCityPowerIdentityByCanonicalId(canonicalId)
    ? ref(worldpackId, 'city_power', canonicalId)
    : undefined;
}

function runtimeActorIdRef(actorId: string | undefined, worldpackId: string): StableIdentityRef | undefined {
  if (!actorId) return undefined;
  if (actorId.startsWith('npc_seed_')) {
    const canonicalId = actorId.slice('npc_seed_'.length);
    return findSeedIdentityByCanonicalId(canonicalId)
      ? ref(worldpackId, 'era_seed', canonicalId)
      : undefined;
  }
  if (actorId.startsWith('npc_screen_')) {
    const canonicalId = actorId.slice('npc_screen_'.length);
    return findScreenCharacterIdentityByCanonicalId(canonicalId)
      ? ref(worldpackId, 'screen_character', canonicalId)
      : undefined;
  }
  if (actorId.startsWith('npc_power_')) {
    const canonicalId = actorId.slice('npc_power_'.length);
    return findCityPowerIdentityByCanonicalId(canonicalId)
      ? ref(worldpackId, 'city_power', canonicalId)
      : undefined;
  }
  return undefined;
}

/**
 * Deterministic migration/projection only. This function never promotes an
 * actor from its display name or aliases.
 */
export function projectStableIdentityRef(
  actor: StableIdentityActorLike,
  worldpackId = 'hk1988',
  options: { allowRuntimeActorId?: boolean } = {}
): StableIdentityRef | undefined {
  const explicit = normalizeStableIdentityRef(actor.stableIdentityRef);
  if (explicit) return explicit;

  const worldpackData = isRecord(actor.worldpackActorData) ? actor.worldpackActorData : undefined;
  const hk1988 = worldpackData && isRecord(worldpackData.hk1988) ? worldpackData.hk1988 : undefined;
  const candidates = hk1988 && worldpackId === 'hk1988'
    ? [
        legacyEraSeedRef(hk1988, worldpackId),
        legacyScreenCharacterRef(hk1988, worldpackId),
        legacyCityPowerRef(hk1988, worldpackId)
      ].filter((candidate): candidate is StableIdentityRef => Boolean(candidate))
    : [];
  const unique = new Map(candidates.map((candidate) => [toStableIdentityKey(candidate), candidate]));
  if (unique.size === 1) return [...unique.values()][0];
  if (unique.size > 1) return undefined;

  return worldpackId === 'hk1988' && options.allowRuntimeActorId !== false
    ? runtimeActorIdRef(actor.actorId, worldpackId)
    : undefined;
}

export function withProjectedStableIdentity<T extends StableIdentityActorLike>(
  actor: T,
  worldpackId = 'hk1988',
  options: { allowRuntimeActorId?: boolean } = {}
): T {
  const stableIdentityRef = projectStableIdentityRef(actor, worldpackId, options);
  return stableIdentityRef ? { ...actor, stableIdentityRef } : actor;
}
