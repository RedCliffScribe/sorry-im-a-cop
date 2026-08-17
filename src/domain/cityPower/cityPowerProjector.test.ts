import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  cityPowerCanonicalId,
  cityPowerRuntimeActorId,
  findCityPowerIdentityMatch,
  redactCityPowerProtectedNames
} from './cityPowerIdentityLock';
import { projectCityPowerContext } from './cityPowerProjector';
import {
  cityPowerCanonicalId as cityPowerCanonicalIdFromIds,
  cityPowerRuntimeActorId as cityPowerRuntimeActorIdFromIds
} from './cityPowerIdentityIds';
import { hkLateColonialOrganizations } from './hkLateColonialOrganizations';
import { hkLateColonialCivilianOrganizations } from './hkLateColonialCivilianOrganizations';
import { hkLateColonialPowerFigures } from './hkLateColonialPowerFigures';
import type { CityOrganizationAnchor, CityPowerFigureAnchor } from './cityPowerTypes';
import { validateCityPowerAnchors } from './cityPowerValidator';

const figure: CityPowerFigureAnchor = {
  type: 'CityPowerFigureAnchor',
  canonicalSeedId: 'power_police_commissioner_li_man_bun',
  runtimeActorId: 'npc_power_power_police_commissioner_li_man_bun',
  displayName: '李君夏',
  englishName: 'Li Kwan-ha',
  recognitionAliases: ['李处长', '一哥李Sir'],
  protectedRealNames: [],
  category: 'police_command',
  activeYears: { from: 1985, to: 1989 },
  publicRole: '皇家香港警察高层指挥人物',
  affiliationOrganizationIds: ['org_hk_police'],
  relatedOrganizationIds: ['org_police_hq'],
  usualPlaceIds: ['place_police_headquarters_wan_chai'],
  accessRoutes: ['警队简报', '重大案件记者会', '内部通告'],
  promptSafeProfile: '警队最高层级的公开指挥人物，常以纪律、舆论和政治压力影响基层案件处理。',
  promptSafeHooks: ['记者会前内部口径变化', '重大案件指挥压力', '廉署关注警队纪律'],
  identityHooks: {
    police: '警察身份可通过内部通告、上级转述或重大案件会议听见李君夏。',
    civilian: '市民身份多从报纸、电视记者会和街坊议论中听见李君夏。',
    gang_member: '社团身份多把李君夏当成近期扫荡风向的象征。'
  },
  contactPolicy: 'restricted_contact',
  defaultVisibility: 'public',
  sourceConfidence: 'medium',
  copyRisk: 'medium',
  importance: 96
};

describe('city power identity lock', () => {
  it('creates stable canonical and runtime actor ids', () => {
    expect(cityPowerCanonicalId(figure)).toBe('power_police_commissioner_li_man_bun');
    expect(cityPowerRuntimeActorId('power_police_commissioner_li_man_bun')).toBe(
      'npc_power_power_police_commissioner_li_man_bun'
    );
  });

  it('keeps identity id helpers available from a no-data module and the lock module', () => {
    expect(cityPowerCanonicalIdFromIds(figure)).toBe(cityPowerCanonicalId(figure));
    expect(cityPowerRuntimeActorIdFromIds('power_police_commissioner_li_man_bun')).toBe(
      cityPowerRuntimeActorId('power_police_commissioner_li_man_bun')
    );
  });

  it('matches Chinese names, English names and aliases to one seed identity', () => {
    expect(findCityPowerIdentityMatch('李君夏', [figure])?.canonicalSeedId).toBe(
      'power_police_commissioner_li_man_bun'
    );
    expect(findCityPowerIdentityMatch('李处长', [figure])?.canonicalSeedId).toBe(
      'power_police_commissioner_li_man_bun'
    );
    expect(findCityPowerIdentityMatch('Li Kwan-ha', [figure])?.runtimeActorId).toBe(
      'npc_power_power_police_commissioner_li_man_bun'
    );
  });

  it('keeps canonical public names unchanged during legacy redaction handling', () => {
    const match = findCityPowerIdentityMatch('李君夏', [figure]);
    expect(match).toBeDefined();
    expect(redactCityPowerProtectedNames('李君夏在记者会上露面。', match!)).toBe('李君夏在记者会上露面。');
  });
});

