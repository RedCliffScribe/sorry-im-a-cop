import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackgroundEvolutionClientFromSettings } from '../../src/domain/backgroundEvolution/createBackgroundEvolutionClientFromSettings';
import { composePrompt } from '../../src/domain/context/composePrompt';
import { selectContext } from '../../src/domain/context/selectContext';
import { projectGrayNetworkContext } from '../../src/domain/grayNetwork/grayNetworkContextProjector';
import { projectPublicActorRoleProfiles } from '../../src/domain/identity/identityContextProjector';
import { createMemorySummaryClientFromSettings } from '../../src/domain/memory/createMemorySummaryClientFromSettings';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { createNpcSimulationClientFromSettings } from '../../src/domain/npc/createNpcSimulationClientFromSettings';
import { runOpening } from '../../src/domain/opening/runOpening';
import { projectPolicePanelContext } from '../../src/domain/police/policePanelContextProjector';
import type {
  CurrentMatter,
  OrganizationEvolutionTrack,
  RuntimeState,
  TurnApiRoute
} from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import { createWritebackRepairClientFromSettings } from '../../src/domain/writeback/createWritebackRepairClientFromSettings';

const shouldRun = process.env.COPV2_RUN_TRIAD_RESPONSIBILITY_REAL_API === '1';
const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const mainProfileOverride = process.env.COPV2_TRIAD_RESPONSIBILITY_MAIN_PROFILE_ID?.trim();
const mainModelOverride = process.env.COPV2_TRIAD_RESPONSIBILITY_MAIN_MODEL?.trim();
const mainBaseUrlOverride = process.env.COPV2_TRIAD_RESPONSIBILITY_MAIN_BASE_URL?.trim();
const mainApiKeyOverride = process.env.COPV2_TRIAD_RESPONSIBILITY_MAIN_API_KEY?.trim();
const runtimeMainProfileId = 'api_runtime_triad_responsibility_main';
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_TRIAD_RESPONSIBILITY_REQUEST_TIMEOUT_MS ?? 600_000)
);
const minTurns = Math.min(
  30,
  Math.max(20, Number(process.env.COPV2_TRIAD_RESPONSIBILITY_MIN_TURNS ?? 24))
);
const maxTurns = Math.min(
  30,
  Math.max(minTurns, Number(process.env.COPV2_TRIAD_RESPONSIBILITY_MAX_TURNS ?? 30))
);
const maxRequestAttempts = Math.min(
  10,
  Math.max(1, Number(process.env.COPV2_TRIAD_RESPONSIBILITY_MAX_REQUEST_ATTEMPTS ?? 6))
);
const maxOpeningAttempts = Math.min(
  5,
  Math.max(1, Number(process.env.COPV2_TRIAD_RESPONSIBILITY_MAX_OPENING_ATTEMPTS ?? 3))
);
const retryBaseMs = Math.max(
  1_000,
  Number(process.env.COPV2_TRIAD_RESPONSIBILITY_RETRY_BASE_MS ?? 5_000)
);
const retryMaxMs = Math.max(
  retryBaseMs,
  Number(process.env.COPV2_TRIAD_RESPONSIBILITY_RETRY_MAX_MS ?? 60_000)
);
const turnTimeoutMs = Math.max(
  requestTimeoutMs * 3,
  Number(process.env.COPV2_TRIAD_RESPONSIBILITY_TURN_TIMEOUT_MS ?? 3_600_000)
);
const testTimeoutMs = Math.max(
  turnTimeoutMs * 2,
  Number(process.env.COPV2_TRIAD_RESPONSIBILITY_TEST_TIMEOUT_MS ?? 21_600_000)
);
const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

interface HttpAuditEntry {
  logicalRequestId: string;
  route: TurnApiRoute;
  path: string;
  attempt: number;
  status: number | null;
  responseMs: number;
  retryable: boolean;
  terminal: boolean;
  retryDelayMs?: number;
  error?: string;
}

interface ResponsibilitySnapshot {
  id: string;
  status: CurrentMatter['status'];
  signature: string;
}

interface TurnObservation {
  turn: number;
  time: RuntimeState['time'];
  patronActorIds: string[];
  peerActorIds: string[];
  responsibilitySnapshots: ResponsibilitySnapshot[];
  unresolvedResponsibilityCount: number;
  patronMemoryCount: number;
  peerMemoryCount: number;
  patronSignal: string;
  peerSignal: string;
  organizationTrackSignal: string;
  organizationTrackCount: number;
  backgroundStatus: NonNullable<RuntimeState['backgroundEvolution']['lastRun']>['status'] | null;
  backgroundAppliedPatchCount: number;
  diagnosticCodes: string[];
  routeCallDelta: Partial<Record<TurnApiRoute, number>>;
}

let logicalRequestCounter = 0;

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/https?:\/\/[^\s)]+/gi, '[URL REDACTED]')
    .slice(0, 500);
}

