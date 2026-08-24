import type { PlayerPoliceRoleProfilePatch } from '../identity/playerPoliceRoleProfile';
import { applyPlayerPoliceRoleProfilePatch } from '../identity/playerPoliceRoleProfile';
import type {
  GameTime,
  PoliceCareerEvidenceState,
  PoliceCareerVacancyStatus,
  PolicePostingProgramStage,
  PolicePostingProgramState,
  PolicePromotionProgramStage,
  PolicePromotionProgramState,
  RuntimeState,
  StoryDiagnosticIssue,
  TurnId
} from '../runtime/types';
import {
  getPoliceDepartment,
  policeDepartmentOptions,
  type PoliceDepartmentId,
  type PoliceRankId
} from '../worldpack/hk1980sOpening';
import { synchronizePlayerPoliceRank } from './playerPoliceRank';
import {
  dedupePolicePromotionEvidence,
  evaluatePolicePosting,
  evaluatePolicePromotion,
  getPolicePostingRoute,
  getPolicePromotionRoute,
  normalizePolicePromotionRank,
  POLICE_PROMOTION_DLC_ID,
  type PolicePromotionEvidence,
  type PolicePromotionEvidenceKind
} from './policePromotionRules';
import { normalizePoliceRankDisplay, type PoliceRankCode } from './policeRankCatalog';
import { auditPolicePostingEventTags } from './policePostingContent';

export type PoliceCareerEventType =
  | 'case_activity_recorded'
  | 'judgement_recorded'
  | 'matter_progressed'
  | 'commendation_recorded'
  | 'discipline_recorded'
  | 'training_completed'
  | 'course_completed'
  | 'qualification_confirmed'
  | 'training_slot_allocated'
  | 'rotation_arranged'
  | 'unit_need_confirmed'
  | 'exam_passed'
  | 'exam_failed'
  | 'supervision_recorded'
  | 'leadership_recorded'
  | 'formal_recommendation'
  | 'recommendation_declined'
  | 'selection_passed'
  | 'selection_failed'
  | 'vacancy_unavailable'
  | 'vacancy_expected'
  | 'vacancy_available'
  | 'vacancy_allocated'
  | 'appointment_effective'
  | 'posting_effective';

export interface PoliceCareerSupportingRefPatch {
  kind: 'case_activity' | 'judgement' | 'current_matter';
  refId: string;
}

export interface PoliceCareerEventPatch {
  eventId: string;
  eventType: PoliceCareerEventType;
  summary: string;
  actorId?: string;
  supportRef?: PoliceCareerSupportingRefPatch;
  tags?: string[];
}

export interface PolicePromotionProgressPatch {
  kind: 'promotion';
  routeId: string;
  requestedStage?: PolicePromotionProgramStage;
  events: PoliceCareerEventPatch[];
  reason: string;
}

export interface PolicePostingProgressPatch {
  kind: 'posting';
  routeId: string;
  requestedStage?: PolicePostingProgramStage;
  events: PoliceCareerEventPatch[];
  reason: string;
}

export type PoliceCareerProgressPatch =
  | PolicePromotionProgressPatch
  | PolicePostingProgressPatch;

export interface PoliceCareerApplyResult {
  state: RuntimeState;
  diagnostics: StoryDiagnosticIssue[];
}

const POSTING_STAGE_ORDER: readonly PolicePostingProgramStage[] = [
  'not_selected',
  'interested',
  'eligible',
  'training',
  'awaiting_vacancy',
  'approved_waiting_report',
  'effective'
];

const VACANCY_EVENT_STATUS: Partial<Record<PoliceCareerEventType, PoliceCareerVacancyStatus>> = {
  vacancy_unavailable: 'unavailable',
  vacancy_expected: 'expected',
  vacancy_available: 'available',
  vacancy_allocated: 'allocated'
};

const CAREER_REVIEW_COOLDOWN_DAYS: Partial<Record<PoliceCareerEventType, number>> = {
  exam_failed: 14,
  recommendation_declined: 7,
  selection_failed: 14,
  vacancy_unavailable: 7
};

const EVENT_EVIDENCE: Partial<
  Record<PoliceCareerEventType, { kind: PolicePromotionEvidenceKind; tags: string[]; result: 'successful' | 'failed' | 'neutral' }>
> = {
  commendation_recorded: { kind: 'commendation', tags: [], result: 'successful' },
  discipline_recorded: { kind: 'discipline', tags: [], result: 'neutral' },
  training_completed: { kind: 'training', tags: [], result: 'successful' },
  course_completed: { kind: 'course', tags: ['promotion_course_completed'], result: 'successful' },
  qualification_confirmed: { kind: 'training', tags: [], result: 'successful' },
  training_slot_allocated: { kind: 'training', tags: [], result: 'successful' },
  rotation_arranged: { kind: 'posting', tags: [], result: 'successful' },
  unit_need_confirmed: { kind: 'posting', tags: [], result: 'successful' },
  exam_passed: { kind: 'exam', tags: ['promotion_exam_passed'], result: 'successful' },
  exam_failed: { kind: 'exam', tags: ['promotion_exam_failed'], result: 'failed' },
  supervision_recorded: { kind: 'supervision', tags: [], result: 'successful' },
  leadership_recorded: { kind: 'leadership', tags: ['leadership'], result: 'successful' },
  formal_recommendation: { kind: 'supervisor_assessment', tags: ['formal_recommendation'], result: 'successful' },
  recommendation_declined: {
    kind: 'supervisor_assessment',
    tags: ['formal_recommendation_declined'],
    result: 'failed'
  },
  selection_passed: { kind: 'selection', tags: ['promotion_selection_passed'], result: 'successful' },
  selection_failed: { kind: 'selection', tags: ['promotion_selection_failed'], result: 'failed' },
  appointment_effective: { kind: 'appointment', tags: ['appointment_effective'], result: 'successful' },
  posting_effective: { kind: 'posting', tags: ['posting_effective'], result: 'successful' }
};

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

