import {
  hashWorkshopSecret,
  randomWorkshopSecret,
  readWorkshopSession,
  requireWorkshopMutation,
  responseWithCookies,
  safeWorkshopReturnTo,
  sessionExpiry,
  verifyWorkshopOrigin,
  workshopCookieHeaders
} from './auth.js';
import {
  createWorkshopRequestId,
  workshopErrorResponse,
  workshopJsonResponse
} from './responses.js';
import { verifyWorkshopTurnstile } from './turnstile.js';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/v10/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/v10/users/@me';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function configured(context) {
  return Boolean(
    context.env?.WORKSHOP_DB
    && context.env?.DISCORD_CLIENT_ID
    && context.env?.DISCORD_CLIENT_SECRET
    && context.env?.DISCORD_REDIRECT_URI
    && context.env?.WORKSHOP_SESSION_SECRET
    && context.env?.TURNSTILE_SECRET_KEY
  );
}

async function parseSmallJson(request, maxBytes = 8192) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('body_too_large');
  return JSON.parse(text);
}

function oauthError(requestId, code, message, status = 400) {
  return workshopErrorResponse(requestId, code, message, status, {
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer'
  });
}

export async function handleDiscordLoginStart(context) {
  const requestId = createWorkshopRequestId();
  if (!configured(context)) {
    return oauthError(requestId, 'oauth_not_configured', '创意工坊登录尚未完成配置。', 503);
  }
  if (!verifyWorkshopOrigin(context)) {
    return oauthError(requestId, 'invalid_origin', '登录请求来源无效。', 403);
  }
  let body;
  try { body = await parseSmallJson(context.request); } catch {
    return oauthError(requestId, 'invalid_request', '登录请求格式无效。');
  }
  const returnTo = safeWorkshopReturnTo(body?.returnTo);
  const turnstile = await verifyWorkshopTurnstile(context, body?.turnstileToken, 'workshop_login');
  if (!turnstile.success) {
    return oauthError(requestId, 'turnstile_failed', '人机验证未通过，请刷新后重试。', 403);
  }
  const state = randomWorkshopSecret();
  const stateHash = await hashWorkshopSecret(state, context.env.WORKSHOP_SESSION_SECRET);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MS).toISOString();
  try {
    await context.env.WORKSHOP_DB.prepare(`
      INSERT INTO workshop_oauth_states (
        state_hash, return_to, created_at, expires_at, used_at
      ) VALUES (?1, ?2, ?3, ?4, NULL)
    `).bind(stateHash, returnTo, now.toISOString(), expiresAt).run();
  } catch {
    return oauthError(requestId, 'workshop_temporarily_unavailable', '暂时无法开始登录，请稍后重试。', 503);
  }
  const authorizationUrl = new URL(DISCORD_AUTHORIZE_URL);
  authorizationUrl.search = new URLSearchParams({
    client_id: context.env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: context.env.DISCORD_REDIRECT_URI,
    scope: 'identify',
    state,
    prompt: 'consent'
  }).toString();
  return workshopJsonResponse({ ok: true, authorizationUrl: authorizationUrl.toString() }, 200, {
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-request-id': requestId
  });
}

function adminDiscordIds(value) {
  return new Set(String(value ?? '').split(',').map((entry) => entry.trim()).filter((entry) => /^\d+$/.test(entry)));
}

function displayNameOf(user) {
  const value = typeof user.global_name === 'string' && user.global_name.trim()
    ? user.global_name.trim()
    : typeof user.username === 'string' ? user.username.trim() : '';
  return value.slice(0, 80);
}

function avatarReferenceOf(user) {
  return typeof user.avatar === 'string' && /^[A-Za-z0-9_]{1,100}$/.test(user.avatar)
    ? `discord-avatar:${user.avatar}`
    : null;
}

async function exchangeDiscordCode(context, code) {
  const body = new URLSearchParams({
    client_id: context.env.DISCORD_CLIENT_ID,
    client_secret: context.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: context.env.DISCORD_REDIRECT_URI
  });
  const fetcher = context.fetcher ?? fetch;
  const tokenResponse = await fetcher(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!tokenResponse.ok) throw new Error('discord_token_failed');
  const token = await tokenResponse.json();
  if (typeof token?.access_token !== 'string' || token.token_type !== 'Bearer') {
    throw new Error('discord_token_invalid');
  }
  const userResponse = await fetcher(DISCORD_ME_URL, {
    headers: { authorization: `Bearer ${token.access_token}` }
  });
  if (!userResponse.ok) throw new Error('discord_user_failed');
  return userResponse.json();
}

