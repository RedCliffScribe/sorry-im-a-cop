import { unzipSync } from 'fflate';
import {
  ImageProbeProtocolError,
  sanitizeImageProbeText,
  type ImageProbeAdapterContext,
  type ImageProbeGeneratedImage,
  type ImageProbeNetworkFailureDiagnostic,
  type ImageProbeNetworkLikelyCause,
  type ImageProbeNetworkRequestRole
} from '../probe';
import { analyzeImageBrowserTarget } from '../browserBoundary/targetAnalysis';

const MAX_JSON_RESPONSE_CHARS = 64 * 1024 * 1024;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 32;
const MAX_ZIP_EXPANDED_BYTES = 128 * 1024 * 1024;

export function joinProviderUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function redactProviderSecrets(value: unknown, secrets: string[] = []): string {
  let message = value instanceof Error ? value.message : String(value);
  for (const secret of secrets.filter(Boolean)) message = message.split(secret).join('[REDACTED]');
  return sanitizeImageProbeText(message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function currentBrowserPageUrl(): string | undefined {
  if (typeof globalThis.location !== 'object') return undefined;
  const href = globalThis.location?.href;
  return typeof href === 'string' && /^https?:/i.test(href) ? href : undefined;
}

function expectsCorsPreflight(init: RequestInit): boolean {
  const method = (init.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'POST'].includes(method)) return true;
  const headers = new Headers(init.headers);
  let expected = false;
  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (['accept', 'accept-language', 'content-language'].includes(normalizedKey)) return;
    if (normalizedKey === 'content-type') {
      const mimeType = value.split(';')[0]?.trim().toLowerCase();
      if (['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'].includes(mimeType)) return;
    }
    expected = true;
  });
  return expected;
}

export function createImageProbeNetworkFailureDiagnostic(input: {
  url: string;
  init: RequestInit;
  requestRole: ImageProbeNetworkRequestRole;
  error: unknown;
  pageUrl?: string;
}): ImageProbeNetworkFailureDiagnostic {
  const method = (input.init.method ?? 'GET').toUpperCase().slice(0, 16);
  const likelyCauses: ImageProbeNetworkLikelyCause[] = [];
  const diagnostic: ImageProbeNetworkFailureDiagnostic = {
    requestRole: input.requestRole,
    method,
    responseReached: false,
    browserErrorName: input.error instanceof Error ? sanitizeImageProbeText(input.error.name).slice(0, 80) : undefined,
    likelyCauses
  };
  try {
    const target = new URL(input.url);
    diagnostic.targetOrigin = target.origin;
    const pageUrl = input.pageUrl ?? currentBrowserPageUrl();
    if (pageUrl) {
      const auth = new Headers(input.init.headers).has('authorization')
        ? { mode: 'bearer' as const, token: '[REDACTED]' }
        : { mode: 'none' as const };
      const analysis = analyzeImageBrowserTarget(input.url, pageUrl, auth);
      diagnostic.pageOrigin = new URL(pageUrl).origin;
      diagnostic.crossOrigin = analysis.crossOrigin;
      diagnostic.securePage = analysis.securePage;
      diagnostic.insecureTarget = analysis.insecureTarget;
      diagnostic.localNetworkAccessExpected = analysis.localNetworkAccessExpected;
      diagnostic.corsPreflightExpected = analysis.crossOrigin && expectsCorsPreflight(input.init);
      if (analysis.securePage && analysis.insecureTarget) likelyCauses.push('mixed-content');
      if (analysis.localNetworkAccessExpected) likelyCauses.push('private-network-access');
      if (analysis.crossOrigin) {
        likelyCauses.push(diagnostic.corsPreflightExpected ? 'cors-preflight-or-response' : 'cors-response');
      }
    }
  } catch {
    // A malformed URL is handled by the caller's existing request validation.
  }
  likelyCauses.push('browser-network-dns-tls');
  return diagnostic;
}

function networkFailureMessage(
  requestRole: ImageProbeNetworkRequestRole,
  error: unknown,
  secrets: string[]
): string {
  const detail = redactProviderSecrets(error, secrets);
  const prefix: Record<ImageProbeNetworkRequestRole, string> = {
    'generation-submit': '图片生成接口',
    'task-status-poll': '已提交图片任务的状态查询',
    'generated-image-download': '供应商返回结果后的临时图片下载',
    'reference-image-upload': '参考图片上传',
    'provider-auxiliary': '图片供应商请求'
  };
  return `${prefix[requestRole]}未取得浏览器可读取的 HTTP 响应：${detail}`;
}

