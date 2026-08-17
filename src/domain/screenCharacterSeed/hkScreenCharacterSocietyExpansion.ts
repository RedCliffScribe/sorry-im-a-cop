import {
  buildScreenCharacterExpansion,
  type ScreenCharacterExpansionDraft,
  type ScreenCharacterExpansionWork
} from './screenCharacterSeedExpansionFactory';

const unwrittenLaw: ScreenCharacterExpansionWork = {
  id: 'work_film_unwritten_law',
  title: '法外情',
  titleEn: 'The Unwritten Law',
  medium: 'film',
  availableYears: { from: 1985, to: 1996 }
};

const unwrittenLawCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_unwritten_law_lau_chi_pang',
    displayName: '刘志鹏',
    aliases: ['刘大状'],
    gender: 'male',
    ageRange: { min: 25, max: 35 },
    category: 'police_law',
    currentIdentity: 'civilian',
    publicIdentity: '在英国完成法律训练、刚返港执业的刑事律师',
    profileSummary: '专业基础扎实、理想感强，愿意接下同行不看好的案件；年轻声誉、法律伦理和当事人的真实处境常同时拉扯他。',
    personality: '聪明、正直、自信，经验不足时会把所有责任独自背起。',
    motivation: '凭证据和辩护能力建立职业位置，不让贫穷或污名先替当事人定罪。',
    relationshipAnchors: ['刘惠兰：被告与尚未公开的血缘关系', '老关：协助调查和实务的前辈', '安妮：受案件压力影响的女友', '严德刚：法庭上的控方对手'],
    promptHooks: ['无人愿接的刑事案找上门', '委托人拒绝透露关键私人事实', '女友家族认为案件会毁掉他的前途'],
    importance: 91
  },
  {
    id: 'screen_film_unwritten_law_lau_wai_lan',
    displayName: '刘惠兰',
    aliases: ['惠兰'],
    gender: 'female',
    ageRange: { min: 48, max: 61 },
    category: 'civilian_relationship',
    currentIdentity: 'civilian',
    publicIdentity: '在欢场谋生、经济拮据的年长女性',
    profileSummary: '多年在社会边缘工作，把收入暗中用于供养孩子；遭遇刑事指控时更担心血缘真相伤害儿子的声誉。',
    personality: '忍耐、护子、低调、自尊强，宁愿自己受苦也不愿拖累孩子。',
    speechStyle: '平日谨慎寡言，涉及孩子时会坚决拒绝追问，情绪多藏在停顿里。',
    motivation: '保护儿子的前途与尊严，同时在不暴露私人秘密的情况下争取清白。',
    relationshipAnchors: ['刘志鹏：不知道她真实身份的亲生儿子', '老关：愿意听她说明实际困难的人', '殷小萍：可能提供重要证言的年轻护士'],
    promptHooks: ['一宗针对边缘女性的刑事指控', '她坚持隐瞒一件能帮助辩护的往事', '欢场旧识遭到威胁不敢作证'],
    importance: 92
  },
  {
    id: 'screen_film_unwritten_law_annie',
    displayName: '安妮',
    englishName: 'Annie',
    gender: 'female',
    ageRange: { min: 23, max: 33 },
    category: 'police_law',
    currentIdentity: 'civilian',
    publicIdentity: '出身法律界家庭、与刘志鹏交往的职业女性',
    profileSummary: '熟悉体面职业圈的规则，真心关心志鹏，却也承受家庭对名声、婚姻和案件选择的现实压力。',
    personality: '理性、重感情、顾虑周全，长期被忽略后会保护自己的生活。',
    motivation: '维持平等而诚实的关系，不让父辈安排或伴侣的工作完全决定未来。',
    relationshipAnchors: ['刘志鹏：事业与案件不断侵入关系的男友', '法律界父辈：提供机会也施加压力的人'],
    promptHooks: ['家人要求她劝志鹏退出案件', '重要约会再次被调查打断', '她发现控辩双方存在私人关系'],
    importance: 78
  },
  {
    id: 'screen_film_unwritten_law_yan_siu_ping',
    displayName: '殷小萍',
    aliases: ['小萍'],
    gender: 'female',
    ageRange: { min: 24, max: 35 },
    category: 'police_law',
    currentIdentity: 'civilian',
    publicIdentity: '在诊所工作的护士',
    profileSummary: '与刘志鹏有孤儿院旧识关系，工作令她接触到受保密义务约束的病历；愿意帮助真相，但清楚作证可能损害职业。',
    personality: '善良、谨慎、有良知，作重大决定前会反复确认后果。',
    motivation: '在职业保密、证据真实和保护无辜之间找到能承担的选择。',
    relationshipAnchors: ['刘志鹏：孤儿院旧同学与求助者', '诊所医生：掌握其工作与病历权限的人'],
    promptHooks: ['病历记录与法庭证言矛盾', '诊所要求她保持沉默', '一名证人因害怕丢工作准备反口'],
    importance: 80
  },
  {
    id: 'screen_film_unwritten_law_old_kwan',
    displayName: '老关',
    aliases: ['关叔'],
    gender: 'male',
    ageRange: { min: 49, max: 64 },
    category: 'police_law',
    currentIdentity: 'civilian',
    publicIdentity: '熟悉街面查访与法律实务的律师助理',
    profileSummary: '经验来自多年跑法庭、访证人和处理底层委托，懂得年轻律师在书本以外最容易忽略什么。',
    personality: '稳重、世故、热心，习惯先解决实际问题再谈大道理。',
    motivation: '帮助刘志鹏把案件查实，也让无资源的当事人真正有机会被听见。',
    relationshipAnchors: ['刘志鹏：需要实务经验的年轻律师', '刘惠兰：不愿完全开口的被告'],
    promptHooks: ['证人只愿在非正式场合见面', '一条旧街坊线索被警方忽略', '律师楼经费不足以继续调查'],
    importance: 83
  },
  {
    id: 'screen_film_unwritten_law_yim_tak_kong',
    displayName: '严德刚',
    aliases: ['严大状'],
    gender: 'male',
    ageRange: { min: 39, max: 55 },
    category: 'police_law',
    currentIdentity: 'civilian',
    publicIdentity: '经验丰富的控方检察官',
    profileSummary: '熟悉证据规则和法庭节奏，重视控方胜算与程序，也会主动寻找可能令辩方失去资格的法律问题。',
    personality: '严谨、强势、老练，庭上不轻易给对手喘息空间。',
    motivation: '维持控方案件和法庭秩序，确保任何私人关系都不破坏程序。',
    relationshipAnchors: ['刘志鹏：年轻但不容轻视的辩方律师', '警方证人：必须维持证词一致的人'],
    promptHooks: ['辩方与被告可能存在未申报关系', '关键控方证人出现可信度问题', '公众舆论要求尽快定罪'],
    importance: 84
  }
];

