import type { ImageGenerationProbeAdapter } from '../probe';
import {
  AlibabaModelStudioProbeAdapter,
  ComfyUiWorkflowProbeAdapter,
  GeminiImageProbeAdapter,
  NovelAiImageProbeAdapter,
  OpenAiImagesProbeAdapter,
  SdWebUiProbeAdapter,
  XaiImagesProbeAdapter,
  type ProxyCredential
} from '../providers';
import { createConnectionFingerprint, createExecutionFingerprint } from './fingerprints';
import { resolveComfyWorkflowParameterOverrides } from './comfyWorkflowParameters';
import { validateImageProfileLocally } from './localValidation';
import type {
  ComfyWorkflowTemplate,
  ImageApiCredential,
  ImageApiProfile
} from './types';

export interface ImageGenerationProbeTarget {
  presetId?: string;
  presetRevision: number;
  modelId?: string;
  workflowTemplate?: ComfyWorkflowTemplate;
  size?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  seed?: number;
  requestedImageCount?: number;
  aspectRatio?: string;
  resolution?: string;
  imageSize?: '0.5K' | '1K' | '2K' | '4K';
  mimeType?: 'image/png' | 'image/jpeg';
  quality?: string;
  outputFormat?: 'png' | 'jpeg' | 'webp';
  outputCompression?: number;
  background?: 'auto' | 'opaque' | 'transparent';
  watermark?: boolean;
  promptExtend?: boolean;
  thinkingMode?: boolean;
  cfgRescale?: number;
  noiseSchedule?: string;
  qualityToggle?: boolean;
  undesiredContentPreset?: number;
  smea?: boolean;
  smeaDynamic?: boolean;
  imageToImageStrength?: number;
  imageToImageNoise?: number;
  imageToImageDenoisingStrength?: number;
  checkpoint?: string;
  scheduler?: string;
  clipSkip?: number;
  restoreFaces?: boolean;
  tiling?: boolean;
  hiresFix?: {
    enabled: boolean;
    scale?: number;
    upscaler?: string;
    secondPassSteps?: number;
    denoisingStrength?: number;
  };
  workflowParameterOverrides?: Record<string, string | number | boolean>;
}

export interface PreparedImageGenerationProbe {
  adapter: ImageGenerationProbeAdapter;
  profile: unknown;
  credential: unknown;
  connectionFingerprint: string;
  executionFingerprint: string;
}

function requireModel(profile: ImageApiProfile, target: ImageGenerationProbeTarget): string {
  if (profile.providerType === 'comfyui-workflow') throw new Error('ComfyUI 使用工作流，不使用模型目录目标。');
  if (!target.modelId?.trim()) throw new Error('真实生成测试必须选择模型。');
  if (!profile.models.some((model) => model.modelId === target.modelId)) {
    throw new Error('真实生成测试模型必须先存在于当前档案模型目录。');
  }
  return target.modelId;
}

function apiKeyCredential(credential?: ImageApiCredential): { apiKey: string } {
  if (!credential) throw new Error('当前图片档案缺少凭据。');
  if (credential.material.kind === 'basic-auth') throw new Error('当前云端后端不接受 Basic 凭据。');
  return {
    apiKey: credential.material.kind === 'bearer-token' ? credential.material.token : credential.material.apiKey
  };
}

function proxyCredential(profile: ImageApiProfile, credential?: ImageApiCredential): ProxyCredential {
  if (profile.providerType !== 'comfyui-workflow' && profile.providerType !== 'sd-webui') {
    throw new Error('只有本地/反向代理后端使用代理凭据。');
  }
  if (profile.config.authMode === 'none') return { mode: 'none' };
  if (!credential) throw new Error('当前认证方式缺少凭据。');
  if (profile.config.authMode === 'basic-auth' && credential.material.kind === 'basic-auth') {
    return { mode: 'basic', username: credential.material.username, password: credential.material.password };
  }
  if (profile.config.authMode === 'bearer-token' && credential.material.kind === 'bearer-token') {
    return { mode: 'bearer', token: credential.material.token };
  }
  if (
    profile.providerType === 'comfyui-workflow' &&
    profile.config.authMode === 'comfy-cloud-api-key' &&
    credential.material.kind === 'api-key-header'
  ) {
    return { mode: 'api-key', apiKey: credential.material.apiKey };
  }
  throw new Error('档案认证方式与凭据材料不匹配。');
}

