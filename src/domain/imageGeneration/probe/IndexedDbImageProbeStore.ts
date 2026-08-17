import type { ImageProbeStore } from './ImageProbeStore';
import { parseImageGenerationVerificationRecord, parseImageProbeArtifact } from './schemas';
import type {
  ImageApiProfileId,
  ImageGenerationVerificationRecord,
  ImageProbeArtifact,
  ImageProbeOutcome
} from './types';

const DB_VERSION = 1;
const RECORD_STORE_NAME = 'verification-records';
const ARTIFACT_STORE_NAME = 'probe-artifacts';
const PROFILE_INDEX_NAME = 'by-profile-id';
const MAX_RECORDS_PER_PROFILE = 20;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function newestFirst<T extends { completedAt?: string; createdAt?: string }>(left: T, right: T): number {
  const leftTime = left.completedAt ?? left.createdAt ?? '';
  const rightTime = right.completedAt ?? right.createdAt ?? '';
  return rightTime.localeCompare(leftTime);
}

function parseStoredArtifact(value: unknown): ImageProbeArtifact {
  if (!value || typeof value !== 'object') throw new Error('测试图片存储记录无效。');
  const { bytes, ...metadata } = value as { bytes?: unknown } & Record<string, unknown>;
  if (Object.prototype.toString.call(bytes) !== '[object ArrayBuffer]') {
    throw new Error('测试图片二进制存储无效。');
  }
  const mimeType = typeof metadata.mimeType === 'string' ? metadata.mimeType : '';
  return parseImageProbeArtifact({
    ...metadata,
    blob: new Blob([bytes as ArrayBuffer], { type: mimeType })
  });
}

