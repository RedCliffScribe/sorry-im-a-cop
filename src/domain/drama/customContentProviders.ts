import type { PromptContext } from '../context/selectContext';
import type {
  CustomCharacterProjectionSource,
  CustomEventExecutionMaterial,
  CustomEventGroupProjectionSource
} from '../customContent/runtimeProjection';
import { projectCustomContentContext } from '../customContent/runtimeProjection';
import type { RuntimeState } from '../runtime/types';
import { withDramaSourceCoherenceMetadata } from './coherence';
import type { ProjectedDramaSourceProvider } from './sourceRegistry';
import type {
  DramaSourceRef,
  ExecutionPayload,
  PlanningSource
} from './types';

function allCharacterSources(
  context: PromptContext
): CustomCharacterProjectionSource[] {
  return [
    ...context.customContentProjection.userPrioritySources.filter(
      (source): source is CustomCharacterProjectionSource =>
        source.kind === 'character'
    ),
    ...context.customContentProjection.naturalCharacterSources
  ];
}

function allEventSources(
  context: PromptContext
): CustomEventGroupProjectionSource[] {
  return [
    ...context.customContentProjection.userPrioritySources.filter(
      (source): source is CustomEventGroupProjectionSource =>
        source.kind === 'event_group'
    ),
    ...context.customContentProjection.naturalEventSources
  ];
}

function isUserPriority(
  context: PromptContext,
  source:
    | CustomCharacterProjectionSource
    | CustomEventGroupProjectionSource
): boolean {
  return context.customContentProjection.userPrioritySources.some(
    (candidate) =>
      candidate.kind === source.kind &&
      (source.kind === 'character'
        ? candidate.kind === 'character' &&
          candidate.bindingId === source.bindingId
        : candidate.kind === 'event_group' &&
          candidate.instanceId === source.instanceId)
  );
}

function userPriorityScore(priorityOrder: number | undefined): number {
  return 110 - Math.min(10, Math.max(1, priorityOrder ?? 3));
}

function characterRef(source: CustomCharacterProjectionSource): DramaSourceRef {
  return {
    providerId: 'custom-character',
    sourceType: 'custom_character_binding',
    sourceId: source.bindingId
  };
}

function eventRef(source: CustomEventGroupProjectionSource): DramaSourceRef {
  return {
    providerId: 'custom-event-group',
    sourceType: 'custom_event_group_instance',
    sourceId: source.instanceId
  };
}

function characterPlanningSource(
  context: PromptContext,
  candidate: CustomCharacterProjectionSource
): PlanningSource {
  const priority = isUserPriority(context, candidate);
  return withDramaSourceCoherenceMetadata({
    ref: characterRef(candidate),
    arcKey: `custom-character:${candidate.bindingId}`,
    title: candidate.displayName,
    plannerSummary: [
      candidate.adaptedPublicIdentity,
      candidate.adaptedOccupation,
      candidate.profileSummary,
      `当前仅为候选，尚未确认与玩家建立接触`
    ]
      .filter(Boolean)
      .join('；'),
    sourceStatus: 'undecided_suggestion',
    reusePolicy: 'entity_singleton',
    priorityClass: priority ? 'user_requested' : 'normal',
    channelIds: ['custom_characters'],
    softAffinities: {
      entryMode: [candidate.entryMode],
      contactRoutes: [...candidate.adaptedContactRoutes]
    },
    mandatory: false,
    score: priority ? userPriorityScore(candidate.priorityOrder) : 45,
    relatedActorIds: [candidate.runtimeActorId],
    relatedOrganizationIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: []
  });
}

function eventPlanningSource(
  context: PromptContext,
  candidate: CustomEventGroupProjectionSource,
  material: CustomEventExecutionMaterial
): PlanningSource {
  const priority = isUserPriority(context, candidate);
  const activeProcess =
    candidate.instanceStatus === 'active' ||
    candidate.instanceStatus === 'diverged' ||
    material.resultingWritebackRefs.length > 0;
  return withDramaSourceCoherenceMetadata({
    ref: eventRef(candidate),
    arcKey: candidate.arcKey,
    title: candidate.title,
    plannerSummary: [
      candidate.adaptedSummary,
      material.currentStage
        ? `当前可用阶段：${material.currentStage.title}；${material.currentStage.summary}`
        : undefined,
      activeProcess
        ? '已有 Runtime 结果，必须承接现有事实'
        : '尚未发生，只能作为可拒绝、可偏转的候选'
    ]
      .filter(Boolean)
      .join('；'),
    sourceStatus: activeProcess ? 'active_process' : 'undecided_suggestion',
    reusePolicy:
      activeProcess
        ? 'context_reusable'
        : candidate.reusePolicy === 'repeatable_motif'
        ? 'motif_reusable'
        : 'save_single_use',
    priorityClass: priority ? 'user_requested' : 'normal',
    channelIds: ['custom_events'],
    softAffinities: {
      projectId: [candidate.projectId],
      entryMode: [candidate.entryMode],
      stageId: candidate.currentStageId ? [candidate.currentStageId] : []
    },
    mandatory: false,
    score: priority
      ? userPriorityScore(candidate.priorityOrder)
      : activeProcess
        ? 85
        : 50,
    relatedActorIds: [...candidate.relatedActorIds],
    relatedOrganizationIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: []
  });
}

