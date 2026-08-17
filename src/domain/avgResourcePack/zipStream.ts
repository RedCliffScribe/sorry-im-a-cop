import { Unzip, UnzipInflate } from 'fflate';
import { assertSafeZipEntryPath, type SafeZipLimits } from '../customContent/safeZip';
import type { AvgResourcePackInstallProgress } from './types';
import type { AvgResourceBinaryStore } from './storage';

export const DEFAULT_AVG_RESOURCE_ZIP_LIMITS: SafeZipLimits = {
  maxArchiveBytes: 3 * 1024 * 1024 * 1024,
  maxEntryCount: 5000,
  maxEntryBytes: 96 * 1024 * 1024,
  maxExpandedBytes: 4 * 1024 * 1024 * 1024,
  maxCompressionRatio: 1000
};

export interface StreamAvgResourcePackArchiveOptions {
  archive: Blob;
  archiveLabel: string;
  namespace: string;
  binaryStore: AvgResourceBinaryStore;
  limits?: SafeZipLimits;
  onProgress?: (progress: AvgResourcePackInstallProgress) => void;
}

export interface StreamedAvgResourcePackArchive {
  paths: Set<string>;
  imagePaths: Set<string>;
  jsonFiles: Map<string, Uint8Array>;
  entryCount: number;
  expandedByteLength: number;
}

function concatChunks(chunks: readonly Uint8Array[], size: number): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function isNestedZip(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function assertAllowedEntry(path: string): 'json' | 'image' {
  const lower = path.toLocaleLowerCase('en-US');
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.png') || lower.endsWith('.webp')) return 'image';
  throw new Error(`AVG 资源包包含不支持的文件类型：${path}`);
}

async function streamBlob(
  blob: Blob,
  onChunk: (chunk: Uint8Array, final: boolean) => Promise<void>
): Promise<void> {
  if (typeof blob.stream === 'function') {
    const reader = blob.stream().getReader();
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      await onChunk(result.value, false);
    }
    await onChunk(new Uint8Array(0), true);
    return;
  }
  await onChunk(new Uint8Array(await blob.arrayBuffer()), true);
}

export async function streamAvgResourcePackArchive(
  options: StreamAvgResourcePackArchiveOptions
): Promise<StreamedAvgResourcePackArchive> {
  const limits = options.limits ?? DEFAULT_AVG_RESOURCE_ZIP_LIMITS;
  if (options.archive.size > limits.maxArchiveBytes) {
    throw new Error(`AVG 资源包压缩文件超过 ${limits.maxArchiveBytes} 字节上限。`);
  }

  const paths = new Set<string>();
  const foldedPaths = new Set<string>();
  const imagePaths = new Set<string>();
  const jsonFiles = new Map<string, Uint8Array>();
  const writes = new Set<Promise<void>>();
  let archiveBytesRead = 0;
  let expandedByteLength = 0;
  let entryCount = 0;
  let fatalError: Error | undefined;

  const fail = (error: unknown): void => {
    fatalError ??= error instanceof Error ? error : new Error(String(error));
  };
  const unzipper = new Unzip((file) => {
    if (fatalError) return;
    try {
      entryCount += 1;
      if (entryCount > limits.maxEntryCount) {
        throw new Error(`AVG 资源包文件数量超过 ${limits.maxEntryCount} 个。`);
      }
      const isDirectory = file.name.endsWith('/');
      assertSafeZipEntryPath(file.name, options.archiveLabel, isDirectory);
      const foldedPath = file.name.toLocaleLowerCase('en-US');
      if (foldedPaths.has(foldedPath)) throw new Error(`AVG 资源包路径重复：${file.name}`);
      foldedPaths.add(foldedPath);
      if (file.compression !== 0 && file.compression !== 8) {
        throw new Error(`AVG 资源包使用不支持的压缩方式：${file.name}`);
      }
      if (file.originalSize !== undefined && file.originalSize > limits.maxEntryBytes) {
        throw new Error(`AVG 资源包条目过大：${file.name}`);
      }
      if (
        file.originalSize !== undefined &&
        file.originalSize > 0 &&
        file.size !== undefined &&
        (file.size === 0 || file.originalSize / file.size > limits.maxCompressionRatio)
      ) {
        throw new Error(`AVG 资源包条目压缩率异常：${file.name}`);
      }
      const kind = isDirectory ? undefined : assertAllowedEntry(file.name);
      const chunks: Uint8Array[] = [];
      let entryBytes = 0;
      file.ondata = (error, chunk, final) => {
        if (error) {
          fail(error);
          return;
        }
        entryBytes += chunk.byteLength;
        expandedByteLength += chunk.byteLength;
        if (
          entryBytes > limits.maxEntryBytes ||
          expandedByteLength > limits.maxExpandedBytes
        ) {
          file.terminate();
          fail(new Error(`AVG 资源包解压后体积超过安全上限：${file.name}`));
          return;
        }
        if (!isDirectory && chunk.byteLength) chunks.push(chunk.slice());
        if (!final || isDirectory || fatalError) return;
        const bytes = concatChunks(chunks, entryBytes);
        if (isNestedZip(bytes)) {
          fail(new Error(`AVG 资源包禁止嵌套压缩文件：${file.name}`));
          return;
        }
        paths.add(file.name);
        if (kind === 'json') jsonFiles.set(file.name, bytes);
        if (kind === 'image') imagePaths.add(file.name);
        const write = options.binaryStore.write(
            options.namespace,
            file.name,
            new Blob([bytes.buffer], {
              type:
                kind === 'json'
                  ? 'application/json'
                  : file.name.toLocaleLowerCase('en-US').endsWith('.png')
                    ? 'image/png'
                    : 'image/webp'
            })
          );
        writes.add(write);
        void write
          .catch(fail)
          .finally(() => writes.delete(write));
      };
      file.start();
    } catch (error) {
      fail(error);
    }
  });
  unzipper.register(UnzipInflate);

  await streamBlob(options.archive, async (chunk, final) => {
    if (fatalError) throw fatalError;
    archiveBytesRead += chunk.byteLength;
    unzipper.push(chunk, final);
    // Apply storage backpressure at archive-chunk boundaries. This keeps only
    // the current ZIP entry (or the few entries completed in this chunk) in
    // memory instead of retaining hundreds of pending image Blobs.
    if (writes.size) await Promise.all([...writes]);
    options.onProgress?.({
      phase: 'reading',
      archiveBytesRead,
      archiveByteLength: options.archive.size,
      entriesRead: entryCount
    });
    if (fatalError) throw fatalError;
  });
  if (fatalError) throw fatalError;
  if (writes.size) await Promise.all([...writes]);
  if (fatalError) throw fatalError;

  return {
    paths,
    imagePaths,
    jsonFiles,
    entryCount,
    expandedByteLength
  };
}
