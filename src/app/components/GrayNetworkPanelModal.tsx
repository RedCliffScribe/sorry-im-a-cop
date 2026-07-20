import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { projectGrayNetworkContext } from '../../domain/grayNetwork/grayNetworkContextProjector';
import type { Organization, OrganizationStructureNode, RuntimeState } from '../../domain/runtime/types';

interface GrayNetworkPanelModalProps {
  state: RuntimeState;
  onClose: () => void;
  onDraftPlayerAction: (text: string) => void;
}

function displayIdentity(identity: RuntimeState['player']['currentIdentity']): string {
  const labels: Record<RuntimeState['player']['currentIdentity'], string> = {
    civilian: '普通市民',
    police: '警察',
    gang_member: '社团分子'
  };
  return labels[identity] ?? identity;
}

function confidenceText(confidence?: string): string {
  const labels: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
    unknown: '未知'
  };
  return confidence ? labels[confidence] ?? confidence : '未知';
}

function certaintyText(certainty?: string): string {
  const labels: Record<string, string> = {
    fact: '已经确认',
    confirmed: '已经确认',
    likely: '较可信',
    probable: '较可信',
    rumor: '街头传闻',
    uncertain: '尚未确认'
  };
  return certainty ? labels[certainty] ?? certainty : '尚未确认';
}

function riskLevelText(level?: string): string {
  const labels: Record<string, string> = {
    low: '低风险',
    medium: '中等风险',
    high: '高风险',
    critical: '极高风险',
    normal: '一般',
    unclear: '未明'
  };
  return level ? labels[level] ?? level : '未明';
}

function placeName(state: RuntimeState, placeId: string): string {
  const place = state.places[placeId];
  return place ? place.nameZh ?? place.name : placeId;
}

function actorName(state: RuntimeState, actorId: string): string {
  const actor = state.actors[actorId];
  if (!actor) return actorId;
  return actor.englishName ? `${actor.name} / ${actor.englishName}` : actor.name;
}

function currentPlaceName(state: RuntimeState): string {
  const place = state.places[state.location.currentPlaceId];
  return place?.nameZh ?? place?.name ?? '地点未明';
}

function formatGameTime(time: RuntimeState['time']): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function EmptySection() {
  return <p className="police-panel-empty">暂无可靠记录。</p>;
}

function structurePersonName(state: RuntimeState, node: OrganizationStructureNode): string {
  if (node.personName && node.personName !== '未知') return node.personName;
  if (node.actorId) return actorName(state, node.actorId);
  return '未知';
}

