import type {
  ImageApiCredentialSummary,
  ImageApiProfile,
  ImageConnectionFingerprintInput,
  ImageExecutionFingerprintInput
} from './types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

async function sha256Canonical(value: unknown): Promise<string> {
  const source = JSON.stringify(canonicalize(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createConnectionFingerprintInput(
  profile: ImageApiProfile,
  credential?: Pick<ImageApiCredentialSummary, 'credentialId' | 'revision'>
): ImageConnectionFingerprintInput {
  return {
    profileId: profile.profileId,
    providerType: profile.providerType,
    apiBaseUrl: profile.apiBaseUrl.replace(/\/+$/, ''),
    credentialId: profile.credentialId,
    credentialRevision: credential?.revision,
    connectionCriticalConfig: profile.config
  };
}

export async function createConnectionFingerprint(
  profile: ImageApiProfile,
  credential?: Pick<ImageApiCredentialSummary, 'credentialId' | 'revision'>
): Promise<string> {
  return sha256Canonical(createConnectionFingerprintInput(profile, credential));
}

export async function createExecutionFingerprint(input: ImageExecutionFingerprintInput): Promise<string> {
  return sha256Canonical(input);
}

export async function createComfyWorkflowHash(input: {
  apiWorkflow: Record<string, unknown>;
  bindings: object;
  exposedParameters?: object[];
  outputNodeIds: string[];
}): Promise<string> {
  return sha256Canonical(input);
}
