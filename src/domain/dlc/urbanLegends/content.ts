import type { OfficialDlcManifest } from '../types';
import type {
  UrbanLegendsAssetIdentityAudit,
  UrbanLegendsEntryRouteMatrixItem,
  UrbanLegendsFormalCharacter,
  UrbanLegendsFormalPlace,
  UrbanLegendsNarrativeIdentity,
  UrbanLegendsRelationshipSeed,
  UrbanLegendsReleaseGate,
  UrbanLegendsTruthBoundary
} from './types';

/**
 * Frozen runtime/display contract used by saves created before the multi-arc
 * content expansion.  Never mutate this object to describe newer content.
 */
export const urbanLegendsFormalV1Manifest: OfficialDlcManifest = {
  dlcId: 'urban_legends',
  title: '都市怪谈',
  description: '城市会制造、利用并记住自己的恐惧；玩家可以调查，也可以怀疑、离开或让传闻继续流动。',
  type: 'narrative',
  version: '1.0.0',
  presentation: {
    tagline: '末班车驶过之后，谁在替城市讲述失踪？',
    experienceKeywords: ['城市传闻', '多身份入口', '真假难辨', '长期人物关系'],
    contentHighlights: ['完整长剧情弧：《午夜末班车》']
  },
  worldCompatibility: [
    {
      worldpackId: 'hk_1988',
      status: 'supported',
      reason: '已为香港 1988 的交通、媒体、警务与街坊网络完成专属适配。'
    }
  ],
  dramaIntegration: {
    enabled: true,
    priority: 'player_selected'
  },
  incompatibleDlcIds: ['urban_legends_alpha']
};

/** Frozen v1.1 runtime/display contract used by the first multi-arc release. */
export const urbanLegendsFormalV1_1Manifest: OfficialDlcManifest = {
  ...urbanLegendsFormalV1Manifest,
  version: '1.1.0',
  description: '四组长期都市怪谈与十二组街头传闻会在香港夜色中各自生长；玩家可以调查、怀疑、利用、离开，或让城市形成自己的版本。',
  presentation: {
    tagline: '末班车、空屋电话、海旁灯号与被恶闻吞没的烧味铺——城市总会替无法解释的事留下一个版本。',
    experienceKeywords: ['四条长期剧情弧', '十二组城市短传闻', '多身份入口', '真假难辨', '长期人物关系'],
    contentHighlights: [
      '完整长剧情弧：《午夜末班车》',
      '完整长剧情弧：《空屋来电》',
      '完整长剧情弧：《海旁无名灯》',
      '完整长剧情弧：《深夜叉烧包》',
      '十二组可独立流动的香港城市短传闻'
    ]
  }
};

/** Latest public catalog contract. Existing saves remain pinned to their exact
 * runtime version until the player explicitly accepts an upgrade. */
export const urbanLegendsFormalManifest: OfficialDlcManifest = {
  ...urbanLegendsFormalV1_1Manifest,
  version: '1.2.0',
  description: '五组长期都市怪谈与十二组街头传闻会在香港夜色中各自生长；玩家可以调查、怀疑、利用、离开，或让城市形成自己的版本。',
  presentation: {
    tagline: '末班车、空屋电话、海旁灯号、恶闻中的烧味铺，以及一份无人应门的深夜外卖——城市总会替无法解释的事留下一个版本。',
    experienceKeywords: ['五条长期剧情弧', '十二组城市短传闻', '多身份入口', '真假难辨', '长期人物关系'],
    contentHighlights: [
      '完整长剧情弧：《午夜末班车》',
      '完整长剧情弧：《空屋来电》',
      '完整长剧情弧：《海旁无名灯》',
      '完整长剧情弧：《深夜叉烧包》',
      '完整长剧情弧：《最后一份外卖》',
      '十二组可独立流动的香港城市短传闻'
    ]
  }
};

export const urbanLegendsReleaseGate: UrbanLegendsReleaseGate = {
  manifest: urbanLegendsFormalManifest,
  publicationStatus: 'release_candidate',
  selectableInNewGame: true,
  providerRegistered: true,
  alphaMigration: 'none',
  incompatibleDlcIds: ['urban_legends_alpha'],
  publicRegistrationRequires: [
    'phase_2c',
    'phase_2d',
    'phase_2e',
    'ui_acceptance',
    'phase_3_real_api'
  ]
};

