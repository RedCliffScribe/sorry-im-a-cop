import { hkLateColonialTriadOrganizations } from '../cityPower/hkLateColonialTriadOrganizations';
import type { CurrentIdentity, GameTime, OriginBackground } from '../runtime/types';

export interface OpeningScenario {
  id: string;
  title: string;
  dateLabel: string;
  time: GameTime;
  summary: string;
  detail: string;
  tags: string[];
}

export interface IdentityOpeningOption {
  id: CurrentIdentity;
  title: string;
  summary: string;
  detail: string;
}

export type PoliceRankId =
  | 'pc'
  | 'spc'
  | 'sergeant'
  | 'station_sergeant'
  | 'probationary_inspector'
  | 'inspector'
  | 'senior_inspector'
  | 'chief_inspector';

export type PoliceDepartmentId =
  | 'uniform'
  | 'cid'
  | 'traffic'
  | 'eu'
  | 'ptu'
  | 'marine'
  | 'special_branch'
  | 'station_duty';

export interface PoliceRankOption {
  id: PoliceRankId;
  label: string;
  shortLabel: string;
}

export interface PoliceDepartmentOption {
  id: PoliceDepartmentId;
  label: string;
  summary: string;
  allowedRanks: PoliceRankId[];
}

export interface PoliceRoleOption {
  id: string;
  departmentId: PoliceDepartmentId;
  label: string;
  summary: string;
  allowedRanks: PoliceRankId[];
  authoritySummary?: string;
  accessSummary?: string;
  dutySummary?: string;
}

export interface PolicePostingOption {
  id: string;
  label: string;
  kind: 'police_station' | 'headquarters' | 'barracks' | 'base';
  summary: string;
  allowedDepartments: PoliceDepartmentId[];
}

export interface CivilianOpeningProfileOption {
  id: string;
  label: string;
  occupationGroup: 'frontline' | 'professional' | 'management' | 'free';
  employmentStatus: 'employed' | 'unemployed' | 'custom';
  publicOccupation: string;
  workplacePlaceId: string;
  workplaceLabel: string;
  employerOrganizationId?: string;
  employerName?: string;
  employerOrganizationType?: string;
  employerRelationType?: 'employee' | 'manager' | 'owner' | 'contractor';
  employerRelationSummary?: string;
  workUnitSummary?: string;
  positionSummary?: string;
  dutySummary?: string;
  decisionScopeSummary?: string;
  accessSummary?: string;
  sectorIds?: string[];
  roleTags?: string[];
  suggestedMonthlyIncome?: number;
  incomeKind?: 'salary' | 'asset_income';
  communitySummary: string;
  familyEconomicSummary: string;
  legalStatusSummary: string;
  policeEntrySeeds: string[];
  triadEntrySeeds: string[];
}

export interface CivilianCustomOpeningProfileInput {
  publicOccupation: string;
  workplacePlaceId: string;
  workplaceLabel: string;
  employerName?: string;
  communitySummary?: string;
}

export type TriadRankId =
  | 'outside_associate'
  | 'initiated_member'
  | 'senior_member'
  | 'crew_lead'
  | 'district_cadre';

export interface TriadSocietyOption {
  id: string;
  label: string;
  organizationId: string;
  societyName: string;
  networkSummary: string;
  territoryPlaceIds: string[];
  defaultTerritoryPlaceId: string;
}

export interface TriadTerritoryOption {
  placeId: string;
  label: string;
  territorySummary: string;
  localPressureSummary: string;
}

export interface TriadRankOption {
  id: TriadRankId;
  label: string;
  rankSummary: string;
  authoritySummary: string;
  obligationSummary: string;
  riskSummary: string;
}

export interface TriadRoleOption {
  id: string;
  label: string;
  roleTitle: string;
  summary: string;
  allowedRanks: TriadRankId[];
}

export interface TriadOpeningSelection {
  societyId?: string;
  territoryPlaceId?: string;
  rankId?: TriadRankId;
  roleId?: string;
  legacyProfileId?: string;
}

export interface TriadOpeningProfileOption {
  id: string;
  label: string;
  societyId?: string;
  territoryPlaceId?: string;
  rankId?: TriadRankId;
  roleId?: string;
  organizationId: string;
  societyName: string;
  roleTitle: string;
  rankSummary: string;
  authoritySummary?: string;
  territorySummary: string;
  startPlaceId: string;
  startPlaceLabel: string;
  obligationSummary: string;
  riskSummary: string;
}

export const hk1980sPoliceRankKnowledge = `香港警队职级资料库（1980s-1990s Royal Hong Kong Police）
- 当前玩家档案里的职级、部门、驻点和岗位是事实锚点。叙事必须以这些字段为准，不能自行把玩家升职、降职或改派，除非结构化写回明确发生。
- 缩写不可混淆：PC = Constable（警员）；SPC = Senior Constable / Senior Police Constable（高级警员）；SP = Superintendent（警司）。SPC 绝不是 SP，不能把高级警员写成警司。
- 基层至督察层级顺序：PC 警员 < SPC 高级警员 < Sergeant 警长 < Station Sergeant 警署警长 < Probationary Inspector 见习督察 < Inspector 督察 < Senior Inspector 高级督察 < Chief Inspector 总督察。
- 高级警官层级顺序：Superintendent 警司 < Senior Superintendent 高级警司 < Chief Superintendent 总警司 < Assistant Commissioner 助理处长 < Senior Assistant Commissioner 高级助理处长 < Deputy Commissioner 副处长 < Commissioner of Police 警务处长。
- 权限边界：PC/SPC 是一线基层人员，负责巡逻、报案室、盘问、记录和初步处置；Sergeant/Station Sergeant 可带小队或监督警署值日；Inspector 至 Chief Inspector 才开始稳定承担案件主办、值日官、队伍管理或指挥职责；Superintendent 以上通常属于警区、总区或总部管理，不应被写成普通街面巡逻岗位。
- 职级影响他人称呼、服从程度、可接触资料、上级链条、纪律风险和叙事压力，但不是战斗力或道德评价。不要用职级硬判剧情结果。`;

export const hk1980sTriadBehaviorKnowledge = `香港社团行为逻辑（底层推演约束）
- 社团对警队人员使用暴力是高风险行为，不应被写成随手可做的低成本反应。普通口角、查牌、盘问、面子冲突或临场不爽，通常不足以让社团公开对警队人员动手。
- 私人恩怨或个人失控导致的袭警、伤警、威胁警员行为，大概率会被社团切割：压低牵连、否认授意、让当事人自己承担，或通过中间人降温，除非后续事实证明组织曾授权或追认。
- 如果是社团行为，包括个人为了社团利益而行动，必须先有充分利益考量：冲突已难以调和、触及社团根本利益、现有退路失效，并且组织认为承受警队反制、廉署/媒体压力、地盘损失和生意代价仍然值得。
- 暴力并非禁题；可以发生伏击、威胁、绑架、伤人或杀人，但需要明确动机、代价、遮掩方式、授权层级或切割迹象，不要把普通社团成员写成随意袭警又完全不考虑后果。
- 这条是内部行为逻辑，只用于叙事推演、NPC判断和结构化写回。不要在 narrativeText 中直白讲解这条底层规则，不要让角色像系统说明一样说“社团正在做成本收益计算”或“这是组织切割关系”；应通过行动、沉默、推诿、线人风声、后续态度和面板写回体现。`;

export const hk1980sOriginBackgroundOptions: OriginBackground[] = [
  {
    originBackgroundId: 'estate_child',
    name: '屋邨子弟',
    definition: '在公屋或旧式屋邨长大，熟悉街坊、排队、补习、家用和邻里纠纷。',
    backgroundSummary: '同座邻居、散工家人、读书中的兄弟姐妹，以及街坊求情，都可能成为你早年的牵连。'
  },
  {
    originBackgroundId: 'mainland_newcomer_family',
    name: '大陆新移民家庭',
    definition: '家中有人从内地来港，身份、口音、工作和归属感都带着压力。',
    backgroundSummary: '亲属投靠、落脚屋邨、移民手续、人情担保，以及被本地街坊试探和两地亲戚牵连。'
  },
  {
    originBackgroundId: 'police_family',
    name: '警察世家',
    definition: '家中有人在警队或纪律部队任职，懂规矩，也容易被旧关系牵动。',
    backgroundSummary: '退休父亲、现役叔伯、警署旧识、上级照拂，和"不好给家里丢脸"的压力会跟着你进入警队。'
  },
  {
    originBackgroundId: 'small_shop_family',
    name: '小商户家庭',
    definition: '家里经营士多、茶餐厅、摊档或小铺，熟悉街坊账、人情债和保护费传闻。',
    backgroundSummary: '铺面地址、赊账街坊、熟客、收租压力、社团边缘人物和家人求你通融的场景。'
  },
  {
    originBackgroundId: 'factory_family',
    name: '工厂家庭',
    definition: '父母或亲戚在制衣、塑胶、电子厂讨生活，对加班、工伤和劳资压力敏感。',
    backgroundSummary: '工厂女工母亲、夜班父亲、工友、工伤纠纷、欠薪传闻和工业区熟人，让你更早接触社会底层。'
  },
  {
    originBackgroundId: 'harbour_waterfront',
    name: '渔港水上人',
    definition: '来自香港仔、筲箕湾、离岛或水上社区，熟悉码头、船家和海边营生。',
    backgroundSummary: '船家亲属、码头熟人、海味铺、走私传闻、离岛住处和水上社区的人情约束。'
  },
  {
    originBackgroundId: 'nightlife_edge_family',
    name: '夜场边缘家庭',
    definition: '亲友与酒吧、舞厅、卡拉 OK 或娱乐业有关，容易接触钱、面子和社团影子。',
    backgroundSummary: '在夜场工作的姐姐、酒吧老板熟人、欠债亲戚、社团中间人，以及警察身份带来的尴尬。'
  },
  {
    originBackgroundId: 'english_school',
    name: '英文学校出身',
    definition: '教育背景较好，能进入制度语言，但与基层街面经验保持距离。',
    backgroundSummary: '英文学校同学、文员亲属、升职期待、中产朋友，以及被一线同僚觉得"不够贴地"的摩擦。'
  },
  {
    originBackgroundId: 'new_territories_clan',
    name: '新界围村出身',
    definition: '在新界村落或乡事网络中长大，熟悉宗族、地权、面子和地方规矩。',
    backgroundSummary: '族叔、村代表、祠堂、丁屋地权、乡郊住址，以及警察身份与乡情之间的拉扯。'
  },
  {
    originBackgroundId: 'white_collar_family',
    name: '中产白领家庭',
    definition: '家境尚稳，重视体面、前途、教育和名声，对纪律风险更敏感。',
    backgroundSummary: '银行文员父母、体面住所、同学圈、移民讨论，和"不要惹麻烦"的家庭压力。'
  },
  {
    originBackgroundId: 'dock_transport_family',
    name: '码头运输家庭',
    definition: '亲友在码头、货仓、司机、搬运和物流圈，知道货物流动背后的门道。',
    backgroundSummary: '货车司机舅舅、码头工友、仓库地址、货运线索、私货传闻，和熟人求你打听消息的压力。'
  },
  {
    originBackgroundId: 'broken_family',
    name: '破碎家庭',
    definition: '家中长期缺位、欠债或冲突不断，早熟、警惕，也更容易被钱和亲情拉扯。',
    backgroundSummary: '失联父亲、养父母、欠债亲戚、临时住所、照顾弟妹，和随时可能被旧家庭问题拖回去的压力。'
  }
];

