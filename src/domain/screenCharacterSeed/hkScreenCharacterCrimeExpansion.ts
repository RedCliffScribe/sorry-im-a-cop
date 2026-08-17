import {
  buildScreenCharacterExpansion,
  type ScreenCharacterExpansionDraft,
  type ScreenCharacterExpansionWork
} from './screenCharacterSeedExpansionFactory';

const election: ScreenCharacterExpansionWork = {
  id: 'work_film_election',
  title: '黑社会',
  titleEn: 'Election',
  medium: 'film',
  availableYears: { from: 1994, to: 1996 },
  worldpackPlacementAnchor:
    '九十年代中期前史落点：众人已在和联胜各自位置活动，但后来围绕话事人、龙头棍和接班安排发生的选举、结盟、背叛、伤亡与结局一概尚未发生。'
};

const electionCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_election_lam_lok',
    displayName: '林怀乐',
    aliases: ['乐少', '乐哥', '阿乐', 'Lok'],
    gender: 'male',
    ageRange: { min: 38, max: 48 },
    category: 'triad_crime',
    currentIdentity: 'gang_member',
    publicIdentity: '和联胜地区领导人物，经营人脉与生意',
    profileSummary: '外表平和克制，善于用照顾、人情与长远安排凝聚支持；真正重要的决定很少当众表露。',
    personality: '沉着、耐心、擅长布局，重视秩序也有强烈上位意志。',
    motivation: '扩大自己在社团内外的可信度与控制力，同时保持一个讲道理的公开形象。',
    relationshipAnchors: ['邓伯：必须尊重的叔父辈', '大D：路线和资源上的强劲对手', '吉米仔：值得观察的年轻生意人'],
    promptHooks: ['一次地区利益协调需要他出面', '有人借他的名义越界办事', '警方调查与社团内部人情同时逼近'],
    importance: 95
  },
  {
    id: 'screen_film_election_big_d',
    displayName: '雷超',
    aliases: ['大D', 'Big D'],
    gender: 'male',
    ageRange: { min: 36, max: 47 },
    category: 'triad_crime',
    currentIdentity: 'gang_member',
    publicIdentity: '和联胜荃湾地区实力人物',
    profileSummary: '财力、手下和街面声势都很突出，不耐烦由旧规矩决定自己的上限，习惯用直接压力换取明确结果。',
    personality: '强势、急躁、自尊极高，讲义气时慷慨，受轻视时反应猛烈。',
    speechStyle: '声量和态度都很直接，喜欢把价码、立场和后果摊开说。',
    motivation: '让资源与实力得到与之相称的位置，不肯长期接受叔父辈的含糊安排。',
    relationshipAnchors: ['乐少：不能忽视的竞争者', '邓伯：旧秩序的代表', '和联胜地区领导：争取或压服的对象'],
    promptHooks: ['荃湾生意遭人插手', '手下把小摩擦升级成地盘问题', '一项合作要求他暂时压住脾气'],
    importance: 96
  },
  {
    id: 'screen_film_election_jimmy_lee',
    displayName: '李家源',
    englishName: 'Jimmy Lee',
    aliases: ['吉米仔', '占米', 'Jimmy'],
    gender: 'male',
    ageRange: { min: 25, max: 34 },
    category: 'business_finance',
    currentIdentity: 'gang_member',
    publicIdentity: '经营正当生意的和联胜年轻成员',
    actualIdentitySummary: '社团背景仍是现实约束，但更愿意用账目、合约和经营能力解决问题。',
    profileSummary: '头脑清醒、数字敏感，把社团关系视为保护也是负担；想建立不依靠街面暴力也能站稳的事业。',
    personality: '务实、克制、学习快，表面顺从但对长期方向有自己的盘算。',
    motivation: '把生意做大并降低自己对社团暴力的依赖，同时保护已有伙伴与利益。',
    values: '效率、可持续收益、信用、选择权与有限的人情责任。',
    relationshipAnchors: ['乐少：欣赏其能力的社团前辈', '大D：可能提供资源也可能制造风险', '师爷苏：可合作处理账目和手续'],
    promptHooks: ['一笔投资被要求掺入街面利益', '牌照或租约遭到人为阻碍', '旧朋友求他用社团身份解决商业纠纷'],
    importance: 94
  },
  {
    id: 'screen_film_election_teng_wai',
    displayName: '邓威',
    aliases: ['邓伯', 'Uncle Teng'],
    gender: 'male',
    ageRange: { min: 62, max: 76 },
    category: 'triad_crime',
    currentIdentity: 'gang_member',
    publicIdentity: '和联胜资深叔父辈与秩序协调者',
    profileSummary: '代表社团传统程序与长辈权威，重视整体延续多于任何一名地区人物的个人野心。',
    personality: '老练、冷静、重规矩，善于以历史、人情和集体利益压住争端。',
    motivation: '维持社团内部可控的权力轮替，避免个人势力破坏整体秩序。',
    relationshipAnchors: ['乐少：可被培养也须被约束的后辈', '大D：实力强但破坏性高的后辈', '串爆、龙根：共同处理内部事务的叔父辈'],
    promptHooks: ['地区争执需要叔父辈仲裁', '年轻一代公开质疑旧规矩', '警方压力迫使多个堂口暂时协调'],
    importance: 92
  },
  {
    id: 'screen_film_election_airplane',
    displayName: '飞机',
    aliases: ['Airplane'],
    gender: 'male',
    ageRange: { min: 25, max: 36 },
    category: 'triad_crime',
    currentIdentity: 'gang_member',
    publicIdentity: '以行动力和忠诚见称的和联胜成员',
    profileSummary: '不擅长复杂政治，却把承诺和执行看得极重；一旦认定命令，常把自己置于高风险。',
    personality: '沉默、坚硬、服从性强，对羞辱和背叛反应直接。',
    motivation: '用可靠行动证明自己的价值，并获得值得效忠的位置。',
    relationshipAnchors: ['社团上级：命令来源也是忠诚考验', '大头：同属重行动的街面人物'],
    promptHooks: ['一项命令与个人判断冲突', '行动目标临时改变', '有人试图利用他的忠诚制造替罪羊'],
    importance: 85
  },
  {
    id: 'screen_film_election_so_sze_pui',
    displayName: '师爷苏',
    aliases: ['So', '师爷'],
    gender: 'male',
    ageRange: { min: 30, max: 43 },
    category: 'triad_crime',
    currentIdentity: 'gang_member',
    publicIdentity: '熟悉账目、手续与谈判的和联胜成员',
    profileSummary: '口吃不妨碍他观察局势、处理数字与法律边缘问题；比起逞强，更依靠准备和专业价值立足。',
    personality: '谨慎、精明、知进退，压力下仍会努力把话说清楚。',
    speechStyle: '有口吃，句子会停顿重启，但观点通常具体、务实而准确。',
    motivation: '凭不可替代的脑力和办事能力在危险环境中保持位置。',
    relationshipAnchors: ['吉米仔：商业与手续上容易合作', '社团地区人物：需要其处理账目的人'],
    promptHooks: ['账目中出现无法解释的缺口', '一份文件同时牵涉警方与社团', '谈判双方都想让他承担责任'],
    importance: 86
  },
  {
    id: 'screen_film_election_tung_kwun',
    displayName: '东莞仔',
    aliases: ['东莞', 'Tung Kwun'],
    gender: 'male',
    ageRange: { min: 25, max: 36 },
    category: 'triad_crime',
    currentIdentity: 'gang_member',
    publicIdentity: '作风凶狠、野心外露的和联胜年轻成员',
    profileSummary: '行动积极、争胜心强，既想得到大人物赏识，也随时评估哪一边更能给自己未来。',
    personality: '好胜、机警、敢冒险，忠诚常与个人前途绑定。',
    motivation: '从执行者升到能独自掌握人手和地区利益的位置。',
    relationshipAnchors: ['地区领导人物：争取提拔的对象', '飞机：行动能力上的比较对象'],
    promptHooks: ['一次办事机会可能带来跃升', '两个上级给出互相矛盾的命令', '街面胜负令他必须选择克制或出位'],
    importance: 87
  },
  {
    id: 'screen_film_election_big_head',
    displayName: '大头',
    aliases: ['Big Head'],
    gender: 'male',
    ageRange: { min: 31, max: 45 },
    category: 'triad_crime',
    currentIdentity: 'gang_member',
    publicIdentity: '守旧、重承诺的和联胜成员',
    profileSummary: '相信入会誓言和旧式义气，愿意吃亏守诺；这种坚持既赢得信任，也容易被更精于算计的人利用。',
    personality: '朴直、坚忍、固执，面对利益诱惑仍先考虑承诺。',
    motivation: '守住自己认定的规矩，不让多年付出变得毫无意义。',
    relationshipAnchors: ['叔父辈：旧规矩的解释者', '飞机：同样重行动和忠诚的后辈'],
    promptHooks: ['旧承诺与新命令冲突', '家人生活迫使他重新看待牺牲', '有人拿社团规矩包装私人利益'],
    importance: 83
  },
  {
    id: 'screen_film_election_tsui_tin',
    displayName: '徐天',
    aliases: ['串爆', 'Brother Tsui'],
    gender: 'male',
    ageRange: { min: 52, max: 66 },
    category: 'triad_crime',
    currentIdentity: 'gang_member',
    publicIdentity: '和联胜叔父辈与内部意见人物',
    profileSummary: '资历深、讲话直，常用夸张说法表达对社团格局的野心与不满，也懂得在关键时刻计算多数。',
    personality: '外放、现实、好面子，既讲辈分也会顺势调整立场。',
    motivation: '确保自己和所支持的一系在下一轮资源分配中不被边缘化。',
    relationshipAnchors: ['邓伯：既合作也争论的叔父辈', '龙根：内部事务上的旧相识'],
    promptHooks: ['叔父辈会议出现意见分裂', '他支持的地区人物犯下错误', '一项看似宏大的计划缺少现实资源'],
    importance: 82
  },
  {
    id: 'screen_film_election_dragon_root',
    displayName: '龙根',
    aliases: ['龙根叔', 'Long Gun'],
    gender: 'male',
    ageRange: { min: 50, max: 66 },
    category: 'triad_crime',
    currentIdentity: 'gang_member',
    publicIdentity: '和联胜叔父辈与地区利益中间人',
    profileSummary: '熟悉旧关系和地盘人情，处理问题首先考虑自己一系能否保住利益与安全。',
    personality: '圆滑、现实、顾忌多，压力来时倾向寻找可退的路。',
    motivation: '保住多年经营的人脉、面子和地区收益，不成为权力冲突的牺牲品。',
    relationshipAnchors: ['邓伯、串爆：社团叔父辈同侪', '地区领导人物：需要其表态支持的后辈'],
    promptHooks: ['旧地盘收入突然下降', '两个后辈都要求他公开站队', '警方盯上与他有关的中间人'],
    importance: 80
  }
];

