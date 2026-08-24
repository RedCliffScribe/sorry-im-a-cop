import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { FinanceArchiveModal } from './FinanceArchiveModal';

describe('FinanceArchiveModal', () => {
  it('shows current money and default police salary income', () => {
    const state = createInitialRuntimeState();

    render(<FinanceArchiveModal state={state} onStateChange={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '金钱与收支' });
    expect(dialog).toHaveClass('finance-archive-modal--polished');
    expect(dialog.querySelector('.finance-summary-strip')).toBeInTheDocument();
    expect(dialog.querySelector('.finance-cashflow-grid')).toBeInTheDocument();
    expect(dialog.querySelector('.finance-overview-panel')).toBeInTheDocument();
    expect(dialog.querySelector('.finance-ledger-section')).toBeInTheDocument();
    expect(dialog.querySelector('.finance-report-section')).toBeInTheDocument();
    expect(screen.getByText('随身现金')).toBeInTheDocument();
    expect(screen.getByText('银行存款')).toBeInTheDocument();
    expect(screen.getAllByText('HK$0').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('警队月薪')).toBeInTheDocument();
    expect(screen.getAllByText('HK$4,200').length).toBeGreaterThan(0);
    expect(screen.getByText('暂无固定支出项目。')).toBeInTheDocument();
    expect(screen.getByText('暂无近期收支记录。')).toBeInTheDocument();
    expect(screen.getByText('暂无月度收支报告。')).toBeInTheDocument();
  });
  it('limits recent ledger display without dropping stored entries', () => {
    const state = createInitialRuntimeState();
    state.finance.ledger = Array.from({ length: 35 }, (_, index) => ({
      entryId: `ledger_${index + 1}`,
      gameTime: state.time,
      direction: 'expense' as const,
      amount: index + 1,
      account: 'cash' as const,
      title: `Ledger ${index + 1}`,
      summary: `Ledger summary ${index + 1}`,
      relatedAssetItemIds: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      source: 'manual' as const,
      visibility: 'player_known' as const
    }));

    const { container } = render(<FinanceArchiveModal state={state} onStateChange={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('Ledger 35')).toBeInTheDocument();
    expect(screen.getByText('Ledger 26')).toBeInTheDocument();
    expect(screen.queryByText('Ledger 25')).not.toBeInTheDocument();

    const select = container.querySelector('.archive-limit-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'all' } });

    expect(screen.getByText('Ledger 1')).toBeInTheDocument();
    expect(state.finance.ledger).toHaveLength(35);
    const ledgerScroll = screen.getByRole('region', { name: '近期收支记录列表' });
    expect(ledgerScroll).toHaveClass('finance-ledger-scroll');
    expect(ledgerScroll).toHaveAttribute('tabindex', '0');
  });

  it('shows each ledger entry with its exact in-game date and time', () => {
    const state = createInitialRuntimeState();
    state.finance.ledger = [
      {
        entryId: 'ledger_taxicab',
        gameTime: { year: 1988, month: 9, day: 15, hour: 20, minute: 7 },
        direction: 'expense',
        amount: 25,
        account: 'cash',
        title: '计程车费',
        summary: '搭乘计程车前往住所。',
        relatedAssetItemIds: [],
        relatedActorIds: [],
        relatedPlaceIds: [],
        source: 'writeback',
        visibility: 'player_known'
      }
    ];

    const { container } = render(<FinanceArchiveModal state={state} onStateChange={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('1988年09月15日 星期四 20:07')).toBeInTheDocument();
    expect(container.querySelector('.finance-ledger-time')).toHaveTextContent('1988年09月15日 星期四 20:07');
  });

  it('keeps the outer modal fixed while giving recent ledger entries a larger inner scroll viewport', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const ledgerRule = css.match(
      /\.finance-archive-modal--polished \.finance-ledger-scroll\s*\{([^}]*)\}/
    )?.[1] ?? '';
    const ledgerSectionRule = css.match(
      /\.finance-archive-modal--polished \.finance-ledger-section\s*\{([^}]*)\}/
    )?.[1] ?? '';
    const archiveBodyRule = css.match(
      /\.finance-archive-modal--polished \.finance-archive-body\s*\{([^}]*)\}/
    )?.[1] ?? '';
    const ledgerHeadingRule = css.match(
      /\.finance-list-card \.finance-ledger-heading-main\s*\{([^}]*)\}/
    )?.[1] ?? '';

    expect(ledgerRule).toContain('block-size: clamp(340px, 42dvh, 480px)');
    expect(ledgerRule).toContain('overflow-y: auto');
    expect(ledgerRule).toContain('overflow-x: hidden');
    expect(ledgerRule).toContain('scrollbar-gutter: stable');
    expect(ledgerSectionRule).toContain('grid-template-rows: auto auto');
    expect(archiveBodyRule).toContain('grid-auto-rows: max-content');
    expect(ledgerHeadingRule).toContain('display: grid');
  });
});
