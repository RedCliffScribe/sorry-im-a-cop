import { z } from 'zod';
import type { ImageProbeGenerationInput, ImageProfileValidationResult } from '../probe';
import { NOVEL_AI_MAX_SEED } from './novelAiRequestContract';

const httpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, '必须是 http:// 或 https:// 地址');

const modelSchema = z.string().trim().min(1).max(200);
const imageCountSchema = z.number().int().min(1).max(4).default(1);
const pollFields = {
  pollIntervalMs: z.number().int().min(0).max(30_000).default(1_000),
  maxPollAttempts: z.number().int().min(1).max(240).default(120)
};

export const apiKeyCredentialSchema = z.object({ apiKey: z.string().min(1).max(4096) }).strict();

export const proxyCredentialSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }).strict(),
  z.object({
    mode: z.literal('basic'),
    username: z.string().max(512).refine((value) => !value.includes(':'), 'Basic 用户名不能包含冒号'),
    password: z.string().max(4096)
  }).strict(),
  z.object({ mode: z.literal('bearer'), token: z.string().min(1).max(4096) }).strict(),
  z.object({ mode: z.literal('api-key'), apiKey: z.string().min(1).max(4096) }).strict()
]);

export const openAiProbeProfileSchema = z.object({
  apiBaseUrl: httpUrlSchema,
  apiVariant: z.enum(['openai-official', 'openai-compatible']).default('openai-official'),
  model: modelSchema,
  n: imageCountSchema,
  responseFormat: z.enum(['url', 'b64_json']).optional(),
  size: z.string().trim().min(1).max(64).optional(),
  quality: z.string().trim().min(1).max(64).optional(),
  outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
  outputCompression: z.number().int().min(0).max(100).optional(),
  background: z.enum(['auto', 'opaque', 'transparent']).optional()
}).strict();

export const xaiProbeProfileSchema = z.object({
  apiBaseUrl: httpUrlSchema,
  model: modelSchema,
  n: imageCountSchema,
  aspectRatio: z.string().trim().min(1).max(32).optional(),
  resolution: z.string().trim().min(1).max(32).optional()
}).strict();

export const geminiProbeProfileSchema = z.object({
  apiBaseUrl: httpUrlSchema,
  model: modelSchema,
  apiMode: z.enum(['interactions', 'generate-content-legacy']),
  aspectRatio: z.string().trim().min(1).max(32).optional(),
  imageSize: z.enum(['0.5K', '1K', '2K', '4K']).optional(),
  mimeType: z.enum(['image/png', 'image/jpeg']).default('image/png')
}).strict();

export const alibabaProbeProfileSchema = z.object({
  apiBaseUrl: httpUrlSchema,
  model: modelSchema,
  protocolVariant: z.enum([
    'multimodal-generation-sync',
    'image-generation-async',
    'legacy-text2image-async'
  ]),
  size: z.string().trim().min(1).max(64).optional(),
  n: imageCountSchema,
  seed: z.number().int().min(0).max(0x7fffffff).optional(),
  watermark: z.boolean().optional(),
  promptExtend: z.boolean().optional(),
  thinkingMode: z.boolean().optional(),
  ...pollFields
}).strict();

export const novelAiProbeProfileSchema = z.object({
  apiBaseUrl: httpUrlSchema,
  model: modelSchema,
  responseFormat: z.enum(['json-base64', 'zip', 'auto']).default('auto'),
  width: z.number().int().min(64).max(4096),
  height: z.number().int().min(64).max(4096),
  steps: z.number().int().min(1).max(100).optional(),
  scale: z.number().min(0).max(50).optional(),
  cfgRescale: z.number().min(0).max(1).optional(),
  sampler: z.string().trim().min(1).max(100).optional(),
  seed: z.number().int().min(0).max(NOVEL_AI_MAX_SEED).optional(),
  noiseSchedule: z.string().trim().min(1).max(100).optional(),
  qualityToggle: z.boolean().optional(),
  undesiredContentPreset: z.number().int().min(0).max(100).optional(),
  smea: z.boolean().optional(),
  smeaDynamic: z.boolean().optional(),
  imageToImageStrength: z.number().min(0).max(1).optional(),
  imageToImageNoise: z.number().min(0).max(1).optional(),
  nSamples: imageCountSchema
}).strict();

const comfyInputBindingSchema = z.object({
  nodeId: z.string().min(1).max(200),
  inputName: z.string().min(1).max(200)
}).strict();

const comfyParameterOverrideSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/),
  binding: comfyInputBindingSchema,
  value: z.union([z.string().max(2000), z.number().finite(), z.boolean()])
}).strict();

const comfyNodeSchema = z.object({
  class_type: z.string().min(1).max(500),
  inputs: z.record(z.string(), z.unknown())
}).passthrough();

