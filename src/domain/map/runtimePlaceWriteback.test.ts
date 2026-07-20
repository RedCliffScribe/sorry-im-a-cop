import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { applyNarratorResponse } from '../writeback/applyWriteback';
import { validateNarratorResponse } from '../writeback/validateWriteback';

describe('runtime generated place writeback', () => {
  it('persists generated places with map identity metadata and inferred anchors', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player follows a witness into a back alley.',
      turnSummary: '玩家跟随证人进入后巷，并确认了这个地点。',
      writeback: {
        placePatches: [
          {
            placeId: 'place_runtime_back_alley',
            name: '金星游戏机中心后巷',
            nameZh: '金星游戏机中心后巷',
            nameEn: 'Golden Star Arcade Back Alley',
            aliases: ['金星后巷'],
            regionId: 'region_kowloon',
            districtId: 'district_mong_kok',
            type: 'alley',
            category: 'runtime_scene_place',
            summary: '一次盘问后由剧情固定下来的后巷。',
            publicKnowledge: '附近街坊知道这里夜里常有人聚集。',
            currentState: '地面潮湿，墙边堆着纸箱。',
            source: 'runtime_generated',
            canonical: false,
            confidence: 'medium',
            visualAnchor: {
              mapId: 'hk_1988_main',
              x: 0.49,
              y: 0.39,
              precision: 'approximate',
              source: 'runtime_inferred',
              basisPlaceIds: ['place_mong_kok_police_station'],
              note: '根据旺角警署和西洋菜南街附近场景估算。'
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const place = next.places.place_runtime_back_alley;

    expect(place.nameEn).toBe('Golden Star Arcade Back Alley');
    expect(place.aliases).toContain('金星后巷');
    expect(place.districtId).toBe('district_mong_kok');
    expect(place.source).toBe('runtime_generated');
    expect(place.canonical).toBe(false);
    expect(place.visualAnchor?.source).toBe('runtime_inferred');
    expect(place.visualAnchor?.basisPlaceIds).toEqual(['place_mong_kok_police_station']);
  });

  it.each([
    '明早回到旺角警署再说。',
    '你决定不要回到旺角警署。',
    '陈警长说：“你回到旺角警署后找我。”'
  ])('does not move from narrative text without a structured location patch: %s', (narrativeText) => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const response = validateNarratorResponse({
      narrativeText,
      turnSummary: '玩家仍在恒生银行总行，没有实际移动。',
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.actors.player.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.map.lastMovement).toBeUndefined();
  });

  it('continues to apply an explicit structured location patch', () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const response = validateNarratorResponse({
      narrativeText: '你下车走进旺角警署大门，值班警员向你点头。',
      turnSummary: '玩家已经抵达旺角警署。',
      writeback: {
        locationPatch: {
          currentPlaceId: 'place_mong_kok_police_station',
          reason: '玩家已明确抵达旺角警署。'
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_mong_kok_police_station');
    expect(next.actors.player.currentPlaceId).toBe('place_mong_kok_police_station');
  });
});
