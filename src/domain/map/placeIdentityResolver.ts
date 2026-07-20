import type { Place, PlaceId } from '../runtime/types';

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function placeLookupTexts(place: Place): string[] {
  return [place.name, place.nameZh, place.nameEn, ...(place.aliases ?? []), place.streetAddressText]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeText);
}

function rankPlace(place: Place): number {
  let score = 0;
  if (place.canonical) score += 100;
  if (place.source === 'worldpack_canonical') score += 40;
  if (place.confidence === 'high') score += 10;
  if (place.confidence === 'medium') score += 5;
  return score;
}

export function resolvePlaceReference(reference: string | undefined, places: Record<PlaceId, Place>): Place | undefined {
  const normalizedReference = reference ? normalizeText(reference) : '';
  if (!normalizedReference) return undefined;

  const candidates = Object.values(places).filter((place) => placeLookupTexts(place).includes(normalizedReference));
  if (candidates.length === 0) return undefined;

  return candidates.sort((left, right) => rankPlace(right) - rankPlace(left) || left.placeId.localeCompare(right.placeId))[0];
}
