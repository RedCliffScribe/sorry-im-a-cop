import { z } from 'zod';
import {
  WORKSHOP_PACKAGE_FORMAT,
  WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET,
  WORKSHOP_PACKAGE_MAX_BYTES,
  WORKSHOP_PACKAGE_SCHEMA_VERSION,
  workshopManifestV1Schema
} from './workshopMetadataV1.js';

export const WORKSHOP_IMAGE_PROVIDER_TYPES = [
  'openai-images',
  'xai-images',
  'gemini-image',
  'alibaba-model-studio',
  'novelai-image',
  'comfyui-workflow',
  'sd-webui'
];

export const WORKSHOP_VISUAL_PURPOSES = [
  'avatar-close-up',
  'half-body-medium',
  'knee-up-medium-full',
  'full-body',
  'narrative-scene'
];

export const WORKSHOP_PROMPT_DIALECT_FAMILIES = [
  'general-english-natural',
  'openai-gpt-image',
  'gemini-image',
  'chinese-natural',
  'generic-english-tags',
  'sd-sdxl',
  'pony',
  'illustrious',
  'novelai',
  'flux'
];

export const WORKSHOP_REQUIRED_FEATURES = [
  'negative-prompt',
  'reference-image',
  'transparent-background',
  'multiple-outputs',
  'custom-dimensions',
  'custom-aspect-ratio',
  'model-family-hint',
  'comfy-style-recipe'
];

export const WORKSHOP_PACKAGE_ERROR_CODES = [
  'invalid-json',
  'package-too-large',
  'invalid-package',
  'unsupported-schema',
  'sensitive-content',
  'structure-too-complex'
];

const MAX_STRUCTURE_DEPTH = 16;
const MAX_STRUCTURE_NODES = 10_000;
const MAX_PROMPT_LENGTH = 64 * 1024;
const packageRef = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const promptText = z.string().max(MAX_PROMPT_LENGTH);
const nonEmptyText = (maximum) => z.string().trim().min(1).max(maximum);
const requestedImageCount = z.number().int().min(1).max(4);
const imageDimension = z.number().int().min(64).max(8192);
const aspectRatio = z.string().trim().regex(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/).max(32);

const addDuplicateIssues = (values, getKey, context, pathPrefix, message) => {
  const seen = new Set();
  values.forEach((value, index) => {
    const key = getKey(value);
    if (seen.has(key)) {
      context.addIssue({ code: 'custom', path: [...pathPrefix, index], message });
    }
    seen.add(key);
  });
};

const uniqueStringArray = (itemSchema, maximum, message) => z.array(itemSchema)
  .max(maximum)
  .superRefine((values, context) => addDuplicateIssues(
    values,
    (value) => value.toLocaleLowerCase('en-US'),
    context,
    [],
    message
  ));

const promptModifierSchema = z.object({
  positive: promptText,
  negative: promptText
}).strict();

const stylePresetSchema = z.object({
  styleRef: packageRef,
  name: nonEmptyText(200),
  description: z.string().max(2000),
  modifiers: z.object({
    global: promptModifierSchema,
    character: promptModifierSchema,
    narrativeScene: promptModifierSchema
  }).strict()
}).strict();

const dialectPresetSchema = z.object({
  dialectRef: packageRef,
  name: nonEmptyText(200),
  description: z.string().max(2000),
  family: z.enum(WORKSHOP_PROMPT_DIALECT_FAMILIES),
  renderingInstruction: promptText,
  positivePrefix: promptText,
  positiveSuffix: promptText,
  negativePrefix: promptText,
  negativeSuffix: promptText
}).strict();

const comfyStyleResourceHintSchema = z.object({
  resourceRef: packageRef,
  kind: z.enum(['checkpoint-family', 'lora-family']),
  label: nonEmptyText(200),
  familyHint: nonEmptyText(200),
  required: z.boolean(),
  triggerWords: z.string().max(2000).optional(),
  recommendedModelStrength: z.number().min(-10).max(10).optional(),
  recommendedClipStrength: z.number().min(-10).max(10).optional()
}).strict().superRefine((resource, context) => {
  if (resource.kind === 'checkpoint-family' && (
    resource.triggerWords !== undefined
    || resource.recommendedModelStrength !== undefined
    || resource.recommendedClipStrength !== undefined
  )) {
    context.addIssue({
      code: 'custom',
      path: ['kind'],
      message: 'checkpoint-family 不允许携带 LoRA 触发词或强度'
    });
  }
});

