import type {
  ScreenCharacterCategory,
  ScreenCharacterMedium,
  ScreenCharacterSeedCard
} from './screenCharacterSeedTypes';

export interface ScreenCharacterExpansionWork {
  id: string;
  title: string;
  titleEn?: string;
  medium: ScreenCharacterMedium;
  availableYears: {
    from: number;
    to?: number;
  };
  worldpackPlacementAnchor?: string;
}

export interface ScreenCharacterExpansionDraft {
  id: string;
  displayName: string;
  englishName?: string;
  aliases?: string[];
  gender: ScreenCharacterSeedCard['gender'];
  ageRange: ScreenCharacterSeedCard['ageRange'];
  category: ScreenCharacterCategory;
  currentIdentity?: ScreenCharacterSeedCard['currentIdentity'];
  publicIdentity: string;
  actualIdentitySummary?: string;
  positionSummary?: string;
  profileSummary: string;
  personality: string;
  speechStyle?: string;
  motivation: string;
  longTermGoal?: string;
  values?: string;
  capabilityProfile?: string;
  relationshipAnchors?: string[];
  accessRoutes?: string[];
  promptHooks?: string[];
  sectors?: string[];
  eraTags?: string[];
  usualPlaceIds?: ScreenCharacterSeedCard['usualPlaceIds'];
  appearanceAnchor?: string;
  clothingAnchor?: string;
  availableYears?: Partial<ScreenCharacterSeedCard['availableYears']>;
  worldpackPlacementAnchor?: string;
  importance?: number;
  sourceConfidence?: ScreenCharacterSeedCard['sourceConfidence'];
}

const defaults: Record<
  ScreenCharacterCategory,
  Pick<
    ScreenCharacterSeedCard,
    'sectors' | 'appearanceAnchor' | 'clothingAnchor' | 'capabilityProfile' | 'values'
  > & { speechStyle: string; accessRoutes: string[] }
> = {
  police_law: {
    sectors: ['police', 'law', 'case', 'investigation'],
    appearanceAnchor: '外观体现长期执法、调查或法庭工作的职业习惯，并按角色当年年龄与经历生成。',
    clothingAnchor: '按当年岗位穿警服、便装或法庭职业服装，服饰随场景和职级变化。',
    capabilityProfile: '侦查、观察、行动或制度判断较强，具体能力必须服从当年职级和既有经历。',
    values: '证据、职责、程序、同僚与个人判断之间的平衡。',
    speechStyle: '表达直接、有职业重点；紧张时先确认事实，再表明立场。',
    accessRoutes: ['案件协作或报案', '警署、法庭或律师楼工作关系', '可靠线索或证人关系牵连']
  },
  triad_crime: {
    sectors: ['triad', 'crime', 'nightlife', 'street'],
    appearanceAnchor: '外观体现街面经历、风险意识与当年地位，不把所有人生成成同一种帮派脸谱。',
    clothingAnchor: '按身份穿街头便装、夜场服装或讲究西装，服饰必须符合当年财富与场合。',
    capabilityProfile: '街面判断、行动、谈判或意志突出，具体能力服从其当年层级与阅历。',
    values: '生存、利益、人情、面子与自身认定的规矩。',
    speechStyle: '说话重试探和分寸；身份越高越少把真正意图一次讲尽。',
    accessRoutes: ['街面冲突或夜场关系', '债务、保护或中间人牵线', '案件、交易或地盘利益自然指向']
  },
  business_finance: {
    sectors: ['business', 'finance', 'contract', 'office'],
    appearanceAnchor: '外观体现商界身份、压力与个人控制力，并按当年职位与财力生成。',
    clothingAnchor: '以八九十年代香港商务服装为主，正式程度按场合和财富变化。',
    capabilityProfile: '思考、谈判、资源整合或风险判断突出，具体能力服从当年职位与履历。',
    values: '信誉、利益、控制、家庭责任与长期位置。',
    speechStyle: '措辞讲利益和后果，习惯保留余地，重要承诺不会轻易出口。',
    accessRoutes: ['公司、银行或交易关系', '合约、债务或投资纠纷', '职业人脉与家族关系介绍']
  },
  media_entertainment: {
    sectors: ['media', 'entertainment', 'film', 'music'],
    appearanceAnchor: '外观体现传媒或娱乐行业的职业形象，并按角色当年阶段生成。',
    clothingAnchor: '按通告、舞台、片场或私人场景选择有年代感的服装。',
    capabilityProfile: '表达、观察、社交或专业创作能力突出，具体能力服从当年职业阶段。',
    values: '作品、机会、名声、感情与个人自主。',
    speechStyle: '表达有个人节奏，在公开场合和私人场合会使用不同分寸。',
    accessRoutes: ['片场、电视台或唱片公司工作关系', '采访、通告或合约纠纷', '朋友与行业人脉介绍']
  },
  civilian_relationship: {
    sectors: ['civilian', 'family', 'community', 'workplace'],
    appearanceAnchor: '外观体现其生活阶层、职业和当年精神状态，不因知名度自动华丽化。',
    clothingAnchor: '使用符合职业、收入、年龄和场合的八九十年代香港日常服装。',
    capabilityProfile: '能力分布贴近职业与人生经历，不因角色辨识度自动全能。',
    values: '家庭、尊严、工作、感情与现实生活的可持续性。',
    speechStyle: '按家庭和职业身份自然表达，情绪变化来自当下关系而非复述原作台词。',
    accessRoutes: ['工作、住所或社区关系', '亲友转介', '突发事件或长期生活压力']
  }
};

