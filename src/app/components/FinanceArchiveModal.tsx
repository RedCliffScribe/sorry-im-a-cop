import { useState } from 'react';
import type { FinanceCashflowItem, FinanceLedgerEntry, MonthlyFinanceReport, RuntimeState } from '../../domain/runtime/types';
import { formatCurrencyAmount } from '../../domain/worldpack/economyConfig';

interface FinanceArchiveModalProps {
  state: RuntimeState;
  onStateChange: (state: RuntimeState) => void;
  onClose: () => void;
}

type HistoryLimit = '10' | '20' | '30' | 'all';

const historyLimitOptions: Array<{ value: HistoryLimit; label: string }> = [
  { value: '10', label: '10 条' },
  { value: '20', label: '20 条' },
  { value: '30', label: '30 条' },
  { value: 'all', label: '全部' }
];

function limitHistoryItems<T>(items: T[], limit: HistoryLimit): T[] {
  return limit === 'all' ? items : items.slice(0, Number(limit));
}

function HistoryLimitSelect({
  value,
  onChange
}: {
  value: HistoryLimit;
  onChange: (value: HistoryLimit) => void;
}) {
  return (
    <label className="archive-limit-control">
      <span>显示</span>
      <select
        className="archive-limit-select"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as HistoryLimit)}
      >
        {historyLimitOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDirection(direction: FinanceLedgerEntry['direction']) {
  if (direction === 'income') return '收入';
  if (direction === 'expense') return '支出';
  return '调整';
}

function formatAccount(account: FinanceLedgerEntry['account']) {
  return account === 'cash' ? '随身现金' : '银行存款';
}

function formatCashflow(
  items: FinanceCashflowItem[],
  emptyText: string,
  direction: FinanceCashflowItem['direction'],
  worldpackId: string
) {
  if (items.length === 0) return <p className="character-empty">{emptyText}</p>;

  return (
    <div className="finance-list">
      {items.map((item) => (
        <article key={item.itemId} className={`finance-list-card finance-list-card--${direction}`}>
          <div className="finance-list-card-heading">
            <strong>{item.title}</strong>
            <span className={`finance-amount finance-amount--${direction}`}>
              {formatCurrencyAmount(item.amount, worldpackId)} / 月 · {formatAccount(item.account)}
            </span>
          </div>
          <p>{item.summary || '暂无说明。'}</p>
        </article>
      ))}
    </div>
  );
}

function formatLedger(entries: FinanceLedgerEntry[], worldpackId: string) {
  if (entries.length === 0) return <p className="character-empty">暂无近期收支记录。</p>;

  return (
    <div className="finance-list">
      {entries.map((entry) => (
        <article
          key={entry.entryId}
          className={`finance-list-card finance-ledger-card finance-list-card--${entry.direction}`}
        >
          <div className="finance-list-card-heading">
            <strong>{entry.title}</strong>
            <span className={`finance-amount finance-amount--${entry.direction}`}>
              {formatDirection(entry.direction)} {formatCurrencyAmount(entry.amount, worldpackId)} · {formatAccount(entry.account)}
            </span>
          </div>
          <p>{entry.summary || '暂无说明。'}</p>
        </article>
      ))}
    </div>
  );
}

function FinanceReportCard({
  report,
  worldpackId,
  onMarkRead
}: {
  report: MonthlyFinanceReport;
  worldpackId: string;
  onMarkRead: (reportId: string) => void;
}) {
  return (
    <article className={`finance-list-card finance-report-card${report.read ? '' : ' is-unread'}`}>
      <div className="finance-list-card-heading">
        <strong>{report.monthKey}</strong>
        <span className={`finance-amount finance-amount--${report.net >= 0 ? 'income' : 'expense'}`}>
          收入 {formatCurrencyAmount(report.income, worldpackId)} / 支出 {formatCurrencyAmount(report.expense, worldpackId)} / 净额 {formatCurrencyAmount(report.net, worldpackId)}
        </span>
      </div>
      <p>{report.itemSummaries.length > 0 ? report.itemSummaries.join('；') : '本月无固定收支项目。'}</p>
      <p className="finance-report-balances">
        期末现金 {formatCurrencyAmount(report.endingCashOnHand, worldpackId)} · 期末存款 {formatCurrencyAmount(report.endingBankBalance, worldpackId)}
      </p>
      {!report.read ? (
        <button type="button" onClick={() => onMarkRead(report.reportId)}>
          标为已读
        </button>
      ) : null}
    </article>
  );
}

export function FinanceArchiveModal({ state, onStateChange, onClose }: FinanceArchiveModalProps) {
  const [ledgerLimit, setLedgerLimit] = useState<HistoryLimit>('10');
  const activeCashflows = Object.values(state.finance.cashflows).filter((item) => item.status === 'active');
  const income = activeCashflows.filter((item) => item.direction === 'income');
  const expense = activeCashflows.filter((item) => item.direction === 'expense');
  const monthlyIncome = income.reduce((sum, item) => sum + item.amount, 0);
  const monthlyExpense = expense.reduce((sum, item) => sum + item.amount, 0);
  const monthlyNet = monthlyIncome - monthlyExpense;
  const recentLedger = limitHistoryItems([...state.finance.ledger].reverse(), ledgerLimit);
  const reports = [...state.finance.reports].reverse();

  function markReportRead(reportId: string) {
    onStateChange({
      ...state,
      finance: {
        ...state.finance,
        reports: state.finance.reports.map((report) =>
          report.reportId === reportId ? { ...report, read: true } : report
        )
      }
    });
  }

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="finance-archive-modal finance-archive-modal--polished feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="金钱与收支"
      >
        <header className="character-archive-header">
          <div>
            <h2>金钱与收支</h2>
            <p>FINANCE LEDGER</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="finance-summary-strip" aria-label="金钱与收支统计">
          <span className="finance-summary-item finance-summary-item--balance">
            <small>随身现金</small>
            <strong>{formatCurrencyAmount(state.finance.cashOnHand, state.world.worldpackId)}</strong>
          </span>
          <span className="finance-summary-item finance-summary-item--balance">
            <small>银行存款</small>
            <strong>{formatCurrencyAmount(state.finance.bankBalance, state.world.worldpackId)}</strong>
          </span>
          <span className="finance-summary-item finance-summary-item--income">
            <small>固定收入</small>
            <strong><span>{formatCurrencyAmount(monthlyIncome, state.world.worldpackId)}</span><small> / 月</small></strong>
          </span>
          <span className="finance-summary-item finance-summary-item--expense">
            <small>固定支出</small>
            <strong><span>{formatCurrencyAmount(monthlyExpense, state.world.worldpackId)}</span><small> / 月</small></strong>
          </span>
          <span className={`finance-summary-item finance-summary-item--net${monthlyNet < 0 ? ' is-negative' : ''}`}>
            <small>月净额</small>
            <strong>{monthlyNet >= 0 ? '+' : ''}{formatCurrencyAmount(monthlyNet, state.world.worldpackId)}</strong>
          </span>
        </div>

        <div className="finance-archive-body">
          <section className="finance-panel finance-overview-panel" aria-label="财务概况">
            <h3>财务概况</h3>
            <p>{state.finance.summary || '暂无财务概况。'}</p>
          </section>

          <div className="finance-cashflow-grid">
            <section className="finance-panel finance-panel--income" aria-label="固定收入">
              <h3>固定收入</h3>
              {formatCashflow(income, '暂无固定收入项目。', 'income', state.world.worldpackId)}
            </section>

            <section className="finance-panel finance-panel--expense" aria-label="固定支出">
              <h3>固定支出</h3>
              {formatCashflow(expense, '暂无固定支出项目。', 'expense', state.world.worldpackId)}
            </section>
          </div>

          <section className="finance-panel finance-ledger-section" aria-label="近期收支">
            <div className="archive-section-header">
              <h3>近期收支</h3>
              <HistoryLimitSelect value={ledgerLimit} onChange={setLedgerLimit} />
            </div>
            <div className="finance-ledger-scroll">{formatLedger(recentLedger, state.world.worldpackId)}</div>
          </section>

          <section className="finance-panel finance-report-section" aria-label="月度报告">
            <h3>月度报告</h3>
            {reports.length === 0 ? (
              <p className="character-empty">暂无月度收支报告。</p>
            ) : (
              <div className="finance-list">
                {reports.map((report) => (
                  <FinanceReportCard
                    key={report.reportId}
                    report={report}
                    worldpackId={state.world.worldpackId}
                    onMarkRead={markReportRead}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
