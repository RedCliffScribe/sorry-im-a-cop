import { useMemo, useState } from 'react';
import { isNpcEvolutionTrackProjectable } from '../../domain/backgroundEvolution/trackVisibility';
import { displayCurrentMatterStatus, isArchivedCurrentMatter } from '../../domain/dynamic/currentMatterStatus';
import { resolveSignalLifecycleStatus } from '../../domain/dynamic/signalLifecycle';
import type {
  CurrentMatter,
  DeferredEvent,
  EvolutionChronicleEntry,
  EvolutionOutcomeRecord,
  EvolutionSourceRefs,
  NpcEvolutionTrack,
  OrganizationEvolutionTrack,
  RuntimeState,
  Signal
} from '../../domain/runtime/types';

interface DynamicMattersPanelModalProps {
  state: RuntimeState;
  onClose: () => void;
  onRunEvolution?: () => void;
  onAbortEvolution?: () => void;
  isEvolutionRunning?: boolean;
  evolutionStatus?: string | null;
  onArchiveEntry?: (kind: 'matter' | 'signal', id: string) => void | Promise<void>;
}

type DynamicFilter = 'all' | 'matters' | 'signals' | 'npcs' | 'city' | 'history' | 'archived';

const filters: Array<{ key: DynamicFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'matters', label: '当前事项' },
  { key: 'signals', label: '风声' },
  { key: 'npcs', label: '人物动向' },
  { key: 'city', label: '城市演化' },
  { key: 'history', label: '演化记录' },
  { key: 'archived', label: '已归档' }
];

const matterStatusLabels: Record<CurrentMatter['status'], string> = {
  active: '发酵中',
  dormant: '暂缓',
  resolved: '已平息',
  archived: '已归档'
};

const matterKindLabels: Record<NonNullable<CurrentMatter['matterKind']>, string> = {
  personal: '个人',
  livelihood: '营生',
  police_work: '警务',
  relationship: '关系',
  family: '家庭',
  social: '社会',
  risk: '风险',
  opportunity: '机会',
  case: '案件',
  world: '世界'
};

const responseWindowLabels: Record<NonNullable<CurrentMatter['responseWindow']>, string> = {
  now: '立刻',
  today: '今日',
  soon: '近期',
  open: '开放'
};

const signalTypeLabels: Record<Signal['signalType'], string> = {
  rumor: '传闻',
  street: '街坊',
  police: '警队',
  media: '媒体',
  organization: '机构',
  family: '家庭',
  other: '其他'
};

const reliabilityLabels: Record<Signal['reliability'], string> = {
  unknown: '未确认',
  low: '低',
  medium: '中',
  high: '高'
};

const signalStatusLabels: Record<Signal['status'], string> = {
  active: '流传中',
  stale: '已过时',
  resolved: '已查明',
  archived: '已归档'
};

function formatGameTime(time: RuntimeState['time']): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function placeNames(state: RuntimeState, ids: string[]): string {
  const names = ids.map((id) => state.places[id]?.nameZh ?? state.places[id]?.name ?? '').filter(Boolean);
  return names.join(' / ');
}

function actorNames(state: RuntimeState, ids: string[]): string {
  const names = ids
    .map((id) => {
      const actor = state.actors[id];
      if (!actor || actor.visibility === 'hidden') return '';
      return actor.englishName ? `${actor.name} / ${actor.englishName}` : actor.name;
    })
    .filter(Boolean);
  return names.join(' / ');
}

function organizationNames(state: RuntimeState, ids: string[]): string {
  const names = ids
    .map((id) => {
      const organization = state.organizations[id];
      if (!organization || organization.visibility === 'hidden') return '';
      return organization.name;
    })
    .filter(Boolean);
  return names.join(' / ');
}

function caseNames(state: RuntimeState, ids: string[]): string {
  const names = ids
    .map((id) => {
      const caseFile = state.cases[id];
      if (!caseFile || caseFile.visibility === 'hidden') return '';
      return caseFile.title;
    })
    .filter(Boolean);
  return names.join(' / ');
}