export const hk1980sOpeningScenarios: OpeningScenario[] = [
  {
    id: 'hk_1980_growth_pressure',
    title: '1980 港城高压增长',
    dateLabel: '1980年3月',
    time: { year: 1980, month: 3, day: 3, hour: 8, minute: 30 },
    summary: '经济增长很快，旧街区、屋邨、工厂和夜场把城市压力挤在一起。',
    detail:
      '廉署成立已经数年，旧式警队风气被压下去，但街面仍讲熟人、面子和地方势力。工厂、码头、屋邨与小商户构成日常冲突的底色，玩家更容易遇到基层秩序、人情托付和灰色生意之间的拉扯。',
    tags: ['基层秩序', '旧风气残余', '工商业压力']
  },
  {
    id: 'hk_1984_joint_declaration',
    title: '1984 前途谈判余波',
    dateLabel: '1984年12月',
    time: { year: 1984, month: 12, day: 20, hour: 19, minute: 20 },
    summary: '中英谈判尘埃初落，街坊、商人、警队和媒体都在重新判断未来。',
    detail:
      '政治不一定直接压到每个夜晚，但"不确定"开始成为城市空气的一部分。移民、资产、身份、忠诚和职业前途会在饭局、报案室、警署走廊与社团地盘里被反复提起。',
    tags: ['前途问题', '身份焦虑', '社会观望']
  },
  {
    id: 'hk_1988_crosscurrents',
    title: '1988 纪律与人情',
    dateLabel: '1988年9月',
    time: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
    summary: '制度更成熟，灰色网络仍活跃；纪律、金钱、人情和社团关系同时存在。',
    detail:
      '这是默认推荐开局。警队程序化程度上升，ICAC、媒体和上级链条都更有存在感；与此同时，夜场、地产、运输、线人和街坊网络仍然不断制造现实冲突。故事不会天然等于案件，更多是生活与权力相互挤压。',
    tags: ['默认推荐', '纪律压力', '灰色网络']
  },
  {
    id: 'hk_1990_transition_begins',
    title: '1990 过渡期开端',
    dateLabel: '1990年4月',
    time: { year: 1990, month: 4, day: 6, hour: 14, minute: 10 },
    summary: '制度过渡进入更清晰阶段，城市开始把未来写进当下每个选择。',
    detail:
      '法律、政府、警队和商业系统都在适应更明确的时间表。普通人关心房子、工作和身份；警队关心纪律、公众信任和行动边界；社团与商界则会重新估算风险与机会。',
    tags: ['制度过渡', '公共舆论', '职业前途']
  },
  {
    id: 'hk_1994_urban_fracture',
    title: '1994 都市裂缝',
    dateLabel: '1994年7月',
    time: { year: 1994, month: 7, day: 8, hour: 17, minute: 45 },
    summary: '繁荣外表下，地产、传媒、夜场、社团和警队纪律压力互相牵动。',
    detail:
      '城市更现代，也更敏感。媒体与公众舆论会放大冲突，地产和娱乐业带来的金钱流动让人情更难判断。玩家更容易卷入"看似日常、背后有人"的社会事件。',
    tags: ['媒体压力', '地产利益', '夜场经济']
  },
  {
    id: 'hk_1996_handover_eve',
    title: '1996 移交前夜',
    dateLabel: '1996年11月',
    time: { year: 1996, month: 11, day: 1, hour: 22, minute: 5 },
    summary: '回归前夜，忠诚、身份、资源和安全感成为城市里更尖锐的问题。',
    detail:
      '许多人开始为自己和家人安排后路，也有人趁不确定性加速下注。警队内部、政府部门、社团、商界和媒体都更警惕，事件不一定更大，但每个选择更容易被解读。',
    tags: ['回归前夜', '身份抉择', '风险升温']
  }
];

export const identityOpeningOptions: IdentityOpeningOption[] = [
  {
    id: 'civilian',
    title: '普通市民',
    summary: '没有正式执法身份，从家庭、工作、街坊和城市压力进入故事。',
    detail: '你不天然拥有权力，也不天然被组织保护。冲突更多来自生活、钱、人情、工作和身边人的牵连。'
  },
  {
    id: 'police',
    title: '警察',
    summary: '以警队身份切入社会冲突，拥有有限权力，也承担纪律和组织压力。',
    detail: '你不是流程机器，而是一个穿着制服的人。你的警阶、部门和岗位会影响 LLM 如何理解你的权限、接触面和日常压力。'
  },
  {
    id: 'gang_member',
    title: '社团分子',
    summary: '站在灰色网络内部，看见街面、人情和利益如何运转。',
    detail: '你可能有地盘、人情和规矩，却更容易被警方、对家、上层和自己人牵制。正式档案后续再细化。'
  }
];

