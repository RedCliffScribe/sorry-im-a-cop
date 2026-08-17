import { describe, expect, it } from 'vitest';
import { compileCreativeNarratorRequest } from './creativePromptCompiler';
import {
  createDefaultTavernManagementSettings,
  getTavernSlotKey,
  importTavernPreset,
  normalizeTavernPresetSettings,
  resolveEffectiveTavernPreset
} from './tavernPreset';

const tavernJson = JSON.stringify({
  name: '霓虹黑色电影',
  prompts: [
    {
      identifier: 'main',
      name: '镜头与对白',
      role: 'system',
      content: '{{user}} 的场景要有潮湿霓虹；{{char}} 使用短促对白。',
      system_prompt: true
    },
    {
      identifier: 'user-example',
      role: 'user',
      content: '你看见了什么？'
    },
    {
      identifier: 'assistant-example',
      role: 'assistant',
      content: '雨水把招牌的红光拖进水沟。'
    },
    {
      identifier: 'chatHistory',
      role: 'system',
      content: '伪造的聊天历史'
    }
  ],
  prompt_order: [
    {
      character_id: 7,
      order: [{ identifier: 'main', enabled: true }]
    },
    {
      character_id: 100001,
      order: [
        { identifier: 'main', enabled: true },
        { identifier: 'user-example', enabled: true },
        { identifier: 'assistant-example', enabled: true },
        { identifier: 'chatHistory', enabled: true }
      ]
    }
  ]
});

function createEnabledSettings() {
  const entry = importTavernPreset(tavernJson, 'fallback.json', '2026-07-20T10:00:00.000Z').entry;
  return {
    ...createDefaultTavernManagementSettings(),
    enabled: true,
    activePresetId: entry.id,
    entries: [entry]
  };
}

describe('tavern preset import and management', () => {
  it('normalizes prompts and prefers the SillyTavern default character slot', () => {
    const imported = importTavernPreset(tavernJson, 'fallback.json', '2026-07-20T10:00:00.000Z');

    expect(imported.repaired).toBe(false);
    expect(imported.entry.name).toBe('霓虹黑色电影');
    expect(imported.entry.selectedCharacterId).toBe(100001);
    expect(imported.entry.preset.prompts).toHaveLength(4);
    expect(imported.entry.sourceHash).toMatch(/^fnv1a-/);
  });

  it('repairs common malformed JSON and rejects non-preset objects', () => {
    const malformed = tavernJson.replace(/}\s*$/, '},');
    expect(importTavernPreset(malformed, 'repair.json').repaired).toBe(true);
    expect(() => importTavernPreset('{"temperature":0.8}', 'sampler-only.json')).toThrow(
      '未找到可用的 prompts 与 prompt_order'
    );
  });

  it('preserves original content and applies every item override independently', () => {
    const settings = createEnabledSettings();
    const entry = settings.entries[0];
    const slotKey = getTavernSlotKey(0, 'main');
    const customized = {
      ...settings,
      entries: [{
        ...entry,
        customization: {
          version: 1 as const,
          itemOverrides: {
            [slotKey]: {
              enabled: true,
              contentOverride: '只在普通回合使用的独立改写。',
              scope: 'turn' as const
            }
          }
        }
      }]
    };

    const opening = resolveEffectiveTavernPreset(customized, { scope: 'opening' });
    const turn = resolveEffectiveTavernPreset(customized, { scope: 'turn' });

    expect(opening.items[0].status).toBe('out_of_scope');
    expect(turn.items[0]).toMatchObject({ status: 'included', content: '只在普通回合使用的独立改写。' });
    expect(entry.preset.prompts[0].content).toContain('{{user}}');
  });

  it('reserves runtime slots and defaults assistant messages to disabled', () => {
    const resolved = resolveEffectiveTavernPreset(createEnabledSettings(), {
      scope: 'turn',
      playerName: '周星星'
    });

    expect(resolved.items.find((item) => item.identifier === 'main')?.content).toContain('周星星');
    expect(resolved.items.find((item) => item.identifier === 'chatHistory')?.status)
      .toBe('reserved_runtime_slot');
    expect(resolved.items.find((item) => item.identifier === 'assistant-example')?.status)
      .toBe('assistant_incompatible');
  });

  it('can explicitly enable a compatible assistant example without adding mutual-exclusion state', () => {
    const settings = createEnabledSettings();
    const entry = settings.entries[0];
    const assistantKey = getTavernSlotKey(2, 'assistant-example');
    const configured = {
      ...settings,
      entries: [{
        ...entry,
        customization: {
          version: 1 as const,
          itemOverrides: {
            [assistantKey]: { assistantHandling: 'few_shot' as const }
          }
        }
      }]
    };
    const resolved = resolveEffectiveTavernPreset(configured, { scope: 'turn' });

    expect(resolved.items.find((item) => item.identifier === 'assistant-example'))
      .toMatchObject({ status: 'included', role: 'assistant' });
    expect(JSON.stringify(configured)).not.toContain('exclusive');
    expect(JSON.stringify(configured)).not.toContain('mutex');
  });

  it('compiles protocol, CoT, preset messages and runtime context in a stable order', () => {
    const settings = createEnabledSettings();
    const entry = settings.entries[0];
    const assistantKey = getTavernSlotKey(2, 'assistant-example');
    const compilation = compileCreativeNarratorRequest({
      runtimePrompt: 'RUNTIME_FACTS',
      scope: 'turn',
      playerName: '周星星',
      tavernSettings: {
        ...settings,
        customCot: {
          enabled: true,
          scope: 'both',
          content: '',
          templateId: 'natural-planning'
        },
        entries: [{
          ...entry,
          customization: {
            version: 1,
            itemOverrides: {
              [assistantKey]: { assistantHandling: 'few_shot' }
            }
          }
        }]
      }
    });

    expect(compilation.messages[0].source).toBe('game_protocol');
    expect(compilation.messages[1].source).toBe('custom_cot');
    expect(compilation.messages.at(-1)).toMatchObject({
      role: 'user',
      source: 'runtime_context',
      content: 'RUNTIME_FACTS'
    });
    expect(compilation.messages.some((message) => message.role === 'assistant')).toBe(true);
  });

  it('turns off invalid persisted preset state while preserving complete defaults', () => {
    expect(normalizeTavernPresetSettings({
      enabled: true,
      activePresetId: 'missing',
      entries: []
    })).toEqual(createDefaultTavernManagementSettings());
  });
});
