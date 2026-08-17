import { describe, expect, it } from 'vitest';
import type { MemoryEmbeddingClient } from '../memory/MemoryEmbeddingClient';
import type {
  NarratorClient,
  NarratorInput,
  NarratorStreamOptions
} from '../narrator/NarratorClient';
import { NarratorAttemptError } from '../narrator/NarratorErrors';
import { MockNarratorClient } from '../narrator/MockNarratorClient';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { GameTime, RuntimeState } from '../runtime/types';
import { createDefaultAiSettings } from '../settings/defaultSettings';
import type { JudgementRecoveryTrace } from '../conflict/judgementRecoveryTrace';
import { addGameHours } from '../backgroundEvolution/time';
import type { CustomCharacterRevision } from '../customContent/assetTypes';
import {
  bindCustomCharacterRevisionToState,
  setCustomContentPriorityInState
} from '../customContent/saveBinding';
import { createNativeCustomSaveAdaptationBundle } from '../customContent/saveAdaptation';
import { createDefaultCustomCharacterAdaptationPolicy } from '../customContent/worldAdaptation';
import { HK_1988_ADAPTATION_DESCRIPTOR } from '../worldpack/adaptationRegistry';
import {
  repairPendingActorWritebacksInSave,
  runPlayerTurn as runPlayerTurnStrict
} from './TurnEngine';

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
    prompts: string[] = [];

    async complete(prompt: string): Promise<unknown> {
      this.prompt = prompt;
      this.prompts.push(prompt);
      if (prompt.includes('ACTOR_PROFILE_ENRICHMENT_TASK')) {
        return {
          actorPatches: [
            {
              actorId: 'npc_pc_8842_keung',
              bodyConditionSummary: '夜班巡逻后略感疲惫，行动状态正常。'
            }
          ]
        };
      }
      return {
      actorPatches: [
        {
          actorId: 'npc_pc_8842_keung',
          equipment: ['史密斯威森M10左轮手枪', '警棍', '手铐']
        }
      ]
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

class ActorProfileEnrichmentNarratorClient implements NarratorClient {
  prompts: string[] = [];
  enrichmentCalls = 0;

  constructor(private readonly failedAttempts = 0) {}

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    if (!prompt.includes('ACTOR_PROFILE_ENRICHMENT_TASK')) return { actorIdentityMerges: [] };

    this.enrichmentCalls += 1;
    if (this.enrichmentCalls <= this.failedAttempts) return { actorPatches: [] };

    const candidatesLine = /^candidates=(.+)$/m.exec(prompt)?.[1];
    const candidates = candidatesLine
      ? (JSON.parse(candidatesLine) as Array<{ actorId: string; requestedFields: string[] }>)
      : [];
    return {
      actorPatches: candidates.map((candidate) => ({
        actorId: candidate.actorId,
        ...(candidate.requestedFields.includes('roleProfiles')
          ? {
              roleProfiles: {
                triad: {
                  status: 'active',
                  roleTitle: '街头外围成员',
                  obligationSummary: '替同伴照看餐厅后门。',
                  riskSummary: '容易因街面滋事被警方盘查。'
                }
              }
            }
          : {}),
        ...(candidate.requestedFields.includes('bodyConditionSummary')
          ? { bodyConditionSummary: '身体无明显伤势，情绪戒备。' }
          : {}),
        ...(candidate.requestedFields.includes('longTermMemorySummary')
          ? { longTermMemorySummary: '记得玩家曾在餐厅后门向自己问话。' }
          : {}),
        ...(candidate.requestedFields.includes('recentInteractionMemory')
          ? { recentInteractionMemory: '刚向玩家说明后门附近的动静。' }
          : {})
      }))
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
      turnSummary: '玩家在茶档向王婶询问可疑车辆去向。',
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

class MinimumIncompleteAuntieNarratorClient implements NarratorClient {
  async complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const base = (await new CallNameAuntieNarratorClient().complete(prompt, options)) as {
      narrativeText: string;
      turnSummary: string;
      suggestedActions: string[];
      writeback: Record<string, unknown>;
    };
    return {
      ...base,
      writeback: {
        ...base.writeback,
        actorPatches: [{ actorId: 'npc_shopkeeper_auntie_wong', name: '王婶' }]
      }
    };
  }
}

class DelayedActorIdentityReviewNarratorClient implements NarratorClient {
  prompts: string[] = [];
  identityReviewCalls = 0;

  constructor(private readonly failedAttempts: number) {}

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    if (!prompt.includes('newActorRepairRequirements=')) return {};

    this.identityReviewCalls += 1;
    if (this.identityReviewCalls <= this.failedAttempts) {
      return {
        actorPatches: []
      };
    }

    return {
      actorPatches: [
        {
          actorId: 'npc_shopkeeper_auntie_wong',
          gender: 'female',
          computedAge: 52,
          currentIdentity: 'civilian',
          publicIdentity: '街坊茶档老板娘'
        }
      ]
    };
  }
}

class NetworkFailingActorRepairNarratorClient implements NarratorClient {
  calls = 0;

  async complete(prompt: string): Promise<unknown> {
    if (!prompt.includes('newActorRepairRequirements=') && !prompt.includes('NPC_IDENTITY_RESOLUTION_TASK')) {
      return {};
    }
    this.calls += 1;
    throw new TypeError('Failed to fetch');
  }
}

class AuntieNarratorWithIdentityFallback implements NarratorClient {
  identityFallbackCalls = 0;

  async complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    if (prompt.includes('newActorRepairRequirements=')) {
      this.identityFallbackCalls += 1;
      return {
        actorPatches: [
          {
            actorId: 'npc_shopkeeper_auntie_wong',
            gender: 'female',
            computedAge: 52,
            currentIdentity: 'civilian',
            publicIdentity: '街坊茶档老板娘'
          }
        ]
      };
    }
    return new MinimumIncompleteAuntieNarratorClient().complete(prompt, options);
  }
}

class GenericActorIdentityReviewNarratorClient implements NarratorClient {
  prompts: string[] = [];

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    const requirementsLine = /^newActorRepairRequirements=(.+)$/m.exec(prompt)?.[1];
    const actorIds = requirementsLine
      ? (JSON.parse(requirementsLine) as Array<{ actorId: string }>).map((item) => item.actorId)
      : [];
    return {
      actorPatches: actorIds.map((actorId) => ({
        actorId,
        gender: 'female',
        computedAge: 52,
        currentIdentity: 'civilian'
      }))
    };
  }
}

class DelayedGenericActorIdentityReviewNarratorClient implements NarratorClient {
  identityReviewCalls = 0;

  constructor(private readonly failedAttempts: number) {}

  async complete(prompt: string): Promise<unknown> {
    if (!prompt.includes('newActorRepairRequirements=')) return {};
    this.identityReviewCalls += 1;
    const requirementsLine = /^newActorRepairRequirements=(.+)$/m.exec(prompt)?.[1];
    const actorIds = requirementsLine
      ? (JSON.parse(requirementsLine) as Array<{ actorId: string }>).map((item) => item.actorId)
      : [];
    return {
      actorPatches: actorIds.flatMap((actorId) =>
        this.identityReviewCalls <= this.failedAttempts
          ? []
          : [{ actorId, gender: 'female', computedAge: 52, currentIdentity: 'civilian' }]
      )
    };
  }
}

class IncompleteActorIdentityRepairNarratorClient implements NarratorClient {
  async complete(prompt: string): Promise<unknown> {
    const requirementsLine = /^newActorRepairRequirements=(.+)$/m.exec(prompt)?.[1];
    const actorId = requirementsLine
      ? (JSON.parse(requirementsLine) as Array<{ actorId: string }>)[0]?.actorId
      : undefined;
    return {
      actorPatches: actorId ? [{ actorId }] : []
    };
  }
}

class PregnancyRiskAuntieNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const actorPatch = {
      ...createAuntieWongPatch('王婶'),
      birthDate: '1932-01-01',
      femaleProfile: {
        birthday: '1932-01-01',
        adultPrivateProfile: {
          enabled: true,
          ageConfirmedAdult: true,
          profileStatus: 'ready',
          womb: { status: '未受孕', cervixStatus: '紧闭', records: [] }
        },
        source: 'writeback'
      }
    };
    const response = {
      narrativeText: '王婶把一件只适合成年测试对象的私密健康风险告诉你，随后继续留在茶档。',
      turnSummary: '王婶的身份资料与一项关联健康风险在同一回合出现。',
      suggestedActions: ['记下王婶的资料'],
      writeback: {
        actorPatches: [actorPatch],
        pregnancyRiskPatches: [
          {
            actorId: 'npc_shopkeeper_auntie_wong',
            fatherActorId: 'player',
            riskType: 'reducedRisk',
            summary: '用于验证人物身份审核与关联风险事件原子恢复。'
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
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

class RepeatedContactRelationshipNarratorClient implements NarratorClient {
  constructor(private readonly includeMalformedEvidence = false) {}

  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '林记者第二次把一条夜总会线索交给你，并提醒你继续用旧号码联络。',
      turnSummary: '玩家与林记者再次接触，主叙事明确尝试建立持续人脉。',
      suggestedActions: ['核对她的新线索', '约定下次联络方式'],
      timePatch: {
        elapsedMinutes: 7,
        reason: '玩家与林记者交换线索。'
      },
      writeback: {
        currentMatterPatches: [
          {
            id: 'matter_reporter_followup',
            title: '林记者的后续线索',
            summary: '林记者再次交来夜总会相关线索。',
            status: 'active',
            priority: 48,
            visibility: 'known',
            source: 'npc',
            matterKind: 'social',
            pressureLevel: 1,
            responseWindow: 'open',
            currentHook: '需要核对她交来的新线索。',
            relatedActorIds: ['npc_reporter_lam']
          }
        ],
        relationshipThreadPatches: [
          {
            threadId: 'rel_network_npc_reporter_lam',
            kind: 'network',
            title: '林记者的持续线索关系',
            summary: '双方开始形成持续的线索互通。',
            relatedActorIds: ['npc_reporter_lam'],
            primaryActorId: 'npc_reporter_lam',
            relationshipRole: '媒体联系人',
            status: 'active',
            creationBasis: 'repeated_contact',
            evidenceRefs: [
              {
                kind: this.includeMalformedEvidence ? 'currentTurn' : 'current_turn',
                refId: 'current_turn',
                summary: '本回合再次交换线索。'
              },
              ...(this.includeMalformedEvidence
                ? [
                    {
                      kind: 'contact_history',
                      refId: 'memory_reporter_first_contact',
                      summary: '模型给出的非法证据类别。'
                    }
                  ]
                : [])
            ],
            currentPull: '林记者可能继续传来夜总会线索。',
            visibility: 'player_known',
            importance: 68
          }
        ]
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class RepeatedContactRelationshipRepairNarratorClient implements NarratorClient {
  calls = 0;
  prompt = '';

  constructor(
    private readonly mode:
      | 'real_memory'
      | 'alias_memory'
      | 'copied_memory_text'
      | 'invalid_basis'
      | 'empty'
      | 'fake_memory'
      | 'unrelated_actor' = 'real_memory'
  ) {}

  async complete(prompt: string): Promise<unknown> {
    this.calls += 1;
    this.prompt = prompt;
    if (this.mode === 'empty') return { relationshipThreadPatches: [] };
    return {
      relationshipThreadPatches: [
        {
          threadId: 'rel_network_npc_reporter_lam',
          kind: 'network',
          title: '林记者的持续线索关系',
          summary: '双方经过多次接触，形成持续的线索互通。',
          relatedActorIds: [this.mode === 'unrelated_actor' ? 'npc_unrelated' : 'npc_reporter_lam'],
          primaryActorId: this.mode === 'unrelated_actor' ? 'npc_unrelated' : 'npc_reporter_lam',
          relationshipRole: '媒体联系人',
          status: 'active',
          creationBasis: this.mode === 'invalid_basis' ? 'ongoing_investigation' : 'repeated_contact',
          evidenceRefs: [
            {
              kind: 'current_turn',
              refId: 'current_turn',
              summary: '本回合再次交换线索。'
            },
            {
              kind: this.mode === 'alias_memory' ? 'memories' : 'memory',
              refId: this.mode === 'fake_memory' ? 'memory_missing' : 'memory_reporter_first_contact',
              ...(this.mode === 'copied_memory_text'
                ? { text: '此前已经有过一次可核验的线索交换。' }
                : { summary: '此前已经有过一次可核验的线索交换。' })
            }
          ],
          currentPull: '林记者可能继续传来夜总会线索。',
          visibility: 'player_known',
          importance: 68
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
      turnSummary: '玩家刚接到值日警长转来的夜场滋事报案，报案来源是金粉世家经理的来电。',
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

class RecurringIncidentOriginNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      writebackVersion: '1.6',
      narrativeText:
        '【旁白】你留在报案室继续整理金粉世家报警事项的旧记录，值日警长只让你核对昨晚已经登记的到场时间。',
      turnSummary: '玩家继续核对既有金粉世家事项的到场时间，未发生新的警务安排。',
      playerVitalsReview: {
        changed: false,
        reason: '玩家只进行普通文书核对，身体状态没有变化。'
      },
      suggestedActions: ['核对到场登记', '翻看昨晚的值班记录'],
      timePatch: {
        elapsedMinutes: 5,
        reason: '玩家继续核对既有报案记录。'
      },
      writeback: {}
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
      status: 'applied',
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
      turnSummary: '玩家在警署更衣室脱下夏季军装，换上浅蓝衬衫、灰色西裤和便鞋后离开。',
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
      writebackVersion: '1.6',
      narrativeText:
        '你沿着后巷追出去，雨水和油污让脚下发滑。对方钻进堆满纸箱的巷尾时，你猛地扑上去把人压倒，膝盖撞在石阶边，胸口一阵发紧，喘了好几口气才把手铐扣稳。',
      playerVitalsReview: {
        changed: true,
        reason: '玩家完成追捕和近身制服，膝盖撞上石阶并出现明显体力消耗。'
      },
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
      writebackVersion: '1.6',
      narrativeText:
        '值日警长说金粉世家经理刚来电报警，请你过去处理包厢滋事。你脱下军装换成浅蓝衬衫和灰裤，带着录音带奔跑下两层楼，在门口把录音带交给林记者，胸口发紧。',
      turnSummary: '玩家刚接到金粉世家经理来电报警的派警任务，随后换装、跑下楼并交出录音带。',
      playerVitalsReview: {
        changed: true,
        reason: '玩家带着物品奔跑下楼，体力明确下降。'
      },
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
  prompts: string[] = [];

  constructor(private readonly repair: unknown) {}

  async complete(prompt: string): Promise<unknown> {
    this.calls += 1;
    this.prompt = prompt;
    this.prompts.push(prompt);
    return this.repair;
  }
}

class PlayerVitalsFallbackRepairNarratorClient implements NarratorClient {
  calls = 0;
  prompts: string[] = [];

  constructor(private readonly focusedRepairValid = true) {}

  async complete(prompt: string): Promise<unknown> {
    this.calls += 1;
    this.prompts.push(prompt);
    if (prompt.includes('COMBINED_WRITEBACK_REPAIR_TASK')) {
      return {
        playerVitals: {
          actorPatches: [{ actorId: 'player' }]
        }
      };
    }
    if (!this.focusedRepairValid) {
      return {
        actorPatches: [{ actorId: 'player' }]
      };
    }
    return {
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
    };
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
      turnSummary: this.narrativeText,
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
      caseDecisions: [
        {
          candidateCaseId: 'case_tung_choi_store_nuisance',
          decision: 'downgrade_to_matter',
          resultId: 'matter_tung_choi_store_nuisance',
          reason: '现场求助尚无伤人、拘捕、证据或正式报案材料，属于普通巡逻事项。'
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
      turnSummary: '玩家把《九龙重案》第四章补完，同一份手稿从前三章推进到前四章。',
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

class ManuscriptProgressWithDuplicateAssetNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '你把《九龙重案》第四章续完，原来的手稿已经推进到前四章。',
      suggestedActions: ['明早去报社投稿', '继续校对手稿'],
      writeback: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_kowloon_novel_chapter_4',
              category: 'document',
              name: '《九龙重案》第四章手稿',
              summary: '玩家今晚新写完的第四章。'
            }
          ]
        }
      }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class CompositeWalletKeychainNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '你把钱包和钥匙串一起收回外套口袋。',
      suggestedActions: ['检查门匙', '数一下钱包里的零钱'],
      writeback: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_wallet_keychain',
              category: 'general',
              name: '钱包、钥匙串',
              summary: '玩家随身携带的钱包和钥匙串。'
            }
          ]
        }
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

class ExplicitNamedActorDuplicateNarratorClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    this.prompt = prompt;
    const response = {
      narrativeText: '沈景和从柜台后取出那叠旧报纸，逐张核对日期后交到你手里。',
      turnSummary: '玩家点名寻找沈景和，并从他手中取回此前留存的旧报纸。',
      suggestedActions: ['询问报纸来源', '先翻看日期'],
      playerVitalsReview: {
        changed: false,
        reason: '本回合只有交谈与取物，生命、体力和身体状态没有变化。'
      },
      timePatch: {
        elapsedMinutes: 10,
        reason: '简短交谈并核对旧报纸。'
      },
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_new_shen_jinghe',
            name: '沈景和',
            gender: 'male',
            computedAge: 45,
            currentIdentity: 'gang_member',
            publicIdentity: '码头社团头目',
            positionSummary: '在码头主持社团事务。',
            profileSummary: '一个与旧书店无关的社团人物。',
            statusSummary: '已经把旧报纸交给玩家。',
            presence: 'mentioned'
          }
        ],
        actorMemories: [
          {
            actorId: 'npc_new_shen_jinghe',
            actorName: '沈景和',
            text: '把此前替玩家留存的旧报纸交还给玩家。',
            importance: 60,
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

class ActorIdentityMergeRepairNarratorClient implements NarratorClient {
  prompts: string[] = [];

  constructor(private readonly responseContract: 'legacy' | 'canonical' = 'legacy') {}

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    if (prompt.includes('newActorRepairRequirements=')) {
      return {
        actorPatches: [
          {
            actorId: 'npc_tang_chi_wai',
            name: '邓志威',
            englishName: 'Tang Chi-wai',
            callName: '阿威',
            aliases: ['阿威'],
            gender: 'male',
            computedAge: 23,
            currentIdentity: 'gang_member',
            publicIdentity: '夜场古惑仔'
          }
        ]
      };
    }
    if (!prompt.includes('NPC_IDENTITY_RESOLUTION_TASK')) return {};
    if (this.responseContract === 'canonical') {
      return {
        actorIdentityMerges: [
          {
            actorId: 'npc_tang_chi_wai',
            decision: 'merge',
            canonicalActorId: 'npc_blonde_leader',
            canonicalName: '邓志威',
            canonicalEnglishName: 'Tang Chi-wai',
            aliases: ['金毛', '阿威'],
            evidence: '新写回是原外号人物被逼问后揭示真名。'
          }
        ]
      };
    }
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

class MissingPoliceAssignmentWritebackNarratorClient implements NarratorClient {
  constructor(
    private readonly playerName: string,
    private readonly formal = true
  ) {}

  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const event = this.formal
      ? `${this.playerName}今天正式晋升为高级督察，并调任西九龙总区重案组 E 队指挥官。`
      : `${this.playerName}与长官讨论未来申请调往西九龙重案组，但人事命令尚未批准。`;
    const response = {
      narrativeText: `【旁白】${event}`,
      turnSummary: event,
      suggestedActions: ['继续处理当值工作'],
      timePatch: { elapsedMinutes: 10, reason: '完成警务人事谈话。' },
      writeback: { memories: [] }
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class CaseIntakeInvalidKeepRepairClient implements NarratorClient {
  async complete(): Promise<unknown> {
    return {
      caseDecisions: [
        {
          candidateCaseId: 'case_tung_choi_store_nuisance',
          decision: 'keep',
          resultId: 'case_tung_choi_store_nuisance',
          reason: '主叙事已经建立案件候选，信息不足时按安全规则保留。'
        }
      ],
      casePatches: [
        {
          caseId: 'case_tung_choi_store_nuisance',
          status: 'still_working'
        }
      ],
      memories: [
        {
          text: '案件准入审核器返回了辅助记忆，但案件修订字段无效。',
          kind: 'world',
          importance: 30,
          visibility: 'player_known',
          certainty: 'fact'
        }
      ]
    };
  }
}

class IdentityRevealWithRelationshipNarratorClient implements NarratorClient {
  async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const response = {
      narrativeText: '金毛承认真名是邓志威，并再次提起此前与玩家的持续冲突。',
      turnSummary: '同一人物揭示真名，主叙事同时尝试建立持续冲突关系线。',
      suggestedActions: ['继续追问', '核对旧案记录'],
      writeback: {
        actorPatches: [createTangChiWaiPatch()],
        relationshipThreadPatches: [
          {
            threadId: 'rel_conflict_tang_chi_wai',
            kind: 'network',
            title: '与金毛的持续冲突',
            summary: '双方因旧案和当前对峙形成持续冲突。',
            relatedActorIds: ['npc_tang_chi_wai'],
            primaryActorId: 'npc_tang_chi_wai',
            relationshipRole: '持续冲突对象',
            creationBasis: 'sustained_conflict',
            evidenceRefs: [
              {
                kind: 'current_turn',
                refId: 'current_turn',
                summary: '本回合再次发生正面对峙。'
              }
            ],
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

class ActorIdentityAndRelationshipRepairNarratorClient implements NarratorClient {
  prompts: string[] = [];

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    if (prompt.includes('newActorRepairRequirements=')) {
      return { actorPatches: [createTangChiWaiPatch()] };
    }
    if (prompt.includes('NPC_IDENTITY_RESOLUTION_TASK')) {
      return {
        actorIdentityMerges: [
          {
            sourceActorId: 'npc_tang_chi_wai',
            targetActorId: 'npc_blonde_leader',
            confidence: 'high',
            canonicalName: '邓志威',
            canonicalEnglishName: 'Tang Chi-wai',
            aliases: ['金毛', '阿威'],
            evidence: ['新写回是原外号人物揭示真名。']
          }
        ]
      };
    }
    if (prompt.includes('COMBINED_WRITEBACK_REPAIR_TASK')) {
      return {
        relationshipThreads: {
          relationshipThreadPatches: [
            {
              threadId: 'rel_conflict_tang_chi_wai',
              kind: 'network',
              title: '与金毛的持续冲突',
              summary: '双方因旧案和当前对峙形成持续冲突。',
              relatedActorIds: ['npc_tang_chi_wai'],
              primaryActorId: 'npc_tang_chi_wai',
              relationshipRole: '持续冲突对象',
              creationBasis: 'sustained_conflict',
              evidenceRefs: [
                {
                  kind: 'current_turn',
                  refId: 'current_turn',
                  summary: '本回合再次发生正面对峙。'
                },
                {
                  kind: 'memory',
                  refId: 'memory_blonde_previous_conflict',
                  summary: '旧回合已记录双方此前发生过冲突。'
                }
              ],
              visibility: 'player_known'
            }
          ]
        }
      };
    }
    return {};
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

class LengthRetryNarratorClient implements NarratorClient {
  calls = 0;
  prompts: string[] = [];
  readonly acceptedNarrative = '旺角报案室里，值日警长把同一份记录逐项说明。'.repeat(18);

  async complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    this.calls += 1;
    this.prompts.push(prompt);
    const narrativeText = this.calls === 1 ? '太短。' : this.acceptedNarrative;
    const response = {
      narrativeText,
      turnSummary: this.calls === 1 ? '首份候选摘要。' : '玩家完成值班记录核对，并听取值日警长逐项说明。',
      suggestedActions: ['继续询问记录里的时间差。', '暂时收起记录。'],
      writeback: { memories: [] }
    };
    options?.onTextDelta?.(narrativeText);
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
    if (
      options?.requestPurpose === 'auxiliary' ||
      options?.requestPurpose === 'main_turn_judgement_structure_repair'
    ) {
      return response;
    }
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

function createStateForRepeatedContactRepair(includeHistoricalMemory = true): RuntimeState {
  const state = createStateForCompatibleWritebackRepair();
  if (includeHistoricalMemory) {
    state.memories.memory_reporter_first_contact = {
      memoryId: 'memory_reporter_first_contact',
      text: '林记者此前曾给玩家留下私人电话，并交换过第一条夜总会线索。',
      kind: 'world',
      relatedActorIds: ['npc_reporter_lam'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      gameTime: { ...state.time },
      importance: 72,
      visibility: 'player_known',
      certainty: 'fact'
    };
  }
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

function createPrioritizedCustomCharacterState(): {
  state: RuntimeState;
  character: CustomCharacterRevision;
} {
  const state = createInitialRuntimeState();
  const character: CustomCharacterRevision = {
    characterAssetId: 'character-turn-planner',
    revision: 1,
    checksum: 'checksum-character-turn-planner',
    displayName: '林静仪',
    aliases: ['阿仪'],
    gender: 'female',
    profileSummary: '熟悉证物流程的法证人员。',
    backgroundSummary: '长期处理警署送检证物。',
    corePersonality: ['冷静'],
    values: ['证据'],
    coreMotivations: ['保护证据链'],
    majorRelationships: [],
    entryMode: 'asap_contact',
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy({
      lockedFields: ['displayName', 'corePersonality'],
      adaptableFields: ['occupation', 'playerContactRoutes']
    }),
    deployments: [
      {
        worldpackId: 'hk_1988',
        mode: 'native',
        defaultEnabledForNewGame: true
      }
    ],
    sourceSpans: [],
    lifecycle: {
      generationStatus: 'ready',
      reviewStatus: 'approved',
      availabilityStatus: 'enabled'
    }
  };
  const adaptationBundle = createNativeCustomSaveAdaptationBundle({
    state,
    descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
    source: { characters: [character] }
  });
  return {
    state: bindCustomCharacterRevisionToState({
      state,
      character,
      adaptationBundle,
      now: '2026-07-26T13:00:00.000Z'
    }),
    character
  };
}

const urbanLegendsArcSourceRef = {
  providerId: 'official-dlc',
  sourceType: 'official_dlc_event',
  sourceId: 'official_dlc_urban_legends_midnight_bus',
  dlcId: 'urban_legends_alpha'
} as const;

function createUrbanLegendsArcState(): RuntimeState {
  const state = createInitialRuntimeState({ currentIdentity: 'police' });
  state.world.officialDlcBindings = [{
    dlcId: 'urban_legends_alpha',
    version: '1.0.0',
    status: 'active'
  }];
  state.narrativeArcs = [
    {
      arcInstanceId: 'arc_official-dlc_official_dlc_urban_legends_midnight_bus',
      sourceRef: { ...urbanLegendsArcSourceRef },
      arcType: 'official_dlc',
      status: 'active',
      currentStageId: 'street_rumor',
      usedNodeIds: ['neighborhood_rumor'],
      createdTurn: 0,
      lastProgressTurn: 0,
      writebackRefs: []
    }
  ];
  return state;
}

function createUrbanLegendsArcNarrator(writebackApplied: boolean): NarratorClient {
  return {
    async complete(_prompt, options): Promise<unknown> {
      if (options?.requestPurpose === 'auxiliary') {
        return {
          planId: 'drama_plan_turn_0',
          planningScope: 'turn',
          mode: 'surface',
          primarySource: urbanLegendsArcSourceRef,
          supportSources: [],
          sceneFunction: 'information',
          intensity: 'low',
          playerMayIgnore: true,
          maxNewActors: 0,
          reasonSummary: '玩家正在核对午夜末班车传闻中的具体时间与记录矛盾。'
        };
      }

      const supportingRef = writebackApplied
        ? { kind: 'current_matter', id: 'matter_midnight_bus_first_clue' }
        : { kind: 'actor_memory', id: 'npc_missing_bus_witness' };
      return {
        narrativeText: writebackApplied
          ? '你把报案时间与总站交班记录并排核对，确认两份记录之间存在十五分钟差异。'
          : '你听到一个无法核实来源的说法，但暂时找不到可以确认该说法的人。',
        turnSummary: writebackApplied
          ? '玩家核对报案和交班记录，确认午夜末班车时间线存在具体矛盾。'
          : '玩家听到无法核实来源的说法，未形成可写入的人物证据。',
        suggestedActions: ['继续核对司机证词'],
        dramaExecutionTrace: {
          planId: 'drama_plan_turn_0',
          status: 'used_persistently',
          usedSourceRefs: [urbanLegendsArcSourceRef],
          resultingWritebackRefs: [supportingRef],
          narrativeArcProgress: [
            {
              arcInstanceId: 'arc_official-dlc_official_dlc_urban_legends_midnight_bus',
              sourceRef: urbanLegendsArcSourceRef,
              decision: 'advance_stage',
              currentStageId: 'street_rumor',
              previousStageId: 'street_rumor',
              nextStageId: 'first_clues',
              usedNodeIds: ['neighborhood_rumor'],
              supportingWritebackRefs: [supportingRef],
              summary: '可核对的记录矛盾把街坊传闻推进为第一批线索。'
            }
          ]
        },
        writeback: writebackApplied
          ? {
              currentMatterPatches: [
                {
                  id: 'matter_midnight_bus_first_clue',
                  title: '午夜末班车记录矛盾',
                  summary: '报案时间与总站交班记录之间存在十五分钟差异。',
                  status: 'active',
                  priority: 55,
                  visibility: 'known',
                  source: 'official_dlc',
                  matterKind: 'police_work',
                  pressureLevel: 1,
                  responseWindow: 'soon',
                  currentHook: '继续核对司机、总站和报案人的时间记录。',
                  relatedActorIds: ['player'],
                  relatedPlaceIds: [],
                  relatedCaseIds: [],
                  relatedOrganizationIds: []
                }
              ]
            }
          : {
              actorMemories: [
                {
                  actorId: 'npc_missing_bus_witness',
                  actorName: '未确认的巴士目击者',
                  text: '声称见过午夜末班车，但该人物尚未进入运行时。',
                  importance: 55,
                  visibility: 'player_known'
                }
              ]
            }
      };
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

  it('recovers top-level writeback modules and reuses the canonical home place id', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.location = { currentPlaceId: 'place_mong_kok_police_station' };
    state.actors.player = {
      ...state.actors.player,
      currentPlaceId: 'place_mong_kok_police_station',
      currentSceneId: undefined
    };
    state.player.clothing = '深色修身便服西装。';
    state.player.clothingState = {
      currentSummary: state.player.clothing,
      mode: 'off_duty_plain',
      lastChangedAt: { ...state.time }
    };
    state.places.place_midlevels_villa_planting_road = {
      ...state.places.place_hang_seng_bank_headquarters,
      placeId: 'place_midlevels_villa_planting_road',
      name: '种植道独栋别墅',
      nameZh: '种植道独栋别墅',
      nameEn: 'Plantation Road Villa',
      aliases: ['林泽的家'],
      streetAddressText: '中区半山种植道',
      canonical: false,
      source: 'runtime_generated'
    };
    state.player.homeBase = {
      placeId: 'place_midlevels_villa_planting_road',
      placeName: '种植道独栋别墅',
      housingType: '独栋别墅',
      summary: '中区半山种植道的固定住所。',
      householdSummary: '玩家独居。'
    };
    const repair = new CombinedWritebackRepairNarratorClient({});
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.6',
          narrativeText: '【旁白】下班后，你乘车回到中区种植道的独栋别墅，换上居家衣物休息。',
          turnSummary: '玩家准点下班，回到中区种植道的独栋别墅休息，并换上居家衣物。',
          suggestedActions: ['在家休息'],
          playerVitalsReview: {
            changed: false,
            reason: '玩家乘车回家休息，身体状态没有变化。'
          },
          timePatch: { elapsedMinutes: 45, reason: '玩家下班乘车回家。' },
          writeback: {},
          locationPatch: {
            currentPlaceId: 'place_player_home',
            reason: '玩家已经回到种植道住所。'
          },
          playerPatch: {
            clothing: {
              currentSummary: '居家舒适衣物。',
              mode: 'off_duty_plain',
              lastChangedReason: '回家后换下外出西装。'
            }
          },
          placePatches: [
            {
              placeId: 'place_player_home',
              name: '种植道独栋别墅',
              nameZh: '种植道独栋别墅',
              nameEn: 'Plantation Road Villa',
              aliases: ['林泽的家'],
              streetAddressText: '中区半山种植道',
              source: 'runtime_generated',
              canonical: false
            }
          ],
          currentMatterPatches: [
            {
              id: 'matter_wait_for_colleague_reply',
              title: '等待同事回音',
              summary: '玩家已经留下字条，暂时回家等待同事回音。',
              status: 'dormant',
              priority: 40,
              visibility: 'known',
              source: 'writeback'
            }
          ]
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '下班回种植道的家休息。',
      narrator,
      writebackRepair: repair
    });
    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.calls).toBe(0);
    expect(next.location.currentPlaceId).toBe('place_midlevels_villa_planting_road');
    expect(next.places.place_player_home).toBeUndefined();
    expect(next.player.clothingState).toMatchObject({
      currentSummary: '居家舒适衣物。',
      mode: 'off_duty_plain'
    });
    expect(next.dynamicEvents.currentMatters.matter_wait_for_colleague_reply).toBeDefined();
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'misplaced_writeback_promoted' }),
        expect.objectContaining({ code: 'writeback_location_reconciled' })
      ])
    );
    expect(
      diagnostics.some((issue) =>
        /failed|incomplete|invalid|missing|not_|overflow|queued|rejected|too_|unhandled|unknown|unsafe|unsupported/i.test(
          issue.code ?? ''
        )
      )
    ).toBe(false);
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

    expect(repair.prompts.some((prompt) => prompt.includes('WRITEBACK_REPAIR_TASK'))).toBe(true);
    expect(repair.prompts.every((prompt) => prompt.includes('npc_pc_8842_keung'))).toBe(true);
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

  it('creates a minimum-valid NPC immediately and completes missing ordinary fields after bounded retry', async () => {
    const state = createInitialRuntimeState();
    const repair = new ActorProfileEnrichmentNarratorClient(1);

    const created = await runPlayerTurn({
      state,
      playerInput: '问清楚后门那个阿强的身份。',
      narrator: new CallNameActorNarratorClient(),
      writebackRepair: repair
    });

    const actor = created.actors.npc_thug_ah_keung;
    const latestDiagnostics = created.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.enrichmentCalls).toBe(1);
    expect(repair.prompts[0]).toContain('ACTOR_PROFILE_ENRICHMENT_TASK');
    expect(repair.prompts[0]).toContain('NPC 普通档案补全器');
    expect(repair.prompts[0]).not.toContain('newActorRepairRequirements=');
    expect(repair.prompts[0]).toContain('严禁返回 adultPrivateProfile');
    expect(actor?.name).toBe('阿强');
    expect(actor?.callName).toBe('阿强');
    expect(actor?.aliases).toContain('阿强');
    expect(
      Object.values(created.memories).some(
        (memory) => memory.relatedActorIds.includes('npc_thug_ah_keung') && memory.text.includes('餐厅后门')
      )
    ).toBe(true);
    expect(created.pendingActorProfileEnrichments).toEqual([
      expect.objectContaining({
        actorId: 'npc_thug_ah_keung',
        missingFields: expect.arrayContaining(['roleProfiles']),
        nextRetryTurn: 3
      })
    ]);
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'actorPatches'],
        code: 'actor_minimum_creation_applied'
      })
    );
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_profile_enrichment_queued' })
    );
    expect(latestDiagnostics.some((issue) => issue.code === 'missing_actor_reference')).toBe(false);

    const waiting = await runPlayerTurn({
      state: created,
      playerInput: '继续留意后门。',
      narrator: new QuietNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.enrichmentCalls).toBe(1);
    expect(waiting.pendingActorProfileEnrichments).toHaveLength(1);

    const completed = await runPlayerTurn({
      state: waiting,
      playerInput: '把阿强的普通档案补齐。',
      narrator: new QuietNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.enrichmentCalls).toBe(2);
    expect(completed.actors.npc_thug_ah_keung).toMatchObject({
      name: '阿强',
      gender: 'male',
      computedAge: 24,
      currentIdentity: 'gang_member',
      bodyConditionSummary: '在场，等待玩家下一步指令。',
      roleProfiles: {
        triad: expect.objectContaining({ roleTitle: '街头外围成员' })
      }
    });
    expect(completed.pendingActorProfileEnrichments).toHaveLength(0);
    expect(completed.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_profile_enrichment_applied' })
    );
  });

  it('queues and non-blockingly enriches an existing NPC whose memory summaries are placeholders', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_existing_ah_ming = createActorDefaults({
      actorId: 'npc_existing_ah_ming',
      name: '阿明',
      gender: 'male',
      computedAge: 27,
      currentIdentity: 'civilian',
      publicIdentity: '无业青年',
      attitudeTowardPlayer: '无直接关系。',
      longTermMemorySummary: '无',
      recentInteractionMemory: '暂无'
    });
    const repair = new ActorProfileEnrichmentNarratorClient();

    const queued = await runPlayerTurn({
      state,
      playerInput: '继续观察街口。 ',
      narrator: new QuietNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.enrichmentCalls).toBe(0);
    expect(queued.pendingActorProfileEnrichments).toContainEqual(
      expect.objectContaining({
        actorId: 'npc_existing_ah_ming',
        missingFields: expect.arrayContaining(['longTermMemorySummary', 'recentInteractionMemory'])
      })
    );

    const completed = await runPlayerTurn({
      state: queued,
      playerInput: '再问阿明刚才看见了什么。',
      narrator: new QuietNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.enrichmentCalls).toBe(1);
    expect(completed.actors.npc_existing_ah_ming).toMatchObject({
      publicIdentity: '无业青年',
      attitudeTowardPlayer: '无直接关系。',
      longTermMemorySummary: '记得玩家曾在餐厅后门向自己问话。',
      recentInteractionMemory: '刚向玩家说明后门附近的动静。'
    });
    const remaining = (completed.pendingActorProfileEnrichments ?? []).find(
      (pending) => pending.actorId === 'npc_existing_ah_ming'
    );
    expect(remaining?.missingFields).not.toContain('longTermMemorySummary');
    expect(remaining?.missingFields).not.toContain('recentInteractionMemory');
  });

  it('fails open when identity review is unavailable and keeps a valid original actor patch', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_unrelated_shopkeeper = createActorDefaults({
      actorId: 'npc_unrelated_shopkeeper',
      name: '陈伯',
      currentIdentity: 'civilian',
      publicIdentity: '附近士多老板'
    });
    const repair = new NetworkFailingActorRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '问清楚王婶的正式姓名，并记下她提供的车辆方向。',
      narrator: new CallNameAuntieNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(1);
    expect(next.actors.npc_shopkeeper_auntie_wong?.name).toBe('王婶');
    expect(next.pendingActorWritebackRecoveries).toHaveLength(0);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'writeback_repair_failed' })
    );
  });

  it('lightly repairs only missing core creation fields and preserves the original actor patch', async () => {
    const next = await runPlayerTurn({
      state: createInitialRuntimeState(),
      playerInput: '确认王婶身份后记下她的证词。',
      narrator: new MinimumIncompleteAuntieNarratorClient(),
      writebackRepair: new GenericActorIdentityReviewNarratorClient()
    });

    expect(next.actors.npc_shopkeeper_auntie_wong).toMatchObject({
      name: '王婶',
      gender: 'female',
      computedAge: 52,
      currentIdentity: 'civilian',
      personality: ''
    });
    expect(next.pendingActorWritebackRecoveries).toHaveLength(0);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_writeback_recovery_applied' })
    );
  });

  it('keeps a still-minimum-incomplete lightweight repair queued without creating an invalid actor', async () => {
    const next = await runPlayerTurn({
      state: createInitialRuntimeState(),
      playerInput: '先记下这名街坊的话，等身份明确后再建档。',
      narrator: new MinimumIncompleteAuntieNarratorClient(),
      writebackRepair: new IncompleteActorIdentityRepairNarratorClient()
    });

    expect(next.actors.npc_shopkeeper_auntie_wong).toBeUndefined();
    expect(next.pendingActorWritebackRecoveries).toEqual([
      expect.objectContaining({ actorId: 'npc_shopkeeper_auntie_wong', lastFailureKind: 'protocol' })
    ]);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'actor_minimum_creation_repair_incomplete' }),
        expect.objectContaining({ code: 'actor_writeback_recovery_queued' })
      ])
    );
  });

  it('keeps an unresolved new actor package and restores it atomically after a later lightweight repair', async () => {
    const state = createInitialRuntimeState();
    const repair = new DelayedActorIdentityReviewNarratorClient(1);

    const deferred = await runPlayerTurn({
      state,
      playerInput: '先听王婶说完。',
      narrator: new MinimumIncompleteAuntieNarratorClient(),
      writebackRepair: repair
    });

    expect(deferred.actors.npc_shopkeeper_auntie_wong).toBeUndefined();
    expect(deferred.pendingActorWritebackRecoveries).toHaveLength(1);
    expect(deferred.pendingActorWritebackRecoveries[0]).toEqual(
      expect.objectContaining({
        actorId: 'npc_shopkeeper_auntie_wong',
        attemptCount: 1,
        nextRetryTurn: 3
      })
    );
    expect(
      Object.values(deferred.memories).some((memory) => memory.relatedActorIds.includes('npc_shopkeeper_auntie_wong'))
    ).toBe(false);

    const waiting = await runPlayerTurn({
      state: deferred,
      playerInput: '把刚才的街坊证词补进记录。',
      narrator: new QuietNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.identityReviewCalls).toBe(1);
    expect(waiting.actors.npc_shopkeeper_auntie_wong).toBeUndefined();
    expect(waiting.pendingActorWritebackRecoveries).toHaveLength(1);

    const recovered = await runPlayerTurn({
      state: waiting,
      playerInput: '继续整理遗漏的街坊身份资料。',
      narrator: new QuietNarratorClient(),
      writebackRepair: repair
    });

    expect(recovered.actors.npc_shopkeeper_auntie_wong?.name).toBe('王婶');
    expect(recovered.actors.npc_shopkeeper_auntie_wong?.aliases).toEqual([]);
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

  it('directly recovers a minimum-valid actor from recent raw story history without another API repair', async () => {
    const repair = new DelayedActorIdentityReviewNarratorClient(1);
    const deferred = await runPlayerTurn({
      state: createInitialRuntimeState(),
      playerInput: '先听王婶说完。',
      narrator: new MinimumIncompleteAuntieNarratorClient(),
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

    expect(historicalRepair.prompts.some((prompt) => prompt.includes('newActorRepairRequirements='))).toBe(false);
    expect(recovered.actors.npc_shopkeeper_auntie_wong?.name).toBe('王婶');
    expect(recovered.pendingActorWritebackRecoveries).toHaveLength(0);
    expect(
      Object.values(recovered.memories).some((memory) => memory.relatedActorIds.includes('npc_shopkeeper_auntie_wong'))
    ).toBe(true);
    expect(recovered.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_minimum_creation_applied' })
    );
  });

  it('queues a network failure once with turn backoff instead of retrying the same route', async () => {
    const repair = new NetworkFailingActorRepairNarratorClient();

    const next = await runPlayerTurn({
      state: createInitialRuntimeState(),
      playerInput: '听王婶说完并记下她的身份。',
      narrator: new MinimumIncompleteAuntieNarratorClient(),
      writebackRepair: repair,
      writebackRepairMode: 'follow-main'
    });

    expect(repair.calls).toBe(1);
    expect(next.actors.npc_shopkeeper_auntie_wong).toBeUndefined();
    expect(next.pendingActorWritebackRecoveries).toEqual([
      expect.objectContaining({
        actorId: 'npc_shopkeeper_auntie_wong',
        attemptCount: 1,
        nextRetryTurn: 3,
        lastFailureKind: 'network',
        lastRouteMode: 'follow-main'
      })
    ]);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'actor_writeback_repair_network_failed' }),
        expect.objectContaining({ code: 'actor_writeback_recovery_queued' })
      ])
    );
  });

  it('uses the main narrator once when a custom identity route is unreachable', async () => {
    const narrator = new AuntieNarratorWithIdentityFallback();
    const repair = new NetworkFailingActorRepairNarratorClient();

    const next = await runPlayerTurn({
      state: createInitialRuntimeState(),
      playerInput: '确认王婶身份后继续调查。',
      narrator,
      writebackRepair: repair,
      writebackRepairMode: 'custom'
    });

    expect(narrator.identityFallbackCalls).toBe(1);
    expect(next.actors.npc_shopkeeper_auntie_wong?.name).toBe('王婶');
    expect(next.pendingActorWritebackRecoveries).toHaveLength(0);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_writeback_repair_main_fallback_applied' })
    );
  });

  it('prioritizes the current NPC and reviews at most two queued identities per turn', async () => {
    const state = createInitialRuntimeState();
    state.pendingActorWritebackRecoveries = Array.from({ length: 19 }, (_, index) => {
      const actorId = `npc_queued_${String(index).padStart(2, '0')}`;
      const actorPatch = {
        actorId,
        name: `候选街坊${index}`
      };
      return {
        recoveryId: `legacy_turn:${actorId}`,
        sourceTurnId: `turn_${String(index + 1).padStart(4, '0')}`,
        sourceGameTime: { ...state.time },
        actorId,
        writebackJson: JSON.stringify({
          actorPatch,
          actorMemories: [],
          relationshipThreadPatches: [],
          pregnancyRiskPatches: [],
          pregnancyResolutionPatches: []
        }),
        attemptCount: 0
      };
    });
    const repair = new GenericActorIdentityReviewNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '先处理眼前王婶提供的新线索。',
      narrator: new MinimumIncompleteAuntieNarratorClient(),
      writebackRepair: repair
    });

    const identityPrompt = repair.prompts.find((prompt) => prompt.includes('newActorRepairRequirements=')) ?? '';
    expect(identityPrompt).toContain('npc_shopkeeper_auntie_wong');
    expect(identityPrompt).toContain('npc_queued_00');
    expect(identityPrompt).not.toContain('npc_queued_01');
    expect(next.actors.npc_shopkeeper_auntie_wong).toBeDefined();
    expect(next.actors.npc_queued_00).toBeDefined();
    expect(next.pendingActorWritebackRecoveries).toHaveLength(18);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_writeback_recovery_batch_limited' })
    );
  });

  it('caps one turn at three durable new actors and labels the bounded repair request accurately', async () => {
    const requestOptions: NarratorStreamOptions[] = [];
    const narrator: NarratorClient = {
      async complete(_prompt, options): Promise<unknown> {
        const response = {
          narrativeText: '人群里有几名街坊先后开口，但只有最靠近现场的三人需要建立长期档案。',
          suggestedActions: ['继续询问近处街坊'],
          writeback: {
            actorPatches: Array.from({ length: 5 }, (_, index) => ({
              actorId: `npc_crowd_${index}`,
              name: `街坊${index}`
            }))
          }
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };
    const repair: NarratorClient = {
      async complete(prompt, options): Promise<unknown> {
        if (typeof prompt !== 'string' || !prompt.includes('newActorRepairRequirements=')) return {};
        requestOptions.push(options ?? {});
        const requirements = JSON.parse(
          /^newActorRepairRequirements=(.+)$/m.exec(prompt)?.[1] ?? '[]'
        ) as Array<{ actorId: string }>;
        return {
          actorPatches: requirements.map(({ actorId }) => ({
            actorId,
            gender: 'male',
            computedAge: 40,
            currentIdentity: 'civilian'
          }))
        };
      }
    };

    const next = await runPlayerTurn({
      state: createInitialRuntimeState(),
      playerInput: '问问周围街坊。',
      narrator,
      writebackRepair: repair
    });

    expect(requestOptions).toContainEqual(
      expect.objectContaining({
        requestPurpose: 'main_turn_actor_writeback_repair'
      })
    );
    expect(next.actors.npc_crowd_0).toBeDefined();
    expect(next.actors.npc_crowd_1).toBeDefined();
    expect(next.actors.npc_crowd_2).toBeUndefined();
    expect(next.actors.npc_crowd_3).toBeUndefined();
    expect(next.actors.npc_crowd_4).toBeUndefined();
    expect(next.pendingActorWritebackRecoveries.map((pending) => pending.actorId)).toEqual([
      'npc_crowd_2'
    ]);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_writeback_new_actor_limit_applied' })
    );
  });

  it('repairs an explicit save backlog without advancing time, adding a story turn or touching finance', async () => {
    const state = createInitialRuntimeState();
    const originalTime = structuredClone(state.time);
    const originalFinance = structuredClone(state.finance);
    state.pendingActorWritebackRecoveries = Array.from({ length: 3 }, (_, index) => {
      const actorId = `npc_saved_pending_${index}`;
      return {
        recoveryId: `turn_saved:${actorId}`,
        sourceTurnId: 'turn_0042',
        sourceGameTime: { ...state.time },
        actorId,
        writebackJson: JSON.stringify({
          actorPatch: { actorId, name: `待修人物${index}` },
          actorMemories: [],
          relationshipThreadPatches: [],
          pregnancyRiskPatches: [],
          pregnancyResolutionPatches: []
        }),
        attemptCount: 0
      };
    });
    let requestOptions: NarratorStreamOptions | undefined;
    const repair: NarratorClient = {
      async complete(prompt, options): Promise<unknown> {
        requestOptions = options;
        const requirements = JSON.parse(
          /^newActorRepairRequirements=(.+)$/m.exec(String(prompt))?.[1] ?? '[]'
        ) as Array<{ actorId: string }>;
        return {
          actorPatches: requirements.map(({ actorId }) => ({
            actorId,
            gender: 'female',
            computedAge: 35,
            currentIdentity: 'civilian'
          }))
        };
      }
    };

    const result = await repairPendingActorWritebacksInSave({ state, narrator: repair });

    expect(requestOptions).toEqual(
      expect.objectContaining({
        requestPurpose: 'save_actor_writeback_repair'
      })
    );
    expect(result.repairedCount).toBe(2);
    expect(result.pendingAfter).toBe(1);
    expect(result.state.turnCounter).toBe(state.turnCounter);
    expect(result.state.time).toEqual(originalTime);
    expect(result.state.storyLog).toEqual(state.storyLog);
    expect(result.state.finance).toEqual(originalFinance);
    expect(result.state.actors.npc_saved_pending_0).toBeDefined();
    expect(result.state.actors.npc_saved_pending_1).toBeDefined();
    expect(result.state.actors.npc_saved_pending_2).toBeUndefined();
  });

  it('normalizes deterministic age and gender aliases locally before calling the save repair model', async () => {
    const state = createInitialRuntimeState();
    state.pendingActorWritebackRecoveries = [
      {
        recoveryId: 'turn_saved:npc_local_normalization',
        sourceTurnId: 'turn_0043',
        sourceGameTime: { ...state.time },
        actorId: 'npc_local_normalization',
        writebackJson: JSON.stringify({
          actorPatch: {
            actorId: 'npc_local_normalization',
            name: ' 阿芳 ',
            gender: '女',
            computedAge: '35',
            currentIdentity: 'civilian'
          },
          actorMemories: [],
          relationshipThreadPatches: [],
          pregnancyRiskPatches: [],
          pregnancyResolutionPatches: []
        }),
        attemptCount: 0
      }
    ];
    let calls = 0;
    const repair: NarratorClient = {
      async complete(): Promise<unknown> {
        calls += 1;
        throw new Error('本测试不应调用模型');
      }
    };

    const result = await repairPendingActorWritebacksInSave({ state, narrator: repair });

    expect(calls).toBe(0);
    expect(result.repairedCount).toBe(1);
    expect(result.pendingAfter).toBe(0);
    expect(result.state.actors.npc_local_normalization).toMatchObject({
      name: '阿芳',
      gender: 'female',
      computedAge: 35
    });
  });

  it('writes dependent pregnancy data in the same turn after minimum-valid actor creation', async () => {
    const repair = new DelayedGenericActorIdentityReviewNarratorClient(1);
    const next = await runPlayerTurn({
      state: createInitialRuntimeState(),
      playerInput: '先保存王婶的完整资料。',
      narrator: new PregnancyRiskAuntieNarratorClient(),
      writebackRepair: repair,
      gameSettings: { ...createDefaultAiSettings().game, pregnancyMode: 'standard' }
    });

    expect(repair.identityReviewCalls).toBe(0);
    expect(next.pendingActorWritebackRecoveries).toHaveLength(0);
    expect(
      next.actors.npc_shopkeeper_auntie_wong?.femaleProfile?.adultPrivateProfile?.womb?.pregnancy?.riskTypes
    ).toContain('reducedRisk');
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

  it('opens one focused repair when a recurring actor has current structured signals and verifiable history', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_reporter_lam = createActorDefaults({
      actorId: 'npc_reporter_lam',
      name: '林慧珊',
      gender: 'female',
      computedAge: 28,
      currentIdentity: 'civilian',
      publicIdentity: '报馆记者',
      actualIdentitySummary: '长期跑警署线的记者。',
      positionSummary: '在旺角活动。',
      presence: 'mentioned',
      profileSummary: '消息灵通。',
      appearance: '短发。',
      clothing: '浅色衬衫。',
      equipment: ['采访本'],
      personality: '谨慎。',
      speechStyle: '直接。',
      motivation: '取得可靠消息。',
      longTermGoal: '成为资深记者。',
      values: '事实。',
      relationshipSummary: '此前已与玩家交换过一次线索。',
      attitudeTowardPlayer: '保持谨慎信任。',
      interactionScore: 45,
      trustTendency: '看重守信。',
      entanglementSummary: '可能形成长期消息互通。',
      longTermMemorySummary: '记得上一次消息交换。',
      recentInteractionMemory: '上次在警署门外短谈。',
      statusSummary: '等待下一次联系。',
      visibility: 'player_known',
      importance: 65
    });
    state.memories.memory_reporter_prior = {
      memoryId: 'memory_reporter_prior',
      text: '玩家此前已和林记者核实过一条警署消息。',
      kind: 'actor',
      relatedActorIds: ['npc_reporter_lam'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      relatedTurnId: 'turn_0001',
      gameTime: { ...state.time, hour: 18 },
      importance: 65,
      visibility: 'player_known',
      certainty: 'fact'
    };
    const repair = new RelationshipThreadRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '再次收下林记者的名片，确认以后持续交换线索。',
      narrator: new MissingRelationshipThreadNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.prompt).toContain('relationshipOmissionCandidates');
    expect(repair.prompt).toContain('memory:memory_reporter_prior');
    expect(next.relationshipThreads.rel_network_npc_reporter_lam).toMatchObject({
      primaryActorId: 'npc_reporter_lam',
      kind: 'network'
    });
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'relationship_structure_repair_applied' })
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'relationship_omission_repair_applied' })
    );
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
        code: 'relationship_structure_repair_applied'
      })
    );
  });

  it('repairs one-evidence repeated contact only when a real historical reference exists', async () => {
    const state = createStateForRepeatedContactRepair();
    const repair = new RepeatedContactRelationshipRepairNarratorClient('real_memory');

    const next = await runPlayerTurn({
      state,
      playerInput: '接过林记者第二次送来的线索，继续维持联络。',
      narrator: new RepeatedContactRelationshipNarratorClient(),
      writebackRepair: repair
    });

    const thread = next.relationshipThreads.rel_network_npc_reporter_lam;
    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('memory_reporter_first_contact');
    expect(repair.prompt).toContain('至少一项必须是可核验的历史');
    expect(repair.prompt).toContain(
      'family / formal_partner / formal_informant / debt_or_promise / protection / ongoing_joint_matter / repeated_contact / sustained_conflict'
    );
    expect(repair.prompt).toContain(
      '"kind":"memory","refId":"memory_reporter_first_contact","summary":"林记者此前曾给玩家留下私人电话，并交换过第一条夜总会线索。"'
    );
    expect(thread?.creationBasis).toBe('repeated_contact');
    expect(thread?.evidenceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'current_turn', refId: 'current_turn' }),
        expect.objectContaining({ kind: 'memory', refId: 'memory_reporter_first_contact' })
      ])
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_evidence_insufficient' }),
        expect.objectContaining({ code: 'relationship_structure_repair_applied' })
      ])
    );
  });

  it('rejects repeated contact without a second real reference but still applies the rest of the turn', async () => {
    const state = createStateForRepeatedContactRepair(false);
    const repair = new RepeatedContactRelationshipRepairNarratorClient('empty');

    const next = await runPlayerTurn({
      state,
      playerInput: '接过林记者递来的线索。',
      narrator: new RepeatedContactRelationshipNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(1);
    expect(next.relationshipThreads.rel_network_npc_reporter_lam).toBeUndefined();
    expect(next.dynamicEvents.currentMatters.matter_reporter_followup).toBeDefined();
    expect(next.time.minute).toBe(state.time.minute + 7);
    expect(next.storyLog.at(-1)?.text).toContain('林记者第二次');
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_structure_repair_failed' }),
        expect.objectContaining({ code: 'relationship_creation_rejected' })
      ])
    );
  });

  it('preserves malformed relationship intent for focused recovery without regenerating the turn', async () => {
    const state = createStateForRepeatedContactRepair();
    const narrator = new RepeatedContactRelationshipNarratorClient(true);
    const repair = new RepeatedContactRelationshipRepairNarratorClient('real_memory');

    const next = await runPlayerTurn({
      state,
      playerInput: '接过林记者递来的第二条线索。',
      narrator,
      writebackRepair: repair
    });

    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('rawRelationshipIntentCandidates');
    expect(repair.prompt).toContain('contact_history');
    expect(next.relationshipThreads.rel_network_npc_reporter_lam).toBeDefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_evidence_kind_normalized' }),
        expect.objectContaining({ code: 'relationship_evidence_ref_removed' }),
        expect.objectContaining({ code: 'relationship_structure_repair_applied' })
      ])
    );
  });

  it('normalizes a finite evidence alias returned by the focused relationship repair', async () => {
    const state = createStateForRepeatedContactRepair();
    const repair = new RepeatedContactRelationshipRepairNarratorClient('alias_memory');

    const next = await runPlayerTurn({
      state,
      playerInput: '接过林记者递来的第二条线索。',
      narrator: new RepeatedContactRelationshipNarratorClient(),
      writebackRepair: repair
    });

    expect(next.relationshipThreads.rel_network_npc_reporter_lam?.evidenceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'memory', refId: 'memory_reporter_first_contact' })
      ])
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_evidence_kind_normalized' }),
        expect.objectContaining({ code: 'relationship_structure_repair_applied' })
      ])
    );
  });

  it('normalizes copied memory text only inside relationship repair evidence', async () => {
    const state = createStateForRepeatedContactRepair();
    const repair = new RepeatedContactRelationshipRepairNarratorClient('copied_memory_text');

    const next = await runPlayerTurn({
      state,
      playerInput: '接过林记者递来的第二条线索。',
      narrator: new RepeatedContactRelationshipNarratorClient(),
      writebackRepair: repair
    });

    expect(next.relationshipThreads.rel_network_npc_reporter_lam?.evidenceRefs).toContainEqual({
      kind: 'memory',
      refId: 'memory_reporter_first_contact',
      summary: '此前已经有过一次可核验的线索交换。'
    });
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_evidence_summary_normalized' }),
        expect.objectContaining({ code: 'relationship_structure_repair_applied' })
      ])
    );
  });

  it('keeps unknown relationship creation bases rejected with an explicit diagnostic', async () => {
    const state = createStateForRepeatedContactRepair();
    const repair = new RepeatedContactRelationshipRepairNarratorClient('invalid_basis');

    const next = await runPlayerTurn({
      state,
      playerInput: '接过林记者递来的第二条线索。',
      narrator: new RepeatedContactRelationshipNarratorClient(),
      writebackRepair: repair
    });

    expect(next.relationshipThreads.rel_network_npc_reporter_lam).toBeUndefined();
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_creation_basis_invalid' }),
        expect.objectContaining({ code: 'relationship_structure_repair_failed' }),
        expect.objectContaining({ code: 'relationship_creation_rejected' })
      ])
    );
  });

  it.each(['fake_memory', 'unrelated_actor'] as const)(
    'refuses a relationship repair that uses %s',
    async (mode) => {
      const state = createStateForRepeatedContactRepair();
      const repair = new RepeatedContactRelationshipRepairNarratorClient(mode);

      const next = await runPlayerTurn({
        state,
        playerInput: '接过林记者递来的第二条线索。',
        narrator: new RepeatedContactRelationshipNarratorClient(),
        writebackRepair: repair
      });

      expect(next.relationshipThreads.rel_network_npc_reporter_lam).toBeUndefined();
      expect(next.dynamicEvents.currentMatters.matter_reporter_followup).toBeDefined();
      expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: mode === 'fake_memory' ? 'relationship_structure_repair_failed' : 'writeback_repair_unrelated_actor'
          }),
          expect.objectContaining({ code: 'relationship_creation_rejected' })
        ])
      );
    }
  );

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

  it('does not repeatedly request incident-origin repair when a later turn only continues an existing matter', async () => {
    const state = createInitialRuntimeState();
    const seeded = await runPlayerTurn({
      state,
      playerInput: '接听值日警长的派警电话，准备去处理。',
      narrator: new MissingIncidentOriginNarratorClient(),
      writebackRepair: new IncidentOriginRepairNarratorClient()
    });
    const repair = new CombinedWritebackRepairNarratorClient({});

    const next = await runPlayerTurn({
      state: seeded,
      playerInput: '继续整理昨晚的到场记录。',
      narrator: new RecurringIncidentOriginNarratorClient(),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(0);
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics?.some(
        (issue) => issue.path.join('.') === 'writebackRepair.incidentOrigin'
      ) ?? false
    ).toBe(false);
  });

  it('does not treat a routine street-security bulletin as a newly reported incident', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const repair = new CombinedWritebackRepairNarratorClient({});
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.6',
          narrativeText: '【旁白】值日警长把夜间街面治安通报放到桌上，你按辖区逐项核对巡逻安排。',
          turnSummary: '玩家接到一份夜间街面治安通报，并留在警署核对既有巡逻安排。',
          suggestedActions: ['继续核对巡逻安排'],
          playerVitalsReview: {
            changed: false,
            reason: '玩家只进行了静态文书工作。'
          },
          timePatch: { elapsedMinutes: 8, reason: '玩家核对夜间巡逻安排。' },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '看看今晚的街面治安通报。',
      narrator,
      writebackRepair: repair
    });

    expect(repair.calls).toBe(0);
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics?.some(
        (issue) => issue.path.join('.') === 'writebackRepair.incidentOrigin'
      ) ?? false
    ).toBe(false);
  });

  it('accepts an explicit already-persisted incident-origin no-op without a partial writeback warning', async () => {
    const state = createInitialRuntimeState();
    const seeded = await runPlayerTurn({
      state,
      playerInput: '接听值日警长的派警电话，准备去处理。',
      narrator: new MissingIncidentOriginNarratorClient(),
      writebackRepair: new IncidentOriginRepairNarratorClient()
    });
    const repair = new CombinedWritebackRepairNarratorClient({
      incidentOrigin: {
        status: 'already_persisted',
        currentMatterPatches: [],
        memories: [],
        actorMemories: []
      }
    });

    const next = await runPlayerTurn({
      state: seeded,
      playerInput: '接听值日警长重复转来的同一通报。',
      narrator: new MissingIncidentOriginNarratorClient(),
      writebackRepair: repair
    });
    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('existingDurableMemories');
    expect(repair.prompt).toContain('already_persisted');
    expect(diagnostics.some((issue) => issue.code === 'writeback_repair_invalid')).toBe(false);
    expect(diagnostics.some((issue) => issue.code === 'invalid_type')).toBe(false);
  });

  it('normalizes a non-empty incident-origin memory string without weakening the global memory schema', async () => {
    const state = createInitialRuntimeState();
    const repair = new CombinedWritebackRepairNarratorClient({
      incidentOrigin: {
        status: 'applied',
        currentMatterPatches: [],
        memories: ['金粉世家经理来电报警，警方因此获派处理包厢滋事。'],
        actorMemories: []
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '接听值日警长的派警电话，准备去处理。',
      narrator: new MissingIncidentOriginNarratorClient(),
      writebackRepair: repair
    });
    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    const repairedMemory = Object.values(next.memories).find((memory) =>
      memory.text.includes('金粉世家经理来电报警')
    );

    expect(repair.prompt).toContain('禁止返回字符串数组');
    expect(repairedMemory).toMatchObject({
      kind: 'world',
      visibility: 'player_known',
      certainty: 'claim'
    });
    expect(diagnostics.some((issue) => issue.code === 'invalid_type')).toBe(false);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'incidentOrigin'],
        code: 'writeback_repair_applied'
      })
    );
  });

  it('keeps reporting a truly malformed incident-origin memory object', async () => {
    const state = createInitialRuntimeState();
    const repair = new CombinedWritebackRepairNarratorClient({
      incidentOrigin: {
        status: 'applied',
        currentMatterPatches: [],
        memories: [{ content: '缺少 text 字段的错误对象。' }],
        actorMemories: []
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '接听值日警长的派警电话，准备去处理。',
      narrator: new MissingIncidentOriginNarratorClient(),
      writebackRepair: repair
    });
    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writebackRepair', 'incidentOrigin', 'memories', 0, 'text'],
        code: 'invalid_type'
      })
    );
    expect(diagnostics.some((issue) => issue.code === 'writeback_repair_invalid')).toBe(true);
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

  it('uses minimal writeback repair when a formal police promotion and transfer omitted structured identity fields', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police', playerName: '杨子成' });
    const repair = new CombinedWritebackRepairNarratorClient({
      policeAssignment: {
        policeRoleProfilePatch: {
          reason: '本回合正式人事命令已经生效。',
          stationOrPost: '西九龙总区总部',
          department: '刑事侦缉处重案组 E 队',
          assignmentSummary: '担任重案组 E 队指挥官，负责跨区重案侦查。',
          postRole: 'E 队指挥官',
          publicIdentity: '高级督察 · 西九龙重案组 E 队指挥官'
        },
        currentRank: '高级督察'
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '接受正式任命并到新单位报到。',
      narrator: new MissingPoliceAssignmentWritebackNarratorClient(state.player.name),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('policeAssignment');
    expect(next.lawIdentity).toMatchObject({
      rank: '高级督察',
      stationOrPost: '西九龙总区总部',
      department: '刑事侦缉处重案组 E 队'
    });
    expect(next.actors[state.player.actorId].roleProfiles.police).toMatchObject({
      rank: '高级督察',
      stationOrPost: '西九龙总区总部',
      department: '刑事侦缉处重案组 E 队',
      postRole: 'E 队指挥官'
    });
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'police_assignment_repair_applied' })
    );
  });

  it('does not request police identity repair for a transfer that is only being discussed', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police', playerName: '杨子成' });
    const repair = new CombinedWritebackRepairNarratorClient({});

    const next = await runPlayerTurn({
      state,
      playerInput: '问问以后有没有机会调去重案组。',
      narrator: new MissingPoliceAssignmentWritebackNarratorClient(state.player.name, false),
      writebackRepair: repair
    });

    expect(repair.calls).toBe(0);
    expect(next.lawIdentity.rank).toBe(state.lawIdentity.rank);
    expect(next.lawIdentity.department).toBe(state.lawIdentity.department);
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

  it('uses the structured unchanged review instead of scanning NPC exertion or uniform words', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const repair = new CombinedWritebackRepairNarratorClient({});
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.6',
          narrativeText:
            '【旁白】值日警长穿着制服继续追问。桌边的嫌疑人喘着气，说自己只是爬楼时太急；你仍坐在原位听取口供。',
          turnSummary: '玩家留在座位上继续听取值日警长的口供汇报。',
          playerVitalsReview: {
            changed: false,
            reason: '玩家始终坐在原位听取口供，身体状态没有变化。'
          },
          suggestedActions: ['继续核对口供'],
          timePatch: { elapsedMinutes: 5, reason: '玩家继续听取口供。' },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '继续听他说。',
      narrator,
      writebackRepair: repair
    });

    expect(repair.prompt).not.toContain('PLAYER_VITALS_REPAIR_TASK');
    expect(next.player.vitals).toEqual(state.player.vitals);
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics?.some(
        (issue) => issue.code === 'writeback_repair_missing_vitals_patch'
      ) ?? false
    ).toBe(false);
  });

  it('repairs an unbounded legacy fatigue summary even when the current turn review says unchanged', async () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      startTime: { year: 1988, month: 9, day: 15, hour: 9, minute: 0 }
    });
    state.player.vitals = {
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      conditionSummary: '熬夜值守一整晚后精神松弛，强烈的疲惫感。'
    };
    state.actors.player.vitals = { ...state.player.vitals };
    const repair = new CombinedWritebackRepairNarratorClient({
      playerVitals: {
        actorPatches: [
          {
            actorId: 'player',
            vitalsPatch: {
              healthDelta: 0,
              staminaDelta: 0,
              conditionSummary: '状态正常。',
              conditionPersistence: 'stable'
            }
          }
        ]
      }
    });
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.7',
          narrativeText: '【旁白】你在警署食堂吃过早餐，随后回到值班桌核对当天排班。',
          turnSummary: '玩家吃过早餐并核对当天排班。',
          suggestedActions: ['开始当值'],
          playerVitalsReview: {
            changed: false,
            reason: '本回合是普通早餐与文书活动，没有新身体消耗。'
          },
          timePatch: { elapsedMinutes: 15, reason: '玩家吃早餐并核对排班。' },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '吃完早餐，看看今天的排班。',
      narrator,
      writebackRepair: repair
    });

    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('生命周期复核');
    expect(repair.prompt).toContain('legacy_unreviewed_condition');
    expect(next.player.vitals.conditionSummary).toBe('状态正常。');
    expect(next.player.vitals.conditionLifecycle).toEqual({
      persistence: 'stable',
      establishedAt: next.time,
      lastReviewedAt: next.time
    });
    expect(next.actors.player.vitals).toEqual(next.player.vitals);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'player_vitals_lifecycle_review_requested' }),
        expect.objectContaining({ code: 'player_vitals_lifecycle_review_applied' }),
        expect.objectContaining({ code: 'player_vitals_lifecycle_updated' })
      ])
    );
  });

  it('reviews a transient condition after it crosses a day without auto-clearing persistent injury', async () => {
    const makeNarrator = (): NarratorClient => ({
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.7',
          narrativeText: '【旁白】你安静地核对了一页记录。',
          turnSummary: '玩家核对了一页记录。',
          suggestedActions: ['继续当值'],
          playerVitalsReview: { changed: false, reason: '静态文书活动没有新增身体变化。' },
          pregnancyLifecycleReview: {
            changed: false,
            events: [],
            reason: '本回合没有妊娠生命周期事件。'
          },
          timePatch: { elapsedMinutes: 5, reason: '玩家核对记录。' },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    });
    const transient = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 13, hour: 8, minute: 0 }
    });
    transient.player.vitals = {
      ...transient.player.vitals,
      stamina: 70,
      conditionSummary: '昨夜通宵后明显疲惫。',
      conditionLifecycle: {
        persistence: 'transient',
        establishedAt: { year: 1988, month: 9, day: 12, hour: 22, minute: 0 },
        lastReviewedAt: { year: 1988, month: 9, day: 12, hour: 22, minute: 0 }
      }
    };
    transient.actors.player.vitals = transient.player.vitals;
    const transientRepair = new CombinedWritebackRepairNarratorClient({
      playerVitals: {
        actorPatches: [
          {
            actorId: 'player',
            vitalsPatch: {
              healthDelta: 0,
              staminaDelta: 10,
              conditionSummary: '睡眠不足的影响已明显缓解。',
              conditionPersistence: 'transient'
            }
          }
        ]
      }
    });

    const transientNext = await runPlayerTurn({
      state: transient,
      playerInput: '核对记录。',
      narrator: makeNarrator(),
      writebackRepair: transientRepair
    });
    expect(transientRepair.calls).toBe(1);
    expect(transientRepair.prompt).toContain('transient_condition_crossed_day');
    expect(transientNext.player.vitals.stamina).toBe(80);

    const persistent = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 20, hour: 9, minute: 0 }
    });
    persistent.player.vitals = {
      ...persistent.player.vitals,
      health: 72,
      conditionSummary: '左肩伤口仍需包扎与休养。',
      conditionLifecycle: {
        persistence: 'persistent',
        establishedAt: { year: 1988, month: 9, day: 12, hour: 22, minute: 0 },
        lastReviewedAt: { year: 1988, month: 9, day: 12, hour: 22, minute: 0 }
      }
    };
    persistent.actors.player.vitals = persistent.player.vitals;
    const persistentRepair = new CombinedWritebackRepairNarratorClient({});

    const persistentNext = await runPlayerTurn({
      state: persistent,
      playerInput: '核对记录。',
      narrator: makeNarrator(),
      writebackRepair: persistentRepair
    });
    expect(persistentRepair.calls).toBe(0);
    expect(persistentNext.player.vitals.conditionSummary).toContain('左肩伤口');
    expect(persistentNext.player.vitals.health).toBe(72);
  });

  it('asks the AI repair route to review a new-protocol response that omitted playerVitalsReview', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const repair = new CombinedWritebackRepairNarratorClient({
      playerVitals: { actorPatches: [] }
    });
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.6',
          narrativeText: '【旁白】你坐在值班桌后抄写巡逻记录，窗外的雨声一直没有停。',
          turnSummary: '玩家留在值班桌后抄写巡逻记录。',
          suggestedActions: ['继续核对巡逻记录'],
          timePatch: { elapsedMinutes: 5, reason: '玩家抄写并核对记录。' },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '把今晚的巡逻记录抄完。',
      narrator,
      writebackRepair: repair
    });

    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('主叙事遗漏了新协议要求的 playerVitalsReview');
    expect(next.player.vitals).toEqual(state.player.vitals);
    expect(diagnostics.some((issue) => issue.code === 'writeback_repair_missing_vitals_patch')).toBe(false);
  });

  it('does not request repair when a changed review already has a meaningful player vitalsPatch', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const repair = new CombinedWritebackRepairNarratorClient({});
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.6',
          narrativeText: '【旁白】你跑上楼梯，把档案送进值日室，呼吸略微加快。',
          turnSummary: '玩家跑上楼梯并把档案送进值日室。',
          suggestedActions: ['在值日室继续汇报'],
          playerVitalsReview: {
            changed: true,
            reason: '玩家快速跑上楼梯，产生轻微体力消耗。'
          },
          timePatch: { elapsedMinutes: 3, reason: '玩家跑上楼梯并递交档案。' },
          writeback: {
            actorPatches: [
              {
                actorId: 'player',
                vitalsPatch: {
                  healthDelta: 0,
                  staminaDelta: -4,
                  conditionSummary: '跑上楼后呼吸略快，体力轻微下降。'
                }
              }
            ]
          }
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '跑上楼把档案送进去。',
      narrator,
      writebackRepair: repair
    });

    expect(repair.calls).toBe(0);
    expect(next.player.vitals.stamina).toBe(96);
    expect(next.player.vitals.conditionSummary).toContain('体力轻微下降');
  });

  it('keeps a real missing-vitals warning when the structured review requires a patch but no repair route exists', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.6',
          narrativeText: '【旁白】你在湿滑后巷追上逃跑者，扭打后把人按倒，停下时明显喘不过气。',
          turnSummary: '玩家完成追捕和扭打，体力明显消耗。',
          suggestedActions: ['把人带回警署'],
          playerVitalsReview: {
            changed: true,
            reason: '玩家连续冲刺并进行近身扭打，体力明确下降。'
          },
          timePatch: { elapsedMinutes: 9, reason: '玩家完成追捕和扭打。' },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '追上去把人按倒。',
      narrator
    });

    expect(next.player.vitals).toEqual(state.player.vitals);
    const latestNarratorEntry = [...next.storyLog]
      .reverse()
      .find((entry) => entry.speaker === 'narrator');
    expect(
      latestNarratorEntry?.writebackDiagnostics
    ).toContainEqual(
      expect.objectContaining({
        path: ['writeback', 'actorPatches', 'player', 'vitalsPatch'],
        code: 'writeback_repair_missing_vitals_patch'
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

  it('falls back to a focused vitals repair when combined repair returns a player actor shell', async () => {
    const state = createStateForCompatibleWritebackRepair();
    const repair = new PlayerVitalsFallbackRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '接报后换便服，带录音带跑下楼交给林记者。',
      narrator: new MissingCompatibleWritebacksNarratorClient(),
      writebackRepair: repair
    });

    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    expect(repair.calls).toBe(2);
    expect(repair.prompts[0]).toContain('COMBINED_WRITEBACK_REPAIR_TASK');
    expect(repair.prompts[0]).toContain('禁止返回只有 actorId、没有 vitalsPatch 的玩家空壳');
    expect(repair.prompts[1]).toContain('PLAYER_VITALS_REPAIR_TASK');
    expect(next.player.vitals.stamina).toBe(92);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'writeback_repair_fallback_requested',
        path: ['writebackRepair', 'playerVitals']
      })
    );
    expect(diagnostics.some((issue) => issue.code === 'writeback_repair_missing_vitals_patch')).toBe(false);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'writeback_repair_applied',
        path: ['writeback', 'actorPatches', 'player', 'vitalsPatch']
      })
    );
  });

  it('keeps the missing vitals warning when combined and focused repair both return player actor shells', async () => {
    const state = createStateForCompatibleWritebackRepair();
    const repair = new PlayerVitalsFallbackRepairNarratorClient(false);

    const next = await runPlayerTurn({
      state,
      playerInput: '接报后换便服，带录音带跑下楼交给林记者。',
      narrator: new MissingCompatibleWritebacksNarratorClient(),
      writebackRepair: repair
    });

    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    expect(repair.calls).toBe(2);
    expect(next.player.vitals).toEqual(state.player.vitals);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'writeback_repair_missing_vitals_patch',
        path: ['writebackRepair', 'playerVitals', 'actorPatches', 0, 'vitalsPatch']
      })
    );
    expect(diagnostics.some((issue) => issue.code === 'writeback_repair_applied')).toBe(false);
  });

  it('does not request asset repair for abstract case files, photos, evidence analysis, or submitted conclusions', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.assets.items.asset_player_credentials = {
      itemId: 'asset_player_credentials',
      category: 'document',
      name: '林泽的个人证件',
      summary: '玩家日常随身携带的个人证件。',
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      importance: 30,
      visibility: 'player_known'
    };
    const repair = new CombinedWritebackRepairNarratorClient({});
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.6',
          narrativeText: '【旁白】你翻阅旧案文件、照片和账目资料，完成洗钱路径分析后向陈Sir提交推论与证据说明。',
          turnSummary: '玩家阅读1992年坠楼旧案资料，完成洗钱推论，并向陈Sir提交证据分析；玩家持有物没有变化。',
          suggestedActions: ['等待陈Sir核查'],
          playerVitalsReview: {
            changed: false,
            reason: '玩家只进行了静态资料分析。'
          },
          timePatch: { elapsedMinutes: 90, reason: '玩家查阅旧案资料。' },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '继续翻旧案文件和照片，把推论交给陈Sir。',
      narrator,
      writebackRepair: repair
    });

    expect(repair.calls).toBe(0);
    expect(next.assets.items.asset_player_credentials).toMatchObject(
      state.assets.items.asset_player_credentials
    );
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics?.some(
        (issue) => issue.path.join('.').includes('assetPatch')
      ) ?? false
    ).toBe(false);
  });

  it('reconciles malformed fixed-asset review fields from the valid main proposal', async () => {
    const state = createInitialRuntimeState();
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.6',
          narrativeText: '【旁白】律师把九套无贷款公寓的完整产权文件交给你，租约继续有效。',
          turnSummary: '玩家正式取得西区九套无贷款投资公寓的产权与控制权，现有租约继续执行。',
          suggestedActions: ['核对租约'],
          playerVitalsReview: {
            changed: false,
            reason: '玩家只完成产权文件交接。'
          },
          timePatch: { elapsedMinutes: 30, reason: '玩家完成产权文件交接。' },
          writeback: {
            assetPatch: {
              upsertItems: [
                {
                  itemId: 'asset_west_district_9_apartments',
                  category: 'fixedAsset',
                  name: '西区九套无贷款投资公寓',
                  summary: '玩家拥有并用于收租的九套西区公寓。',
                  relatedActorIds: ['player'],
                  relatedCaseIds: [],
                  relatedPlaceIds: [],
                  importance: 90,
                  visibility: 'player_known',
                  fixedAssetType: 'rentalProperty',
                  holdingRelation: 'owned',
                  primaryUse: 'rentalIncome',
                  locationSummary: '香港西区。',
                  ownershipSummary: '九套公寓均为玩家全权拥有且无贷款。',
                  accessSummary: '玩家可通过物业代理管理并进入。',
                  incomeSettlementItemIds: [],
                  expenseSettlementItemIds: []
                }
              ],
              removeItems: [],
              equippedItemIds: []
            }
          }
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };
    const repair = new CombinedWritebackRepairNarratorClient({
      assetLifecycle: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_west_district_9_apartments',
              category: 'fixedAsset',
              name: '西区九套无贷款投资公寓',
              summary: '玩家拥有并用于收租的九套西区公寓。',
              relatedActorIds: ['player'],
              relatedCaseIds: [],
              relatedPlaceIds: [],
              importance: 90,
              visibility: 'player_known',
              fixedAssetType: '住宅',
              holdingRelation: '全款持有',
              primaryUse: '收租',
              locationSummary: null,
              ownershipSummary: null,
              accessSummary: null
            }
          ],
          removeItems: [],
          equippedItemIds: []
        }
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '确认继承的九套公寓和租约。',
      narrator,
      writebackRepair: repair
    });
    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];
    const apartments = next.assets.items.asset_west_district_9_apartments;

    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('rentalProperty');
    expect(repair.prompt).toContain('可选字段没有值时省略');
    expect(apartments).toMatchObject({
      category: 'fixedAsset',
      fixedAssetType: 'rentalProperty',
      holdingRelation: 'owned',
      primaryUse: 'rentalIncome',
      locationSummary: '香港西区。',
      ownershipSummary: '九套公寓均为玩家全权拥有且无贷款。',
      accessSummary: '玩家可通过物业代理管理并进入。'
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'writeback_repair_reconciled' })
    );
    expect(
      diagnostics.some((issue) => issue.code === 'invalid_type' || issue.code === 'invalid_value')
    ).toBe(false);
  });

  it('repairs omitted hospital confirmation and pregnancy termination without regenerating the turn', async () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      startTime: { year: 1988, month: 9, day: 15, hour: 10, minute: 0 }
    });
    const actorId = 'npc_pregnancy_patient';
    state.actors[actorId] = createActorDefaults({
      actorId,
      name: '阿玲',
      gender: 'female',
      birthDate: '1962-03-08',
      computedAge: 26,
      currentIdentity: 'civilian',
      publicIdentity: '市民',
      actualIdentitySummary: '在医院接受妊娠检查的普通市民。',
      roleProfiles: {
        civilian: {
          status: 'active',
          employmentStatusId: 'medical_leave',
          publicOccupation: '文员',
          positionSummary: '普通公司文员',
          dutySummary: '处理日常文书工作。',
          decisionScopeSummary: '只负责个人经手的普通文书。',
          accessSummary: '没有特殊机构权限。',
          sectorIds: ['office_services'],
          roleTags: ['civilian'],
          livelihoodActorIds: [],
          communitySummary: '与医院和居住社区保持普通社会联系。',
          familyEconomicSummary: '依靠固定工资维持生活。',
          legalStatusSummary: '香港普通市民。'
        }
      },
      positionSummary: '医院妇产科病人',
      profileSummary: '正在接受医院检查的成年女性。',
      appearance: '成年女性。',
      clothing: '医院检查时的日常衣着。',
      personality: '谨慎。',
      speechStyle: '直接。',
      motivation: '确认自己的健康状态。',
      longTermGoal: '维持正常生活。',
      values: '重视健康。',
      statusSummary: '正在医院接受检查，意识清醒。',
      bodyConditionSummary: '处于妊娠检查与医疗观察中。',
      relationshipSummary: '与玩家是相互信任的熟人。',
      attitudeTowardPlayer: '愿意接受玩家陪同和帮助。',
      interactionScore: 60,
      trustTendency: '在医疗事务上信任玩家。',
      entanglementSummary: '本回合因医院检查与玩家产生明确互动。',
      longTermMemorySummary: '记得玩家曾在重要时刻提供帮助。',
      recentInteractionMemory: '玩家陪同她到医院完成检查。',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      presence: 'present',
      femaleProfile: {
        addressToPlayer: '阿哥',
        appearanceDescription: '成年女性，神情谨慎。',
        bodyDescription: '普通成年女性体态。',
        clothingStyle: '日常简洁衣着。',
        personalityCore: '谨慎并重视自己的健康决定。',
        affectionProgressionCondition: '需要长期可信且尊重边界的相处。',
        relationshipProgressionCondition: '需要持续沟通并尊重彼此决定。',
        adultPrivateProfile: {
          enabled: true,
          ageConfirmedAdult: true,
          profileStatus: 'ready',
          womb: {
            status: '疑似怀孕',
            cervixStatus: '紧闭',
            records: [],
            pregnancy: {
              pregnancyId: 'preg_patient_existing',
              status: 'suspected',
              registeredAt: { year: 1988, month: 8, day: 20, hour: 10, minute: 0 },
              checkDueAt: { year: 1988, month: 9, day: 10, hour: 10, minute: 0 },
              confirmationDueAt: { year: 1988, month: 10, day: 4, hour: 10, minute: 0 },
              deliveryWindowAt: { year: 1989, month: 5, day: 7, hour: 10, minute: 0 },
              dueAt: { year: 1989, month: 5, day: 17, hour: 10, minute: 0 },
              deliveryDeadlineAt: { year: 1989, month: 5, day: 27, hour: 10, minute: 0 },
              suspectedAt: { year: 1988, month: 9, day: 10, hour: 10, minute: 0 },
              chancePercent: 20,
              rollPercent: 10,
              riskTypes: ['unprotected'],
              riskSummaries: ['此前已经登记的受孕风险。'],
              paternityCandidates: [
                { actorId: 'player', name: state.player.name, visibility: 'player_known' }
              ]
            },
            lastPregnancyCheck: {
              checkedAt: { year: 1988, month: 9, day: 10, hour: 10, minute: 0 },
              result: 'positive',
              cooldownUntil: { year: 1988, month: 9, day: 10, hour: 10, minute: 0 }
            }
          }
        }
      },
      visibility: 'player_known'
    });
    const confirmationRepair = new CombinedWritebackRepairNarratorClient({
      pregnancyLifecycle: {
        pregnancyLifecycleReview: {
          changed: true,
          events: [
            { actorId, event: 'pregnancy_confirmed', reason: '医院检查明确确认妊娠。' }
          ],
          reason: '本回合发生医学确认。'
        },
        pregnancyRiskPatches: [],
        pregnancyResolutionPatches: [
          { actorId, outcome: 'pregnancy_confirmed', summary: '医院检查明确确认妊娠。' }
        ]
      }
    });
    const confirmationNarrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.7',
          narrativeText: '【医生】检查结果已经确认妊娠。医生把报告交给阿玲，并说明后续注意事项。',
          turnSummary: '医院检查明确确认阿玲已经怀孕。',
          suggestedActions: ['听医生说明后续安排'],
          playerVitalsReview: { changed: false, reason: '玩家身体状态没有变化。' },
          timePatch: { elapsedMinutes: 30, reason: '完成医院检查。' },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const confirmed = await runPlayerTurn({
      state,
      playerInput: '陪阿玲完成检查。',
      narrator: confirmationNarrator,
      writebackRepair: confirmationRepair
    });

    expect(confirmationRepair.calls).toBe(1);
    expect(confirmationRepair.prompt).toContain('pregnancyLifecycle');
    expect(confirmationRepair.prompt).toContain('pregnancyLifecycleReview');
    expect(confirmed.actors[actorId].femaleProfile?.adultPrivateProfile?.womb?.pregnancy?.status).toBe(
      'confirmed'
    );
    expect(confirmed.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'pregnancy_lifecycle_repair_requested' }),
        expect.objectContaining({ code: 'pregnancy_lifecycle_repair_applied' })
      ])
    );

    const terminationRepair = new CombinedWritebackRepairNarratorClient({
      pregnancyLifecycle: {
        pregnancyLifecycleReview: {
          changed: true,
          events: [
            { actorId, event: 'pregnancy_ended', reason: '医院已经完成妊娠终止手术。' }
          ],
          reason: '本回合发生明确妊娠终止。'
        },
        pregnancyRiskPatches: [],
        pregnancyResolutionPatches: [
          { actorId, outcome: 'pregnancy_ended', summary: '医院已经完成妊娠终止手术。' }
        ]
      }
    });
    const terminationNarrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.7',
          narrativeText: '【旁白】手术按计划完成，医生确认妊娠已经终止，并安排术后观察。',
          turnSummary: '医院完成手术并明确确认阿玲的妊娠已经终止。',
          suggestedActions: ['陪她完成术后观察'],
          playerVitalsReview: { changed: false, reason: '玩家身体状态没有变化。' },
          pregnancyLifecycleReview: {
            changed: true,
            events: [
              { actorId, event: 'pregnancy_ended', reason: '医院完成妊娠终止手术。' }
            ],
            reason: '本回合发生明确妊娠终止。'
          },
          timePatch: { elapsedMinutes: 60, reason: '完成手术和术后观察。' },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const ended = await runPlayerTurn({
      state: confirmed,
      playerInput: '按她的决定陪同完成手术。',
      narrator: terminationNarrator,
      writebackRepair: terminationRepair
    });

    const endedWomb = ended.actors[actorId].femaleProfile?.adultPrivateProfile?.womb;
    expect(terminationRepair.calls, terminationRepair.prompts.join('\n---PROMPT---\n')).toBe(1);
    expect(endedWomb?.status).toBe('未受孕');
    expect(endedWomb?.pregnancy).toBeUndefined();
    expect(endedWomb?.pregnancyHistory?.at(-1)).toMatchObject({
      pregnancyId: 'preg_patient_existing',
      outcome: 'pregnancy_ended',
      summary: '医院已经完成妊娠终止手术。'
    });
  });

  it('recovers a dropped vehicle from raw intent while preserving valid main fields', async () => {
    const state = createInitialRuntimeState();
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.6',
          narrativeText: '【旁白】车行办妥过户，玩家付清车款后接过沃尔沃240的唯一车钥匙。',
          turnSummary: '玩家全款购入沃尔沃240旅行车并完成交接。',
          suggestedActions: ['检查过户文件'],
          playerVitalsReview: {
            changed: false,
            reason: '玩家只完成车辆购买和交接。'
          },
          timePatch: { elapsedMinutes: 45, reason: '办理车辆付款和过户。' },
          writeback: {
            assetPatch: {
              upsertItems: [
                {
                  itemId: 'asset_volvo_240',
                  category: 'vehicle',
                  name: '沃尔沃240旅行车',
                  summary: '玩家在车行全款购入的灰色旅行车。',
                  vehicleType: '私家车',
                  holdingRelation: '全款购入',
                  condition: '良好',
                  accessSummary: '玩家全款购入，持有原车过户文件和唯一车钥匙，可随时全权使用。',
                  relatedActorIds: ['player'],
                  relatedCaseIds: [],
                  relatedPlaceIds: ['place_wan_chai_home'],
                  importance: 70,
                  visibility: 'player_known'
                }
              ],
              removeItems: []
            }
          }
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };
    const repair = new CombinedWritebackRepairNarratorClient({
      assetLifecycle: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_volvo_240',
              category: 'vehicle',
              vehicleType: 'privateCar',
              locationSummary: '停放在湾仔住宅附近的月租车位。',
              accessSummary: null
            }
          ],
          removeItems: []
        }
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '全款买下这辆沃尔沃240并办妥过户。',
      narrator,
      writebackRepair: repair
    });
    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.calls).toBe(1);
    expect(repair.prompt).toContain('rawProposedAssetPatch');
    expect(repair.prompt).toContain('vehicleType');
    expect(repair.prompt).toContain('mobilityProfile');
    expect(Object.values(next.assets.items).filter(
      (item) => item.itemId === 'asset_volvo_240'
    )).toHaveLength(1);
    expect(next.assets.items.asset_volvo_240).toMatchObject({
      category: 'vehicle',
      vehicleType: 'privateCar',
      holdingRelation: 'owned',
      condition: 'good',
      locationSummary: '停放在湾仔住宅附近的月租车位。',
      accessSummary: '玩家全款购入，持有原车过户文件和唯一车钥匙，可随时全权使用。'
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'asset_repair_reconciled_from_raw' })
    );
  });

  it('keeps a valid main asset patch when an advisory review adds a malformed extra item', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          writebackVersion: '1.6',
          narrativeText: '【旁白】总务科完成登记，把点三八左轮手枪和枪套配发给你。',
          turnSummary: '玩家在总务科正式领取配发的点三八左轮手枪和枪套。',
          suggestedActions: ['去靶场熟悉配枪'],
          playerVitalsReview: {
            changed: false,
            reason: '玩家只完成装备领取。'
          },
          timePatch: { elapsedMinutes: 20, reason: '玩家完成配枪登记。' },
          writeback: {
            assetPatch: {
              upsertItems: [
                {
                  itemId: 'asset_service_revolver',
                  category: 'equipment',
                  name: '点三八左轮手枪',
                  summary: '警队正式配发给玩家的制式左轮手枪。',
                  relatedActorIds: ['player'],
                  relatedCaseIds: [],
                  relatedPlaceIds: [],
                  importance: 75,
                  visibility: 'player_known'
                }
              ],
              removeItems: [],
              equippedItemIds: ['asset_service_revolver']
            }
          }
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };
    const repair = new CombinedWritebackRepairNarratorClient({
      assetLifecycle: {
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_service_revolver',
              category: 'equipment',
              name: '点三八左轮手枪',
              summary: '警队正式配发给玩家的制式左轮手枪。',
              relatedActorIds: ['player'],
              relatedCaseIds: [],
              relatedPlaceIds: [],
              importance: 75,
              visibility: 'player_known'
            },
            {
              itemId: 'asset_spurious_register_entry',
              category: 'police_supply',
              name: '总务科登记项'
            }
          ],
          removeItems: [],
          equippedItemIds: ['asset_service_revolver']
        }
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '去总务科领取配枪。',
      narrator,
      writebackRepair: repair
    });
    const diagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(next.assets.items.asset_service_revolver).toBeDefined();
    expect(next.assets.equippedItemIds).toContain('asset_service_revolver');
    expect(next.assets.items.asset_spurious_register_entry).toBeUndefined();
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'writeback_repair_advisory_ignored' })
    );
    expect(
      diagnostics.some((issue) => issue.code === 'invalid_type' || issue.code === 'invalid_value')
    ).toBe(false);
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

  it('normalizes a stable existing asset id when repair returns removeItems as strings', async () => {
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
        upsertItems: [],
        removeItems: ['asset_kowloon_tape', 'asset_unknown_tape'],
        equippedItemIds: []
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '把大明九龙重案录音带提交到案件材料里。',
      narrator: new SubmittedEvidenceWithoutAssetRemovalNarratorClient(),
      writebackRepair: repair
    });
    const latestDiagnostics = next.storyLog.at(-1)?.writebackDiagnostics ?? [];

    expect(repair.prompt).toContain('禁止直接返回字符串 ID');
    expect(next.assets.items.asset_kowloon_tape).toBeUndefined();
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writebackRepair', 'assetPatch', 'removeItems', 0],
        code: 'asset_repair_remove_item_string_normalized'
      })
    );
    expect(latestDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writebackRepair', 'assetPatch', 'removeItems', 1],
        code: 'writeback_repair_unrelated_asset'
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

  it('lets asset identity review replace a newly proposed manuscript id with the existing stable id', async () => {
    const state = createInitialRuntimeState();
    state.assets.items.asset_kowloon_novel = {
      itemId: 'asset_kowloon_novel',
      category: 'document',
      name: '《九龙重案》前三章',
      summary: '玩家已经写好的小说前三章手稿。',
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
            summary: '同一份小说手稿已经从前三章推进到前四章。',
            relatedActorIds: ['player'],
            relatedCaseIds: [],
            relatedPlaceIds: [],
            importance: 50,
            visibility: 'player_known'
          }
        ],
        removeItems: [],
        equippedItemIds: []
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '继续写《九龙重案》，把第四章写完。',
      narrator: new ManuscriptProgressWithDuplicateAssetNarratorClient(),
      writebackRepair: repair
    });

    expect(next.assets.items.asset_kowloon_novel?.name).toBe('《九龙重案》前四章');
    expect(next.assets.items.asset_kowloon_novel_chapter_4).toBeUndefined();
    expect(Object.values(next.assets.items).filter((item) => item.name.includes('九龙重案'))).toHaveLength(1);
  });

  it('lets asset identity review discard a composite wallet-keychain proposal without deleting real items', async () => {
    const state = createInitialRuntimeState();
    state.assets.items.asset_wallet = {
      itemId: 'asset_wallet',
      category: 'general',
      name: '钱包',
      summary: '玩家日常使用的钱包。',
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      importance: 15,
      visibility: 'player_known'
    };
    state.assets.items.asset_keychain = {
      itemId: 'asset_keychain',
      category: 'general',
      name: '钥匙串',
      summary: '玩家住处和储物柜的钥匙串。',
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      importance: 20,
      visibility: 'player_known'
    };
    const repair = new AssetLifecycleRepairNarratorClient({
      assetPatch: {
        upsertItems: [],
        removeItems: [],
        equippedItemIds: []
      }
    });

    const next = await runPlayerTurn({
      state,
      playerInput: '把钱包和钥匙串一起收进口袋。',
      narrator: new CompositeWalletKeychainNarratorClient(),
      writebackRepair: repair
    });

    expect(next.assets.items.asset_wallet_keychain).toBeUndefined();
    expect(next.assets.items.asset_wallet).toBeDefined();
    expect(next.assets.items.asset_keychain).toBeDefined();
    expect(Object.values(next.assets.items).map((item) => item.name)).toEqual([
      '钱包',
      '钥匙串'
    ]);
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

  it('preserves the original case when intake returns an invalid case patch alongside valid auxiliary memory', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });

    const next = await runPlayerTurn({
      state,
      playerInput: '先把报案资料登记下来。',
      narrator: new MinorIncidentAsCaseNarratorClient(),
      writebackRepair: new CaseIntakeInvalidKeepRepairClient()
    });

    expect(next.cases.case_tung_choi_store_nuisance).toEqual(
      expect.objectContaining({
        caseId: 'case_tung_choi_store_nuisance',
        status: 'intake',
        playerRole: 'execute'
      })
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        path: ['writebackRepair', 'caseIntake', 'casePatches', 0, 'status'],
        code: 'invalid_value'
      })
    );
  });

  it('only removes the candidate with a complete explicit intake decision', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const narrator: NarratorClient = {
      async complete(): Promise<unknown> {
        return {
          narrativeText: '报案室同时送来一宗轻微噪音投诉和一宗已经录取口供的伤人案。',
          suggestedActions: ['处理噪音投诉', '接手伤人案材料'],
          writeback: {
            casePatches: [
              {
                caseId: 'case_noise_candidate',
                title: '上海街噪音投诉',
                status: 'intake',
                playerRole: 'execute',
                summary: '住户投诉楼下深夜噪音，尚无伤人或财损。'
              },
              {
                caseId: 'case_assault_candidate',
                title: '油麻地伤人案',
                status: 'investigating',
                playerRole: 'execute',
                summary: '案件已有正式口供和验伤记录，需要继续调查。'
              }
            ]
          }
        };
      }
    };
    const repair: NarratorClient = {
      async complete(): Promise<unknown> {
        return {
          caseDecisions: [
            {
              candidateCaseId: 'case_noise_candidate',
              decision: 'downgrade_to_matter',
              resultId: 'matter_noise_candidate',
              reason: '轻微噪音投诉尚未达到案件标准。'
            }
          ],
          currentMatterPatches: [
            {
              id: 'matter_noise_candidate',
              title: '上海街噪音投诉',
              summary: '普通巡逻投诉，先作现场调停。',
              status: 'active',
              priority: 25,
              visibility: 'known',
              source: 'writeback_repair_case_intake',
              matterKind: 'police_work',
              pressureLevel: 1,
              responseWindow: 'soon',
              relatedActorIds: ['player'],
              relatedCaseIds: [],
              relatedOrganizationIds: [],
              relatedPlaceIds: []
            }
          ]
        };
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '先登记两份材料。',
      narrator,
      writebackRepair: repair
    });

    expect(next.cases.case_noise_candidate).toBeUndefined();
    expect(next.dynamicEvents.currentMatters.matter_noise_candidate).toBeDefined();
    expect(next.cases.case_assault_candidate).toEqual(
      expect.objectContaining({ title: '油麻地伤人案' })
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'case_intake_original_preserved',
        path: [
          'writebackRepair',
          'caseIntake',
          'caseDecisions',
          'case_assault_candidate'
        ]
      })
    );
  });

  it('keeps relationship evidence repair active after actor ids are merged', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_blonde_leader = createActorDefaults({
      actorId: 'npc_blonde_leader',
      name: '金毛',
      gender: 'male',
      computedAge: 25,
      currentIdentity: 'gang_member',
      publicIdentity: '夜场古惑仔',
      actualIdentitySummary: '大角咀一带的社团边缘分子。',
      relationshipSummary: '与玩家此前发生过冲突。',
      visibility: 'player_known',
      importance: 75
    });
    state.memories.memory_blonde_previous_conflict = {
      memoryId: 'memory_blonde_previous_conflict',
      text: '玩家此前曾与金毛发生一次可核验的正面冲突。',
      kind: 'world',
      relatedActorIds: ['npc_blonde_leader'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      gameTime: { ...state.time },
      importance: 75,
      visibility: 'player_known',
      certainty: 'fact'
    };
    const repair = new ActorIdentityAndRelationshipRepairNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '逼问金毛真名，并追究之前的冲突。',
      narrator: new IdentityRevealWithRelationshipNarratorClient(),
      writebackRepair: repair
    });

    const relationshipPrompt = repair.prompts.find((prompt) => prompt.includes('COMBINED_WRITEBACK_REPAIR_TASK'));
    expect(relationshipPrompt).toContain('memory_blonde_previous_conflict');
    expect(relationshipPrompt).toContain('"relationshipEvidenceActorIds":["npc_tang_chi_wai","npc_blonde_leader"]');
    expect(next.actors.npc_tang_chi_wai).toBeUndefined();
    expect(next.relationshipThreads.rel_conflict_tang_chi_wai).toMatchObject({
      primaryActorId: 'npc_blonde_leader',
      relatedActorIds: ['npc_blonde_leader'],
      creationBasis: 'sustained_conflict'
    });
    expect(next.relationshipThreads.rel_conflict_tang_chi_wai.evidenceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'memory', refId: 'memory_blonde_previous_conflict' })
      ])
    );
  });

  it('promotes an existing network contact to fate without leaving a second relationship entry', async () => {
    const state = createInitialRuntimeState();
    state.actors.actor_liu = createActorDefaults({
      actorId: 'actor_liu',
      name: '刘星',
      gender: 'female',
      computedAge: 28,
      currentIdentity: 'civilian',
      profileSummary: '玩家长期认识的朋友。',
      visibility: 'player_known',
      importance: 70
    });
    state.relationshipThreads.rel_liu_contact = {
      threadId: 'rel_liu_contact',
      kind: 'network',
      title: '刘星的人脉',
      summary: '两人一直保持稳定联络。',
      relatedActorIds: ['actor_liu'],
      primaryActorId: 'actor_liu',
      relationshipRole: '朋友',
      status: 'active',
      milestones: [],
      visibility: 'player_known',
      importance: 70,
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          narrativeText: '刘星明确接受了你的告白，你们决定认真开始交往。',
          turnSummary: '刘星与玩家确认正式恋爱关系。',
          suggestedActions: ['和刘星商量之后的安排'],
          playerVitalsReview: { changed: false, reason: '本回合为关系确认，没有体力变化。' },
          timePatch: { elapsedMinutes: 15, reason: '坦诚交谈并确认关系。' },
          writeback: {
            relationshipThreadPatches: [
              {
                threadId: 'rel_liu_romance_new',
                kind: 'fate',
                title: '刘星的缘分',
                summary: '两人已明确建立正式恋爱关系。',
                relatedActorIds: ['actor_liu'],
                primaryActorId: 'actor_liu',
                relationshipRole: '恋人',
                status: 'active',
                intimacySummary: '已经坦诚确认彼此的亲密关系。',
                visibility: 'player_known'
              }
            ]
          }
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '向刘星认真告白，问她是否愿意正式和我交往。',
      narrator
    });

    expect(Object.keys(next.relationshipThreads)).toEqual(['rel_liu_contact']);
    expect(next.relationshipThreads.rel_liu_contact).toMatchObject({
      kind: 'fate',
      title: '刘星的缘分',
      relationshipRole: '恋人'
    });
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_thread_id_reused' }),
        expect.objectContaining({ code: 'relationship_thread_promoted_to_fate' })
      ])
    );
  });

  it('remaps a newly invented same-name patch to the uniquely named archive actor without identity overwrite', async () => {
    const state = createInitialRuntimeState();
    state.actors.actor_shen_jinghe = createActorDefaults({
      actorId: 'actor_shen_jinghe',
      name: '沈景和',
      englishName: 'Shum King-wo',
      aliases: ['沈老板'],
      gender: 'male',
      computedAge: 58,
      currentIdentity: 'civilian',
      publicIdentity: '九龙旧书店老板',
      positionSummary: '在九龙旧书店看铺。',
      profileSummary: '经营旧书店多年，熟悉附近街坊和旧报刊。',
      relationshipSummary: '曾替玩家留过一批旧报纸。',
      presence: 'absent',
      visibility: 'player_known',
      importance: 70
    });
    const narrator = new ExplicitNamedActorDuplicateNarratorClient();

    const next = await runPlayerTurn({
      state,
      playerInput: '去找沈景和，拿回他替我留着的旧报纸。',
      narrator
    });

    expect(narrator.prompt).toContain('玩家点名人物身份锚点');
    expect(narrator.prompt).toContain('actorId: actor_shen_jinghe');
    expect(next.actors.npc_new_shen_jinghe).toBeUndefined();
    expect(next.actors.actor_shen_jinghe).toMatchObject({
      name: '沈景和',
      currentIdentity: 'civilian',
      publicIdentity: '九龙旧书店老板',
      profileSummary: '经营旧书店多年，熟悉附近街坊和旧报刊。',
      statusSummary: '已经把旧报纸交给玩家。'
    });
    expect(
      Object.values(next.memories).some(
        (memory) =>
          memory.relatedActorIds.includes('actor_shen_jinghe') &&
          memory.text.includes('旧报纸')
      )
    ).toBe(true);
    expect(
      Object.values(next.memories).some((memory) =>
        memory.relatedActorIds.includes('npc_new_shen_jinghe')
      )
    ).toBe(false);
  });

  it('reuses a background-evolution actor id even when the player did not name that actor', async () => {
    const state = createInitialRuntimeState();
    state.actors.actor_shen_jinghe = createActorDefaults({
      actorId: 'actor_shen_jinghe',
      name: '沈景和',
      aliases: ['沈老板'],
      gender: 'male',
      computedAge: 58,
      currentIdentity: 'civilian',
      publicIdentity: '九龙旧书店老板',
      positionSummary: '在九龙旧书店看铺。',
      profileSummary: '经营旧书店多年。',
      presence: 'absent',
      visibility: 'player_known',
      importance: 70
    });
    state.backgroundEvolution.npcTracks.track_shen_inventory = {
      trackId: 'track_shen_inventory',
      actorId: 'actor_shen_jinghe',
      status: 'active',
      actionKind: 'work',
      objective: '整理旧报纸存货',
      currentAction: '核对一批旧报纸的日期',
      currentStatus: '仍在书店后仓整理',
      nextReviewAt: { year: 1988, month: 9, day: 13, hour: 9, minute: 0 },
      relatedActorIds: [],
      relatedOrganizationIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedRelationshipThreadIds: [],
      relatedCityTrackIds: [],
      relatedDeferredEventIds: [],
      visibility: 'player_known'
    };
    const narrator: NarratorClient = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          narrativeText: '你整理自己的材料时，书店那边托人传话，沈景和已经核完旧报纸。',
          turnSummary: '沈景和完成旧报纸日期核对，并托人传来消息。',
          suggestedActions: ['稍后去书店', '继续当前工作'],
          playerVitalsReview: { changed: false, reason: '玩家仅整理材料并收到传话。' },
          timePatch: { elapsedMinutes: 10, reason: '整理材料并听取传话。' },
          writeback: {
            actorPatches: [
              {
                actorId: 'npc_background_new_shen',
                name: '沈景和',
                gender: 'male',
                computedAge: 58,
                currentIdentity: 'civilian',
                publicIdentity: '九龙旧书店老板',
                statusSummary: '已经核完旧报纸日期。',
                presence: 'mentioned'
              }
            ],
            actorMemories: [
              {
                actorId: 'npc_background_new_shen',
                actorName: '沈景和',
                text: '已经核完替玩家留存的旧报纸日期。',
                visibility: 'player_known'
              }
            ]
          }
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '继续整理柜台上的材料。',
      narrator
    });

    expect(next.actors.npc_background_new_shen).toBeUndefined();
    expect(next.actors.actor_shen_jinghe).toMatchObject({
      name: '沈景和',
      publicIdentity: '九龙旧书店老板',
      statusSummary: '已经核完旧报纸日期。'
    });
    expect(
      Object.values(next.memories).some((memory) =>
        memory.relatedActorIds.includes('npc_background_new_shen')
      )
    ).toBe(false);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'prompt_anchored_actor_identity_reused' })
      ])
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
    const repair = new ActorIdentityMergeRepairNarratorClient('canonical');

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
        playerPortrayalMode: 'natural',
        autoSaveLimit: 20,
        autoSaveIntervalTurns: 1,
        rollbackSnapshotLimit: 20,
        pregnancyMode: 'high'
      }
    });

    expect(narrator.prompt).toContain('正文篇幅合同失败后的完整重生成');
    expect(narrator.prompt).toContain('常规回合 narrativeText 目标 1400-2200 个中文字符且不得少于 1400 个中文字符');
    expect(narrator.prompt).toContain('复杂回合目标 2200-3200 个中文字符');
    expect(narrator.prompt).toContain('围绕同一事务纵向展开');
    expect(narrator.prompt).toContain('本局选择第一人称');
    expect(narrator.prompt).toContain('本局选择“自然代演”');
    expect(narrator.prompt).toContain('必须把这些内容在 narrativeText 中真正演出来');
    expect(narrator.prompt).toContain('当前档位: 高概率');
  });

  it('fully regenerates one severely short turn and only persists the accepted response', async () => {
    const state = createInitialRuntimeState();
    const narrator = new LengthRetryNarratorClient();
    const stages: string[] = [];
    let streamedText = '';
    let resetCount = 0;

    const next = await runPlayerTurn({
      state,
      playerInput: '逐项核对值班记录。',
      narrator,
      gameSettings: {
        storyRenderLimit: 30,
        narrativeLengthLevel: 'compact',
        narrativePerspective: 'second_person',
        playerPortrayalMode: 'player_led',
        autoSaveLimit: 20,
        autoSaveIntervalTurns: 1,
        rollbackSnapshotLimit: 20,
        pregnancyMode: 'standard'
      },
      onNarrativeDelta: (delta) => {
        streamedText += delta;
      },
      onNarrativeReset: () => {
        resetCount += 1;
        streamedText = '';
      },
      onStageChange: (stage) => stages.push(stage)
    });

    const acceptedTurn = next.storyLog.at(-1);
    expect(narrator.calls).toBe(2);
    expect(narrator.prompts[1]).toContain('正文篇幅合同失败后的完整重生成');
    expect(resetCount).toBe(1);
    expect(stages).toContain('regenerating_narrative');
    expect(streamedText).toBe(narrator.acceptedNarrative);
    expect(acceptedTurn?.text).toBe(narrator.acceptedNarrative);
    expect(acceptedTurn?.rawNarratorResponse).toContain(narrator.acceptedNarrative);
    expect(acceptedTurn?.rawNarratorResponse).not.toContain('太短。');
    expect(acceptedTurn?.writebackDiagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'narrative_length_regenerated' })])
    );
    expect(acceptedTurn?.writebackDiagnostics?.some((issue) => issue.code === 'narrative_length_below_minimum')).toBe(
      false
    );
    expect(acceptedTurn?.turnMetrics?.apiUsage).toEqual(
      expect.arrayContaining([expect.objectContaining({ route: 'mainNarrator', callCount: 2 })])
    );
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

  it('keeps original pacing on the legacy one-pass path when custom content is not prioritized', async () => {
    const bound = createPrioritizedCustomCharacterState();
    const state = setCustomContentPriorityInState({
      state: bound.state,
      kind: 'character',
      assetId: bound.character.characterAssetId,
      prioritized: false,
      now: '2026-07-26T13:05:00.000Z'
    });
    const purposes: Array<string | undefined> = [];
    const prompts: string[] = [];
    const narrator: NarratorClient = {
      async complete(prompt, options): Promise<unknown> {
        purposes.push(options?.requestPurpose);
        prompts.push(
          typeof prompt === 'string'
            ? prompt
            : prompt.messages.map((message) => message.content).join('\n')
        );
        return {
          narrativeText: '你照旧核对值班记录，没有额外的人物突然闯进现场。',
          turnSummary: '玩家按原计划核对值班记录。',
          suggestedActions: ['继续核对'],
          writeback: {}
        };
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '我继续核对值班记录。',
      narrator
    });

    expect(purposes).toEqual(['main_turn']);
    expect(prompts[0]).not.toContain('轻量前台编排器');
    expect(prompts[0]).not.toContain('DRAMA_ORCHESTRATION');
    expect(next.dramaticContent?.recentExecutions?.at(-1)).toMatchObject({
      planningContextBuilt: false,
      plannerApiInvoked: false,
      planningCalled: false,
      inputCandidateCount: 0
    });
  });

  it('commits an applied official-DLC world fact and Arc stage advance in the same returned state', async () => {
    const next = await runPlayerTurn({
      state: createUrbanLegendsArcState(),
      playerInput: '核对司机、报案和总站交班时间。',
      narrator: createUrbanLegendsArcNarrator(true)
    });

    expect(
      next.dynamicEvents.currentMatters.matter_midnight_bus_first_clue
    ).toMatchObject({
      title: '午夜末班车记录矛盾',
      status: 'active'
    });
    expect(next.narrativeArcs).toHaveLength(1);
    expect(next.narrativeArcs?.[0]).toMatchObject({
      arcInstanceId: 'arc_official-dlc_official_dlc_urban_legends_midnight_bus',
      previousStageId: 'street_rumor',
      currentStageId: 'first_clues',
      writebackRefs: [
        { kind: 'current_matter', id: 'matter_midnight_bus_first_clue' }
      ]
    });
    expect(
      next.dramaticContent?.recentExecutions?.at(-1)?.narrativeArcProgressAudits
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: 'advance_accepted',
          accepted: true,
          requestedNextStageId: 'first_clues'
        })
      ])
    );
  });

  it('does not advance an official-DLC Arc when its supporting world fact is not applied', async () => {
    const next = await runPlayerTurn({
      state: createUrbanLegendsArcState(),
      playerInput: '先听听这个说法有没有可靠来源。',
      narrator: createUrbanLegendsArcNarrator(false)
    });

    expect(
      Object.values(next.memories).some(
        (memory) => memory.relatedActorIds.includes('npc_missing_bus_witness')
      )
    ).toBe(false);
    expect(next.narrativeArcs).toHaveLength(1);
    expect(next.narrativeArcs?.[0]).toMatchObject({
      arcInstanceId: 'arc_official-dlc_official_dlc_urban_legends_midnight_bus',
      currentStageId: 'street_rumor'
    });
    expect(next.narrativeArcs?.[0]?.previousStageId).toBeUndefined();
    expect(
      next.dramaticContent?.recentExecutions?.at(-1)?.narrativeArcProgressAudits
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: 'advance_rejected',
          accepted: false,
          requestedNextStageId: 'first_clues',
          rejectionReasons: expect.arrayContaining([
            'supporting_writeback_ref_not_applied'
          ])
        })
      ])
    );
  });

  it('uses a custom-intent-only plan for original pacing and executes a selected priority source', async () => {
    const { state } = createPrioritizedCustomCharacterState();
    const bindingId = state.customContent!.characterBindings[0].bindingId;
    const sourceRef = {
      providerId: 'custom-character',
      sourceType: 'custom_character_binding',
      sourceId: bindingId
    };
    const purposes: Array<string | undefined> = [];
    const prompts: string[] = [];
    const narrator: NarratorClient = {
      async complete(prompt, options): Promise<unknown> {
        const promptText =
          typeof prompt === 'string'
            ? prompt
            : prompt.messages.map((message) => message.content).join('\n');
        purposes.push(options?.requestPurpose);
        prompts.push(promptText);
        if (options?.requestPurpose === 'auxiliary') {
          return {
            planId: 'drama_plan_turn_0',
            planningScope: 'turn',
            mode: 'foreshadow',
            primarySource: sourceRef,
            supportSources: [],
            sceneFunction: 'foreshadow',
            intensity: 'low',
            playerMayIgnore: true,
            maxNewActors: 1,
            reasonSummary: '本局重点人物可以通过证物流程自然留下联系入口。'
          };
        }
        return {
          narrativeText: '值班簿旁多了一张法证科的联络便笺，但你可以稍后再理会。',
          turnSummary: '玩家核对记录时看见法证科联络便笺。',
          suggestedActions: ['查看便笺', '继续值班'],
          dramaExecutionTrace: {
            planId: 'drama_plan_turn_0',
            status: 'used_as_texture',
            usedSourceRefs: [sourceRef],
            resultingWritebackRefs: []
          },
          writeback: {}
        };
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '我继续核对值班记录。',
      narrator
    });

    expect(purposes).toEqual(['auxiliary', 'main_turn']);
    expect(prompts[0]).toContain('规划模式：custom_intent_only');
    expect(prompts[0]).toContain('"priorityClass":"user_requested"');
    expect(prompts[0]).toContain('"providerId":"custom-character"');
    expect(prompts[0]).not.toContain('"providerId":"storypack"');
    expect(prompts[0]).not.toContain('"providerId":"screen-character"');
    expect(prompts[1]).toContain('DRAMA_ORCHESTRATION');
    expect(prompts[1]).toContain('不可变人物 revision');
    expect(next.dramaticContent?.recentExecutions?.at(-1)).toMatchObject({
      planningContextBuilt: true,
      planningMode: 'custom_intent_only',
      plannerApiInvoked: true,
      planOrigin: 'main_two_pass',
      planningSucceeded: true,
      planMode: 'foreshadow',
      primarySourceRef: sourceRef,
      usedSourceRefs: [sourceRef],
      traceStatus: 'used_as_texture',
      foregroundArcCount: 1
    });
    expect(next.customContent?.characterEntryIntents[0]).toMatchObject({
      status: 'known_of',
      lastPlannedTurn: 1,
      lastConfirmedExposureTurn: 1
    });
    expect(next.customContent?.characterRuntimeBindings).toEqual([]);
    expect(next.customContent?.priorityItems[0].status).toBe('active');
  });

  it('confirms a reused custom Actor only after its validated memory writeback is applied', async () => {
    const { state } = createPrioritizedCustomCharacterState();
    const binding = state.customContent!.characterBindings[0];
    const adaptation = Object.values(
      state.customContent!.characterAdaptations
    )[0];
    const runtimeActorId = adaptation.runtimeActorId;
    state.actors[runtimeActorId] = createActorDefaults({
      actorId: runtimeActorId,
      name: '林静仪',
      gender: 'female',
      currentIdentity: 'civilian',
      publicIdentity: '法证科职员',
      currentPlaceId: state.location.currentPlaceId,
      presence: 'present',
      visibility: 'player_known',
      profileSummary: '熟悉证物流程的法证人员。',
      relationshipSummary: '尚未确认与玩家建立关系。',
      attitudeTowardPlayer: '按工作流程保持专业。',
      longTermMemorySummary: '长期负责警署送检证物。',
      recentInteractionMemory: '本回合前尚未与玩家实际互动。'
    });
    const sourceRef = {
      providerId: 'custom-character',
      sourceType: 'custom_character_binding',
      sourceId: binding.bindingId
    };
    const narrator: NarratorClient = {
      async complete(_prompt, options): Promise<unknown> {
        if (options?.requestPurpose === 'auxiliary') {
          return {
            planId: 'drama_plan_turn_0',
            planningScope: 'turn',
            mode: 'surface',
            primarySource: sourceRef,
            supportSources: [],
            sceneFunction: 'relationship',
            intensity: 'low',
            playerMayIgnore: true,
            maxNewActors: 0,
            reasonSummary: '法证联系人已经在场，可以通过工作流程实际接触。'
          };
        }
        return {
          narrativeText: '林静仪接过证物袋，与你逐项核对封条编号。',
          turnSummary: '玩家与林静仪完成了一次实际的证物交接。',
          suggestedActions: ['继续核对编号'],
          dramaExecutionTrace: {
            planId: 'drama_plan_turn_0',
            status: 'used_persistently',
            usedSourceRefs: [sourceRef],
            resultingWritebackRefs: [
              { kind: 'actor_memory', id: runtimeActorId }
            ]
          },
          writeback: {
            actorMemories: [
              {
                actorId: runtimeActorId,
                actorName: '林静仪',
                text: '与玩家逐项核对证物袋封条，完成第一次实际工作接触。',
                importance: 65,
                visibility: 'player_known'
              }
            ]
          }
        };
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '我把证物袋交给林静仪，当面核对编号。',
      narrator
    });

    expect(next.customContent?.characterEntryIntents[0]).toMatchObject({
      status: 'met',
      lastPlannedTurn: 1,
      lastConfirmedExposureTurn: 1
    });
    expect(next.customContent?.characterRuntimeBindings).toEqual([
      {
        characterAssetId: binding.assetId,
        sourceRevision: binding.revision,
        adaptationId: adaptation.adaptationId,
        actorId: runtimeActorId
      }
    ]);
    expect(next.customContent?.priorityItems[0].status).toBe('completed');
    expect(next.dramaticContent?.recentExecutions?.at(-1)).toMatchObject({
      usedSourceRefs: [sourceRef],
      traceStatus: 'used_persistently',
      persistentWriteCount: 1
    });
  });

  it('retains custom intent and downgrades the receipt when a claimed writeback is rejected during application', async () => {
    const { state } = createPrioritizedCustomCharacterState();
    const binding = state.customContent!.characterBindings[0];
    const adaptation = Object.values(
      state.customContent!.characterAdaptations
    )[0];
    const sourceRef = {
      providerId: 'custom-character',
      sourceType: 'custom_character_binding',
      sourceId: binding.bindingId
    };
    const narrator: NarratorClient = {
      async complete(_prompt, options): Promise<unknown> {
        if (options?.requestPurpose === 'auxiliary') {
          return {
            planId: 'drama_plan_turn_0',
            planningScope: 'turn',
            mode: 'surface',
            primarySource: sourceRef,
            supportSources: [],
            sceneFunction: 'relationship',
            intensity: 'low',
            playerMayIgnore: true,
            maxNewActors: 0,
            reasonSummary: '尝试通过工作流程建立实际接触。'
          };
        }
        return {
          narrativeText: '值班台收到一则尚未核实的法证科口信。',
          turnSummary: '玩家听到一则尚未形成实际联系的口信。',
          suggestedActions: ['稍后核实口信'],
          dramaExecutionTrace: {
            planId: 'drama_plan_turn_0',
            status: 'used_persistently',
            usedSourceRefs: [sourceRef],
            resultingWritebackRefs: [
              { kind: 'actor_memory', id: adaptation.runtimeActorId }
            ]
          },
          writeback: {
            actorMemories: [
              {
                actorId: adaptation.runtimeActorId,
                actorName: '林静仪',
                text: '这条记忆不能落地，因为稳定 Actor 尚未创建。',
                importance: 55,
                visibility: 'player_known'
              }
            ]
          }
        };
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '我留意一下法证科有没有回音。',
      narrator
    });

    expect(next.customContent?.characterEntryIntents[0]).toMatchObject({
      status: 'known_of',
      lastPlannedTurn: 1,
      lastConfirmedExposureTurn: 1
    });
    expect(next.customContent?.characterRuntimeBindings).toEqual([]);
    expect(next.customContent?.priorityItems[0].status).toBe('active');
    expect(next.dramaticContent?.recentExecutions?.at(-1)).toMatchObject({
      traceStatus: 'used_as_texture',
      persistentWriteCount: 0
    });
    expect(
      next.dramaticContent?.recentExecutions?.at(-1)?.degradeReason
    ).toContain('execution_trace_writeback_not_applied');
    expect(
      next.dramaticContent?.instances.some((instance) =>
        instance.sourceRefs.some(
          (ref) =>
            ref.providerId === sourceRef.providerId &&
            ref.sourceType === sourceRef.sourceType &&
            ref.sourceId === sourceRef.sourceId
        )
      )
    ).toBe(false);
  });

  it('keeps the full original prompt and retains custom intent when narrow planning fails', async () => {
    const { state } = createPrioritizedCustomCharacterState();
    const purposes: Array<string | undefined> = [];
    const prompts: string[] = [];
    const narrator: NarratorClient = {
      async complete(prompt, options): Promise<unknown> {
        const promptText =
          typeof prompt === 'string'
            ? prompt
            : prompt.messages.map((message) => message.content).join('\n');
        purposes.push(options?.requestPurpose);
        prompts.push(promptText);
        if (options?.requestPurpose === 'auxiliary') {
          throw new Error('429 planner busy');
        }
        return {
          narrativeText: '你继续核对值班记录，今晚暂时没有新的接触。',
          turnSummary: '玩家继续值班，本局重点人物尚未进入现场。',
          suggestedActions: ['继续值班'],
          writeback: {}
        };
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '我继续核对值班记录。',
      narrator
    });

    expect(purposes).toEqual(['auxiliary', 'main_turn']);
    expect(prompts[0]).toContain('规划模式：custom_intent_only');
    expect(prompts[1]).not.toContain('DRAMA_ORCHESTRATION');
    expect(prompts[1]).toContain('## Storypack 投影');
    expect(next.customContent?.characterEntryIntents[0]).toMatchObject({
      mode: 'asap_contact',
      status: 'queued'
    });
    expect(next.customContent?.priorityItems[0]?.status).toBe('active');
    expect(next.dramaticContent?.recentExecutions?.at(-1)).toMatchObject({
      planningContextBuilt: true,
      planningMode: 'custom_intent_only',
      plannerApiInvoked: true,
      planOrigin: 'local_fallback',
      planningSucceeded: false,
      planMode: 'quiet',
      inputCandidateCount: 1
    });
    expect(
      next.dramaticContent?.recentExecutions?.at(-1)?.foregroundArcCount
    ).toBeUndefined();
    expect(
      next.dramaticContent?.recentExecutions?.at(-1)?.traceStatus
    ).toBeUndefined();
  });

  it('uses the main model as an explicit two-pass planner before composing a non-original turn', async () => {
    const state = createInitialRuntimeState();
    state.dramaticContent = {
      ...(state.dramaticContent ?? { instances: [], recentDiagnostics: [] }),
      recentDiagnostics: [],
      recentExecutions: [],
      settings: {
        pacing: 'balanced',
        materialLevel: 'standard',
        planningRoute: 'follow-main',
        channels: {
          work_livelihood: 'medium',
          relationships: 'medium',
          cases_law: 'medium',
          organizations: 'medium',
          city_news: 'medium',
          era_storypack: 'medium',
          screen_characters: 'medium',
          custom_characters: 'off',
          custom_events: 'off'
        }
      }
    };
    const prompts: string[] = [];
    const purposes: Array<string | undefined> = [];
    const narrator: NarratorClient = {
      async complete(prompt, options): Promise<unknown> {
        const promptText =
          typeof prompt === 'string'
            ? prompt
            : prompt.messages.map((message) => message.content).join('\n');
        prompts.push(promptText);
        purposes.push(options?.requestPurpose);
        if (options?.requestPurpose === 'auxiliary') {
          return {
            planId: 'drama_plan_turn_0',
            planningScope: 'turn',
            mode: 'quiet',
            primarySource: null,
            supportSources: [],
            sceneFunction: 'rest',
            intensity: 'none',
            playerMayIgnore: true,
            maxNewActors: 0,
            reasonSummary: '当前行动应独占焦点，不额外推动候选内容。'
          };
        }
        const response = {
          narrativeText: '街外的消息仍在变化，但眼下你先把注意力留在手边的值班记录上。',
          turnSummary: '玩家继续核对手边的值班记录，没有额外推动城市动向。',
          suggestedActions: ['继续核对记录', '暂时放下记录'],
          dramaExecutionTrace: {
            planId: 'drama_plan_turn_0',
            status: 'not_used',
            usedSourceRefs: [],
            resultingWritebackRefs: []
          },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    };

    const next = await runPlayerTurn({
      state,
      playerInput: '我继续核对值班记录。',
      narrator
    });

    expect(purposes).toEqual(['auxiliary', 'main_turn']);
    expect(next.dramaticContent?.recentDiagnostics).toEqual([]);
    expect(prompts.filter((prompt) => prompt.includes('轻量前台编排器'))).toHaveLength(1);
    expect(prompts.filter((prompt) => prompt.includes('DRAMA_ORCHESTRATION'))).toHaveLength(1);
    expect(prompts.at(-1)).toContain('前台契约');
    expect(prompts.at(-1)).toContain('不要重复返回 dramaPlan');
    expect(next.dramaticContent?.recentExecutions?.at(-1)).toMatchObject({
      planningContextBuilt: true,
      plannerApiInvoked: true,
      planOrigin: 'main_two_pass',
      planningCalled: true,
      planningSucceeded: true,
      primarySourceRef: undefined,
      traceStatus: 'not_used',
      foregroundArcCount: 0
    });
  });

  it('uses a deterministic foreground plan instead of accepting a same-turn plan when the auxiliary planner fails', async () => {
    const state = createInitialRuntimeState();
    state.dramaticContent = {
      ...(state.dramaticContent ?? { instances: [], recentDiagnostics: [] }),
      settings: {
        pacing: 'balanced',
        materialLevel: 'standard',
        planningRoute: 'use-auxiliary',
        channels: {
          work_livelihood: 'medium',
          relationships: 'medium',
          cases_law: 'medium',
          organizations: 'medium',
          city_news: 'medium',
          era_storypack: 'medium',
          screen_characters: 'medium',
          custom_characters: 'off',
          custom_events: 'off'
        }
      }
    };
    state.dynamicEvents.currentMatters.matter_drama_fallback = {
      id: 'matter_drama_fallback',
      title: '待核实的值班记录',
      summary: '值班簿上有一处时间记录需要玩家在交更前核实。',
      status: 'active',
      priority: 60,
      visibility: 'known',
      source: 'police_work',
      matterKind: 'police_work',
      pressureLevel: 1,
      responseWindow: 'soon',
      currentHook: '玩家可以现在查问，也可以暂时不理会。',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };

    const auxiliaryPlanner = {
      calls: 0,
      prompts: [] as string[],
      async complete(prompt: string): Promise<unknown> {
        this.calls += 1;
        this.prompts.push(prompt);
        throw new Error('429 auxiliary planner busy');
      }
    };
    const narrator = {
      async complete(_prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
        const response = {
          narrativeText: '交更前，值班簿上那处时间记录仍然摊在桌角，没有人催你立即处理。',
          suggestedActions: ['现在核对值班记录', '先去处理自己的事情'],
          dramaExecutionTrace: {
            planId: 'drama_plan_turn_0',
            status: 'not_used',
            usedSourceRefs: [],
            resultingWritebackRefs: []
          },
          writeback: {}
        };
        options?.onTextDelta?.(response.narrativeText);
        options?.onRawText?.(JSON.stringify(response));
        return response;
      }
    } satisfies NarratorClient;

    const next = await runPlayerTurn({
      state,
      playerInput: '我先看看桌上的值班簿。',
      narrator,
      auxiliaryGeneration: auxiliaryPlanner,
      auxiliaryGenerationMode: 'custom'
    });

    const receipt = next.dramaticContent?.recentExecutions?.at(-1);
    expect(
      auxiliaryPlanner.prompts.filter((prompt) => prompt.includes('轻量前台编排器'))
    ).toHaveLength(1);
    expect(next.storyLog.at(-1)?.text).toContain('值班簿');
    expect(receipt).toMatchObject({
      planningCalled: true,
      planningSucceeded: false,
      planningRoute: 'use-auxiliary',
      planOrigin: 'local_fallback',
      planMode: 'continue_existing',
      primarySourceRef: expect.any(Object),
      usedSourceRefs: [],
      traceStatus: 'not_used',
      persistentWriteCount: 0
    });
    expect(receipt?.degradeReason).toContain('planning_failed');
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

function createLocalJudgementNarratorResponse({
  presetRoll,
  effectiveTarget,
  outcome,
  factors = [],
  narrativeOutcome = outcome
}: {
  presetRoll: number;
  effectiveTarget: number;
  outcome: 'critical_success' | 'success' | 'partial_success' | 'failure' | 'critical_failure';
  factors?: Array<{
    sourceType?: 'trait' | 'equipment' | 'status' | 'environment' | 'preparation' | 'other';
    sourceId?: string;
    label: string;
    value: number;
    reason: string;
  }>;
  narrativeOutcome?: 'critical_success' | 'success' | 'partial_success' | 'failure' | 'critical_failure';
}) {
  return {
    writebackVersion: '1.6',
    narrativeText: `【旁白】你核对两份记录，本地判定结果为 ${narrativeOutcome}，现场按这个结果继续。`,
    turnSummary: `玩家核对两份记录，本地判定结果为 ${narrativeOutcome}。`,
    suggestedActions: ['继续核对记录', '询问值班警员'],
    playerVitalsReview: {
      changed: false,
      reason: '本回合只核对室内记录，身体状态没有变化。'
    },
    timePatch: {
      elapsedMinutes: 5,
      reason: '核对记录。'
    },
    writeback: {
      judgementCheckPatches: [
        {
          rulesetVersion: 'v1.1-local-d100',
          checkId: 'check_local_contract',
          turnId: 'turn_1',
          gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 30 },
          title: '核对记录',
          category: 'thinking',
          relatedActorIds: ['player'],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          primaryAttribute: 'thinking',
          secondaryAttribute: 'perception',
          difficultyTier: 'standard',
          presetRoll,
          effectiveTarget,
          outcome,
          shortSummary: '玩家按本地结果核对记录。',
          factors,
          visibility: 'player_known'
        }
      ]
    }
  };
}

function withLocalJudgementCombat(
  response: ReturnType<typeof createLocalJudgementNarratorResponse>
) {
  return {
    ...response,
    writeback: {
      ...response.writeback,
      combatEventPatches: [
        {
          combatId: 'combat_local_contract',
          turnId: 'turn_1',
          gameTime: {
            year: 1988,
            month: 9,
            day: 12,
            hour: 21,
            minute: 30
          },
          title: '室内制服',
          type: 'arrest',
          locationSummary: '旺角警署室内',
          participants: [
            {
              actorId: 'player',
              name: '玩家',
              side: 'player',
              roleSummary: '执行制服行动'
            }
          ],
          outcome: 'player_advantage',
          intensity: 55,
          combatText: '玩家借桌角避开挥击，贴近后控制对方手腕并完成制服。',
          resultSummary: '玩家取得现场优势。',
          consequenceSummary: '对方被控制，现场恢复秩序。',
          judgementCheckIds: ['check_local_contract'],
          relatedActorIds: ['player'],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          visibility: 'player_known',
          unread: true,
          createdAt: {
            year: 1988,
            month: 9,
            day: 12,
            hour: 21,
            minute: 30
          }
        }
      ]
    }
  };
}

function createMalformedLocalJudgementRetryError(
  attemptId: string,
  rawText = '{"narrativeText":"半截'
) {
  return new NarratorAttemptError('LLM 返回内容不是有效 JSON。', {
    attemptId,
    purpose: 'main_turn_judgement_narrative_repair',
    stream: true,
    requestedMaxTokens: 8192,
    finishReason: 'unknown',
    rawText,
    parseStatus: 'malformed_json',
    errorMessage: 'LLM 返回内容不是有效 JSON。',
    startedAt: '2026-07-27T09:00:00.000Z',
    finishedAt: '2026-07-27T09:00:01.000Z'
  });
}

class SequentialLocalJudgementNarrator implements NarratorClient {
  readonly prompts: NarratorInput[] = [];
  readonly purposes: Array<NarratorStreamOptions['requestPurpose']> = [];

  constructor(private readonly responses: unknown[]) {}

  async complete(prompt: NarratorInput, options?: NarratorStreamOptions): Promise<unknown> {
    this.prompts.push(prompt);
    this.purposes.push(options?.requestPurpose);
    const response =
      this.responses[Math.min(this.prompts.length - 1, this.responses.length - 1)];
    if (response instanceof NarratorAttemptError) {
      options?.onRawText?.(response.attempt.rawText);
      throw response;
    }
    if (response instanceof Error) throw response;
    const typed = response as { narrativeText?: string };
    if (typed.narrativeText) options?.onTextDelta?.(typed.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

function narratorInputText(input: NarratorInput): string {
  return typeof input === 'string'
    ? input
    : input.messages.map((message) => message.content).join('\n');
}

function createJudgementNarrativeRepairResponse({
  outcome,
  includeCombat = false
}: {
  outcome: 'critical_success' | 'success' | 'partial_success' | 'failure' | 'critical_failure';
  includeCombat?: boolean;
}) {
  return {
    narrativeText: `【旁白】正文只校正为本地判定结果 ${outcome}，其余事实保持不变。`,
    turnSummary: `玩家核对记录，本地判定结果为 ${outcome}。`,
    judgementSummaries: [
      {
        checkId: 'check_local_contract',
        shortSummary: `本地判定结果为 ${outcome}。`,
        consequenceSummary: '现场依照本地结果继续。'
      }
    ],
    combatSummaries: includeCombat
      ? [
          {
            combatId: 'combat_local_contract',
            combatText: `玩家依照 ${outcome} 的本地结果完成这次对抗。`,
            resultSummary: `本地对抗结果为 ${outcome}。`,
            consequenceSummary: '对抗记录与规范判定保持一致。'
          }
        ]
      : []
  };
}

function createJudgementStructureRepairResponse({
  category = 'thinking',
  primaryAttribute = 'thinking',
  difficultyTier = 'standard',
  relatedCombatEventId
}: {
  category?:
    | 'observation'
    | 'chase'
    | 'melee'
    | 'armed'
    | 'firearm'
    | 'crowd'
    | 'negotiation'
    | 'endurance'
    | 'will'
    | 'thinking'
    | 'other';
  primaryAttribute?: 'body' | 'action' | 'perception' | 'thinking' | 'negotiation' | 'will';
  difficultyTier?: 'easy' | 'standard' | 'hard' | 'dangerous' | 'extreme';
  relatedCombatEventId?: string;
}) {
  return {
    hasJudgement: true,
    intent: {
      title: '核对记录',
      category,
      primaryAttribute,
      difficultyTier,
      shortSummary: '玩家进行了一次需要本地结算的判定。',
      ...(relatedCombatEventId ? { relatedCombatEventId } : {})
    }
  };
}

describe('turn engine local judgement contract', () => {
  it('keeps d100=2 as a critical success while dropping an unverified non-empty factor locally', async () => {
    const state = createInitialRuntimeState({
      gameDifficulty: 'standard',
      attributes: {
        body: 50,
        action: 50,
        perception: 50,
        thinking: 80,
        negotiation: 50,
        will: 50
      }
    });
    const narrator = new SequentialLocalJudgementNarrator([
      createLocalJudgementNarratorResponse({
        presetRoll: 2,
        effectiveTarget: 90,
        outcome: 'critical_success',
        factors: [
          {
            label: '未经证实的现场优势',
            value: 10,
            reason: '模型没有提供 sourceType 或可核验 sourceId。'
          }
        ]
      })
    ]);
    const stages: string[] = [];
    const resets: number[] = [];
    const deltas: string[] = [];

    const next = await runPlayerTurn({
      state,
      playerInput: '趁对方失衡完成控制。',
      narrator,
      judgementRoll: 2,
      onStageChange: (stage) => stages.push(stage),
      onNarrativeReset: () => resets.push(1),
      onNarrativeDelta: (delta) => deltas.push(delta)
    });

    expect(narrator.purposes).toEqual(['main_turn']);
    expect(resets).toEqual([]);
    expect(deltas).toHaveLength(1);
    expect(stages).toContain('normalizing_judgement');
    expect(stages).not.toContain('regenerating_judgement');
    expect(next.judgementChecks.check_local_contract).toMatchObject({
      presetRoll: 2,
      score: 2,
      effectiveTarget: 80,
      difficulty: 80,
      outcome: 'critical_success',
      factors: []
    });
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'local_judgement_factor_rejected' }),
        expect.objectContaining({ code: 'local_judgement_echo_overridden' })
      ])
    );
  });

  it('infers a missing factor source type from one active trait without another request', async () => {
    const state = createInitialRuntimeState({
      gameDifficulty: 'standard',
      traits: [
        {
          traitId: 'trait_street_sense',
          name: '街头直觉',
          source: 'opening',
          description: '熟悉街面危险信号。',
          effectSummary: '更容易识别埋伏。',
          scopes: ['observation'],
          status: 'active',
          visibility: 'player_known'
        }
      ]
    });
    const narrator = new SequentialLocalJudgementNarrator([
      createLocalJudgementNarratorResponse({
        presetRoll: 50,
        effectiveTarget: 53,
        outcome: 'success',
        factors: [
          {
            sourceId: 'trait_street_sense',
            label: '街头直觉',
            value: 3,
            reason: '及时识别危险动作。'
          }
        ]
      })
    ]);

    const next = await runPlayerTurn({
      state,
      playerInput: '观察对方的起手动作。',
      narrator,
      judgementRoll: 50
    });

    expect(narrator.purposes).toEqual(['main_turn']);
    expect(next.judgementChecks.check_local_contract.factors).toEqual([
      expect.objectContaining({
        sourceType: 'trait',
        sourceId: 'trait_street_sense',
        value: 3
      })
    ]);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'local_judgement_factor_source_inferred' })
      ])
    );
  });

  it('removes fictional, unequipped and duplicated factors without losing the turn', async () => {
    const state = createInitialRuntimeState({
      gameDifficulty: 'standard',
      traits: [
        {
          traitId: 'trait_street_sense',
          name: '街头直觉',
          source: 'opening',
          description: '熟悉街面危险信号。',
          effectSummary: '更容易识别埋伏。',
          scopes: ['observation'],
          status: 'active',
          visibility: 'player_known'
        }
      ]
    });
    state.assets.items.asset_radio = {
      itemId: 'asset_radio',
      category: 'equipment',
      name: '未装备对讲机',
      summary: '当前放在储物柜。',
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      visibility: 'player_known',
      importance: 20
    };
    const narrator = new SequentialLocalJudgementNarrator([
      createLocalJudgementNarratorResponse({
        presetRoll: 50,
        effectiveTarget: 58,
        outcome: 'success',
        factors: [
          {
            sourceType: 'trait',
            sourceId: 'trait_street_sense',
            label: '街头直觉',
            value: 2,
            reason: '首次有效引用。'
          },
          {
            sourceType: 'trait',
            sourceId: 'trait_street_sense',
            label: '重复直觉',
            value: 2,
            reason: '重复引用。'
          },
          {
            sourceType: 'trait',
            sourceId: 'trait_fictional',
            label: '虚构特质',
            value: 2,
            reason: '并不存在。'
          },
          {
            sourceType: 'equipment',
            sourceId: 'asset_radio',
            label: '未装备对讲机',
            value: 2,
            reason: '当前未装备。'
          }
        ]
      })
    ]);

    const next = await runPlayerTurn({
      state,
      playerInput: '观察并判断对方。',
      narrator,
      judgementRoll: 50
    });

    expect(narrator.purposes).toEqual(['main_turn']);
    expect(next.judgementChecks.check_local_contract).toMatchObject({
      contextModifierTotal: 2,
      effectiveTarget: 52,
      factors: [expect.objectContaining({ sourceId: 'trait_street_sense' })]
    });
    expect(
      next.storyLog
        .at(-1)
        ?.writebackDiagnostics?.filter((diagnostic) =>
          ['local_judgement_factor_rejected', 'local_judgement_factor_deduplicated'].includes(
            diagnostic.code ?? ''
          )
        )
    ).toHaveLength(3);
  });

  it('overrides wrong numeric echoes locally when the submitted outcome already matches', async () => {
    const state = createInitialRuntimeState({ gameDifficulty: 'standard' });
    const narrator = new SequentialLocalJudgementNarrator([
      createLocalJudgementNarratorResponse({
        presetRoll: 41,
        effectiveTarget: 51,
        outcome: 'success'
      })
    ]);

    const next = await runPlayerTurn({
      state,
      playerInput: '核对两份值班记录。',
      narrator,
      judgementRoll: 42
    });

    expect(narrator.prompts).toHaveLength(1);
    expect(narratorInputText(narrator.prompts[0])).toContain('本回合唯一预置骰：d100=42');
    expect(narratorInputText(narrator.prompts[0])).toContain(
      'checkId、turnId、gameTime 对象、title、category'
    );
    expect(next.judgementChecks.check_local_contract).toMatchObject({
      rulesetVersion: 'v1.1-local-d100',
      presetRoll: 42,
      effectiveTarget: 50,
      score: 42,
      difficulty: 50,
      margin: 8,
      outcome: 'success'
    });
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics?.some(
        (diagnostic) => diagnostic.code === 'local_judgement_echo_overridden'
      )
    ).toBe(true);
    expect(
      next.storyLog.at(-1)?.writebackDiagnostics?.some(
        (diagnostic) => diagnostic.code === 'local_judgement_narrative_repaired'
      )
    ).toBe(false);
  });

  it('repairs only visible judgement narration and preserves the first validated writeback', async () => {
    const state = createInitialRuntimeState({ gameDifficulty: 'standard' });
    const firstResponse = {
      ...createLocalJudgementNarratorResponse({
        presetRoll: 42,
        effectiveTarget: 50,
        outcome: 'failure'
      }),
      writeback: {
        ...createLocalJudgementNarratorResponse({
          presetRoll: 42,
          effectiveTarget: 50,
          outcome: 'failure'
        }).writeback,
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_preserved_notebook',
              category: 'document',
              name: '核对记录簿',
              summary: '首份有效候选写入的记录簿。'
            }
          ]
        },
        memories: [
          {
            text: '玩家已经完成两份值班记录的核对。',
            importance: 55
          }
        ]
      }
    };
    const narrator = new SequentialLocalJudgementNarrator([
      firstResponse,
      createJudgementNarrativeRepairResponse({
        outcome: 'success'
      })
    ]);
    const stages: string[] = [];
    const resets: number[] = [];
    const deltas: string[] = [];

    const next = await runPlayerTurn({
      state,
      playerInput: '核对两份值班记录。',
      narrator,
      judgementRoll: 42,
      onStageChange: (stage) => stages.push(stage),
      onNarrativeReset: () => resets.push(1),
      onNarrativeDelta: (delta) => deltas.push(delta)
    });

    expect(narrator.prompts).toHaveLength(2);
    expect(narrator.purposes).toEqual([
      'main_turn',
      'main_turn_judgement_narrative_repair'
    ]);
    expect(narratorInputText(narrator.prompts[1])).toContain('JUDGEMENT_NARRATIVE_REPAIR');
    expect(narratorInputText(narrator.prompts[1])).not.toContain('asset_preserved_notebook');
    expect(stages).toContain('regenerating_judgement');
    expect(stages).not.toContain('repairing_judgement_response');
    expect(resets).toEqual([]);
    expect(deltas).toHaveLength(1);
    expect(next.judgementChecks.check_local_contract).toMatchObject({
      presetRoll: 42,
      effectiveTarget: 50,
      outcome: 'success'
    });
    expect(next.assets.items.asset_preserved_notebook).toMatchObject({
      name: '核对记录簿'
    });
    expect(next.time.minute).toBe(state.time.minute + 5);
    expect(next.storyLog.at(-1)).toMatchObject({
      text: '【旁白】正文只校正为本地判定结果 success，其余事实保持不变。',
      suggestedActions: ['继续核对记录', '询问值班警员']
    });
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'local_judgement_outcome_overridden' }),
        expect.objectContaining({ code: 'local_judgement_narrative_repaired' })
      ])
    );
  });

  it('keeps the turn atomic after one malformed minimal repair without generating another full response', async () => {
    const state = createInitialRuntimeState({ gameDifficulty: 'standard' });
    const originalState = structuredClone(state);
    const narrator = new SequentialLocalJudgementNarrator([
      createLocalJudgementNarratorResponse({
        presetRoll: 42,
        effectiveTarget: 50,
        outcome: 'failure'
      }),
      createMalformedLocalJudgementRetryError('attempt_judgement_narrative_repair')
    ]);
    const resets: number[] = [];
    const deltas: string[] = [];

    await expect(
      runPlayerTurn({
        state,
        playerInput: '核对两份值班记录。',
        narrator,
        judgementRoll: 42,
        onNarrativeReset: () => resets.push(1),
        onNarrativeDelta: (delta) => deltas.push(delta)
      })
    ).rejects.toThrow('本地判定叙事校正返回格式无效');

    expect(narrator.purposes).toEqual([
      'main_turn',
      'main_turn_judgement_narrative_repair'
    ]);
    expect(resets).toEqual([]);
    expect(deltas).toHaveLength(1);
    expect(state).toEqual(originalState);
  });

  it('keeps combat writeback and binds it to the canonical check after minimal repair', async () => {
    const state = createInitialRuntimeState({ gameDifficulty: 'standard' });
    const firstResponse = withLocalJudgementCombat(
      createLocalJudgementNarratorResponse({
        presetRoll: 42,
        effectiveTarget: 50,
        outcome: 'failure'
      })
    );
    firstResponse.writeback.combatEventPatches[0].judgementCheckIds = [
      'check_nonexistent'
    ];
    const narrator = new SequentialLocalJudgementNarrator([
      firstResponse,
      createJudgementNarrativeRepairResponse({
        outcome: 'success',
        includeCombat: true
      })
    ]);

    const next = await runPlayerTurn({
      state,
      playerInput: '避开挥击并把人制服。',
      narrator,
      judgementRoll: 42
    });

    expect(narrator.purposes).toEqual([
      'main_turn',
      'main_turn_judgement_narrative_repair'
    ]);
    expect(next.combatEvents.combat_local_contract).toMatchObject({
      combatText: '玩家依照 success 的本地结果完成这次对抗。',
      judgementCheckIds: ['check_local_contract']
    });
    expect(next.judgementChecks.check_local_contract.relatedCombatEventId).toBe(
      'combat_local_contract'
    );
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'local_judgement_combat_reference_normalized'
        })
      ])
    );
  });

  it.each([
    ['80'],
    [null],
    [120]
  ])('recovers effectiveTarget=%j and a Chinese category alias without another request', async (rawTarget) => {
    const state = createInitialRuntimeState({ gameDifficulty: 'standard' });
    const response = createLocalJudgementNarratorResponse({
      presetRoll: 42,
      effectiveTarget: 50,
      outcome: 'success'
    });
    const rawPatch = response.writeback.judgementCheckPatches[0] as Record<string, unknown>;
    rawPatch.category = '推理';
    rawPatch.effectiveTarget = rawTarget;
    const narrator = new SequentialLocalJudgementNarrator([response]);

    const next = await runPlayerTurn({
      state,
      playerInput: '核对两份值班记录。 ',
      narrator,
      judgementRoll: 42
    });

    expect(narrator.purposes).toEqual(['main_turn']);
    expect(next.judgementChecks.check_local_contract).toMatchObject({
      category: 'thinking',
      presetRoll: 42,
      effectiveTarget: 50,
      score: 42,
      outcome: 'success'
    });
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'local_judgement_category_normalized' }),
        expect.objectContaining({
          code:
            typeof rawTarget === 'number'
              ? 'local_judgement_echo_overridden'
              : 'local_judgement_echo_ignored'
        })
      ])
    );
  });

  it('emits a request-scoped judgement recovery trace with raw fields and stage outcomes', async () => {
    const state = createInitialRuntimeState({ gameDifficulty: 'standard' });
    const response = createLocalJudgementNarratorResponse({
      presetRoll: 42,
      effectiveTarget: 50,
      outcome: 'success'
    });
    (response.writeback.judgementCheckPatches[0] as Record<string, unknown>).effectiveTarget =
      'invalid-target';
    const narrator = new SequentialLocalJudgementNarrator([response]);
    let latestTrace: JudgementRecoveryTrace | undefined;

    await runPlayerTurn({
      state,
      playerInput: '核对两份值班记录。',
      narrator,
      judgementRoll: 42,
      onJudgementRecoveryTrace: (trace) => {
        latestTrace = trace;
      }
    });

    expect(latestTrace).toMatchObject({
      turnId: 'turn_0001',
      presetRoll: 42,
      persisted: true,
      rawJudgementPatches: [
        expect.objectContaining({ effectiveTarget: 'invalid-target' })
      ]
    });
    expect(latestTrace?.stages.map((stage) => `${stage.stage}:${stage.status}`)).toEqual(
      expect.arrayContaining([
        'raw_parse:succeeded',
        'local_normalization:succeeded',
        'structure_repair:skipped',
        'local_settlement:succeeded',
        'narrative_correction:skipped',
        'final_validation:succeeded'
      ])
    );
  });

  it('uses one judgement-only structure repair and preserves unrelated first-response writeback', async () => {
    const state = createInitialRuntimeState({ gameDifficulty: 'standard' });
    state.actors.npc_structure_repair_preserved = createActorDefaults({
      actorId: 'npc_structure_repair_preserved',
      name: '陈值班',
      currentIdentity: 'police',
      publicIdentity: '值班警员',
      statusSummary: '尚未核对记录。'
    });
    const baseResponse = createLocalJudgementNarratorResponse({
      presetRoll: 42,
      effectiveTarget: 50,
      outcome: 'success'
    });
    const firstResponse = {
      ...baseResponse,
      writeback: {
        ...baseResponse.writeback,
        actorPatches: [
          {
            actorId: 'npc_structure_repair_preserved',
            statusSummary: '已协助玩家核对记录。'
          }
        ],
        assetPatch: {
          upsertItems: [
            {
              itemId: 'asset_structure_repair_preserved',
              category: 'document',
              name: '待核记录',
              summary: '首份响应中的资产写回必须保留。'
            }
          ]
        }
      }
    };
    const rawPatch = firstResponse.writeback.judgementCheckPatches[0] as Record<string, unknown>;
    rawPatch.category = 'unknown_tactical_mode';
    delete rawPatch.primaryAttribute;
    delete rawPatch.difficultyTier;
    const narrator = new SequentialLocalJudgementNarrator([
      firstResponse,
      createJudgementStructureRepairResponse({})
    ]);

    const next = await runPlayerTurn({
      state,
      playerInput: '核对两份值班记录。',
      narrator,
      judgementRoll: 42
    });

    expect(narrator.purposes).toEqual([
      'main_turn',
      'main_turn_judgement_structure_repair'
    ]);
    expect(narratorInputText(narrator.prompts[1])).toContain('JUDGEMENT_STRUCTURE_REPAIR');
    expect(narratorInputText(narrator.prompts[1])).not.toContain(
      'asset_structure_repair_preserved'
    );
    expect(next.judgementChecks.check_local_contract).toMatchObject({
      category: 'thinking',
      primaryAttribute: 'thinking',
      difficultyTier: 'standard',
      presetRoll: 42,
      outcome: 'success'
    });
    expect(next.assets.items.asset_structure_repair_preserved).toMatchObject({
      name: '待核记录'
    });
    expect(next.actors.npc_structure_repair_preserved.statusSummary).toBe(
      '已协助玩家核对记录。'
    );
    expect(next.time.minute).toBe(state.time.minute + 5);
  });

  it('keeps the same preset roll after judgement structure repair', async () => {
    const state = createInitialRuntimeState({ gameDifficulty: 'standard' });
    const firstResponse = createLocalJudgementNarratorResponse({
      presetRoll: 73,
      effectiveTarget: 50,
      outcome: 'failure'
    });
    (firstResponse.writeback.judgementCheckPatches[0] as Record<string, unknown>).category =
      'unmapped_category';
    const narrator = new SequentialLocalJudgementNarrator([
      firstResponse,
      createJudgementStructureRepairResponse({})
    ]);

    const next = await runPlayerTurn({
      state,
      playerInput: '在压力下核对记录。',
      narrator,
      judgementRoll: 73
    });

    expect(next.judgementChecks.check_local_contract).toMatchObject({
      presetRoll: 73,
      score: 73,
      effectiveTarget: 50,
      outcome: 'failure'
    });
    expect(narratorInputText(narrator.prompts[1])).toContain('不得返回 presetRoll');
    expect(createJudgementStructureRepairResponse({})).not.toHaveProperty(
      'intent.presetRoll'
    );
  });

  it('fails atomically with precise paths when the judgement-only repair is still invalid', async () => {
    const state = createInitialRuntimeState({ gameDifficulty: 'standard' });
    const originalState = structuredClone(state);
    const firstResponse = createLocalJudgementNarratorResponse({
      presetRoll: 73,
      effectiveTarget: 50,
      outcome: 'failure'
    });
    (firstResponse.writeback.judgementCheckPatches[0] as Record<string, unknown>).category =
      'unmapped_category';
    const narrator = new SequentialLocalJudgementNarrator([
      firstResponse,
      {
        hasJudgement: true,
        intent: {
          title: '缺少其他必要字段'
        }
      }
    ]);

    await expect(
      runPlayerTurn({
        state,
        playerInput: '在压力下核对记录。',
        narrator,
        judgementRoll: 73
      })
    ).rejects.toThrow(/判定结构修复失败：.*intent\.category|判定结构修复失败：.*intent\.primaryAttribute/);

    expect(narrator.purposes).toEqual([
      'main_turn',
      'main_turn_judgement_structure_repair'
    ]);
    expect(state).toEqual(originalState);
  });

  it('restores a malformed combat judgement and keeps both references aligned', async () => {
    const state = createInitialRuntimeState({ gameDifficulty: 'standard' });
    const firstResponse = withLocalJudgementCombat(
      createLocalJudgementNarratorResponse({
        presetRoll: 42,
        effectiveTarget: 50,
        outcome: 'success'
      })
    );
    (firstResponse.writeback.judgementCheckPatches[0] as Record<string, unknown>).category =
      'combat';
    firstResponse.writeback.combatEventPatches[0].type = 'armed';
    firstResponse.writeback.combatEventPatches[0].judgementCheckIds = ['bad_check_id'];
    const narrator = new SequentialLocalJudgementNarrator([firstResponse]);

    const next = await runPlayerTurn({
      state,
      playerInput: '避开短刀并控制对手。',
      narrator,
      judgementRoll: 42
    });

    expect(narrator.purposes).toEqual(['main_turn']);
    expect(next.judgementChecks.check_local_contract).toMatchObject({
      category: 'armed',
      relatedCombatEventId: 'combat_local_contract'
    });
    expect(next.combatEvents.combat_local_contract.judgementCheckIds).toEqual([
      'check_local_contract'
    ]);
  });
});
