import type { PromptContext } from '../../context/selectContext';
import { withDramaSourceCoherenceMetadata } from '../../drama/coherence';
import type {
  DramaCaseContinuityPolicy,
  DramaExposureEvidenceTextSignature,
  ExecutionPayload,
  NarrativeArcContentIdentity,
  NarrativeArcContinuationSnapshot,
  NarrativeArcProgressContract,
  NarrativeArcStageProjection,
  PlanningSource
} from '../../drama/types';
import type { CurrentIdentity } from '../../runtime/types';
import {
  urbanLegendsFormalCharacters,
  urbanLegendsFormalIds,
  urbanLegendsFormalManifest,
  urbanLegendsFormalPlaces
} from './content';
import { urbanLegendsLastDeliveryArc } from './lastDelivery';

export { urbanLegendsLastDeliveryArc } from './lastDelivery';

type ExpandedWritebackKind =
  | 'actor'
  | 'signal'
  | 'currentMatter'
  | 'newsIssue'
  | 'relationshipThread'
  | 'actorMemory'
  | 'case'
  | 'citySituation';

interface ExpandedActorAnchor {
  actorId: string;
  name: string;
  publicIdentity: string;
  publicFacts: readonly string[];
  informationBoundary: readonly string[];
  forbiddenConfirmations: readonly string[];
}

interface ExpandedPlaceAnchor {
  placeId: string;
  name: string;
  summary: string;
}

interface ExpandedArcNode {
  nodeId: string;
  title: string;
  narrativeUse: string;
  compatibleIdentities: readonly CurrentIdentity[];
  relevantActorIds: readonly string[];
  relevantPlaceIds: readonly string[];
  permittedFactKinds: readonly string[];
  progressSignals: readonly string[];
  forbiddenConfirmations: readonly string[];
  allowedWritebackKinds: readonly ExpandedWritebackKind[];
}

interface ExpandedArcStage {
  stageId: string;
  title: string;
  narrativeFunction: string;
  allowedNextStageIds: readonly string[];
  permittedFactKinds: readonly string[];
  advanceSignals: readonly string[];
  insufficientOnTheirOwn: readonly string[];
  remainWhen: readonly string[];
  advanceWhen: readonly string[];
  transitionMeaning: string;
  forbiddenConfirmations: readonly string[];
  identityHints: Readonly<Record<CurrentIdentity, readonly string[]>>;
  allowedWritebackKinds: readonly ExpandedWritebackKind[];
  caseAllowedConditions: readonly string[];
  caseForbiddenConditions: readonly string[];
  nodes: readonly ExpandedArcNode[];
}

interface ExpandedEntryRoute {
  contactSources: readonly string[];
  permissions: readonly string[];
  restrictions: readonly string[];
  diversionRoutes: readonly string[];
}

export interface UrbanLegendsExpandedArcDefinition {
  contentId: string;
  arcKey: string;
  title: string;
  plannerSummary: string;
  initialStageId: string;
  entryRoutes: Readonly<Record<CurrentIdentity, ExpandedEntryRoute>>;
  actors: readonly ExpandedActorAnchor[];
  places: readonly ExpandedPlaceAnchor[];
  stages: readonly ExpandedArcStage[];
  /**
   * Stable incident-level constraints that apply across every stage and every
   * continuation of this Arc. They prevent a persistent story from being
   * re-adapted as a fresh parallel incident without turning candidate secrets
   * into Runtime facts.
   */
  continuityInvariants?: readonly string[];
  /** Legacy-save exposure recovery only; never projected as story facts. */
  exposureEvidenceTextSignatures?: readonly DramaExposureEvidenceTextSignature[];
  /** Local writeback policy for long incidents that must reuse one linked case. */
  caseContinuityPolicy?: DramaCaseContinuityPolicy;
  newsEvolution: readonly string[];
  resolutionBoundaries: readonly string[];
}

export interface UrbanLegendsShortRumorSeed {
  sourceId: string;
  title: string;
  summary: string;
  entryHints: Readonly<Record<CurrentIdentity, string>>;
  confirmableFacts: readonly string[];
  forbiddenConfirmations: readonly string[];
  relatedPlaceIds: readonly string[];
}

const allIdentities: readonly CurrentIdentity[] = ['police', 'civilian', 'gang_member'];
const ordinaryWritebacks: readonly ExpandedWritebackKind[] = [
  'actor',
  'signal',
  'currentMatter',
  'relationshipThread',
  'actorMemory'
];
const publicWritebacks: readonly ExpandedWritebackKind[] = [
  ...ordinaryWritebacks,
  'newsIssue',
  'case',
  'citySituation'
];

function node(input: ExpandedArcNode): ExpandedArcNode {
  return input;
}

const vacantFlatIds = {
  contentId: 'official_dlc_urban_legends_hk1988_vacant_flat_calls',
  arcKey: 'official-dlc:urban_legends:hk_1988:vacant_flat_calls',
  actors: {
    caretaker: 'official_dlc_urban_legends_hk1988_vacant_flat_caretaker',
    tenantSister: 'official_dlc_urban_legends_hk1988_vacant_flat_tenant_sister',
    linesman: 'official_dlc_urban_legends_hk1988_vacant_flat_linesman',
    broker: 'official_dlc_urban_legends_hk1988_vacant_flat_broker',
    resident: 'official_dlc_urban_legends_hk1988_vacant_flat_resident'
  },
  places: {
    tongLau: 'official_dlc_urban_legends_hk1988_vacant_flat_tong_lau',
    exchangeDesk: 'official_dlc_urban_legends_hk1988_vacant_flat_exchange_desk',
    estateOffice: 'official_dlc_urban_legends_hk1988_vacant_flat_estate_office'
  },
  stages: {
    streetRumor: 'official_dlc_urban_legends_hk1988_vacant_flat_stage_street_rumor',
    firstClues: 'official_dlc_urban_legends_hk1988_vacant_flat_stage_first_clues',
    interestConflict: 'official_dlc_urban_legends_hk1988_vacant_flat_stage_interest_conflict',
    truthInvestigation: 'official_dlc_urban_legends_hk1988_vacant_flat_stage_truth_investigation',
    aftermath: 'official_dlc_urban_legends_hk1988_vacant_flat_stage_aftermath'
  }
} as const;

const vacantFlatActors: readonly ExpandedActorAnchor[] = [
  {
    actorId: vacantFlatIds.actors.caretaker,
    name: '何福来',
    publicIdentity: '旧唐楼看更，负责夜间巡楼和收发杂务。',
    publicFacts: ['知道哪些单位实际有人出入。', '担心重建期间的工作和住处。'],
    informationBoundary: ['知道住客日常与门锁变化，不掌握电话局完整记录。'],
    forbiddenConfirmations: ['不能预设他替业主制造怪谈。', '不能预设他亲眼见鬼。']
  },
  {
    actorId: vacantFlatIds.actors.tenantSister,
    name: '梁美娟',
    publicIdentity: '曾住该单位的年轻女工梁少芬之姊。',
    publicFacts: ['想弄清妹妹离开单位前留下的物件和欠款。', '反感住客把私人往事讲成猎奇故事。'],
    informationBoundary: ['知道家庭与租住经历，只能转述妹妹曾经说过的话。'],
    forbiddenConfirmations: ['不能预设梁少芬已经死亡或失踪。', '不能把她的记忆当成电话记录。']
  },
  {
    actorId: vacantFlatIds.actors.linesman,
    name: '郑伟强',
    publicIdentity: '电话公司外线维修员。',
    publicFacts: ['可以检查时代可行的线路、接线盒与维修单。', '必须顾及公司责任与工序。'],
    informationBoundary: ['知道线路技术和维修记录，不知道住户私人动机。'],
    forbiddenConfirmations: ['不能凭技术身份自动解释所有来电。', '不能使用现代来电显示或数字追踪。']
  },
  {
    actorId: vacantFlatIds.actors.broker,
    name: '罗启明',
    publicIdentity: '承接旧楼收楼与转租的地产经纪。',
    publicFacts: ['希望尽快清理争议单位。', '掌握部分业主、租客和看楼安排。'],
    informationBoundary: ['知道交易和看楼渠道，不天然知道来电来源。'],
    forbiddenConfirmations: ['有收楼利益不等于制造事件。', '不能预设他与社团共谋。']
  },
  {
    actorId: vacantFlatIds.actors.resident,
    name: '冯玉琴',
    publicIdentity: '住在空屋楼下的夜班制衣女工。',
    publicFacts: ['多次听见楼上电话铃。', '作息使她经常在深夜回楼。'],
    informationBoundary: ['能说明自己听见的时间和声音，无法确认空屋内发生了什么。'],
    forbiddenConfirmations: ['听见铃声不等于接到鬼来电。', '不得让她知道未亲见的屋内事实。']
  }
];

const vacantFlatPlaces: readonly ExpandedPlaceAnchor[] = [
  {
    placeId: vacantFlatIds.places.tongLau,
    name: '砵兰街旧唐楼',
    summary: '等待收楼的混合住商唐楼；梯间、天井和老式线路令声音来源很难判断。'
  },
  {
    placeId: vacantFlatIds.places.exchangeDesk,
    name: '电话公司区内维修台',
    summary: '保存纸本维修单、号码转接和外线故障记录的工作地点，不提供现代数字追踪。'
  },
  {
    placeId: vacantFlatIds.places.estateOffice,
    name: '启明地产办事处',
    summary: '处理旧楼看楼、租约和收楼联络的小型铺面，消息、钥匙和利益在此交汇。'
  }
];