describe('city power anchor validation', () => {
  it('validates the shipped late-colonial anchor batch', () => {
    const result = validateCityPowerAnchors(hkLateColonialOrganizations, hkLateColonialPowerFigures);

    expect(result.organizationCount).toBeGreaterThanOrEqual(41);
    expect(result.figureCount).toBeGreaterThanOrEqual(18);
    expect(result.errors).toEqual([]);
    expect(
      hkLateColonialPowerFigures.find(
        (item) => item.canonicalSeedId === 'power_police_commissioner_li_man_bun'
      )
    ).toMatchObject({
      displayName: '李君夏',
      englishName: 'Li Kwan-ha',
      protectedRealNames: []
    });
    expect(
      hkLateColonialPowerFigures.find((item) => item.canonicalSeedId === 'power_action_star_agent_choi_ming')
    ).toMatchObject({
      displayName: '蔡子明',
      englishName: 'Choi Chi-ming',
      protectedRealNames: []
    });
    expect(
      hkLateColonialPowerFigures.find((item) => item.canonicalSeedId === 'power_chief_secretary_fok_tak_ming')
    ).toMatchObject({
      displayName: '霍德',
      englishName: 'David Ford',
      recognitionAliases: ['霍德爵士', '布政司霍德'],
      protectedRealNames: []
    });
  });

  it('keeps the approved civilian-facing expansion complete and internally linked', () => {
    const organizationIds = new Set(hkLateColonialOrganizations.map((organization) => organization.organizationId));
    const relatedOrganizationIds = hkLateColonialOrganizations.flatMap(
      (organization) => organization.relatedOrganizationIds
    );

    expect(hkLateColonialCivilianOrganizations).toHaveLength(37);
    expect(
      hkLateColonialCivilianOrganizations
        .filter((organization) => organization.sectorTags.includes('court'))
        .map((organization) => organization.organizationId)
    ).toEqual(['org_hk_supreme_court', 'org_hk_district_court']);
    expect(relatedOrganizationIds.filter((organizationId) => !organizationIds.has(organizationId))).toEqual([]);
  });

  it('detects protected-name leakage in prompt-safe fields', () => {
    const result = validateCityPowerAnchors(
      hkLateColonialOrganizations,
      [
        {
          ...hkLateColonialPowerFigures[0]!,
          canonicalSeedId: 'power_bad_leak',
          runtimeActorId: 'npc_power_power_bad_leak',
          protectedRealNames: ['Legacy Hidden Name'],
          promptSafeProfile: 'Legacy Hidden Name appeared in a prompt field.'
        }
      ]
    );

    expect(result.errors.some((error) => error.includes('protected name leak'))).toBe(true);
  });

  it('detects missing organization references from power figures', () => {
    const result = validateCityPowerAnchors(hkLateColonialOrganizations, [
      {
        ...hkLateColonialPowerFigures[0]!,
        canonicalSeedId: 'power_missing_org',
        runtimeActorId: 'npc_power_power_missing_org',
        affiliationOrganizationIds: ['org_missing_city_power_anchor']
      }
    ]);

    expect(result.errors).toContain('power_missing_org: missing organization reference org_missing_city_power_anchor');
  });

  it('does not ship known broken place ids', () => {
    const organizationPlaceIds = hkLateColonialOrganizations.flatMap((organization) => [
      ...organization.headquartersPlaceIds,
      ...organization.territoryPlaceIds
    ]);
    const figurePlaceIds = hkLateColonialPowerFigures.flatMap((figure) => figure.usualPlaceIds);

    expect([...organizationPlaceIds, ...figurePlaceIds]).not.toContain('place_central_hsbc_building');
    const knownPlaceIds = new Set(Object.keys(createInitialRuntimeState().places));
    expect([...organizationPlaceIds, ...figurePlaceIds].filter((placeId) => !knownPlaceIds.has(placeId))).toEqual([]);
  });
});

