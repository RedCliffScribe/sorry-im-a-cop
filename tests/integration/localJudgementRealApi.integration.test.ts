import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsonrepair } from 'jsonrepair';
import { createActorDefaults } from '../../src/domain/runtime/actorFactory';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type {
  Actor,
  AttributeBlock,
  AttributeKey,
  GameDifficultyLevel,
  RuntimeState
} from '../../src/domain/runtime/types';
import type { JudgementRecoveryTrace } from '../../src/domain/conflict/judgementRecoveryTrace';
import type { NarratorClient } from '../../src/domain/narrator/NarratorClient';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn, type TurnExecutionStage } from '../../src/domain/turn/TurnEngine';
import { parseRuntimeSaveRecord } from '../../src/domain/persistence/saveArchiveSchema';
import { combatEventPatchSchema } from '../../src/domain/writeback/schema';

const shouldRun = process.env.COPV2_RUN_LOCAL_JUDGEMENT_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const outputPath = path.resolve(
  process.env.COPV2_LOCAL_JUDGEMENT_REAL_API_OUTPUT_PATH ??
    path.join('output', 'local-judgement-real-api', 'latest.json')
);
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_LOCAL_JUDGEMENT_REQUEST_TIMEOUT_MS ?? 900_000)
);
const injectInvalidEffectiveTarget =
  process.env.COPV2_LOCAL_JUDGEMENT_INJECT_INVALID_TARGET === '1';
const injectIncompletePreflight =
  process.env.COPV2_LOCAL_JUDGEMENT_INJECT_INCOMPLETE_PREFLIGHT === '1';
const injectFactorProposals =
  process.env.COPV2_LOCAL_JUDGEMENT_INJECT_FACTOR_PROPOSALS === '1';

interface RouteChoice {
  id: string;
  profileId: string;
  profileName: string;
  model: string;
  label: string;
}

interface ScenarioDefinition {
  id: string;
  routeId: RouteChoice['id'];
  title: string;
  playerInput: string;
  expectedPrimaryAttribute?: AttributeKey;
  expectCombat?: boolean;
  gameDifficulty: GameDifficultyLevel;
  judgementRoll: number;
  counterpart?: {
    name: string;
    publicIdentity: string;
    equipment?: string[];
  };
}

interface HttpAudit {
  route: string;
  scenario: string;
  status: number | null;
  durationMs: number;
  errorCategory?: 'network_error';
}

interface ScenarioResult {
  route: string;
  profileName: string;
  model: string;
  scenario: string;
  title: string;
  accepted: boolean;
  durationMs: number;
  httpRequestCount: number;
  httpStatusCounts: Record<string, number>;
  preflightCalled: boolean;
  settledBeforeNarrative: boolean;
  judgementRegenerated: boolean;
  invalidEffectiveTargetInjected: boolean;
  incompletePreflightInjected: boolean;
  factorProposalsInjected: boolean;
  candidateStructures: CandidateStructureAudit[];
  recoveryTrace?: {
    requestId: string;
    turnId: string;
    presetRoll: number;
    persisted: boolean;
    rawEffectiveTarget: unknown;
    stages: string[];
  };
  summary?: {
    expectedPrimaryAttribute: AttributeKey | 'none';
    actualPrimaryAttribute: AttributeKey | 'none';
    rulesetVersion: string | 'none';
    gameDifficulty: GameDifficultyLevel;
    presetRoll: number | 'none';
    effectiveTarget: number | 'none';
    outcome: string | 'none';
    difficultyTier: string | 'none';
    factorSourceTypes: string[];
    factorSourceIds: string[];
    rejectedFactorCount: number;
    preflightAttemptCount: number;
    narrativeCorrectionStatus: string | 'none';
    saveRoundTrip: boolean;
    judgementCount: number;
    combatCount: number;
    combatLinked: boolean;
    turnAdvanced: boolean;
  };
  failure?: {
    errorName: string;
    category:
      | 'contract_rejected'
      | 'schema_validation'
      | 'request_timeout'
      | 'provider_error'
      | 'network_error'
      | 'unexpected_result';
    message: string;
  };
}

interface CandidateStructureAudit {
  parseable: boolean;
  judgementPatchCount?: number;
  combatPatchCount?: number;
  combatJudgementLinkCount?: number;
  combatPatchShapes?: Array<{
    keys: string[];
    type: unknown;
    outcome: unknown;
    missingRequiredFields: string[];
    validationIssues: Array<{
      path: string;
      code: string;
      message: string;
    }>;
  }>;
}

type ScenarioSummary = NonNullable<ScenarioResult['summary']>;

class ScenarioAuditError extends Error {
  readonly summary: ScenarioSummary;

  constructor(message: string, summary: ScenarioSummary) {
    super(message);
    this.name = 'ScenarioAuditError';
    this.summary = summary;
  }
}

const routeChoices: readonly RouteChoice[] = [
  {
    id: 'yuqing_gemini',
    profileId: 'api_yuqing',
    profileName: 'yuqing',
    model: '企业cli-gemini-3-flash-preview',
    label: 'yuqing/gemini-3-flash-preview'
  },
  {
    id: 'tianbohe_gemini',
    profileId: 'api_tianbohe',
    profileName: 'tianbohe',
    model: 'gemini-3-flash-preview',
    label: 'tianbohe/gemini-3-flash-preview'
  },
  {
    id: 'yuqing_grok',
    profileId: 'api_yuqing',
    profileName: 'yuqing',
    model: 'grok-4.3-fast',
    label: 'yuqing/grok-4.3-fast'
  },
  {
    id: 'siliconflow_deepseek',
    profileId: 'api_siliconflow',
    profileName: 'siliconflow',
    model: 'deepseek-ai/DeepSeek-V4-Flash',
    label: 'siliconflow/deepseek-ai/DeepSeek-V4-Flash'
  }
];

