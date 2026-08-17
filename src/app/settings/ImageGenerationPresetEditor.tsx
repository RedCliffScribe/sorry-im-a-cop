import type { ImageGenerationPreset } from '../../domain/imageGeneration/generationPresets';
import {
  createComfyStyleRecipeApplication,
  isComfyStyleRecipeCompatibleWithVariant,
  resolveComfyStyleRecipeCompatibility,
  type ComfyStyleRecipe,
  type ComfyStyleRecipeAssetMapping
} from '../../domain/imageGeneration/comfyStyleRecipes';
import {
  BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS,
  resolveDefaultImagePromptDialectPresetId,
  resolvePromptTransportCompatibility,
  type NegativePromptMode,
  type ImagePromptDialectPreset,
  type ImageStylePreset
} from '../../domain/imageGeneration/promptConversion';
import { formatPresetOptionLabel } from './presetOptionLabels';
import {
  readComfyWorkflowCheckpointName,
  type ComfyWorkflowExposedParameter,
  type ComfyWorkflowParameterValue,
  type ComfyWorkflowTemplate,
  type ImageApiProfile
} from '../../domain/imageGeneration/profile';

interface ImageGenerationPresetEditorProps {
  value: ImageGenerationPreset;
  profile: ImageApiProfile;
  workflows: ComfyWorkflowTemplate[];
  dialectPresets?: readonly ImagePromptDialectPreset[];
  stylePresets?: readonly ImageStylePreset[];
  comfyStyleRecipes?: readonly ComfyStyleRecipe[];
  onSelectCompanionStyle?(stylePresetId: string): void;
  onChange(value: ImageGenerationPreset): void;
}

const aspectRatios = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20'];

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function negativePromptModeForEditor(
  profile: ImageApiProfile,
  workflow?: ComfyWorkflowTemplate
): NegativePromptMode {
  switch (profile.providerType) {
    case 'comfyui-workflow':
      return workflow?.bindings.negativePrompt ? 'separate' : 'workflow-controlled';
    case 'openai-images':
      return profile.config.compatibilityOverrides?.negativePromptMode === 'unsupported'
        ? 'unsupported'
        : 'merged-into-positive';
    case 'xai-images':
    case 'gemini-image':
      return 'merged-into-positive';
    default:
      return 'separate';
  }
}

