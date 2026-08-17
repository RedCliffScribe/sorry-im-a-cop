import { describe, expect, it, vi } from 'vitest';
import { createNovelAiBody } from './NovelAiImageProbeAdapter';
import {
  NOVEL_AI_MAX_SEED,
  resolveNovelAiModelFamily,
  resolveNovelAiProtocolDefaults
} from './novelAiRequestContract';
import { novelAiRequestSchema } from './providerPayloadSchemas';
import { novelAiProbeProfileSchema, type NovelAiProbeProfile } from './providerSchemas';

function profile(model: string, overrides: Partial<NovelAiProbeProfile> = {}): NovelAiProbeProfile {
  return novelAiProbeProfileSchema.parse({
    apiBaseUrl: 'https://image.novelai.net',
    model,
    responseFormat: 'auto',
    width: 512,
    height: 512,
    nSamples: 1,
    ...overrides
  });
}

describe('NovelAI request contract', () => {
  it.each([
    ['nai-diffusion-4-curated-preview', 5.5],
    ['nai-diffusion-4-full', 5.5],
    ['nai-diffusion-4-curated-inpainting', 5.5],
    ['nai-diffusion-4-full-inpainting', 5.5],
    ['nai-diffusion-4-5-curated', 5],
    ['nai-diffusion-4-5-full', 5],
    ['nai-diffusion-4-5-curated-inpainting', 5],
    ['nai-diffusion-4-5-full-inpainting', 5]
  ])('builds a complete V4 request for %s without a saved generation preset', (model, expectedScale) => {
    const body = createNovelAiBody(profile(model), {
      prompt: '1girl, police uniform',
      negativePrompt: 'bad hands',
      profile: {},
      credential: {}
    }, () => NOVEL_AI_MAX_SEED);

    expect(body).toEqual({
      input: '1girl, police uniform',
      model,
      action: 'generate',
      parameters: {
        params_version: 3,
        width: 512,
        height: 512,
        n_samples: 1,
        uc: 'bad hands',
        steps: 23,
        scale: expectedScale,
        cfg_rescale: 0,
        sampler: 'k_euler_ancestral',
        seed: NOVEL_AI_MAX_SEED,
        noise_schedule: 'karras',
        qualityToggle: true,
        ucPreset: 0,
        sm: false,
        sm_dyn: false,
        legacy_v3_extend: false,
        dynamic_thresholding: false,
        v4_prompt: {
          caption: { base_caption: '1girl, police uniform', char_captions: [] },
          use_coords: false,
          use_order: true,
          legacy_uc: false
        },
        v4_negative_prompt: {
          caption: { base_caption: 'bad hands', char_captions: [] },
          use_coords: false,
          use_order: false,
          legacy_uc: false
        }
      }
    });
    expect(novelAiRequestSchema.safeParse(body).success).toBe(true);
  });

  it('uses the V4 defaults while allowing every saved generation preset value to override them', () => {
    const createSeed = vi.fn(() => 99);
    const body = createNovelAiBody(profile('nai-diffusion-4-full', {
      steps: 28,
      scale: 6.5,
      cfgRescale: 0.4,
      sampler: 'k_euler',
      seed: 7,
      noiseSchedule: 'native',
      qualityToggle: false,
      undesiredContentPreset: 2,
      smea: true,
      smeaDynamic: true
    }), {
      prompt: 'portrait',
      negativePrompt: '',
      profile: {},
      credential: {}
    }, createSeed);

    expect(body.parameters).toMatchObject({
      steps: 28,
      scale: 6.5,
      cfg_rescale: 0.4,
      sampler: 'k_euler',
      seed: 7,
      noise_schedule: 'native',
      qualityToggle: false,
      ucPreset: 2,
      sm: true,
      sm_dyn: true
    });
    expect(createSeed).not.toHaveBeenCalled();
  });

  it('keeps V3 and older models on the legacy prompt contract', () => {
    const body = createNovelAiBody(profile('nai-diffusion-3'), {
      prompt: 'legacy portrait',
      negativePrompt: 'lowres',
      profile: {},
      credential: {}
    }, () => 42);

    expect(resolveNovelAiModelFamily('nai-diffusion-3')).toBe('legacy');
    expect(resolveNovelAiProtocolDefaults('nai-diffusion-3')).toMatchObject({
      steps: 23,
      scale: 5,
      sampler: 'k_euler_ancestral',
      noiseSchedule: 'karras',
      legacyV3Extend: true
    });
    expect(body.parameters).toMatchObject({
      params_version: 3,
      uc: 'lowres',
      seed: 42,
      legacy_v3_extend: true,
      dynamic_thresholding: false
    });
    expect(body.parameters).not.toHaveProperty('v4_prompt');
    expect(body.parameters).not.toHaveProperty('v4_negative_prompt');
    expect(novelAiRequestSchema.safeParse(body).success).toBe(true);
  });

  it('keeps the payload schema strict for typoed fields, malformed nesting, and mismatched prompt copies', () => {
    const valid = createNovelAiBody(profile('nai-diffusion-4-5-curated'), {
      prompt: 'portrait',
      negativePrompt: 'blur',
      profile: {},
      credential: {}
    }, () => 1);
    const typo = structuredClone(valid);
    const typoParameters = typo.parameters as Record<string, unknown>;
    typoParameters.v4_promt = typoParameters.v4_prompt;
    delete typoParameters.v4_prompt;
    expect(novelAiRequestSchema.safeParse(typo).success).toBe(false);

    const malformed = structuredClone(valid);
    const malformedParameters = malformed.parameters as Record<string, unknown>;
    malformedParameters.v4_prompt = {
      caption: { base_caption: 'portrait', char_captions: [{ charCaption: 'actor' }] },
      use_coords: false,
      use_order: true,
      legacy_uc: false
    };
    expect(novelAiRequestSchema.safeParse(malformed).success).toBe(false);

    const inconsistent = structuredClone(valid);
    const inconsistentParameters = inconsistent.parameters as {
      v4_negative_prompt: { caption: { base_caption: string } };
    };
    inconsistentParameters.v4_negative_prompt.caption.base_caption = 'different';
    expect(novelAiRequestSchema.safeParse(inconsistent).success).toBe(false);
  });

  it('accepts the full NovelAI uint32 seed range and rejects larger values', () => {
    expect(novelAiProbeProfileSchema.safeParse({
      ...profile('nai-diffusion-4-5-curated'),
      seed: NOVEL_AI_MAX_SEED
    }).success).toBe(true);
    expect(novelAiProbeProfileSchema.safeParse({
      ...profile('nai-diffusion-4-5-curated'),
      seed: NOVEL_AI_MAX_SEED + 1
    }).success).toBe(false);
  });
});
