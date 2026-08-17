import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WORKSHOP_PACKAGE_MAX_BYTES
} from './workshopMetadataV1.js';
import {
  calculateImageGenerationPresetPackageSha256V1,
  measureWorkshopPackageBytes,
  parseImageGenerationPresetPackageJsonV1,
  parseImageGenerationPresetPackageV1
} from './imageGenerationPresetPackageV1.js';

const fixturePath = (name) => resolve(
  process.cwd(),
  'shared',
  'workshop',
  'fixtures',
  `image-generation-preset-v1-${name}.json`
);
const loadFixtureText = (name) => readFile(fixturePath(name), 'utf8');
const loadFixture = async (name) => JSON.parse(await loadFixtureText(name));

const expectFailureCode = (result, code) => {
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.code).toBe(code);
};

const reverseObjectKeys = (value) => {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).reverse().reduce((result, key) => {
    result[key] = reverseObjectKeys(value[key]);
    return result;
  }, {});
};

const promptFields = (workshopPackage) => workshopPackage.content.stylePresets.flatMap((preset) => [
  [preset.modifiers.global, 'positive'],
  [preset.modifiers.global, 'negative'],
  [preset.modifiers.character, 'positive'],
  [preset.modifiers.character, 'negative'],
  [preset.modifiers.narrativeScene, 'positive'],
  [preset.modifiers.narrativeScene, 'negative']
]);

const fillPackageToExactBytes = (workshopPackage, targetBytes) => {
  const fields = promptFields(workshopPackage);
  for (const [owner, field] of fields) {
    const remaining = targetBytes - measureWorkshopPackageBytes(workshopPackage);
    if (remaining <= 0) break;
    const available = (64 * 1024) - owner[field].length;
    owner[field] += 'x'.repeat(Math.min(remaining, available));
  }
  expect(measureWorkshopPackageBytes(workshopPackage)).toBe(targetBytes);
};