function sameTime(left: GameTime | undefined, right: GameTime | undefined): boolean {
  return Boolean(
    left &&
      right &&
      left.year === right.year &&
      left.month === right.month &&
      left.day === right.day &&
      left.hour === right.hour &&
      left.minute === right.minute
  );
}

function gameTimeMinutes(time: GameTime): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute) / 60_000;
}

function addGameDays(time: GameTime, days: number): GameTime {
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day + days, time.hour, time.minute));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function activeReviewDeadline(value: GameTime | undefined, time: GameTime): GameTime | undefined {
  return value && gameTimeMinutes(time) < gameTimeMinutes(value) ? cloneTime(value) : undefined;
}

function extendReviewDeadline(
  current: GameTime | undefined,
  time: GameTime,
  eventTypes: ReadonlySet<PoliceCareerEventType>
): GameTime | undefined {
  let deadline = activeReviewDeadline(current, time);
  for (const eventType of eventTypes) {
    const cooldownDays = CAREER_REVIEW_COOLDOWN_DAYS[eventType];
    if (!cooldownDays) continue;
    const candidate = addGameDays(time, cooldownDays);
    if (!deadline || gameTimeMinutes(candidate) > gameTimeMinutes(deadline)) deadline = candidate;
  }
  return deadline;
}

