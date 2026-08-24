import type { OpeningSetup } from '../runtime/initialState';
import type { AttributeBlock, RuntimeState } from '../runtime/types';
import { resolvePromptText } from '../prompts/promptRegistry';
import { getNarrativeLengthProfile, type NarrativeLengthLevel } from '../settings/narrativeLength';
import type { NarrativePerspective, PlayerPortrayalMode, PromptSettings } from '../settings/types';
import {
  getCivilianOpeningProfile,
  hk1980sOpeningScenarios,
  hk1980sPoliceRankKnowledge,
  hk1980sTriadBehaviorKnowledge,
  resolveTriadOpeningProfile
} from '../worldpack/hk1980sOpening';
import { hk1980sPoliceOperationalUnitKnowledge } from '../worldpack/hk1980sPoliceOperationalUnits';
import {
  createAdultRelationshipStyleGuide,
  createNarrativePerspectiveGuide,
  createNarrativeStyleAndDisplayGuide,
  createPlayerPortrayalGuide
} from '../context/narrativePromptGuides';
import { projectPoliceDutyContext } from '../police/policeDutyContext';
import { projectCivilianWorkSchedule } from '../livelihood/civilianWorkSchedule';
import { formatGameTimeWithWeekday } from '../time/gameTime';
import { getWorldCurrencyConfig } from '../worldpack/economyConfig';
import { createNarrativeLanguageGuide, type AppLocale } from '../localization/appLocale';
import { getCantoneseFlavorProfile } from '../settings/cantoneseFlavor';
import {
  formatEverydayEmployerTemplateCandidates,
  getOpeningLivelihoodMetadata
} from '../worldpack/hk1980sLivelihood';

interface ComposeOpeningPromptInput {
  setup: OpeningSetup;
  initialState: RuntimeState;
  narrativeLengthLevel?: NarrativeLengthLevel;
  narrativePerspective?: NarrativePerspective;
  playerPortrayalMode?: PlayerPortrayalMode;
  locale?: AppLocale;
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
    `- 班别：${projection.shiftLabel}`,
    `- 时段：${projection.scheduleWindow}`,
    `- 当前安排：${projection.currentDutySummary}`,
    `- 下一更：${projection.nextDutySummary}`,
    `- 轮班规则：${projection.rosterSummary}`,
    '- 未来七日班表（从开局日期起滚动）：',
    ...projection.weekSchedule.map(
      (entry) => `  - ${entry.isToday ? '今天 · ' : ''}${entry.summary}`
    ),
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
${hk1980sPoliceRankKnowledge}

香港警队行动单位资料库（长期制度边界）：
${hk1980sPoliceOperationalUnitKnowledge}`;
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
- 第一幕必须生成一名真实姓名的直属上线并标记 playerRoleRelation="triad_patron"，再生成一名真实姓名的同组成员并标记 playerRoleRelation="triad_peer"；两人都必须属于当前字头和活动区域，不能只写“联络人”“手下”而不建档。
- 直属上线必须在 narrativeText 中当面交代一项符合玩家层级的具体责任；这项责任写入 currentMatterPatches，复用 matterKind="social"、source="triad_responsibility"，并关联直属上线、同组成员、当前字头与发生地点。
- 第一项责任不是传统任务，也不是强制指令。必须写清目的、当前情况、期限或回应窗口、不能越过的边界和可能影响；玩家可以完成、拒绝、敷衍、换方法、隐瞒或利用机会，正文停在玩家真正开始处理之前。
- 第一幕应从这项符合当前层级的具体事务、街面关系或义务开始，不能直接把玩家写成全港话事人、杀手头目或掌握全知社团情报。`;
  }
  const profile = getCivilianOpeningProfile(setup.civilianProfileId, setup.civilianCustomProfile);
  const workSchedule = projectCivilianWorkSchedule({
    time: initialState.time,
    currentIdentity: initialState.player.currentIdentity,
    profile: actor.roleProfiles.civilian
  });
  const livelihoodMetadata = getOpeningLivelihoodMetadata(profile.id);
  const employmentBoundary =
    profile.employmentStatus === 'unemployed'
      ? '- 当前没有固定职业、雇主或固定薪水；不得强行生成上班任务或工资现金流，可从求职、散工、积蓄和家庭压力切入。'
      : profile.employmentStatus === 'custom'
        ? '- 自定义职业是玩家明确选择的事实锚点；不得擅自替换成预设职业，也不能因为职业名称自动授予警务或社团权限。'
        : profile.employerRelationType === 'owner'
          ? '- 当前职业、经营机构与工作地点是开局事实锚点；玩家只经营一间小型本地生意，不自动拥有集团资源或额外公共权力。'
          : '- 当前职业、雇主与工作地点是开局事实锚点；工作内容、收入、职级权限和接触面应符合该职业。';
  const employerTemplateCandidates = formatEverydayEmployerTemplateCandidates({
    year: initialState.time.year,
    sectorIds: [...(profile.sectorIds ?? []), ...(livelihoodMetadata?.sectorIds ?? [])],
    roleTags: [...(profile.roleTags ?? []), ...(livelihoodMetadata?.roleTags ?? [])]
  });
  return `市民开局身份边界：
- 公开职业：${profile.publicOccupation}
- 工作 / 日常地点：${profile.workplaceLabel}（${profile.workplacePlaceId}）
- 市民上班安排：${workSchedule.label}；${workSchedule.scheduleLabel}；${workSchedule.scheduleWindow}
- 当前工作时段：${workSchedule.currentWorkSummary}
- 下次上班：${workSchedule.nextWorkSummary}
- 工作规律：${workSchedule.weeklyPatternSummary}
${profile.employerName ? `- 雇主 / 经营机构：${profile.employerName}（${profile.employerOrganizationId}）\n` : ''}${profile.suggestedMonthlyIncome ? `- 开局固定月收入基准：HK$${profile.suggestedMonthlyIncome}（${profile.incomeKind === 'asset_income' ? '小型经营净收入' : '月薪'}，允许根据明确剧情改写、暂停或终止）\n` : ''}- 职业关系边界：${profile.employerRelationSummary ?? '当前没有固定机构关系。'}
- 社区关系：${profile.communitySummary}
- 家庭经济：${profile.familyEconomicSummary}
- 法律身份：${profile.legalStatusSummary}
- 生活雇主模板候选（仅作职业关系、经营方向与压力词汇参考，不代表任何机构或事件已经存在）：
${employerTemplateCandidates}
- 可自然出现的警队入口种子：${profile.policeEntrySeeds.join('；')}
- 可自然出现的社团入口种子：${profile.triadEntrySeeds.join('；')}
${employmentBoundary}
${workSchedule.promptRules.map((rule) => `- ${rule}`).join('\n')}
${
  profile.employerOrganizationId
    ? `- 第一幕必须让至少一名具有真实姓名和稳定身份的职业关系人物实际进入当前处境，并标记 playerRoleRelation="civilian_work_relation"；该人物只能绑定已登记机构 ${profile.employerOrganizationId}。`
    : '- 玩家没有填写结构化“雇主／经营机构”；第一幕改为生成一名朋友、邻居、房东、顾客、街坊、亲属或一般行业联系人，并标记 playerRoleRelation="civilian_social_relation"。仅在自由背景中提及的公司不会自动成为正式机构，禁止据此虚构 organizationId。'
}
- 关系必须符合实际生活结构，不要机械套用“老板+同事+客户”。无业者可以生成旧同事、散工介绍人或求职联系人；自由职业与自营者可以生成客户、合作方、供货商或熟客。
- 第一幕必须围绕一件已经通过该职业人物、工作交接、客户要求、求职联络或当前经营情况具体落到玩家面前的营生事务展开，并将且仅将这件事写入一条 active、known、matterKind="livelihood" 的 currentMatterPatches；关联该职业人物、当前工作地点及已有雇主/经营机构。它只是玩家可自由处理、拒绝或拖延的现实事务，不是强制任务。
- 机构整体方向与玩家手头事务必须分开。不得把抽象的机构压力直接复制成玩家事务；currentMatterPatches 记录的是正文已经落到玩家面前的具体事情。
- 市民是起源身份；不要在开局直接弹出“加入警队/加入社团”二选一，也不要替玩家完成转职。先写普通生活，再让具体关系和选择逐渐形成入口。
- 玩家可以拒绝两边并继续生活；家庭、住所、工作、街坊和旧友必须成为可长期保留的社会根基。当前角色档案：${actor.publicIdentity ?? '普通市民'}。`;
}