describe('city power projection', () => {
  it('selects police command anchors for police identity and commissioner input', () => {
    const state = createInitialRuntimeState();
    state.player.currentIdentity = 'police';

    const projection = projectCityPowerContext(state, '我想查警务处处长最近有没有对旺角行动下指令。');

    expect(projection.figures.map((item) => item.category)).toContain('police_command');
    expect(projection.organizations.map((item) => item.organizationId)).toContain('org_hk_police');
    expect(projection.rules.join('\n')).toContain('CITY_POWER_IDENTITY_LOCK');
  });

  it('does not project hidden triad leadership to ordinary civilian context', () => {
    const state = createInitialRuntimeState();
    state.player.currentIdentity = 'civilian';

    const projection = projectCityPowerContext(state, '我在街市听到有人说胜和最近换人话事。');

    expect(projection.organizations.map((item) => item.organizationId)).toContain('org_wo_shing_wo');
    expect(projection.figures.some((item) => item.category === 'triad_leader' && item.visibility === 'hidden')).toBe(
      false
    );
  });

  it('allows gang identity to receive rumor-level triad figures without omniscient certainty', () => {
    const state = createInitialRuntimeState();
    state.player.currentIdentity = 'gang_member';

    const projection = projectCityPowerContext(state, '打听十四K龙头最近有没有同油麻地人马谈数。');

    expect(projection.figures.some((item) => item.category === 'triad_leader')).toBe(true);
    expect(projection.rules.join('\n')).toContain('do not promote rumor to confirmed fact');
  });

  it('reports missing organization references from custom projection figures', () => {
    const state = createInitialRuntimeState();
    const projection = projectCityPowerContext(state, '查警队高层。', {
      organizations: [hkLateColonialOrganizations[0]!],
      figures: [
        {
          ...hkLateColonialPowerFigures[0]!,
          affiliationOrganizationIds: ['org_hk_police', 'org_missing_projection_org'],
          relatedOrganizationIds: ['org_missing_projection_org', 'org_missing_projection_related_org']
        }
      ]
    });

    expect(projection.diagnostics.missingOrganizationRefs).toEqual([
      'org_missing_projection_org',
      'org_missing_projection_related_org'
    ]);
    expect(projection.diagnostics.missingOrganizationRefs).not.toContain('org_hk_police');
  });

  it('projects the four-exchange market in 1984 but not the later unified exchange', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1984, month: 12, day: 19, hour: 20, minute: 0 }
    });
    const projection = projectCityPowerContext(state, '我想了解四会股票市场今天的消息。');
    const organizationIds = projection.organizations.map((item) => item.organizationId);

    expect(organizationIds).toContain('org_hk_four_stock_exchanges');
    expect(organizationIds).not.toContain('org_hk_stock_exchange');
  });

  it('projects the unified stock exchange from 1986 without leaking the prior four-exchange anchor', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1986, month: 4, day: 2, hour: 9, minute: 0 }
    });
    const projection = projectCityPowerContext(state, '我去香港联合交易所打听上市消息。');
    const organizationIds = projection.organizations.map((item) => item.organizationId);

    expect(organizationIds).toContain('org_hk_stock_exchange');
    expect(organizationIds).not.toContain('org_hk_four_stock_exchanges');
  });

  it('filters projected figure organization references to currently projected organizations', () => {
    const state = createInitialRuntimeState();
    const visibleOrganization = hkLateColonialOrganizations[0]!;
    const hiddenOrganization: CityOrganizationAnchor = {
      ...visibleOrganization,
      organizationId: 'org_xqvb_hidden_ref',
      displayName: 'Hidden projection org',
      defaultVisibility: 'hidden'
    };
    const unprojectedOrganization: CityOrganizationAnchor = {
      ...visibleOrganization,
      organizationId: 'org_xqvb_unprojected_ref',
      displayName: 'ZZZ',
      englishName: undefined,
      disguisedNames: [],
      publicKnowledge: 'ZZZ',
      promptSafeProfile: 'ZZZ',
      headquartersPlaceIds: [],
      territoryPlaceIds: [],
      relatedOrganizationIds: [],
      sectorTags: [],
      influence: 1
    };

    const projection = projectCityPowerContext(state, 'Li Kwan-ha', {
      organizations: [visibleOrganization, hiddenOrganization, unprojectedOrganization],
      figures: [
        {
          ...hkLateColonialPowerFigures[0]!,
          affiliationOrganizationIds: ['org_hk_police', 'org_xqvb_hidden_ref', 'org_xqvb_missing_ref'],
          relatedOrganizationIds: ['org_xqvb_unprojected_ref', 'org_xqvb_missing_related_ref']
        }
      ]
    });

    const projectedFigure = projection.figures.find(
      (item) => item.canonicalSeedId === hkLateColonialPowerFigures[0]!.canonicalSeedId
    );

    expect(projection.diagnostics.selectedOrganizationIds).toContain('org_hk_police');
    expect(projection.diagnostics.selectedOrganizationIds).not.toContain('org_xqvb_hidden_ref');
    expect(projection.diagnostics.selectedOrganizationIds).not.toContain('org_xqvb_unprojected_ref');
    expect(projectedFigure).toBeDefined();
    expect(projectedFigure!.affiliationOrganizationIds).toEqual(['org_hk_police']);
    expect(projectedFigure!.relatedOrganizationIds).toEqual([]);
  });
});
