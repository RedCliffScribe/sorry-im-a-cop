import { createActorDefaults, normalizeActor } from '../runtime/actorFactory';
import {
  missingActorProfileEnrichmentFields,
  normalizePendingActorProfileEnrichment
} from '../runtime/actorProfileEnrichment';
import { applyActorFemaleProfilePatch } from '../runtime/femaleProfile';
import { applyEquippedAssetsToRuntimeState, normalizeEquippedItemIds } from '../assets/equipmentSlots';
import { isSpendableCashAsset } from '../assets/assetWritebackPolicy';
import { enforceAssetPurchaseWritebackAtomicity } from '../assets/assetWritebackIntent';
import { applyPlayerClothingPatch } from '../clothing/clothingState';
import { applyCombatEventPatch, applyJudgementCheckPatch, linkConflictRecordsToStoryEntry } from '../conflict/conflictRuntime';
import { applyFinancePatch, applyGrayLedgerPatch } from '../finance/applyFinancePatch';
import { syncPlayerEconomyWithFinance } from '../finance/financeState';
import { applyDueMonthlySettlements } from '../finance/monthlySettlement';
import { syncPlayerPoliceSalaryCashflow } from '../finance/playerSalaryCashflow';
import { synchronizeNpcMemoryCaches } from '../memory/npcMemoryLayers';
import { normalizeMemoryTemporalText } from '../time/memoryTemporal';
import { enforcePlayerNewsworthiness } from '../news/newsworthiness';
import { enforcePlayerCaseLead } from '../cases/caseLeadContract';
import { deduplicateExactCaseEvidence } from '../cases/caseEvidenceDeduplication';
import { settleTurnExperience } from '../progression/turnExperience';
import {
  actorMatchesSeedIdentity,
  findSeedIdentityByCanonicalId,
  findSeedIdentityMatch,
  isProtectedSeedName,
  redactSeedProtectedNames,
  seedMatchFromStoredActor,
  type SeedIdentityMatch
} from '../eraSeed/seedIdentityLock';
import {
  actorMatchesScreenCharacterIdentity,
  findScreenCharacterIdentityByCanonicalId,
  findScreenCharacterIdentityMatch,
  findScreenCharacterIdentityMatchForSource,
  screenCharacterMatchFromStoredActor,
  type ScreenCharacterIdentityMatch
} from '../screenCharacterSeed/screenCharacterIdentityLock';
import {
  cityPowerMatchFromStoredActor,
  findCityPowerIdentityByCanonicalId,
  findCityPowerIdentityMatch,
  redactCityPowerProtectedNames,
  type CityPowerIdentityMatch
} from '../cityPower/cityPowerIdentityLock';
import { applyCitySituationTrackPatches } from '../cityPower/citySituationTrackPatch';
import { applyGrayNetworkPatch, type GrayNetworkPatch } from '../grayNetwork/grayNetwork';
import {
  applyTriadOrganizationStatePatch,
  remapTriadOrganizationStateActorIds
} from '../grayNetwork/triadOrganizationState';
import { applyPolicePanelPatch, type PolicePanelPatch } from '../police/policePanel';
import {
  applyPoliceCareerProgress,
  isPolicePromotionDlcBound,
  type PoliceCareerProgressPatch
} from '../police/policeCareerProgress';
import { synchronizePlayerPoliceRank } from '../police/playerPoliceRank';
import { applyPregnancyLifecycle } from '../pregnancy/pregnancyLifecycle';
import { evaluateRelationshipCreationEvidence } from '../relationship/relationshipEvidence';
import { resolveRelationshipThreadIdentity } from '../relationship/relationshipIdentity';
import { applyRelationshipThreadPatch, type RelationshipThreadPatch } from '../relationship/relationshipThread';
import { reconcileActorRelationshipProfiles } from '../relationship/relationshipActorProfile';
import {
  clampReputationScore,
  clampReputationVisibility,
  deriveOverallReputationFromCircles,
  resolveOverallReputationBaseline
} from '../reputation/reputation';
import {
  applyWeatherPatchToEnvironmentWithDiagnostics,
  refreshWeatherIfExpired
} from '../weather/weather';
import { createStoryDialogueSpeakerActorIds } from '../runtime/storyDialogueActors';
import { buildStoryBlocks } from '../runtime/storyBlocks';
import { filterManuallyLockedActorPatch } from '../runtime/manualActorProfile';
import { resolveCurrentMatterIdentity } from '../dynamicEvents/currentMatterIdentity';
import { advanceSignalLifecycle } from '../dynamic/signalLifecycle';
import { deriveActorAgeAt, normalizeActorBirthDate, normalizeRuntimeActorAges } from '../runtime/actorAge';
import {
  applyPlayerIdentityContextPatch,
  applySecretFactPatches,
  type PlayerIdentityContextPatch,
  type SecretFactPatch
} from '../identity/playerIdentityContext';
import {
  applyPlayerCivilianRoleProfilePatch,
  type PlayerCivilianRoleProfilePatch
} from '../identity/playerCivilianRoleProfile';
import {
  actorNameMatchesFixedIdentity,
  evaluateFixedActorIdentityPatch
} from '../identity/fixedActorIdentityGuard';
import {
  applyPlayerPoliceRoleProfilePatch,
  type PlayerPoliceRoleProfilePatch
} from '../identity/playerPoliceRoleProfile';
import { resolveOrganizationWritebackIdentity } from '../institution/organizationIdentity';
import {
  createVitalsConditionLifecycle,
  inferConditionPersistence
} from '../vitals/playerVitalsLifecycle';
import type {
  Actor,
  AssetItem,
  CaseEvidence,
  CaseEvidenceType,
  CaseFile,
  CurrentMatter,
  DeferredEvent,
  DynamicEventsState,
  GameTime,
  LawIdentityRuntime,
  MemoryItem,
  NewsArticle,
  NewsIssue,
  Organization,
  OrganizationStructureNode,
  PendingActorProfileEnrichment,
  Place,
  PlayerReputationLogEntry,
  PlayerReputationState,
  RuntimeMapState,
  RuntimeAssetsState,
  RuntimeState,
  Scene,
  Signal,
  StoryDiagnosticIssue,
  StoryEntry,
  StoryTurnMetrics,
  Trait,
  TraitProgress,
  TurnId,
  Vitals
} from '../runtime/types';
import { createStoryVisualContext } from '../runtime/storyVisualContext';
import type { NarratorResponse } from './schema';
import type { PregnancyMode } from '../settings/types';

type ActorPatch = NarratorResponse['writeback']['actorPatches'][number];
type PlayerPatch = NonNullable<NarratorResponse['writeback']['playerPatch']>;
type LocationPatch = NonNullable<NarratorResponse['writeback']['locationPatch']>;
type PlacePatch = NarratorResponse['writeback']['placePatches'][number];
type ScenePatch = NarratorResponse['writeback']['scenePatches'][number];
type CasePatch = NarratorResponse['writeback']['casePatches'][number];
type CaseEvidencePatch = NarratorResponse['writeback']['caseEvidencePatches'][number];
type DeferredEventPatch = NarratorResponse['writeback']['deferredEventPatches'][number];
type CurrentMatterPatch = NarratorResponse['writeback']['currentMatterPatches'][number];
type SignalPatch = NarratorResponse['writeback']['signalPatches'][number];
type NewsIssuePatch = NarratorResponse['writeback']['newsIssuePatches'][number];
type OrganizationPatch = NarratorResponse['writeback']['organizationPatches'][number];
type OrganizationRelationPatch = ActorPatch['organizationRelations'][number];
type JudgementCheckPatch = NarratorResponse['writeback']['judgementCheckPatches'][number];
type CombatEventPatch = NarratorResponse['writeback']['combatEventPatches'][number];
type ReputationPatch = PlayerPatch['reputationPatches'][number];
type AssetPatch = NonNullable<NarratorResponse['writeback']['assetPatch']>;
type FinancePatch = NonNullable<NarratorResponse['writeback']['financePatch']>;
type GrayLedgerPatch = NonNullable<NarratorResponse['writeback']['grayLedgerPatch']>;
type CivilianRoleProfilePatch = NonNullable<NarratorResponse['writeback']['civilianRoleProfilePatch']>;
type PoliceRoleProfilePatch = NonNullable<NarratorResponse['writeback']['policeRoleProfilePatch']>;

interface ActorReferenceResolution {
  actorId: string;
  remapped: boolean;
}

function addMinutes(time: GameTime, elapsedMinutes: number): GameTime {
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute + elapsedMinutes));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function cloneGameTime(time: GameTime): GameTime {
  return { ...time };
}

function appendTurnDiagnostics(
  state: RuntimeState,
  turnId: TurnId,
  diagnostics: readonly StoryDiagnosticIssue[]
): RuntimeState {
  if (diagnostics.length === 0) return state;
  let appended = false;
  const storyLog = state.storyLog.map((entry) => {
    if (appended || entry.turnId !== turnId || entry.speaker !== 'narrator') return entry;
    appended = true;
    return {
      ...entry,
      writebackDiagnostics: [...(entry.writebackDiagnostics ?? []), ...diagnostics]
    };
  });
  return appended ? { ...state, storyLog } : state;
}

const RETAINED_HEAVY_NARRATOR_TURNS = 10;

function pruneHeavyStoryPayloads(storyLog: StoryEntry[]): StoryEntry[] {
  const retainedNarratorIndexes = new Set(
    storyLog
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.speaker === 'narrator')
      .slice(-RETAINED_HEAVY_NARRATOR_TURNS)
      .map(({ index }) => index)
  );

  return storyLog.map((entry, index) => {
    if (entry.speaker !== 'narrator' || retainedNarratorIndexes.has(index)) return entry;
    const {
      rawNarratorResponse: _rawNarratorResponse,
      writebackDiagnostics: _writebackDiagnostics,
      ...lightweightEntry
    } = entry;
    return lightweightEntry;
  });
}

function gameTimeToUtcMs(time: GameTime): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
}

function elapsedMinutesBetween(startTime: GameTime, endTime: GameTime): number {
  return Math.max(0, Math.round((gameTimeToUtcMs(endTime) - gameTimeToUtcMs(startTime)) / 60_000));
}

