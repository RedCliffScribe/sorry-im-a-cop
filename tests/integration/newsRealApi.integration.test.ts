import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import type { NarratorAttemptRecord, NarratorClient } from '../../src/domain/narrator/NarratorClient';
import { maybeGenerateAuxiliaryNews } from '../../src/domain/news/auxiliaryNewsGeneration';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type { GameTime, NewsIssue, RuntimeState } from '../../src/domain/runtime/types';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import type { AiSettings } from '../../src/domain/settings/types';

const shouldRun = process.env.COPV2_RUN_NEWS_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const outputPath = path.resolve(
  process.env.COPV2_NEWS_REAL_API_OUTPUT_PATH ??
    path.join('output', 'news-real-api', 'latest.json')
);
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_NEWS_REQUEST_TIMEOUT_MS ?? 300_000)
);

interface RouteChoice {
  id: 'grok' | 'gemini' | 'mimo';
  profileId: string;
  profileName: string;
  model: string;
}

interface NewsScenario {
  id: string;
  routeId: RouteChoice['id'];
  time: GameTime;
  playerInput: string;
  expectedHistoricalTerms: string[];
  forbiddenHistoricalTerms?: string[];
  privatePurchase?: boolean;
}

const routes: RouteChoice[] = [
  {
    id: 'grok',
    profileId: 'api_yuqing',
    profileName: 'yuqing-grok',
    model: 'grok-4.3-fast'
  },
  {
    id: 'gemini',
    profileId: 'api_yuqing',
    profileName: 'yuqing',
    model: '企业cli-gemini-3-flash-preview'
  },
  {
    id: 'mimo',
    profileId: 'api_yuqing',
    profileName: 'yuqing-mimo',
    model: '莲华佬-mimo-v2.5-pro'
  }
];

const scenarios: NewsScenario[] = [
  {
    id: 'grok_1980_mtr',
    routeId: 'grok',
    time: { year: 1980, month: 3, day: 3, hour: 20, minute: 0 },
    playerInput: '到报摊看看今天的报纸。',
    expectedHistoricalTerms: ['地下铁路', '地铁', '金钟', '遮打', '维港']
  },
  {
    id: 'gemini_1984_joint_declaration',
    routeId: 'gemini',
    time: { year: 1984, month: 12, day: 20, hour: 20, minute: 0 },
    playerInput: '看看今晚报章的主要消息。',
    expectedHistoricalTerms: ['联合声明', '中英', '香港前途']
  },
  {
    id: 'grok_1988_private_car',
    routeId: 'grok',
    time: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
    playerInput: '我刚买了一辆普通私家车，办完手续后顺便看看报纸。',
    expectedHistoricalTerms: ['越南船民', '甄别', '联系汇率', '货币管理'],
    forbiddenHistoricalTerms: ['东区海底隧道', '東區海底隧道', '沙田第一城'],
    privatePurchase: true
  },
  {
    id: 'mimo_1990_basic_law',
    routeId: 'mimo',
    time: { year: 1990, month: 4, day: 6, hour: 20, minute: 0 },
    playerInput: '读一读这两天的香港报纸。',
    expectedHistoricalTerms: ['基本法', '全国人民代表大会', '人大'],
    forbiddenHistoricalTerms: [
      '人在边缘',
      '人在邊緣',
      '周润发',
      '周潤發',
      '观塘绕道',
      '觀塘繞道',
      '港岛线东段',
      '港島綫東段',
      '港岛线延伸',
      '港島綫延伸'
    ]
  },
  {
    id: 'gemini_1994_electoral_reform',
    routeId: 'gemini',
    time: { year: 1994, month: 7, day: 8, hour: 20, minute: 0 },
    playerInput: '买一份报纸看看本港要闻。',
    expectedHistoricalTerms: ['选举', '立法局', '政制'],
    forbiddenHistoricalTerms: ['恒生指数', '恆生指數', '中电', '中電']
  },
  {
    id: 'mimo_1996_legislature',
    routeId: 'mimo',
    time: { year: 1996, month: 11, day: 1, hour: 22, minute: 5 },
    playerInput: '看看报章怎样报道近期香港局势。',
    expectedHistoricalTerms: ['立法局', '九七', '移交', '选举'],
    forbiddenHistoricalTerms: ['西隧', '食神']
  }
];

