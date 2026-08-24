import type {
  PoliceCareerRequirementState,
  PoliceCareerVacancyStatus,
  PoliceClimateEntry,
  PolicePostingProgramStage,
  PolicePostingProgramState,
  PolicePromotionProgramStage,
  PolicePromotionProgramState,
  RuntimeState
} from '../../domain/runtime/types';
import { projectPoliceDutyContext } from '../../domain/police/policeDutyContext';
import { resolvePoliceRankDefinition } from '../../domain/police/policeRankCatalog';
import { getPolicePostingRoute } from '../../domain/police/policePromotionRules';
import { formatPoliceAssessmentKey, formatPoliceText } from '../../domain/police/policeTerminology';

interface PolicePanelModalProps {
  state: RuntimeState;
  onClose: () => void;
  onDraftPlayerAction?: (text: string) => void;
}

function formatList(items: string[]) {
  if (items.length === 0) return <p className="police-panel-empty">暂无记录。</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{formatPoliceText(item)}</li>
      ))}
    </ul>
  );
}

function formatClimateLevel(entry: PoliceClimateEntry) {
  const levelLabels: Record<PoliceClimateEntry['level'], string> = {
    low: '低',
    normal: '正常',
    tense: '紧张',
    high: '高压',
    unclear: '未明'
  };
  return levelLabels[entry.level] ?? entry.level;
}

const promotionStageLabels: Record<PolicePromotionProgramStage, string> = {
  not_eligible: '尚未具备资格',
  eligible: '已具备参评资格',
  exam_or_course: '考试或课程进行中',
  awaiting_recommendation: '等待直属上级推荐',
  selection: '晋升遴选中',
  awaiting_vacancy: '等待职位空缺',
  approved_waiting_post: '已获批准，等待任命',
  appointed: '已正式任命'
};

const postingStageLabels: Record<PolicePostingProgramStage, string> = {
  not_selected: '尚未提出调动',
  interested: '已表达调动意向',
  eligible: '已具备调动资格',
  training: '训练中',
  awaiting_vacancy: '等待岗位空缺',
  approved_waiting_report: '已获批准，等待报到',
  effective: '调动已生效'
};

const vacancyLabels: Record<PoliceCareerVacancyStatus, string> = {
  unknown: '空缺未明',
  unavailable: '当前暂无空缺',
  expected: '预计有空缺',
  available: '已有可用空缺',
  allocated: '名额已正式分配'
};

const requirementStatusLabels: Record<PoliceCareerRequirementState['status'], string> = {
  completed: '已完成',
  in_progress: '进行中',
  pending: '待完成',
  blocked: '受阻'
};

const requirementStatusSymbols: Record<PoliceCareerRequirementState['status'], string> = {
  completed: '✓',
  in_progress: '◐',
  pending: '○',
  blocked: '!'
};

const evidenceKindLabels: Record<string, string> = {
  case_activity: '案件工作记录',
  judgement: '本地判定记录',
  matter_progress: '事项进展记录',
  commendation: '嘉奖记录',
  discipline: '纪律记录',
  training: '训练记录',
  course: '课程记录',
  exam: '考试记录',
  supervision: '监督记录',
  leadership: '带队记录',
  supervisor_assessment: '上级评价',
  selection: '遴选记录',
  appointment: '任命记录',
  posting: '调动记录'
};

const postingEvidenceLabels: Record<string, string> = {
  reliable_service: '稳定勤务记录',
  formal_recommendation: '直属上级正式推荐',
  detective_training: '侦缉训练',
  traffic_training: '交通训练',
  road_or_accident_record: '道路或事故处置记录',
  emergency_response: '紧急应变记录',
  qualified_driver: '合资格驾驶记录',
  discipline_clear: '纪律条件',
  physical_discipline_clear: '体能与纪律条件',
  ptu_training_slot: '机动部队训练名额',
  ptu_course_completed: '机动部队课程',
  rotation_arranged: '轮调安排',
  cid_experience: '侦缉经验',
  specialist_case_record: '专业案件记录',
  specialist_selection: '专业遴选',
  report_room_coordination: '报案室协调经验',
  unit_need: '单位人手需要'
};

