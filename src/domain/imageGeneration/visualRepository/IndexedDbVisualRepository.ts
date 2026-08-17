import { createGeneratedImage } from '../providers/providerProtocol';
import {
  characterImageGenerationBatchSchema,
  characterVisualAnchorSchema,
  createEmptyVisualRepositorySnapshot,
  imageGenerationTaskSchema,
  parseVisualRepositorySnapshot,
  storedScenePlanSchema,
  storySceneDisplayStateSchema,
  visualBindingSchema,
  visualRepositorySnapshotSchema
} from './schemas';
import { assertTaskEvolution, succeedTask } from './taskStateMachine';
import type {
  CharacterImageGenerationBatch,
  CharacterVisualAnchor,
  ImageGenerationTask,
  PortableVisualBlob,
  StorySceneDisplayState,
  StoredScenePlan,
  VisualArchiveData,
  VisualAsset,
  VisualBinding,
  VisualGenerationIntent,
  VisualImageInput,
  VisualRepositorySnapshot,
  VisualSubjectRef,
  UserVisualImageImport,
  UserVisualImageImportResult
} from './types';
import type {
  VisualAssetBlobRestoreInput,
  VisualAssetDeletionImpact,
  VisualRepository,
  VisualStorageCleanupResult,
  VisualStorageIntegrityOptions,
  VisualStorageIntegrityReport,
  VisualStorageIssue,
  VisualStorageSummary
} from './VisualRepository';

export const DEFAULT_VISUAL_REPOSITORY_DB_NAME = 'sorry-im-a-cop-v2-visuals';
const DB_VERSION = 1;
const PARTITION_STORE = 'visual-partitions';
const BLOB_STORE = 'visual-blobs';
const SAVE_INDEX = 'by-save-id';

