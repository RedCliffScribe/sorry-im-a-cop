import 'fake-indexeddb/auto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision
} from '../../src/domain/customContent/assetTypes';
import { IndexedDbCustomContentRepository } from '../../src/domain/customContent/IndexedDbCustomContentRepository';
import {
  createNewGameCustomContentSelectionKey,
  prepareNewGameCustomContent,
  type NewGameCustomContentSelection
} from '../../src/domain/customContent/newGameSelection';
import { createDefaultCustomCharacterAdaptationPolicy } from '../../src/domain/customContent/worldAdaptation';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import type {
  NarratorAttemptRecord,
  NarratorRequestPurpose
} from '../../src/domain/narrator/NarratorClient';
import { IndexedDbOpeningSessionRepository } from '../../src/domain/opening/IndexedDbOpeningSessionRepository';
import { runOpeningV2 } from '../../src/domain/opening/runOpeningV2';
import { IndexedDbSaveRepository } from '../../src/domain/persistence/IndexedDbSaveRepository';
import {
  createInitialRuntimeState,
  type OpeningSetup
} from '../../src/domain/runtime/initialState';
import type { RuntimeState } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';

const shouldRun =
  process.env.COPV2_RUN_OPENING_MULTI_MODEL_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const requestTimeoutMs = Math.max(
  60_000,
  Number(
    process.env.COPV2_OPENING_MULTI_MODEL_TIMEOUT_MS ?? 600_000
  )
);
const maxAttempts = Math.min(
  3,
  Math.max(
    1,
    Math.trunc(
      Number(
        process.env.COPV2_OPENING_MULTI_MODEL_MAX_ATTEMPTS ?? 2
      )
    ) || 2
  )
);
const outputPath = path.resolve(
  process.env.COPV2_OPENING_MULTI_MODEL_OUTPUT_PATH ??
    path.join('output', 'opening-multi-model-real-api', 'latest.json')
);
const selectedScenarioIds = new Set(
  (process.env.COPV2_OPENING_MULTI_MODEL_SCENARIOS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

interface MatrixScenario {
  id: string;
  profileId: string;
  model: string;
  setup: OpeningSetup;
  customCharacter?: boolean;
  requiresRemoteActor?: boolean;
  requiresStructuredEmployer?: boolean;
  forbidsCustomEmployer?: boolean;
}

interface HttpAudit {
  status: number | null;
  responseMs: number;
  error?: string;
}

interface AttemptAudit {
  ordinal: number;
  accepted: boolean;
  requestCount: number;
  httpFailureCount: number;
  requestPurposes: NarratorRequestPurpose[];
  stages: Array<{
    purpose: NarratorRequestPurpose;
    parseStatus: NarratorAttemptRecord['parseStatus'];
    finishReason: NarratorAttemptRecord['finishReason'];
    configuredMaxTokens?: number;
    stageMaxTokens?: number;
    requestedMaxTokens?: number;
    limitingSource?: string;
    completionTokens?: number;
  }>;
  actorCount?: number;
  remoteActorCount?: number;
  narrativeCharacters?: number;
  actionCount?: number;
  homeBaseReady?: boolean;
  saveReloadMatched?: boolean;
  committedSession?: boolean;
  diagnosticCodes?: string[];
  customCharacterBound?: boolean;
  error?: string;
}

interface ScenarioAudit {
  scenarioId: string;
  route: string;
  identity: string;
  accepted: boolean;
  attempts: AttemptAudit[];
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key|tp)-[A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]')
    .slice(0, 1000);
}

function policeSetup(
  playerName: string,
  minute: number,
  overrides: Partial<OpeningSetup> = {}
): OpeningSetup {
  return {
    playerName,
    gender: 'male',
    age: 30,
    currentIdentity: 'police',
    policeNumber: `8${minute.toString().padStart(2, '0')}7`,
    policePostingId: 'mong_kok_police_station',
    personality: '做事谨慎，重视证据，也会顾及现场人物的处境。',
    appearance: '衣着整洁，符合1988年香港警务环境。',
    startTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: 21,
      minute
    },
    openingPressure: 'routine',
    storypackInfluence: 'high',
    screenCharacterSeedsEnabled: true,
    lawIdentity: {
      stationOrPost: '旺角警署',
      department: '军装巡逻',
      rank: '警员',
      assignmentSummary: '负责本更巡逻与一般现场初动。',
      authoritySummary: '拥有当前警阶和岗位范围内的有限警务权限。',
      accessSummary: '可接触本更任务、值班记录和现场基本资料。',
      dutySummary: '巡逻、响应、现场控制、报告与交接。'
    },
    ...overrides
  };
}