export const civilianOpeningProfileOptions: CivilianOpeningProfileOption[] = [
  {
    id: 'tea_restaurant_clerk',
    label: '茶餐厅伙计',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '旺角茶餐厅伙计',
    workplacePlaceId: 'place_fa_yuen_street',
    workplaceLabel: '花园街一带茶餐厅',
    employerOrganizationId: 'org_opening_fa_yuen_tea_house',
    employerName: '花园街街坊茶餐厅',
    employerOrganizationType: 'business',
    employerRelationType: 'employee',
    employerRelationSummary: '负责楼面、外卖和轮班杂务，是街坊与熟客都认得的伙计。',
    suggestedMonthlyIncome: 1800,
    incomeKind: 'salary',
    communitySummary: '熟悉同区街坊、外卖仔、摊贩和轮班客，消息来得快，也容易被人托话。',
    familyEconomicSummary: '收入不高，每月要交家用，家里经不起突然失业或大笔开支。',
    legalStatusSummary: '普通受雇市民，没有执法权或组织保护。',
    policeEntrySeeds: ['在街面事件中协助警员或成为关键证人。', '因需要稳定收入而留意纪律部队招募。'],
    triadEntrySeeds: ['店铺受到收数、看场或保护费关系牵连。', '熟客请玩家替街面人物传一次话。']
  },
  {
    id: 'factory_worker',
    label: '工厂职员',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '观塘电子厂职员',
    workplacePlaceId: 'place_kwun_tong_industrial_area',
    workplaceLabel: '观塘工业区',
    employerOrganizationId: 'org_opening_kwun_tong_electronics_factory',
    employerName: '观塘华生电子厂',
    employerOrganizationType: 'business',
    employerRelationType: 'employee',
    employerRelationSummary: '在生产与包装线轮班，日常接触工友、管工和货运人员。',
    suggestedMonthlyIncome: 2200,
    incomeKind: 'salary',
    communitySummary: '与工友、包工头、货运司机和附近廉价食肆保持日常关系。',
    familyEconomicSummary: '依赖加班费维持家庭开支，最怕工伤、欠薪和厂房突然停工。',
    legalStatusSummary: '普通受雇市民，劳资纠纷只能通过工会、投诉或私人关系解决。',
    policeEntrySeeds: ['工伤或失窃事件让玩家反复接触警署。', '一名警员看中玩家观察与应变能力。'],
    triadEntrySeeds: ['货运与外判关系带来灰色跑腿机会。', '工友欠债后请求玩家找街面人物帮忙。']
  },
  {
    id: 'market_transport_helper',
    label: '果栏运输帮工',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '油麻地果栏运输帮工',
    workplacePlaceId: 'place_yau_ma_tei_fruit_market',
    workplaceLabel: '油麻地果栏',
    employerOrganizationId: 'org_opening_yau_ma_tei_logistics_firm',
    employerName: '油麻地利顺运输行',
    employerOrganizationType: 'business',
    employerRelationType: 'contractor',
    employerRelationSummary: '以按更散工方式替运输行搬运和跟车，没有固定月薪。',
    communitySummary: '认识夜班工人、货车司机、批发商和附近食肆，作息与普通市民相反。',
    familyEconomicSummary: '按更和散工收入不稳，家中常为医药费、学费或欠债发愁。',
    legalStatusSummary: '普通散工，没有正式组织权力，容易在纠纷中成为证人或被怀疑对象。',
    policeEntrySeeds: ['夜班目击与货物流向使玩家成为警方常见联系人。', '协助一次紧急事件后获得报考或推荐线索。'],
    triadEntrySeeds: ['有人要求夹带一批来历不明的货。', '果栏地盘与收数纠纷迫使玩家选择靠山。']
  },
  {
    id: 'media_runner',
    label: '传媒跑腿',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '广播道传媒助理',
    workplacePlaceId: 'place_broadcast_drive',
    workplaceLabel: '广播道',
    employerOrganizationId: 'org_tvb',
    employerName: '电视广播有限公司（TVB）',
    employerOrganizationType: 'media',
    employerRelationType: 'employee',
    employerRelationSummary: '在制作部门处理送片、通告和场务跑腿，能接触消息但没有采编权限。',
    suggestedMonthlyIncome: 2200,
    incomeKind: 'salary',
    communitySummary: '接触记者、场务、司机、艺人助理和消息灵通的茶水间。',
    familyEconomicSummary: '工作看似体面但职位不稳，家庭希望玩家尽快找到更可靠的前途。',
    legalStatusSummary: '普通传媒雇员，可接触消息但没有调查或执法权限。',
    policeEntrySeeds: ['因新闻线索与警方公共关系或一线警员接触。', '掌握的一段资料使玩家成为协助调查者。'],
    triadEntrySeeds: ['娱乐圈外围人物要求压下或传递消息。', '夜场与制作关系带来人情债。']
  },
  {
    id: 'nightlife_staff',
    label: '夜场职员',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '湾仔夜场侍应',
    workplacePlaceId: 'place_wan_chai_lockhart_road_bars',
    workplaceLabel: '湾仔骆克道夜场区',
    employerOrganizationId: 'org_opening_lockhart_road_nightclub',
    employerName: '骆克道金夜会',
    employerOrganizationType: 'entertainment',
    employerRelationType: 'employee',
    employerRelationSummary: '负责楼面接待与酒水服务，熟悉领班、常客和看场人员。',
    suggestedMonthlyIncome: 2600,
    incomeKind: 'salary',
    communitySummary: '熟悉领班、看场、酒客、的士司机和当值警员，但多数关系只停留在点头之交。',
    familyEconomicSummary: '夜班收入尚可，却要承受家人不理解和工作随时出事的风险。',
    legalStatusSummary: '普通夜场雇员，容易接近冲突与秘密，但没有任何正式保护。',
    policeEntrySeeds: ['处理醉客或报案时与当值警员建立信任。', '愿意提供消息后获得线人或招募方向。'],
    triadEntrySeeds: ['看场人物从小事开始要求帮忙。', '为保护同事或家人接受街面关系的帮助。']
  },
  {
    id: 'bank_employee',
    label: '银行职员',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '汇丰银行文员',
    workplacePlaceId: 'place_hsbc_main_building',
    workplaceLabel: '中环汇丰总行',
    employerOrganizationId: 'org_hsbc',
    employerName: '香港上海汇丰银行',
    employerOrganizationType: 'finance',
    employerRelationType: 'employee',
    employerRelationSummary: '处理柜面后勤、文件与客户资料，知道制度流程但没有信贷决定权。',
    suggestedMonthlyIncome: 3200,
    incomeKind: 'salary',
    communitySummary: '接触银行同事、客户、商户会计和中环通勤圈，消息更偏向账面与商业往来。',
    familyEconomicSummary: '收入较稳定，家庭对体面职业和晋升抱有期待，也更难承受失职或信用风险。',
    legalStatusSummary: '普通银行雇员，受内部保密和合规要求约束，没有调查或冻结账户权限。',
    policeEntrySeeds: ['可疑票据或客户纠纷使玩家协助警方核实事实。', '稳定职业背景让报考纪律部队成为现实选择。'],
    triadEntrySeeds: ['熟人试探玩家能否查询不该公开的账户消息。', '商户客户的债务关系把玩家拖入一次人情请求。']
  },
  {
    id: 'property_company_employee',
    label: '地产公司职员',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '长江实业行政职员',
    workplacePlaceId: 'place_admiralty_commercial_district',
    workplaceLabel: '金钟商业区',
    employerOrganizationId: 'org_cheung_kong_group',
    employerName: '长江实业',
    employerOrganizationType: 'property',
    employerRelationType: 'employee',
    employerRelationSummary: '处理租务、项目与行政文件，只接触自身职级范围内的业务资料。',
    suggestedMonthlyIncome: 3500,
    incomeKind: 'salary',
    communitySummary: '接触租客、承办商、地产代理和办公室同事，容易听见地盘、租约和融资风声。',
    familyEconomicSummary: '收入稳定但工作压力较高，家庭将这份职业视作向上流动机会。',
    legalStatusSummary: '普通地产公司雇员，没有土地审批、执法或集团决策权限。',
    policeEntrySeeds: ['租务纠纷或地盘事件让玩家成为资料联系人。', '一次协助查证使警员注意到玩家的文件能力。'],
    triadEntrySeeds: ['承办商希望玩家替某份文件加快流转。', '收楼或租务冲突引来街面中间人。']
  },
  {
    id: 'news_production_staff',
    label: '记者／制作人员',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '亚洲电视新闻制作助理',
    workplacePlaceId: 'place_atv_broadcast_drive',
    workplaceLabel: '广播道亚洲电视',
    employerOrganizationId: 'org_atv',
    employerName: '亚洲电视',
    employerOrganizationType: 'media',
    employerRelationType: 'employee',
    employerRelationSummary: '参与采访联络、资料整理与制作流程，能追线索但不能代表机构作最终决定。',
    suggestedMonthlyIncome: 3600,
    incomeKind: 'salary',
    communitySummary: '接触记者、摄影、编辑、艺员宣传和消息人士，线索多但真假需要核实。',
    familyEconomicSummary: '职业有吸引力但工时不定，家庭担心玩家卷入敏感报道或失去稳定生活。',
    legalStatusSummary: '普通传媒从业者，没有执法权；采访与公开资料不等于可随意侵犯私隐。',
    policeEntrySeeds: ['采访现场的合作让玩家与警方建立工作关系。', '一条可靠线索使玩家成为案件协助者。'],
    triadEntrySeeds: ['有人要求搁置一段不利报道。', '娱乐与夜场消息源提出带条件的交换。']
  },
  {
    id: 'secondary_school_teacher',
    label: '中学教师',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '九龙区中学教师',
    workplacePlaceId: 'place_mtr_kowloon_tong_station',
    workplaceLabel: '九龙塘一所中学',
    employerOrganizationId: 'org_opening_kowloon_secondary_school',
    employerName: '九龙明德中学',
    employerOrganizationType: 'public_service',
    employerRelationType: 'employee',
    employerRelationSummary: '负责日常教学与学生事务，是学校普通教员而非校方管理层。',
    suggestedMonthlyIncome: 3800,
    incomeKind: 'salary',
    communitySummary: '与学生、家长、同事和社区青年接触密切，对家庭压力和街区变化较敏感。',
    familyEconomicSummary: '薪水稳定且社会观感良好，但家庭会在意名声、纪律和职业风险。',
    legalStatusSummary: '普通教师，对学生负有照顾责任，没有警方或社会福利机构权限。',
    policeEntrySeeds: ['学生卷入街面事件后，玩家协助警方与家庭沟通。', '社区工作使警员认可玩家的判断与责任感。'],
    triadEntrySeeds: ['旧生或家长请求玩家调解一场街面麻烦。', '有人试图利用学校关系接近某个家庭。']
  },
  {
    id: 'hospital_nurse',
    label: '护士',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '伊利沙伯医院护士',
    workplacePlaceId: 'place_queen_elizabeth_hospital',
    workplaceLabel: '伊利沙伯医院',
    employerOrganizationId: 'org_queen_elizabeth_hospital',
    employerName: '伊利沙伯医院',
    employerOrganizationType: 'public_service',
    employerRelationType: 'employee',
    employerRelationSummary: '承担病房与轮班护理工作，能确认亲历的医疗流程但受病人私隐约束。',
    suggestedMonthlyIncome: 3600,
    incomeKind: 'salary',
    communitySummary: '接触医护、病人、家属、救护与警员，常看见事件发生后的真实代价。',
    familyEconomicSummary: '收入稳定但轮班辛苦，家庭既依赖这份工作，也担心长期劳累。',
    legalStatusSummary: '普通医护人员，没有执法权，病历与病人资料必须受职业边界约束。',
    policeEntrySeeds: ['伤者案件使玩家与调查警员多次配合。', '紧急处置中的表现带来纪律部队招募线索。'],
    triadEntrySeeds: ['伤者同伴试探玩家能否隐瞒来历。', '街面人物因一份人情而请求特殊照顾。']
  },
  {
    id: 'import_export_officer',
    label: '进出口公司业务员',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '尖沙咀进出口公司业务员',
    workplacePlaceId: 'place_harbour_city',
    workplaceLabel: '尖沙咀商业区',
    employerOrganizationId: 'org_opening_import_export_company',
    employerName: '海联进出口贸易公司',
    employerOrganizationType: 'business',
    employerRelationType: 'employee',
    employerRelationSummary: '负责订单、货运文件与客户联络，能接触业务资料但不是公司老板。',
    suggestedMonthlyIncome: 3400,
    incomeKind: 'salary',
    communitySummary: '与船务、货仓、司机、客户和报关行往来，对货物流向和跨境消息较敏感。',
    familyEconomicSummary: '收入尚算稳定，却受订单与汇率波动影响，家庭担心公司突然裁员或倒闭。',
    legalStatusSummary: '普通贸易公司雇员，没有海关、警务或口岸管理权限。',
    policeEntrySeeds: ['异常货单使玩家协助警方核对运输事实。', '熟悉文书与路线让玩家获得进一步接触。'],
    triadEntrySeeds: ['客户要求替一批货跳过正常核验。', '运输中间人以旧人情换取一次方便。']
  },
  {
    id: 'law_firm_employee',
    label: '律师楼职员',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '中环律师楼文员',
    workplacePlaceId: 'place_central_magistracy',
    workplaceLabel: '中环法律事务区',
    employerOrganizationId: 'org_opening_central_law_firm',
    employerName: '何梁律师事务所',
    employerOrganizationType: 'legal',
    employerRelationType: 'employee',
    employerRelationSummary: '处理档案、排期和客户联络，不等同于执业律师，也没有独立法律代表权。',
    suggestedMonthlyIncome: 3000,
    incomeKind: 'salary',
    communitySummary: '接触律师、当事人、法院文员与警方文件，能听见纠纷但受保密义务约束。',
    familyEconomicSummary: '工作体面但升迁取决于资历与能力，家人期待玩家维持稳定名声。',
    legalStatusSummary: '律师楼普通职员，不是法官、检控官或执业律师，不能凭职业自动取得秘密材料。',
    policeEntrySeeds: ['案件文件往来让玩家认识调查警员。', '一次可靠协助形成报考或文职转入的契机。'],
    triadEntrySeeds: ['当事人试图通过玩家打听不应公开的案情。', '街面中间人要求替某人加快一次联络。']
  },
  {
    id: 'hospitality_assistant_manager',
    label: '餐饮副经理',
    occupationGroup: 'management',
    employmentStatus: 'employed',
    publicOccupation: '美心餐饮副经理',
    workplacePlaceId: 'place_admiralty_commercial_district',
    workplaceLabel: '金钟商业区餐厅',
    employerOrganizationId: 'org_maxims',
    employerName: '美心集团',
    employerOrganizationType: 'business',
    employerRelationType: 'manager',
    employerRelationSummary: '负责一处分店的轮班、人手与顾客事务，权限止于门店日常管理。',
    suggestedMonthlyIncome: 4500,
    incomeKind: 'salary',
    communitySummary: '接触员工、供应商、熟客和商场管理人员，能调动有限人手但仍受区域经理约束。',
    familyEconomicSummary: '收入较好，家庭期待玩家继续升职，也更依赖这份稳定现金流。',
    legalStatusSummary: '中层门店管理人员，没有集团决策、执法或行业监管权限。',
    policeEntrySeeds: ['门店纠纷与失窃处理带来稳定警务接触。', '管理与应变能力使警员提出报考建议。'],
    triadEntrySeeds: ['供应或看场关系试图影响门店安排。', '有人要求给特定客人或货物行方便。']
  },
  {
    id: 'department_store_supervisor',
    label: '百货公司部门主管',
    occupationGroup: 'management',
    employmentStatus: 'employed',
    publicOccupation: '永安百货部门主管',
    workplacePlaceId: 'place_causeway_bay_shopping_streets',
    workplaceLabel: '铜锣湾商业区',
    employerOrganizationId: 'org_wing_on_department_store',
    employerName: '永安百货',
    employerOrganizationType: 'business',
    employerRelationType: 'manager',
    employerRelationSummary: '负责一个销售部门的人手、货品与顾客投诉，没有公司层面的采购或财务权。',
    suggestedMonthlyIncome: 4000,
    incomeKind: 'salary',
    communitySummary: '接触售货员、顾客、保安、供货商与商场同行，对零售纠纷和消费风向敏感。',
    familyEconomicSummary: '固定薪水让家庭稍有余裕，但失货、投诉或人事事故会直接影响职位。',
    legalStatusSummary: '百货中层主管，能处理部门事务但没有执法或公司高层权限。',
    policeEntrySeeds: ['失窃或诈骗案件让玩家持续配合警方。', '一次危机处置建立与辖区警员的信任。'],
    triadEntrySeeds: ['供货商提出带条件的便利请求。', '街面人物试图介入部门的临时用工或运输。']
  },
  {
    id: 'small_company_manager',
    label: '小公司经理',
    occupationGroup: 'management',
    employmentStatus: 'employed',
    publicOccupation: '旺角小型贸易公司经理',
    workplacePlaceId: 'place_fa_yuen_street',
    workplaceLabel: '旺角商业楼宇',
    employerOrganizationId: 'org_opening_mong_kok_small_company',
    employerName: '旺角联发商行',
    employerOrganizationType: 'business',
    employerRelationType: 'manager',
    employerRelationSummary: '负责十余人的订单、收支和客户关系，仍要向东主交代。',
    suggestedMonthlyIncome: 5000,
    incomeKind: 'salary',
    communitySummary: '接触小商户、客户、会计、司机与银行职员，人情和现金流比制度更直接。',
    familyEconomicSummary: '收入高于普通文员，但公司抗风险能力有限，坏账或东主变卦都可能断薪。',
    legalStatusSummary: '小企业受雇经理，不是公司最终所有人，也没有公共权力。',
    policeEntrySeeds: ['商业纠纷或诈骗案让玩家主动求助警方。', '处理风险时展现的能力带来警队入口。'],
    triadEntrySeeds: ['客户欠款使东主考虑借助街面收数。', '有人以保护生意为名要求长期回报。']
  },
  {
    id: 'hospital_doctor',
    label: '医院医生／住院医生',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '玛丽医院住院医生',
    workplacePlaceId: 'place_queen_mary_hospital',
    workplaceLabel: '玛丽医院',
    employerOrganizationId: 'org_queen_mary_hospital',
    employerName: '玛丽医院',
    employerOrganizationType: 'public_service',
    employerRelationType: 'employee',
    employerRelationSummary: '在病房与当值体系内承担诊疗工作，仍受专科、上级医生、病历和医院程序约束。',
    workUnitSummary: '病房与当值医疗组',
    positionSummary: '住院医生',
    dutySummary: '处理当值病人、病历、会诊联络与医疗交接。',
    decisionScopeSummary: '可在自身资历和当值范围内作临床判断；重大处置、资源和敏感披露需经上级及医院程序。',
    accessSummary: '接触职责范围内的病人、病历、医护交接和必要外部查询。',
    sectorIds: ['medical', 'public_service'],
    roleTags: ['doctor', 'shift_work', 'patient_contact'],
    suggestedMonthlyIncome: 6500,
    incomeKind: 'salary',
    communitySummary: '长期接触医护、病人、家属、救护人员和调查警员，也会面对专业保密边界。',
    familyEconomicSummary: '收入较稳定但工时和责任沉重，家庭对职业前途与名声抱有很高期待。',
    legalStatusSummary: '受医疗职责、病人私隐和医院程序约束，没有警方调查权。',
    policeEntrySeeds: ['案件伤者和法医联络使玩家与警队形成稳定专业接触。'],
    triadEntrySeeds: ['有人试探玩家能否为一名来历敏感的伤者提供额外便利。']
  },
  {
    id: 'social_worker',
    label: '社会工作者',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '保良局社会工作者',
    workplacePlaceId: 'place_causeway_bay_shopping_streets',
    workplaceLabel: '保良局服务单位',
    employerOrganizationId: 'org_po_leung_kuk',
    employerName: '保良局',
    employerOrganizationType: 'public_service',
    employerRelationType: 'employee',
    employerRelationSummary: '负责家庭与社区个案、转介和探访，受保密、资源和服务程序限制。',
    workUnitSummary: '家庭及社区服务组',
    positionSummary: '社会工作者',
    dutySummary: '进行个案联络、家庭探访、资源转介与服务记录。',
    decisionScopeSummary: '可安排一般联络和建议转介；强制措施、重大资源和敏感资料披露不由个人决定。',
    accessSummary: '接触职责范围内的家庭、学校、医院与社会服务转介资料。',
    sectorIds: ['social_service', 'charity', 'community'],
    roleTags: ['social_worker', 'case_contact', 'family_service'],
    suggestedMonthlyIncome: 4200,
    incomeKind: 'salary',
    communitySummary: '接触家庭、学校、医院、街坊和政府服务人员，常处在人情与制度之间。',
    familyEconomicSummary: '薪金稳定但工作情绪压力大，家人未必理解个案保密和不定时探访。',
    legalStatusSummary: '社会服务人员没有执法权，个案资料受到职业边界保护。',
    policeEntrySeeds: ['家庭个案与青少年事件使玩家和辖区警员反复协调。'],
    triadEntrySeeds: ['服务对象的街面关系试图通过玩家打听或影响个案。']
  },
  {
    id: 'private_clinic_assistant',
    label: '私人诊所助理',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '旺角私人诊所助理',
    workplacePlaceId: 'place_fa_yuen_street',
    workplaceLabel: '旺角私人诊所',
    employerOrganizationId: 'org_opening_mong_kok_private_clinic',
    employerName: '仁康西医诊所',
    employerOrganizationType: 'public_service',
    employerRelationType: 'employee',
    employerRelationSummary: '负责预约、接待、收费和一般文书，不具医生诊断权。',
    workUnitSummary: '诊所接待与文书',
    positionSummary: '诊所助理',
    dutySummary: '处理预约、病人接待、收费和转介联络。',
    decisionScopeSummary: '可处理一般预约和接待；诊断、处方、病历披露与特殊减免需由医生决定。',
    accessSummary: '接触预约、接待所需资料和附近药房、化验所联络。',
    sectorIds: ['medical', 'small_employer'],
    roleTags: ['clinic_assistant', 'customer_contact', 'document_access'],
    suggestedMonthlyIncome: 2400,
    incomeKind: 'salary',
    communitySummary: '认识附近街坊、病人、药房职员和诊所医生，容易听到家庭健康与街区消息。',
    familyEconomicSummary: '收入普通，诊所生意和医生决定会直接影响排班与工作稳定。',
    legalStatusSummary: '普通诊所雇员，没有诊断、处方或执法权限。',
    policeEntrySeeds: ['伤者或警方查询让玩家成为程序联络人。'],
    triadEntrySeeds: ['有人要求隐瞒一名伤者的就诊或身份。']
  },
  {
    id: 'hotel_staff',
    label: '酒店前台／房务职员',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '尖沙咀酒店前台职员',
    workplacePlaceId: 'place_harbour_city',
    workplaceLabel: '尖沙咀酒店区',
    employerOrganizationId: 'org_opening_tsim_sha_tsui_hotel',
    employerName: '海港华都酒店',
    employerOrganizationType: 'business',
    employerRelationType: 'employee',
    employerRelationSummary: '处理住客接待、房态与跨班交接，敏感住客资料受酒店程序限制。',
    workUnitSummary: '前台与房务联络',
    positionSummary: '酒店前台职员',
    dutySummary: '处理入住、住客要求、房态联络和当值记录。',
    decisionScopeSummary: '可处理一般住客要求；退款、保安介入、长期住宿和资料披露需上级决定。',
    accessSummary: '接触当值住客、房态、旅行社和酒店内部联络资料。',
    sectorIds: ['hotel', 'tourism', 'hospitality'],
    roleTags: ['front_desk', 'shift_work', 'guest_contact'],
    suggestedMonthlyIncome: 3000,
    incomeKind: 'salary',
    communitySummary: '接触住客、旅行社、的士司机、保安和夜班服务人员，消息跨越本地与外地。',
    familyEconomicSummary: '轮班收入尚算稳定，但投诉、淡旺季和酒店人事会直接影响职位。',
    legalStatusSummary: '酒店普通职员，没有入境、警务或无条件披露住客资料的权限。',
    policeEntrySeeds: ['住客失踪、失窃或冲突使玩家配合警方核实当值事实。'],
    triadEntrySeeds: ['有人要求为特定住客、房间或行李提供不合程序的方便。']
  },
  {
    id: 'mtr_station_staff',
    label: '地铁站务员',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '地下铁路站务员',
    workplacePlaceId: 'place_mtr_admiralty_station',
    workplaceLabel: '金钟地铁站',
    employerOrganizationId: 'org_mtrc',
    employerName: '地下铁路公司',
    employerOrganizationType: 'transport',
    employerRelationType: 'employee',
    employerRelationSummary: '在车站轮班处理乘客服务、秩序、失物和事故初报。',
    workUnitSummary: '车站当值组',
    positionSummary: '站务员',
    dutySummary: '处理乘客服务、站内巡查、失物、设备初报与交班。',
    decisionScopeSummary: '可处理一般乘客问题；封站、重大调度、警方行动与工程决定须交上级。',
    accessSummary: '接触本站当值记录、乘客服务资料和必要的维修、警方联络。',
    sectorIds: ['transport', 'rail', 'public_utility'],
    roleTags: ['station_staff', 'shift_work', 'passenger_contact'],
    suggestedMonthlyIncome: 3200,
    incomeKind: 'salary',
    communitySummary: '每天接触通勤乘客、车务、维修、保安和警员，能看见城市流动中的异常。',
    familyEconomicSummary: '工作和收入相对稳定，但轮班、事故与公众投诉会影响家庭生活。',
    legalStatusSummary: '公共交通雇员，没有警方拘捕或全线调度权限。',
    policeEntrySeeds: ['站内事故和失窃处理让玩家与交通警务人员建立合作。'],
    triadEntrySeeds: ['有人试图利用站务关系寻找目标、物品或非公开路线信息。']
  },
  {
    id: 'utility_technician',
    label: '公用事业维修员',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '中华电力维修技术员',
    workplacePlaceId: 'place_kwun_tong_industrial_area',
    workplaceLabel: '九龙区维修与客户现场',
    employerOrganizationId: 'org_clp',
    employerName: '中华电力',
    employerOrganizationType: 'business',
    employerRelationType: 'employee',
    employerRelationSummary: '按派工处理设备检查与维修，受安全程序、值班调度和工程权限约束。',
    workUnitSummary: '九龙维修组',
    positionSummary: '维修技术员',
    dutySummary: '执行检查、报修响应、设备记录和现场交接。',
    decisionScopeSummary: '可按程序处理职责范围内故障；停送电、重大工程和事故责任由上级及专业链决定。',
    accessSummary: '接触派工、设备、客户现场和必要承办商联络。',
    sectorIds: ['utility', 'electricity', 'engineering'],
    roleTags: ['technician', 'field_work', 'maintenance'],
    suggestedMonthlyIncome: 3800,
    incomeKind: 'salary',
    communitySummary: '经常进入住宅、工厂和商户现场，认识客户、承办商、物业人员和紧急服务人员。',
    familyEconomicSummary: '技术工作收入稳定，但夜间抢修和安全风险会牵动家庭。',
    legalStatusSummary: '公用事业技术员没有执法权，也不能凭职业随意进入私人处所。',
    policeEntrySeeds: ['事故现场和可疑破坏使玩家与警方共同核实情况。'],
    triadEntrySeeds: ['有人要求借维修身份进入不应进入的场所。']
  },
  {
    id: 'insurance_agent',
    label: '保险业务员',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '中环保险业务员',
    workplacePlaceId: 'place_admiralty_commercial_district',
    workplaceLabel: '中环保险代理行',
    employerOrganizationId: 'org_opening_central_insurance_agency',
    employerName: '安泰保险代理行',
    employerOrganizationType: 'business',
    employerRelationType: 'contractor',
    employerRelationSummary: '依靠佣金开发与维护客户，受公司核保、文件和合规程序限制。',
    workUnitSummary: '个人保险业务组',
    positionSummary: '保险业务员',
    dutySummary: '联系客户、说明产品、收集资料并跟进保单。',
    decisionScopeSummary: '可安排客户联络；承保、理赔和例外审批不由个人决定。',
    accessSummary: '接触本人客户、申请文件和公司提供的业务资料。',
    sectorIds: ['finance', 'insurance', 'professional_service'],
    roleTags: ['agent', 'commission_income', 'client_contact'],
    suggestedMonthlyIncome: 3500,
    communitySummary: '客户关系横跨家庭、小商户和办公室，工作依赖信任、介绍和持续联络。',
    familyEconomicSummary: '佣金收入起伏明显，家庭会在意业绩、体面和每月现金流。',
    legalStatusSummary: '保险代理没有银行、警方或公司核保部门的决定权。',
    policeEntrySeeds: ['可疑理赔或客户资料争议使玩家协助调查。'],
    triadEntrySeeds: ['客户要求用不实资料投保或把赔款安排给第三人。']
  },
  {
    id: 'accounting_clerk',
    label: '会计文员',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '中环会计师楼文员',
    workplacePlaceId: 'place_admiralty_commercial_district',
    workplaceLabel: '中环专业办公室',
    employerOrganizationId: 'org_opening_central_accounting_office',
    employerName: '陈何会计师事务所',
    employerOrganizationType: 'business',
    employerRelationType: 'employee',
    employerRelationSummary: '处理凭证、客户文件和账目整理，不具签署审计意见或替客户作决定的权限。',
    workUnitSummary: '客户账目组',
    positionSummary: '会计文员',
    dutySummary: '整理凭证、录入账目、核对文件并联络客户补件。',
    decisionScopeSummary: '可处理常规账目整理；审计结论、税务意见和异常处理需专业人员决定。',
    accessSummary: '接触所负责客户的账目、凭证和必要银行文件。',
    sectorIds: ['accounting', 'professional_service', 'finance'],
    roleTags: ['clerk', 'document_access', 'client_contact'],
    suggestedMonthlyIncome: 3200,
    incomeKind: 'salary',
    communitySummary: '接触小公司东主、银行职员、律师楼和客户文员，能看见账面异常但受保密约束。',
    familyEconomicSummary: '固定薪水较稳，晋升依赖资历和专业考试。',
    legalStatusSummary: '普通会计文员不是执业会计师，也没有调查权。',
    policeEntrySeeds: ['账目争议或商业诈骗让玩家成为文件证人。'],
    triadEntrySeeds: ['客户试探玩家能否改动、藏起或延后某份凭证。']
  },
  {
    id: 'property_agent',
    label: '地产代理',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '九龙地产代理',
    workplacePlaceId: 'place_fa_yuen_street',
    workplaceLabel: '旺角地产代理铺',
    employerOrganizationId: 'org_opening_mong_kok_property_agency',
    employerName: '联诚地产代理',
    employerOrganizationType: 'property',
    employerRelationType: 'contractor',
    employerRelationSummary: '依靠放盘、带看和成交佣金工作，受业主、买家、租客和公司负责人牵制。',
    workUnitSummary: '住宅租售组',
    positionSummary: '地产代理',
    dutySummary: '联系业主与客人、安排看楼、核对基本资料并跟进交易。',
    decisionScopeSummary: '可安排联络和看楼；价格、合约、贷款和强制收楼不由个人决定。',
    accessSummary: '接触公开放盘、客户联络和本人经手的交易资料。',
    sectorIds: ['property', 'sales', 'professional_service'],
    roleTags: ['agent', 'commission_income', 'client_contact'],
    suggestedMonthlyIncome: 3800,
    communitySummary: '认识业主、租客、律师楼、银行和装修承办商，也容易卷入租务人情。',
    familyEconomicSummary: '佣金高低不定，市况和成交直接影响家庭收入。',
    legalStatusSummary: '地产代理没有法院、警方或业主的强制权。',
    policeEntrySeeds: ['租务诈骗、失踪租客或纠纷使玩家与警方接触。'],
    triadEntrySeeds: ['收楼或债务人物要求玩家提供租客与业主消息。']
  },
  {
    id: 'construction_site_clerk',
    label: '地盘文员／技工',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '九龙建筑地盘文员',
    workplacePlaceId: 'place_kwun_tong_industrial_area',
    workplaceLabel: '九龙建筑地盘',
    employerOrganizationId: 'org_opening_kowloon_contractor',
    employerName: '利昌建筑工程公司',
    employerOrganizationType: 'business',
    employerRelationType: 'employee',
    employerRelationSummary: '处理出勤、材料、工单和现场联络，受判头、工程人员和承建商程序约束。',
    workUnitSummary: '地盘办公室与物料联络',
    positionSummary: '地盘文员',
    dutySummary: '记录出勤、整理工单、联络物料和转达现场安排。',
    decisionScopeSummary: '可处理常规记录与联络；工程变更、安全停工、付款和用工决定需上级负责。',
    accessSummary: '接触本地盘出勤、物料、承办商和部分工程文件。',
    sectorIds: ['construction', 'contractor', 'property'],
    roleTags: ['site_clerk', 'document_access', 'contractor_contact'],
    suggestedMonthlyIncome: 3000,
    incomeKind: 'salary',
    communitySummary: '接触工人、判头、供应商、司机、物业和地盘附近街坊。',
    familyEconomicSummary: '工程结束、欠款或事故都可能突然影响职位与收入。',
    legalStatusSummary: '地盘普通职员没有工程审批、执法或公司最终付款权限。',
    policeEntrySeeds: ['工伤、失窃或地盘冲突使玩家配合警方查证。'],
    triadEntrySeeds: ['有人要求把特定工人、车辆或物料安排进地盘。']
  },
  {
    id: 'garage_mechanic',
    label: '修车技工',
    occupationGroup: 'frontline',
    employmentStatus: 'employed',
    publicOccupation: '土瓜湾修车技工',
    workplacePlaceId: 'place_to_kwa_wan_workshops',
    workplaceLabel: '土瓜湾车房',
    employerOrganizationId: 'org_opening_to_kwa_wan_garage',
    employerName: '永利汽车维修行',
    employerOrganizationType: 'business',
    employerRelationType: 'employee',
    employerRelationSummary: '负责车辆检查、维修与零件交接，重大报价和客户纠纷由车房东主决定。',
    workUnitSummary: '维修工场',
    positionSummary: '汽车维修技工',
    dutySummary: '检查车辆、执行维修、记录零件和向客户说明已完成工作。',
    decisionScopeSummary: '可判断一般维修方法；重大报价、可疑车辆处理和长期采购需交代东主。',
    accessSummary: '接触送修车辆、零件供应商、车主和本车房工单。',
    sectorIds: ['repair', 'automotive', 'small_employer'],
    roleTags: ['technician', 'manual_work', 'customer_contact'],
    suggestedMonthlyIncome: 3000,
    incomeKind: 'salary',
    communitySummary: '认识司机、车主、零件商、拖车人员和附近车房同行。',
    familyEconomicSummary: '技术收入靠经验和车房生意，受工伤、零件与东主决定影响。',
    legalStatusSummary: '维修技工没有交通执法权，也不能凭职业占有客户车辆。',
    policeEntrySeeds: ['可疑车辆、交通事故或零件来源让玩家协助警方。'],
    triadEntrySeeds: ['有人要求改装、隐藏或处理来历不明的车辆。']
  },
  {
    id: 'kindergarten_tutor',
    label: '幼稚园／补习教师',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '九龙补习教师',
    workplacePlaceId: 'place_mtr_kowloon_tong_station',
    workplaceLabel: '九龙塘补习社',
    employerOrganizationId: 'org_opening_kowloon_tutorial_school',
    employerName: '启明补习社',
    employerOrganizationType: 'public_service',
    employerRelationType: 'employee',
    employerRelationSummary: '负责课程、学生和家长联络，受负责人、招生和教育责任约束。',
    workUnitSummary: '中小学补习班',
    positionSummary: '补习教师',
    dutySummary: '备课、授课、处理学生情况并与家长联络。',
    decisionScopeSummary: '可处理课堂日常；收费、招生、辞退和重大儿童安全问题需负责人介入。',
    accessSummary: '接触所教学生、家长、课程和出勤资料。',
    sectorIds: ['education', 'small_employer'],
    roleTags: ['teacher', 'student_contact', 'parent_contact'],
    suggestedMonthlyIncome: 2800,
    incomeKind: 'salary',
    communitySummary: '接触学生、家长、学校老师和社区青年，对家庭和街区变化较敏感。',
    familyEconomicSummary: '收入普通且受招生影响，家人重视职业名声与稳定。',
    legalStatusSummary: '普通教师没有警方或社会福利机构权限，对学生负有照顾责任。',
    policeEntrySeeds: ['学生安全事件让玩家与家长及警方协作。'],
    triadEntrySeeds: ['旧生或家长的街面关系把求助带到玩家面前。']
  },
  {
    id: 'freelance_reporter_photographer',
    label: '自由记者／摄影师',
    occupationGroup: 'free',
    employmentStatus: 'employed',
    publicOccupation: '自由记者与摄影师',
    workplacePlaceId: 'place_broadcast_drive',
    workplaceLabel: '全港采访现场与临时工作室',
    employerOrganizationId: 'org_opening_freelance_media_network',
    employerName: '自由传媒合作网络',
    employerOrganizationType: 'media',
    employerRelationType: 'contractor',
    employerRelationSummary: '按稿件和委托工作，没有固定编辑部保护，收入与消息来源都不稳定。',
    workUnitSummary: '自由采访与摄影合作',
    positionSummary: '自由记者／摄影师',
    dutySummary: '寻找题材、联络来源、采访拍摄并向不同媒体供稿。',
    decisionScopeSummary: '可决定采访与供稿方式；刊登、法律审查和媒体立场由采用稿件的机构决定。',
    accessSummary: '依赖公开现场、个人来源、临时委托和自行建立的职业关系。',
    sectorIds: ['media', 'freelance', 'photography'],
    roleTags: ['reporter', 'photographer', 'source_contact', 'irregular_income'],
    communitySummary: '接触记者、编辑、冲印店、艺人宣传、警方联系人和街头消息来源。',
    familyEconomicSummary: '收入随委托起伏，器材、交通和生活开支持续造成压力。',
    legalStatusSummary: '自由传媒工作者没有执法权，采访也不等于可以侵犯私隐或闯入受限场所。',
    policeEntrySeeds: ['可靠现场记录和长期采访接触使玩家成为警方熟悉的协作者。'],
    triadEntrySeeds: ['有人要求购买、压下或交换一批敏感照片与消息。']
  },
  {
    id: 'community_service_worker',
    label: '社区服务职员',
    occupationGroup: 'professional',
    employmentStatus: 'employed',
    publicOccupation: '香港明爱社区服务职员',
    workplacePlaceId: 'place_sham_shui_po_street_markets',
    workplaceLabel: '深水埗社区服务点',
    employerOrganizationId: 'org_caritas_hk',
    employerName: '香港明爱',
    employerOrganizationType: 'public_service',
    employerRelationType: 'employee',
    employerRelationSummary: '处理社区活动、服务联络和一般转介，不替专业社工或政府部门作决定。',
    workUnitSummary: '社区服务点',
    positionSummary: '社区服务职员',
    dutySummary: '接待居民、联络活动、整理服务资料并协助转介。',
    decisionScopeSummary: '可处理一般服务联络；敏感个案、资源审批和强制措施需专业人员或主管负责。',
    accessSummary: '接触社区居民、合作学校、诊所、慈善和政府服务联络。',
    sectorIds: ['community', 'social_service', 'charity'],
    roleTags: ['community_worker', 'service_contact', 'referral'],
    suggestedMonthlyIncome: 3000,
    incomeKind: 'salary',
    communitySummary: '熟悉区内家庭、街坊、学校、诊所和服务机构，很多问题会先以求助而非案件出现。',
    familyEconomicSummary: '薪金稳定但资源有限，家人会感受到加班、探访和情绪压力。',
    legalStatusSummary: '社区服务职员没有执法或政府审批权，敏感资料受服务边界保护。',
    policeEntrySeeds: ['社区纠纷或家庭安全事件让玩家和辖区警员协调。'],
    triadEntrySeeds: ['街面人物试图借社区关系影响一个家庭或服务安排。']
  },
  {
    id: 'self_employed_merchant',
    label: '自营商户',
    occupationGroup: 'management',
    employmentStatus: 'employed',
    publicOccupation: '花园街自营商户',
    workplacePlaceId: 'place_fa_yuen_street',
    workplaceLabel: '花园街铺位',
    employerOrganizationId: 'org_opening_player_shop',
    employerName: '玩家自营街坊商店',
    employerOrganizationType: 'business',
    employerRelationType: 'owner',
    employerRelationSummary: '经营一间小型街坊店铺，能决定日常营业但资金、人手与牌照都有限。',
    suggestedMonthlyIncome: 4000,
    incomeKind: 'asset_income',
    communitySummary: '与街坊、供货商、其他商户和巡逻警员保持日常往来，店铺是稳定的关系节点。',
    familyEconomicSummary: '收入视生意而定，家庭资产与店铺现金流绑在一起，停业会立刻造成压力。',
    legalStatusSummary: '普通小商户，没有执法权；经营身份也不会自动获得大型企业资源。',
    policeEntrySeeds: ['店铺事件和街坊求助使玩家频繁接触警方。', '维护社区秩序的行动带来报考或协助机会。'],
    triadEntrySeeds: ['保护费或供货纠纷迫使玩家面对街面关系。', '有人提出以人情换取店铺便利。']
  },
  {
    id: 'unemployed',
    label: '无业',
    occupationGroup: 'free',
    employmentStatus: 'unemployed',
    publicOccupation: '暂时无业',
    workplacePlaceId: 'place_fa_yuen_street',
    workplaceLabel: '住处附近与花园街一带',
    communitySummary: '日常接触家人、街坊、劳工介绍所、散工消息和旧同学，时间较自由，但每一笔开支都更敏感。',
    familyEconomicSummary: '当前没有固定薪水，生活依靠积蓄、家人支援或零散工作，求职与家用构成持续压力。',
    legalStatusSummary: '普通无业市民，没有执法权、固定雇主或组织保护。',
    policeEntrySeeds: ['因寻找稳定收入而留意警队或纪律部队招募。', '在社区事件中协助警员后获得进一步接触。'],
    triadEntrySeeds: ['旧友介绍一份看似简单的临时差事。', '经济压力使玩家接触街面中间人，但是否接受仍由玩家决定。']
  },
  {
    id: 'custom_occupation',
    label: '自定义职业',
    occupationGroup: 'free',
    employmentStatus: 'custom',
    publicOccupation: '自定义职业（待填写）',
    workplacePlaceId: 'place_fa_yuen_street',
    workplaceLabel: '自选工作或日常地点',
    communitySummary: '由玩家填写职业与生活接触面，作为后续人物和事件生成的事实锚点。',
    familyEconomicSummary: '收入稳定性与家庭压力应根据玩家填写的职业、出身和开局要求合理生成。',
    legalStatusSummary: '普通市民，没有执法权或组织保护；自定义职业本身不会自动授予额外权限。',
    policeEntrySeeds: ['通过职业接触、报案、证人经历或个人选择逐渐形成警队入口。'],
    triadEntrySeeds: ['通过职业圈子、债务、人情或街面关系逐渐形成社团入口。']
  }
];

