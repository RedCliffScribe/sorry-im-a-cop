import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState, withRuntimeDefaults } from './initialState';
import { getCurrentPlace, getCurrentScene, getPresentActors, getVisibleActors } from './selectors';
import type { RuntimeState } from './types';

describe('runtime state', () => {
  it('creates an initial Hong Kong 1988 state with player, place, and time', () => {
    const state = createInitialRuntimeState();

    expect(state.world.worldpackId).toBe('hk_1988');
    expect(state.player.name).toBe('');
    expect(state.time.year).toBe(1988);
    expect(state.location.currentPlaceId).toBe('place_mong_kok_police_station');
    expect(state.player.economy.bankBalance).toBe(0);
    expect(state.player.economy.financeSummary).toContain('开局待生成');
    expect(state.player.reputation.notoriety).toBe(0);
    expect(state.player.reputation.overallReputation).toBe(0);
    expect(state.player.reputation.circles.police.visibility).toBeGreaterThanOrEqual(0);
    expect(state.player.reputation.circles.neighborhoodMedia.standing).toBe(0);
    expect(state.player.homeBase.summary).toContain('开局待生成');
    expect(state.player.vitals.health).toBe(100);
    expect(state.player.vitals.stamina).toBe(100);
    expect(state.actors.player.vitals?.conditionSummary).toContain('状态正常');
    expect(state.player.vitals.conditionLifecycle).toEqual({
      persistence: 'stable',
      establishedAt: state.time,
      lastReviewedAt: state.time
    });
    expect(state.grayLedger).toEqual([]);
    expect(state.grayNetworks).toEqual({ byAreaId: {} });
  });

  it('keeps an old non-default condition eligible for review while mirroring player and actor on load', () => {
    const legacy = createInitialRuntimeState();
    legacy.player.vitals = {
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      conditionSummary: '熬夜值守一整晚后精神松弛，强烈的疲惫感。'
    };
    legacy.actors.player.vitals = {
      ...legacy.player.vitals,
      conditionSummary: '已经过时的 Actor 副本。'
    };

    const loaded = withRuntimeDefaults(legacy);

    expect(loaded.player.vitals.conditionLifecycle).toBeUndefined();
    expect(loaded.actors.player.vitals).toEqual(loaded.player.vitals);
    expect(loaded.player.vitals.conditionSummary).toContain('强烈的疲惫感');
  });

  it('migrates legacy overall reputation once and keeps repeated loads idempotent', () => {
    const legacy = createInitialRuntimeState({ currentIdentity: 'civilian' });
    legacy.player.reputation.overallReputation = 20;
    delete legacy.player.reputation.overallReputationBaseline;
    legacy.player.reputation.circles.business = {
      visibility: 100,
      standing: -20,
      summary: '商业圈评价已经转差。'
    };

    const firstLoad = withRuntimeDefaults(legacy);
    const secondLoad = withRuntimeDefaults(firstLoad);

    expect(firstLoad.player.reputation.overallReputationBaseline).toBe(60);
    expect(firstLoad.player.reputation.overallReputation).toBe(20);
    expect(secondLoad.player.reputation.overallReputation).toBe(20);
    expect(secondLoad.player.reputation.overallReputationBaseline).toBe(60);
  });

  it('creates finance defaults for new runtime states', () => {
    const state = createInitialRuntimeState();

    expect(state.finance.bankBalance).toBe(0);
    expect(state.finance.cashflows.cashflow_player_police_salary).toMatchObject({
      direction: 'income',
      kind: 'salary',
      title: '警队月薪',
      amount: 4200,
      activeFromMonth: state.finance.lastSettledMonthKey,
      relatedActorIds: ['player'],
      source: 'opening',
      status: 'active',
      visibility: 'player_known'
    });
    expect(state.finance.ledger).toEqual([]);
    expect(state.finance.reports).toEqual([]);
    expect(state.finance.lastSettledMonthKey).toMatch(/^\d{4}-\d{2}$/);
    expect(state.player.economy.bankBalance).toBe(state.finance.bankBalance);
  });

  it('uses era-specific police salary estimates for new runtime states', () => {
    const earlyState = createInitialRuntimeState({
      currentIdentity: 'police',
      startTime: { year: 1980, month: 3, day: 1, hour: 9, minute: 0 },
      lawIdentity: {
        rank: 'Constable（警员 PC）'
      }
    });
    const lateInspectorState = createInitialRuntimeState({
      currentIdentity: 'police',
      startTime: { year: 1994, month: 6, day: 1, hour: 9, minute: 0 },
      lawIdentity: {
        rank: 'Inspector（督察）'
      }
    });

    expect(earlyState.finance.cashflows.cashflow_player_police_salary.amount).toBe(3300);
    expect(lateInspectorState.finance.cashflows.cashflow_player_police_salary.amount).toBe(9800);
  });

  it('updates the police salary cashflow when the player is promoted', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
      lawIdentity: {
        rank: 'Constable（警员 PC）'
      }
    });
    state.time = { year: 1988, month: 10, day: 1, hour: 9, minute: 0 };
    state.lawIdentity = {
      ...state.lawIdentity,
      rank: 'Sergeant（警长 SGT）'
    };

    const normalized = withRuntimeDefaults(state);

    expect(normalized.finance.cashflows.cashflow_player_police_salary).toMatchObject({
      amount: 5200,
      activeFromMonth: '1988-10',
      status: 'active'
    });
    expect(normalized.finance.cashflows.cashflow_player_police_salary.summary).toContain('Sergeant');
  });

  it('does not create police salary cashflow for non-police opening identities', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian'
    });

    expect(state.finance.cashflows.cashflow_player_police_salary).toBeUndefined();
  });

  it('normalizes older runtime states without finance', () => {
    const state = createInitialRuntimeState();
    const legacy = {
      ...state,
      finance: undefined,
      player: {
        ...state.player,
        economy: {
          ...state.player.economy,
          money: 2350,
          financeSummary: '工资刚够用。'
        }
      }
    } as unknown as RuntimeState;

    const normalized = withRuntimeDefaults(legacy);

    expect(normalized.finance.bankBalance).toBe(2350);
    expect(normalized.finance.summary).toBe('工资刚够用。');
    expect(normalized.finance.cashflows.cashflow_player_police_salary).toMatchObject({
      direction: 'income',
      kind: 'salary',
      amount: 4200,
      status: 'active'
    });
    expect(normalized.player.economy.bankBalance).toBe(2350);
  });

  it('normalizes older civilian role profiles without livelihood arrays', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'hospital_nurse'
    });
    const civilian = state.actors.player.roleProfiles.civilian!;
    const legacy = {
      ...state,
      actors: {
        ...state.actors,
        player: {
          ...state.actors.player,
          roleProfiles: {
            ...state.actors.player.roleProfiles,
            civilian: {
              ...civilian,
              sectorIds: undefined,
              roleTags: undefined,
              livelihoodActorIds: undefined
            }
          }
        }
      }
    } as unknown as RuntimeState;

    const normalized = withRuntimeDefaults(legacy);

    expect(normalized.actors.player.roleProfiles.civilian).toMatchObject({
      sectorIds: [],
      roleTags: [],
      livelihoodActorIds: []
    });
  });

  it('creates an initial state from opening setup choices', () => {
    const state = createInitialRuntimeState({
      playerName: '陈启明',
      englishName: 'Michael Chan',
      gender: 'male',
      age: 25,
      policeNumber: '9527',
      currentIdentity: 'police',
      originBackground: {
        originBackgroundId: 'mainland_newcomer_family',
        name: '大陆新移民家庭',
        definition: '家中有人从内地来港，身份、口音、工作和归属感都带着压力。',
        backgroundSummary: 'LLM 可生成亲属、落脚屋邨、移民手续、人情担保和被本地街坊试探的早期关系。'
      },
      personality: '谨慎，愿意听人说完再判断。',
      appearance: '短发，制服整洁，眼神疲惫。',
      cantoneseFlavor: 'heavy',
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
      storypackInfluence: 'high',
      lawIdentity: {
        stationOrPost: '油麻地警署',
        department: 'Criminal Investigation Department（刑事侦缉处 CID）',
        rank: 'Inspector（督察）',
        assignmentSummary: 'Case Officer（案件负责人）'
      },
      attributes: {
        body: 55,
        action: 62,
        perception: 64,
        thinking: 52,
        negotiation: 58,
        will: 59
      },
      traits: [
        {
          traitId: 'trait_steady_hands',
          name: '枪法稳',
          source: 'opening',
          description: '射击训练成绩稳定。',
          effectSummary: '枪械、威慑和危险场景判定时获得稳定性参考。',
          scopes: ['firearms', 'danger'],
          status: 'active',
          visibility: 'player_known'
        }
      ],
      openingNote: '希望开局就有一个旧同学牵出的麻烦。'
    });

    expect(state.player.name).toBe('陈启明');
    expect(state.player.englishName).toBe('Michael Chan');
    expect(state.player.policeNumber).toBe('9527');
    expect(state.player.birthDate).toBe('1963-09-12');
    expect(state.player.originBackground.name).toBe('大陆新移民家庭');
    expect(state.player.originBackground.backgroundSummary).toContain('亲属');
    expect(state.player.cantoneseFlavor).toBe('heavy');
    expect(state.actors.player.computedAge).toBe(25);
    expect(state.actors.player.entanglementSummary).toContain('大陆新移民家庭');
    expect(state.actors.player.longTermMemorySummary).toContain('亲属');
    expect(state.player.attributes.perception).toBe(64);
    expect(state.player.activeTraits.map((trait) => trait.name)).toContain('枪法稳');
    expect(state.world.storypackInfluence).toBe('high');
    expect(state.time.hour).toBe(21);
    expect(state.lawIdentity.stationOrPost).toBe('油麻地警署');
    expect(state.lawIdentity.department).toBe('Criminal Investigation Department（刑事侦缉处 CID）');
    expect(state.lawIdentity.rank).toBe('Inspector（督察）');
    expect(state.lawIdentity.assignmentSummary).toBe('Case Officer（案件负责人）');
    expect(state.actors.player.name).toBe('陈启明');
    expect(state.actors.player.englishName).toBe('Michael Chan');
    expect(state.actors.player.policeNumber).toBe('9527');
    expect(state.actors.player.aliases).toContain('Michael Chan');
    expect(state.actors.player.aliases).toContain('9527');
    expect(state.actors.player.longTermMemorySummary).toContain('警员编号9527');
    expect(state.actors.player.speechStyle).toContain('对白较多使用粤语表达');
    expect(state.actors.player.longTermMemorySummary).toContain('对白风味');
    expect(Object.values(state.memories).map((memory) => memory.text)).toContain('开局额外要求：希望开局就有一个旧同学牵出的麻烦。');
  });

  it('leaves English name empty when omitted so the opening LLM can generate it', () => {
    const state = createInitialRuntimeState({
      playerName: '陈启明',
      englishName: ''
    });

    expect(state.player.englishName).toBeUndefined();
    expect(state.actors.player.englishName).toBeUndefined();
    expect(state.actors.player.aliases).not.toContain('Michael Chan');
    expect(state.actors.player.longTermMemorySummary).toContain('开局需要 LLM 根据中文名生成英文名');
  });

  it('leaves incomplete police numbers unset so the opening LLM can generate four digits', () => {
    const state = createInitialRuntimeState({
      policeNumber: '123'
    });

    expect(state.player.policeNumber).toBeUndefined();
    expect(state.actors.player.policeNumber).toBeUndefined();
    expect(state.actors.player.recentInteractionMemory).toContain('生成四位数字警员编号');
  });

  it('selects present actors without exposing hidden mentioned-only actors', () => {
    const state = createInitialRuntimeState();
    const hiddenActor = {
      ...state.actors.player,
      actorId: 'hidden_actor',
      name: 'Hidden Informant',
      presence: 'mentioned',
      visibility: 'hidden'
    } as const;

    state.actors = {
      ...state.actors,
      hidden_actor: hiddenActor
    };

    expect(getPresentActors(state).map((actor) => actor.actorId)).toContain('player');
    expect(getPresentActors(state).map((actor) => actor.actorId)).not.toContain('hidden_actor');
    expect(getVisibleActors(state).map((actor) => actor.actorId)).toContain('player');
    expect(getVisibleActors(state).map((actor) => actor.actorId)).not.toContain('hidden_actor');
  });

  it('resolves the current place and scene from the initial state', () => {
    const state = createInitialRuntimeState();

    expect(getCurrentPlace(state)?.name).toBe('旺角警署');
    expect(getCurrentScene(state)?.name).toBe('报案室');
  });

  it('creates isolated initial state objects across factory calls and nested player data', () => {
    const firstState = createInitialRuntimeState();
    const secondState = createInitialRuntimeState();

    firstState.time.year = 1997;
    firstState.actors.player.lastSeenAt!.hour = 23;
    firstState.actors.player.attributes.body = 1;
    firstState.actors.player.aliases.push('leaked alias');
    firstState.storyLog[0].gameTime.minute = 59;

    expect(secondState.time.year).toBe(1988);
    expect(secondState.actors.player.lastSeenAt?.hour).toBe(8);
    expect(secondState.actors.player.attributes.body).toBe(50);
    expect(secondState.actors.player.aliases).toEqual([]);
    expect(secondState.storyLog[0].gameTime.minute).toBe(30);
    expect(firstState.player.attributes.body).toBe(50);
  });

  it('fills newly added player fields on older runtime saves', () => {
    const oldState = createInitialRuntimeState() as any;
    delete oldState.player.economy;
    delete oldState.player.reputation;
    delete oldState.player.homeBase;
    delete oldState.player.vitals;
    delete oldState.actors.player.vitals;
    delete oldState.grayLedger;
    delete oldState.grayNetworks;

    const migrated = withRuntimeDefaults(oldState);

    expect(migrated.player.economy.financeSummary).toContain('开局待生成');
    expect(migrated.player.reputation.summary).toContain('尚未形成');
    expect(migrated.player.reputation.circles.police.summary).toContain('新人');
    expect(migrated.player.homeBase.summary).toContain('开局待生成');
    expect(migrated.player.vitals.health).toBe(100);
    expect(migrated.actors.player.vitals?.stamina).toBe(100);
    expect(migrated.grayLedger).toEqual([]);
    expect(migrated.grayNetworks).toEqual({ byAreaId: {} });
  });

  it('migrates older states with a generated home base into fixed assets and rent cashflow', () => {
    const oldState = createInitialRuntimeState() as RuntimeState;
    oldState.player.homeBase = {
      placeId: 'place_sham_shui_po_tenement_room',
      placeName: '深水埗唐楼住处',
      housingType: '唐楼分租房',
      summary: '深水埗一间狭窄唐楼房间，楼下是杂货铺和茶餐厅。',
      householdSummary: '与母亲同住，弟弟偶尔回来借钱。'
    };
    oldState.assets = { items: {}, equippedItemIds: [] };
    oldState.finance = {
      ...oldState.finance,
      cashflows: {}
    };

    const migrated = withRuntimeDefaults(oldState);

    expect(migrated.assets.items.asset_player_home).toMatchObject({
      category: 'fixedAsset',
      fixedAssetType: 'residence',
      holdingRelation: 'rented',
      primaryUse: 'home',
      placeId: 'place_sham_shui_po_tenement_room',
      expenseSettlementItemIds: ['cashflow_player_home_rent']
    });
    expect(migrated.finance.cashflows.cashflow_player_home_rent).toMatchObject({
      direction: 'expense',
      kind: 'rent',
      relatedAssetItemIds: ['asset_player_home'],
      relatedPlaceIds: ['place_sham_shui_po_tenement_room'],
      status: 'active'
    });
    expect(migrated.finance.cashflows.cashflow_player_police_salary).toMatchObject({
      direction: 'income',
      kind: 'salary',
      status: 'active'
    });
  });

  it('creates player actors with role profiles while keeping vitals as player-only state', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      lawIdentity: {
        stationOrPost: 'Mong Kok Police Station',
        department: 'Uniform Branch',
        rank: 'Senior Constable (SPC)',
        assignmentSummary: 'Response Officer'
      }
    });

    const playerActor = state.actors.player;

    expect(playerActor.actualIdentitySummary).toBe(playerActor.publicIdentity);
    expect(playerActor.roleProfiles.police?.rank).toBe('Senior Constable (SPC)');
    expect(playerActor.roleProfiles.police?.stationOrPost).toBe('Mong Kok Police Station');
    expect(playerActor.roleProfiles.police?.department).toBe('Uniform Branch');
    expect(playerActor.roleProfiles.police?.assignmentSummary).toBe('Response Officer');
    expect(playerActor.worldpackActorData).toEqual({});
    expect(playerActor.vitals?.health).toBe(100);
    expect(state.player.vitals.health).toBe(100);
  });

  it('repairs stale player police rank projections when loading an existing save', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      lawIdentity: {
        rank: 'Constable（警员 PC）'
      }
    });
    state.lawIdentity = {
      ...state.lawIdentity,
      rank: 'Inspector（督察 IP）'
    };
    state.policePanel = {
      ...state.policePanel,
      careerPath: {
        ...state.policePanel.careerPath,
        currentRank: 'Constable（警员 PC）'
      }
    };
    if (state.actors.player.roleProfiles.police) {
      state.actors.player.roleProfiles.police.rank = 'Constable（警员 PC）';
    }

    const normalized = withRuntimeDefaults(state);

    expect(normalized.lawIdentity.rank).toBe('Inspector（督察 IP）');
    expect(normalized.policePanel.careerPath.currentRank).toBe('Inspector（督察 IP）');
    expect(normalized.actors.player.roleProfiles.police?.rank).toBe('Inspector（督察 IP）');
    expect(normalized.finance.cashflows.cashflow_player_police_salary).toMatchObject({
      amount: 6500,
      status: 'active'
    });
  });

  it('migrates older non-player actors without forcing life or stamina fields onto NPCs', () => {
    const oldState = createInitialRuntimeState() as any;
    oldState.actors.npc_test = {
      ...oldState.actors.player,
      actorId: 'npc_test',
      name: 'NPC Test',
      currentIdentity: 'civilian',
      publicIdentity: 'Tea stall owner',
      positionSummary: 'Tea stall owner',
      relationshipSummary: 'Met through the street.',
      presence: 'mentioned',
      actualIdentitySummary: undefined,
      roleProfiles: undefined,
      worldpackActorData: undefined,
      vitals: undefined
    };

    const migrated = withRuntimeDefaults(oldState);
    const npc = migrated.actors.npc_test;

    expect(npc.vitals).toBeUndefined();
    expect(npc.roleProfiles).toEqual({});
    expect(npc.actualIdentitySummary).toBe('Tea stall owner');
    expect(npc.worldpackActorData).toEqual({});
  });
});
