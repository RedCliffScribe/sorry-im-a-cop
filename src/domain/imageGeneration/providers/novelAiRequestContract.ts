export const NOVEL_AI_MAX_SEED = 0xffffffff;

export type NovelAiModelFamily = 'legacy' | 'v4' | 'v4.5';

export interface NovelAiProtocolDefaults {
  paramsVersion: 3;
  steps: number;
  scale: number;
  sampler: string;
  noiseSchedule: string;
  cfgRescale: number;
  qualityToggle: boolean;
  undesiredContentPreset: number;
  smea: boolean;
  smeaDynamic: boolean;
  legacyV3Extend: boolean;
  dynamicThresholding: boolean;
}

export function resolveNovelAiModelFamily(model: string): NovelAiModelFamily {
  const normalized = model.trim().toLowerCase();
  if (/^nai-diffusion-4-5(?:-|$)/.test(normalized)) return 'v4.5';
  if (/^nai-diffusion-4(?:-|$)/.test(normalized)) return 'v4';
  return 'legacy';
}

export function isNovelAiV4Model(model: string): boolean {
  return resolveNovelAiModelFamily(model) !== 'legacy';
}

export function resolveNovelAiProtocolDefaults(model: string): NovelAiProtocolDefaults {
  const normalized = model.trim().toLowerCase();
  const family = resolveNovelAiModelFamily(normalized);
  const isFurryV3 = /^nai-diffusion-furry-3(?:-|$)/.test(normalized);
  const isAnimeV3 = /^nai-diffusion-3(?:-|$)/.test(normalized);
  const isV2 = /^nai-diffusion-(?:2|xl)(?:-|$)/.test(normalized);
  return {
    paramsVersion: 3,
    steps: family === 'legacy' && !isFurryV3 && !isAnimeV3 ? 28 : 23,
    scale: family === 'v4.5'
      ? 5
      : family === 'v4'
        ? 5.5
        : isFurryV3
          ? 6.2
          : isAnimeV3
            ? 5
            : 10,
    sampler: 'k_euler_ancestral',
    noiseSchedule: family === 'legacy' && !isFurryV3 && !isAnimeV3 ? 'native' : 'karras',
    cfgRescale: 0,
    qualityToggle: true,
    undesiredContentPreset: 0,
    smea: false,
    smeaDynamic: false,
    legacyV3Extend: isFurryV3 || isAnimeV3 || isV2,
    dynamicThresholding: isV2
  };
}

export function createRandomNovelAiSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}
