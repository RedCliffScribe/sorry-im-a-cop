import { z } from 'zod';
import {
  WORKSHOP_CONTENT_RATINGS,
  WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET
} from './workshopMetadataV1.js';
import {
  WORKSHOP_IMAGE_PROVIDER_TYPES,
  WORKSHOP_REQUIRED_FEATURES,
  WORKSHOP_VISUAL_PURPOSES
} from './imageGenerationPresetPackageV1.js';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const isoDate = z.string().datetime({ offset: true });

export const workshopPublicCompatibilityV1Schema = z.object({
  providerTypes: z.array(z.enum(WORKSHOP_IMAGE_PROVIDER_TYPES)).min(1).max(WORKSHOP_IMAGE_PROVIDER_TYPES.length),
  purposes: z.array(z.enum(WORKSHOP_VISUAL_PURPOSES)).min(1).max(WORKSHOP_VISUAL_PURPOSES.length),
  modelHints: z.array(z.string().trim().min(1).max(200)).max(32),
  requiredFeatures: z.array(z.enum(WORKSHOP_REQUIRED_FEATURES)).max(WORKSHOP_REQUIRED_FEATURES.length),
  minAppVersion: z.string().trim().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
}).strict();

export const workshopPublicAuthorV1Schema = z.object({
  authorId: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(80),
  avatarRef: z.string().trim().min(1).max(500).nullable()
}).strict();

export const workshopPublicRevisionV1Schema = z.object({
  revisionId: z.string().trim().min(1).max(100),
  revisionNumber: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  packageSha256: sha256,
  byteSize: z.number().int().min(1).max(262144),
  compatibility: workshopPublicCompatibilityV1Schema,
  changelog: z.string().trim().min(1).max(2000),
  createdAt: isoDate
}).strict();

export const workshopPublicItemV1Schema = z.object({
  itemId: z.string().trim().min(1).max(100),
  kind: z.literal(WORKSHOP_PACKAGE_KIND_IMAGE_GENERATION_PRESET),
  slug: z.string().trim().min(1).max(120).nullable(),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(2000),
  language: z.string().trim().min(2).max(35),
  contentRating: z.enum(WORKSHOP_CONTENT_RATINGS),
  tags: z.array(z.string().trim().min(1).max(32)).max(16),
  author: workshopPublicAuthorV1Schema,
  downloadCount: z.number().int().nonnegative(),
  latestRevision: workshopPublicRevisionV1Schema,
  createdAt: isoDate,
  updatedAt: isoDate
}).strict();

export const workshopPublicListResponseV1Schema = z.object({
  ok: z.literal(true),
  items: z.array(workshopPublicItemV1Schema),
  nextCursor: z.string().min(1).max(1000).nullable()
}).strict();

export const workshopPublicDetailResponseV1Schema = z.object({
  ok: z.literal(true),
  item: workshopPublicItemV1Schema
}).strict();

export const workshopPublicErrorResponseV1Schema = z.object({
  ok: z.literal(false),
  code: z.enum([
    'invalid_request',
    'not_found',
    'workshop_not_configured',
    'workshop_temporarily_unavailable',
    'workshop_package_unavailable',
    'workshop_package_integrity_failed',
    'authentication_required',
    'session_expired',
    'csrf_failed',
    'invalid_origin',
    'turnstile_failed',
    'oauth_not_configured',
    'oauth_state_invalid',
    'oauth_exchange_failed',
    'upload_disabled',
    'quota_exceeded',
    'ownership_required',
    'item_locked',
    'idempotency_required',
    'package_invalid',
    'conflict',
    'method_not_allowed'
  ]),
  message: z.string().trim().min(1).max(500),
  requestId: z.string().min(1).max(100)
}).strict();
