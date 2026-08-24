import { resolvePoliceRankCode, type PoliceRankCode } from './policeRankCatalog';

export const POLICE_PROMOTION_DLC_ID = 'police_promotion' as const;
export const HK_1988_WORLDPACK_ID = 'hk_1988' as const;

export type PolicePromotionDesignation = 'senior_police_constable';

export type PolicePromotionRequirementId =
  | 'service_eligibility'
  | 'promotion_exam'
  | 'promotion_course'
  | 'performance_evidence'
  | 'supervision_evidence'
  | 'discipline_clearance'
  | 'supervisor_recommendation'
  | 'selection_result'
  | 'vacancy_or_post'
  | 'appointment_effective';

export type PolicePromotionRequirementStatus =
  | 'completed'
  | 'in_progress'
  | 'pending'
  | 'blocked';

export type PolicePromotionProcessStage =
  | 'not_eligible'
  | 'eligible'
  | 'exam_or_course'
  | 'awaiting_recommendation'
  | 'selection'
  | 'awaiting_vacancy'
  | 'approved_waiting_post'
  | 'appointed';

export type PoliceVacancyStatus =
  | 'unknown'
  | 'unavailable'
  | 'expected'
  | 'available'
  | 'allocated';

export type PoliceServiceBasis =
  | 'established_service'
  | 'new_recruit'
  | 'appointed_in_save';

export type PolicePromotionEvidenceKind =
  | 'case_activity'
  | 'judgement'
  | 'matter_progress'
  | 'commendation'
  | 'discipline'
  | 'training'
  | 'course'
  | 'exam'
  | 'supervision'
  | 'leadership'
  | 'supervisor_assessment'
  | 'selection'
  | 'appointment'
  | 'posting'
  | 'story_entry'
  | 'turn_summary'
  | 'actor_memory';

export type PolicePromotionEvidenceResult = 'successful' | 'failed' | 'neutral';

export interface PolicePromotionEvidence {
  kind: PolicePromotionEvidenceKind;
  refId: string;
  canonicalRefId?: string;
  /**
   * Identifies one world fact across Matter, StoryEntry, ActorMemory and other
   * projections. It must come from a stable local canonicalization step.
   */
  canonicalFactId?: string;
  turnId?: string;
  applied: boolean;
  result?: PolicePromotionEvidenceResult;
  tags?: readonly string[];
}

export interface NormalizedPolicePromotionRank {
  inputRankCode: PoliceRankCode;
  formalRankCode: PoliceRankCode;
  designation?: PolicePromotionDesignation;
}

export interface PolicePromotionRouteRule {
  routeId: string;
  worldpackId: typeof HK_1988_WORLDPACK_ID;
  acceptedCurrentRankCodes: readonly PoliceRankCode[];
  canonicalCurrentRankCode: PoliceRankCode;
  targetRankCode: PoliceRankCode;
  requiredRequirementIds: readonly PolicePromotionRequirementId[];
  processStages: readonly PolicePromotionProcessStage[];
  minimumInRankDays: number;
  minimumDistinctEvidenceTurns: number;
  minimumEvidenceKinds: number;
  nextRouteId?: string;
}

export interface PolicePromotionRequirementProgress {
  requirementId: PolicePromotionRequirementId;
  status: PolicePromotionRequirementStatus;
  evidenceRefs: string[];
  summary: string;
  blockingReason?: string;
}

export interface PolicePromotionEvaluationInput {
  enabled: boolean;
  worldpackId: string;
  currentRank: string | undefined;
  serviceBasis: PoliceServiceBasis;
  daysInCurrentRank: number;
  processStage?: PolicePromotionProcessStage;
  vacancyStatus?: PoliceVacancyStatus;
  evidence: readonly PolicePromotionEvidence[];
}

export interface PolicePromotionEvaluation {
  active: boolean;
  routeId?: string;
  formalRankCode: PoliceRankCode;
  designation?: PolicePromotionDesignation;
  targetRankCode?: PoliceRankCode;
  eligible: boolean;
  requirements: PolicePromotionRequirementProgress[];
  lawfulNextStages: PolicePromotionProcessStage[];
  blockingReasons: string[];
  evidence: PolicePromotionEvidence[];
}

export type PolicePostingDepartmentCode =
  | 'uniform'
  | 'cid'
  | 'traffic'
  | 'eu'
  | 'ptu'
  | 'cid_specialist'
  | 'report_room';

