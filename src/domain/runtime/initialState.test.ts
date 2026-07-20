import { describe, expect, it } from 'vitest';
import { hkLateColonialOrganizations } from '../cityPower/hkLateColonialOrganizations';
import { PLAYER_POLICE_SALARY_CASHFLOW_ID } from '../finance/playerSalaryCashflow';
import { createInitialRuntimeState, withRuntimeDefaults } from './initialState';
import type { DeferredEventSourceModule } from './types';

describe('initial runtime state', () => {
  it('seeds public institutions, major society dossiers and player police relation', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      lawIdentity: {
        rank: 'Senior Constable (SPC)',
        stationOrPost: 'Mong Kok Police Station',
        department: 'Uniform Branch',
        assignmentSummary: 'Street patrol'
      }
    });

    expect(Object.keys(state.organizations).sort()).toEqual([
      'org_14k',
      'org_government_house',
      'org_hk_police',
      'org_icac',
      'org_legal_department',
      'org_shui_fong',
      'org_sun_yee_on',
      'org_tvb',
      'org_wo_hop_to',
      'org_wo_shing_wo'
    ]);
    expect(state.organizations.org_icac?.type).toBe('icac');
    expect(state.organizations.org_legal_department?.type).toBe('legal');
    expect(state.organizations.org_tvb?.type).toBe('media');
    expect(state.organizations.org_sun_yee_on?.type).toBe('triad');
    expect(state.organizations.org_14k?.visibility).toBe('public');

    expect(state.actors.player.organizationIds).toContain('org_hk_police');
    expect(state.actors.player.organizationRelations).toEqual([
      {
        organizationId: 'org_hk_police',
        relationType: 'employee',
        roleTitle: 'Senior Constable (SPC)',
        departmentOrUnit: 'Mong Kok Police Station',
        summary: 'Street patrol',
        visibility: 'player_known',
        isPrimary: true
      }
    ]);
  });

  it('derives initial major society dossiers from city power anchors and the selected opening year', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      startTime: { year: 1984, month: 12, day: 19, hour: 20, minute: 0 }
    });
    const anchor = hkLateColonialOrganizations.find((organization) => organization.organizationId === 'org_sun_yee_on');

    expect(anchor).toBeDefined();
    expect(state.organizations.org_sun_yee_on?.summary).toBe(anchor?.promptSafeProfile);
    expect(state.organizations.org_sun_yee_on?.publicKnowledge).toBe(anchor?.publicKnowledge);
    expect(state.organizations.org_sun_yee_on?.relatedPlaceIds).toEqual(
      expect.arrayContaining([...(anchor?.headquartersPlaceIds ?? []), ...(anchor?.territoryPlaceIds ?? [])])
    );
    expect(state.organizations.org_sun_yee_on?.currentState).toContain('1984年');
    expect(state.organizations.org_sun_yee_on?.currentState).not.toContain('1988年');
  });

  it('does not attach a police organization relation to non-police starts', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });

    expect(state.actors.player.organizationRelations).toEqual([]);
    expect(state.actors.player.organizationIds).toEqual([]);
    expect(state.organizations.org_hk_police).toBeDefined();
  });

  it('routes a civilian start through the selected livelihood without leaking police defaults', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'market_transport_helper',
      playerName: '刘启',
      policeNumber: '9527'
    });
    const playerActor = state.actors.player;

    expect(state.player.currentIdentity).toBe('civilian');
    expect(state.player.originIdentity).toBe('civilian');
    expect(state.player.identityHistory).toEqual([]);
    expect(state.player.policeNumber).toBeUndefined();
    expect(playerActor.policeNumber).toBeUndefined();
    expect(playerActor.callName).toBe('刘启');
    expect(playerActor.publicIdentity).toBe('油麻地果栏运输帮工');
    expect(playerActor.roleProfiles.civilian).toMatchObject({
      status: 'active',
      publicOccupation: '油麻地果栏运输帮工',
      workplacePlaceId: 'place_yau_ma_tei_fruit_market'
    });
    expect(playerActor.roleProfiles.police).toBeUndefined();
    expect(playerActor.organizationIds).toEqual([]);
    expect(state.location).toEqual({
      currentPlaceId: 'place_yau_ma_tei_fruit_market',
      currentSceneId: 'scene_opening_civilian_workplace'
    });
    expect(state.lawIdentity.status).toBe('none');
    expect(state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]).toBeUndefined();
    expect(state.secretFacts).toEqual({});
  });

  it('keeps an unemployed civilian free of a fabricated employer or police salary', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'unemployed',
      playerName: '刘启'
    });
    const playerActor = state.actors.player;

    expect(playerActor.publicIdentity).toBe('暂时无业');
    expect(playerActor.roleProfiles.civilian).toMatchObject({
      publicOccupation: '暂时无业',
      workplacePlaceId: 'place_fa_yuen_street',
      familyEconomicSummary: expect.stringContaining('没有固定薪水')
    });
    expect(state.location.currentSceneId).toBe('scene_opening_civilian_daily_life');
    expect(state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]).toBeUndefined();
  });

  it('uses a custom civilian occupation and stable worldpack place as opening facts', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'custom_occupation',
      civilianCustomProfile: {
        publicOccupation: '自由摄影师',
        workplacePlaceId: 'place_broadcast_drive',
        workplaceLabel: '广播道',
        communitySummary: '常接触记者、冲印店和夜场宣传人员。'
      }
    });
    const playerActor = state.actors.player;

    expect(playerActor.publicIdentity).toBe('自由摄影师');
    expect(playerActor.roleProfiles.civilian).toMatchObject({
      publicOccupation: '自由摄影师',
      workplacePlaceId: 'place_broadcast_drive',
      communitySummary: '常接触记者、冲印店和夜场宣传人员。'
    });
    expect(state.location.currentPlaceId).toBe('place_broadcast_drive');
  });

  it('routes a triad start through the selected society, territory and public role', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'gang_member',
      triadSocietyId: 'org_wo_hop_to',
      triadTerritoryPlaceId: 'place_temple_street_night_market',
      triadRankId: 'crew_lead',
      triadRoleId: 'crew_coordinator',
      playerName: '刘启',
      policeNumber: '9527'
    });
    const playerActor = state.actors.player;

    expect(state.player.currentIdentity).toBe('gang_member');
    expect(state.player.originIdentity).toBe('gang_member');
    expect(state.player.policeNumber).toBeUndefined();
    expect(playerActor.publicIdentity).toBe('和合图 · 小组带头人 · 小组事务协调');
    expect(playerActor.roleProfiles.triad).toMatchObject({
      status: 'active',
      organizationId: 'org_wo_hop_to',
      societyName: '和合图',
      roleTitle: '小组事务协调',
      rankSummary: '小组带头人',
      territorySummary: expect.stringContaining('庙街夜市及其周边活动线')
    });
    expect(playerActor.organizationIds).toEqual(['org_wo_hop_to']);
    expect(playerActor.organizationRelations).toEqual([
      expect.objectContaining({
        organizationId: 'org_wo_hop_to',
        relationType: 'member',
        roleTitle: '小组带头人 · 小组事务协调',
        isPrimary: true
      })
    ]);
    expect(state.location).toEqual({
      currentPlaceId: 'place_temple_street_night_market',
      currentSceneId: 'scene_opening_triad_street'
    });
    expect(state.lawIdentity.status).toBe('none');
    expect(state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]).toBeUndefined();
    expect(state.organizations.org_wo_hop_to?.relatedActorIds).toContain('player');
  });

  it('routes a police start to the selected posting instead of always using Mong Kok', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      policePostingId: 'wan_chai_police_station'
    });

    expect(state.location.currentPlaceId).toBe('place_wan_chai_police_station');
    expect(state.actors.player.currentPlaceId).toBe('place_wan_chai_police_station');
  });

  it('repairs legacy identity defaults from the player source of truth', () => {
    const legacy = createInitialRuntimeState({ currentIdentity: 'civilian' });
    delete (legacy.player as Partial<typeof legacy.player>).originIdentity;
    delete (legacy.player as Partial<typeof legacy.player>).identityHistory;
    delete (legacy as Partial<typeof legacy>).secretFacts;
    legacy.actors.player.currentIdentity = 'police';

    const repaired = withRuntimeDefaults(legacy);

    expect(repaired.player.originIdentity).toBe('civilian');
    expect(repaired.player.identityHistory).toEqual([]);
    expect(repaired.secretFacts).toEqual({});
    expect(repaired.actors.player.currentIdentity).toBe('civilian');
  });

  it('seeds an empty dynamic events state for current matters, signals and newspapers', () => {
    const state = createInitialRuntimeState();

    expect(state.dynamicEvents).toEqual({
      currentMatters: {},
      signals: {},
      newsIssues: {}
    });
  });

  it('seeds empty relationship threads', () => {
    const state = createInitialRuntimeState();

    expect(state.relationshipThreads).toEqual({});
  });

  it('seeds runtime environment weather from game time', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 7, day: 10, hour: 21, minute: 0 }
    });

    expect(state.environment.weather.source).toBe('seasonal');
    expect(state.environment.weather.label).toBeTruthy();
    expect(state.environment.weather.impactSummary).toBeTruthy();
    expect(state.environment.weather.validUntil).toBeDefined();
  });

  it('allows deferred narrative events to come from dynamic-facing modules', () => {
    const allowedSources: DeferredEventSourceModule[] = [
      'case',
      'npc',
      'news',
      'finance',
      'faction',
      'police',
      'world',
      'organization',
      'grayNetwork',
      'reputation',
      'storypack',
      'dynamic',
      'relationship'
    ];

    expect(allowedSources).toContain('dynamic');
    expect(allowedSources).toContain('relationship');
  });
});