const vacantFlatStages: readonly ExpandedArcStage[] = [
  {
    stageId: vacantFlatIds.stages.streetRumor,
    title: '空屋铃声',
    narrativeFunction: '让已封单位深夜响起电话先成为住客之间可忽略但可核对的传闻，并建立具体楼层、时间与现实困扰。',
    allowedNextStageIds: [vacantFlatIds.stages.firstClues],
    permittedFactKinds: ['某人在具体时间确实听见铃声或接到一段话。', '单位封闭、门锁和线路的公开状态。', '传闻对住客、工作或收楼产生的现实影响。'],
    advanceSignals: ['出现可以核对的号码、时间、钥匙、维修单或目击者。', '两个独立来源在具体细节上冲突。'],
    insufficientOnTheirOwn: ['只有阴森气氛。', '只听见一次铃声。', '经过若干回合。'],
    remainWhen: ['没有可核对对象或实际世界变化。', '玩家当前行动与旧楼、住客或电话渠道无自然联系。'],
    advanceWhen: ['已应用写回把传闻落实为具体时间、线路、钥匙、人物或矛盾。'],
    transitionMeaning: '进入下一阶段只表示铃声有了现实抓手，不表示空屋有人、犯罪成立或超自然得到确认。',
    forbiddenConfirmations: ['确认亡灵来电。', '自动把空屋变成犯罪现场。', '强迫玩家入屋。'],
    identityHints: {
      police: ['从滋扰报案、楼宇纠纷或巡逻接触；没有程序事实不自动立案。'],
      civilian: ['从邻里、租住、工作或亲友关系进入；可以选择避开。'],
      gang_member: ['从收楼、生意和街面消息进入；不预设组织制造事件。']
    },
    allowedWritebackKinds: [...ordinaryWritebacks, 'newsIssue', 'case'],
    caseAllowedConditions: ['本回合形成正式滋扰、失踪、非法入屋或既有案件关联事实。'],
    caseForbiddenConditions: ['仅因电话铃或传闻立案。'],
    nodes: [
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_midnight_ring',
        title: '午夜铃声',
        narrativeUse: '核对住客实际听见的时间、持续长度和声音传播路径。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.resident, vacantFlatIds.actors.caretaker],
        relevantPlaceIds: [vacantFlatIds.places.tongLau],
        permittedFactKinds: ['具体听见时间。', '谁在楼内。', '门窗和梯间的公开状态。'],
        progressSignals: ['两个来源给出可比较的时间。'],
        forbiddenConfirmations: ['铃声来源自动确定。'],
        allowedWritebackKinds: ordinaryWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_old_number',
        title: '停用号码',
        narrativeUse: '让旧号码、转接、线路停用说法成为可核对对象。',
        compatibleIdentities: ['police', 'civilian'],
        relevantActorIds: [vacantFlatIds.actors.linesman, vacantFlatIds.actors.tenantSister],
        relevantPlaceIds: [vacantFlatIds.places.exchangeDesk, vacantFlatIds.places.tongLau],
        permittedFactKinds: ['号码曾由谁使用。', '纸本停用或维修记录。'],
        progressSignals: ['号码状态与实际铃声出现具体矛盾。'],
        forbiddenConfirmations: ['停用号码不可能响，因此必然灵异。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'case']
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_clearance_rumor',
        title: '收楼传言',
        narrativeUse: '检验传闻是否正在改变租户决定、看楼安排或收楼价格。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.broker, vacantFlatIds.actors.caretaker],
        relevantPlaceIds: [vacantFlatIds.places.estateOffice, vacantFlatIds.places.tongLau],
        permittedFactKinds: ['具体看楼或搬迁变化。', '某人公开提出的利益解释。'],
        progressSignals: ['有人因传闻采取有成本的行动。'],
        forbiddenConfirmations: ['利益相关者必然是幕后。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'newsIssue']
      })
    ]
  },
  {
    stageId: vacantFlatIds.stages.firstClues,
    title: '线路与住客',
    narrativeFunction: '把铃声转化为线路、钥匙、租住记录和人物证词之间可以核对却不能完全对齐的第一批线索。',
    allowedNextStageIds: [vacantFlatIds.stages.interestConflict],
    permittedFactKinds: ['纸本线路与维修记录。', '钥匙或出入记录。', '前租户与现住客各自可证实的行动。'],
    advanceSignals: ['发现谁因某种解释获益或受损。', '有人实际修改、隐藏或争夺记录。'],
    insufficientOnTheirOwn: ['找到任意三条线索。', '重复听录音式转述。', '只有判定成功。'],
    remainWhen: ['只有孤立线索，没有具体利益主体或现实后果。'],
    advanceWhen: ['已应用写回证明有人压制、利用或改变线路、租约、钥匙或叙述。'],
    transitionMeaning: '进入下一阶段只表示现实利益开始塑造证据，不表示来电来源已经确定。',
    forbiddenConfirmations: ['锁定唯一来电者。', '把交叉线故障当成全部答案。', '把记录缺失等同阴谋。'],
    identityHints: {
      police: ['按权限核对报案、物业和电话公司资料。'],
      civilian: ['通过住客、公开单据和生活关系核对。'],
      gang_member: ['通过收楼、债务和街面渠道核对，但区分消息与事实。']
    },
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['线索形成正式非法入屋、威吓、失踪或诈骗事实。'],
    caseForbiddenConditions: ['只因记录矛盾或线路异常立案。'],
    nodes: [
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_crossed_line',
        title: '交叉线路',
        narrativeUse: '检查老式线路串线、接线盒和维修痕迹能解释什么，又不能解释什么。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.linesman, vacantFlatIds.actors.caretaker],
        relevantPlaceIds: [vacantFlatIds.places.exchangeDesk, vacantFlatIds.places.tongLau],
        permittedFactKinds: ['具体线路状态。', '维修痕迹和工单。'],
        progressSignals: ['技术记录与住客时间线出现稳定差异。'],
        forbiddenConfirmations: ['技术解释自动否定全部证词。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'case']
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_spare_key',
        title: '备用钥匙',
        narrativeUse: '核对谁合法或非正式持有空屋钥匙，以及持钥如何影响各人说法。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.caretaker, vacantFlatIds.actors.broker],
        relevantPlaceIds: [vacantFlatIds.places.tongLau, vacantFlatIds.places.estateOffice],
        permittedFactKinds: ['钥匙实际持有人。', '看楼或入屋安排。'],
        progressSignals: ['持钥者改变说法或承担风险。'],
        forbiddenConfirmations: ['持有钥匙即证明来电造假。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'case']
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_tenant_belongings',
        title: '旧租客遗物',
        narrativeUse: '让遗留账单、便笺或生活物件提供有边界的私人时间线。',
        compatibleIdentities: ['police', 'civilian'],
        relevantActorIds: [vacantFlatIds.actors.tenantSister, vacantFlatIds.actors.resident],
        relevantPlaceIds: [vacantFlatIds.places.tongLau],
        permittedFactKinds: ['某件物品真实存在。', '物品与人物生活的可证实联系。'],
        progressSignals: ['遗物把来电内容连接到现实人物或日期。'],
        forbiddenConfirmations: ['遗物证明原租客遭遇。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'case']
      })
    ]
  },
  {
    stageId: vacantFlatIds.stages.interestConflict,
    title: '谁需要空屋',
    narrativeFunction: '让租户、业主、经纪、电话公司与街面利益围绕空屋的解释和使用方式产生现实冲突。',
    allowedNextStageIds: [vacantFlatIds.stages.truthInvestigation],
    permittedFactKinds: ['压价、逼迁、保护隐私或公司避责的具体行动。', '消息公开或压下造成的现实代价。'],
    advanceSignals: ['有人采取不可逆的公开、销毁、转租、闯入或离开行动。', '一种解释获得可系统检验的路径。'],
    insufficientOnTheirOwn: ['人物争吵。', '媒体或社团出现。'],
    remainWhen: ['冲突只有立场，没有改变关系、证据、住处或公开说法。'],
    advanceWhen: ['已应用写回证明某方承担具体代价或改变证据与信息流。'],
    transitionMeaning: '进入下一阶段只表示利益冲突产生了可检验路径，不表示任何一方必然犯罪。',
    forbiddenConfirmations: ['把收楼者写成固定反派。', '自动升级为暴力清场。'],
    identityHints: {
      police: ['面对物业程序、居民安全与公司责任。'],
      civilian: ['面对住处、隐私、工作与邻里压力。'],
      gang_member: ['面对地盘、收楼和消息交易，不默认组织共谋。']
    },
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['利益行动产生可验证的威吓、非法入屋、毁证或诈骗事实。'],
    caseForbiddenConditions: ['只因利益对立立案。'],
    nodes: [
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_eviction_pressure',
        title: '逼迁压力',
        narrativeUse: '检验传闻是否被用于催迁、压价或令住客放弃权利。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.broker, vacantFlatIds.actors.resident],
        relevantPlaceIds: [vacantFlatIds.places.tongLau, vacantFlatIds.places.estateOffice],
        permittedFactKinds: ['具体通知、交易或威吓。', '住客现实选择。'],
        progressSignals: ['行动改变住客、租约或证据保存。'],
        forbiddenConfirmations: ['所有收楼行动都非法。'],
        allowedWritebackKinds: publicWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_company_liability',
        title: '公司责任',
        narrativeUse: '让电话公司对工单、线路安全和公开说法作出现实选择。',
        compatibleIdentities: ['police', 'civilian'],
        relevantActorIds: [vacantFlatIds.actors.linesman, vacantFlatIds.actors.tenantSister],
        relevantPlaceIds: [vacantFlatIds.places.exchangeDesk],
        permittedFactKinds: ['公司实际调查或拒绝。', '工单被保存、修改或公开。'],
        progressSignals: ['机构决定改变核查或公开路径。'],
        forbiddenConfirmations: ['公司保守就证明掩盖灵异。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'newsIssue', 'case']
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_story_for_sale',
        title: '故事变现',
        narrativeUse: '检验记者、经纪或街坊如何把空屋故事变成报道、客源或筹码。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [urbanLegendsFormalIds.actors.reporter, vacantFlatIds.actors.broker],
        relevantPlaceIds: [vacantFlatIds.places.estateOffice, urbanLegendsFormalIds.places.chaChaanTeng],
        permittedFactKinds: ['报道或宣传确实发生。', '具体消息来源和受影响人物。'],
        progressSignals: ['公开版本迫使人物改变行动。'],
        forbiddenConfirmations: ['报道内容自动成为事实。'],
        allowedWritebackKinds: publicWritebacks
      })
    ]
  },
  {
    stageId: vacantFlatIds.stages.truthInvestigation,
    title: '来电时间线',
    narrativeFunction: '比较串线、秘密占用、威吓与记忆污染等现实解释，并把仍无法对齐的部分限制在具体记录或声音。',
    allowedNextStageIds: [vacantFlatIds.stages.aftermath],
    permittedFactKinds: ['至少两套可解释部分证据的路径。', '人物动机与记录可信度的冲突。', '玩家采取或停止现实行动的决定。'],
    advanceSignals: ['形成足以公开、移交、保护住客或停止调查的判断。', '有界残余已与现实事实分离。'],
    insufficientOnTheirOwn: ['模型宣布谜底。', '找到最后一件物品。'],
    remainWhen: ['没有可行动判断或残余仍无限扩张。'],
    advanceWhen: ['已应用写回支持现实决定及后果；允许保留一处具体未解细节。'],
    transitionMeaning: '进入余波只表示现实判断开始生效，不表示来电获得唯一解释或超自然成立。',
    forbiddenConfirmations: ['全知宣布鬼来电。', '让所有人物承认同一版本。'],
    identityHints: {
      police: ['区分可用于程序行动的证据与私人怀疑。'],
      civilian: ['可以公开、保护隐私、移交或退出。'],
      gang_member: ['可以判断谁在利用来电，但不能把街面消息变成警方事实。']
    },
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['调查形成符合程序的威吓、非法占用、诈骗或失踪事实。'],
    caseForbiddenConditions: ['用超自然判断替代案件事实。'],
    nodes: [
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_call_timeline',
        title: '来电时间线',
        narrativeUse: '把铃声、维修、看楼和住客作息组合为多版本时间线。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.linesman, vacantFlatIds.actors.caretaker, vacantFlatIds.actors.resident],
        relevantPlaceIds: [vacantFlatIds.places.tongLau, vacantFlatIds.places.exchangeDesk],
        permittedFactKinds: ['具体时间记录与矛盾。'],
        progressSignals: ['排除一种重要解释或限定残余。'],
        forbiddenConfirmations: ['时间差自动证明灵异。'],
        allowedWritebackKinds: publicWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_hidden_occupancy',
        title: '秘密占用',
        narrativeUse: '检验单位是否曾被非正式使用，以及该事实能解释哪些痕迹。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.caretaker, vacantFlatIds.actors.broker, vacantFlatIds.actors.tenantSister],
        relevantPlaceIds: [vacantFlatIds.places.tongLau],
        permittedFactKinds: ['确实存在的出入、物件或使用痕迹。'],
        progressSignals: ['占用事实改变人物责任或现实结论。'],
        forbiddenConfirmations: ['占用能解释全部铃声。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'case']
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_voice_fragment',
        title: '声音残片',
        narrativeUse: '把无法确认的声音限制为具体词句、时间或听者信念。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.resident, vacantFlatIds.actors.tenantSister],
        relevantPlaceIds: [vacantFlatIds.places.tongLau],
        permittedFactKinds: ['某人确实记得一段具体声音。', '该记忆的来源与可信边界。'],
        progressSignals: ['残余被限定且不妨碍现实行动。'],
        forbiddenConfirmations: ['声音来自死者。'],
        allowedWritebackKinds: ordinaryWritebacks
      })
    ]
  },
  {
    stageId: vacantFlatIds.stages.aftermath,
    title: '号码留下的人',
    narrativeFunction: '让住客、前租户家属、公司与旧楼吸收已经成立的结果，并决定传闻如何持续、变形或沉寂。',
    allowedNextStageIds: [],
    permittedFactKinds: ['住处、工作、关系与公开说法的稳定变化。', '案件或非案件结论。', '一处有边界的未解释残余。'],
    advanceSignals: ['主要社会张力形成稳定世界结果。', '退出或公开决定已产生长期后果。'],
    insufficientOnTheirOwn: ['旁白说故事结束。', '玩家离开一次。'],
    remainWhen: ['结果仍只在旁白，没有应用写回。'],
    advanceWhen: ['已应用写回形成可持续结果，可 complete 本 Arc。'],
    transitionMeaning: 'complete 只结束《空屋来电》主要推进，不完成整个 DLC，也不删除人物和历史。',
    forbiddenConfirmations: ['清除历史。', '让所有人接受同一解释。', '确认超自然。'],
    identityHints: {
      police: ['承接程序、住客安全与机构口径。'],
      civilian: ['承接居住、家庭与街坊记忆。'],
      gang_member: ['承接收楼、生意与街面关系。']
    },
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['更新已经存在的正式案件或出现独立合法事实。'],
    caseForbiddenConditions: ['为了收尾而强行立案。'],
    nodes: [
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_public_version',
        title: '公开版本',
        narrativeUse: '让住客、公司和媒体形成可能不同的公开解释。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.tenantSister, vacantFlatIds.actors.linesman, urbanLegendsFormalIds.actors.reporter],
        relevantPlaceIds: [vacantFlatIds.places.tongLau, vacantFlatIds.places.exchangeDesk],
        permittedFactKinds: ['某个版本确实公开。', '相关人物的实际反应。'],
        progressSignals: ['公开版本产生稳定后果。'],
        forbiddenConfirmations: ['公开版本等于客观真相。'],
        allowedWritebackKinds: publicWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_tenant_future',
        title: '住客去留',
        narrativeUse: '承接谁留下、搬走、获得保护或承担损失。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.resident, vacantFlatIds.actors.caretaker, vacantFlatIds.actors.broker],
        relevantPlaceIds: [vacantFlatIds.places.tongLau, vacantFlatIds.places.estateOffice],
        permittedFactKinds: ['真实搬迁、租约或工作变化。'],
        progressSignals: ['人物生活形成稳定新状态。'],
        forbiddenConfirmations: ['所有人恢复原状。'],
        allowedWritebackKinds: ordinaryWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_vacant_flat_node_last_ring',
        title: '最后一声铃',
        narrativeUse: '只在现实结果已经稳定时保留或消除一处具体、有边界的铃声残余。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [vacantFlatIds.actors.resident, vacantFlatIds.actors.caretaker],
        relevantPlaceIds: [vacantFlatIds.places.tongLau],
        permittedFactKinds: ['一次具体、无法完全核对的声响或记忆。'],
        progressSignals: ['残余不再扩张，也不阻止现实收束。'],
        forbiddenConfirmations: ['以最后铃声确认鬼魂。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'newsIssue']
      })
    ]
  }
];

