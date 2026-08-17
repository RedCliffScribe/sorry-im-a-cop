import { Fragment, type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GameTime,
  JudgementCategory,
  JudgementCheck,
  JudgementCheckId,
  JudgementOutcome,
  StoryEntry
} from '../../domain/runtime/types';
import type { DisplaySettings } from '../../domain/settings/types';
import { getDisplayFontStack } from '../displayFonts';
import { DiagnosticExportModal } from './DiagnosticExportModal';
import { NarrativeWaitingPanel } from './NarrativeWaitingPanel';
import { StoryEntryBody } from './StoryEntryBody';
import { StorySceneTurn, type StorySceneVisualsConfiguration } from './StorySceneTurn';
import { findActorDialogueAvatarAsset } from './storyDialogueAvatar';
import {
  judgementAttributeLabels,
  judgementDifficultyLabels,
  judgementFactorSourceLabels
} from '../../domain/conflict/localJudgement';
import { getGameDifficultyProfile } from '../../domain/settings/gameDifficulty';

function clampStoryFontSize(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 16;
  return Math.max(12, Math.min(28, Math.trunc(value)));
}

function createStoryDisplayStyle(displaySettings: DisplaySettings | undefined): CSSProperties {
  const narrationFontFamily = displaySettings?.narrationFontFamily ?? 'system';
  const dialogueFontFamily = displaySettings?.dialogueFontFamily ?? 'system';
  return {
    '--story-narration-font-family': getDisplayFontStack(narrationFontFamily, 'system'),
    '--story-dialogue-font-family': getDisplayFontStack(dialogueFontFamily, 'system'),
    '--story-narration-font-size': `${clampStoryFontSize(displaySettings?.narrationFontSize)}px`,
    '--story-dialogue-font-size': `${clampStoryFontSize(displaySettings?.dialogueFontSize)}px`
  } as CSSProperties;
}

function createStreamingEntry(text: string, gameTime: GameTime): StoryEntry {
  return {
    turnId: 'streaming_narrator',
    speaker: 'narrator',
    text,
    gameTime
  };
}

export interface PendingPlayerAction {
  text: string;
  gameTime: GameTime;
  turnNumber: number;
}

function createPendingPlayerEntry(action: PendingPlayerAction): StoryEntry {
  return {
    turnId: `pending_player_${action.turnNumber}`,
    speaker: 'player',
    text: action.text,
    gameTime: action.gameTime
  };
}

function formatGameTime(time: GameTime): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function getTurnLabel(entry: StoryEntry): string {
  if (entry.turnId === 'streaming_narrator') return '生成中';
  if (entry.turnId === 'turn_0') return '开场';
  const match = /^turn_(\d+)$/.exec(entry.turnId);
  if (!match) return '叙事';
  return `第 ${Number(match[1])} 回合`;
}

function getPlayerTurnNumber(entry: StoryEntry): number | null {
  if (entry.speaker !== 'player') return null;
  const match = /^(?:player|turn)_(\d+)$/.exec(entry.turnId);
  if (!match) return null;
  return Number(match[1]);
}

function shouldRenderStoryEntry(entry: StoryEntry): boolean {
  if (entry.speaker !== 'player') return true;
  return entry.text.trim().length > 0;
}

function createEntryDiagnostic(entry: StoryEntry): string {
  const label = getTurnLabel(entry);
  const suggestions = entry.suggestedActions?.length ? entry.suggestedActions.join(' / ') : '无';
  const metrics = entry.turnMetrics
    ? [
        '',
        '## 回合指标',
        `输入 token：${formatMetricNumber(entry.turnMetrics.inputTokens)}`,
        `返回时间：${formatResponseTime(entry.turnMetrics.responseMs)}`,
        `输出 token：${formatMetricNumber(entry.turnMetrics.outputTokens)}`
      ]
    : [];
  const experience = entry.experienceAward
    ? [
        '',
        '## 经验结算',
        `awardId：${entry.experienceAward.awardId}`,
        `total：${entry.experienceAward.total}`,
        `sources：${entry.experienceAward.sources
          .map(
            (source) =>
              `${source.sourceId ?? source.kind}(${source.amount}) ${source.reason}`
          )
          .join(' / ')}`,
        `modelSuggestedGain：${entry.experienceAward.modelSuggestedGain ?? 0}`,
        `capped：${entry.experienceAward.capped ? 'true' : 'false'}`,
        `levelsGained：${entry.experienceAward.levelsGained}`,
        `attributePointsGained：${entry.experienceAward.attributePointsGained}`
      ]
    : [];
  return [
    `# ${label} 原始记录`,
    `turnId：${entry.turnId}`,
    `时间：${formatGameTime(entry.gameTime)}`,
    ...metrics,
    ...experience,
    '',
    '## 原始返回记录',
    entry.rawNarratorResponse?.trim() || '- 当前回合没有保存原始返回，只能显示前端正文。',
    '',
    '## 前端展示正文',
    entry.text,
    '',
    `建议行动：${suggestions}`
  ].join('\n');
}

