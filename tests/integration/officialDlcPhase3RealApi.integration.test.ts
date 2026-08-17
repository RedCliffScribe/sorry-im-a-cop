import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAuxiliaryGenerationClientFromSettings } from '../../src/domain/news/createAuxiliaryGenerationClientFromSettings';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { createInitialRuntimeState, type OpeningSetup } from '../../src/domain/runtime/initialState';
import type { CurrentIdentity, RuntimeState } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import { fetchAvailableModels } from '../../src/domain/settings/modelCatalog';
import type { AiSettings, ApiProfile } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import { defaultDramaticContentSettings } from '../../src/domain/drama/settings';
import { narrativeArcInstanceIdForArcKey } from '../../src/domain/drama/narrativeArc';
import type {
  DramaExecutionReceipt,
  NarrativeArcInstance,
  NarrativeArcProgressValidationDiagnostic
} from '../../src/domain/drama/types';
import type { OfficialDlcDramaAuditRecord } from '../../src/domain/dlc/dramaAudit';
import {
  urbanLegendsFormalIds,
  urbanLegendsFormalManifest
} from '../../src/domain/dlc/urbanLegends/content';
import { urbanLegendsFormalSourceRef } from '../../src/domain/dlc/urbanLegends/stagePayload';
import { installOfficialDlcPhase3CandidateProvider } from '../helpers/officialDlcPhase3Candidate';

const shouldRun = process.env.COPV2_RUN_OFFICIAL_DLC_PHASE3_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const outputPath = path.resolve(
  process.env.COPV2_OFFICIAL_DLC_PHASE3_OUTPUT_PATH ??
    path.join('output', 'official-dlc-phase3', 'latest.json')
);
const turnsPerIdentity = Math.min(
  40,
  Math.max(6, Number(process.env.COPV2_OFFICIAL_DLC_PHASE3_TURNS ?? 8))
);
const resolutionMode = process.env.COPV2_OFFICIAL_DLC_PHASE3_RESOLUTION_MODE === 'ambiguous'
  ? 'ambiguous'
  : 'realist';
const requireCompletion = process.env.COPV2_OFFICIAL_DLC_PHASE3_REQUIRE_COMPLETION === '1';
const requireStageOneToTwo =
  process.env.COPV2_OFFICIAL_DLC_PHASE3_REQUIRE_STAGE_ONE_TO_TWO !== '0';
type StartStageMode = 'fresh' | 'first_clues' | 'truth_investigation';
const requestedStartStage = process.env.COPV2_OFFICIAL_DLC_PHASE3_START_STAGE;
const startStageMode: StartStageMode =
  requestedStartStage === 'first_clues' || requestedStartStage === 'truth_investigation'
    ? requestedStartStage
    : 'fresh';
const postCompletionTurnsRequired = Math.min(
  4,
  Math.max(0, Number(process.env.COPV2_OFFICIAL_DLC_PHASE3_POST_COMPLETION_TURNS ?? 0))
);
const checkpointPath = process.env.COPV2_OFFICIAL_DLC_PHASE3_CHECKPOINT_PATH
  ? path.resolve(process.env.COPV2_OFFICIAL_DLC_PHASE3_CHECKPOINT_PATH)
  : undefined;
const preferredRouteProfile = process.env.COPV2_OFFICIAL_DLC_PHASE3_ROUTE_PROFILE?.trim();
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_OFFICIAL_DLC_PHASE3_REQUEST_TIMEOUT_MS ?? 300_000)
);
const catalogTimeoutMs = Math.max(
  10_000,
  Number(process.env.COPV2_OFFICIAL_DLC_PHASE3_CATALOG_TIMEOUT_MS ?? 30_000)
);
const maxAttempts = Math.min(
  8,
  Math.max(2, Number(process.env.COPV2_OFFICIAL_DLC_PHASE3_MAX_ATTEMPTS ?? 6))
);
const supportedIdentities: readonly CurrentIdentity[] = ['police', 'civilian', 'gang_member'];
const requestedIdentities = (process.env.COPV2_OFFICIAL_DLC_PHASE3_IDENTITIES ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value): value is CurrentIdentity =>
    supportedIdentities.includes(value as CurrentIdentity)
  );
const scenarioIdentities: readonly CurrentIdentity[] =
  requestedIdentities.length > 0 ? [...new Set(requestedIdentities)] : supportedIdentities;
const retryDelayMs = Math.max(
  0,
  Number(process.env.COPV2_OFFICIAL_DLC_PHASE3_RETRY_DELAY_MS ?? 1_500)
);

interface LiveRoute {
  profile: ApiProfile;
  model: string;
  label: string;
  discoveredModelCount: number;
}

interface RouteDiscoveryAudit {
  profile: string;
  catalogFetched: boolean;
  discoveredModelCount: number;
  selectedModel?: string;
  failure?: string;
}

type ActionKind =
  | 'natural_entry'
  | 'grounded_followup'
  | 'ordinary_ignore'
  | 'paused_ordinary_turn'
  | 'obstruction_attempt'
  | 'post_completion_observation';

interface RuntimeCounts {
  actors: number;
  matters: number;
  signals: number;
  news: number;
  relationships: number;
  cases: number;
}

interface TurnAudit {
  identity: CurrentIdentity;
  turnCounter: number;
  route: string;
  actionKind: ActionKind;
  pausedDuringTurn: boolean;
  beforeStageId?: string;
  afterStageId?: string;
  afterArcStatus?: NarrativeArcInstance['status'];
  arcInstanceId?: string;
  formalArcCount: number;
  planningRoute?: string;
  officialDlcSelected: boolean;
  officialDlcExecuted: boolean;
  traceStatus?: string;
  persistentWriteCount: number;
  progress: Array<{
    decision?: string;
    accepted: boolean;
    requestedNextStageId?: string;
    rejectionReasons: string[];
  }>;
  sourceAudit: {
    generated: boolean;
    projected: boolean;
    inPlanningContext: boolean;
    selected: boolean;
    executed: boolean;
    omittedReasons: string[];
  };
  runtimeBefore: RuntimeCounts;
  runtimeAfter: RuntimeCounts;
  tokens: {
    input: number;
    output: number;
    calls: number;
  };
  objectiveSupernaturalConfirmation: boolean;
}

