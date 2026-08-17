import {
  createCustomContentRevisionRef,
  customContentRevisionRefKey
} from './assetFoundation';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision,
  CustomContentDependency,
  CustomContentProcessingTask,
  CustomContentProcessingTaskStatus,
  CustomContentProcessingUnit,
  CustomContentProjectAsset,
  CustomContentProjectRevision,
  CustomContentRevisionRef,
  CustomEventGroupAsset,
  CustomEventGroupRevision,
  CustomLocalExtractionResult,
  CustomSourceAggregationResult,
  CustomSourceCarryLedgerEntry,
  CustomSourceDocument,
  CustomSourceStructure
} from './assetTypes';
import {
  customContentProcessingTaskSchema,
  customContentProcessingUnitSchema
} from './contentPackageSchemas';
import { parseCustomSourceStructure } from './sourceStructureSchemas';
import { parseCustomLocalExtractionResult } from './sourceExtractionSchemas';
import {
  parseCustomSourceAggregationResult,
  parseCustomSourceCarryLedgerEntry
} from './sourceAggregationSchemas';
import type { CustomSourceProjectDraftResult } from './sourceProjectBuildSchemas';
import { parseCustomSourceProjectDraftResult } from './sourceProjectBuildSchemas';
import type { CustomCharacterWorkingDraftRecord } from './characterWorkingDraft';

export const CUSTOM_CONTENT_DB_VERSION = 6;

export const customContentStoreNames = {
  projectAssets: 'custom-content-project-assets',
  projectRevisions: 'custom-content-project-revisions',
  characterAssets: 'custom-character-assets',
  characterRevisions: 'custom-character-revisions',
  characterWorkingDrafts: 'custom-character-working-drafts',
  eventGroupAssets: 'custom-event-group-assets',
  eventGroupRevisions: 'custom-event-group-revisions',
  sourceDocuments: 'custom-source-documents',
  sourceDocumentBlobs: 'custom-source-document-blobs',
  sourceStructures: 'custom-source-structures',
  processingTasks: 'custom-content-processing-tasks',
  processingUnits: 'custom-content-processing-units',
  extractionResults: 'custom-source-extraction-results',
  carryLedgerEntries: 'custom-source-carry-ledger-entries',
  aggregationResults: 'custom-source-aggregation-results',
  projectDraftResults: 'custom-source-project-draft-results',
  dependencies: 'custom-content-dependencies'
} as const;

type CustomContentStoreName =
  (typeof customContentStoreNames)[keyof typeof customContentStoreNames];

interface StoredSourceDocumentBlob {
  sourceDocumentId: string;
  blob: Blob;
}

interface StoredCustomContentDependency extends CustomContentDependency {
  ownerKey: string;
  targetKey: string;
}

export type SaveCustomContentRevisionBundle =
  | {
      assetKind: 'content_project';
      asset: CustomContentProjectAsset;
      revision: CustomContentProjectRevision;
      dependencies?: readonly CustomContentDependency[];
    }
  | {
      assetKind: 'character';
      asset: CustomCharacterAsset;
      revision: CustomCharacterRevision;
      dependencies?: readonly CustomContentDependency[];
    }
  | {
      assetKind: 'event_group';
      asset: CustomEventGroupAsset;
      revision: CustomEventGroupRevision;
      dependencies?: readonly CustomContentDependency[];
    };

export type SaveCustomCharacterRevisionBundle = Extract<
  SaveCustomContentRevisionBundle,
  { assetKind: 'character' }
>;

export interface SaveCustomContentSourceDocumentBundle {
  document: CustomSourceDocument;
  blob: Blob;
}

export interface SaveCustomContentImportBatch {
  bundles: readonly SaveCustomContentRevisionBundle[];
  sourceDocuments?: readonly SaveCustomContentSourceDocumentBundle[];
  processingTasks?: readonly CustomContentProcessingTask[];
  processingUnits?: readonly CustomContentProcessingUnit[];
  sourceStructures?: readonly CustomSourceStructure[];
  extractionResults?: readonly CustomLocalExtractionResult[];
  carryLedgerEntries?: readonly CustomSourceCarryLedgerEntry[];
  aggregationResults?: readonly CustomSourceAggregationResult[];
  projectDraftResults?: readonly CustomSourceProjectDraftResult[];
}

export interface SaveCustomSourceProcessingCheckpoint {
  task: CustomContentProcessingTask;
  unit: CustomContentProcessingUnit;
  expectedStateRevision?: number | null;
  sourceDocument?: CustomSourceDocument;
  sourceStructure?: CustomSourceStructure;
}

export interface SaveCustomAiProcessingTaskBundle {
  task: CustomContentProcessingTask;
  units: readonly CustomContentProcessingUnit[];
}

export interface SaveCustomAiProcessingCheckpoint {
  task: CustomContentProcessingTask;
  units: readonly CustomContentProcessingUnit[];
  expectedStateRevision: number;
  results?: readonly CustomLocalExtractionResult[];
  carryLedgerEntries?: readonly CustomSourceCarryLedgerEntry[];
}

export interface SaveCustomSourceAggregationTaskBundle {
  task: CustomContentProcessingTask;
  units: readonly CustomContentProcessingUnit[];
}

export interface SaveCustomSourceAggregationCheckpoint {
  task: CustomContentProcessingTask;
  units: readonly CustomContentProcessingUnit[];
  expectedStateRevision: number;
  results?: readonly CustomSourceAggregationResult[];
}

export interface SaveCustomSourceProjectBuildTaskBundle {
  task: CustomContentProcessingTask;
  unit: CustomContentProcessingUnit;
}

export interface SaveCustomSourceProjectBuildCheckpoint {
  task: CustomContentProcessingTask;
  unit: CustomContentProcessingUnit;
  expectedStateRevision: number;
  result?: CustomSourceProjectDraftResult;
}

export class CustomContentTaskStateConflictError extends Error {
  constructor(message = 'Custom content task state changed concurrently.') {
    super(message);
    this.name = 'CustomContentTaskStateConflictError';
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export class CustomContentDeletionProtectedError extends Error {
  constructor(
    public readonly assetKind: 'character' | 'event_group',
    public readonly assetId: string,
    public readonly protectedRevisions: readonly number[]
  ) {
    super(
      `Cannot delete ${assetKind} "${assetId}" because revision ${protectedRevisions.join(', ')} is protected.`
    );
    this.name = 'CustomContentDeletionProtectedError';
  }
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function deleteAllFromIndex(
  store: IDBObjectStore,
  indexName: string,
  key: IDBValidKey
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store
      .index(indexName)
      .openCursor(IDBKeyRange.only(key));
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB cursor failed'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
  });
}

function ensureStore(
  db: IDBDatabase,
  transaction: IDBTransaction,
  name: CustomContentStoreName,
  keyPath: string | string[]
): IDBObjectStore {
  return db.objectStoreNames.contains(name)
    ? transaction.objectStore(name)
    : db.createObjectStore(name, { keyPath });
}

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options: IDBIndexParameters = {}
): void {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, options);
  }
}

