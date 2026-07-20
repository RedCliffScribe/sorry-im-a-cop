import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import { TokenEstimatePanel } from './TokenEstimatePanel';

describe('TokenEstimatePanel', () => {
  it('separates main narration metrics from auxiliary API usage', () => {
    const state = createInitialRuntimeState();
    state.storyLog = [
      {
        turnId: 'turn_1',
        speaker: 'narrator',
        text: '雨夜里，报案室电话响起。',
        gameTime: state.time,
        turnMetrics: {
          inputTokens: 1234,
          outputTokens: 567,
          responseMs: 8900,
          apiUsage: [
            {
              route: 'mainNarrator',
              callCount: 1,
              inputTokens: 1234,
              outputTokens: 567,
              responseMs: 8900
            },
            {
              route: 'writebackRepair',
              callCount: 2,
              inputTokens: 240,
              outputTokens: 80,
              responseMs: 1200
            },
            {
              route: 'memoryEmbedding',
              callCount: 3,
              inputTokens: 110,
              outputTokens: 0,
              responseMs: 300
            }
          ]
        }
      }
    ];

    render(<TokenEstimatePanel settings={createDefaultAiSettings()} runtimeState={state} />);

    expect(screen.getByText('Token 估算')).toBeInTheDocument();
    expect(screen.getByText('下一回合 Prompt')).toBeInTheDocument();
    expect(screen.getByText('最近回合记录')).toBeInTheDocument();
    expect(screen.getByText(/主叙事输入 1,234/)).toBeInTheDocument();
    expect(screen.getByText(/主叙事输出 567/)).toBeInTheDocument();
    expect(screen.getByText(/主叙事耗时 9s/)).toBeInTheDocument();
    expect(screen.getByText(/辅助调用 5 次/)).toBeInTheDocument();
    expect(screen.getByText(/估算输入 350/)).toBeInTheDocument();
    expect(screen.getByText(/估算输出 80/)).toBeInTheDocument();
  });

  it('keeps legacy turn metrics readable without inventing auxiliary usage', () => {
    const state = createInitialRuntimeState();
    state.storyLog = [
      {
        turnId: 'turn_legacy',
        speaker: 'narrator',
        text: '旧存档正文。',
        gameTime: state.time,
        turnMetrics: {
          inputTokens: 900,
          outputTokens: 300,
          responseMs: 4000
        }
      }
    ];

    render(<TokenEstimatePanel settings={createDefaultAiSettings()} runtimeState={state} />);

    expect(screen.getByText(/主叙事输入 900/)).toBeInTheDocument();
    expect(screen.queryByText(/辅助调用/)).not.toBeInTheDocument();
  });
});
