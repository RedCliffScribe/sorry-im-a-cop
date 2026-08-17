import { z } from 'zod';
import {
  BUILT_IN_COMFY_STYLE_RECIPES,
  cloneBuiltInComfyStyleRecipes,
  comfyStyleRecipeSchema,
  type ComfyStyleRecipe
} from '../comfyStyleRecipes';
import {
  BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS,
  BUILT_IN_IMAGE_STYLE_PRESETS,
  DEFAULT_IMAGE_STYLE_SELECTION,
  IMAGE_STYLE_COMPOSITION_MODES,
  IMAGE_PROMPT_DIALECT_FAMILIES,
  LEGACY_DEFAULT_IMAGE_PROMPT_DIALECT_V1,
  LEGACY_DEFAULT_IMAGE_STYLE_PRESET_V1,
  LEGACY_ILLUSTRIOUS_IMAGE_PROMPT_DIALECT_V1,
  LEGACY_NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_V1,
  LEGACY_NOVELAI_IMAGE_PROMPT_DIALECT_V1,
  cloneBuiltInImagePromptDialectPresets,
  cloneBuiltInImageStylePresets,
  type ImagePromptDialectPreset,
  type ImageStylePreset,
  type ImageStyleSelection
} from './promptPresetLibrary';
import {
  DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS,
  LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V1,
  LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V2,
  LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V3,
  LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V4,
  LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V5
} from './prompts';
import {
  CHARACTER_VISUAL_PURPOSES,
  DEFAULT_IMAGE_PROMPT_MODIFIERS,
  EMPTY_IMAGE_PROMPT_MODIFIERS,
  type ImagePromptModifierSet,
  type PromptConversionInstructionSet
} from './types';

const modifierSchema = z.object({
  positive: z.string().max(20_000),
  negative: z.string().max(20_000)
}).strict();

const currentModifierSetSchema = z.object({
  global: modifierSchema,
  characterCommon: modifierSchema,
  characterViews: z.object(Object.fromEntries(
    CHARACTER_VISUAL_PURPOSES.map((purpose) => [purpose, modifierSchema])
  ) as Record<(typeof CHARACTER_VISUAL_PURPOSES)[number], typeof modifierSchema>).strict(),
  narrativeScene: modifierSchema
}).strict();

function migrateLegacyModifierSet(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!record.characterViews || typeof record.characterViews !== 'object' || Array.isArray(record.characterViews)) {
    return value;
  }
  const characterViews = { ...(record.characterViews as Record<string, unknown>) };
  if (characterViews['knee-up-medium-full'] === undefined && characterViews['cowboy-medium-full'] !== undefined) {
    characterViews['knee-up-medium-full'] = characterViews['cowboy-medium-full'];
  }
  delete characterViews['cowboy-medium-full'];
  return { ...record, characterViews };
}

const modifierSetSchema = z.preprocess(
  migrateLegacyModifierSet,
  currentModifierSetSchema
) as z.ZodType<ImagePromptModifierSet>;

const conversionInstructionSchema = z.string().max(40_000).refine(
  (value) => value.trim().length > 0,
  '转换任务指令不能为空'
);

const currentConversionInstructionSetSchema = z.object({
  'character-anchor': conversionInstructionSchema,
  'character-anchor-from-images': conversionInstructionSchema,
  'character-view-batch': conversionInstructionSchema,
  'turn-scene-plan': conversionInstructionSchema,
  'scene-shot-prompt': conversionInstructionSchema,
  'provider-prompt-render': conversionInstructionSchema
}).strict();

const conversionInstructionSetSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const instructions = value as Record<string, unknown>;
  return {
    ...instructions,
    'provider-prompt-render': instructions['provider-prompt-render'] ??
      DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS['provider-prompt-render']
  };
}, currentConversionInstructionSetSchema) as z.ZodType<PromptConversionInstructionSet>;

