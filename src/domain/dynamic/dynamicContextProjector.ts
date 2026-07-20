import { isGameTimeDue } from '../deferred/deferredEventProjector';
import { getNewsIssueCategory } from '../news/newsIssueLifecycle';
import type { CurrentMatter, DeferredEvent, NewsIssue, RuntimeState, Signal } from '../runtime/types';
import { isArchivedCurrentMatter } from './currentMatterStatus';

export interface DynamicProjectionDiagnostics {
  sourceCurrentMatterCount: number;
  projectedCurrentMatterCount: number;
  currentMatterIds: string[];
  omittedCurrentMatterCount: number;
  sourceRecentResolvedMatterCount: number;
  projectedRecentResolvedMatterCount: number;
  recentResolvedMatterIds: string[];
  omittedRecentResolvedMatterCount: number;
  sourceSignalCount: number;
  projectedSignalCount: number;
  signalIds: string[];
  omittedSignalCount: number;
  sourceNewsIssueCount: number;
  projectedNewsIssueCount: number;
  newsIssueIds: string[];
  omittedNewsIssueCount: number;
  omittedHiddenCount: number;
  dueCurrentMatterIds: string[];
  dueDeferredEventIds: string[];
  omittedDueDeferredEventCount: number;
}

export interface DynamicContextProjection {
  currentMatters: CurrentMatter[];
  recentResolvedMatters: CurrentMatter[];
  signals: Signal[];
  newsIssues: NewsIssue[];
  dueDeferredEvents: DeferredEvent[];
  diagnostics: DynamicProjectionDiagnostics;
}

export interface DynamicProjectionOptions {
  maxCurrentMatters?: number;
  maxRecentResolvedMatters?: number;
  recentResolvedLookbackMinutes?: number;
  maxSignals?: number;
  maxNewsIssues?: number;
  maxDueDeferredEvents?: number;
}

const DEFAULT_MAX_CURRENT_MATTERS = 5;
const DEFAULT_MAX_RECENT_RESOLVED_MATTERS = 4;
const DEFAULT_RECENT_RESOLVED_LOOKBACK_MINUTES = 14 * 24 * 60;
const DEFAULT_MAX_SIGNALS = 5;
const DEFAULT_MAX_NEWS_ISSUES = 2;
const DEFAULT_MAX_DUE_DEFERRED_EVENTS = 3;

interface Scored<T> {
  item: T;
  score: number;
}

function gameTimeValue(time: { year: number; month: number; day: number; hour: number; minute: number }): number {
  return (((time.year * 100 + time.month) * 100 + time.day) * 100 + time.hour) * 100 + time.minute;
}

function gameTimeMinuteValue(time: { year: number; month: number; day: number; hour: number; minute: number }): number {
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute) / 60_000);
}

function activeActorIds(state: RuntimeState): Set<string> {
  const ids = new Set<string>([state.player.actorId]);
  const currentScene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  for (const actorId of currentScene?.presentActorIds ?? []) ids.add(actorId);
  for (const actor of Object.values(state.actors)) {
    if (actor.presence === 'present' || actor.presence === 'nearby') ids.add(actor.actorId);
  }
  return ids;
}

function activeCaseIds(state: RuntimeState): Set<string> {
  return new Set(
    Object.values(state.cases)
      .filter((caseFile) => caseFile.visibility !== 'hidden' && caseFile.status !== 'archived' && caseFile.status !== 'cold')
      .map((caseFile) => caseFile.caseId)
  );
}

function intersects(left: string[] | undefined, right: Set<string>): boolean {
  return (left ?? []).some((item) => right.has(item));
}

function isCurrentMatterDue(matter: CurrentMatter, state: RuntimeState): boolean {
  return Boolean(matter.dueAt && isGameTimeDue(matter.dueAt, state.time));
}

function isLiveCurrentMatter(matter: CurrentMatter): boolean {
  return (matter.status === 'active' || matter.status === 'dormant') && !isArchivedCurrentMatter(matter);
}

function isRecentResolvedMatter(matter: CurrentMatter, state: RuntimeState, lookbackMinutes: number): boolean {
  if (matter.status !== 'resolved') return false;
  const elapsedMinutes = gameTimeMinuteValue(state.time) - gameTimeMinuteValue(matter.updatedAt);
  return elapsedMinutes >= 0 && elapsedMinutes <= lookbackMinutes;
}

function isLiveSignal(signal: Signal): boolean {
  return signal.status === 'active' || signal.status === 'stale';
}

function responseWindowScore(matter: CurrentMatter): number {
  if (matter.responseWindow === 'now') return 45;
  if (matter.responseWindow === 'today') return 25;
  if (matter.responseWindow === 'soon') return 10;
  return 0;
}

