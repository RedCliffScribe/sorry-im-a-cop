import type {
  ImagePromptDialectFamily,
  SemanticImagePromptSegment
} from '../promptConversion';

export const PNG_STYLE_SOURCE_FORMATS = [
  'novelai',
  'a1111',
  'comfyui',
  'unknown'
] as const;

export type PngStyleSourceFormat = (typeof PNG_STYLE_SOURCE_FORMATS)[number];

export interface ParsedPngGenerationData {
  source: PngStyleSourceFormat;
  positivePrompt: string;
  negativePrompt: string;
  parameters?: {
    sampler?: string;
    steps?: number;
    cfg?: number;
    clipSkip?: number;
    seed?: number;
    width?: number;
    height?: number;
    model?: string;
    loras?: string[];
  };
  rawMetadata: string;
  warnings: string[];
}

export interface PngStyleParameterDraft {
  sampler?: string;
  steps?: number;
  cfg?: number;
  clipSkip?: number;
}

export interface ProtectedPromptToken {
  value: string;
  kind: 'model-trigger' | 'lora-trigger';
  enabled: boolean;
}

export interface PngStyleClassification {
  artistTokens: string[];
  reusableStyleTokens: string[];
  qualityTokens: string[];
  excludedSubjectTokens: string[];
  unclassifiedTokens: string[];
  negativeStyleTokens: string[];
}

export interface PngStylePreset {
  pngStylePresetId: string;
  name: string;
  source: {
    format: PngStyleSourceFormat;
    imageHash: string;
    parserVersion: number;
  };
  artistTokens: string[];
  protectedTokens: ProtectedPromptToken[];
  tagStyle: {
    positive: string;
    negative: string;
  };
  naturalLanguageStyle: {
    global: {
      positive: string;
      negative: string;
    };
    character: {
      positive: string;
      negative: string;
    };
    scene: {
      positive: string;
      negative: string;
    };
  };
  parameterDraft?: PngStyleParameterDraft;
  createdAt: string;
  updatedAt: string;
}

export interface PngStyleSelection {
  globalPngStylePresetId?: string;
  characterPngStylePresetId?: string;
  narrativeScenePngStylePresetId?: string;
}

export interface PngStyleLibrarySettings {
  settingsId: 'global-png-style-library';
  revision: number;
  presets: PngStylePreset[];
  selection: PngStyleSelection;
  updatedAt: string;
}

export interface PngStyleImportDraft {
  preset: PngStylePreset;
  classification: PngStyleClassification;
  warnings: string[];
}

export interface PngStyleRepository {
  load(): Promise<PngStyleLibrarySettings>;
  save(settings: PngStyleLibrarySettings): Promise<void>;
}

export type PngStyleTarget = 'character' | 'narrative-scene';

export interface PngStyleSegmentResolution {
  preset?: PngStylePreset;
  segments: SemanticImagePromptSegment[];
  dialectFamily?: ImagePromptDialectFamily;
}