export const urbanLegendsVacantFlatArc: UrbanLegendsExpandedArcDefinition = {
  contentId: vacantFlatIds.contentId,
  arcKey: vacantFlatIds.arcKey,
  title: '空屋来电',
  plannerSummary: '一间等待收楼的空置单位深夜反复响起电话；旧线路、住客往事与收楼利益让每个解释都只能覆盖部分事实。',
  initialStageId: vacantFlatIds.stages.streetRumor,
  continuityInvariants: [
    '本 Arc 始终承接砵兰街旧唐楼同一间空置单位、同一个号码和同一宗持续事件；后续来电、证词或报案只能更新这宗事件，不得改写成辖区内第二或第三宗同类空屋来电。',
    '冯玉琴是住在空屋楼下的固定目击者，身份是夜班制衣女工；不得将她换名复制为新的来电受害者、死者、报警人模板或另一宗案件人物。',
    '梁美娟是前租客梁少芬之姊；在没有本局已应用事实前，不得把梁少芬预设为死者、失踪者或每次来电的固定受害者。',
    '如果本 Arc 已关联 Case、CurrentMatter 或 Signal，后续必须复用对应稳定 ID 更新同一事件；不得为相同空屋、来电与人物另建平行案件或事项。',
    '若已应用事实已经形成尸体发现、正式重案或其他明显后续进展，不得退回首次报警模板；应承接现有事实并比较当前阶段是否需要推进。'
  ],
  caseContinuityPolicy: 'reuse_linked_when_present',
  exposureEvidenceTextSignatures: [
    { allTerms: ['空屋'], anyTerms: ['来电', '电话', '铃声'] },
    { allTerms: ['空置单位'], anyTerms: ['来电', '电话', '铃声'] }
  ],
  entryRoutes: {
    police: {
      contactSources: ['住客报称深夜滋扰。', '巡逻时遇到旧楼争执。', '既有楼宇或失踪事项出现关联。'],
      permissions: ['按岗位处理滋扰、楼宇安全与正式报案。'],
      restrictions: ['没有程序事实不能强行搜屋、调取全部电话资料或自动立案。'],
      diversionRoutes: ['记录后移交。', '认定暂无现实风险。', '把私人纠纷退回合适渠道。']
    },
    civilian: {
      contactSources: ['住在附近。', '认识住客或前租户家属。', '工作、租住或看楼受到影响。'],
      permissions: ['通过邻里、公开单据和生活关系了解情况。'],
      restrictions: ['不能冒充警方或电话公司人员。'],
      diversionRoutes: ['避开该楼。', '劝亲友停止传播。', '把信息交给有权限者。']
    },
    gang_member: {
      contactSources: ['收楼或地盘消息。', '夜间生意受传闻影响。', '有人要求压下或核实说法。'],
      permissions: ['通过街面关系判断谁在利用消息。'],
      restrictions: ['非正式消息不能自动成为客观事实或警方证据。'],
      diversionRoutes: ['不介入私人纠纷。', '只处理现实生意影响。', '拒绝替任何一方施压。']
    }
  },
  actors: vacantFlatActors,
  places: vacantFlatPlaces,
  stages: vacantFlatStages,
  newsEvolution: [
    '早期只允许出现“旧楼深夜铃声”的街坊短讯或小报传闻，不等于事实。',
    '利益冲突后可出现收楼、住客安全或电话故障角度的相互矛盾报道。',
    '余波报道必须服从已经应用的现实结果，可以撤稿、沉寂或继续民间流传。'
  ],
  resolutionBoundaries: [
    '现实偏向：串线、秘密占用、威吓或收楼行动解释大部分事实。',
    '多重暧昧：技术、人物记忆与利益行动各自解释一部分。',
    '有界残余：只保留一段具体铃声、时间差或来源不明物件，不能扩张成超自然系统。'
  ]
};

const harbourIds = {
  contentId: 'official_dlc_urban_legends_hk1988_harbour_unknown_light',
  arcKey: 'official-dlc:urban_legends:hk_1988:harbour_unknown_light',
  actors: {
    coxswain: 'official_dlc_urban_legends_hk1988_harbour_retired_coxswain',
    tallyClerk: 'official_dlc_urban_legends_hk1988_harbour_tally_clerk',
    mechanic: 'official_dlc_urban_legends_hk1988_harbour_launch_mechanic',
    fishmonger: 'official_dlc_urban_legends_hk1988_harbour_fishmonger',
    broker: 'official_dlc_urban_legends_hk1988_harbour_cargo_broker'
  },
  places: {
    closedPier: 'official_dlc_urban_legends_hk1988_harbour_closed_cargo_pier',
    boatmenCafe: 'official_dlc_urban_legends_hk1988_harbour_boatmen_cafe',
    warehouseLane: 'official_dlc_urban_legends_hk1988_harbour_warehouse_lane'
  },
  stages: {
    streetRumor: 'official_dlc_urban_legends_hk1988_harbour_stage_street_rumor',
    firstClues: 'official_dlc_urban_legends_hk1988_harbour_stage_first_clues',
    interestConflict: 'official_dlc_urban_legends_hk1988_harbour_stage_interest_conflict',
    truthInvestigation: 'official_dlc_urban_legends_hk1988_harbour_stage_truth_investigation',
    aftermath: 'official_dlc_urban_legends_hk1988_harbour_stage_aftermath'
  }
} as const;

const harbourActors: readonly ExpandedActorAnchor[] = [
  {
    actorId: harbourIds.actors.coxswain,
    name: '黎海明',
    publicIdentity: '退休电船船长，仍在艇户茶档替旧同事看风浪。',
    publicFacts: ['熟悉旧码头灯号和夜航习惯。', '不愿年轻人把行船事故讲成鬼故事。'],
    informationBoundary: ['知道旧航线与行船口令，不掌握现役货运和警方资料。'],
    forbiddenConfirmations: ['经验丰富不等于记忆绝对正确。', '不能预设他隐瞒沉船。']
  },
  {
    actorId: harbourIds.actors.tallyClerk,
    name: '苏慧兰',
    publicIdentity: '码头理货文员，负责纸本货单和夜班交接。',
    publicFacts: ['能说明货单、班次和封存手续。', '担心记录问题牵连同事。'],
    informationBoundary: ['知道自己接触过的货单，不知道海面所有活动。'],
    forbiddenConfirmations: ['记录缺页不证明她毁证。', '不能让她知道未接触的走私安排。']
  },
  {
    actorId: harbourIds.actors.mechanic,
    name: '邓志强',
    publicIdentity: '修理电船和小艇引擎的机房师傅。',
    publicFacts: ['认识附近常用小艇的声音和灯具。', '以维修信誉维生。'],
    informationBoundary: ['能辨认设备与维修痕迹，不能凭声音确认船上人员。'],
    forbiddenConfirmations: ['设备异常不等于超自然。', '修过某船不等于参与其行动。']
  },
  {
    actorId: harbourIds.actors.fishmonger,
    name: '吴秀娟',
    publicIdentity: '清晨到海旁收货的鱼档老板。',
    publicFacts: ['经常在天未亮时经过旧码头。', '关注传闻是否影响来货和客流。'],
    informationBoundary: ['能讲述自己看见的灯和艇影，无法确认远处身份。'],
    forbiddenConfirmations: ['相似灯影不证明同一条船。', '不能把后来听闻补入原始目击。']
  },
  {
    actorId: harbourIds.actors.broker,
    name: '唐兆安',
    publicIdentity: '替小型货主和仓户撮合运输的中间人。',
    publicFacts: ['掌握部分夜间货运关系。', '希望码头不要因传闻引来停工。'],
    informationBoundary: ['知道交易联系人，不掌握全部货物来源与官方调查。'],
    forbiddenConfirmations: ['中间人身份不自动证明走私。', '不能预设他制造灯号。']
  }
];

const harbourPlaces: readonly ExpandedPlaceAnchor[] = [
  {
    placeId: harbourIds.places.closedPier,
    name: '油麻地封闭货运码头',
    summary: '部分设施停用、夜间照明稀疏的旧货运泊位；海雾、潮汐和岸上灯火会改变观察距离。'
  },
  {
    placeId: harbourIds.places.boatmenCafe,
    name: '艇户茶档',
    summary: '船员、理货工和鱼贩换班时交换消息的茶档，亲见与转述经常混在一起。'
  },
  {
    placeId: harbourIds.places.warehouseLane,
    name: '海旁仓街',
    summary: '连接旧码头、货仓和车路的窄街，货单、人情和夜间运输在此留下现实痕迹。'
  }
];

const harbourIdentityHints: Readonly<Record<CurrentIdentity, readonly string[]>> = {
  police: ['从海旁巡逻、失物报案、航行安全或既有案件关联进入；权限仍受单位和程序限制。'],
  civilian: ['从鱼档、夜班、艇户亲友或通勤观察进入；不把玩家写成海事专家。'],
  gang_member: ['从货运、人情和地盘影响进入；不预设社团或货主就是幕后。']
};

