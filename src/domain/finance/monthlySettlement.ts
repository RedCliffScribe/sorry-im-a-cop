import { appendLedgerEntry, formatMonthKey, syncPlayerEconomyWithFinance } from './financeState';
import { formatCurrencyAmount } from '../worldpack/economyConfig';
import type {
  FinanceAccount,
  FinanceCashflowItem,
  GameTime,
  MonthlyFinanceReport,
  RuntimeFinanceState,
  RuntimeState
} from '../runtime/types';

function cloneGameTime(time: GameTime): GameTime {
  return { ...time };
}

function nextMonthKey(monthKey: string): string {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const nextYear = month >= 12 ? year + 1 : year;
  const nextMonth = month >= 12 ? 1 : month + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

function isCashflowActiveForMonth(item: FinanceCashflowItem, monthKey: string): boolean {
  if (item.status !== 'active') return false;
  if (item.activeFromMonth > monthKey) return false;
  if (item.activeToMonth && item.activeToMonth < monthKey) return false;
  return true;
}

function settlementDirection(net: number): 'income' | 'expense' | 'adjustment' {
  if (net > 0) return 'income';
  if (net < 0) return 'expense';
  return 'adjustment';
}

function sumByDirection(items: FinanceCashflowItem[], direction: 'income' | 'expense'): number {
  return items.filter((item) => item.direction === direction).reduce((sum, item) => sum + item.amount, 0);
}

function accountNet(items: FinanceCashflowItem[], account: FinanceAccount): number {
  const matching = items.filter((item) => item.account === account);
  return sumByDirection(matching, 'income') - sumByDirection(matching, 'expense');
}

function applySingleMonthSettlement(
  finance: RuntimeFinanceState,
  monthKey: string,
  generatedAt: GameTime,
  turnId: string,
  worldpackId: string
): RuntimeFinanceState {
  const activeItems = Object.values(finance.cashflows).filter((item) => isCashflowActiveForMonth(item, monthKey));
  const income = sumByDirection(activeItems, 'income');
  const expense = sumByDirection(activeItems, 'expense');
  const net = income - expense;
  const cashNet = accountNet(activeItems, 'cash');
  const bankNet = accountNet(activeItems, 'bank');
  const startingCashOnHand = finance.cashOnHand;
  const startingBankBalance = finance.bankBalance;
  const endingCashOnHand = Math.max(0, startingCashOnHand + cashNet);
  const endingBankBalance = Math.max(0, startingBankBalance + bankNet);
  const itemSummaries = activeItems.map(
    (item) => `${item.direction === 'income' ? '收入' : '支出'}：${item.title} ${formatCurrencyAmount(item.amount, worldpackId)}；${item.summary}`
  );
  const report: MonthlyFinanceReport = {
    reportId: `finance_report_${monthKey}_${turnId}`,
    monthKey,
    generatedAt: cloneGameTime(generatedAt),
    income,
    expense,
    net,
    startingCashOnHand,
    startingBankBalance,
    endingCashOnHand,
    endingBankBalance,
    itemSummaries,
    read: false,
    archived: false
  };
  const summary =
    net > 0
      ? `本月结余 ${formatCurrencyAmount(net, worldpackId)}。`
      : net < 0
        ? `本月入不敷出 ${formatCurrencyAmount(Math.abs(net), worldpackId)}。`
        : '本月收支相抵。';

  let next: RuntimeFinanceState = {
    ...finance,
    cashOnHand: endingCashOnHand,
    bankBalance: endingBankBalance,
    reports: [...finance.reports, report].slice(-3),
    lastSettledMonthKey: nextMonthKey(monthKey),
    summary
  };

  for (const [account, amount] of [['cash', cashNet], ['bank', bankNet]] as const) {
    if (amount === 0) continue;
    next = appendLedgerEntry(next, {
      entryId: `finance_settlement_${monthKey}_${turnId}_${account}`,
      gameTime: cloneGameTime(generatedAt),
      direction: settlementDirection(amount),
      amount: Math.abs(amount),
      account,
      title: `${monthKey} 月度结算`,
      summary: `${account === 'cash' ? '现金' : '银行账户'}本月净变动 ${formatCurrencyAmount(amount, worldpackId)}。`,
      relatedAssetItemIds: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      source: 'monthly_settlement',
      visibility: 'private'
    });
  }

  return next;
}

export function applyDueMonthlySettlements(state: RuntimeState, currentTime: GameTime, turnId: string): RuntimeState {
  const currentMonthKey = formatMonthKey(currentTime);
  let settlementMonthKey = state.finance.lastSettledMonthKey;
  if (settlementMonthKey >= currentMonthKey) return state;

  let finance: RuntimeFinanceState = {
    ...state.finance,
    cashflows: { ...state.finance.cashflows },
    ledger: [...state.finance.ledger],
    reports: [...state.finance.reports]
  };

  while (settlementMonthKey < currentMonthKey) {
    finance = applySingleMonthSettlement(finance, settlementMonthKey, currentTime, turnId, state.world.worldpackId);
    settlementMonthKey = finance.lastSettledMonthKey;
  }

  return {
    ...state,
    finance,
    player: syncPlayerEconomyWithFinance(state.player, finance)
  };
}
