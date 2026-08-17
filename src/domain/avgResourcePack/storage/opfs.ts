import { isSafePackRelativePath } from '../schemas';
import type { AvgResourceBinaryStore } from './types';

const ROOT_DIRECTORY = 'sorry-im-a-cop-v2-avg-resources';

function assertNamespace(namespace: string): void {
  if (!/^[a-zA-Z0-9._-]{1,180}$/u.test(namespace)) {
    throw new Error('AVG 资源存储命名空间不安全。');
  }
}
function getStorageDirectory(): Promise<FileSystemDirectoryHandle> {
  const getDirectory = navigator.storage?.getDirectory;
  if (!getDirectory) throw new Error('当前浏览器不支持 OPFS。');
  return getDirectory.call(navigator.storage);
}

async function getRoot(create: boolean): Promise<FileSystemDirectoryHandle> {
  const storage = await getStorageDirectory();
  return storage.getDirectoryHandle(ROOT_DIRECTORY, { create });
}

async function getNamespace(
  namespace: string,
  create: boolean
): Promise<FileSystemDirectoryHandle> {
  assertNamespace(namespace);
  const root = await getRoot(create);
  return root.getDirectoryHandle(namespace, { create });
}

async function resolveParent(
  namespace: string,
  path: string,
  create: boolean
): Promise<{ directory: FileSystemDirectoryHandle; fileName: string }> {
  if (!isSafePackRelativePath(path)) throw new Error(`不安全的资源路径：${path}`);
  const segments = path.split('/');
  const fileName = segments.pop()!;
  let directory = await getNamespace(namespace, create);
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }
  return { directory, fileName };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

export class OpfsAvgResourceBinaryStore implements AvgResourceBinaryStore {
  readonly backend = 'opfs' as const;

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
  }

  async write(namespace: string, path: string, blob: Blob): Promise<void> {
    const { directory, fileName } = await resolveParent(namespace, path, true);
    const handle = await directory.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
  }

  async read(namespace: string, path: string): Promise<Blob | undefined> {
    try {
      const { directory, fileName } = await resolveParent(namespace, path, false);
      const handle = await directory.getFileHandle(fileName);
      return await handle.getFile();
    } catch (error) {
      if (isMissingFileError(error)) return undefined;
      throw error;
    }
  }

  async removeNamespace(namespace: string): Promise<void> {
    assertNamespace(namespace);
    try {
      const root = await getRoot(false);
      await root.removeEntry(namespace, { recursive: true });
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  }
}
