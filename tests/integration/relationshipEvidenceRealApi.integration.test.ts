import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NarratorClient, NarratorStreamOptions } from '../../src/domain/narrator/NarratorClient';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { createActorDefaults } from '../../src/domain/runtime/actorFactory';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type { RuntimeState } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import {
  runPlayerTurn,
  type TurnExecutionStage
} from '../../src/domain/turn/TurnEngine';
import { createWritebackRepairClientFromSettings } from '../../src/domain/writeback/createWritebackRepairClientFromSettings';

const shouldRun = process.env.COPV2_RUN_RELATIONSHIP_EVIDENCE_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const profileSelector =
  process.env.COPV2_RELATIONSHIP_EVIDENCE_PROFILE ?? 'api_tianbohe';
const model =
  process.env.COPV2_RELATIONSHIP_EVIDENCE_MODEL ?? 'gemini-3-flash-preview';
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_RELATIONSHIP_EVIDENCE_TIMEOUT_MS ?? 600_000)
);
const outputPath = path.resolve(
  process.env.COPV2_RELATIONSHIP_EVIDENCE_OUTPUT_PATH ??
    path.join('output', 'relationship-evidence-real-api', 'latest.json')
);

type ScenarioId =
  | 'formal_promise'
  | 'repeated_contact'
  | 'ordinary_contact'
  | 'invalid_evidence_kind'
  | 'insufficient_repeated_contact';

interface Scenario {
  id: ScenarioId;
  playerInput: string;
  historicalMemory: boolean;
}

interface HttpAudit {
  route: 'main' | 'writebackRepair';
  status: number | null;
  durationMs: number;
  error?: string;
}

interface ScenarioResult {
  id: ScenarioId;
  accepted: boolean;
  mainRequestCount: number;
  judgementPreflightRequestCount: number;
  judgementRegenerated: boolean;
  relationshipRepairRequestCount: number;
  threadCreated: boolean;
  evidenceKinds: string[];
  evidenceCount: number;
  matterPreserved: boolean;
  turnAdvanced: boolean;
  diagnosticCodes: string[];
  diagnostics: Array<{ code?: string; path: string; message: string }>;
  failure?: string;
}

const scenarios: readonly Scenario[] = [
  {
    id: 'formal_promise',
    playerInput: '林记者明确承诺以后继续把经过核实的夜总会消息交给我，我接受这项正式联络安排。',
    historicalMemory: false
  },
  {
    id: 'repeated_contact',
    playerInput: '林记者按此前留下的号码第二次找来，再交给我一条经过核实的夜总会线索。',
    historicalMemory: true
  },
  {
    id: 'ordinary_contact',
    playerInput: '我在街角偶然问林记者时间，她回答后各自离开，没有交换承诺或建立长期联系。',
    historicalMemory: false
  },
  {
    id: 'invalid_evidence_kind',
    playerInput: '林记者明确留下电话并承诺后续继续交换线索，我接受这项安排。',
    historicalMemory: false
  },
  {
    id: 'insufficient_repeated_contact',
    playerInput: '我第一次见到林记者，她提议以后或许可以互通消息，但过去没有任何接触记录。',
    historicalMemory: false
  }
];

