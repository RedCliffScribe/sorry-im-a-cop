import type { CityOrganizationAnchor } from './cityPowerTypes';

export interface TriadActivityAreaAnchor {
  placeId: string;
  label: string;
  activitySummary: string;
  localPressureSummary: string;
}

export interface TriadStructureTierAnchor {
  key: string;
  label: string;
  role: string;
  summary: string;
  children?: TriadStructureTierAnchor[];
}

export interface LateColonialTriadOrganizationAnchor extends CityOrganizationAnchor {
  organizationStyle: string;
  decisionCulture: string;
  leadershipSelection: string;
  operatingLines: string[];
  customaryRules: string[];
  internalFaultLines: string[];
  structureTemplate: TriadStructureTierAnchor[];
  activityAreas: TriadActivityAreaAnchor[];
}

type TriadOrganizationInput = Omit<
  LateColonialTriadOrganizationAnchor,
  'type' | 'organizationType' | 'territoryPlaceIds' | 'visibilityByIdentity'
>;

const triadVisibility = {
  police: 'restricted',
  civilian: 'rumor',
  gang_member: 'rumor'
} as const;

function triadOrganization(input: TriadOrganizationInput): LateColonialTriadOrganizationAnchor {
  return {
    ...input,
    type: 'CityOrganizationAnchor',
    organizationType: 'triad',
    territoryPlaceIds: input.activityAreas.map((area) => area.placeId),
    visibilityByIdentity: triadVisibility
  };
}