export const urbanLegendsFormalIds = {
  eventGroup: 'official_dlc_urban_legends_hk1988_midnight_bus',
  arcKey: 'official-dlc:urban_legends:hk_1988:midnight_bus',
  places: {
    terminal: 'official_dlc_urban_legends_hk1988_midnight_bus_terminal',
    oldDistrictStreet: 'official_dlc_urban_legends_hk1988_old_district_street',
    chaChaanTeng: 'official_dlc_urban_legends_hk1988_cha_chaan_teng'
  },
  actors: {
    driver: 'official_dlc_urban_legends_hk1988_night_bus_driver',
    dispatcher: 'official_dlc_urban_legends_hk1988_terminal_dispatcher',
    relative: 'official_dlc_urban_legends_hk1988_missing_passenger_relative',
    neighbor: 'official_dlc_urban_legends_hk1988_old_neighbor',
    reporter: 'official_dlc_urban_legends_hk1988_young_reporter',
    societyLiaison: 'official_dlc_urban_legends_hk1988_society_liaison',
    juniorOfficer: 'official_dlc_urban_legends_hk1988_junior_officer'
  },
  stages: {
    streetRumor: 'official_dlc_urban_legends_hk1988_midnight_bus_stage_street_rumor',
    firstClues: 'official_dlc_urban_legends_hk1988_midnight_bus_stage_first_clues',
    interestConflict: 'official_dlc_urban_legends_hk1988_midnight_bus_stage_interest_conflict',
    truthInvestigation: 'official_dlc_urban_legends_hk1988_midnight_bus_stage_truth_investigation',
    aftermath: 'official_dlc_urban_legends_hk1988_midnight_bus_stage_aftermath'
  },
  nodes: {
    reportedMissingPassenger: 'official_dlc_urban_legends_hk1988_midnight_bus_node_reported_missing_passenger',
    neighborhoodRumor: 'official_dlc_urban_legends_hk1988_midnight_bus_node_neighborhood_rumor',
    routeBusinessRumor: 'official_dlc_urban_legends_hk1988_midnight_bus_node_route_business_rumor',
    driverTestimony: 'official_dlc_urban_legends_hk1988_midnight_bus_node_driver_testimony',
    oldRouteRecords: 'official_dlc_urban_legends_hk1988_midnight_bus_node_old_route_records',
    contradictoryWitness: 'official_dlc_urban_legends_hk1988_midnight_bus_node_contradictory_witness',
    pressExaggeration: 'official_dlc_urban_legends_hk1988_midnight_bus_node_press_exaggeration',
    societyUsesRumor: 'official_dlc_urban_legends_hk1988_midnight_bus_node_society_uses_rumor',
    internalDisagreement: 'official_dlc_urban_legends_hk1988_midnight_bus_node_internal_disagreement',
    timelineReconstruction: 'official_dlc_urban_legends_hk1988_midnight_bus_node_timeline_reconstruction',
    routeSurveillance: 'official_dlc_urban_legends_hk1988_midnight_bus_node_route_surveillance',
    mundaneLead: 'official_dlc_urban_legends_hk1988_midnight_bus_node_mundane_lead',
    publicAccount: 'official_dlc_urban_legends_hk1988_midnight_bus_node_public_account',
    unansweredDetail: 'official_dlc_urban_legends_hk1988_midnight_bus_node_unanswered_detail',
    abandonedInquiry: 'official_dlc_urban_legends_hk1988_midnight_bus_node_abandoned_inquiry'
  },
  news: {
    firstPublicRumor: 'official_dlc_urban_legends_hk1988_midnight_bus_news_rumor',
    contestedCoverage: 'official_dlc_urban_legends_hk1988_midnight_bus_news_contested_coverage',
    correctionOrSilence: 'official_dlc_urban_legends_hk1988_midnight_bus_news_correction_or_silence',
    aftermathRetelling: 'official_dlc_urban_legends_hk1988_midnight_bus_news_aftermath_retelling'
  },
  resolutions: {
    realityLeaning: 'official_dlc_urban_legends_hk1988_midnight_bus_resolution_reality_leaning',
    pluralAmbiguity: 'official_dlc_urban_legends_hk1988_midnight_bus_resolution_plural_ambiguity',
    boundedResidue: 'official_dlc_urban_legends_hk1988_midnight_bus_resolution_bounded_residue'
  }
} as const;

export const urbanLegendsNarrativeIdentity: UrbanLegendsNarrativeIdentity = {
  dlcId: urbanLegendsFormalManifest.dlcId,
  eventGroupId: urbanLegendsFormalIds.eventGroup,
  arcKey: urbanLegendsFormalIds.arcKey,
  title: '午夜末班车',
  worldpackId: 'hk_1988',
  coreTheme: '一座现代城市如何制造、传播、利用、压制并最终记忆自己的恐惧。',
  playerExperience: [
    '从普通城市传闻接触具体人物、地点与时间差。',
    '在互相矛盾的证词和现实利益之间形成自己的判断。',
    '可以调查、利用、公开、压下、忽略或中途退出。',
    '结果进入人物、关系、新闻、事项和城市记忆，而不是任务完成弹窗。',
    '现实解释成立后仍可保留少量具体但不可确认的残余。'
  ],
  initialStageSemanticKey: 'street_rumor',
  stageContractStatus: 'formal_phase_2c'
};

export const urbanLegendsFormalPlaces: readonly UrbanLegendsFormalPlace[] = [
  {
    placeId: urbanLegendsFormalIds.places.terminal,
    name: '夜间巴士总站',
    summary: '九龙一处仍有夜班车进出的总站，站台、交班台和调度记录共同构成可以核对但并不总是完整的时间线。',
    worldpackId: 'hk_1988',
    publicFacts: [
      '总站按纸面班次、人工交班和现场调度维持夜班运营。',
      '司机、站务人员和候车乘客接触到的信息并不相同。'
    ],
    informationChannels: ['交班簿', '排班表', '司机口述', '候车乘客', '站务人员'],
    forbiddenAdaptations: ['不得出现联网实时车辆定位。', '不得把记录缺口自动解释为超自然现象。']
  },
  {
    placeId: urbanLegendsFormalIds.places.oldDistrictStreet,
    name: '旧城区街道',
    summary: '楼宇、报摊、后巷和夜间生意交叠的旧区街道，消息会在熟人网络中传播、变形，也会产生现实代价。',
    worldpackId: 'hk_1988',
    publicFacts: [
      '街坊、夜班工人和沿街生意拥有不同的观察时段。',
      '传闻会影响人流、生意和人物对陌生人的警惕。'
    ],
    informationChannels: ['街坊口述', '报摊消息', '夜间店铺', '后巷目击', '地盘熟人'],
    forbiddenAdaptations: ['不得写成脱离生活功能的抽象恐怖街道。', '不得让所有街坊共享同一版本。']
  },
  {
    placeId: urbanLegendsFormalIds.places.chaChaanTeng,
    name: '午夜茶餐厅',
    summary: '靠近总站的通宵茶餐厅，司机、街坊、记者和夜班熟客会在不同时间交换并修正说法。',
    worldpackId: 'hk_1988',
    publicFacts: [
      '茶餐厅服务夜班工人和晚归熟客。',
      '店内听到的说法通常是生活消息，不天然具有证据效力。'
    ],
    informationChannels: ['熟客闲谈', '店员记忆', '报纸', '电话留言', '司机歇脚'],
    forbiddenAdaptations: ['不得把茶餐厅写成固定任务大厅。', '不得把闲谈直接写成已确认事实。']
  }
];

