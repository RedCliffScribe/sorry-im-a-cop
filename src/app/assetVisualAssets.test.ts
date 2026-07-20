import { describe, expect, it } from 'vitest';
import type { AssetItem, FixedAsset, StandardAssetItem, VehicleAsset } from '../domain/runtime/types';
import { resolveAssetVisualAsset } from './assetVisualAssets';

function standard(overrides: Partial<StandardAssetItem> = {}): StandardAssetItem {
  return {
    itemId: 'item_document',
    category: 'document',
    name: '12月23日的《成报》',
    summary: '一份普通报纸。',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    visibility: 'player_known',
    importance: 10,
    ...overrides
  };
}

function fixed(overrides: Partial<FixedAsset> = {}): FixedAsset {
  return {
    itemId: 'asset_home',
    category: 'fixedAsset',
    name: '通菜街唐楼分租房',
    summary: '距离旺角警署和家里茶餐厅都不远的老旧唐楼，隔音差但租金便宜。',
    detail: '唐楼单位。自己独居，父母在楼下不远处经营兴记茶餐厅。',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: ['place_home_mong_kok_tong_lau'],
    visibility: 'player_known',
    importance: 80,
    fixedAssetType: 'residence',
    holdingRelation: 'rented',
    primaryUse: 'home',
    locationSummary: '通菜街唐楼分租房',
    ownershipSummary: '玩家租住此处。',
    accessSummary: '玩家可作为固定住所使用。',
    incomeSettlementItemIds: [],
    expenseSettlementItemIds: ['monthly_rent'],
    ...overrides
  };
}

function vehicle(overrides: Partial<VehicleAsset> = {}): VehicleAsset {
  return {
    itemId: 'vehicle_motorcycle',
    category: 'vehicle',
    name: '旧电单车',
    summary: '一辆常在街坊巷口停放的旧电单车。',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    visibility: 'player_known',
    importance: 45,
    vehicleType: 'motorcycle',
    holdingRelation: 'owned',
    condition: 'usable',
    locationSummary: '住处楼下',
    accessSummary: '玩家有钥匙，可自行使用。',
    mobilityProfile: {
      mode: 'motorcycle',
      timeMultiplier: 0.7,
      availabilitySummary: '雨天和拥堵时不稳定。'
    },
    incomeSettlementItemIds: [],
    expenseSettlementItemIds: [],
    ...overrides
  };
}

describe('assetVisualAssets', () => {
  it('does not assign visual assets to ordinary items, evidence, or valuables', () => {
    const evidence: AssetItem = standard({
      itemId: 'evidence_receipt',
      name: '夜总会收据',
      evidence: {
        caseId: 'case_nightclub',
        caseTitle: '夜总会案',
        summary: '可作为证据。',
        disputed: false
      }
    });

    expect(resolveAssetVisualAsset(standard())).toBeNull();
    expect(resolveAssetVisualAsset(evidence)).toBeNull();
    expect(resolveAssetVisualAsset(standard({ category: 'valuable', name: '金表' }))).toBeNull();
  });

  it('matches rented tong lau homes to the tong lau residence image', () => {
    const visual = resolveAssetVisualAsset(fixed());

    expect(visual?.kind).toBe('property');
    expect(visual?.id).toBe('tong_lau_subdivided_room');
    expect(visual?.label).toBe('唐楼分租房');
    expect(visual?.url).toContain('asset-property-001-01-tong-lau-subdivided-room.webp');
  });

  it('matches business premises and storage to specific property images', () => {
    expect(
      resolveAssetVisualAsset(
        fixed({
          itemId: 'asset_karaoke',
          name: '金声卡拉OK',
          summary: '夜场卡拉OK经营场所。',
          fixedAssetType: 'businessPremise',
          primaryUse: 'business',
          locationSummary: '尖沙咀夜场街'
        })
      )?.id
    ).toBe('nightclub_karaoke_premise');

    expect(
      resolveAssetVisualAsset(
        fixed({
          itemId: 'asset_warehouse',
          name: '葵涌仓库单位',
          summary: '货物临时存放用仓库。',
          fixedAssetType: 'storage',
          primaryUse: 'storage',
          locationSummary: '葵涌货仓'
        })
      )?.id
    ).toBe('warehouse_unit');
  });

  it('matches vehicle assets by vehicle type and usage clues', () => {
    expect(resolveAssetVisualAsset(vehicle())?.id).toBe('neighborhood_motorcycle');
    expect(
      resolveAssetVisualAsset(
        vehicle({
          itemId: 'vehicle_police_motorcycle',
          name: '警用电单车',
          vehicleType: 'policeVehicle',
          mobilityProfile: { mode: 'motorcycle', timeMultiplier: 0.65, availabilitySummary: '警队分配使用。' }
        })
      )?.id
    ).toBe('police_motorcycle');
    expect(
      resolveAssetVisualAsset(
        vehicle({
          itemId: 'vehicle_yacht',
          name: '豪华游艇',
          vehicleType: 'boat',
          summary: '用于海面接待的豪华游艇。'
        })
      )?.id
    ).toBe('luxury_yacht_speedboat');
  });
});
