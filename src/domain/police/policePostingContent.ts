import type { RuntimeState } from '../runtime/types';
import type { PoliceCareerEventType } from './policeCareerProgress';
import {
  HK_1988_POLICE_POSTING_ROUTES,
  normalizePolicePromotionRank,
  POLICE_PROMOTION_DLC_ID,
  type PolicePostingDepartmentCode,
  type PolicePostingResultKind
} from './policePromotionRules';
import type { PoliceRankCode } from './policeRankCatalog';

export interface PolicePostingEvidenceContract {
  tag: string;
  label: string;
  acceptedEventTypes: readonly PoliceCareerEventType[];
  summary: string;
}

export interface PolicePostingRouteContent {
  routeId: string;
  targetLabel: string;
  resultKind: PolicePostingResultKind;
  opportunitySummary: string;
  naturalEntryChannels: readonly string[];
  responsibilitySummary: string;
  dutyPatternSummary: string;
  evidenceContracts: readonly PolicePostingEvidenceContract[];
  relevanceKeywords: readonly string[];
}

export interface PolicePostingRouteIndexEntry {
  routeId: string;
  targetDepartment: PolicePostingDepartmentCode;
  targetLabel: string;
  resultKind: PolicePostingResultKind;
}

export interface PolicePostingOpportunityProjection extends PolicePostingRouteIndexEntry {
  mode: 'available_to_explore' | 'active_program';
  currentStage?: string;
  vacancyStatus?: string;
  opportunitySummary: string;
  naturalEntryChannels: string[];
  responsibilitySummary: string;
  dutyPatternSummary: string;
  evidenceContracts: Array<{
    tag: string;
    label: string;
    acceptedEventTypes: PoliceCareerEventType[];
    summary: string;
  }>;
}

export interface PolicePostingOpportunityContext {
  routeIndex: PolicePostingRouteIndexEntry[];
  opportunities: PolicePostingOpportunityProjection[];
}

export interface PolicePostingTagAudit {
  acceptedTags: string[];
  rejectedTags: Array<{
    tag: string;
    reason: 'not_required_by_route' | 'event_type_mismatch';
  }>;
}

const OBJECTIVE_RECORD_EVENTS = [
  'case_activity_recorded',
  'judgement_recorded',
  'matter_progressed'
] as const satisfies readonly PoliceCareerEventType[];

