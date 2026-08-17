export const VEHICLE_ASSET_WRITEBACK_CONTRACT = [
  '车辆 assetPatch 合同：',
  '- category 必须是 vehicle。',
  '- vehicleType 只能是 privateCar/motorcycle/taxi/policeVehicle/boat/publicTransportPass/other。',
  '- holdingRelation 只能是 owned/rented/assigned/borrowed/keptForOther/seized/unknown；不得把借用、配发、扣押或代管车辆改写成玩家所有。',
  '- condition 只能是 good/usable/poor/broken/unknown。',
  '- locationSummary 与 accessSummary 必须是非空字符串；没有可靠内容时必须保留主提案或已有资产中的合法事实，禁止返回 null。',
  '- mobilityProfile 是可选整体；存在时必须同时提供合法 mode、正数 timeMultiplier 与非空 availabilitySummary；无法确认时整个省略，禁止返回 null。',
  '- incomeSettlementItemIds、expenseSettlementItemIds、relatedActorIds、relatedCaseIds、relatedPlaceIds 必须是字符串数组。',
  '- 购车的一次性支出必须同时写 financePatch.ledgerEntries，并在 relatedAssetItemIds 引用同一车辆 itemId；余额变化继续写对应 cashDelta/bankDelta。车辆与关联购车支出会按同一事务应用。'
].join('\n');
