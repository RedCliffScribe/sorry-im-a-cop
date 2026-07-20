import { describe, expect, it } from 'vitest';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { GameTime, NewsIssue, RuntimeState } from '../runtime/types';
import {
  archiveNewsIssue,
  getNewsIssueCategory,
  markNewsIssueRead,
  reconcileNewsIssueLifecycle,
  toggleNewsIssueImportant
} from './newsIssueLifecycle';

const NOW: GameTime = { year: 1988, month: 6, day: 10, hour: 9, minute: 0 };

function gameTime(day: number): GameTime {
  return { year: 1988, month: 6, day, hour: 8, minute: 0 };
}

function createIssue(overrides: Partial<NewsIssue> & Pick<NewsIssue, 'id'>): NewsIssue {
  return {
    id: overrides.id,
    date: overrides.date ?? gameTime(10),
    outletName: overrides.outletName ?? '大公报',
    headline: overrides.headline ?? '本港消息',
    summary: overrides.summary ?? '报章刊登一则本港消息。',
    articles: overrides.articles ?? [],
    createdAt: overrides.createdAt ?? gameTime(10),
    updatedAt: overrides.updatedAt ?? gameTime(10),
    read: overrides.read ?? false,
    important: overrides.important,
    archivedAt: overrides.archivedAt
  };
}

function createState(...issues: NewsIssue[]): RuntimeState {
  const state = createInitialRuntimeState();
  state.time = { ...NOW };
  state.dynamicEvents.newsIssues = Object.fromEntries(issues.map((issue) => [issue.id, issue]));
  return state;
}

function addReportedNpc(state: RuntimeState): void {
  state.actors.npc_reported = createActorDefaults({
    actorId: 'npc_reported',
    name: '林淑仪',
    gender: 'female',
    currentIdentity: 'civilian',
    publicIdentity: '百货公司售货员',
    profileSummary: '玩家认识的百货公司售货员。',
    presence: 'absent',
    visibility: 'player_known',
    importance: 70
  });
}

function createRelatedIssue(): NewsIssue {
  return createIssue({
    id: 'news_related',
    headline: '警员与售货员共赴晚宴',
    summary: '报章声称一名警员与百货公司售货员关系密切。',
    articles: [
      {
        id: 'article_related',
        section: 'gossip',
        headline: '警员与售货员共赴晚宴',
        body: '《大公报》称两人在中环一间餐厅共进晚餐。',
        playerRelated: true,
        relatedActorIds: ['npc_reported', 'player'],
        relatedPlaceIds: ['place_central'],
        relatedCaseIds: [],
        relatedOrganizationIds: []
      }
    ]
  });
}

describe('newsIssueLifecycle', () => {
  it('automatically archives ordinary issues at three days while retaining important issues', () => {
    const ordinary = createIssue({ id: 'news_ordinary', date: gameTime(7) });
    const important = createIssue({ id: 'news_important', date: gameTime(2), important: true });
    const state = createState(ordinary, important);

    const next = reconcileNewsIssueLifecycle(state);

    expect(next.dynamicEvents.newsIssues.news_ordinary.archivedAt).toEqual(NOW);
    expect(next.dynamicEvents.newsIssues.news_important.archivedAt).toBeUndefined();
    expect(getNewsIssueCategory(next.dynamicEvents.newsIssues.news_ordinary, NOW)).toBe('archived');
    expect(getNewsIssueCategory(next.dynamicEvents.newsIssues.news_important, NOW)).toBe('important');
  });

  it('deletes issues seven days after they entered the archive', () => {
    const archived = createIssue({ id: 'news_archived', date: gameTime(1), archivedAt: gameTime(3) });
    const state = createState(archived);

    const next = reconcileNewsIssueLifecycle(state);

    expect(next.dynamicEvents.newsIssues.news_archived).toBeUndefined();
  });

  it('allows manual archive and immediately archives an old issue when important is removed', () => {
    const recent = createIssue({ id: 'news_recent' });
    const oldImportant = createIssue({ id: 'news_old_important', date: gameTime(2), important: true });
    const state = createState(recent, oldImportant);

    const manuallyArchived = archiveNewsIssue(state, 'news_recent');
    const unmarked = toggleNewsIssueImportant(state, 'news_old_important');

    expect(manuallyArchived.dynamicEvents.newsIssues.news_recent.archivedAt).toEqual(NOW);
    expect(manuallyArchived.dynamicEvents.newsIssues.news_recent.important).toBe(false);
    expect(unmarked.dynamicEvents.newsIssues.news_old_important.important).toBe(false);
    expect(unmarked.dynamicEvents.newsIssues.news_old_important.archivedAt).toEqual(NOW);
  });

  it('writes one private claim memory for each reported stable NPC', () => {
    const state = createState(createRelatedIssue());
    addReportedNpc(state);

    const once = reconcileNewsIssueLifecycle(state);
    const twice = reconcileNewsIssueLifecycle(once);
    const actorMemories = Object.values(twice.memories).filter(
      (memory) => memory.kind === 'actor' && memory.relatedActorIds.includes('npc_reported')
    );

    expect(actorMemories).toHaveLength(1);
    expect(actorMemories[0]).toEqual(
      expect.objectContaining({
        tier: 'short_term',
        certainty: 'claim',
        visibility: 'private',
        relatedPlaceIds: ['place_central']
      })
    );
    expect(actorMemories[0].text).toContain('1988年6月10日');
    expect(actorMemories[0].text).toContain('《大公报》报称我与');
    expect(actorMemories[0].text).toContain('这是报章说法，未必属实');
  });

  it('does not create a player memory until the related issue is read and then deduplicates it', () => {
    const state = createState(createRelatedIssue());
    addReportedNpc(state);

    const published = reconcileNewsIssueLifecycle(state);
    expect(Object.values(published.memories).some((memory) => memory.kind === 'player')).toBe(false);

    const once = markNewsIssueRead(published, 'news_related');
    const twice = markNewsIssueRead(once, 'news_related');
    const playerMemories = Object.values(twice.memories).filter((memory) => memory.kind === 'player');

    expect(twice.dynamicEvents.newsIssues.news_related.read).toBe(true);
    expect(playerMemories).toHaveLength(1);
    expect(playerMemories[0]).toEqual(
      expect.objectContaining({
        certainty: 'claim',
        visibility: 'player_known',
        relatedActorIds: ['player', 'npc_reported']
      })
    );
    expect(playerMemories[0].text).toContain('我读到《大公报》报称');
    expect(playerMemories[0].text).toContain('未必属实');
    expect(twice).toBe(once);
  });

  it('ignores missing actor references when creating NPC memories', () => {
    const issue = createRelatedIssue();
    issue.articles[0].relatedActorIds = ['npc_missing'];
    const state = createState(issue);

    const next = reconcileNewsIssueLifecycle(state);

    expect(Object.values(next.memories)).toHaveLength(0);
  });
});
