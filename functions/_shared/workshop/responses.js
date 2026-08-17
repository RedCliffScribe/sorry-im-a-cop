export function createWorkshopRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `workshop_${Date.now().toString(36)}`;
}

export function workshopJsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...headers
    }
  });
}

export function workshopErrorResponse(requestId, code, message, status, headers = {}) {
  return workshopJsonResponse({ ok: false, code, message, requestId }, status, headers);
}

async function responseEtag(body) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `"${hash}"`;
}

export async function cachedWorkshopJsonResponse(request, payload, requestId) {
  const body = JSON.stringify(payload);
  const etag = await responseEtag(body);
  const headers = {
    'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=60',
    etag,
    'x-request-id': requestId,
    'x-content-type-options': 'nosniff'
  };
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, {
    status: 200,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' }
  });
}

export function logWorkshopFunctionResult({ requestId, route, status, startedAt, code, itemId, revisionId }) {
  console.info(JSON.stringify({
    scope: 'workshop',
    requestId,
    route,
    status,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...(code ? { code } : {}),
    ...(itemId ? { itemId } : {}),
    ...(revisionId ? { revisionId } : {})
  }));
}
