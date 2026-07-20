export const ONLINE_WINDOW_SECONDS = 120;
export const DEFAULT_ANALYTICS_TIMEZONE = 'Asia/Shanghai';

const textEncoder = new TextEncoder();

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}

export function sanitizeText(value, fallback, maxLength, pattern) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || (pattern && !pattern.test(trimmed))) return fallback;
  return trimmed;
}

export function parseHeartbeatPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const visitorId = sanitizeText(value.visitorId, '', 128, /^[A-Za-z0-9_-]{16,128}$/);
  const sessionId = sanitizeText(value.sessionId, '', 128, /^[A-Za-z0-9_-]{16,128}$/);
  if (!visitorId || !sessionId) return null;

  const event = value.event === 'page_view' ? 'page_view' : value.event === 'heartbeat' ? 'heartbeat' : null;
  if (!event) return null;

  const viewportWidth = Number.isFinite(value.viewportWidth)
    ? Math.max(320, Math.min(10_000, Math.round(value.viewportWidth)))
    : 0;

  return {
    event,
    visitorId,
    sessionId,
    language: sanitizeText(value.language, 'unknown', 24, /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/),
    deviceClass: ['mobile', 'tablet', 'desktop'].includes(value.deviceClass) ? value.deviceClass : 'unknown',
    viewportWidth,
    referrerHost: sanitizeText(value.referrerHost, 'unknown', 160, /^[A-Za-z0-9.-]+$/),
    appVersion: sanitizeText(value.appVersion, 'unknown', 64, /^[A-Za-z0-9._+-]+$/)
  };
}

export async function hashAnalyticsId(rawId, salt, namespace) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(`${namespace}:${rawId}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function dayKeyFor(date, timezone = DEFAULT_ANALYTICS_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function readCloudflareRegion(request) {
  const cf = request.cf ?? {};
  return {
    countryCode: sanitizeText(cf.country, 'XX', 2, /^[A-Z]{2}$/),
    region: sanitizeText(cf.region, '未知地区', 96),
    regionCode: sanitizeText(cf.regionCode, '', 12, /^[A-Za-z0-9-]+$/),
    city: sanitizeText(cf.city, '未知城市', 96)
  };
}

export function hasAdminAuthorization(request, expectedToken) {
  if (!expectedToken || expectedToken.length < 24) return false;
  const authorization = request.headers.get('authorization') ?? '';
  return authorization === `Bearer ${expectedToken}`;
}

export function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}
