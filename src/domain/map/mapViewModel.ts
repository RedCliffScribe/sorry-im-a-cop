import type { Place, PlaceId, RuntimeState } from '../runtime/types';
import { HK_1988_MAP_ID } from '../worldpack/hk1988Places';
import { mergeWorldpackPlaces } from './placeRepository';

export interface MapPoint {
  placeId: PlaceId;
  name: string;
  nameEn?: string;
  regionId: string;
  districtId?: string;
  category?: string;
  type: string;
  source?: Place['source'];
  confidence?: Place['confidence'];
  x: number;
  y: number;
  precision: NonNullable<Place['visualAnchor']>['precision'];
  visualKind: 'current' | 'canonical' | 'runtime' | 'ordinary';
  place: Place;
}

export interface MapMovementHint {
  fromPoint: MapPoint;
  toPoint: MapPoint;
  elapsedMinutes?: number;
  label: string;
}

export interface MapViewModel {
  mapId: string;
  placesById: Record<PlaceId, Place>;
  currentPlace?: Place;
  currentPoint?: MapPoint;
  previousPlace?: Place;
  previousPoint?: MapPoint;
  selectedPlace?: Place;
  selectedPoint?: MapPoint;
  points: MapPoint[];
  unanchoredPlaces: Place[];
  movementHint?: MapMovementHint;
  stats: {
    total: number;
    anchored: number;
    runtimeGenerated: number;
    unanchored: number;
  };
}

export interface CreateMapViewModelOptions {
  mapId?: string;
  selectedPlaceId?: string | null;
}

function isDrawablePlace(place: Place, mapId: string): boolean {
  const anchor = place.visualAnchor;
  return Boolean(
    anchor &&
      anchor.mapId === mapId &&
      Number.isFinite(anchor.x) &&
      Number.isFinite(anchor.y) &&
      anchor.x >= 0 &&
      anchor.x <= 1 &&
      anchor.y >= 0 &&
      anchor.y <= 1
  );
}

function pointKind(place: Place, currentPlaceId: PlaceId): MapPoint['visualKind'] {
  if (place.placeId === currentPlaceId) return 'current';
  if (place.source === 'runtime_generated') return 'runtime';
  if (place.canonical || place.source === 'worldpack_canonical') return 'canonical';
  return 'ordinary';
}

function placeToPoint(place: Place, currentPlaceId: PlaceId): MapPoint {
  const anchor = place.visualAnchor;
  if (!anchor) throw new Error(`Place "${place.placeId}" is missing visualAnchor.`);

  return {
    placeId: place.placeId,
    name: place.nameZh ?? place.name,
    nameEn: place.nameEn,
    regionId: place.regionId,
    districtId: place.districtId,
    category: place.category,
    type: place.type,
    source: place.source,
    confidence: place.confidence,
    x: anchor.x,
    y: anchor.y,
    precision: anchor.precision,
    visualKind: pointKind(place, currentPlaceId),
    place
  };
}

function formatMovementLabel(from: MapPoint, to: MapPoint, elapsedMinutes?: number): string {
  return `${from.name} -> ${to.name}${elapsedMinutes === undefined ? '' : `, ${elapsedMinutes} min`}`;
}

export function createMapViewModel(state: RuntimeState, options: CreateMapViewModelOptions = {}): MapViewModel {
  const mapId = options.mapId ?? HK_1988_MAP_ID;
  const placesById = mergeWorldpackPlaces(state.places);
  const places = Object.values(placesById);
  const points = places
    .filter((place) => isDrawablePlace(place, mapId))
    .map((place) => placeToPoint(place, state.location.currentPlaceId));
  const pointById = new Map(points.map((point) => [point.placeId, point]));
  const currentPlace = placesById[state.location.currentPlaceId];
  const currentPoint = pointById.get(state.location.currentPlaceId);
  const selectedPlaceId = options.selectedPlaceId ?? state.location.currentPlaceId;
  const selectedPlace = placesById[selectedPlaceId];
  const selectedPoint = pointById.get(selectedPlaceId);
  const lastMovement = state.map.lastMovement;
  const previousPlace = lastMovement ? placesById[lastMovement.fromPlaceId] : undefined;
  const previousPoint = lastMovement ? pointById.get(lastMovement.fromPlaceId) : undefined;
  const movementToPoint = lastMovement ? pointById.get(lastMovement.toPlaceId) : undefined;
  const movementHint: MapMovementHint | undefined =
    lastMovement && previousPoint && movementToPoint
      ? {
          fromPoint: previousPoint,
          toPoint: movementToPoint,
          elapsedMinutes: lastMovement.elapsedMinutes,
          label: formatMovementLabel(previousPoint, movementToPoint, lastMovement.elapsedMinutes)
        }
      : undefined;

  return {
    mapId,
    placesById,
    currentPlace,
    currentPoint,
    previousPlace,
    previousPoint,
    selectedPlace,
    selectedPoint,
    points,
    unanchoredPlaces: places.filter((place) => !isDrawablePlace(place, mapId)),
    movementHint,
    stats: {
      total: places.length,
      anchored: points.length,
      runtimeGenerated: places.filter((place) => place.source === 'runtime_generated').length,
      unanchored: places.length - points.length
    }
  };
}
