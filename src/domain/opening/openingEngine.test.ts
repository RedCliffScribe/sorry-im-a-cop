import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type {
  NarratorAttemptRecord,
  NarratorClient,
  NarratorDetailedCompletion,
  NarratorStreamOptions
} from '../narrator/NarratorClient';
import { NarratorTruncatedError } from '../narrator/NarratorErrors';
import { estimateNarrativeTokens } from '../narrator/estimateNarrativeTokens';
import { IndexedDbSaveRepository } from '../persistence/IndexedDbSaveRepository';
import type { OpeningSetup } from '../runtime/initialState';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  getOpeningNonCoreFallbacks,
  validateOpeningBlueprint
} from './openingBlueprintSchema';
import { composeOpeningInitializationPrompt } from './composeOpeningInitializationPrompt';
import { getOpeningBlueprintQualityIssues } from './openingBlueprintQualityGate';
import {
  collectOpeningDramaWritebackRefs,
  validateOpeningDramaExecutionTrace,
  validateOpeningDramaPlan
} from './openingDrama';
import { validateOpeningInitialization } from './openingInitializationSchema';
import { runOpening } from './runOpening';

const SESSION_ID = 'opening_session_test';
const ACTOR_ID = 'actor_opening_supervisor';
const SCENE_ID = 'scene_report_room';
const PLACE_ID = 'place_mong_kok_police_station';

function createSetup(): OpeningSetup {
  return {
    playerName: '陈志明',
    englishName: 'Michael Chan',
    gender: 'male',
    age: 25,
    policeNumber: '9527',
    currentIdentity: 'police',
    startTime: { year: 1984, month: 12, day: 27, hour: 8, minute: 30 },
    openingNote: '旧同学的麻烦'
  };
}

function createBlueprint() {
  return {
    openingSessionId: SESSION_ID,
    openingFacts: {
      placeId: PLACE_ID,
      sceneId: SCENE_ID,
      situationSummary: '旺角警署完成早班交接，值日警长准备交代辖区近况。',
      centralMatter: '确认今天需要优先处理的街面事务。',
      playerDecisionBoundary: '玩家自行决定先查阅交更记录还是直接向上级询问。'
    },
    playerPresentationPatch: {
      name: '陈志明',
      englishName: 'Michael Chan',
      policeNumber: '9527',
      clothing: '夏季军装制服，皮鞋擦得很亮。',
      equipment: ['警察委任证', '警棍', '点三八左轮'],
      statusSummary: '完成早班交接，精神清醒。'
    },
    initialActors: [
      {
        actorId: ACTOR_ID,
        name: '梁志强',
        englishName: 'Tony Leung',
        aliases: [],
        gender: 'male' as const,
        birthDate: '1942-06-15',
        computedAge: 42,
        visualAgeAnchor: '四十岁出头，眼角有长期夜班留下的细纹。',
        currentIdentity: 'police' as const,
        publicIdentity: '旺角警署值日警长',
        actualIdentitySummary: '皇家香港警察旺角警署当值警长。',
        roleProfiles: {
          police: {
            status: 'active' as const,
            agencyId: 'org_hk_police',
            stationOrPost: '旺角警署',
            department: '军装部',
            rank: '警长',
            assignmentSummary: '值日警长',
            postRole: 'station_duty_sergeant',
            supervisorActorIds: [] as string[],
            peerActorIds: [] as string[],
            authoritySummary: '负责当值警署日常协调。',
            accessSummary: '可接触交更记录与当值调派。',
            dutySummary: '交更、报案室和街面事务协调。',
            institutionalReputation: '经验老到。',
            disciplinePressureSummary: '重视程序和书面记录。'
          }
        },
        playerRoleRelation: 'police_supervisor' as const,
        organizationIds: ['org_hk_police'],
        positionSummary: '旺角警署值日警长',
        profileSummary: '熟悉辖区街面和报案室人情的老资格军装警长。',
        appearance: '身材结实，眼神沉稳，留着整齐短发。',
        clothing: '旧式短袖军装，肩章边缘略有磨损。',
        equipment: ['值日簿', '警棍', '口哨'],
        personality: '谨慎务实，重视程序，但不刻意刁难新人。',
        speechStyle: '粤语短句为主，交代事情直接，偶尔用警署行话。',
        motivation: '让当值警力平稳交接，避免小事演变成投诉。',
        longTermGoal: '守住辖区秩序并带出一批可靠的年轻警员。',
        values: '规矩、可靠、现场判断与同僚互相照应。',
        attributes: {
          body: 55,
          action: 51,
          perception: 68,
          thinking: 62,
          negotiation: 64,
          will: 70
        },
        relationshipSummary: '作为当值上级，刚开始观察玩家是否可靠。',
        attitudeTowardPlayer: '公事公办，但愿意给新人说明机会。',
        interactionScore: 18,
        trustTendency: '看重按程序汇报和实际办事结果。',
        entanglementSummary: '玩家当值表现会直接影响他之后分派的事务。',
        longTermMemorySummary: '记得玩家是刚调来旺角警署的年轻警员。',
        recentInteractionMemory: '刚在交更桌前核对玩家的警员编号。',
        statusSummary: '正在值日室整理早班交接事项。',
        bodyConditionSummary: '精神清醒，肩颈略有夜班后的疲惫。',
        presence: 'present' as const,
        currentPlaceId: PLACE_ID,
        currentSceneId: SCENE_ID,
        visibility: 'player_known' as const,
        importance: 72,
        keyMemories: [],
        worldpackActorData: {}
      }
    ],
    actionIntents: [
      {
        actionId: 'action_ask_sergeant',
        intent: '向值日警长询问今天最急的事务。',
        relatedActorIds: [ACTOR_ID],
        requiredFacts: ['值日警长正在交代当值事项']
      },
      {
        actionId: 'action_read_handover',
        intent: '先查看交更记录，确认昨夜遗留问题。',
        relatedActorIds: [ACTOR_ID],
        requiredFacts: ['交更记录放在值日室']
      }
    ]
  };
}

