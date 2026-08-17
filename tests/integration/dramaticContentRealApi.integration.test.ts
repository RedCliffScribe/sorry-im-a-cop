import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAuxiliaryGenerationClientFromSettings } from '../../src/domain/news/createAuxiliaryGenerationClientFromSettings';
import { createBackgroundEvolutionClientFromSettings } from '../../src/domain/backgroundEvolution/createBackgroundEvolutionClientFromSettings';
import { selectContext } from '../../src/domain/context/selectContext';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import type { NarratorClient } from '../../src/domain/narrator/NarratorClient';
import { createNpcSimulationClientFromSettings } from '../../src/domain/npc/createNpcSimulationClientFromSettings';
import { runOpening } from '../../src/domain/opening/runOpening';
import { createInitialRuntimeState, type OpeningSetup } from '../../src/domain/runtime/initialState';
import type {
  CurrentIdentity,
  GameTime,
  RuntimeState,
  TurnApiRoute
} from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings, ApiProfile } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import type {
  DramaChannelId,
  DramaExecutionReceipt,
  DramaPacingPreset,
  DramaticContentSettings
} from '../../src/domain/drama/types';
import { defaultDramaChannels } from '../../src/domain/drama/settings';
import {
  allDramaPlanningSources,
  assembleDramaPlanningContext
} from '../../src/domain/drama/assemblePlanningContext';

const shouldRun = process.env.COPV2_RUN_DRAMATIC_CONTENT_REAL_API === '1';
const continuousMode = process.env.COPV2_DRAMA_REAL_API_CONTINUOUS === '1';
const continuousSmoke = process.env.COPV2_DRAMA_REAL_API_CONTINUOUS_SMOKE === '1';
const resumeContinuousRun = process.env.COPV2_DRAMA_REAL_API_RESUME === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_DRAMA_REAL_API_REQUEST_TIMEOUT_MS ?? 600_000)
);
const maxAttempts = Math.min(
  8,
  Math.max(
    continuousMode ? 8 : 2,
    Math.trunc(Number(process.env.COPV2_DRAMA_REAL_API_MAX_ATTEMPTS ?? (continuousMode ? 8 : 6))) ||
      (continuousMode ? 8 : 6)
  )
);
const retryBaseMs = Math.max(
  500,
  Number(process.env.COPV2_DRAMA_REAL_API_RETRY_BASE_MS ?? 3_000)
);
const turnDelayMs = Math.max(
  0,
  Number(process.env.COPV2_DRAMA_REAL_API_TURN_DELAY_MS ?? 800)
);
const traceHttp = process.env.COPV2_DRAMA_REAL_API_TRACE_HTTP === '1';
const skipRealOpenings = process.env.COPV2_DRAMA_REAL_API_SKIP_OPENINGS === '1';
const openingsOnly = process.env.COPV2_DRAMA_REAL_API_OPENINGS_ONLY === '1';
const outputPath = path.resolve(
  process.env.COPV2_DRAMA_REAL_API_OUTPUT_PATH ??
    path.join('output', 'dramatic-content-real-api', 'latest.json')
);
const continuousCheckpointPath = path.resolve(
  process.env.COPV2_DRAMA_REAL_API_CHECKPOINT_PATH ??
    outputPath.replace(/\.json$/i, '.checkpoint.json')
);
const continuousSamplesPath = path.resolve(
  process.env.COPV2_DRAMA_REAL_API_SAMPLES_PATH ??
    outputPath.replace(/\.json$/i, '.samples.json')
);

const defaultScenarioTurns: Record<DramaPacingPreset, number> = {
  original: 20,
  life: 30,
  balanced: 40,
  dramatic: 40,
  cinematic: 30,
  custom: 0
};

interface RouteChoice {
  profile: ApiProfile;
  model: string;
  label: string;
}

interface HttpAuditEntry {
  route: TurnApiRoute;
  provider: string;
  status: number | null;
  responseMs: number;
  error?: string;
}

interface NarratorShapeAuditEntry {
  provider: string;
  hasTopLevelPlan: boolean;
  hasTopLevelTrace: boolean;
  hasNestedTrace: boolean;
}

interface ScenarioResult {
  id: string;
  pacing: DramaPacingPreset;
  identity: CurrentIdentity;
  targetTurns: number;
  completedTurns: number;
  planningCalledCount: number;
  planningSucceededCount: number;
  traceCount: number;
  quietPlanCount: number;
  persistentWriteCount: number;
  degradedTurnCount: number;
  degradeReasonCounts: Record<string, number>;
  diagnosticCodeCounts: Record<string, number>;
  diagnosticSamples: Array<{
    code: string;
    message: string;
  }>;
  sourceUseCounts: Record<string, number>;
  planModeCounts: Record<string, number>;
  providerSwitches: string[];
  finalActorCount: number;
  finalMatterCount: number;
  finalSignalCount: number;
  finalNewsCount: number;
  accepted: boolean;
  error?: string;
}

interface OpeningResult {
  identity: CurrentIdentity;
  accepted: boolean;
  outerAttemptCount: number;
  durationMs: number;
  stageCounts: Record<string, number>;
  httpRequestCount: number;
  httpStatusCounts: Record<string, number>;
  narratorResponseCount: number;
  finalActorCount: number;
  finalMatterCount: number;
  finalStoryEntryCount: number;
  turnCounter: number;
}

interface RuntimeSnapshot {
  turnCounter: number;
  storyEntries: number;
  actors: number;
  memories: number;
  matters: number;
  signals: number;
  newsIssues: number;
  deferredEvents: number;
  pressures: number;
  relationships: number;
  cases: number;
  cityTracks: number;
  npcTracks: number;
  organizationTracks: number;
  backgroundOutcomes: number;
  backgroundChronicle: number;
  pendingActorRecoveries: number;
  pendingActorEnrichments: number;
  dramaInstances: number;
}

interface ContinuousPhaseResult {
  id: string;
  pacing: DramaPacingPreset;
  targetTurns: number;
  completedTurns: number;
  startedAtTurn: number;
  finishedAtTurn: number;
  planningCalledCount: number;
  planningSucceededCount: number;
  localFallbackCount: number;
  traceCount: number;
  quietPlanCount: number;
  persistentWriteCount: number;
  newActorCount: number;
  sourceUseCounts: Record<string, number>;
  planModeCounts: Record<string, number>;
  planOriginCounts: Record<string, number>;
  startSnapshot: RuntimeSnapshot;
  endSnapshot: RuntimeSnapshot;
  accepted: boolean;
  error?: string;
}

interface ContinuitySample {
  turnCounter: number;
  phaseId: string;
  actionSource: 'suggested' | 'fallback';
  playerInput: string;
  narrativeCharacters: number;
  summaryText: string;
  suggestedActions: string[];
  pacing: DramaPacingPreset;
  planningCalled: boolean;
  planningSucceeded: boolean;
  planOrigin?: string;
  planMode?: string;
  primarySource?: string;
  usedSources: string[];
  traceStatus?: string;
  backgroundLastRunStatus?: string;
}

