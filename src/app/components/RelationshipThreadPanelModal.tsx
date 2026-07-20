import { useMemo, useState } from 'react';
import { isNpcEvolutionTrackProjectable } from '../../domain/backgroundEvolution/trackVisibility';
import type {
  GameTime,
  RelationshipThread,
  RelationshipThreadKind,
  RelationshipThreadMilestone,
  RuntimeState
} from '../../domain/runtime/types';
import { sortRelationshipThreadsForPanel } from '../../domain/relationship/relationshipThread';

interface RelationshipThreadPanelModalProps {
  state: RuntimeState;
  kind: RelationshipThreadKind;
  title: string;
  subtitle: string;
  emptyText: string;
  onClose: () => void;
}

const statusLabels: Record<RelationshipThread['status'], string> = {
  active: '活跃',
  dormant: '沉寂',
  strained: '紧张',
  ended: '已结束'
};

function formatGameTime(time: GameTime) {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function actorName(state: RuntimeState, actorId: string) {
  if (actorId === state.player.actorId || actorId === 'player') {
    return state.player.englishName ? `${state.player.name} / ${state.player.englishName}` : state.player.name;
  }
  const actor = state.actors[actorId];
  if (!actor || actor.visibility === 'hidden') return null;
  return actor.englishName ? `${actor.name} / ${actor.englishName}` : actor.name;
}

function visibleMilestones(thread: RelationshipThread): RelationshipThreadMilestone[] {
  return thread.milestones
    .filter((milestone) => milestone.visibility !== 'hidden')
    .sort((left, right) => {
      const leftTime = `${left.gameTime.year}${left.gameTime.month}${left.gameTime.day}${left.gameTime.hour}${left.gameTime.minute}`;
      const rightTime = `${right.gameTime.year}${right.gameTime.month}${right.gameTime.day}${right.gameTime.hour}${right.gameTime.minute}`;
      return rightTime.localeCompare(leftTime) || left.milestoneId.localeCompare(right.milestoneId);
    });
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="relationship-thread-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ThreadCard({ state, thread }: { state: RuntimeState; thread: RelationshipThread }) {
  const relatedActors = thread.relatedActorIds.map((actorId) => actorName(state, actorId)).filter((name): name is string => Boolean(name));
  const milestones = visibleMilestones(thread);
  const isFate = thread.kind === 'fate';
  const threadActorIds = new Set([...(thread.relatedActorIds ?? []), ...(thread.primaryActorId ? [thread.primaryActorId] : [])]);
  const currentAction = Object.values(state.backgroundEvolution.npcTracks).find(
    (track) =>
      track.visibility !== 'hidden' &&
      isNpcEvolutionTrackProjectable(state, track) &&
      threadActorIds.has(track.actorId)
  );
  const knownOutcomes = [...state.backgroundEvolution.recentOutcomes]
    .filter((outcome) => outcome.visibility !== 'hidden')
    .filter(
      (outcome) =>
        outcome.relatedRelationshipThreadIds.includes(thread.threadId) ||
        outcome.relatedActorIds.some((actorId) => threadActorIds.has(actorId))
    )
    .sort((left, right) => formatGameTime(right.occurredAt).localeCompare(formatGameTime(left.occurredAt)));
  const recentChange = knownOutcomes[0]?.summary ?? milestones[0]?.summary;
  const olderMilestones = recentChange === milestones[0]?.summary ? milestones.slice(1) : milestones;
  const olderOutcomes = recentChange === knownOutcomes[0]?.summary ? knownOutcomes.slice(1) : knownOutcomes;
  const historyCount = olderMilestones.length + olderOutcomes.length;

  return (
    <article className="relationship-thread-detail-card">
      <header>
        <div>
          <h3>{thread.title}</h3>
          <div className="relationship-thread-meta">
            <span>{thread.relationshipRole}</span>
            <span>{statusLabels[thread.status]}</span>
          </div>
        </div>
      </header>

      <section className="relationship-thread-block relationship-thread-summary-block">
        <h4>摘要</h4>
        <p>{thread.summary}</p>
      </section>

      <div className="relationship-thread-two-column">
        <section className="relationship-thread-block">
          <h4>相关人物</h4>
          {relatedActors.length > 0 ? (
            <ul>
              {relatedActors.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <p className="relationship-thread-empty">暂无记录。</p>
          )}
        </section>
        <section className="relationship-thread-block">
          <h4>{isFate ? '关系现状' : '当前联系'}</h4>
          <p>{thread.currentPull || (isFate ? '关系暂时平稳。' : '暂无需要留意的联系。')}</p>
        </section>
      </div>

      <section className="relationship-thread-block relationship-thread-movement">
        <h4>人物动向</h4>
        {currentAction ? (
          <>
            <p>
              <strong>{state.actors[currentAction.actorId]?.name ?? currentAction.actorId}</strong>
              {'：'}
              {currentAction.currentAction}
            </p>
            <small>
              {currentAction.currentPlaceId
                ? `${state.places[currentAction.currentPlaceId]?.nameZh ?? state.places[currentAction.currentPlaceId]?.name ?? currentAction.currentPlaceId} · `
                : ''}
              {currentAction.currentStatus}
              {currentAction.expectedEndAt ? ` · 预计 ${formatGameTime(currentAction.expectedEndAt)} 后复核` : ''}
            </small>
          </>
        ) : (
          <p className="relationship-thread-empty">近期没有可确认的动向。</p>
        )}
      </section>

      <div className="relationship-thread-two-column">
        <section className="relationship-thread-block">
          <h4>有效牵连</h4>
          <DetailRow label="承诺" value={thread.promiseSummary} />
          <DetailRow label="冲突" value={thread.conflictSummary} />
          <DetailRow label="风险" value={thread.riskSummary} />
          {!thread.promiseSummary && !thread.conflictSummary && !thread.riskSummary ? (
            <p className="relationship-thread-empty">目前没有需要处理的承诺、冲突或风险。</p>
          ) : null}
        </section>
        <section className="relationship-thread-block">
          <h4>最近实质变化</h4>
          <p>{recentChange ?? '近期没有可确认的实质变化。'}</p>
          {thread.lastHeartbeatAt ? <small>{formatGameTime(thread.lastHeartbeatAt)}</small> : null}
        </section>
      </div>

      <section className="relationship-thread-block">
        <h4>已知影响</h4>
        {knownOutcomes.length > 0 ? (
          <ul>
            {knownOutcomes.slice(0, 3).map((outcome) => (
              <li key={outcome.outcomeId}>
                <strong>{formatGameTime(outcome.occurredAt)}</strong>
                <span>{outcome.summary}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="relationship-thread-empty">尚无可确认影响。</p>
        )}
      </section>

      <details className="relationship-thread-history">
        <summary>过往记录（{historyCount}）</summary>
        {historyCount > 0 ? (
          <ul>
            {olderOutcomes.map((outcome) => (
              <li key={outcome.outcomeId}>
                <strong>{formatGameTime(outcome.occurredAt)}</strong>
                <span>{outcome.summary}</span>
              </li>
            ))}
            {olderMilestones.map((milestone) => (
              <li key={milestone.milestoneId}>
                <strong>{formatGameTime(milestone.gameTime)}</strong>
                <span>{milestone.summary}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="relationship-thread-empty">暂无更早记录。</p>
        )}
      </details>
    </article>
  );
}

export function RelationshipThreadPanelModal({
  state,
  kind,
  title,
  subtitle,
  emptyText,
  onClose
}: RelationshipThreadPanelModalProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const threads = useMemo(
    () =>
      sortRelationshipThreadsForPanel(Object.values(state.relationshipThreads)).filter(
        (thread) => thread.kind === kind && thread.visibility !== 'hidden'
      ),
    [kind, state.relationshipThreads]
  );
  const selectedThread = threads.find((thread) => thread.threadId === selectedThreadId) ?? threads[0];

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className={`relationship-thread-modal relationship-thread-modal--${kind} feature-modal-frame`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="character-archive-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="character-archive-stats" aria-label={`${title}统计`}>
          <span>
            已知 <strong>{threads.length}</strong>
          </span>
          <span>
            活跃 <strong>{threads.filter((thread) => thread.status === 'active').length}</strong>
          </span>
          <span>
            紧张 <strong>{threads.filter((thread) => thread.status === 'strained').length}</strong>
          </span>
        </div>

        {threads.length === 0 ? (
          <div className="relationship-thread-empty-state">{emptyText}</div>
        ) : (
          <div className="relationship-thread-body">
            <aside className="relationship-thread-list" aria-label={`${title}列表`}>
              {threads.map((thread) => (
                <button
                  key={thread.threadId}
                  type="button"
                  className={thread.threadId === selectedThread.threadId ? 'active' : undefined}
                  onClick={() => setSelectedThreadId(thread.threadId)}
                  aria-current={thread.threadId === selectedThread.threadId ? 'true' : undefined}
                >
                  <strong>{thread.title}</strong>
                  <span>
                    {thread.relationshipRole} · {statusLabels[thread.status]}
                  </span>
                  <small>{thread.summary}</small>
                </button>
              ))}
            </aside>
            <section className="relationship-thread-content" aria-label={`${title}详情`}>
              <ThreadCard state={state} thread={selectedThread} />
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
