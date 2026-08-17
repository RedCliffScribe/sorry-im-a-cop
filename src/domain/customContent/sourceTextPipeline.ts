import type {
  CustomSourceChapter,
  CustomSourceChapterDetectionMethod,
  CustomSourceChunk,
  CustomSourceChunkBoundaryKind,
  CustomSourceStructure
} from './assetTypes';
import {
  createCustomContentChecksum,
  createCustomContentTextChecksum
} from './checksum';
import { extractCustomEpub } from './epubSourceParser';
import { parseCustomSourceStructure } from './sourceStructureSchemas';

export const CUSTOM_SOURCE_TEXT_PARSER_VERSION = 'phase8-source-text-v1';

export const DEFAULT_CUSTOM_SOURCE_CHUNKING_OPTIONS = Object.freeze({
  targetTokenCount: 900,
  maxTokenCount: 1_200,
  overlapTokenCount: 120
});

export type CustomSourceTextFormat = 'txt' | 'markdown';
export type CustomSourceFormat = CustomSourceTextFormat | 'epub';
export type CustomSourceTextEncoding =
  | 'auto'
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be';

export interface CustomSourceChunkingOptions {
  targetTokenCount: number;
  maxTokenCount: number;
  overlapTokenCount: number;
}

export interface ParseCustomSourceTextInput {
  sourceDocumentId: string;
  sourceFormat: CustomSourceTextFormat;
  text: string;
  parserVersion?: string;
  chunking?: Partial<CustomSourceChunkingOptions>;
  timestamp?: string;
}

export interface ParseCustomSourceBlobInput {
  sourceDocumentId: string;
  sourceFormat: CustomSourceFormat;
  blob: Blob;
  encoding?: CustomSourceTextEncoding;
  parserVersion?: string;
  chunking?: Partial<CustomSourceChunkingOptions>;
  timestamp?: string;
}

export interface ParsedCustomSourceText {
  canonicalText: string;
  structure: CustomSourceStructure;
}

interface SourceLine {
  startOffset: number;
  text: string;
}

interface ChapterCandidate {
  startOffset: number;
  title?: string;
  detectionMethod: CustomSourceChapterDetectionMethod;
  markdownLevel?: number;
}

interface ChapterRange extends ChapterCandidate {
  endOffset: number;
}

interface BuildParsedCustomSourceInput {
  sourceDocumentId: string;
  sourceFormat: CustomSourceFormat;
  canonicalText: string;
  chapterRanges: readonly ChapterRange[];
  parserVersion?: string;
  chunking?: Partial<CustomSourceChunkingOptions>;
  timestamp?: string;
}

interface ChunkBoundary {
  endOffset: number;
  boundaryKind: CustomSourceChunkBoundaryKind;
}

interface RawChunkRange {
  startOffset: number;
  endOffset: number;
  boundaryKind: CustomSourceChunkBoundaryKind;
}

const CHINESE_EXPLICIT_HEADING =
  /^(?:第[0-9〇零一二三四五六七八九十百千万两]+[章节卷部回幕篇集]|序章|序幕|楔子|引子|前言|后记|尾声)(?:[\s:：、.\-—].*)?$/u;
const ENGLISH_EXPLICIT_HEADING =
  /^(?:(?:chapter|part|book|section|act)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|prologue|epilogue)(?:[\s:.\-—].*)?$/i;
