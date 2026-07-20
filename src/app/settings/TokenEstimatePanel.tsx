import { composePrompt } from '../../domain/context/composePrompt';
import { selectContext } from '../../domain/context/selectContext';
import { estimateNarrativeTokens } from '../../domain/narrator/estimateNarrativeTokens';
import { composeOpeningPrompt } from '../../domain/opening/composeOpeningPrompt';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { RuntimeState, StoryEntry } from '../../domain/runtime/types';
import type { AiSettings } from '../../domain/settings/types';

const samplePlayerInput = '继续观察现场，留意身边人的反应。';

function formatNumber(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

function findLatestMetricsEntry(state: RuntimeState | null | undefined): StoryEntry | null {
  if (!state) return null;
  return (
    [...state.storyLog]
      .reverse()
      .find((entry) => entry.speaker === 'narrator' && entry.turnMetrics) ?? null
  );
}

function createOpeningEstimate(settings: AiSettings): number {
  const initialState = createInitialRuntimeState();
  const prompt = composeOpeningPrompt({
    setup: {},
    initialState,
    narrativeLengthLevel: settings.game.narrativeLengthLevel,
    promptSettings: settings.prompts
  });
  return estimateNarrativeTokens(prompt);
}

function createTurnEstimate(settings: AiSettings, runtimeState: RuntimeState | null | undefined): number {
  const state = runtimeState ?? createInitialRuntimeState();
  const context = selectContext(state, samplePlayerInput);
  const prompt = composePrompt(context, samplePlayerInput, {
    narrativeLengthLevel: settings.game.narrativeLengthLevel,
    promptSettings: settings.prompts
  });
  return estimateNarrativeTokens(prompt);
}

export function TokenEstimatePanel({
  settings,
  runtimeState
}: {
  settings: AiSettings;
  runtimeState?: RuntimeState | null;
}) {
  const openingEstimate = createOpeningEstimate(settings);
  const turnEstimate = createTurnEstimate(settings, runtimeState);
  const latestMetricsEntry = findLatestMetricsEntry(runtimeState);
  const latestMetrics = latestMetricsEntry?.turnMetrics;
  const auxiliaryUsage = latestMetrics?.apiUsage
    ?.filter((usage) => usage.route !== 'mainNarrator')
    .reduce(
      (total, usage) => ({
        callCount: total.callCount + usage.callCount,
        inputTokens: total.inputTokens + usage.inputTokens,
        outputTokens: total.outputTokens + usage.outputTokens,
        responseMs: total.responseMs + usage.responseMs
      }),
      { callCount: 0, inputTokens: 0, outputTokens: 0, responseMs: 0 }
    );

  return (
    <section className="settings-panel">
      <div className="settings-topline">
        <div>
          <h2>Token 估算</h2>
          <p className="muted">基于本地估算器和当前设置预估 prompt 规模，实际计费以 API 返回为准。</p>
        </div>
      </div>

      <section className="settings-section token-estimate-grid" aria-label="Prompt 估算">
        <article className="metric-card">
          <span>开局 Prompt</span>
          <strong>{formatNumber(openingEstimate)}</strong>
          <p className="muted">使用当前正文篇幅和提示词覆盖估算。</p>
        </article>
        <article className="metric-card">
          <span>下一回合 Prompt</span>
          <strong>{formatNumber(turnEstimate)}</strong>
          <p className="muted">使用当前存档状态；未进入游戏时使用默认开局状态。</p>
        </article>
      </section>

      <section className="settings-section" aria-label="最近回合记录">
        <h3>最近回合记录</h3>
        {latestMetrics ? (
          <>
            <div className="token-metric-row">
              <span>主叙事输入 {formatNumber(latestMetrics.inputTokens)}</span>
              <span>主叙事输出 {formatNumber(latestMetrics.outputTokens)}</span>
              <span>
                主叙事耗时 {formatNumber(latestMetrics.responseMs ? latestMetrics.responseMs / 1000 : undefined)}s
              </span>
            </div>
            {auxiliaryUsage && auxiliaryUsage.callCount > 0 ? (
              <div className="token-metric-row">
                <span>辅助调用 {formatNumber(auxiliaryUsage.callCount)} 次</span>
                <span>估算输入 {formatNumber(auxiliaryUsage.inputTokens)}</span>
                <span>估算输出 {formatNumber(auxiliaryUsage.outputTokens)}</span>
                <span>辅助耗时 {formatNumber(auxiliaryUsage.responseMs / 1000)}s</span>
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted">暂无带指标的回合记录。</p>
        )}
      </section>
    </section>
  );
}
