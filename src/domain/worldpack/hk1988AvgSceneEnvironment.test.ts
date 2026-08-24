import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HK1988_AVG_SCENE_ENVIRONMENT_PROFILES,
  hk1988AvgEnvironmentAdapter
} from './hk1988AvgSceneEnvironment';

const registryPath = 'avg_art_production/hk1988/resource_pack/hk1988_avg_default_v1_1_1/metadata/scene_registry.json';
const itWithProductionRegistry = existsSync(registryPath) ? it : it.skip;

describe('hk1988 AVG scene environment metadata', () => {
  itWithProductionRegistry('classifies every accepted 1.1.1 scene exactly once without changing its registry', () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      entries: Array<{ sceneAssetId: string }>;
    };
    const registryIds = registry.entries.map((entry) => entry.sceneAssetId).sort();
    const profileIds = Object.keys(HK1988_AVG_SCENE_ENVIRONMENT_PROFILES).sort();
    expect(profileIds).toEqual(registryIds);
    expect(profileIds).toHaveLength(101);
  });

  it('keeps obvious police, nightlife, street and harbour examples semantically distinct', () => {
    expect(hk1988AvgEnvironmentAdapter.resolveSceneProfile('police_cid_office'))
      .toEqual({ exposure: 'indoor', lightingProfile: 'artificial' });
    expect(hk1988AvgEnvironmentAdapter.resolveSceneProfile('nightclub'))
      .toEqual({ exposure: 'indoor', lightingProfile: 'nightlife' });
    expect(hk1988AvgEnvironmentAdapter.resolveSceneProfile('mong_kok_dense_street'))
      .toEqual({ exposure: 'outdoor', lightingProfile: 'natural' });
    expect(hk1988AvgEnvironmentAdapter.resolveSceneProfile('ferry_pier'))
      .toEqual({ exposure: 'semi_outdoor', lightingProfile: 'mixed' });
    expect(hk1988AvgEnvironmentAdapter.resolveSceneProfile('unknown_scene')).toBeUndefined();
  });
});