function findCharacterSource(
  context: PromptContext,
  ref: DramaSourceRef
): CustomCharacterProjectionSource | undefined {
  if (
    ref.providerId !== 'custom-character' ||
    ref.sourceType !== 'custom_character_binding'
  ) {
    return undefined;
  }
  return allCharacterSources(context).find(
    (candidate) => candidate.bindingId === ref.sourceId
  );
}

function findEventSource(
  context: PromptContext,
  ref: DramaSourceRef
): CustomEventGroupProjectionSource | undefined {
  if (
    ref.providerId !== 'custom-event-group' ||
    ref.sourceType !== 'custom_event_group_instance'
  ) {
    return undefined;
  }
  return allEventSources(context).find(
    (candidate) => candidate.instanceId === ref.sourceId
  );
}

function formatRoleBindings(bindings: Record<string, string>): string {
  const entries = Object.entries(bindings);
  return entries.length
    ? entries.map(([roleId, actorId]) => `${roleId} -> ${actorId}`).join('；')
    : '无固定角色绑定';
}

function formatStageFacts(
  material: CustomEventExecutionMaterial
): string[] {
  const stage = material.currentStage;
  if (!stage) return [];
  return [
    ...stage.establishedSourceFacts,
    ...stage.continuationSourceFacts,
    ...stage.hardSourceConstraints
  ].map((fact) => `${fact.state}：${fact.summary}`);
}

function formatRequiredCharacters(
  material: CustomEventExecutionMaterial
): string[] {
  return (material.requiredCharacters ?? []).map(
    (character) =>
      `${character.displayName}（${character.characterAssetId}，Runtime Actor=${character.runtimeActorId}）：` +
      `${character.profileSummary}；当前世界身份=${character.adaptedPublicIdentity}；` +
      `职业=${character.adaptedOccupation}；适配背景=${character.adaptedBackgroundSummary}`
  );
}

function establishedSaveFacts(
  material: CustomEventExecutionMaterial
): string[] {
  const stage = material.currentStage;
  if (!stage) return [];
  return [
    ...stage.establishedSourceFacts,
    ...stage.continuationSourceFacts,
    ...stage.hardSourceConstraints
  ]
    .filter((fact) => fact.state === 'established_in_save')
    .map((fact) => fact.summary);
}

export const customCharacterProvider: ProjectedDramaSourceProvider = {
  providerId: 'custom-character',
  list(context) {
    return allCharacterSources(context).flatMap((candidate) =>
      context.customContentProjection.executionMaterials.characters[
        candidate.bindingId
      ]
        ? [characterPlanningSource(context, candidate)]
        : []
    );
  },
  getExecutionPayload(context, ref): ExecutionPayload | undefined {
    const candidate = findCharacterSource(context, ref);
    const material = candidate
      ? context.customContentProjection.executionMaterials.characters[
          candidate.bindingId
        ]
      : undefined;
    if (!candidate || !material) return undefined;
    return {
      ref,
      detailedContext: [
        `不可变人物 revision：${candidate.characterAssetId}@${candidate.revision}，checksum=${candidate.checksum}`,
        `人物原案：${candidate.displayName}；${candidate.profileSummary}；${material.backgroundSummary}`,
        `核心性格：${material.corePersonality.join('；') || '未填写'}`,
        `价值观：${material.values.join('；') || '未填写'}`,
        `核心动机：${material.coreMotivations.join('；') || '未填写'}`,
        `主要关系：${material.relationshipSummaries.join('；') || '未填写'}`,
        `当前世界适配：${candidate.adaptedPublicIdentity}；职业=${candidate.adaptedOccupation}；社会位置=${candidate.adaptedSocialPosition}`,
        `适配背景：${candidate.adaptedBackgroundSummary}`,
        `允许的接触路径：${candidate.adaptedContactRoutes.join('；') || '无'}`,
        `进入意图：${candidate.entryMode}/${candidate.entryStatus}，目标=${candidate.targetOutcome}`,
        `稳定 Runtime Actor ID：${candidate.runtimeActorId}`
      ].join('\n'),
      confirmedFacts: [],
      mutableElements: [
        ...candidate.adaptedContactRoutes.map(
          (route) => `可用接触路径：${route}`
        ),
        ...material.adaptableFields.map(
          (field) => `允许在适配范围内变化：${field}`
        )
      ],
      forbiddenAdaptations: [
        '人物资产和适配快照不是“已经登场、认识玩家或发生互动”的世界事实。',
        '不得只凭同名、别名或相似简介绑定到其他既有 Actor。',
        `若需要创建人物，只能使用稳定 Runtime Actor ID：${candidate.runtimeActorId}。`,
        ...material.lockedFields.map((field) => `锁定字段不得改写：${field}`)
      ]
    };
  }
};

