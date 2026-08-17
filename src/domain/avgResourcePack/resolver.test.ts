import { describe, expect, it } from 'vitest';
import type {
  AvgImageAssetRef,
  AvgLoadedResourcePack,
  AvgResourcePackManifestV1,
  FixedCharacterPortraitEntry,
  GenericPortraitSetEntry
} from './types';
import { DefaultAvgResourceResolver } from './resolver';
import { toStableIdentityKey } from './stableIdentity';

const identity = { worldpackId: 'hk1988', kind: 'era_seed', canonicalId: 'figure_1' } as const;

function image(assetId: string): AvgImageAssetRef {
  return { assetId, path: `portraits/${assetId}.png`, mediaType: 'image/png' };
}

function fixed(assetId: string): FixedCharacterPortraitEntry {
  return {
    stableIdentity: identity,
    portraitSetId: 'fixed_figure_1',
    defaultOutfitId: 'default',
    outfits: {
      default: {
        outfitId: 'default',
        defaultVariantId: 'default',
        variants: {
          default: { variantId: 'default', emotionId: 'default', image: image(assetId) },
          happy: { variantId: 'happy', emotionId: 'happy', image: image(`${assetId}_happy`) }
        }
      }
    }
  };
}

function pack(
  packId: string,
  type: 'base' | 'extension',
  options: {
    fixed?: FixedCharacterPortraitEntry[];
    generic?: GenericPortraitSetEntry[];
    loadOrder?: number;
    declaresOverride?: boolean;
  } = {}
): AvgLoadedResourcePack {
  const manifest: AvgResourcePackManifestV1 = {
    schemaVersion: 1,
    packId,
    worldpackId: 'hk1988',
    version: '1.0.0',
    displayName: packId,
    packType: type,
    targetBasePackId: type === 'extension' ? 'base' : undefined,
    loadOrder: options.loadOrder,
    registries: { fixedCharacters: 'fixed.json', genericPortraits: 'generic.json', scenes: 'scenes.json' },
    overrides: type === 'extension' && options.declaresOverride
      ? { fixedCharacters: [toStableIdentityKey(identity)] }
      : undefined,
    fallbacks: type === 'base' ? { sceneAssetId: 'generic_room' } : undefined
  };
  return {
    manifest,
    fixedCharacters: { schemaVersion: 1, worldpackId: 'hk1988', entries: options.fixed ?? [] },
    genericPortraits: { schemaVersion: 1, worldpackId: 'hk1988', entries: options.generic ?? [] },
    scenes: {
      schemaVersion: 1,
      worldpackId: 'hk1988',
      entries: type === 'base' ? [
        {
          sceneAssetId: 'specific_central',
          worldpackId: 'hk1988',
          runtimeSceneIds: ['central'],
          tags: ['central', 'street'],
          image: { assetId: 'scene_central', path: 'scenes/central.webp', mediaType: 'image/webp' },
          priority: 100,
          reusePolicy: 'specific'
        },
        {
          sceneAssetId: 'generic_room',
          worldpackId: 'hk1988',
          tags: ['interior'],
          image: { assetId: 'scene_room', path: 'scenes/room.webp', mediaType: 'image/webp' },
          reusePolicy: 'generic'
        }
      ] : []
    }
  };
}

describe('DefaultAvgResourceResolver', () => {
  it('uses extension loadOrder and requires explicit collision declarations', () => {
    const base = pack('base', 'base', { fixed: [fixed('base_default')] });
    const low = pack('low', 'extension', { fixed: [fixed('low_default')], loadOrder: 10, declaresOverride: true });
    const high = pack('high', 'extension', { fixed: [fixed('high_default')], loadOrder: 20, declaresOverride: true });
    const resolver = new DefaultAvgResourceResolver({ basePack: base, extensionPacks: [high, low] });
    expect(resolver.resolveFixedCharacterAsset(identity)?.image.assetId).toBe('high_default');
    expect(() => new DefaultAvgResourceResolver({
      basePack: base,
      extensionPacks: [pack('undeclared', 'extension', { fixed: [fixed('bad')] })]
    })).toThrow(/未显式声明/u);
  });

  it('falls back from missing emotion to default without throwing', () => {
    const resolver = new DefaultAvgResourceResolver({
      basePack: pack('base', 'base', { fixed: [fixed('base_default')] })
    });
    expect(resolver.resolveFixedCharacterAsset(identity, { emotionId: 'sad' })).toMatchObject({
      variantId: 'default',
      fallbackReason: 'requested_emotion_missing'
    });
  });

  it('enumerates effective generic portrait sets deterministically', () => {
    const generic = (portraitSetId: string): GenericPortraitSetEntry => ({
      portraitSetId,
      profile: { roleFamily: 'civilian' },
      defaultOutfitId: 'default',
      outfits: {
        default: {
          outfitId: 'default',
          defaultVariantId: 'default',
          variants: {
            default: {
              variantId: 'default',
              emotionId: 'default',
              image: image(`${portraitSetId}_default`)
            }
          }
        }
      },
      reusePolicy: 'unique_per_save'
    });
    const resolver = new DefaultAvgResourceResolver({
      basePack: pack('base', 'base', { generic: [generic('generic_b'), generic('generic_a')] })
    });

    expect(resolver.getGenericPortraitSets().map((entry) => entry.portraitSetId)).toEqual([
      'generic_a',
      'generic_b'
    ]);
  });

  it('resolves scenes by exact runtime ID, tags, then configured fallback', () => {
    const resolver = new DefaultAvgResourceResolver({ basePack: pack('base', 'base') });
    expect(resolver.resolveScene({ runtimeSceneId: 'central' })?.matchReason).toBe('runtime_scene_id');
    expect(resolver.resolveScene({ tags: ['street'] })?.entry.sceneAssetId).toBe('specific_central');
    expect(resolver.resolveScene({ tags: ['unmatched'] })).toMatchObject({
      source: 'fallback',
      matchReason: 'configured_fallback',
      entry: { sceneAssetId: 'generic_room' }
    });
  });
});
