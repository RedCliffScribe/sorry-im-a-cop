import { z } from 'zod';
import type {
  ComfyWorkflowParameterValue,
  ComfyWorkflowTemplate
} from './profile';

export const COMFY_STYLE_RECIPE_PURPOSES = [
  'character',
  'narrative-scene'
] as const;

export type ComfyStyleRecipePurpose = (typeof COMFY_STYLE_RECIPE_PURPOSES)[number];
export type ComfyStyleRecipeOrigin = 'built-in' | 'custom';
export type ComfyStyleRecipeAssetKind = 'checkpoint' | 'lora';

export interface ComfyStyleRecipeAssetSlot {
  slotId: string;
  kind: ComfyStyleRecipeAssetKind;
  label: string;
  description: string;
  required: boolean;
  filenameHints: string[];
  triggerWords?: string;
  recommendedModelStrength?: number;
  recommendedClipStrength?: number;
}

export interface ComfyStyleRecipe {
  recipeId: string;
  origin: ComfyStyleRecipeOrigin;
  name: string;
  description: string;
  hidden: boolean;
  order: number;
  compatiblePurposes: ComfyStyleRecipePurpose[];
  companionStylePresetId: string;
  recommendedPromptDialectPresetId: string;
  assetSlots: ComfyStyleRecipeAssetSlot[];
  recommendedParameters: {
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
  };
}

export interface ComfyStyleRecipeAssetMapping {
  fileName?: string;
  fileParameterKey?: string;
  modelStrengthParameterKey?: string;
  clipStrengthParameterKey?: string;
  modelStrength?: number;
  clipStrength?: number;
}

export interface ComfyStyleRecipeApplication {
  mode: 'mapped' | 'prompt-only';
  recipeSnapshot: ComfyStyleRecipe;
  assetMappings: Record<string, ComfyStyleRecipeAssetMapping>;
}

export const COMFY_STYLE_RECIPE_COMPATIBILITY_STATUSES = [
  'ready',
  'needs-mapping',
  'missing-asset',
  'workflow-incompatible',
  'prompt-only'
] as const;

export type ComfyStyleRecipeCompatibilityStatus =
  (typeof COMFY_STYLE_RECIPE_COMPATIBILITY_STATUSES)[number];

export interface ComfyStyleRecipeCompatibility {
  status: ComfyStyleRecipeCompatibilityStatus;
  summary: string;
  details: string[];
}

const id = z.string().trim().min(1).max(1000);
const optionalParameterKey = z.string()
  .regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/)
  .optional();

export const comfyStyleRecipeAssetSlotSchema: z.ZodType<ComfyStyleRecipeAssetSlot> = z.object({
  slotId: id,
  kind: z.enum(['checkpoint', 'lora']),
  label: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  required: z.boolean(),
  filenameHints: z.array(z.string().trim().min(1).max(500)).max(20),
  triggerWords: z.string().max(2000).optional(),
  recommendedModelStrength: z.number().min(-10).max(10).optional(),
  recommendedClipStrength: z.number().min(-10).max(10).optional()
}).strict().superRefine((slot, context) => {
  if (slot.kind === 'checkpoint' && (
    slot.recommendedModelStrength !== undefined
    || slot.recommendedClipStrength !== undefined
  )) {
    context.addIssue({
      code: 'custom',
      path: ['recommendedModelStrength'],
      message: 'Checkpoint 槽位不使用 LoRA 强度'
    });
  }
});