export const hkLateColonialTriadOrganizations: LateColonialTriadOrganizationAnchor[] = [
  triadOrganization({
    organizationId: 'org_sun_yee_on',
    displayName: '新义安',
    disguisedNames: ['新记', '东九龙大社团', '电影圈保护线'],
    activeYears: { from: 1919, to: 1997 },
    publicKnowledge: '市面传闻中的大型三合会网络，常与夜场、电影圈和街面保护费故事相连。',
    promptSafeProfile: '新义安在传闻里更像一张人情和恐吓的网，名字出现时往往意味着有人不想公开出面。',
    organizationStyle: '较集中地按地区线与生意线分工；上层口径重要，外围通常只知道自己的上线和差事。',
    decisionCulture: '重大跨区行动重视上层授权与风险切割，地区负责人在权限内处理日常人事和场所关系。',
    leadershipSelection: '本局按核心主事层与资深关系人内部协调处理交接，考量控制力、资源、关系与惹警风险；不是公开普选。',
    operatingLines: ['旺角夜场与看场关系', '东九龙工厦、货运与外围人手', '电影制作与娱乐业外围关系'],
    customaryRules: ['越区或借字头名号前先报上线', '惹来警方高压时优先切割未经授权的个人行动', '娱乐圈事务尤其重视名声与曝光代价'],
    internalFaultLines: ['地区线与生意线争夺资源', '强硬街面手段与低调经营之间的分歧', '外围人物越权后是否保人'],
    structureTemplate: [
      {
        key: 'core',
        label: '核心主事层',
        role: '统筹字头方向与重大授权',
        summary: '玩家最初只知道存在能够拍板跨区与重大事务的核心层，具体人物须由剧情确认。',
        children: [
          {
            key: 'district_lines',
            label: '地区线负责人',
            role: '分区人事与街面协调',
            summary: '各地区线拥有日常处理空间，但重大升级与跨区行动仍需向上交代。',
            children: [
              {
                key: 'frontline',
                label: '场所与外围人手',
                role: '看场、联络、传话与具体执行',
                summary: '玩家最容易接触的一层，通常不知道完整组织结构。'
              }
            ]
          },
          {
            key: 'business_lines',
            label: '生意线协调人',
            role: '娱乐、运输与外围营生协调',
            summary: '按具体生意和关系网运作，不等同于统一控制所有相关行业。'
          }
        ]
      }
    ],
    headquartersPlaceIds: ['place_portland_street'],
    activityAreas: [
      {
        placeId: 'place_portland_street',
        label: '钵兰街',
        activitySummary: '旺角至油麻地夜场、旅馆和街面联络密集的一条活动线。',
        localPressureSummary: '霓虹夜场、看场人与警方巡逻并存，街面越权很快会引来多方压力。'
      },
      {
        placeId: 'place_kwun_tong_industrial_area',
        label: '观塘工业区',
        activitySummary: '东九龙工厦、货仓、运输和基层工人关系构成的活动线。',
        localPressureSummary: '货物流向、夜班人手和劳资纠纷交错，消息常不完整，也容易惊动警方。'
      },
      {
        placeId: 'place_golden_harvest_studio',
        label: '嘉禾片场与电影圈',
        activitySummary: '围绕电影制作、场务、投资人与娱乐业外围关系形成的活动线。',
        localPressureSummary: '媒体曝光、明星名声和商业投资会放大每一次失控，不能把传闻直接当成已知事实。'
      }
    ],
    relatedOrganizationIds: ['org_wo_shing_wo', 'org_14k', 'org_golden_harvest'],
    sectorTags: ['triad', 'street_power', 'entertainment_rumor'],
    influence: 90,
    defaultVisibility: 'rumor',
    sourceConfidence: 'medium'
  }),
  triadOrganization({
    organizationId: 'org_wo_shing_wo',
    displayName: '和胜和',
    disguisedNames: ['和字头', '旺角叔父辈', '油尖旺社团线'],
    activeYears: { from: 1930, to: 1997 },
    publicKnowledge: '市井传闻中的老牌社团网络，在夜市、码头和街面纠纷里常被提起。',
    promptSafeProfile: '和胜和靠旧规矩和叔父辈面子维系秩序，真正的话事人很少在明面上出现。',
    organizationStyle: '老牌和字头式的人情网络，叔父协调、地区堂口与街坊信用都能影响实际权力。',
    decisionCulture: '大事讲规矩、辈分与地区支持；单一地区人物难以只凭声势长期压过其他线。',
    leadershipSelection: '本局以资深人物协调、地区支持与内部认可形成话事结果；出现交接时会经历试探、拉拢和议事，不自动在一天内完成。',
    operatingLines: ['庙街夜市与摊档关系', '旺角夜场与街面纠纷协调', '果栏、货车司机与夜班人手'],
    customaryRules: ['失信和坏规矩会留下长期代价', '未经协调不要把地区小事升级为字头冲突', '叔父调停不等于无条件替任何成员兜底'],
    internalFaultLines: ['地区堂口之间的支持分配', '老规矩与新生意做法冲突', '街坊信用与短期利益拉扯'],
    structureTemplate: [
      {
        key: 'seat',
        label: '坐馆与议事层',
        role: '对外代表与内部拍板',
        summary: '权力依赖资深人物、地区支持和实际协调能力，不只是一个名义称号。',
        children: [
          {
            key: 'elders',
            label: '叔父与调停人',
            role: '规矩、辈分与争端协调',
            summary: '可以影响议事与交接，但未必直接指挥每一条地区线。'
          },
          {
            key: 'halls',
            label: '地区堂口',
            role: '地区场所、人事与日常事务',
            summary: '各地区堂口按自身关系和资源处理事务，同时受字头规矩约束。',
            children: [
              {
                key: 'street_crews',
                label: '街面小组',
                role: '看场、收风、联络与执行',
                summary: '只掌握本区和本组需要知道的事。'
              }
            ]
          }
        ]
      }
    ],
    headquartersPlaceIds: ['place_temple_street_night_market'],
    activityAreas: [
      {
        placeId: 'place_temple_street_night_market',
        label: '庙街夜市',
        activitySummary: '围绕夜市摊档、茶档、游客与街坊生意形成的油麻地活动线。',
        localPressureSummary: '旧规矩、摊贩人情和警方巡查同时存在，失信会比一时输赢留下更久的后果。'
      },
      {
        placeId: 'place_portland_street',
        label: '钵兰街',
        activitySummary: '夜场、旅馆和旺角街面人物交汇的活动线。',
        localPressureSummary: '对家、夜场经营者与警员都在观察，擅自升级冲突很容易越过自己的权限。'
      },
      {
        placeId: 'place_yau_ma_tei_fruit_market',
        label: '油麻地果栏',
        activitySummary: '依托夜间批发、货车司机和散工关系形成的活动线。',
        localPressureSummary: '作息颠倒、货物频繁流动，口供和消息很容易因利益关系而变化。'
      }
    ],
    relatedOrganizationIds: ['org_sun_yee_on', 'org_14k', 'org_hk_police'],
    sectorTags: ['triad', 'street_power', 'old_rules'],
    influence: 88,
    defaultVisibility: 'rumor',
    sourceConfidence: 'medium'
  }),
  triadOrganization({
    organizationId: 'org_14k',
    displayName: '十四K',
    disguisedNames: ['十四号', '老牌堂口', '跨境社团线'],
    activeYears: { from: 1945, to: 1997 },
    publicKnowledge: '传闻中跨区活动的老牌三合会网络，赌场、走私和街面冲突故事经常挂在它名下。',
    promptSafeProfile: '十四K在坊间像一个危险标签，真实边界模糊，却足以让证人和小贩改口。',
    organizationStyle: '支系与地区线较分散，同一名号下的联络链和权限可能并不相同，不能当成单一公司式总部。',
    decisionCulture: '各支系先处理自身地区与联络事务；跨区合作依赖具体中间人、利益与临时协调。',
    leadershipSelection: '本局按支系内部推举、资深认可与实际控制力处理各自话事安排；某支系的主事人不自动成为全港唯一领袖。',
    operatingLines: ['重庆大厦旅馆、兑换与旅客圈', '启德接机、航空货运与交通联络', '港澳船期、现金与跨境联系人'],
    customaryRules: ['先确认支系和联络链再执行跨区交代', '不要把共享名号误当成无限支援', '边检、海关与警方压力升高时及时切割高风险环节'],
    internalFaultLines: ['不同支系之间的名号与权限边界', '跨境利益如何分配', '临时合作失败后的责任归属'],
    structureTemplate: [
      {
        key: 'federation',
        label: '支系名义层',
        role: '维系名号、旧关系与跨线协调',
        summary: '不存在对所有地区事务都能直接下令的透明单一总部。',
        children: [
          {
            key: 'branch_heads',
            label: '支系主事人',
            role: '各支系与地区线拍板',
            summary: '权力范围取决于自身人手、地区、联络与实际支持。',
            children: [
              {
                key: 'contacts',
                label: '地区与跨境联络',
                role: '接应、认人、货运与消息转交',
                summary: '联络人通常只知道当前链路，不掌握其他支系全貌。'
              }
            ]
          },
          {
            key: 'mediators',
            label: '跨线中间人',
            role: '临时合作与争端协调',
            summary: '依靠具体信誉和利益撮合，不是常设统一指挥层。'
          }
        ]
      }
    ],
    headquartersPlaceIds: ['place_chungking_mansions'],
    activityAreas: [
      {
        placeId: 'place_chungking_mansions',
        label: '重庆大厦',
        activitySummary: '尖沙咀旅馆、兑换、商贩和多语言旅客圈形成的活动线。',
        localPressureSummary: '人员与消息来源复杂，任何跨区交代都必须确认联络链，不能把传闻当成完整组织情报。'
      },
      {
        placeId: 'place_kai_tak_airport',
        label: '启德机场',
        activitySummary: '围绕接机、航空货运、旅客与九龙城交通形成的活动线。',
        localPressureSummary: '机场警务、海关与航班时限同时存在，临时变化会迅速放大风险。'
      },
      {
        placeId: 'place_macau_ferry_terminal',
        label: '港澳码头',
        activitySummary: '围绕港澳客轮、旅客、现金和跨境联系人形成的活动线。',
        localPressureSummary: '船期、边检与跨境关系增加切割风险，当前区域身份不等于拥有跨境指挥权。'
      }
    ],
    relatedOrganizationIds: ['org_sun_yee_on', 'org_wo_shing_wo', 'org_hk_police'],
    sectorTags: ['triad', 'cross_border', 'street_power'],
    influence: 88,
    defaultVisibility: 'rumor',
    sourceConfidence: 'medium'
  }),
  triadOrganization({
    organizationId: 'org_shui_fong',
    displayName: '和安乐（水房）',
    disguisedNames: ['水房', '和安乐', '旧区水房线'],
    activeYears: { from: 1930, to: 1997 },
    publicKnowledge: '坊间传闻中的老牌社团名号，常与旧区夜场、外围营生和人情关系相连。',
    promptSafeProfile: '水房在街面传闻里更像旧区人情网，消息多由夜场、茶档和外围跑腿慢慢露出。',
    organizationStyle: '以旧区熟人、夜场和茶档关系维系的较紧密网络，实际影响常落在少数本地关系人手中。',
    decisionCulture: '先看熟人信用和是否把麻烦带回圈内；大事由老一辈与本地负责人物协调。',
    leadershipSelection: '本局以老一辈背书、本地人脉和处理事务能力形成主事安排；交接更像内部协调与承接关系，而非公开竞选。',
    operatingLines: ['钵兰街旧区夜场与茶档', '庙街街坊、摊档与熟人引介', '小规模看场、传话与外围营生'],
    customaryRules: ['熟人引介意味着要对后果负责', '不要擅自借名号扩大冲突', '把警方注意带回固定圈子会失去信任'],
    internalFaultLines: ['老关系与年轻行动派的做法分歧', '有限场所与人手如何分配', '保住熟人还是迅速切割风险人物'],
    structureTemplate: [
      {
        key: 'local_core',
        label: '旧区主事层',
        role: '本地关系与重大事务协调',
        summary: '权力来自长期熟人网络和处理本区事务的能力。',
        children: [
          {
            key: 'senior_contacts',
            label: '老一辈关系人',
            role: '背书、调停与规矩提醒',
            summary: '影响主事安排和冲突处理，但未必直接带领街面人手。'
          },
          {
            key: 'venue_lines',
            label: '夜场与街坊线',
            role: '场所关系、传话与本地执行',
            summary: '围绕具体场所与熟人圈运作。',
            children: [
              {
                key: 'helpers',
                label: '外围帮手',
                role: '看场、跑腿与消息转交',
                summary: '权限有限，越权最容易同时失去上线和街坊信任。'
              }
            ]
          }
        ]
      }
    ],
    headquartersPlaceIds: ['place_portland_street'],
    activityAreas: [
      {
        placeId: 'place_portland_street',
        label: '钵兰街',
        activitySummary: '围绕旧区夜场、茶档和熟人引介形成的旺角活动线。',
        localPressureSummary: '熟人网络看似松散，实际上很看重交代、面子和是否把警方注意带回圈内。'
      },
      {
        placeId: 'place_temple_street_night_market',
        label: '庙街夜市',
        activitySummary: '围绕夜市、茶档与油麻地旧街坊关系形成的活动线。',
        localPressureSummary: '当地关系重叠且消息传播很快，越权借名号办事容易同时得罪上线和街坊。'
      }
    ],
    relatedOrganizationIds: ['org_sun_yee_on', 'org_wo_shing_wo', 'org_14k'],
    sectorTags: ['triad', 'nightlife', 'street_power'],
    influence: 84,
    defaultVisibility: 'rumor',
    sourceConfidence: 'medium'
  }),
  triadOrganization({
    organizationId: 'org_wo_hop_to',
    displayName: '和合图',
    disguisedNames: ['合图', '和字旧线', '旧派字头'],
    activeYears: { from: 1900, to: 1997 },
    publicKnowledge: '坊间知道的旧派社团名号之一，规模和活跃范围常随地区传闻而变化。',
    promptSafeProfile: '和合图适合承载旧街坊、街市、小型堂口和跨社团摩擦，具体人物必须从线索逐步确认。',
    organizationStyle: '规模较小、依赖地区堂口与旧街坊信用的网络，资源和跨区支援都比大字头有限。',
    decisionCulture: '本区主事人围绕现有人手、场所和街坊关系作决定，遇到跨社团冲突往往先找中间人。',
    leadershipSelection: '本局由地区堂口骨干、资深关系人与实际资源共同确认主事人；若支持不足，可能形成暂代或分裂，而非自动顺利继任。',
    operatingLines: ['庙街夜市、茶档与旧街坊', '果栏夜班、货车与装卸人手', '小型堂口的看场、传话与纠纷调停'],
    customaryRules: ['资源有限时避免无把握的声势行动', '街坊信用比短期逞强更难恢复', '跨区借兵或借名号必须先谈清代价'],
    internalFaultLines: ['有限资源由哪条地区线优先使用', '依附大字头还是维持自身名号', '老街坊路线与激进行动之间的冲突'],
    structureTemplate: [
      {
        key: 'hall',
        label: '地区堂口主事',
        role: '本区人事、场所与对外协调',
        summary: '实际权力紧贴具体地区和有限资源，名号不等于全港动员力。',
        children: [
          {
            key: 'senior_network',
            label: '资深关系人',
            role: '街坊信用、调停与外部联系',
            summary: '帮助维持旧关系，也可能影响暂代或继任安排。'
          },
          {
            key: 'local_crews',
            label: '街市与货运小组',
            role: '本区看场、货运联络与具体执行',
            summary: '各小组围绕具体场所谋生，支援能力有限。',
            children: [
              {
                key: 'associates',
                label: '外围熟人',
                role: '临时帮手、消息与带路',
                summary: '可能只因人情参与一次，不自动等同正式成员。'
              }
            ]
          }
        ]
      }
    ],
    headquartersPlaceIds: ['place_temple_street_night_market'],
    activityAreas: [
      {
        placeId: 'place_temple_street_night_market',
        label: '庙街夜市',
        activitySummary: '依靠旧街坊、夜市摊档和茶档关系维持的油麻地活动线。',
        localPressureSummary: '小型堂口资源有限，关系和信用比声势重要，越权后很难得到额外支援。'
      },
      {
        placeId: 'place_yau_ma_tei_fruit_market',
        label: '油麻地果栏',
        activitySummary: '依托果栏夜班、货车、装卸工和街市人情形成的活动线。',
        localPressureSummary: '货运与散工关系紧密，事情办砸后很容易失去有限的靠山和消息来源。'
      }
    ],
    relatedOrganizationIds: ['org_wo_shing_wo', 'org_shui_fong', 'org_14k'],
    sectorTags: ['triad', 'old_rules', 'street_market'],
    influence: 78,
    defaultVisibility: 'rumor',
    sourceConfidence: 'medium'
  })
];
