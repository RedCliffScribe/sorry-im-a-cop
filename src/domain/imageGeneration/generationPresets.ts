import { z } from 'zod';
import {
  comfyStyleRecipeApplicationSchema,
  resolveComfyStyleRecipeAssetOverrides
} from './comfyStyleRecipes';
import { IMAGE_PROVIDER_TYPES, type ImageProviderType } from './probe';
import {
  CHARACTER_VISUAL_PURPOSES,
  resolveBuiltInImagePromptDialectFamily,
  resolveDefaultImagePromptDialectPresetId,
  type CharacterVisualPurpose
} from './promptConversion';
import {
  imageGenerationDefaultsSchema,
  type ImageGenerationDefaults
} from './visualRepository';
import {
  createExecutionFingerprint,
  resolveComfyWorkflowParameterOverrides,
  type ComfyWorkflowTemplate,
  type ImageApiProfile
} from './profile';
import type { CharacterDraftExecutionConfig } from './characterVisualWorkflow';

export const IMAGE_GENERATION_VARIANT_KEYS = [
  ...CHARACTER_VISUAL_PURPOSES,
  'narrative-scene'
] as const;

export type ImageGenerationVariantKey = CharacterVisualPurpose | 'narrative-scene';

const routingTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('model'), modelId: z.string().trim().min(1).max(1000) }).strict(),
  z.object({
    kind: z.literal('comfy-workflow'),
    workflowTemplateId: z.string().trim().min(1).max(1000)
  }).strict()
]);

const currentImageGenerationPresetSchema = z.object({
  presetId: z.string().trim().min(1).max(1000),
  name: z.string().trim().min(1).max(200),
  profileId: z.string().trim().min(1).max(1000),
  providerType: z.enum(IMAGE_PROVIDER_TYPES),
  variantKey: z.enum(IMAGE_GENERATION_VARIANT_KEYS),
  routingTarget: routingTargetSchema,
  promptDialectPresetId: z.string().trim().min(1).max(1000),
  comfyStyleRecipe: comfyStyleRecipeApplicationSchema.optional(),
  targetAspectRatio: z.string().trim().min(1).max(32),
  generationParameters: imageGenerationDefaultsSchema,
  revision: z.number().int().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
}).strict().superRefine((preset, context) => {
  if (preset.generationParameters.providerType !== preset.providerType) {
    context.addIssue({
      code: 'custom',
      path: ['generationParameters', 'providerType'],
      message: '生成参数供应商必须与预设供应商一致'
    });
  }
  if (
    preset.generationParameters.providerType === 'openai-images' &&
    preset.generationParameters.outputFormat === 'png' &&
    preset.generationParameters.outputCompression !== undefined
  ) {
    context.addIssue({
      code: 'custom',
      path: ['generationParameters', 'outputCompression'],
      message: 'PNG 输出不使用压缩质量；请仅在 JPEG 或 WebP 时设置'
    });
  }
  if (preset.providerType === 'comfyui-workflow') {
    if (preset.routingTarget.kind !== 'comfy-workflow') {
      context.addIssue({ code: 'custom', path: ['routingTarget'], message: 'ComfyUI 预设必须绑定工作流' });
    } else if (
      preset.generationParameters.providerType === 'comfyui-workflow' &&
      preset.generationParameters.workflowTemplateId !== preset.routingTarget.workflowTemplateId
    ) {
      context.addIssue({ code: 'custom', path: ['generationParameters', 'workflowTemplateId'], message: '参数工作流与路由目标不一致' });
    }
  } else {
    if (preset.routingTarget.kind !== 'model') {
      context.addIssue({ code: 'custom', path: ['routingTarget'], message: '云端或 SD WebUI 预设必须绑定模型' });
    }
    if (preset.comfyStyleRecipe) {
      context.addIssue({ code: 'custom', path: ['comfyStyleRecipe'], message: '只有 ComfyUI 生成预设可以绑定 ComfyUI 风格配方' });
    }
  }
});

export type ImageGenerationPreset = z.infer<typeof currentImageGenerationPresetSchema>;

function migrateImageGenerationPreset(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const preset = value as Record<string, unknown>;
  const routingTarget = preset.routingTarget && typeof preset.routingTarget === 'object' && !Array.isArray(preset.routingTarget)
    ? preset.routingTarget as Record<string, unknown>
    : undefined;
  return {
    ...preset,
    promptDialectPresetId: preset.promptDialectPresetId ??
      resolveDefaultImagePromptDialectPresetId(
        String(preset.providerType ?? ''),
        routingTarget?.kind === 'model' ? String(routingTarget.modelId ?? '') : undefined
      )
  };
}

