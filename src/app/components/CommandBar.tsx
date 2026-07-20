import { type FormEvent, type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';

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
  draftActionText,
  draftActionVersion,
  canRollbackLatestTurn = false,
  rollbackUnavailableReason = '当前回合没有可用的回溯快照。',
  onRollbackLatestTurn
}: {
  disabled: boolean;
  isTurnRunning?: boolean;
  isAborting?: boolean;
  onAbort?: () => void;
  onSubmit: (input: string) => Promise<void> | void;
  suggestedActions?: string[];
  draftActionText?: string | null;
  draftActionVersion?: number;
  canRollbackLatestTurn?: boolean;
  rollbackUnavailableReason?: string;
  onRollbackLatestTurn?: () => void | Promise<void>;
}) {
  const [value, setValue] = useState('');
  const rightCtrlDownRef = useRef(false);

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

  return (
    <section className="command-stack" aria-label="行动输入">
      {suggestedActions.length > 0 ? (
        <div className="suggested-action-list" aria-label="建议行动">
          {suggestedActions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={disabled}
              title={action}
              onClick={() => setValue((current) => appendActionDraft(current, action))}
            >
              {action}
            </button>
          ))}
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
    </section>
  );
}
