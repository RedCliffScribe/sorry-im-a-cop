import { describe, expect, it } from 'vitest';
import { HK_1988_MAP_ID, hk1988WorldpackPlaces } from './hk1988Places';

describe('HK 1988 worldpack places', () => {
  it('ships stable canonical places with unique ids and valid visual anchors', () => {
    const placeIds = hk1988WorldpackPlaces.map((place) => place.placeId);
    expect(new Set(placeIds).size).toBe(placeIds.length);
    expect(placeIds).toContain('place_mong_kok_police_station');
    expect(placeIds).toContain('place_wan_chai_police_headquarters');
    expect(placeIds).toContain('place_broadcast_drive');
    expect(placeIds).toContain('place_tsim_sha_tsui_star_ferry_pier');
    expect(placeIds.length).toBeGreaterThanOrEqual(80);
    expect(placeIds).toEqual(
      expect.arrayContaining([
        'place_central_police_station',
        'place_supreme_court_building',
        'place_hsbc_main_building',
        'place_exchange_square',
        'place_tv_city_clear_water_bay',
        'place_lan_kwai_fong',
        'place_kwun_tong_industrial_area',
        'place_kwai_chung_container_terminal',
        'place_queen_elizabeth_hospital',
        'place_kai_tak_airport',
        'place_happy_valley_racecourse',
        'place_chungking_mansions',
        'place_repulse_bay'
      ])
    );

    const categories = Array.from(new Set(hk1988WorldpackPlaces.map((place) => place.category)));
    expect(categories).toEqual(
      expect.arrayContaining([
        'police',
        'government_legal',
        'finance_commercial',
        'media_entertainment',
        'industrial_logistics',
        'street_life',
        'healthcare',
        'transport_landmark',
        'civic_landmark'
      ])
    );

    for (const place of hk1988WorldpackPlaces) {
      expect(place.source).toBe('worldpack_canonical');
      expect(place.canonical).toBe(true);
      expect(place.regionId).toMatch(/^region_/);
      expect(place.districtId).toMatch(/^district_/);
      expect(place.visualAnchor?.mapId).toBe(HK_1988_MAP_ID);
      expect(place.visualAnchor?.x).toBeGreaterThanOrEqual(0);
      expect(place.visualAnchor?.x).toBeLessThanOrEqual(1);
      expect(place.visualAnchor?.y).toBeGreaterThanOrEqual(0);
      expect(place.visualAnchor?.y).toBeLessThanOrEqual(1);
    }
  });
});