const imageStylePresetSchema: z.ZodType<ImageStylePreset> = z.object({
  stylePresetId: z.string().trim().min(1).max(1000),
  origin: z.enum(['built-in', 'custom']),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  hidden: z.boolean(),
  order: z.number().int().min(0),
  modifiers: z.object({
    global: modifierSchema,
    character: modifierSchema,
    narrativeScene: modifierSchema
  }).strict()
}).strict();

const imageStyleSelectionSchema: z.ZodType<ImageStyleSelection> = z.object({
  globalStylePresetId: z.string().trim().min(1).max(1000),
  characterStylePresetId: z.string().trim().min(1).max(1000).optional(),
  narrativeSceneStylePresetId: z.string().trim().min(1).max(1000).optional(),
  characterStyleMode: z.enum(IMAGE_STYLE_COMPOSITION_MODES).optional().default('inherit-global'),
  narrativeSceneStyleMode: z.enum(IMAGE_STYLE_COMPOSITION_MODES).optional().default('inherit-global')
}).strict();

const imagePromptDialectPresetSchema: z.ZodType<ImagePromptDialectPreset> = z.object({
  dialectPresetId: z.string().trim().min(1).max(1000),
  origin: z.enum(['built-in', 'custom']),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  family: z.enum(IMAGE_PROMPT_DIALECT_FAMILIES),
  hidden: z.boolean(),
  order: z.number().int().min(0),
  renderingInstruction: z.string().trim().min(1).max(40_000),
  positivePrefix: z.string().max(20_000),
  positiveSuffix: z.string().max(20_000),
  negativePrefix: z.string().max(20_000),
  negativeSuffix: z.string().max(20_000)
}).strict();

const portableTemplateContentV1Schema = z.object({
  modifiers: modifierSetSchema,
  conversionInstructions: conversionInstructionSetSchema,
  conversionCapabilities: z.object({
    imageInputEnabled: z.boolean()
  }).strict()
}).strict();

const portableTemplateContentV2Schema = portableTemplateContentV1Schema.extend({
  stylePresets: z.array(imageStylePresetSchema),
  styleSelection: imageStyleSelectionSchema,
  dialectPresets: z.array(imagePromptDialectPresetSchema)
}).strict();

const portableTemplateContentV3Schema = portableTemplateContentV2Schema.extend({
  comfyStyleRecipes: z.array(comfyStyleRecipeSchema)
}).strict();

const imagePromptTemplateExportV1Schema = z.object({
  format: z.literal('sorry-im-a-cop-v2-image-prompt-templates'),
  version: z.literal(1),
  exportedAt: z.string().datetime({ offset: true }),
  sourceRevision: z.number().int().min(1),
  templates: portableTemplateContentV1Schema
}).strict();

const imagePromptTemplateExportV2Schema = z.object({
  format: z.literal('sorry-im-a-cop-v2-image-prompt-templates'),
  version: z.literal(2),
  exportedAt: z.string().datetime({ offset: true }),
  sourceRevision: z.number().int().min(1),
  templates: portableTemplateContentV2Schema
}).strict();

const imagePromptTemplateExportV3Schema = z.object({
  format: z.literal('sorry-im-a-cop-v2-image-prompt-templates'),
  version: z.literal(3),
  exportedAt: z.string().datetime({ offset: true }),
  sourceRevision: z.number().int().min(1),
  templates: portableTemplateContentV3Schema
}).strict();

const imagePromptTemplateImportSchema = z.discriminatedUnion('version', [
  imagePromptTemplateExportV1Schema,
  imagePromptTemplateExportV2Schema,
  imagePromptTemplateExportV3Schema
]);

export interface ImagePromptTemplateSettings {
  settingsId: 'global-image-prompt-templates';
  revision: number;
  modifiers: ImagePromptModifierSet;
  conversionInstructions: PromptConversionInstructionSet;
  conversionCapabilities: {
    imageInputEnabled: boolean;
  };
  stylePresets: ImageStylePreset[];
  styleSelection: ImageStyleSelection;
  dialectPresets: ImagePromptDialectPreset[];
  comfyStyleRecipes: ComfyStyleRecipe[];
  modifierDefaultsState: 'built-in' | 'legacy-preserved' | 'custom';
  updatedAt: string;
}

