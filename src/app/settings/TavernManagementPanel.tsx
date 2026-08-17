import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CUSTOM_COT_TEMPLATE,
  exportManagedTavernPreset,
  getActiveTavernPreset,
  getTavernPresetStats,
  importTavernPreset,
  resolveEffectiveTavernPreset
} from '../../domain/prompts/tavernPreset';
import { compileCreativeNarratorRequest } from '../../domain/prompts/creativePromptCompiler';
import type {
  AiSettings,
  ManagedTavernPresetEntry,
  TavernAssistantHandling,
  TavernPresetItemOverride,
  TavernPresetScope
} from '../../domain/settings/types';

type TavernTab = 'presets' | 'items' | 'cot' | 'preview';
type TavernItemRoleFilter = 'all' | 'system' | 'user' | 'assistant';
type TavernItemStatusFilter =
  | 'all'
  | 'enabled'
  | 'disabled'
  | 'included'
  | 'system_managed'
  | 'incompatible'
  | 'over_budget'
  | 'edited';

const statusLabels = {
  included: '会注入',
  disabled: '已关闭',
  out_of_scope: '不在当前作用域',
  reserved_runtime_slot: '由游戏运行态接管',
  missing_prompt: '缺少提示词',
  empty_content: '内容为空',
  assistant_incompatible: '助手消息未启用或不兼容',
  over_budget: '超过 48,000 字符预算'
} as const;

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function makeUniqueEntryId(entries: ManagedTavernPresetEntry[], id: string): string {
  if (!entries.some((entry) => entry.id === id)) return id;
  let suffix = 2;
  while (entries.some((entry) => entry.id === `${id}-${suffix}`)) suffix += 1;
  return `${id}-${suffix}`;
}