export const HK_1988_POLICE_POSTING_CONTENT = [
  {
    routeId: 'hk1988_uniform_to_cid',
    targetLabel: '刑事侦缉队（CID）',
    resultKind: 'lateral_transfer',
    opportunitySummary:
      '从军装岗位转入刑事侦缉工作；应由实际案件表现、直属上级正式推荐、侦缉训练和目标岗位空缺逐步成立。',
    naturalEntryChannels: [
      '玩家在真实案件或线索核查中表现稳定后，由既有直属上级提出是否愿意接受侦缉训练。',
      '玩家主动向现有上级或训练人员了解 CID 资格、课程和空缺。',
      '单位因真实案件协作观察玩家，但协作本身不是调令。'
    ],
    responsibilitySummary: '案件调查、证人联络、线索核查、行动支援与案卷工作。',
    dutyPatternSummary: '正式报到后采用案件岗位日勤基线；具体行动、加班和召回仍由结构化事实覆盖。',
    evidenceContracts: [
      {
        tag: 'reliable_service',
        label: '可靠服务记录',
        acceptedEventTypes: [...OBJECTIVE_RECORD_EVENTS, 'commendation_recorded'],
        summary: '必须来自本回合已应用的案件、判定、事项进展或正式嘉奖，不能由口头好感代替。'
      },
      {
        tag: 'formal_recommendation',
        label: '直属上级正式推荐',
        acceptedEventTypes: ['formal_recommendation'],
        summary: '推荐人必须是当前 Runtime 中实际直属上级。'
      },
      {
        tag: 'detective_training',
        label: '侦缉训练',
        acceptedEventTypes: ['training_completed', 'course_completed'],
        summary: '只有训练或课程已经完成时才成立；报名、候选或听课计划不算完成。'
      }
    ],
    relevanceKeywords: ['cid', '侦缉', '刑侦', '调查', '查案', '线索', '证人', '案卷']
  },
  {
    routeId: 'hk1988_uniform_or_cid_to_traffic',
    targetLabel: '交通部',
    resultKind: 'lateral_transfer',
    opportunitySummary:
      '从军装或 CID 转入交通岗位；道路或事故处置记录、交通专业训练与岗位空缺分别成立。',
    naturalEntryChannels: [
      '玩家实际处理道路事故、交通疏导或车辆相关案件后，既有上级提及交通岗位需要。',
      '玩家主动了解交通课程、事故调查或道路执法岗位。',
      '交通单位在联合处置中观察玩家，但不会凭一次协作直接调入。'
    ],
    responsibilitySummary: '道路巡逻、交通执法、事故处置、交通调查与现场协调。',
    dutyPatternSummary: '正式报到后采用一线行动轮班基线，不与升警衔绑定。',
    evidenceContracts: [
      {
        tag: 'traffic_training',
        label: '交通专业训练',
        acceptedEventTypes: ['training_completed', 'course_completed'],
        summary: '只有相应训练或课程完成后成立。'
      },
      {
        tag: 'road_or_accident_record',
        label: '道路或事故处置记录',
        acceptedEventTypes: [...OBJECTIVE_RECORD_EVENTS],
        summary: '必须引用本回合已应用的道路、车辆或事故相关案件、判定或事项进展。'
      }
    ],
    relevanceKeywords: ['交通', '道路', '事故', '车辆', '车祸', '疏导', 'traffic']
  },
  {
    routeId: 'hk1988_uniform_to_eu',
    targetLabel: '冲锋队（EU）',
    resultKind: 'lateral_transfer',
    opportunitySummary:
      '从军装转入总区冲锋队；应变表现、驾驶适任、纪律条件、直属上级推荐和岗位空缺缺一不可。',
    naturalEntryChannels: [
      '玩家在真实紧急响应或跨单位行动中表现合格后，由既有带队人员或直属上级提出资格评估。',
      '玩家主动了解冲锋车车组、驾驶适任与训练要求。',
      'EU 联合行动只形成观察机会，不自动产生推荐或空缺。'
    ],
    responsibilitySummary: '冲锋车值勤、紧急响应、重大现场先期处置与总区行动支援。',
    dutyPatternSummary: '正式报到后继续采用一线行动轮班基线。',
    evidenceContracts: [
      {
        tag: 'emergency_response',
        label: '紧急响应记录',
        acceptedEventTypes: [...OBJECTIVE_RECORD_EVENTS],
        summary: '必须引用本回合已应用的紧急现场案件、判定或事项进展。'
      },
      {
        tag: 'qualified_driver',
        label: '驾驶适任确认',
        acceptedEventTypes: ['qualification_confirmed'],
        summary: '只有正式适任或资格确认已经发生时成立。'
      },
      {
        tag: 'discipline_clear',
        label: '纪律条件确认',
        acceptedEventTypes: ['qualification_confirmed'],
        summary: '只表示本次岗位资格核验通过，不删除或改写既有纪律事实。'
      },
      {
        tag: 'formal_recommendation',
        label: '直属上级正式推荐',
        acceptedEventTypes: ['formal_recommendation'],
        summary: '推荐人必须是当前 Runtime 中实际直属上级。'
      }
    ],
    relevanceKeywords: ['冲锋', 'eu', '紧急', '应变', '冲锋车', '驾驶', '增援']
  },
  {
    routeId: 'hk1988_uniform_to_ptu_rotation',
    targetLabel: '警察机动部队（PTU）轮调',
    resultKind: 'training_rotation',
    opportunitySummary:
      '从军装进入 PTU 训练和阶段性驻队；这是轮调而非晋升，也不因完成课程自动变成永久岗位。',
    naturalEntryChannels: [
      '既有上级根据实际服务与纪律条件询问玩家是否参加 PTU 训练遴选。',
      '玩家主动了解 PTU 训练名额、课程和轮调安排。',
      '公共秩序支援经历可以成为背景，但不能替代训练名额和正式轮调安排。'
    ],
    responsibilitySummary: '队列与体能训练、公共秩序行动、区域增援及阶段性驻队任务。',
    dutyPatternSummary: '正式驻队后采用一线行动轮班基线；轮调完成后的归队另由后续正式安排承接。',
    evidenceContracts: [
      {
        tag: 'physical_discipline_clear',
        label: '体能与纪律适任',
        acceptedEventTypes: ['qualification_confirmed'],
        summary: '只有正式资格核验通过时成立。'
      },
      {
        tag: 'ptu_training_slot',
        label: 'PTU 训练名额',
        acceptedEventTypes: ['training_slot_allocated'],
        summary: '名额必须已经分配；表达兴趣或等待名单不算。'
      },
      {
        tag: 'ptu_course_completed',
        label: 'PTU 课程完成',
        acceptedEventTypes: ['training_completed', 'course_completed'],
        summary: '训练或课程必须已经完成。'
      },
      {
        tag: 'rotation_arranged',
        label: '轮调安排成立',
        acceptedEventTypes: ['rotation_arranged'],
        summary: '必须已经形成正式驻队或轮调安排。'
      }
    ],
    relevanceKeywords: ['ptu', '机动部队', '防暴', '公共秩序', '体能', '操练', '轮调']
  },
  {
    routeId: 'hk1988_ptu_rotation_return_to_uniform',
    targetLabel: 'PTU 轮调完成后归队',
    resultKind: 'training_rotation',
    opportunitySummary:
      'PTU 阶段性驻队完成后，按正式归队安排返回原属军装单位；归队不改变警衔，也不能只凭口头表示或日期推移生效。',
    naturalEntryChannels: [
      '既有 PTU 带队人员确认轮调内容和阶段性驻队已经完成。',
      '原属单位或现有指挥链发出正式归队、报到与岗位安排。',
      '玩家主动向现有上级核对轮调结束日期和归队程序。'
    ],
    responsibilitySummary: '恢复原属军装单位的巡逻、报案处理、现场支援及获正式安排的岗位职责。',
    dutyPatternSummary: '正式归队后恢复军装一线轮班基线；归队生效前继续遵守当前 PTU 值班。',
    evidenceContracts: [
      {
        tag: 'ptu_rotation_completed',
        label: 'PTU 轮调完成',
        acceptedEventTypes: ['training_completed', 'course_completed'],
        summary: '必须由正式训练或轮调完成事实成立；时间经过本身不能代替完成记录。'
      },
      {
        tag: 'return_arranged',
        label: '正式归队安排',
        acceptedEventTypes: ['rotation_arranged'],
        summary: '必须已经形成明确的归队、报到和岗位安排，不能把口头设想写成调令。'
      }
    ],
    relevanceKeywords: ['ptu', '机动部队', '轮调结束', '轮训结束', '归队', '归隊', '返回原单位']
  },
  {
    routeId: 'hk1988_cid_to_specialist',
    targetLabel: 'CID 专业调查岗位',
    resultKind: 'lateral_transfer',
    opportunitySummary:
      '由一般 CID 调查转入重案、商业罪案或反黑等专业岗位；需要既有 CID 经历、相关案件记录、正式遴选与岗位空缺。',
    naturalEntryChannels: [
      '玩家在真实专业案件中形成可核验记录后，由现有 CID 上级提出遴选。',
      '玩家主动了解专业组别的经验、课程或遴选要求。',
      '临时协助专业组不等于正式转组。'
    ],
    responsibilitySummary: '按获批专业方向承担复杂案件调查、跨组协作与专业案卷工作。',
    dutyPatternSummary: '正式转组后仍采用案件岗位日勤基线，行动或加班由实际事实覆盖。',
    evidenceContracts: [
      {
        tag: 'cid_experience',
        label: 'CID 实务经历',
        acceptedEventTypes: ['case_activity_recorded', 'matter_progressed'],
        summary: '必须引用本回合已应用的 CID 案件活动或事项进展。'
      },
      {
        tag: 'specialist_case_record',
        label: '专业案件记录',
        acceptedEventTypes: [...OBJECTIVE_RECORD_EVENTS],
        summary: '必须引用本回合已应用且与专业方向有关的案件、判定或事项进展。'
      },
      {
        tag: 'specialist_selection',
        label: '专业岗位遴选',
        acceptedEventTypes: ['selection_passed'],
        summary: '只有正式遴选通过时成立。'
      }
    ],
    relevanceKeywords: [
      '重案',
      '商业罪案',
      '反黑',
      '专业组',
      '专门组',
      '专业调查',
      '专门调查',
      '专案',
      '遴选',
      'specialist'
    ]
  },
  {
    routeId: 'hk1988_to_report_room',
    targetLabel: '警署值日／报案室岗位',
    resultKind: 'lateral_transfer',
    opportunitySummary:
      '合资格监督职级转入警署值日或报案室协调岗位；需要实际协调记录、单位需要与岗位空缺。',
    naturalEntryChannels: [
      '玩家在报案室、交接、文书或现场协调中形成正式记录后，由现有警署链条提出岗位需要。',
      '玩家主动了解值日、报案室或行政协调岗位。',
      '一次临时顶班不等于正式转岗。'
    ],
    responsibilitySummary: '报案受理、值日协调、人员与事项交接、文书监督及警署日常运作。',
    dutyPatternSummary: '正式报到后采用警署轮班基线。',
    evidenceContracts: [
      {
        tag: 'report_room_coordination',
        label: '警署协调记录',
        acceptedEventTypes: ['matter_progressed', 'supervision_recorded', 'leadership_recorded'],
        summary: '必须来自实际事项进展、监督或带队记录。'
      },
      {
        tag: 'unit_need',
        label: '单位岗位需要',
        acceptedEventTypes: ['unit_need_confirmed'],
        summary: '只有单位正式确认需要该岗位时成立，模型不得凭气氛制造空缺。'
      }
    ],
    relevanceKeywords: ['报案室', '值日', '警署', '文书', '协调', '交接', 'report room']
  }
] as const satisfies readonly PolicePostingRouteContent[];