const balancedAttributes: AttributeBlock = {
  body: 62,
  action: 58,
  perception: 64,
  thinking: 61,
  negotiation: 57,
  will: 60
};

const scenarios: readonly ScenarioDefinition[] = [
  {
    id: 'perception_rain_plate',
    routeId: 'yuqing_gemini',
    title: '观察：雨夜辨认车牌',
    playerInput:
      '雨水快要冲掉警署后巷铁门边的新鲜轮胎印，远处一辆可疑客货车正要驶出视线。我只有几秒，俯身借路灯角度辨认轮胎纹和后四位车牌；看错会令追查方向出现实际偏差。',
    expectedPrimaryAttribute: 'perception',
    gameDifficulty: 'standard',
    judgementRoll: 47
  },
  {
    id: 'safe_copy_register',
    routeId: 'yuqing_gemini',
    title: '无判定：抄录已核准资料',
    playerInput:
      '当值表已经由两名警员核准，姓名、日期和编号都清楚无误，没有时间压力，也没有任何人阻碍。我把上面的三项资料逐字抄到归档封面，然后把笔放回桌上。',
    gameDifficulty: 'standard',
    judgementRoll: 47
  },
  {
    id: 'thinking_timeline',
    routeId: 'tianbohe_gemini',
    title: '思考：矛盾时序推理',
    playerInput:
      '桌上三份已经登记的值班记录给出互相冲突的时间：后门锁闭、巡更打卡和停电各差五分钟。值日警长马上要决定先查哪条线。我逐项比对时间与步行距离，判断哪一种时序在现实中成立；推错会浪费当值人手。',
    expectedPrimaryAttribute: 'thinking',
    gameDifficulty: 'easy',
    judgementRoll: 54
  },
  {
    id: 'negotiation_manager',
    routeId: 'tianbohe_gemini',
    title: '交涉：说服抗拒经理',
    playerInput:
      '夜总会经理陈伟强握着已经存在的后门值班表，担心得罪股东，明确表示不会无条件交出。我只能在不越权、不许诺好处的前提下说明程序后果，争取他现在配合查阅；失败会令资料延后甚至被转移。',
    expectedPrimaryAttribute: 'negotiation',
    gameDifficulty: 'brutal',
    judgementRoll: 38,
    counterpart: {
      name: '陈伟强',
      publicIdentity: '对查阅后门值班表持抗拒态度的夜总会经理'
    }
  },
  {
    id: 'action_alarm',
    routeId: 'tianbohe_gemini',
    title: '行动：抢在烟雾前按警铃',
    playerInput:
      '证物室外的废纸篓突然冒烟，倒下的金属文件架挡住墙上警铃，烟正迅速变浓。我侧身跨过摇晃的架角，必须赶在视线被遮住前按下警铃；失足或迟疑都会让火势扩大。',
    expectedPrimaryAttribute: 'action',
    gameDifficulty: 'hard',
    judgementRoll: 42
  },
  {
    id: 'will_intimidation',
    routeId: 'yuqing_grok',
    title: '意志：威吓下维持程序',
    playerInput:
      '陈伟强贴近桌边压低声音，点出我的家人住区，试图逼我删掉刚写好的正式记录。我知道这不是闲谈，也不能靠退让消除风险。我稳住情绪，继续按程序复述记录内容并要求他确认；动摇会直接破坏证词完整性。',
    expectedPrimaryAttribute: 'will',
    gameDifficulty: 'story',
    judgementRoll: 67,
    counterpart: {
      name: '陈伟强',
      publicIdentity: '正在以玩家家人住区实施言语威吓的夜总会经理'
    }
  },
  {
    id: 'body_fire_door',
    routeId: 'siliconflow_deepseek',
    title: '体魄：撑开变形防火门',
    playerInput:
      '警署储物间的防火门受热变形，梁志强的手臂仍卡在门后，闭门器正把缝隙压小。我用肩背顶住门板并持续发力，为他争取抽手的空间；力量不足会令他受伤加重。',
    expectedPrimaryAttribute: 'body',
    gameDifficulty: 'story',
    judgementRoll: 71,
    counterpart: {
      name: '梁志强',
      publicIdentity: '手臂被变形防火门卡住的同班警员'
    }
  },
  {
    id: 'combat_armed_restraint',
    routeId: 'tianbohe_gemini',
    title: '重大对抗：闪避铁棍并制服',
    playerInput:
      '持铁棍的郑海生已经在警署后巷挥棍冲来，距离不足两步，退后会让他冲进有人经过的门廊。我侧身避开棍头，立即贴近控制他的持棍手并尝试把人压住上铐；成败必须形成真实伤势、逃脱或制服后果，并留下对抗记录。',
    expectedPrimaryAttribute: 'action',
    expectCombat: true,
    gameDifficulty: 'brutal',
    judgementRoll: 34,
    counterpart: {
      name: '郑海生',
      publicIdentity: '正在警署后巷持铁棍攻击玩家的嫌疑人',
      equipment: ['铁棍']
    }
  }
];

