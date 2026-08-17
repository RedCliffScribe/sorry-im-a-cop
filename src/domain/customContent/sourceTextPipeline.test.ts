import { describe, expect, it } from 'vitest';
import {
  canonicalizeCustomSourceText,
  decodeCustomSourceTextBlob,
  estimateCustomSourceTokens,
  parseCustomSourceBlob,
  parseCustomSourceText
} from './sourceTextPipeline';

const timestamp = '2026-07-26T08:00:00.000Z';

describe('custom source text pipeline', () => {
  it('canonicalizes BOM and line endings before identifying Markdown chapters', async () => {
    const result = await parseCustomSourceText({
      sourceDocumentId: 'source-markdown-1',
      sourceFormat: 'markdown',
      text:
        '\uFEFF# 全书标题\r\n\r\n导言。\r\n\r\n' +
        '## 第一章\r\n第一章正文。\r\n\r\n' +
        '## 第二章\r\n第二章正文。',
      timestamp
    });

    expect(result.canonicalText).not.toContain('\r');
    expect(result.canonicalText.startsWith('# 全书标题')).toBe(true);
    expect(result.structure.chapters).toHaveLength(3);
    expect(
      result.structure.chapters.map((chapter) => chapter.detectionMethod)
    ).toEqual(['fallback', 'markdown_heading', 'markdown_heading']);
    expect(
      result.structure.chapters.map((chapter) => chapter.title)
    ).toEqual([undefined, '第一章', '第二章']);
    expect(result.structure.chapters[0].sourceSpan.startOffset).toBe(0);
    expect(result.structure.chapters.at(-1)?.sourceSpan.endOffset).toBe(
      result.canonicalText.length
    );
  });

  it('uses structural TXT headings while ignoring headings inside fenced Markdown', async () => {
    const txt = await parseCustomSourceText({
      sourceDocumentId: 'source-txt-1',
      sourceFormat: 'txt',
      text: '前言\n说明\n\n第一章 起点\n正文\n\n第二章 转折\n正文',
      timestamp
    });
    expect(txt.structure.chapters.map((chapter) => chapter.title)).toEqual([
      '前言',
      '第一章 起点',
      '第二章 转折'
    ]);
    expect(
      txt.structure.chapters.every(
        (chapter) => chapter.detectionMethod === 'explicit_heading'
      )
    ).toBe(true);

    const markdown = await parseCustomSourceText({
      sourceDocumentId: 'source-markdown-fence',
      sourceFormat: 'markdown',
      text:
        '# 第一章\n正文\n\n```md\n# 伪章节\n```\n\n' +
        '# 第二章\n正文',
      timestamp
    });
    expect(markdown.structure.chapters.map((chapter) => chapter.title)).toEqual([
      '第一章',
      '第二章'
    ]);
  });

  it('estimates mixed text deterministically and chunks within the configured token budget', async () => {
    expect(estimateCustomSourceTokens('abcd efgh')).toBe(2);
    expect(estimateCustomSourceTokens('香港 police 1988！')).toBe(6);

    const sentences = Array.from(
      { length: 30 },
      (_, index) => `第${index + 1}句包含一些文字。`
    ).join('');
    const result = await parseCustomSourceText({
      sourceDocumentId: 'source-chunking-1',
      sourceFormat: 'txt',
      text: sentences,
      chunking: {
        targetTokenCount: 25,
        maxTokenCount: 32,
        overlapTokenCount: 5
      },
      timestamp
    });

    expect(result.structure.chunks.length).toBeGreaterThan(1);
    expect(
      result.structure.chunks.every(
        (chunk) => chunk.estimatedTokenCount <= 32
      )
    ).toBe(true);
    expect(
      result.structure.chunks.some(
        (chunk) => chunk.boundaryKind === 'sentence_boundary'
      )
    ).toBe(true);
    expect(
      result.structure.chunks.slice(1).every(
        (chunk) => chunk.overlapBeforeCharacterCount > 0
      )
    ).toBe(true);
  });

  it('creates stable identities from source content, parser version and chunking options', async () => {
    const base = {
      sourceDocumentId: 'source-stable-1',
      sourceFormat: 'txt' as const,
      text: '第一章\n稳定正文。',
      timestamp
    };
    const first = await parseCustomSourceText(base);
    const second = await parseCustomSourceText({
      ...base,
      timestamp: '2026-07-27T08:00:00.000Z'
    });
    const changed = await parseCustomSourceText({
      ...base,
      text: `${base.text}\n新增内容。`
    });

    expect(second.structure.sourceStructureId).toBe(
      first.structure.sourceStructureId
    );
    expect(second.structure.chapters[0].chapterId).toBe(
      first.structure.chapters[0].chapterId
    );
    expect(changed.structure.sourceStructureId).not.toBe(
      first.structure.sourceStructureId
    );
  });

  it('decodes UTF-16 BOM input and rejects invalid UTF-8', async () => {
    const utf16Bytes = new Uint8Array([
      0xff,
      0xfe,
      0x2c,
      0x7b,
      0x00,
      0x4e
    ]);
    const decoded = await decodeCustomSourceTextBlob(
      new Blob([utf16Bytes])
    );
    expect(decoded).toBe('第一');

    const parsed = await parseCustomSourceBlob({
      sourceDocumentId: 'source-blob-1',
      sourceFormat: 'txt',
      blob: new Blob(['第一章\r\n正文']),
      timestamp
    });
    expect(parsed.canonicalText).toBe('第一章\n正文');

    await expect(
      decodeCustomSourceTextBlob(
        new Blob([new Uint8Array([0xc3, 0x28])]),
        'utf-8'
      )
    ).rejects.toThrow('无法按 utf-8 解码');
  });

  it('does not impose a one-million-character ceiling', async () => {
    const result = await parseCustomSourceText({
      sourceDocumentId: 'source-large-1',
      sourceFormat: 'txt',
      text: 'a'.repeat(1_200_000),
      timestamp
    });

    expect(result.structure.characterCount).toBe(1_200_000);
    expect(result.structure.chunks.length).toBeGreaterThan(100);
    expect(
      result.structure.chunks.every(
        (chunk) => chunk.estimatedTokenCount <= 1_200
      )
    ).toBe(true);
  }, 20_000);

  it('rejects empty input and unsafe chunking configurations', async () => {
    await expect(
      parseCustomSourceText({
        sourceDocumentId: 'source-empty',
        sourceFormat: 'txt',
        text: ' \r\n ',
        timestamp
      })
    ).rejects.toThrow('不能为空');
    await expect(
      parseCustomSourceText({
        sourceDocumentId: 'source-bad-options',
        sourceFormat: 'txt',
        text: '有效文本',
        chunking: {
          targetTokenCount: 10,
          maxTokenCount: 9,
          overlapTokenCount: 2
        },
        timestamp
      })
    ).rejects.toThrow('maxTokenCount');
  });

  it('exposes canonicalization as an idempotent operation', () => {
    const canonical = canonicalizeCustomSourceText('\uFEFF甲\r\n乙\r丙');
    expect(canonical).toBe('甲\n乙\n丙');
    expect(canonicalizeCustomSourceText(canonical)).toBe(canonical);
  });
});
