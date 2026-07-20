import { getCurrentAreaId } from './grayNetwork';
import type {
  ActorId,
  AreaId,
  CurrentIdentity,
  GrayNetworkClimateItem,
  GrayNetworkPersonProjection,
  GrayNetworkPlaceProjection,
  GrayNetworkProfile,
  GrayNetworkRelationClue,
  GrayNetworkVisibilityLevel,
  IdentityProjectedActionRisk,
  IdentityProjectedSuggestedAction,
  IdentityVisibility,
  KnownGrayOrganization,
  OrganizationId,
  PlaceId,
  RuntimeState
} from '../runtime/types';

export const MAX_GRAY_NETWORK_CONTEXT_CLIMATE = 6;
export const MAX_GRAY_NETWORK_CONTEXT_ORGANIZATIONS = 5;
export const MAX_GRAY_NETWORK_CONTEXT_PLACES = 5;
export const MAX_GRAY_NETWORK_CONTEXT_PEOPLE = 6;
export const MAX_GRAY_NETWORK_CONTEXT_CLUES = 6;
export const MAX_GRAY_NETWORK_CONTEXT_RISKS = 4;
export const MAX_GRAY_NETWORK_CONTEXT_ACTIONS = 4;

export interface GrayNetworkProjection {
  available: boolean;
  areaId: AreaId;
  areaName: string;
  perspective: CurrentIdentity;
  climate: GrayNetworkClimateItem[];
  knownOrganizations: KnownGrayOrganization[];
  keyPlaces: GrayNetworkPlaceProjection[];
  relatedPeople: GrayNetworkPersonProjection[];
  relationClues: GrayNetworkRelationClue[];
  actionRisks: IdentityProjectedActionRisk[];
  suggestedActions: IdentityProjectedSuggestedAction[];
  diagnostics: {
    sourceAreaId: AreaId;
    projectedClimate: number;
    projectedOrganizations: number;
    projectedPlaces: number;
    projectedPeople: number;
    projectedClues: number;
    projectedRisks: number;
    projectedActions: number;
    omittedHidden: number;
    missingActorRefs: ActorId[];
    missingPlaceRefs: PlaceId[];
    missingOrganizationRefs: OrganizationId[];
  };
}

type VisibleGrayNetworkItem =
  | KnownGrayOrganization
  | GrayNetworkPlaceProjection
  | GrayNetworkPersonProjection
  | GrayNetworkRelationClue;

const confidenceRank: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1
};

function hasProfileContent(profile: GrayNetworkProfile | undefined): profile is GrayNetworkProfile {
  if (!profile) return false;
  return Boolean(
    profile.climate.length ||
      profile.knownOrganizations.length ||
      profile.keyPlaces.length ||
      profile.relatedPeople.length ||
      profile.relationClues.length ||
      profile.actionRisks.length ||
      profile.suggestedActions.length
  );
}

function profileUpdatedTurn(profile: GrayNetworkProfile): number {
  const itemTurns = [
    ...profile.climate.map((item) => item.lastUpdatedTurn),
    ...profile.knownOrganizations.map((item) => item.updatedAtTurn),
    ...profile.keyPlaces.map((item) => item.updatedAtTurn),
    ...profile.relatedPeople.map((item) => item.updatedAtTurn),
    ...profile.relationClues.map((item) => item.updatedAtTurn),
    ...profile.actionRisks.map((item) => item.updatedAtTurn),
    ...profile.suggestedActions.map((item) => item.updatedAtTurn)
  ].filter((turn): turn is number => typeof turn === 'number');

  return Math.max(profile.updatedAtTurn ?? Number.NEGATIVE_INFINITY, ...itemTurns);
}

function selectLatestProfile(state: RuntimeState): GrayNetworkProfile | undefined {
  return Object.values(state.grayNetworks?.byAreaId ?? {})
    .filter(hasProfileContent)
    .sort((left, right) => profileUpdatedTurn(right) - profileUpdatedTurn(left) || left.areaId.localeCompare(right.areaId))[0];
}

