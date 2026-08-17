import type { PromptContext } from '../../context/selectContext';
import { withDramaSourceCoherenceMetadata } from '../../drama/coherence';
import type { ProjectedDramaSourceProvider } from '../../drama/sourceRegistry';
import type { ExecutionPayload, PlanningSource } from '../../drama/types';
import {
  getOfficialDlcRuntimeManifest,
  isOfficialDlcSupportedByWorldpack
} from '../manifest';
import {
  OFFICIAL_DLC_PROVIDER_ID,
  type OfficialDlcDramaSourceRef
} from '../types';
import {
  getUrbanLegendsAlphaEntryRoute,
  urbanLegendsAlphaCharacters,
  urbanLegendsAlphaEventGroup,
  urbanLegendsAlphaManifest,
  urbanLegendsAlphaNewsTemplate,
  urbanLegendsAlphaPlaces
} from './content';

const EVENT_ARC_KEY = 'official-dlc:urban_legends_alpha:midnight_bus';

function isActiveAndSupported(context: PromptContext): boolean {
  const manifest = getOfficialDlcRuntimeManifest(
    urbanLegendsAlphaManifest.dlcId,
    urbanLegendsAlphaManifest.version
  );
  return Boolean(
    manifest?.dramaIntegration?.enabled &&
      isOfficialDlcSupportedByWorldpack(manifest, context.worldpackId) &&
      context.officialDlcBindings?.some(
        (binding) =>
          binding.dlcId === urbanLegendsAlphaManifest.dlcId &&
          binding.version === urbanLegendsAlphaManifest.version &&
          binding.status === 'active'
      )
  );
}

function ref(
  sourceType: OfficialDlcDramaSourceRef['sourceType'],
  sourceId: string
): OfficialDlcDramaSourceRef {
  return {
    providerId: OFFICIAL_DLC_PROVIDER_ID,
    sourceType,
    sourceId,
    dlcId: urbanLegendsAlphaManifest.dlcId
  };
}

function identitySummary(context: PromptContext): string {
  const route = getUrbanLegendsAlphaEntryRoute(
    context.identityProjection.currentShell.currentIdentity
  );
  return `本局身份入口：${route.label}。${route.hook}`;
}

function cloneSource(source: PlanningSource): PlanningSource {
  return {
    ...source,
    ref: { ...source.ref },
    channelIds: [...source.channelIds],
    softAffinities: Object.fromEntries(
      Object.entries(source.softAffinities).map(([key, values]) => [key, [...values]])
    ),
    relatedActorIds: [...source.relatedActorIds],
    relatedOrganizationIds: [...source.relatedOrganizationIds],
    relatedPlaceIds: [...source.relatedPlaceIds],
    relatedCaseIds: [...source.relatedCaseIds],
    ...(source.arcProgressContract
      ? {
          arcProgressContract: {
            stageIds: [...source.arcProgressContract.stageIds],
            nodeIdsByStage: Object.fromEntries(
              Object.entries(source.arcProgressContract.nodeIdsByStage).map(([stageId, nodeIds]) => [
                stageId,
                [...nodeIds]
              ])
            ),
            ...(source.arcProgressContract.allowedNextStageIds
              ? {
                  allowedNextStageIds: Object.fromEntries(
                    Object.entries(source.arcProgressContract.allowedNextStageIds).map(
                      ([stageId, nextStageIds]) => [stageId, [...nextStageIds]]
                    )
                  )
                }
              : {})
          }
        }
      : {}),
    ...(source.evidenceRefs
      ? { evidenceRefs: source.evidenceRefs.map((item) => ({ ...item })) }
      : {})
  };
}

