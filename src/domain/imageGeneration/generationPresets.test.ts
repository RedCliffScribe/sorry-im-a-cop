import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  IndexedDbImageGenerationPresetRepository,
  applyImageGenerationPreset,
  assertComfyGenerationPresetBindings,
  createImageGenerationPreset,
  imageGenerationPresetSchema
} from './generationPresets';
import {
  BUILT_IN_COMFY_STYLE_RECIPES,
  createComfyStyleRecipeApplication
} from './comfyStyleRecipes';
import type { ComfyWorkflowTemplate } from './profile';

describe('image generation presets', () => {
  it('stores one strict typed preset per profile and visual variant', async () => {
    const repository = new IndexedDbImageGenerationPresetRepository(`generation-presets-${crypto.randomUUID()}`);
    const preset = createImageGenerationPreset({
      name: '半身像默认',
      profileId: 'profile_openai',
      providerType: 'openai-images',
      variantKey: 'half-body-medium',
      routingTarget: { kind: 'model', modelId: 'gpt-image-test' },
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'openai-images', requestedImageCount: 1,
        size: { mode: 'dimensions', width: 1024, height: 1536 },
        quality: 'high', outputFormat: 'webp', outputCompression: 82, background: 'opaque'
      },
      now: '2026-07-23T06:00:00.000Z'
    });
    await repository.save(preset);

    expect(preset.promptDialectPresetId).toBe('builtin-dialect-openai-gpt-image');
    await expect(repository.get('profile_openai', 'half-body-medium')).resolves.toEqual(preset);
    await expect(repository.list('profile_openai')).resolves.toEqual([preset]);
    await repository.delete('profile_openai', 'half-body-medium');
    await expect(repository.get('profile_openai', 'half-body-medium')).resolves.toBeUndefined();
  });

  it('migrates presets saved before model prompt dialect selection existed', () => {
    const novelAi = createImageGenerationPreset({
      name: 'NovelAI',
      profileId: 'profile_novelai',
      providerType: 'novelai-image',
      variantKey: 'avatar-close-up',
      routingTarget: { kind: 'model', modelId: 'nai-diffusion-4' },
      targetAspectRatio: '1:1',
      generationParameters: {
        providerType: 'novelai-image',
        requestedImageCount: 1,
        width: 1024,
        height: 1024,
        seed: { mode: 'provider-random' }
      },
      now: '2026-07-23T06:00:00.000Z'
    });
    const {
      promptDialectPresetId: _promptDialectPresetId,
      ...legacy
    } = novelAi;
    expect(imageGenerationPresetSchema.parse(legacy).promptDialectPresetId).toBe('builtin-dialect-novelai');

    const compatibleNai = createImageGenerationPreset({
      name: '兼容反代 NAI',
      profileId: 'profile_openai_compatible',
      providerType: 'openai-images',
      variantKey: 'half-body-medium',
      routingTarget: { kind: 'model', modelId: 'nai-diffusion-4-5-curated' },
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'openai-images',
        requestedImageCount: 1,
        size: { mode: 'dimensions', width: 1024, height: 1536 },
        quality: 'medium',
        outputFormat: 'png',
        background: 'opaque'
      },
      now: '2026-07-23T06:00:00.000Z'
    });
    expect(compatibleNai.promptDialectPresetId).toBe('builtin-dialect-novelai');
  });

  it('rejects cross-provider parameters, arbitrary fields, and mismatched ComfyUI workflows', () => {
    const openAi = createImageGenerationPreset({
      name: '场景', profileId: 'profile_openai', providerType: 'openai-images', variantKey: 'narrative-scene',
      routingTarget: { kind: 'model', modelId: 'gpt-image-test' }, targetAspectRatio: '16:9',
      generationParameters: {
        providerType: 'openai-images', requestedImageCount: 1, size: { mode: 'auto' },
        quality: 'medium', outputFormat: 'png', background: 'opaque'
      },
      now: '2026-07-23T06:00:00.000Z'
    });
    expect(() => imageGenerationPresetSchema.parse({ ...openAi, arbitraryJson: {} })).toThrow();
    expect(() => imageGenerationPresetSchema.parse({
      ...openAi,
      generationParameters: {
        providerType: 'xai-images', requestedImageCount: 1, aspectRatio: '16:9', resolution: '1k'
      }
    })).toThrow('生成参数供应商必须与预设供应商一致');

    expect(() => imageGenerationPresetSchema.parse({
      ...openAi,
      providerType: 'comfyui-workflow',
      routingTarget: { kind: 'comfy-workflow', workflowTemplateId: 'workflow_a' },
      generationParameters: { providerType: 'comfyui-workflow', workflowTemplateId: 'workflow_b', overrides: {} }
    })).toThrow('参数工作流与路由目标不一致');

    expect(() => imageGenerationPresetSchema.parse({
      ...openAi,
      generationParameters: {
        ...openAi.generationParameters,
        outputFormat: 'png',
        outputCompression: 80
      }
    })).toThrow('PNG 输出不使用压缩质量');
  });

  it('rejects ComfyUI overrides without a declared workflow binding', () => {
    const preset = createImageGenerationPreset({
      name: 'ComfyUI 场景', profileId: 'profile_comfy', providerType: 'comfyui-workflow',
      variantKey: 'narrative-scene',
      routingTarget: { kind: 'comfy-workflow', workflowTemplateId: 'workflow_comfy' },
      targetAspectRatio: '16:9',
      generationParameters: {
        providerType: 'comfyui-workflow', workflowTemplateId: 'workflow_comfy',
        overrides: { width: 1024 }
      },
      now: '2026-07-23T06:00:00.000Z'
    });
    const workflow: ComfyWorkflowTemplate = {
      workflowTemplateId: 'workflow_comfy', name: 'ComfyUI',
      apiWorkflow: { '1': { class_type: 'Text', inputs: { text: '' } } },
      workflowHash: 'a'.repeat(64),
      bindings: { positivePrompt: { nodeId: '1', inputName: 'text' } },
      outputNodeIds: ['1'], revision: 1,
      createdAt: '2026-07-23T06:00:00.000Z', updatedAt: '2026-07-23T06:00:00.000Z'
    };

    expect(() => assertComfyGenerationPresetBindings(preset, workflow)).toThrow('字段 width 没有对应的工作流绑定');
    expect(() => assertComfyGenerationPresetBindings(preset, {
      ...workflow,
      bindings: { ...workflow.bindings, width: { nodeId: '1', inputName: 'text' } }
    })).not.toThrow();
  });

  it('accepts only declared, correctly typed, in-range ComfyUI player parameters', () => {
    const makePreset = (custom: Record<string, string | number | boolean>) => createImageGenerationPreset({
      name: '可调 ComfyUI', profileId: 'profile_comfy', providerType: 'comfyui-workflow',
      variantKey: 'half-body-medium',
      routingTarget: { kind: 'comfy-workflow', workflowTemplateId: 'workflow_comfy' },
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'comfyui-workflow',
        workflowTemplateId: 'workflow_comfy',
        overrides: { custom }
      },
      now: '2026-07-23T06:00:00.000Z'
    });
    const workflow = {
      workflowTemplateId: 'workflow_comfy', name: 'ComfyUI',
      apiWorkflow: {
        '1': { class_type: 'Text', inputs: { text: '' } },
        '2': { class_type: 'KSampler', inputs: { denoise: 0.55 } }
      },
      workflowHash: 'a'.repeat(64),
      bindings: { positivePrompt: { nodeId: '1', inputName: 'text' } },
      exposedParameters: [{
        key: 'denoise', label: '重绘幅度',
        binding: { nodeId: '2', inputName: 'denoise' },
        valueType: 'number' as const, min: 0, max: 1, step: 0.01
      }],
      outputNodeIds: ['2'], revision: 1,
      createdAt: '2026-07-23T06:00:00.000Z', updatedAt: '2026-07-23T06:00:00.000Z'
    };

    expect(() => assertComfyGenerationPresetBindings(makePreset({ denoise: 0.48 }), workflow)).not.toThrow();
    expect(() => assertComfyGenerationPresetBindings(makePreset({ denoise: 1.2 }), workflow)).toThrow('不能大于 1');
    expect(() => assertComfyGenerationPresetBindings(makePreset({ denoise: 'high' }), workflow)).toThrow('必须是数值');
    expect(() => assertComfyGenerationPresetBindings(makePreset({ unknown: 1 }), workflow)).toThrow('没有对应的开放参数声明');
  });

  it('serializes concurrent writes without losing different variants', async () => {
    const repository = new IndexedDbImageGenerationPresetRepository(`generation-presets-queue-${crypto.randomUUID()}`);
    const make = (variantKey: 'avatar-close-up' | 'narrative-scene') => createImageGenerationPreset({
      name: variantKey, profileId: 'profile_xai', providerType: 'xai-images', variantKey,
      routingTarget: { kind: 'model', modelId: 'grok-image' },
      targetAspectRatio: variantKey === 'avatar-close-up' ? '1:1' : '16:9',
      generationParameters: {
        providerType: 'xai-images', requestedImageCount: 1,
        aspectRatio: variantKey === 'avatar-close-up' ? '1:1' : '16:9', resolution: '1k'
      },
      now: '2026-07-23T06:00:00.000Z'
    });
    await Promise.all([repository.save(make('avatar-close-up')), repository.save(make('narrative-scene'))]);
    await expect(repository.list('profile_xai')).resolves.toHaveLength(2);
    await repository.save({ ...make('avatar-close-up'), presetId: 'image-preset:profile_other:avatar-close-up', profileId: 'profile_other' });
    await repository.clearProfile('profile_xai');
    await expect(repository.list('profile_xai')).resolves.toEqual([]);
    await expect(repository.list('profile_other')).resolves.toHaveLength(1);
    await repository.clearAll();
    await expect(repository.list('profile_other')).resolves.toEqual([]);
  });

  it('applies a typed preset to the frozen execution target and fingerprints all parameters', async () => {
    const profile = {
      profileId: 'profile_openai', name: 'OpenAI', providerType: 'openai-images' as const, enabled: true,
      apiBaseUrl: 'https://api.example.test/v1', requestTimeoutMs: 10_000, downloadTimeoutMs: 10_000,
      revision: 1, createdAt: '2026-07-23T06:00:00.000Z', updatedAt: '2026-07-23T06:00:00.000Z',
      models: [
        { modelId: 'model_default', source: 'manual' as const },
        { modelId: 'model_preset', source: 'manual' as const }
      ],
      defaultModelId: 'model_default',
      config: {
        apiVariant: 'openai-official' as const,
        resultTransportPreference: 'auto' as const,
        modelDiscovery: 'standard-models-endpoint' as const
      }
    };
    const base = {
      imageProfileId: profile.profileId,
      providerType: profile.providerType,
      connectionFingerprint: 'connection-fingerprint',
      executionFingerprint: 'builtin-fingerprint',
      imageGenerationPresetId: 'builtin-character-half-body-medium:openai-images',
      imageGenerationPresetRevision: 1,
      promptDialectPresetId: 'builtin-dialect-general-en',
      executionTarget: { kind: 'model' as const, modelId: 'model_default' },
      negativePromptMode: 'merged-into-positive' as const,
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'openai-images' as const, requestedImageCount: 1,
        size: { mode: 'dimensions' as const, width: 1024, height: 1536 },
        quality: 'medium' as const, outputFormat: 'png' as const, background: 'opaque' as const
      },
      referenceImages: [],
      referenceImageTransport: { kind: 'none' as const }
    };
    const preset = createImageGenerationPreset({
      name: '玩家半身像', profileId: profile.profileId, providerType: profile.providerType,
      variantKey: 'half-body-medium', routingTarget: { kind: 'model', modelId: 'model_preset' },
      targetAspectRatio: '4:3',
      generationParameters: {
        providerType: 'openai-images', requestedImageCount: 2,
        size: { mode: 'dimensions', width: 1536, height: 1024 },
        quality: 'high', outputFormat: 'webp', outputCompression: 77, background: 'opaque'
      },
      now: '2026-07-23T06:00:00.000Z'
    });

    const applied = await applyImageGenerationPreset({
      base, profile, variantKey: 'half-body-medium', preset
    });
    expect(applied).toMatchObject({
      imageGenerationPresetId: preset.presetId,
      imageGenerationPresetRevision: 1,
      targetAspectRatio: '4:3',
      executionTarget: { kind: 'model', modelId: 'model_preset' },
      generationParameters: { quality: 'high', outputCompression: 77 }
    });
    expect(applied.executionFingerprint).not.toBe(base.executionFingerprint);

    if (preset.generationParameters.providerType !== 'openai-images') throw new Error('test preset type mismatch');
    const changed = await applyImageGenerationPreset({
      base,
      profile,
      variantKey: 'half-body-medium',
      preset: { ...preset, generationParameters: { ...preset.generationParameters, outputCompression: 76 } }
    });
    expect(changed.executionFingerprint).not.toBe(applied.executionFingerprint);
  });

  it('resolves a ready ComfyUI recipe into frozen checkpoint and LoRA overrides', async () => {
    const recipe = BUILT_IN_COMFY_STYLE_RECIPES.find((item) =>
      item.recipeId === 'builtin-comfy-recipe-oda-non'
    );
    if (!recipe) throw new Error('missing built-in recipe');
    const comfyStyleRecipe = createComfyStyleRecipeApplication(recipe);
    comfyStyleRecipe.assetMappings['style-lora'] = {
      ...comfyStyleRecipe.assetMappings['style-lora'],
      fileParameterKey: 'lora.file',
      modelStrengthParameterKey: 'lora.model',
      clipStrengthParameterKey: 'lora.clip'
    };
    const profile = {
      profileId: 'profile_comfy',
      name: 'ComfyUI',
      providerType: 'comfyui-workflow' as const,
      enabled: true,
      apiBaseUrl: 'http://127.0.0.1:8188',
      requestTimeoutMs: 10_000,
      downloadTimeoutMs: 10_000,
      revision: 1,
      createdAt: '2026-07-26T12:00:00.000Z',
      updatedAt: '2026-07-26T12:00:00.000Z',
      config: {
        deployment: 'core-server' as const,
        authMode: 'none' as const,
        eventTransport: 'polling-only' as const,
        pollIntervalMs: 500,
        maxPollDurationMs: 60_000,
        exclusiveInstance: true
      }
    };
    const workflow: ComfyWorkflowTemplate = {
      workflowTemplateId: 'workflow_comfy',
      name: 'ComfyUI',
      apiWorkflow: {
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'base.safetensors' } },
        '2': {
          class_type: 'LoraLoader',
          inputs: { lora_name: '', strength_model: 0, strength_clip: 0 }
        }
      },
      workflowHash: 'a'.repeat(64),
      bindings: {
        positivePrompt: { nodeId: '3', inputName: 'text' },
        checkpoint: { nodeId: '1', inputName: 'ckpt_name' }
      },
      exposedParameters: [
        {
          key: 'lora.file',
          label: 'LoRA',
          binding: { nodeId: '2', inputName: 'lora_name' },
          valueType: 'text' as const
        },
        {
          key: 'lora.model',
          label: 'Model strength',
          binding: { nodeId: '2', inputName: 'strength_model' },
          valueType: 'number' as const,
          min: 0,
          max: 1
        },
        {
          key: 'lora.clip',
          label: 'CLIP strength',
          binding: { nodeId: '2', inputName: 'strength_clip' },
          valueType: 'number' as const,
          min: 0,
          max: 1
        }
      ],
      outputNodeIds: ['9'],
      revision: 1,
      createdAt: '2026-07-26T12:00:00.000Z',
      updatedAt: '2026-07-26T12:00:00.000Z'
    };
    const preset = createImageGenerationPreset({
      name: '织田 non',
      profileId: profile.profileId,
      providerType: profile.providerType,
      variantKey: 'half-body-medium',
      routingTarget: { kind: 'comfy-workflow', workflowTemplateId: workflow.workflowTemplateId },
      promptDialectPresetId: recipe.recommendedPromptDialectPresetId,
      comfyStyleRecipe,
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'comfyui-workflow',
        workflowTemplateId: workflow.workflowTemplateId,
        overrides: { custom: { existing: true } }
      },
      now: '2026-07-26T12:00:00.000Z'
    });
    workflow.exposedParameters!.push({
      key: 'existing',
      label: 'Existing',
      binding: { nodeId: '2', inputName: 'enabled' },
      valueType: 'boolean' as const
    });
    const base = {
      imageProfileId: profile.profileId,
      providerType: profile.providerType,
      connectionFingerprint: 'connection',
      executionFingerprint: 'builtin',
      imageGenerationPresetId: 'builtin',
      imageGenerationPresetRevision: 1,
      promptDialectPresetId: 'builtin-dialect-generic-en-tags',
      executionTarget: {
        kind: 'comfy-workflow' as const,
        workflowTemplateId: workflow.workflowTemplateId,
        workflowRevision: workflow.revision
      },
      negativePromptMode: 'separate' as const,
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'comfyui-workflow' as const,
        workflowTemplateId: workflow.workflowTemplateId,
        overrides: {}
      },
      referenceImages: [],
      referenceImageTransport: { kind: 'none' as const }
    };

    const applied = await applyImageGenerationPreset({
      base,
      profile,
      variantKey: 'half-body-medium',
      preset,
      workflow
    });
    expect(applied.generationParameters).toMatchObject({
      providerType: 'comfyui-workflow',
      overrides: {
        checkpoint: 'waiIllustriousSDXL_v170.safetensors',
        custom: {
          existing: true,
          'lora.file': 'oda-non_IL.safetensors',
          'lora.model': 0.6,
          'lora.clip': 0.6
        }
      }
    });
  });
});
