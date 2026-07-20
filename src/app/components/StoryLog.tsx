import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import type { GameTime, JudgementCheck, JudgementCheckId, JudgementOutcome, StoryEntry } from '../../domain/runtime/types';
import type { DisplaySettings } from '../../domain/settings/types';
import { getDisplayFontStack } from '../displayFonts';
import { DiagnosticExportModal } from './DiagnosticExportModal';
import { NarrativeWaitingPanel } from './NarrativeWaitingPanel';

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
  return [
    `# ${label} 原始记录`,
    `turnId：${entry.turnId}`,
    `时间：${formatGameTime(entry.gameTime)}`,
    ...metrics,
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

type StorySegment =
  | { type: 'narration' | 'plain'; text: string }
  | { type: 'dialogue'; speaker: string; text: string };

function parseStorySegments(text: string): StorySegment[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [{ type: 'plain', text }];

  return lines.map((line) => {
    const match = /^【([^】]+)】\s*(.*)$/.exec(line);
    if (!match) return { type: 'plain', text: line };
    const [, speaker, body] = match;
    if (speaker === '旁白') return { type: 'narration', text: body || line };
    return { type: 'dialogue', speaker, text: body || line };
  });
}

function StoryEntryBody({ entry }: { entry: StoryEntry }) {
  if (entry.speaker !== 'narrator') return <p>{entry.text}</p>;
  const segments = parseStorySegments(entry.text);

  return (
    <div className="story-segments">
      {segments.map((segment, index) => {
        const key = `${segment.type}-${index}`;
        if (segment.type === 'dialogue') {
          return (
            <div className="story-segment story-segment-dialogue" key={key}>
              <span className="story-dialogue-speaker">{segment.speaker}</span>
              <p>{segment.text}</p>
            </div>
          );
        }
        return (
          <p className={`story-segment story-segment-${segment.type}`} key={key}>
            {segment.text}
          </p>
        );
      })}
    </div>
  );
}

const judgementOutcomeLabels: Record<JudgementOutcome, string> = {
  critical_success: '大成功',
  success: '成功',
  partial_success: '有限成功',
  failure: '失败',
  critical_failure: '大失败'
};

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
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
        return (
          <article className="story-judgement-card" key={check.checkId}>
            <button
              className="story-judgement-summary"
              type="button"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? '收起判定详情' : '展开判定详情'}
              onClick={() => onToggle(check.checkId)}
            >
              <span className="story-judgement-category">{check.category}</span>
              <strong>{check.title}</strong>
              <span className={`story-judgement-outcome story-judgement-outcome-${check.outcome}`}>
                结果 {judgementOutcomeLabels[check.outcome]}
              </span>
              <span className="story-judgement-toggle">{isExpanded ? '收起' : '展开'}</span>
            </button>
            {isExpanded ? (
              <div className="story-judgement-detail">
                {check.targetSummary ? <p>{check.targetSummary}</p> : null}
                <div className="story-judgement-score-row">
                  <span>难度 {check.difficulty}</span>
                  <span>判定值 {check.score}</span>
                  <span>差额 {formatSigned(check.margin)}</span>
                </div>
                <p>{check.shortSummary}</p>
                {check.consequenceSummary ? <p>{check.consequenceSummary}</p> : null}
                {check.factors.length ? (
                  <div className="story-judgement-factors" aria-label="判定因素">
                    {check.factors.map((factor, index) => (
                      <div className="story-judgement-factor" key={`${check.checkId}-${factor.label}-${index}`}>
                        <strong>
                          {factor.label} {formatSigned(factor.value)}
                        </strong>
                        <span>{factor.reason}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
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
  rollbackAvailableTurnNumbers?: number[];
  onRegeneratePlayerAction?: (turnNumber: number, actionText: string) => void | Promise<void>;
}) {
  const [inspectedEntry, setInspectedEntry] = useState<StoryEntry | null>(null);
  const [expandedCheckIds, setExpandedCheckIds] = useState<Record<string, boolean>>({});
  const [editingPlayerTurnNumber, setEditingPlayerTurnNumber] = useState<number | null>(null);
  const [editingPlayerActionText, setEditingPlayerActionText] = useState('');
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

  function toggleJudgementCheck(checkId: JudgementCheckId) {
    setExpandedCheckIds((current) => ({ ...current, [checkId]: !current[checkId] }));
  }

  return (
    <section className="story-panel" aria-label="剧情正文">
      <h2>剧情正文</h2>
      <div className="story-list" ref={storyListRef} style={createStoryDisplayStyle(displaySettings)} data-testid="story-list">
        {renderedEntries.map((entry) => (
          <article
            key={`${entry.turnId}:${entry.speaker}`}
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
              <StoryEntryBody entry={entry} />
            )}
            {entry.speaker === 'narrator' ? (
              <div className="story-entry-word-count">正文约 {countNarrativeCharacters(entry.text)} 字</div>
            ) : null}
            {entry.speaker === 'narrator' ? (
              <JudgementCheckCards
                checks={getEntryJudgementChecks(entry, judgementChecks)}
                expandedCheckIds={expandedCheckIds}
                onToggle={toggleJudgementCheck}
              />
            ) : null}
          </article>
        ))}
        {shouldShowWaitingPanel ? <NarrativeWaitingPanel /> : null}
      </div>
      {inspectedEntry ? (
        <DiagnosticExportModal text={createEntryDiagnostic(inspectedEntry)} onClose={() => setInspectedEntry(null)} />
      ) : null}
    </section>
  );
}
