import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackgroundEvolutionClientFromSettings } from '../../src/domain/backgroundEvolution/createBackgroundEvolutionClientFromSettings';
import { parseBackgroundEvolutionWriteback } from '../../src/domain/backgroundEvolution/protocol';
import { runBackgroundEvolution } from '../../src/domain/backgroundEvolution/runBackgroundEvolution';
import { selectBackgroundEvolutionCandidates } from '../../src/domain/backgroundEvolution/selection';
import { addGameHours } from '../../src/domain/backgroundEvolution/time';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { parsePortableSaveZip } from '../../src/domain/persistence/portableSaveZipArchive';
import { createInitialRuntimeState, withRuntimeDefaults } from '../../src/domain/runtime/initialState';
import type { NpcEvolutionOutcomeKind, RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';

const shouldRun = process.env.COPV2_RUN_LONG_SAVE_REAL_API === '1';
const MAX_CASE_ATTEMPTS = Math.max(1, Number(process.env.COPV2_LONG_SAVE_CASE_ATTEMPTS ?? 3));
const MAX_PREGNANCY_ATTEMPTS = Math.max(1, Number(process.env.COPV2_LONG_SAVE_PREGNANCY_ATTEMPTS ?? 3));
const skipPregnancy = process.env.COPV2_LONG_SAVE_SKIP_PREGNANCY === '1';
const CASE_ID = 'case_1984_mongkok_bigcircle_shootout';
const CASE_ACTOR_ID = 'npc_power_power_cid_senior_lau_kai';
const PREGNANCY_ACTOR_ID = 'npc_seed_fig_red_chung_glamour_star';
const targetOutcomes = ['no_result', 'blocked', 'handoff', 'abandoned'] as const;
type TargetOutcome = (typeof targetOutcomes)[number];
const requestedTargetOutcomes = (process.env.COPV2_LONG_SAVE_CASE_TARGETS?.split(',') ?? targetOutcomes)
  .map((value) => value.trim())
  .filter((value): value is TargetOutcome => targetOutcomes.includes(value as TargetOutcome));

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

interface CaseAttemptResult {
  target: TargetOutcome;
  attempt: number;
  runStatus: string;
  actualOutcome: NpcEvolutionOutcomeKind | null;
  appliedPatchCount: number;
  droppedPatchCount: number;
  diagnosticCodes: string[];
  diagnosticDetails: string[];
  memoryDelta: number;
  caseActivityDelta: number;
  caseStatusBefore: string;
  caseStatusAfter: string;
  playerProtected: boolean;
  actorIdSetProtected: boolean;
  relationshipIdSetProtected: boolean;
  accepted: boolean;
  error?: string;
}

interface PregnancyAttemptResult {
  attempt: number;
  stages: string[];
  lifecycleStatus: string | null;
  chancePercent: number | null;
  rollPercent: number | null;
  riskTypes: string[];
  checkDueAt: unknown;
  hasLocalLifecycleDates: boolean;
  playerIdentityProtected: boolean;
  actorIdSetProtected: boolean;
  accepted: boolean;
  error?: string;
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

function createAuditedFetch(audits: HttpAuditEntry[], route: TurnApiRoute) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    let requestPath = 'unknown';
    try {
      requestPath = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
    } catch {
      // Keep the safe placeholder; never record headers or request bodies.
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

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort();
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function routeMetadata(settings: AiSettings, route: 'mainNarrator' | 'backgroundEvolution') {
  const routeSettings = route === 'mainNarrator' ? settings.mainNarrator : settings.featureRoutes.backgroundEvolution;
  if (!routeSettings) return { route, mode: 'disabled' };
  if ('mode' in routeSettings && routeSettings.mode !== 'custom') return { route, mode: routeSettings.mode };
  const apiProfileId = 'apiProfileId' in routeSettings ? routeSettings.apiProfileId : undefined;
  const profile = settings.apiProfiles.find((item) => item.id === apiProfileId);
  return {
    route,
    mode: 'custom',
    profileName: profile?.name ?? 'missing',
    interfaceType: profile?.interfaceType ?? 'missing',
    model: 'model' in routeSettings ? routeSettings.model : undefined
  };
}

function createPregnancyNarratorSettings(settings: AiSettings): AiSettings {
  const backgroundRoute = settings.featureRoutes.backgroundEvolution;
  if (backgroundRoute.mode !== 'custom') return settings;
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: backgroundRoute.apiProfileId,
      model: backgroundRoute.model,
      maxTokens: Math.min(backgroundRoute.maxTokens ?? 4096, 4096),
      temperature: 0.2
    }
  };
}

function targetFacts(target: TargetOutcome) {
  switch (target) {
    case 'no_result':
      return {
        focus: '核对油麻地夜班工人与货运登记。',
        status: '本轮走访和登记核对已经完成；所有说法均无法确认涉案车辆，未得到可用线索。本节点应如实结算为无结果，不得臆造进展。',
        expectedCaseStatuses: ['investigating']
      };
    case 'blocked':
      return {
        focus: '查阅仓库登记并复核关键证人证词。',
        status: '仓库登记册已被水浸损毁，关键证人拒绝继续配合，现阶段无法完成复核。本节点已经受阻，但案件仍在调查中。',
        expectedCaseStatuses: ['investigating']
      };
    case 'handoff':
      return {
        focus: '确认涉案车辆跨区出现后的管辖与移交流程。',
        status: '涉案车辆已确认在九龙城警区出现，案件材料已按程序正式移交该区继续调查。刘启完成本阶段工作，不能把移交写成侦破。',
        expectedCaseStatuses: ['investigating']
      };
    case 'abandoned':
      return {
        focus: '复核最后一批线索并决定是否继续投入。',
        status: '现有线索已逐项排除，继续追查缺乏事实基础，主办人依法结束这一调查线；不得宣称破案，案件可以保持调查或转为冷案。',
        expectedCaseStatuses: ['investigating', 'cold', 'archived']
      };
  }
}

function prepareCaseState(baseState: RuntimeState, target: TargetOutcome, attempt: number): {
  state: RuntimeState;
  trackId: string;
  selection: ReturnType<typeof selectBackgroundEvolutionCandidates>;
} {
  const state = structuredClone(baseState);
  const actor = state.actors[CASE_ACTOR_ID];
  const caseFile = state.cases[CASE_ID];
  if (!actor || !caseFile) throw new Error('Long save is missing the expected case actor or case file.');
  const facts = targetFacts(target);
  const trackId = `track_long_save_case_${target}_${attempt}`;
  actor.presence = 'absent';
  actor.currentPlaceId = state.location.currentPlaceId;
  actor.statusSummary = facts.status;
  state.cases[CASE_ID] = {
    ...caseFile,
    status: 'investigating',
    playerRole: 'aware',
    leadActorId: CASE_ACTOR_ID,
    leadActorName: actor.name,
    currentFocus: facts.focus,
    playerVisibleProgress: '案件由刘启总督察主办，正在等待这一调查节点的真实结论。',
    internalProgressSummary: facts.status,
    relatedActorIds: [...new Set([...caseFile.relatedActorIds, CASE_ACTOR_ID])],
    updatedAt: addGameHours(state.time, -1)
  };
  state.citySituationTracks = {};
  state.backgroundEvolution = {
    npcTracks: {
      [trackId]: {
        trackId,
        actorId: CASE_ACTOR_ID,
        status: target === 'blocked' ? 'blocked' : 'active',
        actionKind: 'case',
        objective: facts.focus,
        currentAction: facts.focus,
        currentStatus: facts.status,
        currentPlaceId: state.location.currentPlaceId,
        startedAt: addGameHours(state.time, -72),
        expectedEndAt: addGameHours(state.time, -1),
        nextReviewAt: addGameHours(state.time, -1),
        relatedActorIds: [CASE_ACTOR_ID],
        relatedOrganizationIds: [],
        relatedPlaceIds: [state.location.currentPlaceId],
        relatedCaseIds: [CASE_ID],
        relatedRelationshipThreadIds: [],
        relatedCityTrackIds: [],
        relatedDeferredEventIds: [],
        lastEvolvedAt: addGameHours(state.time, -72),
        visibility: 'player_known'
      }
    },
    organizationTracks: {},
    recentOutcomes: [],
    chronicle: []
  };
  const broadSelection = selectBackgroundEvolutionCandidates({
    state,
    foregroundTurnId: `long_save_case_${target}_${attempt}`,
    manual: true
  });
  const candidate = broadSelection.npcCandidates.find(
    (item) => item.actorId === CASE_ACTOR_ID && item.trackId === trackId
  );
  if (!candidate) throw new Error(`The seeded ${target} case track was not selected.`);
  return {
    state,
    trackId,
    selection: {
      ...broadSelection,
      reason: 'manual',
      npcCandidates: [candidate],
      organizationCandidates: [],
      cityCandidates: [],
      selectedReviewKeys: [candidate.reviewKey],
      truncatedNpcCount: 0,
      truncatedOrganizationCount: 0,
      truncatedCityCount: 0
    }
  };
}

function countCaseMemories(state: RuntimeState): number {
  return Object.values(state.memories).filter(
    (memory) => memory.relatedActorIds.includes(CASE_ACTOR_ID) && memory.relatedCaseIds.includes(CASE_ID)
  ).length;
}

function preparePregnancyState(baseState: RuntimeState): RuntimeState {
  const state = structuredClone(baseState);
  const actor = state.actors[PREGNANCY_ACTOR_ID];
  const privateProfile = actor?.femaleProfile?.adultPrivateProfile;
  if (!actor || !privateProfile) throw new Error('Long save is missing the expected adult female profile.');
  actor.presence = 'present';
  actor.currentPlaceId = state.location.currentPlaceId;
  actor.currentSceneId = state.location.currentSceneId;
  actor.statusSummary = '与玩家在私密、安全、双方自愿的成人场景中。';
  privateProfile.womb = {
    ...privateProfile.womb,
    status: '未受孕',
    pregnancy: undefined,
    lastPregnancyCheck: undefined
  };
  const sceneId = state.location.currentSceneId;
  if (sceneId && state.scenes[sceneId]) {
    state.scenes[sceneId] = {
      ...state.scenes[sceneId],
      presentActorIds: [...new Set([state.player.actorId, PREGNANCY_ACTOR_ID])]
    };
  }
  const playerActor = state.actors[state.player.actorId];
  state.actors = {
    [state.player.actorId]: playerActor,
    [PREGNANCY_ACTOR_ID]: actor
  };
  state.storyLog = state.storyLog.slice(-6);
  state.memories = Object.fromEntries(
    Object.entries(state.memories)
      .filter(([, memory]) =>
        memory.relatedActorIds.includes(state.player.actorId) || memory.relatedActorIds.includes(PREGNANCY_ACTOR_ID)
      )
      .slice(-24)
  );
  state.relationshipThreads = Object.fromEntries(
    Object.entries(state.relationshipThreads).filter(([, thread]) =>
      thread.relatedActorIds.includes(state.player.actorId) || thread.relatedActorIds.includes(PREGNANCY_ACTOR_ID)
    )
  );
  const defaults = createInitialRuntimeState({ currentIdentity: state.player.currentIdentity });
  state.cases = {};
  state.caseEvidence = {};
  state.deferredEvents = {};
  state.pressures = {};
  state.dynamicEvents = defaults.dynamicEvents;
  state.citySituationTracks = {};
  state.backgroundEvolution = defaults.backgroundEvolution;
  return state;
}

function statusCounts(audits: HttpAuditEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const audit of audits) {
    const key = audit.status === null ? 'network_error' : String(audit.status);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

describe.skipIf(!shouldRun)('real API acceptance on the turn-273 long save', () => {
  it('covers non-player case outcomes and pregnancy risk through production validation paths', async () => {
    const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH;
    const savePath = process.env.COPV2_LONG_SAVE_PATH;
    if (!settingsPath || !savePath) throw new Error('Real API settings and long-save paths are required.');

    const settings = importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'));
    const archiveBytes = await readFile(savePath);
    const archiveHashBefore = hashBytes(archiveBytes);
    const records = await parsePortableSaveZip(archiveBytes);
    const latest = [...records].sort((left, right) => right.turnCounter - left.turnCounter)[0];
    if (!latest) throw new Error('Long-save archive contains no saves.');
    const baseState = withRuntimeDefaults(latest.runtimeState);
    expect(latest.turnCounter).toBeGreaterThanOrEqual(273);
    expect(baseState.actors[CASE_ACTOR_ID]?.name).toBe('刘启');
    expect(baseState.actors[PREGNANCY_ACTOR_ID]?.name).toBe('钟楚虹');

    const audits: HttpAuditEntry[] = [];
    const backgroundClient = createBackgroundEvolutionClientFromSettings(
      settings,
      createAuditedFetch(audits, 'backgroundEvolution')
    );
    if (!backgroundClient) throw new Error('The configured background-evolution route is disabled or incomplete.');
    const pregnancyNarratorSettings = createPregnancyNarratorSettings(settings);
    const narrator = createNarratorClientFromSettings(
      pregnancyNarratorSettings,
      createAuditedFetch(audits, 'mainNarrator')
    );
    const caseAttempts: CaseAttemptResult[] = [];
    const coveredTargets = new Set<TargetOutcome>();

    for (const target of requestedTargetOutcomes) {
      for (let attempt = 1; attempt <= MAX_CASE_ATTEMPTS; attempt += 1) {
        const prepared = prepareCaseState(baseState, target, attempt);
        const playerBefore = structuredClone(prepared.state.player);
        const actorIdsBefore = sortedKeys(prepared.state.actors);
        const relationshipIdsBefore = sortedKeys(prepared.state.relationshipThreads);
        const caseStatusBefore = prepared.state.cases[CASE_ID].status;
        const caseActivityBefore = prepared.state.cases[CASE_ID].activityLog.length;
        const caseMemoryBefore = countCaseMemories(prepared.state);
        try {
          let rawWriteback: unknown;
          const capturingBackgroundClient = {
            complete: async (...args: Parameters<typeof backgroundClient.complete>) => {
              rawWriteback = await backgroundClient.complete(...args);
              return rawWriteback;
            }
          };
          const result = await runBackgroundEvolution({
            state: prepared.state,
            selection: prepared.selection,
            client: capturingBackgroundClient,
            foregroundTurnId: `long_save_case_${target}_${attempt}`
          });
          const parsedWriteback = parseBackgroundEvolutionWriteback(rawWriteback);
          const appliedTrackPatch = parsedWriteback.writeback.npcTrackPatches.find(
            (patch) =>
              patch.trackId === prepared.trackId &&
              patch.actorId === CASE_ACTOR_ID &&
              prepared.selection.selectedReviewKeys.includes(patch.reviewKey)
          );
          const actualOutcome = appliedTrackPatch?.outcomeKind ?? null;
          const caseStatusAfter = result.state.cases[CASE_ID].status;
          const memoryDelta = countCaseMemories(result.state) - caseMemoryBefore;
          const caseActivityDelta = result.state.cases[CASE_ID].activityLog.length - caseActivityBefore;
          const accepted =
            result.status === 'succeeded' &&
            actualOutcome === target &&
            memoryDelta > 0 &&
            caseActivityDelta > 0 &&
            targetFacts(target).expectedCaseStatuses.includes(caseStatusAfter) &&
            sameJson(result.state.player, playerBefore) &&
            sameJson(sortedKeys(result.state.actors), actorIdsBefore) &&
            sameJson(sortedKeys(result.state.relationshipThreads), relationshipIdsBefore);
          caseAttempts.push({
            target,
            attempt,
            runStatus: result.status,
            actualOutcome,
            appliedPatchCount: result.state.backgroundEvolution.lastRun?.appliedPatchCount ?? 0,
            droppedPatchCount: result.state.backgroundEvolution.lastRun?.droppedPatchCount ?? 0,
            diagnosticCodes: result.diagnostics.map((issue) => issue.code),
            diagnosticDetails: result.diagnostics.map(
              (issue) => `${issue.path.join('.')}:${issue.code ?? 'unknown'}:${issue.message}`
            ),
            memoryDelta,
            caseActivityDelta,
            caseStatusBefore,
            caseStatusAfter,
            playerProtected: sameJson(result.state.player, playerBefore),
            actorIdSetProtected: sameJson(sortedKeys(result.state.actors), actorIdsBefore),
            relationshipIdSetProtected: sameJson(sortedKeys(result.state.relationshipThreads), relationshipIdsBefore),
            accepted
          });
          console.log(
            `[long-save-case] target=${target} attempt=${attempt} actual=${actualOutcome ?? 'none'} accepted=${accepted} applied=${result.state.backgroundEvolution.lastRun?.appliedPatchCount ?? 0}`
          );
          if (accepted) {
            coveredTargets.add(target);
            break;
          }
        } catch (error) {
          caseAttempts.push({
            target,
            attempt,
            runStatus: 'failed',
            actualOutcome: null,
            appliedPatchCount: 0,
            droppedPatchCount: 0,
            diagnosticCodes: [],
            diagnosticDetails: [],
            memoryDelta: 0,
            caseActivityDelta: 0,
            caseStatusBefore,
            caseStatusAfter: caseStatusBefore,
            playerProtected: true,
            actorIdSetProtected: true,
            relationshipIdSetProtected: true,
            accepted: false,
            error: safeError(error)
          });
          console.log(`[long-save-case] target=${target} attempt=${attempt} error=${safeError(error)}`);
        }
      }
    }

    const pregnancyAttempts: PregnancyAttemptResult[] = [];
    let pregnancyAccepted = false;
    const pregnancyInputs = [
      '在双方明确自愿、都已确认成年且场景私密安全的前提下，我与钟楚虹发生一次未采取避孕措施、可能导致受孕的成人亲密行为。请如实承接并完成本回合。',
      '承接既定的双方自愿成人场景：本回合明确发生无保护且存在受孕风险的行为。不要提前宣布怀孕结果，但必须按契约报告本次风险事件。',
      '双方自愿完成本次无保护成人行为；这是一项已经发生、明确可能受孕的事实。请正常叙事，并用 pregnancyRiskPatches 报告事件，由本地引擎决定概率与验孕。'
    ];

    for (let attempt = 1; !skipPregnancy && attempt <= MAX_PREGNANCY_ATTEMPTS; attempt += 1) {
      const state = preparePregnancyState(baseState);
      const playerIdentityBefore = {
        currentIdentity: state.player.currentIdentity,
        originIdentity: state.player.originIdentity,
        identityHistory: state.player.identityHistory
      };
      const actorIdsBefore = sortedKeys(state.actors);
      const stages: string[] = [];
      try {
        const nextState = await runPlayerTurn({
          state,
          playerInput: pregnancyInputs[Math.min(attempt - 1, pregnancyInputs.length - 1)],
          narrator,
          writebackRepair: narrator,
          gameSettings: {
            ...pregnancyNarratorSettings.game,
            narrativeLengthLevel: 'compact',
            pregnancyMode: 'standard'
          },
          promptSettings: pregnancyNarratorSettings.prompts,
          onStageChange: (stage) => stages.push(stage)
        });
        const pregnancy = nextState.actors[PREGNANCY_ACTOR_ID]?.femaleProfile?.adultPrivateProfile?.womb.pregnancy;
        const lifecycleStatus = pregnancy?.status ?? null;
        const playerIdentityProtected = sameJson(
          {
            currentIdentity: nextState.player.currentIdentity,
            originIdentity: nextState.player.originIdentity,
            identityHistory: nextState.player.identityHistory
          },
          playerIdentityBefore
        );
        const actorIdSetProtected = sameJson(sortedKeys(nextState.actors), actorIdsBefore);
        const hasLocalLifecycleDates = Boolean(
          pregnancy?.registeredAt &&
          pregnancy.checkDueAt &&
          pregnancy.confirmationDueAt &&
          pregnancy.deliveryWindowAt &&
          pregnancy.dueAt &&
          pregnancy.deliveryDeadlineAt
        );
        const accepted =
          lifecycleStatus === 'pending_check' &&
          Boolean(pregnancy?.riskTypes.includes('unprotected')) &&
          typeof pregnancy?.chancePercent === 'number' &&
          typeof pregnancy.rollPercent === 'number' &&
          hasLocalLifecycleDates &&
          playerIdentityProtected &&
          actorIdSetProtected;
        pregnancyAttempts.push({
          attempt,
          stages,
          lifecycleStatus,
          chancePercent: pregnancy?.chancePercent ?? null,
          rollPercent: pregnancy?.rollPercent ?? null,
          riskTypes: pregnancy?.riskTypes ?? [],
          checkDueAt: pregnancy?.checkDueAt ?? null,
          hasLocalLifecycleDates,
          playerIdentityProtected,
          actorIdSetProtected,
          accepted
        });
        console.log(
          `[long-save-pregnancy] attempt=${attempt} status=${lifecycleStatus ?? 'none'} riskTypes=${pregnancy?.riskTypes.join(',') || 'none'} accepted=${accepted}`
        );
        if (accepted) {
          pregnancyAccepted = true;
          break;
        }
      } catch (error) {
        pregnancyAttempts.push({
          attempt,
          stages,
          lifecycleStatus: null,
          chancePercent: null,
          rollPercent: null,
          riskTypes: [],
          checkDueAt: null,
          hasLocalLifecycleDates: false,
          playerIdentityProtected: true,
          actorIdSetProtected: true,
          accepted: false,
          error: safeError(error)
        });
        console.log(`[long-save-pregnancy] attempt=${attempt} error=${safeError(error)}`);
      }
    }

    const archiveHashAfter = hashBytes(await readFile(savePath));
    const saveStats = await stat(savePath);
    const report = {
      test: 'long-save-case-and-pregnancy-real-api-acceptance',
      generatedAt: new Date().toISOString(),
      sourceArchive: {
        file: path.basename(savePath),
        bytes: saveStats.size,
        selectedTurn: latest.turnCounter,
        sha256Before: archiveHashBefore,
        sha256After: archiveHashAfter,
        unchanged: archiveHashBefore === archiveHashAfter
      },
      settingsFile: path.basename(settingsPath),
      credentialSafety: {
        keysLoadedInMemory: settings.apiProfiles.some((profile) => Boolean(profile.apiKey)),
        keyValuesRecorded: false,
        requestBodiesRecorded: false,
        rawModelResponsesRecorded: false
      },
      routes: [
        routeMetadata(settings, 'backgroundEvolution'),
        routeMetadata(settings, 'mainNarrator'),
        {
          ...routeMetadata(pregnancyNarratorSettings, 'mainNarrator'),
          route: 'pregnancyAcceptanceNarrator',
          note: 'In-memory acceptance fallback uses the configured background flash route after the configured main route returned three 504 responses.'
        }
      ],
      summary: {
        requestedCaseOutcomes: requestedTargetOutcomes,
        coveredCaseOutcomes: [...coveredTargets],
        allCaseOutcomesCovered: requestedTargetOutcomes.every((target) => coveredTargets.has(target)),
        pregnancySkipped: skipPregnancy,
        pregnancyRiskAccepted: skipPregnancy ? null : pregnancyAccepted,
        sourceArchiveUnchanged: archiveHashBefore === archiveHashAfter,
        allHttpSuccessful: audits.every((item) => item.status !== null && item.status >= 200 && item.status < 300)
      },
      http: {
        requestCount: audits.length,
        statusCounts: statusCounts(audits),
        tokenTotals: {
          prompt: audits.reduce((sum, item) => sum + (item.promptTokens ?? 0), 0),
          completion: audits.reduce((sum, item) => sum + (item.completionTokens ?? 0), 0),
          total: audits.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0)
        },
        requests: audits
      },
      caseAttempts,
      pregnancyAttempts
    };
    const outputDirectory = path.resolve('output', 'long-save-audit');
    await mkdir(outputDirectory, { recursive: true });
    const reportPath = path.join(outputDirectory, `real-api-acceptance-${report.generatedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[long-save-real-api] report: ${reportPath}`);

    expect(report.summary.allCaseOutcomesCovered).toBe(true);
    if (!skipPregnancy) expect(report.summary.pregnancyRiskAccepted).toBe(true);
    expect(report.summary.sourceArchiveUnchanged).toBe(true);
    expect(report.summary.allHttpSuccessful).toBe(true);
  });
});
