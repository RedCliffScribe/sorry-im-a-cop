import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  IndexedDbImageGenerationPresetRepository,
  createImageGenerationPreset,
  type ImageGenerationPreset
} from '../imageGeneration/generationPresets';
import {
  IndexedDbImagePromptTemplateRepository,
  createDefaultImagePromptTemplateSettings,
  type ImagePromptTemplateSettings
} from '../imageGeneration/promptConversion/ImagePromptTemplateRepository';
import type { ComfyStyleRecipe } from '../imageGeneration/comfyStyleRecipes';
import type { ComfyWorkflowTemplate, ImageApiProfile } from '../imageGeneration/profile';
import { IndexedDbWorkshopImportSourceRepository } from './IndexedDbWorkshopImportSourceRepository';
import {
  createImageGenerationWorkshopPackage,
  importImageGenerationWorkshopPackage,
  loadImageGenerationWorkshopPackage,
  previewImageGenerationWorkshopImport
} from './imageGenerationPresetPortability';
import type {
  WorkshopPackageLocalEnvironment,
  WorkshopVariantImportMapping
} from './types';

const now = '2026-08-02T00:00:00.000Z';

function createProfile(
  profileId: string,
  modelId = 'gpt-image-target'
): Extract<ImageApiProfile, { providerType: 'openai-images' }> {
  return {
    profileId,
    name: `OpenAI ${profileId}`,
    providerType: 'openai-images',
    enabled: true,
    apiBaseUrl: 'https://private.example.invalid/v1',
    credentialId: `credential-${profileId}`,
    requestTimeoutMs: 60_000,
    downloadTimeoutMs: 60_000,
    models: [{ modelId, source: 'manual' }],
    defaultModelId: modelId,
    config: {
      apiVariant: 'openai-compatible',
      resultTransportPreference: 'auto',
      modelDiscovery: 'standard-models-endpoint'
    },
    revision: 1,
    createdAt: now,
    updatedAt: now
  };
}

function createComfyProfile(profileId: string): Extract<ImageApiProfile, { providerType: 'comfyui-workflow' }> {
  return {
    profileId,
    name: `Comfy ${profileId}`,
    providerType: 'comfyui-workflow',
    enabled: true,
    apiBaseUrl: 'http://127.0.0.1:8188',
    requestTimeoutMs: 60_000,
    downloadTimeoutMs: 60_000,
    config: {
      deployment: 'core-server',
      authMode: 'none',
      eventTransport: 'polling-only',
      pollIntervalMs: 1_000,
      maxPollDurationMs: 60_000,
      exclusiveInstance: true
    },
    revision: 1,
    createdAt: now,
    updatedAt: now
  };
}

function createWorkflow(workflowTemplateId: string): ComfyWorkflowTemplate {
  return {
    workflowTemplateId,
    name: '本地 API 工作流',
    apiWorkflow: {
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
      '2': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 6 } }
    },
    workflowHash: 'b'.repeat(64),
    bindings: {
      positivePrompt: { nodeId: '1', inputName: 'text' },
      seed: { nodeId: '2', inputName: 'seed' },
      steps: { nodeId: '2', inputName: 'steps' },
      cfg: { nodeId: '2', inputName: 'cfg' }
    },
    outputNodeIds: ['2'],
    revision: 1,
    createdAt: now,
    updatedAt: now
  };
}

function createCustomPromptSettings(): ImagePromptTemplateSettings {
  const settings = createDefaultImagePromptTemplateSettings(now);
  const customStyle = {
    stylePresetId: 'custom-style-export',
    origin: 'custom' as const,
    name: '可移植港风',
    description: '只包含可公开复用的视觉风格。',
    hidden: false,
    order: settings.stylePresets.length,
    modifiers: {
      global: { positive: '香港犯罪电影质感', negative: '避免水印' },
      character: { positive: '人物身份清晰', negative: '避免面部失真' },
      narrativeScene: { positive: '城市叙事构图', negative: '避免无关人物' }
    }
  };
  const customDialect = {
    dialectPresetId: 'custom-dialect-export',
    origin: 'custom' as const,
    name: '公开自然语言方言',
    description: '用于兼容图片接口。',
    family: 'general-english-natural' as const,
    hidden: false,
    order: settings.dialectPresets.length,
    renderingInstruction: 'Use concise natural language.',
    positivePrefix: 'cinematic ',
    positiveSuffix: '',
    negativePrefix: '',
    negativeSuffix: ''
  };
  return {
    ...settings,
    stylePresets: [...settings.stylePresets, customStyle],
    dialectPresets: [...settings.dialectPresets, customDialect],
    styleSelection: {
      ...settings.styleSelection,
      globalStylePresetId: customStyle.stylePresetId
    }
  };
}

