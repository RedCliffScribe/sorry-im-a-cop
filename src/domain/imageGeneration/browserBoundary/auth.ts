import type { ImageBrowserBoundaryAuth } from './types';

function encodeBasicCredential(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function createImageBrowserAuthHeaders(auth: ImageBrowserBoundaryAuth): Headers {
  const headers = new Headers({ Accept: 'application/json, text/plain, text/html;q=0.8, */*;q=0.5' });
  if (auth.mode === 'basic') {
    headers.set('Authorization', `Basic ${encodeBasicCredential(`${auth.username}:${auth.password}`)}`);
  } else if (auth.mode === 'bearer') {
    headers.set('Authorization', `Bearer ${auth.token}`);
  }
  return headers;
}

export function sanitizeImageBrowserBoundaryMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value);
  return raw
    .replace(/(authorization\s*[:=]\s*)(?:basic|bearer)\s+[^\s,;]+/gi, '$1[redacted]')
    .replace(/(token|api[-_ ]?key|password|secret)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[redacted]')
    .replace(/\/\/([^/@\s]+)@/g, '//[redacted]@')
    .slice(0, 300);
}