function resolveTurnEndTime(startTime: GameTime, timePatch: NarratorResponse['timePatch']): GameTime {
  if (!timePatch) return cloneGameTime(startTime);

  const elapsedTime =
    timePatch.elapsedMinutes === undefined ? undefined : addMinutes(startTime, timePatch.elapsedMinutes);
  if (!timePatch.targetTime) return elapsedTime ?? cloneGameTime(startTime);

  const targetTime = cloneGameTime(timePatch.targetTime);
  if (gameTimeToUtcMs(targetTime) >= gameTimeToUtcMs(startTime)) return targetTime;

  return elapsedTime ?? cloneGameTime(startTime);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mergeUnique<T extends string>(existing: T[] | undefined, incoming: T[] | undefined): T[] {
  return Array.from(new Set([...(existing ?? []), ...(incoming ?? [])]));
}

function organizationRelationKey(relation: Pick<OrganizationRelationPatch, 'organizationId' | 'relationType' | 'roleTitle'>): string {
  return [relation.organizationId, relation.relationType, relation.roleTitle ?? ''].join('\u0000');
}

function mergeActorOrganizationRelations(
  existing: Actor['organizationRelations'],
  incoming: OrganizationRelationPatch[] | undefined
): Actor['organizationRelations'] {
  if (!incoming?.length) return existing;

  const relationsByKey = new Map(existing.map((relation) => [organizationRelationKey(relation), relation]));
  for (const relation of incoming) {
    const previous = relationsByKey.get(organizationRelationKey(relation));
    relationsByKey.set(organizationRelationKey(relation), {
      ...previous,
      ...relation
    });
  }

  return Array.from(relationsByKey.values());
}

function visibleOrganizationIdsFromRelations(relations: Actor['organizationRelations']): string[] {
  return relations.filter((relation) => relation.visibility !== 'hidden').map((relation) => relation.organizationId);
}

function remapActorIds(actorIds: string[] | undefined, actorIdAliases: Map<string, string>): string[] | undefined {
  if (!actorIds) return undefined;

  return Array.from(new Set(actorIds.map((actorId) => actorIdAliases.get(actorId) ?? actorId)));
}

function remapPlayerIdentityContextPatchActorIds(
  patch: PlayerIdentityContextPatch,
  actorIdAliases: Map<string, string>
): PlayerIdentityContextPatch {
  const targetRoleProfile = patch.targetRoleProfile;
  const remappedTargetRoleProfile =
    targetRoleProfile.identity === 'police'
      ? {
          ...targetRoleProfile,
          profile: {
            ...targetRoleProfile.profile,
            supervisorActorIds:
              remapActorIds(targetRoleProfile.profile.supervisorActorIds, actorIdAliases) ?? [],
            peerActorIds: remapActorIds(targetRoleProfile.profile.peerActorIds, actorIdAliases) ?? []
          }
        }
      : targetRoleProfile.identity === 'gang_member'
        ? {
            ...targetRoleProfile,
            profile: {
              ...targetRoleProfile.profile,
              patronActorIds:
                remapActorIds(targetRoleProfile.profile.patronActorIds, actorIdAliases) ?? [],
              peerActorIds: remapActorIds(targetRoleProfile.profile.peerActorIds, actorIdAliases) ?? [],
              rivalActorIds: remapActorIds(targetRoleProfile.profile.rivalActorIds, actorIdAliases) ?? []
            }
          }
        : {
            ...targetRoleProfile,
            profile: {
              ...targetRoleProfile.profile,
              livelihoodActorIds:
                remapActorIds(targetRoleProfile.profile.livelihoodActorIds, actorIdAliases) ?? []
            }
          };

  return {
    ...patch,
    targetRoleProfile: remappedTargetRoleProfile,
    secretFactPatches: patch.secretFactPatches?.map((secretPatch) =>
      secretPatch.operation === 'upsert'
        ? {
            ...secretPatch,
            fact: {
              ...secretPatch.fact,
              knownByActorIds:
                remapActorIds(secretPatch.fact.knownByActorIds, actorIdAliases) ?? []
            }
          }
        : secretPatch
    )
  };
}

function remapOrganizationStructureActorIds(
  nodes: OrganizationStructureNode[] | undefined,
  actorIdAliases: Map<string, string>
): OrganizationStructureNode[] | undefined {
  if (!nodes) return undefined;

  return nodes.map((node) => ({
    ...node,
    actorId: node.actorId ? actorIdAliases.get(node.actorId) ?? node.actorId : undefined,
    children: remapOrganizationStructureActorIds(node.children, actorIdAliases) ?? []
  }));
}

function remapCombatParticipants(
  participants: CombatEventPatch['participants'],
  actorIdAliases: Map<string, string>
): CombatEventPatch['participants'] {
  return participants.map((participant) => ({
    ...participant,
    actorId: participant.actorId ? actorIdAliases.get(participant.actorId) ?? participant.actorId : undefined
  }));
}

function remapGrayNetworkPatchActorIds(patch: GrayNetworkPatch, actorIdAliases: Map<string, string>): GrayNetworkPatch {
  return {
    ...patch,
    knownOrganizations: patch.knownOrganizations?.map((organization) => ({
      ...organization,
      relatedActorIds: remapActorIds(organization.relatedActorIds, actorIdAliases) ?? []
    })),
    keyPlaces: patch.keyPlaces?.map((place) => ({
      ...place,
      relatedActorIds: remapActorIds(place.relatedActorIds, actorIdAliases) ?? []
    })),
    relatedPeople: patch.relatedPeople?.map((person) => ({
      ...person,
      actorId: actorIdAliases.get(person.actorId) ?? person.actorId
    })),
    relationClues: patch.relationClues?.map((clue) => ({
      ...clue,
      relatedActorIds: remapActorIds(clue.relatedActorIds, actorIdAliases) ?? []
    })),
    actionRisks: patch.actionRisks?.map((risk) => ({
      ...risk,
      relatedActorIds: remapActorIds(risk.relatedActorIds, actorIdAliases) ?? []
    })),
    suggestedActions: patch.suggestedActions?.map((action) => ({
      ...action,
      relatedActorIds: remapActorIds(action.relatedActorIds, actorIdAliases) ?? []
    })),
    removeIds: patch.removeIds
      ? {
          ...patch.removeIds,
          actorIds: remapActorIds(patch.removeIds.actorIds, actorIdAliases)
        }
      : undefined
  };
}

function mergeTraits(existing: Trait[], incoming: Trait[] | undefined): Trait[] {
  if (!incoming?.length) return existing;

  const traitsById = new Map(existing.map((trait) => [trait.traitId, trait]));
  for (const trait of incoming) {
    const previous = traitsById.get(trait.traitId);
    traitsById.set(trait.traitId, {
      ...previous,
      ...trait,
      scopes: [...trait.scopes]
    });
  }

  return Array.from(traitsById.values());
}

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNumber(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasReputationAuditFields(patch: { summary?: string; reason?: string }): boolean {
  return hasText(patch.summary) && hasText(patch.reason);
}

function hasReputationOverviewMutation(patch: NonNullable<PlayerPatch['reputation']>): boolean {
  return (
    hasNumber(patch.notorietySet) ||
    hasNumber(patch.notorietyDelta) ||
    hasText(patch.summary) ||
    hasText(patch.reason)
  );
}

export function missingMinimumNewActorFields(patch: ActorPatch, currentTime: GameTime): string[] {
  const missing: string[] = [];
  if (!hasText(patch.name)) missing.push('name');
  if (!patch.gender || patch.gender === 'unknown') missing.push('gender');

  const hasValidComputedAge =
    typeof patch.computedAge === 'number' &&
    Number.isInteger(patch.computedAge) &&
    patch.computedAge >= 0 &&
    patch.computedAge <= 130;
  const normalizedBirthDate = normalizeActorBirthDate(patch.birthDate);
  const hasValidBirthDate = Boolean(
    normalizedBirthDate && deriveActorAgeAt({ birthDate: normalizedBirthDate }, currentTime) !== undefined
  );
  if (!hasValidComputedAge && !hasValidBirthDate) missing.push('birthDate|computedAge');

  if (!patch.currentIdentity && !hasText(patch.publicIdentity)) {
    missing.push('currentIdentity|publicIdentity');
  }

  return missing;
}

function sanitizeActorDemographicPatch<T extends Pick<ActorPatch, 'birthDate' | 'computedAge'>>({
  patch,
  actorExists,
  currentTime,
  path,
  diagnostics
}: {
  patch: T;
  actorExists: boolean;
  currentTime: GameTime;
  path: Array<string | number>;
  diagnostics: StoryDiagnosticIssue[];
}): T {
  const protectedFields = [
    ...(patch.birthDate !== undefined ? ['birthDate'] : []),
    ...(patch.computedAge !== undefined ? ['computedAge'] : [])
  ];

  if (actorExists) {
    if (protectedFields.length > 0) {
      diagnostics.push({
        path,
        code: 'actor_immutable_demographic_ignored',
        message: `Protected demographic fields were ignored for an existing actor: ${protectedFields.join(', ')}.`
      });
    }
    const { birthDate: _birthDate, computedAge: _computedAge, ...safePatch } = patch;
    return safePatch as unknown as T;
  }

  if (patch.birthDate === undefined) return patch;

  const normalizedBirthDate = normalizeActorBirthDate(patch.birthDate);
  const derivedAge = normalizedBirthDate
    ? deriveActorAgeAt({ birthDate: normalizedBirthDate }, currentTime)
    : undefined;
  if (!normalizedBirthDate || derivedAge === undefined) {
    diagnostics.push({
      path: [...path, 'birthDate'],
      code: 'actor_invalid_birth_date_ignored',
      message: 'The new actor birthDate was ignored because it is not a valid past or current calendar date.'
    });
    const { birthDate: _birthDate, ...safePatch } = patch;
    return safePatch as unknown as T;
  }

  if (patch.computedAge !== undefined && patch.computedAge !== derivedAge) {
    diagnostics.push({
      path,
      code: 'actor_age_rederived_from_birth_date',
      message: 'The new actor computedAge conflicted with birthDate and was replaced with the age derived at turn end.'
    });
  }

  return {
    ...patch,
    birthDate: normalizedBirthDate,
    computedAge: derivedAge
  } as T;
}

function resolveActorReferenceWithAliases(
  actors: Record<string, Actor>,
  actorIdAliases: Map<string, string>,
  actorId: string
): ActorReferenceResolution {
  const aliasedActorId = actorIdAliases.get(actorId);
  if (aliasedActorId && actors[aliasedActorId]) {
    return { actorId: aliasedActorId, remapped: true };
  }

  return { actorId, remapped: false };
}

function applyVitalsPatch(
  vitals: Vitals,
  patch: NonNullable<ActorPatch['vitalsPatch']>,
  reviewedAt: GameTime
): Vitals {
  const nextVitals = {
    ...vitals,
    health: clamp(vitals.health + patch.healthDelta, 0, vitals.maxHealth),
    stamina: clamp(vitals.stamina + patch.staminaDelta, 0, vitals.maxStamina),
    conditionSummary: patch.conditionSummary ?? vitals.conditionSummary
  };
  const summaryChanged =
    patch.conditionSummary !== undefined && patch.conditionSummary.trim() !== vitals.conditionSummary.trim();
  const persistence =
    patch.conditionPersistence ??
    (summaryChanged
      ? inferConditionPersistence(nextVitals)
      : vitals.conditionLifecycle?.persistence ?? inferConditionPersistence(nextVitals));
  return {
    ...nextVitals,
    conditionLifecycle: createVitalsConditionLifecycle(
      persistence,
      summaryChanged
        ? reviewedAt
        : vitals.conditionLifecycle?.establishedAt ?? reviewedAt,
      reviewedAt
    )
  };
}

function nextId(prefix: string, count: number): string {
  return `${prefix}_${String(count + 1).padStart(4, '0')}`;
}

function nextAvailableId(prefix: string, existing: Record<string, unknown>): string {
  let count = Object.keys(existing).length;
  let id = nextId(prefix, count);
  while (id in existing) {
    count += 1;
    id = nextId(prefix, count);
  }
  return id;
}

function normalizeMemoryTextForDedupe(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function findSameTurnActorMemory(
  memories: Record<string, MemoryItem>,
  actorId: string,
  turnId: string,
  text: string
): MemoryItem | undefined {
  const normalizedText = normalizeMemoryTextForDedupe(text);
  return Object.values(memories).find(
    (existing) =>
      existing.kind === 'actor' &&
      existing.relatedTurnId === turnId &&
      existing.relatedActorIds.includes(actorId) &&
      normalizeMemoryTextForDedupe(existing.text) === normalizedText
  );
}

function mergeVisibility(existing: MemoryItem['visibility'], incoming: MemoryItem['visibility']): MemoryItem['visibility'] {
  if (existing === 'player_known' || incoming === 'player_known') return 'player_known';
  return existing;
}

function appendActorMemoryItem(
  memories: Record<string, MemoryItem>,
  actorId: string,
  turnId: string,
  time: GameTime,
  referenceTime: GameTime,
  memory: Pick<MemoryItem, 'text' | 'visibility'> & Partial<Pick<MemoryItem, 'certainty'>>
): void {
  const normalized = normalizeMemoryTemporalText(memory.text, referenceTime);
  const duplicate = findSameTurnActorMemory(memories, actorId, turnId, normalized.text);
  if (duplicate) {
    duplicate.visibility = mergeVisibility(duplicate.visibility, memory.visibility);
    return;
  }

  const memoryId = nextAvailableId('memory', memories);
  memories[memoryId] = {
    memoryId,
    text: normalized.text,
    kind: 'actor',
    tier: 'short_term',
    relatedActorIds: [actorId],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    relatedTurnId: turnId,
    gameTime: cloneGameTime(time),
    importance: 50,
    visibility: memory.visibility,
    certainty: memory.certainty ?? 'claim',
    embeddingText: normalized.text,
    temporalReferences: normalized.temporalReferences.length > 0 ? normalized.temporalReferences : undefined
  };
}

function upsertTraitProgress(actor: Actor, suggestion: TraitProgress): Actor {
  const existing = actor.traitProgress.find((item) => item.traitId === suggestion.traitId);
  const traitProgress = existing
    ? actor.traitProgress.map((item) =>
        item.traitId === suggestion.traitId
          ? { ...item, progress: clamp(item.progress + suggestion.progress, 0, item.maxProgress), reason: suggestion.reason }
          : item
      )
    : [...actor.traitProgress, { ...suggestion, progress: clamp(suggestion.progress, 0, suggestion.maxProgress) }];

  return { ...actor, traitProgress };
}

function addActiveTrait(actor: Actor, trait: Trait): Actor {
  if (actor.activeTraits.some((item) => item.traitId === trait.traitId)) {
    return actor;
  }

  return {
    ...actor,
    activeTraits: [...actor.activeTraits, trait]
  };
}

function mirrorPlayerActorPatch(
  player: RuntimeState['player'],
  location: RuntimeState['location'],
  playerActorId: string,
  patch: ActorPatch,
  patchedActor?: Actor
): Pick<RuntimeState, 'player' | 'location'> {
  if (patch.actorId !== playerActorId) {
    return { player, location };
  }

  const nextPlayer =
    patch.name === undefined && patch.englishName === undefined && patchedActor?.vitals === undefined
      ? player
      : {
          ...player,
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.englishName === undefined ? {} : { englishName: patch.englishName }),
          ...(patchedActor?.vitals === undefined ? {} : { vitals: patchedActor.vitals })
        };
  const nextLocation =
    patch.currentPlaceId === undefined && patch.currentSceneId === undefined
      ? location
      : {
          ...location,
          ...(patch.currentPlaceId === undefined ? {} : { currentPlaceId: patch.currentPlaceId }),
          ...(patch.currentSceneId === undefined ? {} : { currentSceneId: patch.currentSceneId })
        };

  return { player: nextPlayer, location: nextLocation };
}

function mirrorPlayerTraits(player: RuntimeState['player'], actor: Actor): RuntimeState['player'] {
  return {
    ...player,
    activeTraits: [...actor.activeTraits],
    traitProgress: [...actor.traitProgress]
  };
}

function mergePlayerPoliceProfileIntoLawIdentity(
  lawIdentity: LawIdentityRuntime,
  policeProfile: Actor['roleProfiles']['police'] | undefined
): LawIdentityRuntime {
  if (!policeProfile) return lawIdentity;

  const rank = policeProfile.rank?.trim();
  const stationOrPost = policeProfile.stationOrPost?.trim();
  const department = policeProfile.department?.trim();
  const assignmentSummary = policeProfile.assignmentSummary?.trim();
  const authoritySummary = policeProfile.authoritySummary?.trim();
  const accessSummary = policeProfile.accessSummary?.trim();
  const dutySummary = policeProfile.dutySummary?.trim();
  const institutionalReputation = policeProfile.institutionalReputation?.trim();
  const disciplinePressureSummary = policeProfile.disciplinePressureSummary?.trim();

  return {
    ...lawIdentity,
    ...(policeProfile.agencyId ? { agencyId: policeProfile.agencyId } : {}),
    ...(stationOrPost ? { stationOrPost } : {}),
    ...(department ? { department } : {}),
    ...(rank ? { rank } : {}),
    ...(assignmentSummary ? { assignmentSummary } : {}),
    ...(policeProfile.supervisorActorIds.length ? { supervisorActorIds: [...policeProfile.supervisorActorIds] } : {}),
    ...(policeProfile.peerActorIds.length ? { peerActorIds: [...policeProfile.peerActorIds] } : {}),
    ...(authoritySummary ? { authoritySummary } : {}),
    ...(accessSummary ? { accessSummary } : {}),
    ...(dutySummary ? { dutySummary } : {}),
    ...(institutionalReputation ? { institutionalReputation } : {}),
    ...(disciplinePressureSummary ? { disciplinePressureSummary } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findExistingActorIdForScreenCharacterIdentity(
  actors: Record<string, Actor>,
  match: ScreenCharacterIdentityMatch
): string | undefined {
  if (actors[match.runtimeActorId]) return match.runtimeActorId;
  return Object.values(actors).find((actor) => actorMatchesScreenCharacterIdentity(actor, match))?.actorId;
}

function screenCharacterIdentityMetadata(match: ScreenCharacterIdentityMatch): Record<string, unknown> {
  return {
    canonicalCharacterId: match.canonicalCharacterId,
    seedCharacterId: match.seedCharacterId,
    sourceWorkId: match.sourceWorkId,
    displayName: match.displayName
  };
}

function mergeScreenCharacterWorldpackActorData(
  worldpackActorData: ActorPatch['worldpackActorData'] | undefined,
  match: ScreenCharacterIdentityMatch
): ActorPatch['worldpackActorData'] {
  const base = isRecord(worldpackActorData) ? worldpackActorData : {};
  const hk1988 = isRecord(base.hk1988) ? base.hk1988 : {};
  const {
    eraSeedIdentity: _discardEraSeedIdentity,
    cityPowerIdentity: _discardCityPowerIdentity,
    ...screenCharacterData
  } = hk1988;
  return {
    ...base,
    hk1988: {
      ...screenCharacterData,
      screenCharacterIdentity: screenCharacterIdentityMetadata(match)
    }
  };
}

function mergeScreenCharacterAliases(
  existing: string[] | undefined,
  incoming: string[] | undefined,
  match: ScreenCharacterIdentityMatch
): string[] {
  return mergeUnique(existing, [...match.recognitionAliases, ...(incoming ?? [])]).filter(
    (alias) => alias !== match.displayName && alias !== match.englishName
  );
}

function screenCharacterMatchFromPatchMetadata(patch: ActorPatch): ScreenCharacterIdentityMatch | undefined {
  const base = isRecord(patch.worldpackActorData) ? patch.worldpackActorData : undefined;
  const hk1988 = base && isRecord(base.hk1988) ? base.hk1988 : undefined;
  const identity = hk1988 && isRecord(hk1988.screenCharacterIdentity)
    ? hk1988.screenCharacterIdentity
    : undefined;
  const canonicalCharacterId = typeof identity?.canonicalCharacterId === 'string'
    ? identity.canonicalCharacterId
    : undefined;
  const canonicalMatch = findScreenCharacterIdentityByCanonicalId(canonicalCharacterId);
  if (canonicalMatch) return canonicalMatch;

  const sourceWorkId = typeof identity?.sourceWorkId === 'string' ? identity.sourceWorkId : undefined;
  const displayName = typeof identity?.displayName === 'string' ? identity.displayName : undefined;
  return findScreenCharacterIdentityMatchForSource(displayName, sourceWorkId);
}

function patchClaimsNonScreenIdentity(patch: ActorPatch): boolean {
  if (patch.actorId.startsWith('npc_seed_') || patch.actorId.startsWith('npc_power_')) return true;
  const base = isRecord(patch.worldpackActorData) ? patch.worldpackActorData : undefined;
  const hk1988 = base && isRecord(base.hk1988) ? base.hk1988 : undefined;
  return Boolean(hk1988 && (isRecord(hk1988.eraSeedIdentity) || isRecord(hk1988.cityPowerIdentity)));
}

function findScreenCharacterIdentityMatchForActorPatch(
  actors: Record<string, Actor>,
  patch: ActorPatch
): ScreenCharacterIdentityMatch | undefined {
  if (patch.actorId === 'player') return undefined;

  const explicitRuntimeMatch = patch.actorId.startsWith('npc_screen_')
    ? findScreenCharacterIdentityMatch(patch.actorId)
    : undefined;
  if (explicitRuntimeMatch) return explicitRuntimeMatch;

  const metadataMatch = screenCharacterMatchFromPatchMetadata(patch);
  if (metadataMatch) return metadataMatch;
  if (patchClaimsNonScreenIdentity(patch)) return undefined;

  const existingActor = actors[patch.actorId];
  if (existingActor) return screenCharacterMatchFromStoredActor(existingActor);
  return undefined;
}

function normalizeScreenCharacterActorPatch(
  actors: Record<string, Actor>,
  patch: ActorPatch
): { patch: ActorPatch; match?: ScreenCharacterIdentityMatch; targetActorId?: string } {
  const match = findScreenCharacterIdentityMatchForActorPatch(actors, patch);
  if (!match) return { patch };

  const targetActorId = findExistingActorIdForScreenCharacterIdentity(actors, match);
  const targetActor = targetActorId ? actors[targetActorId] : undefined;
  const actorId = targetActor?.actorId ?? match.runtimeActorId;
  return {
    patch: {
      ...patch,
      actorId,
      name: targetActor?.name ?? match.displayName,
      englishName: targetActor?.englishName ?? patch.englishName ?? match.englishName,
      aliases: mergeScreenCharacterAliases(targetActor?.aliases, patch.aliases, match),
      worldpackActorData: mergeScreenCharacterWorldpackActorData(patch.worldpackActorData, match)
    },
    match,
    targetActorId: actorId
  };
}

function findExistingActorIdForSeedIdentity(
  actors: Record<string, Actor>,
  match: SeedIdentityMatch
): string | undefined {
  if (actors[match.runtimeActorId]) return match.runtimeActorId;

  return Object.values(actors).find((actor) => actorMatchesSeedIdentity(actor, match))?.actorId;
}

function mergeSeedSafeAliases(
  existing: string[] | undefined,
  incoming: string[] | undefined,
  match: SeedIdentityMatch
): string[] {
  return mergeUnique(existing, [
    ...match.recognitionAliases,
    ...(incoming ?? [])
  ].filter((alias) => alias !== match.displayName && alias !== match.englishName && !isProtectedSeedName(alias, match)));
}

function redactSeedProtectedValues<T>(value: T, match: SeedIdentityMatch): T {
  if (typeof value === 'string') return redactSeedProtectedNames(value, match) as T;
  if (Array.isArray(value)) return value.map((item) => redactSeedProtectedValues(item, match)) as T;
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, redactSeedProtectedValues(entry, match)])
  ) as T;
}

function seedIdentityMetadata(match: SeedIdentityMatch): Record<string, unknown> {
  return {
    canonicalSeedId: match.canonicalSeedId,
    seedFigureId: match.seedFigureId,
    displayName: match.displayName,
    ...(match.englishName ? { englishName: match.englishName } : {})
  };
}

function mergeSeedWorldpackActorData(
  worldpackActorData: ActorPatch['worldpackActorData'] | undefined,
  match: SeedIdentityMatch
): ActorPatch['worldpackActorData'] {
  const base = isRecord(worldpackActorData) ? worldpackActorData : {};
  const hk1988 = isRecord(base.hk1988) ? base.hk1988 : {};
  return {
    ...base,
    hk1988: {
      ...hk1988,
      eraSeedIdentity: seedIdentityMetadata(match)
    }
  };
}

function seedMatchFromPatchMetadata(patch: ActorPatch): SeedIdentityMatch | undefined {
  const base = isRecord(patch.worldpackActorData) ? patch.worldpackActorData : undefined;
  const hk1988 = base && isRecord(base.hk1988) ? base.hk1988 : undefined;
  const identity = hk1988 && isRecord(hk1988.eraSeedIdentity)
    ? hk1988.eraSeedIdentity
    : undefined;
  return findSeedIdentityByCanonicalId(
    typeof identity?.canonicalSeedId === 'string' ? identity.canonicalSeedId : undefined
  );
}

function stableSeedNameMatch(value: string | undefined): SeedIdentityMatch | undefined {
  const match = findSeedIdentityMatch(value);
  return match?.matchedBy === 'displayName' || match?.matchedBy === 'englishName'
    ? match
    : undefined;
}

function recoverUninstantiatedSeedActorIdentity(
  actors: Record<string, Actor>,
  patch: ActorPatch
): SeedIdentityMatch | undefined {
  if (!patch.actorId.startsWith('npc_seed_') || actors[patch.actorId]) return undefined;

  const actorIdMatch = findSeedIdentityByCanonicalId(patch.actorId.slice('npc_seed_'.length));
  const displayNameMatch = stableSeedNameMatch(patch.name);
  const englishNameMatch = stableSeedNameMatch(patch.englishName);
  if (!actorIdMatch || !displayNameMatch || !englishNameMatch) return undefined;
  if (displayNameMatch.canonicalSeedId !== englishNameMatch.canonicalSeedId) return undefined;
  return displayNameMatch.canonicalSeedId === actorIdMatch.canonicalSeedId
    ? undefined
    : displayNameMatch;
}

function findSeedIdentityMatchForActorPatch(
  actors: Record<string, Actor>,
  patch: ActorPatch
): SeedIdentityMatch | undefined {
  if (patch.actorId === 'player') return undefined;
  if (patch.actorId.startsWith('npc_seed_')) {
    return findSeedIdentityByCanonicalId(patch.actorId.slice('npc_seed_'.length));
  }
  const metadataMatch = seedMatchFromPatchMetadata(patch);
  if (metadataMatch) return metadataMatch;
  const existingActor = actors[patch.actorId];
  if (existingActor) return seedMatchFromStoredActor(existingActor);
  return stableSeedNameMatch(patch.name) ?? stableSeedNameMatch(patch.englishName);
}

function normalizeSeedActorPatch(
  actors: Record<string, Actor>,
  patch: ActorPatch
): { patch: ActorPatch; match?: SeedIdentityMatch; targetActorId?: string } {
  const match = findSeedIdentityMatchForActorPatch(actors, patch);
  if (!match) return { patch };

  const targetActorId = findExistingActorIdForSeedIdentity(actors, match);
  const targetActor = targetActorId ? actors[targetActorId] : undefined;
  const redactedPatch = redactSeedProtectedValues(patch, match);
  const actorId = targetActor?.actorId ?? match.runtimeActorId;
  const name = targetActor?.name ?? match.displayName;

  return {
    patch: {
      ...redactedPatch,
      actorId,
      name,
      englishName: targetActor?.englishName ?? redactedPatch.englishName ?? match.englishName,
      callName: isProtectedSeedName(redactedPatch.callName, match)
        ? match.displayName
        : redactedPatch.callName,
      aliases: mergeSeedSafeAliases(targetActor?.aliases, redactedPatch.aliases, match),
      worldpackActorData: mergeSeedWorldpackActorData(redactedPatch.worldpackActorData, match)
    },
    match,
    targetActorId: actorId
  };
}

function actorMatchesCityPowerIdentity(actor: Actor, match: CityPowerIdentityMatch): boolean {
  const stored = cityPowerMatchFromStoredActor(actor);
  if (stored?.canonicalSeedId === match.canonicalSeedId) return true;

  const values = [actor.name, actor.callName, actor.englishName, ...actor.aliases];
  return values.some((value) => findCityPowerIdentityMatch(value)?.canonicalSeedId === match.canonicalSeedId);
}

function findExistingActorIdForCityPowerIdentity(
  actors: Record<string, Actor>,
  match: CityPowerIdentityMatch
): string | undefined {
  if (actors[match.runtimeActorId]) return match.runtimeActorId;

  return Object.values(actors).find((actor) => actorMatchesCityPowerIdentity(actor, match))?.actorId;
}

function isProtectedCityPowerName(value: string | undefined, match: CityPowerIdentityMatch): boolean {
  if (!value) return false;
  return match.protectedRealNames.some((name) => name.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase());
}

function mergeCityPowerSafeAliases(
  existing: string[] | undefined,
  incoming: string[] | undefined,
  match: CityPowerIdentityMatch
): string[] {
  return mergeUnique(existing, [
    ...match.recognitionAliases,
    ...(incoming ?? [])
  ].filter((alias) => alias !== match.displayName && alias !== match.englishName && !isProtectedCityPowerName(alias, match)));
}

function redactCityPowerProtectedValues<T>(value: T, match: CityPowerIdentityMatch): T {
  if (typeof value === 'string') return redactCityPowerProtectedNames(value, match) as T;
  if (Array.isArray(value)) return value.map((item) => redactCityPowerProtectedValues(item, match)) as T;
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, redactCityPowerProtectedValues(entry, match)])
  ) as T;
}

