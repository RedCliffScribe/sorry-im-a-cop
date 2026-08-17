import type {
  FinanceAccount,
  FinanceCashflowItem,
  FinanceLedgerEntry,
  GameTime,
  MonthlyFinanceReport,
  PlayerEconomy,
  PlayerProfile,
  RuntimeFinanceState
} from '../runtime/types';
import { normalizeLegacyMoneyAmount } from './moneyAmount';

type LegacyPlayerEconomy = Partial<PlayerEconomy> & { money?: number };
type LegacyFinanceState = Partial<RuntimeFinanceState> & { moneyHKD?: number };
type LegacyCashflowItem = Partial<FinanceCashflowItem> & { amountHKD?: number };
type LegacyLedgerEntry = Partial<FinanceLedgerEntry> & { amountHKD?: number };
type LegacyMonthlyReport = Partial<MonthlyFinanceReport> & {
  incomeHKD?: number;
  expenseHKD?: number;
  netHKD?: number;
  startingMoneyHKD?: number;
  endingMoneyHKD?: number;
};

const normalizeAccount = (value: unknown, fallback: FinanceAccount): FinanceAccount =>
  value === 'cash' || value === 'bank' ? value : fallback;

const normalizeIdentityBinding = (value: unknown): FinanceCashflowItem['identityBinding'] =>
  value === 'civilian' || value === 'gang_member' || value === 'police' ? value : undefined;

export const formatMonthKey = (time: GameTime): string =>
  `${String(time.year).padStart(4, '0')}-${String(time.month).padStart(2, '0')}`;

export const createInitialFinanceState = (time: GameTime, economy: PlayerEconomy): RuntimeFinanceState => ({
  cashOnHand: normalizeLegacyMoneyAmount(economy.cashOnHand),
  bankBalance: normalizeLegacyMoneyAmount(economy.bankBalance),
  cashflows: {},
  ledger: [],
  reports: [],
  lastSettledMonthKey: formatMonthKey(time),
  summary: economy.financeSummary
});

function normalizeCashflows(raw: LegacyFinanceState['cashflows']): Record<string, FinanceCashflowItem> {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([itemId, rawItem]) => {
      if (!rawItem || typeof rawItem !== 'object') return [];
      const item = rawItem as LegacyCashflowItem;
      return [[itemId, {
        itemId: item.itemId || itemId,
        direction: item.direction === 'expense' ? 'expense' : 'income',
        kind: item.kind ?? 'other',
        title: item.title || '未命名定期收支',
        amount: normalizeLegacyMoneyAmount(item.amount ?? item.amountHKD),
        account: normalizeAccount(item.account, 'bank'),
        identityBinding: normalizeIdentityBinding(item.identityBinding),
        summary: item.summary || '',
        activeFromMonth: item.activeFromMonth || '',
        activeToMonth: item.activeToMonth,
        relatedAssetItemIds: Array.isArray(item.relatedAssetItemIds) ? [...item.relatedAssetItemIds] : [],
        relatedActorIds: Array.isArray(item.relatedActorIds) ? [...item.relatedActorIds] : [],
        relatedPlaceIds: Array.isArray(item.relatedPlaceIds) ? [...item.relatedPlaceIds] : [],
        source: item.source ?? 'writeback',
        status: item.status ?? 'active',
        visibility: item.visibility ?? 'player_known'
      } satisfies FinanceCashflowItem]];
    })
  );
}

function normalizeLedger(raw: LegacyFinanceState['ledger']): FinanceLedgerEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((rawEntry, index) => {
    if (!rawEntry || typeof rawEntry !== 'object') return [];
    const entry = rawEntry as LegacyLedgerEntry;
    if (!entry.gameTime) return [];
    return [{
      entryId: entry.entryId || `finance_ledger_${String(index + 1).padStart(4, '0')}`,
      gameTime: { ...entry.gameTime },
      direction: entry.direction ?? 'adjustment',
      amount: normalizeLegacyMoneyAmount(entry.amount ?? entry.amountHKD),
      account: normalizeAccount(entry.account, 'cash'),
      title: entry.title || '财务调整',
      summary: entry.summary || '',
      relatedCashflowItemId: entry.relatedCashflowItemId,
      relatedAssetItemIds: Array.isArray(entry.relatedAssetItemIds) ? [...entry.relatedAssetItemIds] : [],
      relatedActorIds: Array.isArray(entry.relatedActorIds) ? [...entry.relatedActorIds] : [],
      relatedPlaceIds: Array.isArray(entry.relatedPlaceIds) ? [...entry.relatedPlaceIds] : [],
      source: entry.source ?? 'writeback',
      visibility: entry.visibility ?? 'player_known'
    } satisfies FinanceLedgerEntry];
  }).slice(-80);
}