const harbourStages: readonly ExpandedArcStage[] = [
  {
    stageId: harbourIds.stages.streetRumor,
    title: '海旁灯号',
    narrativeFunction: '让封闭码头外反复出现的无名灯号先作为艇户、夜班工人与街坊之间的具体传闻存在。',
    allowedNextStageIds: [harbourIds.stages.firstClues],
    permittedFactKinds: ['某人在具体潮时和位置看见灯光或艇影。', '码头公开的封闭和照明状态。', '传闻对夜班、来货或巡逻产生的影响。'],
    advanceSignals: ['灯色、节奏、潮时、船声或目击位置可以核对。', '两个独立来源在稳定细节上冲突。'],
    insufficientOnTheirOwn: ['只有海雾和氛围。', '一次模糊目击。', '经过若干回合。'],
    remainWhen: ['没有可核对的时间、位置、人物或现实影响。'],
    advanceWhen: ['已应用写回把灯号落实为可比较的航行、货运或人物信息。'],
    transitionMeaning: '进入下一阶段只表示传闻获得现实抓手，不表示幽灵船、犯罪或失踪已经成立。',
    forbiddenConfirmations: ['确认幽灵船。', '自动建立走私案件。', '让所有目击者说法一致。'],
    identityHints: harbourIdentityHints,
    allowedWritebackKinds: [...ordinaryWritebacks, 'newsIssue', 'case'],
    caseAllowedConditions: ['本回合形成正式航行危险、失踪、盗窃或既有案件关联事实。'],
    caseForbiddenConditions: ['仅因灯光异常立案。'],
    nodes: [
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_returning_light',
        title: '重复灯光',
        narrativeUse: '核对灯光的颜色、节奏、方位和目击者位置。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.fishmonger, harbourIds.actors.coxswain],
        relevantPlaceIds: [harbourIds.places.closedPier, harbourIds.places.boatmenCafe],
        permittedFactKinds: ['具体目击时间和方位。', '目击者当时实际位置。'],
        progressSignals: ['出现可与潮汐或岸灯比较的稳定描述。'],
        forbiddenConfirmations: ['相似描述自动证明同一现象。'],
        allowedWritebackKinds: ordinaryWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_missing_launch_story',
        title: '失踪电船旧闻',
        narrativeUse: '追踪一宗旧航行传闻如何被后来目击重新解释。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.coxswain, urbanLegendsFormalIds.actors.reporter],
        relevantPlaceIds: [harbourIds.places.boatmenCafe, harbourIds.places.closedPier],
        permittedFactKinds: ['某宗旧事件的公开版本。', '谁在何时转述。'],
        progressSignals: ['旧闻提供可核对船名、日期或人物。'],
        forbiddenConfirmations: ['旧失踪自动与当前灯号相同。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'newsIssue', 'case']
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_night_shift_rumor',
        title: '夜班禁忌',
        narrativeUse: '呈现工人怎样用禁忌解释危险、疲劳和不愿公开的工作安排。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.tallyClerk, harbourIds.actors.mechanic],
        relevantPlaceIds: [harbourIds.places.warehouseLane, harbourIds.places.boatmenCafe],
        permittedFactKinds: ['某人确实遵守或传播某项禁忌。', '禁忌带来的工作变化。'],
        progressSignals: ['禁忌指向具体班次、货物或责任。'],
        forbiddenConfirmations: ['行业禁忌等于客观真相。'],
        allowedWritebackKinds: ordinaryWritebacks
      })
    ]
  },
  {
    stageId: harbourIds.stages.firstClues,
    title: '潮汐与货单',
    narrativeFunction: '把灯号转化为潮汐、纸本货单、维修痕迹、船声和不同目击之间相互冲突的第一批线索。',
    allowedNextStageIds: [harbourIds.stages.interestConflict],
    permittedFactKinds: ['时代可行的货单、交接簿和潮汐资料。', '设备维修与船艇行动痕迹。', '不同目击版本。'],
    advanceSignals: ['发现谁因一种解释获益或受损。', '有人实际压下、修改或利用记录与传闻。'],
    insufficientOnTheirOwn: ['收集任意数量线索。', '重复询问同一目击者。'],
    remainWhen: ['线索孤立，尚未形成利益主体或现实后果。'],
    advanceWhen: ['已应用写回证明具体人物或组织改变记录、行动或叙述。'],
    transitionMeaning: '进入下一阶段只表示利益开始塑造证据，不表示灯号来源已经确定。',
    forbiddenConfirmations: ['货单缺页就等于走私。', '潮汐能解释全部目击。'],
    identityHints: harbourIdentityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['线索形成正式失踪、盗窃、走私或既有案件关联事实。'],
    caseForbiddenConditions: ['仅因货单矛盾或设备异常立案。'],
    nodes: [
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_signal_log',
        title: '灯号记录',
        narrativeUse: '比较码头照明、船艇信号和目击时间。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.coxswain, harbourIds.actors.tallyClerk],
        relevantPlaceIds: [harbourIds.places.closedPier, harbourIds.places.warehouseLane],
        permittedFactKinds: ['实际记录或缺失。', '谁有权限填写。'],
        progressSignals: ['记录与目击形成具体矛盾。'],
        forbiddenConfirmations: ['记录缺失自动证明掩盖。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'case']
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_tide_window',
        title: '潮汐窗口',
        narrativeUse: '检验特定艇只在当时水位和能见度下是否可能出现。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.coxswain, harbourIds.actors.mechanic],
        relevantPlaceIds: [harbourIds.places.closedPier],
        permittedFactKinds: ['潮汐和航行可行性。', '人物技术判断及边界。'],
        progressSignals: ['排除或支持一种具体航行路径。'],
        forbiddenConfirmations: ['技术判断天然绝对。'],
        allowedWritebackKinds: ordinaryWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_unlisted_launch',
        title: '未列名小艇',
        narrativeUse: '核对夜间出现的小艇是否属于正常运输、私下借用或误认。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.mechanic, harbourIds.actors.broker, harbourIds.actors.fishmonger],
        relevantPlaceIds: [harbourIds.places.closedPier, harbourIds.places.warehouseLane],
        permittedFactKinds: ['具体船体特征、维修或交易联系。'],
        progressSignals: ['小艇联系改变某人的风险或利益。'],
        forbiddenConfirmations: ['未列名即证明犯罪。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'case']
      })
    ]
  },
  {
    stageId: harbourIds.stages.interestConflict,
    title: '海面上的利益',
    narrativeFunction: '让货主、工人、警方、媒体和街面关系围绕码头停工、货物、名誉与调查承担不同代价。',
    allowedNextStageIds: [harbourIds.stages.truthInvestigation],
    permittedFactKinds: ['停工、改道、压消息或公开报道的具体行动。', '货物、工作、关系和程序成本。'],
    advanceSignals: ['有人采取不可逆的转运、公开、毁证、退出或合作行动。', '一种竞争解释获得可检验路径。'],
    insufficientOnTheirOwn: ['人物争吵。', '出现疑似货物。'],
    remainWhen: ['没有改变信息流、货运、关系或程序。'],
    advanceWhen: ['已应用写回证明具体利益方承担代价并改变现实状态。'],
    transitionMeaning: '进入下一阶段只表示冲突产生可检验路径，不表示组织或人物已经定罪。',
    forbiddenConfirmations: ['把所有夜运写成走私。', '自动升级为枪战。', '把工人集体写成共谋。'],
    identityHints: harbourIdentityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['具体行动产生可验证的盗窃、走私、妨碍调查或安全事故事实。'],
    caseForbiddenConditions: ['只因利益对立或社团出现立案。'],
    nodes: [
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_cargo_pressure',
        title: '货运压力',
        narrativeUse: '检验停工和传闻如何改变货物去向、工人收入与证据保存。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.broker, harbourIds.actors.tallyClerk],
        relevantPlaceIds: [harbourIds.places.warehouseLane, harbourIds.places.closedPier],
        permittedFactKinds: ['实际转运、停工或损失。'],
        progressSignals: ['行动留下不可逆货运或关系结果。'],
        forbiddenConfirmations: ['货运压力证明犯罪。'],
        allowedWritebackKinds: publicWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_press_at_pier',
        title: '记者到海旁',
        narrativeUse: '让公开报道、目击者隐私和码头工作产生可追踪冲突。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [urbanLegendsFormalIds.actors.reporter, harbourIds.actors.fishmonger],
        relevantPlaceIds: [harbourIds.places.boatmenCafe, harbourIds.places.closedPier],
        permittedFactKinds: ['报道确实采访、刊出或被压下。'],
        progressSignals: ['公开版本迫使人物采取新行动。'],
        forbiddenConfirmations: ['新闻等于客观真相。'],
        allowedWritebackKinds: publicWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_street_bargain',
        title: '街面交易',
        narrativeUse: '检验是否有人买卖灯号消息、货单或沉默，而非预设完整阴谋。',
        compatibleIdentities: ['gang_member', 'police', 'civilian'],
        relevantActorIds: [harbourIds.actors.broker, urbanLegendsFormalIds.actors.societyLiaison],
        relevantPlaceIds: [harbourIds.places.warehouseLane, harbourIds.places.boatmenCafe],
        permittedFactKinds: ['具体消息交易、施压或拒绝。'],
        progressSignals: ['交易改变证据、关系或调查机会。'],
        forbiddenConfirmations: ['社团整体必然参与。'],
        allowedWritebackKinds: publicWritebacks
      })
    ]
  },
  {
    stageId: harbourIds.stages.truthInvestigation,
    title: '灯号复原',
    narrativeFunction: '比较导航误认、非正式货运、设备故障与有意信号等解释，并让可证事实与人物信念保持分层。',
    allowedNextStageIds: [harbourIds.stages.aftermath],
    permittedFactKinds: ['至少两套可解释部分证据的现实路径。', '货单、设备、潮汐和人物动机的冲突。', '玩家公开、移交、利用或停止调查的决定。'],
    advanceSignals: ['形成足以行动的判断并产生后果。', '有界残余已被限制在具体灯光、时间差或目击。'],
    insufficientOnTheirOwn: ['模型宣布谜底。', '找到所谓最后一张货单。'],
    remainWhen: ['没有可行动判断或残余仍无边界扩张。'],
    advanceWhen: ['已应用写回支持现实决定，并允许保留一处具体未解残余。'],
    transitionMeaning: '进入余波只表示现实结果可以被城市吸收，不表示幽灵船或唯一幕后得到确认。',
    forbiddenConfirmations: ['全知确认超自然。', '让所有人物接受同一解释。'],
    identityHints: harbourIdentityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['调查形成符合程序的航行事故、失踪、盗窃、走私或既有案件结果。'],
    caseForbiddenConditions: ['用怪谈判断替代案件事实。'],
    nodes: [
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_reconstruct_signal',
        title: '重演灯号',
        narrativeUse: '在时代可行条件下比较岸灯、船灯、潮汐与观察角度。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.coxswain, harbourIds.actors.mechanic, harbourIds.actors.fishmonger],
        relevantPlaceIds: [harbourIds.places.closedPier],
        permittedFactKinds: ['实际重演结果与限制。'],
        progressSignals: ['排除一种重要解释或限定残余。'],
        forbiddenConfirmations: ['一次重演覆盖所有夜晚。'],
        allowedWritebackKinds: publicWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_missing_manifest',
        title: '缺页货单',
        narrativeUse: '追踪货单缺页、补写和实际货物之间的责任，而非把缺页本身当谜底。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.tallyClerk, harbourIds.actors.broker],
        relevantPlaceIds: [harbourIds.places.warehouseLane],
        permittedFactKinds: ['谁接触、补写或保存货单。', '实际货物与记录差异。'],
        progressSignals: ['责任和利益形成可行动结论。'],
        forbiddenConfirmations: ['缺页必然证明走私。'],
        allowedWritebackKinds: publicWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_bounded_afterglow',
        title: '水面余光',
        narrativeUse: '把仍无法对齐的灯光限制在具体潮时、角度或目击者信念。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.fishmonger, harbourIds.actors.coxswain],
        relevantPlaceIds: [harbourIds.places.closedPier, harbourIds.places.boatmenCafe],
        permittedFactKinds: ['一处具体无法完全复现的目击。'],
        progressSignals: ['残余不妨碍现实行动。'],
        forbiddenConfirmations: ['余光证明幽灵船。'],
        allowedWritebackKinds: ordinaryWritebacks
      })
    ]
  },
  {
    stageId: harbourIds.stages.aftermath,
    title: '海旁余波',
    narrativeFunction: '让码头、工人、货主、媒体和玩家吸收已经成立的现实结果，并决定灯号如何被记住。',
    allowedNextStageIds: [],
    permittedFactKinds: ['工作、关系、案件和公开说法的稳定变化。', '传闻持续、变形或消退。', '有界未解释残余。'],
    advanceSignals: ['主要社会张力形成稳定结果。', '公开、退出或程序结论产生长期后果。'],
    insufficientOnTheirOwn: ['旁白宣布结束。', '码头暂时安静。'],
    remainWhen: ['结果尚未进入已应用 Runtime。'],
    advanceWhen: ['已应用写回形成可持续世界状态，可 complete 本 Arc。'],
    transitionMeaning: 'complete 只结束《海旁无名灯》的主要推进，不完成整个 DLC。',
    forbiddenConfirmations: ['删除人物或历史。', '把所有结果写成玩家胜利。', '确认超自然。'],
    identityHints: harbourIdentityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['更新已存在案件或出现独立合法事实。'],
    caseForbiddenConditions: ['为了收尾强行立案。'],
    nodes: [
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_public_account',
        title: '海旁说法',
        narrativeUse: '让工人、媒体、警方与街坊形成可能不同的公开版本。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.tallyClerk, urbanLegendsFormalIds.actors.reporter, harbourIds.actors.fishmonger],
        relevantPlaceIds: [harbourIds.places.boatmenCafe, harbourIds.places.warehouseLane],
        permittedFactKinds: ['具体说法确实公开或被撤回。'],
        progressSignals: ['公开版本形成稳定后果。'],
        forbiddenConfirmations: ['公开说法等于真相。'],
        allowedWritebackKinds: publicWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_workers_future',
        title: '夜班去留',
        narrativeUse: '承接停工、复工、调班和人物关系的现实结果。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.tallyClerk, harbourIds.actors.mechanic, harbourIds.actors.broker],
        relevantPlaceIds: [harbourIds.places.closedPier, harbourIds.places.warehouseLane],
        permittedFactKinds: ['实际工作、收入或关系变化。'],
        progressSignals: ['人物生活形成稳定新状态。'],
        forbiddenConfirmations: ['所有人恢复原状。'],
        allowedWritebackKinds: ordinaryWritebacks
      }),
      node({
        nodeId: 'official_dlc_urban_legends_hk1988_harbour_node_last_light',
        title: '最后灯号',
        narrativeUse: '只在现实结果稳定时保留或消除一处具体、有边界的海面灯光残余。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [harbourIds.actors.coxswain, harbourIds.actors.fishmonger],
        relevantPlaceIds: [harbourIds.places.closedPier],
        permittedFactKinds: ['一次具体且无法完全核对的灯光目击。'],
        progressSignals: ['残余不再扩张。'],
        forbiddenConfirmations: ['以灯号确认幽灵船。'],
        allowedWritebackKinds: [...ordinaryWritebacks, 'newsIssue']
      })
    ]
  }
];

export const urbanLegendsHarbourLightArc: UrbanLegendsExpandedArcDefinition = {
  contentId: harbourIds.contentId,
  arcKey: harbourIds.arcKey,
  title: '海旁无名灯',
  plannerSummary: '封闭货运码头外反复出现无人认领的灯号；潮汐、货单、夜班利益与旧航行传闻让它同时像误认、暗号和城市记忆。',
  initialStageId: harbourIds.stages.streetRumor,
  entryRoutes: {
    police: {
      contactSources: ['海旁巡逻或航行安全报告。', '失物、失踪或既有案件出现码头关联。', '夜班工人要求低调核实。'],
      permissions: ['在岗位权限内处理安全、报案和正式证据。'],
      restrictions: ['不能无授权搜查所有货仓、船艇或货单。'],
      diversionRoutes: ['记录后移交海事或相关单位。', '认定暂无现实风险。', '继续普通巡逻。']
    },
    civilian: {
      contactSources: ['鱼档、夜班或艇户亲友。', '在海旁实际看见灯光。', '工作来货受传闻影响。'],
      permissions: ['通过公开环境和生活关系了解。'],
      restrictions: ['不能获得警方、海事或货运内部权限。'],
      diversionRoutes: ['避开海旁。', '只处理工作影响。', '把信息交给有权限者。']
    },
    gang_member: {
      contactSources: ['夜间运输和地盘消息。', '有人买卖灯号说法。', '警方或记者关注影响生意。'],
      permissions: ['通过街面关系判断利益与信息来源。'],
      restrictions: ['不得把非正式消息直接写成犯罪事实。'],
      diversionRoutes: ['拒绝参与消息交易。', '只调整生意。', '让相关货主自行处理。']
    }
  },
  actors: harbourActors,
  places: harbourPlaces,
  stages: harbourStages,
  newsEvolution: [
    '早期只允许出现海旁灯号和艇户说法的低可信传闻。',
    '冲突阶段可出现航行安全、货运停摆或猎奇报道的不同版本。',
    '余波报道必须服从已应用结果，可形成澄清、沉默或继续民间流传。'
  ],
  resolutionBoundaries: [
    '现实偏向：岸灯误认、非正式货运、设备故障或有意信号解释大部分事实。',
    '多重暧昧：潮汐、记录、人物动机和传播污染各解释部分证据。',
    '有界残余：只保留一次具体灯光、时间差或互不相识者的相似描述。'
  ]
};

