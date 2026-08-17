import type { NewsArticle, RuntimeState, StoryDiagnosticIssue } from '../runtime/types';

const PLAYER_PUBLIC_NOTORIETY_THRESHOLD = 250;
const PLAYER_PUBLIC_MEDIA_VISIBILITY_THRESHOLD = 250;
const publicCaseStatuses = new Set([
  'submitted_to_prosecutions',
  'prosecution_review',
  'charged',
  'court_scheduled',
  'tried',
  'sentenced'
]);

interface NewsIssueCandidate {
  id: string;
  headline?: string;
  summary?: string;
  articles: NewsArticle[];
}

export interface NewsworthinessResult<TIssue extends NewsIssueCandidate> {
  issue?: TIssue;
  diagnostics: StoryDiagnosticIssue[];
}

function normalizedIdentityTerms(state: RuntimeState): string[] {
  return [state.player.name, state.player.englishName]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLocaleLowerCase())
    .filter((value) => value.length >= 2);
}

function textNamesPlayer(state: RuntimeState, text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLocaleLowerCase();
  return normalizedIdentityTerms(state).some((term) => normalized.includes(term));
}

function articleNamesOrReferencesPlayer(state: RuntimeState, article: NewsArticle): boolean {
  return (
    article.playerRelated ||
    article.relatedActorIds.includes(state.player.actorId) ||
    textNamesPlayer(state, article.headline) ||
    textNamesPlayer(state, article.body)
  );
}

function articleHasPublicCaseBasis(state: RuntimeState, article: NewsArticle): boolean {
  return article.relatedCaseIds.some((caseId) => {
    const caseFile = state.cases[caseId];
    return Boolean(
      caseFile &&
        caseFile.visibility === 'public' &&
        publicCaseStatuses.has(caseFile.status)
    );
  });
}

export function isPlayerPublicFigureForNews(state: RuntimeState): boolean {
  return (
    state.player.reputation.notoriety >= PLAYER_PUBLIC_NOTORIETY_THRESHOLD ||
    state.player.reputation.circles.neighborhoodMedia.visibility >= PLAYER_PUBLIC_MEDIA_VISIBILITY_THRESHOLD
  );
}

function anonymizePublicCaseArticle(state: RuntimeState, article: NewsArticle): NewsArticle {
  return {
    ...article,
    playerRelated: false,
    relatedActorIds: article.relatedActorIds.filter((actorId) => actorId !== state.player.actorId)
  };
}

export function enforcePlayerNewsworthiness<TIssue extends NewsIssueCandidate>(
  state: RuntimeState,
  issue: TIssue,
  path: Array<string | number>
): NewsworthinessResult<TIssue> {
  if (isPlayerPublicFigureForNews(state)) {
    return { issue, diagnostics: [] };
  }

  if (textNamesPlayer(state, issue.headline) || textNamesPlayer(state, issue.summary)) {
    return {
      diagnostics: [
        {
          path,
          code: 'player_news_suppressed',
          message: `新闻 ${issue.id} 直接以尚非公众人物的玩家为版面主题，已阻止写入。`
        }
      ]
    };
  }

  const diagnostics: StoryDiagnosticIssue[] = [];
  const articles: NewsArticle[] = [];

  issue.articles.forEach((article, index) => {
    if (!articleNamesOrReferencesPlayer(state, article)) {
      articles.push(article);
      return;
    }

    const explicitlyNamesPlayer =
      textNamesPlayer(state, article.headline) ||
      textNamesPlayer(state, article.body);
    if (articleHasPublicCaseBasis(state, article) && !explicitlyNamesPlayer) {
      articles.push(anonymizePublicCaseArticle(state, article));
      diagnostics.push({
        path: [...path, 'articles', index],
        code: 'player_news_anonymized',
        message: `报道 ${article.id} 涉及已公开案件，但玩家尚非公众人物；已移除玩家直接关联并保留公共案件报道。`
      });
      return;
    }

    diagnostics.push({
      path: [...path, 'articles', index],
      code: 'player_news_suppressed',
      message: `报道 ${article.id} 仅涉及普通玩家的私人或日常活动，已阻止写入。`
    });
  });

  if (issue.articles.length > 0 && articles.length === 0) {
    return { diagnostics };
  }

  return {
    issue: {
      ...issue,
      articles
    },
    diagnostics
  };
}