function activeScenarios(): readonly Scenario[] {
  const requested = new Set(
    (process.env.COPV2_RELATIONSHIP_EVIDENCE_SCENARIOS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  if (requested.size === 0) return scenarios;
  const selected = scenarios.filter((scenario) => requested.has(scenario.id));
  if (selected.length === 0) {
    throw new Error('真实关系证据验收没有匹配到任何场景。');
  }
  return selected;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .slice(0, 800);
}

function resolveSettings(source: AiSettings): AiSettings {
  const profile = source.apiProfiles.find(
    (candidate) =>
      candidate.id === profileSelector ||
      candidate.name.toLowerCase() === profileSelector.toLowerCase()
  );
  if (!profile) throw new Error(`找不到真实 API 档案：${profileSelector}`);
  if (!profile.models.includes(model)) {
    throw new Error(`档案 ${profile.name} 未声明模型 ${model}`);
  }
  return {
    ...source,
    mainNarrator: {
      apiProfileId: profile.id,
      model,
      maxTokensMode: 'custom',
      maxTokens: 8_192,
      temperature: 0.25
    },
    featureRoutes: {
      ...source.featureRoutes,
      writebackRepair: {
        mode: 'custom',
        apiProfileId: profile.id,
        model,
        maxTokens: 4_096,
        temperature: 0.1
      }
    }
  };
}

function createAuditedFetch(route: HttpAudit['route'], audits: HttpAudit[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
        route,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt)
      });
      return response;
    } catch (error) {
      audits.push({
        route,
        status: null,
        durationMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function relationshipPatch(scenario: Scenario): Record<string, unknown> | undefined {
  if (scenario.id === 'ordinary_contact') return undefined;
  const repeated =
    scenario.id === 'repeated_contact' ||
    scenario.id === 'insufficient_repeated_contact';
  const evidenceRefs: Array<Record<string, unknown>> = [
    {
      kind: scenario.id === 'invalid_evidence_kind' ? 'currentTurn' : 'current_turn',
      refId: 'current_turn',
      summary: repeated ? '本回合发生当前接触。' : '本回合明确形成持续联络承诺。'
    }
  ];
  if (scenario.id === 'invalid_evidence_kind') {
    evidenceRefs.push({
      kind: 'unknown_relation_evidence',
      refId: 'memory_not_real',
      summary: '这条非法证据应被单独移除。'
    });
  }
  return {
    threadId: `rel_real_${scenario.id}`,
    kind: 'network',
    title: repeated ? '与林记者的持续接触' : '林记者的线索承诺',
    summary: repeated ? '主叙事明确尝试建立持续人脉。' : '双方形成持续线索联络承诺。',
    relatedActorIds: ['npc_reporter_lam'],
    primaryActorId: 'npc_reporter_lam',
    relationshipRole: '媒体联系人',
    creationBasis: repeated ? 'repeated_contact' : 'debt_or_promise',
    evidenceRefs,
    status: 'active',
    visibility: 'player_known',
    importance: 65
  };
}

function createScenarioNarrator(
  provider: NarratorClient,
  scenario: Scenario
): {
  client: NarratorClient;
  requestCount: (purpose: string) => number;
} {
  const requestCounts = new Map<string, number>();
  const recordRequest = (options?: NarratorStreamOptions) => {
    const purpose = options?.requestPurpose ?? 'unspecified';
    requestCounts.set(purpose, (requestCounts.get(purpose) ?? 0) + 1);
  };
  const inject = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    const patch = relationshipPatch(scenario);
    return {
      ...value,
      turnSummary:
        typeof value.turnSummary === 'string' && value.turnSummary.trim()
          ? value.turnSummary
          : '本回合完成关系证据真实 API 验收。',
      suggestedActions:
        Array.isArray(value.suggestedActions) && value.suggestedActions.length > 0
          ? value.suggestedActions
          : ['继续核对线索', '结束交谈'],
      playerVitalsReview: {
        changed: false,
        reason: '本回合只有普通交谈，身体状态没有变化。'
      },
      timePatch: {
        elapsedMinutes: 5,
        reason: '完成一次简短交谈。'
      },
      writeback: {
        currentMatterPatches: [
          {
            id: `matter_real_${scenario.id}`,
            title: '关系证据验收事项',
            summary: '这条事项用于确认关系修复不会覆盖其他首份写回。',
            status: 'active',
            priority: 20,
            visibility: 'known',
            source: 'real_api_acceptance',
            matterKind: 'social',
            pressureLevel: 0,
            responseWindow: 'open',
            currentHook: '验收后保持原样。',
            relatedActorIds: ['npc_reporter_lam']
          }
        ],
        relationshipThreadPatches: patch ? [patch] : []
      }
    };
  };

  const injectMainTurn = (
    value: unknown,
    options?: NarratorStreamOptions
  ): unknown =>
    options?.requestPurpose === 'main_turn' ? inject(value) : value;

  return {
    requestCount: (purpose) => requestCounts.get(purpose) ?? 0,
    client: {
      configuredMaxTokens: provider.configuredMaxTokens,
      complete: async (input: string, options?: NarratorStreamOptions) => {
        recordRequest(options);
        return injectMainTurn(
          await provider.complete(input, options),
          options
        );
      },
      ...(provider.completeDetailed
        ? {
            completeDetailed: async (
              input: string,
              options?: NarratorStreamOptions
            ) => {
              recordRequest(options);
              const detailed = await provider.completeDetailed!(input, options);
              return {
                ...detailed,
                value: injectMainTurn(detailed.value, options)
              };
            }
          }
        : {})
    }
  };
}

function createCountingRepairClient(client: NarratorClient): {
  client: NarratorClient;
  relationshipPromptCount: () => number;
} {
  let relationshipPrompts = 0;
  const count = (input: string) => {
    if (input.includes('relationshipThreads')) relationshipPrompts += 1;
  };
  return {
    relationshipPromptCount: () => relationshipPrompts,
    client: {
      configuredMaxTokens: client.configuredMaxTokens,
      complete: (input, options) => {
        count(input);
        return client.complete(input, options);
      },
      ...(client.completeDetailed
        ? {
            completeDetailed: (input, options) => {
              count(input);
              return client.completeDetailed!(input, options);
            }
          }
        : {})
    }
  };
}

function createScenarioState(scenario: Scenario): RuntimeState {
  const state = createInitialRuntimeState({ currentIdentity: 'police' });
  state.actors.npc_reporter_lam = createActorDefaults({
    actorId: 'npc_reporter_lam',
    name: '林慧珊',
    gender: 'female',
    computedAge: 28,
    currentIdentity: 'civilian',
    publicIdentity: '报馆记者',
    relationshipSummary: '与玩家有新闻线索接触。',
    visibility: 'player_known',
    importance: 65
  });
  if (scenario.historicalMemory) {
    state.memories.memory_reporter_verified_contact = {
      memoryId: 'memory_reporter_verified_contact',
      text: '林记者此前曾给玩家留下私人电话，并交过第一条夜总会线索。',
      kind: 'world',
      relatedActorIds: ['npc_reporter_lam'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      gameTime: { ...state.time },
      importance: 75,
      visibility: 'player_known',
      certainty: 'fact'
    };
  }
  return state;
}

async function runScenario(
  settings: AiSettings,
  scenario: Scenario,
  audits: HttpAudit[]
): Promise<ScenarioResult> {
  const state = createScenarioState(scenario);
  const stages: TurnExecutionStage[] = [];
  let scenarioNarrator:
    | ReturnType<typeof createScenarioNarrator>
    | undefined;
  try {
    const provider = createNarratorClientFromSettings(
      settings,
      createAuditedFetch('main', audits)
    );
    const repairProvider = createWritebackRepairClientFromSettings(
      settings,
      createAuditedFetch('writebackRepair', audits)
    );
    if (!repairProvider) throw new Error('真实关系证据验收没有可用的写回修复线路。');
    const repair = createCountingRepairClient(repairProvider);
    scenarioNarrator = createScenarioNarrator(provider, scenario);
    const next = await runPlayerTurn({
      state,
      playerInput: scenario.playerInput,
      narrator: scenarioNarrator.client,
      writebackRepair: repair.client,
      enableJudgementPreflight: true,
      judgementRoll: 50,
      gameSettings: {
        ...createDefaultAiSettings().game,
        narrativeLengthLevel: 'brief',
        pregnancyMode: 'off',
        dramaticContent: {
          ...createDefaultAiSettings().game.dramaticContent,
          enabled: false
        }
      },
      onStageChange: (stage) => stages.push(stage),
      signal: AbortSignal.timeout(requestTimeoutMs * 3)
    });
    const thread = next.relationshipThreads[`rel_real_${scenario.id}`];
    const diagnosticCodes = (next.storyLog.at(-1)?.writebackDiagnostics ?? [])
      .map((issue) => issue.code)
      .filter((code): code is string => Boolean(code));
    const diagnostics = (next.storyLog.at(-1)?.writebackDiagnostics ?? []).map((issue) => ({
      code: issue.code,
      path: issue.path?.join('.') || '(root)',
      message: safeError(issue.message)
    }));
    const expectsThread = scenario.id !== 'ordinary_contact' && scenario.id !== 'insufficient_repeated_contact';
    const violations: string[] = [];
    if (Boolean(thread) !== expectsThread) {
      violations.push(`关系线预期=${expectsThread}，实际=${Boolean(thread)}。`);
    }
    if (scenario.id === 'repeated_contact') {
      if (!thread?.evidenceRefs?.some((ref) => ref.refId === 'memory_reporter_verified_contact')) {
        violations.push('repeated_contact 没有采用真实历史记忆。');
      }
      if (!diagnosticCodes.includes('relationship_structure_repair_applied')) {
        violations.push('repeated_contact 没有记录最小关系结构修复成功。');
      }
    }
    if (scenario.id === 'invalid_evidence_kind') {
      if (!diagnosticCodes.includes('relationship_evidence_kind_normalized')) {
        violations.push('非法 evidence kind 没有记录本地归一化。');
      }
      if (!diagnosticCodes.includes('relationship_evidence_ref_removed')) {
        violations.push('无法识别的 evidence kind 没有被单项移除。');
      }
    }
    if (scenario.id === 'insufficient_repeated_contact') {
      if (!diagnosticCodes.includes('relationship_creation_rejected')) {
        violations.push('无历史依据的 repeated_contact 没有被最终门禁拒绝。');
      }
    }
    const matterPreserved = Boolean(next.dynamicEvents.currentMatters[`matter_real_${scenario.id}`]);
    if (!matterPreserved) violations.push('关系修复覆盖了首份 currentMatter 写回。');
    const mainRequestCount = scenarioNarrator.requestCount('main_turn');
    const judgementPreflightRequestCount =
      scenarioNarrator.requestCount('main_turn_judgement_preflight') +
      scenarioNarrator.requestCount('main_turn_judgement_preflight_repair');
    if (mainRequestCount !== 1) violations.push(`主叙事请求次数应为 1，实际 ${mainRequestCount}。`);
    if (judgementPreflightRequestCount < 1) {
      violations.push('没有执行正文前判定预检。');
    }
    if (stages.includes('regenerating_judgement')) {
      violations.push('关系线回归触发了被禁止的整回合判定重生成。');
    }

    return {
      id: scenario.id,
      accepted: violations.length === 0,
      mainRequestCount,
      judgementPreflightRequestCount,
      judgementRegenerated: stages.includes('regenerating_judgement'),
      relationshipRepairRequestCount: repair.relationshipPromptCount(),
      threadCreated: Boolean(thread),
      evidenceKinds: thread?.evidenceRefs?.map((ref) => ref.kind) ?? [],
      evidenceCount: thread?.evidenceRefs?.length ?? 0,
      matterPreserved,
      turnAdvanced: next.turnCounter === state.turnCounter + 1,
      diagnosticCodes,
      diagnostics,
      ...(violations.length > 0 ? { failure: violations.join(' ') } : {})
    };
  } catch (error) {
    return {
      id: scenario.id,
      accepted: false,
      mainRequestCount: scenarioNarrator?.requestCount('main_turn') ?? 0,
      judgementPreflightRequestCount:
        (scenarioNarrator?.requestCount(
          'main_turn_judgement_preflight'
        ) ?? 0) +
        (scenarioNarrator?.requestCount(
          'main_turn_judgement_preflight_repair'
        ) ?? 0),
      judgementRegenerated: stages.includes('regenerating_judgement'),
      relationshipRepairRequestCount: 0,
      threadCreated: false,
      evidenceKinds: [],
      evidenceCount: 0,
      matterPreserved: false,
      turnAdvanced: false,
      diagnosticCodes: [],
      diagnostics: [],
      failure: safeError(error)
    };
  }
}

describe.skipIf(!shouldRun)('relationship evidence recovery through a real API', () => {
  it('accepts valid evidence and rejects unsupported relationship creation without regenerating the turn', async () => {
    const settings = resolveSettings(
      importApiSettings(
        createDefaultAiSettings(),
        await readFile(settingsPath, 'utf8')
      )
    );
    const audits: HttpAudit[] = [];
    const results: ScenarioResult[] = [];
    for (const scenario of activeScenarios()) {
      const result = await runScenario(settings, scenario, audits);
      results.push(result);
      process.stdout.write(
        `[relationship-evidence-real] scenario=${scenario.id} accepted=${result.accepted} mainRequests=${result.mainRequestCount} repairRequests=${result.relationshipRepairRequestCount} thread=${result.threadCreated}\n`
      );
    }

    const failed = results.filter((result) => !result.accepted);
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      test: 'relationship-evidence-v1.7.13-real-api',
      accepted: failed.length === 0,
      credentialSafety: {
        keyValuesRecorded: false,
        baseUrlsRecorded: false,
        rawPromptsRecorded: false,
        rawResponsesRecorded: false,
        narrativeTextRecorded: false
      },
      profileId: profileSelector,
      model,
      scenarioCount: results.length,
      passedScenarioCount: results.length - failed.length,
      failedScenarioCount: failed.length,
      http: {
        requestCount: audits.length,
        statusCounts: audits.reduce<Record<string, number>>((counts, audit) => {
          const key = audit.status === null ? 'network_error' : String(audit.status);
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}),
        durationsMs: audits.map((audit) => audit.durationMs)
      },
      results
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(failed.map((result) => ({ id: result.id, failure: result.failure }))).toEqual([]);
  });
});