interface ContinuousCandidateAudit {
  requiredCount: number;
  optionalDynamicCount: number;
  staticSeedCount: number;
  candidateCount: number;
  candidateChannelCounts: Partial<Record<DramaChannelId, number>>;
  candidateSourceTypeCounts: Record<string, number>;
  candidateRefs: Array<{
    ref: string;
    channelIds: DramaChannelId[];
    mandatory: boolean;
    sourceStatus: string;
    arcKey?: string;
  }>;
  filterRuleIds: string[];
}

interface ContinuousTurnAudit {
  turnCounter: number;
  phaseId: string;
  pacing: DramaPacingPreset;
  settings: DramaticContentSettings;
  candidateAudit: ContinuousCandidateAudit;
  receipt: {
    planningCalled: boolean;
    planningSucceeded: boolean;
    planOrigin?: string;
    planMode?: string;
    inputCandidateCount: number;
    inputCharacterCount: number;
    estimatedInputTokens: number;
    primarySource?: string;
    supportSources: string[];
    usedSources: string[];
    traceStatus?: string;
    persistentWriteCount: number;
    newActorCount: number;
    degradeReason?: string;
    filterRuleIds: string[];
  };
  diagnosticCodes: string[];
  backgroundLastRunStatus?: string;
  stateSnapshot: RuntimeSnapshot;
}

interface ContinuousCheckpoint {
  schemaVersion: 2;
  generatedAt: string;
  completedTurns: number;
  phaseIndex: number;
  phaseTurnIndex: number;
  state: RuntimeState;
  receipts: DramaExecutionReceipt[];
  phaseResults: ContinuousPhaseResult[];
  samples: ContinuitySample[];
  turnAudits: ContinuousTurnAudit[];
}

function trace(message: string): void {
  process.stdout.write(`[drama-real] ${message}\n`);
}

function runtimeSnapshot(state: RuntimeState): RuntimeSnapshot {
  return {
    turnCounter: state.turnCounter,
    storyEntries: state.storyLog.length,
    actors: Object.keys(state.actors).length,
    memories: Object.keys(state.memories).length,
    matters: Object.keys(state.dynamicEvents.currentMatters).length,
    signals: Object.keys(state.dynamicEvents.signals).length,
    newsIssues: Object.keys(state.dynamicEvents.newsIssues).length,
    deferredEvents: Object.keys(state.deferredEvents).length,
    pressures: Object.keys(state.pressures).length,
    relationships: Object.keys(state.relationshipThreads).length,
    cases: Object.keys(state.cases).length,
    cityTracks: Object.keys(state.citySituationTracks).length,
    npcTracks: Object.keys(state.backgroundEvolution.npcTracks).length,
    organizationTracks: Object.keys(state.backgroundEvolution.organizationTracks).length,
    backgroundOutcomes: state.backgroundEvolution.recentOutcomes.length,
    backgroundChronicle: state.backgroundEvolution.chronicle.length,
    pendingActorRecoveries: state.pendingActorWritebackRecoveries.length,
    pendingActorEnrichments: state.pendingActorProfileEnrichments?.length ?? 0,
    dramaInstances: state.dramaticContent?.instances.length ?? 0
  };
}

function latestNarratorEntry(state: RuntimeState) {
  return [...state.storyLog].reverse().find((entry) => entry.speaker === 'narrator');
}

function dramaRefKey(ref: {
  providerId: string;
  sourceType: string;
  sourceId: string;
}): string {
  return `${ref.providerId}:${ref.sourceType}:${ref.sourceId}`;
}

function auditDramaCandidates(
  state: RuntimeState,
  playerInput: string,
  settings: DramaticContentSettings
): ContinuousCandidateAudit {
  if (settings.pacing === 'original') {
    return {
      requiredCount: 0,
      optionalDynamicCount: 0,
      staticSeedCount: 0,
      candidateCount: 0,
      candidateChannelCounts: {},
      candidateSourceTypeCounts: {},
      candidateRefs: [],
      filterRuleIds: ['pacing.original']
    };
  }
  const context = selectContext(state, playerInput);
  const planningContext = assembleDramaPlanningContext(
    state,
    context,
    settings,
    playerInput
  );
  const candidates = allDramaPlanningSources(planningContext);
  return {
    requiredCount: planningContext.requiredContextSources.length,
    optionalDynamicCount: planningContext.optionalDynamicSources.length,
    staticSeedCount: planningContext.staticSeedSources.length,
    candidateCount: candidates.length,
    candidateChannelCounts: countValues(
      candidates.flatMap((source) => source.channelIds)
    ) as Partial<Record<DramaChannelId, number>>,
    candidateSourceTypeCounts: countValues(
      candidates.map((source) => source.ref.sourceType)
    ),
    candidateRefs: candidates.map((source) => ({
      ref: dramaRefKey(source.ref),
      channelIds: [...source.channelIds],
      mandatory: source.mandatory,
      sourceStatus: source.sourceStatus,
      arcKey: source.arcKey
    })),
    filterRuleIds: [...planningContext.filterRuleIds]
  };
}

function continuousTargetTurns(): number {
  const configured =
    Math.trunc(Number(process.env.COPV2_DRAMA_REAL_API_CONTINUOUS_TURNS ?? 200)) || 200;
  return continuousSmoke ? Math.max(1, configured) : Math.max(200, configured);
}

function createCustomDramaSettings(): DramaticContentSettings {
  return {
    pacing: 'custom',
    materialLevel: 'standard',
    planningRoute: 'use-auxiliary',
    channels: {
      ...defaultDramaChannels,
      work_livelihood: 'high',
      relationships: 'off',
      cases_law: 'low',
      organizations: 'high',
      city_news: 'low',
      era_storypack: 'off',
      screen_characters: 'off'
    },
    custom: {
      dynamicLimit: 6,
      staticLimit: 1,
      supportLimit: 1,
      quietWindowTurns: 5,
      worldInitiative: 'high',
      existingDynamicsReturn: 'very_high',
      newSeedExposure: 'low',
      quietSpace: 'low',
      coincidenceTolerance: 'strict',
      majorEscalation: 'low',
      relationshipInitiative: 'low'
    }
  };
}

function createContinuousPhases(targetTurns: number): Array<{
  id: string;
  turns: number;
  settings: DramaticContentSettings;
}> {
  if (continuousSmoke) {
    const smokePhases = [
      { id: 'balanced_smoke', settings: createDramaSettings('balanced') },
      { id: 'dramatic_smoke', settings: createDramaSettings('dramatic') },
      { id: 'custom_smoke', settings: createCustomDramaSettings() }
    ];
    return Array.from({ length: targetTurns }, (_, index) => ({
      ...smokePhases[index % smokePhases.length],
      id: `${smokePhases[index % smokePhases.length].id}_${index + 1}`,
      turns: 1
    }));
  }

  const base = [
    { id: 'original', turns: 20, settings: createDramaSettings('original') },
    { id: 'life', turns: 30, settings: createDramaSettings('life') },
    { id: 'balanced', turns: 35, settings: createDramaSettings('balanced') },
    { id: 'dramatic', turns: 35, settings: createDramaSettings('dramatic') },
    { id: 'cinematic', turns: 30, settings: createDramaSettings('cinematic') },
    { id: 'custom_channels', turns: 30, settings: createCustomDramaSettings() },
    {
      id: 'balanced_restore',
      turns: 20 + Math.max(0, targetTurns - 200),
      settings: createDramaSettings('balanced')
    }
  ];
  return base;
}