const KNOWN_POSTING_TAGS: ReadonlySet<string> = new Set<string>(
  HK_1988_POLICE_POSTING_CONTENT.flatMap((route) =>
    route.evidenceContracts.map((contract) => contract.tag)
  )
);

function containsAny(text: string, keywords: readonly string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function gameTimeMinutes(time: RuntimeState['time']): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute) / 60_000;
}

function isPostingReviewLocked(state: RuntimeState): boolean {
  const reviewNotBefore = state.policePanel.careerPath.postingProgress?.reviewNotBefore;
  return Boolean(reviewNotBefore && gameTimeMinutes(state.time) < gameTimeMinutes(reviewNotBefore));
}

function resolveCurrentDepartment(value: string | undefined): PolicePostingDepartmentCode | undefined {
  const source = value?.trim().toLowerCase();
  if (!source) return undefined;
  if (/report room|station duty|报案室|報案室|值日/.test(source)) return 'report_room';
  if (/criminal investigation|侦缉|偵緝|\bcid\b/.test(source)) return 'cid';
  if (/traffic|交通/.test(source)) return 'traffic';
  if (/emergency unit|冲锋|衝鋒|\beu\b/.test(source)) return 'eu';
  if (/police tactical unit|机动部队|機動部隊|\bptu\b/.test(source)) return 'ptu';
  if (/uniform|军装|軍裝|巡逻|巡邏/.test(source)) return 'uniform';
  return undefined;
}

