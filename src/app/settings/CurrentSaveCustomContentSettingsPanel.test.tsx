import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CustomCharacterRevision,
  CustomContentProjectRevision,
  CustomEventGroupRevision
} from '../../domain/customContent/assetTypes';
import {
  bindCustomCharacterRevisionToState,
  bindCustomEventProjectRevisionToState,
  setCustomContentPriorityInState
} from '../../domain/customContent/saveBinding';
import { createNativeCustomSaveAdaptationBundle } from '../../domain/customContent/saveAdaptation';
import { createDefaultCustomCharacterAdaptationPolicy } from '../../domain/customContent/worldAdaptation';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { RuntimeState } from '../../domain/runtime/types';
import { HK_1988_ADAPTATION_DESCRIPTOR } from '../../domain/worldpack/adaptationRegistry';
import { CurrentSaveCustomContentSettingsPanel } from './CurrentSaveCustomContentSettingsPanel';

const lifecycle = {
  generationStatus: 'ready' as const,
  reviewStatus: 'approved' as const,
  availabilityStatus: 'enabled' as const
};

const deployment = {
  worldpackId: 'hk_1988',
  mode: 'native' as const,
  defaultEnabledForNewGame: true
};

function character(
  characterAssetId: string,
  displayName: string,
  entryMode: CustomCharacterRevision['entryMode'] = 'asap_contact'
): CustomCharacterRevision {
  return {
    characterAssetId,
    revision: 1,
    checksum: `checksum-${characterAssetId}`,
    displayName,
    aliases: [],
    gender: 'unspecified',
    profileSummary: `${displayName}的人物简介。`,
    backgroundSummary: `${displayName}的背景。`,
    corePersonality: ['谨慎'],
    values: ['事实'],
    coreMotivations: ['完成自己的目标'],
    majorRelationships: [],
    entryMode,
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy(),
    deployments: [deployment],
    sourceSpans: [],
    lifecycle
  };
}

function bindCharacter(
  state: RuntimeState,
  revision: CustomCharacterRevision
): RuntimeState {
  return bindCustomCharacterRevisionToState({
    state,
    character: revision,
    adaptationBundle: createNativeCustomSaveAdaptationBundle({
      state,
      descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
      source: { characters: [revision] }
    }),
    now: '2026-07-27T10:00:00.000Z'
  });
}

