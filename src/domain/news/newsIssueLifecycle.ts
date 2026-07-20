import type { ActorId, GameTime, MemoryItem, NewsArticle, NewsIssue, RuntimeState } from '../runtime/types';

export type NewsIssueCategory = 'latest' | 'important' | 'archived';

const AUTO_ARCHIVE_AFTER_DAYS = 3;
const DELETE_ARCHIVE_AFTER_DAYS = 7;

function cloneGameTime(time: GameTime): GameTime {
  return { ...time };
}

function calendarDayValue(time: GameTime): number {
  return Date.UTC(time.year, time.month - 1, time.day);
}

function calendarDaysBetween(earlier: GameTime, later: GameTime): number {
  return Math.floor((calendarDayValue(later) - calendarDayValue(earlier)) / 86_400_000);
}

function formatNewsDate(time: GameTime): string {
  return `${time.year}年${time.month}月${time.day}日`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function memoryIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function actorDisplayName(state: RuntimeState, actorId: ActorId): string {
  if (actorId === state.player.actorId) return state.player.name;
  return state.actors[actorId]?.name ?? actorId;
}

function otherReportedActorNames(state: RuntimeState, article: NewsArticle, actorId: ActorId): string {
  const names = unique(
    article.relatedActorIds
      .filter((relatedActorId) => relatedActorId !== actorId)
      .filter((relatedActorId) => relatedActorId === state.player.actorId || Boolean(state.actors[relatedActorId]))
      .map((relatedActorId) => actorDisplayName(state, relatedActorId))
  );
  return names.length ? names.join('、') : '报道中的其他人';
}

function articleClaimSummary(article: NewsArticle): string {
  const body = article.body.trim();
  return body ? `「${article.headline}」：${body}` : `「${article.headline}」`;
}

function createNpcNewsMemory(state: RuntimeState, issue: NewsIssue, article: NewsArticle, actorId: ActorId): MemoryItem {
  const otherNames = otherReportedActorNames(state, article, actorId);
  const text = `${formatNewsDate(issue.date)}，《${issue.outletName}》报称我与${otherNames}涉及${articleClaimSummary(article)}。这是报章说法，未必属实。`;
  const memoryId = `memory_news_actor_${memoryIdPart(issue.id)}_${memoryIdPart(article.id)}_${memoryIdPart(actorId)}`;
  return {
    memoryId,
    text,
    kind: 'actor',
    tier: 'short_term',
    relatedActorIds: [actorId],
    relatedCaseIds: unique([...article.relatedCaseIds]),
    relatedPlaceIds: unique([...article.relatedPlaceIds]),
    relatedOrganizationIds: unique([...article.relatedOrganizationIds]),
    gameTime: cloneGameTime(issue.date),
    importance: article.playerRelated ? 65 : 55,
    visibility: 'private',
    certainty: 'claim',
    embeddingText: text
  };
}

function createPlayerNewsMemory(state: RuntimeState, issue: NewsIssue, article: NewsArticle): MemoryItem {
  const relatedActorIds = unique([
    state.player.actorId,
    ...article.relatedActorIds.filter(
      (actorId) => actorId !== state.player.actorId && Boolean(state.actors[actorId])
    )
  ]);
  const actorNames = relatedActorIds
    .filter((actorId) => actorId !== state.player.actorId)
    .map((actorId) => actorDisplayName(state, actorId));
  const subject = actorNames.length ? `${state.player.name}与${actorNames.join('、')}` : state.player.name;
  const text = `${formatNewsDate(issue.date)}，我读到《${issue.outletName}》报称${subject}涉及${articleClaimSummary(article)}。这是报章说法，未必属实。`;
  const memoryId = `memory_news_player_${memoryIdPart(issue.id)}_${memoryIdPart(article.id)}`;
  return {
    memoryId,
    text,
    kind: 'player',
    tier: 'short_term',
    relatedActorIds,
    relatedCaseIds: unique([...article.relatedCaseIds]),
    relatedPlaceIds: unique([...article.relatedPlaceIds]),
    relatedOrganizationIds: unique([...article.relatedOrganizationIds]),
    gameTime: cloneGameTime(issue.date),
    importance: 60,
    visibility: 'player_known',
    certainty: 'claim',
    embeddingText: text
  };
}

function appendNpcNewsMemories(state: RuntimeState, issue: NewsIssue, memories: Record<string, MemoryItem>): boolean {
  let changed = false;
  for (const article of issue.articles) {
    for (const actorId of unique(article.relatedActorIds)) {
      if (actorId === state.player.actorId || !state.actors[actorId]) continue;
      const memory = createNpcNewsMemory(state, issue, article, actorId);
      if (!memories[memory.memoryId]) {
        memories[memory.memoryId] = memory;
        changed = true;
      }
    }
  }
  return changed;
}

export function getNewsIssueCategory(issue: NewsIssue, now: GameTime): NewsIssueCategory {
  if (issue.archivedAt || (!issue.important && calendarDaysBetween(issue.date, now) >= AUTO_ARCHIVE_AFTER_DAYS)) {
    return 'archived';
  }
  return issue.important ? 'important' : 'latest';
}

export function reconcileNewsIssueLifecycle(state: RuntimeState): RuntimeState {
  const newsIssues: RuntimeState['dynamicEvents']['newsIssues'] = {};
  const memories = { ...state.memories };
  let newsChanged = false;
  let memoriesChanged = false;

  for (const issue of Object.values(state.dynamicEvents.newsIssues)) {
    memoriesChanged = appendNpcNewsMemories(state, issue, memories) || memoriesChanged;
    if (issue.archivedAt && calendarDaysBetween(issue.archivedAt, state.time) >= DELETE_ARCHIVE_AFTER_DAYS) {
      newsChanged = true;
      continue;
    }

    const shouldArchive = !issue.archivedAt && !issue.important && calendarDaysBetween(issue.date, state.time) >= AUTO_ARCHIVE_AFTER_DAYS;
    if (shouldArchive) {
      newsIssues[issue.id] = { ...issue, important: false, archivedAt: cloneGameTime(state.time) };
      newsChanged = true;
    } else {
      newsIssues[issue.id] = issue;
    }
  }

  if (!newsChanged && !memoriesChanged) return state;

  return {
    ...state,
    dynamicEvents: {
      ...state.dynamicEvents,
      newsIssues
    },
    memories
  };
}

export function toggleNewsIssueImportant(state: RuntimeState, issueId: string): RuntimeState {
  const issue = state.dynamicEvents.newsIssues[issueId];
  if (!issue || issue.archivedAt) return state;
  const nextState: RuntimeState = {
    ...state,
    dynamicEvents: {
      ...state.dynamicEvents,
      newsIssues: {
        ...state.dynamicEvents.newsIssues,
        [issueId]: { ...issue, important: !issue.important }
      }
    }
  };
  return reconcileNewsIssueLifecycle(nextState);
}

export function archiveNewsIssue(state: RuntimeState, issueId: string): RuntimeState {
  const issue = state.dynamicEvents.newsIssues[issueId];
  if (!issue) return state;
  const nextState: RuntimeState = {
    ...state,
    dynamicEvents: {
      ...state.dynamicEvents,
      newsIssues: {
        ...state.dynamicEvents.newsIssues,
        [issueId]: {
          ...issue,
          important: false,
          archivedAt: issue.archivedAt ? cloneGameTime(issue.archivedAt) : cloneGameTime(state.time)
        }
      }
    }
  };
  return reconcileNewsIssueLifecycle(nextState);
}

export function markNewsIssueRead(state: RuntimeState, issueId: string): RuntimeState {
  const reconciled = reconcileNewsIssueLifecycle(state);
  const issue = reconciled.dynamicEvents.newsIssues[issueId];
  if (!issue) return reconciled;

  const memories = { ...reconciled.memories };
  let memoriesChanged = false;
  for (const article of issue.articles) {
    const isPlayerRelated = article.playerRelated || article.relatedActorIds.includes(state.player.actorId);
    if (!isPlayerRelated) continue;
    const memory = createPlayerNewsMemory(reconciled, issue, article);
    if (!memories[memory.memoryId]) {
      memories[memory.memoryId] = memory;
      memoriesChanged = true;
    }
  }

  if (issue.read && !memoriesChanged) return reconciled;

  return {
    ...reconciled,
    dynamicEvents: {
      ...reconciled.dynamicEvents,
      newsIssues: {
        ...reconciled.dynamicEvents.newsIssues,
        [issueId]: { ...issue, read: true }
      }
    },
    memories
  };
}
