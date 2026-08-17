import 'fake-indexeddb/auto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import type {
  NarratorAttemptRecord,
  NarratorClient,
  NarratorRequestPurpose
} from '../../src/domain/narrator/NarratorClient';
import { IndexedDbOpeningSessionRepository } from '../../src/domain/opening/IndexedDbOpeningSessionRepository';
import { runOpeningV2 } from '../../src/domain/opening/runOpeningV2';
import { IndexedDbSaveRepository } from '../../src/domain/persistence/IndexedDbSaveRepository';
import {
  createInitialRuntimeState,
  type OpeningSetup
} from '../../src/domain/runtime/initialState';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import { hk1980sOriginBackgroundOptions } from '../../src/domain/worldpack/hk1980sOpening';

const shouldRun = process.env.COPV2_RUN_OPENING_V2_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const profileSelector =
  process.env.COPV2_OPENING_V2_PROFILE ?? 'api_yuqing';
const model =
  process.env.COPV2_OPENING_V2_MODEL ?? 'grok-4.20-fast';
const requestedRunCount = Number(process.env.COPV2_OPENING_V2_RUNS ?? 3);
const runCount = Math.min(
  5,
  Math.max(3, Math.trunc(requestedRunCount) || 3)
);
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_OPENING_V2_TIMEOUT_MS ?? 600_000)
);
const outputPath = path.resolve(
  process.env.COPV2_OPENING_V2_OUTPUT_PATH ??
    path.join('output', 'opening-v2-real-api', 'latest.json')
);

interface HttpAudit {
  status: number | null;
  responseMs: number;
  error?: string;
}

interface RunAudit {
  ordinal: number;
  accepted: boolean;
  actorCount?: number;
  remoteActorCount?: number;
  remoteActorsWithUnknownLocation?: number;
  sceneActorCount?: number;
  narrativeCharacters?: number;
  actionCount?: number;
  cashOnHand?: number;
  homeBaseReady?: boolean;
  saveReloadMatched?: boolean;
  keyMemoryInjection: KeyMemoryInjection;
  keyMemoryNormalizationCodes: string[];
  repeatedActorRepairCount: number;
  keyMemoryRepairRequestCount: number;
  requestPurposes: NarratorRequestPurpose[];
  attemptStatuses: Array<{
    purpose: NarratorRequestPurpose;
    parseStatus: NarratorAttemptRecord['parseStatus'];
    finishReason: NarratorAttemptRecord['finishReason'];
    capabilityFallback?: string;
    configuredMaxTokens?: number;
    stageMaxTokens?: number;
    providerMaxOutputTokens?: number;
    requestedMaxTokens?: number;
    limitingSource?: string;
    completionTokens?: number;
  }>;
  stageDiagnosticCodes: string[];
  error?: string;
}

type KeyMemoryInjection = 'string' | 'alias' | 'invalid_items';

const keyMemoryInjections: KeyMemoryInjection[] = [
  'string',
  'alias',
  'invalid_items'
];

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .slice(0, 800);
}