export function ImageGenerationPresetEditor({
  value,
  profile,
  workflows,
  dialectPresets = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS,
  stylePresets = [],
  comfyStyleRecipes = [],
  onSelectCompanionStyle,
  onChange
}: ImageGenerationPresetEditorProps) {
  const update = (patch: Partial<ImageGenerationPreset>) => onChange({ ...value, ...patch });
  const parameters = value.generationParameters;
  const selectedWorkflowTemplateId = value.routingTarget.kind === 'comfy-workflow'
    ? value.routingTarget.workflowTemplateId
    : undefined;
  const selectedWorkflow = selectedWorkflowTemplateId
    ? workflows.find((workflow) => workflow.workflowTemplateId === selectedWorkflowTemplateId)
    : undefined;
  const comfyBindings = selectedWorkflowTemplateId
    ? selectedWorkflow?.bindings
    : undefined;
  const checkpointName = readComfyWorkflowCheckpointName(selectedWorkflow);
  const modelHint = value.routingTarget.kind === 'model'
    ? value.routingTarget.modelId
    : checkpointName;
  const suggestedDialectPresetId = resolveDefaultImagePromptDialectPresetId(
    profile.providerType,
    modelHint
  );
  const suggestedDialect = suggestedDialectPresetId
    ? dialectPresets.find((preset) => preset.dialectPresetId === suggestedDialectPresetId)
    : undefined;
  const selectedDialect = dialectPresets.find(
    (preset) => preset.dialectPresetId === value.promptDialectPresetId
  );
  const transportCompatibility = resolvePromptTransportCompatibility(
    selectedDialect?.family,
    negativePromptModeForEditor(profile, selectedWorkflow)
  );
  const suggestedTransportCompatibility = resolvePromptTransportCompatibility(
    suggestedDialect?.family,
    negativePromptModeForEditor(profile, selectedWorkflow)
  );
  const styleRecipeCompatibility = value.comfyStyleRecipe
    ? resolveComfyStyleRecipeCompatibility(value.comfyStyleRecipe, selectedWorkflow)
    : undefined;
  const selectedRecipeInLibrary = value.comfyStyleRecipe
    ? comfyStyleRecipes.find((recipe) => recipe.recipeId === value.comfyStyleRecipe?.recipeSnapshot.recipeId)
    : undefined;
  const updateParameters = (next: ImageGenerationPreset['generationParameters']) => update({ generationParameters: next });
  const updateComfyParameter = (key: string, nextValue: ComfyWorkflowParameterValue | undefined) => {
    if (parameters.providerType !== 'comfyui-workflow') return;
    const custom = { ...parameters.overrides.custom };
    if (nextValue === undefined) delete custom[key];
    else custom[key] = nextValue;
    updateParameters({
      ...parameters,
      overrides: {
        ...parameters.overrides,
        custom: Object.keys(custom).length ? custom : undefined
      }
    });
  };
  const selectStyleRecipe = (recipe: ComfyStyleRecipe | undefined) => {
    if (parameters.providerType !== 'comfyui-workflow') return;
    if (!recipe) {
      update({ comfyStyleRecipe: undefined });
      return;
    }
    const application = createComfyStyleRecipeApplication(recipe);
    const recommended = recipe.recommendedParameters;
    update({
      comfyStyleRecipe: application,
      promptDialectPresetId: recipe.recommendedPromptDialectPresetId,
      generationParameters: {
        ...parameters,
        overrides: {
          ...parameters.overrides,
          steps: selectedWorkflow?.bindings.steps && recommended.steps !== undefined
            ? recommended.steps
            : parameters.overrides.steps,
          cfg: selectedWorkflow?.bindings.cfg && recommended.cfg !== undefined
            ? recommended.cfg
            : parameters.overrides.cfg,
          sampler: selectedWorkflow?.bindings.sampler && recommended.sampler
            ? recommended.sampler
            : parameters.overrides.sampler,
          scheduler: selectedWorkflow?.bindings.scheduler && recommended.scheduler
            ? recommended.scheduler
            : parameters.overrides.scheduler
        }
      }
    });
  };
  const updateStyleRecipeMapping = (
    slotId: string,
    patch: Partial<ComfyStyleRecipeAssetMapping>
  ) => {
    if (!value.comfyStyleRecipe) return;
    update({
      comfyStyleRecipe: {
        ...value.comfyStyleRecipe,
        assetMappings: {
          ...value.comfyStyleRecipe.assetMappings,
          [slotId]: {
            ...value.comfyStyleRecipe.assetMappings[slotId],
            ...patch
          }
        }
      }
    });
  };

  return (
    <div className="image-generation-preset-editor">
      <div className="settings-grid two-column">
        <label>预设名称<input value={value.name} maxLength={200} onChange={(event) => update({ name: event.target.value })} /></label>
        <label>模型渲染方案（提示词语法）<select
          value={value.promptDialectPresetId}
          onChange={(event) => update({ promptDialectPresetId: event.target.value })}
        >
          {dialectPresets
            .filter((preset) => !preset.hidden || preset.dialectPresetId === value.promptDialectPresetId)
            .map((preset) => (
              <option key={preset.dialectPresetId} value={preset.dialectPresetId}>{formatPresetOptionLabel({
                id: preset.dialectPresetId,
                name: preset.name,
                origin: preset.origin
              }, dialectPresets.map((candidate) => ({
                id: candidate.dialectPresetId,
                name: candidate.name,
                origin: candidate.origin
              })))}</option>
            ))}
        </select></label>
        {parameters.providerType !== 'xai-images' && parameters.providerType !== 'gemini-image' ? (
          <label>目标画幅<input value={value.targetAspectRatio} maxLength={32} onChange={(event) => update({ targetAspectRatio: event.target.value })} /></label>
        ) : null}
        {value.routingTarget.kind === 'model' && profile.providerType !== 'comfyui-workflow' ? (
          <label>生成模型<select value={value.routingTarget.modelId} onChange={(event) => update({ routingTarget: { kind: 'model', modelId: event.target.value } })}>
            {profile.models.map((model) => <option key={model.modelId} value={model.modelId}>{model.displayName || model.modelId}</option>)}
          </select></label>
        ) : null}
        {value.routingTarget.kind === 'comfy-workflow' ? (
          <label>API 工作流<select value={value.routingTarget.workflowTemplateId} onChange={(event) => {
            if (parameters.providerType !== 'comfyui-workflow') return;
            const nextWorkflow = workflows.find((workflow) => workflow.workflowTemplateId === event.target.value);
            const allowedCustomKeys = new Set((nextWorkflow?.exposedParameters ?? []).map((parameter) => parameter.key));
            const custom = Object.fromEntries(
              Object.entries(parameters.overrides.custom ?? {}).filter(([key]) => allowedCustomKeys.has(key))
            );
            update({
              routingTarget: { kind: 'comfy-workflow', workflowTemplateId: event.target.value },
              generationParameters: {
                ...parameters,
                workflowTemplateId: event.target.value,
                overrides: {
                  ...parameters.overrides,
                  custom: Object.keys(custom).length ? custom : undefined
                }
              }
            });
          }}>
            {workflows.map((workflow) => <option key={workflow.workflowTemplateId} value={workflow.workflowTemplateId}>{workflow.name}</option>)}
          </select></label>
        ) : null}
      </div>
      <p
        className="muted image-generation-preset-editor__dialect-hint"
        role={transportCompatibility.status === 'incompatible' ? 'alert' : undefined}
      >
        传输兼容性：{transportCompatibility.status === 'compatible' ? '可执行' : '不兼容'}；
        {transportCompatibility.message}
        {transportCompatibility.status === 'incompatible'
          ? ' 可以保存为待修复预设，但不能预览、手动提交或用于自动生图。'
          : null}
      </p>
      {modelHint && suggestedDialect && suggestedDialectPresetId !== 'builtin-dialect-generic-en-tags' ? (
        <p className="muted image-generation-preset-editor__dialect-hint">
          当前模型提示：<code>{modelHint}</code>。建议使用“{suggestedDialect.name}”渲染方案；
          这只作为可见建议，不覆盖玩家选择。
          {suggestedTransportCompatibility.status === 'incompatible'
            ? ` 但当前传输通道不兼容：${suggestedTransportCompatibility.message}`
            : null}
          {value.promptDialectPresetId !== suggestedDialectPresetId
          && suggestedTransportCompatibility.status === 'compatible' ? (
            <button
              type="button"
              onClick={() => update({ promptDialectPresetId: suggestedDialectPresetId })}
            >采用建议方案</button>
          ) : null}
        </p>
      ) : null}

      {parameters.providerType === 'openai-images' ? <fieldset className="image-settings-prompt-group"><legend>OpenAI Images 参数</legend>
        <div className="settings-grid two-column">
          <label>候选图片数<input type="number" min={1} max={4} value={parameters.requestedImageCount} onChange={(event) => updateParameters({ ...parameters, requestedImageCount: numberValue(event.target.value, 1) })} /></label>
          <label>尺寸模式<select value={parameters.size.mode} onChange={(event) => updateParameters({ ...parameters, size: event.target.value === 'auto' ? { mode: 'auto' } : { mode: 'dimensions', width: 1024, height: 1024 } })}><option value="auto">供应商自动</option><option value="dimensions">明确宽高</option></select></label>
          {parameters.size.mode === 'dimensions' ? <>
            <label>宽度<input type="number" min={1} value={parameters.size.width} onChange={(event) => updateParameters({ ...parameters, size: { mode: 'dimensions', width: numberValue(event.target.value, 1), height: parameters.size.mode === 'dimensions' ? parameters.size.height : 1 } })} /></label>
            <label>高度<input type="number" min={1} value={parameters.size.height} onChange={(event) => updateParameters({ ...parameters, size: { mode: 'dimensions', width: parameters.size.mode === 'dimensions' ? parameters.size.width : 1, height: numberValue(event.target.value, 1) } })} /></label>
          </> : null}
          <label>质量<select value={parameters.quality} onChange={(event) => updateParameters({ ...parameters, quality: event.target.value as typeof parameters.quality })}><option value="auto">自动</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
          <label>输出格式<select value={parameters.outputFormat} onChange={(event) => {
            const outputFormat = event.target.value as typeof parameters.outputFormat;
            updateParameters(outputFormat === 'png'
              ? { ...parameters, outputFormat, outputCompression: undefined }
              : { ...parameters, outputFormat });
          }}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label>
          {parameters.outputFormat !== 'png' ? <label>压缩质量 0–100<input type="number" min={0} max={100} value={parameters.outputCompression ?? ''} onChange={(event) => updateParameters({ ...parameters, outputCompression: optionalNumber(event.target.value) })} /></label> : null}
          <label>背景<select value={parameters.background} onChange={(event) => updateParameters({ ...parameters, background: event.target.value as typeof parameters.background })}><option value="auto">自动</option><option value="opaque">不透明</option><option value="transparent">透明（需模型支持）</option></select></label>
        </div>
      </fieldset> : null}

      {parameters.providerType === 'xai-images' ? <fieldset className="image-settings-prompt-group"><legend>Grok（xAI）参数</legend><div className="settings-grid two-column">
        <label>候选图片数<input type="number" min={1} max={4} value={parameters.requestedImageCount} onChange={(event) => updateParameters({ ...parameters, requestedImageCount: numberValue(event.target.value, 1) })} /></label>
        <label>画幅比例<select value={parameters.aspectRatio} onChange={(event) => {
          const aspectRatio = event.target.value as typeof parameters.aspectRatio;
          update({ targetAspectRatio: aspectRatio, generationParameters: { ...parameters, aspectRatio } });
        }}>{aspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}</select></label>
        <label>分辨率<select value={parameters.resolution} onChange={(event) => updateParameters({ ...parameters, resolution: event.target.value as typeof parameters.resolution })}><option value="1k">1K</option><option value="2k">2K</option></select></label>
      </div></fieldset> : null}

      {parameters.providerType === 'gemini-image' ? <fieldset className="image-settings-prompt-group"><legend>Gemini 图片参数</legend><div className="settings-grid two-column">
        <label>画幅比例<input value={parameters.aspectRatio} maxLength={32} onChange={(event) => {
          const aspectRatio = event.target.value;
          update({ targetAspectRatio: aspectRatio, generationParameters: { ...parameters, aspectRatio } });
        }} /></label>
        <label>图片尺寸<select value={parameters.imageSize} onChange={(event) => updateParameters({ ...parameters, imageSize: event.target.value as typeof parameters.imageSize })}><option value="0.5K">0.5K</option><option value="1K">1K</option><option value="2K">2K</option><option value="4K">4K</option></select></label>
        <label>格式<select value={parameters.mimeType} onChange={(event) => updateParameters({ ...parameters, mimeType: event.target.value as typeof parameters.mimeType })}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option></select></label>
      </div></fieldset> : null}

      {parameters.providerType === 'alibaba-model-studio' ? <fieldset className="image-settings-prompt-group"><legend>阿里云百炼参数</legend><div className="settings-grid two-column">
        <label>候选图片数<input type="number" min={1} max={4} value={parameters.requestedImageCount} onChange={(event) => updateParameters({ ...parameters, requestedImageCount: numberValue(event.target.value, 1) })} /></label>
        <label>尺寸模式<select value={parameters.size.mode} onChange={(event) => {
          const mode = event.target.value;
          const size = mode === 'provider-default' ? { mode: 'provider-default' as const } : mode === 'resolution-tier' ? { mode: 'resolution-tier' as const, value: '1K' as const } : mode === 'fixed-preset' ? { mode: 'fixed-preset' as const, value: '1024*1024' } : { mode: 'dimensions' as const, width: 1024, height: 1024 };
          updateParameters({ ...parameters, size });
        }}><option value="provider-default">供应商默认</option><option value="resolution-tier">分辨率等级</option><option value="dimensions">明确宽高</option><option value="fixed-preset">固定预设文本</option></select></label>
        {parameters.size.mode === 'resolution-tier' ? <label>分辨率等级<select value={parameters.size.value} onChange={(event) => updateParameters({ ...parameters, size: { mode: 'resolution-tier', value: event.target.value as '1K' | '2K' | '4K' } })}><option value="1K">1K</option><option value="2K">2K</option><option value="4K">4K</option></select></label> : null}
        {parameters.size.mode === 'dimensions' ? <><label>宽度<input type="number" min={1} value={parameters.size.width} onChange={(event) => updateParameters({ ...parameters, size: { mode: 'dimensions', width: numberValue(event.target.value, 1), height: parameters.size.mode === 'dimensions' ? parameters.size.height : 1 } })} /></label><label>高度<input type="number" min={1} value={parameters.size.height} onChange={(event) => updateParameters({ ...parameters, size: { mode: 'dimensions', width: parameters.size.mode === 'dimensions' ? parameters.size.width : 1, height: numberValue(event.target.value, 1) } })} /></label></> : null}
        {parameters.size.mode === 'fixed-preset' ? <label>固定尺寸预设<input value={parameters.size.value} onChange={(event) => updateParameters({ ...parameters, size: { mode: 'fixed-preset', value: event.target.value } })} /></label> : null}
        <SeedFields seed={parameters.seed} onChange={(seed) => updateParameters({ ...parameters, seed })} />
        <TriState label="水印" value={parameters.watermark} onChange={(watermark) => updateParameters({ ...parameters, watermark })} />
        <TriState label="提示词增强" value={parameters.promptEnhancement} onChange={(promptEnhancement) => updateParameters({ ...parameters, promptEnhancement })} />
        <TriState label="思考模式" value={parameters.thinkingMode} onChange={(thinkingMode) => updateParameters({ ...parameters, thinkingMode })} />
      </div></fieldset> : null}

      {parameters.providerType === 'novelai-image' ? <fieldset className="image-settings-prompt-group"><legend>NovelAI 参数</legend><div className="settings-grid two-column">
        <label>候选图片数<input type="number" min={1} max={4} value={parameters.requestedImageCount} onChange={(event) => updateParameters({ ...parameters, requestedImageCount: numberValue(event.target.value, 1) })} /></label>
        <label>宽度<input type="number" min={1} value={parameters.width} onChange={(event) => updateParameters({ ...parameters, width: numberValue(event.target.value, 1) })} /></label><label>高度<input type="number" min={1} value={parameters.height} onChange={(event) => updateParameters({ ...parameters, height: numberValue(event.target.value, 1) })} /></label>
        <SeedFields seed={parameters.seed} onChange={(seed) => updateParameters({ ...parameters, seed: seed ?? { mode: 'provider-random' } })} required />
        <OptionalText label="采样器" value={parameters.sampler} onChange={(sampler) => updateParameters({ ...parameters, sampler })} />
        <OptionalNumber label="步数" value={parameters.steps} onChange={(steps) => updateParameters({ ...parameters, steps })} />
        <OptionalNumber label="CFG / Guidance" value={parameters.guidanceScale} onChange={(guidanceScale) => updateParameters({ ...parameters, guidanceScale })} />
        <OptionalNumber label="CFG Rescale" value={parameters.cfgRescale} onChange={(cfgRescale) => updateParameters({ ...parameters, cfgRescale })} />
        <OptionalText label="噪声计划" value={parameters.noiseSchedule} onChange={(noiseSchedule) => updateParameters({ ...parameters, noiseSchedule })} />
        <OptionalNumber label="UC 预设" value={parameters.undesiredContentPreset} onChange={(undesiredContentPreset) => updateParameters({ ...parameters, undesiredContentPreset })} />
        <BooleanField label="质量增强" value={parameters.qualityToggle} onChange={(qualityToggle) => updateParameters({ ...parameters, qualityToggle })} />
        <BooleanField label="SMEA" value={parameters.smea} onChange={(smea) => updateParameters({ ...parameters, smea })} />
        <BooleanField label="动态 SMEA" value={parameters.smeaDynamic} onChange={(smeaDynamic) => updateParameters({ ...parameters, smeaDynamic })} />
        <label>参考图 Strength（0–1）<input type="number" min={0} max={1} step={0.01} value={parameters.imageToImage?.strength ?? 0.65} onChange={(event) => updateParameters({ ...parameters, imageToImage: { strength: numberValue(event.target.value, 0.65), noise: parameters.imageToImage?.noise ?? 0.1 } })} /></label>
        <label>参考图 Noise（0–1）<input type="number" min={0} max={1} step={0.01} value={parameters.imageToImage?.noise ?? 0.1} onChange={(event) => updateParameters({ ...parameters, imageToImage: { strength: parameters.imageToImage?.strength ?? 0.65, noise: numberValue(event.target.value, 0.1) } })} /></label>
      </div>
      <p className="muted">“质量增强”由 NovelAI 按实际模型版本追加对应质量标签；不要在渲染方案里混写跨版本质量串。若精确文字或特殊画风受到干扰，玩家可以关闭。</p>
      <p className="muted">Strength 与 Noise 只在玩家明确选择参考图时发送；未保存自定义值时使用 0.65 / 0.10。</p></fieldset> : null}

      {parameters.providerType === 'comfyui-workflow' ? <fieldset className="image-settings-prompt-group"><legend>ComfyUI 风格配方</legend>
        <p className="muted">配方负责真实 checkpoint／LoRA 映射；提示词风格只是配套语义。文件名无需与内置示例相同，但工作流必须把对应字段声明为标准绑定或安全开放参数。</p>
        <div className="settings-grid two-column">
          <label>风格配方<select
            aria-label="ComfyUI 风格配方"
            value={value.comfyStyleRecipe?.recipeSnapshot.recipeId ?? ''}
            onChange={(event) => {
              const recipe = comfyStyleRecipes.find((item) => item.recipeId === event.target.value);
              selectStyleRecipe(recipe);
            }}
          >
            <option value="">不使用风格配方</option>
            {comfyStyleRecipes
              .filter((recipe) =>
                isComfyStyleRecipeCompatibleWithVariant(recipe, value.variantKey)
                && (!recipe.hidden || recipe.recipeId === value.comfyStyleRecipe?.recipeSnapshot.recipeId)
              )
              .map((recipe) => <option key={recipe.recipeId} value={recipe.recipeId}>{recipe.name}</option>)}
            {value.comfyStyleRecipe && !selectedRecipeInLibrary
              ? <option value={value.comfyStyleRecipe.recipeSnapshot.recipeId}>{value.comfyStyleRecipe.recipeSnapshot.name}（已删除的快照）</option>
              : null}
          </select></label>
          {value.comfyStyleRecipe ? <label>应用方式<select
            aria-label="ComfyUI 配方应用方式"
            value={value.comfyStyleRecipe.mode}
            onChange={(event) => update({
              comfyStyleRecipe: {
                ...value.comfyStyleRecipe!,
                mode: event.target.value as 'mapped' | 'prompt-only'
              }
            })}
          >
            <option value="mapped">工作流映射（真实加载）</option>
            <option value="prompt-only">仅提示词近似（不加载资产）</option>
          </select></label> : null}
        </div>
        {value.comfyStyleRecipe ? <>
          <aside
            className="image-settings-gate-note"
            data-recipe-status={styleRecipeCompatibility?.status}
            aria-label="ComfyUI 配方兼容状态"
          >
            <p><strong>{styleRecipeCompatibility?.summary}</strong> · {value.comfyStyleRecipe.recipeSnapshot.name}</p>
            <ul>{styleRecipeCompatibility?.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
            <p>配套提示词风格：{stylePresets.find((style) =>
              style.stylePresetId === value.comfyStyleRecipe?.recipeSnapshot.companionStylePresetId
            )?.name ?? value.comfyStyleRecipe.recipeSnapshot.companionStylePresetId}</p>
          </aside>
          <div className="image-profile-save-actions">
            {onSelectCompanionStyle ? <button type="button" onClick={() =>
              onSelectCompanionStyle(value.comfyStyleRecipe!.recipeSnapshot.companionStylePresetId)
            }>同步配套提示词风格</button> : null}
            {selectedRecipeInLibrary ? <button type="button" onClick={() =>
              selectStyleRecipe(selectedRecipeInLibrary)
            }>重新载入配方库当前内容</button> : null}
          </div>
          {value.comfyStyleRecipe.mode === 'mapped' ? value.comfyStyleRecipe.recipeSnapshot.assetSlots.map((slot) => {
            const mapping = value.comfyStyleRecipe!.assetMappings[slot.slotId] ?? {};
            const fileParameters = (selectedWorkflow?.exposedParameters ?? []).filter((parameter) =>
              parameter.valueType === 'text' || parameter.valueType === 'select'
            );
            const strengthParameters = (selectedWorkflow?.exposedParameters ?? []).filter((parameter) =>
              parameter.valueType === 'number' || parameter.valueType === 'integer'
            );
            return <fieldset key={slot.slotId}>
              <legend>{slot.label} · {slot.kind === 'checkpoint' ? 'Checkpoint' : 'LoRA'}{slot.required ? ' · 必需' : ' · 可选'}</legend>
              <p className="muted">{slot.description}</p>
              <div className="settings-grid two-column">
                <label>玩家本地文件名<input
                  aria-label={`${slot.label}本地文件名`}
                  value={mapping.fileName ?? ''}
                  placeholder={slot.filenameHints[0] ?? ''}
                  onChange={(event) => updateStyleRecipeMapping(slot.slotId, {
                    fileName: event.target.value || undefined
                  })}
                /></label>
                {slot.kind === 'lora' ? <label>LoRA 文件参数<select
                  aria-label={`${slot.label}文件参数`}
                  value={mapping.fileParameterKey ?? ''}
                  onChange={(event) => updateStyleRecipeMapping(slot.slotId, {
                    fileParameterKey: event.target.value || undefined
                  })}
                >
                  <option value="">尚未映射</option>
                  {fileParameters.map((parameter) => <option key={parameter.key} value={parameter.key}>{parameter.label} · {parameter.key}</option>)}
                </select></label> : <p className="muted">使用工作流的 checkpoint 标准绑定，不需要选择节点或输入路径。</p>}
                {slot.kind === 'lora' ? <>
                  <label>Model strength 参数<select
                    aria-label={`${slot.label}Model strength 参数`}
                    value={mapping.modelStrengthParameterKey ?? ''}
                    onChange={(event) => updateStyleRecipeMapping(slot.slotId, {
                      modelStrengthParameterKey: event.target.value || undefined
                    })}
                  >
                    <option value="">尚未映射</option>
                    {strengthParameters.map((parameter) => <option key={parameter.key} value={parameter.key}>{parameter.label} · {parameter.key}</option>)}
                  </select></label>
                  <label>Model strength<input
                    aria-label={`${slot.label}Model strength`}
                    type="number"
                    step={0.01}
                    value={mapping.modelStrength ?? ''}
                    onChange={(event) => updateStyleRecipeMapping(slot.slotId, {
                      modelStrength: optionalNumber(event.target.value)
                    })}
                  /></label>
                  <label>CLIP strength 参数<select
                    aria-label={`${slot.label}CLIP strength 参数`}
                    value={mapping.clipStrengthParameterKey ?? ''}
                    onChange={(event) => updateStyleRecipeMapping(slot.slotId, {
                      clipStrengthParameterKey: event.target.value || undefined
                    })}
                  >
                    <option value="">尚未映射</option>
                    {strengthParameters.map((parameter) => <option key={parameter.key} value={parameter.key}>{parameter.label} · {parameter.key}</option>)}
                  </select></label>
                  <label>CLIP strength<input
                    aria-label={`${slot.label}CLIP strength`}
                    type="number"
                    step={0.01}
                    value={mapping.clipStrength ?? ''}
                    onChange={(event) => updateStyleRecipeMapping(slot.slotId, {
                      clipStrength: optionalNumber(event.target.value)
                    })}
                  /></label>
                </> : null}
              </div>
              {slot.filenameHints.length ? <p className="muted">示例文件名：{slot.filenameHints.join('；')}</p> : null}
              {slot.triggerWords ? <p className="muted">触发词说明：{slot.triggerWords}</p> : null}
            </fieldset>;
          }) : null}
        </> : null}
      </fieldset> : null}

      {parameters.providerType === 'comfyui-workflow' ? <fieldset className="image-settings-prompt-group"><legend>ComfyUI 已映射覆盖项</legend><div className="settings-grid two-column">
        {comfyBindings?.checkpoint ? <OptionalText label="Checkpoint" value={parameters.overrides.checkpoint} onChange={(checkpoint) => updateParameters({ ...parameters, overrides: { ...parameters.overrides, checkpoint } })} /> : null}
        {comfyBindings?.seed ? <SeedFields seed={parameters.overrides.seed} onChange={(seed) => updateParameters({ ...parameters, overrides: { ...parameters.overrides, seed } })} /> : null}
        {comfyBindings?.width ? <OptionalNumber label="宽度" value={parameters.overrides.width} onChange={(width) => updateParameters({ ...parameters, overrides: { ...parameters.overrides, width } })} /> : null}
        {comfyBindings?.height ? <OptionalNumber label="高度" value={parameters.overrides.height} onChange={(height) => updateParameters({ ...parameters, overrides: { ...parameters.overrides, height } })} /> : null}
        {comfyBindings?.steps ? <OptionalNumber label="步数" value={parameters.overrides.steps} onChange={(steps) => updateParameters({ ...parameters, overrides: { ...parameters.overrides, steps } })} /> : null}
        {comfyBindings?.cfg ? <OptionalNumber label="CFG" value={parameters.overrides.cfg} onChange={(cfg) => updateParameters({ ...parameters, overrides: { ...parameters.overrides, cfg } })} /> : null}
        {comfyBindings?.sampler ? <OptionalText label="采样器" value={parameters.overrides.sampler} onChange={(sampler) => updateParameters({ ...parameters, overrides: { ...parameters.overrides, sampler } })} /> : null}
        {comfyBindings?.scheduler ? <OptionalText label="调度器" value={parameters.overrides.scheduler} onChange={(scheduler) => updateParameters({ ...parameters, overrides: { ...parameters.overrides, scheduler } })} /> : null}
        {(selectedWorkflow?.exposedParameters ?? []).map((parameter) => (
          <ComfyWorkflowParameterField
            key={parameter.key}
            parameter={parameter}
            value={parameters.overrides.custom?.[parameter.key]}
            defaultValue={selectedWorkflow?.apiWorkflow[parameter.binding.nodeId]?.inputs[parameter.binding.inputName]}
            onChange={(nextValue) => updateComfyParameter(parameter.key, nextValue)}
          />
        ))}
      </div><p className="muted">工作流作者声明的安全参数也会在这里显示；选择“工作流原值”时不覆盖。仍不支持节点路径或 JSON Patch。</p></fieldset> : null}

      {parameters.providerType === 'sd-webui' ? <fieldset className="image-settings-prompt-group"><legend>SD WebUI / Forge 参数</legend><div className="settings-grid two-column">
        <label>候选图片数<input type="number" min={1} max={4} value={parameters.requestedImageCount} onChange={(event) => updateParameters({ ...parameters, requestedImageCount: numberValue(event.target.value, 1) })} /></label>
        <label>宽度<input type="number" min={1} value={parameters.width} onChange={(event) => updateParameters({ ...parameters, width: numberValue(event.target.value, 1) })} /></label><label>高度<input type="number" min={1} value={parameters.height} onChange={(event) => updateParameters({ ...parameters, height: numberValue(event.target.value, 1) })} /></label>
        <SeedFields seed={parameters.seed} onChange={(seed) => updateParameters({ ...parameters, seed: seed ?? { mode: 'provider-random' } })} required />
        <OptionalText label="Checkpoint" value={parameters.checkpoint} onChange={(checkpoint) => updateParameters({ ...parameters, checkpoint })} />
        <OptionalText label="采样器" value={parameters.samplerName} onChange={(samplerName) => updateParameters({ ...parameters, samplerName })} />
        <OptionalText label="调度器" value={parameters.scheduler} onChange={(scheduler) => updateParameters({ ...parameters, scheduler })} />
        <OptionalNumber label="步数" value={parameters.steps} onChange={(steps) => updateParameters({ ...parameters, steps })} />
        <OptionalNumber label="CFG" value={parameters.cfgScale} onChange={(cfgScale) => updateParameters({ ...parameters, cfgScale })} />
        <OptionalNumber label="CLIP Skip" value={parameters.clipSkip} onChange={(clipSkip) => updateParameters({ ...parameters, clipSkip })} />
        <BooleanField label="面部修复" value={parameters.restoreFaces} onChange={(restoreFaces) => updateParameters({ ...parameters, restoreFaces })} />
        <BooleanField label="平铺" value={parameters.tiling} onChange={(tiling) => updateParameters({ ...parameters, tiling })} />
        <label>参考图去噪强度（0–1）<input type="number" min={0} max={1} step={0.01} value={parameters.imageToImage?.denoisingStrength ?? 0.55} onChange={(event) => updateParameters({ ...parameters, imageToImage: { denoisingStrength: numberValue(event.target.value, 0.55) } })} /></label>
        <label><input type="checkbox" checked={parameters.hiresFix?.enabled ?? false} onChange={(event) => updateParameters({ ...parameters, hiresFix: event.target.checked ? { enabled: true, scale: 2, denoisingStrength: 0.7 } : undefined })} />启用高分修复</label>
        {parameters.hiresFix?.enabled ? <><OptionalNumber label="高分倍率" value={parameters.hiresFix.scale} onChange={(scale) => updateParameters({ ...parameters, hiresFix: { ...parameters.hiresFix!, scale } })} /><OptionalText label="放大器" value={parameters.hiresFix.upscaler} onChange={(upscaler) => updateParameters({ ...parameters, hiresFix: { ...parameters.hiresFix!, upscaler } })} /><OptionalNumber label="二次步数" value={parameters.hiresFix.secondPassSteps} onChange={(secondPassSteps) => updateParameters({ ...parameters, hiresFix: { ...parameters.hiresFix!, secondPassSteps } })} /><OptionalNumber label="去噪强度" value={parameters.hiresFix.denoisingStrength} onChange={(denoisingStrength) => updateParameters({ ...parameters, hiresFix: { ...parameters.hiresFix!, denoisingStrength } })} /></> : null}
      </div><p className="muted">参考图去噪强度只用于 img2img；未保存自定义值时使用 0.55。</p></fieldset> : null}
    </div>
  );
}

type Seed = { mode: 'provider-random' } | { mode: 'fixed'; value: number };
function SeedFields({ seed, onChange, required = false }: { seed?: Seed; onChange(value: Seed | undefined): void; required?: boolean }) {
  const mode = seed?.mode ?? (required ? 'provider-random' : 'unsupported');
  return <><label>Seed 策略<select value={mode} onChange={(event) => onChange(event.target.value === 'unsupported' ? undefined : event.target.value === 'fixed' ? { mode: 'fixed', value: 0 } : { mode: 'provider-random' })}>{!required ? <option value="unsupported">不发送</option> : null}<option value="provider-random">供应商随机</option><option value="fixed">固定</option></select></label>{seed?.mode === 'fixed' ? <label>固定 Seed<input type="number" min={0} value={seed.value} onChange={(event) => onChange({ mode: 'fixed', value: numberValue(event.target.value, 0) })} /></label> : null}</>;
}

function TriState({ label, value, onChange }: { label: string; value: 'provider-default' | 'enabled' | 'disabled'; onChange(value: 'provider-default' | 'enabled' | 'disabled'): void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value as typeof value)}><option value="provider-default">供应商默认</option><option value="enabled">启用</option><option value="disabled">禁用</option></select></label>;
}

