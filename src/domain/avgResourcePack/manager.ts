import { AvgResourcePackInstaller } from './installer';
import { DefaultAvgResourceResolver } from './resolver';
import type {
  AvgImageAssetRef,
  AvgResourcePackInstallProgress,
  AvgResourcePackInstallResult,
  AvgResourcePackSelection,
  InstalledAvgResourcePackRecord
} from './types';
import type { AvgResourcePackStorage } from './storage';

export interface AvgResourcePackManagerApi {
  list(worldpackId?: string): Promise<InstalledAvgResourcePackRecord[]>;
  getSelection(worldpackId: string): Promise<AvgResourcePackSelection | undefined>;
  install(
    archive: Blob,
    options?: {
      archiveLabel?: string;
      onProgress?: (progress: AvgResourcePackInstallProgress) => void;
    }
  ): Promise<AvgResourcePackInstallResult>;
  uninstall(packId: string): Promise<void>;
  selectBase(worldpackId: string, packId?: string): Promise<void>;
}

export class AvgResourcePackManager implements AvgResourcePackManagerApi {
  private readonly installer: AvgResourcePackInstaller;

  constructor(private readonly storage: AvgResourcePackStorage) {
    this.installer = new AvgResourcePackInstaller(storage);
  }

  list(worldpackId?: string): Promise<InstalledAvgResourcePackRecord[]> {
    return this.storage.metadata.listInstalledPacks(worldpackId);
  }

  getSelection(worldpackId: string): Promise<AvgResourcePackSelection | undefined> {
    return this.storage.metadata.getSelection(worldpackId);
  }

  install(
    archive: Blob,
    options: {
      archiveLabel?: string;
      onProgress?: (progress: AvgResourcePackInstallProgress) => void;
    } = {}
  ): Promise<AvgResourcePackInstallResult> {
    return this.installer.install(archive, options);
  }

  uninstall(packId: string): Promise<void> {
    return this.installer.uninstall(packId);
  }

  async selectBase(worldpackId: string, packId?: string): Promise<void> {
    const packs = await this.storage.metadata.listInstalledPacks(worldpackId);
    const selected = packId ? packs.find((record) => record.manifest.packId === packId) : undefined;
    if (packId && (!selected || selected.manifest.packType !== 'base')) {
      throw new Error('所选 Base AVG 资源包不存在或类型不正确。');
    }
    const previous = await this.storage.metadata.getSelection(worldpackId);
    const extensions = packId
      ? packs.filter(
          (record) =>
            record.manifest.packType === 'extension' &&
            previous?.extensionPackIds.includes(record.manifest.packId) &&
            (!record.manifest.targetBasePackId || record.manifest.targetBasePackId === packId)
        )
      : [];
    await this.storage.metadata.putSelection({
      worldpackId,
      basePackId: packId,
      extensionPackIds: extensions.map((record) => record.manifest.packId),
      updatedAt: new Date().toISOString()
    });
  }

  async createSelectedResolver(worldpackId: string): Promise<DefaultAvgResourceResolver | undefined> {
    const selection = await this.storage.metadata.getSelection(worldpackId);
    if (!selection?.basePackId) return undefined;
    const packs = await this.storage.metadata.listInstalledPacks(worldpackId);
    const basePack = packs.find((record) => record.manifest.packId === selection.basePackId);
    if (!basePack || basePack.manifest.packType !== 'base') return undefined;
    const extensions = selection.extensionPackIds
      .map((id) => packs.find((record) => record.manifest.packId === id))
      .filter((record): record is InstalledAvgResourcePackRecord => Boolean(record));
    return new DefaultAvgResourceResolver({ basePack, extensionPacks: extensions });
  }
}

export class AvgAssetUrlManager {
  private readonly urls = new Map<string, string>();

  constructor(private readonly storage: AvgResourcePackStorage) {}

  async getUrl(packId: string, path: string): Promise<string | undefined> {
    const record = await this.storage.metadata.getInstalledPack(packId);
    if (!record) return undefined;
    const key = `${packId}:${record.manifest.version}:${path}`;
    const existing = this.urls.get(key);
    if (existing) return existing;
    const blob = await this.storage.binaries.read(record.storageNamespace, path);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    this.urls.set(key, url);
    return url;
  }

  async getAssetUrl(
    packId: string,
    asset: Pick<AvgImageAssetRef, 'assetId' | 'path'>
  ): Promise<string | undefined> {
    const record = await this.storage.metadata.getInstalledPack(packId);
    if (!record) return undefined;
    const key = `${packId}:${record.manifest.version}:${asset.assetId}`;
    const existing = this.urls.get(key);
    if (existing) return existing;
    const blob = await this.storage.binaries.read(record.storageNamespace, asset.path);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    this.urls.set(key, url);
    return url;
  }

  dispose(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
