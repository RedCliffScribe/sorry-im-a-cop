import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ActorId, RuntimeState } from '../../../domain/runtime/types';
import type { AvgSceneExposure } from '../../../domain/avgEnvironment';
import {
  buildAvgPortraitGenerationContext,
  buildAvgSceneGenerationContext,
  type AvgImageGenerationService
} from '../../../domain/avgImageGeneration';
import {
  createAvgSceneOverrideAnchor,
  type AvgSceneVisualOverrideKey,
  type AvgVisualOverrideRepository
} from '../../../domain/avgVisualOverride';
import {
  AvgPortraitOverrideControl,
  AvgSceneOverrideControl
} from './AvgVisualOverrideControls';
import type {
  ActiveAvgResourceSession,
  AvgPresentationResourceRuntime
} from './avgPresentationResourceRuntime';

export function AvgVisualOverrideDialog({
  runtimeState,
  visualPartitionId,
  actorId,
  repository,
  revision,
  imageGenerationService,
  resourceSession,
  resourceRuntime,
  onOpenImageSettings,
  sceneExposure,
  sceneTags,
  onChanged
}: {
  runtimeState: RuntimeState;
  visualPartitionId: string;
  actorId?: ActorId;
  repository: AvgVisualOverrideRepository;
  revision: number;
  imageGenerationService?: AvgImageGenerationService;
  resourceSession?: ActiveAvgResourceSession;
  resourceRuntime?: AvgPresentationResourceRuntime;
  onOpenImageSettings?: () => void;
  sceneExposure?: AvgSceneExposure;
  sceneTags?: readonly string[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const actor = actorId ? runtimeState.actors[actorId] : undefined;
  const runtimeSceneId = runtimeState.location.currentSceneId;
  const runtimePlaceId = runtimeState.location.currentPlaceId;
  const sceneKey = useMemo<AvgSceneVisualOverrideKey | undefined>(() => {
    const anchor = createAvgSceneOverrideAnchor({ runtimeSceneId, runtimePlaceId });
    return anchor ? {
      visualPartitionId,
      worldpackId: runtimeState.world.worldpackId,
      anchor
    } : undefined;
  }, [runtimePlaceId, runtimeSceneId, runtimeState.world.worldpackId, visualPartitionId]);
  const locationLabel = runtimeState.location.currentSceneId
    ? runtimeState.scenes[runtimeState.location.currentSceneId]?.name
    : runtimeState.location.currentPlaceId
      ? runtimeState.places[runtimeState.location.currentPlaceId]?.name
      : undefined;
  const portraitGenerationContext = actor
    ? buildAvgPortraitGenerationContext(runtimeState, actor)
    : undefined;
  const sceneGenerationContext = buildAvgSceneGenerationContext(runtimeState, {
    exposure: sceneExposure,
    stableSceneTags: sceneTags
  });

  return (
    <>
      <button
        type="button"
        className="avg-visual-menu-button"
        data-avg-no-advance
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        视觉
      </button>
      {open ? createPortal((
        <div className="avg-override-dialog-backdrop" data-avg-no-advance>
          <section
            className="avg-override-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="替换当前 AVG 视觉"
          >
            <header className="avg-override-dialog-header">
              <div>
                <strong>当前 AVG 视觉</strong>
                <p>玩家替换只作用于本次游玩进程，不修改官方资源包。</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭视觉替换">
                ×
              </button>
            </header>
            <div className="avg-override-dialog-body">
              {actor ? (
                <AvgPortraitOverrideControl
                  actor={actor}
                  visualPartitionId={visualPartitionId}
                  worldpackId={runtimeState.world.worldpackId}
                  repository={repository}
                  revision={revision}
                  imageGeneration={imageGenerationService && portraitGenerationContext ? {
                    kind: 'portrait',
                    service: imageGenerationService,
                    saveId: visualPartitionId,
                    context: portraitGenerationContext,
                    onOpenSettings: onOpenImageSettings
                  } : undefined}
                  resourceSession={resourceSession}
                  resourceRuntime={resourceRuntime}
                  onChanged={onChanged}
                />
              ) : (
                <p className="avg-override-warning">当前画面没有可安全绑定 ActorId 的人物。</p>
              )}
              <AvgSceneOverrideControl
                keyValue={sceneKey}
                locationLabel={locationLabel ?? '当前地点'}
                repository={repository}
                revision={revision}
                imageGeneration={imageGenerationService && sceneGenerationContext ? {
                  kind: 'scene',
                  service: imageGenerationService,
                  saveId: visualPartitionId,
                  context: sceneGenerationContext,
                  onOpenSettings: onOpenImageSettings
                } : undefined}
                onChanged={onChanged}
              />
            </div>
          </section>
        </div>
      ), document.body) : null}
    </>
  );
}
