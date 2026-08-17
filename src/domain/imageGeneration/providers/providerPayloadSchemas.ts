import { z } from 'zod';
import { ImageProbeProtocolError } from '../probe';
import { isNovelAiV4Model, NOVEL_AI_MAX_SEED } from './novelAiRequestContract';

const optionalText = z.string().optional();
const imageItemSchema = z.object({
  b64_json: optionalText,
  base64: optionalText,
  data: optionalText,
  url: optionalText,
  uri: optionalText,
  mime_type: optionalText
}).passthrough();

export const openAiImagesRequestSchema = z.object({
  model: z.string(),
  prompt: z.string(),
  n: z.number().int(),
  response_format: z.enum(['url', 'b64_json']).optional(),
  size: optionalText,
  quality: optionalText,
  output_format: z.enum(['png', 'jpeg', 'webp']).optional(),
  output_compression: z.number().int().min(0).max(100).optional(),
  background: z.enum(['auto', 'opaque', 'transparent']).optional()
}).strict();

export const xaiImagesRequestSchema = z.object({
  model: z.string(),
  prompt: z.string(),
  n: z.number().int(),
  response_format: z.literal('b64_json'),
  aspect_ratio: optionalText,
  resolution: optionalText
}).strict();

export const xaiImageEditRequestSchema = z.object({
  model: z.string(),
  prompt: z.string(),
  image: z.object({
    url: z.string(),
    type: z.literal('image_url')
  }).strict()
}).strict();

export const openAiFamilyResponseSchema = z.object({
  id: optionalText,
  data: z.array(imageItemSchema).optional()
}).passthrough();

const geminiImageFormatSchema = z.object({
  type: z.literal('image'),
  mime_type: z.enum(['image/png', 'image/jpeg']),
  aspect_ratio: optionalText,
  image_size: z.enum(['0.5K', '1K', '2K', '4K']).optional()
}).strict();

export const geminiInteractionsRequestSchema = z.object({
  model: z.string(),
  input: z.array(z.union([
    z.object({ type: z.literal('text'), text: z.string() }).strict(),
    z.object({
      type: z.literal('image'),
      mime_type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
      data: z.string()
    }).strict()
  ])),
  response_format: geminiImageFormatSchema,
  store: z.literal(false)
}).strict();

export const geminiLegacyRequestSchema = z.object({
  contents: z.array(z.object({
    role: z.literal('user'),
    parts: z.array(z.union([
      z.object({ text: z.string() }).strict(),
      z.object({
        inlineData: z.object({
          mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
          data: z.string()
        }).strict()
      }).strict()
    ]))
  }).strict()),
  generationConfig: z.object({
    responseModalities: z.tuple([z.literal('IMAGE')]),
    imageConfig: z.object({
      aspectRatio: optionalText,
      imageSize: z.enum(['0.5K', '1K', '2K', '4K']).optional()
    }).strict().optional()
  }).strict()
}).strict();

const geminiContentBlockSchema = z.object({
  type: optionalText,
  data: optionalText,
  uri: optionalText,
  mime_type: optionalText
}).passthrough();

export const geminiInteractionsResponseSchema = z.object({
  id: optionalText,
  steps: z.array(z.object({
    type: optionalText,
    content: z.array(geminiContentBlockSchema).optional()
  }).passthrough()).optional(),
  output_image: geminiContentBlockSchema.optional()
}).passthrough();

export const geminiLegacyResponseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.record(z.string(), z.unknown())).optional() }).passthrough().optional()
  }).passthrough()).optional()
}).passthrough();

const alibabaParametersSchema = z.object({
  n: z.number().int(),
  size: optionalText,
  negative_prompt: optionalText,
  seed: z.number().int().optional(),
  watermark: z.boolean().optional(),
  prompt_extend: z.boolean().optional(),
  thinking_mode: z.boolean().optional()
}).strict();

export const alibabaRequestSchema = z.union([
  z.object({
    model: z.string(),
    input: z.object({ prompt: z.string() }).strict(),
    parameters: alibabaParametersSchema
  }).strict(),
  z.object({
    model: z.string(),
    input: z.object({
      messages: z.array(z.object({
        role: z.literal('user'),
        content: z.array(z.union([
          z.object({ text: z.string() }).strict(),
          z.object({ image: z.string() }).strict()
        ]))
      }).strict())
    }).strict(),
    parameters: alibabaParametersSchema
  }).strict()
]);

export const alibabaResponseSchema = z.object({
  request_id: optionalText,
  task_id: optionalText,
  task_status: optionalText,
  output: z.object({
    task_id: optionalText,
    task_status: optionalText,
    message: z.unknown().optional(),
    choices: z.array(z.object({
      message: z.object({ content: z.array(z.record(z.string(), z.unknown())).optional() }).passthrough().optional()
    }).passthrough()).optional(),
    results: z.array(z.record(z.string(), z.unknown())).optional()
  }).passthrough().optional()
}).passthrough();

const novelAiCharacterCaptionSchema = z.object({
  char_caption: z.string(),
  centers: z.array(z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1)
  }).strict()).min(1).max(1)
}).strict();

