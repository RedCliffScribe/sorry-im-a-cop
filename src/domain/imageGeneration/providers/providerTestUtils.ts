import { vi } from 'vitest';
import type { ImageProbeAdapterContext, ImageProbeFetch, ImageProbeStage } from '../probe';

export const TEST_PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export const TEST_PNG_BASE64 = 'iVBORw0KGgo=';
export const TEST_JPEG_BASE64 = '/9j/';

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function imageResponse(bytes: Uint8Array = TEST_PNG_BYTES): Response {
  return new Response(bytes.slice().buffer, {
    status: 200,
    headers: { 'Content-Type': 'image/png' }
  });
}

export function createProviderTestContext(
  fetchImpl: ImageProbeFetch,
  signal: AbortSignal = new AbortController().signal
): ImageProbeAdapterContext & { stages: ImageProbeStage[]; remoteTaskIds: string[] } {
  const stages: ImageProbeStage[] = [];
  const remoteTaskIds: string[] = [];
  return {
    signal,
    fetch: fetchImpl,
    wait: vi.fn(async () => undefined),
    reportStage: (stage) => stages.push(stage),
    reportRemoteTask: (remoteTaskId) => {
      remoteTaskIds.push(remoteTaskId);
    },
    stages,
    remoteTaskIds
  };
}

export function requestHeaders(call: unknown[]): Headers {
  const init = call[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

export function requestBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}