interface StoredVisualBlob {
  blobKey: string;
  saveId: string;
  imageId: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

interface NormalizedImage {
  imageId: string;
  blobKey: string;
  blob: Blob;
  bytes: ArrayBuffer;
  mimeType: VisualAsset['mimeType'];
  width: number;
  height: number;
  byteLength: number;
  contentHash: string;
}

interface StoredBlobInspection {
  storageKey?: string;
  blobKey?: string;
  saveId?: string;
  imageId?: string;
  mimeType?: string;
  byteLength: number;
  valid: boolean;
}

interface StorageInventory {
  snapshot: VisualRepositorySnapshot;
  storedRows: StoredBlobInspection[];
}

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

function inspectStoredBlobsForSave(index: IDBIndex, saveId: string): Promise<StoredBlobInspection[]> {
  return new Promise((resolve, reject) => {
    const rows: StoredBlobInspection[] = [];
    const request = index.openCursor(IDBKeyRange.only(saveId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(rows);
        return;
      }
      rows.push(inspectStoredBlob(cursor.value, cursor.primaryKey));
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error('视觉 Blob 清单读取失败。'));
  });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function normalizeImage(input: VisualImageInput): Promise<NormalizedImage> {
  if (!Number.isInteger(input.width) || input.width <= 0 || !Number.isInteger(input.height) || input.height <= 0) {
    throw new Error('图片真实宽高必须是正整数。');
  }
  const sourceBytes = new Uint8Array(await input.blob.arrayBuffer());
  const generated = createGeneratedImage(sourceBytes, input.blob.type || undefined, {
    width: input.width,
    height: input.height
  });
  const bytes = generated.bytes;
  const normalizedBlob = new Blob([bytes], { type: generated.mimeType });
  return {
    imageId: input.imageId,
    blobKey: input.blobKey,
    blob: normalizedBlob,
    bytes,
    mimeType: generated.mimeType as VisualAsset['mimeType'],
    width: input.width,
    height: input.height,
    byteLength: bytes.byteLength,
    contentHash: await sha256Hex(bytes)
  };
}

function parseStoredBlob(value: unknown): PortableVisualBlob {
  if (!value || typeof value !== 'object') throw new Error('视觉 Blob 存储记录无效。');
  const row = value as Partial<StoredVisualBlob>;
  if (
    typeof row.blobKey !== 'string' ||
    typeof row.imageId !== 'string' ||
    typeof row.mimeType !== 'string' ||
    Object.prototype.toString.call(row.bytes) !== '[object ArrayBuffer]'
  ) {
    throw new Error('视觉 Blob 字段无效。');
  }
  return {
    blobKey: row.blobKey,
    imageId: row.imageId,
    blob: new Blob([row.bytes as ArrayBuffer], { type: row.mimeType })
  };
}

function inspectStoredBlob(value: unknown, storageKey?: IDBValidKey): StoredBlobInspection {
  if (!value || typeof value !== 'object') {
    return {
      storageKey: typeof storageKey === 'string' ? storageKey : undefined,
      byteLength: 0,
      valid: false
    };
  }
  const row = value as Partial<StoredVisualBlob>;
  const hasBytes = Object.prototype.toString.call(row.bytes) === '[object ArrayBuffer]';
  return {
    storageKey: typeof storageKey === 'string' ? storageKey : undefined,
    blobKey: typeof row.blobKey === 'string' ? row.blobKey : undefined,
    saveId: typeof row.saveId === 'string' ? row.saveId : undefined,
    imageId: typeof row.imageId === 'string' ? row.imageId : undefined,
    mimeType: typeof row.mimeType === 'string' ? row.mimeType : undefined,
    byteLength: hasBytes ? (row.bytes as ArrayBuffer).byteLength : 0,
    valid: (
      typeof row.blobKey === 'string' &&
      typeof row.imageId === 'string' &&
      typeof row.mimeType === 'string' &&
      hasBytes
    )
  };
}

function issueSortKey(issue: VisualStorageIssue): string {
  return [issue.kind, issue.imageId ?? '', issue.blobKey ?? '', issue.reason].join('\u001f');
}

function cleanupIssueIdentity(issue: VisualStorageIssue): string {
  return [
    issue.kind,
    issue.reason,
    issue.imageId ?? '',
    issue.blobKey ?? '',
    issue.byteLength,
    issue.actualContentHash ?? ''
  ].join('\u001f');
}

function analyzeStorageInventory(
  saveId: string,
  snapshot: VisualRepositorySnapshot,
  storedRows: StoredBlobInspection[]
): { summary: VisualStorageSummary; issues: VisualStorageIssue[] } {
  const rowByBlobKey = new Map<string, StoredBlobInspection>();
  storedRows.forEach((row) => {
    const key = row.storageKey ?? row.blobKey;
    if (key) rowByBlobKey.set(key, row);
  });
  const assets = Object.values(snapshot.assets);
  const referencedBlobKeys = new Set(assets.map((asset) => asset.blobKey));
  const issues: VisualStorageIssue[] = [];

  assets.forEach((asset) => {
    const row = rowByBlobKey.get(asset.blobKey);
    if (!row) {
      issues.push({
        kind: 'missing',
        reason: 'blob-missing',
        imageId: asset.imageId,
        blobKey: asset.blobKey,
        byteLength: 0
      });
      return;
    }
    const reason = !row.valid
      ? 'blob-structure-invalid'
      : row.imageId !== asset.imageId
        ? 'image-id-mismatch'
        : row.mimeType !== asset.mimeType
          ? 'mime-type-mismatch'
          : row.byteLength !== asset.byteLength
            ? 'byte-length-mismatch'
            : undefined;
    if (reason) {
      issues.push({
        kind: 'corrupt',
        reason,
        imageId: asset.imageId,
        blobKey: asset.blobKey,
        byteLength: row.byteLength
      });
    }
  });

  storedRows.forEach((row) => {
    const blobKey = row.storageKey ?? row.blobKey;
    if (blobKey && referencedBlobKeys.has(blobKey)) return;
    issues.push({
      kind: 'orphan',
      reason: 'unreferenced-blob',
      imageId: row.imageId,
      blobKey,
      byteLength: row.byteLength
    });
  });

  issues.sort((left, right) => issueSortKey(left).localeCompare(issueSortKey(right)));
  const missingImageIds = issues
    .filter((issue) => issue.kind === 'missing' && issue.imageId)
    .map((issue) => issue.imageId as string)
    .sort();
  const corruptIssues = issues.filter((issue) => issue.kind === 'corrupt');
  const corruptImageIds = Array.from(new Set(corruptIssues
    .map((issue) => issue.imageId)
    .filter((imageId): imageId is string => Boolean(imageId)))).sort();
  const corruptBlobKeys = new Set(corruptIssues.map((issue) => issue.blobKey ?? `image:${issue.imageId ?? ''}`));
  return {
    summary: {
      saveId,
      metadataAssetCount: assets.length,
      storedBlobCount: storedRows.length,
      storedBytes: storedRows.reduce((total, row) => total + row.byteLength, 0),
      missingBlobCount: missingImageIds.length,
      missingImageIds,
      corruptBlobCount: corruptBlobKeys.size,
      corruptImageIds,
      orphanBlobCount: issues.filter((issue) => issue.kind === 'orphan').length
    },
    issues
  };
}

function storageInventorySignature(inventory: StorageInventory): string {
  const assets = Object.values(inventory.snapshot.assets)
    .map((asset) => [
      asset.imageId,
      asset.blobKey,
      asset.mimeType,
      asset.byteLength,
      asset.contentHash
    ])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  const rows = inventory.storedRows
    .map((row) => [
      row.storageKey ?? '',
      row.blobKey ?? '',
      row.saveId ?? '',
      row.imageId ?? '',
      row.mimeType ?? '',
      row.byteLength,
      row.valid
    ])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return JSON.stringify({ assets, rows });
}

function throwIfInspectionAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('视觉资料深度检查已取消。', 'AbortError');
}

function subjectAndPurpose(intent: VisualGenerationIntent): {
  subject: VisualSubjectRef;
  purpose: VisualAsset['originPurpose'];
  variantKey?: string;
} {
  if (intent.type === 'character-image') {
    return {
      subject: { type: 'actor', saveId: intent.saveId, actorId: intent.actorId },
      purpose: intent.purpose
    };
  }
  return {
    subject: {
      type: 'scene-shot',
      saveId: intent.saveId,
      turnId: intent.turnId,
      scenePlanId: intent.scenePlanId,
      shotId: intent.shotId
    },
    purpose: 'turn-scene',
    variantKey: intent.shotId
  };
}

function subjectKey(subject: VisualSubjectRef): string {
  if (subject.type === 'actor') return `actor:${subject.actorId}`;
  if (subject.type === 'story-turn') return `turn:${subject.turnId}`;
  return `shot:${subject.turnId}:${subject.scenePlanId}:${subject.shotId}`;
}

export function createVisualBindingId(
  saveId: string,
  subject: VisualSubjectRef,
  purpose: VisualAsset['originPurpose'],
  variantKey?: string
): string {
  return ['binding', saveId, subjectKey(subject), purpose ?? '', variantKey ?? ''].map(encodeURIComponent).join(':');
}

function createBinding(task: ImageGenerationTask, imageId: string, updatedAt: string): VisualBinding {
  const { subject, purpose, variantKey } = subjectAndPurpose(task.intent);
  if (!purpose) throw new Error('任务图片用途无效。');
  return {
    bindingId: createVisualBindingId(task.saveId, subject, purpose, variantKey),
    saveId: task.saveId,
    subject,
    purpose,
    variantKey,
    imageId,
    updatedAt
  };
}

function assertSceneDisplayCanChange(state: StorySceneDisplayState | undefined): void {
  if (state?.pendingReplacement) {
    throw new Error('场景替换任务仍在结算，暂时不能修改该回合的图片绑定。');
  }
}

function removeSceneShotFromDisplay(
  snapshot: VisualRepositorySnapshot,
  binding: VisualBinding,
  updatedAt: string
): void {
  if (binding.subject.type !== 'scene-shot' || binding.purpose !== 'turn-scene') return;
  const { turnId, shotId } = binding.subject;
  const state = snapshot.storySceneDisplayStates[turnId];
  if (!state) return;
  assertSceneDisplayCanChange(state);
  snapshot.storySceneDisplayStates[turnId] = storySceneDisplayStateSchema.parse({
    ...state,
    activeShotIds: state.activeShotIds.filter((activeShotId) => activeShotId !== shotId),
    updatedAt
  });
}

export class VisualAssetBoundError extends Error {
  constructor(readonly impact: VisualAssetDeletionImpact) {
    super('图片仍在使用中，删除前必须明确确认解除全部绑定。');
    this.name = 'VisualAssetBoundError';
  }
}

export class VisualStorageQuotaError extends Error {
  readonly code = 'quota-exceeded';