function createRemoteActorBlueprintFixture(options: {
  sessionId: string;
  presence: 'absent' | 'mentioned';
  omitEquipment: boolean;
}) {
  const fixture = structuredClone(createBlueprint()) as unknown as Omit<
    ReturnType<typeof createBlueprint>,
    'openingSessionId' | 'initialActors'
  > & {
    openingSessionId: string;
    initialActors: Array<Record<string, unknown>>;
  };
  fixture.openingSessionId = options.sessionId;
  const actor = fixture.initialActors[0];
  actor.presence = options.presence;
  delete actor.currentPlaceId;
  delete actor.currentSceneId;
  if (options.omitEquipment) {
    delete actor.equipment;
  }
  return fixture;
}

function createInitialization(options?: {
  narrativeText?: string;
  money?: number;
  actionIds?: string[];
}) {
  const narrativeText =
    options?.narrativeText ??
    '旺角警署的早班刚交接完，值日室里电话声、打字声与走廊脚步声交叠。梁志强把值日簿翻到昨夜那一页，先核对陈志明的警员编号，再把几宗尚未收尾的街面纠纷逐项圈出。他没有替陈志明选择先做哪一件，只说明哪几处最容易拖成投诉，以及哪些记录必须先看清楚。窗外天色仍带着冬晨的灰白，报案室已有市民排队，电台里不时传来分区巡逻车的回报。陈志明站在交更桌前，可以直接追问最急的一宗，也可以先翻阅昨夜记录，先把人名、地点和交接责任理顺。'.repeat(
      4
    );
  const actionIds = options?.actionIds ?? ['action_ask_sergeant', 'action_read_handover'];
  return {
    openingSessionId: SESSION_ID,
    narrativeText,
    suggestedActions: [
      { actionId: actionIds[0], text: '向梁志强询问今天最急的事务。' },
      { actionId: actionIds[1], text: '先查看昨夜交更记录。' }
    ],
    playerStatePatch: {
      economy: {
        cashOnHand: 600,
        bankBalance: options?.money ?? 1_200,
        monthlyPressure: 35,
        financeSummary: '有一笔个人存款，日常开支仍需留意。'
      },
      homeBase: {
        placeId: 'place_player_home_mong_kok',
        placeName: '旺角唐楼住所',
        regionId: 'region_mong_kok',
        housingType: '唐楼分租单位',
        summary: '位于旺角旧区的分租单位，步行可到警署。',
        householdSummary: '与一名普通租客分住，彼此作息独立。'
      }
    },
    memories: [
      {
        text: '陈志明在旺角警署完成早班交接，梁志强交代了昨夜遗留事务。',
        kind: 'turn' as const,
        relatedActorIds: ['player', ACTOR_ID],
        relatedPlaceIds: [PLACE_ID],
        relatedOrganizationIds: ['org_hk_police'],
        importance: 75,
        visibility: 'player_known' as const,
        certainty: 'fact' as const
      }
    ]
  };
}

function attempt(
  purpose: NarratorAttemptRecord['purpose'],
  rawText: string,
  finishReason: NarratorAttemptRecord['finishReason'] = 'stop',
  requestedMaxTokens = 32_768
): NarratorAttemptRecord {
  return {
    attemptId: `${purpose}_${Math.random().toString(36).slice(2)}`,
    purpose,
    stream: true,
    requestedMaxTokens,
    finishReason,
    rawText,
    parseStatus: finishReason === 'length' ? 'truncated' : 'success',
    startedAt: '2026-07-23T00:00:00.000Z',
    finishedAt: '2026-07-23T00:00:01.000Z',
    usage: { promptTokens: 1200, completionTokens: 900 }
  };
}

class TwoPhaseNarrator implements NarratorClient {
  readonly configuredMaxTokens = 8192;
  readonly prompts: string[] = [];
  readonly options: NarratorStreamOptions[] = [];
  readonly responses: unknown[];

  constructor(responses: unknown[] = [createBlueprint(), createInitialization()]) {
    this.responses = [...responses];
  }

  async complete(): Promise<unknown> {
    throw new Error('runOpening should prefer completeDetailed');
  }

  async completeDetailed(
    prompt: string,
    options: NarratorStreamOptions = {}
  ): Promise<NarratorDetailedCompletion> {
    this.prompts.push(prompt);
    this.options.push(options);
    const value = this.responses.shift();
    if (!value) throw new Error('No prepared response');
    const rawText = JSON.stringify(value);
    options.onRawDelta?.(rawText);
    options.onRawText?.(rawText);
    if (
      options.requestPurpose === 'opening_initialization' ||
      options.requestPurpose === 'opening_compact_retry'
    ) {
      options.onTextDelta?.(
        typeof value === 'object' && value && 'narrativeText' in value
          ? String((value as { narrativeText: string }).narrativeText)
          : ''
      );
    }
    return {
      value,
      attempt: attempt(
        options.requestPurpose ?? 'auxiliary',
        rawText,
        'stop',
        options.maxTokensOverride
      )
    };
  }
}

class TruncatedInitializationNarrator extends TwoPhaseNarrator {
  private initializationCalls = 0;

  override async completeDetailed(
    prompt: string,
    options: NarratorStreamOptions = {}
  ): Promise<NarratorDetailedCompletion> {
    if (options.requestPurpose === 'opening_initialization') {
      this.prompts.push(prompt);
      this.options.push(options);
      this.initializationCalls += 1;
      const rawText = '{"openingSessionId":"opening_session_test","narrativeText":"被截断';
      const record = attempt(
        'opening_initialization',
        rawText,
        'length',
        options.maxTokensOverride
      );
      throw new NarratorTruncatedError(record);
    }
    return super.completeDetailed(prompt, options);
  }
}

