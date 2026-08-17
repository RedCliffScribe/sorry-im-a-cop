import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS,
  BUILT_IN_IMAGE_STYLE_PRESETS,
  NOVELAI_CALIBRATED_IMAGE_STYLE_PRESET_IDS,
  createCustomImagePromptDialectPreset,
  createCustomImageStylePreset,
  duplicateImagePromptDialectPreset,
  duplicateImageStylePreset,
  normalizePresetOrder,
  resolveSelectedImageStyleModifiers,
  resolveDefaultImagePromptDialectPresetId,
  restoreBuiltInImagePromptDialectPreset,
  restoreBuiltInImageStylePreset
} from './promptPresetLibrary';

describe('image prompt preset library', () => {
  it('ships sixteen visible prompt styles, including one NovelAI calibrated direction, and ten model dialects', () => {
    expect(BUILT_IN_IMAGE_STYLE_PRESETS.map((preset) => preset.name)).toEqual([
      '1980 年代港产写实插画',
      '写实电影剧照',
      '视觉小说厚涂',
      '日系动画赛璐璐',
      'NAI 推荐·日漫写实',
      '经典港漫彩墨',
      '黑色电影／图像小说',
      'AsianBlend 半写实方向（提示词）',
      'Duchaiten 半油画方向（提示词）',
      'Duchaiten 雨夜方向（提示词）',
      'Rin SoftSketch 柔绘方向（提示词）',
      'WAI 成熟日漫方向（提示词）',
      '北条司都市漫画方向（提示词）',
      '织田 non 成熟绘风方向（提示词）',
      '十六夜清心柔绘方向（提示词）',
      'NAI·织田 non × 十六夜清心·轻写实'
    ]);
    expect(BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.map((preset) => preset.family)).toEqual([
      'general-english-natural',
      'openai-gpt-image',
      'gemini-image',
      'chinese-natural',
      'generic-english-tags',
      'sd-sdxl',
      'pony',
      'illustrious',
      'novelai',
      'flux'
    ]);
  });

  it('ships the Oda Non and Izayoi Seishin direction as one NovelAI light-realism preset', () => {
    const combinedStyle = BUILT_IN_IMAGE_STYLE_PRESETS.filter(
      (preset) =>
        preset.stylePresetId ===
        NOVELAI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.odaNonIzayoiSeishinLightRealism
    );

    expect(combinedStyle).toHaveLength(1);
    expect(combinedStyle[0]?.name).toContain('织田 non × 十六夜清心');
    expect(combinedStyle[0]?.description).toContain('一套');
    expect(combinedStyle[0]?.description).toContain('NovelAI V4/V4.5');
    expect(combinedStyle[0]?.modifiers.global.positive).toContain('优雅流畅而细腻的轮廓线');
    expect(combinedStyle[0]?.modifiers.global.positive).toContain('自然比例双眼');
    expect(combinedStyle[0]?.modifiers.character.positive).toContain('柔和绘画渐变');
    expect(combinedStyle[0]?.modifiers.global.positive).toContain('不转成真人照片');
    expect(combinedStyle[0]?.modifiers.character.positive).toContain(
      '保持输入中的身份、年龄、当前装扮'
    );
    expect(combinedStyle[0]?.modifiers.global.negative).toContain('照片级写实');
  });

  it('keeps every calibrated direction visible without pretending prompt presets load local models', () => {
    const comfyStyles = BUILT_IN_IMAGE_STYLE_PRESETS.filter(
      (preset) => preset.stylePresetId.startsWith('builtin-style-comfy-')
    );
    expect(comfyStyles).toHaveLength(8);
    expect(comfyStyles.every((preset) => !preset.hidden)).toBe(true);

    const hojo = comfyStyles.find((preset) => preset.name.includes('北条司'));
    expect(hojo?.description).toContain('仅提供');
    expect(hojo?.description).toContain('不保证复现');

    const odaNon = comfyStyles.find((preset) => preset.name.includes('织田 non'));
    expect(odaNon?.description).toContain('不会加载画风 LoRA');
    expect(odaNon?.modifiers.character.positive).toContain('保持输入中的身份、年龄、当前装扮');
    expect(odaNon?.modifiers.character.negative).toContain('无依据增加裸露');

    const izayoi = comfyStyles.find((preset) => preset.name.includes('十六夜清心'));
    expect(izayoi?.description).toContain('不会加载画风 LoRA');
    expect(izayoi?.modifiers.character.positive).toContain('当前装扮');

    const duchaitenScene = comfyStyles.find((preset) => preset.name.includes('雨夜方向'));
    expect(duchaitenScene?.modifiers.narrativeScene.positive).toContain('环境主导的宽幅剧情镜头');
    expect(duchaitenScene?.modifiers.narrativeScene.negative).toContain('只靠提示词不能保证精确人数');
  });

  it('uses a GPT-friendly natural-language default matching the built-in 1980s art direction', () => {
    const style = BUILT_IN_IMAGE_STYLE_PRESETS[0]!;
    expect(style.stylePresetId).toBe('builtin-style-hong-kong-crime-realism');
    expect(style.description).toContain('半油画质感');
    expect(style.modifiers.global.positive).toContain('1980 年代写实叙事插画');
    expect(style.modifiers.global.positive).toContain('布料、皮革、金属和旧衣物');
    expect(style.modifiers.global.positive).toContain('旧胶片气质');
    expect(style.modifiers.character.positive).toContain('只表示人物刻画与手绘完成度');
    expect(style.modifiers.character.negative).toContain('标题文字、边框、拼贴或宣传版式');

    const dialect = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (preset) => preset.family === 'openai-gpt-image'
    )!;
    expect(dialect.description).toContain('OpenAI Images');
    expect(dialect.renderingInstruction).toContain('使用完整短句');
    expect(dialect.renderingInstruction).toContain('不要虚构图中文字');
    expect(dialect.positiveSuffix).toContain('Do not add captions');
  });

  it('creates and duplicates unlimited custom entries without mutating the source', () => {
    const style = createCustomImageStylePreset('玩家风格', 'custom-style:test');
    style.modifiers.global.positive = 'player style';
    const styleCopy = duplicateImageStylePreset(style, 'custom-style:copy');
    expect(styleCopy).toMatchObject({ origin: 'custom', name: '玩家风格 副本' });
    expect(styleCopy.modifiers.global.positive).toBe('player style');
    styleCopy.modifiers.global.positive = 'changed';
    expect(style.modifiers.global.positive).toBe('player style');

    const dialect = createCustomImagePromptDialectPreset('玩家格式', 'custom-dialect:test');
    const dialectCopy = duplicateImagePromptDialectPreset(dialect, 'custom-dialect:copy');
    expect(dialectCopy).toMatchObject({ origin: 'custom', name: '玩家格式 副本' });
  });

  it('restores edited built-ins and normalizes player-defined ordering', () => {
    const styles = structuredClone(BUILT_IN_IMAGE_STYLE_PRESETS).map((preset, index) => ({
      ...preset,
      order: index + 10
    }));
    styles[0].name = '已修改';
    expect(restoreBuiltInImageStylePreset(styles, styles[0].stylePresetId)[0].name)
      .toBe('1980 年代港产写实插画');

    const dialects = structuredClone(BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS);
    dialects[0].positivePrefix = 'edited';
    expect(restoreBuiltInImagePromptDialectPreset(dialects, dialects[0].dialectPresetId)[0].positivePrefix)
      .toBe('');
    expect(normalizePresetOrder([
      { id: 'b', order: 5 },
      { id: 'a', order: 2 }
    ])).toEqual([
      { id: 'a', order: 0 },
      { id: 'b', order: 1 }
    ]);
  });

  it('uses provider-aware defaults while leaving ComfyUI selectable per workflow preset', () => {
    expect(resolveDefaultImagePromptDialectPresetId('openai-images'))
      .toBe('builtin-dialect-openai-gpt-image');
    expect(resolveDefaultImagePromptDialectPresetId('gemini-image'))
      .toBe('builtin-dialect-gemini-image');
    expect(resolveDefaultImagePromptDialectPresetId('openai-images', 'nai-diffusion-4-5-curated'))
      .toBe('builtin-dialect-novelai');
    expect(resolveDefaultImagePromptDialectPresetId('novelai-image')).toBe('builtin-dialect-novelai');
    expect(resolveDefaultImagePromptDialectPresetId('sd-webui')).toBe('builtin-dialect-sd-sdxl');
    expect(resolveDefaultImagePromptDialectPresetId('alibaba-model-studio')).toBe('builtin-dialect-general-zh');
    expect(resolveDefaultImagePromptDialectPresetId('comfyui-workflow')).toBe('builtin-dialect-generic-en-tags');
    expect(resolveDefaultImagePromptDialectPresetId(
      'comfyui-workflow',
      'asianBlendIllustrious_v10.safetensors'
    )).toBe('builtin-dialect-illustrious');
    expect(resolveDefaultImagePromptDialectPresetId('comfyui-workflow', 'my_pony_checkpoint.safetensors'))
      .toBe('builtin-dialect-pony');
    expect(resolveDefaultImagePromptDialectPresetId('comfyui-workflow', 'flux-dev-fp8.safetensors'))
      .toBe('builtin-dialect-flux');
    expect(resolveDefaultImagePromptDialectPresetId('comfyui-workflow', 'sdxl-base-1.0.safetensors'))
      .toBe('builtin-dialect-sd-sdxl');
    expect(resolveDefaultImagePromptDialectPresetId('sd-webui', 'wai-NSFW-illustrious-v14.safetensors'))
      .toBe('builtin-dialect-illustrious');
  });

  it('keeps NovelAI syntax separate from the player-selected media style', () => {
    const dialect = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (preset) => preset.dialectPresetId === 'builtin-dialect-novelai'
    );
    expect(dialect?.description).toContain('不替玩家改变');
    expect(dialect?.renderingInstruction).toContain('不得把写实插画');
    expect(dialect?.renderingInstruction).toContain('1boy、1girl 或 1other');
    expect(dialect?.renderingInstruction).toContain('紧接 solo');
    expect(dialect?.renderingInstruction).toContain('最终使用 | 与基础段分隔');
    expect(dialect?.renderingInstruction).toContain('source#、target# 或 mutual#');
    expect(dialect?.renderingInstruction).toContain('正向和负向内容必须保持分离');
    expect(dialect?.renderingInstruction).toContain('persistent-requirement');
    expect(dialect?.renderingInstruction).toContain('不得用 cowboy');
    expect(dialect?.renderingInstruction).toContain('anime screencap, official art, year 2008');
    expect(dialect?.renderingInstruction).toContain('仅在输入确实要求更强写实度时加入 realistic');
    expect(dialect?.renderingInstruction).toContain('不得在转换阶段无条件混用 masterpiece');
    expect(dialect?.negativePrefix).not.toContain('photorealistic');
    expect(dialect?.negativePrefix).not.toContain('realistic');
    expect(dialect?.negativePrefix).toContain('bad anatomy');
    expect(dialect?.negativePrefix).not.toContain('cropped');
    const animeStyle = BUILT_IN_IMAGE_STYLE_PRESETS.find(
      (preset) => preset.stylePresetId === 'builtin-style-hong-kong-mature-crime-anime'
    );
    expect(animeStyle?.name).toBe('NAI 推荐·日漫写实');
    expect(animeStyle?.description).toContain('NovelAI V4/V4.5');
    expect(animeStyle?.modifiers.global.positive).toContain('2008 年前后的成熟日漫');
    expect(animeStyle?.modifiers.global.negative).toContain('照片级写实');
  });

  it('keeps GPT Image and Gemini prompt structures independently editable', () => {
    const openAi = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (preset) => preset.family === 'openai-gpt-image'
    )!;
    const gemini = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (preset) => preset.family === 'gemini-image'
    )!;

    expect(openAi.positivePrefix).toContain('production-ready game narrative illustration');
    expect(openAi.renderingInstruction).toContain('场景或背景、主体、关键外观与当前装扮');
    expect(openAi.renderingInstruction).toContain('realistic hand-painted narrative illustration');
    expect(gemini.positivePrefix).toContain('subject, context, and style brief');
    expect(gemini.renderingInstruction).toContain('主体、环境与背景');
    expect(gemini.renderingInstruction).toContain('请求的目标始终是一张图片');
    expect(openAi.renderingInstruction).not.toBe(gemini.renderingInstruction);
  });

  it('preserves traditional-media art direction in the Illustrious format without inventing model add-ons', () => {
    const dialect = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (preset) => preset.dialectPresetId === 'builtin-dialect-illustrious'
    );
    expect(dialect?.renderingInstruction).toContain('传统绘画媒介');
    expect(dialect?.renderingInstruction).toContain('traditional media');
    expect(dialect?.renderingInstruction).toContain('restrained visible oil brushwork');
    expect(dialect?.renderingInstruction).toContain('半油画');
    expect(dialect?.renderingInstruction).toContain('不得弱化或改写成 photo');
    expect(dialect?.renderingInstruction).toContain('不要添加未知作品、角色、画师、LoRA、权重或模型名');
  });

  it('resolves the selected style into visible global and purpose-specific semantic layers', () => {
    const resolved = resolveSelectedImageStyleModifiers(
      BUILT_IN_IMAGE_STYLE_PRESETS,
      {
        globalStylePresetId: 'builtin-style-hong-kong-crime-realism',
        characterStyleMode: 'inherit-global',
        narrativeSceneStyleMode: 'inherit-global'
      },
      'character'
    );
    expect(resolved).toHaveLength(2);
    expect(resolved[0].positive).toContain('半油画笔触');
    expect(resolved[1].positive).toContain('核心人物');
  });

  it('lets a dedicated style explicitly inherit from or replace the global style', () => {
    const inherited = resolveSelectedImageStyleModifiers(
      BUILT_IN_IMAGE_STYLE_PRESETS,
      {
        globalStylePresetId: 'builtin-style-hong-kong-crime-realism',
        characterStylePresetId: 'builtin-style-hong-kong-mature-crime-anime',
        characterStyleMode: 'inherit-global',
        narrativeSceneStyleMode: 'inherit-global'
      },
      'character'
    );
    expect(inherited).toHaveLength(4);
    expect(inherited.some((entry) => entry.positive.includes('半油画笔触'))).toBe(true);
    expect(inherited.some((entry) => entry.positive.includes('成熟日漫写实角色图'))).toBe(true);

    const replaced = resolveSelectedImageStyleModifiers(
      BUILT_IN_IMAGE_STYLE_PRESETS,
      {
        globalStylePresetId: 'builtin-style-hong-kong-crime-realism',
        characterStylePresetId: 'builtin-style-hong-kong-mature-crime-anime',
        characterStyleMode: 'replace-global',
        narrativeSceneStyleMode: 'inherit-global'
      },
      'character'
    );
    expect(replaced).toHaveLength(2);
    expect(replaced.some((entry) => entry.positive.includes('半油画笔触'))).toBe(false);
    expect(replaced[0].positive).toContain('2008 年前后的成熟日漫');
    expect(replaced[1].positive).toContain('成熟日漫写实角色图');
  });
});