function cityPowerIdentityMetadata(match: CityPowerIdentityMatch): Record<string, unknown> {
  return {
    canonicalSeedId: match.canonicalSeedId,
    displayName: match.displayName,
    ...(match.englishName ? { englishName: match.englishName } : {})
  };
}

function mergeCityPowerWorldpackActorData(
  worldpackActorData: ActorPatch['worldpackActorData'] | undefined,
  match: CityPowerIdentityMatch
): ActorPatch['worldpackActorData'] {
  const base = isRecord(worldpackActorData) ? worldpackActorData : {};
  const hk1988 = isRecord(base.hk1988) ? base.hk1988 : {};
  return {
    ...base,
    hk1988: {
      ...hk1988,
      cityPowerIdentity: cityPowerIdentityMetadata(match)
    }
  };
}

function cityPowerMatchFromPatchMetadata(patch: ActorPatch): CityPowerIdentityMatch | undefined {
  const base = isRecord(patch.worldpackActorData) ? patch.worldpackActorData : undefined;
  const hk1988 = base && isRecord(base.hk1988) ? base.hk1988 : undefined;
  const identity = hk1988 && isRecord(hk1988.cityPowerIdentity)
    ? hk1988.cityPowerIdentity
    : undefined;
  return findCityPowerIdentityByCanonicalId(
    typeof identity?.canonicalSeedId === 'string' ? identity.canonicalSeedId : undefined
  );
}

function stableCityPowerNameMatch(value: string | undefined): CityPowerIdentityMatch | undefined {
  const match = findCityPowerIdentityMatch(value);
  return match?.matchedBy === 'displayName' || match?.matchedBy === 'englishName'
    ? match
    : undefined;
}

function findCityPowerIdentityMatchForActorPatch(
  actors: Record<string, Actor>,
  patch: ActorPatch
): CityPowerIdentityMatch | undefined {
  if (patch.actorId === 'player') return undefined;
  if (patch.actorId.startsWith('npc_power_')) {
    return findCityPowerIdentityByCanonicalId(patch.actorId.slice('npc_power_'.length));
  }
  const metadataMatch = cityPowerMatchFromPatchMetadata(patch);
  if (metadataMatch) return metadataMatch;
  const existingActor = actors[patch.actorId];
  if (existingActor) return cityPowerMatchFromStoredActor(existingActor);
  return stableCityPowerNameMatch(patch.name) ?? stableCityPowerNameMatch(patch.englishName);
}

function normalizeCityPowerActorPatch(
  actors: Record<string, Actor>,
  patch: ActorPatch
): { patch: ActorPatch; match?: CityPowerIdentityMatch; targetActorId?: string } {
  const match = findCityPowerIdentityMatchForActorPatch(actors, patch);
  if (!match) return { patch };

  const targetActorId = findExistingActorIdForCityPowerIdentity(actors, match);
  const targetActor = targetActorId ? actors[targetActorId] : undefined;
  const redactedPatch = redactCityPowerProtectedValues(patch, match);
  const actorId = targetActor?.actorId ?? match.runtimeActorId;
  const name = targetActor?.name ?? match.displayName;

  return {
    patch: {
      ...redactedPatch,
      actorId,
      name,
      englishName: targetActor?.englishName ?? redactedPatch.englishName ?? match.englishName,
      callName: isProtectedCityPowerName(redactedPatch.callName, match) ? match.displayName : redactedPatch.callName,
      aliases: mergeCityPowerSafeAliases(targetActor?.aliases, redactedPatch.aliases, match),
      worldpackActorData: mergeCityPowerWorldpackActorData(redactedPatch.worldpackActorData, match)
    },
    match,
    targetActorId: actorId
  };
}

function hasLocationChanged(from: RuntimeState['location'], to: RuntimeState['location']): boolean {
  return from.currentPlaceId !== to.currentPlaceId || from.currentSceneId !== to.currentSceneId;
}

function applyLatestMapMovement(
  map: RuntimeMapState | undefined,
  from: RuntimeState['location'],
  to: RuntimeState['location'],
  turnId: string,
  startedAt: GameTime,
  arrivedAt: GameTime,
  elapsedMinutes: number
): RuntimeMapState {
  if (!hasLocationChanged(from, to)) {
    return map ?? {};
  }

  return {
    ...(map ?? {}),
    lastMovement: {
      turnId,
      fromPlaceId: from.currentPlaceId,
      ...(from.currentSceneId ? { fromSceneId: from.currentSceneId } : {}),
      toPlaceId: to.currentPlaceId,
      ...(to.currentSceneId ? { toSceneId: to.currentSceneId } : {}),
      startedAt: cloneGameTime(startedAt),
      arrivedAt: cloneGameTime(arrivedAt),
      elapsedMinutes
    }
  };
}

function normalizeLocationScene(
  location: RuntimeState['location'],
  scenes: Record<string, Scene>
): RuntimeState['location'] {
  if (!location.currentSceneId) return location;

  const currentScene = scenes[location.currentSceneId];
  if (!currentScene || currentScene.placeId === location.currentPlaceId) {
    return location;
  }

  const { currentSceneId: _staleSceneId, ...locationWithoutScene } = location;
  return locationWithoutScene;
}

function applyLocationPatch(
  location: RuntimeState['location'],
  patch: LocationPatch | undefined,
  scenes: Record<string, Scene>
): RuntimeState['location'] {
  if (!patch) return location;

  const patchedScene = patch.currentSceneId ? scenes[patch.currentSceneId] : undefined;
  const currentPlaceId = patch.currentPlaceId ?? patchedScene?.placeId ?? location.currentPlaceId;
  const currentSceneId =
    patch.currentSceneId && patchedScene?.placeId === currentPlaceId ? patch.currentSceneId : undefined;

  if (!patch.currentSceneId && currentPlaceId === location.currentPlaceId) {
    return location;
  }

  return {
    currentPlaceId,
    ...(currentSceneId ? { currentSceneId } : {})
  };
}

function normalizeActorScene(actor: Actor, scenes: Record<string, Scene>): Actor {
  if (!actor.currentSceneId || !actor.currentPlaceId) return actor;

  const scene = scenes[actor.currentSceneId];
  if (!scene || scene.placeId === actor.currentPlaceId) return actor;

  const { currentSceneId: _staleSceneId, ...actorWithoutScene } = actor;
  return actorWithoutScene;
}

function setActorScene(actor: Actor, sceneId: string | undefined): Actor {
  if (sceneId) {
    return { ...actor, currentSceneId: sceneId };
  }

  const { currentSceneId: _currentSceneId, ...actorWithoutScene } = actor;
  return actorWithoutScene;
}

function actorHasCurrentLocalAnchor(
  actor: Actor,
  location: RuntimeState['location']
): boolean {
  if (actor.presence !== 'present' && actor.presence !== 'nearby') return false;
  if (
    location.currentSceneId &&
    actor.currentSceneId === location.currentSceneId
  ) {
    return true;
  }
  if (actor.currentPlaceId === location.currentPlaceId) return true;
  return !actor.currentPlaceId && !actor.currentSceneId;
}

function actorPatchHasCurrentLocationAnchor(
  patch: Pick<ActorPatch, 'currentPlaceId' | 'currentSceneId'>,
  location: RuntimeState['location']
): boolean {
  const hasExplicitAnchor =
    patch.currentPlaceId !== undefined || patch.currentSceneId !== undefined;
  if (!hasExplicitAnchor) return false;
  if (
    patch.currentPlaceId !== undefined &&
    patch.currentPlaceId !== location.currentPlaceId
  ) {
    return false;
  }
  if (
    patch.currentSceneId !== undefined &&
    patch.currentSceneId !== location.currentSceneId
  ) {
    return false;
  }
  return true;
}

function normalizeActorsForCurrentLocation(
  actors: Record<string, Actor>,
  scenes: Record<string, Scene>,
  location: RuntimeState['location'],
  playerActorId: string,
  time: GameTime
): Record<string, Actor> {
  const nextActors: Record<string, Actor> = {};

  for (const [actorId, actor] of Object.entries(actors)) {
    let nextActor = normalizeActorScene(actor, scenes);

    if (actorId === playerActorId) {
      nextActor = setActorScene(
        {
          ...nextActor,
          currentPlaceId: location.currentPlaceId,
          presence: 'present',
          lastSeenAt: cloneGameTime(time),
          lastSeenPlaceId: location.currentPlaceId
        },
        location.currentSceneId
      );
      nextActors[actorId] = nextActor;
      continue;
    }

    if (nextActor.presence === 'present') {
      const atCurrentPlace = nextActor.currentPlaceId === location.currentPlaceId;
      const remainsInCurrentScene = location.currentSceneId
        ? nextActor.currentSceneId === location.currentSceneId
        : atCurrentPlace;

      if (!remainsInCurrentScene) {
        nextActor = {
          ...nextActor,
          presence: atCurrentPlace ? 'nearby' : 'mentioned',
          lastSeenAt: cloneGameTime(time),
          lastSeenPlaceId: nextActor.currentPlaceId ?? nextActor.lastSeenPlaceId
        };
      }
    }

    nextActors[actorId] = nextActor;
  }

  return nextActors;
}

function normalizeScenePresentActorIds(
  scenes: Record<string, Scene>,
  actors: Record<string, Actor>,
  location: RuntimeState['location'],
  playerActorId: string
): Record<string, Scene> {
  const nextScenes: Record<string, Scene> = {};

  for (const [sceneId, scene] of Object.entries(scenes)) {
    const presentActorIds = scene.presentActorIds.filter((actorId) => {
      const actor = actors[actorId];
      if (!actor || actor.presence !== 'present') return false;
      if (actorId === playerActorId) return location.currentSceneId === sceneId;
      return actor.currentSceneId === sceneId;
    });

    nextScenes[sceneId] = {
      ...scene,
      presentActorIds
    };
  }

  for (const actor of Object.values(actors)) {
    if (actor.presence !== 'present' || !actor.currentSceneId) continue;
    const scene = nextScenes[actor.currentSceneId];
    if (!scene) continue;
    nextScenes[actor.currentSceneId] = {
      ...scene,
      presentActorIds: mergeUnique(scene.presentActorIds, [actor.actorId])
    };
  }

  if (location.currentSceneId && nextScenes[location.currentSceneId]) {
    nextScenes[location.currentSceneId] = {
      ...nextScenes[location.currentSceneId],
      presentActorIds: mergeUnique(nextScenes[location.currentSceneId].presentActorIds, [playerActorId])
    };
  }

  return nextScenes;
}

function chooseSceneForPlace(
  scenes: Record<string, Scene>,
  placeId: string,
  preferredSceneIds: string[] = []
): string | undefined {
  for (const sceneId of [...preferredSceneIds].reverse()) {
    if (scenes[sceneId]?.placeId === placeId) return sceneId;
  }

  return Object.values(scenes).find((scene) => scene.placeId === placeId)?.sceneId;
}

function isSpecificRuntimePlace(place: Place | undefined, wasPatchedThisTurn: boolean): boolean {
  if (!place) return false;
  return wasPatchedThisTurn || place.source === 'runtime_generated' || place.canonical === false;
}

function isMatterUsableForPlayerLocation(matter: CurrentMatter, playerActorId: string): boolean {
  return (
    matter.status === 'active' &&
    matter.visibility === 'known' &&
    matter.relatedActorIds.includes(playerActorId) &&
    matter.relatedPlaceIds.length > 0
  );
}

function inferLocationFromCurrentMatters(
  currentLocation: RuntimeState['location'],
  dynamicEvents: DynamicEventsState,
  places: Record<string, Place>,
  scenes: Record<string, Scene>,
  updatedMatterIds: string[],
  patchedPlaceIds: Set<string>,
  patchedSceneIds: string[],
  playerActorId: string
): RuntimeState['location'] | undefined {
  for (const sceneId of [...patchedSceneIds].reverse()) {
    const scene = scenes[sceneId];
    if (scene?.presentActorIds.includes(playerActorId) && scene.placeId !== currentLocation.currentPlaceId) {
      return { currentPlaceId: scene.placeId, currentSceneId: scene.sceneId };
    }
  }

  for (const matterId of [...updatedMatterIds].reverse()) {
    const matter = dynamicEvents.currentMatters[matterId];
    if (!matter || !isMatterUsableForPlayerLocation(matter, playerActorId)) continue;

    const candidatePlaceId = [...matter.relatedPlaceIds].reverse().find(
      (placeId) =>
        placeId !== currentLocation.currentPlaceId &&
        isSpecificRuntimePlace(places[placeId], patchedPlaceIds.has(placeId))
    );
    if (!candidatePlaceId) continue;

    const sceneId = chooseSceneForPlace(scenes, candidatePlaceId, patchedSceneIds);
    return {
      currentPlaceId: candidatePlaceId,
      ...(sceneId ? { currentSceneId: sceneId } : {})
    };
  }

  return undefined;
}

