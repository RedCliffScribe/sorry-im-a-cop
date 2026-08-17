import { urbanLegendsFormalCharacters, urbanLegendsFormalIds } from './content';
import { urbanLegendsFormalStageContracts } from './stageContracts';
import type {
  UrbanLegendsDlcCompletionPolicy,
  UrbanLegendsNewsEvolutionTemplate,
  UrbanLegendsNpcAutonomyContract,
  UrbanLegendsPlayerEngagementContract,
  UrbanLegendsPlayerEngagementKind,
  UrbanLegendsResolutionContract,
  UrbanLegendsStageWorldFeedbackContract,
  UrbanLegendsStageWritebackKind
} from './types';

const allWorldResultWritebacks: readonly UrbanLegendsStageWritebackKind[] = [
  'signal',
  'currentMatter',
  'newsIssue',
  'relationshipThread',
  'actorMemory',
  'case',
  'actor',
  'citySituation'
];

const sharedForbiddenEngagementResults = [
  '不得因玩家忽略、失败或退出而重置剧情弧、清空已成立事实或重新执行首次曝光。',
  '不得把正文中的态度或意图当成已经应用的世界变化。',
  '不得为了提醒玩家而在没有新渠道、新后果时反复投送同一传闻。',
  '不得让阶段状态代替 Signal、Matter、News、Relationship、Memory、Case 等世界事实。'
] as const;

function decisionsFor(
  kind: UrbanLegendsPlayerEngagementKind,
  completionAllowed: boolean
): UrbanLegendsPlayerEngagementContract['allowedArcDecisions'] {
  if (completionAllowed) {
    if (kind === 'intervene' || kind === 'failed_attempt') return ['remain', 'complete'];
    return ['remain', 'complete', 'abandon'];
  }
  if (kind === 'intervene' || kind === 'failed_attempt') return ['remain', 'advance_stage'];
  return ['remain', 'advance_stage', 'abandon'];
}

function engagementContract(
  kind: UrbanLegendsPlayerEngagementKind,
  allowedWritebackKinds: readonly UrbanLegendsStageWritebackKind[],
  completionAllowed: boolean
): UrbanLegendsPlayerEngagementContract {
  const rules: Record<UrbanLegendsPlayerEngagementKind, string> = {
    intervene: '玩家介入只承接其本回合实际行动；调查、公开、压下或利用都必须留下与结果一致的通用 Runtime 事实。',
    ignore: '玩家忽略本身不是阶段进展；允许剧情弧等待，或由具备信息渠道的 NPC 通过已应用世界变化继续发展，但不得强迫玩家回到前景。',
    failed_attempt: '失败形成新的世界状态而不是回档；关系恶化、证据丢失、人物退出或新闻失控可以成为进展证据，但失败描述本身不足以推进。',
    withdraw: '玩家可以离开、拒绝请求或停止调查；保留同一个 Arc、当前阶段和既有事实，后续 NPC 行动也不得伪装成玩家继续介入。'
  };
  const consequences: Record<UrbanLegendsPlayerEngagementKind, readonly string[]> = {
    intervene: ['形成可核对的新事实。', '改变人物信任、信息通道或现实事项。', '公开、移交、压下或利用已经存在的信息。'],
    ignore: ['剧情弧保持等待。', 'NPC 在已知渠道内继续行动。', '证据随时间失效或传闻自然衰减、变形。'],
    failed_attempt: ['人物拒绝合作或改变说法。', '证据丢失、污染或转移。', '组织、媒体、家庭或生意承担现实代价。'],
    withdraw: ['玩家退出前景。', '人物和机构按自身利益继续或停止。', '剧情弧保持、偏转或在有据后被放弃。']
  };
  return {
    kind,
    narrativeRule: rules[kind],
    allowedArcDecisions: decisionsFor(kind, completionAllowed),
    allowedWritebackKinds,
    requiresAppliedWritebackForProgress: true,
    preservesArcInstanceId: true,
    neverResetsStage: true,
    reminderPolicy: 'no_forced_reminder',
    possibleWorldConsequences: consequences[kind],
    forbiddenResults: [...sharedForbiddenEngagementResults]
  };
}

