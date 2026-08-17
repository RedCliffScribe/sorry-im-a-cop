import { describe, expect, it } from 'vitest';
import type { ComfyWorkflowTemplate } from './profile';
import {
  BUILT_IN_COMFY_STYLE_RECIPES,
  createComfyStyleRecipeApplication,
  resolveComfyStyleRecipeAssetOverrides,
  resolveComfyStyleRecipeCompatibility
} from './comfyStyleRecipes';

function workflow(): ComfyWorkflowTemplate {
  return {
    workflowTemplateId: 'workflow_recipe',
    name: '风格配方工作流',
    apiWorkflow: {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'waiIllustriousSDXL_v170.safetensors' }
      },
      '2': {
        class_type: 'LoraLoader',
        inputs: {
          lora_name: 'oda-non_IL.safetensors',
          strength_model: 0.6,
          strength_clip: 0.6
        }
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
        label: 'LoRA 文件',
        binding: { nodeId: '2', inputName: 'lora_name' },
        valueType: 'select',
        options: [
          { value: 'oda-non_IL.safetensors' },
          { value: 'izayoi_seishin_IL.safetensors' }
        ]
      },
      {
        key: 'lora.model',
        label: 'Model strength',
        binding: { nodeId: '2', inputName: 'strength_model' },
        valueType: 'number',
        min: 0,
        max: 1
      },
      {
        key: 'lora.clip',
        label: 'CLIP strength',
        binding: { nodeId: '2', inputName: 'strength_clip' },
        valueType: 'number',
        min: 0,
        max: 1
      }
    ],
    outputNodeIds: ['9'],
    revision: 1,
    createdAt: '2026-07-26T12:00:00.000Z',
    updatedAt: '2026-07-26T12:00:00.000Z'
  };
}

describe('ComfyUI style recipes', () => {
  it('keeps prompt semantics separate from real checkpoint and LoRA mappings', () => {
    const recipe = BUILT_IN_COMFY_STYLE_RECIPES.find((item) =>
      item.recipeId === 'builtin-comfy-recipe-oda-non'
    );
    if (!recipe) throw new Error('missing built-in recipe');
    const application = createComfyStyleRecipeApplication(recipe);

    expect(resolveComfyStyleRecipeCompatibility(application, workflow())).toMatchObject({
      status: 'needs-mapping',
      summary: '需要完成映射'
    });
    application.assetMappings['style-lora'] = {
      ...application.assetMappings['style-lora'],
      fileParameterKey: 'lora.file',
      modelStrengthParameterKey: 'lora.model',
      clipStrengthParameterKey: 'lora.clip'
    };
    expect(resolveComfyStyleRecipeCompatibility(application, workflow())).toMatchObject({
      status: 'ready',
      summary: '配方可应用'
    });
    expect(resolveComfyStyleRecipeAssetOverrides(application, workflow())).toEqual({
      checkpoint: 'waiIllustriousSDXL_v170.safetensors',
      custom: {
        'lora.file': 'oda-non_IL.safetensors',
        'lora.model': 0.6,
        'lora.clip': 0.6
      }
    });
  });

  it('distinguishes missing assets, incompatible workflows, and prompt-only approximation', () => {
    const recipe = BUILT_IN_COMFY_STYLE_RECIPES.find((item) =>
      item.recipeId === 'builtin-comfy-recipe-oda-non'
    );
    if (!recipe) throw new Error('missing built-in recipe');
    const application = createComfyStyleRecipeApplication(recipe);
    application.assetMappings['style-lora'] = {
      fileName: 'not-installed.safetensors',
      fileParameterKey: 'lora.file',
      modelStrengthParameterKey: 'lora.model',
      clipStrengthParameterKey: 'lora.clip',
      modelStrength: 0.6,
      clipStrength: 0.6
    };
    expect(resolveComfyStyleRecipeCompatibility(application, workflow()).status).toBe('missing-asset');

    const incompatible = workflow();
    incompatible.bindings = { positivePrompt: { nodeId: '3', inputName: 'text' } };
    expect(resolveComfyStyleRecipeCompatibility(application, incompatible).status)
      .toBe('workflow-incompatible');

    application.mode = 'prompt-only';
    expect(resolveComfyStyleRecipeCompatibility(application, undefined)).toMatchObject({
      status: 'prompt-only',
      summary: '仅提示词近似'
    });
    expect(resolveComfyStyleRecipeAssetOverrides(application, workflow())).toEqual({ custom: {} });
  });
});