const departmentLabels: Record<string, string> = {
  uniform: '军装巡逻',
  cid: '刑事侦缉处（CID）',
  traffic: '交通部',
  eu: '冲锋队（EU）',
  ptu: '机动部队（PTU）',
  cid_specialist: '刑事侦缉专业岗位',
  report_room: '报案室岗位'
};

function formatRankCode(rankCode: string): string {
  const rank = resolvePoliceRankDefinition(rankCode);
  return rank ? `${rank.zh}（${rank.abbreviation}）` : formatPoliceText(rankCode);
}

function formatDepartmentCode(departmentCode: string): string {
  return departmentLabels[departmentCode] ?? formatPoliceText(departmentCode);
}

function formatEvidenceRef(ref: string): string {
  const separator = ref.indexOf(':');
  const kind = separator >= 0 ? ref.slice(0, separator) : ref;
  return evidenceKindLabels[kind] ?? '正式记录';
}

function formatPostingEvidenceTag(tag: string): string {
  return postingEvidenceLabels[tag] ?? '其他正式条件';
}

function formatPostingBlockingReason(reason: string): string {
  const missingEvidence = reason.match(/^缺少调动证据：(.+)。$/);
  if (!missingEvidence) return reason;
  const labels = missingEvidence[1]
    .split('、')
    .map((tag) => formatPostingEvidenceTag(tag.trim()))
    .join('、');
  return `尚缺调动条件：${labels}。`;
}

function CareerProgressBar({ label, completed, total }: { label: string; completed: number; total: number }) {
  const safeTotal = Math.max(total, 1);
  const percentage = Math.min(100, Math.round((completed / safeTotal) * 100));
  return (
    <div
      className="police-career-progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={completed}
    >
      <span style={{ width: `${percentage}%` }} />
    </div>
  );
}