function requestedValues(environmentName: string): Set<string> {
  return new Set(
    (process.env[environmentName] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function activeMatrix() {
  const requestedRoutes = requestedValues('COPV2_LOCAL_JUDGEMENT_ROUTES');
  const requestedScenarios = requestedValues('COPV2_LOCAL_JUDGEMENT_SCENARIOS');
  const allowScenarioRouteMigration =
    process.env.COPV2_LOCAL_JUDGEMENT_ALLOW_ROUTE_MIGRATION === '1';
  const isFullMatrix =
    requestedRoutes.size === 0 && requestedScenarios.size === 0;
  const activeRoutes =
    requestedRoutes.size === 0
      ? routeChoices
      : routeChoices.filter(
          (route) =>
            requestedRoutes.has(route.id) || requestedRoutes.has(route.label)
        );
  const activeRouteIds = new Set(activeRoutes.map((route) => route.id));

  if (activeRoutes.length === 0) {
    throw new Error('真实判定测试没有匹配到任何线路。');
  }
  if (allowScenarioRouteMigration && activeRoutes.length !== 1) {
    throw new Error('场景线路迁移验收必须且只能选择一条真实 API 线路。');
  }
  const selectedScenarios =
    requestedScenarios.size === 0
      ? scenarios
      : scenarios.filter((scenario) => requestedScenarios.has(scenario.id));
  const activeScenarios = allowScenarioRouteMigration
    ? selectedScenarios.map((scenario) => ({
        ...scenario,
        routeId: activeRoutes[0].id
      }))
    : selectedScenarios.filter((scenario) =>
        activeRouteIds.has(scenario.routeId)
      );
  if (activeScenarios.length === 0) {
    throw new Error('真实判定测试没有匹配到任何场景。');
  }
  return { activeRoutes, activeScenarios, isFullMatrix };
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 800);
}

function summarizeRawCandidate(rawText: string): CandidateStructureAudit {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start < 0 || end < start) return { parseable: false };
  try {
    const parsed = JSON.parse(jsonrepair(rawText.slice(start, end + 1))) as {
      writeback?: {
        judgementCheckPatches?: unknown;
        combatEventPatches?: unknown;
      };
    };
    const judgementPatches = Array.isArray(
      parsed.writeback?.judgementCheckPatches
    )
      ? parsed.writeback.judgementCheckPatches
      : [];
    const combatPatches = Array.isArray(parsed.writeback?.combatEventPatches)
      ? parsed.writeback.combatEventPatches
      : [];
    const combatJudgementLinkCount = combatPatches.reduce(
      (total, patch) => {
        if (!patch || typeof patch !== 'object') return total;
        const links = (patch as { judgementCheckIds?: unknown })
          .judgementCheckIds;
        return total + (Array.isArray(links) ? links.length : 0);
      },
      0
    );
    const requiredCombatFields = [
      'combatId',
      'turnId',
      'gameTime',
      'title',
      'type',
      'locationSummary',
      'participants',
      'outcome',
      'intensity',
      'combatText',
      'resultSummary',
      'consequenceSummary',
      'createdAt'
    ] as const;
    const combatPatchShapes = combatPatches.map((patch) => {
      const record =
        patch && typeof patch === 'object'
          ? (patch as Record<string, unknown>)
          : {};
      return {
        keys: Object.keys(record).sort(),
        type: record.type,
        outcome: record.outcome,
        missingRequiredFields: requiredCombatFields.filter(
          (field) => record[field] === undefined
        ),
        validationIssues: (() => {
          const parsedPatch = combatEventPatchSchema.safeParse(record);
          return parsedPatch.success
            ? []
            : parsedPatch.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                code: issue.code,
                message: issue.message
              }));
        })()
      };
    });
    return {
      parseable: true,
      judgementPatchCount: judgementPatches.length,
      combatPatchCount: combatPatches.length,
      combatJudgementLinkCount,
      combatPatchShapes
    };
  } catch {
    return { parseable: false };
  }
}

function countValues(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function requireRoute(settings: AiSettings, route: RouteChoice): void {
  const profile = settings.apiProfiles.find(
    (item) => item.id === route.profileId
  );
  if (!profile) {
    throw new Error(`缺少测试 Profile：${route.profileName}`);
  }
  if (!profile.models.includes(route.model)) {
    throw new Error(`Profile 缺少测试模型：${route.label}`);
  }
}

function createRouteSettings(
  settings: AiSettings,
  route: RouteChoice
): AiSettings {
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: route.profileId,
      model: route.model,
      maxTokensMode: 'custom',
      maxTokens: 12_288,
      temperature: 0.2
    }
  };
}

function seedCounterpart(
  state: RuntimeState,
  scenario: ScenarioDefinition
): RuntimeState {
  if (!scenario.counterpart) return state;
  const actorId = `npc_real_judgement_${scenario.id}`;
  const actor: Actor = createActorDefaults({
    actorId,
    name: scenario.counterpart.name,
    gender: 'male',
    currentIdentity: 'civilian',
    publicIdentity: scenario.counterpart.publicIdentity,
    actualIdentitySummary: scenario.counterpart.publicIdentity,
    positionSummary: scenario.counterpart.publicIdentity,
    currentPlaceId: state.location.currentPlaceId,
    currentSceneId: state.location.currentSceneId,
    presence: 'present',
    equipment: scenario.counterpart.equipment ?? [],
    profileSummary: scenario.counterpart.publicIdentity,
    appearance: '成年男子，当前状态与现场情境一致。',
    clothing: '普通便服。',
    personality: '会按自身利益和当前压力作出反应。',
    speechStyle: '说话直接，不主动让步。',
    motivation: '维持当前立场并避免自身利益受损。',
    longTermGoal: '保护自己的现实利益。',
    values: '自保与控制风险。',
    relationshipSummary: '只与玩家存在眼前事务关系。',
    attitudeTowardPlayer: '根据当前情境保持警惕或敌意。',
    statusSummary: scenario.counterpart.publicIdentity,
    visibility: 'player_known',
    importance: 60
  });
  const currentSceneId = state.location.currentSceneId;
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: actor
    },
    scenes:
      currentSceneId && state.scenes[currentSceneId]
        ? {
            ...state.scenes,
            [currentSceneId]: {
              ...state.scenes[currentSceneId],
              presentActorIds: Array.from(
                new Set([
                  ...state.scenes[currentSceneId].presentActorIds,
                  actorId
                ])
              )
            }
          }
        : state.scenes
  };
}

