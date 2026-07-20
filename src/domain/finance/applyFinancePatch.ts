import { appendLedgerEntry, removeCashflow, upsertCashflow } from './financeState';
import type {
  FinanceCashflowItem,
  FinanceLedgerEntry,
  GameTime,
  GrayLedgerEntry,
  RuntimeFinanceState
} from '../runtime/types';

const clampMoney = (value: number): number => Math.max(0, Math.min(100_000_000, Math.trunc(value)));

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

export function applyFinancePatch(finance: RuntimeFinanceState, patch: FinancePatchInput | undefined, time: GameTime): RuntimeFinanceState {
  if (!patch) return finance;

  let next: RuntimeFinanceState = {
    ...finance,
    cashflows: { ...finance.cashflows },
    ledger: [...finance.ledger],
    reports: [...finance.reports]
  };

  if (patch.cashSet !== undefined) {
    next = { ...next, cashOnHand: clampMoney(patch.cashSet) };
  } else if (patch.cashDelta !== undefined) {
    next = { ...next, cashOnHand: clampMoney(next.cashOnHand + patch.cashDelta) };
  }
  if (patch.bankSet !== undefined) {
    next = { ...next, bankBalance: clampMoney(patch.bankSet) };
  } else if (patch.bankDelta !== undefined) {
    next = { ...next, bankBalance: clampMoney(next.bankBalance + patch.bankDelta) };
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
  for (const entry of patch.ledgerEntries ?? []) {
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
  const nextMoney = patch.moneySet !== undefined ? clampMoney(patch.moneySet) : clampMoney(before + (patch.moneyDelta ?? 0));
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