export type PolicePostingResultKind = 'lateral_transfer' | 'training_rotation';

export interface PolicePostingRouteRule {
  routeId: string;
  worldpackId: typeof HK_1988_WORLDPACK_ID;
  acceptedCurrentDepartments: readonly PolicePostingDepartmentCode[];
  targetDepartment: PolicePostingDepartmentCode;
  acceptedFormalRankCodes: readonly PoliceRankCode[];
  requiredEvidenceTags: readonly string[];
  vacancyRequired: boolean;
  /**
   * Earliest point at which another posting program may begin after this
   * posting becomes effective. It models a real posting or training period;
   * it never completes evidence or advances a program by itself.
   */
  minimumDaysBeforeNextPosting?: number;
  resultKind: PolicePostingResultKind;
}

export interface PolicePostingEvaluationInput {
  enabled: boolean;
  worldpackId: string;
  routeId: string;
  currentDepartment: PolicePostingDepartmentCode | string;
  currentRank: string | undefined;
  requestedTargetRank?: string;
  vacancyStatus?: PoliceVacancyStatus;
  evidence: readonly PolicePromotionEvidence[];
}

export interface PolicePostingEvaluation {
  active: boolean;
  routeId?: string;
  eligible: boolean;
  formalRankCode: PoliceRankCode;
  designation?: PolicePromotionDesignation;
  resultingFormalRankCode: PoliceRankCode;
  targetDepartment?: PolicePostingDepartmentCode;
  resultKind?: PolicePostingResultKind;
  completedEvidenceTags: string[];
  blockingReasons: string[];
}

const FULL_PROMOTION_STAGES = [
  'not_eligible',
  'eligible',
  'exam_or_course',
  'awaiting_recommendation',
  'selection',
  'awaiting_vacancy',
  'approved_waiting_post',
  'appointed'
] as const satisfies readonly PolicePromotionProcessStage[];

const INSPECTOR_CONFIRMATION_STAGES = [
  'not_eligible',
  'eligible',
  'exam_or_course',
  'selection',
  'approved_waiting_post',
  'appointed'
] as const satisfies readonly PolicePromotionProcessStage[];

export const HK_1988_POLICE_PROMOTION_ROUTES = [
  {
    routeId: 'hk1988_pc_to_sgt',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentRankCodes: ['pc', 'spc'],
    canonicalCurrentRankCode: 'pc',
    targetRankCode: 'sgt',
    requiredRequirementIds: [
      'service_eligibility',
      'promotion_exam',
      'promotion_course',
      'performance_evidence',
      'discipline_clearance',
      'supervisor_recommendation',
      'selection_result',
      'vacancy_or_post',
      'appointment_effective'
    ],
    processStages: FULL_PROMOTION_STAGES,
    minimumInRankDays: 0,
    minimumDistinctEvidenceTurns: 2,
    minimumEvidenceKinds: 2,
    nextRouteId: 'hk1988_sgt_to_ssgt'
  },
  {
    routeId: 'hk1988_sgt_to_ssgt',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentRankCodes: ['sgt'],
    canonicalCurrentRankCode: 'sgt',
    targetRankCode: 'ssgt',
    requiredRequirementIds: [
      'service_eligibility',
      'promotion_course',
      'performance_evidence',
      'supervision_evidence',
      'discipline_clearance',
      'supervisor_recommendation',
      'selection_result',
      'vacancy_or_post',
      'appointment_effective'
    ],
    processStages: FULL_PROMOTION_STAGES,
    minimumInRankDays: 45,
    minimumDistinctEvidenceTurns: 2,
    minimumEvidenceKinds: 2,
    nextRouteId: 'hk1988_ssgt_to_pi'
  },
  {
    routeId: 'hk1988_ssgt_to_pi',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentRankCodes: ['ssgt'],
    canonicalCurrentRankCode: 'ssgt',
    targetRankCode: 'pi',
    requiredRequirementIds: [
      'service_eligibility',
      'promotion_course',
      'performance_evidence',
      'supervision_evidence',
      'discipline_clearance',
      'supervisor_recommendation',
      'selection_result',
      'vacancy_or_post',
      'appointment_effective'
    ],
    processStages: FULL_PROMOTION_STAGES,
    minimumInRankDays: 75,
    minimumDistinctEvidenceTurns: 2,
    minimumEvidenceKinds: 2,
    nextRouteId: 'hk1988_pi_to_ip'
  },
  {
    routeId: 'hk1988_pi_to_ip',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentRankCodes: ['pi'],
    canonicalCurrentRankCode: 'pi',
    targetRankCode: 'ip',
    requiredRequirementIds: [
      'service_eligibility',
      'promotion_course',
      'discipline_clearance',
      'selection_result',
      'appointment_effective'
    ],
    processStages: INSPECTOR_CONFIRMATION_STAGES,
    minimumInRankDays: 30,
    minimumDistinctEvidenceTurns: 0,
    minimumEvidenceKinds: 0
  }
] as const satisfies readonly PolicePromotionRouteRule[];

