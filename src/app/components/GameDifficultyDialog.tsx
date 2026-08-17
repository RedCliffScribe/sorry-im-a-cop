import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GameDifficultyLevel } from '../../domain/runtime/types';
import {
  gameDifficultyProfiles,
  getGameDifficultyProfile
} from '../../domain/settings/gameDifficulty';

interface GameDifficultyDialogProps {
  currentDifficulty: GameDifficultyLevel;
  onSelect: (difficulty: GameDifficultyLevel) => void;
  onClose: () => void;
}

export function GameDifficultyDialog({
  currentDifficulty,
  onSelect,
  onClose
}: GameDifficultyDialogProps) {
  const currentProfile = getGameDifficultyProfile(currentDifficulty);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="cantonese-flavor-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="cantonese-flavor-dialog game-difficulty-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-difficulty-dialog-title"
      >
        <header className="cantonese-flavor-dialog-header">
          <div>
            <h2 id="game-difficulty-dialog-title">更改当前游戏难度</h2>
            <p>
              当前游戏：<strong>{currentProfile.label}</strong>
            </p>
          </div>
          <button
            type="button"
            className="cantonese-flavor-dialog-close"
            aria-label="关闭游戏难度更改"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <p className="muted cantonese-flavor-dialog-scope">
          选择后立即保存到当前游戏，只影响之后新发生的本地判定，不会重算已有结果。
        </p>

        <div
          className="cantonese-flavor-dialog-grid"
          role="radiogroup"
          aria-label="当前游戏难度"
        >
          {gameDifficultyProfiles.map((profile) => {
            const active = profile.id === currentDifficulty;
            return (
              <button
                key={profile.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`cantonese-flavor-dialog-card${active ? ' active' : ''}`}
                onClick={() => onSelect(profile.id)}
              >
                <span className="cantonese-flavor-dialog-card-title">
                  {profile.label}
                  <small>
                    {profile.modifier >= 0 ? '+' : ''}
                    {profile.modifier}
                  </small>
                  {active ? <small>当前</small> : null}
                </span>
                <span>{profile.summary}</span>
              </button>
            );
          })}
        </div>

        <footer className="cantonese-flavor-dialog-footer">
          <button type="button" onClick={onClose}>
            取消
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
