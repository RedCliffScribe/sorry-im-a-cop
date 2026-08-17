import type { CurrentIdentity } from '../../runtime/types';
import { urbanLegendsFormalIds } from './content';
import type {
  UrbanLegendsFormalNodeContract,
  UrbanLegendsFormalStageContract,
  UrbanLegendsStageCaseBoundary,
  UrbanLegendsStageWritebackKind
} from './types';

const allIdentities: readonly CurrentIdentity[] = ['police', 'civilian', 'gang_member'];

const ordinaryWorldWritebacks: readonly UrbanLegendsStageWritebackKind[] = [
  'signal',
  'currentMatter',
  'relationshipThread',
  'actorMemory',
  'actor'
];

function createCaseBoundary(
  allowedConditions: readonly string[],
  forbiddenConditions: readonly string[]
): UrbanLegendsStageCaseBoundary {
  return {
    automaticFromStageEntry: false,
    stageBlocksFormalProcedure: false,
    allowedConditions,
    forbiddenConditions,
    requiresExistingRuntimeGates: true
  };
}

function node(contract: UrbanLegendsFormalNodeContract): UrbanLegendsFormalNodeContract {
  return contract;
}

export const urbanLegendsFormalStageContracts: readonly UrbanLegendsFormalStageContract[] = [
  {
    stageId: urbanLegendsFormalIds.stages.streetRumor,
    semanticKey: 'street_rumor',
    title: '街坊传闻',
    narrativeFunction: '让午夜末班车先作为具体人物之间流动的城市传闻存在，建立可核对的地点、时间和现实影响，同时保留玩家忽略或离开的自由。',
    allowedNextStageIds: [urbanLegendsFormalIds.stages.firstClues],
    permittedFactKinds: [
      '某人确实提出报案、讲述传闻或公开表达担忧。',
      '传闻涉及一个可核对的时间、地点、人物或物件。',
      '不同人物相信不同版本；这些信念只属于各自信息边界。',
      '传闻对某个人的生活、工作或生意产生了具体影响。',
      '本回合若完成正式报案或立案程序，该程序事实可以成立。'
    ],
    advanceEvidence: {
      requiresStructuredWorldChange: true,
      signals: [
        '传闻获得可核对的具体时间、地点、人物或物件。',
        '两个独立来源之间出现可以继续核实的具体矛盾。',
        '玩家或 NPC 实际跟进一个可验证细节并留下结构化世界结果。',
        '人物因传闻承担了现实风险或改变了行动。'
      ],
      insufficientOnTheirOwn: ['只听到一次怪谈。', '只经过若干回合。', '只使用了若干节点。', '一次判定成功但没有形成世界事实。', '只有氛围描写。']
    },
    progressDecisionGuidance: {
      remainWhen: [
        '本回合只有氛围、未经核实的单一传闻或重复转述，没有形成可核对对象与实际世界变化。',
        '玩家当前行动没有自然入口，或相关人物尚无可信信息渠道。'
      ],
      advanceOrCompleteWhen: [
        '本回合已应用写回把传闻落实为可核对的时间、地点、人物、物件或具体矛盾。',
        '玩家或 NPC 的实际跟进、报案、风险承担或行动变化已经留下持久世界结果。'
      ],
      transitionMeaning: '进入下一阶段只表示城市传闻已经具有可以继续核对的现实抓手；不表示真相已经查明、案件自动成立或玩家被迫介入。'
    },
    forbiddenConfirmations: ['确认鬼魂或超自然巴士客观存在。', '直接确认失踪者遭遇或最终幕后。', '仅因接触传闻自动创建案件。', '让所有人物立即知道同一版本。', '强迫玩家接受调查任务。'],
    identityAdaptationHints: {
      police: ['从报案、巡逻或记录差异进入。', '遵守岗位权限；允许普通处理、移交或暂不跟进。'],
      civilian: ['从通勤、街坊、亲友或工作影响进入。', '介入动机来自生活关系，不把玩家写成职业侦探。'],
      gang_member: ['从夜间生意、人流或街面消息进入。', '传闻可以成为利益因素，但不预设社团是幕后。']
    },
    allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'case'],
    caseBoundary: createCaseBoundary(
      ['本回合完成符合世界包程序的正式报案或立案。', '本回合确认与既有案件存在事实关联。'],
      ['仅因进入 DLC、听到传闻或处于 street_rumor 创建案件。', '仅凭未经核实的异常说法升级为刑事案件。']
    ),
    nodes: [
      node({
        nodeId: urbanLegendsFormalIds.nodes.reportedMissingPassenger,
        semanticKey: 'reported_missing_passenger',
        title: '失踪报案',
        narrativeUse: '让亲属把担忧转化为可核对的最后出现时间、物件和人物关系；是否正式立案仍取决于本回合程序事实。',
        compatibleIdentities: ['police', 'civilian'],
        relevantActorIds: [urbanLegendsFormalIds.actors.relative, urbanLegendsFormalIds.actors.juniorOfficer],
        relevantPlaceIds: [urbanLegendsFormalIds.places.terminal, urbanLegendsFormalIds.places.chaChaanTeng],
        permittedFactKinds: ['亲属确实报案或寻求帮助。', '某个最后出现时间、物件或联系人被提出。', '警务单位是否正式受理的程序事实。'],
        progressSignals: ['出现可以向司机、站点或记录核对的具体信息。', '正式报案形成新的现实行动或责任。'],
        forbiddenConfirmations: ['报案本身证明怪谈。', '报案本身证明犯罪。', '亲属公开版本必然完整。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'case']
      }),
      node({
        nodeId: urbanLegendsFormalIds.nodes.neighborhoodRumor,
        semanticKey: 'neighborhood_rumor',
        title: '街坊说法',
        narrativeUse: '呈现亲眼所见、二手转述和后来加工的多个版本，让社区记忆成为可调查对象而不是全知答案。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [urbanLegendsFormalIds.actors.neighbor, urbanLegendsFormalIds.actors.relative],
        relevantPlaceIds: [urbanLegendsFormalIds.places.oldDistrictStreet, urbanLegendsFormalIds.places.chaChaanTeng],
        permittedFactKinds: ['某人确实讲过某个版本。', '不同版本在具体细节上不一致。', '街坊对讲述者的信任或怀疑发生变化。'],
        progressSignals: ['传闻中出现可核对的地点、时间或人物。', '来源污染或记忆差异变得具体。'],
        forbiddenConfirmations: ['老街坊天然知道真相。', '多人重复同一说法就使其成为事实。', '传闻自动变成全城新闻。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue']
      }),
      node({
        nodeId: urbanLegendsFormalIds.nodes.routeBusinessRumor,
        semanticKey: 'route_business_rumor',
        title: '路线利益传闻',
        narrativeUse: '让传闻和夜间运输、生意、人流及地盘压力发生现实联系，同时避免预设任何组织制造了怪谈。',
        compatibleIdentities: ['gang_member', 'civilian', 'police'],
        relevantActorIds: [urbanLegendsFormalIds.actors.societyLiaison, urbanLegendsFormalIds.actors.driver],
        relevantPlaceIds: [urbanLegendsFormalIds.places.terminal, urbanLegendsFormalIds.places.oldDistrictStreet],
        permittedFactKinds: ['某处生意或人流确实变化。', '某人提出利益解释。', '有人尝试利用或压制消息的具体行动。'],
        progressSignals: ['利益说法指向可核对的人物、交易或路线变化。', '有人因传闻采取有现实代价的行动。'],
        forbiddenConfirmations: ['社团必然是幕后。', '利益相关就证明犯罪。', '自动升级为暴力任务。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue']
      })
    ]
  },
  {
    stageId: urbanLegendsFormalIds.stages.firstClues,
    semanticKey: 'first_clues',
    title: '第一批线索',
    narrativeFunction: '把传闻转化为能够核对但彼此不完全一致的记录、证词、物件和时间差，使玩家意识到问题不只是“有没有鬼”。',
    allowedNextStageIds: [urbanLegendsFormalIds.stages.interestConflict],
    permittedFactKinds: ['记录、证词、物件或营业时间之间的具体差异。', '人物因提供或隐瞒线索承担现实风险。', '一条线索支持多种解释。', '已有案件与新证据形成经过验证的关联。'],
    advanceEvidence: {
      requiresStructuredWorldChange: true,
      signals: ['发现某人因特定解释获益或受损。', '有人实际压制、利用或改变叙述。', '调查已经改变人物关系或现实机会。', '玩家必须在相互冲突的信息来源之间作出有后果的选择。'],
      insufficientOnTheirOwn: ['收集到任意三条线索。', '再次询问同一人物。', '判定成功但线索没有落入世界状态。', '模型总结说线索更多。']
    },
    progressDecisionGuidance: {
      remainWhen: [
        '本回合只新增孤立线索、重复询问或再次描述矛盾，尚未形成具体利益主体及现实后果。',
        '现有写回只证明信息更多，却没有证明谁在获益、受损、压制、利用或改变叙述。'
      ],
      advanceOrCompleteWhen: [
        '已应用写回证明具体人物或组织因某种解释获益、受损、压制、利用或改变叙述。',
        '玩家在冲突信息之间的选择已经改变关系、工作、名誉、生意、程序或现实机会；不要求收齐全部线索或使用全部节点。'
      ],
      transitionMeaning: '进入下一阶段只表示现实利益已经开始塑造证据、叙述和人物行动；不表示线索已经收齐、唯一幕后已经确认或调查已经结束。'
    },
    forbiddenConfirmations: ['锁定唯一嫌疑人或唯一幕后。', '解释清楚全部异常。', '把线索数量当作固定任务进度。', '把未核实证词写成全局真相。'],
    identityAdaptationHints: {
      police: ['通过权限内记录、报案与询问核对差异。', '程序合法性与证据可信度同样重要。'],
      civilian: ['通过生活记录、熟人关系和公开资料核对。', '不能调取内部档案或强迫证人。'],
      gang_member: ['通过街面关系和利益渠道核对。', '非正式消息仍需区分来源、动机与事实。']
    },
    allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'case'],
    caseBoundary: createCaseBoundary(
      ['线索形成符合程序的正式失踪、犯罪或既有案件关联事实。'],
      ['仅因线索矛盾或无法解释而立案。', '把传闻热度当作犯罪证据。']
    ),
    nodes: [
      node({
        nodeId: urbanLegendsFormalIds.nodes.driverTestimony,
        semanticKey: 'driver_testimony',
        title: '司机证词',
        narrativeUse: '核对司机对班次、停车、车门和乘客的职业记忆，并让饭碗、责任与记忆可靠性同时产生压力。',
        compatibleIdentities: ['police', 'civilian'],
        relevantActorIds: [urbanLegendsFormalIds.actors.driver, urbanLegendsFormalIds.actors.dispatcher],
        relevantPlaceIds: [urbanLegendsFormalIds.places.terminal],
        permittedFactKinds: ['司机在本回合给出的具体说法。', '证词与排班或他人说法的差异。', '司机因说法承担的职业风险。'],
        progressSignals: ['证词出现可核对差异。', '司机改变说法、提供物件或采取保护自己的行动。'],
        forbiddenConfirmations: ['司机必然撒谎。', '疲劳或记忆差异证明灵异。', '职业违规自动等于失踪真相。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'case']
      }),
      node({
        nodeId: urbanLegendsFormalIds.nodes.oldRouteRecords,
        semanticKey: 'old_route_records',
        title: '旧线路资料',
        narrativeUse: '通过 1988 年可获得的纸本排班、车票、报纸、电话记录或营业记录建立可比较的时间线。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [urbanLegendsFormalIds.actors.dispatcher, urbanLegendsFormalIds.actors.reporter],
        relevantPlaceIds: [urbanLegendsFormalIds.places.terminal, urbanLegendsFormalIds.places.chaChaanTeng],
        permittedFactKinds: ['某份时代可行记录存在、缺失或被补写。', '不同记录之间存在版本差异。', '谁有权限接触或修改记录。'],
        progressSignals: ['记录把传闻缩小到可核对时间段。', '缺失或改动产生具体责任与利益问题。'],
        forbiddenConfirmations: ['使用现代联网监控或手机定位。', '记录缺失本身证明阴谋。', '纸本记录天然绝对可靠。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'case']
      }),
      node({
        nodeId: urbanLegendsFormalIds.nodes.contradictoryWitness,
        semanticKey: 'contradictory_witness',
        title: '矛盾目击',
        narrativeUse: '让互不相同的时间、灯光、车次或人物描述形成具体冲突，并追踪这些说法如何受传播和压力影响。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [urbanLegendsFormalIds.actors.neighbor, urbanLegendsFormalIds.actors.relative, urbanLegendsFormalIds.actors.reporter],
        relevantPlaceIds: [urbanLegendsFormalIds.places.oldDistrictStreet, urbanLegendsFormalIds.places.chaChaanTeng],
        permittedFactKinds: ['某人确实给出过某个版本。', '两种说法在稳定细节上冲突。', '证人因质疑或曝光改变行为。'],
        progressSignals: ['冲突指向具体信息渠道或利益。', '某个证人因坚持、撤回或更改说法承担后果。'],
        forbiddenConfirmations: ['矛盾证词必然意味着有人犯罪。', '相似证词必然证明超自然。', '旁白替证人确认其未亲见的事实。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue']
      })
    ]
  },
  {
    stageId: urbanLegendsFormalIds.stages.interestConflict,
    semanticKey: 'interest_conflict',
    title: '利益冲突',
    narrativeFunction: '把线索问题转化为机构、媒体、家庭、社团和生意之间的现实选择，让人物从证人变成有自身利益的行动者。',
    allowedNextStageIds: [urbanLegendsFormalIds.stages.truthInvestigation],
    permittedFactKinds: ['人物公开、压下、交易或改变消息的具体行动。', '关系、工作、名誉、生意或程序成本。', '证据因现实冲突被保护、污染、公开或丢失。', '城市局部舆论或人流的实际变化。'],
    advanceEvidence: {
      requiresStructuredWorldChange: true,
      signals: ['玩家或 NPC 已承担某一立场的具体代价。', '某种解释获得可系统验证的现实路径。', '有人采取不可逆的公开、隐瞒、离开或交易行动。', '事件已改变公开叙事或机构处理方式。'],
      insufficientOnTheirOwn: ['人物发生争吵。', '出现社团或媒体。', '玩家表态但没有现实后果。', '冲突描写升级。']
    },
    progressDecisionGuidance: {
      remainWhen: [
        '冲突仍停留在争吵、表态或气氛升级，没有实际代价、不可逆行动或可检验路径。',
        '不同利益方虽然出现，但本回合没有改变信息流、关系、程序、生意或公开叙事。'
      ],
      advanceOrCompleteWhen: [
        '已应用写回证明某一立场承担了具体代价，或有人采取了不可逆的公开、隐瞒、离开或交易行动。',
        '至少一种竞争性解释已经获得可系统检验的现实路径，足以进入证据与动机的正式比较。'
      ],
      transitionMeaning: '进入下一阶段只表示利益冲突已经产生可检验的解释路径；不表示冲突已经解决、任何一方必然犯罪或唯一答案已经出现。'
    },
    forbiddenConfirmations: ['强制玩家选择唯一正确阵营。', '把利益冲突简化为善恶二分。', '自动升级为枪战或灵异攻击。', '把组织利益等同于犯罪事实。'],
    identityAdaptationHints: {
      police: ['面对程序、上级、家属和媒体压力。', '没有授权时不能以职业身份解决所有冲突。'],
      civilian: ['面对隐私、工作、家庭和舆论代价。', '可以公开、沉默、支持或退出。'],
      gang_member: ['面对地盘、生意、警方和组织内部利益。', '可以利用或压制传闻，但行动必须产生现实代价。']
    },
    allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'case', 'citySituation'],
    caseBoundary: createCaseBoundary(
      ['利益行动产生经过验证的犯罪、妨碍调查或既有案件关联事实。'],
      ['仅因人物立场对立或社团出现而立案。', '用阶段名称代替案件事实。']
    ),
    nodes: [
      node({
        nodeId: urbanLegendsFormalIds.nodes.pressExaggeration,
        semanticKey: 'press_exaggeration',
        title: '新闻炒作',
        narrativeUse: '让报道、标题、消息来源和亲属隐私之间产生可追踪的公开代价。',
        compatibleIdentities: ['civilian', 'police', 'gang_member'],
        relevantActorIds: [urbanLegendsFormalIds.actors.reporter, urbanLegendsFormalIds.actors.relative],
        relevantPlaceIds: [urbanLegendsFormalIds.places.chaChaanTeng, urbanLegendsFormalIds.places.oldDistrictStreet],
        permittedFactKinds: ['报道确实发布、修改或被压下。', '消息来源被使用或保护。', '报道造成具体关系或公共影响。'],
        progressSignals: ['报道迫使人物采取新行动。', '公开版本和私人证据发生可验证冲突。'],
        forbiddenConfirmations: ['新闻内容自动成为世界真相。', '记者必然只为销量撒谎。', '报道自动制造全城恐慌。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'citySituation']
      }),
      node({
        nodeId: urbanLegendsFormalIds.nodes.societyUsesRumor,
        semanticKey: 'society_uses_rumor',
        title: '借传闻施压',
        narrativeUse: '检验是否有人把传闻用于赶客、压价、遮掩普通活动或控制消息，而不是预设社团策划全部事件。',
        compatibleIdentities: ['gang_member', 'police', 'civilian'],
        relevantActorIds: [urbanLegendsFormalIds.actors.societyLiaison, urbanLegendsFormalIds.actors.driver],
        relevantPlaceIds: [urbanLegendsFormalIds.places.oldDistrictStreet, urbanLegendsFormalIds.places.terminal],
        permittedFactKinds: ['某人实施了具体施压或利用行动。', '生意、人流或证人合作发生变化。', '组织内部存在不同立场。'],
        progressSignals: ['利用行为留下可核对的受益、损失或证据。', '组织人物必须承担警方、媒体或内部关系后果。'],
        forbiddenConfirmations: ['社团整体必然共谋。', '社团身份自动证明犯罪。', '传闻背后一定是地盘争夺。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'case']
      }),
      node({
        nodeId: urbanLegendsFormalIds.nodes.internalDisagreement,
        semanticKey: 'internal_disagreement',
        title: '警队内部分歧',
        narrativeUse: '让警务资源、程序、风险判断和对外口径产生现实分歧，而不是把上级简单写成阻碍者。',
        compatibleIdentities: ['police', 'civilian'],
        relevantActorIds: [urbanLegendsFormalIds.actors.juniorOfficer, urbanLegendsFormalIds.actors.relative],
        relevantPlaceIds: [urbanLegendsFormalIds.places.oldDistrictStreet, urbanLegendsFormalIds.places.terminal],
        permittedFactKinds: ['某位警务人员提出具体处理意见。', '单位作出可验证的程序或资源决定。', '家属或媒体对处理方式产生反应。'],
        progressSignals: ['机构决定改变调查或公开路径。', '玩家必须承担服从、质疑、移交或私人核实的代价。'],
        forbiddenConfirmations: ['上级反对就证明腐败。', '程序争议自动证明掩盖真相。', '基层警员拥有跨单位权限。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'case']
      })
    ]
  },
  {
    stageId: urbanLegendsFormalIds.stages.truthInvestigation,
    semanticKey: 'truth_investigation',
    title: '真相调查',
    narrativeFunction: '检验多套竞争性解释，让可确认事实、人物信念和不可解释残余保持分层，并允许玩家形成足以行动但不必覆盖全部细节的判断。',
    allowedNextStageIds: [urbanLegendsFormalIds.stages.aftermath],
    permittedFactKinds: ['至少两套能够解释部分证据的路径。', '证据可信度、来源和人物动机的具体冲突。', '可以确认的现实行为与仍只能推断的部分。', '玩家公开、隐瞒、移交、利用或停止调查的现实决定。'],
    advanceEvidence: {
      requiresStructuredWorldChange: true,
      signals: ['玩家已经形成足以采取现实行动的判断。', '某个公共或私人结论已经被实际采用。', '关键人物退出、承认、失联或拒绝合作并改变世界状态。', '继续维持原有状态已经不可能，或玩家明确中止。'],
      insufficientOnTheirOwn: ['找到所谓最后一条线索。', '模型宣布谜底。', '玩家猜中某种解释但没有行动。', '完成全部节点。']
    },
    progressDecisionGuidance: {
      remainWhen: [
        '现有证据仍不足以支持任何可行动、公开、移交、利用或停止调查的判断，且本回合没有形成现实后果。',
        '所谓残余仍然无边界、不断扩张或只靠旁白补造，尚不能与已确认事实分离。'
      ],
      advanceOrCompleteWhen: [
        '已应用写回支持一个足以采取现实行动的判断、公开或私人结论、移交决定或停止调查，并已经形成现实后果。',
        '一处或少数无法继续核对的残余已经被限定在具体记录、物件、时间差或人物信念中；有界未解释残余与推进兼容。'
      ],
      transitionMeaning: '进入下一阶段只表示已有判断及其现实后果可以被人物、机构和城市吸收；不表示唯一真相或超自然已经确认，也不要求消除全部疑问。'
    },
    forbiddenConfirmations: ['以全知旁白宣布唯一真相。', '客观确认鬼魂或灵异力量。', '要求找齐所有节点才允许结束。', '让所有人物自动承认同一解释。'],
    identityAdaptationHints: {
      police: ['区分可用于正式行动的证据、线索和个人怀疑。', '公开或移交结论必须符合权限与程序。'],
      civilian: ['通过生活关系与公开渠道形成判断。', '可以停止调查，也可以把事实交给有权限者。'],
      gang_member: ['判断何种解释影响组织和街面利益。', '不能把非正式消息自动变成警方事实。']
    },
    allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'case', 'citySituation'],
    caseBoundary: createCaseBoundary(
      ['调查形成符合程序的犯罪、失踪或既有案件关联事实。', '现有案件基于新证据发生合法状态更新。'],
      ['仅因解释仍有残余而立案。', '用超自然判断替代案件事实。']
    ),
    nodes: [
      node({
        nodeId: urbanLegendsFormalIds.nodes.timelineReconstruction,
        semanticKey: 'timeline_reconstruction',
        title: '时间线复原',
        narrativeUse: '把车次、报案、电话、纸本记录和营业时间组合为可检查的多版本时间线。',
        compatibleIdentities: ['police', 'civilian', 'gang_member'],
        relevantActorIds: [urbanLegendsFormalIds.actors.driver, urbanLegendsFormalIds.actors.dispatcher, urbanLegendsFormalIds.actors.relative],
        relevantPlaceIds: [urbanLegendsFormalIds.places.terminal, urbanLegendsFormalIds.places.chaChaanTeng],
        permittedFactKinds: ['某项时间记录确实存在或冲突。', '某人对具体时间的记忆发生变化。', '不同时间线各自能解释和不能解释的事实。'],
        progressSignals: ['时间线排除一种重要解释。', '时间差指向某个可行动的现实决定或责任。'],
        forbiddenConfirmations: ['时间线缺口自动证明超自然。', '用现代数字记录填补时代不存在的数据。', '旁白替缺失记录补造事实。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'case']
      }),
      node({
        nodeId: urbanLegendsFormalIds.nodes.routeSurveillance,
        semanticKey: 'route_surveillance',
        title: '路线查访',
        narrativeUse: '沿总站、旧区和夜间营业地点进行时代可行的走访、观察和物证核对。',
        compatibleIdentities: ['police', 'gang_member', 'civilian'],
        relevantActorIds: [urbanLegendsFormalIds.actors.neighbor, urbanLegendsFormalIds.actors.societyLiaison, urbanLegendsFormalIds.actors.juniorOfficer],
        relevantPlaceIds: [urbanLegendsFormalIds.places.terminal, urbanLegendsFormalIds.places.oldDistrictStreet, urbanLegendsFormalIds.places.chaChaanTeng],
        permittedFactKinds: ['某人在查访时实际看见或找到的具体信息。', '地点、人流或营业规律的变化。', '物件的存在与可核对来源。'],
        progressSignals: ['查访确认或排除一项关键现实路径。', '地点证据迫使相关人物采取行动。'],
        forbiddenConfirmations: ['使用联网实时监控、手机定位或现代门禁记录。', '仅凭阴森氛围认定异常。', '无授权角色获得警务监控能力。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'case', 'citySituation']
      }),
      node({
        nodeId: urbanLegendsFormalIds.nodes.mundaneLead,
        semanticKey: 'mundane_lead',
        title: '现实线索',
        narrativeUse: '检验犯罪、隐瞒、交通安排、个人离开、误认或机构失误等现实解释，同时保留其无法覆盖的部分。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [urbanLegendsFormalIds.actors.driver, urbanLegendsFormalIds.actors.dispatcher, urbanLegendsFormalIds.actors.reporter, urbanLegendsFormalIds.actors.societyLiaison],
        relevantPlaceIds: [urbanLegendsFormalIds.places.terminal, urbanLegendsFormalIds.places.oldDistrictStreet],
        permittedFactKinds: ['某种现实行为确实发生。', '现实解释覆盖和不能覆盖的证据范围。', '人物因该解释改变立场或承担责任。'],
        progressSignals: ['现实解释足以支持公开、案件、关系或退出决定。', '无法解释的残余已被限定为具体细节。'],
        forbiddenConfirmations: ['现实解释自动覆盖全部事实。', '线索存在就证明某人是幕后。', '把候选秘密域整体写成事实。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'case']
      })
    ]
  },
  {
    stageId: urbanLegendsFormalIds.stages.aftermath,
    semanticKey: 'aftermath',
    title: '结局余波',
    narrativeFunction: '展示城市、人物、机构和关系如何吸收玩家及 NPC 已经作出的决定，让结果长期留在通用 Runtime 中，并允许传闻持续、变形或消退。',
    allowedNextStageIds: [],
    permittedFactKinds: ['人物关系、工作、名誉或生活状态的变化。', '报道、沉默、案件处理或非案件结论。', '传闻持续、变形或消退的具体传播事实。', '一部分现实事实被确认，同时保留有限且具体的未解释残余。'],
    advanceEvidence: {
      requiresStructuredWorldChange: true,
      signals: ['主要社会张力已经形成稳定世界结果。', '公开或私人结论已产生可持续后果。', '玩家明确退出且 NPC 后续已形成结果。', 'Arc 可以完成但人物和世界历史继续存在。'],
      insufficientOnTheirOwn: ['旁白宣布故事结束。', '玩家离开一次现场。', '用结局标签替代世界写回。', '删除相关人物或历史。']
    },
    progressDecisionGuidance: {
      remainWhen: [
        '结果仍只存在于旁白、结局标签或一次离场，没有已应用写回形成稳定后果。',
        '公开说法、关系、案件、生活或退出结果仍在发生实质变化，尚未形成可持续状态。'
      ],
      advanceOrCompleteWhen: [
        '已应用写回使公开说法、关系、案件、生活、生意或退出结果形成稳定且可持续的世界状态。',
        '现实结论已经能够长期存在，同时允许不同人物信念和一处或少数有界未解释残余继续保留。'
      ],
      transitionMeaning: 'complete 只结束本 Arc 的主要推进；有界未解释残余、不同人物信念、既有人物与世界历史可以继续存在，并且不自动完成整个 DLC。'
    },
    forbiddenConfirmations: ['清除已经成立的世界事实。', '让人物恢复初始状态。', '把所有结果写成玩家胜利。', '自动确认超自然存在。', '完成 Arc 后删除人物。'],
    identityAdaptationHints: {
      police: ['承接案件、程序、职业关系和公开口径的后果。', '没有正式案件时也允许形成非案件结论。'],
      civilian: ['承接家庭、工作、街坊和媒体影响。', '退出或没有查清不等于失败清档。'],
      gang_member: ['承接地盘、生意、组织关系和警方关注。', '传闻可能继续被利用，也可能失去价值。']
    },
    allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'case', 'citySituation'],
    caseBoundary: createCaseBoundary(
      ['更新已经正式存在的案件结果。', '余波中出现新的、独立且符合程序的案件事实。'],
      ['为了给 Arc 收尾而强行新建案件。', '用案件状态确认超自然解释。']
    ),
    nodes: [
      node({
        nodeId: urbanLegendsFormalIds.nodes.publicAccount,
        semanticKey: 'public_account',
        title: '公开说法',
        narrativeUse: '让家属、记者、警方和社区根据各自掌握的事实形成可能互不相同的公开版本。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [urbanLegendsFormalIds.actors.relative, urbanLegendsFormalIds.actors.reporter, urbanLegendsFormalIds.actors.juniorOfficer],
        relevantPlaceIds: [urbanLegendsFormalIds.places.chaChaanTeng, urbanLegendsFormalIds.places.oldDistrictStreet],
        permittedFactKinds: ['某个公开版本确实发布或被接受。', '不同人物对公开说法的反应。', '公开行为造成的关系与城市影响。'],
        progressSignals: ['公开版本已经产生可持续后果。', '相关人物决定接受、反对、撤回或保持沉默。'],
        forbiddenConfirmations: ['公开说法自动成为客观真相。', '所有人物共享同一结论。', '新闻标题替代世界证据。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'case', 'citySituation']
      }),
      node({
        nodeId: urbanLegendsFormalIds.nodes.unansweredDetail,
        semanticKey: 'unanswered_detail',
        title: '保留疑问',
        narrativeUse: '在现实判断已经足够行动时，保留一处有明确边界、无法完全核对的残余。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [urbanLegendsFormalIds.actors.driver, urbanLegendsFormalIds.actors.neighbor, urbanLegendsFormalIds.actors.relative],
        relevantPlaceIds: [urbanLegendsFormalIds.places.terminal, urbanLegendsFormalIds.places.oldDistrictStreet],
        permittedFactKinds: ['某个具体记录、物件或证词仍无法对齐。', '不同人物继续持有不同信念。', '传闻因残余细节继续存在。'],
        progressSignals: ['残余已被限制为具体细节，不妨碍现实结论。', '人物和城市对未知形成稳定但不同的态度。'],
        forbiddenConfirmations: ['残余证明鬼魂。', '残余扩张成超自然系统。', '为了保留神秘而否定全部现实证据。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue']
      }),
      node({
        nodeId: urbanLegendsFormalIds.nodes.abandonedInquiry,
        semanticKey: 'abandoned_inquiry',
        title: '放弃调查',
        narrativeUse: '承接玩家或关键人物因证据不足、现实压力或个人选择停止介入后的世界后果。',
        compatibleIdentities: allIdentities,
        relevantActorIds: [urbanLegendsFormalIds.actors.relative, urbanLegendsFormalIds.actors.reporter, urbanLegendsFormalIds.actors.societyLiaison],
        relevantPlaceIds: [urbanLegendsFormalIds.places.oldDistrictStreet, urbanLegendsFormalIds.places.chaChaanTeng],
        permittedFactKinds: ['谁明确停止介入。', '证据、关系或机会因退出发生的变化。', 'NPC、新闻或传闻在玩家退出后的实际去向。'],
        progressSignals: ['退出已经形成稳定现实状态。', 'Arc 可以等待、偏转、被 NPC 承接或完成。'],
        forbiddenConfirmations: ['退出等于失败清档。', '重新创建一条相同 Arc。', '强迫玩家返回调查。'],
        allowedWritebackKinds: [...ordinaryWorldWritebacks, 'newsIssue', 'case']
      })
    ]
  }
];

export function getUrbanLegendsFormalStageContract(
  stageId: string
): UrbanLegendsFormalStageContract | undefined {
  return urbanLegendsFormalStageContracts.find((stage) => stage.stageId === stageId);
}

export function getUrbanLegendsFormalNodeContract(
  nodeId: string
): UrbanLegendsFormalNodeContract | undefined {
  return urbanLegendsFormalStageContracts
    .flatMap((stage) => stage.nodes)
    .find((candidate) => candidate.nodeId === nodeId);
}
