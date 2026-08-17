import type {
  AssetItem,
  RuntimeState,
  StoryDiagnosticIssue,
  VehicleAsset
} from '../runtime/types';
import {
  assetItemSchema,
  type NarratorResponse
} from '../writeback/schema';

type UnknownRecord = Record<string, unknown>;
type AssetPatchItem =
  NonNullable<NarratorResponse['writeback']['assetPatch']>['upsertItems'][number];
type VehicleAssetPatchItem = Extract<AssetPatchItem, { category: 'vehicle' }>;

export interface VehicleIntentReconciliation {
  item?: VehicleAssetPatchItem;
  diagnostics: StoryDiagnosticIssue[];
  issues: StoryDiagnosticIssue[];
}

export interface AssetIntentRecoveryResult {
  response: NarratorResponse;
  diagnostics: StoryDiagnosticIssue[];
}

const vehicleTypeAliases: Readonly<Record<string, VehicleAsset['vehicleType']>> = {
  privatecar: 'privateCar',
  private_car: 'privateCar',
  car: 'privateCar',
  私家车: 'privateCar',
  轿车: 'privateCar',
  轎車: 'privateCar',
  motorcycle: 'motorcycle',
  motorbike: 'motorcycle',
  摩托车: 'motorcycle',
  摩托車: 'motorcycle',
  电单车: 'motorcycle',
  電單車: 'motorcycle',
  taxi: 'taxi',
  的士: 'taxi',
  policevehicle: 'policeVehicle',
  police_vehicle: 'policeVehicle',
  警车: 'policeVehicle',
  警車: 'policeVehicle',
  boat: 'boat',
  船: 'boat',
  船只: 'boat',
  船隻: 'boat',
  快艇: 'boat',
  publictransportpass: 'publicTransportPass',
  public_transport_pass: 'publicTransportPass',
  公共交通通行证: 'publicTransportPass',
  公共交通通行證: 'publicTransportPass',
  other: 'other',
  其他: 'other'
};

const vehicleHoldingAliases: Readonly<Record<string, VehicleAsset['holdingRelation']>> = {
  owned: 'owned',
  purchase: 'owned',
  purchased: 'owned',
  bought: 'owned',
  购买: 'owned',
  購買: 'owned',
  全款购入: 'owned',
  全款購入: 'owned',
  全款购买: 'owned',
  全款購買: 'owned',
  自有: 'owned',
  rented: 'rented',
  rental: 'rented',
  租用: 'rented',
  租赁: 'rented',
  租賃: 'rented',
  assigned: 'assigned',
  issued: 'assigned',
  配发: 'assigned',
  配發: 'assigned',
  分配使用: 'assigned',
  borrowed: 'borrowed',
  borrow: 'borrowed',
  借用: 'borrowed',
  keptforother: 'keptForOther',
  kept_for_other: 'keptForOther',
  代管: 'keptForOther',
  替他人保管: 'keptForOther',
  seized: 'seized',
  扣押: 'seized',
  查扣: 'seized',
  unknown: 'unknown',
  未知: 'unknown'
};

const vehicleConditionAliases: Readonly<Record<string, VehicleAsset['condition']>> = {
  good: 'good',
  良好: 'good',
  usable: 'usable',
  available: 'usable',
  可用: 'usable',
  可驾驶: 'usable',
  可駕駛: 'usable',
  poor: 'poor',
  较差: 'poor',
  較差: 'poor',
  车况较差: 'poor',
  車況較差: 'poor',
  broken: 'broken',
  damaged: 'broken',
  损坏: 'broken',
  損壞: 'broken',
  故障: 'broken',
  unknown: 'unknown',
  未知: 'unknown'
};

const mobilityModeAliases: Readonly<Record<
  string,
  NonNullable<VehicleAsset['mobilityProfile']>['mode']
>> = {
  walk: 'walk',
  publictransit: 'publicTransit',
  public_transit: 'publicTransit',
  taxi: 'taxi',
  car: 'car',
  motorcycle: 'motorcycle',
  boat: 'boat',
  policevehicle: 'policeVehicle',
  police_vehicle: 'policeVehicle'
};