function actionFromState(
  state: RuntimeState,
  identity: CurrentIdentity,
  index: number
): { text: string; source: 'suggested' | 'fallback' } {
  const suggested = latestNarratorEntry(state)?.suggestedActions?.filter((item) => item.trim());
  if (suggested && suggested.length > 0) {
    return {
      text: suggested[index % suggested.length],
      source: 'suggested'
    };
  }
  return {
    text: actionForIdentity(identity, index),
    source: 'fallback'
  };
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordNarratorShape(
  audits: NarratorShapeAuditEntry[],
  provider: string,
  value: unknown
): void {
  const record = isRecord(value) ? value : {};
  const writeback = isRecord(record.writeback) ? record.writeback : {};
  audits.push({
    provider,
    hasTopLevelPlan: record.dramaPlan !== undefined,
    hasTopLevelTrace: record.dramaExecutionTrace !== undefined,
    hasNestedTrace: writeback.dramaExecutionTrace !== undefined
  });
}

function auditNarratorClient(
  client: NarratorClient,
  audits: NarratorShapeAuditEntry[],
  provider: string
): NarratorClient {
  return {
    configuredMaxTokens: client.configuredMaxTokens,
    complete: async (input, options) => {
      const value = await client.complete(input, options);
      recordNarratorShape(audits, provider, value);
      return value;
    },
    ...(client.completeDetailed
      ? {
          completeDetailed: async (input, options) => {
            const completion = await client.completeDetailed!(input, options);
            recordNarratorShape(audits, provider, completion.value);
            return completion;
          }
        }
      : {})
  };
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

function findProfile(
  settings: AiSettings,
  names: string[],
  modelCandidates: string[]
): RouteChoice | undefined {
  for (const name of names) {
    const profile = settings.apiProfiles.find((item) =>
      item.name.toLowerCase().includes(name.toLowerCase())
    );
    if (!profile) continue;
    const model =
      modelCandidates.find((candidate) => profile.models.includes(candidate)) ??
      profile.models.find((candidate) =>
        modelCandidates.some((preferred) =>
          candidate.toLowerCase().includes(preferred.toLowerCase())
        )
      );
    if (model) {
      return {
        profile,
        model,
        label: `${profile.name}/${model}`
      };
    }
  }
  return undefined;
}

function resolveRouteChoices(settings: AiSettings): RouteChoice[] {
  const explicitProfile = process.env.COPV2_DRAMA_REAL_API_PROFILE?.trim();
  const explicitModel = process.env.COPV2_DRAMA_REAL_API_MODEL?.trim();
  if (explicitProfile && explicitModel) {
    const profile = settings.apiProfiles.find(
      (item) =>
        item.id === explicitProfile ||
        item.name.toLowerCase() === explicitProfile.toLowerCase()
    );
    if (!profile) throw new Error(`找不到指定真实 API 档案：${explicitProfile}`);
    return [{ profile, model: explicitModel, label: `${profile.name}/${explicitModel}` }];
  }

  const choices = [
    findProfile(
      settings,
      ['yuqing'],
      ['企业cli-gemini-3.1-pro-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-pro']
    ),
    findProfile(
      settings,
      ['ggchan'],
      ['gemini-3.1-pro-preview', 'gemini-2.5-pro']
    ),
    findProfile(
      settings,
      ['local-codex-lifecycle', 'local'],
      ['gemini-3.1-pro', 'gemini-3.1-pro-preview', 'gemini-2.5-pro']
    )
  ].filter((choice): choice is RouteChoice => Boolean(choice));

  if (choices.length === 0 && settings.mainNarrator) {
    const profile = settings.apiProfiles.find(
      (item) => item.id === settings.mainNarrator?.apiProfileId
    );
    if (profile) {
      choices.push({
        profile,
        model: settings.mainNarrator.model,
        label: `${profile.name}/${settings.mainNarrator.model}`
      });
    }
  }
  if (choices.length === 0) {
    throw new Error('没有可用于戏剧化内容长测的主剧情 API 档案。');
  }
  return choices;
}

function settingsForRoute(
  source: AiSettings,
  route: RouteChoice,
  dramaticContent: DramaticContentSettings,
  enableDynamicRoutes = false
): AiSettings {
  return {
    ...source,
    mainNarrator: {
      apiProfileId: route.profile.id,
      model: route.model,
      maxTokensMode: 'custom',
      maxTokens: 32768,
      temperature: 0.45
    },
    featureRoutes: {
      ...source.featureRoutes,
      writebackRepair: { mode: 'follow-main' },
      memorySummary: { mode: 'disabled' },
      memoryVector: { mode: 'disabled' },
      npcSimulation: enableDynamicRoutes
        ? {
            mode: 'custom',
            apiProfileId: route.profile.id,
            model: route.model,
            maxTokens: 4096,
            temperature: 0.2
          }
        : { mode: 'disabled' },
      backgroundEvolution: enableDynamicRoutes
        ? {
            mode: 'custom',
            apiProfileId: route.profile.id,
            model: route.model,
            maxTokens: 8192,
            temperature: 0.2
          }
        : { mode: 'disabled' },
      auxiliaryGeneration: {
        mode: 'custom',
        apiProfileId: route.profile.id,
        model: route.model,
        maxTokens: 4096,
        temperature: 0.2
      }
    },
    game: {
      ...source.game,
      narrativeLengthLevel: 'compact',
      dramaticContent
    }
  };
}

function createAuditedFetch(
  audits: HttpAuditEntry[],
  route: TurnApiRoute,
  provider: string
) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    if (traceHttp) trace(`http:start route=${route} provider=${provider}`);
    try {
      const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
        (signal): signal is AbortSignal => Boolean(signal)
      );
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.any(signals)
      });
      audits.push({
        route,
        provider,
        status: response.status,
        responseMs: Math.round(performance.now() - startedAt)
      });
      if (traceHttp) {
        trace(`http:headers route=${route} provider=${provider} status=${response.status}`);
      }
      return response;
    } catch (error) {
      audits.push({
        route,
        provider,
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

function createDramaSettings(pacing: DramaPacingPreset): DramaticContentSettings {
  return {
    pacing,
    materialLevel:
      pacing === 'cinematic' ? 'rich' : pacing === 'life' ? 'restrained' : 'standard',
    planningRoute: 'auto',
    channels: { ...defaultDramaChannels }
  };
}

function seedDramaSources(state: RuntimeState, scenarioId: string): RuntimeState {
  const time = cloneTime(state.time);
  const matterKind =
    state.player.currentIdentity === 'police'
      ? 'police_work'
      : state.player.currentIdentity === 'gang_member'
        ? 'social'
        : 'livelihood';
  const organizationIds =
    state.player.currentIdentity === 'police'
      ? ['org_hk_police']
      : state.player.currentIdentity === 'gang_member'
        ? Object.keys(state.organizations).filter((id) => id !== 'org_hk_police').slice(0, 1)
        : Object.keys(state.organizations)
            .filter((id) => id !== 'org_hk_police' && id !== 'org_icac')
            .slice(0, 1);
  const placeId = state.location.currentPlaceId;
  const matterId = `matter_drama_real_${scenarioId}`;
  const signalId = `signal_drama_real_${scenarioId}`;
  const newsId = `news_drama_real_${scenarioId}`;
  const deferredId = `deferred_drama_real_${scenarioId}`;

  return {
    ...state,
    dynamicEvents: {
      currentMatters: {
        ...state.dynamicEvents.currentMatters,
        [matterId]: {
          id: matterId,
          title: '眼前尚未处理完的日常事项',
          summary: '这是一个与玩家当前身份、地点和日常关系直接相关，但不要求立即升级的现实事项。',
          status: 'active',
          priority: 70,
          visibility: 'known',
          source: 'dramatic_content_real_api_acceptance',
          matterKind,
          pressureLevel: 1,
          responseWindow: 'open',
          consequenceHint: '长期无视会自然改变相关人物或组织的看法，但不会自动制造重大危机。',
          currentHook: '玩家可以继续日常，也可以稍作了解。',
          unread: true,
          relatedActorIds: [],
          relatedPlaceIds: [placeId],
          relatedCaseIds: [],
          relatedOrganizationIds: organizationIds,
          createdAt: time,
          updatedAt: time
        }
      },
      signals: {
        ...state.dynamicEvents.signals,
        [signalId]: {
          id: signalId,
          title: '附近传来的模糊风声',
          summary: '有人提到附近最近有些变化，但来源普通、内容未证实，也可能只是日常闲谈。',
          signalType: 'rumor',
          reliability: 'unknown',
          status: 'active',
          visibility: 'known',
          relatedActorIds: [],
          relatedPlaceIds: [placeId],
          relatedCaseIds: [],
          relatedOrganizationIds: organizationIds,
          createdAt: time,
          updatedAt: time
        }
      },
      newsIssues: {
        ...state.dynamicEvents.newsIssues,
        [newsId]: {
          id: newsId,
          date: time,
          outletName: '东方日报',
          headline: '区内生活秩序与营商压力引起议论',
          summary: '报道只描述公开的城市生活变化，没有把玩家或未公开人物写成新闻主角。',
          articles: [
            {
              id: `${newsId}_article`,
              section: 'local',
              headline: '区内生活秩序与营商压力引起议论',
              body: '街坊与商户对近期生活成本和秩序变化各有看法。',
              playerRelated: false,
              relatedActorIds: [],
              relatedPlaceIds: [placeId],
              relatedCaseIds: [],
              relatedOrganizationIds: organizationIds
            }
          ],
          createdAt: time,
          updatedAt: time,
          read: false
        }
      }
    },
    deferredEvents: {
      ...state.deferredEvents,
      [deferredId]: {
        eventId: deferredId,
        sourceModule: 'dynamic',
        relatedIds: { placeId, organizationId: organizationIds[0] },
        title: '先前约定的普通回访时间已经到了',
        summary: '这是已经成立并到期的回访，不得因内容频道关闭而消失。',
        triggerAt: time,
        visibility: 'player_visible',
        promptInstruction:
          '把到期回访作为已有事实处理；可以很平静，也可以被玩家推迟，不要自动升级成危机。',
        status: 'pending',
        createdAt: time
      }
    }
  };
}

function scenarioTurns(pacing: DramaPacingPreset): number {
  const key = `COPV2_DRAMA_REAL_API_${pacing.toUpperCase()}_TURNS`;
  return Math.max(
    1,
    Math.trunc(Number(process.env[key] ?? defaultScenarioTurns[pacing])) ||
      defaultScenarioTurns[pacing]
  );
}

function setupForIdentity(
  identity: CurrentIdentity,
  dramaticOpeningId: string
): OpeningSetup {
  const common: OpeningSetup = {
    playerName:
      identity === 'police' ? '周启明' : identity === 'gang_member' ? '陈家荣' : '李嘉慧',
    englishName:
      identity === 'police' ? 'Michael Chow' : identity === 'gang_member' ? 'Ka-wing Chan' : 'Karen Lee',
    gender: identity === 'civilian' ? 'female' : 'male',
    age: identity === 'police' ? 29 : identity === 'gang_member' ? 31 : 27,
    currentIdentity: identity,
    personality: '做事谨慎，愿意观察现实反应，不会无缘无故把事情升级。',
    appearance: '衣着和气质符合当前职业与1988年香港环境。',
    startTime: { year: 1988, month: 9, day: 12, hour: 9, minute: 0 },
    openingPressure: 'routine',
    storypackInfluence: 'high',
    screenCharacterSeedsEnabled: true,
    dramaticOpeningId
  };
  if (identity === 'police') {
    return {
      ...common,
      policeNumber: '18427',
      policePostingId: 'mong_kok_police_station',
      lawIdentity: {
        stationOrPost: '旺角警署',
        department: '军装巡逻',
        rank: '警长',
        assignmentSummary: '负责本更巡逻车组与一般现场初动。',
        authoritySummary: '可指挥本车人员并请求增援，不能擅自调动跨区资源。',
        accessSummary: '可接触本更任务、电台调派和现场基本资料。',
        dutySummary: '巡逻、一般紧急响应、现场控制、报告与交接。'
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
  return {
    ...common,
    civilianProfileId: 'tea_restaurant_clerk'
  };
}

function actionForIdentity(identity: CurrentIdentity, index: number): string {
  const variants =
    identity === 'police'
      ? [
          '继续按本更程序处理日常勤务，留意同事和街面变化；没有明确紧急条件时保持普通节奏。',
          '完成眼前记录和交接，顺便问问同僚最近是否有需要留意的普通情况。',
          '照常巡查附近街道，对已经成立的回访作出合乎职级的回应，不主动扩大事情。'
        ]
      : identity === 'gang_member'
        ? [
            '先守规矩处理眼前交代，观察上线、同组和地区反应，不主动把事情闹大。',
            '照常和附近熟人来往，弄清风声真假；没有必要时不借组织名义压人。',
            '完成日常安排，再看看现有关系里谁真正需要回应，保留拒绝或拖延的余地。'
          ]
        : [
            '完成今天手头工作，和同事及熟客正常来往；有事情就按现实情况处理。',
            '照常工作并留意雇主、同事和客人的反应，不把普通风声当成确定事实。',
            '处理已经到期的普通回访，再看看是否有自然的职业或生活变化。'
          ];
  return variants[index % variants.length];
}

function countValues(values: Array<string | undefined>): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => {
    if (value) result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function analyzeReceipts(
  receipts: DramaExecutionReceipt[],
  diagnostics: Array<{ code: string; message: string }>,
  planningExpected: boolean
): Pick<
  ScenarioResult,
  | 'planningCalledCount'
  | 'planningSucceededCount'
  | 'traceCount'
  | 'quietPlanCount'
  | 'persistentWriteCount'
  | 'degradedTurnCount'
  | 'degradeReasonCounts'
  | 'diagnosticCodeCounts'
  | 'diagnosticSamples'
  | 'sourceUseCounts'
  | 'planModeCounts'
  | 'accepted'
> {
  const planningCalledCount = receipts.filter((item) => item.planningCalled).length;
  const planningSucceededCount = receipts.filter((item) => item.planningSucceeded).length;
  const traceCount = receipts.filter((item) => Boolean(item.traceStatus)).length;
  const quietPlanCount = receipts.filter((item) => item.planMode === 'quiet').length;
  const persistentWriteCount = receipts.reduce(
    (sum, item) => sum + item.persistentWriteCount,
    0
  );
  const degradedTurnCount = receipts.filter((item) => Boolean(item.degradeReason)).length;
  const degradeReasonCounts = countValues(
    receipts.flatMap((item) => item.degradeReason?.split(',') ?? [])
  );
  const diagnosticCodeCounts = countValues(diagnostics.map((item) => item.code));
  const diagnosticSamples = diagnostics.slice(-8).map((item) => ({
    code: item.code,
    message: item.message.slice(0, 240)
  }));
  const sourceUseCounts = countValues(
    receipts.flatMap((item) =>
      item.usedSourceRefs.map(
        (ref) => `${ref.providerId}:${ref.sourceType}`
      )
    )
  );
  const planModeCounts = countValues(receipts.map((item) => item.planMode));
  return {
    planningCalledCount,
    planningSucceededCount,
    traceCount,
    quietPlanCount,
    persistentWriteCount,
    degradedTurnCount,
    degradeReasonCounts,
    diagnosticCodeCounts,
    diagnosticSamples,
    sourceUseCounts,
    planModeCounts,
    accepted: planningExpected
      ? planningCalledCount === receipts.length
      : planningCalledCount === 0
  };
}

describe.skipIf(!shouldRun)('dramatic content through real APIs', () => {
  it('runs all pacing presets across police, civilian and triad identities', async () => {
    const importedSettings = importApiSettings(
      createDefaultAiSettings(),
      await readFile(settingsPath, 'utf8')
    );
    const routeChoices = resolveRouteChoices(importedSettings);
    let routeIndex = 0;
    const audits: HttpAuditEntry[] = [];
    const narratorShapeAudits: NarratorShapeAuditEntry[] = [];
    const results: ScenarioResult[] = [];
    const openingResults: OpeningResult[] = [];
    const providerSwitches: string[] = [];

    const currentRoute = () => routeChoices[Math.min(routeIndex, routeChoices.length - 1)];

    const createClients = (settings: AiSettings) => {
      const route = currentRoute();
      const narrator = createNarratorClientFromSettings(
        settings,
        createAuditedFetch(audits, 'mainNarrator', route.label)
      );
      return {
        narrator: auditNarratorClient(narrator, narratorShapeAudits, route.label),
        auxiliaryGeneration:
          createAuxiliaryGenerationClientFromSettings(
            settings,
            createAuditedFetch(audits, 'auxiliaryGeneration', route.label)
          ) ?? undefined,
        npcSimulation:
          createNpcSimulationClientFromSettings(
            settings,
            createAuditedFetch(audits, 'npcSimulation', route.label)
          ) ?? undefined,
        backgroundEvolution:
          createBackgroundEvolutionClientFromSettings(
            settings,
            createAuditedFetch(audits, 'backgroundEvolution', route.label)
          ) ?? undefined
      };
    };

    async function executeWithRetry<T>(
      label: string,
      createSettings: () => AiSettings,
      operation: (settings: AiSettings) => Promise<T>
    ): Promise<T> {
      let lastError: unknown;
      if (continuousMode && routeIndex >= routeChoices.length - 1) {
        // The local reverse proxy is an operation-scoped last resort. A successful
        // charity route remains sticky, but the next operation must probe charity
        // routes again after a local fallback.
        routeIndex = 0;
      }
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const settings = createSettings();
        try {
          return await operation(settings);
        } catch (error) {
          lastError = error;
          const message = safeError(error);
          trace(`${label}: attempt=${attempt}/${maxAttempts} failed: ${message}`);
          const shouldSwitchProvider = continuousMode
            ? attempt % 3 === 0
            : attempt >= 2;
          if (shouldSwitchProvider && routeIndex < routeChoices.length - 1) {
            const from = currentRoute().label;
            routeIndex += 1;
            const to = currentRoute().label;
            providerSwitches.push(`${label}: ${from} -> ${to}`);
            trace(`${label}: switching provider to ${to}`);
          }
          if (attempt < maxAttempts) {
            const backoff = Math.min(60_000, retryBaseMs * 2 ** (attempt - 1));
            await sleep(backoff);
          }
        }
      }
      throw lastError;
    }

    async function openIdentity(
      identity: CurrentIdentity,
      openingId: string
    ): Promise<RuntimeState> {
      const dramaticContent = createDramaSettings('balanced');
      const startedAt = Date.now();
      const httpStart = audits.length;
      const narratorStart = narratorShapeAudits.length;
      const stageCounts: Record<string, number> = {};
      let outerAttemptCount = 0;
      const state = await executeWithRetry(
        `opening:${identity}`,
        () => settingsForRoute(importedSettings, currentRoute(), dramaticContent),
        async (settings) => {
          outerAttemptCount += 1;
          const clients = createClients(settings);
          return runOpening({
            setup: setupForIdentity(identity, openingId),
            narrator: clients.narrator,
            repairNarrator: clients.narrator,
            narrativeLengthLevel: 'compact',
            promptSettings: settings.prompts,
            dramaticContentSettings: dramaticContent,
            onStageChange: (stage) => {
              stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
              trace(`opening:${identity}:stage=${stage}`);
            }
          });
        }
      );
      const openingAudits = audits.slice(httpStart);
      openingResults.push({
        identity,
        accepted:
          state.player.currentIdentity === identity &&
          state.turnCounter === 0 &&
          state.storyLog.length > 0,
        outerAttemptCount,
        durationMs: Date.now() - startedAt,
        stageCounts,
        httpRequestCount: openingAudits.length,
        httpStatusCounts: countValues(
          openingAudits.map((item) =>
            item.status === null ? 'network_error' : String(item.status)
          )
        ),
        narratorResponseCount: narratorShapeAudits.length - narratorStart,
        finalActorCount: Object.keys(state.actors).length,
        finalMatterCount: Object.keys(state.dynamicEvents.currentMatters).length,
        finalStoryEntryCount: state.storyLog.length,
        turnCounter: state.turnCounter
      });
      return state;
    }

    const openingStates: Partial<Record<CurrentIdentity, RuntimeState>> = continuousMode
      ? {
          civilian: skipRealOpenings
            ? createInitialRuntimeState(
                setupForIdentity('civilian', 'first_shift')
              )
            : await openIdentity('civilian', 'first_shift')
        }
      : skipRealOpenings
        ? {
          police: createInitialRuntimeState(
            setupForIdentity('police', 'on_duty_scene')
          ),
          civilian: createInitialRuntimeState(
            setupForIdentity('civilian', 'first_shift')
          ),
          gang_member: createInitialRuntimeState(
            setupForIdentity('gang_member', 'organization_internal')
          )
        }
      : {
          police: await openIdentity('police', 'on_duty_scene'),
          civilian: await openIdentity('civilian', 'first_shift'),
          gang_member: await openIdentity('gang_member', 'organization_internal')
          };

    if (continuousMode && !openingsOnly) {
      const targetTurns = continuousTargetTurns();
      const phases = createContinuousPhases(targetTurns);
      let state = seedDramaSources(
        openingStates.civilian!,
        'continuous_civilian'
      );
      let completedTurns = 0;
      let resumePhaseIndex = 0;
      let resumePhaseTurnIndex = 0;
      const receipts: DramaExecutionReceipt[] = [];
      const phaseResults: ContinuousPhaseResult[] = [];
      const samples: ContinuitySample[] = [];
      const turnAudits: ContinuousTurnAudit[] = [];
      await mkdir(path.dirname(outputPath), { recursive: true });

      if (resumeContinuousRun) {
        try {
          const checkpoint = JSON.parse(
            await readFile(continuousCheckpointPath, 'utf8')
          ) as ContinuousCheckpoint;
          state = checkpoint.state;
          completedTurns = checkpoint.completedTurns;
          resumePhaseIndex = checkpoint.phaseIndex;
          resumePhaseTurnIndex = checkpoint.phaseTurnIndex;
          receipts.push(...checkpoint.receipts);
          phaseResults.push(...checkpoint.phaseResults);
          samples.push(...checkpoint.samples);
          turnAudits.push(...(checkpoint.turnAudits ?? []));
          trace(
            `continuous: resumed completed=${completedTurns}/${targetTurns} ` +
              `phase=${resumePhaseIndex + 1}/${phases.length} phaseTurn=${resumePhaseTurnIndex}`
          );
        } catch (error) {
          trace(`continuous: checkpoint unavailable, starting fresh: ${safeError(error)}`);
        }
      }

      const initialTurnCounter = state.turnCounter - completedTurns;
      for (let phaseIndex = resumePhaseIndex; phaseIndex < phases.length; phaseIndex += 1) {
        const phase = phases[phaseIndex];
        state = {
          ...state,
          dramaticContent: {
            ...(state.dramaticContent ?? {
              instances: [],
              recentDiagnostics: []
            }),
            settings: phase.settings
          }
        };
        const startedAtTurn = state.turnCounter;
        const startSnapshot = runtimeSnapshot(state);
        const phaseReceipts: DramaExecutionReceipt[] = [];
        let phaseCompletedTurns =
          phaseIndex === resumePhaseIndex ? resumePhaseTurnIndex : 0;
        let phaseError: string | undefined;
        trace(
          `continuous:${phase.id}: start pacing=${phase.settings.pacing} ` +
            `completed=${phaseCompletedTurns}/${phase.turns} total=${completedTurns}/${targetTurns}`
        );

        for (
          let phaseTurnIndex = phaseCompletedTurns;
          phaseTurnIndex < phase.turns;
          phaseTurnIndex += 1
        ) {
          const absoluteIndex = completedTurns;
          const action = actionFromState(
            state,
            state.player.currentIdentity,
            absoluteIndex
          );
          const candidateAudit = auditDramaCandidates(
            state,
            action.text,
            phase.settings
          );
          const previousTurnCounter = state.turnCounter;
          const previousStoryLength = state.storyLog.length;
          try {
            const nextState = await executeWithRetry(
              `continuous:${phase.id}:turn_${phaseTurnIndex + 1}`,
              () =>
                settingsForRoute(
                  importedSettings,
                  currentRoute(),
                  phase.settings,
                  true
                ),
              async (settings) => {
                const clients = createClients(settings);
                return runPlayerTurn({
                  state,
                  playerInput: action.text,
                  narrator: clients.narrator,
                  npcSimulation: clients.npcSimulation,
                  backgroundEvolution: clients.backgroundEvolution,
                  auxiliaryGeneration: clients.auxiliaryGeneration,
                  auxiliaryGenerationMode: 'custom',
                  writebackRepairMode: 'follow-main',
                  gameSettings: settings.game,
                  promptSettings: settings.prompts,
                  tavernSettings: settings.tavern,
                  onStageChange: (stage) => {
                    if (
                      stage === 'planning_dramatic_content' ||
                      stage === 'simulating_npcs' ||
                      stage === 'generating_narrative' ||
                      stage === 'evolving_background' ||
                      stage === 'finalizing_turn'
                    ) {
                      trace(
                        `continuous:${phase.id}:turn_${phaseTurnIndex + 1}:stage=${stage}`
                      );
                    }
                  }
                });
              }
            );

            if (nextState.turnCounter !== previousTurnCounter + 1) {
              throw new Error(
                `回合未原子推进：before=${previousTurnCounter}, after=${nextState.turnCounter}`
              );
            }
            if (nextState.storyLog.length <= previousStoryLength) {
              throw new Error(
                `正文未写入：before=${previousStoryLength}, after=${nextState.storyLog.length}`
              );
            }
            const narratorEntry = latestNarratorEntry(nextState);
            if (!narratorEntry?.text.trim() || !narratorEntry.summaryText?.trim()) {
              throw new Error('最新回合缺少可见正文或结构化回合摘要。');
            }

            state = nextState;
            state = {
              ...state,
              dramaticContent: {
                ...(state.dramaticContent ?? {
                  instances: [],
                  recentDiagnostics: []
                }),
                settings: phase.settings
              }
            };
            const receipt = state.dramaticContent?.recentExecutions?.at(-1);
            if (!receipt) {
              throw new Error('有效回合缺少 DramaExecutionReceipt。');
            }
            receipts.push(receipt);
            phaseReceipts.push(receipt);
            const diagnosticCodes = (
              state.dramaticContent?.recentDiagnostics ?? []
            )
              .filter((item) => item.turnCounter === receipt.turnCounter)
              .map((item) => item.code);
            turnAudits.push({
              turnCounter: receipt.turnCounter,
              phaseId: phase.id,
              pacing: phase.settings.pacing,
              settings: structuredClone(phase.settings),
              candidateAudit,
              receipt: {
                planningCalled: receipt.planningCalled,
                planningSucceeded: receipt.planningSucceeded,
                planOrigin: receipt.planOrigin,
                planMode: receipt.planMode,
                inputCandidateCount: receipt.inputCandidateCount,
                inputCharacterCount: receipt.inputCharacterCount,
                estimatedInputTokens: receipt.estimatedInputTokens,
                primarySource: receipt.primarySourceRef
                  ? dramaRefKey(receipt.primarySourceRef)
                  : undefined,
                supportSources: receipt.supportSourceRefs.map(dramaRefKey),
                usedSources: receipt.usedSourceRefs.map(dramaRefKey),
                traceStatus: receipt.traceStatus,
                persistentWriteCount: receipt.persistentWriteCount,
                newActorCount: receipt.newActorCount ?? 0,
                degradeReason: receipt.degradeReason,
                filterRuleIds: [...receipt.filterRuleIds]
              },
              diagnosticCodes,
              backgroundLastRunStatus:
                state.backgroundEvolution.lastRun?.status,
              stateSnapshot: runtimeSnapshot(state)
            });
            completedTurns += 1;
            phaseCompletedTurns += 1;

            if (
              completedTurns <= 5 ||
              completedTurns % 5 === 0 ||
              phaseTurnIndex === phase.turns - 1
            ) {
              samples.push({
                turnCounter: state.turnCounter,
                phaseId: phase.id,
                actionSource: action.source,
                playerInput: action.text,
                narrativeCharacters: narratorEntry.text.length,
                summaryText: narratorEntry.summaryText,
                suggestedActions: narratorEntry.suggestedActions ?? [],
                pacing: phase.settings.pacing,
                planningCalled: receipt.planningCalled,
                planningSucceeded: receipt.planningSucceeded,
                planOrigin: receipt.planOrigin,
                planMode: receipt.planMode,
                primarySource: receipt.primarySourceRef
                  ? `${receipt.primarySourceRef.providerId}:${receipt.primarySourceRef.sourceType}:${receipt.primarySourceRef.sourceId}`
                  : undefined,
                usedSources: receipt.usedSourceRefs.map(
                  (ref) => `${ref.providerId}:${ref.sourceType}:${ref.sourceId}`
                ),
                traceStatus: receipt.traceStatus,
                backgroundLastRunStatus: state.backgroundEvolution.lastRun?.status
              });
            }

            const checkpoint: ContinuousCheckpoint = {
              schemaVersion: 2,
              generatedAt: new Date().toISOString(),
              completedTurns,
              phaseIndex:
                phaseTurnIndex + 1 >= phase.turns ? phaseIndex + 1 : phaseIndex,
              phaseTurnIndex:
                phaseTurnIndex + 1 >= phase.turns ? 0 : phaseTurnIndex + 1,
              state,
              receipts,
              phaseResults,
              samples,
              turnAudits
            };
            await mkdir(path.dirname(continuousCheckpointPath), {
              recursive: true
            });
            await writeFile(
              continuousCheckpointPath,
              `${JSON.stringify(checkpoint)}\n`,
              'utf8'
            );
            await writeFile(
              continuousSamplesPath,
              `${JSON.stringify(samples, null, 2)}\n`,
              'utf8'
            );
            trace(
              `continuous:${phase.id}: completed=${phaseCompletedTurns}/${phase.turns} ` +
                `total=${completedTurns}/${targetTurns} turn=${state.turnCounter} ` +
                `plan=${receipt.planMode ?? 'none'} trace=${receipt.traceStatus ?? 'none'} ` +
                `actors=${Object.keys(state.actors).length} matters=${Object.keys(state.dynamicEvents.currentMatters).length}`
            );
            await sleep(turnDelayMs);
          } catch (error) {
            phaseError = safeError(error);
            break;
          }
        }

        const sourceUseCounts = countValues(
          phaseReceipts.flatMap((item) =>
            item.usedSourceRefs.map((ref) => `${ref.providerId}:${ref.sourceType}`)
          )
        );
        const phaseResult: ContinuousPhaseResult = {
          id: phase.id,
          pacing: phase.settings.pacing,
          targetTurns: phase.turns,
          completedTurns: phaseCompletedTurns,
          startedAtTurn,
          finishedAtTurn: state.turnCounter,
          planningCalledCount: phaseReceipts.filter((item) => item.planningCalled).length,
          planningSucceededCount: phaseReceipts.filter(
            (item) => item.planningSucceeded
          ).length,
          localFallbackCount: phaseReceipts.filter(
            (item) => item.planOrigin === 'local_fallback'
          ).length,
          traceCount: phaseReceipts.filter((item) => Boolean(item.traceStatus)).length,
          quietPlanCount: phaseReceipts.filter((item) => item.planMode === 'quiet').length,
          persistentWriteCount: phaseReceipts.reduce(
            (sum, item) => sum + item.persistentWriteCount,
            0
          ),
          newActorCount: phaseReceipts.reduce(
            (sum, item) => sum + (item.newActorCount ?? 0),
            0
          ),
          sourceUseCounts,
          planModeCounts: countValues(phaseReceipts.map((item) => item.planMode)),
          planOriginCounts: countValues(phaseReceipts.map((item) => item.planOrigin)),
          startSnapshot,
          endSnapshot: runtimeSnapshot(state),
          accepted:
            !phaseError &&
            phaseCompletedTurns === phase.turns &&
            (phase.settings.pacing === 'original'
              ? phaseReceipts.every((item) => !item.planningCalled)
              : phaseReceipts.every((item) => item.planningCalled)),
          error: phaseError
        };
        phaseResults.push(phaseResult);
        const phaseCheckpoint: ContinuousCheckpoint = {
          schemaVersion: 2,
          generatedAt: new Date().toISOString(),
          completedTurns,
          phaseIndex: phaseIndex + 1,
          phaseTurnIndex: 0,
          state,
          receipts,
          phaseResults,
          samples,
          turnAudits
        };
        await writeFile(
          continuousCheckpointPath,
          `${JSON.stringify(phaseCheckpoint)}\n`,
          'utf8'
        );
        await writeFile(
          outputPath,
          `${JSON.stringify(
            {
              schemaVersion: 2,
              generatedAt: new Date().toISOString(),
              mode: 'single-save-continuous',
              requestedTurns: targetTurns,
              completedTurns,
              routeCandidates: routeChoices.map((item) => ({
                profileName: item.profile.name,
                model: item.model
              })),
              providerSwitches,
              openings: openingResults,
              phases: phaseResults,
              turnAudits,
              finalSnapshot: runtimeSnapshot(state),
              http: {
                requestCount: audits.length,
                statusCounts: countValues(
                  audits.map((item) =>
                    item.status === null ? 'network_error' : String(item.status)
                  )
                ),
                routeCounts: countValues(audits.map((item) => item.route)),
                providerCounts: countValues(audits.map((item) => item.provider))
              },
              safety: {
                containsApiKeys: false,
                containsPrompts: false,
                containsRawNarratorResponses: false,
                containsNarrativeText: false
              }
            },
            null,
            2
          )}\n`,
          'utf8'
        );
        if (phaseError) break;
      }

      const report = JSON.parse(await readFile(outputPath, 'utf8')) as {
        completedTurns: number;
        phases: ContinuousPhaseResult[];
      };
      expect(report.completedTurns).toBe(targetTurns);
      expect(state.turnCounter).toBe(initialTurnCounter + targetTurns);
      expect(report.phases).toHaveLength(phases.length);
      expect(report.phases.every((item) => item.accepted)).toBe(true);
      return;
    }

    const scenarios: Array<{
      id: string;
      pacing: DramaPacingPreset;
      identity: CurrentIdentity;
      state: RuntimeState;
    }> = openingsOnly ? [] : [
      {
        id: 'original_police',
        pacing: 'original',
        identity: 'police',
        state: structuredClone(openingStates.police!)
      },
      {
        id: 'life_civilian',
        pacing: 'life',
        identity: 'civilian',
        state: structuredClone(openingStates.civilian!)
      },
      {
        id: 'balanced_triad',
        pacing: 'balanced',
        identity: 'gang_member',
        state: structuredClone(openingStates.gang_member!)
      },
      {
        id: 'dramatic_police',
        pacing: 'dramatic',
        identity: 'police',
        state: structuredClone(openingStates.police!)
      },
      {
        id: 'cinematic_civilian',
        pacing: 'cinematic',
        identity: 'civilian',
        state: structuredClone(openingStates.civilian!)
      }
    ];

    for (const scenario of scenarios) {
      const dramaticContent = createDramaSettings(scenario.pacing);
      const targetTurns = scenarioTurns(scenario.pacing);
      let state = seedDramaSources(scenario.state, scenario.id);
      state = {
        ...state,
        dramaticContent: {
          ...(state.dramaticContent ?? {
            instances: [],
            recentDiagnostics: []
          }),
          settings: dramaticContent,
          recentExecutions: []
        }
      };
      const scenarioSwitchStart = providerSwitches.length;
      trace(
        `${scenario.id}: start identity=${scenario.identity} pacing=${scenario.pacing} target=${targetTurns}`
      );
      let scenarioError: string | undefined;
      let completedTurns = 0;
      const scenarioReceipts: DramaExecutionReceipt[] = [];

      for (let index = 0; index < targetTurns; index += 1) {
        try {
          state = await executeWithRetry(
            `${scenario.id}:turn_${index + 1}`,
            () => settingsForRoute(importedSettings, currentRoute(), dramaticContent),
            async (settings) => {
              const clients = createClients(settings);
              return runPlayerTurn({
                state,
                playerInput: actionForIdentity(scenario.identity, index),
                narrator: clients.narrator,
                auxiliaryGeneration:
                  scenario.pacing === 'original' ? undefined : clients.auxiliaryGeneration,
                auxiliaryGenerationMode:
                  scenario.pacing === 'original' ? 'disabled' : 'custom',
                writebackRepairMode: 'follow-main',
                gameSettings: settings.game,
                promptSettings: settings.prompts,
                tavernSettings: settings.tavern,
                onStageChange: (stage) => {
                  if (
                    stage === 'planning_dramatic_content' ||
                    stage === 'generating_narrative' ||
                    stage === 'finalizing_turn'
                  ) {
                    trace(`${scenario.id}:turn_${index + 1}:stage=${stage}`);
                  }
                }
              });
            }
          );
          if (state.player.currentIdentity !== scenario.identity) {
            throw new Error(
              `身份被意外改变：expected=${scenario.identity}, actual=${state.player.currentIdentity}`
            );
          }
          const receipt = state.dramaticContent?.recentExecutions?.at(-1);
          if (receipt) scenarioReceipts.push(receipt);
          completedTurns += 1;
          trace(
            `${scenario.id}: completed=${index + 1}/${targetTurns} ` +
              `turn=${state.turnCounter} plan=${receipt?.planMode ?? 'none'} ` +
              `trace=${receipt?.traceStatus ?? 'none'}`
          );
          await sleep(turnDelayMs);
        } catch (error) {
          scenarioError = safeError(error);
          break;
        }
      }

      const analysis = analyzeReceipts(
        scenarioReceipts,
        state.dramaticContent?.recentDiagnostics ?? [],
        scenario.pacing !== 'original'
      );
      const result: ScenarioResult = {
        id: scenario.id,
        pacing: scenario.pacing,
        identity: scenario.identity,
        targetTurns,
        completedTurns,
        ...analysis,
        providerSwitches: providerSwitches.slice(scenarioSwitchStart),
        finalActorCount: Object.keys(state.actors).length,
        finalMatterCount: Object.keys(state.dynamicEvents.currentMatters).length,
        finalSignalCount: Object.keys(state.dynamicEvents.signals).length,
        finalNewsCount: Object.keys(state.dynamicEvents.newsIssues).length,
        accepted:
          !scenarioError &&
          state.turnCounter >= scenario.state.turnCounter + targetTurns &&
          analysis.accepted,
        error: scenarioError
      };
      results.push(result);
      trace(
        `${scenario.id}: accepted=${result.accepted} completed=${result.completedTurns}/${targetTurns} ` +
          `planning=${result.planningSucceededCount}/${result.planningCalledCount} ` +
          `degrade=${JSON.stringify(result.degradeReasonCounts)}`
      );
    }

    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      settingsSource: path.basename(settingsPath),
      routeCandidates: routeChoices.map((item) => ({
        profileName: item.profile.name,
        model: item.model
      })),
      providerSwitches,
      openings: openingResults,
      requestedTurns: results.reduce((sum, item) => sum + item.targetTurns, 0),
      completedTurns: results.reduce((sum, item) => sum + item.completedTurns, 0),
      scenarios: results,
      http: {
        requestCount: audits.length,
        statusCounts: countValues(
          audits.map((item) => (item.status === null ? 'network_error' : String(item.status)))
        ),
        routeCounts: countValues(audits.map((item) => item.route)),
        providerCounts: countValues(audits.map((item) => item.provider)),
        minHeaderMs: audits.length > 0 ? Math.min(...audits.map((item) => item.responseMs)) : 0,
        maxHeaderMs: audits.length > 0 ? Math.max(...audits.map((item) => item.responseMs)) : 0
      },
      narratorShapes: {
        responseCount: narratorShapeAudits.length,
        topLevelPlanCount: narratorShapeAudits.filter((item) => item.hasTopLevelPlan).length,
        topLevelTraceCount: narratorShapeAudits.filter((item) => item.hasTopLevelTrace).length,
        nestedTraceCount: narratorShapeAudits.filter((item) => item.hasNestedTrace).length
      },
      safety: {
        containsApiKeys: false,
        containsPrompts: false,
        containsRawNarratorResponses: false,
        containsNarrativeText: false
      }
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(report.requestedTurns).toBe(
      scenarios.reduce((sum, item) => sum + scenarioTurns(item.pacing), 0)
    );
    expect(report.completedTurns).toBe(report.requestedTurns);
    if (openingsOnly) {
      expect(openingResults).toHaveLength(skipRealOpenings ? 0 : 3);
      expect(openingResults.every((item) => item.accepted)).toBe(true);
      expect(results).toHaveLength(0);
      return;
    }
    expect(results).toHaveLength(5);
    expect(results.every((item) => item.accepted)).toBe(true);
    expect(results.find((item) => item.pacing === 'original')?.planningCalledCount).toBe(0);
    expect(
      results
        .filter((item) => item.pacing !== 'original')
        .every((item) =>
          item.planningCalledCount > 0 &&
          (item.targetTurns < 5 || (
            item.planningSucceededCount > 0 &&
            item.traceCount > 0
          ))
        )
    ).toBe(true);
  });
});
