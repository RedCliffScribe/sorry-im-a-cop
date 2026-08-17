import { describe, expect, it } from 'vitest';
import {
  countVisibleNarrativeCharacters,
  createNarrativeLengthRetryPrompt,
  extractNarrativeText,
  measureNarrativeLength
} from './narrativeLengthGuard';

describe('narrativeLengthGuard', () => {
  it('counts visible Unicode characters while excluding display labels and whitespace', () => {
    expect(countVisibleNarrativeCharacters('【旁白】甲 乙\n【陈伟强】丙')).toBe(3);
    expect(countVisibleNarrativeCharacters('A 😀 B')).toBe(3);
  });

  it('uses the configured context minimum and only flags severe undershoot below seventy percent', () => {
    const severeTurn = measureNarrativeLength('字'.repeat(209), 'compact', 'turn');
    const boundaryTurn = measureNarrativeLength('字'.repeat(210), 'compact', 'turn');
    const standardOpening = measureNarrativeLength('字'.repeat(700), 'standard', 'opening');

    expect(severeTurn).toMatchObject({ actual: 209, minimum: 300, retryBelow: 210, severelyShort: true });
    expect(boundaryTurn).toMatchObject({ actual: 210, minimum: 300, retryBelow: 210, severelyShort: false });
    expect(standardOpening).toMatchObject({ minimum: 900, retryBelow: 630, severelyShort: false });
  });

  it('extracts narrative text without trying to parse prose', () => {
    expect(extractNarrativeText({ narrativeText: '正文' })).toBe('正文');
    expect(extractNarrativeText({ narrativeText: 123 })).toBeUndefined();
    expect(extractNarrativeText('正文')).toBeUndefined();
  });

  it('asks for one complete JSON regeneration instead of continuation or polishing', () => {
    const measurement = measureNarrativeLength('短'.repeat(100), 'standard', 'turn');
    const prompt = createNarrativeLengthRetryPrompt('ORIGINAL_PROMPT', measurement);

    expect(prompt).toContain('ORIGINAL_PROMPT');
    expect(prompt).toContain('上一份候选正文只有 100 个可见字符');
    expect(prompt).toContain('从头重新生成完整 JSON object');
    expect(prompt).toContain('不得低于 500 个字符');
    expect(prompt).toContain('不要续写、拼接或只返回补充段落');
    expect(prompt).toContain('上一份候选不会写入存档');
  });
});