function selectProfile(state: RuntimeState): GrayNetworkProfile | undefined {
  const currentAreaId = getCurrentAreaId(state);
  const currentProfile = state.grayNetworks?.byAreaId[currentAreaId];
  if (hasProfileContent(currentProfile)) return currentProfile;

  const currentPlace = state.places[state.location.currentPlaceId];
  const regionProfile = currentPlace?.regionId ? state.grayNetworks?.byAreaId[currentPlace.regionId] : undefined;
  if (hasProfileContent(regionProfile)) return regionProfile;

  return currentProfile ?? regionProfile ?? selectLatestProfile(state);
}

function visibilityForIdentity(visibility: IdentityVisibility, identity: CurrentIdentity): GrayNetworkVisibilityLevel {
  const explicit = visibility[identity];
  if (explicit) return explicit;
  return identity === 'civilian' ? 'hidden' : 'rumor';
}

function isVisibleToIdentity(item: VisibleGrayNetworkItem, identity: CurrentIdentity): boolean {
  return visibilityForIdentity(item.visibility, identity) !== 'hidden';
}

function turnValue(item: { updatedAtTurn?: number; lastUpdatedTurn?: number }): number {
  return item.updatedAtTurn ?? item.lastUpdatedTurn ?? Number.NEGATIVE_INFINITY;
}

function stableId(item: unknown): string {
  const record = item as Record<string, unknown>;
  return String(
    record.organizationId ??
      record.visibleName ??
      record.name ??
      record.placeId ??
      record.actorId ??
      record.clueId ??
      record.riskId ??
      record.actionId ??
      record.key ??
      ''
  );
}

function compareProjected<T extends { confidence?: string; updatedAtTurn?: number; lastUpdatedTurn?: number }>(left: T, right: T): number {
  return (
    turnValue(right) - turnValue(left) ||
    (confidenceRank[right.confidence ?? ''] ?? 0) - (confidenceRank[left.confidence ?? ''] ?? 0) ||
    stableId(left).localeCompare(stableId(right))
  );
}

function takeVisible<T extends VisibleGrayNetworkItem>(
  items: T[],
  identity: CurrentIdentity,
  limit: number
): { selected: T[]; omittedHidden: number } {
  let omittedHidden = 0;
  const selected: T[] = [];

  for (const item of [...items].sort(compareProjected)) {
    if (!isVisibleToIdentity(item, identity)) {
      omittedHidden += 1;
      continue;
    }
    if (selected.length < limit) selected.push(item);
  }

  return { selected, omittedHidden };
}

function takeByIdentity<T extends IdentityProjectedActionRisk | IdentityProjectedSuggestedAction>(
  items: T[],
  identity: CurrentIdentity,
  limit: number
): T[] {
  return [...items]
    .filter((item) => item.identity === identity)
    .sort(compareProjected)
    .slice(0, limit);
}

function uniquePush<T extends string>(target: T[], values: readonly T[], exists: (value: T) => boolean): void {
  for (const value of values) {
    if (!value || exists(value) || target.includes(value)) continue;
    target.push(value);
  }
}

function collectMissingRefs(
  state: RuntimeState,
  organizations: KnownGrayOrganization[],
  places: GrayNetworkPlaceProjection[],
  people: GrayNetworkPersonProjection[],
  clues: GrayNetworkRelationClue[]
): {
  missingActorRefs: ActorId[];
  missingPlaceRefs: PlaceId[];
  missingOrganizationRefs: OrganizationId[];
} {
  const missingActorRefs: ActorId[] = [];
  const missingPlaceRefs: PlaceId[] = [];
  const missingOrganizationRefs: OrganizationId[] = [];

  for (const organization of organizations) {
    if (organization.organizationId) {
      uniquePush(missingOrganizationRefs, [organization.organizationId], (id) => Boolean(state.organizations[id]));
    }
    uniquePush(missingActorRefs, organization.relatedActorIds, (id) => Boolean(state.actors[id]));
    uniquePush(missingPlaceRefs, organization.relatedPlaceIds, (id) => Boolean(state.places[id]));
  }

  for (const place of places) {
    uniquePush(missingPlaceRefs, [place.placeId], (id) => Boolean(state.places[id]));
    uniquePush(missingActorRefs, place.relatedActorIds, (id) => Boolean(state.actors[id]));
    uniquePush(missingOrganizationRefs, place.relatedOrganizationIds, (id) => Boolean(state.organizations[id]));
  }

  for (const person of people) {
    uniquePush(missingActorRefs, [person.actorId], (id) => Boolean(state.actors[id]));
    uniquePush(missingPlaceRefs, person.relatedPlaceIds, (id) => Boolean(state.places[id]));
    uniquePush(missingOrganizationRefs, person.relatedOrganizationIds, (id) => Boolean(state.organizations[id]));
  }

  for (const clue of clues) {
    uniquePush(missingActorRefs, clue.relatedActorIds, (id) => Boolean(state.actors[id]));
    uniquePush(missingPlaceRefs, clue.relatedPlaceIds, (id) => Boolean(state.places[id]));
    uniquePush(missingOrganizationRefs, clue.relatedOrganizationIds, (id) => Boolean(state.organizations[id]));
  }

  return { missingActorRefs, missingPlaceRefs, missingOrganizationRefs };
}

