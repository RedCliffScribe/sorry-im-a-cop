import { imageApiCredentialSchema } from './schemas';
import type { ImageCredentialRepository } from './repositories';
import type { ImageApiCredential, ImageApiCredentialId, ImageApiCredentialSummary } from './types';

const DEFAULT_DATABASE_NAME = 'sorry-im-a-cop-v2-image-credentials';
const DATABASE_VERSION = 1;
const CREDENTIAL_STORE = 'credentials';

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

function maskSecret(secret: string): string {
  const suffix = secret.slice(-4);
  return suffix ? `••••${suffix}` : '••••';
}

function toSummary(credential: ImageApiCredential): ImageApiCredentialSummary {
  const maskedHint = credential.material.kind === 'basic-auth'
    ? 'Basic · 用户名与密码已保存'
    : maskSecret(credential.material.kind === 'bearer-token' ? credential.material.token : credential.material.apiKey);
  return {
    credentialId: credential.credentialId,
    label: credential.label,
    providerAffinity: credential.providerAffinity,
    materialKind: credential.material.kind,
    maskedHint,
    revision: credential.revision,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt
  };
}

export class IndexedDbImageCredentialRepository implements ImageCredentialRepository {
  private databasePromise?: Promise<IDBDatabase>;

  constructor(private readonly databaseName = DEFAULT_DATABASE_NAME) {}

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(CREDENTIAL_STORE)) {
          request.result.createObjectStore(CREDENTIAL_STORE, { keyPath: 'credentialId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开图片凭据数据库。'));
    });
    return this.databasePromise;
  }

  async listCredentialSummaries(): Promise<ImageApiCredentialSummary[]> {
    const database = await this.openDatabase();
    const records = await requestResult(
      database.transaction(CREDENTIAL_STORE, 'readonly').objectStore(CREDENTIAL_STORE).getAll()
    );
    return records
      .map((record) => toSummary(imageApiCredentialSchema.parse(record)))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getCredentialSummary(credentialId: ImageApiCredentialId): Promise<ImageApiCredentialSummary | null> {
    const credential = await this.resolveCredential(credentialId);
    return credential ? toSummary(credential) : null;
  }

  async resolveCredential(credentialId: ImageApiCredentialId): Promise<ImageApiCredential | null> {
    const database = await this.openDatabase();
    const record = await requestResult(
      database.transaction(CREDENTIAL_STORE, 'readonly').objectStore(CREDENTIAL_STORE).get(credentialId)
    );
    return record === undefined ? null : imageApiCredentialSchema.parse(record);
  }

  async putCredential(credential: ImageApiCredential): Promise<void> {
    const parsed = imageApiCredentialSchema.parse(credential);
    const database = await this.openDatabase();
    const transaction = database.transaction(CREDENTIAL_STORE, 'readwrite');
    transaction.objectStore(CREDENTIAL_STORE).put(parsed);
    await transactionDone(transaction);
  }

  async deleteCredential(credentialId: ImageApiCredentialId): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(CREDENTIAL_STORE, 'readwrite');
    transaction.objectStore(CREDENTIAL_STORE).delete(credentialId);
    await transactionDone(transaction);
  }

  async clearAll(): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(CREDENTIAL_STORE, 'readwrite');
    transaction.objectStore(CREDENTIAL_STORE).clear();
    await transactionDone(transaction);
  }
}
