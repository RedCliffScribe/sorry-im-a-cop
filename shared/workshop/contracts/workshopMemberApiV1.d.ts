import type { z } from 'zod';
import type { ImageGenerationPresetPackageV1 } from './imageGenerationPresetPackageV1.js';

export const WORKSHOP_MEMBER_ITEM_STATUSES: readonly ['published', 'unlisted', 'disabled', 'deleted'];

export const workshopSessionUserV1Schema: z.ZodType<{
  userId: string;
  displayName: string;
  avatarRef: string | null;
  role: 'member' | 'admin';
}>;

export const workshopSessionResponseV1Schema: z.ZodType<
  | { authenticated: false }
  | { authenticated: true; user: z.infer<typeof workshopSessionUserV1Schema> }
>;

export const workshopLoginStartResponseV1Schema: z.ZodType<{
  ok: true;
  authorizationUrl: string;
}>;

export interface WorkshopMemberRevisionV1 {
  revisionId: string;
  revisionNumber: number;
  schemaVersion: number;
  packageSha256: string;
  byteSize: number;
  changelog: string;
  createdAt: string;
}

export interface WorkshopMemberItemV1 {
  itemId: string;
  kind: 'image-generation-preset';
  title: string;
  summary: string;
  language: string;
  contentRating: 'general' | 'mature';
  tags: string[];
  status: 'published' | 'unlisted' | 'disabled' | 'deleted';
  disabledReason: string | null;
  latestRevision: WorkshopMemberRevisionV1 | null;
  createdAt: string;
  updatedAt: string;
}

export const workshopMemberRevisionV1Schema: z.ZodType<WorkshopMemberRevisionV1>;
export const workshopMemberItemV1Schema: z.ZodType<WorkshopMemberItemV1>;
export const workshopMemberListResponseV1Schema: z.ZodType<{ ok: true; items: WorkshopMemberItemV1[] }>;
export const workshopPublishResultV1Schema: z.ZodType<{
  ok: true;
  itemId: string;
  revisionId: string;
  revisionNumber: number;
  status: 'published' | 'unlisted' | 'disabled' | 'deleted';
  packageSha256: string;
}>;
export const workshopMutationResultV1Schema: z.ZodType<{
  ok: true;
  itemId: string;
  status: 'published' | 'unlisted' | 'disabled' | 'deleted';
}>;
export const workshopCreateItemRequestV1Schema: z.ZodType<{
  package: ImageGenerationPresetPackageV1;
  revision: { changelog: string };
  rightsConfirmed: true;
  turnstileToken: string;
}>;
export const workshopCreateRevisionRequestV1Schema: typeof workshopCreateItemRequestV1Schema;
export const workshopUpdateItemRequestV1Schema: z.ZodType<{
  title: string;
  summary: string;
  language: string;
  contentRating: 'general' | 'mature';
  tags: string[];
}>;
export const workshopLogoutResponseV1Schema: z.ZodType<{ ok: true }>;