function createScenarioState(scenario: ScenarioDefinition): RuntimeState {
  const state = createInitialRuntimeState({
    playerName: '周启明',
    englishName: 'Chow Kai-ming',
    age: 29,
    policeNumber: '2841',
    currentIdentity: 'police',
    policePostingId: 'mk_uniform_patrol',
    attributes: balancedAttributes,
    gameDifficulty: scenario.gameDifficulty,
    cantoneseFlavor: 'medium',
    openingPressure: 'routine',
    screenCharacterSeedsEnabled: false,
    personality: '谨慎、守程序，在现实压力下仍会主动处理问题。',
    appearance: '二十九岁香港男警员，神情专注。',
    traits: [
      {
        traitId: 'trait_street_sense',
        name: '街面观察经验',
        source: 'opening',
        description: '长期巡逻形成了辨认街面异常痕迹的经验。',
        effectSummary: '辨认街面风险、车辆和人员痕迹时可能提供帮助。',
        scopes: ['observation'],
        status: 'active',
        visibility: 'player_known'
      }
    ],
    lawIdentity: {
      stationOrPost: '旺角警署',
      department: '军装巡逻',
      rank: '警员',
      assignmentSummary: '在旺角警署执行当值、巡逻和现场处置。',
      authoritySummary: '可进行基层现场处置、盘问、记录和合理拘捕。',
      accessSummary: '可接触当前当值记录和警署公共工作区。',
      dutySummary: '保护现场人员，按程序记录并处置即时风险。'
    }
  });
  return seedCounterpart(state, scenario);
}

function auditedFetch(
  route: RouteChoice,
  scenario: ScenarioDefinition,
  audits: HttpAudit[]
): typeof fetch {
  return async (input, init) => {
    const startedAt = performance.now();
    const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
      (signal): signal is AbortSignal => Boolean(signal)
    );
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.any(signals)
      });
      audits.push({
        route: route.label,
        scenario: scenario.id,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt)
      });
      return response;
    } catch (error) {
      audits.push({
        route: route.label,
        scenario: scenario.id,
        status: null,
        durationMs: Math.round(performance.now() - startedAt),
        errorCategory: 'network_error'
      });
      throw error;
    }
  };
}

function createInvalidEffectiveTargetNarrator(
  narrator: NarratorClient,
  onInjected: () => void
): NarratorClient {
  return {
    configuredMaxTokens: narrator.configuredMaxTokens,
    async complete(input, options) {
      const value = await narrator.complete(input, options);
      if (options?.requestPurpose !== 'main_turn') return value;
      const cloned = structuredClone(value);
      if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned)) {
        return value;
      }
      const writeback = (cloned as { writeback?: unknown }).writeback;
      if (!writeback || typeof writeback !== 'object' || Array.isArray(writeback)) {
        return value;
      }
      const patches = (writeback as { judgementCheckPatches?: unknown })
        .judgementCheckPatches;
      if (!Array.isArray(patches) || patches.length === 0) return value;
      const firstPatch = patches[0];
      if (!firstPatch || typeof firstPatch !== 'object' || Array.isArray(firstPatch)) {
        return value;
      }
      (firstPatch as { effectiveTarget?: unknown }).effectiveTarget =
        'injected-invalid-effective-target';
      onInjected();
      return cloned;
    }
  };
}

function createIncompletePreflightNarrator(
  narrator: NarratorClient,
  onInjected: () => void
): NarratorClient {
  let injected = false;
  const inject = (value: unknown): unknown => {
    if (injected || !value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }
    const candidate = structuredClone(value) as Record<string, unknown>;
    if (candidate.hasJudgement !== true) return value;
    delete candidate.category;
    delete candidate.primaryAttribute;
    delete candidate.difficultyTier;
    injected = true;
    onInjected();
    return candidate;
  };
  return {
    configuredMaxTokens: narrator.configuredMaxTokens,
    async complete(input, options) {
      const value = await narrator.complete(input, options);
      return options?.requestPurpose === 'main_turn_judgement_preflight'
        ? inject(value)
        : value;
    },
    ...(narrator.completeDetailed
      ? {
          async completeDetailed(input, options) {
            const detailed = await narrator.completeDetailed!(input, options);
            return options?.requestPurpose ===
              'main_turn_judgement_preflight'
              ? {
                  ...detailed,
                  value: inject(detailed.value)
                }
              : detailed;
          }
        }
      : {})
  };
}

