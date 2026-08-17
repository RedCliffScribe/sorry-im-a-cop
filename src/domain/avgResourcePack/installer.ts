import { avgResourcePackManifestV1Schema } from './schemas';
import type {
  AvgLoadedResourcePack,
  AvgResourcePackInstallProgress,
  AvgResourcePackInstallResult,
  AvgResourcePackSelection,
  InstalledAvgResourcePackRecord
} from './types';
import {
  assertValidAvgResourcePack,
  collectAvgResourcePackAssets,
  parseAvgLoadedResourcePack,
  validateAvgResourcePackFiles
} from './validation';
import type { AvgResourcePackStorage } from './storage';
import {
  DEFAULT_AVG_RESOURCE_ZIP_LIMITS,
  streamAvgResourcePackArchive
} from './zipStream';

export interface AvgResourcePackInstallerOptions {
  requireUserAcceptedProvenance?: boolean;
  now?: () => Date;
}

function parseJson(bytes: Uint8Array | undefined, path: string): unknown {
  if (!bytes) throw new Error(`AVG 资源包缺少 ${path}。`);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(
      `AVG 资源包 JSON 无效：${path}（${error instanceof Error ? error.message : String(error)}）`,
      { cause: error }
    );
  }
}

function createStorageNamespace(): string {
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `avg-stage-${suffix}`;
}

function createSelection(
  worldpackId: string,
  previous: AvgResourcePackSelection | undefined,
  now: string
): AvgResourcePackSelection {
  return previous ?? { worldpackId, extensionPackIds: [], updatedAt: now };
}

export class AvgResourcePackInstaller {
  private readonly now: () => Date;
  private readonly requireUserAcceptedProvenance: boolean;

  constructor(
    private readonly storage: AvgResourcePackStorage,
    options: AvgResourcePackInstallerOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.requireUserAcceptedProvenance = options.requireUserAcceptedProvenance ?? false;
  }

  async install(
    archive: Blob,
    options: {
      archiveLabel?: string;
      onProgress?: (progress: AvgResourcePackInstallProgress) => void;
    } = {}
  ): Promise<AvgResourcePackInstallResult> {
    const namespace = createStorageNamespace();
    let committed = false;
    try {
      const streamed = await streamAvgResourcePackArchive({
        archive,
        archiveLabel: options.archiveLabel ?? 'AVG资源包',
        namespace,
        binaryStore: this.storage.binaries,
        limits: DEFAULT_AVG_RESOURCE_ZIP_LIMITS,
        onProgress: options.onProgress
      });
      const manifest = avgResourcePackManifestV1Schema.parse(
        parseJson(streamed.jsonFiles.get('manifest.json'), 'manifest.json')
      );
      const pack = parseAvgLoadedResourcePack({
        manifest,
        fixedCharacters: parseJson(
          streamed.jsonFiles.get(manifest.registries.fixedCharacters),
          manifest.registries.fixedCharacters
        ),
        genericPortraits: parseJson(
          streamed.jsonFiles.get(manifest.registries.genericPortraits),
          manifest.registries.genericPortraits
        ),
        scenes: parseJson(
          streamed.jsonFiles.get(manifest.registries.scenes),
          manifest.registries.scenes
        )
      });

      options.onProgress?.({
        phase: 'validating',
        archiveBytesRead: archive.size,
        archiveByteLength: archive.size,
        entriesRead: streamed.entryCount
      });
      const report = await validateAvgResourcePackFiles(
        pack,
        (path) => this.storage.binaries.read(namespace, path),
        { requireUserAcceptedProvenance: this.requireUserAcceptedProvenance }
      );
      const expectedImagePaths = new Set(
        collectAvgResourcePackAssets(pack).map(({ asset }) => asset.path)
      );
      for (const path of streamed.imagePaths) {
        if (!expectedImagePaths.has(path)) {
          report.issues.push({
            severity: 'error',
            code: 'unregistered_image_file',
            path,
            message: '图片存在于 ZIP 中，但未被 Registry 登记。'
          });
        }
      }
      report.valid = !report.issues.some((issue) => issue.severity === 'error');
      assertValidAvgResourcePack(report);

      const previous = await this.storage.metadata.getInstalledPack(manifest.packId);
      const installedAt = this.now().toISOString();
      const record: InstalledAvgResourcePackRecord = {
        ...pack,
        storageNamespace: namespace,
        storageBackend: this.storage.binaries.backend,
        installedAt,
        archiveByteLength: archive.size,
        expandedByteLength: streamed.expandedByteLength,
        assetCount: report.assetCount,
        validation: {
          status: 'valid',
          checkedAt: installedAt,
          warnings: report.issues
            .filter((issue) => issue.severity === 'warning')
            .map((issue) => `${issue.code}: ${issue.message}`)
        }
      };

      options.onProgress?.({
        phase: 'committing',
        archiveBytesRead: archive.size,
        archiveByteLength: archive.size,
        entriesRead: streamed.entryCount
      });
      await this.storage.metadata.putInstalledPack(record);
      committed = true;
      await this.activateWhenAppropriate(record);
      if (previous && previous.storageNamespace !== namespace) {
        await this.storage.binaries.removeNamespace(previous.storageNamespace).catch(() => undefined);
      }
      return { record, replacedVersion: previous?.manifest.version };
    } catch (error) {
      if (!committed) {
        await this.storage.binaries.removeNamespace(namespace).catch(() => undefined);
      }
      throw error;
    }
  }

  private async activateWhenAppropriate(record: InstalledAvgResourcePackRecord): Promise<void> {
    const { manifest } = record;
    const previous = await this.storage.metadata.getSelection(manifest.worldpackId);
    const selection = createSelection(manifest.worldpackId, previous, this.now().toISOString());
    if (manifest.packType === 'base') {
      if (!selection.basePackId || selection.basePackId === manifest.packId) {
        selection.basePackId = manifest.packId;
        selection.updatedAt = this.now().toISOString();
        await this.storage.metadata.putSelection(selection);
      }
      return;
    }
    if (
      selection.basePackId &&
      (!manifest.targetBasePackId || manifest.targetBasePackId === selection.basePackId) &&
      !selection.extensionPackIds.includes(manifest.packId)
    ) {
      selection.extensionPackIds.push(manifest.packId);
      selection.updatedAt = this.now().toISOString();
      await this.storage.metadata.putSelection(selection);
    }
  }

  async uninstall(packId: string): Promise<void> {
    const record = await this.storage.metadata.getInstalledPack(packId);
    if (!record) return;
    const selection = await this.storage.metadata.getSelection(record.manifest.worldpackId);
    if (selection) {
      if (selection.basePackId === packId) {
        selection.basePackId = undefined;
        selection.extensionPackIds = [];
      } else {
        selection.extensionPackIds = selection.extensionPackIds.filter((id) => id !== packId);
      }
      selection.updatedAt = this.now().toISOString();
      await this.storage.metadata.putSelection(selection);
    }
    await this.storage.metadata.removeInstalledPack(packId);
    await this.storage.binaries.removeNamespace(record.storageNamespace).catch(() => undefined);
  }
}

export function asLoadedAvgResourcePack(record: InstalledAvgResourcePackRecord): AvgLoadedResourcePack {
  return {
    manifest: record.manifest,
    fixedCharacters: record.fixedCharacters,
    genericPortraits: record.genericPortraits,
    scenes: record.scenes
  };
}