interface ScenarioAudit {
  identity: CurrentIdentity;
  targetTurns: number;
  completedTurns: number;
  finalArcId?: string;
  finalStageId?: string;
  finalArcStatus?: NarrativeArcInstance['status'];
  formalArcCount: number;
  pauseResumeChecked: boolean;
  pauseResumePassed: boolean;
  routeLabels: string[];
  turns: TurnAudit[];
}

interface Phase3Checkpoint {
  schemaVersion: 'official-dlc-phase3-checkpoint-v1';
  identity: CurrentIdentity;
  resolutionMode: 'realist' | 'ambiguous';
  startStageMode: StartStageMode;
  postCompletionTurnsRequired: number;
  targetTurns: number;
  nextTurnIndex: number;
  state: RuntimeState;
  turnAudits: TurnAudit[];
  pauseResumeChecked: boolean;
  pauseResumePassed: boolean;
  routeSuccesses: Array<[string, number]>;
  routeFailures: Array<{ route: string; operation: string; error: string }>;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9._-]{8,}\b/gi, '[REDACTED]')
    .replace(/[?&]key=[^&\s]+/gi, '?key=[REDACTED]')
    .slice(0, 500);
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function trace(message: string): void {
  process.stdout.write(`[official-dlc-phase3] ${message}\n`);
}

