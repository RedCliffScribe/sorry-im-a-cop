import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { projectFinanceContext } from './financeContextProjector';

describe('projectFinanceContext', () => {
  it('projects compact active finance facts for prompt use', () => {
    const state = createInitialRuntimeState();
    const projection = projectFinanceContext({
      ...state,
      finance: {
        ...state.finance,
        bankBalance: 2100,
        summary: '现金不宽裕。',
        cashflows: {
          salary: {
            itemId: 'salary',
            direction: 'income',
            kind: 'salary',
            title: '警队月薪',
            amount: 4200,
            account: 'bank',
            summary: '固定月薪。',
            activeFromMonth: '1988-09',
            relatedAssetItemIds: [],
            relatedActorIds: [],
            relatedPlaceIds: [],
            source: 'opening',
            status: 'active',
            visibility: 'private'
          },
          rent: {
            itemId: 'rent',
            direction: 'expense',
            kind: 'rent',
            title: '唐楼租金',
            amount: 900,
            account: 'bank',
            summary: '每月房租。',
            activeFromMonth: '1988-09',
            relatedAssetItemIds: [],
            relatedActorIds: [],
            relatedPlaceIds: [],
            source: 'writeback',
            status: 'active',
            visibility: 'private'
          },
          ended_support: {
            itemId: 'ended_support',
            direction: 'expense',
            kind: 'family_support',
            title: '旧家庭补贴',
            amount: 500,
            account: 'bank',
            summary: '已经结束的支出。',
            activeFromMonth: '1988-01',
            relatedAssetItemIds: [],
            relatedActorIds: [],
            relatedPlaceIds: [],
            source: 'writeback',
            status: 'ended',
            visibility: 'private'
          }
        },
        ledger: [
          {
            entryId: 'ledger_old',
            gameTime: state.time,
            direction: 'income',
            amount: 50,
            account: 'cash',
            title: '旧收入',
            summary: '较早的记录。',
            relatedAssetItemIds: [],
            relatedActorIds: [],
            relatedPlaceIds: [],
            source: 'writeback',
            visibility: 'private'
          },
          {
            entryId: 'ledger_new',
            gameTime: state.time,
            direction: 'expense',
            amount: 20,
            account: 'cash',
            title: '新支出',
            summary: '最近的记录。',
            relatedAssetItemIds: [],
            relatedActorIds: [],
            relatedPlaceIds: [],
            source: 'writeback',
            visibility: 'private'
          }
        ],
        reports: [
          {
            reportId: 'report_old',
            monthKey: '1988-08',
            generatedAt: state.time,
            income: 3000,
            expense: 2500,
            net: 500,
            startingCashOnHand: 0,
            endingCashOnHand: 0,
            startingBankBalance: 1000,
            endingBankBalance: 1500,
            itemSummaries: ['旧报告'],
            read: true,
            archived: false
          },
          {
            reportId: 'report_new',
            monthKey: '1988-09',
            generatedAt: state.time,
            income: 4200,
            expense: 900,
            net: 3300,
            startingCashOnHand: 0,
            endingCashOnHand: 0,
            startingBankBalance: 1500,
            endingBankBalance: 4800,
            itemSummaries: ['新报告'],
            read: false,
            archived: false
          }
        ]
      }
    });

    expect(projection.bankBalance).toBe(2100);
    expect(projection.summary).toBe('现金不宽裕。');
    expect(projection.monthlyIncome).toBe(4200);
    expect(projection.monthlyExpense).toBe(900);
    expect(projection.netMonthly).toBe(3300);
    expect(projection.activeCashflows.map((item) => item.itemId)).toEqual(['salary', 'rent']);
    expect(projection.recentLedger.map((entry) => entry.entryId)).toEqual(['ledger_new', 'ledger_old']);
    expect(projection.latestReports.map((report) => report.reportId)).toEqual(['report_new', 'report_old']);
    expect(projection.diagnostics.activeCashflowCount).toBe(2);
    expect(projection.diagnostics.projectedCashflowCount).toBe(2);
    expect(projection.diagnostics.ledgerCount).toBe(2);
    expect(projection.diagnostics.reportCount).toBe(2);
  });
});
