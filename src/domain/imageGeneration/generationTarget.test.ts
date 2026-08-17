import { describe, expect, it } from 'vitest';
import { createImageGenerationProbeTarget, type ImageExecutionSnapshot } from './generationTarget';
import type { ImageGenerationDefaults } from './visualRepository';

function execution(
  generationParameters: ImageGenerationDefaults,
  executionTarget: ImageExecutionSnapshot['executionTarget'] = { kind: 'model', modelId: 'model-1' }
): ImageExecutionSnapshot {
  return {
    imageGenerationPresetId: 'preset-1',
    imageGenerationPresetRevision: 3,
    executionTarget,
    generationParameters
  };
}

describe('createImageGenerationProbeTarget', () => {
  it('maps every frozen cloud-provider parameter without dropping advanced fields', () => {
    expect(createImageGenerationProbeTarget(execution({
      providerType: 'openai-images', requestedImageCount: 2,
      size: { mode: 'auto' }, quality: 'high', outputFormat: 'webp',
      outputCompression: 73, background: 'transparent'
    }))).toMatchObject({
      size: 'auto', requestedImageCount: 2, quality: 'high', outputFormat: 'webp',
      outputCompression: 73, background: 'transparent'
    });

    expect(createImageGenerationProbeTarget(execution({
      providerType: 'xai-images', requestedImageCount: 2, aspectRatio: '16:9', resolution: '2k'
    }))).toMatchObject({ requestedImageCount: 2, aspectRatio: '16:9', resolution: '2k' });

    expect(createImageGenerationProbeTarget(execution({
      providerType: 'gemini-image', requestedImageCount: 1, aspectRatio: '3:4', imageSize: '0.5K', mimeType: 'image/jpeg'
    }))).toMatchObject({ requestedImageCount: 1, aspectRatio: '3:4', imageSize: '0.5K', mimeType: 'image/jpeg' });

    expect(createImageGenerationProbeTarget(execution({
      providerType: 'alibaba-model-studio', requestedImageCount: 3,
      size: { mode: 'resolution-tier', value: '2K' }, seed: { mode: 'fixed', value: 17 },
      watermark: 'disabled', promptEnhancement: 'enabled', thinkingMode: 'disabled'
    }))).toMatchObject({
      requestedImageCount: 3, size: '2K', seed: 17,
      watermark: false, promptExtend: true, thinkingMode: false
    });

    expect(createImageGenerationProbeTarget(execution({
      providerType: 'novelai-image', requestedImageCount: 2, width: 832, height: 1216,
      seed: { mode: 'fixed', value: 19 }, sampler: 'k_euler', steps: 28,
      guidanceScale: 6.5, cfgRescale: 0.4, noiseSchedule: 'native',
      qualityToggle: true, undesiredContentPreset: 2, smea: true, smeaDynamic: false
    }))).toMatchObject({
      requestedImageCount: 2, width: 832, height: 1216, seed: 19,
      sampler: 'k_euler', steps: 28, cfgScale: 6.5, cfgRescale: 0.4,
      noiseSchedule: 'native', qualityToggle: true, undesiredContentPreset: 2,
      smea: true, smeaDynamic: false
    });
  });

  it('maps ComfyUI bindings and every SD WebUI control with provider-specific random seed semantics', () => {
    const workflow = {
      workflowTemplateId: 'workflow-1', name: 'test', apiWorkflow: {}, workflowHash: 'a'.repeat(64),
      bindings: { positivePrompt: { nodeId: '1', inputName: 'text' } }, outputNodeIds: ['9'], revision: 2,
      createdAt: '2026-07-23T00:00:00.000Z', updatedAt: '2026-07-23T00:00:00.000Z'
    };
    expect(createImageGenerationProbeTarget(execution({
      providerType: 'novelai-image', requestedImageCount: 1, width: 512, height: 512,
      seed: { mode: 'provider-random' }
    }), {
      createNovelAiSeed: () => 0xffffffff
    })).toMatchObject({
      requestedImageCount: 1, width: 512, height: 512, seed: 0xffffffff
    });

    expect(createImageGenerationProbeTarget(execution({
      providerType: 'comfyui-workflow', workflowTemplateId: 'workflow-1',
      overrides: {
        checkpoint: 'checkpoint.safetensors', seed: { mode: 'provider-random' },
        width: 1024, height: 1536, steps: 30, cfg: 7, sampler: 'euler', scheduler: 'normal',
        custom: { denoise: 0.48, useControlNet: true }
      }
    }, { kind: 'comfy-workflow', workflowTemplateId: 'workflow-1', workflowRevision: 2 }), {
      workflow,
      createComfySeed: () => 123456
    })).toMatchObject({
      workflowTemplate: workflow, checkpoint: 'checkpoint.safetensors', seed: 123456,
      width: 1024, height: 1536, steps: 30, cfgScale: 7, sampler: 'euler', scheduler: 'normal',
      workflowParameterOverrides: { denoise: 0.48, useControlNet: true }
    });

    expect(createImageGenerationProbeTarget(execution({
      providerType: 'sd-webui', requestedImageCount: 2, width: 768, height: 512,
      seed: { mode: 'provider-random' }, checkpoint: 'sdxl.safetensors', samplerName: 'Euler',
      scheduler: 'Karras', steps: 24, cfgScale: 6, clipSkip: 2, restoreFaces: true, tiling: false,
      hiresFix: { enabled: true, scale: 2, upscaler: 'Latent', secondPassSteps: 12, denoisingStrength: 0.45 }
    }))).toMatchObject({
      requestedImageCount: 2, width: 768, height: 512, seed: -1,
      checkpoint: 'sdxl.safetensors', sampler: 'Euler', scheduler: 'Karras', steps: 24,
      cfgScale: 6, clipSkip: 2, restoreFaces: true, tiling: false,
      hiresFix: { enabled: true, scale: 2, upscaler: 'Latent', secondPassSteps: 12, denoisingStrength: 0.45 }
    });
  });
});
