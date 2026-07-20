import { z } from 'zod';
import type { CurrentIdentity } from './types';

export const currentIdentityValues = ['civilian', 'gang_member', 'police'] as const satisfies readonly CurrentIdentity[];

export const currentIdentitySchema = z.enum(currentIdentityValues);

const emptyIdentityAliases = new Set(['', 'unknown', 'unspecified', 'not_applicable', 'na', 'n/a', 'none', 'null']);

function compactIdentityText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[\s_\-/]+/g, '');
}

export function normalizeCurrentIdentity(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const raw = value.trim();
  const compact = compactIdentityText(raw);
  const normalized = raw.toLowerCase().replace(/[‐‑‒–—]/g, '-').replace(/[\s-]+/g, '_');

  if (currentIdentityValues.includes(normalized as CurrentIdentity)) return normalized;
  if (emptyIdentityAliases.has(normalized) || emptyIdentityAliases.has(compact) || ['未知', '未指定', '不明', '未确认'].includes(raw)) {
    return undefined;
  }

  if (
    raw.includes('警') ||
    raw.includes('差人') ||
    compact.includes('police') ||
    compact.includes('cop') ||
    compact.includes('officer') ||
    compact.includes('constable') ||
    compact.includes('detective') ||
    compact.includes('inspector') ||
    compact.includes('sergeant')
  ) {
    return 'police';
  }

  if (
    raw.includes('社团') ||
    raw.includes('黑社会') ||
    raw.includes('字头') ||
    raw.includes('古惑') ||
    raw.includes('帮派') ||
    raw.includes('马仔') ||
    compact.includes('triad') ||
    compact.includes('gang') ||
    compact.includes('underworld') ||
    compact.includes('society')
  ) {
    return 'gang_member';
  }

  if (
    raw.includes('市民') ||
    raw.includes('平民') ||
    raw.includes('街坊') ||
    raw.includes('商户') ||
    raw.includes('老板') ||
    raw.includes('家属') ||
    compact.includes('civilian') ||
    compact.includes('citizen') ||
    compact.includes('resident') ||
    compact.includes('shopkeeper') ||
    compact.includes('merchant')
  ) {
    return 'civilian';
  }

  return value;
}

export const optionalCurrentIdentitySchema = z.preprocess(normalizeCurrentIdentity, currentIdentitySchema.optional());

export const defaultCurrentIdentitySchema = z.preprocess(normalizeCurrentIdentity, currentIdentitySchema.default('civilian'));
