import type { FinanceCashflowItem, FinanceLedgerEntry, MonthlyFinanceReport, RuntimeState } from '../runtime/types';
import { getWorldCurrencyConfig, type WorldCurrencyConfig } from '../worldpack/economyConfig';

export interface FinanceProjection {
  currency: WorldCurrencyConfig;
  cashOnHand: number;
  bankBalance: number;
  summary: string;
  monthlyIncome: number;
  monthlyExpense: number;
  netMonthly: number;
  activeCashflows: FinanceCashflowItem[];
  recentLedger: FinanceLedgerEntry[];
  latestReports: MonthlyFinanceReport[];
  diagnostics: {
    activeCashflowCount: number;
    projectedCashflowCount: number;
    ledgerCount: number;
    projectedLedgerCount: number;
    reportCount: number;
    projectedReportCount: number;
  };
}

const MAX_PROMPT_CASHFLOWS = 6;
const MAX_PROMPT_LEDGER = 5;
const MAX_PROMPT_REPORTS = 2;

export const projectFinanceContext = (state: RuntimeState): FinanceProjection => {
  const activeCashflows = Object.values(state.finance.cashflows).filter((item) => item.status === 'active');
  const monthlyIncome = activeCashflows
    .filter((item) => item.direction === 'income')
    .reduce((sum, item) => sum + item.amount, 0);
  const monthlyExpense = activeCashflows
    .filter((item) => item.direction === 'expense')
    .reduce((sum, item) => sum + item.amount, 0);
  const projectedCashflows = activeCashflows.slice(0, MAX_PROMPT_CASHFLOWS);
  const recentLedger = state.finance.ledger.slice(-MAX_PROMPT_LEDGER).reverse();
  const latestReports = state.finance.reports.slice(-MAX_PROMPT_REPORTS).reverse();

  return {
    currency: getWorldCurrencyConfig(state.world.worldpackId),
    cashOnHand: state.finance.cashOnHand,
    bankBalance: state.finance.bankBalance,
    summary: state.finance.summary,
    monthlyIncome,
    monthlyExpense,
    netMonthly: monthlyIncome - monthlyExpense,
    activeCashflows: projectedCashflows,
    recentLedger,
    latestReports,
    diagnostics: {
      activeCashflowCount: activeCashflows.length,
      projectedCashflowCount: projectedCashflows.length,
      ledgerCount: state.finance.ledger.length,
      projectedLedgerCount: recentLedger.length,
      reportCount: state.finance.reports.length,
      projectedReportCount: latestReports.length
    }
  };
};
