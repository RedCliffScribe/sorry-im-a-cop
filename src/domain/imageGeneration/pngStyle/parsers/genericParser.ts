import type { ParsedPngGenerationData } from '../types';
import {
  extractLoraTokens,
  firstText,
  parsedResult,
  stringifyBounded,
  type PngTextChunks
} from './parserSupport';

export function parseGenericMetadata(chunks: PngTextChunks): ParsedPngGenerationData | undefined {
  const positivePrompt = firstText(
    chunks,
    'prompt',
    'positive prompt',
    'positive_prompt',
    'description'
  ) ?? '';
  const negativePrompt = firstText(
    chunks,
    'negative prompt',
    'negative_prompt',
    'undesired content'
  ) ?? '';
  if (!positivePrompt && !negativePrompt) return undefined;
  return parsedResult({
    source: 'unknown',
    positivePrompt,
    negativePrompt,
    parameters: extractLoraTokens(positivePrompt).length
      ? { loras: extractLoraTokens(positivePrompt) }
      : undefined,
    rawMetadata: stringifyBounded(chunks),
    warnings: ['未识别 PNG 生成器；只导入了明确命名的提示词文本，其他元数据未作猜测。']
  });
}
