import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { applyNarratorResponse } from '../writeback/applyWriteback';
import { validateNarratorResponse } from '../writeback/validateWriteback';
import {
  enforceAssetPurchaseWritebackAtomicity,
  reconcileVehicleAssetIntent,
  recoverVehicleAssetIntents
} from './assetWritebackIntent';

function createNarratorEnvelope(assetItem: unknown, financePatch?: unknown) {
  return {
    writebackVersion: '1.6',
    narrativeText: '车行办妥过户，玩家接过车钥匙。',
    turnSummary: '玩家完成车辆交接。',
    suggestedActions: ['检查车辆文件'],
    writeback: {
      assetPatch: {
        upsertItems: [assetItem],
        removeItems: []
      },
      ...(financePatch ? { financePatch } : {})
    }
  };
}

function createVehicle(overrides: Record<string, unknown> = {}) {
  return {
    itemId: 'asset_volvo_240',
    category: 'vehicle',
    name: '沃尔沃240旅行车',
    summary: '玩家在车行全款购入的灰色旅行车。',
    vehicleType: 'privateCar',
    holdingRelation: 'owned',
    condition: 'good',
    locationSummary: '停放在湾仔住宅附近的月租车位。',
    accessSummary: '玩家全款购入，持有过户文件和唯一车钥匙，可随时全权使用。',
    relatedActorIds: ['player'],
    relatedCaseIds: [],
    relatedPlaceIds: ['place_wan_chai_home'],
    importance: 70,
    visibility: 'player_known',
    ...overrides
  };
}

describe('vehicle asset writeback intent recovery', () => {
  it('accepts a Chinese access summary as an ordinary non-empty string', () => {
    const response = validateNarratorResponse(createNarratorEnvelope(createVehicle()));

    expect(response.writeback.assetPatch?.upsertItems).toContainEqual(
      expect.objectContaining({
        itemId: 'asset_volvo_240',
        accessSummary: '玩家全款购入，持有过户文件和唯一车钥匙，可随时全权使用。'
      })
    );
  });

  it('retains a rejected raw vehicle and reports the actual null field type', () => {
    const response = validateNarratorResponse(
      createNarratorEnvelope(createVehicle({ accessSummary: null }))
    );

    expect(response.writeback.assetPatch?.upsertItems).toEqual([]);
    expect(response.rawAssetUpsertItems).toHaveLength(1);
    expect(response.rawAssetUpsertItems?.[0]).toMatchObject({
      itemId: 'asset_volvo_240',
      accessSummary: null
    });
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'assetPatch', 'upsertItems', 0, 'accessSummary'],
        message: expect.stringContaining('rawType=null')
      })
    );
  });

  it('normalizes deterministic vehicle aliases and drops only an invalid optional mobility profile', () => {
    const response = validateNarratorResponse(
      createNarratorEnvelope(
        createVehicle({
          vehicleType: '私家车',
          holdingRelation: '全款购入',
          condition: '良好',
          mobilityProfile: {
            mode: 'car',
            timeMultiplier: null,
            availabilitySummary: '车况良好。'
          }
        })
      )
    );
    const vehicle = response.writeback.assetPatch?.upsertItems[0];

    expect(vehicle).toMatchObject({
      itemId: 'asset_volvo_240',
      category: 'vehicle',
      vehicleType: 'privateCar',
      holdingRelation: 'owned',
      condition: 'good'
    });
    expect(vehicle).not.toHaveProperty('mobilityProfile');
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        code: 'asset_repair_field_normalized',
        path: ['writeback', 'assetPatch', 'upsertItems', 0, 'mobilityProfile']
      })
    );
  });

  it('merges raw main facts with repair fields without letting null erase a valid access summary', () => {
    const reconciled = reconcileVehicleAssetIntent({
      rawMain: createVehicle({
        vehicleType: '私家车',
        locationSummary: undefined
      }),
      repair: {
        itemId: 'asset_volvo_240',
        category: 'vehicle',
        vehicleType: 'privateCar',
        locationSummary: '停放在湾仔住宅附近的月租车位。',
        accessSummary: null
      }
    });

    expect(reconciled.issues).toEqual([]);
    expect(reconciled.item).toMatchObject({
      itemId: 'asset_volvo_240',
      vehicleType: 'privateCar',
      locationSummary: '停放在湾仔住宅附近的月租车位。',
      accessSummary: '玩家全款购入，持有过户文件和唯一车钥匙，可随时全权使用。'
    });
  });

  it('does not let a repair response promote an existing borrowed vehicle to owned without a main-turn change', () => {
    const existing = validateNarratorResponse(
      createNarratorEnvelope(
        createVehicle({
          holdingRelation: 'borrowed',
          accessSummary: '只有车主不用车时，玩家才能借用。'
        })
      )
    ).writeback.assetPatch?.upsertItems[0];
    const reconciled = reconcileVehicleAssetIntent({
      existing,
      rawMain: {
        itemId: 'asset_volvo_240',
        category: 'vehicle',
        condition: 'poor'
      },
      repair: {
        itemId: 'asset_volvo_240',
        category: 'vehicle',
        holdingRelation: 'owned',
        condition: 'good'
      }
    });

    expect(reconciled.item).toMatchObject({
      holdingRelation: 'borrowed',
      condition: 'poor',
      accessSummary: '只有车主不用车时，玩家才能借用。'
    });
  });

  it('recovers one malformed vehicle without deleting a valid sibling asset', () => {
    const response = validateNarratorResponse({
      ...createNarratorEnvelope(createVehicle({ vehicleType: 'not-a-real-type' })),
      writeback: {
        assetPatch: {
          upsertItems: [
            createVehicle({ vehicleType: '私家车' }),
            {
              itemId: 'asset_key_ring',
              category: 'general',
              name: '备用钥匙圈',
              summary: '车行一并交付的备用钥匙圈。'
            }
          ],
          removeItems: []
        }
      }
    });
    const recovered = recoverVehicleAssetIntents(createInitialRuntimeState(), response);

    expect(recovered.response.writeback.assetPatch?.upsertItems).toHaveLength(2);
    expect(recovered.response.writeback.assetPatch?.upsertItems.map((item) => item.itemId)).toEqual(
      expect.arrayContaining(['asset_volvo_240', 'asset_key_ring'])
    );
  });
});

