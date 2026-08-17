import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { NewsIssue } from '../runtime/types';
import { isPartialWritebackDiagnostic } from '../writeback/writebackDiagnostics';
import { enforcePlayerNewsworthiness, isPlayerPublicFigureForNews } from './newsworthiness';

function issueWithArticle(overrides: Partial<NewsIssue['articles'][number]> = {}): NewsIssue {
  const state = createInitialRuntimeState();
  return {
    id: 'news_test',
    date: state.time,
    outletName: '明报',
    headline: '本港社会消息',
    summary: '本港多项公共议题受到关注。',
    articles: [
      {
        id: 'article_test',
        section: 'local',
        headline: '市民购入私家车',
        body: '一名普通市民购入私家车。',
        playerRelated: true,
        relatedActorIds: [state.player.actorId],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedOrganizationIds: [],
        ...overrides
      }
    ],
    createdAt: state.time,
    updatedAt: state.time,
    read: false
  };
}

describe('player newsworthiness gate', () => {
  it('drops an ordinary player private purchase instead of turning it into news', () => {
    const state = createInitialRuntimeState();
    const result = enforcePlayerNewsworthiness(state, issueWithArticle(), ['newsIssuePatches', 0]);

    expect(result.issue).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'player_news_suppressed' })
      ])
    );
    expect(result.diagnostics.some(isPartialWritebackDiagnostic)).toBe(false);
  });

  it('rejects a low-profile issue that names the player even when flags are wrong', () => {
    const state = createInitialRuntimeState();
    state.player.name = '陈志明';
    const issue = issueWithArticle({
      playerRelated: false,
      relatedActorIds: [],
      headline: `${state.player.name}购入座驾`
    });

    const result = enforcePlayerNewsworthiness(state, issue, ['newsIssuePatches', 0]);

    expect(result.issue).toBeUndefined();
  });

  it('keeps unrelated city coverage while dropping the private player article', () => {
    const state = createInitialRuntimeState();
    const issue = issueWithArticle();
    issue.articles.push({
      id: 'article_city',
      section: 'business',
      headline: '本港金融市场有新安排',
      body: '银行界关注新的货币管理安排。',
      playerRelated: false,
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: []
    });

    const result = enforcePlayerNewsworthiness(state, issue, ['newsIssuePatches', 0]);

    expect(result.issue?.articles.map((article) => article.id)).toEqual(['article_city']);
  });

  it('allows direct coverage once the player is regionally known', () => {
    const state = createInitialRuntimeState();
    state.player.reputation.notoriety = 250;

    expect(isPlayerPublicFigureForNews(state)).toBe(true);
    expect(
      enforcePlayerNewsworthiness(state, issueWithArticle(), ['newsIssuePatches', 0]).issue
    ).toBeDefined();
  });

  it('does not let the same news proposal make a low-profile player famous enough to justify itself', () => {
    const stateBeforeTurn = createInitialRuntimeState();
    const stateAfterProposedReputation = createInitialRuntimeState();
    stateAfterProposedReputation.player.reputation.notoriety = 250;

    expect(
      enforcePlayerNewsworthiness(
        stateBeforeTurn,
        issueWithArticle(),
        ['newsIssuePatches', 0]
      ).issue
    ).toBeUndefined();
    expect(isPlayerPublicFigureForNews(stateAfterProposedReputation)).toBe(true);
  });

  it('anonymizes a public court-stage case without deleting the public report', () => {
    const state = createInitialRuntimeState();
    state.cases.case_public = {
      caseId: 'case_public',
      title: '公开案件',
      caseType: 'criminal',
      status: 'charged',
      playerRole: 'assist',
      summary: '案件已经落案。',
      currentFocus: '等候提堂。',
      playerVisibleProgress: '已经落案。',
      internalProgressSummary: '已经落案。',
      relatedActorIds: [state.player.actorId],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      evidenceIds: [],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'public',
      createdAt: state.time,
      updatedAt: state.time
    };
    const issue = issueWithArticle({
      headline: '案件落案候审',
      body: '警方表示案件已经落案。',
      relatedCaseIds: ['case_public']
    });

    const result = enforcePlayerNewsworthiness(state, issue, ['newsIssuePatches', 0]);

    expect(result.issue?.articles[0]).toMatchObject({
      playerRelated: false,
      relatedActorIds: []
    });
    expect(result.diagnostics[0]?.code).toBe('player_news_anonymized');
  });
});
