import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json';
import {
  calculateImageGenerationPresetPackageSha256V1,
  canonicalizeImageGenerationPresetPackageV1,
  parseImageGenerationPresetPackageJsonV1
} from './workshopPackageContract';
import { WorkshopApiClient, type WorkshopPublicItem } from './WorkshopApiClient';

function publicItem(overrides: Partial<WorkshopPublicItem> = {}): WorkshopPublicItem {
  return {
    itemId: 'item_public_1',
    kind: 'image-generation-preset',
    slug: 'test-preset',
    title: '测试预设',
    summary: '公开测试预设。',
    language: 'zh-CN',
    contentRating: 'general',
    tags: ['测试'],
    author: { authorId: 'author_1', displayName: '测试作者', avatarRef: null },
    downloadCount: 36,
    latestRevision: {
      revisionId: 'revision_1',
      revisionNumber: 1,
      schemaVersion: 1,
      packageSha256: 'a'.repeat(64),
      byteSize: 100,
      compatibility: {
        providerTypes: ['openai-images'],
        purposes: ['avatar-close-up'],
        modelHints: ['gpt-image'],
        requiredFeatures: [],
        minAppVersion: '1.7.49'
      },
      changelog: '首个修订。',
      createdAt: '2026-08-02T00:00:00.000Z'
    },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T01:00:00.000Z',
    ...overrides
  };
}

describe('WorkshopApiClient', () => {
  it('hides mature content by default and strictly parses the public list response', async () => {
    const item = publicItem();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      ok: true,
      items: [item],
      nextCursor: null
    }), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'request_1' } }));
    const client = new WorkshopApiClient(fetcher as typeof fetch);

    await expect(client.listItems()).resolves.toMatchObject({ items: [item], nextCursor: null });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('rating=general'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('surfaces stable server errors without treating service failure as an empty list', async () => {
    const client = new WorkshopApiClient((async () => new Response(JSON.stringify({
      ok: false,
      code: 'workshop_temporarily_unavailable',
      message: '创意工坊暂时不可用，请稍后重试。',
      requestId: 'request_failed'
    }), { status: 503, headers: { 'content-type': 'application/json' } })) as typeof fetch);

    await expect(client.listItems()).rejects.toMatchObject({
      code: 'workshop_temporarily_unavailable',
      requestId: 'request_failed',
      status: 503
    });
  });

  it('uses the protected administrator API and confirms the exact moderation target', async () => {
    document.cookie = 'sicv2_workshop_csrf=csrf-admin-token; Path=/';
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/admin/workshop/items')) {
        return new Response(JSON.stringify({ ok: true, items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      expect(url).toContain('/api/admin/workshop/items/item_1/disable');
      expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
      expect(new Headers(init?.headers).get('x-workshop-csrf')).toBe('csrf-admin-token');
      expect(JSON.parse(String(init?.body))).toEqual({
        reason: '违反工坊公开规则。',
        confirmation: 'item_1'
      });
      return new Response(JSON.stringify({
        ok: true,
        actionId: 'admin_action_1',
        targetType: 'item',
        targetId: 'item_1',
        status: 'disabled'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const client = new WorkshopApiClient(fetcher as typeof fetch);

    await expect(client.listAdminItems()).resolves.toEqual([]);
    await expect(client.disableAdminItem('item_1', '违反工坊公开规则。')).resolves.toBeUndefined();
  });

  it('revalidates the downloaded contract and SHA before returning an importable package', async () => {
    const fixtureText = JSON.stringify(fixture);
    const parsed = parseImageGenerationPresetPackageJsonV1(fixtureText);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const canonicalJson = canonicalizeImageGenerationPresetPackageV1(parsed.data);
    const packageSha256 = await calculateImageGenerationPresetPackageSha256V1(parsed.data);
    const item = publicItem({
      latestRevision: {
        ...publicItem().latestRevision,
        packageSha256,
        byteSize: new TextEncoder().encode(canonicalJson).byteLength
      }
    });
    const client = new WorkshopApiClient((async () => new Response(canonicalJson, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-workshop-package-sha256': packageSha256
      }
    })) as typeof fetch);

    await expect(client.downloadItem(item)).resolves.toMatchObject({
      loadedPackage: { packageSha256 },
      sourceMetadata: {
        itemId: item.itemId,
        revisionId: item.latestRevision.revisionId,
        authorDisplayName: item.author.displayName
      }
    });
  });

  it('reads the private session with cookies without exposing any credential field', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      authenticated: true,
      user: { userId: 'user_1', displayName: '测试玩家', avatarRef: null, role: 'member' }
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new WorkshopApiClient(fetcher as typeof fetch);

    await expect(client.getSession()).resolves.toMatchObject({
      authenticated: true,
      user: { userId: 'user_1', displayName: '测试玩家' }
    });
    expect(fetcher).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ credentials: 'include' }));
  });

  it('requires an explicit idempotency key when publishing a package', async () => {
    const fixtureText = JSON.stringify(fixture);
    const parsed = parseImageGenerationPresetPackageJsonV1(fixtureText);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const packageSha256 = await calculateImageGenerationPresetPackageSha256V1(parsed.data);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      ok: true,
      itemId: 'item_1',
      revisionId: 'revision_1',
      revisionNumber: 1,
      status: 'published',
      packageSha256
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const client = new WorkshopApiClient(fetcher as typeof fetch);

    await client.createItem({
      workshopPackage: parsed.data,
      packageSha256,
      byteLength: new TextEncoder().encode(fixtureText).byteLength
    }, {
      changelog: '首个修订。',
      rightsConfirmed: true,
      turnstileToken: 'turnstile-token',
      idempotencyKey: 'client-upload-key-0001'
    });

    expect(fetcher).toHaveBeenCalledWith('/api/workshop/items', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({})
    }));
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('idempotency-key')).toBe('client-upload-key-0001');
  });
});