export const urbanLegendsFormalCharacters: readonly UrbanLegendsFormalCharacter[] = [
  {
    actorId: urbanLegendsFormalIds.actors.driver,
    name: '陈国安',
    age: 42,
    tier: 'core',
    publicIdentity: '夜班巴士司机',
    occupation: '巴士司机',
    commonPlaceId: urbanLegendsFormalIds.places.terminal,
    publicFacts: ['负责一条夜间巴士线路的轮值。', '熟悉车辆交班、停站和夜班乘客的日常规律。'],
    desires: ['保住工作。', '保护家庭。', '维持自己作为可靠职业者的尊严。'],
    fears: ['成为事故或传闻的替罪羊。', '一句不确定的说法被警方、公司或报馆当成定论。'],
    personality: '谨慎、疲惫、重视具体时间，不愿把无法核对的事说满。',
    speechStyle: '先说班次、时间和站点，再补充自己的判断；受到压力时会反复强调交班程序。',
    candidateSecretDomains: [
      {
        secretDomainId: 'driver_route_deviation',
        possibility: '曾因现实原因偏离过规定路线或在非正式地点停车。',
        possibleEvidenceKinds: ['交班簿', '司机证词', '乘客证词', '路线查访']
      },
      {
        secretDomainId: 'driver_protected_passenger',
        possibility: '曾帮助某位乘客，因此选择省略一部分经过。',
        possibleEvidenceKinds: ['人物记忆', '车票或物件', '第三方证词'],
        incompatibleWith: ['driver_memory_gap_only']
      },
      {
        secretDomainId: 'driver_memory_gap_only',
        possibility: '关键差异来自疲劳和记忆偏差，而非有意隐瞒。',
        possibleEvidenceKinds: ['轮班记录', '重复询问', '其他司机证词'],
        incompatibleWith: ['driver_protected_passenger']
      }
    ],
    informationBoundary: {
      knows: ['自己当夜的轮值、停站和交班经过。', '哪些细节来自亲历，哪些来自后来听说。'],
      mayBelieve: ['记录差异可能只是夜班工作中的普通错漏。', '有人借传闻把责任推给司机。'],
      doesNotKnow: ['失踪者离开家后的全部行动。', '记者、警方和社团掌握的完整信息。'],
      accessChannels: ['车辆交班', '司机同事', '总站人员', '熟客乘客']
    },
    longTermArcDirections: ['持续否认。', '有条件透露部分信息。', '成为替罪羊。', '主动提供证据。', '离职或退出传闻。'],
    forbiddenConfirmations: ['不得预先确认他违规改线。', '不得预先确认他见过鬼。', '不得把沉默自动解释为说谎。']
  },
  {
    actorId: urbanLegendsFormalIds.actors.dispatcher,
    name: '罗志强',
    age: 46,
    tier: 'core',
    publicIdentity: '总站值班调度员',
    occupation: '巴士总站调度员',
    commonPlaceId: urbanLegendsFormalIds.places.terminal,
    publicFacts: ['负责部分夜班排班、到离站登记和司机交班衔接。', '必须同时面对运营、公司追责和现场人手不足。'],
    desires: ['维持总站正常运作。', '避免公司把记录缺口归咎于个人。', '保护自己认为值得保护的同事。'],
    fears: ['夜班记录成为媒体猎奇材料。', '管理层为了止损牺牲基层员工。'],
    personality: '克制、程序化、善于把私人判断藏在工作术语后面。',
    speechStyle: '常以排班、交接和公司规定回答；只有在信任形成后才会区分正式记录与自己记得的细节。',
    candidateSecretDomains: [
      {
        secretDomainId: 'dispatcher_manual_schedule_edit',
        possibility: '曾手工改动过排班或补写过一项记录。',
        possibleEvidenceKinds: ['排班表', '墨迹或时间差', '同事证词']
      },
      {
        secretDomainId: 'dispatcher_covered_colleague',
        possibility: '曾替同事掩盖一次普通违规，但并不知道失踪真相。',
        possibleEvidenceKinds: ['交班差异', '内部口供', '公司问责记录']
      },
      {
        secretDomainId: 'dispatcher_bureaucratic_fear_only',
        possibility: '他的防御只来自害怕追责，并不掌握核心隐情。',
        possibleEvidenceKinds: ['持续一致的有限证词', '管理层压力', '记录核验']
      }
    ],
    informationBoundary: {
      knows: ['排班、交班和到离站登记的正式版本。', '哪些记录是当班填写、哪些是事后补录。'],
      mayBelieve: ['传闻正在损害夜班运营。', '司机或公司管理层可能隐瞒了不同层次的问题。'],
      doesNotKnow: ['失踪者私人关系。', '街面人物和记者消息来源的全貌。'],
      accessChannels: ['调度记录', '司机交班', '公司管理层', '站务同事']
    },
    longTermArcDirections: ['官僚式防御。', '成为证据保管者。', '选择保护机构或个人。', '公开或销毁部分记录。', '成为证人或替罪者。'],
    forbiddenConfirmations: ['不得预先确认他篡改记录。', '不得把机构防御直接写成共谋。', '不得赋予他超出岗位的全局知情。']
  },
  {
    actorId: urbanLegendsFormalIds.actors.relative,
    name: '何婉仪',
    age: 29,
    tier: 'core',
    publicIdentity: '失踪者的姐姐',
    occupation: '文员',
    commonPlaceId: urbanLegendsFormalIds.places.chaChaanTeng,
    publicFacts: ['正在寻找未按约回家的弟弟。', '掌握一部分家庭时间线和私人物件。'],
    desires: ['找到答案。', '恢复弟弟的名誉。', '避免私人生活被当作猎奇故事。'],
    fears: ['警方把失踪简单归为离家。', '媒体公开家人不愿披露的细节。'],
    personality: '焦急但有条理，会努力把情绪压回具体时间、物件和承诺。',
    speechStyle: '先说可以核对的时间和物件；受到质疑时会反复确认同一个问题。',
    candidateSecretDomains: [
      {
        secretDomainId: 'relative_knew_departure_plan',
        possibility: '知道失踪者可能计划离开，却没有完整告诉外界。',
        possibleEvidenceKinds: ['书信', '工作消息', '家人证词']
      },
      {
        secretDomainId: 'relative_family_conflict',
        possibility: '家庭关系比公开说法更紧张，部分时间线经过选择性整理。',
        possibleEvidenceKinds: ['亲友证词', '人物记忆', '私人物件']
      },
      {
        secretDomainId: 'relative_memory_under_stress',
        possibility: '压力让她把后来听到的传闻混入自己的记忆。',
        possibleEvidenceKinds: ['前后陈述', '原始报案记录', '第三方核对']
      }
    ],
    informationBoundary: {
      knows: ['失踪者的家庭习惯、最后约定和部分私人物件。', '自己向警方和记者说过什么。'],
      mayBelieve: ['警方没有认真对待。', '传闻可能让更多人愿意提供消息。'],
      doesNotKnow: ['失踪者离家后的完整路线。', '司机、站务和街面人物各自隐瞒的内容。'],
      accessChannels: ['家人朋友', '报案接触', '记者', '失踪者工作关系']
    },
    longTermArcDirections: ['持续寻找。', '选择性公开。', '与媒体决裂。', '接受或拒绝现实结论。', '退出公共视野。'],
    forbiddenConfirmations: ['不得预先确认失踪者主动离开。', '不得把亲属隐瞒写成犯罪事实。', '不得让她知道全部真相。']
  },
  {
    actorId: urbanLegendsFormalIds.actors.neighbor,
    name: '梁伯',
    age: 68,
    tier: 'core',
    publicIdentity: '旧区老街坊',
    occupation: '退休工人',
    commonPlaceId: urbanLegendsFormalIds.places.oldDistrictStreet,
    publicFacts: ['在旧区生活多年。', '能区分自己亲眼所见与街坊转述，但记忆也会受后来叙述影响。'],
    desires: ['保护街坊安宁。', '证明自己没有胡说。', '阻止外人借传闻牟利。'],
    fears: ['被当成精神失常或笑柄。', '社区记忆被报纸改写成猎奇故事。'],
    personality: '健谈、重旧情，也会在反复讲述中不自觉修饰细节。',
    speechStyle: '广东话口吻浓，常主动标明“亲眼见过”或“听人讲过”。',
    candidateSecretDomains: [
      {
        secretDomainId: 'neighbor_rumor_contamination',
        possibility: '证词受到后来传闻污染。',
        possibleEvidenceKinds: ['早期陈述', '报纸版本', '其他街坊证词']
      },
      {
        secretDomainId: 'neighbor_omitted_for_self_protection',
        possibility: '为了保护自己或熟人，省略了一个现实细节。',
        possibleEvidenceKinds: ['人物关系', '前后说法', '地点查访']
      },
      {
        secretDomainId: 'neighbor_specific_residue',
        possibility: '确实记得一处无法与现有记录完全对齐的具体细节。',
        possibleEvidenceKinds: ['时间对照', '独立证人', '现场物件']
      }
    ],
    informationBoundary: {
      knows: ['旧路线、街区变化和部分熟人的生活规律。', '自己何时开始听到不同版本。'],
      mayBelieve: ['城市会把普通怪事传成鬼故事。', '仍有一处细节不是普通误会能完全解释。'],
      doesNotKnow: ['运输机构内部记录。', '失踪者完整私人生活。'],
      accessChannels: ['街坊', '报摊', '旧同事', '夜间店铺']
    },
    longTermArcDirections: ['普通讲述者。', '被塑造成灵异证人。', '撤回或坚持证词。', '成为公众笑柄。', '提供真正有价值的细节。'],
    forbiddenConfirmations: ['不得把他写成全知老人。', '不得预先确认他的异常见闻真实。', '不得让所有街坊附和他。']
  },
  {
    actorId: urbanLegendsFormalIds.actors.reporter,
    name: '方嘉仪',
    age: 24,
    tier: 'core',
    publicIdentity: '报馆记者',
    occupation: '记者',
    commonPlaceId: urbanLegendsFormalIds.places.chaChaanTeng,
    publicFacts: ['正在核对夜间巴士传闻。', '需要在截稿、消息可信度和公众兴趣之间取舍。'],
    desires: ['获得独家。', '建立职业声誉。', '把零散事件组织成公众能理解的报道。'],
    fears: ['交不出稿件。', '被不可靠来源利用。', '报道伤害失踪者亲属后无法挽回。'],
    personality: '反应快、求证心强，也清楚标题和销量会改变报道。',
    speechStyle: '问题密集，习惯把不同版本的时间线并排比较。',
    candidateSecretDomains: [
      {
        secretDomainId: 'reporter_secondhand_source',
        possibility: '关键说法来自二手转述而非直接采访。',
        possibleEvidenceKinds: ['采访笔记', '消息人证词', '稿件版本']
      },
      {
        secretDomainId: 'reporter_editorial_exaggeration',
        possibility: '标题或叙事角度在编辑压力下被有意夸张。',
        possibleEvidenceKinds: ['初稿', '刊登稿', '编辑指示']
      },
      {
        secretDomainId: 'reporter_information_exchange',
        possibility: '与某个利益相关方交换消息，但交换不等于共谋。',
        possibleEvidenceKinds: ['联络记录', '人物记忆', '报道时序']
      }
    ],
    informationBoundary: {
      knows: ['自己采访过的人和未公开的稿件版本。', '哪些来源是一手、二手或仅可背景引用。'],
      mayBelieve: ['传闻背后存在现实利益。', '公众需要一个比现有证据更完整的故事。'],
      doesNotKnow: ['警方内部全部记录。', '社团和运输机构内部的完整动机。'],
      accessChannels: ['报馆资料', '采访', '消息人', '公开记录']
    },
    longTermArcDirections: ['猎奇报道。', '认真调查。', '撤稿或被迫压稿。', '公开矛盾证据。', '选择不刊登某些事实。'],
    forbiddenConfirmations: ['不得预先确认她捏造新闻。', '不得把采访对象自动变成知情人。', '不得让新闻等于客观真相。']
  },
  {
    actorId: urbanLegendsFormalIds.actors.societyLiaison,
    name: '李炳坤',
    age: 31,
    tier: 'core',
    publicIdentity: '街面运输联络人',
    occupation: '地盘杂务与运输联络',
    commonPlaceId: urbanLegendsFormalIds.places.oldDistrictStreet,
    publicFacts: ['熟悉旧区夜间生意和非正式运输消息。', '会从警察、媒体和人流变化判断风险。'],
    desires: ['保护生意和地盘。', '利用信息差。', '避免组织成员被无谓卷入。'],
    fears: ['传闻招来警方和媒体长期关注。', '别人借怪谈破坏路线或敲诈。'],
    personality: '圆滑、会看风向，不愿替任何一种解释背书。',
    speechStyle: '话说一半留一半，习惯从现实利益提醒别人别急着下结论。',
    candidateSecretDomains: [
      {
        secretDomainId: 'liaison_rumor_cover',
        possibility: '有人借怪谈掩护普通违法活动。',
        possibleEvidenceKinds: ['街面消息', '运输记录', '人物行动']
      },
      {
        secretDomainId: 'liaison_business_pressure',
        possibility: '有人故意传播传闻压低某处生意或驱赶人流。',
        possibleEvidenceKinds: ['生意变化', '消息来源', '组织关系']
      },
      {
        secretDomainId: 'liaison_only_opportunist',
        possibility: '只是在利用既有传闻，并不知道失踪真相。',
        possibleEvidenceKinds: ['信息边界', '人物记忆', '行动时序']
      }
    ],
    informationBoundary: {
      knows: ['哪些夜间生意受传闻影响。', '自己接触到的街面消息来源。'],
      mayBelieve: ['有人在利用传闻。', '警方和媒体关注比怪谈本身更危险。'],
      doesNotKnow: ['失踪者的完整家庭情况。', '警方与运输机构全部记录。'],
      accessChannels: ['地盘成员', '司机与搬运关系', '生意人', '消息交易']
    },
    longTermArcDirections: ['利用或压制传闻。', '与玩家交易。', '误判后承担代价。', '把责任推给他人。', '发现传播失去控制。'],
    forbiddenConfirmations: ['不得预先确认社团是幕后。', '不得自动升级为暴力任务。', '不得把消息渠道写成全知网络。']
  },
  {
    actorId: urbanLegendsFormalIds.actors.juniorOfficer,
    name: '周伟明',
    age: 27,
    tier: 'supporting',
    publicIdentity: '基层警员',
    occupation: '香港警队基层警员',
    commonPlaceId: urbanLegendsFormalIds.places.oldDistrictStreet,
    publicFacts: ['接触过旧区巡逻或报案记录。', '权限和信息范围受所属单位与实际指派限制。'],
    desires: ['把记录对上。', '让家属得到具体回应。', '不越权承担不属于自己的案件。'],
    fears: ['被同僚认为受怪谈影响。', '程序错漏让真实线索消失。'],
    personality: '踏实、重程序，对无法写入报告的疑点保持谨慎。',
    speechStyle: '使用警务记录式短句；私下会明确区分报告内容和个人疑问。',
    candidateSecretDomains: [
      {
        secretDomainId: 'officer_unfiled_observation',
        possibility: '记得一处未进入正式记录的现场细节。',
        possibleEvidenceKinds: ['个人笔记', '巡逻同僚证词', '补录口供']
      },
      {
        secretDomainId: 'officer_procedural_pressure',
        possibility: '曾受到要求低调处理或缩小范围的程序压力。',
        possibleEvidenceKinds: ['上级指示', '报案处理记录', '同僚记忆']
      }
    ],
    informationBoundary: {
      knows: ['自己接触过的报案和巡逻内容。', '所属岗位允许查阅或跟进的范围。'],
      mayBelieve: ['事件值得继续核对。', '部分同僚只想尽快归类。'],
      doesNotKnow: ['跨单位完整案件信息。', '公司、媒体、社团和家庭的全部私密事实。'],
      accessChannels: ['巡逻同僚', '报案记录', '直属上级', '有限的内部查询']
    },
    longTermArcDirections: ['有限协助。', '坚持程序。', '与玩家形成专业信任。', '因权限退出。', '在组织压力下改变立场。'],
    forbiddenConfirmations: ['不得赋予他跨单位权限。', '不得让他代替玩家完成调查。', '不得预先确认警队压案。']
  }
];