function requestPath(input: RequestInfo | URL): string {
  try {
    return new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
  } catch {
    return 'unknown';
  }
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, date - Date.now());
}

function retryDelay(attempt: number, response?: Response): number {
  const serverDelay = response ? retryAfterMs(response) : undefined;
  if (serverDelay !== undefined) return Math.min(retryMaxMs, Math.max(retryBaseMs, serverDelay));
  const exponential = retryBaseMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.round(Math.random() * Math.min(1_000, retryBaseMs));
  return Math.min(retryMaxMs, exponential + jitter);
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createAuditedFetch(audits: HttpAuditEntry[], route: TurnApiRoute) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const logicalRequestId = `${route}_${++logicalRequestCounter}`;
    const pathName = requestPath(input);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRequestAttempts; attempt += 1) {
      const startedAt = performance.now();
      try {
        const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
          (signal): signal is AbortSignal => Boolean(signal)
        );
        const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
        const retryable = transientStatuses.has(response.status) && attempt < maxRequestAttempts;
        const delay = retryable ? retryDelay(attempt, response) : undefined;
        audits.push({
          logicalRequestId,
          route,
          path: pathName,
          attempt,
          status: response.status,
          responseMs: Math.round(performance.now() - startedAt),
          retryable,
          terminal: !retryable,
          retryDelayMs: delay
        });
        if (!retryable) return response;

        await response.body?.cancel().catch(() => undefined);
        console.log(
          `[triad-responsibility-real-api] transient route=${route} status=${response.status} ` +
            `attempt=${attempt}/${maxRequestAttempts} retryInMs=${delay}`
        );
        await sleep(delay!, init?.signal);
      } catch (error) {
        lastError = error;
        const outerAborted = Boolean(init?.signal?.aborted);
        const retryable = !outerAborted && attempt < maxRequestAttempts;
        const delay = retryable ? retryDelay(attempt) : undefined;
        audits.push({
          logicalRequestId,
          route,
          path: pathName,
          attempt,
          status: null,
          responseMs: Math.round(performance.now() - startedAt),
          retryable,
          terminal: !retryable,
          retryDelayMs: delay,
          error: safeError(error)
        });
        if (!retryable) throw error;
        console.log(
          `[triad-responsibility-real-api] transient route=${route} networkError attempt=${attempt}/` +
            `${maxRequestAttempts} retryInMs=${delay}`
        );
        await sleep(delay!, init?.signal);
      }
    }

    throw lastError ?? new Error(`Request failed after ${maxRequestAttempts} attempts.`);
  };
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function actorMemoryCount(state: RuntimeState, actorId: string): number {
  return Object.values(state.memories).filter(
    (memory) => memory.kind === 'actor' && memory.relatedActorIds.includes(actorId)
  ).length;
}

function actorSignal(state: RuntimeState, actorId: string): string {
  const actor = state.actors[actorId];
  return digest(
    actor
      ? {
          relationshipSummary: actor.relationshipSummary,
          attitudeTowardPlayer: actor.attitudeTowardPlayer,
          interactionScore: actor.interactionScore,
          trustTendency: actor.trustTendency,
          entanglementSummary: actor.entanglementSummary,
          recentInteractionMemory: actor.recentInteractionMemory,
          longTermMemorySummary: actor.longTermMemorySummary,
          keyMemories: actor.keyMemories
        }
      : null
  );
}

function responsibilityMatters(state: RuntimeState): CurrentMatter[] {
  return Object.values(state.dynamicEvents.currentMatters).filter(
    (matter) => matter.source === 'triad_responsibility'
  );
}

function unresolvedResponsibilities(state: RuntimeState): CurrentMatter[] {
  return responsibilityMatters(state).filter(
    (matter) => matter.status === 'active' || matter.status === 'dormant'
  );
}

function matterSignature(matter: CurrentMatter): string {
  return digest({
    title: matter.title,
    summary: matter.summary,
    status: matter.status,
    pressureLevel: matter.pressureLevel,
    responseWindow: matter.responseWindow,
    consequenceHint: matter.consequenceHint,
    dueAt: matter.dueAt,
    currentHook: matter.currentHook,
    relatedActorIds: matter.relatedActorIds,
    relatedPlaceIds: matter.relatedPlaceIds,
    relatedOrganizationIds: matter.relatedOrganizationIds
  });
}