function promoteCurrentMatterActorsAtLocation(
  actors: Record<string, Actor>,
  dynamicEvents: DynamicEventsState,
  updatedMatterIds: string[],
  location: RuntimeState['location'],
  playerActorId: string,
  time: GameTime
): Record<string, Actor> {
  const nextActors = { ...actors };

  for (const matterId of updatedMatterIds) {
    const matter = dynamicEvents.currentMatters[matterId];
    if (!matter || !isMatterUsableForPlayerLocation(matter, playerActorId)) continue;
    if (!matter.relatedPlaceIds.includes(location.currentPlaceId)) continue;

    for (const actorId of matter.relatedActorIds) {
      if (actorId === playerActorId) continue;
      const actor = nextActors[actorId];
      if (!actor) continue;
      if (actor.currentPlaceId && actor.currentPlaceId !== location.currentPlaceId) continue;

      nextActors[actorId] = setActorScene(
        {
          ...actor,
          currentPlaceId: location.currentPlaceId,
          presence: 'present',
          lastSeenAt: cloneGameTime(time),
          lastSeenPlaceId: location.currentPlaceId
        },
        location.currentSceneId
      );
    }
  }

  return nextActors;
}

function currentMatterCaseId(matterId: string): string {
  return `case_${matterId}`;
}

function isFormalPoliceMatter(matter: CurrentMatter): boolean {
  return matter.matterKind === 'case';
}

function syncPoliceCurrentMattersToCases(
  cases: Record<string, CaseFile>,
  dynamicEvents: DynamicEventsState,
  updatedMatterIds: string[],
  player: RuntimeState['player'],
  turnId: string,
  time: GameTime
): { cases: Record<string, CaseFile>; dynamicEvents: DynamicEventsState } {
  if (player.currentIdentity !== 'police') return { cases, dynamicEvents };

  let nextCases = cases;
  let nextDynamicEvents = dynamicEvents;

  for (const matterId of updatedMatterIds) {
    const matter = nextDynamicEvents.currentMatters[matterId];
    if (!matter || matter.status !== 'active' || matter.visibility !== 'known') continue;
    if (!matter.relatedActorIds.includes(player.actorId)) continue;
    if (!isFormalPoliceMatter(matter)) continue;

    const caseId = matter.relatedCaseIds.find((relatedCaseId) => nextCases[relatedCaseId]) ?? currentMatterCaseId(matter.id);
    if (!nextCases[caseId]) {
      nextCases = {
        ...nextCases,
        [caseId]: applyCasePatch(
          undefined,
          {
            caseId,
            title: matter.title,
            caseType: matter.matterKind === 'case' ? 'case' : 'police_action',
            status: 'intake',
            playerRole: 'execute',
            leadActorId: player.actorId,
            summary: matter.summary,
            currentFocus: matter.currentHook ?? '按程序记录现场、确认涉事人身份，并决定是否升级为正式案件。',
            playerVisibleProgress: matter.summary,
            internalProgressSummary: matter.consequenceHint ?? matter.summary,
            relatedActorIds: matter.relatedActorIds,
            relatedPlaceIds: matter.relatedPlaceIds,
            relatedOrganizationIds: matter.relatedOrganizationIds,
            activityLog: [
              {
                kind: 'created',
                summary: matter.summary,
                actorId: player.actorId,
                relatedEvidenceIds: [],
                relatedActorIds: matter.relatedActorIds,
                relatedPlaceIds: matter.relatedPlaceIds,
                visibleToPlayer: true
              }
            ]
          },
          turnId,
          time
        )
      };
    }

    const linkedCaseIds = mergeUnique(matter.relatedCaseIds, [caseId]);
    if (linkedCaseIds.length !== matter.relatedCaseIds.length) {
      nextDynamicEvents = {
        ...nextDynamicEvents,
        currentMatters: {
          ...nextDynamicEvents.currentMatters,
          [matter.id]: {
            ...matter,
            relatedCaseIds: linkedCaseIds,
            updatedAt: cloneGameTime(time)
          }
        }
      };
    }
  }

  return { cases: nextCases, dynamicEvents: nextDynamicEvents };
}

function evidenceTypeFromAsset(item: AssetItem): CaseEvidenceType {
  return item.category === 'document' ? 'document' : 'physical';
}

function assetEvidenceId(itemId: string): string {
  return `evidence_asset_${itemId}`;
}

function syncAssetEvidenceLinksToCases(
  assets: RuntimeAssetsState,
  cases: Record<string, CaseFile>,
  caseEvidence: Record<string, CaseEvidence>,
  time: GameTime
): { cases: Record<string, CaseFile>; caseEvidence: Record<string, CaseEvidence> } {
  const nextCases = { ...cases };
  const nextCaseEvidence = { ...caseEvidence };

  for (const item of Object.values(assets.items)) {
    if (!item.evidence) continue;

    const targetCase = nextCases[item.evidence.caseId];
    if (!targetCase) continue;

    const evidenceId = assetEvidenceId(item.itemId);
    const existing = nextCaseEvidence[evidenceId];
    if (existing && existing.caseId !== item.evidence.caseId && nextCases[existing.caseId]) {
      nextCases[existing.caseId] = {
        ...nextCases[existing.caseId],
        evidenceIds: nextCases[existing.caseId].evidenceIds.filter((id) => id !== evidenceId),
        updatedAt: cloneGameTime(time)
      };
    }

    nextCaseEvidence[evidenceId] = {
      evidenceId,
      caseId: item.evidence.caseId,
      title: item.name,
      evidenceType: evidenceTypeFromAsset(item),
      sourceSummary: `物品与资产：${item.name}`,
      summary: item.evidence.summary,
      submittedByActorId: existing?.submittedByActorId,
      submittedAt: existing?.submittedAt ? cloneGameTime(existing.submittedAt) : undefined,
      relatedActorIds: mergeUnique(existing?.relatedActorIds, item.relatedActorIds),
      relatedPlaceIds: mergeUnique(existing?.relatedPlaceIds, item.relatedPlaceIds),
      relatedAssetItemId: item.itemId,
      disputeSummary: item.evidence.disputeSummary ?? existing?.disputeSummary,
      visibility: item.visibility,
      createdAt: cloneGameTime(existing?.createdAt ?? item.acquiredAt ?? time),
      updatedAt: cloneGameTime(time)
    };

    if (!targetCase.evidenceIds.includes(evidenceId)) {
      nextCases[item.evidence.caseId] = {
        ...targetCase,
        evidenceIds: [...targetCase.evidenceIds, evidenceId],
        updatedAt: cloneGameTime(time)
      };
    }
  }

  return { cases: nextCases, caseEvidence: nextCaseEvidence };
}

function nextReputationLogId(logs: PlayerReputationLogEntry[]): string {
  let index = logs.length + 1;
  let logId = `reputation_log_${String(index).padStart(4, '0')}`;
  while (logs.some((log) => log.logId === logId)) {
    index += 1;
    logId = `reputation_log_${String(index).padStart(4, '0')}`;
  }
  return logId;
}

function appendReputationLog(
  reputation: PlayerReputationState,
  entry: Omit<PlayerReputationLogEntry, 'logId'>
): PlayerReputationState {
  return {
    ...reputation,
    logs: [
      ...reputation.logs,
      {
        ...entry,
        logId: nextReputationLogId(reputation.logs),
        gameTime: cloneGameTime(entry.gameTime)
      }
    ]
  };
}

function applySingleCircleReputationPatch(
  reputation: PlayerReputationState,
  patch: ReputationPatch,
  time: GameTime,
  turnId: string
): PlayerReputationState {
  if (!hasReputationAuditFields(patch)) return reputation;

  const existing = reputation.circles[patch.circle];
  const nextVisibility =
    patch.visibilitySet ?? (patch.visibilityDelta === undefined ? existing.visibility : existing.visibility + patch.visibilityDelta);
  const nextStanding =
    patch.standingSet ?? (patch.standingDelta === undefined ? existing.standing : existing.standing + patch.standingDelta);
  const nextEntry = {
    visibility: clampReputationVisibility(nextVisibility),
    standing: clampReputationScore(nextStanding),
    summary: patch.summary ?? existing.summary
  };
  let nextReputation: PlayerReputationState = {
    ...reputation,
    circles: {
      ...reputation.circles,
      [patch.circle]: nextEntry
    }
  };
  const visibilityDelta = nextEntry.visibility - existing.visibility;
  const standingDelta = nextEntry.standing - existing.standing;
  if (visibilityDelta !== 0 || standingDelta !== 0 || patch.summary || patch.reason) {
    nextReputation = appendReputationLog(nextReputation, {
      gameTime: time,
      turnId,
      kind: 'circle',
      circle: patch.circle,
      visibilityDelta,
      standingDelta,
      summary: patch.summary ?? nextEntry.summary,
      reason: patch.reason ?? ''
    });
  }
  return nextReputation;
}

function applyReputationPatch(
  reputation: PlayerReputationState,
  patch: NonNullable<PlayerPatch['reputation']> | undefined,
  legacyPatches: ReputationPatch[],
  time: GameTime,
  turnId: string
): PlayerReputationState {
  const overallReputationBaseline = resolveOverallReputationBaseline(reputation);
  let nextReputation: PlayerReputationState = {
    ...reputation,
    overallReputationBaseline
  };
  let overviewSummary = nextReputation.summary;
  let overviewReason = '';
  let notorietyDelta = 0;

  if (patch) {
    if (hasReputationOverviewMutation(patch) && hasReputationAuditFields(patch)) {
      const nextNotoriety =
        patch.notorietySet ??
        (patch.notorietyDelta === undefined ? nextReputation.notoriety : nextReputation.notoriety + patch.notorietyDelta);
      const normalizedNotoriety = clampReputationVisibility(nextNotoriety);
      notorietyDelta = normalizedNotoriety - nextReputation.notoriety;
      overviewSummary = patch.summary ?? nextReputation.summary;
      overviewReason = patch.reason ?? '';

      nextReputation = {
        ...nextReputation,
        notoriety: normalizedNotoriety,
        summary: overviewSummary
      };
    }

    for (const circlePatch of patch.circlePatches) {
      nextReputation = applySingleCircleReputationPatch(nextReputation, circlePatch, time, turnId);
    }
  }

  for (const legacyPatch of legacyPatches) {
    nextReputation = applySingleCircleReputationPatch(nextReputation, legacyPatch, time, turnId);
  }

  const derivedOverallReputation = deriveOverallReputationFromCircles(
    nextReputation.circles,
    overallReputationBaseline
  );
  const overallReputationDelta = derivedOverallReputation - reputation.overallReputation;
  nextReputation = {
    ...nextReputation,
    overallReputation: derivedOverallReputation,
    overallReputationBaseline
  };

  if (notorietyDelta !== 0 || overallReputationDelta !== 0) {
    nextReputation = appendReputationLog(nextReputation, {
      gameTime: time,
      turnId,
      kind: 'overall',
      notorietyDelta,
      overallReputationDelta,
      summary: overviewSummary,
      reason: overviewReason || '根据已确认的圈层知名度与评价在本地重新综合。'
    });
  }

  return nextReputation;
}

function applyPlayerPatch(
  player: RuntimeState['player'],
  playerActor: Actor | undefined,
  patch: PlayerPatch,
  time: GameTime,
  turnId: string
): { player: RuntimeState['player']; playerActor?: Actor } {
  let nextPlayer = player;
  let nextPlayerActor = playerActor;

  if (patch.economy) {
    const monthlyPressure =
      patch.economy.monthlyPressureSet ??
      (patch.economy.monthlyPressureDelta === undefined
        ? nextPlayer.economy.monthlyPressure
        : nextPlayer.economy.monthlyPressure + patch.economy.monthlyPressureDelta);

    nextPlayer = {
      ...nextPlayer,
      economy: {
        ...nextPlayer.economy,
        monthlyPressure: clamp(monthlyPressure, 0, 100),
        financeSummary: patch.economy.financeSummary ?? nextPlayer.economy.financeSummary
      }
    };
  }

  if (patch.homeBase) {
    nextPlayer = {
      ...nextPlayer,
      homeBase: {
        ...nextPlayer.homeBase,
        ...patch.homeBase
      }
    };
  }

  if (patch.clothing !== undefined) {
    const clothing = applyPlayerClothingPatch(nextPlayer.clothingState, patch.clothing, time);
    nextPlayer = {
      ...nextPlayer,
      clothing: clothing.clothing,
      clothingState: clothing.clothingState
    };
    if (nextPlayerActor) {
      nextPlayerActor = {
        ...nextPlayerActor,
        clothing: clothing.clothing
      };
    }
  }

  if (patch.equipment !== undefined) {
    nextPlayer = {
      ...nextPlayer,
      equipment: [...patch.equipment]
    };
    if (nextPlayerActor) {
      nextPlayerActor = {
        ...nextPlayerActor,
        equipment: [...patch.equipment]
      };
    }
  }

  if (patch.reputation || patch.reputationPatches.length > 0) {
    nextPlayer = {
      ...nextPlayer,
      reputation: applyReputationPatch(nextPlayer.reputation, patch.reputation, patch.reputationPatches, time, turnId)
    };
  }

  return { player: nextPlayer, playerActor: nextPlayerActor };
}

function applyPlacePatch(existing: Place | undefined, patch: PlacePatch): Place {
  return {
    placeId: patch.placeId,
    name: patch.name ?? existing?.name ?? patch.placeId,
    nameZh: patch.nameZh ?? existing?.nameZh,
    nameEn: patch.nameEn ?? existing?.nameEn,
    aliases: mergeUnique(existing?.aliases, patch.aliases),
    regionId: patch.regionId ?? existing?.regionId ?? 'region_unknown',
    districtId: patch.districtId ?? existing?.districtId,
    type: patch.type ?? existing?.type ?? 'generated_place',
    category: patch.category ?? existing?.category,
    summary: patch.summary ?? existing?.summary ?? '由剧情写回生成的地点，详细状态待后续剧情确认。',
    publicKnowledge: patch.publicKnowledge ?? existing?.publicKnowledge ?? '公开信息尚少。',
    currentState: patch.currentState ?? existing?.currentState ?? '状态待后续剧情确认。',
    streetAddressText: patch.streetAddressText ?? existing?.streetAddressText,
    roadAnchors: mergeUnique(existing?.roadAnchors, patch.roadAnchors),
    playerKnownSummary: patch.playerKnownSummary ?? existing?.playerKnownSummary,
    canonical: patch.canonical ?? existing?.canonical ?? false,
    source: patch.source ?? existing?.source ?? 'runtime_generated',
    confidence: patch.confidence ?? existing?.confidence ?? 'medium',
    historicalNote: patch.historicalNote ?? existing?.historicalNote,
    researchNote: patch.researchNote ?? existing?.researchNote,
    owningOrganizationId: patch.owningOrganizationId ?? existing?.owningOrganizationId,
    relatedActorIds: mergeUnique(existing?.relatedActorIds, patch.relatedActorIds),
    relatedCaseIds: mergeUnique(existing?.relatedCaseIds, patch.relatedCaseIds),
    relatedPressureIds: mergeUnique(existing?.relatedPressureIds, patch.relatedPressureIds),
    visualAnchor: patch.visualAnchor ?? existing?.visualAnchor
  };
}

function applyScenePatch(existing: Scene | undefined, patch: ScenePatch): Scene {
  return {
    sceneId: patch.sceneId,
    placeId: patch.placeId,
    name: patch.name ?? existing?.name ?? patch.sceneId,
    summary: patch.summary ?? existing?.summary ?? '由剧情写回生成的场景。',
    temporaryState: patch.temporaryState ?? existing?.temporaryState ?? '临时状态待后续剧情确认。',
    presentActorIds: patch.presentActorIds ?? existing?.presentActorIds ?? []
  };
}

export function applyCaseEvidencePatch(existing: CaseEvidence | undefined, patch: CaseEvidencePatch, time: GameTime): CaseEvidence {
  const createdAt = patch.createdAt ?? existing?.createdAt ?? time;
  const updatedAt = patch.updatedAt ?? time;
  return {
    evidenceId: patch.evidenceId,
    caseId: patch.caseId,
    title: patch.title ?? existing?.title ?? patch.evidenceId,
    evidenceType: patch.evidenceType ?? existing?.evidenceType ?? 'other',
    sourceSummary: patch.sourceSummary ?? existing?.sourceSummary ?? '',
    summary: patch.summary ?? existing?.summary ?? '',
    submittedByActorId: patch.submittedByActorId ?? existing?.submittedByActorId,
    submittedAt: patch.submittedAt ?? existing?.submittedAt,
    relatedActorIds: mergeUnique(existing?.relatedActorIds, patch.relatedActorIds),
    relatedPlaceIds: mergeUnique(existing?.relatedPlaceIds, patch.relatedPlaceIds),
    relatedAssetItemId: patch.relatedAssetItemId ?? existing?.relatedAssetItemId,
    disputeSummary: patch.disputeSummary ?? existing?.disputeSummary,
    visibility: patch.visibility ?? existing?.visibility ?? 'player_known',
    createdAt: cloneGameTime(createdAt),
    updatedAt: cloneGameTime(updatedAt)
  };
}

