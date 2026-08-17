import { IndexedDbAvgResourceBinaryStore, IndexedDbAvgResourcePackMetadataRepository } from './indexedDb';
import { OpfsAvgResourceBinaryStore } from './opfs';
import type { AvgResourcePackStorage } from './types';

export * from './indexedDb';
export * from './opfs';
export * from './types';

export function createDefaultAvgResourcePackStorage(): AvgResourcePackStorage {
  return {
    metadata: new IndexedDbAvgResourcePackMetadataRepository(),
    binaries: OpfsAvgResourceBinaryStore.isSupported()
      ? new OpfsAvgResourceBinaryStore()
      : new IndexedDbAvgResourceBinaryStore()
  };
}