const validVisibility = new Set(['public', 'player_known', 'private', 'hidden']);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase().replace(/[\s-]+/g, '_');
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function rawType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function normalizeStringArray(
  value: unknown,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    diagnostics.push({
      path,
      code: 'asset_repair_field_normalized',
      message: `车辆关联字段不是数组（rawType=${rawType(value)}），已按空数组处理。`
    });
    return [];
  }
  const normalized = [
    ...new Set(value.flatMap((item) => {
      const text = nonEmptyString(item);
      return text ? [text] : [];
    }))
  ];
  if (normalized.length !== value.length) {
    diagnostics.push({
      path,
      code: 'asset_repair_field_normalized',
      message: '车辆关联数组中的空值、错误类型或重复 ID 已移除。'
    });
  }
  return normalized;
}

function normalizeAlias<T extends string>(
  value: unknown,
  aliases: Readonly<Record<string, T>>,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): T | undefined {
  const token = normalizedToken(value);
  if (!token) return undefined;
  const normalized = aliases[token];
  if (normalized && value !== normalized) {
    diagnostics.push({
      path,
      code: 'asset_repair_field_normalized',
      message: `车辆字段 ${JSON.stringify(value)} 已确定性归一化为 ${normalized}。`
    });
  }
  return normalized;
}

function normalizeMobilityProfile(
  value: unknown,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): VehicleAsset['mobilityProfile'] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    diagnostics.push({
      path,
      code: 'asset_repair_field_normalized',
      message: `mobilityProfile 不是对象（rawType=${rawType(value)}），已省略该可选整体。`
    });
    return undefined;
  }
  const modeToken = normalizedToken(value.mode);
  const mode = modeToken ? mobilityModeAliases[modeToken] : undefined;
  const timeMultiplier = finiteNumber(value.timeMultiplier);
  const availabilitySummary = nonEmptyString(value.availabilitySummary);
  if (
    !mode ||
    timeMultiplier === undefined ||
    timeMultiplier <= 0 ||
    !availabilitySummary
  ) {
    diagnostics.push({
      path,
      code: 'asset_repair_field_normalized',
      message: 'mobilityProfile 缺少合法 mode、正数 timeMultiplier 或 availabilitySummary，已省略该可选整体。'
    });
    return undefined;
  }
  return {
    mode,
    timeMultiplier,
    availabilitySummary
  };
}

function normalizeVehicleLayer(
  value: unknown,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): UnknownRecord {
  if (!isRecord(value)) return {};
  const normalized: UnknownRecord = {};

  for (const field of [
    'itemId',
    'name',
    'summary',
    'detail',
    'locationSummary',
    'accessSummary'
  ] as const) {
    const text = nonEmptyString(value[field]);
    if (text) normalized[field] = text;
  }

  const categoryToken = normalizedToken(value.category);
  if (
    categoryToken === 'vehicle' ||
    categoryToken === '车辆' ||
    categoryToken === '車輛' ||
    categoryToken === '交通工具'
  ) {
    normalized.category = 'vehicle';
    if (value.category !== 'vehicle') {
      diagnostics.push({
        path: [...path, 'category'],
        code: 'asset_repair_field_normalized',
        message: `车辆分类 ${JSON.stringify(value.category)} 已归一化为 vehicle。`
      });
    }
  }

  const vehicleType = normalizeAlias(
    value.vehicleType,
    vehicleTypeAliases,
    [...path, 'vehicleType'],
    diagnostics
  );
  if (vehicleType) normalized.vehicleType = vehicleType;

  const holdingRelation = normalizeAlias(
    value.holdingRelation,
    vehicleHoldingAliases,
    [...path, 'holdingRelation'],
    diagnostics
  );
  if (holdingRelation) normalized.holdingRelation = holdingRelation;

  const condition = normalizeAlias(
    value.condition,
    vehicleConditionAliases,
    [...path, 'condition'],
    diagnostics
  );
  if (condition) normalized.condition = condition;

  for (const field of [
    'relatedActorIds',
    'relatedCaseIds',
    'relatedPlaceIds',
    'incomeSettlementItemIds',
    'expenseSettlementItemIds'
  ] as const) {
    const items = normalizeStringArray(value[field], [...path, field], diagnostics);
    if (items !== undefined) normalized[field] = items;
  }

  const valueAmount = finiteNumber(value.valueAmount);
  if (valueAmount !== undefined) {
    normalized.valueAmount = valueAmount;
    if (value.valueAmount !== valueAmount) {
      diagnostics.push({
        path: [...path, 'valueAmount'],
        code: 'asset_repair_field_normalized',
        message: `车辆价值 ${JSON.stringify(value.valueAmount)} 已转换为有限数字。`
      });
    }
  }

  const importance = finiteNumber(value.importance);
  if (importance !== undefined) {
    normalized.importance = Math.max(0, Math.min(100, Math.round(importance)));
    if (value.importance !== normalized.importance) {
      diagnostics.push({
        path: [...path, 'importance'],
        code: 'asset_repair_field_normalized',
        message: `车辆重要度 ${JSON.stringify(value.importance)} 已转换并限制到 0–100 整数。`
      });
    }
  }

  if (typeof value.visibility === 'string' && validVisibility.has(value.visibility)) {
    normalized.visibility = value.visibility;
  }
  if (isRecord(value.worldpackAssetData)) {
    normalized.worldpackAssetData = value.worldpackAssetData;
  }
  if (isRecord(value.acquiredAt)) {
    normalized.acquiredAt = value.acquiredAt;
  }
  if (isRecord(value.evidence)) normalized.evidence = value.evidence;
  if (isRecord(value.wearable)) normalized.wearable = value.wearable;

  const mobilityProfile = normalizeMobilityProfile(
    value.mobilityProfile,
    [...path, 'mobilityProfile'],
    diagnostics
  );
  if (mobilityProfile) normalized.mobilityProfile = mobilityProfile;

  return normalized;
}

