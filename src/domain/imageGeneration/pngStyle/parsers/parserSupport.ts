import type { ParsedPngGenerationData } from '../types';
import { parsedPngGenerationDataSchema } from '../schemas';

export type PngTextChunks = Readonly<Record<string, readonly string[]>>;

export function firstText(
  chunks: PngTextChunks,
  ...keys: string[]
): string | undefined {
  const normalized = new Map(
    Object.entries(chunks).map(([key, values]) => [key.toLocaleLowerCase('en-US'), values])
  );
  for (const key of keys) {
    const value = normalized.get(key.toLocaleLowerCase('en-US'))?.find((entry) => entry.trim());
    if (value !== undefined) return value;
  }
  return undefined;
}

export function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function integer(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function safeJson(value: string | undefined): unknown {
  if (!value?.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function stringifyBounded(value: unknown, maximum = 2 * 1024 * 1024): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (serialized.length > maximum) throw new Error('PNG 原始元数据超过安全上限。');
  return serialized;
}

export function parsedResult(value: ParsedPngGenerationData): ParsedPngGenerationData {
  return parsedPngGenerationDataSchema.parse(value);
}

export function extractLoraTokens(prompt: string): string[] {
  return Array.from(prompt.matchAll(/<lora:[^>\r\n]{1,900}>/giu), (match) => match[0])
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 100);
}