function responsibilitySnapshots(state: RuntimeState): ResponsibilitySnapshot[] {
  return responsibilityMatters(state)
    .map((matter) => ({ id: matter.id, status: matter.status, signature: matterSignature(matter) }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function playerOrganizationTracks(state: RuntimeState): OrganizationEvolutionTrack[] {
  return Object.values(state.backgroundEvolution.organizationTracks).filter(
    (track) => track.organizationId === 'org_wo_shing_wo'
  );
}

function organizationTrackSignal(state: RuntimeState): string {
  return digest(
    playerOrganizationTracks(state)
      .map((track) => ({
        trackId: track.trackId,
        status: track.status,
        objective: track.objective,
        currentAction: track.currentAction,
        currentStatus: track.currentStatus,
        nextReviewAt: track.nextReviewAt,
        latestOutcomeKind: track.latestOutcomeKind,
        latestOutcome: track.latestOutcome,
        lastEvolvedAt: track.lastEvolvedAt,
        lastAppliedReviewKey: track.lastAppliedReviewKey
      }))
      .sort((left, right) => left.trackId.localeCompare(right.trackId))
  );
}

function formatGameTime(time: RuntimeState['time']): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ` +
    `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function actionForTurn(
  index: number,
  state: RuntimeState,
  patronName: string,
  peerName: string
): string {
  const currentMatter = unresolvedResponsibilities(state)[0];
  const matterLabel = currentMatter?.title ?? '目前没有未完成的组织交代';
  const actions = [
    `我请${patronName}把「${matterLabel}」的目的、时限、地区边界和不能越过的规矩讲清楚，只确认这一件事。`,
    `我同${peerName}核对「${matterLabel}」已知的人、地点和说法，先分清事实与传闻，不借组织名义压人。`,
    `我去相关地点安静观察「${matterLabel}」牵涉的人和现场，记录矛盾真正卡在哪里，不急着表态。`,
    `我分别找最直接的当事人谈清楚诉求，说明我来了解情况，不承诺超出自己位置能做的事。`,
    `我把两边能够互相核实的事实交给${peerName}复核，剔除夸张说法，再拟一个不会扩大警方关注的处理办法。`,
    `我按已经确认的边界处理「${matterLabel}」：先协调能落地的小步骤，若有人拒绝就如实保留，不擅自升级。`,
    `我回到现场检查处理是否真的生效，也问清街坊和场所联系人有没有新的反弹或风险。`,
    `我向${patronName}完整汇报结果、未解决部分和我采取的方法；若这项交代已经完成，请他明确结论和后续评价。`,
    `我不主动揽新事，留在${patronName}附近听他和其他成员怎样评价这次处理，也观察${peerName}的反应。`,
    `这天余下时间我照常完成地区杂务，晚上回去休息到次日早上，让已经发生的结果自然发酵。`,
    `第二天我先看庙街一带和胜和成员、街坊与场所联系人有没有因上次处理改变对我的态度，再向${peerName}核实。`,
    `我问${patronName}组织目前最在意的方向是什么，以及我上次表现对自己位置有什么实际影响；没有新交代就不强求。`,
    `若「${matterLabel}」仍未完结，我只处理其中尚未落实的一步；若已经完结，我照常当值并等自然出现的新责任。`,
    `我同${peerName}走一趟庙街和油麻地相连的场所，留意年轻成员与老成员对当前组织方向是否有分歧。`,
    `我把观察到的分歧告诉${patronName}，不替任何一边下结论，只问自己现阶段应守住什么边界。`,
    `我按自己现有位置处理今天的例行联络，不越区、不调动不归我管的人，也不把普通摩擦说成大事。`,
    `傍晚我找${peerName}吃饭，听他谈自己对近期安排和我的看法；我如实回应，不刻意套取秘密。`,
    `我休息到下一日上午，再查看有没有来自${patronName}的新口信、旧事后果或组织方向变化。`,
    `若现在有未完成责任「${matterLabel}」，我先确认其期限与当前阶段；若没有，我继续地区日常，不催促系统派事。`,
    `我依照当前责任到现场做一次实质推进，优先处理人情与事实，拒绝用暴力制造一个看似迅速的结果。`,
    `我让${peerName}从同组成员角度检查我的处理有没有抢功、越权或给组织添麻烦，并根据真实反馈修正。`,
    `我把阶段结果向${patronName}交代，明确哪些是我做到的、哪些取决于别人，请他作出继续、搁置或收尾判断。`,
    `我观察组织对这一阶段结果的反应：谁认可、谁不满、警方或街坊风险有没有变化，不自行宣称升位。`,
    `我完成当天例行事项后休息到次日早上，让组织和相关人物有时间独立行动，再看新的局面。`,
    `我主动找${patronName}复盘这几天：责任结果、规矩信用、办事能力和带来的风险各是什么，请他直说。`,
    `我再和${peerName}核对他的记忆与评价是否和${patronName}一致；若不一致，我只记录分歧，不强迫统一。`,
    `我按当前组织方向处理一次普通地区事务，重点验证不同社团特征是否真正约束做法，而不是只换了名字。`,
    `我留出一天不主动推动大事，观察重要 NPC、组织议程和旧责任是否会自行形成合理后续。`,
    `我对仍在进行的「${matterLabel}」作最后一次可执行处理，并向相关人物说明结果不保证成功，也可能被搁置。`,
    `我向${patronName}和${peerName}分别做最终回顾，确认当前责任状态、组织评价、我的位置与下一步，不要求强行晋升或成功。`
  ];
  return actions[index] ?? actions.at(-1)!;
}

function routeDelta(audits: HttpAuditEntry[], startIndex: number): Partial<Record<TurnApiRoute, number>> {
  const counts: Partial<Record<TurnApiRoute, number>> = {};
  for (const audit of audits.slice(startIndex)) {
    if (!audit.terminal) continue;
    counts[audit.route] = (counts[audit.route] ?? 0) + 1;
  }
  return counts;
}

function observeTurn(
  state: RuntimeState,
  patronId: string,
  peerId: string,
  routeCallDelta: Partial<Record<TurnApiRoute, number>>
): TurnObservation {
  const latestNarratorEntry = [...state.storyLog].reverse().find((entry) => entry.speaker === 'narrator');
  const backgroundRun = state.backgroundEvolution.lastRun;
  const triadProfile = state.actors[state.player.actorId].roleProfiles.triad;
  return {
    turn: state.turnCounter,
    time: { ...state.time },
    patronActorIds: [...(triadProfile?.patronActorIds ?? [])],
    peerActorIds: [...(triadProfile?.peerActorIds ?? [])],
    responsibilitySnapshots: responsibilitySnapshots(state),
    unresolvedResponsibilityCount: unresolvedResponsibilities(state).length,
    patronMemoryCount: actorMemoryCount(state, patronId),
    peerMemoryCount: actorMemoryCount(state, peerId),
    patronSignal: actorSignal(state, patronId),
    peerSignal: actorSignal(state, peerId),
    organizationTrackSignal: organizationTrackSignal(state),
    organizationTrackCount: playerOrganizationTracks(state).length,
    backgroundStatus: backgroundRun?.status ?? null,
    backgroundAppliedPatchCount: backgroundRun?.appliedPatchCount ?? 0,
    diagnosticCodes: (latestNarratorEntry?.writebackDiagnostics ?? []).map((issue) => issue.code),
    routeCallDelta
  };
}

function lifecycleEvidence(
  observations: TurnObservation[],
  openingResponsibility: ResponsibilitySnapshot,
  openingPatronMemoryCount: number,
  openingPeerMemoryCount: number,
  openingPatronSignal: string,
  openingPeerSignal: string,
  openingOrganizationTrackSignal: string
) {
  const latest = observations.at(-1);
  const allResponsibilities = observations.flatMap((observation) => observation.responsibilitySnapshots);
  const initialSnapshots = allResponsibilities.filter((snapshot) => snapshot.id === openingResponsibility.id);
  const distinctResponsibilityIds = [...new Set(allResponsibilities.map((snapshot) => snapshot.id))];
  const initialResponsibilityProgressed = initialSnapshots.some(
    (snapshot) => snapshot.signature !== openingResponsibility.signature || snapshot.status !== openingResponsibility.status
  );
  const initialResponsibilityFinalized = latest
    ? !latest.responsibilitySnapshots.some((snapshot) => snapshot.id === openingResponsibility.id) ||
      latest.responsibilitySnapshots.some(
        (snapshot) =>
          snapshot.id === openingResponsibility.id &&
          (snapshot.status === 'resolved' || snapshot.status === 'archived')
      )
    : false;
  const patronMemoryGrew = Boolean(latest && latest.patronMemoryCount > openingPatronMemoryCount);
  const peerMemoryGrew = Boolean(latest && latest.peerMemoryCount > openingPeerMemoryCount);
  const patronEvaluationChanged = Boolean(latest && latest.patronSignal !== openingPatronSignal);
  const peerEvaluationChanged = Boolean(latest && latest.peerSignal !== openingPeerSignal);
  const organizationTrackChanged = Boolean(
    latest && latest.organizationTrackSignal !== openingOrganizationTrackSignal
  );
  const npcSimulationSuccessfulCalls = observations.reduce(
    (count, observation) => count + (observation.routeCallDelta.npcSimulation ?? 0),
    0
  );
  const backgroundSuccessfulCalls = observations.reduce(
    (count, observation) => count + (observation.routeCallDelta.backgroundEvolution ?? 0),
    0
  );
  const backgroundAppliedRuns = observations.filter(
    (observation) => observation.backgroundStatus === 'succeeded' && observation.backgroundAppliedPatchCount > 0
  ).length;
  const substantiveFeedback =
    patronMemoryGrew || peerMemoryGrew || patronEvaluationChanged || peerEvaluationChanged;
  const responsibilityLifecycleChanged =
    initialResponsibilityFinalized || distinctResponsibilityIds.length > 1 || initialResponsibilityProgressed;

  return {
    distinctResponsibilityIds,
    initialResponsibilityProgressed,
    initialResponsibilityFinalized,
    patronMemoryGrew,
    peerMemoryGrew,
    patronEvaluationChanged,
    peerEvaluationChanged,
    organizationTrackChanged,
    npcSimulationSuccessfulCalls,
    backgroundSuccessfulCalls,
    backgroundAppliedRuns,
    substantiveFeedback,
    responsibilityLifecycleChanged,
    sufficient:
      responsibilityLifecycleChanged &&
      substantiveFeedback &&
      organizationTrackChanged &&
      npcSimulationSuccessfulCalls > 0 &&
      backgroundSuccessfulCalls > 0
  };
}

function statusCounts(audits: HttpAuditEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const audit of audits) {
    const key = `${audit.route}:${audit.status === null ? 'network_error' : audit.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

describe.skipIf(!shouldRun)('triad organization responsibility through real APIs', () => {
  it('observes responsibility, patron, peer and organization evolution across 20-30 turns', async () => {
    const importedSettings = importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'));
    if (Boolean(mainBaseUrlOverride) !== Boolean(mainApiKeyOverride)) {
      throw new Error('本地主剧情覆盖必须同时提供 Base URL 与 API Key。');
    }
    const localMainOverrideEnabled = Boolean(mainBaseUrlOverride && mainApiKeyOverride);
    const effectiveMainModel = mainModelOverride || importedSettings.mainNarrator?.model || 'gemini-3.1-pro';
    const now = new Date().toISOString();
    const settings = localMainOverrideEnabled
      ? {
          ...importedSettings,
          apiProfiles: [
            ...importedSettings.apiProfiles,
            {
              id: runtimeMainProfileId,
              name: 'Runtime local triad responsibility main narrator',
              providerLabel: 'Runtime local proxy',
              interfaceType: 'openai-compatible' as const,
              baseUrl: mainBaseUrlOverride!,
              apiKey: mainApiKeyOverride!,
              models: [effectiveMainModel],
              createdAt: now,
              updatedAt: now
            }
          ],
          mainNarrator: {
            apiProfileId: runtimeMainProfileId,
            model: effectiveMainModel,
            maxTokens: importedSettings.mainNarrator?.maxTokens,
            temperature: importedSettings.mainNarrator?.temperature
          }
        }
      : mainProfileOverride && mainModelOverride
        ? {
            ...importedSettings,
            mainNarrator: {
              apiProfileId: mainProfileOverride,
              model: mainModelOverride,
              maxTokens: importedSettings.mainNarrator?.maxTokens,
              temperature: importedSettings.mainNarrator?.temperature
            }
          }
        : importedSettings;
    expect(settings.apiProfiles.some((profile) => profile.id === settings.mainNarrator?.apiProfileId)).toBe(true);

    const runStartedAt = new Date().toISOString();
    const outputDirectory = path.resolve('output', 'triad-responsibility');
    await mkdir(outputDirectory, { recursive: true });
    const progressPath = path.join(
      outputDirectory,
      `real-api-progress-${runStartedAt.replace(/[:.]/g, '-')}.jsonl`
    );
    const recordProgress = async (entry: Record<string, unknown>) => {
      await appendFile(
        progressPath,
        `${JSON.stringify({ recordedAt: new Date().toISOString(), ...entry })}\n`,
        'utf8'
      );
    };
    await writeFile(
      progressPath,
      `${JSON.stringify({
        recordedAt: runStartedAt,
        event: 'run_started',
        requestedTurnWindow: { minTurns, maxTurns },
        mainModel: settings.mainNarrator?.model,
        mainOverrideKind: localMainOverrideEnabled
          ? 'runtime-local-proxy'
          : mainProfileOverride && mainModelOverride
            ? 'existing-api-profile'
            : 'none'
      })}\n`,
      'utf8'
    );

    const audits: HttpAuditEntry[] = [];
    const narrator = createNarratorClientFromSettings(settings, createAuditedFetch(audits, 'mainNarrator'));
    const writebackRepair =
      createWritebackRepairClientFromSettings(settings, createAuditedFetch(audits, 'writebackRepair')) ?? undefined;
    const npcSimulation =
      createNpcSimulationClientFromSettings(settings, createAuditedFetch(audits, 'npcSimulation')) ?? undefined;
    const backgroundEvolution =
      createBackgroundEvolutionClientFromSettings(settings, createAuditedFetch(audits, 'backgroundEvolution')) ??
      undefined;
    const memorySummary =
      createMemorySummaryClientFromSettings(settings, createAuditedFetch(audits, 'memorySummary')) ?? undefined;

    expect(npcSimulation, 'NPC simulation must be enabled for this lifecycle test.').toBeDefined();
    expect(backgroundEvolution, 'Background evolution must be enabled for this lifecycle test.').toBeDefined();

    const openingAttemptErrors: string[] = [];
    let state: RuntimeState | undefined;
    for (let attempt = 1; attempt <= maxOpeningAttempts; attempt += 1) {
      try {
        state = await runOpening({
          setup: {
            playerName: '林志森',
            englishName: 'Lam Chi-sum',
            gender: 'male',
            age: 25,
            currentIdentity: 'gang_member',
            startTime: { year: 1984, month: 12, day: 27, hour: 8, minute: 30 },
            openingPressure: 'routine',
            cantoneseFlavor: 'medium',
            personality: '谨慎、重人情，但关键时会明确表态。',
            appearance: '二十五岁香港男子，衣着整洁，神情警醒。',
            triadSocietyId: 'org_wo_shing_wo',
            triadTerritoryPlaceId: 'place_temple_street_night_market',
            triadRankId: 'district_cadre',
            triadRoleId: 'district_affairs_coordinator'
          },
          narrator,
          narrativeLengthLevel: 'compact',
          narrativePerspective: settings.game.narrativePerspective,
          playerPortrayalMode: settings.game.playerPortrayalMode,
          locale: settings.game.language,
          promptSettings: settings.prompts
        });
        console.log(
          `[triad-responsibility-real-api] opening accepted attempt=${attempt}/${maxOpeningAttempts}`
        );
        await recordProgress({ event: 'opening_accepted', attempt });
        break;
      } catch (error) {
        const message = safeError(error);
        openingAttemptErrors.push(message);
        await recordProgress({ event: 'opening_rejected', attempt, error: message });
        console.log(
          `[triad-responsibility-real-api] opening rejected attempt=${attempt}/${maxOpeningAttempts} error=${message}`
        );
        if (attempt >= maxOpeningAttempts) throw error;
        await sleep(retryBaseMs * attempt);
      }
    }
    if (!state) throw new Error('Opening did not produce a runtime state.');

    const openingProfile = state.actors[state.player.actorId].roleProfiles.triad;
    expect(openingProfile?.organizationId).toBe('org_wo_shing_wo');
    expect(openingProfile?.patronActorIds).toHaveLength(1);
    expect(openingProfile?.peerActorIds).toHaveLength(1);
    const patronId = openingProfile!.patronActorIds[0];
    const peerId = openingProfile!.peerActorIds[0];
    const patron = state.actors[patronId];
    const peer = state.actors[peerId];
    expect(patron).toBeDefined();
    expect(peer).toBeDefined();
    expect(patron.roleProfiles.triad?.organizationId).toBe('org_wo_shing_wo');
    expect(peer.roleProfiles.triad?.organizationId).toBe('org_wo_shing_wo');

    const openingResponsibilities = responsibilityMatters(state);
    expect(openingResponsibilities).toHaveLength(1);
    expect(openingResponsibilities[0]).toMatchObject({
      status: 'active',
      matterKind: 'social',
      visibility: 'known'
    });
    expect(openingResponsibilities[0].relatedActorIds).toEqual(expect.arrayContaining([patronId, peerId]));
    expect(openingResponsibilities[0].relatedOrganizationIds).toContain('org_wo_shing_wo');
    const openingResponsibilitySnapshot = responsibilitySnapshots(state)[0];

    const probeInput = '先在原地等直属上线联络，观察当前组织方向。';
    const probePrompt = composePrompt(selectContext(state, probeInput), probeInput, {
      narrativeLengthLevel: 'compact',
      promptSettings: settings.prompts
    });
    expect(probePrompt).toContain('TRIAD_MEMBERSHIP_CONTEXT');
    expect(probePrompt).toContain(`${patron.name}(${patronId})`);
    expect(probePrompt).toContain(`${peer.name}(${peerId})`);
    expect(probePrompt).toContain(`matterId=${openingResponsibilitySnapshot.id}`);

    const openingPatronMemoryCount = actorMemoryCount(state, patronId);
    const openingPeerMemoryCount = actorMemoryCount(state, peerId);
    const openingPatronSignal = actorSignal(state, patronId);
    const openingPeerSignal = actorSignal(state, peerId);
    const openingOrganizationSignal = organizationTrackSignal(state);
    const observations: TurnObservation[] = [];
    let maximumUnresolvedResponsibilities = unresolvedResponsibilities(state).length;

    for (let index = 0; index < maxTurns; index += 1) {
      const playerInput = actionForTurn(index, state, patron.name, peer.name);
      const auditStartIndex = audits.length;
      state = await runPlayerTurn({
        state,
        playerInput,
        narrator,
        memorySummary,
        writebackRepair,
        writebackRepairMode: settings.featureRoutes.writebackRepair.mode,
        npcSimulation,
        backgroundEvolution,
        memoryCompression: settings.memory,
        gameSettings: { ...settings.game, narrativeLengthLevel: 'compact' },
        promptSettings: settings.prompts,
        signal: AbortSignal.timeout(turnTimeoutMs)
      });
      const observation = observeTurn(state, patronId, peerId, routeDelta(audits, auditStartIndex));
      observations.push(observation);
      maximumUnresolvedResponsibilities = Math.max(
        maximumUnresolvedResponsibilities,
        observation.unresolvedResponsibilityCount
      );
      const evidence = lifecycleEvidence(
        observations,
        openingResponsibilitySnapshot,
        openingPatronMemoryCount,
        openingPeerMemoryCount,
        openingPatronSignal,
        openingPeerSignal,
        openingOrganizationSignal
      );
      await recordProgress({
        event: 'turn_completed',
        completedTurnCount: index + 1,
        observation,
        lifecycleEvidence: evidence
      });
      console.log(
        `[triad-responsibility-real-api] turn=${index + 1}/${maxTurns} counter=${state.turnCounter} ` +
          `time=${formatGameTime(state.time)} unresolved=${observation.unresolvedResponsibilityCount} ` +
          `matterIds=${observation.responsibilitySnapshots.map((item) => `${item.id}:${item.status}`).join(',') || 'none'} ` +
          `patronMemories=${observation.patronMemoryCount} peerMemories=${observation.peerMemoryCount} ` +
          `orgTracks=${observation.organizationTrackCount} background=${observation.backgroundStatus ?? 'none'} ` +
          `lifecycleEvidence=${evidence.sufficient}`
      );
      if (index + 1 >= minTurns && evidence.sufficient) break;
    }

    const evidence = lifecycleEvidence(
      observations,
      openingResponsibilitySnapshot,
      openingPatronMemoryCount,
      openingPeerMemoryCount,
      openingPatronSignal,
      openingPeerSignal,
      openingOrganizationSignal
    );
    const finalProfile = state.actors[state.player.actorId].roleProfiles.triad;
    const finalResponsibilities = responsibilityMatters(state);
    const finalUnresolvedResponsibilities = unresolvedResponsibilities(state);
    const publicRoleKeys = Object.keys(projectPublicActorRoleProfiles(state.actors[state.player.actorId])).sort();
    const diagnostics = state.storyLog.flatMap((entry) => entry.writebackDiagnostics ?? []);
    const allRelatedActorIds = finalResponsibilities.flatMap((matter) => matter.relatedActorIds);
    const allRelatedOrganizationIds = finalResponsibilities.flatMap((matter) => matter.relatedOrganizationIds);
    const danglingActorIds = [...new Set(allRelatedActorIds)].filter((actorId) => !state.actors[actorId]);
    const danglingOrganizationIds = [...new Set(allRelatedOrganizationIds)].filter(
      (organizationId) => !state.organizations[organizationId]
    );
    const terminalAudits = audits.filter((audit) => audit.terminal);
    const terminalMainNarratorFailures = terminalAudits.filter(
      (audit) =>
        audit.route === 'mainNarrator' &&
        (audit.status === null || audit.status < 200 || audit.status >= 300)
    );
    const terminalAuxiliaryFailures = terminalAudits.filter(
      (audit) =>
        audit.route !== 'mainNarrator' &&
        (audit.status === null || audit.status < 200 || audit.status >= 300)
    );

    await recordProgress({
      event: 'final_snapshot',
      completedTurnCount: observations.length,
      currentIdentity: state.player.currentIdentity,
      organizationId: finalProfile?.organizationId,
      patronActorIds: finalProfile?.patronActorIds ?? [],
      peerActorIds: finalProfile?.peerActorIds ?? [],
      unresolvedResponsibilityCount: finalUnresolvedResponsibilities.length,
      pendingActorWritebackRecoveryCount: state.pendingActorWritebackRecoveries.length,
      pendingActorProfileEnrichmentCount: state.pendingActorProfileEnrichments?.length ?? 0,
      terminalMainNarratorFailureCount: terminalMainNarratorFailures.length,
      terminalAuxiliaryFailureCount: terminalAuxiliaryFailures.length
    });

    expect(observations.length).toBeGreaterThanOrEqual(minTurns);
    expect(observations.length).toBeLessThanOrEqual(maxTurns);
    expect(state.player.currentIdentity).toBe('gang_member');
    expect(publicRoleKeys).toEqual(['triad']);
    expect(projectGrayNetworkContext(state).perspective).toBe('gang_member');
    expect(projectPolicePanelContext(state).available).toBe(false);
    expect(finalProfile?.organizationId).toBe('org_wo_shing_wo');
    expect(finalProfile?.patronActorIds).toContain(patronId);
    expect(finalProfile?.peerActorIds).toContain(peerId);
    expect(maximumUnresolvedResponsibilities).toBeLessThanOrEqual(1);
    expect(finalUnresolvedResponsibilities.length).toBeLessThanOrEqual(1);
    expect(
      finalResponsibilities.every((matter) => matter.relatedOrganizationIds.includes('org_wo_shing_wo'))
    ).toBe(true);
    expect(danglingActorIds).toEqual([]);
    expect(danglingOrganizationIds).toEqual([]);
    expect(actorMemoryCount(state, patronId)).toBeGreaterThan(0);
    expect(actorMemoryCount(state, peerId)).toBeGreaterThan(0);
    expect(evidence.responsibilityLifecycleChanged, 'The initial responsibility never meaningfully changed.').toBe(
      true
    );
    expect(evidence.substantiveFeedback, 'Neither patron nor peer recorded a memory/evaluation change.').toBe(true);
    expect(evidence.organizationTrackChanged, 'The player organization agenda/evolution track never changed.').toBe(
      true
    );
    expect(evidence.npcSimulationSuccessfulCalls).toBeGreaterThan(0);
    expect(evidence.backgroundSuccessfulCalls).toBeGreaterThan(0);
    expect(evidence.sufficient, 'The 20-30 turn run did not expose a complete enough triad lifecycle.').toBe(true);
    expect(terminalMainNarratorFailures).toEqual([]);

    const generatedAt = new Date().toISOString();
    const report = {
      test: 'triad-organization-responsibility-real-api-long-run',
      generatedAt,
      settingsFile: path.basename(settingsPath),
      requestedTurnWindow: { minTurns, maxTurns },
      completedTurns: observations.length,
      productionParity: {
        enabled: ['mainNarrator', 'writebackRepair', 'npcSimulation', 'backgroundEvolution', 'memorySummary'],
        memoryCompressionEnabled: settings.memory.autoCompressionEnabled,
        deliberatelyExcluded: {
          memoryEmbedding: 'Excluded to avoid multiplying requests against a public endpoint; not a triad lifecycle dependency.',
          auxiliaryGeneration: 'Excluded because news generation is outside this triad lifecycle test.'
        }
      },
      mainNarratorRoute: {
        apiProfileId: settings.mainNarrator?.apiProfileId,
        model: settings.mainNarrator?.model,
        overriddenForTest: localMainOverrideEnabled || Boolean(mainProfileOverride && mainModelOverride),
        overrideKind: localMainOverrideEnabled
          ? 'runtime-local-proxy'
          : mainProfileOverride && mainModelOverride
            ? 'existing-api-profile'
            : 'none'
      },
      credentialSafety: {
        keyValuesRecorded: false,
        rawPromptsRecorded: false,
        rawResponsesRecorded: false,
        requestOriginsRecorded: false
      },
      opening: {
        attemptCount: openingAttemptErrors.length + 1,
        rejectedAttemptErrors: openingAttemptErrors,
        organizationId: openingProfile?.organizationId,
        patronActorId: patronId,
        patronName: patron.name,
        peerActorId: peerId,
        peerName: peer.name,
        responsibilityId: openingResponsibilitySnapshot.id,
        patronMemoryCount: openingPatronMemoryCount,
        peerMemoryCount: openingPeerMemoryCount
      },
      lifecycleEvidence: evidence,
      invariants: {
        maximumUnresolvedResponsibilities,
        finalUnresolvedResponsibilityCount: finalUnresolvedResponsibilities.length,
        danglingActorIds,
        danglingOrganizationIds,
        finalPublicRoleKeys: publicRoleKeys,
        policePanelAvailable: projectPolicePanelContext(state).available
      },
      final: {
        turnCounter: state.turnCounter,
        time: state.time,
        currentIdentity: state.player.currentIdentity,
        responsibilityCount: finalResponsibilities.length,
        responsibilityStatuses: finalResponsibilities.map((matter) => ({ id: matter.id, status: matter.status })),
        patronMemoryCount: actorMemoryCount(state, patronId),
        peerMemoryCount: actorMemoryCount(state, peerId),
        organizationTrackCount: playerOrganizationTracks(state).length,
        pendingActorWritebackRecoveryCount: state.pendingActorWritebackRecoveries.length,
        pendingActorProfileEnrichmentCount: state.pendingActorProfileEnrichments?.length ?? 0,
        diagnosticCodeCounts: Object.fromEntries(
          [...new Set(diagnostics.map((issue) => issue.code))].map((code) => [
            code,
            diagnostics.filter((issue) => issue.code === code).length
          ])
        )
      },
      turnObservations: observations,
      http: {
        logicalRequestCount: new Set(audits.map((audit) => audit.logicalRequestId)).size,
        attemptCount: audits.length,
        retryAttemptCount: audits.filter((audit) => audit.attempt > 1).length,
        statusCounts: statusCounts(audits),
        transientAttempts: audits.filter((audit) => audit.retryable).map((audit) => ({
          route: audit.route,
          path: audit.path,
          attempt: audit.attempt,
          status: audit.status,
          responseMs: audit.responseMs,
          retryDelayMs: audit.retryDelayMs,
          error: audit.error
        })),
        terminalAuxiliaryFailures: terminalAuxiliaryFailures.map((audit) => ({
          route: audit.route,
          path: audit.path,
          status: audit.status,
          attempts: audit.attempt,
          responseMs: audit.responseMs,
          error: audit.error
        })),
        responseMs: audits.map((audit) => audit.responseMs)
      }
    };
    const reportPath = path.join(outputDirectory, `real-api-long-${generatedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await recordProgress({ event: 'run_completed', reportPath: path.basename(reportPath) });
    console.log(`[triad-responsibility-real-api] report: ${reportPath}`);
  }, testTimeoutMs);
});
