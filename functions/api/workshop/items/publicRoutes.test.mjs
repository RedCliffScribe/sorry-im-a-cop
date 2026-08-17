import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateImageGenerationPresetPackageSha256V1,
  canonicalizeImageGenerationPresetPackageV1,
  parseImageGenerationPresetPackageJsonV1
} from '../../../_shared/workshop/packageContract.js';
import { onRequestGet as listItems } from './index.js';
import { onRequestGet as getItem } from './[itemId].js';
import { onRequestGet as downloadItem } from './[itemId]/download.js';

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    this.database.statements.push(this);
    return this;
  }

  async all() {
    return { results: this.database.allRows };
  }

  async first() {
    return this.database.firstRows.shift() ?? null;
  }

  async run() {
    this.database.runStatements.push(this);
    return { success: true };
  }
}

class FakeDatabase {
  constructor({ allRows = [], firstRows = [] } = {}) {
    this.allRows = allRows;
    this.firstRows = [...firstRows];
    this.statements = [];
    this.runStatements = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

class FakeBucket {
  constructor(value) {
    this.value = value;
    this.keys = [];
  }

  async get(key) {
    this.keys.push(key);
    if (this.value === null) return null;
    const bytes = typeof this.value === 'string' ? new TextEncoder().encode(this.value) : this.value;
    return {
      body: new ReadableStream(),
      async arrayBuffer() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      }
    };
  }
}

function itemRow(overrides = {}) {
  return {
    item_id: 'item_public_1',
    kind: 'image-generation-preset',
    slug: 'hong-kong-cg',
    title: '香港人物 CG 预设',
    summary: '适用于人物近景的预设。',
    language: 'zh-CN',
    content_rating: 'general',
    tags_json: JSON.stringify(['人物', '香港']),
    item_created_at: '2026-08-02T00:00:00.000Z',
    item_updated_at: '2026-08-02T01:00:00.000Z',
    author_id: 'user_public_1',
    author_display_name: '测试作者',
    author_avatar_ref: null,
    download_count: 27,
    revision_id: 'revision_public_1',
    revision_number: 1,
    schema_version: 1,
    package_sha256: 'a'.repeat(64),
    byte_size: 100,
    compatibility_json: JSON.stringify({
      providerTypes: ['openai-images'],
      purposes: ['avatar-close-up'],
      modelHints: ['gpt-image'],
      requiredFeatures: [],
      minAppVersion: '1.7.49'
    }),
    changelog: '首个公开修订。',
    revision_created_at: '2026-08-02T00:00:00.000Z',
    ...overrides
  };
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('public workshop Pages Functions', () => {
  it('lists only the requested public rating with bound filters and an opaque cursor', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => itemRow({
      item_id: `item_public_${index + 1}`,
      revision_id: `revision_public_${index + 1}`
    }));
    const database = new FakeDatabase({ allRows: rows });
    const response = await listItems({
      request: new Request(
        'https://game.example/api/workshop/items?provider=openai-images&purpose=avatar-close-up&q=CG&limit=2'
      ),
      env: { WORKSHOP_DB: database }
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toMatchObject({
      author: { displayName: '测试作者' },
      downloadCount: 27
    });
    expect(payload.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(database.statements[0].bindings).toEqual([
      'image-generation-preset',
      'general',
      'openai-images',
      'avatar-close-up',
      '%CG%',
      3
    ]);
    expect(database.statements[0].sql).toContain("i.status = 'published'");
    expect(database.statements[0].sql).toContain("json_each(r.compatibility_json, '$.providerTypes')");
    expect(response.headers.get('cache-control')).toContain('s-maxage=300');
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);

    const revalidated = await listItems({
      request: new Request(
        'https://game.example/api/workshop/items?provider=openai-images&purpose=avatar-close-up&q=CG&limit=2',
        { headers: { 'if-none-match': response.headers.get('etag') } }
      ),
      env: { WORKSHOP_DB: database }
    });
    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe('');
  });

  it('returns a recoverable error instead of pretending an unbound database is empty', async () => {
    const response = await listItems({
      request: new Request('https://game.example/api/workshop/items'),
      env: {}
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'workshop_not_configured'
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not expose an unpublished or disabled item through detail lookup', async () => {
    const response = await getItem({
      request: new Request('https://game.example/api/workshop/items/item_disabled'),
      env: { WORKSHOP_DB: new FakeDatabase({ firstRows: [null] }) },
      params: { itemId: 'item_disabled' }
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'not_found' });
  });

  it('downloads, revalidates and atomically records a successful download', async () => {
    const fixtureText = await readFile(resolve(
      process.cwd(),
      'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
    ), 'utf8');
    const parsed = parseImageGenerationPresetPackageJsonV1(fixtureText);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const canonicalJson = canonicalizeImageGenerationPresetPackageV1(parsed.data);
    const sha256 = await calculateImageGenerationPresetPackageSha256V1(parsed.data);
    const row = {
      item_id: 'item_public_1',
      title: '测试预设',
      revision_id: 'revision_public_1',
      revision_number: 1,
      schema_version: 1,
      package_sha256: sha256,
      byte_size: new TextEncoder().encode(canonicalJson).byteLength,
      r2_key: `packages/image-generation-preset/item_public_1/1/${sha256}.json`
    };
    const bucket = new FakeBucket(canonicalJson);
    const database = new FakeDatabase({ firstRows: [row] });
    const response = await downloadItem({
      request: new Request(
        'https://game.example/api/workshop/items/item_public_1/download?revision=revision_public_1'
      ),
      env: {
        WORKSHOP_DB: database,
        WORKSHOP_PACKAGES: bucket
      },
      params: { itemId: 'item_public_1' }
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(canonicalJson);
    expect(response.headers.get('etag')).toBe(`"${sha256}"`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-workshop-package-sha256')).toBe(sha256);
    expect(bucket.keys).toEqual([row.r2_key]);
    expect(database.runStatements).toHaveLength(1);
    expect(database.runStatements[0].sql).toContain('download_count = download_count + 1');
    expect(database.runStatements[0].bindings).toEqual([row.item_id]);
  });

  it('blocks a corrupted R2 object instead of returning unverified bytes', async () => {
    const corrupt = '{"format":"wrong"}';
    const row = {
      item_id: 'item_public_1',
      title: '测试预设',
      revision_id: 'revision_public_1',
      revision_number: 1,
      schema_version: 1,
      package_sha256: 'a'.repeat(64),
      byte_size: new TextEncoder().encode(corrupt).byteLength,
      r2_key: 'packages/bad.json'
    };
    const database = new FakeDatabase({ firstRows: [row] });
    const response = await downloadItem({
      request: new Request('https://game.example/api/workshop/items/item_public_1/download'),
      env: {
        WORKSHOP_DB: database,
        WORKSHOP_PACKAGES: new FakeBucket(corrupt)
      },
      params: { itemId: 'item_public_1' }
    });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'workshop_package_integrity_failed' });
    expect(database.runStatements).toHaveLength(0);
  });
});