function identityHooks(
  name: string,
  identity: ScreenCharacterSeedCard['currentIdentity']
): ScreenCharacterSeedCard['identityHooks'] {
  const identityLabel =
    identity === 'police' ? '警务或法律岗位' : identity === 'gang_member' ? '街面或社团身份' : '社会身份';
  return {
    police: `只有案件、报案、工作或可靠线索自然涉及${name}时才建立接触；按其当年的${identityLabel}处理，不得因资料入选而默认在场。`,
    civilian: `只有工作、住所、亲友或社会事件自然涉及${name}时才建立接触；按其当年的${identityLabel}处理，不得强行安排偶遇。`,
    gang_member: `只有街面关系、利益、债务、冲突或中间人自然涉及${name}时才建立接触；按其当年的${identityLabel}处理，不得自动写成同一社团成员。`
  };
}

export function buildScreenCharacterExpansion(
  work: ScreenCharacterExpansionWork,
  drafts: ScreenCharacterExpansionDraft[]
): ScreenCharacterSeedCard[] {
  return drafts.map((draft) => {
    const categoryDefault = defaults[draft.category];
    const currentIdentity = draft.currentIdentity ?? 'civilian';
    const availableYears = {
      from: draft.availableYears?.from ?? work.availableYears.from,
      to: draft.availableYears?.to ?? work.availableYears.to ?? 1996
    };
    const placementAnchor = draft.worldpackPlacementAnchor ?? work.worldpackPlacementAnchor;
    return {
      type: 'ScreenCharacterSeedCard',
      id: draft.id,
      canonicalCharacterId: draft.id,
      displayName: draft.displayName,
      englishName: draft.englishName,
      recognitionAliases: Array.from(new Set(draft.aliases ?? [])),
      sourceWorkId: work.id,
      sourceWorkTitle: work.title,
      sourceWorkTitleEn: work.titleEn,
      medium: work.medium,
      availableYears,
      worldpackPlacementAnchor: placementAnchor,
      category: draft.category,
      sectors: Array.from(new Set([...categoryDefault.sectors, ...(draft.sectors ?? [])])),
      eraTags: Array.from(
        new Set([
          work.title,
          work.medium === 'film' ? '香港电影角色' : '香港电视角色',
          ...(draft.eraTags ?? [])
        ])
      ),
      usualPlaceIds: [...(draft.usualPlaceIds ?? [])],
      gender: draft.gender,
      ageRange: { ...draft.ageRange },
      currentIdentity,
      publicIdentity: draft.publicIdentity,
      actualIdentitySummary: draft.actualIdentitySummary ?? draft.publicIdentity,
      positionSummary: draft.positionSummary ?? draft.publicIdentity,
      profileSummary: draft.profileSummary,
      appearanceAnchor: draft.appearanceAnchor ?? categoryDefault.appearanceAnchor,
      clothingAnchor: draft.clothingAnchor ?? categoryDefault.clothingAnchor,
      personality: draft.personality,
      speechStyle: draft.speechStyle ?? categoryDefault.speechStyle,
      motivation: draft.motivation,
      longTermGoal: draft.longTermGoal ?? draft.motivation,
      values: draft.values ?? categoryDefault.values,
      capabilityProfile: draft.capabilityProfile ?? categoryDefault.capabilityProfile,
      relationshipAnchors: [...(draft.relationshipAnchors ?? [])],
      accessRoutes: Array.from(new Set([...(draft.accessRoutes ?? []), ...categoryDefault.accessRoutes])).slice(0, 6),
      promptHooks: Array.from(new Set(draft.promptHooks ?? [])).slice(0, 4),
      identityHooks: identityHooks(draft.displayName, currentIdentity),
      importance: draft.importance ?? 80,
      sourceConfidence: draft.sourceConfidence ?? 'high'
    };
  });
}
