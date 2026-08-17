import { useEffect, useState } from 'react';
import {
  MAX_PERSISTENT_PROMPT_ENTRIES,
  MAX_PERSISTENT_PROMPT_LENGTH,
  normalizePersistentPromptEntries
} from '../../domain/prompts/persistentPrompt';
import type { PersistentPromptEntry } from '../../domain/settings/types';

function createPersistentPromptId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `persistent-prompt-${globalThis.crypto.randomUUID()}`;
  }
  return `persistent-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function PersistentPromptManager({
  entries,
  onChange,
  onClose
}: {
  entries: PersistentPromptEntry[];
  onChange: (entries: PersistentPromptEntry[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const normalizedEntries = normalizePersistentPromptEntries(entries);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const updateEntries = (nextEntries: PersistentPromptEntry[]) => {
    void onChange(normalizePersistentPromptEntries(nextEntries));
  };

  const addPrompt = () => {
    const content = draft.trim().slice(0, MAX_PERSISTENT_PROMPT_LENGTH);
    if (!content || normalizedEntries.length >= MAX_PERSISTENT_PROMPT_ENTRIES) return;
    updateEntries([
      ...normalizedEntries,
      {
        id: createPersistentPromptId(),
        content,
        enabled: true
      }
    ]);
    setDraft('');
  };

  return (
    <div
      className="persistent-prompt-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="persistent-prompt-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="persistent-prompt-manager-title"
      >
        <header>
          <div>
            <h2 id="persistent-prompt-manager-title">永久提示词</h2>
            <p>
              保存在当前浏览器的全局设置中，由所有存档共用。勾选后会持续用于之后的开局与剧情回合；
              它不会被当作玩家行动，也不会写进 NPC 记忆。
            </p>
          </div>
          <button type="button" aria-label="关闭永久提示词" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="persistent-prompt-new">
          <textarea
            autoFocus
            aria-label="新增永久提示词"
            value={draft}
            maxLength={MAX_PERSISTENT_PROMPT_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="例如：对白尽量自然、贴近香港日常口语；不要替玩家接受或拒绝邀约。"
          />
          <button
            type="button"
            disabled={!draft.trim() || normalizedEntries.length >= MAX_PERSISTENT_PROMPT_ENTRIES}
            onClick={addPrompt}
          >
            新增
          </button>
        </div>

        <div className="persistent-prompt-list" aria-label="永久提示词列表">
          {normalizedEntries.length === 0 ? (
            <p className="persistent-prompt-empty">尚未添加永久提示词。</p>
          ) : normalizedEntries.map((entry) => (
            <article key={entry.id} className="persistent-prompt-entry">
              <label>
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  aria-label={`启用永久提示词：${entry.content}`}
                  onChange={(event) => {
                    updateEntries(normalizedEntries.map((candidate) => (
                      candidate.id === entry.id
                        ? { ...candidate, enabled: event.target.checked }
                        : candidate
                    )));
                  }}
                />
                <span>{entry.content}</span>
              </label>
              <button
                type="button"
                aria-label={`删除永久提示词：${entry.content}`}
                onClick={() => {
                  updateEntries(normalizedEntries.filter((candidate) => candidate.id !== entry.id));
                }}
              >
                删除
              </button>
            </article>
          ))}
        </div>

        <footer>
          <span>{normalizedEntries.filter((entry) => entry.enabled).length} 条已启用</span>
          <button type="button" onClick={onClose}>完成</button>
        </footer>
      </section>
    </div>
  );
}