export const comfyUiProbeProfileSchema = z.object({
  apiBaseUrl: httpUrlSchema,
  deployment: z.enum(['core-server', 'comfy-cloud']),
  authMode: z.enum(['none', 'comfy-cloud-api-key', 'basic-auth', 'bearer-token']),
  workflow: z.record(z.string(), comfyNodeSchema).refine((value) => Object.keys(value).length > 0, '工作流不能为空'),
  bindings: z.object({
    positivePrompt: comfyInputBindingSchema,
    negativePrompt: comfyInputBindingSchema.optional(),
    referenceImage: comfyInputBindingSchema.optional(),
    checkpoint: comfyInputBindingSchema.optional(),
    seed: comfyInputBindingSchema.optional(),
    width: comfyInputBindingSchema.optional(),
    height: comfyInputBindingSchema.optional(),
    steps: comfyInputBindingSchema.optional(),
    cfg: comfyInputBindingSchema.optional(),
    sampler: comfyInputBindingSchema.optional(),
    scheduler: comfyInputBindingSchema.optional()
  }).strict(),
  outputNodeIds: z.array(z.string().min(1).max(200)).min(1).max(32),
  width: z.number().int().min(64).max(8192).optional(),
  height: z.number().int().min(64).max(8192).optional(),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  checkpoint: z.string().trim().min(1).max(500).optional(),
  steps: z.number().int().min(1).max(150).optional(),
  cfg: z.number().min(0).max(50).optional(),
  sampler: z.string().trim().min(1).max(200).optional(),
  scheduler: z.string().trim().min(1).max(200).optional(),
  parameterOverrides: z.array(comfyParameterOverrideSchema).max(64).optional(),
  ...pollFields
}).strict();

export const sdWebUiProbeProfileSchema = z.object({
  apiBaseUrl: httpUrlSchema,
  authMode: z.enum(['none', 'basic-auth', 'bearer-token']),
  width: z.number().int().min(64).max(8192),
  height: z.number().int().min(64).max(8192),
  steps: z.number().int().min(1).max(150).optional(),
  cfgScale: z.number().min(0).max(50).optional(),
  samplerName: z.string().trim().min(1).max(200).optional(),
  scheduler: z.string().trim().min(1).max(200).optional(),
  seed: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER).optional(),
  batchSize: imageCountSchema,
  checkpoint: z.string().trim().min(1).max(500).optional(),
  clipSkip: z.number().int().min(1).max(24).optional(),
  restoreFaces: z.boolean().optional(),
  tiling: z.boolean().optional(),
  hiresFix: z.object({
    enabled: z.boolean(),
    scale: z.number().min(1).max(8).optional(),
    upscaler: z.string().trim().min(1).max(200).optional(),
    secondPassSteps: z.number().int().min(0).max(150).optional(),
    denoisingStrength: z.number().min(0).max(1).optional()
  }).strict().optional(),
  imageToImageDenoisingStrength: z.number().min(0).max(1).optional()
}).strict();

export type OpenAiProbeProfile = z.infer<typeof openAiProbeProfileSchema>;
export type XaiProbeProfile = z.infer<typeof xaiProbeProfileSchema>;
export type GeminiProbeProfile = z.infer<typeof geminiProbeProfileSchema>;
export type AlibabaProbeProfile = z.infer<typeof alibabaProbeProfileSchema>;
export type NovelAiProbeProfile = z.infer<typeof novelAiProbeProfileSchema>;
export type ComfyUiProbeProfile = z.infer<typeof comfyUiProbeProfileSchema>;
export type SdWebUiProbeProfile = z.infer<typeof sdWebUiProbeProfileSchema>;
export type ApiKeyCredential = z.infer<typeof apiKeyCredentialSchema>;
export type ProxyCredential = z.infer<typeof proxyCredentialSchema>;

export function validateProbeInput(
  input: ImageProbeGenerationInput,
  profileSchema: z.ZodType,
  credentialSchema: z.ZodType
): ImageProfileValidationResult {
  const issues: Array<{ path: string; message: string }> = [];
  const profile = profileSchema.safeParse(input.profile);
  const credential = credentialSchema.safeParse(input.credential);
  if (!profile.success) {
    issues.push(...profile.error.issues.map((issue) => ({
      path: `profile.${issue.path.join('.')}`.replace(/\.$/, ''),
      message: issue.message
    })));
  }
  if (!credential.success) {
    issues.push(...credential.error.issues.map((issue) => ({
      path: `credential.${issue.path.join('.')}`.replace(/\.$/, ''),
      message: issue.message
    })));
  }
  if (!input.prompt.trim()) issues.push({ path: 'prompt', message: '提示词不能为空' });
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
