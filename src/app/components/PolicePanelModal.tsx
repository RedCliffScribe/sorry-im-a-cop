import type { PoliceClimateEntry, RuntimeState } from '../../domain/runtime/types';
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

export function PolicePanelModal({ state, onClose, onDraftPlayerAction }: PolicePanelModalProps) {
  const panel = state.policePanel;
  const career = panel.careerPath;
  const assessment = Object.entries(career.dynamicAssessment);
  const actionHints = panel.actionHints.length > 0 ? panel.actionHints : career.suggestedActions;

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
            下一目标 <strong>{career.targetRank ? formatPoliceText(career.targetRank) : '未明'}</strong>
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
            <p>{career.routeSummary}</p>
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
