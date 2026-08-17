import { describe, expect, it } from 'vitest';
import { BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS } from './promptPresetLibrary';
import {
  compileFormattedProviderPrompt,
  createProviderPromptRenderInput,
  resolveActualTransportPrompts
} from './providerPromptRenderer';
import type { SemanticImagePrompt } from './types';

const semantic: SemanticImagePrompt = {
  positive: 'detective\nrainy Hong Kong street',
  negative: 'modern cars\nwatermark',
  segments: [
    {
      segmentId: 'subject:character',
      kind: 'subject',
      priority: 50,
      positive: 'detective',
      negative: 'modern cars',
      required: true
    },
    {
      segmentId: 'quality:global',
      kind: 'quality',
      priority: 10,
      positive: 'rainy Hong Kong street',
      negative: 'watermark',
      required: false
    }
  ]
};

describe('provider prompt renderer', () => {
  it('never sends preserve-literal artist tags through the conversion model', () => {
    const dialect = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (preset) => preset.dialectPresetId === 'builtin-dialect-novelai'
    )!;
    const withArtistStyle: SemanticImagePrompt = {
      positive: 'detective\nby wlop, {{cinematic lighting}}',
      negative: 'modern cars\nlowres',
      segments: [
        semantic.segments[0]!,
        {
          segmentId: 'artist-style:png-one',
          kind: 'artist-style',
          priority: 22,
          positive: 'by wlop, {{cinematic lighting}}',
          negative: 'lowres',
          required: false,
          renderPolicy: 'preserve-literal',
          provenance: {
            kind: 'png-style',
            presetId: 'png-one',
            imageHash: 'a'.repeat(64),
            parserVersion: 1
          }
        }
      ]
    };
    const conversionInput = createProviderPromptRenderInput(withArtistStyle, dialect);
    expect(conversionInput.segments.map((segment) => segment.segmentId)).toEqual(['subject:character']);
    const formatted = compileFormattedProviderPrompt(withArtistStyle, dialect, {
      segments: [{
        segmentId: 'subject:character',
        positive: '1boy, detective',
        negative: 'modern car'
      }]
    });
    expect(formatted.formattedSegments[1]).toEqual({
      segmentId: 'artist-style:png-one',
      positive: 'by wlop, {{cinematic lighting}}',
      negative: 'lowres'
    });
    expect(formatted.positive).toContain('by wlop, {{cinematic lighting}}');
  });

  it('keeps semantic segment order and applies visible Pony prefixes', () => {
    const dialect = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (preset) => preset.dialectPresetId === 'builtin-dialect-pony'
    )!;
    const input = createProviderPromptRenderInput(semantic, dialect);
    const formatted = compileFormattedProviderPrompt(semantic, dialect, {
      segments: [
        {
          segmentId: 'quality:global',
          positive: 'rainy hong kong street',
          negative: 'watermark'
        },
        {
          segmentId: 'subject:character',
          positive: '1boy, detective',
          negative: 'modern car'
        }
      ]
    });

    expect(input.dialect.positivePrefix).toBe('score_9, score_8_up, score_7_up');
    expect(formatted.formattedSegments.map((segment) => segment.segmentId)).toEqual([
      'subject:character',
      'quality:global'
    ]);
    expect(formatted.positive).toBe(
      'score_9, score_8_up, score_7_up, 1boy, detective, rainy hong kong street'
    );
    expect(formatted.negative).toBe(
      'score_4, score_3, score_2, score_1, modern car, watermark'
    );
  });

  it('never drops a negative prompt when the provider has no separate negative field', () => {
    expect(resolveActualTransportPrompts(
      { positive: 'rainy street', negative: 'watermark' },
      'unsupported'
    )).toEqual({
      prompt: 'rainy street\n\nAvoid: watermark',
      resolution: 'merged'
    });
    expect(resolveActualTransportPrompts(
      { positive: 'rainy street', negative: 'watermark' },
      'separate'
    )).toEqual({
      prompt: 'rainy street',
      negativePrompt: 'watermark',
      resolution: 'separate'
    });
    expect(resolveActualTransportPrompts(
      { positive: 'rainy street', negative: 'watermark' },
      'workflow-controlled'
    )).toEqual({
      prompt: 'rainy street',
      resolution: 'workflow-controlled'
    });
  });

  it('uses provider-specific natural-language constraint blocks for GPT Image and Gemini', () => {
    expect(resolveActualTransportPrompts(
      { positive: 'rainy street', negative: 'watermark' },
      'merged-into-positive',
      'openai-gpt-image'
    )).toEqual({
      prompt: 'rainy street\n\nConstraints:\nDo not include or contradict any of the following: watermark',
      resolution: 'merged'
    });
    expect(resolveActualTransportPrompts(
      { positive: 'rainy street', negative: 'watermark' },
      'merged-into-positive',
      'gemini-image'
    )).toEqual({
      prompt: 'rainy street\n\nAvoid the following visual elements or contradictions: watermark',
      resolution: 'merged'
    });
  });

  it('hard-blocks NovelAI syntax unless negative content has a separate transport field', () => {
    const corruptedProviderReply = {
      positive: '1boy, adult male, detective\nUndesired content: realistic, old man, police uniform',
      negative: 'realistic, old man, police uniform'
    };
    expect(() => resolveActualTransportPrompts(
      corruptedProviderReply,
      'merged-into-positive',
      'novelai'
    )).toThrow(/必须使用经过验证的独立负向提示词通道/);
    expect(() => resolveActualTransportPrompts(
      corruptedProviderReply,
      'separate',
      'novelai'
    )).toThrow(/正向提示词中检测到/);
    expect(resolveActualTransportPrompts(
      {
        positive: '1boy, adult male, detective, 1980s hong kong police station',
        negative: 'old man, police uniform, text'
      },
      'separate',
      'novelai'
    )).toEqual({
      prompt: '1boy, adult male, detective, 1980s hong kong police station',
      negativePrompt: 'old man, police uniform, text',
      resolution: 'separate'
    });
  });

  it('serializes NovelAI V4 scenes as a counted base prompt plus isolated character prompts', () => {
    const dialect = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (preset) => preset.dialectPresetId === 'builtin-dialect-novelai'
    )!;
    const sceneSemantic: SemanticImagePrompt = {
      positive: '',
      negative: '',
      segments: [
        {
          segmentId: 'subject:scene', kind: 'subject', priority: 40,
          positive: 'rainy hong kong office', negative: 'modern computers', required: true
        },
        {
          segmentId: 'character-identity:actor_chan', kind: 'character-identity', priority: 50,
          positive: '35岁男性警探', negative: '', required: true
        },
        {
          segmentId: 'scene-appearance:actor_chan', kind: 'scene-appearance', priority: 60,
          positive: '湿透的深灰衬衫', negative: '', required: false
        },
        {
          segmentId: 'character-identity:actor_mei', kind: 'character-identity', priority: 50,
          positive: '30岁女性报案人', negative: '', required: true
        },
        {
          segmentId: 'persistent-requirement:actor_mei', kind: 'persistent-requirement', priority: 70,
          positive: '保留红色发带', negative: '', required: false
        },
        {
          segmentId: 'style:0', kind: 'style', priority: 20,
          positive: '1980年代犯罪动画', negative: '现代数码感', required: false
        }
      ]
    };
    const formatted = compileFormattedProviderPrompt(sceneSemantic, dialect, {
      segments: [
        { segmentId: 'style:0', positive: 'retro 1980s crime anime', negative: 'modern digital look' },
        { segmentId: 'character-identity:actor_mei', positive: '1girl, adult female, reporting person', negative: '' },
        { segmentId: 'subject:scene', positive: 'rainy hong kong office', negative: 'modern computers' },
        { segmentId: 'persistent-requirement:actor_mei', positive: 'red hair ribbon', negative: '' },
        { segmentId: 'scene-appearance:actor_chan', positive: 'soaked dark gray shirt', negative: '' },
        { segmentId: 'character-identity:actor_chan', positive: '1man, adult male, detective', negative: '' }
      ]
    });

    expect(formatted.positive).toBe(
      '1boy, 1girl, rainy hong kong office, retro 1980s crime anime | boy, adult male, detective, soaked dark gray shirt | girl, adult female, reporting person, red hair ribbon'
    );
    expect(formatted.positive).not.toContain('1man');
    expect(formatted.positive.split(' | ')).toHaveLength(3);
  });

  it('keeps the validated flat NovelAI prompt when a character lacks an official subject tag', () => {
    const dialect = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (preset) => preset.dialectPresetId === 'builtin-dialect-novelai'
    )!;
    const sceneSemantic: SemanticImagePrompt = {
      positive: '',
      negative: '',
      segments: [
        {
          segmentId: 'subject:scene', kind: 'subject', priority: 40,
          positive: 'rainy office', negative: '', required: true
        },
        {
          segmentId: 'character-identity:actor_unknown', kind: 'character-identity', priority: 50,
          positive: '成年报案人', negative: '', required: true
        }
      ]
    };
    const formatted = compileFormattedProviderPrompt(sceneSemantic, dialect, {
      segments: [
        { segmentId: 'subject:scene', positive: 'rainy office', negative: '' },
        {
          segmentId: 'character-identity:actor_unknown',
          positive: 'adult reporting person',
          negative: ''
        }
      ]
    });

    expect(formatted.positive).toBe('rainy office, adult reporting person');
    expect(formatted.positive).not.toContain(' | ');
  });

  it('refuses malformed formatted output even when called outside the conversion probe', () => {
    const dialect = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS[0]!;
    expect(() => compileFormattedProviderPrompt(semantic, dialect, {
      segments: [
        {
          segmentId: 'subject:character',
          positive: 'detective',
          negative: 'modern cars'
        },
        {
          segmentId: 'invented:segment',
          positive: 'invented content',
          negative: ''
        }
      ]
    })).toThrow(/新增了未允许的 segmentId invented:segment/);
  });
});
