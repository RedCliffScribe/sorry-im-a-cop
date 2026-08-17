import { describe, expect, it } from 'vitest';
import { onRequestGet } from './analytics.js';

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

  async all() {
    this.database.allCalls.push(this);
    return { results: [] };
  }

  async run() {
    this.database.runCalls.push(this);
    return { success: true };
  }
}

class FakeDatabase {
  constructor(firstResults) {
    this.firstResults = [...firstResults];
    this.firstCalls = [];
    this.allCalls = [];
    this.runCalls = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

describe('admin analytics function', () => {
  it('counts recent anonymous visitors and samples the peak only when the dashboard refreshes', async () => {
    const database = new FakeDatabase([
      {
        current_online: 3,
        total_visitors: 100,
        total_sessions: 140,
        returning_visitors: 40,
        active_7d: 60,
        active_30d: 90,
        average_session_minutes: 18.5,
        last_event_at: '2026-08-02T11:59:00.000Z'
      },
      {
        page_views: 24,
        sessions_started: 15,
        unique_visitors: 12,
        heartbeat_count: 0,
        peak_online: 2
      }
    ]);
    const token = 'test-admin-token-at-least-24-characters';
    const response = await onRequestGet({
      request: new Request('https://game.example/api/admin/analytics', {
        headers: { authorization: `Bearer ${token}` }
      }),
      env: {
        ANALYTICS_DB: database,
        ADMIN_ANALYTICS_TOKEN: token,
        ANALYTICS_TIMEZONE: 'Asia/Shanghai'
      }
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      onlineWindowSeconds: 600,
      onlineDedupe: 'anonymous_visitor',
      peakSampling: 'admin_refresh',
      summary: { currentOnline: 3, todayPeakOnline: 3 }
    });
    expect(database.firstCalls[0].sql).toContain(
      'SELECT COUNT(*) FROM analytics_visitors WHERE last_seen_at >= ?1'
    );
    expect(database.firstCalls[0].sql).not.toContain(
      'SELECT COUNT(*) FROM analytics_sessions WHERE last_seen_at >= ?1'
    );
    expect(database.runCalls).toHaveLength(1);
    expect(database.runCalls[0].sql).toContain('peak_online = MAX');
  });
});
