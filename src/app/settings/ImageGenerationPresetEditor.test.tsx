import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createImageGenerationPreset,
  type ImageGenerationPreset
} from '../../domain/imageGeneration/generationPresets';
import {
  createDefaultImageApiProfile,
  type ComfyWorkflowTemplate,
  type ImageApiProfile
} from '../../domain/imageGeneration/profile';
import type { ImageProviderType } from '../../domain/imageGeneration/probe';
import {
  BUILT_IN_COMFY_STYLE_RECIPES,
  createComfyStyleRecipeApplication
} from '../../domain/imageGeneration/comfyStyleRecipes';
import { BUILT_IN_IMAGE_STYLE_PRESETS } from '../../domain/imageGeneration/promptConversion';
import { ImageGenerationPresetEditor } from './ImageGenerationPresetEditor';

const NOW = '2026-07-23T06:00:00.000Z';

const comfyWorkflow: ComfyWorkflowTemplate = {
  workflowTemplateId: 'workflow_comfy',
  name: '测试工作流',
  apiWorkflow: {
    '1': { class_type: 'Text', inputs: { text: '' } },
    '2': { class_type: 'EmptyLatentImage', inputs: { width: 1024, denoise: 0.55 } }
  },
  workflowHash: 'a'.repeat(64),
  bindings: {
    positivePrompt: { nodeId: '1', inputName: 'text' },
    width: { nodeId: '2', inputName: 'width' }
  },
  exposedParameters: [{
    key: 'denoise',
    label: '重绘幅度',
    description: '越低越接近参考图',
    binding: { nodeId: '2', inputName: 'denoise' },
    valueType: 'number',
    min: 0,
    max: 1,
    step: 0.01
  }],
  outputNodeIds: ['2'],
  revision: 1,
  createdAt: NOW,
  updatedAt: NOW
};

function profileFor(providerType: ImageProviderType): ImageApiProfile {
  const profile = createDefaultImageApiProfile(providerType, `profile_${providerType}`, NOW);
  if ('models' in profile) {
    profile.models = [{ modelId: `model_${providerType}`, source: 'manual' }];
    profile.defaultModelId = `model_${providerType}`;
  }
  return profile;
}

function presetFor(providerType: ImageProviderType): ImageGenerationPreset {
  const common = {
    name: providerType,
    profileId: `profile_${providerType}`,
    providerType,
    variantKey: 'narrative-scene' as const,
    routingTarget: providerType === 'comfyui-workflow'
      ? { kind: 'comfy-workflow' as const, workflowTemplateId: comfyWorkflow.workflowTemplateId }
      : { kind: 'model' as const, modelId: `model_${providerType}` },
    targetAspectRatio: '16:9',
    now: NOW
  };
  switch (providerType) {
    case 'openai-images':
      return createImageGenerationPreset({ ...common, generationParameters: {
        providerType, requestedImageCount: 1, size: { mode: 'auto' }, quality: 'medium',
        outputFormat: 'webp', outputCompression: 80, background: 'opaque'
      } });
    case 'xai-images':
      return createImageGenerationPreset({ ...common, generationParameters: {
        providerType, requestedImageCount: 1, aspectRatio: '16:9', resolution: '1k'
      } });
    case 'gemini-image':
      return createImageGenerationPreset({ ...common, generationParameters: {
        providerType, requestedImageCount: 1, aspectRatio: '16:9', imageSize: '1K', mimeType: 'image/png'
      } });
    case 'alibaba-model-studio':
      return createImageGenerationPreset({ ...common, generationParameters: {
        providerType, requestedImageCount: 1, size: { mode: 'provider-default' },
        watermark: 'provider-default', promptEnhancement: 'provider-default', thinkingMode: 'provider-default'
      } });
    case 'novelai-image':
      return createImageGenerationPreset({ ...common, generationParameters: {
        providerType, requestedImageCount: 1, width: 1216, height: 832,
        seed: { mode: 'provider-random' }, qualityToggle: true, smea: false, smeaDynamic: false
      } });
    case 'comfyui-workflow':
      return createImageGenerationPreset({ ...common, generationParameters: {
        providerType, workflowTemplateId: comfyWorkflow.workflowTemplateId, overrides: { width: 1024 }
      } });
    case 'sd-webui':
      return createImageGenerationPreset({ ...common, generationParameters: {
        providerType, requestedImageCount: 1, width: 1024, height: 576,
        seed: { mode: 'provider-random' }
      } });
  }
}

