import { z } from 'zod';

const stableId = z.string().trim().min(1).max(100);
const isoDate = z.string().datetime({ offset: true });
const auditScalar = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);
const auditSummary = z.record(z.string().min(1).max(80), auditScalar).nullable();

export const WORKSHOP_ADMIN_ACTIONS = [
  'item_disabled',
  'item_restored',
  'user_suspended',
  'user_restored'
];

export const workshopAdminReasonRequestV1Schema = z.object({
  reason: z.string().trim().min(3).max(1000),
  confirmation: stableId
}).strict();

export const workshopAdminItemV1Schema = z.object({
  itemId: stableId,
  title: z.string().trim().min(1).max(120),
  status: z.enum(['published', 'unlisted', 'disabled', 'deleted']),
  disabledReason: z.string().trim().min(1).max(1000).nullable(),
  previousStatus: z.enum(['published', 'unlisted']).nullable(),
  owner: z.object({
    userId: stableId,
    displayName: z.string().trim().min(1).max(80),
    role: z.enum(['member', 'admin']),
    status: z.enum(['active', 'suspended'])
  }).strict(),
  updatedAt: isoDate
}).strict();

export const workshopAdminUserV1Schema = z.object({
  userId: stableId,
  displayName: z.string().trim().min(1).max(80),
  avatarRef: z.string().trim().min(1).max(500).nullable(),
  role: z.enum(['member', 'admin']),
  status: z.enum(['active', 'suspended']),
  itemCount: z.number().int().nonnegative(),
  revisionCount: z.number().int().nonnegative(),
  storedBytes: z.number().int().nonnegative(),
  createdAt: isoDate,
  lastLoginAt: isoDate.nullable()
}).strict();

export const workshopAdminAuditEntryV1Schema = z.object({
  actionId: stableId,
  actor: z.object({
    userId: stableId,
    displayName: z.string().trim().min(1).max(80)
  }).strict(),
  action: z.enum(WORKSHOP_ADMIN_ACTIONS),
  targetType: z.enum(['item', 'user']),
  targetId: stableId,
  reason: z.string().trim().min(1).max(1000),
  beforeSummary: auditSummary,
  afterSummary: auditSummary,
  createdAt: isoDate
}).strict();

export const workshopAdminItemsResponseV1Schema = z.object({
  ok: z.literal(true),
  items: z.array(workshopAdminItemV1Schema).max(100)
}).strict();

export const workshopAdminUsersResponseV1Schema = z.object({
  ok: z.literal(true),
  users: z.array(workshopAdminUserV1Schema).max(100)
}).strict();

export const workshopAdminAuditResponseV1Schema = z.object({
  ok: z.literal(true),
  actions: z.array(workshopAdminAuditEntryV1Schema).max(100)
}).strict();

export const workshopAdminMutationResultV1Schema = z.object({
  ok: z.literal(true),
  actionId: stableId,
  targetType: z.enum(['item', 'user']),
  targetId: stableId,
  status: z.enum(['published', 'unlisted', 'disabled', 'active', 'suspended'])
}).strict();
