import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { applyFinancePatch } from './applyFinancePatch';

describe('applyFinancePatch ledger reconciliation', () => {
  it('adds a local ledger entry when an applied cash delta has no model-authored detail', () => {
    const state = createInitialRuntimeState();
    const finance = applyFinancePatch(
      { ...state.finance, cashOnHand: 200 },
      {
        cashDelta: -48,
        summary: '在德记茶餐厅支付了午饭费用。'
      },
      state.time
    );

    expect(finance.cashOnHand).toBe(152);
    expect(finance.ledger).toHaveLength(1);
    expect(finance.ledger[0]).toMatchObject({
      direction: 'expense',
      amount: 48,
      account: 'cash',
      title: '现金支出补记',
      summary: '在德记茶餐厅支付了午饭费用。',
      source: 'local_recovery'
    });
  });

  it('preserves an exact valid model-authored ledger entry without adding a duplicate', () => {
    const state = createInitialRuntimeState();
    const finance = applyFinancePatch(
      { ...state.finance, cashOnHand: 200 },
      {
        cashDelta: -48,
        ledgerEntries: [
          {
            direction: 'expense',
            amount: 48,
            account: 'cash',
            title: '德记午餐',
            summary: '午餐与冻柠茶。',
            relatedAssetItemIds: [],
            relatedActorIds: [],
            relatedPlaceIds: []
          }
        ]
      },
      state.time
    );

    expect(finance.ledger).toHaveLength(1);
    expect(finance.ledger[0]).toMatchObject({
      amount: 48,
      title: '德记午餐',
      summary: '午餐与冻柠茶。',
      source: 'writeback'
    });
  });

  it('keeps a single useful detail but corrects its amount to the applied balance change', () => {
    const state = createInitialRuntimeState();
    const finance = applyFinancePatch(
      { ...state.finance, cashOnHand: 200 },
      {
        cashDelta: -48,
        ledgerEntries: [
          {
            direction: 'expense',
            amount: 8,
            account: 'cash',
            title: '德记午餐',
            summary: '模型少写了一位金额。',
            relatedAssetItemIds: [],
            relatedActorIds: [],
            relatedPlaceIds: []
          }
        ]
      },
      state.time
    );

    expect(finance.ledger).toHaveLength(1);
    expect(finance.ledger[0]).toMatchObject({
      direction: 'expense',
      amount: 48,
      title: '德记午餐',
      summary: '模型少写了一位金额。',
      source: 'local_recovery'
    });
  });

  it('records the actual applied overdraft rather than the larger requested delta', () => {
    const state = createInitialRuntimeState();
    const finance = applyFinancePatch(
      { ...state.finance, cashOnHand: 30 },
      {
        cashDelta: -80,
        summary: '现金不足，实际只扣至零。'
      },
      state.time
    );

    expect(finance.cashOnHand).toBe(0);
    expect(finance.ledger[0]).toMatchObject({
      direction: 'expense',
      amount: 30,
      summary: '现金不足，实际只扣至零。',
      source: 'local_recovery'
    });
  });

  it('does not invent transaction history for opening or reconciliation balance sets', () => {
    const state = createInitialRuntimeState();
    const finance = applyFinancePatch(
      state.finance,
      {
        cashSet: 500,
        bankSet: 2_000,
        summary: '按开局账户结单建立余额。'
      },
      state.time
    );

    expect(finance.cashOnHand).toBe(500);
    expect(finance.bankBalance).toBe(2_000);
    expect(finance.ledger).toEqual([]);
  });
});
