import { describe, expect, it } from 'vitest';
import { hkLateColonialOrganizations } from '../cityPower/hkLateColonialOrganizations';
import { PLAYER_POLICE_SALARY_CASHFLOW_ID } from '../finance/playerSalaryCashflow';
import { PLAYER_CIVILIAN_PRIMARY_INCOME_ID } from '../finance/playerCivilianIncomeCashflow';
import { policePromotionManifest } from '../dlc/policePromotion/content';
import { createInitialRuntimeState, withRuntimeDefaults } from './initialState';
import type { DeferredEventSourceModule, OrganizationStructureNode } from './types';

describe('initial runtime state', () => {
  it('uses the approved high Storypack influence and enabled screen-character defaults', () => {
    const state = createInitialRuntimeState();

    expect(state.world.storypackInfluence).toBe('high');
    expect(state.world.screenCharacterSeedsEnabled).toBe(true);
    expect(state.world.gameDifficulty).toBe('standard');
  });

  it('preserves a selected game difficulty and repairs legacy saves to standard', () => {
    expect(createInitialRuntimeState({ gameDifficulty: 'brutal' }).world.gameDifficulty).toBe(
      'brutal'
    );
    const legacy = createInitialRuntimeState();
    delete (legacy.world as Partial<typeof legacy.world>).gameDifficulty;

    expect(withRuntimeDefaults(legacy).world.gameDifficulty).toBe('standard');
  });

  it('migrates a legacy save without official DLC bindings to an explicit empty list', () => {
    const legacy = createInitialRuntimeState();
    delete (legacy.world as Partial<typeof legacy.world>).officialDlcBindings;

    const migrated = withRuntimeDefaults(legacy);

    expect(migrated.world.officialDlcBindings).toEqual([]);
  });

  it('backfills durable official DLC exposure from a legacy narrative arc', () => {
    const legacy = createInitialRuntimeState();
    const ref = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: 'official_dlc_urban_legends_hk1988_vacant_flat_calls',
      dlcId: 'urban_legends'
    };
    legacy.narrativeArcs = [{
      arcInstanceId: 'arc_legacy_vacant_flat',
      sourceRef: ref,
      arcType: 'official_dlc',
      status: 'active',
      currentStageId: 'street_rumor',
      usedNodeIds: [],
      createdTurn: 3,
      lastProgressTurn: 8,
      writebackRefs: []
    }];
    delete legacy.dramaticContent?.exposedOfficialDlcSourceRefs;

    const migrated = withRuntimeDefaults(legacy);

    expect(migrated.dramaticContent?.exposedOfficialDlcSourceRefs).toEqual([ref]);
  });

  it('locks a selected formal DLC into a new save while ignoring the frozen Alpha id', () => {
    const state = createInitialRuntimeState({
      officialDlcIds: ['urban_legends_alpha', 'urban_legends']
    });

    expect(state.world.officialDlcBindings).toEqual([{
      dlcId: 'urban_legends',
      version: '1.2.0',
      status: 'active',
      activatedAt: expect.any(String)
    }]);
  });

  it('activates police promotion only when a police new game explicitly selects the system DLC', () => {
    const unbound = createInitialRuntimeState({ currentIdentity: 'police' });
    const bound = createInitialRuntimeState({
      currentIdentity: 'police',
      officialDlcIds: [policePromotionManifest.dlcId]
    });

    expect(unbound.world.officialDlcBindings).toEqual([]);
    expect(unbound.policePanel.careerPath.promotionProgress).toBeUndefined();
    expect(bound.world.officialDlcBindings).toEqual([{
      dlcId: policePromotionManifest.dlcId,
      version: policePromotionManifest.version,
      status: 'active',
      activatedAt: expect.any(String)
    }]);
    expect(bound.policePanel.careerPath.promotionProgress).toEqual(
      expect.objectContaining({
        worldpackId: 'hk_1988',
        routeId: 'hk1988_pc_to_sgt',
        processStage: 'not_eligible'
      })
    );
  });

  it('repairs a legacy weather state with bounded recent condition history', () => {
    const legacy = createInitialRuntimeState();
    delete legacy.environment.recentConditions;

    const repaired = withRuntimeDefaults(legacy);

    expect(repaired.environment.weather).toEqual(legacy.environment.weather);
    expect(repaired.environment.recentConditions).toEqual([
      legacy.environment.weather.condition
    ]);
  });

  it('normalizes legacy actor recovery retry metadata without discarding the package', () => {
    const state = createInitialRuntimeState();
    state.pendingActorWritebackRecoveries = [
      {
        recoveryId: 'turn_0001:npc_test',
        sourceTurnId: 'turn_0001',
        sourceGameTime: { ...state.time },
        actorId: 'npc_test',
        writebackJson: '{"actorPatch":{"actorId":"npc_test"}}',
        attemptCount: -2
      }
    ];

    const repaired = withRuntimeDefaults(state);

    expect(repaired.pendingActorWritebackRecoveries).toEqual([
      expect.objectContaining({
        recoveryId: 'turn_0001:npc_test',
        attemptCount: 0,
        consecutiveFailureCount: 0
      })
    ]);
  });

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

  it('seeds differentiated society profiles, structures and activity areas', () => {
    const state = createInitialRuntimeState();
    const societyIds = ['org_sun_yee_on', 'org_wo_shing_wo', 'org_14k', 'org_shui_fong', 'org_wo_hop_to'];
    const societies = societyIds.map((organizationId) => state.organizations[organizationId]);

    expect(societies.every((organization) => organization?.triadProfile)).toBe(true);
    expect(societies.every((organization) => (organization?.triadProfile?.activityAreas.length ?? 0) >= 2)).toBe(true);
    expect(new Set(societies.map((organization) => organization?.triadProfile?.organizationStyle)).size).toBe(5);
    expect(new Set(societies.map((organization) => organization?.structureTree?.[0]?.label)).size).toBe(5);
    expect(state.organizations.org_14k?.structureTree?.[0]?.label).toBe('支系名义层');
    expect(state.organizations.org_wo_shing_wo?.structureTree?.[0]?.label).toBe('坐馆与议事层');
  });

  it('replaces only the untouched legacy generic society tree when runtime defaults are applied', () => {
    const legacy = createInitialRuntimeState();
    const organizationId = 'org_14k';
    const legacyTree: OrganizationStructureNode[] = [
      {
        nodeId: `${organizationId}_seat`,
        label: '坐馆',
        role: '最高话事层',
        personName: '未知',
        status: '未知',
        confidence: 'unknown',
        children: [
          {
            nodeId: `${organizationId}_elders`,
            label: '叔父辈',
            role: '老一辈协调',
            personName: '未知',
            status: '未知',
            confidence: 'unknown',
            children: []
          },
          {
            nodeId: `${organizationId}_district_heads`,
            label: '地区话事人',
            role: '地区/生意线负责人',
            personName: '未知',
            status: '未知',
            confidence: 'unknown',
            children: [
              {
                nodeId: `${organizationId}_outer_members`,
                label: '外围成员',
                role: '外围执行与街面接触',
                personName: '未知',
                status: '未知',
                confidence: 'unknown',
                children: []
              }
            ]
          }
        ]
      }
    ];
    legacy.organizations[organizationId].structureTree = legacyTree;
    delete legacy.organizations[organizationId].triadProfile;
    delete legacy.organizations[organizationId].triadState;

    const repaired = withRuntimeDefaults(legacy);

    expect(repaired.organizations[organizationId].structureTree?.[0]?.label).toBe('支系名义层');
    expect(repaired.organizations[organizationId].triadProfile?.organizationStyle).toContain('支系');
    expect(repaired.organizations[organizationId].triadState?.activityAreas).toHaveLength(3);
  });

  it('preserves a society structure that has already been learned through play', () => {
    const state = createInitialRuntimeState();
    state.organizations.org_14k.structureTree = [
      {
        nodeId: 'org_14k_known_branch',
        label: '九龙支系',
        role: '已知地区线',
        personName: '陈广胜',
        status: '仍在活动',
        confidence: 'medium',
        children: []
      }
    ];

    const repaired = withRuntimeDefaults(state);

    expect(repaired.organizations.org_14k.structureTree?.[0]).toMatchObject({
      nodeId: 'org_14k_known_branch',
      personName: '陈广胜'
    });
  });

  it('attaches a civilian employer without leaking a police organization relation', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });

    expect(state.actors.player.organizationRelations).toEqual([
      expect.objectContaining({
        organizationId: 'org_opening_fa_yuen_tea_house',
        relationType: 'employee',
        isPrimary: true
      })
    ]);
    expect(state.actors.player.organizationRelations).not.toContainEqual(
      expect.objectContaining({ organizationId: 'org_hk_police' })
    );
    expect(state.actors.player.organizationIds).toEqual(['org_opening_fa_yuen_tea_house']);
    expect(state.organizations.org_opening_fa_yuen_tea_house?.relatedActorIds).toContain('player');
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
    expect(playerActor.organizationIds).toEqual(['org_opening_yau_ma_tei_logistics_firm']);
    expect(playerActor.organizationRelations).toEqual([
      expect.objectContaining({
        organizationId: 'org_opening_yau_ma_tei_logistics_firm',
        relationType: 'contractor'
      })
    ]);
    expect(state.location).toEqual({
      currentPlaceId: 'place_yau_ma_tei_fruit_market',
      currentSceneId: 'scene_opening_civilian_workplace'
    });
    expect(state.lawIdentity.status).toBe('none');
    expect(state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]).toBeUndefined();
    expect(state.finance.cashflows[PLAYER_CIVILIAN_PRIMARY_INCOME_ID]).toBeUndefined();
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
    expect(state.finance.cashflows[PLAYER_CIVILIAN_PRIMARY_INCOME_ID]).toBeUndefined();
    expect(playerActor.organizationRelations).toEqual([]);
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
    expect(playerActor.organizationRelations).toEqual([]);
  });

  it('activates a real middle-class employer and deterministic civilian salary', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'bank_employee'
    });

    expect(state.actors.player.organizationRelations).toEqual([
      expect.objectContaining({
        organizationId: 'org_hsbc',
        relationType: 'employee',
        roleTitle: '汇丰银行文员'
      })
    ]);
    expect(state.organizations.org_hsbc).toMatchObject({
      name: '香港上海汇丰银行',
      type: 'finance',
      relatedActorIds: ['player']
    });
    expect(state.finance.cashflows[PLAYER_CIVILIAN_PRIMARY_INCOME_ID]).toMatchObject({
      kind: 'salary',
      amount: 3200,
      identityBinding: 'civilian',
      status: 'active'
    });
  });

  it('models a self-employed shop as a bounded local organization and asset income', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'self_employed_merchant'
    });

    expect(state.actors.player.organizationRelations[0]).toMatchObject({
      organizationId: 'org_opening_player_shop',
      relationType: 'owner'
    });
    expect(state.organizations.org_opening_player_shop?.summary).toContain('本存档开局生成的本地雇主');
    expect(state.finance.cashflows[PLAYER_CIVILIAN_PRIMARY_INCOME_ID]).toMatchObject({
      kind: 'asset_income',
      amount: 4000,
      identityBinding: 'civilian'
    });
  });

  it('creates a custom local employer relation without inventing a fixed salary', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'custom_occupation',
      civilianCustomProfile: {
        publicOccupation: '摄影助理',
        workplacePlaceId: 'place_broadcast_drive',
        workplaceLabel: '广播道',
        employerName: '明光摄影社'
      }
    });

    expect(state.actors.player.organizationRelations[0]).toMatchObject({
      organizationId: 'org_player_custom_employer',
      roleTitle: '摄影助理'
    });
    expect(state.organizations.org_player_custom_employer?.name).toBe('明光摄影社');
    expect(state.finance.cashflows[PLAYER_CIVILIAN_PRIMARY_INCOME_ID]).toBeUndefined();
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

  it('projects an EU posting and role boundary through the existing player, law identity, and police panel', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      policePostingId: 'eu_kowloon_west',
      lawIdentity: {
        stationOrPost: 'Emergency Unit Kowloon West（西九龙总区冲锋队）',
        department: 'Emergency Unit（冲锋队 EU）',
        rank: 'Sergeant（警长 SGT）',
        assignmentSummary: 'Emergency Vehicle Commander（冲锋车车长）',
        authoritySummary: '可指挥本冲锋车车组并提出增援请求，但不能独立指挥整个 EU 小队或跨部门重大行动。',
        accessSummary: '可接触本车任务详情、当值调派和现场初步指挥资料。',
        dutySummary: '车辆指挥、任务判断、车组部署、现场初动、无线电汇报和增援请求。'
      }
    });

    expect(state.location).toEqual({
      currentPlaceId: 'place_mong_kok_police_station',
      currentSceneId: 'scene_opening_eu_duty_room'
    });
    expect(state.actors.player.currentSceneId).toBe('scene_opening_eu_duty_room');
    expect(state.lawIdentity).toMatchObject({
      stationOrPost: 'Emergency Unit Kowloon West（西九龙总区冲锋队）',
      department: 'Emergency Unit（冲锋队 EU）',
      assignmentSummary: 'Emergency Vehicle Commander（冲锋车车长）',
      authoritySummary: expect.stringContaining('可指挥本冲锋车车组'),
      accessSummary: expect.stringContaining('本车任务详情'),
      dutySummary: expect.stringContaining('车辆指挥')
    });
    expect(state.actors.player.roleProfiles.police).toMatchObject({
      stationOrPost: 'Emergency Unit Kowloon West（西九龙总区冲锋队）',
      department: 'Emergency Unit（冲锋队 EU）',
      assignmentSummary: 'Emergency Vehicle Commander（冲锋车车长）',
      authoritySummary: expect.stringContaining('可指挥本冲锋车车组')
    });
    expect(state.policePanel.localChain).toEqual([
      '皇家香港警察',
      '西九龙总区冲锋队',
      '冲锋队（EU）',
      '警长（SGT） / 冲锋车车长'
    ]);
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

  it('repairs stale actor age caches when a legacy save is loaded', () => {
    const legacy = createInitialRuntimeState({
      birthDate: '1972-01-15',
      startTime: { year: 1989, month: 2, day: 1, hour: 12, minute: 0 }
    });
    legacy.actors.player.computedAge = 90;

    const repaired = withRuntimeDefaults(legacy);

    expect(repaired.player.birthDate).toBe('1972-01-15');
    expect(repaired.actors.player.birthDate).toBe('1972-01-15');
    expect(repaired.actors.player.computedAge).toBe(17);
  });

  it('uses the player profile birth date as the authority when a legacy player actor conflicts', () => {
    const legacy = createInitialRuntimeState({
      birthDate: '1972-01-15',
      startTime: { year: 1989, month: 2, day: 1, hour: 12, minute: 0 }
    });
    legacy.actors.player.birthDate = '1940-01-01';
    legacy.actors.player.computedAge = 49;

    const repaired = withRuntimeDefaults(legacy);

    expect(repaired.player.birthDate).toBe('1972-01-15');
    expect(repaired.actors.player.birthDate).toBe('1972-01-15');
    expect(repaired.actors.player.computedAge).toBe(17);
  });

  it('recovers a missing profile birth date from the player actor in a legacy save', () => {
    const legacy = createInitialRuntimeState({
      birthDate: '1972-01-15',
      startTime: { year: 1989, month: 2, day: 1, hour: 12, minute: 0 }
    });
    delete (legacy.player as Partial<typeof legacy.player>).birthDate;

    const repaired = withRuntimeDefaults(legacy);

    expect(repaired.player.birthDate).toBe('1972-01-15');
    expect(repaired.actors.player.computedAge).toBe(17);
  });
});