function createPoliceOpeningResponseExample(weatherLabel: string) {
  const reputationEntry = {
    visibility: 0,
    standing: 0,
    summary: '本圈层目前尚未形成明确看法。'
  };

  return {
      narrativeText:
        `【旁白】1988年9月的旺角进入夜班时段，报案室玻璃门外车流未停。示例当前天气为${weatherLabel}，正文必须服从实际环境状态。你在柜台后接过今晚的巡逻交接簿，夏季军装的皮带上挂着警棍、手铐和对讲机；警员编号已经抄在当值表上，今晚负责的范围从西洋菜街一直到花园街南段。\n【旁白】交接簿最上面夹着一张店铺噪音投诉，报案人只留下“陈太”和唐楼门牌。第一通电话说楼下有人连夜搬铁架，第二通却改口说后楼梯被货物堵住。两项说法可以来自同一间铺，也可能是两户街坊把不同麻烦报在一起。\n【值日警长】“先当普通投诉做，唔好一到场就摆查案款。有人想瞓觉，有人要赶住开工，两边讲大声少少都唔等于有案。”\n【旁白】值日警长把巡逻车匙留在抽屉，没有直接交给你。他翻到前一页，指出同一地址上月曾因走火通道堆货被消防人员口头提醒，但没有检控记录；如果后楼梯今晚仍被封住，现场便不只是噪音问题。\n【旁白】门外的小巴刚停稳，一名提着文件袋的中年女人走进警署。她没有往候问长凳坐，径直来到柜台，报出的正是纸上的门牌。\n【陈太】“阿Sir，我唔系想搞到人哋冇生意。楼下间铺晚晚十点后先搬货，成栋楼都听到；今晚仲用铁架顶住后门。我老爷行路慢，真系有事点落楼？”\n【旁白】她把一张屋宇互助委员会的便条放在柜台上。便条列着三户住客姓名，只有一人签了字，背面还写着店主白天答应清走杂物的时间。陈太承认自己没有再下楼确认，也不愿让店主知道是哪一户先报的警；她只要求有人到场看清楚通道是否能走。\n【报案室警员】“巡逻组仲喺花园街处理小贩争位，最快都要一阵。你如果接呢张，先写清楚系噪音投诉兼通道查核，唔好返嚟先发现漏咗一半。”\n【旁白】值日警长把投诉纸、上月的简短记录和互助委员会便条并排压在交接簿下，暂时没有替任何一方定性。报案室内已经有足够资料说明地点、当事人要求和可能涉及的现实风险，而那间店铺目前是否仍在搬货、后楼梯是否真的受阻，仍要由当晚的现场给出答案。`,
    presentationHints: {
      dialogueEmotions: ['serious', 'worried', 'serious'],
      innerMonologueEmotions: []
    },
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
        conditionSummary: '状态正常；如开局明确疲惫、受伤或病弱，可调整。',
        conditionPersistence: 'stable|transient|persistent|unknown'
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
    financePatch: {
      upsertCashflows: []
    },
    initialActors: [
      {
        actorId: 'actor_opening_duty_sergeant',
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
        playerRoleRelation: 'police_supervisor',
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
    currentMatterPatches: [],
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
      removeItems: [],
      equippedItemIds: []
    },
    grayLedger: []
  };
}

function createOpeningResponseExample(setup: OpeningSetup, initialState: RuntimeState) {
  const example = createPoliceOpeningResponseExample(
    initialState.environment.weather.label
  );
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
    const hasRegularTriadIncome = /看场|账目|場務|场务|協調|协调/.test(triadProfile.roleTitle);
    const actorTemplate = example.initialActors[0];
    const patronActorId = 'actor_opening_triad_patron';
    const peerActorId = 'actor_opening_triad_peer';
    return {
      ...example,
      narrativeText:
        `【旁白】${triadProfile.startPlaceLabel}的店铺刚开门，送货车、伙计和第一批熟客把街口挤得只剩半条路。你以“${triadProfile.rankSummary}”身份负责${triadProfile.roleTitle}，别人肯听你说话，是因为这项职务和既有关系，不等于整条街都由你一句话作主。\n【旁白】联络人坐在最靠里的一张桌旁，茶杯下压着一张折起的场地便笺。纸上写着借场人的称呼、到场人数、入场时段和散场期限，数目旁边另有一行较淡的铅笔字：后门只准搬货，不准留车。\n【联络人】“今晚有人借地方谈数，订金俾咗一半。你负责嘅系${triadProfile.roleTitle}，先睇清楚边样做得到、边样唔关你事。唔好为了面子，替上面应承未讲过嘅条件。”\n【旁白】他没有交出完整宾客名单，只把已经确认的三个人名圈出来。场地原本答应午夜前清场，但送货伙计提醒，后巷十一点半会有另一辆货车来卸酒；两边若同时占住通道，店主首先追究的是谁改了安排，而不是谁在社团里的称呼更响。\n【送货伙计】“后门啲木箱我十点前搬得清，架车我控制唔到。上次有人泊多半个钟，隔篱铺头即刻搵巡警。”\n【旁白】街口此时正有两名军装巡警经过。他们没有进店，只照平日路线望了一眼门牌和卸货区。联络人也没有因为警员出现便改口或催你行动，只把便笺转正，让场地时间、可用人手和不能碰的边界都留在桌面。\n【联络人】“做呢行最怕唔系人少，系个个都以为自己可以加条件。你先将纸上面呢单处理明白，之后先有人同你讲下一层。”\n【旁白】眼前事务没有被包装成争地盘或全城风声：借场安排已经成立一半，场地冲突尚未发生，现有人手只能保证店内秩序。你能够处理的是核对承诺、厘清责任和避免当晚在后门失控；超出职务的决定仍需由真正有权限的人承担。`,
      suggestedActions: ['先核对具体交代、期限和可用人手。', '确认这件事是否超出当前职务权限。'],
      playerPatch: {
        ...example.playerPatch,
        policeNumber: undefined,
        clothing: '不起眼的旧夹克、深色长裤与便于走动的布鞋。',
        equipment: ['零钱包', '纸烟与火柴', '写有电话号码的折叠纸条']
      },
      financePatch: {
        upsertCashflows: hasRegularTriadIncome
          ? [
              {
                itemId: 'cashflow_player_triad_regular_duty',
                direction: 'income',
                kind: 'other',
                title: `${triadProfile.roleTitle}月例`,
                amount: 1600,
                account: 'cash',
                identityBinding: 'gang_member',
                summary: '只有剧情明确该岗位存在稳定月例时才保留；社团职级本身不自动产生工资。',
                activeFromMonth: `${initialState.time.year}-${String(initialState.time.month).padStart(2, '0')}`,
                relatedAssetItemIds: [],
                relatedActorIds: ['player'],
                relatedPlaceIds: [triadProfile.startPlaceId],
                source: 'opening',
                status: 'active',
                visibility: 'private'
              }
            ]
          : []
      },
      initialActors: [
        {
          ...actorTemplate,
          actorId: patronActorId,
          name: '实际输出时生成一个真实的直属上线姓名，不要照抄示例占位文本',
          englishName: '按该中文名、性别和年代生成英文名；不要照抄示例占位文本',
          birthDate: `${initialState.time.year - 43}-05-12`,
          computedAge: 43,
          visualAgeAnchor: '四十岁左右',
          currentIdentity: 'gang_member',
          publicIdentity: `${triadProfile.societyName}${triadProfile.startPlaceLabel}一线负责人`,
          actualIdentitySummary: `负责${triadProfile.startPlaceLabel}日常联络与成员交代的社团人物。`,
          roleProfiles: {
            triad: {
              status: 'active',
              organizationId: triadProfile.organizationId,
              societyName: triadProfile.societyName,
              roleTitle: '地区线负责人',
              rankSummary: '玩家的直属上线',
              territorySummary: triadProfile.territorySummary,
              patronActorIds: [],
              peerActorIds: [],
              rivalActorIds: [],
              obligationSummary: '向玩家传递本地区已经成立的具体责任。',
              riskSummary: '须在地区规矩、警方关注和内部评价之间控制风险。'
            }
          },
          playerRoleRelation: 'triad_patron',
          organizationIds: [triadProfile.organizationId],
          positionSummary: `${triadProfile.startPlaceLabel}地区线负责人，玩家的直属上线。`,
          profileSummary: '熟悉本区人物和规矩，按结果判断玩家是否可靠。',
          appearance: '四十岁左右，神情沉稳，举止不张扬。',
          clothing: '合身短袖衬衫、深色长裤与旧皮鞋。',
          equipment: ['传呼机', '记事簿', '钥匙串'],
          personality: '谨慎、务实，重视是否守规矩和能否把事收好。',
          speechStyle: '粤语口吻，交代事情时短而具体，不说空泛帮规。',
          motivation: '让本地区当前事务收束，不给组织增加额外风险。',
          longTermGoal: '维持自己在地区线的信用和话语权。',
          values: '重视办事结果、边界和风险控制。',
          relationshipSummary: '玩家的直属上线，负责交代具体事务并观察玩家表现。',
          attitudeTowardPlayer: '愿意给机会，但会根据实际处理结果判断。',
          interactionScore: 25,
          trustTendency: '有限信任，等待玩家证明可靠。',
          entanglementSummary: '玩家的社团位置与此人的评价直接相关。',
          longTermMemorySummary: '负责带玩家进入当前地区关系网。',
          recentInteractionMemory: '开局时当面向玩家交代一项具体责任。',
          statusSummary: '正在处理本区日常事务。',
          bodyConditionSummary: '状态正常。',
          importance: 82
        },
        {
          ...actorTemplate,
          actorId: peerActorId,
          name: '实际输出时生成一个真实的同组成员姓名，不要照抄示例占位文本',
          englishName: '按该中文名、性别和年代生成英文名；不要照抄示例占位文本',
          birthDate: `${initialState.time.year - 29}-08-18`,
          computedAge: 29,
          visualAgeAnchor: '接近三十岁',
          currentIdentity: 'gang_member',
          publicIdentity: `${triadProfile.societyName}${triadProfile.startPlaceLabel}同组成员`,
          actualIdentitySummary: `与玩家同在${triadProfile.startPlaceLabel}活动的社团成员。`,
          roleProfiles: {
            triad: {
              status: 'active',
              organizationId: triadProfile.organizationId,
              societyName: triadProfile.societyName,
              roleTitle: '同组成员',
              rankSummary: '与玩家相近层级',
              territorySummary: triadProfile.territorySummary,
              patronActorIds: [patronActorId],
              peerActorIds: ['player'],
              rivalActorIds: [],
              obligationSummary: '与玩家共享部分地区事务，但各自对结果负责。',
              riskSummary: '可能合作、争功或因处事方式不同造成麻烦。'
            }
          },
          playerRoleRelation: 'triad_peer',
          organizationIds: [triadProfile.organizationId],
          positionSummary: `${triadProfile.startPlaceLabel}同组成员。`,
          profileSummary: '与玩家经常碰面，既能帮手也可能形成竞争。',
          appearance: '接近三十岁，动作利落，神情带几分好胜。',
          clothing: '花纹短袖衬衫、牛仔裤与运动鞋。',
          equipment: ['传呼机', '香烟', '零钱包'],
          personality: '行动较快、看重面子，对机会和功劳敏感。',
          speechStyle: '粤语口吻，熟人之间说话直接。',
          motivation: '在当前地区线争取更多信任和机会。',
          longTermGoal: '提高自己在同组成员中的位置。',
          values: '看重人情、面子和实际回报。',
          relationshipSummary: '玩家的同组成员，存在合作与竞争两种可能。',
          attitudeTowardPlayer: '熟悉但仍会比较彼此表现。',
          interactionScore: 18,
          trustTendency: '有条件合作。',
          entanglementSummary: '可能参与同一责任，也可能因处理方式不同影响结果。',
          longTermMemorySummary: '与玩家同属当前地区小网络。',
          recentInteractionMemory: '开局时在场听到直属上线对玩家的具体交代。',
          statusSummary: '正在关注当前交代。',
          bodyConditionSummary: '状态正常。',
          importance: 68
        }
      ],
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
      currentMatterPatches: [
        {
          id: 'matter_opening_triad_responsibility',
          title: '核清今晚借场安排',
          summary: '直属上线当面交代玩家核清借场时段、后门卸货冲突与可用人手，不要擅自借组织名义追加条件。',
          status: 'active',
          priority: 72,
          visibility: 'known',
          source: 'triad_responsibility',
          matterKind: 'social',
          pressureLevel: 2,
          responseWindow: 'today',
          consequenceHint: '处理方式会影响直属上线、同组成员、场所联系人和警方对玩家的具体看法。',
          currentHook: '先确认已经答应的条件、冲突时段和自己真正有权处理的范围。',
          unread: true,
          relatedActorIds: [patronActorId, peerActorId],
          relatedPlaceIds: [triadProfile.startPlaceId],
          relatedCaseIds: [],
          relatedOrganizationIds: [triadProfile.organizationId]
        }
      ],
      deferredEventPatches: [],
      assetPatch: { upsertItems: [], removeItems: [], equippedItemIds: [] }
    };
  }

  const civilian = playerActor.roleProfiles.civilian;
  const civilianProfile = getCivilianOpeningProfile(setup.civilianProfileId, setup.civilianCustomProfile);
  const isUnemployed = civilianProfile.employmentStatus === 'unemployed';
  const hasStableIncome = Boolean(civilianProfile.suggestedMonthlyIncome);
  const actorTemplate = example.initialActors[0];
  const livelihoodActorId = isUnemployed
    ? 'actor_opening_job_contact'
    : 'actor_opening_work_contact';
  const employerOrganizationIds = civilianProfile.employerOrganizationId
    ? [civilianProfile.employerOrganizationId]
    : [];
  return {
    ...example,
    narrativeText: isUnemployed
      ? `【旁白】${civilianProfile.workplaceLabel}门口的求职告示被风吹得一下下拍着玻璃。你目前没有固定工作，钱包里的零钱只够几顿饭，家里昨晚又把下月水电单压在桌角；这不是立即把你推向警队或社团的命令，只是普通生活里已经不能一直拖下去的压力。\n【旁白】旧同学在茶餐厅靠窗的位置等你，校服年代留下的花名仍叫得顺口。他没有许诺长期职位，只把一张从工头手里抄来的纸条放在桌上：印刷厂临时缺晚班，连续做三日，每日下班现金结算；搬纸、看机和清理油墨都算在工时里，迟到一次便换人。\n【旧同学】“我唔系介绍你入去坐写字楼，讲明先。今晚肯做就有今晚钱，做得稳，工头先会问你下星期仲嚟唔嚟。你若果嫌辛苦，我而家就同人讲，唔使去到门口先反口。”\n【旁白】纸条写着工厂大厦层数、公车路线和报到时间，背面另有一间货运公司的长期职位面试：底薪较稳，却要求两名推荐人和一份住址证明。旧同学只能替临时晚班带路，不能替你担保长期职位；他自己也要在午前回覆工头，好让对方决定是否继续找人。\n【茶餐厅伙计】“两位啲奶茶冻晒喇。电话亭头先有人排队，真系要覆工，唔好等到十二点。”\n【旁白】桌上的两条路并没有变成职业菜单。临时工能较快带回现金，但不能保证下星期仍有班开；长期职位需要资料和人情，今天只来得及先联系面试。家里的账单、旧同学愿意帮到哪一步，以及雇主真正提出的条件都已经清楚，下一步仍由你自己安排。`
      : `【旁白】${civilianProfile.workplaceLabel}已经进入一天最忙的时段。你以“${civilianProfile.publicOccupation}”身份处理手上的工作，职位带来的只是相应职责、收入和接触面，并不自动赋予警察权力、社团关系或老板级资源。桌边压着一份今天必须交代清楚的单据，原件、复写副本和实际收货记录的数目并不一致。\n【熟人】“我冇替你签收，差嗰几件唔系小数。你先睇原单，迟多一阵，对面负责嗰个人就收工。”\n【旁白】他把原单和找回的零钱分开放好，没有替任何人改日期。原单写着上午十点交付，复写副本却多出一行手写补货；签名像是同一个人的笔迹，落款时间相差四十分钟。实际送到的数量符合第一张单，不符合补写后的总数。\n【旁白】门口顾客不断进来，日常工作没有因为这处差额停下。熟人先去处理自己的事务，把能确认的部分留给你：货物确实到过、第一次数量有人清点、后来那行补写没有当面见证。若今天不说明，月底结算时差额会落在当前经手人名下；若贸然指认，又可能把普通抄写错误变成不必要的冲突。\n【同事】“仓里仲有旧记录，不过钥匙喺主管手上。佢下昼返嚟之前，你可以先将两张单嘅时间同签收人排清楚，唔好郁原件。”\n【旁白】这件事没有突然牵出大案，也没有陌生人送来秘密。现场能够推进的只有现有工作：保护原单、厘清两次记录、找到有权限的人确认改动。它是否只是忙中出错，还是有人想把缺口转到你名下，要等这些普通而具体的步骤完成后才有答案。`,
    suggestedActions: isUnemployed
      ? ['先查看合适的求职或散工消息。', '问旧同学是否知道可靠的临时差事。']
      : ['先完成手上的工作。', '有空时问熟人想谈什么。'],
    playerPatch: {
      ...example.playerPatch,
      policeNumber: undefined,
      clothing: '洗得干净的浅色衬衫、深色长裤和旧皮鞋。',
      equipment: isUnemployed ? ['零钱包', '折起的求职广告', '家门钥匙'] : ['零钱包', '工作记事簿', '家门钥匙']
    },
    financePatch: {
      upsertCashflows: !hasStableIncome
        ? []
        : [
            {
              itemId: 'cashflow_player_civilian_primary_job',
              direction: 'income',
              kind: civilianProfile.incomeKind ?? 'salary',
              title:
                civilianProfile.incomeKind === 'asset_income'
                  ? `${civilianProfile.label}经营收入`
                  : `${civilianProfile.label}月薪`,
              amount: civilianProfile.suggestedMonthlyIncome ?? 0,
              account: 'bank',
              identityBinding: 'civilian',
              summary:
                civilianProfile.incomeKind === 'asset_income'
                  ? '根据当前小型经营、年代和现金流稳定性建立的开局经营收入快照。'
                  : '根据当前职业、年代和雇佣稳定性建立的开局工资快照。',
              activeFromMonth: `${initialState.time.year}-${String(initialState.time.month).padStart(2, '0')}`,
              relatedAssetItemIds: [],
              relatedActorIds: ['player'],
              relatedPlaceIds: [civilianProfile.workplacePlaceId],
              source: 'opening',
              status: 'active',
              visibility: 'player_known'
            }
          ]
    },
    initialActors: [
      {
        ...actorTemplate,
        actorId: livelihoodActorId,
        name: '实际输出时生成一个真实的职业关系人物姓名，不要照抄示例占位文本',
        englishName: '按该中文名、性别和年代生成英文名；不要照抄示例占位文本',
        birthDate: `${initialState.time.year - (isUnemployed ? 31 : 38)}-04-16`,
        computedAge: isUnemployed ? 31 : 38,
        visualAgeAnchor: isUnemployed ? '三十岁出头' : '接近四十岁',
        currentIdentity: 'civilian',
        publicIdentity: isUnemployed
          ? '旧同学兼散工介绍人'
          : `${civilianProfile.workplaceLabel}职业联系人`,
        actualIdentitySummary: isUnemployed
          ? '认识本区几名工头，偶尔替熟人介绍可靠散工。'
          : `在${civilianProfile.workplaceLabel}与玩家有稳定日常工作往来。`,
        roleProfiles: {
          civilian: {
            status: 'active',
            civilianProfileId: undefined,
            occupationGroupId: undefined,
            employmentStatusId: isUnemployed ? 'casual_worker' : 'employed',
            publicOccupation: isUnemployed ? '散工介绍人' : '职业联系人',
            workplacePlaceId: civilianProfile.workplacePlaceId,
            employerOrganizationId: civilianProfile.employerOrganizationId,
            employerRelationType: isUnemployed ? 'informal_contact' : 'employee',
            workUnitSummary: undefined,
            positionSummary: isUnemployed ? '替熟人联络短期工作。' : '负责与玩家日常工作相邻的事务。',
            dutySummary: isUnemployed ? '确认散工条件、报到时间和介绍对象。' : '处理本职工作并与玩家协调交接。',
            decisionScopeSummary: '只能承诺自己实际负责的事项。',
            accessSummary: '只接触与当前工作往来直接相关的人和资料。',
            sectorIds: civilianProfile.sectorIds ?? [],
            roleTags: isUnemployed ? ['job_contact', 'casual_work'] : ['work_contact'],
            livelihoodActorIds: ['player'],
            employerRelationSummary: isUnemployed
              ? '与工头和求职熟人保持非正式联络。'
              : '与玩家在同一工作环境中保持稳定往来。',
            communitySummary: '在当前工作地点附近有可确认的日常接触。',
            familyEconomicSummary: '个人经济状况不向玩家自动公开。',
            legalStatusSummary: '普通市民，没有警察执法权限。'
          }
        },
        playerRoleRelation: 'civilian_work_relation',
        organizationIds: employerOrganizationIds,
        positionSummary: isUnemployed
          ? '旧同学兼散工介绍人。'
          : `${civilianProfile.workplaceLabel}内与玩家有稳定往来的职业联系人。`,
        profileSummary: isUnemployed
          ? '了解少量临时工作消息，但不能替雇主承诺长期职位。'
          : '熟悉当前工作流程，能够确认部分日常事实，但无权替主管作最终决定。',
        appearance: isUnemployed
          ? '三十岁出头，衣着朴素，随身带着写满电话号码的小纸簿。'
          : '接近四十岁，神情专注，身上留有当前工作的日常痕迹。',
        clothing: isUnemployed ? '旧衬衫、长裤和胶底鞋。' : '符合当前职业和年代的日常工作服。',
        equipment: isUnemployed ? ['电话号码簿', '零钱包'] : ['工作记事簿', '钥匙串'],
        personality: '务实，只对自己确实知道和能够负责的事情作答。',
        speechStyle: '粤语口吻，说话具体，不用空泛职业套话。',
        motivation: isUnemployed ? '把可靠的临时工作介绍给合适的人。' : '把眼前工作顺利交接，不让责任混乱。',
        longTermGoal: '维持自己在当前职业网络中的可靠名声。',
        values: '重视实际条件、责任边界和长期往来。',
        relationshipSummary: isUnemployed
          ? '玩家的旧同学和求职联系人。'
          : '玩家当前职业网络中的稳定工作关系人物。',
        attitudeTowardPlayer: '愿意提供自己掌握的真实信息，但不会替玩家作决定。',
        interactionScore: 20,
        trustTendency: '有基础信任，仍取决于后续实际往来。',
        entanglementSummary: '可能因工作安排、收入和责任分配与玩家持续发生联系。',
        longTermMemorySummary: '与玩家因营生和职业往来建立稳定联系。',
        recentInteractionMemory: isUnemployed
          ? '开局时向玩家说明一份临时工作和一条较稳定职位线索。'
          : '开局时与玩家核对一项需要当日处理的工作记录。',
        statusSummary: '正在处理眼前工作事务。',
        bodyConditionSummary: '状态正常。',
        importance: 60
      }
    ],
    memories: [
      {
        text: `开局时主角以${civilian?.publicOccupation ?? '普通市民'}身份开始一天的工作与生活。`,
        kind: 'turn',
        relatedActorIds: ['player'],
        relatedPlaceIds: [placeId],
        relatedOrganizationIds: civilianProfile.employerOrganizationId ? [civilianProfile.employerOrganizationId] : [],
        importance: 80,
        visibility: 'player_known',
        certainty: 'fact'
      }
    ],
    casePatches: [],
    caseEvidencePatches: [],
    currentMatterPatches: [
      {
        id: 'matter_opening_livelihood',
        title: isUnemployed ? '确认眼前的工作机会' : '核清手上工作记录',
        summary: isUnemployed
          ? '旧同学提供了一份当晚结算的临时工作和一条需要资料担保的长期职位线索，玩家需要自行决定是否继续联系。'
          : '当前工作记录与实际情况不一致，玩家需要保护原始资料并找有权限的人确认改动。',
        status: 'active',
        priority: isUnemployed ? 62 : 68,
        visibility: 'known',
        source: 'opening_livelihood',
        matterKind: 'livelihood',
        pressureLevel: 2,
        responseWindow: 'today',
        consequenceHint: isUnemployed
          ? '不处理不会触发强制转职，但短期收入压力和职位机会会自然变化。'
          : '若当日不厘清，经手责任和结算差额可能落到玩家身上。',
        currentHook: isUnemployed
          ? '先确认临时工条件、报到时间和长期职位需要的资料。'
          : '先核对两份记录的时间、数量和签收人，不改动原件。',
        unread: true,
        relatedActorIds: [livelihoodActorId],
        relatedPlaceIds: [civilianProfile.workplacePlaceId],
        relatedCaseIds: [],
        relatedOrganizationIds: employerOrganizationIds
      }
    ],
    deferredEventPatches: [],
    assetPatch: { upsertItems: [], removeItems: [], equippedItemIds: [] }
  };
}