function applyStoreMigrations(
  db: IDBDatabase,
  transaction: IDBTransaction
): void {
  ensureStore(
    db,
    transaction,
    customContentStoreNames.projectAssets,
    'projectId'
  );
  const projectRevisions = ensureStore(
    db,
    transaction,
    customContentStoreNames.projectRevisions,
    ['projectId', 'revision']
  );
  ensureIndex(projectRevisions, 'by-project-id', 'projectId');

  const characterAssets = ensureStore(
    db,
    transaction,
    customContentStoreNames.characterAssets,
    'characterAssetId'
  );
  ensureIndex(characterAssets, 'by-project-id', 'projectIds', { multiEntry: true });
  const characterRevisions = ensureStore(
    db,
    transaction,
    customContentStoreNames.characterRevisions,
    ['characterAssetId', 'revision']
  );
  ensureIndex(characterRevisions, 'by-character-asset-id', 'characterAssetId');
  const characterWorkingDrafts = ensureStore(
    db,
    transaction,
    customContentStoreNames.characterWorkingDrafts,
    'workingDraftId'
  );
  ensureIndex(
    characterWorkingDrafts,
    'by-source-character-asset-id',
    'sourceCharacterAssetId'
  );

  const eventGroupAssets = ensureStore(
    db,
    transaction,
    customContentStoreNames.eventGroupAssets,
    'eventGroupId'
  );
  ensureIndex(eventGroupAssets, 'by-project-id', 'projectId');
  const eventGroupRevisions = ensureStore(
    db,
    transaction,
    customContentStoreNames.eventGroupRevisions,
    ['eventGroupId', 'revision']
  );
  ensureIndex(eventGroupRevisions, 'by-event-group-id', 'eventGroupId');
  ensureIndex(eventGroupRevisions, 'by-project-id', 'projectId');

  const sourceDocuments = ensureStore(
    db,
    transaction,
    customContentStoreNames.sourceDocuments,
    'sourceDocumentId'
  );
  ensureIndex(sourceDocuments, 'by-project-id', 'projectId');
  ensureStore(
    db,
    transaction,
    customContentStoreNames.sourceDocumentBlobs,
    'sourceDocumentId'
  );
  const sourceStructures = ensureStore(
    db,
    transaction,
    customContentStoreNames.sourceStructures,
    'sourceStructureId'
  );
  ensureIndex(
    sourceStructures,
    'by-source-document-id',
    'sourceDocumentId'
  );

  const processingTasks = ensureStore(
    db,
    transaction,
    customContentStoreNames.processingTasks,
    'taskId'
  );
  ensureIndex(processingTasks, 'by-status', 'status');
  ensureIndex(processingTasks, 'by-project-id', 'projectId');
  ensureIndex(processingTasks, 'by-source-document-id', 'sourceDocumentId');
  const processingUnits = ensureStore(
    db,
    transaction,
    customContentStoreNames.processingUnits,
    'unitId'
  );
  ensureIndex(processingUnits, 'by-task-id', 'taskId');

  const extractionResults = ensureStore(
    db,
    transaction,
    customContentStoreNames.extractionResults,
    'extractionResultId'
  );
  ensureIndex(extractionResults, 'by-task-id', 'taskId');
  ensureIndex(extractionResults, 'by-unit-id', 'unitId', { unique: true });
  ensureIndex(
    extractionResults,
    'by-source-document-id',
    'sourceDocumentId'
  );
  ensureIndex(
    extractionResults,
    'by-source-structure-id',
    'sourceStructureId'
  );
  ensureIndex(extractionResults, 'by-chunk-id', 'chunkId');

  const carryLedgerEntries = ensureStore(
    db,
    transaction,
    customContentStoreNames.carryLedgerEntries,
    'carryLedgerEntryId'
  );
  ensureIndex(
    carryLedgerEntries,
    'by-extraction-task-id',
    'extractionTaskId'
  );
  ensureIndex(
    carryLedgerEntries,
    'by-extraction-result-id',
    'extractionResultId',
    { unique: true }
  );
  ensureIndex(
    carryLedgerEntries,
    'by-source-document-id',
    'sourceDocumentId'
  );
  ensureIndex(
    carryLedgerEntries,
    'by-source-structure-id',
    'sourceStructureId'
  );

  const aggregationResults = ensureStore(
    db,
    transaction,
    customContentStoreNames.aggregationResults,
    'aggregationResultId'
  );
  ensureIndex(aggregationResults, 'by-task-id', 'taskId');
  ensureIndex(aggregationResults, 'by-unit-id', 'unitId', { unique: true });
  ensureIndex(
    aggregationResults,
    'by-source-document-id',
    'sourceDocumentId'
  );
  ensureIndex(
    aggregationResults,
    'by-source-structure-id',
    'sourceStructureId'
  );
  ensureIndex(aggregationResults, 'by-aggregation-level', 'aggregationLevel');

  const projectDraftResults = ensureStore(
    db,
    transaction,
    customContentStoreNames.projectDraftResults,
    'projectDraftResultId'
  );
  ensureIndex(projectDraftResults, 'by-task-id', 'taskId', { unique: true });
  ensureIndex(projectDraftResults, 'by-unit-id', 'unitId', { unique: true });
  ensureIndex(
    projectDraftResults,
    'by-source-document-id',
    'sourceDocumentId'
  );
  ensureIndex(
    projectDraftResults,
    'by-source-structure-id',
    'sourceStructureId'
  );

  const dependencies = ensureStore(
    db,
    transaction,
    customContentStoreNames.dependencies,
    'dependencyId'
  );
  ensureIndex(dependencies, 'by-owner-key', 'ownerKey');
  ensureIndex(dependencies, 'by-target-key', 'targetKey');
}

function storedDependency(
  dependency: CustomContentDependency
): StoredCustomContentDependency {
  return {
    ...dependency,
    ownerKey: customContentRevisionRefKey(dependency.owner),
    targetKey: customContentRevisionRefKey(dependency.target)
  };
}

function publicDependency(
  dependency: StoredCustomContentDependency
): CustomContentDependency {
  const { ownerKey: _ownerKey, targetKey: _targetKey, ...value } = dependency;
  return value;
}

function assertBundleConsistency(bundle: SaveCustomContentRevisionBundle): void {
  const revisionRef = createCustomContentRevisionRef(bundle.revision);
  const dependencies = bundle.dependencies ?? [];

  if (bundle.asset.latestRevision !== bundle.revision.revision) {
    throw new Error('Asset latestRevision must equal the appended revision.');
  }

  if (
    (bundle.assetKind === 'content_project' &&
      (bundle.asset.projectId !== bundle.revision.projectId ||
        revisionRef.assetKind !== 'content_project')) ||
    (bundle.assetKind === 'character' &&
      (bundle.asset.characterAssetId !== bundle.revision.characterAssetId ||
        revisionRef.assetKind !== 'character')) ||
    (bundle.assetKind === 'event_group' &&
      (bundle.asset.eventGroupId !== bundle.revision.eventGroupId ||
        revisionRef.assetKind !== 'event_group'))
  ) {
    throw new Error('Asset and revision identifiers do not match.');
  }

  const revisionKey = customContentRevisionRefKey(revisionRef);
  const invalidOwner = dependencies.find(
    (dependency) => customContentRevisionRefKey(dependency.owner) !== revisionKey
  );
  if (invalidOwner) {
    throw new Error('Every dependency in a revision bundle must belong to that revision.');
  }
}

function validateSourceProcessingCheckpoint(
  checkpoint: SaveCustomSourceProcessingCheckpoint
): {
  task: CustomContentProcessingTask;
  unit: CustomContentProcessingUnit;
  sourceStructure?: CustomSourceStructure;
} {
  const task = customContentProcessingTaskSchema.parse(checkpoint.task);
  const unit = customContentProcessingUnitSchema.parse(checkpoint.unit);
  if (
    (task.taskKind !== 'parse_source' &&
      task.taskKind !== 'chunk_source') ||
    !task.sourceDocumentId ||
    !task.sourceProcessing
  ) {
    throw new Error(
      'Source processing checkpoints require a local source task.'
    );
  }
  if (
    task.stateRevision === undefined ||
    task.totalUnitCount !== 1 ||
    unit.taskId !== task.taskId ||
    unit.sequence !== 0 ||
    unit.status !== task.status
  ) {
    throw new Error('Source processing task and unit state are inconsistent.');
  }
  const completedUnitCount = unit.status === 'completed' ? 1 : 0;
  if (task.completedUnitCount !== completedUnitCount) {
    throw new Error(
      'Source processing completedUnitCount is inconsistent.'
    );
  }
  if (unit.status === 'completed' && !unit.resultRef) {
    throw new Error('Completed source processing units require resultRef.');
  }
  if (
    checkpoint.sourceDocument &&
    checkpoint.sourceDocument.sourceDocumentId !== task.sourceDocumentId
  ) {
    throw new Error(
      'Source document checkpoint does not belong to the task.'
    );
  }
  const sourceStructure = checkpoint.sourceStructure
    ? parseCustomSourceStructure(checkpoint.sourceStructure)
    : undefined;
  if (
    sourceStructure &&
    (task.taskKind !== 'chunk_source' ||
      sourceStructure.sourceDocumentId !== task.sourceDocumentId ||
      unit.resultRef !== sourceStructure.sourceStructureId)
  ) {
    throw new Error(
      'Source structure checkpoint does not match the chunk task result.'
    );
  }
  return { task, unit, sourceStructure };
}

type ValidatedAiProcessingTask = CustomContentProcessingTask & {
  sourceDocumentId: string;
  apiProfileId: string;
  model: string;
  sourceProcessing: NonNullable<CustomContentProcessingTask['sourceProcessing']>;
  aiProcessing: NonNullable<CustomContentProcessingTask['aiProcessing']>;
  stateRevision: number;
};

function validateAiProcessingTask(
  value: CustomContentProcessingTask
): ValidatedAiProcessingTask {
  const task = customContentProcessingTaskSchema.parse(value);
  if (
    task.taskKind !== 'extract_local' ||
    !task.sourceDocumentId ||
    !task.apiProfileId ||
    !task.model ||
    !task.sourceProcessing ||
    !task.aiProcessing ||
    task.stateRevision === undefined
  ) {
    throw new Error(
      'AI processing checkpoints require a fully configured extract_local task.'
    );
  }
  if (task.costLimit !== undefined && !task.aiProcessing.pricing) {
    throw new Error('AI costLimit requires an explicit pricing receipt.');
  }
  return task as ValidatedAiProcessingTask;
}

function validateAiProcessingUnits(
  task: CustomContentProcessingTask & { sourceDocumentId: string },
  values: readonly CustomContentProcessingUnit[]
): CustomContentProcessingUnit[] {
  const units = values.map((unit) =>
    customContentProcessingUnitSchema.parse(unit)
  );
  const unitIds = new Set<string>();
  const sequences = new Set<number>();
  for (const unit of units) {
    if (
      unit.taskId !== task.taskId ||
      !unit.sourceSpan ||
      unit.sourceSpan.sourceDocumentId !== task.sourceDocumentId
    ) {
      throw new Error('AI processing unit does not belong to its task source.');
    }
    if (unitIds.has(unit.unitId) || sequences.has(unit.sequence)) {
      throw new Error('AI processing unit identifiers and sequences must be unique.');
    }
    unitIds.add(unit.unitId);
    sequences.add(unit.sequence);
  }
  return units.sort((left, right) => left.sequence - right.sequence);
}

type ValidatedSourceAggregationTask = ValidatedAiProcessingTask & {
  taskKind: 'aggregate_chapter' | 'aggregate_stage' | 'aggregate_arc';
};

function validateSourceAggregationTask(
  value: CustomContentProcessingTask
): ValidatedSourceAggregationTask {
  const task = customContentProcessingTaskSchema.parse(value);
  const expectedLevel =
    task.taskKind === 'aggregate_chapter'
      ? 'chapter'
      : task.taskKind === 'aggregate_stage'
        ? 'stage'
        : task.taskKind === 'aggregate_arc'
          ? 'arc'
          : undefined;
  if (
    !expectedLevel ||
    !task.sourceDocumentId ||
    !task.apiProfileId ||
    !task.model ||
    !task.sourceProcessing ||
    !task.aiProcessing ||
    task.aiProcessing.aggregationLevel !== expectedLevel ||
    !task.aiProcessing.inputTaskIds?.length ||
    task.stateRevision === undefined
  ) {
    throw new Error(
      'Source aggregation checkpoints require a fully configured aggregation task.'
    );
  }
  if (task.costLimit !== undefined && !task.aiProcessing.pricing) {
    throw new Error('AI costLimit requires an explicit pricing receipt.');
  }
  return task as ValidatedSourceAggregationTask;
}

