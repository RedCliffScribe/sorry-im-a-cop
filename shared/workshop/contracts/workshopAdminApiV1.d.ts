import type { z } from 'zod';

export const WORKSHOP_ADMIN_ACTIONS: readonly [
  'item_disabled',
  'item_restored',
  'user_suspended',
  'user_restored'
];

export interface WorkshopAdminItemV1 {
  itemId: string;
  title: string;
  status: 'published' | 'unlisted' | 'disabled' | 'deleted';
  disabledReason: string | null;
  previousStatus: 'published' | 'unlisted' | null;
  owner: {
    userId: string;
    displayName: string;
    role: 'member' | 'admin';
    status: 'active' | 'suspended';
  };
  updatedAt: string;
}

export interface WorkshopAdminUserV1 {
  userId: string;
  displayName: string;
  avatarRef: string | null;
  role: 'member' | 'admin';
  status: 'active' | 'suspended';
  itemCount: number;
  revisionCount: number;
  storedBytes: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface WorkshopAdminAuditEntryV1 {
  actionId: string;
  actor: { userId: string; displayName: string };
  action: 'item_disabled' | 'item_restored' | 'user_suspended' | 'user_restored';
  targetType: 'item' | 'user';
  targetId: string;
  reason: string;
  beforeSummary: Record<string, string | number | boolean | null> | null;
  afterSummary: Record<string, string | number | boolean | null> | null;
  createdAt: string;
}

export const workshopAdminReasonRequestV1Schema: z.ZodType<{ reason: string; confirmation: string }>;
export const workshopAdminItemV1Schema: z.ZodType<WorkshopAdminItemV1>;
export const workshopAdminUserV1Schema: z.ZodType<WorkshopAdminUserV1>;
export const workshopAdminAuditEntryV1Schema: z.ZodType<WorkshopAdminAuditEntryV1>;
export const workshopAdminItemsResponseV1Schema: z.ZodType<{ ok: true; items: WorkshopAdminItemV1[] }>;
export const workshopAdminUsersResponseV1Schema: z.ZodType<{ ok: true; users: WorkshopAdminUserV1[] }>;
export const workshopAdminAuditResponseV1Schema: z.ZodType<{ ok: true; actions: WorkshopAdminAuditEntryV1[] }>;
export const workshopAdminMutationResultV1Schema: z.ZodType<{
  ok: true;
  actionId: string;
  targetType: 'item' | 'user';
  targetId: string;
  status: 'published' | 'unlisted' | 'disabled' | 'active' | 'suspended';
}>;
