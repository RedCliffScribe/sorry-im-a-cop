import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackgroundEvolutionClientFromSettings } from '../../src/domain/backgroundEvolution/createBackgroundEvolutionClientFromSettings';
import { runBackgroundEvolution } from '../../src/domain/backgroundEvolution/runBackgroundEvolution';
import { selectBackgroundEvolutionCandidates } from '../../src/domain/backgroundEvolution/selection';
import { addGameHours } from '../../src/domain/backgroundEvolution/time';
import { createActorDefaults } from '../../src/domain/runtime/actorFactory';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type { CaseFile, RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import type { NarratorClient } from '../../src/domain/narrator/NarratorClient';

const shouldRun = process.env.COPV2_RUN_BACKGROUND_EVOLUTION_REAL_API === '1';
const REQUEST_COUNT = Math.max(1, Number(process.env.COPV2_BACKGROUND_REAL_REQUEST_COUNT ?? 30));
const START_INDEX = Math.max(0, Number(process.env.COPV2_BACKGROUND_REAL_START_INDEX ?? 0));

type ScenarioKind =
  | 'case_create'
  | 'case_due'
  | 'relationship_create'
  | 'relationship_due'
  | 'organization_create'
  | 'organization_due'
  | 'city_due'
  | 'mixed';

interface HttpAuditEntry {
  route: TurnApiRoute;
  path: string;
  status: number | null;
  responseMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  error?: string;
}

interface ScenarioResult {
  request: number;
  scenario: ScenarioKind;
  status: string;
  appliedPatchCount: number;
  droppedPatchCount: number;
  diagnosticCodes: string[];
  diagnosticDetails: string[];
  selectedNpcCount: number;
  selectedOrganizationCount: number;
  selectedCityCount: number;
  activeTrackCount: number;
  activeOrganizationTrackCount: number;
  organizationOutcomeCount: number;
  organizationMemoryCount: number;
  organizationProfileProtected: boolean;
  outcomeCount: number;
  chronicleCount: number;
  caseMemoryCount: number;
  playerStateProtected: boolean;
  relationshipCountProtected: boolean;
  foregroundCaseStatus: string | null;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 500);
}

