import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackgroundEvolutionClientFromSettings } from '../../src/domain/backgroundEvolution/createBackgroundEvolutionClientFromSettings';
import { createMemoryEmbeddingClientFromSettings } from '../../src/domain/memory/createMemoryEmbeddingClientFromSettings';
import { createMemorySummaryClientFromSettings } from '../../src/domain/memory/createMemorySummaryClientFromSettings';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { createAuxiliaryGenerationClientFromSettings } from '../../src/domain/news/createAuxiliaryGenerationClientFromSettings';
import { createNpcSimulationClientFromSettings } from '../../src/domain/npc/createNpcSimulationClientFromSettings';
import { runOpening } from '../../src/domain/opening/runOpening';
import { missingActorProfileEnrichmentFields } from '../../src/domain/runtime/actorProfileEnrichment';
import type { OpeningSetup } from '../../src/domain/runtime/initialState';
import type { RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import { missingMinimumNewActorFields } from '../../src/domain/writeback/applyWriteback';
import { createWritebackRepairClientFromSettings } from '../../src/domain/writeback/createWritebackRepairClientFromSettings';

const shouldRun = process.env.COPV2_RUN_ACTOR_WRITEBACK_REAL_API === '1';
const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const requestedTurns = Math.trunc(Number(process.env.COPV2_ACTOR_WRITEBACK_TURNS ?? 24)) || 24;
const turnCount = Math.min(40, Math.max(20, requestedTurns));
const turnDelayMs = Math.max(0, Number(process.env.COPV2_ACTOR_WRITEBACK_TURN_DELAY_MS ?? 1200));
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_ACTOR_WRITEBACK_REQUEST_TIMEOUT_MS ?? 600_000)
);

interface HttpAuditEntry {
  route: TurnApiRoute;
  status: number | null;
  responseMs: number;
  error?: string;
}

interface TurnSnapshot {
  turn: number;
  actorCount: number;
  npcCount: number;
  pendingRecoveryCount: number;
  pendingProfileEnrichmentCount: number;
  incompleteOrdinaryProfileCount: number;
  minimumContractViolationCount: number;
  actorMemoryCount: number;
  actorKeyMemoryCount: number;
  relationshipThreadCount: number;
  npcEvolutionTrackCount: number;
  diagnostics: string[];
}

interface PendingRecoverySummary {
  actorId: string;
  name: string | null;
  attemptCount: number;
  nextRetryTurn: number | null;
  lastFailureKind: string | null;
}

