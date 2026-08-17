import minimalFixture from '../../../shared/workshop/fixtures/image-generation-preset-v1-minimal-valid.json';
import rejectedFixture from '../../../shared/workshop/fixtures/image-generation-preset-v1-credential-rejected.json';
import {
  WORKSHOP_PACKAGE_MAX_BYTES,
  parseImageGenerationPresetPackageV1
} from './workshopPackageContract';

describe('workshop package browser contract adapter', () => {
  it('uses the shared V1 contract without copying client-side rules', () => {
    const result = parseImageGenerationPresetPackageV1(minimalFixture);
    expect(result.success).toBe(true);
    expect(WORKSHOP_PACKAGE_MAX_BYTES).toBe(262_144);

    const rejected = parseImageGenerationPresetPackageV1(rejectedFixture);
    expect(rejected.success).toBe(false);
    if (!rejected.success) expect(rejected.error.code).toBe('sensitive-content');
  });
});