function civilianSetup(
  playerName: string,
  minute: number,
  profileId: string,
  overrides: Partial<OpeningSetup> = {}
): OpeningSetup {
  return {
    playerName,
    gender: 'female',
    age: 28,
    currentIdentity: 'civilian',
    civilianProfileId: profileId,
    personality: '务实、警觉，遇事会先确认自己真正知道的事实。',
    appearance: '衣着朴素利落，符合1988年香港日常生活环境。',
    startTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: 19,
      minute
    },
    openingPressure: 'routine',
    storypackInfluence: 'medium',
    screenCharacterSeedsEnabled: false,
    ...overrides
  };
}

function triadSetup(
  playerName: string,
  minute: number,
  overrides: Partial<OpeningSetup> = {}
): OpeningSetup {
  return {
    playerName,
    gender: 'male',
    age: 31,
    currentIdentity: 'gang_member',
    triadSocietyId: 'org_14k',
    triadTerritoryPlaceId: 'place_chungking_mansions',
    triadRankId: 'outside_associate',
    triadRoleId: 'information_contact',
    personality: '懂得分寸，不把传闻当事实，也不会擅自越过上线。',
    appearance: '普通便装，不刻意显露社团背景。',
    startTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: 22,
      minute
    },
    openingPressure: 'standard',
    storypackInfluence: 'high',
    screenCharacterSeedsEnabled: false,
    ...overrides
  };
}