const comfyStyleRecipeSchema = z.object({
  recipeRef: packageRef,
  name: nonEmptyText(200),
  description: z.string().max(2000),
  compatiblePurposes: uniqueStringArray(
    z.enum(['character', 'narrative-scene']),
    2,
    '适用用途不能重复'
  ).min(1),
  companionStyleRef: packageRef,
  dialectRef: packageRef,
  resourceHints: z.array(comfyStyleResourceHintSchema).min(1).max(16)
    .superRefine((values, context) => addDuplicateIssues(
      values,
      (value) => value.resourceRef,
      context,
      [],
      '资源提示引用不能重复'
    )),
  recommendedParameters: z.object({
    steps: z.number().int().min(1).max(200).optional(),
    cfg: z.number().min(0).max(100).optional(),
    sampler: nonEmptyText(200).optional(),
    scheduler: nonEmptyText(200).optional()
  }).strict()
}).strict();

const openAiSafeParametersSchema = z.object({
  providerType: z.literal('openai-images'),
  requestedImageCount: requestedImageCount.optional(),
  size: z.union([
    z.object({ mode: z.literal('auto') }).strict(),
    z.object({ mode: z.literal('dimensions'), width: imageDimension, height: imageDimension }).strict()
  ]).optional(),
  quality: z.enum(['auto', 'low', 'medium', 'high']).optional(),
  outputFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
  outputCompression: z.number().int().min(0).max(100).optional(),
  background: z.enum(['auto', 'opaque', 'transparent']).optional()
}).strict().superRefine((parameters, context) => {
  if (
    parameters.outputCompression !== undefined
    && parameters.outputFormat !== 'jpeg'
    && parameters.outputFormat !== 'webp'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['outputCompression'],
      message: '压缩质量只适用于 JPEG 或 WebP 输出'
    });
  }
});

const xaiSafeParametersSchema = z.object({
  providerType: z.literal('xai-images'),
  requestedImageCount: requestedImageCount.optional(),
  aspectRatio: z.enum([
    'auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3',
    '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20'
  ]).optional(),
  resolution: z.enum(['1k', '2k']).optional()
}).strict();

const geminiSafeParametersSchema = z.object({
  providerType: z.literal('gemini-image'),
  requestedImageCount: z.literal(1).optional(),
  aspectRatio: nonEmptyText(32).optional(),
  imageSize: z.enum(['0.5K', '1K', '2K', '4K']).optional(),
  mimeType: z.enum(['image/png', 'image/jpeg']).optional()
}).strict();

const alibabaSizeSchema = z.union([
  z.object({ mode: z.literal('provider-default') }).strict(),
  z.object({ mode: z.literal('resolution-tier'), value: z.enum(['1K', '2K', '4K']) }).strict(),
  z.object({ mode: z.literal('dimensions'), width: imageDimension, height: imageDimension }).strict(),
  z.object({ mode: z.literal('fixed-preset'), value: nonEmptyText(100) }).strict()
]);

const alibabaSafeParametersSchema = z.object({
  providerType: z.literal('alibaba-model-studio'),
  requestedImageCount: requestedImageCount.optional(),
  size: alibabaSizeSchema.optional(),
  watermark: z.enum(['provider-default', 'enabled', 'disabled']).optional(),
  promptEnhancement: z.enum(['provider-default', 'enabled', 'disabled']).optional(),
  thinkingMode: z.enum(['provider-default', 'enabled', 'disabled']).optional()
}).strict();