function createFactorProposalNarrator(
  narrator: NarratorClient,
  onInjected: () => void
): NarratorClient {
  let injected = false;
  const inject = (value: unknown): unknown => {
    if (injected || !value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }
    const candidate = structuredClone(value) as Record<string, unknown>;
    if (candidate.hasJudgement !== true) return value;
    candidate.factorProposals = [
      {
        sourceType: 'trait',
        sourceId: 'trait_street_sense',
        evidenceRef: {
          kind: 'trait',
          refId: 'trait_street_sense'
        },
        polarity: 'advantage',
        magnitude: 'minor',
        reason: '既有街面观察经验有助于辨认短暂可见的车辆痕迹。'
      },
      {
        sourceType: 'trait',
        sourceId: 'trait_street_sense',
        evidenceRef: {
          kind: 'trait',
          refId: 'trait_street_sense'
        },
        polarity: 'advantage',
        magnitude: 'minor',
        reason: '这条重复来源不得再次计入。'
      },
      {
        sourceType: 'equipment',
        sourceId: 'asset_not_equipped',
        evidenceRef: {
          kind: 'equipment',
          refId: 'asset_not_equipped'
        },
        polarity: 'advantage',
        magnitude: 'major',
        reason: '这件不存在且未装备的物品不得参与判定。'
      }
    ];
    injected = true;
    onInjected();
    return candidate;
  };
  return {
    configuredMaxTokens: narrator.configuredMaxTokens,
    async complete(input, options) {
      const value = await narrator.complete(input, options);
      return options?.requestPurpose === 'main_turn_judgement_preflight'
        ? inject(value)
        : value;
    },
    ...(narrator.completeDetailed
      ? {
          async completeDetailed(input, options) {
            const detailed = await narrator.completeDetailed!(input, options);
            return options?.requestPurpose ===
              'main_turn_judgement_preflight'
              ? {
                  ...detailed,
                  value: inject(detailed.value)
                }
              : detailed;
          }
        }
      : {})
  };
}

function summarizeRecoveryTrace(
  trace: JudgementRecoveryTrace | undefined
): ScenarioResult['recoveryTrace'] | undefined {
  if (!trace) return undefined;
  return {
    requestId: trace.requestId,
    turnId: trace.turnId,
    presetRoll: trace.presetRoll,
    persisted: trace.persisted,
    rawEffectiveTarget:
      (
        trace.rawJudgementPatches[0] as
          | { effectiveTarget?: unknown }
          | undefined
      )?.effectiveTarget,
    stages: trace.stages.map((stage) => `${stage.stage}:${stage.status}`)
  };
}

function failureCategory(
  error: unknown,
  scenarioAudits: readonly HttpAudit[]
): NonNullable<ScenarioResult['failure']>['category'] {
  const message = safeError(error).toLowerCase();
  if (scenarioAudits.some((audit) => audit.status === null)) {
    return 'network_error';
  }
  if (message.includes('超时') || message.includes('timeout')) {
    return 'request_timeout';
  }
  if (
    message.includes('本地判定合同') ||
    message.includes('judgement') ||
    message.includes('判定')
  ) {
    return 'contract_rejected';
  }
  if (
    message.includes('schema') ||
    message.includes('invalid') ||
    message.includes('写回')
  ) {
    return 'schema_validation';
  }
  if (
    message.includes('http') ||
    message.includes('provider') ||
    scenarioAudits.some(
      (audit) => audit.status !== null && (audit.status < 200 || audit.status >= 300)
    )
  ) {
    return 'provider_error';
  }
  return 'unexpected_result';
}

