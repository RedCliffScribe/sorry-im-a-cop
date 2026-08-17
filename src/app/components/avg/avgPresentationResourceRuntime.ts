import {
  AvgAssetUrlManager,
  DefaultAvgResourceResolver,
  type AvgImageAssetRef,
  type AvgResourcePackManagerApi,
  type AvgResourcePackStorage,
  type AvgResourceResolver,
  type InstalledAvgResourcePackRecord
} from '../../../domain/avgResourcePack';
import {
  normalizeAvgWorldpackId,
  type AvgActiveResourcePackRef
} from '../../../domain/avgPresentation';

export interface ActiveAvgResourceSession {
  resolver: AvgResourceResolver;
  activePack: AvgActiveResourcePackRef;
  displayName: string;
  selectionToken: string;
}

export interface AvgPresentationResourceRuntime {
  loadActivePack(worldpackId: string): Promise<ActiveAvgResourceSession | undefined>;
  getAssetDisplayUrl(packId: string, asset: AvgImageAssetRef): Promise<string | undefined>;
  reset(): void;
  dispose(): void;
}

function selectedExtensions(
  records: readonly InstalledAvgResourcePackRecord[],
  extensionPackIds: readonly string[]
): InstalledAvgResourcePackRecord[] {
  return extensionPackIds
    .map((packId) => records.find((record) => record.manifest.packId === packId))
    .filter((record): record is InstalledAvgResourcePackRecord => Boolean(record));
}

export class DefaultAvgPresentationResourceRuntime
  implements AvgPresentationResourceRuntime
{
  private readonly assetUrls: AvgAssetUrlManager;

  constructor(
    private readonly manager: AvgResourcePackManagerApi,
    storage: AvgResourcePackStorage
  ) {
    this.assetUrls = new AvgAssetUrlManager(storage);
  }

  async loadActivePack(worldpackId: string): Promise<ActiveAvgResourceSession | undefined> {
    const normalizedWorldpackId = normalizeAvgWorldpackId(worldpackId);
    const [selection, records] = await Promise.all([
      this.manager.getSelection(normalizedWorldpackId),
      this.manager.list(normalizedWorldpackId)
    ]);
    if (!selection?.basePackId) return undefined;

    const basePack = records.find(
      (record) =>
        record.manifest.packId === selection.basePackId &&
        record.manifest.packType === 'base'
    );
    if (!basePack) return undefined;

    const extensionPacks = selectedExtensions(records, selection.extensionPackIds)
      .filter(
        (record) =>
          record.manifest.packType === 'extension' &&
          (!record.manifest.targetBasePackId ||
            record.manifest.targetBasePackId === basePack.manifest.packId)
      );
    const activePack: AvgActiveResourcePackRef = {
      worldpackId: basePack.manifest.worldpackId,
      basePackId: basePack.manifest.packId,
      basePackVersion: basePack.manifest.version,
      extensionPackIds: extensionPacks.map((record) => record.manifest.packId)
    };
    const selectionToken = [
      `${basePack.manifest.packId}@${basePack.manifest.version}`,
      ...extensionPacks.map(
        (record) => `${record.manifest.packId}@${record.manifest.version}`
      )
    ].join('|');

    return {
      resolver: new DefaultAvgResourceResolver({ basePack, extensionPacks }),
      activePack,
      displayName: basePack.manifest.displayName,
      selectionToken
    };
  }

  getAssetDisplayUrl(
    packId: string,
    asset: AvgImageAssetRef
  ): Promise<string | undefined> {
    return this.assetUrls.getAssetUrl(packId, asset);
  }

  reset(): void {
    this.assetUrls.dispose();
  }

  dispose(): void {
    this.reset();
  }
}
