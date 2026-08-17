import { describe, expect, it } from 'vitest';
import { selectContext } from '../../context/selectContext';
import { listProjectedDramaSources, projectedDramaSourceProviders } from '../../drama/sourceRegistry';
import { createInitialRuntimeState } from '../../runtime/initialState';
import {
  getOfficialDlcManifest,
  officialDlcManifests,
  officialDlcRuntimeManifests,
  resolveOfficialDlcBindings
} from '../manifest';
import {
  urbanLegendsAlphaCharacters,
  urbanLegendsAlphaEventGroup,
  urbanLegendsAlphaManifest,
  urbanLegendsAlphaNewsTemplate,
  urbanLegendsAlphaPlaces
} from '../urbanLegendsAlpha/content';
import {
  urbanLegendsAlphaToFormalIdentityAudit,
  urbanLegendsEntryRouteMatrix,
  urbanLegendsFormalCharacters,
  urbanLegendsFormalIds,
  urbanLegendsFormalManifest,
  urbanLegendsFormalV1_1Manifest,
  urbanLegendsFormalV1Manifest,
  urbanLegendsFormalPlaces,
  urbanLegendsNarrativeIdentity,
  urbanLegendsRelationshipSeeds,
  urbanLegendsReleaseGate,
  urbanLegendsTruthBoundary
} from './content';

function alphaAssetIds(): string[] {
  return [
    urbanLegendsAlphaManifest.dlcId,
    'official-dlc:urban_legends_alpha:midnight_bus',
    urbanLegendsAlphaEventGroup.eventGroupId,
    ...urbanLegendsAlphaCharacters.map((character) => character.actorId),
    ...urbanLegendsAlphaPlaces.map((place) => place.placeId),
    urbanLegendsAlphaNewsTemplate.newsId,
    ...urbanLegendsAlphaEventGroup.stages.map((stage) => stage.stageId),
    ...urbanLegendsAlphaEventGroup.stages.flatMap((stage) =>
      stage.nodes.map((node) => node.nodeId)
    )
  ];
}

