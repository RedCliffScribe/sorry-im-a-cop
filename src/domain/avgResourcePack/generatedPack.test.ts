// @ts-expect-error Vitest 在 Node 中运行；产品 tsconfig 有意不加载整套 Node 类型。
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  collectAvgResourcePackAssets,
  parseAvgLoadedResourcePack,
  validateAvgLoadedResourcePack
} from './validation';

const root = 'avg_art_production/hk1988/resource_pack/hk1988_avg_default_v1_1_1';
const describeGeneratedPack = existsSync(`${root}/manifest.json`) ? describe : describe.skip;

function json(path: string): unknown {
  return JSON.parse(readFileSync(`${root}/${path}`, 'utf8'));
}

describeGeneratedPack('generated hk1988 default AVG resource pack', () => {
  it('matches the runtime schemas and contains only user-accepted assets', () => {
    const pack = parseAvgLoadedResourcePack({
      manifest: json('manifest.json'),
      fixedCharacters: json('metadata/fixed_character_registry.json'),
      genericPortraits: json('metadata/generic_portrait_registry.json'),
      scenes: json('metadata/scene_registry.json')
    });
    const report = validateAvgLoadedResourcePack(pack, {
      requireUserAcceptedProvenance: true
    });
    expect(report.valid, JSON.stringify(report.issues, null, 2)).toBe(true);
    const assets = collectAvgResourcePackAssets(pack).map((item) => item.asset);
    const acceptanceModes = assets.reduce<Record<string, number>>((counts, asset) => {
      const mode = asset.provenance?.acceptanceMode ?? 'missing';
      counts[mode] = (counts[mode] ?? 0) + 1;
      return counts;
    }, {});

    expect(pack.manifest.version).toBe('1.1.1');
    expect(pack.fixedCharacters.entries).toHaveLength(358);
    expect(pack.genericPortraits.entries).toHaveLength(436);
    expect(pack.scenes.entries).toHaveLength(101);
    expect(report.assetCount).toBe(1632);
    expect(acceptanceModes).toEqual({
      default_scope_acceptance: 1273,
      explicit_version: 359
    });
  });
});