  constructor(readonly originalError: unknown) {
    super('本地图片存储空间不足；本次写入已回滚，现有图片与绑定没有被部分改动。');
    this.name = 'VisualStorageQuotaError';
  }
}

export class VisualAssetBlobMismatchError extends Error {
  readonly code = 'asset-blob-mismatch';

  constructor(
    readonly imageId: string,
    readonly expected: Pick<VisualAsset, 'mimeType' | 'width' | 'height' | 'byteLength' | 'contentHash'>,
    readonly actual: Pick<VisualAsset, 'mimeType' | 'width' | 'height' | 'byteLength' | 'contentHash'>
  ) {
    super('所选文件与原图片的格式、尺寸、大小或哈希不一致，不能覆盖原资产。');
    this.name = 'VisualAssetBlobMismatchError';
  }
}

function normalizeVisualStorageError(error: unknown): unknown {
  const errorName = error && typeof error === 'object' && 'name' in error
    ? String(error.name)
    : '';
  if (
    error instanceof VisualStorageQuotaError ||
    errorName !== 'QuotaExceededError'
  ) {
    return error;
  }
  return new VisualStorageQuotaError(error);
}

export class IndexedDbVisualRepository implements VisualRepository {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dbName = DEFAULT_VISUAL_REPOSITORY_DB_NAME) {}

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PARTITION_STORE)) {
          db.createObjectStore(PARTITION_STORE, { keyPath: 'saveId' });
        }
        const blobStore = db.objectStoreNames.contains(BLOB_STORE)
          ? request.transaction?.objectStore(BLOB_STORE)
          : db.createObjectStore(BLOB_STORE, { keyPath: 'blobKey' });
        if (blobStore && !blobStore.indexNames.contains(SAVE_INDEX)) {
          blobStore.createIndex(SAVE_INDEX, 'saveId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开视觉资料数据库。'));
    });
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const guardedOperation = async () => {
      try {
        return await operation();
      } catch (error) {
        throw normalizeVisualStorageError(error);
      }
    };
    const next = this.writeQueue.then(guardedOperation, guardedOperation);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  async loadSnapshot(saveId: string): Promise<VisualRepositorySnapshot> {
    const db = await this.open();
    try {
      const transaction = db.transaction(PARTITION_STORE, 'readonly');
      const value = await requestToPromise<unknown>(transaction.objectStore(PARTITION_STORE).get(saveId));
      return value === undefined ? createEmptyVisualRepositorySnapshot(saveId) : parseVisualRepositorySnapshot(value);
    } finally {
      db.close();
    }
  }

  private async loadStorageInventory(saveId: string): Promise<StorageInventory> {
    const db = await this.open();
    try {
      const transaction = db.transaction([PARTITION_STORE, BLOB_STORE], 'readonly');
      const done = transactionDone(transaction);
      const [stored, storedRows] = await Promise.all([
        requestToPromise<unknown>(transaction.objectStore(PARTITION_STORE).get(saveId)),
        inspectStoredBlobsForSave(transaction.objectStore(BLOB_STORE).index(SAVE_INDEX), saveId)
      ]);
      await done;
      return {
        snapshot: stored === undefined
          ? createEmptyVisualRepositorySnapshot(saveId)
          : parseVisualRepositorySnapshot(stored),
        storedRows
      };
    } finally {
      db.close();
    }
  }

  async getStorageSummary(saveId: string): Promise<VisualStorageSummary> {
    const inventory = await this.loadStorageInventory(saveId);
    return analyzeStorageInventory(saveId, inventory.snapshot, inventory.storedRows).summary;
  }

  async inspectStorageIntegrity(
    saveId: string,
    options: VisualStorageIntegrityOptions = {}
  ): Promise<VisualStorageIntegrityReport> {
    throwIfInspectionAborted(options.signal);
    const initialInventory = await this.loadStorageInventory(saveId);
    const initialSignature = storageInventorySignature(initialInventory);
    const analysis = analyzeStorageInventory(
      saveId,
      initialInventory.snapshot,
      initialInventory.storedRows
    );
    const initialUnavailableImageIds = new Set(analysis.issues
      .filter((issue) => issue.kind !== 'orphan')
      .map((issue) => issue.imageId)
      .filter((imageId): imageId is string => Boolean(imageId)));
    const candidates = Object.values(initialInventory.snapshot.assets)
      .filter((asset) => !initialUnavailableImageIds.has(asset.imageId))
      .sort((left, right) => left.imageId.localeCompare(right.imageId));
    const issues = [...analysis.issues];
    let checkedBlobCount = 0;
    options.onProgress?.({ checkedBlobCount, totalBlobCount: candidates.length });

    for (const asset of candidates) {
      throwIfInspectionAborted(options.signal);
      try {
        const blob = await this.getBlob(asset.blobKey);
        if (!blob) {
          issues.push({
            kind: 'missing',
            reason: 'blob-missing',
            imageId: asset.imageId,
            blobKey: asset.blobKey,
            byteLength: 0
          });
        } else {
          const bytes = await blob.arrayBuffer();
          const actualContentHash = await sha256Hex(bytes);
          if (actualContentHash !== asset.contentHash) {
            issues.push({
              kind: 'corrupt',
              reason: 'content-hash-mismatch',
              imageId: asset.imageId,
              blobKey: asset.blobKey,
              byteLength: bytes.byteLength,
              actualContentHash
            });
          }
        }
      } catch {
        if (options.signal?.aborted) throw new DOMException('视觉资料深度检查已取消。', 'AbortError');
        issues.push({
          kind: 'corrupt',
          reason: 'blob-structure-invalid',
          imageId: asset.imageId,
          blobKey: asset.blobKey,
          byteLength: asset.byteLength
        });
      } finally {
        checkedBlobCount += 1;
        options.onProgress?.({ checkedBlobCount, totalBlobCount: candidates.length });
      }
    }

    throwIfInspectionAborted(options.signal);
    const finalInventory = await this.loadStorageInventory(saveId);
    if (storageInventorySignature(finalInventory) !== initialSignature) {
      throw new Error('视觉仓库在深度检查期间发生变化，请重新检查。');
    }
    issues.sort((left, right) => issueSortKey(left).localeCompare(issueSortKey(right)));
    const missingImageIds = Array.from(new Set(issues
      .filter((issue) => issue.kind === 'missing')
      .map((issue) => issue.imageId)
      .filter((imageId): imageId is string => Boolean(imageId)))).sort();
    const corruptIssues = issues.filter((issue) => issue.kind === 'corrupt');
    const corruptImageIds = Array.from(new Set(corruptIssues
      .map((issue) => issue.imageId)
      .filter((imageId): imageId is string => Boolean(imageId)))).sort();
    const corruptBlobKeys = new Set(corruptIssues.map((issue) => issue.blobKey ?? `image:${issue.imageId ?? ''}`));
    return {
      checkedAt: new Date().toISOString(),
      deepCheckedBlobCount: checkedBlobCount,
      issues,
      summary: {
        ...analysis.summary,
        missingBlobCount: missingImageIds.length,
        missingImageIds,
        corruptBlobCount: corruptBlobKeys.size,
        corruptImageIds
      }
    };
  }

  async cleanupStorageIssues(
    saveId: string,
    expectedIssues: readonly VisualStorageIssue[]
  ): Promise<VisualStorageCleanupResult> {
    const candidates = expectedIssues.filter((issue) => issue.kind !== 'missing' && issue.blobKey);
    if (!candidates.length) {
      return { removedBlobCount: 0, removedBytes: 0, affectedImageIds: [] };
    }
    return this.enqueueWrite(async () => {
      const currentReport = await this.inspectStorageIntegrity(saveId);
      const currentIssueByIdentity = new Map(currentReport.issues.map((issue) => [
        cleanupIssueIdentity(issue),
        issue
      ]));
      const currentIssues = candidates.map((issue) => {
        const current = currentIssueByIdentity.get(cleanupIssueIdentity(issue));
        if (!current) throw new Error('视觉仓库自检查后已发生变化，请重新检查再清理。');
        return current;
      });
      const blobKeys = Array.from(new Set(currentIssues
        .map((issue) => issue.blobKey)
        .filter((blobKey): blobKey is string => Boolean(blobKey))));
      const db = await this.open();
      try {
        const transaction = db.transaction([PARTITION_STORE, BLOB_STORE], 'readwrite');
        const done = transactionDone(transaction);
        try {
          const partitionStore = transaction.objectStore(PARTITION_STORE);
          const blobStore = transaction.objectStore(BLOB_STORE);
          const partitionRequest = requestToPromise<unknown>(partitionStore.get(saveId));
          const rowRequests = blobKeys.map((blobKey) => requestToPromise<unknown>(blobStore.get(blobKey)));
          const [stored, rows] = await Promise.all([
            partitionRequest,
            Promise.all(rowRequests)
          ]);
          const snapshot = stored === undefined
            ? createEmptyVisualRepositorySnapshot(saveId)
            : parseVisualRepositorySnapshot(stored);
          const referencedBlobKeys = new Set(Object.values(snapshot.assets).map((asset) => asset.blobKey));
          blobKeys.forEach((blobKey, index) => {
            const value = rows[index];
            if (value === undefined) throw new Error('待清理的视觉文件已经不存在，请重新检查。');
            const row = value as Partial<StoredVisualBlob>;
            if (row.saveId !== saveId) throw new Error('拒绝清理其他存档分区的视觉文件。');
            const relatedIssues = currentIssues.filter((issue) => issue.blobKey === blobKey);
            const orphan = relatedIssues.some((issue) => issue.kind === 'orphan');
            const corruptImageIds = relatedIssues
              .filter((issue) => issue.kind === 'corrupt' && issue.imageId)
              .map((issue) => issue.imageId as string);
            if (orphan && referencedBlobKeys.has(blobKey)) {
              throw new Error('待清理文件已经重新被资产引用，请重新检查。');
            }
            if (corruptImageIds.some((imageId) => snapshot.assets[imageId]?.blobKey !== blobKey)) {
              throw new Error('损坏文件与资产的关系已经变化，请重新检查。');
            }
            if (corruptImageIds.some((imageId) => snapshot.assets[imageId]?.source === 'builtin')) {
              throw new Error('游戏内置美术属于只读域，不能通过视觉仓库维护操作删除。');
            }
            blobStore.delete(blobKey);
          });
        } catch (error) {
          transaction.abort();
          await done.catch(() => undefined);
          throw error;
        }
        await done;
      } finally {
        db.close();
      }
      return {
        removedBlobCount: blobKeys.length,
        removedBytes: blobKeys.reduce((total, blobKey) => (
          total + Math.max(
            ...currentIssues
              .filter((issue) => issue.blobKey === blobKey)
              .map((issue) => issue.byteLength),
            0
          )
        ), 0),
        affectedImageIds: Array.from(new Set(currentIssues
          .map((issue) => issue.imageId)
          .filter((imageId): imageId is string => Boolean(imageId)))).sort()
      };
    });
  }

  async restoreAssetBlob(
    saveId: string,
    imageId: string,
    input: VisualAssetBlobRestoreInput
  ): Promise<VisualAsset> {
    const normalized = await normalizeImage({
      imageId,
      blobKey: `restore:${imageId}`,
      blob: input.blob,
      width: input.width,
      height: input.height
    });
    let restored: VisualAsset | undefined;
    await this.enqueueWrite(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction([PARTITION_STORE, BLOB_STORE], 'readwrite');
        const done = transactionDone(transaction);
        try {
          const stored = await requestToPromise<unknown>(
            transaction.objectStore(PARTITION_STORE).get(saveId)
          );
          const snapshot = stored === undefined
            ? createEmptyVisualRepositorySnapshot(saveId)
            : parseVisualRepositorySnapshot(stored);
          const asset = snapshot.assets[imageId];
          if (!asset || (asset.scope === 'save' && asset.saveId !== saveId)) {
            throw new Error('找不到当前存档中待恢复的图片资产。');
          }
          if (asset.source === 'builtin') throw new Error('游戏内置美术不能写入视觉仓库。');
          const matches = (
            normalized.mimeType === asset.mimeType &&
            normalized.width === asset.width &&
            normalized.height === asset.height &&
            normalized.byteLength === asset.byteLength &&
            normalized.contentHash === asset.contentHash
          );
          if (!matches) {
            throw new VisualAssetBlobMismatchError(
              imageId,
              {
                mimeType: asset.mimeType,
                width: asset.width,
                height: asset.height,
                byteLength: asset.byteLength,
                contentHash: asset.contentHash
              },
              {
                mimeType: normalized.mimeType,
                width: normalized.width,
                height: normalized.height,
                byteLength: normalized.byteLength,
                contentHash: normalized.contentHash
              }
            );
          }
          transaction.objectStore(BLOB_STORE).put({
            blobKey: asset.blobKey,
            saveId,
            imageId: asset.imageId,
            mimeType: asset.mimeType,
            bytes: normalized.bytes
          } satisfies StoredVisualBlob);
          restored = asset;
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
    if (!restored) throw new Error('图片文件恢复未完成。');
    return restored;
  }

  private mutateSnapshot(
    saveId: string,
    stores: string[],
    mutation: (snapshot: VisualRepositorySnapshot, transaction: IDBTransaction) => void
  ): Promise<void> {
    return this.enqueueWrite(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction(Array.from(new Set([PARTITION_STORE, ...stores])), 'readwrite');
        const done = transactionDone(transaction);
        try {
          const partitionStore = transaction.objectStore(PARTITION_STORE);
          const stored = await requestToPromise<unknown>(partitionStore.get(saveId));
          const snapshot = stored === undefined
            ? createEmptyVisualRepositorySnapshot(saveId)
            : parseVisualRepositorySnapshot(stored);
          mutation(snapshot, transaction);
          partitionStore.put(visualRepositorySnapshotSchema.parse(snapshot));
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

  saveCharacterAnchor(anchor: CharacterVisualAnchor): Promise<void> {
    const parsed = characterVisualAnchorSchema.parse(anchor);
    return this.mutateSnapshot(parsed.saveId, [], (snapshot) => {
      for (const [anchorId, existing] of Object.entries(snapshot.characterAnchors)) {
        if (existing.actorId === parsed.actorId && anchorId !== parsed.anchorId) {
          delete snapshot.characterAnchors[anchorId];
        }
      }
      snapshot.characterAnchors[parsed.anchorId] = parsed;
    });
  }

  saveScenePlan(plan: StoredScenePlan): Promise<void> {
    const parsed = storedScenePlanSchema.parse(plan);
    return this.mutateSnapshot(parsed.saveId, [], (snapshot) => {
      const existing = snapshot.scenePlans[parsed.planId];
      if (existing && JSON.stringify(existing) !== JSON.stringify(parsed)) {
        throw new Error('ScenePlan 不可原地改写。');
      }
      snapshot.scenePlans[parsed.planId] = parsed;
    });
  }

  saveScenePlanWithTasks(plan: StoredScenePlan, tasks: ImageGenerationTask[]): Promise<void> {
    const parsedPlan = storedScenePlanSchema.parse(plan);
    const parsedTasks = tasks.map((task) => imageGenerationTaskSchema.parse(task));
    const taskIds = new Set(parsedTasks.map((task) => task.taskId));
    if (taskIds.size !== parsedTasks.length) throw new Error('场景计划包含重复 taskId。');
    if (parsedTasks.some((task) => {
      if (task.saveId !== parsedPlan.saveId || task.intent.type !== 'scene-image') return true;
      const intent = task.intent;
      return intent.scenePlanId !== parsedPlan.planId ||
        !parsedPlan.shots.some((shot) => shot.shotId === intent.shotId);
    })) {
      throw new Error('场景计划与任务集合不一致。');
    }
    if (parsedTasks.length !== parsedPlan.shots.length) throw new Error('每个场景镜头必须恰好对应一个任务。');
    return this.mutateSnapshot(parsedPlan.saveId, [], (snapshot) => {
      const existingPlan = snapshot.scenePlans[parsedPlan.planId];
      if (existingPlan && JSON.stringify(existingPlan) !== JSON.stringify(parsedPlan)) {
        throw new Error('ScenePlan 不可原地改写。');
      }
      for (const task of parsedTasks) {
        const existingTask = snapshot.tasks[task.taskId];
        if (existingTask && JSON.stringify(existingTask) !== JSON.stringify(task)) {
          assertTaskEvolution(existingTask, task);
        }
        snapshot.tasks[task.taskId] = task;
      }
      snapshot.scenePlans[parsedPlan.planId] = parsedPlan;
    });
  }

  saveTask(task: ImageGenerationTask): Promise<void> {
    const parsed = imageGenerationTaskSchema.parse(task);
    return this.mutateSnapshot(parsed.saveId, [], (snapshot) => {
      const existing = snapshot.tasks[parsed.taskId];
      if (existing && JSON.stringify(existing) !== JSON.stringify(parsed)) assertTaskEvolution(existing, parsed);
      snapshot.tasks[parsed.taskId] = parsed;
    });
  }

  saveCharacterBatch(batch: CharacterImageGenerationBatch): Promise<void> {
    const parsed = characterImageGenerationBatchSchema.parse(batch);
    return this.mutateSnapshot(parsed.saveId, [], (snapshot) => {
      const existing = snapshot.characterBatches[parsed.batchId];
      if (existing) {
        const before = { ...existing, status: undefined, updatedAt: undefined };
        const after = { ...parsed, status: undefined, updatedAt: undefined };
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('角色批次不可变字段被改写。');
      }
      snapshot.characterBatches[parsed.batchId] = parsed;
    });
  }

  saveCharacterBatchWithTasks(batch: CharacterImageGenerationBatch, tasks: ImageGenerationTask[]): Promise<void> {
    const parsedBatch = characterImageGenerationBatchSchema.parse(batch);
    const parsedTasks = tasks.map((task) => imageGenerationTaskSchema.parse(task));
    const taskIds = new Set(parsedTasks.map((task) => task.taskId));
    if (taskIds.size !== parsedTasks.length) throw new Error('角色批次包含重复 taskId。');
    if (
      parsedTasks.some((task) => task.saveId !== parsedBatch.saveId) ||
      parsedTasks.some((task) => task.intent.type !== 'character-image' || task.intent.actorId !== parsedBatch.actorId) ||
      parsedBatch.taskIds.some((taskId) => !taskIds.has(taskId)) ||
      parsedBatch.taskIds.length !== parsedTasks.length
    ) {
      throw new Error('角色批次与任务集合不一致。');
    }
    return this.mutateSnapshot(parsedBatch.saveId, [], (snapshot) => {
      const existingBatch = snapshot.characterBatches[parsedBatch.batchId];
      if (existingBatch) {
        const before = { ...existingBatch, status: undefined, updatedAt: undefined };
        const after = { ...parsedBatch, status: undefined, updatedAt: undefined };
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('角色批次不可变字段被改写。');
      }
      for (const task of parsedTasks) {
        const existingTask = snapshot.tasks[task.taskId];
        if (existingTask && JSON.stringify(existingTask) !== JSON.stringify(task)) {
          assertTaskEvolution(existingTask, task);
        }
      }
      parsedTasks.forEach((task) => { snapshot.tasks[task.taskId] = task; });
      snapshot.characterBatches[parsedBatch.batchId] = parsedBatch;
    });
  }

  saveStorySceneDisplayState(state: StorySceneDisplayState): Promise<void> {
    const parsed = storySceneDisplayStateSchema.parse(state);
    return this.mutateSnapshot(parsed.saveId, [], (snapshot) => {
      snapshot.storySceneDisplayStates[parsed.turnId] = parsed;
    });
  }

  bindAsset(binding: VisualBinding): Promise<void> {
    const parsed = visualBindingSchema.parse(binding);
    return this.mutateSnapshot(parsed.saveId, [], (snapshot) => {
      const asset = snapshot.assets[parsed.imageId];
      if (!asset || (asset.scope === 'save' && asset.saveId !== parsed.saveId)) {
        throw new Error('只能绑定当前存档分区中存在的图片。');
      }
      if (parsed.subject.saveId !== parsed.saveId) throw new Error('绑定主体与存档分区不一致。');
      const expectedId = createVisualBindingId(parsed.saveId, parsed.subject, parsed.purpose, parsed.variantKey);
      if (parsed.bindingId !== expectedId) throw new Error('bindingId 与主体、用途不一致。');
      snapshot.bindings[parsed.bindingId] = parsed;
    });
  }

  unbindAsset(saveId: string, bindingId: string): Promise<void> {
    return this.mutateSnapshot(saveId, [], (snapshot) => {
      const binding = snapshot.bindings[bindingId];
      if (!binding) return;
      if (binding.saveId !== saveId) throw new Error('绑定不属于当前存档分区。');
      removeSceneShotFromDisplay(snapshot, binding, new Date().toISOString());
      delete snapshot.bindings[bindingId];
    });
  }

  restoreSceneAssetToStory(saveId: string, imageId: string, updatedAt: string): Promise<void> {
    return this.mutateSnapshot(saveId, [], (snapshot) => {
      const asset = snapshot.assets[imageId];
      if (!asset || (asset.scope === 'save' && asset.saveId !== saveId)) {
        throw new Error('只能恢复当前存档分区中存在的图片。');
      }
      if (
        asset.originSubject?.type !== 'scene-shot' ||
        asset.originPurpose !== 'turn-scene'
      ) {
        throw new Error('只有保留了原始 SceneShot 的正文场景图可以恢复到正文。');
      }
      const subject = asset.originSubject;
      const plan = snapshot.scenePlans[subject.scenePlanId];
      if (
        !plan ||
        plan.sourceTurnId !== subject.turnId ||
        !plan.shots.some((shot) => shot.shotId === subject.shotId)
      ) {
        throw new Error('场景图的原始 SceneShot 已不存在，不能安全恢复到正文。');
      }
      const current = snapshot.storySceneDisplayStates[subject.turnId];
      assertSceneDisplayCanChange(current);
      const bindingId = createVisualBindingId(saveId, subject, 'turn-scene', subject.shotId);
      snapshot.bindings[bindingId] = visualBindingSchema.parse({
        bindingId,
        saveId,
        subject,
        purpose: 'turn-scene',
        variantKey: subject.shotId,
        imageId,
        updatedAt
      });
      snapshot.storySceneDisplayStates[subject.turnId] = storySceneDisplayStateSchema.parse({
        saveId,
        turnId: subject.turnId,
        activeShotIds: Array.from(new Set([...(current?.activeShotIds ?? []), subject.shotId])),
        updatedAt
      });
    });
  }

  async completeTaskWithImages(
    saveId: string,
    taskId: string,
    images: VisualImageInput[],
    finishedAt: string
  ): Promise<VisualAsset[]> {
    if (!images.length) throw new Error('成功任务至少需要一张图片。');
    const normalized = await Promise.all(images.map(normalizeImage));
    let createdAssets: VisualAsset[] = [];
    await this.enqueueWrite(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction([PARTITION_STORE, BLOB_STORE], 'readwrite');
        const done = transactionDone(transaction);
        try {
          const partitionStore = transaction.objectStore(PARTITION_STORE);
          const stored = await requestToPromise<unknown>(partitionStore.get(saveId));
          const owner = stored === undefined ? undefined : parseVisualRepositorySnapshot(stored);
          if (!owner?.tasks[taskId]) throw new Error(`找不到图片任务 ${taskId}。`);
          const task = owner.tasks[taskId];
          if (task.status !== 'persisting' || !task.submittedRequest) {
            throw new Error('只有 persisting 且已有提交快照的任务可以落地图片。');
          }
          const seenImages = new Set<string>();
          const seenBlobKeys = new Set<string>();
          for (const image of normalized) {
            if (owner.assets[image.imageId] || seenImages.has(image.imageId)) throw new Error(`imageId 重复：${image.imageId}`);
            if (Object.values(owner.assets).some((asset) => asset.blobKey === image.blobKey) || seenBlobKeys.has(image.blobKey)) {
              throw new Error(`blobKey 重复：${image.blobKey}`);
            }
            seenImages.add(image.imageId);
            seenBlobKeys.add(image.blobKey);
          }
          const origin = subjectAndPurpose(task.intent);
          createdAssets = normalized.map((image) => ({
            imageId: image.imageId,
            scope: 'save',
            saveId: task.saveId,
            source: 'generated',
            originSubject: origin.subject,
            originPurpose: origin.purpose,
            sourceTaskId: task.taskId,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            byteLength: image.byteLength,
            contentHash: image.contentHash,
            blobKey: image.blobKey,
            createdAt: finishedAt,
            submittedRequest: task.submittedRequest
          }));
          createdAssets.forEach((asset) => { owner.assets[asset.imageId] = asset; });
          const primaryImageId = createdAssets[0].imageId;
          if (!task.intent.generationPurpose) {
            const binding = createBinding(task, primaryImageId, finishedAt);
            owner.bindings[binding.bindingId] = binding;
          }
          owner.tasks[taskId] = succeedTask(task, createdAssets.map((asset) => asset.imageId), primaryImageId, finishedAt);
          partitionStore.put(visualRepositorySnapshotSchema.parse(owner));
          const blobStore = transaction.objectStore(BLOB_STORE);
          normalized.forEach((image) => {
            blobStore.add({
              blobKey: image.blobKey,
              saveId: task.saveId,
              imageId: image.imageId,
              mimeType: image.mimeType,
              bytes: image.bytes
            } satisfies StoredVisualBlob);
          });
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
    return createdAssets;
  }

  async persistLateTaskImages(
    saveId: string,
    taskId: string,
    images: VisualImageInput[],
    createdAt: string
  ): Promise<VisualAsset[]> {
    if (!images.length) return [];
    const normalized = await Promise.all(images.map(normalizeImage));
    let createdAssets: VisualAsset[] = [];
    await this.enqueueWrite(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction([PARTITION_STORE, BLOB_STORE], 'readwrite');
        const done = transactionDone(transaction);
        try {
          const partitionStore = transaction.objectStore(PARTITION_STORE);
          const stored = await requestToPromise<unknown>(partitionStore.get(saveId));
          const owner = stored === undefined ? undefined : parseVisualRepositorySnapshot(stored);
          if (!owner?.tasks[taskId]) throw new Error(`找不到图片任务 ${taskId}。`);
          const task = owner.tasks[taskId];
          if (task.status !== 'cancelled' || !task.submittedRequest) {
            throw new Error('只有已取消且曾提交的任务可以保存迟到结果。');
          }
          const origin = subjectAndPurpose(task.intent);
          createdAssets = normalized.map((image) => {
            if (owner.assets[image.imageId]) throw new Error(`imageId 重复：${image.imageId}`);
            return {
              imageId: image.imageId,
              scope: 'save',
              saveId: task.saveId,
              source: 'generated',
              originSubject: origin.subject,
              originPurpose: origin.purpose,
              sourceTaskId: task.taskId,
              lateResultOfTaskId: task.taskId,
              mimeType: image.mimeType,
              width: image.width,
              height: image.height,
              byteLength: image.byteLength,
              contentHash: image.contentHash,
              blobKey: image.blobKey,
              createdAt,
              submittedRequest: task.submittedRequest
            } satisfies VisualAsset;
          });
          createdAssets.forEach((asset) => { owner.assets[asset.imageId] = asset; });
          partitionStore.put(visualRepositorySnapshotSchema.parse(owner));
          const blobStore = transaction.objectStore(BLOB_STORE);
          normalized.forEach((image) => {
            blobStore.add({
              blobKey: image.blobKey,
              saveId: task.saveId,
              imageId: image.imageId,
              mimeType: image.mimeType,
              bytes: image.bytes
            } satisfies StoredVisualBlob);
          });
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
    return createdAssets;
  }

  async importUserImage(input: UserVisualImageImport): Promise<UserVisualImageImportResult> {
    if (input.originSubject && input.originSubject.saveId !== input.saveId) {
      throw new Error('导入图片主体与当前存档分区不一致。');
    }
    if (input.bindAsCurrent && (!input.originSubject || !input.originPurpose)) {
      throw new Error('设为当前图片时必须指定主体与图片用途。');
    }
    const normalized = await normalizeImage(input);
    let result: UserVisualImageImportResult | undefined;
    await this.enqueueWrite(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction([PARTITION_STORE, BLOB_STORE], 'readwrite');
        const done = transactionDone(transaction);
        try {
          const partitionStore = transaction.objectStore(PARTITION_STORE);
          const stored = await requestToPromise<unknown>(partitionStore.get(input.saveId));
          const snapshot = stored === undefined
            ? createEmptyVisualRepositorySnapshot(input.saveId)
            : parseVisualRepositorySnapshot(stored);
          const duplicate = Object.values(snapshot.assets).find((asset) => asset.contentHash === normalized.contentHash);
          let asset: VisualAsset;
          let created = false;
          if (duplicate) {
            asset = duplicate;
          } else {
            if (snapshot.assets[normalized.imageId]) throw new Error(`imageId 重复：${normalized.imageId}`);
            if (Object.values(snapshot.assets).some((item) => item.blobKey === normalized.blobKey)) {
              throw new Error(`blobKey 重复：${normalized.blobKey}`);
            }
            asset = {
              imageId: normalized.imageId,
              scope: 'save',
              saveId: input.saveId,
              source: 'user-imported',
              originSubject: input.originSubject,
              originPurpose: input.originPurpose,
              mimeType: normalized.mimeType,
              width: normalized.width,
              height: normalized.height,
              byteLength: normalized.byteLength,
              contentHash: normalized.contentHash,
              blobKey: normalized.blobKey,
              createdAt: input.createdAt
            };
            snapshot.assets[asset.imageId] = asset;
            transaction.objectStore(BLOB_STORE).add({
              blobKey: normalized.blobKey,
              saveId: input.saveId,
              imageId: normalized.imageId,
              mimeType: normalized.mimeType,
              bytes: normalized.bytes
            } satisfies StoredVisualBlob);
            created = true;
          }

          let binding: VisualBinding | undefined;
          if (input.bindAsCurrent && input.originSubject && input.originPurpose) {
            const variantKey = input.originSubject.type === 'scene-shot'
              ? input.originSubject.shotId
              : undefined;
            if (input.originSubject.type === 'scene-shot') {
              if (input.originPurpose !== 'turn-scene') {
                throw new Error('SceneShot 导入图只能绑定为正文场景图。');
              }
              const subject = input.originSubject;
              const plan = snapshot.scenePlans[subject.scenePlanId];
              if (
                !plan ||
                plan.sourceTurnId !== subject.turnId ||
                !plan.shots.some((shot) => shot.shotId === subject.shotId)
              ) {
                throw new Error('导入图片的原始 SceneShot 已不存在，不能安全绑定到正文。');
              }
              const current = snapshot.storySceneDisplayStates[subject.turnId];
              assertSceneDisplayCanChange(current);
              snapshot.storySceneDisplayStates[subject.turnId] = storySceneDisplayStateSchema.parse({
                saveId: input.saveId,
                turnId: subject.turnId,
                activeShotIds: Array.from(new Set([...(current?.activeShotIds ?? []), subject.shotId])),
                updatedAt: input.createdAt
              });
            }
            binding = {
              bindingId: createVisualBindingId(
                input.saveId,
                input.originSubject,
                input.originPurpose,
                variantKey
              ),
              saveId: input.saveId,
              subject: input.originSubject,
              purpose: input.originPurpose,
              variantKey,
              imageId: asset.imageId,
              updatedAt: input.createdAt
            };
            snapshot.bindings[binding.bindingId] = binding;
          }
          partitionStore.put(visualRepositorySnapshotSchema.parse(snapshot));
          result = { asset, created, binding };
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
    if (!result) throw new Error('玩家图片导入未完成。');
    return result;
  }

  async getBlob(blobKey: string): Promise<Blob | null> {
    const db = await this.open();
    try {
      const transaction = db.transaction(BLOB_STORE, 'readonly');
      const value = await requestToPromise<unknown>(transaction.objectStore(BLOB_STORE).get(blobKey));
      return value === undefined ? null : parseStoredBlob(value).blob;
    } finally {
      db.close();
    }
  }

  async getAssetDeletionImpact(saveId: string, imageId: string): Promise<VisualAssetDeletionImpact> {
    const snapshot = await this.loadSnapshot(saveId);
    if (!snapshot.assets[imageId]) throw new Error(`找不到图片 ${imageId}。`);
    return {
      imageId,
      bindingIds: Object.values(snapshot.bindings).filter((binding) => binding.imageId === imageId).map((binding) => binding.bindingId)
    };
  }

  async deleteAsset(saveId: string, imageId: string, confirmUnbind: boolean): Promise<void> {
    const impact = await this.getAssetDeletionImpact(saveId, imageId);
    if (impact.bindingIds.length && !confirmUnbind) throw new VisualAssetBoundError(impact);
    return this.mutateSnapshot(saveId, [BLOB_STORE], (snapshot, transaction) => {
      const asset = snapshot.assets[imageId];
      if (!asset) throw new Error(`找不到图片 ${imageId}。`);
      if (asset.source === 'builtin') throw new Error('游戏内置图片属于只读美术，不能从视觉仓库删除。');
      const currentBindings = Object.values(snapshot.bindings).filter((binding) => binding.imageId === imageId);
      if (currentBindings.length && !confirmUnbind) {
        throw new VisualAssetBoundError({ imageId, bindingIds: currentBindings.map((binding) => binding.bindingId) });
      }
      const updatedAt = new Date().toISOString();
      currentBindings.forEach((binding) => {
        removeSceneShotFromDisplay(snapshot, binding, updatedAt);
        delete snapshot.bindings[binding.bindingId];
      });
      delete snapshot.assets[imageId];
      transaction.objectStore(BLOB_STORE).delete(asset.blobKey);
    });
  }

  async exportSave(saveId: string): Promise<VisualArchiveData> {
    const db = await this.open();
    try {
      const transaction = db.transaction([PARTITION_STORE, BLOB_STORE], 'readonly');
      const done = transactionDone(transaction);
      const [stored, rows] = await Promise.all([
        requestToPromise<unknown>(transaction.objectStore(PARTITION_STORE).get(saveId)),
        requestToPromise<unknown[]>(transaction.objectStore(BLOB_STORE).index(SAVE_INDEX).getAll(saveId))
      ]);
      await done;
      const snapshot = stored === undefined
        ? createEmptyVisualRepositorySnapshot(saveId)
        : parseVisualRepositorySnapshot(stored);
      return { snapshot, blobs: rows.map(parseStoredBlob) };
    } finally {
      db.close();
    }
  }

  async replaceSaveFromArchive(snapshot: VisualRepositorySnapshot, blobs: PortableVisualBlob[]): Promise<void> {
    const parsed = parseVisualRepositorySnapshot(snapshot);
    const normalized = await Promise.all(blobs.map(async (item) => {
      const asset = parsed.assets[item.imageId];
      if (!asset || asset.blobKey !== item.blobKey) throw new Error('导入 Blob 与图片元数据不匹配。');
      const image = await normalizeImage({
        imageId: item.imageId,
        blobKey: item.blobKey,
        blob: item.blob,
        width: asset.width,
        height: asset.height
      });
      if (image.contentHash !== asset.contentHash || image.byteLength !== asset.byteLength || image.mimeType !== asset.mimeType) {
        throw new Error('导入 Blob 哈希、大小或 MIME 与图片元数据不一致。');
      }
      return image;
    }));
    await this.enqueueWrite(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction([PARTITION_STORE, BLOB_STORE], 'readwrite');
        const done = transactionDone(transaction);
        try {
          const blobStore = transaction.objectStore(BLOB_STORE);
          const existingKeys = await requestToPromise<IDBValidKey[]>(blobStore.index(SAVE_INDEX).getAllKeys(parsed.saveId));
          existingKeys.forEach((key) => blobStore.delete(key));
          transaction.objectStore(PARTITION_STORE).put(parsed);
          normalized.forEach((image) => blobStore.add({
            blobKey: image.blobKey,
            saveId: parsed.saveId,
            imageId: image.imageId,
            mimeType: image.mimeType,
            bytes: image.bytes
          } satisfies StoredVisualBlob));
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

  clearSave(saveId: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction([PARTITION_STORE, BLOB_STORE], 'readwrite');
        const done = transactionDone(transaction);
        try {
          transaction.objectStore(PARTITION_STORE).delete(saveId);
          const blobStore = transaction.objectStore(BLOB_STORE);
          const keys = await requestToPromise<IDBValidKey[]>(blobStore.index(SAVE_INDEX).getAllKeys(saveId));
          keys.forEach((key) => blobStore.delete(key));
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

  clearAll(): Promise<void> {
    return this.enqueueWrite(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction([PARTITION_STORE, BLOB_STORE], 'readwrite');
        transaction.objectStore(PARTITION_STORE).clear();
        transaction.objectStore(BLOB_STORE).clear();
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
  }
}
