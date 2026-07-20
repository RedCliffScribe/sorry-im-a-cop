import { describe, expect, it } from 'vitest';
import type { MemoryEmbeddingClient } from '../memory/MemoryEmbeddingClient';
import type { NarratorClient, NarratorStreamOptions } from '../narrator/NarratorClient';
import { MockNarratorClient } from '../narrator/MockNarratorClient';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { GameTime, RuntimeState } from '../runtime/types';
import { addGameHours } from '../backgroundEvolution/time';
import { runPlayerTurn as runPlayerTurnStrict } from './TurnEngine';

class DirtyWritebackNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: 'The shopkeeper lowers his voice and points toward the alley.',
      suggestedActions: ['Enter the alley', 'Ask the shopkeeper for a name'],
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_bad_patch',
            name: 'Bad Patch',
            gender: 'robot'
          }
        ],
        memories: [
          {
            text: 'The shopkeeper pointed toward the alley but refused to say the name aloud.',
            importance: 60
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

function createLiangChiKeungPatch(equipment: string[]) {
  return {
    actorId: 'npc_pc_8842_keung',
    name: '梁志强',
    englishName: 'Leung Chi-keung',
    gender: 'male',
    computedAge: 24,
    currentIdentity: 'police',
    publicIdentity: '旺角警署军装部新扎警员',
    actualIdentitySummary: '旺角警署军装部年轻警员，跟随玩家处理夜间巡逻和街面滋事。',
    positionSummary: '在旺角街面跟随玩家巡逻。',
    currentPlaceId: 'place_mong_kok_police_station',
    presence: 'present',
    profileSummary: '经验不足但肯听指令的新扎警员，对街面规矩还在适应。',
    appearance: '二十出头，身形偏瘦，神情紧张。',
    clothing: '夏季军装制服，帽檐压得很正。',
    equipment,
    personality: '谨慎、紧张，遇事会先看上级反应。',
    speechStyle: '说话带年轻警员的拘谨，常用简短警队口吻回应。',
    motivation: '完成夜班巡逻，不在第一次棘手事件里出错。',
    longTermGoal: '在旺角警署站稳脚跟，成为可靠的街面警员。',
    values: '纪律、稳妥和同僚信任。',
    attributes: {
      body: 48,
      action: 45,
      perception: 50,
      thinking: 42,
      negotiation: 35,
      will: 40
    },
    relationshipSummary: '把玩家当作带自己入局的前辈。',
    attitudeTowardPlayer: '信任但紧张，愿意服从玩家现场指令。',
    interactionScore: 35,
    trustTendency: '在纪律允许范围内相信玩家判断。',
    entanglementSummary: '作为同班巡逻警员，与玩家绑定在同一晚的街面风险中。',
    longTermMemorySummary: '记得第一次跟随玩家夜巡时遇到联发厂附近的棘手状况。',
    recentInteractionMemory: '跟随玩家在旺角夜巡，听从他观察街面动静。',
    statusSummary: '在场，等待玩家下一步指令。',
    visibility: 'player_known',
    importance: 55,
    roleProfiles: {
      police: {
        status: 'active',
        agencyId: 'org_royal_hong_kong_police',
        stationOrPost: '旺角警署',
        department: '军装巡逻',
        rank: 'Police Constable（警员 PC）',
        assignmentSummary: '旺角夜间街面巡逻。',
        postRole: '巡逻警员',
        dutySummary: '跟随资深警员处理街面秩序和即时报告。'
      }
    }
  };
}

class RepairableActorPatchNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '梁志强跟在你身后，手指按着对讲机，等你决定下一步。',
      suggestedActions: ['叫梁志强守住门口', '让梁志强去电台汇报'],
      writeback: {
        actorPatches: [
          createLiangChiKeungPatch([
            '史密斯威森M10左轮手枪',
            '警棍',
            '手铐',
            'Motorola对讲机'
          ])
        ],
        actorMemories: [
          {
            actorId: 'npc_pc_8842_keung',
            actorName: '梁志强',
            text: '跟随玩家在旺角夜巡时，被安排观察联发厂附近动静。',
            importance: 55,
            visibility: 'player_known'
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class ActorPatchRepairNarratorClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    return {
      actorIdentityReviews: [
        {
          actorId: 'npc_pc_8842_keung',
          decision: 'repair',
          actorPatch: createLiangChiKeungPatch([
            '史密斯威森M10左轮手枪',
            '警棍',
            '手铐'
          ])
        }
      ],
      actorPatches: []
    };
  }
}

class CallNameActorNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '被同伴叫作阿强的年轻人抬起头，仍旧堵在餐厅后门。',
      suggestedActions: ['查问阿强的身份证', '让阿强离开后门'],
      writeback: {
        actorPatches: [
          {
            ...createLiangChiKeungPatch(['折刀']),
            actorId: 'npc_thug_ah_keung',
            name: '阿强',
            englishName: undefined,
            callName: '阿强',
            aliases: ['阿强'],
            currentIdentity: 'gang_member',
            publicIdentity: '在餐厅后门出没的年轻人',
            actualIdentitySummary: '跟随街头团伙活动的年轻男子。',
            roleProfiles: undefined
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_thug_ah_keung',
            actorName: '阿强',
            text: '记得玩家在餐厅后门查问过自己。',
            importance: 55,
            visibility: 'player_known'
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class ActorIdentityReviewNarratorClient implements NarratorClient {
  prompts: string[] = [];

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    return {
      actorIdentityReviews: [
        {
          actorId: 'npc_thug_ah_keung',
          decision: 'repair',
          actorPatch: {
            ...createLiangChiKeungPatch(['折刀']),
            actorId: 'npc_thug_ah_keung',
            name: '郑耀强',
            englishName: 'Cheng Yiu-keung',
            callName: '阿强',
            aliases: ['阿强'],
            currentIdentity: 'gang_member',
            publicIdentity: '在餐厅后门出没的年轻人',
            actualIdentitySummary: '跟随街头团伙活动的年轻男子。',
            roleProfiles: undefined
          }
        }
      ],
      actorPatches: []
    };
  }
}

function createAuntieWongPatch(name: string) {
  return {
    ...createLiangChiKeungPatch(['茶壶', '账簿']),
    actorId: 'npc_shopkeeper_auntie_wong',
    name,
    englishName: name === '王秀兰' ? 'Wong Sau-lan' : undefined,
    callName: '王婶',
    aliases: ['王婶'],
    gender: 'female',
    computedAge: 52,
    currentIdentity: 'civilian',
    publicIdentity: '街坊茶档老板娘',
    actualIdentitySummary: '在街角经营茶档多年的老板娘，熟悉附近街坊。',
    positionSummary: '在街角茶档照看生意。',
    currentPlaceId: 'place_mong_kok_tea_restaurant',
    profileSummary: '精明热心，记得附近常客的习惯。',
    appearance: '五十岁上下，短发，神情利落。',
    clothing: '旧花衫外罩围裙。',
    personality: '精明、热心、谨慎。',
    speechStyle: '说话直接，使用街坊口吻。',
    motivation: '守住茶档生意，也照应熟客。',
    longTermGoal: '安稳经营茶档。',
    values: '街坊情分和生意信用。',
    relationshipSummary: '把玩家当作经常经过的街坊警员。',
    attitudeTowardPlayer: '愿意提供亲眼见到的街面消息。',
    trustTendency: '玩家守信用时愿意继续帮忙。',
    entanglementSummary: '可能成为玩家在本区的街坊消息来源。',
    longTermMemorySummary: '记得玩家曾替茶档处理滋扰。',
    recentInteractionMemory: '向玩家指出可疑车辆离开的方向。',
    statusSummary: '留在茶档继续营业。',
    roleProfiles: undefined
  };
}

class CallNameAuntieNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '街坊都叫她王婶。她放下茶壶，向你指出可疑车辆离开的方向。',
      suggestedActions: ['问王婶车牌号码', '沿她指出的方向查看'],
      writeback: {
        actorPatches: [createAuntieWongPatch('王婶')],
        actorMemories: [
          {
            actorId: 'npc_shopkeeper_auntie_wong',
            actorName: '王婶',
            text: '记得玩家在茶档询问过可疑车辆的去向。',
            importance: 58,
            visibility: 'player_known'
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class DelayedActorIdentityReviewNarratorClient implements NarratorClient {
  prompts: string[] = [];
  identityReviewCalls = 0;

  constructor(private readonly failedAttempts: number) {}

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    if (!prompt.includes('identityReviewActorIds=')) return {};

    this.identityReviewCalls += 1;
    if (this.identityReviewCalls <= this.failedAttempts) {
      return {
        actorIdentityReviews: [
          {
            actorId: 'npc_shopkeeper_auntie_wong',
            decision: 'defer'
          }
        ],
        actorPatches: []
      };
    }

    return {
      actorIdentityReviews: [
        {
          actorId: 'npc_shopkeeper_auntie_wong',
          decision: 'repair',
          actorPatch: createAuntieWongPatch('王秀兰')
        }
      ],
      actorPatches: []
    };
  }
}

class MissingRelationshipThreadNarratorClient implements NarratorClient {
  constructor(private readonly includeExplicitCandidate = false) {}

  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText:
        '林记者把名片压在茶杯底下，低声说只要你以后查到夜总会和报纸线索，可以先打这个电话找她。',
      suggestedActions: ['收下林记者的名片', '问她最近盯着哪条线'],
      writeback: {
        memories: [
          {
            text: '林记者主动留下私人电话，表示愿意和玩家交换夜总会及报纸线索。',
            kind: 'turn',
            importance: 68,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_reporter_lam',
            actorName: '林慧珊',
            text: '她主动留下私人电话，希望和玩家维持线索互通。',
            importance: 70,
            visibility: 'player_known'
          }
        ],
        currentMatterPatches: [
          {
            id: 'matter_reporter_lam_source',
            title: '林记者的线索电话',
            summary: '林记者愿意在夜总会、报纸线索上和玩家互通消息。',
            status: 'active',
            priority: 45,
            visibility: 'normal',
            source: 'npc',
            matterKind: 'social',
            pressureLevel: 1,
            responseWindow: 'open',
            currentHook: '她留下私人电话，等待玩家日后是否联系。',
            relatedActorIds: ['npc_reporter_lam']
          }
        ],
        relationshipThreadPatches: this.includeExplicitCandidate
          ? [
              {
                threadId: 'rel_network_npc_reporter_lam',
                kind: 'network',
                title: '林记者的线索关系',
                summary: '林记者明确与玩家建立可持续的线索互通。',
                relatedActorIds: ['npc_reporter_lam'],
                primaryActorId: 'npc_reporter_lam',
                relationshipRole: '媒体联系人',
                status: 'active',
                currentPull: '她留下私人电话，承诺继续交换夜总会与报纸线索。',
                visibility: 'player_known'
              }
            ]
          : undefined
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class RelationshipThreadRepairNarratorClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    return {
      relationshipThreadPatches: [
        {
          threadId: 'rel_network_npc_reporter_lam',
          kind: 'network',
          title: '林记者的线索关系',
          summary: '林记者愿意和玩家维持线索互通，是可持续发展的媒体联系人。',
          relatedActorIds: ['npc_reporter_lam'],
          primaryActorId: 'npc_reporter_lam',
          relationshipRole: '媒体联系人',
          status: 'active',
          trustSummary: '初步互信，双方都知道这条关系需要谨慎维持。',
          currentPull: '她留下私人电话，日后可能主动传来夜总会或报纸线索。',
          nextNaturalBeatHint: '隔一段时间可通过电话、报纸消息或街头偶遇自然回响。',
          creationBasis: 'debt_or_promise',
          evidenceRefs: [
            {
              kind: 'current_turn',
              refId: 'current_turn',
              summary: '林记者在当前回合明确留下私人电话并承诺持续交换线索。'
            }
          ],
          milestoneUpdates: [
            {
              milestoneId: 'milestone_reporter_lam_phone',
              summary: '林记者主动留下私人电话，和玩家建立线索互通。',
              importance: 70,
              relatedActorIds: ['npc_reporter_lam'],
              visibility: 'player_known'
            }
          ],
          visibility: 'player_known',
          importance: 70
        }
      ]
    };
  }
}

class MissingIncidentOriginNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText:
        '值日警长陈志强抬头说：旺角道那间“金粉世家”卡拉OK，经理打电话说有几个喝大的后生仔在包厢里砸酒瓶，还调戏女服务生，看场的快按不住了。',
      suggestedActions: ['立刻去金粉世家', '先问清楚经理姓名'],
      timePatch: {
        elapsedMinutes: 2,
        reason: '玩家接到值日警长转来的夜场滋事报案。'
      },
      writeback: {
        memories: []
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class IncidentOriginRepairNarratorClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    return {
      currentMatterPatches: [
        {
          id: 'matter_golden_karaoke_disturbance',
          title: '金粉世家卡拉OK报案',
          summary: '金粉世家经理来电报警：包厢内有醉酒后生仔砸酒瓶、调戏女服务生，看场人员快按不住。',
          status: 'active',
          priority: 72,
          visibility: 'known',
          source: 'writeback_repair_incident_origin',
          matterKind: 'police_work',
          pressureLevel: 2,
          responseWindow: 'now',
          currentHook: '玩家应按报案来源处理现场；金粉世家场方至少知道自己一方曾报警求助。',
          relatedActorIds: ['player'],
          relatedPlaceIds: ['place_golden_karaoke'],
          relatedCaseIds: [],
          relatedOrganizationIds: []
        }
      ],
      memories: [
        {
          text: '金粉世家经理曾来电报警，要求警方处理包厢醉酒滋事、砸酒瓶和调戏女服务生一事；后续与场方对话时不能写成场方完全不知道警方为何到场。',
          kind: 'turn',
          importance: 78,
          visibility: 'player_known',
          certainty: 'fact'
        }
      ],
      actorMemories: []
    };
  }
}

class NewspaperTriggerNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '你在报摊买下一份大公报，摊主把报纸摊开，头版还带着油墨味。',
      suggestedActions: ['翻看本港版', '留意治安新闻'],
      timePatch: {
        elapsedMinutes: 5,
        reason: '玩家在报摊买报纸并查看当天新闻。'
      },
      writeback: {
        memories: []
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class AuxiliaryNewsNarratorClient implements NarratorClient {
  calls = 0;
  prompt = '';

  async complete(prompt: string): Promise<unknown> {
    this.calls += 1;
    this.prompt = prompt;
    return {
      newsIssuePatches: [
        {
          id: 'news_19880912_takungpao',
          outletName: '大公报',
          headline: '旺角街市清晨人流渐旺',
          summary: '报章记录旺角街面、市井生意和警队巡逻的平常早晨。',
          articles: [
            {
              id: 'article_19880912_local',
              section: 'local',
              headline: '旺角街市清晨人流渐旺',
              body: '小贩和茶餐厅陆续开档，街坊在买菜和返工之间留意到巡逻警员经过。',
              playerRelated: false,
              relatedActorIds: ['npc_market_vendor'],
              relatedPlaceIds: [],
              relatedCaseIds: [],
              relatedOrganizationIds: []
            }
          ]
        }
      ]
    };
  }
}

class MissingClothingWritebackNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText:
        '你回到警署更衣室，脱下夏季军装，换上一件浅蓝短袖衬衫、灰色西裤和便鞋。肩章和帽徽被收进柜子里，出门时你看起来只是一个下班后的普通年轻人。',
      suggestedActions: ['去楼下等阿May', '先打电话确认她在哪里'],
      timePatch: {
        elapsedMinutes: 12,
        reason: '玩家下班后在警署更衣室换便服。'
      },
      writeback: {
        memories: []
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class ClothingRepairNarratorClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    return {
      playerPatch: {
        clothing: {
          currentSummary: '浅蓝短袖衬衫、灰色西裤和便鞋。',
          mode: 'off_duty_plain',
          lastChangedReason: '正文明确写玩家下班后脱下军装并换上便服。'
        }
      }
    };
  }
}

class MissingPlayerVitalsPatchNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText:
        '你沿着后巷追出去，雨水和油污让脚下发滑。对方钻进堆满纸箱的巷尾时，你猛地扑上去把人压倒，膝盖撞在石阶边，胸口一阵发紧，喘了好几口气才把手铐扣稳。',
      suggestedActions: ['把嫌疑人带回警署', '先检查膝盖有没有破皮'],
      timePatch: {
        elapsedMinutes: 9,
        reason: '玩家在后巷完成追捕和近身制服。'
      },
      writeback: {
        memories: [
          {
            text: '玩家在湿滑后巷追捕并近身制服嫌疑人，体力消耗明显。',
            importance: 55
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class PlayerVitalsRepairNarratorClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    return {
      actorPatches: [
        {
          actorId: 'player',
          vitalsPatch: {
            healthDelta: 0,
            staminaDelta: -18,
            conditionSummary: '刚在湿滑后巷追捕并近身制服嫌疑人，胸口发紧，体力明显下降。'
          }
        }
      ]
    };
  }
}

class MissingCompatibleWritebacksNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText:
        '值日警长说金粉世家经理刚来电报警，请你过去处理包厢滋事。你脱下军装换成浅蓝衬衫和灰裤，带着录音带奔跑下两层楼，在门口把录音带交给林记者，胸口发紧。',
      suggestedActions: ['去金粉世家了解报案情况', '先问林记者是否会妥善保管录音带'],
      timePatch: {
        elapsedMinutes: 12,
        reason: '玩家接到报案、换装并跑下楼交出录音带。'
      },
      writeback: {
        actorMemories: [
          {
            actorId: 'npc_reporter_lam',
            actorName: '林慧珊',
            text: '玩家把一卷录音带交给她保管。',
            importance: 65,
            visibility: 'player_known'
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class CombinedWritebackRepairNarratorClient implements NarratorClient {
  calls = 0;
  prompt = '';

  constructor(private readonly repair: unknown) {}

  async complete(prompt: string): Promise<unknown> {
    this.calls += 1;
    this.prompt = prompt;
    return this.repair;
  }
}

class LocationNarratorClient implements NarratorClient {
  constructor(
    private readonly narrativeText: string,
    private readonly locationPatch?: {
      currentPlaceId?: string;
      currentSceneId?: string;
      reason?: string;
    }
  ) {}

  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: this.narrativeText,
      turnSummary: '本回合位置事实摘要。',
      suggestedActions: ['继续当前行动'],
      timePatch: { elapsedMinutes: 5, reason: '位置写回测试。' },
      writeback: this.locationPatch ? { locationPatch: this.locationPatch } : {}
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class LocationRepairNarratorClient implements NarratorClient {
  calls = 0;
  prompt = '';

  constructor(private readonly locationPatch: Record<string, unknown> | null) {}

  async complete(prompt: string): Promise<unknown> {
    this.calls += 1;
    this.prompt = prompt;
    return {
      location: {
        locationPatch: this.locationPatch
      }
    };
  }
}

class ThrowingLocationRepairNarratorClient implements NarratorClient {
  calls = 0;

  async complete(): Promise<unknown> {
    this.calls += 1;
    throw new Error('location repair unavailable');
  }
}

class MinorIncidentAsCaseNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText:
        '通菜街便利店店员拦住你，说门口两个醉汉嘴上不干净，还踢了一脚纸箱，想请巡警过去压一压场。',
      suggestedActions: ['过去便利店门口看看', '先问店员有没有人受伤'],
      timePatch: {
        elapsedMinutes: 4,
        reason: '玩家在巡逻中接到便利店店员的现场求助。'
      },
      writeback: {
        casePatches: [
          {
            caseId: 'case_tung_choi_store_nuisance',
            title: '通菜街便利店滋扰案',
            caseType: 'public_order_complaint',
            status: 'intake',
            playerRole: 'execute',
            summary: '便利店店员现场求助，两名醉汉在门口滋扰和踢纸箱。',
            currentFocus: '到店门口确认是否需要驱散。',
            relatedActorIds: ['player'],
            relatedPlaceIds: ['place_mong_kok_tung_choi_street'],
            activityLog: [
              {
                kind: 'created',
                summary: '店员求助称门口醉汉滋扰。',
                actorId: 'player',
                relatedActorIds: ['player'],
                relatedPlaceIds: ['place_mong_kok_tung_choi_street']
              }
            ]
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class CaseIntakeDowngradeRepairClient implements NarratorClient {
  prompt = '';
  prompts: string[] = [];

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    this.prompts.push(prompt);
    return {
      currentMatterPatches: [
        {
          id: 'matter_tung_choi_store_nuisance',
          title: '通菜街便利店门口滋扰',
          summary: '便利店店员现场求助：两名醉汉在门口滋扰和踢纸箱，暂未构成正式立案材料。',
          status: 'active',
          priority: 35,
          visibility: 'known',
          source: 'writeback_repair_case_intake',
          matterKind: 'police_work',
          pressureLevel: 1,
          responseWindow: 'soon',
          currentHook: '适合按普通巡逻求助处理；除非出现伤人、财物损失、拘捕或正式报案材料，否则不要进入案件档案。',
          relatedActorIds: ['player'],
          relatedPlaceIds: ['place_mong_kok_tung_choi_street'],
          relatedCaseIds: [],
          relatedOrganizationIds: []
        }
      ],
      memories: [
        {
          text: '通菜街便利店店员曾现场求助，两名醉汉在门口滋扰和踢纸箱；此事目前只是普通巡逻事项，不是正式案件。',
          kind: 'turn',
          importance: 45,
          visibility: 'player_known',
          certainty: 'fact'
        }
      ]
    };
  }
}

class SubmittedEvidenceWithoutAssetRemovalNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '你把录音带交到报案室证物袋里，值日警长签收后，将它并入大明九龙重案的证据材料。',
      suggestedActions: ['去找报社线人', '回更衣室休息'],
      writeback: {
        caseEvidencePatches: [
          {
            evidenceId: 'evidence_case_kowloon_tape',
            caseId: 'case_kowloon',
            title: '大明九龙重案录音带',
            evidenceType: 'recording',
            summary: '录音带记录了疑似社团胁迫证人的片段。',
            sourceSummary: '玩家从现场带回并提交。',
            submittedByActorId: 'player',
            relatedAssetItemId: 'asset_kowloon_tape'
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class ManuscriptProgressWithoutAssetPatchNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '你继续伏在桌前写《九龙重案》，把第四章也补完了，牛皮纸袋里现在是一份前四章的完整稿。',
      suggestedActions: ['明早去报社投稿', '先把稿件锁进抽屉'],
      writeback: {
        memories: [
          {
            text: '玩家已把《九龙重案》第四章补完，手头稿件从前三章推进到前四章。',
            importance: 55
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class AssetLifecycleRepairNarratorClient implements NarratorClient {
  prompt = '';
  prompts: string[] = [];

  constructor(private readonly repair: unknown) {}

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    this.prompts.push(prompt);
    if (prompt.includes('ASSET_LIFECYCLE_REPAIR_TASK')) return this.repair;
    return {};
  }
}

function createTangChiWaiPatch() {
  return {
    actorId: 'npc_tang_chi_wai',
    name: '邓志威',
    englishName: 'Tang Chi-wai',
    aliases: ['阿威'],
    gender: 'male',
    computedAge: 23,
    currentIdentity: 'gang_member',
    publicIdentity: '无业青年',
    actualIdentitySummary: '大角咀一带带头的古惑仔，涉嫌伤人、打斗及藏毒。',
    positionSummary: '大角咀地区底层烂仔头目。',
    currentPlaceId: 'place_golden_karaoke',
    presence: 'mentioned',
    profileSummary: '器张跋扈但欺软怕硬的街头烂仔。',
    appearance: '染着一头金发，右臂有一条刺得粗糙、尾巴晕开的青龙纹身。',
    clothing: '满是汗味和酒渍的黑背心与牛仔裤。',
    equipment: [],
    personality: '冲动、要面子，但在绝对警权面前容易崩溃。',
    speechStyle: '满口粗话与江湖黑话。',
    motivation: '逃脱涉毒重罪。',
    longTermGoal: '在字头里搏上位。',
    values: '面子、地盘和兄弟义气。',
    attributes: {
      body: 48,
      action: 55,
      perception: 39,
      thinking: 32,
      negotiation: 30,
      will: 28
    },
    relationshipSummary: '把玩家视为眼下最大的威胁。',
    attitudeTowardPlayer: '极度敌视且恐惧。',
    interactionScore: 30,
    trustTendency: '绝不信任警察，试图用社团背景威吓。',
    entanglementSummary: '涉嫌玩家父亲工伤纠纷及旺角藏毒案核心人员。',
    longTermMemorySummary: '记得在塑胶厂和卡拉OK惹出的事端。',
    recentInteractionMemory: '被玩家点破社团背景并逼问塑胶厂推伤老工人的幕后主使。',
    statusSummary: '被反铐在茶几上，极度惊恐，心理防线正在崩溃。',
    visibility: 'player_known',
    importance: 85
  };
}

function createSparseTangChiWaiPatch() {
  return {
    actorId: 'npc_tang_chi_wai',
    recentInteractionMemory: '被玩家点破社团背景后开始松口，承认自己与金粉世家包厢里的伤人和藏毒风波有关。',
    statusSummary: '被反铐在茶几边，极度惊恐，心理防线正在崩溃。'
  };
}

class IdentityRevealNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '金毛被你逼到墙边，终于吐出身份证上的名字：邓志威，英文名 Tang Chi-wai。',
      suggestedActions: ['继续追问塑胶厂的幕后主使', '让同袍记录他的真名'],
      writeback: {
        actorPatches: [createTangChiWaiPatch()],
        actorMemories: [
          {
            actorId: 'npc_tang_chi_wai',
            actorName: '邓志威',
            text: '被玩家逼问时承认真名是邓志威，旧称呼金毛。',
            importance: 80,
            visibility: 'player_known'
          }
        ],
        casePatches: [
          {
            caseId: 'case_plastic_factory_assault',
            title: '塑胶厂伤人案',
            caseType: 'assault',
            status: 'investigating',
            playerRole: 'lead',
            summary: '玩家追查父亲工伤纠纷背后的伤人线索。',
            relatedActorIds: ['npc_tang_chi_wai'],
            involvedActorIds: ['npc_tang_chi_wai'],
            leadActorId: 'player',
            activityLog: [
              {
                kind: 'note',
                summary: '邓志威被迫说出真名。',
                actorId: 'npc_tang_chi_wai',
                relatedActorIds: ['npc_tang_chi_wai']
              }
            ]
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class SparseIdentityRevealNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText:
        '你扣住那只金毛的手腕，他终于哑声说身份证上写的是邓志威，英文名 Tang Chi-wai，道上有人叫他阿威。',
      suggestedActions: ['继续追问塑胶厂的幕后主使', '让同袍记录他的真名'],
      writeback: {
        actorPatches: [createSparseTangChiWaiPatch()],
        actorMemories: [
          {
            actorId: 'npc_tang_chi_wai',
            actorName: '邓志威',
            text: '被玩家逼问时承认真名是邓志威，旧称呼金毛。',
            importance: 80,
            visibility: 'player_known'
          }
        ],
        casePatches: [
          {
            caseId: 'case_plastic_factory_assault',
            title: '塑胶厂伤人案',
            caseType: 'assault',
            status: 'investigating',
            playerRole: 'lead',
            summary: '玩家追查父亲工伤纠纷背后的伤人线索。',
            relatedActorIds: ['npc_tang_chi_wai'],
            involvedActorIds: ['npc_tang_chi_wai'],
            leadActorId: 'player',
            activityLog: [
              {
                kind: 'note',
                summary: '邓志威被迫说出真名。',
                actorId: 'npc_tang_chi_wai',
                relatedActorIds: ['npc_tang_chi_wai']
              }
            ]
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class ActorIdentityMergeRepairNarratorClient implements NarratorClient {
  prompts: string[] = [];

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    if (prompt.includes('identityReviewActorIds=')) {
      return {
        actorIdentityReviews: [
          {
            actorId: 'npc_tang_chi_wai',
            decision: 'repair',
            actorPatch: createTangChiWaiPatch()
          }
        ],
        actorPatches: []
      };
    }
    if (!prompt.includes('NPC_IDENTITY_RESOLUTION_TASK')) return {};
    return {
      actorIdentityMerges: [
        {
          sourceActorId: 'npc_tang_chi_wai',
          targetActorId: 'npc_blonde_leader',
          confidence: 'high',
          canonicalName: '邓志威',
          canonicalEnglishName: 'Tang Chi-wai',
          aliases: ['金毛', '阿威'],
          evidence: [
            '两者都是金发、右臂粗糙青龙纹身',
            '两者都牵连大角咀塑胶厂推伤老工人',
            '新写回是原外号人物被逼问后揭示真名'
          ]
        }
      ]
    };
  }
}

class CapturingNarratorClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    this.prompt = prompt;
    const response = {
      narrativeText: 'You remember the old pier informant before answering.',
      turnSummary: 'The player linked the current question to the old pier informant.',
      suggestedActions: ['Ask about the pier', 'Stay quiet'],
      writeback: {
        memories: []
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class FakeNpcSimulationClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    return {
      presentReactions: [
        {
          actorId: 'npc_aux',
          actorName: 'Aux NPC',
          hint: 'Auxiliary client suggests a quick warning glance.',
          basis: ['present actor', 'cautious relationship']
        }
      ],
      remotePresence: [],
      notes: ['Auxiliary suggestions are not facts.']
    };
  }
}

class MissingDueDeferredPatchNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: 'The prosecutor has sent a note about the bar assault file.',
      suggestedActions: ['Read the note', 'Call the case officer'],
      writeback: {
        casePatches: [
          {
            caseId: 'case_bar_assault',
            activityLog: [
              {
                kind: 'prosecution_update',
                summary: 'The prosecutor sent a preliminary note about missing witness details.'
              }
            ]
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class DeferredEventRepairNarratorClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    return {
      deferredEventPatches: [
        {
          eventId: 'deferred_prosecution_note',
          sourceModule: 'case',
          relatedIds: { caseId: 'case_bar_assault' },
          title: 'Prosecution note due',
          summary: 'The prosecution note was handled by the current turn.',
          triggerAt: { year: 1988, month: 9, day: 13, hour: 2, minute: 0 },
          visibility: 'hidden',
          promptInstruction: 'Resolved by writeback repair after the main narrator omitted the deferred event patch.',
          status: 'resolved',
          resolvedAt: { year: 1988, month: 9, day: 13, hour: 2, minute: 5 }
        }
      ]
    };
  }
}

class RescheduleDueDeferredToTurnEndNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: 'The sergeant takes the form and says he will check it in a moment.',
      suggestedActions: ['Wait in the report room', 'Check the notice board'],
      timePatch: {
        elapsedMinutes: 5,
        reason: 'The player hands over the form and waits.'
      },
      writeback: {
        deferredEventPatches: [
          {
            eventId: 'deferred_prosecution_note',
            sourceModule: 'case',
            relatedIds: { caseId: 'case_bar_assault' },
            title: 'Prosecution note due',
            summary: 'The sergeant has not read the note yet and will do it soon.',
            triggerAt: { year: 1988, month: 9, day: 13, hour: 2, minute: 10 },
            visibility: 'hidden',
            promptInstruction: 'The sergeant should finish reviewing the note shortly.',
            status: 'pending'
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class QuietNarratorClient implements NarratorClient {
  async complete(): Promise<unknown> {
    return {
      narrativeText: 'The shift passes quietly.',
      suggestedActions: ['Check the notice board'],
      timePatch: { elapsedMinutes: 480, reason: 'A long quiet shift passes.' },
      writeback: {}
    };
  }
}

class LongSpanTargetTimeNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: 'A routine week passes before the player reads the evening paper.',
      suggestedActions: ['Read the entertainment page'],
      timePatch: {
        targetTime: { year: 1988, month: 9, day: 19, hour: 19, minute: 0 },
        reason: 'The player explicitly waits through a week of routine shifts.'
      },
      writeback: {}
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class CityTrackCreatingNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: 'The reporter says the film crew will keep shooting for several nights.',
      suggestedActions: ['Ask for the studio address'],
      timePatch: { elapsedMinutes: 30, reason: 'The player speaks with the reporter.' },
      writeback: {
        citySituationTrackPatches: [
          {
            operation: 'upsert',
            trackId: 'track_turn_test_film',
            title: '片场夜戏',
            trackType: 'film_production',
            status: 'active',
            pressureLevel: 2,
            visibility: 'public',
            cadenceDays: 1,
            summary: '片场夜戏会继续发酵。',
            currentBeat: '剧组还在赶最后几场夜戏。',
            possibleDevelopments: ['杀青新闻'],
            nextReviewAt: { year: 1988, month: 9, day: 13, hour: 0, minute: 0 }
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class BackgroundCityEvolutionClient implements NarratorClient {
  calls = 0;

  constructor(private readonly projection: 'news' | 'signal' = 'news') {}

  async complete(prompt: string): Promise<unknown> {
    this.calls += 1;
    const marker = 'BACKGROUND_EVOLUTION_CONTEXT\n';
    const context = JSON.parse(prompt.slice(prompt.indexOf(marker) + marker.length)) as {
      currentTime: GameTime;
      cityCandidates: Array<{
        reviewKey: string;
        track: RuntimeState['citySituationTracks'][string];
      }>;
    };
    const candidate = context.cityCandidates[0];
    const track = candidate.track;
    const outcomeId = `outcome_${track.trackId}_${this.calls}`;
    const sourceRefs = {
      actorIds: [],
      caseIds: [],
      placeIds: track.relatedPlaceIds,
      organizationIds: track.relatedOrganizationIds,
      relationshipThreadIds: [],
      cityTrackIds: [track.trackId],
      deferredEventIds: [],
      outcomeIds: [outcomeId]
    };
    const projection =
      this.projection === 'news'
        ? {
            newsIssuePatches: [
              {
                id: `news_${track.trackId}_${this.calls}`,
                outletName: '星岛日报',
                headline: `${track.title}杀青与后续消息`,
                summary: `${track.title}已有公开新进展。`,
                articles: [],
                reviewKey: candidate.reviewKey,
                reason: '该结果已公开。',
                sourceRefs
              }
            ]
          }
        : {
            signalPatches: [
              {
                id: `signal_${track.trackId}_${this.calls}`,
                title: `${track.title}的新风声`,
                summary: `${track.title}在街面出现了新的可核实传闻。`,
                signalType: 'street',
                reliability: 'medium',
                status: 'active',
                visibility: 'known',
                reviewKey: candidate.reviewKey,
                reason: '结果以街面传闻形式外溢。',
                sourceRefs
              }
            ]
          };

    return {
      citySituationTrackPatches: [
        {
          operation: 'update',
          trackId: track.trackId,
          status: track.status,
          pressureLevel: Math.min(5, track.pressureLevel + 1),
          visibility: track.visibility,
          nextReviewAt: addGameHours(context.currentTime, 12),
          relatedOrganizationIds: track.relatedOrganizationIds,
          relatedPowerFigureIds: track.relatedPowerFigureIds,
          relatedPlaceIds: track.relatedPlaceIds,
          relatedActorIds: track.relatedActorIds,
          summary: track.summary,
          currentBeat: `${track.title}已经出现一次新的阶段性进展。`,
          possibleDevelopments: track.possibleDevelopments,
          reviewKey: candidate.reviewKey,
          reason: '轨道已到复核时间。',
          sourceRefs
        }
      ],
      outcomeRecords: [
        {
          outcomeId,
          sourceKind: 'city',
          sourceId: track.trackId,
          title: `${track.title}阶段进展`,
          summary: `${track.title}已经出现一次新的阶段性进展。`,
          relatedActorIds: track.relatedActorIds,
          relatedOrganizationIds: track.relatedOrganizationIds,
          relatedPlaceIds: track.relatedPlaceIds,
          relatedCaseIds: [],
          relatedRelationshipThreadIds: [],
          visibility: track.visibility,
          significance: 'routine',
          reviewKey: candidate.reviewKey,
          reason: '轨道复核产生阶段结果。',
          sourceRefs
        }
      ],
      ...projection
    };
  }
}

class PendingLaterDeferredEventRepairNarratorClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    return {
      deferredEventPatches: [
        {
          eventId: 'deferred_prosecution_note',
          sourceModule: 'case',
          relatedIds: { caseId: 'case_bar_assault' },
          title: 'Prosecution note due',
          summary: 'The sergeant still has not read the note and pushes it slightly later.',
          triggerAt: { year: 1988, month: 9, day: 13, hour: 2, minute: 15 },
          visibility: 'hidden',
          promptInstruction: 'Handle the sergeant review after this short delay.',
          status: 'pending'
        }
      ]
    };
  }
}

class FakeMemoryEmbeddingClient implements MemoryEmbeddingClient {
  readonly model = 'test-embedding';
  readonly texts: string[] = [];

  async embed(text: string): Promise<number[]> {
    this.texts.push(text);
    if (text.includes('semantic query')) return [1, 0];
    if (text.includes('old pier informant')) return [1, 0];
    return [0, 1];
  }
}

class FailingMemoryEmbeddingClient implements MemoryEmbeddingClient {
  readonly model = 'broken-embedding';

  async embed(): Promise<number[]> {
    throw new Error('embedding unavailable');
  }
}

class FakeMemorySummaryClient implements NarratorClient {
  prompts: string[] = [];

  constructor(private readonly response: unknown) {}

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

class MissingTurnSummaryNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '玩家把小说前三章交到报社柜台，职员当面登记收件。',
      suggestedActions: ['离开报社'],
      writeback: {}
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class TurnSummaryRepairNarratorClient implements NarratorClient {
  prompt = '';
  calls = 0;

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    this.calls += 1;
    return {
      turnSummary: '玩家已经把小说前三章交给报社职员，并完成收件登记。'
    };
  }
}

class TestTurnSummaryNarratorClient implements NarratorClient {
  constructor(private readonly delegate: NarratorClient) {}

  async complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = await this.delegate.complete(prompt, options);
    if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
    const record = response as Record<string, unknown>;
    if (typeof record.turnSummary === 'string' && record.turnSummary.trim()) return response;
    return {
      ...record,
      turnSummary: '测试回合事实摘要。'
    };
  }
}

function runPlayerTurn(input: Parameters<typeof runPlayerTurnStrict>[0]) {
  return runPlayerTurnStrict({
    ...input,
    narrator:
      input.narrator instanceof MissingTurnSummaryNarratorClient
        ? input.narrator
        : new TestTurnSummaryNarratorClient(input.narrator)
  });
}

function createStateWithVectorMemories(): RuntimeState {
  const state = createInitialRuntimeState();
  return {
    ...state,
    memories: {
      memory_semantic: {
        memoryId: 'memory_semantic',
        text: 'An old pier informant once warned the player about hidden gambling rooms.',
        kind: 'world',
        relatedActorIds: [],
        relatedCaseIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: [],
        gameTime: { ...state.time },
        importance: 20,
        visibility: 'player_known',
        certainty: 'claim',
        embeddingText: 'old pier informant hidden gambling rooms',
        embeddingVector: [1, 0],
        embeddingModel: 'test-embedding'
      },
      memory_unrelated: {
        memoryId: 'memory_unrelated',
        text: 'A kitchen supplier changed delivery times last month.',
        kind: 'world',
        relatedActorIds: [],
        relatedCaseIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: [],
        gameTime: { ...state.time },
        importance: 20,
        visibility: 'player_known',
        certainty: 'fact',
        embeddingText: 'kitchen supplier delivery schedule',
        embeddingVector: [0, 1],
        embeddingModel: 'test-embedding'
      }
    }
  };
}

function createStateForCompatibleWritebackRepair(): RuntimeState {
  const state = createInitialRuntimeState({ currentIdentity: 'police' });
  state.player.clothing = '夏季军装制服，佩戴肩章和帽徽。';
  state.player.clothingState = {
    currentSummary: state.player.clothing,
    mode: 'duty_uniform',
    lastChangedAt: { ...state.time }
  };
  state.actors[state.player.actorId].clothing = state.player.clothing;
  state.actors.npc_reporter_lam = createActorDefaults({
    actorId: 'npc_reporter_lam',
    name: '林慧珊',
    currentIdentity: 'civilian',
    publicIdentity: '报馆记者',
    relationshipSummary: '与玩家初步建立线索互通。',
    importance: 65,
    visibility: 'player_known'
  });
  state.assets.items.asset_reporter_tape = {
    itemId: 'asset_reporter_tape',
    category: 'document',
    name: '街头采访录音带',
    summary: '玩家暂时保管的一卷采访录音带。',
    relatedActorIds: ['npc_reporter_lam'],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    importance: 55,
    visibility: 'player_known'
  };
  return state;
}

function createCompatibleRepairPayload(clothingMode: 'off_duty_plain' | 'uniform' = 'off_duty_plain') {
  return {
    assetLifecycle: {
      assetPatch: {
        upsertItems: [],
        removeItems: [
          {
            itemId: 'asset_reporter_tape',
            reason: '玩家已把录音带交给林记者，不再由玩家持有。'
          }
        ]
      }
    },
    incidentOrigin: {
      currentMatterPatches: [
        {
          id: 'matter_golden_karaoke_dispatch',
          title: '金粉世家经理报案',
          summary: '金粉世家经理来电报警，请警方处理包厢滋事。',
          status: 'active',
          priority: 65,
          visibility: 'known',
          source: 'writeback_repair_incident_origin',
          matterKind: 'police_work',
          pressureLevel: 2,
          responseWindow: 'now',
          currentHook: '场方知道经理曾主动报警。',
          relatedActorIds: ['player'],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          relatedOrganizationIds: []
        }
      ],
      memories: [
        {
          text: '金粉世家经理曾来电报警，请警方处理包厢滋事。',
          kind: 'world',
          importance: 72,
          visibility: 'player_known',
          certainty: 'fact'
        }
      ],
      actorMemories: []
    },
    playerClothing: {
      playerPatch: {
        clothing: {
          currentSummary: '浅蓝短袖衬衫、灰色西裤和便鞋。',
          mode: clothingMode,
          lastChangedReason: '正文明确写玩家脱下军装并换成便服。'
        }
      }
    },
    playerVitals: {
      actorPatches: [
        {
          actorId: 'player',
          vitalsPatch: {
            healthDelta: 0,
            staminaDelta: -8,
            conditionSummary: '跑下两层楼后胸口发紧，体力有所下降。'
          }
        }
      ]
    },
    relationshipThreads: {
      relationshipThreadPatches: [
        {
          threadId: 'rel_network_npc_reporter_lam',
          kind: 'network',
          title: '林记者的线索关系',
          summary: '林记者与玩家保持谨慎的线索互通。',
          relatedActorIds: ['npc_reporter_lam'],
          primaryActorId: 'npc_reporter_lam',
          relationshipRole: '媒体联系人',
          status: 'active',
          currentPull: '她正在替玩家保管一卷录音带。',
          visibility: 'player_known',
          importance: 68
        }
      ]
    }
  };
}

describe('turn engine', () => {
  it('repairs a missing turn summary before applying the completed turn', async () => {
    const state = createInitialRuntimeState();
    const writebackRepair = new TurnSummaryRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '把小说前三章送到报社投稿。',
      narrator: new MissingTurnSummaryNarratorClient(),
      writebackRepair
    });

    expect(writebackRepair.calls).toBe(1);
    expect(writebackRepair.prompt).toContain('TURN_SUMMARY_REPAIR_TASK');
    expect(next.storyLog.at(-1)?.summaryText).toBe('玩家已经把小说前三章交给报社职员，并完成收件登记。');
    expect(Object.values(next.memories).some((memory) => memory.text.includes('完成收件登记'))).toBe(true);
    expect(next.storyLog.at(-1)?.turnMetrics?.apiUsage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: 'mainNarrator', callCount: 1 }),
        expect.objectContaining({ route: 'writebackRepair', callCount: 1 })
      ])
    );
  });

  it.each([
    { narrativeText: '明早回到旺角警署再说。', expectedRepairCalls: 1 },
    { narrativeText: '你决定不要回到旺角警署。', expectedRepairCalls: 1 },
    { narrativeText: '陈警长说：“你回到旺角警署后找我。”', expectedRepairCalls: 0 },
    { narrativeText: '你对阿强说：“我在旺角警署等你。”', expectedRepairCalls: 0 }
  ])('keeps the current location for non-arrival text: $narrativeText', async ({ narrativeText, expectedRepairCalls }) => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const repair = new LocationRepairNarratorClient(null);

    const next = await runPlayerTurn({
      state,
      playerInput: '继续处理手头的事。',
      narrator: new LocationNarratorClient(narrativeText),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(expectedRepairCalls);
    if (expectedRepairCalls > 0) {
      expect(repair.prompt).toContain('LOCATION_REPAIR_TASK');
      expect(repair.prompt).toContain('未来计划');
      expect(repair.prompt).toContain('否定');
      expect(repair.prompt).toContain('任何对白');
    }
    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.actors.player.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.map.lastMovement).toBeUndefined();
  });

  it('uses semantic writeback repair to apply a clearly completed move in the same turn', async () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const repair = new LocationRepairNarratorClient({
      currentPlaceId: 'place_mong_kok_police_station',
      reason: '正文明确写玩家已经走进旺角警署。'
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '回警署交班。',
      narrator: new LocationNarratorClient('你下车走进旺角警署大门，值班警员向你点头。'),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('place_mong_kok_police_station');
    expect(next.location.currentPlaceId).toBe('place_mong_kok_police_station');
    expect(next.actors.player.currentPlaceId).toBe('place_mong_kok_police_station');
    expect(next.map.lastMovement).toMatchObject({
      fromPlaceId: 'place_hang_seng_bank_headquarters',
      toPlaceId: 'place_mong_kok_police_station'
    });
  });

  it('requests semantic repair when narration establishes a known place as the current setting', async () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const repair = new LocationRepairNarratorClient({
      currentPlaceId: 'place_mong_kok_police_station',
      reason: '正文已把玩家当前场景建立在旺角警署更衣室。'
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '整理报告。',
      narrator: new LocationNarratorClient(
        '上午九点四十五分，旺角警署的男更衣室里弥漫着肥皂味。你推开自己的铁皮储物柜。'
      ),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(1);
    expect(next.location.currentPlaceId).toBe('place_mong_kok_police_station');
  });

  it('detects a completed move near the end of a long narrative', async () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const repair = new LocationRepairNarratorClient({
      currentPlaceId: 'place_mong_kok_police_station',
      reason: '长正文结尾明确写玩家已经走进旺角警署。'
    });
    const longLead = '你继续核对桌上的记录，确认每一项交接细节。'.repeat(60);

    const next = await runPlayerTurn({
      state,
      playerInput: '处理完后回警署交班。',
      narrator: new LocationNarratorClient(`${longLead}处理告一段落后，你最终走进旺角警署大门。`),
      writebackRepair: repair
    });

    expect(longLead.length).toBeGreaterThan(1000);
    expect(repair.calls).toBe(1);
    expect(next.location.currentPlaceId).toBe('place_mong_kok_police_station');
  });

  it('repairs a scene-only move within the current place', async () => {
    const state = createInitialRuntimeState();
    state.scenes.scene_mong_kok_lobby = {
      sceneId: 'scene_mong_kok_lobby',
      placeId: 'place_mong_kok_police_station',
      name: '警署大厅',
      summary: '旺角警署的接待大厅。',
      temporaryState: '',
      presentActorIds: []
    };
    state.scenes.scene_mong_kok_locker_room = {
      sceneId: 'scene_mong_kok_locker_room',
      placeId: 'place_mong_kok_police_station',
      name: '男更衣室',
      summary: '旺角警署的男更衣室。',
      temporaryState: '',
      presentActorIds: []
    };
    state.location = {
      currentPlaceId: 'place_mong_kok_police_station',
      currentSceneId: 'scene_mong_kok_lobby'
    };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_mong_kok_police_station',
      currentSceneId: 'scene_mong_kok_lobby'
    };
    const repair = new LocationRepairNarratorClient({
      currentSceneId: 'scene_mong_kok_locker_room',
      reason: '正文明确写玩家已经走进男更衣室。'
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '去更衣室换衣服。',
      narrator: new LocationNarratorClient('你离开大厅，推门走进男更衣室，打开自己的铁皮柜。'),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('scene_mong_kok_locker_room');
    expect(next.location).toMatchObject({
      currentPlaceId: 'place_mong_kok_police_station',
      currentSceneId: 'scene_mong_kok_locker_room'
    });
    expect(next.actors.player.currentSceneId).toBe('scene_mong_kok_locker_room');
  });

  it.each([
    { label: 'an empty patch', patch: {} },
    {
      label: 'a place outside the narrative candidates',
      patch: { currentPlaceId: 'place_golden_harvest_studio' }
    },
    {
      label: 'an unknown scene',
      patch: {
        currentPlaceId: 'place_mong_kok_police_station',
        currentSceneId: 'scene_unknown'
      }
    }
  ])('rejects $label from semantic location repair', async ({ patch }) => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '回警署交班。',
      narrator: new LocationNarratorClient('你处理完文件，走进旺角警署大门。'),
      writebackRepair: new LocationRepairNarratorClient(patch)
    });

    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.location.currentSceneId).toBeUndefined();
  });

  it('rejects a scene that belongs to a different repaired place', async () => {
    const state = createInitialRuntimeState();
    state.scenes.scene_bank_lobby = {
      sceneId: 'scene_bank_lobby',
      placeId: 'place_hang_seng_bank_headquarters',
      name: '银行大厅',
      summary: '恒生银行总部大厅。',
      temporaryState: '',
      presentActorIds: []
    };
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '回警署交班。',
      narrator: new LocationNarratorClient('你处理完文件，走进旺角警署大门。'),
      writebackRepair: new LocationRepairNarratorClient({
        currentPlaceId: 'place_mong_kok_police_station',
        currentSceneId: 'scene_bank_lobby'
      })
    });

    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.location.currentSceneId).toBeUndefined();
  });

  it('keeps the current location when semantic location repair throws', async () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const repair = new ThrowingLocationRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '回警署交班。',
      narrator: new LocationNarratorClient('你处理完文件，走进旺角警署大门。'),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(1);
    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'writeback_repair_failed' })])
    );
  });

  it('keeps the current location when semantic repair is unavailable', async () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '回警署交班。',
      narrator: new LocationNarratorClient('你下车走进旺角警署大门，值班警员向你点头。')
    });

    expect(next.location.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.actors.player.currentPlaceId).toBe('place_hang_seng_bank_headquarters');
    expect(next.map.lastMovement).toBeUndefined();
  });

  it('does not request location repair when the narrator already supplied a structured patch', async () => {
    const state = createInitialRuntimeState();
    state.location = { currentPlaceId: 'place_hang_seng_bank_headquarters' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_hang_seng_bank_headquarters',
      currentSceneId: undefined
    };
    const repair = new LocationRepairNarratorClient(null);

    const next = await runPlayerTurn({
      state,
      playerInput: '回警署交班。',
      narrator: new LocationNarratorClient('你下车走进旺角警署大门。', {
        currentPlaceId: 'place_mong_kok_police_station',
        reason: '玩家已抵达旺角警署。'
      }),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(0);
    expect(next.location.currentPlaceId).toBe('place_mong_kok_police_station');
  });

  it('runs player input through prompt, narrator, validation, and state update', async () => {
    const state = createInitialRuntimeState();
    const next = await runPlayerTurn({
      state,
      playerInput: 'Answer the phone and listen first.',
      narrator: new MockNarratorClient()
    });

    expect(next.storyLog.at(-1)?.speaker).toBe('narrator');
    expect(next.storyLog.at(-1)?.suggestedActions).toHaveLength(3);
    expect(next.turnCounter).toBe(1);
    expect(Object.values(next.memories).length).toBeGreaterThan(0);
  });

  it('passes streamed narrative deltas through the turn pipeline without writing them to state', async () => {
    const state = createInitialRuntimeState();
    const deltas: string[] = [];

    const next = await runPlayerTurn({
      state,
      playerInput: 'Check the phone record first.',
      narrator: new MockNarratorClient(),
      onNarrativeDelta: (delta) => deltas.push(delta)
    } as Parameters<typeof runPlayerTurn>[0] & { onNarrativeDelta: (delta: string) => void });

    expect(deltas.join('').length).toBeGreaterThan(0);
    expect(next.storyLog.at(-1)?.rawNarratorResponse).toContain('"narrativeText"');
  });

  it('salvages the narrative turn when a writeback item is invalid', async () => {
    const state = createInitialRuntimeState();

    const next = await runPlayerTurn({
      state,
      playerInput: 'Ask the shopkeeper what he saw.',
      narrator: new DirtyWritebackNarratorClient()
    });

    const lastEntry = next.storyLog.at(-1);

    expect(lastEntry?.text).toContain('shopkeeper lowers his voice');
    expect(lastEntry?.suggestedActions).toEqual(['Enter the alley', 'Ask the shopkeeper for a name']);
    expect(lastEntry?.writebackDiagnostics?.[0]?.path).toEqual(['writeback', 'actorPatches', 0, 'gender']);
    expect(next.actors.npc_bad_patch).toBeUndefined();
    expect(Object.values(next.memories).some((memory) => memory.text.includes('pointed toward the alley'))).toBe(true);
    expect(next.turnCounter).toBe(1);
  });

  it('uses writeback repair to keep an actor patch that only needs field-level repair', async () => {
    const state = createInitialRuntimeState();
    const repair = new ActorPatchRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '让梁志强跟着我守住联发厂门口。',
      narrator: new RepairableActorPatchNarratorClient(),
      writebackRepair: repair
    });

    const actor = next.actors.npc_pc_8842_keung;
    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.prompt).toContain('WRITEBACK_REPAIR_TASK');
    expect(repair.prompt).toContain('npc_pc_8842_keung');
    expect(actor).toBeDefined();
    expect(actor?.name).toBe('梁志强');
    expect(actor?.equipment).toEqual(['史密斯威森M10左轮手枪', '警棍', '手铐']);
    expect(Object.values(next.memories).some((memory) => memory.relatedActorIds.includes('npc_pc_8842_keung'))).toBe(true);
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'actorPatches'],
        code: 'writeback_repair_applied'
      })
    );
    expect(latestDiagnostics.some((issue) => issue.code === 'missing_actor_reference')).toBe(false);
  });

  it('sends every new NPC to API identity review and accepts the repaired identity atomically', async () => {
    const state = createInitialRuntimeState();
    const repair = new ActorIdentityReviewNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '问清楚后门那个阿强的身份。',
      narrator: new CallNameActorNarratorClient(),
      writebackRepair: repair
    });

    const actor = next.actors.npc_thug_ah_keung;
    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.prompts.some((prompt) => prompt.includes('identityReviewActorIds=["npc_thug_ah_keung"]'))).toBe(true);
    expect(repair.prompts.some((prompt) => prompt.includes('阿强'))).toBe(true);
    expect(actor?.name).toBe('郑耀强');
    expect(actor?.callName).toBe('阿强');
    expect(actor?.aliases).toContain('阿强');
    expect(
      Object.values(next.memories).some(
        (memory) => memory.relatedActorIds.includes('npc_thug_ah_keung') && memory.text.includes('餐厅后门')
      )
    ).toBe(true);
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'actorPatches'],
        code: 'writeback_repair_applied'
      })
    );
    expect(latestDiagnostics.some((issue) => issue.code === 'missing_actor_reference')).toBe(false);
  });

  it('retries a deferred API identity review in the same turn before queueing the actor package', async () => {
    const state = createInitialRuntimeState();
    const repair = new DelayedActorIdentityReviewNarratorClient(1);

    const next = await runPlayerTurn({
      state,
      playerInput: '问清楚王婶的正式姓名，并记下她提供的车辆方向。',
      narrator: new CallNameAuntieNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.identityReviewCalls).toBe(2);
    expect(next.actors.npc_shopkeeper_auntie_wong?.name).toBe('王秀兰');
    expect(next.actors.npc_shopkeeper_auntie_wong?.callName).toBe('王婶');
    expect(next.pendingActorWritebackRecoveries).toHaveLength(0);
    expect(
      Object.values(next.memories).some(
        (memory) =>
          memory.relatedActorIds.includes('npc_shopkeeper_auntie_wong') && memory.text.includes('可疑车辆')
      )
    ).toBe(true);
  });

  it('keeps an unresolved new actor package and restores it atomically after a later API approval', async () => {
    const state = createInitialRuntimeState();
    const repair = new DelayedActorIdentityReviewNarratorClient(2);

    const deferred = await runPlayerTurn({
      state,
      playerInput: '先听王婶说完。',
      narrator: new CallNameAuntieNarratorClient(),
      writebackRepair: repair
    });

    expect(deferred.actors.npc_shopkeeper_auntie_wong).toBeUndefined();
    expect(deferred.pendingActorWritebackRecoveries).toHaveLength(1);
    expect(deferred.pendingActorWritebackRecoveries[0]).toEqual(
      expect.objectContaining({
        actorId: 'npc_shopkeeper_auntie_wong',
        attemptCount: 2
      })
    );
    expect(
      Object.values(deferred.memories).some((memory) => memory.relatedActorIds.includes('npc_shopkeeper_auntie_wong'))
    ).toBe(false);

    const recovered = await runPlayerTurn({
      state: deferred,
      playerInput: '把刚才的街坊证词补进记录。',
      narrator: new QuietNarratorClient(),
      writebackRepair: repair
    });

    expect(recovered.actors.npc_shopkeeper_auntie_wong?.name).toBe('王秀兰');
    expect(recovered.actors.npc_shopkeeper_auntie_wong?.aliases).toContain('王婶');
    expect(recovered.pendingActorWritebackRecoveries).toHaveLength(0);
    expect(
      Object.values(recovered.memories).some(
        (memory) =>
          memory.relatedActorIds.includes('npc_shopkeeper_auntie_wong') && memory.text.includes('可疑车辆')
      )
    ).toBe(true);
    expect(recovered.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_writeback_recovery_applied' })
    );
  });

  it('recovers an absent new actor from recent raw story history without local name classification', async () => {
    const repair = new DelayedActorIdentityReviewNarratorClient(2);
    const deferred = await runPlayerTurn({
      state: createInitialRuntimeState(),
      playerInput: '先听王婶说完。',
      narrator: new CallNameAuntieNarratorClient(),
      writebackRepair: repair
    });
    const legacyState = {
      ...deferred,
      pendingActorWritebackRecoveries: []
    };
    const historicalRepair = new DelayedActorIdentityReviewNarratorClient(0);

    const recovered = await runPlayerTurn({
      state: legacyState,
      playerInput: '整理刚才遗漏的街坊身份资料。',
      narrator: new QuietNarratorClient(),
      writebackRepair: historicalRepair
    });

    expect(historicalRepair.prompts.some((prompt) => prompt.includes('npc_shopkeeper_auntie_wong'))).toBe(true);
    expect(recovered.actors.npc_shopkeeper_auntie_wong?.name).toBe('王秀兰');
    expect(recovered.pendingActorWritebackRecoveries).toHaveLength(0);
    expect(
      Object.values(recovered.memories).some((memory) => memory.relatedActorIds.includes('npc_shopkeeper_auntie_wong'))
    ).toBe(true);
  });

  it('does not infer a durable relationship when the narrator only writes NPC memories', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_reporter_lam = createActorDefaults({
      actorId: 'npc_reporter_lam',
      name: '林慧珊',
      gender: 'female',
      computedAge: 28,
      currentIdentity: 'civilian',
      publicIdentity: '报馆记者',
      actualIdentitySummary: '常跑夜总会和警署新闻线的报馆记者。',
      positionSummary: '在旺角茶餐厅与玩家交换消息。',
      currentPlaceId: 'place_mong_kok_tea_restaurant',
      presence: 'mentioned',
      profileSummary: '消息灵通，懂得在警队和报馆之间保持距离。',
      appearance: '短发，妆容利落，随身带着采访本。',
      clothing: '浅色衬衫和窄裙，外套搭在手臂上。',
      equipment: ['采访本', '名片'],
      personality: '敏锐、谨慎，懂得留后路。',
      speechStyle: '说话直接，但会避开不能明说的名字。',
      motivation: '拿到能上报纸的线索，同时保护自己的消息来源。',
      longTermGoal: '在报馆站稳脚跟，做出有分量的治安新闻。',
      values: '事实、分寸和消息来源安全。',
      relationshipSummary: '与玩家初步建立线索互通。',
      attitudeTowardPlayer: '谨慎信任，愿意留下私人电话。',
      interactionScore: 42,
      trustTendency: '只在玩家守得住分寸时继续提供消息。',
      entanglementSummary: '玩家可能成为她在警署和夜总会之间的长期线人关系。',
      longTermMemorySummary: '记得玩家没有把她的名字随便写进报告。',
      recentInteractionMemory: '在茶餐厅留下私人电话。',
      statusSummary: '离场后等待玩家是否联系。',
      visibility: 'player_known',
      importance: 65
    });
    const repair = new RelationshipThreadRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '收下林记者的名片，答应以后有夜总会线索会先通个气。',
      narrator: new MissingRelationshipThreadNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.prompt).toBe('');
    expect(next.relationshipThreads.rel_network_npc_reporter_lam).toBeUndefined();
  });

  it('repairs creation evidence only for an explicit durable relationship candidate', async () => {
    const state = createStateForCompatibleWritebackRepair();
    const repair = new RelationshipThreadRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '收下林记者的名片，确认以后会持续交换线索。',
      narrator: new MissingRelationshipThreadNarratorClient(true),
      writebackRepair: repair
    });

    const thread = next.relationshipThreads.rel_network_npc_reporter_lam;
    expect(repair.prompt).toContain('RELATIONSHIP_THREAD_REPAIR_TASK');
    expect(repair.prompt).toContain('creationBasis');
    expect(repair.prompt).toContain('evidenceRefs');
    expect(thread).toMatchObject({
      kind: 'network',
      primaryActorId: 'npc_reporter_lam',
      creationBasis: 'debt_or_promise'
    });
    expect(thread?.evidenceRefs).toContainEqual(
      expect.objectContaining({ kind: 'current_turn', refId: 'current_turn' })
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'relationshipThreadPatches'],
        code: 'writeback_repair_applied'
      })
    );
  });

  it('uses writeback repair to anchor a police dispatch source when the narrator omits durable facts', async () => {
    const state = createInitialRuntimeState();
    const repair = new IncidentOriginRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '接听值日警长的派警电话，准备去处理。',
      narrator: new MissingIncidentOriginNarratorClient(),
      writebackRepair: repair
    });

    const matter = next.dynamicEvents.currentMatters.matter_golden_karaoke_disturbance;
    const memories = Object.values(next.memories);
    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.prompt).toContain('INCIDENT_ORIGIN_REPAIR_TASK');
    expect(repair.prompt).toContain('经理打电话');
    expect(matter?.summary).toContain('金粉世家经理来电报警');
    expect(matter?.currentHook).toContain('场方至少知道自己一方曾报警');
    expect(memories.some((memory) => memory.text.includes('不能写成场方完全不知道警方为何到场'))).toBe(true);
    expect(Object.values(next.cases).some((caseFile) => caseFile.summary.includes('金粉世家经理来电报警'))).toBe(false);
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'incidentOrigin'],
        code: 'writeback_repair_applied'
      })
    );
  });

  it('uses writeback repair to keep player clothing in sync when the narrative changes clothes', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.player.clothing = '夏季军装制服，佩戴肩章和帽徽。';
    state.player.clothingState = {
      currentSummary: state.player.clothing,
      mode: 'duty_uniform',
      lastChangedAt: { ...state.time }
    };
    state.actors[state.player.actorId].clothing = state.player.clothing;
    const repair = new ClothingRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '下班了，先去更衣室换便装，再去见阿May。',
      narrator: new MissingClothingWritebackNarratorClient(),
      writebackRepair: repair
    });

    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.prompt).toContain('PLAYER_CLOTHING_REPAIR_TASK');
    expect(repair.prompt).toContain('脱下夏季军装');
    expect(next.player.clothing).toBe('浅蓝短袖衬衫、灰色西裤和便鞋。');
    expect(next.player.clothingState).toMatchObject({
      currentSummary: '浅蓝短袖衬衫、灰色西裤和便鞋。',
      mode: 'off_duty_plain',
      lastChangedReason: '正文明确写玩家下班后脱下军装并换上便服。'
    });
    expect(next.actors[state.player.actorId].clothing).toBe(next.player.clothing);
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'playerPatch', 'clothing'],
        code: 'writeback_repair_applied'
      })
    );
  });

  it('uses writeback repair to keep player stamina in sync after clear physical exertion', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const repair = new PlayerVitalsRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '追上去，把人按住铐起来。',
      narrator: new MissingPlayerVitalsPatchNarratorClient(),
      writebackRepair: repair
    });

    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.prompt).toContain('PLAYER_VITALS_REPAIR_TASK');
    expect(repair.prompt).toContain('后巷追出去');
    expect(repair.prompt).toContain('胸口一阵发紧');
    expect(next.player.vitals.stamina).toBe(82);
    expect(next.player.vitals.health).toBe(100);
    expect(next.player.vitals.conditionSummary).toContain('体力明显下降');
    expect(next.actors[state.player.actorId].vitals).toEqual(next.player.vitals);
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'actorPatches', 'player', 'vitalsPatch'],
        code: 'writeback_repair_applied'
      })
    );
  });

  it('repairs compatible same-turn writeback domains with one API call', async () => {
    const state = createStateForCompatibleWritebackRepair();
    const repair = new CombinedWritebackRepairNarratorClient(createCompatibleRepairPayload());

    const next = await runPlayerTurn({
      state,
      playerInput: '接报后换便服，带录音带跑下楼交给林记者。',
      narrator: new MissingCompatibleWritebacksNarratorClient(),
      writebackRepair: repair,
      promptSettings: {
        overrides: {
          'repair.assetLifecycle': 'ASSET_LIFECYCLE_REPAIR_TASK\nCUSTOM_ASSET_LIFECYCLE_RULES'
        }
      }
    });

    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('COMBINED_WRITEBACK_REPAIR_TASK');
    expect(repair.prompt).toContain('ASSET_LIFECYCLE_REPAIR_TASK');
    expect(repair.prompt).toContain('CUSTOM_ASSET_LIFECYCLE_RULES');
    expect(repair.prompt).toContain('INCIDENT_ORIGIN_REPAIR_TASK');
    expect(repair.prompt).toContain('PLAYER_CLOTHING_REPAIR_TASK');
    expect(repair.prompt).toContain('PLAYER_VITALS_REPAIR_TASK');
    expect(repair.prompt).not.toContain('RELATIONSHIP_THREAD_REPAIR_TASK');
    expect(next.assets.items.asset_reporter_tape).toBeUndefined();
    expect(next.dynamicEvents.currentMatters.matter_golden_karaoke_dispatch).toBeDefined();
    expect(next.player.clothingState?.mode).toBe('off_duty_plain');
    expect(next.player.vitals.stamina).toBe(92);
    expect(next.relationshipThreads.rel_network_npc_reporter_lam).toBeUndefined();
    expect(next.storyLog.at(-1)?.turnMetrics?.apiUsage?.find((item) => item.route === 'writebackRepair')?.callCount).toBe(1);
  });

  it('keeps valid combined repair domains when one sibling domain is invalid', async () => {
    const state = createStateForCompatibleWritebackRepair();
    const repair = new CombinedWritebackRepairNarratorClient(createCompatibleRepairPayload('uniform'));

    const next = await runPlayerTurn({
      state,
      playerInput: '接报后换便服，带录音带跑下楼交给林记者。',
      narrator: new MissingCompatibleWritebacksNarratorClient(),
      writebackRepair: repair
    });

    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    expect(repair.calls).toBe(1);
    expect(next.player.clothingState?.mode).toBe('duty_uniform');
    expect(next.player.vitals.stamina).toBe(92);
    expect(next.assets.items.asset_reporter_tape).toBeUndefined();
    expect(next.relationshipThreads.rel_network_npc_reporter_lam).toBeUndefined();
    expect(diagnostics.some((issue) => issue.path.includes('playerClothing'))).toBe(true);
  });

  it('does not apply a clothing repair string that would preserve a stale mode', async () => {
    const state = createStateForCompatibleWritebackRepair();
    const payload = createCompatibleRepairPayload() as any;
    payload.playerClothing.playerPatch.clothing = '浅蓝短袖衬衫、灰色西裤和便鞋。';
    const repair = new CombinedWritebackRepairNarratorClient(payload);

    const next = await runPlayerTurn({
      state,
      playerInput: '接报后换便服，带录音带跑下楼交给林记者。',
      narrator: new MissingCompatibleWritebacksNarratorClient(),
      writebackRepair: repair
    });

    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    expect(next.player.clothingState?.mode).toBe('duty_uniform');
    expect(next.player.clothing).toContain('军装');
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        path: expect.arrayContaining(['writebackRepair', 'playerClothing', 'playerPatch', 'clothing'])
      })
    );
    expect(
      diagnostics.some(
        (issue) => issue.code === 'writeback_repair_applied' && issue.path.includes('clothing')
      )
    ).toBe(false);
  });

  it('reports a missing player vitals patch without calling the player actor unrelated', async () => {
    const state = createStateForCompatibleWritebackRepair();
    const payload = createCompatibleRepairPayload() as any;
    payload.playerVitals.actorPatches = [{ actorId: 'player' }];
    const repair = new CombinedWritebackRepairNarratorClient(payload);

    const next = await runPlayerTurn({
      state,
      playerInput: '接报后换便服，带录音带跑下楼交给林记者。',
      narrator: new MissingCompatibleWritebacksNarratorClient(),
      writebackRepair: repair
    });

    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'writeback_repair_missing_vitals_patch',
        path: expect.arrayContaining(['writebackRepair', 'playerVitals', 'actorPatches', 0, 'vitalsPatch'])
      })
    );
    expect(diagnostics.some((issue) => issue.code === 'writeback_repair_unrelated_actor')).toBe(false);
  });

  it('uses writeback repair to remove an owned asset after it is submitted as case evidence', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_kowloon = {
      caseId: 'case_kowloon',
      title: '大明九龙重案',
      caseType: 'organized_crime',
      status: 'investigating',
      playerRole: 'assist',
      summary: '正在调查一宗牵涉社团胁迫证人的重案。',
      currentFocus: '整理证据材料。',
      playerVisibleProgress: '玩家已带回一卷关键录音带。',
      internalProgressSummary: '等待证物归档。',
      relatedActorIds: ['player'],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      evidenceIds: [],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'player_known',
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };
    state.assets.items.asset_kowloon_tape = {
      itemId: 'asset_kowloon_tape',
      category: 'document',
      name: '大明九龙重案录音带',
      summary: '玩家随身保管的一卷关键录音带。',
      relatedActorIds: [],
      relatedCaseIds: ['case_kowloon'],
      relatedPlaceIds: [],
      evidence: {
        caseId: 'case_kowloon',
        caseTitle: '大明九龙重案',
        summary: '录音带记录了疑似社团胁迫证人的片段。',
        disputed: false
      },
      importance: 80,
      visibility: 'player_known'
    };
    const repair = new AssetLifecycleRepairNarratorClient({
      assetPatch: {
        removeItems: [
          {
            itemId: 'asset_kowloon_tape',
            reason: '录音带已由玩家提交到大明九龙重案证物袋，不再由玩家随身持有。',
            movedToCaseId: 'case_kowloon'
          }
        ]
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '把大明九龙重案录音带提交到案件材料里。',
      narrator: new SubmittedEvidenceWithoutAssetRemovalNarratorClient(),
      writebackRepair: repair
    });

    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.prompts.some((prompt) => prompt.includes('ASSET_LIFECYCLE_REPAIR_TASK'))).toBe(true);
    expect(repair.prompts.some((prompt) => prompt.includes('asset_kowloon_tape'))).toBe(true);
    expect(next.assets.items.asset_kowloon_tape).toBeUndefined();
    expect(next.caseEvidence.evidence_case_kowloon_tape?.relatedAssetItemId).toBe('asset_kowloon_tape');
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'assetPatch'],
        code: 'writeback_repair_applied'
      })
    );
  });

  it('uses writeback repair to update the same manuscript asset when writing progresses', async () => {
    const state = createInitialRuntimeState();
    state.assets.items.asset_kowloon_novel = {
      itemId: 'asset_kowloon_novel',
      category: 'document',
      name: '《九龙重案》前三章',
      summary: '玩家已经写好的小说前三章手稿。',
      detail: '装在一个旧牛皮纸袋里，还未投稿。',
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      importance: 45,
      visibility: 'player_known'
    };
    const repair = new AssetLifecycleRepairNarratorClient({
      assetPatch: {
        upsertItems: [
          {
            itemId: 'asset_kowloon_novel',
            category: 'document',
            name: '《九龙重案》前四章',
            summary: '玩家已将小说手稿从前三章推进到前四章。',
            detail: '装在一个旧牛皮纸袋里，还未投稿。',
            relatedActorIds: ['player'],
            relatedCaseIds: [],
            relatedPlaceIds: [],
            importance: 50,
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '今晚继续写《九龙重案》，把第四章写完。',
      narrator: new ManuscriptProgressWithoutAssetPatchNarratorClient(),
      writebackRepair: repair
    });

    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.prompts.some((prompt) => prompt.includes('ASSET_LIFECYCLE_REPAIR_TASK'))).toBe(true);
    expect(repair.prompts.some((prompt) => prompt.includes('asset_kowloon_novel'))).toBe(true);
    expect(next.assets.items.asset_kowloon_novel?.name).toBe('《九龙重案》前四章');
    expect(Object.values(next.assets.items).filter((item) => item.name.includes('九龙重案'))).toHaveLength(1);
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'assetPatch'],
        code: 'writeback_repair_applied'
      })
    );
  });

  it('uses writeback repair to downgrade an ordinary patrol nuisance from case files to current matters', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const repair = new CaseIntakeDowngradeRepairClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '先过去看看，别急着立案。',
      narrator: new MinorIncidentAsCaseNarratorClient(),
      writebackRepair: repair
    });

    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.prompts.some((prompt) => prompt.includes('CASE_INTAKE_REVIEW_TASK'))).toBe(true);
    expect(repair.prompts.some((prompt) => prompt.includes('case_tung_choi_store_nuisance'))).toBe(true);
    expect(next.cases.case_tung_choi_store_nuisance).toBeUndefined();
    expect(next.dynamicEvents.currentMatters.matter_tung_choi_store_nuisance?.summary).toContain('暂未构成正式立案材料');
    expect(Object.values(next.memories).some((memory) => memory.text.includes('不是正式案件'))).toBe(true);
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'caseIntake'],
        code: 'writeback_repair_applied'
      })
    );
  });

  it('uses writeback repair to merge a true-name reveal into an existing nickname actor', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_blonde_leader = createActorDefaults({
      actorId: 'npc_blonde_leader',
      name: '金毛',
      gender: 'male',
      computedAge: 25,
      currentIdentity: 'gang_member',
      publicIdentity: '夜场古惑仔',
      actualIdentitySummary: '大角咀一带的社团边缘分子，带头大哥，涉嫌推伤玩家父亲的烂仔。',
      positionSummary: '在金粉世家V6包厢内与钵兰街小弟冲突的带头人。',
      currentPlaceId: 'place_golden_karaoke',
      appearance: '染着金发，右臂有一条刺得粗糙、尾巴晕开的青龙纹身。',
      relationshipSummary: '玩家父亲工伤纠纷的疑似施暴者。',
      attitudeTowardPlayer: '敌意、畏惧与抗拒。',
      trustTendency: '极度戒备。',
      entanglementSummary: '牵扯父亲的工伤暴力事件以及当下夜场违禁品销毁案。',
      longTermMemorySummary: '记得自己在大角咀塑胶厂推伤过一个老工人的事。',
      recentInteractionMemory: '被玩家用警棍指着，被迫举手投降。',
      statusSummary: '举手后退，神色僵硬，拖延时间。',
      visibility: 'player_known',
      importance: 75
    });
    const repair = new ActorIdentityMergeRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '逼问金毛的身份证姓名。',
      narrator: new IdentityRevealNarratorClient(),
      writebackRepair: repair
    });

    const actor = next.actors.npc_blonde_leader;
    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    const identityPrompt = repair.prompts.find((prompt) => prompt.includes('NPC_IDENTITY_RESOLUTION_TASK'));
    expect(identityPrompt).toContain('npc_blonde_leader');
    expect(identityPrompt).toContain('npc_tang_chi_wai');
    expect(next.actors.npc_tang_chi_wai).toBeUndefined();
    expect(actor?.name).toBe('邓志威');
    expect(actor?.englishName).toBe('Tang Chi-wai');
    expect(actor?.aliases).toEqual(expect.arrayContaining(['金毛', '阿威']));
    expect(actor?.actualIdentitySummary).toContain('古惑仔');
    expect(Object.values(next.memories).some((memory) => memory.relatedActorIds.includes('npc_blonde_leader'))).toBe(true);
    expect(Object.values(next.memories).some((memory) => memory.relatedActorIds.includes('npc_tang_chi_wai'))).toBe(false);
    expect(next.cases.case_plastic_factory_assault?.relatedActorIds).toEqual(['npc_blonde_leader']);
    expect(next.cases.case_plastic_factory_assault?.activityLog.at(-1)?.actorId).toBe('npc_blonde_leader');
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'actor_identity_merge_applied',
        path: ['writeback', 'actorIdentityMerges', 'npc_tang_chi_wai']
      })
    );
  });

  it('uses identity repair when the true-name reveal is only present in narrative and sparse actor memory', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_blonde_leader = createActorDefaults({
      actorId: 'npc_blonde_leader',
      name: '金毛',
      gender: 'male',
      computedAge: 25,
      currentIdentity: 'gang_member',
      publicIdentity: '夜场古惑仔',
      actualIdentitySummary: '大角咀一带的社团边缘分子，带头大哥，涉嫌推伤玩家父亲的烂仔。',
      positionSummary: '在金粉世家V6包厢内与钵兰街小弟冲突的带头人。',
      appearance: '染着金发，右臂有一条刺得粗糙、尾巴晕开的青龙纹身。',
      relationshipSummary: '玩家父亲工伤纠纷的疑似施暴者。',
      attitudeTowardPlayer: '敌意、畏惧与抗拒。',
      trustTendency: '极度戒备。',
      entanglementSummary: '牵扯父亲的工伤暴力事件以及当下夜场违禁品销毁案。',
      longTermMemorySummary: '记得自己在大角咀塑胶厂推伤过一个老工人的事。',
      recentInteractionMemory: '被玩家用警棍指着，被迫举手投降。',
      statusSummary: '举手后退，神色僵硬，拖延时间。',
      visibility: 'player_known',
      importance: 75
    });
    const repair = new ActorIdentityMergeRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '逼问金毛的身份证姓名。',
      narrator: new SparseIdentityRevealNarratorClient(),
      writebackRepair: repair
    });

    const actor = next.actors.npc_blonde_leader;
    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    const identityPrompt = repair.prompts.find((prompt) => prompt.includes('NPC_IDENTITY_RESOLUTION_TASK'));
    expect(identityPrompt).toContain('npc_blonde_leader');
    expect(identityPrompt).toContain('npc_tang_chi_wai');
    expect(next.actors.npc_tang_chi_wai).toBeUndefined();
    expect(actor?.name).toBe('邓志威');
    expect(actor?.englishName).toBe('Tang Chi-wai');
    expect(actor?.aliases).toEqual(expect.arrayContaining(['金毛', '阿威']));
    expect(next.cases.case_plastic_factory_assault?.relatedActorIds).toEqual(['npc_blonde_leader']);
    expect(next.cases.case_plastic_factory_assault?.activityLog.at(-1)?.actorId).toBe('npc_blonde_leader');
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'actor_identity_merge_applied',
        path: ['writeback', 'actorIdentityMerges', 'npc_tang_chi_wai']
      })
    );
  });

  it('uses memory embeddings for semantic retrieval and embeds new turn memories', async () => {
    const state = createStateWithVectorMemories();
    const narrator = new CapturingNarratorClient();
    const memoryEmbedding = new FakeMemoryEmbeddingClient();

    const next = await runPlayerTurn({
      state,
      playerInput: 'semantic query',
      narrator,
      memoryEmbedding
    });

    expect(narrator.prompt.indexOf('old pier informant')).toBeGreaterThanOrEqual(0);
    expect(narrator.prompt).not.toContain('kitchen supplier');
    expect(narrator.prompt).toContain('MEMORY_LAYER_PROJECTION');
    expect(narrator.prompt).toContain('VECTOR_MEMORY_PROJECTION');
    expect(narrator.prompt).toContain('kind=world');
    expect(narrator.prompt).toContain('reasons=vector_match');
    const newMemory = Object.values(next.memories).find((memory) =>
      memory.text.includes('current question to the old pier informant')
    );
    expect(newMemory?.embeddingVector).toEqual([1, 0]);
    expect(newMemory?.embeddingModel).toBe('test-embedding');
    const latestNarratorEntry = [...next.storyLog].reverse().find((entry) => entry.speaker === 'narrator');
    expect(latestNarratorEntry?.embeddingText).toBeUndefined();
    expect(latestNarratorEntry?.embeddingVector).toEqual([1, 0]);
    expect(latestNarratorEntry?.embeddingModel).toBe('test-embedding');
    expect(memoryEmbedding.texts.some((text) => text.includes('semantic query'))).toBe(true);
    expect(memoryEmbedding.texts.some((text) => text.includes('old pier informant'))).toBe(true);
    expect(latestNarratorEntry?.turnMetrics?.apiUsage).toEqual(
      expect.arrayContaining([expect.objectContaining({ route: 'memoryEmbedding', callCount: expect.any(Number) })])
    );
  });

  it('enriches vector recall query with current place and present NPC anchors', async () => {
    const state = createInitialRuntimeState();
    state.places.place_golden_karaoke = {
      placeId: 'place_golden_karaoke',
      name: '金粉世家',
      nameZh: '金粉世家',
      nameEn: 'Golden Palace Karaoke',
      aliases: ['金粉世家卡拉OK'],
      regionId: 'region_kowloon',
      districtId: 'district_mong_kok',
      type: 'karaoke',
      category: 'nightlife',
      summary: '旺角一间夜场卡拉OK。',
      publicKnowledge: '夜场熟人知道这里常有看场人员。',
      currentState: '营业中。',
      source: 'runtime_generated',
      canonical: false,
      confidence: 'medium',
      roadAnchors: [],
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPressureIds: []
    };
    state.location = { currentPlaceId: 'place_golden_karaoke', currentSceneId: 'scene_golden_lobby' };
    state.scenes.scene_golden_lobby = {
      sceneId: 'scene_golden_lobby',
      placeId: 'place_golden_karaoke',
      name: '金粉世家大堂',
      summary: '卡拉OK大堂。',
      temporaryState: '营业中。',
      presentActorIds: ['player', 'npc_manager_sum']
    };
    state.actors.npc_manager_sum = createActorDefaults({
      actorId: 'npc_manager_sum',
      name: '肥仔森',
      aliases: ['森哥'],
      currentIdentity: 'civilian',
      publicIdentity: '金粉世家经理',
      currentPlaceId: 'place_golden_karaoke',
      currentSceneId: 'scene_golden_lobby',
      presence: 'present',
      visibility: 'player_known',
      importance: 70
    });
    const memoryEmbedding = new FakeMemoryEmbeddingClient();

    await runPlayerTurn({
      state,
      playerInput: '问他：你们不是自己人报过警吗？',
      narrator: new MockNarratorClient(),
      memoryEmbedding
    });

    const queryText = memoryEmbedding.texts[0];
    expect(queryText).toContain('你们不是自己人报过警');
    expect(queryText).toContain('金粉世家');
    expect(queryText).toContain('肥仔森');
    expect(queryText).toContain('森哥');
  });

  it('passes the configured narrative length level into the narrator prompt', async () => {
    const state = createInitialRuntimeState();
    const narrator = new CapturingNarratorClient();

    await runPlayerTurn({
      state,
      playerInput: '巡逻时多观察街面',
      narrator,
      gameSettings: {
        storyRenderLimit: 30,
        narrativeLengthLevel: 'immersive',
        narrativePerspective: 'first_person',
        autoSaveLimit: 20,
        autoSaveIntervalTurns: 1,
        rollbackSnapshotLimit: 20,
        pregnancyMode: 'high'
      }
    });

    expect(narrator.prompt).toContain('常规回合 narrativeText 目标 1400-2200 个中文字符');
    expect(narrator.prompt).toContain('复杂回合 narrativeText 目标 2200-3200 个中文字符');
    expect(narrator.prompt).toContain('本局选择第一人称');
    expect(narrator.prompt).toContain('当前档位: 高概率');
  });

  it('preloads auxiliary NPC simulation suggestions into the main narrator prompt when configured', async () => {
    const state = createInitialRuntimeState();
    const narrator = new CapturingNarratorClient();
    const npcSimulation = new FakeNpcSimulationClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '问柜台刚才是谁找我',
      narrator,
      npcSimulation
    });

    expect(npcSimulation.prompt).toContain('NPC_SIMULATION_TASK');
    expect(npcSimulation.prompt).toContain('PRESENT_ACTOR_REACTION_PROJECTION');
    expect(narrator.prompt).toContain('AUX_NPC_SIMULATION_PACKAGE');
    expect(narrator.prompt).toContain('Auxiliary client suggests a quick warning glance');
    expect(next.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'npc_simulation_api_applied')).toBe(
      true
    );
    expect(next.storyLog.at(-1)?.turnMetrics?.apiUsage).toEqual(
      expect.arrayContaining([expect.objectContaining({ route: 'npcSimulation', callCount: 1 })])
    );
  });

  it('continues the turn when memory embedding is unavailable', async () => {
    const state = createStateWithVectorMemories();

    const next = await runPlayerTurn({
      state,
      playerInput: 'semantic query',
      narrator: new MockNarratorClient(),
      memoryEmbedding: new FailingMemoryEmbeddingClient()
    });

    expect(next.storyLog.at(-1)?.text).toBeTruthy();
    expect(next.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'memory_embedding_failed')).toBe(true);
    expect(next.turnCounter).toBe(1);
  });

  it('compresses memory through the memory summary route after a completed turn', async () => {
    const state = createInitialRuntimeState();
    state.memories.short_1 = createTurnMemory('short_1', 'Older raw patrol note.', 10);
    state.memories.short_2 = createTurnMemory('short_2', 'Second raw patrol note.', 20);
    const memorySummary = new FakeMemorySummaryClient({
      summaries: [
        {
          text: 'The patrol notes now summarize into a mid-term beat memory.',
          importance: 65,
          certainty: 'fact'
        }
      ]
    });

    const next = await runPlayerTurn({
      state,
      playerInput: 'Continue the patrol.',
      narrator: new MockNarratorClient(),
      memorySummary,
      memoryCompression: {
        autoCompressionEnabled: true,
        recentRawTurnLimit: 12,
        shortTermBatchSize: 2,
        midTermBatchSize: 15,
        longTermPromptTokenBudget: 24000
      }
    });

    expect(memorySummary.prompts).toHaveLength(1);
    expect(Object.values(next.memories).some((memory) => memory.tier === 'mid_term')).toBe(true);
    expect(next.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'memory_compression_failed')).not.toBe(true);
    expect(next.storyLog.at(-1)?.turnMetrics?.apiUsage).toEqual(
      expect.arrayContaining([expect.objectContaining({ route: 'memorySummary', callCount: 1 })])
    );
  });

  it('keeps the completed turn when memory compression fails', async () => {
    const state = createInitialRuntimeState();
    state.memories.short_1 = createTurnMemory('short_1', 'Older raw patrol note.', 10);
    state.memories.short_2 = createTurnMemory('short_2', 'Second raw patrol note.', 20);

    const next = await runPlayerTurn({
      state,
      playerInput: 'Continue the patrol.',
      narrator: new MockNarratorClient(),
      memorySummary: new FakeMemorySummaryClient(new Error('summary route failed')),
      memoryCompression: {
        autoCompressionEnabled: true,
        recentRawTurnLimit: 12,
        shortTermBatchSize: 2,
        midTermBatchSize: 15,
        longTermPromptTokenBudget: 24000
      }
    });

    expect(next.turnCounter).toBe(1);
    expect(next.storyLog.at(-1)?.text).toBeTruthy();
    expect(next.storyLog.at(-1)?.writebackDiagnostics?.some((issue) => issue.code === 'memory_compression_failed')).toBe(true);
  });

  it('diagnoses due deferred events that were projected but not handled by structured writeback', async () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 13, hour: 2, minute: 5 };
    state.cases.case_bar_assault = {
      caseId: 'case_bar_assault',
      title: 'Bar assault',
      caseType: 'assault',
      status: 'prosecution_review',
      playerRole: 'lead',
      summary: 'A bar assault file has been submitted for prosecution review.',
      currentFocus: 'Await prosecution response.',
      playerVisibleProgress: 'The file is waiting for a prosecution note.',
      internalProgressSummary: 'Submitted file pending review.',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      evidenceIds: [],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'player_known',
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };
    state.deferredEvents.deferred_prosecution_note = {
      eventId: 'deferred_prosecution_note',
      sourceModule: 'case',
      relatedIds: { caseId: 'case_bar_assault' },
      title: 'Prosecution note due',
      summary: 'The prosecution office should return a preliminary note.',
      triggerAt: { year: 1988, month: 9, day: 13, hour: 2, minute: 0 },
      visibility: 'hidden',
      promptInstruction: 'Resolve, cancel, or reschedule this prosecution note through deferredEventPatches.',
      status: 'pending',
      createdAt: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: 'Wait for the prosecution note.',
      narrator: new MissingDueDeferredPatchNarratorClient()
    });

    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'deferredEventPatches', 'deferred_prosecution_note'],
        code: 'unhandled_due_deferred_event'
      })
    );
    expect(next.storyLog.at(-1)?.text).toContain('prosecutor has sent a note');
    expect(next.deferredEvents.deferred_prosecution_note?.status).toBe('pending');
  });

  it('uses writeback repair to resolve projected due deferred events when the main narrator omits the patch', async () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 13, hour: 2, minute: 5 };
    state.cases.case_bar_assault = {
      caseId: 'case_bar_assault',
      title: 'Bar assault',
      caseType: 'assault',
      status: 'prosecution_review',
      playerRole: 'lead',
      summary: 'A bar assault file has been submitted for prosecution review.',
      currentFocus: 'Await prosecution response.',
      playerVisibleProgress: 'The file is waiting for a prosecution note.',
      internalProgressSummary: 'Submitted file pending review.',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      evidenceIds: [],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'player_known',
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };
    state.deferredEvents.deferred_prosecution_note = {
      eventId: 'deferred_prosecution_note',
      sourceModule: 'case',
      relatedIds: { caseId: 'case_bar_assault' },
      title: 'Prosecution note due',
      summary: 'The prosecution office should return a preliminary note.',
      triggerAt: { year: 1988, month: 9, day: 13, hour: 2, minute: 0 },
      visibility: 'hidden',
      promptInstruction: 'Resolve, cancel, or reschedule this prosecution note through deferredEventPatches.',
      status: 'pending',
      createdAt: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    };
    const repair = new DeferredEventRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: 'Wait for the prosecution note.',
      narrator: new MissingDueDeferredPatchNarratorClient(),
      writebackRepair: repair
    });

    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    expect(repair.prompt).toContain('deferred_prosecution_note');
    expect(next.deferredEvents.deferred_prosecution_note?.status).toBe('resolved');
    expect(next.storyLog.at(-1)?.text).toContain('prosecutor has sent a note');
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'deferredEventPatches'],
        code: 'writeback_repair_applied'
      })
    );
    expect(latestDiagnostics.some((issue) => issue.code === 'unhandled_due_deferred_event')).toBe(false);
  });

  it('repairs projected due deferred events that are rescheduled to the turn end time', async () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 13, hour: 2, minute: 5 };
    state.cases.case_bar_assault = {
      caseId: 'case_bar_assault',
      title: 'Bar assault',
      caseType: 'assault',
      status: 'prosecution_review',
      playerRole: 'assist',
      summary: 'A bar assault file is waiting for the lead officer review.',
      currentFocus: 'Await lead officer response.',
      playerVisibleProgress: 'The file is waiting for a lead officer note.',
      internalProgressSummary: 'Submitted file pending review.',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      evidenceIds: [],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'player_known',
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };
    state.deferredEvents.deferred_prosecution_note = {
      eventId: 'deferred_prosecution_note',
      sourceModule: 'case',
      relatedIds: { caseId: 'case_bar_assault' },
      title: 'Prosecution note due',
      summary: 'The lead officer should return a preliminary note.',
      triggerAt: { year: 1988, month: 9, day: 13, hour: 2, minute: 0 },
      visibility: 'hidden',
      promptInstruction: 'Resolve, cancel, or reschedule this note through deferredEventPatches.',
      status: 'pending',
      createdAt: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    };
    const repair = new PendingLaterDeferredEventRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: 'Hand over the form and wait for the lead officer response.',
      narrator: new RescheduleDueDeferredToTurnEndNarratorClient(),
      writebackRepair: repair
    });

    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    expect(repair.prompt).toContain('"hour":2,"minute":10');
    expect(next.time).toEqual({ year: 1988, month: 9, day: 13, hour: 2, minute: 10 });
    expect(next.deferredEvents.deferred_prosecution_note?.status).toBe('pending');
    expect(next.deferredEvents.deferred_prosecution_note?.triggerAt).toEqual({
      year: 1988,
      month: 9,
      day: 13,
      hour: 2,
      minute: 15
    });
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'deferredEventPatches'],
        code: 'writeback_repair_applied'
      })
    );
    expect(latestDiagnostics.some((issue) => issue.code === 'unhandled_due_deferred_event')).toBe(false);
  });

  it('runs due city situation tracks after a meaningful time jump', async () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 12, hour: 16, minute: 0 };
    state.citySituationTracks = {
      track_film_wrap: {
        trackId: 'track_film_wrap',
        title: '金禾片场警匪片拍摄',
        trackType: 'film_production',
        status: 'active',
        pressureLevel: 2,
        visibility: 'rumor',
        startedAt: { year: 1988, month: 9, day: 12, hour: 8, minute: 0 },
        nextReviewAt: { year: 1988, month: 9, day: 12, hour: 23, minute: 0 },
        relatedOrganizationIds: ['org_golden_harvest'],
        relatedPowerFigureIds: ['power_golden_harvest_chow_boss'],
        relatedPlaceIds: ['place_golden_harvest_studio'],
        relatedActorIds: [],
        summary: '金禾片场有警匪片正在拍摄。',
        currentBeat: '外景队还在赶夜戏。',
        possibleDevelopments: ['杀青新闻'],
        lastOutputTurnId: undefined
      }
    };

    const backgroundEvolution = new BackgroundCityEvolutionClient();
    const next = await runPlayerTurn({
      state,
      playerInput: '值完这班，等天亮再看新闻。',
      narrator: new QuietNarratorClient(),
      backgroundEvolution
    });

    expect(backgroundEvolution.calls).toBe(1);
    expect(Object.values(next.dynamicEvents.newsIssues).some((issue) => issue.headline.includes('杀青'))).toBe(true);
    expect(next.citySituationTracks.track_film_wrap.currentBeat).toContain('阶段性进展');
    expect(next.backgroundEvolution.lastRun?.status).toBe('succeeded');
    expect(next.storyLog.at(-1)?.turnMetrics?.apiUsage).toEqual(
      expect.arrayContaining([expect.objectContaining({ route: 'backgroundEvolution', callCount: 1 })])
    );
  });

  it('runs due city situation tracks after an absolute long-span time jump', async () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 12, hour: 22, minute: 35 };
    state.citySituationTracks = {
      track_tv_city_pressure: {
        trackId: 'track_tv_city_pressure',
        title: '清水湾电视城启用压力',
        trackType: 'media_campaign',
        status: 'active',
        pressureLevel: 1,
        visibility: 'public',
        startedAt: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
        nextReviewAt: { year: 1988, month: 9, day: 19, hour: 18, minute: 0 },
        relatedOrganizationIds: ['org_tvb'],
        relatedPowerFigureIds: [],
        relatedPlaceIds: ['place_tv_city_clear_water_bay'],
        relatedActorIds: [],
        summary: '清水湾电视城启用后，片场、人手、艺员和媒体流动都更密。',
        currentBeat: '娱乐记者和制作组都在适应新片场节奏。',
        possibleDevelopments: ['娱乐新闻']
      }
    };

    const backgroundEvolution = new BackgroundCityEvolutionClient();
    const next = await runPlayerTurn({
      state,
      playerInput: '过一周后看报纸。',
      narrator: new LongSpanTargetTimeNarratorClient(),
      backgroundEvolution
    });

    expect(next.time).toEqual({ year: 1988, month: 9, day: 19, hour: 19, minute: 0 });
    expect(backgroundEvolution.calls).toBe(1);
    expect(next.citySituationTracks.track_tv_city_pressure.lastOutputTurnId).toMatch(/^turn_/);
    expect(Object.values(next.dynamicEvents.newsIssues).some((issue) => issue.headline.includes('清水湾电视城'))).toBe(true);
    expect(next.backgroundEvolution.recentOutcomes).toHaveLength(1);
  });

  it('applies city situation track writeback before later track review', async () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 12, hour: 22, minute: 0 };
    state.citySituationTracks = {};

    const first = await runPlayerTurn({
      state,
      playerInput: '问记者片场情况',
      narrator: new CityTrackCreatingNarratorClient()
    });
    expect(first.citySituationTracks.track_turn_test_film).toBeDefined();

    const backgroundEvolution = new BackgroundCityEvolutionClient();
    const second = await runPlayerTurn({
      state: first,
      playerInput: '第二天早上看报纸',
      narrator: new QuietNarratorClient(),
      backgroundEvolution
    });

    expect(backgroundEvolution.calls).toBe(1);
    expect(Object.values(second.dynamicEvents.newsIssues).some((issue) => issue.headline.includes('片场夜戏'))).toBe(true);
    expect(second.backgroundEvolution.lastRun?.status).toBe('succeeded');
  });

  it('uses the auxiliary generation API to create a newspaper issue when the player buys a paper', async () => {
    const state = createInitialRuntimeState();
    state.citySituationTracks = {};
    state.actors.npc_market_vendor = createActorDefaults({
      actorId: 'npc_market_vendor',
      name: '陈伯',
      gender: 'male',
      currentIdentity: 'civilian',
      publicIdentity: '旺角街市菜贩',
      profileSummary: '在旺角街市经营菜档的老街坊。',
      presence: 'absent',
      visibility: 'player_known',
      importance: 45
    });
    const auxiliaryGeneration = new AuxiliaryNewsNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '在报摊买一份大公报，看看今天本港新闻。',
      narrator: new NewspaperTriggerNarratorClient(),
      auxiliaryGeneration
    } as unknown as Parameters<typeof runPlayerTurn>[0]);

    const issues = Object.values(next.dynamicEvents.newsIssues);
    expect(auxiliaryGeneration.calls).toBe(1);
    expect(auxiliaryGeneration.prompt).toContain('辅助生成 API');
    expect(auxiliaryGeneration.prompt).toContain('大公报');
    expect(auxiliaryGeneration.prompt).toContain('不要使用虚构报纸名');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: 'news_19880912_takungpao',
      outletName: '大公报',
      headline: '旺角街市清晨人流渐旺',
      read: false
    });
    expect(issues[0].articles[0].headline).toBe('旺角街市清晨人流渐旺');
    expect(next.storyLog.at(-1)?.turnMetrics?.apiUsage).toEqual(
      expect.arrayContaining([expect.objectContaining({ route: 'auxiliaryGeneration', callCount: 1 })])
    );
    expect(
      Object.values(next.memories).find(
        (memory) => memory.kind === 'actor' && memory.relatedActorIds.includes('npc_market_vendor')
      )
    ).toEqual(
      expect.objectContaining({
        certainty: 'claim',
        visibility: 'private'
      })
    );
  });

  it('projects a reviewed city rumor through the background API without local gray-network fact generation', async () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 12, hour: 16, minute: 0 };
    state.citySituationTracks = {
      track_triad_rumor: {
        trackId: 'track_triad_rumor',
        title: '旺角夜场插旗风声',
        trackType: 'triad_expansion',
        status: 'active',
        pressureLevel: 2,
        visibility: 'rumor',
        startedAt: { year: 1988, month: 9, day: 12, hour: 8, minute: 0 },
        nextReviewAt: { year: 1988, month: 9, day: 12, hour: 23, minute: 0 },
        relatedOrganizationIds: [],
        relatedPowerFigureIds: [],
        relatedPlaceIds: ['place_portland_street'],
        relatedActorIds: [],
        summary: '旺角夜场有基层社团试探。',
        currentBeat: '看场和收数风声变密。',
        possibleDevelopments: ['街面传闻']
      }
    };

    const backgroundEvolution = new BackgroundCityEvolutionClient('signal');
    const next = await runPlayerTurn({
      state,
      playerInput: '值完这班，留意旺角街面风声。',
      narrator: new QuietNarratorClient(),
      backgroundEvolution
    });

    expect(backgroundEvolution.calls).toBe(1);
    expect(Object.values(next.dynamicEvents.signals).some((signal) => signal.title.includes('旺角夜场插旗风声'))).toBe(true);
    expect(
      next.grayNetworks.byAreaId.place_portland_street?.climate.some((item) => item.key === 'climate_track_triad_rumor')
    ).not.toBe(true);
  });

  it('reports the active stage and forwards cancellation to the live narrator request', async () => {
    const state = createInitialRuntimeState();
    const controller = new AbortController();
    const stages: string[] = [];
    let receivedSignal: AbortSignal | undefined;
    let markNarratorStarted!: () => void;
    const narratorStarted = new Promise<void>((resolve) => {
      markNarratorStarted = resolve;
    });
    const narrator: NarratorClient = {
      complete: (_prompt, options) => {
        receivedSignal = options?.signal;
        markNarratorStarted();
        return new Promise<unknown>((_resolve, reject) => {
          const rejectForAbort = () =>
            reject(options?.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
          if (options?.signal?.aborted) rejectForAbort();
          else options?.signal?.addEventListener('abort', rejectForAbort, { once: true });
        });
      }
    };

    const turnPromise = runPlayerTurn({
      state,
      playerInput: '我先查看值班记录。',
      narrator,
      signal: controller.signal,
      onStageChange: (stage) => stages.push(stage)
    });

    await narratorStarted;
    expect(receivedSignal).toBe(controller.signal);
    expect(stages).toEqual(['recalling_memory', 'generating_narrative']);

    controller.abort(new DOMException('玩家中止。', 'AbortError'));

    await expect(turnPromise).rejects.toMatchObject({ name: 'AbortError' });
  });
});

function createTurnMemory(memoryId: string, text: string, minute: number) {
  return {
    memoryId,
    text,
    kind: 'turn' as const,
    tier: 'short_term' as const,
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    relatedTurnId: 'turn_old',
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute },
    importance: 50,
    visibility: 'player_known' as const,
    certainty: 'fact' as const,
    embeddingText: text
  };
}
