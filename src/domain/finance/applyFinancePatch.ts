import { appendLedgerEntry, removeCashflow, upsertCashflow } from './financeState';
import { addMoneyAmount, isMoneyAmount } from './moneyAmount';
import type {
  FinanceAccount,
  FinanceCashflowItem,
  FinanceLedgerEntry,
  GameTime,
  GrayLedgerEntry,
  RuntimeFinanceState
} from '../runtime/types';

const cloneGameTime = (time: GameTime): GameTime => ({ ...time });

function nextFinanceLedgerId(ledger: FinanceLedgerEntry[]): string {
  let index = ledger.length + 1;
  let entryId = `finance_ledger_${String(index).padStart(4, '0')}`;
  while (ledger.some((entry) => entry.entryId === entryId)) {
    index += 1;
    entryId = `finance_ledger_${String(index).padStart(4, '0')}`;
  }
  return entryId;
}

function nextGrayLedgerId(entries: GrayLedgerEntry[]): string {
  let index = entries.length + 1;
  let ledgerId = `gray_ledger_${String(index).padStart(4, '0')}`;
  while (entries.some((entry) => entry.ledgerId === ledgerId)) {
    index += 1;
    ledgerId = `gray_ledger_${String(index).padStart(4, '0')}`;
  }
  return ledgerId;
}

export interface FinanceLedgerEntryPatchInput
  extends Omit<FinanceLedgerEntry, 'entryId' | 'gameTime' | 'source' | 'visibility'> {
  entryId?: string;
  gameTime?: GameTime;
  source?: FinanceLedgerEntry['source'];
  visibility?: FinanceLedgerEntry['visibility'];
}

export interface FinancePatchInput {
  cashDelta?: number;
  cashSet?: number;
  bankDelta?: number;
  bankSet?: number;
  summary?: string;
  upsertCashflows?: FinanceCashflowItem[];
  removeCashflowItemIds?: string[];
  ledgerEntries?: FinanceLedgerEntryPatchInput[];
}

export interface LegacyEconomyPatchInput {
  moneyDelta?: number;
  moneySet?: number;
  financeSummary?: string;
}

export interface GrayLedgerEntryPatchInput
  extends Omit<GrayLedgerEntry, 'ledgerId' | 'gameTime' | 'visibility'> {
  ledgerId?: string;
  gameTime?: GameTime;
  visibility?: GrayLedgerEntry['visibility'];
}

export interface GrayLedgerPatchInput {
  entries?: GrayLedgerEntryPatchInput[];
}

const signedLedgerAmount = (entry: FinanceLedgerEntryPatchInput): number => {
  if (entry.direction === 'income') return entry.amount;
  if (entry.direction === 'expense') return -entry.amount;
  return 0;
};

function createRecoveredLedgerEntry(
  account: FinanceAccount,
  delta: number,
  summary: string | undefined,
  template?: FinanceLedgerEntryPatchInput
): FinanceLedgerEntryPatchInput {
  if (template) {
    return {
      ...template,
      amount: Math.abs(delta),
      source: 'local_recovery'
    };
  }

  const accountLabel = account === 'cash' ? '现金' : '银行账户';
  const directionLabel = delta < 0 ? '支出' : '收入';
  return {
    direction: delta < 0 ? 'expense' : 'income',
    amount: Math.abs(delta),
    account,
    title: `${accountLabel}${directionLabel}补记`,
    summary: summary?.trim() || '本地根据本回合实际余额变化补齐明细。',
    relatedAssetItemIds: [],
    relatedActorIds: [],
    relatedPlaceIds: [],
    source: 'local_recovery',
    visibility: 'player_known'
  };
}

/**
 * Keeps applied balance deltas and player-visible ledger entries consistent.
 * Model-authored details remain intact when they add up to the actual balance
 * change. Missing, partially missing, or contradictory entries are repaired
 * locally without asking the model to regenerate the turn.
 */
export function reconcileFinanceLedgerEntries(
  entries: FinanceLedgerEntryPatchInput[],
  appliedDeltas: Partial<Record<FinanceAccount, number>>,
  summary?: string
): FinanceLedgerEntryPatchInput[] {
  let reconciled = entries.map((entry) => ({
    ...entry,
    relatedAssetItemIds: [...entry.relatedAssetItemIds],
    relatedActorIds: [...entry.relatedActorIds],
    relatedPlaceIds: [...entry.relatedPlaceIds]
  }));

  for (const account of ['cash', 'bank'] as const) {
    const delta = appliedDeltas[account];
    if (delta === undefined || delta === 0) continue;

    const transactionEntries = reconciled.filter(
      (entry) => entry.account === account && entry.direction !== 'adjustment'
    );
    const recordedDelta = transactionEntries.reduce(
      (total, entry) => total + signedLedgerAmount(entry),
      0
    );
    if (recordedDelta === delta) continue;

    if (
      transactionEntries.length === 1 &&
      Math.sign(signedLedgerAmount(transactionEntries[0])) === Math.sign(delta)
    ) {
      const target = transactionEntries[0];
      reconciled = reconciled.map((entry) =>
        entry === target ? createRecoveredLedgerEntry(account, delta, summary, target) : entry
      );
      continue;
    }

    const canPreservePartialEntries =
      recordedDelta === 0 ||
      (Math.sign(recordedDelta) === Math.sign(delta) && Math.abs(recordedDelta) < Math.abs(delta));
    if (canPreservePartialEntries) {
      reconciled.push(createRecoveredLedgerEntry(account, delta - recordedDelta, summary));
      continue;
    }

    reconciled = reconciled.filter(
      (entry) => entry.account !== account || entry.direction === 'adjustment'
    );
    reconciled.push(createRecoveredLedgerEntry(account, delta, summary));
  }

  return reconciled;
}