export const comfyStyleRecipeSchema: z.ZodType<ComfyStyleRecipe> = z.object({
  recipeId: id,
  origin: z.enum(['built-in', 'custom']),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  hidden: z.boolean(),
  order: z.number().int().min(0),
  compatiblePurposes: z.array(z.enum(COMFY_STYLE_RECIPE_PURPOSES)).min(1).max(2),
  companionStylePresetId: id,
  recommendedPromptDialectPresetId: id,
  assetSlots: z.array(comfyStyleRecipeAssetSlotSchema).min(1).max(16),
  recommendedParameters: z.object({
    steps: z.number().int().min(1).max(1000).optional(),
    cfg: z.number().min(0).max(1000).optional(),
    sampler: z.string().trim().min(1).max(200).optional(),
    scheduler: z.string().trim().min(1).max(200).optional()
  }).strict()
}).strict().superRefine((recipe, context) => {
  const purposeIds = new Set<string>();
  recipe.compatiblePurposes.forEach((purpose, index) => {
    if (purposeIds.has(purpose)) {
      context.addIssue({
        code: 'custom',
        path: ['compatiblePurposes', index],
        message: '适用用途不能重复'
      });
    }
    purposeIds.add(purpose);
  });
  const slotIds = new Set<string>();
  recipe.assetSlots.forEach((slot, index) => {
    if (slotIds.has(slot.slotId)) {
      context.addIssue({
        code: 'custom',
        path: ['assetSlots', index, 'slotId'],
        message: '配方资产槽位 ID 不能重复'
      });
    }
    slotIds.add(slot.slotId);
  });
});

export const comfyStyleRecipeAssetMappingSchema: z.ZodType<ComfyStyleRecipeAssetMapping> = z.object({
  fileName: z.string().trim().min(1).max(500).optional(),
  fileParameterKey: optionalParameterKey,
  modelStrengthParameterKey: optionalParameterKey,
  clipStrengthParameterKey: optionalParameterKey,
  modelStrength: z.number().min(-10).max(10).optional(),
  clipStrength: z.number().min(-10).max(10).optional()
}).strict();

export const comfyStyleRecipeApplicationSchema: z.ZodType<ComfyStyleRecipeApplication> = z.object({
  mode: z.enum(['mapped', 'prompt-only']),
  recipeSnapshot: comfyStyleRecipeSchema,
  assetMappings: z.record(
    z.string().trim().min(1).max(1000),
    comfyStyleRecipeAssetMappingSchema
  )
}).strict().superRefine((application, context) => {
  const slotIds = new Set(application.recipeSnapshot.assetSlots.map((slot) => slot.slotId));
  Object.keys(application.assetMappings).forEach((slotId) => {
    if (!slotIds.has(slotId)) {
      context.addIssue({
        code: 'custom',
        path: ['assetMappings', slotId],
        message: '资产映射引用了配方中不存在的槽位'
      });
    }
  });
});

const checkpointSlot = (
  slotId: string,
  label: string,
  filenameHints: string[],
  description: string
): ComfyStyleRecipeAssetSlot => ({
  slotId,
  kind: 'checkpoint',
  label,
  description,
  required: true,
  filenameHints
});

const loraSlot = (
  slotId: string,
  label: string,
  filenameHints: string[],
  strength: number,
  description: string,
  triggerWords?: string
): ComfyStyleRecipeAssetSlot => ({
  slotId,
  kind: 'lora',
  label,
  description,
  required: true,
  filenameHints,
  triggerWords,
  recommendedModelStrength: strength,
  recommendedClipStrength: strength
});

const ILLUSTRIOUS_DIALECT = 'builtin-dialect-illustrious';