function resolveSettings(source: AiSettings): {
  settings: AiSettings;
  routeLabel: string;
} {
  const profile = source.apiProfiles.find(
    (candidate) =>
      candidate.id === profileSelector ||
      candidate.name.toLowerCase() === profileSelector.toLowerCase()
  );
  if (!profile) {
    throw new Error(`找不到真实 API 档案：${profileSelector}`);
  }
  if (!profile.models.includes(model)) {
    throw new Error(`档案 ${profile.name} 未声明模型 ${model}`);
  }
  return {
    routeLabel: `${profile.name}/${model}`,
    settings: {
      ...source,
      mainNarrator: {
        apiProfileId: profile.id,
        model,
        maxTokensMode: 'custom',
        maxTokens: 32_768,
        temperature: 0.35
      },
      featureRoutes: {
        ...source.featureRoutes,
        writebackRepair: {
          mode: 'custom',
          apiProfileId: profile.id,
          model,
          maxTokens: 4_096,
          temperature: 0.2
        }
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
      const signals = [
        init?.signal,
        AbortSignal.timeout(requestTimeoutMs)
      ].filter((signal): signal is AbortSignal => Boolean(signal));
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.any(signals)
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

function auditNarrator(
  client: NarratorClient,
  purposes: NarratorRequestPurpose[],
  keyMemoryInjection: KeyMemoryInjection,
  onKeyMemoryRepairRequest: () => void
): NarratorClient {
  const injectActorKeyMemory = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('人物补全响应不是可注入的 object。');
    }
    const cloned = structuredClone(value) as Record<string, unknown>;
    if (!Array.isArray(cloned.actors) || cloned.actors.length === 0) {
      throw new Error('人物补全响应没有可注入的 actors。');
    }
    const firstActor = cloned.actors[0];
    if (!firstActor || typeof firstActor !== 'object' || Array.isArray(firstActor)) {
      throw new Error('人物补全首项不是可注入的人物。');
    }
    const profile = (firstActor as Record<string, unknown>).profile;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error('人物补全首项缺少 profile。');
    }
    (profile as Record<string, unknown>).keyMemories =
      keyMemoryInjection === 'string'
        ? ['曾在一次夜班巡逻中替玩家解围']
        : keyMemoryInjection === 'alias'
          ? [
              {
                content: '过去曾与玩家共同处理一次纠纷',
                importance: '72',
                visibility: 'known'
              }
            ]
          : [
              null,
              42,
              {
                text: '不可确定可见性的私密记忆',
                visibility: 'unknown_private'
              }
            ];
    return cloned;
  };

  return {
    configuredMaxTokens: client.configuredMaxTokens,
    complete: (input, options) => {
      purposes.push(options?.requestPurpose ?? 'auxiliary');
      return client.complete(input, options);
    },
    ...(client.completeDetailed
      ? {
          completeDetailed: (input, options) => {
            const purpose = options?.requestPurpose ?? 'auxiliary';
            purposes.push(purpose);
            if (
              purpose === 'opening_actor_enrichment_repair' &&
              typeof input === 'string'
            ) {
              const allowedPaths = /唯一允许路径：\n([\s\S]*?)\n\n身份档案合同：/.exec(
                input
              )?.[1];
              if (allowedPaths && /-\s+keyMemories(?:\.|\s|$)/.test(allowedPaths)) {
                onKeyMemoryRepairRequest();
              }
            }
            return client.completeDetailed!(input, options).then((completion) =>
              purpose === 'opening_actor_enrichment'
                ? {
                    ...completion,
                    value: injectActorKeyMemory(completion.value)
                  }
                : completion
            );
          }
        }
      : {})
  };
}

function createSetup(ordinal: number): OpeningSetup {
  const originBackground = hk1980sOriginBackgroundOptions.find(
    (candidate) => candidate.originBackgroundId === 'mainland_newcomer_family'
  );
  if (!originBackground) {
    throw new Error('缺少大陆新移民家庭出身注册项。');
  }
  return {
    playerName: `周启明${ordinal}`,
    englishName: `Michael Chow ${ordinal}`,
    gender: 'male',
    age: 29,
    currentIdentity: 'police',
    policeNumber: `95${ordinal}7`,
    policePostingId: 'wan_chai_police_station',
    personality: '做事谨慎，重视证据，也会顾及家人处境。',
    appearance: '衣着与气质符合1988年香港警队见习督察身份。',
    originBackground,
    startTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: 21,
      minute: 20 + ordinal
    },
    openingPressure: 'routine',
    storypackInfluence: 'high',
    screenCharacterSeedsEnabled: true,
    dramaticOpeningId: 'family_entanglement',
    openingNote:
      '开局必须实际建立至少一名远场亲属或已调离同僚，presence 必须是 absent 或 mentioned；未知位置时省略 currentPlaceId/currentSceneId，绝不能放进玩家当前场景。同时保留一名在场警队工作关系人物。',
    lawIdentity: {
      stationOrPost: '湾仔警署',
      department: '刑事侦缉处',
      rank: '见习督察',
      assignmentSummary: '刚调入 CID，负责协助调查与报告整理。',
      authoritySummary:
        '可在直属上司授权下协调本组调查，不可擅自调动跨区资源。',
      accessSummary: '可接触本组案件资料、值班记录和基本警务档案。',
      dutySummary: '调查、问话、证据整理、报告与跨组交接。'
    }
  };
}

