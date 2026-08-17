import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_HEARTBEAT_INTERVAL_SECONDS,
  ANALYTICS_HEARTBEAT_MIN_WRITE_SECONDS,
  ONLINE_WINDOW_SECONDS,
  dayKeyFor,
  hasAdminAuthorization,
  hashAnalyticsId,
  isHeartbeatWriteDue,
  parseHeartbeatPayload,
  readCloudflareRegion
} from './analytics.js';

describe('Cloudflare analytics shared boundary', () => {
  it('accepts only bounded anonymous heartbeat fields', () => {
    expect(parseHeartbeatPayload({
      event: 'page_view',
      visitorId: 'visitor_1234567890abcdef',
      sessionId: 'session_1234567890abcdef',
      language: 'zh-CN',
      deviceClass: 'desktop',
      viewportWidth: 1440,
      referrerHost: 'example.com',
      appVersion: 'zh-CN-v1-rc',
      story: 'this field must be ignored'
    })).toEqual({
      event: 'page_view',
      visitorId: 'visitor_1234567890abcdef',
      sessionId: 'session_1234567890abcdef',
      language: 'zh-CN',
      deviceClass: 'desktop',
      viewportWidth: 1440,
      referrerHost: 'example.com',
      appVersion: 'zh-CN-v1-rc'
    });

    expect(parseHeartbeatPayload({ event: 'heartbeat', visitorId: 'short', sessionId: 'short' })).toBeNull();
  });

  it('uses the requested timezone for daily aggregation', () => {
    const instant = new Date('2026-07-19T16:30:00.000Z');
    expect(dayKeyFor(instant, 'Asia/Shanghai')).toBe('2026-07-20');
    expect(dayKeyFor(instant, 'UTC')).toBe('2026-07-19');
  });

  it('uses a five-minute heartbeat with a wider ten-minute active window', () => {
    expect(ANALYTICS_HEARTBEAT_INTERVAL_SECONDS).toBe(300);
    expect(ANALYTICS_HEARTBEAT_MIN_WRITE_SECONDS).toBe(240);
    expect(ONLINE_WINDOW_SECONDS).toBe(600);
  });

  it('suppresses legacy clients that heartbeat again inside the server write gap', () => {
    const now = new Date('2026-08-02T12:05:00.000Z');
    expect(isHeartbeatWriteDue('2026-08-02T12:01:01.000Z', now)).toBe(false);
    expect(isHeartbeatWriteDue('2026-08-02T12:01:00.000Z', now)).toBe(true);
    expect(isHeartbeatWriteDue(null, now)).toBe(true);
    expect(isHeartbeatWriteDue('invalid', now)).toBe(true);
  });

  it('reads Cloudflare region metadata without reading or returning a raw IP', () => {
    const region = readCloudflareRegion({
      cf: { country: 'HK', region: 'Kowloon', regionCode: 'KLN', city: 'Hong Kong' },
      headers: new Headers({ 'cf-connecting-ip': '203.0.113.10' })
    });
    expect(region).toEqual({
      countryCode: 'HK',
      region: 'Kowloon',
      regionCode: 'KLN',
      city: 'Hong Kong'
    });
    expect(JSON.stringify(region)).not.toContain('203.0.113.10');
  });

  it('hashes identifiers by namespace and requires the exact admin bearer token', async () => {
    const salt = 'test-only-salt-with-at-least-24-characters';
    const visitorHash = await hashAnalyticsId('same-random-id', salt, 'visitor');
    const sessionHash = await hashAnalyticsId('same-random-id', salt, 'session');
    expect(visitorHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(visitorHash).not.toBe(sessionHash);

    const token = 'test-admin-token-at-least-24-characters';
    expect(hasAdminAuthorization(new Request('https://example.com', {
      headers: { authorization: `Bearer ${token}` }
    }), token)).toBe(true);
    expect(hasAdminAuthorization(new Request('https://example.com'), token)).toBe(false);
  });
});