const autonomyActionsByStage = {
  [urbanLegendsFormalIds.stages.streetRumor]: [
    '亲属继续寻人、补充或收回公开说法。',
    '街坊、司机、站务和记者在各自信息渠道内传播、核对或压下传闻。',
    '传闻影响夜间人流、生意或人物态度，但不自动上升为全城局势。'
  ],
  [urbanLegendsFormalIds.stages.firstClues]: [
    '司机、站务或证人核对记录、修正证词或拒绝继续合作。',
    '亲属、记者或警员寻找彼此独立的时间、地点和物件证据。',
    '记录可能被保全、补录、遗失或因现实压力变得更难取得。'
  ],
  [urbanLegendsFormalIds.stages.interestConflict]: [
    '媒体、运输机构、家庭、警方或街面人物公开、压下或重新解释已有信息。',
    '人物为了职业、家庭、生意或组织关系采取有现实代价的行动。',
    '信息渠道可能因交易、失信、施压或保护而改变。'
  ],
  [urbanLegendsFormalIds.stages.truthInvestigation]: [
    '人物提供、保留、移交或拒绝关键材料。',
    '机构根据已经成立的证据采取现实程序行动。',
    '竞争性解释被检验，但人物信念不得被升级为全局真相。'
  ],
  [urbanLegendsFormalIds.stages.aftermath]: [
    '人物根据已经发生的结果继续生活、离职、和解、决裂或退出公共视野。',
    '媒体、社区和机构形成可能不同的长期说法。',
    '传闻可以消退、变形或保留一处具体残余，但不扩张为超自然系统。'
  ]
} as const;

function npcAutonomyContract(stageId: string): UrbanLegendsNpcAutonomyContract {
  const stage = urbanLegendsFormalStageContracts.find((candidate) => candidate.stageId === stageId);
  const actorIds = new Set(
    stage?.nodes.flatMap((node) => [...node.relevantActorIds]) ?? []
  );
  return {
    eligibleActorIds: urbanLegendsFormalCharacters
      .map((actor) => actor.actorId)
      .filter((actorId) => actorIds.has(actorId)),
    possibleActions: autonomyActionsByStage[stageId as keyof typeof autonomyActionsByStage] ?? [],
    requiresEstablishedActorOrExplicitActorWriteback: true,
    requiresKnownInformationChannel: true,
    requiresAppliedWritebackForStageProgress: true,
    mayContinueOutsidePlayerView: true,
    mayForcePlayerReturn: false,
    forbiddenResults: [
      '不得让未建立的人物凭空知道当前进展。',
      '不得让所有人物共享同一解释、同一记忆或同一消息来源。',
      '不得以 NPC 后台行动为理由自动创建 Case、RelationshipThread 或城市级危机。',
      '不得在没有实际写回时宣告 NPC 已经改变世界。'
    ]
  };
}