describe.skipIf(!shouldRun)('opening V2 real API matrix', () => {
  it(
    `completes ${runCount} consecutive staged openings with remote actors and save reload`,
    async () => {
      const imported = importApiSettings(
        createDefaultAiSettings(),
        await readFile(settingsPath, 'utf8')
      );
      const { settings, routeLabel } = resolveSettings(imported);
      const httpAudits: HttpAudit[] = [];
      const runAudits: RunAudit[] = [];

      for (let ordinal = 1; ordinal <= runCount; ordinal += 1) {
        const attempts: NarratorAttemptRecord[] = [];
        const requestPurposes: NarratorRequestPurpose[] = [];
        const stageDiagnosticCodes: string[] = [];
        const audit: RunAudit = {
          ordinal,
          accepted: false,
          keyMemoryInjection:
            keyMemoryInjections[(ordinal - 1) % keyMemoryInjections.length],
          keyMemoryNormalizationCodes: [],
          repeatedActorRepairCount: 0,
          keyMemoryRepairRequestCount: 0,
          requestPurposes,
          attemptStatuses: [],
          stageDiagnosticCodes
        };

        try {
          const setup = createSetup(ordinal);
          const fetchImpl = createAuditedFetch(httpAudits);
          const narrator = auditNarrator(
            createNarratorClientFromSettings(settings, fetchImpl),
            requestPurposes,
            audit.keyMemoryInjection,
            () => {
              audit.keyMemoryRepairRequestCount += 1;
            }
          );
          const openingRepository = new IndexedDbOpeningSessionRepository(
            `opening-v2-real-session-${crypto.randomUUID()}`
          );
          const opened = await runOpeningV2({
            setup,
            initialState: createInitialRuntimeState(setup),
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

          const actors = Object.values(opened.actors).filter(
            (actor) => actor.actorId !== opened.player.actorId
          );
          const remoteActors = actors.filter(
            (actor) =>
              actor.presence === 'absent' || actor.presence === 'mentioned'
          );
          if (remoteActors.length === 0) {
            throw new Error('本次 V2 开局没有实际建立远场人物。');
          }
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
                `未知位置的远场人物获得伪造 lastSeen：${actor.actorId}`
              );
            }
          }

          const openingStory = [...opened.storyLog]
            .reverse()
            .find((entry) => entry.speaker === 'narrator');
          if (
            !openingStory?.text.trim() ||
            (openingStory.suggestedActions?.length ?? 0) < 2
          ) {
            throw new Error('V2 开局正文或行动没有完整落库。');
          }
          if (
            opened.player.economy.cashOnHand < 0 ||
            !opened.player.homeBase?.placeId
          ) {
            throw new Error('V2 开局经济或住所没有完整落库。');
          }

          const saveRepository = new IndexedDbSaveRepository(
            `opening-v2-real-save-${crypto.randomUUID()}`
          );
          const saveId = `opening_v2_real_${ordinal}`;
          const savedAt = new Date().toISOString();
          await saveRepository.save({
            saveId,
            saveName: `V2 同模型连续开局 ${ordinal}`,
            createdAt: savedAt,
            updatedAt: savedAt,
            playerName: opened.player.name,
            worldpackId: opened.world.worldpackId,
            gameDateLabel: `${opened.time.year}-${opened.time.month}-${opened.time.day}`,
            turnCounter: opened.turnCounter,
            runtimeState: opened
          });
          const loaded = await saveRepository.load(saveId);
          if (!loaded) throw new Error('V2 开局保存后无法读取。');
          expect(loaded.runtimeState).toEqual(opened);

          stageDiagnosticCodes.push(
            ...(openingStory.writebackDiagnostics ?? []).map(
              (diagnostic) => diagnostic.code
            )
          );
          audit.keyMemoryNormalizationCodes = stageDiagnosticCodes.filter(
            (code) => /^opening_key_memor(?:y|ies)_/.test(code)
          );
          audit.repeatedActorRepairCount = attempts.filter(
            (attempt) =>
              attempt.purpose === 'opening_actor_enrichment_repair'
          ).length;
          const expectedNormalizationCode =
            audit.keyMemoryInjection === 'string'
              ? 'opening_key_memory_string_normalized'
              : audit.keyMemoryInjection === 'alias'
                ? 'opening_key_memory_alias_normalized'
                : 'opening_key_memories_cleared';
          if (
            !audit.keyMemoryNormalizationCodes.includes(
              expectedNormalizationCode
            )
          ) {
            throw new Error(
              `注入 ${audit.keyMemoryInjection} 后未记录预期恢复诊断 ${expectedNormalizationCode}。`
            );
          }
          if (audit.keyMemoryRepairRequestCount !== 0) {
            throw new Error(
              `非核心 keyMemories 异常触发了 ${audit.keyMemoryRepairRequestCount} 次专用 AI 修复。`
            );
          }
          for (const attempt of attempts) {
            const budget = attempt.outputBudget;
            if (!budget) {
              throw new Error(`开局请求 ${attempt.purpose} 缺少输出预算诊断。`);
            }
            if (
              budget.configuredMaxTokens !== 32_768 ||
              budget.requestedMaxTokens > 32_768
            ) {
              throw new Error(
                `开局请求 ${attempt.purpose} 未遵守 32K 玩家线路上限。`
              );
            }
          }
          audit.accepted = true;
          audit.actorCount = actors.length;
          audit.remoteActorCount = remoteActors.length;
          audit.remoteActorsWithUnknownLocation = remoteActors.filter(
            (actor) => !actor.currentPlaceId && !actor.currentSceneId
          ).length;
          audit.sceneActorCount = sceneActorIds.length;
          audit.narrativeCharacters = openingStory.text.length;
          audit.actionCount = openingStory.suggestedActions?.length ?? 0;
          audit.cashOnHand = opened.player.economy.cashOnHand;
          audit.homeBaseReady = Boolean(opened.player.homeBase?.placeId);
          audit.saveReloadMatched = true;
        } catch (error) {
          audit.error = safeError(error);
        }

        audit.attemptStatuses = attempts.map((attempt) => ({
          purpose: attempt.purpose,
          parseStatus: attempt.parseStatus,
          finishReason: attempt.finishReason,
          capabilityFallback:
            attempt.providerCapabilityFallback?.capability,
          configuredMaxTokens: attempt.outputBudget?.configuredMaxTokens,
          stageMaxTokens: attempt.outputBudget?.stageMaxTokens,
          providerMaxOutputTokens:
            attempt.outputBudget?.providerMaxOutputTokens,
          requestedMaxTokens: attempt.outputBudget?.requestedMaxTokens,
          limitingSource: attempt.outputBudget?.limitingSource,
          completionTokens: attempt.usage?.completionTokens
          }));
        runAudits.push(audit);
        process.stdout.write(
          `[opening-v2-real] ${ordinal}/${runCount} accepted=${audit.accepted} ` +
            `remote=${audit.remoteActorCount ?? 0} save=${Boolean(
              audit.saveReloadMatched
            )}\n`
        );
      }

      const acceptedRuns = runAudits.filter((audit) => audit.accepted);
      const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        route: routeLabel,
        requestedRuns: runCount,
        consecutiveSuccesses: acceptedRuns.length,
        allAccepted: runAudits.every((audit) => audit.accepted),
        remoteActorRunCount: runAudits.filter(
          (audit) => (audit.remoteActorCount ?? 0) > 0
        ).length,
        saveReloadSuccessCount: runAudits.filter(
          (audit) => audit.saveReloadMatched
        ).length,
        http: {
          requestCount: httpAudits.length,
          successCount: httpAudits.filter(
            (audit) =>
              audit.status !== null &&
              audit.status >= 200 &&
              audit.status < 300
          ).length,
          failedCount: httpAudits.filter(
            (audit) => audit.status === null || audit.status >= 400
          ).length,
          p50Ms: [...httpAudits]
            .map((audit) => audit.responseMs)
            .sort((left, right) => left - right)[
            Math.floor(httpAudits.length * 0.5)
          ],
          p95Ms: [...httpAudits]
            .map((audit) => audit.responseMs)
            .sort((left, right) => left - right)[
            Math.max(0, Math.ceil(httpAudits.length * 0.95) - 1)
          ]
        },
        runs: runAudits
      };
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

      expect(runAudits).toHaveLength(runCount);
      expect(runAudits.every((audit) => audit.accepted)).toBe(true);
      expect(
        runAudits.every((audit) => (audit.remoteActorCount ?? 0) > 0)
      ).toBe(true);
      expect(runAudits.every((audit) => audit.saveReloadMatched)).toBe(true);
      expect(
        runAudits.every(
          (audit) =>
            audit.keyMemoryRepairRequestCount === 0 &&
            audit.keyMemoryNormalizationCodes.length > 0
        )
      ).toBe(true);
    },
    3_600_000
  );
});
