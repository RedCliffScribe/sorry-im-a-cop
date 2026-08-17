import { describe, expect, it } from 'vitest';
import { selectContext } from '../../context/selectContext';
import {
  findProjectedDramaSourceCollisions,
  getProjectedDramaPayload,
  projectedDramaSourceProviders,
  resolveProjectedDramaProvider
} from '../../drama/sourceRegistry';
import { dramaSourceKey } from '../../drama/types';
import { createInitialRuntimeState } from '../../runtime/initialState';
import {
  getOfficialDlcRuntimeManifest,
  officialDlcManifests,
  officialDlcRuntimeManifests,
  resolveOfficialDlcBindings
} from '../manifest';
import {
  urbanLegendsAlphaEventGroup,
  urbanLegendsAlphaManifest
} from '../urbanLegendsAlpha/content';
import { urbanLegendsAlphaProvider } from '../urbanLegendsAlpha/provider';
import {
  urbanLegendsFormalManifest,
  urbanLegendsFormalV1_1Manifest,
  urbanLegendsFormalV1Manifest,
  urbanLegendsReleaseGate
} from './content';
import { urbanLegendsFormalProvider } from './provider';
import { urbanLegendsFormalSourceRef } from './stagePayload';

describe('Urban Legends formal controlled registration', () => {
  it('publishes only the formal package while retaining exact Alpha runtime compatibility', () => {
    expect(officialDlcManifests).toEqual([urbanLegendsFormalManifest]);
    expect(officialDlcRuntimeManifests).toEqual([
      urbanLegendsAlphaManifest,
      urbanLegendsFormalV1Manifest,
      urbanLegendsFormalV1_1Manifest,
      urbanLegendsFormalManifest
    ]);
    expect(
      getOfficialDlcRuntimeManifest('urban_legends_alpha', '1.0.0')
    ).toBe(urbanLegendsAlphaManifest);
    expect(
      getOfficialDlcRuntimeManifest('urban_legends', '1.0.0')
    ).toBe(urbanLegendsFormalV1Manifest);
    expect(
      getOfficialDlcRuntimeManifest('urban_legends', '1.1.0')
    ).toBe(urbanLegendsFormalV1_1Manifest);
    expect(
      getOfficialDlcRuntimeManifest('urban_legends', '1.2.0')
    ).toBe(urbanLegendsFormalManifest);
    expect(getOfficialDlcRuntimeManifest('urban_legends', '0.9.0')).toBeUndefined();
  });

  it('keeps both packages mutually exclusive in normal new-game binding resolution', () => {
    expect(
      resolveOfficialDlcBindings(
        ['urban_legends_alpha', 'urban_legends'],
        'hk_1988'
      )
    ).toEqual([{
      dlcId: 'urban_legends',
      version: '1.2.0',
      status: 'active'
    }]);
    expect(urbanLegendsReleaseGate).toMatchObject({
      publicationStatus: 'release_candidate',
      selectableInNewGame: true,
      providerRegistered: true,
      alphaMigration: 'none',
      incompatibleDlcIds: ['urban_legends_alpha']
    });
  });

  it('registers Alpha and formal providers without cross-resolving their exact source keys', () => {
    expect(projectedDramaSourceProviders).toContain(urbanLegendsAlphaProvider);
    expect(projectedDramaSourceProviders).toContain(urbanLegendsFormalProvider);

    const formalState = createInitialRuntimeState({ currentIdentity: 'police' });
    formalState.world.worldpackId = 'hk_1988';
    formalState.world.officialDlcBindings = [{
      dlcId: urbanLegendsFormalManifest.dlcId,
      version: urbanLegendsFormalManifest.version,
      status: 'active'
    }];
    const formalContext = selectContext(formalState, '继续巡逻');
    const formalSources = urbanLegendsFormalProvider.list(formalContext);
    expect(formalSources).toHaveLength(17);
    expect(findProjectedDramaSourceCollisions(formalContext)).toEqual([]);
    for (const source of formalSources) {
      const resolution = resolveProjectedDramaProvider(formalContext, source.ref);
      expect(resolution.status).toBe('resolved');
      if (resolution.status === 'resolved') {
        expect(resolution.provider).toBe(urbanLegendsFormalProvider);
        expect(dramaSourceKey(resolution.source.ref)).toBe(dramaSourceKey(source.ref));
      }
      expect(getProjectedDramaPayload(formalContext, source.ref)?.ref).toEqual(source.ref);
    }
    const formalResolution = resolveProjectedDramaProvider(
      formalContext,
      urbanLegendsFormalSourceRef
    );
    expect(formalResolution.status).toBe('resolved');
    if (formalResolution.status === 'resolved') {
      expect(formalResolution.provider).toBe(urbanLegendsFormalProvider);
    }

    const alphaState = createInitialRuntimeState({ currentIdentity: 'police' });
    alphaState.world.worldpackId = 'hk_1988';
    alphaState.world.officialDlcBindings = [{
      dlcId: urbanLegendsAlphaManifest.dlcId,
      version: urbanLegendsAlphaManifest.version,
      status: 'active'
    }];
    const alphaContext = selectContext(alphaState, '继续巡逻');
    const alphaRef = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: urbanLegendsAlphaEventGroup.eventGroupId,
      dlcId: urbanLegendsAlphaManifest.dlcId,
      priorityClass: 'player_selected'
    } as const;
    const alphaResolution = resolveProjectedDramaProvider(alphaContext, alphaRef);
    expect(alphaResolution.status).toBe('resolved');
    if (alphaResolution.status === 'resolved') {
      expect(alphaResolution.provider).toBe(urbanLegendsAlphaProvider);
    }
    expect(resolveProjectedDramaProvider(alphaContext, urbanLegendsFormalSourceRef).status)
      .toBe('not_found');
    expect(resolveProjectedDramaProvider(formalContext, alphaRef).status)
      .toBe('not_found');

    const frozenV1State = createInitialRuntimeState({ currentIdentity: 'police' });
    frozenV1State.world.worldpackId = 'hk_1988';
    frozenV1State.world.officialDlcBindings = [{
      dlcId: urbanLegendsFormalV1Manifest.dlcId,
      version: urbanLegendsFormalV1Manifest.version,
      status: 'active'
    }];
    const frozenV1Context = selectContext(frozenV1State, '继续巡逻');
    expect(urbanLegendsFormalProvider.list(frozenV1Context)).toHaveLength(1);
    expect(
      resolveProjectedDramaProvider(frozenV1Context, formalSources[1]!.ref).status
    ).toBe('not_found');
    expect(getProjectedDramaPayload(frozenV1Context, formalSources[1]!.ref)).toBeUndefined();

    const frozenV1_1State = createInitialRuntimeState({ currentIdentity: 'police' });
    frozenV1_1State.world.worldpackId = 'hk_1988';
    frozenV1_1State.world.officialDlcBindings = [{
      dlcId: urbanLegendsFormalV1_1Manifest.dlcId,
      version: urbanLegendsFormalV1_1Manifest.version,
      status: 'active'
    }];
    const frozenV1_1Context = selectContext(frozenV1_1State, '继续巡逻');
    const frozenV1_1Sources = urbanLegendsFormalProvider.list(frozenV1_1Context);
    expect(frozenV1_1Sources).toHaveLength(16);
    expect(frozenV1_1Sources.some((source) => source.title === '最后一份外卖')).toBe(false);
    const lastDelivery = formalSources.find((source) => source.title === '最后一份外卖')!;
    expect(resolveProjectedDramaProvider(frozenV1_1Context, lastDelivery.ref).status)
      .toBe('not_found');
    expect(getProjectedDramaPayload(frozenV1_1Context, lastDelivery.ref)).toBeUndefined();
  });
});