export const BUILT_IN_COMFY_STYLE_RECIPES: readonly ComfyStyleRecipe[] = [
  {
    recipeId: 'builtin-comfy-recipe-asianblend-character',
    origin: 'built-in',
    name: 'AsianBlend 写实人物',
    description: '面向成熟半写实人物的 checkpoint 配方。提示词只能近似方向；实际风格取决于玩家映射的 AsianBlend 兼容模型。',
    hidden: false,
    order: 0,
    compatiblePurposes: ['character'],
    companionStylePresetId: 'builtin-style-comfy-asianblend-character',
    recommendedPromptDialectPresetId: ILLUSTRIOUS_DIALECT,
    assetSlots: [
      checkpointSlot(
        'checkpoint',
        'AsianBlend Illustrious checkpoint',
        ['asianBlendIllustrious_v10.safetensors'],
        '映射玩家本地的 AsianBlend Illustrious 或明确兼容版本。文件名可以不同。'
      )
    ],
    recommendedParameters: {
      steps: 28,
      cfg: 5.5,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras'
    }
  },
  {
    recipeId: 'builtin-comfy-recipe-duchaiten-character',
    origin: 'built-in',
    name: 'Duchaiten 半油画人物',
    description: 'Duchaiten SDXL 人物配方。适合半油画人物方向，不承诺参考图身份复刻。',
    hidden: false,
    order: 1,
    compatiblePurposes: ['character'],
    companionStylePresetId: 'builtin-style-comfy-duchaiten-character',
    recommendedPromptDialectPresetId: 'builtin-dialect-sd-sdxl',
    assetSlots: [
      checkpointSlot(
        'checkpoint',
        'Duchaiten SDXL checkpoint',
        ['duchaitenAiartSDXL_v33515.safetensors'],
        '映射玩家本地的 Duchaiten SDXL 或明确兼容版本。'
      )
    ],
    recommendedParameters: {
      steps: 28,
      cfg: 5.5,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras'
    }
  },
  {
    recipeId: 'builtin-comfy-recipe-duchaiten-scene',
    origin: 'built-in',
    name: 'Duchaiten 雨夜场景',
    description: 'Duchaiten SDXL 场景配方，适合旧香港雨夜、仓库、码头等剧情环境；精确人数仍需工作流控制。',
    hidden: false,
    order: 2,
    compatiblePurposes: ['narrative-scene'],
    companionStylePresetId: 'builtin-style-comfy-duchaiten-scene',
    recommendedPromptDialectPresetId: 'builtin-dialect-sd-sdxl',
    assetSlots: [
      checkpointSlot(
        'checkpoint',
        'Duchaiten SDXL checkpoint',
        ['duchaitenAiartSDXL_v33515.safetensors'],
        '映射玩家本地的 Duchaiten SDXL 或明确兼容版本。'
      )
    ],
    recommendedParameters: {
      steps: 32,
      cfg: 5.5,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras'
    }
  },
  {
    recipeId: 'builtin-comfy-recipe-rin-softsketch',
    origin: 'built-in',
    name: 'Rin SoftSketch 柔绘',
    description: 'Rin SoftSketch 的柔和手绘人物与事件图配方，不承诺参考图身份复刻。',
    hidden: false,
    order: 3,
    compatiblePurposes: ['character', 'narrative-scene'],
    companionStylePresetId: 'builtin-style-comfy-rin-softsketch',
    recommendedPromptDialectPresetId: 'builtin-dialect-sd-sdxl',
    assetSlots: [
      checkpointSlot(
        'checkpoint',
        'Rin SoftSketch checkpoint',
        ['rinSoftsketch_v30.safetensors'],
        '映射玩家本地的 Rin SoftSketch 或明确兼容版本。'
      )
    ],
    recommendedParameters: {
      steps: 28,
      cfg: 5.5,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras'
    }
  },
  {
    recipeId: 'builtin-comfy-recipe-wai-mature-anime',
    origin: 'built-in',
    name: 'WAI 成熟日漫',
    description: 'WAI Illustrious 基础动漫配方，可作为兼容 Illustrious 风格 LoRA 的底模。',
    hidden: false,
    order: 4,
    compatiblePurposes: ['character', 'narrative-scene'],
    companionStylePresetId: 'builtin-style-comfy-wai-mature-anime',
    recommendedPromptDialectPresetId: ILLUSTRIOUS_DIALECT,
    assetSlots: [
      checkpointSlot(
        'checkpoint',
        'WAI Illustrious checkpoint',
        ['waiIllustriousSDXL_v170.safetensors'],
        '映射玩家本地的 WAI Illustrious 或明确兼容版本。'
      )
    ],
    recommendedParameters: {
      steps: 28,
      cfg: 5.5,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras'
    }
  },
  {
    recipeId: 'builtin-comfy-recipe-hojo-urban-manga',
    origin: 'built-in',
    name: '北条司都市漫画',
    description: 'WAI Illustrious 底模与北条司都市漫画风格 LoRA 的双资产配方。',
    hidden: false,
    order: 5,
    compatiblePurposes: ['character', 'narrative-scene'],
    companionStylePresetId: 'builtin-style-comfy-hojo-urban-manga',
    recommendedPromptDialectPresetId: ILLUSTRIOUS_DIALECT,
    assetSlots: [
      checkpointSlot(
        'checkpoint',
        'WAI Illustrious checkpoint',
        ['waiIllustriousSDXL_v170.safetensors'],
        'LoRA 实测使用的 Illustrious 系底模；玩家可映射明确兼容版本。'
      ),
      loraSlot(
        'style-lora',
        '北条司风格 LoRA',
        ['HojoStyle\\Tsukasa Hojo_illustriousXL.safetensors'],
        0.55,
        '必须把文件名、model strength 和 clip strength 映射到工作流开放参数。'
      )
    ],
    recommendedParameters: {
      steps: 28,
      cfg: 5.5,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras'
    }
  },
  {
    recipeId: 'builtin-comfy-recipe-oda-non',
    origin: 'built-in',
    name: '织田 non 成熟绘风',
    description: 'WAI Illustrious 底模与 oda-non Illustrious LoRA 的双资产配方。',
    hidden: false,
    order: 6,
    compatiblePurposes: ['character', 'narrative-scene'],
    companionStylePresetId: 'builtin-style-comfy-oda-non',
    recommendedPromptDialectPresetId: ILLUSTRIOUS_DIALECT,
    assetSlots: [
      checkpointSlot(
        'checkpoint',
        'WAI Illustrious checkpoint',
        ['waiIllustriousSDXL_v170.safetensors'],
        'LoRA 实测使用的 Illustrious 系底模；玩家可映射明确兼容版本。'
      ),
      loraSlot(
        'style-lora',
        '织田 non 风格 LoRA',
        ['oda-non_IL.safetensors', 'OdaNonIllust10.safetensors'],
        0.6,
        '不同 LoRA 训练底模和触发词可能不同；请按本地模型说明调整。',
        '可选；如本地 LoRA 有触发词，请由玩家写入提示词风格预设。'
      )
    ],
    recommendedParameters: {
      steps: 28,
      cfg: 5.5,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras'
    }
  },
  {
    recipeId: 'builtin-comfy-recipe-izayoi-seishin',
    origin: 'built-in',
    name: '十六夜清心柔绘',
    description: 'WAI Illustrious 底模与十六夜清心 Illustrious LoRA 的双资产配方。',
    hidden: false,
    order: 7,
    compatiblePurposes: ['character', 'narrative-scene'],
    companionStylePresetId: 'builtin-style-comfy-izayoi-seishin',
    recommendedPromptDialectPresetId: ILLUSTRIOUS_DIALECT,
    assetSlots: [
      checkpointSlot(
        'checkpoint',
        'WAI Illustrious checkpoint',
        ['waiIllustriousSDXL_v170.safetensors'],
        'LoRA 实测使用的 Illustrious 系底模；玩家可映射明确兼容版本。'
      ),
      loraSlot(
        'style-lora',
        '十六夜清心风格 LoRA',
        ['izayoi_seishin_IL.safetensors'],
        0.6,
        '必须把文件名、model strength 和 clip strength 映射到工作流开放参数。'
      )
    ],
    recommendedParameters: {
      steps: 28,
      cfg: 5.5,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras'
    }
  }
] as const;

