import { describe, expect, it } from 'vitest';
import { hashWorkshopSecret } from './auth.js';
import {
  handleDisableWorkshopAdminItem,
  handleListWorkshopAdminItems,
  handleRestoreWorkshopAdminItem,
  handleSuspendWorkshopAdminUser
} from './adminHandlers.js';

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.bindings = [];
  }
  bind(...bindings) { this.bindings = bindings; this.database.statements.push(this); return this; }
  async first() { return this.database.firstRows.shift() ?? null; }
  async all() { return { results: this.database.allRows }; }
  async run() { this.database.runs.push(this); return { success: true, meta: { changes: 1 } }; }
}

class FakeDatabase {
  constructor(firstRows = [], allRows = []) {
    this.firstRows = [...firstRows];
    this.allRows = [...allRows];
    this.statements = [];
    this.runs = [];
    this.batches = [];
  }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) { this.batches.push(statements); return statements.map(() => ({ success: true })); }
}

const sessionSecret = 's'.repeat(64);

async function sessionRow(role = 'admin', userId = 'admin_1') {
  return {
    session_hash: 'stored-session-hash',
    csrf_hash: await hashWorkshopSecret('csrf-token', sessionSecret),
    expires_at: '2099-01-01T00:00:00.000Z',
    user_id: userId,
    display_name: role === 'admin' ? '管理员甲' : '普通成员',
    avatar_ref: null,
    role,
    status: 'active'
  };
}

function context(database, path, body) {
  return {
    request: new Request(`https://game.example${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? {
        origin: 'https://game.example',
        cookie: 'sicv2_workshop_session=session-token; sicv2_workshop_csrf=csrf-token',
        'x-workshop-csrf': 'csrf-token'
      } : {
        cookie: 'sicv2_workshop_session=session-token; sicv2_workshop_csrf=csrf-token'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    }),
    env: {
      WORKSHOP_DB: database,
      WORKSHOP_SESSION_SECRET: sessionSecret,
      WORKSHOP_ALLOWED_ORIGINS: 'https://game.example'
    }
  };
}

describe('workshop administrator governance', () => {
  it('does not expose administrator lists to an ordinary member', async () => {
    const database = new FakeDatabase([await sessionRow('member', 'member_1')]);
    const response = await handleListWorkshopAdminItems(context(database, '/api/admin/workshop/items'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'admin_required' });
    expect(database.allRows).toEqual([]);
  });

  it('atomically disables an item and writes a bounded audit record', async () => {
    const database = new FakeDatabase([
      await sessionRow(),
      {
        item_id: 'item_1',
        owner_user_id: 'member_1',
        title: '待停用预设',
        status: 'published',
        disabled_reason: null,
        admin_disabled_previous_status: null,
        updated_at: '2026-08-03T00:00:00.000Z',
        owner_display_name: '上传者',
        owner_role: 'member',
        owner_status: 'active'
      }
    ]);
    const requestContext = context(database, '/api/admin/workshop/items/item_1/disable', {
      reason: '公开内容违反工坊规则。',
      confirmation: 'item_1'
    });
    requestContext.params = { itemId: 'item_1' };
    const response = await handleDisableWorkshopAdminItem(requestContext);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, targetType: 'item', targetId: 'item_1', status: 'disabled' });
    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]).toHaveLength(2);
    expect(database.batches[0][0].sql).toContain("status = 'disabled'");
    expect(database.batches[0][1].sql).toContain('INSERT INTO workshop_admin_actions');
    expect(database.batches[0][1].bindings).not.toContain('member_1-discord-private-id');
  });

  it('restores a disabled item conservatively to unlisted while its owner is suspended', async () => {
    const database = new FakeDatabase([
      await sessionRow(),
      {
        item_id: 'item_1',
        owner_user_id: 'member_1',
        title: '停用预设',
        status: 'disabled',
        disabled_reason: '待复核',
        admin_disabled_previous_status: 'published',
        updated_at: '2026-08-03T00:00:00.000Z',
        owner_display_name: '上传者',
        owner_role: 'member',
        owner_status: 'suspended'
      }
    ]);
    const requestContext = context(database, '/api/admin/workshop/items/item_1/restore', {
      reason: '内容复核通过，但账号仍处于停用状态。',
      confirmation: 'item_1'
    });
    requestContext.params = { itemId: 'item_1' };
    const response = await handleRestoreWorkshopAdminItem(requestContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'unlisted' });
    expect(database.batches[0][0].bindings[0]).toBe('unlisted');
  });

  it('suspends a member and revokes existing sessions in the same batch', async () => {
    const database = new FakeDatabase([
      await sessionRow(),
      {
        user_id: 'member_1',
        display_name: '上传者',
        role: 'member',
        status: 'active',
        created_at: '2026-08-03T00:00:00.000Z',
        updated_at: '2026-08-03T00:00:00.000Z'
      }
    ]);
    const requestContext = context(database, '/api/admin/workshop/users/member_1/suspend', {
      reason: '多次上传违反规则的内容。',
      confirmation: 'member_1'
    });
    requestContext.params = { userId: 'member_1' };
    const response = await handleSuspendWorkshopAdminUser(requestContext);

    expect(response.status).toBe(200);
    expect(database.batches[0]).toHaveLength(3);
    expect(database.batches[0][1].sql).toContain('UPDATE workshop_sessions');
    expect(database.batches[0][2].sql).toContain('INSERT INTO workshop_admin_actions');
  });

  it('protects administrator roles from the ordinary suspension action', async () => {
    const database = new FakeDatabase([
      await sessionRow(),
      {
        user_id: 'admin_2',
        display_name: '管理员乙',
        role: 'admin',
        status: 'active',
        created_at: '2026-08-03T00:00:00.000Z',
        updated_at: '2026-08-03T00:00:00.000Z'
      }
    ]);
    const requestContext = context(database, '/api/admin/workshop/users/admin_2/suspend', {
      reason: '不应通过该接口修改管理员。',
      confirmation: 'admin_2'
    });
    requestContext.params = { userId: 'admin_2' };
    const response = await handleSuspendWorkshopAdminUser(requestContext);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'role_protected' });
    expect(database.batches).toHaveLength(0);
  });
});
