import { z } from 'zod';
import type { GenericPortraitReusePolicy } from '../avgResourcePack';
import type {
  AvgGenericPortraitBinding,
  AvgGenericPortraitBindingRepository
} from './types';

export const DEFAULT_AVG_PRESENTATION_DB_NAME = 'sorry-im-a-cop-v2-avg-presentation';
const DB_VERSION = 1;
const BINDING_STORE = 'generic-portrait-bindings';
const SAVE_INDEX = 'by-save-id';
const SAVE_PACK_INDEX = 'by-save-pack';
const SAVE_PACK_PORTRAIT_INDEX = 'by-save-pack-portrait';

const genericPortraitIdentityProfileSchema = z.object({
  gender: z.enum(['male', 'female', 'nonbinary', 'unknown']).optional(),
  visualAge: z.number().finite().optional(),
  visualAgeBand: z.string().min(1).optional(),
  roleFamily: z.string().min(1).optional(),
  roleSubtype: z.string().min(1).optional(),
  roleTier: z.string().min(1).optional(),
  bodyBuild: z.string().min(1).optional(),
  demeanor: z.array(z.string()).optional(),
  stableFeatureTags: z.array(z.string()).optional(),
  roleTags: z.array(z.string()).optional()
}).strict();

export const avgGenericPortraitBindingSchema = z.object({
  saveId: z.string().min(1),
  actorId: z.string().min(1),
  worldpackId: z.string().min(1),
  basePackId: z.string().min(1),
  portraitSetId: z.string().min(1),
  profileSnapshot: genericPortraitIdentityProfileSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict();

interface StoredBinding extends AvgGenericPortraitBinding {
  bindingKey: string;
}

function keyOf(
  saveId: string,
  actorId: string,
  worldpackId: string,
  basePackId: string
): string {
  return [saveId, worldpackId, basePackId, actorId].join('\u001f');
}

function stored(binding: AvgGenericPortraitBinding): StoredBinding {
  return {
    ...binding,
    bindingKey: keyOf(
      binding.saveId,
      binding.actorId,
      binding.worldpackId,
      binding.basePackId
    )
  };
}

function parseStored(value: unknown): AvgGenericPortraitBinding | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { bindingKey: _bindingKey, ...binding } = value as Record<string, unknown>;
  const parsed = avgGenericPortraitBindingSchema.safeParse(binding);
  return parsed.success ? parsed.data : undefined;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('AVG 人物绑定读取失败。'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('AVG 人物绑定事务失败。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('AVG 人物绑定事务已中止。'));
  });
}

export class IndexedDbAvgGenericPortraitBindingRepository
  implements AvgGenericPortraitBindingRepository
{
  constructor(private readonly dbName = DEFAULT_AVG_PRESENTATION_DB_NAME) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(BINDING_STORE)
          ? request.transaction!.objectStore(BINDING_STORE)
          : db.createObjectStore(BINDING_STORE, { keyPath: 'bindingKey' });
        if (!store.indexNames.contains(SAVE_INDEX)) {
          store.createIndex(SAVE_INDEX, 'saveId');
        }
        if (!store.indexNames.contains(SAVE_PACK_INDEX)) {
          store.createIndex(SAVE_PACK_INDEX, ['saveId', 'worldpackId', 'basePackId']);
        }
        if (!store.indexNames.contains(SAVE_PACK_PORTRAIT_INDEX)) {
          store.createIndex(
            SAVE_PACK_PORTRAIT_INDEX,
            ['saveId', 'worldpackId', 'basePackId', 'portraitSetId']
          );
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开 AVG 人物绑定数据库。'));
    });
  }

  async get(
    saveId: string,
    actorId: string,
    worldpackId: string,
    basePackId: string
  ): Promise<AvgGenericPortraitBinding | undefined> {
    const db = await this.open();
    try {
      const transaction = db.transaction(BINDING_STORE, 'readonly');
      const value = await requestToPromise<unknown>(
        transaction.objectStore(BINDING_STORE).get(keyOf(saveId, actorId, worldpackId, basePackId))
      );
      await transactionDone(transaction);
      return parseStored(value);
    } finally {
      db.close();
    }
  }

  async listForSavePack(
    saveId: string,
    worldpackId: string,
    basePackId: string
  ): Promise<AvgGenericPortraitBinding[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction(BINDING_STORE, 'readonly');
      const rows = await requestToPromise<unknown[]>(
        transaction.objectStore(BINDING_STORE).index(SAVE_PACK_INDEX).getAll(
          IDBKeyRange.only([saveId, worldpackId, basePackId])
        )
      );
      await transactionDone(transaction);
      return rows.map(parseStored).filter(
        (binding): binding is AvgGenericPortraitBinding => Boolean(binding)
      );
    } finally {
      db.close();
    }
  }

  async bindIfAvailable(
    bindingInput: AvgGenericPortraitBinding,
    reusePolicy: GenericPortraitReusePolicy
  ): Promise<boolean> {
    const binding = avgGenericPortraitBindingSchema.parse(bindingInput);
    const db = await this.open();
    try {
      const transaction = db.transaction(BINDING_STORE, 'readwrite');
      const store = transaction.objectStore(BINDING_STORE);
      if (reusePolicy === 'unique_per_save') {
        const rows = await requestToPromise<unknown[]>(
          store.index(SAVE_PACK_PORTRAIT_INDEX).getAll(
            IDBKeyRange.only([
              binding.saveId,
              binding.worldpackId,
              binding.basePackId,
              binding.portraitSetId
            ])
          )
        );
        const occupied = rows
          .map(parseStored)
          .some((existing) => existing && existing.actorId !== binding.actorId);
        if (occupied) {
          await transactionDone(transaction);
          return false;
        }
      }
      store.put(stored(binding));
      await transactionDone(transaction);
      return true;
    } finally {
      db.close();
    }
  }

  async remove(
    saveId: string,
    actorId: string,
    worldpackId: string,
    basePackId: string
  ): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(BINDING_STORE, 'readwrite');
      transaction.objectStore(BINDING_STORE).delete(keyOf(saveId, actorId, worldpackId, basePackId));
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async clearSave(saveId: string): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(BINDING_STORE, 'readwrite');
      const store = transaction.objectStore(BINDING_STORE);
      const index = store.index(SAVE_INDEX);
      await new Promise<void>((resolve, reject) => {
        const request = index.openKeyCursor(IDBKeyRange.only(saveId));
        request.onerror = () => reject(request.error ?? new Error('AVG 人物绑定清理失败。'));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          store.delete(cursor.primaryKey);
          cursor.continue();
        };
      });
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }
}