const charSiuIds = {
  contentId: 'official_dlc_urban_legends_hk1988_midnight_char_siu_bun',
  arcKey: 'official-dlc:urban_legends:hk_1988:midnight_char_siu_bun',
  actors: {
    owner: 'official_dlc_urban_legends_hk1988_char_siu_bun_shop_owner',
    cook: 'official_dlc_urban_legends_hk1988_char_siu_bun_cook',
    supplier: 'official_dlc_urban_legends_hk1988_char_siu_bun_meat_supplier',
    missingWorkerSister: 'official_dlc_urban_legends_hk1988_char_siu_bun_missing_worker_sister',
    inspector: 'official_dlc_urban_legends_hk1988_char_siu_bun_health_inspector'
  },
  places: {
    shop: 'official_dlc_urban_legends_hk1988_char_siu_bun_shop',
    market: 'official_dlc_urban_legends_hk1988_char_siu_bun_wholesale_market',
    backLane: 'official_dlc_urban_legends_hk1988_char_siu_bun_back_lane'
  },
  stages: {
    streetRumor: 'official_dlc_urban_legends_hk1988_char_siu_bun_stage_street_rumor',
    firstClues: 'official_dlc_urban_legends_hk1988_char_siu_bun_stage_first_clues',
    interestConflict: 'official_dlc_urban_legends_hk1988_char_siu_bun_stage_interest_conflict',
    truthInvestigation: 'official_dlc_urban_legends_hk1988_char_siu_bun_stage_truth_investigation',
    aftermath: 'official_dlc_urban_legends_hk1988_char_siu_bun_stage_aftermath'
  }
} as const;

const charSiuActors: readonly ExpandedActorAnchor[] = [
  {
    actorId: charSiuIds.actors.owner,
    name: '黎忠',
    publicIdentity: '深水埗旧式烧味包点铺东主。',
    publicFacts: ['靠街坊生意维持一家生活。', '公开否认店铺使用来历不明肉料。'],
    informationBoundary: ['知道店内采购和雇工安排，不掌握供应商全部上游。'],
    forbiddenConfirmations: ['不能预设他杀人或知情。', '店铺卫生欠佳不等于食人。']
  },
  {
    actorId: charSiuIds.actors.cook,
    name: '任秋月',
    publicIdentity: '负责腌料、包点和早市备货的老师傅。',
    publicFacts: ['熟悉每日用料与后厨流程。', '担心猎奇传闻毁掉多年手艺。'],
    informationBoundary: ['知道自己接触的肉料和班次，不知道所有夜间来货。'],
    forbiddenConfirmations: ['厨师身份不等于接触过犯罪。', '沉默不等于共谋。']
  },
  {
    actorId: charSiuIds.actors.supplier,
    name: '彭志发',
    publicIdentity: '替多间食肆送肉料的批发中间人。',
    publicFacts: ['掌握部分货单、赊账和临时换货。', '不愿公开全部客户关系。'],
    informationBoundary: ['知道自身供应链，不天然知道失踪者去向。'],
    forbiddenConfirmations: ['账目不整等于杀人。', '非法肉料自动等于人肉。']
  },
  {
    actorId: charSiuIds.actors.missingWorkerSister,
    name: '周敏华',
    publicIdentity: '失联杂工周炳强之姊。',
    publicFacts: ['弟弟失联前曾在附近食肆打散工。', '反对媒体把寻人变成恐怖噱头。'],
    informationBoundary: ['知道家庭、债务和最后联系，不知道店内夜间全部活动。'],
    forbiddenConfirmations: ['失联不等于死亡。', '家属怀疑不等于犯罪证据。']
  },
  {
    actorId: charSiuIds.actors.inspector,
    name: '邓世昌',
    publicIdentity: '负责区内食肆卫生巡查的卫生督察。',
    publicFacts: ['可以核对牌照、环境、食材单据和时代可行检验。', '需区分卫生违规与刑事事实。'],
    informationBoundary: ['知道检查结果，不拥有警方侦查权限。'],
    forbiddenConfirmations: ['卫生检查能确认所有肉料来源。', '违规自动证明凶案。']
  }
];

const charSiuPlaces: readonly ExpandedPlaceAnchor[] = [
  {
    placeId: charSiuIds.places.shop,
    name: '忠记烧味包点',
    summary: '清晨营业、后厨狭窄的街坊食店；店面、厨房和夜间收货必须分别核对。'
  },
  {
    placeId: charSiuIds.places.market,
    name: '九龙肉食批发栏',
    summary: '纸本货单、赊账与临时换货并存的批发市场，来源链可能混乱但并非天然犯罪。'
  },
  {
    placeId: charSiuIds.places.backLane,
    name: '烧味铺后巷',
    summary: '连接住家、垃圾收集点和夜间卸货位置的后巷，目击和后来传言容易互相污染。'
  }
];

const charSiuIdentityHints: Readonly<Record<CurrentIdentity, readonly string[]>> = {
  police: ['从失踪报案、食肆纠纷、威吓或卫生部门转介进入；没有证据不以传闻定罪。'],
  civilian: ['从街坊消费、店员亲友、寻人或生计影响进入；不把玩家变成法医。'],
  gang_member: ['从食材供应、保护费、债务或有人借传闻赶客进入；不预设组织制造传闻。']
};

function charSiuNode(
  nodeId: string,
  title: string,
  narrativeUse: string,
  actorIds: readonly string[],
  placeIds: readonly string[],
  facts: readonly string[],
  signals: readonly string[],
  forbidden: readonly string[],
  writebacks: readonly ExpandedWritebackKind[] = publicWritebacks
): ExpandedArcNode {
  return node({
    nodeId,
    title,
    narrativeUse,
    compatibleIdentities: allIdentities,
    relevantActorIds: actorIds,
    relevantPlaceIds: placeIds,
    permittedFactKinds: facts,
    progressSignals: signals,
    forbiddenConfirmations: forbidden,
    allowedWritebackKinds: writebacks
  });
}

