import { z } from 'zod';
import type {
  CustomSourceChapter,
  CustomSourceChunk,
  CustomSourceStructure
} from './assetTypes';
import { customContentSourceSpanSchema } from './contentPackageSchemas';

export const customSourceChapterDetectionMethods = [
  'explicit_heading',
  'markdown_heading',
  'epub_navigation',
  'epub_spine',
  'fallback'
] as const;

export const customSourceChunkBoundaryKinds = [
  'chapter_boundary',
  'paragraph_boundary',
  'sentence_boundary',
  'size_limit'
] as const;

export const customSourceTokenEstimators = [
  'approximate_mixed_text_v1'
] as const;

const stableIdSchema = z.string().trim().min(1).max(256);
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);
const positiveTextSpanSchema = customContentSourceSpanSchema.refine(
  (span) => span.endOffset > span.startOffset,
  {
    message: '原文范围 endOffset 必须大于 startOffset。'
  }
);

export const customSourceChapterSchema = z
  .strictObject({
    chapterId: stableIdSchema,
    sourceStructureId: stableIdSchema,
    sourceDocumentId: stableIdSchema,
    sequence: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(500).optional(),
    detectionMethod: z.enum(customSourceChapterDetectionMethods),
    sourceSpan: positiveTextSpanSchema,
    characterCount: z.number().int().positive(),
    estimatedTokenCount: z.number().int().positive(),
    tokenEstimator: z.enum(customSourceTokenEstimators)
  })
  .superRefine((chapter, context) => {
    if (chapter.sourceSpan.sourceDocumentId !== chapter.sourceDocumentId) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSpan', 'sourceDocumentId'],
        message: '章节原文范围必须属于同一 sourceDocumentId。'
      });
    }
    if (chapter.sourceSpan.chapterId !== chapter.chapterId) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSpan', 'chapterId'],
        message: '章节原文范围必须引用当前 chapterId。'
      });
    }
    if (chapter.sourceSpan.sequence !== chapter.sequence) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSpan', 'sequence'],
        message: '章节原文范围 sequence 必须与章节 sequence 一致。'
      });
    }
    if (
      chapter.characterCount !==
      chapter.sourceSpan.endOffset - chapter.sourceSpan.startOffset
    ) {
      context.addIssue({
        code: 'custom',
        path: ['characterCount'],
        message: '章节 characterCount 必须等于原文范围长度。'
      });
    }
  });

export const customSourceChunkSchema = z
  .strictObject({
    chunkId: stableIdSchema,
    sourceStructureId: stableIdSchema,
    sourceDocumentId: stableIdSchema,
    chapterId: stableIdSchema,
    sequence: z.number().int().nonnegative(),
    chapterSequence: z.number().int().nonnegative(),
    boundaryKind: z.enum(customSourceChunkBoundaryKinds),
    sourceSpan: positiveTextSpanSchema,
    characterCount: z.number().int().positive(),
    estimatedTokenCount: z.number().int().positive(),
    tokenEstimator: z.enum(customSourceTokenEstimators),
    overlapBeforeCharacterCount: z.number().int().nonnegative(),
    overlapAfterCharacterCount: z.number().int().nonnegative()
  })
  .superRefine((chunk, context) => {
    if (chunk.sourceSpan.sourceDocumentId !== chunk.sourceDocumentId) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSpan', 'sourceDocumentId'],
        message: '分块原文范围必须属于同一 sourceDocumentId。'
      });
    }
    if (chunk.sourceSpan.chapterId !== chunk.chapterId) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSpan', 'chapterId'],
        message: '分块原文范围必须引用当前 chapterId。'
      });
    }
    if (chunk.sourceSpan.sequence !== chunk.sequence) {
      context.addIssue({
        code: 'custom',
        path: ['sourceSpan', 'sequence'],
        message: '分块原文范围 sequence 必须与全局分块 sequence 一致。'
      });
    }
    if (
      chunk.characterCount !==
      chunk.sourceSpan.endOffset - chunk.sourceSpan.startOffset
    ) {
      context.addIssue({
        code: 'custom',
        path: ['characterCount'],
        message: '分块 characterCount 必须等于原文范围长度。'
      });
    }
  });

