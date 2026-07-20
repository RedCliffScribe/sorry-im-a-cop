import type {
  AreaId,
  GrayNetworkClimateItem,
  GrayNetworkPersonProjection,
  GrayNetworkPlaceProjection,
  GrayNetworkProfile,
  GrayNetworkRelationClue,
  GrayNetworksState,
  IdentityProjectedActionRisk,
  IdentityProjectedSuggestedAction,
  KnownGrayOrganization,
  RuntimeState
} from '../runtime/types';

export interface GrayNetworkRemoveIds {
  climateKeys?: string[];
  organizationIds?: string[];
  organizationKeys?: string[];
  placeIds?: string[];
  actorIds?: string[];
  clueIds?: string[];
  riskIds?: string[];
  actionIds?: string[];
  suggestedActionIds?: string[];
}

export interface GrayNetworkPatch {
  areaId?: AreaId;
  areaName?: string;
  climate?: GrayNetworkClimateItem[];
  knownOrganizations?: KnownGrayOrganization[];
  keyPlaces?: GrayNetworkPlaceProjection[];
  relatedPeople?: GrayNetworkPersonProjection[];
  relationClues?: GrayNetworkRelationClue[];
  actionRisks?: IdentityProjectedActionRisk[];
  suggestedActions?: IdentityProjectedSuggestedAction[];
  removeIds?: GrayNetworkRemoveIds;
}

type TurnGetter<T> = (item: T) => number | undefined;
type KeyGetter<T> = (item: T) => string;

const LIMITS = {
  climate: 12,
  knownOrganizations: 20,
  keyPlaces: 20,
  relatedPeople: 30,
  relationClues: 30,
  actionRisks: 12,
  suggestedActions: 8
} as const;

export function createInitialGrayNetworks(): GrayNetworksState {
  return { byAreaId: {} };
}

export function getCurrentAreaId(state: RuntimeState): AreaId {
  const currentPlaceId = state.location.currentPlaceId;
  const currentPlace = state.places[currentPlaceId];
  return currentPlace?.districtId || currentPlace?.regionId || currentPlaceId || 'area_unknown';
}

export function getCurrentAreaName(state: RuntimeState): string {
  const areaId = getCurrentAreaId(state);
  const currentPlace = state.places[state.location.currentPlaceId];
  return currentPlace?.districtId || currentPlace?.regionId || currentPlace?.nameZh || currentPlace?.name || areaId;
}

export function applyGrayNetworkPatch(state: RuntimeState, patch: GrayNetworkPatch): RuntimeState {
  const areaId = patch.areaId || getCurrentAreaId(state);
  const grayNetworks = state.grayNetworks ?? createInitialGrayNetworks();
  const existingProfile = grayNetworks.byAreaId[areaId];
  const areaName = patch.areaName ?? existingProfile?.areaName ?? (patch.areaId ? areaId : getCurrentAreaName(state));
  const profile = existingProfile ?? createEmptyProfile(areaId, areaName, state);
  const removeIds = patch.removeIds ?? {};

  const nextProfile: GrayNetworkProfile = {
    ...profile,
    areaName,
    updatedAtTurn: state.turnCounter,
    updatedAtTime: cloneTime(state.time),
    climate: upsertAndClamp(
      profile.climate.filter((item) => !removeIds.climateKeys?.includes(item.key)),
      patch.climate ?? [],
      (item) => item.key,
      (item) => item.lastUpdatedTurn,
      LIMITS.climate
    ),
    knownOrganizations: upsertAndClamp(
      profile.knownOrganizations.filter((item) => {
        const key = getOrganizationKey(item);
        return !removeIds.organizationIds?.includes(item.organizationId ?? '') && !removeIds.organizationKeys?.includes(key);
      }),
      patch.knownOrganizations ?? [],
      getOrganizationKey,
      (item) => item.updatedAtTurn,
      LIMITS.knownOrganizations
    ),
    keyPlaces: upsertAndClamp(
      profile.keyPlaces.filter((item) => !removeIds.placeIds?.includes(item.placeId)),
      patch.keyPlaces ?? [],
      (item) => item.placeId,
      (item) => item.updatedAtTurn,
      LIMITS.keyPlaces
    ),
    relatedPeople: upsertAndClamp(
      profile.relatedPeople.filter((item) => !removeIds.actorIds?.includes(item.actorId)),
      patch.relatedPeople ?? [],
      (item) => item.actorId,
      (item) => item.updatedAtTurn,
      LIMITS.relatedPeople
    ),
    relationClues: upsertAndClamp(
      profile.relationClues.filter((item) => !removeIds.clueIds?.includes(item.clueId)),
      patch.relationClues ?? [],
      (item) => item.clueId,
      (item) => item.updatedAtTurn,
      LIMITS.relationClues
    ),
    actionRisks: upsertAndClamp(
      profile.actionRisks.filter((item) => !removeIds.riskIds?.includes(item.riskId)),
      patch.actionRisks ?? [],
      (item) => item.riskId,
      (item) => item.updatedAtTurn,
      LIMITS.actionRisks
    ),
    suggestedActions: upsertAndClamp(
      profile.suggestedActions.filter(
        (item) => !removeIds.actionIds?.includes(item.actionId) && !removeIds.suggestedActionIds?.includes(item.actionId)
      ),
      patch.suggestedActions ?? [],
      (item) => item.actionId,
      (item) => item.updatedAtTurn,
      LIMITS.suggestedActions
    )
  };

  return {
    ...state,
    grayNetworks: {
      byAreaId: {
        ...grayNetworks.byAreaId,
        [areaId]: nextProfile
      }
    }
  };
}

function createEmptyProfile(areaId: AreaId, areaName: string, state: RuntimeState): GrayNetworkProfile {
  return {
    areaId,
    areaName,
    updatedAtTurn: state.turnCounter,
    updatedAtTime: cloneTime(state.time),
    climate: [],
    knownOrganizations: [],
    keyPlaces: [],
    relatedPeople: [],
    relationClues: [],
    actionRisks: [],
    suggestedActions: []
  };
}

function upsertAndClamp<T>(
  existing: T[],
  incoming: T[],
  getKey: KeyGetter<T>,
  getTurn: TurnGetter<T>,
  limit: number
): T[] {
  const byKey = new Map<string, T>();
  const orderByKey = new Map<string, number>();

  existing.forEach((item, index) => {
    const key = getKey(item);
    byKey.set(key, item);
    orderByKey.set(key, index);
  });

  incoming.forEach((item, index) => {
    const key = getKey(item);
    byKey.set(key, item);
    orderByKey.set(key, existing.length + index);
  });

  return [...byKey.values()]
    .sort((left, right) => {
      const rightTurn = getTurn(right) ?? Number.NEGATIVE_INFINITY;
      const leftTurn = getTurn(left) ?? Number.NEGATIVE_INFINITY;
      if (rightTurn !== leftTurn) return rightTurn - leftTurn;
      return (orderByKey.get(getKey(left)) ?? 0) - (orderByKey.get(getKey(right)) ?? 0);
    })
    .slice(0, limit);
}

function getOrganizationKey(organization: KnownGrayOrganization): string {
  return organization.organizationId || organization.visibleName || organization.name;
}

function cloneTime<T extends object>(time: T): T {
  return { ...time };
}
