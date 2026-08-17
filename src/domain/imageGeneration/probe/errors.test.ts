import { describe, expect, it } from 'vitest';
import { sanitizeImageProbeIdentifier, sanitizeImageProbeText, toSafeImageProbeMessage } from './errors';

describe('image probe error sanitization', () => {
  it('removes authentication headers, query secrets, API keys, JWTs, and binary payloads', () => {
    const longBinary = 'A'.repeat(160);
    const fakeApiKey = ['sk', 'test-not-a-real-key-000000000000'].join('-');
    const message = [
      'Authorization: Bearer top-secret-token-value',
      'x-api-key="private-key-value"',
      'https://example.test/image?token=signed-token&signature=signed-value',
      fakeApiKey,
      'eyJabcdefghijk.abcdefghijkl.abcdefghijkl',
      longBinary
    ].join(' ');

    const sanitized = sanitizeImageProbeText(message);

    expect(sanitized).not.toContain('top-secret-token-value');
    expect(sanitized).not.toContain('private-key-value');
    expect(sanitized).not.toContain('signed-token');
    expect(sanitized).not.toContain('signed-value');
    expect(sanitized).not.toContain(fakeApiKey);
    expect(sanitized).not.toContain('eyJabcdefghijk');
    expect(sanitized).not.toContain(longBinary);
    expect(sanitized).toContain('[REDACTED');
  });

  it('does not serialize unknown objects or stacks into the safe message', () => {
    expect(toSafeImageProbeMessage({ apiKey: 'should-not-be-stringified' })).toBe(
      '图片探针失败，未取得可安全展示的错误信息。'
    );
  });

  it('bounds displayed error length', () => {
    expect(sanitizeImageProbeText('provider failure '.repeat(500))).toHaveLength(1200);
  });

  it('sanitizes and bounds provider request identifiers before persistence', () => {
    expect(sanitizeImageProbeIdentifier('')).toBeUndefined();
    expect(sanitizeImageProbeIdentifier('request-42')).toBe('request-42');
    const sanitizedQueryId = sanitizeImageProbeIdentifier('task?token=private-value&sig=secret-value');
    expect(sanitizedQueryId).toContain('[REDACTED]');
    expect(sanitizedQueryId).not.toContain('private-value');
    expect(sanitizedQueryId).not.toContain('secret-value');
    expect(sanitizeImageProbeIdentifier('request-'.repeat(50))).toHaveLength(200);
  });
});
