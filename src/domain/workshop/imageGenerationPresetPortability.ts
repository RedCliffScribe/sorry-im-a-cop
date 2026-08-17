import {
  calculateImageGenerationPresetPackageSha256V1,
  measureWorkshopPackageBytes,
  parseImageGenerationPresetPackageJsonV1,
  parseImageGenerationPresetPackageV1,
  WorkshopPackageContractError,
  type ImageGenerationPresetPackageV1
} from './workshopPackageContract';
import {
  type ComfyStyleRecipe
} from '../imageGeneration/comfyStyleRecipes';
import {
  createImageGenerationPreset,
  imageGenerationPresetSchema,
  type ImageGenerationPreset,
  type ImageGenerationPresetRepository,
  type ImageGenerationVariantKey
} from '../imageGeneration/generationPresets';
import type { ImageProviderType } from '../imageGeneration/probe';
import type {
  ComfyWorkflowTemplate,
  ImageApiProfile
} from '../imageGeneration/profile';
import {
  resolveDefaultImagePromptDialectPresetId,
  type ImagePromptDialectPreset,
  type ImageStylePreset
} from '../imageGeneration/promptConversion';
import type {
  ImagePromptTemplateRepository,
  ImagePromptTemplateSettings
} from '../imageGeneration/promptConversion/ImagePromptTemplateRepository';
import {
  imageGenerationDefaultsSchema,
  type ImageGenerationDefaults
} from '../imageGeneration/visualRepository';
import type {
  WorkshopImportConflictStrategy,
  WorkshopImportSourceMetadata,
  WorkshopImportSourceRecord,
  WorkshopImportSourceRepository,
  WorkshopPackageExportResult,
  WorkshopPackageImportPreview,
  WorkshopPackageImportResult,
  WorkshopPackageLocalEnvironment,
  WorkshopPackageManifestInput,
  WorkshopVariantImportMapping
} from './types';

type PackageVariant = ImageGenerationPresetPackageV1['content']['variants'][number];
type PackageSafeParameters = ImageGenerationPresetPackageV1['content']['safeGenerationParameters'][number]['parameters'];
interface PackageComfyResourceHint {
  resourceRef: string;
  kind: 'checkpoint-family' | 'lora-family';
  label: string;
  familyHint: string;
  required: boolean;
  triggerWords?: string;
  recommendedModelStrength?: number;
  recommendedClipStrength?: number;
}

interface PackageComfyStyleRecipe {
  recipeRef: string;
  name: string;
  description: string;
  compatiblePurposes: Array<'character' | 'narrative-scene'>;
  companionStyleRef: string;
  dialectRef: string;
  resourceHints: PackageComfyResourceHint[];
  recommendedParameters: {
    steps?: number;
    cfg?: number;
    sampler?: string;
    scheduler?: string;
  };
}

export interface LoadedWorkshopPackage {
  workshopPackage: ImageGenerationPresetPackageV1;
  packageSha256: string;
  byteLength: number;
}

