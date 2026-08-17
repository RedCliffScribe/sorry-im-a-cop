import { toStableIdentityKey } from './stableIdentity';
import type {
  AvgLoadedResourcePack,
  AvgResolvedPortraitAsset,
  AvgResolvedSceneAsset,
  AvgSceneAssetEntry,
  AvgVisualOverrideRepository,
  FixedCharacterPortraitEntry,
  GenericPortraitSetEntry,
  StableIdentityRef
} from './types';

interface SourcedEntry<T> {
  entry: T;
  source: 'extension' | 'base';
  sourcePackId: string;
  layerRank: number;
}

export interface AvgResourceResolverOptions {
  basePack: AvgLoadedResourcePack;
  extensionPacks?: readonly AvgLoadedResourcePack[];
  userOverrides?: AvgVisualOverrideRepository;
}

export interface AvgPortraitRequest {
  outfitId?: string;
  variantId?: string;
  emotionId?: string;
}

export interface AvgSceneRequest {
  sceneAssetId?: string;
  runtimeSceneId?: string;
  runtimePlaceId?: string;
  tags?: readonly string[];
}

export interface AvgResourceResolver {
  resolveFixedCharacter(identity: StableIdentityRef): FixedCharacterPortraitEntry | undefined;
  resolveFixedCharacterAsset(
    identity: StableIdentityRef,
    request?: AvgPortraitRequest
  ): AvgResolvedPortraitAsset | undefined;
  getGenericPortraitSet(portraitSetId: string): GenericPortraitSetEntry | undefined;
  getGenericPortraitSets(): GenericPortraitSetEntry[];
  resolveGenericPortraitAsset(
    portraitSetId: string,
    request?: AvgPortraitRequest
  ): AvgResolvedPortraitAsset | undefined;
  resolveSceneById(sceneId: string): AvgSceneAssetEntry | undefined;
  findScenesByTags(tags: readonly string[]): AvgSceneAssetEntry[];
  resolveScene(request: AvgSceneRequest): AvgResolvedSceneAsset | undefined;
}

