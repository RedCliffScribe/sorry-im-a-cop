import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  createCustomContentGenerationClient,
  generateCustomCharacterDraft
} from '../../src/domain/customContent/characterCreation';
import { generateCustomEventProjectDraft } from '../../src/domain/customContent/eventProjectCreation';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import type { AiSettings } from '../../src/domain/settings/types';

const shouldRun =
  process.env.COPV2_RUN_CUSTOM_CONTENT_CREATION_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const outputPath = path.resolve(
  process.env.COPV2_CUSTOM_CONTENT_CREATION_REAL_API_OUTPUT_PATH ??
    path.join('output', 'custom-content-creation-real-api', 'latest.json')
);

type ScenarioKind = 'character' | 'event_project';

const allScenarios: readonly ScenarioKind[] = [
  'character',
  'event_project'
];

interface RouteChoice {
  profileId: string;
  profileName: string;
  model: string;
  label: string;
}

interface HttpAudit {
  route: string;
  scenario: ScenarioKind;
  status: number | null;
  durationMs: number;
  errorCategory?: 'network_error';
}

interface SchemaIssueAudit {
  code: string;
  path: string;
  expected?: string;
  message: string;
}

interface FailureAudit {
  errorName: string;
  category:
    | 'schema_validation'
    | 'response_parse'
    | 'request_timeout'
    | 'provider_error'
    | 'reference_validation'
    | 'unknown_error';
  schemaIssues?: SchemaIssueAudit[];
}

interface ScenarioResult {
  route: string;
  profileName: string;
  model: string;
  scenario: ScenarioKind;
  iteration?: number;
  accepted: boolean;
  durationMs: number;
  httpRequestCount: number;
  httpStatusCounts: Record<string, number>;
  summary?: Record<string, string | number | boolean>;
  failure?: FailureAudit;
}

const routeChoices: RouteChoice[] = [
  {
    profileId: 'api_xiaomi_mimo',
    profileName: 'xiaomi-mimo',
    model: 'mimo-v2.5',
    label: 'xiaomi-mimo/mimo-v2.5'
  },
  {
    profileId: 'api_yuqing',
    profileName: 'yuqing',
    model: '企业cli-gemini-3-flash-preview',
    label: 'yuqing/gemini-3-flash-preview'
  },
  {
    profileId: 'api_tianbohe',
    profileName: 'tianbohe',
    model: 'gemini-3-flash-preview',
    label: 'tianbohe/gemini-3-flash-preview'
  },
  {
    profileId: 'api_yuqing',
    profileName: 'yuqing',
    model: 'grok-4.3-fast',
    label: 'yuqing/grok-4.3-fast'
  },
  {
    profileId: 'api_yuqing',
    profileName: 'yuqing',
    model: 'grok-4.20-fast',
    label: 'yuqing/grok-4.20-fast'
  },
  {
    profileId: 'api_siliconflow',
    profileName: 'siliconflow',
    model: 'deepseek-ai/DeepSeek-V4-Flash',
    label: 'siliconflow/deepseek-ai/DeepSeek-V4-Flash'
  }
];

const characterDescription = [
  '创建一名适用于1988年香港警务叙事的独立自定义人物。',
  '她是27岁的夜班法证助理，熟悉证物封存、交接簿和编号核对。',
  '她谨慎、冷静，重视程序正义，但不预设认识玩家或已经介入任何案件。',
  '给出清晰的核心性格、价值观、动机和一项尚未成为存档事实的职业关系。'
].join('');

const eventDescription = [
  '创建一个适用于1988年香港旺角警署的短事件项目。',
  '夜班交接过程中可能出现一处证物封条编号与交接簿不一致；这只是来源素材，不能预设本局已经发生。',
  '项目包含一名法证联系人候选、一个事件组、一个阶段和至少一个可执行节点。',
  '玩家必须能够选择核验、延后或拒绝，事件不得替玩家作决定，也不得凭空宣布案件成立。'
].join('');

