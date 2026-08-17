import { useMemo } from 'react';
import {
  projectLivelihoodContext,
  type LivelihoodRelationView
} from '../../domain/livelihood/livelihoodProjector';
import type {
  CurrentMatter,
  EvolutionOutcomeRecord,
  RuntimeState
} from '../../domain/runtime/types';

interface LivelihoodPanelModalProps {
  state: RuntimeState;
  onClose: () => void;
  onDraftPlayerAction: (text: string) => void;
  onOpenInstitution?: (organizationId: string) => void;
}

const employmentLabels: Record<string, string> = {
  employed: '正式受雇',
  self_employed: '自营',
  freelance: '自由职业',
  casual_worker: '散工或临时工作',
  unemployed: '暂时无业'
};

const relationLabels: Record<string, string> = {
  employee: '同一雇主',
  officer: '工作联系人',
  owner: '经营负责人',
  manager: '安排工作的人',
  contractor: '合作方',
  informal_contact: '非正式工作联系',
  source: '消息来源',
  other: '职业关系'
};

function formatGameTime(time: RuntimeState['time']): string {
  return `${time.year}年${time.month}月${time.day}日 ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function relationHeading(relation: LivelihoodRelationView): string {
  return [
    relation.roleTitle,
    relation.departmentOrUnit,
    relation.relationType ? relationLabels[relation.relationType] ?? relation.relationType : undefined
  ]
    .filter(Boolean)
    .join(' · ');
}

function matterStatus(matter: CurrentMatter): string {
  if (matter.status === 'dormant') return '暂缓';
  if (matter.responseWindow === 'today') return '今日';
  if (matter.responseWindow === 'soon') return '近期';
  if (matter.responseWindow === 'open') return '开放';
  return '处理中';
}

function outcomeSummary(outcome: EvolutionOutcomeRecord): string {
  return outcome.consequence || outcome.summary;
}

function EmptyValue({ children = '尚未形成可靠资料。' }: { children?: string }) {
  return <p className="livelihood-empty">{children}</p>;
}

export function LivelihoodPanelModal({
  state,
  onClose,
  onDraftPlayerAction,
  onOpenInstitution
}: LivelihoodPanelModalProps) {
  const projection = useMemo(() => projectLivelihoodContext(state), [state]);
  const profile = projection.roleProfile;
  const workSchedule = projection.workSchedule;
  const incomeItems = Object.values(state.finance.cashflows).filter(
    (item) =>
      item.status === 'active' &&
      item.direction === 'income' &&
      (item.identityBinding === 'civilian' || item.relatedActorIds.includes(state.player.actorId))
  );
  const primaryIncome = incomeItems[0];

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="livelihood-panel-modal feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="职业与营生"
      >
        <header className="character-archive-header livelihood-panel-header">
          <div>
            <h2>职业与营生</h2>
            <p>Livelihood</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        {!projection.available || !profile ? (
          <div className="livelihood-panel-empty-state">
            <strong>尚未形成营生资料</strong>
            <p>{projection.livelihoodSummary}</p>
          </div>
        ) : (
          <div className="livelihood-panel-scroll">
            <section className="livelihood-overview" aria-label="当前营生">
              <header>
                <div>
                  <span>当前营生</span>
                  <h3>{profile.publicOccupation || '普通市民'}</h3>
                </div>
                <em>
                  {employmentLabels[profile.employmentStatusId ?? ''] ?? profile.employmentStatusId ?? '状态待确认'}
                  {' · '}
                  {workSchedule.label}
                </em>
              </header>
              <dl>
                <div>
                  <dt>工作地点</dt>
                  <dd>{projection.workplaceName || '地点尚未确认'}</dd>
                </div>
                <div>
                  <dt>雇主或经营主体</dt>
                  <dd>{projection.primaryOrganization?.name || (profile.employmentStatusId === 'unemployed' ? '目前没有固定雇主' : '尚未确认')}</dd>
                </div>
                <div>
                  <dt>所在单位</dt>
                  <dd>{profile.workUnitSummary || profile.positionSummary || '尚未细分科室、班组或门店'}</dd>
                </div>
                <div>
                  <dt>收入性质</dt>
                  <dd>{primaryIncome?.summary || primaryIncome?.title || profile.familyEconomicSummary || '收入状况尚未进一步确认'}</dd>
                </div>
                <div>
                  <dt>上班安排</dt>
                  <dd>{workSchedule.scheduleLabel} · {workSchedule.scheduleWindow}</dd>
                </div>
                <div>
                  <dt>当前时段</dt>
                  <dd>{workSchedule.currentWorkSummary}</dd>
                </div>
                <div>
                  <dt>下次上班</dt>
                  <dd>{workSchedule.nextWorkSummary}</dd>
                </div>
                <div>
                  <dt>每周规律</dt>
                  <dd>{workSchedule.weeklyPatternSummary}</dd>
                </div>
              </dl>
              {projection.primaryOrganization && onOpenInstitution ? (
                <button
                  className="livelihood-link-button"
                  type="button"
                  onClick={() => onOpenInstitution(projection.primaryOrganization!.organizationId)}
                >
                  查看供职机构
                </button>
              ) : null}
            </section>

            <div className="livelihood-panel-grid">
              <section className="livelihood-card livelihood-card--position" aria-label="你在这里的位置">
                <header>
                  <span>01</span>
                  <h3>你在这里的位置</h3>
                </header>
                <dl>
                  <div>
                    <dt>日常分工</dt>
                    <dd>{profile.dutySummary || profile.positionSummary || '具体分工尚未确认。'}</dd>
                  </div>
                  <div>
                    <dt>可以自行决定</dt>
                    <dd>{profile.decisionScopeSummary || '只能在已确认的职业职责范围内自行处理。'}</dd>
                  </div>
                  <div>
                    <dt>接触范围</dt>
                    <dd>{profile.accessSummary || '目前只接触日常工作直接涉及的人和资料。'}</dd>
                  </div>
                  <div>
                    <dt>职业边界</dt>
                    <dd>{profile.legalStatusSummary || '普通市民身份不产生额外公权力。'}</dd>
                  </div>
                </dl>
              </section>

              <section className="livelihood-card" aria-label="工作关系">
                <header>
                  <span>02</span>
                  <h3>工作关系</h3>
                </header>
                {projection.workRelations.length ? (
                  <div className="livelihood-relation-list">
                    {projection.workRelations.map((relation) => (
                      <article key={relation.actorId}>
                        <strong>{relation.name}</strong>
                        <span>{relationHeading(relation) || relation.publicIdentity}</span>
                        <p>{relation.summary}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyValue>尚未形成稳定工作关系。</EmptyValue>
                )}
              </section>

              <section className="livelihood-card livelihood-card--direction" aria-label="眼下方向">
                <header>
                  <span>03</span>
                  <h3>眼下方向</h3>
                </header>
                {projection.primaryOrganizationTrack ? (
                  <>
                    <strong className="livelihood-direction-title">
                      {projection.primaryOrganizationTrack.objective ||
                        projection.primaryOrganizationTrack.currentAction ||
                        '机构方向正在形成'}
                    </strong>
                    {projection.primaryOrganizationTrack.currentAction ? (
                      <p>{projection.primaryOrganizationTrack.currentAction}</p>
                    ) : null}
                    {projection.primaryOrganizationTrack.currentStatus ? (
                      <small>{projection.primaryOrganizationTrack.currentStatus}</small>
                    ) : null}
                  </>
                ) : (
                  <EmptyValue>
                    {projection.primaryOrganization
                      ? '供职机构尚未形成与你相关的明确方向。'
                      : profile.employmentStatusId === 'unemployed'
                        ? '当前重点是维持生活并寻找合适的收入来源。'
                        : '当前经营方向尚未确认。'}
                  </EmptyValue>
                )}
              </section>

              <section className="livelihood-card livelihood-card--matters" aria-label="手头事务">
                <header>
                  <span>04</span>
                  <h3>手头事务</h3>
                </header>
                {projection.activeMatters.length ? (
                  <div className="livelihood-matter-list">
                    {projection.activeMatters.map((matter) => (
                      <article key={matter.id}>
                        <header>
                          <strong>{matter.title}</strong>
                          <span>{matterStatus(matter)}</span>
                        </header>
                        <p>{matter.summary}</p>
                        {matter.currentHook ? <small>当前情况：{matter.currentHook}</small> : null}
                        {matter.consequenceHint ? <small>自然后果：{matter.consequenceHint}</small> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyValue>当前没有具体落到你手上的职业事务。</EmptyValue>
                )}
              </section>

              <section className="livelihood-card" aria-label="近期动向">
                <header>
                  <span>05</span>
                  <h3>近期动向</h3>
                </header>
                {projection.recentOutcomes.length ? (
                  <div className="livelihood-outcome-list">
                    {projection.recentOutcomes.map((outcome) => (
                      <article key={outcome.outcomeId}>
                        <strong>{outcome.title}</strong>
                        <p>{outcomeSummary(outcome)}</p>
                        <small>{formatGameTime(outcome.occurredAt)}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyValue>近期尚无已经确认的职业变化。</EmptyValue>
                )}
              </section>

              <section className="livelihood-card livelihood-card--outlook" aria-label="生计与出路">
                <header>
                  <span>06</span>
                  <h3>生计与出路</h3>
                </header>
                <div className="livelihood-outlook-columns">
                  <div>
                    <h4>可能的出路</h4>
                    {projection.opportunitySummaries.length ? (
                      <ul>
                        {projection.opportunitySummaries.map((summary) => (
                          <li key={summary}>{summary}</li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyValue />
                    )}
                  </div>
                  <div>
                    <h4>当前压力</h4>
                    {projection.obstacleSummaries.length ? (
                      <ul>
                        {projection.obstacleSummaries.map((summary) => (
                          <li key={summary}>{summary}</li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyValue />
                    )}
                  </div>
                </div>
              </section>
            </div>

            <section className="livelihood-actions" aria-label="可尝试行动">
              <header>
                <div>
                  <span>行动参考</span>
                  <h3>可尝试行动</h3>
                </div>
                <p>只会填入行动输入框，不会直接执行。</p>
              </header>
              <div>
                {projection.actionHints.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      onDraftPlayerAction(action);
                      onClose();
                    }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
