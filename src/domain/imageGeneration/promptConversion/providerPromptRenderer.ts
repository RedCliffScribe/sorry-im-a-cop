import type {
  ProviderPromptRenderInput,
  ProviderPromptRenderOutput
} from './schemas';
import type {
  ImagePromptDialectFamily,
  ImagePromptDialectPreset
} from './promptPresetLibrary';
import type { SemanticImagePrompt, SemanticImagePromptSegment } from './types';
import { validateProviderPromptRenderOutput } from './validation';

export interface FormattedProviderPrompt {
  dialectPresetId: string;
  dialectFamily?: ImagePromptDialectFamily;
  semanticSegments: SemanticImagePromptSegment[];
  formattedSegments: ProviderPromptRenderOutput['segments'];
  positive: string;
  negative: string;
}

export type NegativePromptMode =
  | 'separate'
  | 'merged-into-positive'
  | 'unsupported'
  | 'workflow-controlled';

export interface PromptTransportCompatibility {
  status: 'compatible' | 'incompatible';
  negativePromptChannel: 'separate' | 'merged-into-positive' | 'workflow-controlled';
  message: string;
}

const NOVELAI_NEGATIVE_MARKER = /(?:^|\n)\s*(?:avoid|negative prompt|undesired content)\s*:/iu;

export function resolvePromptTransportCompatibility(
  dialectFamily: ImagePromptDialectFamily | undefined,
  negativePromptMode: NegativePromptMode
): PromptTransportCompatibility {
  const negativePromptChannel = negativePromptMode === 'separate'
    ? 'separate'
    : negativePromptMode === 'workflow-controlled'
      ? 'workflow-controlled'
      : 'merged-into-positive';
  if (dialectFamily === 'novelai' && negativePromptMode !== 'separate') {
    return {
      status: 'incompatible',
      negativePromptChannel,
      message: 'NovelAI 渲染方案必须使用经过验证的独立负向提示词通道；当前接口或工作流会合并、忽略或自行控制负向词。'
    };
  }
  return {
    status: 'compatible',
    negativePromptChannel,
    message: negativePromptChannel === 'separate'
      ? '正向与负向提示词将通过独立字段传输。'
      : negativePromptChannel === 'workflow-controlled'
        ? '当前工作流未开放负向词绑定，负向提示词由工作流内部控制。'
        : '当前接口没有独立负向字段，负向要求将以当前模型家族专用的可见约束段合并到正向提示词。'
  };
}

function assertPromptTransportCompatibility(
  prompt: Pick<FormattedProviderPrompt, 'positive'>,
  dialectFamily: ImagePromptDialectFamily | undefined,
  negativePromptMode: NegativePromptMode
): void {
  const compatibility = resolvePromptTransportCompatibility(dialectFamily, negativePromptMode);
  if (compatibility.status === 'incompatible') {
    throw new Error(`模型渲染方案与传输通道不兼容：${compatibility.message}`);
  }
  if (dialectFamily === 'novelai' && NOVELAI_NEGATIVE_MARKER.test(prompt.positive)) {
    throw new Error('NovelAI 正向提示词中检测到 Avoid、Negative prompt 或 Undesired content 段；请把这些内容移入独立负向提示词框。');
  }
}

export function createProviderPromptRenderInput(
  prompt: SemanticImagePrompt,
  dialect: ImagePromptDialectPreset
): ProviderPromptRenderInput {
  return {
    segments: structuredClone(prompt.segments.filter(
      (segment) => segment.renderPolicy !== 'preserve-literal'
    )),
    dialect: {
      dialectPresetId: dialect.dialectPresetId,
      name: dialect.name,
      family: dialect.family,
      renderingInstruction: dialect.renderingInstruction,
      positivePrefix: dialect.positivePrefix,
      positiveSuffix: dialect.positiveSuffix,
      negativePrefix: dialect.negativePrefix,
      negativeSuffix: dialect.negativeSuffix
    }
  };
}

function separatorFor(dialect: ImagePromptDialectPreset): string {
  return ['generic-english-tags', 'sd-sdxl', 'pony', 'novelai'].includes(dialect.family)
    ? ', '
    : '\n';
}

function join(parts: string[], separator: string): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(separator);
}

const NOVELAI_SCENE_CHARACTER_SEGMENT_PREFIXES = [
  'character-identity:',
  'scene-appearance:',
  'persistent-requirement:'
] as const;

function novelAiSceneActorId(segmentId: string): string | undefined {
  const prefix = NOVELAI_SCENE_CHARACTER_SEGMENT_PREFIXES.find((candidate) =>
    segmentId.startsWith(candidate)
  );
  return prefix ? segmentId.slice(prefix.length) : undefined;
}

function normalizeNovelAiCharacterSegment(value: string): {
  prompt: string;
  subject?: 'boy' | 'girl' | 'other';
} {
  let subject: 'boy' | 'girl' | 'other' | undefined;
  const tokens = value.split(',').map((token) => token.trim()).filter(Boolean);
  const normalized = tokens.map((token) => {
    const lower = token.toLocaleLowerCase('en-US');
    if (lower === '1boy' || lower === 'boy' || lower === '1man' || lower === 'man') {
      subject ??= 'boy';
      return 'boy';
    }
    if (lower === '1girl' || lower === 'girl' || lower === '1woman' || lower === 'woman') {
      subject ??= 'girl';
      return 'girl';
    }
    if (lower === '1other' || lower === 'other') {
      subject ??= 'other';
      return 'other';
    }
    return token;
  });
  return { prompt: [...new Set(normalized)].join(', '), subject };
}