export interface ImagePromptTemplateRepository {
  load(): Promise<ImagePromptTemplateSettings>;
  save(settings: ImagePromptTemplateSettings): Promise<void>;
}

export type ImagePromptTemplateExport = z.infer<typeof imagePromptTemplateExportV3Schema>;

function mergeBuiltInPresets<T extends { origin: 'built-in' | 'custom'; order: number }>(
  current: readonly T[] | undefined,
  builtIns: readonly T[],
  idOf: (preset: T) => string
): T[] {
  if (!current) return [...structuredClone(builtIns)];
  const ids = new Set(current.map(idOf));
  return [
    ...structuredClone(current),
    ...structuredClone(builtIns.filter((preset) => !ids.has(idOf(preset))))
  ].map((preset, order) => ({ ...preset, order }));
}

function sameModifier(
  left: { positive: string; negative: string },
  right: { positive: string; negative: string }
): boolean {
  return left.positive === right.positive && left.negative === right.negative;
}

function isUntouchedLegacyStyle(
  preset: ImageStylePreset,
  legacy: ImageStylePreset
): boolean {
  return preset.stylePresetId === legacy.stylePresetId
    && preset.origin === legacy.origin
    && preset.name === legacy.name
    && preset.description === legacy.description
    && preset.hidden === legacy.hidden
    && sameModifier(preset.modifiers.global, legacy.modifiers.global)
    && sameModifier(preset.modifiers.character, legacy.modifiers.character)
    && sameModifier(preset.modifiers.narrativeScene, legacy.modifiers.narrativeScene);
}

function upgradeUntouchedLegacyStylePresets(
  current: readonly ImageStylePreset[] | undefined
): ImageStylePreset[] | undefined {
  if (!current) return undefined;
  const phaseAwLabels = new Map<string, { name: string; description: string }>([
    ['builtin-style-comfy-asianblend-character', {
      name: 'ComfyUI·AsianBlend 写实人物',
      description: '本机 AsianBlend Illustrious 实测人物路线。人物吸引力和身份底图稳定；偏摄影感可由玩家继续压低。'
    }],
    ['builtin-style-comfy-duchaiten-character', {
      name: 'ComfyUI·Duchaiten 半油画人物',
      description: '本机 Duchaiten SDXL 实测人物路线，包含原生人物和低去噪风格化方向；画面可用，但不宣称身份保持。'
    }],
    ['builtin-style-comfy-duchaiten-scene', {
      name: 'ComfyUI·Duchaiten 雨夜场景',
      description: '本机 Duchaiten SDXL 实测场景路线。适合旧香港、雨夜、仓库和犯罪剧情环境；精确人数仍需工作流控制。'
    }],
    ['builtin-style-comfy-rin-softsketch', {
      name: 'ComfyUI·Rin SoftSketch 柔绘',
      description: '本机 Rin SoftSketch 实测柔和插画路线。原生人物和低去噪风格化结果都保留；不作为身份复刻保证。'
    }],
    ['builtin-style-comfy-wai-mature-anime', {
      name: 'ComfyUI·WAI 成熟日漫',
      description: '本机 WAI Illustrious 实测基础动漫路线。适合成熟人物立绘和剧情事件图，可继续叠加玩家自己的 LoRA。'
    }],
    ['builtin-style-comfy-hojo-urban-manga', {
      name: 'ComfyUI·北条司都市漫画',
      description: '本机 WAI Illustrious + Tsukasa Hojo IllustriousXL LoRA 实测。推荐 LoRA 强度 0.55，需由玩家工作流实际加载。'
    }],
    ['builtin-style-comfy-oda-non', {
      name: 'ComfyUI·织田 non 成熟绘风',
      description: '本机 WAI Illustrious + oda-non_IL LoRA 实测。推荐 LoRA 强度 0.60；LoRA 只由玩家工作流加载，预设不会暗中注入。'
    }],
    ['builtin-style-comfy-izayoi-seishin', {
      name: 'ComfyUI·十六夜清心柔绘',
      description: '本机 WAI Illustrious + izayoi_seishin_IL LoRA 实测。推荐 LoRA 强度 0.60；LoRA 只由玩家工作流加载，预设不会暗中注入。'
    }]
  ]);
  const legacyBuiltIns = [
    LEGACY_DEFAULT_IMAGE_STYLE_PRESET_V1,
    LEGACY_NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_V1
  ];
  return current.map((preset) => {
    const legacy = legacyBuiltIns.find((candidate) => isUntouchedLegacyStyle(preset, candidate));
    if (!legacy) {
      const phaseAw = phaseAwLabels.get(preset.stylePresetId);
      const replacement = BUILT_IN_IMAGE_STYLE_PRESETS.find(
        (candidate) => candidate.stylePresetId === preset.stylePresetId
      );
      return phaseAw
        && replacement
        && preset.origin === 'built-in'
        && preset.name === phaseAw.name
        && preset.description === phaseAw.description
        ? {
            ...structuredClone(preset),
            name: replacement.name,
            description: replacement.description
          }
        : structuredClone(preset);
    }
    const replacement = BUILT_IN_IMAGE_STYLE_PRESETS.find(
      (candidate) => candidate.stylePresetId === preset.stylePresetId
    );
    return replacement
      ? { ...structuredClone(replacement), order: preset.order }
      : structuredClone(preset);
  });
}

