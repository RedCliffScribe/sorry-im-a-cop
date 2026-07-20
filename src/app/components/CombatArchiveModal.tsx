import { useEffect, useMemo, useState } from 'react';
import { resolveCombatVisualAssets } from '../combatVisualAssets';
import type { CombatEvent, CombatEventId, JudgementCheck, RuntimeState } from '../../domain/runtime/types';

interface CombatArchiveModalProps {
  state: RuntimeState;
  initialCombatId?: CombatEventId | null;
  onClose: () => void;
}

const combatOutcomeLabels: Record<CombatEvent['outcome'], string> = {
  player_advantage: '玩家占优',
  player_wounded: '玩家受伤',
  opponent_subdued: '对方被制服',
  opponent_escaped: '对方逃脱',
  stalemate: '僵持',
  interrupted: '被打断',
  escalated: '升级',
  other: '其他'
};

const combatTypeLabels: Record<CombatEvent['type'], string> = {
  chase: '追逐',
  melee: '肢体冲突',
  armed: '持械冲突',
  firearm: '枪械冲突',
  crowd: '群体冲突',
  arrest: '拘捕',
  escape: '脱逃',
  other: '其他'
};

const judgementOutcomeLabels: Record<JudgementCheck['outcome'], string> = {
  critical_success: '大成功',
  success: '成功',
  partial_success: '有限成功',
  failure: '失败',
  critical_failure: '大失败'
};

function formatGameTime(time: RuntimeState['time']): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function sortCombatEvents(events: CombatEvent[]): CombatEvent[] {
  return [...events].sort(
    (left, right) =>
      right.gameTime.year - left.gameTime.year ||
      right.gameTime.month - left.gameTime.month ||
      right.gameTime.day - left.gameTime.day ||
      right.gameTime.hour - left.gameTime.hour ||
      right.gameTime.minute - left.gameTime.minute ||
      right.intensity - left.intensity
  );
}

function getCombatJudgements(state: RuntimeState, combat: CombatEvent): JudgementCheck[] {
  return combat.judgementCheckIds
    .map((checkId) => state.judgementChecks[checkId])
    .filter((check): check is JudgementCheck => Boolean(check) && check.visibility !== 'hidden');
}

function CombatEmptyState() {
  return <div className="combat-empty-state">暂无战斗记录</div>;
}

