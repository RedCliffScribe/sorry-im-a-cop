import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectContext } from '../../src/domain/context/selectContext';
import { compressNpcMemories } from '../../src/domain/memory/compressNpcMemories';
import { createMemoryEmbeddingClientFromSettings } from '../../src/domain/memory/createMemoryEmbeddingClientFromSettings';
import { createMemorySummaryClientFromSettings } from '../../src/domain/memory/createMemorySummaryClientFromSettings';
import { indexActiveNpcMemories } from '../../src/domain/memory/npcMemoryLayers';
import { createNpcSimulationClientFromSettings } from '../../src/domain/npc/createNpcSimulationClientFromSettings';
import {
  runNpcSimulation,
  selectNpcSimulationMemoryProjection
} from '../../src/domain/npc/npcSimulation';
import { createActorDefaults } from '../../src/domain/runtime/actorFactory';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type { MemoryItem, RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import type { AiSettings, FeatureRouteId } from '../../src/domain/settings/types';
import { TurnUsageMeter } from '../../src/domain/turn/TurnUsageMeter';

const shouldRun = process.env.COPV2_RUN_NPC_MEMORY_REAL_API === '1';
const relativeDatePattern = /今天|昨日|昨天|明天|今晚|昨晚|前晚|翌日/;
const anchorPattern = /HKM-(?:SHORT|MID|LONG)-\d+/g;

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

interface SummaryScenarioResult {
  scenario: string;
  sourceTier: MemoryItem['tier'];
  targetTier: MemoryItem['tier'];
  success: boolean;
  diagnosticCode?: string;
  summaryText?: string;
  summaryChars?: number;
  anchorRetained: boolean;
  hasAbsoluteDate: boolean;
  avoidsRelativeDate: boolean;
  novelAnchors: string[];
  coldSourceCount: number;
  coldSourcesWithoutVectors: boolean;
  sourcePreservedOnFailure: boolean;
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

function usageFromPayload(payload: unknown): Pick<
  HttpAuditEntry,
  'promptTokens' | 'completionTokens' | 'totalTokens'
> {
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

function createAuditedFetch(route: TurnApiRoute, audits: HttpAuditEntry[]) {
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
        route,
        path: requestPath,
        status: response.status,
        responseMs: Math.round(performance.now() - startedAt),
        ...usage
      });
      return response;
    } catch (error) {
      audits.push({
        route,
        path: requestPath,
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

function gameTime(index: number): RuntimeState['time'] {
  const date = new Date(Date.UTC(1984, 10, 1, 9, 0) + index * 86_400_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function formatDate(time: RuntimeState['time']): string {
  return `${time.year}年${time.month}月${time.day}日`;
}

function createActorMemory(
  memoryId: string,
  actorId: string,
  tier: MemoryItem['tier'],
  time: RuntimeState['time'],
  text: string
): MemoryItem {
  return {
    memoryId,
    text,
    kind: 'actor',
    tier,
    relatedActorIds: [actorId],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    relatedTurnId: `turn_${memoryId}`,
    gameTime: { ...time },
    importance: 50,
    visibility: 'player_known',
    certainty: 'fact',
    embeddingText: text,
    embeddingVector: [0.2, 0.4, 0.6, 0.8],
    embeddingModel: 'real-api-test-seed',
    embeddingUpdatedAt: '2026-07-17T00:00:00.000Z'
  };
}

function createCompressionScenario(sourceTier: NonNullable<MemoryItem['tier']>, scenarioIndex: number) {
  const state = createInitialRuntimeState();
  const tierLabel = sourceTier === 'short_term' ? 'SHORT' : sourceTier === 'mid_term' ? 'MID' : 'LONG';
  const actorId = `npc_real_${tierLabel.toLowerCase()}_${scenarioIndex}`;
  const actorName = `中测人物${tierLabel}${scenarioIndex}`;
  const anchor = `HKM-${tierLabel}-${scenarioIndex}`;
  const sourceCount = sourceTier === 'short_term' ? 17 : 7;
  const batchSize = sourceTier === 'short_term' ? 8 : sourceTier === 'mid_term' ? 4 : 3;
  const targetTier = sourceTier === 'short_term' ? 'mid_term' : 'long_term';
  const sourceIds: string[] = [];

  state.actors[actorId] = createActorDefaults({
    actorId,
    name: actorName,
    currentIdentity: 'civilian',
    profileSummary: '用于真实 API 人物记忆压缩中测的隔离角色。',
    relationshipSummary: '与玩家有一项会持续影响未来行为的明确承诺。',
    currentPlaceId: state.location.currentPlaceId,
    presence: 'mentioned',
    visibility: 'player_known',
    importance: 70
  });

  for (let index = 1; index <= sourceCount; index += 1) {
    const time = gameTime(scenarioIndex * 20 + index);
    const memoryId = `memory_${actorId}_${String(index).padStart(2, '0')}`;
    const durable = index <= batchSize;
    const text = durable
      ? `${formatDate(time)}，${actorName}与玩家再次确认长期承诺 ${anchor}：未经双方当面确认，不向第三人交出寄存的证物袋；这是会持续影响信任和后续行为的约定。`
      : `${formatDate(time)}，${actorName}与玩家在茶餐厅简短寒暄，未形成新的承诺、恩怨或关系变化。`;
    state.memories[memoryId] = createActorMemory(memoryId, actorId, sourceTier, time, text);
    sourceIds.push(memoryId);
  }
  state.turnCounter = scenarioIndex;
  state.time = gameTime(scenarioIndex * 20 + sourceCount + 1);
  return { state, actorId, anchor, sourceIds, batchSize, sourceTier, targetTier };
}

function routeMetadata(settings: AiSettings, routeId: FeatureRouteId) {
  const route = settings.featureRoutes[routeId];
  if (route.mode !== 'custom') return { routeId, mode: route.mode };
  const profile = settings.apiProfiles.find((item) => item.id === route.apiProfileId);
  return {
    routeId,
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

describe.skipIf(!shouldRun)('NPC memory real API medium test', () => {
  it('runs 30 live requests through the configured production routes', async () => {
    const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH;
    if (!settingsPath) throw new Error('COPV2_REAL_API_SETTINGS_PATH is required.');

    const settings = importApiSettings(
      createDefaultAiSettings(),
      await readFile(settingsPath, 'utf8')
    );
    const audits: HttpAuditEntry[] = [];
    const meter = new TurnUsageMeter();
    const summaryClient = createMemorySummaryClientFromSettings(
      settings,
      createAuditedFetch('memorySummary', audits)
    );
    const embeddingClient = createMemoryEmbeddingClientFromSettings(
      settings,
      createAuditedFetch('memoryEmbedding', audits)
    );
    const simulationClient = createNpcSimulationClientFromSettings(
      settings,
      createAuditedFetch('npcSimulation', audits)
    );
    if (!summaryClient || !embeddingClient || !simulationClient) {
      throw new Error('One or more configured NPC-memory API routes are unavailable.');
    }

    const measuredSummary = meter.wrapNarrator('memorySummary', summaryClient);
    const measuredEmbedding = meter.wrapMemoryEmbedding(embeddingClient);
    const measuredSimulation = meter.wrapNarrator('npcSimulation', simulationClient);
    const scenarioTiers: Array<NonNullable<MemoryItem['tier']>> = [
      ...Array.from({ length: 8 }, () => 'short_term' as const),
      ...Array.from({ length: 6 }, () => 'mid_term' as const),
      ...Array.from({ length: 6 }, () => 'long_term' as const)
    ];
    const summaryResults: SummaryScenarioResult[] = [];

    for (let index = 0; index < scenarioTiers.length; index += 1) {
      const scenario = createCompressionScenario(scenarioTiers[index], index + 1);
      const initialIds = new Set(Object.keys(scenario.state.memories));
      const result = await compressNpcMemories(
        scenario.state,
        measuredSummary,
        settings.prompts,
        { maxOperations: 1 }
      );
      const diagnostic = result.diagnostics[0];
      const target = Object.values(result.state.memories).find(
        (memory) => !initialIds.has(memory.memoryId) && memory.tier === scenario.targetTier
      );
      const coldSources = scenario.sourceIds
        .map((memoryId) => result.state.memories[memoryId])
        .filter((memory) => Boolean(memory?.compressedIntoMemoryId));
      const summaryText = target?.text;
      const discoveredAnchors = summaryText?.match(anchorPattern) ?? [];
      const activeLayers = indexActiveNpcMemories(result.state.memories, {
        includeHidden: true,
        includePrivate: true
      }).get(scenario.actorId);
      const sourcePreservedOnFailure = result.operationCount === 1 || scenario.sourceIds.every((memoryId) => {
        const memory = result.state.memories[memoryId];
        return Boolean(memory && !memory.compressedIntoMemoryId);
      });

      summaryResults.push({
        scenario: `${scenario.sourceTier}-${index + 1}`,
        sourceTier: scenario.sourceTier,
        targetTier: scenario.targetTier,
        success: result.operationCount === 1 && Boolean(target),
        diagnosticCode: diagnostic?.code,
        summaryText,
        summaryChars: summaryText?.length,
        anchorRetained: Boolean(summaryText?.includes(scenario.anchor)),
        hasAbsoluteDate: Boolean(summaryText && /(?:19|20)\d{2}年\d{1,2}月/.test(summaryText)),
        avoidsRelativeDate: Boolean(summaryText && !relativeDatePattern.test(summaryText)),
        novelAnchors: discoveredAnchors.filter((anchor) => anchor !== scenario.anchor),
        coldSourceCount: coldSources.length,
        coldSourcesWithoutVectors: coldSources.every(
          (memory) => !memory.embeddingText && !memory.embeddingVector && !memory.embeddingModel
        ),
        sourcePreservedOnFailure
      });

      if (result.operationCount === 1) {
        expect(coldSources).toHaveLength(scenario.batchSize);
        expect(activeLayers?.shortTerm.length ?? 0).toBeLessThanOrEqual(16);
        expect(activeLayers?.midTerm.length ?? 0).toBeLessThanOrEqual(6);
        expect(activeLayers?.longTerm.length ?? 0).toBeLessThanOrEqual(6);
      }
      console.log(`[real-api] memory summary ${index + 1}/20: ${diagnostic?.code ?? 'no-diagnostic'}`);
    }

    const vectorState = createInitialRuntimeState();
    const vectorActorId = 'npc_real_vector_zhong_chuhong';
    const vectorActorName = '钟楚虹';
    vectorState.actors[vectorActorId] = createActorDefaults({
      actorId: vectorActorId,
      name: vectorActorName,
      aliases: ['阿红'],
      currentIdentity: 'civilian',
      profileSummary: '电影演员，与玩家有需要保密承接的私人委托。',
      relationshipSummary: '信任玩家保管一件私人摄影物品。',
      currentPlaceId: 'place_vector_remote',
      presence: 'mentioned',
      visibility: 'player_known',
      importance: 85
    });
    const sceneId = vectorState.location.currentSceneId!;
    vectorState.scenes[sceneId] = {
      ...vectorState.scenes[sceneId],
      presentActorIds: [vectorState.player.actorId]
    };
    const vectorMemoryTexts = [
      '1984年12月3日，钟楚虹把一卷尚未冲洗的私人摄影胶卷交给玩家保管，明确约定只能亲手交还给她本人。',
      '1984年12月5日，钟楚虹谈到新片试镜安排，希望不要让片场记者提前知道。',
      '1984年12月8日，钟楚虹在茶餐厅提到母亲最近睡得不好，但未要求玩家介入。',
      '1984年12月11日，钟楚虹请玩家留意片场外围是否有陌生记者跟踪。',
      '1984年12月14日，钟楚虹与玩家简短通话，确认她已经安全回家。'
    ];
    const vectorMemoryIds: string[] = [];
    const vectorFailures: string[] = [];
    for (let index = 0; index < vectorMemoryTexts.length; index += 1) {
      const memoryId = `memory_vector_${index + 1}`;
      vectorMemoryIds.push(memoryId);
      try {
        const embedding = await measuredEmbedding.embed(vectorMemoryTexts[index]);
        const memory = createActorMemory(
          memoryId,
          vectorActorId,
          'short_term',
          gameTime(70 + index),
          vectorMemoryTexts[index]
        );
        memory.embeddingVector = embedding;
        memory.embeddingModel = measuredEmbedding.model;
        vectorState.memories[memoryId] = memory;
      } catch (error) {
        vectorFailures.push(safeError(error));
      }
      console.log(`[real-api] vector embedding ${index + 1}/6`);
    }
    const vectorQuery = '我想找钟楚虹，把托我守住、只可亲手还给她的那卷相片胶卷交回去。';
    let queryEmbedding: number[] | undefined;
    try {
      queryEmbedding = await measuredEmbedding.embed(vectorQuery);
    } catch (error) {
      vectorFailures.push(safeError(error));
    }
    console.log('[real-api] vector embedding 6/6');
    vectorState.time = gameTime(90);
    const vectorContext = selectContext(vectorState, vectorQuery, { queryEmbedding });
    const targetVectorEntry = vectorContext.npcMemoryProjection.entries.find(
      (entry) => entry.memoryId === vectorMemoryIds[0]
    );
    const vectorResult = {
      requestedCalls: 6,
      successfulCalls: 6 - vectorFailures.length,
      failures: vectorFailures,
      candidateMemoryIds: vectorMemoryIds,
      selectedMemoryIds: vectorContext.npcMemoryProjection.diagnostics.selectedMemoryIds,
      targetMemoryId: vectorMemoryIds[0],
      targetRecalled: Boolean(targetVectorEntry),
      targetReasons: targetVectorEntry?.reasons ?? [],
      targetVectorScore: targetVectorEntry?.vectorScore,
      selectedCount: vectorContext.npcMemoryProjection.entries.length
    };

    const simulationState = vectorState;
    const secondActorId = 'npc_real_simulation_partner';
    simulationState.actors[vectorActorId] = {
      ...simulationState.actors[vectorActorId],
      currentPlaceId: simulationState.location.currentPlaceId,
      currentSceneId: sceneId,
      presence: 'present'
    };
    simulationState.actors[secondActorId] = createActorDefaults({
      actorId: secondActorId,
      name: '梁家辉',
      currentIdentity: 'civilian',
      profileSummary: '同场演员，观察力敏锐。',
      relationshipSummary: '与玩家保持礼貌但审慎的工作关系。',
      currentPlaceId: simulationState.location.currentPlaceId,
      currentSceneId: sceneId,
      presence: 'present',
      visibility: 'player_known',
      importance: 60
    });
    const secondMemoryId = 'memory_simulation_partner_1';
    simulationState.memories[secondMemoryId] = createActorMemory(
      secondMemoryId,
      secondActorId,
      'short_term',
      gameTime(89),
      '1985年1月29日，梁家辉答应若片场出现可疑记者，会先以暗号提醒玩家，不会当众声张。'
    );
    simulationState.scenes[sceneId] = {
      ...simulationState.scenes[sceneId],
      presentActorIds: [simulationState.player.actorId, vectorActorId, secondActorId]
    };
    const simulationInputs = [
      '我低声问钟楚虹，那卷私人胶卷现在是否适合交还。',
      '我提醒梁家辉留意门外记者，同时不要惊动片场其他人。',
      '我把话题转回先前的保密承诺，观察两人的即时反应。',
      '我准备离开前分别向两人确认下一次安全联络方式。'
    ];
    const simulationResults: Array<Record<string, unknown>> = [];
    for (let index = 0; index < simulationInputs.length; index += 1) {
      const context = selectContext(simulationState, simulationInputs[index], { queryEmbedding });
      const projection = selectNpcSimulationMemoryProjection(context);
      const result = await runNpcSimulation({
        context,
        playerInput: simulationInputs[index],
        client: measuredSimulation,
        promptSettings: settings.prompts
      });
      const mainIds = new Set(context.npcMemoryProjection.diagnostics.selectedMemoryIds);
      const subset = projection.diagnostics.selectedMemoryIds.every((memoryId) => mainIds.has(memoryId));
      simulationResults.push({
        scenario: index + 1,
        success: result.diagnostics.some((item) => item.code === 'npc_simulation_api_applied'),
        diagnosticCodes: result.diagnostics.map((item) => item.code ?? 'unknown'),
        presentReactionCount: result.package?.presentReactions.length ?? 0,
        remotePresenceCount: result.package?.remotePresence.length ?? 0,
        noteCount: result.package?.notes.length ?? 0,
        mainMemoryIds: [...mainIds],
        simulationMemoryIds: projection.diagnostics.selectedMemoryIds,
        simulationIsMainSubset: subset
      });
      console.log(`[real-api] NPC simulation ${index + 1}/4`);
    }

    const successfulSummaries = summaryResults.filter((item) => item.success);
    const summaryQuality = {
      requested: summaryResults.length,
      successful: successfulSummaries.length,
      anchorRetained: successfulSummaries.filter((item) => item.anchorRetained).length,
      hasAbsoluteDate: successfulSummaries.filter((item) => item.hasAbsoluteDate).length,
      avoidsRelativeDate: successfulSummaries.filter((item) => item.avoidsRelativeDate).length,
      within400Chars: successfulSummaries.filter((item) => (item.summaryChars ?? Infinity) <= 400).length,
      noNovelAnchors: successfulSummaries.filter((item) => item.novelAnchors.length === 0).length,
      coldVectorsRemoved: successfulSummaries.filter((item) => item.coldSourcesWithoutVectors).length,
      sourcePreservedOnFailure: summaryResults.filter((item) => item.sourcePreservedOnFailure).length
    };
    const successfulSimulations = simulationResults.filter((item) => item.success).length;
    const measuredUsage = meter.snapshot();
    const actualUsage = {
      entriesWithProviderUsage: audits.filter((item) => item.totalTokens !== undefined).length,
      promptTokens: audits.reduce((total, item) => total + (item.promptTokens ?? 0), 0),
      completionTokens: audits.reduce((total, item) => total + (item.completionTokens ?? 0), 0),
      totalTokens: audits.reduce((total, item) => total + (item.totalTokens ?? 0), 0)
    };
    const report = {
      test: 'npc-memory-real-api-medium',
      generatedAt: new Date().toISOString(),
      settingsFile: path.basename(settingsPath),
      credentialSafety: {
        keysLoadedInMemory: settings.apiProfiles.every((profile) => Boolean(profile.apiKey)),
        keyValuesRecorded: false
      },
      routes: [
        routeMetadata(settings, 'memorySummary'),
        routeMetadata(settings, 'memoryVector'),
        routeMetadata(settings, 'npcSimulation')
      ],
      requestPlan: {
        memorySummary: 20,
        memoryEmbedding: 6,
        npcSimulation: 4,
        total: 30
      },
      summaryQuality,
      summaryResults,
      vectorResult,
      simulation: {
        requested: simulationResults.length,
        successful: successfulSimulations,
        results: simulationResults
      },
      usage: {
        estimatedByProductionMeter: measuredUsage,
        providerReported: actualUsage
      },
      http: {
        requestCount: audits.length,
        statusCounts: statusCounts(audits),
        responseMs: {
          p50: percentile(audits.map((item) => item.responseMs), 0.5),
          p95: percentile(audits.map((item) => item.responseMs), 0.95),
          max: Math.max(0, ...audits.map((item) => item.responseMs))
        },
        entries: audits
      }
    };
    const reportText = `${JSON.stringify(report, null, 2)}\n`;
    const containsSecret = settings.apiProfiles.some(
      (profile) => Boolean(profile.apiKey) && reportText.includes(profile.apiKey)
    );
    if (containsSecret) throw new Error('Sanitized real-API report unexpectedly contains a credential.');

    const outputDirectory = path.resolve('output', 'npc-memory');
    await mkdir(outputDirectory, { recursive: true });
    const timestamp = report.generatedAt.replace(/[:.]/g, '-');
    const reportPath = path.join(outputDirectory, `real-api-medium-${timestamp}.json`);
    await writeFile(reportPath, reportText, 'utf8');
    console.log(`[real-api] sanitized report: ${reportPath}`);

    expect(audits).toHaveLength(30);
    expect(summaryQuality.successful).toBeGreaterThanOrEqual(18);
    expect(summaryQuality.anchorRetained).toBeGreaterThanOrEqual(16);
    expect(summaryQuality.hasAbsoluteDate).toBeGreaterThanOrEqual(18);
    expect(summaryQuality.avoidsRelativeDate).toBeGreaterThanOrEqual(18);
    expect(summaryQuality.within400Chars).toBe(summaryQuality.successful);
    expect(summaryQuality.noNovelAnchors).toBe(summaryQuality.successful);
    expect(summaryQuality.coldVectorsRemoved).toBe(summaryQuality.successful);
    expect(summaryQuality.sourcePreservedOnFailure).toBe(summaryResults.length);
    expect(vectorResult.successfulCalls).toBe(6);
    expect(vectorResult.targetRecalled).toBe(true);
    expect(vectorResult.targetReasons).toContain('vector_match');
    expect(successfulSimulations).toBeGreaterThanOrEqual(3);
    expect(simulationResults.every((item) => item.simulationIsMainSubset)).toBe(true);
  });
});