describe('ImageGenerationPresetEditor', () => {
  it.each([
    ['openai-images', 'OpenAI Images 参数'],
    ['xai-images', 'Grok（xAI）参数'],
    ['gemini-image', 'Gemini 图片参数'],
    ['alibaba-model-studio', '阿里云百炼参数'],
    ['novelai-image', 'NovelAI 参数'],
    ['comfyui-workflow', 'ComfyUI 已映射覆盖项'],
    ['sd-webui', 'SD WebUI / Forge 参数']
  ] as const)('renders the typed %s form without an arbitrary JSON editor', (providerType, legend) => {
    render(<ImageGenerationPresetEditor
      value={presetFor(providerType)}
      profile={profileFor(providerType)}
      workflows={providerType === 'comfyui-workflow' ? [comfyWorkflow] : []}
      onChange={() => undefined}
    />);

    expect(screen.getByRole('group', { name: legend })).toBeInTheDocument();
    expect(screen.queryByLabelText(/JSON/i)).not.toBeInTheDocument();
  });

  it('clears OpenAI compression when switching output to PNG', () => {
    const onChange = vi.fn();
    render(<ImageGenerationPresetEditor
      value={presetFor('openai-images')}
      profile={profileFor('openai-images')}
      workflows={[]}
      onChange={onChange}
    />);

    fireEvent.change(screen.getByLabelText('输出格式'), { target: { value: 'png' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      generationParameters: expect.objectContaining({ outputFormat: 'png', outputCompression: undefined })
    }));
  });

  it.each([
    ['openai-images', 'builtin-dialect-openai-gpt-image', 'OpenAI GPT Image 推荐'],
    ['gemini-image', 'builtin-dialect-gemini-image', 'Gemini 原生图片推荐']
  ] as const)('uses the dedicated %s prompt dialect by default', (providerType, dialectPresetId, dialectName) => {
    const preset = presetFor(providerType);
    render(<ImageGenerationPresetEditor
      value={preset}
      profile={profileFor(providerType)}
      workflows={[]}
      onChange={vi.fn()}
    />);

    expect(preset.promptDialectPresetId).toBe(dialectPresetId);
    expect(screen.getByLabelText('模型渲染方案（提示词语法）')).toHaveValue(dialectPresetId);
    expect(screen.getByRole('option', { name: dialectName })).toBeInTheDocument();
  });

  it('shows a checkpoint-derived ComfyUI format suggestion without overriding the player selection', () => {
    const onChange = vi.fn();
    const illustriousWorkflow: ComfyWorkflowTemplate = {
      ...comfyWorkflow,
      apiWorkflow: {
        ...comfyWorkflow.apiWorkflow,
        '3': {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: 'asianBlendIllustrious_v10.safetensors' }
        }
      },
      bindings: {
        ...comfyWorkflow.bindings,
        checkpoint: { nodeId: '3', inputName: 'ckpt_name' }
      }
    };
    const preset = presetFor('comfyui-workflow');
    expect(preset.promptDialectPresetId).toBe('builtin-dialect-generic-en-tags');

    render(<ImageGenerationPresetEditor
      value={preset}
      profile={profileFor('comfyui-workflow')}
      workflows={[illustriousWorkflow]}
      onChange={onChange}
    />);

    expect(screen.getByText(/当前模型提示/)).toHaveTextContent('asianBlendIllustrious_v10.safetensors');
    expect(screen.getByText(/当前模型提示/)).toHaveTextContent('建议使用“Illustrious”渲染方案');
    fireEvent.click(screen.getByRole('button', { name: '采用建议方案' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      promptDialectPresetId: 'builtin-dialect-illustrious'
    }));
  });

  it('detects NovelAI syntax but refuses to recommend it through an incompatible OpenAI transport', () => {
    const onChange = vi.fn();
    const profile = profileFor('openai-images');
    if (profile.providerType !== 'openai-images') throw new Error('test profile type mismatch');
    profile.models = [{ modelId: 'nai-diffusion-4-5-curated', source: 'manual' }];
    profile.defaultModelId = 'nai-diffusion-4-5-curated';
    const preset = {
      ...presetFor('openai-images'),
      routingTarget: { kind: 'model' as const, modelId: 'nai-diffusion-4-5-curated' },
      promptDialectPresetId: 'builtin-dialect-general-en'
    };

    render(<ImageGenerationPresetEditor
      value={preset}
      profile={profile}
      workflows={[]}
      onChange={onChange}
    />);

    expect(screen.getByLabelText('模型渲染方案（提示词语法）')).toHaveValue(
      'builtin-dialect-general-en'
    );
    expect(screen.getByText(/当前模型提示/)).toHaveTextContent('建议使用“NovelAI”渲染方案');
    expect(screen.getByText(/当前模型提示/)).toHaveTextContent('当前传输通道不兼容');
    expect(screen.queryByRole('button', { name: '采用建议方案' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a blocking compatibility state when NovelAI is selected on a merged-negative API', () => {
    render(<ImageGenerationPresetEditor
      value={{ ...presetFor('openai-images'), promptDialectPresetId: 'builtin-dialect-novelai' }}
      profile={profileFor('openai-images')}
      workflows={[]}
      onChange={vi.fn()}
    />);

    expect(screen.getByRole('alert')).toHaveTextContent('传输兼容性：不兼容');
    expect(screen.getByRole('alert')).toHaveTextContent('可以保存为待修复预设');
  });

  it('explains NovelAI model-specific quality tags without locking the player setting', () => {
    const onChange = vi.fn();
    render(<ImageGenerationPresetEditor
      value={presetFor('novelai-image')}
      profile={profileFor('novelai-image')}
      workflows={[]}
      onChange={onChange}
    />);

    expect(screen.getByText(/质量增强.*实际模型版本/)).toHaveTextContent('玩家可以关闭');
    fireEvent.change(screen.getByLabelText('质量增强'), { target: { value: 'false' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      generationParameters: expect.objectContaining({ qualityToggle: false })
    }));
  });

  it.each([
    ['xai-images', '4:3'],
    ['gemini-image', '3:2']
  ] as const)('keeps %s native aspect ratio and preset target in sync', (providerType, aspectRatio) => {
    const onChange = vi.fn();
    render(<ImageGenerationPresetEditor
      value={presetFor(providerType)}
      profile={profileFor(providerType)}
      workflows={[]}
      onChange={onChange}
    />);

    fireEvent.change(screen.getByLabelText('画幅比例'), { target: { value: aspectRatio } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      targetAspectRatio: aspectRatio,
      generationParameters: expect.objectContaining({ aspectRatio })
    }));
  });

  it('exposes typed NovelAI and SD WebUI reference-image controls', () => {
    const novelOnChange = vi.fn();
    const novel = render(<ImageGenerationPresetEditor
      value={presetFor('novelai-image')}
      profile={profileFor('novelai-image')}
      workflows={[]}
      onChange={novelOnChange}
    />);
    fireEvent.change(screen.getByLabelText('参考图 Strength（0–1）'), { target: { value: '0.7' } });
    expect(novelOnChange).toHaveBeenLastCalledWith(expect.objectContaining({
      generationParameters: expect.objectContaining({
        imageToImage: { strength: 0.7, noise: 0.1 }
      })
    }));
    novel.unmount();

    const sdOnChange = vi.fn();
    render(<ImageGenerationPresetEditor
      value={presetFor('sd-webui')}
      profile={profileFor('sd-webui')}
      workflows={[]}
      onChange={sdOnChange}
    />);
    fireEvent.change(screen.getByLabelText('参考图去噪强度（0–1）'), { target: { value: '0.42' } });
    expect(sdOnChange).toHaveBeenLastCalledWith(expect.objectContaining({
      generationParameters: expect.objectContaining({
        imageToImage: { denoisingStrength: 0.42 }
      })
    }));
  });

  it('renders declared ComfyUI workflow parameters and stores only player overrides', () => {
    const onChange = vi.fn();
    render(<ImageGenerationPresetEditor
      value={presetFor('comfyui-workflow')}
      profile={profileFor('comfyui-workflow')}
      workflows={[comfyWorkflow]}
      onChange={onChange}
    />);

    const denoise = screen.getByLabelText(/重绘幅度（原值：0.55）/);
    expect(denoise).toHaveValue(null);
    expect(screen.getByText('越低越接近参考图')).toBeInTheDocument();
    fireEvent.change(denoise, { target: { value: '0.48' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      generationParameters: expect.objectContaining({
        overrides: expect.objectContaining({ custom: { denoise: 0.48 } })
      })
    }));
  });

  it('shows an honest ready state only after a ComfyUI recipe has real workflow mappings', () => {
    const recipe = BUILT_IN_COMFY_STYLE_RECIPES.find((item) =>
      item.recipeId === 'builtin-comfy-recipe-oda-non'
    );
    if (!recipe) throw new Error('missing built-in recipe');
    const application = createComfyStyleRecipeApplication(recipe);
    application.assetMappings['style-lora'] = {
      ...application.assetMappings['style-lora'],
      fileParameterKey: 'lora.file',
      modelStrengthParameterKey: 'lora.model',
      clipStrengthParameterKey: 'lora.clip'
    };
    const workflow: ComfyWorkflowTemplate = {
      ...comfyWorkflow,
      apiWorkflow: {
        ...comfyWorkflow.apiWorkflow,
        '3': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'base.safetensors' } },
        '4': {
          class_type: 'LoraLoader',
          inputs: { lora_name: '', strength_model: 0, strength_clip: 0 }
        }
      },
      bindings: {
        ...comfyWorkflow.bindings,
        checkpoint: { nodeId: '3', inputName: 'ckpt_name' }
      },
      exposedParameters: [
        ...(comfyWorkflow.exposedParameters ?? []),
        {
          key: 'lora.file',
          label: 'LoRA 文件',
          binding: { nodeId: '4', inputName: 'lora_name' },
          valueType: 'text'
        },
        {
          key: 'lora.model',
          label: 'Model strength',
          binding: { nodeId: '4', inputName: 'strength_model' },
          valueType: 'number',
          min: 0,
          max: 1
        },
        {
          key: 'lora.clip',
          label: 'CLIP strength',
          binding: { nodeId: '4', inputName: 'strength_clip' },
          valueType: 'number',
          min: 0,
          max: 1
        }
      ]
    };
    const preset = {
      ...presetFor('comfyui-workflow'),
      comfyStyleRecipe: application,
      promptDialectPresetId: recipe.recommendedPromptDialectPresetId
    };
    const onChange = vi.fn();
    const onSelectCompanionStyle = vi.fn();
    render(<ImageGenerationPresetEditor
      value={preset}
      profile={profileFor('comfyui-workflow')}
      workflows={[workflow]}
      comfyStyleRecipes={BUILT_IN_COMFY_STYLE_RECIPES}
      stylePresets={BUILT_IN_IMAGE_STYLE_PRESETS}
      onSelectCompanionStyle={onSelectCompanionStyle}
      onChange={onChange}
    />);

    expect(screen.getByRole('complementary', { name: 'ComfyUI 配方兼容状态' }))
      .toHaveTextContent('配方可应用');
    expect(screen.getByLabelText('WAI Illustrious checkpoint本地文件名'))
      .toHaveValue('waiIllustriousSDXL_v170.safetensors');
    expect(screen.getByLabelText('织田 non 风格 LoRA文件参数')).toHaveValue('lora.file');
    fireEvent.click(screen.getByRole('button', { name: '同步配套提示词风格' }));
    expect(onSelectCompanionStyle).toHaveBeenCalledWith('builtin-style-comfy-oda-non');
    fireEvent.change(screen.getByLabelText('ComfyUI 配方应用方式'), {
      target: { value: 'prompt-only' }
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      comfyStyleRecipe: expect.objectContaining({ mode: 'prompt-only' })
    }));
  });
});
