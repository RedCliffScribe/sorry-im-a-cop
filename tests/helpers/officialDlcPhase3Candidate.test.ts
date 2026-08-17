import { describe, expect, it } from 'vitest';
import { selectContext } from '../../src/domain/context/selectContext';
import { officialDlcManifests, officialDlcRuntimeManifests } from '../../src/domain/dlc/manifest';
import { urbanLegendsFormalManifest } from '../../src/domain/dlc/urbanLegends/content';
import { urbanLegendsFormalProvider } from '../../src/domain/dlc/urbanLegends/provider';
import { urbanLegendsFormalSourceRef } from '../../src/domain/dlc/urbanLegends/stagePayload';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import {
  findProjectedDramaSourceCollisions,
  listProjectedDramaSources,
  projectedDramaSourceProviders,
  resolveProjectedDramaProvider
} from '../../src/domain/drama/sourceRegistry';
import {
  installOfficialDlcPhase3CandidateProvider,
  phase3CandidateManifests
} from './officialDlcPhase3Candidate';

describe('Official DLC Phase 3 candidate registry', () => {
  it('uses the production release-candidate registration without mutating it', () => {
    expect(officialDlcManifests).toEqual([urbanLegendsFormalManifest]);
    expect(officialDlcRuntimeManifests).toContain(urbanLegendsFormalManifest);
    expect(phase3CandidateManifests).toEqual([urbanLegendsFormalManifest]);

    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.world.officialDlcBindings = [{
      dlcId: urbanLegendsFormalManifest.dlcId,
      version: urbanLegendsFormalManifest.version,
      status: 'active'
    }];
    const context = selectContext(state, '继续按本更路线巡逻。');

    expect(listProjectedDramaSources(context)).toContainEqual(
      expect.objectContaining({ ref: urbanLegendsFormalSourceRef })
    );

    const restore = installOfficialDlcPhase3CandidateProvider();
    try {
      const projected = listProjectedDramaSources(context);
      expect(projected).toContainEqual(
        expect.objectContaining({ ref: urbanLegendsFormalSourceRef })
      );
      expect(resolveProjectedDramaProvider(context, urbanLegendsFormalSourceRef).status).toBe(
        'resolved'
      );
      expect(findProjectedDramaSourceCollisions(context)).toEqual([]);
    } finally {
      restore();
    }

    expect(projectedDramaSourceProviders).toContain(urbanLegendsFormalProvider);
    expect(listProjectedDramaSources(context)).toContainEqual(
      expect.objectContaining({ ref: urbanLegendsFormalSourceRef })
    );
    expect(officialDlcManifests).toEqual([urbanLegendsFormalManifest]);
    expect(officialDlcRuntimeManifests).toContain(urbanLegendsFormalManifest);
  });
});
