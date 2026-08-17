import { describe, expect, it, vi } from 'vitest';
import { runImageBrowserBoundaryProbe } from './browserBoundaryProbe';

function jsonResponse(body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('runImageBrowserBoundaryProbe', () => {
  it('probes SD WebUI metadata endpoints without cookies or persisted response bodies', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse());
    const report = await runImageBrowserBoundaryProbe(
      {
        targetKind: 'sd-webui',
        baseUrl: 'http://127.0.0.1:7860',
        auth: { mode: 'bearer', token: 'runtime-only-token' },
        testWebSocket: false,
        pageUrl: 'https://game.pages.dev'
      },
      { fetch: fetchMock as typeof fetch }
    );

    expect(report.endpoints).toHaveLength(4);
    expect(report.endpoints.every((result) => result.status === 'passed')).toBe(true);
    expect(report.safeSummary).toContain('连接能力');
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit & { targetAddressSpace?: string };
    expect(requestInit.credentials).toBe('omit');
    expect(requestInit.mode).toBe('cors');
    expect(requestInit.targetAddressSpace).toBe('local');
    expect((requestInit.headers as Headers).get('Authorization')).toBe('Bearer runtime-only-token');
    expect(JSON.stringify(report)).not.toContain('runtime-only-token');
    expect(JSON.stringify(report)).not.toContain('{"ok":true}');
  });

  it('caps response reads and reports truncation', async () => {
    const largeBody = new Uint8Array(70 * 1024);
    const report = await runImageBrowserBoundaryProbe(
      {
        targetKind: 'comfyui-core',
        baseUrl: 'http://127.0.0.1:8188',
        auth: { mode: 'none' },
        testWebSocket: false,
        pageUrl: 'http://127.0.0.1:3001'
      },
      { fetch: (async () => new Response(largeBody)) as typeof fetch }
    );

    expect(report.endpoints[0].bytesRead).toBe(64 * 1024);
    expect(report.endpoints[0].truncated).toBe(true);
  });

  it('allows optional discovery endpoints to fail without rejecting the core boundary verdict', async () => {
    const fetchMock = vi
      .fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse())
      .mockResolvedValueOnce(jsonResponse())
      .mockResolvedValueOnce(jsonResponse())
      .mockResolvedValueOnce(new Response('missing', { status: 404 }));
    const report = await runImageBrowserBoundaryProbe(
      {
        targetKind: 'comfyui-core',
        baseUrl: 'http://127.0.0.1:8188',
        auth: { mode: 'none' },
        testWebSocket: false,
        pageUrl: 'http://127.0.0.1:3001'
      },
      { fetch: fetchMock as typeof fetch }
    );

    expect(report.endpoints[2]).toMatchObject({ path: '/features', required: false, status: 'http-failed' });
    expect(report.safeSummary).toContain('连接能力');
  });

  it('distinguishes HTTP failure from a browser-blocked or unreachable request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('no', { status: 503 }))
      .mockRejectedValue(new TypeError('Failed to fetch'));
    const report = await runImageBrowserBoundaryProbe(
      {
        targetKind: 'comfyui-core',
        baseUrl: 'http://127.0.0.1:8188',
        auth: { mode: 'none' },
        testWebSocket: false,
        pageUrl: 'http://127.0.0.1:3001'
      },
      { fetch: fetchMock as typeof fetch }
    );

    expect(report.endpoints.map((result) => result.status)).toEqual([
      'http-failed',
      'blocked-or-unreachable',
      'blocked-or-unreachable'
    ]);
    expect(report.endpoints[0].httpStatus).toBe(503);
  });

  it('classifies per-endpoint timeouts separately from CORS or reachability failures', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Timed out', 'TimeoutError')),
          { once: true }
        );
      })
    );
    const report = await runImageBrowserBoundaryProbe(
      {
        targetKind: 'comfyui-core',
        baseUrl: 'http://127.0.0.1:8188',
        auth: { mode: 'none' },
        testWebSocket: false,
        timeoutMs: 2,
        pageUrl: 'http://127.0.0.1:3001'
      },
      { fetch: fetchMock as typeof fetch }
    );

    expect(report.endpoints).toHaveLength(3);
    expect(report.endpoints.every((result) => result.status === 'timed-out')).toBe(true);
  });

  it('classifies an abort fired by the caller as cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true
        });
        controller.abort();
      })
    );
    const report = await runImageBrowserBoundaryProbe(
      {
        targetKind: 'comfyui-core',
        baseUrl: 'http://127.0.0.1:8188',
        auth: { mode: 'none' },
        testWebSocket: false,
        signal: controller.signal,
        pageUrl: 'http://127.0.0.1:3001'
      },
      { fetch: fetchMock as typeof fetch }
    );

    expect(report.endpoints[0].status).toBe('cancelled');
    expect(report.endpoints).toHaveLength(1);
  });

  it('passes a real browser-style ComfyUI WebSocket open event', async () => {
    let openedUrl = '';
    const webSocketFactory = (url: string) => {
      openedUrl = url;
      return {
        readyState: 0,
        addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
          if (type === 'open') {
            queueMicrotask(() => {
              if (typeof listener === 'function') listener(new Event('open'));
              else listener.handleEvent(new Event('open'));
            });
          }
        },
        removeEventListener() {},
        close() {}
      } as unknown as WebSocket;
    };
    const report = await runImageBrowserBoundaryProbe(
      {
        targetKind: 'comfyui-core',
        baseUrl: 'http://127.0.0.1:8188',
        auth: { mode: 'none' },
        testWebSocket: true,
        pageUrl: 'http://127.0.0.1:3001'
      },
      { fetch: (async () => jsonResponse()) as typeof fetch, webSocketFactory }
    );

    expect(report.webSocket?.status).toBe('passed');
    expect(openedUrl).toMatch(/^ws:\/\/127\.0\.0\.1:8188\/ws\?clientId=image_probe_/);
  });

  it('does not claim that an authenticated WebSocket was tested', async () => {
    const report = await runImageBrowserBoundaryProbe(
      {
        targetKind: 'comfyui-core',
        baseUrl: 'http://127.0.0.1:8188',
        auth: { mode: 'basic', username: 'tester', password: 'runtime-only-password' },
        testWebSocket: true,
        pageUrl: 'http://127.0.0.1:3001'
      },
      { fetch: (async () => jsonResponse()) as typeof fetch }
    );

    expect(report.webSocket?.status).toBe('not-run');
    expect(JSON.stringify(report)).not.toContain('runtime-only-password');
  });
});
