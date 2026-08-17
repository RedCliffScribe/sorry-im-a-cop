import type { NarrativeLengthLevel } from './narrativeLength';
import type { AppLocale } from '../localization/appLocale';
import type { DramaticContentSettings } from '../drama/types';
import type { AvgPlayerPortraitMode } from '../avgPresentation';

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

export type ApiCapabilitySupport = 'auto' | 'supported' | 'unsupported';

export interface ApiProfileCapabilities {
  jsonObjectResponseFormat: ApiCapabilitySupport;
  maxOutputTokens?: number;
  streamingJson: ApiCapabilitySupport;
}

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
  capabilities?: ApiProfileCapabilities;
  createdAt: string;
  updatedAt: string;
}

export interface MainNarratorRoute {
  apiProfileId: string;
  model: string;
  maxTokensMode?: 'inherit' | 'custom';
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
export type PlayerPortrayalMode = 'original' | 'player_led' | 'natural';

export interface GameSettings {
  language?: AppLocale;
  storyRenderLimit: number;
  narrativeLengthLevel: NarrativeLengthLevel;
  narrativePerspective: NarrativePerspective;
  playerPortrayalMode: PlayerPortrayalMode;
  autoSaveLimit: number;
  autoSaveIntervalTurns: number;
  rollbackSnapshotLimit: number;
  pregnancyMode: PregnancyMode;
  dramaticContent?: DramaticContentSettings;
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
export type StoryPresentationMode = 'auto' | 'avg' | 'text';

export interface DisplaySettings {
  uiTheme: UiThemeId;
  storyPresentationMode?: StoryPresentationMode;
  avgPlayerPortraitMode: AvgPlayerPortraitMode;
  interfaceFontFamily: DisplayFontFamilyId;
  narrationFontFamily: DisplayFontFamilyId;
  dialogueFontFamily: DisplayFontFamilyId;
  narrationFontSize: number;
  dialogueFontSize: number;
}

export interface PersistentPromptEntry {
  id: string;
  content: string;
  enabled: boolean;
}

export interface PromptSettings {
  overrides: Record<string, string>;
  persistentPrompts?: PersistentPromptEntry[];
}

export type TavernPresetMessageRole = 'system' | 'user' | 'assistant';

export interface TavernPresetPrompt {
  identifier: string;
  name?: string;
  role: TavernPresetMessageRole;
  content: string;
  systemPrompt: boolean;
}

export interface TavernPresetOrderItem {
  identifier: string;
  enabled: boolean;
}

export interface TavernPresetOrder {
  characterId: number;
  order: TavernPresetOrderItem[];
}

export interface TavernPreset {
  prompts: TavernPresetPrompt[];
  promptOrder: TavernPresetOrder[];
}

export type TavernPresetScope = 'opening' | 'turn' | 'both';
export type TavernAssistantHandling = 'disabled' | 'few_shot' | 'creative_rule';

export interface TavernPresetItemOverride {
  enabled?: boolean;
  contentOverride?: string;
  scope?: TavernPresetScope;
  assistantHandling?: TavernAssistantHandling;
}

export interface TavernPresetCustomization {
  version: 1;
  itemOverrides: Record<string, TavernPresetItemOverride>;
}

export interface ManagedTavernPresetEntry {
  id: string;
  name: string;
  importedAt: string;
  sourceHash: string;
  selectedCharacterId: number;
  preset: TavernPreset;
  customization: TavernPresetCustomization;
}

export interface CustomCotSettings {
  enabled: boolean;
  scope: TavernPresetScope;
  content: string;
  templateId: 'natural-planning' | 'custom';
}

export type ReasoningOutputMode = 'off' | 'provider' | 'json';

export interface ReasoningOutputSettings {
  mode: ReasoningOutputMode;
  maxCharacters: number;
  showInUi: boolean;
}

export interface TavernManagementSettings {
  enabled: boolean;
  activePresetId: string | null;
  entries: ManagedTavernPresetEntry[];
  customCot: CustomCotSettings;
  reasoningOutput: ReasoningOutputSettings;
}

/** Legacy aliases kept only for source compatibility while persisted settings migrate. */
export type TavernPresetEntry = ManagedTavernPresetEntry;
export type TavernPresetSettings = TavernManagementSettings;

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
  tavern: TavernManagementSettings;
  memory: MemoryCompressionSettings;
}