interface TriadSocietyOpeningSeed {
  organizationId: string;
  defaultTerritoryPlaceId: string;
}

const triadSocietyOpeningSeeds: TriadSocietyOpeningSeed[] = [
  {
    organizationId: 'org_sun_yee_on',
    defaultTerritoryPlaceId: 'place_portland_street'
  },
  {
    organizationId: 'org_wo_shing_wo',
    defaultTerritoryPlaceId: 'place_temple_street_night_market'
  },
  {
    organizationId: 'org_14k',
    defaultTerritoryPlaceId: 'place_chungking_mansions'
  },
  {
    organizationId: 'org_shui_fong',
    defaultTerritoryPlaceId: 'place_portland_street'
  },
  {
    organizationId: 'org_wo_hop_to',
    defaultTerritoryPlaceId: 'place_yau_ma_tei_fruit_market'
  }
];

export const triadSocietyOptions: TriadSocietyOption[] = triadSocietyOpeningSeeds.map((seed) => {
  const organization = hkLateColonialTriadOrganizations.find((item) => item.organizationId === seed.organizationId);
  if (!organization) {
    throw new Error(`Missing triad organization anchor: ${seed.organizationId}`);
  }
  if (!organization.territoryPlaceIds.includes(seed.defaultTerritoryPlaceId)) {
    throw new Error(`Default triad territory is not registered on ${seed.organizationId}: ${seed.defaultTerritoryPlaceId}`);
  }
  return {
    id: organization.organizationId,
    label: organization.displayName,
    organizationId: organization.organizationId,
    societyName: organization.displayName,
    networkSummary: organization.promptSafeProfile,
    territoryPlaceIds: [...organization.territoryPlaceIds],
    defaultTerritoryPlaceId: seed.defaultTerritoryPlaceId
  };
});

