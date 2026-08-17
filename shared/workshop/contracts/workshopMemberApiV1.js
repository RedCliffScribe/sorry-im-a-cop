import { z } from 'zod';
import { imageGenerationPresetPackageV1Schema } from './imageGenerationPresetPackageV1.js';
import {
  WORKSHOP_CONTENT_RATINGS,
  WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET,
  workshopRevisionMetadataV1Schema
} from './workshopMetadataV1.js';

const isoDate = z.string().datetime({ offset: true });
const stableId = z.string().trim().min(1).max(100);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const WORKSHOP_MEMBER_ITEM_STATUSES = [
  'published',
  'unlisted',
  'disabled',
  'deleted'
];

export const workshopSessionUserV1Schema = z.object({
  userId: stableId,
  displayName: z.string().trim().min(1).max(80),
  avatarRef: z.string().trim().min(1).max(500).nullable(),
  role: z.enum(['member', 'admin'])
}).strict();

export const workshopSessionResponseV1Schema = z.discriminatedUnion('authenticated', [
  z.object({ authenticated: z.literal(false) }).strict(),
  z.object({
    authenticated: z.literal(true),
    user: workshopSessionUserV1Schema
  }).strict()
]);

export const workshopLoginStartResponseV1Schema = z.object({
  ok: z.literal(true),
  authorizationUrl: z.string().url()
}).strict();

export const workshopMemberRevisionV1Schema = z.object({
  revisionId: stableId,
  revisionNumber: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  packageSha256: sha256,
  byteSize: z.number().int().min(1).max(262144),
  changelog: z.string().trim().min(1).max(2000),
  createdAt: isoDate
}).strict();

export const workshopMemberItemV1Schema = z.object({
  itemId: stableId,
  kind: z.literal(WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(2000),
  language: z.string().trim().min(2).max(35),
  contentRating: z.enum(WORKSHOP_CONTENT_RATINGS),
  tags: z.array(z.string().trim().min(1).max(32)).max(16),
  status: z.enum(WORKSHOP_MEMBER_ITEM_STATUSES),
  disabledReason: z.string().trim().min(1).max(1000).nullable(),
  latestRevision: workshopMemberRevisionV1Schema.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate
}).strict();

export const workshopMemberListResponseV1Schema = z.object({
  ok: z.literal(true),
  items: z.array(workshopMemberItemV1Schema).max(100)
}).strict();

export const workshopPublishResultV1Schema = z.object({
  ok: z.literal(true),
  itemId: stableId,
  revisionId: stableId,
  revisionNumber: z.number().int().positive(),
  status: z.enum(WORKSHOP_MEMBER_ITEM_STATUSES),
  packageSha256: sha256
}).strict();

export const workshopMutationResultV1Schema = z.object({
  ok: z.literal(true),
  itemId: stableId,
  status: z.enum(WORKSHOP_MEMBER_ITEM_STATUSES)
}).strict();

export const workshopCreateItemRequestV1Schema = z.object({
  package: imageGenerationPresetPackageV1Schema,
  revision: workshopRevisionMetadataV1Schema,
  rightsConfirmed: z.literal(true),
  turnstileToken: z.string().trim().min(1).max(2048)
}).strict();

export const workshopCreateRevisionRequestV1Schema = z.object({
  package: imageGenerationPresetPackageV1Schema,
  revision: workshopRevisionMetadataV1Schema,
  rightsConfirmed: z.literal(true),
  turnstileToken: z.string().trim().min(1).max(2048)
}).strict();

export const workshopUpdateItemRequestV1Schema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(2000),
  language: z.string().trim().min(2).max(35),
  contentRating: z.enum(WORKSHOP_CONTENT_RATINGS),
  tags: z.array(z.string().trim().min(1).max(32)).max(16)
}).strict();

export const workshopLogoutResponseV1Schema = z.object({ ok: z.literal(true) }).strict();
