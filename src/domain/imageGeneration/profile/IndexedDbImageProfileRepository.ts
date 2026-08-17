import type { ImageApiProfileId } from '../probe';
import { comfyWorkflowTemplateSchema, imageApiProfileSchema, imageProfileProbeResultSchema } from './schemas';
import type { ImageProfileRepository } from './repositories';
import type {
  ComfyWorkflowTemplate,
  ComfyWorkflowTemplateId,
  ImageApiProfile,
  ImageProfileProbeResult
} from './types';

const DEFAULT_DATABASE_NAME = 'sorry-im-a-cop-v2-image-profiles';
const DATABASE_VERSION = 2;
const PROFILE_STORE = 'profiles';
const WORKFLOW_STORE = 'workflows';
const PROBE_RESULT_STORE = 'profileProbeResults';
const PROFILE_ID_INDEX = 'profileId';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败。'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 事务已中止。'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 事务失败。'));
  });
}

export class IndexedDbImageProfileRepository implements ImageProfileRepository {
  private databasePromise?: Promise<IDBDatabase>;

  constructor(private readonly databaseName = DEFAULT_DATABASE_NAME) {}

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROFILE_STORE)) {
          database.createObjectStore(PROFILE_STORE, { keyPath: 'profileId' });
        }
        if (!database.objectStoreNames.contains(WORKFLOW_STORE)) {
          database.createObjectStore(WORKFLOW_STORE, { keyPath: 'workflowTemplateId' });
        }
        if (!database.objectStoreNames.contains(PROBE_RESULT_STORE)) {
          const store = database.createObjectStore(PROBE_RESULT_STORE, { keyPath: 'probeId' });
          store.createIndex(PROFILE_ID_INDEX, 'profileId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开图片档案数据库。'));
    });
    return this.databasePromise;
  }

  async listProfiles(): Promise<ImageApiProfile[]> {
    const database = await this.openDatabase();
    const records = await requestResult(database.transaction(PROFILE_STORE, 'readonly').objectStore(PROFILE_STORE).getAll());
    return records.map((record) => imageApiProfileSchema.parse(record)).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getProfile(profileId: ImageApiProfileId): Promise<ImageApiProfile | null> {
    const database = await this.openDatabase();
    const record = await requestResult(database.transaction(PROFILE_STORE, 'readonly').objectStore(PROFILE_STORE).get(profileId));
    return record === undefined ? null : imageApiProfileSchema.parse(record);
  }

  async putProfile(profile: ImageApiProfile): Promise<void> {
    const parsed = imageApiProfileSchema.parse(profile);
    const database = await this.openDatabase();
    const transaction = database.transaction(PROFILE_STORE, 'readwrite');
    transaction.objectStore(PROFILE_STORE).put(parsed);
    await transactionDone(transaction);
  }

  async deleteProfile(profileId: ImageApiProfileId): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(PROFILE_STORE, 'readwrite');
    transaction.objectStore(PROFILE_STORE).delete(profileId);
    await transactionDone(transaction);
  }

  async listWorkflowTemplates(): Promise<ComfyWorkflowTemplate[]> {
    const database = await this.openDatabase();
    const records = await requestResult(database.transaction(WORKFLOW_STORE, 'readonly').objectStore(WORKFLOW_STORE).getAll());
    return records
      .map((record) => comfyWorkflowTemplateSchema.parse(record))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getWorkflowTemplate(workflowTemplateId: ComfyWorkflowTemplateId): Promise<ComfyWorkflowTemplate | null> {
    const database = await this.openDatabase();
    const record = await requestResult(
      database.transaction(WORKFLOW_STORE, 'readonly').objectStore(WORKFLOW_STORE).get(workflowTemplateId)
    );
    return record === undefined ? null : comfyWorkflowTemplateSchema.parse(record);
  }

  async putWorkflowTemplate(template: ComfyWorkflowTemplate): Promise<void> {
    const parsed = comfyWorkflowTemplateSchema.parse(template);
    const database = await this.openDatabase();
    const transaction = database.transaction(WORKFLOW_STORE, 'readwrite');
    transaction.objectStore(WORKFLOW_STORE).put(parsed);
    await transactionDone(transaction);
  }

  async deleteWorkflowTemplate(workflowTemplateId: ComfyWorkflowTemplateId): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(WORKFLOW_STORE, 'readwrite');
    transaction.objectStore(WORKFLOW_STORE).delete(workflowTemplateId);
    await transactionDone(transaction);
  }

  async listProfileProbeResults(profileId: ImageApiProfileId): Promise<ImageProfileProbeResult[]> {
    const database = await this.openDatabase();
    const store = database.transaction(PROBE_RESULT_STORE, 'readonly').objectStore(PROBE_RESULT_STORE);
    const records = await requestResult(store.index(PROFILE_ID_INDEX).getAll(IDBKeyRange.only(profileId)));
    return records
      .map((record) => imageProfileProbeResultSchema.parse(record))
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  }

  async putProfileProbeResult(result: ImageProfileProbeResult): Promise<void> {
    const parsed = imageProfileProbeResultSchema.parse(result);
    const database = await this.openDatabase();
    const transaction = database.transaction(PROBE_RESULT_STORE, 'readwrite');
    transaction.objectStore(PROBE_RESULT_STORE).put(parsed);
    await transactionDone(transaction);
  }

  async clearProfileProbeResults(profileId: ImageApiProfileId): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(PROBE_RESULT_STORE, 'readwrite');
    const store = transaction.objectStore(PROBE_RESULT_STORE);
    const request = store.index(PROFILE_ID_INDEX).openKeyCursor(IDBKeyRange.only(profileId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    await transactionDone(transaction);
  }

  async clearAll(): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(
      [PROFILE_STORE, WORKFLOW_STORE, PROBE_RESULT_STORE],
      'readwrite'
    );
    transaction.objectStore(PROFILE_STORE).clear();
    transaction.objectStore(WORKFLOW_STORE).clear();
    transaction.objectStore(PROBE_RESULT_STORE).clear();
    await transactionDone(transaction);
  }
}
