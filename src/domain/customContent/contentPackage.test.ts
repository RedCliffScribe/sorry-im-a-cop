// @vitest-environment node
import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCustomContentRevisionRef,
  customContentRevisionRefKey
} from './assetFoundation';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision,
  CustomContentProcessingTask,
  CustomContentProjectAsset,
  CustomEventGroupAsset,
  CustomSourceDocument
} from './assetTypes';
import { createCustomContentChecksum } from './checksum';
import {
  createCustomContentAuthorBackup,
  createCustomContentSharePackage,
  createCustomEventGroupJsonPackage,
  importCustomContentPackage,
  inspectCustomContentPackageImport,
  parseCustomContentPackageZip,
  parseCustomEventGroupJsonPackage,
  serializeCustomEventGroupJsonPackage
} from './contentPackage';
import { createCustomContentDependencyId } from './dependencyGraph';
import { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';

const timestamp = '2026-07-26T00:00:00.000Z';
const approvedLifecycle = {
  generationStatus: 'ready',
  reviewStatus: 'approved',
  availabilityStatus: 'enabled'
} as const;
let sequence = 0;
let sourceRepository: IndexedDbCustomContentRepository;

async function checksumRevision<T extends object>(
  value: T
): Promise<T & { checksum: string }> {
  return {
    ...value,
    checksum: await createCustomContentChecksum(value)
  };
}

async function seedProject({
  repository,
  sourceDocumentId
}: {
  repository: IndexedDbCustomContentRepository;
  sourceDocumentId?: string;
}) {
  const characterRevision = await checksumRevision({
    characterAssetId: 'character-1',
    revision: 1,
    displayName: '林若晴',
    aliases: [],
    gender: '女',
    profileSummary: '法证人员。',
    backgroundSummary: '熟悉证物流程。',
    corePersonality: ['冷静'],
    values: ['真相'],
    coreMotivations: ['保护证据'],
    majorRelationships: [],
    entryMode: 'follow_project' as const,
    adaptationPolicy: {
      temporalPolicy: 'preserve_life_stage' as const,
      lockedFields: [],
      adaptableFields: []
    },
    deployments: [
      {
        worldpackId: 'hk_1988',
        mode: 'native' as const,
        defaultEnabledForNewGame: true
      }
    ],
    sourceSpans: [],
    lifecycle: approvedLifecycle
  });
  const characterAsset: CustomCharacterAsset = {
    characterAssetId: 'character-1',
    latestRevision: 1,
    revisionCount: 1,
    global: false,
    projectIds: ['project-1'],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const characterRef = createCustomContentRevisionRef(characterRevision);

  const eventRevision = await checksumRevision({
    eventGroupId: 'event-1',
    projectId: 'project-1',
    revision: 1,
    title: '封条异常',
    summary: '封条编号与登记册不一致。',
    invariantCore: ['封条存在异常'],
    mutableSlots: ['原因'],
    forbiddenAdaptations: [],
    characterRefs: [characterRef],
    roleSlots: [
      {
        roleSlotId: 'witness',
        title: '证物见证人',
        summary: '说明封存流程。',
        bindingMode: 'fixed_character' as const,
        fixedCharacterRef: characterRef,
        requirements: []
      }
    ],
    stages: [
      {
        stageId: 'discover',
        title: '发现',
        summary: '核对时发现异常。',
        establishedSourceFacts: [],
        continuationSourceFacts: [],
        hardSourceConstraints: [],
        foreshadowingOptions: [],
        eventNodes: [
          {
            nodeId: 'check-register',
            title: '核对登记册',
            summary: '检查编号。',
            prerequisites: [],
            entryConditions: [],
            blockers: [],
            characterUsages: [
              {
                usageId: 'usage-witness',
                roleSlotId: 'witness',
                characterRef,
                usageSummary: '说明封存流程。',
                required: true
              }
            ],
            knowledgeBoundary: {
              knownBy: ['证物见证人'],
              hiddenFrom: [],
              readerOnly: false
            },
            possibleOutcomes: ['发现登记差异'],
            downstreamEffects: ['可以继续调查']
          }
        ],
        completionHints: ['完成核对'],
        nextStageHints: []
      }
    ],
    entryMode: 'asap' as const,
    reusePolicy: 'save_single_use' as const,
    inheritProjectDeployments: true,
    sourceSpans: [],
    lifecycle: approvedLifecycle
  });
  const eventAsset: CustomEventGroupAsset = {
    eventGroupId: 'event-1',
    projectId: 'project-1',
    latestRevision: 1,
    revisionCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const eventRef = createCustomContentRevisionRef(eventRevision);

  const projectRevision = await checksumRevision({
    projectId: 'project-1',
    revision: 1,
    title: '证物封条疑云',
    summary: '一个短事件项目。',
    conversionMode: 'structural_adaptation' as const,
    characterAssetIds: ['character-1'],
    eventGroupIds: ['event-1'],
    deployments: [
      {
        worldpackId: 'hk_1988',
        mode: 'native' as const,
        defaultEnabledForNewGame: true
      }
    ],
    sourceDocumentIds: sourceDocumentId ? [sourceDocumentId] : [],
    lifecycle: approvedLifecycle
  });
  const projectAsset: CustomContentProjectAsset = {
    projectId: 'project-1',
    latestRevision: 1,
    revisionCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const projectRef = createCustomContentRevisionRef(projectRevision);
  const dependency = (
    owner: typeof projectRef,
    target: typeof projectRef,
    kind: 'required' = 'required'
  ) => ({
    dependencyId: createCustomContentDependencyId(owner, target, kind),
    owner,
    target,
    kind
  });

  await repository.saveRevisionBundles([
    {
      assetKind: 'character',
      asset: characterAsset,
      revision: characterRevision
    },
    {
      assetKind: 'event_group',
      asset: eventAsset,
      revision: eventRevision,
      dependencies: [dependency(eventRef, characterRef)]
    },
    {
      assetKind: 'content_project',
      asset: projectAsset,
      revision: projectRevision,
      dependencies: [
        dependency(projectRef, characterRef),
        dependency(projectRef, eventRef)
      ]
    }
  ]);
  return {
    characterRevision,
    eventRevision,
    projectRevision,
    projectRef,
    eventRef
  };
}

beforeEach(async () => {
  sequence += 1;
  sourceRepository = new IndexedDbCustomContentRepository(
    `content-package-source-${sequence}`
  );
});

describe('custom content package', () => {
  it('exports and parses a dependency-complete share ZIP without source text', async () => {
    const seeded = await seedProject({ repository: sourceRepository });
    const bytes = await createCustomContentSharePackage({
      repository: sourceRepository,
      rootRevisionRef: seeded.projectRef,
      packageId: 'package-project',
      exportedAt: timestamp
    });
    const parsed = await parseCustomContentPackageZip(bytes);

    expect(parsed.manifest).toMatchObject({
      packageKind: 'project',
      packageId: 'package-project',
      includesSourceText: false
    });
    expect(parsed.bundles).toHaveLength(3);
    expect(parsed.sourceDocuments).toEqual([]);
    expect(
      parsed.bundles.every(
        (bundle) =>
          bundle.revision.lifecycle.reviewStatus === 'needs_review' &&
          bundle.revision.lifecycle.availabilityStatus === 'disabled'
      )
    ).toBe(true);
    expect(
      parsed.bundles.map((bundle) => bundle.sourceRevisionRef.assetId).sort()
    ).toEqual(['character-1', 'event-1', 'project-1']);
  });

  it('exports one event JSON with its lightweight project and fixed dependencies', async () => {
    const seeded = await seedProject({ repository: sourceRepository });
    const value = await createCustomEventGroupJsonPackage({
      repository: sourceRepository,
      rootRevisionRef: seeded.eventRef,
      packageId: 'package-event',
      exportedAt: timestamp
    });
    const parsed = parseCustomEventGroupJsonPackage(
      serializeCustomEventGroupJsonPackage(value)
    );

    expect(parsed.manifest.packageKind).toBe('event_group');
    expect(parsed.bundles.map((bundle) => bundle.assetKind).sort()).toEqual([
      'character',
      'content_project',
      'event_group'
    ]);
    const project = parsed.bundles.find(
      (bundle) => bundle.assetKind === 'content_project'
    );
    expect(project?.revision.eventGroupIds).toEqual(['event-1']);
  });

  it('imports atomically in quarantine and skips an identical second import', async () => {
    const seeded = await seedProject({ repository: sourceRepository });
    const parsed = await parseCustomContentPackageZip(
      await createCustomContentSharePackage({
        repository: sourceRepository,
        rootRevisionRef: seeded.projectRef,
        packageId: 'package-roundtrip',
        exportedAt: timestamp
      })
    );
    const target = new IndexedDbCustomContentRepository(
      `content-package-target-${sequence}`
    );
    const first = await importCustomContentPackage({
      repository: target,
      packageValue: parsed
    });
    const second = await importCustomContentPackage({
      repository: target,
      packageValue: parsed
    });

    expect(first).toMatchObject({
      importedRevisionCount: 3,
      skippedRevisionCount: 0,
      remapped: false
    });
    expect(second).toMatchObject({
      importedRevisionCount: 0,
      skippedRevisionCount: 3
    });
    expect(await target.getProjectRevision('project-1', 1)).toMatchObject({
      lifecycle: {
        generationStatus: 'ready',
        reviewStatus: 'needs_review',
        availabilityStatus: 'disabled'
      }
    });
    const event = await target.getEventGroupRevision('event-1', 1);
    const character = await target.getCharacterRevision('character-1', 1);
    expect(
      customContentRevisionRefKey(event!.characterRefs[0])
    ).toBe(
      customContentRevisionRefKey(createCustomContentRevisionRef(character!))
    );
  });

  it('requires explicit remapping for a same-ID different-lineage conflict', async () => {
    const seeded = await seedProject({ repository: sourceRepository });
    const parsed = await parseCustomContentPackageZip(
      await createCustomContentSharePackage({
        repository: sourceRepository,
        rootRevisionRef: seeded.projectRef,
        exportedAt: timestamp
      })
    );
    const target = new IndexedDbCustomContentRepository(
      `content-package-conflict-${sequence}`
    );
    const {
      checksum: _checksum,
      ...originalCharacterPayload
    } = seeded.characterRevision as CustomCharacterRevision;
    const conflictPayload = {
      ...originalCharacterPayload,
      displayName: '不同谱系人物'
    };
    const normalizedConflict = {
      ...conflictPayload,
      checksum: await createCustomContentChecksum(conflictPayload)
    } as CustomCharacterRevision;
    await target.saveRevisionBundle({
      assetKind: 'character',
      asset: {
        characterAssetId: 'character-1',
        latestRevision: 1,
        revisionCount: 1,
        global: false,
        projectIds: [],
        createdAt: timestamp,
        updatedAt: timestamp
      },
      revision: normalizedConflict
    });

    const inspection = await inspectCustomContentPackageImport({
      repository: target,
      packageValue: parsed
    });
    expect(inspection.requiresRemap).toBe(true);
    await expect(
      importCustomContentPackage({
        repository: target,
        packageValue: parsed
      })
    ).rejects.toThrow('不同谱系');
    const result = await importCustomContentPackage({
      repository: target,
      packageValue: parsed,
      conflictStrategy: 'remap'
    });
    expect(result.remapped).toBe(true);
    expect(result.assetIdMap['character-1']).not.toBe('character-1');
    expect(await target.listProjectAssets()).toHaveLength(1);
  });

  it('creates an opt-in author backup and restores source/task data', async () => {
    const sourceBytes = strToU8('第一章\n正文');
    const sourceDocumentId = 'source-1';
    const seeded = await seedProject({
      repository: sourceRepository,
      sourceDocumentId
    });
    const document: CustomSourceDocument = {
      sourceDocumentId,
      projectId: 'project-1',
      fileName: 'novel.txt',
      sourceFormat: 'txt',
      mediaType: 'text/plain',
      byteLength: sourceBytes.byteLength,
      characterCount: 6,
      checksum: await createCustomContentChecksum('placeholder'),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const digest = await crypto.subtle.digest(
      'SHA-256',
      Uint8Array.from(sourceBytes).buffer
    );
    document.checksum = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    await sourceRepository.saveSourceDocument(
      document,
      new Blob([Uint8Array.from(sourceBytes).buffer], { type: 'text/plain' })
    );
    const task: CustomContentProcessingTask = {
      taskId: 'task-1',
      taskKind: 'extract_local',
      projectId: 'project-1',
      sourceDocumentId,
      status: 'paused',
      concurrency: 1,
      maxRetries: 2,
      completedUnitCount: 0,
      totalUnitCount: 0,
      estimatedInputTokens: 100,
      consumedInputTokens: 0,
      consumedOutputTokens: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await sourceRepository.saveProcessingTask(task);

    const parsed = await parseCustomContentPackageZip(
      await createCustomContentAuthorBackup({
        repository: sourceRepository,
        projectRevisionRef: seeded.projectRef,
        includeSourceText: true,
        packageId: 'author-backup',
        exportedAt: timestamp
      })
    );
    expect(parsed.manifest).toMatchObject({
      packageKind: 'author_backup',
      includesSourceText: true
    });
    expect(parsed.sourceDocuments).toHaveLength(1);
    expect(parsed.processingTasks).toEqual([task]);

    const target = new IndexedDbCustomContentRepository(
      `content-package-author-${sequence}`
    );
    await importCustomContentPackage({
      repository: target,
      packageValue: parsed
    });
    const repeated = await importCustomContentPackage({
      repository: target,
      packageValue: parsed
    });
    expect(await (await target.loadSourceDocument(sourceDocumentId))!.blob.text())
      .toBe('第一章\n正文');
    expect(await target.loadProcessingTask('task-1')).toEqual(task);
    expect(repeated).toMatchObject({
      importedRevisionCount: 0,
      skippedRevisionCount: 3
    });
  });

  it('rejects traversal paths before trusting manifest data', async () => {
    const malicious = zipSync({
      '../outside.json': strToU8('{}')
    });
    await expect(parseCustomContentPackageZip(malicious)).rejects.toThrow(
      '不安全路径'
    );
  });
});
