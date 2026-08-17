import { describe, expect, it } from 'vitest';
import {
  analyzeImageBrowserTarget,
  classifyImageBrowserAddressSpace,
  joinImageBrowserUrl,
  normalizeImageBrowserBaseUrl
} from './targetAnalysis';

describe('image browser boundary target analysis', () => {
  it('classifies loopback, private-network and public hosts', () => {
    expect(classifyImageBrowserAddressSpace('127.0.0.1')).toBe('loopback');
    expect(classifyImageBrowserAddressSpace('localhost')).toBe('loopback');
    expect(classifyImageBrowserAddressSpace('192.168.1.8')).toBe('local');
    expect(classifyImageBrowserAddressSpace('studio.local')).toBe('local');
    expect(classifyImageBrowserAddressSpace('images.example.com')).toBe('public');
  });

  it('normalizes a base URL and preserves an intentional path prefix', () => {
    expect(normalizeImageBrowserBaseUrl(' https://example.com/comfy/ ')).toBe('https://example.com/comfy');
    expect(joinImageBrowserUrl('https://example.com/comfy', '/system_stats')).toBe(
      'https://example.com/comfy/system_stats'
    );
  });

  it('rejects unsupported schemes and embedded credentials', () => {
    expect(() => normalizeImageBrowserBaseUrl('file:///tmp/comfy')).toThrow('http://');
    expect(() => normalizeImageBrowserBaseUrl('http://admin:secret@127.0.0.1:8188')).toThrow('用户名或密码');
  });

  it('advises about CORS, authorization preflight and local-network access', () => {
    const analysis = analyzeImageBrowserTarget(
      'http://127.0.0.1:8188',
      'https://game.pages.dev/play',
      { mode: 'bearer', token: 'not-persisted' }
    );

    expect(analysis.crossOrigin).toBe(true);
    expect(analysis.localNetworkAccessExpected).toBe(true);
    expect(analysis.warnings.join(' ')).toContain('CORS');
    expect(analysis.warnings.join(' ')).toContain('预检');
    expect(analysis.warnings.join(' ')).toContain('本地网络访问');
  });

  it('does not predict a local-network prompt for a same-origin target', () => {
    const analysis = analyzeImageBrowserTarget(
      'http://127.0.0.1:8188',
      'http://127.0.0.1:8188/page',
      { mode: 'none' }
    );
    expect(analysis.crossOrigin).toBe(false);
    expect(analysis.localNetworkAccessExpected).toBe(false);
  });
});