export function getRawAssetPatch(value: unknown): unknown | undefined {
  if (!isRecord(value) || !isRecord(value.writeback)) return undefined;
  return value.writeback.assetPatch;
}

export function getRawAssetUpsertItems(value: unknown): unknown[] {
  const patch = getRawAssetPatch(value);
  if (!isRecord(patch) || patch.upsertItems === undefined) return [];
  return Array.isArray(patch.upsertItems) ? patch.upsertItems : [patch.upsertItems];
}

export function indexRawAssetItemsById(items: Iterable<unknown>): Map<string, unknown> {
  const indexed = new Map<string, unknown>();
  for (const item of items) {
    if (!isRecord(item)) continue;
    const itemId = nonEmptyString(item.itemId);
    if (itemId && !indexed.has(itemId)) indexed.set(itemId, item);
  }
  return indexed;
}

export function isVehicleAssetIntent(
  value: unknown,
  knownItem?: AssetItem
): boolean {
  if (knownItem?.category === 'vehicle') return true;
  if (!isRecord(value)) return false;
  const token = normalizedToken(value.category);
  return (
    token === 'vehicle' ||
    token === '车辆' ||
    token === '車輛' ||
    token === '交通工具'
  );
}

export function reconcileVehicleAssetIntent({
  existing,
  rawMain,
  validatedMain,
  repair,
  path = ['writeback', 'assetPatch', 'upsertItems']
}: {
  existing?: AssetItem;
  rawMain?: unknown;
  validatedMain?: AssetPatchItem;
  repair?: unknown;
  path?: Array<string | number>;
}): VehicleIntentReconciliation {
  const diagnostics: StoryDiagnosticIssue[] = [];
  const existingLayer = normalizeVehicleLayer(existing, path, diagnostics);
  const rawMainLayer = normalizeVehicleLayer(rawMain, path, diagnostics);
  const validatedMainLayer = normalizeVehicleLayer(validatedMain, path, diagnostics);
  const repairLayer = normalizeVehicleLayer(repair, path, diagnostics);
  const merged: UnknownRecord = {
    ...existingLayer,
    ...rawMainLayer,
    ...validatedMainLayer
  };
  const hasMainCandidate = isRecord(rawMain) || isRecord(validatedMain);
  for (const [field, fieldValue] of Object.entries(repairLayer)) {
    if (!hasMainCandidate) {
      merged[field] = fieldValue;
      continue;
    }
    const mainAlreadyHasValidField =
      Object.prototype.hasOwnProperty.call(rawMainLayer, field) ||
      Object.prototype.hasOwnProperty.call(validatedMainLayer, field);
    if (mainAlreadyHasValidField) continue;
    const rawMainExplicitlyNeedsRepair =
      isRecord(rawMain) && Object.prototype.hasOwnProperty.call(rawMain, field);
    if (merged[field] === undefined || rawMainExplicitlyNeedsRepair) {
      merged[field] = fieldValue;
    }
  }

  merged.category = 'vehicle';
  merged.relatedActorIds ??= [];
  merged.relatedCaseIds ??= [];
  merged.relatedPlaceIds ??= [];
  merged.visibility ??= 'player_known';
  merged.importance ??= 50;
  merged.worldpackAssetData ??= {};
  merged.condition ??= 'unknown';
  merged.holdingRelation ??= 'unknown';
  merged.incomeSettlementItemIds ??= [];
  merged.expenseSettlementItemIds ??= [];

  const parsed = assetItemSchema.safeParse(merged);
  if (parsed.success && parsed.data.category === 'vehicle') {
    return {
      item: parsed.data,
      diagnostics,
      issues: []
    };
  }

  const issues: StoryDiagnosticIssue[] = parsed.success
    ? [{
        path,
        code: 'invalid_value',
        message: '最终资产不是 vehicle。'
      }]
    : parsed.error.issues.map((issue) => ({
        path: [...path, ...issue.path.map((segment) => String(segment))],
        code: issue.code,
        message: `${issue.message}; rawType=${rawType(
          issue.path.reduce<unknown>(
            (current, segment) =>
              isRecord(current) || Array.isArray(current)
                ? (current as Record<string, unknown>)[String(segment)]
                : undefined,
            merged
          )
        )}`
      }));
  return { diagnostics, issues };
}

