import { officialDlcManifests, officialDlcRuntimeManifests } from '../../src/domain/dlc/manifest';
import { urbanLegendsFormalManifest } from '../../src/domain/dlc/urbanLegends/content';
import { urbanLegendsFormalProvider } from '../../src/domain/dlc/urbanLegends/provider';
import {
  projectedDramaSourceProviders,
  type ProjectedDramaSourceProvider
} from '../../src/domain/drama/sourceRegistry';

export const phase3CandidateManifests = [urbanLegendsFormalManifest] as const;

/**
 * Compatibility seam for the Phase 3 real-API harness. The formal package is
 * now registered in production, so this function only verifies that the
 * release-candidate registries are intact and returns an idempotent no-op.
 */
export function installOfficialDlcPhase3CandidateProvider(): () => void {
  if (!officialDlcManifests.includes(urbanLegendsFormalManifest)) {
    throw new Error('正式 DLC 未进入公开 Manifest 注册表。');
  }
  if (!officialDlcRuntimeManifests.includes(urbanLegendsFormalManifest)) {
    throw new Error('正式 DLC 未进入运行时 Manifest 注册表。');
  }
  const providers = projectedDramaSourceProviders as readonly ProjectedDramaSourceProvider[];
  if (!providers.includes(urbanLegendsFormalProvider)) {
    throw new Error('正式 DLC Provider 未进入生产注册表。');
  }
  return () => undefined;
}
