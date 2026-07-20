import { useEffect, useMemo, useState } from 'react';
import {
  archiveNewsIssue,
  getNewsIssueCategory,
  markNewsIssueRead,
  reconcileNewsIssueLifecycle,
  toggleNewsIssueImportant,
  type NewsIssueCategory
} from '../../domain/news/newsIssueLifecycle';
import type { NewsArticle, NewsArticleSection, NewsIssue, RuntimeState } from '../../domain/runtime/types';

interface NewsPaperModalProps {
  state: RuntimeState;
  onStateChange: (state: RuntimeState) => void;
  onClose: () => void;
}

const sectionLabels: Record<NewsArticleSection, string> = {
  front_page: '头版',
  local: '本港',
  crime: '治安',
  entertainment: '娱乐',
  business: '财经',
  politics: '政闻',
  world: '国际',
  society: '社会',
  gossip: '花边',
  other: '其他'
};

const categoryLabels: Record<NewsIssueCategory, string> = {
  latest: '最新',
  important: '重要',
  archived: '归档'
};

const categories: NewsIssueCategory[] = ['latest', 'important', 'archived'];

function formatGameDate(time: RuntimeState['time']): string {
  return `${time.year}年${String(time.month).padStart(2, '0')}月${String(time.day).padStart(2, '0')}日`;
}

function gameTimeValue(time: RuntimeState['time']): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
}

function sortIssues(issues: NewsIssue[]): NewsIssue[] {
  return [...issues].sort((left, right) => gameTimeValue(right.date) - gameTimeValue(left.date) || right.id.localeCompare(left.id));
}

function relatedLine(state: RuntimeState, article: NewsArticle): string {
  const actors = article.relatedActorIds
    .map((id) => state.actors[id])
    .filter((actor) => actor && actor.visibility !== 'hidden')
    .map((actor) => (actor.englishName ? `${actor.name} / ${actor.englishName}` : actor.name));
  const places = article.relatedPlaceIds.map((id) => state.places[id]?.nameZh ?? state.places[id]?.name ?? '').filter(Boolean);
  const organizations = article.relatedOrganizationIds
    .map((id) => state.organizations[id])
    .filter((organization) => organization && organization.visibility !== 'hidden')
    .map((organization) => organization.name);
  const items = [...actors, ...places, ...organizations];
  return items.length ? items.join(' / ') : '';
}

function EmptyState() {
  return <div className="newspaper-empty-state">暂无报纸</div>;
}

export function NewsPaperModal({ state, onStateChange, onClose }: NewsPaperModalProps) {
  const managedState = useMemo(() => reconcileNewsIssueLifecycle(state), [state]);
  const allIssues = useMemo(
    () => sortIssues(Object.values(managedState.dynamicEvents.newsIssues)),
    [managedState.dynamicEvents.newsIssues]
  );
  const groupedIssues = useMemo(
    () =>
      Object.fromEntries(
        categories.map((category) => [
          category,
          allIssues.filter((issue) => getNewsIssueCategory(issue, managedState.time) === category)
        ])
      ) as Record<NewsIssueCategory, NewsIssue[]>,
    [allIssues, managedState.time]
  );
  const [activeCategory, setActiveCategory] = useState<NewsIssueCategory>('latest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visibleIssues = groupedIssues[activeCategory];
  const selectedIssue = visibleIssues.find((issue) => issue.id === selectedId) ?? visibleIssues[0] ?? null;

  useEffect(() => {
    const nextState = selectedIssue ? markNewsIssueRead(managedState, selectedIssue.id) : managedState;
    if (nextState !== state) onStateChange(nextState);
  }, [managedState, onStateChange, selectedIssue, state]);

  const handleToggleImportant = (issueId: string) => {
    onStateChange(toggleNewsIssueImportant(managedState, issueId));
  };

  const handleArchive = (issueId: string) => {
    onStateChange(archiveNewsIssue(managedState, issueId));
  };

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="newspaper-modal archive-info-modal archive-info-modal--newspaper feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="新闻"
      >
        <header className="character-archive-header">
          <div>
            <h2>新闻</h2>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="newspaper-body">
          <aside className="newspaper-library-sidebar" aria-label="报纸资料库">
            <div className="newspaper-category-tabs" role="tablist" aria-label="新闻分类">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === category}
                  className={activeCategory === category ? 'active' : ''}
                  onClick={() => setActiveCategory(category)}
                >
                  <span>{categoryLabels[category]}</span>
                  <strong>{groupedIssues[category].length}</strong>
                </button>
              ))}
            </div>

            <div className="newspaper-issue-list" aria-label={`${categoryLabels[activeCategory]}报纸`}>
              {visibleIssues.map((issue) => (
                <article key={issue.id} className={selectedIssue?.id === issue.id ? 'newspaper-issue-card active' : 'newspaper-issue-card'}>
                  <button
                    type="button"
                    className="newspaper-issue-select"
                    aria-label={`阅读${issue.outletName} ${formatGameDate(issue.date)} ${issue.read ? '已读' : '未读'}`}
                    onClick={() => setSelectedId(issue.id)}
                  >
                    <span className="newspaper-issue-heading">
                      <strong>{issue.outletName}</strong>
                      <span>{formatGameDate(issue.date)}</span>
                    </span>
                    <small>{issue.read ? '已读' : '未读'}</small>
                  </button>
                  {activeCategory !== 'archived' ? (
                    <div className="newspaper-issue-actions">
                      <button
                        type="button"
                        aria-label={`${issue.important ? '取消重要' : '标记重要'}：${issue.outletName}`}
                        title={issue.important ? '取消重要' : '标记重要'}
                        onClick={() => handleToggleImportant(issue.id)}
                      >
                        {issue.important ? '★' : '☆'}
                      </button>
                      <button
                        type="button"
                        aria-label={`归档报纸：${issue.outletName}`}
                        title="归档报纸"
                        onClick={() => handleArchive(issue.id)}
                      >
                        归
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </aside>

          {selectedIssue ? (
            <article className="newspaper-page">
              <header className="newspaper-masthead">
                <span>{formatGameDate(selectedIssue.date)}</span>
                <h3>{selectedIssue.outletName}</h3>
                <span>港币伍毫</span>
              </header>
              <div className="newspaper-edition-line" aria-label="报纸版面信息">
                <span>本港新闻</span>
                <span>{selectedIssue.date.year}年香港版</span>
              </div>

              <section className="newspaper-lead">
                <h4>{selectedIssue.headline}</h4>
                <p>{selectedIssue.summary}</p>
              </section>

              <div className="newspaper-article-grid">
                {selectedIssue.articles.map((article) => {
                  const related = relatedLine(managedState, article);
                  return (
                    <section key={article.id} className={article.playerRelated ? 'newspaper-article player-related' : 'newspaper-article'}>
                      <div className="newspaper-article-meta">
                        <span>{sectionLabels[article.section]}</span>
                        {article.playerRelated ? <strong>与你有关</strong> : null}
                      </div>
                      <h5>{article.headline}</h5>
                      <p>{article.body}</p>
                      {related ? <small className="newspaper-related-line">相关：{related}</small> : null}
                    </section>
                  );
                })}
              </div>
            </article>
          ) : (
            <EmptyState />
          )}
        </div>
      </section>
    </div>
  );
}
