import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { createActorDefaults } from '../runtime/actorFactory';
import { PLAYER_POLICE_SALARY_CASHFLOW_ID } from '../finance/playerSalaryCashflow';
import { applyNarratorResponse } from './applyWriteback';
import { validateNarratorResponse as validateNarratorResponseStrict } from './validateWriteback';

function validateNarratorResponse(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return validateNarratorResponseStrict(value);
  }
  const record = value as Record<string, unknown>;
  return validateNarratorResponseStrict({
    ...record,
    turnSummary: record.turnSummary ?? '测试回合事实摘要。'
  });
}

describe('writeback protocol', () => {
  it('preserves a valid turn summary while sanitizing an invalid writeback child', () => {
    const result = validateNarratorResponseStrict({
      narrativeText: '正文。',
      turnSummary: '玩家已经把小说前三章寄往报社。',
      suggestedActions: [],
      writeback: { actorPatches: [{ actorId: 42 }] }
    });

    expect(result.turnSummary).toBe('玩家已经把小说前三章寄往报社。');
  });

  it('keeps valid equipment when a neighboring player clothing field is invalid', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponseStrict({
      narrativeText: '玩家换上军装，并从枪房领出配枪、警棍和对讲机。',
      turnSummary: '玩家回到警署接更并领取执勤装备。',
      suggestedActions: [],
      writeback: {
        playerPatch: {
          clothing: {
            currentSummary: '夏季军装制服，外加透明防雨风衣。',
            mode: 'uniform',
            lastChangedReason: '回到警署接更。'
          },
          equipment: ['史密斯威森M10左轮手枪', '警棍', '对讲机']
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.playerPatch?.clothing).toBeUndefined();
    expect(response.writeback.playerPatch?.equipment).toEqual(['史密斯威森M10左轮手枪', '警棍', '对讲机']);
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: expect.arrayContaining(['writeback', 'playerPatch', 'clothing'])
      })
    );
    expect(next.player.equipment).toEqual(['史密斯威森M10左轮手枪', '警棍', '对讲机']);
    expect(next.assets.equippedItemIds).toHaveLength(3);
  });

  it('rejects a legacy clothing string instead of preserving a stale clothing mode', () => {
    const state = createInitialRuntimeState();
    state.player.clothing = '便服。';
    state.player.clothingState = {
      currentSummary: '便服。',
      mode: 'off_duty_plain',
      lastChangedAt: { ...state.time }
    };

    const response = validateNarratorResponseStrict({
      narrativeText: '玩家换上军装，并领出配枪、警棍和对讲机。',
      turnSummary: '玩家换上军装并领取执勤装备。',
      suggestedActions: [],
      writeback: {
        playerPatch: {
          clothing: '夏季军装制服。',
          equipment: ['史密斯威森M10左轮手枪', '警棍', '对讲机']
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.playerPatch?.clothing).toBeUndefined();
    expect(response.writeback.playerPatch?.equipment).toEqual(['史密斯威森M10左轮手枪', '警棍', '对讲机']);
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: expect.arrayContaining(['writeback', 'playerPatch', 'clothing'])
      })
    );
    expect(next.player.clothing).toBe('便服。');
    expect(next.player.clothingState?.mode).toBe('off_duty_plain');
    expect(next.player.equipment).toEqual(['史密斯威森M10左轮手枪', '警棍', '对讲机']);
  });

  it('rejects a narrator response that still lacks a turn summary', () => {
    expect(() =>
      validateNarratorResponseStrict({
        narrativeText: '正文。',
        suggestedActions: [],
        writeback: {}
      })
    ).toThrow();
  });

  it('accepts structured writeback and advances state from explicit fields only', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player enters the report room.',
      suggestedActions: ['Answer the phone', 'Ask the duty sergeant what happened'],
      timePatch: { elapsedMinutes: 5, reason: 'Briefly entering the report room and observing the area' },
      writeback: {
        memories: [
          {
            text: 'The player entered the report room at the start of the morning shift.',
            kind: 'world',
            importance: 40,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ],
        actorMemories: [
          {
            actorId: 'player',
            text: 'The player felt the station rhythm at the start of morning shift.',
            importance: 30,
            visibility: 'player_known'
          }
        ],
        traitProgress: [
          {
            actorId: 'player',
            traitId: 'trait_station_rhythm',
            name: 'Station Rhythm',
            delta: 10,
            maxProgress: 100,
            reason: 'Started adapting to daily station operations'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.time.minute).toBe(35);
    expect(Object.values(next.memories)[0]?.text).toContain('report room');
    expect(next.actors.player.traitProgress[0]?.name).toBe('Station Rhythm');
    expect(next.storyLog.at(-1)?.text).toBe('The player enters the report room.');
  });

  it('normalizes female profile alias fields and relationship network edges from actor writeback', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_may = createActorDefaults({
      actorId: 'npc_may',
      name: '周嘉敏',
      englishName: 'May Chow',
      gender: 'female',
      birthDate: '1965-05-20',
      computedAge: 23,
      currentIdentity: 'civilian',
      publicIdentity: '玩家女友',
      profileSummary: '在制衣厂工作的年轻女性。',
      presence: 'nearby',
      interactionScore: 45,
      importance: 80,
      visibility: 'player_known'
    });

    const response = validateNarratorResponse({
      narrativeText: '周嘉敏在电话里提醒玩家别太晚回家。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_may',
            femaleProfile: {
              对主角称呼: '阿May',
              外貌描写: '说话时会自然压低声线，显得亲近。',
              身材描写: '个子不高，动作利落。',
              衣着风格: '下班后常穿简单衬衫和半身裙。',
              核心性格特征: '温柔但有主见，重视安稳生活。',
              好感度突破条件: '主角能稳定兑现承诺。',
              关系突破条件: '主角在家庭和警队压力之间表现出可靠担当。',
              关系网变量: [
                {
                  对象姓名: '周母',
                  关系: '母女',
                  备注: '父母健在，母亲担心女儿和警察拍拖压力太大。'
                }
              ],
              adultPrivateProfile: {
                女性扩展档案状态: 'ready',
                子宫: {
                  状态: '未受孕',
                  宫口状态: '紧闭',
                  内射记录: []
                },
                香闺秘档部位档案: {
                  胸部: { 描述: '乳房饱满柔软，乳晕色泽自然，乳头敏感。' },
                  小穴: { 描述: '阴唇紧致细嫩，穴口收敛，阴蒂敏感。' },
                  屁穴: { 描述: '臀缝紧窄，屁穴小而紧闭，周围皱褶细密。' }
                },
                性癖: '偏好强势但有分寸的挑逗、贴身掌控和身体赞美。',
                敏感点: '敏感点集中在乳尖、阴蒂、颈侧、腰侧、大腿内侧和臀缝。'
              }
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const profile = next.actors.npc_may?.femaleProfile;

    expect(profile?.addressToPlayer).toBe('阿May');
    expect(profile?.appearanceDescription).toContain('压低声线');
    expect(profile?.bodyDescription).toContain('个子不高');
    expect(profile?.clothingStyle).toContain('半身裙');
    expect(profile?.personalityCore).toContain('温柔但有主见');
    expect(profile?.affectionProgressionCondition).toContain('兑现承诺');
    expect(profile?.relationshipProgressionCondition).toContain('可靠担当');
    expect(profile?.relationshipNetworkEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetName: '周母',
          relation: '母女',
          note: expect.stringContaining('父母健在')
        })
      ])
    );
    expect(profile?.adultPrivateProfile?.profileStatus).toBe('ready');
    expect(profile?.adultPrivateProfile?.womb).toMatchObject({
      status: '未受孕',
      cervixStatus: '紧闭',
      records: []
    });
    expect(profile?.adultPrivateProfile?.partProfiles?.胸部?.description).toBe('乳房饱满柔软，乳晕色泽自然，乳头敏感。');
    expect(profile?.adultPrivateProfile?.partProfiles?.小穴?.description).toBe('阴唇紧致细嫩，穴口收敛，阴蒂敏感。');
    expect(profile?.adultPrivateProfile?.partProfiles?.屁穴?.description).toBe('臀缝紧窄，屁穴小而紧闭，周围皱褶细密。');
    expect(profile?.adultPrivateProfile?.fetishNotes).toBe('偏好强势但有分寸的挑逗、贴身掌控和身体赞美。');
    expect(profile?.adultPrivateProfile?.sensitivePoints).toBe('敏感点集中在乳尖、阴蒂、颈侧、腰侧、大腿内侧和臀缝。');
  });

  it('accepts absolute turn end time for long-span actions', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 12, hour: 22, minute: 35 };
    const response = validateNarratorResponse({
      narrativeText: 'Seven routine duty days pass before the player reads the evening paper.',
      suggestedActions: ['Read the entertainment page'],
      timePatch: {
        targetTime: { year: 1988, month: 9, day: 19, hour: 19, minute: 0 },
        reason: 'The player explicitly waited through a week of routine shifts.'
      },
      writeback: {
        memories: [
          {
            text: 'The player spent a quiet week on routine shifts before reading the evening paper.',
            kind: 'turn',
            importance: 25,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.validationWarnings?.some((warning) => warning.path.includes('timePatch'))).not.toBe(true);
    expect(next.time).toEqual({ year: 1988, month: 9, day: 19, hour: 19, minute: 0 });
    expect(next.storyLog.at(-1)?.gameTime).toEqual(next.time);
    expect(Object.values(next.memories)[0]?.gameTime).toEqual(next.time);
  });

  it('applies explicit location writeback without requiring actor or matter inference', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player takes a taxi from Mong Kok station to Central and steps out near Des Voeux Road.',
      suggestedActions: ['Enter the bank lobby', 'Call the station from a payphone'],
      timePatch: { elapsedMinutes: 25, reason: 'Taxi travel from Mong Kok to Central.' },
      writeback: {
        locationPatch: {
          currentPlaceId: 'place_hang_seng_bank_headquarters',
          reason: 'The narrative explicitly moved the player from Mong Kok to Central.'
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.location.currentSceneId).toBeUndefined();
    expect(next.actors.player.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.actors.player.currentSceneId).toBeUndefined();
    expect(next.map.lastMovement).toMatchObject({
      fromPlaceId: 'place_mong_kok_police_station',
      fromSceneId: 'scene_report_room',
      toPlaceId: 'place_hang_seng_bank_headquarters',
      elapsedMinutes: 25
    });
  });

  it('does not derive durable location directly from narrative text when location writeback is omitted', () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const response = validateNarratorResponse({
      narrativeText:
        '上午九点四十五分，旺角警署的男更衣室里弥漫着浓重的肥皂味和旧制服的汗气。你推开属于自己的铁皮储物柜，开始整理下一步报告。',
      suggestedActions: ['回家睡觉', '找 CID 继续申请录像'],
      timePatch: { elapsedMinutes: 15, reason: 'Wrapping up the night shift in the station locker room.' },
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.location.currentSceneId).toBeUndefined();
    expect(next.actors.player.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.actors.player.currentSceneId).toBeUndefined();
    expect(next.map.lastMovement).toBeUndefined();
  });

  it('does not treat a future lead mention as the current location when location writeback is omitted', () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const response = validateNarratorResponse({
      narrativeText:
        '你坐在值班桌前写下下一步计划：正式申请渣打银行大厦的闭路电视录像，再追查信德中心储物柜钥匙的来源。',
      suggestedActions: ['睡醒后申请公函', '整理证据目录'],
      timePatch: { elapsedMinutes: 10, reason: 'Writing the next lead list without moving.' },
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.actors.player.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.map.lastMovement).toBeUndefined();
  });

  it('applies dynamic current matter, signal and newspaper writebacks', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '街面风声和报纸同时更新。',
      writeback: {
        currentMatterPatches: [
          {
            id: 'matter_mongkok_media_heat',
            title: '报馆盯上旺角冲突',
            summary: '本地报馆开始追问旺角街面冲突的警队处理。',
            status: 'active',
            priority: 70,
            visibility: 'known',
            source: 'media',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            relatedOrganizationIds: ['org_evening_post']
          }
        ],
        signalPatches: [
          {
            id: 'signal_teahouse_rumor',
            title: '茶餐厅里的收风',
            summary: '街坊说今晚有人会去游戏机中心找麻烦。',
            signalType: 'street',
            reliability: 'unknown',
            status: 'active',
            visibility: 'known',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ],
        newsIssuePatches: [
          {
            id: 'news_1988_09_12_evening',
            date: state.time,
            outletName: '星岛日报',
            headline: '旺角夜色未静',
            summary: '本地治安、娱乐和社会消息混在同一期报纸里。',
            read: false,
            articles: [
              {
                id: 'article_mongkok_public_order',
                section: 'local',
                headline: '旺角街头再起争执',
                body: '警方称事件仍在了解中，街坊则议论纷纷。',
                tone: '谨慎',
                playerRelated: true,
                relatedActorIds: ['player'],
                relatedPlaceIds: [state.location.currentPlaceId],
                relatedCaseIds: [],
                relatedOrganizationIds: []
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.dynamicEvents.currentMatters.matter_mongkok_media_heat.title).toBe('报馆盯上旺角冲突');
    expect(next.dynamicEvents.signals.signal_teahouse_rumor.signalType).toBe('street');
    expect(next.dynamicEvents.newsIssues.news_1988_09_12_evening.articles[0]?.headline).toContain('旺角');
  });

  it('preserves local news lifecycle fields when the narrator updates an issue', () => {
    const state = createInitialRuntimeState();
    const archivedAt = { ...state.time, day: state.time.day - 1 };
    state.dynamicEvents.newsIssues.news_important = {
      id: 'news_important',
      date: state.time,
      outletName: '大公报',
      headline: '原有头条',
      summary: '原有摘要。',
      articles: [],
      createdAt: state.time,
      updatedAt: state.time,
      read: true,
      important: true
    };
    state.dynamicEvents.newsIssues.news_archived = {
      id: 'news_archived',
      date: state.time,
      outletName: '明报',
      headline: '已归档头条',
      summary: '已归档摘要。',
      articles: [],
      createdAt: state.time,
      updatedAt: state.time,
      read: true,
      archivedAt
    };
    const response = validateNarratorResponse({
      narrativeText: '报章补充了后续报道。',
      writeback: {
        newsIssuePatches: [
          { id: 'news_important', headline: '更新后的重要头条' },
          { id: 'news_archived', summary: '更新后的归档摘要。' }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.dynamicEvents.newsIssues.news_important.important).toBe(true);
    expect(next.dynamicEvents.newsIssues.news_archived.archivedAt).toEqual(archivedAt);
  });

  it('applies organization structure tree writeback as durable organization state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '线人把新义安的层级说得更清楚。',
      suggestedActions: ['记下坐馆与旺角线的层级'],
      writeback: {
        organizationPatches: [
          {
            organizationId: 'org_sun_yee_on',
            structureTree: [
              {
                nodeId: 'org_sun_yee_on_seat',
                label: '坐馆',
                role: '最高话事层',
                personName: '向天强',
                status: '传闻中仍能拍板大方向。',
                confidence: 'medium',
                children: [
                  {
                    nodeId: 'org_sun_yee_on_mong_kok_head',
                    label: '旺角线',
                    role: '地区话事人',
                    personName: '未知',
                    actorId: 'npc_temp_syo_head',
                    status: '负责夜场和街面外围，姓名未确认。',
                    confidence: 'low',
                    children: []
                  }
                ]
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.organizations.org_sun_yee_on.structureTree?.[0]).toMatchObject({
      nodeId: 'org_sun_yee_on_seat',
      label: '坐馆',
      personName: '向天强'
    });
    expect(next.organizations.org_sun_yee_on.structureTree?.[0]?.children?.[0]).toMatchObject({
      nodeId: 'org_sun_yee_on_mong_kok_head',
      label: '旺角线',
      personName: '未知',
      actorId: 'npc_temp_syo_head'
    });
  });

  it('applies weather writeback as environment state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '雨势压下来。',
      writeback: {
        weatherPatch: {
          condition: 'heavy_rain',
          label: '大雨',
          intensity: 80,
          impactSummary: '路面湿滑，霓虹反光，巡逻视线受影响。',
          validForMinutes: 90,
          tags: ['wet_road']
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.environment.weather.condition).toBe('heavy_rain');
    expect(next.environment.weather.source).toBe('llm');
    expect(next.environment.weather.tags).toContain('wet_road');
  });

  it('drops malformed weather writeback without failing the turn', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '天气描述漂了一下。',
      writeback: {
        weatherPatch: {
          condition: 'snowstorm',
          intensity: 500
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.validationWarnings?.some((warning) => warning.path.includes('weatherPatch'))).toBe(true);
    expect(next.storyLog.at(-1)?.text).toBe('天气描述漂了一下。');
  });

  it('persists current matter semantic fields for player-facing current matters', () => {
    const state = createInitialRuntimeState();
    const dueAt = { year: 1988, month: 9, day: 12, hour: 23, minute: 0 };
    const response = validateNarratorResponse({
      narrativeText: 'A known personal pressure is recorded for later projection.',
      writeback: {
        currentMatterPatches: [
          {
            id: 'matter_call_girlfriend',
            title: 'Call Mary back tonight',
            summary: 'Mary asked the player to call back before the night shift ends.',
            status: 'active',
            priority: 65,
            visibility: 'known',
            source: 'npc',
            matterKind: 'relationship',
            pressureLevel: 2,
            responseWindow: 'today',
            consequenceHint: 'If the player ignores it tonight, Mary may think he is avoiding her.',
            dueAt,
            currentHook: 'Mary is waiting for a phone call after 23:00.',
            unread: true,
            relatedActorIds: ['actor_mary'],
            relatedPlaceIds: [],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const matter = next.dynamicEvents.currentMatters.matter_call_girlfriend as any;

    expect(matter.matterKind).toBe('relationship');
    expect(matter.pressureLevel).toBe(2);
    expect(matter.responseWindow).toBe('today');
    expect(matter.consequenceHint).toContain('avoiding');
    expect(matter.dueAt).toEqual(dueAt);
    expect(matter.currentHook).toContain('23:00');
    expect(matter.unread).toBe(true);
  });

  it('does not permanently resolve a dormant current matter from narrative outcome text', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '街面隐患已经处理完毕。',
      writeback: {
        currentMatterPatches: [
          {
            id: 'matter_luen_ying_revenge',
            title: '联英马仔街头寻仇（已瓦解）',
            summary: '残余马仔受到叔父辈警告及警方高压，已彻底丧失斗志。',
            status: 'dormant',
            priority: 80,
            visibility: 'known',
            source: 'street',
            matterKind: 'social',
            pressureLevel: 0,
            responseWindow: 'open',
            currentHook: '玩家确认残余马仔见警即逃，该隐患暂时解除。',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            relatedOrganizationIds: ['org_14k']
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.dynamicEvents.currentMatters.matter_luen_ying_revenge.status).toBe('dormant');
  });

  it('soft-drops malformed current matter semantic fields without losing valid siblings', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'Only valid current matter writes should survive.',
      writeback: {
        currentMatterPatches: [
          {
            id: 'matter_valid',
            title: 'Valid known pressure',
            summary: 'A valid matter remains available for projection.',
            status: 'active',
            priority: 50,
            visibility: 'known',
            source: 'npc',
            pressureLevel: 1,
            responseWindow: 'soon'
          },
          {
            id: 'matter_bad',
            title: 'Bad pressure',
            summary: 'This item should be dropped because pressureLevel is outside the supported range.',
            status: 'active',
            priority: 50,
            visibility: 'known',
            source: 'npc',
            pressureLevel: 9,
            responseWindow: 'soon'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.dynamicEvents.currentMatters.matter_valid).toBeDefined();
    expect(next.dynamicEvents.currentMatters.matter_bad).toBeUndefined();
    expect(response.validationWarnings?.some((warning) => warning.path.includes('currentMatterPatches'))).toBe(true);
  });

  it('soft-drops malformed dynamic writeback items without losing valid siblings', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '只有合法的风声会进入本地状态。',
      writeback: {
        signalPatches: [
          {
            id: 'signal_valid',
            title: '报摊旁的消息',
            summary: '有人说记者在找当晚巡逻警员。',
            signalType: 'media',
            reliability: 'low',
            status: 'active',
            visibility: 'known'
          },
          {
            id: '',
            title: '坏风声',
            summary: '这条不应该拖死整个回合。',
            signalType: 'invalid_type',
            reliability: 'certain'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.dynamicEvents.signals.signal_valid.summary).toContain('记者');
    expect(Object.keys(next.dynamicEvents.signals)).toEqual(['signal_valid']);
    expect(response.validationWarnings?.some((warning) => warning.path.includes('signalPatches'))).toBe(true);
  });

  it('accepts city situation track writeback patches', () => {
    const response = validateNarratorResponse({
      writebackVersion: '1.7',
      narrativeText: 'The entertainment reporter mentions a film crew still shooting at night.',
      writeback: {
        citySituationTrackPatches: [
          {
            operation: 'upsert',
            trackId: 'track_test_film_night_shoot',
            title: '金禾片场夜戏压力',
            trackType: 'film_production',
            status: 'active',
            pressureLevel: 2,
            visibility: 'rumor',
            cadenceDays: 14,
            relatedOrganizationIds: ['org_golden_harvest'],
            relatedPlaceIds: ['place_golden_harvest_studio'],
            relatedActorIds: [],
            relatedPowerFigureIds: [],
            summary: '片场正在赶警匪片夜戏，道具枪和外景保安让记者有话题可追。',
            currentBeat: '外景组今晚还在补拍巷口追逐。',
            possibleDevelopments: ['杀青新闻', '记者追访问责'],
            nextReviewAt: { year: 1988, month: 9, day: 26, hour: 9, minute: 0 }
          }
        ]
      }
    });

    expect(response.writeback.citySituationTrackPatches).toHaveLength(1);
    expect(response.writeback.citySituationTrackPatches[0]?.trackId).toBe('track_test_film_night_shoot');
  });

  it('soft-drops malformed city situation track writeback items', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The model returns one valid city track and one malformed item.',
      writeback: {
        citySituationTrackPatches: [
          {
            operation: 'upsert',
            trackId: 'track_valid_market_pressure',
            title: '股灾余波',
            trackType: 'market_pressure',
            summary: '券商和地下钱庄还在消化去年的股灾。',
            currentBeat: '财经版继续追问散户损失。',
            possibleDevelopments: ['财经新闻'],
            nextReviewAt: { year: 1988, month: 9, day: 30, hour: 8, minute: 0 }
          },
          {
            operation: 'upsert',
            trackId: '',
            trackType: 'bad_type'
          }
        ]
      }
    });

    expect(response.writeback.citySituationTrackPatches.map((patch) => patch.trackId)).toEqual([
      'track_valid_market_pressure'
    ]);
    expect(
      response.validationWarnings?.some(
        (warning) => warning.path.join('.') === 'writeback.citySituationTrackPatches.1.trackId'
      )
    ).toBe(true);
  });

  it('applies city situation track writeback as durable runtime state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.7',
      narrativeText: 'A reporter says the old factory dispute will keep developing.',
      writeback: {
        citySituationTrackPatches: [
          {
            operation: 'upsert',
            trackId: 'track_test_factory_dispute',
            title: '旧厂劳资争议',
            trackType: 'labor_dispute',
            summary: '旧厂欠薪风声开始传到报馆。',
            currentBeat: '工人代表在找记者。',
            possibleDevelopments: ['报馆报道', '警署接到滋扰投诉'],
            visibility: 'rumor',
            relatedPlaceIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.citySituationTracks.track_test_factory_dispute).toMatchObject({
      trackId: 'track_test_factory_dispute',
      trackType: 'labor_dispute',
      visibility: 'rumor'
    });
  });

  it('soft-drops malformed judgement and combat writeback items without losing valid siblings', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.6',
      narrativeText: 'A tense arrest attempt requires a judgement and records a short fight.',
      writeback: {
        judgementCheckPatches: [
          {
            checkId: 'check_valid_arrest',
            turnId: 'turn_1',
            gameTime: state.time,
            title: 'Control the suspect before he reaches the alley',
            category: 'melee',
            targetSummary: 'A panicked young man trying to break away.',
            relatedActorIds: ['player', 'npc_suspect'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            difficulty: 62,
            score: 71,
            outcome: 'success',
            shortSummary: 'The player keeps control after a brief struggle.',
            factors: [
              {
                label: 'Action',
                value: 8,
                reason: 'The player reacts before the suspect fully turns.'
              }
            ],
            visibility: 'player_known'
          },
          {
            checkId: 'check_bad_category',
            turnId: 'turn_1',
            gameTime: state.time,
            title: 'Bad judgement category',
            category: 'magic',
            relatedActorIds: [],
            relatedPlaceIds: [],
            relatedCaseIds: [],
            difficulty: 40,
            score: 50,
            outcome: 'success',
            shortSummary: 'This item should be dropped.',
            factors: [],
            visibility: 'player_known'
          }
        ],
        combatEventPatches: [
          {
            combatId: 'combat_valid_arrest',
            turnId: 'turn_1',
            gameTime: state.time,
            title: 'Alley arrest struggle',
            type: 'melee',
            locationSummary: 'A wet side alley behind the arcade.',
            participants: [
              {
                actorId: 'player',
                name: 'Player',
                side: 'player',
                roleSummary: 'Uniformed constable trying to control the suspect.'
              },
              {
                actorId: 'npc_suspect',
                name: 'Suspect',
                side: 'opponent',
                roleSummary: 'Panicked young man trying to run.'
              }
            ],
            outcome: 'opponent_subdued',
            intensity: 68,
            combatText:
              'The suspect twists toward the alley, slips on the wet pavement, and the player pins his wrist before the crowd closes in.',
            resultSummary: 'The suspect is controlled.',
            consequenceSummary: 'Bystanders now watch the player closely.',
            judgementCheckIds: ['check_valid_arrest'],
            relatedActorIds: ['player', 'npc_suspect'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            visibility: 'player_known',
            unread: true,
            createdAt: state.time
          },
          {
            combatId: 'combat_bad_outcome',
            turnId: 'turn_1',
            gameTime: state.time,
            title: 'Bad combat outcome',
            type: 'melee',
            locationSummary: 'Nowhere',
            participants: [],
            outcome: 'instant_win',
            intensity: 50,
            combatText: 'This item should be dropped.',
            resultSummary: 'Bad item.',
            consequenceSummary: 'Bad item.',
            judgementCheckIds: [],
            relatedActorIds: [],
            relatedPlaceIds: [],
            relatedCaseIds: [],
            visibility: 'player_known',
            unread: true,
            createdAt: state.time
          }
        ]
      }
    });

    expect((response.writeback as any).judgementCheckPatches).toHaveLength(1);
    expect((response.writeback as any).judgementCheckPatches[0]?.checkId).toBe('check_valid_arrest');
    expect((response.writeback as any).combatEventPatches).toHaveLength(1);
    expect((response.writeback as any).combatEventPatches[0]?.combatId).toBe('combat_valid_arrest');
    expect(response.validationWarnings?.some((warning) => warning.path.includes('judgementCheckPatches'))).toBe(true);
    expect(response.validationWarnings?.some((warning) => warning.path.includes('combatEventPatches'))).toBe(true);
  });

  it('applies judgement and combat writebacks to the current local story turn', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.6',
      narrativeText: 'A knife comes out near the arcade and the player commits to a close arrest.',
      timePatch: { elapsedMinutes: 10, reason: 'Brief struggle and immediate scene control.' },
      writeback: {
        judgementCheckPatches: [
          {
            checkId: 'check_close_arrest',
            turnId: 'model_guessed_turn',
            gameTime: state.time,
            title: 'Close the distance before the suspect runs',
            category: 'melee',
            targetSummary: 'A suspect half-turned toward a side alley.',
            relatedActorIds: ['player', 'npc_suspect'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            difficulty: 61,
            score: 72,
            outcome: 'success',
            shortSummary: 'The player closes the gap and controls the suspect.',
            consequenceSummary: 'The watching crowd now focuses on the player.',
            factors: [
              {
                label: '行动',
                value: 8,
                reason: '玩家先一步封住巷口。'
              }
            ],
            visibility: 'player_known'
          }
        ],
        combatEventPatches: [
          {
            combatId: 'combat_close_arrest',
            turnId: 'model_guessed_turn',
            gameTime: state.time,
            title: 'Arcade side-alley arrest',
            type: 'melee',
            locationSummary: 'A damp side alley beside the arcade.',
            participants: [
              {
                actorId: 'player',
                name: 'Player',
                side: 'player',
                roleSummary: 'Uniformed officer making the arrest.'
              },
              {
                actorId: 'npc_suspect',
                name: 'Suspect',
                side: 'opponent',
                roleSummary: 'Panicked suspect trying to break away.'
              }
            ],
            outcome: 'opponent_subdued',
            intensity: 66,
            animationKey: 'alley_grapple',
            combatText:
              'The suspect drives his shoulder toward the alley mouth, but the player catches his wrist against the shutter and forces him down before the crowd can surge.',
            resultSummary: 'The suspect is subdued.',
            consequenceSummary: 'The player spends stamina and draws attention from bystanders.',
            judgementCheckIds: ['check_close_arrest'],
            relatedActorIds: ['player', 'npc_suspect'],
            relatedPlaceIds: [state.location.currentPlaceId],
            relatedCaseIds: [],
            visibility: 'player_known',
            unread: true,
            createdAt: state.time
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const storyEntry = next.storyLog.at(-1);

    expect(storyEntry?.turnId).not.toBe('model_guessed_turn');
    expect(next.judgementChecks.check_close_arrest.turnId).toBe(storyEntry?.turnId);
    expect(next.combatEvents.combat_close_arrest.turnId).toBe(storyEntry?.turnId);
    expect(next.judgementChecks.check_close_arrest.gameTime).toEqual(next.time);
    expect(next.combatEvents.combat_close_arrest.gameTime).toEqual(next.time);
    expect(next.judgementChecks.check_close_arrest.margin).toBe(11);
    expect(next.judgementChecks.check_close_arrest.relatedCombatEventId).toBe('combat_close_arrest');
    expect(storyEntry?.judgementCheckIds).toEqual(['check_close_arrest']);
    expect(storyEntry?.combatEventIds).toEqual(['combat_close_arrest']);
  });

  it('accepts deferred narrative events from dynamic and institution-facing modules', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '后台事件进入时间队列。',
      writeback: {
        deferredEventPatches: [
          {
            eventId: 'deferred_news_followup',
            sourceModule: 'dynamic',
            title: '报馆后续追访',
            summary: '记者会在两日后继续追问旺角冲突。',
            triggerAt: { ...state.time, day: state.time.day + 2 },
            promptInstruction: '到期时让记者或报章以合理方式推进这条后续。'
          },
          {
            eventId: 'deferred_org_notice',
            sourceModule: 'organization',
            title: '机构内部通知',
            summary: '某机构准备内部讨论玩家相关事件。',
            triggerAt: { ...state.time, day: state.time.day + 1 },
            promptInstruction: '到期时以机构态度变化或人物对接体现。'
          },
          {
            eventId: 'deferred_relationship_call',
            sourceModule: 'relationship',
            title: '旧识来电',
            summary: '一名旧识会在稍后打电话给玩家。',
            triggerAt: { ...state.time, hour: state.time.hour + 2 },
            promptInstruction: '到期时让这名旧识以自然方式进入正文。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.deferredEvents.deferred_news_followup.sourceModule).toBe('dynamic');
    expect(next.deferredEvents.deferred_org_notice.sourceModule).toBe('organization');
    expect(next.deferredEvents.deferred_relationship_call.sourceModule).toBe('relationship');
  });

  it('applies relationship thread writebacks as durable relationship state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '华叔这条街坊线被记录下来。',
      writeback: {
        relationshipThreadPatches: [
          {
            threadId: 'rel_uncle_wah',
            kind: 'network',
            title: '华叔这条街坊线',
            summary: '华叔愿意在街坊层面提醒玩家，但不会公开替玩家出头。',
            relatedActorIds: ['player'],
            relationshipRole: '街坊长辈',
            status: 'active',
            trustSummary: '愿意给提醒，但保留距离。',
            currentPull: '华叔希望玩家别把小事闹大。',
            creationBasis: 'debt_or_promise',
            evidenceRefs: [
              {
                kind: 'current_turn',
                refId: 'current_turn',
                summary: '华叔在当前回合明确承诺会继续替玩家留意街坊消息。'
              }
            ],
            importance: 65,
            milestoneUpdates: [
              {
                milestoneId: 'ms_wah_warning',
                summary: '华叔提醒玩家，旺角茶餐厅最近有人盯梢。',
                importance: 55,
                relatedActorIds: ['player'],
                visibility: 'player_known'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.relationshipThreads.rel_uncle_wah).toMatchObject({
      kind: 'network',
      title: '华叔这条街坊线',
      relationshipRole: '街坊长辈',
      importance: 65
    });
    expect(next.relationshipThreads.rel_uncle_wah.milestones[0]?.summary).toContain('旺角茶餐厅');
  });

  it('does not infer a fate thread from female profile prose without an explicit relationship writeback', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_girlfriend = createActorDefaults({
      actorId: 'npc_girlfriend',
      name: '周嘉敏',
      englishName: 'May Chow',
      gender: 'female',
      birthDate: '1965-05-20',
      computedAge: 23,
      currentIdentity: 'civilian',
      publicIdentity: '玩家女友',
      profileSummary: '在百货公司工作的年轻女性。',
      relationshipSummary: '玩家的女友。',
      attitudeTowardPlayer: '信任玩家，也担心他的警察工作。',
      presence: 'nearby',
      interactionScore: 80,
      importance: 85,
      visibility: 'player_known'
    });

    const response = validateNarratorResponse({
      narrativeText: '周嘉敏和玩家在下班后有了一次更亲密的相处。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_girlfriend',
            femaleProfile: {
              relationshipNotes: '玩家的女友，关系已经进入稳定亲密阶段。',
              publicIntimacyNotes: '两人已经多次亲密相处，彼此信任并开始把这段关系当成长期牵挂。'
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const fateThread = Object.values(next.relationshipThreads).find(
      (thread) => thread.kind === 'fate' && thread.primaryActorId === 'npc_girlfriend'
    );

    expect(fateThread).toBeUndefined();
  });

  it('soft-drops malformed relationship thread items without losing valid siblings', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '只有合法的人脉线进入本地状态。',
      writeback: {
        relationshipThreadPatches: [
          {
            threadId: '',
            kind: 'network',
            title: '坏数据',
            summary: '缺少合法 ID。',
            relatedActorIds: ['player'],
            relationshipRole: '坏数据'
          },
          {
            threadId: 'rel_valid_neighbor',
            kind: 'network',
            title: '邻里熟人',
            summary: '楼下士多老板知道玩家常在夜里回家。',
            relatedActorIds: ['player'],
            relationshipRole: '邻里熟人',
            creationBasis: 'debt_or_promise',
            evidenceRefs: [
              {
                kind: 'current_turn',
                refId: 'current_turn',
                summary: '士多老板在当前回合明确答应日后继续替玩家留意夜间动静。'
              }
            ],
            importance: 35
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.relationshipThreads.rel_valid_neighbor.summary).toContain('士多老板');
    expect(Object.keys(next.relationshipThreads)).toEqual(['rel_valid_neighbor']);
    expect(response.validationWarnings?.some((warning) => warning.path.includes('relationshipThreadPatches'))).toBe(true);
  });

  it('records relationship patch diagnostics when a new thread is incomplete', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '不完整关系线不应拖死回合。',
      writeback: {
        relationshipThreadPatches: [
          {
            threadId: 'rel_incomplete',
            summary: '缺少新关系线必需字段。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.relationshipThreads.rel_incomplete).toBeUndefined();
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'relationship_creation_evidence_missing')
    ).toBe(true);
  });

  it('applies police panel progress from structured player writeback', () => {
    const state = createInitialRuntimeState({
      lawIdentity: {
        rank: 'Senior Constable (SPC)',
        stationOrPost: 'Wan Chai Police Station',
        department: 'Uniform Branch',
        assignmentSummary: 'Street patrol'
      }
    });
    const response = validateNarratorResponse({
      narrativeText: 'The duty sergeant comments on promotion prospects after patrol.',
      writeback: {
        playerPatch: {
          policePanel: {
            careerPath: {
              dynamicAssessment: {
                supervisor: 'The duty sergeant considers him steady but not yet proven.',
                performance: 'One clean street patrol report is now on record.'
              },
              opportunities: ['Request more documented patrol duties before the next review.']
            },
            climate: [
              {
                key: 'supervisor_attitude',
                label: 'Supervisor attitude',
                level: 'cautious',
                summary: 'Direct supervisors are watching whether he can handle routine pressure.'
              }
            ],
            actionHints: ['Ask the duty sergeant what record helps a future Sergeant recommendation.']
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.policePanel.careerPath.dynamicAssessment.supervisor).toContain('steady');
    expect(next.policePanel.careerPath.dynamicAssessment.performance).toContain('street patrol');
    expect(next.policePanel.climate.find((entry) => entry.key === 'supervisor_attitude')?.summary).toContain(
      'routine pressure'
    );
    expect(next.policePanel.actionHints[0]).toContain('Sergeant recommendation');
  });

  it('does not infer state from narrative text when writeback is empty', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'You train with a pistol until your shooting feels stable.',
      suggestedActions: [],
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.activeTraits).toHaveLength(0);
    expect(next.actors.player.traitProgress).toHaveLength(0);
  });

  it('applies finance money changes and mirrors canonical money back to player economy', () => {
    const state = createInitialRuntimeState();
    state.finance.cashOnHand = 1200;
    state.finance.bankBalance = 5000;
    state.player.economy.cashOnHand = 1200;
    state.player.economy.bankBalance = 5000;
    const response = validateNarratorResponse({
      narrativeText: 'The player pays a late-night taxi fare after following a lead.',
      writeback: {
        financePatch: {
          cashDelta: -80,
          summary: '现金减少，主要来自夜间交通开销。',
          ledgerEntries: [
            {
              direction: 'expense',
              amount: 80,
              account: 'cash',
              title: '的士车费',
              summary: '为追线索临时坐车。',
              source: 'writeback'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.finance.cashOnHand).toBe(1120);
    expect(next.finance.bankBalance).toBe(5000);
    expect(next.player.economy.cashOnHand).toBe(1120);
    expect(next.player.economy.bankBalance).toBe(5000);
    expect(next.player.economy.financeSummary).toBe('现金减少，主要来自夜间交通开销。');
    expect(next.finance.ledger[0]).toMatchObject({
      direction: 'expense',
      amount: 80,
      account: 'cash',
      title: '的士车费',
      source: 'writeback'
    });
    expect(next.finance.ledger[0]?.gameTime).toEqual(next.time);
  });

  it('applies experience gain through local progression rules', () => {
    const state = createInitialRuntimeState();
    state.player.progression = {
      level: 1,
      experience: 90,
      unspentAttributePoints: 0
    };
    const response = validateNarratorResponse({
      narrativeText: 'The player completes a difficult arrest and learns from the encounter.',
      writeback: {
        playerPatch: {
          progression: {
            experienceGain: 220,
            reason: '完成高风险拘捕并妥善处理现场。'
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.progression).toEqual({
      level: 3,
      experience: 10,
      unspentAttributePoints: 10
    });
  });

  it('normalizes common finance ledger aliases from model output', () => {
    const state = createInitialRuntimeState();
    state.finance.cashOnHand = 300;
    state.finance.bankBalance = 900;
    state.player.economy.cashOnHand = 300;
    state.player.economy.bankBalance = 900;
    const response = validateNarratorResponse({
      narrativeText: 'The player buys cigarettes from a newsstand.',
      writeback: {
        financePatch: {
          moneyDelta: -35,
          ledgerEntries: [
            {
              type: '支出',
              amount: -35,
              category: '买烟',
              description: '在报摊买了一包烟。'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.validationWarnings?.some((warning) => warning.path.includes('ledgerEntries'))).not.toBe(true);
    expect(next.finance.cashOnHand).toBe(265);
    expect(next.finance.bankBalance).toBe(900);
    expect(next.finance.ledger[0]).toMatchObject({
      direction: 'expense',
      amount: 35,
      account: 'cash',
      title: '买烟',
      summary: '在报摊买了一包烟。'
    });
  });

  it('upserts and removes recurring finance cashflow items from structured writeback', () => {
    const state = createInitialRuntimeState();
    state.finance.bankBalance = 2000;
    state.player.economy.bankBalance = 2000;
    const response = validateNarratorResponse({
      narrativeText: 'The player confirms rent and a side stipend as monthly items.',
      writeback: {
        financePatch: {
          upsertCashflows: [
            {
              itemId: 'cashflow_rent_1984',
              direction: 'expense',
              kind: 'rent',
              title: '深水埗房租',
              amount: 850,
              summary: '每月交给房东的劏房租金。',
              activeFromMonth: '1984-12'
            },
            {
              itemId: 'cashflow_family_support',
              direction: 'income',
              kind: 'family_support',
              title: '家用补贴',
              amount: 200,
              summary: '母亲偶尔补贴伙食。',
              activeFromMonth: '1984-12'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);
    expect(next.finance.cashflows.cashflow_rent_1984).toMatchObject({
      direction: 'expense',
      kind: 'rent',
      status: 'active',
      source: 'writeback',
      visibility: 'player_known'
    });

    const removeResponse = validateNarratorResponse({
      narrativeText: 'The rent item ends after the player moves out.',
      writeback: {
        financePatch: {
          removeCashflowItemIds: ['cashflow_rent_1984']
        }
      }
    });
    const afterRemove = applyNarratorResponse(next, removeResponse);

    expect(afterRemove.finance.cashflows.cashflow_rent_1984.status).toBe('ended');
    expect(afterRemove.finance.cashflows.cashflow_family_support.status).toBe('active');
  });

  it('accepts debt payment as a recurring finance cashflow kind', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player confirms a monthly debt repayment.',
      writeback: {
        financePatch: {
          upsertCashflows: [
            {
              itemId: 'cashflow_family_debt',
              direction: 'expense',
              kind: 'debt_payment',
              title: '家中欠债还款',
              amount: 600,
              summary: '每月替家里偿还一笔旧债。',
              activeFromMonth: '1988-09'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.finance.cashflows.cashflow_family_debt.kind).toBe('debt_payment');
  });

  it('records gray ledger entries without changing money unless finance writeback changes money', () => {
    const state = createInitialRuntimeState();
    state.finance.bankBalance = 500;
    state.player.economy.bankBalance = 500;
    const response = validateNarratorResponse({
      narrativeText: 'A nightclub boss sends the player a gold watch.',
      writeback: {
        grayLedgerPatch: {
          entries: [
            {
              kind: 'gift',
              itemSummary: '夜总会老板送来的金表。',
              fromSummary: '尖沙咀夜总会老板',
              relatedActorIds: ['npc_club_boss'],
              summary: '玩家收下来源暧昧的金表，可能留下人情风险。',
              exposureRisk: 45,
              status: 'hidden'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.finance.bankBalance).toBe(500);
    expect(next.player.economy.bankBalance).toBe(500);
    expect(next.grayLedger).toHaveLength(1);
    expect(next.grayLedger[0]).toMatchObject({
      kind: 'gift',
      itemSummary: '夜总会老板送来的金表。',
      fromSummary: '尖沙咀夜总会老板',
      exposureRisk: 45,
      status: 'hidden'
    });
    expect(next.grayLedger[0]?.gameTime).toEqual(next.time);
  });

  it('applies valid gray network patches to runtime state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player hears structured street-network context.',
      writeback: {
        grayNetworkPatches: [
          {
            areaId: 'area_mong_kok',
            areaName: 'Mong Kok',
            climate: [
              {
                key: 'night_market_pressure',
                label: 'Night market pressure',
                level: 'rising',
                summary: 'Street collectors are becoming more visible after dark.',
                confidence: 'medium',
                lastUpdatedTurn: 2
              }
            ],
            knownOrganizations: [
              {
                organizationId: 'org_wo_luen_shing',
                name: 'Wo Luen Shing',
                visibleName: 'Wo Luen Shing runners',
                summary: 'A visible street-facing circle rather than confirmed leadership.',
                knownScope: 'night market protection rumors',
                confidence: 'low',
                visibility: { police: 'known', gang_member: 'rumor', civilian: 'hidden' },
                relatedActorIds: ['player'],
                relatedPlaceIds: [state.location.currentPlaceId],
                relatedCaseIds: [],
                updatedAtTurn: 2
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.grayNetworks.byAreaId.area_mong_kok.areaName).toBe('Mong Kok');
    expect(next.grayNetworks.byAreaId.area_mong_kok.climate[0]).toMatchObject({
      key: 'night_market_pressure',
      level: 'rising'
    });
    expect(next.grayNetworks.byAreaId.area_mong_kok.knownOrganizations[0]?.relatedActorIds).toEqual(['player']);
  });

  it('does not merge gray network related people into an existing actor by matching name alone', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_ho_001 = {
      ...state.actors.player,
      actorId: 'actor_ho_001',
      name: 'Ho Ka Keung',
      englishName: 'Ho Ka Keung',
      aliases: ['Ah Keung'],
      currentIdentity: 'gang_member',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId
    };
    const response = validateNarratorResponse({
      narrativeText: 'The player recognizes a known street runner under a temporary label.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_temp_keung',
            name: 'Ho Ka Keung',
            statusSummary: 'Nervous after being recognized near the market.'
          }
        ],
        grayNetworkPatches: [
          {
            areaId: 'area_mong_kok',
            relatedPeople: [
              {
                actorId: 'npc_temp_keung',
                visibleRole: 'street runner',
                knownTieSummary: 'Connected to night-market message carrying.',
                confidence: 'medium',
                visibility: { police: 'known', gang_member: 'known', civilian: 'rumor' },
                relatedPlaceIds: [state.location.currentPlaceId],
                relatedOrganizationIds: ['org_wo_luen_shing'],
                relatedCaseIds: [],
                updatedAtTurn: 3
              }
            ],
            relationClues: [
              {
                clueId: 'clue_keung_runner',
                summary: 'Ho Ka Keung may pass messages for a Wo Luen Shing street circle.',
                certainty: 'claim',
                confidence: 'medium',
                visibility: { police: 'known', gang_member: 'rumor', civilian: 'hidden' },
                relatedActorIds: ['npc_temp_keung'],
                relatedPlaceIds: [state.location.currentPlaceId],
                relatedOrganizationIds: ['org_wo_luen_shing'],
                relatedCaseIds: [],
                updatedAtTurn: 3
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const profile = next.grayNetworks.byAreaId.area_mong_kok;

    expect(profile.relatedPeople[0]?.actorId).toBe('npc_temp_keung');
    expect(profile.relationClues[0]?.relatedActorIds).toEqual(['npc_temp_keung']);
    expect(next.actors.actor_ho_001?.statusSummary).not.toBe('Nervous after being recognized near the market.');
    expect(next.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'remapped_actor_reference')).toBe(false);
  });

  it('drops malformed optional gray network nested items and records validation warnings', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A mixed gray-network writeback includes one malformed clue.',
      writeback: {
        grayNetworkPatches: [
          {
            areaId: 'area_mong_kok',
            climate: [
              {
                key: 'tea_house_rumors',
                label: 'Tea house rumors',
                level: 'rumor',
                summary: 'Regulars are whispering about protection pressure.',
                confidence: 'low'
              }
            ],
            relationClues: [
              {
                clueId: 'clue_valid',
                summary: 'A tea-house regular claims runners are watching the door.',
                certainty: 'rumor',
                confidence: 'low',
                visibility: { police: 'rumor', gang_member: 'rumor', civilian: 'hidden' },
                relatedActorIds: ['player'],
                relatedPlaceIds: [state.location.currentPlaceId],
                relatedOrganizationIds: [],
                relatedCaseIds: []
              },
              {
                clueId: 'clue_bad',
                certainty: 'impossible',
                confidence: 'low',
                visibility: { police: 'rumor' },
                relatedActorIds: ['player'],
                relatedPlaceIds: [],
                relatedOrganizationIds: [],
                relatedCaseIds: []
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.grayNetworkPatches[0]?.relationClues).toHaveLength(1);
    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.grayNetworkPatches.0.relationClues.1.summary')).toBe(
      true
    );
    expect(next.grayNetworks.byAreaId.area_mong_kok.climate[0]?.key).toBe('tea_house_rumors');
    expect(next.grayNetworks.byAreaId.area_mong_kok.relationClues.map((clue) => clue.clueId)).toEqual(['clue_valid']);
  });

  it('keeps gray network patches when fallback validation drops a malformed neighboring module', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A bad actor patch should not discard valid gray-network writeback.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_bad_gender',
            name: 'Bad Gender',
            gender: 'robot'
          }
        ],
        grayNetworkPatches: [
          {
            areaId: 'area_mong_kok',
            areaName: 'Mong Kok',
            climate: [
              {
                key: 'market_collection_rumor',
                label: 'Market collection rumor',
                level: 'rumor',
                summary: 'Market stallholders mention collectors moving after midnight.',
                confidence: 'low'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.actorPatches).toHaveLength(0);
    expect(response.writeback.grayNetworkPatches).toHaveLength(1);
    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.actorPatches.0.gender')).toBe(true);
    expect(next.grayNetworks.byAreaId.area_mong_kok.climate[0]?.key).toBe('market_collection_rumor');
  });

  it('keeps valid gray network scalar fields when an optional removal field is malformed', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A malformed removal field should not move the patch into the current default area.',
      writeback: {
        grayNetworkPatches: [
          {
            areaId: 'area_tsim_sha_tsui',
            areaName: 'Tsim Sha Tsui',
            climate: [
              {
                key: 'pier_rumors',
                label: 'Pier rumors',
                level: 'rumor',
                summary: 'Dockside rumors are getting louder.',
                confidence: 'low'
              }
            ],
            removeIds: {
              actorIds: 'not-an-array'
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.grayNetworks.byAreaId.area_tsim_sha_tsui.areaName).toBe('Tsim Sha Tsui');
    expect(next.grayNetworks.byAreaId.area_tsim_sha_tsui.climate[0]?.key).toBe('pier_rumors');
    expect(next.grayNetworks.byAreaId[state.location.currentPlaceId]).toBeUndefined();
    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.grayNetworkPatches.0.removeIds.actorIds')).toBe(
      true
    );
  });

  it('does not remove a canonical gray-network actor through an unverified same-name temporary id', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_ho_001 = {
      ...state.actors.player,
      actorId: 'actor_ho_001',
      name: 'Ho Ka Keung',
      englishName: 'Ho Ka Keung',
      aliases: [],
      currentIdentity: 'gang_member'
    };
    state.grayNetworks.byAreaId.area_mong_kok = {
      areaId: 'area_mong_kok',
      areaName: 'Mong Kok',
      climate: [],
      knownOrganizations: [],
      keyPlaces: [],
      relatedPeople: [
        {
          actorId: 'actor_ho_001',
          visibleRole: 'runner',
          knownTieSummary: 'Known street runner.',
          confidence: 'medium',
          visibility: { police: 'known' },
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: []
        }
      ],
      relationClues: [],
      actionRisks: [],
      suggestedActions: []
    };
    const response = validateNarratorResponse({
      narrativeText: 'The same person is referenced by a temporary label and removed from the visible gray-network list.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_temp_keung',
            name: 'Ho Ka Keung',
            statusSummary: 'No longer relevant to this area projection.'
          }
        ],
        grayNetworkPatches: [
          {
            areaId: 'area_mong_kok',
            removeIds: {
              actorIds: ['npc_temp_keung']
            },
            relationClues: [
              {
                clueId: 'clue_unknown_refs',
                summary: 'The rumor mentions a new society name and a back room the player has not confirmed.',
                certainty: 'rumor',
                confidence: 'low',
                visibility: { police: 'rumor' },
                relatedActorIds: ['actor_missing_gray_ref'],
                relatedPlaceIds: ['place_missing_gray_ref'],
                relatedOrganizationIds: ['org_missing_gray_ref'],
                relatedCaseIds: ['case_missing_gray_ref']
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.grayNetworks.byAreaId.area_mong_kok.relatedPeople).toEqual([
      expect.objectContaining({ actorId: 'actor_ho_001' })
    ]);
    expect(next.actors.actor_missing_gray_ref).toBeUndefined();
    expect(next.places.place_missing_gray_ref).toBeUndefined();
    expect(next.organizations.org_missing_gray_ref).toBeUndefined();
    expect(next.cases.case_missing_gray_ref).toBeUndefined();
    expect(Object.values(next.memories).some((memory) => memory.text.includes('back room'))).toBe(false);
    expect(next.grayNetworks.byAreaId.area_mong_kok.relationClues[0]?.relatedActorIds).toEqual(['actor_missing_gray_ref']);
  });

  it('does not create gray network state from narrative text alone', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'Rumors say a hidden gray network controls the market, but no structured writeback is provided.',
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.grayNetworks.byAreaId).toEqual({});
  });

  it('runs monthly settlement when a turn advances into a later month', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      startTime: { year: 1988, month: 8, day: 31, hour: 23, minute: 50 }
    });
    state.finance.bankBalance = 1000;
    state.player.economy.bankBalance = 1000;
    state.finance.cashflows.salary_spc_1988 = {
      itemId: 'salary_spc_1988',
      direction: 'income',
      kind: 'salary',
      title: '警队月薪',
      amount: 4200,
      account: 'bank',
      summary: '高级警员固定月薪。',
      activeFromMonth: '1988-08',
      relatedAssetItemIds: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      source: 'opening',
      status: 'active',
      visibility: 'private'
    };
    const response = validateNarratorResponse({
      narrativeText: 'The player finishes a late-night duty and enters a new month.',
      timePatch: { elapsedMinutes: 20, reason: 'Crosses midnight into next month.' },
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.time.month).toBe(9);
    expect(next.finance.bankBalance).toBe(5200);
    expect(next.player.economy.bankBalance).toBe(5200);
    expect(next.finance.reports[0]?.monthKey).toBe('1988-08');
  });

  it('accepts minimal memory writeback and fills safe defaults', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The player listens to a rumor in the report room.',
      writeback: {
        memories: [
          {
            text: 'Someone mentioned a suspicious car near the station.'
          }
        ],
        actorMemories: [
          {
            actorId: 'player',
            text: 'The player heard a rumor but has not verified it.'
          }
        ]
      }
    });

    expect(response.writeback.memories[0]).toMatchObject({
      kind: 'world',
      importance: 50,
      visibility: 'player_known',
      certainty: 'claim'
    });
    expect(response.writeback.actorMemories[0]).toMatchObject({
      importance: 50,
      visibility: 'player_known'
    });
  });

  it('normalizes common memory kind aliases in regular writeback', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The station talks about yesterday’s political news.',
      writeback: {
        memories: [
          {
            text: 'The Sino-British Joint Declaration was signed yesterday.',
            kind: 'historical',
            importance: 100,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ]
      }
    });

    expect(response.writeback.memories[0]?.kind).toBe('world');
  });

  it('upserts a new NPC actor from structured actor patches without adding NPC vitals', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player meets a tea stall owner who has heard about a late-night quarrel.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_uncle_wah',
            name: 'Uncle Wah',
            englishName: 'Wah Lee',
            gender: 'male',
            computedAge: 58,
            currentIdentity: 'civilian',
            publicIdentity: 'Tea stall owner',
            actualIdentitySummary: 'A late-night tea stall owner who hears street talk around Mong Kok.',
            positionSummary: 'Runs a tea stall near Mong Kok Police Station.',
            profileSummary: 'An older streetwise shopkeeper who talks carefully when police are nearby.',
            appearance: 'Thin, grey-haired, always wiping a cup with a towel.',
            clothing: 'Old short-sleeved shirt and dark trousers.',
            equipment: ['Tea towel', 'Cash tin'],
            personality: 'Careful, observant, reluctant to offend either side.',
            speechStyle: 'Uses short Cantonese-flavored street phrases.',
            motivation: 'Keep the stall peaceful and avoid trouble.',
            longTermGoal: 'Stay useful enough that both police and locals leave him alone.',
            values: 'Practical survival and neighborhood face.',
            attributes: { body: 35, action: 40, perception: 65, thinking: 55, negotiation: 60, will: 50 },
            relationshipSummary: 'He knows the player by uniform, not personally.',
            attitudeTowardPlayer: 'Polite but guarded.',
            interactionScore: 8,
            trustTendency: 'Will talk about public rumors but withholds sensitive names.',
            entanglementSummary: 'May know a few night-shift drivers and local shopkeepers.',
            longTermMemorySummary: 'He remembers which officers behave fairly on the street.',
            recentInteractionMemory: 'He noticed the player asking about a late-night quarrel.',
            keyMemories: [
              {
                text: 'He heard two men arguing near the tea stall after midnight.',
                importance: 65,
                visibility: 'player_known'
              }
            ],
            statusSummary: 'Alert and cautious.',
            bodyConditionSummary: 'Tired from the night shift but otherwise fine.',
            currentPlaceId: 'place_mong_kok_police_station',
            currentSceneId: 'scene_report_room',
            presence: 'present',
            visibility: 'player_known',
            importance: 60,
            worldpackActorData: {
              hk1988: {
                generationSource: 'rumor_scene'
              }
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_uncle_wah;

    expect(actor.name).toBe('Uncle Wah');
    expect(actor.vitals).toBeUndefined();
    expect(actor.actualIdentitySummary).toContain('tea stall owner');
    expect(actor.relationshipSummary).toContain('uniform');
    expect(actor.attitudeTowardPlayer).toBe('Polite but guarded.');
    expect(actor.interactionScore).toBe(8);
    expect(actor.bodyConditionSummary).toContain('Tired');
    expect(actor.keyMemories).toHaveLength(0);
    expect(Object.values(next.memories).find((memory) => memory.text.includes('arguing'))).toMatchObject({
      kind: 'actor',
      relatedActorIds: ['npc_uncle_wah'],
      relatedTurnId: 'turn_0001'
    });
    expect(actor.worldpackActorData?.hk1988).toEqual({ generationSource: 'rumor_scene' });
    expect(next.scenes.scene_report_room.presentActorIds).toContain('npc_uncle_wah');
  });

  it('remaps a public figure creation to one stable canonical actor while keeping real names', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player meets a rising singer at the radio corridor.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_zhang_xueyou',
            name: '张学友',
            gender: 'male',
            computedAge: 27,
            currentIdentity: 'civilian',
            publicIdentity: '正在快速上升的男歌手',
            actualIdentitySummary: '张学友是被唱片公司和电台宣传围绕的上升期歌手。',
            positionSummary: '在电台走廊等候访问。',
            profileSummary: '张学友唱功突出，正被唱片合约和宣传压力推着往前走。',
            appearance: '年轻、干净，神情带一点紧张。',
            clothing: '浅色衬衫和深色西裤。',
            equipment: ['访问通行证'],
            personality: '礼貌、敏感，对记者保持距离。',
            speechStyle: '回答谨慎，语气温和。',
            motivation: '完成访问，同时避免卷入不必要的麻烦。',
            longTermGoal: '靠唱功在歌坛站稳。',
            values: '专业、守信，不愿拖累身边工作人员。',
            attributes: { body: 42, action: 45, perception: 58, thinking: 55, negotiation: 54, will: 60 },
            relationshipSummary: '刚与玩家在电台后台短暂接触。',
            attitudeTowardPlayer: '礼貌但戒备。',
            interactionScore: 12,
            trustTendency: '只会谈公开行程，除非玩家给出可信保护。',
            entanglementSummary: '唱片公司、电台、粉丝信和校园演出都可能牵连他。',
            longTermMemorySummary: '记得警察曾在电台后台询问粉丝信。',
            recentInteractionMemory: '刚被玩家问起粉丝信夹带线索。',
            statusSummary: '准备进入直播间。',
            bodyConditionSummary: '正常，只是略显疲惫。',
            currentPlaceId: 'place_kln_tang_broadcast_drive',
            presence: 'mentioned',
            visibility: 'player_known',
            importance: 78
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_zhang_xueyou',
            actorName: '张学友',
            text: '张学友记得玩家问过粉丝信夹带线索。',
            importance: 55,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_seed_fig_jacky_crooner_rising;

    expect(next.actors.npc_zhang_xueyou).toBeUndefined();
    expect(actor).toMatchObject({
      actorId: 'npc_seed_fig_jacky_crooner_rising',
      name: '张学友',
      englishName: 'Jacky Cheung',
      worldpackActorData: {
        hk1988: {
          eraSeedIdentity: {
            canonicalSeedId: 'fig_jacky_crooner_rising',
            seedFigureId: 'fig_jacky_crooner_rising',
            displayName: '张学友',
            englishName: 'Jacky Cheung'
          }
        }
      }
    });
    expect(actor.aliases).toEqual(expect.arrayContaining(['学友仔', '新晋唱将']));
    expect(JSON.stringify(actor)).not.toMatch(/张学佑|张学仁/u);
    expect(Object.values(next.memories).find((memory) => memory.relatedActorIds.includes(actor.actorId))?.text).toContain('张学友');
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'seed_identity_actor_remapped',
          path: ['writeback', 'actorPatches', 0, 'actorId']
        })
      ])
    );
  });

  it('remaps a city power public figure to one stable canonical actor while keeping real names', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player hears a senior police command name in a briefing.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_real_police_commissioner',
            name: '李君夏',
            englishName: 'Li Kwan-ha',
            aliases: ['一哥李Sir', 'Li Kwan-ha'],
            gender: 'male',
            computedAge: 54,
            currentIdentity: 'police',
            publicIdentity: '皇家香港警察高层指挥人物',
            actualIdentitySummary: '李君夏在总部记者会前调整警队口径。',
            positionSummary: '警队高层办公室。',
            profileSummary: '李君夏以纪律、舆论和政治压力影响基层案件处理。',
            appearance: '西装整洁，神情严肃。',
            clothing: '深色西装。',
            equipment: ['简报文件'],
            personality: '克制、强硬、重视秩序。',
            speechStyle: '简短、正式。',
            motivation: '控制警队公开口径。',
            longTermGoal: '维持警队形象。',
            values: '纪律、秩序、政治敏感度。',
            attributes: { body: 45, action: 48, perception: 70, thinking: 78, negotiation: 76, will: 82 },
            relationshipSummary: '玩家只通过内部通告听见他。',
            attitudeTowardPlayer: '无直接关系。',
            interactionScore: 0,
            trustTendency: '不会直接接触基层警员。',
            entanglementSummary: '记者会、投诉科和廉署压力都围绕他转动。',
            longTermMemorySummary: '李君夏被提到与旺角行动压力有关。',
            recentInteractionMemory: '李君夏的名字出现在简报里。',
            statusSummary: '只作为总部压力存在。',
            bodyConditionSummary: '正常。',
            currentPlaceId: 'place_police_headquarters_wan_chai',
            presence: 'mentioned',
            visibility: 'player_known',
            importance: 96
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_real_police_commissioner',
            actorName: '李君夏',
            text: '李君夏在简报里被提到，旺角行动可能受到总部压力。',
            importance: 70,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_power_power_police_commissioner_li_man_bun;

    expect(next.actors.npc_real_police_commissioner).toBeUndefined();
    expect(actor).toMatchObject({
      actorId: 'npc_power_power_police_commissioner_li_man_bun',
      name: '李君夏',
      englishName: 'Li Kwan-ha',
      worldpackActorData: {
        hk1988: {
          cityPowerIdentity: {
            canonicalSeedId: 'power_police_commissioner_li_man_bun',
            displayName: '李君夏',
            englishName: 'Li Kwan-ha'
          }
        }
      }
    });
    expect(actor.aliases).toEqual(expect.arrayContaining(['李处长', '一哥李Sir']));
    expect(JSON.stringify(actor)).not.toMatch(/李文彬爵士|Sir Raymond Lee/u);
    expect(Object.values(next.memories).find((memory) => memory.relatedActorIds.includes(actor.actorId))?.text).toContain(
      '李君夏'
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'city_power_identity_actor_remapped',
          path: ['writeback', 'actorPatches', 0, 'actorId']
        })
      ])
    );
  });

  it('updates an existing seed actor instead of creating a later real-name duplicate', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_seed_fig_jacky_crooner_rising = createActorDefaults({
      actorId: 'npc_seed_fig_jacky_crooner_rising',
      name: '张学友',
      englishName: 'Jacky Cheung',
      aliases: ['学友仔', '新晋唱将'],
      gender: 'male',
      computedAge: 27,
      currentIdentity: 'civilian',
      publicIdentity: '正在快速上升的男歌手',
      positionSummary: '电台和唱片公司之间奔走的歌手。',
      profileSummary: '唱功突出，仍在上升期。',
      statusSummary: '暂未在场。',
      worldpackActorData: {
        hk1988: {
          eraSeedIdentity: {
            canonicalSeedId: 'fig_jacky_crooner_rising',
            seedFigureId: 'fig_jacky_crooner_rising',
            displayName: '张学友',
            englishName: 'Jacky Cheung'
          }
        }
      }
    });

    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'A later turn tries to introduce the same singer with the source name.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_zhang_xueyou',
            name: '张学友',
            statusSummary: '刚在电台走廊被人提起。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_zhang_xueyou).toBeUndefined();
    expect(next.actors.npc_seed_fig_jacky_crooner_rising?.name).toBe('张学友');
    expect(next.actors.npc_seed_fig_jacky_crooner_rising?.statusSummary).toBe('刚在电台走廊被人提起。');
    expect(Object.values(next.actors).filter((actor) => actor.name === '张学友')).toHaveLength(1);
    expect(JSON.stringify(next.actors.npc_seed_fig_jacky_crooner_rising)).not.toMatch(/张学佑|张学仁/u);
  });

  it('normalizes out-of-range interactionScore without dropping the actor patch', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The player confronts a resentful street youth.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_chen_zijian',
            name: '陈子健',
            englishName: 'Derek Chan',
            gender: 'male',
            computedAge: 21,
            currentIdentity: 'gang_member',
            publicIdentity: '街面青年',
            actualIdentitySummary: '旺角街面边缘青年，替社团跑腿但不是核心成员。',
            positionSummary: '在旺角游戏机中心附近逗留。',
            profileSummary: '年轻、好面子，遇到警察时会先硬撑。',
            appearance: '瘦削，头发略长，眼神闪避。',
            clothing: '旧牛仔外套和深色裤子。',
            equipment: ['打火机', '香烟'],
            personality: '逞强、防备心重，但压力大时容易露怯。',
            speechStyle: '带街头粤语，语速偏快。',
            motivation: '保住面子，同时避免真的被带回警署。',
            longTermGoal: '在街面站稳脚跟，不再被人当小弟使唤。',
            values: '讲义气但更怕吃亏。',
            attributes: { body: 45, action: 52, perception: 50, thinking: 42, negotiation: 38, will: 46 },
            relationshipSummary: '刚被玩家盘问，对玩家有敌意但仍会保持距离。',
            attitudeTowardPlayer: '恼怒、戒备。',
            interactionScore: -10,
            trustTendency: '不会主动交代，只会在压力下吐出边角信息。',
            entanglementSummary: '可能与附近社团头目和游戏机中心有关联。',
            longTermMemorySummary: '记得玩家曾在街面截查他。',
            recentInteractionMemory: '刚被玩家按住盘问。',
            statusSummary: '紧张且愤懑。',
            bodyConditionSummary: '正常，但手心冒汗。',
            currentPlaceId: 'place_mongkok_street',
            currentSceneId: 'scene_patrol_interrogation',
            presence: 'present',
            visibility: 'player_known',
            importance: 55
          }
        ]
      }
    });

    expect(response.writeback.actorPatches).toHaveLength(1);
    expect(response.writeback.actorPatches[0]?.interactionScore).toBe(0);
  });

  it('keeps actor memories for actors created in the same writeback response', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player confronts a resentful street youth and remembers his reaction.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_chen_zijian',
            name: '陈子健',
            englishName: 'Derek Chan',
            gender: 'male',
            computedAge: 21,
            currentIdentity: 'gang_member',
            publicIdentity: '街面青年',
            actualIdentitySummary: '旺角街面边缘青年，替社团跑腿但不是核心成员。',
            positionSummary: '在旺角游戏机中心附近逗留。',
            profileSummary: '年轻、好面子，遇到警察时会先硬撑。',
            appearance: '瘦削，头发略长，眼神闪避。',
            clothing: '旧牛仔外套和深色裤子。',
            equipment: ['打火机', '香烟'],
            personality: '逞强、防备心重，但压力大时容易露怯。',
            speechStyle: '带街头粤语，语速偏快。',
            motivation: '保住面子，同时避免真的被带回警署。',
            longTermGoal: '在街面站稳脚跟，不再被人当小弟使唤。',
            values: '讲义气但更怕吃亏。',
            attributes: { body: 45, action: 52, perception: 50, thinking: 42, negotiation: 38, will: 46 },
            relationshipSummary: '刚被玩家盘问，对玩家有敌意但仍会保持距离。',
            attitudeTowardPlayer: '恼怒、戒备。',
            interactionScore: -10,
            trustTendency: '不会主动交代，只会在压力下吐出边角信息。',
            entanglementSummary: '可能与附近社团头目和游戏机中心有关联。',
            longTermMemorySummary: '记得玩家曾在街面截查他。',
            recentInteractionMemory: '刚被玩家按住盘问。',
            statusSummary: '紧张且愤懑。',
            bodyConditionSummary: '正常，但手心冒汗。',
            currentPlaceId: 'place_mongkok_street',
            currentSceneId: 'scene_patrol_interrogation',
            presence: 'present',
            visibility: 'player_known',
            importance: 55
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_chen_zijian',
            text: '他记得玩家在游戏机中心外截查过他，并因此对玩家保持敌意。',
            importance: 65,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actorMemory = Object.values(next.memories).find((memory) => memory.text.includes('游戏机中心外截查'));

    expect(next.actors.npc_chen_zijian.interactionScore).toBe(0);
    expect(next.actors.npc_chen_zijian.recentInteractionMemory).toContain('游戏机中心外截查');
    expect(actorMemory).toMatchObject({
      kind: 'actor',
      relatedActorIds: ['npc_chen_zijian'],
      importance: 50
    });
    expect((next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code === 'missing_actor_reference')).toBe(false);
  });

  it('keeps NPC aliases, call names, and opening-style traits when creating a new actor patch', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player meets a named street contact with a stable nickname.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_big_fai',
            name: '梁辉',
            englishName: 'Fai Leung',
            aliases: ['大辉', 'Big Fai'],
            callName: '辉哥',
            gender: 'male',
            computedAge: 32,
            visualAgeAnchor: '三十出头',
            currentIdentity: 'gang_member',
            publicIdentity: '蓝灯笼边缘人物',
            actualIdentitySummary: '和联胜外围跑腿，常在旺角夜场一带收风。',
            roleProfiles: {
              triad: {
                status: 'active',
                societyName: '和联胜',
                roleTitle: '外围跑腿',
                rankSummary: '未扎职，只替人传话。',
                territorySummary: '旺角夜场与后巷。',
                patronActorIds: [],
                peerActorIds: [],
                rivalActorIds: [],
                obligationSummary: '替上面的人传话和盯场。',
                riskSummary: '容易被上级牺牲。'
              }
            },
            organizationIds: ['org_wo_luen_shing'],
            positionSummary: '和联胜外围跑腿。',
            profileSummary: '有点虚张声势，但知道夜场消息。',
            appearance: '三十出头，瘦高，左眉有旧疤。',
            clothing: '花衬衫和廉价皮鞋。',
            equipment: ['打火机', '传呼机'],
            personality: '嘴硬、好面子，遇到警察会先试探。',
            speechStyle: '街头粤语口吻，喜欢用反问。',
            motivation: '在社团边缘混出一点位置。',
            longTermGoal: '得到扎职机会。',
            values: '面子、义气和现实利益。',
            attributes: { body: 52, action: 60, perception: 58, thinking: 45, negotiation: 55, will: 48 },
            activeTraits: [
              {
                traitId: 'trait_streetwise_runner',
                name: '街面跑腿',
                source: 'llm_generated',
                description: '熟悉夜场后巷和街头传话规矩。',
                effectSummary: '夜场、社团边缘和街面消息判断更稳定。',
                scopes: ['underworld', 'street'],
                visibility: 'player_known'
              }
            ],
            relationshipSummary: '刚认识玩家，知道玩家是警察。',
            attitudeTowardPlayer: '虚张声势但戒备。',
            interactionScore: 4,
            trustTendency: '不会主动交出上级名字。',
            entanglementSummary: '牵连旺角夜场、社团传话和街坊压力。',
            longTermMemorySummary: '记得哪些警察喜欢追问社团线索。',
            recentInteractionMemory: '第一次被玩家叫住盘问。',
            statusSummary: '强装镇定。',
            currentPlaceId: 'place_mong_kok_police_station',
            currentSceneId: 'scene_report_room',
            presence: 'present',
            visibility: 'player_known',
            importance: 62
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_big_fai;

    expect(actor.aliases).toEqual(['大辉', 'Big Fai']);
    expect(actor.callName).toBe('辉哥');
    expect(actor.visualAgeAnchor).toBe('三十出头');
    expect(actor.organizationIds).toEqual(['org_wo_luen_shing']);
    expect(actor.activeTraits[0]).toMatchObject({
      traitId: 'trait_streetwise_runner',
      name: '街面跑腿',
      status: 'active'
    });
  });

  it('applies actor organization relations and syncs visible organization ids', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player learns a reporter has a steady TVB desk role.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            organizationRelations: [
              {
                organizationId: 'org_tvb',
                relationType: 'informal_contact',
                roleTitle: '采访联络',
                departmentOrUnit: '新闻部',
                summary: '玩家通过报案室认识一名无线电视新闻部联络人。',
                visibility: 'player_known',
                isPrimary: false
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.organizationIds).toContain('org_tvb');
    expect(next.actors.player.organizationRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: 'org_tvb',
          relationType: 'informal_contact',
          roleTitle: '采访联络',
          departmentOrUnit: '新闻部',
          summary: '玩家通过报案室认识一名无线电视新闻部联络人。'
        })
      ])
    );
  });

  it('updates duplicate actor organization relations by organization, relation type, and role title', () => {
    const state = createInitialRuntimeState();
    const first = applyNarratorResponse(
      state,
      validateNarratorResponse({
        narrativeText: 'The player first records a loose TVB contact.',
        writeback: {
          actorPatches: [
            {
              actorId: 'player',
              organizationRelations: [
                {
                  organizationId: 'org_tvb',
                  relationType: 'informal_contact',
                  roleTitle: '采访联络',
                  summary: '只是知道有这样一条线。',
                  visibility: 'player_known'
                }
              ]
            }
          ]
        }
      })
    );
    const next = applyNarratorResponse(
      first,
      validateNarratorResponse({
        narrativeText: 'The contact becomes clearer after a follow-up call.',
        writeback: {
          actorPatches: [
            {
              actorId: 'player',
              organizationRelations: [
                {
                  organizationId: 'org_tvb',
                  relationType: 'informal_contact',
                  roleTitle: '采访联络',
                  departmentOrUnit: '新闻部',
                  summary: '无线新闻部有人愿意听玩家说明街面情况。',
                  visibility: 'player_known'
                }
              ]
            }
          ]
        }
      })
    );
    const relations = next.actors.player.organizationRelations.filter(
      (relation) =>
        relation.organizationId === 'org_tvb' &&
        relation.relationType === 'informal_contact' &&
        relation.roleTitle === '采访联络'
    );

    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      departmentOrUnit: '新闻部',
      summary: '无线新闻部有人愿意听玩家说明街面情况。'
    });
  });

  it('keeps hidden actor organization relations out of ordinary organization ids', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A covert contact is recorded as hidden relation data.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            organizationRelations: [
              {
                organizationId: 'org_icac',
                relationType: 'source',
                roleTitle: '秘密接触',
                summary: '玩家私下收到廉署人员试探，但这不是公开事实。',
                visibility: 'hidden'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.organizationRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: 'org_icac',
          relationType: 'source',
          visibility: 'hidden'
        })
      ])
    );
    expect(next.actors.player.organizationIds).not.toContain('org_icac');
  });

  it('drops bad actor organization relation items without dropping the actor patch', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'One good organization relation and one malformed relation are returned.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            name: '测试警员',
            organizationRelations: [
              {
                organizationId: 'org_tvb',
                relationType: 'informal_contact',
                roleTitle: '采访联络',
                summary: '玩家认识一名电视台新闻联系人。',
                visibility: 'player_known'
              },
              {
                organizationId: 'org_icac',
                summary: '缺少 relationType 的坏关系。'
              }
            ]
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.name).toBe('测试警员');
    expect(next.actors.player.organizationIds).toContain('org_tvb');
    expect(next.actors.player.organizationRelations.some((relation) => relation.organizationId === 'org_icac')).toBe(false);
    expect(
      response.validationWarnings?.some(
        (warning) => warning.path.join('.') === 'writeback.actorPatches.0.organizationRelations.1.relationType'
      )
    ).toBe(true);
  });

  it('applies female profile writeback to an adult female NPC without adding NPC vitals', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player meets a nightclub hostess who knows the local entertainment circuit.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_lily_ho',
            name: '何丽莲',
            englishName: 'Lily Ho',
            gender: 'female',
            birthDate: '1962-02-18',
            computedAge: 26,
            currentIdentity: 'civilian',
            publicIdentity: '夜总会公关',
            actualIdentitySummary: '尖沙咀夜总会公关，熟悉片场、酒吧和社团边缘人物。',
            roleProfiles: {
              civilian: {
                status: 'active',
                publicOccupation: '夜总会公关',
                communitySummary: '与娱乐圈、夜场和街面消息有联系。'
              }
            },
            positionSummary: '夜总会公关。',
            profileSummary: '精明、会观察警察反应的年轻女性。',
            appearance: '二十多岁，妆容精致，眼神警觉。',
            clothing: '深色连衣裙和短外套。',
            equipment: ['小手袋', '名片夹'],
            personality: '圆滑、戒备、懂得用沉默保护自己。',
            speechStyle: '轻快但留有余地的港式口吻。',
            motivation: '保住工作和熟客关系。',
            longTermGoal: '离开夜场，做一份更稳定的生意。',
            values: '自保、现实、重视人情债。',
            attributes: { body: 44, action: 55, perception: 70, thinking: 60, negotiation: 72, will: 58 },
            relationshipSummary: '刚认识玩家，知道玩家是警察。',
            attitudeTowardPlayer: '礼貌但戒备。',
            interactionScore: 8,
            trustTendency: '只愿意说不牵连自己的消息。',
            entanglementSummary: '可能牵连夜场、娱乐圈和社团人情。',
            longTermMemorySummary: '记得哪些警员会照规矩办事。',
            recentInteractionMemory: '第一次被玩家问起夜场消息。',
            statusSummary: '谨慎观察。',
            currentPlaceId: 'place_mong_kok_police_station',
            currentSceneId: 'scene_report_room',
            presence: 'present',
            visibility: 'player_known',
            importance: 65,
            femaleProfile: {
              birthday: '2月18日',
              addressToPlayer: '王Sir',
              relationshipNotes: '把玩家视作需要谨慎应对的警察。',
              publicIntimacyNotes: '公开场合保持距离，只用礼貌称呼。',
              appearanceDescription: '妆容精致，神情克制。',
              bodyDescription: '身形匀称，动作谨慎。',
              clothingStyle: '夜场工作服偏精致，但外套遮掩明显。',
              personalityCore: '现实、戒备，懂得在危险关系中留后路。',
              emotionalBoundary: '不轻易交出私人住址和熟客名单。',
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
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_lily_ho;

    expect(actor.vitals).toBeUndefined();
    expect(actor.femaleProfile?.addressToPlayer).toBe('王Sir');
    expect(actor.femaleProfile?.adultPrivateProfile?.profileStatus).toBe('ready');
    expect(actor.femaleProfile?.adultPrivateProfile?.womb?.status).toBe('未受孕');
    expect(actor.femaleProfile?.adultPrivateProfile?.partProfiles?.胸部?.description).toBe('乳房饱满柔软，乳晕色泽自然，乳头敏感。');
  });

  it('creates an adult private profile anchor when adult female writeback omits it', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_may = createActorDefaults({
      actorId: 'npc_may',
      name: '周嘉敏',
      englishName: 'May Chow',
      gender: 'female',
      birthDate: '1965-02-14',
      computedAge: 23,
      currentIdentity: 'civilian',
      publicIdentity: '玩家女友',
      profileSummary: '在医院工作的年轻女性。',
      presence: 'mentioned',
      interactionScore: 80,
      importance: 85,
      visibility: 'player_known'
    });
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player remembers May waiting outside the station.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_may',
            femaleProfile: {
              birthday: '2月14日',
              addressToPlayer: '阿星',
              appearanceDescription: '笑起来眉眼弯弯。',
              relationshipNotes: '稳定女友，关心玩家夜班安全。'
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const profile = next.actors.npc_may?.femaleProfile;

    expect(profile?.addressToPlayer).toBe('阿星');
    expect(profile?.adultPrivateProfile).toMatchObject({
      enabled: true,
      ageConfirmedAdult: true,
      source: 'writeback',
      profileStatus: 'ready',
      womb: {
        status: '未受孕',
        cervixStatus: '紧闭',
        records: []
      }
    });
    const privateProfileText = JSON.stringify(profile?.adultPrivateProfile);
    expect(privateProfileText).not.toContain('待补全');
    expect(privateProfileText).not.toContain('pending');
    expect(privateProfileText).not.toContain('暂无记录');
    expect(privateProfileText).not.toContain('视觉锚点');
    expect(privateProfileText).not.toContain('锚点已建立');
    expect(privateProfileText).not.toContain('依据成年女性档案');
    expect(privateProfileText).not.toContain('保持一致');
    expect(profile?.adultPrivateProfile?.partProfiles?.胸部?.description).toMatch(/乳房|乳头|乳晕|乳尖/);
    expect(profile?.adultPrivateProfile?.partProfiles?.胸部?.description).not.toContain('周嘉敏');
    expect(profile?.adultPrivateProfile?.partProfiles?.胸部?.description).not.toContain('笑起来眉眼弯弯');
    expect(profile?.adultPrivateProfile?.partProfiles?.小穴?.description).toMatch(/阴唇|阴蒂|穴口|阴道/);
    expect(profile?.adultPrivateProfile?.partProfiles?.小穴?.description).not.toContain('周嘉敏');
    expect(profile?.adultPrivateProfile?.partProfiles?.屁穴?.description).toMatch(/屁穴|肛|后庭|臀缝/);
    expect(profile?.adultPrivateProfile?.partProfiles?.屁穴?.description).not.toContain('周嘉敏');
    expect(profile?.adultPrivateProfile?.fetishNotes).toMatch(/欲望|挑逗|支配|掌控|羞耻|性/);
    expect(profile?.adultPrivateProfile?.fetishNotes).not.toContain('稳定女友');
    expect(profile?.adultPrivateProfile?.sensitivePoints).not.toContain('稳定女友');
    expect(profile?.adultPrivateProfile?.updatedAt).toEqual(next.time);
  });

  it('rejects adult private profile text that leaks public biography or romance notes into NSFW fields', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_may = createActorDefaults({
      actorId: 'npc_may',
      name: '周嘉敏',
      englishName: 'May Chow',
      gender: 'female',
      birthDate: '1965-02-14',
      computedAge: 23,
      currentIdentity: 'civilian',
      publicIdentity: '玩家女友',
      profileSummary: '在医院工作的年轻女性。',
      presence: 'mentioned',
      interactionScore: 80,
      importance: 85,
      visibility: 'player_known'
    });
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The narrator writes a corrupted adult private profile.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_may',
            femaleProfile: {
              birthday: '2月14日',
              addressToPlayer: '阿星',
              appearanceDescription: '笑起来眉眼弯弯。',
              relationshipNotes: '稳定女友，关心玩家夜班安全。',
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
                  胸部: {
                    description:
                      '周嘉敏胸部轮廓柔和，面容清秀带点市井烟火气，经常帮家里做家务，非常关心男友的安全。'
                  },
                  小穴: {
                    description: '周嘉敏私处像隐秘甬道，肤色与体态相称，整体干净细腻。'
                  },
                  屁穴: {
                    description: '周嘉敏臀间肌肤细致，屁穴小而紧闭，和身形气质相称。'
                  }
                },
                fetishNotes:
                  '非常信任和爱慕周星星，周星星职级提升带来稳定收入，或者正式向她求婚。',
                sensitivePoints: '敏感点集中在颈侧、乳尖、腰侧、大腿内侧和坚硬巨物带来的压迫感。'
              }
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const privateProfile = next.actors.npc_may?.femaleProfile?.adultPrivateProfile;
    const privateProfileText = JSON.stringify(privateProfile);

    expect(privateProfileText).not.toContain('家务');
    expect(privateProfileText).not.toContain('男友');
    expect(privateProfileText).not.toContain('面容');
    expect(privateProfileText).not.toContain('信任和爱慕');
    expect(privateProfileText).not.toContain('稳定收入');
    expect(privateProfileText).not.toContain('求婚');
    expect(privateProfileText).not.toContain('甬道');
    expect(privateProfileText).not.toContain('巨物');
    expect(privateProfileText).not.toContain('坚硬');
    expect(privateProfile?.partProfiles?.胸部?.description).toMatch(/乳房|乳头|乳晕|乳尖/);
    expect(privateProfile?.partProfiles?.小穴?.description).toMatch(/阴唇|阴蒂|穴口|阴道/);
    expect(privateProfile?.partProfiles?.屁穴?.description).toMatch(/屁穴|肛|后庭|臀缝/);
    expect(privateProfile?.fetishNotes).toMatch(/欲望|挑逗|支配|掌控|羞耻|性/);
  });

  it('keeps public female profile but ignores adult private writeback for underage female NPCs', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player meets a teenage witness outside the station.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_teen_witness',
            name: '林小敏',
            englishName: 'Mandy Lam',
            gender: 'female',
            birthDate: '1973-01-01',
            computedAge: 15,
            currentIdentity: 'civilian',
            publicIdentity: '学生目击者',
            actualIdentitySummary: '住在附近的学生，偶然目击街角争执。',
            positionSummary: '学生目击者。',
            profileSummary: '紧张的少女目击者。',
            appearance: '十五岁，校服整齐，神情害怕。',
            clothing: '中学校服。',
            equipment: ['书包'],
            personality: '紧张、怕惹麻烦。',
            speechStyle: '小声、断续。',
            motivation: '尽快回家。',
            longTermGoal: '避免被卷进麻烦。',
            values: '听家人话，害怕陌生成年人。',
            attributes: { body: 35, action: 48, perception: 60, thinking: 45, negotiation: 30, will: 35 },
            relationshipSummary: '第一次见到玩家。',
            attitudeTowardPlayer: '害怕但愿意回答简单问题。',
            interactionScore: 1,
            trustTendency: '高度戒备。',
            entanglementSummary: '可能牵连街角争执。',
            longTermMemorySummary: '记得自己看到过几个人在街角吵架。',
            recentInteractionMemory: '刚被玩家安抚。',
            statusSummary: '惊慌。',
            presence: 'present',
            visibility: 'player_known',
            importance: 55,
            femaleProfile: {
              relationshipNotes: '未成年目击者，只能保留普通人物档案。',
              personalityCore: '害怕、依赖家人。',
              adultPrivateProfile: {
                enabled: true,
                ageConfirmedAdult: true,
                summary: '这个字段必须被本地门禁忽略。'
              }
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const actor = next.actors.npc_teen_witness;

    expect(actor.femaleProfile?.relationshipNotes).toContain('未成年目击者');
    expect(actor.femaleProfile?.adultPrivateProfile).toBeUndefined();
  });

  it('does not interpret relationship-like actor names and only rejects structurally incomplete patches', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A triad underling watches the player from across the street.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_sang_biu_underling',
            name: '丧彪的手下',
            gender: 'male',
            currentIdentity: 'triad',
            publicIdentity: '社团边缘成员',
            actualIdentitySummary: '和联胜丧彪派出的收数小弟。',
            profileSummary: 'A young triad underling watching the player family shop.',
            appearance: 'Long hair and a cheap leather jacket.',
            personality: 'Aggressive but nervous around uniformed police.',
            speechStyle: 'Short, provocative street slang.',
            motivation: 'Warn the shop owner without drawing police attention.',
            relationshipSummary: 'He knows the player only as the shop owner son in uniform.',
            attitudeTowardPlayer: 'Provocative and wary.',
            trustTendency: 'Hostile and evasive.',
            statusSummary: 'Watching from across the street.',
            presence: 'present'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_sang_biu_underling).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics?.[0]).toMatchObject({
      code: 'incomplete_new_actor_patch',
      path: ['writeback', 'actorPatches', 0]
    });
    expect((next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code === 'invalid_actor_name')).toBe(
      false
    );
  });

  it('rejects sparse new NPC actor patches instead of creating hollow character cards', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A named street contact appears but the model only gives a thin patch.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_ah_chuen',
            name: 'Ah Chuen',
            currentIdentity: 'civilian',
            publicIdentity: 'Street contact'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_ah_chuen).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics?.[0]).toMatchObject({
      code: 'incomplete_new_actor_patch',
      path: ['writeback', 'actorPatches', 0]
    });
  });

  it('does not merge an invented actorId into an existing NPC by name alone', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_opening_0002 = {
      ...state.actors.player,
      actorId: 'actor_opening_0002',
      name: 'Chan Keung',
      englishName: 'Keung',
      currentIdentity: 'police',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      presence: 'present',
      longTermMemorySummary: 'He has mentored the player for three months.',
      recentInteractionMemory: 'He went out to buy late-night snacks.',
      keyMemories: [],
      vitals: undefined
    };

    const response = validateNarratorResponse({
      narrativeText: 'Chan Keung teaches the player an old street lesson.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_keung_4921',
            name: 'Chan Keung',
            recentInteractionMemory: 'He warned the player not to casually break the street balance.',
            statusSummary: 'Eating fish balls while teaching the rookie.'
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_keung_4921',
            text: 'He remembers warning the player about street retaliation.',
            importance: 70
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.actor_opening_0002.recentInteractionMemory).toBe('He went out to buy late-night snacks.');
    expect(next.actors.actor_opening_0002.statusSummary).not.toContain('fish balls');
    expect(next.actors.actor_opening_0002.keyMemories).toHaveLength(0);
    expect(Object.values(next.memories).some((memory) => memory.text.includes('street retaliation'))).toBe(false);
    expect(next.actors.npc_keung_4921).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'incomplete_new_actor_patch',
        path: ['writeback', 'actorPatches', 0]
      })
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'remapped_actor_reference')).toBe(
      false
    );
  });

  it('uses actorId as the sole runtime reference instead of guessing identity from names', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_opening_0003 = {
      ...state.actors.player,
      actorId: 'actor_opening_0003',
      name: 'May Lan',
      englishName: 'May Lan',
      aliases: ['Auntie May'],
      gender: 'female',
      birthDate: '1942-03-15',
      computedAge: 52,
      visualAgeAnchor: 'early fifties',
      currentIdentity: 'civilian',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      presence: 'present',
      profileSummary: 'A diner owner who knows the neighborhood.',
      recentInteractionMemory: 'She complained about night noise near the stall.',
      keyMemories: [],
      vitals: undefined
    };
    state.actors.actor_ho_001 = {
      ...state.actors.player,
      actorId: 'actor_ho_001',
      name: 'Ho Ka Keung',
      englishName: 'Ho Ka Keung',
      aliases: ['Ah Ho'],
      gender: 'male',
      computedAge: 22,
      currentIdentity: 'civilian',
      currentPlaceId: 'place_mongkok_street',
      currentSceneId: 'scene_patrol_interrogation',
      presence: 'present',
      profileSummary: 'A young man loitering near the arcade.',
      recentInteractionMemory: 'He was stopped by the player on patrol.',
      keyMemories: [],
      vitals: undefined
    };

    const response = validateNarratorResponse({
      narrativeText: 'Ho Ka Keung gives the player a reluctant answer.',
      writeback: {
        actorPatches: [
          {
            actorId: 'actor_opening_0003',
            name: 'Ho Ka Keung',
            englishName: 'A Ho',
            currentIdentity: 'gang_member',
            recentInteractionMemory: 'He admitted he was waiting near the arcade for a gang message.',
            interactionScore: 18,
            statusSummary: 'Nervous and cooperative.'
          }
        ],
        actorMemories: [
          {
            actorId: 'actor_opening_0003',
            actorName: 'Ho Ka Keung',
            text: 'He remembers being pressured by the player during the patrol stop.',
            importance: 70
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.actor_opening_0003.name).toBe('Ho Ka Keung');
    expect(next.actors.actor_opening_0003.aliases).toEqual(['Auntie May']);
    expect(next.actors.actor_opening_0003.birthDate).toBe('1942-03-15');
    expect(next.actors.actor_opening_0003.currentIdentity).toBe('gang_member');
    expect(next.actors.actor_opening_0003.statusSummary).toContain('cooperative');
    expect(next.actors.actor_opening_0003.interactionScore).toBe(18);
    expect(next.actors.actor_ho_001.statusSummary).not.toContain('cooperative');
    expect(next.actors.actor_ho_001.interactionScore).not.toBe(18);
    expect(next.actors.actor_ho_001.keyMemories).toHaveLength(0);
    expect(
      Object.values(next.memories).some(
        (memory) => memory.relatedActorIds.includes('actor_opening_0003') && memory.text.includes('patrol stop')
      )
    ).toBe(true);
    expect((next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code === 'conflicting_actor_identity')).toBe(
      false
    );
    expect((next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code === 'ambiguous_actor_reference')).toBe(
      false
    );
    expect((next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code === 'remapped_actor_reference')).toBe(
      false
    );
  });

  it('does not classify a new actor name with local semantic rules', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A street youth known only as Ah Keung appears.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_thug_ah_keung',
            name: '阿强',
            gender: 'male',
            computedAge: 22,
            currentIdentity: 'gang_member',
            publicIdentity: '街头青年',
            actualIdentitySummary: '在外区活动的社团外围青年。',
            positionSummary: '外围跑腿。',
            profileSummary: '对警察戒备，遇到压力容易退缩。',
            appearance: '二十出头，短发，身形偏瘦。',
            clothing: '旧夹克和牛仔裤。',
            personality: '虚张声势，胆量不足。',
            speechStyle: '街头口吻，回答简短。',
            motivation: '避免被捕。',
            longTermGoal: '在社团里混到稳定位置。',
            values: '面子和自保。',
            relationshipSummary: '刚被玩家接触。',
            attitudeTowardPlayer: '畏惧和戒备。',
            interactionScore: 10,
            trustTendency: '不会轻易透露上线。',
            entanglementSummary: '与外区街头社团有联系。',
            longTermMemorySummary: '记得曾被警察盘问。',
            recentInteractionMemory: '第一次被玩家截停。',
            statusSummary: '紧张。',
            presence: 'present',
            visibility: 'player_known',
            importance: 35,
            attributes: { body: 42, action: 48, perception: 38, thinking: 34, negotiation: 32, will: 30 }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_thug_ah_keung?.name).toBe('阿强');
    expect(
      (next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code?.includes('canonical') === true)
    ).toBe(false);
    expect(
      (next.storyLog.at(-1)?.writebackDiagnostics ?? []).some((issue) => issue.code?.includes('nickname') === true)
    ).toBe(false);
  });

  it('stores actor memory writeback only in the unified local memory ledger', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_opening_0002 = {
      ...state.actors.player,
      actorId: 'actor_opening_0002',
      name: 'Chan Keung',
      englishName: 'Keung Chan',
      currentIdentity: 'police',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      presence: 'present',
      keyMemories: [],
      vitals: undefined
    };

    const response = validateNarratorResponse({
      narrativeText: 'Chan Keung remembers a useful street lesson.',
      writeback: {
        actorMemories: [
          {
            actorId: 'actor_opening_0002',
            text: 'He remembers teaching the player how to read a tea stall rumor.',
            importance: 72,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const localMemory = Object.values(next.memories).find((memory) =>
      memory.text.includes('tea stall rumor')
    );

    expect(next.actors.actor_opening_0002.keyMemories).toHaveLength(0);
    expect(next.actors.actor_opening_0002.recentInteractionMemory).toContain('tea stall rumor');
    expect(localMemory).toMatchObject({
      kind: 'actor',
      text: 'He remembers teaching the player how to read a tea stall rumor.',
      relatedActorIds: ['actor_opening_0002'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      relatedTurnId: 'turn_0001',
      importance: 50,
      visibility: 'player_known',
      certainty: 'claim',
      embeddingText: 'He remembers teaching the player how to read a tea stall rumor.'
    });
  });

  it('stores at most one unified actor memory per actor and softly drops extra same-turn memories', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_peer = {
      ...state.actors.player,
      actorId: 'actor_peer',
      name: 'Peer Officer'
    };
    const duplicateText = 'He remembers the player warning him about the same alley.';
    const distinctText = 'He remembers the player asking a separate question about the mahjong shop.';
    const response = validateNarratorResponse({
      narrativeText: 'A turn returns both legacy and current actor memory fields.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            keyMemories: [
              {
                text: duplicateText,
                importance: 55,
                visibility: 'player_known'
              }
            ]
          }
        ],
        actorMemories: [
          {
            actorId: 'player',
            text: duplicateText,
            importance: 70,
            visibility: 'player_known'
          },
          {
            actorId: 'player',
            text: distinctText,
            importance: 60,
            visibility: 'player_known'
          },
          {
            actorId: 'actor_peer',
            text: duplicateText,
            importance: 60,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const memories = Object.values(next.memories);

    expect(
      memories.filter((memory) => memory.relatedActorIds.includes('player') && memory.text === duplicateText)
    ).toHaveLength(1);
    expect(memories.find((memory) => memory.relatedActorIds.includes('player') && memory.text === duplicateText)?.importance).toBe(50);
    expect(
      memories.filter((memory) => memory.relatedActorIds.includes('player') && memory.text === distinctText)
    ).toHaveLength(0);
    expect(
      memories.filter((memory) => memory.relatedActorIds.includes('actor_peer') && memory.text === duplicateText)
    ).toHaveLength(1);
    expect(
      (next.storyLog.at(-1)?.writebackDiagnostics ?? []).filter((issue) => issue.code === 'extra_actor_memory_ignored')
    ).toHaveLength(2);
  });

  it('treats empty optional actor role profiles as omitted in writeback patches', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The player meets a police constable who has no gang or civilian profile.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_constable_lam',
            name: 'Lam',
            roleProfiles: {
              police: {
                rank: 'Constable',
                department: 'Uniform Branch'
              },
              triad: {
                societyName: '',
                roleTitle: '',
                territorySummary: ''
              },
              civilian: {
                publicOccupation: ''
              }
            }
          }
        ]
      }
    });

    const profiles = response.writeback.actorPatches[0]?.roleProfiles;

    expect(profiles?.police?.rank).toBe('Constable');
    expect(profiles?.triad).toBeUndefined();
    expect(profiles?.civilian).toBeUndefined();
  });

  it('normalizes common human labels for actor current identity in writeback patches', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The player identifies several people around the street corner.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_snake_ming',
            name: 'Snake Ming',
            currentIdentity: 'triad'
          },
          {
            actorId: 'npc_shop_owner',
            name: 'Shop Owner',
            currentIdentity: '市民'
          },
          {
            actorId: 'npc_pc_chan',
            name: 'Chan',
            currentIdentity: '警员'
          },
          {
            actorId: 'npc_unknown',
            name: 'Unknown Man',
            currentIdentity: 'unknown'
          }
        ]
      }
    });

    expect(response.writeback.actorPatches[0]?.currentIdentity).toBe('gang_member');
    expect(response.writeback.actorPatches[1]?.currentIdentity).toBe('civilian');
    expect(response.writeback.actorPatches[2]?.currentIdentity).toBe('police');
    expect(response.writeback.actorPatches[3]?.currentIdentity).toBeUndefined();
  });

  it('keeps valid response content when one writeback item is invalid', () => {
    const response = validateNarratorResponse({
      narrativeText: 'The player watches a nervous man leave the tea stall.',
      suggestedActions: ['Follow him', 'Ask the shopkeeper what happened'],
      timePatch: { elapsedMinutes: 8, reason: 'Observed the scene and asked a brief question' },
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_invalid',
            name: 'Invalid Person',
            gender: 'robot',
            currentIdentity: 'civilian'
          },
          {
            actorId: 'npc_shopkeeper',
            name: 'Shopkeeper',
            gender: 'male',
            currentIdentity: 'civilian',
            positionSummary: 'A tea stall owner.',
            profileSummary: 'A cautious shopkeeper who hears street talk.'
          }
        ],
        memories: [
          {
            text: 'A nervous man left the tea stall after seeing the player.',
            importance: 55
          }
        ]
      }
    });

    expect(response.narrativeText).toContain('tea stall');
    expect(response.suggestedActions).toEqual(['Follow him', 'Ask the shopkeeper what happened']);
    expect(response.timePatch?.elapsedMinutes).toBe(8);
    expect(response.writeback.actorPatches).toHaveLength(1);
    expect(response.writeback.actorPatches[0]?.actorId).toBe('npc_shopkeeper');
    expect(response.writeback.memories).toHaveLength(1);
    expect(response.validationWarnings?.[0]).toMatchObject({
      path: ['writeback', 'actorPatches', 0, 'gender']
    });
  });

  it('applies and clamps player vitals patches from structured writeback', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player runs through the alley and catches his breath.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            vitalsPatch: {
              healthDelta: -8,
              staminaDelta: -35,
              conditionSummary: '左肩擦伤，刚跑完一段路，呼吸还没稳。'
            }
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.vitals.health).toBe(92);
    expect(next.player.vitals.stamina).toBe(65);
    expect(next.player.vitals.conditionSummary).toContain('左肩擦伤');
    expect(next.actors.player.vitals).toEqual(next.player.vitals);
  });

  it('applies writeback v1.5 player patches for economy, home, clothing, equipment, and reputation', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player comes home with a new impression left in the neighborhood.',
      writeback: {
        playerPatch: {
          economy: {
            moneyDelta: 500,
            monthlyPressureSet: 70,
            financeSummary: '刚收了薪水，但家里接下来还要交租和还债。'
          },
          homeBase: {
            placeId: 'place_sham_shui_po_tenement_room',
            placeName: '深水埗唐楼住处',
            housingType: '唐楼分租房',
            summary: '一间靠近楼梯口的狭窄分租房。',
            householdSummary: '母亲同住，弟弟偶尔回来借钱。'
          },
          clothing: {
            currentSummary: '夏季军装制服，皮带束得很紧。',
            mode: 'duty_uniform',
            lastChangedReason: '玩家明确换上军装制服。'
          },
          equipment: ['点三八左轮', '木制警棍', '手提无线电'],
          reputation: {
            notorietyDelta: 25,
            overallReputationDelta: 8,
            summary: '旺角附近开始有人知道他肯听人说话，但警队内部仍在观察。',
            reason: '本回合玩家在街坊面前处理得体。',
            circlePatches: [
              {
                circle: 'neighborhoodMedia',
                visibilityDelta: 20,
                standingDelta: 15,
                summary: '附近街坊开始知道他肯听人说话。',
                reason: '玩家耐心听完投诉。'
              },
              {
                circle: 'police',
                standingSet: -10,
                summary: '部分上级觉得他还不太服管。',
                reason: '他没有完全按上级期待的方式收口。'
              }
            ]
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writebackVersion).toBe('1.5');
    expect(next.player.economy.bankBalance).toBe(500);
    expect(next.player.economy.monthlyPressure).toBe(70);
    expect(next.player.economy.financeSummary).toContain('交租');
    expect(next.player.homeBase.placeId).toBe('place_sham_shui_po_tenement_room');
    expect(next.player.homeBase.householdSummary).toContain('弟弟');
    expect(next.player.clothing).toContain('夏季军装');
    expect(next.player.equipment).toEqual(['点三八左轮', '木制警棍', '手提无线电']);
    expect(next.actors.player.clothing).toBe(next.player.clothing);
    expect(next.actors.player.equipment).toEqual(next.player.equipment);
    expect(next.player.reputation.notoriety).toBe(25);
    expect(next.player.reputation.overallReputation).toBe(8);
    expect(next.player.reputation.summary).toContain('旺角附近');
    expect(next.player.reputation.circles.neighborhoodMedia.visibility).toBe(20);
    expect(next.player.reputation.circles.neighborhoodMedia.standing).toBe(15);
    expect(next.player.reputation.circles.police.standing).toBe(-10);
    expect(next.player.reputation.logs).toHaveLength(3);
    expect(next.player.reputation.logs[0]).toMatchObject({
      kind: 'overall',
      notorietyDelta: 25,
      overallReputationDelta: 8
    });
  });

  it('ignores reputation patches without both summary and reason', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'Ordinary talk should not change reputation without clear audit fields.',
      writeback: {
        playerPatch: {
          reputation: {
            notorietyDelta: 30,
            overallReputationDelta: -10,
            summary: 'Missing reason should not apply.',
            circlePatches: [
              {
                circle: 'police',
                visibilityDelta: 20,
                standingDelta: -5,
                reason: 'Missing summary should not apply.'
              },
              {
                circle: 'neighborhoodMedia',
                visibilityDelta: 15,
                standingDelta: -10,
                summary: 'Missing reason should not apply.'
              },
              {
                circle: 'business',
                visibilityDelta: 12,
                standingDelta: 4,
                summary: 'Shopkeepers appreciate his restraint.',
                reason: 'He calmed a dispute without embarrassing the shop.'
              }
            ]
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.reputation.notoriety).toBe(state.player.reputation.notoriety);
    expect(next.player.reputation.overallReputation).toBe(state.player.reputation.overallReputation);
    expect(next.player.reputation.circles.police.visibility).toBe(state.player.reputation.circles.police.visibility);
    expect(next.player.reputation.circles.neighborhoodMedia.visibility).toBe(
      state.player.reputation.circles.neighborhoodMedia.visibility
    );
    expect(next.player.reputation.circles.business.visibility).toBe(12);
    expect(next.player.reputation.circles.business.standing).toBe(4);
    expect(next.player.reputation.logs).toHaveLength(1);
    expect(next.player.reputation.logs[0]).toMatchObject({ kind: 'circle', circle: 'business' });
  });

  it('applies assetPatch upserts and removals as structured item ownership state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player keeps a watch and an old rental room becomes relevant.',
      writeback: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_gold_watch_001',
              category: 'valuable',
              name: 'Gold watch',
              summary: 'A gold watch received from a nightclub owner after closing time.',
              detail: 'The source is socially risky, but the item is already in the player owned property list.',
              evidence: {
                caseId: 'case_nightclub_fight',
                caseTitle: 'Nightclub fight',
                summary: 'The watch may connect the nightclub owner to the later complaint.',
                disputed: true,
                disputeSummary: 'Its relevance is disputed because it was given before the complaint was filed.'
              }
            },
            {
              itemId: 'asset_home_sham_shui_po_room',
              category: 'fixedAsset',
              name: 'Sham Shui Po rented room',
              summary: 'A cramped rented room used as the player home.',
              fixedAssetType: 'residence',
              holdingRelation: 'rented',
              primaryUse: 'home',
              locationSummary: 'A subdivided room in Sham Shui Po.',
              ownershipSummary: 'Rented under a verbal arrangement with the landlord.',
              accessSummary: 'The player can return there unless family or landlord pressure changes it.'
            },
            {
              itemId: 'asset_motorcycle_001',
              category: 'vehicle',
              name: 'Borrowed motorcycle',
              summary: 'A motorcycle sometimes borrowed from a cousin.',
              vehicleType: 'motorcycle',
              holdingRelation: 'borrowed',
              condition: 'usable',
              locationSummary: 'Usually parked near the family building.',
              accessSummary: 'Available only when the cousin is not using it.',
              mobilityProfile: {
                mode: 'motorcycle',
                timeMultiplier: 0.7,
                availabilitySummary: 'Fast for short urban movement, but not always available.'
              }
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.assets.items.asset_gold_watch_001).toMatchObject({
      category: 'valuable',
      name: 'Gold watch',
      evidence: {
        caseId: 'case_nightclub_fight',
        disputed: true
      }
    });
    expect(next.assets.items.asset_home_sham_shui_po_room).toMatchObject({
      category: 'fixedAsset',
      fixedAssetType: 'residence',
      holdingRelation: 'rented'
    });
    expect(next.assets.items.asset_motorcycle_001).toMatchObject({
      category: 'vehicle',
      vehicleType: 'motorcycle',
      mobilityProfile: {
        mode: 'motorcycle',
        timeMultiplier: 0.7
      }
    });

    const removeResponse = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player hands the gold watch to the case file.',
      writeback: {
        assetPatch: {
          removeItems: [
            {
              itemId: 'asset_gold_watch_001',
              reason: 'Moved into the case material list.',
              movedToCaseId: 'case_nightclub_fight'
            }
          ]
        }
      }
    });
    const afterRemove = applyNarratorResponse(next, removeResponse);

    expect(afterRemove.assets.items.asset_gold_watch_001).toBeUndefined();
    expect(afterRemove.assets.items.asset_home_sham_shui_po_room).toBeDefined();
  });

  it('mirrors asset evidence links into the case evidence store', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The pager is kept as material for an intimidation case.',
      writeback: {
        casePatches: [
          {
            caseId: 'case_pager_intimidation',
            title: 'Pager intimidation',
            caseType: 'intimidation',
            status: 'investigating',
            playerRole: 'assist',
            summary: 'A pager may connect the intimidation calls to a known debt collector.',
            currentFocus: 'Preserve the pager and match the callback numbers.',
            playerVisibleProgress: 'The player has retained the pager.',
            internalProgressSummary: 'The case still needs number verification.',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId]
          }
        ],
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_pager_sun',
              category: 'equipment',
              name: 'Motorola pager',
              summary: 'A pager taken from Sun Yiu-fai after the intimidation report.',
              relatedActorIds: ['player'],
              relatedCaseIds: ['case_pager_intimidation'],
              relatedPlaceIds: [state.location.currentPlaceId],
              evidence: {
                caseId: 'case_pager_intimidation',
                caseTitle: 'Pager intimidation',
                summary: 'The pager directly links Sun Yiu-fai to the callback number used in the threat.',
                disputed: false
              }
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);
    const evidenceId = 'evidence_asset_asset_pager_sun';

    expect(next.caseEvidence[evidenceId]).toMatchObject({
      evidenceId,
      caseId: 'case_pager_intimidation',
      title: 'Motorola pager',
      evidenceType: 'physical',
      sourceSummary: '物品与资产：Motorola pager',
      summary: 'The pager directly links Sun Yiu-fai to the callback number used in the threat.',
      relatedAssetItemId: 'asset_pager_sun',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId]
    });
    expect(next.cases.case_pager_intimidation.evidenceIds).toContain(evidenceId);
  });

  it('tracks special clothing as wearable owned property without using equipment slots', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        asset_old_baton: {
          itemId: 'asset_old_baton',
          category: 'equipment',
          name: 'Old baton',
          summary: 'A standard baton.',
          relatedActorIds: [],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          importance: 10,
          visibility: 'player_known'
        }
      },
      equippedItemIds: ['asset_old_baton']
    };
    state.player.equipment = ['Old baton'];
    state.actors.player.equipment = ['Old baton'];
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player changes before going to dinner.',
      writeback: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_girlfriend_sweater',
              category: 'general',
              name: 'Girlfriend sweater',
              summary: 'A dark wool sweater the player keeps at home.',
              detail: 'It is meaningful because May bought it after the first month together.',
              relatedActorIds: ['npc_may'],
              relatedCaseIds: [],
              relatedPlaceIds: [],
              importance: 25,
              visibility: 'player_known',
              wearable: {
                wearSummary: 'Dark wool sweater from May.',
                significance: 'May bought it for the player, so wearing it can affect intimate and social scenes.'
              }
            }
          ]
        },
        playerPatch: {
          clothing: {
            currentSummary: 'Dark wool sweater from May, plain trousers, off-duty shoes.',
            mode: 'special',
            sourceItemId: 'asset_girlfriend_sweater',
            sourceItemSignificance: 'May bought it for the player before this date.',
            lastChangedReason: 'The player explicitly wore it to meet May.'
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.assets.items.asset_girlfriend_sweater).toMatchObject({
      category: 'general',
      name: 'Girlfriend sweater',
      wearable: {
        wearSummary: 'Dark wool sweater from May.',
        significance: 'May bought it for the player, so wearing it can affect intimate and social scenes.'
      }
    });
    expect(next.player.clothing).toBe('Dark wool sweater from May, plain trousers, off-duty shoes.');
    expect((next.player as any).clothingState).toMatchObject({
      currentSummary: 'Dark wool sweater from May, plain trousers, off-duty shoes.',
      mode: 'special',
      sourceItemId: 'asset_girlfriend_sweater',
      sourceItemSignificance: 'May bought it for the player before this date.',
      lastChangedReason: 'The player explicitly wore it to meet May.'
    });
    expect((next.player as any).clothingState.lastChangedAt).toEqual(next.time);
    expect(next.actors.player.clothing).toBe(next.player.clothing);
    expect(next.player.equipment).toEqual(['Old baton']);
    expect(next.assets.equippedItemIds).toEqual(['asset_old_baton']);
  });

  it('keeps valid assetPatch entries when neighboring asset entries are malformed', () => {
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The player pockets a file while another malformed item is ignored.',
      writeback: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_valid_file',
              category: 'document',
              name: 'Valid file',
              summary: 'A properly described file that should survive tolerant validation.'
            },
            {
              itemId: 'asset_bad_file',
              category: 'document',
              name: 'Missing summary'
            },
            {
              itemId: 'asset_valid_baton',
              category: 'equipment',
              name: 'Valid baton',
              summary: 'A properly described equipment item.'
            }
          ],
          removeItems: [
            {
              itemId: 'asset_old_file',
              reason: 'Moved out of the player inventory.'
            },
            {
              itemId: 'asset_bad_remove'
            }
          ]
        }
      }
    });

    expect(response.writeback.assetPatch?.upsertItems.map((item) => item.itemId)).toEqual([
      'asset_valid_file',
      'asset_valid_baton'
    ]);
    expect(response.writeback.assetPatch?.removeItems.map((item) => item.itemId)).toEqual(['asset_old_file']);
    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.assetPatch.upsertItems.1.summary')).toBe(
      true
    );
    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.assetPatch.removeItems.1.reason')).toBe(
      true
    );
  });

  it('keeps legacy reputationPatches usable by normalizing old circle ids into the new reputation state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A legacy style patch updates local public reputation.',
      writeback: {
        playerPatch: {
          reputationPatches: [
            {
              circle: 'localPublic',
              visibilitySet: 120,
              standingSet: -25,
              summary: '附近街坊听过他，但觉得他手法太硬。',
              reason: 'Legacy local public reputation writeback still has an explicit reason.'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.reputation.circles.neighborhoodMedia.visibility).toBe(120);
    expect(next.player.reputation.circles.neighborhoodMedia.standing).toBe(-25);
    expect(next.player.reputation.logs[0]).toMatchObject({
      kind: 'circle',
      circle: 'neighborhoodMedia'
    });
  });

  it('upserts writeback v1.5 places, scenes, cases, and organizations as durable state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'A teahouse, a film company, and a complaint record become durable facts.',
      writeback: {
        placePatches: [
          {
            placeId: 'place_yau_ma_tei_teahouse',
            name: '庙街旧茶餐厅',
            regionId: 'region_yau_ma_tei',
            type: 'teahouse',
            summary: '靠近庙街的一间旧茶餐厅，熟客和巡警都会经过。',
            publicKnowledge: '街坊知道老板消息灵通。',
            currentState: '晚市刚过，柜台后面仍在点账。',
            relatedActorIds: ['player']
          }
        ],
        scenePatches: [
          {
            sceneId: 'scene_yau_ma_tei_teahouse_counter',
            placeId: 'place_yau_ma_tei_teahouse',
            name: '柜台旁',
            summary: '收银机旁能听到厨房和街口的声音。',
            temporaryState: '老板压低声音说话。',
            presentActorIds: ['player']
          }
        ],
        casePatches: [
          {
            caseId: 'case_noise_complaint_001',
            title: '庙街夜间滋扰投诉',
            type: 'public_order_complaint',
            status: 'open',
            playerAccessLevel: 'assigned',
            summary: '几名住户投诉夜间噪音与恐吓。',
            officialRecordSummary: '报案室记录为噪音滋扰。',
            publicNarrativeSummary: '街坊认为有人借噪音投诉逼走旧租客。',
            playerKnownSummary: '玩家只知道投诉背后可能有人情压力。',
            conflictSummary: '住户、商户与疑似社团中间人互相牵扯。',
            involvedActorIds: ['player'],
            relatedPlaceIds: ['place_yau_ma_tei_teahouse'],
            openQuestions: ['投诉是否被人利用？'],
            currentLeads: ['茶餐厅老板可能知道谁在收风。']
          }
        ],
        organizationPatches: [
          {
            organizationId: 'org_harbour_view_films',
            name: '海景影业',
            type: 'entertainment_company',
            summary: '一家与夜场和片场都有关系的小型电影公司。',
            stanceTowardPlayer: '暂未注意到玩家。',
            pressureSummary: '公司传闻和社团资金有交集。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.places.place_yau_ma_tei_teahouse.name).toBe('庙街旧茶餐厅');
    expect(next.scenes.scene_yau_ma_tei_teahouse_counter.placeId).toBe('place_yau_ma_tei_teahouse');
    expect(next.cases.case_noise_complaint_001.title).toBe('庙街夜间滋扰投诉');
    expect(next.cases.case_noise_complaint_001.status).toBe('investigating');
    expect(next.cases.case_noise_complaint_001.caseType).toBe('public_order_complaint');
    expect(next.cases.case_noise_complaint_001.relatedActorIds).toContain('player');
    expect(next.organizations.org_harbour_view_films.name).toBe('海景影业');
    expect(next.organizations.org_harbour_view_films.pressureSummary).toContain('社团资金');
  });

  it('applies case V1 evidence and deferred events as separate runtime stores', () => {
    const state = createInitialRuntimeState();
    const triggerAt = { ...state.time, day: state.time.day + 3 };
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'Case writeback lands evidence and a delayed prosecution reply.',
      writeback: {
        casePatches: [
          {
            caseId: 'case_bar_assault',
            title: 'Bar assault',
            caseType: 'assault',
            status: 'investigating',
            playerRole: 'assist',
            leadActorName: 'Sergeant Lam',
            summary: 'A bar assault may involve local triad pressure.',
            currentFocus: 'Find witnesses and preserve basic evidence.',
            playerVisibleProgress: 'The player has interviewed one witness.',
            internalProgressSummary: 'The lead officer is still checking CCTV.',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId],
            activityLog: [
              {
                kind: 'created',
                summary: 'The player was assigned to assist the bar assault case.',
                relatedActorIds: ['player'],
                relatedPlaceIds: [state.location.currentPlaceId],
                visibleToPlayer: true
              }
            ]
          }
        ],
        caseEvidencePatches: [
          {
            evidenceId: 'evidence_bar_owner_statement',
            caseId: 'case_bar_assault',
            title: 'Bar owner statement',
            evidenceType: 'statement',
            sourceSummary: 'Recorded by the player.',
            summary: 'The owner saw two men leave through the back door.',
            submittedByActorId: 'player',
            relatedActorIds: ['player'],
            relatedPlaceIds: [state.location.currentPlaceId]
          }
        ],
        deferredEventPatches: [
          {
            eventId: 'deferred_case_bar_assault_review',
            sourceModule: 'case',
            relatedIds: {
              caseId: 'case_bar_assault'
            },
            title: 'Lead officer review',
            summary: 'The lead officer will review the statement later.',
            triggerAt,
            promptInstruction: 'When due, decide how the lead officer responds to the new statement.'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.cases.case_bar_assault.playerRole).toBe('assist');
    expect(next.cases.case_bar_assault.evidenceIds).toContain('evidence_bar_owner_statement');
    expect(next.cases.case_bar_assault.unreadActivityCount).toBe(1);
    expect(next.caseEvidence.evidence_bar_owner_statement.evidenceType).toBe('statement');
    expect(next.caseEvidence.evidence_bar_owner_statement.submittedByActorId).toBe('player');
    expect(next.deferredEvents.deferred_case_bar_assault_review.triggerAt).toEqual(triggerAt);
    expect(next.deferredEvents.deferred_case_bar_assault_review.status).toBe('pending');
  });

  it('normalizes ISO string triggerAt values for deferred event patches', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The lead officer pushes the review slightly later.',
      writeback: {
        deferredEventPatches: [
          {
            eventId: 'deferred_case_bar_assault_review',
            sourceModule: 'case',
            relatedIds: { caseId: 'case_bar_assault' },
            title: 'Lead officer review',
            summary: 'The lead officer will review the statement later.',
            triggerAt: '1988-09-12T21:20:00',
            promptInstruction: 'When due, decide how the lead officer responds to the new statement.'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.validationWarnings?.some((issue) => issue.path.includes('triggerAt'))).not.toBe(true);
    expect(next.deferredEvents.deferred_case_bar_assault_review.triggerAt).toEqual({
      year: 1988,
      month: 9,
      day: 12,
      hour: 21,
      minute: 20
    });
  });

  it('resolves an existing deferred case event without losing the case activity update', () => {
    const state = createInitialRuntimeState();
    const triggerAt = { ...state.time };
    state.cases.case_bar_assault = {
      caseId: 'case_bar_assault',
      title: 'Bar assault',
      caseType: 'assault',
      status: 'investigating',
      playerRole: 'assist',
      leadActorName: 'Sergeant Lam',
      summary: 'A bar assault may involve local triad pressure.',
      currentFocus: 'Wait for the lead officer review.',
      playerVisibleProgress: 'The player has submitted one witness statement.',
      internalProgressSummary: 'The lead officer needs to respond.',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedOrganizationIds: [],
      evidenceIds: ['evidence_bar_owner_statement'],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'player_known',
      createdAt: state.time,
      updatedAt: state.time
    };
    state.deferredEvents.deferred_case_bar_assault_review = {
      eventId: 'deferred_case_bar_assault_review',
      sourceModule: 'case',
      relatedIds: { caseId: 'case_bar_assault' },
      title: 'Lead officer review',
      summary: 'The lead officer will review the statement later.',
      triggerAt,
      visibility: 'hidden',
      promptInstruction: 'When due, decide how the lead officer responds to the new statement.',
      status: 'pending',
      createdAt: state.time
    };

    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The lead officer has reviewed the submitted statement.',
      writeback: {
        casePatches: [
          {
            caseId: 'case_bar_assault',
            playerVisibleProgress: 'The lead officer accepted the statement and asked the player to find one more witness.',
            activityLog: [
              {
                kind: 'status_changed',
                summary: 'Sergeant Lam accepted the statement and gave a follow-up direction.',
                visibleToPlayer: true
              }
            ]
          }
        ],
        deferredEventPatches: [
          {
            eventId: 'deferred_case_bar_assault_review',
            summary: 'Sergeant Lam accepted the statement and gave a follow-up direction.',
            status: 'resolved'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.deferredEvents.deferred_case_bar_assault_review.status).toBe('resolved');
    expect(next.deferredEvents.deferred_case_bar_assault_review.resolvedAt).toEqual(state.time);
    expect(next.cases.case_bar_assault.activityLog.at(-1)?.summary).toContain('Sergeant Lam accepted');
    expect(next.cases.case_bar_assault.unreadActivityCount).toBe(1);
  });

  it('keeps valid case evidence and deferred event patches when another writeback item is invalid', () => {
    const state = createInitialRuntimeState();
    const triggerAt = { ...state.time, hour: state.time.hour + 2 };
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'A mixed writeback includes one bad actor patch and valid case follow-up data.',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_bad_gender',
            name: 'Bad Gender',
            gender: 'robot'
          }
        ],
        caseEvidencePatches: [
          {
            evidenceId: 'evidence_valid_statement',
            caseId: 'case_bar_assault',
            title: 'Witness statement',
            evidenceType: 'statement',
            summary: 'The witness saw two men leave through the back alley.'
          }
        ],
        deferredEventPatches: [
          {
            eventId: 'deferred_valid_followup',
            sourceModule: 'case',
            relatedIds: { caseId: 'case_bar_assault' },
            title: 'Lead officer follow-up',
            summary: 'The lead officer will respond after checking the statement.',
            triggerAt,
            promptInstruction: 'When due, decide how the lead officer responds.'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.validationWarnings?.some((warning) => warning.path.join('.') === 'writeback.actorPatches.0.gender')).toBe(
      true
    );
    expect(next.actors.npc_bad_gender).toBeUndefined();
    expect(next.caseEvidence.evidence_valid_statement.summary).toContain('back alley');
    expect(next.deferredEvents.deferred_valid_followup.triggerAt).toEqual(triggerAt);
  });

  it('ignores unknown future writeback modules without losing the narrative turn', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: 'The turn includes an unsupported future module.',
      writeback: {
        futureImageAnchorPatches: [
          {
            actorId: 'player',
            promptAnchor: 'future field not consumed yet'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.storyLog.at(-1)?.text).toBe('The turn includes an unsupported future module.');
    expect(next.turnCounter).toBe(state.turnCounter + 1);
  });

  it('mirrors player actor name and location patches into canonical player state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player moves to a different room under a new name.',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            name: 'Renamed Player',
            englishName: 'Johnny Wong',
            currentPlaceId: 'place_interview_room',
            currentSceneId: 'scene_interview_room'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.name).toBe('Renamed Player');
    expect(next.actors.player.englishName).toBe('Johnny Wong');
    expect(next.actors.player.currentPlaceId).toBe('place_interview_room');
    expect(next.actors.player.currentSceneId).toBe('scene_interview_room');
    expect(next.player.name).toBe('Renamed Player');
    expect(next.player.englishName).toBe('Johnny Wong');
    expect(next.location.currentPlaceId).toBe('place_interview_room');
    expect(next.location.currentSceneId).toBe('scene_interview_room');
  });

  it('records the latest map movement when player location changes through actor writeback', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player drives from Mong Kok Police Station to Yau Ma Tei Police Station.',
      timePatch: { elapsedMinutes: 18, reason: 'Short cross-district police vehicle movement.' },
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            currentPlaceId: 'place_yau_ma_tei_police_station',
            currentSceneId: 'scene_yau_ma_tei_report_room'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect((next as any).map.lastMovement).toEqual({
      turnId: 'turn_0001',
      fromPlaceId: 'place_mong_kok_police_station',
      fromSceneId: 'scene_report_room',
      toPlaceId: 'place_yau_ma_tei_police_station',
      toSceneId: 'scene_yau_ma_tei_report_room',
      startedAt: state.time,
      arrivedAt: next.time,
      elapsedMinutes: 18
    });
  });

  it('infers player movement from a player-related current matter at a newly generated place', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player follows the nightclub trouble into the VIP corridor.',
      timePatch: { elapsedMinutes: 12, reason: 'Walk from the station to Portland Street and enter the nightclub.' },
      writeback: {
        placePatches: [
          {
            placeId: 'place_new_dong_lok_nightclub',
            name: '新东乐夜总会',
            nameZh: '新东乐夜总会',
            nameEn: 'New Dong Lok Nightclub',
            regionId: 'region_kowloon',
            districtId: 'district_mong_kok',
            type: 'nightclub',
            category: 'nightlife',
            summary: '钵兰街一带的夜总会，江湖看场和影视圈老板常在此出没。',
            currentState: '警方从后门进入，贵宾房走廊气氛紧绷。',
            source: 'runtime_generated',
            confidence: 'high',
            visualAnchor: {
              mapId: 'hk_1988_main',
              x: 0.552,
              y: 0.438,
              precision: 'approximate',
              source: 'runtime_inferred',
              basisPlaceIds: ['place_portland_street']
            }
          }
        ],
        currentMatterPatches: [
          {
            id: 'matter_new_dong_lok_raid',
            title: '新东乐夜总会的警方查牌行动',
            summary: '警员3821进入新东乐夜总会贵宾房走廊，拦截试图报信的看场领头。',
            status: 'active',
            priority: 80,
            visibility: 'known',
            source: 'street',
            matterKind: 'world',
            relatedActorIds: ['player'],
            relatedPlaceIds: ['place_portland_street', 'place_new_dong_lok_nightclub'],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_new_dong_lok_nightclub');
    expect(next.actors.player.currentPlaceId).toBe('place_new_dong_lok_nightclub');
    expect((next as any).map.lastMovement).toMatchObject({
      fromPlaceId: 'place_mong_kok_police_station',
      toPlaceId: 'place_new_dong_lok_nightclub',
      elapsedMinutes: 12
    });
  });

  it('promotes current matter actors at the inferred player place into present scene context', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_dong_ge = createActorDefaults({
      actorId: 'npc_dong_ge',
      name: '东哥',
      currentIdentity: 'civilian',
      publicIdentity: '影视投资老板',
      currentPlaceId: 'place_new_dong_lok_nightclub',
      presence: 'mentioned',
      importance: 80
    });
    state.actors.npc_wah = createActorDefaults({
      actorId: 'npc_wah',
      name: '梁志华',
      currentIdentity: 'police',
      publicIdentity: '旺角警署值日警长',
      currentPlaceId: 'place_mong_kok_police_station',
      currentSceneId: 'scene_report_room',
      presence: 'present',
      importance: 80
    });
    state.scenes.scene_report_room = {
      ...state.scenes.scene_report_room,
      presentActorIds: ['player', 'npc_wah']
    };
    const response = validateNarratorResponse({
      narrativeText: '东哥打开V8包房门，和玩家在走廊正面对上。',
      writeback: {
        placePatches: [
          {
            placeId: 'place_new_dong_lok_nightclub',
            name: '新东乐夜总会',
            regionId: 'region_kowloon',
            districtId: 'district_mong_kok',
            type: 'nightclub',
            summary: '钵兰街一带的夜总会。',
            source: 'runtime_generated'
          }
        ],
        scenePatches: [
          {
            sceneId: 'scene_new_dong_lok_vip_corridor',
            placeId: 'place_new_dong_lok_nightclub',
            name: 'V8包房走廊',
            summary: '隔音门外的贵宾区走廊。',
            temporaryState: '东哥刚开门，玩家控制住看场领头。'
          }
        ],
        currentMatterPatches: [
          {
            id: 'matter_new_dong_lok_raid',
            title: '新东乐夜总会的警方查牌行动',
            summary: '东哥已经出现在V8包房门口，梁志华只通过电台施压。',
            status: 'active',
            priority: 80,
            visibility: 'known',
            source: 'street',
            relatedActorIds: ['player', 'npc_dong_ge', 'npc_wah'],
            relatedPlaceIds: ['place_new_dong_lok_nightclub'],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location).toMatchObject({
      currentPlaceId: 'place_new_dong_lok_nightclub',
      currentSceneId: 'scene_new_dong_lok_vip_corridor'
    });
    expect(next.actors.npc_dong_ge.presence).toBe('present');
    expect(next.actors.npc_dong_ge.currentSceneId).toBe('scene_new_dong_lok_vip_corridor');
    expect(next.scenes.scene_new_dong_lok_vip_corridor.presentActorIds).toContain('npc_dong_ge');
    expect(next.actors.npc_wah.presence).toBe('mentioned');
    expect(next.scenes.scene_report_room.presentActorIds).not.toContain('npc_wah');
  });

  it('inherits the current structured location when an existing actor is explicitly marked present', () => {
    const state = createInitialRuntimeState();
    const sceneId = state.location.currentSceneId!;
    state.actors.npc_returning_contact = createActorDefaults({
      actorId: 'npc_returning_contact',
      name: '回场人物',
      currentIdentity: 'civilian',
      presence: 'absent',
      visibility: 'player_known'
    });
    const response = validateNarratorResponse({
      narrativeText: '回场人物已经站在玩家面前。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_returning_contact',
            presence: 'present',
            statusSummary: '正在和玩家当面交谈。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_returning_contact).toMatchObject({
      presence: 'present',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: sceneId
    });
    expect(next.scenes[sceneId].presentActorIds).toContain('npc_returning_contact');
  });

  it('does not create a case from an ordinary police current matter without explicit case classification', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const response = validateNarratorResponse({
      narrativeText: 'The player answers a shopkeeper nuisance call during patrol.',
      writeback: {
        placePatches: [
          {
            placeId: 'place_tung_choi_store',
            name: '通菜街便利店',
            regionId: 'region_kowloon',
            districtId: 'district_mong_kok',
            type: 'convenience_store',
            summary: '通菜街一间普通便利店。',
            source: 'runtime_generated'
          }
        ],
        currentMatterPatches: [
          {
            id: 'matter_tung_choi_store_nuisance',
            title: '通菜街便利店门口滋扰',
            summary: '便利店店员现场求助：两名醉汉在门口滋扰和踢纸箱，暂未构成正式立案材料。',
            status: 'active',
            priority: 35,
            visibility: 'known',
            source: 'street',
            matterKind: 'police_work',
            relatedActorIds: ['player'],
            relatedPlaceIds: ['place_tung_choi_store'],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.cases.case_matter_tung_choi_store_nuisance).toBeUndefined();
    expect(next.dynamicEvents.currentMatters.matter_tung_choi_store_nuisance.relatedCaseIds).toEqual([]);
  });

  it('creates a lightweight case from an explicitly case-classified current matter when no case patch is supplied', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const response = validateNarratorResponse({
      narrativeText: 'The player turns the nightclub dispute into a formal police action.',
      writeback: {
        placePatches: [
          {
            placeId: 'place_new_dong_lok_nightclub',
            name: '新东乐夜总会',
            regionId: 'region_kowloon',
            districtId: 'district_mong_kok',
            type: 'nightclub',
            summary: '钵兰街一带的夜总会。',
            source: 'runtime_generated'
          }
        ],
        currentMatterPatches: [
          {
            id: 'matter_new_dong_lok_raid',
            title: '新东乐夜总会的正式查牌案件',
            summary: '事件涉及疑似袭击、勒索和警员呼叫增援后的正式查牌案件，已按程序准备记录。',
            status: 'active',
            priority: 80,
            visibility: 'known',
            source: 'street',
            matterKind: 'case',
            relatedActorIds: ['player'],
            relatedPlaceIds: ['place_new_dong_lok_nightclub'],
            relatedCaseIds: [],
            relatedOrganizationIds: []
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const autoCase = next.cases.case_matter_new_dong_lok_raid;

    expect(autoCase).toBeDefined();
    expect(autoCase.title).toBe('新东乐夜总会的正式查牌案件');
    expect(autoCase.status).toBe('intake');
    expect(autoCase.playerRole).toBe('execute');
    expect(autoCase.relatedPlaceIds).toEqual(['place_new_dong_lok_nightclub']);
    expect(autoCase.activityLog[0]?.summary).toContain('事件涉及疑似袭击');
    expect(next.dynamicEvents.currentMatters.matter_new_dong_lok_raid.relatedCaseIds).toContain(autoCase.caseId);
  });

  it('clears stale scene presence when player movement reuses a scene from another place', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_old_contact = {
      ...state.actors.player,
      actorId: 'npc_old_contact',
      name: 'Old Contact',
      englishName: 'Old Contact',
      currentPlaceId: 'place_mong_kok_police_station',
      currentSceneId: 'scene_report_room',
      presence: 'present',
      importance: 55
    };
    state.scenes.scene_report_room = {
      ...state.scenes.scene_report_room,
      presentActorIds: ['player', 'npc_old_contact']
    };
    const response = validateNarratorResponse({
      narrativeText: 'The player drives to Yau Ma Tei but the model repeats the old report room scene id.',
      timePatch: { elapsedMinutes: 12, reason: 'Short police vehicle movement to another station.' },
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            currentPlaceId: 'place_yau_ma_tei_police_station',
            currentSceneId: 'scene_report_room'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.location.currentPlaceId).toBe('place_yau_ma_tei_police_station');
    expect(next.location.currentSceneId).toBeUndefined();
    expect(next.actors.player.currentPlaceId).toBe('place_yau_ma_tei_police_station');
    expect(next.actors.player.currentSceneId).toBeUndefined();
    expect(next.actors.npc_old_contact.presence).toBe('mentioned');
    expect(next.actors.npc_old_contact.lastSeenPlaceId).toBe('place_mong_kok_police_station');
    expect(next.scenes.scene_report_room.presentActorIds).not.toContain('player');
    expect(next.scenes.scene_report_room.presentActorIds).not.toContain('npc_old_contact');
    expect((next as any).map.lastMovement).toMatchObject({
      turnId: 'turn_0001',
      fromPlaceId: 'place_mong_kok_police_station',
      fromSceneId: 'scene_report_room',
      toPlaceId: 'place_yau_ma_tei_police_station',
      elapsedMinutes: 12
    });
    expect((next as any).map.lastMovement.toSceneId).toBeUndefined();
  });

  it('mirrors player trait progress and gains into canonical player state', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player earns a steady hand.',
      writeback: {
        traitProgress: [
          {
            actorId: 'player',
            traitId: 'trait_steady_hand',
            name: 'Steady Hand',
            delta: 25,
            maxProgress: 100,
            reason: 'Handled pressure calmly'
          }
        ],
        traitGains: [
          {
            actorId: 'player',
            traitId: 'trait_calm_under_pressure',
            name: 'Calm Under Pressure',
            source: 'story_earned',
            description: 'Keeps composure during stressful incidents.',
            effectSummary: 'Improves responses during tense police work.',
            scopes: ['pressure']
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.traitProgress[0]?.traitId).toBe('trait_steady_hand');
    expect(next.player.traitProgress[0]?.traitId).toBe('trait_steady_hand');
    expect(next.player.traitProgress[0]?.progress).toBe(25);
    expect(next.actors.player.activeTraits[0]?.traitId).toBe('trait_calm_under_pressure');
    expect(next.player.activeTraits[0]?.traitId).toBe('trait_calm_under_pressure');
  });

  it('clamps new negative trait progress to zero', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A difficult moment slows progress.',
      writeback: {
        traitProgress: [
          {
            actorId: 'player',
            traitId: 'trait_patience',
            name: 'Patience',
            delta: -10,
            maxProgress: 100,
            reason: 'Setback'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.traitProgress[0]?.progress).toBe(0);
  });

  it('clamps new over-max trait progress to maxProgress', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'A breakthrough pushes progress.',
      writeback: {
        traitProgress: [
          {
            actorId: 'player',
            traitId: 'trait_focus',
            name: 'Focus',
            delta: 100,
            maxProgress: 50,
            reason: 'Breakthrough'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.player.traitProgress[0]?.progress).toBe(50);
  });

  it('isolates cloned game time objects across state, memories, actor memories, and story log', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The turn records several time-bearing entries.',
      writeback: {
        memories: [
          {
            text: 'A general memory.',
            kind: 'world',
            importance: 10,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ],
        actorMemories: [
          {
            actorId: 'player',
            text: 'An actor memory.',
            importance: 10,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const memoryTime = Object.values(next.memories)[0]?.gameTime;
    const actorMemoryTime = Object.values(next.memories).find((memory) => memory.text === 'An actor memory.')?.gameTime;
    const storyTime = next.storyLog.at(-1)?.gameTime;

    expect(next.time).not.toBe(state.time);
    expect(memoryTime).not.toBe(next.time);
    expect(actorMemoryTime).not.toBe(next.time);
    expect(storyTime).not.toBe(next.time);
    expect(memoryTime).not.toBe(actorMemoryTime);
    expect(memoryTime).not.toBe(storyTime);
    expect(actorMemoryTime).not.toBe(storyTime);

    next.time.minute = 1;
    expect(state.time.minute).toBe(30);
    expect(memoryTime?.minute).toBe(30);
    expect(actorMemoryTime?.minute).toBe(30);
    expect(storyTime?.minute).toBe(30);

    if (memoryTime) memoryTime.hour = 9;
    expect(next.time.hour).toBe(8);
    expect(actorMemoryTime?.hour).toBe(8);
    expect(storyTime?.hour).toBe(8);
  });

  it('does not share omitted writeback default arrays across parsed responses', () => {
    const first = validateNarratorResponse({ narrativeText: 'First response.' });
    const second = validateNarratorResponse({ narrativeText: 'Second response.' });

    first.writeback.memories.push({
      text: 'Mutation after parsing.',
      kind: 'turn',
      importance: 1,
      visibility: 'player_known',
      certainty: 'fact'
    });

    expect(second.writeback.memories).toHaveLength(0);
  });

  it('does not overwrite sparse existing memory ids when adding memories', () => {
    const state = createInitialRuntimeState();
    state.memories.memory_0002 = {
      memoryId: 'memory_0002',
      text: 'Imported sparse memory.',
      kind: 'turn',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      relatedTurnId: 'turn_imported',
      gameTime: { ...state.time },
      importance: 50,
      visibility: 'player_known',
      certainty: 'fact',
      embeddingText: 'Imported sparse memory.'
    };
    const response = validateNarratorResponse({
      narrativeText: 'A new memory is written.',
      writeback: {
        memories: [
          {
            text: 'Fresh memory.',
            kind: 'world',
            importance: 10,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.memories.memory_0002.text).toBe('Imported sparse memory.');
    expect(Object.values(next.memories).map((memory) => memory.memoryId)).toContain('memory_0003');
    expect(next.memories.memory_0003?.text).toBe('Fresh memory.');
  });

  it('stores turn summary as story summary and short-term turn memory', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player confirms the manuscript has already been delivered to the newspaper desk.',
      turnSummary: '玩家已经把小说初稿投给报社；后续只能写编辑回音、退稿、采用或报馆联系，不要再次要求投稿。',
      writeback: {}
    });

    const next = applyNarratorResponse(state, response, {
      playerInput: '把小说初稿送去报社投稿。'
    });
    const latestStory = next.storyLog.at(-1);
    const turnMemory = Object.values(next.memories).find(
      (memory) => memory.relatedTurnId === latestStory?.turnId && memory.kind === 'turn'
    );

    expect(latestStory?.summaryText).toContain('小说初稿投给报社');
    expect(next.storyLog.at(-2)).toMatchObject({
      speaker: 'player',
      text: '把小说初稿送去报社投稿。'
    });
    expect(turnMemory).toMatchObject({
      text: expect.stringContaining('后续只能写编辑回音'),
      tier: 'short_term',
      certainty: 'fact'
    });
    expect(turnMemory?.embeddingText).toContain('玩家输入：把小说初稿送去报社投稿。');
    expect(turnMemory?.embeddingText).toContain('回合摘要：玩家已经把小说初稿投给报社');
    expect(turnMemory?.embeddingText).not.toContain(response.narrativeText);
    expect(latestStory?.embeddingText).toBeUndefined();
  });

  it('keeps turnSummary as the only player turn memory while preserving non-turn facts', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player files the report and leaves the desk.',
      turnSummary: '玩家已经提交报告并离开报案室。',
      writeback: {
        memories: [
          {
            text: '这条重复回合摘要不应另建主角记忆。',
            kind: 'turn',
            importance: 90,
            visibility: 'player_known',
            certainty: 'fact'
          },
          {
            text: '报案室夜班登记册由值日警长保管。',
            kind: 'world',
            importance: 40,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const latestTurnId = next.storyLog.at(-1)?.turnId;
    const turnMemories = Object.values(next.memories).filter(
      (memory) => memory.kind === 'turn' && memory.relatedTurnId === latestTurnId
    );
    const worldMemory = Object.values(next.memories).find((memory) => memory.kind === 'world');

    expect(turnMemories).toHaveLength(1);
    expect(turnMemories[0]?.text).toBe('玩家已经提交报告并离开报案室。');
    expect(worldMemory?.text).toBe('报案室夜班登记册由值日警长保管。');
    expect(worldMemory?.tier).toBeUndefined();
  });

  it('keeps heavy narrator diagnostics only on the latest ten narrator turns', () => {
    const state = createInitialRuntimeState();
    state.turnCounter = 12;
    state.storyLog = Array.from({ length: 12 }, (_, index) => ({
      turnId: `turn_${String(index + 1).padStart(4, '0')}`,
      speaker: 'narrator' as const,
      text: `Narrative ${index + 1}`,
      summaryText: `Summary ${index + 1}`,
      gameTime: { ...state.time },
      rawNarratorResponse: `Raw ${index + 1}`,
      writebackDiagnostics: [{ path: ['writeback'], message: `Diagnostic ${index + 1}` }]
    }));
    const response = validateNarratorResponse({
      narrativeText: 'Narrative 13',
      turnSummary: 'Summary 13',
      writeback: {}
    });

    const next = applyNarratorResponse(state, response, {
      rawNarratorResponse: 'Raw 13',
      writebackDiagnostics: [{ path: ['writeback'], message: 'Diagnostic 13' }]
    });
    const narratorEntries = next.storyLog.filter((entry) => entry.speaker === 'narrator');

    expect(narratorEntries).toHaveLength(13);
    expect(narratorEntries.map((entry) => entry.text)).toEqual(
      Array.from({ length: 13 }, (_, index) => `Narrative ${index + 1}`)
    );
    expect(narratorEntries.slice(0, 3).every((entry) => !entry.rawNarratorResponse && !entry.writebackDiagnostics)).toBe(true);
    expect(narratorEntries.slice(3).every((entry) => entry.rawNarratorResponse && entry.writebackDiagnostics)).toBe(true);
  });

  it('stores exactly one player action beside the narrator entry for a completed turn', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: 'The player walks into the tea restaurant.',
      turnSummary: '玩家走进茶餐厅。',
      writeback: {}
    });

    const next = applyNarratorResponse(state, response, {
      playerInput: '走进茶餐厅。'
    });
    const narratorEntry = next.storyLog.find((entry) => entry.speaker === 'narrator' && entry.text === response.narrativeText);
    const turnEntries = next.storyLog.filter((entry) => entry.turnId === narratorEntry?.turnId);

    expect(turnEntries).toEqual([
      expect.objectContaining({ speaker: 'player', text: '走进茶餐厅。' }),
      expect.objectContaining({ speaker: 'narrator', text: response.narrativeText })
    ]);
    expect(next.storyLog.filter((entry) => entry.speaker === 'player')).toHaveLength(1);
  });

  it('updates player police salary after a rank promotion writeback', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 10, day: 1, hour: 9, minute: 0 };

    expect(state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.amount).toBe(4200);

    const response = validateNarratorResponse({
      narrativeText: 'The formal notice confirms the player has been promoted to sergeant.',
      writeback: {
        playerPatch: {
          policePanel: {
            careerPath: {
              currentRank: 'Sergeant（警长 SGT）',
              targetRank: 'Station Sergeant（警署警长 SSGT）',
              routeSummary: '正式晋升后，下一步需要在警长岗位留下稳定记录。'
            }
          }
        }
      }
    });

    const next = applyNarratorResponse(state, response);
    const salary = next.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID];

    expect(next.lawIdentity.rank).toBe('Sergeant（警长 SGT）');
    expect(salary?.amount).toBe(5200);
    expect(salary?.activeFromMonth).toBe('1988-10');
    expect(salary?.summary).toContain('Sergeant');
  });

  it('sanitizes pregnancy patches independently so one invalid item does not discard a valid risk', () => {
    const response = validateNarratorResponseStrict({
      narrativeText: '正文。',
      turnSummary: '本回合发生了需要登记的成人受孕风险。',
      suggestedActions: [],
      writeback: {
        pregnancyRiskPatches: [
          {
            actorId: 'npc_adult_female',
            riskType: 'unprotected',
            summary: '明确的无保护受孕风险。',
            fatherActorId: 'player'
          },
          {
            actorId: 'npc_invalid',
            riskType: 'invented_type',
            summary: '无效条目。'
          }
        ]
      }
    });

    expect(response.writeback.pregnancyRiskPatches).toEqual([
      expect.objectContaining({ actorId: 'npc_adult_female', riskType: 'unprotected' })
    ]);
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: expect.arrayContaining(['writeback', 'pregnancyRiskPatches', 1])
      })
    );
  });

  it('records pregnancy risk through structured writeback and protects engine truth from generic womb patches', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_adult_female = createActorDefaults({
      actorId: 'npc_adult_female',
      name: '阿玲',
      gender: 'female',
      birthDate: '1962-03-08',
      computedAge: 22,
      currentIdentity: 'civilian',
      publicIdentity: '市民',
      roleProfiles: {},
      positionSummary: '市民',
      profileSummary: '成年女性。',
      appearance: '成年女性。',
      clothing: '日常衣着。',
      personality: '谨慎。',
      speechStyle: '直接。',
      motivation: '照顾生活。',
      longTermGoal: '维持安稳生活。',
      values: '重视承诺。',
      femaleProfile: {
        adultPrivateProfile: {
          enabled: true,
          ageConfirmedAdult: true,
          profileStatus: 'ready',
          womb: { status: '未受孕', cervixStatus: '紧闭', records: [] }
        }
      },
      visibility: 'player_known'
    });
    const riskResponse = validateNarratorResponse({
      narrativeText: '正文明确发生了成人无保护行为。',
      turnSummary: '阿玲经历了一次明确的受孕风险。',
      writeback: {
        pregnancyRiskPatches: [
          {
            actorId: 'npc_adult_female',
            riskType: 'unprotected',
            summary: '阿玲经历了一次明确的无保护受孕风险。',
            fatherActorId: 'player',
            fatherName: '玩家',
            fatherVisibility: 'player_known'
          }
        ]
      }
    });
    const registered = applyNarratorResponse(state, riskResponse, { pregnancyMode: 'standard' });
    const registeredWomb = registered.actors.npc_adult_female.femaleProfile?.adultPrivateProfile?.womb;
    const pregnancyId = registeredWomb?.pregnancy?.pregnancyId;

    expect(registeredWomb).toMatchObject({
      status: '待验孕',
      pregnancy: {
        status: 'pending_check',
        paternityCandidates: [expect.objectContaining({ actorId: 'player', visibility: 'player_known' })]
      }
    });

    const overwriteResponse = validateNarratorResponse({
      narrativeText: '后续回合没有新的验孕事实。',
      turnSummary: '本回合没有改变既有怀孕生命周期。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_adult_female',
            femaleProfile: {
              adultPrivateProfile: {
                womb: {
                  status: '模型擅自宣布未受孕',
                  cervixStatus: '模型可更新的稳定字段',
                  records: [{ description: '模型试图覆盖引擎记录。' }],
                  pregnancy: { status: '模型伪造状态' },
                  pregnancyHistory: [{ outcome: '模型伪造历史' }]
                }
              }
            }
          }
        ]
      }
    });
    const protectedState = applyNarratorResponse(registered, overwriteResponse, { pregnancyMode: 'standard' });
    const protectedWomb = protectedState.actors.npc_adult_female.femaleProfile?.adultPrivateProfile?.womb;

    expect(protectedWomb?.status).toBe('待验孕');
    expect(protectedWomb?.pregnancy?.pregnancyId).toBe(pregnancyId);
    expect(protectedWomb?.pregnancy?.status).toBe('pending_check');
    expect(protectedWomb?.records).toEqual(registeredWomb?.records);
    expect(protectedWomb?.cervixStatus).toBe('模型可更新的稳定字段');
  });

  it('applies a structured identity context patch and its secret facts as one transition', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '玩家正式跟随和胜和庙街一名上线做事。',
      turnSummary: '玩家以庙街外围跑腿身份进入和胜和关系网。',
      writeback: {
        identityContextPatch: {
          transitionId: 'transition_join_wo_shing_wo_1',
          kind: 'join',
          fromIdentity: 'civilian',
          toIdentity: 'gang_member',
          publicIdentity: '和胜和庙街外围跑腿',
          reason: '接受上线安排并开始承担固定跑腿义务。',
          targetRoleProfile: {
            identity: 'gang_member',
            profile: {
              status: 'active',
              organizationId: 'org_wo_shing_wo',
              societyName: '和胜和',
              roleTitle: '庙街外围跑腿',
              rankSummary: '外围新人',
              territorySummary: '庙街与油麻地一带',
              patronActorIds: [],
              peerActorIds: [],
              rivalActorIds: [],
              obligationSummary: '传话、跑腿并按规矩交代。',
              riskSummary: '会受到警方、对头与内部规矩夹击。'
            }
          },
          secretFactPatches: [
            {
              operation: 'upsert',
              fact: {
                secretId: 'secret_player_handler_1',
                ownerType: 'player',
                ownerId: 'player',
                kind: 'relationship',
                summary: '玩家与上线的真实联络方式尚未公开。',
                playerCharacterKnown: true,
                publicKnown: false,
                knownByActorIds: ['actor_handler'],
                revealState: 'known_to_some_actors',
                revealConditions: ['联络被跟踪或主动公开。'],
                visibility: 'player_known',
                importance: 80
              }
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.currentIdentity).toBe('gang_member');
    expect(next.actors.player.currentIdentity).toBe('gang_member');
    expect(next.actors.player.roleProfiles.triad?.status).toBe('active');
    expect(next.actors.player.organizationIds).toContain('org_wo_shing_wo');
    expect(next.secretFacts.secret_player_handler_1?.visibility).toBe('player_known');
    expect(next.player.identityHistory[0]?.transitionId).toBe('transition_join_wo_shing_wo_1');
  });

  it('normalizes explicit identity patch aliases returned by a compatible API without reading narrative prose', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '玩家完成了正式入门。',
      turnSummary: '玩家正式成为和胜和外围成员。',
      writeback: {
        identityContextPatch: {
          transitionId: 'transition_join_wo_shing_wo_aliases',
          kind: 'status_change',
          fromIdentity: 'civilian',
          toIdentity: 'gang_member',
          publicIdentity: '湾仔夜场侍应',
          reason: '喝下入门茶并被上线接纳。',
          targetRoleProfile: {
            identity: 'gang_member',
            profile: {
              affiliation: 'org_wo_shing_wo',
              role: '外围成员',
              territorySummary: '湾仔骆克道一带',
              coverOccupation: '湾仔夜场侍应',
              patronActorIds: ['npc_handler'],
              legalStatusSummary: '身份暴露会引来警方调查。'
            }
          },
          secretFactPatches: [
            {
              operation: 'add',
              factId: 'secret_wsw_member_aliases',
              factType: 'actual_allegiance',
              description: '玩家实际已加入和胜和。',
              knownByActorIds: ['player', 'npc_handler'],
              revealConditions: '主动暴露或被深入调查。'
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.identityContextPatch).toMatchObject({
      kind: 'join',
      targetRoleProfile: {
        identity: 'gang_member',
        profile: {
          organizationId: 'org_wo_shing_wo',
          roleTitle: '外围成员',
          coverIdentitySummary: '湾仔夜场侍应'
        }
      }
    });
    expect(next.player.currentIdentity).toBe('gang_member');
    expect(next.actors.player.roleProfiles.triad).toMatchObject({
      organizationId: 'org_wo_shing_wo',
      roleTitle: '外围成员',
      status: 'active'
    });
    expect(next.actors.player.organizationIds).toContain('org_wo_shing_wo');
    expect(next.secretFacts.secret_wsw_member_aliases).toMatchObject({
      kind: 'loyalty',
      playerCharacterKnown: true,
      visibility: 'player_known'
    });
  });

  it('normalizes a keyed police role profile and deterministic transition id for a structured cover entry', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member' });
    const response = validateNarratorResponse({
      narrativeText: '玩家完成学警训练并持四位警号到警署报到。',
      turnSummary: '玩家的当前公开身份正式转为警察，社团出身作为秘密保留。',
      writeback: {
        identityContextPatch: {
          kind: 'cover_enter',
          fromIdentity: 'gang_member',
          toIdentity: 'police',
          publicIdentity: '皇家香港警察 · 警员 (PC) · 军装巡逻小队',
          policeNumber: '6632',
          targetRoleProfile: {
            police: {
              agencyId: 'org_hk_police',
              stationOrPost: '油麻地警署',
              department: '军装巡逻小队',
              rank: '警员 (PC)',
              postRole: '巡逻警员',
              assignmentSummary: '负责油麻地分区街面巡逻与接警。'
            }
          },
          secretFactPatches: [
            {
              operation: 'upsert',
              fact: {
                secretId: 'secret_gang_origin_under_police_cover',
                ownerType: 'player',
                ownerId: 'player',
                kind: 'loyalty',
                summary: '玩家实际仍效忠原社团。',
                playerCharacterKnown: true,
                publicKnown: false,
                knownByActorIds: ['npc_handler'],
                revealState: 'known_to_some_actors',
                revealConditions: ['单线接头暴露。'],
                visibility: 'player_known',
                importance: 95
              }
            }
          ]
        }
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.identityContextPatch).toMatchObject({
      transitionId: expect.stringMatching(/^transition_auto_[a-z0-9]+$/),
      reason: '结构化身份转换：gang_member -> police（cover_enter）。',
      targetRoleProfile: {
        identity: 'police',
        profile: {
          agencyId: 'org_hk_police',
          rank: '警员 (PC)'
        }
      }
    });
    expect(next.player.currentIdentity).toBe('police');
    expect(next.player.originIdentity).toBe('gang_member');
    expect(next.player.policeNumber).toBe('6632');
    expect(next.actors.player.roleProfiles.police?.status).toBe('cover');
    expect(next.actors.player.roleProfiles.triad?.status).toBe('hidden');
    expect(next.secretFacts.secret_gang_origin_under_police_cover?.visibility).toBe('player_known');
  });

  it('ignores a direct player actor identity change and records a diagnostic', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '这一回合只更新了人物描述。',
      turnSummary: '玩家身份没有发生结构化转换。',
      writeback: {
        actorPatches: [
          {
            actorId: 'player',
            currentIdentity: 'police',
            publicIdentity: '试图伪造的警察身份',
            actualIdentitySummary: '试图覆盖的实际身份',
            roleProfiles: {
              police: {
                status: 'active',
                agencyId: 'org_hk_police',
                rank: '警员'
              }
            },
            statusSummary: '试图直接改变身份。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.player.currentIdentity).toBe('civilian');
    expect(next.actors.player.currentIdentity).toBe('civilian');
    expect(next.actors.player.publicIdentity).not.toBe('试图伪造的警察身份');
    expect(next.actors.player.actualIdentitySummary).not.toBe('试图覆盖的实际身份');
    expect(next.actors.player.roleProfiles.police).toBeUndefined();
    expect(next.actors.player.statusSummary).toBe('试图直接改变身份。');
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'player_identity_requires_context_patch' })
    );
  });

  it('keeps valid standalone secret facts when a neighboring secret patch is invalid', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const response = validateNarratorResponse({
      narrativeText: '玩家得知了一条不能公开的身份线索。',
      turnSummary: '玩家记住了一条私密身份事实。',
      writeback: {
        secretFactPatches: [
          {
            operation: 'upsert',
            fact: {
              secretId: 'secret_known_identity_clue_1',
              ownerType: 'actor',
              ownerId: 'actor_unknown',
              kind: 'identity',
              summary: '此人正在使用化名。',
              playerCharacterKnown: true,
              publicKnown: false,
              knownByActorIds: [],
              revealState: 'known_to_player_character',
              revealConditions: [],
              visibility: 'player_known',
              importance: 70
            }
          },
          { operation: 'remove', secretId: '' }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(response.writeback.secretFactPatches).toHaveLength(1);
    expect(next.secretFacts.secret_known_identity_clue_1?.summary).toBe('此人正在使用化名。');
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({ path: expect.arrayContaining(['writeback', 'secretFactPatches', 1]) })
    );
  });
});