function isUntouchedLegacyDialect(
  preset: ImagePromptDialectPreset,
  legacy: ImagePromptDialectPreset
): boolean {
  return preset.dialectPresetId === legacy.dialectPresetId
    && preset.origin === legacy.origin
    && preset.name === legacy.name
    && preset.description === legacy.description
    && preset.family === legacy.family
    && preset.hidden === legacy.hidden
    && preset.renderingInstruction === legacy.renderingInstruction
    && preset.positivePrefix === legacy.positivePrefix
    && preset.positiveSuffix === legacy.positiveSuffix
    && preset.negativePrefix === legacy.negativePrefix
    && preset.negativeSuffix === legacy.negativeSuffix;
}

function upgradeUntouchedLegacyDialectPresets(
  current: readonly ImagePromptDialectPreset[] | undefined
): ImagePromptDialectPreset[] | undefined {
  if (!current) return undefined;
  const legacyBuiltIns = [
    LEGACY_DEFAULT_IMAGE_PROMPT_DIALECT_V1,
    LEGACY_ILLUSTRIOUS_IMAGE_PROMPT_DIALECT_V1,
    LEGACY_NOVELAI_IMAGE_PROMPT_DIALECT_V1
  ];
  return current.map((preset) => {
    const legacy = legacyBuiltIns.find((candidate) => isUntouchedLegacyDialect(preset, candidate));
    const isNovelAiProjectionV2 = preset.dialectPresetId === 'builtin-dialect-novelai'
      && preset.origin === 'built-in'
      && preset.description === '面向 NovelAI V4/V4.5 动漫插画模型；包含兼容画风投影、标签顺序和可见负面词基线。'
      && preset.renderingInstruction.includes('retro 1980s adult crime anime')
      && preset.negativePrefix === 'photorealistic, realistic, photography, real life, 3d, rendering, unreal engine, octane render, glossy modern digital look, chibi, moe, youthful face, lowres, bad anatomy, bad hands, extra digits, missing fingers, text, watermark, signature, logo, blurry, cropped, out of frame';
    if (!legacy && !isNovelAiProjectionV2) return structuredClone(preset);
    const replacement = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (candidate) => candidate.dialectPresetId === preset.dialectPresetId
    );
    return replacement
      ? { ...structuredClone(replacement), order: preset.order }
      : structuredClone(preset);
  });
}