export const urbanLegendsRelationshipSeeds: readonly UrbanLegendsRelationshipSeed[] = [
  {
    relationshipSeedId: 'urban_legends_hk1988_driver_dispatcher',
    actorIds: [urbanLegendsFormalIds.actors.driver, urbanLegendsFormalIds.actors.dispatcher],
    initialTension: '共同掌握交班与线路记录，互相依赖，也可能在追责时互相推卸。',
    mutualNeeds: ['司机需要调度记录证明自己。', '调度员需要司机说明记录缺口。'],
    possibleConflicts: ['谁应为漏记负责。', '保护同事还是保护机构。'],
    informationChannels: ['交班', '排班', '公司内部沟通'],
    runtimeKinds: ['signal', 'currentMatter', 'relationshipThread', 'actorMemory'],
    forbiddenAssumptions: ['不预设互相信任。', '不预设共同篡改记录。', '不预创建 RelationshipThread。']
  },
  {
    relationshipSeedId: 'urban_legends_hk1988_relative_reporter',
    actorIds: [urbanLegendsFormalIds.actors.relative, urbanLegendsFormalIds.actors.reporter],
    initialTension: '亲属需要曝光，记者需要故事；合作随时可能因私人边界和报道方式破裂。',
    mutualNeeds: ['亲属需要公众注意。', '记者需要一手家庭信息。'],
    possibleConflicts: ['隐私是否公开。', '标题是否夸张。', '消息发布时机。'],
    informationChannels: ['采访', '电话', '稿件', '公开报道'],
    runtimeKinds: ['signal', 'newsIssue', 'relationshipThread', 'actorMemory'],
    forbiddenAssumptions: ['不预设已经合作。', '不预设记者出卖亲属。', '不预创建新闻或关系事实。']
  },
  {
    relationshipSeedId: 'urban_legends_hk1988_reporter_neighbor',
    actorIds: [urbanLegendsFormalIds.actors.reporter, urbanLegendsFormalIds.actors.neighbor],
    initialTension: '记者能放大证词，街坊也能借媒体取得可信度；双方都可能改变对方的叙述。',
    mutualNeeds: ['记者需要具体目击。', '街坊希望自己的说法被认真对待。'],
    possibleConflicts: ['二手转述变成一手证词。', '报道删改语境。'],
    informationChannels: ['采访', '报纸', '街坊转述'],
    runtimeKinds: ['signal', 'newsIssue', 'relationshipThread', 'actorMemory'],
    forbiddenAssumptions: ['不预设证词真实。', '不预设记者故意误引。', '不让新闻成为真相。']
  },
  {
    relationshipSeedId: 'urban_legends_hk1988_liaison_driver',
    actorIds: [urbanLegendsFormalIds.actors.societyLiaison, urbanLegendsFormalIds.actors.driver],
    initialTension: '可能通过夜间运输与熟人消息发生接点，但双方都不愿承担对方的风险。',
    mutualNeeds: ['中间人需要了解路线是否受影响。', '司机可能需要街面信息或保持距离。'],
    possibleConflicts: ['消息交易被误解为共谋。', '传闻影响生意和工作。'],
    informationChannels: ['夜间运输', '熟人介绍', '街面消息'],
    runtimeKinds: ['signal', 'currentMatter', 'relationshipThread', 'actorMemory'],
    forbiddenAssumptions: ['不预设私下交易已经发生。', '不预设司机属于社团。', '不预设共同犯罪。']
  },
  {
    relationshipSeedId: 'urban_legends_hk1988_relative_neighbor',
    actorIds: [urbanLegendsFormalIds.actors.relative, urbanLegendsFormalIds.actors.neighbor],
    initialTension: '私人记忆与公共传闻互相冲突，双方都可能认为对方伤害了失踪者。',
    mutualNeeds: ['亲属需要街坊线索。', '街坊需要确认自己的记忆没有伤害家属。'],
    possibleConflicts: ['失踪者形象被传闻改写。', '家庭隐私进入社区叙事。'],
    informationChannels: ['街坊问询', '家属说明', '共同熟人'],
    runtimeKinds: ['signal', 'relationshipThread', 'actorMemory'],
    forbiddenAssumptions: ['不预设双方认识。', '不预设亲属隐瞒。', '不把公共传闻写成家庭事实。']
  },
  {
    relationshipSeedId: 'urban_legends_hk1988_officer_dispatcher',
    actorIds: [urbanLegendsFormalIds.actors.juniorOfficer, urbanLegendsFormalIds.actors.dispatcher],
    initialTension: '警方需要记录，运输机构优先维持运营并避免责任；基层双方权限都有限。',
    mutualNeeds: ['警员需要可核对记录。', '调度员需要明确调查范围与责任边界。'],
    possibleConflicts: ['记录调取范围。', '公司程序与警方程序不一致。'],
    informationChannels: ['正式询问', '报案跟进', '公司联络'],
    runtimeKinds: ['signal', 'currentMatter', 'relationshipThread', 'actorMemory'],
    forbiddenAssumptions: ['不预设正式立案。', '不赋予基层警员跨单位权限。', '不预设机构阻挠。']
  },
  {
    relationshipSeedId: 'urban_legends_hk1988_liaison_reporter',
    actorIds: [urbanLegendsFormalIds.actors.societyLiaison, urbanLegendsFormalIds.actors.reporter],
    initialTension: '消息可以交换，也可以被双方用来控制舆论或保护各自关系。',
    mutualNeeds: ['记者需要街面来源。', '中间人需要了解报道方向。'],
    possibleConflicts: ['消息来源曝光。', '报道将组织人物变成舆论目标。'],
    informationChannels: ['消息人', '电话', '街面会面', '公开报道'],
    runtimeKinds: ['signal', 'newsIssue', 'relationshipThread', 'actorMemory'],
    forbiddenAssumptions: ['不预设消息交易。', '不预设收买记者。', '不把社团说法当成事实。']
  }
];

