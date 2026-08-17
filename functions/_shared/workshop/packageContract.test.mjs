import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WORKSHOP_CLOUDFLARE_BINDINGS_V1,
  parseImageGenerationPresetPackageJsonV1
} from './packageContract.js';

describe('workshop package Pages Function adapter', () => {
  it('uses the same shared fixture and contract as the browser boundary', async () => {
    const fixturesDirectory = resolve(process.cwd(), 'shared', 'workshop', 'fixtures');
    const fixture = await readFile(resolve(
      fixturesDirectory,
      'image-generation-preset-v1-minimal-valid.json'
    ), 'utf8');
    const rejectedFixture = await readFile(resolve(
      fixturesDirectory,
      'image-generation-preset-v1-credential-rejected.json'
    ), 'utf8');
    expect(parseImageGenerationPresetPackageJsonV1(fixture).success).toBe(true);
    const rejected = parseImageGenerationPresetPackageJsonV1(rejectedFixture);
    expect(rejected.success).toBe(false);
    if (!rejected.success) expect(rejected.error.code).toBe('sensitive-content');
    expect(WORKSHOP_CLOUDFLARE_BINDINGS_V1).toEqual({
      database: 'WORKSHOP_DB',
      packages: 'WORKSHOP_PACKAGES'
    });
  });
});
