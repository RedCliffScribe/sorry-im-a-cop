import type { AiSettings } from './types';

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
      storyRenderLimit: 30,
      narrativeLengthLevel: 'standard',
      narrativePerspective: 'second_person',
      autoSaveLimit: 20,
      autoSaveIntervalTurns: 1,
      rollbackSnapshotLimit: 20,
      pregnancyMode: 'standard'
    },
    display: {
      uiTheme: 'dark',
      interfaceFontFamily: 'readable',
      narrationFontFamily: 'system',
      dialogueFontFamily: 'system',
      narrationFontSize: 16,
      dialogueFontSize: 16
    },
    prompts: {
      overrides: {}
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