function createScenarios(): MatrixScenario[] {
  return [
    {
      id: 'mimo_police_family_remote',
      profileId: 'api_xiaomi_mimo',
      model: 'mimo-v2.5',
      requiresRemoteActor: true,
      setup: policeSetup('周启明', 11, {
        dramaticOpeningId: 'family_entanglement',
        openingNote:
          '必须建立至少一名 absent 或 mentioned 的远场亲属；位置未知时不得伪造当前地点，同时保留一名在场警队关系人物。'
      })
    },
    {
      id: 'grok_civilian_structured_employer',
      profileId: 'api_yuqing',
      model: 'grok-4.3-medium',
      requiresStructuredEmployer: true,
      setup: civilianSetup('何美玲', 12, 'custom_occupation', {
        civilianCustomProfile: {
          publicOccupation: '摄影助理',
          workplacePlaceId: 'place_broadcast_drive',
          workplaceLabel: '广播道',
          employerName: '明光摄影社',
          communitySummary: '平日接触摄影师、冲印店和广告从业者。'
        },
        openingNote:
          '围绕明光摄影社的真实工作关系展开；工作人物必须复用本地雇主机构，不得新造机构。'
      })
    },
    {
      id: 'gemini_triad_outside_contact',
      profileId: 'api_tianbohe',
      model: 'gemini-3-flash-preview-high',
      setup: triadSetup('赵家俊', 13, {
        dramaticOpeningId: 'mentor_lead',
        openingNote:
          '安排一次只涉及认人和传话的低层差事，必须体现外围身份权限有限，不能替整个字头作决定。'
      })
    },
    {
      id: 'mimo_cid_custom_character',
      profileId: 'api_xiaomi_mimo',
      model: 'mimo-v2.5-pro',
      customCharacter: true,
      setup: policeSetup('林志恒', 14, {
        policePostingId: 'wan_chai_police_station',
        dramaticOpeningId: 'first_shift',
        lawIdentity: {
          stationOrPost: '湾仔警署',
          department: '刑事侦缉处',
          rank: '见习督察',
          assignmentSummary: '刚调入 CID，负责协助调查和报告整理。',
          authoritySummary: '可在直属上司授权下协调本组调查。',
          accessSummary: '可接触本组案件资料和值班记录。',
          dutySummary: '调查、问话、证据整理、报告和交接。'
        },
        openingNote:
          '本局启用了自定义人物林法证。人物必须保持稳定来源身份，只能在现实可达时自然进入，不得强行投影。'
      })
    },
    {
      id: 'grok_civilian_unemployed_social',
      profileId: 'api_yuqing',
      model: 'grok-4.20-fast',
      setup: civilianSetup('陈淑仪', 15, 'unemployed', {
        openingPressure: 'relaxed',
        openingNote:
          '玩家当前无业，不得伪造雇主或工作同事；使用邻居、房东、亲属或街坊等普通社会关系完成开局。'
      })
    },
    {
      id: 'gemini_police_ptu_tense',
      profileId: 'api_tianbohe',
      model: 'gemini-3.1-flash-lite-preview',
      setup: policeSetup('梁国辉', 16, {
        policePostingId: 'fanling_police_station',
        openingPressure: 'tense',
        lawIdentity: {
          stationOrPost: '粉岭警署',
          department: '机动部队 PTU',
          rank: '警长',
          assignmentSummary: '负责小队当值、训练与受命支援。',
          authoritySummary: '只可指挥所属小队，跨区行动必须服从调派。',
          accessSummary: '可接触本队当值和支援任务资料。',
          dutySummary: '训练、候命、受命支援和行动后报告。'
        },
        openingNote:
          '开局体现高压候命，但不能凭空升级成大规模暴乱；至少提供一个可拒绝或延后的个人牵连。'
      })
    },
    {
      id: 'grok_triad_district_cadre',
      profileId: 'api_yuqing',
      model: 'grok-4.20-0309-non-reasoning',
      setup: triadSetup('冯世豪', 17, {
        triadSocietyId: 'org_wo_shing_wo',
        triadTerritoryPlaceId: 'place_temple_street_night_market',
        triadRankId: 'district_cadre',
        triadRoleId: 'district_affairs_coordinator',
        openingPressure: 'high',
        openingNote:
          '围绕庙街一处场所的人情和账目压力展开；地区中层仍受上层、账目和地盘边界约束。'
      })
    },
    {
      id: 'gemini_civilian_nurse_remote',
      profileId: 'api_tianbohe',
      model: 'gemini-3.1-pro-preview-low',
      requiresRemoteActor: true,
      setup: civilianSetup('苏慧敏', 18, 'hospital_nurse', {
        gender: 'female',
        dramaticOpeningId: 'family_entanglement',
        openingNote:
          '必须建立一名不在场的远场家人，同时保留医院轮班关系；不得泄露病人私隐或赋予玩家医疗管理权限。'
      })
    },
    {
      id: 'grok_police_marine_screen_seed',
      profileId: 'api_yuqing',
      model: 'grok-4.3-fast',
      setup: policeSetup('许文杰', 19, {
        policePostingId: 'aberdeen_police_station',
        screenCharacterSeedsEnabled: true,
        lawIdentity: {
          stationOrPost: '香港仔水警基地',
          department: '水警',
          rank: '高级警员',
          assignmentSummary: '负责近岸巡逻和码头联络。',
          authoritySummary: '只可处理获派巡逻和现场初动。',
          accessSummary: '可接触当值航线、码头联络和基本报告。',
          dutySummary: '近岸巡逻、码头联络、救援协助和报告。'
        },
        openingNote:
          '从一次普通码头联络开始；影视角色种子只能自然候选，不得挤掉本地必需人物或泄露作品信息。'
      })
    },
    {
      id: 'gemini_background_company_without_employer',
      profileId: 'api_tianbohe',
      model: 'gemini-3-flash-preview',
      forbidsCustomEmployer: true,
      setup: civilianSetup('郭佩珊', 20, 'custom_occupation', {
        civilianCustomProfile: {
          publicOccupation: '贸易文员',
          workplacePlaceId: 'place_central_ferry_piers',
          workplaceLabel: '中环',
          communitySummary: '背景文字提到曾接触金龙贸易公司，但没有填写正式雇主。'
        },
        openingNote:
          '背景里提到金龙贸易公司，但未填写结构化雇主；不得创建该机构，改用朋友、邻居、房东或街坊等普通社会关系人物。'
      })
    }
  ];
}

