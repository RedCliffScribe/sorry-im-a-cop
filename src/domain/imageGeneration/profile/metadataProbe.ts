import { sanitizeImageProbeText, toSafeImageProbeMessage } from '../probe';
import { validateImageProfileLocally } from './localValidation';
import type { ImageApiCredential, ImageApiProfile, ImageProfileProbeResult } from './types';

export interface ImageMetadataProbeOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  createId?: () => string;
  signal?: AbortSignal;
  pageUrl?: string;
}

interface MetadataEndpoint {
  path: string;
  label: string;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function authorizationHeaders(profile: ImageApiProfile, credential?: ImageApiCredential): Headers {
  const headers = new Headers({ Accept: 'application/json' });
  if (!credential) return headers;
  if (credential.material.kind === 'basic-auth') {
    const bytes = new TextEncoder().encode(`${credential.material.username}:${credential.material.password}`);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    headers.set('Authorization', `Basic ${btoa(binary)}`);
    return headers;
  }
  const secret = credential.material.kind === 'bearer-token' ? credential.material.token : credential.material.apiKey;
  if (profile.providerType === 'gemini-image') headers.set('x-goog-api-key', secret);
  else if (profile.providerType === 'comfyui-workflow' && profile.config.authMode === 'comfy-cloud-api-key') {
    headers.set('X-API-Key', secret);
  } else headers.set('Authorization', `Bearer ${secret}`);
  return headers;
}

function metadataEndpoints(profile: ImageApiProfile): MetadataEndpoint[] | null {
  switch (profile.providerType) {
    case 'openai-images':
      return profile.config.modelDiscovery === 'disabled' ? null : [{ path: '/models', label: '模型目录' }];
    case 'xai-images':
      return [{ path: '/image-generation-models', label: '图片模型目录' }];
    case 'gemini-image':
      return [{ path: '/models', label: '模型目录' }];
    case 'alibaba-model-studio':
    case 'novelai-image':
      return null;
    case 'comfyui-workflow':
      return profile.config.deployment === 'comfy-cloud'
        ? [{ path: '/api/user', label: 'Cloud 用户' }, { path: '/api/object_info', label: '节点目录' }]
        : [
            { path: '/system_stats', label: '系统状态' },
            { path: '/object_info', label: '节点目录' },
            { path: '/features', label: '功能目录' }
          ];
    case 'sd-webui':
      return [
        { path: '/docs', label: 'API 文档' },
        { path: '/sdapi/v1/options', label: '实例选项' },
        { path: '/sdapi/v1/sd-models', label: '模型目录' },
        { path: '/sdapi/v1/samplers', label: '采样器目录' }
      ];
  }
}

export async function runImageMetadataProbe(
  profile: ImageApiProfile,
  credential: ImageApiCredential | undefined,
  options: ImageMetadataProbeOptions = {}
): Promise<ImageProfileProbeResult> {
  const now = options.now ?? (() => new Date());
  const started = now();
  const local = await validateImageProfileLocally(profile, credential, options.pageUrl);
  const base = {
    probeId: options.createId?.() ?? crypto.randomUUID(),
    profileId: profile.profileId,
    kind: 'metadata-probe' as const,
    connectionFingerprint: local.connectionFingerprint,
    startedAt: started.toISOString()
  };
  if (!local.ok) {
    return {
      ...base,
      status: 'failed',
      completedAt: now().toISOString(),
      safeMessage: sanitizeImageProbeText(local.issues.join('；'))
    };
  }

  const endpoints = metadataEndpoints(profile);
  if (!endpoints) {
    return {
      ...base,
      status: 'unsupported',
      completedAt: now().toISOString(),
      safeMessage: '当前后端没有可靠、低成本且不生图的元数据探针；这不代表连接失败。'
    };
  }

  const fetchImpl = options.fetch ?? fetch.bind(globalThis);
  const headers = authorizationHeaders(profile, credential);
  try {
    const checks = await Promise.all(endpoints.map(async (endpoint) => {
      const response = await fetchImpl(joinUrl(profile.apiBaseUrl, endpoint.path), {
        method: 'GET',
        headers,
        credentials: 'omit',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        signal: options.signal
      });
      return { label: endpoint.label, ok: response.ok, status: response.status };
    }));
    const passed = checks.filter((check) => check.ok);
    const failed = checks.filter((check) => !check.ok);
    const completed = now();
    const summary = [
      passed.length ? `通过：${passed.map((check) => check.label).join('、')}` : '',
      failed.length ? `未通过：${failed.map((check) => `${check.label}（HTTP ${check.status}）`).join('、')}` : ''
    ].filter(Boolean).join('；');
    return {
      ...base,
      status: passed.length === checks.length ? 'passed' : passed.length > 0 ? 'warning' : 'failed',
      completedAt: completed.toISOString(),
      latencyMs: Math.max(0, completed.getTime() - started.getTime()),
      safeMessage: sanitizeImageProbeText(`${summary}。元数据结果不能证明图片生成可用。`)
    };
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      completedAt: now().toISOString(),
      safeMessage: toSafeImageProbeMessage(error)
    };
  }
}