async function runScenario({
  settings,
  route,
  scenario,
  audits
}: {
  settings: AiSettings;
  route: RouteChoice;
  scenario: ScenarioDefinition;
  audits: HttpAudit[];
}): Promise<ScenarioResult> {
  const startedAt = performance.now();
  const httpStart = audits.length;
  const state = createScenarioState(scenario);
  const stages: TurnExecutionStage[] = [];
  const candidateStructures: CandidateStructureAudit[] = [];
  let invalidTargetWasInjected = false;
  let incompletePreflightWasInjected = false;
  let factorProposalsWereInjected = false;
  let latestRecoveryTrace: JudgementRecoveryTrace | undefined;

  try {
    const routeSettings = createRouteSettings(settings, route);
    const providerNarrator = createNarratorClientFromSettings(
      routeSettings,
      auditedFetch(route, scenario, audits)
    );
    let narrator = injectInvalidEffectiveTarget
      ? createInvalidEffectiveTargetNarrator(providerNarrator, () => {
          invalidTargetWasInjected = true;
        })
      : providerNarrator;
    if (injectIncompletePreflight) {
      narrator = createIncompletePreflightNarrator(narrator, () => {
        incompletePreflightWasInjected = true;
      });
    }
    if (injectFactorProposals) {
      narrator = createFactorProposalNarrator(narrator, () => {
        factorProposalsWereInjected = true;
      });
    }
    const next = await runPlayerTurn({
      state,
      playerInput: scenario.playerInput,
      narrator,
      judgementRoll: scenario.judgementRoll,
      enableJudgementPreflight: true,
      gameSettings: {
        ...createDefaultAiSettings().game,
        narrativeLengthLevel: 'brief',
        pregnancyMode: 'off',
        dramaticContent: {
          ...createDefaultAiSettings().game.dramaticContent,
          enabled: false
        }
      },
      onStageChange: (stage) => stages.push(stage),
      onJudgementRecoveryTrace: (trace) => {
        latestRecoveryTrace = trace;
      },
      onRawText: (rawText) =>
        candidateStructures.push(summarizeRawCandidate(rawText)),
      signal: AbortSignal.timeout(requestTimeoutMs * 3)
    });
    const savedAt = new Date().toISOString();
    const loadedRecord = parseRuntimeSaveRecord(
      JSON.parse(
        JSON.stringify({
          saveId: `save_real_judgement_${scenario.id}`,
          saveName: `Phase 12 ${scenario.id}`,
          saveKind: 'manual',
          createdAt: savedAt,
          updatedAt: savedAt,
          playerName: next.player.name,
          worldpackId: next.world.worldpackId,
          gameDateLabel: `${next.time.year}-${next.time.month}-${next.time.day}`,
          turnCounter: next.turnCounter,
          runtimeState: next
        })
      )
    );
    const loaded = loadedRecord.runtimeState;
    const saveRoundTrip =
      loaded.turnCounter === next.turnCounter &&
      loaded.storyLog.length === next.storyLog.length &&
      JSON.stringify(loaded.judgementChecks) ===
        JSON.stringify(next.judgementChecks) &&
      JSON.stringify(loaded.combatEvents) === JSON.stringify(next.combatEvents);

    const newChecks = Object.values(next.judgementChecks).filter(
      (check) => !state.judgementChecks[check.checkId]
    );
    const newCombats = Object.values(next.combatEvents).filter(
      (combat) => !state.combatEvents[combat.combatId]
    );
    const check = newChecks[0];
    const newStoryEntries = next.storyLog.slice(state.storyLog.length);
    const rejectedFactorCount = newStoryEntries.reduce(
      (total, entry) =>
        total +
        (entry.writebackDiagnostics ?? []).filter(
          (issue) => issue.code === 'judgement_evidence_rejected'
        ).length,
      0
    );
    const preflightAttemptCount =
      latestRecoveryTrace?.rawPreflightAttempts?.length ?? 0;
    const narrativeCorrectionStatus =
      latestRecoveryTrace?.stages.find(
        (stage) => stage.stage === 'narrative_correction'
      )?.status ?? 'none';
    const combatLinked =
      Boolean(check) &&
      newCombats.some((combat) =>
        combat.judgementCheckIds.includes(check.checkId)
      );
    const expectedCheckCount =
      scenario.expectedPrimaryAttribute === undefined ? 0 : 1;
    const violations: string[] = [];
    const preflightStageIndex = stages.indexOf('preflighting_judgement');
    const narrativeStageIndex = stages.indexOf('generating_narrative');
    const traceStages =
      latestRecoveryTrace?.stages.map((stage) => stage.stage) ?? [];
    const settledBeforeNarrative =
      preflightStageIndex >= 0 &&
      narrativeStageIndex >= 0 &&
      preflightStageIndex < narrativeStageIndex &&
      traceStages.includes('preflight_parse') &&
      traceStages.includes('evidence_validation') &&
      traceStages.includes('local_settlement');
    if (preflightStageIndex < 0) {
      violations.push('没有执行正文前判定预检。');
    }
    if (!settledBeforeNarrative) {
      violations.push('判定意图、证据核验和本地结算没有在正文生成前完成。');
    }
    if (stages.includes('regenerating_judgement')) {
      violations.push('判定问题触发了被禁止的整回合判定重生成。');
    }
    if (newChecks.length !== expectedCheckCount) {
      violations.push(
        `预期 ${expectedCheckCount} 次判定，实际 ${newChecks.length} 次。`
      );
    }
    if (
      scenario.expectedPrimaryAttribute &&
      check?.primaryAttribute !== scenario.expectedPrimaryAttribute
    ) {
      violations.push(
        `预期主属性 ${scenario.expectedPrimaryAttribute}，实际 ${check?.primaryAttribute ?? 'none'}。`
      );
    }
    if (check && check.rulesetVersion !== 'v1.1-local-d100') {
      violations.push(`规则版本错误：${check.rulesetVersion ?? 'none'}。`);
    }
    if (check && check.presetRoll !== scenario.judgementRoll) {
      violations.push(
        `预置骰错误：预期 ${scenario.judgementRoll}，实际 ${check.presetRoll ?? 'none'}。`
      );
    }
    if (check && check.gameDifficulty !== scenario.gameDifficulty) {
      violations.push(
        `存档难度错误：预期 ${scenario.gameDifficulty}，实际 ${check.gameDifficulty ?? 'none'}。`
      );
    }
    if (scenario.expectCombat && (newCombats.length === 0 || !combatLinked)) {
      violations.push('重大对抗没有创建并关联本回合判定。');
    }
    if (!scenario.expectCombat && newCombats.length > 0) {
      violations.push('非对抗场景意外创建了对抗记录。');
    }
    if (next.turnCounter !== state.turnCounter + 1) {
      violations.push('回合计数没有精确推进一次。');
    }
    if (!saveRoundTrip) {
      violations.push('判定或对抗记录没有通过存档 JSON 保存读取。');
    }
    if (
      injectInvalidEffectiveTarget &&
      scenario.expectedPrimaryAttribute &&
      !invalidTargetWasInjected
    ) {
      violations.push('没有在真实模型判定候选中注入非法 effectiveTarget。');
    }
    if (
      injectInvalidEffectiveTarget &&
      scenario.expectedPrimaryAttribute &&
      latestRecoveryTrace?.persisted !== true
    ) {
      violations.push('非法 effectiveTarget 恢复后没有形成已写入的本次请求诊断。');
    }
    if (
      injectIncompletePreflight &&
      scenario.expectedPrimaryAttribute &&
      !incompletePreflightWasInjected
    ) {
      violations.push('没有在真实判定预检中注入缺失的核心字段。');
    }
    if (
      injectIncompletePreflight &&
      scenario.expectedPrimaryAttribute &&
      preflightAttemptCount < 2
    ) {
      violations.push('缺失核心字段后没有执行一次小型判定预检修复。');
    }
    if (
      injectFactorProposals &&
      scenario.expectedPrimaryAttribute &&
      !factorProposalsWereInjected
    ) {
      violations.push('没有在真实判定预检中注入来源因素组合。');
    }
    if (
      injectFactorProposals &&
      scenario.expectedPrimaryAttribute &&
      !check?.factors.some(
        (factor) =>
          factor.sourceType === 'trait' &&
          factor.sourceId === 'trait_street_sense'
      )
    ) {
      violations.push('可核验的稳定特质来源没有进入最终目标值。');
    }
    if (
      injectFactorProposals &&
      scenario.expectedPrimaryAttribute &&
      (check?.factors.some(
        (factor) => factor.sourceId === 'asset_not_equipped'
      ) ||
        rejectedFactorCount < 2)
    ) {
      violations.push('虚构装备或重复来源没有被本地剔除并留下诊断。');
    }
    const summary: ScenarioSummary = {
      expectedPrimaryAttribute:
        scenario.expectedPrimaryAttribute ?? 'none',
      actualPrimaryAttribute: check?.primaryAttribute ?? 'none',
      rulesetVersion: check?.rulesetVersion ?? 'none',
      gameDifficulty: scenario.gameDifficulty,
      presetRoll: check?.presetRoll ?? 'none',
      effectiveTarget: check?.effectiveTarget ?? 'none',
      outcome: check?.outcome ?? 'none',
      difficultyTier: check?.difficultyTier ?? 'none',
      factorSourceTypes: check?.factors
        .map((factor) => factor.sourceType)
        .filter((value): value is string => Boolean(value)) ?? [],
      factorSourceIds: check?.factors
        .map((factor) => factor.sourceId)
        .filter((value): value is string => Boolean(value)) ?? [],
      rejectedFactorCount,
      preflightAttemptCount,
      narrativeCorrectionStatus,
      saveRoundTrip,
      judgementCount: newChecks.length,
      combatCount: newCombats.length,
      combatLinked,
      turnAdvanced: next.turnCounter === state.turnCounter + 1
    };
    if (violations.length > 0) {
      throw new ScenarioAuditError(violations.join('；'), summary);
    }

    const scenarioAudits = audits.slice(httpStart);
    return {
      route: route.label,
      profileName: route.profileName,
      model: route.model,
      scenario: scenario.id,
      title: scenario.title,
      accepted: true,
      durationMs: Math.round(performance.now() - startedAt),
      httpRequestCount: scenarioAudits.length,
      httpStatusCounts: countValues(
        scenarioAudits.map((audit) =>
          audit.status === null ? 'network_error' : String(audit.status)
        )
      ),
      preflightCalled: preflightStageIndex >= 0,
      settledBeforeNarrative,
      judgementRegenerated: stages.includes('regenerating_judgement'),
      invalidEffectiveTargetInjected: invalidTargetWasInjected,
      incompletePreflightInjected: incompletePreflightWasInjected,
      factorProposalsInjected: factorProposalsWereInjected,
      candidateStructures,
      ...(latestRecoveryTrace
        ? { recoveryTrace: summarizeRecoveryTrace(latestRecoveryTrace) }
        : {}),
      summary
    };
  } catch (error) {
    const scenarioAudits = audits.slice(httpStart);
    return {
      route: route.label,
      profileName: route.profileName,
      model: route.model,
      scenario: scenario.id,
      title: scenario.title,
      accepted: false,
      durationMs: Math.round(performance.now() - startedAt),
      httpRequestCount: scenarioAudits.length,
      httpStatusCounts: countValues(
        scenarioAudits.map((audit) =>
          audit.status === null ? 'network_error' : String(audit.status)
        )
      ),
      preflightCalled: stages.includes('preflighting_judgement'),
      settledBeforeNarrative:
        stages.indexOf('preflighting_judgement') >= 0 &&
        stages.indexOf('generating_narrative') >= 0 &&
        stages.indexOf('preflighting_judgement') <
          stages.indexOf('generating_narrative'),
      judgementRegenerated: stages.includes('regenerating_judgement'),
      invalidEffectiveTargetInjected: invalidTargetWasInjected,
      incompletePreflightInjected: incompletePreflightWasInjected,
      factorProposalsInjected: factorProposalsWereInjected,
      candidateStructures,
      ...(latestRecoveryTrace
        ? { recoveryTrace: summarizeRecoveryTrace(latestRecoveryTrace) }
        : {}),
      ...(error instanceof ScenarioAuditError
        ? { summary: error.summary }
        : {}),
      failure: {
        errorName: error instanceof Error ? error.name : typeof error,
        category: failureCategory(error, scenarioAudits),
        message: safeError(error)
      }
    };
  }
}