export const imageGenerationPresetSchema = z.preprocess(
  migrateImageGenerationPreset,
  currentImageGenerationPresetSchema
) as z.ZodType<ImageGenerationPreset>;

export interface ImageGenerationPresetRepository {
  get(profileId: string, variantKey: ImageGenerationVariantKey): Promise<ImageGenerationPreset | undefined>;
  list(profileId: string): Promise<ImageGenerationPreset[]>;
  save(preset: ImageGenerationPreset): Promise<void>;
  delete(profileId: string, variantKey: ImageGenerationVariantKey): Promise<void>;
  clearProfile(profileId: string): Promise<void>;
}

export function createImageGenerationPresetId(profileId: string, variantKey: ImageGenerationVariantKey): string {
  return `image-preset:${profileId}:${variantKey}`;
}

export function createImageGenerationPreset(input: {
  name: string;
  profileId: string;
  providerType: ImageProviderType;
  variantKey: ImageGenerationVariantKey;
  routingTarget: ImageGenerationPreset['routingTarget'];
  promptDialectPresetId?: string;
  comfyStyleRecipe?: ImageGenerationPreset['comfyStyleRecipe'];
  targetAspectRatio: string;
  generationParameters: ImageGenerationDefaults;
  now?: string;
}): ImageGenerationPreset {
  const now = input.now ?? new Date().toISOString();
  return imageGenerationPresetSchema.parse({
    presetId: createImageGenerationPresetId(input.profileId, input.variantKey),
    name: input.name,
    profileId: input.profileId,
    providerType: input.providerType,
    variantKey: input.variantKey,
    routingTarget: input.routingTarget,
    promptDialectPresetId: input.promptDialectPresetId ??
      resolveDefaultImagePromptDialectPresetId(
        input.providerType,
        input.routingTarget.kind === 'model' ? input.routingTarget.modelId : undefined
      ),
    comfyStyleRecipe: input.comfyStyleRecipe,
    targetAspectRatio: input.targetAspectRatio,
    generationParameters: input.generationParameters,
    revision: 1,
    createdAt: now,
    updatedAt: now
  });
}

export function assertComfyGenerationPresetBindings(
  preset: ImageGenerationPreset,
  workflow: ComfyWorkflowTemplate
): void {
  if (preset.generationParameters.providerType !== 'comfyui-workflow') return;
  if (preset.comfyStyleRecipe) {
    resolveComfyStyleRecipeAssetOverrides(preset.comfyStyleRecipe, workflow);
  }
  for (const [key, value] of Object.entries(preset.generationParameters.overrides)) {
    if (key === 'custom') continue;
    if (value !== undefined && !workflow.bindings[key as keyof typeof workflow.bindings]) {
      throw new Error(`ComfyUI 预设字段 ${key} 没有对应的工作流绑定。`);
    }
  }
  resolveComfyWorkflowParameterOverrides(workflow, preset.generationParameters.overrides.custom);
}

