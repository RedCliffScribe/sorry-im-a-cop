import { describe, expect, it } from 'vitest';
import { createImageBrowserAuthHeaders, sanitizeImageBrowserBoundaryMessage } from './auth';

describe('image browser boundary auth', () => {
  it('creates only the supported Basic and Bearer authorization forms', () => {
    expect(
      createImageBrowserAuthHeaders({ mode: 'basic', username: 'tester', password: '密码' }).get('Authorization')
    ).toMatch(/^Basic /);
    expect(createImageBrowserAuthHeaders({ mode: 'bearer', token: 'token-value' }).get('Authorization')).toBe(
      'Bearer token-value'
    );
    expect(createImageBrowserAuthHeaders({ mode: 'none' }).has('Authorization')).toBe(false);
  });

  it('redacts credentials from safe diagnostic text', () => {
    const safe = sanitizeImageBrowserBoundaryMessage(
      'Authorization: Bearer token-value password=pass-value https://admin:secret@example.test'
    );
    expect(safe).not.toContain('token-value');
    expect(safe).not.toContain('pass-value');
    expect(safe).not.toContain('admin:secret');
  });
});
