import { z } from 'zod';
import { PNG_STYLE_SOURCE_FORMATS } from './types';
import type {
  ParsedPngGenerationData,
  PngStyleLibrarySettings,
  PngStylePreset
} from './types';

const nonEmpty = (maximum: number) => z.string().trim().min(1).max(maximum);
const text = (maximum: number) => z.string().max(maximum);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

const parsedParametersSchema = z.object({
  sampler: nonEmpty(200).optional(),
  steps: z.number().int().min(1).max(10_000).optional(),
  cfg: z.number().finite().min(0).max(10_000).optional(),
  clipSkip: z.number().int().min(1).max(100).optional(),
  seed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  width: z.number().int().positive().max(100_000).optional(),
  height: z.number().int().positive().max(100_000).optional(),
  model: nonEmpty(1000).optional(),
  loras: z.array(nonEmpty(1000)).max(100).optional()
}).strict();

export const parsedPngGenerationDataSchema: z.ZodType<ParsedPngGenerationData> = z.object({
  source: z.enum(PNG_STYLE_SOURCE_FORMATS),
  positivePrompt: text(200_000),
  negativePrompt: text(100_000),
  parameters: parsedParametersSchema.optional(),
  rawMetadata: text(2 * 1024 * 1024),
  warnings: z.array(nonEmpty(1000)).max(100)
}).strict();

export const pngStyleParameterDraftSchema = z.object({
  sampler: nonEmpty(200).optional(),
  steps: z.number().int().min(1).max(1000).optional(),
  cfg: z.number().finite().min(0).max(1000).optional(),
  clipSkip: z.number().int().min(1).max(100).optional()
}).strict();

const modifierSchema = z.object({
  positive: text(20_000),
  negative: text(20_000)
}).strict();

export const pngStylePresetSchema: z.ZodType<PngStylePreset> = z.object({
  pngStylePresetId: nonEmpty(1000),
  name: nonEmpty(200),
  source: z.object({
    format: z.enum(PNG_STYLE_SOURCE_FORMATS),
    imageHash: sha256,
    parserVersion: z.number().int().min(1).max(10_000)
  }).strict(),
  artistTokens: z.array(nonEmpty(1000)).max(100),
  protectedTokens: z.array(z.object({
    value: nonEmpty(1000),
    kind: z.enum(['model-trigger', 'lora-trigger']),
    enabled: z.boolean()
  }).strict()).max(100),
  tagStyle: modifierSchema,
  naturalLanguageStyle: z.object({
    global: modifierSchema,
    character: modifierSchema,
    scene: modifierSchema
  }).strict(),
  parameterDraft: pngStyleParameterDraftSchema.optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
}).strict().superRefine((preset, context) => {
  const literalTokens = [...preset.artistTokens, ...preset.protectedTokens.map((token) => token.value)];
  const normalized = new Set<string>();
  literalTokens.forEach((token, index) => {
    const key = token.trim().toLocaleLowerCase('en-US');
    if (normalized.has(key)) {
      context.addIssue({
        code: 'custom',
        path: index < preset.artistTokens.length
          ? ['artistTokens', index]
          : ['protectedTokens', index - preset.artistTokens.length, 'value'],
        message: '画师或受保护触发词不得重复'
      });
    }
    normalized.add(key);
  });
});

const pngStyleSelectionSchema = z.object({
  globalPngStylePresetId: nonEmpty(1000).optional(),
  characterPngStylePresetId: nonEmpty(1000).optional(),
  narrativeScenePngStylePresetId: nonEmpty(1000).optional()
}).strict();

export const pngStyleLibrarySettingsSchema: z.ZodType<PngStyleLibrarySettings> = z.object({
  settingsId: z.literal('global-png-style-library'),
  revision: z.number().int().min(1),
  presets: z.array(pngStylePresetSchema).max(500),
  selection: pngStyleSelectionSchema,
  updatedAt: z.string().datetime({ offset: true })
}).strict().superRefine((settings, context) => {
  const ids = new Set<string>();
  settings.presets.forEach((preset, index) => {
    if (ids.has(preset.pngStylePresetId)) {
      context.addIssue({
        code: 'custom',
        path: ['presets', index, 'pngStylePresetId'],
        message: 'PNG 画风预设 ID 不得重复'
      });
    }
    ids.add(preset.pngStylePresetId);
  });
  for (const [key, value] of Object.entries(settings.selection)) {
    if (value && !ids.has(value)) {
      context.addIssue({
        code: 'custom',
        path: ['selection', key],
        message: 'PNG 画风选择引用了不存在的预设'
      });
    }
  }
});
