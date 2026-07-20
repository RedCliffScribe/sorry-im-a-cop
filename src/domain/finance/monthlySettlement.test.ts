import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { upsertCashflow } from './financeState';
import { applyDueMonthlySettlements } from './monthlySettlement';

describe('monthly finance settlement', () => {
  it('does not settle again inside the same month', () => {
    const state = createInitialRuntimeState();
    const next = applyDueMonthlySettlements(state, state.time, 'turn_0001');

    expect(next.finance.reports).toHaveLength(0);
    expect(next.finance.lastSettledMonthKey).toBe(state.finance.lastSettledMonthKey);
  });

  it('settles active cashflows when the game time enters a later month', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      startTime: { year: 1988, month: 8, day: 31, hour: 23, minute: 50 }
    });
    state.finance.bankBalance = 1000;
    state.player.economy.bankBalance = 1000;
    state.finance = upsertCashflow(state.finance, {
      itemId: 'salary_spc_1988',
      direction: 'income',
      kind: 'salary',
      title: '警队月薪',
      amount: 4200,
      account: 'bank',
      summary: '高级警员固定月薪。',
      activeFromMonth: '1988-08',
      relatedAssetItemIds: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      source: 'opening',
      status: 'active',
      visibility: 'private'
    });
    state.finance = upsertCashflow(state.finance, {
      itemId: 'rent_sham_shui_po_1988',
      direction: 'expense',
      kind: 'rent',
      title: '深水埗房租',
      amount: 800,
      account: 'bank',
      summary: '每月房租。',
      activeFromMonth: '1988-08',
      relatedAssetItemIds: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      source: 'opening',
      status: 'active',
      visibility: 'private'
    });

    const next = applyDueMonthlySettlements(
      state,
      { year: 1988, month: 9, day: 1, hour: 0, minute: 10 },
      'turn_0002'
    );

    expect(next.finance.bankBalance).toBe(4400);
    expect(next.player.economy.bankBalance).toBe(4400);
    expect(next.finance.lastSettledMonthKey).toBe('1988-09');
    expect(next.finance.reports[0]).toMatchObject({
      monthKey: '1988-08',
      income: 4200,
      expense: 800,
      net: 3400,
      startingBankBalance: 1000,
      endingBankBalance: 4400,
      read: false,
      archived: false
    });
    expect(next.finance.ledger.at(-1)).toMatchObject({
      direction: 'income',
      amount: 3400,
      title: '1988-08 月度结算',
      source: 'monthly_settlement'
    });
  });

  it('settles missed months and keeps only the latest three reports', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      startTime: { year: 1988, month: 8, day: 1, hour: 8, minute: 0 }
    });
    state.finance = upsertCashflow(state.finance, {
      itemId: 'small_salary',
      direction: 'income',
      kind: 'salary',
      title: '固定收入',
      amount: 1000,
      account: 'bank',
      summary: '测试用固定收入。',
      activeFromMonth: '1988-08',
      relatedAssetItemIds: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      source: 'opening',
      status: 'active',
      visibility: 'private'
    });

    const next = applyDueMonthlySettlements(
      state,
      { year: 1988, month: 12, day: 1, hour: 8, minute: 0 },
      'turn_0009'
    );

    expect(next.finance.bankBalance).toBe(4000);
    expect(next.finance.lastSettledMonthKey).toBe('1988-12');
    expect(next.finance.reports.map((report) => report.monthKey)).toEqual(['1988-09', '1988-10', '1988-11']);
  });
});