describe.skipIf(!shouldRun)(
  'local judgement V2 preflight through real APIs',
  () => {
    it(
      'covers six attributes, a no-check control and a linked combat across fast models',
      async () => {
        const settings = importApiSettings(
          createDefaultAiSettings(),
          await readFile(settingsPath, 'utf8')
        );
        const { activeRoutes, activeScenarios, isFullMatrix } = activeMatrix();
        activeRoutes.forEach((route) => requireRoute(settings, route));

        const audits: HttpAudit[] = [];
        const results: ScenarioResult[] = [];
        for (const route of activeRoutes) {
          for (const scenario of activeScenarios.filter(
            (item) => item.routeId === route.id
          )) {
            const result = await runScenario({
              settings,
              route,
              scenario,
              audits
            });
            results.push(result);
            process.stdout.write(
              `[local-judgement-real] route=${route.label} scenario=${scenario.id} accepted=${result.accepted} requests=${result.httpRequestCount} regenerated=${result.judgementRegenerated}\n`
            );
          }
        }

        const failed = results.filter((result) => !result.accepted);
        const summaries = results
          .map((result) => result.summary)
          .filter((summary): summary is ScenarioSummary => Boolean(summary));
        const coverage = {
          primaryAttributes: Array.from(
            new Set(
              summaries
                .map((summary) => summary.actualPrimaryAttribute)
                .filter((value) => value !== 'none')
            )
          ).sort(),
          gameDifficulties: Array.from(
            new Set(summaries.map((summary) => summary.gameDifficulty))
          ).sort(),
          sceneDifficultyTiers: Array.from(
            new Set(
              summaries
                .map((summary) => summary.difficultyTier)
                .filter((value) => value !== 'none')
            )
          ).sort(),
          outcomes: Array.from(
            new Set(
              summaries
                .map((summary) => summary.outcome)
                .filter((value) => value !== 'none')
            )
          ).sort(),
          factorSourceTypes: Array.from(
            new Set(summaries.flatMap((summary) => summary.factorSourceTypes))
          ).sort(),
          acceptedFactorCount: summaries.reduce(
            (total, summary) => total + summary.factorSourceTypes.length,
            0
          ),
          rejectedFactorCount: summaries.reduce(
            (total, summary) => total + summary.rejectedFactorCount,
            0
          ),
          noCheckAccepted: results.some(
            (result) =>
              result.scenario === 'safe_copy_register' &&
              result.accepted &&
              result.summary?.judgementCount === 0
          ),
          combatLinked: results.some(
            (result) =>
              result.scenario === 'combat_armed_restraint' &&
              result.accepted &&
              result.summary?.combatLinked
          ),
          preflightRepairApplied: results.some(
            (result) =>
              result.incompletePreflightInjected &&
              (result.summary?.preflightAttemptCount ?? 0) >= 2
          ),
          narrativeCorrectionApplied: summaries.some(
            (summary) =>
              summary.narrativeCorrectionStatus === 'succeeded'
          ),
          saveRoundTripsPassed: summaries.every(
            (summary) => summary.saveRoundTrip
          )
        };
        const coverageFailures: string[] = [];
        if (isFullMatrix) {
          const requiredAttributes: AttributeKey[] = [
            'body',
            'action',
            'perception',
            'thinking',
            'negotiation',
            'will'
          ];
          const requiredDifficulties: GameDifficultyLevel[] = [
            'story',
            'easy',
            'standard',
            'hard',
            'brutal'
          ];
          if (
            !requiredAttributes.every((attribute) =>
              coverage.primaryAttributes.includes(attribute)
            )
          ) {
            coverageFailures.push('真实矩阵没有覆盖全部六维属性。');
          }
          if (
            !requiredDifficulties.every((difficulty) =>
              coverage.gameDifficulties.includes(difficulty)
            )
          ) {
            coverageFailures.push('真实矩阵没有覆盖全部五档存档难度。');
          }
          if (!coverage.noCheckAccepted) {
            coverageFailures.push('真实矩阵的无判定控制场景没有通过。');
          }
          if (!coverage.combatLinked) {
            coverageFailures.push('真实矩阵没有通过重大对抗绑定。');
          }
          if (results.some((result) => !result.preflightCalled)) {
            coverageFailures.push('真实矩阵存在未执行判定预检的场景。');
          }
          if (results.some((result) => result.judgementRegenerated)) {
            coverageFailures.push('真实矩阵触发了被禁止的整回合判定重生成。');
          }
          if (!coverage.saveRoundTripsPassed) {
            coverageFailures.push('真实矩阵存在存档保存读取不一致。');
          }
        }
        const report = {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          test: 'local-judgement-v2-preflight-real-api-matrix',
          accepted: failed.length === 0 && coverageFailures.length === 0,
          credentialSafety: {
            keyValuesRecorded: false,
            baseUrlsRecorded: false,
            rawPromptsRecorded: false,
            rawResponsesRecorded: false,
            narrativeTextRecorded: false
          },
          routeCount: activeRoutes.length,
          scenarioCount: results.length,
          passedScenarioCount: results.length - failed.length,
          failedScenarioCount: failed.length,
          coverage,
          coverageFailures,
          http: {
            requestCount: audits.length,
            statusCounts: countValues(
              audits.map((audit) =>
                audit.status === null
                  ? 'network_error'
                  : String(audit.status)
              )
            ),
            durationMs: audits.map((audit) => audit.durationMs)
          },
          results
        };
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(
          outputPath,
          `${JSON.stringify(report, null, 2)}\n`,
          'utf8'
        );

        expect([
          ...failed.map((result) => ({
            route: result.route,
            scenario: result.scenario,
            failure: result.failure
          })),
          ...coverageFailures.map((failure) => ({ coverage: failure }))
        ]).toEqual([]);
      },
      14_400_000
    );
  }
);
