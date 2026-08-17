import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CantoneseFlavorLevel } from '../../domain/runtime/types';
import {
  cantoneseFlavorProfiles,
  getCantoneseFlavorProfile
} from '../../domain/settings/cantoneseFlavor';

interface CantoneseFlavorDialogProps {
  currentFlavor: CantoneseFlavorLevel;
  onSelect: (flavor: CantoneseFlavorLevel) => void;
  onClose: () => void;
}

export function CantoneseFlavorDialog({
  currentFlavor,
  onSelect,
  onClose
}: CantoneseFlavorDialogProps) {
  const currentProfile = getCantoneseFlavorProfile(currentFlavor);

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
        className="cantonese-flavor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cantonese-flavor-dialog-title"
      >
        <header className="cantonese-flavor-dialog-header">
          <div>
            <h2 id="cantonese-flavor-dialog-title">更改当前游戏粤语风味</h2>
            <p>
              当前游戏：<strong>{currentProfile.label}</strong>
            </p>
          </div>
          <button
            type="button"
            className="cantonese-flavor-dialog-close"
            aria-label="关闭粤语风味更改"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <p className="muted cantonese-flavor-dialog-scope">
          选择后立即保存到当前游戏，只影响这个存档之后生成的剧情，不会改写已经生成的正文。
        </p>

        <div className="cantonese-flavor-dialog-grid" role="radiogroup" aria-label="当前游戏粤语风味">
          {cantoneseFlavorProfiles.map((profile) => {
            const active = profile.id === currentFlavor;
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