function requestedScenarios(): readonly ScenarioKind[] {
  const filter =
    process.env.COPV2_CUSTOM_CONTENT_CREATION_SCENARIOS?.trim();
  if (!filter) {
    return allScenarios;
  }
  const values = Array.from(
    new Set(
      filter
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
  const unknown = values.filter(
    (value) => !allScenarios.includes(value as ScenarioKind)
  );
  if (unknown.length > 0) {
    throw new Error(`未知的生成场景过滤器：${unknown.join(', ')}`);
  }
  return values as ScenarioKind[];
}

function requestedRoutes(): readonly RouteChoice[] {
  const filter =
    process.env.COPV2_CUSTOM_CONTENT_CREATION_ROUTES?.trim();
  if (!filter) {
    return routeChoices;
  }
  const labels = Array.from(
    new Set(
      filter
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
  const selected = routeChoices.filter((route) =>
    labels.includes(route.label)
  );
  const unknown = labels.filter(
    (label) => !routeChoices.some((route) => route.label === label)
  );
  if (unknown.length > 0) {
    throw new Error(`未知的生成线路过滤器：${unknown.join(', ')}`);
  }
  return selected;
}

function requestedRepeatCount(): number {
  const raw =
    process.env.COPV2_CUSTOM_CONTENT_CREATION_REPEAT_COUNT?.trim();
  if (!raw) {
    return 1;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error('真实生成重复次数必须是 1 到 20 的整数。');
  }
  return value;
}

function countValues(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function auditedFetch(
  route: RouteChoice,
  scenario: ScenarioKind,
  audits: HttpAudit[]
): typeof fetch {
  return async (input, init) => {
    const startedAt = performance.now();
    try {
      const response = await fetch(input, init);
      audits.push({
        route: route.label,
        scenario,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt)
      });
      return response;
    } catch (error) {
      audits.push({
        route: route.label,
        scenario,
        status: null,
        durationMs: Math.round(performance.now() - startedAt),
        errorCategory: 'network_error'
      });
      throw error;
    }
  };
}

function schemaIssue(issue: ZodError['issues'][number]): SchemaIssueAudit {
  const expected =
    'expected' in issue && typeof issue.expected === 'string'
      ? issue.expected
      : undefined;
  return {
    code: issue.code,
    path: issue.path.map(String).join('.'),
    expected,
    message: issue.message
  };
}

function failureAudit(error: unknown): FailureAudit {
  if (error instanceof ZodError) {
    return {
      errorName: error.name,
      category: 'schema_validation',
      schemaIssues: error.issues.map(schemaIssue)
    };
  }
  const errorName = error instanceof Error ? error.name : typeof error;
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error);
  if (error instanceof SyntaxError || message.includes('json')) {
    return { errorName, category: 'response_parse' };
  }
  if (message.includes('timeout') || message.includes('超时')) {
    return { errorName, category: 'request_timeout' };
  }
  if (
    message.includes('引用') ||
    message.includes('稳定键') ||
    message.includes('角色槽')
  ) {
    return { errorName, category: 'reference_validation' };
  }
  if (
    message.includes('http') ||
    message.includes('provider') ||
    message.includes('接口')
  ) {
    return { errorName, category: 'provider_error' };
  }
  return { errorName, category: 'unknown_error' };
}

function requireRoute(settings: AiSettings, route: RouteChoice): void {
  const profile = settings.apiProfiles.find(
    (item) => item.id === route.profileId
  );
  if (!profile) {
    throw new Error(`缺少测试 Profile：${route.profileName}`);
  }
  if (!profile.models.includes(route.model)) {
    throw new Error(`Profile 缺少测试模型：${route.label}`);
  }
}

async function runCharacterScenario({
  settings,
  route,
  httpAudits
}: {
  settings: AiSettings;
  route: RouteChoice;
  httpAudits: HttpAudit[];
}): Promise<ScenarioResult> {
  const scenario: ScenarioKind = 'character';
  const httpStart = httpAudits.length;
  const startedAt = performance.now();
  try {
    const generation = await generateCustomCharacterDraft({
      client: createCustomContentGenerationClient({
        settings,
        profileId: route.profileId,
        model: route.model,
        fetchImpl: auditedFetch(route, scenario, httpAudits)
      }),
      description: characterDescription
    });
    const draft = generation.draft;
    const scenarioAudits = httpAudits.slice(httpStart);
    return {
      route: route.label,
      profileName: route.profileName,
      model: route.model,
      scenario,
      accepted: true,
      durationMs: Math.round(performance.now() - startedAt),
      httpRequestCount: scenarioAudits.length,
      httpStatusCounts: countValues(
        scenarioAudits.map((audit) =>
          audit.status === null ? 'network_error' : String(audit.status)
        )
      ),
      summary: {
        hasDisplayName: Boolean(draft.displayName.trim()),
        aliasCount: draft.aliases.length,
        corePersonalityCount: draft.corePersonality.length,
        valueCount: draft.values.length,
        motivationCount: draft.coreMotivations.length,
        relationshipCount: draft.majorRelationships.length,
        entryMode: draft.entryMode,
        recovery: generation.recovery,
        generationIssueCount: generation.issues.length,
        formatRepairAttempted:
          generation.diagnostics.formatRepairAttempted
      }
    };
  } catch (error) {
    const scenarioAudits = httpAudits.slice(httpStart);
    return {
      route: route.label,
      profileName: route.profileName,
      model: route.model,
      scenario,
      accepted: false,
      durationMs: Math.round(performance.now() - startedAt),
      httpRequestCount: scenarioAudits.length,
      httpStatusCounts: countValues(
        scenarioAudits.map((audit) =>
          audit.status === null ? 'network_error' : String(audit.status)
        )
      ),
      failure: failureAudit(error)
    };
  }
}

async function runEventScenario({
  settings,
  route,
  httpAudits
}: {
  settings: AiSettings;
  route: RouteChoice;
  httpAudits: HttpAudit[];
}): Promise<ScenarioResult> {
  const scenario: ScenarioKind = 'event_project';
  const httpStart = httpAudits.length;
  const startedAt = performance.now();
  try {
    const draft = await generateCustomEventProjectDraft({
      client: createCustomContentGenerationClient({
        settings,
        profileId: route.profileId,
        model: route.model,
        fetchImpl: auditedFetch(route, scenario, httpAudits)
      }),
      description: eventDescription
    });
    const scenarioAudits = httpAudits.slice(httpStart);
    const stages = draft.eventGroups.flatMap((group) => group.stages);
    const nodes = stages.flatMap((stage) => stage.eventNodes);
    return {
      route: route.label,
      profileName: route.profileName,
      model: route.model,
      scenario,
      accepted: true,
      durationMs: Math.round(performance.now() - startedAt),
      httpRequestCount: scenarioAudits.length,
      httpStatusCounts: countValues(
        scenarioAudits.map((audit) =>
          audit.status === null ? 'network_error' : String(audit.status)
        )
      ),
      summary: {
        hasProjectTitle: Boolean(draft.project.title.trim()),
        characterCandidateCount: draft.characterCandidates.length,
        eventGroupCount: draft.eventGroups.length,
        stageCount: stages.length,
        nodeCount: nodes.length,
        possibleOutcomeCount: nodes.reduce(
          (total, node) => total + node.possibleOutcomes.length,
          0
        )
      }
    };
  } catch (error) {
    const scenarioAudits = httpAudits.slice(httpStart);
    return {
      route: route.label,
      profileName: route.profileName,
      model: route.model,
      scenario,
      accepted: false,
      durationMs: Math.round(performance.now() - startedAt),
      httpRequestCount: scenarioAudits.length,
      httpStatusCounts: countValues(
        scenarioAudits.map((audit) =>
          audit.status === null ? 'network_error' : String(audit.status)
        )
      ),
      failure: failureAudit(error)
    };
  }
}

describe.skipIf(!shouldRun)(
  'custom content creation through real APIs',
  () => {
    it(
      'validates character and short event generation across fast models',
      async () => {
        const settings = importApiSettings(
          createDefaultAiSettings(),
          await readFile(settingsPath, 'utf8')
        );
        const routes = requestedRoutes();
        const repeatCount = requestedRepeatCount();
        routes.forEach((route) => requireRoute(settings, route));

        const httpAudits: HttpAudit[] = [];
        const results: ScenarioResult[] = [];
        const scenarios = requestedScenarios();
        for (const route of routes) {
          for (let iteration = 1; iteration <= repeatCount; iteration += 1) {
            if (scenarios.includes('character')) {
              const character = await runCharacterScenario({
                settings,
                route,
                httpAudits
              });
              results.push({ ...character, iteration });
              process.stdout.write(
                `[custom-create-real] route=${route.label} scenario=character iteration=${iteration}/${repeatCount} accepted=${character.accepted}\n`
              );
            }

            if (scenarios.includes('event_project')) {
              const event = await runEventScenario({
                settings,
                route,
                httpAudits
              });
              results.push({ ...event, iteration });
              process.stdout.write(
                `[custom-create-real] route=${route.label} scenario=event_project iteration=${iteration}/${repeatCount} accepted=${event.accepted}\n`
              );
            }
          }
        }

        const failed = results.filter((result) => !result.accepted);
        const report = {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          accepted: failed.length === 0,
          routeCount: routes.length,
          repeatCount,
          scenarioCount: results.length,
          passedScenarioCount: results.length - failed.length,
          failedScenarioCount: failed.length,
          http: {
            requestCount: httpAudits.length,
            statusCounts: countValues(
              httpAudits.map((audit) =>
                audit.status === null
                  ? 'network_error'
                  : String(audit.status)
              )
            )
          },
          results
        };
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(
          outputPath,
          JSON.stringify(report, null, 2),
          'utf8'
        );

        expect(
          failed.map((result) => ({
            route: result.route,
            scenario: result.scenario,
            failure: result.failure
          }))
        ).toEqual([]);
      },
      14_400_000
    );
  }
);
