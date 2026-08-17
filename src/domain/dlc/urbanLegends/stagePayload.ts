import type { PromptContext } from '../../context/selectContext';
import type {
  ExecutionPayload,
  NarrativeArcContentIdentity,
  NarrativeArcContinuationSnapshot,
  NarrativeArcProgressContract,
  NarrativeArcStageProjection
} from '../../drama/types';
import type { CurrentIdentity } from '../../runtime/types';
import {
  urbanLegendsEntryRouteMatrix,
  urbanLegendsFormalCharacters,
  urbanLegendsFormalIds,
  urbanLegendsFormalManifest,
  urbanLegendsFormalPlaces,
  urbanLegendsNarrativeIdentity
} from './content';
import { urbanLegendsFormalStageContracts } from './stageContracts';
import {
  getUrbanLegendsNewsEvolutionTemplatesForStage,
  getUrbanLegendsResolutionContractsForStage,
  getUrbanLegendsStageWorldFeedbackContract,
  urbanLegendsDlcCompletionPolicy
} from './worldFeedback';
import type {
  UrbanLegendsFormalNodeContract,
  UrbanLegendsFormalStageContract
} from './types';

export const urbanLegendsFormalSourceRef = {
  providerId: 'official-dlc',
  sourceType: 'official_dlc_event',
  sourceId: urbanLegendsFormalIds.eventGroup,
  dlcId: urbanLegendsFormalManifest.dlcId
} as const;

export function buildUrbanLegendsFormalContentIdentity(
  version: string = urbanLegendsFormalManifest.version
): NarrativeArcContentIdentity {
  return {
    providerId: urbanLegendsFormalSourceRef.providerId,
    contentId: urbanLegendsFormalIds.eventGroup,
    version,
    arcKey: urbanLegendsFormalIds.arcKey,
    dlcId: urbanLegendsFormalManifest.dlcId,
    worldpackId: urbanLegendsNarrativeIdentity.worldpackId
  };
}

export const urbanLegendsFormalContentIdentity: NarrativeArcContentIdentity =
  buildUrbanLegendsFormalContentIdentity();

function playerIdentity(context: PromptContext): CurrentIdentity {
  return context.identityProjection.currentShell.currentIdentity;
}