const charSiuStages: readonly ExpandedArcStage[] = [
  {
    stageId: charSiuIds.stages.streetRumor,
    title: '包点铺恶闻',
    narrativeFunction: '让“失联杂工被做成叉烧包”的恶性说法先作为有明确传播者、店铺和现实伤害的传闻存在，而不是既定犯罪事实。',
    allowedNextStageIds: [charSiuIds.stages.firstClues],
    permittedFactKinds: ['某人确实传播过具体说法。', '杂工确实失联或家属寻人。', '店铺客流、员工安全或名誉受到影响。'],
    advanceSignals: ['出现可核对的失联时间、雇工、肉料、货单、包纸或目击。', '传闻造成具体威吓、停业或调查行动。'],
    insufficientOnTheirOwn: ['只有令人不适的描述。', '只因为食物味道异常。', '多人重复同一句传闻。'],
    remainWhen: ['没有可核对对象或现实变化。'],
    advanceWhen: ['已应用写回把传闻落实为失踪、供应、人物行动或具体矛盾。'],
    transitionMeaning: '进入下一阶段只表示恶闻获得现实抓手；不表示失联者死亡、店铺使用人肉或刑案自动成立。',
    forbiddenConfirmations: ['描写或确认食人事实。', '自动把店主定为凶手。', '用猎奇细节替代证据。'],
    identityHints: charSiuIdentityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['本回合完成正式失踪报案，或形成威吓、非法食材、伤害等独立案件事实。'],
    caseForbiddenConditions: ['仅因人肉叉烧包传闻立案或定罪。'],
    nodes: [
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_whispered_recipe',
        '恶性传言',
        '追踪谁最先讲出“人肉馅料”、原话如何变化以及谁因此受损。',
        [charSiuIds.actors.owner, charSiuIds.actors.missingWorkerSister],
        [charSiuIds.places.shop],
        ['具体传播者、时间和版本。', '店铺与家属的现实反应。'],
        ['传闻指向可核对人物、物件或日期。'],
        ['重复传播不能把说法变成事实。']
      ),
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_missing_helper',
        '失联杂工',
        '把周炳强的最后工作、住处、债务和联系人转化为可核对寻人线索。',
        [charSiuIds.actors.missingWorkerSister, charSiuIds.actors.owner],
        [charSiuIds.places.shop, charSiuIds.places.backLane],
        ['最后联系和工作记录。', '家属是否正式报案。'],
        ['出现可向雇主、供应商或住处核对的信息。'],
        ['失联自动等于死亡。'],
        [...ordinaryWritebacks, 'case']
      ),
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_anonymous_wrapper',
        '匿名包纸',
        '检验一份写有暗示字句的包纸、便笺或照片是否真实存在以及来自何处。',
        [charSiuIds.actors.cook, urbanLegendsFormalIds.actors.reporter],
        [charSiuIds.places.shop, charSiuIds.places.backLane],
        ['物件确实存在。', '谁接触和传播过物件。'],
        ['物件来源指向现实信息渠道。'],
        ['匿名物件自动证明指控。']
      )
    ]
  },
  {
    stageId: charSiuIds.stages.firstClues,
    title: '货单与失联',
    narrativeFunction: '把恶闻转化为肉料货单、卫生状况、雇工时间线和目击说法之间彼此不完全一致的第一批线索。',
    allowedNextStageIds: [charSiuIds.stages.interestConflict],
    permittedFactKinds: ['时代可行的货单、检查和雇工记录。', '合法、违规或无法确认的肉料来源。', '人物因提供信息承担的风险。'],
    advanceSignals: ['发现谁因某种解释获益、受损或免于追责。', '有人修改、隐瞒、兜售或利用记录与传闻。'],
    insufficientOnTheirOwn: ['厨房不整洁。', '货单缺一张。', '一次判定成功。'],
    remainWhen: ['线索仍孤立，没有利益主体和现实后果。'],
    advanceWhen: ['已应用写回证明具体人物改变供应、记录、报道或证词。'],
    transitionMeaning: '进入下一阶段只表示利益开始塑造证据，不表示食材身份或失联真相已经确定。',
    forbiddenConfirmations: ['非法肉料等于人肉。', '卫生违规等于凶案。', '缺账等于毁证。'],
    identityHints: charSiuIdentityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['形成正式失踪、食品违法、威吓、诈骗或既有案件关联事实。'],
    caseForbiddenConditions: ['仅因卫生差或账目不齐建立凶杀案。'],
    nodes: [
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_supply_ledger',
        '供应货单',
        '核对批发、赊账、临时换货与实际用量。',
        [charSiuIds.actors.supplier, charSiuIds.actors.owner],
        [charSiuIds.places.market, charSiuIds.places.shop],
        ['货单和付款记录。', '实际送货人及时间。'],
        ['供应差异指向具体责任或利益。'],
        ['账目差异自动证明食人。']
      ),
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_kitchen_inspection',
        '后厨检查',
        '用卫生、储存、器具和可行取样区分违规、误传与刑事证据。',
        [charSiuIds.actors.inspector, charSiuIds.actors.cook],
        [charSiuIds.places.shop],
        ['检查确实发现或未发现什么。', '检查方法的时代边界。'],
        ['结果改变营业、名誉或调查路径。'],
        ['不得凭现代 DNA 技术即时定性。']
      ),
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_back_lane_witness',
        '后巷目击',
        '比较夜间卸货、垃圾收集和失联者最后出现的不同说法。',
        [charSiuIds.actors.supplier, charSiuIds.actors.missingWorkerSister],
        [charSiuIds.places.backLane, charSiuIds.places.shop],
        ['某人确实看见的车辆、包裹或人物。'],
        ['目击指向可核对时间或联系人。'],
        ['模糊包裹自动是人体证据。']
      )
    ]
  },
  {
    stageId: charSiuIds.stages.interestConflict,
    title: '恐慌生意',
    narrativeFunction: '让家属、店铺、供应商、卫生部门、媒体和街面人物围绕寻人、名誉、客流与责任采取有代价的行动。',
    allowedNextStageIds: [charSiuIds.stages.truthInvestigation],
    permittedFactKinds: ['停业、检查、报道、勒索、赶客或保护家属的具体行动。', '关系、生计和程序成本。'],
    advanceSignals: ['有人采取不可逆的公开、毁证、逃避、合作或退出行动。', '一种解释获得可系统检验的路径。'],
    insufficientOnTheirOwn: ['公众害怕。', '人物争吵。', '媒体出现。'],
    remainWhen: ['没有改变信息流、生意、关系或程序。'],
    advanceWhen: ['已应用写回证明某方承担代价并改变现实状态。'],
    transitionMeaning: '进入下一阶段只表示冲突产生可检验路径，不表示任何人已经有罪。',
    forbiddenConfirmations: ['把店主写成固定凶手。', '把家属写成炒作者。', '自动升级为血腥暴力。'],
    identityHints: charSiuIdentityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['具体行动形成勒索、威吓、毁证、食品违法或失踪案件事实。'],
    caseForbiddenConditions: ['仅因生意竞争或媒体炒作定罪。'],
    nodes: [
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_taboid_frenzy',
        '猎奇报道',
        '让标题、消息来源、家属隐私与店铺损失形成可追踪冲突。',
        [urbanLegendsFormalIds.actors.reporter, charSiuIds.actors.missingWorkerSister],
        [charSiuIds.places.shop, urbanLegendsFormalIds.places.chaChaanTeng],
        ['报道确实刊出、修改或被压下。'],
        ['公开版本迫使人物采取行动。'],
        ['标题自动成为真相。']
      ),
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_extortion',
        '借谣勒索',
        '检验是否有人借恶闻索钱、赶客或迫使店铺接受保护。',
        [charSiuIds.actors.owner, urbanLegendsFormalIds.actors.societyLiaison],
        [charSiuIds.places.shop, charSiuIds.places.backLane],
        ['具体索款、威吓或拒绝。'],
        ['勒索改变证据、关系或警方介入。'],
        ['社团整体必然参与。']
      ),
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_health_action',
        '停业与复检',
        '让卫生部门根据实际检查作出停业、整改或复检决定。',
        [charSiuIds.actors.inspector, charSiuIds.actors.owner, charSiuIds.actors.cook],
        [charSiuIds.places.shop],
        ['正式检查和行政决定。'],
        ['决定改变生意、公众说法或调查路径。'],
        ['行政停业等于刑事定罪。']
      )
    ]
  },
  {
    stageId: charSiuIds.stages.truthInvestigation,
    title: '供应链与去向',
    narrativeFunction: '比较供应欺诈、勒索造谣、普通失联、雇工纠纷与更严重犯罪等竞争解释，形成有据但不猎奇的现实判断。',
    allowedNextStageIds: [charSiuIds.stages.aftermath],
    permittedFactKinds: ['至少两套解释及各自证据边界。', '失联者去向、供应链和人物动机的可确认部分。', '玩家公开、移交或停止调查的决定。'],
    advanceSignals: ['形成足以采取程序、保护家属、恢复营业或追查犯罪的判断。', '未解部分已限制在具体记录或物件。'],
    insufficientOnTheirOwn: ['找到一件骇人物品。', '旁白宣布真凶。'],
    remainWhen: ['没有可行动判断，或指控仍只依赖传言。'],
    advanceWhen: ['已应用写回支持现实决定和后果；有界疑点不妨碍进入余波。'],
    transitionMeaning: '进入余波只表示现实决定开始生效，不表示系统必须确认人肉指控。',
    forbiddenConfirmations: ['无证据确认食人。', '用全知旁白宣布唯一真相。', '用现代法证瞬间解决。'],
    identityHints: charSiuIdentityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['证据符合程序并形成失踪、伤害、勒索、食品违法或其他犯罪事实。'],
    caseForbiddenConditions: ['用都市传闻替代证据。'],
    nodes: [
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_supply_reconstruction',
        '供应链复原',
        '把批发、送货、储存、用量和付款组成可检查的多版本链条。',
        [charSiuIds.actors.supplier, charSiuIds.actors.owner, charSiuIds.actors.cook],
        [charSiuIds.places.market, charSiuIds.places.shop],
        ['每一环节实际可证的来源和缺口。'],
        ['排除一种重要解释或指向独立违法事实。'],
        ['链条缺口自动等于人肉。']
      ),
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_missing_worker_trail',
        '失联者轨迹',
        '核对周炳强最后联系、债务、工作和可能自主离开的路径。',
        [charSiuIds.actors.missingWorkerSister, charSiuIds.actors.owner, charSiuIds.actors.supplier],
        [charSiuIds.places.shop, charSiuIds.places.backLane, charSiuIds.places.market],
        ['最后可证实行动和联系人。'],
        ['形成足以继续寻人、结案或转向其他调查的判断。'],
        ['自主离开或遇害在无证据时都不能确认。']
      ),
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_bounded_food_test',
        '有限检验',
        '以 1988 年可行的卫生、来源和样本检验说明能确认什么、不能确认什么。',
        [charSiuIds.actors.inspector, charSiuIds.actors.cook],
        [charSiuIds.places.shop],
        ['具体检验结果及方法边界。'],
        ['结果支持现实行动或限制指控范围。'],
        ['检验不能凭空补齐不存在的样本。']
      )
    ]
  },
  {
    stageId: charSiuIds.stages.aftermath,
    title: '恶闻余味',
    narrativeFunction: '让家属、食店、员工、供应商、媒体和社区吸收已经成立的结果，并决定恶闻如何被纠正、利用或继续流传。',
    allowedNextStageIds: [],
    permittedFactKinds: ['案件或非案件结论。', '店铺、人物关系和生计的稳定变化。', '公众说法与有界疑点。'],
    advanceSignals: ['主要冲突形成稳定世界结果。', '寻人、营业或公开决定产生长期后果。'],
    insufficientOnTheirOwn: ['店铺重新开门。', '旁白说真相大白。'],
    remainWhen: ['结果尚未进入已应用 Runtime。'],
    advanceWhen: ['已应用写回形成可持续状态，可 complete 本 Arc。'],
    transitionMeaning: 'complete 只结束《深夜叉烧包》的主要推进，不删除历史，也不完成整个 DLC。',
    forbiddenConfirmations: ['强迫所有人相信同一版本。', '用猎奇结尾替代世界后果。', '完成后删除人物。'],
    identityHints: charSiuIdentityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['更新已存在的正式案件或出现独立合法事实。'],
    caseForbiddenConditions: ['为了给故事收尾强行定罪。'],
    nodes: [
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_public_account',
        '公众版本',
        '让家属、店铺、卫生部门、警方与媒体形成可能不同的公开说法。',
        [charSiuIds.actors.missingWorkerSister, charSiuIds.actors.owner, charSiuIds.actors.inspector],
        [charSiuIds.places.shop],
        ['某个版本确实公开、纠正或撤回。'],
        ['公开说法产生稳定后果。'],
        ['公众版本等于客观真相。']
      ),
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_shop_future',
        '店铺去留',
        '承接复业、结业、转手、员工去留与街坊信任。',
        [charSiuIds.actors.owner, charSiuIds.actors.cook, charSiuIds.actors.supplier],
        [charSiuIds.places.shop, charSiuIds.places.market],
        ['真实营业、工作和关系变化。'],
        ['人物生活形成稳定新状态。'],
        ['所有损失自动恢复。'],
        ordinaryWritebacks
      ),
      charSiuNode(
        'official_dlc_urban_legends_hk1988_char_siu_bun_node_rumor_aftertaste',
        '传闻余味',
        '只在现实结果稳定后保留一处具体、可追溯却无法完全消除的传言残余。',
        [charSiuIds.actors.missingWorkerSister, urbanLegendsFormalIds.actors.reporter],
        [charSiuIds.places.shop, urbanLegendsFormalIds.places.chaChaanTeng],
        ['某个具体版本仍被谁传播。'],
        ['残余不再扩张，也不推翻已确认事实。'],
        ['继续流传证明指控为真。']
      )
    ]
  }
];

export const urbanLegendsCharSiuBunArc: UrbanLegendsExpandedArcDefinition = {
  contentId: charSiuIds.contentId,
  arcKey: charSiuIds.arcKey,
  title: '深夜叉烧包',
  plannerSummary: '一名杂工失联后，街坊把烧味铺的肉料说成“人肉叉烧包”；失踪、供应链、勒索、卫生检查与猎奇报道互相放大，却不能替证据作结论。',
  initialStageId: charSiuIds.stages.streetRumor,
  continuityInvariants: [
    '本 Arc 始终承接同一间忠记烧味包点铺、同一名失联杂工周炳强和同一宗持续事件；后续传闻、检查或报案只能更新这宗事件，不得改写成第二间同类店铺或另一宗“人肉叉烧包”。',
    '黎忠、任秋月、彭志发、周敏华与邓世昌是这宗事件的固定人物；不得换名复制为新店主、新供应商、新失踪者家属或新调查人员。',
    '如果本 Arc 已关联 Case、CurrentMatter 或 Signal，后续必须复用对应稳定 ID 更新同一事件；不得为同一店铺、失联者与供货争议另建平行案件或事项。',
    '若本局已应用事实已经形成正式失踪调查、卫生处置、供应链核验或其他后续进展，不得退回首次街坊恶闻模板；必须承接当前阶段和既有证据。',
    '“人肉叉烧包”始终只是需要证据检验的恶性传言；重复出现不能被包装成一宗新的独立案件，也不能因此升级为客观食人事实。'
  ],
  caseContinuityPolicy: 'reuse_linked_when_present',
  entryRoutes: {
    police: {
      contactSources: ['正式失踪报案。', '食肆威吓或纠纷。', '卫生部门发现独立可疑事实。'],
      permissions: ['按岗位处理报案、证据和程序协作。'],
      restrictions: ['不能凭传闻搜查、定罪或公开指控。'],
      diversionRoutes: ['区分卫生与刑事事项后移交。', '记录但不采用猎奇说法。', '继续普通值勤。']
    },
    civilian: {
      contactSources: ['街坊消费。', '认识店员或失联者家属。', '工作和生计受恐慌影响。'],
      permissions: ['通过生活关系、公开单据和家属渠道了解。'],
      restrictions: ['不能冒充警方、卫生督察或法证人员。'],
      diversionRoutes: ['停止传播。', '支持寻人但不调查食材。', '避开店铺。']
    },
    gang_member: {
      contactSources: ['供应、债务或保护费关系。', '有人借恶闻赶客。', '街面传闻影响生意。'],
      permissions: ['通过已有人情判断谁在利用消息。'],
      restrictions: ['非正式渠道不能变成客观刑事事实。'],
      diversionRoutes: ['拒绝勒索或消息交易。', '只处理现实生意影响。', '让家属或当局接手。']
    }
  },
  actors: charSiuActors,
  places: charSiuPlaces,
  stages: charSiuStages,
  newsEvolution: [
    '早期只能把“人肉叉烧包”写成有来源的恶性传言，不能当作报道事实。',
    '冲突阶段可报道失踪、卫生、勒索或店铺回应，但标题与证据必须分开。',
    '余波可以纠正、撤稿、沉寂或保留民间恶闻；不能用新闻确认食人。'
  ],
  resolutionBoundaries: [
    '现实偏向：供应欺诈、卫生违规、勒索造谣或普通失联解释大部分事实。',
    '多重暧昧：失联、货单缺口、人物隐瞒和传播利益各自解释部分证据。',
    '有界残余：只保留一件来源无法完全核实的物件或时间差，绝不以此确认食人。'
  ]
};

/** Frozen set included in the v1.1 runtime contract. */
export const urbanLegendsV1_1ExpandedArcDefinitions: readonly UrbanLegendsExpandedArcDefinition[] = [
  urbanLegendsVacantFlatArc,
  urbanLegendsHarbourLightArc,
  urbanLegendsCharSiuBunArc
];

/** Latest expanded long-arc set. Older save versions must use their frozen set. */
export const urbanLegendsExpandedArcDefinitions: readonly UrbanLegendsExpandedArcDefinition[] = [
  ...urbanLegendsV1_1ExpandedArcDefinitions,
  urbanLegendsLastDeliveryArc
];

