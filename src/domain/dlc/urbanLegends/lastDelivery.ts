import type { UrbanLegendsExpandedArcDefinition } from './expandedContent';

type ArcStage = UrbanLegendsExpandedArcDefinition['stages'][number];
type ArcNode = ArcStage['nodes'][number];
type WritebackKind = ArcNode['allowedWritebackKinds'][number];

const allIdentities = ['police', 'civilian', 'gang_member'] as const;
const ordinaryWritebacks: readonly WritebackKind[] = [
  'actor',
  'signal',
  'currentMatter',
  'relationshipThread',
  'actorMemory'
];
const publicWritebacks: readonly WritebackKind[] = [
  ...ordinaryWritebacks,
  'newsIssue',
  'case',
  'citySituation'
];

const lastDeliveryIds = {
  contentId: 'official_dlc_urban_legends_hk1988_last_delivery',
  arcKey: 'official-dlc:urban_legends:hk_1988:last_delivery',
  actors: {
    owner: 'official_dlc_urban_legends_hk1988_last_delivery_shop_owner',
    courier: 'official_dlc_urban_legends_hk1988_last_delivery_courier',
    caretaker: 'official_dlc_urban_legends_hk1988_last_delivery_caretaker',
    relative: 'official_dlc_urban_legends_hk1988_last_delivery_relative',
    forensicDoctor: 'official_dlc_urban_legends_hk1988_last_delivery_forensic_doctor'
  },
  places: {
    restaurant: 'official_dlc_urban_legends_hk1988_last_delivery_restaurant',
    tenement: 'official_dlc_urban_legends_hk1988_last_delivery_tenement',
    doorway: 'official_dlc_urban_legends_hk1988_last_delivery_doorway'
  },
  stages: {
    streetRumor: 'official_dlc_urban_legends_hk1988_last_delivery_stage_street_rumor',
    firstClues: 'official_dlc_urban_legends_hk1988_last_delivery_stage_first_clues',
    interestConflict: 'official_dlc_urban_legends_hk1988_last_delivery_stage_interest_conflict',
    truthInvestigation: 'official_dlc_urban_legends_hk1988_last_delivery_stage_truth_investigation',
    aftermath: 'official_dlc_urban_legends_hk1988_last_delivery_stage_aftermath'
  }
} as const;

function storyNode(
  nodeId: string,
  title: string,
  narrativeUse: string,
  relevantActorIds: readonly string[],
  relevantPlaceIds: readonly string[],
  permittedFactKinds: readonly string[],
  progressSignals: readonly string[],
  forbiddenConfirmations: readonly string[],
  allowedWritebackKinds: readonly WritebackKind[] = publicWritebacks
): ArcNode {
  return {
    nodeId,
    title,
    narrativeUse,
    compatibleIdentities: allIdentities,
    relevantActorIds,
    relevantPlaceIds,
    permittedFactKinds,
    progressSignals,
    forbiddenConfirmations,
    allowedWritebackKinds
  };
}

const identityHints = {
  police: [
    '可从诈骗或滋扰报案、住户失联、异味求助、合法福利检查或死亡调查进入。',
    '传闻本身不授权破门、搜查或公开死因。'
  ],
  civilian: [
    '可从店员、送餐、街坊、亲属或楼宇生活接触订单和住户异常。',
    '不能冒充警方、法医或气体事故检验人员。'
  ],
  gang_member: [
    '可从夜间外卖路线、店铺纠纷、保护费、恶作剧或有人借怪谈赶客进入。',
    '街面关系只能提供渠道，不能代替合法现场与医学证据。'
  ]
} as const;