function scoreCurrentMatter(matter: CurrentMatter, state: RuntimeState, actors: Set<string>, cases: Set<string>): number {
  let score = matter.priority;
  if (matter.status === 'active') score += 30;
  if (matter.status === 'dormant') score += 5;
  if (matter.status === 'resolved' || matter.status === 'archived') score -= 60;
  if (isCurrentMatterDue(matter, state)) score += 80;
  score += responseWindowScore(matter);
  score += (matter.pressureLevel ?? 0) * 12;
  if (matter.unread) score += 8;
  if (matter.relatedPlaceIds.includes(state.location.currentPlaceId)) score += 70;
  if (intersects(matter.relatedActorIds, actors)) score += 60;
  if (intersects(matter.relatedCaseIds, cases)) score += 50;
  if (matter.relatedOrganizationIds.length > 0) score += 15;
  return score;
}

function scoreRecentResolvedMatter(
  matter: CurrentMatter,
  state: RuntimeState,
  actors: Set<string>,
  cases: Set<string>
): number {
  let score = matter.priority;
  if (matter.relatedPlaceIds.includes(state.location.currentPlaceId)) score += 70;
  if (intersects(matter.relatedActorIds, actors)) score += 60;
  if (intersects(matter.relatedCaseIds, cases)) score += 50;
  if (matter.relatedOrganizationIds.length > 0) score += 15;
  return score;
}

function scoreSignal(signal: Signal, state: RuntimeState, actors: Set<string>, cases: Set<string>): number {
  let score = 50;
  if (signal.status === 'active') score += 30;
  if (signal.status === 'stale') score -= 15;
  if (signal.status === 'resolved' || signal.status === 'archived') score -= 60;
  if (signal.relatedPlaceIds.includes(state.location.currentPlaceId)) score += 65;
  if (intersects(signal.relatedActorIds, actors)) score += 55;
  if (intersects(signal.relatedCaseIds, cases)) score += 45;
  if (signal.reliability === 'high') score += 15;
  if (signal.reliability === 'medium') score += 8;
  return score;
}

function scoreNewsIssue(issue: NewsIssue, state: RuntimeState, actors: Set<string>, cases: Set<string>): number {
  let score = issue.read ? -25 : 40;
  for (const article of issue.articles) {
    if (article.playerRelated) score += 60;
    if (article.relatedPlaceIds.includes(state.location.currentPlaceId)) score += 30;
    if (intersects(article.relatedActorIds, actors)) score += 30;
    if (intersects(article.relatedCaseIds, cases)) score += 25;
    if (article.relatedOrganizationIds.length > 0) score += 10;
  }
  score += Math.max(0, 10 - Math.abs(gameTimeValue(state.time) - gameTimeValue(issue.date)) / 10000);
  return score;
}

function byScoreThenUpdated<T extends { id: string; updatedAt?: { year: number; month: number; day: number; hour: number; minute: number } }>(
  left: Scored<T>,
  right: Scored<T>
): number {
  if (right.score !== left.score) return right.score - left.score;
  const leftTime = left.item.updatedAt ? gameTimeValue(left.item.updatedAt) : 0;
  const rightTime = right.item.updatedAt ? gameTimeValue(right.item.updatedAt) : 0;
  if (rightTime !== leftTime) return rightTime - leftTime;
  return left.item.id.localeCompare(right.item.id);
}

function selectScored<T extends { id: string; updatedAt?: { year: number; month: number; day: number; hour: number; minute: number } }>(
  scored: Scored<T>[],
  limit: number
): T[] {
  return scored.sort(byScoreThenUpdated).slice(0, limit).map((entry) => entry.item);
}

function selectDueDynamicDeferredEvents(state: RuntimeState, limit: number): DeferredEvent[] {
  return Object.values(state.deferredEvents)
    .filter((event) => event.status === 'pending')
    .filter((event) => event.sourceModule === 'dynamic' || event.sourceModule === 'news')
    .filter((event) => isGameTimeDue(event.triggerAt, state.time))
    .sort((left, right) => gameTimeValue(left.triggerAt) - gameTimeValue(right.triggerAt) || left.eventId.localeCompare(right.eventId))
    .slice(0, limit);
}

