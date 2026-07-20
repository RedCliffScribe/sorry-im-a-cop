import type { AssetItem, Place, PlaceId, RuntimeState, VehicleAsset } from '../runtime/types';
import { mergeWorldpackPlaces } from './placeRepository';
import { estimateTravelReferences, type TravelMode, type TravelReference, type TravelUrgency } from './travelProfile';

export interface MapContextProjectionEntry {
  place: Place;
  score: number;
  reasons: Array<'current_place' | 'same_district' | 'same_region' | 'input_match' | 'canonical_anchor'>;
}

export interface MapContextProjection {
  places: Place[];
  entries: MapContextProjectionEntry[];
  travelReferences: TravelReference[];
  diagnostics: {
    totalPlaces: number;
    selectedPlaceIds: PlaceId[];
    omittedPlaceCount: number;
  };
}

export interface MapContextProjectionOptions {
  limit?: number;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function placeSearchText(place: Place): string {
  return [
    place.placeId,
    place.name,
    place.nameZh,
    place.nameEn,
    ...(place.aliases ?? []),
    place.regionId,
    place.districtId,
    place.type,
    place.category,
    place.streetAddressText,
    ...(place.roadAnchors ?? []),
    place.summary,
    place.publicKnowledge,
    place.currentState
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeText)
    .join(' ');
}

function inputMatchesPlace(playerInput: string, place: Place): boolean {
  const normalizedInput = normalizeText(playerInput);
  if (!normalizedInput) return false;

  const directNames = [place.name, place.nameZh, place.nameEn, ...(place.aliases ?? []), ...(place.roadAnchors ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeText);
  if (directNames.some((value) => normalizedInput.includes(value))) return true;

  return placeSearchText(place).includes(normalizedInput);
}

function inferTravelMode(playerInput: string): TravelMode | undefined {
  const normalizedInput = normalizeText(playerInput);
  if (!normalizedInput) return undefined;
  if (/(police car|patrol car|police vehicle|siren)/iu.test(normalizedInput)) return 'patrolCar';
  if (/(walk|on foot)/iu.test(normalizedInput)) return 'walk';
  if (/(mtr|metro|subway|train)/iu.test(normalizedInput)) return 'mtr';
  if (/(ferry|boat|pier)/iu.test(normalizedInput)) return 'ferry';
  if (/(taxi|cab|drive|car)/iu.test(normalizedInput)) return 'taxi';
  if (/(步行|走路|行过去|行去|徒步)/u.test(normalizedInput)) return 'walk';
  if (/(警车|冲锋车|巡逻车)/u.test(normalizedInput)) return 'patrolCar';
  if (/(地铁|港铁|mtr)/iu.test(normalizedInput)) return 'mtr';
  if (/(天星|渡轮|小轮|码头|ferry)/iu.test(normalizedInput)) return 'ferry';
  if (/(的士|出租|坐车|驾车|开车|车程)/u.test(normalizedInput)) return 'taxi';
  return undefined;
}

function inferTravelUrgency(playerInput: string): TravelUrgency {
  const normalizedInput = normalizeText(playerInput);
  if (/(emergency|urgent|rush|sirens?|lights|code\s*3|绱ф€|鐏€|椋炶溅|鎷夎绗?)/iu.test(normalizedInput)) {
    return 'emergency';
  }
  if (/(hurry|quickly|asap|fast|尽快|快点|赶路)/iu.test(normalizedInput)) return 'hurried';
  return 'normal';
}

function isVehicleAsset(item: AssetItem): item is VehicleAsset {
  return item.category === 'vehicle';
}

function vehicleMatchesMode(vehicle: VehicleAsset, mode: TravelMode | undefined): boolean {
  if (!mode || vehicle.condition === 'broken' || !vehicle.mobilityProfile) return false;
  const mobilityMode = vehicle.mobilityProfile.mode;
  if (mode === 'patrolCar') return mobilityMode === 'policeVehicle';
  if (mode === 'taxi') return ['car', 'motorcycle', 'taxi', 'policeVehicle'].includes(mobilityMode);
  if (mode === 'ferry') return mobilityMode === 'boat';
  if (mode === 'mtr') return mobilityMode === 'publicTransit';
  return false;
}

function selectVehicleForMode(state: RuntimeState, mode: TravelMode | undefined): VehicleAsset | undefined {
  return Object.values(state.assets.items)
    .filter(isVehicleAsset)
    .filter((vehicle) => vehicleMatchesMode(vehicle, mode))
    .sort((left, right) => right.importance - left.importance || left.itemId.localeCompare(right.itemId))[0];
}

function scorePlace(place: Place, state: RuntimeState, playerInput: string): MapContextProjectionEntry {
  let score = 0;
  const reasons: MapContextProjectionEntry['reasons'] = [];
  const currentPlace = state.places[state.location.currentPlaceId];

  if (place.placeId === state.location.currentPlaceId) {
    score += 1000;
    reasons.push('current_place');
  }
  if (currentPlace?.districtId && place.districtId === currentPlace.districtId && place.placeId !== currentPlace.placeId) {
    score += 160;
    reasons.push('same_district');
  }
  if (currentPlace?.regionId && place.regionId === currentPlace.regionId && place.placeId !== currentPlace.placeId) {
    score += 80;
    reasons.push('same_region');
  }
  if (inputMatchesPlace(playerInput, place)) {
    score += 620;
    reasons.push('input_match');
  }
  if (place.canonical && ['police', 'transport_landmark', 'media_entertainment', 'landmark_pressure_zone'].includes(place.category ?? '')) {
    score += 12;
    reasons.push('canonical_anchor');
  }

  return { place, score, reasons };
}

export function projectMapContext(
  state: RuntimeState,
  playerInput: string,
  options: MapContextProjectionOptions = {}
): MapContextProjection {
  const limit = options.limit ?? 8;
  const allPlaces = mergeWorldpackPlaces(state.places);
  const scoredPlaces = Object.values(allPlaces)
    .map((place) => scorePlace(place, { ...state, places: allPlaces }, playerInput))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.place.canonical ?? false) - Number(left.place.canonical ?? false) ||
        left.place.placeId.localeCompare(right.place.placeId)
    );

  const entries = scoredPlaces.slice(0, Math.max(1, limit));
  const currentPlace = allPlaces[state.location.currentPlaceId];
  const inferredMode = inferTravelMode(playerInput);
  const travelUrgency = inferTravelUrgency(playerInput);
  const vehicle = selectVehicleForMode(state, inferredMode);
  const travelReferences = currentPlace
    ? entries
        .filter((entry) => entry.place.placeId !== currentPlace.placeId && entry.reasons.includes('input_match'))
        .flatMap((entry) =>
          estimateTravelReferences(currentPlace, entry.place, inferredMode, {
            urgency: travelUrgency,
            vehicle
          })
        )
        .slice(0, 3)
    : [];

  return {
    entries,
    places: entries.map((entry) => entry.place),
    travelReferences,
    diagnostics: {
      totalPlaces: Object.keys(allPlaces).length,
      selectedPlaceIds: entries.map((entry) => entry.place.placeId),
      omittedPlaceCount: Math.max(0, Object.keys(allPlaces).length - entries.length)
    }
  };
}