export const triadRankOptions: TriadRankOption[] = [
  {
    id: 'outside_associate',
    label: '外围新人',
    rankSummary: '外围新人',
    authoritySummary: '只能处理上线明确交代的小事，没有固定下属，也无权代表字头作承诺。',
    obligationSummary: '必须先听清交代、按时回报，不得自行把小事升级。',
    riskSummary: '最容易被试探或切割，也最缺乏组织保护。'
  },
  {
    id: 'initiated_member',
    label: '正式成员（四九）',
    rankSummary: '正式成员（四九）',
    authoritySummary: '可独立处理常规街面差事，但没有稳定指挥权，重大决定仍需向上线请示。',
    obligationSummary: '要守口风、交代去向并承担自己接下的差事。',
    riskSummary: '获得有限照应的同时，也开始承担更明确的组织责任。'
  },
  {
    id: 'senior_member',
    label: '资深成员',
    rankSummary: '资深成员',
    authoritySummary: '可带新人、协调少量人手并代表上线处理有限事务，但不能越区调动资源。',
    obligationSummary: '除了完成差事，还要维持手下人与场所的秩序，并为判断失误负责。',
    riskSummary: '警方、对家和内部问责都会直接落到本人身上。'
  },
  {
    id: 'crew_lead',
    label: '小组带头人',
    rankSummary: '小组带头人',
    authoritySummary: '可安排固定小组的当值与具体行动，权限只覆盖所负责的人手和场面。',
    obligationSummary: '必须向上线交代结果、约束手下并控制不必要的警方关注。',
    riskSummary: '手下闯祸、账目出错或场面失控都会被追究到本人。'
  },
  {
    id: 'district_cadre',
    label: '地区中层骨干',
    rankSummary: '地区中层骨干',
    authoritySummary: '可协调本区有限人手、场所和日常资源，但仍受上层授权、账目和地盘边界约束。',
    obligationSummary: '要平衡场所收益、人情、警方压力与内部秩序，并定期向更高层交代。',
    riskSummary: '位置越高，内部竞争、警方关注和决策责任越重；不能把中层权限写成全字头控制权。'
  }
];

export const triadRoleOptions: TriadRoleOption[] = [
  {
    id: 'street_runner',
    label: '传话跑腿',
    roleTitle: '街面传话跑腿',
    summary: '负责认人、带路、传话和不需要上层人物露面的杂事。',
    allowedRanks: ['outside_associate', 'initiated_member']
  },
  {
    id: 'venue_watch',
    label: '场所看场',
    roleTitle: '场所看场',
    summary: '照看一处夜场、档口或娱乐场所的秩序，遇到大事必须先报上线。',
    allowedRanks: ['outside_associate', 'initiated_member', 'senior_member']
  },
  {
    id: 'transport_liaison',
    label: '货运联络',
    roleTitle: '货运联络',
    summary: '联络司机、装卸人手和交收时间，不自动知道货物背后的完整生意。',
    allowedRanks: ['outside_associate', 'initiated_member', 'senior_member', 'crew_lead']
  },
  {
    id: 'collection_liaison',
    label: '收数联络',
    roleTitle: '收数联络',
    summary: '核对欠款、安排见面和回报结果；是否动用威吓或暴力必须受具体授权与代价约束。',
    allowedRanks: ['initiated_member', 'senior_member', 'crew_lead', 'district_cadre']
  },
  {
    id: 'street_action_member',
    label: '行动骨干',
    roleTitle: '街面行动骨干',
    summary: '处理护场、接应与明确交代的行动任务，不是可以随意伤人或袭警的无成本打手。',
    allowedRanks: ['initiated_member', 'senior_member', 'crew_lead']
  },
  {
    id: 'information_contact',
    label: '消息联络',
    roleTitle: '消息联络',
    summary: '在熟人圈收集和转交消息，需要区分传闻、口径与已核实事实。',
    allowedRanks: ['outside_associate', 'initiated_member', 'senior_member']
  },
  {
    id: 'accounts_clerk',
    label: '账目与场务',
    roleTitle: '账目与场务',
    summary: '记录场所收支、轮班和日常开销，只接触职责范围内的账目。',
    allowedRanks: ['initiated_member', 'senior_member', 'crew_lead', 'district_cadre']
  },
  {
    id: 'crew_coordinator',
    label: '小组协调',
    roleTitle: '小组事务协调',
    summary: '安排固定人手、当值与差事先后，不能调动不属于自己的其他小组。',
    allowedRanks: ['crew_lead', 'district_cadre']
  },
  {
    id: 'district_affairs_coordinator',
    label: '地区事务协调',
    roleTitle: '地区事务协调',
    summary: '协调本区若干场所、联系人与日常矛盾，重大利益和跨区行动必须上报。',
    allowedRanks: ['senior_member', 'crew_lead', 'district_cadre']
  }
];