function upgradeUntouchedLegacyConversionInstructions(
  current: PromptConversionInstructionSet
): PromptConversionInstructionSet {
  const upgraded = structuredClone(current);
  for (const taskKind of Object.keys(LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V1) as Array<
    keyof typeof LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V1
  >) {
    if (upgraded[taskKind] === LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V1[taskKind]) {
      upgraded[taskKind] = DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS[taskKind];
    }
  }
  for (const taskKind of Object.keys(LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V2) as Array<
    keyof typeof LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V2
  >) {
    if (upgraded[taskKind] === LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V2[taskKind]) {
      upgraded[taskKind] = DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS[taskKind];
    }
  }
  for (const taskKind of Object.keys(LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V3) as Array<
    keyof typeof LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V3
  >) {
    if (upgraded[taskKind] === LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V3[taskKind]) {
      upgraded[taskKind] = DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS[taskKind];
    }
  }
  for (const taskKind of Object.keys(LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V4) as Array<
    keyof typeof LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V4
  >) {
    if (upgraded[taskKind] === LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V4[taskKind]) {
      upgraded[taskKind] = DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS[taskKind];
    }
  }
  for (const taskKind of Object.keys(LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V5) as Array<
    keyof typeof LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V5
  >) {
    if (upgraded[taskKind] === LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V5[taskKind]) {
      upgraded[taskKind] = DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS[taskKind];
    }
  }
  return upgraded;
}

function validatePromptPresetLibrary(settings: ImagePromptTemplateSettings): ImagePromptTemplateSettings {
  const styleIds = new Set<string>();
  settings.stylePresets.forEach((preset, index) => {
    if (styleIds.has(preset.stylePresetId)) throw new Error(`图片风格 ID 重复：${preset.stylePresetId}`);
    styleIds.add(preset.stylePresetId);
    const builtIn = BUILT_IN_IMAGE_STYLE_PRESETS.find((item) => item.stylePresetId === preset.stylePresetId);
    if (preset.origin === 'built-in' && !builtIn) throw new Error(`未知内置图片风格：${preset.stylePresetId}`);
    if (builtIn && preset.origin !== 'built-in') throw new Error(`内置图片风格不能改为自定义来源：${preset.stylePresetId}`);
    if (preset.order !== index) throw new Error('图片风格顺序必须从 0 连续排列。');
  });
  for (const builtIn of BUILT_IN_IMAGE_STYLE_PRESETS) {
    if (!styleIds.has(builtIn.stylePresetId)) throw new Error(`缺少内置图片风格：${builtIn.stylePresetId}`);
  }
  for (const selectedId of [
    settings.styleSelection.globalStylePresetId,
    settings.styleSelection.characterStylePresetId,
    settings.styleSelection.narrativeSceneStylePresetId
  ]) {
    if (selectedId && !styleIds.has(selectedId)) throw new Error(`图片风格选择引用不存在的预设：${selectedId}`);
  }

  const dialectIds = new Set<string>();
  settings.dialectPresets.forEach((preset, index) => {
    if (dialectIds.has(preset.dialectPresetId)) throw new Error(`提示词格式 ID 重复：${preset.dialectPresetId}`);
    dialectIds.add(preset.dialectPresetId);
    const builtIn = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (item) => item.dialectPresetId === preset.dialectPresetId
    );
    if (preset.origin === 'built-in' && !builtIn) throw new Error(`未知内置提示词格式：${preset.dialectPresetId}`);
    if (builtIn && preset.origin !== 'built-in') throw new Error(`内置提示词格式不能改为自定义来源：${preset.dialectPresetId}`);
    if (preset.order !== index) throw new Error('提示词格式顺序必须从 0 连续排列。');
  });
  for (const builtIn of BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS) {
    if (!dialectIds.has(builtIn.dialectPresetId)) throw new Error(`缺少内置提示词格式：${builtIn.dialectPresetId}`);
  }

  const recipeIds = new Set<string>();
  settings.comfyStyleRecipes.forEach((recipe, index) => {
    if (recipeIds.has(recipe.recipeId)) throw new Error(`ComfyUI 风格配方 ID 重复：${recipe.recipeId}`);
    recipeIds.add(recipe.recipeId);
    const builtIn = BUILT_IN_COMFY_STYLE_RECIPES.find((item) => item.recipeId === recipe.recipeId);
    if (recipe.origin === 'built-in' && !builtIn) throw new Error(`未知内置 ComfyUI 风格配方：${recipe.recipeId}`);
    if (builtIn && recipe.origin !== 'built-in') throw new Error(`内置 ComfyUI 风格配方不能改为自定义来源：${recipe.recipeId}`);
    if (recipe.order !== index) throw new Error('ComfyUI 风格配方顺序必须从 0 连续排列。');
    if (!styleIds.has(recipe.companionStylePresetId)) {
      throw new Error(`ComfyUI 风格配方引用不存在的提示词风格：${recipe.companionStylePresetId}`);
    }
    if (!dialectIds.has(recipe.recommendedPromptDialectPresetId)) {
      throw new Error(`ComfyUI 风格配方引用不存在的模型渲染方案：${recipe.recommendedPromptDialectPresetId}`);
    }
  });
  for (const builtIn of BUILT_IN_COMFY_STYLE_RECIPES) {
    if (!recipeIds.has(builtIn.recipeId)) throw new Error(`缺少内置 ComfyUI 风格配方：${builtIn.recipeId}`);
  }
  return settings;
}