export function applyDeferredEventPatch(
  existing: DeferredEvent | undefined,
  patch: DeferredEventPatch,
  time: GameTime
): DeferredEvent | undefined {
  const sourceModule = patch.sourceModule ?? existing?.sourceModule;
  const title = patch.title ?? existing?.title;
  const triggerAt = patch.triggerAt ?? existing?.triggerAt;
  const promptInstruction = patch.promptInstruction ?? existing?.promptInstruction;
  const status = patch.status ?? existing?.status ?? 'pending';

  if (!sourceModule || !title || !triggerAt || !promptInstruction) {
    return existing;
  }

  return {
    eventId: patch.eventId,
    sourceModule,
    relatedIds: {
      ...existing?.relatedIds,
      ...patch.relatedIds
    },
    title,
    summary: patch.summary ?? existing?.summary ?? title,
    triggerAt: cloneGameTime(triggerAt),
    visibility: patch.visibility ?? existing?.visibility ?? 'hidden',
    promptInstruction,
    status,
    createdAt: cloneGameTime(patch.createdAt ?? existing?.createdAt ?? time),
    resolvedAt: patch.resolvedAt
      ? cloneGameTime(patch.resolvedAt)
      : existing?.resolvedAt ?? (status === 'resolved' || status === 'cancelled' ? cloneGameTime(time) : undefined)
  };
}

export function applyCasePatch(existing: CaseFile | undefined, patch: CasePatch, turnId: string, time: GameTime): CaseFile {
  const newActivities = (patch.activityLog ?? []).map((activity, index) => ({
    activityId: activity.activityId ?? `${patch.caseId}_activity_${turnId}_${index + 1}`,
    kind: activity.kind,
    gameTime: cloneGameTime(activity.gameTime ?? time),
    summary: activity.summary,
    actorId: activity.actorId,
    relatedEvidenceIds: activity.relatedEvidenceIds,
    relatedActorIds: activity.relatedActorIds,
    relatedPlaceIds: activity.relatedPlaceIds,
    visibleToPlayer: activity.visibleToPlayer
  }));
  const activityLog = [...(existing?.activityLog ?? []), ...newActivities];
  const visibleNewActivityCount = newActivities.filter((activity) => activity.visibleToPlayer).length;
  const updatedAt = patch.updatedAt ?? time;
  const legacyActorIds = patch.involvedActorIds ?? [];
  const playerVisibleProgress = patch.playerVisibleProgress ?? patch.playerKnownSummary ?? existing?.playerVisibleProgress ?? '';
  const internalProgressSummary =
    patch.internalProgressSummary ??
    patch.officialRecordSummary ??
    patch.publicNarrativeSummary ??
    patch.conflictSummary ??
    existing?.internalProgressSummary ??
    '';
  const requestedStatus = patch.status ?? existing?.status ?? 'investigating';
  const status = existing?.status === 'archived' ? 'archived' : requestedStatus;

  return {
    caseId: patch.caseId,
    title: patch.title ?? existing?.title ?? patch.caseId,
    caseType: patch.caseType ?? patch.type ?? existing?.caseType ?? 'general_case',
    status,
    playerRole: patch.playerRole ?? existing?.playerRole ?? 'aware',
    leadActorId: patch.leadActorId ?? existing?.leadActorId,
    leadActorName: patch.leadActorName ?? existing?.leadActorName,
    summary: patch.summary ?? existing?.summary ?? '',
    currentFocus: patch.currentFocus ?? existing?.currentFocus ?? '',
    playerVisibleProgress,
    internalProgressSummary,
    relatedActorIds: mergeUnique(mergeUnique(existing?.relatedActorIds, patch.relatedActorIds), legacyActorIds),
    relatedPlaceIds: mergeUnique(existing?.relatedPlaceIds, patch.relatedPlaceIds),
    relatedOrganizationIds: mergeUnique(existing?.relatedOrganizationIds, patch.relatedOrganizationIds),
    evidenceIds: mergeUnique(existing?.evidenceIds, patch.evidenceIds),
    activityLog,
    unreadActivityCount: patch.unreadActivityCount ?? (existing?.unreadActivityCount ?? 0) + visibleNewActivityCount,
    lastActivityAt: patch.lastActivityAt ?? newActivities.at(-1)?.gameTime ?? existing?.lastActivityAt,
    lastSeenActivityAt: patch.lastSeenActivityAt ?? existing?.lastSeenActivityAt,
    visibility: patch.visibility ?? existing?.visibility ?? 'player_known',
    createdAt: cloneGameTime(patch.createdAt ?? existing?.createdAt ?? time),
    updatedAt: cloneGameTime(updatedAt),
    archivedAt: status === 'archived'
      ? cloneGameTime(patch.archivedAt ?? existing?.archivedAt ?? time)
      : undefined
  };
}


function applyOrganizationPatch(existing: Organization | undefined, patch: OrganizationPatch): Organization {
  const nextVisibility = patch.visibility ?? existing?.visibility ?? 'player_known';
  const previousNameAlias =
    existing && patch.name && existing.name !== patch.name ? [existing.name] : undefined;
  return {
    organizationId: patch.organizationId,
    name: patch.name ?? existing?.name ?? patch.organizationId,
    aliases: mergeUnique(existing?.aliases, mergeUnique(previousNameAlias, patch.aliases)),
    type: patch.type ?? existing?.type ?? 'generated_organization',
    summary: patch.summary ?? existing?.summary ?? '由剧情写回生成的组织。',
    publicKnowledge: patch.publicKnowledge ?? existing?.publicKnowledge ?? '公开信息尚少。',
    currentState: patch.currentState ?? existing?.currentState ?? '状态待后续剧情确认。',
    stanceTowardPlayer: patch.stanceTowardPlayer ?? existing?.stanceTowardPlayer ?? '暂未形成明确关系。',
    pressureSummary: patch.pressureSummary ?? existing?.pressureSummary ?? '暂未形成明确压力。',
    structureTree: patch.structureTree ?? existing?.structureTree,
    triadProfile: existing?.triadProfile,
    triadState:
      nextVisibility === 'hidden'
        ? existing?.triadState
        : applyTriadOrganizationStatePatch(existing?.triadState, patch.triadState),
    relatedActorIds: mergeUnique(existing?.relatedActorIds, patch.relatedActorIds),
    relatedPlaceIds: mergeUnique(existing?.relatedPlaceIds, patch.relatedPlaceIds),
    relatedCaseIds: mergeUnique(existing?.relatedCaseIds, patch.relatedCaseIds),
    visibility: nextVisibility,
    importance: patch.importance ?? existing?.importance ?? 50
  };
}

function cloneDynamicEventsState(dynamicEvents: DynamicEventsState | undefined): DynamicEventsState {
  return {
    currentMatters: Object.fromEntries(
      Object.entries(dynamicEvents?.currentMatters ?? {}).map(([id, matter]) => [
        id,
        {
          ...matter,
          relatedActorIds: [...matter.relatedActorIds],
          relatedPlaceIds: [...matter.relatedPlaceIds],
          relatedCaseIds: [...matter.relatedCaseIds],
          relatedOrganizationIds: [...matter.relatedOrganizationIds],
          createdAt: cloneGameTime(matter.createdAt),
          updatedAt: cloneGameTime(matter.updatedAt),
          ...(matter.lastSeenAt ? { lastSeenAt: cloneGameTime(matter.lastSeenAt) } : {})
        }
      ])
    ),
    signals: Object.fromEntries(
      Object.entries(dynamicEvents?.signals ?? {}).map(([id, signal]) => [
        id,
        {
          ...signal,
          relatedActorIds: [...signal.relatedActorIds],
          relatedPlaceIds: [...signal.relatedPlaceIds],
          relatedCaseIds: [...signal.relatedCaseIds],
          relatedOrganizationIds: [...signal.relatedOrganizationIds],
          createdAt: cloneGameTime(signal.createdAt),
          updatedAt: cloneGameTime(signal.updatedAt)
        }
      ])
    ),
    newsIssues: Object.fromEntries(
      Object.entries(dynamicEvents?.newsIssues ?? {}).map(([id, issue]) => [
        id,
        {
          ...issue,
          date: cloneGameTime(issue.date),
          createdAt: cloneGameTime(issue.createdAt),
          updatedAt: cloneGameTime(issue.updatedAt),
          ...(issue.archivedAt ? { archivedAt: cloneGameTime(issue.archivedAt) } : {}),
          articles: issue.articles.map((article) => ({
            ...article,
            relatedActorIds: [...article.relatedActorIds],
            relatedPlaceIds: [...article.relatedPlaceIds],
            relatedCaseIds: [...article.relatedCaseIds],
            relatedOrganizationIds: [...article.relatedOrganizationIds]
          }))
        }
      ])
    )
  };
}

export function applyCurrentMatterPatch(existing: CurrentMatter | undefined, patch: CurrentMatterPatch, time: GameTime): CurrentMatter {
  return {
    id: patch.id,
    title: patch.title ?? existing?.title ?? patch.id,
    summary: patch.summary ?? existing?.summary ?? patch.title ?? patch.id,
    status: patch.status ?? existing?.status ?? 'active',
    priority: patch.priority ?? existing?.priority ?? 50,
    visibility: patch.visibility ?? existing?.visibility ?? 'known',
    source: patch.source ?? existing?.source ?? 'writeback',
    matterKind: patch.matterKind ?? existing?.matterKind,
    pressureLevel: patch.pressureLevel ?? existing?.pressureLevel,
    responseWindow: patch.responseWindow ?? existing?.responseWindow,
    consequenceHint: patch.consequenceHint ?? existing?.consequenceHint,
    ...(patch.dueAt || existing?.dueAt ? { dueAt: cloneGameTime(patch.dueAt ?? existing!.dueAt!) } : {}),
    currentHook: patch.currentHook ?? existing?.currentHook,
    unread: patch.unread ?? existing?.unread,
    relatedActorIds: mergeUnique(existing?.relatedActorIds, patch.relatedActorIds),
    relatedPlaceIds: mergeUnique(existing?.relatedPlaceIds, patch.relatedPlaceIds),
    relatedCaseIds: mergeUnique(existing?.relatedCaseIds, patch.relatedCaseIds),
    relatedOrganizationIds: mergeUnique(existing?.relatedOrganizationIds, patch.relatedOrganizationIds),
    createdAt: cloneGameTime(patch.createdAt ?? existing?.createdAt ?? time),
    updatedAt: cloneGameTime(patch.updatedAt ?? time),
    ...(patch.lastSeenAt || existing?.lastSeenAt ? { lastSeenAt: cloneGameTime(patch.lastSeenAt ?? existing!.lastSeenAt!) } : {})
  };
}

export function applySignalPatch(existing: Signal | undefined, patch: SignalPatch, time: GameTime): Signal {
  return {
    id: patch.id,
    title: patch.title ?? existing?.title ?? patch.id,
    summary: patch.summary ?? existing?.summary ?? patch.title ?? patch.id,
    signalType: patch.signalType ?? existing?.signalType ?? 'other',
    reliability: patch.reliability ?? existing?.reliability ?? 'unknown',
    status: patch.status ?? existing?.status ?? 'active',
    visibility: patch.visibility ?? existing?.visibility ?? 'known',
    relatedActorIds: mergeUnique(existing?.relatedActorIds, patch.relatedActorIds),
    relatedPlaceIds: mergeUnique(existing?.relatedPlaceIds, patch.relatedPlaceIds),
    relatedCaseIds: mergeUnique(existing?.relatedCaseIds, patch.relatedCaseIds),
    relatedOrganizationIds: mergeUnique(existing?.relatedOrganizationIds, patch.relatedOrganizationIds),
    createdAt: cloneGameTime(patch.createdAt ?? existing?.createdAt ?? time),
    updatedAt: cloneGameTime(patch.updatedAt ?? time)
  };
}

function mergeNewsArticles(existing: NewsArticle[] | undefined, incoming: NewsIssuePatch['articles'] | undefined): NewsArticle[] {
  const articlesById = new Map((existing ?? []).map((article) => [article.id, article]));
  for (const article of incoming ?? []) {
    const previous = articlesById.get(article.id);
    articlesById.set(article.id, {
      ...previous,
      ...article,
      relatedActorIds: mergeUnique(previous?.relatedActorIds, article.relatedActorIds),
      relatedPlaceIds: mergeUnique(previous?.relatedPlaceIds, article.relatedPlaceIds),
      relatedCaseIds: mergeUnique(previous?.relatedCaseIds, article.relatedCaseIds),
      relatedOrganizationIds: mergeUnique(previous?.relatedOrganizationIds, article.relatedOrganizationIds)
    });
  }
  return Array.from(articlesById.values());
}

export function applyNewsIssuePatch(existing: NewsIssue | undefined, patch: NewsIssuePatch, time: GameTime): NewsIssue {
  return {
    id: patch.id,
    date: cloneGameTime(patch.date ?? existing?.date ?? time),
    outletName: patch.outletName ?? existing?.outletName ?? '本地报章',
    headline: patch.headline ?? existing?.headline ?? patch.id,
    summary: patch.summary ?? existing?.summary ?? patch.headline ?? patch.id,
    articles: mergeNewsArticles(existing?.articles, patch.articles),
    createdAt: cloneGameTime(patch.createdAt ?? existing?.createdAt ?? time),
    updatedAt: cloneGameTime(patch.updatedAt ?? time),
    read: patch.read ?? existing?.read ?? false,
    important: existing?.important ?? false,
    archivedAt: existing?.archivedAt ? cloneGameTime(existing.archivedAt) : undefined
  };
}

function canCreateCurrentMatter(patch: CurrentMatterPatch): boolean {
  return hasText(patch.title) && hasText(patch.summary);
}

function canCreateSignal(patch: SignalPatch): boolean {
  return hasText(patch.title) && hasText(patch.summary);
}

function canCreateNewsIssue(patch: NewsIssuePatch): boolean {
  return hasText(patch.outletName) && hasText(patch.headline) && hasText(patch.summary);
}

function cloneAssetBase(item: AssetItem): AssetItem {
  if (item.category === 'fixedAsset') {
    return {
      ...item,
      acquiredAt: item.acquiredAt ? cloneGameTime(item.acquiredAt) : undefined,
      relatedActorIds: [...(item.relatedActorIds ?? [])],
      relatedCaseIds: [...(item.relatedCaseIds ?? [])],
      relatedPlaceIds: [...(item.relatedPlaceIds ?? [])],
      evidence: item.evidence ? { ...item.evidence } : undefined,
      wearable: item.wearable ? { ...item.wearable } : undefined,
      worldpackAssetData: { ...(item.worldpackAssetData ?? {}) },
      incomeSettlementItemIds: [...(item.incomeSettlementItemIds ?? [])],
      expenseSettlementItemIds: [...(item.expenseSettlementItemIds ?? [])]
    };
  }

  if (item.category === 'vehicle') {
    return {
      ...item,
      acquiredAt: item.acquiredAt ? cloneGameTime(item.acquiredAt) : undefined,
      relatedActorIds: [...(item.relatedActorIds ?? [])],
      relatedCaseIds: [...(item.relatedCaseIds ?? [])],
      relatedPlaceIds: [...(item.relatedPlaceIds ?? [])],
      evidence: item.evidence ? { ...item.evidence } : undefined,
      wearable: item.wearable ? { ...item.wearable } : undefined,
      worldpackAssetData: { ...(item.worldpackAssetData ?? {}) },
      mobilityProfile: item.mobilityProfile ? { ...item.mobilityProfile } : undefined,
      incomeSettlementItemIds: [...(item.incomeSettlementItemIds ?? [])],
      expenseSettlementItemIds: [...(item.expenseSettlementItemIds ?? [])]
    };
  }

  return {
    ...item,
    acquiredAt: item.acquiredAt ? cloneGameTime(item.acquiredAt) : undefined,
    relatedActorIds: [...(item.relatedActorIds ?? [])],
    relatedCaseIds: [...(item.relatedCaseIds ?? [])],
    relatedPlaceIds: [...(item.relatedPlaceIds ?? [])],
    evidence: item.evidence ? { ...item.evidence } : undefined,
    wearable: item.wearable ? { ...item.wearable } : undefined,
    worldpackAssetData: { ...(item.worldpackAssetData ?? {}) }
  };
}

function cloneAssetsState(assets: RuntimeAssetsState | undefined): RuntimeAssetsState {
  const clonedItems = Object.fromEntries(
    Object.entries(assets?.items ?? {}).map(([itemId, item]) => [itemId, cloneAssetBase(item)])
  ) as RuntimeAssetsState['items'];
  return {
    items: clonedItems,
    equippedItemIds: normalizeEquippedItemIds({
      items: clonedItems,
      equippedItemIds: assets?.equippedItemIds ?? []
    })
  };
}

export function applyAssetPatch(assets: RuntimeAssetsState, patch: AssetPatch | undefined): RuntimeAssetsState {
  if (!patch) return assets;

  const next = cloneAssetsState(assets);
  for (const item of patch.upsertItems ?? []) {
    if (isSpendableCashAsset(item)) continue;
    next.items[item.itemId] = cloneAssetBase(item);
  }
  for (const removed of patch.removeItems ?? []) {
    delete next.items[removed.itemId];
  }
  if (patch.equippedItemIds !== undefined) {
    next.equippedItemIds = [...patch.equippedItemIds];
  }
  next.equippedItemIds = normalizeEquippedItemIds(next);
  return next;
}