export function cloneBuiltInComfyStyleRecipes(): ComfyStyleRecipe[] {
  return [...structuredClone(BUILT_IN_COMFY_STYLE_RECIPES)];
}

export function normalizeComfyStyleRecipeOrder(
  recipes: readonly ComfyStyleRecipe[]
): ComfyStyleRecipe[] {
  return recipes.map((recipe, order) => ({ ...structuredClone(recipe), order }));
}

function customId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

export function createCustomComfyStyleRecipe(name: string): ComfyStyleRecipe {
  return {
    recipeId: customId('custom-comfy-recipe'),
    origin: 'custom',
    name,
    description: '玩家自定义 ComfyUI 风格配方。',
    hidden: false,
    order: 0,
    compatiblePurposes: ['character', 'narrative-scene'],
    companionStylePresetId: 'builtin-style-hong-kong-crime-realism',
    recommendedPromptDialectPresetId: 'builtin-dialect-generic-en-tags',
    assetSlots: [
      checkpointSlot(
        'checkpoint',
        'Checkpoint',
        [],
        '映射玩家本地 checkpoint；文件名不需要与他人完全相同。'
      )
    ],
    recommendedParameters: {}
  };
}

export function duplicateComfyStyleRecipe(source: ComfyStyleRecipe): ComfyStyleRecipe {
  return {
    ...structuredClone(source),
    recipeId: customId('custom-comfy-recipe'),
    origin: 'custom',
    name: `${source.name}（副本）`,
    hidden: false,
    order: 0
  };
}

