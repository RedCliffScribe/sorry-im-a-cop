import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  createCityPowerInstitutionView,
  type CityPowerInstitutionViewRecord
} from '../../domain/cityPower/cityPowerDatabaseView';
import type { Actor, ActorOrganizationRelation, OrganizationType, RuntimeState } from '../../domain/runtime/types';

interface SocialInstitutionPanelModalProps {
  state: RuntimeState;
  onClose: () => void;
}

type InstitutionFilter = 'all' | 'government' | 'icac' | 'legal' | 'media' | 'entertainment' | 'business' | 'community';

const institutionFilters: Array<{ key: InstitutionFilter; label: string; types?: string[] }> = [
  { key: 'all', label: '全部' },
  { key: 'government', label: '政府', types: ['government'] },
  { key: 'icac', label: '廉政公署', types: ['icac'] },
  { key: 'legal', label: '法律', types: ['legal', 'court'] },
  { key: 'media', label: '媒体', types: ['media'] },
  { key: 'entertainment', label: '娱乐', types: ['entertainment'] },
  { key: 'business', label: '商业', types: ['business', 'finance', 'property'] },
  { key: 'community', label: '社区', types: ['community'] }
];

const typeLabels: Record<OrganizationType | string, string> = {
  police_force: '警队',
  government: '政府',
  icac: '廉政公署',
  legal: '法律',
  court: '法院',
  media: '媒体',
  entertainment: '娱乐',
  business: '商业',
  finance: '金融',
  property: '地产',
  public_service: '公共服务',
  community: '社区',
  family: '家庭',
  other: '其他'
};

const relationLabels: Record<string, string> = {
  employee: '任职',
  officer: '职员',
  member: '成员',
  owner: '负责人',
  manager: '管理者',
  contractor: '合作方',
  informal_contact: '非正式接触',
  family_tie: '家族关系',
  target: '关注对象',
  source: '消息来源',
  other: '相关'
};

function actorDisplayName(actor: Actor): string {
  return actor.englishName ? `${actor.name} / ${actor.englishName}` : actor.name;
}

function formatRelation(relation: ActorOrganizationRelation): string {
  const type = relationLabels[relation.relationType] ?? relation.relationType;
  return [type, relation.roleTitle, relation.departmentOrUnit].filter(Boolean).join(' / ');
}

function sourceLabel(source: CityPowerInstitutionViewRecord['source']): string {
  return source === 'anchor' ? '公开资料' : '已知机构';
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter((item) => item.trim().length > 0))];
}

function formatGameTime(time: RuntimeState['time']): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function getVisibleRelations(actor: Actor, organizationId: string): ActorOrganizationRelation[] {
  return actor.organizationRelations.filter(
    (relation) => relation.organizationId === organizationId && relation.visibility !== 'hidden'
  );
}

function getRelatedActors(
  state: RuntimeState,
  organization: CityPowerInstitutionViewRecord
): Array<{ actor: Actor; relation?: ActorOrganizationRelation }> {
  const actorsFromOrganization = organization.relatedActorIds
    .map((actorId) => state.actors[actorId])
    .filter((actor): actor is Actor => Boolean(actor) && actor.visibility !== 'hidden');
  const actorsFromRelations = Object.values(state.actors).filter((actor) => {
    if (actor.visibility === 'hidden') return false;
    return getVisibleRelations(actor, organization.id).length > 0;
  });
  const byId = new Map<string, Actor>();
  [...actorsFromOrganization, ...actorsFromRelations].forEach((actor) => byId.set(actor.actorId, actor));
  return [...byId.values()].map((actor) => ({
    actor,
    relation: getVisibleRelations(actor, organization.id)[0]
  }));
}

function getRelatedPlaceNames(state: RuntimeState, organization: CityPowerInstitutionViewRecord): string[] {
  const placeIds = uniqueStrings([
    ...organization.relatedPlaceIds,
    ...Object.values(state.places)
      .filter((place) => place.owningOrganizationId === organization.id)
      .map((place) => place.placeId)
  ]);
  return placeIds.map((placeId) => state.places[placeId]?.nameZh ?? state.places[placeId]?.name ?? '').filter(Boolean);
}