export class IndexedDbImageProbeStore implements ImageProbeStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dbName = 'sorry-im-a-cop-v2-image-probes') {}

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const recordStore = db.objectStoreNames.contains(RECORD_STORE_NAME)
          ? request.transaction?.objectStore(RECORD_STORE_NAME)
          : db.createObjectStore(RECORD_STORE_NAME, { keyPath: 'verificationId' });
        const artifactStore = db.objectStoreNames.contains(ARTIFACT_STORE_NAME)
          ? request.transaction?.objectStore(ARTIFACT_STORE_NAME)
          : db.createObjectStore(ARTIFACT_STORE_NAME, { keyPath: 'artifactId' });
        if (recordStore && !recordStore.indexNames.contains(PROFILE_INDEX_NAME)) {
          recordStore.createIndex(PROFILE_INDEX_NAME, 'profileId', { unique: false });
        }
        if (artifactStore && !artifactStore.indexNames.contains(PROFILE_INDEX_NAME)) {
          artifactStore.createIndex(PROFILE_INDEX_NAME, 'profileId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开图片探针数据库。'));
    });
  }

  private enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  async listRecords(profileId: ImageApiProfileId): Promise<ImageGenerationVerificationRecord[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction(RECORD_STORE_NAME, 'readonly');
      const records = await requestToPromise<unknown[]>(
        transaction.objectStore(RECORD_STORE_NAME).index(PROFILE_INDEX_NAME).getAll(profileId)
      );
      return records.map(parseImageGenerationVerificationRecord).sort(newestFirst);
    } finally {
      db.close();
    }
  }

  private async listArtifacts(profileId: ImageApiProfileId): Promise<ImageProbeArtifact[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction(ARTIFACT_STORE_NAME, 'readonly');
      const artifacts = await requestToPromise<unknown[]>(
        transaction.objectStore(ARTIFACT_STORE_NAME).index(PROFILE_INDEX_NAME).getAll(profileId)
      );
      return artifacts.map(parseStoredArtifact).sort(newestFirst);
    } finally {
      db.close();
    }
  }

  async getLatestArtifact(profileId: ImageApiProfileId): Promise<ImageProbeArtifact | null> {
    return (await this.listArtifacts(profileId))[0] ?? null;
  }

  async saveOutcome(outcome: ImageProbeOutcome): Promise<void> {
    return this.enqueueWrite(async () => {
      const record = parseImageGenerationVerificationRecord(outcome.record);
      const artifact = outcome.artifact ? parseImageProbeArtifact(outcome.artifact) : undefined;
      const passed = record.verdict === 'real-passed' || record.verdict === 'mock-passed';
      if (passed !== Boolean(artifact)) {
        throw new Error('新写入的探针通过记录必须与测试图片在同一事务保存。');
      }
      if (record.probeArtifactId !== artifact?.artifactId) {
        throw new Error('探针记录与测试图片关联不一致。');
      }
      if (
        artifact &&
        (artifact.verificationId !== record.verificationId ||
          artifact.profileId !== record.profileId ||
          artifact.providerType !== record.providerType ||
          artifact.executionFingerprint !== record.executionFingerprint)
      ) {
        throw new Error('探针记录与测试图片元数据不一致。');
      }

      const [existingRecords, existingArtifacts] = await Promise.all([
        this.listRecords(record.profileId),
        this.listArtifacts(record.profileId)
      ]);
      if (existingRecords.some((item) => item.verificationId === record.verificationId)) {
        throw new Error('探针记录不可覆盖；必须创建新的 verificationId。');
      }
      const historicalRecords = artifact
        ? existingRecords.map((item) => (item.probeArtifactId ? { ...item, probeArtifactId: undefined } : item))
        : existingRecords;
      const retainedRecords = [record, ...historicalRecords.filter((item) => item.verificationId !== record.verificationId)]
        .sort(newestFirst)
        .slice(0, MAX_RECORDS_PER_PROFILE);
      const retainedIds = new Set(retainedRecords.map((item) => item.verificationId));
      const storedArtifact = artifact
        ? await (async () => {
            const { blob, ...metadata } = artifact;
            return { ...metadata, bytes: await blob.arrayBuffer() };
          })()
        : undefined;

      const db = await this.open();
      try {
        const transaction = db.transaction([RECORD_STORE_NAME, ARTIFACT_STORE_NAME], 'readwrite');
        const done = transactionDone(transaction);
        const recordStore = transaction.objectStore(RECORD_STORE_NAME);
        const artifactStore = transaction.objectStore(ARTIFACT_STORE_NAME);
        try {
          recordStore.put(record);
          for (const existing of historicalRecords) {
            if (retainedIds.has(existing.verificationId)) recordStore.put(existing);
          }
          for (const existing of existingRecords) {
            if (!retainedIds.has(existing.verificationId)) recordStore.delete(existing.verificationId);
          }
          if (artifact) {
            for (const existing of existingArtifacts) artifactStore.delete(existing.artifactId);
            artifactStore.put(storedArtifact);
          }
        } catch (error) {
          transaction.abort();
          await done.catch(() => undefined);
          throw error;
        }
        await done;
      } finally {
        db.close();
      }
    });
  }

  async clearProfile(profileId: ImageApiProfileId): Promise<void> {
    return this.enqueueWrite(async () => {
      const [records, artifacts] = await Promise.all([this.listRecords(profileId), this.listArtifacts(profileId)]);
      const db = await this.open();
      try {
        const transaction = db.transaction([RECORD_STORE_NAME, ARTIFACT_STORE_NAME], 'readwrite');
        const recordStore = transaction.objectStore(RECORD_STORE_NAME);
        const artifactStore = transaction.objectStore(ARTIFACT_STORE_NAME);
        for (const record of records) recordStore.delete(record.verificationId);
        for (const artifact of artifacts) artifactStore.delete(artifact.artifactId);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
  }

  async clearAll(): Promise<void> {
    return this.enqueueWrite(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction([RECORD_STORE_NAME, ARTIFACT_STORE_NAME], 'readwrite');
        transaction.objectStore(RECORD_STORE_NAME).clear();
        transaction.objectStore(ARTIFACT_STORE_NAME).clear();
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
  }
}
