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

const shouldRun =
  process.env.COPV2_RUN_OPENING_EMPLOYER_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_OPENING_EMPLOYER_TIMEOUT_MS ?? 600_000)
);
const outputPath = path.resolve(
  process.env.COPV2_OPENING_EMPLOYER_OUTPUT_PATH ??
    path.join('output', 'opening-employer-real-api', 'latest.json')
);
const selectedScenarioIds = new Set(
  (process.env.COPV2_OPENING_EMPLOYER_SCENARIOS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

type ScenarioId =
  | 'structured_employer'
  | 'background_only_employer'
  | 'optional_employed_extra';

interface Scenario {
  id: ScenarioId;
  profileId: string;
  model: string;
  setup: OpeningSetup;
}

interface ScenarioAudit {
  scenarioId: ScenarioId;
  route: string;
  accepted: boolean;
  requestPurposes: NarratorRequestPurpose[];
  employerRepairRequestCount: number;
  requestCount: number;
  httpFailures: number;
  saveReloadMatched?: boolean;
  organizationReferenceCount?: number;
  stageDiagnosticCodes?: string[];
  error?: string;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key|tp)-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .slice(0, 800);
}

function createBaseSetup(
  playerName: string,
  minute: number
): OpeningSetup {
  return {
    playerName,
    englishName: `${playerName} English`,
    gender: 'male',
    age: 27,
    currentIdentity: 'civilian',
    civilianProfileId: 'custom_occupation',
    startTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: 19,
      minute
    },
    openingPressure: 'routine',
    storypackInfluence: 'high',
    screenCharacterSeedsEnabled: false,
    openingNote: ''
  };
}

function createScenarios(): Scenario[] {
  return [
    {
      id: 'structured_employer',
      profileId: 'api_xiaomi_mimo',
      model: 'mimo-v2.5',
      setup: {
        ...createBaseSetup('何志强', 11),
        civilianCustomProfile: {
          publicOccupation: '摄影助理',
          workplacePlaceId: 'place_broadcast_drive',
          workplaceLabel: '广播道',
          employerName: '明光摄影社',
          communitySummary: '平日接触摄影师、冲印店和广告从业者。'
        },
        openingNote:
          '请围绕玩家在明光摄影社的真实工作关系展开；工作关系人物必须绑定本地已经提供的雇主机构 ID，不得新造机构。'
      }
    },
    {
      id: 'background_only_employer',
      profileId: 'api_yuqing',
      model: 'grok-4.20-fast',
      setup: {
        ...createBaseSetup('陈家明', 22),
        civilianCustomProfile: {
          publicOccupation: '贸易文员',
          workplacePlaceId: 'place_central_ferry_piers',
          workplaceLabel: '中环',
          communitySummary: '熟悉码头附近的街坊和普通商业往来。'
        },
        openingNote:
          '我在自由背景中提到金龙贸易公司，但没有填写结构化雇主。不要建立这间公司的机构实体；请使用朋友、邻居、房东或街坊等普通社会关系人物完成开局。'
      }
    },
    {
      id: 'optional_employed_extra',
      profileId: 'api_xiaomi_mimo',
      model: 'mimo-v2.5',
      setup: {
        ...createBaseSetup('梁启文', 33),
        civilianCustomProfile: {
          publicOccupation: '自由摄影师',
          workplacePlaceId: 'place_broadcast_drive',
          workplaceLabel: '广播道',
          communitySummary: '与街坊、顾客和其他自由职业者保持一般来往。'
        },
        openingNote:
          '除必需的普通社会关系人物外，必须增加一名在场的普通额外人物：公开身份是贸易公司受雇职员，但其雇主没有正式机构实体。该额外人物 organizationIds 必须为空，不得填写 employerOrganizationId，也不得创建或虚构任何机构 ID。'
      }
    }
  ];
}

function resolveRoute(
  source: AiSettings,
  scenario: Scenario
): { settings: AiSettings; route: string } {
  const profile = source.apiProfiles.find(
    (candidate) => candidate.id === scenario.profileId
  );
  if (!profile) throw new Error(`找不到真实 API 档案：${scenario.profileId}`);
  if (!profile.models.includes(scenario.model)) {
    throw new Error(`档案 ${profile.name} 未声明模型 ${scenario.model}`);
  }
  return {
    route: `${profile.name}/${scenario.model}`,
    settings: {
      ...source,
      mainNarrator: {
        apiProfileId: profile.id,
        model: scenario.model,
        maxTokensMode: 'custom',
        maxTokens: 32_768,
        temperature: 0.3
      },
      featureRoutes: {
        ...source.featureRoutes,
        writebackRepair: {
          mode: 'custom',
          apiProfileId: profile.id,
          model: scenario.model,
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

function createAuditedFetch(audit: {
  requestCount: number;
  httpFailures: number;
}) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    audit.requestCount += 1;
    const signals = [
      init?.signal,
      AbortSignal.timeout(requestTimeoutMs)
    ].filter((signal): signal is AbortSignal => Boolean(signal));
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.any(signals)
      });
      if (!response.ok) audit.httpFailures += 1;
      return response;
    } catch (error) {
      audit.httpFailures += 1;
      throw error;
    }
  };
}