export function applyFinancePatch(finance: RuntimeFinanceState, patch: FinancePatchInput | undefined, time: GameTime): RuntimeFinanceState {
  if (!patch) return finance;

  let next: RuntimeFinanceState = {
    ...finance,
    cashflows: { ...finance.cashflows },
    ledger: [...finance.ledger],
    reports: [...finance.reports]
  };

  const appliedDeltas: Partial<Record<FinanceAccount, number>> = {};
  if (patch.cashSet !== undefined) {
    if (isMoneyAmount(patch.cashSet)) {
      next = { ...next, cashOnHand: patch.cashSet };
    }
  } else if (patch.cashDelta !== undefined) {
    const before = next.cashOnHand;
    const result = addMoneyAmount(next.cashOnHand, patch.cashDelta);
    if (result.applied) {
      next = { ...next, cashOnHand: result.value };
      appliedDeltas.cash = result.value - before;
    }
  }
  if (patch.bankSet !== undefined) {
    if (isMoneyAmount(patch.bankSet)) {
      next = { ...next, bankBalance: patch.bankSet };
    }
  } else if (patch.bankDelta !== undefined) {
    const before = next.bankBalance;
    const result = addMoneyAmount(next.bankBalance, patch.bankDelta);
    if (result.applied) {
      next = { ...next, bankBalance: result.value };
      appliedDeltas.bank = result.value - before;
    }
  }
  if (patch.summary !== undefined) {
    next = { ...next, summary: patch.summary };
  }

  for (const item of patch.upsertCashflows ?? []) {
    next = upsertCashflow(next, {
      ...item,
      relatedAssetItemIds: [...item.relatedAssetItemIds],
      relatedActorIds: [...item.relatedActorIds],
      relatedPlaceIds: [...item.relatedPlaceIds]
    });
  }
  for (const itemId of patch.removeCashflowItemIds ?? []) {
    next = removeCashflow(next, itemId);
  }
  const ledgerEntries = reconcileFinanceLedgerEntries(
    patch.ledgerEntries ?? [],
    appliedDeltas,
    patch.summary
  );
  for (const entry of ledgerEntries) {
    next = appendLedgerEntry(next, {
      ...entry,
      entryId: entry.entryId ?? nextFinanceLedgerId(next.ledger),
      gameTime: cloneGameTime(entry.gameTime ?? time),
      relatedAssetItemIds: [...entry.relatedAssetItemIds],
      relatedActorIds: [...entry.relatedActorIds],
      relatedPlaceIds: [...entry.relatedPlaceIds],
      source: entry.source ?? 'writeback',
      visibility: entry.visibility ?? 'player_known'
    });
  }

  return next;
}

export function applyLegacyEconomyPatchToFinance(
  finance: RuntimeFinanceState,
  patch: LegacyEconomyPatchInput | undefined,
  time: GameTime
): RuntimeFinanceState {
  if (!patch) return finance;

  const before = finance.bankBalance;
  const setValue = patch.moneySet;
  const deltaResult = addMoneyAmount(before, patch.moneyDelta ?? 0);
  const nextMoney =
    setValue !== undefined
      ? (isMoneyAmount(setValue) ? setValue : before)
      : (deltaResult.applied ? deltaResult.value : before);
  const delta = nextMoney - before;
  let next: RuntimeFinanceState = {
    ...finance,
    bankBalance: nextMoney,
    summary: patch.financeSummary ?? finance.summary
  };

  if (delta !== 0 || patch.financeSummary) {
    next = appendLedgerEntry(next, {
      entryId: nextFinanceLedgerId(next.ledger),
      gameTime: cloneGameTime(time),
      direction: 'adjustment',
      amount: Math.abs(delta),
      account: 'bank',
      title: '旧经济写回调整',
      summary: patch.financeSummary ?? '兼容旧 playerPatch.economy 写回。',
      relatedAssetItemIds: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      source: 'legacy_economy_patch',
      visibility: 'player_known'
    });
  }

  return next;
}

export function applyGrayLedgerPatch(
  grayLedger: GrayLedgerEntry[],
  patch: GrayLedgerPatchInput | undefined,
  time: GameTime
): GrayLedgerEntry[] {
  if (!patch?.entries?.length) return grayLedger;

  const next = [...grayLedger];
  for (const entry of patch.entries) {
    next.push({
      ...entry,
      ledgerId: entry.ledgerId ?? nextGrayLedgerId(next),
      gameTime: cloneGameTime(entry.gameTime ?? time),
      relatedActorIds: [...entry.relatedActorIds],
      relatedPlaceIds: [...entry.relatedPlaceIds],
      relatedCaseIds: [...entry.relatedCaseIds],
      visibility: entry.visibility ?? 'player_known'
    });
  }

  return next.slice(-80);
}
