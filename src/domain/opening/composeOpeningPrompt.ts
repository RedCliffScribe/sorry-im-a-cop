import type { OpeningSetup } from '../runtime/initialState';
import type { AttributeBlock, RuntimeState } from '../runtime/types';
import { resolvePromptText } from '../prompts/promptRegistry';
import { getNarrativeLengthProfile, type NarrativeLengthLevel } from '../settings/narrativeLength';
import type { NarrativePerspective, PromptSettings } from '../settings/types';
import {
  getCivilianOpeningProfile,
  hk1980sOpeningScenarios,
  hk1980sPoliceRankKnowledge,
  hk1980sTriadBehaviorKnowledge,
  resolveTriadOpeningProfile
} from '../worldpack/hk1980sOpening';
import {
  createAdultRelationshipStyleGuide,
  createNarrativePerspectiveGuide,
  createNarrativeStyleAndDisplayGuide
} from '../context/narrativePromptGuides';
import { projectPoliceDutyContext } from '../police/policeDutyContext';
import { formatGameTimeWithWeekday } from '../time/gameTime';
import { getWorldCurrencyConfig } from '../worldpack/economyConfig';

interface ComposeOpeningPromptInput {
  setup: OpeningSetup;
  initialState: RuntimeState;
  narrativeLengthLevel?: NarrativeLengthLevel;
  narrativePerspective?: NarrativePerspective;
  promptSettings?: PromptSettings;
}

const attributeNames: Record<keyof AttributeBlock, string> = {
  body: '体魄',
  action: '行动',
  perception: '观察',
  thinking: '思考',
  negotiation: '交涉',
  will: '意志'
};

const cantoneseFlavorLabels: Record<NonNullable<OpeningSetup['cantoneseFlavor']>, string> = {
  off: '关闭：对白使用标准中文，不主动加入粤语。',
  light: '轻微：少量称呼、语气词和港式口吻。',
  medium: '中等：主要对白带香港风味，叙述仍清晰易读。',
  heavy: '较多：人物对白较多粤语和港式句式，但保证可理解。',
  full: '全粤语：对白尽量粤语化，适合强风味游玩。'
};

const universalOpeningPressureRules = [
  '正文禁用“暗流”一词，不得用空泛气氛句或无事实预告制造廉价悬念。',
  '阴谋、黑幕、幕后安排不是禁题；但必须来自已有证据、NPC具体行动、已投喂事实或玩家主动调查。',
  '压力必须写成具体可见、可感知、可行动的现场事实；高压开局也只能高在眼前事件、明确阻力、时间成本或关系代价。',
  '不要在 narrativeText、suggestedActions、pressureSeeds、memories、casePatches、relationshipThreadPatches 中埋无事实支撑的未来危机或万能悬疑钩子。'
];

const openingPressureProfiles: Record<
  NonNullable<OpeningSetup['openingPressure']>,
  { label: string; summary: string; rules: string[] }
> = {
  relaxed: {
    label: '轻松开局',
    summary: '普通日常开局。第一幕只写日常生活、普通执勤、街坊寒暄、家长里短和普通人情线索，玩家有充足选择余地。',
    rules: [
      '不要把轻松开局主动升级为倒计时、隐藏大案、生死危机、强制战斗或必须立刻破案。',
      'narrativeText 禁止用元叙述解释本局节奏，也不要把日常小事写成隐藏压力或未来大案预告；不要直接写任何系统字段名、工程词或档位名。',
      '轻松开局禁止出现血衣、带血凶器、疑似命案、尸体、灭口、绑架、枪战、火场救人或关键证人求救。',
      '旧街坊、旧同学或家人牵出的麻烦只能是欠薪、邻里争执、轻微投诉、生活困难、普通人情请求或普通工作安排。',
      '可写日常执勤、生活小事、街坊寒暄、家长里短、普通人情请求、轻微投诉或文书交接；即使有麻烦，也应是可观察、可暂缓、可选择是否理会的入口。',
      'narrativeText、suggestedActions、memories、casePatches、relationshipThreadPatches 都必须遵守轻松开局边界。',
      'pressureSeeds 通常可以为空；如玩家额外要求确实需要生成，severity 建议 0-10，forbiddenUses 必须明确禁止升级为案件、处分、社团威胁或生死危机。'
    ]
  },
  routine: {
    label: '日常开局',
    summary: '第一幕可以有小麻烦、轻微制度压力或普通街面阻力，但不压成紧急危机。',
    rules: [
      '可以有报案、巡逻发现、街坊求助、旧人情或工作安排，但不要开场就枪战、绑架、火场救人或重大处分。',
      '玩家应有时间问人、观察、准备或选择先处理别的事。',
      'pressureSeeds severity 建议 10-35，暴露概率保持温和。'
    ]
  },
  standard: {
    label: '标准开局',
    summary: '第一幕有明确矛盾、案件苗头或人情牵连，但仍是可推进的现场入口。',
    rules: [
      '可以安排一个清晰待处理问题，但不要自动定性为大案或要求玩家立刻解决全部真相。',
      'NPC 可以有隐瞒、犹豫或互相推诿，压力来自现场信息不足和人情/制度边界。',
      'pressureSeeds severity 建议 25-55，可有一条较明确的后续风险。'
    ]
  },
  tense: {
    label: '棘手开局',
    summary: '第一幕压力较强，局面已有阻力、牵连或时间成本，但不应剥夺玩家判断空间。',
    rules: [
      '可以有受伤者、失踪、上级催促、媒体风声、社团牵连或证据即将流失。',
      '必须保留至少一种非战斗、非强闯、非立刻结案的处理路径。',
      'pressureSeeds severity 建议 45-75，允许较高暴露概率，但不要自动爆雷。'
    ]
  },
  high: {
    label: '高压开局',
    summary: '第一幕可以高风险、高急迫，有明显代价和时间压力，但仍要可玩。',
    rules: [
      '可以出现危险现场、上级强压、社团威胁、公众围观或关键证人失控。',
      '即使高压，也不能自动替玩家决定行动、不能开局直接失败、不能把后续路线锁死。',
      'pressureSeeds severity 可达 65-90，但必须写清触发条件，避免每回合无条件升级。'
    ]
  }
};