export function TavernManagementPanel({
  settings,
  onChange
}: {
  settings: AiSettings;
  onChange: (settings: AiSettings) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<TavernTab>('presets');
  const [message, setMessage] = useState<string | null>(null);
  const [previewScope, setPreviewScope] = useState<'opening' | 'turn'>('turn');
  const [itemSearch, setItemSearch] = useState('');
  const [itemRoleFilter, setItemRoleFilter] = useState<TavernItemRoleFilter>('all');
  const [itemStatusFilter, setItemStatusFilter] = useState<TavernItemStatusFilter>('all');
  const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);
  const tavern = settings.tavern;
  const activeEntry = getActiveTavernPreset(tavern);
  const editableResolution = useMemo(
    () => resolveEffectiveTavernPreset(
      { ...tavern, enabled: Boolean(activeEntry) },
      { scope: previewScope, playerName: '测试玩家' }
    ),
    [activeEntry, previewScope, tavern]
  );
  const compilation = useMemo(
    () => compileCreativeNarratorRequest({
      runtimePrompt: '【运行态上下文示例】这里由游戏在每次请求时注入当前事实、人物记忆和结构化输出合同。',
      tavernSettings: tavern,
      scope: previewScope,
      playerName: '测试玩家'
    }),
    [previewScope, tavern]
  );

  function updateTavern(next: AiSettings['tavern']) {
    onChange({ ...settings, tavern: next });
  }

  function updateEntry(entryId: string, updater: (entry: ManagedTavernPresetEntry) => ManagedTavernPresetEntry) {
    updateTavern({
      ...tavern,
      entries: tavern.entries.map((entry) => entry.id === entryId ? updater(entry) : entry)
    });
  }

  function updateItemOverride(slotKey: string, patch: TavernPresetItemOverride) {
    if (!activeEntry) return;
    updateEntry(activeEntry.id, (entry) => ({
      ...entry,
      customization: {
        ...entry.customization,
        itemOverrides: {
          ...entry.customization.itemOverrides,
          [slotKey]: {
            ...entry.customization.itemOverrides[slotKey],
            ...patch
          }
        }
      }
    }));
  }

  function resetItemOverride(slotKey: string) {
    if (!activeEntry) return;
    updateEntry(activeEntry.id, (entry) => {
      const { [slotKey]: _removed, ...itemOverrides } = entry.customization.itemOverrides;
      return {
        ...entry,
        customization: {
          ...entry.customization,
          itemOverrides
        }
      };
    });
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('预设文件超过 2 MB，请先精简后再导入。');
      }
      const result = importTavernPreset(await file.text(), file.name);
      const entry = {
        ...result.entry,
        id: makeUniqueEntryId(tavern.entries, result.entry.id)
      };
      updateTavern({
        ...tavern,
        enabled: result.exceedsInjectionBudget ? false : true,
        activePresetId: entry.id,
        entries: [...tavern.entries, entry]
      });
      setMessage(
        result.exceedsInjectionBudget
          ? `已导入“${entry.name}”，但启用项超过 48,000 字符预算。请先在“条目管理”关闭部分内容，再启用。`
          : `已导入“${entry.name}”${result.repaired ? '；原文件的 JSON 语法已修复' : ''}。`
      );
      setTab('presets');
    } catch (error) {
      setMessage(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function deleteActiveEntry() {
    if (!activeEntry || !window.confirm(`删除酒馆预设“${activeEntry.name}”？原始文件不会受影响。`)) return;
    const entries = tavern.entries.filter((entry) => entry.id !== activeEntry.id);
    updateTavern({
      ...tavern,
      enabled: tavern.enabled && entries.length > 0,
      activePresetId: entries[0]?.id ?? null,
      entries
    });
    setMessage('当前预设已从本地设置中删除。');
  }

  const activeStats = activeEntry ? getTavernPresetStats(activeEntry) : null;
  const previewMessages = compilation.messages;
  const selectedOrder = activeEntry?.preset.promptOrder.find(
    (order) => order.characterId === activeEntry.selectedCharacterId
  );
  const originalEnabledCount = selectedOrder?.order.filter((item) => item.enabled).length ?? 0;
  const actuallyInjectedCount = editableResolution.items.filter((item) => item.status === 'included').length;
  const filteredItems = editableResolution.items.filter((item) => {
    const override = activeEntry?.customization.itemOverrides[item.slotKey];
    const baseEnabled = selectedOrder?.order[item.orderIndex]?.enabled ?? false;
    const effectiveEnabled = override?.enabled ?? baseEnabled;
    const originalContent = activeEntry?.preset.prompts.find(
      (prompt) => prompt.identifier === item.identifier
    )?.content ?? '';
    const normalizedSearch = itemSearch.trim().toLocaleLowerCase();
    const matchesSearch = !normalizedSearch || [
      item.name,
      item.identifier,
      item.content,
      originalContent
    ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
    const matchesRole = itemRoleFilter === 'all' || item.originalRole === itemRoleFilter;
    const isIncompatible = [
      'missing_prompt',
      'empty_content',
      'assistant_incompatible'
    ].includes(item.status);
    const matchesStatus = itemStatusFilter === 'all'
      || (itemStatusFilter === 'enabled' && effectiveEnabled)
      || (itemStatusFilter === 'disabled' && !effectiveEnabled)
      || (itemStatusFilter === 'included' && item.status === 'included')
      || (itemStatusFilter === 'system_managed' && item.status === 'reserved_runtime_slot')
      || (itemStatusFilter === 'incompatible' && isIncompatible)
      || (itemStatusFilter === 'over_budget' && item.status === 'over_budget')
      || (itemStatusFilter === 'edited' && Boolean(override && Object.keys(override).length > 0));
    return matchesSearch && matchesRole && matchesStatus;
  });

  function setFilteredItemsEnabled(enabled: boolean) {
    if (!activeEntry || filteredItems.length === 0) return;
    const filteredKeys = new Set(filteredItems.map((item) => item.slotKey));
    updateEntry(activeEntry.id, (entry) => ({
      ...entry,
      customization: {
        ...entry.customization,
        itemOverrides: Object.fromEntries(
          editableResolution.items.map((item) => {
            const existing = entry.customization.itemOverrides[item.slotKey] ?? {};
            return [
              item.slotKey,
              filteredKeys.has(item.slotKey) ? { ...existing, enabled } : existing
            ];
          }).filter(([, override]) => Object.keys(override).length > 0)
        )
      }
    }));
  }

  return (
    <section className="settings-panel settings-panel-with-scroll tavern-management-panel">
      <div className="settings-topline">
        <div>
          <h2>酒馆预设与 CoT</h2>
          <p className="muted">
            独立管理 SillyTavern 预设、自定义创作规划和推理输出。每条预设均可单独开关；不存在互斥组。
          </p>
        </div>
        <label className="tavern-master-toggle">
          <input
            type="checkbox"
            checked={tavern.enabled}
            disabled={!activeEntry}
            onChange={(event) => updateTavern({ ...tavern, enabled: event.target.checked })}
          />
          启用当前酒馆预设
        </label>
      </div>

      <div className="tavern-management-tabs" role="tablist" aria-label="酒馆与 CoT 管理">
        {([
          ['presets', '预设档案'],
          ['items', '条目管理'],
          ['cot', '自定义 CoT'],
          ['preview', '注入预览']
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="settings-page-scroll tavern-management-scroll">
        {message ? <p className="settings-feedback" role="status">{message}</p> : null}

        {tab === 'presets' ? (
          <section className="settings-section">
            <div className="settings-action-row">
              <button type="button" onClick={() => fileInputRef.current?.click()}>导入 JSON</button>
              <button
                type="button"
                disabled={!activeEntry}
                onClick={() => activeEntry && downloadJson(
                  `cop-v2-tavern-${activeEntry.name}-${Date.now()}.json`,
                  exportManagedTavernPreset(activeEntry)
                )}
              >
                导出当前预设
              </button>
              <button type="button" disabled={!activeEntry} onClick={deleteActiveEntry}>删除当前预设</button>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".json,application/json,text/plain"
                aria-label="导入酒馆预设"
                onChange={(event) => void importFile(event.target.files?.[0])}
              />
            </div>

            {activeEntry && activeStats ? (
              <div className="tavern-preset-profile-grid">
                <label>
                  当前预设
                  <select
                    value={activeEntry.id}
                    onChange={(event) => updateTavern({ ...tavern, activePresetId: event.target.value })}
                  >
                    {tavern.entries.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  显示名称
                  <input
                    value={activeEntry.name}
                    onChange={(event) => updateEntry(activeEntry.id, (entry) => ({
                      ...entry,
                      name: event.target.value
                    }))}
                  />
                </label>
                <label>
                  prompt_order 槽位
                  <select
                    value={activeEntry.selectedCharacterId}
                    onChange={(event) => updateEntry(activeEntry.id, (entry) => ({
                      ...entry,
                      selectedCharacterId: Number(event.target.value)
                    }))}
                  >
                    {activeEntry.preset.promptOrder.map((order) => (
                      <option key={order.characterId} value={order.characterId}>{order.characterId}</option>
                    ))}
                  </select>
                </label>
                <div className="tavern-preset-metadata">
                  <strong>{activeStats.enabledOrderItems} / {activeStats.totalOrderItems} 条启用</strong>
                  <span>可注入候选 {activeStats.injectablePrompts} 条</span>
                  <small>原始内容哈希：{activeEntry.sourceHash}</small>
                </div>
              </div>
            ) : (
              <p className="muted">尚未导入预设。导入只读取 prompts 与 prompt_order，不读取 API Key、地址或模型。</p>
            )}
          </section>
        ) : null}

        {tab === 'items' ? (
          <section className="settings-section tavern-item-list">
            <div className="section-title-row">
              <div>
                <h3>顺序与独立开关</h3>
                <p className="muted">按原 prompt_order 显示。关闭、改作用域或编辑某一条，不会改写导入的原始预设。</p>
              </div>
              <label>
                查看作用域
                <select value={previewScope} onChange={(event) => setPreviewScope(event.target.value as 'opening' | 'turn')}>
                  <option value="opening">开局</option>
                  <option value="turn">普通回合</option>
                </select>
              </label>
            </div>
            {activeEntry ? (
              <>
                <div className="tavern-item-stat-grid" aria-label="条目统计">
                  <span>顺序条目<strong>{editableResolution.items.length}</strong></span>
                  <span>原始启用<strong>{originalEnabledCount}</strong></span>
                  <span>当前启用<strong>{activeStats?.enabledOrderItems ?? 0}</strong></span>
                  <span>实际注入<strong>{actuallyInjectedCount}</strong></span>
                  <span>注入字符<strong>{editableResolution.includedCharacters.toLocaleString()}</strong></span>
                </div>
                <div className="tavern-item-filter-grid">
                  <label>
                    搜索条目
                    <input
                      aria-label="搜索酒馆条目"
                      value={itemSearch}
                      placeholder="名称、标识符、原文或修改后内容"
                      onChange={(event) => setItemSearch(event.target.value)}
                    />
                  </label>
                  <label>
                    消息角色
                    <select
                      aria-label="筛选消息角色"
                      value={itemRoleFilter}
                      onChange={(event) => setItemRoleFilter(event.target.value as TavernItemRoleFilter)}
                    >
                      <option value="all">全部角色</option>
                      <option value="system">System</option>
                      <option value="user">User</option>
                      <option value="assistant">Assistant</option>
                    </select>
                  </label>
                  <label>
                    当前状态
                    <select
                      aria-label="筛选条目状态"
                      value={itemStatusFilter}
                      onChange={(event) => setItemStatusFilter(event.target.value as TavernItemStatusFilter)}
                    >
                      <option value="all">全部状态</option>
                      <option value="enabled">当前启用</option>
                      <option value="disabled">当前关闭</option>
                      <option value="included">实际注入</option>
                      <option value="system_managed">游戏接管</option>
                      <option value="incompatible">缺失或不兼容</option>
                      <option value="over_budget">超过预算</option>
                      <option value="edited">已自定义</option>
                    </select>
                  </label>
                  <div className="tavern-item-bulk-actions">
                    <span>筛选结果 {filteredItems.length} 条</span>
                    <button
                      type="button"
                      disabled={filteredItems.length === 0}
                      onClick={() => setFilteredItemsEnabled(true)}
                    >
                      启用筛选结果
                    </button>
                    <button
                      type="button"
                      disabled={filteredItems.length === 0}
                      onClick={() => setFilteredItemsEnabled(false)}
                    >
                      关闭筛选结果
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            {activeEntry ? filteredItems.map((item) => {
              const baseEnabled = activeEntry.preset.promptOrder
                .find((order) => order.characterId === activeEntry.selectedCharacterId)
                ?.order[item.orderIndex]?.enabled ?? false;
              const override = activeEntry.customization.itemOverrides[item.slotKey] ?? {};
              const effectiveEnabled = override.enabled ?? baseEnabled;
              const isExpanded = expandedItemKey === item.slotKey;
              const isEdited = Object.keys(override).length > 0;
              return (
                <article className={`tavern-item-card${isExpanded ? ' is-expanded' : ''}`} key={item.slotKey}>
                  <div className="tavern-item-heading">
                    <label>
                      <input
                        type="checkbox"
                        checked={effectiveEnabled}
                        onChange={(event) => updateItemOverride(item.slotKey, { enabled: event.target.checked })}
                      />
                      <strong>{item.orderIndex + 1}. {item.name}</strong>
                    </label>
                    <div className="tavern-item-heading-actions">
                      <span>{item.originalRole}</span>
                      {isEdited ? <span>已自定义</span> : null}
                      <span data-status={item.status}>{statusLabels[item.status]}</span>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedItemKey(isExpanded ? null : item.slotKey)}
                      >
                        {isExpanded ? '收起' : '编辑'}
                      </button>
                    </div>
                  </div>
                  <div className="tavern-item-compact-meta">
                    <span>标识 {item.identifier}</span>
                    <span>{item.characters.toLocaleString()} 字符</span>
                    <span>作用域 {override.scope ?? 'both'}</span>
                    <span>原始{baseEnabled ? '启用' : '关闭'} · 当前{effectiveEnabled ? '启用' : '关闭'}</span>
                  </div>
                  {isExpanded ? (
                    <div className="tavern-item-editor">
                      <label>
                        作用域
                        <select
                          value={override.scope ?? 'both'}
                          onChange={(event) => updateItemOverride(item.slotKey, {
                            scope: event.target.value as TavernPresetScope
                          })}
                        >
                          <option value="both">开局与普通回合</option>
                          <option value="opening">仅开局</option>
                          <option value="turn">仅普通回合</option>
                        </select>
                      </label>
                      {item.originalRole === 'assistant' ? (
                        <label>
                          助手消息处理
                          <select
                            value={override.assistantHandling ?? 'disabled'}
                            onChange={(event) => updateItemOverride(item.slotKey, {
                              assistantHandling: event.target.value as TavernAssistantHandling
                            })}
                          >
                            <option value="disabled">不注入（默认）</option>
                            <option value="few_shot">作为少样本回答</option>
                            <option value="creative_rule">转换为创作规则</option>
                          </select>
                        </label>
                      ) : null}
                      <label className="tavern-item-editor-content">
                        修改后内容
                        <textarea
                          aria-label={`${item.name} 内容`}
                          value={override.contentOverride ?? item.content}
                          onChange={(event) => updateItemOverride(item.slotKey, {
                            contentOverride: event.target.value
                          })}
                        />
                      </label>
                      <div className="tavern-item-editor-footer">
                        <small>原角色：{item.originalRole} · 注入角色：{item.role}</small>
                        <button type="button" onClick={() => resetItemOverride(item.slotKey)}>恢复原始设置与原文</button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            }) : <p className="muted">请先导入一份酒馆预设。</p>}
            {activeEntry && filteredItems.length === 0 ? (
              <p className="muted">没有符合当前搜索和筛选条件的条目。</p>
            ) : null}
          </section>
        ) : null}

        {tab === 'cot' ? (
          <section className="settings-section tavern-cot-grid">
            <div>
              <h3>自定义 CoT / 创作规划</h3>
              <p className="muted">与主剧情同一次请求发送，不额外调用模型。只指导创作规划，不改变游戏事实和写回协议。</p>
            </div>
            <label className="settings-checkbox-line">
              <input
                type="checkbox"
                checked={tavern.customCot.enabled}
                onChange={(event) => updateTavern({
                  ...tavern,
                  customCot: { ...tavern.customCot, enabled: event.target.checked }
                })}
              />
              启用自定义 CoT
            </label>
            <label>
              作用域
              <select
                value={tavern.customCot.scope}
                onChange={(event) => updateTavern({
                  ...tavern,
                  customCot: {
                    ...tavern.customCot,
                    scope: event.target.value as TavernPresetScope
                  }
                })}
              >
                <option value="both">开局与普通回合</option>
                <option value="opening">仅开局</option>
                <option value="turn">仅普通回合</option>
              </select>
            </label>
            <label>
              模板
              <select
                value={tavern.customCot.templateId}
                onChange={(event) => updateTavern({
                  ...tavern,
                  customCot: {
                    ...tavern.customCot,
                    templateId: event.target.value as 'natural-planning' | 'custom'
                  }
                })}
              >
                <option value="natural-planning">内置自然规划</option>
                <option value="custom">自定义</option>
              </select>
            </label>
            <textarea
              aria-label="自定义 CoT 正文"
              readOnly={tavern.customCot.templateId !== 'custom'}
              value={tavern.customCot.templateId === 'custom'
                ? tavern.customCot.content
                : DEFAULT_CUSTOM_COT_TEMPLATE}
              onChange={(event) => updateTavern({
                ...tavern,
                customCot: { ...tavern.customCot, content: event.target.value }
              })}
            />

            <div className="tavern-reasoning-settings">
              <h3>推理输出隔离</h3>
              <p className="muted">推理摘要不会写入正文、人物记忆或存档事实；关闭时完全忽略。</p>
              <label>
                接收方式
                <select
                  value={tavern.reasoningOutput.mode}
                  onChange={(event) => updateTavern({
                    ...tavern,
                    reasoningOutput: {
                      ...tavern.reasoningOutput,
                      mode: event.target.value as AiSettings['tavern']['reasoningOutput']['mode']
                    }
                  })}
                >
                  <option value="off">关闭</option>
                  <option value="provider">读取服务商 reasoning 字段</option>
                  <option value="json">读取顶层 reasoningText</option>
                </select>
              </label>
              <label>
                最多保留字符
                <input
                  type="number"
                  min={0}
                  max={8000}
                  value={tavern.reasoningOutput.maxCharacters}
                  onChange={(event) => updateTavern({
                    ...tavern,
                    reasoningOutput: {
                      ...tavern.reasoningOutput,
                      maxCharacters: Math.max(0, Math.min(8000, Number(event.target.value) || 0))
                    }
                  })}
                />
              </label>
              <label className="settings-checkbox-line">
                <input
                  type="checkbox"
                  checked={tavern.reasoningOutput.showInUi}
                  disabled={tavern.reasoningOutput.mode === 'off'}
                  onChange={(event) => updateTavern({
                    ...tavern,
                    reasoningOutput: {
                      ...tavern.reasoningOutput,
                      showInUi: event.target.checked
                    }
                  })}
                />
                在游戏界面的 AI 处理轨迹中显示推理摘要
              </label>
            </div>
          </section>
        ) : null}

        {tab === 'preview' ? (
          <section className="settings-section">
            <div className="section-title-row">
              <div>
                <h3>最终消息顺序预览</h3>
                <p className="muted">只显示消息来源、角色、长度和注入状态，不会发起 API 请求。</p>
              </div>
              <label>
                作用域
                <select value={previewScope} onChange={(event) => setPreviewScope(event.target.value as 'opening' | 'turn')}>
                  <option value="opening">开局</option>
                  <option value="turn">普通回合</option>
                </select>
              </label>
            </div>
            <div className="tavern-preview-budget">
              <strong>
                预设已注入 {compilation.tavern.includedCharacters.toLocaleString()} / {compilation.tavern.characterLimit.toLocaleString()} 字符
              </strong>
              <span>自定义 CoT：{compilation.customCotIncluded ? '启用' : '未注入'}</span>
            </div>
            <ol className="tavern-preview-message-list">
              {previewMessages.map((messageItem, index) => (
                <li key={`${messageItem.source}-${messageItem.sourceId ?? index}-${index}`}>
                  <strong>{index + 1}. {messageItem.role}</strong>
                  <span>{messageItem.source}{messageItem.sourceId ? ` · ${messageItem.sourceId}` : ''}</span>
                  <small>{messageItem.content.length.toLocaleString()} 字符</small>
                  <p>{messageItem.content.slice(0, 180)}{messageItem.content.length > 180 ? '…' : ''}</p>
                </li>
              ))}
            </ol>
            {compilation.tavern.items.length > 0 ? (
              <details>
                <summary>查看未注入条目及原因</summary>
                <ul className="tavern-preview-status-list">
                  {compilation.tavern.items
                    .filter((item) => item.status !== 'included')
                    .map((item) => (
                      <li key={item.slotKey}>
                        <span>{item.orderIndex + 1}. {item.name}</span>
                        <strong>{statusLabels[item.status]}</strong>
                      </li>
                    ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
