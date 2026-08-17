import { describe, expect, it, vi } from 'vitest';
import { hashWorkshopSecret, requireWorkshopMutation, safeWorkshopReturnTo } from './auth.js';
import {
  handleDiscordLoginCallback,
  handleDiscordLoginStart
} from './authHandlers.js';

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.bindings = [];
  }
  bind(...bindings) { this.bindings = bindings; this.database.statements.push(this); return this; }
  async first() { return this.database.firstRows.shift() ?? null; }
  async run() { this.database.runs.push(this); return { success: true, meta: { changes: 1 } }; }
}

class FakeDatabase {
  constructor(firstRows = []) {
    this.firstRows = [...firstRows];
    this.statements = [];
    this.runs = [];
  }
  prepare(sql) { return new FakeStatement(this, sql); }
}

const secret = 's'.repeat(64);

function baseEnv(database) {
  return {
    WORKSHOP_DB: database,
    DISCORD_CLIENT_ID: 'client-public-id',
    DISCORD_CLIENT_SECRET: 'server-secret',
    DISCORD_REDIRECT_URI: 'https://game.example/api/auth/discord/callback',
    WORKSHOP_SESSION_SECRET: secret,
    TURNSTILE_SECRET_KEY: 'turnstile-server-secret',
    WORKSHOP_ALLOWED_ORIGINS: 'https://game.example'
  };
}

describe('workshop auth security', () => {
  it('keeps OAuth return paths on-site', () => {
    expect(safeWorkshopReturnTo('/workshop?tab=mine')).toBe('/workshop?tab=mine');
    expect(safeWorkshopReturnTo('https://evil.example')).toBe('/workshop');
    expect(safeWorkshopReturnTo('//evil.example')).toBe('/workshop');
    expect(safeWorkshopReturnTo('/\\evil')).toBe('/workshop');
  });

  it('starts Discord identify OAuth only after server-side Turnstile verification', async () => {
    const database = new FakeDatabase();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      action: 'workshop_login'
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const response = await handleDiscordLoginStart({
      request: new Request('https://game.example/api/auth/discord/start', {
        method: 'POST',
        headers: { origin: 'https://game.example' },
        body: JSON.stringify({ returnTo: '/workshop?tab=mine', turnstileToken: 'valid-token' })
      }),
      env: baseEnv(database),
      fetcher
    });
    const body = await response.json();
    const authorization = new URL(body.authorizationUrl);

    expect(response.status).toBe(200);
    expect(authorization.origin).toBe('https://discord.com');
    expect(authorization.searchParams.get('scope')).toBe('identify');
    expect(authorization.searchParams.get('response_type')).toBe('code');
    expect(database.runs).toHaveLength(1);
    expect(database.runs[0].bindings[1]).toBe('/workshop?tab=mine');
    expect(database.runs[0].bindings[0]).not.toBe(authorization.searchParams.get('state'));
  });

  it('consumes OAuth state once and stores only local session cookies', async () => {
    const database = new FakeDatabase([{ return_to: '/workshop?tab=mine' }, null, null]);
    const fetcher = vi.fn(async (url) => {
      if (String(url).endsWith('/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'temporary-access-token', token_type: 'Bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({
        id: '123456789012345678',
        username: 'tester',
        global_name: '测试玩家',
        avatar: 'avatar_hash'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const context = {
      request: new Request('https://game.example/api/auth/discord/callback?state=once&code=code-one'),
      env: baseEnv(database),
      fetcher
    };
    const first = await handleDiscordLoginCallback(context);
    const second = await handleDiscordLoginCallback(context);

    expect(first.status).toBe(302);
    expect(first.headers.get('location')).toBe('https://game.example/workshop?tab=mine');
    expect(first.headers.get('set-cookie')).toContain('sicv2_workshop_session=');
    expect(first.headers.get('set-cookie')).not.toContain('temporary-access-token');
    expect(second.status).toBe(400);
    await expect(second.json()).resolves.toMatchObject({ code: 'oauth_state_invalid' });
    expect(database.statements.some((statement) => statement.sql.includes('discord_user_id = ?1'))).toBe(true);
  });

  it('requires matching allowed Origin and double-submit CSRF for mutations', async () => {
    const csrfHash = await hashWorkshopSecret('csrf-token', secret);
    const sessionRow = {
      session_hash: 'stored-session-hash',
      csrf_hash: csrfHash,
      expires_at: '2099-01-01T00:00:00.000Z',
      user_id: 'user_1',
      display_name: '玩家',
      avatar_ref: null,
      role: 'member',
      status: 'active'
    };
    const good = await requireWorkshopMutation({
      request: new Request('https://game.example/api/workshop/me/items', {
        headers: {
          origin: 'https://game.example',
          cookie: 'sicv2_workshop_session=session-token; sicv2_workshop_csrf=csrf-token',
          'x-workshop-csrf': 'csrf-token'
        }
      }),
      env: baseEnv(new FakeDatabase([sessionRow]))
    });
    const badOrigin = await requireWorkshopMutation({
      request: new Request('https://game.example/api/workshop/me/items', {
        headers: { origin: 'https://evil.example' }
      }),
      env: baseEnv(new FakeDatabase())
    });
    const badCsrf = await requireWorkshopMutation({
      request: new Request('https://game.example/api/workshop/me/items', {
        headers: {
          origin: 'https://game.example',
          cookie: 'sicv2_workshop_session=session-token; sicv2_workshop_csrf=csrf-token',
          'x-workshop-csrf': 'wrong-token'
        }
      }),
      env: baseEnv(new FakeDatabase([sessionRow]))
    });

    expect(good.session.user.userId).toBe('user_1');
    expect(badOrigin.response.status).toBe(403);
    await expect(badOrigin.response.json()).resolves.toMatchObject({ code: 'invalid_origin' });
    expect(badCsrf.response.status).toBe(403);
    await expect(badCsrf.response.json()).resolves.toMatchObject({ code: 'csrf_failed' });
  });
});
