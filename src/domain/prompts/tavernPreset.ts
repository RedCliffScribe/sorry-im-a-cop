import { jsonrepair } from 'jsonrepair';
import type {
  ManagedTavernPresetEntry,
  TavernAssistantHandling,
  TavernManagementSettings,
  TavernPreset,
  TavernPresetItemOverride,
  TavernPresetMessageRole,
  TavernPresetOrder,
  TavernPresetOrderItem,
  TavernPresetPrompt,
  TavernPresetScope
} from '../settings/types';

const preferredDefaultCharacterId = 100001;
export const TAVERN_INJECTION_CHARACTER_LIMIT = 48_000;
export const TAVERN_RESERVED_RUNTIME_SLOTS = new Set([
  'chathistory',
  'worldinfobefore',
  'worldinfoafter',
  'chardescription',
  'charpersonality',
  'scenario',
  'personadescription',
  'dialogueexamples'
]);

export const DEFAULT_CUSTOM_COT_TEMPLATE = [
  '在输出最终 JSON 前先在模型内部完成自然的叙事规划：',
  '1. 核对当前事实、人物动机、时代约束和玩家明确行动。',
  '2. 选择最有戏剧张力但不替玩家做新决定的发展。',
  '3. 让人物对白符合各自身份和语言习惯，避免所有人同声同气。',
  '4. 确保正文、行动选项和结构化写回彼此一致。',
  '只输出协议要求的最终结果，不展示内部思考过程。'
].join('\n');

export type TavernResolutionStatus =
  | 'included'
  | 'disabled'
  | 'out_of_scope'
  | 'reserved_runtime_slot'
  | 'missing_prompt'
  | 'empty_content'
  | 'assistant_incompatible'
  | 'over_budget';

export interface ResolvedTavernItem {
  slotKey: string;
  orderIndex: number;
  identifier: string;
  name: string;
  originalRole: TavernPresetMessageRole;
  role: TavernPresetMessageRole;
  content: string;
  scope: TavernPresetScope;
  assistantHandling: TavernAssistantHandling;
  status: TavernResolutionStatus;
  characters: number;
}

export interface ResolvedTavernPreset {
  entry: ManagedTavernPresetEntry | null;
  characterId: number | null;
  items: ResolvedTavernItem[];
  includedCharacters: number;
  characterLimit: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed);
  }
  return null;
}

function normalizeRole(value: unknown): TavernPresetMessageRole {
  return value === 'user' || value === 'assistant' ? value : 'system';
}

function normalizePrompt(value: unknown): TavernPresetPrompt | null {
  if (!isRecord(value)) return null;
  const identifier = readString(value.identifier).trim();
  if (!identifier) return null;
  const name = readString(value.name || value.title).trim();
  return {
    identifier,
    ...(name ? { name } : {}),
    role: normalizeRole(value.role),
    content: readString(value.content),
    systemPrompt: value.system_prompt === true
  };
}

function normalizeOrderItem(value: unknown): TavernPresetOrderItem | null {
  if (!isRecord(value)) return null;
  const identifier = readString(value.identifier).trim();
  if (!identifier) return null;
  return {
    identifier,
    enabled: value.enabled !== false
  };
}

function normalizeOrder(value: unknown): TavernPresetOrder | null {
  if (!isRecord(value)) return null;
  const characterId = readInteger(value.character_id ?? value.characterId);
  const order = Array.isArray(value.order)
    ? value.order.map(normalizeOrderItem).filter((item): item is TavernPresetOrderItem => Boolean(item))
    : [];
  if (characterId === null || order.length === 0) return null;
  return { characterId, order };
}

export function normalizeTavernPreset(value: unknown): TavernPreset | null {
  if (!isRecord(value)) return null;
  const prompts = Array.isArray(value.prompts)
    ? value.prompts.map(normalizePrompt).filter((item): item is TavernPresetPrompt => Boolean(item))
    : [];
  const rawOrder = value.prompt_order ?? value.promptOrder;
  const promptOrder = Array.isArray(rawOrder)
    ? rawOrder.map(normalizeOrder).filter((item): item is TavernPresetOrder => Boolean(item))
    : [];
  if (prompts.length === 0 || promptOrder.length === 0) return null;
  return { prompts, promptOrder };
}