const deferredSourceLabels: Record<DeferredEvent['sourceModule'], string> = {
  case: '案件',
  npc: '人物',
  news: '新闻',
  finance: '财务',
  faction: '社团',
  police: '警务',
  world: '城市',
  organization: '组织',
  grayNetwork: '灰色网络',
  reputation: '声望',
  storypack: '故事包',
  dynamic: '动态',
  relationship: '关系',
};

type TraceRefs = Partial<EvolutionSourceRefs>;

function evolutionTraceLabels(state: RuntimeState, refs: TraceRefs | undefined): string[] {
  if (!refs) return [];
  const labels: string[] = [];
  const actors = actorNames(state, refs.actorIds ?? []);
  const cases = caseNames(state, refs.caseIds ?? []);
  const organizations = organizationNames(state, refs.organizationIds ?? []);
  const places = placeNames(state, refs.placeIds ?? []);
  const relationships = (refs.relationshipThreadIds ?? [])
    .map((id) => state.relationshipThreads[id])
    .filter((thread) => thread?.visibility !== 'hidden')
    .map((thread) => thread.title)
    .join(' / ');
  const cityTracks = (refs.cityTrackIds ?? [])
    .map((id) => state.citySituationTracks[id])
    .filter((track) => track?.visibility !== 'hidden')
    .map((track) => track.title)
    .join(' / ');
  const deferredEvents = (refs.deferredEventIds ?? [])
    .map((id) => state.deferredEvents[id])
    .filter((event) => event?.visibility === 'player_visible')
    .map((event) => event.title)
    .join(' / ');
  const outcomes = (refs.outcomeIds ?? [])
    .map((id) => state.backgroundEvolution.recentOutcomes.find((outcome) => outcome.outcomeId === id))
    .filter((outcome): outcome is EvolutionOutcomeRecord => Boolean(outcome && outcome.visibility !== 'hidden'))
    .map((outcome) => outcome.title)
    .join(' / ');
  if (actors) labels.push(`人物：${actors}`);
  if (cases) labels.push(`案件：${cases}`);
  if (organizations) labels.push(`组织：${organizations}`);
  if (places) labels.push(`地点：${places}`);
  if (relationships) labels.push(`关系：${relationships}`);
  if (cityTracks) labels.push(`城市轨道：${cityTracks}`);
  if (deferredEvents) labels.push(`待浮现事件：${deferredEvents}`);
  if (outcomes) labels.push(`演化结果：${outcomes}`);
  return labels;
}

function EvolutionTrace({ state, refs }: { state: RuntimeState; refs?: TraceRefs }) {
  const labels = evolutionTraceLabels(state, refs);
  if (labels.length === 0) return null;
  return (
    <details className="dynamic-trace">
      <summary>查看缘由</summary>
      <ul>{labels.map((label) => <li key={label}>{label}</li>)}</ul>
    </details>
  );
}

function EmptyState() {
  return <div className="dynamic-empty-state">暂无可知的城市脉搏</div>;
}

const npcTrackStatusLabels: Record<NpcEvolutionTrack['status'], string> = {
  planned: '筹备中',
  active: '进行中',
  blocked: '受阻',
  settled: '已结束',
  cancelled: '已取消'
};

const organizationTrackStatusLabels: Record<OrganizationEvolutionTrack['status'], string> = {
  quiet: '静默观察',
  planned: '筹备中',
  active: '进行中',
  blocked: '受阻'
};

function sortEvolutionRecords<T extends EvolutionOutcomeRecord | EvolutionChronicleEntry>(items: T[]): T[] {
  return [...items].sort((left, right) => formatGameTime(right.occurredAt).localeCompare(formatGameTime(left.occurredAt)));
}

function sortMatters(items: CurrentMatter[]): CurrentMatter[] {
  return [...items].sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return (
      right.updatedAt.year - left.updatedAt.year ||
      right.updatedAt.month - left.updatedAt.month ||
      right.updatedAt.day - left.updatedAt.day ||
      right.updatedAt.hour - left.updatedAt.hour ||
      right.updatedAt.minute - left.updatedAt.minute
    );
  });
}

function sortSignals(items: Signal[]): Signal[] {
  return [...items].sort(
    (left, right) =>
      right.updatedAt.year - left.updatedAt.year ||
      right.updatedAt.month - left.updatedAt.month ||
      right.updatedAt.day - left.updatedAt.day ||
      right.updatedAt.hour - left.updatedAt.hour ||
      right.updatedAt.minute - left.updatedAt.minute
  );
}