describe('Urban Legends formal Phase 2A + 2B content', () => {
  it('freezes Alpha for existing saves and publishes only the formal package to new saves', () => {
    expect(officialDlcManifests).toEqual([urbanLegendsFormalManifest]);
    expect(officialDlcRuntimeManifests).toEqual([
      urbanLegendsAlphaManifest,
      urbanLegendsFormalV1Manifest,
      urbanLegendsFormalV1_1Manifest,
      urbanLegendsFormalManifest
    ]);
    expect(getOfficialDlcManifest(urbanLegendsAlphaManifest.dlcId)).toBe(
      urbanLegendsAlphaManifest
    );
    expect(getOfficialDlcManifest(urbanLegendsFormalManifest.dlcId)).toBe(
      urbanLegendsFormalManifest
    );
    expect(
      resolveOfficialDlcBindings(
        [urbanLegendsAlphaManifest.dlcId, urbanLegendsFormalManifest.dlcId],
        'hk_1988'
      )
    ).toEqual([{
      dlcId: urbanLegendsFormalManifest.dlcId,
      version: urbanLegendsFormalManifest.version,
      status: 'active'
    }]);
    expect(urbanLegendsReleaseGate).toMatchObject({
      publicationStatus: 'release_candidate',
      selectableInNewGame: true,
      providerRegistered: true,
      alphaMigration: 'none',
      incompatibleDlcIds: ['urban_legends_alpha']
    });
    expect(urbanLegendsReleaseGate.publicRegistrationRequires).toEqual([
      'phase_2c',
      'phase_2d',
      'phase_2e',
      'ui_acceptance',
      'phase_3_real_api'
    ]);
  });

  it('registers the formal provider after all publication gates pass', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.world.officialDlcBindings = [{
      dlcId: urbanLegendsFormalManifest.dlcId,
      version: urbanLegendsFormalManifest.version,
      status: 'active'
    }];
    const context = selectContext(state, '继续巡逻');
    expect(
      projectedDramaSourceProviders.some(
        (provider) => provider.providerId === 'official-dlc' &&
          provider.list(context).some(
            (source) => (source.ref as { dlcId?: string }).dlcId === urbanLegendsFormalManifest.dlcId
          )
      )
    ).toBe(true);
    expect(
      listProjectedDramaSources(context).some(
        (source) => (source.ref as { dlcId?: string }).dlcId === urbanLegendsFormalManifest.dlcId
      )
    ).toBe(true);
  });

  it('uses a formal DLC, event, Arc, actor, place and news identity disjoint from Alpha', () => {
    const mappedFormalIds = urbanLegendsAlphaToFormalIdentityAudit.flatMap((entry) =>
      entry.formalId ? [entry.formalId] : []
    );
    const alphaIds = new Set(alphaAssetIds());
    expect(urbanLegendsFormalManifest).toMatchObject({
      dlcId: 'urban_legends',
      title: '都市怪谈',
      version: '1.2.0',
      worldCompatibility: [{ worldpackId: 'hk_1988', status: 'supported' }]
    });
    expect(urbanLegendsNarrativeIdentity).toMatchObject({
      dlcId: 'urban_legends',
      eventGroupId: 'official_dlc_urban_legends_hk1988_midnight_bus',
      arcKey: 'official-dlc:urban_legends:hk_1988:midnight_bus',
      stageContractStatus: 'formal_phase_2c'
    });
    expect(mappedFormalIds.every((id) => !alphaIds.has(id))).toBe(true);
    expect(new Set(mappedFormalIds).size).toBe(mappedFormalIds.length);
  });

  it('audits every Alpha DLC, Arc, event, actor, place, news, stage and node identity', () => {
    expect(new Set(urbanLegendsAlphaToFormalIdentityAudit.map((entry) => entry.alphaId))).toEqual(
      new Set(alphaAssetIds())
    );
    expect(
      urbanLegendsAlphaToFormalIdentityAudit.filter((entry) => entry.assetType === 'stage')
    ).toHaveLength(5);
    expect(
      urbanLegendsAlphaToFormalIdentityAudit.filter((entry) => entry.assetType === 'node')
    ).toHaveLength(15);
    expect(
      urbanLegendsAlphaToFormalIdentityAudit
        .filter((entry) => entry.assetType === 'stage' || entry.assetType === 'node')
        .every((entry) =>
          entry.disposition === 'freeze_alpha_create_formal_counterpart' &&
          typeof entry.formalId === 'string'
        )
    ).toBe(true);
  });

  it('defines six core actors plus one supporting police bridge without asserting secrets', () => {
    expect(urbanLegendsFormalCharacters).toHaveLength(7);
    expect(urbanLegendsFormalCharacters.filter((character) => character.tier === 'core')).toHaveLength(6);
    expect(urbanLegendsFormalCharacters.filter((character) => character.tier === 'supporting')).toEqual([
      expect.objectContaining({ actorId: urbanLegendsFormalIds.actors.juniorOfficer })
    ]);
    expect(urbanLegendsFormalCharacters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: urbanLegendsFormalIds.actors.dispatcher,
          occupation: '巴士总站调度员'
        })
      ])
    );
    for (const character of urbanLegendsFormalCharacters) {
      expect(character.publicFacts.length).toBeGreaterThan(0);
      expect(character.desires.length).toBeGreaterThan(0);
      expect(character.candidateSecretDomains.length).toBeGreaterThan(0);
      expect(character.informationBoundary.knows.length).toBeGreaterThan(0);
      expect(character.informationBoundary.doesNotKnow.length).toBeGreaterThan(0);
      expect(character.longTermArcDirections.length).toBeGreaterThan(0);
      expect(character.forbiddenConfirmations.length).toBeGreaterThan(0);
      expect(
        character.candidateSecretDomains.every((secret) =>
          !character.publicFacts.includes(secret.possibility)
        )
      ).toBe(true);
    }
  });

  it('keeps relationship seeds as non-factual tensions between known formal actors', () => {
    const actorIds = new Set(urbanLegendsFormalCharacters.map((character) => character.actorId));
    expect(urbanLegendsRelationshipSeeds).toHaveLength(7);
    expect(new Set(urbanLegendsRelationshipSeeds.map((seed) => seed.relationshipSeedId)).size).toBe(
      urbanLegendsRelationshipSeeds.length
    );
    for (const seed of urbanLegendsRelationshipSeeds) {
      expect(seed.actorIds.every((actorId) => actorIds.has(actorId))).toBe(true);
      expect(seed.initialTension).not.toHaveLength(0);
      expect(seed.mutualNeeds.length).toBeGreaterThan(0);
      expect(seed.possibleConflicts.length).toBeGreaterThan(0);
      expect(seed.forbiddenAssumptions).toEqual(
        expect.arrayContaining([expect.stringMatching(/不预设|不预创建|不让/)] )
      );
    }
  });

  it('does not auto-create cases from exposure while preserving formally grounded case creation', () => {
    expect(urbanLegendsEntryRouteMatrix.map((route) => route.identity)).toEqual([
      'police',
      'civilian',
      'gang_member'
    ]);
    for (const route of urbanLegendsEntryRouteMatrix) {
      expect(route.contactSources.length).toBeGreaterThan(2);
      expect(route.interventionMotivations.length).toBeGreaterThan(2);
      expect(route.reasonablePermissions.length).toBeGreaterThan(2);
      expect(route.restrictions.length).toBeGreaterThan(2);
      expect(route.realisticRisks.length).toBeGreaterThan(2);
      expect(route.initiallyVisibleActorIds.length).toBeGreaterThan(2);
      expect(route.ordinaryInitialRuntimeKinds).not.toContain('case');
      expect(route.caseCreationBoundary).toMatchObject({
        automaticOnExposure: false,
        stageRestriction: 'none',
        requiresExistingRuntimeGates: true
      });
      expect(route.caseCreationBoundary.allowedConditions.length).toBeGreaterThan(1);
      expect(route.caseCreationBoundary.forbiddenConditions.join('\n')).toMatch(/传闻|DLC|阶段|社团涉入/);
      expect(route.diversionRoutes.length).toBeGreaterThan(2);
    }
    const policeRoute = urbanLegendsEntryRouteMatrix[0];
    const civilianRoute = urbanLegendsEntryRouteMatrix[1];
    const societyRoute = urbanLegendsEntryRouteMatrix[2];
    expect(policeRoute?.reasonablePermissions.join('\n')).toContain('岗位授权');
    expect(policeRoute?.caseCreationBoundary.allowedConditions.join('\n')).toMatch(/正式.*报案|正式决定立案/);
    expect(policeRoute?.caseCreationBoundary.forbiddenConditions.join('\n')).toContain('street_rumor');
    expect(civilianRoute?.restrictions.join('\n')).toContain('职业调查权限');
    expect(civilianRoute?.caseCreationBoundary.authorityRule).toContain('警务单位');
    expect(societyRoute?.restrictions.join('\n')).toContain('不默认社团就是幕后');
    expect(societyRoute?.caseCreationBoundary.forbiddenConditions.join('\n')).toContain('社团涉入');
  });

  it('separates confirmable reality, ambiguous explanations and forbidden objective facts', () => {
    expect(urbanLegendsTruthBoundary.confirmableRealityKinds.length).toBeGreaterThan(4);
    expect(urbanLegendsTruthBoundary.ambiguousExplanationKinds.length).toBeGreaterThan(4);
    expect(urbanLegendsTruthBoundary.unexplainedResidueRules.join('\n')).toContain('不得自动扩张为超自然系统');
    expect(urbanLegendsTruthBoundary.forbiddenObjectiveFacts).toEqual(
      expect.arrayContaining([
        '鬼魂客观存在。',
        '巴士是超自然实体。',
        '失踪者被灵异力量带走。'
      ])
    );
  });

  it('keeps formal places inside HK1988 and avoids modern surveillance assumptions', () => {
    expect(urbanLegendsFormalPlaces).toHaveLength(3);
    expect(urbanLegendsFormalPlaces.every((place) => place.worldpackId === 'hk_1988')).toBe(true);
    expect(
      urbanLegendsFormalPlaces.flatMap((place) => place.forbiddenAdaptations).join('\n')
    ).toContain('不得出现联网实时车辆定位');
  });
});