export const urbanLegendsResolutionContracts: readonly UrbanLegendsResolutionContract[] = [
  {
    resolutionId: urbanLegendsFormalIds.resolutions.realityLeaning,
    mode: 'reality_leaning',
    title: '现实偏向',
    narrativeBoundary: '大部分关键事实获得普通犯罪、个人选择、记忆误差、机构失误或利益隐瞒等现实解释；城市仍可以继续流传一个与事实不同的版本。',
    minimumEvidence: [
      '至少一组已应用 Runtime 事实支持可行动的现实解释。',
      '关键人物的动机、记录或行动与该解释能够相互核对。',
      '对仍未确认的部分明确标记为未知，而不是顺手补全。'
    ],
    requiredWorldResults: [
      '把已确认事实和人物信念分开保存。',
      '更新受到结果影响的事项、案件、关系、记忆或新闻。',
      '保留人物和城市对结论可能不同的理解。'
    ],
    allowedWritebackKinds: allWorldResultWritebacks,
    forbiddenClaims: [
      '不得声称现实解释覆盖了所有异常细节。',
      '不得让所有人物自动接受同一结论。',
      '不得以结局为理由清除既有传闻、人物或历史。'
    ]
  },
  {
    resolutionId: urbanLegendsFormalIds.resolutions.pluralAmbiguity,
    mode: 'plural_ambiguity',
    title: '多重暧昧',
    narrativeBoundary: '两套或以上解释各自获得具体事实支持，但没有一套能够覆盖全部证据；玩家和不同人物可以据此采取不同的现实行动。',
    minimumEvidence: [
      '至少两套解释分别对应不同的已应用 Runtime 事实。',
      '解释之间存在明确且尚未解决的冲突。',
      '玩家已经形成足以采取行动或停止调查的判断。'
    ],
    requiredWorldResults: [
      '记录各人物实际相信或公开了什么。',
      '让新闻、关系、案件或事项体现解释分歧的现实后果。',
      '只把可确认部分写成客观事实。'
    ],
    allowedWritebackKinds: allWorldResultWritebacks,
    forbiddenClaims: [
      '不得用“真相不可知”跳过已能确认的现实事实。',
      '不得把多种人物信念合并成一个全局结论。',
      '不得以暧昧为理由确认超自然存在。'
    ]
  },
  {
    resolutionId: urbanLegendsFormalIds.resolutions.boundedResidue,
    mode: 'bounded_unexplained_residue',
    title: '有界未解释残余',
    narrativeBoundary: '玩家已经形成可行动结论，但保留一处或少数具有稳定证据边界、无法完全核对的具体残余。',
    minimumEvidence: [
      '已确认事实足以支持现实行动或正式结论。',
      '残余必须指向一项具体记录、物件、时间差或独立证词。',
      '残余无法由当前证据确认，也不能被写成全局客观事实。'
    ],
    requiredWorldResults: [
      '保存已经确认的现实结论。',
      '把残余作为 Signal、人物信念或新闻争议等合适的非真值结构保留。',
      '让人物和城市继续以不同方式记忆该残余。'
    ],
    allowedWritebackKinds: allWorldResultWritebacks,
    forbiddenClaims: [
      '不得确认鬼魂、灵异力量或超自然巴士客观存在。',
      '不得让残余扩张为超能力、怪物、驱魔或灵异战斗系统。',
      '不得用无限新增异常来回避已有现实证据。'
    ]
  }
];

export const urbanLegendsNewsEvolutionTemplates: readonly UrbanLegendsNewsEvolutionTemplate[] = [
  {
    templateId: urbanLegendsFormalIds.news.firstPublicRumor,
    availableStageIds: [
      urbanLegendsFormalIds.stages.streetRumor,
      urbanLegendsFormalIds.stages.firstClues
    ],
    purpose: '在传闻已经通过记者、报馆、公开报案或足够广泛的社区传播进入公共视野时，记录第一版公开说法。',
    allowedWhen: ['本回合确有公开传播事实。', '来源和公开范围可以说明。', '新闻内容与当前阶段已知事实一致。'],
    publicFactBoundary: '新闻发布本身可以成为事实；标题、消息来源和报道中的判断仍只是公开说法。',
    forbiddenClaims: ['不得只因玩家听见传闻就自动发布新闻。', '不得把新闻内容升级为客观真相。']
  },
  {
    templateId: urbanLegendsFormalIds.news.contestedCoverage,
    availableStageIds: [urbanLegendsFormalIds.stages.interestConflict],
    purpose: '承接媒体、亲属、运输机构、警方或街面人物围绕同一事件争夺公开叙述的现实冲突。',
    allowedWhen: ['至少两个利益方实际形成不同公开立场。', '本回合存在发布、施压、澄清、撤稿或消息交易等世界变化。'],
    publicFactBoundary: '可以确认谁发布、回应或施压；各方陈述仍必须按来源保存，不得合并为全局事实。',
    forbiddenClaims: ['不得把争议写成所有媒体一致炒作。', '不得预设警方、社团或运输机构整体共谋。']
  },
  {
    templateId: urbanLegendsFormalIds.news.correctionOrSilence,
    availableStageIds: [
      urbanLegendsFormalIds.stages.truthInvestigation,
      urbanLegendsFormalIds.stages.aftermath
    ],
    purpose: '承接已有报道被修正、压下、撤回、冷处理或被新事实重新解释的公共变化。',
    allowedWhen: ['此前确有相关公开说法。', '新证据、机构决定或人物行动实际改变了公共叙述。'],
    publicFactBoundary: '只确认公开版本发生了什么变化；沉默、撤稿或修正不自动证明任何幕后解释。',
    forbiddenClaims: ['不得凭新闻沉默推断共谋。', '不得以更正稿宣告唯一真相。']
  },
  {
    templateId: urbanLegendsFormalIds.news.aftermathRetelling,
    availableStageIds: [urbanLegendsFormalIds.stages.aftermath],
    purpose: '记录事件结束后传闻如何消退、变形、被纪念或继续影响一小部分人的生活。',
    allowedWhen: ['Arc 已进入余波阶段。', '本回合确有新的公共记忆、纪念、遗忘或传播事实。'],
    publicFactBoundary: '城市如何讲述事件可以成为事实；讲述内容仍不等于事件的客观真相。',
    forbiddenClaims: ['不得把传闻继续存在写成超自然证明。', '不得为制造余波而虚构全城持续恐慌。']
  }
];

