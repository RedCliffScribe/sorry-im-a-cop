import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { AvgPresentationFrame } from '../../../domain/avgPresentation';
import { getStoryBlocks, type StoryBlock } from '../../../domain/runtime/storyBlocks';
import type { RuntimeState, StoryEntry } from '../../../domain/runtime/types';
import type { AvgVisualOverrideRepository } from '../../../domain/avgVisualOverride';
import type { AvgImageGenerationService } from '../../../domain/avgImageGeneration';
import type { AvgPlaybackSessionState } from './useAvgPlaybackSession';
import type {
  ActiveAvgResourceSession,
  AvgPresentationResourceRuntime
} from './avgPresentationResourceRuntime';
import { getFrameAssetKey, useAvgAssetUrls } from './useAvgAssetUrls';
import {
  AvgEnvironmentLayer,
  avgEnvironmentCssVariables
} from './AvgEnvironmentLayer';
import { readAvgEnvironmentDevPreviewLabel } from './avgEnvironmentDevPreview';
import { AvgVisualOverrideDialog } from './AvgVisualOverrideDialog';
import { AvgPortraitViewer } from './AvgPortraitViewer';

interface AvgStoryViewportProps {
  session: AvgPlaybackSessionState;
  runtimeState: RuntimeState;
  resourceSession?: ActiveAvgResourceSession;
  resourceRuntime?: AvgPresentationResourceRuntime;
  visualPartitionId: string;
  overrideRepository?: AvgVisualOverrideRepository;
  overrideRevision?: number;
  imageGenerationService?: AvgImageGenerationService;
  onOpenImageSettings?: () => void;
  onOverrideChanged?: () => void;
  resourceUnavailable?: boolean;
  resourceError?: string;
  onNext: () => void;
  onPrevious: () => void;
  onReplay: () => void;
  onRetry: () => void;
  onUseTextMode: () => void;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, option, [contenteditable="true"], [data-avg-no-advance]'
    )
  );
}

function blockForFrame(
  entry: StoryEntry | undefined,
  frame: AvgPresentationFrame | undefined,
  runtimeState: RuntimeState
): StoryBlock | undefined {
  if (!entry || !frame) return undefined;
  return getStoryBlocks(entry, {
    actors: runtimeState.actors,
    actorIdAliases: runtimeState.actorIdAliases,
    playerActorId: runtimeState.player.actorId
  })[frame.blockIndex];
}

function speakerLabel(block: StoryBlock | undefined, frame: AvgPresentationFrame | undefined) {
  if (!block) return undefined;
  if (block.type === 'narration') return '旁白';
  if (block.type === 'inner_monologue') return '内心';
  return frame?.speakerLabel ?? block.speakerLabel;
}

function shouldAdvanceFromClick(event: MouseEvent<HTMLElement>): boolean {
  if (isInteractiveTarget(event.target)) return false;
  if (typeof window !== 'undefined' && window.getSelection()?.toString()) return false;
  return true;
}

