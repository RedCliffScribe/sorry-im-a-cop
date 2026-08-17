import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_HEARTBEAT_INTERVAL_MS,
  ANALYTICS_HEARTBEAT_MIN_GAP_MS,
  ANALYTICS_PRESENCE_LEASE_MS,
  releaseAnalyticsPresenceLease,
  resolveDeviceClass,
  resolveOperationalAnalyticsEnabled,
  resolveReferrerHost,
  shouldDispatchOperationalHeartbeat,
  startOperationalAnalytics,
  tryAcquireAnalyticsPresenceLease
} from './operationalAnalytics';

describe('operationalAnalytics', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses stable coarse device classes', () => {
    expect(resolveDeviceClass(390)).toBe('mobile');
    expect(resolveDeviceClass(800)).toBe('tablet');
    expect(resolveDeviceClass(1440)).toBe('desktop');
  });

  it('allows an isolated production preview to explicitly disable analytics', () => {
    expect(resolveOperationalAnalyticsEnabled(true, 'false')).toBe(false);
    expect(resolveOperationalAnalyticsEnabled(true, undefined)).toBe(true);
    expect(resolveOperationalAnalyticsEnabled(false, 'true')).toBe(true);
  });

  it('keeps only the source host and never the source path', () => {
    expect(resolveReferrerHost('', 'game.example')).toBe('direct');
    expect(resolveReferrerHost('https://game.example/private/path', 'game.example')).toBe('internal');
    expect(resolveReferrerHost('https://search.example/query?q=secret', 'game.example')).toBe('search.example');
    expect(resolveReferrerHost('not a url', 'game.example')).toBe('unknown');
  });

  it('uses a five-minute cadence while keeping focus events throttled', () => {
    expect(ANALYTICS_HEARTBEAT_INTERVAL_MS).toBe(300_000);
    expect(ANALYTICS_HEARTBEAT_MIN_GAP_MS).toBe(240_000);
    expect(shouldDispatchOperationalHeartbeat({
      now: 240_000,
      lastDispatchedAt: 0,
      visibilityState: 'visible'
    })).toBe(true);
    expect(shouldDispatchOperationalHeartbeat({
      now: 239_999,
      lastDispatchedAt: 0,
      visibilityState: 'visible'
    })).toBe(false);
    expect(shouldDispatchOperationalHeartbeat({
      now: 999_999,
      lastDispatchedAt: 0,
      visibilityState: 'hidden'
    })).toBe(false);
  });

  it('allows only one visible tab to own the browser heartbeat lease', () => {
    expect(tryAcquireAnalyticsPresenceLease(localStorage, 'tab_a', 1_000)).toBe(true);
    expect(tryAcquireAnalyticsPresenceLease(localStorage, 'tab_b', 2_000)).toBe(false);
    expect(tryAcquireAnalyticsPresenceLease(localStorage, 'tab_a', 3_000)).toBe(true);
    expect(tryAcquireAnalyticsPresenceLease(
      localStorage,
      'tab_b',
      3_000 + ANALYTICS_PRESENCE_LEASE_MS + 1
    )).toBe(true);

    releaseAnalyticsPresenceLease(localStorage, 'tab_a');
    expect(tryAcquireAnalyticsPresenceLease(localStorage, 'tab_a', 4_000)).toBe(false);
    releaseAnalyticsPresenceLease(localStorage, 'tab_b');
    expect(tryAcquireAnalyticsPresenceLease(localStorage, 'tab_a', 4_000)).toBe(true);
  });

  it('sends one page view, then heartbeats only on the visible five-minute cadence', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
    vi.stubEnv('VITE_ENABLE_ANALYTICS', 'true');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response(JSON.stringify({ ok: true }))
    ));
    vi.stubGlobal('fetch', fetchMock);
    const visibilityState = vi.spyOn(document, 'visibilityState', 'get');
    visibilityState.mockReturnValue('visible');

    const stop = startOperationalAnalytics();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ event: 'page_view' });

    window.dispatchEvent(new Event('focus'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ANALYTICS_HEARTBEAT_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ event: 'heartbeat' });

    visibilityState.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(ANALYTICS_HEARTBEAT_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    stop();
  });
});