function reconcileActorProfileEnrichmentQueue({
  state,
  actors,
  response,
  actorIdAliases,
  turnId
}: {
  state: RuntimeState;
  actors: RuntimeState['actors'];
  response: NarratorResponse;
  actorIdAliases: Map<string, string>;
  turnId: string;
}): PendingActorProfileEnrichment[] {
  const pendingByActorId = new Map<string, PendingActorProfileEnrichment>();
  for (const rawPending of state.pendingActorProfileEnrichments ?? []) {
    const pending = normalizePendingActorProfileEnrichment(rawPending);
    if (!pending) continue;
    const actorId = actorIdAliases.get(pending.actorId) ?? pending.actorId;
    if (!actors[actorId] || actorId === state.player.actorId) continue;
    const previous = pendingByActorId.get(actorId);
    pendingByActorId.set(actorId, {
      ...pending,
      actorId,
      missingFields: Array.from(new Set([...(previous?.missingFields ?? []), ...pending.missingFields])),
      sourceTurnId: previous?.sourceTurnId ?? pending.sourceTurnId,
      attemptCount: Math.max(previous?.attemptCount ?? 0, pending.attemptCount),
      consecutiveFailureCount: Math.max(
        previous?.consecutiveFailureCount ?? 0,
        pending.consecutiveFailureCount ?? 0
      )
    });
  }

  for (const [actorId, actor] of Object.entries(actors)) {
    if (actorId === state.player.actorId) continue;
    const previous = pendingByActorId.get(actorId);
    const remainingFields = missingActorProfileEnrichmentFields(actor);
    if (remainingFields.length === 0) {
      pendingByActorId.delete(actorId);
      continue;
    }

    pendingByActorId.set(actorId, {
      actorId,
      sourceTurnId: previous?.sourceTurnId ?? turnId,
      missingFields: remainingFields,
      attemptCount: previous?.attemptCount ?? 0,
      lastAttemptTurn: previous?.lastAttemptTurn,
      nextRetryTurn: previous?.nextRetryTurn,
      consecutiveFailureCount: previous?.consecutiveFailureCount ?? 0,
      lastFailureKind: previous?.lastFailureKind,
      lastRouteMode: previous?.lastRouteMode
    });
  }

  return [...pendingByActorId.values()].slice(-200);
}

