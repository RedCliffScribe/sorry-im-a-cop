import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { RuntimeState, StoryEntry } from '../runtime/types';
import {
  countStoryExportEntries,
  createStoryExport,
  type StoryExportOptions
} from './storyExport';

const DEFAULT_OPTIONS: StoryExportOptions = {
  range: 'currentChapter',
  format: 'markdown',
  includeTimeLocation: true,
  includeCharacterNames: true,
  includeChapterSeparators: true,
  includePlayerActions: true
};

function storyEntry(overrides: Partial<StoryEntry>): StoryEntry {
  return {
    turnId: 'turn_1',
    speaker: 'narrator',
    text: '默认正文。',
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
    ...overrides
  };
}

function createStoryState(): RuntimeState {
  const state = createInitialRuntimeState();
  state.player.name = '王博';
  state.time = { year: 1988, month: 9, day: 12, hour: 22, minute: 10 };
  state.storyLog = [
    storyEntry({
      turnId: 'turn_0',
      text: '开场正文。',
      gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: 0 }
    }),
    storyEntry({
      turnId: 'turn_1',
      speaker: 'player',
      text: '询问目击者。',
      gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: 30 }
    }),
    storyEntry({
      turnId: 'turn_1',
      text: '【旁白】雨夜中的旺角街头。\n【陈伟强】我只看见一辆红色的士。',
      gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: 45 }
    }),
    storyEntry({
      turnId: 'player_2',
      speaker: 'player',
      text: '核对车牌。',
      gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 0 }
    }),
    storyEntry({
      turnId: 'turn_2',
      text: '【陈伟强】车牌尾数是七四。',
      gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    })
  ];
  return state;
}

describe('createStoryExport', () => {
  it('treats the latest completed turn as the current chapter', () => {
    const state = createStoryState();
    const artifact = createStoryExport(state, DEFAULT_OPTIONS, new Date(2026, 6, 22, 12, 0, 0));

    expect(artifact.entryCount).toBe(2);
    expect(artifact.content).toContain('## 第 2 回合');
    expect(artifact.content).toContain('核对车牌。');
    expect(artifact.content).toContain('车牌尾数是七四。');
    expect(artifact.content).not.toContain('询问目击者。');
    expect(artifact.content).not.toContain('开场正文。');
    expect(artifact.fileName).toBe('对唔住我系差人_王博_当前章节_2026-07-22.md');
  });

  it('uses the player local date instead of the UTC date in the filename', () => {
    const state = createStoryState();
    const localMidnight = new Date(2026, 6, 22, 0, 5, 0);
    const artifact = createStoryExport(state, DEFAULT_OPTIONS, localMidnight);

    expect(artifact.fileName).toBe('对唔住我系差人_王博_当前章节_2026-07-22.md');
  });

  it('exports every visible story entry for both full-save ranges', () => {
    const state = createStoryState();
    const currentSave = createStoryExport(state, { ...DEFAULT_OPTIONS, range: 'currentSave' });
    const fromOpening = createStoryExport(state, { ...DEFAULT_OPTIONS, range: 'fromOpening' });

    expect(currentSave.entryCount).toBe(5);
    expect(fromOpening.entryCount).toBe(5);
    expect(currentSave.content).toContain('开场正文。');
    expect(fromOpening.content).toContain('开场正文。');
    expect(currentSave.content).toContain('## 第 1 回合');
    expect(fromOpening.content).toContain('## 第 2 回合');
  });

  it('honors all optional-content switches', () => {
    const state = createStoryState();
    const artifact = createStoryExport(state, {
      ...DEFAULT_OPTIONS,
      range: 'currentSave',
      includeTimeLocation: false,
      includeCharacterNames: false,
      includeChapterSeparators: false,
      includePlayerActions: false
    });

    expect(artifact.entryCount).toBe(3);
    expect(artifact.content).not.toContain('王博');
    expect(artifact.content).not.toContain('陈伟强');
    expect(artifact.content).not.toContain('询问目击者。');
    expect(artifact.content).not.toContain('核对车牌。');
    expect(artifact.content).not.toContain('## 第');
    expect(artifact.content).not.toContain('当前时间：');
    expect(artifact.content).not.toContain('导出时地点：');
    expect(artifact.content).toContain('我只看见一辆红色的士。');
  });

  it('escapes generated text and player names in the standalone HTML file', () => {
    const state = createStoryState();
    state.player.name = '<img src=x onerror=alert(1)>';
    state.storyLog = [
      storyEntry({
        text: '【陈伟强】<script>alert("x")</script>'
      })
    ];

    const artifact = createStoryExport(state, { ...DEFAULT_OPTIONS, format: 'html' });

    expect(artifact.mimeType).toBe('text/html;charset=utf-8');
    expect(artifact.content).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(artifact.content).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(artifact.content).not.toContain('<script>alert');
    expect(artifact.content).not.toContain('<img src=x');
  });

  it('only reads the player-visible story whitelist and never exports internal payloads', () => {
    const state = createStoryState() as RuntimeState & { apiKey?: string; systemPrompt?: string };
    state.apiKey = 'sk-secret-api-key';
    state.systemPrompt = 'SYSTEM_PROMPT_SECRET';
    state.storyLog[4] = {
      ...state.storyLog[4],
      rawNarratorResponse: 'RAW_MODEL_RESPONSE_SECRET',
      summaryText: 'INTERNAL_TURN_SUMMARY_SECRET',
      embeddingText: 'EMBEDDING_SOURCE_SECRET',
      suggestedActions: ['HIDDEN_SUGGESTION_SECRET'],
      writebackDiagnostics: [
        {
          code: 'INTERNAL_STATE_PATCH_SECRET',
          message: 'STATE_PATCH_SECRET',
          path: ['statePatch']
        }
      ]
    };

    for (const format of ['markdown', 'text', 'html'] as const) {
      const artifact = createStoryExport(state, { ...DEFAULT_OPTIONS, range: 'currentSave', format });
      expect(artifact.content).toContain('车牌尾数是七四。');
      expect(artifact.content).not.toContain('sk-secret-api-key');
      expect(artifact.content).not.toContain('SYSTEM_PROMPT_SECRET');
      expect(artifact.content).not.toContain('RAW_MODEL_RESPONSE_SECRET');
      expect(artifact.content).not.toContain('INTERNAL_TURN_SUMMARY_SECRET');
      expect(artifact.content).not.toContain('EMBEDDING_SOURCE_SECRET');
      expect(artifact.content).not.toContain('HIDDEN_SUGGESTION_SECRET');
      expect(artifact.content).not.toContain('STATE_PATCH_SECRET');
      expect(artifact.content).not.toContain('INTERNAL_STATE_PATCH_SECRET');
    }
  });

  it('reports the same filtered count used by the download artifact', () => {
    const state = createStoryState();
    expect(countStoryExportEntries(state, { range: 'currentChapter', includePlayerActions: true })).toBe(2);
    expect(countStoryExportEntries(state, { range: 'currentChapter', includePlayerActions: false })).toBe(1);
    expect(countStoryExportEntries(state, { range: 'currentSave', includePlayerActions: true })).toBe(5);
  });
});