describe('vehicle purchase finance atomicity', () => {
  it('keeps a linked debit when the purchased vehicle is present', () => {
    const state = createInitialRuntimeState();
    state.finance.bankBalance = 100000;
    state.player.economy.bankBalance = 100000;
    const response = validateNarratorResponse(
      createNarratorEnvelope(createVehicle(), {
        bankDelta: -80000,
        summary: '全款购车。',
        ledgerEntries: [
          {
            direction: 'expense',
            amount: 80000,
            account: 'bank',
            title: '购买沃尔沃240',
            summary: '玩家从银行账户支付全款。',
            relatedAssetItemIds: ['asset_volvo_240']
          }
        ]
      })
    );
    const result = enforceAssetPurchaseWritebackAtomicity(state, response);
    const next = applyNarratorResponse(state, response);

    expect(result.response.writeback.financePatch?.bankDelta).toBe(-80000);
    expect(result.response.writeback.financePatch?.ledgerEntries).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
    expect(next.finance.bankBalance).toBe(20000);
    expect(next.finance.ledger).toContainEqual(
      expect.objectContaining({
        direction: 'expense',
        amount: 80000,
        relatedAssetItemIds: ['asset_volvo_240']
      })
    );
    expect(next.assets.items.asset_volvo_240).toMatchObject({
      category: 'vehicle',
      holdingRelation: 'owned'
    });
  });

  it('blocks only the linked vehicle debit when the vehicle cannot be made valid', () => {
    const state = createInitialRuntimeState();
    state.finance.bankBalance = 100000;
    state.player.economy.bankBalance = 100000;
    const response = validateNarratorResponse(
      createNarratorEnvelope(
        createVehicle({
          vehicleType: 'unrecognized_vehicle',
          accessSummary: null
        }),
        {
          bankDelta: -75000,
          summary: '购车支出与同日稿费收入。',
          ledgerEntries: [
            {
              direction: 'expense',
              amount: 80000,
              account: 'bank',
              title: '购买沃尔沃240',
              summary: '玩家从银行账户支付全款。',
              relatedAssetItemIds: ['asset_volvo_240']
            },
            {
              direction: 'income',
              amount: 5000,
              account: 'bank',
              title: '稿费到账',
              summary: '报社支付本月稿费。',
              relatedAssetItemIds: []
            }
          ]
        }
      )
    );
    const result = enforceAssetPurchaseWritebackAtomicity(state, response);
    const next = applyNarratorResponse(state, response);

    expect(result.response.writeback.assetPatch?.upsertItems).toEqual([]);
    expect(result.response.writeback.financePatch?.bankDelta).toBe(5000);
    expect(result.response.writeback.financePatch?.ledgerEntries).toEqual([
      expect.objectContaining({ title: '稿费到账', amount: 5000 })
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'asset_purchase_atomicity_blocked' })
    );
    expect(next.finance.bankBalance).toBe(105000);
    expect(next.finance.ledger).toEqual([
      expect.objectContaining({ title: '稿费到账', amount: 5000 })
    ]);
    expect(next.assets.items.asset_volvo_240).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'asset_purchase_atomicity_blocked' })
    );
  });

  it('does not infer a purchase debit for an assigned or borrowed vehicle', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse(
      createNarratorEnvelope(
        createVehicle({
          holdingRelation: 'assigned',
          accessSummary: null
        }),
        {
          bankDelta: 1200,
          summary: '工资到账。',
          ledgerEntries: [
            {
              direction: 'income',
              amount: 1200,
              account: 'bank',
              title: '工资到账',
              summary: '警队发放工资。',
              relatedAssetItemIds: []
            }
          ]
        }
      )
    );
    const result = enforceAssetPurchaseWritebackAtomicity(state, response);

    expect(result.response.writeback.financePatch?.bankDelta).toBe(1200);
    expect(result.response.writeback.financePatch?.ledgerEntries).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });
});