function normalizeReports(raw: LegacyFinanceState['reports']): MonthlyFinanceReport[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((rawReport, index) => {
    if (!rawReport || typeof rawReport !== 'object') return [];
    const report = rawReport as LegacyMonthlyReport;
    if (!report.generatedAt) return [];
    const startingCashOnHand = normalizeLegacyMoneyAmount(report.startingCashOnHand);
    const endingCashOnHand = normalizeLegacyMoneyAmount(report.endingCashOnHand);
    return [{
      reportId: report.reportId || `finance_report_legacy_${index + 1}`,
      monthKey: report.monthKey || formatMonthKey(report.generatedAt),
      generatedAt: { ...report.generatedAt },
      income: normalizeLegacyMoneyAmount(report.income ?? report.incomeHKD),
      expense: normalizeLegacyMoneyAmount(report.expense ?? report.expenseHKD),
      net: Math.trunc(report.net ?? report.netHKD ?? 0),
      startingCashOnHand,
      startingBankBalance: normalizeLegacyMoneyAmount(report.startingBankBalance ?? report.startingMoneyHKD),
      endingCashOnHand,
      endingBankBalance: normalizeLegacyMoneyAmount(report.endingBankBalance ?? report.endingMoneyHKD),
      itemSummaries: Array.isArray(report.itemSummaries) ? [...report.itemSummaries] : [],
      read: Boolean(report.read),
      archived: Boolean(report.archived)
    } satisfies MonthlyFinanceReport];
  }).slice(-3);
}

export const normalizeFinanceState = (
  finance: RuntimeFinanceState | undefined,
  time: GameTime,
  economy: PlayerEconomy
): RuntimeFinanceState => {
  const legacyEconomy = economy as LegacyPlayerEconomy;
  const legacyFinance = (finance ?? {}) as LegacyFinanceState;
  const shouldMigrateLegacyEconomyMoney =
    finance === undefined && Number.isFinite(Number(legacyEconomy.money));
  const shouldMigrateLegacyFinanceMoney =
    !Number.isFinite(Number(legacyFinance.cashOnHand)) &&
    !Number.isFinite(Number(legacyFinance.bankBalance)) &&
    Number.isFinite(Number(legacyFinance.moneyHKD));
  const hasCanonicalBalances =
    Number.isFinite(legacyFinance.cashOnHand) ||
    Number.isFinite(legacyFinance.bankBalance) ||
    Number.isFinite(legacyEconomy.cashOnHand) ||
    Number.isFinite(legacyEconomy.bankBalance);
  const legacyTotal = normalizeLegacyMoneyAmount(legacyFinance.moneyHKD ?? legacyEconomy.money);
  const shouldMigrateLegacyWallet = shouldMigrateLegacyEconomyMoney || shouldMigrateLegacyFinanceMoney;
  const cashOnHand = !shouldMigrateLegacyWallet && hasCanonicalBalances
    ? normalizeLegacyMoneyAmount(legacyFinance.cashOnHand ?? legacyEconomy.cashOnHand)
    : 0;
  const bankBalance = !shouldMigrateLegacyWallet && hasCanonicalBalances
    ? normalizeLegacyMoneyAmount(legacyFinance.bankBalance ?? legacyEconomy.bankBalance)
    : legacyTotal;

  return {
    cashOnHand,
    bankBalance,
    cashflows: normalizeCashflows(legacyFinance.cashflows),
    ledger: normalizeLedger(legacyFinance.ledger),
    reports: normalizeReports(legacyFinance.reports),
    lastSettledMonthKey: legacyFinance.lastSettledMonthKey || formatMonthKey(time),
    summary: legacyFinance.summary || legacyEconomy.financeSummary || '暂无稳定收支记录。'
  };
};

export const syncPlayerEconomyWithFinance = (
  player: PlayerProfile,
  finance: RuntimeFinanceState
): PlayerProfile => ({
  ...player,
  economy: {
    ...player.economy,
    cashOnHand: finance.cashOnHand,
    bankBalance: finance.bankBalance,
    financeSummary: finance.summary
  }
});

export const upsertCashflow = (
  finance: RuntimeFinanceState,
  item: FinanceCashflowItem
): RuntimeFinanceState => ({
  ...finance,
  cashflows: {
    ...finance.cashflows,
    [item.itemId]: item
  }
});

export const removeCashflow = (finance: RuntimeFinanceState, itemId: string): RuntimeFinanceState => {
  const existing = finance.cashflows[itemId];
  if (!existing) return finance;
  return upsertCashflow(finance, { ...existing, status: 'ended' });
};

export const appendLedgerEntry = (
  finance: RuntimeFinanceState,
  entry: FinanceLedgerEntry
): RuntimeFinanceState => ({
  ...finance,
  ledger: [...finance.ledger, entry].slice(-80)
});
