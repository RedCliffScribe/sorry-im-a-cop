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
  VisualImageInput,
  VisualRepositorySnapshot,
  UserVisualImageImport,
  UserVisualImageImportResult
} from './types';

export interface VisualAssetDeletionImpact {
  imageId: string;
  bindingIds: string[];
}

export interface VisualStorageSummary {
  saveId: string;
  metadataAssetCount: number;
  storedBlobCount: number;
  storedBytes: number;
  missingBlobCount: number;
  missingImageIds: string[];
  corruptBlobCount: number;
  corruptImageIds: string[];
  orphanBlobCount: number;
}

export type VisualStorageIssueKind = 'missing' | 'corrupt' | 'orphan';

export type VisualStorageIssueReason =
  | 'blob-missing'
  | 'blob-structure-invalid'
  | 'image-id-mismatch'
  | 'mime-type-mismatch'
  | 'byte-length-mismatch'
  | 'content-hash-mismatch'
  | 'unreferenced-blob';

export interface VisualStorageIssue {
  kind: VisualStorageIssueKind;
  reason: VisualStorageIssueReason;
  imageId?: string;
  blobKey?: string;
  byteLength: number;
  actualContentHash?: string;
}

export interface VisualStorageIntegrityProgress {
  checkedBlobCount: number;
  totalBlobCount: number;
}

export interface VisualStorageIntegrityOptions {
  signal?: AbortSignal;
  onProgress?: (progress: VisualStorageIntegrityProgress) => void;
}

export interface VisualStorageIntegrityReport {
  summary: VisualStorageSummary;
  checkedAt: string;
  deepCheckedBlobCount: number;
  issues: VisualStorageIssue[];
}

export interface VisualStorageCleanupResult {
  removedBlobCount: number;
  removedBytes: number;
  affectedImageIds: string[];
}

export interface VisualAssetBlobRestoreInput {
  blob: Blob;
  width: number;
  height: number;
}

export interface VisualRepository {
  loadSnapshot(saveId: string): Promise<VisualRepositorySnapshot>;
  getStorageSummary(saveId: string): Promise<VisualStorageSummary>;
  inspectStorageIntegrity(
    saveId: string,
    options?: VisualStorageIntegrityOptions
  ): Promise<VisualStorageIntegrityReport>;
  cleanupStorageIssues(
    saveId: string,
    issues: readonly VisualStorageIssue[]
  ): Promise<VisualStorageCleanupResult>;
  restoreAssetBlob(
    saveId: string,
    imageId: string,
    input: VisualAssetBlobRestoreInput
  ): Promise<VisualAsset>;
  saveCharacterAnchor(anchor: CharacterVisualAnchor): Promise<void>;
  saveScenePlan(plan: StoredScenePlan): Promise<void>;
  saveScenePlanWithTasks(plan: StoredScenePlan, tasks: ImageGenerationTask[]): Promise<void>;
  saveTask(task: ImageGenerationTask): Promise<void>;
  saveCharacterBatch(batch: CharacterImageGenerationBatch): Promise<void>;
  saveCharacterBatchWithTasks(batch: CharacterImageGenerationBatch, tasks: ImageGenerationTask[]): Promise<void>;
  saveStorySceneDisplayState(state: StorySceneDisplayState): Promise<void>;
  bindAsset(binding: VisualBinding): Promise<void>;
  unbindAsset(saveId: string, bindingId: string): Promise<void>;
  restoreSceneAssetToStory(saveId: string, imageId: string, updatedAt: string): Promise<void>;
  completeTaskWithImages(saveId: string, taskId: string, images: VisualImageInput[], finishedAt: string): Promise<VisualAsset[]>;
  persistLateTaskImages(saveId: string, taskId: string, images: VisualImageInput[], createdAt: string): Promise<VisualAsset[]>;
  importUserImage(input: UserVisualImageImport): Promise<UserVisualImageImportResult>;
  getBlob(blobKey: string): Promise<Blob | null>;
  getAssetDeletionImpact(saveId: string, imageId: string): Promise<VisualAssetDeletionImpact>;
  deleteAsset(saveId: string, imageId: string, confirmUnbind: boolean): Promise<void>;
  exportSave(saveId: string): Promise<VisualArchiveData>;
  replaceSaveFromArchive(snapshot: VisualRepositorySnapshot, blobs: PortableVisualBlob[]): Promise<void>;
  clearSave(saveId: string): Promise<void>;
}
