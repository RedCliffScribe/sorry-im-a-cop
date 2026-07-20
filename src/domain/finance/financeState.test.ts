import { describe, expect, it } from 'vitest';
import type { RuntimeFinanceState } from '../runtime/types';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  appendLedgerEntry,
  createInitialFinanceState,
  formatMonthKey,
  normalizeFinanceState,
  removeCashflow,
  syncPlayerEconomyWithFinance,
  upsertCashflow
} from './financeState';

describe('financeState helpers', () => {
  it('formats month keys from game time', () => {
    expect(formatMonthKey({ year: 1988, month: 9, day: 12, hour: 21, minute: 15 })).toBe('1988-09');
  });

  it('creates initial finance state from canonical economy balances', () => {
    const state = createInitialRuntimeState();
    const finance = createInitialFinanceState(state.time, {
      ...state.player.economy,
      bankBalance: 2350,
      financeSummary: '工资刚够用。'
    });

    expect(finance.bankBalance).toBe(2350);
    expect(finance.summary).toBe('工资刚够用。');
    expect(finance.lastSettledMonthKey).toBe('1988-06');
  });

  it('migrates a legacy single wallet into bank balance', () => {
    const state = createInitialRuntimeState();
    const finance = normalizeFinanceState(
      { moneyHKD: 2350 } as unknown as RuntimeFinanceState,
      state.time,
      { money: 2350, financeSummary: '工资刚够用。' } as unknown as typeof state.player.economy
    );

    expect(finance.cashOnHand).toBe(0);
    expect(finance.bankBalance).toBe(2350);
  });

  it('upserts and removes cashflow items', () => {
    const state = createInitialRuntimeState();
    const withIncome = upsertCashflow(state.finance, {
      itemId: 'salary_1988_pc',
      direction: 'income',
      kind: 'salary',
      title: '警队月薪',
      amount: 4200,
      account: 'bank',
      summary: '基层警员固定月薪。',
      activeFromMonth: '1988-09',
      relatedAssetItemIds: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      source: 'opening',
      status: 'active',
      visibility: 'private'
    });

    expect(withIncome.cashflows.salary_1988_pc.amount).toBe(4200);
    expect(removeCashflow(withIncome, 'salary_1988_pc').cashflows.salary_1988_pc.status).toBe('ended');
  });

  it('keeps player economy mirrored from finance', () => {
    const state = createInitialRuntimeState();
    const finance = { ...state.finance, bankBalance: 999, summary: '现金紧张。' };
    const player = syncPlayerEconomyWithFinance(state.player, finance);

    expect(player.economy.bankBalance).toBe(999);
    expect(player.economy.financeSummary).toBe('现金紧张。');
  });

  it('normalizes malformed finance state to safe arrays and maps', () => {
    const state = createInitialRuntimeState();
    const finance = normalizeFinanceState(
      {
        ...state.finance,
        cashflows: undefined,
        ledger: undefined,
        reports: undefined
      } as unknown as RuntimeFinanceState,
      state.time,
      state.player.economy
    );

    expect(finance.cashflows).toEqual({});
    expect(finance.ledger).toEqual([]);
    expect(finance.reports).toEqual([]);
  });

  it('appends compact ledger entries without changing money', () => {
    const state = createInitialRuntimeState();
    const finance = appendLedgerEntry(state.finance, {
      entryId: 'entry_1',
      gameTime: state.time,
      direction: 'income',
      amount: 500,
      account: 'cash',
      title: '一次性收入',
      summary: '帮亲戚搬货得到的现金。',
      relatedAssetItemIds: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      source: 'writeback',
      visibility: 'private'
    });

    expect(finance.ledger).toHaveLength(1);
    expect(finance.bankBalance).toBe(0);
  });
});
