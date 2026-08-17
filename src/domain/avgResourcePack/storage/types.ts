import type {
  AvgResourcePackSelection,
  AvgResourceStorageBackend,
  InstalledAvgResourcePackRecord
} from '../types';

export interface AvgResourcePackMetadataRepository {
  getInstalledPack(packId: string): Promise<InstalledAvgResourcePackRecord | undefined>;
  listInstalledPacks(worldpackId?: string): Promise<InstalledAvgResourcePackRecord[]>;
  putInstalledPack(record: InstalledAvgResourcePackRecord): Promise<void>;
  removeInstalledPack(packId: string): Promise<void>;
  getSelection(worldpackId: string): Promise<AvgResourcePackSelection | undefined>;
  putSelection(selection: AvgResourcePackSelection): Promise<void>;
}
export interface AvgResourceBinaryStore {
  readonly backend: AvgResourceStorageBackend;
  write(namespace: string, path: string, blob: Blob): Promise<void>;
  read(namespace: string, path: string): Promise<Blob | undefined>;
  removeNamespace(namespace: string): Promise<void>;
}

export interface AvgResourcePackStorage {
  metadata: AvgResourcePackMetadataRepository;
  binaries: AvgResourceBinaryStore;
}
