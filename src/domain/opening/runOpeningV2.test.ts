import { describe, expect, it } from 'vitest';
import type {
  NarratorAttemptRecord,
  NarratorClient,
  NarratorDetailedCompletion,
  NarratorRequestPurpose,
  NarratorStreamOptions
} from '../narrator/NarratorClient';
import { resolveRequestOutputBudget } from '../narrator/narratorLimits';
import {
  createInitialRuntimeState,
  type OpeningSetup
} from '../runtime/initialState';
import { NarratorTruncatedError } from '../narrator/NarratorErrors';
import { getDramaticOpeningSourceRef } from '../drama/openingRegistry';
import { beginOrResumeOpeningSession } from './openingSessionCoordinator';
import type {
  OpeningSessionRepository,
  OpeningSessionSummary
} from './openingSessionRepository';
import type { OpeningSessionDraft } from './openingSessionDraft';
import { runOpeningV2 } from './runOpeningV2';

const SESSION_ID = 'opening_v2_orchestration';
const POLICE_SLOT = 'opening_actor_police_relation_1';
const CIVILIAN_SOCIAL_SLOT = 'opening_actor_civilian_social_relation_1';

class MemoryOpeningSessionRepository implements OpeningSessionRepository {
  private readonly drafts = new Map<string, OpeningSessionDraft>();

  async list(): Promise<OpeningSessionSummary[]> {
    return [...this.drafts.values()].map(
      ({
        openingSessionId,
        setupHash,
        worldpackId,
        stage,
        createdAt,
        updatedAt
      }) => ({
        openingSessionId,
        setupHash,
        worldpackId,
        stage,
        createdAt,
        updatedAt
      })
    );
  }

  async load(openingSessionId: string): Promise<OpeningSessionDraft | null> {
    const draft = this.drafts.get(openingSessionId);
    return draft ? structuredClone(draft) : null;
  }

  async findLatestResumable(
    setupHash: string
  ): Promise<OpeningSessionDraft | null> {
    const draft = [...this.drafts.values()]
      .filter(
        (candidate) =>
          candidate.setupHash === setupHash && candidate.stage !== 'committed'
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    return draft ? structuredClone(draft) : null;
  }

  async save(draft: OpeningSessionDraft): Promise<void> {
    this.drafts.set(draft.openingSessionId, structuredClone(draft));
  }

  async delete(openingSessionId: string): Promise<void> {
    this.drafts.delete(openingSessionId);
  }

  async clearAll(): Promise<void> {
    this.drafts.clear();
  }
}

interface QueuedResponse {
  purpose: NarratorRequestPurpose;
  value?: unknown;
  error?: Error;
}

class QueueNarrator implements NarratorClient {
  readonly purposes: NarratorRequestPurpose[] = [];
  readonly stageBudgets: number[] = [];

  constructor(
    private readonly responses: QueuedResponse[],
    readonly configuredMaxTokens = 32_768
  ) {}

  async complete(): Promise<unknown> {
    throw new Error('completeDetailed should be used');
  }

  async completeDetailed(
    _input: unknown,
    options?: NarratorStreamOptions
  ): Promise<NarratorDetailedCompletion> {
    const response = this.responses.shift();
    if (!response) throw new Error('missing queued narrator response');
    const purpose = options?.requestPurpose ?? 'auxiliary';
    this.purposes.push(purpose);
    if (options?.stageMaxTokens !== undefined) {
      this.stageBudgets.push(options.stageMaxTokens);
    }
    if (purpose !== response.purpose) {
      throw new Error(`expected ${response.purpose}, received ${purpose}`);
    }
    if (response.error) throw response.error;
    const rawText = JSON.stringify(response.value);
    options?.onRawDelta?.(rawText);
    options?.onRawText?.(rawText);
    const narrativeText =
      response.value &&
      typeof response.value === 'object' &&
      'narrativeText' in response.value
        ? String((response.value as { narrativeText: unknown }).narrativeText)
        : '';
    if (narrativeText) options?.onTextDelta?.(narrativeText);
    return {
      value: response.value,
      attempt: createAttempt(
        purpose,
        rawText,
        options?.stageMaxTokens,
        this.configuredMaxTokens
      )
    };
  }
}

function createAttempt(
  purpose: NarratorRequestPurpose,
  rawText: string,
  stageMaxTokens?: number,
  configuredMaxTokens?: number
): NarratorAttemptRecord {
  const outputBudget =
    stageMaxTokens === undefined
      ? undefined
      : resolveRequestOutputBudget({
          configuredMaxTokens,
          stageMaxTokens
        });
  return {
    attemptId: `${purpose}_${Math.random().toString(36).slice(2)}`,
    purpose,
    stream: purpose === 'opening_narrative',
    requestedMaxTokens: outputBudget?.requestedMaxTokens,
    ...(outputBudget ? { outputBudget } : {}),
    finishReason: 'stop',
    rawText,
    parseStatus: 'success',
    startedAt: '2026-07-28T00:00:00.000Z',
    finishedAt: '2026-07-28T00:00:01.000Z',
    usage: { promptTokens: 100, completionTokens: 80 }
  };
}

function createSetup(): OpeningSetup {
  return {
    playerName: '陈志明',
    englishName: 'Michael Chan',
    gender: 'male',
    age: 25,
    policeNumber: '9527',
    currentIdentity: 'police',
    policePostingId: 'cid_headquarters',
    startTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: 21,
      minute: 30
    }
  };
}

