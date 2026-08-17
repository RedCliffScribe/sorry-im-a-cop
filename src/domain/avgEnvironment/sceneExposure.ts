import type { AvgSceneEnvironmentProfile, AvgSceneExposure } from './types';

const EXPOSURES = new Set<AvgSceneExposure>([
  'outdoor',
  'indoor',
  'semi_outdoor',
  'vehicle',
  'unknown'
]);

function exactExposure(value: unknown): AvgSceneExposure | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLocaleLowerCase('en-US').replace(/[\s-]+/gu, '_');
  return EXPOSURES.has(normalized as AvgSceneExposure)
    ? normalized as AvgSceneExposure
    : undefined;
}

export function resolveAvgSceneExposure(input: {
  runtimeSceneExposure?: unknown;
  runtimePlaceExposure?: unknown;
  registryTags?: readonly string[];
  worldpackProfile?: AvgSceneEnvironmentProfile;
}): {
  exposure: AvgSceneExposure;
  source: 'runtime_structure' | 'registry_tags' | 'worldpack_metadata' | 'missing';
} {
  const structured = exactExposure(input.runtimeSceneExposure) ??
    exactExposure(input.runtimePlaceExposure);
  if (structured) return { exposure: structured, source: 'runtime_structure' };

  for (const tag of input.registryTags ?? []) {
    const exposure = exactExposure(tag);
    if (exposure) return { exposure, source: 'registry_tags' };
  }

  if (input.worldpackProfile) {
    return {
      exposure: input.worldpackProfile.exposure,
      source: 'worldpack_metadata'
    };
  }
  return { exposure: 'unknown', source: 'missing' };
}
