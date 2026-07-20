import { describe, expect, it } from 'vitest';
import type { NarratorClient } from '../narrator/NarratorClient';
import { PLAYER_POLICE_SALARY_CASHFLOW_ID } from '../finance/playerSalaryCashflow';
import type { OpeningSetup } from '../runtime/initialState';
import { runOpening } from './runOpening';

class FakeOpeningNarrator implements NarratorClient {
  public prompt = '';

  async complete(prompt: string, options?: { onTextDelta?: (delta: string) => void; onRawText?: (rawText: string) => void }): Promise<unknown> {
    this.prompt = prompt;
    options?.onTextDelta?.('真正开局：');
    options?.onTextDelta?.('旺角警署');
    const response = {
      narrativeText: '真正开局：旺角警署的早班刚交接完，电话声和打字声混在一起。',
      suggestedActions: ['先问值日警长今天有什么麻烦'],
      playerPatch: {
        englishName: 'Michael Chan',
        policeNumber: '9527',
        clothing: '夏季军装制服，皮鞋擦得很亮。',
        equipment: ['警察委任证', '警棍', '点三八左轮'],
        economy: {
          money: 1800,
          monthlyPressure: 65,
          financeSummary: '工资刚够自己周转，家里偶尔还会开口要钱。'
        },
        reputation: {
          notoriety: 18,
          overallReputation: 4,
          summary: '开局时只有警署内少数同僚和驻区小商户知道他。',
          circles: {
          police: {
            visibility: 18,
            standing: 5,
            summary: '新人，少数同僚听过他，还在观察。'
          },
          neighborhoodMedia: {
            visibility: 6,
            standing: 0,
            summary: '附近街坊只知道来了个新警员。'
          },
          triad: {
            visibility: 0,
            standing: 0,
            summary: '社团圈暂未注意到他。'
          },
          entertainment: {
            visibility: 0,
            standing: 0,
            summary: '娱乐圈暂未注意到他。'
          },
          business: {
            visibility: 2,
            standing: 0,
            summary: '只有驻区小商户可能见过他。'
          },
          politics: {
            visibility: 0,
            standing: 0,
            summary: '政府和政界无人认识他。'
          }
          },
          logs: []
        },
        homeBase: {
          placeId: 'place_sham_shui_po_tenement_room',
          placeName: '深水埗唐楼住处',
          regionId: 'region_sham_shui_po',
          housingType: '唐楼分租房',
          summary: '深水埗一间狭窄唐楼房间，楼下是杂货铺和茶餐厅。',
          householdSummary: '与母亲同住，弟弟偶尔回来借钱。'
        },
        recentInteractionMemory: '刚到旺角警署报到。'
      },
      initialActors: [
        {
          name: '梁志强',
          englishName: 'Tony Leung',
          gender: 'male',
          computedAge: 42,
          currentIdentity: 'police',
          publicIdentity: '值日警长',
          positionSummary: '旺角警署值日警长',
          profileSummary: '老资格军装警长，熟悉街面和报案室人情。',
          clothing: '旧式短袖军装，肩章磨得发暗。',
          equipment: ['值日簿', '警棍', '口哨'],
          attributes: {
            body: 46,
            action: 52,
            perception: 64,
            thinking: 58,
            negotiation: 61,
            will: 55
          },
          relationshipSummary: '刚认识主角，暂时只按新人看待。',
          attitudeTowardPlayer: '审视但不刻薄',
          interactionScore: 15,
          presence: 'present',
          visibility: 'player_known',
          importance: 70
        },
        {
          name: '周嘉敏',
          englishName: 'May Chow',
          gender: 'female',
          birthDate: '1965-02-14',
          computedAge: 23,
          currentIdentity: 'civilian',
          publicIdentity: '广华医院护士',
          actualIdentitySummary: '主角女友，刚从旺角警署报案室离开。',
          positionSummary: '主角女友，广华医院护士。',
          profileSummary: '温柔但有主见的成年女友，关心主角夜班安全。',
          clothing: '浅色风衣和护士制服。',
          equipment: ['保温壶', '单肩包'],
          attributes: {
            body: 45,
            action: 48,
            perception: 60,
            thinking: 55,
            negotiation: 65,
            will: 70
          },
          relationshipSummary: '与主角是稳定情侣关系。',
          attitudeTowardPlayer: '亲近且担心主角安全。',
          interactionScore: 90,
          recentInteractionMemory: '刚送汤到警署后离开。',
          presence: 'just_left',
          visibility: 'player_known',
          importance: 90,
          femaleProfile: {
            birthday: '5月20日',
            addressToPlayer: '阿May',
            appearanceDescription: '笑起来眉眼弯弯，站近时会自然替主角整理衣领。',
            bodyDescription: '身形纤瘦，做事利落。',
            clothingStyle: '常穿制衣厂下班后的浅色衬衫和长裤。',
            personalityCore: '温柔但有主见，重视安稳生活。',
            affectionProgressionCondition: '主角能尊重她的工作与家庭压力。',
            relationshipProgressionCondition: '主角在家庭和警队压力之间表现出可靠担当。',
            relationshipNetworkEdges: [
              {
                targetName: '周家父母',
                relation: '家人',
                note: '父母健在，有个在工厂工作的哥哥。'
              }
            ],
            adultPrivateProfile: {
              enabled: true,
              ageConfirmedAdult: true,
              profileStatus: 'ready',
              womb: {
                status: '未受孕',
                cervixStatus: '紧闭',
                records: []
              },
              partProfiles: {
                胸部: { description: '乳房饱满柔软，乳晕色泽自然，乳头敏感。' },
                小穴: { description: '阴唇紧致细嫩，穴口收敛，阴蒂敏感。' },
                屁穴: { description: '臀缝紧窄，屁穴小而紧闭，周围皱褶细密。' }
              }
            }
          }
        }
      ],
      memories: [
        {
          text: '主角在旺角警署完成早班交接，开始第一天值班。',
          kind: 'turn',
          relatedActorIds: ['player'],
          relatedPlaceIds: ['place_mong_kok_police_station'],
          relatedOrganizationIds: ['org_hk_police'],
          importance: 80,
          visibility: 'player_known',
          certainty: 'fact'
        },
        {
          text: '这条重复开局摘要不应生成第二条主角短期记忆。',
          kind: 'turn',
          relatedActorIds: ['player'],
          relatedPlaceIds: ['place_mong_kok_police_station'],
          importance: 60,
          visibility: 'player_known',
          certainty: 'fact'
        },
        {
          text: '主角第一天以警员编号9527在旺角警署值班。',
          kind: 'player',
          relatedActorIds: ['player'],
          relatedPlaceIds: ['place_mong_kok_police_station'],
          importance: 90,
          visibility: 'player_known',
          certainty: 'fact'
        }
      ],
      pressureSeeds: [
        {
          kind: 'old_classmate_trouble',
          summary: '旧同学可能把主角拖入一个人情麻烦。',
          severity: 35,
          exposureLikelihood: 20,
          sourceSummary: '开局额外要求',
          allowedUses: ['在合适的生活场景中轻微触发'],
          forbiddenUses: ['不要下一回合直接变成内部调查'],
          escalationConditions: ['主角主动追问旧同学近况'],
          visibility: 'hidden'
        }
      ]
      ,
      grayLedger: [
        {
          kind: 'cash',
          amount: 500,
          fromSummary: '旧同学塞来的红包',
          relatedActorIds: ['player'],
          relatedPlaceIds: ['place_mong_kok_police_station'],
          summary: '旧同学说只是见面利是，但时机暧昧。',
          playerExplanation: '暂未向任何人解释。',
          exposureRisk: 20,
          status: 'hidden',
          visibility: 'hidden'
        }
      ]
    };
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class FakeHistoricalMemoryOpeningNarrator implements NarratorClient {
  async complete(_prompt: string, options?: { onTextDelta?: (delta: string) => void; onRawText?: (rawText: string) => void }): Promise<unknown> {
    options?.onTextDelta?.('A usable opening scene.');
    const response = {
      narrativeText: 'A usable opening scene with valid player state.',
      suggestedActions: ['Step into the report room.'],
      memories: [
        {
          text: 'The 1984 Sino-British Joint Declaration shapes the public mood.',
          kind: 'historical',
          importance: 90,
          visibility: 'player_known',
          certainty: 'fact'
        }
      ]
    };
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class FakeAdultFemaleWithoutPrivateProfileOpeningNarrator implements NarratorClient {
  async complete(_prompt: string, options?: { onRawText?: (rawText: string) => void }): Promise<unknown> {
    const response = {
      narrativeText: '开局时，周嘉敏刚从旺角警署门口离开，留下一个保温壶。',
      suggestedActions: ['给周嘉敏打个电话'],
      initialActors: [
        {
          name: '周嘉敏',
          englishName: 'May Chow',
          gender: 'female',
          birthDate: '1965-02-14',
          computedAge: 23,
          currentIdentity: 'civilian',
          publicIdentity: '玩家女友',
          positionSummary: '玩家女友，广华医院护士。',
          profileSummary: '温柔但有主见的成年女友，关心主角夜班安全。',
          relationshipSummary: '与主角是稳定情侣关系。',
          attitudeTowardPlayer: '亲近且担心主角安全。',
          interactionScore: 90,
          presence: 'mentioned',
          visibility: 'player_known',
          importance: 90,
          femaleProfile: {
            birthday: '2月14日',
            addressToPlayer: '阿星',
            appearanceDescription: '笑起来眉眼弯弯，见面时会自然替主角整理衣领。',
            bodyDescription: '身形纤瘦，做事利落。',
            clothingStyle: '下班后常穿浅色衬衫和长裤。',
            personalityCore: '温柔但有主见，重视安稳生活。'
          }
        }
      ]
    };
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class FakeCaseOpeningNarrator implements NarratorClient {
  async complete(_prompt: string, options?: { onRawText?: (rawText: string) => void }): Promise<unknown> {
    const response = {
      narrativeText: 'Opening scene: the player is assigned to assist a Mong Kok nightclub assault case.',
      suggestedActions: ['Submit the witness statement.'],
      casePatches: [
        {
          caseId: 'case_mk_nightclub_assault',
          title: 'Mong Kok Nightclub Assault',
          caseType: 'assault',
          status: 'investigating',
          playerRole: 'assist',
          leadActorName: 'Sergeant Lam',
          summary: 'A nightclub injury report assigned to the player as assisting officer.',
          currentFocus: 'Confirm the witness statement and scene record.',
          playerVisibleProgress: 'The player has one statement in hand.',
          internalProgressSummary: 'The case is still early and should not be treated as solved.',
          relatedPlaceIds: ['place_mong_kok_police_station'],
          evidenceIds: [],
          activityLog: [
            {
              kind: 'created',
              summary: 'The case file was opened during the first duty scene.',
              visibleToPlayer: true
            }
          ],
          visibility: 'player_known'
        }
      ],
      assetPatch: {
        upsertItems: [
          {
            itemId: 'asset_mk_statement_001',
            category: 'document',
            name: 'Nightclub witness statement',
            summary: 'A signed witness statement related to the assault case.',
            detail: 'The document can be submitted to the case file.',
            relatedCaseIds: ['case_mk_nightclub_assault'],
            evidence: {
              caseId: 'case_mk_nightclub_assault',
              caseTitle: 'Mong Kok Nightclub Assault',
              summary: 'Witness statement that may support the assault report.'
            },
            visibility: 'player_known',
            importance: 70
          }
        ]
      },
      caseEvidencePatches: [
        {
          evidenceId: 'evidence_scene_record_001',
          caseId: 'case_mk_nightclub_assault',
          title: 'Initial scene record',
          evidenceType: 'scene_record',
          summary: 'The report room already has a short initial scene record.',
          sourceSummary: 'Report room intake',
          visibility: 'player_known'
        }
      ],
      deferredEventPatches: [
        {
          eventId: 'deferred_case_followup_001',
          sourceModule: 'case',
          relatedIds: {
            caseId: 'case_mk_nightclub_assault'
          },
          title: 'Case follow-up',
          summary: 'The lead officer may respond after receiving the statement.',
          triggerAt: { year: 1988, month: 9, day: 1, hour: 10, minute: 30 },
          promptInstruction: 'Resolve the lead officer response without rushing prosecution.',
          status: 'pending'
        }
      ]
    };
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

function createSetup(): OpeningSetup {
  return {
    playerName: '陈启明',
    englishName: '',
    age: 25,
    policeNumber: '',
    currentIdentity: 'police',
    startTime: { year: 1988, month: 9, day: 1, hour: 8, minute: 30 },
    lawIdentity: {
      rank: 'Constable（警员 PC）',
      department: 'Uniform Branch（军装巡逻）',
      stationOrPost: 'Mong Kok Police Station（旺角警署）',
      assignmentSummary: 'Patrol Constable（巡逻警员）'
    },
    openingNote: '旧同学的麻烦要慢慢浮出水面。'
  };
}

describe('opening engine', () => {
  it('generates the initial runtime state from narrator JSON writeback', async () => {
    const narrator = new FakeOpeningNarrator();

    const state = await runOpening({ setup: createSetup(), narrator });

    expect(narrator.prompt).toContain('旧同学的麻烦');
    expect(state.turnCounter).toBe(0);
    expect(state.storyLog).toHaveLength(1);
    expect(state.storyLog[0].text).toContain('真正开局');
    expect(state.storyLog[0].rawNarratorResponse).toContain('"narrativeText"');
    expect(state.storyLog[0].suggestedActions).toEqual(['先问值日警长今天有什么麻烦']);
    const girlfriend = Object.values(state.actors).find((actor) => actor.name === '周嘉敏');
    expect(girlfriend?.femaleProfile?.birthday).toBe('5月20日');
    expect(girlfriend?.femaleProfile?.addressToPlayer).toBe('阿May');
    expect(girlfriend?.femaleProfile?.appearanceDescription).toContain('整理衣领');
    expect(girlfriend?.femaleProfile?.bodyDescription).toContain('纤瘦');
    expect(girlfriend?.femaleProfile?.clothingStyle).toContain('衬衫');
    expect(girlfriend?.femaleProfile?.personalityCore).toContain('温柔但有主见');
    expect(girlfriend?.femaleProfile?.affectionProgressionCondition).toContain('家庭压力');
    expect(girlfriend?.femaleProfile?.relationshipProgressionCondition).toContain('可靠担当');
    expect(girlfriend?.femaleProfile?.relationshipNetworkEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetName: '周家父母',
          relation: '家人',
          note: expect.stringContaining('父母健在')
        })
      ])
    );
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.profileStatus).toBe('ready');
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.womb?.status).toBe('未受孕');
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.partProfiles?.胸部?.description).toBe('乳房饱满柔软，乳晕色泽自然，乳头敏感。');
    expect(state.player.englishName).toBe('Michael Chan');
    expect(state.player.policeNumber).toBe('9527');
    expect(state.player.clothing).toBe('夏季军装制服，皮鞋擦得很亮。');
    expect(state.player.equipment).toEqual(['警察委任证', '警棍', '点三八左轮']);
    expect(state.actors.player.englishName).toBe('Michael Chan');
    expect(state.actors.player.policeNumber).toBe('9527');
    expect(state.actors.player.clothing).toBe('夏季军装制服，皮鞋擦得很亮。');
    expect(state.actors.player.equipment).toEqual(['警察委任证', '警棍', '点三八左轮']);
    expect(state.player.economy.bankBalance).toBe(1800);
    expect(state.finance.bankBalance).toBe(1800);
    expect(state.player.economy.monthlyPressure).toBe(65);
    expect(state.player.economy.financeSummary).toContain('家里');
    expect(state.player.reputation.notoriety).toBe(18);
    expect(state.player.reputation.overallReputation).toBe(4);
    expect(state.player.reputation.summary).toContain('少数同僚');
    expect(state.player.reputation.circles.police.visibility).toBe(18);
    expect(state.player.reputation.circles.police.standing).toBe(5);
    expect(state.player.reputation.circles.neighborhoodMedia.summary).toContain('街坊');
    expect(state.player.homeBase.placeId).toBe('place_sham_shui_po_tenement_room');
    expect(state.player.homeBase.householdSummary).toContain('母亲');
    expect(state.places.place_sham_shui_po_tenement_room.name).toBe('深水埗唐楼住处');
    expect(state.assets.items.asset_player_home).toMatchObject({
      category: 'fixedAsset',
      fixedAssetType: 'residence',
      holdingRelation: 'rented',
      primaryUse: 'home',
      placeId: 'place_sham_shui_po_tenement_room',
      relatedActorIds: ['player'],
      relatedPlaceIds: ['place_sham_shui_po_tenement_room'],
      expenseSettlementItemIds: ['cashflow_player_home_rent']
    });
    expect(state.finance.cashflows.cashflow_player_home_rent).toMatchObject({
      direction: 'expense',
      kind: 'rent',
      relatedAssetItemIds: ['asset_player_home'],
      relatedPlaceIds: ['place_sham_shui_po_tenement_room'],
      source: 'opening',
      status: 'active'
    });
    expect(state.finance.cashflows.cashflow_player_home_rent.amount).toBeGreaterThan(0);
    expect(state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]).toMatchObject({
      direction: 'income',
      kind: 'salary',
      title: '警队月薪',
      amount: 4200,
      source: 'opening',
      status: 'active'
    });
    expect(state.grayLedger).toHaveLength(1);
    expect(state.grayLedger[0].amount).toBe(500);
    expect(state.grayLedger[0].visibility).toBe('hidden');

    const openingActor = Object.values(state.actors).find((actor) => actor.name === '梁志强');
    expect(openingActor?.englishName).toBe('Tony Leung');
    expect(openingActor?.clothing).toBe('旧式短袖军装，肩章磨得发暗。');
    expect(openingActor?.equipment).toEqual(['值日簿', '警棍', '口哨']);
    expect(openingActor?.presence).toBe('present');
    expect(openingActor?.interactionScore).toBe(15);
    expect(openingActor?.attributes).toEqual({
      body: 46,
      action: 52,
      perception: 64,
      thinking: 58,
      negotiation: 61,
      will: 55
    });
    expect(openingActor?.vitals).toBeUndefined();
    expect(openingActor?.bodyConditionSummary).toBe(openingActor?.statusSummary);
    expect(openingActor?.roleProfiles).toEqual({});
    expect(state.scenes.scene_report_room.presentActorIds).toContain(openingActor?.actorId);

    const girlfriendActor = Object.values(state.actors).find((actor) => actor.name === '周嘉敏');
    expect(girlfriendActor?.englishName).toBe('May Chow');
    expect(girlfriendActor?.presence).toBe('mentioned');
    expect(girlfriendActor?.relationshipSummary).toContain('稳定情侣');
    expect(state.scenes.scene_report_room.presentActorIds).not.toContain(girlfriendActor?.actorId);

    expect(Object.values(state.memories).some((memory) => memory.text.includes('编号9527'))).toBe(true);
    const openingTurnMemories = Object.values(state.memories).filter((memory) => memory.kind === 'turn');
    expect(openingTurnMemories).toHaveLength(1);
    expect(openingTurnMemories[0]).toMatchObject({
      text: '主角在旺角警署完成早班交接，开始第一天值班。',
      tier: 'short_term',
      relatedTurnId: 'turn_0'
    });
    expect(state.storyLog[0]?.summaryText).toBe('主角在旺角警署完成早班交接，开始第一天值班。');
    expect(Object.values(state.pressures).some((pressure) => pressure.kind === 'old_classmate_trouble')).toBe(true);
  });

  it('passes opening narrative deltas without using them as writeback', async () => {
    const narrator = new FakeOpeningNarrator();
    const deltas: string[] = [];

    const state = await runOpening({
      setup: createSetup(),
      narrator,
      onNarrativeDelta: (delta) => deltas.push(delta)
    } as Parameters<typeof runOpening>[0] & { onNarrativeDelta: (delta: string) => void });

    expect(deltas.join('')).toBe('真正开局：旺角警署');
    expect(state.storyLog[0].text).toContain('电话声和打字声');
  });

  it('keeps opening usable when a model returns historical memory kind', async () => {
    const state = await runOpening({
      setup: createSetup(),
      narrator: new FakeHistoricalMemoryOpeningNarrator()
    });

    expect(state.storyLog).toHaveLength(1);
    expect(state.storyLog[0].text).toContain('usable opening scene');
    const historicalMemory = Object.values(state.memories).find((memory) =>
      memory.text.includes('Sino-British Joint Declaration')
    );
    expect(historicalMemory?.kind).toBe('world');
  });

  it('creates an adult private profile anchor for adult female opening actors when the model omits it', async () => {
    const state = await runOpening({
      setup: createSetup(),
      narrator: new FakeAdultFemaleWithoutPrivateProfileOpeningNarrator()
    });

    const girlfriend = Object.values(state.actors).find((actor) => actor.name === '周嘉敏');

    expect(girlfriend?.femaleProfile?.addressToPlayer).toBe('阿星');
    expect(girlfriend?.femaleProfile?.adultPrivateProfile).toMatchObject({
      enabled: true,
      ageConfirmedAdult: true,
      source: 'opening',
      profileStatus: 'ready',
      womb: {
        status: '未受孕',
        cervixStatus: '紧闭',
        records: []
      }
    });
    const privateProfileText = JSON.stringify(girlfriend?.femaleProfile?.adultPrivateProfile);
    expect(privateProfileText).not.toContain('待补全');
    expect(privateProfileText).not.toContain('pending');
    expect(privateProfileText).not.toContain('暂无记录');
    expect(privateProfileText).not.toContain('视觉锚点');
    expect(privateProfileText).not.toContain('锚点已建立');
    expect(privateProfileText).not.toContain('依据成年女性档案');
    expect(privateProfileText).not.toContain('保持一致');
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.partProfiles?.胸部?.description).toMatch(/乳房|乳头|乳晕|乳尖/);
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.partProfiles?.胸部?.description).not.toContain('周嘉敏');
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.partProfiles?.胸部?.description).not.toContain('眉眼弯弯');
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.partProfiles?.小穴?.description).toMatch(/阴唇|阴蒂|穴口|阴道/);
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.partProfiles?.小穴?.description).not.toContain('周嘉敏');
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.partProfiles?.屁穴?.description).toMatch(/屁穴|肛|后庭|臀缝/);
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.partProfiles?.屁穴?.description).not.toContain('周嘉敏');
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.fetishNotes).toMatch(/欲望|挑逗|支配|掌控|羞耻|性/);
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.fetishNotes).not.toContain('信任');
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.sensitivePoints).not.toContain('关系');
    expect(girlfriend?.femaleProfile?.adultPrivateProfile?.updatedAt).toEqual(state.time);
  });

  it('applies opening case, evidence asset, submitted evidence, and deferred event writebacks', async () => {
    const state = await runOpening({
      setup: createSetup(),
      narrator: new FakeCaseOpeningNarrator()
    });

    expect(state.cases.case_mk_nightclub_assault).toMatchObject({
      title: 'Mong Kok Nightclub Assault',
      playerRole: 'assist',
      status: 'investigating'
    });
    expect(state.assets.items.asset_mk_statement_001).toMatchObject({
      category: 'document',
      evidence: {
        caseId: 'case_mk_nightclub_assault'
      }
    });
    expect(state.caseEvidence.evidence_scene_record_001).toMatchObject({
      caseId: 'case_mk_nightclub_assault',
      evidenceType: 'scene_record'
    });
    expect(state.cases.case_mk_nightclub_assault.evidenceIds).toContain('evidence_scene_record_001');
    expect(state.deferredEvents.deferred_case_followup_001).toMatchObject({
      sourceModule: 'case',
      status: 'pending'
    });
  });
});