function OptionalText({ label, value, onChange }: { label: string; value?: string; onChange(value?: string): void }) {
  return <label>{label}<input value={value ?? ''} onChange={(event) => onChange(event.target.value.trim() ? event.target.value : undefined)} /></label>;
}

function OptionalNumber({ label, value, onChange }: { label: string; value?: number; onChange(value?: number): void }) {
  return <label>{label}<input type="number" value={value ?? ''} onChange={(event) => onChange(optionalNumber(event.target.value))} /></label>;
}

function BooleanField({ label, value, onChange }: { label: string; value?: boolean; onChange(value?: boolean): void }) {
  return <label>{label}<select value={value === undefined ? 'default' : String(value)} onChange={(event) => onChange(event.target.value === 'default' ? undefined : event.target.value === 'true')}><option value="default">供应商默认</option><option value="true">启用</option><option value="false">禁用</option></select></label>;
}

function ComfyWorkflowParameterField({
  parameter,
  value,
  defaultValue,
  onChange
}: {
  parameter: ComfyWorkflowExposedParameter;
  value?: ComfyWorkflowParameterValue;
  defaultValue: unknown;
  onChange(value?: ComfyWorkflowParameterValue): void;
}) {
  const label = `${parameter.label}（原值：${String(defaultValue)}）`;
  const hint = parameter.description ? <small>{parameter.description}</small> : null;
  if (parameter.valueType === 'boolean') {
    return <label>{label}<select value={value === undefined ? 'default' : String(value)} onChange={(event) => onChange(event.target.value === 'default' ? undefined : event.target.value === 'true')}><option value="default">工作流原值</option><option value="true">启用</option><option value="false">禁用</option></select>{hint}</label>;
  }
  if (parameter.valueType === 'select') {
    return <label>{label}<select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || undefined)}><option value="">工作流原值</option>{parameter.options?.map((option) => <option key={option.value} value={option.value}>{option.label ?? option.value}</option>)}</select>{hint}</label>;
  }
  if (parameter.valueType === 'number' || parameter.valueType === 'integer') {
    return <label>{label}<input
      type="number"
      min={parameter.min}
      max={parameter.max}
      step={parameter.step ?? (parameter.valueType === 'integer' ? 1 : 'any')}
      value={typeof value === 'number' ? value : ''}
      onChange={(event) => onChange(optionalNumber(event.target.value))}
    />{hint}</label>;
  }
  return <label>{label}<input value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || undefined)} />{hint}</label>;
}
