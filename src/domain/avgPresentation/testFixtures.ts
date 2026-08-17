import type {
  AvgImageAssetRef,
  AvgLoadedResourcePack,
  AvgPortraitOutfitEntry,
  AvgResourcePackManifestV1,
  AvgSceneAssetEntry,
  FixedCharacterPortraitEntry,
  GenericPortraitSetEntry,
  StableIdentityRef
} from '../avgResourcePack';

export function fixtureImage(assetId: string): AvgImageAssetRef {
  return {
    assetId,
    path: `assets/${assetId}.png`,
    mediaType: 'image/png'
  };
}

export function fixtureOutfit(
  emotionIds: readonly string[] = ['default'],
  defaultVariantId = 'default'
): AvgPortraitOutfitEntry {
  return {
    outfitId: 'default',
    defaultVariantId,
    variants: Object.fromEntries(
      emotionIds.map((emotionId) => [
        emotionId,
        {
          variantId: emotionId,
          emotionId,
          image: fixtureImage(`portrait_${emotionId}`)
        }
      ])
    )
  };
}

export function fixtureFixed(
  identity: StableIdentityRef,
  emotionIds: readonly string[] = ['default']
): FixedCharacterPortraitEntry {
  return {
    stableIdentity: identity,
    portraitSetId: `fixed_${identity.canonicalId}`,
    defaultOutfitId: 'default',
    outfits: { default: fixtureOutfit(emotionIds) }
  };
}

export function fixtureGeneric(input: {
  portraitSetId: string;
  gender?: string;
  ageBand?: string;
  roleFamily?: string;
  roleSubtype?: string;
  roleTier?: string;
  reusePolicy?: GenericPortraitSetEntry['reusePolicy'];
  priority?: number;
  variants?: readonly string[];
}): GenericPortraitSetEntry {
  return {
    portraitSetId: input.portraitSetId,
    profile: {
      gender: input.gender,
      visualAgeBand: input.ageBand,
      roleFamily: input.roleFamily ?? 'civilian',
      roleSubtype: input.roleSubtype,
      roleTier: input.roleTier
    },
    defaultOutfitId: 'default',
    outfits: { default: fixtureOutfit(input.variants ?? ['default']) },
    reusePolicy: input.reusePolicy ?? 'unique_per_save',
    priority: input.priority
  };
}

export function fixtureScene(input: {
  sceneAssetId: string;
  runtimeSceneIds?: string[];
  runtimePlaceIds?: string[];
  tags?: string[];
  reusePolicy?: AvgSceneAssetEntry['reusePolicy'];
  priority?: number;
}): AvgSceneAssetEntry {
  return {
    sceneAssetId: input.sceneAssetId,
    worldpackId: 'hk1988',
    runtimeSceneIds: input.runtimeSceneIds,
    runtimePlaceIds: input.runtimePlaceIds,
    tags: input.tags ?? [],
    image: fixtureImage(`scene_${input.sceneAssetId}`),
    reusePolicy: input.reusePolicy ?? 'specific',
    priority: input.priority
  };
}

export function fixturePack(input: {
  packId?: string;
  version?: string;
  fixed?: FixedCharacterPortraitEntry[];
  generic?: GenericPortraitSetEntry[];
  scenes?: AvgSceneAssetEntry[];
} = {}): AvgLoadedResourcePack {
  const packId = input.packId ?? 'fixture_base';
  const manifest: AvgResourcePackManifestV1 = {
    schemaVersion: 1,
    packId,
    worldpackId: 'hk1988',
    version: input.version ?? '1.0.0',
    displayName: packId,
    packType: 'base',
    registries: {
      fixedCharacters: 'fixed.json',
      genericPortraits: 'generic.json',
      scenes: 'scenes.json'
    }
  };
  return {
    manifest,
    fixedCharacters: {
      schemaVersion: 1,
      worldpackId: 'hk1988',
      entries: input.fixed ?? []
    },
    genericPortraits: {
      schemaVersion: 1,
      worldpackId: 'hk1988',
      entries: input.generic ?? []
    },
    scenes: {
      schemaVersion: 1,
      worldpackId: 'hk1988',
      entries: input.scenes ?? []
    }
  };
}