export const customEventGroupProvider: ProjectedDramaSourceProvider = {
  providerId: 'custom-event-group',
  list(context) {
    return allEventSources(context).flatMap((candidate) => {
      const material =
        context.customContentProjection.executionMaterials.eventGroups[
          candidate.instanceId
        ];
      return material ? [eventPlanningSource(context, candidate, material)] : [];
    });
  },
  getExecutionPayload(context, ref): ExecutionPayload | undefined {
    const candidate = findEventSource(context, ref);
    const material = candidate
      ? context.customContentProjection.executionMaterials.eventGroups[
          candidate.instanceId
        ]
      : undefined;
    if (!candidate || !material) return undefined;
    const stage = material.currentStage;
    return {
      ref,
      arcKey: candidate.arcKey,
      initialStageId: candidate.currentStageId ?? stage?.stageId,
      detailedContext: [
        `不可变事件 revision：${candidate.eventGroupId}@${candidate.revision}，checksum=${candidate.checksum}`,
        `项目：${candidate.projectId}@${candidate.projectRevision}`,
        `事件原案：${candidate.title}；${candidate.summary}`,
        `当前世界适配：${candidate.adaptedSummary}`,
        `不可变核心：${material.adaptedInvariantCore.join('；') || material.invariantCore.join('；') || '无'}`,
        `适配角色：${material.adaptedRoleBindings.join('；') || '无'}`,
        `Runtime 角色绑定：${formatRoleBindings(material.roleBindings)}`,
        `事件所需人物：${formatRequiredCharacters(material).join('\n') || '无固定人物'}`,
        `当前实例：${candidate.instanceStatus}；arcKey=${candidate.arcKey}`,
        stage
          ? `当前可用阶段：${stage.stageId}/${stage.title}；${stage.summary}`
          : '当前没有剩余可用阶段。',
        `当前阶段来源事实：${formatStageFacts(material).join('；') || '无'}`,
        `已使用阶段：${material.usedStageIds.join('；') || '无'}`,
        `已使用节点：${material.usedNodeIds.join('；') || '无'}`,
        `已形成 Runtime 引用：${
          material.resultingWritebackRefs
            .map((item) => `${item.kind}:${item.id}`)
            .join('；') || '无'
        }`,
        `进入意图：${candidate.entryMode}/${candidate.entryStatus}`
      ].join('\n'),
      confirmedFacts: establishedSaveFacts(material),
      mutableElements: [
        ...material.adaptedMutableElements,
        ...material.mutableSlots,
        ...material.adaptedEntryRoutes.map((route) => `可用进入路径：${route}`),
        ...(stage?.foreshadowingOptions ?? [])
      ],
      forbiddenAdaptations: [
        '尚未通过结构化写回成立的原作内容不得冒充本局事实。',
        '玩家可以拒绝、忽略或使事件偏转，不得强制回归原作路线。',
        '已形成的 Runtime 事实高于事件原案和后续阶段。',
        ...material.forbiddenAdaptations,
        ...(stage?.hardSourceConstraints ?? [])
          .filter(
            (fact) =>
              fact.state === 'established_in_save' ||
              fact.state === 'invalidated_in_save'
          )
          .map((fact) =>
            fact.state === 'established_in_save'
              ? `本局已成立硬约束，不得违反：${fact.summary}`
              : `本局已经否定该来源约束，不得重新宣布成立：${fact.summary}`
          ),
        ...material.unresolvedConflicts.map(
          (conflict) => `未解决冲突，不得擅自猜测：${conflict}`
        )
      ]
    };
  }
};

export function resolveOpeningCustomContentSupport({
  state,
  ref = state.dramaticContent?.openingSupportSourceRef
}: {
  state: RuntimeState;
  ref?: DramaSourceRef;
}): { source: PlanningSource; payload: ExecutionPayload } | undefined {
  if (
    !ref ||
    (ref.providerId !== customCharacterProvider.providerId &&
      ref.providerId !== customEventGroupProvider.providerId)
  ) {
    return undefined;
  }
  const context = {
    customContentProjection: projectCustomContentContext(state)
  } as PromptContext;
  const provider =
    ref.providerId === customEventGroupProvider.providerId
      ? customEventGroupProvider
      : customCharacterProvider;
  const source = provider
    .list(context)
    .find(
      (candidate) =>
        candidate.ref.providerId === ref.providerId &&
        candidate.ref.sourceType === ref.sourceType &&
        candidate.ref.sourceId === ref.sourceId
    );
  const payload = source
    ? provider.getExecutionPayload(context, ref)
    : undefined;
  return source && payload ? { source, payload } : undefined;
}
