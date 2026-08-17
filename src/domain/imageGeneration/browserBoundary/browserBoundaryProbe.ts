import { createImageBrowserAuthHeaders, sanitizeImageBrowserBoundaryMessage } from './auth';
import { getImageBrowserBoundaryEndpoints } from './endpointDefinitions';
import { analyzeImageBrowserTarget, joinImageBrowserUrl } from './targetAnalysis';
import type {
  ImageBrowserBoundaryProbeInput,
  ImageBrowserBoundaryProbeReport,
  ImageBrowserEndpointProbeResult,
  ImageBrowserWebSocketProbeResult
} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BODY_SAMPLE_BYTES = 64 * 1024;

type ImageBoundaryFetchInit = RequestInit & { targetAddressSpace?: 'local' };

export interface ImageBrowserBoundaryProbeDependencies {
  fetch?: typeof fetch;
  now?: () => Date;
  webSocketFactory?: (url: string) => WebSocket;
}

interface BodySample {
  bytesRead: number;
  truncated: boolean;
}

async function readCappedBody(response: Response): Promise<BodySample> {
  if (!response.body) return { bytesRead: 0, truncated: false };
  const reader = response.body.getReader();
  let bytesRead = 0;
  let truncated = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const remaining = MAX_BODY_SAMPLE_BYTES - bytesRead;
      if (chunk.value.byteLength > remaining) {
        bytesRead = MAX_BODY_SAMPLE_BYTES;
        truncated = true;
        await reader.cancel();
        break;
      }
      bytesRead += chunk.value.byteLength;
      if (bytesRead === MAX_BODY_SAMPLE_BYTES) {
        const next = await reader.read();
        truncated = !next.done;
        if (truncated) await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { bytesRead, truncated };
}

function linkAbortSignal(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  const abort = () => target.abort(source.reason);
  if (source.aborted) abort();
  else source.addEventListener('abort', abort, { once: true });
  return () => source.removeEventListener('abort', abort);
}

async function probeEndpoint(
  definition: { label: string; path: string; required: boolean },
  input: ImageBrowserBoundaryProbeInput,
  analysis: ReturnType<typeof analyzeImageBrowserTarget>,
  fetchImpl: typeof fetch,
  now: () => Date
): Promise<ImageBrowserEndpointProbeResult> {
  const url = joinImageBrowserUrl(analysis.baseUrl, definition.path);
  const startedMs = now().getTime();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const unlink = linkAbortSignal(input.signal, controller);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Timed out', 'TimeoutError'));
  }, timeoutMs);

  try {
    const requestInit: ImageBoundaryFetchInit = {
      method: 'GET',
      headers: createImageBrowserAuthHeaders(input.auth),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    };
    if (analysis.localNetworkAccessExpected) requestInit.targetAddressSpace = 'local';
    const response = await fetchImpl(url, requestInit);
    const sample = await readCappedBody(response);
    const durationMs = Math.max(0, now().getTime() - startedMs);
    const status = response.ok ? 'passed' : 'http-failed';
    return {
      label: definition.label,
      path: definition.path,
      required: definition.required,
      url,
      status,
      httpStatus: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      bytesRead: sample.bytesRead,
      truncated: sample.truncated,
      durationMs,
      safeSummary: response.ok
        ? `浏览器成功读取 HTTP ${response.status} 响应。`
        : `目标服务返回 HTTP ${response.status}。`
    };
  } catch (error) {
    const cancelled = input.signal?.aborted && !timedOut;
    return {
      label: definition.label,
      path: definition.path,
      required: definition.required,
      url,
      status: timedOut ? 'timed-out' : cancelled ? 'cancelled' : 'blocked-or-unreachable',
      bytesRead: 0,
      truncated: false,
      durationMs: Math.max(0, now().getTime() - startedMs),
      safeSummary: timedOut
        ? `等待 ${timeoutMs}ms 后超时。`
        : cancelled
          ? '玩家已取消诊断。'
          : `浏览器未能读取响应：${sanitizeImageBrowserBoundaryMessage(error)}`
    };
  } finally {
    clearTimeout(timer);
    unlink();
  }
}