function normalizeTag(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function assertExtensionCompatibility(
  basePack: AvgLoadedResourcePack,
  extensionPack: AvgLoadedResourcePack
): void {
  const baseManifest = basePack.manifest;
  const extensionManifest = extensionPack.manifest;
  if (extensionManifest.packType !== 'extension') {
    throw new Error(`资源包 ${extensionManifest.packId} 不是 Extension Pack。`);
  }
  if (extensionManifest.worldpackId !== baseManifest.worldpackId) {
    throw new Error(`Extension Pack ${extensionManifest.packId} 与 Base Pack 世界不一致。`);
  }
  if (
    extensionManifest.targetBasePackId &&
    extensionManifest.targetBasePackId !== baseManifest.packId
  ) {
    throw new Error(
      `Extension Pack ${extensionManifest.packId} 只适用于 ${extensionManifest.targetBasePackId}。`
    );
  }
}

function assertDeclaredOverride(
  declared: readonly string[] | undefined,
  key: string,
  packId: string,
  kind: string
): void {
  if (!declared?.includes(key)) {
    throw new Error(
      `Extension Pack ${packId} 覆盖 ${kind} ${key}，但 Manifest 未显式声明。`
    );
  }
}

function resolvePortraitAsset(
  sourced: SourcedEntry<FixedCharacterPortraitEntry | GenericPortraitSetEntry> | {
    entry: FixedCharacterPortraitEntry | GenericPortraitSetEntry;
    source: 'user_override';
  },
  request: AvgPortraitRequest = {}
): AvgResolvedPortraitAsset | undefined {
  const entry = sourced.entry;
  const requestedOutfitId = request.outfitId;
  const outfit =
    (requestedOutfitId ? entry.outfits[requestedOutfitId] : undefined) ??
    entry.outfits[entry.defaultOutfitId];
  if (!outfit) return undefined;

  let variant = request.variantId ? outfit.variants[request.variantId] : undefined;
  if (!variant && request.emotionId) {
    variant = Object.values(outfit.variants).find(
      (candidate) => candidate.emotionId === request.emotionId
    );
  }
  variant ??= outfit.variants[outfit.defaultVariantId];
  if (!variant) return undefined;

  let fallbackReason: AvgResolvedPortraitAsset['fallbackReason'];
  if (requestedOutfitId && requestedOutfitId !== outfit.outfitId) {
    fallbackReason = 'requested_outfit_missing';
  } else if (request.variantId && request.variantId !== variant.variantId) {
    fallbackReason = 'requested_variant_missing';
  } else if (request.emotionId && request.emotionId !== variant.emotionId) {
    fallbackReason = 'requested_emotion_missing';
  }

  return {
    source: sourced.source,
    sourcePackId: 'sourcePackId' in sourced ? sourced.sourcePackId : undefined,
    portraitSetId: entry.portraitSetId,
    outfitId: outfit.outfitId,
    variantId: variant.variantId,
    emotionId: variant.emotionId,
    image: variant.image,
    fallbackReason
  };
}

function compareScenes(
  left: SourcedEntry<AvgSceneAssetEntry>,
  right: SourcedEntry<AvgSceneAssetEntry>
): number {
  return (
    (right.entry.priority ?? 0) - (left.entry.priority ?? 0) ||
    right.layerRank - left.layerRank ||
    left.entry.sceneAssetId.localeCompare(right.entry.sceneAssetId)
  );
}

export class DefaultAvgResourceResolver implements AvgResourceResolver {
  private readonly fixedCharacters = new Map<string, SourcedEntry<FixedCharacterPortraitEntry>>();
  private readonly genericPortraits = new Map<string, SourcedEntry<GenericPortraitSetEntry>>();
  private readonly scenes = new Map<string, SourcedEntry<AvgSceneAssetEntry>>();
  private readonly basePack: AvgLoadedResourcePack;
  private readonly extensions: AvgLoadedResourcePack[];
  private readonly userOverrides?: AvgVisualOverrideRepository;

  constructor(options: AvgResourceResolverOptions) {
    if (options.basePack.manifest.packType !== 'base') {
      throw new Error(`资源包 ${options.basePack.manifest.packId} 不是 Base Pack。`);
    }
    this.basePack = options.basePack;
    this.userOverrides = options.userOverrides;
    this.extensions = [...(options.extensionPacks ?? [])].sort(
      (left, right) =>
        (left.manifest.loadOrder ?? 0) - (right.manifest.loadOrder ?? 0) ||
        left.manifest.packId.localeCompare(right.manifest.packId)
    );

    this.addPack(options.basePack, 0);
    this.extensions.forEach((extension, index) => {
      assertExtensionCompatibility(options.basePack, extension);
      this.addPack(extension, index + 1);
    });
  }

  private addPack(pack: AvgLoadedResourcePack, layerRank: number): void {
    const source = pack.manifest.packType === 'base' ? 'base' : 'extension';
    const sourced = <T>(entry: T): SourcedEntry<T> => ({
      entry,
      source,
      sourcePackId: pack.manifest.packId,
      layerRank
    });

    for (const entry of pack.fixedCharacters.entries) {
      const key = toStableIdentityKey(entry.stableIdentity);
      if (this.fixedCharacters.has(key) && source === 'extension') {
        assertDeclaredOverride(
          pack.manifest.overrides?.fixedCharacters,
          key,
          pack.manifest.packId,
          '固定人物'
        );
      }
      this.fixedCharacters.set(key, sourced(entry));
    }
    for (const entry of pack.genericPortraits.entries) {
      if (this.genericPortraits.has(entry.portraitSetId) && source === 'extension') {
        assertDeclaredOverride(
          pack.manifest.overrides?.genericPortraits,
          entry.portraitSetId,
          pack.manifest.packId,
          '通用人物'
        );
      }
      this.genericPortraits.set(entry.portraitSetId, sourced(entry));
    }
    for (const entry of pack.scenes.entries) {
      if (this.scenes.has(entry.sceneAssetId) && source === 'extension') {
        assertDeclaredOverride(
          pack.manifest.overrides?.scenes,
          entry.sceneAssetId,
          pack.manifest.packId,
          '场景'
        );
      }
      this.scenes.set(entry.sceneAssetId, sourced(entry));
    }
  }

  resolveFixedCharacter(identity: StableIdentityRef): FixedCharacterPortraitEntry | undefined {
    const identityKey = toStableIdentityKey(identity);
    return (
      this.userOverrides?.getFixedCharacter(identityKey) ??
      this.fixedCharacters.get(identityKey)?.entry
    );
  }

  resolveFixedCharacterAsset(
    identity: StableIdentityRef,
    request: AvgPortraitRequest = {}
  ): AvgResolvedPortraitAsset | undefined {
    const identityKey = toStableIdentityKey(identity);
    const override = this.userOverrides?.getFixedCharacter(identityKey);
    if (override) return resolvePortraitAsset({ entry: override, source: 'user_override' }, request);
    const sourced = this.fixedCharacters.get(identityKey);
    return sourced ? resolvePortraitAsset(sourced, request) : undefined;
  }

  getGenericPortraitSet(portraitSetId: string): GenericPortraitSetEntry | undefined {
    return (
      this.userOverrides?.getGenericPortraitSet(portraitSetId) ??
      this.genericPortraits.get(portraitSetId)?.entry
    );
  }

  getGenericPortraitSets(): GenericPortraitSetEntry[] {
    return [...this.genericPortraits.values()]
      .map(({ entry }) => this.userOverrides?.getGenericPortraitSet(entry.portraitSetId) ?? entry)
      .sort((left, right) => left.portraitSetId.localeCompare(right.portraitSetId));
  }

  resolveGenericPortraitAsset(
    portraitSetId: string,
    request: AvgPortraitRequest = {}
  ): AvgResolvedPortraitAsset | undefined {
    const override = this.userOverrides?.getGenericPortraitSet(portraitSetId);
    if (override) return resolvePortraitAsset({ entry: override, source: 'user_override' }, request);
    const sourced = this.genericPortraits.get(portraitSetId);
    return sourced ? resolvePortraitAsset(sourced, request) : undefined;
  }

  resolveSceneById(sceneId: string): AvgSceneAssetEntry | undefined {
    return this.userOverrides?.getScene(sceneId) ?? this.scenes.get(sceneId)?.entry;
  }

  findScenesByTags(tags: readonly string[]): AvgSceneAssetEntry[] {
    const requested = new Set(tags.map(normalizeTag).filter(Boolean));
    if (requested.size === 0) return [];
    return [...this.scenes.values()]
      .filter(({ entry }) => entry.tags.some((tag) => requested.has(normalizeTag(tag))))
      .sort(compareScenes)
      .map(({ entry }) => this.userOverrides?.getScene(entry.sceneAssetId) ?? entry);
  }

  resolveScene(request: AvgSceneRequest): AvgResolvedSceneAsset | undefined {
    if (request.sceneAssetId) {
      const override = this.userOverrides?.getScene(request.sceneAssetId);
      if (override) {
        return { source: 'user_override', entry: override, matchReason: 'scene_asset_id' };
      }
      const exact = this.scenes.get(request.sceneAssetId);
      if (exact) return this.sceneResult(exact, 'scene_asset_id');
    }

    const candidates = [...this.scenes.values()];
    const byRuntimeScene = request.runtimeSceneId
      ? candidates.filter(({ entry }) => entry.runtimeSceneIds?.includes(request.runtimeSceneId!))
      : [];
    if (byRuntimeScene.length) {
      return this.sceneResult(byRuntimeScene.sort(compareScenes)[0]!, 'runtime_scene_id');
    }
    const byRuntimePlace = request.runtimePlaceId
      ? candidates.filter(({ entry }) => entry.runtimePlaceIds?.includes(request.runtimePlaceId!))
      : [];
    if (byRuntimePlace.length) {
      return this.sceneResult(byRuntimePlace.sort(compareScenes)[0]!, 'runtime_place_id');
    }

    const requestedTags = new Set((request.tags ?? []).map(normalizeTag).filter(Boolean));
    if (requestedTags.size) {
      const tagged = candidates
        .map((candidate) => ({
          candidate,
          score: candidate.entry.tags.reduce(
            (sum, tag) => sum + (requestedTags.has(normalizeTag(tag)) ? 1 : 0),
            0
          )
        }))
        .filter(({ score }) => score > 0)
        .sort(
          (left, right) =>
            right.score - left.score || compareScenes(left.candidate, right.candidate)
        );
      if (tagged.length) return this.sceneResult(tagged[0]!.candidate, 'tags');
    }

    const fallbackId = this.basePack.manifest.fallbacks?.sceneAssetId;
    const configured = fallbackId ? this.scenes.get(fallbackId) : undefined;
    if (configured) return this.sceneResult(configured, 'configured_fallback', 'fallback');
    const generic = candidates
      .filter(({ entry }) => entry.reusePolicy === 'generic')
      .sort(compareScenes)[0];
    return generic ? this.sceneResult(generic, 'generic_fallback', 'fallback') : undefined;
  }

  private sceneResult(
    sourced: SourcedEntry<AvgSceneAssetEntry>,
    matchReason: AvgResolvedSceneAsset['matchReason'],
    sourceOverride?: 'fallback'
  ): AvgResolvedSceneAsset {
    const override = this.userOverrides?.getScene(sourced.entry.sceneAssetId);
    if (override) {
      return { source: 'user_override', entry: override, matchReason };
    }
    return {
      source: sourceOverride ?? sourced.source,
      sourcePackId: sourced.sourcePackId,
      entry: sourced.entry,
      matchReason
    };
  }
}