export async function applyImageGenerationPreset(input: {
  base: CharacterDraftExecutionConfig;
  profile: ImageApiProfile;
  variantKey: ImageGenerationVariantKey;
  preset: ImageGenerationPreset;
  workflow?: ComfyWorkflowTemplate;
}): Promise<CharacterDraftExecutionConfig> {
  const preset = imageGenerationPresetSchema.parse(input.preset);
  if (preset.profileId !== input.profile.profileId) throw new Error('生成预设不属于当前图片档案。');
  if (preset.providerType !== input.profile.providerType) throw new Error('生成预设供应商与当前图片档案不一致。');
  if (preset.variantKey !== input.variantKey) throw new Error('生成预设用途与当前图片任务不一致。');

  if (preset.routingTarget.kind === 'comfy-workflow') {
    if (input.profile.providerType !== 'comfyui-workflow' || !input.workflow) {
      throw new Error('生成预设需要已选择的 ComfyUI API 工作流。');
    }
    if (input.workflow.workflowTemplateId !== preset.routingTarget.workflowTemplateId) {
      throw new Error('当前选择的 ComfyUI 工作流与生成预设不一致。');
    }
    if (preset.generationParameters.providerType !== 'comfyui-workflow') {
      throw new Error('ComfyUI 生成预设的参数类型不一致。');
    }
    const comfyParameters = preset.generationParameters;
    assertComfyGenerationPresetBindings(preset, input.workflow);
    const recipeOverrides = preset.comfyStyleRecipe
      ? resolveComfyStyleRecipeAssetOverrides(preset.comfyStyleRecipe, input.workflow)
      : undefined;
    const resolvedGenerationParameters: ImageGenerationDefaults = {
      ...comfyParameters,
      overrides: {
        ...comfyParameters.overrides,
        checkpoint: recipeOverrides?.checkpoint
          ?? comfyParameters.overrides.checkpoint,
        custom: {
          ...comfyParameters.overrides.custom,
          ...recipeOverrides?.custom
        }
      }
    };
    return {
      ...input.base,
      imageGenerationPresetId: preset.presetId,
      imageGenerationPresetRevision: preset.revision,
      targetAspectRatio: preset.targetAspectRatio,
      promptDialectPresetId: preset.promptDialectPresetId,
      promptDialectFamily: resolveBuiltInImagePromptDialectFamily(preset.promptDialectPresetId),
      executionTarget: {
        kind: 'comfy-workflow',
        workflowTemplateId: input.workflow.workflowTemplateId,
        workflowRevision: input.workflow.revision
      },
      generationParameters: structuredClone(resolvedGenerationParameters),
      executionFingerprint: await createExecutionFingerprint({
        connectionFingerprint: input.base.connectionFingerprint,
        presetId: preset.presetId,
        presetRevision: preset.revision,
        workflowHash: input.workflow.workflowHash,
        executionParameters: {
          targetAspectRatio: preset.targetAspectRatio,
          promptDialectPresetId: preset.promptDialectPresetId,
          comfyStyleRecipe: preset.comfyStyleRecipe,
          generationParameters: resolvedGenerationParameters
        }
      })
    };
  }

  if (preset.routingTarget.kind !== 'model') throw new Error('非 ComfyUI 生成预设必须使用模型路由。');
  const modelTarget = preset.routingTarget;
  if (input.profile.providerType === 'comfyui-workflow') throw new Error('ComfyUI 生成预设不能使用模型路由。');
  if (!input.profile.models.some((model) => model.modelId === modelTarget.modelId)) {
    throw new Error('生成预设绑定的模型已不在当前图片档案中。');
  }
  return {
    ...input.base,
    imageGenerationPresetId: preset.presetId,
    imageGenerationPresetRevision: preset.revision,
    targetAspectRatio: preset.targetAspectRatio,
    promptDialectPresetId: preset.promptDialectPresetId,
    promptDialectFamily: resolveBuiltInImagePromptDialectFamily(preset.promptDialectPresetId),
    executionTarget: { kind: 'model', modelId: modelTarget.modelId },
    generationParameters: structuredClone(preset.generationParameters),
    executionFingerprint: await createExecutionFingerprint({
      connectionFingerprint: input.base.connectionFingerprint,
      modelId: modelTarget.modelId,
      presetId: preset.presetId,
      presetRevision: preset.revision,
      executionParameters: {
        targetAspectRatio: preset.targetAspectRatio,
        promptDialectPresetId: preset.promptDialectPresetId,
        generationParameters: preset.generationParameters
      }
    })
  };
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

export class IndexedDbImageGenerationPresetRepository implements ImageGenerationPresetRepository {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dbName = 'sorry-im-a-cop-v2-image-generation-presets') {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('presets')) {
          const store = request.result.createObjectStore('presets', { keyPath: 'presetId' });
          store.createIndex('profileId', 'profileId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开文生图预设数据库。'));
    });
  }

  async get(profileId: string, variantKey: ImageGenerationVariantKey): Promise<ImageGenerationPreset | undefined> {
    const db = await this.open();
    try {
      const transaction = db.transaction('presets', 'readonly');
      const value = await requestToPromise<unknown>(
        transaction.objectStore('presets').get(createImageGenerationPresetId(profileId, variantKey))
      );
      return value === undefined ? undefined : imageGenerationPresetSchema.parse(value);
    } finally {
      db.close();
    }
  }

  async list(profileId: string): Promise<ImageGenerationPreset[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction('presets', 'readonly');
      const values = await requestToPromise<unknown[]>(
        transaction.objectStore('presets').index('profileId').getAll(profileId)
      );
      return values.map((value) => imageGenerationPresetSchema.parse(value))
        .sort((left, right) => left.variantKey.localeCompare(right.variantKey));
    } finally {
      db.close();
    }
  }

  save(preset: ImageGenerationPreset): Promise<void> {
    const parsed = imageGenerationPresetSchema.parse(preset);
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('presets', 'readwrite');
        transaction.objectStore('presets').put(parsed);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  delete(profileId: string, variantKey: ImageGenerationVariantKey): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('presets', 'readwrite');
        transaction.objectStore('presets').delete(createImageGenerationPresetId(profileId, variantKey));
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  clearProfile(profileId: string): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('presets', 'readwrite');
        const store = transaction.objectStore('presets');
        const request = store.index('profileId').openKeyCursor(IDBKeyRange.only(profileId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          store.delete(cursor.primaryKey);
          cursor.continue();
        };
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
        const transaction = db.transaction('presets', 'readwrite');
        transaction.objectStore('presets').clear();
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