describe('imageGenerationPresetPackageV1 contract', () => {
  it('accepts the minimal and full fixtures', async () => {
    for (const name of ['minimal-valid', 'full-valid']) {
      const result = parseImageGenerationPresetPackageJsonV1(await loadFixtureText(name));
      expect(result.success).toBe(true);
    }
  });

  it('rejects the credential-bearing fixture before it can become a portable package', async () => {
    const result = parseImageGenerationPresetPackageJsonV1(await loadFixtureText('credential-rejected'));
    expectFailureCode(result, 'sensitive-content');
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ['content', 'variants', 0, 'profileId'],
        code: 'forbidden_field'
      });
    }
  });

  it('keeps the V1 shape strict and rejects unknown enums or future schemas', async () => {
    const minimal = await loadFixture('minimal-valid');
    minimal.content.variants[0].unexpected = true;
    expectFailureCode(parseImageGenerationPresetPackageV1(minimal), 'invalid-package');

    const unknownProvider = await loadFixture('minimal-valid');
    unknownProvider.compatibility.providerTypes = ['unknown-provider'];
    expectFailureCode(parseImageGenerationPresetPackageV1(unknownProvider), 'invalid-package');

    const future = await loadFixture('minimal-valid');
    future.schemaVersion = 2;
    expectFailureCode(parseImageGenerationPresetPackageV1(future), 'unsupported-schema');
  });

  it('rejects oversized prompt strings even when the whole object remains below 256 KiB', async () => {
    const full = await loadFixture('full-valid');
    full.content.stylePresets[0].modifiers.global.positive = 'x'.repeat((64 * 1024) + 1);
    expectFailureCode(parseImageGenerationPresetPackageV1(full), 'invalid-package');
  });

  it('rejects overly deep objects and dangerous prototype keys', async () => {
    const deep = await loadFixture('minimal-valid');
    deep.extra = {};
    let cursor = deep.extra;
    for (let index = 0; index < 20; index += 1) {
      cursor.next = {};
      cursor = cursor.next;
    }
    expectFailureCode(parseImageGenerationPresetPackageV1(deep), 'structure-too-complex');

    const minimalText = (await loadFixtureText('minimal-valid')).trimEnd();
    const dangerousText = `${minimalText.slice(0, -1)},"__proto__":{"polluted":true}}`;
    expectFailureCode(parseImageGenerationPresetPackageJsonV1(dangerousText), 'invalid-package');
    expect({}.polluted).toBeUndefined();
  });

  it.each(['profileId', 'credentialId', 'baseUrl', 'Authorization', 'workflowTemplateId', 'seed'])(
    'rejects forbidden environment field %s',
    async (field) => {
      const minimal = await loadFixture('minimal-valid');
      minimal.content.variants[0][field] = 'private-environment-value';
      expectFailureCode(parseImageGenerationPresetPackageV1(minimal), 'sensitive-content');
    }
  );

  it('rejects high-confidence tokens, URLs, local paths and encoded image blobs inside allowed text fields', async () => {
    for (const summary of [
      ['sk', 'abcdefghijklmnopqrstuvwxyz123456'].join('-'),
      'https://private.example.invalid/v1',
      'C:\\Users\\player\\workflow.json',
      `data:image/png;base64,${'Aa1+'.repeat(140)}`
    ]) {
      const minimal = await loadFixture('minimal-valid');
      minimal.manifest.summary = summary;
      expectFailureCode(parseImageGenerationPresetPackageV1(minimal), 'sensitive-content');
    }
  });

  it('accepts exactly 256 KiB and rejects one byte more regardless of a forged declared size', async () => {
    const full = await loadFixture('full-valid');
    fillPackageToExactBytes(full, WORKSHOP_PACKAGE_MAX_BYTES);
    const exactJson = JSON.stringify(full);
    const exact = parseImageGenerationPresetPackageJsonV1(exactJson);
    expect(exact.success).toBe(true);
    if (exact.success) expect(exact.byteLength).toBe(WORKSHOP_PACKAGE_MAX_BYTES);

    const field = promptFields(full).find(([owner, key]) => owner[key].length < 64 * 1024);
    expect(field).toBeDefined();
    field[0][field[1]] += 'y';
    const oversizedJson = JSON.stringify(full);
    expect(measureWorkshopPackageBytes(oversizedJson)).toBe(WORKSHOP_PACKAGE_MAX_BYTES + 1);
    expectFailureCode(
      parseImageGenerationPresetPackageJsonV1(oversizedJson, { declaredContentLength: 1 }),
      'package-too-large'
    );
  });

  it('produces the same canonical hash regardless of object key insertion order', async () => {
    const full = await loadFixture('full-valid');
    const reordered = reverseObjectKeys(full);
    const [first, second] = await Promise.all([
      calculateImageGenerationPresetPackageSha256V1(full),
      calculateImageGenerationPresetPackageSha256V1(reordered)
    ]);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it('enforces internal references and matching provider-specific safe parameters', async () => {
    const danglingStyle = await loadFixture('full-valid');
    danglingStyle.content.variants[0].styleRefs = ['missing-style'];
    expectFailureCode(parseImageGenerationPresetPackageV1(danglingStyle), 'invalid-package');

    const providerMismatch = await loadFixture('minimal-valid');
    providerMismatch.content.safeGenerationParameters[0].parameters = {
      providerType: 'xai-images',
      requestedImageCount: 1,
      aspectRatio: '1:1',
      resolution: '1k'
    };
    expectFailureCode(parseImageGenerationPresetPackageV1(providerMismatch), 'invalid-package');
  });

  it('does not permit raw ComfyUI workflows, checkpoint bindings or random seeds', async () => {
    for (const [field, value] of [
      ['workflow', { 1: { class_type: 'KSampler' } }],
      ['checkpoint', 'private-model.safetensors'],
      ['seed', 42]
    ]) {
      const full = await loadFixture('full-valid');
      full.content.safeGenerationParameters[1].parameters[field] = value;
      expectFailureCode(parseImageGenerationPresetPackageV1(full), 'sensitive-content');
    }
  });

  it('only accepts OpenAI output compression for JPEG or WebP', async () => {
    const invalid = await loadFixture('minimal-valid');
    invalid.content.safeGenerationParameters[0].parameters.outputFormat = 'png';
    invalid.content.safeGenerationParameters[0].parameters.outputCompression = 80;
    expectFailureCode(parseImageGenerationPresetPackageV1(invalid), 'invalid-package');

    const valid = await loadFixture('minimal-valid');
    valid.content.safeGenerationParameters[0].parameters.outputFormat = 'webp';
    valid.content.safeGenerationParameters[0].parameters.outputCompression = 80;
    expect(parseImageGenerationPresetPackageV1(valid).success).toBe(true);
  });
});