const baseUrbanLegendsShortRumorSeeds: readonly UrbanLegendsShortRumorSeed[] = [
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_demolished_street_taxi_call',
    title: '拆楼街的士台呼叫',
    summary: '的士电台连续几晚收到一个已拆门牌的接客呼叫；可能是旧抄号、恶作剧、司机记忆或有人利用无人核对的地址。',
    entryHints: {
      police: '从交通投诉、失物或巡逻司机闲谈进入。',
      civilian: '从乘车、司机亲友或电台闲谈进入。',
      gang_member: '从夜车、生意或有人借假地址联络进入。'
    },
    confirmableFacts: ['电台确实收到某段呼叫。', '相关门牌在当前时间的公开状态。', '司机实际采取的行动。'],
    forbiddenConfirmations: ['呼叫来自死者。', '拆除地址自动证明灵异。'],
    relatedPlaceIds: [urbanLegendsFormalIds.places.oldDistrictStreet]
  },
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_sealed_rooftop_mahjong',
    title: '封楼天台麻雀声',
    summary: '一栋封闭唐楼的天台每逢潮湿夜晚传来洗牌声；声音可能来自邻楼、秘密聚赌、结构传音或被反复加工的街坊记忆。',
    entryHints: {
      police: '从噪音投诉或巡楼安全进入。',
      civilian: '从邻里生活或夜归进入。',
      gang_member: '从赌档传言、看场或地盘闲话进入。'
    },
    confirmableFacts: ['某人确实听见声音。', '楼宇封闭与出入口状态。', '有人实际进入或利用地点。'],
    forbiddenConfirmations: ['打牌者是鬼。', '声音自动证明秘密赌档。'],
    relatedPlaceIds: [urbanLegendsFormalIds.places.oldDistrictStreet]
  },
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_midnight_cinema_extra_ticket',
    title: '午夜场多出一张票',
    summary: '旧戏院散场点票总比售票簿多一张残票；可能来自重用、偷入场、职员包庇、纸本误差或观众后来补上的版本。',
    entryHints: {
      police: '从失物、纠纷或戏院报案进入。',
      civilian: '从看午夜场、戏院工作或朋友闲谈进入。',
      gang_member: '从戏院生意、黄牛或场内秩序进入。'
    },
    confirmableFacts: ['残票真实存在。', '售票簿与座位检查的具体差异。', '相关职员或观众的实际行为。'],
    forbiddenConfirmations: ['多出的观众客观不存在。', '残票证明鬼魂入场。'],
    relatedPlaceIds: [urbanLegendsFormalIds.places.chaChaanTeng]
  },
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_hospital_silent_extension',
    title: '空病房分机',
    summary: '医院总机深夜接到一通来自停用病房的短电话；老式线路、值班误接、未登记使用和悲伤记忆都可能改变说法。',
    entryHints: {
      police: '从医院求助、滋扰或既有病人事项进入。',
      civilian: '从探病、医院工作或亲友经历进入。',
      gang_member: '从受伤成员、医院联系人或街面传闻进入。'
    },
    confirmableFacts: ['总机记录或值班人员确实接到电话。', '病房停用和线路状态。', '相关人员实际在场情况。'],
    forbiddenConfirmations: ['来电来自已故病人。', '医院所有人都知道传闻。'],
    relatedPlaceIds: []
  },
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_lift_missing_mezzanine',
    title: '电梯停在不存在的夹层',
    summary: '旧商厦电梯偶尔在楼层之间开门；可能是检修层、机械故障、错误标牌、非法改建或被恐惧补完的短暂一瞥。',
    entryHints: {
      police: '从困人、楼宇安全或巡逻报案进入。',
      civilian: '从上班、送货或访客经历进入。',
      gang_member: '从商厦生意、仓储或秘密出入口传闻进入。'
    },
    confirmableFacts: ['电梯确实故障或停层。', '楼宇结构和检修记录。', '有人实际使用某个空间。'],
    forbiddenConfirmations: ['夹层属于异空间。', '故障自动证明非法设施。'],
    relatedPlaceIds: []
  },
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_early_obituary',
    title: '提前刊出的讣闻',
    summary: '报馆排版间出现一张日期比来稿更早的讣闻校样；可能是预排、抄错、同名、消息交易或有人希望某个版本先成为事实。',
    entryHints: {
      police: '从威吓、失踪或报馆求助进入。',
      civilian: '从报馆、亲友或读者发现进入。',
      gang_member: '从消息交易、人物名誉或有人借讣闻施压进入。'
    },
    confirmableFacts: ['校样确实存在。', '来稿、排版和刊期记录。', '相关人员实际接触过什么。'],
    forbiddenConfirmations: ['讣闻预知死亡。', '被写名字的人必然遇害。'],
    relatedPlaceIds: [urbanLegendsFormalIds.places.chaChaanTeng]
  }
];

const additionalUrbanLegendsShortRumorSeeds: readonly UrbanLegendsShortRumorSeed[] = [
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_high_street_sealed_window',
    title: '高街封窗灯影',
    summary: '高街一处封闭建筑的砖封窗口在雨夜透出移动灯影；可能来自邻楼反光、维修人员、非法进入或后来被地点历史放大的目击。',
    entryHints: {
      police: '从巡逻、楼宇安全或非法进入报告接触。',
      civilian: '从附近居住、探病或夜路目击接触。',
      gang_member: '从地盘闲话、废楼用途或有人借地点藏物接触。'
    },
    confirmableFacts: ['某人确实看见具体位置的灯影。', '建筑封闭与维修状态。', '有人实际进入或使用地点。'],
    forbiddenConfirmations: ['灯影来自亡魂。', '地点历史自动解释当前目击。'],
    relatedPlaceIds: []
  },
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_braided_tunnel_passenger',
    title: '隧道梳辫女客',
    summary: '夜班列车和隧道口流传一个梳长辫的年轻女客总在不该下车的位置消失；可能是误认、逃票、工作人员记忆或反复改写的旧新闻。',
    entryHints: {
      police: '从铁路求助、失物或夜间巡查接触。',
      civilian: '从通勤、站务朋友或亲眼误认接触。',
      gang_member: '从夜车、逃票安排或有人利用隧道传闻接触。'
    },
    confirmableFacts: ['具体目击者和班次。', '站务、车票与人员行动。', '某个相似人物是否真实存在。'],
    forbiddenConfirmations: ['女客是鬼。', '所有版本描述同一个人。'],
    relatedPlaceIds: []
  },
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_public_housing_wet_footprints',
    title: '公屋走廊湿脚印',
    summary: '晴天深夜，公屋走廊反复出现从楼梯通往空置单位的湿脚印；可能来自水箱、清洁、儿童恶作剧、秘密借住或邻里恐惧。',
    entryHints: {
      police: '从屋邨巡逻、住户滋扰或非法入屋报告接触。',
      civilian: '从居住、探亲或邻里关系接触。',
      gang_member: '从屋邨人情、藏身或街面传闻接触。'
    },
    confirmableFacts: ['脚印确实存在及出现时间。', '水源、清洁与出入口状态。', '住户实际行动。'],
    forbiddenConfirmations: ['脚印来自不存在的人。', '通往空屋自动证明有人藏匿。'],
    relatedPlaceIds: []
  },
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_photo_studio_extra_shadow',
    title: '合照多出的影子',
    summary: '旧照相馆冲洗的一组家庭照里多出一个无人认领的侧影；可能是重曝、底片混用、玻璃反射、失联亲友或被生意放大的巧合。',
    entryHints: {
      police: '从失踪关联、纠纷或照片物证接触。',
      civilian: '从拍照、亲友或照相馆工作接触。',
      gang_member: '从证件相、生意纠纷或有人借照片施压接触。'
    },
    confirmableFacts: ['底片和照片真实存在。', '拍摄、冲洗与交付流程。', '侧影可能对应的现实人物。'],
    forbiddenConfirmations: ['照片拍到鬼魂。', '相似轮廓自动确认身份。'],
    relatedPlaceIds: []
  },
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_night_station_typewriter',
    title: '夜更差馆打字机',
    summary: '夜更警员说空置文书房的打字机会自行敲出一宗旧案编号；可能是值班恶作剧、机械回弹、未登记加班或记忆把不同夜晚拼在一起。',
    entryHints: {
      police: '从值班同僚、文书室或旧案资料自然接触。',
      civilian: '只可从公开传闻、报案经历或警务亲友接触。',
      gang_member: '从差馆传闻、旧案关系或有人借编号传话接触。'
    },
    confirmableFacts: ['纸张、字迹或值班记录是否存在。', '谁有权限进入文书房。', '旧案编号的真实公开边界。'],
    forbiddenConfirmations: ['打字机由死者操控。', '旧案编号自动允许玩家查阅全部档案。'],
    relatedPlaceIds: []
  },
  {
    sourceId: 'official_dlc_urban_legends_hk1988_rumor_typhoon_shelter_empty_sampan',
    title: '避风塘空舢舨',
    summary: '避风塘里一条无人认领的舢舨总在不同泊位出现，船舱却保持干净；可能是潮流、私下借用、无牌运输、记号误认或艇户共同保持的沉默。',
    entryHints: {
      police: '从水警转介、失物、航行安全或巡逻接触。',
      civilian: '从艇户、渔档或海旁生活接触。',
      gang_member: '从水路运输、藏货或地盘关系接触。'
    },
    confirmableFacts: ['船只特征、泊位和实际移动。', '谁见过或使用过相似舢舨。', '潮流与系泊条件。'],
    forbiddenConfirmations: ['舢舨自行航行。', '无人认领自动证明犯罪或灵异。'],
    relatedPlaceIds: [harbourIds.places.closedPier]
  }
];

export const urbanLegendsShortRumorSeeds: readonly UrbanLegendsShortRumorSeed[] = [
  ...baseUrbanLegendsShortRumorSeeds,
  ...additionalUrbanLegendsShortRumorSeeds
];

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function currentIdentity(context: PromptContext): CurrentIdentity {
  return context.identityProjection.currentShell.currentIdentity;
}

function arcSourceRef(definition: UrbanLegendsExpandedArcDefinition) {
  return {
    providerId: 'official-dlc',
    sourceType: 'official_dlc_event',
    sourceId: definition.contentId,
    dlcId: urbanLegendsFormalManifest.dlcId
  } as const;
}

function arcContentIdentity(
  definition: UrbanLegendsExpandedArcDefinition,
  version: string
): NarrativeArcContentIdentity {
  return {
    providerId: 'official-dlc',
    contentId: definition.contentId,
    version,
    arcKey: definition.arcKey,
    dlcId: urbanLegendsFormalManifest.dlcId,
    worldpackId: 'hk_1988'
  };
}

function nodesForIdentity(
  stage: ExpandedArcStage,
  identity: CurrentIdentity
): readonly ExpandedArcNode[] {
  return stage.nodes.filter((candidate) => candidate.compatibleIdentities.includes(identity));
}

function progressContract(
  definition: UrbanLegendsExpandedArcDefinition
): NarrativeArcProgressContract {
  return {
    stageIds: definition.stages.map((stage) => stage.stageId),
    nodeIdsByStage: Object.fromEntries(
      definition.stages.map((stage) => [stage.stageId, stage.nodes.map((item) => item.nodeId)])
    ),
    allowedNextStageIds: Object.fromEntries(
      definition.stages.map((stage) => [stage.stageId, [...stage.allowedNextStageIds]])
    ),
    completionStageIds: [definition.stages[definition.stages.length - 1]!.stageId]
  };
}

function narrowedProgressContract(
  definition: UrbanLegendsExpandedArcDefinition,
  stage: ExpandedArcStage,
  nodes: readonly ExpandedArcNode[]
): NarrativeArcProgressContract {
  const stageIds = [stage.stageId, ...stage.allowedNextStageIds];
  return {
    stageIds,
    nodeIdsByStage: {
      [stage.stageId]: nodes.map((item) => item.nodeId),
      ...Object.fromEntries(stage.allowedNextStageIds.map((stageId) => [stageId, []]))
    },
    allowedNextStageIds: {
      [stage.stageId]: [...stage.allowedNextStageIds],
      ...Object.fromEntries(stage.allowedNextStageIds.map((stageId) => [stageId, []]))
    },
    completionStageIds: stageIds.includes(
      definition.stages[definition.stages.length - 1]!.stageId
    )
      ? [definition.stages[definition.stages.length - 1]!.stageId]
      : []
  };
}

function relatedIds(stage: ExpandedArcStage, identity: CurrentIdentity) {
  const nodes = nodesForIdentity(stage, identity);
  return {
    actorIds: unique(nodes.flatMap((item) => [...item.relevantActorIds])),
    placeIds: unique(nodes.flatMap((item) => [...item.relevantPlaceIds]))
  };
}

function stageProjections(
  context: PromptContext,
  definition: UrbanLegendsExpandedArcDefinition
): Readonly<Record<string, NarrativeArcStageProjection>> {
  const identity = currentIdentity(context);
  return Object.fromEntries(
    definition.stages.map((stage) => {
      const related = relatedIds(stage, identity);
      return [
        stage.stageId,
        {
          stageId: stage.stageId,
          title: `${definition.title} · ${stage.title}`,
          plannerSummary: [
            `当前阶段：${stage.title}。`,
            stage.narrativeFunction,
            `身份适配：${stage.identityHints[identity].join('；')}`,
            '只在玩家当前行动存在自然入口时承接；允许安静、忽略、失败或退出。'
          ].join(' '),
          relatedActorIds: related.actorIds,
          relatedPlaceIds: related.placeIds
        }
      ];
    })
  );
}

function continuationLines(snapshot?: NarrativeArcContinuationSnapshot): string[] {
  if (!snapshot) return [];
  return [
    `剧情弧最后推进回合：${snapshot.lastProgressTurn}`,
    `已使用节点（不得重新当作首次发现）：${snapshot.usedNodeIds.join('、') || '无'}`,
    ...(snapshot.progressSummary ? [`已验证进度摘要：${snapshot.progressSummary}`] : []),
    `当前 Runtime 有据摘要：${snapshot.groundedSummary}`,
    `已应用写回证据引用：${snapshot.appliedWritebackRefs
      .map((ref) => `${ref.kind}:${ref.id}`)
      .join('、') || '无'}`,
    `当前未解决上下文：${snapshot.unresolvedContext.join('；') || '无可确认开放项；不得自行补造。'}`
  ];
}

