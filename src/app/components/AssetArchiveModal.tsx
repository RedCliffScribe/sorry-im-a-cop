import { useEffect, useMemo, useState } from 'react';
import {
  applyEquippedAssetsToRuntimeState,
  normalizeEquippedItemIds,
  toggleEquippedItem
} from '../../domain/assets/equipmentSlots';
import type {
  AssetItem,
  FixedAsset,
  RuntimeState,
  StandardAssetCategory,
  StandardAssetItem,
  VehicleAsset
} from '../../domain/runtime/types';
import { resolveAssetVisualAsset } from '../assetVisualAssets';

export type AssetArchiveView =
  | 'allItems'
  | 'equipment'
  | 'general'
  | 'document'
  | 'valuable'
  | 'evidence'
  | 'fixedAsset'
  | 'vehicle';

interface AssetArchiveModalProps {
  state: RuntimeState;
  onClose: () => void;
  onStateChange?: (state: RuntimeState) => void;
  initialView?: AssetArchiveView;
}

const normalCategories: StandardAssetCategory[] = ['equipment', 'general', 'document', 'valuable'];

const normalCategoryLabels: Record<StandardAssetCategory, string> = {
  equipment: '装备',
  general: '一般物品',
  document: '文件资料',
  valuable: '贵重物品'
};

const normalCategoryIcons: Record<StandardAssetCategory, string> = {
  equipment: '装',
  general: '物',
  document: '文',
  valuable: '贵'
};

const normalCategoryIconLabels: Record<StandardAssetCategory, string> = {
  equipment: '装备图标',
  general: '一般物品图标',
  document: '文件资料图标',
  valuable: '贵重物品图标'
};

const viewLabels: Record<AssetArchiveView, string> = {
  allItems: '全部物品',
  equipment: '装备',
  general: '一般物品',
  document: '文件资料',
  valuable: '贵重物品',
  evidence: '证据',
  fixedAsset: '固定资产',
  vehicle: '交通工具'
};

function isStandardItem(item: AssetItem): item is StandardAssetItem {
  return normalCategories.includes(item.category as StandardAssetCategory);
}

function isFixedAsset(item: AssetItem): item is FixedAsset {
  return item.category === 'fixedAsset';
}

function isVehicleAsset(item: AssetItem): item is VehicleAsset {
  return item.category === 'vehicle';
}

function shouldShowAssetDetailImage(item: AssetItem): boolean {
  return Boolean(resolveAssetVisualAsset(item));
}

const fixedAssetTypeLabels: Record<FixedAsset['fixedAssetType'], string> = {
  residence: '住所',
  rentalProperty: '出租物业',
  businessPremise: '经营场所',
  storage: '仓库',
  parkingSpace: '车位',
  investment: '投资物业',
  other: '其他固定资产'
};

const fixedAssetHoldingLabels: Record<FixedAsset['holdingRelation'], string> = {
  owned: '自有',
  rented: '租住',
  assigned: '分配使用',
  familyOwned: '家人持有',
  managed: '代管',
  mortgaged: '按揭',
  unknown: '未知'
};

const fixedAssetUseLabels: Record<FixedAsset['primaryUse'], string> = {
  home: '住所',
  rentalIncome: '出租收租',
  business: '经营',
  storage: '存放物品',
  parking: '泊车',
  investment: '投资',
  other: '其他用途'
};

const vehicleTypeLabels: Record<VehicleAsset['vehicleType'], string> = {
  privateCar: '私家车',
  motorcycle: '电单车',
  taxi: '的士',
  policeVehicle: '警车',
  boat: '船只',
  publicTransportPass: '公共交通通行证',
  other: '其他交通工具'
};

const vehicleHoldingLabels: Record<VehicleAsset['holdingRelation'], string> = {
  owned: '自有',
  rented: '租用',
  assigned: '分配使用',
  borrowed: '借用',
  keptForOther: '替他人保管',
  seized: '扣押',
  unknown: '未知'
};

const vehicleConditionLabels: Record<VehicleAsset['condition'], string> = {
  good: '良好',
  usable: '可用',
  poor: '较差',
  broken: '故障',
  unknown: '未知'
};