function formatAttributes(attributes: AttributeBlock): string {
  return (Object.entries(attributes) as Array<[keyof AttributeBlock, number]>)
    .map(([key, value]) => `${attributeNames[key]} ${value}`)
    .join('，');
}

function compact(value: string | undefined, fallback = '未填写'): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function formatDateTime(time: RuntimeState['time']): string {
  return formatGameTimeWithWeekday(time);
}

function formatOpeningPoliceDuty(initialState: RuntimeState): string {
  const projection = projectPoliceDutyContext({
    time: initialState.time,
    currentIdentity: initialState.player.currentIdentity,
    lawIdentity: initialState.lawIdentity
  });

  return [
    `- 状态：${projection.label}`,
    `- ${projection.summary}`,
    ...projection.openingRules.map((rule) => `- ${rule}`)
  ].join('\n');
}

function formatOpeningIdentityContext(setup: OpeningSetup, initialState: RuntimeState): string {
  const actor = initialState.actors[initialState.player.actorId];
  if (initialState.player.currentIdentity === 'police') {
    return `警务值班节奏：
${formatOpeningPoliceDuty(initialState)}

港警职级资料库（长期约束，防止职级漂移）：
${hk1980sPoliceRankKnowledge}`;
  }
  if (initialState.player.currentIdentity === 'gang_member') {
    const profile = resolveTriadOpeningProfile({
      societyId: setup.triadSocietyId,
      territoryPlaceId: setup.triadTerritoryPlaceId,
      rankId: setup.triadRankId,
      roleId: setup.triadRoleId,
      legacyProfileId: setup.triadProfileId
    });
    return `社团开局身份边界：
- 字头：${profile.societyName}（${profile.organizationId}）
- 当前层级：${profile.rankSummary}
- 当前职务：${profile.roleTitle}
- 活动区域：${profile.territorySummary}
- 权限边界：${profile.authoritySummary ?? '只拥有当前职务所需的有限权限，重大决定必须向上线请示。'}
- 当前义务：${profile.obligationSummary}
- 风险：${profile.riskSummary}
- 玩家只拥有所选层级与职务明确覆盖的权限；即使选择地区中层骨干，也不是叔伯辈、坐馆或话事人，不自动认识完整组织结构，不拥有全字头经营权，也不能跨区随意命令他人。
- 第一幕应从一项符合当前层级的具体事务、街面关系或义务开始，不能直接把玩家写成全港话事人、杀手头目或掌握全知社团情报。`;
  }
  const profile = getCivilianOpeningProfile(setup.civilianProfileId, setup.civilianCustomProfile);
  const employmentBoundary =
    profile.employmentStatus === 'unemployed'
      ? '- 当前没有固定职业、雇主或固定薪水；不得强行生成上班任务或工资现金流，可从求职、散工、积蓄和家庭压力切入。'
      : profile.employmentStatus === 'custom'
        ? '- 自定义职业是玩家明确选择的事实锚点；不得擅自替换成预设职业，也不能因为职业名称自动授予警务或社团权限。'
        : '- 当前职业与工作地点是开局事实锚点；工作内容、收入和接触面应符合该职业。';
  return `市民开局身份边界：
- 公开职业：${profile.publicOccupation}
- 工作 / 日常地点：${profile.workplaceLabel}（${profile.workplacePlaceId}）
- 社区关系：${profile.communitySummary}
- 家庭经济：${profile.familyEconomicSummary}
- 法律身份：${profile.legalStatusSummary}
- 可自然出现的警队入口种子：${profile.policeEntrySeeds.join('；')}
- 可自然出现的社团入口种子：${profile.triadEntrySeeds.join('；')}
${employmentBoundary}
- 市民是起源身份；不要在开局直接弹出“加入警队/加入社团”二选一，也不要替玩家完成转职。先写普通生活，再让具体关系和选择逐渐形成入口。
- 玩家可以拒绝两边并继续生活；家庭、住所、工作、街坊和旧友必须成为可长期保留的社会根基。当前角色档案：${actor.publicIdentity ?? '普通市民'}。`;
}

