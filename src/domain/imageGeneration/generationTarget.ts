import type { ImageGenerationProbeTarget } from './profile';
import type { ComfyWorkflowTemplate } from './profile';
import type {
  CompiledImageRequestDraftSnapshot,
  ImageGenerationDefaults,
  SeedControl
} from './visualRepository';
import { createRandomNovelAiSeed } from './providers/novelAiRequestContract';

export type ImageExecutionSnapshot = Pick<
  CompiledImageRequestDraftSnapshot,
  | 'imageGenerationPresetId'
  | 'imageGenerationPresetRevision'
  | 'executionTarget'
  | 'generationParameters'
>;

export interface ImageGenerationTargetOptions {
  workflow?: ComfyWorkflowTemplate;
  createComfySeed?: () => number;
  createNovelAiSeed?: () => number;
}

function fixedSeed(seed: SeedControl | undefined): number | undefined {
  return seed?.mode === 'fixed' ? seed.value : undefined;
}

export function createRandomComfySeed(): number {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return ((values[0] * 0x100000000) + values[1]) % Number.MAX_SAFE_INTEGER;
}

function alibabaSize(parameters: Extract<ImageGenerationDefaults, { providerType: 'alibaba-model-studio' }>): string | undefined {
  switch (parameters.size.mode) {
    case 'provider-default':
      return undefined;
    case 'resolution-tier':
    case 'fixed-preset':
      return parameters.size.value;
    case 'dimensions':
      return `${parameters.size.width}*${parameters.size.height}`;
  }
}

function triState(value: 'provider-default' | 'enabled' | 'disabled'): boolean | undefined {
  return value === 'provider-default' ? undefined : value === 'enabled';
}

export function createImageGenerationProbeTarget(
  execution: ImageExecutionSnapshot,
  options: ImageGenerationTargetOptions = {}
): ImageGenerationProbeTarget {
  const common: ImageGenerationProbeTarget = {
    presetId: execution.imageGenerationPresetId,
    presetRevision: execution.imageGenerationPresetRevision,
    modelId: execution.executionTarget.kind === 'model' ? execution.executionTarget.modelId : undefined,
    workflowTemplate: execution.executionTarget.kind === 'comfy-workflow' ? options.workflow : undefined
  };
  const parameters = execution.generationParameters;
  switch (parameters.providerType) {
    case 'openai-images':
      return {
        ...common,
        requestedImageCount: parameters.requestedImageCount,
        size: parameters.size.mode === 'auto'
          ? 'auto'
          : `${parameters.size.width}x${parameters.size.height}`,
        quality: parameters.quality,
        outputFormat: parameters.outputFormat,
        outputCompression: parameters.outputCompression,
        background: parameters.background
      };
    case 'xai-images':
      return {
        ...common,
        requestedImageCount: parameters.requestedImageCount,
        aspectRatio: parameters.aspectRatio,
        resolution: parameters.resolution
      };
    case 'gemini-image':
      return {
        ...common,
        requestedImageCount: parameters.requestedImageCount,
        aspectRatio: parameters.aspectRatio,
        imageSize: parameters.imageSize,
        mimeType: parameters.mimeType
      };
    case 'alibaba-model-studio':
      return {
        ...common,
        requestedImageCount: parameters.requestedImageCount,
        size: alibabaSize(parameters),
        seed: fixedSeed(parameters.seed),
        watermark: triState(parameters.watermark),
        promptExtend: triState(parameters.promptEnhancement),
        thinkingMode: triState(parameters.thinkingMode)
      };
    case 'novelai-image':
      return {
        ...common,
        requestedImageCount: parameters.requestedImageCount,
        width: parameters.width,
        height: parameters.height,
        seed: parameters.seed.mode === 'provider-random'
          ? (options.createNovelAiSeed ?? createRandomNovelAiSeed)()
          : fixedSeed(parameters.seed),
        sampler: parameters.sampler,
        steps: parameters.steps,
        cfgScale: parameters.guidanceScale,
        cfgRescale: parameters.cfgRescale,
        noiseSchedule: parameters.noiseSchedule,
        qualityToggle: parameters.qualityToggle,
        undesiredContentPreset: parameters.undesiredContentPreset,
        smea: parameters.smea,
        smeaDynamic: parameters.smeaDynamic,
        imageToImageStrength: parameters.imageToImage?.strength,
        imageToImageNoise: parameters.imageToImage?.noise
      };
    case 'comfyui-workflow':
      return {
        ...common,
        checkpoint: parameters.overrides.checkpoint,
        seed: parameters.overrides.seed?.mode === 'provider-random'
          ? (options.createComfySeed ?? createRandomComfySeed)()
          : fixedSeed(parameters.overrides.seed),
        width: parameters.overrides.width,
        height: parameters.overrides.height,
        steps: parameters.overrides.steps,
        cfgScale: parameters.overrides.cfg,
        sampler: parameters.overrides.sampler,
        scheduler: parameters.overrides.scheduler,
        workflowParameterOverrides: parameters.overrides.custom
      };
    case 'sd-webui':
      return {
        ...common,
        requestedImageCount: parameters.requestedImageCount,
        width: parameters.width,
        height: parameters.height,
        seed: parameters.seed.mode === 'fixed' ? parameters.seed.value : -1,
        checkpoint: parameters.checkpoint,
        sampler: parameters.samplerName,
        scheduler: parameters.scheduler,
        steps: parameters.steps,
        cfgScale: parameters.cfgScale,
        clipSkip: parameters.clipSkip,
        restoreFaces: parameters.restoreFaces,
        tiling: parameters.tiling,
        hiresFix: parameters.hiresFix,
        imageToImageDenoisingStrength: parameters.imageToImage?.denoisingStrength
      };
  }
}
