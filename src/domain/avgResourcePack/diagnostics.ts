import type {
  AvgResolvedPortraitAsset,
  AvgResolvedSceneAsset,
  StableIdentityRef
} from './types';
import { toStableIdentityKey } from './stableIdentity';

export interface AvgPortraitResolutionDiagnostic {
  actorId?: string;
  stableIdentityKey?: string;
  portraitSetId?: string;
  source?: AvgResolvedPortraitAsset['source'];
  sourcePackId?: string;
  requestedOutfitId?: string;
  requestedVariantId?: string;
  requestedEmotionId?: string;
  resolvedOutfitId?: string;
  resolvedVariantId?: string;
  resolvedEmotionId?: string;
  fallbackReason?: AvgResolvedPortraitAsset['fallbackReason'] | 'not_found';
}
export interface AvgSceneResolutionDiagnostic {
  runtimeSceneId?: string;
  runtimePlaceId?: string;
  requestedSceneAssetId?: string;
  requestedTags: string[];
  resolvedSceneAssetId?: string;
  source?: AvgResolvedSceneAsset['source'];
  sourcePackId?: string;
  matchReason?: AvgResolvedSceneAsset['matchReason'] | 'not_found';
}

export function createPortraitResolutionDiagnostic(input: {
  actorId?: string;
  identity?: StableIdentityRef;
  portraitSetId?: string;
  outfitId?: string;
  variantId?: string;
  emotionId?: string;
  result?: AvgResolvedPortraitAsset;
}): AvgPortraitResolutionDiagnostic {
  return {
    actorId: input.actorId,
    stableIdentityKey: input.identity ? toStableIdentityKey(input.identity) : undefined,
    portraitSetId: input.result?.portraitSetId ?? input.portraitSetId,
    source: input.result?.source,
    sourcePackId: input.result?.sourcePackId,
    requestedOutfitId: input.outfitId,
    requestedVariantId: input.variantId,
    requestedEmotionId: input.emotionId,
    resolvedOutfitId: input.result?.outfitId,
    resolvedVariantId: input.result?.variantId,
    resolvedEmotionId: input.result?.emotionId,
    fallbackReason: input.result?.fallbackReason ?? (input.result ? undefined : 'not_found')
  };
}

export function createSceneResolutionDiagnostic(input: {
  runtimeSceneId?: string;
  runtimePlaceId?: string;
  sceneAssetId?: string;
  tags?: readonly string[];
  result?: AvgResolvedSceneAsset;
}): AvgSceneResolutionDiagnostic {
  return {
    runtimeSceneId: input.runtimeSceneId,
    runtimePlaceId: input.runtimePlaceId,
    requestedSceneAssetId: input.sceneAssetId,
    requestedTags: [...(input.tags ?? [])],
    resolvedSceneAssetId: input.result?.entry.sceneAssetId,
    source: input.result?.source,
    sourcePackId: input.result?.sourcePackId,
    matchReason: input.result?.matchReason ?? 'not_found'
  };
}
