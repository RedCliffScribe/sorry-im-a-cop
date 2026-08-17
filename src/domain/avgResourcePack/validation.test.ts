import { describe, expect, it } from 'vitest';
import { parseAvgLoadedResourcePack, validateAvgLoadedResourcePack } from './validation';

function input() {
  const image = {
    assetId: 'accepted_image',
    path: 'portraits/accepted.png',
    mediaType: 'image/png',
    provenance: { status: 'user_accepted', userAcceptanceEvidence: '用户明确通过' }
  };
  return {
    manifest: {
      schemaVersion: 1,
      packId: 'hk1988_avg_default',
      worldpackId: 'hk1988',
      version: '1.0.0',
      displayName: 'HK1988',
      packType: 'base',
      registries: { fixedCharacters: 'fixed.json', genericPortraits: 'generic.json', scenes: 'scenes.json' }
    },
    fixedCharacters: {
      schemaVersion: 1,
      worldpackId: 'hk1988',
      entries: [{
        stableIdentity: { worldpackId: 'hk1988', kind: 'era_seed', canonicalId: 'figure_1' },
        portraitSetId: 'figure_1',
        defaultOutfitId: 'default',
        outfits: { default: { outfitId: 'default', defaultVariantId: 'default', variants: {
          default: { variantId: 'default', emotionId: 'default', image }
        } } }
      }]
    },
    genericPortraits: { schemaVersion: 1, worldpackId: 'hk1988', entries: [] },
    scenes: { schemaVersion: 1, worldpackId: 'hk1988', entries: [] }
  };
}

describe('AVG resource validation', () => {
  it('accepts a structurally sound user-accepted pack', () => {
    const report = validateAvgLoadedResourcePack(parseAvgLoadedResourcePack(input()), {
      requireUserAcceptedProvenance: true
    });
    expect(report.valid).toBe(true);
  });

  it('rejects a missing default variant during schema parsing', () => {
    const value = input();
    value.fixedCharacters.entries[0]!.outfits.default.defaultVariantId = 'missing';
    expect(() => parseAvgLoadedResourcePack(value)).toThrow(/默认表现变体不存在/u);
  });

  it('rejects duplicate asset IDs and non-accepted provenance', () => {
    const value = input();
    const duplicate = structuredClone(value.fixedCharacters.entries[0]!);
    duplicate.stableIdentity.canonicalId = 'figure_2';
    duplicate.portraitSetId = 'figure_2';
    duplicate.outfits.default.variants.default.image.provenance.status = 'technical_pass';
    value.fixedCharacters.entries.push(duplicate);
    const report = validateAvgLoadedResourcePack(parseAvgLoadedResourcePack(value), {
      requireUserAcceptedProvenance: true
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['duplicate_asset_id', 'asset_not_user_accepted'])
    );
  });
});