export const urbanLegendsEntryRouteMatrix: readonly UrbanLegendsEntryRouteMatrixItem[] = [
  {
    identity: 'police',
    contactSources: ['夜间报案', '失踪记录', '司机与乘客陈述不一致', '巡逻时接触现场传闻', '上级要求低调核实'],
    interventionMotivations: ['履行当前岗位职责。', '回应家属。', '核对程序与记录差异。', '避免未经核实传闻影响警务判断。'],
    reasonablePermissions: ['接收和补录报案。', '在岗位授权内询问相关人员。', '核对当前单位可访问的记录。', '将线索移交有权限单位。'],
    restrictions: ['不自动建立刑事案件。', '不自动获得跨单位档案。', '不保证上级支持私人核实。', '不能把传闻当作搜查理由。'],
    realisticRisks: ['越权或程序投诉。', '家属不信任。', '同僚认为浪费警力。', '运输机构要求明确责任边界。'],
    initiallyVisibleActorIds: [
      urbanLegendsFormalIds.actors.juniorOfficer,
      urbanLegendsFormalIds.actors.relative,
      urbanLegendsFormalIds.actors.driver,
      urbanLegendsFormalIds.actors.dispatcher
    ],
    initiallyVisibleInformation: ['一则尚未完全核实的失踪或异常乘车说法。', '至少一个可核对的时间、地点或人物。', '警方记录与人物说法可能存在差异。'],
    ordinaryInitialRuntimeKinds: ['signal', 'currentMatter', 'relationshipThread', 'actorMemory'],
    caseCreationBoundary: {
      automaticOnExposure: false,
      stageRestriction: 'none',
      authorityRule: '只有具备警务权限的单位或人员可以正式创建或关联案件。',
      allowedConditions: [
        '本回合完成符合香港 1988 世界包程序的正式失踪报案登记并形成立案事实。',
        '有权限的上级或单位在本回合正式决定立案。',
        '已经存在的案件与巴士事件形成经过验证的事实关联。'
      ],
      forbiddenConditions: ['仅因接触传闻或选择 DLC 立案。', '仅因当前阶段是 street_rumor 立案。', '仅凭未经核实的异常说法升级为刑事案件。'],
      requiresExistingRuntimeGates: true
    },
    diversionRoutes: ['按普通报案处理后离开。', '将事项移交有权限单位。', '认为证据不足而暂不跟进。', '回到原有值班行动。']
  },
  {
    identity: 'civilian',
    contactSources: ['通勤经历', '街坊闲谈', '家人或同事未按时回来', '工作地点受传闻影响', '认识相关司机、乘客、记者或亲属'],
    interventionMotivations: ['保护生活关系。', '确认自己是否受影响。', '帮助熟人。', '判断传闻是否可信。'],
    reasonablePermissions: ['询问认识的人。', '查看公开报纸和生活记录。', '在公共地点观察。', '选择向警方或记者提供信息。'],
    restrictions: ['不会突然拥有职业调查权限。', '不能调取机构内部档案。', '不能因好奇强迫他人公开隐私。'],
    realisticRisks: ['工作或家庭关系受损。', '被街坊当成传闻传播者。', '个人信息进入媒体。', '误信传闻影响生活决定。'],
    initiallyVisibleActorIds: [
      urbanLegendsFormalIds.actors.neighbor,
      urbanLegendsFormalIds.actors.relative,
      urbanLegendsFormalIds.actors.reporter,
      urbanLegendsFormalIds.actors.driver
    ],
    initiallyVisibleInformation: ['街坊之间存在不同版本。', '传闻已经影响某个人或一项日常活动。', '报道和亲历说法并不等价。'],
    ordinaryInitialRuntimeKinds: ['signal', 'currentMatter', 'newsIssue', 'relationshipThread', 'actorMemory'],
    caseCreationBoundary: {
      automaticOnExposure: false,
      stageRestriction: 'none',
      authorityRule: '市民可以报案或提供证据，但只能由有权限的警务单位正式创建或关联案件。',
      allowedConditions: ['警方在本回合正式受理并形成合法立案事实。', '市民提供的事实与既有案件形成经过验证的关联。'],
      forbiddenConditions: ['仅因市民听到或相信传闻创建案件。', '由市民身份直接宣告正式立案。', '用 DLC 阶段代替警务程序。'],
      requiresExistingRuntimeGates: true
    },
    diversionRoutes: ['把消息当作闲谈。', '不愿卷入家属私事。', '离开相关地点。', '继续工作或家庭生活。']
  },
  {
    identity: 'gang_member',
    contactSources: ['夜间生意受影响', '有人借传闻掩护普通活动', '熟人与路线有关', '记者或警方进入地盘', '有人要求查清或压下消息'],
    interventionMotivations: ['保护生意与地盘。', '判断是否有人利用信息差。', '避免组织成员被卷入。', '利用或阻止传闻扩散。'],
    reasonablePermissions: ['询问街面熟人。', '观察地盘上的人流与生意变化。', '通过非正式关系交换消息。', '拒绝替任何一方承担风险。'],
    restrictions: ['不自动知道社团内部全部行动。', '不默认拥有警方记录。', '不把传闻直接变成暴力任务。', '不默认社团就是幕后。'],
    realisticRisks: ['引来警方或媒体关注。', '被组织内不同利益方利用。', '消息交易破坏关系。', '误判导致生意和地盘受损。'],
    initiallyVisibleActorIds: [
      urbanLegendsFormalIds.actors.societyLiaison,
      urbanLegendsFormalIds.actors.driver,
      urbanLegendsFormalIds.actors.dispatcher,
      urbanLegendsFormalIds.actors.reporter
    ],
    initiallyVisibleInformation: ['传闻正在改变某处生意或人流。', '有人可能从传闻获益，但幕后尚未成立。', '警方和媒体关注本身会产生风险。'],
    ordinaryInitialRuntimeKinds: ['signal', 'currentMatter', 'newsIssue', 'relationshipThread', 'actorMemory'],
    caseCreationBoundary: {
      automaticOnExposure: false,
      stageRestriction: 'none',
      authorityRule: '社团人物可以提供消息或成为案件相关人，但只能由有权限的警务单位正式创建或关联案件。',
      allowedConditions: ['警方基于本回合已核实事实正式立案。', '社团相关事实与既有案件形成经过验证的关联。'],
      forbiddenConditions: ['仅因地盘传闻或利益冲突创建案件。', '由社团身份直接宣告正式立案。', '把社团涉入自动当作犯罪事实。'],
      requiresExistingRuntimeGates: true
    },
    diversionRoutes: ['认为无利可图而不介入。', '只提醒成员远离。', '把事项交给更合适的人。', '继续处理原有组织事务。']
  }
];

