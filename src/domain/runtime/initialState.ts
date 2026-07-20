import {
  getCivilianOpeningProfile,
  hk1980sOriginBackgroundOptions,
  resolveTriadOpeningProfile,
  type CivilianCustomOpeningProfileInput,
  type TriadRankId
} from '../worldpack/hk1980sOpening';
import { mergeWorldpackPlaces } from '../map/placeRepository';
import { createInitialReputationState, normalizePlayerReputationState } from '../reputation/reputation';
import { normalizeEquippedItemIds } from '../assets/equipmentSlots';
import { syncHomeBaseAssetAndFinance } from '../assets/homeBaseAsset';
import { createInitialFinanceState, normalizeFinanceState, syncPlayerEconomyWithFinance } from '../finance/financeState';
import { syncPlayerPoliceSalaryCashflow } from '../finance/playerSalaryCashflow';
import { createInitialPolicePanel } from '../police/policePanel';
import { createInitialGrayNetworks } from '../grayNetwork/grayNetwork';
import { createInitialTriadOrganizations } from '../grayNetwork/initialTriadOrganizations';
import { createInitialConflictStores } from '../conflict/conflictRuntime';
import { createInitialEnvironment, ensureEnvironmentState } from '../weather/weather';
import { createInitialCitySituationTrackSeeds } from '../cityPower/initialCitySituationTracks';
import { normalizeActor } from './actorFactory';
import type {
  Actor,
  ActorRoleProfiles,
  AttributeBlock,
  CantoneseFlavorLevel,
  CurrentIdentity,
  DynamicEventsState,
  GameTime,
  HomeBase,
  LawIdentityRuntime,
  OriginBackground,
  PlayerClothingState,
  PlayerEconomy,
  PlayerProgression,
  PlayerReputationState,
  RuntimeEnvironmentState,
  RuntimeFinanceState,
  RuntimeAssetsState,
  RuntimeMapState,
  RuntimeState,
  Trait,
  Vitals
} from './types';

export type OpeningPressureLevel = 'relaxed' | 'routine' | 'standard' | 'tense' | 'high';

export interface OpeningSetup {
  playerName?: string;
  englishName?: string;
  gender?: Actor['gender'];
  age?: number;
  policeNumber?: string;
  birthDate?: string;
  currentIdentity?: CurrentIdentity;
  policePostingId?: string;
  civilianProfileId?: string;
  civilianCustomProfile?: CivilianCustomOpeningProfileInput;
  triadProfileId?: string;
  triadSocietyId?: string;
  triadTerritoryPlaceId?: string;
  triadRankId?: TriadRankId;
  triadRoleId?: string;
  originBackground?: OriginBackground;
  personality?: string;
  appearance?: string;
  cantoneseFlavor?: CantoneseFlavorLevel;
  startTime?: GameTime;
  storypackInfluence?: RuntimeState['world']['storypackInfluence'];
  lawIdentity?: Partial<Pick<LawIdentityRuntime, 'stationOrPost' | 'department' | 'rank' | 'assignmentSummary'>>;
  attributes?: AttributeBlock;
  traits?: Trait[];
  openingPressure?: OpeningPressureLevel;
  openingNote?: string;
}

function createInitialAttributes(): AttributeBlock {
  return {
    body: 50,
    action: 50,
    perception: 50,
    thinking: 50,
    negotiation: 50,
    will: 50
  };
}

function createInitialVitals(): Vitals {
  return {
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
    conditionSummary: '状态正常。'
  };
}

function createInitialClothingState(clothing: string, time: GameTime, currentIdentity: CurrentIdentity): PlayerClothingState {
  return {
    currentSummary: clothing,
    mode: currentIdentity === 'police' ? 'duty_uniform' : 'other',
    lastChangedAt: cloneTime(time)
  };
}

function createInitialEconomy(): PlayerEconomy {
  return {
    cashOnHand: 0,
    bankBalance: 0,
    monthlyPressure: 50,
    financeSummary: '开局待生成：根据身份、出身背景、住处和家庭压力确定。'
  };
}

function createInitialProgression(): PlayerProgression {
  return {
    level: 1,
    experience: 0,
    unspentAttributePoints: 0
  };
}

function createInitialFinance(time: GameTime, economy: PlayerEconomy = createInitialEconomy()): RuntimeFinanceState {
  return createInitialFinanceState(time, economy);
}

function createInitialAssets(): RuntimeAssetsState {
  return {
    items: {},
    equippedItemIds: []
  };
}

function createInitialDynamicEvents(): DynamicEventsState {
  return {
    currentMatters: {},
    signals: {},
    newsIssues: {}
  };
}

function createInitialCitySituationTracks(startedAt: GameTime): RuntimeState['citySituationTracks'] {
  return createInitialCitySituationTrackSeeds(startedAt);
}

function createInitialBackgroundEvolution(): RuntimeState['backgroundEvolution'] {
  return {
    npcTracks: {},
    organizationTracks: {},
    recentOutcomes: [],
    chronicle: [],
    lastAppliedAt: undefined,
    lastOrganizationReviewAt: undefined
  };
}