function resolveRoute(
  source: AiSettings,
  scenario: MatrixScenario
): { settings: AiSettings; route: string } {
  const profile = source.apiProfiles.find(
    (candidate) => candidate.id === scenario.profileId
  );
  if (!profile) {
    throw new Error(`找不到真实 API 档案：${scenario.profileId}`);
  }
  if (!profile.models.includes(scenario.model)) {
    throw new Error(
      `档案 ${profile.name} 未声明模型 ${scenario.model}`
    );
  }
  return {
    route: `${profile.name}/${scenario.model}`,
    settings: {
      ...source,
      mainNarrator: {
        apiProfileId: profile.id,
        model: scenario.model,
        maxTokensMode: 'custom',
        maxTokens: 32_768,
        temperature: 0.35
      },
      featureRoutes: {
        ...source.featureRoutes,
        writebackRepair: { mode: 'follow-main' },
        memorySummary: { mode: 'disabled' },
        memoryVector: { mode: 'disabled' },
        npcSimulation: { mode: 'disabled' },
        backgroundEvolution: { mode: 'disabled' }
      },
      game: {
        ...source.game,
        narrativeLengthLevel: 'compact'
      }
    }
  };
}

function createAuditedFetch(audits: HttpAudit[]) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const startedAt = performance.now();
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.any(
          [
            init?.signal,
            AbortSignal.timeout(requestTimeoutMs)
          ].filter((signal): signal is AbortSignal => Boolean(signal))
        )
      });
      audits.push({
        status: response.status,
        responseMs: Math.round(performance.now() - startedAt)
      });
      return response;
    } catch (error) {
      audits.push({
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

async function prepareCustomCharacterState(
  scenario: MatrixScenario
): Promise<{
  state: RuntimeState;
  selection?: NewGameCustomContentSelection;
}> {
  const initialState = createInitialRuntimeState(scenario.setup);
  if (!scenario.customCharacter) return { state: initialState };

  const databaseName = `opening-matrix-custom-${crypto.randomUUID()}`;
  const repository = new IndexedDbCustomContentRepository(databaseName);
  const now = '2026-07-29T00:00:00.000Z';
  const asset: CustomCharacterAsset = {
    characterAssetId: 'character-matrix-forensic-lam',
    latestRevision: 1,
    revisionCount: 1,
    global: true,
    projectIds: [],
    createdAt: now,
    updatedAt: now
  };
  const revision: CustomCharacterRevision = {
    characterAssetId: asset.characterAssetId,
    revision: 1,
    checksum: 'checksum-character-matrix-forensic-lam-v1',
    displayName: '林法证',
    aliases: [],
    gender: 'female',
    profileSummary: '熟悉夜班证物封存、编号和交接流程。',
    backgroundSummary: '长期在法证链路处理封条和交接记录。',
    corePersonality: ['冷静', '谨慎'],
    values: ['真相', '程序正义'],
    coreMotivations: ['保护证据链'],
    majorRelationships: [],
    entryMode: 'asap',
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy(),
    deployments: [
      {
        worldpackId: 'hk_1988',
        mode: 'native',
        defaultEnabledForNewGame: true
      }
    ],
    sourceSpans: [],
    lifecycle: {
      generationStatus: 'ready',
      reviewStatus: 'approved',
      availabilityStatus: 'enabled'
    }
  };
  await repository.saveRevisionBundles([
    {
      assetKind: 'character',
      asset,
      revision
    }
  ]);
  const draft = {
    kind: 'character' as const,
    assetId: asset.characterAssetId,
    revision: 1,
    prioritized: true
  };
  const selection: NewGameCustomContentSelection = {
    ...draft,
    selectionKey: createNewGameCustomContentSelectionKey(draft)
  };
  const prepared = await prepareNewGameCustomContent({
    repository,
    state: initialState,
    selections: [selection],
    now
  });
  if (prepared.reviewItems.length > 0) {
    throw new Error('native 自定义人物不应要求 AI 适配审核。');
  }
  return {
    state: prepared.state,
    selection
  };
}

function assertAllOrganizationReferencesExist(state: RuntimeState) {
  for (const actor of Object.values(state.actors)) {
    for (const organizationId of actor.organizationIds) {
      if (!state.organizations[organizationId]) {
        throw new Error(
          `人物 ${actor.actorId} 引用了不存在的机构 ${organizationId}`
        );
      }
    }
    const employerId =
      actor.roleProfiles.civilian?.employerOrganizationId;
    if (
      employerId &&
      (!state.organizations[employerId] ||
        !actor.organizationIds.includes(employerId))
    ) {
      throw new Error(
        `人物 ${actor.actorId} 的雇主机构引用不一致：${employerId}`
      );
    }
  }
}

async function executeScenarioAttempt({
  importedSettings,
  scenario,
  attemptOrdinal
}: {
  importedSettings: AiSettings;
  scenario: MatrixScenario;
  attemptOrdinal: number;
}): Promise<AttemptAudit> {
  const { settings } = resolveRoute(importedSettings, scenario);
  const httpAudits: HttpAudit[] = [];
  const attempts: NarratorAttemptRecord[] = [];
  const requestPurposes: NarratorRequestPurpose[] = [];
  const audit: AttemptAudit = {
    ordinal: attemptOrdinal,
    accepted: false,
    requestCount: 0,
    httpFailureCount: 0,
    requestPurposes,
    stages: []
  };

  try {
    const { state: initialState, selection } =
      await prepareCustomCharacterState(scenario);
    const baseNarrator = createNarratorClientFromSettings(
      settings,
      createAuditedFetch(httpAudits)
    );
    const narrator = {
      configuredMaxTokens: baseNarrator.configuredMaxTokens,
      complete: (input: string, options?: Parameters<typeof baseNarrator.complete>[1]) => {
        requestPurposes.push(options?.requestPurpose ?? 'auxiliary');
        return baseNarrator.complete(input, options);
      },
      ...(baseNarrator.completeDetailed
        ? {
            completeDetailed: (
              input: string,
              options?: Parameters<
                NonNullable<typeof baseNarrator.completeDetailed>
              >[1]
            ) => {
              requestPurposes.push(
                options?.requestPurpose ?? 'auxiliary'
              );
              return baseNarrator.completeDetailed!(input, options);
            }
          }
        : {})
    };
    const openingRepository = new IndexedDbOpeningSessionRepository(
      `opening-matrix-session-${scenario.id}-${crypto.randomUUID()}`
    );
    const opened = await runOpeningV2({
      setup: scenario.setup,
      initialState,
      narrator,
      repairNarrator: narrator,
      sessionRepository: openingRepository,
      narrativeLengthLevel: 'compact',
      narrativePerspective: settings.game.narrativePerspective,
      playerPortrayalMode: settings.game.playerPortrayalMode,
      promptSettings: settings.prompts,
      tavernSettings: settings.tavern,
      dramaticContentSettings: settings.game.dramaticContent,
      onAttempt: (attempt) => attempts.push(attempt)
    });

    const committedSummary = (await openingRepository.list()).find(
      (candidate) => candidate.stage === 'committed'
    );
    if (!committedSummary) {
      throw new Error('开局完成后没有 committed 会话。');
    }
    const draft = await openingRepository.load(
      committedSummary.openingSessionId
    );
    if (!draft) throw new Error('无法读取已提交的开局阶段草稿。');

    const openingStory = [...opened.storyLog]
      .reverse()
      .find((entry) => entry.speaker === 'narrator');
    if (
      !openingStory?.text.trim() ||
      (openingStory.suggestedActions?.length ?? 0) < 2
    ) {
      throw new Error('开局正文或建议行动未完整落库。');
    }
    if (
      opened.turnCounter !== 0 ||
      opened.player.economy.cashOnHand < 0 ||
      !opened.player.homeBase?.placeId
    ) {
      throw new Error('开局回合、经济或住所状态不完整。');
    }
    if (opened.player.currentIdentity !== scenario.setup.currentIdentity) {
      throw new Error('开局后玩家身份与设定不一致。');
    }

    assertAllOrganizationReferencesExist(opened);
    const actorValues = Object.values(opened.actors).filter(
      (actor) => actor.actorId !== opened.player.actorId
    );
    const remoteActors = actorValues.filter(
      (actor) =>
        actor.presence === 'absent' ||
        actor.presence === 'mentioned'
    );
    const sceneActorIds =
      opened.scenes[opened.location.currentSceneId!]?.presentActorIds ??
      [];
    for (const actor of remoteActors) {
      if (sceneActorIds.includes(actor.actorId)) {
        throw new Error(`远场人物错误进入当前场景：${actor.actorId}`);
      }
      if (
        !actor.currentPlaceId &&
        (actor.lastSeenAt || actor.lastSeenPlaceId)
      ) {
        throw new Error(
          `未知位置远场人物获得伪造 lastSeen：${actor.actorId}`
        );
      }
    }
    if (scenario.requiresRemoteActor && remoteActors.length === 0) {
      throw new Error('本场景要求远场人物，但开局未建立。');
    }
    if (scenario.requiresStructuredEmployer) {
      if (
        opened.organizations.org_player_custom_employer?.name !==
          '明光摄影社' ||
        opened.actors.player.roleProfiles.civilian
          ?.employerOrganizationId !==
          'org_player_custom_employer'
      ) {
        throw new Error('结构化自定义雇主未正确绑定。');
      }
    }
    if (
      scenario.forbidsCustomEmployer &&
      opened.organizations.org_player_custom_employer
    ) {
      throw new Error('仅在背景中提及的公司被错误建成正式机构。');
    }
    if (selection) {
      const bound = opened.customContent?.characterBindings.some(
        (binding) =>
          binding.assetId === selection.assetId &&
          binding.revision === selection.revision
      );
      if (!bound) {
        throw new Error('本局启用的自定义人物绑定在开局后丢失。');
      }
      audit.customCharacterBound = true;
    }

    const saveRepository = new IndexedDbSaveRepository(
      `opening-matrix-save-${scenario.id}-${crypto.randomUUID()}`
    );
    const saveId = `opening_matrix_${scenario.id}_${attemptOrdinal}`;
    const now = new Date().toISOString();
    await saveRepository.save({
      saveId,
      saveName: `多模型开局 ${scenario.id}`,
      createdAt: now,
      updatedAt: now,
      playerName: opened.player.name,
      worldpackId: opened.world.worldpackId,
      gameDateLabel: `${opened.time.year}-${opened.time.month}-${opened.time.day}`,
      turnCounter: opened.turnCounter,
      runtimeState: opened
    });
    const loaded = await saveRepository.load(saveId);
    if (!loaded) throw new Error('开局保存后无法读取。');
    expect(loaded.runtimeState).toEqual(opened);

    audit.accepted = true;
    audit.actorCount = actorValues.length;
    audit.remoteActorCount = remoteActors.length;
    audit.narrativeCharacters = openingStory.text.length;
    audit.actionCount = openingStory.suggestedActions?.length ?? 0;
    audit.homeBaseReady = true;
    audit.saveReloadMatched = true;
    audit.committedSession = true;
    audit.diagnosticCodes = draft.diagnostics
      .map((diagnostic) => diagnostic.code)
      .filter((code): code is string => Boolean(code));
  } catch (error) {
    audit.error = safeError(error);
  }

  audit.requestCount = httpAudits.length;
  audit.httpFailureCount = httpAudits.filter(
    (entry) =>
      entry.status === null ||
      entry.status < 200 ||
      entry.status >= 300
  ).length;
  audit.stages = attempts.map((attempt) => ({
    purpose: attempt.purpose,
    parseStatus: attempt.parseStatus,
    finishReason: attempt.finishReason,
    configuredMaxTokens:
      attempt.outputBudget?.configuredMaxTokens,
    stageMaxTokens: attempt.outputBudget?.stageMaxTokens,
    requestedMaxTokens:
      attempt.outputBudget?.requestedMaxTokens,
    limitingSource: attempt.outputBudget?.limitingSource,
    completionTokens: attempt.usage?.completionTokens
  }));
  return audit;
}

async function executeScenario(
  importedSettings: AiSettings,
  scenario: MatrixScenario
): Promise<ScenarioAudit> {
  const { route } = resolveRoute(importedSettings, scenario);
  const result: ScenarioAudit = {
    scenarioId: scenario.id,
    route,
    identity: scenario.setup.currentIdentity ?? 'police',
    accepted: false,
    attempts: []
  };
  for (
    let attemptOrdinal = 1;
    attemptOrdinal <= maxAttempts;
    attemptOrdinal += 1
  ) {
    const attempt = await executeScenarioAttempt({
      importedSettings,
      scenario,
      attemptOrdinal
    });
    result.attempts.push(attempt);
    process.stdout.write(
      `[opening-matrix] ${scenario.id} route=${route} ` +
        `attempt=${attemptOrdinal} accepted=${attempt.accepted} ` +
        `requests=${attempt.requestCount} httpFailures=${attempt.httpFailureCount}\n`
    );
    if (attempt.accepted) {
      result.accepted = true;
      break;
    }
  }
  return result;
}

describe.skipIf(!shouldRun)(
  'opening V2 multi-model real API matrix',
  () => {
    it(
      'completes ten diverse openings across MiMo, Grok and Gemini',
      async () => {
        const importedSettings = importApiSettings(
          createDefaultAiSettings(),
          await readFile(settingsPath, 'utf8')
        );
        const scenarios = createScenarios().filter(
          (scenario) =>
            selectedScenarioIds.size === 0 ||
            selectedScenarioIds.has(scenario.id)
        );
        if (scenarios.length === 0) {
          throw new Error('没有匹配的多模型真实开局场景。');
        }
        const audits: ScenarioAudit[] = [];

        for (let index = 0; index < scenarios.length; index += 2) {
          const batch = scenarios.slice(index, index + 2);
          const batchAudits = await Promise.all(
            batch.map((scenario) =>
              executeScenario(importedSettings, scenario)
            )
          );
          audits.push(...batchAudits);
        }

        const acceptedCount = audits.filter(
          (audit) => audit.accepted
        ).length;
        const report = {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          requestedScenarioCount: scenarios.length,
          acceptedCount,
          allAccepted: acceptedCount === scenarios.length,
          providers: [
            ...new Set(
              audits.map((audit) => audit.route.split('/')[0])
            )
          ],
          routes: [...new Set(audits.map((audit) => audit.route))],
          identityCounts: audits.reduce<Record<string, number>>(
            (counts, audit) => {
              counts[audit.identity] =
                (counts[audit.identity] ?? 0) + 1;
              return counts;
            },
            {}
          ),
          attempts: audits.reduce(
            (total, audit) => total + audit.attempts.length,
            0
          ),
          httpFailures: audits.reduce(
            (total, audit) =>
              total +
              audit.attempts.reduce(
                (attemptTotal, attempt) =>
                  attemptTotal + attempt.httpFailureCount,
                0
              ),
            0
          ),
          audits
        };
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(
          outputPath,
          JSON.stringify(report, null, 2),
          'utf8'
        );

        expect(audits).toHaveLength(scenarios.length);
        expect(new Set(audits.map((audit) => audit.route)).size).toBe(
          scenarios.length
        );
        if (selectedScenarioIds.size === 0) {
          expect(
            new Set(
              audits.map((audit) => audit.route.split('/')[0])
            ).size
          ).toBeGreaterThanOrEqual(3);
        }
        expect(audits.every((audit) => audit.accepted)).toBe(true);
        expect(
          audits.every((audit) =>
            audit.attempts.some(
              (attempt) =>
                attempt.accepted &&
                attempt.committedSession &&
                attempt.saveReloadMatched
            )
          )
        ).toBe(true);
      },
      7_200_000
    );
  }
);