export function projectGrayNetworkContext(state: RuntimeState): GrayNetworkProjection {
  const perspective = state.player.currentIdentity;
  const currentAreaId = getCurrentAreaId(state);
  const profile = selectProfile(state);

  if (!profile) {
    return {
      available: false,
      areaId: currentAreaId,
      areaName: currentAreaId,
      perspective,
      climate: [],
      knownOrganizations: [],
      keyPlaces: [],
      relatedPeople: [],
      relationClues: [],
      actionRisks: [],
      suggestedActions: [],
      diagnostics: {
        sourceAreaId: currentAreaId,
        projectedClimate: 0,
        projectedOrganizations: 0,
        projectedPlaces: 0,
        projectedPeople: 0,
        projectedClues: 0,
        projectedRisks: 0,
        projectedActions: 0,
        omittedHidden: 0,
        missingActorRefs: [],
        missingPlaceRefs: [],
        missingOrganizationRefs: []
      }
    };
  }

  const climate = [...profile.climate].sort(compareProjected).slice(0, MAX_GRAY_NETWORK_CONTEXT_CLIMATE);
  const organizations = takeVisible(profile.knownOrganizations, perspective, MAX_GRAY_NETWORK_CONTEXT_ORGANIZATIONS);
  const places = takeVisible(profile.keyPlaces, perspective, MAX_GRAY_NETWORK_CONTEXT_PLACES);
  const people = takeVisible(profile.relatedPeople, perspective, MAX_GRAY_NETWORK_CONTEXT_PEOPLE);
  const clues = takeVisible(profile.relationClues, perspective, MAX_GRAY_NETWORK_CONTEXT_CLUES);
  const actionRisks = takeByIdentity(profile.actionRisks, perspective, MAX_GRAY_NETWORK_CONTEXT_RISKS);
  const suggestedActions = takeByIdentity(profile.suggestedActions, perspective, MAX_GRAY_NETWORK_CONTEXT_ACTIONS);
  const missingRefs = collectMissingRefs(state, organizations.selected, places.selected, people.selected, clues.selected);

  return {
    available: Boolean(
      climate.length ||
        organizations.selected.length ||
        places.selected.length ||
        people.selected.length ||
        clues.selected.length ||
        actionRisks.length ||
        suggestedActions.length
    ),
    areaId: profile.areaId,
    areaName: profile.areaName,
    perspective,
    climate,
    knownOrganizations: organizations.selected,
    keyPlaces: places.selected,
    relatedPeople: people.selected,
    relationClues: clues.selected,
    actionRisks,
    suggestedActions,
    diagnostics: {
      sourceAreaId: profile.areaId,
      projectedClimate: climate.length,
      projectedOrganizations: organizations.selected.length,
      projectedPlaces: places.selected.length,
      projectedPeople: people.selected.length,
      projectedClues: clues.selected.length,
      projectedRisks: actionRisks.length,
      projectedActions: suggestedActions.length,
      omittedHidden: organizations.omittedHidden + places.omittedHidden + people.omittedHidden + clues.omittedHidden,
      ...missingRefs
    }
  };
}