function compatibleNodes(
  stage: UrbanLegendsFormalStageContract,
  identity: CurrentIdentity
): readonly UrbanLegendsFormalNodeContract[] {
  return stage.nodes.filter((node) => node.compatibleIdentities.includes(identity));
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function relatedIdsForStage(
  stage: UrbanLegendsFormalStageContract,
  identity: CurrentIdentity
): { actorIds: string[]; placeIds: string[] } {
  const nodes = compatibleNodes(stage, identity);
  return {
    actorIds: unique(nodes.flatMap((node) => [...node.relevantActorIds])),
    placeIds: unique(nodes.flatMap((node) => [...node.relevantPlaceIds]))
  };
}

export function buildUrbanLegendsFormalArcProgressContract(): NarrativeArcProgressContract {
  return {
    stageIds: urbanLegendsFormalStageContracts.map((stage) => stage.stageId),
    nodeIdsByStage: Object.fromEntries(
      urbanLegendsFormalStageContracts.map((stage) => [
        stage.stageId,
        stage.nodes.map((node) => node.nodeId)
      ])
    ),
    allowedNextStageIds: Object.fromEntries(
      urbanLegendsFormalStageContracts.map((stage) => [
        stage.stageId,
        [...stage.allowedNextStageIds]
      ])
    ),
    completionStageIds: [urbanLegendsFormalIds.stages.aftermath]
  };
}

export function buildUrbanLegendsFormalStageProjections(
  context: PromptContext
): Readonly<Record<string, NarrativeArcStageProjection>> {
  const identity = playerIdentity(context);
  return Object.fromEntries(
    urbanLegendsFormalStageContracts.map((stage) => {
      const related = relatedIdsForStage(stage, identity);
      return [
        stage.stageId,
        {
          stageId: stage.stageId,
          title: `${urbanLegendsNarrativeIdentity.title} · ${stage.title}`,
          plannerSummary: [
            `当前阶段：${stage.title}。`,
            stage.narrativeFunction,
            `身份适配：${stage.identityAdaptationHints[identity].join('；')}`,
            '只在玩家当前行动存在自然入口时承接；允许安静、忽略或退出。'
          ].join(' '),
          relatedActorIds: related.actorIds,
          relatedPlaceIds: related.placeIds
        }
      ];
    })
  );
}

function narrowedProgressContract(
  stage: UrbanLegendsFormalStageContract,
  nodes: readonly UrbanLegendsFormalNodeContract[]
): NarrativeArcProgressContract {
  const stageIds = [stage.stageId, ...stage.allowedNextStageIds];
  return {
    stageIds,
    nodeIdsByStage: {
      [stage.stageId]: nodes.map((node) => node.nodeId),
      ...Object.fromEntries(stage.allowedNextStageIds.map((stageId) => [stageId, []]))
    },
    allowedNextStageIds: {
      [stage.stageId]: [...stage.allowedNextStageIds],
      ...Object.fromEntries(stage.allowedNextStageIds.map((stageId) => [stageId, []]))
    },
    completionStageIds: stageIds.includes(urbanLegendsFormalIds.stages.aftermath)
      ? [urbanLegendsFormalIds.stages.aftermath]
      : []
  };
}

function stageCharacterLines(actorIds: readonly string[]): string[] {
  return actorIds.flatMap((actorId) => {
    const actor = urbanLegendsFormalCharacters.find((candidate) => candidate.actorId === actorId);
    if (!actor) return [];
    return [
      `${actor.actorId}：${actor.name}，${actor.publicIdentity}；公开资料=${actor.publicFacts.join('；')}；信息边界=${actor.informationBoundary.knows.join('；')}`
    ];
  });
}

function stagePlaceLines(placeIds: readonly string[]): string[] {
  return placeIds.flatMap((placeId) => {
    const place = urbanLegendsFormalPlaces.find((candidate) => candidate.placeId === placeId);
    if (!place) return [];
    return [`${place.placeId}：${place.name}；${place.summary}`];
  });
}

function stageNodeLines(nodes: readonly UrbanLegendsFormalNodeContract[]): string[] {
  return nodes.map(
    (node) =>
      `${node.nodeId}/${node.title}：${node.narrativeUse} 可成立事实=${node.permittedFactKinds.join('；')}；推进信号=${node.progressSignals.join('；')}`
  );
}

function continuationLines(
  snapshot: NarrativeArcContinuationSnapshot | undefined
): string[] {
  if (!snapshot) return [];
  return [
    `剧情弧最后推进回合：${snapshot.lastProgressTurn}`,
    `已使用节点（不得重新当作首次发现）：${snapshot.usedNodeIds.join('、') || '无'}`,
    ...(snapshot.progressSummary
      ? [`已验证进度摘要：${snapshot.progressSummary}`]
      : []),
    `当前 Runtime 有据摘要：${snapshot.groundedSummary}`,
    `已应用写回证据引用（仅用于对账，ID 本身不是自然语言事实）：${
      snapshot.appliedWritebackRefs.map((ref) => `${ref.kind}:${ref.id}`).join('、') || '无'
    }`,
    `当前未解决上下文：${snapshot.unresolvedContext.join('；') || '无可确认开放项；不得自行补造。'}`
  ];
}

function worldFeedbackLines(stageId: string): string[] {
  const feedback = getUrbanLegendsStageWorldFeedbackContract(stageId);
  if (!feedback) return [];
  const newsTemplates = getUrbanLegendsNewsEvolutionTemplatesForStage(stageId);
  const resolutions = getUrbanLegendsResolutionContractsForStage(stageId);
  return [
    '玩家参与边界：',
    ...Object.values(feedback.engagement).map(
      (contract) =>
        `- ${contract.kind}：${contract.narrativeRule}；允许 Arc 决策=${contract.allowedArcDecisions.join('/')}`
    ),
    '所有推进、完成或放弃都必须由本回合实际应用的通用 Runtime 写回支持；忽略、失败或退出本身不构成进展。',
    `NPC 后台演化：${feedback.npcAutonomy.possibleActions.join('；')}；只能使用已建立人物与已知信息渠道，不得强迫玩家回到前景。`,
    ...(newsTemplates.length > 0
      ? [
          `当前阶段可用新闻演化：${newsTemplates
            .map(
              (template) =>
                `${template.templateId}=${template.purpose} 边界=${template.publicFactBoundary}`
            )
            .join('；')}`
        ]
      : ['当前阶段没有预置新闻演化；不得为了展示 DLC 自动制造报道。']),
    ...(resolutions.length > 0
      ? [
          `当前阶段允许检验的收束模式：${resolutions
            .map(
              (resolution) =>
                `${resolution.resolutionId}/${resolution.title}：${resolution.narrativeBoundary}`
            )
            .join('；')}`
        ]
      : []),
    ...(feedback.completionAllowed
      ? [
          '当前阶段可以在世界结果已经应用时完成本剧情弧；完成只结束该 Arc 的主要推进，不删除历史，也不自动把整个 DLC 标记为 completed。'
        ]
      : ['当前阶段不能直接完成剧情弧；只能依合同保持、推进或在有据时放弃。'])
  ];
}

export function buildUrbanLegendsFormalExecutionPayload(
  context: PromptContext,
  currentStageId: string = urbanLegendsFormalIds.stages.streetRumor,
  mode: 'first_exposure' | 'continuation' = 'first_exposure',
  continuationSnapshot?: NarrativeArcContinuationSnapshot,
  contentVersion: string = urbanLegendsFormalManifest.version
): ExecutionPayload | undefined {
  const stage = urbanLegendsFormalStageContracts.find(
    (candidate) => candidate.stageId === currentStageId
  );
  if (!stage) return undefined;

  const identity = playerIdentity(context);
  const entryRoute = urbanLegendsEntryRouteMatrix.find(
    (candidate) => candidate.identity === identity
  );
  if (!entryRoute) return undefined;
  const nodes = compatibleNodes(stage, identity);
  const related = relatedIdsForStage(stage, identity);
  const allowedNextStageId = stage.allowedNextStageIds[0];
  const progressDecision = allowedNextStageId ? 'advance_stage' : 'complete';
  const contentIdentity = buildUrbanLegendsFormalContentIdentity(contentVersion);
  const detailedContext = [
    `官方 DLC：${urbanLegendsFormalManifest.title} ${contentVersion}`,
    `稳定内容身份：${contentIdentity.contentId}；arcKey=${contentIdentity.arcKey}`,
    `载荷模式：${mode}`,
    `当前阶段：${stage.stageId}/${stage.title}`,
    `当前阶段叙事功能：${stage.narrativeFunction}`,
    ...continuationLines(continuationSnapshot),
    ...worldFeedbackLines(stage.stageId),
    `玩家身份：${identity}`,
    `身份适配：${stage.identityAdaptationHints[identity].join('；')}`,
    ...(mode === 'first_exposure'
      ? [
          `自然接触来源：${entryRoute.contactSources.join('；')}`,
          `合理权限：${entryRoute.reasonablePermissions.join('；')}`,
          `身份限制：${entryRoute.restrictions.join('；')}`,
          `自然偏转：${entryRoute.diversionRoutes.join('；')}`
        ]
      : []),
    `当前阶段允许的下一阶段 ID：${allowedNextStageId ?? '无'}`,
    `当前阶段可成立事实：${stage.permittedFactKinds.join('；')}`,
    `当前阶段推进信号：${stage.advanceEvidence.signals.join('；')}`,
    `不足以推进：${stage.advanceEvidence.insufficientOnTheirOwn.join('；')}`,
    `阶段进度决定：必须根据本回合实际应用的世界写回和已验证 Arc 上下文，在 remain 与 ${progressDecision} 之间作出真实比较；不得把 remain 当作默认保守答案，也不得因节点数量、经过回合、仍有未使用节点或仍存在有界未解细节而自动推进或自动阻止推进。`,
    `应保持当前阶段：${stage.progressDecisionGuidance.remainWhen.join('；')}`,
    `应认真比较 ${progressDecision}：${stage.progressDecisionGuidance.advanceOrCompleteWhen.join('；')}`,
    `推进或完成的语义边界：${stage.progressDecisionGuidance.transitionMeaning}`,
    `当前身份可用节点：\n${stageNodeLines(nodes).join('\n')}`,
    `本阶段必要人物（仅为未确认内容锚点，不代表已登场）：\n${stageCharacterLines(related.actorIds).join('\n')}`,
    `本阶段必要地点（进入 Runtime 仍需合法写回）：\n${stagePlaceLines(related.placeIds).join('\n')}`,
    `允许写回类型：${stage.allowedWritebackKinds.join('、')}`,
    `案件边界：进入阶段不自动立案；允许条件=${stage.caseBoundary.allowedConditions.join('；')}；禁止条件=${stage.caseBoundary.forbiddenConditions.join('；')}`
  ].join('\n');

  return {
    ref: { ...urbanLegendsFormalSourceRef },
    contentIdentity,
    arcKey: urbanLegendsFormalIds.arcKey,
    ...(mode === 'first_exposure'
      ? { initialStageId: urbanLegendsFormalIds.stages.streetRumor }
      : {}),
    currentStageId: stage.stageId,
    arcProgressContract: narrowedProgressContract(stage, nodes),
    detailedContext,
    confirmedFacts: [],
    mutableElements: [
      `当前阶段=${stage.stageId}`,
      ...nodes.map((node) => `当前可用节点=${node.nodeId}`),
      ...(allowedNextStageId ? [`唯一允许下一阶段=${allowedNextStageId}`] : [])
    ],
    forbiddenAdaptations: unique([
      '不得发送、引用或暗示当前阶段之后尚未到达的阶段内容。',
      '不得把候选秘密域、人物信念或关系种子写成客观事实。',
      '不得强制玩家介入，也不得仅因选择 DLC 自动创建案件。',
      '不得确认鬼魂、超能力或超自然巴士客观存在。',
      '所有世界变化必须继续通过既有 Runtime 写回；阶段状态不能替代世界事实。',
      '玩家忽略、失败或退出不得重置剧情弧、清空既有事实或重新执行首次曝光。',
      'NPC 后台演化必须服从人物信息边界，并由实际应用写回证明；不得凭空知情或强迫玩家回到前景。',
      ...(stage.stageId === urbanLegendsFormalIds.stages.aftermath
        ? [
            `主 Arc 完成不自动完成整个 DLC：${urbanLegendsDlcCompletionPolicy.currentVersionPolicy}`
          ]
        : []),
      ...stage.forbiddenConfirmations,
      ...nodes.flatMap((node) => [...node.forbiddenConfirmations])
    ])
  };
}
