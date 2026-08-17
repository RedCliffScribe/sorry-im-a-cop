import { Unzip, UnzipInflate } from 'fflate';

export interface SafeZipLimits {
  maxArchiveBytes: number;
  maxEntryCount: number;
  maxEntryBytes: number;
  maxExpandedBytes: number;
  maxCompressionRatio: number;
}

export interface ReadZipSafelyOptions {
  archiveLabel: string;
  limits: SafeZipLimits;
  allowDirectoryEntries?: boolean;
  allowNestedArchive?: (path: string) => boolean;
}

const FORBIDDEN_EXECUTABLE_EXTENSIONS = [
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.ps1',
  '.sh',
  '.scr',
  '.jar'
] as const;

function formatByteLimit(byteLength: number): string {
  const mebibytes = byteLength / (1024 * 1024);
  return Number.isInteger(mebibytes)
    ? `${mebibytes} MB`
    : `${byteLength} 字节`;
}

export function assertSafeZipEntryPath(
  path: string,
  archiveLabel: string,
  allowDirectoryEntry = false
): void {
  const normalizedPath =
    allowDirectoryEntry && path.endsWith('/') ? path.slice(0, -1) : path;
  if (
    !normalizedPath ||
    normalizedPath.length > 240 ||
    normalizedPath.includes('\\') ||
    normalizedPath.includes('\0') ||
    normalizedPath.startsWith('/') ||
    /^[a-zA-Z]:/u.test(normalizedPath)
  ) {
    throw new Error(
      `${archiveLabel}包含不安全路径：${normalizedPath || '(empty)'}`
    );
  }
  const segments = normalizedPath.split('/');
  if (
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..'
    )
  ) {
    throw new Error(`${archiveLabel}包含不安全路径：${normalizedPath}`);
  }
  const lowerPath = normalizedPath.toLowerCase();
  if (
    FORBIDDEN_EXECUTABLE_EXTENSIONS.some((extension) =>
      lowerPath.endsWith(extension)
    )
  ) {
    throw new Error(`${archiveLabel}包含禁止的可执行文件：${normalizedPath}`);
  }
}

function concatChunks(
  chunks: readonly Uint8Array[],
  size: number
): Uint8Array {
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

export function readZipSafely(
  bytes: Uint8Array,
  options: ReadZipSafelyOptions
): Promise<Map<string, Uint8Array>> {
  const { archiveLabel, limits } = options;
  if (bytes.byteLength > limits.maxArchiveBytes) {
    throw new Error(
      `${archiveLabel}压缩文件超过 ${formatByteLimit(
        limits.maxArchiveBytes
      )} 上限。`
    );
  }
  return new Promise((resolve, reject) => {
    const files = new Map<string, Uint8Array>();
    const foldedPaths = new Set<string>();
    let entryCount = 0;
    let expandedBytes = 0;
    let pending = 0;
    let pushFinished = false;
    let failed = false;

    const fail = (error: unknown) => {
      if (failed) return;
      failed = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const maybeResolve = () => {
      if (!failed && pushFinished && pending === 0) resolve(files);
    };
    const unzipper = new Unzip((file) => {
      if (failed) return;
      try {
        entryCount += 1;
        if (entryCount > limits.maxEntryCount) {
          throw new Error(
            `${archiveLabel}文件数量超过 ${limits.maxEntryCount} 个。`
          );
        }
        const isDirectory = file.name.endsWith('/');
        assertSafeZipEntryPath(
          file.name,
          archiveLabel,
          options.allowDirectoryEntries === true && isDirectory
        );
        if (isDirectory && options.allowDirectoryEntries !== true) {
          throw new Error(`${archiveLabel}包含不安全路径：${file.name}`);
        }
        const foldedPath = file.name.toLocaleLowerCase('en-US');
        if (foldedPaths.has(foldedPath)) {
          throw new Error(`${archiveLabel}路径重复：${file.name}`);
        }
        foldedPaths.add(foldedPath);
        if (file.compression !== 0 && file.compression !== 8) {
          throw new Error(`${archiveLabel}使用不支持的压缩方式：${file.name}`);
        }
        if (
          file.originalSize !== undefined &&
          file.originalSize > limits.maxEntryBytes
        ) {
          throw new Error(`${archiveLabel}条目过大：${file.name}`);
        }
        if (
          file.originalSize !== undefined &&
          file.originalSize > 0 &&
          (file.size === 0 ||
            (file.size !== undefined &&
              file.originalSize / file.size > limits.maxCompressionRatio))
        ) {
          throw new Error(`${archiveLabel}条目压缩率异常：${file.name}`);
        }
        const chunks: Uint8Array[] = [];
        let size = 0;
        pending += 1;
        file.ondata = (error, chunk, final) => {
          if (error) {
            fail(error);
            return;
          }
          size += chunk.byteLength;
          expandedBytes += chunk.byteLength;
          if (
            size > limits.maxEntryBytes ||
            expandedBytes > limits.maxExpandedBytes
          ) {
            file.terminate();
            fail(
              new Error(
                `${archiveLabel}解压后体积超过安全上限：${file.name}`
              )
            );
            return;
          }
          if (!isDirectory) chunks.push(chunk);
          if (!final) return;
          if (!isDirectory) {
            const value = concatChunks(chunks, size);
            if (
              isNestedZip(value) &&
              options.allowNestedArchive?.(file.name) !== true
            ) {
              fail(new Error(`${archiveLabel}禁止嵌套压缩文件：${file.name}`));
              return;
            }
            files.set(file.name, value);
          }
          pending -= 1;
          maybeResolve();
        };
        file.start();
      } catch (error) {
        fail(error);
      }
    });
    unzipper.register(UnzipInflate);
    try {
      unzipper.push(bytes, true);
      pushFinished = true;
      maybeResolve();
    } catch (error) {
      fail(error);
    }
  });
}
