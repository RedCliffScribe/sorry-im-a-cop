import type {
  ImageBrowserAddressSpace,
  ImageBrowserBoundaryAuth,
  ImageBrowserTargetAnalysis
} from './types';

function isIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function classifyIpv4(hostname: string): ImageBrowserAddressSpace {
  const [first, second] = hostname.split('.').map(Number);
  if (first === 127) return 'loopback';
  if (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  ) {
    return 'local';
  }
  return 'public';
}

export function classifyImageBrowserAddressSpace(hostname: string): ImageBrowserAddressSpace {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') return 'loopback';
  if (normalized.endsWith('.localhost')) return 'loopback';
  if (normalized.endsWith('.local')) return 'local';
  if (isIpv4(normalized)) return classifyIpv4(normalized);
  if (normalized.includes(':')) {
    if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return 'local';
    }
    return 'public';
  }
  return normalized ? 'public' : 'unknown';
}

function isMorePrivate(target: ImageBrowserAddressSpace, page: ImageBrowserAddressSpace): boolean {
  const rank: Record<ImageBrowserAddressSpace, number> = {
    unknown: 3,
    public: 2,
    local: 1,
    loopback: 0
  };
  return rank[target] < rank[page];
}

export function normalizeImageBrowserBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只允许 http:// 或 https:// 地址。');
  }
  if (url.username || url.password) throw new Error('地址中不能包含用户名或密码，请使用鉴权栏。');
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

export function joinImageBrowserUrl(baseUrl: string, path: string): string {
  const normalizedBase = `${normalizeImageBrowserBaseUrl(baseUrl)}/`;
  return new URL(path.replace(/^\//, ''), normalizedBase).toString();
}

export function analyzeImageBrowserTarget(
  baseUrl: string,
  pageUrl: string,
  auth: ImageBrowserBoundaryAuth
): ImageBrowserTargetAnalysis {
  const normalizedBaseUrl = normalizeImageBrowserBaseUrl(baseUrl);
  const target = new URL(normalizedBaseUrl);
  const page = new URL(pageUrl);
  const targetAddressSpace = classifyImageBrowserAddressSpace(target.hostname);
  const pageAddressSpace = classifyImageBrowserAddressSpace(page.hostname);
  const crossOrigin = target.origin !== page.origin;
  const securePage = page.protocol === 'https:';
  const insecureTarget = target.protocol === 'http:';
  const localNetworkAccessExpected = crossOrigin && isMorePrivate(targetAddressSpace, pageAddressSpace);
  const warnings: string[] = [];

  if (crossOrigin) warnings.push('跨源读取必须由目标服务正确允许 CORS。');
  if (crossOrigin && auth.mode !== 'none') {
    warnings.push('Authorization 请求头通常会触发浏览器自动发起 CORS 预检。');
  }
  if (localNetworkAccessExpected) {
    warnings.push('浏览器可能要求“本地网络访问”权限；实际弹窗与结果以当前浏览器为准。');
  }
  if (securePage && insecureTarget && targetAddressSpace === 'public') {
    warnings.push('HTTPS 页面访问公网 HTTP 地址通常会被混合内容规则阻止。');
  } else if (securePage && insecureTarget && targetAddressSpace !== 'public') {
    warnings.push('HTTPS 页面访问本地 HTTP 服务受浏览器本地网络权限与安全上下文策略约束。');
  }

  return {
    baseUrl: normalizedBaseUrl,
    targetAddressSpace,
    pageAddressSpace,
    crossOrigin,
    securePage,
    insecureTarget,
    localNetworkAccessExpected,
    warnings
  };
}
