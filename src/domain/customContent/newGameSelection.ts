import type { NarratorClient } from '../narrator/NarratorClient';
import type { RuntimeState } from '../runtime/types';
import type { DramaSourceRef } from '../drama/types';
import type { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import {
  createCustomContentRevisionRef,
  isCustomAssetEligibleForNewGame
} from './assetFoundation';
import type {
  CustomContentDependency,
  CustomContentProjectRevision,
  CustomContentRevisionRef,
  CustomEventGroupRevision
} from './assetTypes';
import {
  approveCustomContentAdaptationInState,
  bindCustomCharacterToState,
  bindCustomEventGroupToState,
  setCustomContentPriorityInState
} from './saveBinding';
import {
  resolveCustomContentWorldDeployment,
  type CustomContentWorldDeployment,
  type CustomContentWorldDeploymentMode
} from './worldAdaptation';

export const MAX_NEW_GAME_CUSTOM_CONTENT_SELECTIONS = 20;
export const MAX_NEW_GAME_CUSTOM_CONTENT_PRIORITIES = 3;

export type NewGameCustomContentKind =
  | 'character'
  | 'event_group'
  | 'content_project';

export interface NewGameCustomContentSelection {
  selectionKey: string;
  kind: NewGameCustomContentKind;
  assetId: string;
  revision: number;
  prioritized?: boolean;
  projectRevision?: number;
  focusEventGroupId?: string;
  focusEventGroupRevision?: number;
}

export interface NewGameCustomContentOption {
  selection: NewGameCustomContentSelection;
  title: string;
  summary: string;
  projectTitle?: string;
  focusTitle?: string;
  deploymentMode: Exclude<CustomContentWorldDeploymentMode, 'disabled'>;
  defaultEnabledForNewGame: boolean;
}

export interface NewGameCustomContentLibrary {
  characters: NewGameCustomContentOption[];
  events: NewGameCustomContentOption[];
  projects: NewGameCustomContentOption[];
}

export interface NewGameCustomContentReviewItem {
  selectionKey: string;
  kind: Extract<NewGameCustomContentKind, 'character' | 'event_group'>;
  assetId: string;
  title: string;
  status: 'needs_review' | 'incompatible';
  summaryLines: string[];
}

export interface PreparedNewGameCustomContent {
  state: RuntimeState;
  reviewItems: NewGameCustomContentReviewItem[];
}

interface ProjectDetails {
  revision: CustomContentProjectRevision;
  dependencies: CustomContentDependency[];
  eventGroups: Map<string, CustomEventGroupRevision>;
}

function byTitle(
  left: NewGameCustomContentOption,
  right: NewGameCustomContentOption
): number {
  return left.title.localeCompare(right.title, 'zh-CN');
}

export function createNewGameCustomContentSelectionKey(
  selection: Omit<NewGameCustomContentSelection, 'selectionKey'>
): string {
  const focus =
    selection.kind === 'content_project'
      ? `:${selection.focusEventGroupId ?? ''}:${selection.focusEventGroupRevision ?? ''}`
      : '';
  return `${selection.kind}:${selection.assetId}:${selection.revision}${focus}`;
}

function selection(
  input: Omit<NewGameCustomContentSelection, 'selectionKey'>
): NewGameCustomContentSelection {
  return {
    ...input,
    selectionKey: createNewGameCustomContentSelectionKey(input)
  };
}

function effectiveEventDeployments({
  project,
  eventGroup
}: {
  project: CustomContentProjectRevision;
  eventGroup: CustomEventGroupRevision;
}): CustomContentWorldDeployment[] {
  return eventGroup.inheritProjectDeployments
    ? project.deployments
    : (eventGroup.deployments ?? []);
}

function allowedDeployment(
  deployments: readonly CustomContentWorldDeployment[],
  worldpackId: string
): {
  mode: Exclude<CustomContentWorldDeploymentMode, 'disabled'>;
  defaultEnabledForNewGame: boolean;
} | null {
  const deployment = resolveCustomContentWorldDeployment(
    deployments,
    worldpackId
  );
  return deployment.mode === 'disabled'
    ? null
    : {
        mode: deployment.mode,
        defaultEnabledForNewGame: deployment.defaultEnabledForNewGame
      };
}

function eventDependency(
  details: ProjectDetails,
  eventGroupId: string
): CustomContentRevisionRef | undefined {
  return details.dependencies
    .map((dependency) => dependency.target)
    .find(
      (target) =>
        target.assetKind === 'event_group' &&
        target.assetId === eventGroupId
    );
}

async function loadProjectDetails(
  repository: IndexedDbCustomContentRepository
): Promise<Map<string, ProjectDetails>> {
  const assets = await repository.listProjectAssets();
  const entries = await Promise.all(
    assets.map(async (asset) => {
      const revision = await repository.getProjectRevision(
        asset.projectId,
        asset.latestRevision
      );
      if (!revision || !isCustomAssetEligibleForNewGame(revision.lifecycle)) {
        return null;
      }
      const dependencies = await repository.listDependenciesForOwner(
        createCustomContentRevisionRef(revision)
      );
      const eventRefs = dependencies
        .map((dependency) => dependency.target)
        .filter(
          (
            target
          ): target is CustomContentRevisionRef & {
            assetKind: 'event_group';
          } => target.assetKind === 'event_group'
        );
      const eventGroups = new Map<string, CustomEventGroupRevision>();
      for (const ref of eventRefs) {
        const eventGroup = await repository.getEventGroupRevision(
          ref.assetId,
          ref.revision
        );
        if (
          eventGroup &&
          eventGroup.checksum === ref.checksum &&
          isCustomAssetEligibleForNewGame(eventGroup.lifecycle)
        ) {
          eventGroups.set(eventGroup.eventGroupId, eventGroup);
        }
      }
      return [
        revision.projectId,
        {
          revision,
          dependencies,
          eventGroups
        }
      ] as const;
    })
  );
  return new Map(
    entries.filter(
      (entry): entry is NonNullable<(typeof entries)[number]> => entry !== null
    )
  );
}

export async function loadNewGameCustomContentLibrary({
  repository,
  worldpackId
}: {
  repository: IndexedDbCustomContentRepository;
  worldpackId: string;
}): Promise<NewGameCustomContentLibrary> {
  const [characterAssets, projectDetails] = await Promise.all([
    repository.listGlobalCharacterAssets(),
    loadProjectDetails(repository)
  ]);

  const characters: NewGameCustomContentOption[] = (
    await Promise.all(
      characterAssets.map(async (asset) => {
        const revision = await repository.getCharacterRevision(
          asset.characterAssetId,
          asset.latestRevision
        );
        if (
          !revision ||
          !isCustomAssetEligibleForNewGame(revision.lifecycle)
        ) {
          return null;
        }
        const deployment = allowedDeployment(
          revision.deployments,
          worldpackId
        );
        if (!deployment) return null;
        return {
          selection: selection({
            kind: 'character',
            assetId: revision.characterAssetId,
            revision: revision.revision
          }),
          title: revision.displayName,
          summary: revision.profileSummary,
          deploymentMode: deployment.mode,
          defaultEnabledForNewGame: deployment.defaultEnabledForNewGame
        } satisfies NewGameCustomContentOption;
      })
    )
  ).filter(
    (option): option is NewGameCustomContentOption => option !== null
  );

  const events: NewGameCustomContentOption[] = [];
  const projects: NewGameCustomContentOption[] = [];
  for (const details of projectDetails.values()) {
    const projectDeployment = allowedDeployment(
      details.revision.deployments,
      worldpackId
    );
    if (!projectDeployment) continue;

    const eligibleEvents = details.revision.eventGroupIds.flatMap(
      (eventGroupId) => {
        const eventGroup = details.eventGroups.get(eventGroupId);
        const ref = eventDependency(details, eventGroupId);
        if (!eventGroup || !ref) return [];
        const deployment = allowedDeployment(
          effectiveEventDeployments({
            project: details.revision,
            eventGroup
          }),
          worldpackId
        );
        return deployment ? [{ eventGroup, ref, deployment }] : [];
      }
    );

    for (const { eventGroup, ref, deployment } of eligibleEvents) {
      events.push({
        selection: selection({
          kind: 'event_group',
          assetId: eventGroup.eventGroupId,
          revision: ref.revision,
          projectRevision: details.revision.revision
        }),
        title: eventGroup.title,
        summary: eventGroup.summary,
        projectTitle: details.revision.title,
        deploymentMode: deployment.mode,
        defaultEnabledForNewGame:
          projectDeployment.defaultEnabledForNewGame &&
          deployment.defaultEnabledForNewGame
      });
    }

    const focus = eligibleEvents[0];
    if (focus) {
      projects.push({
        selection: selection({
          kind: 'content_project',
          assetId: details.revision.projectId,
          revision: details.revision.revision,
          focusEventGroupId: focus.eventGroup.eventGroupId,
          focusEventGroupRevision: focus.ref.revision
        }),
        title: details.revision.title,
        summary: details.revision.summary,
        focusTitle: focus.eventGroup.title,
        deploymentMode: projectDeployment.mode,
        defaultEnabledForNewGame:
          projectDeployment.defaultEnabledForNewGame &&
          focus.deployment.defaultEnabledForNewGame
      });
    }
  }

  return {
    characters: characters.sort(byTitle),
    events: events.sort(byTitle),
    projects: projects.sort(byTitle)
  };
}

function effectiveTarget(selection: NewGameCustomContentSelection): {
  kind: 'character' | 'event_group';
  assetId: string;
  revision: number;
  projectRevision?: number;
} {
  if (selection.kind === 'character') {
    return {
      kind: 'character',
      assetId: selection.assetId,
      revision: selection.revision
    };
  }
  if (selection.kind === 'event_group') {
    return {
      kind: 'event_group',
      assetId: selection.assetId,
      revision: selection.revision,
      projectRevision: selection.projectRevision
    };
  }
  if (
    !selection.focusEventGroupId ||
    !selection.focusEventGroupRevision
  ) {
    throw new Error('内容项目没有可绑定的当前焦点事件组。');
  }
  return {
    kind: 'event_group',
    assetId: selection.focusEventGroupId,
    revision: selection.focusEventGroupRevision,
    projectRevision: selection.revision
  };
}

function effectiveTargetKey(selection: NewGameCustomContentSelection): string {
  const target = effectiveTarget(selection);
  return `${target.kind}:${target.assetId}:${target.revision}`;
}

function markSelectionSeekingAnchor({
  state,
  selection
}: {
  state: RuntimeState;
  selection: NewGameCustomContentSelection;
}): RuntimeState {
  const target = effectiveTarget(selection);
  const customContent = state.customContent;
  if (!customContent) return state;
  if (target.kind === 'character') {
    const binding = customContent.characterBindings.find(
      (item) => item.assetId === target.assetId
    );
    const adaptation = Object.values(customContent.characterAdaptations).find(
      (item) =>
        item.characterAssetId === target.assetId &&
        item.sourceRevision === binding?.revision
    );
    if (!binding || adaptation?.status !== 'ready') return state;
    return {
      ...state,
      customContent: {
        ...customContent,
        characterEntryIntents: customContent.characterEntryIntents.map(
          (intent) =>
            intent.bindingId === binding.bindingId
              ? { ...intent, status: 'seeking_anchor' }
              : intent
        )
      }
    };
  }

  const instance = customContent.eventInstances.find(
    (item) =>
      item.eventGroupId === target.assetId &&
      item.eventGroupRevision === target.revision
  );
  const adaptation = Object.values(customContent.eventGroupAdaptations).find(
    (item) =>
      item.eventGroupId === target.assetId &&
      item.sourceRevision === target.revision
  );
  if (!instance || adaptation?.status !== 'ready') return state;
  return {
    ...state,
    customContent: {
      ...customContent,
      eventEntryIntents: customContent.eventEntryIntents.map((intent) =>
        intent.instanceId === instance.instanceId
          ? { ...intent, status: 'seeking_anchor' }
          : intent
      ),
      eventInstances: customContent.eventInstances.map((item) =>
        item.instanceId === instance.instanceId
          ? { ...item, status: 'seeking_anchor' }
          : item
      )
    }
  };
}

function sourceRefForSelection(
  state: RuntimeState,
  selection: NewGameCustomContentSelection
): DramaSourceRef | undefined {
  const target = effectiveTarget(selection);
  const customContent = state.customContent;
  if (!customContent) return undefined;
  if (target.kind === 'character') {
    const binding = customContent.characterBindings.find(
      (item) => item.assetId === target.assetId
    );
    return binding
      ? {
          providerId: 'custom-character',
          sourceType: 'custom_character_binding',
          sourceId: binding.bindingId
        }
      : undefined;
  }
  const instance = customContent.eventInstances.find(
    (item) =>
      item.eventGroupId === target.assetId &&
      item.eventGroupRevision === target.revision
  );
  return instance
    ? {
        providerId: 'custom-event-group',
        sourceType: 'custom_event_group_instance',
        sourceId: instance.instanceId
      }
    : undefined;
}

function reviewItemForSelection(
  state: RuntimeState,
  selection: NewGameCustomContentSelection
): NewGameCustomContentReviewItem | undefined {
  const target = effectiveTarget(selection);
  const customContent = state.customContent;
  if (!customContent) return undefined;
  if (target.kind === 'character') {
    const binding = customContent.characterBindings.find(
      (item) => item.assetId === target.assetId
    );
    const adaptation = Object.values(customContent.characterAdaptations).find(
      (item) =>
        item.characterAssetId === target.assetId &&
        item.sourceRevision === binding?.revision
    );
    if (!binding || !adaptation || adaptation.status === 'ready') {
      return undefined;
    }
    return {
      selectionKey: selection.selectionKey,
      kind: 'character',
      assetId: target.assetId,
      title: binding.payload.displayName,
      status: adaptation.status,
      summaryLines: [
        adaptation.adaptedPublicIdentity,
        adaptation.adaptedOccupation,
        adaptation.adaptedBackgroundSummary,
        ...adaptation.adaptedContactRoutes
      ].filter(Boolean)
    };
  }

  const binding = customContent.eventGroupBindings.find(
    (item) =>
      item.assetId === target.assetId && item.revision === target.revision
  );
  const adaptation = Object.values(customContent.eventGroupAdaptations).find(
    (item) =>
      item.eventGroupId === target.assetId &&
      item.sourceRevision === target.revision
  );
  if (!binding || !adaptation || adaptation.status === 'ready') {
    return undefined;
  }
  return {
    selectionKey: selection.selectionKey,
    kind: 'event_group',
    assetId: target.assetId,
    title: binding.payload.title,
    status: adaptation.status,
    summaryLines: [
      adaptation.adaptedSummary,
      ...adaptation.adaptedEntryRoutes,
      ...adaptation.unresolvedConflicts.map((item) => `待确认：${item}`)
    ].filter(Boolean)
  };
}

function setOpeningSupportSource({
  state,
  selections,
  openingSupportSelectionKey
}: {
  state: RuntimeState;
  selections: readonly NewGameCustomContentSelection[];
  openingSupportSelectionKey?: string;
}): RuntimeState {
  if (!openingSupportSelectionKey || !state.world.dramaticOpeningId) {
    return {
      ...state,
      dramaticContent: {
        ...(state.dramaticContent ?? {
          instances: [],
          recentDiagnostics: []
        }),
        openingSupportSourceRef: undefined
      }
    };
  }
  const selected = selections.find(
    (item) => item.selectionKey === openingSupportSelectionKey
  );
  if (!selected) {
    throw new Error('第一幕支持内容必须来自本局已经明确选择的自定义内容。');
  }
  if (selected.prioritized === false) {
    throw new Error('第一幕支持内容必须同时设为本局重点。');
  }
  const ref = sourceRefForSelection(state, selected);
  if (!ref) {
    throw new Error('第一幕支持内容没有形成可校验的 Runtime 来源引用。');
  }
  return {
    ...state,
    dramaticContent: {
      ...(state.dramaticContent ?? {
        instances: [],
        recentDiagnostics: []
      }),
      openingSupportSourceRef: ref
    }
  };
}

export async function prepareNewGameCustomContent({
  repository,
  state,
  selections,
  openingSupportSelectionKey,
  client,
  now = new Date().toISOString()
}: {
  repository: IndexedDbCustomContentRepository;
  state: RuntimeState;
  selections: readonly NewGameCustomContentSelection[];
  openingSupportSelectionKey?: string;
  client?: NarratorClient;
  now?: string;
}): Promise<PreparedNewGameCustomContent> {
  if (selections.length > MAX_NEW_GAME_CUSTOM_CONTENT_SELECTIONS) {
    throw new Error(
      `新游戏最多启用 ${MAX_NEW_GAME_CUSTOM_CONTENT_SELECTIONS} 项本局自定义内容。`
    );
  }
  const priorityCount = selections.filter(
    (selection) => selection.prioritized !== false
  ).length;
  if (priorityCount > MAX_NEW_GAME_CUSTOM_CONTENT_PRIORITIES) {
    throw new Error(
      `新游戏最多设置 ${MAX_NEW_GAME_CUSTOM_CONTENT_PRIORITIES} 项本局重点内容。`
    );
  }
  const selectionKeys = new Set<string>();
  const targetKeys = new Set<string>();
  for (const item of selections) {
    const expectedKey = createNewGameCustomContentSelectionKey(item);
    if (item.selectionKey !== expectedKey || selectionKeys.has(item.selectionKey)) {
      throw new Error('本局自定义内容选择标识无效或重复。');
    }
    const targetKey = effectiveTargetKey(item);
    if (targetKeys.has(targetKey)) {
      throw new Error('同一个事件不能同时通过事件组和内容项目重复选择。');
    }
    selectionKeys.add(item.selectionKey);
    targetKeys.add(targetKey);
  }

  let preparedState = state;
  const bindingSelections = [
    ...selections.filter((item) => effectiveTarget(item).kind === 'event_group'),
    ...selections.filter((item) => effectiveTarget(item).kind === 'character')
  ];
  for (const item of bindingSelections) {
    const target = effectiveTarget(item);
    const prioritized = item.prioritized !== false;
    preparedState =
      target.kind === 'character'
        ? await bindCustomCharacterToState({
            contentRepository: repository,
            state: preparedState,
            characterAssetId: target.assetId,
            revision: target.revision,
            reuseExistingRevision: true,
            prioritized,
            client,
            now
          })
        : await bindCustomEventGroupToState({
            contentRepository: repository,
            state: preparedState,
            eventGroupId: target.assetId,
            eventGroupRevision: target.revision,
            projectRevision: target.projectRevision,
            prioritized,
            client,
            now
          });
    if (prioritized) {
      preparedState = markSelectionSeekingAnchor({
        state: preparedState,
        selection: item
      });
    }
  }
  preparedState = setOpeningSupportSource({
    state: preparedState,
    selections,
    openingSupportSelectionKey
  });

  const reviewItems = selections.flatMap((item) => {
    const review = reviewItemForSelection(preparedState, item);
    return review ? [review] : [];
  });
  const incompatible = reviewItems.filter(
    (item) => item.status === 'incompatible'
  );
  if (incompatible.length > 0) {
    throw new Error(
      `以下自定义内容与当前世界包不兼容：${incompatible
        .map((item) => item.title)
        .join('、')}`
    );
  }
  return { state: preparedState, reviewItems };
}

export function approvePreparedNewGameCustomContent({
  state,
  selections,
  now = new Date().toISOString()
}: {
  state: RuntimeState;
  selections: readonly NewGameCustomContentSelection[];
  now?: string;
}): RuntimeState {
  let approvedState = state;
  const approvedTargets = new Set<string>();
  for (const item of selections) {
    const target = effectiveTarget(item);
    const targetKey = effectiveTargetKey(item);
    if (approvedTargets.has(targetKey)) continue;
    const review = reviewItemForSelection(approvedState, item);
    if (review?.status === 'needs_review') {
      approvedState = approveCustomContentAdaptationInState({
        state: approvedState,
        kind: target.kind,
        assetId: target.assetId,
        now
      });
    }
    if (item.prioritized === true) {
      approvedState = setCustomContentPriorityInState({
        state: approvedState,
        kind: target.kind,
        assetId: target.assetId,
        prioritized: true,
        now
      });
    }
    if (item.prioritized !== false) {
      approvedState = markSelectionSeekingAnchor({
        state: approvedState,
        selection: item
      });
    }
    approvedTargets.add(targetKey);
  }
  return approvedState;
}
