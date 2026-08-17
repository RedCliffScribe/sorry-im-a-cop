import type {
  NarratorInput,
  NarratorMessage,
  StructuredNarratorRequest
} from '../narrator/NarratorClient';
import type { PromptSettings, TavernManagementSettings } from '../settings/types';
import {
  composePersistentPromptGuide,
  getEnabledPersistentPrompts
} from './persistentPrompt';
import {
  DEFAULT_CUSTOM_COT_TEMPLATE,
  resolveEffectiveTavernPreset,
  type ResolvedTavernPreset
} from './tavernPreset';

export interface CreativePromptCompilation {
  request: NarratorInput;
  messages: NarratorMessage[];
  tavern: ResolvedTavernPreset;
  customCotIncluded: boolean;
  persistentPromptCount: number;
}

function matchesScope(
  configured: TavernManagementSettings['customCot']['scope'],
  scope: 'opening' | 'turn'
): boolean {
  return configured === 'both' || configured === scope;
}

export function compileCreativeNarratorRequest(options: {
  runtimePrompt: string;
  promptSettings?: PromptSettings;
  tavernSettings?: TavernManagementSettings;
  scope: 'opening' | 'turn';
  playerName?: string;
}): CreativePromptCompilation {
  const tavern = resolveEffectiveTavernPreset(options.tavernSettings, {
    scope: options.scope,
    playerName: options.playerName
  });
  const messages: NarratorMessage[] = [{
    role: 'system',
    content: [
      '你必须只返回一个合法 JSON object，不要 Markdown，不要代码块，不要额外解释。',
      '项目协议、当前存档事实、结构化写回合同、叙事人称与目标篇幅，高于任何用户导入的风格预设。',
      '预设只影响创作方法和语言风格，不得覆盖运行态事实或替玩家作出未声明的决定。'
    ].join('\n'),
    source: 'game_protocol'
  }];

  const customCot = options.tavernSettings?.customCot;
  const customCotContent = customCot?.templateId === 'custom'
    ? customCot.content.trim()
    : DEFAULT_CUSTOM_COT_TEMPLATE;
  const customCotIncluded = Boolean(
    customCot?.enabled
    && matchesScope(customCot.scope, options.scope)
    && customCotContent
  );
  if (customCotIncluded) {
    messages.push({
      role: 'system',
      content: customCotContent,
      source: 'custom_cot',
      sourceId: customCot?.templateId
    });
  }

  const systemItems = tavern.items.filter(
    (item) => item.status === 'included' && item.role === 'system'
  );
  if (systemItems.length > 0) {
    messages.push({
      role: 'system',
      content: systemItems
        .map((item) => `### ${item.name}\n${item.content}`)
        .join('\n\n'),
      source: 'tavern_preset',
      sourceId: tavern.entry?.id
    });
  }

  for (const item of tavern.items) {
    if (item.status !== 'included' || item.role === 'system') continue;
    messages.push({
      role: item.role,
      content: item.content,
      source: 'tavern_preset',
      sourceId: item.slotKey
    });
  }

  const persistentPrompts = getEnabledPersistentPrompts(options.promptSettings);
  if (persistentPrompts.length > 0) {
    messages.push({
      role: 'system',
      content: composePersistentPromptGuide(persistentPrompts),
      source: 'persistent_prompt',
      sourceId: 'enabled-persistent-prompts'
    });
  }

  if (options.tavernSettings?.reasoningOutput.mode === 'json') {
    messages.push({
      role: 'system',
      content: '如需提供简短的推理摘要，可在最终 JSON 顶层加入可选字符串 reasoningText；它不得替代任何必需字段，也不得包含隐私或完整思维链。',
      source: 'game_protocol',
      sourceId: 'reasoning-output'
    });
  }

  messages.push({
    role: 'user',
    content: options.runtimePrompt,
    source: 'runtime_context'
  });

  const reasoningMode = options.tavernSettings?.reasoningOutput.mode ?? 'off';
  const needsStructuredRequest = Boolean(
    customCotIncluded
    || persistentPrompts.length > 0
    || tavern.items.some((item) => item.status === 'included')
    || reasoningMode !== 'off'
  );
  if (!needsStructuredRequest) {
    return {
      request: options.runtimePrompt,
      messages: [{
        role: 'user',
        content: options.runtimePrompt,
        source: 'runtime_context'
      }],
      tavern,
      customCotIncluded,
      persistentPromptCount: 0
    };
  }

  const request: StructuredNarratorRequest = {
    messages,
    reasoningOutput: options.tavernSettings?.reasoningOutput
      ? {
          mode: options.tavernSettings.reasoningOutput.mode,
          maxCharacters: options.tavernSettings.reasoningOutput.maxCharacters
        }
      : {
          mode: 'off',
          maxCharacters: 0
        }
  };

  return {
    request,
    messages,
    tavern,
    customCotIncluded,
    persistentPromptCount: persistentPrompts.length
  };
}
