import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashWorkshopSecret } from './auth.js';
import {
  handleCreateWorkshopItem,
  handleCreateWorkshopRevision,
  handlePublishWorkshopItem,
  handleUpdateWorkshopItem
} from './ownerHandlers.js';

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
  constructor(firstRows = [], { batchFails = false } = {}) {
    this.firstRows = [...firstRows];
    this.allRows = [];
    this.statements = [];
    this.runs = [];
    this.batches = [];
    this.batchFails = batchFails;
  }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) {
    this.batches.push(statements);
    if (this.batchFails) throw new Error('d1_failed');
    return statements.map(() => ({ success: true }));
  }
}

class FakeBucket {
  constructor() { this.puts = []; this.deletes = []; }
  async put(key, value, options) { this.puts.push({ key, value, options }); }
  async delete(key) { this.deletes.push(key); }
}

const sessionSecret = 's'.repeat(64);
const sessionRowBase = {
  session_hash: 'stored-session-hash',
  expires_at: '2099-01-01T00:00:00.000Z',
  user_id: 'owner_1',
  display_name: '上传者',
  avatar_ref: null,
  role: 'member',
  status: 'active'
};

async function uploadContext(database, bucket, packageObject) {
  return {
    request: new Request('https://game.example/api/workshop/items', {
      method: 'POST',
      headers: {
        origin: 'https://game.example',
        cookie: 'sicv2_workshop_session=session-token; sicv2_workshop_csrf=csrf-token',
        'x-workshop-csrf': 'csrf-token',
        'idempotency-key': 'upload-request-00000001'
      },
      body: JSON.stringify({
        package: packageObject,
        revision: { changelog: '首个公开修订。' },
        rightsConfirmed: true,
        turnstileToken: 'turnstile-token'
      })
    }),
    env: {
      WORKSHOP_DB: database,
      WORKSHOP_PACKAGES: bucket,
      WORKSHOP_SESSION_SECRET: sessionSecret,
      WORKSHOP_ALLOWED_ORIGINS: 'https://game.example',
      WORKSHOP_UPLOAD_ENABLED: 'true',
      TURNSTILE_SECRET_KEY: 'turnstile-secret'
    },
    fetcher: vi.fn(async () => new Response(JSON.stringify({
      success: true,
      action: 'workshop_upload'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
  };
}

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));

describe('workshop owner publishing', () => {
  it('writes R2 first, then atomically publishes an owned immutable revision', async () => {
    const fixture = JSON.parse(await readFile(resolve(
      process.cwd(),
      'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
    ), 'utf8'));
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const database = new FakeDatabase([
      { ...sessionRowBase, csrf_hash: csrfHash },
      null,
      { count: 0 },
      { count: 0 },
      { bytes: 0 }
    ]);
    const bucket = new FakeBucket();
    const context = await uploadContext(database, bucket, fixture);
    const response = await handleCreateWorkshopItem(context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ ok: true, status: 'published', revisionNumber: 1 });
    expect(body.itemId).toMatch(/^item_[0-9a-f]{24}$/);
    expect(bucket.puts).toHaveLength(1);
    expect(bucket.puts[0].key).toContain(`/${body.itemId}/1/`);
    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]).toHaveLength(4);
    expect(database.batches[0][0].bindings[1]).toBe('owner_1');
    expect(context.fetcher).toHaveBeenCalledTimes(1);
  });

  it('removes the newly written object when the D1 publication batch fails', async () => {
    const fixture = JSON.parse(await readFile(resolve(
      process.cwd(),
      'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
    ), 'utf8'));
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const database = new FakeDatabase([
      { ...sessionRowBase, csrf_hash: csrfHash },
      null,
      { count: 0 },
      { count: 0 },
      { bytes: 0 },
      null
    ], { batchFails: true });
    const bucket = new FakeBucket();
    const response = await handleCreateWorkshopItem(await uploadContext(database, bucket, fixture));

    expect(response.status).toBe(409);
    expect(bucket.puts).toHaveLength(1);
    expect(bucket.deletes).toEqual([bucket.puts[0].key]);
  });

  it('keeps anonymous browsing available while the upload kill switch rejects new writes', async () => {
    const fixture = JSON.parse(await readFile(resolve(
      process.cwd(),
      'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
    ), 'utf8'));
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const database = new FakeDatabase([{ ...sessionRowBase, csrf_hash: csrfHash }]);
    const bucket = new FakeBucket();
    const context = await uploadContext(database, bucket, fixture);
    context.env.WORKSHOP_UPLOAD_ENABLED = 'false';
    const response = await handleCreateWorkshopItem(context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'upload_disabled' });
    expect(bucket.puts).toHaveLength(0);
    expect(context.fetcher).not.toHaveBeenCalled();
  });

  it('rejects exhausted daily quota before Turnstile or R2 work', async () => {
    const fixture = JSON.parse(await readFile(resolve(
      process.cwd(),
      'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
    ), 'utf8'));
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const database = new FakeDatabase([
      { ...sessionRowBase, csrf_hash: csrfHash },
      null,
      { count: 0 },
      { count: 20 },
      { bytes: 0 }
    ]);
    const bucket = new FakeBucket();
    const context = await uploadContext(database, bucket, fixture);
    const response = await handleCreateWorkshopItem(context);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: 'quota_exceeded' });
    expect(bucket.puts).toHaveLength(0);
    expect(context.fetcher).not.toHaveBeenCalled();
  });

  it('stops uploads before the workshop-wide storage safety budget is exceeded', async () => {
    const fixture = JSON.parse(await readFile(resolve(
      globalThis.process.cwd(),
      'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
    ), 'utf8'));
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const database = new FakeDatabase([
      { ...sessionRowBase, csrf_hash: csrfHash },
      null,
      { count: 0 },
      { count: 0 },
      { user_bytes: 0, total_bytes: 1024 }
    ]);
    const bucket = new FakeBucket();
    const context = await uploadContext(database, bucket, fixture);
    context.env.WORKSHOP_MAX_TOTAL_STORAGE_BYTES = '1024';
    const response = await handleCreateWorkshopItem(context);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: 'quota_exceeded' });
    expect(bucket.puts).toHaveLength(0);
    expect(context.fetcher).not.toHaveBeenCalled();
  });

  it('rejects a failed Turnstile challenge before writing R2', async () => {
    const fixture = JSON.parse(await readFile(resolve(
      process.cwd(),
      'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
    ), 'utf8'));
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const database = new FakeDatabase([
      { ...sessionRowBase, csrf_hash: csrfHash },
      null,
      { count: 0 },
      { count: 0 },
      { bytes: 0 }
    ]);
    const bucket = new FakeBucket();
    const context = await uploadContext(database, bucket, fixture);
    context.fetcher = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      'error-codes': ['invalid-input-response']
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const response = await handleCreateWorkshopItem(context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'turnstile_failed' });
    expect(bucket.puts).toHaveLength(0);
  });

  it('does not let one user edit another user item by changing the URL', async () => {
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const database = new FakeDatabase([{ ...sessionRowBase, csrf_hash: csrfHash }, null]);
    const response = await handleUpdateWorkshopItem({
      request: new Request('https://game.example/api/workshop/items/item_foreign', {
        method: 'PATCH',
        headers: {
          origin: 'https://game.example',
          cookie: 'sicv2_workshop_session=session-token; sicv2_workshop_csrf=csrf-token',
          'x-workshop-csrf': 'csrf-token'
        },
        body: JSON.stringify({
          title: '篡改标题',
          summary: '不应写入其他用户条目。',
          language: 'zh-CN',
          contentRating: 'general',
          tags: []
        })
      }),
      env: {
        WORKSHOP_DB: database,
        WORKSHOP_SESSION_SECRET: sessionSecret,
        WORKSHOP_ALLOWED_ORIGINS: 'https://game.example'
      },
      params: { itemId: 'item_foreign' }
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'ownership_required' });
    expect(database.runs).toHaveLength(0);
  });

  it('does not let one user append a revision to another user item', async () => {
    const fixture = JSON.parse(await readFile(resolve(
      process.cwd(),
      'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
    ), 'utf8'));
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const database = new FakeDatabase([
      { ...sessionRowBase, csrf_hash: csrfHash },
      null,
      { count: 0 },
      { count: 0 },
      { bytes: 0 },
      null
    ]);
    const bucket = new FakeBucket();
    const context = await uploadContext(database, bucket, fixture);
    context.params = { itemId: 'item_foreign' };
    const response = await handleCreateWorkshopRevision(context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'ownership_required' });
    expect(bucket.puts).toHaveLength(0);
    expect(database.batches).toHaveLength(0);
  });

  it('rejects a credential accidentally pasted into editable public metadata', async () => {
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const database = new FakeDatabase([{ ...sessionRowBase, csrf_hash: csrfHash }]);
    const response = await handleUpdateWorkshopItem({
      request: new Request('https://game.example/api/workshop/items/item_owned', {
        method: 'PATCH',
        headers: {
          origin: 'https://game.example',
          cookie: 'sicv2_workshop_session=session-token; sicv2_workshop_csrf=csrf-token',
          'x-workshop-csrf': 'csrf-token'
        },
        body: JSON.stringify({
          title: '安全测试',
          summary: `误贴凭据 sk-${'a'.repeat(32)}`,
          language: 'zh-CN',
          contentRating: 'general',
          tags: []
        })
      }),
      env: {
        WORKSHOP_DB: database,
        WORKSHOP_SESSION_SECRET: sessionSecret,
        WORKSHOP_ALLOWED_ORIGINS: 'https://game.example'
      },
      params: { itemId: 'item_owned' }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'package_invalid' });
    expect(database.runs).toHaveLength(0);
  });

  it('replays a completed idempotent publication without consuming Turnstile or writing R2', async () => {
    const fixture = JSON.parse(await readFile(resolve(
      process.cwd(),
      'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
    ), 'utf8'));
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const replay = {
      ok: true,
      itemId: 'item_existing',
      revisionId: 'revision_existing',
      revisionNumber: 1,
      status: 'published',
      packageSha256: 'a'.repeat(64)
    };
    const database = new FakeDatabase([
      { ...sessionRowBase, csrf_hash: csrfHash },
      { response_status: 201, response_json: JSON.stringify(replay) }
    ]);
    const bucket = new FakeBucket();
    const context = await uploadContext(database, bucket, fixture);
    const response = await handleCreateWorkshopItem(context);

    expect(response.status).toBe(201);
    expect(response.headers.get('x-idempotent-replay')).toBe('true');
    expect(bucket.puts).toHaveLength(0);
    expect(context.fetcher).not.toHaveBeenCalled();
  });

  it('does not let an owner republish an administrator-disabled item', async () => {
    const csrfHash = await hashWorkshopSecret('csrf-token', sessionSecret);
    const database = new FakeDatabase([
      { ...sessionRowBase, csrf_hash: csrfHash },
      { item_id: 'item_disabled', owner_user_id: 'owner_1', status: 'disabled' }
    ]);
    const response = await handlePublishWorkshopItem({
      request: new Request('https://game.example/api/workshop/items/item_disabled/publish', {
        method: 'POST',
        headers: {
          origin: 'https://game.example',
          cookie: 'sicv2_workshop_session=session-token; sicv2_workshop_csrf=csrf-token',
          'x-workshop-csrf': 'csrf-token'
        }
      }),
      env: {
        WORKSHOP_DB: database,
        WORKSHOP_SESSION_SECRET: sessionSecret,
        WORKSHOP_ALLOWED_ORIGINS: 'https://game.example'
      },
      params: { itemId: 'item_disabled' }
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'item_locked' });
    expect(database.runs).toHaveLength(0);
  });
});
