import {
  createCustomComfyStyleRecipe,
  duplicateComfyStyleRecipe,
  normalizeComfyStyleRecipeOrder,
  restoreBuiltInComfyStyleRecipe,
  type ComfyStyleRecipe,
  type ComfyStyleRecipeAssetSlot,
  type ComfyStyleRecipePurpose
} from '../../domain/imageGeneration/comfyStyleRecipes';
import type {
  ImagePromptDialectPreset,
  ImageStylePreset
} from '../../domain/imageGeneration/promptConversion';
import { formatPresetOptionLabel } from './presetOptionLabels';

interface ComfyStyleRecipeLibraryEditorProps {
  recipes: ComfyStyleRecipe[];
  stylePresets: readonly ImageStylePreset[];
  dialectPresets: readonly ImagePromptDialectPreset[];
  onChange(recipes: ComfyStyleRecipe[], status: string): void;
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalText(value: string): string | undefined {
  return value.trim() ? value : undefined;
}

function customSlot(kind: ComfyStyleRecipeAssetSlot['kind']): ComfyStyleRecipeAssetSlot {
  return {
    slotId: `custom-asset:${crypto.randomUUID()}`,
    kind,
    label: kind === 'checkpoint' ? 'Checkpoint' : '风格 LoRA',
    description: '玩家自定义资产槽位。',
    required: true,
    filenameHints: [],
    recommendedModelStrength: kind === 'lora' ? 0.6 : undefined,
    recommendedClipStrength: kind === 'lora' ? 0.6 : undefined
  };
}

export function ComfyStyleRecipeLibraryEditor({
  recipes,
  stylePresets,
  dialectPresets,
  onChange
}: ComfyStyleRecipeLibraryEditorProps) {
  const updateRecipe = (
    recipeId: string,
    update: (recipe: ComfyStyleRecipe) => ComfyStyleRecipe
  ) => {
    onChange(
      recipes.map((recipe) =>
        recipe.recipeId === recipeId ? update(structuredClone(recipe)) : recipe
      ),
      '有未保存的 ComfyUI 风格配方修改。'
    );
  };
  const updateAssetSlot = (
    recipeId: string,
    slotId: string,
    update: (slot: ComfyStyleRecipeAssetSlot) => ComfyStyleRecipeAssetSlot
  ) => {
    updateRecipe(recipeId, (recipe) => ({
      ...recipe,
      assetSlots: recipe.assetSlots.map((slot) =>
        slot.slotId === slotId ? update(structuredClone(slot)) : slot
      )
    }));
  };
  const moveRecipe = (recipeId: string, delta: -1 | 1) => {
    const index = recipes.findIndex((recipe) => recipe.recipeId === recipeId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= recipes.length) return;
    const next = [...recipes];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(normalizeComfyStyleRecipeOrder(next), '有未保存的 ComfyUI 风格配方顺序修改。');
  };
  const togglePurpose = (
    recipeId: string,
    purpose: ComfyStyleRecipePurpose,
    checked: boolean
  ) => {
    updateRecipe(recipeId, (recipe) => {
      const purposes = checked
        ? [...new Set([...recipe.compatiblePurposes, purpose])]
        : recipe.compatiblePurposes.filter((item) => item !== purpose);
      return purposes.length ? { ...recipe, compatiblePurposes: purposes } : recipe;
    });
  };

  return (
    <>
      <div className="image-settings-section-heading">
        <div><p className="image-settings-kicker">COMFYUI STYLE RECIPES</p><h4>ComfyUI 风格配方库</h4></div>
        <span>{recipes.length} 套</span>
      </div>
      <p>配方保存模型家族、LoRA 资产槽位、推荐强度和采样参数；它不会保存或下载模型文件。玩家在每个 ComfyUI 生成预设中把逻辑槽位映射到自己的本地文件和工作流开放参数。</p>
      <aside className="image-settings-gate-note" aria-label="提示词风格与 ComfyUI 配方边界">
        <p><strong>两层边界：</strong>图片风格预设只提供跨供应商的提示词方向；ComfyUI 风格配方才负责 checkpoint／LoRA 的真实加载条件。没有模型映射时只能选择“仅提示词近似”，界面不会标成画风已复现。</p>
      </aside>
      <div className="image-profile-save-actions">
        <button type="button" onClick={() => {
          const recipe = createCustomComfyStyleRecipe('新建自定义 ComfyUI 配方');
          onChange(
            normalizeComfyStyleRecipeOrder([...recipes, recipe]),
            '已在编辑区新增自定义 ComfyUI 风格配方；点击保存后才会生效。'
          );
        }}>新增自定义配方</button>
      </div>
      {recipes.map((recipe, index) => (
        <details key={recipe.recipeId} className="image-settings-prompt-group">
          <summary>{recipe.name} · {recipe.origin === 'built-in' ? '内置' : '自定义'}{recipe.hidden ? ' · 已隐藏' : ''}</summary>
          <div className="settings-grid two-column">
            <label>名称<input
              value={recipe.name}
              maxLength={200}
              onChange={(event) => updateRecipe(recipe.recipeId, (current) => ({
                ...current,
                name: event.target.value
              }))}
            /></label>
            <label>配套提示词风格<select
              value={recipe.companionStylePresetId}
              onChange={(event) => updateRecipe(recipe.recipeId, (current) => ({
                ...current,
                companionStylePresetId: event.target.value
              }))}
            >
              {stylePresets.map((style) =>
                <option key={style.stylePresetId} value={style.stylePresetId}>{style.name}</option>)}
            </select></label>
            <label>推荐模型渲染方案<select
              value={recipe.recommendedPromptDialectPresetId}
              onChange={(event) => updateRecipe(recipe.recipeId, (current) => ({
                ...current,
                recommendedPromptDialectPresetId: event.target.value
              }))}
            >
              {dialectPresets.map((dialect) =>
                <option key={dialect.dialectPresetId} value={dialect.dialectPresetId}>{formatPresetOptionLabel({
                  id: dialect.dialectPresetId,
                  name: dialect.name,
                  origin: dialect.origin
                }, dialectPresets.map((candidate) => ({
                  id: candidate.dialectPresetId,
                  name: candidate.name,
                  origin: candidate.origin
                })))}</option>)}
            </select></label>
            <label><input
              type="checkbox"
              checked={recipe.hidden}
              onChange={(event) => updateRecipe(recipe.recipeId, (current) => ({
                ...current,
                hidden: event.target.checked
              }))}
            />从新选择列表隐藏</label>
          </div>
          <label>说明<textarea
            rows={3}
            value={recipe.description}
            maxLength={2000}
            onChange={(event) => updateRecipe(recipe.recipeId, (current) => ({
              ...current,
              description: event.target.value
            }))}
          /></label>
          <fieldset><legend>适用用途</legend>
            <label><input
              type="checkbox"
              checked={recipe.compatiblePurposes.includes('character')}
              onChange={(event) => togglePurpose(recipe.recipeId, 'character', event.target.checked)}
            />人物图</label>
            <label><input
              type="checkbox"
              checked={recipe.compatiblePurposes.includes('narrative-scene')}
              onChange={(event) => togglePurpose(recipe.recipeId, 'narrative-scene', event.target.checked)}
            />正文场景图</label>
          </fieldset>
          <fieldset><legend>推荐生成参数</legend>
            <div className="settings-grid two-column">
              <label>步数<input type="number" value={recipe.recommendedParameters.steps ?? ''} onChange={(event) =>
                updateRecipe(recipe.recipeId, (current) => ({
                  ...current,
                  recommendedParameters: {
                    ...current.recommendedParameters,
                    steps: optionalNumber(event.target.value)
                  }
                }))
              } /></label>
              <label>CFG<input type="number" step={0.1} value={recipe.recommendedParameters.cfg ?? ''} onChange={(event) =>
                updateRecipe(recipe.recipeId, (current) => ({
                  ...current,
                  recommendedParameters: {
                    ...current.recommendedParameters,
                    cfg: optionalNumber(event.target.value)
                  }
                }))
              } /></label>
              <label>采样器<input value={recipe.recommendedParameters.sampler ?? ''} onChange={(event) =>
                updateRecipe(recipe.recipeId, (current) => ({
                  ...current,
                  recommendedParameters: {
                    ...current.recommendedParameters,
                    sampler: optionalText(event.target.value)
                  }
                }))
              } /></label>
              <label>调度器<input value={recipe.recommendedParameters.scheduler ?? ''} onChange={(event) =>
                updateRecipe(recipe.recipeId, (current) => ({
                  ...current,
                  recommendedParameters: {
                    ...current.recommendedParameters,
                    scheduler: optionalText(event.target.value)
                  }
                }))
              } /></label>
            </div>
          </fieldset>
          {recipe.assetSlots.map((slot) => (
            <fieldset key={slot.slotId}><legend>{slot.label} · {slot.kind === 'checkpoint' ? 'Checkpoint' : 'LoRA'}</legend>
              <div className="settings-grid two-column">
                <label>逻辑槽位 ID<input value={slot.slotId} readOnly /></label>
                <label>资产类型<select value={slot.kind} onChange={(event) => {
                  const kind = event.target.value as ComfyStyleRecipeAssetSlot['kind'];
                  updateAssetSlot(recipe.recipeId, slot.slotId, (current) => ({
                    ...current,
                    kind,
                    recommendedModelStrength: kind === 'lora'
                      ? current.recommendedModelStrength ?? 0.6
                      : undefined,
                    recommendedClipStrength: kind === 'lora'
                      ? current.recommendedClipStrength ?? 0.6
                      : undefined
                  }));
                }}><option value="checkpoint">Checkpoint</option><option value="lora">LoRA</option></select></label>
                <label>显示名称<input value={slot.label} onChange={(event) =>
                  updateAssetSlot(recipe.recipeId, slot.slotId, (current) => ({
                    ...current,
                    label: event.target.value
                  }))
                } /></label>
                <label><input type="checkbox" checked={slot.required} onChange={(event) =>
                  updateAssetSlot(recipe.recipeId, slot.slotId, (current) => ({
                    ...current,
                    required: event.target.checked
                  }))
                } />必需资产</label>
              </div>
              <label>说明<textarea rows={2} value={slot.description} onChange={(event) =>
                updateAssetSlot(recipe.recipeId, slot.slotId, (current) => ({
                  ...current,
                  description: event.target.value
                }))
              } /></label>
              <label>示例文件名（每行一个）<textarea rows={2} value={slot.filenameHints.join('\n')} onChange={(event) =>
                updateAssetSlot(recipe.recipeId, slot.slotId, (current) => ({
                  ...current,
                  filenameHints: event.target.value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
                }))
              } /></label>
              {slot.kind === 'lora' ? <div className="settings-grid two-column">
                <label>推荐 Model strength<input type="number" step={0.01} value={slot.recommendedModelStrength ?? ''} onChange={(event) =>
                  updateAssetSlot(recipe.recipeId, slot.slotId, (current) => ({
                    ...current,
                    recommendedModelStrength: optionalNumber(event.target.value)
                  }))
                } /></label>
                <label>推荐 CLIP strength<input type="number" step={0.01} value={slot.recommendedClipStrength ?? ''} onChange={(event) =>
                  updateAssetSlot(recipe.recipeId, slot.slotId, (current) => ({
                    ...current,
                    recommendedClipStrength: optionalNumber(event.target.value)
                  }))
                } /></label>
                <label>触发词说明<input value={slot.triggerWords ?? ''} onChange={(event) =>
                  updateAssetSlot(recipe.recipeId, slot.slotId, (current) => ({
                    ...current,
                    triggerWords: optionalText(event.target.value)
                  }))
                } /></label>
              </div> : null}
              {recipe.assetSlots.length > 1 ? <button type="button" onClick={() =>
                updateRecipe(recipe.recipeId, (current) => ({
                  ...current,
                  assetSlots: current.assetSlots.filter((item) => item.slotId !== slot.slotId)
                }))
              }>删除此资产槽位</button> : null}
            </fieldset>
          ))}
          <div className="image-profile-save-actions">
            <button type="button" onClick={() =>
              updateRecipe(recipe.recipeId, (current) => ({
                ...current,
                assetSlots: [...current.assetSlots, customSlot('checkpoint')]
              }))
            }>新增 Checkpoint 槽位</button>
            <button type="button" onClick={() =>
              updateRecipe(recipe.recipeId, (current) => ({
                ...current,
                assetSlots: [...current.assetSlots, customSlot('lora')]
              }))
            }>新增 LoRA 槽位</button>
          </div>
          <div className="image-profile-save-actions">
            <button type="button" disabled={index === 0} onClick={() => moveRecipe(recipe.recipeId, -1)}>上移</button>
            <button type="button" disabled={index === recipes.length - 1} onClick={() => moveRecipe(recipe.recipeId, 1)}>下移</button>
            <button type="button" onClick={() => {
              const copy = duplicateComfyStyleRecipe(recipe);
              onChange(
                normalizeComfyStyleRecipeOrder([...recipes, copy]),
                `已复制“${recipe.name}”为自定义 ComfyUI 配方；点击保存后才会生效。`
              );
            }}>复制为自定义</button>
            {recipe.origin === 'built-in' ? <button type="button" onClick={() =>
              onChange(
                restoreBuiltInComfyStyleRecipe(recipes, recipe.recipeId),
                `已在编辑区恢复“${recipe.name}”内置配方；点击保存后才会生效。`
              )
            }>恢复内置内容</button> : <button type="button" onClick={() =>
              onChange(
                normalizeComfyStyleRecipeOrder(recipes.filter((item) => item.recipeId !== recipe.recipeId)),
                `已从编辑区删除“${recipe.name}”；点击保存后才会生效。`
              )
            }>删除自定义配方</button>}
          </div>
        </details>
      ))}
    </>
  );
}