function numberField(record: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function usageFromPayload(payload: unknown): Pick<HttpAuditEntry, 'promptTokens' | 'completionTokens' | 'totalTokens'> {
  if (!payload || typeof payload !== 'object') return {};
  const source = payload as Record<string, unknown>;
  const usageCandidate = source.usage ?? source.usageMetadata ?? source.usage_metadata;
  const usage = usageCandidate && typeof usageCandidate === 'object'
    ? (usageCandidate as Record<string, unknown>)
    : undefined;
  return {
    promptTokens: numberField(usage, 'prompt_tokens', 'promptTokenCount', 'input_tokens'),
    completionTokens: numberField(usage, 'completion_tokens', 'candidatesTokenCount', 'output_tokens'),
    totalTokens: numberField(usage, 'total_tokens', 'totalTokenCount')
  };
}

function createAuditedFetch(audits: HttpAuditEntry[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    let requestPath: string;
    try {
      requestPath = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
    } catch {
      requestPath = 'unknown';
    }
    try {
      const response = await fetch(input, init);
      let usage: ReturnType<typeof usageFromPayload> = {};
      if (response.ok) {
        try {
          usage = usageFromPayload(await response.clone().json());
        } catch {
          usage = {};
        }
      }
      audits.push({
        route: 'backgroundEvolution',
        path: requestPath,
        status: response.status,
        responseMs: Math.round(performance.now() - startedAt),
        ...usage
      });
      return response;
    } catch (error) {
      audits.push({
        route: 'backgroundEvolution',
        path: requestPath,
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

function applyRouteOverride(settings: AiSettings): AiSettings {
  const apiProfileId = process.env.COPV2_BACKGROUND_REAL_PROFILE_ID;
  const model = process.env.COPV2_BACKGROUND_REAL_MODEL;
  if (!apiProfileId && !model) return settings;
  if (!apiProfileId || !model) {
    throw new Error('Both COPV2_BACKGROUND_REAL_PROFILE_ID and COPV2_BACKGROUND_REAL_MODEL are required.');
  }
  if (!settings.apiProfiles.some((profile) => profile.id === apiProfileId)) {
    throw new Error(`Unknown background-evolution API profile: ${apiProfileId}`);
  }
  const maxTokensValue = Number(process.env.COPV2_BACKGROUND_REAL_MAX_TOKENS ?? 2048);
  if (!Number.isInteger(maxTokensValue) || maxTokensValue < 256) {
    throw new Error('COPV2_BACKGROUND_REAL_MAX_TOKENS must be an integer of at least 256.');
  }
  const temperatureValue = Number(process.env.COPV2_BACKGROUND_REAL_TEMPERATURE ?? 0.2);
  if (!Number.isFinite(temperatureValue) || temperatureValue < 0 || temperatureValue > 2) {
    throw new Error('COPV2_BACKGROUND_REAL_TEMPERATURE must be between 0 and 2.');
  }
  return {
    ...settings,
    featureRoutes: {
      ...settings.featureRoutes,
      backgroundEvolution: {
        mode: 'custom',
        apiProfileId,
        model,
        maxTokens: maxTokensValue,
        temperature: temperatureValue
      }
    }
  };
}

function addRemoteActor(state: RuntimeState, actorId: string, name: string): void {
  state.actors[actorId] = createActorDefaults({
    actorId,
    name,
    currentIdentity: 'police',
    publicIdentity: '便衣探员',
    positionSummary: '在远场负责调查与联络。',
    currentPlaceId: state.location.currentPlaceId,
    presence: 'absent',
    statusSummary: '正在处理自己的工作安排。',
    personality: '谨慎、务实。',
    motivation: '把已接手的事务办得有交代。',
    longTermGoal: '在警队内建立可靠声誉。',
    visibility: 'player_known'
  });
}

function addCase(state: RuntimeState, actorId: string, caseId: string): void {
  const caseFile: CaseFile = {
    caseId,
    title: '油麻地失车案',
    caseType: 'theft',
    status: 'investigating',
    playerRole: 'aware',
    leadActorId: actorId,
    leadActorName: state.actors[actorId].name,
    summary: '一辆私家车在夜间失窃，现有目击说法互相矛盾。',
    currentFocus: '核对果栏夜班工人的目击时间和附近货运记录。',
    playerVisibleProgress: '案件由非玩家主办人继续调查。',
    internalProgressSummary: '证据不足，不保证能找到可靠目击者或侦破案件。',
    relatedActorIds: [actorId],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: addGameHours(state.time, -48),
    updatedAt: addGameHours(state.time, -6)
  };
  state.cases[caseId] = caseFile;
}

function addRelationship(state: RuntimeState, actorId: string, threadId: string): void {
  state.relationshipThreads[threadId] = {
    threadId,
    kind: 'network',
    title: '长期警务联络',
    summary: '对方是已经确认会持续交换工作消息的正式联系人。',
    relatedActorIds: [actorId],
    primaryActorId: actorId,
    relationshipRole: '正式警务联系人',
    status: 'active',
    promiseSummary: '答应有可靠结果时主动通知玩家。',
    riskSummary: '无结果时不会为了维持关系而编造消息。',
    currentPull: '对方另有一项调查需要在远场处理。',
    nextNaturalBeatHint: '只有实际得到结果、受阻或需要协助时才回响。',
    creationBasis: 'ongoing_joint_matter',
    evidenceRefs: [
      {
        kind: 'current_turn',
        refId: 'current_turn',
        summary: '测试种子代表已验证的长期共同事务。'
      }
    ],
    milestones: [],
    visibility: 'player_known',
    importance: 50,
    createdAt: addGameHours(state.time, -72),
    updatedAt: addGameHours(state.time, -12)
  };
}

function addDueTrack(
  state: RuntimeState,
  actorId: string,
  trackId: string,
  options: { caseId?: string; threadId?: string }
): void {
  state.backgroundEvolution.npcTracks[trackId] = {
    trackId,
    actorId,
    status: 'active',
    actionKind: options.caseId ? 'case' : 'relationship',
    objective: options.caseId ? '核对失车案目击时间' : '处理已有长期联络事项',
    currentAction: options.caseId ? '在油麻地一带走访夜班工人' : '通过同事和公开渠道核实一项工作消息',
    currentStatus: '已进行一段时间，现已到复核节点',
    currentPlaceId: state.location.currentPlaceId,
    startedAt: addGameHours(state.time, -30),
    expectedEndAt: addGameHours(state.time, -1),
    nextReviewAt: addGameHours(state.time, -1),
    relatedActorIds: [actorId],
    relatedOrganizationIds: [],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: options.caseId ? [options.caseId] : [],
    relatedRelationshipThreadIds: options.threadId ? [options.threadId] : [],
    relatedCityTrackIds: [],
    relatedDeferredEventIds: [],
    lastEvolvedAt: addGameHours(state.time, -30),
    visibility: 'player_known'
  };
}

function addCityTrack(state: RuntimeState, trackId: string): void {
  state.citySituationTracks[trackId] = {
    trackId,
    title: '油麻地夜间货运收缩',
    trackType: 'market_pressure',
    status: 'active',
    pressureLevel: 2,
    visibility: 'public',
    startedAt: addGameHours(state.time, -24 * 5),
    nextReviewAt: addGameHours(state.time, -1),
    cadenceDays: 2,
    relatedOrganizationIds: [],
    relatedPowerFigureIds: [],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedActorIds: [],
    summary: '连续检查令部分夜间货运档口调整开工时间。',
    currentBeat: '档主正在商量是否统一登记夜班工人。',
    possibleDevelopments: ['维持登记', '压力升高', '逐步恢复']
  };
}

function addOrganizationScenario(state: RuntimeState, actorId: string, due: boolean): void {
  const organizationId = 'org_tvb';
  const actor = state.actors[actorId];
  actor.organizationIds = [organizationId];
  actor.organizationRelations = [
    {
      organizationId,
      relationType: 'employee',
      roleTitle: '新闻采访协调员',
      summary: '负责联系采访对象与新闻编辑台。',
      visibility: 'player_known'
    }
  ];
  state.actors.player.organizationRelations.push({
    organizationId,
    relationType: 'contractor',
    summary: '玩家与电视台有一次持续中的采访协作。',
    visibility: 'player_known'
  });
  state.organizations[organizationId].relatedActorIds = [actorId];
  if (!due) return;
  state.backgroundEvolution.organizationTracks.track_real_tvb = {
    trackId: 'track_real_tvb',
    organizationId,
    status: 'active',
    objective: '完成一轮与街头治安有关的晚间采访',
    currentAction: '协调采访对象、记者与晚间新闻编辑台',
    currentStatus: '已联络一轮，现已到复核节点',
    startedAt: addGameHours(state.time, -30),
    expectedEndAt: addGameHours(state.time, -1),
    nextReviewAt: addGameHours(state.time, -1),
    relatedActorIds: [actorId],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: [],
    relatedCityTrackIds: [],
    lastEvolvedAt: addGameHours(state.time, -30),
    visibility: 'player_known'
  };
}

function createScenarioState(kind: ScenarioKind, requestIndex: number): RuntimeState {
  const state = createInitialRuntimeState();
  state.time = addGameHours(state.time, requestIndex * 12);
  state.citySituationTracks = {};
  state.cases = {};
  state.relationshipThreads = {};
  state.backgroundEvolution = {
    npcTracks: {},
    organizationTracks: {},
    recentOutcomes: [],
    chronicle: []
  };
  const actorId = `npc_real_background_${requestIndex}`;
  const caseId = `case_real_background_${requestIndex}`;
  const threadId = `relationship_real_background_${requestIndex}`;
  const cityTrackId = `city_real_background_${requestIndex}`;

  if (kind !== 'city_due') addRemoteActor(state, actorId, `刘启${requestIndex}`);
  if (kind === 'case_create' || kind === 'case_due' || kind === 'mixed') addCase(state, actorId, caseId);
  if (kind === 'relationship_create' || kind === 'relationship_due' || kind === 'mixed') addRelationship(state, actorId, threadId);
  if (kind === 'case_due') addDueTrack(state, actorId, `track_real_case_${requestIndex}`, { caseId });
  if (kind === 'relationship_due') addDueTrack(state, actorId, `track_real_relationship_${requestIndex}`, { threadId });
  if (kind === 'organization_create') addOrganizationScenario(state, actorId, false);
  if (kind === 'organization_due') addOrganizationScenario(state, actorId, true);
  if (kind === 'mixed') addDueTrack(state, actorId, `track_real_mixed_${requestIndex}`, { caseId, threadId });
  if (kind === 'city_due' || kind === 'mixed') addCityTrack(state, cityTrackId);
  return state;
}

function routeMetadata(settings: AiSettings) {
  const route = settings.featureRoutes.backgroundEvolution;
  if (route.mode !== 'custom') return { routeId: 'backgroundEvolution', mode: route.mode };
  const profile = settings.apiProfiles.find((item) => item.id === route.apiProfileId);
  return {
    routeId: 'backgroundEvolution',
    mode: route.mode,
    profileName: profile?.name ?? 'missing',
    interfaceType: profile?.interfaceType ?? 'missing',
    model: route.model,
    maxTokens: route.maxTokens ?? profile?.defaultMaxTokens
  };
}

function statusCounts(audits: HttpAuditEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const audit of audits) {
    const key = audit.status === null ? 'network_error' : String(audit.status);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function percentile(values: number[], percentage: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)];
}

describe.skipIf(!shouldRun)('background evolution real API medium test', () => {
  it('runs live background-evolution requests through the configured route', async () => {
    const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH;
    if (!settingsPath) throw new Error('COPV2_REAL_API_SETTINGS_PATH is required.');
    const settings = applyRouteOverride(
      importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'))
    );
    const audits: HttpAuditEntry[] = [];
    const baseClient = createBackgroundEvolutionClientFromSettings(settings, createAuditedFetch(audits));
    if (!baseClient) throw new Error('The configured backgroundEvolution route is disabled or incomplete.');
    let latestRawText: string;
    const client: NarratorClient = {
      complete: (prompt, options) => baseClient.complete(prompt, {
        ...options,
        onRawText: (value) => {
          latestRawText = value;
          options?.onRawText?.(value);
        }
      })
    };
    const allScenarios: ScenarioKind[] = [
      'case_create',
      'case_due',
      'relationship_create',
      'relationship_due',
      'organization_create',
      'organization_due',
      'city_due',
      'mixed'
    ];
    const scenarioOverride = process.env.COPV2_BACKGROUND_REAL_SCENARIO;
    if (scenarioOverride && !allScenarios.includes(scenarioOverride as ScenarioKind)) {
      throw new Error(`Unknown COPV2_BACKGROUND_REAL_SCENARIO: ${scenarioOverride}`);
    }
    const scenarios: ScenarioKind[] = scenarioOverride
      ? [scenarioOverride as ScenarioKind]
      : allScenarios;
    const results: ScenarioResult[] = [];

    for (let index = 0; index < REQUEST_COUNT; index += 1) {
      latestRawText = '';
      const request = START_INDEX + index + 1;
      const scenario = scenarios[(START_INDEX + index) % scenarios.length];
      const state = createScenarioState(scenario, request);
      const playerBefore = structuredClone(state.player);
      const organizationBefore = state.organizations.org_tvb
        ? structuredClone(state.organizations.org_tvb)
        : undefined;
      const relationshipCountBefore = Object.keys(state.relationshipThreads).length;
      const selection = selectBackgroundEvolutionCandidates({
        state,
        foregroundTurnId: `real_background_${request}`,
        manual: true
      });
      expect(selection.selectedReviewKeys.length).toBeGreaterThan(0);
      const result = await runBackgroundEvolution({
        state,
        selection,
        client,
        foregroundTurnId: `real_background_${request}`
      });
      const lastRun = result.state.backgroundEvolution.lastRun;
      const caseFile = Object.values(result.state.cases)[0];
      results.push({
        request,
        scenario,
        status: result.status,
        appliedPatchCount: lastRun?.appliedPatchCount ?? 0,
        droppedPatchCount: lastRun?.droppedPatchCount ?? 0,
        diagnosticCodes: result.diagnostics.map((issue) => issue.code),
        diagnosticDetails: result.diagnostics.map(
          (issue) => `${issue.path.join('.')}:${issue.code}:${issue.message.slice(0, 180)}`
        ),
        selectedNpcCount: selection.npcCandidates.length,
        selectedOrganizationCount: selection.organizationCandidates.length,
        selectedCityCount: selection.cityCandidates.length,
        activeTrackCount: Object.keys(result.state.backgroundEvolution.npcTracks).length,
        activeOrganizationTrackCount: Object.values(result.state.backgroundEvolution.organizationTracks)
          .filter((track) => track.status !== 'quiet').length,
        organizationOutcomeCount: result.state.backgroundEvolution.recentOutcomes.filter(
          (outcome) => outcome.sourceKind === 'organization'
        ).length,
        organizationMemoryCount: Object.values(result.state.memories).filter(
          (memory) => memory.kind === 'actor' && memory.relatedOrganizationIds.includes('org_tvb')
        ).length,
        organizationProfileProtected: !organizationBefore || [
          'organizationId',
          'name',
          'type',
          'summary',
          'publicKnowledge',
          'structureTree',
          'relatedActorIds',
          'relatedPlaceIds',
          'relatedCaseIds',
          'visibility',
          'importance'
        ].every((key) =>
          JSON.stringify(result.state.organizations.org_tvb?.[key as keyof typeof organizationBefore]) ===
          JSON.stringify(organizationBefore[key as keyof typeof organizationBefore])
        ),
        outcomeCount: result.state.backgroundEvolution.recentOutcomes.length,
        chronicleCount: result.state.backgroundEvolution.chronicle.length,
        caseMemoryCount: Object.values(result.state.memories).filter(
          (memory) => memory.kind === 'actor' && memory.relatedCaseIds.length > 0
        ).length,
        playerStateProtected: JSON.stringify(result.state.player) === JSON.stringify(playerBefore),
        relationshipCountProtected: Object.keys(result.state.relationshipThreads).length === relationshipCountBefore,
        foregroundCaseStatus: caseFile?.status ?? null
      });
      console.log(
        `[background-real-api] ${request}/${REQUEST_COUNT} ${scenario}: status=${result.status} applied=${lastRun?.appliedPatchCount ?? 0} dropped=${lastRun?.droppedPatchCount ?? 0} diagnostics=${result.diagnostics.map((issue) => issue.code).join(',') || 'none'}`
      );
      if (result.diagnostics.length > 0) {
        console.log(
          `[background-real-api-diagnostics] ${result.diagnostics
            .map((issue) => `${issue.path.join('.')}:${issue.code}:${issue.message.slice(0, 180)}`)
            .join(' | ')}`
        );
      }
      if (result.status === 'failed' && process.env.COPV2_BACKGROUND_REAL_LOG_RAW_FAILURE === '1') {
        console.log(`[background-real-api-raw-preview] ${safeError(latestRawText).slice(0, 800)}`);
      }
    }

    const succeeded = results.filter((item) => item.status === 'succeeded');
    const applied = results.filter((item) => item.appliedPatchCount > 0);
    const organizationScenarios = results.filter(
      (item) => item.scenario === 'organization_create' || item.scenario === 'organization_due'
    );
    const appliedOrganizationScenarios = organizationScenarios.filter((item) => item.appliedPatchCount > 0);
    const failed = results.filter((item) => item.status === 'failed');
    const report = {
      test: 'background-evolution-real-api-medium',
      generatedAt: new Date().toISOString(),
      settingsFile: path.basename(settingsPath),
      credentialSafety: {
        keysLoadedInMemory: settings.apiProfiles.some((profile) => Boolean(profile.apiKey)),
        keyValuesRecorded: false
      },
      route: routeMetadata(settings),
      requestPlan: {
        liveRequests: REQUEST_COUNT,
        startIndex: START_INDEX,
        scenarios,
        note: 'Each scenario uses a fresh bounded state so one model failure cannot contaminate later samples.'
      },
      summary: {
        succeeded: succeeded.length,
        failed: failed.length,
        appliedStateChanges: applied.length,
        allPlayerStateProtected: results.every((item) => item.playerStateProtected),
        allRelationshipCountsProtected: results.every((item) => item.relationshipCountProtected),
        allOrganizationProfilesProtected: results.every((item) => item.organizationProfileProtected),
        appliedOrganizationScenarios: appliedOrganizationScenarios.length,
        maxActiveTracks: Math.max(...results.map((item) => item.activeTrackCount)),
        maxActiveOrganizationTracks: Math.max(...results.map((item) => item.activeOrganizationTrackCount)),
        maxOutcomes: Math.max(...results.map((item) => item.outcomeCount)),
        maxChronicle: Math.max(...results.map((item) => item.chronicleCount))
      },
      http: {
        requestCount: audits.length,
        statusCounts: statusCounts(audits),
        responseMs: {
          p50: percentile(audits.map((item) => item.responseMs), 0.5),
          p95: percentile(audits.map((item) => item.responseMs), 0.95),
          max: Math.max(...audits.map((item) => item.responseMs))
        },
        tokenTotals: {
          prompt: audits.reduce((sum, item) => sum + (item.promptTokens ?? 0), 0),
          completion: audits.reduce((sum, item) => sum + (item.completionTokens ?? 0), 0),
          total: audits.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0)
        },
        errors: audits.filter((item) => item.error).map((item) => item.error)
      },
      results
    };
    const outputDirectory = path.resolve('output', 'background-evolution');
    await mkdir(outputDirectory, { recursive: true });
    const reportPath = path.join(outputDirectory, `real-api-${report.generatedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[background-real-api] report: ${reportPath}`);

    expect(audits).toHaveLength(REQUEST_COUNT);
    expect(succeeded.length).toBeGreaterThanOrEqual(Math.ceil(REQUEST_COUNT * 0.8));
    expect(applied.length).toBeGreaterThanOrEqual(Math.ceil(REQUEST_COUNT * 0.6));
    expect(results.every((item) => item.playerStateProtected)).toBe(true);
    expect(results.every((item) => item.relationshipCountProtected)).toBe(true);
    expect(results.every((item) => item.organizationProfileProtected)).toBe(true);
    expect(appliedOrganizationScenarios.length).toBeGreaterThanOrEqual(Math.ceil(organizationScenarios.length * 0.5));
    expect(Math.max(...results.map((item) => item.activeTrackCount))).toBeLessThanOrEqual(8);
    expect(Math.max(...results.map((item) => item.activeOrganizationTrackCount))).toBeLessThanOrEqual(12);
    expect(Math.max(...results.map((item) => item.outcomeCount))).toBeLessThanOrEqual(24);
    expect(Math.max(...results.map((item) => item.chronicleCount))).toBeLessThanOrEqual(256);
    expect(audits.every((item) => item.status !== null && item.status >= 200 && item.status < 300)).toBe(true);
  });
});
