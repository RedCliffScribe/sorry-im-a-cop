import { describe, expect, it } from 'vitest';
import {
  createPngStyleImportDraft,
  resolvePngStyleSemanticSegments
} from './pngStyleResolver';
import { createDefaultPngStyleLibrarySettings } from './IndexedDbPngStyleRepository';

describe('PNG style classification and rendering', () => {
  const imported = createPngStyleImportDraft({
    parsed: {
      source: 'a1111',
      positivePrompt: '1girl, black hair, by wlop, cinematic lighting, masterpiece, <lora:test:0.7>',
      negativePrompt: 'lowres, red dress, bad hands',
      parameters: { sampler: 'Euler', steps: 28, cfg: 6, seed: 99, model: 'private.ckpt' },
      rawMetadata: 'not persisted by preset',
      warnings: []
    },
    imageHash: 'a'.repeat(64),
    fileName: 'reference.png',
    now: '2026-07-29T00:00:00.000Z',
    createId: () => 'one'
  });

  it('keeps explicit artist text literal and excludes subject content from reusable style', () => {
    expect(imported.preset.artistTokens).toEqual(['by wlop']);
    expect(imported.preset.tagStyle.positive).toBe('cinematic lighting, masterpiece');
    expect(imported.classification.excludedSubjectTokens).toContain('1girl');
    expect(imported.classification.excludedSubjectTokens).toContain('black hair');
    expect(imported.preset.protectedTokens).toEqual([{
      value: '<lora:test:0.7>',
      kind: 'lora-trigger',
      enabled: false
    }]);
    expect(imported.preset.parameterDraft).toEqual({ sampler: 'Euler', steps: 28, cfg: 6 });
    expect(JSON.stringify(imported.preset)).not.toContain('private.ckpt');
    expect(JSON.stringify(imported.preset)).not.toContain('seed');
  });

  it('preserves weighted artist syntax byte-for-byte instead of rewriting it', () => {
    const weighted = createPngStyleImportDraft({
      parsed: {
        source: 'novelai',
        positivePrompt: '(by wlop:1.2), {{artist:oda non}}, soft shading',
        negativePrompt: '',
        rawMetadata: '',
        warnings: []
      },
      imageHash: 'b'.repeat(64),
      fileName: 'weighted.png',
      now: '2026-07-29T00:00:00.000Z',
      createId: () => 'weighted'
    });
    expect(weighted.preset.artistTokens).toEqual([
      '(by wlop:1.2)',
      '{{artist:oda non}}'
    ]);
  });

  it('drops out-of-range parameter values without losing the style draft', () => {
    const oversized = createPngStyleImportDraft({
      parsed: {
        source: 'a1111',
        positivePrompt: 'cinematic lighting',
        negativePrompt: '',
        parameters: { steps: 10_000, cfg: 9_000 },
        rawMetadata: '',
        warnings: []
      },
      imageHash: 'c'.repeat(64),
      fileName: 'oversized.png',
      now: '2026-07-29T00:00:00.000Z',
      createId: () => 'oversized'
    });
    expect(oversized.preset.parameterDraft).toBeUndefined();
    expect(oversized.warnings.join(' ')).toContain('Steps');
    expect(oversized.warnings.join(' ')).toContain('CFG');
  });

  it('renders tag backends as preserve-literal without silently enabling LoRA', () => {
    const settings = createDefaultPngStyleLibrarySettings();
    settings.presets = [imported.preset];
    settings.selection.globalPngStylePresetId = imported.preset.pngStylePresetId;
    const segments = resolvePngStyleSemanticSegments(settings, 'character', 'novelai');
    expect(segments).toEqual([expect.objectContaining({
      kind: 'artist-style',
      renderPolicy: 'preserve-literal',
      positive: 'by wlop, cinematic lighting, masterpiece'
    })]);
    expect(segments[0]?.positive).not.toContain('<lora:');
  });

  it('uses visual traits rather than artist identity for natural-language providers', () => {
    const settings = createDefaultPngStyleLibrarySettings();
    settings.presets = [imported.preset];
    settings.selection.characterPngStylePresetId = imported.preset.pngStylePresetId;
    const segments = resolvePngStyleSemanticSegments(settings, 'character', 'openai-gpt-image');
    expect(segments[0]).toMatchObject({
      kind: 'style',
      renderPolicy: 'transform'
    });
    expect(segments[0]?.positive).toContain('cinematic lighting');
    expect(segments[0]?.positive).not.toContain('wlop');
  });
});