export const urbanLegendsTruthBoundary: UrbanLegendsTruthBoundary = {
  confirmableRealityKinds: [
    '某人在特定时间和地点出现。',
    '某条记录缺失、补写或发生版本差异。',
    '某人改变过说法。',
    '某件物品存在并有可核对来源。',
    '某篇新闻确实发布、修改或撤回。',
    '某项生意、关系或组织行动受到传闻影响。'
  ],
  ambiguousExplanationKinds: [
    '记忆错误或疲劳。',
    '误认和时间记录不准。',
    '谣言污染。',
    '有意隐瞒但目的不明。',
    '普通违法活动。',
    '自主离开。',
    '媒体加工。',
    '机构失误、心理压力或巧合。'
  ],
  unexplainedResidueRules: [
    '残余必须是具体时间、地点、物件或独立证词差异。',
    '残余不得自动扩张为超自然系统。',
    '残余不能让所有人物共享同一答案。',
    '玩家可以形成可行动结论，而不必解释全部细节。'
  ],
  forbiddenObjectiveFacts: [
    '鬼魂客观存在。',
    '巴士是超自然实体。',
    '失踪者被灵异力量带走。',
    '某个角色必然是幕后或必然说谎。',
    '社团制造了全部怪谈。',
    '某一现实解释必然覆盖全部事实。',
    '玩家一定能获得所有证据。'
  ]
};