function createRouteSettings(settings: AiSettings, route: RouteChoice): AiSettings {
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: route.profileId,
      model: route.model,
      maxTokensMode: 'custom',
      maxTokens: 8_192,
      temperature: 0.2
    }
  };
}

function requireRoute(settings: AiSettings, route: RouteChoice): void {
  const profile = settings.apiProfiles.find((candidate) => candidate.id === route.profileId);
  if (!profile || !profile.models.includes(route.model)) {
    throw new Error(`缺少真实验收线路：${route.profileName}/${route.model}`);
  }
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key|tp|pst)-[A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]')
    .slice(0, 800);
}

function isExternalFailure(message: string): boolean {
  return /(?:HTTP\s*(?:401|403|429|5\d\d)|timeout|超时|network|fetch failed|ECONN|socket)/i.test(message);
}

function createScenarioState(scenario: NewsScenario): RuntimeState {
  const state = createInitialRuntimeState({
    playerName: '周启明',
    englishName: 'Chow Kai-ming',
    age: 29,
    currentIdentity: 'police',
    startTime: scenario.time,
    screenCharacterSeedsEnabled: false,
    openingPressure: 'routine'
  });
  if (scenario.privatePurchase) {
    state.dynamicEvents.currentMatters.matter_private_car = {
      id: 'matter_private_car',
      title: '新买的普通私家车',
      summary: '周启明刚办完一辆普通私家车的手续。',
      status: 'active',
      priority: 40,
      visibility: 'known',
      source: 'personal',
      matterKind: 'personal',
      relatedActorIds: [state.player.actorId],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };
  }
  return state;
}

function rawIssueCandidates(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const direct = record.newsIssuePatches;
  if (Array.isArray(direct)) {
    return direct.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    );
  }
  const writeback = record.writeback;
  if (!writeback || typeof writeback !== 'object' || Array.isArray(writeback)) return [];
  const nested = (writeback as Record<string, unknown>).newsIssuePatches;
  return Array.isArray(nested)
    ? nested.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
    : [];
}

function rawPlayerRelatedCount(value: unknown, playerActorId: string): number {
  return rawIssueCandidates(value)
    .flatMap((issue) => (Array.isArray(issue.articles) ? issue.articles : []))
    .filter((article) => {
      if (!article || typeof article !== 'object' || Array.isArray(article)) return false;
      const record = article as Record<string, unknown>;
      return (
        record.playerRelated === true ||
        (Array.isArray(record.relatedActorIds) && record.relatedActorIds.includes(playerActorId))
      );
    }).length;
}

function issueText(issues: NewsIssue[]): string {
  return issues
    .flatMap((issue) => [
      issue.headline,
      issue.summary,
      ...issue.articles.flatMap((article) => [article.headline, article.body])
    ])
    .join('\n');
}

async function writeSanitizedResults(results: Array<Record<string, unknown>>, completed: boolean): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        contractVersion: 'news-real-api-v1',
        generatedAt: new Date().toISOString(),
        completed,
        acceptedCount: results.filter((result) => result.accepted === true).length,
        results
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

