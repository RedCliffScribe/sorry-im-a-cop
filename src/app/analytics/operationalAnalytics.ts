import { APP_VERSION } from '../releaseIdentity';

const visitorStorageKey = 'sorry-im-a-cop-v2-anonymous-visitor';
const sessionStorageKey = 'sorry-im-a-cop-v2-anonymous-session';
const heartbeatIntervalMs = 45_000;

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

function isOperationalAnalyticsEnabled(): boolean {
  return import.meta.env.PROD || import.meta.env.VITE_ENABLE_ANALYTICS === 'true';
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

export function startOperationalAnalytics(): () => void {
  if (
    !isOperationalAnalyticsEnabled() ||
    typeof window === 'undefined' ||
    window.location.pathname.startsWith('/admin/')
  ) {
    return () => undefined;
  }

  const visitorId = getOrCreateId(window.localStorage, visitorStorageKey, 'visitor');
  const sessionId = getOrCreateId(window.sessionStorage, sessionStorageKey, 'session');
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

  sendPayload(createPayload('page_view'));

  const sendHeartbeat = () => {
    if (document.visibilityState === 'visible') {
      sendPayload(createPayload('heartbeat'));
    }
  };

  const intervalId = window.setInterval(sendHeartbeat, heartbeatIntervalMs);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') sendHeartbeat();
  };
  window.addEventListener('focus', sendHeartbeat);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener('focus', sendHeartbeat);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
