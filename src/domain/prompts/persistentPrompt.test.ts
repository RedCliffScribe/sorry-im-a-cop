import { describe, expect, it } from 'vitest';
import { createDefaultAiSettings } from '../settings/defaultSettings';
import { compileCreativeNarratorRequest } from './creativePromptCompiler';
import {
  composePersistentPromptGuide,
  getEnabledPersistentPrompts,
  normalizePersistentPromptEntries
} from './persistentPrompt';

describe('persistent prompts', () => {
  it('normalizes valid entries, trims content and ignores duplicate ids', () => {
    expect(normalizePersistentPromptEntries([
      { id: ' first ', content: '  保持克制。  ', enabled: true },
      { id: 'first', content: '重复内容', enabled: true },
      { id: 'second', content: '保留关闭项', enabled: false },
      { id: '', content: '无效', enabled: true },
      null
    ])).toEqual([
      { id: 'first', content: '保持克制。', enabled: true },
      { id: 'second', content: '保留关闭项', enabled: false }
    ]);
  });

  it('only compiles enabled entries as a separate system instruction', () => {
    const settings = {
      ...createDefaultAiSettings().prompts,
      persistentPrompts: [
        { id: 'enabled', content: '对白保持自然。', enabled: true },
        { id: 'disabled', content: '这条不应投喂。', enabled: false }
      ]
    };
    const compilation = compileCreativeNarratorRequest({
      runtimePrompt: '当前存档事实',
      promptSettings: settings,
      scope: 'turn'
    });

    expect(compilation.persistentPromptCount).toBe(1);
    expect(compilation.messages.at(-1)).toMatchObject({
      role: 'user',
      content: '当前存档事实',
      source: 'runtime_context'
    });

    const persistentMessage = compilation.messages.find(
      (message) => message.source === 'persistent_prompt'
    );
    expect(persistentMessage?.role).toBe('system');
    expect(persistentMessage?.content).toContain('对白保持自然。');
    expect(persistentMessage?.content).not.toContain('这条不应投喂。');
    expect(persistentMessage?.content).toContain('不是玩家在本回合采取的行动');
    expect(persistentMessage?.content).toContain('不得把它们写入人物记忆');
  });

  it('keeps disabled entries stored without returning or composing them', () => {
    const settings = {
      overrides: {},
      persistentPrompts: [
        { id: 'off', content: '关闭项', enabled: false }
      ]
    };

    expect(getEnabledPersistentPrompts(settings)).toEqual([]);
    expect(composePersistentPromptGuide([])).not.toContain('关闭项');
  });
});
