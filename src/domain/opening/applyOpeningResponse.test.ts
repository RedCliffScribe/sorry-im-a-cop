import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { applyOpeningNarratorResponse } from './applyOpeningResponse';
import { validateOpeningNarratorResponse } from './openingSchema';

describe('applyOpeningNarratorResponse identity boundaries', () => {
  it('keeps exact rich-opening balances and mirrors canonical finance back to the player', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      playerName: '林家俊'
    });
    const response = validateOpeningNarratorResponse({
      narrativeText: '【旁白】家中的账房把银行结单和零用现金交到你手上。',
      suggestedActions: ['核对银行结单。'],
      playerPatch: {
        name: '林家俊',
        clothing: '剪裁合身的深灰西装。',
        equipment: ['皮夹', '钢笔'],
        economy: {
          cashOnHand: 50_000,
          bankBalance: 50_000_000_000,
          monthlyPressure: 12,
          financeSummary: '家族资产充裕，日常支出由本地账本记录。'
        }
      }
    });

    const next = applyOpeningNarratorResponse(state, response);

    expect(next.finance.cashOnHand).toBe(50_000);
    expect(next.finance.bankBalance).toBe(50_000_000_000);
    expect(next.player.economy.cashOnHand).toBe(50_000);
    expect(next.player.economy.bankBalance).toBe(50_000_000_000);
    expect(next.player.economy.financeSummary).toBe(next.finance.summary);
    expect(next.player.name).toBe('林家俊');
    expect(next.player.clothing).toContain('深灰西装');
    expect(next.player.equipment).toEqual(['皮夹', '钢笔']);
  });

  it('records opening fatigue as a reviewable transient condition instead of an unbounded summary', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      playerName: '林家俊',
      startTime: { year: 1988, month: 9, day: 12, hour: 7, minute: 30 }
    });
    const response = validateOpeningNarratorResponse({
      narrativeText: '【旁白】你刚结束整夜值守，眼皮发沉，但仍在交更桌前核对记录。',
      suggestedActions: ['先完成交更。'],
      playerPatch: {
        vitals: {
          health: 100,
          maxHealth: 100,
          stamina: 68,
          maxStamina: 100,
          conditionSummary: '整夜值守后明显疲惫。',
          conditionPersistence: 'transient'
        }
      }
    });

    const next = applyOpeningNarratorResponse(state, response);

    expect(next.player.vitals.conditionLifecycle).toEqual({
      persistence: 'transient',
      establishedAt: state.time,
      lastReviewedAt: state.time
    });
    expect(next.actors.player.vitals).toEqual(next.player.vitals);
  });

  it('prefers structured opening equipment ids without creating duplicate name-derived assets', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      playerName: '林家俊'
    });
    const response = validateOpeningNarratorResponse({
      narrativeText: '【旁白】你在枪房点收警棍和对讲机，准备开始当值。',
      suggestedActions: ['检查对讲机频道。'],
      playerPatch: {
        equipment: ['旧式名称不应另建资产']
      },
      assetPatch: {
        upsertItems: [
          {
            itemId: 'asset_opening_baton',
            category: 'equipment',
            name: '警棍',
            summary: '当值使用的标准警棍。'
          },
          {
            itemId: 'asset_opening_radio',
            category: 'equipment',
            name: '对讲机',
            summary: '当值使用的警用对讲机。'
          }
        ],
        equippedItemIds: ['asset_opening_baton', 'asset_opening_radio']
      }
    });

    const next = applyOpeningNarratorResponse(state, response);

    expect(next.assets.equippedItemIds).toEqual([
      'asset_opening_baton',
      'asset_opening_radio'
    ]);
    expect(next.player.equipment).toEqual(['警棍', '对讲机']);
    expect(Object.keys(next.assets.items)).toEqual([
      'asset_opening_baton',
      'asset_opening_radio'
    ]);
  });

  it('derives an opening NPC age from birth date instead of trusting a conflicting model age', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      playerName: '林振声',
      startTime: { year: 1989, month: 2, day: 1, hour: 9, minute: 0 }
    });
    const response = validateOpeningNarratorResponse({
      narrativeText: '【陈伟强】“早晨，先核对值更表。”',
      presentationHints: { dialogueEmotions: ['serious'] },
      suggestedActions: ['核对值更表。'],
      playerPatch: {},
      initialActors: [
        {
          actorId: 'actor_opening_duty_sergeant',
          name: '陈伟强',
          gender: 'male',
          birthDate: '1960-01-10',
          computedAge: 90,
          currentIdentity: 'police',
          publicIdentity: '旺角警署值日警长',
          positionSummary: '旺角警署报案室值日警长。',
          profileSummary: '老练、谨慎的军装警长。',
          relationshipSummary: '当值期间是玩家的直接工作联系人。',
          recentInteractionMemory: '开局时与玩家核对值更表。',
          presence: 'present',
          visibility: 'player_known',
          importance: 72
        }
      ]
    });

    const next = applyOpeningNarratorResponse(state, response);

    expect(next.actors.actor_opening_duty_sergeant?.birthDate).toBe('1960-01-10');
    expect(next.actors.actor_opening_duty_sergeant?.computedAge).toBe(29);
    expect(next.storyLog[0]?.blocks).toEqual([
      {
        type: 'dialogue',
        text: '“早晨，先核对值更表。”',
        speakerLabel: '陈伟强',
        speakerActorId: 'actor_opening_duty_sergeant',
        emotion: 'serious'
      }
    ]);
  });

  it('links a structured opening duty sergeant into the player police chain', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      playerName: '周星星',
      lawIdentity: {
        stationOrPost: 'Mong Kok Police Station（旺角警署）',
        department: 'Uniform Branch（军装巡逻）'
      }
    });
    const response = validateOpeningNarratorResponse({
      narrativeText: '【陈伟强】“3482，今晚由我值日，有事用电台报告。”',
      suggestedActions: ['领取对讲机后出更。'],
      playerPatch: {},
      initialActors: [
        {
          actorId: 'actor_opening_duty_sergeant',
          name: '陈伟强',
          gender: 'male',
          computedAge: 40,
          currentIdentity: 'police',
          publicIdentity: '旺角警署值日警长',
          roleProfiles: {
            police: {
              status: 'active',
              rank: 'Sergeant',
              department: 'Uniform Branch',
              stationOrPost: 'Mong Kok Police Station',
              assignmentSummary: 'Report Room Duty Sergeant'
            }
          },
          playerRoleRelation: 'police_supervisor',
          positionSummary: '旺角警署报案室值日警长。',
          profileSummary: '老练、谨慎的军装警长。',
          relationshipSummary: '当值期间是玩家的直接工作联系人。',
          recentInteractionMemory: '开局时要求玩家遇到异常立即用电台报告。',
          presence: 'present',
          visibility: 'player_known',
          importance: 72
        }
      ]
    });

    const next = applyOpeningNarratorResponse(state, response);

    expect(next.actors.actor_opening_duty_sergeant?.name).toBe('陈伟强');
    expect(next.lawIdentity.supervisorActorIds).toEqual(['actor_opening_duty_sergeant']);
    expect(next.actors.player.roleProfiles.police?.supervisorActorIds).toEqual([
      'actor_opening_duty_sergeant'
    ]);
  });

  it('keeps absent and mentioned actors offscreen without fabricating player-location history', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      playerName: '陈志明'
    });
    const currentSceneId = state.location.currentSceneId!;
    const createActorSeed = (
      actorId: string,
      name: string,
      presence: 'present' | 'absent' | 'mentioned',
      location?: { currentPlaceId: string; currentSceneId?: string }
    ) => ({
      actorId,
      name,
      gender: 'male' as const,
      computedAge: 38,
      currentIdentity: 'civilian' as const,
      positionSummary: '与主角家庭或工作有关的人物。',
      profileSummary: '身份明确、目前不一定身处开局现场。',
      relationshipSummary: '与主角有稳定关系。',
      presence,
      currentPlaceId: location?.currentPlaceId,
      currentSceneId: location?.currentSceneId,
      visibility: 'player_known' as const,
      importance: 60
    });
    const response = validateOpeningNarratorResponse({
      narrativeText: '【旁白】你在值日室整理家人和同僚留下的消息。',
      suggestedActions: ['先查看值日记录。'],
      playerPatch: {},
      initialActors: [
        createActorSeed('actor_absent_unknown', '陈国荣', 'absent'),
        createActorSeed('actor_mentioned_unknown', '陈家伟', 'mentioned'),
        createActorSeed('actor_absent_known', '陈国强', 'absent', {
          currentPlaceId: 'place_guangzhou_family_home'
        }),
        createActorSeed('actor_present_local', '梁志强', 'present', {
          currentPlaceId: state.location.currentPlaceId,
          currentSceneId: state.location.currentSceneId
        })
      ]
    });

    const next = applyOpeningNarratorResponse(state, response);

    for (const actorId of ['actor_absent_unknown', 'actor_mentioned_unknown']) {
      expect(next.actors[actorId].currentPlaceId).toBeUndefined();
      expect(next.actors[actorId].currentSceneId).toBeUndefined();
      expect(next.actors[actorId].lastSeenAt).toBeUndefined();
      expect(next.actors[actorId].lastSeenPlaceId).toBeUndefined();
      expect(next.scenes[currentSceneId]?.presentActorIds).not.toContain(actorId);
    }
    expect(next.actors.actor_absent_known).toMatchObject({
      currentPlaceId: 'place_guangzhou_family_home',
      currentSceneId: undefined,
      lastSeenAt: state.time,
      lastSeenPlaceId: 'place_guangzhou_family_home'
    });
    expect(next.actors.actor_present_local).toMatchObject({
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      lastSeenAt: state.time,
      lastSeenPlaceId: state.location.currentPlaceId
    });
    expect(next.scenes[currentSceneId]?.presentActorIds).toContain(
      'actor_present_local'
    );
  });

  it('keeps police salary local and ignores a duplicate salary proposed by the opening model', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police', playerName: '陈启明' });
    const response = validateOpeningNarratorResponse({
      narrativeText: '【旁白】早更点名结束。',
      suggestedActions: ['核对更表。'],
      playerPatch: {},
      financePatch: {
        upsertCashflows: [
          {
            itemId: 'cashflow_model_invented_police_salary',
            direction: 'income',
            kind: 'salary',
            title: '警队月薪',
            amount: 99999,
            account: 'bank',
            summary: '模型不应覆盖本地警队工资表。',
            activeFromMonth: '1984-12'
          }
        ]
      }
    });

    const next = applyOpeningNarratorResponse(state, response);

    expect(next.finance.cashflows.cashflow_model_invented_police_salary).toBeUndefined();
    expect(next.finance.cashflows.cashflow_player_police_salary?.amount).not.toBe(99999);
  });

  it('establishes a civilian recurring salary for local monthly settlement', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'tea_restaurant_clerk',
      playerName: '陈启明'
    });
    const response = validateOpeningNarratorResponse({
      narrativeText: '【旁白】茶餐厅开门，领班把本月更表交给你。',
      suggestedActions: ['先核对今天的当值时间。'],
      playerPatch: {},
      financePatch: {
        upsertCashflows: [
          {
            itemId: 'cashflow_player_civilian_primary_job',
            direction: 'income',
            kind: 'salary',
            title: '茶餐厅月薪',
            amount: 1800,
            account: 'bank',
            identityBinding: 'civilian',
            summary: '在花园街茶餐厅的稳定受雇工资。',
            activeFromMonth: '1984-12',
            relatedActorIds: ['player'],
            relatedPlaceIds: ['place_fa_yuen_street']
          }
        ]
      }
    });

    const next = applyOpeningNarratorResponse(state, response);

    expect(next.finance.cashflows.cashflow_player_civilian_primary_job).toMatchObject({
      amount: 1800,
      account: 'bank',
      identityBinding: 'civilian',
      source: 'opening',
      status: 'active'
    });
  });

  it('ignores police numbers on a civilian opening and persists only structured secret facts', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'nightlife_staff',
      playerName: '陈启明'
    });
    const response = validateOpeningNarratorResponse({
      narrativeText: '【旁白】夜场刚刚开门，玩家仍在整理吧台。',
      suggestedActions: ['先把当值工作做完'],
      playerPatch: {
        policeNumber: '9527',
        clothing: '旧白衬衫、黑长裤和防滑皮鞋。',
        equipment: ['零钱包', '圆珠笔', '火柴盒']
      },
      secretFacts: [
        {
          secretId: 'secret_player_family_debt',
          ownerType: 'player',
          ownerId: 'player',
          kind: 'risk',
          summary: '主角知道家中尚有一笔不能公开的债务。',
          playerCharacterKnown: true,
          publicKnown: false,
          knownByActorIds: ['player'],
          revealState: 'known_to_player_character',
          revealConditions: ['主角主动谈及家中债务。'],
          visibility: 'player_known',
          importance: 75
        }
      ]
    });

    const next = applyOpeningNarratorResponse(state, response);

    expect(next.player.currentIdentity).toBe('civilian');
    expect(next.player.policeNumber).toBeUndefined();
    expect(next.actors.player.policeNumber).toBeUndefined();
    expect(next.secretFacts.secret_player_family_debt).toMatchObject({
      ownerId: 'player',
      knownByActorIds: ['player'],
      revealState: 'known_to_player_character'
    });
    expect(next.secretFacts.secret_player_family_debt?.createdAt).toEqual(state.time);
    expect(next.secretFacts.secret_player_family_debt?.updatedAt).toEqual(state.time);
  });

  it('links a triad patron and peer and writes the first responsibility without a new task store', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member', playerName: '陈启明' });
    const triadProfile = state.actors.player.roleProfiles.triad!;
    const response = validateOpeningNarratorResponse({
      narrativeText: '【阿成】“先去问清庙街摊档点解争执，唔好一开口就抬社团个名。”',
      suggestedActions: ['先找摊档老板了解情况。'],
      playerPatch: {},
      initialActors: [
        {
          actorId: 'actor_opening_triad_patron',
          name: '阿成',
          gender: 'male',
          computedAge: 38,
          currentIdentity: 'gang_member',
          publicIdentity: '庙街地区线联络人',
          roleProfiles: {
            triad: {
              status: 'active',
              organizationId: triadProfile.organizationId,
              societyName: triadProfile.societyName,
              roleTitle: '地区线联络人',
              rankSummary: '资深成员',
              territorySummary: triadProfile.territorySummary
            }
          },
          playerRoleRelation: 'triad_patron',
          positionSummary: '负责庙街地区线的日常联络。',
          profileSummary: '做事谨慎，重视规矩和街坊关系。',
          relationshipSummary: '带玩家进入当前组织关系网的直属上线。',
          recentInteractionMemory: '开局时交代玩家先了解摊档争执。',
          presence: 'present',
          visibility: 'player_known',
          importance: 78
        },
        {
          actorId: 'actor_opening_triad_peer',
          name: '阿杰',
          gender: 'male',
          computedAge: 24,
          currentIdentity: 'gang_member',
          publicIdentity: '同组外围成员',
          roleProfiles: {
            triad: {
              status: 'active',
              organizationId: triadProfile.organizationId,
              societyName: triadProfile.societyName,
              roleTitle: '外围成员',
              rankSummary: '同组新人',
              territorySummary: triadProfile.territorySummary
            }
          },
          playerRoleRelation: 'triad_peer',
          positionSummary: '与玩家同属一个地区小组。',
          profileSummary: '年轻冲动，喜欢抢先出头。',
          relationshipSummary: '与玩家既合作也有竞争。',
          recentInteractionMemory: '开局时在旁听到阿成的交代。',
          presence: 'present',
          visibility: 'player_known',
          importance: 62
        }
      ],
      currentMatterPatches: [
        {
          id: 'matter_opening_triad_responsibility',
          title: '弄清摊档争执',
          summary: '阿成交代先了解争执原因，避免公开使用社团名义。',
          status: 'active',
          priority: 72,
          visibility: 'known',
          source: 'triad_responsibility',
          matterKind: 'social',
          pressureLevel: 2,
          responseWindow: 'today',
          currentHook: '摊档双方仍在互相指责。',
          relatedActorIds: ['actor_opening_triad_patron', 'actor_opening_triad_peer'],
          relatedPlaceIds: [state.location.currentPlaceId],
          relatedOrganizationIds: [triadProfile.organizationId]
        }
      ]
    });

    const next = applyOpeningNarratorResponse(state, response);

    expect(next.actors.actor_opening_triad_patron?.name).toBe('阿成');
    expect(next.actors.actor_opening_triad_peer?.name).toBe('阿杰');
    expect(next.actors.player.roleProfiles.triad?.patronActorIds).toEqual(['actor_opening_triad_patron']);
    expect(next.actors.player.roleProfiles.triad?.peerActorIds).toEqual(['actor_opening_triad_peer']);
    expect(next.dynamicEvents.currentMatters.matter_opening_triad_responsibility).toMatchObject({
      source: 'triad_responsibility',
      matterKind: 'social',
      relatedActorIds: ['actor_opening_triad_patron', 'actor_opening_triad_peer'],
      relatedOrganizationIds: [triadProfile.organizationId]
    });
  });
});
