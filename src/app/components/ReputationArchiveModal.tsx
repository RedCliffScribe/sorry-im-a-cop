import { useState } from 'react';
import {
  formatNotorietyLevel,
  formatReputationTime,
  formatReputationTone,
  reputationCircleLabels,
  reputationCircleValues
} from '../../domain/reputation/reputation';
import type { PlayerReputationLogEntry, ReputationCircle, ReputationEntry, RuntimeState } from '../../domain/runtime/types';

interface ReputationArchiveModalProps {
  state: RuntimeState;
  onClose: () => void;
}

type HistoryLimit = '10' | '20' | '30' | 'all';

const historyLimitOptions: Array<{ value: HistoryLimit; label: string }> = [
  { value: '10', label: '10 条' },
  { value: '20', label: '20 条' },
  { value: '30', label: '30 条' },
  { value: 'all', label: '全部' }
];

function limitHistoryItems<T>(items: T[], limit: HistoryLimit): T[] {
  return limit === 'all' ? items : items.slice(0, Number(limit));
}

function HistoryLimitSelect({
  value,
  onChange
}: {
  value: HistoryLimit;
  onChange: (value: HistoryLimit) => void;
}) {
  return (
    <label className="archive-limit-control">
      <span>显示</span>
      <select
        className="archive-limit-select"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as HistoryLimit)}
      >
        {historyLimitOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDelta(value: number | undefined): string {
  if (!value) return '0';
  return value > 0 ? `+${value}` : String(value);
}

function formatCircleLine(circle: ReputationCircle, entry: ReputationEntry) {
  return `${reputationCircleLabels[circle]}：知名度 ${entry.visibility}/1000，口碑 ${entry.standing}`;
}

function formatLogTitle(log: PlayerReputationLogEntry): string {
  const scope = log.kind === 'circle' && log.circle ? reputationCircleLabels[log.circle] : '整体';
  const notoriety = log.notorietyDelta ? `知名度 ${formatDelta(log.notorietyDelta)}` : '';
  const overall = log.overallReputationDelta ? `口碑 ${formatDelta(log.overallReputationDelta)}` : '';
  const visibility = log.visibilityDelta ? `知名度 ${formatDelta(log.visibilityDelta)}` : '';
  const standing = log.standingDelta ? `口碑 ${formatDelta(log.standingDelta)}` : '';
  const deltas = [notoriety, overall, visibility, standing].filter(Boolean).join(' / ');
  return deltas ? `${scope}：${deltas}` : scope;
}

function reputationVisibilityPercent(value: number): number {
  return Math.max(0, Math.min(100, value / 10));
}

function reputationStandingPercent(value: number): number {
  return Math.max(0, Math.min(100, (value + 100) / 2));
}

export function ReputationArchiveModal({ state, onClose }: ReputationArchiveModalProps) {
  const [logLimit, setLogLimit] = useState<HistoryLimit>('10');
  const reputation = state.player.reputation;
  const recentLogs = limitHistoryItems([...reputation.logs].reverse(), logLimit);

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="reputation-archive-modal reputation-archive-modal--polished feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="口碑"
      >
        <header className="character-archive-header">
          <div>
            <h2>口碑</h2>
            <p>Reputation Archive</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="character-archive-stats" aria-label="口碑统计">
          <span>
            整体知名度 <strong>{reputation.notoriety}/1000</strong>
          </span>
          <span>
            传播层级 <strong>{formatNotorietyLevel(reputation.notoriety)}</strong>
          </span>
          <span>
            整体口碑 <strong>{reputation.overallReputation}</strong>
          </span>
          <span>
            评价倾向 <strong>{formatReputationTone(reputation.overallReputation)}</strong>
          </span>
        </div>

        <div className="reputation-archive-body">
          <div className="reputation-upper-grid">
            <section className="reputation-overview-panel" aria-label="整体口碑">
              <h3>整体</h3>
              <p>{reputation.summary}</p>
              <small>整体口碑由各圈层的知名度与评价在本地综合；传播范围较小的圈层变化影响也会较小。</small>
            </section>

            <section className="reputation-circle-panel" aria-label="圈层口碑">
              <h3>圈层</h3>
              <div className="reputation-circle-grid">
                {reputationCircleValues.map((circle) => {
                  const entry = reputation.circles[circle];
                  return (
                    <article key={circle} title={formatCircleLine(circle, entry)}>
                      <strong>{reputationCircleLabels[circle]}</strong>
                      <div>
                        <span>知名度 {entry.visibility}/1000</span>
                        <span>口碑 {entry.standing}</span>
                      </div>
                      <div className="reputation-circle-meters" aria-hidden="true">
                        <i className="reputation-meter reputation-meter--visibility">
                          <b style={{ width: `${reputationVisibilityPercent(entry.visibility)}%` }} />
                        </i>
                        <i className="reputation-meter reputation-meter--standing">
                          <b style={{ width: `${reputationStandingPercent(entry.standing)}%` }} />
                        </i>
                      </div>
                      <small>
                        {formatNotorietyLevel(entry.visibility)} / {formatReputationTone(entry.standing)}
                      </small>
                      <p>{entry.summary}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="reputation-log-panel" aria-label="口碑变动记录">
            <div className="archive-section-header">
              <h3>变动记录</h3>
              <HistoryLimitSelect value={logLimit} onChange={setLogLimit} />
            </div>
            {recentLogs.length > 0 ? (
              <div className="reputation-log-scroll">
                <div className="reputation-log-list">
                  {recentLogs.map((log) => (
                    <article key={log.logId}>
                      <span>{formatReputationTime(log.gameTime)}</span>
                      <strong>{formatLogTitle(log)}</strong>
                      <p>{log.summary}</p>
                      <small>{log.reason}</small>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className="character-empty">暂无口碑变动记录。</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