function SocietyStructureNode({
  node,
  state,
  depth
}: {
  node: OrganizationStructureNode;
  state: RuntimeState;
  depth: number;
}) {
  const children = node.children ?? [];

  return (
    <li>
      <article className="gray-network-structure-node" style={{ '--tree-depth': depth } as CSSProperties}>
        <div className="gray-network-structure-node-heading">
          <strong>{node.label}</strong>
          <span>{node.role}</span>
        </div>
        <dl>
          <div>
            <dt>人员</dt>
            <dd>{structurePersonName(state, node)}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{node.status ?? '未知'}</dd>
          </div>
          <div>
            <dt>可信度</dt>
            <dd>{confidenceText(node.confidence)}</dd>
          </div>
        </dl>
        {node.summary ? <p>{node.summary}</p> : null}
      </article>
      {children.length ? (
        <ol className="gray-network-structure-children">
          {children.map((child) => (
            <SocietyStructureNode key={child.nodeId} node={child} state={state} depth={depth + 1} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function SocietyStructureTree({ society, state }: { society: Organization; state: RuntimeState }) {
  const nodes = society.structureTree ?? [];

  return (
    <details className="gray-network-structure-card" aria-label={`${society.name}组织架构`}>
      <summary>
        <strong>组织架构</strong>
        <span>展开查看</span>
      </summary>
      <div className="gray-network-structure-content">
        {nodes.length ? (
          <ol className="gray-network-structure-tree">
            {nodes.map((node) => (
              <SocietyStructureNode key={node.nodeId} node={node} state={state} depth={0} />
            ))}
          </ol>
        ) : (
          <p className="police-panel-empty">暂无可靠架构记录。</p>
        )}
      </div>
    </details>
  );
}

function isVisibleSociety(organization: Organization): boolean {
  return organization.type === 'triad' && organization.visibility !== 'hidden';
}

function societySort(left: Organization, right: Organization): number {
  return right.importance - left.importance || left.name.localeCompare(right.name);
}

function mentionsSociety(society: Organization, ...values: Array<string | undefined>): boolean {
  return values.some((value) => Boolean(value && value.includes(society.name)));
}

function referencesAny(values: string[], references: Set<string>, ignoredValue?: string): boolean {
  return values.some((value) => value !== ignoredValue && references.has(value));
}

export function GrayNetworkPanelModal({ state, onClose, onDraftPlayerAction }: GrayNetworkPanelModalProps) {
  const projection = projectGrayNetworkContext(state);
  const societies = useMemo(() => Object.values(state.organizations).filter(isVisibleSociety).sort(societySort), [state.organizations]);
  const [selectedSocietyId, setSelectedSocietyId] = useState<string | undefined>();
  const selectedSociety = societies.find((item) => item.organizationId === selectedSocietyId) ?? societies[0];
  const selectedSocietyDynamic = useMemo(() => {
    if (!selectedSociety) {
      return {
        matters: [],
        signals: [],
        tracks: [],
        evolutionTrack: undefined,
        outcomes: [],
        chronicle: [],
        knownOrganizations: [],
        people: [],
        places: [],
        clues: [],
        risks: [],
        actions: []
      };
    }

    const organizationId = selectedSociety.organizationId;
    const knownOrganizations = projection.knownOrganizations.filter(
      (item) =>
        item.organizationId === organizationId ||
        mentionsSociety(selectedSociety, item.visibleName, item.name, item.summary, item.knownScope)
    );
    const places = projection.keyPlaces.filter(
      (item) =>
        item.relatedOrganizationIds.includes(organizationId) ||
        selectedSociety.relatedPlaceIds.includes(item.placeId) ||
        mentionsSociety(selectedSociety, item.visibleRole, item.tieSummary, item.riskSummary)
    );
    const people = projection.relatedPeople.filter(
      (item) =>
        item.relatedOrganizationIds.includes(organizationId) ||
        selectedSociety.relatedActorIds.includes(item.actorId) ||
        mentionsSociety(selectedSociety, item.visibleRole, item.knownTieSummary, item.attitudeToPlayer, item.riskNote)
    );
    const clues = projection.relationClues.filter(
      (item) => item.relatedOrganizationIds.includes(organizationId) || mentionsSociety(selectedSociety, item.summary)
    );
    const relatedPlaceIds = new Set<string>([
      ...selectedSociety.relatedPlaceIds,
      ...knownOrganizations.flatMap((item) => item.relatedPlaceIds),
      ...places.map((item) => item.placeId),
      ...people.flatMap((item) => item.relatedPlaceIds),
      ...clues.flatMap((item) => item.relatedPlaceIds)
    ]);
    const relatedActorIds = new Set<string>([
      ...selectedSociety.relatedActorIds,
      ...knownOrganizations.flatMap((item) => item.relatedActorIds),
      ...places.flatMap((item) => item.relatedActorIds),
      ...people.map((item) => item.actorId),
      ...clues.flatMap((item) => item.relatedActorIds)
    ]);

    return {
      matters: Object.values(state.dynamicEvents.currentMatters).filter((item) => item.relatedOrganizationIds.includes(organizationId)),
      signals: Object.values(state.dynamicEvents.signals).filter(
        (item) => item.relatedOrganizationIds.includes(organizationId) && item.status !== 'archived'
      ),
      tracks: Object.values(state.citySituationTracks).filter(
        (item) => item.relatedOrganizationIds.includes(organizationId) && item.status !== 'resolved'
      ),
      evolutionTrack: Object.values(state.backgroundEvolution.organizationTracks).find(
        (item) =>
          item.organizationId === organizationId &&
          item.visibility !== 'hidden' &&
          (item.status === 'planned' || item.status === 'active' || item.status === 'blocked')
      ),
      outcomes: [...state.backgroundEvolution.recentOutcomes]
        .filter(
          (item) =>
            item.visibility !== 'hidden' &&
            ((item.sourceKind === 'organization' && item.sourceId === organizationId) ||
              item.relatedOrganizationIds.includes(organizationId))
        )
        .sort((left, right) => formatGameTime(right.occurredAt).localeCompare(formatGameTime(left.occurredAt)))
        .slice(0, 3),
      chronicle: [...state.backgroundEvolution.chronicle]
        .filter((item) => item.visibility !== 'hidden' && item.relatedOrganizationIds.includes(organizationId))
        .sort((left, right) => formatGameTime(right.occurredAt).localeCompare(formatGameTime(left.occurredAt)))
        .slice(0, 2),
      knownOrganizations,
      people,
      places,
      clues,
      risks: projection.actionRisks.filter(
        (item) =>
          referencesAny(item.relatedPlaceIds, relatedPlaceIds) || referencesAny(item.relatedActorIds, relatedActorIds, state.player.actorId)
      ),
      actions: projection.suggestedActions.filter(
        (item) =>
          referencesAny(item.relatedPlaceIds, relatedPlaceIds) || referencesAny(item.relatedActorIds, relatedActorIds, state.player.actorId)
      )
    };
  }, [projection, selectedSociety, state.backgroundEvolution, state.citySituationTracks, state.dynamicEvents, state.player.actorId]);

  function handleDraftAction(text: string) {
    onDraftPlayerAction(text);
    onClose();
  }

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="police-panel-modal police-panel-modal--gray feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="社团"
      >
        <header className="character-archive-header">
          <div>
            <h2>社团</h2>
            <p>Gray Network</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="character-archive-stats police-panel-stats police-panel-stats--gray" aria-label="社团概览">
          <span>
            当前位置 <strong>{currentPlaceName(state)}</strong>
          </span>
          <span>
            当前身份 <strong>{displayIdentity(projection.perspective)}</strong>
          </span>
          <span>
            可见记录{' '}
            <strong>
              {projection.knownOrganizations.length +
                projection.keyPlaces.length +
                projection.relatedPeople.length +
                projection.relationClues.length}
            </strong>
          </span>
          <span>
            大社团 <strong>{societies.length}</strong>
          </span>
        </div>

        <div className="police-panel-body police-panel-body--gray">
          <section className="police-panel-card police-panel-card--wide police-panel-card--society">
            <h3>社团档案</h3>
            {societies.length ? (
              <div className="gray-network-society-layout">
                <div className="gray-network-society-tabs" aria-label="大社团">
                  {societies.map((society) => (
                    <button
                      key={society.organizationId}
                      type="button"
                      className={society.organizationId === selectedSociety?.organizationId ? 'is-active' : undefined}
                      onClick={() => setSelectedSocietyId(society.organizationId)}
                    >
                      <strong>{society.name}</strong>
                      <span>{society.currentState}</span>
                    </button>
                  ))}
                </div>

                {selectedSociety ? (
                  <div className="gray-network-society-detail" role="region" aria-label={`${selectedSociety.name}社团面板`}>
                    <header>
                      <h4>{selectedSociety.name}</h4>
                      <span>街面公开可知</span>
                    </header>
                    <SocietyStructureTree society={selectedSociety} state={state} />
                    <dl className="police-panel-data-grid">
                      <div>
                        <dt>公开认知</dt>
                        <dd>{selectedSociety.publicKnowledge}</dd>
                      </div>
                      <div>
                        <dt>玩家态度</dt>
                        <dd>{selectedSociety.stanceTowardPlayer}</dd>
                      </div>
                      <div>
                        <dt>当前状态</dt>
                        <dd>{selectedSociety.currentState}</dd>
                      </div>
                      <div>
                        <dt>行动压力</dt>
                        <dd>{selectedSociety.pressureSummary}</dd>
                      </div>
                    </dl>

                    <div className="gray-network-society-dynamics gray-network-society-dynamics--full">
                      <section className="gray-network-society-evolution">
                        <h5>社团演化</h5>
                        {selectedSocietyDynamic.evolutionTrack ||
                        selectedSocietyDynamic.outcomes.length ||
                        selectedSocietyDynamic.chronicle.length ? (
                          <>
                            {selectedSocietyDynamic.evolutionTrack ? (
                              <article className="is-active-evolution">
                                <strong>{selectedSocietyDynamic.evolutionTrack.currentAction}</strong>
                                <span>
                                  {selectedSocietyDynamic.evolutionTrack.status === 'blocked'
                                    ? '当前受阻'
                                    : selectedSocietyDynamic.evolutionTrack.status === 'planned'
                                      ? '正在筹备'
                                      : '正在进行'}
                                </span>
                                {selectedSocietyDynamic.evolutionTrack.currentStatus ? (
                                  <p>{selectedSocietyDynamic.evolutionTrack.currentStatus}</p>
                                ) : null}
                                <p>
                                  {selectedSocietyDynamic.evolutionTrack.startedAt
                                    ? `开始 ${formatGameTime(selectedSocietyDynamic.evolutionTrack.startedAt)} · `
                                    : ''}
                                  {selectedSocietyDynamic.evolutionTrack.expectedEndAt
                                    ? `预计结束 ${formatGameTime(selectedSocietyDynamic.evolutionTrack.expectedEndAt)} · `
                                    : ''}
                                  复核 {formatGameTime(selectedSocietyDynamic.evolutionTrack.nextReviewAt)}
                                </p>
                              </article>
                            ) : null}
                            {selectedSocietyDynamic.outcomes.map((item) => (
                              <article key={item.outcomeId}>
                                <strong>{item.title}</strong>
                                <span>近期结算 · {formatGameTime(item.occurredAt)}</span>
                                <p>{item.summary}</p>
                              </article>
                            ))}
                            {selectedSocietyDynamic.chronicle.map((item) => (
                              <article key={item.entryId}>
                                <strong>{item.title}</strong>
                                <span>长期史册 · {formatGameTime(item.occurredAt)}</span>
                                <p>{item.summary}</p>
                                <p>{item.longTermImpact}</p>
                              </article>
                            ))}
                          </>
                        ) : (
                          <p className="police-panel-empty">该社团尚未形成可见的后台行动。</p>
                        )}
                      </section>

                      <section>
                        <h5>社团动态</h5>
                        {selectedSocietyDynamic.matters.length ||
                        selectedSocietyDynamic.signals.length ||
                        selectedSocietyDynamic.tracks.length ||
                        selectedSocietyDynamic.knownOrganizations.length ? (
                          <>
                            {selectedSocietyDynamic.matters.map((item) => (
                              <article key={item.id}>
                                <strong>{item.title}</strong>
                                <p>{item.summary}</p>
                              </article>
                            ))}
                            {selectedSocietyDynamic.signals.map((item) => (
                              <article key={item.id}>
                                <strong>{item.title}</strong>
                                <p>{item.summary}</p>
                              </article>
                            ))}
                            {selectedSocietyDynamic.tracks.map((item) => (
                              <article key={item.trackId}>
                                <strong>{item.title}</strong>
                                <p>{item.currentBeat}</p>
                              </article>
                            ))}
                            {selectedSocietyDynamic.knownOrganizations.map((item) => (
                              <article key={item.organizationId ?? item.visibleName}>
                                <strong>{item.visibleName}</strong>
                                <span>可信度 {confidenceText(item.confidence)}</span>
                                <p>{item.summary}</p>
                                <p>{item.knownScope}</p>
                              </article>
                            ))}
                          </>
                        ) : (
                          <p className="police-panel-empty">暂无属于该社团的动态记录。</p>
                        )}
                      </section>

                      <section>
                        <h5>人物与场所</h5>
                        {selectedSocietyDynamic.people.length || selectedSocietyDynamic.places.length ? (
                          <>
                            {selectedSocietyDynamic.people.map((item) => (
                              <article key={item.actorId}>
                                <strong>{actorName(state, item.actorId)}</strong>
                                <span>{item.visibleRole}</span>
                                <p>{item.knownTieSummary}</p>
                                {item.attitudeToPlayer ? <p>{item.attitudeToPlayer}</p> : null}
                              </article>
                            ))}
                            {selectedSocietyDynamic.places.map((item) => (
                              <article key={item.placeId}>
                                <strong>{placeName(state, item.placeId)}</strong>
                                <span>{item.visibleRole}</span>
                                <p>{item.tieSummary}</p>
                                <p>{item.riskSummary}</p>
                              </article>
                            ))}
                          </>
                        ) : (
                          <p className="police-panel-empty">暂无属于该社团的人物或场所记录。</p>
                        )}
                      </section>

                      <section>
                        <h5>关系线索</h5>
                        {selectedSocietyDynamic.clues.length ? (
                          <>
                            {selectedSocietyDynamic.clues.map((item) => (
                              <article key={item.clueId}>
                                <strong>{certaintyText(item.certainty)}</strong>
                                <span>可信度 {confidenceText(item.confidence)}</span>
                                <p>{item.summary}</p>
                              </article>
                            ))}
                          </>
                        ) : (
                          <p className="police-panel-empty">暂无属于该社团的关系线索。</p>
                        )}
                      </section>

                      <section>
                        <h5>风险与可行动</h5>
                        {selectedSocietyDynamic.risks.length || selectedSocietyDynamic.actions.length ? (
                          <>
                            {selectedSocietyDynamic.risks.map((item) => (
                              <article key={item.riskId}>
                                <strong>{item.title}</strong>
                                <span>{riskLevelText(item.level)}</span>
                                <p>{item.summary}</p>
                                {item.suggestedMitigation ? <p>{item.suggestedMitigation}</p> : null}
                              </article>
                            ))}
                            {selectedSocietyDynamic.actions.length ? (
                              <div className="police-panel-action-grid">
                                {selectedSocietyDynamic.actions.map((item) => (
                                  <button key={item.actionId} type="button" onClick={() => handleDraftAction(item.text)}>
                                    {item.text}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <p className="police-panel-empty">暂无属于该社团的风险或行动提示。</p>
                        )}
                      </section>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptySection />
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