function novelAiCountTags(subjects: Array<'boy' | 'girl' | 'other'>): string[] {
  const counts = { boy: 0, girl: 0, other: 0 };
  subjects.forEach((subject) => { counts[subject] += 1; });
  return (Object.keys(counts) as Array<keyof typeof counts>).flatMap((subject) => {
    const count = counts[subject];
    if (!count) return [];
    const plural = subject === 'boy' ? 'boys' : subject === 'girl' ? 'girls' : 'others';
    return [`${count}${count === 1 ? subject : plural}`];
  });
}

function compileNovelAiPositive(
  semantic: SemanticImagePrompt,
  dialect: ImagePromptDialectPreset,
  ordered: ProviderPromptRenderOutput['segments']
): string | undefined {
  if (dialect.family !== 'novelai') return undefined;
  if (!semantic.segments.some((segment) => segment.segmentId === 'subject:scene')) return undefined;

  const sourceById = new Map(semantic.segments.map((segment) => [segment.segmentId, segment]));
  const actorGroups = new Map<string, string[]>();
  const baseParts: string[] = [];
  for (const formatted of ordered) {
    const source = sourceById.get(formatted.segmentId);
    if (!source) continue;
    const actorId = novelAiSceneActorId(source.segmentId);
    if (!actorId) {
      baseParts.push(formatted.positive);
      continue;
    }
    const current = actorGroups.get(actorId) ?? [];
    current.push(formatted.positive);
    actorGroups.set(actorId, current);
  }

  const subjects: Array<'boy' | 'girl' | 'other'> = [];
  const characterPrompts = [...actorGroups.values()].map((parts) => {
    const normalized = normalizeNovelAiCharacterSegment(join(parts, ', '));
    if (normalized.subject) subjects.push(normalized.subject);
    return normalized.prompt;
  }).filter(Boolean);
  if (!characterPrompts.length) return undefined;
  // A V4 counted base prompt must account for every isolated character prompt.
  // If conversion omitted an official subject tag, preserve the validated flat
  // rendering instead of inventing a gender or emitting misleading counts.
  if (subjects.length !== characterPrompts.length) return undefined;

  const base = join([
    dialect.positivePrefix,
    ...novelAiCountTags(subjects),
    ...baseParts,
    dialect.positiveSuffix
  ], ', ');
  return [base, ...characterPrompts].filter(Boolean).join(' | ');
}

export function compileFormattedProviderPrompt(
  semantic: SemanticImagePrompt,
  dialect: ImagePromptDialectPreset,
  output: ProviderPromptRenderOutput
): FormattedProviderPrompt {
  const issues = validateProviderPromptRenderOutput(
    createProviderPromptRenderInput(semantic, dialect),
    output
  );
  if (issues.length) {
    throw new Error(`模型提示词格式转换不符合冻结语义段契约：${issues.join('；')}`);
  }
  const formattedById = new Map(output.segments.map((segment) => [segment.segmentId, segment]));
  const ordered = semantic.segments.map((segment) => {
    if (segment.renderPolicy === 'preserve-literal') {
      return {
        segmentId: segment.segmentId,
        positive: segment.positive,
        negative: segment.negative
      };
    }
    const formatted = formattedById.get(segment.segmentId);
    if (!formatted) throw new Error(`模型提示词格式转换缺少语义段：${segment.segmentId}`);
    return structuredClone(formatted);
  });
  const separator = separatorFor(dialect);
  const novelAiPositive = compileNovelAiPositive(semantic, dialect, ordered);
  return {
    dialectPresetId: dialect.dialectPresetId,
    dialectFamily: dialect.family,
    semanticSegments: structuredClone(semantic.segments),
    formattedSegments: ordered,
    positive: novelAiPositive ?? join([
      dialect.positivePrefix,
      ...ordered.map((segment) => segment.positive),
      dialect.positiveSuffix
    ], separator),
    negative: join([
      dialect.negativePrefix,
      ...ordered.map((segment) => segment.negative),
      dialect.negativeSuffix
    ], separator)
  };
}

export function resolveActualTransportPrompts(
  prompt: Pick<FormattedProviderPrompt, 'positive' | 'negative'>,
  negativePromptMode: NegativePromptMode,
  dialectFamily?: ImagePromptDialectFamily
): {
  prompt: string;
  negativePrompt?: string;
  resolution: 'separate' | 'merged' | 'none' | 'workflow-controlled';
} {
  assertPromptTransportCompatibility(prompt, dialectFamily, negativePromptMode);
  if (!prompt.negative.trim()) return { prompt: prompt.positive, resolution: 'none' };
  if (negativePromptMode === 'workflow-controlled') {
    return { prompt: prompt.positive, resolution: 'workflow-controlled' };
  }
  if (negativePromptMode === 'separate') {
    return {
      prompt: prompt.positive,
      negativePrompt: prompt.negative,
      resolution: 'separate'
    };
  }
  const mergedNegative = dialectFamily === 'openai-gpt-image'
    ? `Constraints:\nDo not include or contradict any of the following: ${prompt.negative}`
    : dialectFamily === 'gemini-image'
      ? `Avoid the following visual elements or contradictions: ${prompt.negative}`
      : `Avoid: ${prompt.negative}`;
  return {
    prompt: `${prompt.positive}\n\n${mergedNegative}`,
    resolution: 'merged'
  };
}