function createInitialHomeBase(): HomeBase {
  return {
    housingType: '开局待生成',
    summary: '开局待生成：根据出身背景、经济压力和时代环境确定固定住所。',
    householdSummary: '开局待生成家庭/同住关系。'
  };
}

function createInitialOrganizations(currentIdentity: CurrentIdentity, openingYear: number): RuntimeState['organizations'] {
  return {
    org_hk_police: {
      organizationId: 'org_hk_police',
      name: '皇家香港警察',
      type: 'police_force',
      summary: '港英时期香港主要警务组织，负责治安、巡逻、报案处理、刑事侦查和大型行动支援。',
      publicKnowledge: '市民知道警队是日常治安和报案的主要入口，也知道它受上级、媒体、投诉和廉署压力约束。',
      currentState: '1980年代后期制度化程度持续提高，但基层仍要直接面对街坊、夜场、社团边缘人物和上级链条。',
      stanceTowardPlayer: currentIdentity === 'police' ? '玩家是基层成员，组织内部暂未形成稳定评价。' : '暂无直接组织关系。',
      pressureSummary:
        currentIdentity === 'police'
          ? '纪律、上级命令、公众投诉、媒体关注和廉署风险都会影响玩家在警队内的处境。'
          : '暂未对玩家形成直接压力。',
      relatedActorIds: currentIdentity === 'police' ? ['player'] : [],
      relatedPlaceIds: ['place_mong_kok_police_station'],
      relatedCaseIds: [],
      visibility: 'player_known',
      importance: 100
    },
    org_icac: {
      organizationId: 'org_icac',
      name: '廉政公署',
      type: 'icac',
      summary: '独立反贪机构，是警队、政府和商业灰色利益的重要制度压力来源。',
      publicKnowledge: '市民知道廉政公署调查贪污和公职人员不当利益，警队内部也清楚它的独立调查权。',
      currentState: '1980年代后期，廉署已经成为香港制度结构中不可忽视的反腐力量。',
      stanceTowardPlayer: currentIdentity === 'police' ? '对玩家没有公开个案，但天然构成纪律和灰色利益风险压力。' : '暂未与玩家形成直接关系。',
      pressureSummary: '收黑钱、收受利益、异常人情往来和被投诉都可能在未来触发廉署相关风险。',
      relatedActorIds: [],
      relatedPlaceIds: ['place_icac_headquarters'],
      relatedCaseIds: [],
      visibility: 'public',
      importance: 95
    },
    org_legal_department: {
      organizationId: 'org_legal_department',
      name: '律政司',
      type: 'legal',
      summary: '负责法律政策、检控和政府法律事务的制度机构，是案件进入检控链条的重要锚点。',
      publicKnowledge: '普通市民知道重大案件最终会进入法律和检控程序，但未必理解内部细节。',
      currentState: '作为制度链条的一部分，通常只在案件提交、检控意见或重大公共事件中进入玩家视野。',
      stanceTowardPlayer: '暂未与玩家形成直接关系。',
      pressureSummary: '检控意见、案件退回、证据不足和公众关注案件可能通过此机构形成压力。',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      visibility: 'public',
      importance: 85
    },
    org_government_house: {
      organizationId: 'org_government_house',
      name: '总督府',
      type: 'government',
      summary: '香港殖民地行政权力的象征性和实际高层锚点。',
      publicKnowledge: '市民知道总督府代表香港最高行政层，但日常生活中通常距离很远。',
      currentState: '通常只在重大社会事件、政策压力和政治敏感场景中成为背景压力。',
      stanceTowardPlayer: '暂未与玩家形成直接关系。',
      pressureSummary: '重大公共秩序事件、媒体舆论和政策变化可能从高层行政结构向下传导。',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      visibility: 'public',
      importance: 80
    },
    org_tvb: {
      organizationId: 'org_tvb',
      name: 'TVB',
      type: 'media',
      summary: '香港主要电视机构之一，也是媒体、娱乐圈和公众舆论交叉的时代锚点。',
      publicKnowledge: '市民熟悉电视台、艺人新闻和娱乐节目，媒体报道会影响公共事件的社会观感。',
      currentState: '可作为新闻报道、娱乐圈人物、公众舆论和媒体采访场景的稳定机构锚点。',
      stanceTowardPlayer: '暂未与玩家形成直接关系。',
      pressureSummary: '媒体曝光、公众形象和娱乐圈人脉可能通过此机构间接影响玩家处境。',
      relatedActorIds: [],
      relatedPlaceIds: ['place_broadcast_drive'],
      relatedCaseIds: [],
      visibility: 'public',
      importance: 80
    },
    ...createInitialTriadOrganizations(currentIdentity, openingYear)
  };
}

function createInitialTime(): GameTime {
  return {
    year: 1988,
    month: 6,
    day: 1,
    hour: 8,
    minute: 30
  };
}

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

function cloneAttributes(attributes: AttributeBlock): AttributeBlock {
  return { ...attributes };
}

function cloneVitals(vitals: Vitals): Vitals {
  return { ...vitals };
}

function cloneTraits(traits: Trait[]): Trait[] {
  return traits.map((trait) => ({ ...trait, scopes: [...trait.scopes] }));
}

