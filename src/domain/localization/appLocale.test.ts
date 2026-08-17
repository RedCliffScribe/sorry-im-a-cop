import { describe, expect, it } from 'vitest';
import {
  createNarrativeLanguageGuide,
  resolveAppLocale
} from './appLocale';

describe('app locale', () => {
  it('defaults missing and unsupported values to Simplified Chinese', () => {
    expect(resolveAppLocale(undefined)).toBe('zh-CN');
    expect(resolveAppLocale('zh-TW')).toBe('zh-CN');
    expect(resolveAppLocale('zh-Hant-HK')).toBe('zh-Hant-HK');
  });

  it('requires Hong Kong Traditional output without translating protocol keys or stable ids', () => {
    const guide = createNarrativeLanguageGuide('zh-Hant-HK');

    expect(guide).toContain('香港繁體中文');
    expect(guide).toContain('narrativeText');
    expect(guide).toContain('稳定 ID');
    expect(guide).toContain('不得翻译或改写');
  });
});