function createCivilianSetup(): OpeningSetup {
  return {
    playerName: '陈志明',
    englishName: 'Michael Chan',
    gender: 'male',
    age: 25,
    currentIdentity: 'civilian',
    civilianProfileId: 'custom_occupation',
    civilianCustomProfile: {
      publicOccupation: '贸易文员',
      workplacePlaceId: 'place_central_ferry_piers',
      workplaceLabel: '中环'
    },
    openingNote: '我在金龙贸易公司工作，但没有填写结构化雇主字段。',
    startTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: 21,
      minute: 30
    }
  };
}

function createCivilianSocialCast(
  state: ReturnType<typeof createInitialRuntimeState>
): Record<string, unknown> {
  return {
    openingSessionId: SESSION_ID,
    openingFacts: {
      situationSummary: '玩家在住所附近遇见一名熟悉的街坊。',
      centralMatter: '确认一项普通生活联络。',
      playerDecisionBoundary: '玩家决定是否回应。'
    },
    actors: [
      {
        slotId: CIVILIAN_SOCIAL_SLOT,
        name: '梁锦青',
        gender: 'male',
        currentIdentity: 'civilian',
        publicIdentity: '街坊熟人',
        actualIdentitySummary: '与玩家有稳定日常往来的普通市民。',
        playerRoleRelation: 'civilian_social_relation',
        organizationIds: [],
        positionSummary: '街坊熟人',
        profileSummary: '熟悉附近生活环境。',
        personality: '随和而谨慎。',
        speechStyle: '说话平实。',
        motivation: '维持日常来往。',
        presence: 'present',
        currentPlaceId: state.location.currentPlaceId,
        currentSceneId: state.location.currentSceneId
      }
    ],
    actionIntents: [
      {
        actionId: 'opening_action_1',
        intent: '与梁锦青交谈。',
        relatedActorSlotIds: [CIVILIAN_SOCIAL_SLOT],
        requiredFacts: []
      },
      {
        actionId: 'opening_action_2',
        intent: '先处理自己的事情。',
        relatedActorSlotIds: [],
        requiredFacts: []
      }
    ]
  };
}

function createCivilianSocialNarrative(): Record<string, unknown> {
  return {
    openingSessionId: SESSION_ID,
    narrativeText:
      '夜色落在唐楼外墙上，梁锦青站在楼下信箱旁，把一封误投的信交还给陈志明。他只说附近邮差最近常把同姓住户的信件混在一起，没有替陈志明拆看，也没有把普通生活小事说成紧急麻烦。陈志明可以当面问清信件来处，也可以先带回住所核对门牌。'.repeat(
        4
      ),
    suggestedActions: [
      { actionId: 'opening_action_1', text: '问梁锦青信件从哪里拿到。' },
      { actionId: 'opening_action_2', text: '先回住所核对门牌。' }
    ]
  };
}

function createCivilianSocialRuntime(): Record<string, unknown> {
  return {
    openingSessionId: SESSION_ID,
    playerPresentationPatch: {
      name: '陈志明',
      englishName: 'Michael Chan',
      clothing: '浅色衬衫与长裤。',
      equipment: ['家门钥匙'],
      statusSummary: '结束一天外出后回到住所附近。'
    },
    playerStatePatch: {
      economy: {
        cashOnHand: 300,
        bankBalance: 1800,
        monthlyPressure: 40,
        financeSummary: '依靠零散文职收入维持生活。'
      },
      homeBase: {
        placeId: 'place_home_player_opening',
        placeName: '油麻地唐楼住所',
        regionId: 'region_yau_ma_te',
        housingType: '唐楼分租房',
        summary: '靠近街市的旧式分租房。',
        householdSummary: '独自居住。'
      }
    },
    memories: [
      {
        text: '梁锦青在住所楼下把一封误投的信交还给陈志明。',
        kind: 'turn',
        relatedActorIds: ['player', CIVILIAN_SOCIAL_SLOT],
        relatedCaseIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: [],
        importance: 60,
        visibility: 'player_known',
        certainty: 'fact'
      }
    ],
    currentMatterPatches: [
      {
        id: 'matter_opening_civilian',
        title: '核对误投信件',
        summary: '一封误投信件已经由街坊交还。',
        status: 'active',
        priority: 25,
        visibility: 'known',
        source: 'opening_livelihood',
        matterKind: 'livelihood',
        relatedActorIds: [CIVILIAN_SOCIAL_SLOT],
        pressureLevel: 0,
        responseWindow: 'open',
        consequenceHint: '不处理时只会继续留下收件混淆。',
        currentHook: '核对信封门牌与收件人。',
        unread: true
      }
    ]
  };
}

