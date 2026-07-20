import type { CityOrganizationAnchor } from './cityPowerTypes';

export interface TriadActivityAreaAnchor {
  placeId: string;
  label: string;
  activitySummary: string;
  localPressureSummary: string;
}

export interface LateColonialTriadOrganizationAnchor extends CityOrganizationAnchor {
  activityAreas: TriadActivityAreaAnchor[];
}

type TriadOrganizationInput = Omit<
  CityOrganizationAnchor,
  'type' | 'organizationType' | 'territoryPlaceIds' | 'visibilityByIdentity'
> & {
  activityAreas: TriadActivityAreaAnchor[];
};

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
    headquartersPlaceIds: ['place_portland_street'],
    activityAreas: [
      {
        placeId: 'place_portland_street',
        label: '砵兰街',
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
        label: '砵兰街',
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
    headquartersPlaceIds: ['place_portland_street'],
    activityAreas: [
      {
        placeId: 'place_portland_street',
        label: '砵兰街',
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
