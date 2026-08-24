import type { StableIdentityRef } from '../avgResourcePack/types';
import { projectStableIdentityRef, toStableIdentityKey } from '../avgResourcePack/stableIdentity';
import { hkLateColonialPowerFigures } from '../cityPower/hkLateColonialPowerFigures';
import { cityPowerRuntimeActorId } from '../cityPower/cityPowerIdentityIds';
import { hkLateColonialEraSeedFigures } from '../eraSeed/hkLateColonialEraSeedFigures';
import { seedCanonicalId, seedRuntimeActorId } from '../eraSeed/seedIdentityLock';
import { createActorDefaults } from '../runtime/actorFactory';
import type { Actor, ActorManualProfileField, RuntimeState } from '../runtime/types';
import { hkLateColonialScreenCharacterSeeds } from '../screenCharacterSeed/hkLateColonialScreenCharacterSeeds';
import {
  screenCharacterCanonicalId,
  screenCharacterRuntimeActorId
} from '../screenCharacterSeed/screenCharacterIdentityLock';

export type FixedActorIdentityKind = 'era_seed' | 'screen_character' | 'city_power';

export interface FixedActorIdentityDescriptor {
  ref: StableIdentityRef & { kind: FixedActorIdentityKind };
  key: string;
  runtimeActorId: string;
  displayName: string;
  englishName?: string;
  aliases: string[];
  publicIdentity: string;
  actualIdentitySummary: string;
  positionSummary: string;
  profileSummary: string;
  appearance?: string;
  clothing?: string;
  personality?: string;
  speechStyle?: string;
  motivation?: string;
  longTermGoal?: string;
  values?: string;
}

interface ActorIdentityPatchLike {
  actorId: string;
  name?: string;
  englishName?: string;
  aliases?: string[];
  callName?: string;
  worldpackActorData?: Record<string, unknown>;
}

export interface FixedActorIdentityConflict {
  expected: FixedActorIdentityDescriptor;
  conflicting: FixedActorIdentityDescriptor[];
}

