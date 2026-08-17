import { describe, expect, it } from 'vitest';
import { DefaultAvgResourceResolver } from '../avgResourcePack';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { StoryEntry } from '../runtime/types';
import { hk1988WorldpackPlaces } from '../worldpack/hk1988Places';
import { resolveAvgScene } from './sceneResolver';
import { fixturePack, fixtureScene } from './testFixtures';

function storyEntry(): StoryEntry {
  const state = createInitialRuntimeState();
  return {
    turnId: 'turn_scene_test',
    speaker: 'narrator',
    text: '【旁白】场景测试。',
    gameTime: state.time
  };
}

describe('AVG scene resolver', () => {
  it('prefers exact runtime scene and place identifiers before structural tags', () => {
    const state = createInitialRuntimeState();
    const currentSceneId = state.location.currentSceneId!;
    const currentPlaceId = state.location.currentPlaceId;
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({ sceneAssetId: 'exact_scene', runtimeSceneIds: [currentSceneId], tags: ['police', 'office'] }),
          fixtureScene({ sceneAssetId: 'exact_place', runtimePlaceIds: [currentPlaceId], tags: ['police', 'office'], priority: 999 }),
          fixtureScene({ sceneAssetId: 'tag_only', tags: ['police', 'office'], priority: 9999 })
        ]
      })
    });

    expect(resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state }).scene)
      .toMatchObject({ sceneAssetId: 'exact_scene', matchType: 'runtime_scene_id' });

    state.location.currentSceneId = undefined;
    expect(resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state }).scene)
      .toMatchObject({ sceneAssetId: 'exact_place', matchType: 'runtime_place_id' });
  });

  it('scores compatible specific scenes above generic scenes deterministically', () => {
    const state = createInitialRuntimeState();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_unknown';
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({ sceneAssetId: 'specific_cid_office', tags: ['police', 'cid', 'office'], priority: 100 }),
          fixtureScene({ sceneAssetId: 'generic_business_office', tags: ['business', 'office'], reusePolicy: 'generic', priority: 500 })
        ]
      })
    });
    const input = {
      resolver,
      storyEntry: storyEntry(),
      runtimeState: state,
      sceneInput: { tags: ['police', 'cid', 'office'] }
    };

    expect(resolveAvgScene(input).scene).toMatchObject({
      sceneAssetId: 'specific_cid_office',
      matchType: 'tag_match'
    });
    expect(resolveAvgScene(input)).toEqual(resolveAvgScene(input));
  });

  it('does not turn the only generic business office into a universal fallback', () => {
    const state = createInitialRuntimeState();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_unknown_dock';
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({
            sceneAssetId: 'generic_business_office',
            tags: ['business', 'office', 'interior'],
            reusePolicy: 'generic'
          })
        ]
      })
    });

    const result = resolveAvgScene({
      resolver,
      storyEntry: storyEntry(),
      runtimeState: state,
      sceneInput: { tags: ['harbour', 'dock', 'outdoor'] }
    });
    expect(result.scene).toBeNull();
    expect(result.diagnostic.fallbackReason).toBe('no-compatible-scene');
  });

  it('uses the canonical district anchor to keep Portland Street in Mong Kok instead of Causeway Bay', () => {
    const state = createInitialRuntimeState();
    const portlandStreet = hk1988WorldpackPlaces.find(
      (place) => place.placeId === 'place_portland_street'
    );
    expect(portlandStreet).toBeDefined();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_portland_street';
    state.places.place_portland_street = portlandStreet!;
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({
            sceneAssetId: 'causeway_bay_commercial_street',
            tags: ['district', 'causeway', 'bay', 'commercial', 'street', 'hong_kong'],
            priority: 100
          }),
          fixtureScene({
            sceneAssetId: 'mong_kok_dense_street',
            tags: ['district', 'mong', 'kok', 'dense', 'street', 'hong_kong'],
            priority: 100
          })
        ]
      })
    });

    const result = resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state });

    expect(result.scene).toMatchObject({
      sceneAssetId: 'mong_kok_dense_street',
      matchType: 'tag_match'
    });
    expect(result.diagnostic.inputTags).toEqual(expect.arrayContaining(['mong', 'kok']));
  });

  it('rejects a recognizable cross-district fallback for a Sham Shui Po street location', () => {
    const state = createInitialRuntimeState();
    const shamShuiPoMarket = hk1988WorldpackPlaces.find(
      (place) => place.placeId === 'place_sham_shui_po_street_markets'
    );
    expect(shamShuiPoMarket).toBeDefined();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_ssp_dai_pai_dong_1';
    state.places.place_ssp_dai_pai_dong_1 = {
      ...shamShuiPoMarket!,
      placeId: 'place_ssp_dai_pai_dong_1',
      name: '深水埗大排档',
      nameZh: '深水埗大排档',
      nameEn: undefined,
      type: 'outdoor_eatery',
      category: 'street_life'
    };
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({
            sceneAssetId: 'causeway_bay_commercial_street',
            tags: ['district', 'causeway', 'bay', 'commercial', 'street', 'hong_kong'],
            priority: 100
          })
        ]
      })
    });

    const result = resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state });

    expect(result.scene).toBeNull();
    expect(result.diagnostic.inputTags).toEqual(
      expect.arrayContaining(['sham', 'shui', 'po', 'street'])
    );
    expect(result.diagnostic.fallbackReason).toBe('no-compatible-scene');
  });

  it('keeps a restaurant function match above a same-district street backdrop', () => {
    const state = createInitialRuntimeState();
    const portlandStreet = hk1988WorldpackPlaces.find(
      (place) => place.placeId === 'place_portland_street'
    );
    expect(portlandStreet).toBeDefined();
    state.location.currentSceneId = 'scene_yin_lung_meeting_dawn';
    state.location.currentPlaceId = 'place_yin_lung_tea_restaurant';
    state.places.place_yin_lung_tea_restaurant = {
      ...portlandStreet!,
      placeId: 'place_yin_lung_tea_restaurant',
      name: '银龙茶餐厅',
      nameZh: '银龙茶餐厅',
      nameEn: 'Silver Dragon Restaurant',
      aliases: ['银龙'],
      type: 'restaurant',
      category: 'street_life',
      roadAnchors: []
    };
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({
            sceneAssetId: 'mong_kok_dense_street',
            tags: ['district', 'mong', 'kok', 'dense', 'street', 'hong_kong'],
            priority: 100
          }),
          fixtureScene({
            sceneAssetId: 'tea_restaurant',
            tags: ['functional', 'tea', 'restaurant'],
            priority: 60
          })
        ]
      })
    });

    const result = resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state });

    expect(result.scene).toMatchObject({
      sceneAssetId: 'tea_restaurant',
      matchType: 'tag_match'
    });
    expect(result.diagnostic.inputTags).toEqual(
      expect.arrayContaining(['mong', 'kok', 'street', 'tea', 'restaurant'])
    );
  });

  it('prefers a police station front over a report room for a station-level place', () => {
    const state = createInitialRuntimeState();
    const policeStation = hk1988WorldpackPlaces.find(
      (place) => place.placeId === 'place_mong_kok_police_station'
    );
    expect(policeStation).toBeDefined();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_mong_kok_police_station';
    state.places.place_mong_kok_police_station = policeStation!;
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({
            sceneAssetId: 'police_report_room_kowloon',
            tags: ['functional', 'police', 'report', 'room', 'kowloon'],
            priority: 60
          }),
          fixtureScene({
            sceneAssetId: 'police_station_front',
            tags: ['functional', 'police', 'station', 'front'],
            priority: 60
          })
        ]
      })
    });

    const result = resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state });

    expect(result.scene).toMatchObject({
      sceneAssetId: 'police_station_front',
      matchType: 'tag_match'
    });
    expect(result.diagnostic.inputTags).toEqual(
      expect.arrayContaining(['mong', 'kok', 'police', 'station', 'kowloon'])
    );
  });
});
