import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { resolvePlaceReference } from './placeIdentityResolver';
import { mergeWorldpackPlaces } from './placeRepository';

describe('place identity resolver', () => {
  it('resolves Chinese names, English names, and local aliases to the same canonical place', () => {
    const state = createInitialRuntimeState();
    const places = mergeWorldpackPlaces(state.places);

    expect(resolvePlaceReference('旺角警署', places)?.placeId).toBe('place_mong_kok_police_station');
    expect(resolvePlaceReference('Mong Kok Police Station', places)?.placeId).toBe('place_mong_kok_police_station');
    expect(resolvePlaceReference('旺角差馆', places)?.placeId).toBe('place_mong_kok_police_station');
  });

  it('prefers an existing canonical place over a runtime duplicate with the same name', () => {
    const state = createInitialRuntimeState();
    const places = mergeWorldpackPlaces({
      ...state.places,
      place_runtime_duplicate_mong_kok: {
        ...state.places.place_mong_kok_police_station,
        placeId: 'place_runtime_duplicate_mong_kok',
        name: '旺角警署',
        source: 'runtime_generated',
        canonical: false
      }
    });

    expect(resolvePlaceReference('旺角警署', places)?.placeId).toBe('place_mong_kok_police_station');
  });
});