function PromotionProgram({ program }: { program: PolicePromotionProgramState }) {
  const completed = program.requirements.filter((item) => item.status === 'completed').length;
  return (
    <article className="police-career-program" aria-label="晋升程序">
      <div className="police-career-program-summary">
        <div>
          <span>目标</span>
          <strong>{formatRankCode(program.targetRankCode)}</strong>
        </div>
        <div>
          <span>阶段</span>
          <strong>{promotionStageLabels[program.processStage]}</strong>
        </div>
        <div>
          <span>条件</span>
          <strong>已完成 {completed} / {program.requirements.length}</strong>
        </div>
      </div>
      <CareerProgressBar
        label="晋升条件完成进度"
        completed={completed}
        total={program.requirements.length}
      />
      <div className="police-career-requirement-scroll" aria-label="晋升条件清单">
        <ul className="police-career-requirement-list">
          {program.requirements.map((requirement) => (
            <li key={requirement.requirementId} data-status={requirement.status}>
              <span
                className="police-career-requirement-status"
                aria-label={requirementStatusLabels[requirement.status]}
                title={requirementStatusLabels[requirement.status]}
              >
                {requirementStatusSymbols[requirement.status]}
              </span>
              <div>
                <strong>{formatPoliceText(requirement.summary)}</strong>
                {requirement.blockingReason && requirement.status !== 'completed' ? (
                  <small>{formatPoliceText(requirement.blockingReason)}</small>
                ) : null}
                {requirement.evidenceRefs.length > 0 ? (
                  <details>
                    <summary>查看依据（{requirement.evidenceRefs.length} 项）</summary>
                    <ul>
                      {requirement.evidenceRefs.map((ref, index) => (
                        <li key={`${ref}-${index}`}>{formatEvidenceRef(ref)}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function PostingProgram({ program }: { program: PolicePostingProgramState }) {
  const route = getPolicePostingRoute(program.routeId, program.worldpackId);
  const requiredTags = route?.requiredEvidenceTags ?? program.completedEvidenceTags;
  const vacancyRequired = route?.vacancyRequired ?? true;
  const completedTags = new Set(program.completedEvidenceTags);
  const vacancyCompleted = ['available', 'allocated'].includes(program.vacancyStatus);
  const completed = requiredTags.filter((tag) => completedTags.has(tag)).length + (vacancyRequired && vacancyCompleted ? 1 : 0);
  const total = requiredTags.length + (vacancyRequired ? 1 : 0);
  const vacancyStatus: PoliceCareerRequirementState['status'] = vacancyCompleted
    ? 'completed'
    : program.vacancyStatus === 'expected'
      ? 'in_progress'
      : program.vacancyStatus === 'unavailable'
        ? 'blocked'
        : 'pending';

  return (
    <article className="police-career-program police-career-program--posting" aria-label="部门调动程序">
      <header>
        <div>
          <span>目标岗位</span>
          <strong>{formatDepartmentCode(program.targetDepartment)}</strong>
        </div>
        <div>
          <span>状态</span>
          <strong>{postingStageLabels[program.processStage]}</strong>
        </div>
        <div>
          <span>条件</span>
          <strong>已完成 {completed} / {total}</strong>
        </div>
      </header>
      <CareerProgressBar label="调动条件完成进度" completed={completed} total={total} />
      <div className="police-career-requirement-scroll police-career-requirement-scroll--posting" aria-label="调动条件清单">
        <ul className="police-career-requirement-list">
          {requiredTags.map((tag) => {
            const status: PoliceCareerRequirementState['status'] = completedTags.has(tag) ? 'completed' : 'pending';
            return (
              <li key={tag} data-status={status}>
                <span className="police-career-requirement-status" aria-label={requirementStatusLabels[status]}>
                  {requirementStatusSymbols[status]}
                </span>
                <div><strong>{formatPostingEvidenceTag(tag)}</strong></div>
              </li>
            );
          })}
          {vacancyRequired ? (
            <li data-status={vacancyStatus}>
              <span className="police-career-requirement-status" aria-label={requirementStatusLabels[vacancyStatus]}>
                {requirementStatusSymbols[vacancyStatus]}
              </span>
              <div><strong>{vacancyLabels[program.vacancyStatus]}</strong></div>
            </li>
          ) : null}
        </ul>
      </div>
      {program.blockingReasons.length > 0 ? (
        <ul className="police-career-blocking-list" aria-label="调动阻碍">
          {program.blockingReasons.map((reason) => (
            <li key={reason}>{formatPostingBlockingReason(reason)}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function PolicePanelModal({ state, onClose, onDraftPlayerAction }: PolicePanelModalProps) {
  const panel = state.policePanel;
  const career = panel.careerPath;
  const assessment = Object.entries(career.dynamicAssessment);
  const actionHints = panel.actionHints.length > 0 ? panel.actionHints : career.suggestedActions;
  const duty = projectPoliceDutyContext({
    time: state.time,
    currentIdentity: state.player.currentIdentity,
    lawIdentity: state.lawIdentity
  });

  function handleDraftAction(actionText: string) {
    onDraftPlayerAction?.(formatPoliceText(actionText));
    onClose();
  }

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="police-panel-modal police-panel-modal--force feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="警队"
      >
        <header className="character-archive-header">
          <div>
            <h2>警队</h2>
            <p>警队档案</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="character-archive-stats police-panel-stats" aria-label="警队概览">
          <span>
            制度 <strong>{formatPoliceText(panel.institutionName)}</strong>
          </span>
          <span>
            当前职级 <strong>{formatPoliceText(career.currentRank)}</strong>
          </span>
          <span>
            当前值班 <strong>{duty.label} · {duty.shiftLabel}</strong>
          </span>
          <span>
            单位 <strong>{formatPoliceText(panel.unitName)}</strong>
          </span>
        </div>

        <div className="police-panel-body police-panel-body--force">
          <section className="police-panel-card police-panel-card--wide police-panel-card--institution">
            <h3>{formatPoliceText(panel.institutionName)}</h3>
            <p>{formatPoliceText(panel.eraSummary)}</p>
            <dl>
              <div>
                <dt>当前链条</dt>
                <dd>{panel.localChain.map((item) => formatPoliceText(item)).join(' / ')}</dd>
              </div>
              <div>
                <dt>单位摘要</dt>
                <dd>{formatPoliceText(panel.unitSummary)}</dd>
              </div>
            </dl>
          </section>

          <section className="police-panel-card police-panel-card--wide police-panel-card--duty">
            <h3>值班安排</h3>
            <strong>{duty.label} · {duty.shiftLabel}</strong>
            <p>{duty.summary}</p>
            <dl>
              <div>
                <dt>本次安排</dt>
                <dd>{duty.currentDutySummary}</dd>
              </div>
              <div>
                <dt>本更时段</dt>
                <dd>{duty.scheduleWindow}</dd>
              </div>
              <div>
                <dt>下一更</dt>
                <dd>{duty.nextDutySummary}</dd>
              </div>
              <div>
                <dt>轮班规则</dt>
                <dd>{duty.rosterSummary}</dd>
              </div>
            </dl>
          </section>

          <section className="police-panel-card police-panel-card--boundary">
            <h3>职级边界</h3>
            <div className="police-panel-columns">
              <div>
                <h4>可以</h4>
                {formatList(panel.rankBoundary.can)}
              </div>
              <div>
                <h4>不能</h4>
                {formatList(panel.rankBoundary.cannot)}
              </div>
              <div>
                <h4>常接触</h4>
                {formatList(panel.rankBoundary.contacts)}
              </div>
            </div>
          </section>

          <section className="police-panel-card police-panel-card--career">
            <h3>晋升路径</h3>
            <p>{formatPoliceText(career.routeSummary)}</p>
            {career.promotionProgress ? (
              <PromotionProgram program={career.promotionProgress} />
            ) : (
              <div className="police-panel-columns">
                <div>
                  <h4>已知要求</h4>
                  {formatList(career.knownRequirements)}
                </div>
                <div>
                  <h4>当前进展</h4>
                  {assessment.length > 0 ? (
                    <dl>
                      {assessment.map(([key, value]) => (
                        <div key={key}>
                          <dt>{formatPoliceAssessmentKey(key)}</dt>
                          <dd>{formatPoliceText(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="police-panel-empty">暂无动态评估。</p>
                  )}
                </div>
              </div>
            )}
            <section className="police-career-posting-section" aria-label="部门调动">
              <h4>部门调动</h4>
              {career.postingProgress ? (
                <PostingProgram program={career.postingProgress} />
              ) : (
                <p className="police-panel-empty">暂无调动申请。调动与正式警衔晋升分开记录。</p>
              )}
            </section>
          </section>

          <section className="police-panel-card police-panel-card--climate">
            <h3>警队气候</h3>
            {panel.climate.length > 0 ? (
              <div className="police-panel-climate-grid">
                {panel.climate.map((entry) => (
                  <article key={entry.key}>
                    <strong>{formatPoliceText(entry.label)}</strong>
                    <span>{formatClimateLevel(entry)}</span>
                    <p>{formatPoliceText(entry.summary)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="police-panel-empty">暂无警队气候变化。</p>
            )}
          </section>

          <section className="police-panel-card police-panel-card--opportunities">
            <h3>机会与阻碍</h3>
            <div className="police-panel-columns">
              <div>
                <h4>机会</h4>
                {formatList(career.opportunities)}
              </div>
              <div>
                <h4>阻碍</h4>
                {formatList(career.obstacles)}
              </div>
            </div>
          </section>

          <section className="police-panel-card police-panel-card--wide police-panel-card--actions">
            <h3>可尝试行动</h3>
            {actionHints.length > 0 ? (
              <div className="police-panel-action-grid">
                {actionHints.map((hint) => (
                  <button key={hint} type="button" onClick={() => handleDraftAction(hint)}>
                    {formatPoliceText(hint)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="police-panel-empty">暂无明确行动提示。</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
