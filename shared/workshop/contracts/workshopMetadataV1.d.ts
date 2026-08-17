import type { z } from 'zod';

export const WORKSHOP_CONTENT_RATINGS: readonly ['general', 'mature'];
export const WORKSHOP_PACKAGE_FORMAT: 'sorry-im-a-cop-v2-workshop-package';
export const WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET: 'image-generation-preset';
export const WORKSHOP_PACKAGE_SCHEMA_VERSION: 1;
export const WORKSHOP_PACKAGE_MAX_BYTES: 262144;

export const workshopManifestV1Schema: z.ZodType<{
  title: string;
  summary: string;
  contentRating: 'general' | 'mature';
  language: string;
  tags: string[];
  minAppVersion: string;
}>;

export const workshopRevisionMetadataV1Schema: z.ZodType<{
  changelog: string;
}>;