function cloneOriginBackground(originBackground: OriginBackground): OriginBackground {
  return { ...originBackground };
}

function calculateAge(birthDate: string | undefined, time: GameTime): number | undefined {
  if (!birthDate) return undefined;
  const [yearText, monthText, dayText] = birthDate.split('-');
  const birthYear = Number(yearText);
  const birthMonth = Number(monthText);
  const birthDay = Number(dayText);
  if (!birthYear || !birthMonth || !birthDay) return undefined;

  let age = time.year - birthYear;
  if (time.month < birthMonth || (time.month === birthMonth && time.day < birthDay)) {
    age -= 1;
  }
  return age;
}

function calculateBirthDateFromAge(age: number | undefined, time: GameTime): string | undefined {
  if (!age || age < 1 || !Number.isFinite(age)) return undefined;

  return `${time.year - Math.floor(age)}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}

function normalizePoliceNumber(policeNumber: string | undefined): string | undefined {
  const digits = policeNumber?.replace(/\D/g, '').slice(0, 4) ?? '';
  return digits.length === 4 ? digits : undefined;
}

function identityLabel(identity: CurrentIdentity): string {
  if (identity === 'civilian') return '普通市民';
  if (identity === 'gang_member') return '社团分子';
  return '香港警队基层警员';
}

interface OpeningRouteContext {
  placeId: string;
  sceneId: string;
  sceneName: string;
  sceneSummary: string;
  sceneState: string;
  openingNarration: string;
}

function resolveCivilianProfile(setup: OpeningSetup) {
  return getCivilianOpeningProfile(setup.civilianProfileId, setup.civilianCustomProfile);
}

function resolveTriadProfile(setup: OpeningSetup) {
  return resolveTriadOpeningProfile({
    societyId: setup.triadSocietyId,
    territoryPlaceId: setup.triadTerritoryPlaceId,
    rankId: setup.triadRankId,
    roleId: setup.triadRoleId,
    legacyProfileId: setup.triadProfileId
  });
}

function policePostingPlaceId(postingId: string | undefined): string {
  if (!postingId || postingId === 'mong_kok_police_station') return 'place_mong_kok_police_station';
  if (postingId.endsWith('_police_station')) return `place_${postingId}`;
  const specialPostingPlaceIds: Record<string, string> = {
    cid_headquarters: 'place_wan_chai_police_headquarters',
    ptu_barracks: 'place_wan_chai_police_headquarters',
    traffic_hq: 'place_wan_chai_police_headquarters',
    marine_police_base: 'place_aberdeen_police_station',
    special_branch_hq: 'place_wan_chai_police_headquarters'
  };
  return specialPostingPlaceIds[postingId] ?? 'place_mong_kok_police_station';
}

function resolveOpeningRoute(setup: OpeningSetup, identity: CurrentIdentity): OpeningRouteContext {
  if (identity === 'gang_member') {
    const profile = resolveTriadProfile(setup);
    return {
      placeId: profile.startPlaceId,
      sceneId: 'scene_opening_triad_street',
      sceneName: profile.startPlaceLabel,
      sceneSummary: `${profile.startPlaceLabel}的人流、招牌与熟人目光交错，街面人物说话都留着余地。`,
      sceneState: `玩家正以${profile.rankSummary}、${profile.roleTitle}的身份处理眼前事务。`,
      openingNarration: `${profile.startPlaceLabel}还没有完全安静下来，熟人、场所和规矩都在等玩家作出下一步反应。`
    };
  }
  if (identity === 'civilian') {
    const profile = resolveCivilianProfile(setup);
    const isUnemployed = profile.employmentStatus === 'unemployed';
    return {
      placeId: profile.workplacePlaceId,
      sceneId: isUnemployed ? 'scene_opening_civilian_daily_life' : 'scene_opening_civilian_workplace',
      sceneName: profile.workplaceLabel,
      sceneSummary: `${profile.workplaceLabel}正在按自己的日常节奏运转，生活、人情和城市噪声挤在一起。`,
      sceneState: isUnemployed
        ? '玩家目前没有固定工作，正在处理求职、家用与日常关系。'
        : '这是普通生活中的一个时刻，尚没有任何阵营替玩家做决定。',
      openingNarration: isUnemployed
        ? `${profile.workplaceLabel}照常忙碌，玩家今天没有固定班要上，却仍要面对生活开支与下一步打算。`
        : `${profile.workplaceLabel}照常忙碌，玩家先要顾好眼前的工作与生活。`
    };
  }
  return {
    placeId: policePostingPlaceId(setup.policePostingId),
    sceneId: 'scene_report_room',
    sceneName: '报案室',
    sceneSummary: '木桌、电话、纸本记录和来往脚步声混在一起。',
    sceneState: '当值开始，现场仍有交接留下的杂乱。',
    openingNarration: '当值警署还没有完全安静下来，电话声已经开始催人。'
  };
}

function createActorRoleProfiles(currentIdentity: CurrentIdentity, setup: OpeningSetup): ActorRoleProfiles {
  if (currentIdentity === 'police') {
    return {
      police: {
        status: 'active',
        agencyId: 'org_hk_police',
        stationOrPost:
          currentIdentity === 'police' ? setup.lawIdentity?.stationOrPost ?? 'Mong Kok Police Station' : undefined,
        department: currentIdentity === 'police' ? setup.lawIdentity?.department ?? 'Uniform Branch' : undefined,
        rank: currentIdentity === 'police' ? setup.lawIdentity?.rank ?? 'Constable (PC)' : undefined,
        assignmentSummary:
          currentIdentity === 'police'
            ? setup.lawIdentity?.assignmentSummary ?? 'Station duty and street-level response'
            : undefined,
        supervisorActorIds: [],
        peerActorIds: [],
        authoritySummary: 'Has basic police authority under the current posting, bounded by rank, department and procedure.',
        accessSummary: 'May access only the station, patrol and case information appropriate to the current rank and posting.',
        dutySummary: setup.lawIdentity?.assignmentSummary ?? 'Handles routine duty, street incidents and immediate reports.',
        institutionalReputation: 'New or lightly known within the force unless later play establishes otherwise.',
        disciplinePressureSummary: 'Subject to chain of command, complaints, ICAC exposure and internal discipline.'
      }
    };
  }

  if (currentIdentity === 'gang_member') {
    const profile = resolveTriadProfile(setup);
    return {
      triad: {
        status: 'active',
        organizationId: profile.organizationId,
        societyName: profile.societyName,
        roleTitle: profile.roleTitle,
        rankSummary: profile.rankSummary,
        territorySummary: profile.territorySummary,
        patronActorIds: [],
        peerActorIds: [],
        rivalActorIds: [],
        obligationSummary: profile.obligationSummary,
        riskSummary: profile.riskSummary
      }
    };
  }

  const profile = resolveCivilianProfile(setup);
  return {
    civilian: {
      status: 'active',
      publicOccupation: profile.publicOccupation,
      workplacePlaceId: profile.workplacePlaceId,
      communitySummary: profile.communitySummary,
      familyEconomicSummary: profile.familyEconomicSummary,
      legalStatusSummary: profile.legalStatusSummary
    }
  };
}

function cantoneseFlavorPromptAnchor(flavor: CantoneseFlavorLevel): string {
  if (flavor === 'off') return '对白使用标准书面中文，不主动加入粤语词汇。';
  if (flavor === 'light') return '对白可轻微加入粤语语气词和称呼，正文仍以书面中文为主。';
  if (flavor === 'medium') return '对白保持中等粤语风味，关键人物口吻可带港式词汇，叙述仍保持易读。';
  if (flavor === 'heavy') return '对白较多使用粤语表达和港式句式，但需要保证非粤语读者能理解。';
  return '人物对白尽量使用粤语/港式口语，必要时用上下文保证意思清楚。';
}

function createPlayerActor(setup: OpeningSetup, time: GameTime, attributes: AttributeBlock, traits: Trait[]): Actor {
  const currentIdentity = setup.currentIdentity ?? 'police';
  const playerName = setup.playerName?.trim() || '';
  const englishName = setup.englishName?.trim() || undefined;
  const birthDate = setup.birthDate || calculateBirthDateFromAge(setup.age, time) || '1965-01-01';
  const computedAge = calculateAge(birthDate, time);
  const originBackground = setup.originBackground ?? hk1980sOriginBackgroundOptions[0];
  const route = resolveOpeningRoute(setup, currentIdentity);
  const civilianProfile = resolveCivilianProfile(setup);
  const triadProfile = resolveTriadProfile(setup);
  const policeNumber = currentIdentity === 'police' ? normalizePoliceNumber(setup.policeNumber) : undefined;
  const identityMemory =
    currentIdentity === 'police'
      ? policeNumber
        ? `警员编号${policeNumber}已记录。`
        : '开局需要生成四位数字警员编号。'
      : currentIdentity === 'gang_member'
        ? `当前社团身份：${triadProfile.societyName}，${triadProfile.rankSummary}，职务为${triadProfile.roleTitle}。`
        : `当前公开职业：${civilianProfile.publicOccupation}。`;
  const englishNameMemory = englishName ? `英文名：${englishName}。` : '开局需要 LLM 根据中文名生成英文名。';
  const cantoneseFlavor = setup.cantoneseFlavor ?? 'medium';
  const cantoneseFlavorAnchor = cantoneseFlavorPromptAnchor(cantoneseFlavor);
  const vitals = createInitialVitals();
  const roleProfiles = createActorRoleProfiles(currentIdentity, setup);
  const publicIdentity =
    currentIdentity === 'police'
      ? identityLabel(currentIdentity)
      : currentIdentity === 'gang_member'
        ? `${triadProfile.societyName} · ${triadProfile.rankSummary} · ${triadProfile.roleTitle}`
        : civilianProfile.publicOccupation;
  const primaryOrganizationId =
    currentIdentity === 'police'
      ? 'org_hk_police'
      : currentIdentity === 'gang_member'
        ? triadProfile.organizationId
        : undefined;

  return {
    actorId: 'player',
    name: playerName,
    englishName,
    aliases: [...(englishName ? [englishName] : []), ...(policeNumber ? [policeNumber] : [])],
    callName: currentIdentity === 'police' ? '阿Sir' : playerName || undefined,
    gender: setup.gender ?? 'male',
    policeNumber,
    birthDate,
    computedAge,
    visualAgeAnchor: computedAge
      ? `${computedAge}岁左右的${currentIdentity === 'police' ? '警员' : currentIdentity === 'gang_member' ? '街面青年' : '香港市民'}`
      : currentIdentity === 'police'
        ? '二十几岁的年轻警员'
        : '二十几岁的香港青年',
    currentIdentity,
    publicIdentity,
    actualIdentitySummary: publicIdentity,
    roleProfiles,
    organizationIds: primaryOrganizationId ? [primaryOrganizationId] : [],
    organizationRelations:
      currentIdentity === 'police'
        ? [
            {
              organizationId: 'org_hk_police',
              relationType: 'employee',
              roleTitle: setup.lawIdentity?.rank ?? 'Constable (PC)',
              departmentOrUnit: setup.lawIdentity?.stationOrPost ?? 'Mong Kok Police Station',
              summary: setup.lawIdentity?.assignmentSummary ?? 'Station duty and street-level response',
              visibility: 'player_known',
              isPrimary: true
            }
          ]
        : currentIdentity === 'gang_member'
          ? [
              {
                organizationId: triadProfile.organizationId,
                relationType: 'member',
                roleTitle: `${triadProfile.rankSummary} · ${triadProfile.roleTitle}`,
                departmentOrUnit: triadProfile.territorySummary,
                summary: triadProfile.obligationSummary,
                visibility: 'player_known',
                isPrimary: true
              }
            ]
          : [],
    positionSummary:
      currentIdentity === 'police'
        ? `驻守${setup.lawIdentity?.stationOrPost ?? '旺角警署'}的${setup.lawIdentity?.rank ?? '警员'}`
        : publicIdentity,
    currentPlaceId: route.placeId,
    currentSceneId: route.sceneId,
    presence: 'present',
    lastSeenAt: cloneTime(time),
    lastSeenPlaceId: route.placeId,
    profileSummary: `${originBackground.name}。${originBackground.definition}`,
    appearance:
      setup.appearance?.trim() ||
      (currentIdentity === 'police'
        ? '制服整洁，神情仍带一点新人谨慎。'
        : currentIdentity === 'gang_member'
          ? '穿着不起眼的街头便服，神情谨慎，不敢把字头名号挂在脸上。'
          : '穿着符合当前生活与收入状况的日常衣服，神情带着普通生活的疲惫和警觉。'),
    clothing: '开局待生成：根据身份、岗位、时代和场景确定。',
    equipment: [],
    personality: setup.personality?.trim() || '谨慎，观察欲强，还没有完全适应街面规则。',
    speechStyle: cantoneseFlavorAnchor,
    motivation:
      currentIdentity === 'police'
        ? '想在警队站稳脚跟，同时不被环境吞掉。'
        : currentIdentity === 'gang_member'
          ? '想在街面关系中活下来、站稳位置，同时保住自己在乎的人。'
          : '想维持生活、照顾家人，并为自己找到更可靠的出路。',
    longTermGoal:
      currentIdentity === 'police'
        ? '在警队和现实生活中找到自己的位置。'
        : currentIdentity === 'gang_member'
          ? '在规矩、人情和风险之间争取不被当成可舍弃的人。'
          : '在香港社会中建立稳定生活；是否加入警队或社团必须由后续选择决定。',
    values:
      currentIdentity === 'police'
        ? '相信规则有意义，但也知道规则并不总能解决问题。'
        : currentIdentity === 'gang_member'
          ? '重视承诺与生存，却仍需要自己决定哪些规矩值得守。'
          : '重视家人、工作和体面，不预设必须效忠任何组织。',
    vitals,
    attributes,
    activeTraits: traits,
    traitProgress: [],
    bodyConditionSummary: vitals.conditionSummary,
    statusSummary: '精神紧绷但状态正常。',
    relationshipSummary: '玩家本人。',
    attitudeTowardPlayer: '自我认知尚不稳定。',
    interactionScore: 100,
    trustTendency: '取决于玩家选择。',
    entanglementSummary: `出身与背景：${originBackground.name}。${originBackground.backgroundSummary}`,
    longTermMemorySummary: `开局出身与背景：${originBackground.name}。${originBackground.definition}${originBackground.backgroundSummary}${englishNameMemory}${identityMemory}对白风味：${cantoneseFlavorAnchor}`,
    recentInteractionMemory: `${identityMemory}${route.openingNarration}`,
    keyMemories: [],
    visibility: 'player_known',
    importance: 100,
    worldpackActorData: {}
  };
}

function createOpeningMemories(setup: OpeningSetup, time: GameTime): RuntimeState['memories'] {
  const openingNote = setup.openingNote?.trim();
  if (!openingNote) return {};
  const route = resolveOpeningRoute(setup, setup.currentIdentity ?? 'police');

  return {
    memory_opening_note: {
      memoryId: 'memory_opening_note',
      text: `开局额外要求：${openingNote}`,
      kind: 'player' as const,
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: [route.placeId],
      relatedOrganizationIds: [],
      gameTime: cloneTime(time),
      importance: 100,
      visibility: 'player_known' as const,
      certainty: 'claim' as const,
      embeddingText: openingNote
    }
  };
}

export function createInitialRuntimeState(setup: OpeningSetup = {}): RuntimeState {
  const time = setup.startTime ? cloneTime(setup.startTime) : createInitialTime();
  const attributes = setup.attributes ?? createInitialAttributes();
  const actorAttributes = cloneAttributes(attributes);
  const playerAttributes = cloneAttributes(attributes);
  const actorTraits = cloneTraits(setup.traits ?? []);
  const playerTraits = cloneTraits(setup.traits ?? []);
  const currentIdentity = setup.currentIdentity ?? 'police';
  const openingRoute = resolveOpeningRoute(setup, currentIdentity);
  const originBackground = cloneOriginBackground(setup.originBackground ?? hk1980sOriginBackgroundOptions[0]);
  const playerActor = createPlayerActor(setup, time, actorAttributes, actorTraits);
  const initialEconomy = createInitialEconomy();
  const initialFinance = createInitialFinance(time, initialEconomy);
  const initialReputation = createInitialReputationState(currentIdentity);
  const initialHomeBase = createInitialHomeBase();
  const initialOrganizations = createInitialOrganizations(currentIdentity, time.year);
  if (currentIdentity === 'gang_member') {
    const triadProfile = resolveTriadProfile(setup);
    const organization = initialOrganizations[triadProfile.organizationId];
    if (organization) {
      initialOrganizations[triadProfile.organizationId] = {
        ...organization,
        stanceTowardPlayer: `玩家以“${triadProfile.rankSummary} · ${triadProfile.roleTitle}”身份参与本区事务；权限仍受上线、地盘边界、规矩和实际表现约束。`,
        pressureSummary: triadProfile.riskSummary,
        relatedActorIds: ['player']
      };
    }
  }
  const initialVitals = cloneVitals(playerActor.vitals ?? createInitialVitals());
  const initialClothingState = createInitialClothingState(playerActor.clothing, time, currentIdentity);
  const initialConflictStores = createInitialConflictStores();
  const initialLawIdentity: RuntimeState['lawIdentity'] = {
    status: currentIdentity === 'police' ? 'active' : 'none',
    agencyId: currentIdentity === 'police' ? 'org_hk_police' : undefined,
    stationOrPost: currentIdentity === 'police' ? setup.lawIdentity?.stationOrPost ?? '旺角警署' : undefined,
    department: currentIdentity === 'police' ? setup.lawIdentity?.department ?? '军装巡逻' : undefined,
    rank: currentIdentity === 'police' ? setup.lawIdentity?.rank ?? '警员' : undefined,
    assignmentSummary:
      currentIdentity === 'police' ? setup.lawIdentity?.assignmentSummary ?? '日常值班与街面巡逻。' : undefined,
    supervisorActorIds: [],
    peerActorIds: [],
    authoritySummary: currentIdentity === 'police' ? '可进行基本盘问、巡逻、记录和现场处置。' : '当前没有执法权限。',
    accessSummary: currentIdentity === 'police' ? '只能接触基层勤务和公开资料。' : '只能接触公开社会信息。',
    dutySummary: currentIdentity === 'police' ? '维持街面秩序，处理当值期间遇到的事件。' : '没有正式警务职责。',
    institutionalReputation: currentIdentity === 'police' ? '新人，尚未形成稳定名声。' : '与警队暂无正式连接。',
    disciplinePressureSummary: currentIdentity === 'police' ? '暂无明确纪律风险。' : '暂无警队纪律压力。'
  };
  const initialFinanceWithSalary = syncPlayerPoliceSalaryCashflow({
    finance: initialFinance,
    time,
    currentIdentity,
    lawIdentity: initialLawIdentity
  });

  return {
    runtimeVersion: 1,
    world: {
      worldpackId: 'hk_1988',
      storypackInfluence: setup.storypackInfluence ?? 'medium',
      openingPressure: setup.openingPressure ?? 'relaxed'
    },
    time,
    environment: createInitialEnvironment(time),
    map: {},
    player: {
      actorId: 'player',
      name: playerActor.name,
      englishName: playerActor.englishName,
      gender: playerActor.gender,
      policeNumber: playerActor.policeNumber,
      birthDate: playerActor.birthDate,
      currentIdentity,
      originIdentity: currentIdentity,
      identityHistory: [],
      originBackground,
      personality: playerActor.personality,
      appearance: playerActor.appearance,
      clothing: playerActor.clothing,
      clothingState: initialClothingState,
      equipment: [...playerActor.equipment],
      economy: initialEconomy,
      progression: createInitialProgression(),
      reputation: initialReputation,
      homeBase: initialHomeBase,
      vitals: initialVitals,
      cantoneseFlavor: setup.cantoneseFlavor ?? 'medium',
      attributes: playerAttributes,
      activeTraits: playerTraits,
      traitProgress: []
    },
    finance: initialFinanceWithSalary,
    lawIdentity: initialLawIdentity,
    policePanel: createInitialPolicePanel(
      playerActor,
      {
        status: currentIdentity === 'police' ? 'active' : 'none',
        agencyId: currentIdentity === 'police' ? 'org_hk_police' : undefined,
        stationOrPost: setup.lawIdentity?.stationOrPost ?? 'Mong Kok Police Station',
        department: setup.lawIdentity?.department ?? 'Uniform Branch',
        rank: setup.lawIdentity?.rank ?? 'Constable (PC)',
        assignmentSummary: setup.lawIdentity?.assignmentSummary ?? 'Station duty and street-level response',
        supervisorActorIds: [],
        peerActorIds: [],
        authoritySummary:
          currentIdentity === 'police'
            ? 'Basic police authority under the current rank and posting.'
            : 'No active police authority.',
        accessSummary:
          currentIdentity === 'police'
            ? 'Access is limited by rank, post and station chain.'
            : 'No police access.',
        dutySummary:
          currentIdentity === 'police' ? 'Routine duty, street response and report handling.' : 'No police duty.',
        institutionalReputation:
          currentIdentity === 'police' ? 'Opening reputation is not stable yet.' : 'No formal police link.',
        disciplinePressureSummary:
          currentIdentity === 'police' ? 'No formal disciplinary pressure yet.' : 'No police discipline pressure.'
      },
      time
    ),
    grayNetworks: createInitialGrayNetworks(),
    location: {
      currentPlaceId: openingRoute.placeId,
      currentSceneId: openingRoute.sceneId
    },
    actors: {
      player: playerActor
    },
    secretFacts: {},
    pendingActorWritebackRecoveries: [],
    organizations: initialOrganizations,
    dynamicEvents: createInitialDynamicEvents(),
    citySituationTracks: createInitialCitySituationTracks(time),
    backgroundEvolution: createInitialBackgroundEvolution(),
    relationshipThreads: {},
    judgementChecks: initialConflictStores.judgementChecks,
    combatEvents: initialConflictStores.combatEvents,
    cases: {},
    caseEvidence: {},
    deferredEvents: {},
    pressures: {},
    grayLedger: [],
    assets: createInitialAssets(),
    places: mergeWorldpackPlaces(),
    scenes: {
      [openingRoute.sceneId]: {
        sceneId: openingRoute.sceneId,
        placeId: openingRoute.placeId,
        name: openingRoute.sceneName,
        summary: openingRoute.sceneSummary,
        temporaryState: openingRoute.sceneState,
        presentActorIds: ['player']
      }
    },
    memories: createOpeningMemories(setup, time),
    storyLog: [
      {
        turnId: 'turn_0',
        speaker: 'narrator',
        text: openingRoute.openingNarration,
        gameTime: cloneTime(time)
      }
    ],
    turnCounter: 0
  };
}

export function withRuntimeDefaults(state: RuntimeState): RuntimeState {
  const defaults = createInitialRuntimeState({
    currentIdentity: state.player.currentIdentity
  });
  const stateWithOptionalAssets = state as RuntimeState & {
    world?: Partial<RuntimeState['world']>;
    assets?: RuntimeAssetsState;
    finance?: RuntimeFinanceState;
    caseEvidence?: RuntimeState['caseEvidence'];
    deferredEvents?: RuntimeState['deferredEvents'];
    environment?: RuntimeEnvironmentState;
    map?: RuntimeMapState;
    lawIdentity?: RuntimeState['lawIdentity'];
    policePanel?: RuntimeState['policePanel'];
    grayNetworks?: RuntimeState['grayNetworks'];
    dynamicEvents?: RuntimeState['dynamicEvents'];
    citySituationTracks?: RuntimeState['citySituationTracks'];
    backgroundEvolution?: RuntimeState['backgroundEvolution'];
    relationshipThreads?: RuntimeState['relationshipThreads'];
    judgementChecks?: RuntimeState['judgementChecks'];
    combatEvents?: RuntimeState['combatEvents'];
    secretFacts?: RuntimeState['secretFacts'];
    pendingActorWritebackRecoveries?: RuntimeState['pendingActorWritebackRecoveries'];
  };
  const playerWithPartialDefaults = state.player as RuntimeState['player'] & {
    reputation?: Partial<PlayerReputationState>;
    reputationByCircle?: unknown;
    vitals?: Vitals;
  };
  const actors = Object.fromEntries(
    Object.entries(state.actors ?? {}).map(([actorId, actor]) => [
      actorId,
      normalizeActor({
        ...actor,
        actorId: actor.actorId ?? actorId,
        currentIdentity: actorId === state.player.actorId ? state.player.currentIdentity : actor.currentIdentity
      })
    ])
  ) as RuntimeState['actors'];
  const playerActor = actors[state.player.actorId];
  if (playerActor && !playerActor.vitals) {
    actors[state.player.actorId] = {
      ...playerActor,
      vitals: state.player.vitals ?? defaults.player.vitals
    };
  }
  const economy = state.player.economy ?? defaults.player.economy;
  const finance = normalizeFinanceState(stateWithOptionalAssets.finance, state.time, economy);
  const playerWithMirroredEconomy = syncPlayerEconomyWithFinance({ ...state.player, economy }, finance);
  const lawIdentity = stateWithOptionalAssets.lawIdentity ?? defaults.lawIdentity;
  const player: RuntimeState['player'] = {
    ...playerWithMirroredEconomy,
    originIdentity: playerWithPartialDefaults.originIdentity ?? state.player.currentIdentity,
    identityHistory: Array.isArray(playerWithPartialDefaults.identityHistory)
      ? playerWithPartialDefaults.identityHistory
      : [],
    progression: playerWithPartialDefaults.progression ?? defaults.player.progression,
    reputation: normalizePlayerReputationState(
      playerWithPartialDefaults.reputation ?? { circles: playerWithPartialDefaults.reputationByCircle },
      defaults.player.reputation
    ),
    homeBase: state.player.homeBase ?? defaults.player.homeBase,
    vitals: playerWithPartialDefaults.vitals ?? defaults.player.vitals,
    clothingState:
      state.player.clothingState ??
      createInitialClothingState(state.player.clothing ?? defaults.player.clothing, state.time, state.player.currentIdentity)
  };
  const assets: RuntimeAssetsState = {
    items: {
      ...(stateWithOptionalAssets.assets?.items ?? defaults.assets.items)
    },
    equippedItemIds: normalizeEquippedItemIds({
      items: stateWithOptionalAssets.assets?.items ?? defaults.assets.items,
      equippedItemIds: stateWithOptionalAssets.assets?.equippedItemIds ?? defaults.assets.equippedItemIds
    })
  };
  const syncedHomeBaseState = syncHomeBaseAssetAndFinance({
    assets,
    finance,
    homeBase: player.homeBase,
    economy: player.economy,
    time: state.time
  });
  const financeWithSalary = syncPlayerPoliceSalaryCashflow({
    finance: syncedHomeBaseState.finance,
    time: state.time,
    currentIdentity: player.currentIdentity,
    lawIdentity
  });

  return {
    ...state,
    world: {
      ...defaults.world,
      ...(stateWithOptionalAssets.world ?? {}),
      openingPressure: stateWithOptionalAssets.world?.openingPressure ?? defaults.world.openingPressure
    },
    environment: ensureEnvironmentState(state.time, stateWithOptionalAssets.environment ?? defaults.environment),
    map: stateWithOptionalAssets.map ?? defaults.map,
    player,
    actors,
    secretFacts: stateWithOptionalAssets.secretFacts ?? defaults.secretFacts,
    pendingActorWritebackRecoveries: Array.isArray(stateWithOptionalAssets.pendingActorWritebackRecoveries)
      ? stateWithOptionalAssets.pendingActorWritebackRecoveries
      : defaults.pendingActorWritebackRecoveries,
    organizations: state.organizations ?? defaults.organizations,
    dynamicEvents: stateWithOptionalAssets.dynamicEvents ?? defaults.dynamicEvents,
    citySituationTracks: stateWithOptionalAssets.citySituationTracks ?? defaults.citySituationTracks,
    backgroundEvolution: stateWithOptionalAssets.backgroundEvolution
      ? {
          npcTracks: stateWithOptionalAssets.backgroundEvolution.npcTracks ?? {},
          organizationTracks: stateWithOptionalAssets.backgroundEvolution.organizationTracks ?? {},
          recentOutcomes: stateWithOptionalAssets.backgroundEvolution.recentOutcomes ?? [],
          chronicle: stateWithOptionalAssets.backgroundEvolution.chronicle ?? [],
          lastAppliedAt: stateWithOptionalAssets.backgroundEvolution.lastAppliedAt,
          lastOrganizationReviewAt: stateWithOptionalAssets.backgroundEvolution.lastOrganizationReviewAt,
          lastRun: stateWithOptionalAssets.backgroundEvolution.lastRun
        }
      : defaults.backgroundEvolution,
    relationshipThreads: stateWithOptionalAssets.relationshipThreads ?? defaults.relationshipThreads,
    judgementChecks: stateWithOptionalAssets.judgementChecks ?? defaults.judgementChecks,
    combatEvents: stateWithOptionalAssets.combatEvents ?? defaults.combatEvents,
    cases: state.cases ?? defaults.cases,
    caseEvidence: stateWithOptionalAssets.caseEvidence ?? defaults.caseEvidence,
    deferredEvents: stateWithOptionalAssets.deferredEvents ?? defaults.deferredEvents,
    pressures: state.pressures ?? defaults.pressures,
    lawIdentity,
    policePanel:
      stateWithOptionalAssets.policePanel ??
      createInitialPolicePanel(actors[state.player.actorId] ?? defaults.actors.player, lawIdentity, state.time),
    grayNetworks: stateWithOptionalAssets.grayNetworks ?? createInitialGrayNetworks(),
    finance: financeWithSalary,
    grayLedger: state.grayLedger ?? [],
    assets: syncedHomeBaseState.assets,
    places: mergeWorldpackPlaces(state.places ?? defaults.places)
  };
}
