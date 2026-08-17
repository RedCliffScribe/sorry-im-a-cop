import {
  DEFAULT_ANALYTICS_TIMEZONE,
  ONLINE_WINDOW_SECONDS,
  dayKeyFor,
  hasAdminAuthorization,
  jsonResponse,
  rows
} from '../../_shared/analytics.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!hasAdminAuthorization(request, env.ADMIN_ANALYTICS_TOKEN)) {
    return jsonResponse({ ok: false, code: 'unauthorized' }, 401, { 'www-authenticate': 'Bearer' });
  }
  if (!env.ANALYTICS_DB) return jsonResponse({ ok: false, code: 'analytics_not_configured' }, 503);

  const now = new Date();
  const timezone = env.ANALYTICS_TIMEZONE || DEFAULT_ANALYTICS_TIMEZONE;
  const today = dayKeyFor(now, timezone);
  const sevenDayStart = dayKeyFor(new Date(now.getTime() - 6 * 86_400_000), timezone);
  const thirtyDayStart = dayKeyFor(new Date(now.getTime() - 29 * 86_400_000), timezone);
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_SECONDS * 1_000).toISOString();

  const [summary, todayMetrics, daily, regions, languages, devices, versions, referrers] = await Promise.all([
    env.ANALYTICS_DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM analytics_visitors WHERE last_seen_at >= ?1) AS current_online,
        (SELECT COUNT(*) FROM analytics_visitors) AS total_visitors,
        (SELECT COUNT(*) FROM analytics_sessions) AS total_sessions,
        (SELECT COUNT(*) FROM analytics_visitors WHERE first_day < last_day) AS returning_visitors,
        (SELECT COUNT(DISTINCT visitor_hash) FROM analytics_daily_visitors WHERE day >= ?2) AS active_7d,
        (SELECT COUNT(DISTINCT visitor_hash) FROM analytics_daily_visitors WHERE day >= ?3) AS active_30d,
        (SELECT COALESCE(AVG((julianday(last_seen_at) - julianday(started_at)) * 1440.0), 0)
          FROM analytics_sessions WHERE last_seen_at >= ?4) AS average_session_minutes,
        (SELECT MAX(last_seen_at) FROM analytics_visitors) AS last_event_at
    `).bind(onlineSince, sevenDayStart, thirtyDayStart, new Date(now.getTime() - 30 * 86_400_000).toISOString()).first(),
    env.ANALYTICS_DB.prepare(`
      SELECT day, page_views, sessions_started, unique_visitors, heartbeat_count, peak_online, updated_at
      FROM analytics_daily_metrics WHERE day = ?1
    `).bind(today).first(),
    env.ANALYTICS_DB.prepare(`
      SELECT day, page_views, sessions_started, unique_visitors, peak_online
      FROM analytics_daily_metrics WHERE day >= ?1 ORDER BY day ASC
    `).bind(thirtyDayStart).all(),
    env.ANALYTICS_DB.prepare(`
      SELECT last_country_code AS country_code, last_region AS region, last_city AS city,
        COUNT(*) AS visitors
      FROM analytics_visitors
      GROUP BY last_country_code, last_region, last_city
      ORDER BY visitors DESC LIMIT 24
    `).all(),
    env.ANALYTICS_DB.prepare(`
      SELECT language, COUNT(DISTINCT visitor_hash) AS visitors
      FROM analytics_sessions WHERE start_day >= ?1
      GROUP BY language ORDER BY visitors DESC LIMIT 16
    `).bind(thirtyDayStart).all(),
    env.ANALYTICS_DB.prepare(`
      SELECT device_class, COUNT(DISTINCT visitor_hash) AS visitors,
        CAST(ROUND(AVG(viewport_width)) AS INTEGER) AS average_width
      FROM analytics_sessions WHERE start_day >= ?1
      GROUP BY device_class ORDER BY visitors DESC
    `).bind(thirtyDayStart).all(),
    env.ANALYTICS_DB.prepare(`
      SELECT app_version, COUNT(DISTINCT visitor_hash) AS visitors
      FROM analytics_sessions WHERE start_day >= ?1
      GROUP BY app_version ORDER BY visitors DESC LIMIT 12
    `).bind(thirtyDayStart).all(),
    env.ANALYTICS_DB.prepare(`
      SELECT referrer_host, COUNT(*) AS sessions
      FROM analytics_sessions WHERE start_day >= ?1
      GROUP BY referrer_host ORDER BY sessions DESC LIMIT 16
    `).bind(thirtyDayStart).all()
  ]);

  const currentOnline = Number(summary?.current_online ?? 0);
  const recordedPeakOnline = Number(todayMetrics?.peak_online ?? 0);
  const observedPeakOnline = Math.max(currentOnline, recordedPeakOnline);
  if (observedPeakOnline > recordedPeakOnline) {
    await env.ANALYTICS_DB.prepare(`
      INSERT INTO analytics_daily_metrics (
        day, page_views, sessions_started, unique_visitors, heartbeat_count, peak_online, updated_at
      ) VALUES (?1, 0, 0, 0, 0, ?2, ?3)
      ON CONFLICT(day) DO UPDATE SET
        peak_online = MAX(analytics_daily_metrics.peak_online, excluded.peak_online),
        updated_at = excluded.updated_at
    `).bind(today, observedPeakOnline, now.toISOString()).run();
  }

  return jsonResponse({
    ok: true,
    generatedAt: now.toISOString(),
    timezone,
    onlineWindowSeconds: ONLINE_WINDOW_SECONDS,
    onlineDedupe: 'anonymous_visitor',
    peakSampling: 'admin_refresh',
    summary: {
      currentOnline,
      todayPeakOnline: observedPeakOnline,
      todayUniqueVisitors: Number(todayMetrics?.unique_visitors ?? 0),
      todayPageViews: Number(todayMetrics?.page_views ?? 0),
      todaySessions: Number(todayMetrics?.sessions_started ?? 0),
      totalVisitors: Number(summary?.total_visitors ?? 0),
      totalSessions: Number(summary?.total_sessions ?? 0),
      returningVisitors: Number(summary?.returning_visitors ?? 0),
      active7d: Number(summary?.active_7d ?? 0),
      active30d: Number(summary?.active_30d ?? 0),
      averageSessionMinutes: Number(summary?.average_session_minutes ?? 0),
      lastEventAt: summary?.last_event_at ?? null
    },
    daily: rows(daily),
    regions: rows(regions),
    languages: rows(languages),
    devices: rows(devices),
    versions: rows(versions),
    referrers: rows(referrers)
  });
}

export function onRequest() {
  return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405, { allow: 'GET' });
}