export function restoreBuiltInComfyStyleRecipe(
  recipes: readonly ComfyStyleRecipe[],
  recipeId: string
): ComfyStyleRecipe[] {
  const builtIn = BUILT_IN_COMFY_STYLE_RECIPES.find((recipe) => recipe.recipeId === recipeId);
  if (!builtIn) throw new Error('只能恢复内置 ComfyUI 风格配方。');
  return normalizeComfyStyleRecipeOrder(recipes.map((recipe) =>
    recipe.recipeId === recipeId
      ? { ...structuredClone(builtIn), order: recipe.order }
      : structuredClone(recipe)
  ));
}

export function createComfyStyleRecipeApplication(
  recipe: ComfyStyleRecipe,
  mode: ComfyStyleRecipeApplication['mode'] = 'mapped'
): ComfyStyleRecipeApplication {
  return {
    mode,
    recipeSnapshot: structuredClone(recipe),
    assetMappings: Object.fromEntries(recipe.assetSlots.map((slot) => [
      slot.slotId,
      {
        fileName: slot.filenameHints[0],
        modelStrength: slot.recommendedModelStrength,
        clipStrength: slot.recommendedClipStrength
      }
    ]))
  };
}

function purposeForVariant(variantKey: string): ComfyStyleRecipePurpose {
  return variantKey === 'narrative-scene' ? 'narrative-scene' : 'character';
}

export function isComfyStyleRecipeCompatibleWithVariant(
  recipe: ComfyStyleRecipe,
  variantKey: string
): boolean {
  return recipe.compatiblePurposes.includes(purposeForVariant(variantKey));
}

function findParameter(
  workflow: ComfyWorkflowTemplate,
  key: string | undefined
) {
  return key
    ? workflow.exposedParameters?.find((parameter) => parameter.key === key)
    : undefined;
}

function supportsFileValue(parameter: ReturnType<typeof findParameter>): boolean {
  return parameter?.valueType === 'text' || parameter?.valueType === 'select';
}

function supportsStrengthValue(parameter: ReturnType<typeof findParameter>): boolean {
  return parameter?.valueType === 'number' || parameter?.valueType === 'integer';
}

