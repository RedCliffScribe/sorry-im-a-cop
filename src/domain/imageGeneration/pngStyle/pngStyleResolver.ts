import type { ImagePromptDialectFamily, SemanticImagePromptSegment } from '../promptConversion';
import { extractProtectedPromptTokens, tokenizePrompt } from './artistExtractor';
import { readNovelAiStealthMetadata, readPngMetadata } from './pngReader';
import { parseA1111Metadata } from './parsers/a1111Parser';
import { parseComfyUiMetadata } from './parsers/comfyUiParser';
import { parseGenericMetadata } from './parsers/genericParser';
import {
  parseNovelAiMetadata,
  parseNovelAiStealthText
} from './parsers/novelAiParser';
import { classifyPngStyleTokens } from './styleClassifier';
import { pngStylePresetSchema } from './schemas';
import type {
  ParsedPngGenerationData,
  PngStyleImportDraft,
  PngStyleLibrarySettings,
  PngStylePreset,
  PngStyleTarget
} from './types';

export const PNG_STYLE_PARSER_VERSION = 1;

const TAG_DIALECTS = new Set<ImagePromptDialectFamily>([
  'generic-english-tags',
  'sd-sdxl',
  'pony',
  'novelai'
]);

function joinTags(values: readonly string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(', ');
}

function defaultNaturalStyle(styleTokens: readonly string[], qualityTokens: readonly string[]): string {
  const values = [...styleTokens, ...qualityTokens];
  return values.length ? `可复用视觉特征：${values.join('；')}` : '';
}

function safeName(value: string): string {
  const normalized = value.replace(/\.png$/iu, '').trim();
  return normalized ? `PNG画风·${normalized}`.slice(0, 200) : 'PNG画风';
}

function createParameterDraft(parsed: ParsedPngGenerationData): {
  draft: PngStylePreset['parameterDraft'];
  warnings: string[];
} {
  const source = parsed.parameters;
  if (!source) return { draft: undefined, warnings: [] };
  const warnings: string[] = [];
  const steps = source.steps !== undefined && source.steps <= 1000
    ? source.steps
    : undefined;
  const cfg = source.cfg !== undefined && source.cfg <= 1000
    ? source.cfg
    : undefined;
  const clipSkip = source.clipSkip !== undefined && source.clipSkip <= 100
    ? source.clipSkip
    : undefined;
  if (source.steps !== undefined && steps === undefined) {
    warnings.push('原图 Steps 超出可移植参数草稿范围，已忽略。');
  }
  if (source.cfg !== undefined && cfg === undefined) {
    warnings.push('原图 CFG 超出可移植参数草稿范围，已忽略。');
  }
  if (source.clipSkip !== undefined && clipSkip === undefined) {
    warnings.push('原图 Clip skip 超出可移植参数草稿范围，已忽略。');
  }
  const draft = {
    ...(source.sampler ? { sampler: source.sampler } : {}),
    ...(steps !== undefined ? { steps } : {}),
    ...(cfg !== undefined ? { cfg } : {}),
    ...(clipSkip !== undefined ? { clipSkip } : {})
  };
  return {
    draft: Object.keys(draft).length ? draft : undefined,
    warnings
  };
}

export async function parsePngGenerationFile(file: File): Promise<{
  parsed: ParsedPngGenerationData;
  imageHash: string;
}> {
  const metadata = await readPngMetadata(file);
  const chunks = metadata.textChunks;
  let parsed = parseNovelAiMetadata(chunks)
    ?? parseA1111Metadata(chunks)
    ?? parseComfyUiMetadata(chunks)
    ?? parseGenericMetadata(chunks);
  if (!parsed) {
    const stealth = await readNovelAiStealthMetadata(file, metadata);
    parsed = stealth ? parseNovelAiStealthText(stealth) : undefined;
  }
  if (!parsed) throw new Error('PNG 中没有发现可识别的 NovelAI、A1111、ComfyUI 或通用提示词元数据。');
  return { parsed, imageHash: metadata.imageHash };
}

