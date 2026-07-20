import type { AssetItem, AssetItemId, RuntimeAssetsState, RuntimeState, StandardAssetItem } from '../runtime/types';

export const EQUIPMENT_SLOT_LIMIT = 3;

function isEquipmentAsset(item: AssetItem | undefined): item is StandardAssetItem {
  return item?.category === 'equipment';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeEquipmentNames(names: string[]): string[] {
  return unique(names.map((name) => name.trim()).filter(Boolean)).slice(0, EQUIPMENT_SLOT_LIMIT);
}

function isInternalAssetId(value: string): boolean {
  return /^asset_[a-z0-9_:-]+$/i.test(value.trim());
}

function cloneAssets(assets: RuntimeAssetsState): RuntimeAssetsState {
  return {
    items: { ...assets.items },
    equippedItemIds: [...(assets.equippedItemIds ?? [])]
  };
}

function nextEquipmentItemId(items: RuntimeAssetsState['items']): AssetItemId {
  let index = Object.keys(items).length + 1;
  let itemId = `asset_equipment_${String(index).padStart(4, '0')}`;
  while (itemId in items) {
    index += 1;
    itemId = `asset_equipment_${String(index).padStart(4, '0')}`;
  }
  return itemId;
}

function findEquipmentItemIdByName(assets: RuntimeAssetsState, name: string): AssetItemId | undefined {
  return Object.values(assets.items).find((item) => isEquipmentAsset(item) && item.name.trim() === name)?.itemId;
}

function resolveEquipmentItemId(assets: RuntimeAssetsState, value: string): AssetItemId | undefined {
  const directItem = assets.items[value];
  if (isEquipmentAsset(directItem)) return directItem.itemId;
  return findEquipmentItemIdByName(assets, value);
}

function createEquipmentItem(state: RuntimeState, itemId: AssetItemId, name: string): StandardAssetItem {
  return {
    itemId,
    category: 'equipment',
    name,
    summary: `当前装备：${name}`,
    detail: '由开局或结构化写回生成的玩家装备，作为真实物品进入物品与资产系统。',
    acquiredAt: { ...state.time },
    relatedActorIds: [state.player.actorId],
    relatedCaseIds: [],
    relatedPlaceIds: [state.location.currentPlaceId],
    visibility: 'player_known',
    importance: 50
  };
}

export function normalizeEquippedItemIds(assets: RuntimeAssetsState): AssetItemId[] {
  return unique(assets.equippedItemIds ?? [])
    .filter((itemId) => isEquipmentAsset(assets.items[itemId]))
    .slice(0, EQUIPMENT_SLOT_LIMIT);
}

export function toggleEquippedItem(assets: RuntimeAssetsState, itemId: AssetItemId): RuntimeAssetsState {
  if (!isEquipmentAsset(assets.items[itemId])) {
    return {
      ...assets,
      equippedItemIds: normalizeEquippedItemIds(assets)
    };
  }

  const next = cloneAssets(assets);
  const current = normalizeEquippedItemIds(next);
  if (current.includes(itemId)) {
    next.equippedItemIds = current.filter((existingItemId) => existingItemId !== itemId);
    return next;
  }

  if (current.length < EQUIPMENT_SLOT_LIMIT) {
    next.equippedItemIds = [...current, itemId];
  } else {
    next.equippedItemIds = [itemId, ...current.slice(1)];
  }
  return next;
}

export function applyEquippedAssetsToRuntimeState(state: RuntimeState): RuntimeState {
  const equippedItemIds = normalizeEquippedItemIds(state.assets);
  const equipmentNames = equippedItemIds
    .map((itemId) => state.assets.items[itemId])
    .filter(isEquipmentAsset)
    .map((item) => item.name);
  const playerActor = state.actors[state.player.actorId];
  const actors = playerActor
    ? {
        ...state.actors,
        [state.player.actorId]: {
          ...playerActor,
          equipment: [...equipmentNames]
        }
      }
    : state.actors;

  return {
    ...state,
    player: {
      ...state.player,
      equipment: [...equipmentNames]
    },
    actors,
    assets: {
      ...state.assets,
      equippedItemIds
    }
  };
}

export function syncPlayerEquipmentAssetsFromNames(state: RuntimeState, equipmentNames: string[]): RuntimeState {
  const names = normalizeEquipmentNames(equipmentNames);
  const assets = cloneAssets(state.assets);
  const equippedItemIds = names.flatMap((name) => {
    const existingItemId = resolveEquipmentItemId(assets, name);
    if (existingItemId) return [existingItemId];
    if (isInternalAssetId(name)) return [];

    const itemId = nextEquipmentItemId(assets.items);
    assets.items[itemId] = createEquipmentItem(state, itemId, name);
    return [itemId];
  });

  return applyEquippedAssetsToRuntimeState({
    ...state,
    assets: {
      ...assets,
      equippedItemIds
    }
  });
}