interface WorkshopLocalImportRepositories {
  generationPresets: ImageGenerationPresetRepository;
  promptTemplates: ImagePromptTemplateRepository;
  importSources: WorkshopImportSourceRepository;
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

function packageRef(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function requireStyle(
  settings: ImagePromptTemplateSettings,
  stylePresetId: string
): ImageStylePreset {
  const style = settings.stylePresets.find((candidate) => candidate.stylePresetId === stylePresetId);
  if (!style) throw new Error(`图片风格库中找不到预设：${stylePresetId}`);
  return style;
}

function requireDialect(
  settings: ImagePromptTemplateSettings,
  dialectPresetId: string
): ImagePromptDialectPreset {
  const dialect = settings.dialectPresets.find(
    (candidate) => candidate.dialectPresetId === dialectPresetId
  );
  if (!dialect) throw new Error(`图片方言库中找不到预设：${dialectPresetId}`);
  return dialect;
}

function selectedStyleIdsForVariant(
  settings: ImagePromptTemplateSettings,
  variantKey: ImageGenerationVariantKey
): string[] {
  const selection = settings.styleSelection;
  const isScene = variantKey === 'narrative-scene';
  const specificId = isScene
    ? selection.narrativeSceneStylePresetId
    : selection.characterStylePresetId;
  const mode = isScene
    ? selection.narrativeSceneStyleMode
    : selection.characterStyleMode;
  if (!specificId || specificId === selection.globalStylePresetId) {
    return [selection.globalStylePresetId];
  }
  return mode === 'replace-global'
    ? [specificId]
    : [selection.globalStylePresetId, specificId];
}

function safeParametersFromLocalPreset(preset: ImageGenerationPreset): Record<string, unknown> {
  const parameters = preset.generationParameters;
  switch (parameters.providerType) {
    case 'openai-images':
      return {
        providerType: parameters.providerType,
        requestedImageCount: parameters.requestedImageCount,
        size: structuredClone(parameters.size),
        quality: parameters.quality,
        outputFormat: parameters.outputFormat,
        outputCompression: parameters.outputCompression,
        background: parameters.background
      };
    case 'xai-images':
      return {
        providerType: parameters.providerType,
        requestedImageCount: parameters.requestedImageCount,
        aspectRatio: parameters.aspectRatio,
        resolution: parameters.resolution
      };
    case 'gemini-image':
      return {
        providerType: parameters.providerType,
        requestedImageCount: parameters.requestedImageCount,
        aspectRatio: parameters.aspectRatio,
        imageSize: parameters.imageSize,
        mimeType: parameters.mimeType
      };
    case 'alibaba-model-studio':
      return {
        providerType: parameters.providerType,
        requestedImageCount: parameters.requestedImageCount,
        size: structuredClone(parameters.size),
        watermark: parameters.watermark,
        promptEnhancement: parameters.promptEnhancement,
        thinkingMode: parameters.thinkingMode
      };
    case 'novelai-image':
      return {
        providerType: parameters.providerType,
        requestedImageCount: parameters.requestedImageCount,
        width: parameters.width,
        height: parameters.height,
        sampler: parameters.sampler,
        steps: parameters.steps,
        guidanceScale: parameters.guidanceScale,
        cfgRescale: parameters.cfgRescale,
        noiseSchedule: parameters.noiseSchedule,
        qualityToggle: parameters.qualityToggle,
        undesiredContentPreset: parameters.undesiredContentPreset,
        smea: parameters.smea,
        smeaDynamic: parameters.smeaDynamic
      };
    case 'comfyui-workflow':
      return {
        providerType: parameters.providerType,
        width: parameters.overrides.width,
        height: parameters.overrides.height,
        steps: parameters.overrides.steps,
        cfg: parameters.overrides.cfg,
        sampler: parameters.overrides.sampler,
        scheduler: parameters.overrides.scheduler
      };
    case 'sd-webui':
      return {
        providerType: parameters.providerType,
        requestedImageCount: parameters.requestedImageCount,
        width: parameters.width,
        height: parameters.height,
        samplerName: parameters.samplerName,
        scheduler: parameters.scheduler,
        steps: parameters.steps,
        cfgScale: parameters.cfgScale,
        clipSkip: parameters.clipSkip,
        restoreFaces: parameters.restoreFaces,
        tiling: parameters.tiling,
        hiresFix: parameters.hiresFix ? structuredClone(parameters.hiresFix) : undefined
      };
  }
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function collectRequiredFeatures(
  presets: readonly ImageGenerationPreset[],
  styles: readonly ImageStylePreset[]
): string[] {
  const features = new Set<string>();
  if (styles.some((style) => Object.values(style.modifiers).some((modifier) => modifier.negative.trim()))) {
    features.add('negative-prompt');
  }
  for (const preset of presets) {
    const parameters = preset.generationParameters;
    if ('requestedImageCount' in parameters && parameters.requestedImageCount > 1) {
      features.add('multiple-outputs');
    }
    if (parameters.providerType === 'openai-images' && parameters.background === 'transparent') {
      features.add('transparent-background');
    }
    if (
      ['openai-images', 'alibaba-model-studio'].includes(parameters.providerType)
      || ['novelai-image', 'comfyui-workflow', 'sd-webui'].includes(parameters.providerType)
    ) {
      features.add('custom-dimensions');
    }
    if (['xai-images', 'gemini-image'].includes(parameters.providerType)) {
      features.add('custom-aspect-ratio');
    }
    if (preset.routingTarget.kind === 'model') features.add('model-family-hint');
    if (preset.comfyStyleRecipe) features.add('comfy-style-recipe');
  }
  return [...features];
}

function recipeToPackage(
  recipe: ComfyStyleRecipe,
  recipeRef: string,
  styleRef: string,
  dialectRef: string
): PackageComfyStyleRecipe {
  return {
    recipeRef,
    name: recipe.name,
    description: recipe.description,
    compatiblePurposes: [...recipe.compatiblePurposes],
    companionStyleRef: styleRef,
    dialectRef,
    resourceHints: recipe.assetSlots.map((slot, index) => removeUndefined({
      resourceRef: packageRef('resource', index),
      kind: slot.kind === 'checkpoint' ? 'checkpoint-family' : 'lora-family',
      label: slot.label,
      familyHint: slot.label,
      required: slot.required,
      triggerWords: slot.triggerWords,
      recommendedModelStrength: slot.recommendedModelStrength,
      recommendedClipStrength: slot.recommendedClipStrength
    })) as PackageComfyResourceHint[],
    recommendedParameters: removeUndefined({ ...recipe.recommendedParameters })
  };
}

export async function createImageGenerationWorkshopPackage(input: {
  presets: readonly ImageGenerationPreset[];
  promptTemplateSettings: ImagePromptTemplateSettings;
  manifest: WorkshopPackageManifestInput;
}): Promise<WorkshopPackageExportResult> {
  if (!input.presets.length) throw new Error('至少选择一个已保存的文生图生成预设。');
  const presets = input.presets.map((preset) => imageGenerationPresetSchema.parse(preset));
  const seenSlots = new Set<string>();
  presets.forEach((preset) => {
    const slot = `${preset.profileId}:${preset.variantKey}`;
    if (seenSlots.has(slot)) throw new Error(`重复选择了本地预设槽位：${slot}`);
    seenSlots.add(slot);
  });

  const recipeById = new Map<string, ComfyStyleRecipe>();
  presets.forEach((preset) => {
    if (preset.comfyStyleRecipe) {
      recipeById.set(
        preset.comfyStyleRecipe.recipeSnapshot.recipeId,
        preset.comfyStyleRecipe.recipeSnapshot
      );
    }
  });

  const selectedStyleIds = unique(presets.flatMap((preset) => selectedStyleIdsForVariant(
    input.promptTemplateSettings,
    preset.variantKey
  )));
  recipeById.forEach((recipe) => selectedStyleIds.push(recipe.companionStylePresetId));
  const styleIds = unique(selectedStyleIds);
  const styles = styleIds.map((styleId) => requireStyle(input.promptTemplateSettings, styleId));
  const styleRefById = new Map(styles.map((style, index) => [style.stylePresetId, packageRef('style', index)]));

  const selectedDialectIds = unique([
    ...presets.map((preset) => preset.promptDialectPresetId),
    ...[...recipeById.values()].map((recipe) => recipe.recommendedPromptDialectPresetId)
  ]);
  const dialects = selectedDialectIds.map((dialectId) => requireDialect(
    input.promptTemplateSettings,
    dialectId
  ));
  const dialectRefById = new Map(dialects.map((dialect, index) => [
    dialect.dialectPresetId,
    packageRef('dialect', index)
  ]));
  const recipes = [...recipeById.values()];
  const recipeRefById = new Map(recipes.map((recipe, index) => [
    recipe.recipeId,
    packageRef('recipe', index)
  ]));

  const variants = presets.map((preset, index) => {
    const variantRef = packageRef('variant', index);
    const styleRefs = selectedStyleIdsForVariant(input.promptTemplateSettings, preset.variantKey)
      .map((styleId) => styleRefById.get(styleId))
      .filter((value): value is string => Boolean(value));
    return removeUndefined({
      variantRef,
      purpose: preset.variantKey,
      name: preset.name,
      providerType: preset.providerType,
      modelHint: preset.routingTarget.kind === 'model'
        ? preset.routingTarget.modelId
        : undefined,
      dialectRef: dialectRefById.get(preset.promptDialectPresetId),
      styleRefs,
      comfyStyleRecipeRef: preset.comfyStyleRecipe
        ? recipeRefById.get(preset.comfyStyleRecipe.recipeSnapshot.recipeId)
        : undefined,
      targetAspectRatio: preset.targetAspectRatio
    });
  });

  const styleSelection = input.promptTemplateSettings.styleSelection;
  const draft = {
    format: 'sorry-im-a-cop-v2-workshop-package',
    schemaVersion: 1,
    kind: 'image-generation-preset',
    manifest: structuredClone(input.manifest),
    compatibility: {
      providerTypes: unique(presets.map((preset) => preset.providerType)),
      modelHints: unique(presets.flatMap((preset) => preset.routingTarget.kind === 'model'
        ? [preset.routingTarget.modelId]
        : [])),
      requiredFeatures: collectRequiredFeatures(presets, styles)
    },
    content: {
      variants,
      stylePresets: styles.map((style) => ({
        styleRef: styleRefById.get(style.stylePresetId),
        name: style.name,
        description: style.description,
        modifiers: structuredClone(style.modifiers)
      })),
      dialectPresets: dialects.map((dialect) => ({
        dialectRef: dialectRefById.get(dialect.dialectPresetId),
        name: dialect.name,
        description: dialect.description,
        family: dialect.family,
        renderingInstruction: dialect.renderingInstruction,
        positivePrefix: dialect.positivePrefix,
        positiveSuffix: dialect.positiveSuffix,
        negativePrefix: dialect.negativePrefix,
        negativeSuffix: dialect.negativeSuffix
      })),
      comfyStyleRecipes: recipes.map((recipe) => recipeToPackage(
        recipe,
        recipeRefById.get(recipe.recipeId)!,
        styleRefById.get(recipe.companionStylePresetId)!,
        dialectRefById.get(recipe.recommendedPromptDialectPresetId)!
      )),
      styleSelection: removeUndefined({
        globalStyleRef: styleRefById.get(styleSelection.globalStylePresetId),
        characterStyleRef: styleSelection.characterStylePresetId
          ? styleRefById.get(styleSelection.characterStylePresetId)
          : undefined,
        narrativeSceneStyleRef: styleSelection.narrativeSceneStylePresetId
          ? styleRefById.get(styleSelection.narrativeSceneStylePresetId)
          : undefined,
        characterStyleMode: styleSelection.characterStyleMode,
        narrativeSceneStyleMode: styleSelection.narrativeSceneStyleMode
      }),
      safeGenerationParameters: presets.map((preset, index) => ({
        variantRef: packageRef('variant', index),
        parameters: removeUndefined(safeParametersFromLocalPreset(preset))
      }))
    }
  };

  const parsed = parseImageGenerationPresetPackageV1(draft);
  if (!parsed.success) throw new WorkshopPackageContractError(parsed.error);
  const json = JSON.stringify(parsed.data);
  const reparsed = parseImageGenerationPresetPackageJsonV1(json);
  if (!reparsed.success) throw new WorkshopPackageContractError(reparsed.error);
  return {
    workshopPackage: reparsed.data,
    json,
    packageSha256: await calculateImageGenerationPresetPackageSha256V1(reparsed.data),
    byteLength: measureWorkshopPackageBytes(json),
    excludedLocalFields: [
      'API 档案 ID、服务地址与凭据引用',
      '本地预设 ID、修订号与时间戳',
      '模型与 ComfyUI 工作流硬绑定（只保留模型提示）',
      '随机种子、checkpoint 与图生图输入',
      '原始 ComfyUI 工作流、任意自定义覆盖项与本机文件映射',
      '生成历史、诊断、图片、存档与玩家剧情内容'
    ]
  };
}

export async function loadImageGenerationWorkshopPackage(rawJson: string): Promise<LoadedWorkshopPackage> {
  const parsed = parseImageGenerationPresetPackageJsonV1(rawJson);
  if (!parsed.success) throw new WorkshopPackageContractError(parsed.error);
  return {
    workshopPackage: parsed.data,
    packageSha256: await calculateImageGenerationPresetPackageSha256V1(parsed.data),
    byteLength: parsed.byteLength
  };
}

function compareSemver(left: string, right: string): number {
  const parse = (value: string) => value.split('-', 1)[0].split('.').map((part) => Number(part));
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function validateVariantMapping(
  variant: PackageVariant,
  safeParameters: PackageSafeParameters | undefined,
  mapping: WorkshopVariantImportMapping | undefined,
  profiles: readonly ImageApiProfile[],
  workflows: readonly ComfyWorkflowTemplate[]
): string[] {
  if (!mapping) return ['尚未选择本地 API 档案和执行目标。'];
  const profile = profiles.find((candidate) => candidate.profileId === mapping.profileId);
  if (!profile) return ['选择的本地 API 档案不存在。'];
  const details: string[] = [];
  if (profile.providerType !== variant.providerType) details.push('本地档案供应商与分享包变体不一致。');
  if (
    profile.providerType === 'openai-images'
    && safeParameters?.providerType === 'openai-images'
  ) {
    const openAiSafeParameters = safeParameters as {
      providerType: 'openai-images';
      requestedImageCount?: number;
      size?: { mode: 'auto' } | {
        mode: 'dimensions';
        width: number;
        height: number;
      };
    };
    const overrides = profile.config.compatibilityOverrides;
    if (
      (openAiSafeParameters.requestedImageCount ?? 1) > 1
      && overrides?.multipleOutputs === false
    ) {
      details.push('目标档案明确不支持一次生成多张图片。');
    }
    if (
      openAiSafeParameters.size?.mode === 'dimensions'
      && overrides?.sizeMode !== undefined
      && overrides.sizeMode !== 'dimensions'
    ) {
      details.push('目标档案明确不支持自定义宽高。');
    }
  }
  if (variant.providerType === 'comfyui-workflow') {
    const routingTarget = mapping.routingTarget;
    if (routingTarget.kind !== 'comfy-workflow') {
      details.push('ComfyUI 变体必须映射到本地 API 工作流。');
    } else if (!workflows.some(
      (workflow) => workflow.workflowTemplateId === routingTarget.workflowTemplateId
    )) {
      details.push('选择的本地 ComfyUI API 工作流不存在。');
    }
  } else {
    const routingTarget = mapping.routingTarget;
    if (routingTarget.kind !== 'model') {
    details.push('该供应商变体必须映射到本地模型。');
    } else if (
      profile.providerType !== 'comfyui-workflow'
      && !profile.models.some((model) => model.modelId === routingTarget.modelId)
    ) {
      details.push('选择的模型不在本地档案模型列表中。');
    }
  }
  return details;
}

export function previewImageGenerationWorkshopImport(input: {
  workshopPackage: ImageGenerationPresetPackageV1;
  environment: WorkshopPackageLocalEnvironment;
  appVersion: string;
  mappings?: readonly WorkshopVariantImportMapping[];
}): WorkshopPackageImportPreview {
  const mappings = input.mappings ?? [];
  if (compareSemver(input.appVersion, input.workshopPackage.manifest.minAppVersion) < 0) {
    return {
      status: 'app-update-required',
      summary: `该分享包需要 v${input.workshopPackage.manifest.minAppVersion} 或更高版本。`,
      details: [`当前版本为 v${input.appVersion}。`],
      variants: [],
      importedStyleCount: input.workshopPackage.content.stylePresets.length,
      importedDialectCount: input.workshopPackage.content.dialectPresets.length,
      importedComfyRecipeCount: input.workshopPackage.content.comfyStyleRecipes.length,
      stylesWillRemainInactive: true
    };
  }

  const variants = input.workshopPackage.content.variants.map((variant) => {
    const matchingProfiles = input.environment.profiles.filter(
      (profile) => profile.providerType === variant.providerType
    );
    const mapping = mappings.find((candidate) => candidate.variantRef === variant.variantRef);
    const safeParameters = input.workshopPackage.content.safeGenerationParameters.find(
      (entry) => entry.variantRef === variant.variantRef
    )?.parameters;
    const details = validateVariantMapping(
      variant,
      safeParameters,
      mapping,
      input.environment.profiles,
      input.environment.workflows
    );
    if (!matchingProfiles.length) details.unshift('本机没有该供应商的图片 API 档案。');
    if (
      variant.providerType === 'comfyui-workflow'
      && input.environment.workflows.length === 0
    ) {
      details.unshift('本机没有可映射的 ComfyUI API 工作流。');
    }
    return {
      variantRef: variant.variantRef,
      name: variant.name,
      purpose: variant.purpose,
      providerType: variant.providerType,
      matchingProfileIds: matchingProfiles.map((profile) => profile.profileId),
      modelHint: variant.modelHint,
      mappingValid: details.length === 0,
      details
    };
  });
  const unsupported = variants.some((variant) => variant.matchingProfileIds.length === 0)
    || variants.some((variant) => variant.providerType === 'comfyui-workflow'
      && input.environment.workflows.length === 0);
  const status = unsupported
    ? 'unsupported'
    : variants.every((variant) => variant.mappingValid)
      ? 'compatible'
      : 'mapping-required';
  return {
    status,
    summary: status === 'compatible'
      ? '本地映射完整，可以导入。'
      : status === 'unsupported'
        ? '本机缺少必要供应商档案或 ComfyUI 工作流。'
        : '分享包有效，但需要为每个变体选择本地档案和模型或工作流。',
    details: [
      `将加入 ${input.workshopPackage.content.stylePresets.length} 个风格、${input.workshopPackage.content.dialectPresets.length} 个方言和 ${input.workshopPackage.content.comfyStyleRecipes.length} 个 ComfyUI 配方。`,
      '导入的风格不会自动设为全局默认，也不会自动发起生图。'
    ],
    variants,
    importedStyleCount: input.workshopPackage.content.stylePresets.length,
    importedDialectCount: input.workshopPackage.content.dialectPresets.length,
    importedComfyRecipeCount: input.workshopPackage.content.comfyStyleRecipes.length,
    stylesWillRemainInactive: true
  };
}

function defaultDimensions(variantKey: ImageGenerationVariantKey): { width: number; height: number } {
  if (variantKey === 'avatar-close-up') return { width: 1024, height: 1024 };
  if (variantKey === 'narrative-scene') return { width: 1536, height: 1024 };
  return { width: 1024, height: 1536 };
}

function defaultXaiAspectRatio(value: string): string {
  return [
    'auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3',
    '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20'
  ].includes(value) ? value : 'auto';
}

function resolveImportedGenerationParameters(input: {
  variant: PackageVariant;
  safeParameters: PackageSafeParameters;
  workflow?: ComfyWorkflowTemplate;
}): { parameters: ImageGenerationDefaults; warnings: string[] } {
  const { variant, safeParameters, workflow } = input;
  const {
    providerType: _safeProviderType,
    ...safe
  } = safeParameters as Record<string, unknown> & { providerType: ImageProviderType };
  const dimensions = defaultDimensions(variant.purpose);
  const warnings: string[] = [];
  let draft: unknown;
  switch (variant.providerType) {
    case 'openai-images':
      draft = {
        providerType: variant.providerType,
        requestedImageCount: 1,
        size: { mode: 'dimensions', ...dimensions },
        quality: 'medium',
        outputFormat: 'png',
        background: 'opaque',
        ...safe
      };
      break;
    case 'xai-images':
      draft = {
        providerType: variant.providerType,
        requestedImageCount: 1,
        aspectRatio: defaultXaiAspectRatio(variant.targetAspectRatio ?? 'auto'),
        resolution: '1k',
        ...safe
      };
      break;
    case 'gemini-image':
      draft = {
        providerType: variant.providerType,
        requestedImageCount: 1,
        aspectRatio: variant.targetAspectRatio ?? '1:1',
        imageSize: '1K',
        mimeType: 'image/png',
        ...safe
      };
      break;
    case 'alibaba-model-studio':
      draft = {
        providerType: variant.providerType,
        requestedImageCount: 1,
        size: { mode: 'dimensions', ...dimensions },
        seed: { mode: 'provider-random' },
        watermark: 'provider-default',
        promptEnhancement: 'provider-default',
        thinkingMode: 'provider-default',
        ...safe
      };
      break;
    case 'novelai-image':
      draft = {
        providerType: variant.providerType,
        requestedImageCount: 1,
        ...dimensions,
        seed: { mode: 'provider-random' },
        ...safe
      };
      break;
    case 'sd-webui':
      draft = {
        providerType: variant.providerType,
        requestedImageCount: 1,
        ...dimensions,
        seed: { mode: 'provider-random' },
        ...safe
      };
      break;
    case 'comfyui-workflow': {
      if (!workflow) throw new Error(`变体 ${variant.name} 尚未映射 ComfyUI 工作流。`);
      const overrides: Record<string, unknown> = {};
      const candidateKeys = ['width', 'height', 'steps', 'cfg', 'sampler', 'scheduler'] as const;
      for (const key of candidateKeys) {
        if (safe[key] === undefined) continue;
        if (workflow.bindings[key]) overrides[key] = safe[key];
        else warnings.push(`${variant.name}：工作流没有 ${key} 标准绑定，未导入该参数。`);
      }
      if (workflow.bindings.seed) overrides.seed = { mode: 'provider-random' };
      draft = {
        providerType: variant.providerType,
        workflowTemplateId: workflow.workflowTemplateId,
        overrides
      };
      break;
    }
  }
  return { parameters: imageGenerationDefaultsSchema.parse(draft), warnings };
}

async function shortStableHash(value: string): Promise<string> {
  const bytes = new globalThis.TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

function sourceOriginKey(packageSha256: string, metadata?: WorkshopImportSourceMetadata): string {
  return metadata?.itemId
    ? `workshop-item:${metadata.itemId}`
    : `local-package:${packageSha256}`;
}

function upsertCustomPreset<T extends { origin: 'built-in' | 'custom'; order: number }>(
  current: readonly T[],
  incoming: T,
  idOf: (value: T) => string
): T[] {
  const existingIndex = current.findIndex((value) => idOf(value) === idOf(incoming));
  if (existingIndex >= 0) {
    if (current[existingIndex].origin !== 'custom') throw new Error('导入不能覆盖内置预设。');
    return current.map((value, index) => index === existingIndex
      ? { ...structuredClone(incoming), order: value.order }
      : structuredClone(value));
  }
  return [...structuredClone(current), { ...structuredClone(incoming), order: current.length }];
}

function buildImportedPromptSettings(input: {
  workshopPackage: ImageGenerationPresetPackageV1;
  current: ImagePromptTemplateSettings;
  scope: string;
  now: string;
}): {
  settings: ImagePromptTemplateSettings;
  styleIdByRef: Map<string, string>;
  dialectIdByRef: Map<string, string>;
  recipeIdByRef: Map<string, string>;
} {
  const styleIdByRef = new Map<string, string>();
  const dialectIdByRef = new Map<string, string>();
  const recipeIdByRef = new Map<string, string>();
  let styles = structuredClone(input.current.stylePresets);
  let dialects = structuredClone(input.current.dialectPresets);
  let recipes = structuredClone(input.current.comfyStyleRecipes);

  input.workshopPackage.content.stylePresets.forEach((preset) => {
    const localId = `workshop-style:${input.scope}:${preset.styleRef}`;
    styleIdByRef.set(preset.styleRef, localId);
    styles = upsertCustomPreset(styles, {
      stylePresetId: localId,
      origin: 'custom',
      name: preset.name,
      description: preset.description,
      hidden: false,
      order: styles.length,
      modifiers: structuredClone(preset.modifiers)
    }, (value) => value.stylePresetId);
  });
  input.workshopPackage.content.dialectPresets.forEach((preset) => {
    const localId = `workshop-dialect:${input.scope}:${preset.dialectRef}`;
    dialectIdByRef.set(preset.dialectRef, localId);
    dialects = upsertCustomPreset(dialects, {
      dialectPresetId: localId,
      origin: 'custom',
      name: preset.name,
      description: preset.description,
      family: preset.family as ImagePromptDialectPreset['family'],
      hidden: false,
      order: dialects.length,
      renderingInstruction: preset.renderingInstruction,
      positivePrefix: preset.positivePrefix,
      positiveSuffix: preset.positiveSuffix,
      negativePrefix: preset.negativePrefix,
      negativeSuffix: preset.negativeSuffix
    }, (value) => value.dialectPresetId);
  });
  (input.workshopPackage.content.comfyStyleRecipes as unknown as PackageComfyStyleRecipe[]).forEach((preset) => {
    const localId = `workshop-recipe:${input.scope}:${preset.recipeRef}`;
    recipeIdByRef.set(preset.recipeRef, localId);
    const recipe: ComfyStyleRecipe = {
      recipeId: localId,
      origin: 'custom',
      name: preset.name,
      description: preset.description,
      hidden: false,
      order: recipes.length,
      compatiblePurposes: [...preset.compatiblePurposes],
      companionStylePresetId: styleIdByRef.get(preset.companionStyleRef)!,
      recommendedPromptDialectPresetId: dialectIdByRef.get(preset.dialectRef)!,
      assetSlots: preset.resourceHints.map((resource) => ({
        slotId: resource.resourceRef,
        kind: resource.kind === 'checkpoint-family' ? 'checkpoint' : 'lora',
        label: resource.label,
        description: `资源家族提示：${resource.familyHint}`,
        required: resource.required,
        filenameHints: [],
        triggerWords: resource.triggerWords,
        recommendedModelStrength: resource.recommendedModelStrength,
        recommendedClipStrength: resource.recommendedClipStrength
      })),
      recommendedParameters: structuredClone(preset.recommendedParameters)
    };
    recipes = upsertCustomPreset(recipes, recipe, (value) => value.recipeId);
  });

  return {
    settings: {
      ...structuredClone(input.current),
      revision: input.current.revision + 1,
      stylePresets: styles.map((preset, order) => ({ ...preset, order })),
      dialectPresets: dialects.map((preset, order) => ({ ...preset, order })),
      comfyStyleRecipes: recipes.map((preset, order) => ({ ...preset, order })),
      updatedAt: input.now
    },
    styleIdByRef,
    dialectIdByRef,
    recipeIdByRef
  };
}

export async function importImageGenerationWorkshopPackage(input: {
  loadedPackage: LoadedWorkshopPackage;
  environment: WorkshopPackageLocalEnvironment;
  appVersion: string;
  mappings: readonly WorkshopVariantImportMapping[];
  conflictStrategy: WorkshopImportConflictStrategy;
  sourceMetadata?: WorkshopImportSourceMetadata;
  repositories: WorkshopLocalImportRepositories;
  now?: string;
}): Promise<WorkshopPackageImportResult> {
  const now = input.now ?? new Date().toISOString();
  const preview = previewImageGenerationWorkshopImport({
    workshopPackage: input.loadedPackage.workshopPackage,
    environment: input.environment,
    appVersion: input.appVersion,
    mappings: input.mappings
  });
  if (preview.status !== 'compatible') throw new Error(preview.summary);

  const targetSlots = new Set<string>();
  for (const variant of input.loadedPackage.workshopPackage.content.variants) {
    const mapping = input.mappings.find((candidate) => candidate.variantRef === variant.variantRef)!;
    const targetSlot = `${mapping.profileId}:${variant.purpose}`;
    if (targetSlots.has(targetSlot)) throw new Error(`多个分享变体不能导入同一个本地槽位：${targetSlot}`);
    targetSlots.add(targetSlot);
  }

  const originKey = sourceOriginKey(
    input.loadedPackage.packageSha256,
    input.sourceMetadata
  );
  const scope = await shortStableHash(originKey);
  const previousPromptSettings = await input.repositories.promptTemplates.load();
  const importedPrompts = buildImportedPromptSettings({
    workshopPackage: input.loadedPackage.workshopPackage,
    current: previousPromptSettings,
    scope,
    now
  });
  const parametersByVariant = new Map(input.loadedPackage.workshopPackage.content.safeGenerationParameters.map(
    (entry) => [entry.variantRef, entry.parameters]
  ));
  const recipesByRef = new Map((input.loadedPackage.workshopPackage.content.comfyStyleRecipes as unknown as PackageComfyStyleRecipe[])
    .map((recipe) => [recipe.recipeRef, recipe]));

  const existingByPresetId = new Map<string, ImageGenerationPreset | undefined>();
  const existingSourceByPresetId = new Map<string, WorkshopImportSourceRecord | undefined>();
  const presets: ImageGenerationPreset[] = [];
  const sourceRecords: WorkshopImportSourceRecord[] = [];
  const warnings: string[] = [];

  for (const variant of input.loadedPackage.workshopPackage.content.variants) {
    const mapping = input.mappings.find((candidate) => candidate.variantRef === variant.variantRef)!;
    const profile = input.environment.profiles.find((candidate) => candidate.profileId === mapping.profileId)!;
    const routingTarget = mapping.routingTarget;
    const workflow = routingTarget.kind === 'comfy-workflow'
      ? input.environment.workflows.find(
        (candidate) => candidate.workflowTemplateId === routingTarget.workflowTemplateId
      )
      : undefined;
    const safeParameters = parametersByVariant.get(variant.variantRef)!;
    const resolved = resolveImportedGenerationParameters({ variant, safeParameters, workflow });
    warnings.push(...resolved.warnings);
    if (!profile.enabled) warnings.push(`${variant.name}：目标 API 档案当前未启用，已保存但不能立即执行。`);
    const dialectPresetId = variant.dialectRef
      ? importedPrompts.dialectIdByRef.get(variant.dialectRef)!
      : resolveDefaultImagePromptDialectPresetId(
        profile.providerType,
        mapping.routingTarget.kind === 'model' ? mapping.routingTarget.modelId : undefined
      );
    const importedRecipeId = variant.comfyStyleRecipeRef
      ? importedPrompts.recipeIdByRef.get(variant.comfyStyleRecipeRef)
      : undefined;
    const importedRecipe = importedRecipeId
      ? importedPrompts.settings.comfyStyleRecipes.find(
        (recipe) => recipe.recipeId === importedRecipeId
      )
      : undefined;
    if (variant.comfyStyleRecipeRef && !recipesByRef.has(variant.comfyStyleRecipeRef)) {
      throw new Error(`${variant.name} 引用了不存在的 ComfyUI 风格配方。`);
    }
    const created = createImageGenerationPreset({
      name: variant.name,
      profileId: profile.profileId,
      providerType: profile.providerType,
      variantKey: variant.purpose,
      routingTarget: structuredClone(mapping.routingTarget),
      promptDialectPresetId: dialectPresetId,
      comfyStyleRecipe: importedRecipe
        ? {
          mode: 'prompt-only',
          recipeSnapshot: structuredClone(importedRecipe),
          assetMappings: {}
        }
        : undefined,
      targetAspectRatio: variant.targetAspectRatio ?? 'auto',
      generationParameters: resolved.parameters,
      now
    });
    const existing = await input.repositories.generationPresets.get(profile.profileId, variant.purpose);
    const existingSource = existing
      ? await input.repositories.importSources.get(existing.presetId)
      : undefined;
    existingByPresetId.set(created.presetId, existing);
    existingSourceByPresetId.set(created.presetId, existingSource);
    if (existing) {
      if (input.conflictStrategy === 'fail-on-conflict') {
        throw new Error(`${variant.name} 的目标槽位已有预设；默认不会覆盖。`);
      }
      if (
        input.conflictStrategy === 'update-same-source'
        && (existingSource?.originKey !== originKey || existingSource.variantRef !== variant.variantRef)
      ) {
        throw new Error(`${variant.name} 的目标槽位不是同源导入，不能静默更新。`);
      }
    } else if (input.conflictStrategy === 'update-same-source') {
      throw new Error(`${variant.name} 没有可更新的同源本地预设。`);
    }
    const preset = imageGenerationPresetSchema.parse(existing ? {
      ...created,
      revision: existing.revision + 1,
      createdAt: existing.createdAt,
      updatedAt: now
    } : created);
    presets.push(preset);
    sourceRecords.push({
      sourceRecordId: `workshop-import:${preset.presetId}`,
      originKey,
      localPresetId: preset.presetId,
      localProfileId: profile.profileId,
      variantKey: variant.purpose,
      variantRef: variant.variantRef,
      packageSha256: input.loadedPackage.packageSha256,
      itemId: input.sourceMetadata?.itemId,
      revisionId: input.sourceMetadata?.revisionId,
      authorDisplayName: input.sourceMetadata?.authorDisplayName,
      importedStylePresetIds: [...importedPrompts.styleIdByRef.values()],
      importedDialectPresetIds: [...importedPrompts.dialectIdByRef.values()],
      importedComfyRecipeIds: [...importedPrompts.recipeIdByRef.values()],
      importedAt: now
    });
  }

  const savedPresetIds: string[] = [];
  const savedSourceIds: string[] = [];
  try {
    await input.repositories.promptTemplates.save(importedPrompts.settings);
    for (const preset of presets) {
      await input.repositories.generationPresets.save(preset);
      savedPresetIds.push(preset.presetId);
    }
    for (const record of sourceRecords) {
      await input.repositories.importSources.save(record);
      savedSourceIds.push(record.localPresetId);
    }
  } catch (error) {
    await input.repositories.promptTemplates.save(previousPromptSettings).catch(() => undefined);
    for (const presetId of savedPresetIds.reverse()) {
      const preset = presets.find((candidate) => candidate.presetId === presetId)!;
      const previous = existingByPresetId.get(presetId);
      if (previous) await input.repositories.generationPresets.save(previous).catch(() => undefined);
      else await input.repositories.generationPresets.delete(preset.profileId, preset.variantKey).catch(() => undefined);
    }
    for (const localPresetId of savedSourceIds.reverse()) {
      const previous = existingSourceByPresetId.get(localPresetId);
      if (previous) await input.repositories.importSources.save(previous).catch(() => undefined);
      else await input.repositories.importSources.delete(localPresetId).catch(() => undefined);
    }
    throw error;
  }

  return {
    presets,
    promptTemplateSettings: importedPrompts.settings,
    sourceRecords,
    warnings
  };
}