function createPoliceOpeningResponseExample() {
  const reputationEntry = {
    visibility: 0,
    standing: 0,
    summary: '本圈层目前尚未形成明确看法。'
  };

  return {
    narrativeText:
      '【旁白】1988年9月的旺角刚下完一场细雨，弥敦道上的霓虹映在湿路面，报案室窗外有小巴急刹的尖声，也有茶餐厅伙计把铁闸拉下一半的响动。\n【旁白】你站在旺角警署报案室边上，夏季军装贴着后背，腰间的皮带、警棍和对讲机提醒着你今晚只是按表值班。桌上的纸本记录簿摊开，上一页写着几宗寻常小事：邻里争执、遗失证件、店铺噪音投诉。\n【值日警长】“今晚先按日常来。出去前看一眼记录簿，别漏了巡逻路线，也别每件小事都想成大案。”\n【旁白】门口有街坊探头问失物登记，走廊尽头有人把湿伞靠在墙边。你记起旧同学白天来过，说下班后想找你聊两句家里的短事，但没有催，也没有留下什么吓人的话。\n【值日警长】“你自己看，是先整理今晚交接，还是出门前顺路去茶水间问问同僚有没有见过他。”',
    suggestedActions: ['询问值日官今晚辖区有什么要留意。', '先在警署附近巡一圈。'],
    playerPatch: {
      name: '如玩家中文名留空则生成一个符合身份与时代的中文姓名',
      englishName: '如玩家英文名留空则按中文名、性别和80-90年代香港习惯生成',
      policeNumber: '四位数字；如玩家留空则生成',
      clothing: '夏季皇家香港警察军装制服，肩章与警员编号清楚，皮鞋擦得发亮。',
      equipment: ['史密斯威森M10左轮手枪', '警棍及手铐', 'Motorola对讲机'],
      vitals: {
        health: 100,
        maxHealth: 100,
        stamina: 100,
        maxStamina: 100,
        conditionSummary: '状态正常；如开局明确疲惫、受伤或病弱，可调整。'
      },
      economy: {
        cashOnHand: 600,
        bankBalance: 1200,
        monthlyPressure: 65,
        financeSummary: '随身现金、银行存款和生活压力摘要。'
      },
      homeBase: {
        placeId: 'place_home_unique_id',
        placeName: '固定住所名称',
        regionId: 'region_id',
        housingType: '唐楼分租房/公屋单位/宿舍等',
        summary: '居住环境摘要。',
        householdSummary: '同住者、家庭压力、邻里牵连摘要。'
      },
      reputation: {
        notoriety: 10,
        overallReputation: 0,
        summary: '开局时玩家还没有形成稳定整体名声，只在少数相关圈层被知道。',
        circles: {
          police: reputationEntry,
          neighborhoodMedia: reputationEntry,
          entertainment: reputationEntry,
          triad: reputationEntry,
          business: reputationEntry,
          politics: reputationEntry
        },
        logs: []
      }
    },
    initialActors: [
      {
        name: '实际输出时生成一个真实中文姓名，不要照抄示例占位文本',
        englishName: '按该中文名、性别和年代生成英文名；不要照抄示例占位文本',
        gender: 'male',
        birthDate: '1948-05-12',
        computedAge: 40,
        visualAgeAnchor: '四十岁左右',
        currentIdentity: 'police',
        publicIdentity: '旺角警署值日警长',
        actualIdentitySummary: '旺角警署军装部警长，熟悉报案室和附近街坊。',
        roleProfiles: {
          police: {
            status: 'active',
            rank: 'Sergeant',
            department: 'Uniform Branch',
            stationOrPost: 'Mong Kok Police Station',
            assignmentSummary: 'Report Room Duty Sergeant'
          }
        },
        positionSummary: '旺角警署报案室值日警长。',
        profileSummary: '老练、疲惫但可靠的军装警长。',
        appearance: '中年，眼袋重，制服整洁。',
        clothing: '夏季军装制服。',
        equipment: ['警棍', '对讲机', '值日簿'],
        personality: '圆滑、谨慎，对规矩嗤之以鼻但知道底线。',
        speechStyle: '夹杂粤语口吻，常用短句催促新人。',
        motivation: '维持今晚值班平稳，不想惹麻烦。',
        longTermGoal: '安稳退休。',
        values: '实用主义，重视街坊秩序多过漂亮报告。',
        attributes: {
          body: 46,
          action: 52,
          perception: 64,
          thinking: 58,
          negotiation: 61,
          will: 55
        },
        relationshipSummary: '刚认识主角，把主角当成需要看管的新同僚。',
        attitudeTowardPlayer: '观察、试探，但暂时没有敌意。',
        interactionScore: 10,
        trustTendency: '中等戒备。',
        entanglementSummary: '可能掌握警署和街坊间的旧人情。',
        longTermMemorySummary: '熟悉警署报案室与旺角街面关系。',
        recentInteractionMemory: '开局时安排主角留意今晚辖区状况。',
        statusSummary: '疲惫但状态正常。',
        bodyConditionSummary: '夜班疲惫。',
        presence: 'present',
        visibility: 'player_known',
        importance: 70,
        worldpackActorData: {
          hk1988: {
            note: '世界包专用扩展，可省略。'
          }
        }
      }
    ],
    memories: [
      {
        text: '开局时主角在旺角警署开始当晚值班。',
        kind: 'turn',
        relatedActorIds: ['player'],
        relatedPlaceIds: ['place_mong_kok_police_station'],
        relatedOrganizationIds: ['org_hk_police'],
        importance: 80,
        visibility: 'player_known',
        certainty: 'fact'
      }
    ],
    secretFacts: [],
    pressureSeeds: [
      {
        kind: 'personal_pressure',
        summary: '一个普通生活层面的人情提醒。',
        severity: 5,
        exposureLikelihood: 5,
        sourceSummary: '开局背景',
        allowedUses: ['在合适生活场景中轻微提及，不改变主线节奏。'],
        forbiddenUses: ['不得升级为案件、处分、社团威胁、暴力危机或隐藏大案。'],
        escalationConditions: ['玩家多次主动追问并选择深入处理。'],
        visibility: 'hidden'
      }
    ],
    casePatches: [
      {
        caseId: 'case_opening_unique_id',
        title: '开局生成的案件名称',
        caseType: 'assault/general_case/triad_related 等简短类型',
        status: 'investigating',
        playerRole: 'assist',
        leadActorName: '案件主办者姓名或职务',
        summary: '案件当前简介。只写玩家此刻应知道的部分，不要未卜先知。',
        currentFocus: '当前办理方向或上级交代给玩家注意的方向。',
        playerVisibleProgress: '玩家可见的案件进展。',
        internalProgressSummary: '后台可用的案件进展摘要；不等于真相全貌。',
        relatedActorIds: [],
        relatedPlaceIds: ['place_mong_kok_police_station'],
        relatedOrganizationIds: [],
        evidenceIds: [],
        activityLog: [
          {
            kind: 'created',
            summary: '开局时此案件被交办或进入玩家视野。',
            visibleToPlayer: true
          }
        ],
        visibility: 'player_known'
      }
    ],
    caseEvidencePatches: [
      {
        evidenceId: 'evidence_opening_case_file_001',
        caseId: 'case_opening_unique_id',
        title: '已在案件档案中的证据名称',
        evidenceType: 'statement',
        summary: '已经进入案件档案的证据摘要。',
        sourceSummary: '报案室初步记录/上级交来的材料等来源。',
        visibility: 'player_known'
      }
    ],
    deferredEventPatches: [
      {
        eventId: 'deferred_opening_case_followup_001',
        sourceModule: 'case',
        relatedIds: {
          caseId: 'case_opening_unique_id'
        },
        title: '案件后续时间点',
        summary: '例如主办者稍后查看玩家提交材料，不要下回合立刻检控或判决。',
        triggerAt: {
          year: 1988,
          month: 9,
          day: 1,
          hour: 11,
          minute: 30
        },
        promptInstruction: '到时让主办者或相关系统给出合理反馈，保持案件动态演化。',
        status: 'pending'
      }
    ],
    assetPatch: {
      upsertItems: [
        {
          itemId: 'asset_opening_statement_001',
          category: 'document',
          name: '玩家当前持有的可提交证据',
          summary: '这是一份玩家手上可提交到案件系统的材料。',
          detail: '如果开局要求玩家已经拿到口供、报告、照片、录音或现场记录，请把它写成物品，并带 evidence.caseId。',
          relatedCaseIds: ['case_opening_unique_id'],
          evidence: {
            caseId: 'case_opening_unique_id',
            caseTitle: '开局生成的案件名称',
            summary: '此物品作为证据的意义；默认有效，除非剧情明确有争议。',
            disputed: false
          },
          visibility: 'player_known',
          importance: 70
        }
      ],
      removeItems: []
    },
    grayLedger: []
  };
}

