import type { z } from 'zod';

export interface WorkshopPublicCompatibilityV1 {
  providerTypes: string[];
  purposes: string[];
  modelHints: string[];
  requiredFeatures: string[];
  minAppVersion: string;
}

export interface WorkshopPublicItemV1 {
  itemId: string;
  kind: 'image-generation-preset';
  slug: string | null;
  title: string;
  summary: string;
  language: string;
  contentRating: 'general' | 'mature';
  tags: string[];
  author: { authorId: string; displayName: string; avatarRef: string | null };
  latestRevision: {
    revisionId: string;
    revisionNumber: number;
    schemaVersion: number;
    packageSha256: string;
    byteSize: number;
    compatibility: WorkshopPublicCompatibilityV1;
    changelog: string;
    createdAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const workshopPublicCompatibilityV1Schema: z.ZodType<WorkshopPublicCompatibilityV1>;
export const workshopPublicAuthorV1Schema: z.ZodType<WorkshopPublicItemV1['author']>;
export const workshopPublicRevisionV1Schema: z.ZodType<WorkshopPublicItemV1['latestRevision']>;
export const workshopPublicItemV1Schema: z.ZodType<WorkshopPublicItemV1>;
export const workshopPublicListResponseV1Schema: z.ZodType<{
  ok: true;
  items: WorkshopPublicItemV1[];
  nextCursor: string | null;
}>;
export const workshopPublicDetailResponseV1Schema: z.ZodType<{
  ok: true;
  item: WorkshopPublicItemV1;
}>;
export const workshopPublicErrorResponseV1Schema: z.ZodType<{
  ok: false;
  code: string;
  message: string;
  requestId: string;
}>;