function CombatDetail({
  state,
  combat,
  onBack,
  onClose
}: {
  state: RuntimeState;
  combat: CombatEvent;
  onBack: () => void;
  onClose: () => void;
}) {
  const judgements = getCombatJudgements(state, combat);
  const visual = resolveCombatVisualAssets(combat, state);
  const stageClassName = [
    'combat-animation-stage',
    'combat-animation-stage-landscape',
    'combat-animation-stage-compact',
    'combat-visual-stage',
    `combat-result-${visual.resultTone}`,
    ...visual.effectClassNames,
    ...visual.weatherClassNames
  ].join(' ');

  return (
    <section
      className="combat-archive-modal combat-detail-modal-compact archive-info-modal archive-info-modal--combat-detail feature-modal-frame"
      role="dialog"
      aria-modal="true"
      aria-label="战斗详情"
    >
      <header className="character-archive-header">
        <div>
          <h2>{combat.title}</h2>
        </div>
        <div className="combat-header-actions">
          <button type="button" onClick={onBack}>
            返回记录
          </button>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </header>

      <div className="combat-detail-layout">
        <section className={stageClassName} aria-label="战斗演出">
          <img
            className="combat-visual-background"
            src={visual.background.url}
            alt=""
            width={1672}
            height={941}
            decoding="async"
            fetchPriority="high"
            aria-hidden="true"
          />
          <div className="combat-visual-tint" aria-hidden="true" />
          <div className="combat-visual-weather" aria-hidden="true" />
          <img
            className="combat-visual-enemy"
            src={visual.enemy.url}
            alt={visual.enemy.label}
            width={1086}
            height={1448}
            decoding="async"
          />
          <img
            className="combat-visual-player"
            src={visual.player.url}
            alt={visual.player.label}
            width={1086}
            height={1448}
            decoding="async"
          />
          <div className="combat-visual-flash" aria-hidden="true" />
          {visual.resultLabel ? <div className="combat-visual-result-stamp">{visual.resultLabel}</div> : null}
          <div className="combat-visual-caption" aria-hidden="true">
            <span>{visual.background.label}</span>
            <span>{combatTypeLabels[combat.type]}</span>
          </div>
        </section>

        <section className="combat-detail-main">
          <div className="combat-detail-scroll">
            <div className="combat-detail-meta">
              <span>{formatGameTime(combat.gameTime)}</span>
              <span>{combat.locationSummary}</span>
              <span>{combatTypeLabels[combat.type]}</span>
              <strong>{combatOutcomeLabels[combat.outcome]}</strong>
            </div>

            <div className="combat-detail-summary-row">
              <section className="combat-detail-section combat-detail-section-compact combat-detail-result">
                <h3>结果</h3>
                <p>{combat.resultSummary}</p>
                <p>{combat.consequenceSummary}</p>
              </section>

              <section className="combat-judgement-section combat-detail-section-compact">
                <h3>相关判定</h3>
                {judgements.length ? (
                  <div className="combat-judgement-list">
                    {judgements.map((check) => (
                      <article key={check.checkId}>
                        <strong>{check.title}</strong>
                        <span>
                          难度 {check.difficulty} / 判定值 {check.score} / 差额 {formatSigned(check.margin)} /{' '}
                          {judgementOutcomeLabels[check.outcome]}
                        </span>
                        <p>{check.shortSummary}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="combat-empty-inline">暂无相关判定</p>
                )}
              </section>

              <section className="combat-detail-section combat-detail-section-compact">
                <h3>参与方</h3>
                <div className="combat-participant-list">
                  {combat.participants.map((participant, index) => (
                    <article key={`${participant.name}-${participant.side}-${index}`}>
                      <strong>{participant.name}</strong>
                      <span>{participant.roleSummary}</span>
                      {participant.conditionAfter ? <p>{participant.conditionAfter}</p> : null}
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <article className="combat-cinematic-text">
              <h3>战斗过程</h3>
              <p>{combat.combatText}</p>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}

export function CombatArchiveModal({ state, initialCombatId = null, onClose }: CombatArchiveModalProps) {
  const [selectedCombatId, setSelectedCombatId] = useState<CombatEventId | null>(initialCombatId);
  const combatEvents = useMemo(
    () => sortCombatEvents(Object.values(state.combatEvents).filter((combat) => combat.visibility !== 'hidden')),
    [state.combatEvents]
  );
  const selectedCombat = selectedCombatId ? state.combatEvents[selectedCombatId] : undefined;

  useEffect(() => {
    if (initialCombatId) setSelectedCombatId(initialCombatId);
  }, [initialCombatId]);

  return (
    <div className="character-archive-backdrop" role="presentation">
      {selectedCombat && selectedCombat.visibility !== 'hidden' ? (
        <CombatDetail state={state} combat={selectedCombat} onBack={() => setSelectedCombatId(null)} onClose={onClose} />
      ) : (
        <section
          className="combat-archive-modal archive-info-modal archive-info-modal--combat feature-modal-frame"
          role="dialog"
          aria-modal="true"
          aria-label="战斗记录"
        >
          <header className="character-archive-header">
            <div>
              <h2>战斗记录</h2>
            </div>
            <button type="button" onClick={onClose}>
              关闭
            </button>
          </header>

          <div className="character-archive-stats" aria-label="战斗统计">
            <span>
              已记录 <strong>{combatEvents.length}</strong>
            </span>
          </div>

          <section className="combat-record-list" aria-label="战斗列表">
            {combatEvents.length ? (
              combatEvents.map((combat) => (
                <article className="combat-record-card" key={combat.combatId}>
                  <div>
                    <strong>{combat.title}</strong>
                    <span>
                      {formatGameTime(combat.gameTime)} / {combat.locationSummary}
                    </span>
                    <p>{combat.resultSummary}</p>
                  </div>
                  <div className="combat-record-meta">
                    <span>{combatTypeLabels[combat.type]}</span>
                    <span>烈度 {combat.intensity}/100</span>
                    <strong>{combatOutcomeLabels[combat.outcome]}</strong>
                    <button type="button" aria-label={`查看${combat.title}详情`} onClick={() => setSelectedCombatId(combat.combatId)}>
                      查看
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <CombatEmptyState />
            )}
          </section>
        </section>
      )}
    </div>
  );
}
