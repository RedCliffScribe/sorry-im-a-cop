import { zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { createProviderTestContext, imageResponse, TEST_PNG_BYTES } from './providerTestUtils';
import {
  createGeneratedImage,
  createImageProbeNetworkFailureDiagnostic,
  decodeBase64Image,
  downloadTemporaryImage,
  extractZipImages,
  fetchProviderResponse,
  readProviderJson
} from './providerProtocol';

describe('providerProtocol', () => {
  it('normalizes all supported images in a ZIP instead of keeping only the first', () => {
    const archive = zipSync({
      '02.png': TEST_PNG_BYTES,
      '01.png': TEST_PNG_BYTES,
      'notes.txt': new TextEncoder().encode('ignored')
    });

    const images = extractZipImages(archive);

    expect(images).toHaveLength(2);
    expect(images.every((image) => image.mimeType === 'image/png')).toBe(true);
  });

  it('rejects damaged base64, non-images, MIME mismatches, and ZIPs without images', () => {
    expect(() => decodeBase64Image('***')).toThrow('base64');
    expect(() => createGeneratedImage(new TextEncoder().encode('not-image'))).toThrow('非图片');
    expect(() => createGeneratedImage(TEST_PNG_BYTES, 'image/jpeg')).toThrow('MIME');
    expect(() => extractZipImages(zipSync({ 'notes.txt': new TextEncoder().encode('none') }))).toThrow('没有可用图片');
  });

  it('downloads temporary URLs without forwarding provider authorization', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => imageResponse());
    const context = createProviderTestContext(fetchMock);

    await downloadTemporaryImage(context, 'https://temporary.example/image.png');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
  });

  it('classifies a cross-origin JSON request as a likely CORS preflight failure without retaining its URL secrets', () => {
    const diagnostic = createImageProbeNetworkFailureDiagnostic({
      url: 'https://images.example/v1/images/generations?token=must-not-persist',
      init: {
        method: 'POST',
        headers: {
          Authorization: 'Bearer must-not-persist',
          'Content-Type': 'application/json'
        }
      },
      requestRole: 'generation-submit',
      error: new TypeError('Failed to fetch'),
      pageUrl: 'https://simc.pages.dev/settings'
    });

    expect(diagnostic).toMatchObject({
      requestRole: 'generation-submit',
      method: 'POST',
      targetOrigin: 'https://images.example',
      pageOrigin: 'https://simc.pages.dev',
      crossOrigin: true,
      corsPreflightExpected: true,
      responseReached: false,
      browserErrorName: 'TypeError'
    });
    expect(diagnostic.likelyCauses).toContain('cors-preflight-or-response');
    expect(JSON.stringify(diagnostic)).not.toContain('must-not-persist');
  });

  it('distinguishes a generated image download failure from the original generation request', async () => {
    const context = createProviderTestContext(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(downloadTemporaryImage(context, 'https://cdn.example/image.png?signature=secret')).rejects.toMatchObject({
      code: 'provider-network-failed',
      networkFailure: expect.objectContaining({
        requestRole: 'generated-image-download',
        method: 'GET',
        targetOrigin: 'https://cdn.example',
        responseReached: false
      })
    });
  });

  it('preserves protocol error codes while redacting secrets from HTTP errors', async () => {
    const secret = ['sk', 'test-not-a-real-key-000000000000'].join('-');
    const response = new Response(JSON.stringify({ error: { message: `bad key ${secret}` } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });

    await expect(readProviderJson(response, [secret])).rejects.toMatchObject({
      code: 'provider-http-401',
      message: expect.not.stringContaining(secret)
    });
  });

  it('rejects invalid successful JSON and ignores a late response after cancellation', async () => {
    await expect(readProviderJson(new Response('{', { status: 200 }))).rejects.toMatchObject({
      code: 'provider-invalid-json'
    });
    const controller = new AbortController();
    const context = createProviderTestContext(async () => {
      controller.abort();
      return imageResponse();
    }, controller.signal);

    await expect(fetchProviderResponse(context, 'https://provider.example', {})).rejects.toMatchObject({
      name: 'AbortError'
    });
  });
});