function createCast(
  state: ReturnType<typeof createInitialRuntimeState>
): Record<string, unknown> {
  return {
    openingSessionId: SESSION_ID,
    openingFacts: {
      situationSummary: '刑事侦缉处完成夜班交接。',
      centralMatter: '确认当晚需要优先跟进的线索。',
      playerDecisionBoundary: '玩家决定先问上司还是查看交更记录。'
    },
    actors: [
      {
        slotId: POLICE_SLOT,
        name: '梁志强',
        gender: 'male',
        currentIdentity: 'police',
        publicIdentity: '刑事侦缉处警长',
        actualIdentitySummary: '皇家香港警察刑事侦缉处当值警长。',
        playerRoleRelation: 'police_supervisor',
        organizationIds: ['org_hk_police'],
        positionSummary: '刑事侦缉处当值警长',
        profileSummary: '负责交更和案件分派。',
        personality: '谨慎务实，重视程序。',
        speechStyle: '说话简短直接。',
        motivation: '完成当晚案件分派。',
        presence: 'present',
        currentPlaceId: state.location.currentPlaceId,
        currentSceneId: state.location.currentSceneId
      }
    ],
    actionIntents: [
      {
        actionId: 'opening_action_1',
        intent: '询问当晚最急的案件。',
        relatedActorSlotIds: [POLICE_SLOT],
        requiredFacts: ['梁志强正在分派案件']
      },
      {
        actionId: 'opening_action_2',
        intent: '先查看交更记录。',
        relatedActorSlotIds: [],
        requiredFacts: ['交更记录已经放在桌上']
      }
    ]
  };
}

function createDramaticCast(
  state: ReturnType<typeof createInitialRuntimeState>
): Record<string, unknown> {
  const sourceRef = getDramaticOpeningSourceRef('first_shift');
  if (!sourceRef) throw new Error('missing first_shift source');
  return {
    ...createCast(state),
    dramaPlan: {
      planId: 'drama_plan_opening_first_shift',
      planningScope: 'opening',
      mode: 'surface',
      primarySource: sourceRef,
      supportSources: [],
      sceneFunction: 'choice',
      intensity: 'medium',
      playerMayIgnore: true,
      maxNewActors: 4,
      adaptationSummary: '把第一班压力落到当前交更现场。',
      reasonSummary: '玩家可以从当值任务自然进入第一幕。'
    }
  };
}

function createProfile(
  state: ReturnType<typeof createInitialRuntimeState>,
  thinking: number | string = 63
): Record<string, unknown> {
  return {
    computedAge: 42,
    visualAgeAnchor: '四十岁出头，眼角有长期夜班留下的细纹。',
    roleProfiles: {
      police: {
        status: 'active',
        agencyId: 'org_hk_police',
        stationOrPost: '湾仔警署',
        department: '刑事侦缉处',
        rank: '警长',
        assignmentSummary: '当值主管',
        postRole: 'duty_sergeant',
        supervisorActorIds: [],
        peerActorIds: [],
        authoritySummary: '负责当值案件分派。',
        accessSummary: '可查阅交更记录。',
        dutySummary: '分派案件并审核记录。',
        institutionalReputation: '经验可靠。',
        disciplinePressureSummary: '重视程序。'
      }
    },
    appearance: '短发，神情沉稳。',
    clothing: '便装衬衫和西裤。',
    equipment: [],
    longTermGoal: '带好队伍。',
    values: '程序、责任与同僚。',
    attributes: {
      body: 55,
      action: 52,
      perception: 68,
      thinking,
      negotiation: 61,
      will: 70
    },
    relationshipSummary: '玩家的当值上司。',
    attitudeTowardPlayer: '观察玩家的办案方式。',
    interactionScore: 18,
    trustTendency: '看实际表现。',
    entanglementSummary: '工作分派形成持续联系。',
    longTermMemorySummary: '知道玩家刚到任。',
    recentInteractionMemory: '刚完成交更。',
    keyMemories: [],
    statusSummary: '正在当值。',
    bodyConditionSummary: '略有疲惫。',
    visibility: 'player_known',
    importance: 72,
    worldpackActorData: {},
    currentPlaceId: state.location.currentPlaceId,
    currentSceneId: state.location.currentSceneId
  };
}

function createCastWithRemoteActor(
  state: ReturnType<typeof createInitialRuntimeState>
): Record<string, unknown> {
  const cast = createCast(state);
  return {
    ...cast,
    actors: [
      ...(cast.actors as unknown[]),
      {
        slotId: 'opening_actor_extra_1',
        name: '周文杰',
        gender: 'male',
        currentIdentity: 'police',
        publicIdentity: '已调往新界的旧同僚',
        actualIdentitySummary: '皇家香港警察新界南总区警员。',
        organizationIds: ['org_hk_police'],
        positionSummary: '新界南总区军装警员',
        profileSummary: '与玩家曾经同组、目前不在场的旧同僚。',
        personality: '外向灵活，重视街面人情。',
        speechStyle: '语速快，喜欢先讲结论。',
        motivation: '维持与旧同僚的联系。',
        presence: 'mentioned'
      }
    ]
  };
}

