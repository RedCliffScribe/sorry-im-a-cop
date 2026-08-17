import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';
import type { RuntimeState, StoryEntry } from '../../../domain/runtime/types';
import type { AvgVisualOverrideRepository } from '../../../domain/avgVisualOverride';
import type { AvgImageGenerationService } from '../../../domain/avgImageGeneration';
import type {
  DisplaySettings,
  StoryPresentationMode
} from '../../../domain/settings/types';
import { getDisplayFontStack } from '../../displayFonts';
import { AvgPresentationErrorBoundary } from './AvgPresentationErrorBoundary';
import { AvgStoryViewport } from './AvgStoryViewport';
import type { AvgPresentationResourceRuntime } from './avgPresentationResourceRuntime';
import { useAvgPlaybackSession } from './useAvgPlaybackSession';
import './avgStoryViewport.css';

export interface StoryPresentationPaneHandle {
  completeCurrentSequence(): void;
}

interface StoryPresentationPaneProps {
  entries: readonly StoryEntry[];
  runtimeState: RuntimeState;
  saveId: string;
  playbackRevision?: number;
  displaySettings?: DisplaySettings;
  onDisplaySettingsChange?: (settings: DisplaySettings) => void | Promise<void>;
  resourceRuntime?: AvgPresentationResourceRuntime;
  resourceRevision?: number;
  overrideRepository?: AvgVisualOverrideRepository;
  overrideRevision?: number;
  imageGenerationService?: AvgImageGenerationService;
  onOpenImageSettings?: () => void;
  onOverrideChanged?: () => void;
  textView: ReactNode;
}

function clampFontSize(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 16;
  return Math.max(12, Math.min(28, Math.trunc(value)));
}

function avgDisplayStyle(displaySettings: DisplaySettings | undefined): CSSProperties {
  return {
    '--avg-narration-font-family': getDisplayFontStack(
      displaySettings?.narrationFontFamily ?? 'system',
      'system'
    ),
    '--avg-dialogue-font-family': getDisplayFontStack(
      displaySettings?.dialogueFontFamily ?? 'system',
      'system'
    ),
    '--avg-narration-font-size': `${clampFontSize(displaySettings?.narrationFontSize)}px`,
    '--avg-dialogue-font-size': `${clampFontSize(displaySettings?.dialogueFontSize)}px`
  } as CSSProperties;
}

export const StoryPresentationPane = forwardRef<
  StoryPresentationPaneHandle,
  StoryPresentationPaneProps
>(function StoryPresentationPane(
  {
    entries,
    runtimeState,
    saveId,
    playbackRevision,
    displaySettings,
    onDisplaySettingsChange,
    resourceRuntime,
    resourceRevision,
    overrideRepository,
    overrideRevision,
    imageGenerationService,
    onOpenImageSettings,
    onOverrideChanged,
    textView
  },
  ref
) {
  const configuredMode = displaySettings?.storyPresentationMode ?? 'auto';
  const [preferredMode, setPreferredMode] = useState<StoryPresentationMode>(configuredMode);
  useEffect(() => setPreferredMode(configuredMode), [configuredMode]);

  const playback = useAvgPlaybackSession({
    entries,
    runtimeState,
    saveId,
    playbackRevision,
    enabled: preferredMode !== 'text',
    resourceRuntime,
    resourceRevision,
    overrideRepository,
    overrideRevision,
    playerPortraitMode: displaySettings?.avgPlayerPortraitMode ?? 'hidden'
  });
  const effectiveMode: 'avg' | 'text' = preferredMode === 'auto'
    ? playback.resourceStatus === 'ready' ? 'avg' : 'text'
    : preferredMode;

  useImperativeHandle(ref, () => ({
    completeCurrentSequence: playback.complete
  }), [playback.complete]);

  const chooseMode = (mode: Exclude<StoryPresentationMode, 'auto'>) => {
    setPreferredMode(mode);
    if (displaySettings && onDisplaySettingsChange) {
      void onDisplaySettingsChange({
        ...displaySettings,
        storyPresentationMode: mode
      });
    }
  };

  return (
    <section
      className={`story-presentation-pane story-presentation-pane--${effectiveMode}`}
      aria-label="剧情呈现"
      style={avgDisplayStyle(displaySettings)}
    >
      <header className="story-presentation-toolbar">
        <div className="story-presentation-mode-toggle" role="group" aria-label="剧情显示模式">
          <button
            type="button"
            className={effectiveMode === 'avg' ? 'active' : ''}
            aria-pressed={effectiveMode === 'avg'}
            onClick={() => chooseMode('avg')}
          >
            AVG演出
          </button>
          <button
            type="button"
            className={effectiveMode === 'text' ? 'active' : ''}
            aria-pressed={effectiveMode === 'text'}
            onClick={() => chooseMode('text')}
          >
            原正文
          </button>
        </div>
        <div className="story-presentation-resource-status" aria-live="polite">
          {playback.resourceSession
            ? `${playback.resourceSession.displayName} · ${playback.resourceSession.activePack.basePackVersion}`
            : playback.resourceStatus === 'loading'
              ? '读取 AVG 资源…'
              : '未启用 AVG 资源'}
        </div>
      </header>

      <div className="story-presentation-content">
        <div
          className="story-presentation-view story-presentation-view--text"
          hidden={effectiveMode !== 'text'}
        >
          {textView}
        </div>
        <div
          className="story-presentation-view story-presentation-view--avg"
          hidden={effectiveMode !== 'avg'}
        >
          {effectiveMode === 'avg' ? (
            <AvgPresentationErrorBoundary
              key={[
                saveId,
                resourceRevision ?? 0,
                overrideRevision ?? 0,
                playback.resourceSession?.selectionToken ?? playback.resourceStatus
              ].join('\u001f')}
              onUseTextMode={() => chooseMode('text')}
              resetToken={playback.session.activeStoryEntry?.turnId}
            >
              <AvgStoryViewport
                session={playback.session}
                runtimeState={runtimeState}
                resourceSession={playback.resourceSession}
                resourceRuntime={resourceRuntime}
                visualPartitionId={saveId}
                overrideRepository={overrideRepository}
                overrideRevision={overrideRevision}
                imageGenerationService={imageGenerationService}
                onOpenImageSettings={onOpenImageSettings}
                onOverrideChanged={onOverrideChanged}
                resourceUnavailable={playback.resourceStatus === 'unavailable'}
                resourceError={playback.resourceError}
                onNext={playback.next}
                onPrevious={playback.previous}
                onReplay={playback.replay}
                onRetry={playback.retry}
                onUseTextMode={() => chooseMode('text')}
              />
            </AvgPresentationErrorBoundary>
          ) : null}
        </div>
      </div>
    </section>
  );
});