const officialSources: readonly PlanningSource[] = [
  withDramaSourceCoherenceMetadata({
    ref: ref('official_dlc_event', urbanLegendsAlphaEventGroup.eventGroupId),
    arcKey: EVENT_ARC_KEY,
    arcProgressContract: {
      stageIds: urbanLegendsAlphaEventGroup.stages.map((stage) => stage.stageId),
      nodeIdsByStage: Object.fromEntries(
        urbanLegendsAlphaEventGroup.stages.map((stage) => [
          stage.stageId,
          stage.nodes.map((node) => node.nodeId)
        ])
      ),
      allowedNextStageIds: Object.fromEntries(
        urbanLegendsAlphaEventGroup.stages.map((stage, index) => [
          stage.stageId,
          urbanLegendsAlphaEventGroup.stages[index + 1]
            ? [urbanLegendsAlphaEventGroup.stages[index + 1].stageId]
            : []
        ])
      )
    },
    title: urbanLegendsAlphaEventGroup.title,
    plannerSummary: `${urbanLegendsAlphaEventGroup.summary}；这是玩家主动选择的官方内容候选，不强制发生。`,
    sourceStatus: 'static_seed',
    reusePolicy: 'context_reusable',
    priorityClass: 'user_requested',
    channelIds: ['custom_events'],
    softAffinities: {
      entryIdentity: ['police', 'civilian', 'gang_member'],
      eventGroupId: [urbanLegendsAlphaEventGroup.eventGroupId]
    },
    mandatory: false,
    score: 145,
    relatedActorIds: [...urbanLegendsAlphaEventGroup.characterIds],
    relatedOrganizationIds: [],
    relatedPlaceIds: [...urbanLegendsAlphaEventGroup.placeIds],
    relatedCaseIds: []
  }),
  ...urbanLegendsAlphaCharacters.map((character) =>
    withDramaSourceCoherenceMetadata({
      ref: ref('official_dlc_character', character.actorId),
      arcKey: EVENT_ARC_KEY,
      title: character.name,
      plannerSummary: `${character.publicIdentity}；${character.profileSummary}；尚未确认已与玩家接触。`,
      sourceStatus: 'static_seed',
      reusePolicy: 'entity_singleton',
      priorityClass: 'normal',
      channelIds: ['custom_characters'],
      softAffinities: { eventGroupId: [urbanLegendsAlphaEventGroup.eventGroupId] },
      mandatory: false,
      score: 38,
      relatedActorIds: [character.actorId],
      relatedOrganizationIds: [],
      relatedPlaceIds: [character.commonPlaceId],
      relatedCaseIds: []
    })
  ),
  withDramaSourceCoherenceMetadata({
    ref: ref('official_dlc_news', urbanLegendsAlphaNewsTemplate.newsId),
    arcKey: EVENT_ARC_KEY,
    title: urbanLegendsAlphaNewsTemplate.headline,
    plannerSummary: `${urbanLegendsAlphaNewsTemplate.summary}；属于未完成核实的公共传闻。`,
    sourceStatus: 'rumor',
    reusePolicy: 'context_reusable',
    priorityClass: 'normal',
    channelIds: ['city_news'],
    softAffinities: { eventGroupId: [urbanLegendsAlphaEventGroup.eventGroupId] },
    mandatory: false,
    score: 44,
    relatedActorIds: [
      'official_dlc_urban_legends_night_bus_driver',
      'official_dlc_urban_legends_missing_passenger_relative',
      'official_dlc_urban_legends_young_reporter'
    ],
    relatedOrganizationIds: [],
    relatedPlaceIds: [...urbanLegendsAlphaEventGroup.placeIds],
    relatedCaseIds: []
  })
];

function findSource(refToFind: OfficialDlcDramaSourceRef): PlanningSource | undefined {
  return officialSources.find(
    (candidate) =>
      candidate.ref.sourceType === refToFind.sourceType &&
      candidate.ref.sourceId === refToFind.sourceId
  );
}

function eventDetailedContext(context: PromptContext): string {
  const stageText = urbanLegendsAlphaEventGroup.stages
    .map((stage) =>
      `${stage.stageId}/${stage.title}：${stage.summary}\n` +
      stage.nodes
        .map((node) => `- ${node.nodeId}/${node.title}：${node.summary}（入口：${node.entryRoutes.join('、')}）`)
        .join('\n')
    )
    .join('\n');
  const characterText = urbanLegendsAlphaCharacters
    .map(
      (character) =>
        `${character.actorId}：${character.name}，${character.publicIdentity}，${character.occupation}；${character.profileSummary}；常见地点=${character.commonPlaceId}`
    )
    .join('\n');
  const placeText = urbanLegendsAlphaPlaces
    .map((place) => `${place.placeId}：${place.name}；${place.summary}`)
    .join('\n');
  return [
    `官方 DLC：${urbanLegendsAlphaManifest.title} ${urbanLegendsAlphaManifest.version}`,
    `官方事件组：${urbanLegendsAlphaEventGroup.eventGroupId}；${urbanLegendsAlphaEventGroup.title}`,
    `事件主题：${urbanLegendsAlphaEventGroup.summary}`,
    '叙事基调：1988 香港、警匪片现实感、真假难辨；默认解释为 ambiguous。',
    identitySummary(context),
    `事件阶段：\n${stageText}`,
    `官方人物（只可按现有写回创建或承接，不代表已经在场）：\n${characterText}`,
    `官方地点（只作为内容锚点；进入 Runtime 仍需沿用既有地点写回）：\n${placeText}`,
    `新闻模板：${urbanLegendsAlphaNewsTemplate.newsId}；${urbanLegendsAlphaNewsTemplate.headline}；${urbanLegendsAlphaNewsTemplate.summary}`
  ].join('\n');
}