export function DynamicMattersPanelModal({
  state,
  onClose,
  onRunEvolution,
  onAbortEvolution,
  isEvolutionRunning = false,
  evolutionStatus,
  onArchiveEntry
}: DynamicMattersPanelModalProps) {
  const [activeFilter, setActiveFilter] = useState<DynamicFilter>('all');
  const matterBuckets = useMemo(() => {
    const visibleMatters = sortMatters(Object.values(state.dynamicEvents.currentMatters).filter((matter) => matter.visibility !== 'hidden'));
    return {
      current: visibleMatters.filter((matter) => !isArchivedCurrentMatter(matter)),
      archived: visibleMatters.filter((matter) => isArchivedCurrentMatter(matter))
    };
  }, [state.dynamicEvents.currentMatters]);
  const signalBuckets = useMemo(() => {
    const visibleSignals = sortSignals(Object.values(state.dynamicEvents.signals).filter((signal) => signal.visibility !== 'hidden'));
    return {
      current: visibleSignals.filter((signal) => resolveSignalLifecycleStatus(signal, state.time) === 'active'),
      archived: visibleSignals.filter((signal) => resolveSignalLifecycleStatus(signal, state.time) !== 'active')
    };
  }, [state.dynamicEvents.signals, state.time]);
  const matters = matterBuckets.current;
  const signals = signalBuckets.current;
  const archivedMatters = matterBuckets.archived;
  const archivedSignals = signalBuckets.archived;
  const archivedCount = archivedMatters.length + archivedSignals.length;
  const npcTracks = useMemo(
    () =>
      Object.values(state.backgroundEvolution.npcTracks)
        .filter(
          (track) =>
            track.visibility !== 'hidden' &&
            isNpcEvolutionTrackProjectable(state, track)
        )
        .sort((left, right) => formatGameTime(left.nextReviewAt).localeCompare(formatGameTime(right.nextReviewAt))),
    [state]
  );
  const cityTracks = useMemo(
    () =>
      Object.values(state.citySituationTracks)
        .filter((track) => track.visibility !== 'hidden' && track.status !== 'resolved')
        .sort((left, right) => right.pressureLevel - left.pressureLevel || left.title.localeCompare(right.title)),
    [state.citySituationTracks]
  );
  const organizationTracks = useMemo(
    () =>
      Object.values(state.backgroundEvolution.organizationTracks)
        .filter(
          (track) =>
            track.visibility !== 'hidden' &&
            (track.status === 'planned' || track.status === 'active' || track.status === 'blocked')
        )
        .sort((left, right) => formatGameTime(left.nextReviewAt).localeCompare(formatGameTime(right.nextReviewAt))),
    [state.backgroundEvolution.organizationTracks]
  );
  const deferredEvents = useMemo(
    () =>
      Object.values(state.deferredEvents)
        .filter((event) => event.status === 'pending' && event.visibility === 'player_visible')
        .sort((left, right) => formatGameTime(left.triggerAt).localeCompare(formatGameTime(right.triggerAt)))
        .slice(0, 8),
    [state.deferredEvents]
  );
  const recentOutcomes = useMemo(
    () =>
      sortEvolutionRecords(
        state.backgroundEvolution.recentOutcomes.filter((outcome) => outcome.visibility !== 'hidden')
      ).slice(0, 12),
    [state.backgroundEvolution.recentOutcomes]
  );
  const chronicle = useMemo(
    () =>
      sortEvolutionRecords(state.backgroundEvolution.chronicle.filter((entry) => entry.visibility !== 'hidden')).slice(0, 12),
    [state.backgroundEvolution.chronicle]
  );
  const showMatters = activeFilter === 'all' || activeFilter === 'matters';
  const showSignals = activeFilter === 'all' || activeFilter === 'signals';
  const showNpcs = activeFilter === 'all' || activeFilter === 'npcs';
  const showCity = activeFilter === 'all' || activeFilter === 'city';
  const showHistory = activeFilter === 'all' || activeFilter === 'history';
  const showArchived = activeFilter === 'archived';
  const hasVisibleEntries =
    (showMatters && matters.length > 0) ||
    (showSignals && signals.length > 0) ||
    (showNpcs && npcTracks.length > 0) ||
    (showCity && cityTracks.length + organizationTracks.length + deferredEvents.length > 0) ||
    (showHistory && recentOutcomes.length + chronicle.length > 0) ||
    (showArchived && archivedCount > 0);

  function getFilterCount(filter: DynamicFilter) {
    if (filter === 'matters') return matters.length;
    if (filter === 'signals') return signals.length;
    if (filter === 'npcs') return npcTracks.length;
    if (filter === 'city') return cityTracks.length + organizationTracks.length + deferredEvents.length;
    if (filter === 'history') return recentOutcomes.length + chronicle.length;
    if (filter === 'archived') return archivedCount;
    return matters.length + signals.length + npcTracks.length + cityTracks.length + organizationTracks.length + deferredEvents.length + recentOutcomes.length + chronicle.length;
  }

  function renderNpcTrack(track: NpcEvolutionTrack) {
    const actor = state.actors[track.actorId];
    const place = track.currentPlaceId
      ? state.places[track.currentPlaceId]?.nameZh ?? state.places[track.currentPlaceId]?.name
      : undefined;
    return (
      <article key={track.trackId} className="dynamic-card dynamic-card--npc">
        <header className="dynamic-card-header">
          <div>
            <small>{actor?.publicIdentity ?? actor?.positionSummary ?? '重要人物'}</small>
            <strong>{actor?.name ?? track.actorId}</strong>
          </div>
          <span className="dynamic-status-badge">{npcTrackStatusLabels[track.status]}</span>
        </header>
        <p className="dynamic-card-summary">{track.currentAction}</p>
        <div className="dynamic-card-facts">
          {place ? <span>{place}</span> : null}
          {track.startedAt ? <span>开始 {formatGameTime(track.startedAt)}</span> : null}
          {track.expectedEndAt ? <span>预计结束 {formatGameTime(track.expectedEndAt)}</span> : null}
          <span>复核 {formatGameTime(track.nextReviewAt)}</span>
        </div>
        <section className="dynamic-card-focus">
          <h4>当前目标</h4>
          <p>{track.objective}</p>
        </section>
        <EvolutionTrace
          state={state}
          refs={track.sourceRefs ?? {
            actorIds: [track.actorId, ...track.relatedActorIds],
            caseIds: track.relatedCaseIds,
            placeIds: track.relatedPlaceIds,
            organizationIds: track.relatedOrganizationIds,
            relationshipThreadIds: track.relatedRelationshipThreadIds,
            cityTrackIds: track.relatedCityTrackIds,
            deferredEventIds: track.relatedDeferredEventIds
          }}
        />
      </article>
    );
  }

  function renderCityTrack(track: RuntimeState['citySituationTracks'][string]) {
    return (
      <article key={track.trackId} className="dynamic-card dynamic-card--city">
        <header className="dynamic-card-header">
          <div>
            <small>城市轨道 · {track.status}</small>
            <strong>{track.title}</strong>
          </div>
          <span className="dynamic-status-badge">压力 {track.pressureLevel}/5</span>
        </header>
        <p className="dynamic-card-summary">{track.summary}</p>
        <section className="dynamic-card-focus">
          <h4>当前演化</h4>
          <p>{track.currentBeat}</p>
        </section>
        {track.nextReviewAt ? <small>下次复核 {formatGameTime(track.nextReviewAt)}</small> : null}
      </article>
    );
  }

  function renderOrganizationTrack(track: OrganizationEvolutionTrack) {
    const organization = state.organizations[track.organizationId];
    return (
      <article key={track.trackId} className="dynamic-card dynamic-card--organization">
        <header className="dynamic-card-header">
          <div>
            <small>组织行动 · {organization?.type ?? '机构'}</small>
            <strong>{organization?.name ?? track.organizationId}</strong>
          </div>
          <span className="dynamic-status-badge">{organizationTrackStatusLabels[track.status]}</span>
        </header>
        <p className="dynamic-card-summary">{track.currentAction}</p>
        <div className="dynamic-card-facts">
          {track.startedAt ? <span>开始 {formatGameTime(track.startedAt)}</span> : null}
          {track.expectedEndAt ? <span>预计结束 {formatGameTime(track.expectedEndAt)}</span> : null}
          <span>复核 {formatGameTime(track.nextReviewAt)}</span>
        </div>
        {track.currentStatus ? (
          <section className="dynamic-card-focus">
            <h4>当前进展</h4>
            <p>{track.currentStatus}</p>
          </section>
        ) : null}
        <EvolutionTrace
          state={state}
          refs={track.sourceRefs ?? {
            actorIds: track.relatedActorIds,
            caseIds: track.relatedCaseIds,
            placeIds: track.relatedPlaceIds,
            organizationIds: [track.organizationId],
            cityTrackIds: track.relatedCityTrackIds
          }}
        />
      </article>
    );
  }

  function renderOutcome(outcome: EvolutionOutcomeRecord) {
    return (
      <article key={outcome.outcomeId} className="dynamic-card dynamic-card--outcome">
        <header className="dynamic-card-header">
          <div>
            <small>{formatGameTime(outcome.occurredAt)} · 近期结算</small>
            <strong>{outcome.title}</strong>
          </div>
        </header>
        <p className="dynamic-card-summary">{outcome.summary}</p>
        {outcome.consequence ? <p className="dynamic-card-consequence">{outcome.consequence}</p> : null}
        <EvolutionTrace
          state={state}
          refs={outcome.sourceRefs ?? {
            actorIds: outcome.relatedActorIds,
            caseIds: outcome.relatedCaseIds,
            placeIds: outcome.relatedPlaceIds,
            organizationIds: outcome.relatedOrganizationIds,
            relationshipThreadIds: outcome.relatedRelationshipThreadIds
          }}
        />
      </article>
    );
  }

  function renderChronicle(entry: EvolutionChronicleEntry) {
    return (
      <article key={entry.entryId} className="dynamic-card dynamic-card--chronicle">
        <header className="dynamic-card-header">
          <div>
            <small>{formatGameTime(entry.occurredAt)} · 长期史册</small>
            <strong>{entry.title}</strong>
          </div>
        </header>
        <p className="dynamic-card-summary">{entry.summary}</p>
        <section className="dynamic-card-focus">
          <h4>长期影响</h4>
          <p>{entry.longTermImpact}</p>
        </section>
        <EvolutionTrace
          state={state}
          refs={entry.sourceRefs ?? {
            actorIds: entry.relatedActorIds,
            caseIds: entry.relatedCaseIds,
            placeIds: entry.relatedPlaceIds,
            organizationIds: entry.relatedOrganizationIds,
            outcomeIds: entry.sourceOutcomeIds
          }}
        />
      </article>
    );
  }

  function renderDeferredEvent(event: DeferredEvent) {
    return (
      <article key={event.eventId} className="dynamic-card dynamic-card--deferred">
        <header className="dynamic-card-header">
          <div>
            <small>待浮现 · {deferredSourceLabels[event.sourceModule]}</small>
            <strong>{event.title}</strong>
          </div>
          <span className="dynamic-status-badge">{formatGameTime(event.triggerAt)}</span>
        </header>
        <p className="dynamic-card-summary">{event.summary}</p>
        <EvolutionTrace
          state={state}
          refs={{
            actorIds: event.relatedIds.actorId ? [event.relatedIds.actorId] : [],
            caseIds: event.relatedIds.caseId ? [event.relatedIds.caseId] : [],
            placeIds: event.relatedIds.placeId ? [event.relatedIds.placeId] : [],
            organizationIds: event.relatedIds.organizationId ? [event.relatedIds.organizationId] : []
          }}
        />
      </article>
    );
  }

  function renderMatterCard(matter: CurrentMatter, archived = false) {
    const places = placeNames(state, matter.relatedPlaceIds);
    const actors = actorNames(state, matter.relatedActorIds);
    const organizations = organizationNames(state, matter.relatedOrganizationIds);
    const cases = caseNames(state, matter.relatedCaseIds);

    return (
      <article key={matter.id} className={`dynamic-card dynamic-card--matter${archived ? ' dynamic-card--archived' : ''}`}>
        <header className="dynamic-card-header">
          <div>
            <small>{matterKindLabels[matter.matterKind ?? 'world']} · {formatGameTime(matter.updatedAt)}</small>
            <strong>{matter.title}</strong>
          </div>
          <div className="dynamic-card-actions">
            <span className="dynamic-status-badge">{matterStatusLabels[displayCurrentMatterStatus(matter)]}</span>
            {!archived && onArchiveEntry ? (
              <button
                type="button"
                className="dynamic-card-archive-action"
                aria-label={`归档事项 ${matter.title}`}
                onClick={() => void onArchiveEntry('matter', matter.id)}
              >
                归档
              </button>
            ) : null}
          </div>
        </header>
        <p className="dynamic-card-summary">{matter.summary}</p>
        <div className="dynamic-card-facts" aria-label="事项状态">
          <span>压力 {matter.pressureLevel ?? 0}/3</span>
          <span>处理时限 {responseWindowLabels[matter.responseWindow ?? 'open']}</span>
          {matter.dueAt ? <span>期限 {formatGameTime(matter.dueAt)}</span> : null}
        </div>
        {matter.currentHook ? (
          <section className="dynamic-card-focus">
            <h4>当前进展</h4>
            <p>{matter.currentHook}</p>
          </section>
        ) : null}
        {matter.consequenceHint ? (
          <section className="dynamic-card-consequence">
            <h4>后续影响</h4>
            <p>{matter.consequenceHint}</p>
          </section>
        ) : null}
        <dl className="dynamic-card-relations">
          {places ? <div><dt>地点</dt><dd>{places}</dd></div> : null}
          {actors ? <div><dt>人物</dt><dd>{actors}</dd></div> : null}
          {organizations ? <div><dt>机构</dt><dd>{organizations}</dd></div> : null}
          {cases ? <div><dt>案件</dt><dd>{cases}</dd></div> : null}
        </dl>
      </article>
    );
  }

  function renderSignalCard(signal: Signal, archived = false) {
    const places = placeNames(state, signal.relatedPlaceIds);
    const actors = actorNames(state, signal.relatedActorIds);
    const organizations = organizationNames(state, signal.relatedOrganizationIds);

    const effectiveStatus = resolveSignalLifecycleStatus(signal, state.time);

    return (
      <article key={signal.id} className={`dynamic-card dynamic-card--signal${archived ? ' dynamic-card--archived' : ''}`}>
        <header className="dynamic-card-header">
          <div>
            <small>{signalTypeLabels[signal.signalType]} · {formatGameTime(signal.updatedAt)}</small>
            <strong>{signal.title}</strong>
          </div>
          <div className="dynamic-card-actions">
            <span className="dynamic-status-badge">
              {signalStatusLabels[effectiveStatus]} · 可信度 {reliabilityLabels[signal.reliability]}
            </span>
            {!archived && onArchiveEntry ? (
              <button
                type="button"
                className="dynamic-card-archive-action"
                aria-label={`归档风声 ${signal.title}`}
                onClick={() => void onArchiveEntry('signal', signal.id)}
              >
                归档
              </button>
            ) : null}
          </div>
        </header>
        <p className="dynamic-card-summary">{signal.summary}</p>
        <dl className="dynamic-card-relations">
          {places ? <div><dt>地点</dt><dd>{places}</dd></div> : null}
          {actors ? <div><dt>人物</dt><dd>{actors}</dd></div> : null}
          {organizations ? <div><dt>机构</dt><dd>{organizations}</dd></div> : null}
        </dl>
      </article>
    );
  }

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="dynamic-panel-modal archive-info-modal archive-info-modal--dynamic feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="城市脉搏"
      >
        <header className="character-archive-header">
          <div>
            <h2>城市脉搏</h2>
            <p>远场人物、城市局势与已知结果</p>
          </div>
          <div className="dynamic-header-actions">
            {isEvolutionRunning && onAbortEvolution ? (
              <button type="button" className="dynamic-evolution-action dynamic-evolution-action--abort" onClick={onAbortEvolution}>
                中止推演
              </button>
            ) : onRunEvolution ? (
              <button type="button" className="dynamic-evolution-action" onClick={onRunEvolution}>
                推演后台
              </button>
            ) : null}
            <button type="button" onClick={onClose}>
              关闭
            </button>
          </div>
        </header>

        <div className="dynamic-panel-summary">
          {isEvolutionRunning || evolutionStatus ? (
            <div className={`dynamic-evolution-status${isEvolutionRunning ? ' is-running' : ''}`} role="status">
              <strong>{isEvolutionRunning ? '系统正在推演远场人物与城市动态' : '推演结果'}</strong>
              {evolutionStatus ? <span>{evolutionStatus}</span> : <span>正在等待模型返回结构化演化结果……</span>}
            </div>
          ) : null}

          <div className="character-archive-stats" aria-label="动态统计">
            <span>
              当前事项 <strong>{matters.length}</strong>
            </span>
            <span>
              风声 <strong>{signals.length}</strong>
            </span>
            <span>
              已归档 <strong>{archivedCount}</strong>
            </span>
            <span>
              人物动向 <strong>{npcTracks.length}</strong>
            </span>
            <span>
              城市轨道 <strong>{cityTracks.length}</strong>
            </span>
            <span>
              组织行动 <strong>{organizationTracks.length}</strong>
            </span>
            <span>
              待浮现 <strong>{deferredEvents.length}</strong>
            </span>
            <span>
              史册 <strong>{chronicle.length}</strong>
            </span>
          </div>
        </div>

        <div className="dynamic-panel-body">
          <aside className="dynamic-filter-list" aria-label="动态分类">
            {filters.map((filter) => (
              <button key={filter.key} type="button" className={activeFilter === filter.key ? 'active' : ''} onClick={() => setActiveFilter(filter.key)}>
                <span>{filter.label}</span>
                <strong>{getFilterCount(filter.key)}</strong>
              </button>
            ))}
          </aside>

          <section className="dynamic-content" aria-label="动态内容">
            {!hasVisibleEntries ? (
              <EmptyState />
            ) : (
              <>
                {showMatters ? (
                  <section className="dynamic-section">
                    <h3>当前事项</h3>
                    <div className="dynamic-card-grid">{matters.map((matter) => renderMatterCard(matter))}</div>
                  </section>
                ) : null}

                {showSignals ? (
                  <section className="dynamic-section">
                    <h3>风声</h3>
                    <div className="dynamic-card-grid">{signals.map((signal) => renderSignalCard(signal))}</div>
                  </section>
                ) : null}

                {showNpcs ? (
                  <section className="dynamic-section">
                    <h3>重要人物动向</h3>
                    <div className="dynamic-card-grid">{npcTracks.map(renderNpcTrack)}</div>
                  </section>
                ) : null}

                {showCity ? (
                  <section className="dynamic-section">
                    <h3>城市演化</h3>
                    {deferredEvents.length ? (
                      <>
                        <h4 className="dynamic-subsection-title">即将浮出水面</h4>
                        <div className="dynamic-card-grid">{deferredEvents.map(renderDeferredEvent)}</div>
                      </>
                    ) : null}
                    {organizationTracks.length ? (
                      <>
                        <h4 className="dynamic-subsection-title">已激活组织</h4>
                        <div className="dynamic-card-grid">{organizationTracks.map(renderOrganizationTrack)}</div>
                      </>
                    ) : null}
                    {cityTracks.length ? (
                      <>
                        <h4 className="dynamic-subsection-title">城市轨道</h4>
                        <div className="dynamic-card-grid">{cityTracks.map(renderCityTrack)}</div>
                      </>
                    ) : null}
                  </section>
                ) : null}

                {showHistory ? (
                  <section className="dynamic-section">
                    <h3>近期结算与长期史册</h3>
                    <div className="dynamic-card-grid">
                      {recentOutcomes.map(renderOutcome)}
                      {chronicle.map(renderChronicle)}
                    </div>
                  </section>
                ) : null}

                {showArchived ? (
                  <section className="dynamic-section">
                    <h3>已归档</h3>
                    <div className="dynamic-card-grid dynamic-card-grid--archived">
                      {archivedMatters.map((matter) => renderMatterCard(matter, true))}
                      {archivedSignals.map((signal) => renderSignalCard(signal, true))}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
