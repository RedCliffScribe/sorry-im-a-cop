import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publishWorkshopFixture } from './fixturePublisher.js';

class FakeStatement {
  constructor(sql) {
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    return this;
  }
}

class FakeDatabase {
  constructor(failure) {
    this.failure = failure;
    this.batches = [];
  }

  prepare(sql) {
    return new FakeStatement(sql);
  }

  async batch(statements) {
    this.batches.push(statements);
    if (this.failure) throw this.failure;
    return statements.map(() => ({ success: true }));
  }
}

class FakeBucket {
  constructor() {
    this.puts = [];
    this.deletes = [];
  }

  async put(key, value, options) {
    this.puts.push({ key, value, options });
    return { key };
  }

  async delete(key) {
    this.deletes.push(key);
  }
}

async function fixture() {
  return readFile(resolve(
    process.cwd(),
    'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
  ), 'utf8');
}

describe('workshop fixture publisher', () => {
  it('writes an immutable canonical R2 object before atomically publishing the D1 revision', async () => {
    const database = new FakeDatabase();
    const packages = new FakeBucket();
    const result = await publishWorkshopFixture({
      database,
      packages,
      rawJson: await fixture(),
      now: '2026-08-02T00:00:00.000Z'
    });

    expect(packages.puts).toHaveLength(1);
    expect(packages.puts[0].key).toBe(result.r2Key);
    expect(packages.puts[0].key).toContain(result.packageSha256);
    expect(packages.puts[0].options.httpMetadata.contentType).toContain('application/json');
    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]).toHaveLength(4);
    expect(database.batches[0][2].bindings).toContain(result.r2Key);
    expect(database.batches[0][3].sql).toContain('latest_revision_id = ?1');
    expect(packages.deletes).toEqual([]);
  });

  it('removes the newly written R2 object when the D1 publication fails', async () => {
    const database = new FakeDatabase(new Error('d1 failed'));
    const packages = new FakeBucket();
    await expect(publishWorkshopFixture({
      database,
      packages,
      rawJson: await fixture()
    })).rejects.toThrow('d1 failed');
    expect(packages.deletes).toEqual([packages.puts[0].key]);
  });
});