export function resolveTavernPresetOrder(
  preset: TavernPreset,
  selectedCharacterId?: number | null
): TavernPresetOrder {
  const selected = typeof selectedCharacterId === 'number'
    ? preset.promptOrder.find((item) => item.characterId === selectedCharacterId)
    : undefined;
  return selected
    ?? preset.promptOrder.find((item) => item.characterId === preferredDefaultCharacterId)
    ?? preset.promptOrder[0];
}

function createPresetId(name: string, importedAt: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\.json$/i, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36) || 'preset';
  return `tavern-${slug}-${Date.parse(importedAt) || Date.now()}`;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function calculateSourceHash(preset: TavernPreset): string {
  return hashText(JSON.stringify(preset));
}

function normalizeScope(value: unknown): TavernPresetScope {
  return value === 'opening' || value === 'turn' ? value : 'both';
}

function normalizeAssistantHandling(value: unknown): TavernAssistantHandling {
  return value === 'few_shot' || value === 'creative_rule' ? value : 'disabled';
}

function normalizeItemOverride(value: unknown): TavernPresetItemOverride {
  if (!isRecord(value)) return {};
  return {
    ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
    ...(typeof value.contentOverride === 'string' ? { contentOverride: value.contentOverride } : {}),
    ...(value.scope ? { scope: normalizeScope(value.scope) } : {}),
    ...(value.assistantHandling ? {
      assistantHandling: normalizeAssistantHandling(value.assistantHandling)
    } : {})
  };
}

function normalizeCustomization(value: unknown): ManagedTavernPresetEntry['customization'] {
  const overrides = isRecord(value) && isRecord(value.itemOverrides)
    ? Object.fromEntries(
        Object.entries(value.itemOverrides).map(([key, item]) => [key, normalizeItemOverride(item)])
      )
    : {};
  return {
    version: 1,
    itemOverrides: overrides
  };
}

export interface TavernPresetImportResult {
  entry: ManagedTavernPresetEntry;
  repaired: boolean;
  exceedsInjectionBudget: boolean;
}

export function importTavernPreset(
  rawJson: string,
  fileName: string,
  importedAt = new Date().toISOString()
): TavernPresetImportResult {
  let parsed: unknown;
  let repaired = false;
  try {
    parsed = JSON.parse(rawJson.replace(/^\uFEFF/, ''));
  } catch {
    try {
      parsed = JSON.parse(jsonrepair(rawJson));
      repaired = true;
    } catch {
      throw new Error('文件不是有效 JSON。');
    }
  }

  const source = isRecord(parsed) && isRecord(parsed.entry) && isRecord(parsed.entry.preset)
    ? parsed.entry.preset
    : isRecord(parsed) && isRecord(parsed.data)
      ? parsed.data
      : parsed;
  const preset = normalizeTavernPreset(source);
  if (!preset) {
    throw new Error('未找到可用的 prompts 与 prompt_order。请选择 SillyTavern 聊天补全预设 JSON。');
  }

  const sourceName = isRecord(parsed) && isRecord(parsed.entry)
    ? readString(parsed.entry.name).trim()
    : isRecord(source)
      ? readString(source.name).trim()
      : '';
  const name = sourceName || fileName.replace(/\.json$/i, '').trim() || '未命名酒馆预设';
  const selectedCharacterId = resolveTavernPresetOrder(preset).characterId;
  const entry: ManagedTavernPresetEntry = {
    id: createPresetId(name, importedAt),
    name,
    importedAt,
    sourceHash: calculateSourceHash(preset),
    selectedCharacterId,
    preset,
    customization: isRecord(parsed) && isRecord(parsed.entry)
      ? normalizeCustomization(parsed.entry.customization)
      : {
          version: 1,
          itemOverrides: {}
        }
  };
  const resolved = resolveEffectiveTavernPreset(
    {
      ...createDefaultTavernManagementSettings(),
      enabled: true,
      activePresetId: entry.id,
      entries: [entry]
    },
    { scope: 'turn' }
  );
  return {
    repaired,
    entry,
    exceedsInjectionBudget: resolved.items.some((item) => item.status === 'over_budget')
  };
}