const SENTENCE_ENDINGS = new Set(['。', '！', '？', '!', '?', '；', ';']);
const SENTENCE_CLOSERS = new Set([
  '"',
  "'",
  '”',
  '’',
  ')',
  '）',
  ']',
  '】',
  '》',
  '〉',
  '」',
  '』'
]);

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} 必须是正整数。`);
  }
}

export function normalizeCustomSourceChunkingOptions(
  options: Partial<CustomSourceChunkingOptions> | undefined
): CustomSourceChunkingOptions {
  const normalized = {
    ...DEFAULT_CUSTOM_SOURCE_CHUNKING_OPTIONS,
    ...options
  };
  assertPositiveInteger(
    normalized.targetTokenCount,
    'targetTokenCount'
  );
  assertPositiveInteger(normalized.maxTokenCount, 'maxTokenCount');
  if (
    !Number.isInteger(normalized.overlapTokenCount) ||
    normalized.overlapTokenCount < 0
  ) {
    throw new TypeError('overlapTokenCount 必须是非负整数。');
  }
  if (normalized.maxTokenCount < normalized.targetTokenCount) {
    throw new RangeError(
      'maxTokenCount 不能小于 targetTokenCount。'
    );
  }
  if (normalized.overlapTokenCount >= normalized.targetTokenCount) {
    throw new RangeError(
      'overlapTokenCount 必须小于 targetTokenCount。'
    );
  }
  return normalized;
}

export function canonicalizeCustomSourceText(text: string): string {
  return text.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
}

function isAsciiWordCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

export function estimateCustomSourceTokens(text: string): number {
  let tokens = 0;
  let index = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (/\s/u.test(text[index])) {
      index += 1;
      continue;
    }
    if (isAsciiWordCode(code)) {
      const start = index;
      index += 1;
      while (
        index < text.length &&
        isAsciiWordCode(text.charCodeAt(index))
      ) {
        index += 1;
      }
      tokens += Math.ceil((index - start) / 4);
      continue;
    }
    const codePoint = text.codePointAt(index);
    tokens += 1;
    index += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
  }
  return tokens;
}

function storedTokenEstimate(text: string): number {
  return Math.max(1, estimateCustomSourceTokens(text));
}

function collectSourceLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let startOffset = 0;
  while (startOffset < text.length) {
    const newlineOffset = text.indexOf('\n', startOffset);
    const endOffset =
      newlineOffset === -1 ? text.length : newlineOffset;
    lines.push({
      startOffset,
      text: text.slice(startOffset, endOffset)
    });
    if (newlineOffset === -1) break;
    startOffset = newlineOffset + 1;
  }
  return lines;
}

function collectMarkdownHeadingCandidates(
  lines: readonly SourceLine[]
): ChapterCandidate[] {
  const candidates: ChapterCandidate[] = [];
  let fence: { marker: '`' | '~'; length: number } | undefined;

  for (const line of lines) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line.text);
    if (fenceMatch) {
      const run = fenceMatch[1];
      const marker = run[0] as '`' | '~';
      if (fence) {
        if (
          marker === fence.marker &&
          run.length >= fence.length &&
          fenceMatch[2].trim().length === 0
        ) {
          fence = undefined;
        }
      } else {
        fence = { marker, length: run.length };
      }
      continue;
    }
    if (fence) continue;

    const headingMatch = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/u.exec(
      line.text
    );
    if (!headingMatch) continue;
    const title =
      headingMatch[2]
        .replace(/[ \t]+#+[ \t]*$/u, '')
        .trim() || undefined;
    candidates.push({
      startOffset: line.startOffset,
      title,
      detectionMethod: 'markdown_heading',
      markdownLevel: headingMatch[1].length
    });
  }
  return candidates;
}

function selectMarkdownChapterLevel(
  candidates: readonly ChapterCandidate[]
): ChapterCandidate[] {
  if (candidates.length === 0) return [];
  const levelCounts = new Map<number, number>();
  for (const candidate of candidates) {
    const level = candidate.markdownLevel ?? 6;
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
  }
  const levels = [...levelCounts.keys()].sort((left, right) => left - right);
  const selectedLevel =
    levels.find((level) => (levelCounts.get(level) ?? 0) >= 2) ?? levels[0];
  return candidates.filter(
    (candidate) => candidate.markdownLevel === selectedLevel
  );
}

function collectExplicitHeadingCandidates(
  lines: readonly SourceLine[]
): ChapterCandidate[] {
  const candidates: ChapterCandidate[] = [];
  let fence: { marker: '`' | '~'; length: number } | undefined;
  for (const line of lines) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line.text);
    if (fenceMatch) {
      const run = fenceMatch[1];
      const marker = run[0] as '`' | '~';
      if (fence) {
        if (
          marker === fence.marker &&
          run.length >= fence.length &&
          fenceMatch[2].trim().length === 0
        ) {
          fence = undefined;
        }
      } else {
        fence = { marker, length: run.length };
      }
      continue;
    }
    if (fence) continue;

    const title = line.text.trim();
    if (
      title.length === 0 ||
      title.length > 160 ||
      (!CHINESE_EXPLICIT_HEADING.test(title) &&
        !ENGLISH_EXPLICIT_HEADING.test(title))
    ) {
      continue;
    }
    candidates.push({
      startOffset: line.startOffset,
      title,
      detectionMethod: 'explicit_heading'
    });
  }
  return candidates;
}