const novelAiSafeParametersSchema = z.object({
  providerType: z.literal('novelai-image'),
  requestedImageCount: requestedImageCount.optional(),
  width: imageDimension.optional(),
  height: imageDimension.optional(),
  sampler: nonEmptyText(200).optional(),
  steps: z.number().int().min(1).max(200).optional(),
  guidanceScale: z.number().min(0).max(100).optional(),
  cfgRescale: z.number().min(0).max(100).optional(),
  noiseSchedule: nonEmptyText(200).optional(),
  qualityToggle: z.boolean().optional(),
  undesiredContentPreset: z.number().int().min(0).max(10_000).optional(),
  smea: z.boolean().optional(),
  smeaDynamic: z.boolean().optional()
}).strict();

const comfySafeParametersSchema = z.object({
  providerType: z.literal('comfyui-workflow'),
  width: imageDimension.optional(),
  height: imageDimension.optional(),
  steps: z.number().int().min(1).max(200).optional(),
  cfg: z.number().min(0).max(100).optional(),
  sampler: nonEmptyText(200).optional(),
  scheduler: nonEmptyText(200).optional()
}).strict();

const sdWebUiSafeParametersSchema = z.object({
  providerType: z.literal('sd-webui'),
  requestedImageCount: requestedImageCount.optional(),
  width: imageDimension.optional(),
  height: imageDimension.optional(),
  samplerName: nonEmptyText(200).optional(),
  scheduler: nonEmptyText(200).optional(),
  steps: z.number().int().min(1).max(200).optional(),
  cfgScale: z.number().min(0).max(100).optional(),
  clipSkip: z.number().int().min(1).max(12).optional(),
  restoreFaces: z.boolean().optional(),
  tiling: z.boolean().optional(),
  hiresFix: z.object({
    enabled: z.boolean(),
    scale: z.number().min(1).max(4).optional(),
    upscaler: nonEmptyText(200).optional(),
    secondPassSteps: z.number().int().min(1).max(200).optional(),
    denoisingStrength: z.number().min(0).max(1).optional()
  }).strict().optional()
}).strict();

export const workshopSafeGenerationParametersV1Schema = z.discriminatedUnion('providerType', [
  openAiSafeParametersSchema,
  xaiSafeParametersSchema,
  geminiSafeParametersSchema,
  alibabaSafeParametersSchema,
  novelAiSafeParametersSchema,
  comfySafeParametersSchema,
  sdWebUiSafeParametersSchema
]);

const variantSchema = z.object({
  variantRef: packageRef,
  purpose: z.enum(WORKSHOP_VISUAL_PURPOSES),
  name: nonEmptyText(200),
  providerType: z.enum(WORKSHOP_IMAGE_PROVIDER_TYPES),
  modelHint: nonEmptyText(200).optional(),
  dialectRef: packageRef.optional(),
  styleRefs: uniqueStringArray(packageRef, 16, '风格引用不能重复'),
  comfyStyleRecipeRef: packageRef.optional(),
  targetAspectRatio: aspectRatio.optional()
}).strict().superRefine((variant, context) => {
  if (variant.comfyStyleRecipeRef !== undefined && variant.providerType !== 'comfyui-workflow') {
    context.addIssue({
      code: 'custom',
      path: ['comfyStyleRecipeRef'],
      message: '只有 comfyui-workflow 变体可以引用 ComfyUI 风格配方'
    });
  }
});

const safeParametersEntrySchema = z.object({
  variantRef: packageRef,
  parameters: workshopSafeGenerationParametersV1Schema
}).strict();

const styleSelectionSchema = z.object({
  globalStyleRef: packageRef.optional(),
  characterStyleRef: packageRef.optional(),
  narrativeSceneStyleRef: packageRef.optional(),
  characterStyleMode: z.enum(['inherit-global', 'replace-global']).optional(),
  narrativeSceneStyleMode: z.enum(['inherit-global', 'replace-global']).optional()
}).strict();