export function recoverVehicleAssetIntents(
  state: RuntimeState,
  response: NarratorResponse
): AssetIntentRecoveryResult {
  const rawItems = response.rawAssetUpsertItems ?? [];
  if (rawItems.length === 0) return { response, diagnostics: [] };

  const diagnostics: StoryDiagnosticIssue[] = [];
  const rawById = indexRawAssetItemsById(rawItems);
  const validatedPatch = response.writeback.assetPatch;
  const validatedById = new Map(
    (validatedPatch?.upsertItems ?? []).map((item) => [item.itemId, item])
  );
  const recoveredById = new Map(validatedById);

  for (const [itemId, rawItem] of rawById) {
    const existing = state.assets.items[itemId];
    const validated = validatedById.get(itemId);
    if (!isVehicleAssetIntent(rawItem, existing ?? validated)) continue;

    const reconciled = reconcileVehicleAssetIntent({
      existing,
      rawMain: rawItem,
      validatedMain: validated,
      path: ['writeback', 'assetPatch', 'upsertItems', itemId]
    });
    diagnostics.push(...reconciled.diagnostics);
    if (!reconciled.item) continue;
    recoveredById.set(itemId, reconciled.item);
    if (!validated || JSON.stringify(validated) !== JSON.stringify(reconciled.item)) {
      diagnostics.push(
        {
          path: ['writeback', 'assetPatch', 'upsertItems', itemId],
          code: 'asset_intent_preserved',
          message: `已在严格单项校验丢弃前保留车辆 "${itemId}" 的原始结构化意图。`
        },
        {
          path: ['writeback', 'assetPatch', 'upsertItems', itemId],
          code: 'asset_repair_reconciled_from_raw',
          message: `车辆 "${itemId}" 已从已有事实、原始主提案和通过校验的字段中合成，并重新通过最终严格 Schema。`
        }
      );
    }
  }

  if (recoveredById.size === validatedById.size && diagnostics.length === 0) {
    return { response, diagnostics };
  }

  return {
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        assetPatch: {
          upsertItems: [...recoveredById.values()],
          removeItems: validatedPatch?.removeItems ?? [],
          ...(validatedPatch?.equippedItemIds !== undefined
            ? { equippedItemIds: validatedPatch.equippedItemIds }
            : {})
        }
      }
    },
    diagnostics
  };
}

