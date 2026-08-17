import type { z } from 'zod';

export type WorkshopImageProviderType =
  | 'openai-images'
  | 'xai-images'
  | 'gemini-image'
  | 'alibaba-model-studio'
  | 'novelai-image'
  | 'comfyui-workflow'
  | 'sd-webui';

export type WorkshopVisualPurpose =
  | 'avatar-close-up'
  | 'half-body-medium'
  | 'knee-up-medium-full'
  | 'full-body'
  | 'narrative-scene';

export type WorkshopPackageErrorCode =
  | 'invalid-json'
  | 'package-too-large'
  | 'invalid-package'
  | 'unsupported-schema'
  | 'sensitive-content'
  | 'structure-too-complex';

export interface WorkshopPackageIssue {
  path: PropertyKey[];
  code: string;
  message: string;
}

export interface WorkshopPackageContractFailure {
  success: false;
  error: {
    code: WorkshopPackageErrorCode;
    message: string;
    issues: WorkshopPackageIssue[];
  };
}

export interface WorkshopPromptModifierV1 {
  positive: string;
  negative: string;
}

export interface ImageGenerationPresetPackageV1 {
  format: 'sorry-im-a-cop-v2-workshop-package';
  schemaVersion: 1;
  kind: 'image-generation-preset';
  manifest: {
    title: string;
    summary: string;
    contentRating: 'general' | 'mature';
    language: string;
    tags: string[];
    minAppVersion: string;
  };
  compatibility: {
    providerTypes: WorkshopImageProviderType[];
    modelHints: string[];
    requiredFeatures: string[];
  };
  content: {
    variants: Array<{
      variantRef: string;
      purpose: WorkshopVisualPurpose;
      name: string;
      providerType: WorkshopImageProviderType;
      modelHint?: string;
      dialectRef?: string;
      styleRefs: string[];
      comfyStyleRecipeRef?: string;
      targetAspectRatio?: string;
    }>;
    stylePresets: Array<{
      styleRef: string;
      name: string;
      description: string;
      modifiers: {
        global: WorkshopPromptModifierV1;
        character: WorkshopPromptModifierV1;
        narrativeScene: WorkshopPromptModifierV1;
      };
    }>;
    dialectPresets: Array<{
      dialectRef: string;
      name: string;
      description: string;
      family: string;
      renderingInstruction: string;
      positivePrefix: string;
      positiveSuffix: string;
      negativePrefix: string;
      negativeSuffix: string;
    }>;
    comfyStyleRecipes: Array<Record<string, unknown>>;
    styleSelection: {
      globalStyleRef?: string;
      characterStyleRef?: string;
      narrativeSceneStyleRef?: string;
      characterStyleMode?: 'inherit-global' | 'replace-global';
      narrativeSceneStyleMode?: 'inherit-global' | 'replace-global';
    };
    safeGenerationParameters: Array<{
      variantRef: string;
      parameters: Record<string, unknown> & { providerType: WorkshopImageProviderType };
    }>;
  };
}

export interface WorkshopPackageContractSuccess {
  success: true;
  data: ImageGenerationPresetPackageV1;
  byteLength: number;
}

export const WORKSHOP_IMAGE_PROVIDER_TYPES: readonly WorkshopImageProviderType[];
export const WORKSHOP_VISUAL_PURPOSES: readonly WorkshopVisualPurpose[];
export const WORKSHOP_PROMPT_DIALECT_FAMILIES: readonly string[];
export const WORKSHOP_REQUIRED_FEATURES: readonly string[];
export const WORKSHOP_PACKAGE_ERROR_CODES: readonly WorkshopPackageErrorCode[];
export const workshopSafeGenerationParametersV1Schema: z.ZodType<Record<string, unknown>>;
export const imageGenerationPresetPackageV1Schema: z.ZodType<ImageGenerationPresetPackageV1>;

export function measureWorkshopPackageBytes(value: unknown): number;
export function scanWorkshopShareableValueV1(
  value: unknown
): { success: true } | WorkshopPackageContractFailure;
export function parseImageGenerationPresetPackageV1(
  value: unknown,
  options?: { maximumBytes?: number }
): WorkshopPackageContractSuccess | WorkshopPackageContractFailure;
export function parseImageGenerationPresetPackageJsonV1(
  jsonText: string,
  options?: { maximumBytes?: number }
): WorkshopPackageContractSuccess | WorkshopPackageContractFailure;
export function canonicalizeImageGenerationPresetPackageV1(value: unknown): string;
export function calculateImageGenerationPresetPackageSha256V1(value: unknown): Promise<string>;

export class WorkshopPackageContractError extends Error {
  code: WorkshopPackageErrorCode;
  issues: WorkshopPackageIssue[];
  constructor(contractError: WorkshopPackageContractFailure['error']);
}
