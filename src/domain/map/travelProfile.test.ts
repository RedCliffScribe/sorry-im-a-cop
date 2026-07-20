import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Place } from '../runtime/types';
import type { VehicleAsset } from '../runtime/types';
import { estimateTravelReference, estimateTravelReferences } from './travelProfile';

function place(overrides: Partial<Place>): Place {
  return {
    placeId: overrides.placeId ?? 'place_a',
    name: overrides.name ?? '地点A',
    regionId: overrides.regionId ?? 'region_kowloon',
    districtId: overrides.districtId ?? 'district_mong_kok',
    type: overrides.type ?? 'street',
    category: overrides.category,
    summary: overrides.summary ?? '测试地点。',
    publicKnowledge: overrides.publicKnowledge ?? '测试公开认知。',
    currentState: overrides.currentState ?? '测试状态。',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPressureIds: [],
    ...overrides
  };
}

describe('travel profile estimator', () => {
  it('estimates a bounded walking range from normalized place anchors', () => {
    const from = place({
      placeId: 'place_mong_kok_police_station',
      name: '旺角警署',
      districtId: 'district_mong_kok',
      visualAnchor: { mapId: 'hk_1988_main', x: 0.55, y: 0.43, precision: 'approximate' }
    });
    const to = place({
      placeId: 'place_yau_ma_tei_police_station',
      name: '油麻地警署',
      districtId: 'district_yau_ma_tei',
      visualAnchor: { mapId: 'hk_1988_main', x: 0.54, y: 0.46, precision: 'approximate' }
    });

    const reference = estimateTravelReference(from, to, 'walk');

    expect(reference).toMatchObject({
      fromPlaceId: 'place_mong_kok_police_station',
      toPlaceId: 'place_yau_ma_tei_police_station',
      mode: 'walk',
      confidence: 'medium'
    });
    expect(reference?.minMinutes).toBeGreaterThanOrEqual(10);
    expect(reference?.maxMinutes).toBeLessThanOrEqual(35);
    expect(reference?.reason).toContain('同一区域');
  });

  it('adds cross-harbour cost for Kowloon to Hong Kong Island movement', () => {
    const from = place({
      placeId: 'place_mong_kok_police_station',
      name: '旺角警署',
      regionId: 'region_kowloon',
      districtId: 'district_mong_kok',
      visualAnchor: { mapId: 'hk_1988_main', x: 0.55, y: 0.43, precision: 'approximate' }
    });
    const to = place({
      placeId: 'place_wan_chai_police_headquarters',
      name: '湾仔警察总部',
      regionId: 'region_hong_kong_island',
      districtId: 'district_wan_chai',
      visualAnchor: { mapId: 'hk_1988_main', x: 0.5, y: 0.62, precision: 'approximate' }
    });

    const walk = estimateTravelReference(from, to, 'walk');
    const taxi = estimateTravelReference(from, to, 'taxi');

    expect(walk?.reason).toContain('过海');
    expect(taxi?.reason).toContain('过海');
    expect(walk?.minMinutes).toBeGreaterThan(35);
    expect(taxi?.minMinutes).toBeGreaterThanOrEqual(20);
  });

  it('returns compact candidate modes when no movement mode is specified', () => {
    const from = place({
      placeId: 'place_a',
      name: '地点A',
      visualAnchor: { mapId: 'hk_1988_main', x: 0.55, y: 0.43, precision: 'approximate' }
    });
    const to = place({
      placeId: 'place_b',
      name: '地点B',
      visualAnchor: { mapId: 'hk_1988_main', x: 0.53, y: 0.53, precision: 'approximate' }
    });

    const references = estimateTravelReferences(from, to);

    expect(references.map((reference) => reference.mode)).toEqual(['walk', 'taxi']);
    expect(references).toHaveLength(2);
  });

  it('does not estimate travel time without compatible visual anchors', () => {
    const from = place({ placeId: 'place_a', name: '地点A' });
    const to = place({
      placeId: 'place_b',
      name: '地点B',
      visualAnchor: { mapId: 'hk_1988_main', x: 0.53, y: 0.53, precision: 'approximate' }
    });

    expect(estimateTravelReference(from, to, 'walk')).toBeNull();
    expect(estimateTravelReferences(from, to)).toEqual([]);
  });

  it('shortens emergency police vehicle references while preserving risk notes', () => {
    const state = createInitialRuntimeState();
    const from = state.places.place_mong_kok_police_station;
    const to = state.places.place_yau_ma_tei_police_station;

    const normal = estimateTravelReferences(from, to, 'patrolCar')[0];
    const emergency = estimateTravelReferences(from, to, 'patrolCar', {
      urgency: 'emergency'
    })[0];

    expect(emergency.maxMinutes).toBeLessThanOrEqual(normal.maxMinutes);
    expect(emergency.urgency).toBe('emergency');
    expect(emergency.riskNote).toContain('emergency');
  });

  it('applies available vehicle mobility multiplier to compatible movement', () => {
    const state = createInitialRuntimeState();
    const from = state.places.place_mong_kok_police_station;
    const to = state.places.place_yau_ma_tei_police_station;
    const motorcycle: VehicleAsset = {
      itemId: 'asset_motorcycle',
      category: 'vehicle',
      vehicleType: 'motorcycle',
      holdingRelation: 'owned',
      condition: 'usable',
      name: 'Old motorcycle',
      summary: 'The motorcycle the player commonly uses.',
      locationSummary: 'Parked near the station.',
      accessSummary: 'Available to the player.',
      mobilityProfile: {
        mode: 'motorcycle',
        timeMultiplier: 0.7,
        availabilitySummary: 'Useful for short and medium trips.'
      },
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      visibility: 'player_known',
      importance: 60,
      incomeSettlementItemIds: [],
      expenseSettlementItemIds: []
    };

    const taxi = estimateTravelReferences(from, to, 'taxi')[0];
    const withMotorcycle = estimateTravelReferences(from, to, 'taxi', {
      vehicle: motorcycle
    })[0];

    expect(withMotorcycle.maxMinutes).toBeLessThanOrEqual(taxi.maxMinutes);
    expect(withMotorcycle.reason).toContain('Old motorcycle');
  });
});
