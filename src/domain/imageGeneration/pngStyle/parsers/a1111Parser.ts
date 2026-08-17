import type { ParsedPngGenerationData } from '../types';
import {
  extractLoraTokens,
  finiteNumber,
  firstText,
  integer,
  parsedResult,
  type PngTextChunks
} from './parserSupport';

function splitParameterTail(value: string): {
  positivePrompt: string;
  negativePrompt: string;
  tail: string;
} {
  const stepsMatch = Array.from(value.matchAll(/(?:^|\n)Steps\s*:\s*/giu)).at(-1);
  const tailStart = stepsMatch?.index;
  const promptSection = tailStart === undefined ? value.trim() : value.slice(0, tailStart).trim();
  const tail = tailStart === undefined ? '' : value.slice(tailStart).trim();
  const negativeMarker = /(?:^|\n)Negative prompt\s*:\s*/iu.exec(promptSection);
  if (!negativeMarker || negativeMarker.index === undefined) {
    return { positivePrompt: promptSection, negativePrompt: '', tail };
  }
  const markerIndex = negativeMarker.index;
  return {
    positivePrompt: promptSection.slice(0, markerIndex).trim(),
    negativePrompt: promptSection.slice(markerIndex + negativeMarker[0].length).trim(),
    tail
  };
}

function readTailValue(tail: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|,)\\s*${escaped}\\s*:\\s*([^,\\r\\n]+)`, 'iu').exec(tail);
  return match?.[1]?.trim() || undefined;
}

export function parseA1111Metadata(chunks: PngTextChunks): ParsedPngGenerationData | undefined {
  const parameters = firstText(chunks, 'parameters');
  if (!parameters) return undefined;
  const prompts = splitParameterTail(parameters);
  const size = readTailValue(prompts.tail, 'Size')?.match(/^(\d+)\s*x\s*(\d+)$/iu);
  const steps = integer(readTailValue(prompts.tail, 'Steps'));
  const cfg = finiteNumber(readTailValue(prompts.tail, 'CFG scale'));
  const seed = integer(readTailValue(prompts.tail, 'Seed'));
  const clipSkip = integer(readTailValue(prompts.tail, 'Clip skip'));
  return parsedResult({
    source: 'a1111',
    positivePrompt: prompts.positivePrompt,
    negativePrompt: prompts.negativePrompt,
    parameters: {
      ...(readTailValue(prompts.tail, 'Sampler') ? { sampler: readTailValue(prompts.tail, 'Sampler') } : {}),
      ...(steps && steps > 0 ? { steps } : {}),
      ...(cfg !== undefined && cfg >= 0 ? { cfg } : {}),
      ...(clipSkip && clipSkip > 0 ? { clipSkip } : {}),
      ...(seed !== undefined && seed >= 0 ? { seed } : {}),
      ...(size ? { width: Number(size[1]), height: Number(size[2]) } : {}),
      ...(readTailValue(prompts.tail, 'Model') ? { model: readTailValue(prompts.tail, 'Model') } : {}),
      ...(extractLoraTokens(prompts.positivePrompt).length
        ? { loras: extractLoraTokens(prompts.positivePrompt) }
        : {})
    },
    rawMetadata: parameters,
    warnings: []
  });
}