export function applyNarratorResponse(
  state: RuntimeState,
  rawResponse: NarratorResponse,
  meta: {
    playerInput?: string;
    rawNarratorResponse?: string;
    writebackDiagnostics?: StoryDiagnosticIssue[];
    turnMetrics?: StoryTurnMetrics;
    actorIdAliases?: Record<string, string>;
    pregnancyMode?: PregnancyMode;
  } = {}
): RuntimeState {
  const assetPurchaseAtomicity = enforceAssetPurchaseWritebackAtomicity(
    state,
    rawResponse
  );
  const organizationIdentityResolution = resolveOrganizationWritebackIdentity(
    state,
    assetPurchaseAtomicity.response
  );
  const response = organizationIdentityResolution.response;
  const nextTime = resolveTurnEndTime(state.time, response.timePatch);
  const elapsedMinutes = elapsedMinutesBetween(state.time, nextTime);
  const turnId = nextId('turn', state.turnCounter);
  let actors = { ...state.actors };
  let secretFacts = { ...state.secretFacts };
  let places = { ...state.places };
  let scenes = { ...state.scenes };
  let cases = { ...state.cases };
  let caseEvidence = { ...state.caseEvidence };
  let deferredEvents = { ...state.deferredEvents };
  let dynamicEvents = cloneDynamicEventsState(state.dynamicEvents);
  let organizations = { ...(state.organizations ?? {}) };
  let citySituationTracks = { ...(state.citySituationTracks ?? {}) };
  let relationshipThreads = { ...(state.relationshipThreads ?? {}) };
  let judgementChecks = { ...(state.judgementChecks ?? {}) };
  let combatEvents = { ...(state.combatEvents ?? {}) };
  let memories = { ...state.memories };
  let assets = cloneAssetsState(state.assets);
  let finance = state.finance;
  let grayLedger = [...state.grayLedger];
  let grayNetworks = state.grayNetworks;
  let player = state.player;
  let lawIdentity = state.lawIdentity;
  let location = state.location;
  let policePanel = state.policePanel;
  let environment = refreshWeatherIfExpired(state.environment, nextTime);
  const policePromotionDlcBound = isPolicePromotionDlcBound(state);
  let deferredPoliceRoleProfilePatch: PlayerPoliceRoleProfilePatch | undefined;
  let attemptedDirectPoliceRank: string | undefined;
  const applicationDiagnostics: StoryDiagnosticIssue[] = [
    ...assetPurchaseAtomicity.diagnostics,
    ...organizationIdentityResolution.diagnostics
  ];
  const actorIdAliases = new Map(Object.entries(meta.actorIdAliases ?? {}));
  const actorIdsWithIdentityConflict = new Set<string>();
  const patchedPlaceIds = new Set<string>();
  const patchedSceneIds: string[] = [];
  const updatedCurrentMatterIds: string[] = [];
  const appliedRelationshipThreadIds = new Set<string>();
  const actorMemoryWrittenThisTurn = new Set<string>();
  const legacyActorMemoryCandidates: Array<{
    actorId: string;
    memory: ActorPatch['keyMemories'][number];
    path: Array<string | number>;
  }> = [];

  if (response.writeback.weatherPatch) {
    const weatherResult = applyWeatherPatchToEnvironmentWithDiagnostics(
      environment,
      response.writeback.weatherPatch,
      nextTime
    );
    environment = weatherResult.environment;
    if (weatherResult.diagnostic) {
      applicationDiagnostics.push({
        path: ['environment', 'weather'],
        code: weatherResult.diagnostic.code,
        message: weatherResult.diagnostic.message
      });
    }
  }

  for (const [index, rawPatch] of response.writeback.actorPatches.entries()) {
    const recoveredSeedIdentity = recoverUninstantiatedSeedActorIdentity(actors, rawPatch);
    const identityCandidatePatch = recoveredSeedIdentity
      ? { ...rawPatch, actorId: recoveredSeedIdentity.runtimeActorId }
      : rawPatch;
    const rawResolution = resolveActorReferenceWithAliases(actors, actorIdAliases, identityCandidatePatch.actorId);
    const fixedIdentityConflict = evaluateFixedActorIdentityPatch(
      actors[rawResolution.actorId],
      identityCandidatePatch
    );
    if (fixedIdentityConflict) {
      actorIdsWithIdentityConflict.add(rawPatch.actorId);
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index],
        code: 'actor_fixed_identity_conflict',
        message: `Actor patch "${rawPatch.actorId}" was ignored because stable identity "${fixedIdentityConflict.expected.displayName}" conflicts with ${fixedIdentityConflict.conflicting.map((item) => `"${item.displayName}"`).join(', ')}.`
      });
      continue;
    }
    const screenCharacterIdentityResolution = normalizeScreenCharacterActorPatch(actors, identityCandidatePatch);
    const seedIdentityResolution = screenCharacterIdentityResolution.match
      ? { patch: screenCharacterIdentityResolution.patch }
      : normalizeSeedActorPatch(actors, screenCharacterIdentityResolution.patch);
    const cityPowerIdentityResolution = screenCharacterIdentityResolution.match
      ? { patch: seedIdentityResolution.patch }
      : normalizeCityPowerActorPatch(actors, seedIdentityResolution.patch);
    const patch = cityPowerIdentityResolution.patch;
    if (screenCharacterIdentityResolution.match && rawPatch.actorId !== patch.actorId) {
      actorIdAliases.set(rawPatch.actorId, patch.actorId);
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index, 'actorId'],
        code: 'screen_character_identity_actor_remapped',
        message: `Actor patch "${rawPatch.actorId}" was remapped to screen character identity "${patch.actorId}" (${screenCharacterIdentityResolution.match.displayName}).`
      });
    }
    if (seedIdentityResolution.match && rawPatch.actorId !== seedIdentityResolution.patch.actorId) {
      actorIdAliases.set(rawPatch.actorId, seedIdentityResolution.patch.actorId);
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index, 'actorId'],
        code: 'seed_identity_actor_remapped',
        message: `Actor patch "${rawPatch.actorId}" was remapped to seed identity "${seedIdentityResolution.patch.actorId}" (${seedIdentityResolution.match.displayName}).`
      });
    }
    if (cityPowerIdentityResolution.match && seedIdentityResolution.patch.actorId !== patch.actorId) {
      actorIdAliases.set(seedIdentityResolution.patch.actorId, patch.actorId);
    }
    if (cityPowerIdentityResolution.match && rawPatch.actorId !== patch.actorId) {
      actorIdAliases.set(rawPatch.actorId, patch.actorId);
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index, 'actorId'],
        code: 'city_power_identity_actor_remapped',
        message: `Actor patch "${rawPatch.actorId}" was remapped to city power identity "${patch.actorId}" (${cityPowerIdentityResolution.match.displayName}).`
      });
    }

    const resolution = resolveActorReferenceWithAliases(actors, actorIdAliases, patch.actorId);

    const actor = actors[resolution.actorId];
    if (!actor && !patch.name) {
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index, 'actorId'],
        code: 'missing_actor_reference',
        message: `Actor patch "${patch.actorId}" was ignored because the actor does not exist and no name was provided to create a new actor.`
      });
      continue;
    }
    if (!actor) {
      const missingFields = missingMinimumNewActorFields(patch, nextTime);
      if (missingFields.length > 0) {
        applicationDiagnostics.push({
          path: ['writeback', 'actorPatches', index],
          code: 'incomplete_new_actor_patch',
          message: `New actor patch "${patch.actorId}" was ignored because it is missing the minimum creation fields: ${missingFields.join(', ')}. Optional profile details may be enriched after the actor is created.`
        });
        continue;
      }
    }
    if (resolution.remapped) {
      actorIdAliases.set(patch.actorId, resolution.actorId);
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index, 'actorId'],
        code: 'remapped_actor_reference',
        message: `Actor patch "${patch.actorId}" was applied to existing actor "${resolution.actorId}" through a validated identity alias.`
      });
    }
    const manualProfileFilter = actor
      ? filterManuallyLockedActorPatch(actor, patch)
      : { patch, blockedFields: [] };
    const effectivePatch = manualProfileFilter.patch;
    if (manualProfileFilter.blockedFields.length > 0) {
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index],
        code: 'actor_manual_profile_override_preserved',
        message: `Actor patch fields protected by a player correction were ignored: ${manualProfileFilter.blockedFields.join(', ')}.`
      });
    }
    const demographicSafePatch = sanitizeActorDemographicPatch({
      patch: effectivePatch,
      actorExists: Boolean(actor),
      currentTime: nextTime,
      path: ['writeback', 'actorPatches', index],
      diagnostics: applicationDiagnostics
    });
    const isPlayerActorPatch = resolution.actorId === state.player.actorId;
    const hasDirectPlayerIdentityFields =
      isPlayerActorPatch &&
      (effectivePatch.currentIdentity !== undefined ||
        effectivePatch.publicIdentity !== undefined ||
        effectivePatch.actualIdentitySummary !== undefined ||
        Object.keys(effectivePatch.roleProfiles ?? {}).length > 0);
    if (hasDirectPlayerIdentityFields) {
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index],
        code: 'player_identity_requires_context_patch',
        message:
          'Player actor identity fields were ignored. Player currentIdentity, public identity, actual identity and role profiles require identityContextPatch so UI, permissions, finance, secrets and history stay atomic.'
      });
    }

    const {
      vitalsPatch,
      keyMemories,
      roleProfiles,
      worldpackActorData,
      attributes,
      femaleProfile,
      activeTraits,
      organizationIds,
      organizationRelations,
      longTermMemorySummary,
      recentInteractionMemory,
      ...actorPatch
    } = demographicSafePatch;
    const {
      currentIdentity: _directCurrentIdentity,
      publicIdentity: _directPublicIdentity,
      actualIdentitySummary: _directActualIdentitySummary,
      ...nonIdentityActorPatch
    } = actorPatch;
    const effectiveActorPatch = isPlayerActorPatch ? nonIdentityActorPatch : actorPatch;
    const effectiveRoleProfiles = isPlayerActorPatch ? undefined : roleProfiles;
    const rejectsUnanchoredPresentTransition = Boolean(
      actor &&
        effectiveActorPatch.presence === 'present' &&
        !actorHasCurrentLocalAnchor(actor, location) &&
        !actorPatchHasCurrentLocationAnchor(effectiveActorPatch, location)
    );
    if (rejectsUnanchoredPresentTransition) {
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index, 'presence'],
        code: 'actor_present_requires_location_anchor',
        message: `Actor patch "${resolution.actorId}" could not move an existing remote actor into the visible scene without an explicit current place or scene anchor. Other safe actor fields were still applied.`
      });
    }
    const {
      presence: _unanchoredPresent,
      ...actorPatchWithoutUnanchoredPresent
    } = effectiveActorPatch;
    const presenceSafeActorPatch = rejectsUnanchoredPresentTransition
      ? actorPatchWithoutUnanchoredPresent
      : effectiveActorPatch;
    const locationAwareActorPatch =
      !rejectsUnanchoredPresentTransition && effectiveActorPatch.presence === 'present'
        ? {
            ...effectiveActorPatch,
            currentPlaceId: effectiveActorPatch.currentPlaceId ?? location.currentPlaceId,
            ...(effectiveActorPatch.currentSceneId ?? location.currentSceneId
              ? { currentSceneId: effectiveActorPatch.currentSceneId ?? location.currentSceneId }
              : {})
          }
        : presenceSafeActorPatch;
    const requestedInteractionScore = locationAwareActorPatch.interactionScore;
    const preservesExistingInteractionScore = Boolean(
      actor &&
        requestedInteractionScore !== undefined &&
        requestedInteractionScore < actor.interactionScore
    );
    if (preservesExistingInteractionScore && actor && requestedInteractionScore !== undefined) {
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index, 'interactionScore'],
        code: 'actor_interaction_score_decrease_preserved',
        message: `Actor "${actor.actorId}" kept its cumulative interaction score (${actor.interactionScore} -> ${requestedInteractionScore} was not applied). Hostility or distance must be recorded in relationship text fields instead of lowering established interaction depth.`
      });
    }
    const interactionScoreSafeActorPatch = preservesExistingInteractionScore && actor
      ? { ...locationAwareActorPatch, interactionScore: actor.interactionScore }
      : locationAwareActorPatch;
    const hasRoleProfiles = Object.keys(effectiveRoleProfiles ?? {}).length > 0;
    const baseActor =
      actor ??
      createActorDefaults({
        ...interactionScoreSafeActorPatch,
        actorId: resolution.actorId,
        name: effectivePatch.name ?? effectivePatch.publicIdentity ?? effectivePatch.actorId,
        currentIdentity: effectivePatch.currentIdentity ?? 'civilian',
        roleProfiles: hasRoleProfiles ? (effectiveRoleProfiles as Actor['roleProfiles']) : {},
        worldpackActorData,
        longTermMemorySummary,
        recentInteractionMemory,
        keyMemories: []
      });
    const mergedOrganizationRelations = mergeActorOrganizationRelations(baseActor.organizationRelations, organizationRelations);
    const mergedOrganizationIds = mergeUnique(
      mergeUnique(baseActor.organizationIds, organizationIds),
      visibleOrganizationIdsFromRelations(mergedOrganizationRelations)
    );
    const nextVitals =
      vitalsPatch && baseActor.vitals
        ? applyVitalsPatch(baseActor.vitals, vitalsPatch, nextTime)
        : undefined;
    if (isPlayerActorPatch && vitalsPatch && nextVitals) {
      applicationDiagnostics.push({
        path: ['writeback', 'actorPatches', index, 'vitalsPatch'],
        code: 'player_vitals_lifecycle_updated',
        message: `玩家身体状态已于 ${nextTime.year}-${String(nextTime.month).padStart(2, '0')}-${String(nextTime.day).padStart(2, '0')} ${String(nextTime.hour).padStart(2, '0')}:${String(nextTime.minute).padStart(2, '0')} 完成复核：${baseActor.vitals?.conditionSummary ?? state.player.vitals.conditionSummary} -> ${nextVitals.conditionSummary}；持续性=${nextVitals.conditionLifecycle?.persistence ?? 'unknown'}。`
      });
    }
    const patchedActorBase = normalizeActor({
      ...baseActor,
      ...interactionScoreSafeActorPatch,
      actorId: baseActor.actorId,
      name: effectivePatch.name ?? baseActor.name,
      currentIdentity: isPlayerActorPatch ? baseActor.currentIdentity : effectivePatch.currentIdentity ?? baseActor.currentIdentity,
      organizationIds: mergedOrganizationIds,
      organizationRelations: mergedOrganizationRelations,
      attributes: attributes ? { ...baseActor.attributes, ...attributes } : baseActor.attributes,
      activeTraits: mergeTraits(baseActor.activeTraits, activeTraits as Trait[] | undefined),
      roleProfiles: hasRoleProfiles ? (effectiveRoleProfiles as Actor['roleProfiles']) : baseActor.roleProfiles,
      worldpackActorData: {
        ...(baseActor.worldpackActorData ?? {}),
        ...(worldpackActorData ?? {})
      },
      ...(longTermMemorySummary !== undefined ? { longTermMemorySummary } : {}),
      ...(recentInteractionMemory !== undefined ? { recentInteractionMemory } : {}),
      keyMemories: baseActor.keyMemories,
      ...(nextVitals ? { vitals: nextVitals } : baseActor.vitals ? { vitals: baseActor.vitals } : {})
    });
    const patchedActor = applyActorFemaleProfilePatch(patchedActorBase, femaleProfile, nextTime, 'writeback');
    actors[patchedActor.actorId] = patchedActor;
    if (patchedActor.actorId === state.player.actorId) {
      lawIdentity = mergePlayerPoliceProfileIntoLawIdentity(lawIdentity, effectiveRoleProfiles?.police);
    }
    for (const [memoryIndex, memory] of (keyMemories ?? []).entries()) {
      legacyActorMemoryCandidates.push({
        actorId: patchedActor.actorId,
        memory,
        path: ['writeback', 'actorPatches', index, 'keyMemories', memoryIndex]
      });
    }
    if ((patchedActor.presence === 'present' || patchedActor.presence === 'nearby') && patchedActor.currentSceneId && scenes[patchedActor.currentSceneId]) {
      scenes[patchedActor.currentSceneId] = {
        ...scenes[patchedActor.currentSceneId],
        presentActorIds: mergeUnique(scenes[patchedActor.currentSceneId].presentActorIds, [patchedActor.actorId])
      };
    }
    ({ player, location } = mirrorPlayerActorPatch(
      player,
      location,
      state.player.actorId,
      { ...demographicSafePatch, actorId: patchedActor.actorId },
      patchedActor
    ));
  }

  secretFacts = applySecretFactPatches(
    secretFacts,
    response.writeback.secretFactPatches as SecretFactPatch[],
    nextTime
  );
  if (response.writeback.identityContextPatch) {
    const identityContextPatch = remapPlayerIdentityContextPatchActorIds(
      response.writeback.identityContextPatch as PlayerIdentityContextPatch,
      actorIdAliases
    );
    const isBoundPoliceCorrection =
      policePromotionDlcBound &&
      identityContextPatch.kind === 'correction' &&
      identityContextPatch.fromIdentity === 'police' &&
      identityContextPatch.toIdentity === 'police';
    if (isBoundPoliceCorrection) {
      applicationDiagnostics.push({
        path: ['writeback', 'identityContextPatch'],
        code: 'police_identity_rank_bypass_blocked',
        message: 'Same-identity police corrections cannot bypass the bound promotion and posting program.'
      });
    }
    const identityResult = isBoundPoliceCorrection
      ? undefined
      : applyPlayerIdentityContextPatch(
          {
            ...state,
            time: nextTime,
            player,
            actors,
            secretFacts,
            lawIdentity,
            policePanel,
            finance
          },
          identityContextPatch
        );
    if (identityResult?.applied) {
      player = identityResult.state.player;
      actors = identityResult.state.actors;
      secretFacts = identityResult.state.secretFacts;
      lawIdentity = identityResult.state.lawIdentity;
      policePanel = identityResult.state.policePanel;
      finance = identityResult.state.finance;
    } else if (identityResult?.diagnostic) {
      applicationDiagnostics.push({
        path: ['writeback', 'identityContextPatch'],
        code: 'identity_context_patch_rejected',
        message: identityResult.diagnostic
      });
    }
  }

  if (response.writeback.policeRoleProfilePatch) {
    const rawPatch = response.writeback.policeRoleProfilePatch as PoliceRoleProfilePatch;
    const policeRoleProfilePatch: PlayerPoliceRoleProfilePatch = {
      ...rawPatch,
      ...(rawPatch.supervisorActorIds
        ? { supervisorActorIds: remapActorIds(rawPatch.supervisorActorIds, actorIdAliases) }
        : {}),
      ...(rawPatch.peerActorIds
        ? { peerActorIds: remapActorIds(rawPatch.peerActorIds, actorIdAliases) }
        : {})
    };
    if (policePromotionDlcBound) {
      deferredPoliceRoleProfilePatch = policeRoleProfilePatch;
    } else {
      const roleProfileResult = applyPlayerPoliceRoleProfilePatch(
        {
          ...state,
          time: nextTime,
          player,
          actors,
          lawIdentity,
          policePanel
        },
        policeRoleProfilePatch
      );
      if (roleProfileResult.applied) {
        actors = roleProfileResult.state.actors;
        lawIdentity = roleProfileResult.state.lawIdentity;
        policePanel = roleProfileResult.state.policePanel;
      } else if (roleProfileResult.diagnostic) {
        applicationDiagnostics.push({
          path: ['writeback', 'policeRoleProfilePatch'],
          code: 'police_role_profile_patch_rejected',
          message: roleProfileResult.diagnostic
        });
      }
    }
  }

  if (response.writeback.playerPatch) {
    const result = applyPlayerPatch(player, actors[state.player.actorId], response.writeback.playerPatch, nextTime, turnId);
    player = result.player;
    if (result.playerActor) {
      actors[state.player.actorId] = result.playerActor;
    }
  }
  if (response.writeback.playerPatch?.policePanel) {
    const rawPolicePanelPatch = response.writeback.playerPatch.policePanel as PolicePanelPatch;
    attemptedDirectPoliceRank = rawPolicePanelPatch.careerPath?.currentRank?.trim();
    const policePanelPatch = policePromotionDlcBound && rawPolicePanelPatch.careerPath
      ? {
          ...rawPolicePanelPatch,
          careerPath: {
            ...rawPolicePanelPatch.careerPath,
            currentRank: undefined
          }
        }
      : rawPolicePanelPatch;
    policePanel = applyPolicePanelPatch(policePanel, policePanelPatch, nextTime);
    if (!policePromotionDlcBound && attemptedDirectPoliceRank) {
      const synchronizedRank = synchronizePlayerPoliceRank({
        lawIdentity,
        policePanel,
        playerActor: actors[player.actorId],
        rank: attemptedDirectPoliceRank
      });
      lawIdentity = synchronizedRank.lawIdentity;
      policePanel = synchronizedRank.policePanel;
      if (synchronizedRank.playerActor) {
        actors[player.actorId] = synchronizedRank.playerActor;
      }
    }
  }
  const legacyPlayerEconomyPatch = response.writeback.playerPatch?.economy;
  const explicitFinancePatch = response.writeback.financePatch as FinancePatch | undefined;
  const hasExplicitBalancePatch = Boolean(
    explicitFinancePatch &&
      (explicitFinancePatch.cashDelta !== undefined ||
        explicitFinancePatch.cashSet !== undefined ||
        explicitFinancePatch.bankDelta !== undefined ||
        explicitFinancePatch.bankSet !== undefined)
  );

  if (
    !hasExplicitBalancePatch &&
    (legacyPlayerEconomyPatch?.moneyDelta !== undefined || legacyPlayerEconomyPatch?.moneySet !== undefined)
  ) {
    finance = applyFinancePatch(
      finance,
      {
        bankDelta: legacyPlayerEconomyPatch.moneyDelta,
        bankSet: legacyPlayerEconomyPatch.moneySet,
        summary: legacyPlayerEconomyPatch.financeSummary
      },
      nextTime
    );
  }
  finance = applyFinancePatch(finance, explicitFinancePatch, nextTime);
  finance = syncPlayerPoliceSalaryCashflow({
    finance,
    time: nextTime,
    currentIdentity: player.currentIdentity,
    lawIdentity,
    identityHistory: player.identityHistory
  });
  grayLedger = applyGrayLedgerPatch(grayLedger, response.writeback.grayLedgerPatch as GrayLedgerPatch | undefined, nextTime);
  player = syncPlayerEconomyWithFinance(player, finance);

  for (const patch of response.writeback.placePatches) {
    patchedPlaceIds.add(patch.placeId);
    places[patch.placeId] = applyPlacePatch(places[patch.placeId], {
      ...patch,
      relatedActorIds: remapActorIds(patch.relatedActorIds, actorIdAliases)
    });
  }

  for (const patch of response.writeback.scenePatches) {
    patchedSceneIds.push(patch.sceneId);
    scenes[patch.sceneId] = applyScenePatch(scenes[patch.sceneId], {
      ...patch,
      presentActorIds: remapActorIds(patch.presentActorIds, actorIdAliases)
    });
  }

  location = applyLocationPatch(location, response.writeback.locationPatch, scenes);

  const caseStatusBeforeWriteback = new Map<string, CaseFile['status'] | undefined>();
  const touchedCaseIds = new Set<string>();
  for (const patch of response.writeback.casePatches) {
    const previousCase = cases[patch.caseId];
    if (!caseStatusBeforeWriteback.has(patch.caseId)) {
      caseStatusBeforeWriteback.set(patch.caseId, previousCase?.status);
    }
    touchedCaseIds.add(patch.caseId);
    const nextCase = enforcePlayerCaseLead({
      caseFile: applyCasePatch(
        previousCase,
        {
          ...patch,
          relatedActorIds: remapActorIds(patch.relatedActorIds, actorIdAliases),
          involvedActorIds: remapActorIds(patch.involvedActorIds, actorIdAliases),
          leadActorId: patch.leadActorId ? actorIdAliases.get(patch.leadActorId) ?? patch.leadActorId : undefined,
          activityLog: patch.activityLog?.map((activity) => ({
            ...activity,
            actorId: activity.actorId ? actorIdAliases.get(activity.actorId) ?? activity.actorId : undefined,
            relatedActorIds: remapActorIds(activity.relatedActorIds, actorIdAliases) ?? []
          }))
        },
        turnId,
        nextTime
      ),
      playerActorId: player.actorId,
      playerActorName: actors[player.actorId]?.name
    });
    cases[patch.caseId] = nextCase;
  }

  const newlyArchivedCases = [...touchedCaseIds]
    .filter((caseId) => caseStatusBeforeWriteback.get(caseId) !== 'archived' && cases[caseId]?.status === 'archived')
    .map((caseId) => cases[caseId]);
  for (const caseFile of newlyArchivedCases) {
    const archiveSummary = [...caseFile.activityLog]
      .reverse()
      .find((activity) => activity.kind === 'archived' && activity.visibleToPlayer !== false)
      ?.summary.trim();
    const text = archiveSummary
      ? `案件【${caseFile.title}】已正式归档：${archiveSummary}`
      : `案件【${caseFile.title}】已正式归档。`;
    const memoryId = nextAvailableId('memory', memories);
    memories[memoryId] = {
      memoryId,
      text,
      kind: 'case',
      tier: 'short_term',
      relatedActorIds: [...caseFile.relatedActorIds],
      relatedCaseIds: [caseFile.caseId],
      relatedPlaceIds: [...caseFile.relatedPlaceIds],
      relatedOrganizationIds: [...caseFile.relatedOrganizationIds],
      relatedTurnId: turnId,
      gameTime: cloneGameTime(nextTime),
      importance: 85,
      visibility: 'player_known',
      certainty: 'fact',
      embeddingText: text
    };
  }

  for (const patch of response.writeback.caseEvidencePatches) {
    const evidence = applyCaseEvidencePatch(
      caseEvidence[patch.evidenceId],
      {
        ...patch,
        submittedByActorId: patch.submittedByActorId ? actorIdAliases.get(patch.submittedByActorId) ?? patch.submittedByActorId : undefined,
        relatedActorIds: remapActorIds(patch.relatedActorIds, actorIdAliases)
      },
      nextTime
    );
    caseEvidence[evidence.evidenceId] = evidence;
    if (cases[evidence.caseId] && !cases[evidence.caseId].evidenceIds.includes(evidence.evidenceId)) {
      cases[evidence.caseId] = {
        ...cases[evidence.caseId],
        evidenceIds: [...cases[evidence.caseId].evidenceIds, evidence.evidenceId],
        updatedAt: cloneGameTime(nextTime)
      };
    }
  }

  for (const patch of response.writeback.deferredEventPatches) {
    const deferredEvent = applyDeferredEventPatch(
      deferredEvents[patch.eventId],
      {
        ...patch,
        relatedIds: {
          ...patch.relatedIds,
          actorId: patch.relatedIds.actorId ? actorIdAliases.get(patch.relatedIds.actorId) ?? patch.relatedIds.actorId : undefined
        }
      },
      nextTime
    );
    if (deferredEvent) {
      deferredEvents[patch.eventId] = deferredEvent;
    }
  }

  for (const [index, patch] of response.writeback.currentMatterPatches.entries()) {
    const remappedPatch = {
      ...patch,
      relatedActorIds: remapActorIds(patch.relatedActorIds, actorIdAliases)
    };
    const matterIdentity = resolveCurrentMatterIdentity(
      dynamicEvents.currentMatters,
      remappedPatch
    );
    const existing = dynamicEvents.currentMatters[matterIdentity.canonicalId];
    if (!existing && !canCreateCurrentMatter(patch)) {
      applicationDiagnostics.push({
        path: ['writeback', 'currentMatterPatches', index],
        code: 'incomplete_current_matter_patch',
        message: `Current matter "${patch.id}" was ignored because a new item requires title and summary.`
      });
      continue;
    }
    if (matterIdentity.canonicalId !== patch.id) {
      applicationDiagnostics.push({
        path: ['writeback', 'currentMatterPatches', index, 'id'],
        code: 'current_matter_identity_remapped',
        message: `Current matter "${patch.id}" was merged into stable matter "${matterIdentity.canonicalId}" by ${matterIdentity.matchedBy}.`
      });
    }
    dynamicEvents.currentMatters[matterIdentity.canonicalId] = applyCurrentMatterPatch(
      existing,
      {
        ...remappedPatch,
        id: matterIdentity.canonicalId
      },
      nextTime
    );
    updatedCurrentMatterIds.push(matterIdentity.canonicalId);
  }

  for (const [index, patch] of response.writeback.signalPatches.entries()) {
    const existing = dynamicEvents.signals[patch.id];
    if (!existing && !canCreateSignal(patch)) {
      applicationDiagnostics.push({
        path: ['writeback', 'signalPatches', index],
        code: 'incomplete_signal_patch',
        message: `Signal "${patch.id}" was ignored because a new item requires title and summary.`
      });
      continue;
    }
    dynamicEvents.signals[patch.id] = applySignalPatch(existing, patch, nextTime);
  }

  for (const [index, patch] of response.writeback.newsIssuePatches.entries()) {
    const newsworthiness = enforcePlayerNewsworthiness(
      { ...state, cases },
      patch,
      ['writeback', 'newsIssuePatches', index]
    );
    applicationDiagnostics.push(...newsworthiness.diagnostics);
    if (!newsworthiness.issue) {
      continue;
    }
    const acceptedPatch = newsworthiness.issue;
    const existing = dynamicEvents.newsIssues[acceptedPatch.id];
    if (!existing && !canCreateNewsIssue(acceptedPatch)) {
      applicationDiagnostics.push({
        path: ['writeback', 'newsIssuePatches', index],
        code: 'incomplete_news_issue_patch',
        message: `News issue "${acceptedPatch.id}" was ignored because a new item requires outletName, headline and summary.`
      });
      continue;
    }
    dynamicEvents.newsIssues[acceptedPatch.id] = applyNewsIssuePatch(existing, acceptedPatch, nextTime);
  }

  for (const patch of response.writeback.organizationPatches) {
    organizations[patch.organizationId] = applyOrganizationPatch(organizations[patch.organizationId], {
      ...patch,
      relatedActorIds: remapActorIds(patch.relatedActorIds, actorIdAliases),
      structureTree: remapOrganizationStructureActorIds(patch.structureTree, actorIdAliases),
      triadState: remapTriadOrganizationStateActorIds(patch.triadState, actorIdAliases)
    });
  }

  if (response.writeback.civilianRoleProfilePatch) {
    const rawPatch = response.writeback.civilianRoleProfilePatch as CivilianRoleProfilePatch;
    const civilianRoleProfilePatch: PlayerCivilianRoleProfilePatch = {
      ...rawPatch,
      livelihoodActorIds: remapActorIds(rawPatch.livelihoodActorIds, actorIdAliases)
    };
    const roleProfileResult = applyPlayerCivilianRoleProfilePatch(
      {
        ...state,
        time: nextTime,
        player,
        actors,
        places,
        organizations
      },
      civilianRoleProfilePatch
    );
    if (roleProfileResult.applied) {
      actors = roleProfileResult.state.actors;
    } else if (roleProfileResult.diagnostic) {
      applicationDiagnostics.push({
        path: ['writeback', 'civilianRoleProfilePatch'],
        code: 'civilian_role_profile_patch_rejected',
        message: roleProfileResult.diagnostic
      });
    }
  }

  for (const [index, patch] of response.writeback.relationshipThreadPatches.entries()) {
    const relationshipActorIds = [
      ...(patch.relatedActorIds ?? []),
      ...(patch.primaryActorId ? [patch.primaryActorId] : [])
    ];
    const conflictingActorIds = [...new Set(
      relationshipActorIds.filter((actorId) => actorIdsWithIdentityConflict.has(actorId))
    )];
    if (conflictingActorIds.length > 0) {
      applicationDiagnostics.push({
        path: ['writeback', 'relationshipThreadPatches', index],
        code: 'relationship_actor_identity_conflict_rejected',
        message: `Relationship thread "${patch.threadId}" was ignored because its actor patch had a fixed identity conflict: ${conflictingActorIds.join(', ')}.`
      });
      continue;
    }
    const remappedRelatedActorIds = remapActorIds(patch.relatedActorIds, actorIdAliases);
    const remappedPrimaryActorId = patch.primaryActorId ? actorIdAliases.get(patch.primaryActorId) ?? patch.primaryActorId : undefined;
    const identityResolution = resolveRelationshipThreadIdentity(
      relationshipThreads,
      {
        ...patch,
        relatedActorIds: remappedRelatedActorIds,
        primaryActorId: remappedPrimaryActorId
      },
      state.player.actorId,
      ['writeback', 'relationshipThreadPatches', index]
    );
    applicationDiagnostics.push(...identityResolution.diagnostics);
    const resolvedPatch = identityResolution.patch;
    const evidenceEvaluation = evaluateRelationshipCreationEvidence(resolvedPatch, {
      memories,
      cases,
      deferredEvents
    }, ['writeback', 'relationshipThreadPatches', index]);
    applicationDiagnostics.push(
      ...evidenceEvaluation.diagnostics.filter((issue) => issue.code === 'relationship_evidence_ref_removed')
    );
    if (!relationshipThreads[resolvedPatch.threadId]) {
      if (!evidenceEvaluation.sufficient) {
        applicationDiagnostics.push({
          path: ['writeback', 'relationshipThreadPatches', index],
          code: 'relationship_creation_rejected',
          message: `关系线 "${resolvedPatch.threadId}" 未建立：${evidenceEvaluation.issues.join('；')}。`
        });
        continue;
      }
    }

    let patchWithVerifiedEvidence = resolvedPatch;
    if (resolvedPatch.evidenceRefs) {
      if (evidenceEvaluation.validRefs.length > 0 || !relationshipThreads[resolvedPatch.threadId]) {
        patchWithVerifiedEvidence = { ...resolvedPatch, evidenceRefs: evidenceEvaluation.validRefs };
      } else {
        const { evidenceRefs: _invalidEvidenceRefs, ...patchWithoutEvidence } = resolvedPatch;
        patchWithVerifiedEvidence = patchWithoutEvidence;
      }
    }
    const result = applyRelationshipThreadPatch(
      relationshipThreads,
      {
        ...patchWithVerifiedEvidence,
        milestoneUpdates: patch.milestoneUpdates?.map((milestone) => ({
          ...milestone,
          relatedActorIds: remapActorIds(milestone.relatedActorIds, actorIdAliases)
        }))
      } as RelationshipThreadPatch,
      nextTime,
      actors
    );
    if (result.thread) {
      relationshipThreads[result.thread.threadId] = result.thread;
      appliedRelationshipThreadIds.add(result.thread.threadId);
    }
    for (const warning of result.diagnostics) {
      applicationDiagnostics.push({
        path: ['writeback', 'relationshipThreadPatches', index],
        code:
          result.rejectionCode === 'missing_actor'
            ? 'relationship_missing_actor_rejected'
            : result.rejectionCode === 'incomplete_creation'
              ? 'relationship_creation_rejected'
              : 'relationship_thread_patch_warning',
        message: warning
      });
    }
  }

  actors = reconcileActorRelationshipProfiles(actors, relationshipThreads, state.player.actorId, {
    threadIds: appliedRelationshipThreadIds
  });

  ({ actors, player } = normalizeRuntimeActorAges({
    actors,
    player,
    currentTime: nextTime
  }));

  const pregnancyResult = applyPregnancyLifecycle({
    actors,
    relationshipThreads,
    currentTime: nextTime,
    worldpackId: state.world.worldpackId,
    playerActorId: state.player.actorId,
    mode: meta.pregnancyMode ?? 'standard',
    riskPatches: response.writeback.pregnancyRiskPatches.map((patch) => ({
      ...patch,
      actorId: actorIdAliases.get(patch.actorId) ?? patch.actorId,
      fatherActorId: patch.fatherActorId
        ? actorIdAliases.get(patch.fatherActorId) ?? patch.fatherActorId
        : undefined
    })),
    resolutionPatches: response.writeback.pregnancyResolutionPatches.map((patch) => ({
      ...patch,
      actorId: actorIdAliases.get(patch.actorId) ?? patch.actorId,
      fatherActorId: patch.fatherActorId
        ? actorIdAliases.get(patch.fatherActorId) ?? patch.fatherActorId
        : undefined
    }))
  });
  actors = pregnancyResult.actors;
  relationshipThreads = pregnancyResult.relationshipThreads;
  applicationDiagnostics.push(...pregnancyResult.diagnostics);

  for (const patch of response.writeback.grayNetworkPatches) {
    grayNetworks = applyGrayNetworkPatch(
      {
        ...state,
        time: nextTime,
        turnCounter: state.turnCounter + 1,
        player,
        location,
        actors,
        organizations,
        cases,
        caseEvidence,
        deferredEvents,
        dynamicEvents,
        relationshipThreads,
        places,
        scenes,
        environment,
        assets,
        finance,
        grayLedger,
        grayNetworks,
        lawIdentity,
        policePanel,
        memories
      },
      remapGrayNetworkPatchActorIds(patch as GrayNetworkPatch, actorIdAliases)
    ).grayNetworks;
  }

  const citySituationTrackPatchResult = applyCitySituationTrackPatches(
    {
      ...state,
      time: nextTime,
      actors,
      places,
      organizations,
      citySituationTracks
    },
    response.writeback.citySituationTrackPatches
  );
  citySituationTracks = citySituationTrackPatchResult.tracks;
  applicationDiagnostics.push(...citySituationTrackPatchResult.diagnostics);

  assets = applyAssetPatch(assets, response.writeback.assetPatch);
  ({ cases, caseEvidence } = syncAssetEvidenceLinksToCases(assets, cases, caseEvidence, nextTime));

  for (const suggestion of response.writeback.memories) {
    // turnSummary is the single chronological player-memory record for this turn.
    if (suggestion.kind === 'turn') continue;
    const memoryId = nextAvailableId('memory', memories);
    const memory: MemoryItem = {
      memoryId,
      text: suggestion.text,
      kind: suggestion.kind,
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      relatedTurnId: turnId,
      gameTime: cloneGameTime(nextTime),
      importance: suggestion.importance,
      visibility: suggestion.visibility,
      certainty: suggestion.certainty,
      embeddingText: suggestion.text
    };
    memories[memoryId] = memory;
  }

  for (const [index, suggestion] of response.writeback.actorMemories.entries()) {
    const resolution = resolveActorReferenceWithAliases(actors, actorIdAliases, suggestion.actorId);

    const actor = actors[resolution.actorId];
    if (!actor) {
      applicationDiagnostics.push({
        path: ['writeback', 'actorMemories', index, 'actorId'],
        code: 'missing_actor_reference',
        message: `Actor memory "${suggestion.actorId}" was ignored because no existing actor could be found.`
      });
      continue;
    }
    if (!actorNameMatchesFixedIdentity(actor, suggestion.actorName)) {
      applicationDiagnostics.push({
        path: ['writeback', 'actorMemories', index, 'actorName'],
        code: 'actor_memory_identity_conflict',
        message: `Actor memory for "${suggestion.actorId}" was ignored because actorName "${suggestion.actorName}" conflicts with the resolved actor "${actor.name}".`
      });
      continue;
    }
    if (actorMemoryWrittenThisTurn.has(actor.actorId)) {
      applicationDiagnostics.push({
        path: ['writeback', 'actorMemories', index],
        code: 'extra_actor_memory_ignored',
        message: `Only one NPC memory per actor may be stored in a turn; the extra memory for "${actor.actorId}" was ignored.`
      });
      continue;
    }
    if (resolution.remapped) {
      applicationDiagnostics.push({
        path: ['writeback', 'actorMemories', index, 'actorId'],
        code: 'remapped_actor_reference',
        message: `Actor memory "${suggestion.actorId}" was applied to existing actor "${resolution.actorId}" through a validated identity alias.`
      });
    }

    const actorScreenCharacterMatch =
      screenCharacterMatchFromStoredActor(actor) ??
      (actor.actorId.startsWith('npc_screen_') ? findScreenCharacterIdentityMatch(actor.actorId) : undefined);
    const actorSeedMatch = actorScreenCharacterMatch
      ? undefined
      : seedMatchFromStoredActor(actor) ?? findSeedIdentityMatch(actor.name);
    const actorCityPowerMatch = actorScreenCharacterMatch || actorSeedMatch
      ? undefined
      : cityPowerMatchFromStoredActor(actor) ?? findCityPowerIdentityMatch(actor.name);
    const sanitizedSuggestion = actorSeedMatch
      ? {
          ...suggestion,
          actorName: suggestion.actorName
            ? redactSeedProtectedNames(suggestion.actorName, actorSeedMatch)
            : suggestion.actorName,
          text: redactSeedProtectedNames(suggestion.text, actorSeedMatch)
        }
      : actorCityPowerMatch
        ? {
            ...suggestion,
            actorName: suggestion.actorName
              ? redactCityPowerProtectedNames(suggestion.actorName, actorCityPowerMatch)
              : suggestion.actorName,
            text: redactCityPowerProtectedNames(suggestion.text, actorCityPowerMatch)
          }
      : suggestion;
    appendActorMemoryItem(memories, actor.actorId, turnId, nextTime, state.time, sanitizedSuggestion);
    actorMemoryWrittenThisTurn.add(actor.actorId);
  }

  for (const candidate of legacyActorMemoryCandidates) {
    if (actorMemoryWrittenThisTurn.has(candidate.actorId)) {
      applicationDiagnostics.push({
        path: candidate.path,
        code: 'extra_actor_memory_ignored',
        message: `Only one NPC memory per actor may be stored in a turn; the legacy key memory for "${candidate.actorId}" was ignored.`
      });
      continue;
    }
    appendActorMemoryItem(memories, candidate.actorId, turnId, nextTime, state.time, candidate.memory);
    actorMemoryWrittenThisTurn.add(candidate.actorId);
  }

  for (const suggestion of response.writeback.traitProgress) {
    const actorId = actorIdAliases.get(suggestion.actorId) ?? suggestion.actorId;
    const actor = actors[actorId];
    if (!actor) continue;
    actors[actorId] = upsertTraitProgress(actor, {
      traitId: suggestion.traitId,
      name: suggestion.name,
      progress: suggestion.delta,
      maxProgress: suggestion.maxProgress,
      reason: suggestion.reason,
      updatedTurnId: turnId
    });
    if (actorId === state.player.actorId) {
      player = mirrorPlayerTraits(player, actors[actorId]);
    }
  }

  for (const suggestion of response.writeback.traitGains) {
    const actorId = actorIdAliases.get(suggestion.actorId) ?? suggestion.actorId;
    const actor = actors[actorId];
    if (!actor) continue;
    actors[actorId] = addActiveTrait(actor, {
      traitId: suggestion.traitId,
      name: suggestion.name,
      source: suggestion.source,
      description: suggestion.description,
      effectSummary: suggestion.effectSummary,
      scopes: suggestion.scopes,
      status: 'active',
      visibility: suggestion.visibility
    });
    if (actorId === state.player.actorId) {
      player = mirrorPlayerTraits(player, actors[actorId]);
    }
  }

  if (!hasLocationChanged(state.location, location)) {
    location =
      inferLocationFromCurrentMatters(
        location,
        dynamicEvents,
        places,
        scenes,
        updatedCurrentMatterIds,
        patchedPlaceIds,
        patchedSceneIds,
        state.player.actorId
      ) ?? location;
  }
  actors = promoteCurrentMatterActorsAtLocation(actors, dynamicEvents, updatedCurrentMatterIds, location, state.player.actorId, nextTime);
  ({ cases, dynamicEvents } = syncPoliceCurrentMattersToCases(cases, dynamicEvents, updatedCurrentMatterIds, player, turnId, nextTime));
  ({ cases, caseEvidence } = deduplicateExactCaseEvidence(cases, caseEvidence));

  location = normalizeLocationScene(location, scenes);
  actors = normalizeActorsForCurrentLocation(actors, scenes, location, state.player.actorId, nextTime);
  scenes = normalizeScenePresentActorIds(scenes, actors, location, state.player.actorId);

  const writebackDiagnostics = [...(meta.writebackDiagnostics ?? []), ...applicationDiagnostics];
  const turnSummaryText = response.turnSummary?.trim();
  const playerInputText = meta.playerInput?.trim();
  if (turnSummaryText) {
    const memoryId = nextAvailableId('memory', memories);
    memories[memoryId] = {
      memoryId,
      text: turnSummaryText,
      kind: 'turn',
      tier: 'short_term',
      relatedActorIds: [state.player.actorId],
      relatedCaseIds: [],
      relatedPlaceIds: [location.currentPlaceId],
      relatedOrganizationIds: [],
      relatedTurnId: turnId,
      gameTime: cloneGameTime(nextTime),
      importance: 70,
      visibility: 'player_known',
      certainty: 'fact',
      embeddingText: [
        playerInputText ? `玩家输入：${playerInputText}` : '',
        `回合摘要：${turnSummaryText}`
      ]
        .filter(Boolean)
        .join('\n')
    };
  }
  const map = applyLatestMapMovement(
    state.map,
    state.location,
    location,
    turnId,
    state.time,
    nextTime,
    elapsedMinutes
  );
  const pendingActorProfileEnrichments = reconcileActorProfileEnrichmentQueue({
    state,
    actors,
    response,
    actorIdAliases,
    turnId
  });
  const dialogueSpeakerActorIds = createStoryDialogueSpeakerActorIds(response.narrativeText, actors);
  const storyBlocks = buildStoryBlocks(response.narrativeText, {
    dialogueSpeakerActorIds,
    playerActorId: player.actorId,
    presentationHints: response.presentationHints
  });

  let nextState: RuntimeState = {
    ...state,
    time: nextTime,
    environment,
    map,
    player,
    lawIdentity,
    location,
    actors,
    actorIdAliases: (() => {
      const aliases = new Map(Object.entries(state.actorIdAliases ?? {}));
      for (const [sourceActorId, targetActorId] of actorIdAliases) {
        if (sourceActorId !== targetActorId) aliases.set(sourceActorId, targetActorId);
      }
      const resolveAlias = (actorId: string): string => {
        const visited = new Set<string>();
        let current = actorId;
        while (aliases.has(current) && !visited.has(current)) {
          visited.add(current);
          current = aliases.get(current) ?? current;
        }
        return current;
      };
      const normalized = Object.fromEntries(
        [...aliases].flatMap(([sourceActorId]) => {
          const targetActorId = resolveAlias(sourceActorId);
          return sourceActorId !== targetActorId && actors[targetActorId]
            ? [[sourceActorId, targetActorId] as const]
            : [];
        })
      );
      return Object.keys(normalized).length > 0 ? normalized : undefined;
    })(),
    pendingActorProfileEnrichments,
    secretFacts,
    organizations,
    cases,
    caseEvidence,
    deferredEvents,
    dynamicEvents,
    citySituationTracks,
    relationshipThreads,
    judgementChecks,
    combatEvents,
    places,
    scenes,
    assets,
    finance,
    grayLedger,
    grayNetworks,
    policePanel,
    memories,
    storyLog: pruneHeavyStoryPayloads([
      ...state.storyLog,
      ...(playerInputText
        ? [
            {
              turnId,
              speaker: 'player' as const,
              text: playerInputText,
              gameTime: cloneGameTime(state.time)
            }
          ]
        : []),
      {
        turnId,
        speaker: 'narrator',
        text: response.narrativeText,
        dialogueSpeakerActorIds,
        blocks: storyBlocks,
        ...(turnSummaryText ? { summaryText: turnSummaryText } : {}),
        suggestedActions: response.suggestedActions,
        gameTime: cloneGameTime(nextTime),
        visualContext: createStoryVisualContext({ time: nextTime, environment, location, places, scenes }),
        ...(meta.rawNarratorResponse ? { rawNarratorResponse: meta.rawNarratorResponse } : {}),
        ...(writebackDiagnostics.length ? { writebackDiagnostics } : {}),
        ...(meta.turnMetrics ? { turnMetrics: meta.turnMetrics } : {})
      }
    ]),
    turnCounter: state.turnCounter + 1
  };

  for (const patch of response.writeback.judgementCheckPatches) {
    applyJudgementCheckPatch(nextState, {
      ...patch,
      turnId,
      gameTime: cloneGameTime(nextTime),
      relatedActorIds: remapActorIds(patch.relatedActorIds, actorIdAliases) ?? [],
      relatedPlaceIds: [...patch.relatedPlaceIds],
      relatedCaseIds: [...patch.relatedCaseIds]
    } as JudgementCheckPatch);
  }

  for (const patch of response.writeback.combatEventPatches) {
    applyCombatEventPatch(nextState, {
      ...patch,
      turnId,
      gameTime: cloneGameTime(nextTime),
      participants: remapCombatParticipants(patch.participants, actorIdAliases),
      judgementCheckIds: [...patch.judgementCheckIds],
      relatedActorIds: remapActorIds(patch.relatedActorIds, actorIdAliases) ?? [],
      relatedPlaceIds: [...patch.relatedPlaceIds],
      relatedCaseIds: [...patch.relatedCaseIds],
      createdAt: cloneGameTime(nextTime)
    } as CombatEventPatch);
  }
  linkConflictRecordsToStoryEntry(nextState, turnId);
  if (policePromotionDlcBound) {
    const rawCareerPatch = response.writeback.policeCareerProgressPatch as
      | PoliceCareerProgressPatch
      | undefined;
    const careerPatch = rawCareerPatch
      ? {
          ...rawCareerPatch,
          events: rawCareerPatch.events.map((event) => ({
            ...event,
            ...(event.actorId
              ? { actorId: remapActorIds([event.actorId], actorIdAliases)?.[0] ?? event.actorId }
              : {})
          }))
        }
      : undefined;
    const rankBeforeCareerApply = nextState.lawIdentity.rank;
    const careerResult = applyPoliceCareerProgress({
      beforeState: state,
      afterState: nextState,
      patch: careerPatch,
      roleProfilePatch: deferredPoliceRoleProfilePatch,
      attemptedDirectRank: attemptedDirectPoliceRank,
      turnId
    });
    nextState = appendTurnDiagnostics(careerResult.state, turnId, careerResult.diagnostics);
    if (nextState.lawIdentity.rank !== rankBeforeCareerApply) {
      const synchronizedFinance = syncPlayerPoliceSalaryCashflow({
        finance: nextState.finance,
        time: nextTime,
        currentIdentity: nextState.player.currentIdentity,
        lawIdentity: nextState.lawIdentity,
        identityHistory: nextState.player.identityHistory
      });
      nextState = {
        ...nextState,
        finance: synchronizedFinance,
        player: syncPlayerEconomyWithFinance(nextState.player, synchronizedFinance)
      };
    }
  }
  nextState = settleTurnExperience({
    beforeState: state,
    afterState: nextState,
    response,
    turnId
  }).state;

  nextState = applyDueMonthlySettlements(nextState, nextTime, turnId);

  if (
    response.writeback.assetPatch?.equippedItemIds !== undefined ||
    nextState.assets.equippedItemIds.length > 0
  ) {
    nextState = applyEquippedAssetsToRuntimeState(nextState);
  }

  nextState = synchronizeNpcMemoryCaches(nextState);
  nextState = advanceSignalLifecycle(nextState).state;

  return nextState;
}
