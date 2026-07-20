import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Place } from '../runtime/types';
import { createMapViewModel } from './mapViewModel';

function runtimePlace(patch: Partial<Place> & Pick<Place, 'placeId' | 'name'>): Place {
  return {
    placeId: patch.placeId,
    name: patch.name,
    regionId: patch.regionId ?? 'region_kowloon',
    districtId: patch.districtId ?? 'district_mong_kok',
    type: patch.type ?? 'runtime_place',
    category: patch.category ?? 'runtime_scene_place',
    summary: patch.summary ?? 'Runtime place.',
    publicKnowledge: patch.publicKnowledge ?? 'Local people know a little about it.',
    currentState: patch.currentState ?? 'State pending confirmation.',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPressureIds: [],
    source: patch.source ?? 'runtime_generated',
    canonical: patch.canonical ?? false,
    visualAnchor: patch.visualAnchor
  };
}

describe('map view model', () => {
  it('builds drawable points, current point, and unanchored places for the Hong Kong map', () => {
    const state = createInitialRuntimeState();
    state.places.place_unanchored = runtimePlace({
      placeId: 'place_unanchored',
      name: 'Unanchored diner'
    });
    state.places.place_other_map = runtimePlace({
      placeId: 'place_other_map',
      name: 'Other map place',
      visualAnchor: {
        mapId: 'other_map',
        x: 0.2,
        y: 0.2,
        precision: 'approximate'
      }
    });

    const model = createMapViewModel(state);

    expect(model.currentPlace?.placeId).toBe('place_mong_kok_police_station');
    expect(model.selectedPlace?.placeId).toBe('place_mong_kok_police_station');
    expect(model.points.map((point) => point.placeId)).toContain('place_mong_kok_police_station');
    expect(model.points.map((point) => point.placeId)).not.toContain('place_other_map');
    expect(model.currentPoint?.placeId).toBe('place_mong_kok_police_station');
    expect(model.unanchoredPlaces.map((place) => place.placeId)).toEqual(
      expect.arrayContaining(['place_unanchored', 'place_other_map'])
    );
    expect(model.stats.anchored).toBe(model.points.length);
    expect(model.stats.total).toBe(Object.keys(model.placesById).length);
  });

  it('creates a movement hint when latest movement endpoints are drawable', () => {
    const state = createInitialRuntimeState();
    state.map = {
      lastMovement: {
        fromPlaceId: 'place_mong_kok_police_station',
        toPlaceId: 'place_yau_ma_tei_police_station',
        fromSceneId: 'scene_report_room',
        toSceneId: 'scene_yau_ma_tei_report_room',
        turnId: 'turn_0001',
        startedAt: state.time,
        arrivedAt: { ...state.time, minute: state.time.minute + 18 },
        elapsedMinutes: 18
      }
    };
    state.location.currentPlaceId = 'place_yau_ma_tei_police_station';

    const model = createMapViewModel(state);

    expect(model.previousPlace?.placeId).toBe('place_mong_kok_police_station');
    expect(model.movementHint?.fromPoint.placeId).toBe('place_mong_kok_police_station');
    expect(model.movementHint?.toPoint.placeId).toBe('place_yau_ma_tei_police_station');
    expect(model.movementHint?.label).toContain('18');
  });
});