const infernalAffairsTwo: ScreenCharacterExpansionWork = {
  id: 'work_film_infernal_affairs_ii',
  title: '无间道Ⅱ',
  titleEn: 'Infernal Affairs II',
  medium: 'film',
  availableYears: { from: 1991, to: 1996 },
  worldpackPlacementAnchor:
    '以1991年起的角色身份作为世界落点；只能使用当前游戏日期已经成立的警队、卧底和倪家关系，1997年以后及原作后段的结局、死亡、揭露与身份变化均未发生。'
};

const infernalAffairsTwoCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_infernal_affairs_ii_chan_wing_yan',
    displayName: '陈永仁',
    englishName: 'Chan Wing-yan',
    aliases: ['阿仁', 'Yan'],
    gender: 'male', ageRange: { min: 18, max: 26 }, category: 'police_law', currentIdentity: 'civilian',
    publicIdentity: '与警队保持秘密联系的年轻人',
    actualIdentitySummary: '受警队秘密任务约束，真实职责与公开生活严格分离。',
    profileSummary: '出身关系复杂，观察力和耐压能力突出；公开身份越不稳定，越依赖少数知情者维持自我。',
    personality: '敏锐、倔强、克制，内心重是非却不得不长期隐藏。',
    motivation: '完成被交付的秘密任务，并守住自己仍是警察的内在认同。',
    relationshipAnchors: ['黄志诚：少数知情的联络上级', '刘健明：训练阶段的同龄人', '倪永孝：无法回避的家族关系'],
    promptHooks: ['秘密联络窗口突然缩短', '公开身份要求他做出违背本意的事', '家族线索与警方目标重叠'], importance: 97
  },
  {
    id: 'screen_film_infernal_affairs_ii_lau_kin_ming',
    displayName: '刘健明', englishName: 'Lau Kin-ming', aliases: ['阿明', 'Ming'],
    gender: 'male', ageRange: { min: 18, max: 27 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '表现出色、上进心强的年轻警员',
    actualIdentitySummary: '警队公开身份之外另受韩琛一方秘密关系牵引。',
    profileSummary: '学习快、懂得呈现最合适的一面，渴望体面稳定的前途；秘密关系让每次升迁都带着更大风险。',
    personality: '聪明、自律、善于适应，野心与恐惧都藏在得体表现后。',
    motivation: '获得真正属于自己的安全身份和上升空间，不再受任何一方随意摆布。',
    relationshipAnchors: ['韩琛：掌握其秘密来源的人', 'Mary：影响其早期选择的人', '陈永仁：同龄却走向另一条暗线的人'],
    promptHooks: ['警队内部调查靠近他的秘密', '韩琛要求他提供越界信息', '一次立功机会与秘密任务冲突'], importance: 97
  },
  {
    id: 'screen_film_infernal_affairs_ii_wong_chi_shing',
    displayName: '黄志诚', englishName: 'Wong Chi-shing', aliases: ['黄Sir', 'Wong Sir'],
    gender: 'male', ageRange: { min: 34, max: 46 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '负责有组织罪案调查的警务人员',
    profileSummary: '敢用高风险手段处理社团渗透，重视结果，也清楚秘密行动会怎样消耗执行者。',
    personality: '强硬、急切、有责任感，面对制度限制时会选择灰色办法。',
    motivation: '削弱大型犯罪家族，同时保住仍在暗线中的警务人员。',
    relationshipAnchors: ['陈永仁：必须保护又不得公开承认的暗线', '陆启昌：可互相制衡的警队同僚', '韩琛：长期调查对象'],
    promptHooks: ['暗线失联但不能公开搜索', '上级要求交代情报来源', '一次抓捕可能牺牲长期部署'], importance: 94
  },
  {
    id: 'screen_film_infernal_affairs_ii_hon_sam',
    displayName: '韩琛', englishName: 'Hon Sam', aliases: ['琛哥', 'Sam'],
    gender: 'male', ageRange: { min: 34, max: 48 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '在尖沙咀经营势力与生意的社团人物',
    profileSummary: '表面爱笑、善于交际，实际上重视情报、忠诚和长线部署，能够把人情变成控制关系。',
    personality: '圆滑、耐心、记仇，危险判断比外表更冷。',
    motivation: '摆脱受制于人的位置，建立由自己掌握情报和人手的势力。',
    relationshipAnchors: ['Mary：伴侣与最重要的谋划同盟', '刘健明：秘密投入警队的年轻棋子', '倪家：合作、服从与独立之间的核心压力'],
    promptHooks: ['一名外围成员疑似泄密', '倪家要求交出更多账目', '警方行动迫使他测试身边人的忠诚'], importance: 96
  },
  {
    id: 'screen_film_infernal_affairs_ii_mary',
    displayName: 'Mary', aliases: ['琛嫂'],
    gender: 'female', ageRange: { min: 28, max: 39 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '韩琛的伴侣与社交事务协助者',
    actualIdentitySummary: '不仅处理家庭与社交，也会独立判断并推动关乎韩琛势力的秘密安排。',
    profileSummary: '外表从容，行动果断；对韩琛有强烈保护欲，愿意承担他未必知情的风险。',
    personality: '冷静、决断、忠诚，善于在公开场合隐藏真正立场。',
    motivation: '确保韩琛不再任人安排，并为两人的未来提前清除威胁。',
    relationshipAnchors: ['韩琛：伴侣与行动核心', '刘健明：可被培养和调度的年轻人', '倪家：必须谨慎应对的上层势力'],
    promptHooks: ['一项秘密安排出现目击者', '韩琛的判断与她的保护计划相反', '年轻执行者开始要求更多回报'], importance: 93
  },
  {
    id: 'screen_film_infernal_affairs_ii_ngai_wing_hau',
    displayName: '倪永孝', englishName: 'Ngai Wing-hau', aliases: ['永孝', '阿孝'],
    gender: 'male', ageRange: { min: 30, max: 41 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '倪家负责协调家族事务与生意的人',
    profileSummary: '受过良好教育，举止温和精确；把家族秩序、账目和威信看得极重，面对背叛时尤其冷酷。',
    personality: '沉着、缜密、自控力强，对家人温和，对威胁毫不含糊。',
    motivation: '维持倪家对各方势力的控制，并让家人免受街面生意反噬。',
    relationshipAnchors: ['倪坤：父亲与家族权威来源', '陈永仁：复杂而不能公开处理的家族成员', '韩琛：能力突出但必须受控的下属势力'],
    promptHooks: ['一方地区势力拖欠账目', '家人无意接近警方调查', '温和谈判背后需要准备强硬后手'], importance: 96
  },
  {
    id: 'screen_film_infernal_affairs_ii_luk_kai_cheung',
    displayName: '陆启昌', englishName: 'Luk Kai-cheung', aliases: ['陆Sir', 'Luk Sir'],
    gender: 'male', ageRange: { min: 38, max: 50 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '经验丰富的警队调查人员',
    profileSummary: '熟悉社团权力与警队程序，较黄志诚更重稳定和证据链，也不低估对手的人情网络。',
    personality: '稳健、务实、善于观察，面对激进方案会先问代价。',
    motivation: '在不摧毁案件可信度的前提下持续削弱大型犯罪网络。',
    relationshipAnchors: ['黄志诚：方法不同但目标相近的同僚', '倪家：重点调查网络'],
    promptHooks: ['证据不足却出现行动压力', '同僚隐瞒了一名线人的身份', '一次跨区调查触碰高层关系'], importance: 89
  },
  {
    id: 'screen_film_infernal_affairs_ii_ngai_kwun',
    displayName: '倪坤', englishName: 'Ngai Kwun', aliases: ['坤哥'],
    gender: 'male', ageRange: { min: 52, max: 66 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '控制多个地区头目的倪家掌权者',
    profileSummary: '依靠长期威信、利益分配与家族网络维持秩序，是多方势力既依附又等待机会摆脱的中心。',
    personality: '老练、威严、重控制，习惯让下属自己理解未说完的意思。',
    motivation: '维持倪家对地区势力的统合，并安排家族能够长期延续。',
    relationshipAnchors: ['倪永孝：最能承担家族事务的儿子', '韩琛等地区人物：需持续约束的力量'],
    promptHooks: ['地区人物要求重新分配利益', '警方针对家族账目的调查升温', '内部有人误判他的沉默为软弱'],
    availableYears: { to: 1991 }, importance: 91
  }
];

const trivisa: ScreenCharacterExpansionWork = {
  id: 'work_film_trivisa', title: '树大招风', titleEn: 'Trivisa', medium: 'film',
  availableYears: { from: 1995, to: 1996 },
  worldpackPlacementAnchor: '九十年代中期前史落点：三人各自在自己的犯罪路径上活动，后来关于合作、转型、失败或结局的事件与传闻均未发生。'
};

const trivisaCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_trivisa_cheuk_tze_keung', displayName: '卓子强', aliases: ['卓老板'],
    gender: 'male', ageRange: { min: 34, max: 46 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '以大胆绑架计划和高额目标见称的犯罪策划者',
    profileSummary: '胆大、自信，擅长把极端风险包装成可执行生意；享受声势，也会认真计算人质与退路。',
    personality: '张扬、果断、冒险欲强，越受关注越想做出更大手笔。', motivation: '策划足以改变身价与江湖位置的大案。',
    relationshipAnchors: ['叶国欢、季正雄：仅有江湖传闻层面的同代人物，不得默认已经合作'],
    promptHooks: ['富商行程资料流入黑市', '一名旧同伙要求加入新计划', '高调作风引来警方专案组'], importance: 91
  },
  {
    id: 'screen_film_trivisa_yip_kwok_foon', displayName: '叶国欢', aliases: ['欢哥'],
    gender: 'male', ageRange: { min: 34, max: 47 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '拥有武装抢劫经验、正寻找新财路的犯罪人物',
    profileSummary: '行动派出身，对旧式大案的回报与风险都有清醒认识；试图转向更稳定生意时仍带着强硬作风。',
    personality: '务实、好胜、暴烈中带焦虑，不愿承认时代与环境已改变。', motivation: '找到比不断持械犯案更可持续、又不失身份的获利方式。',
    relationshipAnchors: ['卓子强、季正雄：只闻其名的同代人物，不得自动写成团队'],
    promptHooks: ['走私生意被中间人压价', '旧部只相信武力解决', '警方把一宗新案与他过去的手法联系起来'], importance: 90
  },
  {
    id: 'screen_film_trivisa_kwai_ching_hung', displayName: '季正雄', aliases: ['阿雄'],
    gender: 'male', ageRange: { min: 35, max: 48 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '长期隐匿、作风低调的械劫行动者',
    profileSummary: '谨慎、多疑，宁愿独自做细致准备，也不愿让名声破坏安全；对团队纪律和退路要求极高。',
    personality: '沉默、精确、戒备心强，厌恶不必要的曝光。', motivation: '在不被识破身份的前提下完成少数高把握目标。',
    relationshipAnchors: ['卓子强、叶国欢：只存在江湖传闻联系，不得默认相识或合作'],
    promptHooks: ['伪装身份被一名旧识认出', '行动成员不按预定纪律办事', '目标现场出现计划外的警力'], importance: 90
  }
];

const centuryOfDragon: ScreenCharacterExpansionWork = {
  id: 'work_film_century_of_dragon', title: '龙在江湖', titleEn: 'A True Mob Story', medium: 'film',
  availableYears: { from: 1995, to: 1996 },
  worldpackPlacementAnchor: '九十年代中期前史落点：使用众人既有职业、亲属与街面关系，但原作中的后续冲突、死亡、案件结果和感情结局尚未发生。'
};

const centuryOfDragonCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_century_dragon_wai_cheung', displayName: '韦吉祥', aliases: ['祥仔', '阿祥'],
    gender: 'male', ageRange: { min: 29, max: 39 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '带着儿子生活的社团基层头目',
    profileSummary: '街面经历丰富，却越来越清楚暴力生活会伤及家人；在责任、尊严和退出成本之间反复拉扯。',
    personality: '重情、冲动、讲义气，成为父亲后更懂得克制。', motivation: '保护儿子并寻找不再被社团冲突拖着走的生活。',
    relationshipAnchors: ['Ruby：旧情与现实牵挂', '大洪：必须保护的儿子', '太子、丧波：街面压力来源'],
    promptHooks: ['儿子在学校因父亲身份受牵连', '旧兄弟要求他重新出头', '一次法律援助带来退出机会'], importance: 90
  },
  {
    id: 'screen_film_century_dragon_ruby', displayName: 'Ruby',
    gender: 'female', ageRange: { min: 25, max: 36 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '熟悉夜场生活、与韦吉祥关系复杂的女性',
    profileSummary: '懂得街面关系的危险，也保留对稳定感情与生活的期待；不会无条件替任何男人承担后果。',
    personality: '直率、敏感、有韧性，关心人但不愿被当成附属。', motivation: '争取一段有尊重和实际安全感的关系。',
    relationshipAnchors: ['韦吉祥：旧情与未解决的责任', '大洪：令她重新评估未来的孩子'],
    promptHooks: ['夜场旧识带来麻烦', '韦吉祥再次隐瞒危险', '她得到离开现有生活圈的工作机会'], importance: 82
  },
  {
    id: 'screen_film_century_dragon_sandy', displayName: 'Sandy',
    gender: 'female', ageRange: { min: 26, max: 37 }, category: 'police_law', currentIdentity: 'civilian',
    publicIdentity: '处理刑事与家庭事务的年轻律师',
    profileSummary: '专业、独立，愿意看见当事人犯罪标签之外的责任与改变，但不会忽略证据和现实风险。',
    personality: '理性、善良、有边界，面对威胁时比外表更坚定。', motivation: '让法律帮助真正愿意承担后果的人，而不是替权势包装借口。',
    relationshipAnchors: ['韦吉祥：可能接受法律协助的当事人', '大洪：家庭安全评估中的关键孩子'],
    promptHooks: ['当事人隐瞒社团关系', '证人因恐吓准备反口', '法律方案与街面和解互相冲突'], importance: 84
  },
  {
    id: 'screen_film_century_dragon_prince', displayName: '太子', aliases: ['Prince'],
    gender: 'male', ageRange: { min: 28, max: 40 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '社团中地位较高、重面子的实力人物',
    profileSummary: '习惯以身份和威慑让人服从，把公开挑战视为必须回应的地位问题。',
    personality: '骄横、好胜、占有欲强，对失控尤其敏感。', motivation: '维持自己在街面和社团内部不容挑战的权威。',
    relationshipAnchors: ['韦吉祥：可用也可能不服管束的基层人物', '丧波：可制造压力的凶狠执行者'],
    promptHooks: ['场子里发生公开冲突', '手下借他的名号谋私', '警方盯上与其有关的夜场账目'], importance: 86
  },
  {
    id: 'screen_film_century_dragon_sang_bo', displayName: '丧波', aliases: ['阿波'],
    gender: 'male', ageRange: { min: 28, max: 41 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '以凶狠和报复心见称的街面人物',
    profileSummary: '把恐惧当作最直接的管理工具，容易把私人怨恨扩大成社团冲突。',
    personality: '暴躁、记仇、残忍，缺乏长期克制。', motivation: '让所有人害怕冒犯自己，并借冲突扩大个人声势。',
    relationshipAnchors: ['太子：可依附的上层人物', '韦吉祥：旧怨或权力摩擦对象'],
    promptHooks: ['一次小冲突被他蓄意升级', '上级要求他暂时收手', '受害者开始与警方合作'], importance: 83
  }
];

const cityOnFire: ScreenCharacterExpansionWork = {
  id: 'work_film_city_on_fire', title: '龙虎风云', titleEn: 'City on Fire', medium: 'film',
  availableYears: { from: 1987, to: 1996 }
};

const cityOnFireCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_city_on_fire_ko_chow', displayName: '高秋', aliases: ['阿秋', 'Ko Chow'],
    gender: 'male', ageRange: { min: 27, max: 38 }, category: 'police_law', currentIdentity: 'civilian',
    publicIdentity: '在珠宝械劫集团附近活动的边缘人物', actualIdentitySummary: '由刘定光掌握的警方卧底，公开身份不得被普通角色自动识破。',
    profileSummary: '长期卧底令他对命令、义气和自我身份都产生疲惫；能快速读懂街面危险，却不愿再把所有关系当工具。',
    personality: '机警、重情、厌倦欺骗，压力下仍会保护无辜与伙伴。', motivation: '完成任务并安全抽身，不让自己彻底变成所扮演的人。',
    relationshipAnchors: ['刘定光：掌握任务的警队上级', '阿虎：逐渐建立信任的劫匪', '阿红：被卧底生活拖累的伴侣'],
    promptHooks: ['上级要求延长卧底任务', '集团即将进行高风险行动', '阿红要求他对未来给出明确答案'], importance: 95
  },
  {
    id: 'screen_film_city_on_fire_fo', displayName: '阿虎', aliases: ['虎哥', 'Tiger'],
    gender: 'male', ageRange: { min: 30, max: 43 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '珠宝械劫集团的核心行动者',
    profileSummary: '作风强硬却重视并肩经历建立的信任；比起抽象规矩，更相信危急时谁肯站在身边。',
    personality: '勇猛、多疑、重义气，一旦信任便愿意承担风险。', motivation: '带同伴完成一票足以改变处境的行动，并确保团队不被出卖。',
    relationshipAnchors: ['高秋：逐渐信任的新伙伴', '南哥：集团上层与行动压力来源'],
    promptHooks: ['团队内出现疑似内鬼', '行动计划过于仓促', '高秋的过去出现矛盾'], importance: 92
  },
  {
    id: 'screen_film_city_on_fire_lau_ting_kwong', displayName: '刘定光', aliases: ['刘Sir'],
    gender: 'male', ageRange: { min: 40, max: 54 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '负责卧底与械劫调查的警队上级',
    profileSummary: '相信长期部署能换来更完整的案件成果，但也容易把卧底的个人代价视为职责的一部分。',
    personality: '坚决、老练、目标导向，对情绪诉求缺少耐心。', motivation: '利用卧底情报瓦解整支械劫集团，而不只抓到外围人物。',
    relationshipAnchors: ['高秋：关键卧底与最危险的责任', '陈庄信：方法和判断存在冲突的同僚'],
    promptHooks: ['卧底要求退出', '另一警队单位准备提前收网', '情报真实性遭上级质疑'], importance: 88
  },
  {
    id: 'screen_film_city_on_fire_hung', displayName: '阿红', aliases: ['Hung'],
    gender: 'female', ageRange: { min: 24, max: 35 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '高秋的伴侣',
    profileSummary: '只看到高秋不断失约和陷入危险，既担心他，也拒绝让无法解释的工作吞掉自己的生活。',
    personality: '坦率、重感情、有底线，长期失望后会主动做决定。', motivation: '得到诚实、稳定和可兑现的共同未来。',
    relationshipAnchors: ['高秋：无法公开全部真相的伴侣'],
    promptHooks: ['重要约定再次被任务打断', '她从新闻认出高秋出现的地点', '新的生活机会要求她立即选择'], importance: 78
  },
  {
    id: 'screen_film_city_on_fire_john_chan', displayName: '陈庄信', englishName: 'John Chan', aliases: ['John', '陈Sir'],
    gender: 'male', ageRange: { min: 30, max: 43 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '参与珠宝械劫调查的警务人员',
    profileSummary: '重视行动控制和自身判断，对不透明的卧底部署缺乏信任，容易与负责上级发生方法冲突。',
    personality: '进取、强硬、自信，对被排除在情报之外格外敏感。', motivation: '以自己能控制的证据和行动解决案件并证明判断。',
    relationshipAnchors: ['刘定光：部署理念不同的上级或同僚', '高秋：身份信息不完整的调查对象'],
    promptHooks: ['跟踪行动可能撞破卧底身份', '两个单位争夺案件主导权', '一份报告隐去了关键线人'], importance: 80
  },
  {
    id: 'screen_film_city_on_fire_nam', displayName: '南哥', aliases: ['Brother Nam'],
    gender: 'male', ageRange: { min: 38, max: 52 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '组织珠宝械劫与销赃网络的人物',
    profileSummary: '以利益和纪律管理行动团队，最关心计划能否完成以及谁可能令整条链条暴露。',
    personality: '冷静、多疑、现实，必要时会迅速切断风险人物。', motivation: '完成高额行动并保持组织者与销赃渠道不被追查。',
    relationshipAnchors: ['阿虎：可靠但有个人判断的行动骨干', '高秋：仍待测试的新成员'],
    promptHooks: ['销赃渠道临时加价', '成员被警方盘问后失联', '行动日期因货物消息被迫提前'], importance: 84
  }
];

const toBeNumberOne: ScreenCharacterExpansionWork = {
  id: 'work_film_to_be_number_one', title: '跛豪', titleEn: 'To Be Number One', medium: 'film',
  availableYears: { from: 1991, to: 1996 }
};

const toBeNumberOneCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_to_be_number_one_ng_sik_ho', displayName: '吴国豪', aliases: ['豪哥', '跛豪', 'Ho'],
    gender: 'male', ageRange: { min: 32, max: 50 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '由基层闯出势力的江湖大佬',
    profileSummary: '从贫困与排斥中夺得位置，重兄弟也极重权威；成功越大，越难容忍任何轻视和失控。',
    personality: '强悍、豪爽、多疑、报复心重，情义与占有欲常纠缠。', motivation: '保住来之不易的势力与尊严，让家人和追随者不再受人欺压。',
    relationshipAnchors: ['大威：早年追随的兄弟', '谢婉英：家庭与私人生活核心', '金牙炳：街面权力摩擦对象'],
    promptHooks: ['旧兄弟质疑利益分配', '警方与廉署同时调查一条生意链', '家庭安全要求他收缩高风险业务'], importance: 95
  },
  {
    id: 'screen_film_to_be_number_one_tai_wai', displayName: '大威', aliases: ['Wai'],
    gender: 'male', ageRange: { min: 30, max: 47 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '吴国豪身边资深兄弟与行动骨干',
    profileSummary: '共同吃苦建立的忠诚很深，也因此对后来资源和信任变化格外敏感。',
    personality: '勇悍、直率、重旧情，积怨时不善隐藏。', motivation: '让多年跟随得到公平回报，并保住自己在兄弟中的位置。',
    relationshipAnchors: ['吴国豪：大哥、兄弟与利益中心'],
    promptHooks: ['一次分账被认为不公', '家人劝他退出高风险行动', '新人获得大哥更多信任'], importance: 84
  },
  {
    id: 'screen_film_to_be_number_one_tse_yuen_ying', displayName: '谢婉英', aliases: ['婉英'],
    gender: 'female', ageRange: { min: 27, max: 44 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '吴国豪的妻子与家庭支柱',
    profileSummary: '理解丈夫早年艰难，也看见权势如何持续吞噬家庭安全；在感情、孩子和现实危险之间维持家。',
    personality: '坚韧、务实、重家庭，面对丈夫失控时敢于直言。', motivation: '保护家庭不被街面生意和权力斗争彻底摧毁。',
    relationshipAnchors: ['吴国豪：爱与恐惧并存的丈夫', '家人：必须优先保护的人'],
    promptHooks: ['家庭成员被人跟踪', '丈夫隐瞒一项重大风险', '她准备安排家人暂时离港'], importance: 82
  },
  {
    id: 'screen_film_to_be_number_one_gold_tooth_bing', displayName: '金牙炳', aliases: ['炳哥'],
    gender: 'male', ageRange: { min: 36, max: 52 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '掌握街面渠道与地盘利益的社团人物',
    profileSummary: '依靠资历和既有渠道守住利益，对突然崛起的新势力充满戒心。',
    personality: '精明、傲慢、重地盘，习惯先压价再谈合作。', motivation: '阻止后来者侵蚀自己的渠道与威望。',
    relationshipAnchors: ['吴国豪：快速崛起的竞争力量'],
    promptHooks: ['双方货源与地盘发生重叠', '中间人同时向两边承诺', '警方扫荡令旧平衡松动'], importance: 80
  }
];

const leeRock: ScreenCharacterExpansionWork = {
  id: 'work_film_lee_rock', title: '五亿探长雷洛传', titleEn: 'Lee Rock', medium: 'film',
  availableYears: { from: 1991, to: 1996 }
};

const leeRockCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_lee_rock_lee_rock', displayName: '雷洛', englishName: 'Lee Rock', aliases: ['洛哥', '雷探长'],
    gender: 'male', ageRange: { min: 32, max: 55 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '在警界与街面关系中极有影响力的探长',
    actualIdentitySummary: '公开警务权力与灰色利益网络互相支撑，必须按当前游戏年份确定其具体位置。',
    profileSummary: '出身基层，善于读人、整合关系并建立规则；把秩序、利益和个人上升绑在同一套网络里。',
    personality: '精明、果断、能屈能伸，成功后控制欲与自信更强。', motivation: '维持由自己主导的警界与街面秩序，同时保护地位和家庭。',
    relationshipAnchors: ['猪油仔：可靠的收数与协调伙伴', '颜同：警界竞争者', '白月嫦、阿霞：私人生活的重要牵挂'],
    promptHooks: ['一条利益链被廉署盯上', '下属借他的规矩过度敛财', '颜同争夺同一宗案件的主导权'], importance: 96
  },
  {
    id: 'screen_film_lee_rock_lard_so', displayName: '猪油仔', aliases: ['猪油', 'Lard So'],
    gender: 'male', ageRange: { min: 32, max: 52 }, category: 'triad_crime', currentIdentity: 'civilian',
    publicIdentity: '替雷洛处理街面关系与利益协调的中间人',
    actualIdentitySummary: '不具警察身份，却连接警界、商户、社团与收数渠道。',
    profileSummary: '嘴甜、灵活、熟悉各方价码，是灰色网络中降低冲突与传递消息的关键人物。',
    personality: '圆滑、机灵、讲实际，对危险气氛非常敏感。', motivation: '在各方都需要自己的情况下赚钱并保住安全退路。',
    relationshipAnchors: ['雷洛：最重要的靠山与合作对象', '街面商户和社团中间人：日常往来网络'],
    promptHooks: ['一笔数目在中途少了', '两个势力都要求他传递不同说法', '廉署接触了他熟悉的商户'], importance: 88
  },
  {
    id: 'screen_film_lee_rock_pak_yuet_seung', displayName: '白月嫦', aliases: ['月嫦'],
    gender: 'female', ageRange: { min: 25, max: 45 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '出身较好、与雷洛共同经营家庭的女性',
    profileSummary: '有教养和判断力，能看懂丈夫事业背后的关系，也要求家庭获得相称的尊重与安全。',
    personality: '端庄、聪明、有原则，面对感情伤害不会装作不知。', motivation: '维护家庭尊严与孩子未来，不让权势关系无限侵入私人生活。',
    relationshipAnchors: ['雷洛：丈夫与复杂利益中心', '阿霞：令家庭关系产生压力的人'],
    promptHooks: ['家庭宴会出现不受欢迎的关系人', '孩子安全受到警界斗争影响', '她掌握一项雷洛未主动说明的安排'], importance: 82
  },
  {
    id: 'screen_film_lee_rock_ah_har', displayName: '阿霞', aliases: ['霞姐'],
    gender: 'female', ageRange: { min: 25, max: 45 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '与雷洛有深厚旧情、经历坎坷的女性',
    profileSummary: '感情真挚但生活屡受环境推挤，既希望被保护，也不愿自己的全部价值只由旧情定义。',
    personality: '温柔、坚韧、敏感，面对现实压力能独自承担。', motivation: '为自己和家人争取安稳，不再被权势变化反复抛下。',
    relationshipAnchors: ['雷洛：长期未能简单了结的旧情', '白月嫦：无法回避的家庭现实'],
    promptHooks: ['旧识带来雷洛过去的消息', '住所与工作受到街面人物干扰', '她得到重新开始生活的机会'], importance: 80
  },
  {
    id: 'screen_film_lee_rock_ngan_tung', displayName: '颜同', aliases: ['颜爷', '颜探长'],
    gender: 'male', ageRange: { min: 38, max: 57 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '与雷洛长期竞争的警界实权人物',
    actualIdentitySummary: '掌握自己的警务人脉与灰色利益网络。',
    profileSummary: '资历深、手段老辣，不愿看着后来者改变既有分配，更善于借制度与关系同时施压。',
    personality: '阴沉、精明、好胜、记仇，习惯留后手。', motivation: '压制雷洛扩张，保住自己在警界和街面的收益与威信。',
    relationshipAnchors: ['雷洛：核心权力竞争者', '警界旧人脉：维持影响力的基础'],
    promptHooks: ['两边下属在同一区域发生摩擦', '高层准备重新划分管辖', '廉署调查令双方可能短暂合作'], importance: 90
  }
];

const youngDangerousTwo: ScreenCharacterExpansionWork = {
  id: 'work_film_young_dangerous_2', title: '古惑仔2之猛龙过江', titleEn: 'Young and Dangerous 2', medium: 'film',
  availableYears: { from: 1996, to: 1996 }
};

const youngDangerousTwoCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_young_dangerous_2_ting_yiu', displayName: '丁瑶', aliases: ['Ting Yiu'],
    gender: 'female', ageRange: { min: 25, max: 36 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '台湾三联帮高层身边的得力助手',
    profileSummary: '善于利用礼貌、魅力与信息差隐藏真正野心，对帮派权力运行有清醒而冷酷的理解。',
    personality: '沉着、善演、果断、野心强，不轻易让情绪暴露计划。', motivation: '摆脱附属位置，取得能由自己决定资源与命运的权力。',
    relationshipAnchors: ['雷功：公开效忠的帮派上层', '山鸡：可利用也可能失控的关系'],
    promptHooks: ['一次帮派访问需要秘密安排', '内部文件落入不可靠的人手中', '她必须在魅力与威胁之间选择手段'], importance: 92
  },
  {
    id: 'screen_film_young_dangerous_2_dai_fei', displayName: '徐飞鸿', aliases: ['大飞', 'Dai Fei'],
    gender: 'male', ageRange: { min: 30, max: 43 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '洪兴区内有实力、作风粗豪的领导人物',
    profileSummary: '说话粗鲁、外表散漫，实际重情义也懂社团大局；会先用强势测试对方，再判断是否值得合作。',
    personality: '豪爽、火爆、讲义气、粗中有细。', motivation: '守住自己的地区与兄弟，同时在洪兴内部获得应有尊重。',
    relationshipAnchors: ['陈浩南：既竞争又可并肩的同门人物', '蒋天生：必须尊重的社团上层'],
    promptHooks: ['区内年轻成员越界惹事', '同门之间发生地盘误会', '警方行动要求几个地区人物协调'], importance: 90
  },
  {
    id: 'screen_film_young_dangerous_2_lui_kung', displayName: '雷功', aliases: ['雷公'],
    gender: 'male', ageRange: { min: 52, max: 68 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '台湾三联帮的高层掌权人物',
    profileSummary: '重视帮派扩张、跨境关系与绝对服从，习惯把个人感情置于组织利益之后。',
    personality: '威严、老练、多疑，对背叛零容忍。', motivation: '扩大三联帮在香港与澳门的关系网并确保内部受控。',
    relationshipAnchors: ['丁瑶：信任并使用的近身助手', '山鸡：有能力也需观察的年轻成员'],
    promptHooks: ['跨境合作需要香港中间人', '内部账目出现不一致', '年轻成员的私人关系影响帮派安排'], importance: 88
  },
  {
    id: 'screen_film_young_dangerous_2_ko_chit', displayName: '高捷', aliases: ['阿捷'],
    gender: 'male', ageRange: { min: 28, max: 40 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '三联帮负责行动与护卫的成员',
    profileSummary: '执行力强，重视直属命令和帮派安全；不善长篇解释，但会留意身边人的异常。',
    personality: '沉默、警觉、强硬，习惯先控制场面。', motivation: '完成上层交付的护卫与行动任务，维持可靠名声。',
    relationshipAnchors: ['雷功：效忠的上层', '丁瑶：需要保护也需要观察的人'],
    promptHooks: ['护送路线被提前泄露', '上层命令彼此矛盾', '香港合作方隐瞒现场风险'], importance: 79
  },
  {
    id: 'screen_film_young_dangerous_2_kk', displayName: 'KK',
    gender: 'female', ageRange: { min: 20, max: 30 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '熟悉夜场与洪兴年轻成员生活圈的女性',
    profileSummary: '性格爽朗，能适应街面圈子的快节奏，但并不愿感情长期被兄弟义气和冲突支配。',
    personality: '活泼、直率、重感情，受伤时会直接表达。', motivation: '保住自己的生活选择，并要求伴侣认真面对关系与危险。',
    relationshipAnchors: ['大天二：感情关系', '陈浩南、山鸡等：熟悉的朋友圈'],
    promptHooks: ['夜场冲突波及朋友', '伴侣因社团任务长期失约', '她掌握一段不该听见的谈话'], importance: 76
  },
  {
    id: 'screen_film_young_dangerous_2_or_chi_wah', displayName: '柯志华', aliases: ['小黑'],
    gender: 'male', ageRange: { min: 22, max: 33 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '三联帮年轻成员',
    profileSummary: '在帮派纪律、同辈关系和个人前途之间寻找位置，容易被跨境任务推入超出经验的局面。',
    personality: '机灵、好胜、讲同辈情义，经验仍不足。', motivation: '通过办事证明自己可以承担更重要的位置。',
    relationshipAnchors: ['三联帮上层：晋升与压力来源', '香港年轻社团成员：可能的合作或冲突对象'],
    promptHooks: ['第一次独立负责跨境联络', '同伴要求他隐瞒失误', '香港警方开始注意他的活动'], importance: 75
  }
];

const youngDangerousThree: ScreenCharacterExpansionWork = {
  id: 'work_film_young_dangerous_3', title: '古惑仔3之只手遮天', titleEn: 'Young and Dangerous 3', medium: 'film',
  availableYears: { from: 1996, to: 1996 }
};

const youngDangerousThreeCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_young_dangerous_3_chan_tin_hung', displayName: '陈天雄', aliases: ['乌鸦', '下山虎', 'Crow'],
    gender: 'male', ageRange: { min: 28, max: 40 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '东星五虎之一，以凶狠和破坏规矩见称',
    profileSummary: '享受用暴力和公开羞辱打破对手秩序，不愿受叔父辈或传统程序限制。',
    personality: '狂妄、残暴、好胜、反权威，擅长制造恐惧。', motivation: '以最直接的方式扩大东星和个人声势，让所有人接受强者定规矩。',
    relationshipAnchors: ['笑面虎：擅长谋划的同伙', '骆驼：名义上的社团上层', '陈浩南：洪兴竞争对象'],
    promptHooks: ['夜场冲突被他蓄意公开化', '上层要求他遵守暂时停火', '一项栽赃计划需要可靠证人'], importance: 94
  },
  {
    id: 'screen_film_young_dangerous_3_ng_chi_wai', displayName: '吴志伟', aliases: ['笑面虎', 'Tiger'],
    gender: 'male', ageRange: { min: 31, max: 44 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '东星五虎之一，擅长计谋与外交包装',
    profileSummary: '表面客气、善于劝和，实际习惯在别人动手前安排利益、证据与退路。',
    personality: '阴险、耐心、善演、现实，倾向让同伙承担最显眼风险。', motivation: '利用冲突重排利益，同时让自己保持可谈判和可否认的位置。',
    relationshipAnchors: ['乌鸦：危险但高效的行动同伙', '骆驼：需要维持表面尊重的上层'],
    promptHooks: ['双方谈判被设计成伏击', '一名中间人保留了不利证据', '乌鸦的高调行为破坏退路'], importance: 91
  },
  {
    id: 'screen_film_young_dangerous_3_lok_ping_yun', displayName: '骆丙润', aliases: ['骆驼', 'Camel'],
    gender: 'male', ageRange: { min: 50, max: 66 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '东星资深掌权人物',
    profileSummary: '讲资历、整体利益和社团体面，希望约束年轻强硬派，却未必能完全控制其野心。',
    personality: '威严、老练、重传统，也会在现实压力下妥协。', motivation: '维持东星内部秩序与外部谈判地位，避免年轻人的冒进毁掉基业。',
    relationshipAnchors: ['乌鸦、笑面虎：有能力但必须约束的后辈', '蒋天生：洪兴对等谈判人物'],
    promptHooks: ['跨社团会面需要停火保证', '后辈借他的名义行动', '叔父辈对未来路线产生分歧'], importance: 88
  },
  {
    id: 'screen_film_young_dangerous_3_ngau_hung', displayName: '牛雄', aliases: ['牛Sir'],
    gender: 'male', ageRange: { min: 40, max: 55 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '负责有组织罪案调查的警司',
    profileSummary: '熟悉洪兴、东星等社团关系，重视控制大规模冲突和建立可用证据，不会把街面传闻直接当事实。',
    personality: '稳重、强硬、务实，面对社团挑衅保持职业距离。', motivation: '防止社团冲突升级并抓住能够依法推进的关键证据。',
    relationshipAnchors: ['洪兴、东星地区人物：持续观察的对象', '前线探员与线人：情报来源'],
    promptHooks: ['两个社团同时增加人手', '线人只愿透露一半计划', '上级要求在大型活动前压住冲突'], importance: 86
  },
  {
    id: 'screen_film_young_dangerous_3_lam_suk_fan', displayName: '林淑芬', aliases: ['淑芬'],
    gender: 'female', ageRange: { min: 38, max: 52 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '虔诚信教、与陈浩南家庭关系相连的女性',
    profileSummary: '努力以信仰和家庭责任约束暴力循环，对年轻人的街面生活既担忧又仍抱有改变希望。',
    personality: '温和、坚韧、重信仰，危险来临时会保护家人。', motivation: '让家人远离报复与社团冲突，保住可以重新开始的机会。',
    relationshipAnchors: ['陈浩南：家庭与关怀关系', '社团年轻人：希望其不要继续暴力循环'],
    promptHooks: ['教会活动受到街面冲突影响', '家人被人利用作传话', '她发现年轻人隐瞒了严重危险'], importance: 76
  }
];

const policeStoryThree: ScreenCharacterExpansionWork = {
  id: 'work_film_police_story_3', title: '警察故事Ⅲ超级警察', titleEn: 'Police Story 3: Super Cop', medium: 'film',
  availableYears: { from: 1992, to: 1996 }
};

const policeStoryThreeCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_police_story_3_yang_jian_hua', displayName: '杨建华', englishName: 'Jessica Yang', aliases: ['杨科长'],
    gender: 'female', ageRange: { min: 27, max: 38 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '内地公安系统负责跨境行动的干部',
    profileSummary: '训练扎实、执行严谨，能在高风险卧底与实战环境保持清醒；对纪律严格但会尊重可靠伙伴。',
    personality: '冷静、果断、自律，专业判断优先于逞强。', motivation: '完成跨境缉捕任务并确保合作人员和证据安全。',
    relationshipAnchors: ['陈家驹：香港警方行动搭档', '猜霸、豹强：目标犯罪网络'],
    promptHooks: ['跨境情报标准不一致', '卧底身份面临临场测试', '行动目标突然改变交通路线'], importance: 92
  },
  {
    id: 'screen_film_police_story_3_panther', displayName: '豹强', aliases: ['豹哥', 'Panther'],
    gender: 'male', ageRange: { min: 32, max: 45 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '猜霸犯罪集团的重要行动人物',
    profileSummary: '负责测试新人、组织行动和维持纪律，对胆量与实战表现的信任高于口头保证。',
    personality: '凶悍、多疑、行动直接，认可真正能扛事的人。', motivation: '替集团完成高风险任务并扩大自己在猜霸身边的价值。',
    relationshipAnchors: ['猜霸：效忠的集团首脑', '新加入成员：持续测试的对象'],
    promptHooks: ['越狱或接应计划出现漏洞', '新人身份经不起背景核查', '货物路线被警方截断'], importance: 84
  },
  {
    id: 'screen_film_police_story_3_chaibat', displayName: '冠猜霸', aliases: ['猜霸', 'Chaibat'],
    gender: 'male', ageRange: { min: 40, max: 55 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '跨境犯罪集团首脑',
    profileSummary: '掌握货源、武装人手和跨境关系，以高额利益吸引部下，也以残酷惩罚控制泄密风险。',
    personality: '自信、冷酷、多疑、善于利用家人与利益。', motivation: '维持跨境生意和指挥链安全，清除任何可能出卖集团的人。',
    relationshipAnchors: ['程颖思：掌握关键账户与资产的妻子', '豹强：行动骨干'],
    promptHooks: ['关键账户需要本人处理', '跨境伙伴要求改变分成', '集团内部出现警方卧底传闻'], importance: 90
  },
  {
    id: 'screen_film_police_story_3_cheng_wing_sze', displayName: '程颖思', aliases: ['颖思'],
    gender: 'female', ageRange: { min: 29, max: 42 }, category: 'business_finance', currentIdentity: 'civilian',
    publicIdentity: '管理跨境资产与账户的商界女性',
    actualIdentitySummary: '所掌握的账户与猜霸犯罪集团关系密切，因此同时是资产管理者和高风险关键人。',
    profileSummary: '熟悉资金与文件，清楚丈夫网络的危险；表面受控，实际掌握足以改变多方处境的财务钥匙。',
    personality: '谨慎、能忍、头脑清楚，受威胁时会寻找最现实的生路。', motivation: '保住生命和资产控制权，避免成为集团或警方任一方的一次性工具。',
    relationshipAnchors: ['猜霸：丈夫与主要威胁来源', '跨境执法人员：可能的谈判对象'],
    promptHooks: ['账户文件必须在限定时间签署', '她准备以资料交换保护', '集团成员怀疑她私留后路'], importance: 87
  }
];

const crimeStory: ScreenCharacterExpansionWork = {
  id: 'work_film_crime_story', title: '重案组', titleEn: 'Crime Story', medium: 'film',
  availableYears: { from: 1993, to: 1996 }
};

const crimeStoryCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_crime_story_eddie_chan', displayName: '陈帮办', englishName: 'Eddie Chan', aliases: ['陈Sir'],
    gender: 'male', ageRange: { min: 32, max: 44 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '负责重大绑架案的重案组警务人员',
    profileSummary: '投入案件、行动果断，面对人质危险会承受强烈心理压力；不愿因内部问题放弃追查。',
    personality: '认真、勇敢、执着，压力积累时容易把责任全揽在自己身上。', motivation: '安全救回人质并找出泄密或阻碍调查的内部因素。',
    relationshipAnchors: ['洪定邦：参与案件却可能隐瞒事实的同僚', '王一飞：必须营救的被绑商人'],
    promptHooks: ['绑匪改变交款条件', '内部情报早于行动泄露', '人质家属不愿完全配合警方'], importance: 91
  },
  {
    id: 'screen_film_crime_story_hung_ting_bong', displayName: '洪定邦', aliases: ['洪爷', '洪Sir'],
    gender: 'male', ageRange: { min: 42, max: 56 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '资历较深、参与重案调查的警务人员',
    actualIdentitySummary: '公开警察身份之外另有利益压力；任何具体违法事实必须由当前存档证据建立，不能默认公开。',
    profileSummary: '熟悉程序和同僚弱点，外表可靠，遇到个人利益与案件冲突时会主动控制信息。',
    personality: '老练、谨慎、善于掩饰，面对追问会先稳住局面。', motivation: '保住自己的身份、利益与退路，不让任何一边掌握完整真相。',
    relationshipAnchors: ['陈帮办：既是同僚也是可能逼近秘密的人', '案件利益相关者：潜在控制来源'],
    promptHooks: ['关键证物的交接时间对不上', '绑匪知道警方内部安排', '一名下属开始私下核对报告'], importance: 90
  },
  {
    id: 'screen_film_crime_story_wong_yat_fei', displayName: '王一飞', aliases: ['王老板'],
    gender: 'male', ageRange: { min: 42, max: 58 }, category: 'business_finance', currentIdentity: 'civilian',
    publicIdentity: '拥有地产与商业资产的富商',
    profileSummary: '习惯掌控交易和员工，却在绑架风险中不得不依赖警方与家人；商业关系也可能成为案件线索。',
    personality: '谨慎、讲效率、重控制，生命受威胁时更显多疑。', motivation: '保护自己和家人，同时避免商业机密与资产安排被绑匪利用。',
    relationshipAnchors: ['陈帮办：负责安全与调查的警务人员', '商业伙伴和员工：可能掌握行程的人'],
    promptHooks: ['出行资料只有少数人知道', '家属与警方对交赎金意见不同', '公司内部债务可能与案件有关'], importance: 82
  }
];

const cityHunter: ScreenCharacterExpansionWork = {
  id: 'work_film_city_hunter', title: '城市猎人', titleEn: 'City Hunter', medium: 'film',
  availableYears: { from: 1993, to: 1996 }
};

const cityHunterCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_city_hunter_meng_bo', displayName: '孟波', aliases: ['孟波仔', 'Ryo Saeba'],
    gender: 'male', ageRange: { min: 27, max: 39 }, category: 'police_law', currentIdentity: 'civilian',
    publicIdentity: '接受寻人、护送与危险调查的私家侦探',
    profileSummary: '身手和临场反应极强，平日吊儿郎当、爱开玩笑，真正危险来临时会迅速承担保护责任。',
    personality: '机敏、好色、幽默、可靠，习惯用轻浮掩盖警觉。', motivation: '完成委托、保护同行者，也维持不受体制束缚的生活。',
    relationshipAnchors: ['惠香：工作搭档与长期牵挂', '今村清子：寻人或保护委托对象', '芽子：会在案件中碰面的警方人员'],
    promptHooks: ['普通寻人牵出武装集团', '委托人隐瞒真实身份', '邮轮或酒店出现封闭空间危机'], importance: 92
  },
  {
    id: 'screen_film_city_hunter_kaori', displayName: '惠香', englishName: 'Kaori Makimura', aliases: ['阿香', 'Kaori'],
    gender: 'female', ageRange: { min: 22, max: 33 }, category: 'police_law', currentIdentity: 'civilian',
    publicIdentity: '孟波的私家侦探工作搭档',
    profileSummary: '负责委托、行程和现实收尾，对孟波的不正经毫不客气；真正行动时敢于面对危险。',
    personality: '爽朗、能干、正义感强，吃醋和生气都表达直接。', motivation: '让侦探工作真正帮助委托人，也让孟波对工作与关系负起责任。',
    relationshipAnchors: ['孟波：默契深又常令她生气的搭档'],
    promptHooks: ['委托费用与危险程度完全不符', '孟波擅自改变计划', '她单独掌握了目标的新线索'], importance: 86
  },
  {
    id: 'screen_film_city_hunter_kiyoko_imamura', displayName: '今村清子', englishName: 'Kiyoko Imamura', aliases: ['清子'],
    gender: 'female', ageRange: { min: 18, max: 25 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '来自富裕家庭、渴望摆脱管束的年轻女性',
    profileSummary: '好奇、任性又有行动力，容易因追求自由进入超出经验的危险场合。',
    personality: '活泼、冲动、自尊强，讨厌被当作需要管理的小孩。', motivation: '证明自己可以独立选择生活，而不是只按家庭安排前进。',
    relationshipAnchors: ['家人：保护与管束并存', '孟波、惠香：可能负责寻找或保护她的人'],
    promptHooks: ['她擅自改变既定行程', '朋友邀请她参加身份复杂的聚会', '家族商业关系带来绑架风险'], importance: 78
  },
  {
    id: 'screen_film_city_hunter_saeko', displayName: '芽子', englishName: 'Saeko Nogami', aliases: ['芽子警官'],
    gender: 'female', ageRange: { min: 26, max: 37 }, category: 'police_law', currentIdentity: 'police',
    publicIdentity: '身手出众、善于独立行动的警务人员',
    profileSummary: '判断快、行动大胆，懂得利用对手的轻视接近目标；与民间调查者合作时仍坚持掌握证据。',
    personality: '自信、冷静、敏锐，面对轻浮试探能迅速反制。', motivation: '阻止高风险犯罪并把关键人安全带回法律程序。',
    relationshipAnchors: ['孟波：能力可靠但难管理的民间协作者', '麦当奴：危险行动目标'],
    promptHooks: ['警方身份不便公开进入现场', '民间协作者先一步掌握线索', '高价值目标准备离港'], importance: 85
  },
  {
    id: 'screen_film_city_hunter_gundam', displayName: '高达', englishName: 'Gundam', aliases: ['浪子高达'],
    gender: 'male', ageRange: { min: 28, max: 40 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '出入赌场与上流娱乐场合的职业赌徒',
    profileSummary: '衣着讲究、身手灵活，喜欢把危险当成展示风度的机会；关键时刻仍会帮助无辜者。',
    personality: '潇洒、自负、机智、爱表现，危机中反而更专注。', motivation: '维持自由体面的生活，并在真正危险时证明自己不是只会赌博。',
    relationshipAnchors: ['邮轮赌场与娱乐圈人脉：主要活动网络'],
    promptHooks: ['赌场发现有人出千或洗钱', '一笔赌债牵涉武装人物', '他在封闭场所撞见劫持准备'], importance: 78
  },
  {
    id: 'screen_film_city_hunter_macdonald', displayName: '麦当奴', englishName: 'MacDonald', aliases: ['Mac'],
    gender: 'male', ageRange: { min: 36, max: 50 }, category: 'triad_crime', currentIdentity: 'gang_member',
    publicIdentity: '率领国际武装犯罪团伙的人物',
    profileSummary: '训练有素，追求对封闭空间、人质和通讯的完全控制，把谈判视为拖延与施压工具。',
    personality: '冷酷、自负、纪律化，无法容忍计划被局外人打乱。', motivation: '以精密劫持取得巨额利益并安全撤离。',
    relationshipAnchors: ['武装手下：严格指挥的行动团队', '芽子、孟波：可能破坏计划的对手'],
    promptHooks: ['武器被提前运入大型场所', '团队成员私下改变撤离计划', '人质中出现未被识别的行动人员'], importance: 85
  }
];

const twinDragons: ScreenCharacterExpansionWork = {
  id: 'work_film_twin_dragons', title: '双龙会', titleEn: 'Twin Dragons', medium: 'film',
  availableYears: { from: 1992, to: 1996 }
};

const twinDragonsCharacters: ScreenCharacterExpansionDraft[] = [
  {
    id: 'screen_film_twin_dragons_ma_yau', displayName: '马友', aliases: ['公子', 'Ma Yau'],
    gender: 'male', ageRange: { min: 28, max: 38 }, category: 'media_entertainment', currentIdentity: 'civilian',
    publicIdentity: '受过正规训练、事业有成的古典音乐指挥',
    profileSummary: '生活讲秩序和专业，社交得体，却不熟悉街面混乱；突发处境会迫使他展现平时隐藏的勇气。',
    personality: '文雅、谨慎、专注、有责任感，对失控环境不适应。', motivation: '完成音乐事业与重要演出，同时保护突然进入自己生活的人。',
    relationshipAnchors: ['玩命：外貌相同、人生完全不同的孪生兄弟', '唐心：感情与职业关系'],
    promptHooks: ['身份误认影响一场演出', '商业赞助牵涉街面人物', '一项家庭线索打乱既定行程'], importance: 87
  },
  {
    id: 'screen_film_twin_dragons_wan_ming', displayName: '玩命', aliases: ['搏命', 'Die Hard'],
    gender: 'male', ageRange: { min: 28, max: 38 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '在车房与街面长大、驾驶和打斗经验丰富的年轻人',
    profileSummary: '靠反应、胆量和朋友生存，对上流礼仪陌生；认定朋友后会不计代价帮忙。',
    personality: '冲动、豪爽、机灵、重朋友，讨厌装腔作势。', motivation: '摆脱被街面麻烦牵着走的生活，并保护朋友和喜欢的人。',
    relationshipAnchors: ['马友：外貌相同的孪生兄弟', '芭芭拉：感情牵挂', '泰山：惹事也不能不管的朋友'],
    promptHooks: ['车房卷入赃车纠纷', '身份误认让他进入正式场合', '朋友欠下危险人物的人情'], importance: 88
  },
  {
    id: 'screen_film_twin_dragons_barbara', displayName: '芭芭拉', englishName: 'Barbara', aliases: ['Barbie'],
    gender: 'female', ageRange: { min: 23, max: 34 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '在娱乐场所工作、向往稳定感情的年轻女性',
    profileSummary: '外表亮眼、性格直接，熟悉街面人物却不愿一生困在混乱关系中。',
    personality: '爽朗、热情、有主见，对欺骗和敷衍反应强烈。', motivation: '找到真正尊重自己的伴侣与生活，不再替别人无休止收拾麻烦。',
    relationshipAnchors: ['玩命：感情牵挂', '马友：身份误认可能引发的关系混乱'],
    promptHooks: ['她误认了外貌相同的人', '夜场工作遇到债务纠纷', '新工作机会要求离开原朋友圈'], importance: 77
  },
  {
    id: 'screen_film_twin_dragons_tong_sum', displayName: '唐心', aliases: ['心心'],
    gender: 'female', ageRange: { min: 23, max: 34 }, category: 'media_entertainment', currentIdentity: 'civilian',
    publicIdentity: '与古典音乐圈关系密切的职业女性',
    profileSummary: '懂礼仪也有自己的判断，不满足于只做名人身边的陪衬；面对离奇误会会主动核实。',
    personality: '温和、聪明、谨慎，必要时敢于追问真相。', motivation: '建立有尊重和诚实的感情，同时保住自己的职业方向。',
    relationshipAnchors: ['马友：音乐事业与感情关系', '玩命：身份误认造成的疑点'],
    promptHooks: ['演出排练出现行为反常的马友', '赞助方提出不合理条件', '她发现两份相互矛盾的行程记录'], importance: 77
  },
  {
    id: 'screen_film_twin_dragons_tarzan', displayName: '泰山', englishName: 'Tarzan', aliases: ['阿山'],
    gender: 'male', ageRange: { min: 27, max: 39 }, category: 'civilian_relationship', currentIdentity: 'civilian',
    publicIdentity: '玩命的车房朋友与街面拍档',
    profileSummary: '热心但常把问题想得太简单，惹出麻烦后仍会努力救场；熟悉车辆和本地街道。',
    personality: '乐观、莽撞、讲朋友、嘴快，危急时不会独自逃走。', motivation: '帮朋友解决眼前麻烦，也证明自己并非只会闯祸。',
    relationshipAnchors: ['玩命：最重要的朋友与共同麻烦来源'],
    promptHooks: ['替人保管的车辆来路不明', '一句吹嘘引来真正的债主', '他无意知道了犯罪团伙的交收地点'], importance: 74
  }
];

export const hkScreenCharacterCrimeExpansion = [
  ...buildScreenCharacterExpansion(election, electionCharacters),
  ...buildScreenCharacterExpansion(infernalAffairsTwo, infernalAffairsTwoCharacters),
  ...buildScreenCharacterExpansion(trivisa, trivisaCharacters),
  ...buildScreenCharacterExpansion(centuryOfDragon, centuryOfDragonCharacters),
  ...buildScreenCharacterExpansion(cityOnFire, cityOnFireCharacters),
  ...buildScreenCharacterExpansion(toBeNumberOne, toBeNumberOneCharacters),
  ...buildScreenCharacterExpansion(leeRock, leeRockCharacters),
  ...buildScreenCharacterExpansion(youngDangerousTwo, youngDangerousTwoCharacters),
  ...buildScreenCharacterExpansion(youngDangerousThree, youngDangerousThreeCharacters),
  ...buildScreenCharacterExpansion(policeStoryThree, policeStoryThreeCharacters),
  ...buildScreenCharacterExpansion(crimeStory, crimeStoryCharacters),
  ...buildScreenCharacterExpansion(cityHunter, cityHunterCharacters),
  ...buildScreenCharacterExpansion(twinDragons, twinDragonsCharacters)
];