const actors: UrbanLegendsExpandedArcDefinition['actors'] = [
  {
    actorId: lastDeliveryIds.actors.owner,
    name: '方国成',
    publicIdentity: '旺角一间营业至深夜的快餐店东主。',
    publicFacts: ['习惯亲自核对电话订单和每日现金。', '连续几晚为同一楼宇地址留下过送餐记录。'],
    informationBoundary: ['知道店内订单、收款和员工安排，不知道住宅内发生过什么。'],
    forbiddenConfirmations: ['不能预设他看见真钱在眼前变成纸钱。', '怀疑员工不等于员工确实恶作剧。']
  },
  {
    actorId: lastDeliveryIds.actors.courier,
    name: '梁伟康',
    publicIdentity: '替快餐店送夜间外卖的年轻伙计。',
    publicFacts: ['熟悉附近楼宇、门牌和夜间路线。', '曾按指示把餐盒放在门外并取走门边款项。'],
    informationBoundary: ['知道自己看见和接触过什么，不知道来电者身份或屋内情况。'],
    forbiddenConfirmations: ['门后没有应答不等于屋内无人或有鬼。', '不得把紧张或记忆差异自动写成说谎。']
  },
  {
    actorId: lastDeliveryIds.actors.caretaker,
    name: '黄瑞娥',
    publicIdentity: '永安楼夜间看更兼住户联络人。',
    publicFacts: ['掌握部分访客、住户作息和楼宇钥匙安排。', '对深夜送餐影响楼宇名声感到不安。'],
    informationBoundary: ['能说明公共区域情况，不能确认每一户门后的活动。'],
    forbiddenConfirmations: ['没有看见住户出门不等于住户已死亡。', '楼宇旧损不自动证明气体事故。']
  },
  {
    actorId: lastDeliveryIds.actors.relative,
    name: '何淑仪',
    publicIdentity: '与尾房其中一名住户保持往来的亲属。',
    publicFacts: ['知道亲属近期社交、工作和部分身体状况。', '希望先确认安危，再决定是否公开私人信息。'],
    informationBoundary: ['不知道每晚牌局、来电和送餐的完整情况。'],
    forbiddenConfirmations: ['联络不上不等于已经死亡。', '家属记忆不能自动成为精确死亡时间。']
  },
  {
    actorId: lastDeliveryIds.actors.forensicDoctor,
    name: '苏国诚',
    publicIdentity: '按程序参与死亡时间与检验意见整理的法医科医生。',
    publicFacts: ['只能在合法程序和实际检验后提出有范围的医学意见。', '会区分观察、估计与最终报告。'],
    informationBoundary: ['掌握获准检验的医学结果，不知道外卖订单和款项在店内的全部流转。'],
    forbiddenConfirmations: ['胃内容物只能证明食物特征和有限时间判断，不能独自证明送餐发生在死亡后。', '不得用医学意见确认鬼魂点餐。']
  }
];

const places: UrbanLegendsExpandedArcDefinition['places'] = [
  {
    placeId: lastDeliveryIds.places.restaurant,
    name: '民生快餐店',
    summary: '用纸本订单、固定电话和现金维持夜间外卖的小店；柜台、厨房与收款交接必须分开核对。'
  },
  {
    placeId: lastDeliveryIds.places.tenement,
    name: '永安楼',
    summary: '楼龄已久的混合住宅，公用电话、楼梯、看更台和住户门牌构成不完整但可追查的信息链。'
  },
  {
    placeId: lastDeliveryIds.places.doorway,
    name: '永安楼四楼尾房门廊',
    summary: '送餐被要求放下、款项据称被取走的狭窄公共门廊；门内事实必须通过合法进入后才能成立。'
  }
];

