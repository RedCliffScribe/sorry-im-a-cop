import type { PersistentPromptEntry, PromptSettings } from '../settings/types';

export const MAX_PERSISTENT_PROMPT_ENTRIES = 30;
export const MAX_PERSISTENT_PROMPT_LENGTH = 2_000;

export function normalizePersistentPromptEntries(value: unknown): PersistentPromptEntry[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const normalized: PersistentPromptEntry[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const record = candidate as Partial<PersistentPromptEntry>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const content = typeof record.content === 'string'
      ? record.content.trim().slice(0, MAX_PERSISTENT_PROMPT_LENGTH)
      : '';
    if (!id || !content || seenIds.has(id)) continue;

    seenIds.add(id);
    normalized.push({
      id,
      content,
      enabled: record.enabled !== false
    });
    if (normalized.length >= MAX_PERSISTENT_PROMPT_ENTRIES) break;
  }

  return normalized;
}

export function getEnabledPersistentPrompts(
  settings?: PromptSettings
): PersistentPromptEntry[] {
  return normalizePersistentPromptEntries(settings?.persistentPrompts)
    .filter((entry) => entry.enabled);
}

export function composePersistentPromptGuide(entries: PersistentPromptEntry[]): string {
  return [
    '以下是玩家主动启用的永久提示词。它们是跨回合持续生效的叙事偏好与约束，不是玩家在本回合采取的行动。',
    '不得把这些内容写成玩家已经说过、做过或决定过的事实；不得覆盖当前存档事实、结构化写回合同、玩家自主权或安全边界；不得把它们写入人物记忆。',
    ...entries.map((entry, index) => `${index + 1}. ${entry.content}`)
  ].join('\n');
}