export function getPolicePostingRouteContent(
  routeId: string
): PolicePostingRouteContent | undefined {
  return HK_1988_POLICE_POSTING_CONTENT.find((route) => route.routeId === routeId);
}

export function auditPolicePostingEventTags(input: {
  routeId: string;
  eventType: PoliceCareerEventType;
  tags: readonly string[] | undefined;
}): PolicePostingTagAudit {
  const route = getPolicePostingRouteContent(input.routeId);
  const acceptedTags: string[] = [];
  const rejectedTags: PolicePostingTagAudit['rejectedTags'] = [];
  for (const tag of [...new Set((input.tags ?? []).map((value) => value.trim()).filter(Boolean))]) {
    if (!KNOWN_POSTING_TAGS.has(tag)) {
      acceptedTags.push(tag);
      continue;
    }
    const contract = route?.evidenceContracts.find((candidate) => candidate.tag === tag);
    if (!contract) {
      rejectedTags.push({ tag, reason: 'not_required_by_route' });
      continue;
    }
    if (!(contract.acceptedEventTypes as readonly PoliceCareerEventType[]).includes(input.eventType)) {
      rejectedTags.push({ tag, reason: 'event_type_mismatch' });
      continue;
    }
    acceptedTags.push(tag);
  }
  return { acceptedTags, rejectedTags };
}