function createRemoteProfile(
  thinking: number | string = 58
): Record<string, unknown> {
  return {
    computedAge: 35,
    visualAgeAnchor: '三十岁中段，常年户外执勤晒得肤色较深。',
    roleProfiles: {
      police: {
        status: 'active',
        agencyId: 'org_hk_police',
        stationOrPost: '沙田警署',
        department: '军装部',
        rank: '警员',
        assignmentSummary: '分区巡逻',
        postRole: 'uniform_patrol_constable',
        supervisorActorIds: [],
        peerActorIds: [],
        authoritySummary: '负责一般巡逻和初步处置。',
        accessSummary: '可接触分区勤务记录。',
        dutySummary: '街面巡逻与报案初动。',
        institutionalReputation: '善于处理街坊关系。',
        disciplinePressureSummary: '偶尔因做事灵活受到提醒。'
      }
    },
    appearance: '肤色较深，笑起来露出一颗虎牙。',
    clothing: '休班时常穿浅色夹克。',
    equipment: [],
    longTermGoal: '争取进入侦缉部门。',
    values: '义气、效率与街坊信任。',
    attributes: {
      body: 61,
      action: 65,
      perception: 59,
      thinking,
      negotiation: 67,
      will: 54
    },
    relationshipSummary: '玩家曾经的同组同僚。',
    attitudeTowardPlayer: '愿意交换消息但不替人背责。',
    interactionScore: 32,
    trustTendency: '重视互相帮忙和守口如瓶。',
    entanglementSummary: '旧同组经历令双方仍会互通消息。',
    longTermMemorySummary: '记得与玩家一起处理过多次夜班纠纷。',
    recentInteractionMemory: '上月曾通过电话问候。',
    keyMemories: [],
    statusSummary: '目前在新界南总区当值。',
    bodyConditionSummary: '身体状态正常。',
    visibility: 'player_known',
    importance: 58,
    worldpackActorData: {}
  };
}

function createCastWithCivilianExtra(
  state: ReturnType<typeof createInitialRuntimeState>
): Record<string, unknown> {
  const cast = createCast(state);
  return {
    ...cast,
    actors: [
      ...(cast.actors as unknown[]),
      {
        slotId: 'opening_actor_extra_1',
        name: '梁锦青',
        gender: 'male',
        currentIdentity: 'civilian',
        publicIdentity: '贸易公司职员',
        actualIdentitySummary: '一名普通受雇市民。',
        organizationIds: [],
        positionSummary: '普通职员',
        profileSummary: '在警署附近与玩家接触的普通市民。',
        personality: '谨慎而有礼。',
        speechStyle: '说话平实。',
        motivation: '完成眼前事务。',
        presence: 'present',
        currentPlaceId: state.location.currentPlaceId,
        currentSceneId: state.location.currentSceneId
      }
    ]
  };
}

function createCivilianExtraProfile(): Record<string, unknown> {
  return {
    computedAge: 34,
    visualAgeAnchor: '三十岁中段。',
    roleProfiles: {
      civilian: {
        status: 'active',
        employmentStatusId: 'employed',
        publicOccupation: '贸易公司职员',
        positionSummary: '普通职员',
        dutySummary: '处理日常文书与联络。',
        decisionScopeSummary: '只能处理获授权的日常事务。',
        accessSummary: '接触一般业务记录。',
        sectorIds: ['trade'],
        roleTags: ['clerk'],
        livelihoodActorIds: [],
        communitySummary: '认识附近同行与街坊。',
        familyEconomicSummary: '依靠薪金生活。',
        legalStatusSummary: '普通香港市民。'
      }
    },
    appearance: '短发，戴黑框眼镜。',
    clothing: '浅色衬衫与深色长裤。',
    equipment: [],
    longTermGoal: '维持稳定生活。',
    values: '守信与务实。',
    attributes: {
      body: 45,
      action: 48,
      perception: 56,
      thinking: 60,
      negotiation: 52,
      will: 55
    },
    relationshipSummary: '与玩家保持普通联系。',
    attitudeTowardPlayer: '礼貌而审慎。',
    interactionScore: 12,
    trustTendency: '需要相处后判断。',
    entanglementSummary: '目前只有日常往来。',
    longTermMemorySummary: '记得玩家的公开身份。',
    recentInteractionMemory: '刚在现场与玩家交谈。',
    keyMemories: [],
    statusSummary: '状态正常。',
    bodyConditionSummary: '没有明显不适。',
    visibility: 'player_known',
    importance: 45,
    worldpackActorData: {}
  };
}

function createNarrative(): Record<string, unknown> {
  return {
    openingSessionId: SESSION_ID,
    narrativeText:
      '湾仔警署刑事侦缉处刚完成夜班交接，电话铃、打字声和走廊脚步声混在一起。梁志强翻开交更簿，把尚未收尾的线索逐项圈出，又提醒陈志明哪些记录必须先核对。他没有替陈志明决定顺序，只把最容易拖成投诉的事情摆到桌面。窗外雨丝压着霓虹，值房里仍有人来回递送文件。陈志明可以先问清楚最急的一宗，也可以自己从交更记录开始梳理人名和地点。'.repeat(
        4
      ),
    suggestedActions: [
      { actionId: 'opening_action_1', text: '向梁志强询问最急的案件。' },
      { actionId: 'opening_action_2', text: '先查看昨夜交更记录。' }
    ]
  };
}