function parseSettings(value: unknown): ImagePromptTemplateSettings {
  const parsed = z.object({
    settingsId: z.literal('global-image-prompt-templates'),
    revision: z.number().int().min(1),
    modifiers: modifierSetSchema,
    conversionInstructions: conversionInstructionSetSchema.optional(),
    conversionCapabilities: z.object({
      imageInputEnabled: z.boolean()
    }).strict().optional().default({ imageInputEnabled: false }),
    stylePresets: z.array(imageStylePresetSchema).optional(),
    styleSelection: imageStyleSelectionSchema.optional(),
    dialectPresets: z.array(imagePromptDialectPresetSchema).optional(),
    comfyStyleRecipes: z.array(comfyStyleRecipeSchema).optional(),
    modifierDefaultsState: z.enum(['built-in', 'legacy-preserved', 'custom']).optional(),
    updatedAt: z.string().datetime({ offset: true })
  }).strict().parse(value);
  return validatePromptPresetLibrary({
    ...parsed,
    conversionInstructions: upgradeUntouchedLegacyConversionInstructions(
      parsed.conversionInstructions ?? DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS
    ),
    stylePresets: mergeBuiltInPresets(
      upgradeUntouchedLegacyStylePresets(parsed.stylePresets),
      BUILT_IN_IMAGE_STYLE_PRESETS,
      (preset) => preset.stylePresetId
    ),
    styleSelection: structuredClone(parsed.styleSelection ?? DEFAULT_IMAGE_STYLE_SELECTION),
    dialectPresets: mergeBuiltInPresets(
      upgradeUntouchedLegacyDialectPresets(parsed.dialectPresets),
      BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS,
      (preset) => preset.dialectPresetId
    ),
    comfyStyleRecipes: mergeBuiltInPresets(
      parsed.comfyStyleRecipes,
      BUILT_IN_COMFY_STYLE_RECIPES,
      (recipe) => recipe.recipeId
    ),
    modifierDefaultsState: parsed.modifierDefaultsState ?? 'legacy-preserved'
  });
}

export function createEmptyImagePromptTemplateSettings(now = new Date().toISOString()): ImagePromptTemplateSettings {
  return {
    settingsId: 'global-image-prompt-templates',
    revision: 1,
    modifiers: structuredClone(EMPTY_IMAGE_PROMPT_MODIFIERS),
    conversionInstructions: structuredClone(DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS),
    conversionCapabilities: { imageInputEnabled: false },
    stylePresets: cloneBuiltInImageStylePresets(),
    styleSelection: structuredClone(DEFAULT_IMAGE_STYLE_SELECTION),
    dialectPresets: cloneBuiltInImagePromptDialectPresets(),
    comfyStyleRecipes: cloneBuiltInComfyStyleRecipes(),
    modifierDefaultsState: 'custom',
    updatedAt: now
  };
}

