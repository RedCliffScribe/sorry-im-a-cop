import { describe, expect, it } from 'vitest';
import { formatImageAutomationDiagnostics } from './automationDiagnostics';
import type { ImageAutomationTriggerRecord } from './automationRuntime';
import type { VisualRepositorySnapshot } from './visualRepository';

function snapshot(): VisualRepositorySnapshot {
  return {
    schemaVersion: 1,
    saveId: 'save_1',
    characterAnchors: {},
    scenePlans: {},
    tasks: {},
    characterBatches: {},
    assets: {},
    bindings: {},
    storySceneDisplayStates: {}
  };
}

function record(overrides: Partial<ImageAutomationTriggerRecord> = {}): ImageAutomationTriggerRecord {
  return {
    triggerId: 'trigger_1',
    saveId: 'save_1',
    kind: 'character-created',
    subjectId: 'npc_1',
    status: 'blocked',
    executionFingerprints: [],
    taskIds: [],
    retryCount: 0,
    maxRetries: 1,
    blockerCode: 'runtime-evidence-missing',
    safeMessage: '自动人物图任务失败；正文与已有图片未受影响，可在图片管理中重试。',
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    ...overrides
  };
}

describe('image automation diagnostics', () => {
  it('distinguishes a local pre-submission block from provider submission', () => {
    const output = formatImageAutomationDiagnostics([record()], snapshot());

    expect(output).toContain('providerSubmitted=no');
    expect(output).toContain('blocker=runtime-evidence-missing');
    expect(output).toContain('retry=0/1');
  });

  it('reports when an image request has already been submitted', () => {
    const visualSnapshot = snapshot();
    visualSnapshot.tasks.task_1 = {
      taskId: 'task_1',
      status: 'failed',
      submittedRequest: {
        positivePrompt: 'redacted test prompt',
        submittedAt: '2026-08-22T00:00:01.000Z'
      }
    } as unknown as VisualRepositorySnapshot['tasks'][string];

    const output = formatImageAutomationDiagnostics([
      record({ status: 'failed', taskIds: ['task_1'], blockerCode: undefined })
    ], visualSnapshot);

    expect(output).toContain('providerSubmitted=yes(1)');
    expect(output).toContain('taskStatuses=failed');
    expect(output).not.toContain('redacted test prompt');
  });
});
