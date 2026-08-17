import { getStoryBlocks, type StoryEmotion } from '../runtime/storyBlocks';
import type { ActorId } from '../runtime/types';
import {
  avgActorOutfitOverrideKey,
  avgActorOverrideKey,
  avgSceneOverrideKey,
  createAvgSceneOverrideAnchor,
  toAvgOverrideImageAssetRef,
  type AvgActorOutfitVisualOverrideKey,
  type AvgOutfitOverrideTarget,
  type AvgOutfitSelection
} from '../avgVisualOverride';
import {
  getAvgEnvironmentWorldpackAdapter,
  resolveAvgEnvironmentVisualState
} from '../avgEnvironment';
import { getDefaultAvgGenericPortraitBindingRepository } from './bindingRepository';
import { resolveAvgPortraitForActor } from './portraitResolver';
import { getBuiltInGenericPortraitProfileAdapter } from './profileAdapters';
import {
  createAvgEnvironmentPresentationContext,
  createAvgScenePresentationInput,
  resolveAvgScene
} from './sceneResolver';
import type {
  AvgPresentationFrame,
  AvgPresentationSequence,
  AvgPortraitStageMode,
  AvgPortraitResolutionDiagnostic,
  ResolvedAvgPortrait,
  ResolveAvgPresentationInput
} from './types';
import { areAvgWorldpackIdsCompatible } from './worldpackId';

function samePortraitIdentity(
  left: ResolvedAvgPortrait | null,
  right: ResolvedAvgPortrait | null
): boolean {
  if (!left || !right) return left === right;
  return left.actorId === right.actorId && left.portraitSetId === right.portraitSetId;
}

function variantChanged(
  left: ResolvedAvgPortrait | null,
  right: ResolvedAvgPortrait | null
): boolean {
  return Boolean(
    left &&
    right &&
    samePortraitIdentity(left, right) &&
    (
      left.outfitId !== right.outfitId ||
      left.resolvedVariantId !== right.resolvedVariantId ||
      left.asset.assetId !== right.asset.assetId
    )
  );
}

function firstFrameSceneChanged(
  previousSceneAssetId: string | undefined,
  currentSceneAssetId: string | undefined,
  hasPreviousPresentation: boolean
): boolean {
  return hasPreviousPresentation
    ? previousSceneAssetId !== currentSceneAssetId
    : currentSceneAssetId !== undefined;
}

function unresolvedDiagnostic(
  blockIndex: number,
  reasons: string[],
  actorId?: ActorId
): AvgPortraitResolutionDiagnostic {
  return {
    blockIndex,
    actorId,
    source: 'unresolved',
    reasons
  };
}

function structuredExposure(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  return candidate.exposure ?? candidate.sceneExposure;
}