function detectChapterCandidates(
  text: string,
  sourceFormat: CustomSourceTextFormat
): ChapterCandidate[] {
  const lines = collectSourceLines(text);
  const explicitCandidates = collectExplicitHeadingCandidates(lines);
  if (sourceFormat === 'txt') return explicitCandidates;

  const markdownCandidates = collectMarkdownHeadingCandidates(lines);
  const markdownChapters = selectMarkdownChapterLevel(markdownCandidates);
  if (markdownChapters.length >= 2) return markdownChapters;
  if (explicitCandidates.length >= 2) return explicitCandidates;
  if (markdownChapters.length > 0) return markdownChapters;
  return explicitCandidates;
}

function createChapterRanges(
  text: string,
  sourceFormat: CustomSourceTextFormat
): ChapterRange[] {
  const candidates = detectChapterCandidates(text, sourceFormat);
  if (candidates.length === 0) {
    return [
      {
        startOffset: 0,
        endOffset: text.length,
        detectionMethod: 'fallback'
      }
    ];
  }

  const ranges: ChapterRange[] = [];
  const firstCandidate = candidates[0];
  if (
    firstCandidate.startOffset > 0 &&
    text.slice(0, firstCandidate.startOffset).trim().length > 0
  ) {
    ranges.push({
      startOffset: 0,
      endOffset: firstCandidate.startOffset,
      detectionMethod: 'fallback'
    });
  }

  for (const [index, candidate] of candidates.entries()) {
    ranges.push({
      ...candidate,
      startOffset:
        index === 0 && ranges.length === 0 ? 0 : candidate.startOffset,
      endOffset:
        candidates[index + 1]?.startOffset ?? text.length
    });
  }
  return ranges;
}

function addChunkBoundary(
  boundaries: Map<number, CustomSourceChunkBoundaryKind>,
  endOffset: number,
  boundaryKind: CustomSourceChunkBoundaryKind
): void {
  const priority: Record<CustomSourceChunkBoundaryKind, number> = {
    size_limit: 0,
    sentence_boundary: 1,
    paragraph_boundary: 2,
    chapter_boundary: 3
  };
  const current = boundaries.get(endOffset);
  if (!current || priority[boundaryKind] > priority[current]) {
    boundaries.set(endOffset, boundaryKind);
  }
}

function collectChunkBoundaries(
  text: string,
  chapterStart: number,
  chapterEnd: number
): ChunkBoundary[] {
  const boundaries = new Map<number, CustomSourceChunkBoundaryKind>();
  let index = chapterStart;
  while (index < chapterEnd) {
    if (text[index] === '\n') {
      let endOffset = index + 1;
      while (endOffset < chapterEnd && text[endOffset] === '\n') {
        endOffset += 1;
      }
      if (endOffset - index >= 2) {
        addChunkBoundary(
          boundaries,
          endOffset,
          'paragraph_boundary'
        );
      }
      index = endOffset;
      continue;
    }

    const character = text[index];
    const isSentenceEnding =
      SENTENCE_ENDINGS.has(character) ||
      (character === '.' &&
        (index + 1 === chapterEnd || /\s/u.test(text[index + 1])));
    if (isSentenceEnding) {
      let endOffset = index + 1;
      while (
        endOffset < chapterEnd &&
        SENTENCE_CLOSERS.has(text[endOffset])
      ) {
        endOffset += 1;
      }
      while (
        endOffset < chapterEnd &&
        (text[endOffset] === ' ' || text[endOffset] === '\t')
      ) {
        endOffset += 1;
      }
      addChunkBoundary(
        boundaries,
        endOffset,
        'sentence_boundary'
      );
      index = endOffset;
      continue;
    }
    index += 1;
  }
  addChunkBoundary(boundaries, chapterEnd, 'chapter_boundary');
  return [...boundaries.entries()]
    .map(([endOffset, boundaryKind]) => ({ endOffset, boundaryKind }))
    .sort((left, right) => left.endOffset - right.endOffset);
}

