import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAnalyticsScreen } from './AdminAnalyticsScreen';

describe('AdminAnalyticsScreen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the token in component memory and renders protected aggregate statistics', async () => {
    sessionStorage.clear();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        generatedAt: '2026-07-20T12:00:00.000Z',
        timezone: 'Asia/Shanghai',
        onlineWindowSeconds: 120,
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
          lastEventAt: '2026-07-20T11:59:00.000Z'
        },
        daily: [{ day: '2026-07-20', page_views: 24, sessions_started: 15, unique_visitors: 12, peak_online: 8 }],
        regions: [{ country_code: 'HK', region: 'Hong Kong', city: 'Hong Kong', visitors: 50 }],
        languages: [{ language: 'zh-CN', visitors: 90 }],
        devices: [{ device_class: 'desktop', visitors: 70, average_width: 1440 }],
  versions: [{ app_version: '1.0.0', visitors: 100 }],
        referrers: [{ referrer_host: 'direct', sessions: 80 }]
      })
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminAnalyticsScreen />);
    fireEvent.change(screen.getByLabelText('后台访问令牌'), { target: { value: 'a-strong-secret-token-for-tests' } });
    fireEvent.click(screen.getByRole('button', { name: '进入后台' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/analytics',
      expect.objectContaining({ headers: { authorization: 'Bearer a-strong-secret-token-for-tests' } })
    ));
    expect(await screen.findByText('IP 归属地区')).toBeInTheDocument();
    const metrics = screen.getByRole('region', { name: '核心统计' });
    expect(within(metrics).getByText('累计独立访客')).toBeInTheDocument();
    expect(within(metrics).getByText('100')).toBeInTheDocument();
    expect(screen.getAllByText(/不保存原始 IP/)).toHaveLength(2);
    expect(sessionStorage.length).toBe(0);
  });
});