export async function resolveAvgPresentation(
  input: ResolveAvgPresentationInput
): Promise<AvgPresentationSequence> {
  const warnings: string[] = [];
  const worldpackId = input.runtimeState.world.worldpackId;
  const activePackValid = Boolean(
    input.resourceResolver &&
    input.activePack &&
    areAvgWorldpackIdsCompatible(input.activePack.worldpackId, worldpackId)
  );
  if (input.resourceResolver && !input.activePack) {
    warnings.push('resource-resolver-without-active-pack');
  } else if (
    input.activePack &&
    !areAvgWorldpackIdsCompatible(input.activePack.worldpackId, worldpackId)
  ) {
    warnings.push('active-pack-worldpack-mismatch');
  } else if (!input.resourceResolver) {
    warnings.push('resource-pack-unavailable');
  }

  const resolver = activePackValid ? input.resourceResolver : undefined;
  const activePack = activePackValid ? input.activePack : undefined;
  const bindingRepository = input.bindingRepository ??
    getDefaultAvgGenericPortraitBindingRepository();
  const genericProfileAdapter = input.genericProfileAdapter ??
    getBuiltInGenericPortraitProfileAdapter(worldpackId);
  const blocks = getStoryBlocks(input.storyEntry, {
    actors: input.runtimeState.actors,
    actorIdAliases: input.runtimeState.actorIdAliases,
    playerActorId: input.runtimeState.player.actorId
  });
  const environment = createAvgEnvironmentPresentationContext(
    input.storyEntry,
    input.runtimeState
  );
  const baseSceneResult = resolveAvgScene({
    resolver,
    storyEntry: input.storyEntry,
    runtimeState: input.runtimeState,
    sceneInput: input.sceneInput
  });
  const normalizedSceneInput = createAvgScenePresentationInput(
    input.storyEntry,
    input.runtimeState,
    input.sceneInput
  );
  const runtimeScene = normalizedSceneInput.runtimeSceneId
    ? input.runtimeState.scenes[normalizedSceneInput.runtimeSceneId]
    : undefined;
  const runtimePlace = normalizedSceneInput.runtimePlaceId
    ? input.runtimeState.places[normalizedSceneInput.runtimePlaceId]
    : undefined;
  const sceneOverrideAnchor = createAvgSceneOverrideAnchor(normalizedSceneInput);
  let sceneResult = baseSceneResult;
  if (input.overrideRepository && sceneOverrideAnchor) {
    const sceneOverrideKey = {
      visualPartitionId: input.saveId,
      worldpackId,
      anchor: sceneOverrideAnchor
    } as const;
    try {
      const override = await input.overrideRepository.getSceneOverride(sceneOverrideKey);
      const diagnostic = {
        ...baseSceneResult.diagnostic,
        overrideAnchor: sceneOverrideAnchor,
        overrideFound: Boolean(override),
        overrideAssetId: override?.mapping.assetId,
        overrideValid: override?.status === 'ready',
        underlyingResolvedSceneAssetId: baseSceneResult.scene?.sceneAssetId,
        finalSource: override?.status === 'ready'
          ? 'save_override' as const
          : baseSceneResult.scene ? 'resource_pack' as const : 'none' as const
      };
      if (override?.status === 'ready' && override.asset) {
        sceneResult = {
          scene: {
            sceneAssetId: baseSceneResult.scene?.sceneAssetId ??
              `save_override:${sceneOverrideAnchor.type}:${sceneOverrideAnchor.id}`,
            asset: toAvgOverrideImageAssetRef(override.asset),
            tags: baseSceneResult.scene?.tags ?? normalizedSceneInput.tags,
            matchType: 'save_override'
          },
          diagnostic: {
            ...diagnostic,
            resolvedSceneAssetId: baseSceneResult.scene?.sceneAssetId ??
              `save_override:${sceneOverrideAnchor.type}:${sceneOverrideAnchor.id}`,
            matchType: 'save_override'
          }
        };
      } else {
        sceneResult = { ...baseSceneResult, diagnostic };
        if (override?.status === 'asset_missing') {
          warnings.push(`override-asset-missing:${avgSceneOverrideKey(sceneOverrideKey)}`);
        }
      }
    } catch (error) {
      warnings.push(
        `scene-override-read-failed:${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  const environmentResult = resolveAvgEnvironmentVisualState({
    storyEntry: input.storyEntry,
    sceneAssetId: sceneResult.scene?.sceneAssetId,
    registryTags: sceneResult.scene?.tags,
    runtimeSceneExposure: structuredExposure(runtimeScene),
    runtimePlaceExposure: structuredExposure(runtimePlace),
    worldpackAdapter: getAvgEnvironmentWorldpackAdapter(worldpackId)
  });
  const absentActorIds = new Set(normalizedSceneInput.absentActorIds ?? []);
  const hasExplicitPresentActorIds = input.storyEntry.visualContext?.presentActorIds !== undefined;
  const presentActorIds = new Set(input.storyEntry.visualContext?.presentActorIds ?? []);
  const playerPortraitMode = input.playerPortraitMode ?? 'hidden';

  const frames: AvgPresentationFrame[] = [];
  const portraitDiagnostics: AvgPortraitResolutionDiagnostic[] = [];
  const previousSequencePortrait = input.previousPresentation?.primaryPortrait ?? null;
  const previousSequencePortraitStageMode: AvgPortraitStageMode | undefined =
    previousSequencePortrait
      ? input.previousPresentation?.primaryPortraitStageMode ?? 'active'
      : undefined;
  const firstCurrentNpcDialogueBlockIndex = blocks.findIndex((block) =>
    block.type === 'dialogue' &&
    Boolean(block.speakerActorId) &&
    block.speakerActorId !== input.runtimeState.player.actorId
  );
  const currentNpcSpeakerActorIds = new Set(
    blocks.flatMap((block) =>
      block.type === 'dialogue' &&
      block.speakerActorId &&
      block.speakerActorId !== input.runtimeState.player.actorId
        ? [block.speakerActorId]
        : []
    )
  );
  let activePortrait: ResolvedAvgPortrait | null =
    previousSequencePortrait;
  let activePortraitStageMode: AvgPortraitStageMode | undefined = activePortrait
    ? previousSequencePortraitStageMode
    : undefined;
  if (
    activePortrait &&
    activePortrait.actorId !== input.runtimeState.player.actorId &&
    firstCurrentNpcDialogueBlockIndex > 0 &&
    currentNpcSpeakerActorIds.size > 0 &&
    !currentNpcSpeakerActorIds.has(activePortrait.actorId)
  ) {
    warnings.push(`carried-portrait-not-in-current-speakers:${activePortrait.actorId}`);
    activePortrait = null;
    activePortraitStageMode = undefined;
  }
  if (
    activePortrait &&
    (
      absentActorIds.has(activePortrait.actorId) ||
      !input.runtimeState.actors[activePortrait.actorId] ||
      (
        activePortrait.actorId !== input.runtimeState.player.actorId &&
        hasExplicitPresentActorIds &&
        !presentActorIds.has(activePortrait.actorId)
      ) ||
      (
        playerPortraitMode === 'hidden' &&
        activePortrait.actorId === input.runtimeState.player.actorId
      )
    )
  ) {
    activePortrait = null;
    activePortraitStageMode = undefined;
  }
  const currentSceneAssetId = sceneResult.scene?.sceneAssetId;
  const currentSceneImageAssetId = sceneResult.scene?.asset.assetId;
  const initialSceneChanged = firstFrameSceneChanged(
    input.previousPresentation?.sceneImageAssetId ?? input.previousPresentation?.sceneAssetId,
    currentSceneImageAssetId,
    input.previousPresentation !== undefined
  );

  const removeUnavailableCarry = () => {
    if (
      activePortrait &&
      (
        absentActorIds.has(activePortrait.actorId) ||
        !input.runtimeState.actors[activePortrait.actorId]
      )
    ) {
      activePortrait = null;
      activePortraitStageMode = undefined;
    }
  };

  const resolveActorPortrait = async (options: {
    actorId: ActorId;
    emotion: StoryEmotion;
    blockIndex: number;
    previousPortrait: ResolvedAvgPortrait | null;
    isPlayer?: boolean;
  }): Promise<ResolvedAvgPortrait | null> => {
    const actor = input.runtimeState.actors[options.actorId];
    if (!actor) {
      portraitDiagnostics.push(unresolvedDiagnostic(
        options.blockIndex,
        [options.isPlayer ? 'player-actor-missing' : 'speaker-actor-missing'],
        options.actorId
      ));
      return null;
    }
    const speakerNotPresent = !options.isPlayer &&
      presentActorIds.size > 0 &&
      !presentActorIds.has(options.actorId);
    const avoidPortraitSetIds = options.previousPortrait &&
      options.previousPortrait.actorId !== options.actorId
      ? new Set([options.previousPortrait.portraitSetId])
      : undefined;
    const overrideKey = {
      visualPartitionId: input.saveId,
      worldpackId,
      actorId: actor.actorId
    };
    const selectionBasePackId = activePack?.basePackId ?? '__no_active_avg_pack__';
    let outfitSelection: AvgOutfitSelection = { type: 'resource_default' };
    if (input.overrideRepository) {
      try {
        const lookup = await input.overrideRepository.getActorOutfitSelection(
          overrideKey,
          selectionBasePackId
        );
        outfitSelection = lookup.selection;
        if (lookup.status === 'user_outfit_missing') {
          warnings.push(`user-outfit-missing:${lookup.missingUserOutfitId ?? actor.actorId}`);
        }
      } catch (error) {
        warnings.push(
          `outfit-selection-read-failed:${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    const resourceOutfitId = outfitSelection.type === 'resource_outfit' &&
      outfitSelection.basePackId === activePack?.basePackId
      ? outfitSelection.outfitId
      : undefined;
    const result = resolver && activePack
      ? await resolveAvgPortraitForActor({
          saveId: input.saveId,
          actor,
          emotion: options.emotion,
          resolver,
          activePack,
          bindingRepository,
          genericProfileAdapter,
          avoidPortraitSetIds,
          resourceOutfitId
        })
      : {
          portrait: null,
          diagnostic: {
            actorId: actor.actorId,
            requestedEmotion: options.emotion,
            source: 'unresolved' as const,
            reasons: ['resource-pack-unavailable']
          }
        };
    const baseReasons = [
      ...result.diagnostic.reasons,
      `outfit-selection:${outfitSelection.type}`,
      ...(options.isPlayer ? ['player-sprite-enabled'] : []),
      ...(speakerNotPresent ? ['speaker-not-in-visual-context'] : [])
    ];
    if (input.overrideRepository) {
      try {
        const outfitTarget: AvgOutfitOverrideTarget | undefined =
          outfitSelection.type === 'user_outfit'
          ? outfitSelection
          : activePack && result.portrait
            ? {
                type: 'resource_outfit' as const,
                basePackId: activePack.basePackId,
                outfitId: outfitSelection.type === 'resource_outfit'
                  ? outfitSelection.outfitId
                  : result.portrait.outfitId
              }
            : undefined;
        const outfitOverrideKey: AvgActorOutfitVisualOverrideKey | undefined = outfitTarget
          ? { ...overrideKey, outfit: outfitTarget }
          : undefined;
        const outfitOverride = outfitOverrideKey
          ? await input.overrideRepository.getActorOutfitOverride(outfitOverrideKey)
          : undefined;
        if (outfitOverride?.status === 'ready' && outfitOverride.asset && outfitTarget) {
          const portrait: ResolvedAvgPortrait = {
            actorId: actor.actorId,
            source: 'save_override',
            portraitSetId: result.portrait?.portraitSetId ??
              `save_override:${actor.actorId}`,
            outfitId: outfitTarget.type === 'user_outfit'
              ? `user:${outfitTarget.outfitId}`
              : outfitTarget.outfitId,
            requestedEmotion: options.emotion,
            resolvedVariantId: 'actor_outfit_all_variants',
            asset: toAvgOverrideImageAssetRef(outfitOverride.asset),
            fallbackChain: ['outfit-specific-save-override']
          };
          portraitDiagnostics.push({
            blockIndex: options.blockIndex,
            ...result.diagnostic,
            source: 'save-override',
            portraitSetId: portrait.portraitSetId,
            outfitSelection,
            resolvedOutfitId: portrait.outfitId,
            resolvedVariant: portrait.resolvedVariantId,
            fallbackChain: portrait.fallbackChain,
            ...(speakerNotPresent ? { speakerNotPresent: true } : {}),
            outfitOverrideLookupKey: avgActorOutfitOverrideKey(outfitOverrideKey!),
            outfitOverrideFound: true,
            outfitOverrideAssetId: outfitOverride.mapping.assetId,
            outfitOverrideValid: true,
            underlyingSource: result.portrait?.source ?? 'none',
            finalSource: 'save_override',
            reasons: [...baseReasons, 'outfit-specific-save-override-applied']
          });
          return portrait;
        }
        if (outfitOverride?.status === 'asset_missing' && outfitOverrideKey) {
          warnings.push(`override-asset-missing:${avgActorOutfitOverrideKey(outfitOverrideKey)}`);
        }
        const override = await input.overrideRepository.getActorOverride(overrideKey);
        if (override?.status === 'ready' && override.asset) {
          const portrait: ResolvedAvgPortrait = {
            actorId: actor.actorId,
            source: 'save_override',
            portraitSetId: result.portrait?.portraitSetId ??
              `save_override:${actor.actorId}`,
            outfitId: 'actor_all_variants',
            requestedEmotion: options.emotion,
            resolvedVariantId: 'actor_all_variants',
            asset: toAvgOverrideImageAssetRef(override.asset),
            fallbackChain: ['save_override']
          };
          portraitDiagnostics.push({
            blockIndex: options.blockIndex,
            ...result.diagnostic,
            source: 'save-override',
            portraitSetId: portrait.portraitSetId,
            outfitSelection,
            resolvedOutfitId: portrait.outfitId,
            resolvedVariant: portrait.resolvedVariantId,
            fallbackChain: portrait.fallbackChain,
            ...(speakerNotPresent ? { speakerNotPresent: true } : {}),
            overrideLookupKey: avgActorOverrideKey(overrideKey),
            ...(outfitOverrideKey ? {
              outfitOverrideLookupKey: avgActorOutfitOverrideKey(outfitOverrideKey),
              outfitOverrideFound: Boolean(outfitOverride),
              outfitOverrideAssetId: outfitOverride?.mapping.assetId,
              outfitOverrideValid: outfitOverride ? false : undefined
            } : {}),
            overrideFound: true,
            overrideAssetId: override.mapping.assetId,
            overrideValid: true,
            underlyingSource: result.portrait?.source ?? 'none',
            finalSource: 'save_override',
            reasons: [...baseReasons, 'save-override-applied']
          });
          return portrait;
        }
        portraitDiagnostics.push({
          blockIndex: options.blockIndex,
          ...result.diagnostic,
          outfitSelection,
          ...(speakerNotPresent ? { speakerNotPresent: true } : {}),
          overrideLookupKey: avgActorOverrideKey(overrideKey),
          ...(outfitOverrideKey ? {
            outfitOverrideLookupKey: avgActorOutfitOverrideKey(outfitOverrideKey),
            outfitOverrideFound: Boolean(outfitOverride),
            outfitOverrideAssetId: outfitOverride?.mapping.assetId,
            outfitOverrideValid: outfitOverride ? false : undefined
          } : {}),
          overrideFound: Boolean(override),
          overrideAssetId: override?.mapping.assetId,
          overrideValid: override ? false : undefined,
          underlyingSource: result.portrait?.source ?? 'none',
          finalSource: result.portrait?.source ?? 'none',
          reasons: [
            ...baseReasons,
            ...(outfitOverride?.status === 'asset_missing'
              ? ['outfit-override-asset-missing']
              : []),
            ...(override?.status === 'asset_missing' ? ['override-asset-missing'] : [])
          ]
        });
        if (override?.status === 'asset_missing') {
          warnings.push(`override-asset-missing:${avgActorOverrideKey(overrideKey)}`);
        }
        return result.portrait;
      } catch (error) {
        warnings.push(
          `portrait-override-read-failed:${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    portraitDiagnostics.push({
      blockIndex: options.blockIndex,
      ...result.diagnostic,
      outfitSelection,
      ...(speakerNotPresent ? { speakerNotPresent: true } : {}),
      underlyingSource: result.portrait?.source ?? 'none',
      finalSource: result.portrait?.source ?? 'none',
      reasons: baseReasons
    });
    return result.portrait;
  };

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex]!;
    const previousPortrait = blockIndex === 0 ? previousSequencePortrait : activePortrait;
    const previousPortraitStageMode = blockIndex === 0
      ? previousSequencePortraitStageMode
      : activePortraitStageMode;
    let speakerActorId: ActorId | undefined;
    let speakerLabel: string | undefined;

    if (block.type === 'narration') {
      removeUnavailableCarry();
      if (!activePortrait && playerPortraitMode === 'show') {
        activePortrait = await resolveActorPortrait({
          actorId: input.runtimeState.player.actorId,
          emotion: 'neutral',
          blockIndex,
          previousPortrait,
          isPlayer: true
        });
      }
      activePortraitStageMode = activePortrait ? 'receded' : undefined;
    } else if (block.type === 'inner_monologue') {
      speakerActorId = block.actorId;
      if (
        playerPortraitMode === 'show' &&
        speakerActorId === input.runtimeState.player.actorId
      ) {
        activePortrait = await resolveActorPortrait({
          actorId: speakerActorId,
          emotion: block.emotion,
          blockIndex,
          previousPortrait,
          isPlayer: true
        });
        activePortraitStageMode = activePortrait ? 'active' : undefined;
      } else {
        removeUnavailableCarry();
        activePortraitStageMode = activePortrait ? 'receded' : undefined;
        if (speakerActorId === input.runtimeState.player.actorId) {
          portraitDiagnostics.push(unresolvedDiagnostic(
            blockIndex,
            ['player-sprite-suppressed'],
            speakerActorId
          ));
        }
      }
    } else {
      speakerActorId = block.speakerActorId;
      speakerLabel = block.speakerLabel;
      if (!speakerActorId) {
        activePortrait = null;
        activePortraitStageMode = undefined;
        portraitDiagnostics.push(
          unresolvedDiagnostic(blockIndex, ['speaker-actor-id-unresolved'])
        );
      } else if (speakerActorId === input.runtimeState.player.actorId) {
        if (playerPortraitMode === 'show') {
          activePortrait = await resolveActorPortrait({
            actorId: speakerActorId,
            emotion: block.emotion,
            blockIndex,
            previousPortrait,
            isPlayer: true
          });
          activePortraitStageMode = activePortrait ? 'active' : undefined;
        } else {
          removeUnavailableCarry();
          activePortraitStageMode = activePortrait ? 'receded' : undefined;
          portraitDiagnostics.push(
            unresolvedDiagnostic(blockIndex, ['player-sprite-suppressed'], speakerActorId)
          );
        }
      } else {
        activePortrait = await resolveActorPortrait({
          actorId: speakerActorId,
          emotion: block.emotion,
          blockIndex,
          previousPortrait
        });
        activePortraitStageMode = activePortrait ? 'active' : undefined;
      }
    }

    frames.push({
      blockIndex,
      blockType: block.type,
      speakerActorId,
      speakerLabel,
      portrait: activePortrait,
      ...(activePortraitStageMode ? { portraitStageMode: activePortraitStageMode } : {}),
      scene: sceneResult.scene,
      environment,
      changeFlags: {
        portraitChanged: !samePortraitIdentity(previousPortrait, activePortrait),
        portraitVariantChanged: variantChanged(previousPortrait, activePortrait),
        portraitStageChanged: previousPortraitStageMode !== activePortraitStageMode,
        sceneChanged: blockIndex === 0 && initialSceneChanged
      }
    });
  }

  const includeDiagnostics = input.includeDiagnostics ?? true;
  return {
    storyEntryTurnId: input.storyEntry.turnId,
    scene: sceneResult.scene,
    environment: environmentResult.state,
    frames,
    finalPresentation: {
      ...(currentSceneAssetId ? { sceneAssetId: currentSceneAssetId } : {}),
      ...(currentSceneImageAssetId ? { sceneImageAssetId: currentSceneImageAssetId } : {}),
      ...(activePortrait ? {
        primaryPortrait: activePortrait,
        primaryPortraitStageMode: activePortraitStageMode ?? 'active'
      } : {})
    },
    ...(includeDiagnostics
      ? {
          diagnostics: {
            portraits: portraitDiagnostics,
            scene: sceneResult.diagnostic,
            environment: environmentResult.diagnostic,
            warnings
          }
        }
      : {})
  };
}