function formatReviewDeadline(value: GameTime): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.year}-${pad(value.month)}-${pad(value.day)} ${pad(value.hour)}:${pad(value.minute)}`;
}

function reviewBlockingReason(value: GameTime): string {
  return `程序未通过或暂时受阻，最早于 ${formatReviewDeadline(value)} 再次评估；既有有效条件继续保留。`;
}

function elapsedDays(from: GameTime, to: GameTime): number {
  return Math.max(0, Math.floor((gameTimeMinutes(to) - gameTimeMinutes(from)) / 1_440));
}

function unique(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function isPromotionBound(state: RuntimeState): boolean {
  return Boolean(
    state.world.officialDlcBindings?.some((binding) => binding.dlcId === POLICE_PROMOTION_DLC_ID)
  );
}

function isPromotionActive(state: RuntimeState): boolean {
  return Boolean(
    state.world.officialDlcBindings?.some(
      (binding) => binding.dlcId === POLICE_PROMOTION_DLC_ID && binding.status === 'active'
    )
  );
}

function stateEvidenceToRule(evidence: readonly PoliceCareerEvidenceState[]): PolicePromotionEvidence[] {
  return evidence.map((candidate) => ({
    ...candidate,
    applied: true,
    tags: candidate.tags ? [...candidate.tags] : undefined
  }));
}

const PERSISTED_CAREER_EVIDENCE_KINDS = new Set<PoliceCareerEvidenceState['kind']>([
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

function isPersistedCareerEvidenceKind(
  kind: PolicePromotionEvidenceKind
): kind is PoliceCareerEvidenceState['kind'] {
  return PERSISTED_CAREER_EVIDENCE_KINDS.has(kind as PoliceCareerEvidenceState['kind']);
}

function ruleEvidenceToState(evidence: readonly PolicePromotionEvidence[]): PoliceCareerEvidenceState[] {
  return evidence
    .filter((candidate) => isPersistedCareerEvidenceKind(candidate.kind))
    .map(({ applied: _applied, ...candidate }) => ({
      ...candidate,
      kind: candidate.kind as PoliceCareerEvidenceState['kind'],
      tags: candidate.tags ? [...candidate.tags] : undefined
    }));
}

function rankLabel(rankCode: string): string {
  return normalizePoliceRankDisplay(rankCode).label;
}

function createPromotionProgram(state: RuntimeState): PolicePromotionProgramState | undefined {
  const route = getPolicePromotionRoute(state.lawIdentity.rank, state.world.worldpackId);
  if (!route) return undefined;
  const normalized = normalizePolicePromotionRank(state.lawIdentity.rank);
  const evaluation = evaluatePolicePromotion({
    enabled: true,
    worldpackId: state.world.worldpackId,
    currentRank: state.lawIdentity.rank,
    serviceBasis: 'established_service',
    daysInCurrentRank: 0,
    processStage: 'not_eligible',
    vacancyStatus: 'unknown',
    evidence: []
  });
  return {
    routeId: route.routeId,
    worldpackId: state.world.worldpackId,
    currentRankCode: normalized.formalRankCode,
    targetRankCode: route.targetRankCode,
    ...(normalized.designation ? { designation: normalized.designation } : {}),
    processStage: 'not_eligible',
    serviceBasis: 'established_service',
    rankEffectiveAt: cloneTime(state.time),
    vacancyStatus: 'unknown',
    evidence: [],
    requirements: evaluation.requirements,
    lawfulNextStages: evaluation.lawfulNextStages,
    blockingReasons: evaluation.blockingReasons,
    lastEvaluatedAt: cloneTime(state.time)
  };
}

function refreshPromotionProgram(
  state: RuntimeState,
  program: PolicePromotionProgramState,
  time: GameTime
): PolicePromotionProgramState {
  if (
    program.processStage === 'appointed' &&
    normalizePolicePromotionRank(state.lawIdentity.rank).formalRankCode === program.targetRankCode
  ) {
    return {
      ...program,
      lastEvaluatedAt: cloneTime(time)
    };
  }
  const evaluation = evaluatePolicePromotion({
    enabled: true,
    worldpackId: state.world.worldpackId,
    currentRank: state.lawIdentity.rank,
    serviceBasis: program.serviceBasis,
    daysInCurrentRank: elapsedDays(program.rankEffectiveAt, time),
    processStage: program.processStage,
    vacancyStatus: program.vacancyStatus,
    evidence: stateEvidenceToRule(program.evidence)
  });
  const reviewNotBefore = activeReviewDeadline(program.reviewNotBefore, time);
  const { reviewNotBefore: _previousReviewNotBefore, ...programWithoutReviewDeadline } = program;
  return {
    ...programWithoutReviewDeadline,
    currentRankCode: evaluation.formalRankCode,
    ...(evaluation.designation ? { designation: evaluation.designation } : {}),
    requirements: evaluation.requirements,
    lawfulNextStages: reviewNotBefore ? [] : evaluation.lawfulNextStages,
    blockingReasons: reviewNotBefore
      ? [...new Set([...evaluation.blockingReasons, reviewBlockingReason(reviewNotBefore)])]
      : evaluation.blockingReasons,
    evidence: ruleEvidenceToState(evaluation.evidence),
    ...(reviewNotBefore ? { reviewNotBefore } : {}),
    lastEvaluatedAt: cloneTime(time)
  };
}

/**
 * Adds only optional structured state for saves that explicitly bind the DLC.
 * Existing rank, posting and free-text history are retained; no historical
 * exam, recommendation, vacancy or appointment is invented.
 */
export function normalizePoliceCareerProgress(state: RuntimeState): RuntimeState {
  if (!isPromotionBound(state) || state.player.currentIdentity !== 'police') return state;
  const existing = state.policePanel.careerPath.promotionProgress;
  const promotionProgress = existing
    ? refreshPromotionProgram(state, existing, state.time)
    : createPromotionProgram(state);
  if (!promotionProgress) return state;
  return {
    ...state,
    policePanel: {
      ...state.policePanel,
      careerPath: {
        ...state.policePanel.careerPath,
        targetRank: rankLabel(promotionProgress.targetRankCode),
        promotionProgress
      }
    }
  };
}

function departmentCode(value: string | undefined): PoliceDepartmentId | undefined {
  const source = value?.trim().toLowerCase();
  if (!source) return undefined;
  const direct = policeDepartmentOptions.find((candidate) => candidate.id === source)?.id;
  if (direct) return direct;
  if (/criminal investigation|侦缉|偵緝|\bcid\b/.test(source)) return 'cid';
  if (/traffic|交通/.test(source)) return 'traffic';
  if (/emergency unit|冲锋|衝鋒|\beu\b/.test(source)) return 'eu';
  if (/police tactical unit|机动部队|機動部隊|\bptu\b/.test(source)) return 'ptu';
  if (/marine|水警/.test(source)) return 'marine';
  if (/special branch|政治部/.test(source)) return 'special_branch';
  if (/report room|station duty|报案室|報案室|值日/.test(source)) return 'station_duty';
  if (/uniform|军装|軍裝|巡逻|巡邏/.test(source)) return 'uniform';
  return undefined;
}

function postingTargetDepartment(routeTarget: string): PoliceDepartmentId {
  if (routeTarget === 'cid_specialist') return 'cid';
  if (routeTarget === 'report_room') return 'station_duty';
  return routeTarget as PoliceDepartmentId;
}

function worldpackRankId(rankCode: PoliceRankCode): PoliceRankId | undefined {
  const mapping: Partial<Record<PoliceRankCode, PoliceRankId>> = {
    pc: 'pc',
    spc: 'spc',
    sgt: 'sergeant',
    ssgt: 'station_sergeant',
    pi: 'probationary_inspector',
    ip: 'inspector',
    sip: 'senior_inspector',
    cip: 'chief_inspector'
  };
  return mapping[rankCode];
}

function validateRolePatchForRank(
  patch: PlayerPoliceRoleProfilePatch,
  rankCode: PoliceRankCode
): string | undefined {
  const code = departmentCode(patch.department);
  if (!code) return '目标部门不属于香港 1988 世界包的已知警队部门。';
  const rankId = worldpackRankId(rankCode);
  if (!rankId || !getPoliceDepartment(code).allowedRanks.includes(rankId)) {
    return '目标部门不接受本次任命后的正式警衔。';
  }
  return undefined;
}

function isStructuralRoleChange(
  state: RuntimeState,
  patch: PlayerPoliceRoleProfilePatch
): boolean {
  const profile = state.actors[state.player.actorId]?.roleProfiles.police;
  return Boolean(
    patch.stationOrPost.trim() !== (profile?.stationOrPost ?? state.lawIdentity.stationOrPost ?? '').trim() ||
      patch.department.trim() !== (profile?.department ?? state.lawIdentity.department ?? '').trim() ||
      patch.assignmentSummary.trim() !==
        (profile?.assignmentSummary ?? state.lawIdentity.assignmentSummary ?? '').trim() ||
      (patch.postRole !== undefined && patch.postRole.trim() !== (profile?.postRole ?? '').trim())
  );
}

function supportingEvidence(
  before: RuntimeState,
  after: RuntimeState,
  event: PoliceCareerEventPatch,
  turnId: TurnId
): PolicePromotionEvidence | undefined {
  const support = event.supportRef;
  if (!support) return undefined;
  if (event.eventType === 'judgement_recorded' && support.kind === 'judgement') {
    const check = after.judgementChecks[support.refId];
    if (!check || check.turnId !== turnId || before.judgementChecks[support.refId]) return undefined;
    return {
      kind: 'judgement',
      refId: support.refId,
      canonicalRefId: support.refId,
      canonicalFactId: `judgement:${support.refId}`,
      turnId,
      applied: true,
      result: check.outcome === 'success' || check.outcome === 'critical_success' ? 'successful' : 'failed',
      tags: unique(event.tags)
    };
  }
  if (event.eventType === 'matter_progressed' && support.kind === 'current_matter') {
    const previous = before.dynamicEvents.currentMatters[support.refId];
    const current = after.dynamicEvents.currentMatters[support.refId];
    if (!current || (previous && sameTime(previous.updatedAt, current.updatedAt))) return undefined;
    return {
      kind: 'matter_progress',
      refId: support.refId,
      canonicalRefId: support.refId,
      canonicalFactId: `matter:${support.refId}`,
      turnId,
      applied: true,
      result: current.status === 'resolved' ? 'successful' : 'neutral',
      tags: unique(event.tags)
    };
  }
  if (event.eventType === 'case_activity_recorded' && support.kind === 'case_activity') {
    const beforeHas = Object.values(before.cases).some((file) =>
      file.activityLog.some((activity) => activity.activityId === support.refId)
    );
    const current = Object.values(after.cases)
      .flatMap((file) => file.activityLog)
      .find((activity) => activity.activityId === support.refId);
    if (!current || beforeHas || !sameTime(current.gameTime, after.time)) return undefined;
    return {
      kind: 'case_activity',
      refId: support.refId,
      canonicalRefId: support.refId,
      canonicalFactId: `case_activity:${support.refId}`,
      turnId,
      applied: true,
      result: 'successful',
      tags: unique(event.tags)
    };
  }
  return undefined;
}

function proceduralEvidence(
  state: RuntimeState,
  event: PoliceCareerEventPatch,
  turnId: TurnId
): PolicePromotionEvidence | undefined {
  const base = EVENT_EVIDENCE[event.eventType];
  if (!base) return undefined;
  if (
    (event.eventType === 'formal_recommendation' || event.eventType === 'recommendation_declined') &&
    (!event.actorId ||
      !state.actors[event.actorId] ||
      !state.lawIdentity.supervisorActorIds.includes(event.actorId))
  ) {
    return undefined;
  }
  return {
    kind: base.kind,
    refId: event.eventId,
    canonicalRefId: event.eventId,
    canonicalFactId: `police_career:${event.eventId}`,
    turnId,
    applied: true,
    result: base.result,
    tags: unique([...base.tags, ...(event.tags ?? [])])
  };
}

function eventAllowedAtStage(
  kind: PoliceCareerProgressPatch['kind'],
  stage: PolicePromotionProgramStage | PolicePostingProgramStage,
  eventType: PoliceCareerEventType
): boolean {
  if (['case_activity_recorded', 'judgement_recorded', 'matter_progressed', 'commendation_recorded', 'discipline_recorded', 'supervision_recorded', 'leadership_recorded'].includes(eventType)) {
    return true;
  }
  if (kind === 'promotion') {
    if (['exam_passed', 'exam_failed', 'course_completed', 'training_completed'].includes(eventType)) {
      return stage === 'exam_or_course';
    }
    if (eventType === 'formal_recommendation' || eventType === 'recommendation_declined') {
      return stage === 'awaiting_recommendation';
    }
    if (['selection_passed', 'selection_failed'].includes(eventType)) return stage === 'selection';
    if (VACANCY_EVENT_STATUS[eventType]) {
      return stage === 'selection' || stage === 'awaiting_vacancy' || stage === 'approved_waiting_post';
    }
    if (eventType === 'appointment_effective') return stage === 'approved_waiting_post';
    return false;
  }
  if (eventType === 'training_completed' || eventType === 'course_completed') return stage === 'training';
  if (eventType === 'qualification_confirmed' || eventType === 'training_slot_allocated') {
    return stage === 'eligible' || stage === 'training';
  }
  if (eventType === 'rotation_arranged' || eventType === 'unit_need_confirmed') {
    return stage === 'training';
  }
  if (eventType === 'formal_recommendation') return stage === 'interested' || stage === 'eligible' || stage === 'training';
  if (eventType === 'selection_passed' || eventType === 'selection_failed') return stage === 'training';
  if (VACANCY_EVENT_STATUS[eventType]) return stage === 'awaiting_vacancy' || stage === 'approved_waiting_report';
  if (eventType === 'posting_effective') return stage === 'approved_waiting_report';
  return false;
}

function collectEvents(input: {
  before: RuntimeState;
  after: RuntimeState;
  patch: PoliceCareerProgressPatch;
  stage: PolicePromotionProgramStage | PolicePostingProgramStage;
  existing: readonly PoliceCareerEvidenceState[];
  processedEventIds?: readonly string[];
  turnId: TurnId;
  diagnostics: StoryDiagnosticIssue[];
}): {
  evidence: PoliceCareerEvidenceState[];
  processedEventIds: string[];
  vacancyStatus?: PoliceCareerVacancyStatus;
  acceptedEventTypes: Set<PoliceCareerEventType>;
} {
  const accepted: PolicePromotionEvidence[] = stateEvidenceToRule(input.existing);
  const existingIds = new Set([
    ...input.existing.map((candidate) => candidate.refId),
    ...(input.processedEventIds ?? [])
  ]);
  let vacancyStatus: PoliceCareerVacancyStatus | undefined;
  const acceptedEventTypes = new Set<PoliceCareerEventType>();
  for (const event of input.patch.events) {
    if (existingIds.has(event.eventId)) {
      input.diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch', 'events', event.eventId],
        code: 'police_career_duplicate_event_ignored',
        message: `Career event "${event.eventId}" was already recorded and was not applied twice.`
      });
      continue;
    }
    if (!eventAllowedAtStage(input.patch.kind, input.stage, event.eventType)) {
      input.diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch', 'events', event.eventId],
        code: 'police_career_event_stage_mismatch',
        message: `Career event "${event.eventType}" is not valid at program stage "${input.stage}".`
      });
      continue;
    }
    const vacancy = VACANCY_EVENT_STATUS[event.eventType];
    if (vacancy) {
      vacancyStatus = vacancy;
      existingIds.add(event.eventId);
      acceptedEventTypes.add(event.eventType);
      continue;
    }
    const objective = supportingEvidence(input.before, input.after, event, input.turnId);
    const procedural = objective ?? proceduralEvidence(input.after, event, input.turnId);
    if (!procedural) {
      input.diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch', 'events', event.eventId],
        code: 'police_career_evidence_not_applied',
        message: `Career event "${event.eventId}" did not match an applied current-turn fact or a valid procedural actor.`
      });
      continue;
    }
    if (input.patch.kind === 'posting') {
      const tagAudit = auditPolicePostingEventTags({
        routeId: input.patch.routeId,
        eventType: event.eventType,
        tags: procedural.tags
      });
      for (const rejected of tagAudit.rejectedTags) {
        input.diagnostics.push({
          path: ['writeback', 'policeCareerProgressPatch', 'events', event.eventId, 'tags', rejected.tag],
          code: 'police_posting_evidence_tag_rejected',
          message:
            rejected.reason === 'event_type_mismatch'
              ? `Posting evidence tag "${rejected.tag}" cannot be established by event type "${event.eventType}".`
              : `Posting evidence tag "${rejected.tag}" is not part of route "${input.patch.routeId}".`
        });
      }
      accepted.push({ ...procedural, tags: tagAudit.acceptedTags });
    } else {
      accepted.push(procedural);
    }
    existingIds.add(event.eventId);
    acceptedEventTypes.add(event.eventType);
  }
  return {
    evidence: ruleEvidenceToState(dedupePolicePromotionEvidence(accepted)),
    processedEventIds: [...existingIds].slice(-200),
    ...(vacancyStatus ? { vacancyStatus } : {}),
    acceptedEventTypes
  };
}

function applyNonStructuralRolePatch(
  state: RuntimeState,
  patch: PlayerPoliceRoleProfilePatch | undefined,
  diagnostics: StoryDiagnosticIssue[]
): RuntimeState {
  if (!patch) return state;
  if (isStructuralRoleChange(state, patch)) {
    diagnostics.push({
      path: ['writeback', 'policeRoleProfilePatch'],
      code: 'police_career_formal_posting_required',
      message: 'A formal rank, department, station or post change requires an accepted police career appointment or posting event.'
    });
    return state;
  }
  const result = applyPlayerPoliceRoleProfilePatch(state, patch);
  if (!result.applied) {
    diagnostics.push({
      path: ['writeback', 'policeRoleProfilePatch'],
      code: 'police_role_profile_patch_rejected',
      message: result.diagnostic ?? 'The police role profile patch was rejected.'
    });
  }
  return result.applied ? result.state : state;
}

function applyPromotion(input: {
  before: RuntimeState;
  after: RuntimeState;
  patch: PolicePromotionProgressPatch;
  rolePatch?: PlayerPoliceRoleProfilePatch;
  turnId: TurnId;
  diagnostics: StoryDiagnosticIssue[];
}): RuntimeState {
  let state = normalizePoliceCareerProgress(input.after);
  let program = state.policePanel.careerPath.promotionProgress;
  const currentRoute = getPolicePromotionRoute(state.lawIdentity.rank, state.world.worldpackId);
  if (!currentRoute || currentRoute.routeId !== input.patch.routeId) {
    input.diagnostics.push({
      path: ['writeback', 'policeCareerProgressPatch', 'routeId'],
      code: 'police_promotion_route_mismatch',
      message: 'The requested promotion route does not match the player current formal rank and worldpack.'
    });
    return state;
  }
  if (!program || program.routeId !== currentRoute.routeId) {
    program = createPromotionProgram(state);
  }
  if (!program) return state;
  if (program.lastProgressTurnId === input.turnId) {
    input.diagnostics.push({
      path: ['writeback', 'policeCareerProgressPatch'],
      code: 'police_career_turn_already_applied',
      message: 'This turn has already updated the current promotion program.'
    });
    return state;
  }

  const collected = collectEvents({
    before: input.before,
    after: state,
    patch: input.patch,
    stage: program.processStage,
    existing: program.evidence,
    processedEventIds: program.processedEventIds,
    turnId: input.turnId,
    diagnostics: input.diagnostics
  });
  const vacancyStatus = collected.vacancyStatus ?? program.vacancyStatus;
  const reviewNotBefore = extendReviewDeadline(
    program.reviewNotBefore,
    state.time,
    collected.acceptedEventTypes
  );
  let evaluation = evaluatePolicePromotion({
    enabled: true,
    worldpackId: state.world.worldpackId,
    currentRank: state.lawIdentity.rank,
    serviceBasis: program.serviceBasis,
    daysInCurrentRank: elapsedDays(program.rankEffectiveAt, state.time),
    processStage: program.processStage,
    vacancyStatus,
    evidence: stateEvidenceToRule(collected.evidence)
  });
  let processStage = program.processStage;
  const requestedStage = input.patch.requestedStage;
  if (requestedStage && requestedStage !== processStage) {
    if (reviewNotBefore) {
      input.diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch', 'requestedStage'],
        code: 'police_career_review_cooldown',
        message: reviewBlockingReason(reviewNotBefore)
      });
    } else if (!evaluation.lawfulNextStages.includes(requestedStage)) {
      input.diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch', 'requestedStage'],
        code: 'police_promotion_stage_rejected',
        message: `Promotion stage "${requestedStage}" is not the single lawful next stage from "${processStage}".`
      });
    } else if (
      requestedStage === 'appointed' &&
      !collected.acceptedEventTypes.has('appointment_effective')
    ) {
      input.diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch', 'requestedStage'],
        code: 'police_appointment_effective_missing',
        message: 'Formal rank appointment requires an accepted appointment_effective event in the same turn.'
      });
    } else {
      processStage = requestedStage;
    }
  }

  if (processStage === 'appointed' && processStage !== program.processStage) {
    const targetRank = evaluation.targetRankCode;
    if (!targetRank) return state;
    if (input.rolePatch) {
      const currentDepartment = departmentCode(state.lawIdentity.department);
      const requestedDepartment = departmentCode(input.rolePatch.department);
      const roleError = validateRolePatchForRank(input.rolePatch, targetRank);
      if (roleError || !currentDepartment || requestedDepartment !== currentDepartment) {
        input.diagnostics.push({
          path: ['writeback', 'policeRoleProfilePatch'],
          code: 'police_appointment_role_patch_rejected',
          message: roleError ?? 'A promotion appointment cannot silently include a cross-department transfer.'
        });
        return input.after;
      }
    }
    if (processStage === 'appointed') {
      const synchronized = synchronizePlayerPoliceRank({
        lawIdentity: state.lawIdentity,
        policePanel: state.policePanel,
        playerActor: state.actors[state.player.actorId],
        rank: rankLabel(targetRank)
      });
      state = {
        ...state,
        lawIdentity: synchronized.lawIdentity,
        policePanel: synchronized.policePanel,
        actors: synchronized.playerActor
          ? { ...state.actors, [state.player.actorId]: synchronized.playerActor }
          : state.actors
      };
      if (input.rolePatch) {
        const roleResult = applyPlayerPoliceRoleProfilePatch(state, input.rolePatch);
        if (!roleResult.applied) {
          input.diagnostics.push({
            path: ['writeback', 'policeRoleProfilePatch'],
            code: 'police_appointment_atomic_apply_failed',
            message: roleResult.diagnostic ?? 'The promotion appointment role patch failed.'
          });
          return input.after;
        }
        state = roleResult.state;
      }
      input.diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch'],
        code: 'police_promotion_appointment_applied',
        message: `Formal promotion appointment applied atomically to ${targetRank}.`
      });
    }
  } else if (input.rolePatch) {
    state = applyNonStructuralRolePatch(state, input.rolePatch, input.diagnostics);
  }

  evaluation = evaluatePolicePromotion({
    enabled: true,
    worldpackId: state.world.worldpackId,
    currentRank: processStage === 'appointed' ? program.currentRankCode : state.lawIdentity.rank,
    serviceBasis: program.serviceBasis,
    daysInCurrentRank: elapsedDays(program.rankEffectiveAt, state.time),
    processStage,
    vacancyStatus,
    evidence: stateEvidenceToRule(collected.evidence)
  });
  const { reviewNotBefore: _previousPromotionReview, ...programWithoutPromotionReview } = program;
  const nextProgram: PolicePromotionProgramState = {
    ...programWithoutPromotionReview,
    processStage,
    vacancyStatus,
    evidence: collected.evidence,
    processedEventIds: collected.processedEventIds,
    requirements: evaluation.requirements,
    lawfulNextStages: reviewNotBefore ? [] : evaluation.lawfulNextStages,
    blockingReasons: reviewNotBefore
      ? [...new Set([...evaluation.blockingReasons, reviewBlockingReason(reviewNotBefore)])]
      : evaluation.blockingReasons,
    ...(reviewNotBefore ? { reviewNotBefore } : {}),
    lastEvaluatedAt: cloneTime(state.time),
    ...(processStage !== program.processStage || collected.acceptedEventTypes.size > 0
      ? { lastProgressTurnId: input.turnId }
      : {})
  };
  return {
    ...state,
    policePanel: {
      ...state.policePanel,
      careerPath: {
        ...state.policePanel.careerPath,
        targetRank: rankLabel(nextProgram.targetRankCode),
        promotionProgress: nextProgram,
        updatedAt: cloneTime(state.time)
      },
      updatedAt: cloneTime(state.time)
    }
  };
}

function nextPostingStage(stage: PolicePostingProgramStage): PolicePostingProgramStage | undefined {
  const index = POSTING_STAGE_ORDER.indexOf(stage);
  return index >= 0 ? POSTING_STAGE_ORDER[index + 1] : undefined;
}

function postingCanAdvance(input: {
  program: PolicePostingProgramState;
  state: RuntimeState;
  requested: PolicePostingProgramStage;
  hasPostingEffective: boolean;
}): boolean {
  if (nextPostingStage(input.program.processStage) !== input.requested) return false;
  const baseRoute = getPolicePostingRoute(input.program.routeId, input.state.world.worldpackId);
  if (!baseRoute) return false;
  if (input.requested === 'interested' || input.requested === 'eligible' || input.requested === 'training') {
    const normalized = normalizePolicePromotionRank(input.state.lawIdentity.rank);
    return (
      baseRoute.acceptedCurrentDepartments.includes(input.program.sourceDepartment as never) &&
      baseRoute.acceptedFormalRankCodes.includes(normalized.formalRankCode)
    );
  }
  const evaluation = evaluatePolicePosting({
    enabled: true,
    worldpackId: input.state.world.worldpackId,
    routeId: input.program.routeId,
    currentDepartment: input.program.sourceDepartment,
    currentRank: input.state.lawIdentity.rank,
    vacancyStatus: input.program.vacancyStatus,
    evidence: stateEvidenceToRule(input.program.evidence)
  });
  if (input.requested === 'awaiting_vacancy') {
    return baseRoute.requiredEvidenceTags.every((tag) => evaluation.completedEvidenceTags.includes(tag));
  }
  if (input.requested === 'approved_waiting_report') return evaluation.eligible;
  if (input.requested === 'effective') return evaluation.eligible && input.hasPostingEffective;
  return false;
}

function applyPosting(input: {
  before: RuntimeState;
  after: RuntimeState;
  patch: PolicePostingProgressPatch;
  rolePatch?: PlayerPoliceRoleProfilePatch;
  turnId: TurnId;
  diagnostics: StoryDiagnosticIssue[];
}): RuntimeState {
  let state = normalizePoliceCareerProgress(input.after);
  const route = getPolicePostingRoute(input.patch.routeId, state.world.worldpackId);
  const sourceDepartment = departmentCode(state.lawIdentity.department);
  if (!route || !sourceDepartment || !route.acceptedCurrentDepartments.includes(sourceDepartment as never)) {
    input.diagnostics.push({
      path: ['writeback', 'policeCareerProgressPatch', 'routeId'],
      code: 'police_posting_route_mismatch',
      message: 'The requested posting route does not match the player current department, rank or worldpack.'
    });
    return state;
  }
  let program = state.policePanel.careerPath.postingProgress;
  if (
    program &&
    program.routeId !== route.routeId &&
    program.processStage === 'effective' &&
    activeReviewDeadline(program.reviewNotBefore, state.time)
  ) {
    input.diagnostics.push({
      path: ['writeback', 'policeCareerProgressPatch', 'routeId'],
      code: 'police_posting_review_cooldown',
      message: reviewBlockingReason(program.reviewNotBefore!)
    });
    return state;
  }
  if (!program || program.routeId !== route.routeId || program.processStage === 'effective') {
    program = {
      routeId: route.routeId,
      worldpackId: state.world.worldpackId,
      sourceDepartment,
      targetDepartment: route.targetDepartment,
      processStage: 'not_selected',
      vacancyStatus: 'unknown',
      evidence: [],
      processedEventIds: [],
      completedEvidenceTags: [],
      blockingReasons: [],
      lastEvaluatedAt: cloneTime(state.time)
    };
  }
  if (program.lastProgressTurnId === input.turnId) {
    input.diagnostics.push({
      path: ['writeback', 'policeCareerProgressPatch'],
      code: 'police_career_turn_already_applied',
      message: 'This turn has already updated the current posting program.'
    });
    return state;
  }
  const collected = collectEvents({
    before: input.before,
    after: state,
    patch: input.patch,
    stage: program.processStage,
    existing: program.evidence,
    processedEventIds: program.processedEventIds,
    turnId: input.turnId,
    diagnostics: input.diagnostics
  });
  program = {
    ...program,
    evidence: collected.evidence,
    processedEventIds: collected.processedEventIds,
    vacancyStatus: collected.vacancyStatus ?? program.vacancyStatus
  };
  let reviewNotBefore = extendReviewDeadline(
    program.reviewNotBefore,
    state.time,
    collected.acceptedEventTypes
  );
  const requestedStage = input.patch.requestedStage;
  let processStage = program.processStage;
  if (requestedStage && requestedStage !== processStage) {
    if (reviewNotBefore) {
      input.diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch', 'requestedStage'],
        code: 'police_career_review_cooldown',
        message: reviewBlockingReason(reviewNotBefore)
      });
    } else if (
      postingCanAdvance({
        program,
        state,
        requested: requestedStage,
        hasPostingEffective: collected.acceptedEventTypes.has('posting_effective')
      })
    ) {
      processStage = requestedStage;
    } else {
      input.diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch', 'requestedStage'],
        code: 'police_posting_stage_rejected',
        message: `Posting stage "${requestedStage}" is not the single lawful next stage from "${processStage}".`
      });
    }
  }

  if (processStage === 'effective' && processStage !== program.processStage) {
    const targetDepartment = postingTargetDepartment(route.targetDepartment);
    const requestedDepartment = departmentCode(input.rolePatch?.department);
    const normalizedRank = normalizePolicePromotionRank(state.lawIdentity.rank);
    const roleError = input.rolePatch
      ? validateRolePatchForRank(input.rolePatch, normalizedRank.formalRankCode) ??
        (!input.rolePatch.dutySummary?.trim()
          ? '正式调动必须提供新岗位完整 dutySummary，才能同步职责和值班。'
          : undefined)
      : '正式调动缺少完整 policeRoleProfilePatch。';
    if (!input.rolePatch || roleError || requestedDepartment !== targetDepartment) {
      input.diagnostics.push({
        path: ['writeback', 'policeRoleProfilePatch'],
        code: 'police_posting_effective_patch_rejected',
        message: roleError ?? 'The formal posting department does not match the approved posting route.'
      });
      return input.after;
    } else {
      const roleResult = applyPlayerPoliceRoleProfilePatch(state, input.rolePatch);
      if (!roleResult.applied) {
        input.diagnostics.push({
          path: ['writeback', 'policeRoleProfilePatch'],
          code: 'police_posting_atomic_apply_failed',
          message: roleResult.diagnostic ?? 'The formal posting could not be applied.'
        });
        return input.after;
      }
      state = roleResult.state;
      if (route.minimumDaysBeforeNextPosting) {
        reviewNotBefore = addGameDays(state.time, route.minimumDaysBeforeNextPosting);
      }
      input.diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch'],
        code: 'police_posting_applied',
        message: `Formal posting applied atomically to ${route.targetDepartment} without changing rank.`
      });
    }
  } else if (input.rolePatch) {
    state = applyNonStructuralRolePatch(state, input.rolePatch, input.diagnostics);
  }

  const evaluation = evaluatePolicePosting({
    enabled: true,
    worldpackId: state.world.worldpackId,
    routeId: route.routeId,
    currentDepartment: program.sourceDepartment,
    currentRank: state.lawIdentity.rank,
    vacancyStatus: program.vacancyStatus,
    evidence: stateEvidenceToRule(program.evidence)
  });
  const { reviewNotBefore: _previousPostingReview, ...programWithoutPostingReview } = program;
  const nextProgram: PolicePostingProgramState = {
    ...programWithoutPostingReview,
    processStage,
    completedEvidenceTags: evaluation.completedEvidenceTags,
    blockingReasons: reviewNotBefore
      ? [...new Set([...evaluation.blockingReasons, reviewBlockingReason(reviewNotBefore)])]
      : evaluation.blockingReasons,
    ...(reviewNotBefore ? { reviewNotBefore } : {}),
    lastEvaluatedAt: cloneTime(state.time),
    ...(processStage !== program.processStage || collected.acceptedEventTypes.size > 0
      ? { lastProgressTurnId: input.turnId }
      : {})
  };
  return {
    ...state,
    policePanel: {
      ...state.policePanel,
      careerPath: {
        ...state.policePanel.careerPath,
        postingProgress: nextProgram,
        updatedAt: cloneTime(state.time)
      },
      updatedAt: cloneTime(state.time)
    }
  };
}

export function applyPoliceCareerProgress(input: {
  beforeState: RuntimeState;
  afterState: RuntimeState;
  patch?: PoliceCareerProgressPatch;
  roleProfilePatch?: PlayerPoliceRoleProfilePatch;
  attemptedDirectRank?: string;
  turnId: TurnId;
}): PoliceCareerApplyResult {
  if (!isPromotionBound(input.beforeState)) {
    return { state: input.afterState, diagnostics: [] };
  }
  const diagnostics: StoryDiagnosticIssue[] = [];
  if (input.attemptedDirectRank?.trim()) {
    diagnostics.push({
      path: ['writeback', 'playerPatch', 'policePanel', 'careerPath', 'currentRank'],
      code: 'police_rank_direct_write_blocked',
      message: 'Direct formal rank writeback was ignored because the bound promotion DLC requires a locally accepted appointment.'
    });
  }
  if (
    input.beforeState.player.currentIdentity !== 'police' ||
    input.beforeState.lawIdentity.status !== 'active'
  ) {
    if (input.patch || input.roleProfilePatch) {
      diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch'],
        code: 'police_career_identity_inactive',
        message: 'Promotion and posting progress requires the player current public identity to be an active police identity.'
      });
    }
    return { state: input.afterState, diagnostics };
  }
  let state = normalizePoliceCareerProgress(input.afterState);
  if (!isPromotionActive(input.beforeState)) {
    if (input.patch || (input.roleProfilePatch && isStructuralRoleChange(state, input.roleProfilePatch))) {
      diagnostics.push({
        path: ['writeback', 'policeCareerProgressPatch'],
        code: 'police_career_progress_inactive',
        message: 'New promotion or posting progress is disabled while the bound system DLC is not active.'
      });
    } else {
      state = applyNonStructuralRolePatch(state, input.roleProfilePatch, diagnostics);
    }
    return { state, diagnostics };
  }
  if (!input.patch) {
    return {
      state: applyNonStructuralRolePatch(state, input.roleProfilePatch, diagnostics),
      diagnostics
    };
  }
  if (input.patch.kind === 'promotion') {
    state = applyPromotion({
      before: input.beforeState,
      after: state,
      patch: input.patch,
      rolePatch: input.roleProfilePatch,
      turnId: input.turnId,
      diagnostics
    });
  } else {
    state = applyPosting({
      before: input.beforeState,
      after: state,
      patch: input.patch,
      rolePatch: input.roleProfilePatch,
      turnId: input.turnId,
      diagnostics
    });
  }
  return { state, diagnostics };
}

export function formatPoliceCareerProgressForPrompt(state: RuntimeState): string[] {
  if (!isPromotionBound(state)) return [];
  const program = state.policePanel.careerPath.promotionProgress;
  const posting = state.policePanel.careerPath.postingProgress;
  const lines = [
    `警队晋升程序：DLC=${isPromotionActive(state) ? 'active' : 'inactive'}。正式警衔与岗位只能经本地程序门禁变更。`
  ];
  if (program) {
    lines.push(
      `晋升路线=${program.routeId}；阶段=${program.processStage}；目标=${program.targetRankCode}；空缺=${program.vacancyStatus}；合法下一阶段=${program.lawfulNextStages.join(',') || '无'}。`,
      `晋升条件=${program.requirements.map((item) => `${item.requirementId}:${item.status}`).join(',')}。`,
      ...(program.reviewNotBefore
        ? [`晋升复评不早于=${formatReviewDeadline(program.reviewNotBefore)}；等待不会自动补造通过、推荐、空缺或任命。`]
        : [])
    );
  }
  if (posting) {
    lines.push(
      `调动路线=${posting.routeId}；阶段=${posting.processStage}；目标部门=${posting.targetDepartment}；空缺=${posting.vacancyStatus}。`,
      ...(posting.reviewNotBefore
        ? [`调动复评或下一安排不早于=${formatReviewDeadline(posting.reviewNotBefore)}。`]
        : [])
    );
  }
  return lines;
}

export { isPromotionBound as isPolicePromotionDlcBound };
