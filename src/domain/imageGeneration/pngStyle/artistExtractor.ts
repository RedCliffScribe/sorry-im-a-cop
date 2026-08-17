import type { ProtectedPromptToken } from './types';

const KNOWN_ARTIST_TOKENS = new Set([
  'wlop',
  'toi8',
  'redjuice',
  'lack',
  'yaegashi nan',
  'oda non',
  'oda_non',
  'izayoi seishin',
  'izayoi_seishin'
]);

function normalizeToken(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function tokenizePrompt(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let roundDepth = 0;
  let squareDepth = 0;
  let curlyDepth = 0;
  let angleDepth = 0;
  for (const character of value) {
    if (character === '(') roundDepth += 1;
    if (character === ')') roundDepth = Math.max(0, roundDepth - 1);
    if (character === '[') squareDepth += 1;
    if (character === ']') squareDepth = Math.max(0, squareDepth - 1);
    if (character === '{') curlyDepth += 1;
    if (character === '}') curlyDepth = Math.max(0, curlyDepth - 1);
    if (character === '<') angleDepth += 1;
    if (character === '>') angleDepth = Math.max(0, angleDepth - 1);
    if (
      (character === ',' || character === '\n' || character === ';' || character === '；') &&
      roundDepth === 0 &&
      squareDepth === 0 &&
      curlyDepth === 0 &&
      angleDepth === 0
    ) {
      const normalized = normalizeToken(current);
      if (normalized) tokens.push(normalized);
      current = '';
      continue;
    }
    current += character;
  }
  const trailing = normalizeToken(current);
  if (trailing) tokens.push(trailing);
  return tokens.slice(0, 2000);
}

function unweight(value: string): string {
  let normalized = value.trim();
  const matchingBrackets: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}'
  };
  while (
    normalized.length >= 2 &&
    matchingBrackets[normalized[0]!] === normalized.at(-1)
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized
    .replace(/^\d+(?:\.\d+)?::/u, '')
    .replace(/::\d+(?:\.\d+)?$/u, '')
    .replace(/:\s*\d+(?:\.\d+)?$/u, '')
    .trim();
}

export function isExplicitArtistToken(value: string): boolean {
  const normalized = unweight(value).toLocaleLowerCase('en-US');
  return /^(?:by|artist\s*:)\s*[^\s].+$/iu.test(normalized) ||
    KNOWN_ARTIST_TOKENS.has(normalized);
}

export function extractProtectedPromptTokens(tokens: readonly string[]): ProtectedPromptToken[] {
  const result: ProtectedPromptToken[] = [];
  for (const token of tokens) {
    if (/^<lora:[^>\r\n]{1,900}>$/iu.test(token.trim())) {
      result.push({ value: token.trim(), kind: 'lora-trigger', enabled: false });
      continue;
    }
    if (/^(?:model|checkpoint)\s*:/iu.test(token.trim())) {
      result.push({ value: token.trim(), kind: 'model-trigger', enabled: false });
    }
  }
  return result;
}

export function extractArtistTokens(tokens: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    if (!isExplicitArtistToken(token)) continue;
    const key = token.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  return result;
}