const alphaStageIds = [
  'street_rumor',
  'first_clues',
  'interest_conflict',
  'truth_investigation',
  'aftermath'
] as const;

const formalStageIds = [
  urbanLegendsFormalIds.stages.streetRumor,
  urbanLegendsFormalIds.stages.firstClues,
  urbanLegendsFormalIds.stages.interestConflict,
  urbanLegendsFormalIds.stages.truthInvestigation,
  urbanLegendsFormalIds.stages.aftermath
] as const;

const alphaNodeIds = [
  'reported_missing_passenger',
  'neighborhood_rumor',
  'route_business_rumor',
  'driver_testimony',
  'old_route_records',
  'contradictory_witness',
  'press_exaggeration',
  'society_uses_rumor',
  'internal_disagreement',
  'timeline_reconstruction',
  'route_surveillance',
  'mundane_lead',
  'public_account',
  'unanswered_detail',
  'abandoned_inquiry'
] as const;

const formalNodeIds = [
  urbanLegendsFormalIds.nodes.reportedMissingPassenger,
  urbanLegendsFormalIds.nodes.neighborhoodRumor,
  urbanLegendsFormalIds.nodes.routeBusinessRumor,
  urbanLegendsFormalIds.nodes.driverTestimony,
  urbanLegendsFormalIds.nodes.oldRouteRecords,
  urbanLegendsFormalIds.nodes.contradictoryWitness,
  urbanLegendsFormalIds.nodes.pressExaggeration,
  urbanLegendsFormalIds.nodes.societyUsesRumor,
  urbanLegendsFormalIds.nodes.internalDisagreement,
  urbanLegendsFormalIds.nodes.timelineReconstruction,
  urbanLegendsFormalIds.nodes.routeSurveillance,
  urbanLegendsFormalIds.nodes.mundaneLead,
  urbanLegendsFormalIds.nodes.publicAccount,
  urbanLegendsFormalIds.nodes.unansweredDetail,
  urbanLegendsFormalIds.nodes.abandonedInquiry
] as const;

