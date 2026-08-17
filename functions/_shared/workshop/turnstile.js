const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyWorkshopTurnstile(context, token, expectedAction) {
  const secret = context.env?.TURNSTILE_SECRET_KEY;
  if (!secret || typeof token !== 'string' || !token.trim() || token.length > 2048) {
    return { success: false, code: 'turnstile_not_configured_or_missing' };
  }
  const body = new URLSearchParams({
    secret,
    response: token.trim(),
    idempotency_key: crypto.randomUUID()
  });
  const remoteIp = context.request.headers.get('cf-connecting-ip');
  if (remoteIp) body.set('remoteip', remoteIp);
  let response;
  try {
    response = await (context.fetcher ?? fetch)(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
  } catch {
    return { success: false, code: 'turnstile_unavailable' };
  }
  if (!response.ok) return { success: false, code: 'turnstile_unavailable' };
  let result;
  try { result = await response.json(); } catch { return { success: false, code: 'turnstile_invalid_response' }; }
  if (!result?.success) return { success: false, code: 'turnstile_rejected' };
  if (expectedAction && result.action !== expectedAction) {
    return { success: false, code: 'turnstile_action_mismatch' };
  }
  return { success: true };
}