function createOpeningResponseExample(setup: OpeningSetup, initialState: RuntimeState) {
  const example = createPoliceOpeningResponseExample();
  if (initialState.player.currentIdentity === 'police') return example;

  const playerActor = initialState.actors[initialState.player.actorId];
  const placeId = initialState.location.currentPlaceId;
  if (initialState.player.currentIdentity === 'gang_member') {
    const triad = playerActor.roleProfiles.triad;
    const triadProfile = resolveTriadOpeningProfile({
      societyId: setup.triadSocietyId,
      territoryPlaceId: setup.triadTerritoryPlaceId,
      rankId: setup.triadRankId,
      roleId: setup.triadRoleId,
      legacyProfileId: setup.triadProfileId
    });
    return {
      ...example,
      narrativeText:
        `【旁白】${triadProfile.startPlaceLabel}仍挤满招牌、车辆和熟人目光。你以“${triadProfile.rankSummary}”身份负责${triadProfile.roleTitle}，知道自己的权限只覆盖眼前这摊事务。\n【联络人】“先把今日的交代听清楚，做得到再应。”\n【旁白】巡逻警员刚从街口经过，没人打算为了逞威风主动惹上警队。你可以先核对人手与时间，也可以问清这件事是否超出自己的职务边界。`,
      suggestedActions: ['先核对具体交代、期限和可用人手。', '确认这件事是否超出当前职务权限。'],
      playerPatch: {
        ...example.playerPatch,
        policeNumber: undefined,
        clothing: '不起眼的旧夹克、深色长裤与便于走动的布鞋。',
        equipment: ['零钱包', '纸烟与火柴', '写有电话号码的折叠纸条']
      },
      initialActors: [],
      memories: [
        {
          text: `开局时主角以${triad?.societyName ?? '社团'}${triad?.roleTitle ?? '外围新人'}身份在街面等待具体交代。`,
          kind: 'turn',
          relatedActorIds: ['player'],
          relatedPlaceIds: [placeId],
          relatedOrganizationIds: triad?.organizationId ? [triad.organizationId] : [],
          importance: 80,
          visibility: 'player_known',
          certainty: 'fact'
        }
      ],
      casePatches: [],
      caseEvidencePatches: [],
      deferredEventPatches: [],
      assetPatch: { upsertItems: [], removeItems: [] }
    };
  }

  const civilian = playerActor.roleProfiles.civilian;
  const civilianProfile = getCivilianOpeningProfile(setup.civilianProfileId, setup.civilianCustomProfile);
  const isUnemployed = civilianProfile.employmentStatus === 'unemployed';
  return {
    ...example,
    narrativeText: isUnemployed
      ? `【旁白】${civilianProfile.workplaceLabel}已经热闹起来。你目前没有固定工作，口袋里的钱、家用和下一份差事比任何宏大选择都更实际。\n【旧同学】“劳工介绍所那边贴了几张新告示，你要不要一起看看？”\n【旁白】街口也有警员向街坊了解昨夜的轻微争执，但那只是一段普通生活接触，没有人替你决定将来加入哪一边。`
      : `【旁白】${civilianProfile.workplaceLabel}开始一天的节奏。你以“${civilianProfile.publicOccupation}”的身份处理眼前工作，同事、顾客与街坊关系构成最初的社会接触面。\n【熟人】“先把今日手上的事做好，迟点我有件小事想问你。”\n【旁白】街口有当值警员向街坊了解昨夜的轻微争执，另一边也有人带来一份普通人情请求；它们都只是生活入口，没有人替你决定未来路线。`,
    suggestedActions: isUnemployed
      ? ['先查看合适的求职或散工消息。', '问旧同学是否知道可靠的临时差事。']
      : ['先完成手上的工作。', '有空时问熟人想谈什么。'],
    playerPatch: {
      ...example.playerPatch,
      policeNumber: undefined,
      clothing: '洗得干净的浅色衬衫、深色长裤和旧皮鞋。',
      equipment: isUnemployed ? ['零钱包', '折起的求职广告', '家门钥匙'] : ['零钱包', '工作记事簿', '家门钥匙']
    },
    initialActors: [],
    memories: [
      {
        text: `开局时主角以${civilian?.publicOccupation ?? '普通市民'}身份开始一天的工作与生活。`,
        kind: 'turn',
        relatedActorIds: ['player'],
        relatedPlaceIds: [placeId],
        relatedOrganizationIds: [],
        importance: 80,
        visibility: 'player_known',
        certainty: 'fact'
      }
    ],
    casePatches: [],
    caseEvidencePatches: [],
    deferredEventPatches: [],
    assetPatch: { upsertItems: [], removeItems: [] }
  };
}