function createOpenAiPreset(profileId = 'source-profile'): ImageGenerationPreset {
  return createImageGenerationPreset({
    name: '半身人物公开预设',
    profileId,
    providerType: 'openai-images',
    variantKey: 'half-body-medium',
    routingTarget: { kind: 'model', modelId: 'gpt-image-source' },
    promptDialectPresetId: 'custom-dialect-export',
    targetAspectRatio: '3:4',
    generationParameters: {
      providerType: 'openai-images',
      requestedImageCount: 2,
      size: { mode: 'dimensions', width: 1024, height: 1536 },
      quality: 'high',
      outputFormat: 'webp',
      outputCompression: 82,
      background: 'opaque'
    },
    now
  });
}

function manifest() {
  return {
    title: '公开人物生图预设',
    summary: '可在本地导出并重新映射的预设包。',
    contentRating: 'general' as const,
    language: 'zh-CN',
    tags: ['人物', '港风'],
    minAppVersion: '1.0.0'
  };
}

function createRepositories() {
  const dbNames = {
    generationPresets: `workshop-generation-${crypto.randomUUID()}`,
    promptTemplates: `workshop-prompts-${crypto.randomUUID()}`,
    importSources: `workshop-sources-${crypto.randomUUID()}`
  };
  return {
    generationPresets: new IndexedDbImageGenerationPresetRepository(dbNames.generationPresets),
    promptTemplates: new IndexedDbImagePromptTemplateRepository(dbNames.promptTemplates),
    importSources: new IndexedDbWorkshopImportSourceRepository(dbNames.importSources),
    dbNames
  };
}

