import { describe, expect, it } from 'vitest';
import {
  workshopAdminMutationResultV1Schema,
  workshopAdminReasonRequestV1Schema
} from './workshopAdminApiV1.js';

describe('workshop admin API V1 contract', () => {
  it('requires a reason and an explicit target confirmation', () => {
    expect(workshopAdminReasonRequestV1Schema.safeParse({
      reason: '公开资料包含违规内容。',
      confirmation: 'item_1'
    }).success).toBe(true);
    expect(workshopAdminReasonRequestV1Schema.safeParse({
      reason: 'x',
      confirmation: 'item_1'
    }).success).toBe(false);
    expect(workshopAdminReasonRequestV1Schema.safeParse({
      reason: '合法原因',
      confirmation: 'item_1',
      role: 'admin'
    }).success).toBe(false);
  });

  it('accepts only the bounded governance result shape', () => {
    expect(workshopAdminMutationResultV1Schema.safeParse({
      ok: true,
      actionId: 'admin_action_1',
      targetType: 'item',
      targetId: 'item_1',
      status: 'disabled'
    }).success).toBe(true);
    expect(workshopAdminMutationResultV1Schema.safeParse({
      ok: true,
      actionId: 'admin_action_1',
      targetType: 'item',
      targetId: 'item_1',
      status: 'hard_deleted'
    }).success).toBe(false);
  });
});