export const customSourceStructureSchema = z
  .strictObject({
    sourceStructureId: stableIdSchema,
    sourceDocumentId: stableIdSchema,
    parserVersion: z.string().trim().min(1).max(64),
    offsetUnit: z.literal('utf16_code_unit'),
    canonicalTextChecksum: checksumSchema,
    characterCount: z.number().int().positive(),
    estimatedTokenCount: z.number().int().positive(),
    tokenEstimator: z.enum(customSourceTokenEstimators),
    chapters: z.array(customSourceChapterSchema).min(1),
    chunks: z.array(customSourceChunkSchema).min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .superRefine((structure, context) => {
    const chapterIds = new Set<string>();
    let previousChapterEnd = 0;
    for (const [index, chapter] of structure.chapters.entries()) {
      if (chapterIds.has(chapter.chapterId)) {
        context.addIssue({
          code: 'custom',
          path: ['chapters', index, 'chapterId'],
          message: `章节 ID 重复：${chapter.chapterId}`
        });
      }
      chapterIds.add(chapter.chapterId);
      if (
        chapter.sourceStructureId !== structure.sourceStructureId ||
        chapter.sourceDocumentId !== structure.sourceDocumentId
      ) {
        context.addIssue({
          code: 'custom',
          path: ['chapters', index],
          message: '章节必须属于当前原文解析结构。'
        });
      }
      if (chapter.sequence !== index) {
        context.addIssue({
          code: 'custom',
          path: ['chapters', index, 'sequence'],
          message: '章节 sequence 必须从 0 连续递增并与数组顺序一致。'
        });
      }
      if (chapter.sourceSpan.startOffset !== previousChapterEnd) {
        context.addIssue({
          code: 'custom',
          path: ['chapters', index, 'sourceSpan', 'startOffset'],
          message: '章节范围必须连续覆盖规范化原文，不能重叠或留空。'
        });
      }
      previousChapterEnd = chapter.sourceSpan.endOffset;
    }
    if (previousChapterEnd !== structure.characterCount) {
      context.addIssue({
        code: 'custom',
        path: ['chapters'],
        message: '章节范围必须从 0 连续覆盖到完整 characterCount。'
      });
    }

    const chunkIds = new Set<string>();
    const chunksByChapter = new Map<
      string,
      Array<{ chunk: CustomSourceChunk; structureIndex: number }>
    >();
    let previousChunkStart = -1;
    for (const [index, chunk] of structure.chunks.entries()) {
      if (chunkIds.has(chunk.chunkId)) {
        context.addIssue({
          code: 'custom',
          path: ['chunks', index, 'chunkId'],
          message: `分块 ID 重复：${chunk.chunkId}`
        });
      }
      chunkIds.add(chunk.chunkId);
      if (
        chunk.sourceStructureId !== structure.sourceStructureId ||
        chunk.sourceDocumentId !== structure.sourceDocumentId
      ) {
        context.addIssue({
          code: 'custom',
          path: ['chunks', index],
          message: '分块必须属于当前原文解析结构。'
        });
      }
      if (chunk.sequence !== index) {
        context.addIssue({
          code: 'custom',
          path: ['chunks', index, 'sequence'],
          message: '分块 sequence 必须从 0 连续递增并与数组顺序一致。'
        });
      }
      if (chunk.sourceSpan.startOffset < previousChunkStart) {
        context.addIssue({
          code: 'custom',
          path: ['chunks', index, 'sourceSpan', 'startOffset'],
          message: '全局分块必须按规范化原文 offset 顺序排列。'
        });
      }
      previousChunkStart = chunk.sourceSpan.startOffset;
      if (!chapterIds.has(chunk.chapterId)) {
        context.addIssue({
          code: 'custom',
          path: ['chunks', index, 'chapterId'],
          message: `分块引用了不存在的章节：${chunk.chapterId}`
        });
      }
      const chapterChunks = chunksByChapter.get(chunk.chapterId) ?? [];
      chapterChunks.push({ chunk, structureIndex: index });
      chunksByChapter.set(chunk.chapterId, chapterChunks);
    }

    for (const [chapterIndex, chapter] of structure.chapters.entries()) {
      const chapterChunks = chunksByChapter.get(chapter.chapterId) ?? [];
      if (chapterChunks.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['chapters', chapterIndex],
          message: '每个章节至少需要一个原文分块。'
        });
        continue;
      }
      for (const [
        chunkIndex,
        { chunk, structureIndex }
      ] of chapterChunks.entries()) {
        if (chunk.chapterSequence !== chunkIndex) {
          context.addIssue({
            code: 'custom',
            path: ['chunks', structureIndex, 'chapterSequence'],
            message: '章节内分块 sequence 必须从 0 连续递增。'
          });
        }
        if (
          chunk.sourceSpan.startOffset < chapter.sourceSpan.startOffset ||
          chunk.sourceSpan.endOffset > chapter.sourceSpan.endOffset
        ) {
          context.addIssue({
            code: 'custom',
            path: ['chunks', structureIndex, 'sourceSpan'],
            message: '分块原文范围不能越出所属章节。'
          });
        }
        const previous = chapterChunks[chunkIndex - 1]?.chunk;
        const next = chapterChunks[chunkIndex + 1]?.chunk;
        const expectedBefore = previous
          ? Math.max(0, previous.sourceSpan.endOffset - chunk.sourceSpan.startOffset)
          : 0;
        const expectedAfter = next
          ? Math.max(0, chunk.sourceSpan.endOffset - next.sourceSpan.startOffset)
          : 0;
        if (chunk.overlapBeforeCharacterCount !== expectedBefore) {
          context.addIssue({
            code: 'custom',
            path: [
              'chunks',
              structureIndex,
              'overlapBeforeCharacterCount'
            ],
            message: '分块前向重叠量与相邻原文范围不一致。'
          });
        }
        if (chunk.overlapAfterCharacterCount !== expectedAfter) {
          context.addIssue({
            code: 'custom',
            path: [
              'chunks',
              structureIndex,
              'overlapAfterCharacterCount'
            ],
            message: '分块后向重叠量与相邻原文范围不一致。'
          });
        }
        if (
          previous &&
          chunk.sourceSpan.startOffset > previous.sourceSpan.endOffset
        ) {
          context.addIssue({
            code: 'custom',
            path: ['chunks', structureIndex, 'sourceSpan'],
            message: '章节内分块不能留下未覆盖的原文间隙。'
          });
        }
        if (
          previous &&
          chunk.sourceSpan.endOffset <= previous.sourceSpan.endOffset
        ) {
          context.addIssue({
            code: 'custom',
            path: ['chunks', structureIndex, 'sourceSpan', 'endOffset'],
            message: '章节内每个后续分块都必须推进已覆盖的原文终点。'
          });
        }
      }
      if (
        chapterChunks[0].chunk.sourceSpan.startOffset !==
          chapter.sourceSpan.startOffset ||
        chapterChunks.at(-1)?.chunk.sourceSpan.endOffset !==
          chapter.sourceSpan.endOffset
      ) {
        context.addIssue({
          code: 'custom',
          path: ['chapters', chapterIndex],
          message: '章节内分块必须覆盖完整章节范围。'
        });
      }
    }
  });

export function parseCustomSourceChapter(input: unknown): CustomSourceChapter {
  return customSourceChapterSchema.parse(input);
}

export function parseCustomSourceChunk(input: unknown): CustomSourceChunk {
  return customSourceChunkSchema.parse(input);
}

export function parseCustomSourceStructure(
  input: unknown
): CustomSourceStructure {
  return customSourceStructureSchema.parse(input);
}
