import type { AiSettings } from './types';
import { defaultDramaticContentSettings } from '../drama/settings';
import { DEFAULT_AVG_PORTRAIT_LAYOUT } from './avgPortraitLayout';

export function createDefaultAiSettings(): AiSettings {
  return {
    version: 1,
    apiProfiles: [],
    mainNarrator: null,
    featureRoutes: {
      writebackRepair: { mode: 'follow-main' },
      memorySummary: { mode: 'follow-main' },
      memoryVector: { mode: 'disabled' },
      npcSimulation: { mode: 'follow-main' },
      backgroundEvolution: { mode: 'follow-main' },
      auxiliaryGeneration: { mode: 'follow-main' }
    },
    game: {
      language: 'zh-CN',
      storyRenderLimit: 30,
      narrativeLengthLevel: 'standard',
      narrativePerspective: 'second_person',
      playerPortrayalMode: 'natural',
      autoSaveLimit: 20,
      autoSaveIntervalTurns: 1,
      rollbackSnapshotLimit: 20,
      pregnancyMode: 'standard',
      dramaticContent: {
        ...defaultDramaticContentSettings,
        channels: { ...defaultDramaticContentSettings.channels }
      }
    },
    display: {
      uiTheme: 'dark',
      storyPresentationMode: 'auto',
      avgPlayerPortraitMode: 'hidden',
      avgPortraitLayout: { ...DEFAULT_AVG_PORTRAIT_LAYOUT },
      interfaceFontFamily: 'readable',
      narrationFontFamily: 'system',
      dialogueFontFamily: 'system',
      narrationFontSize: 16,
      dialogueFontSize: 16
    },
    prompts: {
      overrides: {},
      persistentPrompts: []
    },
    tavern: {
      enabled: false,
      activePresetId: null,
      entries: [],
      customCot: {
        enabled: false,
        scope: 'both',
        content: '',
        templateId: 'natural-planning'
      },
      reasoningOutput: {
        mode: 'off',
        maxCharacters: 4000,
        showInUi: false
      }
    },
    memory: {
      autoCompressionEnabled: true,
      recentRawTurnLimit: 12,
      shortTermBatchSize: 20,
      midTermBatchSize: 15,
      longTermPromptTokenBudget: 24000
    }
  };
}
