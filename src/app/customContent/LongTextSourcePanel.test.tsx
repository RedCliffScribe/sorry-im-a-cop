import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CustomContentProcessingTask,
  CustomSourceDocument,
  CustomSourceStructure
} from '../../domain/customContent/assetTypes';
import type { ApiProfile } from '../../domain/settings/types';
import { LongTextSourcePanel } from './LongTextSourcePanel';
import type { LongTextSourceLibraryEntry } from './longTextSourceLibrary';

const timestamp = '2026-07-26T12:00:00.000Z';
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

function documentFixture(
  overrides: Partial<CustomSourceDocument> = {}
): CustomSourceDocument {
  return {
    sourceDocumentId: 'source_1',
    fileName: '罪案长篇.md',
    sourceFormat: 'markdown',
    mediaType: 'text/markdown',
    byteLength: 4_096,
    characterCount: 120_000,
    checksum: 'source_checksum',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function taskFixture(
  status: CustomContentProcessingTask['status'],
  taskKind: CustomContentProcessingTask['taskKind'] = 'parse_source',
  overrides: Partial<CustomContentProcessingTask> = {}
): CustomContentProcessingTask {
  return {
    taskId: `${taskKind}_task`,
    taskKind,
    sourceDocumentId: 'source_1',
    status,
    concurrency: 1,
    maxRetries: 2,
    completedUnitCount: status === 'completed' ? 1 : 0,
    totalUnitCount: 1,
    estimatedInputTokens: 0,
    consumedInputTokens: 0,
    consumedOutputTokens: 0,
    stateRevision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function entryFixture(
  tasks: CustomContentProcessingTask[],
  structure?: CustomSourceStructure
): LongTextSourceLibraryEntry {
  return {
    document: documentFixture(),
    tasks,
    structure,
    extractionResults: [],
    carryLedgerEntries: [],
    aggregationResults: [],
    projectDraftResults: []
  };
}

describe('LongTextSourcePanel', () => {
  it('imports a supported file and explains the local-only boundary', async () => {
    const document = documentFixture();
    const parseTask = taskFixture('queued');
    const onImportSource = vi.fn().mockResolvedValue({
      document,
      parseTask,
      alreadyPresent: false
    });

    render(
      <LongTextSourcePanel
        entries={[]}
        onClose={vi.fn()}
        onImportSource={onImportSource}
      />
    );

    expect(
      screen.getByText(/本地解析不调用模型/)
    ).toBeInTheDocument();
    expect(screen.getByText(/V1 不支持 PDF/)).toBeInTheDocument();

    const file = new File(['第一章\n正文。'], 'novel.txt', {
      type: 'text/plain'
    });
    fireEvent.change(screen.getByLabelText('选择长篇来源文件'), {
      target: { files: [file] }
    });

    await waitFor(() => expect(onImportSource).toHaveBeenCalledWith(file));
    expect(
      await screen.findByText('原始文件已保存一次，解析任务已进入等待队列。')
    ).toBeInTheDocument();
  });

  it('runs and cancels a queued parse task through explicit controls', async () => {
    const onRunTask = vi.fn().mockResolvedValue(undefined);
    const onCancelTask = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <LongTextSourcePanel
        entries={[entryFixture([taskFixture('queued')])]}
        onClose={vi.fn()}
        onRunTask={onRunTask}
        onCancelTask={onCancelTask}
      />
    );

    expect(screen.getByText('罪案长篇.md')).toBeInTheDocument();
    expect(screen.getByText(/120,000 字符/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '开始解析' }));
    await waitFor(() =>
      expect(onRunTask).toHaveBeenCalledWith('parse_source_task')
    );

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() =>
      expect(onCancelTask).toHaveBeenCalledWith('parse_source_task')
    );
  });

  it('offers resume, retry, and structure building for persisted task states', async () => {
    const onResumeTask = vi.fn().mockResolvedValue(undefined);
    const onRetryTask = vi.fn().mockResolvedValue(undefined);
    const onBuildStructure = vi.fn().mockResolvedValue(undefined);
    const pausedView = render(
      <LongTextSourcePanel
        entries={[entryFixture([taskFixture('paused')])]}
        onClose={vi.fn()}
        onResumeTask={onResumeTask}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    await waitFor(() =>
      expect(onResumeTask).toHaveBeenCalledWith('parse_source_task')
    );
    pausedView.unmount();

    const failedView = render(
      <LongTextSourcePanel
        entries={[
          entryFixture([
            taskFixture('failed', 'parse_source', {
              lastError: '编码解析失败'
            })
          ])
        ]}
        onClose={vi.fn()}
        onRetryTask={onRetryTask}
      />
    );
    expect(screen.getByText('编码解析失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() =>
      expect(onRetryTask).toHaveBeenCalledWith('parse_source_task')
    );
    failedView.unmount();

    render(
      <LongTextSourcePanel
        entries={[entryFixture([taskFixture('completed')])]}
        onClose={vi.fn()}
        onBuildStructure={onBuildStructure}
      />
    );
    const buildButton = screen.getByRole('button', {
      name: '生成章节与分块'
    });
    expect(buildButton).toBeEnabled();
    fireEvent.click(buildButton);
    await waitFor(() =>
      expect(onBuildStructure).toHaveBeenCalledWith('parse_source_task')
    );
  });

  it('renders persisted chapter and chunk totals after both local stages finish', () => {
    const structure = {
      chapters: [{}, {}, {}],
      chunks: [{}, {}, {}, {}, {}],
      estimatedTokenCount: 88_000
    } as CustomSourceStructure;
    render(
      <LongTextSourcePanel
        entries={[
          entryFixture(
            [
              taskFixture('completed'),
              taskFixture('completed', 'chunk_source')
            ],
            structure
          )
        ]}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('3 章')).toBeInTheDocument();
    expect(screen.getByText('5 个分块')).toBeInTheDocument();
    expect(screen.getByText('约 88,000 tokens')).toBeInTheDocument();
  });

  it('requires a separate consent receipt before creating chapter aggregation and does not run it', async () => {
    const extractionTask = taskFixture('completed', 'extract_local', {
      taskId: 'extract_task',
      apiProfileId: profile.id,
      model: 'model-balanced',
      completedUnitCount: 2,
      totalUnitCount: 2,
      sourceProcessing: {
        sourceFormat: 'markdown',
        encoding: 'auto',
        parserVersion: 'test',
        canonicalTextChecksum: 'source_checksum'
      },
      aiProcessing: {
        sourceStructureId: 'structure_1',
        promptVersion: 'phase9-local-extraction-v1',
        maxOutputTokensPerUnit: 1_200,
        authorizedTotalTokens: 10_000,
        authorizedAt: timestamp
      }
    });
    const structure = {
      sourceStructureId: 'structure_1',
      sourceDocumentId: 'source_1',
      estimatedTokenCount: 2_000,
      chapters: [{ chapterId: 'chapter_1' }, { chapterId: 'chapter_2' }],
      chunks: [{ estimatedTokenCount: 900 }, { estimatedTokenCount: 1_100 }]
    } as CustomSourceStructure;
    const entry = entryFixture([extractionTask], structure);
    entry.extractionResults = [
      { extractionResultId: 'result_1' },
      { extractionResultId: 'result_2' }
    ] as LongTextSourceLibraryEntry['extractionResults'];
    entry.carryLedgerEntries = [
      { carryLedgerEntryId: 'carry_1' },
      { carryLedgerEntryId: 'carry_2' }
    ] as LongTextSourceLibraryEntry['carryLedgerEntries'];
    const onCreateAggregationTask = vi.fn().mockResolvedValue(undefined);
    const onRunAggregationTask = vi.fn().mockResolvedValue(undefined);

    render(
      <LongTextSourcePanel
        entries={[entry]}
        profiles={[profile]}
        defaultProfileId={profile.id}
        defaultModel="model-balanced"
        onClose={vi.fn()}
        onCreateAggregationTask={onCreateAggregationTask}
        onRunAggregationTask={onRunAggregationTask}
      />
    );

    expect(screen.getByText('承接账本 2/2')).toBeInTheDocument();
    expect(screen.getByText('故事弧聚合')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '配置并授权章节聚合' })
    );
    const authorize = screen.getByRole('button', {
      name: '授权并建立章节聚合任务'
    });
    expect(authorize).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText(
        /我确认“开始”后只把下一级结构化摘要发送给所选模型/
      )
    );
    expect(authorize).toBeEnabled();
    fireEvent.click(authorize);

    await waitFor(() =>
      expect(onCreateAggregationTask).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregationLevel: 'chapter',
          inputTaskId: 'extract_task',
          apiProfileId: profile.id,
          model: 'model-balanced'
        })
      )
    );
    expect(onRunAggregationTask).not.toHaveBeenCalled();
  });
});
