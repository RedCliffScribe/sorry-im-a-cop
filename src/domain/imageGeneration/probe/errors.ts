import type { ImageProbeNetworkFailureDiagnostic } from './types';

const MAX_SAFE_MESSAGE_LENGTH = 1200;

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(authorization\s*[:=]\s*)(?:bearer|basic)\s+[^\s,;"']+/gi, '$1[REDACTED]'],
  [/\b(?:bearer|basic)\s+[a-z0-9._~+/=-]{8,}/gi, '[REDACTED_AUTH]'],
  [/([?&](?:api[_-]?key|key|token|access[_-]?token|signature|sig)=)[^&#\s]+/gi, '$1[REDACTED]'],
  [/("?(?:x-api-key|api[_-]?key|token|password|secret)"?\s*[:=]\s*")([^"]+)(")/gi, '$1[REDACTED]$3'],
  [/(\b(?:x-api-key|api[_-]?key|token|password|secret)\b\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]'],
  [/\bsk-[a-z0-9_-]{12,}\b/gi, '[REDACTED_KEY]'],
  [/\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi, '[REDACTED_JWT]'],
  [/[a-z0-9+/]{100,}={0,2}/gi, '[REDACTED_BINARY]']
];

export function sanitizeImageProbeText(value: string): string {
  let sanitized = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127 ? ' ' : character;
  }).join('');
  for (const [pattern, replacement] of SECRET_PATTERNS) sanitized = sanitized.replace(pattern, replacement);
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  if (!sanitized) return '图片探针失败，供应商没有返回可安全展示的信息。';
  return sanitized.slice(0, MAX_SAFE_MESSAGE_LENGTH);
}

export function sanitizeImageProbeIdentifier(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const sanitized = sanitizeImageProbeText(value).slice(0, 200);
  return sanitized || undefined;
}

export function toSafeImageProbeMessage(error: unknown): string {
  if (error instanceof Error) return sanitizeImageProbeText(error.message);
  if (typeof error === 'string') return sanitizeImageProbeText(error);
  return '图片探针失败，未取得可安全展示的错误信息。';
}

export class ImageProbeBlockedError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ImageProbeBlockedError';
    this.code = code;
  }
}

export type ImageProbeProtocolErrorCategory =
  | 'configuration'
  | 'http'
  | 'provider-rejected'
  | 'invalid-response'
  | 'no-image'
  | 'download'
  | 'timeout';

export class ImageProbeProtocolError extends Error {
  readonly code: string;
  readonly category: ImageProbeProtocolErrorCategory;
  readonly httpStatus?: number;
  readonly networkFailure?: ImageProbeNetworkFailureDiagnostic;

  constructor(
    code: string,
    category: ImageProbeProtocolErrorCategory,
    message: string,
    httpStatus?: number,
    networkFailure?: ImageProbeNetworkFailureDiagnostic
  ) {
    super(message);
    this.name = 'ImageProbeProtocolError';
    this.code = code;
    this.category = category;
    this.httpStatus = httpStatus;
    this.networkFailure = networkFailure;
  }
}
