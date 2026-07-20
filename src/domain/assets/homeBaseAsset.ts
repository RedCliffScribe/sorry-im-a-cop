import type {
  FinanceCashflowItem,
  FixedAsset,
  GameTime,
  HomeBase,
  PlayerEconomy,
  RuntimeAssetsState,
  RuntimeFinanceState
} from '../runtime/types';

export const PLAYER_HOME_ASSET_ID = 'asset_player_home';
export const PLAYER_HOME_RENT_CASHFLOW_ID = 'cashflow_player_home_rent';

function monthKey(time: GameTime): string {
  return `${String(time.year).padStart(4, '0')}-${String(time.month).padStart(2, '0')}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function homeBaseText(homeBase: HomeBase): string {
  return [
    homeBase.placeId,
    homeBase.placeName,
    homeBase.housingType,
    homeBase.summary,
    homeBase.householdSummary
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
}

function hasRealHomeBase(homeBase: HomeBase): boolean {
  return Boolean(homeBase.placeId?.trim() && homeBase.placeName?.trim());
}

function deriveHoldingRelation(homeBase: HomeBase): FixedAsset['holdingRelation'] {
  const text = homeBaseText(homeBase);
  if (/按揭|mortgage/i.test(text)) return 'mortgaged';
  if (/自置|自有|拥有|買入|买入|owned|owner/i.test(text)) return 'owned';
  if (/租|分租|租住|劏房|板间|板間|公屋|rented|rental|sublet|lease/i.test(text)) return 'rented';
  if (/宿舍|宿位|quarters|assigned/i.test(text)) return 'assigned';
  if (/家人|父亲|父親|母亲|母親|父母|family/i.test(text)) return 'familyOwned';
  return 'unknown';
}

function estimateMonthlyRent(homeBase: HomeBase, economy: PlayerEconomy): number {
  const text = homeBaseText(homeBase);
  if (/公屋/.test(text)) return 650;
  if (/劏房|板间|板間|分租/.test(text)) return 850;
  if (/唐楼|唐樓/.test(text)) return 950;

  const pressure = Number.isFinite(economy.monthlyPressure) ? Math.max(0, Math.min(100, economy.monthlyPressure)) : 50;
  return Math.round((600 + pressure * 10) / 50) * 50;
}

function findExistingHomeAsset(assets: RuntimeAssetsState, homeBase: HomeBase): FixedAsset | undefined {
  return Object.values(assets.items).find(
    (item): item is FixedAsset =>
      item.category === 'fixedAsset' &&
      item.primaryUse === 'home' &&
      (item.placeId === homeBase.placeId || item.relatedPlaceIds.includes(homeBase.placeId ?? ''))
  );
}

function createHomeAsset(homeBase: HomeBase, time: GameTime, holdingRelation: FixedAsset['holdingRelation']): FixedAsset {
  const isRented = holdingRelation === 'rented';
  return {
    itemId: PLAYER_HOME_ASSET_ID,
    category: 'fixedAsset',
    name: homeBase.placeName ?? '固定住所',
    summary: homeBase.summary,
    detail: `${homeBase.housingType}。${homeBase.householdSummary}`,
    acquiredAt: { ...time },
    relatedActorIds: ['player'],
    relatedCaseIds: [],
    relatedPlaceIds: homeBase.placeId ? [homeBase.placeId] : [],
    visibility: 'player_known',
    importance: 80,
    fixedAssetType: 'residence',
    holdingRelation,
    primaryUse: 'home',
    locationSummary: homeBase.placeName ?? homeBase.summary,
    placeId: homeBase.placeId,
    ownershipSummary: isRented ? `玩家租住此处：${homeBase.housingType}。` : `玩家可支配此住所：${homeBase.housingType}。`,
    accessSummary: `玩家可作为固定住所使用。${homeBase.householdSummary}`,
    incomeSettlementItemIds: [],
    expenseSettlementItemIds: isRented ? [PLAYER_HOME_RENT_CASHFLOW_ID] : [],
    worldpackAssetData: {
      generatedFrom: 'player.homeBase',
      housingType: homeBase.housingType
    }
  };
}

function mergeHomeAsset(existing: FixedAsset, homeBase: HomeBase, holdingRelation: FixedAsset['holdingRelation']): FixedAsset {
  const shouldAddRent = holdingRelation === 'rented' || existing.holdingRelation === 'rented';
  return {
    ...existing,
    relatedActorIds: unique([...(existing.relatedActorIds ?? []), 'player']),
    relatedPlaceIds: unique([...(existing.relatedPlaceIds ?? []), homeBase.placeId ?? '']),
    placeId: existing.placeId ?? homeBase.placeId,
    holdingRelation: existing.holdingRelation === 'unknown' ? holdingRelation : existing.holdingRelation,
    incomeSettlementItemIds: [...(existing.incomeSettlementItemIds ?? [])],
    expenseSettlementItemIds: shouldAddRent
      ? unique([...(existing.expenseSettlementItemIds ?? []), PLAYER_HOME_RENT_CASHFLOW_ID])
      : [...(existing.expenseSettlementItemIds ?? [])],
    worldpackAssetData: {
      ...(existing.worldpackAssetData ?? {}),
      generatedFrom: existing.worldpackAssetData?.generatedFrom ?? 'player.homeBase',
      housingType: existing.worldpackAssetData?.housingType ?? homeBase.housingType
    }
  };
}

function createRentCashflow(
  homeBase: HomeBase,
  assetId: string,
  economy: PlayerEconomy,
  time: GameTime
): FinanceCashflowItem {
  return {
    itemId: PLAYER_HOME_RENT_CASHFLOW_ID,
    direction: 'expense',
    kind: 'rent',
    title: `${homeBase.placeName ?? '固定住所'}租金`,
    amount: estimateMonthlyRent(homeBase, economy),
    account: 'bank',
    summary: `每月为${homeBase.housingType}支付的住所租金。`,
    activeFromMonth: monthKey(time),
    relatedAssetItemIds: [assetId],
    relatedActorIds: ['player'],
    relatedPlaceIds: homeBase.placeId ? [homeBase.placeId] : [],
    source: 'opening',
    status: 'active',
    visibility: 'player_known'
  };
}

function mergeRentCashflow(existing: FinanceCashflowItem, homeBase: HomeBase, assetId: string): FinanceCashflowItem {
  return {
    ...existing,
    relatedAssetItemIds: unique([...(existing.relatedAssetItemIds ?? []), assetId]),
    relatedActorIds: unique([...(existing.relatedActorIds ?? []), 'player']),
    relatedPlaceIds: unique([...(existing.relatedPlaceIds ?? []), homeBase.placeId ?? ''])
  };
}

export function syncHomeBaseAssetAndFinance({
  assets,
  finance,
  homeBase,
  economy,
  time
}: {
  assets: RuntimeAssetsState;
  finance: RuntimeFinanceState;
  homeBase: HomeBase;
  economy: PlayerEconomy;
  time: GameTime;
}): { assets: RuntimeAssetsState; finance: RuntimeFinanceState } {
  if (!hasRealHomeBase(homeBase)) return { assets, finance };

  const holdingRelation = deriveHoldingRelation(homeBase);
  const existingHomeAsset = findExistingHomeAsset(assets, homeBase);
  const homeAsset = existingHomeAsset
    ? mergeHomeAsset(existingHomeAsset, homeBase, holdingRelation)
    : createHomeAsset(homeBase, time, holdingRelation);
  const assetId = homeAsset.itemId;
  const nextAssets: RuntimeAssetsState = {
    items: {
      ...assets.items,
      [assetId]: homeAsset
    },
    equippedItemIds: [...assets.equippedItemIds]
  };

  if (homeAsset.holdingRelation !== 'rented') {
    return { assets: nextAssets, finance };
  }

  const existingRentCashflow = finance.cashflows[PLAYER_HOME_RENT_CASHFLOW_ID];
  const rentCashflow = existingRentCashflow
    ? mergeRentCashflow(existingRentCashflow, homeBase, assetId)
    : createRentCashflow(homeBase, assetId, economy, time);

  return {
    assets: nextAssets,
    finance: {
      ...finance,
      cashflows: {
        ...finance.cashflows,
        [PLAYER_HOME_RENT_CASHFLOW_ID]: rentCashflow
      },
      ledger: [...finance.ledger],
      reports: [...finance.reports]
    }
  };
}