export const urbanLegendsAlphaToFormalIdentityAudit: readonly UrbanLegendsAssetIdentityAudit[] = [
  {
    assetType: 'dlc',
    alphaId: 'urban_legends_alpha',
    formalId: urbanLegendsFormalManifest.dlcId,
    disposition: 'freeze_alpha_create_formal_counterpart',
    reason: 'Alpha 绑定与正式版产品身份分离，不做自动迁移。'
  },
  {
    assetType: 'arc',
    alphaId: 'official-dlc:urban_legends_alpha:midnight_bus',
    formalId: urbanLegendsFormalIds.arcKey,
    disposition: 'freeze_alpha_create_formal_counterpart',
    reason: '正式 Arc 使用 DLC、世界包和事件共同组成的稳定内容身份。'
  },
  {
    assetType: 'event',
    alphaId: 'official_dlc_urban_legends_midnight_bus',
    formalId: urbanLegendsFormalIds.eventGroup,
    disposition: 'freeze_alpha_create_formal_counterpart',
    reason: '避免正式内容改写 Alpha 事件组语义。'
  },
  ...[
    ['official_dlc_urban_legends_night_bus_driver', urbanLegendsFormalIds.actors.driver],
    ['official_dlc_urban_legends_missing_passenger_relative', urbanLegendsFormalIds.actors.relative],
    ['official_dlc_urban_legends_old_neighbor', urbanLegendsFormalIds.actors.neighbor],
    ['official_dlc_urban_legends_young_reporter', urbanLegendsFormalIds.actors.reporter],
    ['official_dlc_urban_legends_junior_officer', urbanLegendsFormalIds.actors.juniorOfficer],
    ['official_dlc_urban_legends_society_member', urbanLegendsFormalIds.actors.societyLiaison]
  ].map(([alphaId, formalId]) => ({
    assetType: 'actor' as const,
    alphaId,
    formalId,
    disposition: 'freeze_alpha_create_formal_counterpart' as const,
    reason: '正式人物保留角色功能但使用独立稳定 Actor ID；候选秘密不继承为事实。'
  })),
  ...[
    ['official_dlc_urban_legends_midnight_bus_terminal', urbanLegendsFormalIds.places.terminal],
    ['official_dlc_urban_legends_old_district_street', urbanLegendsFormalIds.places.oldDistrictStreet],
    ['official_dlc_urban_legends_cha_chaan_teng', urbanLegendsFormalIds.places.chaChaanTeng]
  ].map(([alphaId, formalId]) => ({
    assetType: 'place' as const,
    alphaId,
    formalId,
    disposition: 'freeze_alpha_create_formal_counterpart' as const,
    reason: '正式香港适配地点使用独立稳定 Place ID。'
  })),
  {
    assetType: 'news',
    alphaId: 'official_dlc_urban_legends_midnight_bus_news',
    formalId: urbanLegendsFormalIds.news.firstPublicRumor,
    disposition: 'freeze_alpha_create_formal_counterpart',
    reason: '正式首次公共传闻模板不覆盖 Alpha 新闻。'
  },
  ...alphaStageIds.map((alphaId, index) => ({
    assetType: 'stage' as const,
    alphaId,
    formalId: formalStageIds[index],
    disposition: 'freeze_alpha_create_formal_counterpart' as const,
    reason: 'Alpha Stage 合同冻结；正式版以独立稳定 ID 建立叙事功能合同。'
  })),
  ...alphaNodeIds.map((alphaId, index) => ({
    assetType: 'node' as const,
    alphaId,
    formalId: formalNodeIds[index],
    disposition: 'freeze_alpha_create_formal_counterpart' as const,
    reason: 'Alpha Node 冻结；正式版以独立稳定 ID 建立事实、推进和写回边界。'
  }))
];
