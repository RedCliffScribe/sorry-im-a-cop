import type { NarrativeLengthLevel } from './narrativeLength';

export type ApiInterfaceType =
  | 'openai-compatible'
  | 'openai'
  | 'azure-openai'
  | 'anthropic'
  | 'google-gemini'
  | 'deepseek'
  | 'openrouter'
  | 'siliconflow'
  | 'ollama'
  | 'custom';
export type FeatureRouteId =
  | 'writebackRepair'
  | 'memorySummary'
  | 'memoryVector'
  | 'npcSimulation'
  | 'backgroundEvolution'
  | 'auxiliaryGeneration';

export interface ApiProfile {
  id: string;
  name: string;
  providerLabel: string;
  interfaceType: ApiInterfaceType;
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultMaxTokens?: number;
  defaultTemperature?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MainNarratorRoute {
  apiProfileId: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface FollowMainFeatureRoute {
  mode: 'follow-main';
}

export interface DisabledFeatureRoute {
  mode: 'disabled';
}

export interface CustomFeatureRoute {
  mode: 'custom';
  apiProfileId: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export type FeatureModelRoute = DisabledFeatureRoute | FollowMainFeatureRoute | CustomFeatureRoute;

export type PregnancyMode = 'off' | 'low' | 'standard' | 'high';
export type NarrativePerspective = 'first_person' | 'second_person' | 'third_person';

export interface GameSettings {
  storyRenderLimit: number;
  narrativeLengthLevel: NarrativeLengthLevel;
  narrativePerspective: NarrativePerspective;
  autoSaveLimit: number;
  autoSaveIntervalTurns: number;
  rollbackSnapshotLimit: number;
  pregnancyMode: PregnancyMode;
}

export type DisplayFontFamilyId =
  | 'system'
  | 'readable'
  | 'serif'
  | 'ming'
  | 'song'
  | 'fangsong'
  | 'kai'
  | 'mono';

export type UiThemeId = 'dark' | 'light';

export interface DisplaySettings {
  uiTheme: UiThemeId;
  interfaceFontFamily: DisplayFontFamilyId;
  narrationFontFamily: DisplayFontFamilyId;
  dialogueFontFamily: DisplayFontFamilyId;
  narrationFontSize: number;
  dialogueFontSize: number;
}

export interface PromptSettings {
  overrides: Record<string, string>;
}

export interface MemoryCompressionSettings {
  autoCompressionEnabled: boolean;
  recentRawTurnLimit: number;
  shortTermBatchSize: number;
  midTermBatchSize: number;
  longTermPromptTokenBudget: number;
}

export interface AiSettings {
  version: 1;
  apiProfiles: ApiProfile[];
  mainNarrator: MainNarratorRoute | null;
  featureRoutes: Record<FeatureRouteId, FeatureModelRoute>;
  game: GameSettings;
  display: DisplaySettings;
  prompts: PromptSettings;
  memory: MemoryCompressionSettings;
}