const stages: UrbanLegendsExpandedArcDefinition['stages'] = [
  {
    stageId: lastDeliveryIds.stages.streetRumor,
    title: '纸钱找续',
    narrativeFunction: '让“同一住户连续深夜点餐，收下的真钱盘点时变成纸钱”先成为有订单、地址、经手人和生意风险的具体传闻。',
    allowedNextStageIds: [lastDeliveryIds.stages.firstClues],
    permittedFactKinds: ['电话订单确实被记录。', '餐盒确实送到某门牌。', '盘点时确实发现某些纸钱。', '店主或员工采取了隔离收款等核对行动。'],
    advanceSignals: ['出现可核对的订单字迹、通话时间、送餐路线、收款交接或纸钱来源。', '住户安危、员工冲突或店铺损失形成现实事项。'],
    insufficientOnTheirOwn: ['重复听见同一版本。', '员工感到害怕。', '纸钱外观与钞票相似。'],
    remainWhen: ['只有转述，没有稳定地址、订单、经手人或现实变化。'],
    advanceWhen: ['已应用写回把至少一晚订单、送餐、款项或住户异常变成可核对事实。'],
    transitionMeaning: '进入第一批线索只表示传闻获得现实证据链；不表示真钱真的变质、来电者已经死亡或鬼魂存在。',
    forbiddenConfirmations: ['旁白直接描写真钱变成纸钱。', '自动确认电话来自死者。', '仅凭无人应门破门或立案。'],
    identityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['形成正式诈骗、滋扰、住户失联、福利检查或其他符合现有门禁的独立警务事实。'],
    caseForbiddenConditions: ['仅因纸钱传闻、无人应门或 DLC 进入而建立案件。'],
    nodes: [
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_repeated_order',
        '重复夜单',
        '核对几晚订单的菜式、时间、来电内容、记单人和地址写法，区分同一来源与后来补写。',
        [lastDeliveryIds.actors.owner, lastDeliveryIds.actors.courier],
        [lastDeliveryIds.places.restaurant],
        ['纸本订单和班次。', '谁实际接过电话。'],
        ['至少一笔订单可以与送餐和收款交叉核对。'],
        ['相同菜式自动证明同一神秘来电者。']
      ),
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_isolated_payment',
        '单独收款',
        '让店主把目标地址款项独立封存并记录经手人，以建立可审计而非全知的现金链。',
        [lastDeliveryIds.actors.owner, lastDeliveryIds.actors.courier],
        [lastDeliveryIds.places.restaurant, lastDeliveryIds.places.doorway],
        ['隔离方式、封存时间和经手人。', '打开时实际发现的纸张或货币。'],
        ['现金链出现可定位的断点或可信见证。'],
        ['封存仍不能让“变成纸钱”成为客观事实。']
      ),
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_staff_suspicion',
        '伙计嫌疑',
        '呈现店主怀疑恶作剧、伙计维护清白以及同事关系受损，而不是先指定谁撒谎。',
        [lastDeliveryIds.actors.owner, lastDeliveryIds.actors.courier],
        [lastDeliveryIds.places.restaurant],
        ['质问、排班变化和关系压力。'],
        ['某人采取可核对的自证、隐瞒或退出行动。'],
        ['怀疑不能写成恶作剧事实。'],
        ordinaryWritebacks
      )
    ]
  },
  {
    stageId: lastDeliveryIds.stages.firstClues,
    title: '门内门外',
    narrativeFunction: '把怪谈拆成电话来源、订单纸本、送餐门廊、款项经手和住户时间线之间彼此不完全吻合的第一批证据。',
    allowedNextStageIds: [lastDeliveryIds.stages.interestConflict],
    permittedFactKinds: ['时代可行的电话、订单、排班和住户记录。', '门廊目击和餐盒去向。', '纸钱的印制、取得与经手范围。'],
    advanceSignals: ['发现有人因某种解释获益、免于追责或承担风险。', '记录被改动、隐瞒、传播或用于指责某人。'],
    insufficientOnTheirOwn: ['一次记忆矛盾。', '纸钱上有污迹。', '一次观察或判定成功。'],
    remainWhen: ['线索仍各自孤立，无法指向现实利益或人物行动。'],
    advanceWhen: ['已应用写回证明具体人物改变记录、证词、款项、住户联络或公开说法。'],
    transitionMeaning: '进入利益冲突只表示不同解释开始影响人物行为；不表示订单来自死者或屋内死亡事实已经成立。',
    forbiddenConfirmations: ['用现代来电显示或手机记录。', '纸钱来源不明自动证明超自然。', '住户失联自动等于死亡。'],
    identityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['形成正式失联、诈骗、恐吓、盗窃或与既有案件关联的独立事实。'],
    caseForbiddenConditions: ['只因电话来源不明或记录不齐建立灵异案件。'],
    nodes: [
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_phone_order_ledger',
        '电话与订单簿',
        '比较接单字迹、店内固定电话使用、班次和可能的公用电话渠道。',
        [lastDeliveryIds.actors.owner, lastDeliveryIds.actors.courier, lastDeliveryIds.actors.caretaker],
        [lastDeliveryIds.places.restaurant, lastDeliveryIds.places.tenement],
        ['纸本记录、接单人和时代可行通话线索。'],
        ['订单来源缩小到可调查的人或地点。'],
        ['不得生成现代精确主叫号码定位。']
      ),
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_doorway_timeline',
        '门廊时间线',
        '核对送餐到达、敲门、放下餐盒、取款和之后谁经过门廊。',
        [lastDeliveryIds.actors.courier, lastDeliveryIds.actors.caretaker],
        [lastDeliveryIds.places.doorway, lastDeliveryIds.places.tenement],
        ['可见行为、声音、门锁和公共区域目击。'],
        ['两个独立来源形成具体时间矛盾。'],
        ['门后声音自动来自住户或死者。']
      ),
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_joss_money_chain',
        '纸钱流转',
        '追踪纸钱从门廊到柜台再到盘点的每个接触点，并区分真钱、假钞、祭祀纸品和记忆误差。',
        [lastDeliveryIds.actors.owner, lastDeliveryIds.actors.courier],
        [lastDeliveryIds.places.restaurant, lastDeliveryIds.places.doorway],
        ['实际物件、包装、污迹和经手顺序。'],
        ['发现可验证调包机会或仍无法解释的封存缺口。'],
        ['不能把缺少调包机会表述为物质发生超自然变化。']
      )
    ]
  },
  {
    stageId: lastDeliveryIds.stages.interestConflict,
    title: '谁在说谎',
    narrativeFunction: '让店铺生计、员工清白、楼宇名声、家属隐私、警方程序和媒体猎奇围绕同一组记录产生有代价的冲突。',
    allowedNextStageIds: [lastDeliveryIds.stages.truthInvestigation],
    permittedFactKinds: ['停工、解雇、报案、寻人、报道、威吓或公开澄清。', '门匙、住户联络和进入权限的现实争议。'],
    advanceSignals: ['有人采取不可逆的公开、隐瞒、合作、毁弃或退出行动。', '住户安危或气体风险形成合法进入与检验条件。'],
    insufficientOnTheirOwn: ['人物争吵。', '顾客减少。', '记者听见传闻。'],
    remainWhen: ['冲突没有改变信息流、关系、程序或现场状态。'],
    advanceWhen: ['已应用写回证明现实行动打开了可依法检验住户、气体、付款或死亡时间的路径。'],
    transitionMeaning: '进入真相调查只表示存在合法、具体的检验路径；不表示屋内一定有人死亡或任何超自然说法成立。',
    forbiddenConfirmations: ['为制造恐怖而无程序破门。', '把伙计、看更或店主固定为调包者。', '强制升级为暴力冲突。'],
    identityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['正式失联或福利检查、气体危险、诈骗威吓、死亡现场或既有案件关联达到现有门禁。'],
    caseForbiddenConditions: ['媒体关注、店铺损失或住户传闻本身。'],
    nodes: [
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_shop_reputation',
        '快餐店危机',
        '让店主是否报警、处分伙计、公开纸钱或隐瞒损失产生真实生计和关系后果。',
        [lastDeliveryIds.actors.owner, lastDeliveryIds.actors.courier],
        [lastDeliveryIds.places.restaurant],
        ['营业、雇佣、公开说法和报案行动。'],
        ['店铺选择改变证据保存或人物关系。'],
        ['经营压力不能证明任何灵异解释。']
      ),
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_access_dispute',
        '入屋争议',
        '围绕亲属联络、看更权限、异味或危险迹象判断是否存在合法而紧迫的进入理由。',
        [lastDeliveryIds.actors.caretaker, lastDeliveryIds.actors.relative],
        [lastDeliveryIds.places.tenement, lastDeliveryIds.places.doorway],
        ['联络尝试、门匙责任、可观察危险和正式求助。'],
        ['合法程序或真实紧急风险获得确认。'],
        ['不得只因怪谈好奇心进入私人住宅。'],
        [...ordinaryWritebacks, 'case']
      ),
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_story_pressure',
        '猎奇版本',
        '追踪谁把“鬼点餐”说法公开、谁因此获利或受害，以及报道如何污染后来证词。',
        [lastDeliveryIds.actors.owner, lastDeliveryIds.actors.relative, lastDeliveryIds.actors.caretaker],
        [lastDeliveryIds.places.restaurant, lastDeliveryIds.places.tenement],
        ['消息来源、刊出内容、家属和街坊反应。'],
        ['公开版本迫使人物改变行动或证词。'],
        ['新闻标题不等于客观事实。']
      )
    ]
  },
  {
    stageId: lastDeliveryIds.stages.truthInvestigation,
    title: '死亡与饭盒',
    narrativeFunction: '在合法进入和实际检验发生后，对死亡现场、气体或通风风险、法医时间范围、饭盒与胃内容物进行证据链核对，同时保留多种可竞争解释。',
    allowedNextStageIds: [lastDeliveryIds.stages.aftermath],
    permittedFactKinds: ['依法进入后实际发现的现场状态。', '气体、炉具、通风和死亡时间的有范围意见。', '餐盒、食物特征、胃内容物和订单之间的可核对关联。'],
    advanceSignals: ['玩家或 NPC 形成足以采取现实行动的判断。', '正式结论、公开版本、家属决定或店铺处置改变世界状态。'],
    insufficientOnTheirOwn: ['尸体旁有麻将。', '胃内存在食物。', '死亡时间只是估计。', '一件物证来源不明。'],
    remainWhen: ['现场、医学、订单和送餐证据链仍被混成一个全知结论。'],
    advanceWhen: ['已应用写回分别记录可确认事实、人物信念和仍未解决的具体矛盾，并产生现实处置。'],
    transitionMeaning: '进入余波只表示世界已经据可用证据采取行动；不要求解释全部时间差，也不允许宣布鬼魂点餐。',
    forbiddenConfirmations: ['预写屋内人员必定死于一氧化碳。', '胃内容物自动证明死后进食或鬼魂收餐。', '旁白以全知视角解释纸钱变化。'],
    identityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['实际死亡现场、气体事故、诈骗、伤害、毁证或与正式案件的关联符合现有门禁。'],
    caseForbiddenConditions: ['为“灵异案件”建立脱离现有警务合同的新类型。'],
    nodes: [
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_lawful_entry',
        '合法入屋',
        '只在程序或紧急风险成立后记录入屋者、门锁、现场、牌局和餐盒的原始观察。',
        [lastDeliveryIds.actors.caretaker, lastDeliveryIds.actors.relative],
        [lastDeliveryIds.places.doorway, lastDeliveryIds.places.tenement],
        ['谁、何时、凭什么进入。', '未经解释的现场原始状态。'],
        ['现场事实进入正式记录并与先前时间线对照。'],
        ['不得为贴合传说强制生成多人死亡。'],
        [...ordinaryWritebacks, 'case']
      ),
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_gas_death_window',
        '气体与死亡窗',
        '核对炉具、通风、燃烧、环境和医学估计，区分可能死因、死亡时间范围与尚未确认部分。',
        [lastDeliveryIds.actors.forensicDoctor, lastDeliveryIds.actors.relative],
        [lastDeliveryIds.places.tenement],
        ['时代可行检验结果。', '有误差范围的死亡时间与原因意见。'],
        ['现实事故解释获得或失去证据支持。'],
        ['不得把“一氧化碳”预设为每个存档唯一死因。'],
        [...ordinaryWritebacks, 'case']
      ),
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_food_autopsy_timeline',
        '胃内最后一餐',
        '在合法法医意见出现后，比较胃内容物特征、餐盒、菜单、送达时间和死亡时间范围，不夸大医学精度。',
        [lastDeliveryIds.actors.forensicDoctor, lastDeliveryIds.actors.owner, lastDeliveryIds.actors.courier],
        [lastDeliveryIds.places.restaurant, lastDeliveryIds.places.tenement],
        ['食物特征和消化状态的有限意见。', '餐盒、菜单和订单的来源链。'],
        ['出现可以支持现实解释或留下有界矛盾的精确对照。'],
        ['胃内容物不能独自证明食物来自目标订单，更不能证明死者死后点餐。'],
        [...ordinaryWritebacks, 'case']
      )
    ]
  },
  {
    stageId: lastDeliveryIds.stages.aftermath,
    title: '最后一份外卖',
    narrativeFunction: '让事故、诈骗、恶作剧、误记或仍不完整的证据组合形成可承担的现实结果，并把店铺、家属、员工和城市传闻带入新的长期状态。',
    allowedNextStageIds: [],
    permittedFactKinds: ['正式调查或非案件结论。', '店铺、家属、员工、楼宇和新闻的稳定变化。', '一处有来源、有边界且不推翻现实事实的未解释残余。'],
    advanceSignals: ['主要人物已采取不可逆决定。', '公开或私人版本已经影响长期生活。', '继续调查已没有新的合理入口。'],
    insufficientOnTheirOwn: ['所有人暂时不再谈论。', '找到一个看似合理解释。', '保留惊悚气氛。'],
    remainWhen: ['人物和世界尚未承担任何结果，或仍把猜测当结论。'],
    advanceWhen: ['已应用写回稳定保存现实后果，并严格分离确认事实、人物信念与残余。'],
    transitionMeaning: '完成只结束本 Arc 的主要推进；不删除人物、案件、记忆和传闻，也不自动完成整个 DLC。',
    forbiddenConfirmations: ['用结尾反转客观确认鬼魂。', '把所有钱款差异都解释为超自然变化。', '让所有人物接受同一真相。'],
    identityHints,
    allowedWritebackKinds: publicWritebacks,
    caseAllowedConditions: ['既有案件依法结案、归档、转介或保留未决。'],
    caseForbiddenConditions: ['为了完成 Arc 而补造案件或强制结案。'],
    nodes: [
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_official_account',
        '官方说法',
        '形成有证据范围的事故、诈骗、未决或非案件结论，并保留哪些问题没有被回答。',
        [lastDeliveryIds.actors.forensicDoctor, lastDeliveryIds.actors.relative],
        [lastDeliveryIds.places.tenement],
        ['正式意见、结案状态或未决范围。'],
        ['世界开始按一种现实处置继续运转。'],
        ['官方版本不等于全知真相。']
      ),
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_lives_afterward',
        '店与人以后',
        '落实店主、伙计、家属和看更在名誉、工作、信任与日常生活上的长期变化。',
        [lastDeliveryIds.actors.owner, lastDeliveryIds.actors.courier, lastDeliveryIds.actors.caretaker, lastDeliveryIds.actors.relative],
        [lastDeliveryIds.places.restaurant, lastDeliveryIds.places.tenement],
        ['营业、雇佣、居住、关系和记忆变化。'],
        ['人物形成稳定新状态。'],
        ['不得让所有损失自动恢复。'],
        ordinaryWritebacks
      ),
      storyNode(
        'official_dlc_urban_legends_hk1988_last_delivery_node_last_receipt',
        '最后一张单',
        '只在现实结果稳定后保留一张有明确来源链却无法与全部时间完全对齐的订单、收据或纸钱。',
        [lastDeliveryIds.actors.owner, lastDeliveryIds.actors.courier, lastDeliveryIds.actors.forensicDoctor],
        [lastDeliveryIds.places.restaurant, lastDeliveryIds.places.doorway],
        ['物件由谁保存、何时出现、哪些部分无法核对。'],
        ['残余保持有界，不再扩张为新的超自然事实。'],
        ['未解释物件不能证明鬼魂、死后进食或真钱变质。']
      )
    ]
  }
];