export function AvgStoryViewport({
  session,
  runtimeState,
  resourceSession,
  resourceRuntime,
  visualPartitionId,
  overrideRepository,
  overrideRevision = 0,
  imageGenerationService,
  onOpenImageSettings,
  onOverrideChanged,
  resourceUnavailable = false,
  resourceError,
  onNext,
  onPrevious,
  onReplay,
  onRetry,
  onUseTextMode
}: AvgStoryViewportProps) {
  const [portraitViewer, setPortraitViewer] = useState<{
    src: string;
    alt: string;
    title: string;
  }>();
  const sequence = session.sequence;
  const frame = sequence?.frames[session.frameIndex];
  const block = useMemo(
    () => blockForFrame(session.activeStoryEntry, frame, runtimeState),
    [frame, runtimeState, session.activeStoryEntry]
  );
  const { urls, failedKeys, pendingKeys, markFailed } = useAvgAssetUrls(
    sequence,
    resourceSession,
    resourceRuntime,
    overrideRepository,
    overrideRevision
  );
  const sceneKey = getFrameAssetKey(
    frame?.scene?.sourcePackId,
    frame?.scene?.asset,
    resourceSession
  );
  const portraitKey = getFrameAssetKey(
    frame?.portrait?.sourcePackId,
    frame?.portrait?.asset,
    resourceSession
  );
  const sceneUrl = sceneKey && !failedKeys.has(sceneKey) ? urls.get(sceneKey) : undefined;
  const portraitUrl = portraitKey && !failedKeys.has(portraitKey)
    ? urls.get(portraitKey)
    : undefined;
  const frameCount = sequence?.frames.length ?? 0;
  const isFirst = session.frameIndex <= 0;
  const isLast = frameCount === 0 || session.frameIndex >= frameCount - 1;
  const label = speakerLabel(block, frame);
  const portraitAlt = frame?.portrait
    ? `${runtimeState.actors[frame.portrait.actorId]?.name ?? label ?? '剧情人物'}立绘`
    : '';
  const environment = sequence?.environment;
  const devPreviewLabel = readAvgEnvironmentDevPreviewLabel();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (portraitViewer) return;
      if (session.status !== 'ready' || isInteractiveTarget(event.target)) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, portraitViewer, session.status]);

  if (session.status === 'error') {
    return (
      <section className="avg-story-fallback" role="alert">
        <strong>AVG 演出暂时无法解析</strong>
        <p>{session.error ?? '当前正文仍然完整保留，可以继续使用原正文模式。'}</p>
        <div>
          <button type="button" onClick={onRetry}>重试演出</button>
          <button type="button" onClick={onUseTextMode}>切换原正文</button>
        </div>
      </section>
    );
  }

  if (session.status === 'idle' || !session.activeStoryEntry) {
    return (
      <section className="avg-story-fallback" role="status">
        <strong>等待第一段剧情</strong>
        <p>开局或下一回合正文完成后，AVG 演出会从第一句开始。</p>
      </section>
    );
  }

  if (session.status === 'resolving' || !frame || !block) {
    return (
      <section className="avg-story-fallback" role="status">
        <strong>正在整理当前演出</strong>
        <p>只读取当前剧情需要的场景与人物资源。</p>
      </section>
    );
  }

  return (
    <section
      className="avg-story-viewport"
      aria-label="AVG 剧情演出"
      data-scene-changed={frame.changeFlags.sceneChanged}
      data-portrait-changed={frame.changeFlags.portraitChanged}
      data-portrait-variant-changed={frame.changeFlags.portraitVariantChanged}
      data-portrait-stage-changed={frame.changeFlags.portraitStageChanged}
      data-portrait-stage={frame.portraitStageMode ?? 'none'}
      data-story-block-type={block.type}
      data-time-phase={environment?.timePhase ?? 'unknown'}
      data-weather-kind={environment?.weatherKind ?? 'unknown'}
      data-scene-exposure={environment?.sceneExposure ?? 'unknown'}
      data-environment-key={environment?.key ?? 'neutral'}
    >
      <div
        className="avg-story-stage"
        style={environment ? avgEnvironmentCssVariables(environment) : undefined}
        onClick={(event) => {
          if (shouldAdvanceFromClick(event)) onNext();
        }}
      >
        {overrideRepository && onOverrideChanged ? (
          <AvgVisualOverrideDialog
            runtimeState={runtimeState}
            visualPartitionId={visualPartitionId}
            actorId={frame.portrait?.actorId}
            repository={overrideRepository}
            revision={overrideRevision}
            imageGenerationService={imageGenerationService}
            resourceSession={resourceSession}
            resourceRuntime={resourceRuntime}
            onOpenImageSettings={onOpenImageSettings}
            sceneExposure={environment?.sceneExposure}
            sceneTags={frame.scene?.tags}
            onChanged={onOverrideChanged}
          />
        ) : null}
        <div
          className="avg-scene-layer"
          aria-hidden="true"
          data-scene-asset-id={frame.scene?.sceneAssetId}
        >
          {sceneUrl ? (
            <img
              data-testid="avg-scene-image"
              src={sceneUrl}
              alt=""
              onError={() => markFailed(sceneKey)}
            />
          ) : null}
          <div className="avg-scene-neutral" data-visible={!sceneUrl} />
        </div>

        {environment ? <AvgEnvironmentLayer state={environment} /> : null}

        <div
          className="avg-portrait-layer"
          data-portrait-source={frame.portrait?.source}
          data-portrait-set-id={frame.portrait?.portraitSetId}
          data-portrait-actor-id={frame.portrait?.actorId}
          data-portrait-stage={frame.portraitStageMode ?? 'none'}
        >
          {portraitUrl ? (
            <button
              type="button"
              className="avg-portrait-hitbox"
              data-avg-no-advance
              aria-label={`查看${portraitAlt}大图`}
              aria-haspopup="dialog"
              title="点击查看立绘大图"
              onClick={(event) => {
                event.stopPropagation();
                setPortraitViewer({
                  src: portraitUrl,
                  alt: portraitAlt,
                  title: runtimeState.actors[frame.portrait!.actorId]?.name ?? label ?? '剧情人物'
                });
              }}
            >
              <img
                data-testid="avg-portrait-image"
                src={portraitUrl}
                alt={portraitAlt}
                onError={() => markFailed(portraitKey)}
              />
            </button>
          ) : null}
        </div>

        <div className="avg-bottom-scrim" aria-hidden="true" />

        {devPreviewLabel ? (
          <span className="avg-environment-qa-badge" data-avg-no-advance>
            视觉验收 · {devPreviewLabel}
          </span>
        ) : null}

        <article className={`avg-dialogue-layer avg-dialogue-layer--${block.type}`}>
          <header className="avg-dialogue-meta" data-avg-no-advance>
            <div>
              {label ? <strong className="avg-speaker-name">{label}</strong> : null}
              <span className="avg-frame-counter">
                {session.frameIndex + 1} / {frameCount}
              </span>
            </div>
            <div className="avg-playback-controls" aria-label="剧情播放控制">
              <button type="button" onClick={onReplay} title="重播本回合" aria-label="重播本回合">
                ↺
              </button>
              <button type="button" onClick={onPrevious} disabled={isFirst} aria-label="上一句">
                ←
              </button>
              <button type="button" onClick={onNext} disabled={isLast} aria-label="下一句">
                下一句&nbsp;▶
              </button>
            </div>
          </header>
          <div className="avg-dialogue-text" data-avg-no-advance={undefined}>
            {block.text}
          </div>
        </article>

        {resourceUnavailable ? (
          <div className="avg-resource-notice" data-avg-no-advance role="status">
            AVG 资源未启用，当前以中性背景演出
          </div>
        ) : null}
        {resourceError ? (
          <div className="avg-resource-notice avg-resource-notice--error" data-avg-no-advance role="status">
            资源读取异常，已安全降级
          </div>
        ) : null}
        {(sceneKey && pendingKeys.has(sceneKey)) || (portraitKey && pendingKeys.has(portraitKey)) ? (
          <span className="avg-asset-loading" data-avg-no-advance role="status">读取当前画面…</span>
        ) : null}
      </div>
      {portraitViewer ? (
        <AvgPortraitViewer
          src={portraitViewer.src}
          alt={portraitViewer.alt}
          title={portraitViewer.title}
          onClose={() => setPortraitViewer(undefined)}
        />
      ) : null}
    </section>
  );
}