describe('two-phase opening engine', () => {
  it.each([
    'personality',
    'speechStyle',
    'motivation',
    'longTermGoal',
    'values',
    'relationshipSummary',
    'attitudeTowardPlayer',
    'trustTendency',
    'entanglementSummary',
    'longTermMemorySummary',
    'recentInteractionMemory',
    'statusSummary',
    'presence',
    'visibility',
    'importance',
    'attributes'
  ])('rejects a blueprint whose core actor is missing %s', (field) => {
    const raw = structuredClone(createBlueprint()) as {
      initialActors: Array<Record<string, unknown>>;
    };
    delete raw.initialActors[0][field];

    expect(() => validateOpeningBlueprint(raw)).toThrow();
  });

  it('allows only the documented non-core fallbacks and records every applied field', () => {
      const raw = structuredClone(createBlueprint()) as {
        initialActors: Array<Record<string, unknown>>;
      };
      delete raw.initialActors[0].englishName;
      delete raw.initialActors[0].aliases;
      delete raw.initialActors[0].keyMemories;
      delete raw.initialActors[0].worldpackActorData;
      delete raw.initialActors[0].bodyConditionSummary;
      delete raw.initialActors[0].equipment;

    const blueprint = validateOpeningBlueprint(raw);

    expect(blueprint.initialActors[0]).toMatchObject({
      aliases: [],
      keyMemories: [],
      worldpackActorData: {},
      bodyConditionSummary: blueprint.initialActors[0].statusSummary
      });
      expect(getOpeningNonCoreFallbacks(raw, blueprint)).toEqual([
        { actorId: ACTOR_ID, field: 'englishName' },
        { actorId: ACTOR_ID, field: 'aliases' },
        { actorId: ACTOR_ID, field: 'callName' },
        { actorId: ACTOR_ID, field: 'keyMemories' },
        { actorId: ACTOR_ID, field: 'worldpackActorData' },
        { actorId: ACTOR_ID, field: 'bodyConditionSummary' },
        { actorId: ACTOR_ID, field: 'equipment' }
      ]);
    });

  it('enforces locations only for present or nearby actors', () => {
    const presentWithoutPlace = structuredClone(createBlueprint()) as {
      initialActors: Array<Record<string, unknown>>;
    };
    delete presentWithoutPlace.initialActors[0].currentPlaceId;
    expect(() => validateOpeningBlueprint(presentWithoutPlace)).toThrow(
      'present/nearby 人物必须填写 currentPlaceId'
    );

    const nearbyWithoutScene = structuredClone(createBlueprint()) as {
      initialActors: Array<Record<string, unknown>>;
    };
    nearbyWithoutScene.initialActors[0].presence = 'nearby';
    delete nearbyWithoutScene.initialActors[0].currentSceneId;
    expect(() => validateOpeningBlueprint(nearbyWithoutScene)).toThrow(
      'present/nearby 人物必须填写 currentSceneId'
    );
  });

  it.each(['absent', 'mentioned'] as const)(
    'accepts a %s actor without projected location and defaults missing equipment',
    (presence) => {
      const raw = createRemoteActorBlueprintFixture({
        sessionId: `opening_session_${presence}`,
        presence,
        omitEquipment: true
      });

      const blueprint = validateOpeningBlueprint(raw);
      const actor = blueprint.initialActors[0];

      expect(actor.presence).toBe(presence);
      expect(actor.currentPlaceId).toBeUndefined();
      expect(actor.currentSceneId).toBeUndefined();
      expect(actor.equipment).toEqual([]);
      expect(getOpeningBlueprintQualityIssues(blueprint, createInitialRuntimeState(createSetup()))).not.toContain(
        `${actor.name} 在场但缺少有效地点或场景`
      );
    }
  );

  it('preserves a known remote location and rejects unsafe equipment overflow', () => {
    const remote = createRemoteActorBlueprintFixture({
      sessionId: 'opening_session_known_remote',
      presence: 'absent',
      omitEquipment: false
    });
    remote.initialActors[0].currentPlaceId = 'place_guangzhou_family_home';
    const parsed = validateOpeningBlueprint(remote);
    expect(parsed.initialActors[0].currentPlaceId).toBe('place_guangzhou_family_home');

    const overflow = structuredClone(remote);
    overflow.initialActors[0].equipment = ['一', '二', '三', '四'];
    expect(() => validateOpeningBlueprint(overflow)).toThrow();
  });

    it('normalizes only documented nullable non-core names and an inapplicable player police number', () => {
      const raw = structuredClone(createBlueprint()) as {
        playerPresentationPatch: Record<string, unknown>;
        initialActors: Array<Record<string, unknown>>;
      };
      raw.playerPresentationPatch.policeNumber = null;
      raw.initialActors[0].englishName = null;
      raw.initialActors[0].callName = null;

      const blueprint = validateOpeningBlueprint(raw);

      expect(blueprint.playerPresentationPatch.policeNumber).toBeUndefined();
      expect(blueprint.initialActors[0].englishName).toBeUndefined();
      expect(blueprint.initialActors[0].callName).toBeUndefined();
      expect(getOpeningNonCoreFallbacks(raw, blueprint)).toEqual(
        expect.arrayContaining([
          { actorId: ACTOR_ID, field: 'englishName' },
          { actorId: ACTOR_ID, field: 'callName' }
        ])
      );
    });

  it('rejects placeholder actor prose even when the strict schema is structurally valid', () => {
    const raw = createBlueprint();
    raw.initialActors[0].motivation = '随剧情明确';
    const blueprint = validateOpeningBlueprint(raw);
    const state = createInitialRuntimeState(createSetup());

    expect(getOpeningBlueprintQualityIssues(blueprint, state)).toContain(
      '梁志强.motivation 使用了占位内容'
    );
  });

  it('rejects dangling actor references inside role profiles', () => {
    const raw = createBlueprint();
    raw.initialActors[0].roleProfiles.police.supervisorActorIds = ['actor_missing'];
    const blueprint = validateOpeningBlueprint(raw);
    const state = createInitialRuntimeState(createSetup());

    expect(getOpeningBlueprintQualityIssues(blueprint, state)).toContain(
      '梁志强.roleProfiles.police.supervisorActorIds 引用了未知人物 actor_missing'
    );
  });

  it('accepts role-profile references to the stable player actor id', () => {
    const raw = createBlueprint();
    raw.initialActors[0].roleProfiles.police.peerActorIds = ['player'];
    const blueprint = validateOpeningBlueprint(raw);
    const state = createInitialRuntimeState(createSetup());

    expect(getOpeningBlueprintQualityIssues(blueprint, state)).not.toContain(
      '梁志强.roleProfiles.police.peerActorIds 引用了未知人物 player'
    );
  });

  it('strictly rejects actor data returned by the second phase', () => {
    expect(() =>
      validateOpeningInitialization({
        ...createInitialization(),
        initialActors: createBlueprint().initialActors
      })
    ).toThrow();
  });

  it('rejects an initialization that omits the required opening economy and home', () => {
    const invalidInitialization = createInitialization() as Record<string, unknown>;
    delete invalidInitialization.playerStatePatch;

    expect(() => validateOpeningInitialization(invalidInitialization)).toThrow(
      'Invalid input: expected object'
    );
  });

  it('rejects an incomplete opening economy', () => {
    const invalidInitialization = createInitialization();
    delete (invalidInitialization.playerStatePatch.economy as { bankBalance?: number })
      .bankBalance;

    expect(() => validateOpeningInitialization(invalidInitialization)).toThrow(
      '开局必须生成完整经济状态'
    );
  });

  it('rejects a placeholder opening home', () => {
    const invalidInitialization = createInitialization();
    invalidInitialization.playerStatePatch.homeBase.placeName = '开局待生成';

    expect(() => validateOpeningInitialization(invalidInitialization)).toThrow(
      '开局必须生成具体住所'
    );
  });

  it('locks the actor blueprint before generating initialization and applies once', async () => {
    const narrator = new TwoPhaseNarrator();
    const stages: string[] = [];
    const attempts: NarratorAttemptRecord[] = [];

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'compact',
      onStageChange: (stage) => stages.push(stage),
      onAttempt: (record) => attempts.push(record)
    });

    expect(narrator.options).toHaveLength(2);
    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_initialization'
    ]);
    expect(narrator.options.every((option) => option.maxTokensOverride === 32_768)).toBe(true);
    expect(narrator.prompts[1]).toContain(SESSION_ID);
    expect(narrator.prompts[1]).toContain(ACTOR_ID);
    expect(narrator.prompts[1]).toContain('旧同学的麻烦');
    expect(narrator.prompts[1]).toContain('"cashOnHand":0');
    expect(narrator.prompts[1]).toContain('"bankBalance":0');
    expect(narrator.prompts[1]).toContain(
      '{"cashOnHand":整数,"bankBalance":整数,"monthlyPressure":0到100整数'
    );
    expect(narrator.prompts[1]).toContain(
      'playerStatePatch 每次都必须存在，并且必须同时包含完整 economy 与完整 homeBase'
    );
    expect(narrator.prompts[1]).toContain('"placeId": "place_player_home_稳定ID"');
    expect(narrator.prompts[1]).toContain('"originBackgroundId"');
    expect(narrator.prompts[1]).toContain('允许范围为 0 至 99999999999');
    expect(narrator.prompts[1]).toContain('"id": "matter_opening_稳定ID"');
    expect(narrator.prompts[1]).toContain('"matterKind": "police_work"');
      expect(narrator.prompts[1]).toContain(
        'priority 必须是 0 至 100 的整数，不能写“高/中/低”'
      );
      expect(narrator.prompts[1]).toContain(
        '先在 narrativeText 中完整写出 750 个左右'
      );
      expect(narrator.prompts[1]).toContain('硬性下限是 600');
      expect(narrator.prompts[1]).toContain(
        'JSON、行动选项、记忆摘要和其他结构化字段不计入正文篇幅'
      );
      expect(state.storyLog).toHaveLength(1);
    expect(state.storyLog[0].suggestedActions).toEqual([
      '向梁志强询问今天最急的事务。',
      '先查看昨夜交更记录。'
    ]);
    expect(state.actors[ACTOR_ID]).toMatchObject({
      name: '梁志强',
      personality: expect.stringContaining('谨慎务实'),
      longTermMemorySummary: expect.stringContaining('刚调来旺角警署')
    });
    expect(stages).toContain('validating_opening_blueprint');
    expect(stages).toContain('validating_opening_data');
    expect(stages.at(-1)).toBe('applying_opening');
    expect(attempts.map((record) => record.purpose)).toEqual([
      'opening_blueprint',
      'opening_initialization'
    ]);
  });

  it('accepts a mildly short immersive opening without a second initialization request', async () => {
    const initialization = createInitialization({
      narrativeText: '开'.repeat(1_472),
      money: 9_000
    });
    const narrator = new TwoPhaseNarrator([createBlueprint(), initialization]);

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'immersive'
    });

    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_initialization'
    ]);
    expect(state.storyLog[0].text).toBe(initialization.narrativeText);
    expect(state.storyLog[0].writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'narrative_length_below_minimum' })
      ])
    );
    expect(state.player.economy).toMatchObject({
      cashOnHand: 600,
      bankBalance: 9_000
    });
    expect(state.player.homeBase).toMatchObject({
      placeId: 'place_player_home_mong_kok',
      placeName: '旺角唐楼住所'
    });
    expect(Object.values(state.memories).filter((memory) => memory.kind === 'turn')).toHaveLength(1);
  });

  it('accepts a mildly short structurally valid recovery after the first initialization fails schema validation', async () => {
    const invalidInitialization = createInitialization() as Record<string, unknown>;
    delete invalidInitialization.playerStatePatch;
    const recoveredInitialization = createInitialization({
      narrativeText: '复'.repeat(1_472),
      money: 8_800
    });
    const narrator = new TwoPhaseNarrator([
      createBlueprint(),
      invalidInitialization,
      recoveredInitialization
    ]);
    const attempts: NarratorAttemptRecord[] = [];

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'immersive',
      onAttempt: (record) => attempts.push(record)
    });

    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_initialization',
      'opening_initialization'
    ]);
    expect(attempts.map((record) => record.parseStatus)).toEqual([
      'success',
      'schema_failed',
      'success'
    ]);
    expect(state.storyLog[0].text).toBe(recoveredInitialization.narrativeText);
    expect(state.storyLog[0].writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'narrative_length_below_minimum' })
      ])
    );
    expect(state.player.economy.bankBalance).toBe(8_800);
    expect(state.player.homeBase.placeId).toBe('place_player_home_mong_kok');
  });

  it('regenerates a severely short first opening once and clears stale action previews', async () => {
    const shortInitialization = createInitialization({
      narrativeText: '短'.repeat(1_200)
    });
    shortInitialization.suggestedActions[0].text = '首稿行动，不得残留。';
    const completeInitialization = createInitialization({
      narrativeText: '足'.repeat(1_800),
      money: 7_700
    });
    completeInitialization.suggestedActions[0].text = '最终接受的行动。';
    const narrator = new TwoPhaseNarrator([
      createBlueprint(),
      shortInitialization,
      completeInitialization
    ]);
    const resets: number[] = [];
    const previews: string[][] = [];
    const stages: string[] = [];
    const attempts: NarratorAttemptRecord[] = [];

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'immersive',
      onNarrativeReset: () => resets.push(1),
      onActionPreview: (actions) => previews.push(actions),
      onStageChange: (stage) => stages.push(stage),
      onAttempt: (record) => attempts.push(record)
    });

    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_initialization',
      'opening_initialization'
    ]);
    expect(narrator.prompts.at(-1)).toContain('正文篇幅合同失败后的完整重生成');
    expect(stages).toContain('regenerating_opening_narrative');
    expect(resets).toHaveLength(2);
    expect(attempts.map((record) => record.parseStatus)).toEqual([
      'success',
      'success',
      'success'
    ]);
    let retryClearIndex = -1;
    previews.forEach((actions, index) => {
      if (actions.length === 0) retryClearIndex = index;
    });
    expect(previews.slice(retryClearIndex + 1)).not.toContainEqual(
      expect.arrayContaining(['首稿行动，不得残留。'])
    );
    expect(previews.slice(retryClearIndex + 1)).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['最终接受的行动。'])
      ])
    );
    expect(state.storyLog[0].suggestedActions).toContain('最终接受的行动。');
    expect(state.storyLog[0].suggestedActions).not.toContain('首稿行动，不得残留。');
    expect(state.storyLog[0].rawNarratorResponse).toBe(
      JSON.stringify(completeInitialization)
    );
    expect(state.storyLog[0].turnMetrics).toMatchObject({
      inputTokens: expect.any(Number),
      outputTokens:
        estimateNarrativeTokens(JSON.stringify(createBlueprint())) +
        estimateNarrativeTokens(JSON.stringify(shortInitialization)) +
        estimateNarrativeTokens(JSON.stringify(completeInitialization)),
      responseMs: expect.any(Number)
    });
    expect(state.storyLog[0].writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'narrative_length_regenerated' })
      ])
    );
    expect(state.storyLog[0].writebackDiagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'narrative_length_below_minimum' })
      ])
    );
  });

  it('accepts one still-short regeneration and records both length diagnostics', async () => {
    const narrator = new TwoPhaseNarrator([
      createBlueprint(),
      createInitialization({ narrativeText: '短'.repeat(1_200) }),
      createInitialization({ narrativeText: '复'.repeat(1_472), money: 6_600 })
    ]);

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'immersive'
    });

    expect(narrator.options).toHaveLength(3);
    expect(state.storyLog[0].text).toBe('复'.repeat(1_472));
    expect(state.storyLog[0].writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'narrative_length_regenerated' }),
        expect.objectContaining({ code: 'narrative_length_below_minimum' })
      ])
    );
    expect(state.player.economy.bankBalance).toBe(6_600);
  });

  it('does not start the second phase when a scoped blueprint field repair is still invalid', async () => {
    const invalid = {
      ...createBlueprint(),
      initialActors: [
        {
          ...createBlueprint().initialActors[0],
          personality: '待生成'
        }
      ]
    };
    const narrator = new TwoPhaseNarrator([
      invalid,
      {
        repairs: [
          {
            path: 'initialActors.0.personality',
            value: '待生成'
          }
        ]
      }
    ]);

    await expect(
      runOpening({
        setup: createSetup(),
        narrator,
        narrativeLengthLevel: 'compact'
      })
    ).rejects.toThrow('开局人物蓝图在第 1/1 次恢复后仍失败');

    expect(narrator.options).toHaveLength(2);
    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_blueprint_field_repair'
    ]);
    expect(narrator.prompts[1]).toContain('不得重新生成整份蓝图');
    expect(narrator.prompts[1]).toContain('initialActors.0.personality');
    expect(narrator.prompts[1]).not.toContain('请重新返回完整 OpeningBlueprint');
  });

  it('repairs only a missing core blueprint field and preserves every other approved field', async () => {
    const invalid = structuredClone(createBlueprint()) as {
      initialActors: Array<Record<string, unknown>>;
    };
    delete invalid.initialActors[0].values;
    const narrator = new TwoPhaseNarrator([
      invalid,
      {
        repairs: [
          {
            path: 'initialActors.0.values',
            value: '规矩、可靠、现场判断与同僚互相照应。'
          }
        ]
      },
      createInitialization()
    ]);
    const attempts: NarratorAttemptRecord[] = [];

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'compact',
      onAttempt: (record) => attempts.push(record)
    });

    expect(narrator.prompts[1]).toContain('initialActors.0.values：必填字段缺失');
    expect(narrator.prompts[1]).toContain('唯一允许修改的路径');
    expect(narrator.prompts[1]).not.toContain('第一阶段完整重生成');
    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_blueprint_field_repair',
      'opening_initialization'
    ]);
    expect(attempts[0]).toMatchObject({
      parseStatus: 'schema_failed',
      errorMessage: expect.stringContaining('initialActors.0.values：必填字段缺失')
    });
    expect(state.actors[ACTOR_ID]).toMatchObject({
      values: '规矩、可靠、现场判断与同僚互相照应。',
      personality: createBlueprint().initialActors[0].personality,
      currentPlaceId: PLACE_ID,
      currentSceneId: SCENE_ID
    });
  });

  it('normalizes deterministic local format defects without any blueprint repair request', async () => {
    const formatOnly = structuredClone(createBlueprint()) as {
      openingFacts: Record<string, unknown>;
      playerPresentationPatch: Record<string, unknown>;
      initialActors: Array<Record<string, unknown>>;
      actionIntents: Array<Record<string, unknown>>;
    };
    const actor = formatOnly.initialActors[0];
    actor.computedAge = '42';
    actor.interactionScore = '18';
    actor.importance = '72';
    actor.organizationIds = 'org_hk_police';
    actor.equipment = null;
    actor.aliases = '强哥';
    actor.currentIdentity = ' POLICE ';
    actor.presence = ' PRESENT ';
    actor.visibility = ' PLAYER_KNOWN ';
    delete actor.currentPlaceId;
    delete actor.currentSceneId;
    (actor.attributes as Record<string, unknown>).thinking = '62';
    actor.unrequestedExplanation = '模型多写的说明字段';
    formatOnly.playerPresentationPatch.equipment = '警察委任证';
    formatOnly.actionIntents[0].requiredFacts = '值日警长正在交代当值事项';

    const narrator = new TwoPhaseNarrator([formatOnly, createInitialization()]);
    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_initialization'
    ]);
    expect(state.actors[ACTOR_ID]).toMatchObject({
      computedAge: 42,
      interactionScore: 18,
      importance: 72,
      organizationIds: ['org_hk_police'],
      equipment: [],
      currentPlaceId: PLACE_ID,
      currentSceneId: SCENE_ID
    });
    expect(state.actors[ACTOR_ID].aliases).toEqual(
      expect.arrayContaining(['强哥'])
    );
    expect(state.actors[ACTOR_ID].attributes.thinking).toBe(62);
  });

  it('repairs a remote actor core field without projecting that actor into the opening scene', async () => {
    const remote = createRemoteActorBlueprintFixture({
      sessionId: SESSION_ID,
      presence: 'mentioned',
      omitEquipment: true
    });
    delete remote.initialActors[0].motivation;
    const narrator = new TwoPhaseNarrator([
      remote,
      {
        repairs: [
          {
            path: 'initialActors.0.motivation',
            value: '维持广东亲族的生计，同时避免把家事带到香港警队。'
          }
        ]
      },
      createInitialization()
    ]);

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_blueprint_field_repair',
      'opening_initialization'
    ]);
    expect(state.actors[ACTOR_ID]).toMatchObject({
      presence: 'mentioned',
      motivation: '维持广东亲族的生计，同时避免把家事带到香港警队。',
      equipment: []
    });
    expect(state.actors[ACTOR_ID].currentPlaceId).toBeUndefined();
    expect(state.actors[ACTOR_ID].currentSceneId).toBeUndefined();
    expect(state.actors[ACTOR_ID].lastSeenAt).toBeUndefined();
    expect(state.scenes[state.location.currentSceneId!]?.presentActorIds).not.toContain(
      ACTOR_ID
    );

    const repository = new IndexedDbSaveRepository(
      `cop-v2-opening-repair-${Date.now()}-${Math.random()}`
    );
    await repository.save({
      saveId: 'save_opening_repair',
      saveName: '开局字段修复读取验收',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
      playerName: state.player.name,
      worldpackId: state.world.worldpackId,
      gameDateLabel: '1984-12-27 08:30',
      turnCounter: state.turnCounter,
      runtimeState: state
    });
    const loaded = await repository.load('save_opening_repair');
    expect(loaded?.runtimeState.actors[ACTOR_ID]).toMatchObject({
      presence: 'mentioned',
      motivation: '维持广东亲族的生计，同时避免把家事带到香港警队。',
      equipment: []
    });
    expect(loaded?.runtimeState.actors[ACTOR_ID].currentPlaceId).toBeUndefined();
    expect(
      loaded?.runtimeState.scenes[loaded.runtimeState.location.currentSceneId!]
        ?.presentActorIds
    ).not.toContain(ACTOR_ID);
  });

  it('rejects an out-of-scope blueprint repair atomically instead of accepting collateral edits', async () => {
    const invalid = structuredClone(createBlueprint()) as {
      initialActors: Array<Record<string, unknown>>;
    };
    delete invalid.initialActors[0].values;
    const initialState = createInitialRuntimeState(createSetup());
    const initialSnapshot = structuredClone(initialState);
    const narrator = new TwoPhaseNarrator([
      invalid,
      {
        repairs: [
          {
            path: 'initialActors.0.name',
            value: '被越权修改的人名'
          }
        ]
      }
    ]);

    await expect(
      runOpening({
        initialState,
        narrator,
        narrativeLengthLevel: 'compact'
      })
    ).rejects.toThrow('蓝图字段修复试图修改未授权路径');

    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_blueprint_field_repair'
    ]);
    expect(initialState).toEqual(initialSnapshot);
  });

  it.each([
    {
      name: 'missing equipment and remote locations',
      blueprint: createRemoteActorBlueprintFixture({
        sessionId: SESSION_ID,
        presence: 'absent',
        omitEquipment: true
      })
    },
    {
      name: 'explicit empty equipment and mentioned location omission',
      blueprint: createRemoteActorBlueprintFixture({
        sessionId: SESSION_ID,
        presence: 'mentioned',
        omitEquipment: false
      })
    }
  ])('accepts the minimized player blueprint shape with $name without a blueprint retry', async ({ blueprint }) => {
    const narrator = new TwoPhaseNarrator([blueprint, createInitialization()]);

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_initialization'
    ]);
    expect(state.actors[ACTOR_ID].equipment).toEqual(blueprint.initialActors[0].equipment ?? []);
    expect(state.actors[ACTOR_ID].currentPlaceId).toBeUndefined();
    expect(state.actors[ACTOR_ID].currentSceneId).toBeUndefined();
    expect(state.actors[ACTOR_ID].lastSeenAt).toBeUndefined();
    expect(state.actors[ACTOR_ID].lastSeenPlaceId).toBeUndefined();
    expect(state.scenes[state.location.currentSceneId!]?.presentActorIds).not.toContain(ACTOR_ID);
  });

  it('retries only initialization after length truncation and preserves the approved blueprint', async () => {
    const narrator = new TruncatedInitializationNarrator([
      createBlueprint(),
      createInitialization()
    ]);
    const resets: number[] = [];
    const previews: string[][] = [];
    const attempts: NarratorAttemptRecord[] = [];

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'compact',
      onNarrativeReset: () => resets.push(1),
      onActionPreview: (actions) => previews.push(actions),
      onAttempt: (record) => attempts.push(record)
    });

    expect(
      narrator.options.filter((option) => option.requestPurpose === 'opening_blueprint')
    ).toHaveLength(1);
    expect(narrator.options.at(-1)?.requestPurpose).toBe('opening_compact_retry');
    expect(narrator.prompts.at(-1)).toContain('finish_reason=length');
    expect(state.actors[ACTOR_ID].personality).toContain('谨慎务实');
    expect(resets).toHaveLength(2);
    expect(previews).toContainEqual([]);
    expect(attempts.map((record) => record.finishReason)).toEqual(['stop', 'length', 'stop']);
  });

  it('retries an initialization that omits core state and applies the complete retry', async () => {
    const incompleteInitialization = createInitialization() as Record<string, unknown>;
    delete incompleteInitialization.playerStatePatch;
    const narrator = new TwoPhaseNarrator([
      createBlueprint(),
      incompleteInitialization,
      createInitialization({ money: 9_000 })
    ]);

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'compact'
    });

    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_initialization',
      'opening_initialization'
    ]);
    expect(narrator.prompts.at(-1)).toContain(
      '禁止为了通过重试而降级成只有正文、行动和记忆的最小对象'
    );
    expect(state.player.economy).toMatchObject({
      cashOnHand: 600,
      bankBalance: 9_000,
      monthlyPressure: 35
    });
    expect(state.player.homeBase).toMatchObject({
      placeId: 'place_player_home_mong_kok',
      placeName: '旺角唐楼住所'
    });
  });

  it('rejects second-phase actor references that are not in state or the locked blueprint', async () => {
    const invalidInitialization = createInitialization();
    invalidInitialization.memories[0].relatedActorIds.push('actor_unknown');
    const narrator = new TwoPhaseNarrator([
      createBlueprint(),
      invalidInitialization,
      invalidInitialization
    ]);
    const initialState = createInitialRuntimeState(createSetup());
    const stateBeforeOpening = structuredClone(initialState);

    await expect(
      runOpening({
        initialState,
        narrator,
        narrativeLengthLevel: 'compact'
      })
    ).rejects.toThrow('开局正文与运行状态在第 1/1 次恢复后仍失败');

    expect(narrator.options.map((option) => option.requestPurpose)).toEqual([
      'opening_blueprint',
      'opening_initialization',
      'opening_initialization'
    ]);
    expect(initialState).toEqual(stateBeforeOpening);
    expect(initialState.turnCounter).toBe(0);
    expect(initialState.storyLog).toEqual(stateBeforeOpening.storyLog);
    expect(initialState.player.economy).toEqual(stateBeforeOpening.player.economy);
    expect(initialState.player.homeBase).toEqual(stateBeforeOpening.player.homeBase);
  });

  it('keeps a fifty-billion opening balance exact without affecting the local police salary source', async () => {
    const narrator = new TwoPhaseNarrator([
      createBlueprint(),
      createInitialization({ money: 50_000_000_000 })
    ]);

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'compact'
    });

    expect(state.player.economy.bankBalance).toBe(50_000_000_000);
    expect(state.finance.bankBalance).toBe(50_000_000_000);
    expect(
      Object.values(state.finance.cashflows).find((cashflow) => cashflow.title === '警队月薪')
    ).toMatchObject({
      source: 'opening',
      status: 'active'
    });
  });

  it('puts the current identity relation contract before the blueprint JSON schema', async () => {
    const narrator = new TwoPhaseNarrator();
    await runOpening({
      setup: createSetup(),
      narrator,
      narrativeLengthLevel: 'compact'
    });

    const prompt = narrator.prompts[0];
    expect(prompt).toContain('当前玩家稳定 actorId：player');
    expect(prompt).toContain('当前玩家公开身份：police');
    expect(prompt).toContain(
      '必须至少生成一名 playerRoleRelation="police_supervisor" 或 "police_peer"'
    );
    expect(prompt).toContain('"playerRoleRelation": "police_peer"');
    expect(prompt).toContain(
      '不承担这六类合同的其他人物必须省略整个 playerRoleRelation 字段'
    );
    expect(prompt).toContain('绝对不要输出 null');
    expect(prompt).toContain(
      '非警察玩家必须省略 playerPresentationPatch.policeNumber'
    );
    expect(prompt.indexOf('本次身份合同')).toBeLessThan(
      prompt.indexOf('输出结构必须严格为')
    );
  });

  it('requires a civilian livelihood matter to reference the locked work-relation actor', () => {
    const blueprint = validateOpeningBlueprint(createBlueprint());
    blueprint.initialActors[0].playerRoleRelation = 'civilian_work_relation';

    const prompt = composeOpeningInitializationPrompt(blueprint, 'compact', {
      playerActorId: 'player',
      currentIdentity: 'civilian',
      initialEconomy: {
        cashOnHand: 8_000,
        bankBalance: 50_000_000_000,
        monthlyPressure: 12,
        financeSummary: '个人存款充足。'
      },
      originBackground: {
        originBackgroundId: 'old_school_ties',
        name: '旧校人脉',
        definition: '在本区读书成长。',
        backgroundSummary: '熟悉本区街坊与旧同学。'
      },
      initialActorIds: ['player'],
      initialOrganizationIds: ['org_opening_employer']
    });

    expect(prompt).toContain('"source": "opening_livelihood"');
    expect(prompt).toContain('"matterKind": "livelihood"');
    expect(prompt).toContain(`"relatedActorIds": ["${ACTOR_ID}"]`);
    expect(prompt).toContain(
      `有正式职业关系时优先关联职业人物，否则可关联第一阶段稳定社会关系人物：["${ACTOR_ID}"]`
    );
  });

  it('accepts a registered dramatic opening plan and a trace backed by a real opening writeback', () => {
    const blueprint = validateOpeningBlueprint(createBlueprint());
    const initialization = validateOpeningInitialization(createInitialization());
    const sourceRef = {
      providerId: 'opening-registry',
      sourceType: 'dramatic_opening_definition',
      sourceId: 'on_duty_scene'
    };
    const planResult = validateOpeningDramaPlan({
      openingId: 'on_duty_scene',
      rawPlan: {
        planId: 'drama_plan_opening_on_duty_scene',
        planningScope: 'opening',
        mode: 'surface',
        primarySource: sourceRef,
        supportSources: [],
        sceneFunction: 'choice',
        intensity: 'medium',
        playerMayIgnore: true,
        maxNewActors: 1,
        reasonSummary: '以当值现场建立第一幕，但不替玩家处理完毕。'
      }
    });

    expect(planResult.diagnostics).toEqual([]);
    expect(collectOpeningDramaWritebackRefs(blueprint, initialization)).toContainEqual({
      kind: 'actor',
      id: ACTOR_ID
    });

    const traceResult = validateOpeningDramaExecutionTrace({
      rawTrace: {
        planId: 'drama_plan_opening_on_duty_scene',
        status: 'used_persistently',
        usedSourceRefs: [sourceRef],
        resultingWritebackRefs: [{ kind: 'actor', id: ACTOR_ID }]
      },
      plan: planResult.plan,
      blueprint,
      initialization
    });

    expect(traceResult.diagnostics).toEqual([]);
    expect(traceResult.trace?.status).toBe('used_persistently');
  });

  it('allows exactly the one player-authorized custom support source in an opening plan', () => {
    const sourceRef = {
      providerId: 'opening-registry',
      sourceType: 'dramatic_opening_definition',
      sourceId: 'on_duty_scene'
    };
    const customSupportRef = {
      providerId: 'custom-event-group',
      sourceType: 'custom_event_group_instance',
      sourceId: 'event-instance:binding:event_group:event-seal:1:checksum'
    };
    const accepted = validateOpeningDramaPlan({
      openingId: 'on_duty_scene',
      allowedSupportSourceRef: customSupportRef,
      rawPlan: {
        planId: 'drama_plan_opening_on_duty_scene',
        planningScope: 'opening',
        mode: 'surface',
        primarySource: sourceRef,
        supportSources: [customSupportRef],
        sceneFunction: 'choice',
        intensity: 'medium',
        playerMayIgnore: true,
        maxNewActors: 4,
        reasonSummary: '在当前开局结构下提供一个可拒绝的自定义事件入口。'
      }
    });
    expect(accepted.diagnostics).toEqual([]);

    const unauthorized = validateOpeningDramaPlan({
      openingId: 'on_duty_scene',
      allowedSupportSourceRef: customSupportRef,
      rawPlan: {
        ...accepted.plan,
        supportSources: [
          {
            providerId: 'storypack',
            sourceType: 'drama_motif_card',
            sourceId: 'invented-support'
          }
        ]
      }
    });
    expect(unauthorized.plan).toBeUndefined();
    expect(unauthorized.diagnostics[0]?.message).toContain(
      '不是玩家选择并通过适配'
    );
  });

  it('ignores invalid opening drama metadata without invalidating the legal opening payload', () => {
    const blueprint = validateOpeningBlueprint(createBlueprint());
    const initialization = validateOpeningInitialization(createInitialization());
    const planResult = validateOpeningDramaPlan({
      openingId: 'on_duty_scene',
      rawPlan: {
        planId: 'wrong_plan',
        planningScope: 'opening',
        mode: 'surface',
        primarySource: {
          providerId: 'invented',
          sourceType: 'dramatic_opening_definition',
          sourceId: 'missing'
        },
        supportSources: [],
        sceneFunction: 'choice',
        intensity: 'medium',
        playerMayIgnore: true,
        maxNewActors: 1,
        reasonSummary: '错误引用。'
      }
    });

    expect(planResult.plan).toBeUndefined();
    expect(planResult.diagnostics[0]?.code).toBe('plan_source_missing');

    const traceResult = validateOpeningDramaExecutionTrace({
      rawTrace: {
        planId: 'wrong_plan',
        status: 'used_persistently',
        usedSourceRefs: [],
        resultingWritebackRefs: [{ kind: 'actor', id: 'actor_missing' }]
      },
      plan: planResult.plan,
      blueprint,
      initialization
    });

    expect(traceResult.trace).toBeUndefined();
    expect(traceResult.diagnostics[0]?.code).toBe('execution_trace_plan_mismatch');
    expect(initialization.narrativeText.length).toBeGreaterThan(0);
    expect(blueprint.initialActors).toHaveLength(1);
  });
});
