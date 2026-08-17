import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CustomContentProcessingTask,
  CustomSourceDocument,
  CustomSourceStructure
} from '../../domain/customContent/assetTypes';
import type { ApiProfile } from '../../domain/settings/types';
import { LongTextExtractionControls } from './LongTextExtractionControls';
import type { LongTextSourceLibraryEntry } from './longTextSourceLibrary';

const timestamp = '2026-07-26T16:00:00.000Z';

const profile: ApiProfile = {
  id: 'profile_aux',
  name: '辅助模型',
  providerLabel: 'Local test',
  interfaceType: 'openai-compatible',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-key',
  models: ['model-balanced', 'model-new'],
  createdAt: timestamp,
  updatedAt: timestamp
};

const documentFixture: CustomSourceDocument = {
  sourceDocumentId: 'source_1',
  fileName: '罪案长篇.md',
  sourceFormat: 'markdown',
  mediaType: 'text/markdown',
  byteLength: 4_096,
  characterCount: 8_000,
  checksum: 'source_checksum',
  createdAt: timestamp,
  updatedAt: timestamp
};

const structureFixture = {
  sourceStructureId: 'structure_1',
  sourceDocumentId: 'source_1',
  estimatedTokenCount: 2_000,
  chunks: [
    { estimatedTokenCount: 900 },
    { estimatedTokenCount: 1_100 }
  ]
} as CustomSourceStructure;

function taskFixture(
  status: CustomContentProcessingTask['status']
): CustomContentProcessingTask {
  return {
    taskId: 'extract_task',
    taskKind: 'extract_local',
    sourceDocumentId: 'source_1',
    status,
    apiProfileId: profile.id,
    model: 'model-balanced',
    concurrency: 1,
    maxRetries: 2,
    completedUnitCount: 1,
    totalUnitCount: 2,
    estimatedInputTokens: 2_840,
    consumedInputTokens: 100,
    consumedOutputTokens: 50,
    consumedCost: 0.0006,
    costLimit: 1,
    aiProcessing: {
      sourceStructureId: structureFixture.sourceStructureId,
      promptVersion: 'phase9-local-extraction-v1',
      maxOutputTokensPerUnit: 1_200,
      authorizedTotalTokens: 6_000,
      authorizedAt: timestamp,
      pricing: {
        currency: 'USD',
        inputPerMillionTokens: 2,
        outputPerMillionTokens: 8
      }
    },
    pauseReason: status === 'paused' ? 'token_limit' : undefined,
    stateRevision: 2,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function entry(
  extractionTask?: CustomContentProcessingTask
): LongTextSourceLibraryEntry {
  return {
    document: documentFixture,
    structure: structureFixture,
    tasks: extractionTask ? [extractionTask] : [],
    extractionResults: [],
    carryLedgerEntries: [],
    aggregationResults: [],
    projectDraftResults: []
  };
}

describe('LongTextExtractionControls', () => {
  it('saves explicit authorization without starting a provider request', async () => {
    const onCreateTask = vi.fn().mockResolvedValue(undefined);
    const onRunTask = vi.fn().mockResolvedValue(undefined);
    render(
      <LongTextExtractionControls
        entry={entry()}
        profiles={[profile]}
        defaultProfileId={profile.id}
        defaultModel="model-balanced"
        onCreateTask={onCreateTask}
        onRunTask={onRunTask}
      />
    );

    const authorize = screen.getByRole('button', {
      name: '授权并建立任务'
    });
    expect(authorize).toBeDisabled();
    expect(
      screen.getByText(/建立授权本身不会发起调用/)
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /我确认开始任务后/
      })
    );
    expect(authorize).toBeEnabled();
    fireEvent.click(authorize);

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(1));
    expect(onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceStructureId: structureFixture.sourceStructureId,
        apiProfileId: profile.id,
        model: 'model-balanced',
        authorization: expect.objectContaining({
          authorizedTotalTokens: 5_240,
          maxOutputTokensPerUnit: 1_200
        })
      })
    );
    expect(onRunTask).not.toHaveBeenCalled();
    expect(
      await screen.findByText('授权凭据已保存，尚未调用模型。')
    ).toBeInTheDocument();
  });

  it('only enables monetary limits after the user supplies explicit prices', () => {
    render(
      <LongTextExtractionControls
        entry={entry()}
        profiles={[profile]}
        defaultProfileId={profile.id}
        defaultModel="model-balanced"
      />
    );

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /我知道服务商单价/
      })
    );
    expect(
      screen.getByText(/系统不会猜测服务商价格/)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('输入 USD / 百万 token')
    ).toHaveValue(null);
    expect(
      screen.getByLabelText('输出 USD / 百万 token')
    ).toHaveValue(null);
    expect(screen.getByLabelText('本次 USD 硬上限')).toHaveValue(null);
  });

  it('shows persisted progress and reauthorizes a paused task with a new model', async () => {
    const onResumeTask = vi.fn().mockResolvedValue(undefined);
    const onReauthorizeTask = vi.fn().mockResolvedValue(undefined);
    render(
      <LongTextExtractionControls
        entry={entry(taskFixture('paused'))}
        profiles={[profile]}
        defaultProfileId={profile.id}
        defaultModel="model-balanced"
        onResumeTask={onResumeTask}
        onReauthorizeTask={onReauthorizeTask}
      />
    );

    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('150 / 6,000')).toBeInTheDocument();
    expect(screen.getByText(/超过 token 授权上限/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '调整授权 / 更换模型' })
    );
    fireEvent.change(screen.getByLabelText('模型'), {
      target: { value: 'model-new' }
    });
    fireEvent.change(screen.getByLabelText('本次 token 硬上限'), {
      target: { value: '12000' }
    });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /我确认开始任务后/
      })
    );
    fireEvent.click(screen.getByRole('button', { name: '保存新授权' }));

    await waitFor(() =>
      expect(onReauthorizeTask).toHaveBeenCalledWith(
        'extract_task',
        expect.objectContaining({
          apiProfileId: profile.id,
          model: 'model-new',
          authorization: expect.objectContaining({
            authorizedTotalTokens: 12_000
          })
        })
      )
    );
    expect(onResumeTask).not.toHaveBeenCalled();
  });

  it('starts a queued task only through the dedicated run control', async () => {
    const onRunTask = vi.fn().mockResolvedValue(undefined);
    render(
      <LongTextExtractionControls
        entry={entry(taskFixture('queued'))}
        profiles={[profile]}
        defaultProfileId={profile.id}
        defaultModel="model-balanced"
        onRunTask={onRunTask}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: '开始 AI 局部提取' })
    );
    await waitFor(() =>
      expect(onRunTask).toHaveBeenCalledWith('extract_task')
    );
  });
});
