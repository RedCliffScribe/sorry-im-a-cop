import type { NarratorClient } from '../narrator/NarratorClient';
import type { GameTime, NewsArticle, NewsIssue, RuntimeState, StoryDiagnosticIssue } from '../runtime/types';
import { hk1980sOpeningScenarios } from '../worldpack/hk1980sOpening';
import { newsIssuePatchSchema } from '../writeback/schema';
import { resolvePromptText } from '../prompts/promptRegistry';
import type { PromptSettings } from '../settings/types';
import { createNarrativeLanguageGuide, type AppLocale } from '../localization/appLocale';
import { formatHistoricalHongKongNewsAnchorsForPrompt } from './historicalHongKongNewsAnchors';
import { enforcePlayerNewsworthiness } from './newsworthiness';

const realHongKongNewspapers = [
  '大公报',
  '明报',
  '成报',
  '星岛日报',
  '东方日报',
  '华侨日报',
  '工商日报',
  '信报',
  '文汇报',
  '南华早报'
];

const manualNewsKeywords = [
  '报纸',
  '报章',
  '报摊',
  '买报',
  '看报',
  '读报',
  '新闻',
  ...realHongKongNewspapers
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseRawObject(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function cloneGameTime(time: GameTime): GameTime {
  return { ...time };
}

function gameTimeToUtcMs(time: GameTime): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
}

function daysBetween(left: GameTime, right: GameTime): number {
  const ms = gameTimeToUtcMs(right) - gameTimeToUtcMs(left);
  return Math.floor(ms / 86_400_000);
}

function issueDateValue(issue: NewsIssue): number {
  return gameTimeToUtcMs(issue.date);
}

function getLatestNewsIssue(state: RuntimeState): NewsIssue | undefined {
  return Object.values(state.dynamicEvents.newsIssues).sort((left, right) => issueDateValue(right) - issueDateValue(left))[0];
}

function isManualNewsRequest(playerInput: string): boolean {
  return manualNewsKeywords.some((keyword) => playerInput.includes(keyword));
}

function shouldAutoGenerateNews(state: RuntimeState): boolean {
  if (state.time.hour < 6) return false;
  const latest = getLatestNewsIssue(state);
  return !latest || daysBetween(latest.date, state.time) >= 2;
}

function summarizeCurrentMatters(state: RuntimeState): string {
  const matters = Object.values(state.dynamicEvents.currentMatters)
    .filter(
      (matter) =>
        matter.visibility !== 'hidden' &&
        matter.status !== 'archived' &&
        !matter.relatedActorIds.includes(state.player.actorId) &&
        !['personal', 'livelihood', 'relationship', 'family'].includes(matter.matterKind ?? '')
    )
    .sort((left, right) => right.updatedAt.year - left.updatedAt.year || right.updatedAt.month - left.updatedAt.month || right.updatedAt.day - left.updatedAt.day)
    .slice(0, 8)
    .map((matter) => `${matter.title}：${matter.summary}`);
  return matters.length ? matters.join('\n') : '暂无公开当前事项。';
}

function summarizeSignals(state: RuntimeState): string {
  const signals = Object.values(state.dynamicEvents.signals)
    .filter(
      (signal) =>
        signal.status !== 'archived' &&
        signal.visibility !== 'hidden' &&
        !signal.relatedActorIds.includes(state.player.actorId)
    )
    .slice(0, 8)
    .map((signal) => `${signal.title}：${signal.summary}`);
  return signals.length ? signals.join('\n') : '暂无可用风声。';
}

function summarizeRecentNews(state: RuntimeState): string {
  const issues = Object.values(state.dynamicEvents.newsIssues)
    .sort((left, right) => issueDateValue(right) - issueDateValue(left))
    .slice(0, 5)
    .map((issue) => `${issue.outletName}《${issue.headline}》：${issue.summary}`);
  return issues.length ? issues.join('\n') : '暂无既有报纸记录。';
}

function formatGameTime(time: GameTime): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

export function createAuxiliaryNewsPrompt(
  state: RuntimeState,
  playerInput: string,
  trigger: 'manual_newspaper' | 'daily_digest',
  promptSettings?: PromptSettings,
  locale?: AppLocale
): string {
  const currentScenario = hk1980sOpeningScenarios.find((scenario) => scenario.time.year === state.time.year);
  return [
    resolvePromptText('news.generation', promptSettings),
    '',
    '玩家可见输出语言：',
    createNarrativeLanguageGuide(locale),
    '只返回 JSON，不要 Markdown，不要解释。',
    '可选真实报纸包括：大公报、明报、成报、星岛日报、东方日报、华侨日报、工商日报、信报、文汇报、南华早报。',
    `新闻内容应符合 ${state.time.year} 年香港语境：本港公共政策、交通、劳工与民生、娱乐圈、金融地产、国际消息、港英政府和公共治安。`,
    'newsIssuePatches 必须恰好包含一期报纸，不得返回多个报社版本、候选版本或重复报纸。该期 articles 数组必须写 4 至 6 项；只有 1 条报道属于不完整报纸。',
    '各报道应分布在不同版面，优先城市与真实时代公共议题，不要把整份报纸写成犯罪简报。',
    '普通人的买车买楼、购物、搬家、恋爱、用餐、转职和日常执勤不具新闻价值，不得报道。',
    '玩家读报、询问报纸或触发自动日报，只表示需要生成可阅读的报纸，不表示玩家成为报道对象。',
    '只有结构化素材明确给出已公开的重大案件或玩家已经是区域知名公众人物时，才可写与玩家直接相关的报道；不得用玩家输入自行推导其知名度。',
    `当前剧本：${currentScenario?.title ?? `${state.time.year} 香港城市生活`}。`,
    '返回格式（articles 示例明确展示最低 4 项，实际可写 4 至 6 项）：{"newsIssuePatches":[{"id":"news_yyyymmdd_outlet_slug","outletName":"大公报","headline":"...","summary":"...","articles":[{"id":"article_public_1","section":"politics","headline":"公共政策新闻","body":"...","playerRelated":false,"relatedActorIds":[],"relatedPlaceIds":[],"relatedCaseIds":[],"relatedOrganizationIds":[]},{"id":"article_city_2","section":"local","headline":"交通或民生新闻","body":"...","playerRelated":false,"relatedActorIds":[],"relatedPlaceIds":[],"relatedCaseIds":[],"relatedOrganizationIds":[]},{"id":"article_business_3","section":"business","headline":"金融或工商新闻","body":"...","playerRelated":false,"relatedActorIds":[],"relatedPlaceIds":[],"relatedCaseIds":[],"relatedOrganizationIds":[]},{"id":"article_culture_4","section":"entertainment","headline":"娱乐或文化新闻","body":"...","playerRelated":false,"relatedActorIds":[],"relatedPlaceIds":[],"relatedCaseIds":[],"relatedOrganizationIds":[]}]}]}',
    '',
    `trigger=${trigger}`,
    `currentTime=${formatGameTime(state.time)}`,
    `requestContext=${isManualNewsRequest(playerInput) ? '玩家正在读报；这不是新闻素材。' : '系统补齐城市日报；玩家行动不是新闻素材。'}`,
    '',
    '当前日期可用的已核对香港历史事实锚点（只能使用当前日期之前已发生的事实；不是历史报纸逐字标题）：',
    formatHistoricalHongKongNewsAnchorsForPrompt(state.time),
    '存在历史事实锚点时，至少一条主要报道必须以其中一项为事实基础；只能改写为报章语言，不能改变日期、主体或结果。',
    '任何带有真实机构、工程、政策、公众人物、影视作品、疫情或具体日期的可核验历史事件，都只能来自上面的事实锚点；不得自行补造通车、法案、政策生效、名人事故或其他“像真的”具体史实。',
    '其余版面只能写不冒充真实历史事件的年代城市常态，例如匿名街区民生、一般物价与行业观察、天气交通日常、虚构文化活动；禁止出现真实人名、真实作品名、具体基建项目名、指数点数、精确统计或政策生效断言，不得使用未来才发生的事件。',
    '非锚点交通报道只可描述当日的一般路面挤塞、公共交通需求或匿名街区出行情况；不得声称任何地铁线路、隧道、道路或大型设施正在建设、即将通车、延伸、落成或公布时间表。',
    '',
    '当前事项：',
    summarizeCurrentMatters(state),
    '',
    '风声：',
    summarizeSignals(state),
    '',
    '既有报纸：',
    summarizeRecentNews(state)
  ].join('\n');
}

function rawNewsIssuePatchesFromResponse(value: unknown): unknown[] {
  const parsed = parseRawObject(value);
  if (isRecord(parsed) && Array.isArray(parsed.newsIssuePatches)) {
    return parsed.newsIssuePatches;
  }
  if (isRecord(parsed) && isRecord(parsed.writeback) && Array.isArray(parsed.writeback.newsIssuePatches)) {
    return parsed.writeback.newsIssuePatches;
  }
  return [];
}

function normalizeArticle(value: NewsArticle): NewsArticle {
  return {
    ...value,
    relatedActorIds: value.relatedActorIds ?? [],
    relatedPlaceIds: value.relatedPlaceIds ?? [],
    relatedCaseIds: value.relatedCaseIds ?? [],
    relatedOrganizationIds: value.relatedOrganizationIds ?? []
  };
}

function normalizeIssue(
  state: RuntimeState,
  rawPatch: unknown,
  currentTime: GameTime
): { issue?: NewsIssue; diagnostics: StoryDiagnosticIssue[] } {
  const parsed = newsIssuePatchSchema.safeParse(rawPatch);
  if (!parsed.success) {
    return {
      diagnostics: parsed.error.issues.map((issue) => ({
        path: ['auxiliaryGeneration', 'newsIssuePatches', ...issue.path.map((segment) => String(segment))],
        code: issue.code,
        message: issue.message
      }))
    };
  }

  const patch = parsed.data;
  if (!patch.outletName || !patch.headline || !patch.summary) {
    return {
      diagnostics: [
        {
          path: ['auxiliaryGeneration', 'newsIssuePatches', patch.id],
          code: 'auxiliary_news_incomplete',
          message: '辅助生成 API 返回的报纸缺少 outletName、headline 或 summary。'
        }
      ]
    };
  }

  const date = patch.date ?? cloneGameTime(currentTime);
  const issue: NewsIssue = {
    id: patch.id,
    date,
    outletName: patch.outletName,
    headline: patch.headline,
    summary: patch.summary,
    articles: patch.articles.map(normalizeArticle),
    createdAt: patch.createdAt ?? cloneGameTime(currentTime),
    updatedAt: patch.updatedAt ?? cloneGameTime(currentTime),
    read: patch.read ?? false
  };

  return enforcePlayerNewsworthiness(state, issue, [
    'auxiliaryGeneration',
    'newsIssuePatches',
    patch.id
  ]);
}

function appendAuxiliaryNewsDiagnostics(state: RuntimeState, diagnostics: StoryDiagnosticIssue[]): RuntimeState {
  if (diagnostics.length === 0 || state.storyLog.length === 0) return state;

  const storyLog = [...state.storyLog];
  const latest = storyLog[storyLog.length - 1];
  storyLog[storyLog.length - 1] = {
    ...latest,
    writebackDiagnostics: [...(latest.writebackDiagnostics ?? []), ...diagnostics]
  };

  return {
    ...state,
    storyLog
  };
}

export async function maybeGenerateAuxiliaryNews({
  state,
  playerInput,
  auxiliaryGeneration,
  promptSettings,
  locale
}: {
  state: RuntimeState;
  playerInput: string;
  auxiliaryGeneration?: NarratorClient | null;
  promptSettings?: PromptSettings;
  locale?: AppLocale;
}): Promise<RuntimeState> {
  if (!auxiliaryGeneration) return state;

  const trigger = isManualNewsRequest(playerInput) ? 'manual_newspaper' : shouldAutoGenerateNews(state) ? 'daily_digest' : null;
  if (!trigger) return state;

  try {
    const prompt = createAuxiliaryNewsPrompt(state, playerInput, trigger, promptSettings, locale);
    const raw = await auxiliaryGeneration.complete(prompt);
    const rawPatches = rawNewsIssuePatchesFromResponse(raw);
    if (rawPatches.length === 0) {
      return appendAuxiliaryNewsDiagnostics(state, [
        {
          path: ['auxiliaryGeneration', 'newsIssuePatches'],
          code: 'auxiliary_news_invalid',
          message: '辅助生成 API 没有返回可用的 newsIssuePatches。'
        }
      ]);
    }

    const dynamicEvents = {
      ...state.dynamicEvents,
      newsIssues: { ...state.dynamicEvents.newsIssues }
    };
    const diagnostics: StoryDiagnosticIssue[] = [];
    if (rawPatches.length > 1) {
      diagnostics.push({
        path: ['auxiliaryGeneration', 'newsIssuePatches'],
        code: 'auxiliary_news_extra_issues_ignored',
        message: `辅助生成 API 返回了 ${rawPatches.length} 期候选报纸；本地只保留第一期，避免重复版面。`
      });
    }
    for (const rawPatch of rawPatches.slice(0, 1)) {
      const normalized = normalizeIssue(state, rawPatch, state.time);
      diagnostics.push(...normalized.diagnostics);
      if (normalized.issue) {
        const existing = dynamicEvents.newsIssues[normalized.issue.id];
        dynamicEvents.newsIssues[normalized.issue.id] = existing
          ? {
              ...existing,
              ...normalized.issue,
              articles: normalized.issue.articles.length ? normalized.issue.articles : existing.articles,
              read: existing.read || normalized.issue.read
            }
          : normalized.issue;
      }
    }

    return appendAuxiliaryNewsDiagnostics(
      {
        ...state,
        dynamicEvents
      },
      diagnostics
    );
  } catch (error) {
    return appendAuxiliaryNewsDiagnostics(state, [
      {
        path: ['auxiliaryGeneration'],
        code: 'auxiliary_news_failed',
        message: error instanceof Error ? error.message : '辅助生成 API 生成新闻失败。'
      }
    ]);
  }
}
