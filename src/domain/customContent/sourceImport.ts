import type {
  CustomSourceDocument,
  CustomContentProcessingTask
} from './assetTypes';
import { createCustomContentBlobChecksum } from './checksum';
import { customSourceDocumentSchema } from './contentPackageSchemas';
import { customEpubExtractionLimits } from './epubSourceParser';
import type { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import { createCustomSourceParseTask } from './sourceProcessingTasks';
import type { CustomSourceFormat } from './sourceTextPipeline';

export interface ImportCustomSourceFileResult {
  document: CustomSourceDocument;
  parseTask: CustomContentProcessingTask;
  alreadyPresent: boolean;
}

export function detectCustomSourceFormat(
  fileName: string,
  mediaType = ''
): CustomSourceFormat {
  const lowerName = fileName.trim().toLocaleLowerCase('en-US');
  const normalizedMediaType = mediaType
    .split(';', 1)[0]
    .trim()
    .toLocaleLowerCase('en-US');
  if (
    lowerName.endsWith('.pdf') ||
    normalizedMediaType === 'application/pdf'
  ) {
    throw new Error('V1 不支持 PDF；请选择 TXT、Markdown 或 EPUB。');
  }
  if (lowerName.endsWith('.epub')) return 'epub';
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return 'markdown';
  }
  if (lowerName.endsWith('.txt')) return 'txt';
  throw new Error('无法识别文件格式；请选择 .txt、.md、.markdown 或 .epub。');
}

function sourceMediaType(format: CustomSourceFormat, provided: string): string {
  const normalized = provided.trim();
  if (normalized) return normalized;
  if (format === 'epub') return 'application/epub+zip';
  if (format === 'markdown') return 'text/markdown';
  return 'text/plain';
}

export async function importCustomSourceFile(options: {
  repository: IndexedDbCustomContentRepository;
  file: File;
  timestamp?: string;
}): Promise<ImportCustomSourceFileResult> {
  const { repository, file } = options;
  const format = detectCustomSourceFormat(file.name, file.type);
  if (file.size === 0) throw new Error('来源文件不能为空。');
  if (
    format === 'epub' &&
    file.size > customEpubExtractionLimits.maxArchiveBytes
  ) {
    throw new Error('EPUB 压缩文件超过 20 MB 安全上限。');
  }
  const checksum = await createCustomContentBlobChecksum(file);
  const existing = (await repository.listSourceDocuments()).find(
    (document) =>
      document.sourceFormat === format &&
      document.byteLength === file.size &&
      document.checksum === checksum
  );
  if (existing) {
    const snapshot = await createCustomSourceParseTask(
      repository,
      existing.sourceDocumentId
    );
    return {
      document: existing,
      parseTask: snapshot.task,
      alreadyPresent: true
    };
  }

  const timestamp = options.timestamp ?? new Date().toISOString();
  const document = customSourceDocumentSchema.parse({
    sourceDocumentId: `source-${globalThis.crypto.randomUUID()}`,
    fileName: file.name.trim(),
    sourceFormat: format,
    mediaType: sourceMediaType(format, file.type),
    byteLength: file.size,
    checksum,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  await repository.saveSourceDocument(document, file);
  const snapshot = await createCustomSourceParseTask(
    repository,
    document.sourceDocumentId,
    { timestamp }
  );
  return {
    document,
    parseTask: snapshot.task,
    alreadyPresent: false
  };
}
