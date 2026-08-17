import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildWorkshopFixtureArtifacts,
  buildWranglerInvocation
} from './seed-public-fixture.mjs';

describe('workshop fixture management command', () => {
  it('builds canonical immutable R2 and D1 artifacts without local credentials', async () => {
    const fixture = await readFile(resolve(
      globalThis.process.cwd(),
      'shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json'
    ), 'utf8');
    const result = await buildWorkshopFixtureArtifacts(fixture, {
      now: '2026-08-02T00:00:00.000Z'
    });

    expect(result.r2Key).toBe(
      `packages/image-generation-preset/${result.itemId}/1/${result.sha256}.json`
    );
    expect(new globalThis.TextEncoder().encode(result.canonicalJson)).toHaveLength(result.byteSize);
    expect(result.seedSql).toContain('BEGIN;');
    expect(result.seedSql).toContain('latest_revision_id');
    expect(result.seedSql).toContain(result.r2Key);
    expect(result.seedSql).not.toMatch(/credential|authorization|baseUrl/i);
    expect(result.remoteSeedSql).not.toMatch(/\b(?:BEGIN|COMMIT)\b/);
    expect(result.remoteSeedSql).toContain('latest_revision_id');
    expect(result.rollbackSql).toContain(result.revisionId);
    expect(result.rollbackSql).toContain(result.itemId);
  });

  it('invokes Wrangler through Node and npm CLI on Windows without spawning npx.cmd', () => {
    const invocation = buildWranglerInvocation(['d1', 'list'], {
      platform: 'win32',
      nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
      npmExecPath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
    });

    expect(invocation.command).toBe('C:\\Program Files\\nodejs\\node.exe');
    expect(invocation.args).toEqual([
      'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
      'exec',
      '--yes',
      '--package=wrangler',
      '--',
      'wrangler',
      'd1',
      'list'
    ]);
  });
});