function buildComfyWebSocketUrl(baseUrl: string): string {
  const url = new URL(joinImageBrowserUrl(baseUrl, '/ws'));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('clientId', `image_probe_${crypto.randomUUID()}`);
  return url.toString();
}

async function probeComfyWebSocket(
  baseUrl: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  webSocketFactory: (url: string) => WebSocket,
  now: () => Date
): Promise<ImageBrowserWebSocketProbeResult> {
  const url = buildComfyWebSocketUrl(baseUrl);
  const startedMs = now().getTime();
  if (signal?.aborted) {
    return { url, status: 'cancelled', durationMs: 0, safeSummary: '玩家已取消诊断。' };
  }
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | undefined;
    const finish = (status: ImageBrowserWebSocketProbeResult['status'], safeSummary: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (socket && socket.readyState < 2) socket.close(1000, 'probe-complete');
      resolve({ url, status, durationMs: Math.max(0, now().getTime() - startedMs), safeSummary });
    };
    const cancel = () => finish('cancelled', '玩家已取消诊断。');
    const timer = setTimeout(() => finish('timed-out', `WebSocket 等待 ${timeoutMs}ms 后超时。`), timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      socket = webSocketFactory(url);
      socket.addEventListener('open', () => finish('passed', '浏览器已建立 ComfyUI WebSocket 连接。'), {
        once: true
      });
      socket.addEventListener(
        'error',
        () => finish('blocked-or-unreachable', '浏览器未能建立 ComfyUI WebSocket 连接。'),
        { once: true }
      );
    } catch (error) {
      finish('blocked-or-unreachable', `无法创建 WebSocket：${sanitizeImageBrowserBoundaryMessage(error)}`);
    }
  });
}

export async function runImageBrowserBoundaryProbe(
  input: ImageBrowserBoundaryProbeInput,
  dependencies: ImageBrowserBoundaryProbeDependencies = {}
): Promise<ImageBrowserBoundaryProbeReport> {
  const fetchImpl = dependencies.fetch ?? fetch.bind(globalThis);
  const now = dependencies.now ?? (() => new Date());
  const webSocketFactory = dependencies.webSocketFactory ?? ((url) => new WebSocket(url));
  const startedAt = now().toISOString();
  const pageUrl = input.pageUrl ?? window.location.href;
  const analysis = analyzeImageBrowserTarget(input.baseUrl, pageUrl, input.auth);
  const endpoints: ImageBrowserEndpointProbeResult[] = [];

  for (const endpoint of getImageBrowserBoundaryEndpoints(input.targetKind)) {
    if (input.signal?.aborted) break;
    endpoints.push(await probeEndpoint(endpoint, input, analysis, fetchImpl, now));
  }

  let webSocket: ImageBrowserWebSocketProbeResult | undefined;
  if (input.targetKind === 'comfyui-core' && input.testWebSocket) {
    webSocket =
      input.auth.mode === 'none'
        ? await probeComfyWebSocket(
            analysis.baseUrl,
            input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            input.signal,
            webSocketFactory,
            now
          )
        : {
            url: buildComfyWebSocketUrl(analysis.baseUrl),
            status: 'not-run',
            durationMs: 0,
            safeSummary: '浏览器 WebSocket 构造函数不能附加 Basic/Bearer 请求头，本轮不作虚假验证。'
          };
  }

  const requiredEndpoints = endpoints.filter((result) => result.required);
  const allPassed =
    requiredEndpoints.length > 0 && requiredEndpoints.every((result) => result.status === 'passed');
  const socketPassed = !webSocket || webSocket.status === 'passed';
  return {
    targetKind: input.targetKind,
    startedAt,
    completedAt: now().toISOString(),
    analysis,
    endpoints,
    webSocket,
    safeSummary:
      allPassed && socketPassed
        ? '浏览器边界诊断通过；这只证明连接能力，不代表实际生图已经通过。'
        : '浏览器边界仍有未通过项目；不能据此宣称对应生图供应商可用。'
  };
}