export function composeOpeningPrompt({
  setup,
  initialState,
  narrativeLengthLevel,
  narrativePerspective,
  promptSettings
}: ComposeOpeningPromptInput): string {
  const currency = getWorldCurrencyConfig(initialState.world.worldpackId);
  const narrativeLengthProfile = getNarrativeLengthProfile(narrativeLengthLevel);
  const openingGamePositioning = resolvePromptText('opening.gamePositioning', promptSettings);
  const narrativeGuide = createNarrativeStyleAndDisplayGuide(narrativeLengthProfile.level, promptSettings);
  const narrativePerspectiveGuide = createNarrativePerspectiveGuide(narrativePerspective, {
    playerName: initialState.player.name,
    playerGender: initialState.player.gender
  });
  const adultRelationshipGuide = createAdultRelationshipStyleGuide(promptSettings);
  const player = initialState.player;
  const playerActor = initialState.actors[player.actorId];
  const law = initialState.lawIdentity;
  const origin = player.originBackground;
  const traits = player.activeTraits.length
    ? player.activeTraits.map((trait) => `- ${trait.name}：${trait.effectSummary}`).join('\n')
    : '无开局特质';
  const cantoneseFlavor = cantoneseFlavorLabels[player.cantoneseFlavor];
  const openingPressure = openingPressureProfiles[setup.openingPressure ?? 'relaxed'];
  const openingPressureRules = [
    `- 开局压力：${openingPressure.label}。${openingPressure.summary}`,
    '- 这是开局生成的硬约束，必须影响 narrativeText 的冲突密度、NPC 初始状态、pressureSeeds 严重度和 suggestedActions 的急迫程度。',
    ...universalOpeningPressureRules.map((rule) => `- ${rule}`),
    ...openingPressure.rules.map((rule) => `- ${rule}`)
  ].join('\n');
  const openingNote = compact(setup.openingNote, '无');
  const exampleJson = JSON.stringify(createOpeningResponseExample(setup, initialState), null, 2);
  const memoryKindRules = [
    '- memory.kind 只能使用 turn、actor、case、place、world、player；不要使用 historical/news/event 这类自造枚举。',
    '- 历史背景、时代大事、新闻环境请使用 world；本回合发生的玩家经历请使用 turn。'
  ].join('\n');
  const openingIdentityContext = formatOpeningIdentityContext(setup, initialState);
  const currentScenario = hk1980sOpeningScenarios.find((scenario) => scenario.time.year === initialState.time.year);

  return `你是《Sorry, I'm a Cop V2》的开局导演和结构化写回器。

游戏定位：
${openingGamePositioning}

世界与时间：
- 时代：${initialState.time.year} 年香港语境。
- 当前剧本：${currentScenario?.title ?? `${initialState.time.year} 香港城市生活`}。
- 当前时间：${formatDateTime(initialState.time)}。
- Storypack 影响强度：${initialState.world.storypackInfluence}。它只影响背景素材取样强度和时代质感，不是固定剧本。

${openingIdentityContext}

香港社团行为逻辑（长期约束，只用于推演，不要在正文中讲解）：
${hk1980sTriadBehaviorKnowledge}

玩家档案：
- 中文名：${compact(player.name)}。若玩家中文名留空，请生成一个符合出身、身份和1980-1990年代香港语境的中文姓名，并写入 playerPatch.name。
- 英文名：${compact(player.englishName)}。香港英文名是长期角色字段；若玩家英文名留空，请根据中文名、性别和1980-1990年代香港常见英文名习惯生成，并写入 playerPatch.englishName。不要使用固定表机械拼接。
- 性别：${player.gender}
- 出生日期：${compact(player.birthDate)}
- 当前身份：${player.currentIdentity}
- 公开身份：${compact(playerActor.publicIdentity)}
${player.currentIdentity === 'police' ? `- 警员编号：${compact(player.policeNumber, '未填写，请生成四位数字警员编号')}` : '- 警员编号：不适用；不得生成或写入。'}
- 样貌：${player.appearance}
- 性格：${player.personality}
- 出身与背景：${origin.name}。${origin.definition}${origin.backgroundSummary}
- 初始生命/体力：默认生命100/100，体力100/100；若开局明确受伤、病弱、宿醉或疲惫，可在 playerPatch.vitals 中调整。
- 随身现金、银行存款、固定住所、整体知名度/整体口碑/圈层知名度/圈层口碑：开局由你根据以上信息合理生成，不开放玩家手填。
- 声誉数值规则：整体知名度 notoriety 与圈层知名度 visibility 都是 0-1000，只表示传播度；整体口碑 overallReputation 与圈层口碑 standing 都是 -100到100，负数表示负面评价，0表示未形成评价，正数表示正面评价。

${
  player.currentIdentity === 'police'
    ? `警队身份锚点：
- 警阶/职级：${compact(law.rank)}
- 部门：${compact(law.department)}
- 驻点：${compact(law.stationOrPost)}
- 岗位：${compact(law.assignmentSummary)}
- 权限：${law.authoritySummary}
- 可接触信息：${law.accessSummary}`
    : '当前身份不是警察：不得生成警员编号、警队工资、警务权限、警署开局地点或“阿Sir”称呼。'
}

能力与特质：
- 六维属性：${formatAttributes(player.attributes)}
- 开局特质：
${traits}

语言风味：
- 粤语风味：${cantoneseFlavor}
- 样貌、性格、出身背景、当前身份档案、特质、粤语风味都是真选项，必须影响开局场景、NPC生成和叙事选择。

开局压力（高优先级）：
${openingPressureRules}

开局额外要求（最高优先级）：
${openingNote}

正文风格与显示格式：
${narrativeGuide}

正文叙事人称：
${narrativePerspectiveGuide}

生成目标：
1. 写一段可直接显示给玩家的开局正文：开局 narrativeText 目标 ${narrativeLengthProfile.openingTarget} 个中文字符，最低不得少于 ${narrativeLengthProfile.openingMinimum} 个中文字符，除非玩家额外要求明确要求极简。
2. 开局正文必须同时完成四件事：时代背景、人物背景、当前情况、第一幕可互动点。
3. 时代背景不能写成讲义，必须落在报纸、电台、街灯、制服、楼宇、街坊、警署声音和1980-1990年代香港生活质感里。
4. 人物背景要把玩家姓名、年龄、出身、性格、外貌、当前身份档案、粤语风味和开局额外要求自然落到现场中；只有警察身份才写岗位与警员编号，不要只在 JSON 里写。
5. 当前情况要明确玩家此刻在哪、穿什么、身边有什么人或声音、眼前有什么可处理的日常事务、有哪些生活/制度/人情背景自然存在。
6. 第一幕只给一个可继续行动的现场入口，不要一开局就塞满大案、检控、处分、黑帮总攻或全城危机。
7. 先完整写 narrativeText，再写结构化 JSON；不要因为 initialActors、casePatches、assetPatch 等字段多而压缩正文。
8. 生成必要初始 NPC，尤其是与玩家出身、当前地点、身份档案、工作或岗位、开局要求有关的人。NPC 不必都在正文中出现。
9. 只把“已经有稳定个人身份”的人物写入 initialActors。新闻里、听说中、远处人群、可疑男子、某人的手下，可以在正文或 memory 中出现，但不要写成 Actor。
10. memories 中必须且只能有一条 kind=turn 的开局事实摘要，用 1-3 句记录开局已经发生的事实和结果；其他独立世界/案件/地点/玩家事实使用对应非 turn kind。
11. 可以生成压力种子，但不要每回合都压给玩家；压力种子是后台风险材料，不等于立即调查、处分或大案。
12. 生成玩家初始经济、固定住所、整体声誉和六个社会圈层观感；如开局已经存在暧昧钱物，写入灰色钱物账本。
13. 如果开局额外要求或正文中已经出现法律意义案件、上级交办案件、协办案件，必须写入 casePatches；不要只在 narrativeText 里提案件。
14. 如果玩家当前手里已有可提交材料，例如口供、现场记录、照片、录音、报告或文件，必须写入 assetPatch.upsertItems，并在物品上带 evidence.caseId。已经进入案件档案的材料写入 caseEvidencePatches。

硬规则：
- 禁止从正文解析状态写回；所有需要进入本地状态的内容必须写在 JSON 字段里。
- 常规三路线开局默认 secretFacts=[]；只有开局额外要求明确指定卧底、秘密效忠或主角已知秘密时才写 secretFacts，并准确填写 playerCharacterKnown、publicKnown、knownByActorIds 与 revealState。普通 NPC 不会因为系统保存秘密就自动知道。
- kind=turn 的 memories 是开局正文唯一的主角短期摘要，不得重复写多条；NPC 个人记忆写 initialActors 的 longTermMemorySummary、recentInteractionMemory 或 keyMemories，不要给人物记忆填写 importance。
- 禁止自动结案、自动核验证据、自动处分、自动进入明天。
- 普通巡逻求助、轻微滋扰、噪音投诉、店主/住户求助和现场调停不是案件，写入 memories、pressureSeeds 或 currentMatterPatches；只有正式或准正式案件才写 casePatches。
- 不要把未证实口径写成法律事实。真相、口径和档案可以互相冲突，玩家处理的是后果。
- 不要为了展示系统而在正文里罗列后台结构。
- initialActors 中每个 NPC 都必须有真实姓名、性别、年龄。姓名不能是“丧彪的手下”“可疑男子”“Shop Owner”这类描述词；缺少这些基础信息时，不要创建 Actor。
- initialActors 中每个 NPC 都必须写 attributes 六维：body、action、perception、thinking、negotiation、will，取值 0-100；按年龄、职业、身份、经历、性格和当前状态合理区分，不要把所有 NPC 都写成 50/50/50/50/50/50。
- initialActors 中 interactionScore 只能是 0-100 的整数，表示接触频率/牵连深浅，不代表喜欢或讨厌；仇恨、敌意、戒备、恐惧写入 attitudeTowardPlayer、relationshipSummary、trustTendency 或 entanglementSummary，不能用负数往来度表达。
- initialActors 中 NPC 不需要生命/体力字段，身体状况用 statusSummary/bodyConditionSummary 概括。
- 女性 NPC 必须写 femaleProfile；它只是女性角色的长期档案扩展，不能替代姓名、性别、年龄、身份、关系和记忆等基础字段。
- adultPrivateProfile 只允许写给已确认成年的女性 NPC：必须能从 birthDate 或 computedAge 判断当前年龄 >= 18；不确定或未成年时省略 adultPrivateProfile，只保留普通 femaleProfile。
- 确认成年女性 NPC 必须生成 adultPrivateProfile；它是成年女性的香闺秘档，用于长期关系连续性和未来文生图资料。不要省略，不要只写在正文里。
- adultPrivateProfile 写稳定的香闺秘档：profileStatus / womb / partProfiles / fetishNotes / sensitivePoints；profileStatus 用 ready。partProfiles 固定包含 胸部 / 小穴 / 屁穴 三项，用 description 直接写该部位的 NSFW 外观、触感、敏感特征或可视细节，必须一次写具体内容。description 采用直白、具体、粗俗、可感的档案写法，不把关键部位写成含糊代称，也不要写成诗化、比喻化、生活化或恋爱关系总结；不要使用“甬道”这类女性器官隐喻，也不要用“巨物、坚硬”这类替代男性器官或勃起状态的词。三个部位 description 只能写对应部位，不得混入姓名、脸、气质、家务、职业、收入、求婚、恋爱保障、家庭背景、人物性格或关系总结。partProfiles 每项可以额外写 imagePromptAnchor；imagePromptAnchor 是独立的文生图可画标签，可保留如玉、细腻这类可画风格词、镜头词或质感词，但不得替代 description，也不得反灌到 description。fetishNotes 是“性癖”，只写成人性偏好、刺激偏好、支配/被支配、羞耻、挑逗、身体赞美等稳定性兴奋点，不得写价值观、恋爱态度、信任条件、收入、求婚或家人照顾。不要写英文状态占位、中文待补内容、无记录占位、元说明、工程说明或泛化一致性说明。womb 使用 { "status": "未受孕", "cervixStatus": "紧闭", "records": [] } 这类结构。不要写临时动作或当回合状态。
- femaleProfile 公开字段只使用规范字段：birthday / addressToPlayer / appearanceDescription / bodyDescription / clothingStyle / personalityCore / affectionProgressionCondition / relationshipProgressionCondition / relationshipNetworkEdges。
- relationshipNetworkEdges 是重要女性关系网变量，格式为数组，每项 { "targetName": "人物或组织名", "relation": "关系", "note": "关系备注" }；用于记录家人、恋人、工作场所、闺蜜、保护人、债主等稳定牵连。
- femaleProfile 记录稳定档案真值：生日、对玩家称呼、稳定外貌、身材、常态衣着、核心性格、好感突破条件、关系突破条件和重要关系网。不要把一次性正文状态、临时恐惧、临时衣着脏污、当场动作或工程说明塞进 femaleProfile。
- 不要使用 callSign、publicRelationship、appearanceExpansion、characterCore、relationshipAdvancementConditions、socialNetwork、emotionalBoundaries 这类别名字段；称呼写 addressToPlayer，外貌写 appearanceDescription，关系网写 relationshipNetworkEdges。
- clothing 是单段衣着描述；equipment 最多三件，只放随身且会影响叙事的装备。
- 当前世界使用 ${currency.name}（${currency.code}）。playerPatch.economy.cashOnHand 是玩家当时真正随身携带、可在现场直接使用的现金；bankBalance 是银行存款，不在钱包、衣袋或手提箱里。
- cashOnHand 与 bankBalance 都必须是符合身份、年代和背景的具体非负整数。不得用 0 表示“待生成”；各身份按职业、收入和家庭压力合理生成，除非额外要求明确身无分文。
- playerPatch.clothing 必须是当前实际穿着，要符合身份、岗位、季节、地点和时代；不要写“开局待生成”。
- equipment 必须返回三件具体随身装备。警察身份应优先生成符合岗位的枪械、警棍手铐、通讯或记录工具；普通市民、社团分子按身份生成对应物品。禁止返回“装备一”“空槽”“开局待生成”或泛泛的“警用装备”。
- 输出 JSON 示例只是字段结构示例；示例里的说明性占位文本必须在实际输出中替换为具体内容，普通 NPC 姓名必须由本次开局按时代、身份和场景生成，不要照抄任何示例姓名或占位文字。
- 只返回一个合法 JSON object，不要 Markdown，不要代码块，不要额外解释。

${memoryKindRules}

成人段落输出前复核：
${adultRelationshipGuide}

OUTPUT_JSON_EXAMPLE
${exampleJson}`;
}