function bindEvent(state: RuntimeState): RuntimeState {
  const projectCharacter = character(
    'character-event-witness',
    '事件见证人',
    'follow_project'
  );
  const project: CustomContentProjectRevision = {
    projectId: 'project-night-shift',
    revision: 1,
    checksum: 'checksum-project-night-shift',
    title: '夜班疑云',
    summary: '一宗等待合理入口的夜班事件。',
    conversionMode: 'structural_adaptation',
    characterAssetIds: [projectCharacter.characterAssetId],
    eventGroupIds: ['event-night-shift'],
    deployments: [deployment],
    sourceDocumentIds: [],
    lifecycle
  };
  const eventGroup: CustomEventGroupRevision = {
    eventGroupId: 'event-night-shift',
    projectId: project.projectId,
    revision: 1,
    checksum: 'checksum-event-night-shift',
    title: '夜班疑云事件',
    summary: '证物交接记录出现不一致。',
    invariantCore: ['交接记录不一致'],
    mutableSlots: [],
    forbiddenAdaptations: [],
    characterRefs: [],
    roleSlots: [],
    stages: [
      {
        stageId: 'stage-discovery',
        title: '发现异常',
        summary: '发现交接记录不一致。',
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
        summary: '追查记录被改动的原因。',
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
    lifecycle
  };
  return bindCustomEventProjectRevisionToState({
    state,
    project,
    characters: [projectCharacter],
    eventGroup,
    adaptationBundle: createNativeCustomSaveAdaptationBundle({
      state,
      descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
      source: {
        project,
        characters: [projectCharacter],
        eventGroup
      }
    }),
    now: '2026-07-27T10:01:00.000Z'
  });
}

describe('CurrentSaveCustomContentSettingsPanel', () => {
  it('opens the global library in current-save management mode', () => {
    const onOpenContentLibrary = vi.fn();
    render(
      <CurrentSaveCustomContentSettingsPanel
        runtimeState={createInitialRuntimeState()}
        onOpenContentLibrary={onOpenContentLibrary}
        onPriorityChange={vi.fn(async () => undefined)}
        onPausedChange={vi.fn(async () => undefined)}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: '管理／加入本局内容' })
    );
    expect(onOpenContentLibrary).toHaveBeenCalledTimes(1);
  });

  it('shows lazy project characters and forwards a current-stage adaptation request', async () => {
    const state = bindEvent(createInitialRuntimeState());
    const characterBinding = state.customContent!.characterBindings[0];
    const eventBinding = state.customContent!.eventGroupBindings[0];
    const characterRef = {
      assetKind: 'character' as const,
      assetId: characterBinding.assetId,
      revision: characterBinding.revision,
      checksum: characterBinding.checksum
    };
    eventBinding.payload.characterRefs = [characterRef];
    eventBinding.payload.stages[0].eventNodes = [
      {
        nodeId: 'node-current-witness',
        title: '接触见证人',
        summary: '当前阶段需要事件见证人。',
        prerequisites: [],
        entryConditions: [],
        blockers: [],
        characterUsages: [
          {
            usageId: 'usage-current-witness',
            characterRef,
            usageSummary: '当前阶段人物',
            required: true
          }
        ],
        knowledgeBoundary: {
          knownBy: [],
          hiddenFrom: [],
          readerOnly: false
        },
        possibleOutcomes: ['取得说明'],
        downstreamEffects: []
      }
    ];
    const onAdaptationRequest = vi.fn(async () => undefined);

    render(
      <CurrentSaveCustomContentSettingsPanel
        runtimeState={state}
        onPriorityChange={vi.fn(async () => undefined)}
        onPausedChange={vi.fn(async () => undefined)}
        onAdaptationRequest={onAdaptationRequest}
      />
    );

    const eventCard = screen.getByText('夜班疑云事件').closest('article');
    expect(eventCard).not.toBeNull();
    expect(
      within(eventCard as HTMLElement).getByText('事件见证人 · 当前阶段')
    ).toBeInTheDocument();
    fireEvent.click(
      within(eventCard as HTMLElement).getByRole('button', {
        name: '适配当前阶段人物'
      })
    );
    expect(onAdaptationRequest).toHaveBeenCalledWith({
      eventGroupId: 'event-night-shift',
      characterAssetId: 'character-event-witness'
    });
    expect(
      await screen.findByText(/已为“事件见证人”创建并保存本局适配/)
    ).toBeInTheDocument();
  });

  it('shows only independently manageable bindings and forwards priority and pause operations', async () => {
    const reporter = character('character-reporter', '独立记者');
    const state = bindEvent(
      bindCharacter(createInitialRuntimeState(), reporter)
    );
    const onPriorityChange = vi.fn(async () => undefined);
    const onPausedChange = vi.fn(async () => undefined);

    render(
      <CurrentSaveCustomContentSettingsPanel
        runtimeState={state}
        onPriorityChange={onPriorityChange}
        onPausedChange={onPausedChange}
      />
    );

    expect(screen.getByLabelText('本局重点 2 / 3')).toBeInTheDocument();
    expect(screen.getByText('独立记者')).toBeInTheDocument();
    expect(screen.getByText('夜班疑云事件')).toBeInTheDocument();
    expect(screen.queryByText('事件见证人')).not.toBeInTheDocument();

    const reporterCard = screen.getByText('独立记者').closest('article');
    expect(reporterCard).not.toBeNull();
    fireEvent.click(
      within(reporterCard as HTMLElement).getByRole('button', {
        name: '取消本局重点'
      })
    );
    expect(onPriorityChange).toHaveBeenCalledWith({
      kind: 'character',
      assetId: 'character-reporter',
      prioritized: false
    });
    expect(
      await screen.findByText(/已取消“独立记者”的本局重点/)
    ).toBeInTheDocument();

    fireEvent.click(
      within(reporterCard as HTMLElement).getByRole('button', {
        name: '暂停主动推进'
      })
    );
    expect(onPausedChange).toHaveBeenCalledWith({
      kind: 'character',
      assetId: 'character-reporter',
      paused: true
    });
  });

  it('enforces the three-item priority limit without changing frozen revisions', () => {
    const revisions = [
      character('character-one', '人物一'),
      character('character-two', '人物二'),
      character('character-three', '人物三'),
      character('character-four', '人物四')
    ];
    let state = createInitialRuntimeState();
    state = bindCharacter(state, revisions[0]);
    state = bindCharacter(state, revisions[1]);
    state = bindCharacter(state, revisions[2]);
    state = setCustomContentPriorityInState({
      state,
      kind: 'character',
      assetId: revisions[2].characterAssetId,
      prioritized: false,
      now: '2026-07-27T10:02:00.000Z'
    });
    state = bindCharacter(state, revisions[3]);
    const onPriorityChange = vi.fn(async () => undefined);

    render(
      <CurrentSaveCustomContentSettingsPanel
        runtimeState={state}
        onPriorityChange={onPriorityChange}
        onPausedChange={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByLabelText('本局重点 3 / 3')).toBeInTheDocument();
    const naturalCard = screen.getByText('人物三').closest('article');
    const setPriorityButton = within(
      naturalCard as HTMLElement
    ).getByRole('button', { name: '设为本局重点' });
    expect(setPriorityButton).toBeDisabled();
    expect(
      within(naturalCard as HTMLElement).getByText('revision 1')
    ).toBeInTheDocument();
    expect(onPriorityChange).not.toHaveBeenCalled();
  });

  it('shows durable event stage, node and fact-state progress in the reachable game settings', () => {
    const state = bindEvent(createInitialRuntimeState());
    const instance = state.customContent!.eventInstances[0];
    instance.status = 'active';
    instance.currentStageId = 'stage-investigation';
    instance.usedStageIds = ['stage-discovery'];
    instance.usedNodeIds = ['node-find-ledger'];
    instance.factStateOverrides = {
      'fact-ledger': 'established_in_save',
      'fact-first-suspect': 'invalidated_in_save'
    };
    instance.resultingWritebackRefs = [
      { kind: 'current_matter', id: 'matter-ledger' }
    ];

    render(
      <CurrentSaveCustomContentSettingsPanel
        runtimeState={state}
        onPriorityChange={vi.fn(async () => undefined)}
        onPausedChange={vi.fn(async () => undefined)}
      />
    );

    const eventCard = screen.getByText('夜班疑云事件').closest('article');
    expect(eventCard).not.toBeNull();
    expect(
      within(eventCard as HTMLElement).getByText('追查来源')
    ).toBeInTheDocument();
    expect(
      within(eventCard as HTMLElement).getByText(
        '1 / 2 阶段 · 已采用 1 个节点'
      )
    ).toBeInTheDocument();
    expect(
      within(eventCard as HTMLElement).getByText('已成立 1 · 已失效 1')
    ).toBeInTheDocument();
  });

  it('does not offer entry controls after the initial appearance target is complete', () => {
    const revision = character('character-met', '已经见面的人物');
    const state = bindCharacter(createInitialRuntimeState(), revision);
    state.customContent!.characterEntryIntents[0].status = 'met';
    state.customContent!.priorityItems[0].status = 'completed';
    state.customContent!.characterRuntimeBindings.push({
      characterAssetId: revision.characterAssetId,
      sourceRevision: revision.revision,
      adaptationId: Object.keys(state.customContent!.characterAdaptations)[0],
      actorId: 'custom-actor:character-met'
    });

    render(
      <CurrentSaveCustomContentSettingsPanel
        runtimeState={state}
        onPriorityChange={vi.fn(async () => undefined)}
        onPausedChange={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByText('已经正式登场')).toBeInTheDocument();
    expect(screen.getByText('已经形成')).toBeInTheDocument();
    expect(
      screen.getByText(/初次登场目标已经完成/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '设为本局重点' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '暂停主动推进' })
    ).not.toBeInTheDocument();
  });
});