export function composeOpeningPrompt({
  setup,
  initialState,
  narrativeLengthLevel,
  narrativePerspective,
  playerPortrayalMode,
  locale,
  promptSettings
}: ComposeOpeningPromptInput): string {
  const currency = getWorldCurrencyConfig(initialState.world.worldpackId);
  const narrativeLengthProfile = getNarrativeLengthProfile(narrativeLengthLevel);
  const openingGamePositioning = resolvePromptText('opening.gamePositioning', promptSettings);
  const narrativeGuide = createNarrativeStyleAndDisplayGuide(
    narrativeLengthProfile.level,
    promptSettings,
    playerPortrayalMode
  );
  const narrativePerspectiveGuide = createNarrativePerspectiveGuide(narrativePerspective, {
    playerName: initialState.player.name,
    playerGender: initialState.player.gender
  });
  const playerPortrayalGuide = createPlayerPortrayalGuide(playerPortrayalMode, 'opening');
  const narrativeLanguageGuide = createNarrativeLanguageGuide(locale);
  const adultRelationshipGuide = createAdultRelationshipStyleGuide(promptSettings);
  const player = initialState.player;
  const playerActor = initialState.actors[player.actorId];
  const law = initialState.lawIdentity;
  const origin = player.originBackground;
  const traits = player.activeTraits.length
    ? player.activeTraits.map((trait) => `- ${trait.name}：${trait.effectSummary}`).join('\n')
    : '无开局特质';
  const cantoneseFlavorProfile = getCantoneseFlavorProfile(player.cantoneseFlavor);
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
- 当前天气：${initialState.environment.weather.label}（${initialState.environment.weather.condition}），${initialState.environment.weather.impactSummary}
- 当前天气由本地环境状态给出，正文必须服从该天气，不得自行改成雨天；开局响应不得创建天气写回。
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
- 初始生命/体力：默认生命100/100，体力100/100；若开局明确受伤、病弱、宿醉或疲惫，可在 playerPatch.vitals 中调整。写 conditionSummary 时同时写 conditionPersistence：正常稳定状态用 stable，短期疲劳/宿醉用 transient，持续伤病用 persistent，确实无法判断才用 unknown。
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
- 粤语风味：${cantoneseFlavorProfile.label}：${cantoneseFlavorProfile.promptGuide}
- 样貌、性格、出身背景、当前身份档案、特质、粤语风味都是真选项，必须影响开局场景、NPC生成和叙事选择。

开局压力（高优先级）：
${openingPressureRules}

开局额外要求（最高优先级）：
${openingNote}

  正文风格与显示格式：
  ${narrativeGuide}

  玩家可见输出语言：
  ${narrativeLanguageGuide}

  正文叙事人称：
${narrativePerspectiveGuide}

  正文演绎风格：
${playerPortrayalGuide}

生成目标：
1. 写一段可直接显示给玩家的开局正文：当前篇幅档位目标 ${narrativeLengthProfile.openingTarget} 个中文字符，narrativeText 不得少于 ${narrativeLengthProfile.openingMinimum} 个中文字符。不得因为身份日常、事件简单或结构化字段较多而自行缩短。
2. 让玩家自然看懂自己是谁、此刻身在何处、眼前正在发生什么以及下一步可以介入什么；这些信息按现场需要组织，不设固定段落数、固定顺序或逐项检查表。
3. 时代感只选一至两个会影响当前行动的具体锚点，例如当时的工作方式、交通、传媒、制服、物价、通讯或街区生活；不要罗列报纸、电台、街灯、楼宇、声音和气味凑成时代清单，也不要写成讲义。
4. 玩家姓名、年龄、出身、性格、外貌、当前身份档案、粤语风味与开局要求只在会改变当前处境、NPC 反应或可行动入口时自然出现；只有警察身份才写岗位与警员编号，不要把整份人物卡搬进正文。
5. 第一幕聚焦一个能够继续行动的具体事务、关系或现场变化。不要同时塞入多条职业路线，也不要一开局就堆满大案、检控、处分、黑帮总攻或全城危机。
6. 围绕这一件事纵向展开现有工作步骤、人物对白与回应、信息差、制度/人情限制和直接后果来达到篇幅；这些是可选材料，不是固定顺序，也不得靠重复反应、五感清单、履历朗读或强造第二条事件填字。
7. 先完整写 narrativeText，再写结构化 JSON；不要因为 initialActors、casePatches、assetPatch 等字段多而压缩正文。
7a. 可选 presentationHints 只写 dialogueEmotions 与 innerMonologueEmotions 两个顺序数组，分别对应正文中对话和【内心】的出现顺序；只使用 neutral/happy/excited/ecstatic/sad/angry/surprised/serious/worried/afraid/embarrassed/shy/tired/thinking/secretive，不复制正文、角色名或 actorId。
8. 生成必要初始 NPC，尤其是与玩家出身、当前地点、身份档案、工作或岗位、开局要求有关的人。NPC 不必都在正文中出现；正文中有真实姓名并直接发言或行动、以后还会继续联系的人，必须同时写入 initialActors，并使用稳定 actorId。
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
- initialActors 中与玩家当前岗位存在直接角色链的人，必须填写 playerRoleRelation：直属警队上级用 police_supervisor、同僚用 police_peer、社团带头人用 triad_patron、同级成员用 triad_peer；市民有已登记雇主时用 civilian_work_relation，没有已登记雇主时用 civilian_social_relation 表示稳定生活关系。该字段只表达已经成立的关系，不得凭空制造机构或岗位。
- initialActors 中每个 NPC 都必须写 attributes 六维：body、action、perception、thinking、negotiation、will，取值 0-100；按年龄、职业、身份、经历、性格和当前状态合理区分，不要把所有 NPC 都写成 50/50/50/50/50/50。
- initialActors 中 interactionScore 只能是 0-100 的整数，表示接触频率/牵连深浅，不代表喜欢或讨厌；仇恨、敌意、戒备、恐惧写入 attitudeTowardPlayer、relationshipSummary、trustTendency 或 entanglementSummary，不能用负数往来度表达。
- initialActors 中 NPC 不需要生命/体力字段，身体状况用 statusSummary/bodyConditionSummary 概括。
- 女性 NPC 必须写 femaleProfile；它只是女性角色的长期档案扩展，不能替代姓名、性别、年龄、身份、关系和记忆等基础字段。
- 开局阶段一律省略 adultPrivateProfile，即使 NPC 已确认成年或与玩家已有伴侣关系也不要生成香闺秘档。香闺秘档会在后续关系发展或明确成人事件形成可靠结构化事实后逐步建立，不能以年龄、首次见面或开局身份为由猜测、套模板或写占位内容。
- femaleProfile 公开字段只使用规范字段：birthday / addressToPlayer / appearanceDescription / bodyDescription / clothingStyle / personalityCore / affectionProgressionCondition / relationshipProgressionCondition / relationshipNetworkEdges。
- relationshipNetworkEdges 是重要女性关系网变量，格式为数组，每项 { "targetName": "人物或组织名", "relation": "关系", "note": "关系备注" }；用于记录家人、恋人、工作场所、闺蜜、保护人、债主等稳定牵连。
- femaleProfile 记录稳定档案真值：生日、对玩家称呼、稳定外貌、身材、常态衣着、核心性格、好感突破条件、关系突破条件和重要关系网。不要把一次性正文状态、临时恐惧、临时衣着脏污、当场动作或工程说明塞进 femaleProfile。
- 不要使用 callSign、publicRelationship、appearanceExpansion、characterCore、relationshipAdvancementConditions、socialNetwork、emotionalBoundaries 这类别名字段；称呼写 addressToPlayer，外貌写 appearanceDescription，关系网写 relationshipNetworkEdges。
- clothing 是单段衣着描述；equipment 最多三件，只放随身且会影响叙事的装备。
- equipment 是开局玩家外显装备名称，本地会据此建立基础装备物品。若 assetPatch 另行新增或调整装备，必须用稳定 itemId，并用 assetPatch.equippedItemIds 指定当前装备。不得把多个实体合成“钱包、钥匙串”一件物品。
- 当前世界使用 ${currency.name}（${currency.code}）。playerPatch.economy.cashOnHand 是玩家当时真正随身携带、可在现场直接使用的现金；bankBalance 是银行存款，不在钱包、衣袋或手提箱里。
- 可直接花用的现金、港币、钞票和零钱不得写入 assetPatch；支票、本票、汇票、存单、债券、欠条、收据和礼券等独立凭据可以作为物品，兑现后应移除并由 financePatch 结算。
- cashOnHand 与 bankBalance 都必须是符合身份、年代和背景的具体非负整数。不得用 0 表示“待生成”；各身份按职业、收入和家庭压力合理生成，除非额外要求明确身无分文。
- 如果玩家的自定义背景或额外开局要求已经明确给出现金或存款金额，必须原样写入对应字段，不得因为金额罕见、身份显赫或超出普通生活水平而擅自缩小、换算或改写；没有明确金额时才按当前背景合理生成。
- financePatch.upsertCashflows 是开局的固定月度收支快照，最多两条。市民有稳定受雇工作时建立一条 identityBinding="civilian" 的工资；自营商户只有在开局事实明确存在稳定经营收益时才可建立 asset_income。无业、散工、按更或短期差事不得伪造整月固定工资。
- 社团职级本身不产生统一工资。只有开局事实明确存在长期看场、场务、账目、合法掩护工作或稳定收益安排时，才建立 identityBinding="gang_member" 的固定收入；跑腿、收数分成和单次差事应在实际到账的回合做一次性结算。
- 警察工资由本地警衔与年代工资表自动建立；开局输出不得另造警队工资项。固定收入 amount 是月额，activeFromMonth 使用 YYYY-MM，必须使用稳定 itemId，并按实际入账方式选择 cash 或 bank。
- playerPatch.clothing 必须是当前实际穿着，要符合身份、岗位、季节、地点和时代；不要写“开局待生成”。
- equipment 必须返回三件具体随身装备；本地会把这些开局锚点同步成基础装备物品。若 assetPatch 同时调整装备，则 upsertItems / equippedItemIds 必须使用一致的稳定物品 ID。警察身份应优先生成符合岗位的枪械、警棍手铐、通讯或记录工具；普通市民、社团分子按身份生成对应物品。禁止返回“装备一”“空槽”“开局待生成”或泛泛的“警用装备”。
- 输出 JSON 示例只是字段结构示例；示例里的说明性占位文本必须在实际输出中替换为具体内容，普通 NPC 姓名必须由本次开局按时代、身份和场景生成，不要照抄任何示例姓名或占位文字。
- 只返回一个合法 JSON object，不要 Markdown，不要代码块，不要额外解释。

${memoryKindRules}

成人段落输出前复核：
${adultRelationshipGuide}

OUTPUT_JSON_EXAMPLE
${exampleJson}`;
}