const COMMON_OPERATIONAL_RANKS = ['pc', 'sgt', 'ssgt', 'pi', 'ip'] as const;
const JUNIOR_OPERATIONAL_RANKS = ['pc', 'sgt', 'ssgt'] as const;
const SUPERVISORY_RANKS = ['sgt', 'ssgt', 'pi', 'ip'] as const;

export const HK_1988_POLICE_POSTING_ROUTES = [
  {
    routeId: 'hk1988_uniform_to_cid',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentDepartments: ['uniform'],
    targetDepartment: 'cid',
    acceptedFormalRankCodes: COMMON_OPERATIONAL_RANKS,
    requiredEvidenceTags: ['reliable_service', 'formal_recommendation', 'detective_training'],
    vacancyRequired: true,
    resultKind: 'lateral_transfer'
  },
  {
    routeId: 'hk1988_uniform_or_cid_to_traffic',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentDepartments: ['uniform', 'cid'],
    targetDepartment: 'traffic',
    acceptedFormalRankCodes: COMMON_OPERATIONAL_RANKS,
    requiredEvidenceTags: ['traffic_training', 'road_or_accident_record'],
    vacancyRequired: true,
    resultKind: 'lateral_transfer'
  },
  {
    routeId: 'hk1988_uniform_to_eu',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentDepartments: ['uniform'],
    targetDepartment: 'eu',
    acceptedFormalRankCodes: COMMON_OPERATIONAL_RANKS,
    requiredEvidenceTags: [
      'emergency_response',
      'qualified_driver',
      'discipline_clear',
      'formal_recommendation'
    ],
    vacancyRequired: true,
    resultKind: 'lateral_transfer'
  },
  {
    routeId: 'hk1988_uniform_to_ptu_rotation',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentDepartments: ['uniform'],
    targetDepartment: 'ptu',
    acceptedFormalRankCodes: JUNIOR_OPERATIONAL_RANKS,
    requiredEvidenceTags: [
      'physical_discipline_clear',
      'ptu_training_slot',
      'ptu_course_completed',
      'rotation_arranged'
    ],
    vacancyRequired: true,
    minimumDaysBeforeNextPosting: 21,
    resultKind: 'training_rotation'
  },
  {
    routeId: 'hk1988_ptu_rotation_return_to_uniform',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentDepartments: ['ptu'],
    targetDepartment: 'uniform',
    acceptedFormalRankCodes: JUNIOR_OPERATIONAL_RANKS,
    requiredEvidenceTags: ['ptu_rotation_completed', 'return_arranged'],
    vacancyRequired: false,
    minimumDaysBeforeNextPosting: 14,
    resultKind: 'training_rotation'
  },
  {
    routeId: 'hk1988_cid_to_specialist',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentDepartments: ['cid'],
    targetDepartment: 'cid_specialist',
    acceptedFormalRankCodes: COMMON_OPERATIONAL_RANKS,
    requiredEvidenceTags: ['cid_experience', 'specialist_case_record', 'specialist_selection'],
    vacancyRequired: true,
    resultKind: 'lateral_transfer'
  },
  {
    routeId: 'hk1988_to_report_room',
    worldpackId: HK_1988_WORLDPACK_ID,
    acceptedCurrentDepartments: ['uniform', 'cid', 'traffic', 'eu'],
    targetDepartment: 'report_room',
    acceptedFormalRankCodes: SUPERVISORY_RANKS,
    requiredEvidenceTags: ['report_room_coordination', 'unit_need'],
    vacancyRequired: true,
    resultKind: 'lateral_transfer'
  }
] as const satisfies readonly PolicePostingRouteRule[];