function createRuntime(): Record<string, unknown> {
  return {
    openingSessionId: SESSION_ID,
    playerPresentationPatch: {
      name: '陈志明',
      englishName: 'Michael Chan',
      policeNumber: '9527',
      clothing: '整齐便装。',
      equipment: ['警察委任证'],
      statusSummary: '精神清醒。'
    },
    playerStatePatch: {
      economy: {
        cashOnHand: 500,
        bankBalance: 1200,
        monthlyPressure: 30,
        financeSummary: '收入有限但尚有存款。'
      },
      homeBase: {
        placeId: 'place_home_player_opening',
        placeName: '湾仔唐楼住所',
        regionId: 'region_wan_chai',
        housingType: '唐楼分租房',
        summary: '靠近警署的旧式分租房。',
        householdSummary: '独自居住。'
      }
    },
    memories: [
      {
        text: '陈志明在湾仔警署完成夜班交接。',
        kind: 'turn',
        relatedActorIds: ['player', POLICE_SLOT],
        relatedCaseIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: ['org_hk_police'],
        importance: 70,
        visibility: 'player_known',
        certainty: 'fact'
      }
    ]
  };
}

async function createSeededRepository(
  setup: OpeningSetup,
  state: ReturnType<typeof createInitialRuntimeState>
): Promise<MemoryOpeningSessionRepository> {
  const repository = new MemoryOpeningSessionRepository();
  await beginOrResumeOpeningSession({
    setup,
    state,
    repository,
    openingSessionId: SESSION_ID
  });
  return repository;
}