const kindredSpirit: ScreenCharacterExpansionWork = {
  id: 'work_tv_kindred_spirit',
  title: '真情',
  titleEn: 'Kindred Spirit',
  medium: 'television',
  availableYears: { from: 1995, to: 1996 }
};

const kindredSpiritCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_tv_kindred_spirit_lee_biu_ping',
    displayName: '李标炳',
    aliases: ['叉烧炳', '炳叔'],
    gender: 'male', ageRange: { min: 48, max: 61 }, category: 'business_finance', currentIdentity: 'civilian',
    publicIdentity: '三多烧腊店老板与李家家长',
    profileSummary: '待人热诚，靠一间街坊烧味店支撑大家庭；既重生意信用，也常被家人之间不断出现的问题拉去调停。',
    personality: '勤劳、热心、爱家、偶尔固执，遇事容易先急后软。',
    motivation: '守住烧腊店和一家人的基本生活，让亲人无论争执多久仍有地方回来。',
    relationshipAnchors: ['梁润善：共同撑家的妻子', '李添福、李添安、李多欣：需要照顾也逐渐独立的下一代', '梁润好：关系紧密的姨仔'],
    promptHooks: ['烧腊店租约突然加价', '家人把私人争执带到店里', '供应商要求以人情换取赊账'], importance: 87
  },
  {
    id: 'screen_tv_kindred_spirit_leung_yun_sin', displayName: '梁润善', aliases: ['善姨', '阿善'],
    gender: 'female', ageRange: { min: 45, max: 58 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '三多烧腊店老板娘与大家庭主心骨',
    profileSummary: '长期为家庭付出，擅长记住每个人的难处；宽厚不等于没有底线，家人失信时也会要求面对后果。',
    personality: '包容、能干、重家庭，忍耐到极限后会明确表态。', motivation: '维持一家人的互助与基本公平，不让任何成员被长期牺牲。',
    relationshipAnchors: ['李标炳：丈夫与生意伙伴', '梁润好：妹妹与长期互相照应的人', '阮文娟：母亲与上一代家庭中心'],
    promptHooks: ['家庭开支出现无法解释的缺口', '亲人婚恋决定引发两代冲突', '店内员工把私人债务带进工作'], importance: 88
  },
  {
    id: 'screen_tv_kindred_spirit_leung_yun_ho', displayName: '梁润好', aliases: ['好姨', '阿好'],
    gender: 'female', ageRange: { min: 38, max: 51 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '梁家成员与亲友圈中热心活跃的中年女性',
    profileSummary: '说话爽快、爱管闲事，却真心愿意替家人跑腿解决问题；感情和自尊问题常令她比别人更冲动。',
    personality: '爽朗、热情、嘴快、重感情，容易先行动后考虑。', motivation: '让自己在家庭与感情中都被认真对待，而非永远只做帮忙的人。',
    relationshipAnchors: ['梁润善：姐姐与最稳固的支持', '阮文娟：母亲', '高山青：会影响其感情与人生选择的人'],
    promptHooks: ['她替亲友出头反而扩大误会', '工作或感情机会要求离开熟悉家庭圈', '旧朋友带来一项不可靠投资'], importance: 84
  },
  {
    id: 'screen_tv_kindred_spirit_yuen_man_kuen', displayName: '阮文娟', aliases: ['阿家', '文娟'],
    gender: 'female', ageRange: { min: 65, max: 79 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '梁家三代同堂家庭的长辈',
    profileSummary: '经历多、记性和主见都强，掌握家族旧事与人情账；爱家却不会轻易原谅曾经抛下责任的人。',
    personality: '精明、强势、念旧、护短，情绪来得直接。', motivation: '维护家中长幼秩序和自己的尊严，不让旧伤再次伤害下一代。',
    relationshipAnchors: ['梁润善、梁润好：女儿', '梁友：留下多年伤痕的丈夫', '容姨：相伴多年的家庭伙伴'],
    promptHooks: ['旧照片或来信触发家族往事', '晚辈隐瞒一项婚姻决定', '旧人回港要求重新进入家庭'], importance: 87
  },
  {
    id: 'screen_tv_kindred_spirit_leung_yau', displayName: '梁友', aliases: ['友叔'],
    gender: 'male', ageRange: { min: 68, max: 82 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '多年离散、与梁家有深厚旧关系的长者',
    profileSummary: '年轻时未能承担家庭责任，年老后仍渴望被亲人接纳；歉意、面子与旧习惯使他很难一次说清全部过去。',
    personality: '念旧、内疚、好面子，遇到指责容易回避但并非毫无感情。', motivation: '修复与家人的关系，为过去失去的责任寻找补偿机会。',
    relationshipAnchors: ['阮文娟：伤害深且难求原谅的妻子', '梁润善、梁润好：需要重新面对的女儿'],
    promptHooks: ['他带着不完整的旧事回港', '家人对是否让他进门意见分裂', '一笔过去债务重新出现'], importance: 82
  },
  {
    id: 'screen_tv_kindred_spirit_aunt_yung', displayName: '容姨', aliases: ['阿容'],
    gender: 'female', ageRange: { min: 67, max: 81 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '在阮家相伴多年的家庭伙伴',
    profileSummary: '熟悉几代人的脾气和秘密，以照顾与忠诚成为家中事实上的亲人；也有自己未被充分看见的晚年选择。',
    personality: '忠厚、温柔、观察细致，面对离别时把自己放在最后。', motivation: '照顾相伴多年的家人，也为自己的晚年保留选择和尊严。',
    relationshipAnchors: ['阮文娟：相伴多年的家人', '梁家晚辈：由小看到大的孩子'],
    promptHooks: ['她收到一个离开香港的邀请', '家中旧物牵出被隐瞒的往事', '健康问题令照顾关系需要倒转'], importance: 80
  },
  {
    id: 'screen_tv_kindred_spirit_lee_tim_fook', displayName: '李添福', aliases: ['添福'],
    gender: 'male', ageRange: { min: 22, max: 34 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '李家年轻一代成员',
    profileSummary: '在大家庭与烧腊店的人情环境中长大，既享受照顾，也必须学习承担工作、感情和经济责任。',
    personality: '随和、重家人、尚在成熟，受压力时会试图拖延决定。', motivation: '建立自己的工作与关系，不再只以家中孩子的身份被安排。',
    relationshipAnchors: ['李标炳、梁润善：父母与生活基础', '李添安、李多欣：手足'],
    promptHooks: ['工作机会与家中生意冲突', '感情决定遭到全家讨论', '朋友请求他替一笔债务担保'], importance: 76
  },
  {
    id: 'screen_tv_kindred_spirit_yu_king', displayName: '余琼', aliases: ['阿琼'],
    gender: 'female', ageRange: { min: 35, max: 50 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '与李梁两家往来密切的中年职业女性',
    profileSummary: '熟悉家庭圈内的复杂人情，能照顾别人，也不会对长期不公平保持沉默。',
    personality: '务实、敏感、重承诺，遇到家庭矛盾会先求和再表态。', motivation: '维护自己在家庭与工作中的尊严，争取可靠而不含糊的关系。',
    relationshipAnchors: ['李梁两家：长期生活与人情联系'],
    promptHooks: ['亲友要求她隐瞒一件事', '工作收入和家庭责任发生冲突', '一段旧关系重新出现'], importance: 74
  },
  {
    id: 'screen_tv_kindred_spirit_kwai_ah_mei', displayName: '归亚美', aliases: ['阿美'],
    gender: 'female', ageRange: { min: 24, max: 37 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '进入李梁两家生活圈的年轻职业女性',
    profileSummary: '有自己的事业与感情判断，不愿因亲友期待放弃边界；在大家庭中既获得支持，也承受公开议论。',
    personality: '独立、直率、重感受，面对误会愿意澄清但不无限迁就。', motivation: '建立由自己选择的工作与家庭生活。',
    relationshipAnchors: ['李梁两家年轻一代：朋友、同事与感情关系网络'],
    promptHooks: ['私人决定很快传遍整个家庭', '职业机会遭到伴侣误解', '她被夹在两名亲友的争执中'], importance: 75
  },
  {
    id: 'screen_tv_kindred_spirit_ko_shan_ching', displayName: '高山青', aliases: ['高校长', '山青'],
    gender: 'male', ageRange: { min: 44, max: 59 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '教育界管理人员与梁家熟人',
    profileSummary: '重礼节、讲原则，处理感情和家庭问题时比在工作中更谨慎；愿意以实际行动证明可靠。',
    personality: '温和、稳重、有耐心，遇到偏见时仍坚持说明立场。', motivation: '以尊重和长期承诺建立关系，同时维持教育工作信誉。',
    relationshipAnchors: ['梁润好：重要感情关系', '梁家长辈：必须取得信任的人'],
    promptHooks: ['学校事务与家庭约定撞期', '长辈误解他的真实动机', '一名学生的家庭问题需要校外协助'], importance: 79
  }
];

const familySquad: ScreenCharacterExpansionWork = {
  id: 'work_tv_family_squad',
  title: '卡拉屋企',
  titleEn: 'Family Squad',
  medium: 'television',
  availableYears: { from: 1991, to: 1996 }
};

const familySquadCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_tv_family_squad_wong_ka_king', displayName: '黄家景', aliases: ['白头佬', '景叔'],
    gender: 'male', ageRange: { min: 55, max: 69 }, category: 'police_law', currentIdentity: 'civilian',
    publicIdentity: '退休警务人员与黄家一家之主',
    profileSummary: '以警队经验和家长权威管理家庭，嘴硬、爱面子，常把日常小事说成纪律问题；真正遇到家人困难仍会出手。',
    personality: '传统、固执、好面子、心软，喜欢用旧经验教育晚辈。', motivation: '维持家庭秩序并证明自己退休后仍是家中可靠人物。',
    relationshipAnchors: ['廖仲好：能让他软化的妻子', '黄蒂、黄菲、黄发：各有主见的子女', '廖通泰：经常斗嘴的晚辈'],
    promptHooks: ['旧警队同僚带来一宗街坊求助', '子女的工作方式挑战他的旧观念', '家庭聚会因一项秘密变成审问'], importance: 84
  },
  {
    id: 'screen_tv_family_squad_liu_chung_ho', displayName: '廖仲好', aliases: ['肥妈', '仲好'],
    gender: 'female', ageRange: { min: 51, max: 65 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '黄家母亲与家庭日常协调者',
    profileSummary: '乐天、顾家，看似不及丈夫精明，却最懂每个孩子的情绪和家庭真正需要怎样转弯。',
    personality: '温厚、开朗、重家人，遇到原则问题会以柔制刚。', motivation: '让家中成员可以争吵却不离心，也让丈夫学会尊重子女选择。',
    relationshipAnchors: ['黄家景：强势但可被她劝动的丈夫', '黄蒂、黄菲、黄发：需要不同方式支持的子女', '廖通泰：亲近的外甥'],
    promptHooks: ['家中经济安排引发争论', '丈夫与子女互不让步', '一件旧秘密令她必须决定是否开口'], importance: 83
  },
  {
    id: 'screen_tv_family_squad_wong_tai', displayName: '黄蒂', aliases: ['阿蒂'],
    gender: 'female', ageRange: { min: 24, max: 34 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '处于晋升阶段的年轻女警',
    profileSummary: '做事爽快、责任感强，经常替家里处理实际问题；警务工作与父亲的旧式管教观念既有共鸣也有冲突。',
    personality: '能干、直率、有正义感，忙起来容易显得急躁。', motivation: '在警队凭能力站稳，也保留由自己决定感情与生活的权利。',
    relationshipAnchors: ['黄家景：同有警务背景但观念不同的父亲', '廖仲好：理解她压力的母亲', '廖通泰：斗嘴不断的表亲'],
    promptHooks: ['工作案件牵涉熟悉街坊', '父亲擅自替她联系旧同僚', '晋升训练与家庭责任冲突'], importance: 86
  },
  {
    id: 'screen_tv_family_squad_wong_fei', displayName: '黄菲', aliases: ['阿菲'],
    gender: 'female', ageRange: { min: 22, max: 32 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '在前线工作的年轻女警',
    profileSummary: '行动直接、生活中偶尔迷糊，愿意帮助街坊；家人既是支持，也是她执勤时最容易越过职业边界的来源。',
    personality: '热心、爽朗、偶尔冒失，遇到不公会立即介入。', motivation: '成为街坊信任的前线警员，并证明自己不是只靠父亲背景。',
    relationshipAnchors: ['黄蒂：会替她收拾局面的姐姐', '黄家景、廖仲好：关心过度的父母', '黄发：常需要她照顾的弟弟'],
    promptHooks: ['熟人要求她私下查资料', '巡逻时撞见家人朋友涉事', '一次冒失举动引发投诉'], importance: 80
  },
  {
    id: 'screen_tv_family_squad_wong_fat', displayName: '黄发', aliases: ['发记', '阿发'],
    gender: 'male', ageRange: { min: 18, max: 25 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '理工科大学生与黄家幼子',
    profileSummary: '在强势父亲和能干姐姐之间长大，羡慕自由粗豪的表哥；知识不少，生活经验仍需磨炼。',
    personality: '聪明、好奇、贪玩、怕麻烦，关键时刻仍顾家。', motivation: '完成学业并找到不被家庭预设的人生方向。',
    relationshipAnchors: ['黄家景：管束严格的父亲', '黄蒂、黄菲：会帮助也会管教他的姐姐', '廖通泰：羡慕的表哥'],
    promptHooks: ['学生项目需要外界资金', '朋友把校园玩笑做成违法边缘行为', '他无意用技术发现一条案件线索'], importance: 74
  },
  {
    id: 'screen_tv_family_squad_liu_tung_tai', displayName: '廖通泰', aliases: ['泰臣', '阿泰'],
    gender: 'male', ageRange: { min: 25, max: 36 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '经营货车运输、与黄家来往密切的年轻人',
    profileSummary: '外表粗豪、不拘小节，靠运输工作熟悉城市道路与各区人情；嘴上爱逞强，真正遇事重朋友和家人。',
    personality: '豪爽、冲动、幽默、重义气，不喜欢被规矩束缚。', motivation: '把运输生意做稳并证明自己有能力照顾重要的人。',
    relationshipAnchors: ['黄蒂：经常斗嘴又彼此在意的表亲', '黄发：把他当榜样的表弟', '黄家景：互相看不顺眼又无法割断的长辈'],
    promptHooks: ['货车替客户运到来历不明的货物', '运输牌照与现金流同时出问题', '黄蒂的案件需要他提供路线经验'], importance: 82
  }
];

const untraceableEvidence: ScreenCharacterExpansionWork = {
  id: 'work_tv_untraceable_evidence',
  title: '鉴证实录',
  titleEn: 'Untraceable Evidence',
  medium: 'television',
  availableYears: { from: 1996, to: 1996 },
  worldpackPlacementAnchor:
    '1996年职业前史落点：角色已在法医、法证、重案组或既有家庭位置工作；剧集中随后发生的案件、恋情、伤亡、晋升与揭露均尚未发生。'
};

const untraceableEvidenceCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_tv_untraceable_evidence_nip_po_yin', displayName: '聂宝言', englishName: 'Pauline Lip', aliases: ['Pauline', '聂医生'],
    gender: 'female', ageRange: { min: 29, max: 39 }, category: 'police_law', currentIdentity: 'civilian',
    publicIdentity: '法医官',
    profileSummary: '以医学和证据替死者说明事实，工作严谨、情绪克制；父亲的拆弹工作经历令她对职业责任有长期执着。',
    personality: '冷静、独立、敏锐、原则性强，不愿让感情干扰专业结论。', motivation: '通过可靠检验还原死因并捍卫司法公正。',
    relationshipAnchors: ['聂宝意：作家与主持人姐姐', '聂津津：需要关心的外甥女', '曾家原、洪丽英：可能协作的重案组人员'],
    promptHooks: ['初步死因与警方假设冲突', '样本污染要求重新建立证据链', '家人无意听见一段保密案情'], importance: 92
  },
  {
    id: 'screen_tv_untraceable_evidence_tsang_ka_yuen', displayName: '曾家原', aliases: ['曾Sir', '大佬原'],
    gender: 'male', ageRange: { min: 31, max: 42 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '重案组督察',
    profileSummary: '有前线经验、重视团队，也愿意让法医和法证意见改变调查方向；私人创伤使他对同伴安全格外敏感。',
    personality: '稳重、果断、有同理心，工作压力大时会把关心变成控制。', motivation: '带领团队以可靠证据破案，并让下属和家人尽量远离伤害。',
    relationshipAnchors: ['洪丽英：上司兼好友', '蔡小棠：年轻下属', '曾家乔：在法证部工作的弟弟', '聂宝言：专业判断值得信任的法医官'],
    promptHooks: ['家属情绪与证据方向冲突', '弟弟可能成为调查关系人', '上级要求在化验完成前采取行动'], importance: 91
  },
  {
    id: 'screen_tv_untraceable_evidence_choy_siu_tong', displayName: '蔡小棠', aliases: ['小棠菜'],
    gender: 'female', ageRange: { min: 23, max: 32 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '重案组年轻探员',
    profileSummary: '行动积极、重视直觉，仍在学习如何把怀疑完整转化为证据；家庭经历让她对弱势证人格外上心。',
    personality: '热心、直率、倔强，受到质疑时会更努力查证。', motivation: '成长为能独立负责案件的探员，不只被当作需要照顾的新人。',
    relationshipAnchors: ['曾家原：上司与职业榜样', '蔡国忠：任大厦管理员的父亲', '曾家乔：工作圈中熟悉的法证人员'],
    promptHooks: ['她的直觉指向证据尚未支持的人', '证人只信任她愿意开口', '父亲工作的屋苑发生案件'], importance: 84
  },
  {
    id: 'screen_tv_untraceable_evidence_nip_chun_chun', displayName: '聂津津', aliases: ['津津'],
    gender: 'female', ageRange: { min: 19, max: 27 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '设计系大学生',
    profileSummary: '年轻、好奇，和母亲沟通不佳，却会主动帮助朋友；容易因感情和好奇进入案件外围。',
    personality: '活泼、冲动、重朋友，自尊心强，讨厌长辈替她决定一切。', motivation: '完成学业并建立不受家庭关系控制的成年生活。',
    relationshipAnchors: ['聂宝意：关系紧张但互相在意的母亲', '聂宝言：理性可靠的姨妈', '曾家乔：法证部年轻技术人员'],
    promptHooks: ['大学朋友牵涉一宗案件', '她在设计工作中看见可疑细节', '母女争执令她暂时离家'], importance: 77
  },
  {
    id: 'screen_tv_untraceable_evidence_tsang_ka_kiu', displayName: '曾家乔', aliases: ['家乔'],
    gender: 'male', ageRange: { min: 23, max: 33 }, category: 'police_law', currentIdentity: 'civilian',
    publicIdentity: '法证部技术员与夜校生',
    profileSummary: '工作认真、专业仍在成长，一边进修一边应付家庭和感情；当自己或朋友卷入调查时会本能地寻找科学证明。',
    personality: '温和、勤奋、敏感，面对怀疑容易紧张但不会轻易放弃。', motivation: '提升专业资格，用可复核的技术证明自己的能力和事实。',
    relationshipAnchors: ['曾家原：重案组工作的兄长', '聂津津：生活圈中的年轻朋友', '蔡小棠：令他在意的警队探员'],
    promptHooks: ['化验结果与经验判断相反', '亲属案件要求他回避', '夜校研究可解释一项罕见物证'], importance: 82
  },
  {
    id: 'screen_tv_untraceable_evidence_hung_lai_ying', displayName: '洪丽英', aliases: ['Madam Sam', 'Sammi'],
    gender: 'female', ageRange: { min: 35, max: 48 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '重案组总督察',
    profileSummary: '负责分配案件、控制风险与对上沟通，既信任曾家原的判断，也会要求团队守住程序和纪律。',
    personality: '沉着、干练、重团队，对下属关心但不纵容越界。', motivation: '让重案组在政治和时限压力下仍以证据推进，并保护团队长期战斗力。',
    relationshipAnchors: ['曾家原：倚重的下属与好友', '聂宝言：可互相校正判断的法医朋友', '蔡小棠：需要培养的年轻探员'],
    promptHooks: ['上级要求快速结案', '不同专家对关键证据意见相反', '一名探员与案件关系人过于接近'], importance: 87
  }
];

export const hkScreenCharacterSocietyExpansion = [
  ...buildScreenCharacterExpansion(unwrittenLaw, unwrittenLawCharacters),
  ...buildScreenCharacterExpansion(kindredSpirit, kindredSpiritCharacters),
  ...buildScreenCharacterExpansion(familySquad, familySquadCharacters),
  ...buildScreenCharacterExpansion(untraceableEvidence, untraceableEvidenceCharacters)
];