function sortAssets(left: AssetItem, right: AssetItem): number {
  const evidenceScore = (item: AssetItem) => (item.evidence ? 1 : 0);
  return (
    evidenceScore(right) - evidenceScore(left) ||
    right.importance - left.importance ||
    left.name.localeCompare(right.name)
  );
}

function assetSearchText(item: AssetItem): string {
  return [
    item.itemId,
    item.name,
    item.summary,
    item.detail,
    item.evidence?.caseId,
    item.evidence?.caseTitle,
    item.evidence?.summary,
    item.evidence?.disputeSummary
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .toLowerCase();
}

function formatEvidence(item: AssetItem): string | undefined {
  if (!item.evidence) return undefined;
  const status = item.evidence.disputed
    ? `有争议：${item.evidence.disputeSummary ?? '未说明争议点'}`
    : '默认有效证据';
  return `${item.evidence.caseTitle ?? item.evidence.caseId} / ${status} / ${item.evidence.summary}`;
}

function formatMonthlySettlement(incomeIds: string[] = [], expenseIds: string[] = []): string {
  if (incomeIds.length === 0 && expenseIds.length === 0) return '暂无固定收支';
  return [`收入项 ${incomeIds.length}`, `支出项 ${expenseIds.length}`].join(' / ');
}

interface DetailRow {
  label: string;
  value: string | number | undefined;
  wide?: boolean;
}

function detailRow(label: string, value: string | number | undefined, wide = false): DetailRow {
  return { label, value, wide };
}

function compactRows(rows: DetailRow[]): Array<DetailRow & { value: string }> {
  return rows
    .map((row) => ({ ...row, value: row.value === undefined ? undefined : String(row.value) }))
    .filter((row): row is DetailRow & { value: string } => Boolean(row.value?.trim()));
}

function DetailRows({ rows }: { rows: DetailRow[] }) {
  const compacted = compactRows(rows);
  if (compacted.length === 0) return <p className="asset-empty">暂无记录。</p>;

  return (
    <dl>
      {compacted.map((row) => (
        <div key={row.label} className={`asset-detail-row${row.wide ? ' asset-detail-row--wide' : ''}`}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AssetVisualSlot({ item }: { item: FixedAsset | VehicleAsset }) {
  const visual = resolveAssetVisualAsset(item);
  const label = visual?.label ?? (isFixedAsset(item) ? '房产图' : '交通工具图');

  return (
    <figure className="asset-detail-visual-slot" aria-label={label}>
      {visual ? (
        <img
          className="asset-detail-visual-image"
          src={visual.url}
          alt=""
          width={1672}
          height={941}
          decoding="async"
        />
      ) : (
        <div className={`asset-detail-visual-placeholder asset-detail-visual-placeholder--${item.category}`} aria-hidden="true">
          <span>{isFixedAsset(item) ? '宅' : '车'}</span>
        </div>
      )}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function CategoryGlyph({ category }: { category: StandardAssetCategory | 'evidence' }) {
  if (category === 'equipment') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M24 6 38 12v11c0 9.5-5.8 15.9-14 19-8.2-3.1-14-9.5-14-19V12l14-6Z" />
        <path d="M24 12v24" />
      </svg>
    );
  }

  if (category === 'document') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M15 6h14l8 8v28H15V6Z" />
        <path d="M29 6v9h8" />
        <path d="M20 23h13M20 30h13M20 37h9" />
      </svg>
    );
  }

  if (category === 'valuable') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M14 10h20l7 11-17 19L7 21l7-11Z" />
        <path d="M7 21h34M18 10l-4 11 10 19 10-19-4-11" />
      </svg>
    );
  }

  if (category === 'evidence') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="21" cy="21" r="12" />
        <path d="m30 30 11 11" />
        <path d="M16 21h10M21 16v10" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M12 17h20" />
      <path d="M12 24h24" />
      <path d="M12 31h16" />
      <circle cx="36" cy="17" r="3" />
      <circle cx="40" cy="24" r="3" />
      <circle cx="32" cy="31" r="3" />
    </svg>
  );
}

function NavButton({
  view,
  activeView,
  count,
  onClick
}: {
  view: AssetArchiveView;
  activeView: AssetArchiveView;
  count: number;
  onClick: (view: AssetArchiveView) => void;
}) {
  return (
    <button
      type="button"
      className={`asset-sidebar-button${activeView === view ? ' active' : ''}`}
      onClick={() => onClick(view)}
    >
      <span>{viewLabels[view]}</span>
      <strong>{count}</strong>
    </button>
  );
}

function StandardItemCard({
  item,
  isEquipped,
  onPrimaryClick
}: {
  item: StandardAssetItem;
  isEquipped: boolean;
  onPrimaryClick: () => void;
}) {
  const tooltip = [
    item.summary,
    item.detail,
    formatEvidence(item),
    item.category === 'equipment' ? (isEquipped ? '点击卸下装备' : '点击装备或替换装备') : undefined
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <button
      type="button"
      className={`asset-card${isEquipped ? ' is-equipped' : ''}${item.evidence ? ' has-evidence' : ''}`}
      onClick={onPrimaryClick}
      title={tooltip}
    >
      <span
        className={`asset-card-glyph asset-card-glyph--${item.evidence ? 'evidence' : item.category}`}
        aria-label={item.evidence ? '证据图标' : normalCategoryIconLabels[item.category]}
      >
        <CategoryGlyph category={item.evidence ? 'evidence' : item.category} />
      </span>
      <strong className="asset-card-name">{item.name}</strong>
      {item.evidence ? (
        <span className="asset-evidence-mark" aria-label={item.evidence.disputed ? '争议证据' : '证据'} title={item.evidence.disputed ? '争议证据' : '证据'}>
          证
        </span>
      ) : null}
      {isEquipped ? (
        <span className="asset-equipped-mark" aria-label="已装备" title="已装备">
          装
        </span>
      ) : null}
    </button>
  );
}

function PropertyCard({
  item,
  onClick
}: {
  item: FixedAsset | VehicleAsset;
  onClick: () => void;
}) {
  const visual = resolveAssetVisualAsset(item);
  const monthly = formatMonthlySettlement(item.incomeSettlementItemIds, item.expenseSettlementItemIds);
  const typeLabel =
    item.category === 'fixedAsset' ? fixedAssetTypeLabels[item.fixedAssetType] : vehicleTypeLabels[item.vehicleType];
  const holdingLabel =
    item.category === 'fixedAsset'
      ? fixedAssetHoldingLabels[item.holdingRelation]
      : vehicleHoldingLabels[item.holdingRelation];
  const statusLabel =
    item.category === 'vehicle'
      ? `${holdingLabel} · ${vehicleConditionLabels[item.condition]}`
      : holdingLabel;
  const subtitle = item.locationSummary;
  const detail = item.category === 'fixedAsset' ? item.ownershipSummary : item.accessSummary;

  return (
    <button type="button" className="asset-property-card" onClick={onClick} title={item.detail ?? item.summary}>
      <span className="asset-property-thumb" aria-label={visual?.label ?? (item.category === 'fixedAsset' ? '房产图' : '交通工具图')}>
        {visual ? (
          <img src={visual.url} alt="" width={1672} height={941} loading="lazy" decoding="async" />
        ) : (
          <span>{item.category === 'fixedAsset' ? '宅' : '车'}</span>
        )}
      </span>
      <span className="asset-property-info">
        <span className="asset-property-title-row">
          <strong>{item.name}</strong>
          <small>{typeLabel} · {statusLabel}</small>
        </span>
        <span className="asset-property-location">{subtitle}</span>
        <em className="asset-property-summary">{item.summary}</em>
        <span className="asset-property-detail">{detail}</span>
      </span>
      <i className="asset-property-settlement">{monthly}</i>
    </button>
  );
}

function AssetDetailDialog({
  item,
  onClose,
  onDiscard
}: {
  item: AssetItem;
  onClose: () => void;
  onDiscard?: () => void;
}) {
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const showDetailImage = shouldShowAssetDetailImage(item);
  const isVisualAsset = isFixedAsset(item) || isVehicleAsset(item);
  const detailRows: DetailRow[] = [
    detailRow('名称', item.name, true),
    detailRow('类型', isStandardItem(item) ? normalCategoryLabels[item.category] : viewLabels[item.category]),
    detailRow('摘要', item.summary, true),
    detailRow('详情', item.detail, true),
    detailRow('重要度', item.importance),
    detailRow('关联人物', (item.relatedActorIds ?? []).join(' / '), true),
    detailRow('关联案件', (item.relatedCaseIds ?? []).join(' / '), true),
    detailRow('关联地点', (item.relatedPlaceIds ?? []).join(' / '), true),
    detailRow('证据', formatEvidence(item), true)
  ];

  const fixedRows: DetailRow[] = isFixedAsset(item)
    ? [
        detailRow('资产类型', fixedAssetTypeLabels[item.fixedAssetType]),
        detailRow('持有关系', fixedAssetHoldingLabels[item.holdingRelation]),
        detailRow('主要用途', fixedAssetUseLabels[item.primaryUse]),
        detailRow('位置', item.locationSummary, true),
        detailRow('产权/租赁', item.ownershipSummary, true),
        detailRow('使用权限', item.accessSummary, true),
        detailRow('估值', item.valueAmount),
        detailRow('收支', formatMonthlySettlement(item.incomeSettlementItemIds, item.expenseSettlementItemIds), true)
      ]
    : [];

  const vehicleRows: DetailRow[] = isVehicleAsset(item)
    ? [
        detailRow('车辆类型', vehicleTypeLabels[item.vehicleType]),
        detailRow('持有关系', vehicleHoldingLabels[item.holdingRelation]),
        detailRow('状态', vehicleConditionLabels[item.condition], true),
        detailRow('位置', item.locationSummary, true),
        detailRow('使用权限', item.accessSummary, true),
        detailRow('估值', item.valueAmount),
        detailRow('移动方式', item.mobilityProfile?.mode),
        detailRow('耗时倍率', item.mobilityProfile?.timeMultiplier),
        detailRow('可用性', item.mobilityProfile?.availabilitySummary, true),
        detailRow('收支', formatMonthlySettlement(item.incomeSettlementItemIds, item.expenseSettlementItemIds), true)
      ]
    : [];

  return (
    <div className="asset-detail-backdrop" role="presentation">
      <section
        className="asset-detail-dialog feature-modal-frame feature-modal-frame--detail"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name}详情`}
      >
        <header>
          <div>
            <h3>{item.name}</h3>
            <p>{isStandardItem(item) ? normalCategoryLabels[item.category] : viewLabels[item.category]}</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        <div
          className={`asset-detail-layout${
            showDetailImage ? ' asset-detail-layout--visual' : ' asset-detail-layout--plain'
          }`}
        >
          {showDetailImage ? (
            <AssetVisualSlot item={item as FixedAsset | VehicleAsset} />
          ) : null}
          <section className={`asset-detail-content${isVisualAsset ? ' asset-detail-content--visual' : ''}`}>
            <h4>基础资料</h4>
            <DetailRows rows={detailRows} />
            {fixedRows.length > 0 ? (
              <>
                <h4>固定资产</h4>
                <DetailRows rows={fixedRows} />
              </>
            ) : null}
            {vehicleRows.length > 0 ? (
              <>
                <h4>交通工具</h4>
                <DetailRows rows={vehicleRows} />
              </>
            ) : null}
          </section>
        </div>
        {onDiscard ? (
          <footer className="asset-detail-actions">
            {isConfirmingDiscard ? (
              <div className="asset-discard-confirmation" role="alert">
                <span>确定丢弃“{item.name}”？此操作无法撤销。</span>
                <div>
                  <button type="button" onClick={() => setIsConfirmingDiscard(false)}>
                    取消
                  </button>
                  <button type="button" className="asset-discard-confirm-button" onClick={onDiscard}>
                    确认丢弃
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="asset-discard-button" onClick={() => setIsConfirmingDiscard(true)}>
                丢弃物品
              </button>
            )}
          </footer>
        ) : null}
      </section>
    </div>
  );
}

export function AssetArchiveModal({
  state,
  onClose,
  onStateChange,
  initialView = 'allItems'
}: AssetArchiveModalProps) {
  const [activeView, setActiveView] = useState<AssetArchiveView>(initialView);
  const [detailItem, setDetailItem] = useState<AssetItem | null>(null);

  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  const assets = useMemo(
    () => Object.values(state.assets?.items ?? {}).filter((item) => item.visibility !== 'hidden').sort(sortAssets),
    [state.assets?.items]
  );
  const normalizedEquippedItemIds = useMemo(() => normalizeEquippedItemIds(state.assets), [state.assets]);
  const equippedIds = useMemo(() => new Set(normalizedEquippedItemIds), [normalizedEquippedItemIds]);
  const normalItems = assets.filter(isStandardItem);
  const fixedAssets = assets.filter(isFixedAsset);
  const vehicles = assets.filter(isVehicleAsset);
  const evidenceItems = normalItems.filter((item) => item.evidence);

  const displayedStandardItems = useMemo(() => {
    if (activeView === 'evidence') return evidenceItems;
    if (normalCategories.includes(activeView as StandardAssetCategory)) {
      return normalItems.filter((item) => item.category === activeView);
    }
    if (activeView === 'allItems') return normalItems;
    return [];
  }, [activeView, evidenceItems, normalItems]);

  const displayedFixedAssets = activeView === 'fixedAsset' ? fixedAssets : [];
  const displayedVehicles = activeView === 'vehicle' ? vehicles : [];

  function handleViewChange(view: AssetArchiveView) {
    setActiveView(view);
    setDetailItem(null);
  }

  function handleStandardItemClick(item: StandardAssetItem) {
    if (item.category !== 'equipment' || !onStateChange) {
      setDetailItem(item);
      return;
    }

    const nextAssets = toggleEquippedItem(state.assets, item.itemId);
    onStateChange(
      applyEquippedAssetsToRuntimeState({
        ...state,
        assets: nextAssets
      })
    );
  }

  function handleDiscardItem(item: StandardAssetItem) {
    if (!onStateChange) return;

    const nextItems = { ...state.assets.items };
    delete nextItems[item.itemId];
    const nextEquippedItemIds = (state.assets.equippedItemIds ?? []).filter((itemId) => itemId !== item.itemId);

    setDetailItem(null);
    onStateChange(
      applyEquippedAssetsToRuntimeState({
        ...state,
        assets: {
          ...state.assets,
          items: nextItems,
          equippedItemIds: nextEquippedItemIds
        }
      })
    );
  }

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="asset-archive-modal asset-archive-modal--polished feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="物品与资产"
      >
        <header className="character-archive-header">
          <div>
            <h2>物品与资产</h2>
            <p>ASSET ARCHIVE</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="asset-summary-strip" aria-label="物品与资产统计">
          <span className="asset-summary-item">
            <small>物品</small>
            <strong>{normalItems.length}</strong>
          </span>
          <span className="asset-summary-item asset-summary-item--evidence">
            <small>证据</small>
            <strong>{evidenceItems.length}</strong>
          </span>
          <span className="asset-summary-item asset-summary-item--property">
            <small>固定资产</small>
            <strong>{fixedAssets.length}</strong>
          </span>
          <span className="asset-summary-item asset-summary-item--vehicle">
            <small>交通工具</small>
            <strong>{vehicles.length}</strong>
          </span>
          <span className="asset-summary-item asset-summary-item--equipped">
            <small>已装备{' '}</small>
            <strong>{normalizedEquippedItemIds.length}</strong>
          </span>
        </div>

        <div className="asset-archive-shell">
          <aside className="asset-sidebar" aria-label="物品与资产分类">
            <NavButton view="allItems" activeView={activeView} count={assets.length} onClick={handleViewChange} />
            <div className="asset-sidebar-children" aria-label="全部物品子分类">
              {normalCategories.map((category) => (
                <NavButton
                  key={category}
                  view={category}
                  activeView={activeView}
                  count={normalItems.filter((item) => item.category === category).length}
                  onClick={handleViewChange}
                />
              ))}
              <NavButton view="evidence" activeView={activeView} count={evidenceItems.length} onClick={handleViewChange} />
            </div>
            <div className="asset-sidebar-divider" />
            <NavButton view="fixedAsset" activeView={activeView} count={fixedAssets.length} onClick={handleViewChange} />
            <NavButton view="vehicle" activeView={activeView} count={vehicles.length} onClick={handleViewChange} />
          </aside>

          <section className="asset-main-panel" aria-label={`${viewLabels[activeView]}列表`}>
            <div className="asset-toolbar">
              <div>
                <h3>{viewLabels[activeView]}</h3>
                <p>
                  {activeView === 'fixedAsset'
                    ? '住所、出租物业、投资等长期资产。'
                    : activeView === 'vehicle'
                      ? '车辆、船只、通行工具等会影响移动的资产。'
                      : '普通物品、装备、文件和贵重物品；下方同时概览固定资产与交通工具。证据只是筛选标签，不是独立物品分类。'}
                </p>
              </div>
              {activeView === 'equipment' ? <span>点击装备可装备、卸下或替换三格装备位。</span> : null}
            </div>

            {displayedStandardItems.length > 0 ? (
              <div className="asset-grid">
                {displayedStandardItems.map((item) => (
                  <StandardItemCard
                    key={item.itemId}
                    item={item}
                    isEquipped={equippedIds.has(item.itemId)}
                    onPrimaryClick={() => handleStandardItemClick(item)}
                  />
                ))}
              </div>
            ) : null}

            {activeView === 'allItems' && (fixedAssets.length > 0 || vehicles.length > 0) ? (
              <section className="asset-long-term-overview" aria-label="固定资产与交通工具概览">
                <header>
                  <div>
                    <h4>固定资产与交通工具</h4>
                    <p>长期资产不会混入随身物品格，但会在这里明确显示。</p>
                  </div>
                  <div className="asset-long-term-overview-actions">
                    {fixedAssets.length > 0 ? (
                      <button type="button" onClick={() => handleViewChange('fixedAsset')}>
                        查看固定资产 {fixedAssets.length}
                      </button>
                    ) : null}
                    {vehicles.length > 0 ? (
                      <button type="button" onClick={() => handleViewChange('vehicle')}>
                        查看交通工具 {vehicles.length}
                      </button>
                    ) : null}
                  </div>
                </header>
                {fixedAssets.length > 0 ? (
                  <div className="asset-property-list">
                    {fixedAssets.map((item) => (
                      <PropertyCard key={item.itemId} item={item} onClick={() => setDetailItem(item)} />
                    ))}
                  </div>
                ) : null}
                {vehicles.length > 0 ? (
                  <div className="asset-property-list">
                    {vehicles.map((item) => (
                      <PropertyCard key={item.itemId} item={item} onClick={() => setDetailItem(item)} />
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {displayedFixedAssets.length > 0 ? (
              <div className="asset-property-list">
                {displayedFixedAssets.map((item) => (
                  <PropertyCard key={item.itemId} item={item} onClick={() => setDetailItem(item)} />
                ))}
              </div>
            ) : null}

            {displayedVehicles.length > 0 ? (
              <div className="asset-property-list">
                {displayedVehicles.map((item) => (
                  <PropertyCard key={item.itemId} item={item} onClick={() => setDetailItem(item)} />
                ))}
              </div>
            ) : null}

            {displayedStandardItems.length === 0 && displayedFixedAssets.length === 0 && displayedVehicles.length === 0 ? (
              <p className="asset-empty">暂无符合当前分类的物品与资产。</p>
            ) : null}
          </section>
        </div>

        {detailItem ? (
          <AssetDetailDialog
            item={detailItem}
            onClose={() => setDetailItem(null)}
            onDiscard={isStandardItem(detailItem) && onStateChange ? () => handleDiscardItem(detailItem) : undefined}
          />
        ) : null}
      </section>
    </div>
  );
}
