import { hk1988WorldpackPlaces } from '../worldpack/hk1988Places';
import type { Place, PlaceId } from '../runtime/types';

function mergeUnique<T extends string>(left: T[] | undefined, right: T[] | undefined): T[] {
  return Array.from(new Set([...(left ?? []), ...(right ?? [])]));
}

function clonePlace(place: Place): Place {
  return {
    ...place,
    aliases: [...(place.aliases ?? [])],
    roadAnchors: [...(place.roadAnchors ?? [])],
    relatedActorIds: [...place.relatedActorIds],
    relatedCaseIds: [...place.relatedCaseIds],
    relatedPressureIds: [...place.relatedPressureIds],
    visualAnchor: place.visualAnchor
      ? {
          ...place.visualAnchor,
          basisPlaceIds: [...(place.visualAnchor.basisPlaceIds ?? [])]
        }
      : undefined
  };
}

function mergePlace(canonical: Place, existing: Place | undefined): Place {
  if (!existing) return clonePlace(canonical);

  return {
    ...canonical,
    ...existing,
    nameZh: existing.nameZh ?? canonical.nameZh,
    nameEn: existing.nameEn ?? canonical.nameEn,
    aliases: mergeUnique(canonical.aliases, existing.aliases),
    districtId: existing.districtId ?? canonical.districtId,
    category: existing.category ?? canonical.category,
    streetAddressText: existing.streetAddressText ?? canonical.streetAddressText,
    roadAnchors: mergeUnique(canonical.roadAnchors, existing.roadAnchors),
    playerKnownSummary: existing.playerKnownSummary ?? canonical.playerKnownSummary,
    canonical: existing.canonical ?? canonical.canonical,
    source: existing.source ?? canonical.source,
    confidence: existing.confidence ?? canonical.confidence,
    historicalNote: existing.historicalNote ?? canonical.historicalNote,
    researchNote: existing.researchNote ?? canonical.researchNote,
    relatedActorIds: mergeUnique(canonical.relatedActorIds, existing.relatedActorIds),
    relatedCaseIds: mergeUnique(canonical.relatedCaseIds, existing.relatedCaseIds),
    relatedPressureIds: mergeUnique(canonical.relatedPressureIds, existing.relatedPressureIds),
    visualAnchor: existing.visualAnchor ?? canonical.visualAnchor
  };
}

export function mergeWorldpackPlaces(
  existingPlaces: Record<PlaceId, Place> = {},
  worldpackPlaces: Place[] = hk1988WorldpackPlaces
): Record<PlaceId, Place> {
  const places: Record<PlaceId, Place> = Object.fromEntries(
    Object.entries(existingPlaces).map(([placeId, place]) => [placeId, clonePlace(place)])
  );

  for (const canonicalPlace of worldpackPlaces) {
    places[canonicalPlace.placeId] = mergePlace(canonicalPlace, places[canonicalPlace.placeId]);
  }

  return places;
}