const compatibilitySchema = z.object({
  providerTypes: uniqueStringArray(
    z.enum(WORKSHOP_IMAGE_PROVIDER_TYPES),
    WORKSHOP_IMAGE_PROVIDER_TYPES.length,
    '供应商类型不能重复'
  ).min(1),
  modelHints: uniqueStringArray(nonEmptyText(200), 32, '模型提示不能重复'),
  requiredFeatures: uniqueStringArray(
    z.enum(WORKSHOP_REQUIRED_FEATURES),
    WORKSHOP_REQUIRED_FEATURES.length,
    '必要能力不能重复'
  )
}).strict();

const contentSchema = z.object({
  variants: z.array(variantSchema).min(1).max(16),
  stylePresets: z.array(stylePresetSchema).max(16),
  dialectPresets: z.array(dialectPresetSchema).max(8),
  comfyStyleRecipes: z.array(comfyStyleRecipeSchema).max(8),
  styleSelection: styleSelectionSchema,
  safeGenerationParameters: z.array(safeParametersEntrySchema).min(1).max(16)
}).strict();

export const imageGenerationPresetPackageV1Schema = z.object({
  format: z.literal(WORKSHOP_PACKAGE_FORMAT),
  schemaVersion: z.literal(WORKSHOP_PACKAGE_SCHEMA_VERSION),
  kind: z.literal(WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET),
  manifest: workshopManifestV1Schema,
  compatibility: compatibilitySchema,
  content: contentSchema
}).strict().superRefine((workshopPackage, context) => {
  const { compatibility, content } = workshopPackage;
  addDuplicateIssues(content.variants, (value) => value.variantRef, context, ['content', 'variants'], '变体引用不能重复');
  addDuplicateIssues(content.stylePresets, (value) => value.styleRef, context, ['content', 'stylePresets'], '风格引用不能重复');
  addDuplicateIssues(content.dialectPresets, (value) => value.dialectRef, context, ['content', 'dialectPresets'], '方言引用不能重复');
  addDuplicateIssues(content.comfyStyleRecipes, (value) => value.recipeRef, context, ['content', 'comfyStyleRecipes'], '配方引用不能重复');
  addDuplicateIssues(content.safeGenerationParameters, (value) => value.variantRef, context, ['content', 'safeGenerationParameters'], '生成参数变体引用不能重复');

  const variantByRef = new Map(content.variants.map((variant) => [variant.variantRef, variant]));
  const styleRefs = new Set(content.stylePresets.map((preset) => preset.styleRef));
  const dialectRefs = new Set(content.dialectPresets.map((preset) => preset.dialectRef));
  const recipeRefs = new Set(content.comfyStyleRecipes.map((recipe) => recipe.recipeRef));
  const parameterRefs = new Set(content.safeGenerationParameters.map((entry) => entry.variantRef));
  const usedStyleRefs = new Set();
  const usedDialectRefs = new Set();
  const usedRecipeRefs = new Set();

  content.variants.forEach((variant, index) => {
    if (!compatibility.providerTypes.includes(variant.providerType)) {
      context.addIssue({
        code: 'custom',
        path: ['content', 'variants', index, 'providerType'],
        message: '变体供应商必须出现在 compatibility.providerTypes 中'
      });
    }
    if (!parameterRefs.has(variant.variantRef)) {
      context.addIssue({
        code: 'custom',
        path: ['content', 'variants', index, 'variantRef'],
        message: '每个变体必须有且只有一组安全生成参数'
      });
    }
    variant.styleRefs.forEach((styleRef, styleIndex) => {
      usedStyleRefs.add(styleRef);
      if (!styleRefs.has(styleRef)) {
        context.addIssue({
          code: 'custom',
          path: ['content', 'variants', index, 'styleRefs', styleIndex],
          message: '变体引用了包内不存在的风格'
        });
      }
    });
    if (variant.dialectRef !== undefined) {
      usedDialectRefs.add(variant.dialectRef);
      if (!dialectRefs.has(variant.dialectRef)) {
        context.addIssue({
          code: 'custom',
          path: ['content', 'variants', index, 'dialectRef'],
          message: '变体引用了包内不存在的方言'
        });
      }
    }
    if (variant.comfyStyleRecipeRef !== undefined) {
      usedRecipeRefs.add(variant.comfyStyleRecipeRef);
      if (!recipeRefs.has(variant.comfyStyleRecipeRef)) {
        context.addIssue({
          code: 'custom',
          path: ['content', 'variants', index, 'comfyStyleRecipeRef'],
          message: '变体引用了包内不存在的 ComfyUI 风格配方'
        });
      }
    }
  });

  content.safeGenerationParameters.forEach((entry, index) => {
    const variant = variantByRef.get(entry.variantRef);
    if (!variant) {
      context.addIssue({
        code: 'custom',
        path: ['content', 'safeGenerationParameters', index, 'variantRef'],
        message: '安全生成参数引用了包内不存在的变体'
      });
      return;
    }
    if (variant.providerType !== entry.parameters.providerType) {
      context.addIssue({
        code: 'custom',
        path: ['content', 'safeGenerationParameters', index, 'parameters', 'providerType'],
        message: '安全生成参数的供应商必须与变体一致'
      });
    }
  });

  content.comfyStyleRecipes.forEach((recipe, index) => {
    usedStyleRefs.add(recipe.companionStyleRef);
    usedDialectRefs.add(recipe.dialectRef);
    if (!styleRefs.has(recipe.companionStyleRef)) {
      context.addIssue({
        code: 'custom',
        path: ['content', 'comfyStyleRecipes', index, 'companionStyleRef'],
        message: '配方引用了包内不存在的配套风格'
      });
    }
    if (!dialectRefs.has(recipe.dialectRef)) {
      context.addIssue({
        code: 'custom',
        path: ['content', 'comfyStyleRecipes', index, 'dialectRef'],
        message: '配方引用了包内不存在的方言'
      });
    }
  });

  const selectionRefs = [
    ['globalStyleRef', content.styleSelection.globalStyleRef],
    ['characterStyleRef', content.styleSelection.characterStyleRef],
    ['narrativeSceneStyleRef', content.styleSelection.narrativeSceneStyleRef]
  ];
  selectionRefs.forEach(([field, styleRef]) => {
    if (styleRef === undefined) return;
    usedStyleRefs.add(styleRef);
    if (!styleRefs.has(styleRef)) {
      context.addIssue({
        code: 'custom',
        path: ['content', 'styleSelection', field],
        message: '风格选择引用了包内不存在的风格'
      });
    }
  });

  content.stylePresets.forEach((preset, index) => {
    if (!usedStyleRefs.has(preset.styleRef)) {
      context.addIssue({
        code: 'custom',
        path: ['content', 'stylePresets', index, 'styleRef'],
        message: '包内只能携带被变体、选择或配方实际引用的风格'
      });
    }
  });
  content.dialectPresets.forEach((preset, index) => {
    if (!usedDialectRefs.has(preset.dialectRef)) {
      context.addIssue({
        code: 'custom',
        path: ['content', 'dialectPresets', index, 'dialectRef'],
        message: '包内只能携带被变体或配方实际引用的方言'
      });
    }
  });
  content.comfyStyleRecipes.forEach((recipe, index) => {
    if (!usedRecipeRefs.has(recipe.recipeRef)) {
      context.addIssue({
        code: 'custom',
        path: ['content', 'comfyStyleRecipes', index, 'recipeRef'],
        message: '包内只能携带被 ComfyUI 变体实际引用的配方'
      });
    }
  });
});