describe.skipIf(!shouldRun)('period news through real APIs', () => {
  it(
    'keeps six dated newspapers city-focused and suppresses ordinary player purchases',
    async () => {
      const settings = importApiSettings(
        createDefaultAiSettings(),
        await readFile(settingsPath, 'utf8')
      );
      routes.forEach((route) => requireRoute(settings, route));
      const results: Array<Record<string, unknown>> = [];
      await writeSanitizedResults(results, false);

      for (const scenario of scenarios) {
        const route = routes.find((candidate) => candidate.id === scenario.routeId)!;
        let accepted = false;
        let lastFailure = '';

        for (let attempt = 1; attempt <= 3 && !accepted; attempt += 1) {
          const state = createScenarioState(scenario);
          const startedAt = performance.now();
          let detailedAttempt: NarratorAttemptRecord | undefined;
          let rawValue: unknown;
          let clientError = '';
          try {
            const client = createNarratorClientFromSettings(createRouteSettings(settings, route));
            const auxiliaryClient: NarratorClient = {
              configuredMaxTokens: client.configuredMaxTokens,
              complete: async (input) => {
                try {
                  const detailed = await client.completeDetailed?.(input, {
                    requestPurpose: 'auxiliary',
                    stageMaxTokens: 4_096,
                    signal: AbortSignal.timeout(requestTimeoutMs),
                    onAttempt: (attempt) => {
                      detailedAttempt = attempt;
                    }
                  });
                  if (!detailed) throw new Error('真实客户端不支持详细完成记录。');
                  detailedAttempt = detailed.attempt;
                  rawValue = detailed.value;
                  return detailed.value;
                } catch (error) {
                  clientError = safeError(error);
                  throw error;
                }
              }
            };

            const after = await maybeGenerateAuxiliaryNews({
              state,
              playerInput: scenario.playerInput,
              auxiliaryGeneration: auxiliaryClient,
              locale: 'zh-Hant-HK'
            });
            const issues = Object.values(after.dynamicEvents.newsIssues);
            const articles = issues.flatMap((issue) => issue.articles);
            const text = issueText(issues);
            const diagnostics = after.storyLog.flatMap(
              (entry) => entry.writebackDiagnostics ?? []
            );
            if (issues.length === 0) {
              const auxiliaryFailure = [...diagnostics]
                .reverse()
                .find((diagnostic) => diagnostic.code.startsWith('auxiliary_news_'));
              throw new Error(
                clientError ||
                  auxiliaryFailure?.message ||
                  '真实响应经过新闻校验后没有留下报纸。'
              );
            }
            const historicalTerm = scenario.expectedHistoricalTerms.find((term) => text.includes(term));
            const forbiddenHistoricalTerm = scenario.forbiddenHistoricalTerms?.find((term) => text.includes(term));
            const playerNamed = text.includes(state.player.name) || text.toLowerCase().includes('chow kai-ming');
            const playerLinked = articles.some(
              (article) =>
                article.playerRelated ||
                article.relatedActorIds.includes(state.player.actorId)
            );
            const privatePurchaseReported = Boolean(
              scenario.privatePurchase &&
                /(?:周启明.{0,20}(?:买车|购车|私家车|座驾)|(?:买车|购车|私家车|座驾).{0,20}周启明)/u.test(text)
            );

            expect(issues).toHaveLength(1);
            expect(articles.length).toBeGreaterThanOrEqual(4);
            expect(articles.length).toBeLessThanOrEqual(6);
            expect(historicalTerm).toBeDefined();
            expect(forbiddenHistoricalTerm).toBeUndefined();
            expect(playerNamed).toBe(false);
            expect(playerLinked).toBe(false);
            expect(privatePurchaseReported).toBe(false);

            const diagnosticCodes = diagnostics.map((diagnostic) => diagnostic.code);
            results.push({
              scenario: scenario.id,
              route: route.profileName,
              model: route.model,
              accepted: true,
              attempt,
              durationMs: Math.round(performance.now() - startedAt),
              finishReason: detailedAttempt?.finishReason,
              promptTokens: detailedAttempt?.usage?.promptTokens,
              completionTokens: detailedAttempt?.usage?.completionTokens,
              issueCount: issues.length,
              articleCount: articles.length,
              sections: [...new Set(articles.map((article) => article.section))],
              headlines: articles.map((article) => article.headline),
              historicalTerm,
              forbiddenHistoricalTerm,
              rawPlayerRelatedCount: rawPlayerRelatedCount(rawValue, state.player.actorId),
              finalPlayerRelatedCount: 0,
              privatePurchaseReported,
              diagnosticCodes
            });
            accepted = true;
          } catch (error) {
            lastFailure = safeError(error);
            const externalFailure = isExternalFailure(lastFailure);
            results.push({
              scenario: scenario.id,
              route: route.profileName,
              model: route.model,
              accepted: false,
              attempt,
              externalFailure,
              durationMs: Math.round(performance.now() - startedAt),
              finishReason: detailedAttempt?.finishReason,
              error: lastFailure
            });
          }
          await writeSanitizedResults(results, false);
        }

        await writeSanitizedResults(results, false);
        if (!accepted) {
          throw new Error(`${scenario.id} 未取得有效通过样本：${lastFailure}`);
        }
      }

      await writeSanitizedResults(results, true);
      const accepted = results.filter((result) => result.accepted === true);
      expect(accepted).toHaveLength(scenarios.length);
      expect(new Set(accepted.map((result) => result.route))).toEqual(
        new Set(['yuqing-grok', 'yuqing', 'yuqing-mimo'])
      );
    },
    3_600_000
  );
});
