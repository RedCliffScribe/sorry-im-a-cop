import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  IndexedDbImagePromptTemplateRepository,
  createEmptyImagePromptTemplateSettings,
  parseImagePromptTemplateImport,
  serializeImagePromptTemplateSettings
} from './ImagePromptTemplateRepository';
import {
  GEMINI_IMAGE_PROMPT_DIALECT_PRESET_ID,
  LEGACY_DEFAULT_IMAGE_PROMPT_DIALECT_V1,
  LEGACY_DEFAULT_IMAGE_STYLE_PRESET_V1,
  LEGACY_ILLUSTRIOUS_IMAGE_PROMPT_DIALECT_V1,
  LEGACY_NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_V1,
  LEGACY_NOVELAI_IMAGE_PROMPT_DIALECT_V1,
  NOVELAI_CALIBRATED_IMAGE_STYLE_PRESET_IDS,
  OPENAI_GPT_IMAGE_PROMPT_DIALECT_PRESET_ID
} from './promptPresetLibrary';
import {
  DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS,
  LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V1,
  LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V2,
  LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V4,
  LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V5
} from './prompts';
import { DEFAULT_IMAGE_PROMPT_MODIFIERS } from './types';

async function putRawSettings(dbName: string, value: unknown): Promise<void> {
  const openRequest = indexedDB.open(dbName, 1);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    openRequest.onupgradeneeded = () => {
      openRequest.result.createObjectStore('settings', { keyPath: 'settingsId' });
    };
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('settings', 'readwrite');
    transaction.objectStore('settings').put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

describe('IndexedDbImagePromptTemplateRepository', () => {
  it('starts with editable built-in modifiers and safe conversion defaults, and persists player edits', async () => {
    const repository = new IndexedDbImagePromptTemplateRepository(`prompt-templates-${crypto.randomUUID()}`);
    const initial = await repository.load();
    expect(initial.modifiers).toEqual(DEFAULT_IMAGE_PROMPT_MODIFIERS);
    expect(initial.modifierDefaultsState).toBe('built-in');
    expect(initial.conversionCapabilities.imageInputEnabled).toBe(false);
    expect(initial.conversionInstructions).toEqual(DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS);

    const next = createEmptyImagePromptTemplateSettings('2026-07-23T02:00:00.000Z');
    next.revision = 2;
    next.modifiers.global.positive = 'cinematic Hong Kong crime drama';
    next.modifiers.characterViews['half-body-medium'].negative = 'cropped hands';
    next.conversionCapabilities.imageInputEnabled = true;
    next.conversionInstructions['turn-scene-plan'] = '玩家自定义场景规划指令';
    await repository.save(next);

    await expect(repository.load()).resolves.toMatchObject({
      revision: 2,
      conversionCapabilities: { imageInputEnabled: true },
      conversionInstructions: { 'turn-scene-plan': '玩家自定义场景规划指令' },
      modifiers: {
        global: { positive: 'cinematic Hong Kong crime drama', negative: '' },
        characterViews: { 'half-body-medium': { positive: '', negative: 'cropped hands' } }
      }
    });
    await repository.clearAll();
    const reset = await repository.load();
    expect(reset).toMatchObject({
      revision: 1,
      modifiers: DEFAULT_IMAGE_PROMPT_MODIFIERS,
      modifierDefaultsState: 'built-in'
    });
  });

  it('adds newly shipped NovelAI built-in styles to existing player settings without replacing edits', async () => {
    const dbName = `prompt-templates-new-style-${crypto.randomUUID()}`;
    const existing = createEmptyImagePromptTemplateSettings('2026-07-29T02:00:00.000Z');
    const omittedStyleIds = new Set<string>([
      NOVELAI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.odaNonIzayoiSeishinLightRealism
    ]);
    existing.stylePresets = existing.stylePresets.filter(
      (preset) => !omittedStyleIds.has(preset.stylePresetId)
    );
    existing.stylePresets[0].name = '玩家保留的风格名称';
    existing.stylePresets.forEach((preset, order) => {
      preset.order = order;
    });
    await putRawSettings(dbName, existing);

    const upgraded = await new IndexedDbImagePromptTemplateRepository(dbName).load();

    expect(upgraded.stylePresets[0].name).toBe('玩家保留的风格名称');
    expect(upgraded.stylePresets.at(-1)).toMatchObject({
      stylePresetId:
        NOVELAI_CALIBRATED_IMAGE_STYLE_PRESET_IDS.odaNonIzayoiSeishinLightRealism,
      name: 'NAI·织田 non × 十六夜清心·轻写实',
      origin: 'built-in'
    });
  });

  it('upgrades untouched legacy defaults without overwriting player-edited style or dialect fields', async () => {
    const legacyDbName = `prompt-templates-style-upgrade-${crypto.randomUUID()}`;
    const legacy = createEmptyImagePromptTemplateSettings('2026-07-24T05:00:00.000Z');
    legacy.stylePresets[legacy.stylePresets.findIndex(
      (preset) => preset.stylePresetId === LEGACY_DEFAULT_IMAGE_STYLE_PRESET_V1.stylePresetId
    )] = structuredClone(LEGACY_DEFAULT_IMAGE_STYLE_PRESET_V1);
    legacy.stylePresets[legacy.stylePresets.findIndex(
      (preset) => preset.stylePresetId === LEGACY_NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_V1.stylePresetId
    )] = structuredClone(LEGACY_NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_V1);
    legacy.dialectPresets[legacy.dialectPresets.findIndex(
      (preset) => preset.dialectPresetId === LEGACY_DEFAULT_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    )] = structuredClone(LEGACY_DEFAULT_IMAGE_PROMPT_DIALECT_V1);
    legacy.dialectPresets[legacy.dialectPresets.findIndex(
      (preset) => preset.dialectPresetId === LEGACY_ILLUSTRIOUS_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    )] = structuredClone(LEGACY_ILLUSTRIOUS_IMAGE_PROMPT_DIALECT_V1);
    legacy.dialectPresets[legacy.dialectPresets.findIndex(
      (preset) => preset.dialectPresetId === LEGACY_NOVELAI_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    )] = structuredClone(LEGACY_NOVELAI_IMAGE_PROMPT_DIALECT_V1);
    await putRawSettings(legacyDbName, legacy);

    const upgraded = await new IndexedDbImagePromptTemplateRepository(legacyDbName).load();
    const upgradedDefaultStyle = upgraded.stylePresets.find(
      (preset) => preset.stylePresetId === LEGACY_DEFAULT_IMAGE_STYLE_PRESET_V1.stylePresetId
    )!;
    const upgradedNovelAiStyle = upgraded.stylePresets.find(
      (preset) => preset.stylePresetId === LEGACY_NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_V1.stylePresetId
    )!;
    const upgradedGeneralDialect = upgraded.dialectPresets.find(
      (preset) => preset.dialectPresetId === LEGACY_DEFAULT_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    )!;
    const upgradedIllustriousDialect = upgraded.dialectPresets.find(
      (preset) => preset.dialectPresetId === LEGACY_ILLUSTRIOUS_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    )!;
    const upgradedNovelAiDialect = upgraded.dialectPresets.find(
      (preset) => preset.dialectPresetId === LEGACY_NOVELAI_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    )!;
    expect(upgradedDefaultStyle.name).toBe('1980 年代港产写实插画');
    expect(upgradedDefaultStyle.modifiers.global.positive).toContain('半油画笔触');
    expect(upgradedNovelAiStyle.name).toBe('NAI 推荐·日漫写实');
    expect(upgradedNovelAiStyle.modifiers.global.positive).toContain('2008 年前后的成熟日漫');
    expect(upgradedGeneralDialect.description).toContain('没有专用渲染方案');
    expect(upgradedGeneralDialect.renderingInstruction).toContain('完整短句而不是逗号标签');
    expect(upgradedIllustriousDialect.description).toContain('ComfyUI checkpoint');
    expect(upgradedIllustriousDialect.renderingInstruction).toContain('不得弱化或改写成 photo');
    expect(upgradedNovelAiDialect.description).toContain('不替玩家改变');
    expect(upgradedNovelAiDialect.negativePrefix).not.toContain('photorealistic');
    expect(upgraded.dialectPresets.find(
      (preset) => preset.dialectPresetId === OPENAI_GPT_IMAGE_PROMPT_DIALECT_PRESET_ID
    )?.name).toBe('OpenAI GPT Image 推荐');
    expect(upgraded.dialectPresets.find(
      (preset) => preset.dialectPresetId === GEMINI_IMAGE_PROMPT_DIALECT_PRESET_ID
    )?.name).toBe('Gemini 原生图片推荐');

    const editedDbName = `prompt-templates-style-edited-${crypto.randomUUID()}`;
    const edited = createEmptyImagePromptTemplateSettings('2026-07-24T05:05:00.000Z');
    const editedDefaultStyleIndex = edited.stylePresets.findIndex(
      (preset) => preset.stylePresetId === LEGACY_DEFAULT_IMAGE_STYLE_PRESET_V1.stylePresetId
    );
    const editedNovelAiStyleIndex = edited.stylePresets.findIndex(
      (preset) => preset.stylePresetId === LEGACY_NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_V1.stylePresetId
    );
    const editedGeneralDialectIndex = edited.dialectPresets.findIndex(
      (preset) => preset.dialectPresetId === LEGACY_DEFAULT_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    );
    const editedIllustriousDialectIndex = edited.dialectPresets.findIndex(
      (preset) => preset.dialectPresetId === LEGACY_ILLUSTRIOUS_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    );
    const editedNovelAiDialectIndex = edited.dialectPresets.findIndex(
      (preset) => preset.dialectPresetId === LEGACY_NOVELAI_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    );
    edited.stylePresets[editedDefaultStyleIndex] = structuredClone(LEGACY_DEFAULT_IMAGE_STYLE_PRESET_V1);
    edited.stylePresets[editedDefaultStyleIndex].modifiers.global.positive = '玩家保留的自定义画风';
    edited.stylePresets[editedNovelAiStyleIndex] = structuredClone(LEGACY_NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_V1);
    edited.stylePresets[editedNovelAiStyleIndex].modifiers.global.positive = '玩家保留的 NAI 自定义画风';
    edited.dialectPresets[editedGeneralDialectIndex] = structuredClone(LEGACY_DEFAULT_IMAGE_PROMPT_DIALECT_V1);
    edited.dialectPresets[editedGeneralDialectIndex].renderingInstruction = '玩家保留的模型格式指令';
    edited.dialectPresets[editedIllustriousDialectIndex] = structuredClone(LEGACY_ILLUSTRIOUS_IMAGE_PROMPT_DIALECT_V1);
    edited.dialectPresets[editedIllustriousDialectIndex].positivePrefix = '玩家保留的 Illustrious 前缀';
    edited.dialectPresets[editedNovelAiDialectIndex] = structuredClone(LEGACY_NOVELAI_IMAGE_PROMPT_DIALECT_V1);
    edited.dialectPresets[editedNovelAiDialectIndex].renderingInstruction = '玩家保留的 NAI 模型转换指令';
    await putRawSettings(editedDbName, edited);

    const preserved = await new IndexedDbImagePromptTemplateRepository(editedDbName).load();
    const preservedDefaultStyle = preserved.stylePresets.find(
      (preset) => preset.stylePresetId === LEGACY_DEFAULT_IMAGE_STYLE_PRESET_V1.stylePresetId
    )!;
    const preservedNovelAiStyle = preserved.stylePresets.find(
      (preset) => preset.stylePresetId === LEGACY_NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_V1.stylePresetId
    )!;
    const preservedGeneralDialect = preserved.dialectPresets.find(
      (preset) => preset.dialectPresetId === LEGACY_DEFAULT_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    )!;
    const preservedIllustriousDialect = preserved.dialectPresets.find(
      (preset) => preset.dialectPresetId === LEGACY_ILLUSTRIOUS_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    )!;
    const preservedNovelAiDialect = preserved.dialectPresets.find(
      (preset) => preset.dialectPresetId === LEGACY_NOVELAI_IMAGE_PROMPT_DIALECT_V1.dialectPresetId
    )!;
    expect(preservedDefaultStyle.modifiers.global.positive).toBe('玩家保留的自定义画风');
    expect(preservedDefaultStyle.name).toBe('港产警匪写实插画');
    expect(preservedNovelAiStyle.modifiers.global.positive).toBe('玩家保留的 NAI 自定义画风');
    expect(preservedNovelAiStyle.name).toBe('1980 年代港产成熟犯罪动画');
    expect(preservedGeneralDialect.renderingInstruction).toBe('玩家保留的模型格式指令');
    expect(preservedGeneralDialect.description).toBe('适合支持完整自然语言描述的通用图片模型。');
    expect(preservedIllustriousDialect.positivePrefix).toBe('玩家保留的 Illustrious 前缀');
    expect(preservedIllustriousDialect.description).toBe('兼顾自然语言与可识别标签的 Illustrious 系格式。');
    expect(preservedNovelAiDialect.renderingInstruction).toBe('玩家保留的 NAI 模型转换指令');
    expect(preservedNovelAiDialect.negativePrefix).toBe('');
    expect(preserved.dialectPresets.some(
      (preset) => preset.dialectPresetId === OPENAI_GPT_IMAGE_PROMPT_DIALECT_PRESET_ID
    )).toBe(true);
    expect(preserved.dialectPresets.some(
      (preset) => preset.dialectPresetId === GEMINI_IMAGE_PROMPT_DIALECT_PRESET_ID
    )).toBe(true);
  });

  it('upgrades only untouched character, scene and provider conversion instructions', async () => {
    const dbName = `prompt-templates-instruction-upgrade-${crypto.randomUUID()}`;
    const legacy = createEmptyImagePromptTemplateSettings('2026-07-24T05:10:00.000Z');
    legacy.conversionInstructions['scene-shot-prompt'] =
      LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V1['scene-shot-prompt'];
    legacy.conversionInstructions['provider-prompt-render'] =
      LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V1['provider-prompt-render'];
    await putRawSettings(dbName, legacy);

    const upgraded = await new IndexedDbImagePromptTemplateRepository(dbName).load();
    expect(upgraded.conversionInstructions['scene-shot-prompt']).toContain('不得在这两个字段中新增、推荐或排除插画');
    expect(upgraded.conversionInstructions['provider-prompt-render']).toContain('不得译为 police informant');

    const secondLegacyDbName = `prompt-templates-instruction-v2-upgrade-${crypto.randomUUID()}`;
    const secondLegacy = createEmptyImagePromptTemplateSettings('2026-07-24T05:11:00.000Z');
    secondLegacy.conversionInstructions['provider-prompt-render'] =
      LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V2['provider-prompt-render'];
    await putRawSettings(secondLegacyDbName, secondLegacy);
    const secondUpgraded = await new IndexedDbImagePromptTemplateRepository(secondLegacyDbName).load();
    expect(secondUpgraded.conversionInstructions['provider-prompt-render'])
      .toContain('只负责把每段内容转换成当前模型族易识别的语法');

    const fourthLegacyDbName = `prompt-templates-instruction-v4-upgrade-${crypto.randomUUID()}`;
    const fourthLegacy = createEmptyImagePromptTemplateSettings('2026-07-24T05:12:00.000Z');
    fourthLegacy.conversionInstructions['scene-shot-prompt'] =
      LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V4['scene-shot-prompt'];
    await putRawSettings(fourthLegacyDbName, fourthLegacy);
    const fourthUpgraded = await new IndexedDbImagePromptTemplateRepository(fourthLegacyDbName).load();
    expect(fourthUpgraded.conversionInstructions['scene-shot-prompt'])
      .toContain('appearanceSource 必须为 scene-specific-override');

    const fifthLegacyDbName = `prompt-templates-instruction-v5-upgrade-${crypto.randomUUID()}`;
    const fifthLegacy = createEmptyImagePromptTemplateSettings('2026-07-24T05:13:00.000Z');
    fifthLegacy.conversionInstructions['character-view-batch'] =
      LEGACY_PROMPT_CONVERSION_INSTRUCTIONS_V5['character-view-batch'];
    await putRawSettings(fifthLegacyDbName, fifthLegacy);
    const fifthUpgraded = await new IndexedDbImagePromptTemplateRepository(fifthLegacyDbName).load();
    expect(fifthUpgraded.conversionInstructions['character-view-batch'])
      .toContain('appearanceSource 必须为 additional-requirement-override');

    const editedDbName = `prompt-templates-instruction-edited-${crypto.randomUUID()}`;
    const edited = structuredClone(legacy);
    edited.conversionInstructions['scene-shot-prompt'] = '玩家保留的场景镜头转换指令';
    await putRawSettings(editedDbName, edited);

    const preserved = await new IndexedDbImagePromptTemplateRepository(editedDbName).load();
    expect(preserved.conversionInstructions['scene-shot-prompt']).toBe('玩家保留的场景镜头转换指令');
    expect(preserved.conversionInstructions['provider-prompt-render']).toContain('不得译为 police informant');
  });

  it('loads settings saved before conversion instructions existed with current safe defaults', async () => {
    const dbName = `prompt-templates-legacy-${crypto.randomUUID()}`;
    const legacy = createEmptyImagePromptTemplateSettings('2026-07-23T02:00:00.000Z');
    const {
      conversionInstructions: _conversionInstructions,
      comfyStyleRecipes: _comfyStyleRecipes,
      modifierDefaultsState: _modifierDefaultsState,
      ...legacyValue
    } = legacy;
    const legacyViews = legacyValue.modifiers.characterViews as Record<string, { positive: string; negative: string }>;
    legacyViews['cowboy-medium-full'] = legacyViews['knee-up-medium-full'];
    delete legacyViews['knee-up-medium-full'];
    const legacyStyleSelection = legacyValue.styleSelection as unknown as Record<string, unknown>;
    delete legacyStyleSelection.characterStyleMode;
    delete legacyStyleSelection.narrativeSceneStyleMode;
    await putRawSettings(dbName, legacyValue);

    const repository = new IndexedDbImagePromptTemplateRepository(dbName);
    const loaded = await repository.load();
    expect(loaded.conversionInstructions).toEqual(DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS);
    expect(loaded.modifierDefaultsState).toBe('legacy-preserved');
    expect(loaded.modifiers.characterViews['knee-up-medium-full']).toEqual({ positive: '', negative: '' });
    expect(loaded.styleSelection.characterStyleMode).toBe('inherit-global');
    expect(loaded.styleSelection.narrativeSceneStyleMode).toBe('inherit-global');
    expect(loaded.comfyStyleRecipes).toHaveLength(8);
    expect(loaded.revision).toBe(1);
  });

  it('round-trips a portable template file without exporting local identity fields', () => {
    const source = createEmptyImagePromptTemplateSettings('2026-07-23T03:00:00.000Z');
    source.revision = 8;
    source.modifiers.global.positive = 'cinematic noir';
    source.conversionInstructions['scene-shot-prompt'] = '自定义场景镜头转换';
    source.conversionCapabilities.imageInputEnabled = true;
    source.styleSelection.characterStylePresetId = 'builtin-style-hong-kong-mature-crime-anime';
    source.styleSelection.characterStyleMode = 'replace-global';

    const rawJson = serializeImagePromptTemplateSettings(source, '2026-07-23T04:00:00.000Z');
    const envelope = JSON.parse(rawJson) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      format: 'sorry-im-a-cop-v2-image-prompt-templates',
      version: 3,
      exportedAt: '2026-07-23T04:00:00.000Z',
      sourceRevision: 8
    });
    expect(rawJson).not.toContain('settingsId');
    expect(rawJson).not.toContain('updatedAt');
    expect(rawJson).not.toContain('credential');

    const current = createEmptyImagePromptTemplateSettings('2026-07-23T05:00:00.000Z');
    current.revision = 3;
    const imported = parseImagePromptTemplateImport(rawJson, current);
    expect(imported).toMatchObject({
      settingsId: 'global-image-prompt-templates',
      revision: 3,
      updatedAt: '2026-07-23T05:00:00.000Z',
      modifierDefaultsState: 'custom',
      conversionCapabilities: { imageInputEnabled: true },
      conversionInstructions: { 'scene-shot-prompt': '自定义场景镜头转换' },
      styleSelection: {
        characterStylePresetId: 'builtin-style-hong-kong-mature-crime-anime',
        characterStyleMode: 'replace-global'
      },
      stylePresets: expect.arrayContaining([
        expect.objectContaining({ stylePresetId: 'builtin-style-hong-kong-crime-realism' })
      ]),
      dialectPresets: expect.arrayContaining([
        expect.objectContaining({ dialectPresetId: 'builtin-dialect-novelai' })
      ]),
      comfyStyleRecipes: expect.arrayContaining([
        expect.objectContaining({ recipeId: 'builtin-comfy-recipe-oda-non' })
      ]),
      modifiers: { global: { positive: 'cinematic noir', negative: '' } }
    });
    expect(current.modifiers.global.positive).toBe('');
  });

  it('rejects malformed, unsupported, and extended portable template files', () => {
    const current = createEmptyImagePromptTemplateSettings('2026-07-23T05:00:00.000Z');
    const valid = JSON.parse(serializeImagePromptTemplateSettings(current)) as Record<string, unknown>;

    expect(() => parseImagePromptTemplateImport('{', current)).toThrow('文件不是有效 JSON。');
    expect(() => parseImagePromptTemplateImport(JSON.stringify({ ...valid, version: 4 }), current)).toThrow();
    expect(() => parseImagePromptTemplateImport(JSON.stringify({ ...valid, apiKey: 'must-not-pass' }), current)).toThrow();

    const emptyInstruction = structuredClone(valid) as {
      templates: { conversionInstructions: Record<string, string> };
    };
    emptyInstruction.templates.conversionInstructions['turn-scene-plan'] = '   ';
    expect(() => parseImagePromptTemplateImport(JSON.stringify(emptyInstruction), current))
      .toThrow('转换任务指令不能为空');
  });

  it('imports version 1 files without replacing the current style and dialect libraries', () => {
    const current = createEmptyImagePromptTemplateSettings('2026-07-23T05:00:00.000Z');
    current.stylePresets[0].name = '玩家保留的默认风格名称';
    current.dialectPresets[0].positivePrefix = 'player prefix';
    const version2 = JSON.parse(serializeImagePromptTemplateSettings(current)) as {
      version: number;
      templates: Record<string, unknown>;
    };
    const {
      stylePresets: _stylePresets,
      styleSelection: _styleSelection,
      dialectPresets: _dialectPresets,
      comfyStyleRecipes: _comfyStyleRecipes,
      ...legacyTemplates
    } = version2.templates;
    const imported = parseImagePromptTemplateImport(JSON.stringify({
      ...version2,
      version: 1,
      templates: legacyTemplates
    }), current);

    expect(imported.stylePresets[0].name).toBe('玩家保留的默认风格名称');
    expect(imported.dialectPresets[0].positivePrefix).toBe('player prefix');
    expect(imported.comfyStyleRecipes).toEqual(current.comfyStyleRecipes);
  });
});
