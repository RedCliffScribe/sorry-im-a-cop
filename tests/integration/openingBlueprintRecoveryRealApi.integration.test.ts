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
import { runOpening } from '../../src/domain/opening/runOpening';
import { IndexedDbSaveRepository } from '../../src/domain/persistence/IndexedDbSaveRepository';
import { createInitialRuntimeState, type OpeningSetup } from '../../src/domain/runtime/initialState';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';

const shouldRun =
  process.env.COPV2_RUN_OPENING_BLUEPRINT_RECOVERY_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const profileSelector =
  process.env.COPV2_OPENING_BLUEPRINT_RECOVERY_PROFILE ?? 'api_yuqing';
const model =
  process.env.COPV2_OPENING_BLUEPRINT_RECOVERY_MODEL ?? 'grok-4.20-fast';
const requestedRunCount = Number(
  process.env.COPV2_OPENING_BLUEPRINT_RECOVERY_RUNS ?? 5
);
const runCount = Math.min(5, Math.max(3, Math.trunc(requestedRunCount) || 5));
const requestTimeoutMs = Math.max(
  60_000,
  Number(
    process.env.COPV2_OPENING_BLUEPRINT_RECOVERY_TIMEOUT_MS ?? 600_000
  )
);
const outputPath = path.resolve(
  process.env.COPV2_OPENING_BLUEPRINT_RECOVERY_OUTPUT_PATH ??
    path.join('output', 'opening-blueprint-recovery-real-api', 'latest.json')
);

interface HttpAudit {
  status: number | null;
  responseMs: number;
  error?: string;
}

interface ModelAudit {
  purpose: NarratorRequestPurpose;
  succeeded: boolean;
  error?: string;
}

interface RunAudit {
  ordinal: number;
  accepted: boolean;
  actorCount?: number;
  remoteActorCount?: number;
  remoteActorIds?: string[];
  missingRemoteLocationCount?: number;
  requestPurposes: NarratorRequestPurpose[];
  attemptStatuses: Array<{
    purpose: NarratorRequestPurpose;
    parseStatus: NarratorAttemptRecord['parseStatus'];
    finishReason: NarratorAttemptRecord['finishReason'];
  }>;
  fieldRepairCount: number;
  localNormalizationRecorded?: boolean;
  fieldRepairRecorded?: boolean;
  saveReloadMatched?: boolean;
  error?: string;
}

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
          maxTokens: 8_192,
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
      const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
        (signal): signal is AbortSignal => Boolean(signal)
      );
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

function auditNarrator(client: NarratorClient, audits: ModelAudit[]): NarratorClient {
  const record = async <T>(
    purpose: NarratorRequestPurpose,
    operation: () => Promise<T>
  ): Promise<T> => {
    const audit: ModelAudit = { purpose, succeeded: false };
    audits.push(audit);
    try {
      const value = await operation();
      audit.succeeded = true;
      return value;
    } catch (error) {
      audit.error = safeError(error);
      throw error;
    }
  };
  return {
    configuredMaxTokens: client.configuredMaxTokens,
    complete: (input, options) =>
      record(options?.requestPurpose ?? 'auxiliary', () =>
        client.complete(input, options)
      ),
    ...(client.completeDetailed
      ? {
          completeDetailed: (input, options) =>
            record(options?.requestPurpose ?? 'auxiliary', () =>
              client.completeDetailed!(input, options)
            )
        }
      : {})
  };
}

function createSetup(ordinal: number): OpeningSetup {
  return {
    playerName: `周启明${ordinal}`,
    englishName: `Michael Chow ${ordinal}`,
    gender: 'male',
    age: 29,
    currentIdentity: 'police',
    policeNumber: `1842${ordinal}`,
    policePostingId: 'wan_chai_police_station',
    personality: '做事谨慎，重视证据，也会顾及家人处境。',
    appearance: '衣着与气质符合1988年香港警队见习督察身份。',
    originBackground: 'mainland_new_immigrant_family',
    startTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: 21,
      minute: ordinal
    },
    openingPressure: 'routine',
    storypackInfluence: 'high',
    screenCharacterSeedsEnabled: true,
    dramaticOpeningId: 'family_entanglement',
    openingNote:
      '开局人物中必须有至少一名当前不在香港开局现场的远场亲属或离场同僚，并明确标为 absent 或 mentioned。远场人物不得复制玩家当前地点；同时保留一名在场警队工作关系人物。',
    lawIdentity: {
      stationOrPost: '湾仔警署',
      department: '刑事侦缉处',
      rank: '见习督察',
      assignmentSummary: '刚调入 CID，负责协助调查与报告整理。',
      authoritySummary: '可在直属上司授权下协调本组调查，不可擅自调动跨区资源。',
      accessSummary: '可接触本组案件资料、值班记录和基本警务档案。',
      dutySummary: '调查、问话、证据整理、报告与跨组交接。'
    }
  };
}