export function projectDynamicContext(state: RuntimeState, options: DynamicProjectionOptions = {}): DynamicContextProjection {
  const maxCurrentMatters = options.maxCurrentMatters ?? DEFAULT_MAX_CURRENT_MATTERS;
  const maxRecentResolvedMatters = options.maxRecentResolvedMatters ?? DEFAULT_MAX_RECENT_RESOLVED_MATTERS;
  const recentResolvedLookbackMinutes =
    options.recentResolvedLookbackMinutes ?? DEFAULT_RECENT_RESOLVED_LOOKBACK_MINUTES;
  const maxSignals = options.maxSignals ?? DEFAULT_MAX_SIGNALS;
  const maxNewsIssues = options.maxNewsIssues ?? DEFAULT_MAX_NEWS_ISSUES;
  const maxDueDeferredEvents = options.maxDueDeferredEvents ?? DEFAULT_MAX_DUE_DEFERRED_EVENTS;

  const actors = activeActorIds(state);
  const cases = activeCaseIds(state);
  let omittedHiddenCount = 0;

  const visibleMatterPool = Object.values(state.dynamicEvents.currentMatters).filter((matter) => {
    if (matter.visibility === 'hidden') {
      omittedHiddenCount += 1;
      return false;
    }
    return true;
  });
  const visibleCurrentMatters = visibleMatterPool.filter(isLiveCurrentMatter);
  const currentMatters = selectScored(
    visibleCurrentMatters.map((matter) => ({ item: matter, score: scoreCurrentMatter(matter, state, actors, cases) })),
    maxCurrentMatters
  );
  const dueCurrentMatterIds = visibleCurrentMatters
    .filter((matter) => isCurrentMatterDue(matter, state))
    .map((matter) => matter.id);
  const recentResolvedMatterCandidates = visibleMatterPool.filter((matter) =>
    isRecentResolvedMatter(matter, state, Math.max(0, recentResolvedLookbackMinutes))
  );
  const recentResolvedMatters = selectScored(
    recentResolvedMatterCandidates.map((matter) => ({
      item: matter,
      score: scoreRecentResolvedMatter(matter, state, actors, cases)
    })),
    Math.max(0, maxRecentResolvedMatters)
  );

  const visibleSignals = Object.values(state.dynamicEvents.signals).filter((signal) => {
    if (signal.visibility === 'hidden') {
      omittedHiddenCount += 1;
      return false;
    }
    return isLiveSignal(signal);
  });
  const signals = selectScored(
    visibleSignals.map((signal) => ({ item: signal, score: scoreSignal(signal, state, actors, cases) })),
    maxSignals
  );

  const sourceNewsIssues = Object.values(state.dynamicEvents.newsIssues).filter(
    (issue) => getNewsIssueCategory(issue, state.time) !== 'archived'
  );
  const newsCandidates = sourceNewsIssues
    .map((issue) => ({ item: issue, score: scoreNewsIssue(issue, state, actors, cases) }))
    .filter((entry) => entry.score > 0);
  const newsIssues = selectScored(newsCandidates, maxNewsIssues);

  const dueDynamicEvents = Object.values(state.deferredEvents)
    .filter((event) => event.status === 'pending')
    .filter((event) => event.sourceModule === 'dynamic' || event.sourceModule === 'news')
    .filter((event) => isGameTimeDue(event.triggerAt, state.time));
  const dueDeferredEvents = selectDueDynamicDeferredEvents(state, maxDueDeferredEvents);

  return {
    currentMatters,
    recentResolvedMatters,
    signals,
    newsIssues,
    dueDeferredEvents,
    diagnostics: {
      sourceCurrentMatterCount: visibleCurrentMatters.length,
      projectedCurrentMatterCount: currentMatters.length,
      currentMatterIds: currentMatters.map((matter) => matter.id),
      omittedCurrentMatterCount: Math.max(0, visibleCurrentMatters.length - currentMatters.length),
      sourceRecentResolvedMatterCount: recentResolvedMatterCandidates.length,
      projectedRecentResolvedMatterCount: recentResolvedMatters.length,
      recentResolvedMatterIds: recentResolvedMatters.map((matter) => matter.id),
      omittedRecentResolvedMatterCount: Math.max(0, recentResolvedMatterCandidates.length - recentResolvedMatters.length),
      sourceSignalCount: visibleSignals.length,
      projectedSignalCount: signals.length,
      signalIds: signals.map((signal) => signal.id),
      omittedSignalCount: Math.max(0, visibleSignals.length - signals.length),
      sourceNewsIssueCount: sourceNewsIssues.length,
      projectedNewsIssueCount: newsIssues.length,
      newsIssueIds: newsIssues.map((issue) => issue.id),
      omittedNewsIssueCount: Math.max(0, sourceNewsIssues.length - newsIssues.length),
      omittedHiddenCount,
      dueCurrentMatterIds,
      dueDeferredEventIds: dueDeferredEvents.map((event) => event.eventId),
      omittedDueDeferredEventCount: Math.max(0, dueDynamicEvents.length - dueDeferredEvents.length)
    }
  };
}
