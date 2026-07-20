import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { RuntimeState } from '../runtime/types';
import {
  applyGrayNetworkPatch,
  createInitialGrayNetworks,
  getCurrentAreaId,
  getCurrentAreaName
} from './grayNetwork';
import { projectGrayNetworkContext } from './grayNetworkContextProjector';

describe('gray network domain', () => {
  it('creates empty initial gray network state', () => {
    expect(createInitialGrayNetworks()).toEqual({ byAreaId: {} });
  });

  it('creates the current area profile when patch areaId is omitted', () => {
    const state = createInitialRuntimeState();
    const currentPlace = state.places[state.location.currentPlaceId];

    const next = applyGrayNetworkPatch(state, {
      climate: [
        {
          key: 'street_heat',
          label: 'Street heat',
          level: 'rising',
          summary: 'Rumors are getting louder near the station.',
          confidence: 'medium'
        }
      ]
    });

    expect(getCurrentAreaId(state)).toBe(currentPlace.districtId);
    expect(getCurrentAreaName(state)).toBe(currentPlace.districtId);
    expect(next.grayNetworks.byAreaId[currentPlace.districtId!]).toMatchObject({
      areaId: currentPlace.districtId,
      areaName: currentPlace.districtId,
      updatedAtTurn: state.turnCounter
    });
    expect(next.grayNetworks.byAreaId[currentPlace.districtId!].climate).toHaveLength(1);
  });

  it('upserts related people by actorId', () => {
    const state = createInitialRuntimeState();

    const first = applyGrayNetworkPatch(state, {
      areaId: 'area_test',
      areaName: 'Test Area',
      relatedPeople: [
        {
          actorId: 'actor_contact',
          visibleRole: 'Runner',
          knownTieSummary: 'Seen carrying messages.',
          confidence: 'low',
          visibility: { police: 'rumor', gang_member: 'known', civilian: 'hidden' },
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 1
        }
      ]
    });
    const second = applyGrayNetworkPatch(first, {
      areaId: 'area_test',
      relatedPeople: [
        {
          actorId: 'actor_contact',
          visibleRole: 'Broker',
          knownTieSummary: 'Now known to arrange meetings.',
          confidence: 'high',
          visibility: { police: 'known', gang_member: 'confirmed', civilian: 'rumor' },
          relatedPlaceIds: ['place_a'],
          relatedOrganizationIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 2
        }
      ]
    });

    expect(second.grayNetworks.byAreaId.area_test.relatedPeople).toHaveLength(1);
    expect(second.grayNetworks.byAreaId.area_test.relatedPeople[0]).toMatchObject({
      actorId: 'actor_contact',
      visibleRole: 'Broker',
      knownTieSummary: 'Now known to arrange meetings.',
      visibility: { police: 'known', gang_member: 'confirmed', civilian: 'rumor' }
    });
    expect(second.grayNetworks.byAreaId.area_test.areaName).toBe('Test Area');
  });

  it('stores identity-projected visibility objects for organizations, places, people, and clues', () => {
    const state = createInitialRuntimeState();

    const next = applyGrayNetworkPatch(state, {
      areaId: 'area_test',
      knownOrganizations: [
        {
          organizationId: 'org_projection',
          name: 'Full name',
          visibleName: 'Visible name',
          summary: 'Known only through filtered projections.',
          knownScope: 'street-level rumor',
          confidence: 'medium',
          visibility: { police: 'rumor', gang_member: 'confirmed', civilian: 'hidden' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: []
        }
      ],
      keyPlaces: [
        {
          placeId: 'place_projection',
          visibleRole: 'Meeting point',
          tieSummary: 'Different identities read the place differently.',
          riskSummary: 'Risk depends on current identity.',
          confidence: 'medium',
          visibility: { police: 'known', gang_member: 'confirmed', civilian: 'rumor' },
          relatedActorIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: []
        }
      ],
      relatedPeople: [
        {
          actorId: 'actor_projection',
          visibleRole: 'Contact',
          knownTieSummary: 'Contact depth is a numeric projection.',
          contactDepth: 2,
          confidence: 'high',
          visibility: { police: 'rumor', gang_member: 'known', civilian: 'hidden' },
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: []
        }
      ],
      relationClues: [
        {
          clueId: 'clue_projection',
          summary: 'The same clue is not equally visible to every identity.',
          certainty: 'claim',
          confidence: 'low',
          visibility: { police: 'known', gang_member: 'rumor', civilian: 'hidden' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: []
        }
      ]
    });

    const profile = next.grayNetworks.byAreaId.area_test;
    expect(profile.knownOrganizations[0].visibility).toEqual({
      police: 'rumor',
      gang_member: 'confirmed',
      civilian: 'hidden'
    });
    expect(profile.keyPlaces[0].visibility).toEqual({ police: 'known', gang_member: 'confirmed', civilian: 'rumor' });
    expect(profile.relatedPeople[0].visibility).toEqual({ police: 'rumor', gang_member: 'known', civilian: 'hidden' });
    expect(profile.relatedPeople[0].contactDepth).toBe(2);
    expect(profile.relationClues[0].visibility).toEqual({ police: 'known', gang_member: 'rumor', civilian: 'hidden' });
  });

  it('removes projection actorIds without touching runtime actors', () => {
    const state = createInitialRuntimeState();
    const withProjection = applyGrayNetworkPatch(state, {
      areaId: 'area_test',
      relatedPeople: [
        {
          actorId: 'player',
          visibleRole: 'Known face',
          knownTieSummary: 'People recognize him.',
          confidence: 'medium',
          visibility: { police: 'known', gang_member: 'known', civilian: 'rumor' },
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: []
        }
      ]
    });

    const removed = applyGrayNetworkPatch(withProjection, {
      areaId: 'area_test',
      removeIds: {
        actorIds: ['player']
      }
    });

    expect(removed.grayNetworks.byAreaId.area_test.relatedPeople).toEqual([]);
    expect(removed.actors.player).toEqual(state.actors.player);
  });

  it('removes suggested actions with removeIds.actionIds', () => {
    const state = createInitialRuntimeState();
    const withActions = applyGrayNetworkPatch(state, {
      areaId: 'area_test',
      suggestedActions: [
        {
          actionId: 'action_keep',
          identity: 'police',
          text: 'Keep watching.',
          rationale: 'Still useful.',
          riskLevel: 'low',
          relatedActorIds: [],
          relatedPlaceIds: []
        },
        {
          actionId: 'action_remove',
          identity: 'gang_member',
          text: 'Ask a runner.',
          rationale: 'No longer relevant.',
          riskLevel: 'medium',
          relatedActorIds: [],
          relatedPlaceIds: []
        }
      ]
    });

    const removed = applyGrayNetworkPatch(withActions, {
      areaId: 'area_test',
      removeIds: {
        actionIds: ['action_remove']
      }
    });

    expect(removed.grayNetworks.byAreaId.area_test.suggestedActions.map((action) => action.actionId)).toEqual([
      'action_keep'
    ]);
  });

  it('upserts and removes non-person projection records by their stable keys', () => {
    const state = createInitialRuntimeState();
    const first = applyGrayNetworkPatch(state, {
      areaId: 'area_test',
      climate: [
        {
          key: 'street_heat',
          label: 'Street heat',
          level: 'rising',
          summary: 'Old rumor.',
          confidence: 'low',
          lastUpdatedTurn: 1
        }
      ],
      knownOrganizations: [
        {
          organizationId: 'org_a',
          name: 'Org A',
          visibleName: 'Visible Org A',
          summary: 'Old organization summary.',
          knownScope: 'street corner',
          confidence: 'low',
          visibility: { police: 'rumor' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 1
        }
      ],
      keyPlaces: [
        {
          placeId: 'place_a',
          visibleRole: 'Old role',
          tieSummary: 'Old tie.',
          riskSummary: 'Old risk.',
          confidence: 'low',
          visibility: { police: 'rumor' },
          relatedActorIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 1
        }
      ],
      relationClues: [
        {
          clueId: 'clue_a',
          summary: 'Old clue.',
          certainty: 'rumor',
          confidence: 'low',
          visibility: { police: 'rumor' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 1
        }
      ],
      actionRisks: [
        {
          riskId: 'risk_a',
          identity: 'police',
          title: 'Old risk',
          level: 'low',
          summary: 'Old risk summary.',
          relatedActorIds: [],
          relatedPlaceIds: [],
          updatedAtTurn: 1
        }
      ],
      suggestedActions: [
        {
          actionId: 'action_a',
          identity: 'police',
          text: 'Old action.',
          rationale: 'Old rationale.',
          riskLevel: 'low',
          relatedActorIds: [],
          relatedPlaceIds: [],
          updatedAtTurn: 1
        }
      ]
    });

    const second = applyGrayNetworkPatch(first, {
      areaId: 'area_test',
      climate: [
        {
          key: 'street_heat',
          label: 'Street heat',
          level: 'active',
          summary: 'Updated rumor.',
          confidence: 'high',
          lastUpdatedTurn: 2
        }
      ],
      knownOrganizations: [
        {
          organizationId: 'org_a',
          name: 'Org A',
          visibleName: 'Visible Org A',
          summary: 'Updated organization summary.',
          knownScope: 'whole block',
          confidence: 'high',
          visibility: { police: 'known' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 2
        }
      ],
      keyPlaces: [
        {
          placeId: 'place_a',
          visibleRole: 'Updated role',
          tieSummary: 'Updated tie.',
          riskSummary: 'Updated risk.',
          confidence: 'high',
          visibility: { police: 'known' },
          relatedActorIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 2
        }
      ],
      relationClues: [
        {
          clueId: 'clue_a',
          summary: 'Updated clue.',
          certainty: 'claim',
          confidence: 'medium',
          visibility: { police: 'known' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 2
        }
      ],
      actionRisks: [
        {
          riskId: 'risk_a',
          identity: 'police',
          title: 'Updated risk',
          level: 'medium',
          summary: 'Updated risk summary.',
          relatedActorIds: [],
          relatedPlaceIds: [],
          updatedAtTurn: 2
        }
      ],
      suggestedActions: [
        {
          actionId: 'action_a',
          identity: 'police',
          text: 'Updated action.',
          rationale: 'Updated rationale.',
          riskLevel: 'medium',
          relatedActorIds: [],
          relatedPlaceIds: [],
          updatedAtTurn: 2
        }
      ]
    });

    expect(second.grayNetworks.byAreaId.area_test.climate).toHaveLength(1);
    expect(second.grayNetworks.byAreaId.area_test.climate[0].summary).toBe('Updated rumor.');
    expect(second.grayNetworks.byAreaId.area_test.knownOrganizations[0].summary).toBe('Updated organization summary.');
    expect(second.grayNetworks.byAreaId.area_test.keyPlaces[0].visibleRole).toBe('Updated role');
    expect(second.grayNetworks.byAreaId.area_test.relationClues[0].summary).toBe('Updated clue.');
    expect(second.grayNetworks.byAreaId.area_test.actionRisks[0].title).toBe('Updated risk');
    expect(second.grayNetworks.byAreaId.area_test.suggestedActions[0].text).toBe('Updated action.');

    const removed = applyGrayNetworkPatch(second, {
      areaId: 'area_test',
      removeIds: {
        climateKeys: ['street_heat'],
        organizationIds: ['org_a'],
        placeIds: ['place_a'],
        clueIds: ['clue_a'],
        riskIds: ['risk_a'],
        actionIds: ['action_a']
      }
    });

    expect(removed.grayNetworks.byAreaId.area_test.climate).toEqual([]);
    expect(removed.grayNetworks.byAreaId.area_test.knownOrganizations).toEqual([]);
    expect(removed.grayNetworks.byAreaId.area_test.keyPlaces).toEqual([]);
    expect(removed.grayNetworks.byAreaId.area_test.relationClues).toEqual([]);
    expect(removed.grayNetworks.byAreaId.area_test.actionRisks).toEqual([]);
    expect(removed.grayNetworks.byAreaId.area_test.suggestedActions).toEqual([]);
  });

  it('upserts organizations by visibleName or name when organizationId is absent', () => {
    const state = createInitialRuntimeState();
    const first = applyGrayNetworkPatch(state, {
      areaId: 'area_test',
      knownOrganizations: [
        {
          name: 'Org by visible name',
          visibleName: 'Shared visible name',
          summary: 'First visible-name summary.',
          knownScope: 'rumor',
          confidence: 'low',
          visibility: { police: 'rumor' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 1
        },
        {
          name: 'Org by name',
          visibleName: '',
          summary: 'First name summary.',
          knownScope: 'rumor',
          confidence: 'low',
          visibility: { police: 'rumor' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 1
        }
      ]
    });

    const second = applyGrayNetworkPatch(first, {
      areaId: 'area_test',
      knownOrganizations: [
        {
          name: 'Org by visible name renamed',
          visibleName: 'Shared visible name',
          summary: 'Updated visible-name summary.',
          knownScope: 'known',
          confidence: 'high',
          visibility: { police: 'known' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 2
        },
        {
          name: 'Org by name',
          visibleName: '',
          summary: 'Updated name summary.',
          knownScope: 'known',
          confidence: 'high',
          visibility: { police: 'known' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 2
        }
      ]
    });

    expect(second.grayNetworks.byAreaId.area_test.knownOrganizations).toHaveLength(2);
    expect(second.grayNetworks.byAreaId.area_test.knownOrganizations.map((organization) => organization.summary)).toEqual([
      'Updated visible-name summary.',
      'Updated name summary.'
    ]);
  });

  it('sorts and clamps compact projection lists other than related people', () => {
    const state = createInitialRuntimeState();

    const next = applyGrayNetworkPatch(state, {
      areaId: 'area_test',
      climate: Array.from({ length: 14 }, (_, index) => ({
        key: `climate_${index}`,
        label: `Climate ${index}`,
        level: 'known' as const,
        summary: `Climate summary ${index}`,
        confidence: 'medium' as const,
        lastUpdatedTurn: index === 2 ? 100 : index
      })),
      knownOrganizations: Array.from({ length: 22 }, (_, index) => ({
        organizationId: `org_${index}`,
        name: `Org ${index}`,
        visibleName: `Org ${index}`,
        summary: `Org summary ${index}`,
        knownScope: 'test scope',
        confidence: 'medium' as const,
        visibility: { police: 'known' as const },
        relatedActorIds: [],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        updatedAtTurn: index === 3 ? 100 : index
      })),
      keyPlaces: Array.from({ length: 22 }, (_, index) => ({
        placeId: `place_${index}`,
        visibleRole: `Place ${index}`,
        tieSummary: `Tie ${index}`,
        riskSummary: `Risk ${index}`,
        confidence: 'medium' as const,
        visibility: { police: 'known' as const },
        relatedActorIds: [],
        relatedOrganizationIds: [],
        relatedCaseIds: [],
        updatedAtTurn: index === 4 ? 100 : index
      })),
      relationClues: Array.from({ length: 32 }, (_, index) => ({
        clueId: `clue_${index}`,
        summary: `Clue ${index}`,
        certainty: 'claim' as const,
        confidence: 'medium' as const,
        visibility: { police: 'known' as const },
        relatedActorIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: [],
        relatedCaseIds: [],
        updatedAtTurn: index === 5 ? 100 : index
      })),
      actionRisks: Array.from({ length: 14 }, (_, index) => ({
        riskId: `risk_${index}`,
        identity: 'police' as const,
        title: `Risk ${index}`,
        level: 'medium' as const,
        summary: `Risk summary ${index}`,
        relatedActorIds: [],
        relatedPlaceIds: [],
        updatedAtTurn: index === 6 ? 100 : index
      })),
      suggestedActions: Array.from({ length: 10 }, (_, index) => ({
        actionId: `action_${index}`,
        identity: 'police' as const,
        text: `Action ${index}`,
        rationale: `Rationale ${index}`,
        riskLevel: 'low' as const,
        relatedActorIds: [],
        relatedPlaceIds: [],
        updatedAtTurn: index === 7 ? 100 : index
      }))
    });

    const profile = next.grayNetworks.byAreaId.area_test;
    expect(profile.climate).toHaveLength(12);
    expect(profile.climate[0].key).toBe('climate_2');
    expect(profile.knownOrganizations).toHaveLength(20);
    expect(profile.knownOrganizations[0].organizationId).toBe('org_3');
    expect(profile.keyPlaces).toHaveLength(20);
    expect(profile.keyPlaces[0].placeId).toBe('place_4');
    expect(profile.relationClues).toHaveLength(30);
    expect(profile.relationClues[0].clueId).toBe('clue_5');
    expect(profile.actionRisks).toHaveLength(12);
    expect(profile.actionRisks[0].riskId).toBe('risk_6');
    expect(profile.suggestedActions).toHaveLength(8);
    expect(profile.suggestedActions[0].actionId).toBe('action_7');
  });

  it('derives area from region, place id, then unknown when district is unavailable', () => {
    const state = createInitialRuntimeState();
    const regionOnly = {
      ...state,
      places: {
        ...state.places,
        place_region_only: {
          ...state.places[state.location.currentPlaceId],
          placeId: 'place_region_only',
          districtId: undefined,
          regionId: 'region_only',
          name: 'Region-only place',
          nameZh: '只有总区的地点'
        }
      },
      location: {
        ...state.location,
        currentPlaceId: 'place_region_only'
      }
    };
    expect(getCurrentAreaId(regionOnly)).toBe('region_only');
    expect(getCurrentAreaName(regionOnly)).toBe('region_only');

    const namedPlace = {
      ...state,
      places: {
        ...state.places,
        place_named: {
          ...state.places[state.location.currentPlaceId],
          placeId: 'place_named',
          districtId: undefined,
          regionId: undefined,
          name: 'Named place',
          nameZh: '中文地点名'
        }
      },
      location: {
        ...state.location,
        currentPlaceId: 'place_named'
      }
    };
    expect(getCurrentAreaId(namedPlace as unknown as RuntimeState)).toBe('place_named');
    expect(getCurrentAreaName(namedPlace as unknown as RuntimeState)).toBe('中文地点名');

    const englishNamedPlace = {
      ...state,
      places: {
        ...state.places,
        place_english_named: {
          ...state.places[state.location.currentPlaceId],
          placeId: 'place_english_named',
          districtId: undefined,
          regionId: undefined,
          name: 'English named place',
          nameZh: undefined
        }
      },
      location: {
        ...state.location,
        currentPlaceId: 'place_english_named'
      }
    };
    expect(getCurrentAreaId(englishNamedPlace as unknown as RuntimeState)).toBe('place_english_named');
    expect(getCurrentAreaName(englishNamedPlace as unknown as RuntimeState)).toBe('English named place');

    const placeIdOnly = {
      ...state,
      places: {},
      location: {
        ...state.location,
        currentPlaceId: 'place_missing'
      }
    };
    expect(getCurrentAreaId(placeIdOnly)).toBe('place_missing');
    expect(getCurrentAreaName(placeIdOnly)).toBe('place_missing');

    const unknown = {
      ...state,
      places: {},
      location: {
        ...state.location,
        currentPlaceId: ''
      }
    };
    expect(getCurrentAreaId(unknown)).toBe('area_unknown');
    expect(getCurrentAreaName(unknown)).toBe('area_unknown');
  });

  it('falls back to the latest non-empty gray network profile when the current area has no profile', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.location.currentPlaceId = 'place_player_home';
    delete state.location.currentSceneId;
    state.grayNetworks.byAreaId.area_yau_ma_tei = {
      areaId: 'area_yau_ma_tei',
      areaName: 'Yau Ma Tei',
      updatedAtTurn: 20,
      updatedAtTime: state.time,
      climate: [
        {
          key: 'old_temple_street_pressure',
          label: 'Old pressure',
          level: 'medium',
          summary: 'Older street pressure.',
          confidence: 'medium',
          lastUpdatedTurn: 20
        }
      ],
      knownOrganizations: [],
      keyPlaces: [],
      relatedPeople: [],
      relationClues: [],
      actionRisks: [],
      suggestedActions: []
    };
    state.grayNetworks.byAreaId.area_hung_hom = {
      areaId: 'area_hung_hom',
      areaName: 'Hung Hom',
      updatedAtTurn: 35,
      updatedAtTime: state.time,
      climate: [
        {
          key: 'chang_lok_collection_rumor',
          label: 'Collection rumor',
          level: 'rising',
          summary: 'Chang Lok debt collectors are active around the factory blocks.',
          confidence: 'medium',
          lastUpdatedTurn: 35
        }
      ],
      knownOrganizations: [
        {
          organizationId: 'org_chang_lok_cell',
          name: 'Chang Lok collection cell',
          visibleName: '长乐收数线',
          summary: 'Police-visible rumor about collectors around Hung Hom.',
          knownScope: 'street rumor',
          confidence: 'medium',
          visibility: { police: 'known', civilian: 'hidden', gang_member: 'known' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 35
        }
      ],
      keyPlaces: [],
      relatedPeople: [],
      relationClues: [],
      actionRisks: [],
      suggestedActions: []
    };

    const projection = projectGrayNetworkContext(state);

    expect(projection.available).toBe(true);
    expect(projection.areaId).toBe('area_hung_hom');
    expect(projection.areaName).toBe('Hung Hom');
    expect(projection.climate[0]?.key).toBe('chang_lok_collection_rumor');
    expect(projection.knownOrganizations.map((item) => item.organizationId)).toEqual(['org_chang_lok_cell']);
  });

  it('keeps newest related people first and clamps the list', () => {
    const state = createInitialRuntimeState();
    const relatedPeople = Array.from({ length: 35 }, (_, index) => ({
      actorId: `actor_${index}`,
      visibleRole: `Contact ${index}`,
      knownTieSummary: `Tie ${index}`,
      confidence: 'medium' as const,
      visibility: { police: 'known', gang_member: 'rumor', civilian: 'hidden' } as const,
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      relatedCaseIds: [],
      updatedAtTurn: index === 10 ? 100 : index === 11 ? 100 : index
    }));

    const next = applyGrayNetworkPatch(state, {
      areaId: 'area_test',
      relatedPeople
    });

    expect(next.grayNetworks.byAreaId.area_test.relatedPeople).toHaveLength(30);
    expect(next.grayNetworks.byAreaId.area_test.relatedPeople.map((person) => person.actorId).slice(0, 4)).toEqual([
      'actor_10',
      'actor_11',
      'actor_34',
      'actor_33'
    ]);
    expect(next.grayNetworks.byAreaId.area_test.relatedPeople.map((person) => person.actorId)).not.toContain('actor_0');
  });
});