const resolutionIds = urbanLegendsResolutionContracts.map((resolution) => resolution.resolutionId);

export const urbanLegendsStageWorldFeedbackContracts: readonly UrbanLegendsStageWorldFeedbackContract[] =
  urbanLegendsFormalStageContracts.map((stage) => {
    const completionAllowed = stage.stageId === urbanLegendsFormalIds.stages.aftermath;
    const availableResolutionIds =
      stage.stageId === urbanLegendsFormalIds.stages.truthInvestigation || completionAllowed
        ? resolutionIds
        : [];
    return {
      stageId: stage.stageId,
      engagement: {
        intervene: engagementContract('intervene', stage.allowedWritebackKinds, completionAllowed),
        ignore: engagementContract('ignore', stage.allowedWritebackKinds, completionAllowed),
        failed_attempt: engagementContract('failed_attempt', stage.allowedWritebackKinds, completionAllowed),
        withdraw: engagementContract('withdraw', stage.allowedWritebackKinds, completionAllowed)
      },
      npcAutonomy: npcAutonomyContract(stage.stageId),
      completionAllowed,
      availableResolutionIds
    };
  });

export const urbanLegendsDlcCompletionPolicy: UrbanLegendsDlcCompletionPolicy = {
  primaryArcId: urbanLegendsFormalIds.arcKey,
  primaryArcCompletionCompletesDlc: false,
  automaticallyMutatesBindingStatus: false,
  completedArcHistoryIsRetained: true,
  completedActorsRemainOrdinaryWorldActors: true,
  currentVersionPolicy: 'keep_dlc_active_after_primary_arc',
  futureDlcCompletionRequirements: [
    '必须由正式 Manifest 的 DLC 级完成策略决定，而不是由单条 Arc 自动推断。',
    '必须保留人物、关系、新闻、案件、记忆和城市影响。',
    '正式 1.0 在仅有主 Arc 的情况下仍不自动改写存档绑定状态。'
  ]
};

export function getUrbanLegendsStageWorldFeedbackContract(
  stageId: string
): UrbanLegendsStageWorldFeedbackContract | undefined {
  return urbanLegendsStageWorldFeedbackContracts.find((contract) => contract.stageId === stageId);
}

export function getUrbanLegendsResolutionContractsForStage(
  stageId: string
): readonly UrbanLegendsResolutionContract[] {
  const feedback = getUrbanLegendsStageWorldFeedbackContract(stageId);
  if (!feedback) return [];
  const allowed = new Set(feedback.availableResolutionIds);
  return urbanLegendsResolutionContracts.filter((resolution) => allowed.has(resolution.resolutionId));
}

export function getUrbanLegendsNewsEvolutionTemplatesForStage(
  stageId: string
): readonly UrbanLegendsNewsEvolutionTemplate[] {
  return urbanLegendsNewsEvolutionTemplates.filter((template) =>
    template.availableStageIds.includes(stageId)
  );
}