function vehicleIntentIds(response: NarratorResponse): Set<string> {
  const ids = new Set<string>();
  for (const item of response.rawAssetUpsertItems ?? []) {
    if (!isRecord(item) || !isVehicleAssetIntent(item)) continue;
    const itemId = nonEmptyString(item.itemId);
    if (itemId) ids.add(itemId);
  }
  for (const item of response.writeback.assetPatch?.upsertItems ?? []) {
    if (item.category === 'vehicle') ids.add(item.itemId);
  }
  return ids;
}

function addBlockedExpenseBack(
  financePatch: NonNullable<NarratorResponse['writeback']['financePatch']>,
  account: 'cash' | 'bank',
  amount: number
): NonNullable<NarratorResponse['writeback']['financePatch']> {
  if (amount <= 0) return financePatch;
  if (account === 'cash') {
    if (financePatch.cashSet !== undefined) {
      return { ...financePatch, cashSet: financePatch.cashSet + amount };
    }
    if (financePatch.cashDelta !== undefined) {
      return { ...financePatch, cashDelta: financePatch.cashDelta + amount };
    }
    return financePatch;
  }
  if (financePatch.bankSet !== undefined) {
    return { ...financePatch, bankSet: financePatch.bankSet + amount };
  }
  if (financePatch.bankDelta !== undefined) {
    return { ...financePatch, bankDelta: financePatch.bankDelta + amount };
  }
  return financePatch;
}

export function enforceAssetPurchaseWritebackAtomicity(
  state: RuntimeState,
  response: NarratorResponse
): { response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] } {
  const financePatch = response.writeback.financePatch;
  if (!financePatch) return { response, diagnostics: [] };

  const existingIds = new Set(Object.keys(state.assets.items));
  const finalIds = new Set(existingIds);
  for (const item of response.writeback.assetPatch?.upsertItems ?? []) {
    finalIds.add(item.itemId);
  }
  for (const item of response.writeback.assetPatch?.removeItems ?? []) {
    finalIds.delete(item.itemId);
  }

  const newVehicleIntentIds = vehicleIntentIds(response);
  const missingVehicleIds = new Set(
    [...newVehicleIntentIds].filter(
      (itemId) => !existingIds.has(itemId) && !finalIds.has(itemId)
    )
  );
  if (missingVehicleIds.size === 0) return { response, diagnostics: [] };

  const blockedEntries = financePatch.ledgerEntries.filter(
    (entry) =>
      entry.direction === 'expense' &&
      entry.relatedAssetItemIds.some((itemId) => missingVehicleIds.has(itemId))
  );
  const blockedCashflows = financePatch.upsertCashflows.filter(
    (item) =>
      item.direction === 'expense' &&
      item.relatedAssetItemIds.some((itemId) => missingVehicleIds.has(itemId))
  );
  if (blockedEntries.length === 0 && blockedCashflows.length === 0) {
    return { response, diagnostics: [] };
  }

  const blockedEntrySet = new Set(blockedEntries);
  const blockedCashflowIds = new Set(blockedCashflows.map((item) => item.itemId));
  let reconciledFinancePatch = {
    ...financePatch,
    ledgerEntries: financePatch.ledgerEntries.filter((entry) => !blockedEntrySet.has(entry)),
    upsertCashflows: financePatch.upsertCashflows.filter(
      (item) => !blockedCashflowIds.has(item.itemId)
    )
  };
  const blockedCashAmount = blockedEntries
    .filter((entry) => entry.account === 'cash')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const blockedBankAmount = blockedEntries
    .filter((entry) => entry.account === 'bank')
    .reduce((sum, entry) => sum + entry.amount, 0);
  reconciledFinancePatch = addBlockedExpenseBack(
    reconciledFinancePatch,
    'cash',
    blockedCashAmount
  );
  reconciledFinancePatch = addBlockedExpenseBack(
    reconciledFinancePatch,
    'bank',
    blockedBankAmount
  );

  return {
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        financePatch: reconciledFinancePatch
      }
    },
    diagnostics: [{
      path: ['writeback', 'financePatch'],
      code: 'asset_purchase_atomicity_blocked',
      message: `车辆 ${[...missingVehicleIds].join(', ')} 最终未形成合法资产；已阻止 ${blockedEntries.length} 条关联购车流水和 ${blockedCashflows.length} 条关联支出，并只撤销对应账户金额。`
    }]
  };
}
