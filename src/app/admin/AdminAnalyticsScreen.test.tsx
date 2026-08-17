import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_ANALYTICS_REFRESH_INTERVAL_MS,
  AdminAnalyticsScreen
} from './AdminAnalyticsScreen';

function createAnalyticsResponse() {
  return {
    ok: true,
    generatedAt: '2026-08-02T12:00:00.000Z',
    timezone: 'Asia/Shanghai',
    onlineWindowSeconds: 600,
    onlineDedupe: 'anonymous_visitor',
    peakSampling: 'admin_refresh',
    summary: {
      currentOnline: 3,
      todayPeakOnline: 8,
      todayUniqueVisitors: 12,
      todayPageViews: 24,
      todaySessions: 15,
      totalVisitors: 100,
      totalSessions: 140,
      returningVisitors: 40,
      active7d: 60,
      active30d: 90,
      averageSessionMinutes: 18.5,
      lastEventAt: '2026-08-02T11:59:00.000Z'
    },
    daily: [{ day: '2026-08-02', page_views: 24, sessions_started: 15, unique_visitors: 12, peak_online: 8 }],
    regions: [{ country_code: 'HK', region: 'Hong Kong', city: 'Hong Kong', visitors: 50 }],
    languages: [{ language: 'zh-CN', visitors: 90 }],
    devices: [{ device_class: 'desktop', visitors: 70, average_width: 1440 }],
    versions: [{ app_version: '1.0.0', visitors: 100 }],
    referrers: [{ referrer_host: 'direct', sessions: 80 }]
  };
}

describe('AdminAnalyticsScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the token in component memory and renders protected aggregate statistics', async () => {
    sessionStorage.clear();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => createAnalyticsResponse()
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminAnalyticsScreen />);
    fireEvent.change(screen.getByLabelText('后台访问令牌'), { target: { value: 'admin-test-token' } });
    fireEvent.click(screen.getByRole('button', { name: '进入后台' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/analytics',
      expect.objectContaining({ headers: { authorization: 'Bearer admin-test-token' } })
    ));
    expect(await screen.findByText('IP 归属地区')).toBeInTheDocument();
    const metrics = screen.getByRole('region', { name: '核心统计' });
    expect(within(metrics).getByText('累计独立访客')).toBeInTheDocument();
    expect(within(metrics).getByText('100')).toBeInTheDocument();
    expect(within(metrics).getByText('最近活跃')).toBeInTheDocument();
    expect(screen.getByText('活跃窗口：最近 10 分钟')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '每 10 分钟自动刷新' })).not.toBeChecked();
    expect(screen.getAllByText(/不保存原始 IP/)).toHaveLength(2);
    expect(sessionStorage.length).toBe(0);
  });

  it('uses manual refresh by default and only starts the optional ten-minute timer after opt-in', async () => {
    const intervalSpy = vi.spyOn(window, 'setInterval');
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => createAnalyticsResponse() }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminAnalyticsScreen />);
    fireEvent.change(screen.getByLabelText('后台访问令牌'), { target: { value: 'admin-test-token' } });
    fireEvent.click(screen.getByRole('button', { name: '进入后台' }));
    await screen.findByText('IP 归属地区');

    expect(intervalSpy.mock.calls.some(([, delay]) => delay === ADMIN_ANALYTICS_REFRESH_INTERVAL_MS)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '立即刷新' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('checkbox', { name: '每 10 分钟自动刷新' }));
    await waitFor(() => expect(intervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      ADMIN_ANALYTICS_REFRESH_INTERVAL_MS
    ));
  });
});