describe('runOpeningV2 staged orchestration', () => {
  it('commits the four independent stages once and applies the opening atomically', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const narrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createCast(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [{ actorSlotId: POLICE_SLOT, profile: createProfile(state) }]
        }
      },
      { purpose: 'opening_narrative', value: createNarrative() },
      { purpose: 'opening_runtime', value: createRuntime() }
    ]);

    const result = await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_actor_enrichment',
      'opening_narrative',
      'opening_runtime'
    ]);
    expect(result.turnCounter).toBe(0);
    expect(result.storyLog[0]?.text).toContain('梁志强');
    expect(result.actors[POLICE_SLOT]?.currentPlaceId).toBe(
      state.location.currentPlaceId
    );
    expect((await repository.load(SESSION_ID))?.stage).toBe('committed');
  });

  it('accepts an employed optional civilian with no registered employer without a profile repair request', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const narrator = new QueueNarrator([
      {
        purpose: 'opening_cast',
        value: createCastWithCivilianExtra(state)
      },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [
            {
              actorSlotId: POLICE_SLOT,
              profile: createProfile(state)
            },
            {
              actorSlotId: 'opening_actor_extra_1',
              profile: createCivilianExtraProfile()
            }
          ]
        }
      },
      { purpose: 'opening_narrative', value: createNarrative() },
      { purpose: 'opening_runtime', value: createRuntime() }
    ]);

    await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_actor_enrichment',
      'opening_narrative',
      'opening_runtime'
    ]);
    expect(narrator.purposes).not.toContain(
      'opening_actor_enrichment_repair'
    );
    const saved = await repository.load(SESSION_ID);
    expect(
      saved?.actorProfiles.opening_actor_extra_1?.status === 'ready'
        ? saved.actorProfiles.opening_actor_extra_1.profile.roleProfiles
            .civilian?.employerOrganizationId
        : 'unexpected'
    ).toBeUndefined();
    expect(
      saved?.diagnostics.some(
        (diagnostic) =>
          diagnostic.code ===
          'opening_civilian_employer_unresolved_allowed'
      )
    ).toBe(true);
  });

  it('completes a civilian start with a free-text company but no formal employer by using a social relation', async () => {
    const setup = createCivilianSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const narrator = new QueueNarrator([
      {
        purpose: 'opening_cast',
        value: createCivilianSocialCast(state)
      },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [
            {
              actorSlotId: CIVILIAN_SOCIAL_SLOT,
              profile: createCivilianExtraProfile()
            }
          ]
        }
      },
      {
        purpose: 'opening_narrative',
        value: createCivilianSocialNarrative()
      },
      {
        purpose: 'opening_runtime',
        value: createCivilianSocialRuntime()
      }
    ]);

    const result = await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_actor_enrichment',
      'opening_narrative',
      'opening_runtime'
    ]);
    expect(state.organizations.org_player_custom_employer).toBeUndefined();
    const saved = await repository.load(SESSION_ID);
    expect(
      saved?.actorProfiles[CIVILIAN_SOCIAL_SLOT]?.status === 'ready'
        ? saved.actorProfiles[CIVILIAN_SOCIAL_SLOT].profile.playerRoleRelation
        : undefined
    ).toBe('civilian_social_relation');
    expect(
      result.actors[CIVILIAN_SOCIAL_SLOT]?.roleProfiles.civilian
        ?.employerOrganizationId
    ).toBeUndefined();
    expect(saved?.stage).toBe('committed');
  });

  it('uses one small cast field repair instead of regenerating the full cast', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const invalidCast = createCast(state);
    (
      (invalidCast.actors as Array<Record<string, unknown>>)[0]
    ).playerRoleRelation = 'manager';
    const narrator = new QueueNarrator(
      [
        { purpose: 'opening_cast', value: invalidCast },
        {
          purpose: 'opening_cast_field_repair',
          value: {
            repairs: [
              {
                path: `actors.${POLICE_SLOT}.playerRoleRelation`,
                value: 'police_supervisor'
              }
            ]
          }
        },
        {
          purpose: 'opening_actor_enrichment',
          value: {
            openingSessionId: SESSION_ID,
            actors: [{ actorSlotId: POLICE_SLOT, profile: createProfile(state) }]
          }
        },
        { purpose: 'opening_narrative', value: createNarrative() },
        { purpose: 'opening_runtime', value: createRuntime() }
      ],
      65_536
    );

    const result = await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_cast_field_repair',
      'opening_actor_enrichment',
      'opening_narrative',
      'opening_runtime'
    ]);
    expect(narrator.stageBudgets).toEqual([
      10_240,
      65_536,
      12_288,
      8_192,
      8_192
    ]);
    const saved = await repository.load(SESSION_ID);
    expect(saved?.castDraft?.actors[0].playerRoleRelation).toBe(
      'police_supervisor'
    );
    expect(saved?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'cast',
          status: 'recovered',
          message: expect.stringContaining('playerRoleRelation')
        })
      ])
    );
    expect(result.storyLog[0]?.text).toBe(createNarrative().narrativeText);
  });

  it('repairs only an invalid drama trace and preserves the accepted narrative', async () => {
    const setup: OpeningSetup = {
      ...createSetup(),
      dramaticOpeningId: 'first_shift'
    };
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const narrative = {
      ...createNarrative(),
      dramaExecutionTrace: 'invalid trace'
    };
    const narrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createDramaticCast(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [{ actorSlotId: POLICE_SLOT, profile: createProfile(state) }]
        }
      },
      { purpose: 'opening_narrative', value: narrative },
      {
        purpose: 'opening_narrative_trace_repair',
        value: {
          dramaExecutionTrace: {
            planId: 'drama_plan_opening_first_shift',
            status: 'not_used',
            usedSourceRefs: [],
            resultingWritebackRefs: []
          }
        }
      },
      { purpose: 'opening_runtime', value: createRuntime() }
    ]);

    const result = await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      repairNarrator: narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_actor_enrichment',
      'opening_narrative',
      'opening_narrative_trace_repair',
      'opening_runtime'
    ]);
    expect(result.storyLog[0]?.text).toBe(createNarrative().narrativeText);
    const saved = await repository.load(SESSION_ID);
    expect(saved?.narrativeDraft?.dramaExecutionTrace).toEqual({
      planId: 'drama_plan_opening_first_shift',
      status: 'not_used',
      usedSourceRefs: [],
      resultingWritebackRefs: []
    });
    expect(
      saved?.diagnostics.some((diagnostic) =>
        diagnostic.message.includes('仅修复了戏剧执行回执')
      )
    ).toBe(true);
  });

  it('saves a valid actor and repairs only the invalid remote actor field', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const narrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createCastWithRemoteActor(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [
            {
              actorSlotId: POLICE_SLOT,
              profile: createProfile(state)
            },
            {
              actorSlotId: 'opening_actor_extra_1',
              profile: createRemoteProfile('58')
            }
          ]
        }
      },
      {
        purpose: 'opening_actor_enrichment_repair',
        value: {
          actorSlotId: 'opening_actor_extra_1',
          repairs: [{ path: 'attributes.thinking', value: 58 }]
        }
      },
      { purpose: 'opening_narrative', value: createNarrative() },
      { purpose: 'opening_runtime', value: createRuntime() }
    ]);

    await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      repairNarrator: narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_actor_enrichment',
      'opening_actor_enrichment_repair',
      'opening_narrative',
      'opening_runtime'
    ]);
    const draft = await repository.load(SESSION_ID);
    expect(
      draft?.actorProfiles[POLICE_SLOT]?.status === 'ready'
        ? draft.actorProfiles[POLICE_SLOT].profile.attributes.thinking
        : undefined
    ).toBe(63);
    expect(
      draft?.actorProfiles.opening_actor_extra_1?.status === 'ready'
        ? draft.actorProfiles.opening_actor_extra_1.profile.attributes.thinking
        : undefined
    ).toBe(58);
    expect(
      draft?.actorProfiles.opening_actor_extra_1?.status === 'ready'
        ? draft.actorProfiles.opening_actor_extra_1.profile.currentPlaceId
        : 'unexpected'
    ).toBeUndefined();
    expect(
      draft?.diagnostics.some((diagnostic) =>
        diagnostic.message.includes('attributes.thinking')
      )
    ).toBe(true);
  });

  it('repeats only the small profile repair when the first diversity repair is ineffective', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const sharedAttributes = createProfile(state).attributes;
    const remoteProfile = {
      ...createRemoteProfile(),
      attributes: sharedAttributes
    };
    const distinctAttributes = {
      body: 61,
      action: 65,
      perception: 59,
      thinking: 58,
      negotiation: 67,
      will: 54
    };
    const narrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createCastWithRemoteActor(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [
            {
              actorSlotId: POLICE_SLOT,
              profile: createProfile(state)
            },
            {
              actorSlotId: 'opening_actor_extra_1',
              profile: remoteProfile
            }
          ]
        }
      },
      {
        purpose: 'opening_actor_enrichment_repair',
        value: {
          actorSlotId: 'opening_actor_extra_1',
          repairs: [{ path: 'attributes', value: sharedAttributes }]
        }
      },
      {
        purpose: 'opening_actor_enrichment_repair',
        value: {
          actorSlotId: 'opening_actor_extra_1',
          repairs: [{ path: 'attributes', value: distinctAttributes }]
        }
      },
      { purpose: 'opening_narrative', value: createNarrative() },
      { purpose: 'opening_runtime', value: createRuntime() }
    ]);

    await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      repairNarrator: narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_actor_enrichment',
      'opening_actor_enrichment_repair',
      'opening_actor_enrichment_repair',
      'opening_narrative',
      'opening_runtime'
    ]);
    const saved = await repository.load(SESSION_ID);
    expect(
      saved?.actorProfiles.opening_actor_extra_1?.status === 'ready'
        ? saved.actorProfiles.opening_actor_extra_1.profile.attributes
        : undefined
    ).toEqual(distinctAttributes);
  });

  it('resumes from the narrative checkpoint and requests only the unfinished runtime stage', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const firstNarrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createCast(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [{ actorSlotId: POLICE_SLOT, profile: createProfile(state) }]
        }
      },
      { purpose: 'opening_narrative', value: createNarrative() },
      {
        purpose: 'opening_runtime',
        error: new Error('provider temporarily unavailable')
      }
    ]);

    await expect(
      runOpeningV2({
        setup,
        initialState: state,
        narrator: firstNarrator,
        sessionRepository: repository,
        narrativeLengthLevel: 'compact'
      })
    ).rejects.toThrow('provider temporarily unavailable');
    expect((await repository.load(SESSION_ID))?.stage).toBe('narrative_ready');

    const resumedNarrator = new QueueNarrator([
      { purpose: 'opening_runtime', value: createRuntime() }
    ]);
    const result = await runOpeningV2({
      setup,
      initialState: state,
      narrator: resumedNarrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(resumedNarrator.purposes).toEqual(['opening_runtime']);
    expect(result.storyLog[0]?.text).toContain('夜班交接');
    expect((await repository.load(SESSION_ID))?.stage).toBe('committed');
  });

  it('retries only the narrative stage after a severely short narrative', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const narrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createCast(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [{ actorSlotId: POLICE_SLOT, profile: createProfile(state) }]
        }
      },
      {
        purpose: 'opening_narrative',
        value: {
          ...createNarrative(),
          narrativeText: '过短正文。'
        }
      },
      { purpose: 'opening_narrative', value: createNarrative() },
      { purpose: 'opening_runtime', value: createRuntime() }
    ]);
    let narrativeResetCount = 0;

    await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact',
      onNarrativeReset: () => {
        narrativeResetCount += 1;
      }
    });

    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_actor_enrichment',
      'opening_narrative',
      'opening_narrative',
      'opening_runtime'
    ]);
    expect(narrativeResetCount).toBeGreaterThanOrEqual(2);
  });

  it('repairs only an invalid runtime domain and preserves the accepted narrative', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const invalidRuntime = {
      ...createRuntime(),
      memories: [
        ...(createRuntime().memories as unknown[]),
        ...(createRuntime().memories as unknown[])
      ]
    };
    const narrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createCast(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [{ actorSlotId: POLICE_SLOT, profile: createProfile(state) }]
        }
      },
      { purpose: 'opening_narrative', value: createNarrative() },
      { purpose: 'opening_runtime', value: invalidRuntime },
      {
        purpose: 'opening_runtime_domain_repair',
        value: {
          domains: {
            memory: createRuntime().memories
          }
        }
      }
    ]);

    const result = await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      repairNarrator: narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_actor_enrichment',
      'opening_narrative',
      'opening_runtime',
      'opening_runtime_domain_repair'
    ]);
    expect(result.storyLog[0]?.text).toBe(createNarrative().narrativeText);
    expect(
      (await repository.load(SESSION_ID))?.diagnostics.some((diagnostic) =>
        diagnostic.message.includes('memory')
      )
    ).toBe(true);
  });

  it('repairs economy and currentMatter as two isolated runtime domains', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const invalidRuntime = {
      ...createRuntime(),
      playerStatePatch: {
        ...(createRuntime().playerStatePatch as Record<string, unknown>),
        economy: {
          cashOnHand: 500,
          bankBalance: 1200,
          monthlyPressure: 30,
          financeSummary: null
        }
      },
      currentMatterPatches: '模型把事项写成了说明文字'
    };
    const narrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createCast(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [{ actorSlotId: POLICE_SLOT, profile: createProfile(state) }]
        }
      },
      { purpose: 'opening_narrative', value: createNarrative() },
      { purpose: 'opening_runtime', value: invalidRuntime },
      {
        purpose: 'opening_runtime_domain_repair',
        value: {
          domains: {
            economy: { financeSummary: '收入有限但尚有存款。' }
          }
        }
      },
      {
        purpose: 'opening_runtime_domain_repair',
        value: { domains: { currentMatter: [] } }
      }
    ]);

    const result = await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      repairNarrator: narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(
      narrator.purposes.filter(
        (purpose) => purpose === 'opening_runtime_domain_repair'
      )
    ).toHaveLength(2);
    expect(result.player.economy.financeSummary).toBe(
      '收入有限但尚有存款。'
    );
  });

  it('retries one truncated runtime field repair with compact context', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const invalidRuntime = {
      ...createRuntime(),
      memories: [
        ...(createRuntime().memories as unknown[]),
        ...(createRuntime().memories as unknown[])
      ]
    };
    const truncatedAttempt: NarratorAttemptRecord = {
      ...createAttempt(
        'opening_runtime_domain_repair',
        '{"domains":{"memory":[',
        32_768,
        32_768
      ),
      finishReason: 'length',
      parseStatus: 'truncated'
    };
    const narrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createCast(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [{ actorSlotId: POLICE_SLOT, profile: createProfile(state) }]
        }
      },
      { purpose: 'opening_narrative', value: createNarrative() },
      { purpose: 'opening_runtime', value: invalidRuntime },
      {
        purpose: 'opening_runtime_domain_repair',
        error: new NarratorTruncatedError(truncatedAttempt)
      },
      {
        purpose: 'opening_runtime_domain_repair',
        value: { domains: { memory: createRuntime().memories } }
      }
    ]);

    const result = await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      repairNarrator: narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(
      narrator.purposes.filter(
        (purpose) => purpose === 'opening_runtime_domain_repair'
      )
    ).toHaveLength(2);
    expect(narrator.purposes).not.toContain('opening_json_repair');
    expect(result.storyLog[0]?.text).toBe(createNarrative().narrativeText);
  });

  it('normalizes string key memories locally and records every V2 stage budget', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const narrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createCast(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [
            {
              actorSlotId: POLICE_SLOT,
              profile: {
                ...createProfile(state),
                keyMemories: ['曾在一次夜班巡逻中替玩家解围']
              }
            }
          ]
        }
      },
      { purpose: 'opening_narrative', value: createNarrative() },
      { purpose: 'opening_runtime', value: createRuntime() }
    ]);

    await runOpeningV2({
      setup,
      initialState: state,
      narrator,
      repairNarrator: narrator,
      sessionRepository: repository,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_actor_enrichment',
      'opening_narrative',
      'opening_runtime'
    ]);
    expect(narrator.stageBudgets).toEqual([
      10_240,
      12_288,
      8_192,
      8_192
    ]);
    const draft = await repository.load(SESSION_ID);
    expect(
      draft?.actorProfiles[POLICE_SLOT]?.status === 'ready'
        ? draft.actorProfiles[POLICE_SLOT].profile.keyMemories
        : undefined
    ).toEqual([
      {
        text: '曾在一次夜班巡逻中替玩家解围',
        importance: 50,
        visibility: 'player_known'
      }
    ]);
    expect(draft?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'opening_key_memory_string_normalized',
          path: ['actorProfiles', POLICE_SLOT, 'keyMemories', 0]
        })
      ])
    );
  });

  it('stops a core profile repair after two identical no-progress responses', async () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);
    const repository = await createSeededRepository(setup, state);
    const invalidProfile = {
      ...createProfile(state),
      attributes: {
        ...(createProfile(state).attributes as Record<string, unknown>),
        thinking: '63'
      }
    };
    const narrator = new QueueNarrator([
      { purpose: 'opening_cast', value: createCast(state) },
      {
        purpose: 'opening_actor_enrichment',
        value: {
          openingSessionId: SESSION_ID,
          actors: [{ actorSlotId: POLICE_SLOT, profile: invalidProfile }]
        }
      },
      {
        purpose: 'opening_actor_enrichment_repair',
        value: {
          actorSlotId: POLICE_SLOT,
          repairs: [{ path: 'attributes.thinking', value: '63' }]
        }
      },
      {
        purpose: 'opening_actor_enrichment_repair',
        value: {
          actorSlotId: POLICE_SLOT,
          repairs: [{ path: 'attributes.thinking', value: '63' }]
        }
      },
      {
        purpose: 'opening_actor_enrichment_repair',
        value: {
          actorSlotId: POLICE_SLOT,
          repairs: [{ path: 'attributes.thinking', value: 63 }]
        }
      }
    ]);

    await expect(
      runOpeningV2({
        setup,
        initialState: state,
        narrator,
        repairNarrator: narrator,
        sessionRepository: repository,
        narrativeLengthLevel: 'compact'
      })
    ).rejects.toThrow('连续两次没有有效进展');
    expect(narrator.purposes).toEqual([
      'opening_cast',
      'opening_actor_enrichment',
      'opening_actor_enrichment_repair',
      'opening_actor_enrichment_repair'
    ]);
    expect((await repository.load(SESSION_ID))?.stage).toBe('cast_ready');
  });
});