const OBJECTIVE_EVIDENCE_KINDS = new Set<PolicePromotionEvidenceKind>([
  'case_activity',
  'judgement',
  'matter_progress',
  'commendation',
  'discipline',
  'training',
  'course',
  'exam',
  'supervision',
  'leadership',
  'supervisor_assessment',
  'selection',
  'appointment',
  'posting'
]);

const PERFORMANCE_EVIDENCE_KINDS = new Set<PolicePromotionEvidenceKind>([
  'case_activity',
  'judgement',
  'matter_progress',
  'commendation',
  'supervision',
  'leadership'
]);

const ENTRY_REQUIREMENT_IDS = new Set<PolicePromotionRequirementId>([
  'service_eligibility',
  'performance_evidence',
  'supervision_evidence',
  'discipline_clearance'
]);

const REQUIREMENT_LABELS: Record<PolicePromotionRequirementId, string> = {
  service_eligibility: '服务或任职资格',
  promotion_exam: '适用晋升考试',
  promotion_course: '适用晋升或专业课程',
  performance_evidence: '正式表现记录',
  supervision_evidence: '监督、带队或领导记录',
  discipline_clearance: '纪律条件',
  supervisor_recommendation: '直属上级正式推荐',
  selection_result: '遴选或阶段评核',
  vacancy_or_post: '可用职位或轮调名额',
  appointment_effective: '正式任命与报到生效'
};

