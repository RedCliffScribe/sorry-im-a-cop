import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { AssetItem, RuntimeAssetsState } from '../runtime/types';
import {
  applyEquippedAssetsToRuntimeState,
  normalizeEquippedItemIds,
  syncPlayerEquipmentAssetsFromNames,
  toggleEquippedItem
} from './equipmentSlots';

function equipment(itemId: string, name: string): AssetItem {
  return {
    itemId,
    category: 'equipment',
    name,
    summary: `${name} summary`,
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    visibility: 'player_known',
    importance: 50
  };
}

function generalItem(itemId: string, name: string): AssetItem {
  return {
    itemId,
    category: 'general',
    name,
    summary: `${name} summary`,
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    visibility: 'player_known',
    importance: 50
  };
}

describe('equipment slots', () => {
  it('normalizes equipped ids to existing equipment items only and caps at three slots', () => {
    const assets: RuntimeAssetsState = {
      items: {
        baton: equipment('baton', 'Baton'),
        radio: equipment('radio', 'Radio'),
        revolver: equipment('revolver', 'Revolver'),
        notebook: equipment('notebook', 'Notebook'),
        wallet: generalItem('wallet', 'Wallet')
      },
      equippedItemIds: ['baton', 'missing', 'wallet', 'radio', 'revolver', 'notebook']
    };

    expect(normalizeEquippedItemIds(assets)).toEqual(['baton', 'radio', 'revolver']);
  });

  it('toggles equipment on and off while replacing the first slot when full', () => {
    const assets: RuntimeAssetsState = {
      items: {
        baton: equipment('baton', 'Baton'),
        radio: equipment('radio', 'Radio'),
        revolver: equipment('revolver', 'Revolver'),
        flashlight: equipment('flashlight', 'Flashlight'),
        wallet: generalItem('wallet', 'Wallet')
      },
      equippedItemIds: ['baton', 'radio', 'revolver']
    };

    const afterUnequip = toggleEquippedItem(assets, 'radio');
    expect(afterUnequip.equippedItemIds).toEqual(['baton', 'revolver']);

    const afterIgnored = toggleEquippedItem(afterUnequip, 'wallet');
    expect(afterIgnored.equippedItemIds).toEqual(['baton', 'revolver']);

    const afterEquip = toggleEquippedItem(afterIgnored, 'flashlight');
    expect(afterEquip.equippedItemIds).toEqual(['baton', 'revolver', 'flashlight']);

    const afterReplace = toggleEquippedItem(afterEquip, 'radio');
    expect(afterReplace.equippedItemIds).toEqual(['radio', 'revolver', 'flashlight']);
  });

  it('mirrors equipped asset names into player and player actor equipment text', () => {
    const state = createInitialRuntimeState();
    const next = applyEquippedAssetsToRuntimeState({
      ...state,
      assets: {
        items: {
          baton: equipment('baton', 'Baton'),
          radio: equipment('radio', 'Radio')
        },
        equippedItemIds: ['baton', 'radio']
      }
    });

    expect(next.player.equipment).toEqual(['Baton', 'Radio']);
    expect(next.actors.player.equipment).toEqual(['Baton', 'Radio']);
  });

  it('resolves existing equipment ids from player equipment writeback without leaking ids as names', () => {
    const state = createInitialRuntimeState();
    state.assets.items.asset_equipment_0004 = equipment('asset_equipment_0004', '史密斯威森M10左轮手枪');

    const next = syncPlayerEquipmentAssetsFromNames(state, ['asset_equipment_0004', '警棍及手铐']);

    expect(next.assets.equippedItemIds).toEqual(['asset_equipment_0004', 'asset_equipment_0002']);
    expect(next.player.equipment).toEqual(['史密斯威森M10左轮手枪', '警棍及手铐']);
    expect(Object.values(next.assets.items).some((item) => item.name === 'asset_equipment_0004')).toBe(false);
  });

  it('drops unresolved internal asset ids instead of creating player-facing equipment names', () => {
    const state = createInitialRuntimeState();

    const next = syncPlayerEquipmentAssetsFromNames(state, ['asset_missing_0001', 'Motorola 对讲机']);

    expect(next.player.equipment).toEqual(['Motorola 对讲机']);
    expect(Object.values(next.assets.items).some((item) => item.name === 'asset_missing_0001')).toBe(false);
  });
});
