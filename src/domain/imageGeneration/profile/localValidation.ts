import { imageApiCredentialSchema, imageApiProfileSchema } from './schemas';
import { createConnectionFingerprint } from './fingerprints';
import type {
  ImageApiCredential,
  ImageApiCredentialSummary,
  ImageApiProfile,
  ImageProfileProbeResult
} from './types';

export interface ImageProfileLocalValidationResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
  connectionFingerprint: string;
}

function credentialIssue(profile: ImageApiProfile, credential?: ImageApiCredential): string | null {
  const requiresCredential = profile.providerType !== 'comfyui-workflow' && profile.providerType !== 'sd-webui'
    ? true
    : profile.config.authMode !== 'none';
  if (!requiresCredential) {
    return profile.credentialId ? '当前认证方式为无认证，档案不应引用凭据。' : null;
  }
  if (!profile.credentialId) return '当前后端和认证方式必须选择本机凭据。';
  if (!credential || credential.credentialId !== profile.credentialId) return '档案引用的本机凭据不存在。';

  const acceptsLocalProxy =
    (profile.providerType === 'comfyui-workflow' || profile.providerType === 'sd-webui') &&
    (profile.config.authMode === 'basic-auth' || profile.config.authMode === 'bearer-token');
  if (credential.providerAffinity !== profile.providerType && !(acceptsLocalProxy && credential.providerAffinity === 'local-reverse-proxy')) {
    return '凭据的后端归属与当前图片档案不匹配。';
  }

  const expectedKind = (() => {
    if (profile.providerType === 'gemini-image') return 'api-key-header';
    if (profile.providerType === 'comfyui-workflow') {
      if (profile.config.authMode === 'comfy-cloud-api-key') return 'api-key-header';
      if (profile.config.authMode === 'basic-auth') return 'basic-auth';
      return 'bearer-token';
    }
    if (profile.providerType === 'sd-webui') {
      return profile.config.authMode === 'basic-auth' ? 'basic-auth' : 'bearer-token';
    }
    return 'bearer-token';
  })();
  return credential.material.kind === expectedKind ? null : `当前认证方式需要 ${expectedKind} 凭据。`;
}

function browserWarnings(profile: ImageApiProfile, pageUrl?: string): string[] {
  if (!pageUrl) return [];
  try {
    const page = new URL(pageUrl);
    const target = new URL(profile.apiBaseUrl);
    const warnings: string[] = [];
    if (page.protocol === 'https:' && target.protocol === 'http:') {
      warnings.push('HTTPS 页面访问 HTTP 图片服务可能被浏览器混合内容策略阻止。');
    }
    const localTarget = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
    const localPage = ['localhost', '127.0.0.1', '::1'].includes(page.hostname);
    if (localTarget && !localPage) warnings.push('远程页面访问本地服务可能需要 Local Network Access 授权与正确 CORS。');
    return warnings;
  } catch {
    return [];
  }
}

export async function validateImageProfileLocally(
  profileInput: ImageApiProfile,
  credentialInput?: ImageApiCredential,
  pageUrl?: string
): Promise<ImageProfileLocalValidationResult> {
  const profile = imageApiProfileSchema.safeParse(profileInput);
  const credential = credentialInput ? imageApiCredentialSchema.safeParse(credentialInput) : null;
  const summary: ImageApiCredentialSummary | undefined = credential?.success
    ? {
        credentialId: credential.data.credentialId,
        label: credential.data.label,
        providerAffinity: credential.data.providerAffinity,
        materialKind: credential.data.material.kind,
        maskedHint: '已保存',
        revision: credential.data.revision,
        createdAt: credential.data.createdAt,
        updatedAt: credential.data.updatedAt
      }
    : undefined;
  const connectionFingerprint = await createConnectionFingerprint(profileInput, summary);
  if (!profile.success) {
    return {
      ok: false,
      issues: profile.error.issues.map((issue) => `${issue.path.join('.') || '档案'}：${issue.message}`),
      warnings: [],
      connectionFingerprint
    };
  }
  if (credential && !credential.success) {
    return {
      ok: false,
      issues: credential.error.issues.map((issue) => `${issue.path.join('.') || '凭据'}：${issue.message}`),
      warnings: [],
      connectionFingerprint
    };
  }

  const issues: string[] = [];
  const issue = credentialIssue(profile.data, credential?.success ? credential.data : undefined);
  if (issue) issues.push(issue);
  const warnings = browserWarnings(profile.data, pageUrl);
  if (!profile.data.enabled) warnings.push('档案当前未启用；不会创建或提交普通图片任务。');
  if (profile.data.providerType === 'novelai-image' && !profile.data.config.usageNoticeAcceptedAt) {
    warnings.push('尚未确认 NovelAI 使用提示；真实生成测试与普通生成应保持禁用。');
  }
  return { ok: issues.length === 0, issues, warnings, connectionFingerprint };
}

export async function runImageLocalValidationProbe(
  profile: ImageApiProfile,
  credential?: ImageApiCredential,
  options: { pageUrl?: string; now?: () => Date; createId?: () => string } = {}
): Promise<ImageProfileProbeResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const result = await validateImageProfileLocally(profile, credential, options.pageUrl);
  const completedAt = now();
  return {
    probeId: options.createId?.() ?? crypto.randomUUID(),
    profileId: profile.profileId,
    kind: 'local-validation',
    status: result.ok ? (result.warnings.length ? 'warning' : 'passed') : 'failed',
    connectionFingerprint: result.connectionFingerprint,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    safeMessage: result.ok
      ? result.warnings.join('；') || '档案字段、地址与凭据引用形状有效；这不代表连接或生图成功。'
      : result.issues.join('；')
  };
}