function toOpportunity(
  routeId: string,
  mode: PolicePostingOpportunityProjection['mode'],
  currentStage?: string,
  vacancyStatus?: string
): PolicePostingOpportunityProjection | undefined {
  const rule = HK_1988_POLICE_POSTING_ROUTES.find((candidate) => candidate.routeId === routeId);
  const content = getPolicePostingRouteContent(routeId);
  if (!rule || !content) return undefined;
  return {
    routeId,
    targetDepartment: rule.targetDepartment,
    targetLabel: content.targetLabel,
    resultKind: rule.resultKind,
    mode,
    ...(currentStage ? { currentStage } : {}),
    ...(vacancyStatus ? { vacancyStatus } : {}),
    opportunitySummary: content.opportunitySummary,
    naturalEntryChannels: [...content.naturalEntryChannels],
    responsibilitySummary: content.responsibilitySummary,
    dutyPatternSummary: content.dutyPatternSummary,
    evidenceContracts: content.evidenceContracts.map((contract) => ({
      tag: contract.tag,
      label: contract.label,
      acceptedEventTypes: [...contract.acceptedEventTypes],
      summary: contract.summary
    }))
  };
}

export function projectPolicePostingOpportunities(
  state: RuntimeState,
  playerInput = ''
): PolicePostingOpportunityContext {
  const binding = state.world.officialDlcBindings?.find(
    (candidate) => candidate.dlcId === POLICE_PROMOTION_DLC_ID
  );
  if (
    binding?.status !== 'active' ||
    state.world.worldpackId !== 'hk_1988' ||
    state.player.currentIdentity !== 'police' ||
    state.lawIdentity.status !== 'active'
  ) {
    return { routeIndex: [], opportunities: [] };
  }

  const department = resolveCurrentDepartment(state.lawIdentity.department);
  const formalRank = normalizePolicePromotionRank(state.lawIdentity.rank).formalRankCode;
  if (!department) return { routeIndex: [], opportunities: [] };

  const currentProgram = state.policePanel.careerPath.postingProgress;
  if (currentProgram?.processStage === 'effective' && isPostingReviewLocked(state)) {
    return { routeIndex: [], opportunities: [] };
  }
  const matchingRules = HK_1988_POLICE_POSTING_ROUTES.filter(
    (route) =>
      (route.acceptedCurrentDepartments as readonly PolicePostingDepartmentCode[]).includes(department) &&
      (route.acceptedFormalRankCodes as readonly PoliceRankCode[]).includes(formalRank) &&
      !(currentProgram?.processStage === 'effective' && currentProgram.routeId === route.routeId)
  );
  const routeIndex = matchingRules.flatMap((route) => {
    const content = getPolicePostingRouteContent(route.routeId);
    return content
      ? [
          {
            routeId: route.routeId,
            targetDepartment: route.targetDepartment,
            targetLabel: content.targetLabel,
            resultKind: route.resultKind
          }
        ]
      : [];
  });

  if (currentProgram && currentProgram.processStage !== 'effective') {
    const active = toOpportunity(
      currentProgram.routeId,
      'active_program',
      currentProgram.processStage,
      currentProgram.vacancyStatus
    );
    return {
      routeIndex: active
        ? [
            {
              routeId: active.routeId,
              targetDepartment: active.targetDepartment,
              targetLabel: active.targetLabel,
              resultKind: active.resultKind
            }
          ]
        : [],
      opportunities: active ? [active] : []
    };
  }

  const generalCareerInterest = containsAny(playerInput, [
    '调动',
    '調動',
    '转岗',
    '轉崗',
    '部门',
    '部門',
    '岗位',
    '崗位'
  ]);
  const specificallyRelevant = matchingRules.filter((route) => {
    const content = getPolicePostingRouteContent(route.routeId);
    return Boolean(content && containsAny(playerInput, content.relevanceKeywords));
  });
  const relevant = specificallyRelevant.length > 0
    ? specificallyRelevant
    : generalCareerInterest
      ? matchingRules
      : [];

  return {
    routeIndex,
    opportunities: relevant
      .slice(0, generalCareerInterest ? 4 : 2)
      .flatMap((route) => {
        const opportunity = toOpportunity(route.routeId, 'available_to_explore');
        return opportunity ? [opportunity] : [];
      })
  };
}
