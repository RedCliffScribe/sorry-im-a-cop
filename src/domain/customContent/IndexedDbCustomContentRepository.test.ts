// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCustomContentRevisionRef,
  promoteCustomCharacterAssetToGlobal
} from './assetFoundation';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision,
  CustomContentDependency,
  CustomContentProcessingTask,
  CustomContentProcessingUnit,
  CustomContentProjectAsset,
  CustomContentProjectRevision,
  CustomEventGroupAsset,
  CustomEventGroupRevision,
  CustomSourceDocument
} from './assetTypes';
import {
  CUSTOM_CONTENT_DB_VERSION,
  CustomContentDeletionProtectedError,
  customContentStoreNames,
  IndexedDbCustomContentRepository
} from './IndexedDbCustomContentRepository';
import { parseCustomSourceText } from './sourceTextPipeline';
import { createDefaultCustomCharacterAdaptationPolicy } from './worldAdaptation';

const databaseName = 'cop-v2-test-custom-content';
const timestamp = '2026-07-26T00:00:00.000Z';
const lifecycle = {
  generationStatus: 'ready',
  reviewStatus: 'approved',
  availabilityStatus: 'enabled'
} as const;

function projectFixture(): {
  asset: CustomContentProjectAsset;
  revision: CustomContentProjectRevision;
} {
  return {
    asset: {
      projectId: 'project_1',
      latestRevision: 1,
      revisionCount: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    revision: {
      projectId: 'project_1',
      revision: 1,
      checksum: 'project_checksum',
      title: '测试项目',
      summary: '项目摘要',
      conversionMode: 'structural_adaptation',
      characterAssetIds: ['character_1'],
      eventGroupIds: ['event_1'],
      deployments: [
        {
          worldpackId: 'hk_1988',
          mode: 'native',
          defaultEnabledForNewGame: true
        }
      ],
      sourceDocumentIds: [],
      lifecycle
    }
  };
}

function characterFixture(): {
  asset: CustomCharacterAsset;
  revision: CustomCharacterRevision;
} {
  return {
    asset: {
      characterAssetId: 'character_1',
      latestRevision: 1,
      revisionCount: 1,
      global: false,
      projectIds: ['project_1'],
      createdAt: timestamp,
      updatedAt: timestamp
    },
    revision: {
      characterAssetId: 'character_1',
      revision: 1,
      checksum: 'character_checksum',
      displayName: '测试人物',
      aliases: [],
      gender: '女',
      profileSummary: '人物摘要',
      backgroundSummary: '人物背景',
      corePersonality: ['冷静'],
      values: ['忠诚'],
      coreMotivations: ['保护家人'],
      majorRelationships: [],
      entryMode: 'follow_project',
      adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy(),
      deployments: [
        {
          worldpackId: 'hk_1988',
          mode: 'native',
          defaultEnabledForNewGame: true
        }
      ],
      sourceSpans: [],
      lifecycle
    }
  };
}

function eventFixture(): {
  asset: CustomEventGroupAsset;
  revision: CustomEventGroupRevision;
} {
  return {
    asset: {
      eventGroupId: 'event_1',
      projectId: 'project_1',
      latestRevision: 1,
      revisionCount: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    revision: {
      eventGroupId: 'event_1',
      projectId: 'project_1',
      revision: 1,
      checksum: 'event_checksum',
      title: '测试事件',
      summary: '事件摘要',
      invariantCore: ['证据曾被隐藏'],
      mutableSlots: ['接触方式'],
      forbiddenAdaptations: ['不得宣布玩家已经知情'],
      characterRefs: [],
      roleSlots: [],
      stages: [],
      entryMode: 'natural',
      reusePolicy: 'save_single_use',
      inheritProjectDeployments: true,
      sourceSpans: [],
      lifecycle
    }
  };
}

function taskFixture(): CustomContentProcessingTask {
  return {
    taskId: 'task_1',
    taskKind: 'extract_local',
    projectId: 'project_1',
    sourceDocumentId: 'source_1',
    status: 'queued',
    apiProfileId: 'profile_1',
    model: 'model_1',
    concurrency: 1,
    maxRetries: 2,
    completedUnitCount: 0,
    totalUnitCount: 2,
    estimatedInputTokens: 1200,
    consumedInputTokens: 0,
    consumedOutputTokens: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, CUSTOM_CONTENT_DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createLegacyVersionOneDatabase(
  name: string,
  projectAsset: CustomContentProjectAsset
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result
        .createObjectStore(customContentStoreNames.projectAssets, {
          keyPath: 'projectId'
        })
        .add(projectAsset);
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to create legacy database'));
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await deleteDatabase(databaseName);
});

describe('IndexedDbCustomContentRepository', () => {
  it('creates the versioned stores and indexes from an empty database', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    expect(await repository.listProjectAssets()).toEqual([]);

    const db = await openDatabase(databaseName);
    expect(Array.from(db.objectStoreNames)).toEqual(
      expect.arrayContaining(Object.values(customContentStoreNames))
    );
    const characterTransaction = db.transaction(
      customContentStoreNames.characterAssets,
      'readonly'
    );
    expect(Array.from(
      characterTransaction
        .objectStore(customContentStoreNames.characterAssets)
        .indexNames
    )).toContain('by-project-id');
    const taskTransaction = db.transaction(
      customContentStoreNames.processingTasks,
      'readonly'
    );
    expect(Array.from(
      taskTransaction
        .objectStore(customContentStoreNames.processingTasks)
        .indexNames
    )).toEqual(
      expect.arrayContaining([
        'by-status',
        'by-project-id',
        'by-source-document-id'
      ])
    );
    const sourceStructureTransaction = db.transaction(
      customContentStoreNames.sourceStructures,
      'readonly'
    );
    expect(Array.from(
      sourceStructureTransaction
        .objectStore(customContentStoreNames.sourceStructures)
        .indexNames
    )).toContain('by-source-document-id');
    const projectDraftTransaction = db.transaction(
      customContentStoreNames.projectDraftResults,
      'readonly'
    );
    expect(Array.from(
      projectDraftTransaction
        .objectStore(customContentStoreNames.projectDraftResults)
        .indexNames
    )).toEqual(
      expect.arrayContaining([
        'by-task-id',
        'by-unit-id',
        'by-source-document-id',
        'by-source-structure-id'
      ])
    );
    db.close();
  });

  it('migrates a version-one database without replacing existing assets', async () => {
    const project = projectFixture();
    await createLegacyVersionOneDatabase(databaseName, project.asset);

    const repository = new IndexedDbCustomContentRepository(databaseName);
    expect(await repository.listProjectAssets()).toEqual([project.asset]);

    const db = await openDatabase(databaseName);
    expect(db.version).toBe(CUSTOM_CONTENT_DB_VERSION);
    expect(
      db.objectStoreNames.contains(customContentStoreNames.sourceStructures)
    ).toBe(true);
    expect(
      db.objectStoreNames.contains(customContentStoreNames.carryLedgerEntries)
    ).toBe(true);
    expect(
      db.objectStoreNames.contains(customContentStoreNames.aggregationResults)
    ).toBe(true);
    expect(
      db.objectStoreNames.contains(customContentStoreNames.projectDraftResults)
    ).toBe(true);
    db.close();
  });

  it('stores project, project-character, and event revisions independently', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const project = projectFixture();
    const character = characterFixture();
    const event = eventFixture();
    const dependency: CustomContentDependency = {
      dependencyId: 'project_1_to_character_1',
      owner: createCustomContentRevisionRef(project.revision),
      target: createCustomContentRevisionRef(character.revision),
      kind: 'required'
    };

    await repository.saveRevisionBundle({
      assetKind: 'character',
      ...character
    });
    await repository.saveRevisionBundle({
      assetKind: 'event_group',
      ...event
    });
    await repository.saveRevisionBundle({
      assetKind: 'content_project',
      ...project,
      dependencies: [dependency]
    });

    expect(await repository.getProjectRevision('project_1', 1)).toEqual(
      project.revision
    );
    expect(await repository.getCharacterRevision('character_1', 1)).toEqual(
      character.revision
    );
    expect(await repository.getEventGroupRevision('event_1', 1)).toEqual(
      event.revision
    );
    expect((await repository.listProjectCharacterAssets('project_1')).map(
      (asset) => asset.characterAssetId
    )).toEqual(['character_1']);
    expect((await repository.listProjectEventGroupAssets('project_1')).map(
      (asset) => asset.eventGroupId
    )).toEqual(['event_1']);
    expect(await repository.listGlobalCharacterAssets()).toEqual([]);
    expect(await repository.listDependenciesForOwner(dependency.owner)).toEqual([
      dependency
    ]);
    expect(await repository.listDependenciesForTarget(dependency.target)).toEqual([
      dependency
    ]);
  });

  it('physically deletes unbound character history and its dependency indexes', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const project = projectFixture();
    const character = characterFixture();
    const dependency: CustomContentDependency = {
      dependencyId: 'project_1_to_character_1',
      owner: createCustomContentRevisionRef(project.revision),
      target: createCustomContentRevisionRef(character.revision),
      kind: 'required'
    };
    await repository.saveRevisionBundle({
      assetKind: 'character',
      ...character
    });
    await repository.saveRevisionBundle({
      assetKind: 'content_project',
      ...project,
      dependencies: [dependency]
    });

    await expect(
      repository.deleteCharacterAsset(character.asset.characterAssetId, [1])
    ).rejects.toBeInstanceOf(CustomContentDeletionProtectedError);
    expect(
      await repository.getCharacterRevision(character.asset.characterAssetId, 1)
    ).toEqual(character.revision);

    await expect(
      repository.deleteCharacterAsset(character.asset.characterAssetId)
    ).resolves.toBe(1);
    expect(
      await repository.getCharacterAsset(character.asset.characterAssetId)
    ).toBeNull();
    expect(
      await repository.getCharacterRevision(character.asset.characterAssetId, 1)
    ).toBeNull();
    expect(
      await repository.listDependenciesForOwner(dependency.owner)
    ).toEqual([]);
    expect(
      await repository.listDependenciesForTarget(dependency.target)
    ).toEqual([]);
    expect(await repository.getProjectAsset(project.asset.projectId)).toEqual(
      project.asset
    );
  });

  it('physically deletes unbound event history without deleting its project', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const project = projectFixture();
    const event = eventFixture();
    const dependency: CustomContentDependency = {
      dependencyId: 'project_1_to_event_1',
      owner: createCustomContentRevisionRef(project.revision),
      target: createCustomContentRevisionRef(event.revision),
      kind: 'required'
    };
    await repository.saveRevisionBundle({
      assetKind: 'event_group',
      ...event
    });
    await repository.saveRevisionBundle({
      assetKind: 'content_project',
      ...project,
      dependencies: [dependency]
    });

    await expect(
      repository.deleteEventGroupAsset(event.asset.eventGroupId, [1])
    ).rejects.toBeInstanceOf(CustomContentDeletionProtectedError);
    await expect(
      repository.deleteEventGroupAsset(event.asset.eventGroupId)
    ).resolves.toBe(1);
    expect(
      await repository.getEventGroupAsset(event.asset.eventGroupId)
    ).toBeNull();
    expect(
      await repository.getEventGroupRevision(event.asset.eventGroupId, 1)
    ).toBeNull();
    expect(
      await repository.listDependenciesForOwner(dependency.owner)
    ).toEqual([]);
    expect(await repository.getProjectAsset(project.asset.projectId)).toEqual(
      project.asset
    );
  });

  it('does not overwrite an existing immutable revision and rolls back metadata', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const character = characterFixture();
    await repository.saveRevisionBundle({
      assetKind: 'character',
      ...character
    });

    const changedRevision: CustomCharacterRevision = {
      ...character.revision,
      checksum: 'silently_changed',
      displayName: '被覆盖的人物名'
    };
    const changedAsset: CustomCharacterAsset = {
      ...character.asset,
      revisionCount: 99,
      updatedAt: '2026-07-26T01:00:00.000Z'
    };
    await expect(repository.saveRevisionBundle({
      assetKind: 'character',
      asset: changedAsset,
      revision: changedRevision
    })).rejects.toBeDefined();

    expect(await repository.getCharacterRevision('character_1', 1)).toEqual(
      character.revision
    );
    expect(await repository.getCharacterAsset('character_1')).toEqual(
      character.asset
    );
  });

  it('rolls back a mixed project, character, and event revision batch atomically', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const project = projectFixture();
    const character = characterFixture();
    const eventGroup = eventFixture();
    const invalidEventRevision = {
      ...eventGroup.revision,
      invalidValue: () => undefined
    } as CustomEventGroupRevision;

    await expect(
      repository.saveRevisionBundles([
        {
          assetKind: 'content_project',
          ...project
        },
        {
          assetKind: 'character',
          ...character
        },
        {
          assetKind: 'event_group',
          asset: eventGroup.asset,
          revision: invalidEventRevision
        }
      ])
    ).rejects.toBeDefined();

    expect(await repository.listProjectAssets()).toEqual([]);
    expect(await repository.listCharacterAssets()).toEqual([]);
    expect(await repository.listEventGroupAssets()).toEqual([]);
  });

  it('rolls back assets, source blobs, and processing progress as one import transaction', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const project = projectFixture();
    const blob = new Blob(['作者原文'], { type: 'text/plain' });
    const document: CustomSourceDocument = {
      sourceDocumentId: 'source_atomic',
      projectId: project.asset.projectId,
      fileName: 'source.txt',
      sourceFormat: 'txt',
      mediaType: 'text/plain',
      byteLength: blob.size,
      checksum: 'source_checksum',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const invalidTask = {
      ...taskFixture(),
      taskId: 'task_atomic',
      invalidValue: () => undefined
    } as CustomContentProcessingTask;

    await expect(
      repository.saveImportBatch({
        bundles: [
          {
            assetKind: 'content_project',
            ...project
          }
        ],
        sourceDocuments: [{ document, blob }],
        processingTasks: [invalidTask]
      })
    ).rejects.toBeDefined();

    expect(await repository.listProjectAssets()).toEqual([]);
    expect(await repository.loadSourceDocument(document.sourceDocumentId)).toBeNull();
    expect(await repository.listProcessingTasks()).toEqual([]);
  });

  it('promotes a project character through mutable catalog metadata only', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const character = characterFixture();
    await repository.saveRevisionBundle({
      assetKind: 'character',
      ...character
    });
    await repository.saveCharacterAsset(
      promoteCustomCharacterAssetToGlobal(
        character.asset,
        '2026-07-26T02:00:00.000Z'
      )
    );

    expect(await repository.getCharacterAsset('character_1')).toMatchObject({
      characterAssetId: 'character_1',
      latestRevision: 1,
      global: true,
      projectIds: ['project_1']
    });
    expect((await repository.listGlobalCharacterAssets()).map(
      (asset) => asset.characterAssetId
    )).toEqual(['character_1']);
    expect(await repository.getCharacterRevision('character_1', 1)).toEqual(
      character.revision
    );
  });

  it('stores one source Blob separately from its metadata', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const blob = new Blob(['第一章\n正文'], { type: 'text/plain' });
    const document: CustomSourceDocument = {
      sourceDocumentId: 'source_1',
      projectId: 'project_1',
      fileName: 'novel.txt',
      sourceFormat: 'txt',
      mediaType: 'text/plain',
      byteLength: blob.size,
      characterCount: 6,
      checksum: 'source_checksum',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await repository.saveSourceDocument(document, blob);
    const loaded = await repository.loadSourceDocument('source_1');

    expect(loaded?.document).toEqual(document);
    expect(loaded?.blob).toBeInstanceOf(Blob);
    expect(await loaded!.blob.text()).toBe('第一章\n正文');
    await expect(repository.saveSourceDocument(document, blob)).rejects.toBeDefined();
  });

  it('persists validated source structures separately from the source Blob', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const blob = new Blob(['# 第一章\r\n正文。\r\n\r\n# 第二章\r\n正文。'], {
      type: 'text/markdown'
    });
    const first = await parseCustomSourceText({
      sourceDocumentId: 'source_structure_1',
      sourceFormat: 'markdown',
      text: await blob.text(),
      timestamp
    });
    const second = await parseCustomSourceText({
      sourceDocumentId: 'source_structure_1',
      sourceFormat: 'markdown',
      text: await blob.text(),
      chunking: {
        targetTokenCount: 8,
        maxTokenCount: 12,
        overlapTokenCount: 2
      },
      timestamp: '2026-07-26T01:00:00.000Z'
    });
    const document: CustomSourceDocument = {
      sourceDocumentId: 'source_structure_1',
      fileName: 'chapters.md',
      sourceFormat: 'markdown',
      mediaType: 'text/markdown',
      byteLength: blob.size,
      characterCount: first.structure.characterCount,
      checksum: 'source_checksum',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await repository.saveSourceDocument(document, blob);
    await repository.saveSourceStructure(first.structure);
    await repository.saveSourceStructure(second.structure);

    expect(
      await repository.loadSourceStructure(
        first.structure.sourceStructureId
      )
    ).toEqual(first.structure);
    expect(
      (await repository.listSourceStructures(document.sourceDocumentId)).map(
        (structure) => structure.sourceStructureId
      )
    ).toEqual([
      first.structure.sourceStructureId,
      second.structure.sourceStructureId
    ]);
    expect((await repository.loadSourceDocument(document.sourceDocumentId))?.blob)
      .toBeInstanceOf(Blob);
  });

  it('rejects orphaned or character-count-mismatched source structures', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const orphan = await parseCustomSourceText({
      sourceDocumentId: 'missing_source',
      sourceFormat: 'txt',
      text: '第一章\n正文',
      timestamp
    });
    await expect(
      repository.saveSourceStructure(orphan.structure)
    ).rejects.toThrow('existing source document');

    const blob = new Blob(['第一章\n正文']);
    await repository.saveSourceDocument(
      {
        sourceDocumentId: 'mismatched_source',
        fileName: 'mismatch.txt',
        sourceFormat: 'txt',
        mediaType: 'text/plain',
        byteLength: blob.size,
        characterCount: 999,
        checksum: 'source_checksum',
        createdAt: timestamp,
        updatedAt: timestamp
      },
      blob
    );
    const mismatched = await parseCustomSourceText({
      sourceDocumentId: 'mismatched_source',
      sourceFormat: 'txt',
      text: await blob.text(),
      timestamp
    });
    await expect(
      repository.saveSourceStructure(mismatched.structure)
    ).rejects.toThrow('characterCount');
  });

  it('persists resumable processing tasks and ordered units', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const task = taskFixture();
    const units: CustomContentProcessingUnit[] = [
      {
        unitId: 'unit_2',
        taskId: task.taskId,
        sequence: 2,
        status: 'queued',
        retryCount: 0,
        updatedAt: timestamp
      },
      {
        unitId: 'unit_1',
        taskId: task.taskId,
        sequence: 1,
        status: 'completed',
        retryCount: 0,
        resultRef: 'result_1',
        updatedAt: timestamp
      }
    ];

    await repository.saveProcessingTask(task);
    await repository.saveProcessingUnits(units);
    await repository.saveProcessingTask({
      ...task,
      status: 'paused',
      completedUnitCount: 1,
      cursor: 'unit_2',
      updatedAt: '2026-07-26T01:00:00.000Z'
    });

    expect(await repository.loadProcessingTask(task.taskId)).toMatchObject({
      status: 'paused',
      completedUnitCount: 1,
      cursor: 'unit_2'
    });
    expect((await repository.listProcessingTasks('paused')).map(
      (item) => item.taskId
    )).toEqual(['task_1']);
    expect((await repository.listProcessingUnits(task.taskId)).map(
      (unit) => unit.unitId
    )).toEqual(['unit_1', 'unit_2']);
  });

  it('rolls back a processing-unit batch when one value cannot be cloned', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const valid: CustomContentProcessingUnit = {
      unitId: 'unit_valid',
      taskId: 'task_1',
      sequence: 1,
      status: 'queued',
      retryCount: 0,
      updatedAt: timestamp
    };
    const invalid = {
      ...valid,
      unitId: 'unit_invalid',
      sequence: 2,
      invalidValue: () => undefined
    };

    await expect(repository.saveProcessingUnits([
      valid,
      invalid as CustomContentProcessingUnit
    ])).rejects.toBeDefined();
    expect(await repository.listProcessingUnits('task_1')).toEqual([]);
  });

  it('clears every custom-content store without touching other databases', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const project = projectFixture();
    await repository.saveRevisionBundle({
      assetKind: 'content_project',
      ...project
    });
    await repository.saveProcessingTask(taskFixture());
    const blob = new Blob(['第一章\n正文']);
    const parsed = await parseCustomSourceText({
      sourceDocumentId: 'source_to_clear',
      sourceFormat: 'txt',
      text: await blob.text(),
      timestamp
    });
    await repository.saveSourceDocument(
      {
        sourceDocumentId: 'source_to_clear',
        fileName: 'clear.txt',
        sourceFormat: 'txt',
        mediaType: 'text/plain',
        byteLength: blob.size,
        characterCount: parsed.structure.characterCount,
        checksum: 'source_checksum',
        createdAt: timestamp,
        updatedAt: timestamp
      },
      blob
    );
    await repository.saveSourceStructure(parsed.structure);

    await repository.clearAll();

    expect(await repository.listProjectAssets()).toEqual([]);
    expect(await repository.getProjectRevision('project_1', 1)).toBeNull();
    expect(await repository.listProcessingTasks()).toEqual([]);
    expect(await repository.listSourceStructures('source_to_clear')).toEqual(
      []
    );
  });
});
