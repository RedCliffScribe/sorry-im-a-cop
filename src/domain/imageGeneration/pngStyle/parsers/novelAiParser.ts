import type { ParsedPngGenerationData } from '../types';
import {
  extractLoraTokens,
  finiteNumber,
  firstText,
  integer,
  nonEmptyString,
  parsedResult,
  safeJson,
  stringifyBounded,
  type PngTextChunks
} from './parserSupport';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nestedComment(payload: Record<string, unknown>): Record<string, unknown> {
  const comment = payload.Comment ?? payload.comment;
  if (typeof comment === 'string') return asRecord(safeJson(comment));
  return asRecord(comment);
}

export function parseNovelAiPayload(
  payload: unknown,
  rawMetadata?: string
): ParsedPngGenerationData | undefined {
  const root = asRecord(payload);
  const comment = nestedComment(root);
  const positivePrompt = nonEmptyString(
    root.Description ??
    root.description ??
    root.input ??
    comment.prompt ??
    comment.input
  ) ?? '';
  const negativePrompt = nonEmptyString(
    comment.uc ??
    comment.negative_prompt ??
    root.uc ??
    root.negative_prompt
  ) ?? '';
  const software = nonEmptyString(root.Software ?? root.software)?.toLocaleLowerCase('en-US');
  const source = nonEmptyString(root.Source ?? root.source)?.toLocaleLowerCase('en-US');
  const hasNovelAiShape = Boolean(
    software?.includes('novelai') ||
    source?.includes('nai-diffusion') ||
    source?.includes('novelai') ||
    comment.uc ||
    comment.negative_prompt ||
    comment.sampler ||
    comment.steps ||
    comment.scale
  );
  if (!hasNovelAiShape || (!positivePrompt && !negativePrompt)) return undefined;
  const steps = integer(comment.steps ?? root.steps);
  const cfg = finiteNumber(comment.scale ?? comment.cfg ?? root.scale ?? root.cfg);
  const seed = integer(comment.seed ?? root.seed);
  const width = integer(comment.width ?? root.width);
  const height = integer(comment.height ?? root.height);
  const sampler = nonEmptyString(comment.sampler ?? root.sampler);
  const model = nonEmptyString(comment.model ?? root.Source ?? root.source);
  const loras = extractLoraTokens(positivePrompt);
  return parsedResult({
    source: 'novelai',
    positivePrompt,
    negativePrompt,
    parameters: {
      ...(sampler ? { sampler } : {}),
      ...(steps && steps > 0 ? { steps } : {}),
      ...(cfg !== undefined && cfg >= 0 ? { cfg } : {}),
      ...(seed !== undefined && seed >= 0 ? { seed } : {}),
      ...(width && width > 0 ? { width } : {}),
      ...(height && height > 0 ? { height } : {}),
      ...(model ? { model } : {}),
      ...(loras.length ? { loras } : {})
    },
    rawMetadata: rawMetadata ?? stringifyBounded(payload),
    warnings: []
  });
}

export function parseNovelAiMetadata(chunks: PngTextChunks): ParsedPngGenerationData | undefined {
  const software = firstText(chunks, 'Software');
  const description = firstText(chunks, 'Description');
  const commentText = firstText(chunks, 'Comment');
  if (!software?.toLocaleLowerCase('en-US').includes('novelai') && !description && !commentText) {
    return undefined;
  }
  const comment = safeJson(commentText);
  return parseNovelAiPayload({
    Software: software,
    Description: description,
    Comment: comment ?? commentText
  }, stringifyBounded({ Software: software, Description: description, Comment: comment ?? commentText }));
}

export function parseNovelAiStealthText(value: string): ParsedPngGenerationData | undefined {
  const parsed = safeJson(value);
  if (!parsed) throw new Error('NovelAI 隐写元数据不是有效 JSON。');
  return parseNovelAiPayload(parsed, value);
}