const FORBIDDEN_KEYS = new Set([
  'apikey', 'token', 'accesstoken', 'refreshtoken', 'authorization', 'cookie',
  'password', 'secret', 'credentialid', 'profileid', 'baseurl', 'apibaseurl',
  'proxyurl', 'headers', 'workflow', 'apiworkflow', 'workflowtemplateid', 'seed',
  'checkpoint', 'modelpath', 'lorapath', 'filepath', 'localpath', 'imagebytes',
  'imagedata', 'base64', 'saveid', 'storagkey', 'storagekey', 'rawresponse'
]);

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const normalizeKey = (key) => key.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
const textEncoder = new globalThis.TextEncoder();

const looksLikeEncodedBlob = (value) => value.length >= 512
  && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  && /[A-Z]/.test(value)
  && /[a-z]/.test(value)
  && /\d/.test(value)
  && /[+/=]/.test(value);

const findSensitiveStringReason = (value) => {
  if (/\b(?:sk|pst|tp)-[A-Za-z0-9_-]{16,}\b/.test(value)) return '疑似 API 凭据';
  if (/\bAIza[0-9A-Za-z_-]{20,}\b/.test(value)) return '疑似 API 凭据';
  if (/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/i.test(value)) return '疑似认证头';
  if (/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(value)) return '疑似会话令牌';
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) return '疑似私钥';
  if (/\bhttps?:\/\//i.test(value) || /\bfile:\/\//i.test(value)) return '外部或本机 URL';
  if (/\b[A-Za-z]:[\\/][^\s]+/.test(value)) return 'Windows 本机路径';
  if (/(?:^|\s)\/(?:Users|home|tmp|var|etc)\//.test(value)) return '本机绝对路径';
  if (/\bdata:image\/[A-Za-z0-9.+-]+;base64,/i.test(value)) return '内嵌图片数据';
  if (looksLikeEncodedBlob(value)) return '疑似 Base64 二进制数据';
  return undefined;
};

const issue = (path, code, message) => ({ path, code, message });

const failure = (code, message, issues = []) => ({
  success: false,
  error: { code, message, issues }
});

const scanRawPackage = (value) => {
  const seen = new WeakSet();
  let nodes = 0;

  const visit = (current, path, depth) => {
    nodes += 1;
    if (nodes > MAX_STRUCTURE_NODES || depth > MAX_STRUCTURE_DEPTH) {
      return failure(
        'structure-too-complex',
        '分享包结构过深或节点过多。',
        [issue(path, 'structure_too_complex', '分享包超过结构复杂度上限')]
      );
    }
    if (typeof current === 'string') {
      const reason = findSensitiveStringReason(current);
      return reason
        ? failure(
          'sensitive-content',
          '分享包包含不允许公开的敏感内容。',
          [issue(path, 'sensitive_string', reason)]
        )
        : undefined;
    }
    if (current === null || ['number', 'boolean'].includes(typeof current)) return undefined;
    if (typeof current !== 'object') {
      return failure(
        'invalid-package',
        '分享包包含非 JSON 数据。',
        [issue(path, 'invalid_json_value', '只允许 JSON 对象、数组和基础值')]
      );
    }
    if (seen.has(current)) {
      return failure(
        'invalid-package',
        '分享包包含循环引用。',
        [issue(path, 'cyclic_reference', 'JSON 分享包不能包含循环引用')]
      );
    }
    seen.add(current);
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        const result = visit(current[index], [...path, index], depth + 1);
        if (result) return result;
      }
      return undefined;
    }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      return failure(
        'invalid-package',
        '分享包必须由普通 JSON 对象组成。',
        [issue(path, 'invalid_object_prototype', '不允许自定义对象原型')]
      );
    }
    for (const key of Object.keys(current)) {
      if (DANGEROUS_KEYS.has(key)) {
        return failure(
          'invalid-package',
          '分享包包含危险对象键。',
          [issue([...path, key], 'dangerous_key', `禁止字段 ${key}`)]
        );
      }
      if (FORBIDDEN_KEYS.has(normalizeKey(key))) {
        return failure(
          'sensitive-content',
          '分享包包含不允许公开的字段。',
          [issue([...path, key], 'forbidden_field', `禁止字段 ${key}`)]
        );
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !('value' in descriptor)) {
        return failure(
          'invalid-package',
          '分享包包含不可读取的动态字段。',
          [issue([...path, key], 'accessor_field', '不允许 getter 或 setter')]
        );
      }
      const result = visit(descriptor.value, [...path, key], depth + 1);
      if (result) return result;
    }
    return undefined;
  };

  return visit(value, [], 0);
};

