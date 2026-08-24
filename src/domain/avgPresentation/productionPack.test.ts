import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DefaultAvgResourceResolver, parseAvgLoadedResourcePack } from '../avgResourcePack';
import { STORY_EMOTIONS } from '../runtime/storyBlocks';
import { resolveEmotionVariant } from './emotionVariantResolver';

const root = 'avg_art_production/hk1988/resource_pack/hk1988_avg_default_v1_1_1';
const describeProductionPack = existsSync(`${root}/manifest.json`) ? describe : describe.skip;

function json(path: string): unknown {
  return JSON.parse(readFileSync(`${root}/${path}`, 'utf8'));
}

function productionPack() {
  return parseAvgLoadedResourcePack({
    manifest: json('manifest.json'),
    fixedCharacters: json('metadata/fixed_character_registry.json'),
    genericPortraits: json('metadata/generic_portrait_registry.json'),
    scenes: json('metadata/scene_registry.json')
  });
}

describeProductionPack('AVG-003 against the accepted hk1988 production pack', () => {
  it('resolves every StoryEmotion inside all 399 outfits of the 358 fixed portrait sets', () => {
    const pack = productionPack();
    const resolver = new DefaultAvgResourceResolver({ basePack: pack });
    expect(pack.fixedCharacters.entries.reduce(
      (count, entry) => count + Object.keys(entry.outfits).length,
      0
    )).toBe(399);

    for (const entry of pack.fixedCharacters.entries) {
      for (const outfit of Object.values(entry.outfits)) {
        for (const emotion of STORY_EMOTIONS) {
          const variant = resolveEmotionVariant(outfit, emotion, 'fixed');
          expect(variant, `${entry.portraitSetId}:${outfit.outfitId}:${emotion}`).toBeDefined();
          expect(
            resolver.resolveFixedCharacterAsset(entry.stableIdentity, {
              outfitId: outfit.outfitId,
              variantId: variant!.variantId
            }),
            `${entry.portraitSetId}:${outfit.outfitId}:${emotion}:${variant!.variantId}`
          ).toBeDefined();
        }
      }
    }
  });

  it('enumerates all 436 generic sets and resolves only their default visual variant', () => {
    const pack = productionPack();
    const resolver = new DefaultAvgResourceResolver({ basePack: pack });
    expect(resolver.getGenericPortraitSets()).toHaveLength(436);

    for (const entry of resolver.getGenericPortraitSets()) {
      const outfit = entry.outfits[entry.defaultOutfitId];
      for (const emotion of STORY_EMOTIONS) {
        const variant = resolveEmotionVariant(outfit, emotion, 'generic');
        expect(variant, `${entry.portraitSetId}:${emotion}`).toMatchObject({
          variantId: 'default',
          emotionId: 'default'
        });
        expect(
          resolver.resolveGenericPortraitAsset(entry.portraitSetId, {
            outfitId: entry.defaultOutfitId,
            variantId: variant!.variantId
          }),
          `${entry.portraitSetId}:${emotion}`
        ).toBeDefined();
      }
    }
  });

  it('exposes the real 101-scene inventory without pretending its lone generic office is universal', () => {
    const pack = productionPack();
    const counts = pack.scenes.entries.reduce(
      (result, entry) => {
        result[entry.reusePolicy ?? 'specific'] += 1;
        return result;
      },
      { specific: 0, generic: 0 }
    );
    expect(pack.manifest).toMatchObject({
      packId: 'hk1988_avg_default',
      worldpackId: 'hk1988',
      version: '1.1.1'
    });
    expect(counts).toEqual({ specific: 100, generic: 1 });
  });
});
