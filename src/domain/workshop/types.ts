import type { ImageGenerationPreset, ImageGenerationVariantKey } from '../imageGeneration/generationPresets';
import type { ImageProviderType } from '../imageGeneration/probe';
import type { ComfyWorkflowTemplate, ImageApiProfile } from '../imageGeneration/profile';
import type { ImagePromptTemplateSettings } from '../imageGeneration/promptConversion';
import type { ImageGenerationPresetPackageV1 } from '../../../shared/workshop/contracts/imageGenerationPresetPackageV1.js';

export interface WorkshopPackageManifestInput {
  title: string;
  summary: string;
  contentRating: 'general' | 'mature';
  language: string;
  tags: string[];
  minAppVersion: string;
}

export interface WorkshopPackageExportResult {
  workshopPackage: ImageGenerationPresetPackageV1;
  json: string;
  packageSha256: string;
  byteLength: number;
  excludedLocalFields: string[];
}

export interface WorkshopVariantImportMapping {
  variantRef: string;
  profileId: string;
  routingTarget:
    | { kind: 'model'; modelId: string }
    | { kind: 'comfy-workflow'; workflowTemplateId: string };
}

export type WorkshopImportCompatibilityStatus =
  | 'compatible'
  | 'mapping-required'
  | 'app-update-required'
  | 'unsupported';

export interface WorkshopVariantCompatibilityPreview {
  variantRef: string;
  name: string;
  purpose: ImageGenerationVariantKey;
  providerType: ImageProviderType;
  matchingProfileIds: string[];
  modelHint?: string;
  mappingValid: boolean;
  details: string[];
}

export interface WorkshopPackageImportPreview {
  status: WorkshopImportCompatibilityStatus;
  summary: string;
  details: string[];
  variants: WorkshopVariantCompatibilityPreview[];
  importedStyleCount: number;
  importedDialectCount: number;
  importedComfyRecipeCount: number;
  stylesWillRemainInactive: true;
}

export type WorkshopImportConflictStrategy =
  | 'fail-on-conflict'
  | 'replace-target'
  | 'update-same-source';

export interface WorkshopImportSourceMetadata {
  itemId?: string;
  revisionId?: string;
  authorDisplayName?: string;
}

export interface WorkshopImportSourceRecord {
  sourceRecordId: string;
  originKey: string;
  localPresetId: string;
  localProfileId: string;
  variantKey: ImageGenerationVariantKey;
  variantRef: string;
  packageSha256: string;
  itemId?: string;
  revisionId?: string;
  authorDisplayName?: string;
  importedStylePresetIds: string[];
  importedDialectPresetIds: string[];
  importedComfyRecipeIds: string[];
  importedAt: string;
}

export interface WorkshopImportSourceRepository {
  get(localPresetId: string): Promise<WorkshopImportSourceRecord | undefined>;
  listByOriginKey(originKey: string): Promise<WorkshopImportSourceRecord[]>;
  save(record: WorkshopImportSourceRecord): Promise<void>;
  delete(localPresetId: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface WorkshopPackageImportResult {
  presets: ImageGenerationPreset[];
  promptTemplateSettings: ImagePromptTemplateSettings;
  sourceRecords: WorkshopImportSourceRecord[];
  warnings: string[];
}

export interface WorkshopPackageLocalEnvironment {
  profiles: ImageApiProfile[];
  workflows: ComfyWorkflowTemplate[];
  promptTemplateSettings: ImagePromptTemplateSettings;
}