function normalizeEntry(value: unknown, index: number): ManagedTavernPresetEntry | null {
  if (!isRecord(value)) return null;
  const preset = normalizeTavernPreset(value.preset);
  if (!preset) return null;
  const name = readString(value.name).trim() || `酒馆预设 ${index + 1}`;
  const importedAt = readString(value.importedAt).trim() || new Date(0).toISOString();
  const selectedCharacterId = resolveTavernPresetOrder(
    preset,
    readInteger(value.selectedCharacterId)
  ).characterId;
  return {
    id: readString(value.id).trim() || `tavern-preset-${index + 1}`,
    name,
    importedAt,
    sourceHash: readString(value.sourceHash).trim() || calculateSourceHash(preset),
    selectedCharacterId,
    preset,
    customization: normalizeCustomization(value.customization)
  };
}

export function createDefaultTavernManagementSettings(): TavernManagementSettings {
  return {
    enabled: false,
    activePresetId: null,
    entries: [],
    customCot: {
      enabled: false,
      scope: 'both',
      content: '',
      templateId: 'natural-planning'
    },
    reasoningOutput: {
      mode: 'off',
      maxCharacters: 4000,
      showInUi: false
    }
  };
}

export function normalizeTavernPresetSettings(value: unknown): TavernManagementSettings {
  const defaults = createDefaultTavernManagementSettings();
  if (!isRecord(value)) return defaults;
  const entries = Array.isArray(value.entries)
    ? value.entries.map(normalizeEntry).filter((item): item is ManagedTavernPresetEntry => Boolean(item))
    : [];
  const requestedId = readString(value.activePresetId).trim();
  const activePresetId = entries.some((entry) => entry.id === requestedId)
    ? requestedId
    : entries[0]?.id ?? null;
  const customCot = isRecord(value.customCot) ? value.customCot : {};
  const reasoningOutput = isRecord(value.reasoningOutput) ? value.reasoningOutput : {};
  const maxCharacters = Math.max(
    0,
    Math.min(8000, readInteger(reasoningOutput.maxCharacters) ?? defaults.reasoningOutput.maxCharacters)
  );
  return {
    enabled: value.enabled === true && entries.length > 0,
    activePresetId,
    entries,
    customCot: {
      enabled: customCot.enabled === true,
      scope: normalizeScope(customCot.scope),
      content: readString(customCot.content),
      templateId: customCot.templateId === 'custom' ? 'custom' : 'natural-planning'
    },
    reasoningOutput: {
      mode: reasoningOutput.mode === 'provider' || reasoningOutput.mode === 'json'
        ? reasoningOutput.mode
        : 'off',
      maxCharacters,
      showInUi: reasoningOutput.showInUi === true
    }
  };
}

export function getActiveTavernPreset(
  settings: TavernManagementSettings
): ManagedTavernPresetEntry | null {
  return settings.entries.find((entry) => entry.id === settings.activePresetId)
    ?? settings.entries[0]
    ?? null;
}

function replaceTavernMacros(content: string, playerName: string): string {
  const user = playerName.trim() || '玩家';
  return content
    .replace(/\{\{\s*(?:user|user_name)\s*\}\}/gi, user)
    .replace(/<user>/gi, user)
    .replace(/\{\{\s*(?:char|char_name)\s*\}\}/gi, '叙事系统')
    .replace(/<(?:char|charname|bot)>/gi, '叙事系统');
}

function scopeMatches(itemScope: TavernPresetScope, requestScope: 'opening' | 'turn'): boolean {
  return itemScope === 'both' || itemScope === requestScope;
}

function looksLikeChainOfThought(content: string): boolean {
  return /<(?:think|thinking|analysis)>|思维链|chain[- ]of[- ]thought|逐步思考|内部思考/i.test(content);
}

export function getTavernSlotKey(orderIndex: number, identifier: string): string {
  return `${orderIndex}:${identifier}`;
}

