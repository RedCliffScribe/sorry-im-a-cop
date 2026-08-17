import { describe, expect, it } from 'vitest';
import { parseA1111Metadata } from './a1111Parser';
import { parseComfyUiMetadata } from './comfyUiParser';
import { parseGenericMetadata } from './genericParser';
import { parseNovelAiMetadata, parseNovelAiStealthText } from './novelAiParser';

describe('PNG generation metadata parsers', () => {
  it('parses A1111 prompt, negative prompt and portable parameter draft sources', () => {
    const parsed = parseA1111Metadata({
      parameters: [([
        '1girl, by wlop, cinematic lighting, <lora:test:0.7>',
        'Negative prompt: lowres, bad hands',
        'Steps: 28, Sampler: DPM++ 2M, CFG scale: 6.5, Seed: 42, Size: 768x1024, Model: local.safetensors, Clip skip: 2'
      ]).join('\n')]
    });
    expect(parsed).toMatchObject({
      source: 'a1111',
      positivePrompt: '1girl, by wlop, cinematic lighting, <lora:test:0.7>',
      negativePrompt: 'lowres, bad hands',
      parameters: {
        steps: 28,
        sampler: 'DPM++ 2M',
        cfg: 6.5,
        seed: 42,
        width: 768,
        height: 1024,
        clipSkip: 2,
        loras: ['<lora:test:0.7>']
      }
    });
  });

  it('parses normal NovelAI Description and nested Comment metadata', () => {
    const parsed = parseNovelAiMetadata({
      Software: ['NovelAI'],
      Description: ['artist:toi8, film grain'],
      Comment: [JSON.stringify({ uc: 'lowres', steps: 30, scale: 5, sampler: 'k_euler' })]
    });
    expect(parsed).toMatchObject({
      source: 'novelai',
      positivePrompt: 'artist:toi8, film grain',
      negativePrompt: 'lowres',
      parameters: { steps: 30, cfg: 5, sampler: 'k_euler' }
    });
  });

  it('parses NovelAI stealth JSON with a stringified Comment', () => {
    const parsed = parseNovelAiStealthText(JSON.stringify({
      Software: 'NovelAI',
      Description: 'soft painterly shading',
      Comment: JSON.stringify({ uc: 'bad anatomy', seed: 9 })
    }));
    expect(parsed).toMatchObject({
      positivePrompt: 'soft painterly shading',
      negativePrompt: 'bad anatomy',
      parameters: { seed: 9 }
    });
  });

  it('rejects malformed NovelAI stealth JSON instead of guessing fields', () => {
    expect(() => parseNovelAiStealthText('not-json')).toThrow('不是有效 JSON');
  });

  it('resolves ComfyUI prompt links without executing the workflow', () => {
    const parsed = parseComfyUiMetadata({
      prompt: [JSON.stringify({
        '1': { class_type: 'CLIPTextEncode', inputs: { text: 'cinematic lighting' } },
        '2': { class_type: 'CLIPTextEncode', inputs: { text: 'lowres' } },
        '3': {
          class_type: 'KSampler',
          inputs: {
            positive: ['1', 0],
            negative: ['2', 0],
            steps: 24,
            cfg: 7,
            sampler_name: 'dpmpp_2m',
            seed: 17
          }
        }
      })],
      workflow: [JSON.stringify({ nodes: [{ id: 1, type: 'CLIPTextEncode' }] })]
    });
    expect(parsed).toMatchObject({
      source: 'comfyui',
      positivePrompt: 'cinematic lighting',
      negativePrompt: 'lowres',
      parameters: { steps: 24, cfg: 7, sampler: 'dpmpp_2m', seed: 17 }
    });
  });

  it('does not guess prompts from an ambiguous ComfyUI canvas workflow', () => {
    const parsed = parseComfyUiMetadata({
      workflow: [JSON.stringify({ nodes: [{ id: 1, type: 'CLIPTextEncode', widgets_values: ['maybe'] }] })]
    });
    expect(parsed?.positivePrompt).toBe('');
    expect(parsed?.warnings.join(' ')).toContain('无法');
  });

  it('does not mistake a generic plain prompt chunk for a ComfyUI graph', () => {
    const chunks = { prompt: ['soft painterly shading, film grain'] };
    expect(parseComfyUiMetadata(chunks)).toBeUndefined();
    expect(parseGenericMetadata(chunks)).toMatchObject({
      source: 'unknown',
      positivePrompt: 'soft painterly shading, film grain'
    });
  });
});