function lowerBoundBoundary(
  boundaries: readonly ChunkBoundary[],
  startOffset: number
): number {
  let low = 0;
  let high = boundaries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (boundaries[middle].endOffset <= startOffset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function safeEndOffset(
  text: string,
  startOffset: number,
  candidate: number
): number {
  let endOffset = candidate;
  const previousCode = text.charCodeAt(endOffset - 1);
  const nextCode = text.charCodeAt(endOffset);
  if (
    previousCode >= 0xd800 &&
    previousCode <= 0xdbff &&
    nextCode >= 0xdc00 &&
    nextCode <= 0xdfff
  ) {
    endOffset += 1;
  }
  return Math.max(startOffset + 1, endOffset);
}

function findHardChunkEnd(
  text: string,
  startOffset: number,
  chapterEnd: number,
  targetTokenCount: number
): number {
  let probeEnd = Math.min(
    chapterEnd,
    startOffset + Math.max(256, targetTokenCount * 4)
  );
  while (
    probeEnd < chapterEnd &&
    estimateCustomSourceTokens(text.slice(startOffset, probeEnd)) <=
      targetTokenCount
  ) {
    probeEnd = Math.min(
      chapterEnd,
      startOffset + (probeEnd - startOffset) * 2
    );
  }
  let low = startOffset + 1;
  let high = probeEnd;
  let best = startOffset + 1;
  while (low <= high) {
    const rawMiddle = Math.floor((low + high) / 2);
    const middle = safeEndOffset(
      text,
      startOffset,
      rawMiddle
    );
    const tokenCount = estimateCustomSourceTokens(
      text.slice(startOffset, middle)
    );
    if (tokenCount <= targetTokenCount) {
      best = middle;
      low = rawMiddle + 1;
    } else {
      high = rawMiddle - 1;
    }
  }
  return Math.min(chapterEnd, best);
}

function chooseChunkEnd(
  text: string,
  startOffset: number,
  chapterEnd: number,
  boundaries: readonly ChunkBoundary[],
  chunking: CustomSourceChunkingOptions
): ChunkBoundary {
  const hardMaximumEnd = findHardChunkEnd(
    text,
    startOffset,
    chapterEnd,
    chunking.maxTokenCount
  );
  if (hardMaximumEnd === chapterEnd) {
    return {
      endOffset: chapterEnd,
      boundaryKind: 'chapter_boundary'
    };
  }
  let best:
    | (ChunkBoundary & { distanceFromTarget: number })
    | undefined;
  const boundaryStart = lowerBoundBoundary(boundaries, startOffset);
  for (let index = boundaryStart; index < boundaries.length; index += 1) {
    const boundary = boundaries[index];
    if (boundary.endOffset > hardMaximumEnd) break;
    const tokenCount = estimateCustomSourceTokens(
      text.slice(startOffset, boundary.endOffset)
    );
    const distanceFromTarget = Math.abs(
      chunking.targetTokenCount - tokenCount
    );
    if (
      !best ||
      distanceFromTarget < best.distanceFromTarget ||
      (distanceFromTarget === best.distanceFromTarget &&
        boundary.endOffset > best.endOffset)
    ) {
      best = { ...boundary, distanceFromTarget };
    }
  }
  if (best) {
    return {
      endOffset: best.endOffset,
      boundaryKind: best.boundaryKind
    };
  }
  return {
    endOffset: findHardChunkEnd(
      text,
      startOffset,
      chapterEnd,
      chunking.targetTokenCount
    ),
    boundaryKind: 'size_limit'
  };
}

function safeStartOffset(text: string, candidate: number): number {
  let startOffset = candidate;
  const currentCode = text.charCodeAt(startOffset);
  const previousCode = text.charCodeAt(startOffset - 1);
  if (
    currentCode >= 0xdc00 &&
    currentCode <= 0xdfff &&
    previousCode >= 0xd800 &&
    previousCode <= 0xdbff
  ) {
    startOffset += 1;
  }
  return startOffset;
}

function findOverlapStart(
  text: string,
  previousStart: number,
  previousEnd: number,
  overlapTokenCount: number
): number {
  if (overlapTokenCount === 0 || previousEnd - previousStart <= 1) {
    return previousEnd;
  }
  let low = previousStart + 1;
  let high = previousEnd;
  let best = previousEnd;
  while (low <= high) {
    const rawMiddle = Math.floor((low + high) / 2);
    const middle = safeStartOffset(
      text,
      rawMiddle
    );
    const tokenCount = estimateCustomSourceTokens(
      text.slice(middle, previousEnd)
    );
    if (tokenCount <= overlapTokenCount) {
      best = middle;
      high = rawMiddle - 1;
    } else {
      low = rawMiddle + 1;
    }
  }
  return Math.max(previousStart + 1, best);
}

function createRawChunkRanges(
  text: string,
  chapter: ChapterRange,
  chunking: CustomSourceChunkingOptions
): RawChunkRange[] {
  const boundaries = collectChunkBoundaries(
    text,
    chapter.startOffset,
    chapter.endOffset
  );
  const ranges: RawChunkRange[] = [];
  let startOffset = chapter.startOffset;
  while (startOffset < chapter.endOffset) {
    const boundary = chooseChunkEnd(
      text,
      startOffset,
      chapter.endOffset,
      boundaries,
      chunking
    );
    ranges.push({
      startOffset,
      endOffset: boundary.endOffset,
      boundaryKind: boundary.boundaryKind
    });
    if (boundary.endOffset === chapter.endOffset) break;
    startOffset = findOverlapStart(
      text,
      startOffset,
      boundary.endOffset,
      chunking.overlapTokenCount
    );
  }
  return ranges;
}

function assertParserInput(input: {
  sourceDocumentId: string;
  parserVersion?: string;
}): void {
  if (
    input.sourceDocumentId.trim().length === 0 ||
    input.sourceDocumentId.length > 256
  ) {
    throw new TypeError('sourceDocumentId 必须是有效的稳定 ID。');
  }
  const parserVersion =
    input.parserVersion ?? CUSTOM_SOURCE_TEXT_PARSER_VERSION;
  if (parserVersion.trim().length === 0 || parserVersion.length > 64) {
    throw new TypeError('parserVersion 必须是 1–64 字符。');
  }
}

async function buildParsedCustomSource(
  input: BuildParsedCustomSourceInput
): Promise<ParsedCustomSourceText> {
  assertParserInput(input);
  const canonicalText = input.canonicalText;
  if (canonicalText.trim().length === 0) {
    throw new Error('来源文本不能为空或只包含空白字符。');
  }
  const parserVersion =
    input.parserVersion ?? CUSTOM_SOURCE_TEXT_PARSER_VERSION;
  const chunking = normalizeCustomSourceChunkingOptions(input.chunking);
  const canonicalTextChecksum =
    await createCustomContentTextChecksum(canonicalText);
  const structureIdentity = await createCustomContentChecksum({
    sourceDocumentId: input.sourceDocumentId,
    sourceFormat: input.sourceFormat,
    parserVersion,
    canonicalTextChecksum,
    chunking
  });
  const sourceStructureId = `source-structure-${structureIdentity}`;
  const chapterRanges = input.chapterRanges;
  const chapters = await Promise.all(
    chapterRanges.map(
      async (range, sequence): Promise<CustomSourceChapter> => {
        const chapterId = `${sourceStructureId}-chapter-${sequence}`;
        const chapterText = canonicalText.slice(
          range.startOffset,
          range.endOffset
        );
        return {
          chapterId,
          sourceStructureId,
          sourceDocumentId: input.sourceDocumentId,
          sequence,
          title: range.title,
          detectionMethod: range.detectionMethod,
          sourceSpan: {
            sourceDocumentId: input.sourceDocumentId,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
            chapterId,
            sequence,
            checksum: await createCustomContentTextChecksum(chapterText)
          },
          characterCount: range.endOffset - range.startOffset,
          estimatedTokenCount: storedTokenEstimate(chapterText),
          tokenEstimator: 'approximate_mixed_text_v1'
        };
      }
    )
  );

  const chunkPromises: Array<Promise<CustomSourceChunk>> = [];
  let globalSequence = 0;
  for (const [chapterSequence, chapter] of chapters.entries()) {
    const rawRanges = createRawChunkRanges(
      canonicalText,
      chapterRanges[chapterSequence],
      chunking
    );
    for (const [localSequence, rawRange] of rawRanges.entries()) {
      const sequence = globalSequence;
      globalSequence += 1;
      const previous = rawRanges[localSequence - 1];
      const next = rawRanges[localSequence + 1];
      chunkPromises.push(
        (async (): Promise<CustomSourceChunk> => {
          const chunkText = canonicalText.slice(
            rawRange.startOffset,
            rawRange.endOffset
          );
          return {
            chunkId: `${sourceStructureId}-chunk-${sequence}`,
            sourceStructureId,
            sourceDocumentId: input.sourceDocumentId,
            chapterId: chapter.chapterId,
            sequence,
            chapterSequence: localSequence,
            boundaryKind: rawRange.boundaryKind,
            sourceSpan: {
              sourceDocumentId: input.sourceDocumentId,
              startOffset: rawRange.startOffset,
              endOffset: rawRange.endOffset,
              chapterId: chapter.chapterId,
              sequence,
              checksum: await createCustomContentTextChecksum(chunkText)
            },
            characterCount: rawRange.endOffset - rawRange.startOffset,
            estimatedTokenCount: storedTokenEstimate(chunkText),
            tokenEstimator: 'approximate_mixed_text_v1',
            overlapBeforeCharacterCount: previous
              ? Math.max(
                  0,
                  previous.endOffset - rawRange.startOffset
                )
              : 0,
            overlapAfterCharacterCount: next
              ? Math.max(0, rawRange.endOffset - next.startOffset)
              : 0
          };
        })()
      );
    }
  }
  const timestamp = input.timestamp ?? new Date().toISOString();
  const structure = parseCustomSourceStructure({
    sourceStructureId,
    sourceDocumentId: input.sourceDocumentId,
    parserVersion,
    offsetUnit: 'utf16_code_unit',
    canonicalTextChecksum,
    characterCount: canonicalText.length,
    estimatedTokenCount: storedTokenEstimate(canonicalText),
    tokenEstimator: 'approximate_mixed_text_v1',
    chapters,
    chunks: await Promise.all(chunkPromises),
    createdAt: timestamp,
    updatedAt: timestamp
  });
  return { canonicalText, structure };
}

export async function parseCustomSourceText(
  input: ParseCustomSourceTextInput
): Promise<ParsedCustomSourceText> {
  const canonicalText = canonicalizeCustomSourceText(input.text);
  return buildParsedCustomSource({
    sourceDocumentId: input.sourceDocumentId,
    sourceFormat: input.sourceFormat,
    canonicalText,
    chapterRanges: createChapterRanges(canonicalText, input.sourceFormat),
    parserVersion: input.parserVersion,
    chunking: input.chunking,
    timestamp: input.timestamp
  });
}

function detectTextEncoding(
  bytes: Uint8Array,
  requested: CustomSourceTextEncoding
): Exclude<CustomSourceTextEncoding, 'auto'> {
  if (requested !== 'auto') return requested;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return 'utf-8';
}

export async function decodeCustomSourceTextBlob(
  blob: Blob,
  encoding: CustomSourceTextEncoding = 'auto'
): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const detectedEncoding = detectTextEncoding(bytes, encoding);
  try {
    return canonicalizeCustomSourceText(
      new TextDecoder(detectedEncoding, { fatal: true }).decode(bytes)
    );
  } catch (error) {
    throw new Error(`无法按 ${detectedEncoding} 解码来源文本。`, {
      cause: error
    });
  }
}

export async function extractCustomSourceBlobCanonicalText(input: {
  sourceFormat: CustomSourceFormat;
  blob: Blob;
  encoding?: CustomSourceTextEncoding;
}): Promise<string> {
  if (input.sourceFormat === 'epub') {
    if (input.encoding && input.encoding !== 'auto') {
      throw new Error('EPUB 不接受文本编码覆盖；请使用 auto。');
    }
    return (await extractCustomEpub(input.blob)).canonicalText;
  }
  return decodeCustomSourceTextBlob(input.blob, input.encoding ?? 'auto');
}

export async function parseCustomSourceBlob(
  input: ParseCustomSourceBlobInput
): Promise<ParsedCustomSourceText> {
  if (input.sourceFormat === 'epub') {
    if (input.encoding && input.encoding !== 'auto') {
      throw new Error('EPUB 不接受文本编码覆盖；请使用 auto。');
    }
    const extracted = await extractCustomEpub(input.blob);
    return buildParsedCustomSource({
      sourceDocumentId: input.sourceDocumentId,
      sourceFormat: input.sourceFormat,
      canonicalText: extracted.canonicalText,
      chapterRanges: extracted.chapterRanges,
      parserVersion: input.parserVersion,
      chunking: input.chunking,
      timestamp: input.timestamp
    });
  }
  return parseCustomSourceText({
    sourceDocumentId: input.sourceDocumentId,
    sourceFormat: input.sourceFormat,
    text: await decodeCustomSourceTextBlob(
      input.blob,
      input.encoding ?? 'auto'
    ),
    parserVersion: input.parserVersion,
    chunking: input.chunking,
    timestamp: input.timestamp
  });
}