export class MemoryAvgGenericPortraitBindingRepository
  implements AvgGenericPortraitBindingRepository
{
  private readonly bindings = new Map<string, AvgGenericPortraitBinding>();

  get(
    saveId: string,
    actorId: string,
    worldpackId: string,
    basePackId: string
  ): Promise<AvgGenericPortraitBinding | undefined> {
    return Promise.resolve(this.bindings.get(keyOf(saveId, actorId, worldpackId, basePackId)));
  }

  listForSavePack(
    saveId: string,
    worldpackId: string,
    basePackId: string
  ): Promise<AvgGenericPortraitBinding[]> {
    return Promise.resolve(
      [...this.bindings.values()].filter(
        (binding) =>
          binding.saveId === saveId &&
          binding.worldpackId === worldpackId &&
          binding.basePackId === basePackId
      )
    );
  }

  bindIfAvailable(
    bindingInput: AvgGenericPortraitBinding,
    reusePolicy: GenericPortraitReusePolicy
  ): Promise<boolean> {
    const binding = avgGenericPortraitBindingSchema.parse(bindingInput);
    if (
      reusePolicy === 'unique_per_save' &&
      [...this.bindings.values()].some(
        (existing) =>
          existing.saveId === binding.saveId &&
          existing.worldpackId === binding.worldpackId &&
          existing.basePackId === binding.basePackId &&
          existing.portraitSetId === binding.portraitSetId &&
          existing.actorId !== binding.actorId
      )
    ) {
      return Promise.resolve(false);
    }
    this.bindings.set(
      keyOf(binding.saveId, binding.actorId, binding.worldpackId, binding.basePackId),
      binding
    );
    return Promise.resolve(true);
  }

  remove(
    saveId: string,
    actorId: string,
    worldpackId: string,
    basePackId: string
  ): Promise<void> {
    this.bindings.delete(keyOf(saveId, actorId, worldpackId, basePackId));
    return Promise.resolve();
  }

  clearSave(saveId: string): Promise<void> {
    for (const [key, binding] of this.bindings) {
      if (binding.saveId === saveId) this.bindings.delete(key);
    }
    return Promise.resolve();
  }
}

let defaultRepository: IndexedDbAvgGenericPortraitBindingRepository | undefined;

export function getDefaultAvgGenericPortraitBindingRepository():
  | IndexedDbAvgGenericPortraitBindingRepository
  | undefined {
  if (typeof indexedDB === 'undefined') return undefined;
  defaultRepository ??= new IndexedDbAvgGenericPortraitBindingRepository();
  return defaultRepository;
}