export function resolveEffectiveTavernPreset(
  settings: TavernManagementSettings | undefined,
  options: { scope: 'opening' | 'turn'; playerName?: string }
): ResolvedTavernPreset {
  const entry = settings?.enabled ? getActiveTavernPreset(settings) : null;
  if (!entry) {
    return {
      entry: null,
      characterId: null,
      items: [],
      includedCharacters: 0,
      characterLimit: TAVERN_INJECTION_CHARACTER_LIMIT
    };
  }

  const order = resolveTavernPresetOrder(entry.preset, entry.selectedCharacterId);
  const promptMap = new Map(entry.preset.prompts.map((prompt) => [prompt.identifier, prompt]));
  const items: ResolvedTavernItem[] = [];
  let usedCharacters = 0;

  for (let orderIndex = 0; orderIndex < order.order.length; orderIndex += 1) {
    const slot = order.order[orderIndex];
    const slotKey = getTavernSlotKey(orderIndex, slot.identifier);
    const override = entry.customization.itemOverrides[slotKey] ?? {};
    const prompt = promptMap.get(slot.identifier);
    const originalRole = prompt?.role ?? 'system';
    const assistantHandling = originalRole === 'assistant'
      ? normalizeAssistantHandling(override.assistantHandling)
      : 'disabled';
    const scope = normalizeScope(override.scope);
    const content = replaceTavernMacros(
      override.contentOverride ?? prompt?.content ?? '',
      options.playerName ?? ''
    ).trim();
    let role: TavernPresetMessageRole = originalRole;
    let status: TavernResolutionStatus = 'included';

    if ((override.enabled ?? slot.enabled) === false) {
      status = 'disabled';
    } else if (!scopeMatches(scope, options.scope)) {
      status = 'out_of_scope';
    } else if (TAVERN_RESERVED_RUNTIME_SLOTS.has(slot.identifier.toLowerCase())) {
      status = 'reserved_runtime_slot';
    } else if (!prompt) {
      status = 'missing_prompt';
    } else if (!content) {
      status = 'empty_content';
    } else if (originalRole === 'assistant') {
      if (assistantHandling === 'creative_rule') {
        role = 'system';
      } else if (assistantHandling === 'few_shot') {
        const previous = items.at(-1);
        if (
          !previous
          || previous.status !== 'included'
          || previous.role !== 'user'
          || looksLikeChainOfThought(content)
        ) {
          status = 'assistant_incompatible';
        }
      } else {
        status = 'assistant_incompatible';
      }
    }

    if (status === 'included' && usedCharacters + content.length > TAVERN_INJECTION_CHARACTER_LIMIT) {
      status = 'over_budget';
    }
    if (status === 'included') usedCharacters += content.length;

    items.push({
      slotKey,
      orderIndex,
      identifier: slot.identifier,
      name: prompt?.name || slot.identifier,
      originalRole,
      role,
      content,
      scope,
      assistantHandling,
      status,
      characters: content.length
    });
  }

  return {
    entry,
    characterId: order.characterId,
    items,
    includedCharacters: usedCharacters,
    characterLimit: TAVERN_INJECTION_CHARACTER_LIMIT
  };
}

export function getTavernPresetStats(entry: ManagedTavernPresetEntry): {
  totalOrderItems: number;
  enabledOrderItems: number;
  injectablePrompts: number;
} {
  const order = resolveTavernPresetOrder(entry.preset, entry.selectedCharacterId);
  const promptMap = new Map(entry.preset.prompts.map((prompt) => [prompt.identifier, prompt]));
  return {
    totalOrderItems: order.order.length,
    enabledOrderItems: order.order.filter((item, index) => (
      entry.customization.itemOverrides[getTavernSlotKey(index, item.identifier)]?.enabled ?? item.enabled
    )).length,
    injectablePrompts: order.order.filter((item, index) => {
      const override = entry.customization.itemOverrides[getTavernSlotKey(index, item.identifier)] ?? {};
      if (
        (override.enabled ?? item.enabled) === false
        || TAVERN_RESERVED_RUNTIME_SLOTS.has(item.identifier.toLowerCase())
      ) return false;
      const prompt = promptMap.get(item.identifier);
      return Boolean((override.contentOverride ?? prompt?.content ?? '').trim());
    }).length
  };
}

export function exportManagedTavernPreset(entry: ManagedTavernPresetEntry): unknown {
  return {
    format: 'sorry-im-a-cop-v2-tavern-preset',
    version: 1,
    exportedAt: new Date().toISOString(),
    entry
  };
}