const stringifyJson = (value) => {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' ? { success: true, json } : failure(
      'invalid-package',
      '分享包不是可序列化的 JSON 对象。'
    );
  } catch {
    return failure('invalid-package', '分享包不是可序列化的 JSON 对象。');
  }
};

const toContractIssues = (zodIssues) => zodIssues.map((zodIssue) => issue(
  zodIssue.path,
  zodIssue.code,
  zodIssue.message
));

export function measureWorkshopPackageBytes(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return textEncoder.encode(serialized).byteLength;
}

export function scanWorkshopShareableValueV1(value) {
  const scanFailure = scanRawPackage(value);
  return scanFailure ?? { success: true };
}

export function parseImageGenerationPresetPackageV1(value, options = {}) {
  const maximumBytes = options.maximumBytes ?? WORKSHOP_PACKAGE_MAX_BYTES;
  const scanFailure = scanRawPackage(value);
  if (scanFailure) return scanFailure;

  if (value && typeof value === 'object' && 'schemaVersion' in value) {
    const schemaVersion = value.schemaVersion;
    if (typeof schemaVersion === 'number' && schemaVersion > WORKSHOP_PACKAGE_SCHEMA_VERSION) {
      return failure(
        'unsupported-schema',
        `当前只支持分享包 Schema V${WORKSHOP_PACKAGE_SCHEMA_VERSION}。`,
        [issue(['schemaVersion'], 'unsupported_schema', `不支持 Schema V${schemaVersion}`)]
      );
    }
  }

  const parsed = imageGenerationPresetPackageV1Schema.safeParse(value);
  if (!parsed.success) {
    return failure(
      'invalid-package',
      '分享包字段不符合 V1 合同。',
      toContractIssues(parsed.error.issues)
    );
  }

  const serialized = stringifyJson(parsed.data);
  if (!serialized.success) return serialized;
  const byteLength = measureWorkshopPackageBytes(serialized.json);
  if (byteLength > maximumBytes) {
    return failure(
      'package-too-large',
      `分享包为 ${byteLength} 字节，超过 ${maximumBytes} 字节上限。`,
      [issue([], 'package_too_large', `实际 ${byteLength} 字节，上限 ${maximumBytes} 字节`)]
    );
  }

  return {
    success: true,
    data: parsed.data,
    byteLength
  };
}

