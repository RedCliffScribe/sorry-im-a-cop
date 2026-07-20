import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { VehicleAsset } from '../runtime/types';
import { projectMapContext } from './mapContextProjector';

describe('map context projection', () => {
  it('projects a bounded current-area map slice instead of the full place database', () => {
    const state = createInitialRuntimeState();
    const projection = projectMapContext(state, '去尖沙咀天星码头看看', { limit: 6 });

    const projectedIds = projection.places.map((place) => place.placeId);
    expect(projectedIds).toContain('place_mong_kok_police_station');
    expect(projectedIds).toContain('place_tsim_sha_tsui_star_ferry_pier');
    expect(projectedIds.length).toBeLessThan(Object.keys(state.places).length);
    expect(projectedIds.length).toBeLessThanOrEqual(6);
    expect(projection.diagnostics.totalPlaces).toBeGreaterThan(projectedIds.length);
  });

  it('keeps runtime generated places available when they are local or mentioned', () => {
    const state = createInitialRuntimeState();
    state.places.place_runtime_back_alley = {
      placeId: 'place_runtime_back_alley',
      name: '金星游戏机中心后巷',
      regionId: 'region_kowloon',
      districtId: 'district_mong_kok',
      type: 'alley',
      category: 'runtime_scene_place',
      summary: '一次盘问后由剧情固定下来的后巷。',
      publicKnowledge: '附近街坊知道这里夜里常有人聚集。',
      currentState: '地面潮湿，墙边堆着纸箱。',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPressureIds: [],
      source: 'runtime_generated',
      canonical: false,
      confidence: 'medium',
      visualAnchor: {
        mapId: 'hk_1988_main',
        x: 0.49,
        y: 0.39,
        precision: 'approximate',
        source: 'runtime_inferred',
        basisPlaceIds: ['place_mong_kok_police_station']
      }
    };

    const projection = projectMapContext(state, '回到金星游戏机中心后巷', { limit: 5 });

    expect(projection.places.map((place) => place.placeId)).toContain('place_runtime_back_alley');
  });

  it('projects compact travel references only for mentioned destination places', () => {
    const state = createInitialRuntimeState();

    const projection = projectMapContext(state, '步行去油麻地警署看看', { limit: 6 });

    expect(projection.travelReferences.length).toBeGreaterThan(0);
    expect(projection.travelReferences[0]).toMatchObject({
      fromPlaceId: 'place_mong_kok_police_station',
      toPlaceId: 'place_yau_ma_tei_police_station',
      mode: 'walk'
    });
    expect(projection.travelReferences.length).toBeLessThanOrEqual(3);
  });

  it('omits travel references when player input does not identify a destination', () => {
    const state = createInitialRuntimeState();

    const projection = projectMapContext(state, '看看报案室里有没有熟人', { limit: 6 });

    expect(projection.travelReferences).toEqual([]);
  });

  it('passes urgency and available vehicle context into compact travel references', () => {
    const state = createInitialRuntimeState();
    const policeCar: VehicleAsset = {
      itemId: 'asset_police_car',
      category: 'vehicle',
      vehicleType: 'policeVehicle',
      holdingRelation: 'assigned',
      condition: 'usable',
      name: 'Station patrol car',
      summary: 'A patrol car available during duty.',
      locationSummary: 'Parked near Mong Kok Police Station.',
      accessSummary: 'Available for duty movement.',
      mobilityProfile: {
        mode: 'policeVehicle',
        timeMultiplier: 0.82,
        availabilitySummary: 'Suitable for emergency police movement.'
      },
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: ['place_mong_kok_police_station'],
      visibility: 'player_known',
      importance: 70,
      incomeSettlementItemIds: [],
      expenseSettlementItemIds: []
    };
    state.assets.items[policeCar.itemId] = policeCar;

    const projection = projectMapContext(state, 'Drive the police car emergency to Yau Ma Tei Police Station', {
      limit: 6
    });

    expect(projection.travelReferences[0]).toMatchObject({
      toPlaceId: 'place_yau_ma_tei_police_station',
      mode: 'patrolCar',
      urgency: 'emergency'
    });
    expect(projection.travelReferences[0].reason).toContain('Station patrol car');
    expect(projection.travelReferences[0].riskNote).toContain('emergency');
  });
});