export function resolveComfyStyleRecipeCompatibility(
  application: ComfyStyleRecipeApplication,
  workflow: ComfyWorkflowTemplate | undefined
): ComfyStyleRecipeCompatibility {
  if (application.mode === 'prompt-only') {
    return {
      status: 'prompt-only',
      summary: '仅提示词近似',
      details: ['不会加载 checkpoint 或 LoRA，也不保证复现配方画风。']
    };
  }
  if (!workflow) {
    return {
      status: 'workflow-incompatible',
      summary: '工作流不兼容',
      details: ['请先选择一个 ComfyUI API 工作流。']
    };
  }

  const missingMappings: string[] = [];
  const missingAssets: string[] = [];
  const incompatible: string[] = [];
  for (const slot of application.recipeSnapshot.assetSlots) {
    const mapping = application.assetMappings[slot.slotId] ?? {};
    if (!mapping.fileName && slot.required) {
      missingMappings.push(`${slot.label}尚未填写本地文件名`);
    }
    if (slot.kind === 'checkpoint') {
      if (!workflow.bindings.checkpoint) {
        incompatible.push(`${slot.label}需要工作流声明 checkpoint 标准绑定`);
      }
      continue;
    }
    if (!mapping.fileParameterKey) {
      if (slot.required) missingMappings.push(`${slot.label}尚未映射 LoRA 文件参数`);
    } else {
      const fileParameter = findParameter(workflow, mapping.fileParameterKey);
      if (!fileParameter || !supportsFileValue(fileParameter)) {
        incompatible.push(`${slot.label}的文件参数必须映射到 text 或 select 开放参数`);
      } else if (
        mapping.fileName
        && fileParameter.valueType === 'select'
        && !fileParameter.options?.some((option) => option.value === mapping.fileName)
      ) {
        missingAssets.push(`${slot.label}文件不在工作流开放的候选列表中`);
      }
    }
    for (const [label, key, value] of [
      ['model strength', mapping.modelStrengthParameterKey, mapping.modelStrength],
      ['clip strength', mapping.clipStrengthParameterKey, mapping.clipStrength]
    ] as const) {
      if (value === undefined) continue;
      if (!key) {
        missingMappings.push(`${slot.label}尚未映射 ${label}`);
        continue;
      }
      const strengthParameter = findParameter(workflow, key);
      if (!strengthParameter || !supportsStrengthValue(strengthParameter)) {
        incompatible.push(`${slot.label}的 ${label} 必须映射到 number 或 integer 开放参数`);
      } else if (
        (
          strengthParameter.min !== undefined
          && value < strengthParameter.min
        )
        || (
          strengthParameter.max !== undefined
          && value > strengthParameter.max
        )
      ) {
        incompatible.push(`${slot.label}的 ${label} 超出工作流开放范围`);
      }
    }
  }
  if (incompatible.length) {
    return { status: 'workflow-incompatible', summary: '工作流不兼容', details: incompatible };
  }
  if (missingAssets.length) {
    return { status: 'missing-asset', summary: '缺少本地资产', details: missingAssets };
  }
  if (missingMappings.length) {
    return { status: 'needs-mapping', summary: '需要完成映射', details: missingMappings };
  }
  return {
    status: 'ready',
    summary: '配方可应用',
    details: ['所需资产槽位已映射；实际文件可用性仍以 ComfyUI 执行结果为准。']
  };
}

export function resolveComfyStyleRecipeAssetOverrides(
  application: ComfyStyleRecipeApplication,
  workflow: ComfyWorkflowTemplate
): {
  checkpoint?: string;
  custom: Record<string, ComfyWorkflowParameterValue>;
} {
  const compatibility = resolveComfyStyleRecipeCompatibility(application, workflow);
  if (application.mode === 'prompt-only') return { custom: {} };
  if (compatibility.status !== 'ready') {
    throw new Error(`${compatibility.summary}：${compatibility.details.join('；')}`);
  }
  let checkpoint: string | undefined;
  const custom: Record<string, ComfyWorkflowParameterValue> = {};
  for (const slot of application.recipeSnapshot.assetSlots) {
    const mapping = application.assetMappings[slot.slotId];
    if (!mapping) continue;
    if (slot.kind === 'checkpoint') {
      checkpoint = mapping.fileName;
      continue;
    }
    if (mapping.fileParameterKey && mapping.fileName) {
      custom[mapping.fileParameterKey] = mapping.fileName;
    }
    if (mapping.modelStrengthParameterKey && mapping.modelStrength !== undefined) {
      custom[mapping.modelStrengthParameterKey] = mapping.modelStrength;
    }
    if (mapping.clipStrengthParameterKey && mapping.clipStrength !== undefined) {
      custom[mapping.clipStrengthParameterKey] = mapping.clipStrength;
    }
  }
  return { checkpoint, custom };
}
