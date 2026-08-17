import { type FormEvent, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import type { PersistentPromptEntry } from '../../domain/settings/types';
import { PersistentPromptManager } from './PersistentPromptManager';
import './CommandBar.css';

const SUGGESTED_ACTION_SUMMARY_MAX_LENGTH = 16;

function summarizeSuggestedAction(action: string): string {
  const normalized = action
    .replace(/\s+/g, ' ')
    .replace(/^[“”"'「」『』]+|[“”"'「」『』]+$/g, '')
    .trim();
  if (!normalized) return '查看行动';

  const clauses = normalized
    .split(/[，。；：！？,.!?;]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  let summary = clauses[0] ?? normalized;

  if ([...summary].length < 6 && clauses[1]) {
    summary = `${summary} · ${clauses[1]}`;
  }

  const characters = [...summary];
  if (characters.length <= SUGGESTED_ACTION_SUMMARY_MAX_LENGTH) {
    return summary;
  }
  return `${characters.slice(0, SUGGESTED_ACTION_SUMMARY_MAX_LENGTH).join('')}…`;
}

function appendActionDraft(current: string, next: string): string {
  const currentText = current.trim();
  const nextText = next.trim();
  if (!nextText) return current;
  if (!currentText) return nextText;
  return `${currentText}\n${nextText}`;
}

export function CommandBar({
  disabled,
  isTurnRunning = false,
  isAborting = false,
  onAbort,
  onSubmit,
  suggestedActions = [],
  suggestedActionMode = 'active',
  draftScopeKey,
  draftActionText,
  draftActionVersion,
  canRollbackLatestTurn = false,
  rollbackUnavailableReason = '当前回合没有可用的回溯快照。',
  onRollbackLatestTurn,
  persistentPrompts = [],
  onPersistentPromptsChange
}: {
  disabled: boolean;
  isTurnRunning?: boolean;
  isAborting?: boolean;
  onAbort?: () => void;
  onSubmit: (input: string) => Promise<void> | void;
  suggestedActions?: string[];
  suggestedActionMode?: 'active' | 'opening-preview';
  draftScopeKey?: string;
  draftActionText?: string | null;
  draftActionVersion?: number;
  canRollbackLatestTurn?: boolean;
  rollbackUnavailableReason?: string;
  onRollbackLatestTurn?: () => void | Promise<void>;
  persistentPrompts?: PersistentPromptEntry[];
  onPersistentPromptsChange?: (entries: PersistentPromptEntry[]) => void | Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [editorValue, setEditorValue] = useState('');
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false);
  const [isMobileToolsOpen, setIsMobileToolsOpen] = useState(false);
  const [isPersistentPromptManagerOpen, setIsPersistentPromptManagerOpen] = useState(false);
  const rightCtrlDownRef = useRef(false);

  useEffect(() => {
    setValue('');
    setEditorValue('');
    setIsMobileEditorOpen(false);
  }, [draftScopeKey]);

  useEffect(() => {
    if (draftActionText) {
      setValue((current) => appendActionDraft(current, draftActionText));
    }
  }, [draftActionText, draftActionVersion]);

  const submitAction = async () => {
    if (disabled) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue('');
    try {
      await onSubmit(trimmed);
    } catch (error) {
      setValue(trimmed);
      throw error;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitAction();
  };

  const handleActionKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.code === 'ControlRight') {
      rightCtrlDownRef.current = true;
      return;
    }
    if (event.key !== 'Enter' || !rightCtrlDownRef.current) return;

    event.preventDefault();
    await submitAction();
  };

  const handleActionKeyUp = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.code === 'ControlRight') {
      rightCtrlDownRef.current = false;
    }
  };

  const handleAbortClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    rightCtrlDownRef.current = false;
    onAbort?.();
  };

  const openMobileEditor = () => {
    if (disabled) return;
    setEditorValue(value);
    setIsMobileEditorOpen(true);
  };

  const closeMobileEditor = () => {
    setIsMobileEditorOpen(false);
  };

  const confirmMobileEditor = () => {
    setValue(editorValue);
    setIsMobileEditorOpen(false);
  };

  return (
    <section className="command-stack" aria-label="行动输入">
      {suggestedActions.length > 0 || onPersistentPromptsChange ? (
        <div
          className="suggested-action-strip"
          data-suggested-action-mode={suggestedActionMode}
        >
          {suggestedActionMode === 'opening-preview' ? (
            <div className="suggested-action-preview-label" role="status">
              <strong>行动选项预览</strong>
              <span>开局数据校验并保存完成后可用</span>
            </div>
          ) : null}
          <div className="suggested-action-row">
            <div className="suggested-action-list" aria-label="建议行动">
              {suggestedActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={disabled}
                  title={action}
                  aria-label={action}
                  onClick={() => setValue((current) => appendActionDraft(current, action))}
                >
                  <span className="suggested-action-summary">
                    {summarizeSuggestedAction(action)}
                  </span>
                </button>
              ))}
            </div>
            {onPersistentPromptsChange ? (
              <>
                <button
                  className="persistent-prompt-trigger"
                  type="button"
                  aria-label="管理永久提示词"
                  title="新增、启用或删除每回合持续生效的提示词"
                  onClick={() => setIsPersistentPromptManagerOpen(true)}
                >
                  永久提示词
                  {persistentPrompts.some((entry) => entry.enabled) ? (
                    <span>{persistentPrompts.filter((entry) => entry.enabled).length}</span>
                  ) : null}
                </button>
                <div className="command-mobile-tools">
                  <button
                    className="command-mobile-tools-trigger"
                    type="button"
                    aria-label="展开行动功能"
                    aria-expanded={isMobileToolsOpen}
                    title="展开不常用功能"
                    onClick={() => setIsMobileToolsOpen((open) => !open)}
                  >
                    <span aria-hidden="true">•••</span>
                    {persistentPrompts.some((entry) => entry.enabled) ? (
                      <strong>{persistentPrompts.filter((entry) => entry.enabled).length}</strong>
                    ) : null}
                  </button>
                  {isMobileToolsOpen ? (
                    <div className="command-mobile-tools-menu" role="menu" aria-label="行动功能">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMobileToolsOpen(false);
                          setIsPersistentPromptManagerOpen(true);
                        }}
                      >
                        永久提示词
                        <span>
                          {persistentPrompts.filter((entry) => entry.enabled).length} 条启用
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
          {suggestedActions.length > 0 ? (
            <span
              className="suggested-action-scroll-hint"
              aria-hidden="true"
              title="左右滑动查看更多行动选项"
            >
              ↔
            </span>
          ) : null}
        </div>
      ) : null}
      <form
        className="command-bar"
        onSubmit={handleSubmit}
      >
        <label htmlFor="player-action">玩家行动</label>
        {onRollbackLatestTurn ? (
          <button
            className="command-reroll-button"
            type="button"
            disabled={disabled || !canRollbackLatestTurn}
            aria-label="重ROLL上一回合"
            title={canRollbackLatestTurn ? '重ROLL上一回合，并把原行动放回输入框。' : rollbackUnavailableReason}
            onClick={() => void onRollbackLatestTurn()}
          >
            ↺
          </button>
        ) : null}
        <textarea
          id="player-action"
          aria-label="玩家行动"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleActionKeyDown}
          onKeyUp={handleActionKeyUp}
          onBlur={() => {
            rightCtrlDownRef.current = false;
          }}
          disabled={disabled}
          rows={2}
          placeholder="输入你的行动……"
        />
        <button
          className="command-mobile-draft-trigger"
          type="button"
          disabled={disabled}
          aria-label="打开行动编辑器"
          title="点击打开大输入框编辑行动"
          onClick={openMobileEditor}
        >
          {value.trim() || <span>输入你的行动……</span>}
        </button>
        {isTurnRunning && onAbort ? (
          <button
            className="command-primary-action command-abort-button"
            type="button"
            aria-label="中止生成"
            disabled={isAborting}
            onClick={handleAbortClick}
          >
            {isAborting ? '正在中止…' : '中止生成'}
            <span aria-hidden="true">保留本次行动</span>
          </button>
        ) : (
          <button
            className="command-primary-action"
            type="submit"
            disabled={disabled}
            title="按住右 Ctrl 后按 Enter 发送"
          >
            执行行动
            <span aria-hidden="true">右Ctrl+Enter</span>
          </button>
        )}
      </form>
      {isMobileEditorOpen ? (
        <div
          className="command-mobile-editor-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMobileEditor();
          }}
        >
          <section
            className="command-mobile-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-mobile-editor-title"
          >
            <header>
              <div>
                <h2 id="command-mobile-editor-title">编辑玩家行动</h2>
                <p>确认后保存到行动栏；取消不会改动原内容。</p>
              </div>
            </header>
            <textarea
              autoFocus
              aria-label="编辑行动内容"
              value={editorValue}
              onChange={(event) => setEditorValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeMobileEditor();
                }
              }}
              placeholder="输入你的行动……"
            />
            <footer>
              <button type="button" onClick={closeMobileEditor}>
                取消
              </button>
              <button className="command-mobile-editor-confirm" type="button" onClick={confirmMobileEditor}>
                确定
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {isPersistentPromptManagerOpen && onPersistentPromptsChange ? (
        <PersistentPromptManager
          entries={persistentPrompts}
          onChange={onPersistentPromptsChange}
          onClose={() => setIsPersistentPromptManagerOpen(false)}
        />
      ) : null}
    </section>
  );
}
