import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CurrentSaveContentLibrary,
  CurrentSaveEventEntry
} from './currentSaveLibrary';
import { CurrentSaveInspector } from './CurrentSaveInspector';

const eventEntry: CurrentSaveEventEntry = {
  kind: 'events',
  assetId: 'event-seal',
  bindingId: 'binding:event-seal',
  revision: 1,
  checksum: 'checksum-event-seal',
  title: '封条异常',
  summary: '证物编号与登记簿不一致。',
  adaptationStatus: 'ready',
  prioritized: false,
  hasWorldFacts: true,
  revisionPayload: {
    eventGroupId: 'event-seal',
    projectId: 'project-seal',
    revision: 1,
    checksum: 'checksum-event-seal',
    title: '封条异常',
    summary: '证物编号与登记簿不一致。',
    invariantCore: [],
    mutableSlots: [],
    forbiddenAdaptations: [],
    characterRefs: [],
    roleSlots: [],
    stages: [
      {
        stageId: 'stage-discovery',
        title: '发现异常',
        summary: '核对登记簿。',
        establishedSourceFacts: [],
        continuationSourceFacts: [],
        hardSourceConstraints: [],
        foreshadowingOptions: [],
        eventNodes: [],
        completionHints: [],
        nextStageHints: []
      },
      {
        stageId: 'stage-investigation',
        title: '追查来源',
        summary: '寻找改动原因。',
        establishedSourceFacts: [],
        continuationSourceFacts: [],
        hardSourceConstraints: [],
        foreshadowingOptions: [],
        eventNodes: [],
        completionHints: [],
        nextStageHints: []
      }
    ],
    entryMode: 'asap',
    reusePolicy: 'save_single_use',
    inheritProjectDeployments: true,
    sourceSpans: [],
    lifecycle: {
      generationStatus: 'ready',
      reviewStatus: 'approved',
      availabilityStatus: 'enabled'
    }
  },
  instance: {
    instanceId: 'event-instance:seal',
    eventGroupId: 'event-seal',
    eventGroupRevision: 1,
    projectId: 'project-seal',
    projectRevision: 1,
    adaptationId: 'adaptation:event-seal',
    status: 'active',
    currentStageId: 'stage-investigation',
    projectCharacterBindings: {},
    roleBindings: {},
    usedStageIds: ['stage-discovery'],
    usedNodeIds: ['node-check-ledger'],
    factStateOverrides: {
      'fact-ledger': 'established_in_save',
      'fact-old-place': 'invalidated_in_save'
    },
    progressHistory: [],
    resultingWritebackRefs: [
      { kind: 'current_matter', id: 'matter-seal' }
    ]
  }
};

const library: CurrentSaveContentLibrary = {
  save: {
    saveId: 'save-test',
    saveName: '测试存档',
    playerName: '陈家驹',
    worldpackId: 'hk_1988',
    gameDateLabel: '1988年9月12日',
    turnCounter: 4,
    updatedAt: '2026-07-28T00:00:00.000Z'
  },
  characters: [],
  events: [eventEntry],
  priorityCount: 3,
  diagnosticCount: 0
};

const handlers = {
  onApprove: vi.fn(),
  onSetPriority: vi.fn(),
  onSetPaused: vi.fn(),
  onAbandonEvent: vi.fn()
};

describe('CurrentSaveInspector', () => {
  it('shows the durable stage, node and fact-state progress', () => {
    render(
      <CurrentSaveInspector
        entry={eventEntry}
        library={library}
        busy={false}
        {...handlers}
      />
    );

    expect(screen.getByText('追查来源')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 阶段 · 已采用 1 个节点')).toBeInTheDocument();
    expect(screen.getByText('已成立 1 · 已失效 1')).toBeInTheDocument();
  });

  it('does not make adaptation approval consume or wait for a priority slot', () => {
    render(
      <CurrentSaveInspector
        entry={{ ...eventEntry, adaptationStatus: 'needs_review' }}
        library={library}
        busy={false}
        {...handlers}
      />
    );

    expect(
      screen.getByRole('button', { name: '审核并确认适配' })
    ).toBeEnabled();
  });
});
