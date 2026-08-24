import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { AssetItem } from '../../domain/runtime/types';
import { AssetArchiveModal } from './AssetArchiveModal';

function equipment(itemId: string, name: string): AssetItem {
  return {
    itemId,
    category: 'equipment',
    name,
    summary: `${name} summary`,
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    visibility: 'player_known',
    importance: 50
  };
}

function standardItem(itemId: string, name: string, category: 'general' | 'document' | 'valuable'): AssetItem {
  return {
    itemId,
    category,
    name,
    summary: `${name} summary`,
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    visibility: 'player_known',
    importance: 40
  };
}

function evidenceItem(itemId: string, name: string): AssetItem {
  return {
    itemId,
    category: 'document',
    name,
    summary: `${name} summary`,
    detail: `${name} detail`,
    evidence: {
      caseId: 'case_mk_fight',
      caseTitle: '旺角打斗案',
      summary: '与现场冲突时间线有关。',
      disputed: false
    },
    relatedActorIds: [],
    relatedCaseIds: ['case_mk_fight'],
    relatedPlaceIds: [],
    visibility: 'player_known',
    importance: 70
  };
}

function fixedAsset(itemId: string, name: string): AssetItem {
  return {
    itemId,
    category: 'fixedAsset',
    name,
    summary: '一处长期租住的唐楼单位。',
    detail: '屋内狭窄但靠近值勤区域。',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: ['place_sham_shui_po'],
    visibility: 'player_known',
    importance: 60,
    fixedAssetType: 'residence',
    holdingRelation: 'rented',
    primaryUse: 'home',
    locationSummary: '深水埗唐楼',
    ownershipSummary: '玩家按月租住。',
    accessSummary: '玩家持有钥匙，可随时回家。',
    valueAmount: 0,
    incomeSettlementItemIds: ['rent_sublet_income'],
    expenseSettlementItemIds: ['monthly_rent']
  };
}

function vehicleAsset(itemId: string, name: string): AssetItem {
  return {
    itemId,
    category: 'vehicle',
    name,
    summary: '一辆可用于短途移动的旧电单车。',
    detail: '车况一般，雨天不太稳定。',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    visibility: 'player_known',
    importance: 55,
    vehicleType: 'motorcycle',
    holdingRelation: 'owned',
    condition: 'usable',
    locationSummary: '通常停在住处楼下。',
    accessSummary: '玩家有钥匙，可自行使用。',
    valueAmount: 6000,
    mobilityProfile: {
      mode: 'motorcycle',
      timeMultiplier: 0.7,
      availabilitySummary: '受天气、拥堵和盘查影响。'
    },
    incomeSettlementItemIds: [],
    expenseSettlementItemIds: ['vehicle_maintenance']
  };
}