export async function fetchProviderResponse(
  context: ImageProbeAdapterContext,
  url: string,
  init: RequestInit,
  secrets: string[] = [],
  requestRole: ImageProbeNetworkRequestRole = 'provider-auxiliary'
): Promise<Response> {
  if (context.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  try {
    const response = await context.fetch(url, { ...init, signal: context.signal });
    if (context.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return response;
  } catch (error) {
    if (context.signal.aborted || isAbortError(error)) throw new DOMException('Aborted', 'AbortError');
    throw new ImageProbeProtocolError(
      'provider-network-failed',
      'http',
      networkFailureMessage(requestRole, error, secrets),
      undefined,
      createImageProbeNetworkFailureDiagnostic({ url, init, requestRole, error })
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function extractProviderRequestId(response: Response, payload?: unknown): string | undefined {
  const record = asRecord(payload);
  const output = asRecord(record?.output);
  const payloadCandidate = [
    record?.request_id,
    record?.requestId,
    record?.id,
    record?.task_id,
    record?.prompt_id,
    output?.request_id,
    output?.task_id,
    output?.prompt_id
  ].find((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  if (payloadCandidate) return payloadCandidate;
  for (const header of ['x-request-id', 'request-id', 'x-correlation-id', 'x-trace-id']) {
    const value = response.headers.get(header)?.trim();
    if (value) return value;
  }
  return undefined;
}

export function extractProviderErrorMessage(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const record = asRecord(value);
  if (!record) return '';
  const error = asRecord(record.error);
  const output = asRecord(record.output);
  const candidates = [
    error?.message,
    error?.detail,
    output?.message,
    record.message,
    record.detail,
    typeof record.error === 'string' ? record.error : undefined
  ];
  return candidates.find((candidate): candidate is string => typeof candidate === 'string' && Boolean(candidate.trim()))?.trim() ?? '';
}

function createHttpError(response: Response, payload: unknown, secrets: string[]): ImageProbeProtocolError {
  const detail = redactProviderSecrets(extractProviderErrorMessage(payload), secrets);
  const rejected = /safety|policy|moderation|content filter|prohibited|inspection/i.test(detail);
  return new ImageProbeProtocolError(
    rejected ? 'provider-rejected' : `provider-http-${response.status}`,
    rejected ? 'provider-rejected' : 'http',
    `图片供应商请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`,
    response.status
  );
}

export async function readProviderJson(
  response: Response,
  secrets: string[] = []
): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new ImageProbeProtocolError(
      'provider-response-read-failed',
      'invalid-response',
      `无法读取图片供应商响应：${redactProviderSecrets(error, secrets)}`,
      response.status || undefined
    );
  }
  if (text.length > MAX_JSON_RESPONSE_CHARS) {
    throw new ImageProbeProtocolError('provider-response-too-large', 'invalid-response', '图片供应商 JSON 响应超过安全上限。');
  }
  let payload: unknown = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new ImageProbeProtocolError('provider-invalid-json', 'invalid-response', '图片供应商返回了无法解析的 JSON。');
      }
      payload = { message: text.slice(0, 2000) };
    }
  }
  if (!response.ok) throw createHttpError(response, payload, secrets);
  return payload;
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function normalizeDeclaredMimeType(value: string | null | undefined): string | undefined {
  const normalized = value?.split(';')[0]?.trim().toLowerCase();
  return normalized?.startsWith('image/') ? normalized : undefined;
}

export function detectImageMimeType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(new TextDecoder().decode(bytes.slice(0, 6)))) return 'image/gif';
  return undefined;
}

export function createGeneratedImage(
  bytes: Uint8Array,
  declaredMimeType?: string,
  dimensions: { width?: number; height?: number } = {}
): ImageProbeGeneratedImage {
  if (bytes.byteLength === 0) {
    throw new ImageProbeProtocolError('provider-empty-image', 'no-image', '图片供应商返回了空图片。');
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageProbeProtocolError('provider-image-too-large', 'invalid-response', '图片供应商返回的单张图片超过安全上限。');
  }
  const detected = detectImageMimeType(bytes);
  const declared = normalizeDeclaredMimeType(declaredMimeType);
  if (!detected) {
    throw new ImageProbeProtocolError('provider-non-image', 'invalid-response', '图片供应商返回了非图片数据。');
  }
  if (declared && detected && declared !== detected) {
    throw new ImageProbeProtocolError('provider-image-mime-mismatch', 'invalid-response', '图片供应商返回的 MIME 与图片字节不一致。');
  }
  return { bytes: copyArrayBuffer(bytes), mimeType: detected, ...dimensions };
}

export function decodeBase64Image(
  encoded: string,
  mimeType?: string,
  dimensions: { width?: number; height?: number } = {}
): ImageProbeGeneratedImage {
  let data = encoded.trim();
  const dataUrl = /^data:([^;,]+);base64,(.*)$/is.exec(data);
  if (dataUrl) {
    mimeType = dataUrl[1] || mimeType;
    data = dataUrl[2];
  }
  data = data.replace(/\s+/g, '');
  if (!data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) {
    throw new ImageProbeProtocolError('provider-invalid-base64', 'invalid-response', '图片供应商返回了损坏的 base64 图片。');
  }
  try {
    const binary = atob(data.padEnd(Math.ceil(data.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return createGeneratedImage(bytes, mimeType, dimensions);
  } catch (error) {
    if (error instanceof ImageProbeProtocolError) throw error;
    throw new ImageProbeProtocolError('provider-invalid-base64', 'invalid-response', '图片供应商返回了损坏的 base64 图片。');
  }
}

export function encodeBase64Bytes(bytes: ArrayBuffer): string {
  const values = new Uint8Array(bytes);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    binary += String.fromCharCode(...values.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function referenceImageDataUrl(reference: {
  mimeType: string;
  bytes: ArrayBuffer;
}): string {
  return `data:${reference.mimeType};base64,${encodeBase64Bytes(reference.bytes)}`;
}

export async function readBinaryImage(
  response: Response,
  dimensions: { width?: number; height?: number } = {}
): Promise<ImageProbeGeneratedImage> {
  if (!response.ok) throw createHttpError(response, {}, []);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return createGeneratedImage(bytes, response.headers.get('content-type') ?? undefined, dimensions);
}

export async function downloadTemporaryImage(
  context: ImageProbeAdapterContext,
  url: string,
  dimensions: { width?: number; height?: number } = {}
): Promise<ImageProbeGeneratedImage> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ImageProbeProtocolError('provider-invalid-image-url', 'download', '图片供应商返回了无效的临时图片地址。');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ImageProbeProtocolError('provider-invalid-image-url', 'download', '临时图片地址必须使用 HTTP(S)。');
  }
  const response = await fetchProviderResponse(context, parsed.toString(), {
    method: 'GET',
    headers: { Accept: 'image/*' },
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow',
    referrerPolicy: 'no-referrer'
  }, [], 'generated-image-download');
  if (!response.ok) throw createHttpError(response, {}, []);
  return readBinaryImage(response, dimensions);
}

const IMAGE_EXTENSION_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

function mimeTypeFromFilename(filename: string): string | undefined {
  const normalized = filename.toLowerCase();
  return Object.entries(IMAGE_EXTENSION_MIME).find(([extension]) => normalized.endsWith(extension))?.[1];
}

export function extractZipImages(
  archiveBytes: Uint8Array,
  dimensions: { width?: number; height?: number } = {}
): ImageProbeGeneratedImage[] {
  if (archiveBytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageProbeProtocolError('provider-zip-too-large', 'invalid-response', '图片 ZIP 响应超过安全上限。');
  }
  let archive: Record<string, Uint8Array>;
  let imageEntryCount = 0;
  let expandedImageBytes = 0;
  let limitError: ImageProbeProtocolError | undefined;
  try {
    archive = unzipSync(archiveBytes, {
      filter: (file) => {
        if (!mimeTypeFromFilename(file.name)) return false;
        imageEntryCount += 1;
        expandedImageBytes += file.originalSize;
        if (imageEntryCount > MAX_ZIP_ENTRIES) {
          limitError = new ImageProbeProtocolError(
            'provider-zip-too-many-images',
            'invalid-response',
            '图片 ZIP 中的图片数量超过安全上限。'
          );
          return false;
        }
        if (file.originalSize > MAX_IMAGE_BYTES || expandedImageBytes > MAX_ZIP_EXPANDED_BYTES) {
          limitError = new ImageProbeProtocolError(
            'provider-zip-expanded-too-large',
            'invalid-response',
            '图片 ZIP 解压后的图片数据超过安全上限。'
          );
          return false;
        }
        return true;
      }
    });
  } catch {
    if (limitError) throw limitError;
    throw new ImageProbeProtocolError('provider-invalid-zip', 'invalid-response', '图片供应商返回了无法解压的 ZIP。');
  }
  if (limitError) throw limitError;
  const entries = Object.entries(archive)
    .filter(([filename]) => Boolean(mimeTypeFromFilename(filename)))
    .sort(([left], [right]) => left.localeCompare(right));
  const images = entries.map(([filename, bytes]) => createGeneratedImage(bytes, mimeTypeFromFilename(filename), dimensions));
  if (images.length === 0) {
    throw new ImageProbeProtocolError('provider-no-image', 'no-image', '图片 ZIP 中没有可用图片。');
  }
  return images;
}

export function requireImages(images: ImageProbeGeneratedImage[], providerLabel: string): ImageProbeGeneratedImage[] {
  if (images.length === 0) {
    throw new ImageProbeProtocolError('provider-no-image', 'no-image', `${providerLabel} 成功响应但没有返回图片。`);
  }
  return images;
}

export function jsonRequestHeaders(apiKey: string, extra: Record<string, string> = {}): Headers {
  return new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...extra
  });
}