function cleanId(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function evidenceCanonicalKey(evidence: PolicePromotionEvidence): string {
  const factId = cleanId(evidence.canonicalFactId);
  if (factId) return `fact:${factId}`;
  return `${evidence.kind}:${cleanId(evidence.canonicalRefId) ?? evidence.refId.trim()}`;
}

function evidencePriority(evidence: PolicePromotionEvidence): number {
  const objective = OBJECTIVE_EVIDENCE_KINDS.has(evidence.kind) ? 100 : 0;
  const canonical = cleanId(evidence.canonicalRefId) ? 10 : 0;
  const successful = evidence.result === 'successful' ? 1 : 0;
  return objective + canonical + successful;
}

function cloneEvidence(evidence: PolicePromotionEvidence): PolicePromotionEvidence {
  return {
    ...evidence,
    tags: evidence.tags ? [...evidence.tags] : undefined
  };
}

/**
 * Returns only actually applied evidence and collapses local projections of the
 * same canonical fact. No fuzzy text or name matching is used.
 */
export function dedupePolicePromotionEvidence(
  evidence: readonly PolicePromotionEvidence[]
): PolicePromotionEvidence[] {
  const byKey = new Map<string, PolicePromotionEvidence>();
  for (const candidate of evidence) {
    if (!candidate.applied || !cleanId(candidate.refId)) continue;
    const key = evidenceCanonicalKey(candidate);
    const existing = byKey.get(key);
    if (!existing || evidencePriority(candidate) > evidencePriority(existing)) {
      byKey.set(key, cloneEvidence(candidate));
    }
  }
  return [...byKey.values()];
}

export function normalizePolicePromotionRank(
  rank: string | undefined
): NormalizedPolicePromotionRank {
  const inputRankCode = resolvePoliceRankCode(rank);
  if (inputRankCode === 'spc') {
    return {
      inputRankCode,
      formalRankCode: 'pc',
      designation: 'senior_police_constable'
    };
  }
  return { inputRankCode, formalRankCode: inputRankCode };
}

export function getPolicePromotionRoute(
  rank: string | undefined,
  worldpackId: string = HK_1988_WORLDPACK_ID
): PolicePromotionRouteRule | undefined {
  if (worldpackId !== HK_1988_WORLDPACK_ID) return undefined;
  const normalized = normalizePolicePromotionRank(rank);
  return HK_1988_POLICE_PROMOTION_ROUTES.find(
    (route) => route.canonicalCurrentRankCode === normalized.formalRankCode
  );
}

function hasTag(evidence: PolicePromotionEvidence, tag: string): boolean {
  return evidence.tags?.includes(tag) ?? false;
}

function evidenceRef(evidence: PolicePromotionEvidence): string {
  return `${evidence.kind}:${cleanId(evidence.canonicalRefId) ?? evidence.refId.trim()}`;
}

function successfulEvidence(
  evidence: readonly PolicePromotionEvidence[],
  predicate: (candidate: PolicePromotionEvidence) => boolean
): PolicePromotionEvidence[] {
  return evidence.filter(
    (candidate) => candidate.result === 'successful' && predicate(candidate)
  );
}

function createRequirement(
  requirementId: PolicePromotionRequirementId,
  status: PolicePromotionRequirementStatus,
  summary: string,
  evidence: readonly PolicePromotionEvidence[] = [],
  blockingReason?: string
): PolicePromotionRequirementProgress {
  return {
    requirementId,
    status,
    evidenceRefs: evidence.map(evidenceRef),
    summary: `${REQUIREMENT_LABELS[requirementId]}：${summary}`,
    blockingReason
  };
}

function evaluateServiceRequirement(
  route: PolicePromotionRouteRule,
  input: PolicePromotionEvaluationInput
): PolicePromotionRequirementProgress {
  const minimumDays =
    route.routeId === 'hk1988_pc_to_sgt' && input.serviceBasis === 'new_recruit'
      ? 30
      : route.minimumInRankDays;
  const actualDays = Math.max(0, Math.floor(input.daysInCurrentRank));
  if (actualDays >= minimumDays) {
    return createRequirement(
      'service_eligibility',
      'completed',
      minimumDays === 0
        ? '现有服务经历允许立即进入资格评估。'
        : `已达到最低 ${minimumDays} 个游戏日，当前为 ${actualDays} 日。`
    );
  }
  return createRequirement(
    'service_eligibility',
    'in_progress',
    `最低需要 ${minimumDays} 个游戏日，当前为 ${actualDays} 日；等待不会替代其他条件。`,
    [],
    '尚未达到最低服务或任职期。'
  );
}

function performanceEvidence(
  evidence: readonly PolicePromotionEvidence[]
): PolicePromotionEvidence[] {
  return successfulEvidence(
    evidence,
    (candidate) =>
      PERFORMANCE_EVIDENCE_KINDS.has(candidate.kind) && Boolean(cleanId(candidate.turnId))
  );
}

function evaluatePerformanceRequirement(
  route: PolicePromotionRouteRule,
  input: PolicePromotionEvaluationInput,
  evidence: readonly PolicePromotionEvidence[]
): PolicePromotionRequirementProgress {
  const minimumTurns =
    route.routeId === 'hk1988_pc_to_sgt' && input.serviceBasis === 'new_recruit'
      ? 3
      : route.minimumDistinctEvidenceTurns;
  const minimumKinds =
    route.routeId === 'hk1988_pc_to_sgt' && input.serviceBasis === 'new_recruit'
      ? 2
      : route.minimumEvidenceKinds;
  const candidates = performanceEvidence(evidence);
  const turns = new Set(candidates.map((candidate) => candidate.turnId));
  const kinds = new Set(candidates.map((candidate) => candidate.kind));

  const hasBaseCounts = turns.size >= minimumTurns && kinds.size >= minimumKinds;
  const hasComplexEvidence =
    route.routeId !== 'hk1988_ssgt_to_pi' ||
    candidates.some((candidate) => hasTag(candidate, 'complex_policing'));

  if (hasBaseCounts && hasComplexEvidence) {
    return createRequirement(
      'performance_evidence',
      'completed',
      `已有 ${turns.size} 个不同回合、${kinds.size} 类有效表现证据。`,
      candidates
    );
  }

  const missingComplex = !hasComplexEvidence ? '，并缺少复杂警务处置证据' : '';
  return createRequirement(
    'performance_evidence',
    'pending',
    `需要至少 ${minimumTurns} 个不同回合及 ${minimumKinds} 类证据；当前为 ${turns.size} 个回合、${kinds.size} 类${missingComplex}。`,
    candidates,
    '正式表现证据尚未满足路线最低条件。'
  );
}

function evaluateSupervisionRequirement(
  route: PolicePromotionRouteRule,
  evidence: readonly PolicePromotionEvidence[]
): PolicePromotionRequirementProgress {
  const supervision = successfulEvidence(
    evidence,
    (candidate) => candidate.kind === 'supervision' || candidate.kind === 'leadership'
  );
  const requiresLeadership = route.routeId === 'hk1988_ssgt_to_pi';
  const qualifying = requiresLeadership
    ? supervision.filter(
        (candidate) => candidate.kind === 'leadership' || hasTag(candidate, 'leadership')
      )
    : supervision;

  if (qualifying.length > 0) {
    return createRequirement(
      'supervision_evidence',
      'completed',
      requiresLeadership ? '已有正式领导或协调事实。' : '已有正式监督或带队事实。',
      qualifying
    );
  }
  return createRequirement(
    'supervision_evidence',
    'pending',
    requiresLeadership ? '尚无正式领导或协调事实。' : '尚无正式监督或带队事实。',
    [],
    requiresLeadership ? '缺少领导或协调证据。' : '缺少监督或带队证据。'
  );
}

function evaluateDisciplineRequirement(
  evidence: readonly PolicePromotionEvidence[]
): PolicePromotionRequirementProgress {
  const unresolvedSevere = evidence.filter(
    (candidate) =>
      candidate.kind === 'discipline' &&
      hasTag(candidate, 'severe') &&
      hasTag(candidate, 'unresolved')
  );
  if (unresolvedSevere.length > 0) {
    return createRequirement(
      'discipline_clearance',
      'blocked',
      '存在已应用且尚未解决的严重纪律记录。',
      unresolvedSevere,
      '严重纪律事项尚未解决，不能仅靠等待解除。'
    );
  }
  return createRequirement(
    'discipline_clearance',
    'completed',
    '未发现已应用且尚未解决的严重纪律阻断。'
  );
}

function evaluateTaggedRequirement(
  requirementId: PolicePromotionRequirementId,
  evidence: readonly PolicePromotionEvidence[],
  kind: PolicePromotionEvidenceKind | readonly PolicePromotionEvidenceKind[],
  tag: string,
  completeSummary: string,
  pendingSummary: string
): PolicePromotionRequirementProgress {
  const acceptedKinds = Array.isArray(kind) ? kind : [kind];
  const matches = successfulEvidence(
    evidence,
    (candidate) => acceptedKinds.includes(candidate.kind) && hasTag(candidate, tag)
  );
  if (matches.length > 0) {
    return createRequirement(requirementId, 'completed', completeSummary, matches);
  }
  return createRequirement(
    requirementId,
    'pending',
    pendingSummary,
    [],
    `${REQUIREMENT_LABELS[requirementId]}尚未形成已应用的正式事实。`
  );
}

function evaluateVacancyRequirement(
  vacancyStatus: PoliceVacancyStatus
): PolicePromotionRequirementProgress {
  if (vacancyStatus === 'available' || vacancyStatus === 'allocated') {
    return createRequirement(
      'vacancy_or_post',
      'completed',
      vacancyStatus === 'allocated' ? '职位已正式分配给玩家。' : '已有可靠事实确认当前职位可用。'
    );
  }
  if (vacancyStatus === 'expected') {
    return createRequirement(
      'vacancy_or_post',
      'in_progress',
      '已有预计空缺，但尚不能视为可任命职位。',
      [],
      '预计空缺尚未成为可用或已分配职位。'
    );
  }
  return createRequirement(
    'vacancy_or_post',
    vacancyStatus === 'unavailable' ? 'blocked' : 'pending',
    vacancyStatus === 'unavailable' ? '正式信息确认当前暂无空缺。' : '目前没有可靠空缺资料。',
    [],
    vacancyStatus === 'unavailable' ? '当前没有可用职位。' : '空缺状态未知。'
  );
}

function requirementById(
  requirements: readonly PolicePromotionRequirementProgress[],
  requirementId: PolicePromotionRequirementId
): PolicePromotionRequirementProgress | undefined {
  return requirements.find((requirement) => requirement.requirementId === requirementId);
}

function requirementsCompleted(
  requirements: readonly PolicePromotionRequirementProgress[],
  requirementIds: readonly PolicePromotionRequirementId[]
): boolean {
  return requirementIds.every(
    (requirementId) => requirementById(requirements, requirementId)?.status === 'completed'
  );
}

function prerequisitesForNextStage(
  nextStage: PolicePromotionProcessStage,
  route: PolicePromotionRouteRule
): PolicePromotionRequirementId[] {
  const required = new Set(route.requiredRequirementIds);
  const present = (ids: readonly PolicePromotionRequirementId[]) =>
    ids.filter((requirementId) => required.has(requirementId));

  if (nextStage === 'eligible' || nextStage === 'exam_or_course') {
    return present([...ENTRY_REQUIREMENT_IDS]);
  }
  if (nextStage === 'awaiting_recommendation') {
    return present(['promotion_exam', 'promotion_course']);
  }
  if (nextStage === 'selection') {
    return present(['promotion_exam', 'promotion_course', 'supervisor_recommendation']);
  }
  if (nextStage === 'awaiting_vacancy') {
    return present(['selection_result']);
  }
  if (nextStage === 'approved_waiting_post') {
    return present(['selection_result', 'vacancy_or_post']);
  }
  if (nextStage === 'appointed') {
    return present(route.requiredRequirementIds);
  }
  return [];
}

function getLawfulNextStages(
  currentStage: PolicePromotionProcessStage,
  route: PolicePromotionRouteRule,
  requirements: readonly PolicePromotionRequirementProgress[]
): PolicePromotionProcessStage[] {
  const currentIndex = route.processStages.indexOf(currentStage);
  if (currentIndex < 0 || currentIndex >= route.processStages.length - 1) return [];
  const nextStage = route.processStages[currentIndex + 1];
  return requirementsCompleted(requirements, prerequisitesForNextStage(nextStage, route))
    ? [nextStage]
    : [];
}

export function evaluatePolicePromotion(
  input: PolicePromotionEvaluationInput
): PolicePromotionEvaluation {
  const normalized = normalizePolicePromotionRank(input.currentRank);
  const evidence = dedupePolicePromotionEvidence(input.evidence);
  const inactiveReason = !input.enabled
    ? '警队晋升 DLC 未启用。'
    : input.worldpackId !== HK_1988_WORLDPACK_ID
      ? '当前世界包没有警队晋升规则适配。'
      : undefined;

  if (inactiveReason) {
    return {
      active: false,
      formalRankCode: normalized.formalRankCode,
      designation: normalized.designation,
      eligible: false,
      requirements: [],
      lawfulNextStages: [],
      blockingReasons: [inactiveReason],
      evidence
    };
  }

  const route = getPolicePromotionRoute(input.currentRank, input.worldpackId);
  if (!route) {
    return {
      active: true,
      formalRankCode: normalized.formalRankCode,
      designation: normalized.designation,
      eligible: false,
      requirements: [],
      lawfulNextStages: [],
      blockingReasons: ['当前正式警衔没有 V1 支持的完整晋升路线。'],
      evidence
    };
  }

  const requirementMap = new Map<
    PolicePromotionRequirementId,
    PolicePromotionRequirementProgress
  >();
  requirementMap.set('service_eligibility', evaluateServiceRequirement(route, input));
  requirementMap.set(
    'performance_evidence',
    evaluatePerformanceRequirement(route, input, evidence)
  );
  requirementMap.set('supervision_evidence', evaluateSupervisionRequirement(route, evidence));
  requirementMap.set('discipline_clearance', evaluateDisciplineRequirement(evidence));
  requirementMap.set(
    'promotion_exam',
    evaluateTaggedRequirement(
      'promotion_exam',
      evidence,
      'exam',
      'promotion_exam_passed',
      '已通过适用晋升考试。',
      '尚无已通过的适用晋升考试。'
    )
  );
  requirementMap.set(
    'promotion_course',
    evaluateTaggedRequirement(
      'promotion_course',
      evidence,
      ['course', 'training'],
      'promotion_course_completed',
      '已完成适用晋升或确认课程。',
      '尚未完成适用晋升或确认课程。'
    )
  );
  requirementMap.set(
    'supervisor_recommendation',
    evaluateTaggedRequirement(
      'supervisor_recommendation',
      evidence,
      'supervisor_assessment',
      'formal_recommendation',
      '已有直属上级的正式推荐。',
      '尚无直属上级的有据正式推荐。'
    )
  );
  requirementMap.set(
    'selection_result',
    evaluateTaggedRequirement(
      'selection_result',
      evidence,
      'selection',
      'promotion_selection_passed',
      '已通过适用遴选或阶段评核。',
      '尚未通过适用遴选或阶段评核。'
    )
  );
  requirementMap.set(
    'vacancy_or_post',
    evaluateVacancyRequirement(input.vacancyStatus ?? 'unknown')
  );
  requirementMap.set(
    'appointment_effective',
    evaluateTaggedRequirement(
      'appointment_effective',
      evidence,
      'appointment',
      'appointment_effective',
      '正式任命和必要报到已经生效。',
      '正式任命或必要报到尚未生效。'
    )
  );

  const requirements = route.requiredRequirementIds.map(
    (requirementId) => requirementMap.get(requirementId)!
  );
  const entryRequirements = requirements.filter((requirement) =>
    ENTRY_REQUIREMENT_IDS.has(requirement.requirementId)
  );
  const eligible = entryRequirements.every((requirement) => requirement.status === 'completed');
  const currentStage = input.processStage ?? 'not_eligible';
  const stageSupported = route.processStages.includes(currentStage);
  const blockingReasons = requirements
    .filter((requirement) => requirement.status === 'blocked')
    .map((requirement) => requirement.blockingReason ?? requirement.summary);
  if (!eligible) {
    blockingReasons.push(
      ...entryRequirements
        .filter((requirement) => requirement.status !== 'completed')
        .map((requirement) => requirement.blockingReason ?? requirement.summary)
    );
  }
  if (!stageSupported) {
    blockingReasons.push('当前程序阶段不属于这条晋升路线。');
  }

  return {
    active: true,
    routeId: route.routeId,
    formalRankCode: normalized.formalRankCode,
    designation: normalized.designation,
    targetRankCode: route.targetRankCode,
    eligible,
    requirements,
    lawfulNextStages: stageSupported
      ? getLawfulNextStages(currentStage, route, requirements)
      : [],
    blockingReasons: [...new Set(blockingReasons)],
    evidence
  };
}

export function getPolicePostingRoute(
  routeId: string,
  worldpackId: string = HK_1988_WORLDPACK_ID
): PolicePostingRouteRule | undefined {
  if (worldpackId !== HK_1988_WORLDPACK_ID) return undefined;
  return HK_1988_POLICE_POSTING_ROUTES.find((route) => route.routeId === routeId);
}

export function evaluatePolicePosting(
  input: PolicePostingEvaluationInput
): PolicePostingEvaluation {
  const normalized = normalizePolicePromotionRank(input.currentRank);
  const base: PolicePostingEvaluation = {
    active: false,
    eligible: false,
    formalRankCode: normalized.formalRankCode,
    designation: normalized.designation,
    resultingFormalRankCode: normalized.formalRankCode,
    completedEvidenceTags: [],
    blockingReasons: []
  };
  if (!input.enabled) {
    return { ...base, blockingReasons: ['警队晋升 DLC 未启用。'] };
  }
  if (input.worldpackId !== HK_1988_WORLDPACK_ID) {
    return { ...base, blockingReasons: ['当前世界包没有香港 1988 调动规则适配。'] };
  }

  const route = getPolicePostingRoute(input.routeId, input.worldpackId);
  if (!route) {
    return { ...base, active: true, blockingReasons: ['调动路线不存在或未获 V1 支持。'] };
  }

  const evidence = dedupePolicePromotionEvidence(input.evidence);
  const appliedTags = new Set(
    evidence
      .filter((candidate) => candidate.result === 'successful')
      .flatMap((candidate) => candidate.tags ?? [])
  );
  const completedEvidenceTags = route.requiredEvidenceTags.filter((tag) => appliedTags.has(tag));
  const missingTags = route.requiredEvidenceTags.filter((tag) => !appliedTags.has(tag));
  const blockingReasons: string[] = [];
  if (!route.acceptedCurrentDepartments.includes(input.currentDepartment as PolicePostingDepartmentCode)) {
    blockingReasons.push('当前部门不符合这条调动路线的来源条件。');
  }
  if (!route.acceptedFormalRankCodes.includes(normalized.formalRankCode)) {
    blockingReasons.push('当前正式警衔不符合这条调动路线。');
  }
  if (input.requestedTargetRank) {
    const requested = normalizePolicePromotionRank(input.requestedTargetRank);
    if (requested.formalRankCode !== normalized.formalRankCode) {
      blockingReasons.push('横向调动不得同时改变正式警衔。');
    }
  }
  if (missingTags.length > 0) {
    blockingReasons.push(`缺少调动证据：${missingTags.join('、')}。`);
  }
  if (
    route.vacancyRequired &&
    input.vacancyStatus !== 'available' &&
    input.vacancyStatus !== 'allocated'
  ) {
    blockingReasons.push('没有已确认可用或已分配的职位、名额或轮调席位。');
  }

  return {
    ...base,
    active: true,
    routeId: route.routeId,
    eligible: blockingReasons.length === 0,
    targetDepartment: route.targetDepartment,
    resultKind: route.resultKind,
    completedEvidenceTags,
    blockingReasons
  };
}