export function createDefaultImagePromptTemplateSettings(now = new Date().toISOString()): ImagePromptTemplateSettings {
  return {
    settingsId: 'global-image-prompt-templates',
    revision: 1,
    modifiers: structuredClone(DEFAULT_IMAGE_PROMPT_MODIFIERS),
    conversionInstructions: structuredClone(DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS),
    conversionCapabilities: { imageInputEnabled: false },
    stylePresets: cloneBuiltInImageStylePresets(),
    styleSelection: structuredClone(DEFAULT_IMAGE_STYLE_SELECTION),
    dialectPresets: cloneBuiltInImagePromptDialectPresets(),
    comfyStyleRecipes: cloneBuiltInComfyStyleRecipes(),
    modifierDefaultsState: 'built-in',
    updatedAt: now
  };
}

export function createImagePromptTemplateExport(
  settings: ImagePromptTemplateSettings,
  exportedAt = new Date().toISOString()
): ImagePromptTemplateExport {
  const parsed = parseSettings(settings);
  return imagePromptTemplateExportV3Schema.parse({
    format: 'sorry-im-a-cop-v2-image-prompt-templates',
    version: 3,
    exportedAt,
    sourceRevision: parsed.revision,
    templates: {
      modifiers: parsed.modifiers,
      conversionInstructions: parsed.conversionInstructions,
      conversionCapabilities: parsed.conversionCapabilities,
      stylePresets: parsed.stylePresets,
      styleSelection: parsed.styleSelection,
      dialectPresets: parsed.dialectPresets,
      comfyStyleRecipes: parsed.comfyStyleRecipes
    }
  });
}

export function serializeImagePromptTemplateSettings(
  settings: ImagePromptTemplateSettings,
  exportedAt = new Date().toISOString()
): string {
  return JSON.stringify(createImagePromptTemplateExport(settings, exportedAt), null, 2);
}

export function parseImagePromptTemplateImport(
  rawJson: string,
  currentSettings: ImagePromptTemplateSettings
): ImagePromptTemplateSettings {
  const current = parseSettings(currentSettings);
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawJson) as unknown;
  } catch {
    throw new Error('文件不是有效 JSON。');
  }
  const imported = imagePromptTemplateImportSchema.parse(decoded);
  const versionedTemplates = imported.version === 1 ? undefined : imported.templates;
  const versionThreeTemplates = imported.version === 3 ? imported.templates : undefined;
  return parseSettings({
    ...current,
    modifiers: structuredClone(imported.templates.modifiers),
    conversionInstructions: structuredClone(imported.templates.conversionInstructions),
    conversionCapabilities: structuredClone(imported.templates.conversionCapabilities),
    stylePresets: versionedTemplates
      ? structuredClone(versionedTemplates.stylePresets)
      : current.stylePresets,
    styleSelection: versionedTemplates
      ? structuredClone(versionedTemplates.styleSelection)
      : current.styleSelection,
    dialectPresets: versionedTemplates
      ? structuredClone(versionedTemplates.dialectPresets)
      : current.dialectPresets,
    comfyStyleRecipes: versionThreeTemplates
      ? structuredClone(versionThreeTemplates.comfyStyleRecipes)
      : current.comfyStyleRecipes,
    modifierDefaultsState: 'custom'
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbImagePromptTemplateRepository implements ImagePromptTemplateRepository {
  private readonly dbName: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dbName = 'sorry-im-a-cop-v2-image-prompt-templates') {
    this.dbName = dbName;
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('settings')) {
          request.result.createObjectStore('settings', { keyPath: 'settingsId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开图片提示词模板数据库。'));
    });
  }

  async load(): Promise<ImagePromptTemplateSettings> {
    const db = await this.open();
    try {
      const transaction = db.transaction('settings', 'readonly');
      const value = await requestToPromise<unknown>(transaction.objectStore('settings').get('global-image-prompt-templates'));
      return value === undefined ? createDefaultImagePromptTemplateSettings() : parseSettings(value);
    } finally {
      db.close();
    }
  }

  save(settings: ImagePromptTemplateSettings): Promise<void> {
    const parsed = parseSettings(settings);
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('settings', 'readwrite');
        transaction.objectStore('settings').put(parsed);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  clearAll(): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('settings', 'readwrite');
        transaction.objectStore('settings').clear();
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
