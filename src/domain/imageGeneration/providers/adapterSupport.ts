import type { ImageProbeGenerationInput, ImageProfileValidationIssue, ImageProfileValidationResult } from '../probe';
import type { ComfyUiProbeProfile, ProxyCredential, SdWebUiProbeProfile } from './providerSchemas';

export type NaturalLanguageNegativePromptStyle =
  | 'generic-avoid'
  | 'openai-gpt-image'
  | 'gemini-image';

export function combineImagePrompts(
  prompt: string,
  negativePrompt?: string,
  style: NaturalLanguageNegativePromptStyle = 'generic-avoid'
): string {
  const negative = negativePrompt?.trim();
  if (!negative) return prompt.trim();
  if (style === 'openai-gpt-image') {
    return `${prompt.trim()}\n\nConstraints:\nDo not include or contradict any of the following: ${negative}`;
  }
  if (style === 'gemini-image') {
    return `${prompt.trim()}\n\nAvoid the following visual elements or contradictions: ${negative}`;
  }
  return `${prompt.trim()}\nAvoid: ${negative}`;
}

export function proxyAuthorizationHeaders(credential: ProxyCredential): Record<string, string> {
  if (credential.mode === 'bearer') return { Authorization: `Bearer ${credential.token}` };
  if (credential.mode === 'basic') {
    const bytes = new TextEncoder().encode(`${credential.username}:${credential.password}`);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return { Authorization: `Basic ${btoa(binary)}` };
  }
  if (credential.mode === 'api-key') return { 'X-API-Key': credential.apiKey };
  return {};
}

export function proxyCredentialSecrets(credential: ProxyCredential): string[] {
  if (credential.mode === 'bearer') return [credential.token];
  if (credential.mode === 'basic') return [credential.password];
  if (credential.mode === 'api-key') return [credential.apiKey];
  return [];
}

export function validateProxyMode(
  profile: ComfyUiProbeProfile | SdWebUiProbeProfile,
  credential: ProxyCredential
): ImageProfileValidationIssue[] {
  const expected = profile.authMode === 'none'
    ? 'none'
    : profile.authMode === 'basic-auth'
      ? 'basic'
      : profile.authMode === 'bearer-token'
        ? 'bearer'
        : 'api-key';
  return credential.mode === expected
    ? []
    : [{ path: 'credential.mode', message: `当前档案要求 ${expected} 凭据` }];
}

export function mergeValidationIssues(
  base: ImageProfileValidationResult,
  extra: ImageProfileValidationIssue[]
): ImageProfileValidationResult {
  const issues = [...(base.ok ? [] : base.issues), ...extra];
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function validatePrompt(input: ImageProbeGenerationInput): ImageProfileValidationIssue[] {
  return input.prompt.trim() ? [] : [{ path: 'prompt', message: '提示词不能为空' }];
}