export async function handleDiscordLoginCallback(context) {
  const requestId = createWorkshopRequestId();
  if (!configured(context)) {
    return oauthError(requestId, 'oauth_not_configured', '创意工坊登录尚未完成配置。', 503);
  }
  const url = new URL(context.request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || state.length > 200 || !code || code.length > 500) {
    return oauthError(requestId, 'oauth_state_invalid', '登录回调缺少必要信息。');
  }
  const stateHash = await hashWorkshopSecret(state, context.env.WORKSHOP_SESSION_SECRET);
  const now = new Date();
  let stateRow;
  try {
    stateRow = await context.env.WORKSHOP_DB.prepare(`
      UPDATE workshop_oauth_states
      SET used_at = ?1
      WHERE state_hash = ?2 AND used_at IS NULL AND expires_at > ?1
      RETURNING return_to
    `).bind(now.toISOString(), stateHash).first();
  } catch {
    return oauthError(requestId, 'workshop_temporarily_unavailable', '登录状态暂时无法验证。', 503);
  }
  if (!stateRow) return oauthError(requestId, 'oauth_state_invalid', '登录状态已失效或已使用，请重新登录。');

  let discordUser;
  try { discordUser = await exchangeDiscordCode(context, code); } catch {
    return oauthError(requestId, 'oauth_exchange_failed', 'Discord 登录未完成，请重新尝试。', 502);
  }
  if (!discordUser || typeof discordUser.id !== 'string' || !/^\d+$/.test(discordUser.id)) {
    return oauthError(requestId, 'oauth_exchange_failed', 'Discord 返回的用户资料无效。', 502);
  }
  const displayName = displayNameOf(discordUser);
  if (!displayName) return oauthError(requestId, 'oauth_exchange_failed', 'Discord 用户名无法识别。', 502);
  const avatarRef = avatarReferenceOf(discordUser);
  const bootstrappedAdmin = adminDiscordIds(context.env.WORKSHOP_ADMIN_DISCORD_IDS).has(discordUser.id);
  let existing;
  try {
    existing = await context.env.WORKSHOP_DB.prepare(`
      SELECT user_id, role FROM workshop_users WHERE discord_user_id = ?1 LIMIT 1
    `).bind(discordUser.id).first();
    const userId = existing?.user_id ?? `user_${crypto.randomUUID().replace(/-/g, '')}`;
    if (existing) {
      await context.env.WORKSHOP_DB.prepare(`
        UPDATE workshop_users
        SET display_name = ?1, avatar_ref = ?2,
          role = CASE WHEN ?3 = 1 THEN 'admin' ELSE role END,
          updated_at = ?4, last_login_at = ?4
        WHERE user_id = ?5
      `).bind(displayName, avatarRef, bootstrappedAdmin ? 1 : 0, now.toISOString(), userId).run();
    } else {
      await context.env.WORKSHOP_DB.prepare(`
        INSERT INTO workshop_users (
          user_id, discord_user_id, display_name, avatar_ref, role, status,
          created_at, updated_at, last_login_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6, ?6)
      `).bind(
        userId,
        discordUser.id,
        displayName,
        avatarRef,
        bootstrappedAdmin ? 'admin' : 'member',
        now.toISOString()
      ).run();
    }
    const sessionToken = randomWorkshopSecret();
    const csrfToken = randomWorkshopSecret();
    const [sessionHash, csrfHash] = await Promise.all([
      hashWorkshopSecret(sessionToken, context.env.WORKSHOP_SESSION_SECRET),
      hashWorkshopSecret(csrfToken, context.env.WORKSHOP_SESSION_SECRET)
    ]);
    await context.env.WORKSHOP_DB.prepare(`
      INSERT INTO workshop_sessions (
        session_hash, user_id, created_at, expires_at, last_seen_at, revoked_at, csrf_hash
      ) VALUES (?1, ?2, ?3, ?4, ?3, NULL, ?5)
    `).bind(sessionHash, userId, now.toISOString(), sessionExpiry(now), csrfHash).run();
    const redirectUrl = new URL(safeWorkshopReturnTo(stateRow.return_to), context.request.url);
    const response = new Response(null, {
      status: 302,
      headers: {
        location: redirectUrl.toString(),
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer'
      }
    });
    return responseWithCookies(response, workshopCookieHeaders({ sessionToken, csrfToken }));
  } catch {
    return oauthError(requestId, 'workshop_temporarily_unavailable', '登录资料暂时无法保存。', 503);
  }
}

export async function handleWorkshopSession(context) {
  const requestId = createWorkshopRequestId();
  try {
    const session = await readWorkshopSession(context);
    return workshopJsonResponse(
      session ? { authenticated: true, user: session.user } : { authenticated: false },
      200,
      { 'cache-control': 'no-store', 'x-request-id': requestId }
    );
  } catch {
    return workshopErrorResponse(requestId, 'workshop_temporarily_unavailable', '暂时无法读取登录状态。', 503);
  }
}

export async function handleWorkshopLogout(context) {
  const security = await requireWorkshopMutation(context);
  if (security.response) return security.response;
  try {
    await context.env.WORKSHOP_DB.prepare(`
      UPDATE workshop_sessions SET revoked_at = ?1
      WHERE session_hash = ?2 AND revoked_at IS NULL
    `).bind(new Date().toISOString(), security.session.sessionHash).run();
  } catch {
    return workshopErrorResponse(security.requestId, 'workshop_temporarily_unavailable', '暂时无法退出登录。', 503);
  }
  return responseWithCookies(
    workshopJsonResponse({ ok: true }, 200, { 'cache-control': 'no-store' }),
    workshopCookieHeaders({ clear: true })
  );
}