export function createPngStyleImportDraft(input: {
  parsed: ParsedPngGenerationData;
  imageHash: string;
  fileName: string;
  now?: string;
  createId?: () => string;
}): PngStyleImportDraft {
  const now = input.now ?? new Date().toISOString();
  const createId = input.createId ?? (() => crypto.randomUUID());
  const classification = classifyPngStyleTokens(
    input.parsed.positivePrompt,
    input.parsed.negativePrompt
  );
  const positiveTokens = tokenizePrompt(input.parsed.positivePrompt);
  const protectedTokens = extractProtectedPromptTokens(positiveTokens);
  const tagPositive = joinTags([
    ...classification.reusableStyleTokens,
    ...classification.qualityTokens
  ]);
  const tagNegative = joinTags(classification.negativeStyleTokens);
  const naturalPositive = defaultNaturalStyle(
    classification.reusableStyleTokens,
    classification.qualityTokens
  );
  const parameterDraft = createParameterDraft(input.parsed);
  const preset = pngStylePresetSchema.parse({
    pngStylePresetId: `png-style:${createId()}`,
    name: safeName(input.fileName),
    source: {
      format: input.parsed.source,
      imageHash: input.imageHash,
      parserVersion: PNG_STYLE_PARSER_VERSION
    },
    artistTokens: classification.artistTokens,
    protectedTokens,
    tagStyle: {
      positive: tagPositive,
      negative: tagNegative
    },
    naturalLanguageStyle: {
      global: {
        positive: naturalPositive,
        negative: tagNegative ? `避免以下常见画面缺陷：${tagNegative}` : ''
      },
      character: { positive: '', negative: '' },
      scene: { positive: '', negative: '' }
    },
    parameterDraft: parameterDraft.draft,
    createdAt: now,
    updatedAt: now
  });
  const warnings = [...input.parsed.warnings, ...parameterDraft.warnings];
  if (!classification.artistTokens.length) {
    warnings.push('没有发现明确的 by/artist 标签或已确认词库项；未自动猜测画师姓名。');
  }
  if (classification.unclassifiedTokens.length) {
    warnings.push(`有 ${classification.unclassifiedTokens.length} 个未分类词未自动写入画风，请在保存前人工确认。`);
  }
  if (protectedTokens.length) {
    warnings.push('检测到 LoRA 或模型触发词，已隔离并默认停用；系统不会加载任何 LoRA、checkpoint 或 workflow。');
  }
  return { preset, classification, warnings };
}

export async function importPngStyleFile(file: File): Promise<PngStyleImportDraft> {
  const { parsed, imageHash } = await parsePngGenerationFile(file);
  return createPngStyleImportDraft({
    parsed,
    imageHash,
    fileName: file.name
  });
}

function selectedPreset(
  settings: PngStyleLibrarySettings,
  target: PngStyleTarget
): PngStylePreset | undefined {
  const selectedId = target === 'character'
    ? settings.selection.characterPngStylePresetId ?? settings.selection.globalPngStylePresetId
    : settings.selection.narrativeScenePngStylePresetId ?? settings.selection.globalPngStylePresetId;
  return selectedId
    ? settings.presets.find((preset) => preset.pngStylePresetId === selectedId)
    : undefined;
}

function semanticSegment(input: {
  segmentId: string;
  positive: string;
  negative: string;
  preserveLiteral: boolean;
  preset: PngStylePreset;
}): SemanticImagePromptSegment {
  return {
    segmentId: input.segmentId,
    kind: input.preserveLiteral ? 'artist-style' : 'style',
    priority: 22,
    positive: input.positive.trim(),
    negative: input.negative.trim(),
    required: false,
    renderPolicy: input.preserveLiteral ? 'preserve-literal' : 'transform',
    provenance: {
      kind: 'png-style',
      presetId: input.preset.pngStylePresetId,
      imageHash: input.preset.source.imageHash,
      parserVersion: input.preset.source.parserVersion
    }
  };
}

export function resolvePngStyleSemanticSegments(
  settings: PngStyleLibrarySettings,
  target: PngStyleTarget,
  dialectFamily: ImagePromptDialectFamily | undefined
): SemanticImagePromptSegment[] {
  const preset = selectedPreset(settings, target);
  if (!preset) return [];
  if (dialectFamily && TAG_DIALECTS.has(dialectFamily)) {
    const positive = joinTags([
      ...preset.artistTokens,
      ...preset.protectedTokens.filter((token) => token.enabled).map((token) => token.value),
      preset.tagStyle.positive
    ]);
    const segment = semanticSegment({
      segmentId: `artist-style:${preset.pngStylePresetId}`,
      positive,
      negative: preset.tagStyle.negative,
      preserveLiteral: true,
      preset
    });
    return segment.positive || segment.negative ? [segment] : [];
  }
  const scoped = target === 'character'
    ? preset.naturalLanguageStyle.character
    : preset.naturalLanguageStyle.scene;
  const positive = [preset.naturalLanguageStyle.global.positive, scoped.positive]
    .map((value) => value.trim()).filter(Boolean).join('\n');
  const negative = [preset.naturalLanguageStyle.global.negative, scoped.negative]
    .map((value) => value.trim()).filter(Boolean).join('\n');
  const segment = semanticSegment({
    segmentId: `png-style:${preset.pngStylePresetId}:${target}`,
    positive,
    negative,
    preserveLiteral: false,
    preset
  });
  return segment.positive || segment.negative ? [segment] : [];
}