function characterDetailedContext(actorId: string): string | undefined {
  const character = urbanLegendsAlphaCharacters.find((item) => item.actorId === actorId);
  if (!character) return undefined;
  return [
    `官方 DLC 人物：${character.actorId}`,
    `姓名：${character.name}；年龄：${character.age}`,
    `公开身份：${character.publicIdentity}；职业：${character.occupation}`,
    `性格：${character.personality}`,
    `动机：${character.motivation}`,
    `说话方式：${character.speechStyle}`,
    `常见地点：${character.commonPlaceId}`,
    `人物功能：${character.profileSummary}`
  ].join('\n');
}

export const urbanLegendsAlphaProvider: ProjectedDramaSourceProvider = {
  providerId: OFFICIAL_DLC_PROVIDER_ID,
  listForAudit() {
    return officialSources.map(cloneSource);
  },
  list(context) {
    if (!isActiveAndSupported(context)) return [];
    return officialSources.map(cloneSource);
  },
  getExecutionPayload(context, sourceRef): ExecutionPayload | undefined {
    if (!isActiveAndSupported(context)) return undefined;
    const typedRef = sourceRef as OfficialDlcDramaSourceRef;
    if (typedRef.dlcId !== urbanLegendsAlphaManifest.dlcId) return undefined;
    const source = findSource(typedRef);
    if (!source) return undefined;

    if (typedRef.sourceType === 'official_dlc_event') {
      return {
        ref: { ...typedRef },
        arcKey: source.arcKey ?? EVENT_ARC_KEY,
        initialStageId: source.arcProgressContract?.stageIds[0],
        ...(source.arcProgressContract
          ? { arcProgressContract: cloneSource(source).arcProgressContract }
          : {}),
        detailedContext: eventDetailedContext(context),
        confirmedFacts: [],
        mutableElements: [
          '阶段可以停留、推进、偏转或结束；只有同回合结构化写回支持的事实才成立。',
          ...urbanLegendsAlphaEventGroup.stages.map((stage) => `${stage.stageId}/${stage.title}`),
          ...urbanLegendsAlphaEventGroup.entryRoutes.map((route) => `${route.identity}入口：${route.label}`),
          `新闻候选：${urbanLegendsAlphaNewsTemplate.headline}`
        ],
        forbiddenAdaptations: [
          '不能确认鬼魂、超能力或灵异战斗真实存在；异常必须保留现实解释与不确定性。',
          '不能强制玩家遇到、接受或完成事件；玩家可以忽略、调查、转向或放弃。',
          '不能把官方人物、地点或新闻模板直接当作已经写入存档的 Actor、Place 或 NewsIssue。',
          'Runtime 只使用既有 currentMatter、signal、newsIssue、relationshipThread、actor 和 case 写回。',
          '不得创建 DLC 专属 Runtime 类型、任务系统或调度器。'
        ]
      };
    }

    if (typedRef.sourceType === 'official_dlc_character') {
      const detailedContext = characterDetailedContext(typedRef.sourceId);
      if (!detailedContext) return undefined;
      return {
        ref: { ...typedRef },
        detailedContext,
        confirmedFacts: [],
        mutableElements: ['接触路径、当前地点和与玩家的关系必须以本回合结构化写回为准。'],
        forbiddenAdaptations: [
          '人物资料不是已经登场或认识玩家的事实。',
          '不得仅凭名字或相似描述绑定其他 Actor；若创建人物，使用该稳定官方 DLC actorId。',
          '不得替玩家确认关系、职业事项或隐藏身份。'
        ]
      };
    }

    return {
      ref: { ...typedRef },
      detailedContext: [
        `官方新闻模板：${urbanLegendsAlphaNewsTemplate.newsId}`,
        `标题：${urbanLegendsAlphaNewsTemplate.headline}`,
        `摘要：${urbanLegendsAlphaNewsTemplate.summary}`,
        `来源标记：${urbanLegendsAlphaNewsTemplate.sourceLabel}`
      ].join('\n'),
      confirmedFacts: [],
      mutableElements: ['新闻是否公开、何时公开、哪些事实可以写入 NewsIssue 由本回合结构化写回决定。'],
      forbiddenAdaptations: [
        '新闻模板是公共传闻候选，不等于真相，也不等于所有人物已经读报或知情。',
        '不得用新闻模板替代案件、人物、地点或关系的结构化写回。'
      ]
    };
  }
};
