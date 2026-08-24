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

  it.each(['旺角冰室', '旺角茶餐厅', '旺角茶餐廳'])(
    'maps %s to the tea restaurant instead of a high-end restaurant',
    (placeName) => {
      const state = createInitialRuntimeState();
      const portlandStreet = hk1988WorldpackPlaces.find(
        (place) => place.placeId === 'place_portland_street'
      );
      expect(portlandStreet).toBeDefined();
      state.location.currentSceneId = undefined;
      state.location.currentPlaceId = 'place_mong_kok_ice_room';
      state.places.place_mong_kok_ice_room = {
        ...portlandStreet!,
        placeId: 'place_mong_kok_ice_room',
        name: placeName,
        nameZh: placeName,
        nameEn: undefined,
        aliases: [],
        type: 'restaurant',
        category: 'street_life',
        roadAnchors: []
      };
      const resolver = new DefaultAvgResourceResolver({
        basePack: fixturePack({
          scenes: [
            fixtureScene({
              sceneAssetId: 'high_end_restaurant',
              tags: ['functional', 'high', 'end', 'restaurant'],
              priority: 60
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
        expect.arrayContaining(['mong', 'kok', 'tea', 'restaurant'])
      );
    }
  );

  it('keeps an explicitly high-end restaurant on the high-end restaurant backdrop', () => {
    const state = createInitialRuntimeState();
    const portlandStreet = hk1988WorldpackPlaces.find(
      (place) => place.placeId === 'place_portland_street'
    );
    expect(portlandStreet).toBeDefined();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_harbour_high_end_restaurant';
    state.places.place_harbour_high_end_restaurant = {
      ...portlandStreet!,
      placeId: 'place_harbour_high_end_restaurant',
      name: '维港高级餐厅',
      nameZh: '维港高级餐厅',
      nameEn: 'Harbour High End Restaurant',
      aliases: [],
      type: 'restaurant',
      category: 'hospitality',
      roadAnchors: []
    };
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({
            sceneAssetId: 'high_end_restaurant',
            tags: ['functional', 'high', 'end', 'restaurant'],
            priority: 60
          }),
          fixtureScene({
            sceneAssetId: 'tea_restaurant',
            tags: ['functional', 'tea', 'restaurant'],
            priority: 60
          })
        ]
      })
    });

    expect(resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state }).scene)
      .toMatchObject({
        sceneAssetId: 'high_end_restaurant',
        matchType: 'tag_match'
      });
  });

  it.each([
    ['跑马地高档公寓', 'apartment', 'residential', 'luxury_mansion_living_room'],
    ['半山高级住宅', 'residence', 'residential', 'luxury_mansion_living_room'],
    ['浅水湾豪宅客厅', 'residence', 'residential', 'luxury_mansion_living_room'],
    ['太古城普通住宅', 'apartment', 'residential', 'residential_flat_middle_class'],
    ['九龙中产私人屋苑', 'apartment', 'residential', 'residential_flat_middle_class'],
    ['葵涌公共屋邨长廊', 'corridor', 'residential', 'public_housing_corridor']
  ])(
    'uses residential tier and spatial semantics for %s instead of treating every home alike',
    (placeName, type, category, expectedSceneAssetId) => {
      const state = createInitialRuntimeState();
      const portlandStreet = hk1988WorldpackPlaces.find(
        (place) => place.placeId === 'place_portland_street'
      );
      expect(portlandStreet).toBeDefined();
      state.location.currentSceneId = undefined;
      state.location.currentPlaceId = 'place_dynamic_residence';
      state.places.place_dynamic_residence = {
        ...portlandStreet!,
        placeId: 'place_dynamic_residence',
        name: placeName,
        nameZh: placeName,
        nameEn: undefined,
        aliases: [],
        type,
        category,
        roadAnchors: []
      };
      const resolver = new DefaultAvgResourceResolver({
        basePack: fixturePack({
          scenes: [
            fixtureScene({
              sceneAssetId: 'apartment_crime_scene_working_class',
              tags: ['crime_connector', 'apartment', 'crime', 'scene', 'working', 'class'],
              priority: 80
            }),
            fixtureScene({
              sceneAssetId: 'public_housing_corridor',
              tags: ['crime_connector', 'public', 'housing', 'corridor'],
              priority: 80
            }),
            fixtureScene({
              sceneAssetId: 'residential_flat_middle_class',
              tags: ['functional', 'residential', 'flat', 'middle', 'class'],
              priority: 60
            }),
            fixtureScene({
              sceneAssetId: 'luxury_mansion_living_room',
              tags: ['functional', 'luxury', 'mansion', 'living', 'room'],
              priority: 60
            }),
            fixtureScene({
              sceneAssetId: 'outlying_residential_district',
              tags: ['district', 'outlying', 'residential', 'hong_kong'],
              priority: 100
            })
          ]
        })
      });

      expect(resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state }).scene)
        .toMatchObject({ sceneAssetId: expectedSceneAssetId, matchType: 'tag_match' });
    }
  );

  it.each([
    ['灣仔高級餐廳', 'high_end_restaurant'],
    ['鲤鱼门海鲜酒家包厢', 'seafood_restaurant_private_room'],
    ['深水埗茶餐廳', 'tea_restaurant']
  ])('distinguishes restaurant subtypes for %s', (placeName, expectedSceneAssetId) => {
    const state = createInitialRuntimeState();
    const portlandStreet = hk1988WorldpackPlaces.find(
      (place) => place.placeId === 'place_portland_street'
    );
    expect(portlandStreet).toBeDefined();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_dynamic_restaurant';
    state.places.place_dynamic_restaurant = {
      ...portlandStreet!,
      placeId: 'place_dynamic_restaurant',
      name: placeName,
      nameZh: placeName,
      nameEn: undefined,
      aliases: [],
      type: 'restaurant',
      category: 'hospitality',
      roadAnchors: []
    };
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({
            sceneAssetId: 'high_end_restaurant',
            tags: ['functional', 'high', 'end', 'restaurant'],
            priority: 60
          }),
          fixtureScene({
            sceneAssetId: 'seafood_restaurant_private_room',
            tags: ['functional', 'seafood', 'restaurant', 'private', 'room'],
            priority: 60
          }),
          fixtureScene({
            sceneAssetId: 'tea_restaurant',
            tags: ['functional', 'tea', 'restaurant'],
            priority: 60
          })
        ]
      })
    });

    expect(resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state }).scene)
      .toMatchObject({ sceneAssetId: expectedSceneAssetId, matchType: 'tag_match' });
  });

  it('does not guess an arbitrary restaurant subtype when the place has no distinguishing evidence', () => {
    const state = createInitialRuntimeState();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_generic_restaurant';
    state.places.place_generic_restaurant = {
      ...hk1988WorldpackPlaces.find((place) => place.placeId === 'place_portland_street')!,
      placeId: 'place_generic_restaurant',
      name: '九龙餐厅',
      nameZh: '九龙餐厅',
      nameEn: undefined,
      aliases: [],
      type: 'restaurant',
      category: 'hospitality',
      roadAnchors: []
    };
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({ sceneAssetId: 'high_end_restaurant', tags: ['functional', 'high', 'end', 'restaurant'], priority: 60 }),
          fixtureScene({ sceneAssetId: 'seafood_restaurant_private_room', tags: ['functional', 'seafood', 'restaurant', 'private', 'room'], priority: 60 }),
          fixtureScene({ sceneAssetId: 'tea_restaurant', tags: ['functional', 'tea', 'restaurant'], priority: 60 })
        ]
      })
    });

    const result = resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state });
    expect(result.scene).toBeNull();
    expect(result.diagnostic.fallbackReason).toBe('ambiguous-scene-semantics');
  });

  it('does not replace an apartment interior with a broad residential district backdrop', () => {
    const state = createInitialRuntimeState();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_generic_apartment';
    state.places.place_generic_apartment = {
      ...hk1988WorldpackPlaces.find((place) => place.placeId === 'place_portland_street')!,
      placeId: 'place_generic_apartment',
      name: '九龙私人公寓',
      nameZh: '九龙私人公寓',
      nameEn: undefined,
      aliases: [],
      type: 'apartment',
      category: 'residential',
      roadAnchors: []
    };
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({
            sceneAssetId: 'outlying_residential_district',
            tags: ['district', 'outlying', 'residential', 'hong_kong'],
            priority: 100
          }),
          fixtureScene({
            sceneAssetId: 'residential_flat_middle_class',
            tags: ['functional', 'residential', 'flat', 'middle', 'class'],
            priority: 60
          })
        ]
      })
    });

    const result = resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state });
    expect(result.scene).toBeNull();
    expect(result.diagnostic.fallbackReason).toBe('ambiguous-scene-semantics');
  });

  it('does not use a crime-scene or safehouse backdrop for an ordinary place without that context', () => {
    const state = createInitialRuntimeState();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_hotel_guest_room';
    state.places.place_hotel_guest_room = {
      ...hk1988WorldpackPlaces.find((place) => place.placeId === 'place_portland_street')!,
      placeId: 'place_hotel_guest_room',
      name: '九龙酒店客房',
      nameZh: '九龙酒店客房',
      nameEn: undefined,
      aliases: [],
      type: 'hotel_room',
      category: 'hospitality',
      roadAnchors: []
    };
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({ sceneAssetId: 'hotel_lobby', tags: ['functional', 'hotel', 'lobby'], priority: 60 }),
          fixtureScene({ sceneAssetId: 'hotel_room_crime_scene', tags: ['crime_connector', 'hotel', 'room', 'crime', 'scene'], priority: 80 }),
          fixtureScene({ sceneAssetId: 'old_tenement_safehouse', tags: ['functional', 'old', 'tenement', 'safehouse'], priority: 60 })
        ]
      })
    });

    const result = resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state });
    expect(result.scene).toBeNull();
    expect(result.diagnostic.fallbackReason).toBe('no-compatible-scene');
  });

  it('treats a lobby and a public hall as compatible while rejecting a vault corridor', () => {
    const state = createInitialRuntimeState();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_bank_lobby';
    state.places.place_bank_lobby = {
      ...hk1988WorldpackPlaces.find((place) => place.placeId === 'place_portland_street')!,
      placeId: 'place_bank_lobby',
      name: '中环银行大堂',
      nameZh: '中环银行大堂',
      nameEn: 'Central Bank Lobby',
      aliases: [],
      type: 'bank',
      category: 'business',
      roadAnchors: []
    };
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({
            sceneAssetId: 'bank_vault_corridor',
            tags: ['crime_connector', 'bank', 'vault', 'corridor'],
            priority: 80
          }),
          fixtureScene({
            sceneAssetId: 'bank_hall',
            tags: ['functional', 'bank', 'hall'],
            priority: 60
          })
        ]
      })
    });

    expect(resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state }).scene)
      .toMatchObject({ sceneAssetId: 'bank_hall' });
  });

  it('still allows a crime-scene backdrop when the current place explicitly establishes that context', () => {
    const state = createInitialRuntimeState();
    state.location.currentSceneId = undefined;
    state.location.currentPlaceId = 'place_working_class_crime_scene';
    state.places.place_working_class_crime_scene = {
      ...hk1988WorldpackPlaces.find((place) => place.placeId === 'place_portland_street')!,
      placeId: 'place_working_class_crime_scene',
      name: '深水埗基层公寓案发现场',
      nameZh: '深水埗基层公寓案发现场',
      nameEn: undefined,
      aliases: [],
      type: 'apartment',
      category: 'residential',
      roadAnchors: []
    };
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        scenes: [
          fixtureScene({
            sceneAssetId: 'apartment_crime_scene_working_class',
            tags: ['crime_connector', 'apartment', 'crime', 'scene', 'working', 'class'],
            priority: 80
          }),
          fixtureScene({
            sceneAssetId: 'residential_flat_middle_class',
            tags: ['functional', 'residential', 'flat', 'middle', 'class'],
            priority: 60
          })
        ]
      })
    });

    expect(resolveAvgScene({ resolver, storyEntry: storyEntry(), runtimeState: state }).scene)
      .toMatchObject({ sceneAssetId: 'apartment_crime_scene_working_class' });
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
