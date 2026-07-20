import type { NarratorClient } from '../narrator/NarratorClient';
import type { GameTime, NewsArticle, NewsIssue, RuntimeState, StoryDiagnosticIssue } from '../runtime/types';
import { hk1980sOpeningScenarios } from '../worldpack/hk1980sOpening';
import { newsIssuePatchSchema } from '../writeback/schema';
import { resolvePromptText } from '../prompts/promptRegistry';
import type { PromptSettings } from '../settings/types';

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
    .filter((matter) => matter.visibility !== 'hidden' && matter.status !== 'archived')
    .sort((left, right) => right.updatedAt.year - left.updatedAt.year || right.updatedAt.month - left.updatedAt.month || right.updatedAt.day - left.updatedAt.day)
    .slice(0, 8)
    .map((matter) => `${matter.title}：${matter.summary}`);
  return matters.length ? matters.join('\n') : '暂无公开当前事项。';
}

function summarizeSignals(state: RuntimeState): string {
  const signals = Object.values(state.dynamicEvents.signals)
    .filter((signal) => signal.status !== 'archived')
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
  promptSettings?: PromptSettings
): string {
  const currentScenario = hk1980sOpeningScenarios.find((scenario) => scenario.time.year === state.time.year);
  return [
    resolvePromptText('news.generation', promptSettings),
    '只返回 JSON，不要 Markdown，不要解释。',
    '可选真实报纸包括：大公报、明报、成报、星岛日报、东方日报、华侨日报、工商日报、信报、文汇报、南华早报。',
    `新闻内容应符合 ${state.time.year} 年香港语境：本港治安、街坊民生、娱乐圈、金融地产、港英政府、码头工厂、社团风声、真实时代质感。`,
    `当前剧本：${currentScenario?.title ?? `${state.time.year} 香港城市生活`}。`,
    '返回格式：{"newsIssuePatches":[{"id":"news_yyyymmdd_outlet_slug","outletName":"大公报","headline":"...","summary":"...","articles":[{"id":"article_...","section":"local","headline":"...","body":"...","playerRelated":false,"relatedActorIds":[],"relatedPlaceIds":[],"relatedCaseIds":[],"relatedOrganizationIds":[]}]}]}',
    '',
    `trigger=${trigger}`,
    `currentTime=${formatGameTime(state.time)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
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

function normalizeIssue(rawPatch: unknown, currentTime: GameTime): { issue?: NewsIssue; diagnostics: StoryDiagnosticIssue[] } {
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

  return { issue, diagnostics: [] };
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
  promptSettings
}: {
  state: RuntimeState;
  playerInput: string;
  auxiliaryGeneration?: NarratorClient | null;
  promptSettings?: PromptSettings;
}): Promise<RuntimeState> {
  if (!auxiliaryGeneration) return state;

  const trigger = isManualNewsRequest(playerInput) ? 'manual_newspaper' : shouldAutoGenerateNews(state) ? 'daily_digest' : null;
  if (!trigger) return state;

  try {
    const prompt = createAuxiliaryNewsPrompt(state, playerInput, trigger, promptSettings);
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
    for (const rawPatch of rawPatches) {
      const normalized = normalizeIssue(rawPatch, state.time);
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