export const triadOpeningProfileOptions: TriadOpeningProfileOption[] = [
  {
    id: 'sun_yee_on_portland_runner',
    label: '新义安 · 砵兰街外围跑腿',
    organizationId: 'org_sun_yee_on',
    societyName: '新义安',
    roleTitle: '砵兰街外围跑腿',
    rankSummary: '外围新人',
    territorySummary: '旺角砵兰街与附近夜场',
    startPlaceId: 'place_portland_street',
    startPlaceLabel: '砵兰街',
    obligationSummary: '替上线传话、接人和处理不值得堂口人物亲自露面的杂事。',
    riskSummary: '没有资格知道完整组织结构，却要面对警方盘问、夜场纠纷和上层试探。'
  },
  {
    id: 'wo_shing_wo_temple_street_runner',
    label: '和胜和 · 庙街外围跑腿',
    organizationId: 'org_wo_shing_wo',
    societyName: '和胜和',
    roleTitle: '庙街外围跑腿',
    rankSummary: '外围新人',
    territorySummary: '庙街与油麻地一带',
    startPlaceId: 'place_temple_street_night_market',
    startPlaceLabel: '庙街夜市',
    obligationSummary: '按旧规矩替上线传话、照看场面并把异常动静及时交代。',
    riskSummary: '叔父辈、对家、警方与街坊人情同时构成压力，不能随意借字头名号压人。'
  },
  {
    id: 'fourteen_k_chungking_contact',
    label: '十四K · 重庆大厦外围联络',
    organizationId: 'org_14k',
    societyName: '十四K',
    roleTitle: '重庆大厦外围联络',
    rankSummary: '外围联络人',
    territorySummary: '尖沙咀重庆大厦与跨境旅客圈',
    startPlaceId: 'place_chungking_mansions',
    startPlaceLabel: '重庆大厦',
    obligationSummary: '替固定上线接应消息、认人和带路，不直接掌握跨区生意。',
    riskSummary: '人员复杂、消息真假难辨，任何越界都可能被警方或内部迅速切割。'
  },
  {
    id: 'shui_fong_nightlife_helper',
    label: '水房 · 砵兰街夜场帮手',
    organizationId: 'org_shui_fong',
    societyName: '和安乐（水房）',
    roleTitle: '砵兰街夜场帮手',
    rankSummary: '外围帮手',
    territorySummary: '砵兰街夜场与附近茶档',
    startPlaceId: 'place_portland_street',
    startPlaceLabel: '砵兰街',
    obligationSummary: '维持熟人场面的体面，遇事先报给上线，不得擅自把小事升级。',
    riskSummary: '旧区人情网看似松散，实际上任何失信、越权或惹警都可能让玩家失去靠山。'
  },
  {
    id: 'wo_hop_to_fruit_market_helper',
    label: '和合图 · 果栏外围帮工',
    organizationId: 'org_wo_hop_to',
    societyName: '和合图',
    roleTitle: '果栏外围帮工',
    rankSummary: '街市外围新人',
    territorySummary: '油麻地果栏与庙街一带',
    startPlaceId: 'place_yau_ma_tei_fruit_market',
    startPlaceLabel: '油麻地果栏',
    obligationSummary: '借日常帮工作掩护，替上线留意货车、人手和外来面孔。',
    riskSummary: '小型堂口资源有限，若事情办砸，玩家很可能被当作可舍弃的外围人物。'
  }
];

export const policeRankOptions: PoliceRankOption[] = [
  { id: 'pc', label: 'Constable（警员 PC）', shortLabel: 'PC' },
  { id: 'spc', label: 'Senior Constable（高级警员 SPC）', shortLabel: 'SPC' },
  { id: 'sergeant', label: 'Sergeant（警长 SGT）', shortLabel: 'SGT' },
  { id: 'station_sergeant', label: 'Station Sergeant（警署警长 SSGT）', shortLabel: 'SSGT' },
  { id: 'probationary_inspector', label: 'Probationary Inspector（见习督察）', shortLabel: 'PI' },
  { id: 'inspector', label: 'Inspector（督察）', shortLabel: 'IP' },
  { id: 'senior_inspector', label: 'Senior Inspector（高级督察 SIP）', shortLabel: 'SIP' },
  { id: 'chief_inspector', label: 'Chief Inspector（总督察 CIP）', shortLabel: 'CIP' }
];

