import { describe, expect, it } from 'vitest';
import { resolveDeviceClass, resolveReferrerHost } from './operationalAnalytics';

describe('operationalAnalytics', () => {
  it('uses stable coarse device classes', () => {
    expect(resolveDeviceClass(390)).toBe('mobile');
    expect(resolveDeviceClass(800)).toBe('tablet');
    expect(resolveDeviceClass(1440)).toBe('desktop');
  });

  it('keeps only the source host and never the source path', () => {
    expect(resolveReferrerHost('', 'game.example')).toBe('direct');
    expect(resolveReferrerHost('https://game.example/private/path', 'game.example')).toBe('internal');
    expect(resolveReferrerHost('https://search.example/query?q=secret', 'game.example')).toBe('search.example');
    expect(resolveReferrerHost('not a url', 'game.example')).toBe('unknown');
  });
});