function pollAttempts(intervalMs: number, durationMs: number): number {
  return Math.max(1, Math.min(240, Math.ceil(durationMs / intervalMs)));
}

export async function prepareImageGenerationProbe(
  profile: ImageApiProfile,
  credential: ImageApiCredential | undefined,
  target: ImageGenerationProbeTarget,
  pageUrl?: string
): Promise<PreparedImageGenerationProbe> {
  if (!Number.isInteger(target.presetRevision) || target.presetRevision < 1) {
    throw new Error('生成测试预设修订号无效。');
  }
  const local = await validateImageProfileLocally(profile, credential, pageUrl);
  if (!local.ok) throw new Error(local.issues.join('；'));
  const connectionFingerprint = await createConnectionFingerprint(profile, credential ? {
    credentialId: credential.credentialId,
    revision: credential.revision
  } : undefined);

  let adapter: ImageGenerationProbeAdapter;
  let probeProfile: unknown;
  let probeCredential: unknown;
  let modelId: string | undefined;
  let workflowHash: string | undefined;

  switch (profile.providerType) {
    case 'openai-images':
      modelId = requireModel(profile, target);
      adapter = new OpenAiImagesProbeAdapter();
      probeProfile = {
        apiBaseUrl: profile.apiBaseUrl,
        apiVariant: profile.config.apiVariant,
        model: modelId,
        n: target.requestedImageCount ?? 1,
        responseFormat: profile.config.resultTransportPreference === 'base64-json'
          ? 'b64_json'
          : profile.config.resultTransportPreference === 'temporary-url' ? 'url' : undefined,
        size: target.size ?? (target.width && target.height ? `${target.width}x${target.height}` : undefined),
        quality: target.quality,
        outputFormat: target.outputFormat,
        outputCompression: target.outputCompression,
        background: target.background
      };
      probeCredential = apiKeyCredential(credential);
      break;
    case 'xai-images':
      modelId = requireModel(profile, target);
      adapter = new XaiImagesProbeAdapter();
      probeProfile = {
        apiBaseUrl: profile.apiBaseUrl,
        model: modelId,
        n: target.requestedImageCount ?? 1,
        aspectRatio: target.aspectRatio,
        resolution: target.resolution
      };
      probeCredential = apiKeyCredential(credential);
      break;
    case 'gemini-image':
      modelId = requireModel(profile, target);
      adapter = new GeminiImageProbeAdapter();
      probeProfile = {
        apiBaseUrl: profile.apiBaseUrl,
        model: modelId,
        apiMode: profile.config.apiMode,
        aspectRatio: target.aspectRatio,
        imageSize: target.imageSize,
        mimeType: target.mimeType ?? 'image/png'
      };
      probeCredential = apiKeyCredential(credential);
      break;
    case 'alibaba-model-studio':
      modelId = requireModel(profile, target);
      adapter = new AlibabaModelStudioProbeAdapter();
      probeProfile = {
        apiBaseUrl: profile.apiBaseUrl,
        model: modelId,
        protocolVariant: profile.config.protocolVariant,
        n: target.requestedImageCount ?? 1,
        size: target.size ?? (target.width && target.height ? `${target.width}*${target.height}` : undefined),
        seed: target.seed,
        watermark: target.watermark,
        promptExtend: target.promptExtend,
        thinkingMode: target.thinkingMode,
        pollIntervalMs: profile.config.pollIntervalMs,
        maxPollAttempts: pollAttempts(profile.config.pollIntervalMs, profile.config.maxPollDurationMs)
      };
      probeCredential = apiKeyCredential(credential);
      break;
    case 'novelai-image':
      if (!profile.config.usageNoticeAcceptedAt) throw new Error('必须先确认 NovelAI 使用提示。');
      modelId = requireModel(profile, target);
      adapter = new NovelAiImageProbeAdapter();
      probeProfile = {
        apiBaseUrl: profile.apiBaseUrl,
        model: modelId,
        responseFormat: profile.config.responseFormat,
        width: target.width ?? 512,
        height: target.height ?? 512,
        steps: target.steps,
        scale: target.cfgScale,
        cfgRescale: target.cfgRescale,
        sampler: target.sampler,
        seed: target.seed,
        noiseSchedule: target.noiseSchedule,
        qualityToggle: target.qualityToggle,
        undesiredContentPreset: target.undesiredContentPreset,
        smea: target.smea,
        smeaDynamic: target.smeaDynamic,
        imageToImageStrength: target.imageToImageStrength,
        imageToImageNoise: target.imageToImageNoise,
        nSamples: target.requestedImageCount ?? 1
      };
      probeCredential = apiKeyCredential(credential);
      break;
    case 'comfyui-workflow': {
      const workflow = target.workflowTemplate;
      if (!workflow) throw new Error('ComfyUI 真实生成测试必须选择 API 工作流模板。');
      const parameterOverrides = resolveComfyWorkflowParameterOverrides(
        workflow,
        target.workflowParameterOverrides
      );
      workflowHash = workflow.workflowHash;
      adapter = new ComfyUiWorkflowProbeAdapter();
      probeProfile = {
        apiBaseUrl: profile.apiBaseUrl,
        deployment: profile.config.deployment,
        authMode: profile.config.authMode,
        workflow: workflow.apiWorkflow,
        bindings: {
          positivePrompt: workflow.bindings.positivePrompt,
          negativePrompt: workflow.bindings.negativePrompt,
          referenceImage: workflow.bindings.referenceImage,
          checkpoint: workflow.bindings.checkpoint,
          seed: workflow.bindings.seed,
          width: workflow.bindings.width,
          height: workflow.bindings.height,
          steps: workflow.bindings.steps,
          cfg: workflow.bindings.cfg,
          sampler: workflow.bindings.sampler,
          scheduler: workflow.bindings.scheduler
        },
        outputNodeIds: workflow.outputNodeIds,
        checkpoint: target.checkpoint,
        width: target.width,
        height: target.height,
        seed: target.seed,
        steps: target.steps,
        cfg: target.cfgScale,
        sampler: target.sampler,
        scheduler: target.scheduler,
        parameterOverrides,
        pollIntervalMs: profile.config.pollIntervalMs,
        maxPollAttempts: pollAttempts(profile.config.pollIntervalMs, profile.config.maxPollDurationMs)
      };
      probeCredential = proxyCredential(profile, credential);
      break;
    }
    case 'sd-webui':
      modelId = requireModel(profile, target);
      adapter = new SdWebUiProbeAdapter();
      probeProfile = {
        apiBaseUrl: profile.apiBaseUrl,
        authMode: profile.config.authMode,
        width: target.width ?? 512,
        height: target.height ?? 512,
        steps: target.steps,
        cfgScale: target.cfgScale,
        samplerName: target.sampler,
        scheduler: target.scheduler,
        seed: target.seed,
        batchSize: target.requestedImageCount ?? 1,
        checkpoint: target.checkpoint ?? modelId,
        clipSkip: target.clipSkip,
        restoreFaces: target.restoreFaces,
        tiling: target.tiling,
        hiresFix: target.hiresFix,
        imageToImageDenoisingStrength: target.imageToImageDenoisingStrength
      };
      probeCredential = proxyCredential(profile, credential);
      break;
  }

  return {
    adapter,
    profile: probeProfile,
    credential: probeCredential,
    connectionFingerprint,
    executionFingerprint: await createExecutionFingerprint({
      connectionFingerprint,
      modelId,
      presetId: target.presetId,
      presetRevision: target.presetRevision,
      workflowHash,
      executionParameters: {
        size: target.size,
        width: target.width,
        height: target.height,
        steps: target.steps,
        cfgScale: target.cfgScale,
        sampler: target.sampler,
        seed: target.seed,
        requestedImageCount: target.requestedImageCount,
        aspectRatio: target.aspectRatio,
        resolution: target.resolution,
        imageSize: target.imageSize,
        mimeType: target.mimeType,
        quality: target.quality,
        outputFormat: target.outputFormat,
        outputCompression: target.outputCompression,
        background: target.background,
        watermark: target.watermark,
        promptExtend: target.promptExtend,
        thinkingMode: target.thinkingMode,
        cfgRescale: target.cfgRescale,
        noiseSchedule: target.noiseSchedule,
        qualityToggle: target.qualityToggle,
        undesiredContentPreset: target.undesiredContentPreset,
        smea: target.smea,
        smeaDynamic: target.smeaDynamic,
        imageToImageStrength: target.imageToImageStrength,
        imageToImageNoise: target.imageToImageNoise,
        imageToImageDenoisingStrength: target.imageToImageDenoisingStrength,
        checkpoint: target.checkpoint,
        scheduler: target.scheduler,
        clipSkip: target.clipSkip,
        restoreFaces: target.restoreFaces,
        tiling: target.tiling,
        hiresFix: target.hiresFix,
        workflowParameterOverrides: target.workflowParameterOverrides
      }
    })
  };
}
