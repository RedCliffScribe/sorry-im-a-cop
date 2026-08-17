import { describe, expect, it } from 'vitest';
import { createImageGenerationPreset } from '../generationPresets';
import { applyPngParameterDraftToGenerationPreset } from './parameterDraft';

describe('PNG parameter draft application', () => {
  it('applies only portable fields to an SD WebUI edit draft', () => {
    const preset = createImageGenerationPreset({
      name: 'SD',
      profileId: 'profile',
      providerType: 'sd-webui',
      variantKey: 'half-body-medium',
      routingTarget: { kind: 'model', modelId: 'model' },
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'sd-webui',
        requestedImageCount: 1,
        width: 768,
        height: 1024,
        seed: { mode: 'provider-random' }
      },
      now: '2026-07-29T00:00:00.000Z'
    });
    const applied = applyPngParameterDraftToGenerationPreset(preset, {
      sampler: 'DPM++ 2M',
      steps: 28,
      cfg: 6,
      clipSkip: 2
    });
    expect(applied.preset.generationParameters).toMatchObject({
      samplerName: 'DPM++ 2M',
      steps: 28,
      cfgScale: 6,
      clipSkip: 2
    });
    expect(applied.appliedFields).toEqual(['sampler', 'steps', 'cfg', 'clipSkip']);
  });

  it('does not force SD parameters into an OpenAI Images preset', () => {
    const preset = createImageGenerationPreset({
      name: 'OpenAI',
      profileId: 'profile',
      providerType: 'openai-images',
      variantKey: 'narrative-scene',
      routingTarget: { kind: 'model', modelId: 'gpt-image' },
      targetAspectRatio: '16:9',
      generationParameters: {
        providerType: 'openai-images',
        requestedImageCount: 1,
        size: { mode: 'auto' },
        quality: 'auto',
        outputFormat: 'png',
        background: 'auto'
      },
      now: '2026-07-29T00:00:00.000Z'
    });
    const applied = applyPngParameterDraftToGenerationPreset(preset, { steps: 28, cfg: 6 });
    expect(applied.appliedFields).toEqual([]);
    expect(applied.skippedFields).toEqual(['steps', 'cfg']);
    expect(applied.preset).toEqual(preset);
  });

  it('skips parameter values that exceed NovelAI limits instead of failing the whole draft', () => {
    const preset = createImageGenerationPreset({
      name: 'NAI',
      profileId: 'profile',
      providerType: 'novelai-image',
      variantKey: 'half-body-medium',
      routingTarget: { kind: 'model', modelId: 'nai-diffusion-4-5-curated' },
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'novelai-image',
        requestedImageCount: 1,
        width: 768,
        height: 1024,
        seed: { mode: 'provider-random' }
      },
      now: '2026-07-29T00:00:00.000Z'
    });
    const applied = applyPngParameterDraftToGenerationPreset(preset, {
      sampler: 'k_euler',
      steps: 500,
      cfg: 200,
      clipSkip: 2
    });
    expect(applied.appliedFields).toEqual(['sampler']);
    expect(applied.skippedFields).toEqual(['steps', 'cfg', 'clipSkip']);
    expect(applied.preset.generationParameters).toMatchObject({
      providerType: 'novelai-image',
      sampler: 'k_euler'
    });
  });
});
