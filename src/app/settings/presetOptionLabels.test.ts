import { describe, expect, it } from 'vitest';
import { formatPresetOptionLabel } from './presetOptionLabels';

describe('formatPresetOptionLabel', () => {
  it('keeps unique names compact', () => {
    const presets = [{ id: 'builtin-openai', name: 'OpenAI 推荐', origin: 'built-in' as const }];
    expect(formatPresetOptionLabel(presets[0], presets)).toBe('OpenAI 推荐');
  });

  it('distinguishes built-in and workshop-imported presets with the same name', () => {
    const presets = [
      { id: 'builtin-openai', name: 'OpenAI GPT Image 推荐', origin: 'built-in' as const },
      { id: 'workshop-dialect:source:dialect-1', name: 'OpenAI GPT Image 推荐', origin: 'custom' as const }
    ];
    expect(formatPresetOptionLabel(presets[0], presets)).toBe('OpenAI GPT Image 推荐（内置）');
    expect(formatPresetOptionLabel(presets[1], presets)).toBe('OpenAI GPT Image 推荐（工坊导入）');
  });

  it('numbers repeated workshop imports without changing their stored names', () => {
    const presets = [
      { id: 'workshop-dialect:a:1', name: '同名格式', origin: 'custom' as const },
      { id: 'workshop-dialect:b:1', name: '同名格式', origin: 'custom' as const }
    ];
    expect(formatPresetOptionLabel(presets[0], presets)).toBe('同名格式（工坊导入 1）');
    expect(formatPresetOptionLabel(presets[1], presets)).toBe('同名格式（工坊导入 2）');
  });
});