interface PendingProfileEnrichmentSummary {
  actorId: string;
  missingFields: string[];
  attemptCount: number;
  nextRetryTurn: number | null;
  lastFailureKind: string | null;
  lastRouteMode: string | null;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 500);
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function createAuditedFetch(route: TurnApiRoute, audits: HttpAuditEntry[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
      (signal): signal is AbortSignal => Boolean(signal)
    );
    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
      audits.push({
        route,
        status: response.status,
        responseMs: Math.round(performance.now() - startedAt)
      });
      return response;
    } catch (error) {
      audits.push({
        route,
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

function createClients(settings: AiSettings, audits: HttpAuditEntry[]) {
  return {
    narrator: createNarratorClientFromSettings(settings, createAuditedFetch('mainNarrator', audits)),
    memoryEmbedding:
      createMemoryEmbeddingClientFromSettings(settings, createAuditedFetch('memoryEmbedding', audits)) ?? undefined,
    memorySummary:
      createMemorySummaryClientFromSettings(settings, createAuditedFetch('memorySummary', audits)) ?? undefined,
    writebackRepair:
      createWritebackRepairClientFromSettings(settings, createAuditedFetch('writebackRepair', audits)) ?? undefined,
    npcSimulation:
      createNpcSimulationClientFromSettings(settings, createAuditedFetch('npcSimulation', audits)) ?? undefined,
    backgroundEvolution:
      createBackgroundEvolutionClientFromSettings(settings, createAuditedFetch('backgroundEvolution', audits)) ??
      undefined,
    auxiliaryGeneration:
      createAuxiliaryGenerationClientFromSettings(settings, createAuditedFetch('auxiliaryGeneration', audits)) ??
      undefined
  };
}

function diagnosticCodes(state: RuntimeState): string[] {
  const latest = state.storyLog.at(-1);
  return [...new Set((latest?.writebackDiagnostics ?? []).map((issue) => issue.code ?? 'unclassified'))].sort();
}

function diagnosticDetails(state: RuntimeState) {
  return (state.storyLog.at(-1)?.writebackDiagnostics ?? [])
    .filter((issue) =>
      ['actor', 'writeback', 'incomplete_new_actor_patch', 'missing_actor_reference'].some((keyword) =>
        (issue.code ?? '').includes(keyword)
      )
    )
    .map((issue) => ({
      code: issue.code ?? 'unclassified',
      path: issue.path.join('.'),
      message: issue.message.slice(0, 300)
    }));
}

function pendingRecoverySummary(state: RuntimeState): PendingRecoverySummary[] {
  return state.pendingActorWritebackRecoveries.map((pending) => {
    const name = (() => {
      try {
        const parsed = JSON.parse(pending.writebackJson) as { actorPatch?: { name?: unknown } };
        return typeof parsed.actorPatch?.name === 'string' ? parsed.actorPatch.name : null;
      } catch {
        return null;
      }
    })();
    return {
      actorId: pending.actorId,
      name,
      attemptCount: pending.attemptCount,
      nextRetryTurn: pending.nextRetryTurn ?? null,
      lastFailureKind: pending.lastFailureKind ?? null
    };
  });
}

function pendingProfileEnrichmentSummary(state: RuntimeState): PendingProfileEnrichmentSummary[] {
  return (state.pendingActorProfileEnrichments ?? []).map((pending) => ({
    actorId: pending.actorId,
    missingFields: [...pending.missingFields].sort(),
    attemptCount: pending.attemptCount,
    nextRetryTurn: pending.nextRetryTurn ?? null,
    lastFailureKind: pending.lastFailureKind ?? null,
    lastRouteMode: pending.lastRouteMode ?? null
  }));
}

function minimumContractViolations(state: RuntimeState): string[] {
  return Object.values(state.actors)
    .filter((actor) => actor.actorId !== state.player.actorId)
    .flatMap((actor) =>
      missingMinimumNewActorFields(actor, state.time).map((field) => `${actor.actorId}:${field}`)
    )
    .sort();
}

function incompleteOrdinaryProfiles(state: RuntimeState): Array<{ actorId: string; missingFields: string[] }> {
  return Object.values(state.actors)
    .filter((actor) => actor.actorId !== state.player.actorId)
    .map((actor) => ({
      actorId: actor.actorId,
      missingFields: missingActorProfileEnrichmentFields(actor)
    }))
    .filter((item) => item.missingFields.length > 0)
    .sort((left, right) => left.actorId.localeCompare(right.actorId));
}

function createSnapshot(state: RuntimeState): TurnSnapshot {
  const playerActorId = state.player.actorId;
  return {
    turn: state.turnCounter,
    actorCount: Object.keys(state.actors).length,
    npcCount: Object.keys(state.actors).filter((actorId) => actorId !== playerActorId).length,
    pendingRecoveryCount: state.pendingActorWritebackRecoveries.length,
    pendingProfileEnrichmentCount: state.pendingActorProfileEnrichments?.length ?? 0,
    incompleteOrdinaryProfileCount: incompleteOrdinaryProfiles(state).length,
    minimumContractViolationCount: minimumContractViolations(state).length,
    actorMemoryCount: Object.values(state.memories).filter(
      (memory) => memory.kind === 'actor' && memory.relatedActorIds.some((actorId) => actorId !== playerActorId)
    ).length,
    actorKeyMemoryCount: Object.values(state.actors)
      .filter((actor) => actor.actorId !== playerActorId)
      .reduce((sum, actor) => sum + actor.keyMemories.length, 0),
    relationshipThreadCount: Object.keys(state.relationshipThreads).length,
    npcEvolutionTrackCount: Object.keys(state.backgroundEvolution.npcTracks).length,
    diagnostics: diagnosticCodes(state)
  };
}

function normalizedName(value: string): string {
  return value.toLocaleLowerCase('zh-HK').replace(/[\s·•・,，.。'’"“”()（）-]/g, '');
}

function duplicateCanonicalNames(state: RuntimeState): string[] {
  const idsByName = new Map<string, string[]>();
  for (const actor of Object.values(state.actors)) {
    if (actor.actorId === state.player.actorId) continue;
    const key = normalizedName(actor.name);
    if (!key) continue;
    idsByName.set(key, [...(idsByName.get(key) ?? []), actor.actorId]);
  }
  return [...idsByName.entries()]
    .filter(([, actorIds]) => actorIds.length > 1)
    .map(([name, actorIds]) => `${name}:${actorIds.join(',')}`)
    .sort();
}

function missingActorReferences(state: RuntimeState): string[] {
  const actorIds = new Set(Object.keys(state.actors));
  const missing = new Set<string>();
  for (const memory of Object.values(state.memories)) {
    for (const actorId of memory.relatedActorIds) {
      if (!actorIds.has(actorId)) missing.add(`memory:${memory.memoryId}:${actorId}`);
    }
  }
  for (const thread of Object.values(state.relationshipThreads)) {
    for (const actorId of thread.relatedActorIds) {
      if (!actorIds.has(actorId)) missing.add(`relationship:${thread.threadId}:${actorId}`);
    }
    if (thread.primaryActorId && !actorIds.has(thread.primaryActorId)) {
      missing.add(`relationship:${thread.threadId}:${thread.primaryActorId}`);
    }
  }
  for (const scene of Object.values(state.scenes)) {
    for (const actorId of scene.presentActorIds) {
      if (!actorIds.has(actorId)) missing.add(`scene:${scene.sceneId}:${actorId}`);
    }
  }
  for (const track of Object.values(state.backgroundEvolution.npcTracks)) {
    if (!actorIds.has(track.actorId)) missing.add(`npc-track:${track.trackId}:${track.actorId}`);
  }
  return [...missing].sort();
}

function statusCounts(audits: HttpAuditEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const audit of audits) {
    const key = `${audit.route}:${audit.status === null ? 'network_error' : audit.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function routeSummary(settings: AiSettings) {
  return {
    mainNarrator: settings.mainNarrator
      ? { model: settings.mainNarrator.model, maxTokens: settings.mainNarrator.maxTokens }
      : null,
    featureModes: Object.fromEntries(
      Object.entries(settings.featureRoutes).map(([routeId, route]) => [
        routeId,
        route.mode === 'custom' ? { mode: route.mode, model: route.model } : { mode: route.mode }
      ])
    )
  };
}

function createConfiguredMainFallback(settings: AiSettings): AiSettings | null {
  const candidate = settings.featureRoutes.backgroundEvolution;
  if (candidate.mode !== 'custom') return null;
  const requestedModel = process.env.COPV2_ACTOR_WRITEBACK_FALLBACK_MAIN_MODEL?.trim();
  const profile = settings.apiProfiles.find((item) => item.id === candidate.apiProfileId);
  const model = requestedModel && profile?.models.includes(requestedModel) ? requestedModel : candidate.model;
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: candidate.apiProfileId,
      model,
      maxTokens: Math.max(4096, settings.mainNarrator?.maxTokens ?? 8192),
      temperature: settings.mainNarrator?.temperature ?? 0.7
    }
  };
}

const actions = [
  '我先在旺角警署值日室向当值警长报到，请他以完整姓名和职务介绍自己，并交代本更工作。',
  '我复述当值警长刚交代的重点，并向他确认今晚巡逻集合时间；这是需要后续记住的工作约定。',
  '我到附近茶餐厅吃饭，和负责招呼的店主攀谈，请对方以完整姓名介绍自己，并问最近街坊有什么异常。',
  '继续向茶餐厅店主确认一项具体细节，并约定两天后回来听消息。',
  '街上截停一辆的士，向司机说明是在了解夜间治安，请司机用完整姓名自我介绍并讲一件亲眼见到的事情。',
  '把司机提供的线索记下，向司机确认联系方式，并承诺不会公开他的身份。',
  '回署后用电台呼叫先前见过的当值警长，转告司机线索并请他决定下一步。',
  '离开警署，通过公用电话联系先前见过的茶餐厅店主，问他是否还记得两天后提供消息的约定。',
  '走访一幢唐楼，请看更用完整姓名介绍自己，了解近日陌生人出入。',
  '向看更明确约定：若再见到那名陌生人，不要自行跟踪，先打电话通知警署。',
  '离开唐楼去巡逻，让看更留在原地；我处理别的事。',
  '隔一段时间用电话联系先前见过的看更，询问刚才约定后是否有新情况。',
  '到报馆附近接触一名跑社会线记者，请对方以完整姓名和报馆介绍自己，再问是否听过同一线索。',
  '与记者交换联络方式，明确约定互相核实后才公开消息。',
  '返回茶餐厅，直接问店主上次提过的具体异常和两天之约，检查前情有没有延续。',
  '再找先前见过的的士司机，请他辨认一张与前述目击有关的普通街景照片，不向他暗示答案。',
  '回署向当值警长汇报茶餐厅店主、的士司机、看更和记者四方面的情况，请他分别给出处理意见。',
  '请当值警长复述第二回合交代我的值更重点，并说明目前哪些已经完成、哪些未完成。',
  '离开警署后给记者打电话，问他有没有按约先核实再发布，继续保持记者在远处。',
  '到唐楼复查看更情况，请他复述此前“不要自行跟踪、先通知警署”的约定。',
  '让当值警长、记者和看更各自继续他们的工作，我去处理一小时文书，期间不与他们同场。',
  '一小时后回署，先查看有没有收到上述人物的电话或电台消息，再决定是否需要跟进。',
  '分别联系仍在远处的记者和茶餐厅店主，核对他们各自记得的约定，不把两人的信息混在一起。',
  '整理本次走访记录，分别列明每位人物的完整姓名、身份、最后一次互动和仍未完成的约定，然后向当值警长提交。',
  '下班前单独联系的士司机，核对他最初目击的时间与地点，并确认他的身份仍然保密。',
  '第二天上班先问当值警长昨晚四名相关人物各自有没有新消息，不虚构没有发生的联络。',
  '到茶餐厅履行两天后回来听消息的约定，请店主只补充他本人知道的内容。',
  '随后去唐楼见看更，确认他是否按约避免自行跟踪，并记录真实结果。',
  '让记者在报馆继续核实，我返回警署处理文书，等待他主动来电。',
  '最终向当值警长作一次人物连续性汇报：每个人只保留一个档案，分别说明记忆、约定和当前去向。'
];

describe.skipIf(!shouldRun)('actor writeback recovery real API acceptance', () => {
  it(`runs a fresh opening plus ${turnCount} sequential NPC-focused turns`, async () => {
    const importedSettings = importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'));
    let settings = importedSettings;
    const audits: HttpAuditEntry[] = [];
    let clients = createClients(settings, audits);
    let fallbackActivated = false;
    const setup: OpeningSetup = {
      playerName: '林振声',
      englishName: 'Vincent Lam',
      gender: 'male',
      age: 27,
      currentIdentity: 'police',
      policeNumber: '2847',
      personality: '谨慎、耐心，重视口供前后一致。',
      appearance: '身形中等，神情专注。',
      openingPressure: 'routine',
      openingNote: '从普通值更开始，不预设案件结论；遇到新人物时使用完整姓名并维持稳定身份。'
    };
    const openFreshState = () =>
      runOpening({
        setup,
        narrator: clients.narrator,
        narrativeLengthLevel: 'compact',
        narrativePerspective: settings.game.narrativePerspective,
        playerPortrayalMode: settings.game.playerPortrayalMode,
        locale: settings.game.language,
        promptSettings: settings.prompts
      });
    const openFreshStateWithRetry = async (attempts: number) => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          return await openFreshState();
        } catch (error) {
          lastError = error;
          const mainFailure = [...audits]
            .reverse()
            .find((audit) => audit.route === 'mainNarrator' && (audit.status === null || audit.status >= 500));
          if (!mainFailure || attempt >= attempts) throw error;
          console.log(`[actor-real] configured main opening attempt ${attempt}/${attempts} failed; retrying`);
          await sleep(Math.max(turnDelayMs, 3000));
        }
      }
      throw lastError;
    };
    let state: RuntimeState;
    try {
      state = await openFreshStateWithRetry(2);
    } catch (error) {
      const fallbackSettings = createConfiguredMainFallback(importedSettings);
      const mainFailure = [...audits]
        .reverse()
        .find((audit) => audit.route === 'mainNarrator' && (audit.status === null || audit.status >= 500));
      if (!fallbackSettings || !mainFailure) throw error;
      fallbackActivated = true;
      settings = fallbackSettings;
      clients = createClients(settings, audits);
      console.log('[actor-real] configured main route unavailable; restarting fresh opening on configured feature route');
      state = await openFreshStateWithRetry(2);
    }
    expect(state.turnCounter).toBe(0);

    const snapshots: TurnSnapshot[] = [];
    for (let index = 0; index < turnCount; index += 1) {
      const action = actions[index] ?? actions.at(-1)!;
      let lastError: unknown;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          state = await runPlayerTurn({
            state,
            playerInput: action,
            ...clients,
            writebackRepairMode: settings.featureRoutes.writebackRepair.mode,
            gameSettings: { ...settings.game, narrativeLengthLevel: 'compact' },
            promptSettings: settings.prompts,
            memoryCompression: settings.memory
          });
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          console.log(`[actor-real] turn=${index + 1} attempt=${attempt} error=${safeError(error)}`);
          if (attempt < 2) await sleep(Math.max(turnDelayMs, 1500));
        }
      }
      if (lastError) throw lastError;

      const snapshot = createSnapshot(state);
      snapshots.push(snapshot);
      console.log(
        `[actor-real] turn=${snapshot.turn}/${turnCount} npc=${snapshot.npcCount} pending=${snapshot.pendingRecoveryCount} ` +
          `profilePending=${snapshot.pendingProfileEnrichmentCount} profileIncomplete=${snapshot.incompleteOrdinaryProfileCount} ` +
          `actorMemory=${snapshot.actorMemoryCount} keyMemory=${snapshot.actorKeyMemoryCount} ` +
          `npcTracks=${snapshot.npcEvolutionTrackCount} diagnostics=${snapshot.diagnostics.join(',') || 'none'}`
      );
      if (snapshot.pendingRecoveryCount > 0 || snapshot.pendingProfileEnrichmentCount > 0) {
        console.log(
          `[actor-real-detail] ${JSON.stringify({
            pending: pendingRecoverySummary(state),
            pendingProfileEnrichments: pendingProfileEnrichmentSummary(state),
            diagnostics: diagnosticDetails(state)
          })}`
        );
      }
      await sleep(turnDelayMs);
    }

    const duplicateNames = duplicateCanonicalNames(state);
    const missingReferences = missingActorReferences(state);
    const finalSnapshot = createSnapshot(state);
    const maxPending = Math.max(0, ...snapshots.map((snapshot) => snapshot.pendingRecoveryCount));
    const maxPendingProfileEnrichments = Math.max(
      0,
      ...snapshots.map((snapshot) => snapshot.pendingProfileEnrichmentCount)
    );
    const finalMinimumContractViolations = minimumContractViolations(state);
    const finalIncompleteOrdinaryProfiles = incompleteOrdinaryProfiles(state);
    const recoveryDiagnostics = snapshots.flatMap((snapshot) =>
      snapshot.diagnostics.filter((code) => code.startsWith('actor_'))
    );
    const report = {
      generatedAt: new Date().toISOString(),
      requestedTurns: turnCount,
      completedTurns: state.turnCounter,
      mainFallbackActivated: fallbackActivated,
      routeSummary: routeSummary(settings),
      finalSnapshot,
      maxPendingRecoveryCount: maxPending,
      maxPendingProfileEnrichmentCount: maxPendingProfileEnrichments,
      recoveryDiagnostics: [...new Set(recoveryDiagnostics)].sort(),
      duplicateCanonicalNames: duplicateNames,
      missingActorReferences: missingReferences,
      minimumContractViolations: finalMinimumContractViolations,
      incompleteOrdinaryProfiles: finalIncompleteOrdinaryProfiles,
      finalPendingRecoveries: pendingRecoverySummary(state),
      finalPendingProfileEnrichments: pendingProfileEnrichmentSummary(state),
      actorDirectory: Object.values(state.actors)
        .filter((actor) => actor.actorId !== state.player.actorId)
        .map((actor) => ({
          actorId: actor.actorId,
          name: actor.name,
          gender: actor.gender,
          birthDate: actor.birthDate ?? null,
          computedAge: actor.computedAge ?? null,
          presence: actor.presence,
          keyMemoryCount: actor.keyMemories.length,
          interactionScore: actor.interactionScore,
          missingOrdinaryProfileFields: missingActorProfileEnrichmentFields(actor),
          hasAdultPrivateProfile: Boolean(actor.femaleProfile?.adultPrivateProfile),
          hasLongTermMemorySummary: Boolean(actor.longTermMemorySummary.trim()),
          hasRecentInteractionMemory: Boolean(actor.recentInteractionMemory.trim())
        }))
        .sort((left, right) => left.actorId.localeCompare(right.actorId)),
      httpStatusCounts: statusCounts(audits),
      snapshots
    };
    const outputDir = path.resolve('output', 'actor-writeback-real-api');
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, 'latest.json'), JSON.stringify(report, null, 2), 'utf8');

    expect(state.turnCounter).toBe(turnCount);
    expect(finalSnapshot.npcCount).toBeGreaterThanOrEqual(3);
    expect(finalSnapshot.actorMemoryCount + finalSnapshot.actorKeyMemoryCount).toBeGreaterThanOrEqual(4);
    expect(duplicateNames).toEqual([]);
    expect(missingReferences).toEqual([]);
    expect(finalMinimumContractViolations).toEqual([]);
    expect(maxPending).toBeLessThanOrEqual(6);
    expect(finalSnapshot.pendingRecoveryCount).toBeLessThanOrEqual(2);
    expect(maxPendingProfileEnrichments).toBeLessThanOrEqual(finalSnapshot.npcCount);
    expect(finalSnapshot.pendingProfileEnrichmentCount).toBeLessThanOrEqual(2);
    expect(finalIncompleteOrdinaryProfiles.length).toBeLessThanOrEqual(2);
    expect(
      Object.values(state.actors)
        .filter((actor) => actor.actorId !== state.player.actorId)
        .some((actor) => Boolean(actor.femaleProfile?.adultPrivateProfile))
    ).toBe(false);
    expect(recoveryDiagnostics).toContain('actor_minimum_creation_applied');
    expect(audits.some((audit) => audit.route === 'npcSimulation')).toBe(true);
  });
});