function actorLine(
  definition: UrbanLegendsExpandedArcDefinition,
  actorId: string
): string | undefined {
  const local = definition.actors.find((candidate) => candidate.actorId === actorId);
  if (local) {
    return `${local.actorId}：${local.name}，${local.publicIdentity}；公开事实=${local.publicFacts.join('；')}；信息边界=${local.informationBoundary.join('；')}`;
  }
  const shared = urbanLegendsFormalCharacters.find((candidate) => candidate.actorId === actorId);
  if (!shared) return undefined;
  return `${shared.actorId}：${shared.name}，${shared.publicIdentity}；公开事实=${shared.publicFacts.join('；')}；信息边界=${shared.informationBoundary.knows.join('；')}`;
}

function placeLine(
  definition: UrbanLegendsExpandedArcDefinition,
  placeId: string
): string | undefined {
  const local = definition.places.find((candidate) => candidate.placeId === placeId);
  if (local) return `${local.placeId}：${local.name}；${local.summary}`;
  const shared = urbanLegendsFormalPlaces.find((candidate) => candidate.placeId === placeId);
  return shared ? `${shared.placeId}：${shared.name}；${shared.summary}` : undefined;
}

export function buildUrbanLegendsExpandedArcPlanningSource(
  context: PromptContext,
  definition: UrbanLegendsExpandedArcDefinition,
  version: string = urbanLegendsFormalManifest.version
): PlanningSource {
  const identity = currentIdentity(context);
  const projections = stageProjections(context, definition);
  const initialProjection = projections[definition.initialStageId];
  return withDramaSourceCoherenceMetadata({
    ref: arcSourceRef(definition),
    exposureEvidenceActorIds: definition.actors.map((actor) => actor.actorId),
    exposureEvidenceTextSignatures: (definition.exposureEvidenceTextSignatures ?? []).map(
      (signature) => ({
        allTerms: [...signature.allTerms],
        ...(signature.anyTerms ? { anyTerms: [...signature.anyTerms] } : {})
      })
    ),
    arcKey: definition.arcKey,
    contentIdentity: arcContentIdentity(definition, version),
    ...(definition.caseContinuityPolicy
      ? { caseContinuityPolicy: definition.caseContinuityPolicy }
      : {}),
    arcProgressContract: progressContract(definition),
    arcStageProjections: projections,
    title: definition.title,
    plannerSummary: [
      initialProjection?.plannerSummary ?? definition.plannerSummary,
      `当前身份自然入口：${definition.entryRoutes[identity].contactSources.join('；')}`,
      ...(definition.continuityInvariants?.length
        ? [`事件连续性：${definition.continuityInvariants.join('；')}`]
        : []),
      '这是玩家主动选择但可以忽略的独立官方剧情候选，不得挤占当前明确行动。'
    ].join(' '),
    sourceStatus: 'static_seed',
    reusePolicy: 'context_reusable',
    priorityClass: 'user_requested',
    channelIds: ['custom_events'],
    softAffinities: {
      entryIdentity: [identity],
      eventGroupId: [definition.contentId],
      contentIdentity: [definition.contentId]
    },
    mandatory: false,
    score: 142,
    relatedActorIds: [...(initialProjection?.relatedActorIds ?? [])],
    relatedOrganizationIds: [],
    relatedPlaceIds: [...(initialProjection?.relatedPlaceIds ?? [])],
    relatedCaseIds: []
  });
}

export function buildUrbanLegendsExpandedArcExecutionPayload(
  context: PromptContext,
  definition: UrbanLegendsExpandedArcDefinition,
  currentStageId: string = definition.initialStageId,
  mode: 'first_exposure' | 'continuation' = 'first_exposure',
  continuationSnapshot?: NarrativeArcContinuationSnapshot,
  version: string = urbanLegendsFormalManifest.version
): ExecutionPayload | undefined {
  const stage = definition.stages.find((candidate) => candidate.stageId === currentStageId);
  if (!stage) return undefined;
  const identity = currentIdentity(context);
  const entry = definition.entryRoutes[identity];
  const nodes = nodesForIdentity(stage, identity);
  const usedNodeIds = new Set(continuationSnapshot?.usedNodeIds ?? []);
  const usedCurrentStageNodes = nodes.filter((item) => usedNodeIds.has(item.nodeId));
  const availableNodes = mode === 'continuation'
    ? nodes.filter((item) => !usedNodeIds.has(item.nodeId))
    : nodes;
  const related = relatedIds(stage, identity);
  const nextStageId = stage.allowedNextStageIds[0];
  const progressDecision = nextStageId ? 'advance_stage' : 'complete';
  const actorLines = related.actorIds
    .map((actorId) => actorLine(definition, actorId))
    .filter((line): line is string => Boolean(line));
  const placeLines = related.placeIds
    .map((placeId) => placeLine(definition, placeId))
    .filter((line): line is string => Boolean(line));
  const detailedContext = [
    `官方 DLC：${urbanLegendsFormalManifest.title} ${version}`,
    `当前独立剧情弧：${definition.title}`,
    `稳定内容身份：${definition.contentId}；arcKey=${definition.arcKey}`,
    `载荷模式：${mode}`,
    `当前阶段：${stage.stageId}/${stage.title}`,
    `当前阶段叙事功能：${stage.narrativeFunction}`,
    ...(definition.continuityInvariants?.length
      ? [`跨阶段事件连续性（必须保持）：${definition.continuityInvariants.join('；')}`]
      : []),
    ...continuationLines(continuationSnapshot),
    ...(mode === 'continuation'
      ? [
          `本阶段已使用节点（仅可承接既有结果，不得重新作为首次发现）：${usedCurrentStageNodes
            .map((item) => item.nodeId)
            .join('、') || '无'}`
        ]
      : []),
    `玩家身份：${identity}`,
    `身份适配：${stage.identityHints[identity].join('；')}`,
    ...(mode === 'first_exposure'
      ? [
          `自然接触来源：${entry.contactSources.join('；')}`,
          `合理权限：${entry.permissions.join('；')}`,
          `身份限制：${entry.restrictions.join('；')}`,
          `自然偏转：${entry.diversionRoutes.join('；')}`
        ]
      : []),
    `当前阶段唯一允许的下一阶段 ID：${nextStageId ?? '无'}`,
    `当前阶段可成立事实：${stage.permittedFactKinds.join('；')}`,
    `当前阶段推进信号：${stage.advanceSignals.join('；')}`,
    `不足以推进：${stage.insufficientOnTheirOwn.join('；')}`,
    `阶段进度决定：必须根据本回合实际应用的世界写回，在 remain 与 ${progressDecision} 之间比较；不得按回合数、节点数或气氛自动推进。`,
    `应保持当前阶段：${stage.remainWhen.join('；')}`,
    `应认真比较 ${progressDecision}：${stage.advanceWhen.join('；')}`,
    `推进或完成的语义边界：${stage.transitionMeaning}`,
    `当前阶段尚可首次使用节点：\n${availableNodes.length > 0
      ? availableNodes
          .map((item) => `${item.nodeId}/${item.title}：${item.narrativeUse}；可成立事实=${item.permittedFactKinds.join('；')}；推进信号=${item.progressSignals.join('；')}`)
          .join('\n')
      : '无；只能承接既有结果、保持当前阶段，或在本回合有实际世界写回证据时推进。'}`,
    `本阶段人物锚点（不代表已登场）：\n${actorLines.join('\n')}`,
    `本阶段地点锚点（进入 Runtime 仍需合法写回）：\n${placeLines.join('\n')}`,
    `允许写回类型：${stage.allowedWritebackKinds.join('、')}`,
    `案件边界：进入阶段不自动立案；允许条件=${stage.caseAllowedConditions.join('；')}；禁止条件=${stage.caseForbiddenConditions.join('；')}`,
    ...(stage.stageId === definition.stages[definition.stages.length - 1]!.stageId
      ? [
          `可选收束边界：${definition.resolutionBoundaries.join('；')}`,
          `新闻与城市记忆边界：${definition.newsEvolution.join('；')}`,
          '本 Arc 完成不等于整个《都市怪谈》DLC 完成。'
        ]
      : [])
  ].join('\n');

  return {
    ref: arcSourceRef(definition),
    contentIdentity: arcContentIdentity(definition, version),
    arcKey: definition.arcKey,
    ...(mode === 'first_exposure' ? { initialStageId: definition.initialStageId } : {}),
    currentStageId: stage.stageId,
    arcProgressContract: narrowedProgressContract(definition, stage, nodes),
    detailedContext,
    confirmedFacts: [],
    mutableElements: [
      `当前阶段=${stage.stageId}`,
      ...availableNodes.map((item) => `当前可用节点=${item.nodeId}`),
      ...(nextStageId ? [`唯一允许下一阶段=${nextStageId}`] : [])
    ],
    forbiddenAdaptations: unique([
      '不得发送、引用或暗示当前阶段之后尚未到达的阶段内容。',
      '不得把人物可能性、信念、传闻或关系张力写成客观事实。',
      '不得强制玩家介入，也不得仅因选择 DLC 自动创建案件。',
      '所有世界变化必须通过既有 Runtime 写回；阶段状态不能替代世界事实。',
      '忽略、失败或退出不得重置 Arc 或重新执行首次曝光。',
      'NPC 后台演化必须服从信息渠道并由实际应用写回证明。',
      ...(definition.continuityInvariants ?? []),
      ...definition.actors.flatMap((actor) => [...actor.forbiddenConfirmations]),
      ...stage.forbiddenConfirmations,
      ...nodes.flatMap((item) => [...item.forbiddenConfirmations])
    ])
  };
}

function rumorSourceRef(seed: UrbanLegendsShortRumorSeed) {
  return {
    providerId: 'official-dlc',
    sourceType: 'official_dlc_event',
    sourceId: seed.sourceId,
    dlcId: urbanLegendsFormalManifest.dlcId
  } as const;
}

export function buildUrbanLegendsShortRumorPlanningSource(
  context: PromptContext,
  seed: UrbanLegendsShortRumorSeed
): PlanningSource {
  const identity = currentIdentity(context);
  return withDramaSourceCoherenceMetadata({
    ref: rumorSourceRef(seed),
    title: seed.title,
    plannerSummary: `${seed.summary} 当前身份入口：${seed.entryHints[identity]} 这是低强度、可忽略的一次性传闻入口；若没有自然接触可保持 quiet。`,
    sourceStatus: 'rumor',
    reusePolicy: 'save_single_use',
    priorityClass: 'normal',
    channelIds: ['city_news', 'custom_events'],
    softAffinities: {
      entryIdentity: [identity],
      rumorSeedId: [seed.sourceId]
    },
    mandatory: false,
    score: 76,
    relatedActorIds: [],
    relatedOrganizationIds: [],
    relatedPlaceIds: [...seed.relatedPlaceIds],
    relatedCaseIds: []
  });
}

export function buildUrbanLegendsShortRumorExecutionPayload(
  context: PromptContext,
  seed: UrbanLegendsShortRumorSeed,
  version: string = urbanLegendsFormalManifest.version
): ExecutionPayload {
  const identity = currentIdentity(context);
  return {
    ref: rumorSourceRef(seed),
    detailedContext: [
      `官方 DLC：${urbanLegendsFormalManifest.title} ${version}`,
      `城市短传闻：${seed.title}`,
      `传闻摘要：${seed.summary}`,
      `当前身份自然入口：${seed.entryHints[identity]}`,
      `只可确认：${seed.confirmableFacts.join('；')}`,
      '这是一次性低强度入口，不是完整任务，不创建 NarrativeArcInstance；玩家可以听过、忽略或只让它成为环境纹理。',
      '若本回合形成稳定后果，继续使用现有 Signal、Actor、Matter、NewsIssue、Relationship 或 Case 写回；没有世界变化就不要伪造写回。'
    ].join('\n'),
    confirmedFacts: [],
    mutableElements: ['传播者、接触渠道、人物信念和现实影响必须由本回合实际内容决定。'],
    forbiddenAdaptations: [
      '不得把传闻文本当作已经发生的客观事实。',
      '不得强制玩家调查，不得自动立案或创建长期剧情弧。',
      '不得让无信息渠道的人物凭空知道传闻。',
      ...seed.forbiddenConfirmations
    ]
  };
}

export function findUrbanLegendsExpandedArcBySourceId(
  sourceId: string,
  definitions: readonly UrbanLegendsExpandedArcDefinition[] = urbanLegendsExpandedArcDefinitions
): UrbanLegendsExpandedArcDefinition | undefined {
  return definitions.find(
    (definition) => definition.contentId === sourceId
  );
}

export function findUrbanLegendsShortRumorBySourceId(
  sourceId: string
): UrbanLegendsShortRumorSeed | undefined {
  return urbanLegendsShortRumorSeeds.find((seed) => seed.sourceId === sourceId);
}
