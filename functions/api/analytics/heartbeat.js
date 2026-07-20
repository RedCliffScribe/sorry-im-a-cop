import {
  DEFAULT_ANALYTICS_TIMEZONE,
  ONLINE_WINDOW_SECONDS,
  dayKeyFor,
  hashAnalyticsId,
  jsonResponse,
  parseHeartbeatPayload,
  readCloudflareRegion
} from '../../_shared/analytics.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ANALYTICS_DB || !env.ANALYTICS_HASH_SALT || env.ANALYTICS_HASH_SALT.length < 24) {
    return jsonResponse({ ok: false, code: 'analytics_not_configured' }, 503);
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 8_192) return jsonResponse({ ok: false, code: 'payload_too_large' }, 413);

  let payload;
  try {
    payload = parseHeartbeatPayload(await request.json());
  } catch {
    payload = null;
  }
  if (!payload) return jsonResponse({ ok: false, code: 'invalid_payload' }, 400);

  const now = new Date();
  const nowIso = now.toISOString();
  const timezone = env.ANALYTICS_TIMEZONE || DEFAULT_ANALYTICS_TIMEZONE;
  const day = dayKeyFor(now, timezone);
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_SECONDS * 1_000).toISOString();
  const visitorHash = await hashAnalyticsId(payload.visitorId, env.ANALYTICS_HASH_SALT, 'visitor');
  const sessionHash = await hashAnalyticsId(payload.sessionId, env.ANALYTICS_HASH_SALT, 'session');
  const region = readCloudflareRegion(request);

  const [existingSession, existingDailyVisitor] = await Promise.all([
    env.ANALYTICS_DB.prepare('SELECT session_hash FROM analytics_sessions WHERE session_hash = ?1')
      .bind(sessionHash)
      .first(),
    env.ANALYTICS_DB.prepare(
      'SELECT visitor_hash FROM analytics_daily_visitors WHERE day = ?1 AND visitor_hash = ?2'
    )
      .bind(day, visitorHash)
      .first()
  ]);

  const isNewSession = !existingSession;
  const isNewDailyVisitor = !existingDailyVisitor;
  const pageViewIncrement = payload.event === 'page_view' ? 1 : 0;

  await env.ANALYTICS_DB.batch([
    env.ANALYTICS_DB.prepare(`
      INSERT INTO analytics_visitors (
        visitor_hash, first_seen_at, last_seen_at, first_day, last_day,
        first_country_code, last_country_code, last_region, last_region_code, last_city,
        language, device_class, viewport_width, app_version
      ) VALUES (?1, ?2, ?2, ?3, ?3, ?4, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
      ON CONFLICT(visitor_hash) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        last_day = excluded.last_day,
        last_country_code = excluded.last_country_code,
        last_region = excluded.last_region,
        last_region_code = excluded.last_region_code,
        last_city = excluded.last_city,
        language = excluded.language,
        device_class = excluded.device_class,
        viewport_width = excluded.viewport_width,
        app_version = excluded.app_version
    `).bind(
      visitorHash, nowIso, day, region.countryCode, region.region, region.regionCode,
      region.city, payload.language, payload.deviceClass, payload.viewportWidth, payload.appVersion
    ),
    env.ANALYTICS_DB.prepare(`
      INSERT INTO analytics_sessions (
        session_hash, visitor_hash, started_at, last_seen_at, start_day,
        country_code, region, region_code, city, language, device_class,
        viewport_width, app_version, referrer_host, page_views
      ) VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
      ON CONFLICT(session_hash) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        country_code = excluded.country_code,
        region = excluded.region,
        region_code = excluded.region_code,
        city = excluded.city,
        language = excluded.language,
        device_class = excluded.device_class,
        viewport_width = excluded.viewport_width,
        app_version = excluded.app_version,
        page_views = analytics_sessions.page_views + excluded.page_views
    `).bind(
      sessionHash, visitorHash, nowIso, day, region.countryCode, region.region,
      region.regionCode, region.city, payload.language, payload.deviceClass,
      payload.viewportWidth, payload.appVersion, payload.referrerHost, pageViewIncrement
    ),
    env.ANALYTICS_DB.prepare(`
      INSERT OR IGNORE INTO analytics_daily_visitors (day, visitor_hash, first_seen_at)
      VALUES (?1, ?2, ?3)
    `).bind(day, visitorHash, nowIso),
    env.ANALYTICS_DB.prepare(`
      INSERT INTO analytics_daily_metrics (
        day, page_views, sessions_started, unique_visitors, heartbeat_count, peak_online, updated_at
      ) VALUES (?1, ?2, ?3, ?4, 1, 0, ?5)
      ON CONFLICT(day) DO UPDATE SET
        page_views = analytics_daily_metrics.page_views + excluded.page_views,
        sessions_started = analytics_daily_metrics.sessions_started + excluded.sessions_started,
        unique_visitors = analytics_daily_metrics.unique_visitors + excluded.unique_visitors,
        heartbeat_count = analytics_daily_metrics.heartbeat_count + 1,
        updated_at = excluded.updated_at
    `).bind(day, pageViewIncrement, isNewSession ? 1 : 0, isNewDailyVisitor ? 1 : 0, nowIso)
  ]);

  const online = await env.ANALYTICS_DB.prepare(
    'SELECT COUNT(*) AS count FROM analytics_sessions WHERE last_seen_at >= ?1'
  ).bind(onlineSince).first();
  const currentOnline = Number(online?.count ?? 0);

  await env.ANALYTICS_DB.prepare(`
    UPDATE analytics_daily_metrics
    SET peak_online = MAX(peak_online, ?2), updated_at = ?3
    WHERE day = ?1
  `).bind(day, currentOnline, nowIso).run();

  return jsonResponse({ ok: true, currentOnline, onlineWindowSeconds: ONLINE_WINDOW_SECONDS });
}

export function onRequest() {
  return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405, { allow: 'POST' });
}