export const policeDepartmentOptions: PoliceDepartmentOption[] = [
  {
    id: 'uniform',
    label: 'Uniform Branch（军装巡逻）',
    summary: '驻扎在警署，外出巡逻、初步处置、日常治安与警区秩序。',
    allowedRanks: ['pc', 'spc', 'sergeant', 'station_sergeant', 'probationary_inspector']
  },
  {
    id: 'cid',
    label: 'Criminal Investigation Department（刑事侦缉处 CID）',
    summary: '案件调查、线索追踪、口供与刑事侦查。',
    allowedRanks: ['pc', 'spc', 'sergeant', 'station_sergeant', 'probationary_inspector', 'inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'traffic',
    label: 'Traffic Branch（交通部）',
    summary: '交通执法、道路巡逻、事故处理与路面管理。',
    allowedRanks: ['pc', 'spc', 'sergeant', 'station_sergeant', 'inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'eu',
    label: 'Emergency Unit（冲锋队 EU）',
    summary: '总区级快速反应军装单位，以冲锋车进行机动巡逻，响应紧急召唤、正在发生的严重罪案、高风险现场和需要快速增援的事件。',
    allowedRanks: [
      'pc',
      'spc',
      'sergeant',
      'station_sergeant',
      'probationary_inspector',
      'inspector',
      'senior_inspector',
      'chief_inspector'
    ]
  },
  {
    id: 'ptu',
    label: 'Police Tactical Unit（机动部队 PTU）',
    summary: '公共秩序、群体事件、内部保安、重大行动与总区后备支援；不是普通 999 召唤的默认冲锋队。',
    allowedRanks: [
      'pc',
      'spc',
      'sergeant',
      'station_sergeant',
      'probationary_inspector',
      'inspector',
      'senior_inspector',
      'chief_inspector'
    ]
  },
  {
    id: 'marine',
    label: 'Marine Police（水警）',
    summary: '海上巡逻、登船检查、走私与偷渡相关处置。',
    allowedRanks: ['pc', 'spc', 'sergeant', 'station_sergeant', 'inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'special_branch',
    label: 'Special Branch（政治部 / 情报）',
    summary: '情报、监视、联络与线人管理；开局只向督察开放。',
    allowedRanks: ['inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'station_duty',
    label: 'Station Duty / Administration（警署值日 / 报案室）',
    summary: '报案室、值日、文书、案件录入与警署内部调度。',
    allowedRanks: ['pc', 'spc', 'sergeant', 'station_sergeant', 'inspector', 'senior_inspector']
  }
];

export const policeRoleOptions: PoliceRoleOption[] = [
  {
    id: 'beat_constable',
    departmentId: 'uniform',
    label: 'Beat Constable（街面巡逻警）',
    summary: '负责固定街段巡逻和街坊接触。',
    allowedRanks: ['pc', 'spc']
  },
  {
    id: 'patrol_constable',
    departmentId: 'uniform',
    label: 'Patrol Constable（巡逻警员）',
    summary: '处理日常巡逻、盘问、初步调停和现场维持。',
    allowedRanks: ['pc', 'spc']
  },
  {
    id: 'response_officer',
    departmentId: 'uniform',
    label: 'Divisional Response Patrol Officer（分区应变巡逻警员）',
    summary: '在所属分区处理普通紧急召唤、街面纠纷和现场初动；属于分区军装巡逻，不是总区冲锋队。',
    allowedRanks: ['pc', 'spc', 'sergeant']
  },
  {
    id: 'sector_patrol',
    departmentId: 'uniform',
    label: 'Sector Patrol Officer（分区巡逻）',
    summary: '在指定片区承担巡逻与初动处置。',
    allowedRanks: ['pc', 'spc', 'sergeant']
  },
  {
    id: 'patrol_supervisor',
    departmentId: 'uniform',
    label: 'Patrol Supervisor（巡逻小组监督）',
    summary: '带领小组，协调巡逻和现场处置。',
    allowedRanks: ['sergeant', 'station_sergeant']
  },
  {
    id: 'patrol_sub_unit_commander',
    departmentId: 'uniform',
    label: 'Patrol Sub-Unit Commander（巡逻小队指挥官）',
    summary: '见习督察的常规前线岗位，负责指挥巡逻小队、协调现场处置，并在资深警署警长协助下熟悉警区运作。',
    allowedRanks: ['probationary_inspector']
  },
  {
    id: 'detective_constable',
    departmentId: 'cid',
    label: 'CID Detective Constable（探员）',
    summary: '参与侦查、走访、记录和线索追踪。',
    allowedRanks: ['pc', 'spc']
  },
  {
    id: 'detective_sergeant',
    departmentId: 'cid',
    label: 'Detective Sergeant（侦缉警长）',
    summary: '协助带队、分派调查动作和管理基层探员。',
    allowedRanks: ['sergeant', 'station_sergeant']
  },
  {
    id: 'team_investigator',
    departmentId: 'cid',
    label: 'Team Investigator（调查小组成员）',
    summary: '进入调查小组，处理线索、口供和现场后续。',
    allowedRanks: ['pc', 'spc', 'sergeant', 'station_sergeant', 'probationary_inspector', 'inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'case_officer',
    departmentId: 'cid',
    label: 'Case Officer（案件负责人）',
    summary: '作为案件推进的主要责任人之一，承担更多汇报和判断压力。',
    allowedRanks: ['inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'serious_crime_member',
    departmentId: 'cid',
    label: 'Serious Crime Unit Member（重案组成员）',
    summary: '参与更敏感或更复杂的刑事调查。',
    allowedRanks: ['sergeant', 'station_sergeant', 'probationary_inspector', 'inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'traffic_constable',
    departmentId: 'traffic',
    label: 'Traffic Constable（交通警员）',
    summary: '负责路面交通秩序和基础执法。',
    allowedRanks: ['pc', 'spc']
  },
  {
    id: 'road_patrol',
    departmentId: 'traffic',
    label: 'Road Patrol Officer（路面巡逻）',
    summary: '在指定道路或区域巡逻，处理交通纠纷。',
    allowedRanks: ['pc', 'spc', 'sergeant']
  },
  {
    id: 'accident_investigator',
    departmentId: 'traffic',
    label: 'Accident Investigator（事故调查）',
    summary: '处理交通事故现场、记录和后续调查。',
    allowedRanks: ['sergeant', 'station_sergeant', 'inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'traffic_enforcement',
    departmentId: 'traffic',
    label: 'Traffic Enforcement Officer（交通执法）',
    summary: '负责交通执法行动与路面管理。',
    allowedRanks: ['pc', 'spc', 'sergeant', 'station_sergeant']
  },
  {
    id: 'traffic_supervisor',
    departmentId: 'traffic',
    label: 'Traffic Supervisor（交通小队长）',
    summary: '监督交通小队行动与现场安排。',
    allowedRanks: ['sergeant', 'station_sergeant', 'inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'eu_vehicle_crew',
    departmentId: 'eu',
    label: 'Emergency Vehicle Crew Officer（冲锋车车组警员）',
    summary: '随冲锋车轮值，响应电台调派、处理紧急现场、执行机动防罪巡逻，并在车长指挥下完成初动处置。',
    allowedRanks: ['pc', 'spc'],
    authoritySummary: '在车长和小队指挥链下执行紧急现场初动，无权独立调动其他车辆或跨区资源。',
    accessSummary: '可接触本车任务、电台调派、现场基本资料和随车装备；不能自动接触完整刑事情报或高级指挥资料。',
    dutySummary: '冲锋车轮值、紧急响应、防罪巡逻、现场控制、救援协助、报告和交接。'
  },
  {
    id: 'eu_vehicle_driver',
    departmentId: 'eu',
    label: 'Emergency Vehicle Driver（冲锋车司机）',
    summary: '负责冲锋车安全驾驶、路线判断、车辆与基本装备检查，并作为车组成员参与现场初动处置。',
    allowedRanks: ['pc', 'spc'],
    authoritySummary: '在车长和小队指挥链下执行驾驶与紧急现场初动，无权独立调动其他车辆或跨区资源。',
    accessSummary: '可接触本车任务、电台调派、路线、现场基本资料和随车装备；不能自动接触完整刑事情报或高级指挥资料。',
    dutySummary: '冲锋车安全驾驶、路线判断、车辆与装备检查，以及作为车组成员参与紧急响应和现场初动。'
  },
  {
    id: 'eu_vehicle_commander',
    departmentId: 'eu',
    label: 'Emergency Vehicle Commander（冲锋车车长）',
    summary: '指挥一辆冲锋车车组，接收和判断电台任务，安排到场处置、人员站位、装备使用、现场汇报与增援请求。',
    allowedRanks: ['sergeant'],
    authoritySummary: '可指挥本冲锋车车组并提出增援请求，但不能独立指挥整个 EU 小队或跨部门重大行动。',
    accessSummary: '可接触本车任务详情、当值调派和现场初步指挥资料。',
    dutySummary: '车辆指挥、任务判断、车组部署、现场初动、无线电汇报和增援请求。'
  },
  {
    id: 'eu_platoon_second_in_command',
    departmentId: 'eu',
    label: 'EU Platoon Second-in-Command（冲锋队小队副指挥）',
    summary: '协助小队指挥官管理当值冲锋车、车组纪律、装备、任务分配、交更和重大现场协调。',
    allowedRanks: ['station_sergeant'],
    authoritySummary: '可协助协调当值小队多个车组，监督纪律、装备和部署；仍受督察级小队指挥官领导。',
    accessSummary: '可接触小队当值任务、车组状态、交更和行动协调资料。',
    dutySummary: '小队副指挥、任务分配协助、装备与纪律监督、重大现场协调和交更。'
  },
  {
    id: 'eu_probationary_platoon_commander',
    departmentId: 'eu',
    label: 'Probationary EU Platoon Commander（冲锋队见习小队指挥官）',
    summary: '在资深人员和既有指挥链监督下承担小队指挥训练，处理当值部署、重大现场协调和行动后汇报。',
    allowedRanks: ['probationary_inspector'],
    authoritySummary: '处于见习和受监督阶段；可在既有指挥链下指挥当值 EU 小队，重大、跨区或高风险决定须向上级汇报。',
    accessSummary: '在监督下接触小队行动资料、资源状态、重大现场报告和相关总区指挥信息。',
    dutySummary: '在监督下学习小队部署、重大现场初期指挥、资源协调、行动复核、训练和纪律管理。'
  },
  {
    id: 'eu_platoon_commander',
    departmentId: 'eu',
    label: 'EU Platoon Commander（冲锋队小队指挥官）',
    summary: '指挥一个轮值小队，负责当值部署、多个冲锋车车组协调、重大现场初期指挥、资源请求和行动复核。',
    allowedRanks: ['inspector', 'senior_inspector'],
    authoritySummary: '可指挥当值 EU 小队、协调多个冲锋车和重大现场初期部署；跨区或更高层行动须向 EU 总部及总区指挥链汇报。',
    accessSummary: '可接触小队行动资料、资源状态、重大现场报告和相关总区指挥信息。',
    dutySummary: '小队部署、重大现场初期指挥、资源协调、行动复核、训练和纪律管理。'
  },
  {
    id: 'eu_headquarters_operations_officer',
    departmentId: 'eu',
    label: 'EU Headquarters Operations Officer（冲锋队总部行动官）',
    summary: '在总区冲锋队总部处理行动协调、训练、值班部署、跨小队资源安排和重大事件支援，可承担单位副主管性质的职责。',
    allowedRanks: ['chief_inspector'],
    authoritySummary: '可在 EU 总部层协调小队、训练和重大行动支援，但不等于总区指挥官或整个警队行动主管。',
    accessSummary: '可接触单位层行动部署、训练、值班与重大事件协调资料。',
    dutySummary: '总部行动协调、跨小队资源安排、重大事件支援、训练和单位管理。'
  },
  {
    id: 'riot_control',
    departmentId: 'ptu',
    label: 'Riot Control Officer（防暴队员）',
    summary: '承担队列、防暴和大型冲突支援。',
    allowedRanks: ['pc', 'spc', 'sergeant']
  },
  {
    id: 'formation_member',
    departmentId: 'ptu',
    label: 'Formation Member（队列成员）',
    summary: '作为机动部队队列成员参与行动。',
    allowedRanks: ['pc', 'spc']
  },
  {
    id: 'emergency_response',
    departmentId: 'ptu',
    label: 'Public Order Support Officer（公共秩序支援警员）',
    summary: '作为机动部队成员支援公共秩序、群体事件、重大行动和总区后备任务；不是普通999召唤的默认冲锋队车组。',
    allowedRanks: ['pc', 'spc', 'sergeant', 'station_sergeant']
  },
  {
    id: 'platoon_member',
    departmentId: 'ptu',
    label: 'Platoon Member（小队成员）',
    summary: '参与小队行动和战术部署。',
    allowedRanks: ['pc', 'spc', 'sergeant']
  },
  {
    id: 'platoon_commander',
    departmentId: 'ptu',
    label: 'Platoon Commander（小队指挥）',
    summary: '完成或正在接受机动部队指挥训练后，负责小队行动、队列部署与现场战术判断。',
    allowedRanks: ['probationary_inspector', 'inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'marine_constable',
    departmentId: 'marine',
    label: 'Marine Constable（水警警员）',
    summary: '承担海上巡逻和基础船上勤务。',
    allowedRanks: ['pc', 'spc']
  },
  {
    id: 'boat_crew',
    departmentId: 'marine',
    label: 'Boat Crew Member（船员）',
    summary: '作为船艇成员执行水上勤务。',
    allowedRanks: ['pc', 'spc']
  },
  {
    id: 'marine_patrol',
    departmentId: 'marine',
    label: 'Marine Patrol Officer（海上巡逻）',
    summary: '执行海上巡逻、检查和支援行动。',
    allowedRanks: ['pc', 'spc', 'sergeant']
  },
  {
    id: 'boarding_officer',
    departmentId: 'marine',
    label: 'Boarding Officer（登船检查）',
    summary: '负责登船检查、询问和初步记录。',
    allowedRanks: ['sergeant', 'station_sergeant', 'inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'marine_supervisor',
    departmentId: 'marine',
    label: 'Marine Supervisor（水警指挥）',
    summary: '协调船艇或小队行动。',
    allowedRanks: ['sergeant', 'station_sergeant', 'inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'intelligence_officer',
    departmentId: 'special_branch',
    label: 'Intelligence Officer（情报官）',
    summary: '处理敏感情报、风险判断和上级汇报。',
    allowedRanks: ['inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'surveillance_officer',
    departmentId: 'special_branch',
    label: 'Surveillance Officer（监视）',
    summary: '参与跟踪、观察和敏感信息收集。',
    allowedRanks: ['inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'liaison_officer',
    departmentId: 'special_branch',
    label: 'Liaison Officer（联络）',
    summary: '负责跨部门、线人或外部机构联络。',
    allowedRanks: ['inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'informant_handler',
    departmentId: 'special_branch',
    label: 'Informant Handler（线人管理）',
    summary: '处理线人接触、风险和情报来源。',
    allowedRanks: ['inspector', 'senior_inspector', 'chief_inspector']
  },
  {
    id: 'report_room',
    departmentId: 'station_duty',
    label: 'Report Room Officer（报案室值日）',
    summary: '接触报案、市民求助、电话记录和初步分流。',
    allowedRanks: ['pc', 'spc', 'sergeant']
  },
  {
    id: 'duty_officer',
    departmentId: 'station_duty',
    label: 'Duty Officer（值日官）',
    summary: '负责当值安排、警署内部协调和现场决定。',
    allowedRanks: ['inspector', 'senior_inspector']
  },
  {
    id: 'station_clerk',
    departmentId: 'station_duty',
    label: 'Station Clerk（文书支援）',
    summary: '处理警署文书、记录和档案流转。',
    allowedRanks: ['pc', 'spc']
  },
  {
    id: 'case_intake',
    departmentId: 'station_duty',
    label: 'Case Intake Officer（案件录入）',
    summary: '处理报案资料、初步归档和转交。',
    allowedRanks: ['pc', 'spc', 'sergeant', 'station_sergeant']
  },
  {
    id: 'station_supervisor',
    departmentId: 'station_duty',
    label: 'Station Supervisor（警署监督）',
    summary: '监督警署值日和小单位秩序。',
    allowedRanks: ['station_sergeant', 'inspector', 'senior_inspector']
  }
];

const stationBasedDepartments: PoliceDepartmentId[] = ['uniform', 'cid', 'traffic', 'station_duty'];

function createPoliceStationPosting(id: string, label: string, summary: string): PolicePostingOption {
  return {
    id,
    label,
    kind: 'police_station',
    summary,
    allowedDepartments: [...stationBasedDepartments]
  };
}

export const policePostingOptions: PolicePostingOption[] = [
  createPoliceStationPosting(
    'central_police_station',
    'Central Police Station（中区警署）',
    '港岛核心区域警署驻点，牵涉商业、政府与传媒压力。'
  ),
  createPoliceStationPosting(
    'peak_police_station',
    'Peak Police Station（山顶警署）',
    '港岛高收入住宅与殖民地权力象征交叠的山顶驻点。'
  ),
  createPoliceStationPosting(
    'western_police_station',
    'Western Police Station（西区警署）',
    '港岛西部旧区、码头、街坊网络与基层生活交叠的驻点。'
  ),
  createPoliceStationPosting(
    'aberdeen_police_station',
    'Aberdeen Police Station（香港仔警署）',
    '南区渔港、工厂、屋邨和海陆交通交错的驻点。'
  ),
  createPoliceStationPosting(
    'stanley_police_station',
    'Stanley Police Station（赤柱警署）',
    '港岛南部相对封闭的社区、监狱和海边旅游压力驻点。'
  ),
  createPoliceStationPosting(
    'wan_chai_police_station',
    'Wan Chai Police Station（湾仔警署）',
    '港岛商业、夜场与政商活动交叠的警署驻点。'
  ),
  createPoliceStationPosting(
    'happy_valley_police_station',
    'Happy Valley Police Station（跑马地警署）',
    '赛马、住宅区、医院与港岛中产生活交错的驻点。'
  ),
  createPoliceStationPosting(
    'north_point_police_station',
    'North Point Police Station（北角警署）',
    '港岛东部移民、商住街区和社区政治气味较重的驻点。'
  ),
  createPoliceStationPosting(
    'chai_wan_police_station',
    'Chai Wan Police Station（柴湾警署）',
    '港岛东端屋邨、工厂与交通节点并存的驻点。'
  ),
  createPoliceStationPosting(
    'tsim_sha_tsui_police_station',
    'Tsim Sha Tsui Police Station（尖沙咀警署）',
    '旅游、商业、码头与夜间经济交叠的警署驻点。'
  ),
  createPoliceStationPosting(
    'yau_ma_tei_police_station',
    'Yau Ma Tei Police Station（油麻地警署）',
    '九龙旧区、庙街、夜市、基层商业和街坊纠纷密集的驻点。'
  ),
  createPoliceStationPosting(
    'mong_kok_police_station',
    'Mong Kok Police Station（旺角警署）',
    '九龙高密度街区警署驻点，可承载军装、CID、交通与警署内勤。'
  ),
  createPoliceStationPosting(
    'sham_shui_po_police_station',
    'Sham Shui Po Police Station（深水埗警署）',
    '旧区与基层生活压力明显的警署驻点。'
  ),
  createPoliceStationPosting(
    'cheung_sha_wan_police_station',
    'Cheung Sha Wan Police Station（长沙湾警署）',
    '工业、屋邨、批发和旧区治安压力交叠的驻点。'
  ),
  createPoliceStationPosting(
    'kowloon_city_police_station',
    'Kowloon City Police Station（九龙城警署）',
    '九龙城寨余波、旧楼、食肆和多族群街区压力交叠的驻点。'
  ),
  createPoliceStationPosting(
    'hung_hom_police_station',
    'Hung Hom Police Station（红磡警署）',
    '铁路、码头、住宅和工商业混合区的九龙驻点。'
  ),
  createPoliceStationPosting(
    'wong_tai_sin_police_station',
    'Wong Tai Sin Police Station（黄大仙警署）',
    '大型屋邨、庙宇人流和基层社区压力明显的驻点。'
  ),
  createPoliceStationPosting(
    'kwun_tong_police_station',
    'Kwun Tong Police Station（观塘警署）',
    '工业区、屋邨和转型期商业压力并存的九龙东驻点。'
  ),
  createPoliceStationPosting(
    'sau_mau_ping_police_station',
    'Sau Mau Ping Police Station（秀茂坪警署）',
    '山坡屋邨、基层家庭和社区治安事件高发的驻点。'
  ),
  createPoliceStationPosting(
    'ngau_tau_kok_police_station',
    'Ngau Tau Kok Police Station（牛头角警署）',
    '九龙东旧工业和屋邨生活紧密交叠的驻点。'
  ),
  createPoliceStationPosting(
    'sai_kung_police_station',
    'Sai Kung Police Station（西贡警署）',
    '新界东海边社区、渔港、郊野和旅游活动交错的驻点。'
  ),
  createPoliceStationPosting(
    'tsuen_wan_police_station',
    'Tsuen Wan Police Station（荃湾警署）',
    '新界南工业、住宅、交通和社团网络交错的驻点。'
  ),
  createPoliceStationPosting(
    'kwai_chung_police_station',
    'Kwai Chung Police Station（葵涌警署）',
    '货柜、工业、屋邨和物流利益密集的新界南驻点。'
  ),
  createPoliceStationPosting(
    'tsing_yi_police_station',
    'Tsing Yi Police Station（青衣警署）',
    '岛区工业、住宅和港口交通压力并存的驻点。'
  ),
  createPoliceStationPosting(
    'sha_tin_police_station',
    'Sha Tin Police Station（沙田警署）',
    '新市镇扩张、屋邨、学校和家庭纠纷交叠的驻点。'
  ),
  createPoliceStationPosting(
    'tai_po_police_station',
    'Tai Po Police Station（大埔警署）',
    '新界东旧墟、新市镇、乡郊关系和家庭压力并存的驻点。'
  ),
  createPoliceStationPosting(
    'sheung_shui_police_station',
    'Sheung Shui Police Station（上水警署）',
    '边境、乡郊、市场和跨境流动气味较重的新界北驻点。'
  ),
  createPoliceStationPosting(
    'tuen_mun_police_station',
    'Tuen Mun Police Station（屯门警署）',
    '新市镇、屋邨、海边工业和交通压力交叠的新界西驻点。'
  ),
  createPoliceStationPosting(
    'castle_peak_police_station',
    'Castle Peak Police Station（青山警署）',
    '屯门旧区、青山一带和新界西社区压力交叠的驻点。'
  ),
  createPoliceStationPosting(
    'yuen_long_police_station',
    'Yuen Long Police Station（元朗警署）',
    '新界西北警署驻点，可承载军装、CID、交通与警署内勤。'
  ),
  createPoliceStationPosting(
    'pat_heung_police_station',
    'Pat Heung Police Station（八乡警署）',
    '新界乡郊、村落、运输路线和地方人情网络浓厚的驻点。'
  ),
  createPoliceStationPosting(
    'sha_tau_kok_police_station',
    'Sha Tau Kok Police Station（沙头角警署）',
    '边境禁区、乡郊关系和跨境压力明显的新界北驻点。'
  ),
  createPoliceStationPosting(
    'ta_kwu_ling_police_station',
    'Ta Kwu Ling Police Station（打鼓岭警署）',
    '边境乡郊、村落网络和走私传闻容易交织的驻点。'
  ),
  createPoliceStationPosting(
    'cheung_chau_police_station',
    'Cheung Chau Police Station（长洲警署）',
    '离岛社区、渔港、节庆人流和熟人社会气味较重的驻点。'
  ),
  {
    id: 'eu_hong_kong_island',
    label: 'Emergency Unit Hong Kong Island（港岛总区冲锋队）',
    kind: 'base',
    summary: '负责港岛总区范围内的紧急召唤、严重罪案初动、快速增援与机动防罪巡逻。',
    allowedDepartments: ['eu']
  },
  {
    id: 'eu_kowloon_east',
    label: 'Emergency Unit Kowloon East（东九龙总区冲锋队）',
    kind: 'base',
    summary: '负责东九龙总区范围内的紧急召唤、严重罪案初动、快速增援与机动防罪巡逻。',
    allowedDepartments: ['eu']
  },
  {
    id: 'eu_kowloon_west',
    label: 'Emergency Unit Kowloon West（西九龙总区冲锋队）',
    kind: 'base',
    summary: '负责西九龙高密度城区的紧急召唤、严重罪案初动、快速增援与机动防罪巡逻。',
    allowedDepartments: ['eu']
  },
  {
    id: 'eu_new_territories_north',
    label: 'Emergency Unit New Territories North（新界北总区冲锋队）',
    kind: 'base',
    summary: '负责新界北总区的紧急召唤、跨区道路事件、边境附近重大现场和快速机动增援。',
    allowedDepartments: ['eu']
  },
  {
    id: 'eu_new_territories_south',
    label: 'Emergency Unit New Territories South（新界南总区冲锋队）',
    kind: 'base',
    summary: '负责新界南总区的紧急召唤、严重罪案初动、交通节点重大现场和快速机动增援。',
    allowedDepartments: ['eu']
  },
  {
    id: 'cid_headquarters',
    label: 'CID Headquarters（刑事情报 / 侦缉总部驻点）',
    kind: 'headquarters',
    summary: 'CID 总部或总部级调查驻点，适合更集中或跨区的侦查开局。',
    allowedDepartments: ['cid']
  },
  {
    id: 'ptu_barracks',
    label: 'PTU Barracks（机动部队营房）',
    kind: 'barracks',
    summary: '机动部队训练、集结与待命驻点。',
    allowedDepartments: ['ptu']
  },
  {
    id: 'traffic_hq',
    label: 'Traffic HQ（交通总部）',
    kind: 'headquarters',
    summary: '交通部总部或行动驻点，适合交通执法与事故处理开局。',
    allowedDepartments: ['traffic']
  },
  {
    id: 'marine_police_base',
    label: 'Marine Police Base（水警基地）',
    kind: 'base',
    summary: '水警船艇、海上巡逻与登船检查驻点。',
    allowedDepartments: ['marine']
  },
  {
    id: 'special_branch_hq',
    label: 'Special Branch HQ（政治部 / 情报驻点）',
    kind: 'headquarters',
    summary: '敏感情报、监视和联络相关驻点。',
    allowedDepartments: ['special_branch']
  }
];

export function getAllowedPoliceDepartments(rankId: PoliceRankId): PoliceDepartmentOption[] {
  return policeDepartmentOptions.filter((department) => department.allowedRanks.includes(rankId));
}

export function getAllowedPolicePostings(departmentId: PoliceDepartmentId): PolicePostingOption[] {
  return policePostingOptions.filter((posting) => posting.allowedDepartments.includes(departmentId));
}

export function getAllowedPoliceRoles(departmentId: PoliceDepartmentId, rankId: PoliceRankId): PoliceRoleOption[] {
  return policeRoleOptions.filter((role) => role.departmentId === departmentId && role.allowedRanks.includes(rankId));
}

export function getPoliceRank(rankId: PoliceRankId): PoliceRankOption {
  return policeRankOptions.find((rank) => rank.id === rankId) ?? policeRankOptions[0];
}

export function getPoliceDepartment(departmentId: PoliceDepartmentId): PoliceDepartmentOption {
  return policeDepartmentOptions.find((department) => department.id === departmentId) ?? policeDepartmentOptions[0];
}

export function getPoliceRole(roleId: string): PoliceRoleOption {
  return policeRoleOptions.find((role) => role.id === roleId) ?? policeRoleOptions[0];
}

export function getPolicePosting(postingId: string): PolicePostingOption {
  return policePostingOptions.find((posting) => posting.id === postingId) ?? policePostingOptions[0];
}

export function getCivilianOpeningProfile(
  profileId: string | undefined,
  customProfile?: CivilianCustomOpeningProfileInput
): CivilianOpeningProfileOption {
  const profile = civilianOpeningProfileOptions.find((candidate) => candidate.id === profileId) ?? civilianOpeningProfileOptions[0];
  if (profile.id !== 'custom_occupation') return profile;

  const publicOccupation = customProfile?.publicOccupation.trim() || profile.publicOccupation;
  const workplacePlaceId = customProfile?.workplacePlaceId.trim() || profile.workplacePlaceId;
  const workplaceLabel = customProfile?.workplaceLabel.trim() || profile.workplaceLabel;
  const employerName = customProfile?.employerName?.trim() || undefined;
  const communitySummary =
    customProfile?.communitySummary?.trim() ||
    `围绕“${publicOccupation}”形成的同事、顾客、街坊和行业联系人，是玩家最初的社会接触面。`;

  return {
    ...profile,
    label: publicOccupation === profile.publicOccupation ? profile.label : `自定义 · ${publicOccupation}`,
    publicOccupation,
    workplacePlaceId,
    workplaceLabel,
    employerOrganizationId: employerName ? 'org_player_custom_employer' : undefined,
    employerName,
    employerOrganizationType: employerName ? 'business' : undefined,
    employerRelationType: employerName ? 'employee' : undefined,
    employerRelationSummary: employerName
      ? `玩家以“${publicOccupation}”身份在${employerName}工作；具体职权和收入由开局结构化结果确认。`
      : undefined,
    communitySummary,
    familyEconomicSummary: `收入稳定性、家用和职业风险应根据“${publicOccupation}”、出身背景与开局要求合理生成。`
  };
}

export function getTriadOpeningProfile(profileId: string | undefined): TriadOpeningProfileOption {
  return triadOpeningProfileOptions.find((profile) => profile.id === profileId) ?? triadOpeningProfileOptions[0];
}

const legacyTriadSocietyIdAliases: Record<string, string> = {
  sun_yee_on_portland: 'org_sun_yee_on',
  wo_shing_wo_temple_street: 'org_wo_shing_wo',
  fourteen_k_chungking: 'org_14k',
  shui_fong_portland: 'org_shui_fong',
  wo_hop_to_fruit_market: 'org_wo_hop_to'
};

export function getTriadSociety(societyId: string | undefined): TriadSocietyOption {
  const normalizedSocietyId = societyId ? (legacyTriadSocietyIdAliases[societyId] ?? societyId) : undefined;
  return triadSocietyOptions.find((society) => society.id === normalizedSocietyId) ?? triadSocietyOptions[0];
}

export function getAllowedTriadTerritories(societyId: string | undefined): TriadTerritoryOption[] {
  const society = getTriadSociety(societyId);
  const organization = hkLateColonialTriadOrganizations.find((item) => item.organizationId === society.organizationId);
  if (!organization) return [];
  return organization.activityAreas.map((area) => ({
    placeId: area.placeId,
    label: area.label,
    territorySummary: `${area.label}及其周边活动线：${area.activitySummary}`,
    localPressureSummary: `${area.localPressureSummary} 这里是所选字头的一条当地活动线，不代表排他控制或整个字头的唯一地盘。`
  }));
}

export function getTriadTerritory(societyId: string | undefined, territoryPlaceId: string | undefined): TriadTerritoryOption {
  const society = getTriadSociety(societyId);
  const allowedTerritories = getAllowedTriadTerritories(society.id);
  const territory =
    allowedTerritories.find((territory) => territory.placeId === territoryPlaceId) ??
    allowedTerritories.find((territory) => territory.placeId === society.defaultTerritoryPlaceId) ??
    allowedTerritories[0];
  if (!territory) throw new Error(`Triad society has no registered territory: ${society.id}`);
  return territory;
}

export function getTriadRank(rankId: TriadRankId | undefined): TriadRankOption {
  return triadRankOptions.find((rank) => rank.id === rankId) ?? triadRankOptions[0];
}

export function getAllowedTriadRoles(rankId: TriadRankId): TriadRoleOption[] {
  return triadRoleOptions.filter((role) => role.allowedRanks.includes(rankId));
}

export function getTriadRole(roleId: string | undefined, rankId?: TriadRankId): TriadRoleOption {
  const allowedRoles = rankId ? getAllowedTriadRoles(rankId) : triadRoleOptions;
  return allowedRoles.find((role) => role.id === roleId) ?? allowedRoles[0] ?? triadRoleOptions[0];
}

export function resolveTriadOpeningProfile(selection: TriadOpeningSelection): TriadOpeningProfileOption {
  if (!selection.societyId && !selection.territoryPlaceId && !selection.rankId && !selection.roleId) {
    return getTriadOpeningProfile(selection.legacyProfileId);
  }

  const society = getTriadSociety(selection.societyId);
  const territory = getTriadTerritory(society.id, selection.territoryPlaceId);
  const rank = getTriadRank(selection.rankId);
  const role = getTriadRole(selection.roleId, rank.id);

  return {
    id: `${society.id}__${territory.placeId}__${rank.id}__${role.id}`,
    label: `${society.societyName} · ${territory.label} · ${rank.label} · ${role.label}`,
    societyId: society.id,
    territoryPlaceId: territory.placeId,
    rankId: rank.id,
    roleId: role.id,
    organizationId: society.organizationId,
    societyName: society.societyName,
    roleTitle: role.roleTitle,
    rankSummary: rank.rankSummary,
    authoritySummary: rank.authoritySummary,
    territorySummary: territory.territorySummary,
    startPlaceId: territory.placeId,
    startPlaceLabel: territory.label,
    obligationSummary: `${role.summary}${rank.obligationSummary}`,
    riskSummary: `${territory.localPressureSummary}${rank.riskSummary}`
  };
}