function auditNarrator(
  client: NarratorClient,
  audit: ScenarioAudit,
  attempts: NarratorAttemptRecord[]
): NarratorClient {
  return {
    configuredMaxTokens: client.configuredMaxTokens,
    complete: (input, options) => {
      audit.requestPurposes.push(options?.requestPurpose ?? 'auxiliary');
      return client.complete(input, options);
    },
    ...(client.completeDetailed
      ? {
          completeDetailed: (input, options) => {
            const purpose = options?.requestPurpose ?? 'auxiliary';
            audit.requestPurposes.push(purpose);
            if (
              purpose === 'opening_actor_enrichment_repair' &&
              typeof input === 'string' &&
              input.includes('roleProfiles.civilian.employerOrganizationId')
            ) {
              audit.employerRepairRequestCount += 1;
            }
            return client.completeDetailed!(input, options);
          }
        }
      : {}),
    ...(client.getLastAttempts
      ? {
          getLastAttempts: () => {
            const values = client.getLastAttempts!();
            attempts.push(...values);
            return values;
          }
        }
      : {})
  };
}

function assertOrganizationReferencesAreReal(
  state: ReturnType<typeof createInitialRuntimeState>
): number {
  let referenceCount = 0;
  for (const actor of Object.values(state.actors)) {
    for (const organizationId of actor.organizationIds) {
      expect(state.organizations[organizationId]).toBeDefined();
      referenceCount += 1;
    }
    const employerId =
      actor.roleProfiles.civilian?.employerOrganizationId;
    if (employerId) {
      expect(state.organizations[employerId]).toBeDefined();
      expect(actor.organizationIds).toContain(employerId);
      referenceCount += 1;
    }
  }
  return referenceCount;
}

