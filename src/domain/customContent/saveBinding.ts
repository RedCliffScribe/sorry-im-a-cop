import type { NarratorClient } from '../narrator/NarratorClient';
import type { RuntimeSaveRecord, SaveRepository } from '../persistence/SaveRepository';
import type { RuntimeState } from '../runtime/types';
import {
  getWorldpackAdaptationDescriptor,
  type WorldpackAdaptationDescriptor
} from '../worldpack/adaptationRegistry';
import type { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import {
  createCustomContentRevisionRef,
  isCustomAssetEligibleForNewGame
} from './assetFoundation';
import type {
  CustomCharacterRevision,
  CustomContentProjectRevision,
  CustomContentRevision,
  CustomContentRevisionRef,
  CustomEventGroupRevision
} from './assetTypes';
import {
  createIncompatibleCustomSaveAdaptationBundle,
  createNativeCustomSaveAdaptationBundle,
  generateCustomSaveAdaptationBundle,
  type CustomSaveAdaptationSource
} from './saveAdaptation';
import type {
  BoundCustomRevisionSnapshot,
  CustomCharacterEntryIntent,
  CustomCharacterAdaptationIntent,
  CustomCharacterSaveAdaptation,
  CustomContentDiagnostic,
  CustomContentPriorityItem,
  CustomEventEntryIntent,
  CustomEventGroupInstance,
  CustomEventGroupSaveAdaptation,
  CustomProjectSaveAdaptation,
  CustomSaveAdaptationBundle,
  RuntimeCustomContentState
} from './saveTypes';
import {
  collectCustomEventStageCharacterAssetIds,
  resolveCustomEventCurrentStage
} from './lazyCharacterAdaptation';
import {
  resolveCustomContentWorldDeployment,
  type CustomContentWorldDeploymentMode
} from './worldAdaptation';

const MAX_CUSTOM_CONTENT_PRIORITY_ITEMS = 3;

interface LoadedCharacterBindingSource {
  character: CustomCharacterRevision;
  deploymentMode: CustomContentWorldDeploymentMode;
}

interface LoadedEventBindingSource {
  project: CustomContentProjectRevision;
  characters: CustomCharacterRevision[];
  eventGroup: CustomEventGroupRevision;
  deploymentMode: CustomContentWorldDeploymentMode;
}

export function createEmptyRuntimeCustomContentState(): RuntimeCustomContentState {
  return {
    schemaVersion: 1,
    projectBindings: [],
    characterBindings: [],
    eventGroupBindings: [],
    projectAdaptations: {},
    characterAdaptations: {},
    characterAdaptationIntents: [],
    eventGroupAdaptations: {},
    characterEntryIntents: [],
    eventEntryIntents: [],
    characterRuntimeBindings: [],
    eventInstances: [],
    priorityItems: [],
    recentDiagnostics: []
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapshotBindingId(
  kind: 'content_project' | 'character' | 'event_group',
  assetId: string,
  revision: number,
  checksum: string
): string {
  return `binding:${kind}:${assetId}:${revision}:${checksum}`;
}

function revisionSnapshot<T extends CustomContentRevision>(
  revision: T
): BoundCustomRevisionSnapshot<T> {
  if ('characterAssetId' in revision) {
    return {
      bindingId: snapshotBindingId(
        'character',
        revision.characterAssetId,
        revision.revision,
        revision.checksum
      ),
      assetKind: 'character',
      assetId: revision.characterAssetId,
      revision: revision.revision,
      checksum: revision.checksum,
      payload: cloneJson(revision)
    };
  }
  if ('eventGroupId' in revision) {
    return {
      bindingId: snapshotBindingId(
        'event_group',
        revision.eventGroupId,
        revision.revision,
        revision.checksum
      ),
      assetKind: 'event_group',
      assetId: revision.eventGroupId,
      revision: revision.revision,
      checksum: revision.checksum,
      payload: cloneJson(revision)
    };
  }
  return {
    bindingId: snapshotBindingId(
      'content_project',
      revision.projectId,
      revision.revision,
      revision.checksum
    ),
    assetKind: 'content_project',
    assetId: revision.projectId,
    revision: revision.revision,
    checksum: revision.checksum,
    payload: cloneJson(revision)
  };
}

function currentCustomContent(state: RuntimeState): RuntimeCustomContentState {
  if (!state.customContent) return createEmptyRuntimeCustomContentState();
  const current = cloneJson(state.customContent);
  return {
    ...current,
    characterAdaptationIntents:
      current.characterAdaptationIntents ?? []
  };
}

function requirePublishedRevision(
  label: string,
  revision: CustomContentRevision
): void {
  if (!isCustomAssetEligibleForNewGame(revision.lifecycle)) {
    throw new Error(`${label}必须已审核、已启用并完成生成后才能加入存档。`);
  }
}

function requireMatchingRevision(
  ref: CustomContentRevisionRef,
  revision: CustomContentRevision
): void {
  const actual = createCustomContentRevisionRef(revision);
  if (
    ref.assetKind !== actual.assetKind ||
    ref.assetId !== actual.assetId ||
    ref.revision !== actual.revision ||
    ref.checksum !== actual.checksum
  ) {
    throw new Error(`依赖 revision 校验失败：${ref.assetId}`);
  }
}

async function loadRevisionByRef(
  repository: IndexedDbCustomContentRepository,
  ref: CustomContentRevisionRef
): Promise<CustomContentRevision> {
  const revision =
    ref.assetKind === 'character'
      ? await repository.getCharacterRevision(ref.assetId, ref.revision)
      : ref.assetKind === 'event_group'
        ? await repository.getEventGroupRevision(ref.assetId, ref.revision)
        : await repository.getProjectRevision(ref.assetId, ref.revision);
  if (!revision) {
    throw new Error(`找不到依赖 revision：${ref.assetId} / ${ref.revision}`);
  }
  requireMatchingRevision(ref, revision);
  return revision;
}

async function loadCharacterBindingSource({
  repository,
  characterAssetId,
  revision
}: {
  repository: IndexedDbCustomContentRepository;
  characterAssetId: string;
  revision?: number;
}): Promise<LoadedCharacterBindingSource> {
  const asset = await repository.getCharacterAsset(characterAssetId);
  if (!asset) throw new Error('找不到人物资产。');
  if (!asset.global) {
    throw new Error('项目人物只能随所属事件组加入存档。');
  }
  const character = await repository.getCharacterRevision(
    characterAssetId,
    revision ?? asset.latestRevision
  );
  if (!character) throw new Error('找不到人物 revision。');
  requirePublishedRevision('人物 revision', character);
  const deployment = resolveCustomContentWorldDeployment(
    character.deployments,
    ''
  );
  return {
    character,
    deploymentMode: deployment.mode
  };
}

function effectiveEventDeployments({
  project,
  eventGroup
}: {
  project: CustomContentProjectRevision;
  eventGroup: CustomEventGroupRevision;
}): CustomContentProjectRevision['deployments'] {
  return eventGroup.inheritProjectDeployments
    ? project.deployments
    : (eventGroup.deployments ?? []);
}

async function loadEventBindingSource({
  repository,
  eventGroupId,
  eventGroupRevision,
  projectRevision
}: {
  repository: IndexedDbCustomContentRepository;
  eventGroupId: string;
  eventGroupRevision?: number;
  projectRevision?: number;
}): Promise<LoadedEventBindingSource> {
  const eventAsset = await repository.getEventGroupAsset(eventGroupId);
  if (!eventAsset) throw new Error('找不到事件组资产。');
  const projectAsset = await repository.getProjectAsset(eventAsset.projectId);
  if (!projectAsset) throw new Error('找不到事件组所属项目。');
  const project = await repository.getProjectRevision(
    projectAsset.projectId,
    projectRevision ?? projectAsset.latestRevision
  );
  if (!project) throw new Error('找不到项目 revision。');
  requirePublishedRevision('项目 revision', project);

  const dependencies = await repository.listDependenciesForOwner(
    createCustomContentRevisionRef(project)
  );
  const eventRef = dependencies
    .map((dependency) => dependency.target)
    .find(
      (target) =>
        target.assetKind === 'event_group' &&
        target.assetId === eventGroupId &&
        (eventGroupRevision === undefined ||
          target.revision === eventGroupRevision)
    );
  if (!eventRef) {
    throw new Error('所选事件组 revision 不属于该项目 revision。');
  }
  const eventGroup = await loadRevisionByRef(repository, eventRef);
  if (!('eventGroupId' in eventGroup)) {
    throw new Error('项目依赖中的事件组类型无效。');
  }
  requirePublishedRevision('事件组 revision', eventGroup);

  const dependencyCharacterKeys = new Set(
    dependencies
      .map((dependency) => dependency.target)
      .filter((target) => target.assetKind === 'character')
      .map(
        (target) =>
          `${target.assetId}:${target.revision}:${target.checksum}`
      )
  );
  const characterRefs = eventGroup.characterRefs;
  const characters: CustomCharacterRevision[] = [];
  for (const ref of characterRefs) {
    if (
      !dependencyCharacterKeys.has(
        `${ref.assetId}:${ref.revision}:${ref.checksum}`
      )
    ) {
      throw new Error(`事件组人物不属于项目 revision：${ref.assetId}`);
    }
    const character = await loadRevisionByRef(repository, ref);
    if (!('characterAssetId' in character)) {
      throw new Error('项目依赖中的人物类型无效。');
    }
    requirePublishedRevision('项目人物 revision', character);
    characters.push(character);
  }

  return {
    project,
    characters,
    eventGroup,
    deploymentMode: resolveCustomContentWorldDeployment(
      effectiveEventDeployments({ project, eventGroup }),
      ''
    ).mode
  };
}

function withWorldpackDeploymentMode(
  loaded: LoadedCharacterBindingSource,
  worldpackId: string
): LoadedCharacterBindingSource;
function withWorldpackDeploymentMode(
  loaded: LoadedEventBindingSource,
  worldpackId: string
): LoadedEventBindingSource;
function withWorldpackDeploymentMode(
  loaded: LoadedCharacterBindingSource | LoadedEventBindingSource,
  worldpackId: string
): LoadedCharacterBindingSource | LoadedEventBindingSource {
  if ('character' in loaded) {
    return {
      ...loaded,
      deploymentMode: resolveCustomContentWorldDeployment(
        loaded.character.deployments,
        worldpackId
      ).mode
    };
  }
  return {
    ...loaded,
    deploymentMode: resolveCustomContentWorldDeployment(
      effectiveEventDeployments(loaded),
      worldpackId
    ).mode
  };
}

async function createAdaptationBundle({
  state,
  source,
  deploymentMode,
  client,
  createdAt
}: {
  state: RuntimeState;
  source: CustomSaveAdaptationSource;
  deploymentMode: CustomContentWorldDeploymentMode;
  client?: NarratorClient;
  createdAt: string;
}): Promise<CustomSaveAdaptationBundle> {
  if (deploymentMode === 'disabled') {
    throw new Error('该 revision 没有投放到当前存档的世界包。');
  }
  const descriptor = getWorldpackAdaptationDescriptor(
    state.world.worldpackId
  );
  if (!descriptor) {
    return createIncompatibleCustomSaveAdaptationBundle({
      state,
      source,
      reason: `当前世界包 ${state.world.worldpackId} 尚无自定义内容适配描述符。`,
      createdAt
    });
  }
  if (deploymentMode === 'native') {
    return createNativeCustomSaveAdaptationBundle({
      state,
      descriptor,
      source,
      createdAt
    });
  }
  if (!client) {
    throw new Error('AI 适配内容需要已配置的生成接口和模型。');
  }
  return generateCustomSaveAdaptationBundle({
    client,
    state,
    descriptor,
    source,
    createdAt
  });
}

function activePriorityCount(customContent: RuntimeCustomContentState): number {
  return customContent.priorityItems.filter(
    (item) => item.status === 'active'
  ).length;
}

function requirePriorityCapacity(customContent: RuntimeCustomContentState): void {
  if (activePriorityCount(customContent) >= MAX_CUSTOM_CONTENT_PRIORITY_ITEMS) {
    throw new Error('当前存档最多只能有 3 项本局重点内容。');
  }
}

function priorityItem({
  kind,
  targetId,
  projectId,
  now
}: {
  kind: 'character' | 'event_group';
  targetId: string;
  projectId?: string;
  now: string;
}): CustomContentPriorityItem {
  return {
    priorityItemId: `priority:${kind}:${targetId}`,
    targetKind: kind,
    targetId,
    projectId,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
}

function appendDiagnostics(
  existing: CustomContentDiagnostic[],
  additions: CustomContentDiagnostic[]
): CustomContentDiagnostic[] {
  return [...existing, ...additions].slice(-50);
}

function adaptationReady(
  adaptation:
    | CustomProjectSaveAdaptation
    | CustomCharacterSaveAdaptation
    | CustomEventGroupSaveAdaptation
    | undefined
): boolean {
  return adaptation?.status === 'ready';
}

function adaptationByCharacter(
  customContent: RuntimeCustomContentState,
  characterAssetId: string,
  revision: number
): CustomCharacterSaveAdaptation | undefined {
  return Object.values(customContent.characterAdaptations).find(
    (adaptation) =>
      adaptation.characterAssetId === characterAssetId &&
      adaptation.sourceRevision === revision
  );
}

function adaptationByEvent(
  customContent: RuntimeCustomContentState,
  eventGroupId: string,
  revision: number
): CustomEventGroupSaveAdaptation | undefined {
  return Object.values(customContent.eventGroupAdaptations).find(
    (adaptation) =>
      adaptation.eventGroupId === eventGroupId &&
      adaptation.sourceRevision === revision
  );
}

function addPriorityOrders(
  customContent: RuntimeCustomContentState
): RuntimeCustomContentState {
  const activeItems = customContent.priorityItems.filter(
    (item) => item.status === 'active'
  );
  const orderByTargetId = new Map(
    activeItems.map((item, index) => [item.targetId, index + 1])
  );
  return {
    ...customContent,
    characterEntryIntents: customContent.characterEntryIntents.map((intent) => ({
      ...intent,
      priorityOrder: orderByTargetId.get(intent.bindingId)
    })),
    eventEntryIntents: customContent.eventEntryIntents.map((intent) => ({
      ...intent,
      priorityOrder: orderByTargetId.get(intent.instanceId)
    }))
  };
}

export function bindCustomCharacterRevisionToState({
  state,
  character,
  adaptationBundle,
  allowExistingBinding = false,
  prioritized = true,
  now
}: {
  state: RuntimeState;
  character: CustomCharacterRevision;
  adaptationBundle: CustomSaveAdaptationBundle;
  allowExistingBinding?: boolean;
  prioritized?: boolean;
  now: string;
}): RuntimeState {
  let customContent = currentCustomContent(state);
  const existingBinding = customContent.characterBindings.find(
    (binding) => binding.assetId === character.characterAssetId
  );
  if (existingBinding && existingBinding.revision !== character.revision) {
    throw new Error(
      '该人物已经绑定到当前存档；全局新 revision 不会自动替换旧绑定。'
    );
  }
  if (existingBinding && !allowExistingBinding) {
    throw new Error(
      '该人物已经绑定到当前存档；全局新 revision 不会自动替换旧绑定。'
    );
  }
  const incomingAdaptation = adaptationBundle.characters.find(
    (item) =>
      item.characterAssetId === character.characterAssetId &&
      item.sourceRevision === character.revision
  );
  if (!incomingAdaptation) throw new Error('人物适配快照缺失。');
  const binding = existingBinding ?? revisionSnapshot(character);
  const adaptation = mergeCharacterAdaptation(
    adaptationByCharacter(
      customContent,
      character.characterAssetId,
      character.revision
    ),
    incomingAdaptation
  );
  const isReady = adaptationReady(adaptation);
  const existingIntent = customContent.characterEntryIntents.find(
    (item) => item.bindingId === binding.bindingId
  );
  const hasPriorityItem = customContent.priorityItems.some(
    (item) =>
      item.targetKind === 'character' &&
      item.targetId === binding.bindingId &&
      item.status === 'active'
  );
  if (prioritized && isReady && !hasPriorityItem) {
    requirePriorityCapacity(customContent);
  }

  const intent: CustomCharacterEntryIntent = {
    intentId: `intent:character:${binding.bindingId}`,
    bindingId: binding.bindingId,
    mode: prioritized ? 'asap_contact' : 'natural',
    status: isReady ? 'queued' : 'paused',
    targetOutcome: 'met'
  };
  customContent = {
    ...customContent,
    characterBindings: existingBinding
      ? customContent.characterBindings
      : [...customContent.characterBindings, binding],
    characterAdaptations: {
      ...customContent.characterAdaptations,
      [adaptation.adaptationId]: cloneJson(adaptation)
    },
    characterEntryIntents: existingIntent
      ? customContent.characterEntryIntents
      : [...customContent.characterEntryIntents, intent],
    priorityItems: prioritized && isReady && !hasPriorityItem
      ? [
          ...customContent.priorityItems,
          priorityItem({
            kind: 'character',
            targetId: binding.bindingId,
            now
          })
        ]
      : customContent.priorityItems,
    recentDiagnostics: appendDiagnostics(
      customContent.recentDiagnostics,
      adaptationBundle.diagnostics
    )
  };

  return {
    ...state,
    customContent: addPriorityOrders(customContent)
  };
}

function mergeCharacterAdaptation(
  existing: CustomCharacterSaveAdaptation | undefined,
  incoming: CustomCharacterSaveAdaptation
): CustomCharacterSaveAdaptation {
  if (!existing) return cloneJson(incoming);
  if (existing.status === 'ready') {
    return {
      ...existing,
      projectAdaptationId:
        existing.projectAdaptationId ?? incoming.projectAdaptationId
    };
  }
  return cloneJson(incoming);
}

function characterAdaptationIntent({
  binding,
  instanceId,
  reason,
  requestedStageId,
  requestedTurn,
  adaptation
}: {
  binding: BoundCustomRevisionSnapshot<CustomCharacterRevision>;
  instanceId: string;
  reason: CustomCharacterAdaptationIntent['reason'];
  requestedStageId?: string;
  requestedTurn: number;
  adaptation?: CustomCharacterSaveAdaptation;
}): CustomCharacterAdaptationIntent {
  return {
    intentId: [
      'adaptation-intent',
      instanceId,
      binding.assetId,
      binding.revision
    ].join(':'),
    bindingId: binding.bindingId,
    instanceId,
    reason,
    status: adaptation?.status ?? 'pending',
    requestedStageId,
    requestedTurn,
    adaptationId: adaptation?.adaptationId
  };
}

export function bindCustomEventProjectRevisionToState({
  state,
  project,
  characters,
  eventGroup,
  adaptationBundle,
  prioritized = true,
  now
}: {
  state: RuntimeState;
  project: CustomContentProjectRevision;
  characters: CustomCharacterRevision[];
  eventGroup: CustomEventGroupRevision;
  adaptationBundle: CustomSaveAdaptationBundle;
  prioritized?: boolean;
  now: string;
}): RuntimeState {
  let customContent = currentCustomContent(state);
  if (
    customContent.eventGroupBindings.some(
      (binding) => binding.assetId === eventGroup.eventGroupId
    )
  ) {
    throw new Error('该事件组已经绑定到当前存档；全局新 revision 不会自动替换旧绑定。');
  }
  const existingProject = customContent.projectBindings.find(
    (binding) => binding.assetId === project.projectId
  );
  if (existingProject && existingProject.revision !== project.revision) {
    throw new Error('当前存档已绑定该项目的另一 revision，不能静默切换版本。');
  }
  for (const character of characters) {
    const existing = customContent.characterBindings.find(
      (binding) => binding.assetId === character.characterAssetId
    );
    if (existing && existing.revision !== character.revision) {
      throw new Error(
        `所选事件对人物“${character.displayName}”锁定了不同 revision` +
          `（当前存档 ${existing.revision}，本事件 ${character.revision}）。` +
          '同一存档不能同时使用两个版本；请先在事件工坊把关联事件更新到同一人物 revision。'
      );
    }
  }
  if (!adaptationBundle.project || !adaptationBundle.eventGroup) {
    throw new Error('事件项目适配快照不完整。');
  }

  const projectBinding = revisionSnapshot(project);
  const eventBinding = revisionSnapshot(eventGroup);
  const characterBindings = characters.map(revisionSnapshot);
  const initialStage = resolveCustomEventCurrentStage(eventGroup);
  const initialCharacterIds = new Set(
    collectCustomEventStageCharacterAssetIds(eventGroup, initialStage)
  );
  for (const characterAssetId of initialCharacterIds) {
    if (
      !characterBindings.some(
        (binding) => binding.assetId === characterAssetId
      )
    ) {
      throw new Error(`当前阶段引用的人物 revision 缺失：${characterAssetId}`);
    }
  }
  const nextCharacterAdaptations = {
    ...customContent.characterAdaptations
  };
  for (const incoming of adaptationBundle.characters) {
    if (!initialCharacterIds.has(incoming.characterAssetId)) continue;
    const existing = adaptationByCharacter(
      customContent,
      incoming.characterAssetId,
      incoming.sourceRevision
    );
    const merged = mergeCharacterAdaptation(existing, incoming);
    nextCharacterAdaptations[merged.adaptationId] = merged;
  }
  const allAdaptationsReady =
    adaptationReady(adaptationBundle.project) &&
    adaptationReady(adaptationBundle.eventGroup) &&
    [...initialCharacterIds].every((characterAssetId) =>
      adaptationReady(
        Object.values(nextCharacterAdaptations).find(
          (adaptation) =>
            adaptation.characterAssetId === characterAssetId &&
            adaptation.sourceRevision ===
              characterBindings.find(
                (binding) => binding.assetId === characterAssetId
              )?.revision
        )
      )
    );
  if (prioritized && allAdaptationsReady) requirePriorityCapacity(customContent);

  const instanceId = `event-instance:${eventBinding.bindingId}`;
  const projectCharacterBindings = Object.fromEntries(
    [...initialCharacterIds].flatMap((characterAssetId) => {
      const character = characters.find(
        (item) => item.characterAssetId === characterAssetId
      );
      if (!character) return [];
      const adaptation = Object.values(nextCharacterAdaptations).find(
        (item) =>
          item.characterAssetId === character.characterAssetId &&
          item.sourceRevision === character.revision
      );
      return adaptation
        ? [[character.characterAssetId, adaptation.runtimeActorId] as const]
        : [];
    })
  );
  const roleBindings = Object.fromEntries(
    eventGroup.roleSlots.flatMap((slot) => {
      if (slot.bindingMode === 'current_player') {
        return [[slot.roleSlotId, state.player.actorId] as const];
      }
      const characterAssetId = slot.fixedCharacterRef?.assetId;
      if (!characterAssetId) return [];
      const actorId = projectCharacterBindings[characterAssetId];
      return actorId ? [[slot.roleSlotId, actorId]] : [];
    })
  );
  const instance: CustomEventGroupInstance = {
    instanceId,
    eventGroupId: eventGroup.eventGroupId,
    eventGroupRevision: eventGroup.revision,
    projectId: project.projectId,
    projectRevision: project.revision,
    adaptationId: adaptationBundle.eventGroup.adaptationId,
    status: 'latent',
    currentStageId: initialStage?.stageId,
    projectCharacterBindings,
    roleBindings,
    usedStageIds: [],
    usedNodeIds: [],
    factStateOverrides: {},
    progressHistory: [],
    resultingWritebackRefs: []
  };
  const intent: CustomEventEntryIntent = {
    intentId: `intent:event:${instanceId}`,
    instanceId,
    mode: prioritized ? 'asap' : 'natural',
    status: allAdaptationsReady ? 'queued' : 'paused'
  };
  const adaptationIntents = characterBindings
    .filter((binding) => initialCharacterIds.has(binding.assetId))
    .map((binding) =>
      characterAdaptationIntent({
        binding,
        instanceId,
        reason: 'current_stage',
        requestedStageId: initialStage?.stageId,
        requestedTurn: state.turnCounter,
        adaptation: adaptationByCharacter(
          {
            ...customContent,
            characterAdaptations: nextCharacterAdaptations
          },
          binding.assetId,
          binding.revision
        )
      })
    );

  customContent = {
    ...customContent,
    projectBindings: existingProject
      ? customContent.projectBindings
      : [...customContent.projectBindings, projectBinding],
    characterBindings: [
      ...customContent.characterBindings,
      ...characterBindings.filter(
        (binding) =>
          !customContent.characterBindings.some(
            (existing) => existing.assetId === binding.assetId
          )
      )
    ],
    eventGroupBindings: [
      ...customContent.eventGroupBindings,
      eventBinding
    ],
    projectAdaptations: {
      ...customContent.projectAdaptations,
      [adaptationBundle.project.adaptationId]: cloneJson(
        adaptationBundle.project
      )
    },
    characterAdaptations: nextCharacterAdaptations,
    characterAdaptationIntents: [
      ...customContent.characterAdaptationIntents,
      ...adaptationIntents.filter(
        (incoming) =>
          !customContent.characterAdaptationIntents.some(
            (existing) => existing.intentId === incoming.intentId
          )
      )
    ],
    eventGroupAdaptations: {
      ...customContent.eventGroupAdaptations,
      [adaptationBundle.eventGroup.adaptationId]: cloneJson(
        adaptationBundle.eventGroup
      )
    },
    eventEntryIntents: [...customContent.eventEntryIntents, intent],
    eventInstances: [...customContent.eventInstances, instance],
    priorityItems: prioritized && allAdaptationsReady
      ? [
          ...customContent.priorityItems,
          priorityItem({
            kind: 'event_group',
            targetId: instanceId,
            projectId: project.projectId,
            now
          })
        ]
      : customContent.priorityItems,
    recentDiagnostics: appendDiagnostics(
      customContent.recentDiagnostics,
      adaptationBundle.diagnostics
    )
  };

  return {
    ...state,
    customContent: addPriorityOrders(customContent)
  };
}

export async function adaptCustomEventCharactersInState({
  state,
  eventGroupId,
  characterAssetIds,
  client,
  now = new Date().toISOString()
}: {
  state: RuntimeState;
  eventGroupId: string;
  characterAssetIds?: readonly string[];
  client?: NarratorClient;
  now?: string;
}): Promise<RuntimeState> {
  let customContent = currentCustomContent(state);
  const eventBinding = customContent.eventGroupBindings.find(
    (binding) => binding.assetId === eventGroupId
  );
  const instance = customContent.eventInstances.find(
    (candidate) => candidate.eventGroupId === eventGroupId
  );
  if (!eventBinding || !instance) {
    throw new Error('当前存档没有该事件组绑定。');
  }
  const projectBinding = customContent.projectBindings.find(
    (binding) =>
      binding.assetId === instance.projectId &&
      binding.revision === instance.projectRevision
  );
  const eventAdaptation = adaptationByEvent(
    customContent,
    eventGroupId,
    eventBinding.revision
  );
  if (!projectBinding || !eventAdaptation) {
    throw new Error('事件项目适配基线缺失。');
  }
  const projectAdaptation =
    customContent.projectAdaptations[eventAdaptation.projectAdaptationId];
  const currentDescriptor = getWorldpackAdaptationDescriptor(
    state.world.worldpackId
  );
  if (
    !projectAdaptation ||
    projectAdaptation.worldpackId !== state.world.worldpackId ||
    eventAdaptation.worldpackId !== state.world.worldpackId ||
    !currentDescriptor ||
    projectAdaptation.worldpackDescriptorVersion !==
      currentDescriptor.descriptorVersion
  ) {
    throw new Error(
      '当前世界包或适配描述符已变化；请先执行显式项目迁移，不能静默重做人物适配。'
    );
  }

  const allowedCharacterIds = new Set(
    eventBinding.payload.characterRefs.map((ref) => ref.assetId)
  );
  const pendingIds = customContent.characterAdaptationIntents
    .filter(
      (intent) =>
        intent.instanceId === instance.instanceId &&
        intent.status === 'pending'
    )
    .flatMap((intent) => {
      const binding = customContent.characterBindings.find(
        (candidate) => candidate.bindingId === intent.bindingId
      );
      return binding ? [binding.assetId] : [];
    });
  const requestedIds = Array.from(
    new Set(characterAssetIds?.length ? characterAssetIds : pendingIds)
  );
  if (requestedIds.length === 0) {
    throw new Error('当前阶段没有待适配人物。');
  }
  for (const characterAssetId of requestedIds) {
    if (!allowedCharacterIds.has(characterAssetId)) {
      throw new Error(`人物不属于该事件组 revision：${characterAssetId}`);
    }
  }

  const requestedBindings = requestedIds.map((characterAssetId) => {
    const binding = customContent.characterBindings.find(
      (candidate) => candidate.assetId === characterAssetId
    );
    if (!binding) {
      throw new Error(`存档缺少人物 revision 快照：${characterAssetId}`);
    }
    return binding;
  });
  const missingBindings = requestedBindings.filter(
    (binding) => {
      const existing = adaptationByCharacter(
        customContent,
        binding.assetId,
        binding.revision
      );
      if (existing && existing.worldpackId !== state.world.worldpackId) {
        throw new Error(
          `人物“${binding.payload.displayName}”属于另一世界包适配，必须显式迁移。`
        );
      }
      return !existing;
    }
  );
  const deploymentMode = resolveCustomContentWorldDeployment(
    effectiveEventDeployments({
      project: projectBinding.payload,
      eventGroup: eventBinding.payload
    }),
    state.world.worldpackId
  ).mode;
  const adaptationBundle =
    missingBindings.length > 0
      ? await createAdaptationBundle({
          state,
          source: {
            projectContext: projectBinding.payload,
            projectAdaptationId: eventAdaptation.projectAdaptationId,
            characters: missingBindings.map((binding) => binding.payload)
          },
          deploymentMode,
          client,
          createdAt: now
        })
      : {
          characters: [],
          diagnostics: []
        };

  const nextCharacterAdaptations = {
    ...customContent.characterAdaptations
  };
  for (const incoming of adaptationBundle.characters) {
    const linkedIncoming = {
      ...incoming,
      projectAdaptationId: eventAdaptation.projectAdaptationId
    };
    const existing = adaptationByCharacter(
      customContent,
      linkedIncoming.characterAssetId,
      linkedIncoming.sourceRevision
    );
    const merged = mergeCharacterAdaptation(existing, linkedIncoming);
    nextCharacterAdaptations[merged.adaptationId] = merged;
  }
  const projectCharacterBindings = {
    ...instance.projectCharacterBindings
  };
  const adaptationIntents = [...customContent.characterAdaptationIntents];
  const currentStage = resolveCustomEventCurrentStage(eventBinding.payload, {
    currentStageId: instance.currentStageId,
    usedStageIds: instance.usedStageIds
  });
  for (const binding of requestedBindings) {
    const adaptation = Object.values(nextCharacterAdaptations).find(
      (candidate) =>
        candidate.characterAssetId === binding.assetId &&
        candidate.sourceRevision === binding.revision
    );
    if (!adaptation) {
      throw new Error(`人物适配未生成：${binding.payload.displayName}`);
    }
    projectCharacterBindings[binding.assetId] = adaptation.runtimeActorId;
    const intentId = [
      'adaptation-intent',
      instance.instanceId,
      binding.assetId,
      binding.revision
    ].join(':');
    const existingIndex = adaptationIntents.findIndex(
      (candidate) => candidate.intentId === intentId
    );
    const existing = adaptationIntents[existingIndex];
    const nextIntent = characterAdaptationIntent({
      binding,
      instanceId: instance.instanceId,
      reason:
        characterAssetIds?.length || existing?.reason === 'manual'
          ? 'manual'
          : 'current_stage',
      requestedStageId:
        existing?.requestedStageId ?? currentStage?.stageId,
      requestedTurn: existing?.requestedTurn ?? state.turnCounter,
      adaptation
    });
    if (existingIndex >= 0) {
      adaptationIntents[existingIndex] = nextIntent;
    } else {
      adaptationIntents.push(nextIntent);
    }
  }
  const roleBindings = {
    ...instance.roleBindings
  };
  for (const slot of eventBinding.payload.roleSlots) {
    if (slot.bindingMode === 'current_player') {
      roleBindings[slot.roleSlotId] = state.player.actorId;
      continue;
    }
    const characterAssetId = slot.fixedCharacterRef?.assetId;
    const actorId = characterAssetId
      ? projectCharacterBindings[characterAssetId]
      : undefined;
    if (actorId) roleBindings[slot.roleSlotId] = actorId;
  }
  customContent = {
    ...customContent,
    characterAdaptations: nextCharacterAdaptations,
    characterAdaptationIntents: adaptationIntents,
    eventInstances: customContent.eventInstances.map((candidate) =>
      candidate.instanceId === instance.instanceId
        ? {
            ...candidate,
            projectCharacterBindings,
            roleBindings
          }
        : candidate
    ),
    recentDiagnostics: appendDiagnostics(
      customContent.recentDiagnostics,
      adaptationBundle.diagnostics
    )
  };
  return {
    ...state,
    customContent: addPriorityOrders(customContent)
  };
}

function approvalDiagnostic({
  assetId,
  now
}: {
  assetId: string;
  now: string;
}): CustomContentDiagnostic {
  return {
    diagnosticId: `diagnostic:adaptation-approved:${assetId}:${now}`,
    code: 'adaptation_approved',
    severity: 'info',
    summary: '玩家已审核并确认该存档适配快照。',
    relatedAssetId: assetId,
    createdAt: now
  };
}

export function approveCustomContentAdaptationInState({
  state,
  kind,
  assetId,
  now
}: {
  state: RuntimeState;
  kind: 'character' | 'event_group';
  assetId: string;
  now: string;
}): RuntimeState {
  let customContent = currentCustomContent(state);

  if (kind === 'character') {
    const binding = customContent.characterBindings.find(
      (item) => item.assetId === assetId
    );
    if (!binding) throw new Error('当前存档没有该人物绑定。');
    const adaptation = adaptationByCharacter(
      customContent,
      assetId,
      binding.revision
    );
    if (!adaptation) throw new Error('找不到人物适配快照。');
    if (adaptation.status === 'incompatible') {
      throw new Error('不兼容适配不能直接确认。');
    }
    const intent = customContent.characterEntryIntents.find(
      (item) => item.bindingId === binding.bindingId
    );
    customContent = {
      ...customContent,
      characterAdaptations: {
        ...customContent.characterAdaptations,
        [adaptation.adaptationId]: {
          ...adaptation,
          status: 'ready'
        }
      },
      characterEntryIntents: customContent.characterEntryIntents.map((item) =>
        item.bindingId === binding.bindingId
          ? { ...item, status: 'queued', statusBeforePause: undefined }
          : item
      ),
      recentDiagnostics: appendDiagnostics(
        customContent.recentDiagnostics,
        [approvalDiagnostic({ assetId, now })]
      )
    };
    if (!intent) throw new Error('找不到人物进入意图。');
  } else {
    const binding = customContent.eventGroupBindings.find(
      (item) => item.assetId === assetId
    );
    if (!binding) throw new Error('当前存档没有该事件组绑定。');
    const eventAdaptation = adaptationByEvent(
      customContent,
      assetId,
      binding.revision
    );
    if (!eventAdaptation) throw new Error('找不到事件组适配快照。');
    const projectAdaptation =
      customContent.projectAdaptations[
        eventAdaptation.projectAdaptationId
      ];
    const instance = customContent.eventInstances.find(
      (item) => item.eventGroupId === assetId
    );
    if (!projectAdaptation || !instance) {
      throw new Error('事件组的项目适配或实例缺失。');
    }
    const characterIds = new Set(
      binding.payload.characterRefs.map((ref) => ref.assetId)
    );
    const relatedCharacterAdaptations = Object.values(
      customContent.characterAdaptations
    ).filter((item) => characterIds.has(item.characterAssetId));
    if (
      eventAdaptation.status === 'incompatible' ||
      projectAdaptation.status === 'incompatible' ||
      relatedCharacterAdaptations.some(
        (item) => item.status === 'incompatible'
      )
    ) {
      throw new Error('项目中存在不兼容适配，不能直接确认。');
    }
    const nextCharacterAdaptations = {
      ...customContent.characterAdaptations
    };
    for (const item of relatedCharacterAdaptations) {
      nextCharacterAdaptations[item.adaptationId] = {
        ...item,
        status: 'ready'
      };
    }
    customContent = {
      ...customContent,
      projectAdaptations: {
        ...customContent.projectAdaptations,
        [projectAdaptation.adaptationId]: {
          ...projectAdaptation,
          status: 'ready'
        }
      },
      characterAdaptations: nextCharacterAdaptations,
      eventGroupAdaptations: {
        ...customContent.eventGroupAdaptations,
        [eventAdaptation.adaptationId]: {
          ...eventAdaptation,
          status: 'ready'
        }
      },
      eventEntryIntents: customContent.eventEntryIntents.map((item) =>
        item.instanceId === instance.instanceId
          ? { ...item, status: 'queued', statusBeforePause: undefined }
          : item
      ),
      recentDiagnostics: appendDiagnostics(
        customContent.recentDiagnostics,
        [approvalDiagnostic({ assetId, now })]
      )
    };
  }

  return {
    ...state,
    customContent: addPriorityOrders(customContent)
  };
}

function ensureBindingAdaptationReady({
  customContent,
  kind,
  assetId
}: {
  customContent: RuntimeCustomContentState;
  kind: 'character' | 'event_group';
  assetId: string;
}): {
  targetId: string;
  projectId?: string;
} {
  if (kind === 'character') {
    const binding = customContent.characterBindings.find(
      (item) => item.assetId === assetId
    );
    if (!binding) throw new Error('当前存档没有该人物绑定。');
    const adaptation = adaptationByCharacter(
      customContent,
      assetId,
      binding.revision
    );
    if (!adaptationReady(adaptation)) {
      throw new Error('人物适配尚未就绪，不能设为本局重点。');
    }
    return { targetId: binding.bindingId };
  }
  const instance = customContent.eventInstances.find(
    (item) => item.eventGroupId === assetId
  );
  const binding = customContent.eventGroupBindings.find(
    (item) => item.assetId === assetId
  );
  const adaptation = binding
    ? adaptationByEvent(customContent, assetId, binding.revision)
    : undefined;
  if (!instance || !adaptationReady(adaptation)) {
    throw new Error('事件适配尚未就绪，不能设为本局重点。');
  }
  return { targetId: instance.instanceId, projectId: instance.projectId };
}

export function setCustomContentPriorityInState({
  state,
  kind,
  assetId,
  prioritized,
  now
}: {
  state: RuntimeState;
  kind: 'character' | 'event_group';
  assetId: string;
  prioritized: boolean;
  now: string;
}): RuntimeState {
  let customContent = currentCustomContent(state);
  const target = ensureBindingAdaptationReady({
    customContent,
    kind,
    assetId
  });
  const existing = customContent.priorityItems.find(
    (item) => item.targetId === target.targetId
  );

  if (prioritized && existing?.status !== 'active') {
    requirePriorityCapacity(customContent);
  }
  customContent = {
    ...customContent,
    characterEntryIntents: customContent.characterEntryIntents.map((intent) =>
      intent.bindingId === target.targetId
        ? {
            ...intent,
            mode: prioritized ? 'asap_contact' : 'natural',
            status: prioritized ? 'queued' : intent.status,
            ...(prioritized ? { statusBeforePause: undefined } : {})
          }
        : intent
    ),
    eventEntryIntents: customContent.eventEntryIntents.map((intent) =>
      intent.instanceId === target.targetId
        ? {
            ...intent,
            mode: prioritized ? 'asap' : 'natural',
            status: prioritized ? 'queued' : intent.status,
            ...(prioritized ? { statusBeforePause: undefined } : {})
          }
        : intent
    ),
    priorityItems: prioritized
      ? existing
        ? customContent.priorityItems.map((item) =>
            item.targetId === target.targetId
              ? {
                  ...item,
                  status: 'active',
                  statusBeforePause: undefined,
                  updatedAt: now
                }
              : item
          )
        : [
            ...customContent.priorityItems,
            priorityItem({
              kind,
              targetId: target.targetId,
              projectId: target.projectId,
              now
            })
          ]
      : customContent.priorityItems.filter(
          (item) => item.targetId !== target.targetId
        )
  };

  return {
    ...state,
    customContent: addPriorityOrders(customContent)
  };
}

export function setCustomContentBindingPausedInState({
  state,
  kind,
  assetId,
  paused,
  now
}: {
  state: RuntimeState;
  kind: 'character' | 'event_group';
  assetId: string;
  paused: boolean;
  now: string;
}): RuntimeState {
  let customContent = currentCustomContent(state);
  const target = ensureBindingAdaptationReady({
    customContent,
    kind,
    assetId
  });
  customContent = {
    ...customContent,
    characterEntryIntents: customContent.characterEntryIntents.map((intent) =>
      intent.bindingId === target.targetId
        ? paused
          ? intent.status === 'paused'
            ? intent
            : {
                ...intent,
                status: 'paused',
                statusBeforePause: intent.status
              }
          : intent.status === 'paused'
            ? {
                ...intent,
                status: intent.statusBeforePause ?? 'queued',
                statusBeforePause: undefined
              }
            : intent
        : intent
    ),
    eventEntryIntents: customContent.eventEntryIntents.map((intent) =>
      intent.instanceId === target.targetId
        ? paused
          ? intent.status === 'paused'
            ? intent
            : {
                ...intent,
                status: 'paused',
                statusBeforePause: intent.status
              }
          : intent.status === 'paused'
            ? {
                ...intent,
                status: intent.statusBeforePause ?? 'queued',
                statusBeforePause: undefined
              }
            : intent
        : intent
    ),
    eventInstances: customContent.eventInstances.map((instance) =>
      instance.instanceId === target.targetId
        ? paused
          ? instance.status === 'paused'
            ? instance
            : {
                ...instance,
                status: 'paused',
                statusBeforePause: instance.status
              }
          : instance.status === 'paused'
            ? {
                ...instance,
                status: instance.statusBeforePause ?? 'latent',
                statusBeforePause: undefined
              }
            : instance
        : instance
    ),
    priorityItems: customContent.priorityItems.map((item) =>
      item.targetId === target.targetId
        ? {
            ...item,
            status: paused
              ? 'paused'
              : item.status === 'paused'
                ? (item.statusBeforePause ?? 'active')
                : item.status,
            statusBeforePause: paused
              ? item.status === 'paused'
                ? item.statusBeforePause
                : item.status
              : undefined,
            updatedAt: now
          }
        : item
    )
  };
  if (!paused) {
    const restoringPriority = customContent.priorityItems.find(
      (item) => item.targetId === target.targetId
    );
    if (restoringPriority?.status === 'active') {
      const otherActive = customContent.priorityItems.filter(
        (item) =>
          item.targetId !== target.targetId && item.status === 'active'
      ).length;
      if (otherActive >= MAX_CUSTOM_CONTENT_PRIORITY_ITEMS) {
        throw new Error('恢复后会超过 3 项本局重点内容。');
      }
    }
  }

  return {
    ...state,
    customContent: addPriorityOrders(customContent)
  };
}

export function abandonCustomEventBindingInState({
  state,
  eventGroupId,
  now
}: {
  state: RuntimeState;
  eventGroupId: string;
  now: string;
}): RuntimeState {
  const customContent = currentCustomContent(state);
  const instance = customContent.eventInstances.find(
    (item) => item.eventGroupId === eventGroupId
  );
  if (!instance) throw new Error('当前存档没有该事件实例。');
  const nextCustomContent: RuntimeCustomContentState = {
    ...customContent,
    eventInstances: customContent.eventInstances.map((item) =>
      item.instanceId === instance.instanceId
        ? { ...item, status: 'abandoned' }
        : item
    ),
    eventEntryIntents: customContent.eventEntryIntents.map((item) =>
      item.instanceId === instance.instanceId
        ? { ...item, status: 'cancelled' }
        : item
    ),
    priorityItems: customContent.priorityItems.map((item) =>
      item.targetId === instance.instanceId
        ? { ...item, status: 'cancelled', updatedAt: now }
        : item
    )
  };
  return {
    ...state,
    customContent: addPriorityOrders(nextCustomContent)
  };
}

async function saveUpdatedRecord({
  saveRepository,
  record,
  runtimeState,
  now
}: {
  saveRepository: SaveRepository;
  record: RuntimeSaveRecord;
  runtimeState: RuntimeState;
  now: string;
}): Promise<RuntimeSaveRecord> {
  const updated: RuntimeSaveRecord = {
    ...record,
    updatedAt: now,
    runtimeState
  };
  await saveRepository.save(updated);
  return updated;
}

export async function bindCustomCharacterToSave({
  contentRepository,
  saveRepository,
  saveId,
  characterAssetId,
  revision,
  prioritized = true,
  client,
  now = new Date().toISOString()
}: {
  contentRepository: IndexedDbCustomContentRepository;
  saveRepository: SaveRepository;
  saveId: string;
  characterAssetId: string;
  revision?: number;
  prioritized?: boolean;
  client?: NarratorClient;
  now?: string;
}): Promise<RuntimeSaveRecord> {
  const record = await saveRepository.load(saveId);
  if (!record) throw new Error('找不到当前存档。');
  const runtimeState = await bindCustomCharacterToState({
    contentRepository,
    state: record.runtimeState,
    characterAssetId,
    revision,
    prioritized,
    client,
    now
  });
  return saveUpdatedRecord({
    saveRepository,
    record,
    runtimeState,
    now
  });
}

export async function bindCustomCharacterToState({
  contentRepository,
  state,
  characterAssetId,
  revision,
  reuseExistingRevision = false,
  prioritized = true,
  client,
  now = new Date().toISOString()
}: {
  contentRepository: IndexedDbCustomContentRepository;
  state: RuntimeState;
  characterAssetId: string;
  revision?: number;
  reuseExistingRevision?: boolean;
  prioritized?: boolean;
  client?: NarratorClient;
  now?: string;
}): Promise<RuntimeState> {
  const existingBinding = reuseExistingRevision
    ? state.customContent?.characterBindings.find(
        (binding) => binding.assetId === characterAssetId
      )
    : undefined;
  const resolvedRevision = existingBinding?.revision ?? revision;
  const loaded = withWorldpackDeploymentMode(
    await loadCharacterBindingSource({
      repository: contentRepository,
      characterAssetId,
      revision: resolvedRevision
    }),
    state.world.worldpackId
  );
  if (!prioritized && loaded.deploymentMode !== 'native') {
    throw new Error(
      '需要世界适配的自定义人物必须设为本局重点，避免批量 AI 适配阻塞开局。'
    );
  }
  const adaptationBundle = await createAdaptationBundle({
    state,
    source: {
      characters: [loaded.character]
    },
    deploymentMode: loaded.deploymentMode,
    client,
    createdAt: now
  });
  const nextState = bindCustomCharacterRevisionToState({
    state,
    character: loaded.character,
    adaptationBundle,
    allowExistingBinding: reuseExistingRevision,
    prioritized,
    now
  });
  if (
    !existingBinding ||
    revision === undefined ||
    revision === existingBinding.revision ||
    !nextState.customContent
  ) {
    return nextState;
  }
  return {
    ...nextState,
    customContent: {
      ...nextState.customContent,
      recentDiagnostics: appendDiagnostics(
        nextState.customContent.recentDiagnostics,
        [
          {
            diagnosticId: `diagnostic:character-revision-reused:${characterAssetId}:${now}`,
            code: 'character_binding_revision_reused',
            severity: 'info',
            summary:
              `人物“${loaded.character.displayName}”已由所选事件锁定 revision ` +
              `${existingBinding.revision}；独立人物选择已复用该存档版本。`,
            relatedAssetId: characterAssetId,
            createdAt: now
          }
        ]
      )
    }
  };
}

export async function bindCustomEventGroupToSave({
  contentRepository,
  saveRepository,
  saveId,
  eventGroupId,
  eventGroupRevision,
  projectRevision,
  prioritized = true,
  client,
  now = new Date().toISOString()
}: {
  contentRepository: IndexedDbCustomContentRepository;
  saveRepository: SaveRepository;
  saveId: string;
  eventGroupId: string;
  eventGroupRevision?: number;
  projectRevision?: number;
  prioritized?: boolean;
  client?: NarratorClient;
  now?: string;
}): Promise<RuntimeSaveRecord> {
  const record = await saveRepository.load(saveId);
  if (!record) throw new Error('找不到当前存档。');
  const runtimeState = await bindCustomEventGroupToState({
    contentRepository,
    state: record.runtimeState,
    eventGroupId,
    eventGroupRevision,
    projectRevision,
    prioritized,
    client,
    now
  });
  return saveUpdatedRecord({
    saveRepository,
    record,
    runtimeState,
    now
  });
}

export async function bindCustomEventGroupToState({
  contentRepository,
  state,
  eventGroupId,
  eventGroupRevision,
  projectRevision,
  prioritized = true,
  client,
  now = new Date().toISOString()
}: {
  contentRepository: IndexedDbCustomContentRepository;
  state: RuntimeState;
  eventGroupId: string;
  eventGroupRevision?: number;
  projectRevision?: number;
  prioritized?: boolean;
  client?: NarratorClient;
  now?: string;
}): Promise<RuntimeState> {
  const loaded = withWorldpackDeploymentMode(
    await loadEventBindingSource({
      repository: contentRepository,
      eventGroupId,
      eventGroupRevision,
      projectRevision
    }),
    state.world.worldpackId
  );
  if (!prioritized && loaded.deploymentMode !== 'native') {
    throw new Error(
      '需要世界适配的自定义事件必须设为本局重点，避免批量 AI 适配阻塞开局。'
    );
  }
  const adaptationBundle = await createAdaptationBundle({
    state,
    source: {
      project: loaded.project,
      characters: loaded.characters.filter((character) =>
        new Set(
          collectCustomEventStageCharacterAssetIds(
            loaded.eventGroup,
            resolveCustomEventCurrentStage(loaded.eventGroup)
          )
        ).has(character.characterAssetId)
      ),
      eventGroup: loaded.eventGroup
    },
    deploymentMode: loaded.deploymentMode,
    client,
    createdAt: now
  });
  return bindCustomEventProjectRevisionToState({
    state,
    project: loaded.project,
    characters: loaded.characters,
    eventGroup: loaded.eventGroup,
    adaptationBundle,
    prioritized,
    now
  });
}

export async function updateCustomContentSave({
  saveRepository,
  saveId,
  updater,
  now = new Date().toISOString()
}: {
  saveRepository: SaveRepository;
  saveId: string;
  updater: (state: RuntimeState, now: string) => RuntimeState;
  now?: string;
}): Promise<RuntimeSaveRecord> {
  const record = await saveRepository.load(saveId);
  if (!record) throw new Error('找不到当前存档。');
  return saveUpdatedRecord({
    saveRepository,
    record,
    runtimeState: updater(record.runtimeState, now),
    now
  });
}

export function resolveBindingDescriptor(
  state: RuntimeState
): WorldpackAdaptationDescriptor | undefined {
  return getWorldpackAdaptationDescriptor(state.world.worldpackId);
}