describe('image generation workshop package portability', () => {
  it('exports only the public allowlist and omits local routing, credentials and timestamps', async () => {
    const result = await createImageGenerationWorkshopPackage({
      presets: [createOpenAiPreset('private-profile-id')],
      promptTemplateSettings: createCustomPromptSettings(),
      manifest: manifest()
    });

    expect(result.packageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.workshopPackage.content.variants[0]).toMatchObject({
      purpose: 'half-body-medium',
      providerType: 'openai-images',
      modelHint: 'gpt-image-source'
    });
    expect(result.json).not.toContain('private-profile-id');
    expect(result.json).not.toContain('credential-');
    expect(result.json).not.toContain('private.example.invalid');
    expect(result.json).not.toContain('presetId');
    expect(result.json).not.toContain('createdAt');
    expect(result.json).not.toContain('updatedAt');
    expect(result.excludedLocalFields).toContain('API 档案 ID、服务地址与凭据引用');
  });

  it('rejects a credential-bearing package at the local import boundary', async () => {
    const exported = await createImageGenerationWorkshopPackage({
      presets: [createOpenAiPreset()],
      promptTemplateSettings: createCustomPromptSettings(),
      manifest: manifest()
    });
    const unsafe = structuredClone(exported.workshopPackage) as unknown as {
      content: { variants: Array<Record<string, unknown>> };
    };
    unsafe.content.variants[0].credentialId = 'credential-private';
    await expect(loadImageGenerationWorkshopPackage(JSON.stringify(unsafe))).rejects.toMatchObject({
      name: 'WorkshopPackageContractError'
    });
  });

  it('previews app-version and target mapping requirements before any write', async () => {
    const exported = await createImageGenerationWorkshopPackage({
      presets: [createOpenAiPreset()],
      promptTemplateSettings: createCustomPromptSettings(),
      manifest: { ...manifest(), minAppVersion: '2.0.0' }
    });
    const environment: WorkshopPackageLocalEnvironment = {
      profiles: [createProfile('target-profile')],
      workflows: [],
      promptTemplateSettings: createDefaultImagePromptTemplateSettings(now)
    };
    expect(previewImageGenerationWorkshopImport({
      workshopPackage: exported.workshopPackage,
      environment,
      appVersion: '1.9.9'
    }).status).toBe('app-update-required');
    expect(previewImageGenerationWorkshopImport({
      workshopPackage: exported.workshopPackage,
      environment,
      appVersion: '2.0.0'
    }).status).toBe('mapping-required');
  });

  it('blocks a mapping when the target profile explicitly denies required generation features', async () => {
    const exported = await createImageGenerationWorkshopPackage({
      presets: [createOpenAiPreset()],
      promptTemplateSettings: createCustomPromptSettings(),
      manifest: manifest()
    });
    const target = createProfile('limited-profile');
    target.config.compatibilityOverrides = {
      multipleOutputs: false,
      sizeMode: 'fixed-presets'
    };
    const variant = exported.workshopPackage.content.variants[0];
    const preview = previewImageGenerationWorkshopImport({
      workshopPackage: exported.workshopPackage,
      environment: {
        profiles: [target],
        workflows: [],
        promptTemplateSettings: createDefaultImagePromptTemplateSettings(now)
      },
      appVersion: '1.0.0',
      mappings: [{
        variantRef: variant.variantRef,
        profileId: target.profileId,
        routingTarget: { kind: 'model', modelId: 'gpt-image-target' }
      }]
    });
    expect(preview.status).toBe('mapping-required');
    expect(preview.variants[0].details).toEqual(expect.arrayContaining([
      '目标档案明确不支持一次生成多张图片。',
      '目标档案明确不支持自定义宽高。'
    ]));
  });

  it('round-trips through empty IndexedDB stores without changing the active style', async () => {
    const exported = await createImageGenerationWorkshopPackage({
      presets: [createOpenAiPreset()],
      promptTemplateSettings: createCustomPromptSettings(),
      manifest: manifest()
    });
    const loaded = await loadImageGenerationWorkshopPackage(exported.json);
    const targetProfile = createProfile('target-profile', 'gpt-image-target');
    const targetSettings = createDefaultImagePromptTemplateSettings(now);
    const repositories = createRepositories();
    await repositories.promptTemplates.save(targetSettings);
    const environment: WorkshopPackageLocalEnvironment = {
      profiles: [targetProfile],
      workflows: [],
      promptTemplateSettings: targetSettings
    };
    const mapping: WorkshopVariantImportMapping = {
      variantRef: loaded.workshopPackage.content.variants[0].variantRef,
      profileId: targetProfile.profileId,
      routingTarget: { kind: 'model', modelId: 'gpt-image-target' }
    };

    const imported = await importImageGenerationWorkshopPackage({
      loadedPackage: loaded,
      environment,
      appVersion: '1.0.0',
      mappings: [mapping],
      conflictStrategy: 'fail-on-conflict',
      sourceMetadata: { itemId: 'item-public-1', revisionId: 'revision-1' },
      repositories,
      now: '2026-08-02T01:00:00.000Z'
    });

    expect(imported.presets).toHaveLength(1);
    expect(imported.presets[0]).toMatchObject({
      profileId: 'target-profile',
      routingTarget: { kind: 'model', modelId: 'gpt-image-target' },
      variantKey: 'half-body-medium'
    });
    const reopenedPreset = await new IndexedDbImageGenerationPresetRepository(
      repositories.dbNames.generationPresets
    ).get('target-profile', 'half-body-medium');
    expect(reopenedPreset).toEqual(imported.presets[0]);

    const persistedSettings = await repositories.promptTemplates.load();
    expect(persistedSettings.styleSelection).toEqual(targetSettings.styleSelection);
    expect(persistedSettings.stylePresets.some(
      (preset) => preset.stylePresetId === imported.sourceRecords[0].importedStylePresetIds[0]
    )).toBe(true);
    await expect(repositories.importSources.get(imported.presets[0].presetId))
      .resolves.toEqual(imported.sourceRecords[0]);
  });

  it('fails closed on occupied slots and only updates an exact same-source import', async () => {
    const exported = await createImageGenerationWorkshopPackage({
      presets: [createOpenAiPreset()],
      promptTemplateSettings: createCustomPromptSettings(),
      manifest: manifest()
    });
    const loaded = await loadImageGenerationWorkshopPackage(exported.json);
    const targetProfile = createProfile('target-profile');
    const targetSettings = createDefaultImagePromptTemplateSettings(now);
    const repositories = createRepositories();
    await repositories.promptTemplates.save(targetSettings);
    const environment = {
      profiles: [targetProfile], workflows: [], promptTemplateSettings: targetSettings
    };
    const mappings: WorkshopVariantImportMapping[] = [{
      variantRef: loaded.workshopPackage.content.variants[0].variantRef,
      profileId: targetProfile.profileId,
      routingTarget: { kind: 'model', modelId: 'gpt-image-target' }
    }];
    const baseInput = {
      loadedPackage: loaded,
      environment,
      appVersion: '1.0.0',
      mappings,
      repositories
    };
    await importImageGenerationWorkshopPackage({
      ...baseInput,
      conflictStrategy: 'fail-on-conflict',
      sourceMetadata: { itemId: 'item-same', revisionId: 'revision-1' },
      now: '2026-08-02T01:00:00.000Z'
    });
    await expect(importImageGenerationWorkshopPackage({
      ...baseInput,
      conflictStrategy: 'fail-on-conflict',
      sourceMetadata: { itemId: 'item-same', revisionId: 'revision-2' }
    })).rejects.toThrow('默认不会覆盖');
    await expect(importImageGenerationWorkshopPackage({
      ...baseInput,
      conflictStrategy: 'update-same-source',
      sourceMetadata: { itemId: 'item-foreign', revisionId: 'revision-2' }
    })).rejects.toThrow('不是同源导入');

    const updated = await importImageGenerationWorkshopPackage({
      ...baseInput,
      conflictStrategy: 'update-same-source',
      sourceMetadata: { itemId: 'item-same', revisionId: 'revision-2' },
      now: '2026-08-02T02:00:00.000Z'
    });
    expect(updated.presets[0].revision).toBe(2);
    expect(updated.sourceRecords[0].revisionId).toBe('revision-2');
  });

  it('only replaces a foreign occupied slot after the explicit replace strategy is chosen', async () => {
    const exported = await createImageGenerationWorkshopPackage({
      presets: [createOpenAiPreset()],
      promptTemplateSettings: createCustomPromptSettings(),
      manifest: manifest()
    });
    const loaded = await loadImageGenerationWorkshopPackage(exported.json);
    const targetProfile = createProfile('target-profile');
    const targetSettings = createDefaultImagePromptTemplateSettings(now);
    const repositories = createRepositories();
    await repositories.promptTemplates.save(targetSettings);
    await repositories.generationPresets.save(createOpenAiPreset('target-profile'));

    const result = await importImageGenerationWorkshopPackage({
      loadedPackage: loaded,
      environment: {
        profiles: [targetProfile], workflows: [], promptTemplateSettings: targetSettings
      },
      appVersion: '1.0.0',
      mappings: [{
        variantRef: loaded.workshopPackage.content.variants[0].variantRef,
        profileId: targetProfile.profileId,
        routingTarget: { kind: 'model', modelId: 'gpt-image-target' }
      }],
      conflictStrategy: 'replace-target',
      repositories,
      now: '2026-08-02T03:00:00.000Z'
    });
    expect(result.presets[0]).toMatchObject({
      revision: 2,
      routingTarget: { kind: 'model', modelId: 'gpt-image-target' }
    });
  });

  it('rolls back prompt and preset writes when the source record cannot be persisted', async () => {
    const exported = await createImageGenerationWorkshopPackage({
      presets: [createOpenAiPreset()],
      promptTemplateSettings: createCustomPromptSettings(),
      manifest: manifest()
    });
    const loaded = await loadImageGenerationWorkshopPackage(exported.json);
    const targetProfile = createProfile('target-profile');
    const targetSettings = createDefaultImagePromptTemplateSettings(now);
    const repositories = createRepositories();
    await repositories.promptTemplates.save(targetSettings);

    await expect(importImageGenerationWorkshopPackage({
      loadedPackage: loaded,
      environment: {
        profiles: [targetProfile], workflows: [], promptTemplateSettings: targetSettings
      },
      appVersion: '1.0.0',
      mappings: [{
        variantRef: loaded.workshopPackage.content.variants[0].variantRef,
        profileId: targetProfile.profileId,
        routingTarget: { kind: 'model', modelId: 'gpt-image-target' }
      }],
      conflictStrategy: 'fail-on-conflict',
      repositories: {
        generationPresets: repositories.generationPresets,
        promptTemplates: repositories.promptTemplates,
        importSources: {
          ...repositories.importSources,
          get: (localPresetId) => repositories.importSources.get(localPresetId),
          listByOriginKey: (originKey) => repositories.importSources.listByOriginKey(originKey),
          save: async () => { throw new Error('source-write-failed'); },
          delete: (localPresetId) => repositories.importSources.delete(localPresetId),
          clearAll: () => repositories.importSources.clearAll()
        }
      }
    })).rejects.toThrow('source-write-failed');

    await expect(repositories.generationPresets.get('target-profile', 'half-body-medium'))
      .resolves.toBeUndefined();
    await expect(repositories.promptTemplates.load()).resolves.toEqual(targetSettings);
  });

  it('exports ComfyUI structure without private files and imports it as prompt-only', async () => {
    const settings = createCustomPromptSettings();
    const recipe: ComfyStyleRecipe = {
      recipeId: 'custom-recipe-source',
      origin: 'custom',
      name: '公开结构配方',
      description: '只分享资源家族提示。',
      hidden: false,
      order: settings.comfyStyleRecipes.length,
      compatiblePurposes: ['character'],
      companionStylePresetId: 'custom-style-export',
      recommendedPromptDialectPresetId: 'custom-dialect-export',
      assetSlots: [{
        slotId: 'checkpoint-slot',
        kind: 'checkpoint',
        label: 'SDXL 写实家族',
        description: '用户需在本地自行选择。',
        required: true,
        filenameHints: ['private-checkpoint.safetensors']
      }],
      recommendedParameters: { steps: 28, cfg: 6 }
    };
    settings.comfyStyleRecipes.push(recipe);
    const sourcePreset = createImageGenerationPreset({
      name: 'Comfy 人物公开预设',
      profileId: 'source-comfy',
      providerType: 'comfyui-workflow',
      variantKey: 'half-body-medium',
      routingTarget: { kind: 'comfy-workflow', workflowTemplateId: 'private-workflow-id' },
      promptDialectPresetId: 'custom-dialect-export',
      comfyStyleRecipe: {
        mode: 'mapped',
        recipeSnapshot: recipe,
        assetMappings: { 'checkpoint-slot': { fileName: 'private-checkpoint.safetensors' } }
      },
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'comfyui-workflow',
        workflowTemplateId: 'private-workflow-id',
        overrides: {
          checkpoint: 'private-checkpoint.safetensors',
          seed: { mode: 'fixed', value: 1234 },
          steps: 28,
          cfg: 6,
          custom: { secretNode: 'private-value' }
        }
      },
      now
    });
    const exported = await createImageGenerationWorkshopPackage({
      presets: [sourcePreset], promptTemplateSettings: settings, manifest: manifest()
    });
    expect(exported.json).not.toContain('private-workflow-id');
    expect(exported.json).not.toContain('private-checkpoint.safetensors');
    expect(exported.json).not.toContain('secretNode');
    expect(exported.json).not.toContain('1234');

    const loaded = await loadImageGenerationWorkshopPackage(exported.json);
    const profile = createComfyProfile('target-comfy');
    const workflow = createWorkflow('target-workflow');
    const targetSettings = createDefaultImagePromptTemplateSettings(now);
    const repositories = createRepositories();
    await repositories.promptTemplates.save(targetSettings);
    const result = await importImageGenerationWorkshopPackage({
      loadedPackage: loaded,
      environment: { profiles: [profile], workflows: [workflow], promptTemplateSettings: targetSettings },
      appVersion: '1.0.0',
      mappings: [{
        variantRef: loaded.workshopPackage.content.variants[0].variantRef,
        profileId: profile.profileId,
        routingTarget: { kind: 'comfy-workflow', workflowTemplateId: workflow.workflowTemplateId }
      }],
      conflictStrategy: 'fail-on-conflict',
      repositories
    });
    expect(result.presets[0].comfyStyleRecipe).toMatchObject({
      mode: 'prompt-only',
      assetMappings: {}
    });
    expect(result.presets[0].generationParameters).toMatchObject({
      providerType: 'comfyui-workflow',
      workflowTemplateId: 'target-workflow',
      overrides: { seed: { mode: 'provider-random' }, steps: 28, cfg: 6 }
    });
    expect(result.presets[0].comfyStyleRecipe?.recipeSnapshot.assetSlots[0].filenameHints).toEqual([]);
  });
});
