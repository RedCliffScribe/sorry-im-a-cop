import { createWorkshopRequestId, workshopErrorResponse } from './responses.js';

export const WORKSHOP_SESSION_COOKIE = 'sicv2_workshop_session';
export const WORKSHOP_CSRF_COOKIE = 'sicv2_workshop_csrf';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomWorkshopSecret(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function hashWorkshopSecret(value, secret) {
  if (!secret || typeof secret !== 'string' || secret.length < 32) throw new Error('session_secret_missing');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseCookies(request) {
  const result = new Map();
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key && !result.has(key)) result.set(key, value);
  }
  return result;
}

export function safeWorkshopReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/workshop';
  }
  return value.length <= 300 ? value : '/workshop';
}

export function workshopCookieHeaders({ sessionToken, csrfToken, clear = false }) {
  const common = 'Path=/; Secure; SameSite=Lax';
  if (clear) {
    return [
      `${WORKSHOP_SESSION_COOKIE}=; ${common}; HttpOnly; Max-Age=0`,
      `${WORKSHOP_CSRF_COOKIE}=; ${common}; Max-Age=0`
    ];
  }
  return [
    `${WORKSHOP_SESSION_COOKIE}=${sessionToken}; ${common}; HttpOnly; Max-Age=${SESSION_TTL_SECONDS}`,
    `${WORKSHOP_CSRF_COOKIE}=${csrfToken}; ${common}; Max-Age=${SESSION_TTL_SECONDS}`
  ];
}

export function responseWithCookies(response, cookieHeaders) {
  const headers = new Headers(response.headers);
  for (const cookie of cookieHeaders) headers.append('set-cookie', cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function allowedOrigins(env) {
  return new Set(String(env.WORKSHOP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));
}

export function verifyWorkshopOrigin(context) {
  const origin = context.request.headers.get('origin');
  return Boolean(origin && allowedOrigins(context.env).has(origin));
}

export async function readWorkshopSession(context) {
  if (!context.env?.WORKSHOP_DB || !context.env?.WORKSHOP_SESSION_SECRET) return null;
  const cookies = parseCookies(context.request);
  const token = cookies.get(WORKSHOP_SESSION_COOKIE);
  if (!token || token.length > 200) return null;
  const sessionHash = await hashWorkshopSecret(token, context.env.WORKSHOP_SESSION_SECRET);
  const now = new Date().toISOString();
  const row = await context.env.WORKSHOP_DB.prepare(`
    SELECT s.session_hash, s.csrf_hash, s.expires_at,
      u.user_id, u.display_name, u.avatar_ref, u.role, u.status
    FROM workshop_sessions s
    INNER JOIN workshop_users u ON u.user_id = s.user_id
    WHERE s.session_hash = ?1
      AND s.revoked_at IS NULL
      AND s.expires_at > ?2
      AND u.status = 'active'
    LIMIT 1
  `).bind(sessionHash, now).first();
  if (!row) return null;
  return {
    sessionHash: row.session_hash,
    csrfHash: row.csrf_hash,
    csrfToken: cookies.get(WORKSHOP_CSRF_COOKIE) ?? null,
    user: {
      userId: row.user_id,
      displayName: row.display_name,
      avatarRef: row.avatar_ref ?? null,
      role: row.role
    }
  };
}

export async function requireWorkshopMutation(context) {
  const requestId = createWorkshopRequestId();
  if (!verifyWorkshopOrigin(context)) {
    return { response: workshopErrorResponse(requestId, 'invalid_origin', '该写入请求来源无效。', 403) };
  }
  const session = await readWorkshopSession(context);
  if (!session) {
    return { response: workshopErrorResponse(requestId, 'authentication_required', '请先登录创意工坊。', 401) };
  }
  const headerToken = context.request.headers.get('x-workshop-csrf');
  if (!headerToken || !session.csrfToken || headerToken !== session.csrfToken || !session.csrfHash) {
    return { response: workshopErrorResponse(requestId, 'csrf_failed', '安全校验已失效，请刷新页面后重试。', 403) };
  }
  const csrfHash = await hashWorkshopSecret(headerToken, context.env.WORKSHOP_SESSION_SECRET);
  if (csrfHash !== session.csrfHash) {
    return { response: workshopErrorResponse(requestId, 'csrf_failed', '安全校验已失效，请刷新页面后重试。', 403) };
  }
  return { session, requestId };
}

export async function requireWorkshopAdminRead(context) {
  const requestId = createWorkshopRequestId();
  let session;
  try {
    session = await readWorkshopSession(context);
  } catch {
    return {
      response: workshopErrorResponse(
        requestId,
        'workshop_temporarily_unavailable',
        '暂时无法验证管理员身份。',
        503,
        { 'cache-control': 'no-store' }
      )
    };
  }
  if (!session) {
    return {
      response: workshopErrorResponse(
        requestId,
        'authentication_required',
        '请先登录创意工坊。',
        401,
        { 'cache-control': 'no-store' }
      )
    };
  }
  if (session.user.role !== 'admin') {
    return {
      response: workshopErrorResponse(
        requestId,
        'admin_required',
        '当前账号没有创意工坊管理权限。',
        403,
        { 'cache-control': 'no-store' }
      )
    };
  }
  return { session, requestId };
}

export async function requireWorkshopAdminMutation(context) {
  let security;
  try {
    security = await requireWorkshopMutation(context);
  } catch {
    return {
      response: workshopErrorResponse(
        createWorkshopRequestId(),
        'workshop_temporarily_unavailable',
        '暂时无法验证管理员操作。',
        503,
        { 'cache-control': 'no-store' }
      )
    };
  }
  if (security.response) return security;
  if (security.session.user.role !== 'admin') {
    return {
      response: workshopErrorResponse(
        security.requestId,
        'admin_required',
        '当前账号没有创意工坊管理权限。',
        403,
        { 'cache-control': 'no-store' }
      )
    };
  }
  return security;
}

export function sessionExpiry(now = new Date()) {
  return new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
}