function formatExperienceReason(entry: StoryEntry): string {
  const reasons = entry.experienceAward?.sources.map((source) => source.reason) ?? [];
  if (reasons.length <= 2) return reasons.join(' · ');
  return `${reasons.slice(0, 2).join(' · ')}等 ${reasons.length} 项`;
}

function countNarrativeCharacters(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function formatMetricNumber(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

function formatResponseTime(responseMs: number | undefined): string {
  if (typeof responseMs !== 'number' || !Number.isFinite(responseMs)) return '—';
  const seconds = Math.max(0, responseMs) / 1000;
  if (seconds >= 10) return `${Math.round(seconds)}s`;
  return `${seconds.toFixed(1)}s`;
}

function hasTurnMetrics(entry: StoryEntry): boolean {
  const metrics = entry.turnMetrics;
  return Boolean(metrics && (metrics.inputTokens !== undefined || metrics.outputTokens !== undefined || metrics.responseMs !== undefined));
}

const judgementOutcomeLabels: Record<JudgementOutcome, string> = {
  critical_success: '大成功',
  success: '成功',
  partial_success: '有限成功',
  failure: '失败',
  critical_failure: '大失败'
};

const judgementCategoryLabels: Record<JudgementCategory, string> = {
  observation: '观察',
  chase: '追捕',
  melee: '格斗',
  armed: '持械',
  firearm: '枪械',
  crowd: '人群',
  negotiation: '交涉',
  endurance: '体魄',
  will: '意志',
  thinking: '思考',
  other: '综合'
};

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function getLocalJudgementFormula(check: JudgementCheck) {
  if (
    check.rulesetVersion !== 'v1.1-local-d100' ||
    !check.primaryAttribute ||
    typeof check.primaryAttributeValue !== 'number' ||
    !check.difficultyTier ||
    typeof check.difficultyModifier !== 'number' ||
    typeof check.gameDifficultyModifier !== 'number' ||
    typeof check.contextModifierTotal !== 'number' ||
    typeof check.effectiveTarget !== 'number' ||
    typeof check.presetRoll !== 'number'
  ) {
    return undefined;
  }

  const terms = [
    {
      label: `主属性 · ${judgementAttributeLabels[check.primaryAttribute]}`,
      value: check.primaryAttributeValue,
      detail: `属性值 ${check.primaryAttributeValue}`
    },
    ...(check.secondaryAttribute
      ? [
          {
            label: `副属性 · ${judgementAttributeLabels[check.secondaryAttribute]}`,
            value: check.secondaryModifier ?? 0,
            detail: `属性值 ${check.secondaryAttributeValue ?? '—'} 换算`
          }
        ]
      : []),
    {
      label: `场景 · ${judgementDifficultyLabels[check.difficultyTier]}`,
      value: check.difficultyModifier,
      detail: '场景难度修正'
    },
    {
      label: `本局 · ${getGameDifficultyProfile(check.gameDifficulty).label}`,
      value: check.gameDifficultyModifier,
      detail: '当前存档难度'
    },
    {
      label: '情境合计',
      value: check.contextModifierTotal,
      detail: check.factors.length ? `${check.factors.length} 项现场因素` : '没有额外现场因素'
    }
  ];
  const rawTarget = terms.reduce((total, term) => total + term.value, 0);
  const expression = terms
    .map(
      (term, index) =>
        `${index === 0 ? term.value : term.value >= 0 ? `+${term.value}` : term.value}（${term.label}）`
    )
    .join(' ');

  return {
    terms,
    rawTarget,
    effectiveTarget: check.effectiveTarget,
    presetRoll: check.presetRoll,
    expression: `${expression} = ${rawTarget}`,
    wasClamped: rawTarget !== check.effectiveTarget
  };
}

function getLocalJudgementComparison(check: JudgementCheck): string {
  const roll = check.presetRoll ?? check.score;
  const target = check.effectiveTarget ?? check.difficulty;
  if (check.outcome === 'critical_success') {
    return `d100 ${roll} 落在 1–5，触发天然大成功。`;
  }
  if (check.outcome === 'critical_failure') {
    return `d100 ${roll} 落在 96–100，触发天然大失败。`;
  }
  if (check.outcome === 'success') {
    return `d100 ${roll} ≤ 目标值 ${target}，判定成功。`;
  }
  if (check.outcome === 'partial_success') {
    return `目标值 ${target} < d100 ${roll} ≤ ${Math.min(100, target + 10)}，进入有限成功窗口。`;
  }
  return `d100 ${roll} > 有限成功上限 ${Math.min(100, target + 10)}，判定失败。`;
}

function getEntryJudgementChecks(
  entry: StoryEntry,
  judgementChecks: Record<JudgementCheckId, JudgementCheck> | undefined
): JudgementCheck[] {
  if (!judgementChecks) return [];
  return (entry.judgementCheckIds ?? [])
    .map((checkId) => judgementChecks[checkId])
    .filter((check): check is JudgementCheck => Boolean(check) && check.visibility !== 'hidden');
}

function JudgementCheckCards({
  checks,
  expandedCheckIds,
  onToggle
}: {
  checks: JudgementCheck[];
  expandedCheckIds: Record<string, boolean>;
  onToggle: (checkId: JudgementCheckId) => void;
}) {
  if (!checks.length) return null;

  return (
    <div className="story-judgement-list" aria-label="本回合判定">
      {checks.map((check) => {
        const isExpanded = Boolean(expandedCheckIds[check.checkId]);
        const formula = getLocalJudgementFormula(check);
        const isLocalD100 = Boolean(formula);
        const target = check.effectiveTarget ?? check.difficulty;
        const roll = check.presetRoll ?? check.score;
        return (
          <article
            className={`story-judgement-record story-judgement-record-${check.outcome}`}
            key={check.checkId}
            aria-label={`${check.title}判定记录`}
          >
            <button
              className="story-judgement-summary"
              type="button"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? '收起' : '展开'}“${check.title}”判定详情`}
              onClick={() => onToggle(check.checkId)}
            >
              <span className="story-judgement-icon" aria-hidden="true">⚄</span>
              <span className="story-judgement-category">{judgementCategoryLabels[check.category]}</span>
              <span className="story-judgement-title">{check.title}</span>
              <span className="story-judgement-quick-math">
                {isLocalD100 ? `d100 ${roll} / 目标 ${target}` : `判定 ${check.score} / 难度 ${check.difficulty}`}
              </span>
              <span className={`story-judgement-outcome story-judgement-outcome-${check.outcome}`}>
                {judgementOutcomeLabels[check.outcome]}
              </span>
              <span className="story-judgement-toggle">{isExpanded ? '收起' : '展开'}</span>
            </button>
            {isExpanded ? (
              <div
                className="story-judgement-detail"
                role="region"
                aria-label={`${check.title}判定详情`}
              >
                {check.targetSummary ? (
                  <p className="story-judgement-target">
                    <span>判定对象</span>
                    {check.targetSummary}
                  </p>
                ) : null}

                {formula ? (
                  <>
                    <div
                      className="story-judgement-resolution"
                      aria-label={`本地 d100 ${formula.presetRoll}，目标值 ${formula.effectiveTarget}，结果${judgementOutcomeLabels[check.outcome]}`}
                    >
                      <div>
                        <span>本地 d100</span>
                        <strong>{formula.presetRoll}</strong>
                      </div>
                      <span className="story-judgement-resolution-divider">对比</span>
                      <div>
                        <span>成功目标</span>
                        <strong>{formula.effectiveTarget}</strong>
                      </div>
                      <div className={`story-judgement-resolution-outcome story-judgement-outcome-${check.outcome}`}>
                        <span>判定结果</span>
                        <strong>{judgementOutcomeLabels[check.outcome]}</strong>
                        <small>余量 {formatSigned(check.margin)}</small>
                      </div>
                    </div>

                    <section className="story-judgement-calculation" aria-label="判定计算详情">
                      <div className="story-judgement-detail-heading">
                        <h4>判定详情</h4>
                        <span>能力与现场修正</span>
                      </div>
                      <div className="story-judgement-formula-terms">
                        {formula.terms.map((term) => (
                          <div
                            className={`story-judgement-formula-term ${
                              term.value > 0
                                ? 'is-positive'
                                : term.value < 0
                                  ? 'is-negative'
                                  : 'is-neutral'
                            }`}
                            key={term.label}
                          >
                            <span>{term.label}</span>
                            <strong>{formatSigned(term.value)}</strong>
                            <small>{term.detail}</small>
                          </div>
                        ))}
                      </div>
                      <p className="story-judgement-formula-expression">
                        {formula.expression}
                        {formula.wasClamped
                          ? `；按 5–95 边界取目标值 ${formula.effectiveTarget}`
                          : `，最终目标值 ${formula.effectiveTarget}`}
                      </p>
                      <p className="story-judgement-comparison">
                        {getLocalJudgementComparison(check)}
                      </p>
                    </section>
                  </>
                ) : (
                  <section className="story-judgement-legacy" aria-label="旧版判定数值">
                    <div>
                      <span>难度</span>
                      <strong>{check.difficulty}</strong>
                    </div>
                    <div>
                      <span>判定值</span>
                      <strong>{check.score}</strong>
                    </div>
                    <div>
                      <span>差额</span>
                      <strong>{formatSigned(check.margin)}</strong>
                    </div>
                    <p>这是旧版判定记录，当时未保存 V1.1 的逐项目标值公式。</p>
                  </section>
                )}

                {check.factors.length ? (
                  <section className="story-judgement-factor-section" aria-label="情境修正来源">
                    <div className="story-judgement-detail-heading">
                      <h4>情境修正来源</h4>
                      <span>合计 {formatSigned(check.contextModifierTotal ?? check.factors.reduce((sum, factor) => sum + factor.value, 0))}</span>
                    </div>
                    <div className="story-judgement-factors">
                      {check.factors.map((factor, index) => (
                        <div
                          className={`story-judgement-factor ${
                            factor.value > 0
                              ? 'is-positive'
                              : factor.value < 0
                                ? 'is-negative'
                                : 'is-neutral'
                          }`}
                          key={`${check.checkId}-${factor.label}-${index}`}
                        >
                          {factor.sourceType ? (
                            <small className="story-judgement-factor-source">
                              {judgementFactorSourceLabels[factor.sourceType]}
                            </small>
                          ) : null}
                          <strong>
                            {factor.label} {formatSigned(factor.value)}
                          </strong>
                          <span>{factor.reason}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="story-judgement-conclusion" aria-label="判定结论">
                  <div>
                    <span>判定结论</span>
                    <p>{check.shortSummary}</p>
                  </div>
                  {check.consequenceSummary ? (
                    <div>
                      <span>局面后果</span>
                      <p>{check.consequenceSummary}</p>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function StoryLog({
  entries,
  streamingText,
  streamingGameTime,
  pendingPlayerAction,
  judgementChecks,
  isWaitingForNarrative = false,
  renderLimit = 30,
  displaySettings,
  sceneVisuals,
  rollbackAvailableTurnNumbers = [],
  onRegeneratePlayerAction
}: {
  entries: StoryEntry[];
  streamingText?: string;
  streamingGameTime?: GameTime;
  pendingPlayerAction?: PendingPlayerAction | null;
  judgementChecks?: Record<JudgementCheckId, JudgementCheck>;
  isWaitingForNarrative?: boolean;
  renderLimit?: number;
  displaySettings?: DisplaySettings;
  sceneVisuals?: StorySceneVisualsConfiguration;
  rollbackAvailableTurnNumbers?: number[];
  onRegeneratePlayerAction?: (turnNumber: number, actionText: string) => void | Promise<void>;
}) {
  const [inspectedEntry, setInspectedEntry] = useState<StoryEntry | null>(null);
  const [expandedCheckIds, setExpandedCheckIds] = useState<Record<string, boolean>>({});
  const [editingPlayerTurnNumber, setEditingPlayerTurnNumber] = useState<number | null>(null);
  const [editingPlayerActionText, setEditingPlayerActionText] = useState('');
  const [dialogueAvatars, setDialogueAvatars] = useState<Map<string, { url: string; alt: string }>>(new Map());
  const dialogueVisualActors = sceneVisuals?.actors;
  const dialogueVisualActorIdAliases = sceneVisuals?.actorIdAliases;
  const dialogueVisualRepository = sceneVisuals?.repository;
  const dialogueVisualRevision = sceneVisuals?.revision;
  const dialogueVisualSaveId = sceneVisuals?.saveId;
  const storyListRef = useRef<HTMLDivElement | null>(null);
  const rollbackAvailableTurnSet = useMemo(
    () => new Set(rollbackAvailableTurnNumbers),
    [rollbackAvailableTurnNumbers]
  );
  const renderedEntries = useMemo(() => {
    const mergedEntries = [...entries];
    if (pendingPlayerAction?.text.trim()) {
      mergedEntries.push(createPendingPlayerEntry(pendingPlayerAction));
    }
    if (streamingText && streamingGameTime) {
      mergedEntries.push(createStreamingEntry(streamingText, streamingGameTime));
    }
    return mergedEntries.filter(shouldRenderStoryEntry).slice(-Math.max(1, renderLimit));
  }, [entries, pendingPlayerAction, renderLimit, streamingGameTime, streamingText]);
  const scrollAnchor = renderedEntries.map((entry) => `${entry.turnId}:${entry.text}`).join('|');
  const shouldShowWaitingPanel = isWaitingForNarrative && !streamingText;

  useEffect(() => {
    const storyList = storyListRef.current;
    if (!storyList) return;
    storyList.scrollTop = storyList.scrollHeight;
  }, [scrollAnchor, shouldShowWaitingPanel]);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    if (!dialogueVisualActors || !dialogueVisualRepository || !dialogueVisualSaveId || typeof URL.createObjectURL !== 'function') {
      setDialogueAvatars(new Map());
      return () => undefined;
    }
    void dialogueVisualRepository.loadSnapshot(dialogueVisualSaveId).then(async (snapshot) => {
      const next = new Map<string, { url: string; alt: string }>();
      for (const actor of Object.values(dialogueVisualActors)) {
        const asset = findActorDialogueAvatarAsset(snapshot, actor.actorId, dialogueVisualActorIdAliases);
        if (!asset) continue;
        const blob = await dialogueVisualRepository.getBlob(asset.blobKey);
        if (!blob || !active) continue;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        next.set(actor.actorId, { url, alt: `${actor.name} 对话头像` });
      }
      if (active) setDialogueAvatars(next);
    }, () => active && setDialogueAvatars(new Map()));
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [dialogueVisualActorIdAliases, dialogueVisualActors, dialogueVisualRepository, dialogueVisualRevision, dialogueVisualSaveId]);

  function toggleJudgementCheck(checkId: JudgementCheckId) {
    setExpandedCheckIds((current) => ({ ...current, [checkId]: !current[checkId] }));
  }

  return (
    <section className="story-panel" aria-label="剧情正文">
      <h2>剧情正文</h2>
      <div className="story-list" ref={storyListRef} style={createStoryDisplayStyle(displaySettings)} data-testid="story-list">
        {renderedEntries.map((entry) => (
          <Fragment key={`${entry.turnId}:${entry.speaker}`}>
            <article
              className={`story-entry story-entry-${entry.speaker}${entry.turnId === 'streaming_narrator' ? ' story-entry-streaming' : ''}${entry.turnId.startsWith('pending_player_') ? ' story-entry-pending-player' : ''}`}
            >
            {entry.speaker === 'narrator' ? (
              <div className="story-turn-header">
                <span className="story-turn-label">{getTurnLabel(entry)}</span>
                <button
                  type="button"
                  className="story-turn-source-button"
                  onClick={() => setInspectedEntry(entry)}
                >
                  查看原文
                </button>
                {hasTurnMetrics(entry) ? (
                  <div className="story-turn-metrics" aria-label="本回合生成指标">
                    <span title="输入量（估算）">↑ {formatMetricNumber(entry.turnMetrics?.inputTokens)}</span>
                    <span title="返回时间">◷ {formatResponseTime(entry.turnMetrics?.responseMs)}</span>
                    <span title="输出量（估算）">↓ {formatMetricNumber(entry.turnMetrics?.outputTokens)}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              (() => {
                const playerTurnNumber = getPlayerTurnNumber(entry);
                const canRegenerate =
                  playerTurnNumber !== null &&
                  rollbackAvailableTurnSet.has(playerTurnNumber) &&
                  Boolean(onRegeneratePlayerAction);
                const isEditing = playerTurnNumber !== null && editingPlayerTurnNumber === playerTurnNumber;

                return (
                  <div className="story-player-turn-header">
                    <span>
                      你的行动
                      {entry.turnId.startsWith('pending_player_') ? (
                        <small className="story-player-pending-label">已发送 · 等待回应</small>
                      ) : null}
                    </span>
                    {canRegenerate ? (
                      <div className="story-player-turn-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPlayerTurnNumber(playerTurnNumber);
                            setEditingPlayerActionText(entry.text);
                          }}
                        >
                          编辑重发
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void onRegeneratePlayerAction?.(playerTurnNumber, entry.text);
                          }}
                        >
                          重发原行动
                        </button>
                      </div>
                    ) : null}
                    {isEditing ? (
                      <form
                        className="story-player-action-editor"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const trimmed = editingPlayerActionText.trim();
                          if (!trimmed) return;
                          setEditingPlayerTurnNumber(null);
                          void onRegeneratePlayerAction?.(playerTurnNumber, trimmed);
                        }}
                      >
                        <textarea
                          aria-label={`编辑第 ${playerTurnNumber} 回合行动`}
                          value={editingPlayerActionText}
                          onChange={(event) => setEditingPlayerActionText(event.target.value)}
                          rows={3}
                        />
                        <div className="story-player-action-editor-actions">
                          <button type="submit">发送</button>
                          <button type="button" onClick={() => setEditingPlayerTurnNumber(null)}>
                            取消
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                );
              })()
            )}
            {entry.speaker === 'player' &&
            getPlayerTurnNumber(entry) !== null &&
            editingPlayerTurnNumber === getPlayerTurnNumber(entry) ? null : (
              entry.speaker === 'narrator' && sceneVisuals && entry.turnId !== 'streaming_narrator' ? (
                <StorySceneTurn entry={entry} configuration={sceneVisuals} dialogueAvatars={dialogueAvatars} />
              ) : (
                <StoryEntryBody
                  entry={entry}
                  actors={sceneVisuals?.actors}
                  actorIdAliases={sceneVisuals?.actorIdAliases}
                  dialogueAvatars={dialogueAvatars}
                />
              )
            )}
            {entry.speaker === 'narrator' && entry.experienceAward ? (
              <aside className="story-experience-award" aria-label="本回合经验">
                <div>
                  <strong>本回合 +{entry.experienceAward.total} 经验</strong>
                  {formatExperienceReason(entry) ? (
                    <span> · {formatExperienceReason(entry)}</span>
                  ) : null}
                </div>
                {entry.experienceAward.levelsGained > 0 ? (
                  <div className="story-experience-level-up">
                    升至 {entry.experienceAward.levelAfter} 级，获得{' '}
                    {entry.experienceAward.attributePointsGained} 点可分配属性。
                  </div>
                ) : null}
              </aside>
            ) : null}
            {entry.speaker === 'narrator' ? (
              <div className="story-entry-word-count">正文约 {countNarrativeCharacters(entry.text)} 字</div>
            ) : null}
            </article>
            {entry.speaker === 'narrator' ? (
              <JudgementCheckCards
                checks={getEntryJudgementChecks(entry, judgementChecks)}
                expandedCheckIds={expandedCheckIds}
                onToggle={toggleJudgementCheck}
              />
            ) : null}
          </Fragment>
        ))}
        {shouldShowWaitingPanel ? <NarrativeWaitingPanel /> : null}
      </div>
      {inspectedEntry ? (
        <DiagnosticExportModal text={createEntryDiagnostic(inspectedEntry)} onClose={() => setInspectedEntry(null)} />
      ) : null}
    </section>
  );
}