describe.skipIf(!shouldRun)(
  'opening blueprint recovery with one real model',
  () => {
    it(
      `completes ${runCount} consecutive openings with remote actors and save reload`,
      async () => {
        const imported = importApiSettings(
          createDefaultAiSettings(),
          await readFile(settingsPath, 'utf8')
        );
        const { settings, routeLabel } = resolveSettings(imported);
        const httpAudits: HttpAudit[] = [];
        const modelAudits: ModelAudit[] = [];
        const runAudits: RunAudit[] = [];

        for (let ordinal = 1; ordinal <= runCount; ordinal += 1) {
          const attempts: NarratorAttemptRecord[] = [];
          const modelStart = modelAudits.length;
          const audit: RunAudit = {
            ordinal,
            accepted: false,
            requestPurposes: [],
            attemptStatuses: [],
            fieldRepairCount: 0
          };
          try {
            const setup = createSetup(ordinal);
            const baseClient = createNarratorClientFromSettings(
              settings,
              createAuditedFetch(httpAudits)
            );
            const narrator = auditNarrator(baseClient, modelAudits);
            const opened = await runOpening({
              setup,
              initialState: createInitialRuntimeState(setup),
              narrator,
              repairNarrator: narrator,
              narrativeLengthLevel: 'compact',
              promptSettings: settings.prompts,
              tavernSettings: settings.tavern,
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
              throw new Error('本次开局没有生成远场人物。');
            }
            const currentSceneActors =
              opened.scenes[opened.location.currentSceneId!]?.presentActorIds ?? [];
            for (const actor of remoteActors) {
              if (currentSceneActors.includes(actor.actorId)) {
                throw new Error(`远场人物错误进入当前场景：${actor.actorId}`);
              }
              if (
                !actor.currentPlaceId &&
                (actor.lastSeenAt || actor.lastSeenPlaceId)
              ) {
                throw new Error(`未知位置的远场人物获得了伪造 lastSeen：${actor.actorId}`);
              }
            }
            const narratorEntry = [...opened.storyLog]
              .reverse()
              .find((entry) => entry.speaker === 'narrator');
            if (
              !narratorEntry?.text.trim() ||
              (narratorEntry.suggestedActions?.length ?? 0) < 2
            ) {
              throw new Error('开局正文或行动选项没有完整落库。');
            }
            if (
              opened.player.economy.cashOnHand < 0 ||
              !opened.player.homeBase?.placeId
            ) {
              throw new Error('开局经济或住所没有完整落库。');
            }

            const repository = new IndexedDbSaveRepository(
              `opening-blueprint-real-${crypto.randomUUID()}`
            );
            const saveId = `opening_recovery_${ordinal}`;
            await repository.save({
              saveId,
              saveName: `同模型开局恢复验收 ${ordinal}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              playerName: opened.player.name,
              worldpackId: opened.world.worldpackId,
              gameDateLabel: `${opened.time.year}-${opened.time.month}-${opened.time.day}`,
              turnCounter: opened.turnCounter,
              runtimeState: opened
            });
            const loaded = await repository.load(saveId);
            if (!loaded) throw new Error('保存后无法读取开局存档。');
            expect(loaded.runtimeState).toEqual(opened);

            const diagnostics = narratorEntry.writebackDiagnostics ?? [];
            audit.accepted = true;
            audit.actorCount = actors.length;
            audit.remoteActorCount = remoteActors.length;
            audit.remoteActorIds = remoteActors.map((actor) => actor.actorId);
            audit.missingRemoteLocationCount = remoteActors.filter(
              (actor) => !actor.currentPlaceId && !actor.currentSceneId
            ).length;
            audit.localNormalizationRecorded = diagnostics.some(
              (issue) => issue.code === 'opening_blueprint_local_normalization'
            );
            audit.fieldRepairRecorded = diagnostics.some(
              (issue) => issue.code === 'opening_blueprint_field_repaired'
            );
            audit.saveReloadMatched = true;
          } catch (error) {
            audit.error = safeError(error);
          }

          const currentModelAudits = modelAudits.slice(modelStart);
          audit.requestPurposes = currentModelAudits.map((entry) => entry.purpose);
          audit.attemptStatuses = attempts.map((attempt) => ({
            purpose: attempt.purpose,
            parseStatus: attempt.parseStatus,
            finishReason: attempt.finishReason
          }));
          audit.fieldRepairCount = audit.requestPurposes.filter(
            (purpose) => purpose === 'opening_blueprint_field_repair'
          ).length;
          runAudits.push(audit);
          process.stdout.write(
            `[opening-blueprint-recovery] ${ordinal}/${runCount} ` +
              `accepted=${audit.accepted} remote=${audit.remoteActorCount ?? 0} ` +
              `fieldRepair=${audit.fieldRepairCount}\n`
          );
        }

        const report = {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          route: routeLabel,
          requestedRuns: runCount,
          consecutiveSuccesses: runAudits.filter((audit) => audit.accepted).length,
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
              (audit) => audit.status !== null && audit.status >= 200 && audit.status < 300
            ).length,
            failedCount: httpAudits.filter(
              (audit) => audit.status === null || audit.status >= 400
            ).length
          },
          modelCalls: {
            count: modelAudits.length,
            failedCount: modelAudits.filter((audit) => !audit.succeeded).length
          },
          runs: runAudits
        };
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

        expect(runAudits).toHaveLength(runCount);
        expect(runAudits.every((audit) => audit.accepted)).toBe(true);
        expect(runAudits.every((audit) => (audit.remoteActorCount ?? 0) > 0)).toBe(
          true
        );
        expect(runAudits.every((audit) => audit.saveReloadMatched)).toBe(true);
        expect(
          runAudits.every(
            (audit) =>
              audit.requestPurposes.filter(
                (purpose) => purpose === 'opening_blueprint'
              ).length === 1
          )
        ).toBe(true);
      },
      3_600_000
    );
  }
);
