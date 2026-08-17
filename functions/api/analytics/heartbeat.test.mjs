import { describe, expect, it } from 'vitest';
import { onRequestPost } from './heartbeat.js';

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    return this;
  }

  async first() {
    this.database.firstCalls.push(this);
    return this.database.firstResults.shift() ?? null;
  }

  async run() {
    this.database.runCalls.push(this);
    return { success: true };
  }
}

class FakeDatabase {
  constructor(firstResults = []) {
    this.firstResults = [...firstResults];
    this.firstCalls = [];
    this.runCalls = [];
    this.batchCalls = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    this.batchCalls.push(statements);
    return statements.map(() => ({ success: true }));
  }
}

function createContext(database, event) {
  return {
    request: new Request('https://game.example/api/analytics/heartbeat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event,
        visitorId: 'visitor_1234567890abcdef',
        sessionId: 'session_1234567890abcdef',
        language: 'zh-CN',
        deviceClass: 'desktop',
        viewportWidth: 1440,
        referrerHost: 'direct',
        appVersion: '1.7.49'
      })
    }),
    env: {
      ANALYTICS_DB: database,
      ANALYTICS_HASH_SALT: 'test-only-salt-with-at-least-24-characters',
      ANALYTICS_TIMEZONE: 'Asia/Shanghai'
    }
  };
}

describe('analytics heartbeat function', () => {
  it('suppresses a legacy heartbeat that arrives inside the server write gap', async () => {
    const database = new FakeDatabase([{ last_seen_at: new Date().toISOString() }]);
    const response = await onRequestPost(createContext(database, 'heartbeat'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      accepted: false,
      nextHeartbeatAfterSeconds: 300,
      onlineWindowSeconds: 600
    });
    expect(database.batchCalls).toHaveLength(0);
    expect(database.firstCalls[0].sql).toContain('SELECT last_seen_at FROM analytics_visitors');
  });

  it('uses only visitor and session writes for an accepted heartbeat', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const database = new FakeDatabase([{ last_seen_at: tenMinutesAgo }]);
    const response = await onRequestPost(createContext(database, 'heartbeat'));
    const payload = await response.json();

    expect(payload.accepted).toBe(true);
    expect(database.batchCalls).toHaveLength(1);
    expect(database.batchCalls[0]).toHaveLength(2);
    expect(database.batchCalls[0].map((statement) => statement.sql).join(' ')).not.toContain('analytics_daily_metrics');
    expect(database.firstCalls.some((statement) => statement.sql.includes('COUNT('))).toBe(false);
  });

  it('keeps full daily registration on page view without querying online counts or writing a peak', async () => {
    const database = new FakeDatabase([null, null]);
    const response = await onRequestPost(createContext(database, 'page_view'));
    const payload = await response.json();

    expect(payload).toMatchObject({ ok: true, accepted: true, nextHeartbeatAfterSeconds: 300 });
    expect(database.batchCalls).toHaveLength(1);
    expect(database.batchCalls[0]).toHaveLength(4);
    expect(database.firstCalls.some((statement) => statement.sql.includes('COUNT('))).toBe(false);
    expect(database.runCalls).toHaveLength(0);
  });
});
