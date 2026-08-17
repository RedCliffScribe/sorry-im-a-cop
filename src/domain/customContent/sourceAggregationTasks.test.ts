// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NarratorClient,
  NarratorDetailedCompletion,
  StructuredNarratorRequest
} from '../narrator/NarratorClient';
import type {
  CustomContentProjectRevision,
  CustomSourceDocument,
  CustomSourceStructure
} from './assetTypes';
import { createCustomContentRevisionRef } from './assetFoundation';
import {
  createCustomContentBlobChecksum,
  createCustomContentChecksum
} from './checksum';
import {
  createCustomContentAuthorBackup,
  importCustomContentPackage,
  parseCustomContentPackageZip
} from './contentPackage';
import { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import {
  createCustomSourceAggregationTask,
  runCustomSourceAggregationTask
} from './sourceAggregationTasks';
import {
  createCustomLocalExtractionTask,
  runCustomLocalExtractionTask
} from './sourceExtractionTasks';
import {
  createCustomSourceChunkTask,
  createCustomSourceParseTask,
  runCustomSourceProcessingTask
} from './sourceProcessingTasks';
import {
  cancelCustomSourceProjectBuildTask,
  createCustomSourceProjectBuildTask,
  pauseCustomSourceProjectBuildTask,
  reauthorizeCustomSourceProjectBuildTask,
  resumeCustomSourceProjectBuildTask,
  retryCustomSourceProjectBuildTask,
  runCustomSourceProjectBuildTask
} from './sourceProjectBuildTasks';

const databaseName = 'cop-v2-test-source-aggregation';
const fixedTimestamp = '2026-07-26T15:00:00.000Z';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function completion(
  value: unknown,
  promptTokens = 120,
  completionTokens = 60
): NarratorDetailedCompletion {
  return {
    value,
    attempt: {
      attemptId: crypto.randomUUID(),
      purpose: 'auxiliary',
      stream: false,
      finishReason: 'stop',
      rawText: JSON.stringify(value),
      parseStatus: 'success',
      startedAt: fixedTimestamp,
      finishedAt: fixedTimestamp,
      usage: { promptTokens, completionTokens }
    }
  };
}

function narrator(
  implementation: (
    request: StructuredNarratorRequest
  ) => Promise<NarratorDetailedCompletion>
): NarratorClient & {
  completeDetailed: ReturnType<typeof vi.fn>;
} {
  const completeDetailed = vi.fn(implementation);
  return {
    complete: vi.fn(),
    completeDetailed
  };
}

function extractionPayload(label: string) {
  return {
    localSummary: `${label}局部摘要`,
    establishedFacts: [`${label}事实`],
    characterObservations: [
      {
        displayName: '梁静仪',
        aliases: ['阿仪'],
        summary: `${label}人物观察`
      }
    ],
    eventObservations: [{ title: `${label}事件`, summary: `${label}事件观察` }],
    informationVisibility: [
      {
        holder: '调查员',
        information: `${label}线索`,
        summary: `${label}可见性`
      }
    ],
    unresolvedContradictions: [`${label}矛盾`],
    continuation: {
      summary: `${label}承接`,
      openThreads: [`${label}未解线索`]
    }
  };
}

function aggregationPayload(label: string) {
  return {
    summary: `${label}聚合摘要`,
    establishedFacts: [`${label}聚合事实`],
    characterMergeSuggestions: [] as Array<{
      displayName: string;
      aliases: string[];
      sourceObservationIds: string[];
      rationale: string;
    }>,
    eventThreads: [`${label}事件线`],
    informationVisibility: [
      {
        holder: '调查员',
        information: `${label}聚合线索`,
        summary: `${label}聚合可见性`
      }
    ],
    unresolvedContradictions: [`${label}待核矛盾`],
    contentGaps: [`${label}内容缺口`],
    continuation: {
      summary: `${label}下一层承接`,
      openThreads: [`${label}开放线索`]
    }
  };
}

function projectBuildPayload(
  storyArcId: string,
  sourceObservationId: string,
  conversionMode:
    | 'structural_adaptation'
    | 'character_retention'
    | 'source_direction_priority' = 'structural_adaptation'
) {
  return {
    draft: {
      project: {
        title: '仓库暗线',
        summary: '从雨夜货车推进到仓库收据矛盾。',
        conversionMode
      },
      characterCandidates: [
        {
          candidateKey: 'liang-jingyi',
          character: {
            displayName: '梁静仪',
            aliases: ['阿仪'],
            gender: 'female',
            profileSummary: '负责核对证物与收据的调查员。',
            backgroundSummary: '熟悉仓库流程。',
            corePersonality: ['谨慎'],
            values: ['证据'],
            coreMotivations: ['查清矛盾'],
            majorRelationships: [],
            entryMode: 'natural',
            temporalPolicy: 'preserve_life_stage',
            lockedFields: ['corePersonality'],
            adaptableFields: ['backgroundSummary']
          }
        }
      ],
      eventGroups: [
        {
          eventGroupKey: 'warehouse-truck',
          title: '雨夜货车',
          summary: '调查匿名货车与仓库收据的关联。',
          invariantCore: ['货车线索与收据矛盾来自同一调查链。'],
          mutableSlots: ['调查地点'],
          forbiddenAdaptations: ['不得提前确认司机身份。'],
          characterCandidateKeys: ['liang-jingyi'],
          roleSlots: [],
          stages: [
            {
              stageKey: 'trace-receipt',
              title: '核对收据',
              summary: '对照夜班记录。',
              establishedSourceFacts: [
                {
                  factKey: 'receipt-exists',
                  summary: '原作中存在仓库收据。'
                }
              ],
              continuationSourceFacts: [],
              hardSourceConstraints: [],
              foreshadowingOptions: [],
              eventNodes: [
                {
                  nodeKey: 'compare-records',
                  title: '比对记录',
                  summary: '发现记录之间不一致。',
                  prerequisites: [],
                  entryConditions: [],
                  blockers: [],
                  characterUsages: [
                    {
                      usageKey: 'investigator',
                      characterCandidateKey: 'liang-jingyi',
                      usageSummary: '负责比对。',
                      required: true
                    }
                  ],
                  knowledgeBoundary: {
                    knownBy: ['调查员'],
                    hiddenFrom: ['夜班主管'],
                    readerOnly: false
                  },
                  possibleOutcomes: ['确认矛盾存在'],
                  downstreamEffects: ['继续追查司机']
                }
              ],
              completionHints: ['记录完成比对'],
              nextStageHints: []
            }
          ],
          entryMode: 'asap',
          reusePolicy: 'save_single_use',
          inheritProjectDeployments: true
        }
      ]
    },
    eventGroupSources: [
      {
        eventGroupKey: 'warehouse-truck',
        storyArcIds: [storyArcId]
      }
    ],
    characterCandidateSources: [
      {
        candidateKey: 'liang-jingyi',
        sourceObservationIds: [sourceObservationId],
        characterMergeSuggestionIds: []
      }
    ],
    contentGaps: ['司机身份仍未知。'],
    consistencyIssues: []
  };
}

async function completedExtractionFixture(
  repository: IndexedDbCustomContentRepository
): Promise<{
  document: CustomSourceDocument;
  structure: CustomSourceStructure;
  extractionTaskId: string;
}> {
  const text = [
    '# 第一章',
    '',
    '雨夜的值班电话留下一个没有牌照的货车线索。',
    '',
    '# 第二章',
    '',
    '调查员核对仓库收据，并发现夜班主管的说法互相矛盾。'
  ].join('\n');
  const blob = new Blob([text], { type: 'text/markdown' });
  const document: CustomSourceDocument = {
    sourceDocumentId: 'source_aggregate_1',
    fileName: 'aggregate.md',
    sourceFormat: 'markdown',
    mediaType: 'text/markdown',
    byteLength: blob.size,
    checksum: await createCustomContentBlobChecksum(blob),
    createdAt: fixedTimestamp,
    updatedAt: fixedTimestamp
  };
  await repository.saveSourceDocument(document, blob);
  const parsed = await runCustomSourceProcessingTask(
    repository,
    (
      await createCustomSourceParseTask(
        repository,
        document.sourceDocumentId,
        { timestamp: fixedTimestamp }
      )
    ).task.taskId,
    { automaticRetry: false, now: () => fixedTimestamp }
  );
  const chunked = await runCustomSourceProcessingTask(
    repository,
    (
      await createCustomSourceChunkTask(repository, parsed.task.taskId, {
        timestamp: fixedTimestamp
      })
    ).task.taskId,
    { automaticRetry: false, now: () => fixedTimestamp }
  );
  const structure = await repository.loadSourceStructure(
    chunked.unit.resultRef!
  );
  if (!structure) throw new Error('fixture structure missing');
  const extraction = await createCustomLocalExtractionTask(repository, {
    sourceStructureId: structure.sourceStructureId,
    apiProfileId: 'profile_aux',
    model: 'model-balanced',
    authorization: { authorizedTotalTokens: 100_000 },
    timestamp: fixedTimestamp
  });
  let sequence = 0;
  const extracted = await runCustomLocalExtractionTask(
    repository,
    extraction.task.taskId,
    narrator(async () => {
      sequence += 1;
      return completion(extractionPayload(`第${sequence}块`));
    }),
    { automaticRetry: false, now: () => fixedTimestamp }
  );
  expect(extracted.task.status).toBe('completed');
  return {
    document,
    structure,
    extractionTaskId: extracted.task.taskId
  };
}

beforeEach(async () => {
  await deleteDatabase(databaseName);
});

describe('source aggregation tasks', () => {
  it('aggregates chunks into chapters and chapters into bounded stages without raw text', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const { structure, extractionTaskId } =
      await completedExtractionFixture(repository);

    const chapterTask = await createCustomSourceAggregationTask(repository, {
      aggregationLevel: 'chapter',
      inputTaskId: extractionTaskId,
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      authorization: {
        authorizedTotalTokens: 100_000,
        pricing: {
          currency: 'USD',
          inputPerMillionTokens: 2,
          outputPerMillionTokens: 8
        },
        costLimit: 10
      },
      timestamp: fixedTimestamp
    });
    expect(chapterTask.units).toHaveLength(structure.chapters.length);
    expect(chapterTask.units.map((unit) => unit.inputRefs?.length)).toEqual(
      structure.chapters.map(
        (chapter) =>
          structure.chunks.filter(
            (chunk) => chunk.chapterId === chapter.chapterId
          ).length
      )
    );

    let chapterIndex = 0;
    const chapterClient = narrator(async (request) => {
      const runtime = request.messages[1].content;
      expect(runtime).toContain('"lowerResults"');
      expect(runtime).not.toContain('"sourceText"');
      chapterIndex += 1;
      return completion(aggregationPayload(`第${chapterIndex}章`));
    });
    const completedChapters = await runCustomSourceAggregationTask(
      repository,
      chapterTask.task.taskId,
      chapterClient,
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    expect(completedChapters.task.status).toBe('completed');
    expect(completedChapters.results).toHaveLength(structure.chapters.length);
    expect(
      completedChapters.results.every(
        (result) =>
          result.aggregationLevel === 'chapter' &&
          result.reviewStatus === 'needs_review' &&
          result.lowerResultRefs.length > 0
      )
    ).toBe(true);

    const stageTask = await createCustomSourceAggregationTask(repository, {
      aggregationLevel: 'stage',
      inputTaskId: completedChapters.task.taskId,
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      maxLowerResultsPerUnit: 2,
      authorization: { authorizedTotalTokens: 100_000 },
      timestamp: fixedTimestamp
    });
    expect(stageTask.units).toHaveLength(1);
    expect(stageTask.units[0].inputRefs).toEqual(
      completedChapters.results.map((result) => result.aggregationResultId)
    );
    const stageClient = narrator(async (request) => {
      expect(request.messages[1].content).not.toContain('"localSummary"');
      expect(request.messages[1].content).not.toContain('"sourceText"');
      return completion(aggregationPayload('第一阶段'));
    });
    const completedStage = await runCustomSourceAggregationTask(
      repository,
      stageTask.task.taskId,
      stageClient,
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    expect(completedStage.task.status).toBe('completed');
    expect(completedStage.results[0]).toMatchObject({
      aggregationLevel: 'stage',
      lowerResultRefs: stageTask.units[0].inputRefs,
      reviewStatus: 'needs_review',
      contentGaps: [expect.objectContaining({ summary: '第一阶段内容缺口' })]
    });

    const stageResult = completedStage.results[0]!;
    const arcTask = await createCustomSourceAggregationTask(repository, {
      aggregationLevel: 'arc',
      inputTaskId: completedStage.task.taskId,
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      maxLowerResultsPerUnit: 8,
      authorization: { authorizedTotalTokens: 100_000 },
      timestamp: fixedTimestamp
    });
    expect(arcTask.task).toMatchObject({
      taskKind: 'aggregate_arc',
      aiProcessing: {
        aggregationLevel: 'arc',
        promptVersion: 'phase9-story-arc-aggregation-v1'
      }
    });
    expect(arcTask.units[0].inputRefs).toEqual([
      stageResult.aggregationResultId
    ]);
    const arcClient = narrator(async (request) => {
      expect(request.messages[0].content).toContain('故事弧');
      expect(request.messages[1].content).not.toContain('"sourceText"');
      return completion({
        ...aggregationPayload('故事弧层'),
        storyArcs: [
          {
            title: '雨夜货车与仓库收据',
            summary: '匿名货车线索与仓库收据矛盾构成同一调查弧。',
            sourceResultRefs: [stageResult.aggregationResultId],
            sourceObservationIds: [
              stageResult.eventThreads[0]!.observationId
            ],
            characterMergeSuggestionIds: [],
            invariantCore: ['货车线索与收据矛盾必须来自同一调查链。'],
            mutableSlots: ['调查员身份可按世界包适配。'],
            forbiddenAdaptations: ['不得把未核实矛盾写成已定罪事实。'],
            contentGaps: ['货车实际司机仍未明确。'],
            continuationHints: ['下一步核对夜班主管与司机关系。']
          }
        ]
      });
    });
    const completedArcs = await runCustomSourceAggregationTask(
      repository,
      arcTask.task.taskId,
      arcClient,
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    expect(completedArcs.task.status).toBe('completed');
    expect(completedArcs.results[0]).toMatchObject({
      aggregationLevel: 'arc',
      lowerResultRefs: [stageResult.aggregationResultId],
      storyArcs: [
        expect.objectContaining({
          title: '雨夜货车与仓库收据',
          sourceResultRefs: [stageResult.aggregationResultId]
        })
      ],
      reviewStatus: 'needs_review'
    });
    expect(completedArcs.results[0]!.storyArcs?.[0]?.storyArcId).toMatch(
      /-arc-1$/
    );
    expect(
      await repository.listAggregationResultsForTask(arcTask.task.taskId)
    ).toEqual(completedArcs.results);

    const arcResult = completedArcs.results[0]!;
    const storyArc = arcResult.storyArcs![0]!;
    const buildTask = await createCustomSourceProjectBuildTask(repository, {
      inputTaskId: completedArcs.task.taskId,
      conversionMode: 'structural_adaptation',
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      authorization: { authorizedTotalTokens: 100_000 },
      timestamp: fixedTimestamp
    });
    expect(buildTask.task).toMatchObject({
      taskKind: 'build_project',
      status: 'queued',
      concurrency: 1,
      aiProcessing: {
        conversionMode: 'structural_adaptation',
        promptVersion: 'phase9-project-build-v1'
      }
    });
    expect(buildTask.unit.inputRefs).toEqual([
      arcResult.aggregationResultId
    ]);
    const buildClient = narrator(async (request) => {
      expect(request.messages[0].content).toContain('source_only');
      expect(request.messages[1].content).toContain('"storyArcResults"');
      expect(request.messages[1].content).not.toContain('"sourceText"');
      expect(request.messages[1].content).not.toContain('"localSummary"');
      return completion(
        projectBuildPayload(
          storyArc.storyArcId,
          storyArc.sourceObservationIds[0]!
        ),
        650,
        980
      );
    });
    const completedProject = await runCustomSourceProjectBuildTask(
      repository,
      buildTask.task.taskId,
      buildClient,
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    expect(completedProject.task).toMatchObject({
      status: 'completed',
      completedUnitCount: 1,
      consumedInputTokens: 650,
      consumedOutputTokens: 980
    });
    expect(completedProject.result).toMatchObject({
      reviewStatus: 'needs_review',
      conversionMode: 'structural_adaptation',
      storyArcIds: [storyArc.storyArcId],
      eventGroupSources: [
        {
          eventGroupKey: 'warehouse-truck',
          storyArcIds: [storyArc.storyArcId]
        }
      ]
    });
    expect(
      await repository.loadProjectDraftResultForTask(buildTask.task.taskId)
    ).toEqual(completedProject.result);

    const invalidBuildTask = await createCustomSourceProjectBuildTask(
      repository,
      {
        inputTaskId: completedArcs.task.taskId,
        conversionMode: 'character_retention',
        apiProfileId: 'profile_aux',
        model: 'model-balanced',
        authorization: { authorizedTotalTokens: 100_000 },
        timestamp: fixedTimestamp
      }
    );
    const invalidPayload = projectBuildPayload(
      storyArc.storyArcId,
      'outside-observation',
      'character_retention'
    );
    const failedProject = await runCustomSourceProjectBuildTask(
      repository,
      invalidBuildTask.task.taskId,
      narrator(async () => completion(invalidPayload, 333, 222)),
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    expect(failedProject.task).toMatchObject({
      status: 'failed',
      consumedInputTokens: 333,
      consumedOutputTokens: 222
    });
    expect(failedProject.result).toBeNull();
    const retriedProject = await retryCustomSourceProjectBuildTask(
      repository,
      invalidBuildTask.task.taskId,
      fixedTimestamp
    );
    expect(retriedProject).toMatchObject({
      task: { status: 'queued' },
      unit: { status: 'queued', retryCount: 1 }
    });
    const pausedProject = await pauseCustomSourceProjectBuildTask(
      repository,
      invalidBuildTask.task.taskId,
      fixedTimestamp
    );
    expect(pausedProject).toMatchObject({
      task: { status: 'paused', pauseReason: 'user' },
      unit: { status: 'paused' }
    });
    const resumedProject = await resumeCustomSourceProjectBuildTask(
      repository,
      invalidBuildTask.task.taskId,
      fixedTimestamp
    );
    expect(resumedProject).toMatchObject({
      task: { status: 'queued' },
      unit: { status: 'queued' }
    });
    const reauthorizedProject =
      await reauthorizeCustomSourceProjectBuildTask(
        repository,
        invalidBuildTask.task.taskId,
        {
          apiProfileId: 'profile_aux_reauthorized',
          model: 'model-high-context',
          authorization: { authorizedTotalTokens: 120_000 },
          timestamp: fixedTimestamp
        }
      );
    expect(reauthorizedProject.task).toMatchObject({
      status: 'queued',
      apiProfileId: 'profile_aux_reauthorized',
      model: 'model-high-context',
      aiProcessing: { authorizedTotalTokens: 120_000 }
    });
    const cancelledProject = await cancelCustomSourceProjectBuildTask(
      repository,
      invalidBuildTask.task.taskId,
      fixedTimestamp
    );
    expect(cancelledProject).toMatchObject({
      task: { status: 'cancelled' },
      unit: { status: 'cancelled' }
    });

    const interruptibleTask = await createCustomSourceProjectBuildTask(
      repository,
      {
        inputTaskId: completedArcs.task.taskId,
        conversionMode: 'source_direction_priority',
        apiProfileId: 'profile_aux',
        model: 'model-balanced',
        authorization: { authorizedTotalTokens: 100_000 },
        timestamp: fixedTimestamp
      }
    );
    await reauthorizeCustomSourceProjectBuildTask(
      repository,
      interruptibleTask.task.taskId,
      {
        apiProfileId: 'profile_aux',
        model: 'model-balanced',
        authorization: { authorizedTotalTokens: 1 },
        timestamp: fixedTimestamp
      }
    );
    const neverCalledClient = narrator(async () => {
      throw new Error('authorization pause should happen before provider call');
    });
    const tokenPaused = await runCustomSourceProjectBuildTask(
      repository,
      interruptibleTask.task.taskId,
      neverCalledClient,
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    expect(tokenPaused.task).toMatchObject({
      status: 'paused',
      pauseReason: 'token_limit'
    });
    expect(neverCalledClient.completeDetailed).not.toHaveBeenCalled();

    await reauthorizeCustomSourceProjectBuildTask(
      repository,
      interruptibleTask.task.taskId,
      {
        apiProfileId: 'profile_aux',
        model: 'model-balanced',
        authorization: { authorizedTotalTokens: 100_000 },
        timestamp: fixedTimestamp
      }
    );
    const aborted = new AbortController();
    aborted.abort();
    const pageInterrupted = await runCustomSourceProjectBuildTask(
      repository,
      interruptibleTask.task.taskId,
      neverCalledClient,
      {
        automaticRetry: false,
        now: () => fixedTimestamp,
        signal: aborted.signal
      }
    );
    expect(pageInterrupted).toMatchObject({
      task: { status: 'paused', pauseReason: 'page_interrupted' },
      unit: { status: 'paused' }
    });
    expect(neverCalledClient.completeDetailed).not.toHaveBeenCalled();
  });

  it('rejects a merge suggestion that cites an observation outside the unit and records usage', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const { extractionTaskId } =
      await completedExtractionFixture(repository);
    const chapterTask = await createCustomSourceAggregationTask(repository, {
      aggregationLevel: 'chapter',
      inputTaskId: extractionTaskId,
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      authorization: {
        authorizedTotalTokens: 100_000,
        pricing: {
          currency: 'USD',
          inputPerMillionTokens: 2,
          outputPerMillionTokens: 8
        },
        costLimit: 10
      },
      timestamp: fixedTimestamp
    });
    const invalid = aggregationPayload('非法引用');
    invalid.characterMergeSuggestions = [
      {
        displayName: '梁静仪',
        aliases: ['阿仪'],
        sourceObservationIds: ['outside-observation'],
        rationale: '仅凭同名不能自动合并'
      }
    ];

    const failed = await runCustomSourceAggregationTask(
      repository,
      chapterTask.task.taskId,
      narrator(async () => completion(invalid, 321, 123)),
      { automaticRetry: false, now: () => fixedTimestamp }
    );

    expect(failed.task).toMatchObject({
      status: 'failed',
      consumedInputTokens: 321,
      consumedOutputTokens: 123
    });
    expect(failed.task.consumedCost).toBeGreaterThan(0);
    expect(failed.results).toHaveLength(0);
  });

  it('rejects a story arc that cites a stage result outside the authorized unit', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const { extractionTaskId } =
      await completedExtractionFixture(repository);
    const chapterTask = await createCustomSourceAggregationTask(repository, {
      aggregationLevel: 'chapter',
      inputTaskId: extractionTaskId,
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      authorization: { authorizedTotalTokens: 100_000 },
      timestamp: fixedTimestamp
    });
    const chapters = await runCustomSourceAggregationTask(
      repository,
      chapterTask.task.taskId,
      narrator(async () => completion(aggregationPayload('章节'))),
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    const stageTask = await createCustomSourceAggregationTask(repository, {
      aggregationLevel: 'stage',
      inputTaskId: chapters.task.taskId,
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      authorization: { authorizedTotalTokens: 100_000 },
      timestamp: fixedTimestamp
    });
    const stages = await runCustomSourceAggregationTask(
      repository,
      stageTask.task.taskId,
      narrator(async () => completion(aggregationPayload('阶段'))),
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    const arcTask = await createCustomSourceAggregationTask(repository, {
      aggregationLevel: 'arc',
      inputTaskId: stages.task.taskId,
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      authorization: { authorizedTotalTokens: 100_000 },
      timestamp: fixedTimestamp
    });
    const invalid = {
      ...aggregationPayload('非法故事弧'),
      storyArcs: [
        {
          title: '越界故事弧',
          summary: '引用了未授权的阶段结果。',
          sourceResultRefs: ['outside-stage-result'],
          sourceObservationIds: [],
          characterMergeSuggestionIds: [],
          invariantCore: ['必须保留越界引用。'],
          mutableSlots: [],
          forbiddenAdaptations: [],
          contentGaps: [],
          continuationHints: []
        }
      ]
    };

    const failed = await runCustomSourceAggregationTask(
      repository,
      arcTask.task.taskId,
      narrator(async () => completion(invalid, 432, 210)),
      { automaticRetry: false, now: () => fixedTimestamp }
    );

    expect(failed.task).toMatchObject({
      status: 'failed',
      consumedInputTokens: 432,
      consumedOutputTokens: 210
    });
    expect(failed.results).toHaveLength(0);
  });

  it('round-trips structure, batched progress, extraction, carry, and aggregation in an author backup', async () => {
    const repository = new IndexedDbCustomContentRepository(databaseName);
    const { document, structure, extractionTaskId } =
      await completedExtractionFixture(repository);
    const chapterTask = await createCustomSourceAggregationTask(repository, {
      aggregationLevel: 'chapter',
      inputTaskId: extractionTaskId,
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      authorization: { authorizedTotalTokens: 100_000 },
      timestamp: fixedTimestamp
    });
    const completedChapters = await runCustomSourceAggregationTask(
      repository,
      chapterTask.task.taskId,
      narrator(async () => completion(aggregationPayload('章节'))),
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    const stageTask = await createCustomSourceAggregationTask(repository, {
      aggregationLevel: 'stage',
      inputTaskId: completedChapters.task.taskId,
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      authorization: { authorizedTotalTokens: 100_000 },
      timestamp: fixedTimestamp
    });
    const completedStages = await runCustomSourceAggregationTask(
      repository,
      stageTask.task.taskId,
      narrator(async () => completion(aggregationPayload('阶段'))),
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    const stageResult = completedStages.results[0]!;
    const arcTask = await createCustomSourceAggregationTask(repository, {
      aggregationLevel: 'arc',
      inputTaskId: completedStages.task.taskId,
      apiProfileId: 'profile_aux',
      model: 'model-balanced',
      authorization: { authorizedTotalTokens: 100_000 },
      timestamp: fixedTimestamp
    });
    const completedArcs = await runCustomSourceAggregationTask(
      repository,
      arcTask.task.taskId,
      narrator(async () =>
        completion({
          ...aggregationPayload('故事弧'),
          storyArcs: [
            {
              title: '仓库调查弧',
              summary: '从匿名货车推进到仓库收据矛盾。',
              sourceResultRefs: [stageResult.aggregationResultId],
              sourceObservationIds: [
                stageResult.eventThreads[0]!.observationId
              ],
              characterMergeSuggestionIds: [],
              invariantCore: ['调查链必须保留来源顺序。'],
              mutableSlots: ['人物职位可适配。'],
              forbiddenAdaptations: ['不得提前定罪。'],
              contentGaps: ['司机身份未知。'],
              continuationHints: ['核对夜班主管。']
            }
          ]
        })
      ),
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    const storyArc = completedArcs.results[0]!.storyArcs![0]!;
    const projectBuildTask = await createCustomSourceProjectBuildTask(
      repository,
      {
        inputTaskId: completedArcs.task.taskId,
        conversionMode: 'structural_adaptation',
        apiProfileId: 'profile_aux',
        model: 'model-balanced',
        authorization: { authorizedTotalTokens: 100_000 },
        timestamp: fixedTimestamp
      }
    );
    const completedProject = await runCustomSourceProjectBuildTask(
      repository,
      projectBuildTask.task.taskId,
      narrator(async () =>
        completion(
          projectBuildPayload(
            storyArc.storyArcId,
            storyArc.sourceObservationIds[0]!
          )
        )
      ),
      { automaticRetry: false, now: () => fixedTimestamp }
    );
    expect(completedProject.task.status).toBe('completed');
    expect(completedProject.result).not.toBeNull();
    const revisionBase = {
      projectId: 'project-aggregation-backup',
      revision: 1,
      title: '长篇备份项目',
      summary: '验证中间资产可恢复',
      conversionMode: 'structural_adaptation' as const,
      characterAssetIds: [],
      eventGroupIds: [],
      deployments: [],
      sourceDocumentIds: [document.sourceDocumentId],
      lifecycle: {
        generationStatus: 'processing',
        reviewStatus: 'needs_review',
        availabilityStatus: 'disabled'
      } as const
    };
    const revision: CustomContentProjectRevision = {
      ...revisionBase,
      checksum: await createCustomContentChecksum(revisionBase)
    };
    await repository.saveRevisionBundle({
      assetKind: 'content_project',
      asset: {
        projectId: revision.projectId,
        latestRevision: 1,
        revisionCount: 1,
        createdAt: fixedTimestamp,
        updatedAt: fixedTimestamp
      },
      revision
    });

    const parsed = await parseCustomContentPackageZip(
      await createCustomContentAuthorBackup({
        repository,
        projectRevisionRef: createCustomContentRevisionRef(revision),
        includeSourceText: true,
        exportedAt: fixedTimestamp
      })
    );

    expect(parsed.sourceStructures).toHaveLength(1);
    expect(parsed.extractionResults).toHaveLength(structure.chunks.length);
    expect(parsed.carryLedgerEntries).toHaveLength(structure.chunks.length);
    expect(parsed.aggregationResults).toHaveLength(
      completedChapters.results.length +
        completedStages.results.length +
        completedArcs.results.length
    );
    expect(parsed.projectDraftResults).toEqual([completedProject.result]);
    expect(
      parsed.manifest.entries?.filter(
        (entry) => entry.entryKind === 'processing_units'
      )
    ).toHaveLength(7);
    expect(
      parsed.manifest.entries?.some(
        (entry) => entry.entryKind === 'processing_unit'
      )
    ).toBe(false);

    const restored = new IndexedDbCustomContentRepository(
      `${databaseName}-restored`
    );
    await importCustomContentPackage({
      repository: restored,
      packageValue: parsed
    });
    expect(
      await restored.loadSourceStructure(structure.sourceStructureId)
    ).toEqual(structure);
    expect(
      await restored.listCarryLedgerEntriesForTask(extractionTaskId)
    ).toHaveLength(structure.chunks.length);
    expect(
      await restored.listAggregationResultsForTask(
        completedArcs.task.taskId
      )
    ).toEqual(completedArcs.results);
    expect(
      await restored.loadProjectDraftResultForTask(
        completedProject.task.taskId
      )
    ).toEqual(completedProject.result);

    const remappedTarget = new IndexedDbCustomContentRepository(
      `${databaseName}-remapped`
    );
    const conflictingBase = {
      ...revisionBase,
      title: '本地不同谱系项目',
      summary: '故意制造同 ID 谱系冲突',
      sourceDocumentIds: []
    };
    const conflictingRevision: CustomContentProjectRevision = {
      ...conflictingBase,
      checksum: await createCustomContentChecksum(conflictingBase)
    };
    await remappedTarget.saveRevisionBundle({
      assetKind: 'content_project',
      asset: {
        projectId: conflictingRevision.projectId,
        latestRevision: 1,
        revisionCount: 1,
        createdAt: fixedTimestamp,
        updatedAt: fixedTimestamp
      },
      revision: conflictingRevision
    });
    const remapped = await importCustomContentPackage({
      repository: remappedTarget,
      packageValue: parsed,
      conflictStrategy: 'remap'
    });
    expect(remapped.remapped).toBe(true);
    const remappedSourceId =
      remapped.sourceDocumentIdMap[document.sourceDocumentId];
    const remappedStructures =
      await remappedTarget.listSourceStructures(remappedSourceId);
    const remappedTasks = (await remappedTarget.listProcessingTasks()).filter(
      (task) => task.sourceDocumentId === remappedSourceId
    );
    const remappedExtractionTask = remappedTasks.find(
      (task) => task.taskKind === 'extract_local'
    )!;
    const remappedChapterTask = remappedTasks.find(
      (task) => task.taskKind === 'aggregate_chapter'
    )!;
    const remappedStageTask = remappedTasks.find(
      (task) => task.taskKind === 'aggregate_stage'
    )!;
    const remappedArcTask = remappedTasks.find(
      (task) => task.taskKind === 'aggregate_arc'
    )!;
    const remappedProjectBuildTask = remappedTasks.find(
      (task) => task.taskKind === 'build_project'
    )!;
    const remappedExtractions =
      await remappedTarget.listExtractionResultsForTask(
        remappedExtractionTask.taskId
      );
    const remappedAggregates =
      await remappedTarget.listAggregationResultsForTask(
        remappedChapterTask.taskId
      );
    const remappedArcResults =
      await remappedTarget.listAggregationResultsForTask(
        remappedArcTask.taskId
      );
    expect(remappedStructures).toHaveLength(1);
    expect(remappedChapterTask.aiProcessing?.inputTaskIds).toEqual([
      remappedExtractionTask.taskId
    ]);
    expect(remappedStageTask.aiProcessing?.inputTaskIds).toEqual([
      remappedChapterTask.taskId
    ]);
    expect(remappedArcTask.aiProcessing?.inputTaskIds).toEqual([
      remappedStageTask.taskId
    ]);
    expect(remappedProjectBuildTask.aiProcessing?.inputTaskIds).toEqual([
      remappedArcTask.taskId
    ]);
    expect(
      remappedAggregates.flatMap((result) => result.lowerResultRefs).every(
        (ref) =>
          remappedExtractions.some(
            (result) => result.extractionResultId === ref
          )
      )
    ).toBe(true);
    const remappedArc = remappedArcResults[0]!;
    expect(remappedArc.storyArcs).toHaveLength(1);
    expect(remappedArc.storyArcs![0]!.sourceResultRefs).toEqual(
      remappedArc.lowerResultRefs
    );
    expect(remappedArc.storyArcs![0]!.sourceObservationIds[0]).not.toBe(
      completedArcs.results[0]!.storyArcs![0]!.sourceObservationIds[0]
    );
    const remappedProjectDraft =
      await remappedTarget.loadProjectDraftResultForTask(
        remappedProjectBuildTask.taskId
      );
    expect(remappedProjectDraft).not.toBeNull();
    expect(remappedProjectDraft!.sourceAggregationResultRefs).toEqual([
      remappedArc.aggregationResultId
    ]);
    expect(remappedProjectDraft!.storyArcIds).toEqual([
      remappedArc.storyArcs![0]!.storyArcId
    ]);
    const remappedCandidateObservationId =
      remappedProjectDraft!.characterCandidateSources[0]!
        .sourceObservationIds[0]!;
    expect(remappedProjectDraft!.sourceObservationIds).toContain(
      remappedCandidateObservationId
    );
    expect(remappedCandidateObservationId).not.toBe(
      completedProject.result!.characterCandidateSources[0]!
        .sourceObservationIds[0]
    );
    expect(remappedProjectDraft!.projectDraftResultId).not.toBe(
      completedProject.result!.projectDraftResultId
    );
  });
});
