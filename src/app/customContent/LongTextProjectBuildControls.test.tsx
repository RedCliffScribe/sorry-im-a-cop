import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CustomContentProcessingTask,
  CustomSourceDocument
} from '../../domain/customContent/assetTypes';
import type { CustomSourceProjectDraftResult } from '../../domain/customContent/sourceProjectBuildSchemas';
import type { ApiProfile } from '../../domain/settings/types';
import { LongTextProjectBuildControls } from './LongTextProjectBuildControls';
import type { LongTextSourceLibraryEntry } from './longTextSourceLibrary';

const timestamp = '2026-07-26T17:00:00.000Z';

const profile: ApiProfile = {
  id: 'profile_aux',
  name: '辅助模型',
  providerLabel: 'Local test',
  interfaceType: 'openai-compatible',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-key',
  models: ['model-balanced'],
  createdAt: timestamp,
  updatedAt: timestamp
};

const documentFixture: CustomSourceDocument = {
  sourceDocumentId: 'source_long_project',
  fileName: '仓库暗线.md',
  sourceFormat: 'markdown',
  mediaType: 'text/markdown',
  byteLength: 4_096,
  checksum: 'source_checksum',
  createdAt: timestamp,
  updatedAt: timestamp
};

function taskFixture(
  taskKind: 'aggregate_arc' | 'build_project',
  status: CustomContentProcessingTask['status']
): CustomContentProcessingTask {
  const build = taskKind === 'build_project';
  return {
    taskId: build ? 'build_task' : 'arc_task',
    taskKind,
    sourceDocumentId: documentFixture.sourceDocumentId,
    status,
    apiProfileId: profile.id,
    model: 'model-balanced',
    concurrency: 1,
    maxRetries: 2,
    completedUnitCount: status === 'completed' ? 1 : 0,
    totalUnitCount: 1,
    estimatedInputTokens: 2_000,
    consumedInputTokens: status === 'completed' ? 600 : 0,
    consumedOutputTokens: status === 'completed' ? 900 : 0,
    sourceProcessing: {
      sourceFormat: 'markdown',
      encoding: 'utf-8',
      parserVersion: 'phase8-source-parser-v1',
      canonicalTextChecksum: 'source_checksum',
      chunking: {
        targetTokenCount: 900,
        maxTokenCount: 1_200,
        overlapTokenCount: 120
      }
    },
    aiProcessing: {
      sourceStructureId: 'structure_1',
      promptVersion: build
        ? 'phase9-project-build-v1'
        : 'phase9-story-arc-aggregation-v1',
      maxOutputTokensPerUnit: 8_000,
      authorizedTotalTokens: 40_000,
      authorizedAt: timestamp,
      inputTaskIds: build ? ['arc_task'] : ['stage_task'],
      aggregationLevel: build ? undefined : 'arc',
      conversionMode: build ? 'structural_adaptation' : undefined
    },
    stateRevision: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function entry(
  tasks: CustomContentProcessingTask[],
  projectDraftResults: CustomSourceProjectDraftResult[] = []
): LongTextSourceLibraryEntry {
  return {
    document: documentFixture,
    tasks,
    extractionResults: [],
    carryLedgerEntries: [],
    aggregationResults: [],
    projectDraftResults
  };
}

function resultFixture(): CustomSourceProjectDraftResult {
  return {
    projectDraftResultId: 'project_draft_1',
    taskId: 'build_task',
    unitId: 'build_unit',
    sourceDocumentId: documentFixture.sourceDocumentId,
    sourceStructureId: 'structure_1',
    sourceAggregationResultRefs: ['arc_result_1'],
    storyArcIds: ['arc_1'],
    sourceObservationIds: ['observation_1'],
    characterMergeSuggestionIds: [],
    conversionMode: 'structural_adaptation',
    draft: {
      project: {
        title: '仓库暗线',
        summary: '调查雨夜货车与仓库收据矛盾。',
        conversionMode: 'structural_adaptation'
      },
      characterCandidates: [
        {
          candidateKey: 'liang-jingyi',
          character: {
            displayName: '梁静仪',
            aliases: [],
            gender: 'female',
            profileSummary: '调查员',
            backgroundSummary: '负责核对证物。',
            corePersonality: ['谨慎'],
            values: ['证据'],
            coreMotivations: ['查明真相'],
            majorRelationships: [],
            entryMode: 'follow_project',
            adaptationPolicy: {
              temporalPolicy: 'preserve_life_stage',
              lockedFields: [],
              adaptableFields: []
            }
          }
        }
      ],
      eventGroups: [
        {
          eventGroupKey: 'warehouse',
          title: '雨夜货车',
          summary: '核查货车线索。',
          invariantCore: ['保留调查链'],
          mutableSlots: [],
          forbiddenAdaptations: [],
          characterCandidateKeys: ['liang-jingyi'],
          roleSlots: [],
          stages: [],
          entryMode: 'asap',
          reusePolicy: 'save_single_use',
          inheritProjectDeployments: true
        }
      ]
    },
    eventGroupSources: [
      { eventGroupKey: 'warehouse', storyArcIds: ['arc_1'] }
    ],
    characterCandidateSources: [
      {
        candidateKey: 'liang-jingyi',
        sourceObservationIds: ['observation_1'],
        characterMergeSuggestionIds: []
      }
    ],
    contentGaps: ['司机身份未知。'],
    consistencyIssues: [],
    reviewStatus: 'needs_review',
    apiProfileId: profile.id,
    model: 'model-balanced',
    inputTokens: 600,
    outputTokens: 900,
    usageSource: 'provider',
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe('LongTextProjectBuildControls', () => {
  it('saves mode and authorization without starting the provider', async () => {
    const onCreateTask = vi.fn().mockResolvedValue(undefined);
    const onRunTask = vi.fn().mockResolvedValue(undefined);
    render(
      <LongTextProjectBuildControls
        entry={entry([taskFixture('aggregate_arc', 'completed')])}
        profiles={[profile]}
        defaultProfileId={profile.id}
        defaultModel="model-balanced"
        onCreateTask={onCreateTask}
        onRunTask={onRunTask}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: '配置并授权项目生成' })
    );
    fireEvent.click(screen.getByRole('radio', { name: /来源方向优先/ }));
    const authorize = screen.getByRole('button', {
      name: '授权并建立项目草稿任务'
    });
    expect(authorize).toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /我确认只把故事弧结构摘要/
      })
    );
    expect(authorize).toBeEnabled();
    fireEvent.click(authorize);

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(1));
    expect(onCreateTask).toHaveBeenCalledWith({
      inputTaskId: 'arc_task',
      conversionMode: 'source_direction_priority',
      apiProfileId: profile.id,
      model: 'model-balanced',
      authorization: { authorizedTotalTokens: 40_000 }
    });
    expect(onRunTask).not.toHaveBeenCalled();
    expect(
      await screen.findByText('项目草稿授权已保存，尚未调用模型。')
    ).toBeInTheDocument();
  });

  it('shows a traceable review summary and opens the existing editor explicitly', () => {
    const result = resultFixture();
    const onReviewDraft = vi.fn();
    render(
      <LongTextProjectBuildControls
        entry={entry(
          [
            taskFixture('build_project', 'completed'),
            taskFixture('aggregate_arc', 'completed')
          ],
          [result]
        )}
        profiles={[profile]}
        defaultProfileId={profile.id}
        defaultModel="model-balanced"
        onReviewDraft={onReviewDraft}
      />
    );

    expect(screen.getByText('仓库暗线')).toBeInTheDocument();
    expect(screen.getByText('雨夜货车')).toBeInTheDocument();
    expect(screen.getByText('1 个故事弧已覆盖')).toBeInTheDocument();
    expect(screen.getByText('司机身份未知。')).toBeInTheDocument();
    expect(screen.getByText(/不会自动建立 Runtime Actor/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '在项目编辑器中审阅' })
    );
    expect(onReviewDraft).toHaveBeenCalledWith(result);
  });
});