function getRelatedCaseNames(state: RuntimeState, organization: CityPowerInstitutionViewRecord): string[] {
  if (organization.playerRelationScope === 'hidden') return [];
  const caseIds = uniqueStrings([
    ...organization.relatedCaseIds,
    ...Object.values(state.cases)
      .filter((caseFile) => caseFile.visibility !== 'hidden' && caseFile.relatedOrganizationIds.includes(organization.id))
      .map((caseFile) => caseFile.caseId)
  ]);
  return caseIds.map((caseId) => state.cases[caseId]?.title ?? '').filter(Boolean);
}

function filterOrganization(organization: CityPowerInstitutionViewRecord, activeFilter: InstitutionFilter): boolean {
  if (activeFilter === 'all') return true;
  const filter = institutionFilters.find((item) => item.key === activeFilter);
  return Boolean(filter?.types?.includes(organization.type));
}

function EmptyValue({ children = '暂无记录。' }: { children?: string }) {
  return <p className="institution-empty">{children}</p>;
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="institution-detail-block">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

export function SocialInstitutionPanelModal({ state, onClose }: SocialInstitutionPanelModalProps) {
  const [activeFilter, setActiveFilter] = useState<InstitutionFilter>('all');
  const playerActor = state.actors[state.player.actorId];
  const visibleOrganizations = useMemo(
    () =>
      createCityPowerInstitutionView(state.organizations, state.player.currentIdentity, undefined, {
        actorId: state.player.actorId,
        organizationRelations: playerActor?.organizationRelations ?? []
      }),
    [playerActor?.organizationRelations, state.organizations, state.player.actorId, state.player.currentIdentity]
  );
  const filteredOrganizations = visibleOrganizations.filter((organization) => filterOrganization(organization, activeFilter));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedOrganization = filteredOrganizations.find((organization) => organization.id === selectedId) ?? filteredOrganizations[0] ?? null;

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="institution-panel-modal institution-panel-modal--polished feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="机构"
      >
        <header className="character-archive-header">
          <div>
            <h2>机构</h2>
            <p>Social Institution</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="character-archive-stats institution-panel-stats" aria-label="机构统计">
          <span>
            已知机构 <strong>{visibleOrganizations.length}</strong>
          </span>
          <span>
            当前显示 <strong>{filteredOrganizations.length}</strong>
          </span>
          <span>
            当前分类 <strong>{institutionFilters.find((item) => item.key === activeFilter)?.label ?? '全部'}</strong>
          </span>
        </div>

        {visibleOrganizations.length === 0 ? (
          <div className="institution-empty-state">暂无已知机构</div>
        ) : (
          <div className="institution-panel-body">
            <aside className="institution-filter-list" aria-label="机构分类">
              {institutionFilters.map((filter) => {
                const count =
                  filter.key === 'all'
                    ? visibleOrganizations.length
                    : visibleOrganizations.filter((organization) => filter.types?.includes(organization.type)).length;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    className={activeFilter === filter.key ? 'active' : ''}
                    onClick={() => {
                      setActiveFilter(filter.key);
                      setSelectedId(null);
                    }}
                  >
                    <span>{filter.label}</span>
                    <strong>{count}</strong>
                  </button>
                );
              })}
            </aside>

            <section className="institution-content" aria-label="机构详情">
              {filteredOrganizations.length === 0 ? (
                <div className="institution-empty-state">暂无已知机构</div>
              ) : (
                <>
                  <div className="institution-list" aria-label="机构列表">
                    {filteredOrganizations.map((organization) => (
                      <button
                        key={organization.id}
                        type="button"
                        className={selectedOrganization?.id === organization.id ? 'active' : ''}
                        onClick={() => setSelectedId(organization.id)}
                      >
                        <strong>{organization.name}</strong>
                        <span>{typeLabels[organization.type] ?? organization.type}</span>
                        <em>{sourceLabel(organization.source)}</em>
                        <small>{organization.currentState}</small>
                      </button>
                    ))}
                  </div>

                  {selectedOrganization ? (
                    <InstitutionDetail state={state} organization={selectedOrganization} />
                  ) : null}
                </>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function InstitutionDetail({ state, organization }: { state: RuntimeState; organization: CityPowerInstitutionViewRecord }) {
  const relatedActors = getRelatedActors(state, organization);
  const relatedPlaces = getRelatedPlaceNames(state, organization);
  const relatedCases = getRelatedCaseNames(state, organization);
  const organizationTrack = Object.values(state.backgroundEvolution.organizationTracks).find(
    (track) =>
      track.organizationId === organization.id &&
      track.visibility !== 'hidden' &&
      !(organization.playerRelationScope === 'hidden' && track.relatedActorIds.includes(state.player.actorId)) &&
      (track.status === 'planned' || track.status === 'active' || track.status === 'blocked')
  );
  const recentOrganizationOutcomes = [...state.backgroundEvolution.recentOutcomes]
    .filter(
      (outcome) =>
        outcome.visibility !== 'hidden' &&
        !(organization.playerRelationScope === 'hidden' && outcome.relatedActorIds.includes(state.player.actorId)) &&
        ((outcome.sourceKind === 'organization' && outcome.sourceId === organization.id) ||
          outcome.relatedOrganizationIds.includes(organization.id))
    )
    .sort((left, right) => formatGameTime(right.occurredAt).localeCompare(formatGameTime(left.occurredAt)))
    .slice(0, 3);

  return (
    <article className="institution-detail-card">
      <header>
        <div>
          <h3>{organization.name}</h3>
          <span>{typeLabels[organization.type] ?? organization.type}</span>
          <span>{sourceLabel(organization.source)}</span>
        </div>
      </header>

      <DetailBlock title="简介">
        <p>{organization.summary}</p>
      </DetailBlock>

      <DetailBlock title="公众认知">
        <p>{organization.publicKnowledge}</p>
      </DetailBlock>

      <div className="institution-two-column">
        <DetailBlock title="当前状态">
          <p>{organization.currentState}</p>
        </DetailBlock>
        <DetailBlock title="对玩家态度">
          <p>{organization.stanceTowardPlayer}</p>
        </DetailBlock>
      </div>

      <DetailBlock title="压力摘要">
        <p>{organization.pressureSummary}</p>
      </DetailBlock>

      {organizationTrack || recentOrganizationOutcomes.length ? (
        <DetailBlock title="机构动态">
          <div className="institution-evolution-stack">
            {organizationTrack ? (
              <article className="institution-evolution-card institution-evolution-card--active">
                <header>
                  <strong>{organizationTrack.currentAction}</strong>
                  <span>{organizationTrack.status === 'blocked' ? '受阻' : organizationTrack.status === 'planned' ? '筹备中' : '进行中'}</span>
                </header>
                {organizationTrack.currentStatus ? <p>{organizationTrack.currentStatus}</p> : null}
                <small>
                  {organizationTrack.startedAt ? `开始 ${formatGameTime(organizationTrack.startedAt)} · ` : ''}
                  {organizationTrack.expectedEndAt ? `预计结束 ${formatGameTime(organizationTrack.expectedEndAt)} · ` : ''}
                  复核 {formatGameTime(organizationTrack.nextReviewAt)}
                </small>
              </article>
            ) : null}
            {recentOrganizationOutcomes.map((outcome) => (
              <article key={outcome.outcomeId} className="institution-evolution-card">
                <header>
                  <strong>{outcome.title}</strong>
                  <span>近期结算</span>
                </header>
                <p>{outcome.summary}</p>
                <small>{formatGameTime(outcome.occurredAt)}</small>
              </article>
            ))}
          </div>
        </DetailBlock>
      ) : null}

      <div className="institution-two-column">
        <DetailBlock title="相关人物">
          {relatedActors.length > 0 ? (
            <ul>
              {relatedActors.map(({ actor, relation }) => (
                <li key={actor.actorId}>
                  <strong>{actorDisplayName(actor)}</strong>
                  {relation ? <span>{formatRelation(relation)}</span> : null}
                  {relation?.summary ? <small>{relation.summary}</small> : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyValue />
          )}
        </DetailBlock>

        <DetailBlock title="相关地点">
          {relatedPlaces.length > 0 ? (
            <ul>
              {relatedPlaces.map((placeName) => (
                <li key={placeName}>{placeName}</li>
              ))}
            </ul>
          ) : (
            <EmptyValue />
          )}
        </DetailBlock>
      </div>

      <DetailBlock title="相关案件">
        {relatedCases.length > 0 ? (
          <ul>
            {relatedCases.map((caseName) => (
              <li key={caseName}>{caseName}</li>
            ))}
          </ul>
        ) : (
          <EmptyValue />
        )}
      </DetailBlock>
    </article>
  );
}