describe('AssetArchiveModal', () => {
  it('isolates asset detail rows from the global dl grid layout', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const detailListRule = css.match(/\.asset-detail-content dl\s*\{[^}]+\}/)?.[0] ?? '';
    const detailRowRule = css.match(/\.asset-detail-row\s*\{[^}]+\}/)?.[0] ?? '';
    const visualSlotRule = css.match(/\.asset-detail-visual-placeholder\s*\{[^}]+\}/)?.[0] ?? '';
    const visualImageRule = css.match(/\.asset-detail-visual-image\s*\{[^}]+\}/)?.[0] ?? '';
    const propertyThumbRule = css.match(/\.asset-property-thumb\s*\{[^}]+\}/)?.[0] ?? '';

    expect(detailListRule).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(detailRowRule).toContain('grid-template-columns: 112px minmax(0, 1fr)');
    expect(detailRowRule).not.toContain('minmax(220px');
    expect(visualSlotRule).toContain('aspect-ratio: 16 / 9');
    expect(visualImageRule).toContain('aspect-ratio: 16 / 9');
    expect(propertyThumbRule).toContain('aspect-ratio: 16 / 9');
  });

  it('toggles equipped items and mirrors them into player equipment', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        baton: equipment('baton', 'Baton'),
        radio: equipment('radio', 'Radio')
      },
      equippedItemIds: ['baton']
    };
    state.player.equipment = ['Baton'];
    const onStateChange = vi.fn();

    render(
      <AssetArchiveModal
        state={state}
        initialView="equipment"
        onClose={vi.fn()}
        onStateChange={onStateChange}
      />
    );

    fireEvent.click(screen.getByText('Radio').closest('button') as HTMLButtonElement);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const nextState = onStateChange.mock.calls[0][0];
    expect(nextState.assets.equippedItemIds).toEqual(['baton', 'radio']);
    expect(nextState.player.equipment).toEqual(['Baton', 'Radio']);
  });

  it('keeps long-term assets out of the portable grid but makes them visible in the default overview', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        baton: equipment('baton', 'Baton'),
        flat: {
          itemId: 'flat',
          category: 'fixedAsset',
          name: 'Rented Flat',
          summary: 'A rented flat.',
          relatedActorIds: [],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          visibility: 'player_known',
          importance: 40,
          fixedAssetType: 'residence',
          holdingRelation: 'rented',
          primaryUse: 'home',
          locationSummary: 'Mong Kok',
          ownershipSummary: 'Rented by the player.',
          accessSummary: 'Player can use it.',
          incomeSettlementItemIds: [],
          expenseSettlementItemIds: []
        },
        bike: {
          itemId: 'bike',
          category: 'vehicle',
          name: 'Old Motorcycle',
          summary: 'An old motorcycle.',
          relatedActorIds: [],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          visibility: 'player_known',
          importance: 30,
          vehicleType: 'motorcycle',
          holdingRelation: 'owned',
          condition: 'usable',
          locationSummary: 'Near home.',
          accessSummary: 'Player can use it.',
          incomeSettlementItemIds: [],
          expenseSettlementItemIds: []
        }
      },
      equippedItemIds: []
    };

    render(<AssetArchiveModal state={state} initialView="allItems" onClose={vi.fn()} />);

    expect(screen.getByText('Baton')).toBeInTheDocument();
    const overview = screen.getByLabelText('固定资产与交通工具概览');
    expect(within(overview).getByText('Rented Flat')).toBeInTheDocument();
    expect(within(overview).getByText('Old Motorcycle')).toBeInTheDocument();
    expect(within(overview).getByText('电单车 · 自有 · 可用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看交通工具 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Baton/ }).closest('.asset-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Old Motorcycle/ }).closest('.asset-grid')).not.toBeInTheDocument();
  });

  it('renders normal items as icon cards with the item name below the glyph', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        notebook: standardItem('notebook', '巡逻记录簿', 'general')
      },
      equippedItemIds: []
    };

    render(<AssetArchiveModal state={state} initialView="allItems" onClose={vi.fn()} />);

    const card = screen.getByRole('button', { name: /巡逻记录簿/ });
    expect(card.querySelector('.asset-card-glyph')).toBeInTheDocument();
    expect(card.querySelector('.asset-card-glyph svg')).toBeInTheDocument();
    expect(card.querySelector('.asset-card-name')).toHaveTextContent('巡逻记录簿');
    expect(card.querySelector('.asset-property-thumb')).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent('巡逻记录簿 summary');
    expect(card).not.toHaveTextContent('一般物品');
    expect(card).not.toHaveTextContent('详情');
  });

  it('keeps equipped cards visually minimal with only the equipped marker', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        radio: equipment('radio', '对讲机')
      },
      equippedItemIds: ['radio']
    };

    render(<AssetArchiveModal state={state} initialView="equipment" onClose={vi.fn()} onStateChange={vi.fn()} />);

    const card = screen.getByRole('button', { name: /对讲机/ });
    expect(card.querySelector('.asset-equipped-mark')).toBeInTheDocument();
    expect(card.querySelector('.asset-card-glyph svg')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('当前装备');
    expect(card).not.toHaveTextContent('点击卸下');
    expect(card).not.toHaveTextContent('装备', { normalizeWhitespace: false });
  });

  it('normalizes equipped count in archive stats', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        radio: equipment('radio', '对讲机')
      },
      equippedItemIds: ['radio', 'missing_item']
    };

    render(<AssetArchiveModal state={state} initialView="equipment" onClose={vi.fn()} onStateChange={vi.fn()} />);

    const stats = screen.getByLabelText('物品与资产统计');
    expect(
      within(stats).getByText((_, element) => element?.textContent?.replace(/\s+/g, ' ').trim() === '已装备 1')
    ).toBeInTheDocument();
  });

  it('filters evidence items and shows default evidence details', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        receipt: evidenceItem('receipt', '夜总会收据'),
        radio: equipment('radio', '对讲机')
      },
      equippedItemIds: []
    };

    render(<AssetArchiveModal state={state} initialView="allItems" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '证据1' }));
    fireEvent.click(screen.getByRole('button', { name: /夜总会收据/ }));

    const dialog = screen.getByRole('dialog', { name: '夜总会收据详情' });
    expect(within(dialog).getByText('旺角打斗案 / 默认有效证据 / 与现场冲突时间线有关。')).toBeInTheDocument();
    expect(within(dialog).getByText('夜总会收据 detail')).toBeInTheDocument();
  });

  it('keeps fixed assets and vehicles in independent overview/detail views', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        flat: fixedAsset('flat', '深水埗唐楼单位'),
        motorcycle: vehicleAsset('motorcycle', '旧电单车')
      },
      equippedItemIds: []
    };

    render(<AssetArchiveModal state={state} initialView="fixedAsset" onClose={vi.fn()} />);

    const archive = screen.getByRole('dialog', { name: '物品与资产' });
    expect(archive).toHaveClass('asset-archive-modal--polished');
    expect(archive.querySelector('.asset-summary-strip')).toBeInTheDocument();

    const fixedAssetCard = screen.getByRole('button', { name: /深水埗唐楼单位/ });
    expect(fixedAssetCard.querySelector('.asset-property-thumb')).toBeInTheDocument();
    expect(fixedAssetCard.querySelector('.asset-property-info')).toBeInTheDocument();
    const fixedAssetThumb = fixedAssetCard.querySelector('.asset-property-thumb img');
    expect(fixedAssetThumb).toHaveAttribute('loading', 'lazy');
    expect(fixedAssetThumb).toHaveAttribute('decoding', 'async');
    expect(fixedAssetThumb).toHaveAttribute('width', '1672');
    expect(fixedAssetThumb).toHaveAttribute('height', '941');
    fireEvent.click(fixedAssetCard);
    const fixedDialog = screen.getByRole('dialog', { name: '深水埗唐楼单位详情' });
    expect(fixedDialog.querySelector('.asset-detail-layout--visual')).toBeInTheDocument();
    expect(fixedDialog.querySelector('.asset-detail-visual-slot')).toBeInTheDocument();
    expect(within(fixedDialog).getByLabelText('唐楼租住单位')).toBeInTheDocument();
    const fixedAssetDetailImage = fixedDialog.querySelector('.asset-detail-visual-image');
    expect(fixedAssetDetailImage).toBeInTheDocument();
    expect(fixedAssetDetailImage).toHaveAttribute('decoding', 'async');
    expect(fixedAssetDetailImage).toHaveAttribute('width', '1672');
    expect(fixedAssetDetailImage).toHaveAttribute('height', '941');
    expect(fixedAssetDetailImage).not.toHaveAttribute('loading', 'lazy');
    expect(within(fixedDialog).queryByText('暂无房产图')).not.toBeInTheDocument();
    expect(within(fixedDialog).getByText('收入项 1 / 支出项 1')).toBeInTheDocument();

    fireEvent.click(within(fixedDialog).getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: '交通工具1' }));
    fireEvent.click(screen.getByRole('button', { name: /旧电单车/ }));

    const vehicleDialog = screen.getByRole('dialog', { name: '旧电单车详情' });
    expect(vehicleDialog.querySelector('.asset-detail-layout--visual')).toBeInTheDocument();
    expect(vehicleDialog.querySelector('.asset-detail-visual-slot')).toBeInTheDocument();
    expect(within(vehicleDialog).getByLabelText('普通电单车')).toBeInTheDocument();
    const vehicleDetailImage = vehicleDialog.querySelector('.asset-detail-visual-image');
    expect(vehicleDetailImage).toBeInTheDocument();
    expect(vehicleDetailImage).toHaveAttribute('decoding', 'async');
    expect(vehicleDetailImage).toHaveAttribute('width', '1672');
    expect(vehicleDetailImage).toHaveAttribute('height', '941');
    expect(within(vehicleDialog).queryByText('暂无交通工具图')).not.toBeInTheDocument();
    expect(within(vehicleDialog).getByText('电单车')).toBeInTheDocument();
    expect(within(vehicleDialog).getByText('motorcycle')).toBeInTheDocument();
    expect(within(vehicleDialog).getByText('0.7')).toBeInTheDocument();
  });

  it('removes the reserved image panel from ordinary item details', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        manuscript: standardItem('manuscript', 'Case Manuscript', 'document')
      },
      equippedItemIds: []
    };

    render(<AssetArchiveModal state={state} initialView="document" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Case Manuscript/ }));

    const dialog = screen.getByRole('dialog', { name: 'Case Manuscript详情' });
    expect(dialog.querySelector('.asset-detail-image')).not.toBeInTheDocument();
    expect(dialog.querySelector('.asset-detail-layout--plain')).toBeInTheDocument();
    expect(within(dialog).getByText('Case Manuscript summary')).toBeInTheDocument();
  });

  it('keeps evidence and valuable item details as text-only records', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        receipt: evidenceItem('receipt', '夜总会收据'),
        watch: standardItem('watch', '金表', 'valuable')
      },
      equippedItemIds: []
    };

    render(<AssetArchiveModal state={state} initialView="evidence" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /夜总会收据/ }));
    const evidenceDialog = screen.getByRole('dialog', { name: '夜总会收据详情' });
    expect(evidenceDialog.querySelector('.asset-detail-visual-slot')).not.toBeInTheDocument();
    expect(evidenceDialog.querySelector('.asset-detail-layout--plain')).toBeInTheDocument();

    fireEvent.click(within(evidenceDialog).getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: '贵重物品1' }));
    fireEvent.click(screen.getByRole('button', { name: /金表/ }));

    const valuableDialog = screen.getByRole('dialog', { name: '金表详情' });
    expect(valuableDialog.querySelector('.asset-detail-visual-slot')).not.toBeInTheDocument();
    expect(valuableDialog.querySelector('.asset-detail-layout--plain')).toBeInTheDocument();
  });

  it('renders long ordinary item detail fields as full-width rows', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        manuscript: {
          ...standardItem('manuscript', '《大明九龙重案》初稿', 'document'),
          summary: '包含五六千字的穿越武侠小报初稿。',
          detail: '装在一个旧牛皮纸袋里，准备投给报馆换取稿费。',
          relatedActorIds: ['player', 'npc_library_aspirant_writer'],
          relatedPlaceIds: ['place_mong_kok_police_station']
        }
      },
      equippedItemIds: []
    };

    render(<AssetArchiveModal state={state} initialView="document" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /《大明九龙重案》初稿/ }));

    const dialog = screen.getByRole('dialog', { name: '《大明九龙重案》初稿详情' });
    expect(within(dialog).getAllByText('《大明九龙重案》初稿')[1].closest('.asset-detail-row')).toHaveClass(
      'asset-detail-row--wide'
    );
    expect(within(dialog).getByText('player / npc_library_aspirant_writer').closest('.asset-detail-row')).toHaveClass(
      'asset-detail-row--wide'
    );
    expect(within(dialog).getByText('place_mong_kok_police_station').closest('.asset-detail-row')).toHaveClass(
      'asset-detail-row--wide'
    );
  });

  it('opens detail instead of mutating state for non-equipment items', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        notebook: standardItem('notebook', '巡逻记录簿', 'general')
      },
      equippedItemIds: []
    };
    const onStateChange = vi.fn();

    render(<AssetArchiveModal state={state} initialView="allItems" onClose={vi.fn()} onStateChange={onStateChange} />);

    fireEvent.click(screen.getByRole('button', { name: /巡逻记录簿/ }));

    expect(onStateChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '巡逻记录簿详情' })).toBeInTheDocument();
  });

  it('discards a portable item only after explicit confirmation', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        box: standardItem('box', '带血的恐吓纸盒', 'general'),
        notebook: standardItem('notebook', '巡逻记录簿', 'general')
      },
      equippedItemIds: []
    };
    const onStateChange = vi.fn();

    render(<AssetArchiveModal state={state} initialView="general" onClose={vi.fn()} onStateChange={onStateChange} />);

    fireEvent.click(screen.getByRole('button', { name: /带血的恐吓纸盒/ }));
    const dialog = screen.getByRole('dialog', { name: '带血的恐吓纸盒详情' });

    fireEvent.click(within(dialog).getByRole('button', { name: '丢弃物品' }));
    expect(within(dialog).getByText('确定丢弃“带血的恐吓纸盒”？此操作无法撤销。')).toBeInTheDocument();
    expect(onStateChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: '确认丢弃' }));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    const nextState = onStateChange.mock.calls[0][0] as typeof state;
    expect(nextState.assets.items.box).toBeUndefined();
    expect(nextState.assets.items.notebook).toBeDefined();
    expect(screen.queryByRole('dialog', { name: '带血的恐吓纸盒详情' })).not.toBeInTheDocument();
  });

  it('does not offer discard for fixed assets or vehicles', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        flat: fixedAsset('flat', '深水埗唐楼单位'),
        motorcycle: vehicleAsset('motorcycle', '旧电单车')
      },
      equippedItemIds: []
    };
    const onStateChange = vi.fn();

    render(<AssetArchiveModal state={state} initialView="fixedAsset" onClose={vi.fn()} onStateChange={onStateChange} />);

    fireEvent.click(screen.getByRole('button', { name: /深水埗唐楼单位/ }));
    const dialog = screen.getByRole('dialog', { name: '深水埗唐楼单位详情' });
    expect(within(dialog).queryByRole('button', { name: '丢弃物品' })).not.toBeInTheDocument();
  });
});
