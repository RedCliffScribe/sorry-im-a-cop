import { APP_VERSION } from '../releaseIdentity';

export const ANALYTICS_VISITOR_STORAGE_KEY = 'sorry-im-a-cop-v2-anonymous-visitor';
export const ANALYTICS_SESSION_STORAGE_KEY = 'sorry-im-a-cop-v2-anonymous-session';
export const ANALYTICS_PRESENCE_LEASE_STORAGE_KEY = 'sorry-im-a-cop-v2-analytics-presence-lease';
export const ANALYTICS_HEARTBEAT_INTERVAL_MS = 5 * 60_000;
export const ANALYTICS_HEARTBEAT_MIN_GAP_MS = 4 * 60_000;
export const ANALYTICS_PRESENCE_LEASE_MS = 6 * 60_000;

export type AnalyticsDeviceClass = 'mobile' | 'tablet' | 'desktop';

export interface OperationalAnalyticsPayload {
  event: 'page_view' | 'heartbeat';
  visitorId: string;
  sessionId: string;
  language: string;
  deviceClass: AnalyticsDeviceClass;
  viewportWidth: number;
  referrerHost: string;
  appVersion: string;
}

function createAnonymousId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getOrCreateId(storage: Storage, key: string, prefix: string): string {
  try {
    const stored = storage.getItem(key);
    if (stored && stored.length >= 16 && stored.length <= 128) return stored;
    const created = createAnonymousId(prefix);
    storage.setItem(key, created);
    return created;
  } catch {
    return createAnonymousId(prefix);
  }
}

export function resolveDeviceClass(width: number): AnalyticsDeviceClass {
  if (width <= 620) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

export function resolveReferrerHost(referrer: string, currentHost: string): string {
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).host.toLowerCase();
    return !host || host === currentHost.toLowerCase() ? 'internal' : host.slice(0, 160);
  } catch {
    return 'unknown';
  }
}

export function resolveOperationalAnalyticsEnabled(
  isProduction: boolean,
  configuredValue?: string
): boolean {
  if (configuredValue === 'false') return false;
  return isProduction || configuredValue === 'true';
}

function isOperationalAnalyticsEnabled(): boolean {
  return resolveOperationalAnalyticsEnabled(
    import.meta.env.PROD,
    import.meta.env.VITE_ENABLE_ANALYTICS
  );
}

function sendPayload(payload: OperationalAnalyticsPayload): void {
  void fetch('/api/analytics/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: 'same-origin'
  }).catch(() => {
    // Operational analytics must never interrupt local play or surface errors.
  });
}

interface AnalyticsPresenceLease {
  ownerId: string;
  expiresAt: number;
}

function parsePresenceLease(value: string | null): AnalyticsPresenceLease | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AnalyticsPresenceLease>;
    if (
      typeof parsed.ownerId !== 'string' ||
      !parsed.ownerId ||
      !Number.isFinite(parsed.expiresAt)
    ) {
      return null;
    }
    return { ownerId: parsed.ownerId, expiresAt: Number(parsed.expiresAt) };
  } catch {
    return null;
  }
}

export function tryAcquireAnalyticsPresenceLease(
  storage: Storage,
  ownerId: string,
  now: number,
  leaseMs = ANALYTICS_PRESENCE_LEASE_MS
): boolean {
  try {
    const existing = parsePresenceLease(storage.getItem(ANALYTICS_PRESENCE_LEASE_STORAGE_KEY));
    if (existing && existing.ownerId !== ownerId && existing.expiresAt > now) return false;

    storage.setItem(
      ANALYTICS_PRESENCE_LEASE_STORAGE_KEY,
      JSON.stringify({ ownerId, expiresAt: now + leaseMs } satisfies AnalyticsPresenceLease)
    );
    return parsePresenceLease(storage.getItem(ANALYTICS_PRESENCE_LEASE_STORAGE_KEY))?.ownerId === ownerId;
  } catch {
    // Storage-disabled browsers cannot coordinate tabs; analytics must remain non-blocking.
    return true;
  }
}

export function releaseAnalyticsPresenceLease(storage: Storage, ownerId: string): void {
  try {
    const existing = parsePresenceLease(storage.getItem(ANALYTICS_PRESENCE_LEASE_STORAGE_KEY));
    if (existing?.ownerId === ownerId) storage.removeItem(ANALYTICS_PRESENCE_LEASE_STORAGE_KEY);
  } catch {
    // Analytics cleanup must never interrupt navigation or local play.
  }
}

export function shouldDispatchOperationalHeartbeat({
  now,
  lastDispatchedAt,
  visibilityState
}: {
  now: number;
  lastDispatchedAt: number;
  visibilityState: DocumentVisibilityState;
}): boolean {
  return visibilityState === 'visible' && now - lastDispatchedAt >= ANALYTICS_HEARTBEAT_MIN_GAP_MS;
}

export function startOperationalAnalytics(): () => void {
  if (
    !isOperationalAnalyticsEnabled() ||
    typeof window === 'undefined' ||
    window.location.pathname.startsWith('/admin/')
  ) {
    return () => undefined;
  }

  const visitorId = getOrCreateId(window.localStorage, ANALYTICS_VISITOR_STORAGE_KEY, 'visitor');
  const sessionId = getOrCreateId(window.sessionStorage, ANALYTICS_SESSION_STORAGE_KEY, 'session');
  const presenceOwnerId = createAnonymousId('tab');
  const appVersion = import.meta.env.VITE_APP_VERSION || APP_VERSION;

  const createPayload = (event: OperationalAnalyticsPayload['event']): OperationalAnalyticsPayload => ({
    event,
    visitorId,
    sessionId,
    language: document.documentElement.lang || navigator.language || 'zh-CN',
    deviceClass: resolveDeviceClass(window.innerWidth),
    viewportWidth: Math.max(320, Math.min(10_000, Math.round(window.innerWidth))),
    referrerHost: resolveReferrerHost(document.referrer, window.location.host),
    appVersion
  });

  let lastHeartbeatDispatchedAt = Date.now();
  sendPayload(createPayload('page_view'));

  const sendHeartbeat = () => {
    const now = Date.now();
    if (!shouldDispatchOperationalHeartbeat({
      now,
      lastDispatchedAt: lastHeartbeatDispatchedAt,
      visibilityState: document.visibilityState
    })) return;
    if (!tryAcquireAnalyticsPresenceLease(window.localStorage, presenceOwnerId, now)) return;

    lastHeartbeatDispatchedAt = now;
    sendPayload(createPayload('heartbeat'));
  };

  const intervalId = window.setInterval(sendHeartbeat, ANALYTICS_HEARTBEAT_INTERVAL_MS);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      sendHeartbeat();
    } else {
      releaseAnalyticsPresenceLease(window.localStorage, presenceOwnerId);
    }
  };
  window.addEventListener('focus', sendHeartbeat);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener('focus', sendHeartbeat);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    releaseAnalyticsPresenceLease(window.localStorage, presenceOwnerId);
  };
}