export const urbanLegendsLastDeliveryArc: UrbanLegendsExpandedArcDefinition = {
  contentId: lastDeliveryIds.contentId,
  arcKey: lastDeliveryIds.arcKey,
  title: '最后一份外卖',
  plannerSummary: '快餐店连续接到同一住宅的深夜外卖电话，门外收款据称在盘点时成为纸钱；订单、住户安危、死亡时间与最后一餐可能互相矛盾，但任何异常都必须经过现实证据链才能成立。',
  initialStageId: lastDeliveryIds.stages.streetRumor,
  entryRoutes: {
    police: {
      contactSources: ['店主就疑似诈骗或滋扰报案。', '亲属或看更报告住户失联。', '楼宇出现异味、气体或福利检查需要。'],
      permissions: ['按岗位记录报案、核对证据、处理紧急风险，并在合法依据成立后协调进入和检验。'],
      restrictions: ['不能凭纸钱传闻破门、定死因或公开灵异结论。'],
      diversionRoutes: ['把单纯民事纠纷记录后转介。', '在没有依据时不介入私人住宅。', '继续普通值勤。']
    },
    civilian: {
      contactSources: ['在快餐店工作或送餐。', '与住户、店员或亲属相识。', '作为楼内街坊发现重复送餐和联络异常。'],
      permissions: ['通过生活关系、公开记录和自愿交流核对自身接触的事实。'],
      restrictions: ['不能取得警方、法医或楼宇管理权限。'],
      diversionRoutes: ['停止送餐或传播。', '把安危担忧交给亲属或当局。', '继续自己的工作和生活。']
    },
    gang_member: {
      contactSources: ['夜间外卖路线或店铺受地盘关系影响。', '有人借纸钱传闻勒索、赶客或嫁祸伙计。', '熟人住在目标楼宇。'],
      permissions: ['通过既有人情和街面渠道核对谁在利用消息。'],
      restrictions: ['不能把非正式消息写成死亡、医学或警方客观事实。'],
      diversionRoutes: ['只处理勒索或生意冲突。', '拒绝利用怪谈。', '把住户安危交给亲属或当局。']
    }
  },
  actors,
  places,
  stages,
  newsEvolution: [
    '早期只能报道店铺报称发现纸钱、住户联络异常或警方接获求助，不能写成“鬼点餐”事实。',
    '调查阶段可报道死亡现场、气体风险、诈骗或证据争议，但医学意见、家属信念和媒体标题必须分开。',
    '余波可以澄清、撤回、沉寂或保留民间版本；新闻不能确认死者死后点餐。'
  ],
  resolutionBoundaries: [
    '现实偏向：恶作剧、调包、订单误记、诈骗或他人代为点餐，与一场可解释的住宅事故共同解释大部分事实。',
    '多重暧昧：店内现金链、楼宇通话、住户活动和医学时间范围各自存在缺口，没有单一解释覆盖全部。',
    '有界残余：只保留一张来源明确却与死亡窗或送达时间无法完全对齐的订单、餐盒或纸钱，绝不以此确认鬼魂点餐。'
  ]
};