describe.skipIf(!shouldRun)(
  'opening civilian employer real API matrix',
  () => {
    it(
      'completes three accepted employer-contract openings across MiMo and Grok',
      async () => {
        const imported = importApiSettings(
          createDefaultAiSettings(),
          await readFile(settingsPath, 'utf8')
        );
        const audits: ScenarioAudit[] = [];

        const scenarios = createScenarios().filter(
          (scenario) =>
            selectedScenarioIds.size === 0 ||
            selectedScenarioIds.has(scenario.id)
        );
        if (scenarios.length === 0) {
          throw new Error('没有匹配的真实开局雇主验收场景。');
        }

        for (const scenario of scenarios) {
          const { settings, route } = resolveRoute(imported, scenario);
          const audit: ScenarioAudit = {
            scenarioId: scenario.id,
            route,
            accepted: false,
            requestPurposes: [],
            employerRepairRequestCount: 0,
            requestCount: 0,
            httpFailures: 0
          };
          const attempts: NarratorAttemptRecord[] = [];

          try {
            const openingRepository = new IndexedDbOpeningSessionRepository(
              `opening-employer-real-session-${crypto.randomUUID()}`
            );
            const narrator = auditNarrator(
              createNarratorClientFromSettings(
                settings,
                createAuditedFetch(audit)
              ),
              audit,
              attempts
            );
            const opened = await runOpeningV2({
              setup: scenario.setup,
              initialState: createInitialRuntimeState(scenario.setup),
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
            const sessionSummary = (await openingRepository.list()).find(
              (candidate) => candidate.stage === 'committed'
            );
            if (!sessionSummary) {
              throw new Error('真实开局完成后没有 committed 会话。');
            }
            const draft = await openingRepository.load(
              sessionSummary.openingSessionId
            );
            if (!draft?.castDraft) {
              throw new Error('真实开局完成后缺少可核验的人物蓝图。');
            }

            const openingStory = [...opened.storyLog]
              .reverse()
              .find((entry) => entry.speaker === 'narrator');
            if (
              !openingStory?.text.trim() ||
              (openingStory.suggestedActions?.length ?? 0) < 2 ||
              !opened.player.homeBase?.placeId
            ) {
              throw new Error('真实开局正文、行动或住所未完整落库。');
            }

            if (scenario.id === 'structured_employer') {
              expect(
                opened.organizations.org_player_custom_employer?.name
              ).toBe('明光摄影社');
              expect(
                opened.actors.player.roleProfiles.civilian
                  ?.employerOrganizationId
              ).toBe('org_player_custom_employer');
              const workProfile = Object.values(
                draft.actorProfiles
              ).find(
                (checkpoint) =>
                  checkpoint.status === 'ready' &&
                  checkpoint.profile.playerRoleRelation ===
                    'civilian_work_relation'
              );
              expect(workProfile?.status).toBe('ready');
              if (workProfile?.status === 'ready') {
                expect(
                  workProfile.profile.roleProfiles.civilian
                    ?.employerOrganizationId
                ).toBe('org_player_custom_employer');
              }
            }

            if (scenario.id === 'background_only_employer') {
              expect(
                opened.organizations.org_player_custom_employer
              ).toBeUndefined();
              expect(
                draft.castDraft.actors.some(
                  (actor) =>
                    actor.playerRoleRelation === 'civilian_social_relation'
                )
              ).toBe(true);
              expect(
                Object.values(draft.actorProfiles).some(
                  (checkpoint) =>
                    checkpoint.status === 'ready' &&
                    checkpoint.profile.playerRoleRelation ===
                      'civilian_work_relation'
                )
              ).toBe(false);
            }

            if (scenario.id === 'optional_employed_extra') {
              const optionalEmployedActor = Object.values(
                draft.actorProfiles
              ).find(
                (checkpoint) =>
                  checkpoint.status === 'ready' &&
                  checkpoint.profile.playerRoleRelation === undefined &&
                  checkpoint.profile.presence === 'present' &&
                  /职员|雇员|员工|文员/.test(
                    `${checkpoint.profile.publicIdentity ?? ''} ${
                      checkpoint.profile.roleProfiles.civilian
                        ?.publicOccupation ?? ''
                    }`
                  ) &&
                  checkpoint.profile.organizationIds.length === 0 &&
                  !checkpoint.profile.roleProfiles.civilian
                    ?.employerOrganizationId
              );
              expect(optionalEmployedActor?.status).toBe('ready');
              expect(audit.employerRepairRequestCount).toBe(0);
            }

            audit.organizationReferenceCount =
              assertOrganizationReferencesAreReal(opened);
            const saveRepository = new IndexedDbSaveRepository(
              `opening-employer-real-save-${crypto.randomUUID()}`
            );
            const saveId = `opening_employer_real_${scenario.id}`;
            const now = new Date().toISOString();
            await saveRepository.save({
              saveId,
              saveName: `雇主契约真实开局 ${scenario.id}`,
              createdAt: now,
              updatedAt: now,
              playerName: opened.player.name,
              worldpackId: opened.world.worldpackId,
              gameDateLabel: `${opened.time.year}-${opened.time.month}-${opened.time.day}`,
              turnCounter: opened.turnCounter,
              runtimeState: opened
            });
            const loaded = await saveRepository.load(saveId);
            if (!loaded) throw new Error('真实开局保存后无法读取。');
            expect(loaded.runtimeState).toEqual(opened);

            audit.stageDiagnosticCodes = draft.diagnostics
              .map((diagnostic) => diagnostic.code)
              .filter((code): code is NonNullable<typeof code> =>
                Boolean(code)
              );
            audit.saveReloadMatched = true;
            audit.accepted = true;
          } catch (error) {
            audit.error = safeError(error);
          }

          audits.push(audit);
          process.stdout.write(
            `[opening-employer-real] ${scenario.id} route=${route} ` +
              `accepted=${audit.accepted} requests=${audit.requestCount} ` +
              `employerRepairs=${audit.employerRepairRequestCount}\n`
          );
        }

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(
          outputPath,
          JSON.stringify(
            {
              schemaVersion: 1,
              generatedAt: new Date().toISOString(),
              acceptedCount: audits.filter((audit) => audit.accepted).length,
              routes: [...new Set(audits.map((audit) => audit.route))],
              audits
            },
            null,
            2
          ),
          'utf8'
        );

        expect(audits).toHaveLength(scenarios.length);
        expect(audits.every((audit) => audit.accepted)).toBe(true);
        if (scenarios.length > 1) {
          expect(
            new Set(audits.map((audit) => audit.route)).size
          ).toBeGreaterThanOrEqual(2);
        }
        expect(audits.every((audit) => audit.saveReloadMatched)).toBe(true);
      },
      3_600_000
    );
  }
);