const novelAiV4PromptSchema = z.object({
  caption: z.object({
    base_caption: z.string(),
    char_captions: z.array(novelAiCharacterCaptionSchema)
  }).strict(),
  use_coords: z.boolean(),
  use_order: z.boolean(),
  legacy_uc: z.boolean()
}).strict();

const novelAiParametersSchema = z.object({
  params_version: z.literal(3),
  width: z.number().int().min(64).max(4096),
  height: z.number().int().min(64).max(4096),
  n_samples: z.number().int().min(1).max(4),
  uc: z.string(),
  steps: z.number().int().min(1).max(100),
  scale: z.number().min(0).max(50),
  cfg_rescale: z.number().min(0).max(1),
  sampler: z.string().trim().min(1).max(100),
  seed: z.number().int().min(0).max(NOVEL_AI_MAX_SEED),
  noise_schedule: z.string().trim().min(1).max(100),
  qualityToggle: z.boolean(),
  ucPreset: z.number().int().min(0).max(100),
  sm: z.boolean(),
  sm_dyn: z.boolean(),
  legacy_v3_extend: z.boolean(),
  dynamic_thresholding: z.boolean(),
  v4_prompt: novelAiV4PromptSchema.optional(),
  v4_negative_prompt: novelAiV4PromptSchema.optional(),
  image: optionalText,
  strength: z.number().min(0).max(1).optional(),
  noise: z.number().min(0).max(1).optional()
}).strict();

export const novelAiRequestSchema = z.object({
  input: z.string().trim().min(1),
  model: z.string().trim().min(1),
  action: z.literal('generate'),
  parameters: novelAiParametersSchema
}).strict().superRefine((request, context) => {
  const expectsV4Prompt = isNovelAiV4Model(request.model);
  const hasV4Prompt = request.parameters.v4_prompt !== undefined;
  const hasV4NegativePrompt = request.parameters.v4_negative_prompt !== undefined;
  if (expectsV4Prompt && (!hasV4Prompt || !hasV4NegativePrompt)) {
    context.addIssue({
      code: 'custom',
      path: ['parameters'],
      message: 'NovelAI V4/V4.5 请求必须同时提供正向与负向 V4 提示词'
    });
    return;
  }
  if (!expectsV4Prompt && (hasV4Prompt || hasV4NegativePrompt)) {
    context.addIssue({
      code: 'custom',
      path: ['parameters'],
      message: 'NovelAI V3/旧模型不得携带 V4 专用提示词字段'
    });
    return;
  }
  if (!expectsV4Prompt) return;
  if (request.parameters.v4_prompt?.caption.base_caption !== request.input) {
    context.addIssue({
      code: 'custom',
      path: ['parameters', 'v4_prompt', 'caption', 'base_caption'],
      message: 'NovelAI V4 正向提示词必须与顶层 input 一致'
    });
  }
  if (request.parameters.v4_negative_prompt?.caption.base_caption !== request.parameters.uc) {
    context.addIssue({
      code: 'custom',
      path: ['parameters', 'v4_negative_prompt', 'caption', 'base_caption'],
      message: 'NovelAI V4 负向提示词必须与 parameters.uc 一致'
    });
  }
});

export const novelAiResponseSchema = z.object({
  images: z.array(z.union([z.string(), imageItemSchema])).optional(),
  data: z.array(z.union([z.string(), imageItemSchema])).optional()
}).passthrough();

export const comfySubmitRequestSchema = z.object({
  prompt: z.record(z.string(), z.unknown())
}).strict();

export const comfySubmitResponseSchema = z.object({
  prompt_id: optionalText,
  promptId: optionalText,
  id: optionalText
}).passthrough();

export const comfyHistoryResponseSchema = z.record(z.string(), z.unknown());

export const sdWebUiRequestSchema = z.object({
  prompt: z.string(),
  negative_prompt: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  batch_size: z.number().int(),
  steps: z.number().int().optional(),
  cfg_scale: z.number().optional(),
  sampler_name: optionalText,
  scheduler: optionalText,
  seed: z.number().int().optional(),
  restore_faces: z.boolean().optional(),
  tiling: z.boolean().optional(),
  enable_hr: z.boolean().optional(),
  hr_scale: z.number().optional(),
  hr_upscaler: optionalText,
  hr_second_pass_steps: z.number().int().optional(),
  denoising_strength: z.number().optional(),
  init_images: z.array(z.string()).max(1).optional(),
  override_settings: z.object({
    sd_model_checkpoint: z.string().optional(),
    CLIP_stop_at_last_layers: z.number().int().optional()
  }).strict().optional()
}).strict();

export const sdWebUiResponseSchema = z.object({
  images: z.array(z.string()).optional()
}).passthrough();

export function parseProviderRequest<T>(schema: z.ZodType<T>, value: unknown, providerLabel: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ImageProbeProtocolError(
      'provider-request-contract-violation',
      'configuration',
      `${providerLabel} 请求没有通过内部安全字段契约。`
    );
  }
  return result.data;
}

export function parseProviderResponse<T>(schema: z.ZodType<T>, value: unknown, providerLabel: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ImageProbeProtocolError(
      'provider-response-contract-violation',
      'invalid-response',
      `${providerLabel} 返回了不符合预期结构的响应。`
    );
  }
  return result.data;
}