export interface FixedActorIdentityRepairResult {
  state: RuntimeState;
  repairedActorCount: number;
  repairedMemoryCount: number;
  ambiguousMemoryCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeFixedActorIdentityText(value: string | undefined): string | undefined {
  const normalized = value
    ?.normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return normalized || undefined;
}

function descriptor(ref: FixedActorIdentityDescriptor['ref'], draft: Omit<FixedActorIdentityDescriptor, 'ref' | 'key'>): FixedActorIdentityDescriptor {
  return { ref, key: toStableIdentityKey(ref), ...draft };
}

const fixedIdentityDescriptors: FixedActorIdentityDescriptor[] = [
  ...hkLateColonialEraSeedFigures.map((card) => {
    const canonicalId = seedCanonicalId(card);
    return descriptor(
      { worldpackId: 'hk1988', kind: 'era_seed', canonicalId },
      {
        runtimeActorId: seedRuntimeActorId(canonicalId),
        displayName: card.displayName,
        englishName: card.englishName,
        aliases: [...card.recognitionAliases, ...(card.protectedRealNames ?? [])],
        publicIdentity: card.publicRole,
        actualIdentitySummary: card.promptSafeProfile,
        positionSummary: card.publicRole,
        profileSummary: card.promptSafeProfile
      }
    );
  }),
  ...hkLateColonialScreenCharacterSeeds.map((card) => {
    const canonicalId = screenCharacterCanonicalId(card);
    return descriptor(
      { worldpackId: 'hk1988', kind: 'screen_character', canonicalId },
      {
        runtimeActorId: screenCharacterRuntimeActorId(canonicalId),
        displayName: card.displayName,
        englishName: card.englishName,
        aliases: [...card.recognitionAliases],
        publicIdentity: card.publicIdentity,
        actualIdentitySummary: card.actualIdentitySummary,
        positionSummary: card.positionSummary,
        profileSummary: card.profileSummary,
        appearance: card.appearanceAnchor,
        clothing: card.clothingAnchor,
        personality: card.personality,
        speechStyle: card.speechStyle,
        motivation: card.motivation,
        longTermGoal: card.longTermGoal,
        values: card.values
      }
    );
  }),
  ...hkLateColonialPowerFigures.map((card) => descriptor(
    { worldpackId: 'hk1988', kind: 'city_power', canonicalId: card.canonicalSeedId },
    {
      runtimeActorId: card.runtimeActorId || cityPowerRuntimeActorId(card.canonicalSeedId),
      displayName: card.displayName,
      englishName: card.englishName,
      aliases: [...card.recognitionAliases, ...(card.protectedRealNames ?? [])],
      publicIdentity: card.publicRole,
      actualIdentitySummary: card.promptSafeProfile,
      positionSummary: card.publicRole,
      profileSummary: card.promptSafeProfile
    }
  ))
];

const descriptorsByKey = new Map(fixedIdentityDescriptors.map((item) => [item.key, item]));

function identityValues(item: FixedActorIdentityDescriptor): string[] {
  return [item.runtimeActorId, item.displayName, item.englishName, ...item.aliases]
    .filter((value): value is string => Boolean(value?.trim()));
}

export function findFixedActorIdentityDescriptors(value: string | undefined): FixedActorIdentityDescriptor[] {
  const normalized = normalizeFixedActorIdentityText(value);
  if (!normalized) return [];
  const matches = fixedIdentityDescriptors.filter((item) =>
    identityValues(item).some((candidate) => normalizeFixedActorIdentityText(candidate) === normalized)
  );
  return [...new Map(matches.map((item) => [item.key, item])).values()];
}

export function fixedActorIdentityFromRef(ref: StableIdentityRef | undefined): FixedActorIdentityDescriptor | undefined {
  if (!ref || ref.worldpackId !== 'hk1988' || ref.kind === 'custom_character') return undefined;
  return descriptorsByKey.get(toStableIdentityKey(ref));
}

export function fixedActorIdentityFromActor(actor: Pick<Actor, 'actorId' | 'stableIdentityRef' | 'worldpackActorData'>): FixedActorIdentityDescriptor | undefined {
  return fixedActorIdentityFromRef(projectStableIdentityRef(actor, 'hk1988'));
}

function patchAnchorIdentity(patch: ActorIdentityPatchLike): FixedActorIdentityDescriptor | undefined {
  return fixedActorIdentityFromRef(projectStableIdentityRef(patch, 'hk1988'));
}

function patchClaimedIdentities(patch: ActorIdentityPatchLike): FixedActorIdentityDescriptor[] {
  const claims = [patch.name, patch.englishName, patch.callName, ...(patch.aliases ?? [])]
    .flatMap(findFixedActorIdentityDescriptors);
  return [...new Map(claims.map((item) => [item.key, item])).values()];
}

export function evaluateFixedActorIdentityPatch(
  existingActor: Actor | undefined,
  patch: ActorIdentityPatchLike
): FixedActorIdentityConflict | undefined {
  const expected = fixedActorIdentityFromActor(existingActor ?? patch) ?? patchAnchorIdentity(patch);
  if (!expected) return undefined;
  const conflicting = patchClaimedIdentities(patch).filter((item) => item.key !== expected.key);
  return conflicting.length ? { expected, conflicting } : undefined;
}

export function actorNameMatchesFixedIdentity(actor: Actor, actorName: string | undefined): boolean {
  if (!actorName?.trim()) return true;
  const normalized = normalizeFixedActorIdentityText(actorName);
  const directValues = [actor.name, actor.englishName, actor.callName, ...actor.aliases]
    .map(normalizeFixedActorIdentityText)
    .filter(Boolean);
  if (normalized && directValues.includes(normalized)) return true;

  const expected = fixedActorIdentityFromActor(actor);
  if (!expected) return false;
  const matches = findFixedActorIdentityDescriptors(actorName);
  return matches.length === 1 && matches[0]?.key === expected.key;
}

export function fixedActorIdentityMergeConflicts(target: Actor, source: Actor): boolean {
  const targetIdentity = fixedActorIdentityFromActor(target);
  const sourceIdentity = fixedActorIdentityFromActor(source);
  if (targetIdentity && sourceIdentity) return targetIdentity.key !== sourceIdentity.key;
  if (targetIdentity) {
    return [source.name, source.englishName, source.callName, ...source.aliases]
      .flatMap(findFixedActorIdentityDescriptors)
      .some((item) => item.key !== targetIdentity.key);
  }
  if (sourceIdentity) {
    return [target.name, target.englishName, target.callName, ...target.aliases]
      .flatMap(findFixedActorIdentityDescriptors)
      .some((item) => item.key !== sourceIdentity.key);
  }
  return false;
}

function fixedIdentityMetadata(item: FixedActorIdentityDescriptor): Record<string, unknown> {
  if (item.ref.kind === 'era_seed') {
    return {
      eraSeedIdentity: {
        canonicalSeedId: item.ref.canonicalId,
        displayName: item.displayName,
        ...(item.englishName ? { englishName: item.englishName } : {})
      }
    };
  }
  if (item.ref.kind === 'screen_character') {
    const card = hkLateColonialScreenCharacterSeeds.find(
      (candidate) => screenCharacterCanonicalId(candidate) === item.ref.canonicalId
    );
    return {
      screenCharacterIdentity: {
        canonicalCharacterId: item.ref.canonicalId,
        ...(card ? { seedCharacterId: card.id, sourceWorkId: card.sourceWorkId } : {}),
        displayName: item.displayName
      }
    };
  }
  return {
    cityPowerIdentity: {
      canonicalSeedId: item.ref.canonicalId,
      displayName: item.displayName,
      ...(item.englishName ? { englishName: item.englishName } : {})
    }
  };
}

function isLocked(actor: Actor, field: ActorManualProfileField): boolean {
  return actor.manualProfileOverride?.lockedFields.includes(field) ?? false;
}

function repairFixedActor(actor: Actor, item: FixedActorIdentityDescriptor): { actor: Actor; changed: boolean } {
  const safeAliases = [...new Set([...item.aliases, ...actor.aliases])].filter((alias) => {
    const matches = findFixedActorIdentityDescriptors(alias);
    return (
      alias !== item.displayName &&
      alias !== item.englishName &&
      (matches.length === 0 || matches.every((match) => match.key === item.key))
    );
  });
  const callNameMatches = findFixedActorIdentityDescriptors(actor.callName);
  const repairedCallName = callNameMatches.some((match) => match.key !== item.key) ? undefined : actor.callName;
  const hk1988 = isRecord(actor.worldpackActorData?.hk1988) ? actor.worldpackActorData!.hk1988 : {};
  const {
    eraSeedIdentity: _eraSeedIdentity,
    screenCharacterIdentity: _screenCharacterIdentity,
    cityPowerIdentity: _cityPowerIdentity,
    ...otherHk1988Data
  } = hk1988;
  const repairedHk1988 = {
    ...otherHk1988Data,
    ...fixedIdentityMetadata(item)
  };
  const next = createActorDefaults({
    ...actor,
    ...(!isLocked(actor, 'name') ? { name: item.displayName } : {}),
    ...(!isLocked(actor, 'englishName') ? { englishName: item.englishName } : {}),
    ...(!isLocked(actor, 'aliases') ? { aliases: safeAliases } : {}),
    ...(!isLocked(actor, 'callName') ? { callName: repairedCallName } : {}),
    ...(!isLocked(actor, 'publicIdentity') ? { publicIdentity: item.publicIdentity } : {}),
    ...(!isLocked(actor, 'actualIdentitySummary') ? { actualIdentitySummary: item.actualIdentitySummary } : {}),
    ...(!isLocked(actor, 'positionSummary') ? { positionSummary: item.positionSummary } : {}),
    ...(!isLocked(actor, 'profileSummary') ? { profileSummary: item.profileSummary } : {}),
    ...(item.appearance && !isLocked(actor, 'appearance') ? { appearance: item.appearance } : {}),
    ...(item.clothing && !isLocked(actor, 'clothing') ? { clothing: item.clothing } : {}),
    ...(item.personality && !isLocked(actor, 'personality') ? { personality: item.personality } : {}),
    ...(item.speechStyle && !isLocked(actor, 'speechStyle') ? { speechStyle: item.speechStyle } : {}),
    ...(item.motivation && !isLocked(actor, 'motivation') ? { motivation: item.motivation } : {}),
    ...(item.longTermGoal && !isLocked(actor, 'longTermGoal') ? { longTermGoal: item.longTermGoal } : {}),
    ...(item.values && !isLocked(actor, 'values') ? { values: item.values } : {}),
    stableIdentityRef: item.ref,
    worldpackActorData: {
      ...(actor.worldpackActorData ?? {}),
      hk1988: repairedHk1988
    }
  });
  return { actor: next, changed: JSON.stringify(next) !== JSON.stringify(actor) };
}

function actorIdForFixedIdentity(actors: Record<string, Actor>, item: FixedActorIdentityDescriptor): string | undefined {
  return Object.values(actors).find((actor) => fixedActorIdentityFromActor(actor)?.key === item.key)?.actorId;
}

export function repairFixedActorIdentityIntegrity(state: RuntimeState): FixedActorIdentityRepairResult {
  const actors = { ...state.actors };
  let repairedActorCount = 0;
  for (const actor of Object.values(actors)) {
    const item = fixedActorIdentityFromActor(actor);
    if (!item) continue;
    const contamination = evaluateFixedActorIdentityPatch(actor, actor) ||
      actor.name !== item.displayName ||
      actor.englishName !== item.englishName;
    if (!contamination) continue;
    const repaired = repairFixedActor(actor, item);
    if (!repaired.changed) continue;
    actors[actor.actorId] = repaired.actor;
    repairedActorCount += 1;
  }

  const memories = { ...state.memories };
  let repairedMemoryCount = 0;
  let ambiguousMemoryCount = 0;
  for (const [memoryId, memory] of Object.entries(memories)) {
    if (memory.relatedActorIds.length !== 1) continue;
    const currentActor = actors[memory.relatedActorIds[0]!];
    const currentIdentity = currentActor ? fixedActorIdentityFromActor(currentActor) : undefined;
    if (!currentIdentity) continue;
    const normalizedMemoryText = normalizeFixedActorIdentityText(memory.text) ?? '';
    const mentioned = fixedIdentityDescriptors.filter((item) =>
      identityValues(item)
        .map(normalizeFixedActorIdentityText)
        .filter((value): value is string => Boolean(value && value.length >= 2))
        .some((value) => normalizedMemoryText.includes(value))
    );
    const uniqueMentioned = [...new Map(mentioned.map((item) => [item.key, item])).values()];
    if (uniqueMentioned.length === 0 || uniqueMentioned.some((item) => item.key === currentIdentity.key)) continue;
    if (uniqueMentioned.length !== 1) {
      ambiguousMemoryCount += 1;
      continue;
    }
    const targetActorId = actorIdForFixedIdentity(actors, uniqueMentioned[0]!);
    if (!targetActorId) {
      ambiguousMemoryCount += 1;
      continue;
    }
    memories[memoryId] = { ...memory, relatedActorIds: [targetActorId] };
    repairedMemoryCount += 1;
  }

  return {
    state: repairedActorCount || repairedMemoryCount ? { ...state, actors, memories } : state,
    repairedActorCount,
    repairedMemoryCount,
    ambiguousMemoryCount
  };
}