export function parseImageGenerationPresetPackageJsonV1(jsonText, options = {}) {
  if (typeof jsonText !== 'string') {
    return failure('invalid-json', '分享包必须是 UTF-8 JSON 文本。');
  }
  const maximumBytes = options.maximumBytes ?? WORKSHOP_PACKAGE_MAX_BYTES;
  const byteLength = measureWorkshopPackageBytes(jsonText);
  if (byteLength > maximumBytes) {
    return failure(
      'package-too-large',
      `分享包为 ${byteLength} 字节，超过 ${maximumBytes} 字节上限。`,
      [issue([], 'package_too_large', `实际 ${byteLength} 字节，上限 ${maximumBytes} 字节`)]
    );
  }
  let value;
  try {
    value = JSON.parse(jsonText);
  } catch {
    return failure('invalid-json', '分享包不是有效 JSON。');
  }
  return parseImageGenerationPresetPackageV1(value, { maximumBytes });
}

const sortForCanonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(sortForCanonicalJson);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortForCanonicalJson(value[key]);
        return result;
      }, {});
  }
  return value;
};

export function canonicalizeImageGenerationPresetPackageV1(value) {
  const parsed = parseImageGenerationPresetPackageV1(value);
  if (!parsed.success) {
    throw new WorkshopPackageContractError(parsed.error);
  }
  return JSON.stringify(sortForCanonicalJson(parsed.data));
}

export async function calculateImageGenerationPresetPackageSha256V1(value) {
  const canonicalJson = canonicalizeImageGenerationPresetPackageV1(value);
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前运行环境不支持 Web Crypto SHA-256。');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', textEncoder.encode(canonicalJson));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class WorkshopPackageContractError extends Error {
  constructor(contractError) {
    super(contractError.message);
    this.name = 'WorkshopPackageContractError';
    this.code = contractError.code;
    this.issues = contractError.issues;
  }
}
