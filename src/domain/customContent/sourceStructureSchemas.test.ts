import { describe, expect, it } from 'vitest';
import type { CustomSourceStructure } from './assetTypes';
import {
  parseCustomSourceChapter,
  parseCustomSourceChunk,
  parseCustomSourceStructure
} from './sourceStructureSchemas';

const checksumA = 'a'.repeat(64);
const checksumB = 'b'.repeat(64);
const timestamp = '2026-07-26T06:00:00.000Z';

function structureFixture(): CustomSourceStructure {
  return {
    sourceStructureId: 'structure-source-1-parser-v1',
    sourceDocumentId: 'source-1',
    parserVersion: 'phase8-v1',
    offsetUnit: 'utf16_code_unit',
    canonicalTextChecksum: checksumA,
    characterCount: 200,
    estimatedTokenCount: 120,
    tokenEstimator: 'approximate_mixed_text_v1',
    chapters: [
      {
        chapterId: 'chapter-1',
        sourceStructureId: 'structure-source-1-parser-v1',
        sourceDocumentId: 'source-1',
        sequence: 0,
        title: '第一章',
        detectionMethod: 'explicit_heading',
        sourceSpan: {
          sourceDocumentId: 'source-1',
          startOffset: 0,
          endOffset: 100,
          chapterId: 'chapter-1',
          sequence: 0,
          checksum: checksumA
        },
        characterCount: 100,
        estimatedTokenCount: 65,
        tokenEstimator: 'approximate_mixed_text_v1'
      },
      {
        chapterId: 'chapter-2',
        sourceStructureId: 'structure-source-1-parser-v1',
        sourceDocumentId: 'source-1',
        sequence: 1,
        title: '第二章',
        detectionMethod: 'explicit_heading',
        sourceSpan: {
          sourceDocumentId: 'source-1',
          startOffset: 100,
          endOffset: 200,
          chapterId: 'chapter-2',
          sequence: 1,
          checksum: checksumB
        },
        characterCount: 100,
        estimatedTokenCount: 60,
        tokenEstimator: 'approximate_mixed_text_v1'
      }
    ],
    chunks: [
      {
        chunkId: 'chunk-1',
        sourceStructureId: 'structure-source-1-parser-v1',
        sourceDocumentId: 'source-1',
        chapterId: 'chapter-1',
        sequence: 0,
        chapterSequence: 0,
        boundaryKind: 'paragraph_boundary',
        sourceSpan: {
          sourceDocumentId: 'source-1',
          startOffset: 0,
          endOffset: 60,
          chapterId: 'chapter-1',
          sequence: 0,
          checksum: checksumA
        },
        characterCount: 60,
        estimatedTokenCount: 40,
        tokenEstimator: 'approximate_mixed_text_v1',
        overlapBeforeCharacterCount: 0,
        overlapAfterCharacterCount: 10
      },
      {
        chunkId: 'chunk-2',
        sourceStructureId: 'structure-source-1-parser-v1',
        sourceDocumentId: 'source-1',
        chapterId: 'chapter-1',
        sequence: 1,
        chapterSequence: 1,
        boundaryKind: 'chapter_boundary',
        sourceSpan: {
          sourceDocumentId: 'source-1',
          startOffset: 50,
          endOffset: 100,
          chapterId: 'chapter-1',
          sequence: 1,
          checksum: checksumB
        },
        characterCount: 50,
        estimatedTokenCount: 35,
        tokenEstimator: 'approximate_mixed_text_v1',
        overlapBeforeCharacterCount: 10,
        overlapAfterCharacterCount: 0
      },
      {
        chunkId: 'chunk-3',
        sourceStructureId: 'structure-source-1-parser-v1',
        sourceDocumentId: 'source-1',
        chapterId: 'chapter-2',
        sequence: 2,
        chapterSequence: 0,
        boundaryKind: 'chapter_boundary',
        sourceSpan: {
          sourceDocumentId: 'source-1',
          startOffset: 100,
          endOffset: 200,
          chapterId: 'chapter-2',
          sequence: 2,
          checksum: checksumA
        },
        characterCount: 100,
        estimatedTokenCount: 60,
        tokenEstimator: 'approximate_mixed_text_v1',
        overlapBeforeCharacterCount: 0,
        overlapAfterCharacterCount: 0
      }
    ],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe('custom source chapter and chunk schemas', () => {
  it('accepts a dependency-free index that references one canonical source text', () => {
    const parsed = parseCustomSourceStructure(structureFixture());

    expect(parsed).toMatchObject({
      offsetUnit: 'utf16_code_unit',
      characterCount: 200
    });
    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chunks).toHaveLength(3);
    expect(parsed.chunks.some((chunk) => 'text' in chunk)).toBe(false);
  });

  it('keeps large-source offsets valid without a one-million-character ceiling', () => {
    const structure = structureFixture();
    structure.characterCount = 1_200_000;
    structure.chapters = [
      {
        ...structure.chapters[0],
        sourceSpan: {
          ...structure.chapters[0].sourceSpan,
          endOffset: 1_200_000
        },
        characterCount: 1_200_000
      }
    ];
    structure.chunks = [
      {
        ...structure.chunks[0],
        boundaryKind: 'size_limit',
        sourceSpan: {
          ...structure.chunks[0].sourceSpan,
          endOffset: 1_200_000
        },
        characterCount: 1_200_000,
        overlapAfterCharacterCount: 0
      }
    ];

    expect(parseCustomSourceStructure(structure).characterCount).toBe(
      1_200_000
    );
  });

  it('rejects duplicated source text and unknown fields', () => {
    const chapter = {
      ...structureFixture().chapters[0],
      text: '不得复制到章节记录'
    };
    const chunk = {
      ...structureFixture().chunks[0],
      text: '不得复制到分块记录'
    };

    expect(() => parseCustomSourceChapter(chapter)).toThrow();
    expect(() => parseCustomSourceChunk(chunk)).toThrow();
  });

  it('rejects gaps in chapter or chunk coverage', () => {
    const chapterGap = structureFixture();
    chapterGap.chapters[1].sourceSpan.startOffset = 110;
    chapterGap.chapters[1].characterCount = 90;
    expect(() => parseCustomSourceStructure(chapterGap)).toThrow(
      '章节范围必须连续覆盖'
    );

    const chunkGap = structureFixture();
    chunkGap.chunks[1].sourceSpan.startOffset = 70;
    chunkGap.chunks[1].characterCount = 30;
    chunkGap.chunks[0].overlapAfterCharacterCount = 0;
    chunkGap.chunks[1].overlapBeforeCharacterCount = 0;
    expect(() => parseCustomSourceStructure(chunkGap)).toThrow(
      '章节内分块不能留下'
    );
  });

  it('rejects inconsistent overlap accounting and chapter ownership', () => {
    const badOverlap = structureFixture();
    badOverlap.chunks[0].overlapAfterCharacterCount = 9;
    expect(() => parseCustomSourceStructure(badOverlap)).toThrow(
      '分块后向重叠量'
    );

    const badOwner = structureFixture();
    badOwner.chunks[0].chapterId = 'missing-chapter';
    badOwner.chunks[0].sourceSpan.chapterId = 'missing-chapter';
    expect(() => parseCustomSourceStructure(badOwner)).toThrow(
      '不存在的章节'
    );
  });

  it('rejects mismatched span lengths and non-contiguous sequences', () => {
    const wrongLength = structureFixture().chapters[0];
    wrongLength.characterCount = 99;
    expect(() => parseCustomSourceChapter(wrongLength)).toThrow(
      'characterCount'
    );

    const wrongSequence = structureFixture();
    wrongSequence.chunks[1].sequence = 3;
    wrongSequence.chunks[1].sourceSpan.sequence = 3;
    expect(() => parseCustomSourceStructure(wrongSequence)).toThrow(
      '分块 sequence'
    );
  });

  it('rejects globally out-of-order or non-progressing chunks', () => {
    const outOfOrder = structureFixture();
    outOfOrder.chunks = [
      outOfOrder.chunks[0],
      outOfOrder.chunks[2],
      outOfOrder.chunks[1]
    ].map((chunk, sequence) => ({
      ...chunk,
      sequence,
      sourceSpan: { ...chunk.sourceSpan, sequence }
    }));
    expect(() => parseCustomSourceStructure(outOfOrder)).toThrow(
      '全局分块必须按'
    );

    const nonProgressing = structureFixture();
    nonProgressing.chunks[1].sourceSpan.endOffset = 55;
    nonProgressing.chunks[1].characterCount = 5;
    nonProgressing.chunks[0].overlapAfterCharacterCount = 10;
    nonProgressing.chunks[1].overlapBeforeCharacterCount = 10;
    expect(() => parseCustomSourceStructure(nonProgressing)).toThrow(
      '必须推进已覆盖'
    );
  });
});
