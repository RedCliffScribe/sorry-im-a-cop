import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';

export function createBatch4aRuntimeState() {
  const state = createInitialRuntimeState({
    playerName: '周星星',
    englishName: 'Stephen Chow',
    policeNumber: '4382'
  });

  state.finance.moneyHKD = 6380;
  state.finance.summary = '工资收入稳定，租金与日常开支仍需留意。';
  state.finance.cashflows.monthly_rent = {
    itemId: 'monthly_rent',
    direction: 'expense',
    kind: 'rent',
    title: '唐楼月租',
    amountHKD: 680,
    summary: '每月支付通菜街唐楼单位租金。',
    activeFromMonth: '1984-12',
    relatedAssetItemIds: ['asset_rented_flat'],
    relatedActorIds: ['player'],
    relatedPlaceIds: ['place_home_mong_kok_tang_lau'],
    source: 'opening',
    status: 'active',
    visibility: 'player_known'
  };
  state.finance.ledger = Array.from({ length: 14 }, (_, index) => ({
    entryId: `batch4a_ledger_${index + 1}`,
    gameTime: { ...state.time, minute: Math.max(0, state.time.minute - index) },
    direction: index % 4 === 0 ? ('income' as const) : ('expense' as const),
    amountHKD: index % 4 === 0 ? 120 : index + 3,
    title: index % 4 === 0 ? '临时津贴' : `日常支出 ${index + 1}`,
    summary: index % 4 === 0 ? '当值期间领取的临时津贴。' : '交通、饮食或通讯开支。',
    relatedAssetItemIds: [],
    relatedActorIds: ['player'],
    relatedPlaceIds: [],
    source: 'manual' as const,
    visibility: 'player_known' as const
  }));
  state.finance.reports = [
    {
      reportId: 'batch4a_report_1984_11',
      monthKey: '1984-11',
      generatedAt: state.time,
      incomeHKD: 4200,
      expenseHKD: 1530,
      netHKD: 2670,
      startingMoneyHKD: 900,
      endingMoneyHKD: 3570,
      itemSummaries: ['警队月薪 +4200', '房租 -680', '日常开支 -850'],
      read: false,
      archived: false
    }
  ];

  state.assets.items.asset_rented_flat = {
    itemId: 'asset_rented_flat',
    category: 'fixedAsset',
    name: '通菜街唐楼分租房',
    summary: '距离旺角警署不远的旧式唐楼单位，租金便宜但隔音较差。',
    detail: '玩家独居，父母在楼下不远处经营兴记茶餐厅。',
    relatedActorIds: ['player'],
    relatedCaseIds: [],
    relatedPlaceIds: ['place_home_mong_kok_tang_lau'],
    visibility: 'player_known',
    importance: 80,
    fixedAssetType: 'residence',
    holdingRelation: 'rented',
    primaryUse: 'home',
    locationSummary: '旺角通菜街唐楼',
    ownershipSummary: '玩家按月租住此处。',
    accessSummary: '玩家持有钥匙，可作为固定住所使用。',
    incomeSettlementItemIds: [],
    expenseSettlementItemIds: ['monthly_rent']
  };
  state.assets.items.asset_motorcycle = {
    itemId: 'asset_motorcycle',
    category: 'vehicle',
    name: '本田旧电单车',
    summary: '一辆适合九龙短途通勤的旧电单车。',
    detail: '车况尚可，雨天需要减速。',
    relatedActorIds: ['player'],
    relatedCaseIds: [],
    relatedPlaceIds: ['place_home_mong_kok_tang_lau'],
    visibility: 'player_known',
    importance: 62,
    vehicleType: 'motorcycle',
    holdingRelation: 'owned',
    condition: 'usable',
    locationSummary: '平时停在住处楼下。',
    accessSummary: '玩家持有车匙，可随时使用。',
    mobilityProfile: {
      mode: 'motorcycle',
      timeMultiplier: 0.7,
      availabilitySummary: '受天气与道路拥堵影响。'
    },
    incomeSettlementItemIds: [],
    expenseSettlementItemIds: []
  };
  state.assets.items.asset_notebook = {
    itemId: 'asset_notebook',
    category: 'general',
    name: '巡逻记录簿',
    summary: '记录当值事项的便携簿册。',
    relatedActorIds: ['player'],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    visibility: 'player_known',
    importance: 45
  };

  return state;
}
