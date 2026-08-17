export type ImageBrowserBoundaryTargetKind = 'comfyui-core' | 'sd-webui';

export type ImageBrowserBoundaryAuth =
  | { mode: 'none' }
  | { mode: 'basic'; username: string; password: string }
  | { mode: 'bearer'; token: string };

export type ImageBrowserAddressSpace = 'loopback' | 'local' | 'public' | 'unknown';

export interface ImageBrowserTargetAnalysis {
  baseUrl: string;
  targetAddressSpace: ImageBrowserAddressSpace;
  pageAddressSpace: ImageBrowserAddressSpace;
  crossOrigin: boolean;
  securePage: boolean;
  insecureTarget: boolean;
  localNetworkAccessExpected: boolean;
  warnings: string[];
}

export type ImageBrowserBoundaryStatus =
  | 'passed'
  | 'http-failed'
  | 'blocked-or-unreachable'
  | 'timed-out'
  | 'cancelled'
  | 'not-run';

export interface ImageBrowserEndpointProbeResult {
  label: string;
  path: string;
  required: boolean;
  url: string;
  status: ImageBrowserBoundaryStatus;
  httpStatus?: number;
  contentType?: string;
  bytesRead: number;
  truncated: boolean;
  durationMs: number;
  safeSummary: string;
}

export interface ImageBrowserWebSocketProbeResult {
  url: string;
  status: ImageBrowserBoundaryStatus;
  durationMs: number;
  safeSummary: string;
}

export interface ImageBrowserBoundaryProbeInput {
  targetKind: ImageBrowserBoundaryTargetKind;
  baseUrl: string;
  auth: ImageBrowserBoundaryAuth;
  testWebSocket: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  pageUrl?: string;
}

export interface ImageBrowserBoundaryProbeReport {
  targetKind: ImageBrowserBoundaryTargetKind;
  startedAt: string;
  completedAt: string;
  analysis: ImageBrowserTargetAnalysis;
  endpoints: ImageBrowserEndpointProbeResult[];
  webSocket?: ImageBrowserWebSocketProbeResult;
  safeSummary: string;
}

export interface ImageBrowserEndpointDefinition {
  label: string;
  path: string;
  required: boolean;
}