async function readCheckpoint(identity: CurrentIdentity): Promise<Phase3Checkpoint | undefined> {
  if (!checkpointPath) return undefined;
  let raw: string;
  try {
    raw = await readFile(checkpointPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const parsed = JSON.parse(raw) as Partial<Phase3Checkpoint>;
  if (
    parsed.schemaVersion !== 'official-dlc-phase3-checkpoint-v1' ||
    parsed.identity !== identity ||
    parsed.resolutionMode !== resolutionMode ||
    parsed.startStageMode !== startStageMode ||
    parsed.postCompletionTurnsRequired !== postCompletionTurnsRequired ||
    parsed.targetTurns !== turnsPerIdentity ||
    !Number.isInteger(parsed.nextTurnIndex) ||
    !parsed.state ||
    !Array.isArray(parsed.turnAudits) ||
    !Array.isArray(parsed.routeSuccesses) ||
    !Array.isArray(parsed.routeFailures)
  ) {
    throw new Error('Phase 3 检查点与当前身份、收束模式或目标回合不匹配。');
  }
  return parsed as Phase3Checkpoint;
}

async function writeCheckpoint(checkpoint: Phase3Checkpoint): Promise<void> {
  if (!checkpointPath) return;
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  const temporaryPath = `${checkpointPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, checkpointPath);
}

function withTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
    (signal): signal is AbortSignal => Boolean(signal)
  );
  return fetch(input, {
    ...init,
    signal: AbortSignal.any(signals)
  });
}

function withCatalogTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signals = [init?.signal, AbortSignal.timeout(catalogTimeoutMs)].filter(
    (signal): signal is AbortSignal => Boolean(signal)
  );
  return fetch(input, {
    ...init,
    signal: AbortSignal.any(signals)
  });
}

function preferredModels(profileName: string): string[] {
  const normalized = profileName.toLowerCase();
  if (normalized.includes('tianbohe')) {
    return ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.1-pro-preview'];
  }
  if (normalized.includes('yuqing')) {
    return [
      '企业cli-gemini-3.1-pro-preview',
      '企业cli-gemini-3-flash-preview',
      '企业cli-gemini-2.5-flash',
      'gemini-2.5-flash',
      'gemini-2.5-pro'
    ];
  }
  return [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3.1-pro-preview',
    'deepseek-chat'
  ];
}

function selectDiscoveredModel(profileName: string, models: string[]): string | undefined {
  const preferred = preferredModels(profileName);
  for (const candidate of preferred) {
    const exact = models.find((model) => model.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
  }
  for (const candidate of preferred) {
    const partial = models.find((model) =>
      model.toLowerCase().includes(candidate.toLowerCase())
    );
    if (partial) return partial;
  }
  return models.find((model) => /gemini|deepseek|qwen/i.test(model));
}

async function discoverRoutes(settings: AiSettings): Promise<{
  routes: LiveRoute[];
  audits: RouteDiscoveryAudit[];
}> {
  const profilePriority = ['tianbohe', 'yuqing', 'ggchan', 'nanaaa', 'moe'];
  const candidates = profilePriority.flatMap((name) => {
    const profile = settings.apiProfiles.find((item) =>
      item.name.toLowerCase().includes(name)
    );
    return profile ? [profile] : [];
  });
  const uniqueProfiles = [...new Map(candidates.map((profile) => [profile.id, profile])).values()]
    .filter(
      (profile) =>
        profile.interfaceType !== 'siliconflow' &&
        !/silicon|硅基|xiaomi|mimo/i.test(`${profile.name} ${profile.providerLabel}`)
    );
  const routes: LiveRoute[] = [];
  const audits: RouteDiscoveryAudit[] = [];

  for (const profile of uniqueProfiles) {
    trace(`catalog:start profile=${profile.name}`);
    try {
      const models = await fetchAvailableModels({
        interfaceType: profile.interfaceType,
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        fetchImpl: withCatalogTimeout
      });
      const model = selectDiscoveredModel(profile.name, models);
      audits.push({
        profile: profile.name,
        catalogFetched: true,
        discoveredModelCount: models.length,
        ...(model ? { selectedModel: model } : {})
      });
      if (model) {
        routes.push({
          profile,
          model,
          label: `${profile.name}/${model}`,
          discoveredModelCount: models.length
        });
      }
      trace(
        `catalog:success profile=${profile.name} models=${models.length} selected=${model ?? 'none'}`
      );
    } catch (error) {
      audits.push({
        profile: profile.name,
        catalogFetched: false,
        discoveredModelCount: 0,
        failure: safeError(error)
      });
      trace(`catalog:failed profile=${profile.name} error=${safeError(error)}`);
    }
  }
  return { routes, audits };
}

function dramaSettings() {
  return {
    ...defaultDramaticContentSettings,
    channels: { ...defaultDramaticContentSettings.channels }
  };
}

function settingsForRoute(source: AiSettings, route: LiveRoute): AiSettings {
  return {
    ...source,
    mainNarrator: {
      apiProfileId: route.profile.id,
      model: route.model,
      maxTokensMode: 'custom',
      maxTokens: 32768,
      temperature: 0.35
    },
    featureRoutes: {
      ...source.featureRoutes,
      writebackRepair: { mode: 'follow-main' },
      memorySummary: { mode: 'disabled' },
      memoryVector: { mode: 'disabled' },
      npcSimulation: { mode: 'disabled' },
      backgroundEvolution: { mode: 'disabled' },
      auxiliaryGeneration: {
        mode: 'custom',
        apiProfileId: route.profile.id,
        model: route.model,
        maxTokens: 8192,
        temperature: 0.2
      }
    },
    game: {
      ...source.game,
      narrativeLengthLevel: 'compact',
      dramaticContent: dramaSettings()
    }
  };
}

function setupFor(identity: CurrentIdentity): OpeningSetup {
  const common: OpeningSetup = {
    playerName:
      identity === 'police' ? '周启明' : identity === 'gang_member' ? '陈家荣' : '李嘉慧',
    englishName:
      identity === 'police' ? 'Michael Chow' : identity === 'gang_member' ? 'Ka-wing Chan' : 'Karen Lee',
    gender: identity === 'civilian' ? 'female' : 'male',
    age: identity === 'police' ? 29 : identity === 'gang_member' ? 31 : 27,
    currentIdentity: identity,
    personality: '谨慎观察现实反应，不会无缘无故把传闻当成确定事实。',
    appearance: '衣着和气质符合1988年香港的当前职业与生活环境。',
    startTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: identity === 'police' ? 22 : identity === 'gang_member' ? 21 : 20,
      minute: 0
    },
    openingPressure: 'routine',
    storypackInfluence: 'low',
    screenCharacterSeedsEnabled: false
  };
  if (identity === 'police') {
    return {
      ...common,
      policeNumber: '18427',
      policePostingId: 'mong_kok_police_station',
      lawIdentity: {
        stationOrPost: '旺角警署',
        department: '军装巡逻',
        rank: '警员',
        assignmentSummary: '负责本更夜间巡逻与一般现场初动。',
        authoritySummary: '可处理本区一般报案并按程序查询值班资料。',
        accessSummary: '可接触本更电台调派和一般报案记录。',
        dutySummary: '巡逻、一般紧急响应、报告与交接。'
      }
    };
  }
  if (identity === 'gang_member') {
    return {
      ...common,
      triadProfileId: 'wo_shing_wo_temple_street',
      triadSocietyId: 'org_wo_shing_wo',
      triadTerritoryPlaceId: 'place_temple_street',
      triadRankId: 'ordinary_member'
    };
  }
  return { ...common, civilianProfileId: 'tea_restaurant_clerk' };
}

function createScenarioState(identity: CurrentIdentity): RuntimeState {
  const state = createInitialRuntimeState(setupFor(identity));
  state.world.worldpackId = 'hk_1988';
  state.world.officialDlcBindings = [{
    dlcId: urbanLegendsFormalManifest.dlcId,
    version: urbanLegendsFormalManifest.version,
    status: 'active',
    activatedAt: '2026-08-06T00:00:00.000Z'
  }];
  state.dramaticContent = {
    ...(state.dramaticContent ?? { instances: [], recentDiagnostics: [] }),
    settings: dramaSettings()
  };
  if (startStageMode !== 'fresh') {
    const signalId = 'signal_official_dlc_urban_legends_phase3d_timing_conflict';
    state.dynamicEvents.signals[signalId] = {
      id: signalId,
      title: '末班车时间记录矛盾',
      summary: '司机证词称零时十分离站，纸本更表却记录零时二十五分；差异已由两个独立来源核对，但原因仍未确认。',
      signalType: identity === 'police' ? 'police' : 'rumor',
      reliability: 'medium',
      status: 'active',
      visibility: 'known',
      relatedActorIds: [urbanLegendsFormalIds.actors.driver],
      relatedPlaceIds: [urbanLegendsFormalIds.places.terminal],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };
    const resolutionSignalId = 'signal_official_dlc_urban_legends_phase3d_public_account';
    if (startStageMode === 'truth_investigation') {
      state.dynamicEvents.signals[resolutionSignalId] = {
        id: resolutionSignalId,
        title: '报道修订与记录缺页',
        summary: '报馆已确认早版标题夸大二手说法并作修订；运输机构确认更表副本曾在交班后补写，但原始页仍缺失，补写者与目的尚未查明。',
        signalType: identity === 'police' ? 'police' : 'rumor',
        reliability: 'high',
        status: 'active',
        visibility: 'known',
        relatedActorIds: [
          urbanLegendsFormalIds.actors.dispatcher,
          urbanLegendsFormalIds.actors.reporter,
          urbanLegendsFormalIds.actors.relative
        ],
        relatedPlaceIds: [urbanLegendsFormalIds.places.terminal],
        relatedCaseIds: [],
        relatedOrganizationIds: [],
        createdAt: state.time,
        updatedAt: state.time
      };
    }
    const seededAtTruthInvestigation = startStageMode === 'truth_investigation';
    state.narrativeArcs = [{
      arcInstanceId: narrativeArcInstanceIdForArcKey(urbanLegendsFormalIds.arcKey),
      sourceRef: { ...urbanLegendsFormalSourceRef },
      arcType: 'official_dlc',
      status: 'active',
      currentStageId: seededAtTruthInvestigation
        ? urbanLegendsFormalIds.stages.truthInvestigation
        : urbanLegendsFormalIds.stages.firstClues,
      previousStageId: seededAtTruthInvestigation
        ? urbanLegendsFormalIds.stages.interestConflict
        : urbanLegendsFormalIds.stages.streetRumor,
      usedNodeIds: seededAtTruthInvestigation
        ? [
            identity === 'police'
              ? urbanLegendsFormalIds.nodes.reportedMissingPassenger
              : identity === 'civilian'
                ? urbanLegendsFormalIds.nodes.neighborhoodRumor
                : urbanLegendsFormalIds.nodes.routeBusinessRumor,
            urbanLegendsFormalIds.nodes.driverTestimony,
            urbanLegendsFormalIds.nodes.oldRouteRecords,
            urbanLegendsFormalIds.nodes.contradictoryWitness,
            urbanLegendsFormalIds.nodes.pressExaggeration,
            urbanLegendsFormalIds.nodes.internalDisagreement,
            urbanLegendsFormalIds.nodes.timelineReconstruction
          ]
        : [
            identity === 'police'
              ? urbanLegendsFormalIds.nodes.reportedMissingPassenger
              : identity === 'civilian'
                ? urbanLegendsFormalIds.nodes.neighborhoodRumor
                : urbanLegendsFormalIds.nodes.routeBusinessRumor
          ],
      createdTurn: 0,
      lastProgressTurn: 0,
      writebackRefs: [
        { kind: 'signal', id: signalId },
        ...(seededAtTruthInvestigation
          ? [{ kind: 'signal' as const, id: resolutionSignalId }]
          : [])
      ],
      lastSummary: seededAtTruthInvestigation
        ? '已确认报纸早版夸大二手说法并修订，也确认更表副本在交班后补写；原始页、补写者及失踪者最终去向仍无法核实，现有证据不支持把鬼怪写成客观事实。'
        : '两个独立来源已经确认司机口述与纸本更表存在具体时间差，原因和受益者仍未查明。'
    }];
  }
  return state;
}

function isFormalArc(arc: NarrativeArcInstance): boolean {
  const ref = arc.sourceRef as NarrativeArcInstance['sourceRef'] & { dlcId?: string };
  return ref.providerId === 'official-dlc' && ref.dlcId === urbanLegendsFormalManifest.dlcId;
}

function formalArcs(state: RuntimeState): NarrativeArcInstance[] {
  return (state.narrativeArcs ?? []).filter(isFormalArc);
}

function latestNarratorEntry(state: RuntimeState) {
  return [...state.storyLog].reverse().find((entry) => entry.speaker === 'narrator');
}

function runtimeCounts(state: RuntimeState): RuntimeCounts {
  return {
    actors: Object.keys(state.actors).length,
    matters: Object.keys(state.dynamicEvents.currentMatters).length,
    signals: Object.keys(state.dynamicEvents.signals).length,
    news: Object.keys(state.dynamicEvents.newsIssues).length,
    relationships: Object.keys(state.relationshipThreads).length,
    cases: Object.keys(state.cases).length
  };
}

function actionFor(
  identity: CurrentIdentity,
  turnIndex: number,
  currentStageId: string | undefined,
  currentArcStatus: NarrativeArcInstance['status'] | undefined,
  paused: boolean
): { kind: ActionKind; text: string } {
  if (currentArcStatus === 'completed') {
    return {
      kind: 'post_completion_observation',
      text:
        identity === 'police'
          ? '继续正常值班，只按已经成立的记录处理新情况，不把已经收束的末班车事件重新当成一宗新案。'
          : identity === 'civilian'
            ? '继续自己的工作和生活，只观察相关人物与街坊后来怎样谈起此事，不主动把旧传闻重新炒成新事件。'
            : '继续处理原有生意与人情，只留意这件事留下的现实余波，不把已经收束的风声重新包装成新一轮行动。'
    };
  }
  if (paused || turnIndex === 4) {
    return {
      kind: paused ? 'paused_ordinary_turn' : 'ordinary_ignore',
      text:
        identity === 'police'
          ? '把注意力放回本更普通巡逻、交接和街面秩序，不主动追查先前听到的传闻。'
          : identity === 'civilian'
            ? '照常完成工作、吃饭和回家安排，不主动追问先前听到的街坊传闻。'
            : '先处理原有地盘杂务和熟人往来，不主动扩大先前听到的风声。'
    };
  }
  if (turnIndex === 6) {
    return {
      kind: 'obstruction_attempt',
      text:
        identity === 'police'
          ? '按自己的职级尝试核对相关值班与报案记录；若无权限或资料不足，就如实记下受阻，不越权强取。'
          : identity === 'civilian'
            ? '向愿意开口的熟人核对具体时间；如果对方不愿说或记不清，就接受受阻，不强迫对方。'
            : '通过可靠熟人核实消息是否被人利用；若没有可信渠道，就停止施压并保留疑问。'
    };
  }
  if (!currentStageId) {
    const entries =
      identity === 'police'
        ? [
            '继续今晚的普通巡逻，留意电台、同僚和街面是否有需要按程序处理的夜间情况。',
            '在交接时随口问问最近夜间交通和晚归市民有没有反复出现但尚未证实的普通投诉。'
          ]
        : identity === 'civilian'
          ? [
              '照常在茶餐厅工作，和夜班熟客自然聊天，听听附近最近有什么影响生活的消息。',
              '收工前留意街坊和夜班司机谈到的晚归交通，但不把闲谈当成事实。'
            ]
          : [
              '照常查看夜间生意和街面情况，问问熟人最近有没有影响人流、但真假未明的消息。',
              '与地盘上的成员正常交流，判断近期夜班交通传闻是否真的影响生意，不急着下结论。'
            ];
    return { kind: 'natural_entry', text: entries[turnIndex % entries.length]! };
  }

  const stageActions: Partial<Record<string, Record<CurrentIdentity, string[]>>> = {
    [urbanLegendsFormalIds.stages.streetRumor]: {
      police: [
        '分别向最先报出消息的人和一名夜班司机核对具体日期、时间与上落客地点，把亲眼所见和转述分开记录。',
        '在权限内查看当天报案簿、值班记录和路线资料，只比较能确认的时间差，不把缺页本身当成阴谋。',
        '带着已经记录的两份说法再问相关人员，确认哪一项矛盾能够继续核实，并把现实影响按程序留下记录。'
      ],
      civilian: [
        '先找一位真正认识夜班司机的熟客，单独问清他亲眼见过的日期、时间和上落客地点，不把猜测混进记录。',
        '再向另一位互不相干的夜班熟客核对同一晚的收工时间和末班车去向，把两份说法中能实际比较的差异记下来。',
        '从自己的茶餐厅更表、结账时间和通勤经历核对传闻中的时间线；若与两位熟客说法冲突，就只保留可确认的具体差异。',
        '在不侵犯当事人隐私的前提下，向相关司机或家属核对那项具体时间差，并留意这件事是否已经影响他们的工作或生活。'
      ],
      gang_member: [
        '分别向两个互不依赖的街面熟人核对末班车传闻的时间、地点和实际人流变化，不把组织猜测当事实。',
        '询问真正接触夜班司机的人，并对照当晚生意记录，确认是否有人因为传闻获得实际利益或受到损失。',
        '把已知说法中的具体矛盾交给可靠渠道再核实；没有证据就保留疑问，不先动用暴力。'
      ]
    },
    [urbanLegendsFormalIds.stages.firstClues]: {
      police: [
        '把司机证词、纸本更表和报案时间逐项对照，标出无法同时成立的一处差异，并确认谁有权限接触或补写记录。',
        '分别询问司机、站务和家属为何希望某个版本被采信，记录他们实际承担的工作、名誉或程序风险。',
        '只用已经取得的证据检验是否有人压下、放大或利用某种说法；若形成现实后果，就按权限决定记录、移交或公开。'
      ],
      civilian: [
        '把熟客证词、自己的更表与公开报道逐项比较，找出一处无法同时成立的时间或地点差异。',
        '分别问当事人和记者为什么希望某种说法被相信，尊重拒绝回答，同时记录已经发生的工作、家庭或名誉影响。',
        '根据已经能确认的记录决定把哪部分事实交给家属或警方，哪部分仍只是传闻，并承担这项选择带来的关系后果。'
      ],
      gang_member: [
        '把街面口述、夜间生意记录和司机来往逐项对照，找出谁因某个版本获得可核对的利益或损失。',
        '向不同立场的人分别核实是否有人压下或利用消息，区分个人行动与整个组织，不用猜测代替证据。',
        '用已确认事实决定是阻止利用传闻、公开部分消息还是退出，并让该选择产生现实的人情或生意后果。'
      ]
    },
    [urbanLegendsFormalIds.stages.interestConflict]: {
      police: [
        '把机构程序、家属诉求和媒体口径分开处理，要求每一方说明其现实利益，并记录一个会改变调查或公开路径的具体决定。',
        '面对要求压下或放大消息的人，只依据现有证据选择移交、继续核实或公开程序事实，同时承担上级与公众关系后果。',
        '保存关键记录并让相关人物对自己的选择负责，确认哪套现实解释已经具备可系统检验的路径。'
      ],
      civilian: [
        '在家属隐私、记者报道和街坊猜测之间作出明确选择，只公开可确认部分，并面对因此变化的人际与工作关系。',
        '询问谁正在因传闻获利或受损，让对方的实际行动与代价进入记录，而不是只争论真假。',
        '保护一项可靠证据并决定交给谁，使事件无法再维持原来的模糊公开叙述。'
      ],
      gang_member: [
        '要求利用传闻的人说明实际目的和代价，区分个人行为与组织立场，并决定是否阻止、交易或公开。',
        '面对警方、记者和内部成员的不同压力，只用已确认事实作出会影响生意或人情的选择。',
        '保住一项可核对记录并让采取不可逆行动的人承担后果，确认下一步应检验的现实解释。'
      ]
    },
    [urbanLegendsFormalIds.stages.truthInvestigation]: {
      police: [
        '并列检验记录失误、有人隐瞒和自主离开等现实解释，只确认证据真正支持的部分，并形成自己权限内可执行的处理意见。',
        '把可确认事实、人物信念和仍无法解释的残余分开写明，决定正式移交、公开程序结论或停止继续调查。',
        resolutionMode === 'realist'
          ? '依据现有记录采取一个现实可执行的结论和后续措施，同时明确它不能解释的少量残余，不让旁白宣布鬼怪。'
          : '只对已经确认的行为采取措施，对互相冲突且无法继续验证的细节保留开放结论，不把任何信念提升为客观超自然事实。'
      ],
      civilian: [
        '并列比较误认、记忆污染、有人隐瞒和当事人自主选择等解释，只把能证实的行动告诉家属或有关人员。',
        '决定公开、移交或停止追问，并清楚区分自己的判断、他人的信念与仍无法核实的细节。',
        resolutionMode === 'realist'
          ? '根据现实记录作出足以行动的结论，帮助当事人处理后果，同时承认仍有一处细节无法完全解释。'
          : '不替任何人宣布唯一真相，只公开已确认部分，让互相冲突但具体的残余继续保持未决。'
      ],
      gang_member: [
        '检验有人借传闻谋利、普通误会和消息污染等解释，只根据可确认行动处理组织与街面的现实后果。',
        '决定公开、交易、移交或停止介入，并把事实、内部猜测与仍无法核实的残余分开。',
        resolutionMode === 'realist'
          ? '依据现实证据处理利用传闻的人和生意后果，同时不把残余异常写成鬼怪事实。'
          : '只处理已确认的利益行为，对无法验证的细节保持沉默或开放，不替城市宣布唯一答案。'
      ]
    },
    [urbanLegendsFormalIds.stages.aftermath]: {
      police: [
        '完成必要交接和记录，观察家属、同僚、媒体与街坊怎样吸收结果；不删除历史，也不把传闻当成新案重开。',
        '确认案件或非案件结论、人物关系和公开叙述各自留下的后果，并让这条剧情弧在世界事实已经落定时自然收束。'
      ],
      civilian: [
        '回到工作和生活，观察家属、熟客与报纸如何记住或改写此事，只保留已经发生的关系与现实后果。',
        '在不宣告唯一真相的前提下接受这件事已经形成的结果，让相关人物继续生活并让这条剧情弧自然收束。'
      ],
      gang_member: [
        '处理传闻留下的生意、人情和组织后果，不抹去已发生的事，也不重新制造风声。',
        '确认各方已经承担的代价和街面留下的叙述，让这条剧情弧在现实余波落定后自然收束。'
      ]
    }
  };

  const actionsForStage = stageActions[currentStageId]?.[identity];
  if (actionsForStage?.length) {
    return {
      kind: 'grounded_followup',
      text: actionsForStage[turnIndex % actionsForStage.length]!
    };
  }

  const followups =
    identity === 'police'
      ? [
          '把已经听到的说法拆成时间、地点和人物，先核对司机、车次与报案记录之间能实际查到的部分。',
          '询问愿意配合的相关人员，分别记录他们亲眼所见和转述内容，不替任何一方补全答案。',
          '对照不同证词中的具体时间差和路线记录，只处理自己权限内能够确认的事实。'
        ]
      : identity === 'civilian'
        ? [
            '先找一位真正认识夜班司机的熟客，单独问清他亲眼见过的日期、时间和上落客地点，不把猜测混进记录。',
            '再向另一位互不相干的夜班熟客核对同一晚的收工时间和末班车去向，把两份说法中能实际比较的差异记下来。',
            '从自己的茶餐厅更表、结账时间和通勤经历核对传闻中的时间线；若与两位熟客说法冲突，就只保留可确认的具体差异。',
            '在不侵犯当事人隐私的前提下，向相关司机或家属核对那项具体时间差，并留意这件事是否已经影响他们的工作或生活。'
          ]
        : [
            '分别询问不同街面熟人，核实这阵风声是否有人借来影响生意或掩护普通活动。',
            '对照夜间人流、司机来往和成员口述，不把组织猜测当成已经确认的事实。',
            '判断不同人希望消息被放大或压下的现实利益，避免因为传闻先动用暴力。'
          ];
  return {
    kind: 'grounded_followup',
    text: followups[turnIndex % followups.length]!
  };
}

function summarizeSourceAudit(records: OfficialDlcDramaAuditRecord[]) {
  const relevant = records.filter((record) => record.dlcId === urbanLegendsFormalManifest.dlcId);
  return {
    generated: relevant.some((record) => record.sourceGenerated),
    projected: relevant.some((record) => record.sourceProjected),
    inPlanningContext: relevant.some((record) => record.sourceInPlanningContext),
    selected: relevant.some((record) => record.selected),
    executed: relevant.some((record) => record.executed),
    omittedReasons: [...new Set(relevant.flatMap((record) => record.omittedReason ?? []))]
  };
}

function summarizeProgress(audits: NarrativeArcProgressValidationDiagnostic[]) {
  return audits.map((audit) => ({
    decision: audit.decision,
    accepted: audit.accepted,
    requestedNextStageId: audit.requestedNextStageId,
    rejectionReasons: [...audit.rejectionReasons]
  }));
}

function objectiveSupernaturalConfirmation(text: string): boolean {
  return /(?:已经|现已|可以)证实(?:这|该)?(?:确实)?是鬼|鬼魂真实存在|超自然现象已经得到证实|确定是鬼魂所为/.test(
    text
  );
}

describe.skipIf(!shouldRun)('Urban Legends formal Phase 3 through real APIs', () => {
  it(
    'runs selected identities through natural entry, continuity, ignore and pause/resume',
    async () => {
      const importedSettings = importApiSettings(
        createDefaultAiSettings(),
        await readFile(settingsPath, 'utf8')
      );
      const discovery = await discoverRoutes(importedSettings);
      expect(discovery.routes.length, JSON.stringify(discovery.audits)).toBeGreaterThanOrEqual(2);
      if (checkpointPath && scenarioIdentities.length !== 1) {
        throw new Error('Phase 3 检查点模式只允许一次运行一个身份。');
      }
      const preferredRouteIndex = preferredRouteProfile
        ? discovery.routes.findIndex((route) =>
            route.profile.name.toLowerCase().includes(preferredRouteProfile.toLowerCase())
          )
        : -1;
      if (preferredRouteProfile && preferredRouteIndex < 0) {
        throw new Error(`没有找到已通过模型目录检查的指定路线：${preferredRouteProfile}`);
      }
      const executionRoutes = preferredRouteIndex > 0
        ? [
            discovery.routes[preferredRouteIndex]!,
            ...discovery.routes.filter((_, index) => index !== preferredRouteIndex)
          ]
        : discovery.routes;

      const uninstallProvider = installOfficialDlcPhase3CandidateProvider();
      const routeSuccesses = new Map<string, number>();
      const routeFailures: Array<{ route: string; operation: string; error: string }> = [];
      const scenarios: ScenarioAudit[] = [];
      try {
        for (let identityIndex = 0; identityIndex < scenarioIdentities.length; identityIndex += 1) {
          const identity = scenarioIdentities[identityIndex]!;
          const checkpoint = await readCheckpoint(identity);
          let state = checkpoint?.state ?? createScenarioState(identity);
          const turnAudits: TurnAudit[] = checkpoint ? [...checkpoint.turnAudits] : [];
          let pauseResumeChecked = checkpoint?.pauseResumeChecked ?? false;
          let pauseResumePassed = checkpoint?.pauseResumePassed ?? false;
          const startTurnIndex = checkpoint?.nextTurnIndex ?? 0;
          if (checkpoint) {
            for (const [route, turns] of checkpoint.routeSuccesses) {
              routeSuccesses.set(route, (routeSuccesses.get(route) ?? 0) + turns);
            }
            routeFailures.push(...checkpoint.routeFailures);
            trace(
              `checkpoint:resume identity=${identity} nextTurn=${startTurnIndex + 1}/${turnsPerIdentity} ` +
                `arc=${formalArcs(state)[0]?.arcInstanceId ?? 'none'} ` +
                `stage=${formalArcs(state)[0]?.currentStageId ?? 'none'}`
            );
          }

          for (let turnIndex = startTurnIndex; turnIndex < turnsPerIdentity; turnIndex += 1) {
            const beforeArcs = formalArcs(state);
            const beforeArc = beforeArcs[0];
            const shouldPause =
              beforeArc?.status === 'active' && !pauseResumeChecked && turnIndex >= 3;
            if (shouldPause) {
              state.world.officialDlcBindings![0]!.status = 'paused';
            }
            const action = actionFor(
              identity,
              turnIndex,
              beforeArc?.currentStageId,
              beforeArc?.status,
              shouldPause
            );
            const runtimeBefore = runtimeCounts(state);
            const previousTurnCounter = state.turnCounter;
            const previousStoryLength = state.storyLog.length;
            let nextState: RuntimeState | undefined;
            let usedRoute: LiveRoute | undefined;
            let sourceAuditRecords: OfficialDlcDramaAuditRecord[] = [];
            let lastError: unknown;

            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
              const routeIndex = (identityIndex + attempt) % executionRoutes.length;
              const route = executionRoutes[routeIndex]!;
              const settings = settingsForRoute(importedSettings, route);
              const narrator = createNarratorClientFromSettings(settings, withTimeout);
              const auxiliaryGeneration = createAuxiliaryGenerationClientFromSettings(
                settings,
                withTimeout
              );
              trace(
                `turn:start identity=${identity} turn=${turnIndex + 1}/${turnsPerIdentity} ` +
                  `attempt=${attempt + 1}/${maxAttempts} route=${route.label} kind=${action.kind}`
              );
              try {
                nextState = await runPlayerTurn({
                  state,
                  playerInput: action.text,
                  requestId: `phase3_${identity}_${turnIndex + 1}_${attempt + 1}`,
                  narrator,
                  auxiliaryGeneration: auxiliaryGeneration ?? undefined,
                  auxiliaryGenerationMode: 'custom',
                  writebackRepairMode: 'follow-main',
                  gameSettings: settings.game,
                  promptSettings: settings.prompts,
                  tavernSettings: settings.tavern,
                  enableJudgementPreflight: false,
                  onOfficialDlcDramaAudit: (records) => {
                    sourceAuditRecords = records;
                  }
                });
                usedRoute = route;
                routeSuccesses.set(route.label, (routeSuccesses.get(route.label) ?? 0) + 1);
                trace(
                  `turn:success identity=${identity} turn=${turnIndex + 1}/${turnsPerIdentity} ` +
                    `route=${route.label} runtimeTurn=${nextState.turnCounter}`
                );
                break;
              } catch (error) {
                lastError = error;
                routeFailures.push({
                  route: route.label,
                  operation: `${identity}:turn_${turnIndex + 1}:attempt_${attempt + 1}`,
                  error: safeError(error)
                });
                trace(
                  `turn:failed identity=${identity} turn=${turnIndex + 1}/${turnsPerIdentity} ` +
                    `route=${route.label} error=${safeError(error)}`
                );
                await sleep(retryDelayMs * Math.min(4, attempt + 1));
              }
            }

            if (!nextState || !usedRoute) {
              throw new Error(
                `${identity} 第 ${turnIndex + 1} 回合未成功提交：${safeError(lastError)}`
              );
            }
            expect(nextState.turnCounter).toBe(previousTurnCounter + 1);
            expect(nextState.storyLog.length).toBeGreaterThan(previousStoryLength);

            if (shouldPause) {
              const pausedArcs = formalArcs(nextState);
              pauseResumeChecked = true;
              pauseResumePassed =
                pausedArcs.length === beforeArcs.length &&
                pausedArcs[0]?.arcInstanceId === beforeArc?.arcInstanceId &&
                pausedArcs[0]?.currentStageId === beforeArc?.currentStageId;
              nextState.world.officialDlcBindings![0]!.status = 'active';
            }

            const afterArcs = formalArcs(nextState);
            const afterArc = afterArcs[0];
            const receipt: DramaExecutionReceipt | undefined =
              nextState.dramaticContent?.recentExecutions?.at(-1);
            expect(receipt).toBeDefined();
            const narratorEntry = latestNarratorEntry(nextState);
            expect(narratorEntry?.text.trim()).toBeTruthy();
            const apiUsage = narratorEntry?.turnMetrics?.apiUsage ?? [];
            const supernaturalConfirmation = objectiveSupernaturalConfirmation(
              narratorEntry?.text ?? ''
            );
            turnAudits.push({
              identity,
              turnCounter: nextState.turnCounter,
              route: usedRoute.label,
              actionKind: action.kind,
              pausedDuringTurn: shouldPause,
              beforeStageId: beforeArc?.currentStageId,
              afterStageId: afterArc?.currentStageId,
              afterArcStatus: afterArc?.status,
              arcInstanceId: afterArc?.arcInstanceId,
              formalArcCount: afterArcs.length,
              planningRoute: receipt?.resolvedPlanningRoute,
              officialDlcSelected: receipt?.officialDlcSelected ?? false,
              officialDlcExecuted: receipt?.officialDlcExecuted ?? false,
              traceStatus: receipt?.traceStatus,
              persistentWriteCount: receipt?.persistentWriteCount ?? 0,
              progress: summarizeProgress(receipt?.narrativeArcProgressAudits ?? []),
              sourceAudit: summarizeSourceAudit(sourceAuditRecords),
              runtimeBefore,
              runtimeAfter: runtimeCounts(nextState),
              tokens: {
                input: apiUsage.reduce((sum, item) => sum + item.inputTokens, 0),
                output: apiUsage.reduce((sum, item) => sum + item.outputTokens, 0),
                calls: apiUsage.reduce((sum, item) => sum + item.callCount, 0)
              },
              objectiveSupernaturalConfirmation: supernaturalConfirmation
            });
            state = nextState;
            await writeCheckpoint({
              schemaVersion: 'official-dlc-phase3-checkpoint-v1',
              identity,
              resolutionMode,
              startStageMode,
              postCompletionTurnsRequired,
              targetTurns: turnsPerIdentity,
              nextTurnIndex: turnIndex + 1,
              state,
              turnAudits,
              pauseResumeChecked,
              pauseResumePassed,
              routeSuccesses: [...routeSuccesses.entries()],
              routeFailures: routeFailures.slice(-48)
            });
            trace(
              `checkpoint:saved identity=${identity} nextTurn=${turnIndex + 2}/${turnsPerIdentity}`
            );
            const completedAtIndex = turnAudits.findIndex(
              (turn) => turn.afterArcStatus === 'completed'
            );
            const postCompletionTurns =
              completedAtIndex >= 0 ? turnAudits.length - completedAtIndex - 1 : 0;
            if (
              postCompletionTurnsRequired > 0 &&
              completedAtIndex >= 0 &&
              postCompletionTurns >= postCompletionTurnsRequired
            ) {
              trace(
                `scenario:early-stop identity=${identity} completedAt=${completedAtIndex + 1} ` +
                  `postCompletionTurns=${postCompletionTurns}`
              );
              break;
            }
          }

          const finalArcs = formalArcs(state);
          scenarios.push({
            identity,
            targetTurns: turnsPerIdentity,
            completedTurns: turnAudits.length,
            finalArcId: finalArcs[0]?.arcInstanceId,
            finalStageId: finalArcs[0]?.currentStageId,
            finalArcStatus: finalArcs[0]?.status,
            formalArcCount: finalArcs.length,
            pauseResumeChecked,
            pauseResumePassed,
            routeLabels: [...new Set(turnAudits.map((turn) => turn.route))],
            turns: turnAudits
          });
        }
      } finally {
        uninstallProvider();
      }

      const allTurns = scenarios.flatMap((scenario) => scenario.turns);
      const stageOneToTwo = allTurns.filter(
        (turn) =>
          turn.beforeStageId === urbanLegendsFormalIds.stages.streetRumor &&
          turn.afterStageId === urbanLegendsFormalIds.stages.firstClues
      );
      const objectiveConfirmations = allTurns.filter(
        (turn) => turn.objectiveSupernaturalConfirmation
      );
      const report = {
        schemaVersion: 'official-dlc-phase3-real-api-v1',
        completedAt: new Date().toISOString(),
        dlc: {
          dlcId: urbanLegendsFormalManifest.dlcId,
          version: urbanLegendsFormalManifest.version,
          worldpackId: 'hk_1988',
          productionRegistered: false,
          startStageMode
        },
        routeDiscovery: discovery.audits,
        successfulRoutes: [...routeSuccesses.entries()].map(([route, turns]) => ({ route, turns })),
        routeFailures: routeFailures.slice(-24),
        summary: {
          successfulTurns: allTurns.length,
          expectedTurns: turnsPerIdentity * scenarioIdentities.length,
          postCompletionTurnsRequired,
          distinctSuccessfulRoutes: routeSuccesses.size,
          identitiesWithNaturalArc: scenarios.filter((scenario) => scenario.formalArcCount === 1)
            .length,
          stageOneToTwoTransitions: stageOneToTwo.length,
          stageOneToTwoRequired: requireStageOneToTwo,
          duplicateArcScenarios: scenarios.filter((scenario) => scenario.formalArcCount > 1)
            .map((scenario) => scenario.identity),
          pauseResumePassed: scenarios.filter((scenario) => scenario.pauseResumePassed).length,
          completedArcScenarios: scenarios
            .filter((scenario) => scenario.finalArcStatus === 'completed')
            .map((scenario) => scenario.identity),
          objectiveSupernaturalConfirmations: objectiveConfirmations.length,
          totalInputTokens: allTurns.reduce((sum, turn) => sum + turn.tokens.input, 0),
          totalOutputTokens: allTurns.reduce((sum, turn) => sum + turn.tokens.output, 0),
          totalApiCalls: allTurns.reduce((sum, turn) => sum + turn.tokens.calls, 0)
        },
        scenarios
      };
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

      if (postCompletionTurnsRequired === 0) {
        expect(allTurns).toHaveLength(turnsPerIdentity * scenarioIdentities.length);
      } else {
        expect(
          scenarios.every(
            (scenario) =>
              scenario.completedTurns >= 6 && scenario.completedTurns <= scenario.targetTurns
          )
        ).toBe(true);
      }
      expect(routeSuccesses.size).toBeGreaterThanOrEqual(Math.min(2, scenarioIdentities.length));
      expect(scenarios.every((scenario) => scenario.formalArcCount === 1)).toBe(true);
      expect(scenarios.every((scenario) => scenario.pauseResumeChecked)).toBe(true);
      expect(scenarios.every((scenario) => scenario.pauseResumePassed)).toBe(true);
      if (requireStageOneToTwo) {
        expect(stageOneToTwo.length).toBeGreaterThanOrEqual(1);
      }
      if (requireCompletion) {
        expect(scenarios.every((scenario) => scenario.finalArcStatus === 'completed')).toBe(true);
      }
      expect(objectiveConfirmations).toEqual([]);
    },
    7_200_000
  );
});