type ValidatedSourceProjectBuildTask = ValidatedAiProcessingTask & {
  taskKind: 'build_project';
};

function validateSourceProjectBuildTask(
  value: CustomContentProcessingTask
): ValidatedSourceProjectBuildTask {
  const task = customContentProcessingTaskSchema.parse(value);
  if (
    task.taskKind !== 'build_project' ||
    !task.sourceDocumentId ||
    !task.apiProfileId ||
    !task.model ||
    !task.sourceProcessing ||
    !task.aiProcessing ||
    task.aiProcessing.promptVersion !== 'phase9-project-build-v1' ||
    !task.aiProcessing.conversionMode ||
    !task.aiProcessing.inputTaskIds?.length ||
    task.stateRevision === undefined
  ) {
    throw new Error(
      'Source project build checkpoints require a fully configured build task.'
    );
  }
  if (task.costLimit !== undefined && !task.aiProcessing.pricing) {
    throw new Error('AI costLimit requires an explicit pricing receipt.');
  }
  return task as ValidatedSourceProjectBuildTask;
}

export class IndexedDbCustomContentRepository {
  constructor(
    private readonly dbName = 'sorry-im-a-cop-v2-custom-content'
  ) {}

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, CUSTOM_CONTENT_DB_VERSION);
      request.onupgradeneeded = () => {
        const transaction = request.transaction;
        if (!transaction) return;
        applyStoreMigrations(request.result, transaction);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error ?? new Error('Failed to open custom content database')
        );
    });
  }

  async saveRevisionBundle(
    bundle: SaveCustomContentRevisionBundle
  ): Promise<void> {
    await this.saveRevisionBundles([bundle]);
  }

  async saveRevisionBundles(
    bundles: readonly SaveCustomContentRevisionBundle[]
  ): Promise<void> {
    await this.saveImportBatch({ bundles });
  }

  async saveImportBatch({
    bundles,
    sourceDocuments = [],
    processingTasks = [],
    processingUnits = [],
    sourceStructures = [],
    extractionResults = [],
    carryLedgerEntries = [],
    aggregationResults = [],
    projectDraftResults = []
  }: SaveCustomContentImportBatch): Promise<void> {
    const parsedStructures = sourceStructures.map(parseCustomSourceStructure);
    const parsedExtractionResults = extractionResults.map(
      parseCustomLocalExtractionResult
    );
    const parsedCarryLedgerEntries = carryLedgerEntries.map(
      parseCustomSourceCarryLedgerEntry
    );
    const parsedAggregationResults = aggregationResults.map(
      parseCustomSourceAggregationResult
    );
    const parsedProjectDraftResults = projectDraftResults.map(
      parseCustomSourceProjectDraftResult
    );
    if (
      bundles.length === 0 &&
      sourceDocuments.length === 0 &&
      processingTasks.length === 0 &&
      processingUnits.length === 0 &&
      parsedStructures.length === 0 &&
      parsedExtractionResults.length === 0 &&
      parsedCarryLedgerEntries.length === 0 &&
      parsedAggregationResults.length === 0 &&
      parsedProjectDraftResults.length === 0
    ) {
      return;
    }
    for (const bundle of bundles) assertBundleConsistency(bundle);
    for (const source of sourceDocuments) {
      if (source.document.byteLength !== source.blob.size) {
        throw new Error('Source document byteLength does not match its Blob.');
      }
    }

    const requiredStores = new Set<CustomContentStoreName>();
    if (bundles.length > 0) {
      requiredStores.add(customContentStoreNames.dependencies);
    }
    for (const bundle of bundles) {
      if (bundle.assetKind === 'content_project') {
        requiredStores.add(customContentStoreNames.projectAssets);
        requiredStores.add(customContentStoreNames.projectRevisions);
      } else if (bundle.assetKind === 'character') {
        requiredStores.add(customContentStoreNames.characterAssets);
        requiredStores.add(customContentStoreNames.characterRevisions);
      } else {
        requiredStores.add(customContentStoreNames.eventGroupAssets);
        requiredStores.add(customContentStoreNames.eventGroupRevisions);
      }
    }
    if (sourceDocuments.length > 0) {
      requiredStores.add(customContentStoreNames.sourceDocuments);
      requiredStores.add(customContentStoreNames.sourceDocumentBlobs);
    }
    if (processingTasks.length > 0) {
      requiredStores.add(customContentStoreNames.processingTasks);
    }
    if (processingUnits.length > 0) {
      requiredStores.add(customContentStoreNames.processingUnits);
    }
    if (parsedStructures.length > 0) {
      requiredStores.add(customContentStoreNames.sourceStructures);
    }
    if (parsedExtractionResults.length > 0) {
      requiredStores.add(customContentStoreNames.extractionResults);
    }
    if (parsedCarryLedgerEntries.length > 0) {
      requiredStores.add(customContentStoreNames.carryLedgerEntries);
    }
    if (parsedAggregationResults.length > 0) {
      requiredStores.add(customContentStoreNames.aggregationResults);
    }
    if (parsedProjectDraftResults.length > 0) {
      requiredStores.add(customContentStoreNames.projectDraftResults);
    }

    const db = await this.open();
    try {
      const transaction = db.transaction([...requiredStores], 'readwrite');
      const dependencyStore =
        bundles.length > 0
          ? transaction.objectStore(customContentStoreNames.dependencies)
          : undefined;
      try {
        for (const bundle of bundles) {
          const [assetStoreName, revisionStoreName] =
            bundle.assetKind === 'content_project'
              ? [
                  customContentStoreNames.projectAssets,
                  customContentStoreNames.projectRevisions
                ]
              : bundle.assetKind === 'character'
                ? [
                    customContentStoreNames.characterAssets,
                    customContentStoreNames.characterRevisions
                  ]
                : [
                    customContentStoreNames.eventGroupAssets,
                    customContentStoreNames.eventGroupRevisions
                  ];
          transaction.objectStore(assetStoreName).put(bundle.asset);
          transaction.objectStore(revisionStoreName).add(bundle.revision);
          for (const dependency of bundle.dependencies ?? []) {
            dependencyStore?.add(storedDependency(dependency));
          }
        }
        for (const source of sourceDocuments) {
          transaction
            .objectStore(customContentStoreNames.sourceDocuments)
            .add(source.document);
          transaction
            .objectStore(customContentStoreNames.sourceDocumentBlobs)
            .add({
              sourceDocumentId: source.document.sourceDocumentId,
              blob: source.blob
            } satisfies StoredSourceDocumentBlob);
        }
        for (const task of processingTasks) {
          transaction
            .objectStore(customContentStoreNames.processingTasks)
            .add(task);
        }
        for (const unit of processingUnits) {
          transaction
            .objectStore(customContentStoreNames.processingUnits)
            .add(unit);
        }
        for (const structure of parsedStructures) {
          transaction
            .objectStore(customContentStoreNames.sourceStructures)
            .add(structure);
        }
        for (const result of parsedExtractionResults) {
          transaction
            .objectStore(customContentStoreNames.extractionResults)
            .add(result);
        }
        for (const entry of parsedCarryLedgerEntries) {
          transaction
            .objectStore(customContentStoreNames.carryLedgerEntries)
            .add(entry);
        }
        for (const result of parsedAggregationResults) {
          transaction
            .objectStore(customContentStoreNames.aggregationResults)
            .add(result);
        }
        for (const result of parsedProjectDraftResults) {
          transaction
            .objectStore(customContentStoreNames.projectDraftResults)
            .add(result);
        }
        await transactionDone(transaction);
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have aborted because of a request error.
        }
        throw error;
      }
    } finally {
      db.close();
    }
  }

  async saveCharacterRevisionBundles(
    bundles: readonly SaveCustomCharacterRevisionBundle[]
  ): Promise<void> {
    await this.saveRevisionBundles(bundles);
  }

  async saveCharacterAsset(asset: CustomCharacterAsset): Promise<void> {
    await this.putRecord(customContentStoreNames.characterAssets, asset);
  }

  async saveCharacterWorkingDraft(
    draft: CustomCharacterWorkingDraftRecord
  ): Promise<void> {
    await this.putRecord(customContentStoreNames.characterWorkingDrafts, draft);
  }

  async getCharacterWorkingDraft(
    workingDraftId: string
  ): Promise<CustomCharacterWorkingDraftRecord | null> {
    return this.getRecord(
      customContentStoreNames.characterWorkingDrafts,
      workingDraftId
    );
  }

  async listCharacterWorkingDrafts(): Promise<
    CustomCharacterWorkingDraftRecord[]
  > {
    return this.getAllRecords(customContentStoreNames.characterWorkingDrafts);
  }

  async deleteCharacterWorkingDraft(workingDraftId: string): Promise<void> {
    await this.deleteRecord(
      customContentStoreNames.characterWorkingDrafts,
      workingDraftId
    );
  }

  async getProjectAsset(
    projectId: string
  ): Promise<CustomContentProjectAsset | null> {
    return this.getRecord(
      customContentStoreNames.projectAssets,
      projectId
    );
  }

  async getCharacterAsset(
    characterAssetId: string
  ): Promise<CustomCharacterAsset | null> {
    return this.getRecord(
      customContentStoreNames.characterAssets,
      characterAssetId
    );
  }

  async getEventGroupAsset(
    eventGroupId: string
  ): Promise<CustomEventGroupAsset | null> {
    return this.getRecord(
      customContentStoreNames.eventGroupAssets,
      eventGroupId
    );
  }

  async listProjectAssets(): Promise<CustomContentProjectAsset[]> {
    return this.getAllRecords(customContentStoreNames.projectAssets);
  }

  async listCharacterAssets(): Promise<CustomCharacterAsset[]> {
    return this.getAllRecords(customContentStoreNames.characterAssets);
  }

  async listGlobalCharacterAssets(): Promise<CustomCharacterAsset[]> {
    return (await this.listCharacterAssets()).filter((asset) => asset.global);
  }

  async listProjectCharacterAssets(
    projectId: string
  ): Promise<CustomCharacterAsset[]> {
    return this.getAllFromIndex(
      customContentStoreNames.characterAssets,
      'by-project-id',
      projectId
    );
  }

  async listEventGroupAssets(): Promise<CustomEventGroupAsset[]> {
    return this.getAllRecords(customContentStoreNames.eventGroupAssets);
  }

  async listProjectEventGroupAssets(
    projectId: string
  ): Promise<CustomEventGroupAsset[]> {
    return this.getAllFromIndex(
      customContentStoreNames.eventGroupAssets,
      'by-project-id',
      projectId
    );
  }

  async getProjectRevision(
    projectId: string,
    revision: number
  ): Promise<CustomContentProjectRevision | null> {
    return this.getRecord(
      customContentStoreNames.projectRevisions,
      [projectId, revision]
    );
  }

  async getCharacterRevision(
    characterAssetId: string,
    revision: number
  ): Promise<CustomCharacterRevision | null> {
    return this.getRecord(
      customContentStoreNames.characterRevisions,
      [characterAssetId, revision]
    );
  }

  async getEventGroupRevision(
    eventGroupId: string,
    revision: number
  ): Promise<CustomEventGroupRevision | null> {
    return this.getRecord(
      customContentStoreNames.eventGroupRevisions,
      [eventGroupId, revision]
    );
  }

  async listProjectRevisions(
    projectId: string
  ): Promise<CustomContentProjectRevision[]> {
    return this.getAllFromIndex(
      customContentStoreNames.projectRevisions,
      'by-project-id',
      projectId
    );
  }

  async listCharacterRevisions(
    characterAssetId: string
  ): Promise<CustomCharacterRevision[]> {
    return this.getAllFromIndex(
      customContentStoreNames.characterRevisions,
      'by-character-asset-id',
      characterAssetId
    );
  }

  async listEventGroupRevisions(
    eventGroupId: string
  ): Promise<CustomEventGroupRevision[]> {
    return this.getAllFromIndex(
      customContentStoreNames.eventGroupRevisions,
      'by-event-group-id',
      eventGroupId
    );
  }

  async deleteCharacterAsset(
    characterAssetId: string,
    protectedRevisions: readonly number[] = []
  ): Promise<number> {
    const revisions = await this.listCharacterRevisions(characterAssetId);
    const protectedSet = new Set(protectedRevisions);
    const blocked = revisions
      .map((revision) => revision.revision)
      .filter((revision) => protectedSet.has(revision));
    if (blocked.length > 0) {
      throw new CustomContentDeletionProtectedError(
        'character',
        characterAssetId,
        blocked
      );
    }
    await this.deleteAssetHistory({
      assetId: characterAssetId,
      assetStoreName: customContentStoreNames.characterAssets,
      revisionStoreName: customContentStoreNames.characterRevisions,
      revisionIndexName: 'by-character-asset-id',
      revisionRefs: revisions.map(createCustomContentRevisionRef)
    });
    return revisions.length;
  }

  async deleteEventGroupAsset(
    eventGroupId: string,
    protectedRevisions: readonly number[] = []
  ): Promise<number> {
    const revisions = await this.listEventGroupRevisions(eventGroupId);
    const protectedSet = new Set(protectedRevisions);
    const blocked = revisions
      .map((revision) => revision.revision)
      .filter((revision) => protectedSet.has(revision));
    if (blocked.length > 0) {
      throw new CustomContentDeletionProtectedError(
        'event_group',
        eventGroupId,
        blocked
      );
    }
    await this.deleteAssetHistory({
      assetId: eventGroupId,
      assetStoreName: customContentStoreNames.eventGroupAssets,
      revisionStoreName: customContentStoreNames.eventGroupRevisions,
      revisionIndexName: 'by-event-group-id',
      revisionRefs: revisions.map(createCustomContentRevisionRef)
    });
    return revisions.length;
  }

  async saveSourceDocument(
    document: CustomSourceDocument,
    blob: Blob
  ): Promise<void> {
    if (document.byteLength !== blob.size) {
      throw new Error('Source document byteLength does not match its Blob.');
    }
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          customContentStoreNames.sourceDocuments,
          customContentStoreNames.sourceDocumentBlobs
        ],
        'readwrite'
      );
      transaction
        .objectStore(customContentStoreNames.sourceDocuments)
        .add(document);
      transaction
        .objectStore(customContentStoreNames.sourceDocumentBlobs)
        .add({
          sourceDocumentId: document.sourceDocumentId,
          blob
        } satisfies StoredSourceDocumentBlob);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async listSourceDocuments(): Promise<CustomSourceDocument[]> {
    return this.getAllRecords(customContentStoreNames.sourceDocuments);
  }

  async loadSourceDocument(
    sourceDocumentId: string
  ): Promise<{ document: CustomSourceDocument; blob: Blob } | null> {
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          customContentStoreNames.sourceDocuments,
          customContentStoreNames.sourceDocumentBlobs
        ],
        'readonly'
      );
      const [document, payload] = await Promise.all([
        requestToPromise<CustomSourceDocument | undefined>(
          transaction
            .objectStore(customContentStoreNames.sourceDocuments)
            .get(sourceDocumentId)
        ),
        requestToPromise<StoredSourceDocumentBlob | undefined>(
          transaction
            .objectStore(customContentStoreNames.sourceDocumentBlobs)
            .get(sourceDocumentId)
        )
      ]);
      if (!document || !payload) return null;
      return { document, blob: payload.blob };
    } finally {
      db.close();
    }
  }

  async saveSourceStructure(
    structure: CustomSourceStructure
  ): Promise<void> {
    const validated = parseCustomSourceStructure(structure);
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          customContentStoreNames.sourceDocuments,
          customContentStoreNames.sourceStructures
        ],
        'readwrite'
      );
      try {
        const sourceDocument =
          await requestToPromise<CustomSourceDocument | undefined>(
            transaction
              .objectStore(customContentStoreNames.sourceDocuments)
              .get(validated.sourceDocumentId)
          );
        if (!sourceDocument) {
          throw new Error(
            'Source structure requires an existing source document.'
          );
        }
        if (sourceDocument.characterCount !== validated.characterCount) {
          throw new Error(
            'Source structure characterCount does not match its source document.'
          );
        }
        transaction
          .objectStore(customContentStoreNames.sourceStructures)
          .put(validated);
        await transactionDone(transaction);
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        throw error;
      }
    } finally {
      db.close();
    }
  }

  async loadSourceStructure(
    sourceStructureId: string
  ): Promise<CustomSourceStructure | null> {
    const stored = await this.getRecord<unknown>(
      customContentStoreNames.sourceStructures,
      sourceStructureId
    );
    return stored === null ? null : parseCustomSourceStructure(stored);
  }

  async listSourceStructures(
    sourceDocumentId: string
  ): Promise<CustomSourceStructure[]> {
    const stored = await this.getAllFromIndex<unknown>(
      customContentStoreNames.sourceStructures,
      'by-source-document-id',
      sourceDocumentId
    );
    return stored
      .map(parseCustomSourceStructure)
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.sourceStructureId.localeCompare(right.sourceStructureId)
      );
  }

  async saveAiProcessingTaskBundle(
    bundle: SaveCustomAiProcessingTaskBundle
  ): Promise<void> {
    const task = validateAiProcessingTask(bundle.task);
    const units = validateAiProcessingUnits(task, bundle.units);
    if (
      task.status !== 'queued' ||
      task.stateRevision !== 0 ||
      task.completedUnitCount !== 0 ||
      task.totalUnitCount !== units.length ||
      units.length === 0 ||
      units.some((unit) => unit.status !== 'queued')
    ) {
      throw new Error('New AI processing tasks must contain queued source units.');
    }

    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          customContentStoreNames.sourceDocuments,
          customContentStoreNames.sourceStructures,
          customContentStoreNames.processingTasks,
          customContentStoreNames.processingUnits
        ],
        'readwrite'
      );
      const completion = transactionDone(transaction);
      try {
        const [sourceDocument, storedStructure, currentTask] =
          await Promise.all([
            requestToPromise<CustomSourceDocument | undefined>(
              transaction
                .objectStore(customContentStoreNames.sourceDocuments)
                .get(task.sourceDocumentId)
            ),
            requestToPromise<unknown>(
              transaction
                .objectStore(customContentStoreNames.sourceStructures)
                .get(task.aiProcessing.sourceStructureId)
            ),
            requestToPromise<CustomContentProcessingTask | undefined>(
              transaction
                .objectStore(customContentStoreNames.processingTasks)
                .get(task.taskId)
            )
          ]);
        if (currentTask) {
          throw new CustomContentTaskStateConflictError(
            'AI processing task already exists.'
          );
        }
        if (!sourceDocument || !storedStructure) {
          throw new Error('AI processing task requires its source and structure.');
        }
        const structure = parseCustomSourceStructure(storedStructure);
        if (
          structure.sourceDocumentId !== task.sourceDocumentId ||
          structure.canonicalTextChecksum !== task.inputChecksum ||
          structure.chunks.length !== units.length
        ) {
          throw new Error('AI processing task identity does not match its source structure.');
        }
        for (const [index, unit] of units.entries()) {
          const chunk = structure.chunks[index];
          if (
            !chunk ||
            chunk.sequence !== unit.sequence ||
            chunk.sourceSpan.startOffset !== unit.sourceSpan!.startOffset ||
            chunk.sourceSpan.endOffset !== unit.sourceSpan!.endOffset ||
            chunk.sourceSpan.checksum !== unit.sourceSpan!.checksum
          ) {
            throw new Error('AI processing units must map one-to-one to source chunks.');
          }
        }

        transaction
          .objectStore(customContentStoreNames.processingTasks)
          .add(task);
        const unitStore = transaction.objectStore(
          customContentStoreNames.processingUnits
        );
        for (const unit of units) unitStore.add(unit);
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }

  async saveAiProcessingCheckpoint(
    checkpoint: SaveCustomAiProcessingCheckpoint
  ): Promise<void> {
    const task = validateAiProcessingTask(checkpoint.task);
    const changedUnits = validateAiProcessingUnits(task, checkpoint.units);
    const results = (checkpoint.results ?? []).map(
      parseCustomLocalExtractionResult
    );
    const carryLedgerEntries = (checkpoint.carryLedgerEntries ?? []).map(
      parseCustomSourceCarryLedgerEntry
    );
    if (changedUnits.length === 0) {
      throw new Error('AI processing checkpoint requires at least one changed unit.');
    }

    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          customContentStoreNames.sourceStructures,
          customContentStoreNames.processingTasks,
          customContentStoreNames.processingUnits,
          customContentStoreNames.extractionResults,
          customContentStoreNames.carryLedgerEntries
        ],
        'readwrite'
      );
      const completion = transactionDone(transaction);
      try {
        const [currentTask, storedStructure, currentUnits] = await Promise.all([
          requestToPromise<CustomContentProcessingTask | undefined>(
            transaction
              .objectStore(customContentStoreNames.processingTasks)
              .get(task.taskId)
          ),
          requestToPromise<unknown>(
            transaction
              .objectStore(customContentStoreNames.sourceStructures)
              .get(task.aiProcessing.sourceStructureId)
          ),
          requestToPromise<CustomContentProcessingUnit[]>(
            transaction
              .objectStore(customContentStoreNames.processingUnits)
              .index('by-task-id')
              .getAll(task.taskId)
          )
        ]);
        if (
          !currentTask ||
          (currentTask.stateRevision ?? 0) !== checkpoint.expectedStateRevision
        ) {
          throw new CustomContentTaskStateConflictError();
        }
        if (!storedStructure) {
          throw new Error('AI processing checkpoint lost its source structure.');
        }
        const structure = parseCustomSourceStructure(storedStructure);
        const currentById = new Map(
          currentUnits.map((unit) => [unit.unitId, unit])
        );
        for (const unit of changedUnits) {
          if (!currentById.has(unit.unitId)) {
            throw new Error('AI processing checkpoint cannot add an unknown unit.');
          }
          currentById.set(unit.unitId, unit);
        }
        const nextUnits = [...currentById.values()];
        if (
          nextUnits.length !== task.totalUnitCount ||
          nextUnits.filter((unit) => unit.status === 'completed').length !==
            task.completedUnitCount ||
          (task.status === 'completed' &&
            nextUnits.some((unit) => unit.status !== 'completed'))
        ) {
          throw new Error('AI processing task progress does not match its units.');
        }

        const changedById = new Map(
          changedUnits.map((unit) => [unit.unitId, unit])
        );
        for (const result of results) {
          const unit = changedById.get(result.unitId);
          const chunk = structure.chunks.find(
            (item) => item.chunkId === result.chunkId
          );
          if (
            !unit ||
            unit.status !== 'completed' ||
            unit.resultRef !== result.extractionResultId ||
            result.taskId !== task.taskId ||
            result.sourceDocumentId !== task.sourceDocumentId ||
            result.sourceStructureId !== task.aiProcessing.sourceStructureId ||
            !chunk ||
            chunk.sequence !== unit.sequence
          ) {
            throw new Error('AI extraction result does not match its completed unit.');
          }
        }
        const suppliedResultIds = new Set(
          results.map((result) => result.extractionResultId)
        );
        const suppliedCarryResultIds = new Set(
          carryLedgerEntries.map((entry) => entry.extractionResultId)
        );
        if (
          suppliedCarryResultIds.size !== carryLedgerEntries.length ||
          carryLedgerEntries.some(
            (entry) =>
              !suppliedResultIds.has(entry.extractionResultId) ||
              entry.extractionTaskId !== task.taskId ||
              entry.sourceDocumentId !== task.sourceDocumentId ||
              entry.sourceStructureId !== task.aiProcessing.sourceStructureId
          )
        ) {
          throw new Error(
            'AI extraction carry ledger does not match its supplied result.'
          );
        }
        if (
          results.some(
            (result) => !suppliedCarryResultIds.has(result.extractionResultId)
          )
        ) {
          throw new Error(
            'Every new AI extraction result requires a carry ledger entry.'
          );
        }
        for (const unit of changedUnits) {
          if (
            unit.status === 'completed' &&
            (!unit.resultRef || !suppliedResultIds.has(unit.resultRef))
          ) {
            const existingResult = unit.resultRef
              ? await requestToPromise<unknown>(
                  transaction
                    .objectStore(customContentStoreNames.extractionResults)
                    .get(unit.resultRef)
                )
              : undefined;
            if (!existingResult) {
              throw new Error(
                'Completed AI processing units require a persisted result.'
              );
            }
          }
        }

        transaction
          .objectStore(customContentStoreNames.processingTasks)
          .put(task);
        const unitStore = transaction.objectStore(
          customContentStoreNames.processingUnits
        );
        for (const unit of changedUnits) unitStore.put(unit);
        const resultStore = transaction.objectStore(
          customContentStoreNames.extractionResults
        );
        for (const result of results) resultStore.put(result);
        const carryStore = transaction.objectStore(
          customContentStoreNames.carryLedgerEntries
        );
        for (const entry of carryLedgerEntries) carryStore.put(entry);
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }

  async saveSourceAggregationTaskBundle(
    bundle: SaveCustomSourceAggregationTaskBundle
  ): Promise<void> {
    const task = validateSourceAggregationTask(bundle.task);
    const units = validateAiProcessingUnits(task, bundle.units);
    if (
      task.status !== 'queued' ||
      task.stateRevision !== 0 ||
      task.completedUnitCount !== 0 ||
      task.totalUnitCount !== units.length ||
      units.length === 0 ||
      units.some(
        (unit) =>
          unit.status !== 'queued' ||
          !unit.inputRefs?.length ||
          unit.inputRefs.length >
            (task.aiProcessing.maxLowerResultsPerUnit ?? 128)
      )
    ) {
      throw new Error(
        'New source aggregation tasks require queued units with bounded lower-level inputs.'
      );
    }
    const allInputRefs = units.flatMap((unit) => unit.inputRefs ?? []);
    if (new Set(allInputRefs).size !== allInputRefs.length) {
      throw new Error(
        'Source aggregation lower-level inputs may only belong to one unit.'
      );
    }

    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          customContentStoreNames.sourceDocuments,
          customContentStoreNames.sourceStructures,
          customContentStoreNames.processingTasks,
          customContentStoreNames.processingUnits,
          customContentStoreNames.extractionResults,
          customContentStoreNames.aggregationResults
        ],
        'readwrite'
      );
      const completion = transactionDone(transaction);
      try {
        const [sourceDocument, storedStructure, currentTask] =
          await Promise.all([
            requestToPromise<CustomSourceDocument | undefined>(
              transaction
                .objectStore(customContentStoreNames.sourceDocuments)
                .get(task.sourceDocumentId)
            ),
            requestToPromise<unknown>(
              transaction
                .objectStore(customContentStoreNames.sourceStructures)
                .get(task.aiProcessing.sourceStructureId)
            ),
            requestToPromise<CustomContentProcessingTask | undefined>(
              transaction
                .objectStore(customContentStoreNames.processingTasks)
                .get(task.taskId)
            )
          ]);
        if (currentTask) {
          throw new CustomContentTaskStateConflictError(
            'Source aggregation task already exists.'
          );
        }
        if (!sourceDocument || !storedStructure) {
          throw new Error(
            'Source aggregation task requires its source and structure.'
          );
        }
        const structure = parseCustomSourceStructure(storedStructure);
        if (
          structure.sourceDocumentId !== task.sourceDocumentId ||
          structure.canonicalTextChecksum !== task.inputChecksum
        ) {
          throw new Error(
            'Source aggregation task identity does not match its source structure.'
          );
        }

        if (task.taskKind === 'aggregate_chapter') {
          if (units.length !== structure.chapters.length) {
            throw new Error(
              'Chapter aggregation must contain one unit per source chapter.'
            );
          }
          const extractionStore = transaction.objectStore(
            customContentStoreNames.extractionResults
          );
          for (const [index, unit] of units.entries()) {
            const chapter = structure.chapters[index];
            if (
              !chapter ||
              unit.sequence !== chapter.sequence ||
              unit.sourceSpan?.startOffset !== chapter.sourceSpan.startOffset ||
              unit.sourceSpan.endOffset !== chapter.sourceSpan.endOffset
            ) {
              throw new Error(
                'Chapter aggregation units must map one-to-one to source chapters.'
              );
            }
            const chapterChunkIds = structure.chunks
              .filter((chunk) => chunk.chapterId === chapter.chapterId)
              .map((chunk) => chunk.chunkId);
            const referencedChunkIds: string[] = [];
            for (const ref of unit.inputRefs ?? []) {
              const stored = await requestToPromise<unknown>(
                extractionStore.get(ref)
              );
              if (!stored) {
                throw new Error(
                  'Chapter aggregation references a missing extraction result.'
                );
              }
              const result = parseCustomLocalExtractionResult(stored);
              if (
                result.sourceDocumentId !== task.sourceDocumentId ||
                result.sourceStructureId !== task.aiProcessing.sourceStructureId ||
                !task.aiProcessing.inputTaskIds!.includes(result.taskId)
              ) {
                throw new Error(
                  'Chapter aggregation input is outside its authorized lower task.'
                );
              }
              referencedChunkIds.push(result.chunkId);
            }
            if (
              chapterChunkIds.length !== referencedChunkIds.length ||
              chapterChunkIds.some(
                (chunkId, chunkIndex) =>
                  chunkId !== referencedChunkIds[chunkIndex]
              )
            ) {
              throw new Error(
                'Chapter aggregation inputs must cover the chapter chunks in order.'
              );
            }
          }
        } else {
          const expectedLowerLevel =
            task.taskKind === 'aggregate_stage' ? 'chapter' : 'stage';
          const levelLabel =
            task.taskKind === 'aggregate_stage' ? 'Stage' : 'Story arc';
          const lowerLabel =
            task.taskKind === 'aggregate_stage' ? 'chapter' : 'stage';
          const aggregateStore = transaction.objectStore(
            customContentStoreNames.aggregationResults
          );
          for (const unit of units) {
            let previousSequence = -1;
            for (const ref of unit.inputRefs ?? []) {
              const stored = await requestToPromise<unknown>(
                aggregateStore.get(ref)
              );
              if (!stored) {
                throw new Error(
                  `${levelLabel} aggregation references a missing ${lowerLabel} result.`
                );
              }
              const result = parseCustomSourceAggregationResult(stored);
              const sequence = result.sourceSpans[0]!.sequence;
              if (
                result.aggregationLevel !== expectedLowerLevel ||
                result.sourceDocumentId !== task.sourceDocumentId ||
                result.sourceStructureId !== task.aiProcessing.sourceStructureId ||
                !task.aiProcessing.inputTaskIds!.includes(result.taskId) ||
                sequence <= previousSequence
              ) {
                throw new Error(
                  `${levelLabel} aggregation inputs must be ordered ${lowerLabel} summaries from the authorized lower task.`
                );
              }
              previousSequence = sequence;
            }
          }
        }

        transaction
          .objectStore(customContentStoreNames.processingTasks)
          .add(task);
        const unitStore = transaction.objectStore(
          customContentStoreNames.processingUnits
        );
        for (const unit of units) unitStore.add(unit);
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }

  async saveSourceAggregationCheckpoint(
    checkpoint: SaveCustomSourceAggregationCheckpoint
  ): Promise<void> {
    const task = validateSourceAggregationTask(checkpoint.task);
    const changedUnits = validateAiProcessingUnits(task, checkpoint.units);
    const results = (checkpoint.results ?? []).map(
      parseCustomSourceAggregationResult
    );
    if (changedUnits.length === 0) {
      throw new Error(
        'Source aggregation checkpoint requires at least one changed unit.'
      );
    }

    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          customContentStoreNames.processingTasks,
          customContentStoreNames.processingUnits,
          customContentStoreNames.aggregationResults
        ],
        'readwrite'
      );
      const completion = transactionDone(transaction);
      try {
        const [currentTask, currentUnits] = await Promise.all([
          requestToPromise<CustomContentProcessingTask | undefined>(
            transaction
              .objectStore(customContentStoreNames.processingTasks)
              .get(task.taskId)
          ),
          requestToPromise<CustomContentProcessingUnit[]>(
            transaction
              .objectStore(customContentStoreNames.processingUnits)
              .index('by-task-id')
              .getAll(task.taskId)
          )
        ]);
        if (
          !currentTask ||
          (currentTask.stateRevision ?? 0) !== checkpoint.expectedStateRevision
        ) {
          throw new CustomContentTaskStateConflictError();
        }
        const currentById = new Map(
          currentUnits.map((unit) => [unit.unitId, unit])
        );
        for (const unit of changedUnits) {
          const current = currentById.get(unit.unitId);
          if (
            !current ||
            JSON.stringify(current.inputRefs ?? []) !==
              JSON.stringify(unit.inputRefs ?? [])
          ) {
            throw new Error(
              'Source aggregation checkpoint cannot add or retarget a unit.'
            );
          }
          currentById.set(unit.unitId, unit);
        }
        const nextUnits = [...currentById.values()];
        if (
          nextUnits.length !== task.totalUnitCount ||
          nextUnits.filter((unit) => unit.status === 'completed').length !==
            task.completedUnitCount ||
          (task.status === 'completed' &&
            nextUnits.some((unit) => unit.status !== 'completed'))
        ) {
          throw new Error(
            'Source aggregation task progress does not match its units.'
          );
        }
        const changedById = new Map(
          changedUnits.map((unit) => [unit.unitId, unit])
        );
        for (const result of results) {
          const unit = changedById.get(result.unitId);
          if (
            !unit ||
            unit.status !== 'completed' ||
            unit.resultRef !== result.aggregationResultId ||
            result.taskId !== task.taskId ||
            result.aggregationLevel !== task.aiProcessing.aggregationLevel ||
            result.sourceDocumentId !== task.sourceDocumentId ||
            result.sourceStructureId !== task.aiProcessing.sourceStructureId ||
            JSON.stringify(result.lowerResultRefs) !==
              JSON.stringify(unit.inputRefs ?? [])
          ) {
            throw new Error(
              'Source aggregation result does not match its completed unit.'
            );
          }
        }
        const suppliedResultIds = new Set(
          results.map((result) => result.aggregationResultId)
        );
        const resultStore = transaction.objectStore(
          customContentStoreNames.aggregationResults
        );
        for (const unit of changedUnits) {
          if (
            unit.status === 'completed' &&
            (!unit.resultRef || !suppliedResultIds.has(unit.resultRef))
          ) {
            const existingResult = unit.resultRef
              ? await requestToPromise<unknown>(
                  resultStore.get(unit.resultRef)
                )
              : undefined;
            if (!existingResult) {
              throw new Error(
                'Completed source aggregation units require a persisted result.'
              );
            }
          }
        }

        transaction
          .objectStore(customContentStoreNames.processingTasks)
          .put(task);
        const unitStore = transaction.objectStore(
          customContentStoreNames.processingUnits
        );
        for (const unit of changedUnits) unitStore.put(unit);
        for (const result of results) resultStore.put(result);
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }

  async saveSourceProjectBuildTaskBundle(
    bundle: SaveCustomSourceProjectBuildTaskBundle
  ): Promise<void> {
    const task = validateSourceProjectBuildTask(bundle.task);
    const unit = validateAiProcessingUnits(task, [bundle.unit])[0]!;
    if (
      task.status !== 'queued' ||
      task.stateRevision !== 0 ||
      task.completedUnitCount !== 0 ||
      task.totalUnitCount !== 1 ||
      unit.status !== 'queued' ||
      !unit.inputRefs?.length ||
      task.aiProcessing.inputTaskIds!.length !== 1 ||
      unit.inputRefs.length >
        (task.aiProcessing.maxLowerResultsPerUnit ?? 128)
    ) {
      throw new Error(
        'New source project build tasks require one queued unit with bounded story-arc inputs.'
      );
    }
    if (new Set(unit.inputRefs).size !== unit.inputRefs.length) {
      throw new Error('Source project build inputs must be unique.');
    }

    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          customContentStoreNames.sourceDocuments,
          customContentStoreNames.sourceStructures,
          customContentStoreNames.processingTasks,
          customContentStoreNames.processingUnits,
          customContentStoreNames.aggregationResults
        ],
        'readwrite'
      );
      const completion = transactionDone(transaction);
      try {
        const inputTaskId = task.aiProcessing.inputTaskIds![0]!;
        const [sourceDocument, storedStructure, lowerTask, currentTask] =
          await Promise.all([
            requestToPromise<CustomSourceDocument | undefined>(
              transaction
                .objectStore(customContentStoreNames.sourceDocuments)
                .get(task.sourceDocumentId)
            ),
            requestToPromise<unknown>(
              transaction
                .objectStore(customContentStoreNames.sourceStructures)
                .get(task.aiProcessing.sourceStructureId)
            ),
            requestToPromise<CustomContentProcessingTask | undefined>(
              transaction
                .objectStore(customContentStoreNames.processingTasks)
                .get(inputTaskId)
            ),
            requestToPromise<CustomContentProcessingTask | undefined>(
              transaction
                .objectStore(customContentStoreNames.processingTasks)
                .get(task.taskId)
            )
          ]);
        if (currentTask) {
          throw new CustomContentTaskStateConflictError(
            'Source project build task already exists.'
          );
        }
        if (!sourceDocument || !storedStructure) {
          throw new Error(
            'Source project build task requires its source and structure.'
          );
        }
        const structure = parseCustomSourceStructure(storedStructure);
        if (
          structure.sourceDocumentId !== task.sourceDocumentId ||
          structure.canonicalTextChecksum !== task.inputChecksum
        ) {
          throw new Error(
            'Source project build identity does not match its source structure.'
          );
        }
        if (
          !lowerTask ||
          lowerTask.taskKind !== 'aggregate_arc' ||
          lowerTask.status !== 'completed' ||
          lowerTask.sourceDocumentId !== task.sourceDocumentId ||
          lowerTask.aiProcessing?.sourceStructureId !==
            task.aiProcessing.sourceStructureId
        ) {
          throw new Error(
            'Source project build requires one completed story-arc task.'
          );
        }
        const storedInputs = await requestToPromise<unknown[]>(
          transaction
            .objectStore(customContentStoreNames.aggregationResults)
            .index('by-task-id')
            .getAll(inputTaskId)
        );
        const inputResults = storedInputs
          .map(parseCustomSourceAggregationResult)
          .sort(
            (left, right) =>
              left.sourceSpans[0]!.sequence -
                right.sourceSpans[0]!.sequence ||
              left.aggregationResultId.localeCompare(
                right.aggregationResultId
              )
          );
        if (
          inputResults.length !== lowerTask.totalUnitCount ||
          inputResults.some(
            (result) =>
              result.aggregationLevel !== 'arc' ||
              !result.storyArcs?.length
          ) ||
          JSON.stringify(
            inputResults.map((result) => result.aggregationResultId)
          ) !== JSON.stringify(unit.inputRefs)
        ) {
          throw new Error(
            'Source project build inputs must cover the authorized story-arc results in order.'
          );
        }

        transaction
          .objectStore(customContentStoreNames.processingTasks)
          .add(task);
        transaction
          .objectStore(customContentStoreNames.processingUnits)
          .add(unit);
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }

  async saveSourceProjectBuildCheckpoint(
    checkpoint: SaveCustomSourceProjectBuildCheckpoint
  ): Promise<void> {
    const task = validateSourceProjectBuildTask(checkpoint.task);
    const unit = validateAiProcessingUnits(task, [checkpoint.unit])[0]!;
    const result = checkpoint.result
      ? parseCustomSourceProjectDraftResult(checkpoint.result)
      : undefined;

    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          customContentStoreNames.processingTasks,
          customContentStoreNames.processingUnits,
          customContentStoreNames.aggregationResults,
          customContentStoreNames.projectDraftResults
        ],
        'readwrite'
      );
      const completion = transactionDone(transaction);
      try {
        const [currentTask, currentUnit] = await Promise.all([
          requestToPromise<CustomContentProcessingTask | undefined>(
            transaction
              .objectStore(customContentStoreNames.processingTasks)
              .get(task.taskId)
          ),
          requestToPromise<CustomContentProcessingUnit | undefined>(
            transaction
              .objectStore(customContentStoreNames.processingUnits)
              .get(unit.unitId)
          )
        ]);
        if (
          !currentTask ||
          !currentUnit ||
          (currentTask.stateRevision ?? 0) !==
            checkpoint.expectedStateRevision
        ) {
          throw new CustomContentTaskStateConflictError();
        }
        if (
          currentUnit.taskId !== task.taskId ||
          JSON.stringify(currentUnit.inputRefs ?? []) !==
            JSON.stringify(unit.inputRefs ?? []) ||
          task.totalUnitCount !== 1 ||
          task.completedUnitCount !== (unit.status === 'completed' ? 1 : 0) ||
          (task.status === 'completed' && unit.status !== 'completed')
        ) {
          throw new Error(
            'Source project build checkpoint cannot retarget its unit or misreport progress.'
          );
        }

        const resultStore = transaction.objectStore(
          customContentStoreNames.projectDraftResults
        );
        if (result) {
          const inputResults: CustomSourceAggregationResult[] = [];
          const aggregationStore = transaction.objectStore(
            customContentStoreNames.aggregationResults
          );
          for (const ref of unit.inputRefs ?? []) {
            const stored = await requestToPromise<unknown>(
              aggregationStore.get(ref)
            );
            if (!stored) {
              throw new Error(
                'Source project build result references a missing story-arc result.'
              );
            }
            inputResults.push(parseCustomSourceAggregationResult(stored));
          }
          const storyArcIds = inputResults.flatMap(
            (input) => input.storyArcs?.map((arc) => arc.storyArcId) ?? []
          );
          const sourceObservationIds = [
            ...new Set(
              inputResults.flatMap((input) => [
                ...input.establishedFacts.map((item) => item.observationId),
                ...input.eventThreads.map((item) => item.observationId),
                ...input.informationVisibility.map(
                  (item) => item.observationId
                ),
                ...input.unresolvedContradictions.map(
                  (item) => item.observationId
                ),
                ...input.contentGaps.map((item) => item.observationId),
                ...input.characterMergeSuggestions.flatMap(
                  (suggestion) => suggestion.sourceObservationIds
                ),
                ...(input.storyArcs?.flatMap(
                  (arc) => arc.sourceObservationIds
                ) ?? [])
              ])
            )
          ];
          const suggestionIds = inputResults.flatMap((input) =>
            input.characterMergeSuggestions.map(
              (suggestion) => suggestion.suggestionId
            )
          );
          if (
            unit.status !== 'completed' ||
            unit.resultRef !== result.projectDraftResultId ||
            result.taskId !== task.taskId ||
            result.unitId !== unit.unitId ||
            result.sourceDocumentId !== task.sourceDocumentId ||
            result.sourceStructureId !==
              task.aiProcessing.sourceStructureId ||
            result.conversionMode !== task.aiProcessing.conversionMode ||
            JSON.stringify(result.sourceAggregationResultRefs) !==
              JSON.stringify(unit.inputRefs ?? []) ||
            JSON.stringify(result.storyArcIds) !==
              JSON.stringify(storyArcIds) ||
            JSON.stringify(result.sourceObservationIds) !==
              JSON.stringify(sourceObservationIds) ||
            JSON.stringify(result.characterMergeSuggestionIds) !==
              JSON.stringify(suggestionIds)
          ) {
            throw new Error(
              'Source project draft result does not match its authorized story-arc inputs.'
            );
          }
          resultStore.put(result);
        } else if (unit.status === 'completed') {
          const existingResult = unit.resultRef
            ? await requestToPromise<unknown>(
                resultStore.get(unit.resultRef)
              )
            : undefined;
          if (!existingResult) {
            throw new Error(
              'Completed source project build units require a persisted result.'
            );
          }
        }

        transaction
          .objectStore(customContentStoreNames.processingTasks)
          .put(task);
        transaction
          .objectStore(customContentStoreNames.processingUnits)
          .put(unit);
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }

  async loadExtractionResult(
    extractionResultId: string
  ): Promise<CustomLocalExtractionResult | null> {
    const stored = await this.getRecord<unknown>(
      customContentStoreNames.extractionResults,
      extractionResultId
    );
    return stored === null ? null : parseCustomLocalExtractionResult(stored);
  }

  async listExtractionResultsForTask(
    taskId: string
  ): Promise<CustomLocalExtractionResult[]> {
    const stored = await this.getAllFromIndex<unknown>(
      customContentStoreNames.extractionResults,
      'by-task-id',
      taskId
    );
    return stored
      .map(parseCustomLocalExtractionResult)
      .sort(
        (left, right) =>
          left.sourceSpan.sequence - right.sourceSpan.sequence ||
          left.extractionResultId.localeCompare(right.extractionResultId)
      );
  }

  async listExtractionResultsForSource(
    sourceDocumentId: string
  ): Promise<CustomLocalExtractionResult[]> {
    const stored = await this.getAllFromIndex<unknown>(
      customContentStoreNames.extractionResults,
      'by-source-document-id',
      sourceDocumentId
    );
    return stored
      .map(parseCustomLocalExtractionResult)
      .sort(
        (left, right) =>
          left.sourceSpan.sequence - right.sourceSpan.sequence ||
          left.extractionResultId.localeCompare(right.extractionResultId)
      );
  }

  async listCarryLedgerEntriesForTask(
    extractionTaskId: string
  ): Promise<CustomSourceCarryLedgerEntry[]> {
    const stored = await this.getAllFromIndex<unknown>(
      customContentStoreNames.carryLedgerEntries,
      'by-extraction-task-id',
      extractionTaskId
    );
    return stored
      .map(parseCustomSourceCarryLedgerEntry)
      .sort(
        (left, right) =>
          left.sequence - right.sequence ||
          left.carryLedgerEntryId.localeCompare(right.carryLedgerEntryId)
      );
  }

  async loadCarryLedgerEntry(
    carryLedgerEntryId: string
  ): Promise<CustomSourceCarryLedgerEntry | null> {
    const stored = await this.getRecord<unknown>(
      customContentStoreNames.carryLedgerEntries,
      carryLedgerEntryId
    );
    return stored === null ? null : parseCustomSourceCarryLedgerEntry(stored);
  }

  async listCarryLedgerEntriesForSource(
    sourceDocumentId: string
  ): Promise<CustomSourceCarryLedgerEntry[]> {
    const stored = await this.getAllFromIndex<unknown>(
      customContentStoreNames.carryLedgerEntries,
      'by-source-document-id',
      sourceDocumentId
    );
    return stored
      .map(parseCustomSourceCarryLedgerEntry)
      .sort(
        (left, right) =>
          left.sequence - right.sequence ||
          left.carryLedgerEntryId.localeCompare(right.carryLedgerEntryId)
      );
  }

  async loadAggregationResult(
    aggregationResultId: string
  ): Promise<CustomSourceAggregationResult | null> {
    const stored = await this.getRecord<unknown>(
      customContentStoreNames.aggregationResults,
      aggregationResultId
    );
    return stored === null
      ? null
      : parseCustomSourceAggregationResult(stored);
  }

  async listAggregationResultsForTask(
    taskId: string
  ): Promise<CustomSourceAggregationResult[]> {
    const stored = await this.getAllFromIndex<unknown>(
      customContentStoreNames.aggregationResults,
      'by-task-id',
      taskId
    );
    return stored
      .map(parseCustomSourceAggregationResult)
      .sort(
        (left, right) =>
          left.sourceSpans[0]!.sequence - right.sourceSpans[0]!.sequence ||
          left.aggregationResultId.localeCompare(right.aggregationResultId)
      );
  }

  async listAggregationResultsForSource(
    sourceDocumentId: string
  ): Promise<CustomSourceAggregationResult[]> {
    const stored = await this.getAllFromIndex<unknown>(
      customContentStoreNames.aggregationResults,
      'by-source-document-id',
      sourceDocumentId
    );
    return stored
      .map(parseCustomSourceAggregationResult)
      .sort(
        (left, right) =>
          left.sourceSpans[0]!.sequence - right.sourceSpans[0]!.sequence ||
          left.aggregationResultId.localeCompare(right.aggregationResultId)
      );
  }

  async loadProjectDraftResult(
    projectDraftResultId: string
  ): Promise<CustomSourceProjectDraftResult | null> {
    const stored = await this.getRecord<unknown>(
      customContentStoreNames.projectDraftResults,
      projectDraftResultId
    );
    return stored === null
      ? null
      : parseCustomSourceProjectDraftResult(stored);
  }

  async loadProjectDraftResultForTask(
    taskId: string
  ): Promise<CustomSourceProjectDraftResult | null> {
    const stored = await this.getAllFromIndex<unknown>(
      customContentStoreNames.projectDraftResults,
      'by-task-id',
      taskId
    );
    if (stored.length > 1) {
      throw new Error('Source project build task has multiple draft results.');
    }
    return stored[0]
      ? parseCustomSourceProjectDraftResult(stored[0])
      : null;
  }

  async listProjectDraftResultsForSource(
    sourceDocumentId: string
  ): Promise<CustomSourceProjectDraftResult[]> {
    const stored = await this.getAllFromIndex<unknown>(
      customContentStoreNames.projectDraftResults,
      'by-source-document-id',
      sourceDocumentId
    );
    return stored
      .map(parseCustomSourceProjectDraftResult)
      .sort((left, right) =>
        left.projectDraftResultId.localeCompare(right.projectDraftResultId)
      );
  }

  async saveSourceProcessingCheckpoint(
    checkpoint: SaveCustomSourceProcessingCheckpoint
  ): Promise<void> {
    const { task, unit, sourceStructure } =
      validateSourceProcessingCheckpoint(checkpoint);
    const stores: CustomContentStoreName[] = [
      customContentStoreNames.sourceDocuments,
      customContentStoreNames.processingTasks,
      customContentStoreNames.processingUnits
    ];
    if (sourceStructure) {
      stores.push(customContentStoreNames.sourceStructures);
    }

    const db = await this.open();
    try {
      const transaction = db.transaction(stores, 'readwrite');
      const completion = transactionDone(transaction);
      try {
        const [currentTask, currentSourceDocument] = await Promise.all([
          requestToPromise<CustomContentProcessingTask | undefined>(
            transaction
              .objectStore(customContentStoreNames.processingTasks)
              .get(task.taskId)
          ),
          requestToPromise<CustomSourceDocument | undefined>(
            transaction
              .objectStore(customContentStoreNames.sourceDocuments)
              .get(task.sourceDocumentId!)
          )
        ]);
        if (!currentSourceDocument) {
          throw new Error(
            'Source processing task requires an existing source document.'
          );
        }
        if (checkpoint.expectedStateRevision === null && currentTask) {
          throw new CustomContentTaskStateConflictError(
            'Source processing task already exists.'
          );
        }
        if (
          typeof checkpoint.expectedStateRevision === 'number' &&
          (!currentTask ||
            (currentTask.stateRevision ?? 0) !==
              checkpoint.expectedStateRevision)
        ) {
          throw new CustomContentTaskStateConflictError();
        }

        const nextSourceDocument =
          checkpoint.sourceDocument ?? currentSourceDocument;
        if (
          nextSourceDocument.sourceDocumentId !==
            currentSourceDocument.sourceDocumentId ||
          nextSourceDocument.byteLength !== currentSourceDocument.byteLength ||
          nextSourceDocument.checksum !== currentSourceDocument.checksum ||
          nextSourceDocument.sourceFormat !==
            currentSourceDocument.sourceFormat
        ) {
          throw new Error(
            'Source processing cannot replace the original source identity.'
          );
        }
        if (
          sourceStructure &&
          nextSourceDocument.characterCount !==
            sourceStructure.characterCount
        ) {
          throw new Error(
            'Source structure characterCount does not match its source document.'
          );
        }

        transaction
          .objectStore(customContentStoreNames.sourceDocuments)
          .put(nextSourceDocument);
        transaction
          .objectStore(customContentStoreNames.processingTasks)
          .put(task);
        transaction
          .objectStore(customContentStoreNames.processingUnits)
          .put(unit);
        if (sourceStructure) {
          transaction
            .objectStore(customContentStoreNames.sourceStructures)
            .put(sourceStructure);
        }
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }

  async saveProcessingTask(task: CustomContentProcessingTask): Promise<void> {
    await this.putRecord(customContentStoreNames.processingTasks, task);
  }

  async loadProcessingTask(
    taskId: string
  ): Promise<CustomContentProcessingTask | null> {
    return this.getRecord(customContentStoreNames.processingTasks, taskId);
  }

  async listProcessingTasks(
    status?: CustomContentProcessingTaskStatus
  ): Promise<CustomContentProcessingTask[]> {
    if (status) {
      return this.getAllFromIndex(
        customContentStoreNames.processingTasks,
        'by-status',
        status
      );
    }
    return this.getAllRecords(customContentStoreNames.processingTasks);
  }

  async saveProcessingUnits(
    units: readonly CustomContentProcessingUnit[]
  ): Promise<void> {
    if (units.length === 0) return;
    const db = await this.open();
    try {
      const transaction = db.transaction(
        customContentStoreNames.processingUnits,
        'readwrite'
      );
      const store = transaction.objectStore(
        customContentStoreNames.processingUnits
      );
      try {
        for (const unit of units) store.put(unit);
      } catch (error) {
        transaction.abort();
        await transactionDone(transaction).catch(() => undefined);
        throw error;
      }
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async listProcessingUnits(
    taskId: string
  ): Promise<CustomContentProcessingUnit[]> {
    const units = await this.getAllFromIndex<CustomContentProcessingUnit>(
      customContentStoreNames.processingUnits,
      'by-task-id',
      taskId
    );
    return units.sort((left, right) => left.sequence - right.sequence);
  }

  async listDependenciesForOwner(
    owner: CustomContentRevisionRef
  ): Promise<CustomContentDependency[]> {
    const dependencies =
      await this.getAllFromIndex<StoredCustomContentDependency>(
        customContentStoreNames.dependencies,
        'by-owner-key',
        customContentRevisionRefKey(owner)
      );
    return dependencies.map(publicDependency);
  }

  async listDependenciesForTarget(
    target: CustomContentRevisionRef
  ): Promise<CustomContentDependency[]> {
    const dependencies =
      await this.getAllFromIndex<StoredCustomContentDependency>(
        customContentStoreNames.dependencies,
        'by-target-key',
        customContentRevisionRefKey(target)
      );
    return dependencies.map(publicDependency);
  }

  async clearAll(): Promise<void> {
    const db = await this.open();
    try {
      const storeNames = Object.values(customContentStoreNames);
      const transaction = db.transaction(storeNames, 'readwrite');
      for (const storeName of storeNames) {
        transaction.objectStore(storeName).clear();
      }
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  private async putRecord(
    storeName: CustomContentStoreName,
    value: unknown
  ): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  private async deleteRecord(
    storeName: CustomContentStoreName,
    key: IDBValidKey
  ): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(key);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  private async deleteAssetHistory({
    assetId,
    assetStoreName,
    revisionStoreName,
    revisionIndexName,
    revisionRefs
  }: {
    assetId: string;
    assetStoreName: CustomContentStoreName;
    revisionStoreName: CustomContentStoreName;
    revisionIndexName: string;
    revisionRefs: readonly CustomContentRevisionRef[];
  }): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          assetStoreName,
          revisionStoreName,
          customContentStoreNames.dependencies
        ],
        'readwrite'
      );
      const completion = transactionDone(transaction);
      try {
        transaction.objectStore(assetStoreName).delete(assetId);
        const revisionStore = transaction.objectStore(revisionStoreName);
        const dependencyStore = transaction.objectStore(
          customContentStoreNames.dependencies
        );
        const deletions = [
          deleteAllFromIndex(
            revisionStore,
            revisionIndexName,
            assetId
          )
        ];
        for (const revisionRef of revisionRefs) {
          const revisionKey = customContentRevisionRefKey(revisionRef);
          deletions.push(
            deleteAllFromIndex(
              dependencyStore,
              'by-owner-key',
              revisionKey
            ),
            deleteAllFromIndex(
              dependencyStore,
              'by-target-key',
              revisionKey
            )
          );
        }
        await Promise.all(deletions);
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    } finally {
      db.close();
    }
  }

  private async getRecord<T>(
    storeName: CustomContentStoreName,
    key: IDBValidKey | IDBKeyRange
  ): Promise<T | null> {
    const db = await this.open();
    try {
      const transaction = db.transaction(storeName, 'readonly');
      const value = await requestToPromise<T | undefined>(
        transaction.objectStore(storeName).get(key)
      );
      return value ?? null;
    } finally {
      db.close();
    }
  }

  private async getAllRecords<T>(
    storeName: CustomContentStoreName
  ): Promise<T[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction(storeName, 'readonly');
      return await requestToPromise<T[]>(
        transaction.objectStore(storeName).getAll()
      );
    } finally {
      db.close();
    }
  }

  private async getAllFromIndex<T>(
    storeName: CustomContentStoreName,
    indexName: string,
    key: IDBValidKey
  ): Promise<T[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction(storeName, 'readonly');
      return await requestToPromise<T[]>(
        transaction
          .objectStore(storeName)
          .index(indexName)
          .getAll(IDBKeyRange.only(key))
      );
    } finally {
      db.close();
    }
  }
}
