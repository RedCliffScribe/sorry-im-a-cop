import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { createAuxiliaryNewsPrompt, maybeGenerateAuxiliaryNews } from './auxiliaryNewsGeneration';

describe('auxiliary news generation', () => {
  it('uses the current game year without exposing the internal worldpack id', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1994, month: 7, day: 10, hour: 20, minute: 0 }
    });

    const prompt = createAuxiliaryNewsPrompt(state, '', 'daily_digest');

    expect(prompt).toContain('1994 年香港语境');
    expect(prompt).toContain('1994 都市裂缝');
    expect(prompt).not.toContain('worldpack=hk_1988');
  });

  it('generates overdue news on the first turn after 06:00 even when the morning window was missed', async () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1994, month: 7, day: 10, hour: 20, minute: 0 }
    });
    state.dynamicEvents.newsIssues.news_old = {
      id: 'news_old',
      date: { year: 1994, month: 7, day: 8, hour: 7, minute: 0 },
      outletName: '大公报',
      headline: '旧报纸',
      summary: '两日前的报纸。',
      articles: [],
      createdAt: { year: 1994, month: 7, day: 8, hour: 7, minute: 0 },
      updatedAt: { year: 1994, month: 7, day: 8, hour: 7, minute: 0 },
      read: true
    };
    const auxiliaryGeneration = {
      complete: vi.fn().mockResolvedValue({ newsIssuePatches: [] })
    };

    await maybeGenerateAuxiliaryNews({
      state,
      playerInput: '',
      auxiliaryGeneration,
      promptSettings: { overrides: { 'news.generation': 'CUSTOM_NEWS_GENERATION_RULES' } }
    });

    expect(auxiliaryGeneration.complete).toHaveBeenCalledTimes(1);
    expect(auxiliaryGeneration.complete).toHaveBeenCalledWith(expect.stringContaining('CUSTOM_NEWS_GENERATION_RULES'));
  });
});
