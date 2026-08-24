import { describe, expect, it } from 'vitest';
import type {
  PoliceCareerEvidenceState,
  PolicePromotionProgramState,
  RuntimeState,
  TurnId
} from '../runtime/types';
import { createInitialRuntimeState, withRuntimeDefaults } from '../runtime/initialState';
import type { PlayerPoliceRoleProfilePatch } from '../identity/playerPoliceRoleProfile';
import {
  applyPoliceCareerProgress,
  normalizePoliceCareerProgress,
  type PoliceCareerProgressPatch
} from './policeCareerProgress';
import { POLICE_PROMOTION_DLC_ID } from './policePromotionRules';
import { resolvePoliceRankCode } from './policeRankCatalog';
import { projectPoliceDutyContext } from './policeDutyContext';

const turn = (value: string) => value as TurnId;

function boundState(status: 'active' | 'paused' | 'completed' = 'active'): RuntimeState {
  const base = createInitialRuntimeState();
  return normalizePoliceCareerProgress({
    ...base,
    world: {
      ...base.world,
      officialDlcBindings: [
        {
          dlcId: POLICE_PROMOTION_DLC_ID,
          version: '0.1.0',
          status
        }
      ]
    }
  });
}

function evidence(
  kind: PoliceCareerEvidenceState['kind'],
  refId: string,
  options: Partial<PoliceCareerEvidenceState> = {}
): PoliceCareerEvidenceState {
  return {
    kind,
    refId,
    canonicalRefId: refId,
    canonicalFactId: `career:${refId}`,
    result: 'successful',
    ...options
  };
}

function withPromotionProgram(
  state: RuntimeState,
  updates: Partial<PolicePromotionProgramState>
): RuntimeState {
  const program = state.policePanel.careerPath.promotionProgress;
  if (!program) throw new Error('expected a promotion program');
  return {
    ...state,
    policePanel: {
      ...state.policePanel,
      careerPath: {
        ...state.policePanel.careerPath,
        promotionProgress: { ...program, ...updates }
      }
    }
  };
}

function appointmentReadyState(): RuntimeState {
  const state = boundState();
  return withPromotionProgram(state, {
    processStage: 'approved_waiting_post',
    vacancyStatus: 'allocated',
    evidence: [
      evidence('case_activity', 'case-1', { turnId: turn('turn_1') }),
      evidence('judgement', 'check-1', { turnId: turn('turn_2') }),
      evidence('exam', 'exam-1', { tags: ['promotion_exam_passed'] }),
      evidence('course', 'course-1', { tags: ['promotion_course_completed'] }),
      evidence('supervisor_assessment', 'recommendation-1', {
        tags: ['formal_recommendation']
      }),
      evidence('selection', 'selection-1', {
        tags: ['promotion_selection_passed']
      })
    ]
  });
}

function appointmentPatch(): PoliceCareerProgressPatch {
  return {
    kind: 'promotion',
    routeId: 'hk1988_pc_to_sgt',
    requestedStage: 'appointed',
    reason: '正式任命已经生效。',
    events: [
      {
        eventId: 'appointment-turn-9',
        eventType: 'appointment_effective',
        summary: '正式警长任命与报到生效。'
      }
    ]
  };
}

describe('police career progress', () => {
  it('keeps unbound saves unchanged and initializes bound old saves conservatively', () => {
    const unbound = createInitialRuntimeState();
    expect(normalizePoliceCareerProgress(unbound)).toBe(unbound);

    const oldBound = {
      ...unbound,
      world: {
        ...unbound.world,
        officialDlcBindings: [
          { dlcId: POLICE_PROMOTION_DLC_ID, version: '0.1.0', status: 'active' as const }
        ]
      }
    };
    const loaded = withRuntimeDefaults(oldBound);
    expect(loaded.policePanel.careerPath.promotionProgress?.processStage).toBe(
      'not_eligible'
    );
    expect(loaded.policePanel.careerPath.promotionProgress?.evidence).toEqual([]);
    expect(loaded.policePanel.careerPath.promotionProgress?.vacancyStatus).toBe('unknown');
  });

  it('does not run the bound police program while police is not the active public identity', () => {
    const policeState = boundState();
    const state: RuntimeState = {
      ...policeState,
      player: {
        ...policeState.player,
        currentIdentity: 'civilian'
      }
    };
    const result = applyPoliceCareerProgress({
      beforeState: state,
      afterState: state,
      patch: {
        kind: 'promotion',
        routeId: 'hk1988_pc_to_sgt',
        requestedStage: 'eligible',
        events: [],
        reason: '当前公开身份不是警察。'
      },
      turnId: turn('turn_identity_inactive')
    });

    expect(result.state).toBe(state);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'police_career_identity_inactive' })
      ])
    );
  });

  it('preserves an existing structured program across save normalization', () => {
    const before = withPromotionProgram(boundState(), {
      processStage: 'exam_or_course',
      vacancyStatus: 'expected',
      evidence: [
        evidence('case_activity', 'case-save-1', { turnId: turn('turn_save_1') }),
        evidence('judgement', 'check-save-1', { turnId: turn('turn_save_2') })
      ],
      processedEventIds: ['event-save-1'],
      lastProgressTurnId: turn('turn_save_2')
    });

    const loaded = withRuntimeDefaults(before);

    expect(loaded.policePanel.careerPath.promotionProgress?.routeId).toBe(
      'hk1988_pc_to_sgt'
    );
    expect(loaded.policePanel.careerPath.promotionProgress?.processStage).toBe(
      'exam_or_course'
    );
    expect(
      loaded.policePanel.careerPath.promotionProgress?.evidence.map((item) => item.refId)
    ).toEqual(['case-save-1', 'check-save-1']);
    expect(loaded.policePanel.careerPath.promotionProgress?.processedEventIds).toEqual([
      'event-save-1'
    ]);
    expect(loaded.policePanel.careerPath.promotionProgress?.lastProgressTurnId).toBe(
      'turn_save_2'
    );
  });

  it('accepts only an applied current-turn judgement as objective evidence', () => {
    const before = boundState();
    const checkId = 'check-career-1';
    const after: RuntimeState = {
      ...before,
      judgementChecks: {
        ...before.judgementChecks,
        [checkId]: {
          checkId,
          turnId: turn('turn_3'),
          gameTime: { ...before.time },
          title: '现场处置',
          category: 'observation',
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          difficulty: 50,
          score: 65,
          margin: 15,
          outcome: 'success',
          shortSummary: '完成现场处置。',
          factors: [],
          visibility: 'player_known'
        }
      }
    };
    const patch: PoliceCareerProgressPatch = {
      kind: 'promotion',
      routeId: 'hk1988_pc_to_sgt',
      reason: '记录本回合正式表现。',
      events: [
        {
          eventId: 'career-judgement-1',
          eventType: 'judgement_recorded',
          summary: '本回合处置记录。',
          supportRef: { kind: 'judgement', refId: checkId }
        }
      ]
    };
    const accepted = applyPoliceCareerProgress({
      beforeState: before,
      afterState: after,
      patch,
      turnId: turn('turn_3')
    });
    expect(
      accepted.state.policePanel.careerPath.promotionProgress?.evidence.some(
        (item) => item.kind === 'judgement' && item.refId === checkId
      )
    ).toBe(true);

    const stale = applyPoliceCareerProgress({
      beforeState: after,
      afterState: after,
      patch: { ...patch, events: [{ ...patch.events[0], eventId: 'career-judgement-stale' }] },
      turnId: turn('turn_4')
    });
    expect(stale.diagnostics.some((item) => item.code === 'police_career_evidence_not_applied')).toBe(
      true
    );
  });

  it('does not accept an oral recommendation from an unknown or non-supervising actor', () => {
    const before = withPromotionProgram(boundState(), {
      processStage: 'awaiting_recommendation'
    });
    const result = applyPoliceCareerProgress({
      beforeState: before,
      afterState: before,
      patch: {
        kind: 'promotion',
        routeId: 'hk1988_pc_to_sgt',
        reason: '有人口头表示支持。',
        events: [
          {
            eventId: 'recommendation-unknown',
            eventType: 'formal_recommendation',
            actorId: 'npc_unknown',
            summary: '未知人物声称推荐玩家。'
          }
        ]
      },
      turnId: turn('turn_5')
    });
    expect(result.state.policePanel.careerPath.promotionProgress?.evidence).toHaveLength(0);
    expect(result.diagnostics.some((item) => item.code === 'police_career_evidence_not_applied')).toBe(
      true
    );
  });

  it('applies a formal appointment to rank, actor profile and police panel in one result', () => {
    const before = appointmentReadyState();
    const result = applyPoliceCareerProgress({
      beforeState: before,
      afterState: before,
      patch: appointmentPatch(),
      turnId: turn('turn_9')
    });
    expect(resolvePoliceRankCode(result.state.lawIdentity.rank)).toBe('sgt');
    expect(
      resolvePoliceRankCode(result.state.actors[result.state.player.actorId].roleProfiles.police?.rank)
    ).toBe('sgt');
    expect(resolvePoliceRankCode(result.state.policePanel.careerPath.currentRank)).toBe('sgt');
    expect(result.state.policePanel.careerPath.promotionProgress?.processStage).toBe('appointed');
    expect(result.diagnostics.some((item) => item.code === 'police_promotion_appointment_applied')).toBe(
      true
    );
  });

  it('rolls back appointment evidence and rank when the paired role change is invalid', () => {
    const before = appointmentReadyState();
    const invalidRolePatch: PlayerPoliceRoleProfilePatch = {
      reason: '试图在晋升时夹带跨部门调动。',
      stationOrPost: 'CID Headquarters',
      department: 'Criminal Investigation Department',
      assignmentSummary: 'CID investigation',
      postRole: 'Detective'
    };
    const result = applyPoliceCareerProgress({
      beforeState: before,
      afterState: before,
      patch: appointmentPatch(),
      roleProfilePatch: invalidRolePatch,
      turnId: turn('turn_9')
    });
    expect(resolvePoliceRankCode(result.state.lawIdentity.rank)).toBe('pc');
    expect(result.state.policePanel.careerPath.promotionProgress?.processStage).toBe(
      'approved_waiting_post'
    );
    expect(
      result.state.policePanel.careerPath.promotionProgress?.evidence.some(
        (item) => item.kind === 'appointment'
      )
    ).toBe(false);
    expect(result.diagnostics.some((item) => item.code === 'police_appointment_role_patch_rejected')).toBe(
      true
    );
  });

  it('applies a posting atomically without changing formal rank', () => {
    const before = boundState();
    const postingProgram = {
      routeId: 'hk1988_uniform_to_cid',
      worldpackId: 'hk_1988',
      sourceDepartment: 'uniform',
      targetDepartment: 'cid',
      processStage: 'approved_waiting_report' as const,
      vacancyStatus: 'allocated' as const,
      evidence: [
        evidence('case_activity', 'posting-evidence-1', {
          tags: ['reliable_service', 'detective_training', 'formal_recommendation']
        })
      ],
      processedEventIds: [],
      completedEvidenceTags: ['reliable_service', 'formal_recommendation', 'detective_training'],
      blockingReasons: [],
      lastEvaluatedAt: { ...before.time }
    };
    const seeded: RuntimeState = {
      ...before,
      policePanel: {
        ...before.policePanel,
        careerPath: { ...before.policePanel.careerPath, postingProgress: postingProgram }
      }
    };
    const rolePatch: PlayerPoliceRoleProfilePatch = {
      reason: 'CID 调动与报到已经正式生效。',
      stationOrPost: '旺角警署刑事侦缉队',
      department: 'Criminal Investigation Department',
      assignmentSummary: '刑事侦缉工作',
      postRole: 'Detective',
      dutySummary: '负责案件调查、证人联络、线索核查与案卷工作。'
    };
    const result = applyPoliceCareerProgress({
      beforeState: seeded,
      afterState: seeded,
      patch: {
        kind: 'posting',
        routeId: 'hk1988_uniform_to_cid',
        requestedStage: 'effective',
        reason: '正式调动生效。',
        events: [
          {
            eventId: 'posting-effective-1',
            eventType: 'posting_effective',
            summary: 'CID 报到生效。'
          }
        ]
      },
      roleProfilePatch: rolePatch,
      turnId: turn('turn_10')
    });
    expect(resolvePoliceRankCode(result.state.lawIdentity.rank)).toBe('pc');
    expect(result.state.lawIdentity.department).toBe('Criminal Investigation Department');
    expect(result.state.lawIdentity.dutySummary).toContain('案件调查');
    expect(result.state.policePanel.careerPath.postingProgress?.processStage).toBe('effective');
    const duty = projectPoliceDutyContext({
      time: result.state.time,
      currentIdentity: result.state.player.currentIdentity,
      lawIdentity: result.state.lawIdentity
    });
    expect(duty.shiftLabel).toBe('日勤');
    expect(duty.rosterSummary).toContain('周一至周五');
  });

  it('rejects a formal posting that omits the new duty summary', () => {
    const before = boundState();
    const postingProgram = {
      routeId: 'hk1988_uniform_to_cid',
      worldpackId: 'hk_1988',
      sourceDepartment: 'uniform',
      targetDepartment: 'cid',
      processStage: 'approved_waiting_report' as const,
      vacancyStatus: 'allocated' as const,
      evidence: [
        evidence('case_activity', 'posting-evidence-duty', {
          tags: ['reliable_service', 'detective_training', 'formal_recommendation']
        })
      ],
      processedEventIds: [],
      completedEvidenceTags: ['reliable_service', 'formal_recommendation', 'detective_training'],
      blockingReasons: [],
      lastEvaluatedAt: { ...before.time }
    };
    const seeded: RuntimeState = {
      ...before,
      policePanel: {
        ...before.policePanel,
        careerPath: { ...before.policePanel.careerPath, postingProgress: postingProgram }
      }
    };
    const result = applyPoliceCareerProgress({
      beforeState: seeded,
      afterState: seeded,
      patch: {
        kind: 'posting',
        routeId: 'hk1988_uniform_to_cid',
        requestedStage: 'effective',
        reason: '正式调动生效。',
        events: [
          {
            eventId: 'posting-effective-without-duty',
            eventType: 'posting_effective',
            summary: 'CID 报到生效。'
          }
        ]
      },
      roleProfilePatch: {
        reason: 'CID 调动与报到已经正式生效。',
        stationOrPost: '旺角警署刑事侦缉队',
        department: 'Criminal Investigation Department',
        assignmentSummary: '刑事侦缉工作',
        postRole: 'Detective'
      },
      turnId: turn('turn_posting_without_duty')
    });

    expect(result.state).toStrictEqual(seeded);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'police_posting_effective_patch_rejected' })
      ])
    );
  });

  it('does not let one training event forge unrelated posting evidence tags', () => {
    const before = boundState();
    const seeded: RuntimeState = {
      ...before,
      policePanel: {
        ...before.policePanel,
        careerPath: {
          ...before.policePanel.careerPath,
          postingProgress: {
            routeId: 'hk1988_uniform_to_cid',
            worldpackId: 'hk_1988',
            sourceDepartment: 'uniform',
            targetDepartment: 'cid',
            processStage: 'training',
            vacancyStatus: 'unknown',
            evidence: [],
            processedEventIds: [],
            completedEvidenceTags: [],
            blockingReasons: [],
            lastEvaluatedAt: { ...before.time }
          }
        }
      }
    };
    const result = applyPoliceCareerProgress({
      beforeState: seeded,
      afterState: seeded,
      patch: {
        kind: 'posting',
        routeId: 'hk1988_uniform_to_cid',
        requestedStage: 'awaiting_vacancy',
        reason: '完成侦缉课程，但不能把课程伪装成服务记录或上级推荐。',
        events: [
          {
            eventId: 'cid-course-with-forged-tags',
            eventType: 'course_completed',
            summary: '侦缉课程已经完成。',
            tags: ['detective_training', 'reliable_service', 'formal_recommendation']
          }
        ]
      },
      turnId: turn('turn_cid_course_tags')
    });

    expect(
      result.state.policePanel.careerPath.postingProgress?.evidence.flatMap(
        (candidate) => candidate.tags ?? []
      )
    ).toEqual(expect.arrayContaining(['detective_training']));
    expect(
      result.state.policePanel.careerPath.postingProgress?.evidence.flatMap(
        (candidate) => candidate.tags ?? []
      )
    ).not.toEqual(expect.arrayContaining(['reliable_service', 'formal_recommendation']));
    expect(result.state.policePanel.careerPath.postingProgress?.processStage).toBe('training');
    expect(
      result.diagnostics.filter(
        (candidate) => candidate.code === 'police_posting_evidence_tag_rejected'
      )
    ).toHaveLength(2);
  });

  it('keeps a completed training route waiting until a separate vacancy is confirmed', () => {
    const before = boundState();
    const seeded: RuntimeState = {
      ...before,
      policePanel: {
        ...before.policePanel,
        careerPath: {
          ...before.policePanel.careerPath,
          postingProgress: {
            routeId: 'hk1988_uniform_to_cid',
            worldpackId: 'hk_1988',
            sourceDepartment: 'uniform',
            targetDepartment: 'cid',
            processStage: 'training',
            vacancyStatus: 'unknown',
            evidence: [
              evidence('case_activity', 'cid-reliable-service', {
                tags: ['reliable_service']
              }),
              evidence('supervisor_assessment', 'cid-formal-recommendation', {
                tags: ['formal_recommendation']
              })
            ],
            processedEventIds: [],
            completedEvidenceTags: ['reliable_service', 'formal_recommendation'],
            blockingReasons: [],
            lastEvaluatedAt: { ...before.time }
          }
        }
      }
    };
    const trained = applyPoliceCareerProgress({
      beforeState: seeded,
      afterState: seeded,
      patch: {
        kind: 'posting',
        routeId: 'hk1988_uniform_to_cid',
        requestedStage: 'awaiting_vacancy',
        reason: '侦缉训练完成，下一步等待岗位空缺。',
        events: [
          {
            eventId: 'cid-training-completed',
            eventType: 'training_completed',
            summary: '侦缉训练完成。',
            tags: ['detective_training']
          }
        ]
      },
      turnId: turn('turn_cid_training_complete')
    });

    expect(trained.state.policePanel.careerPath.postingProgress).toMatchObject({
      processStage: 'awaiting_vacancy',
      vacancyStatus: 'unknown'
    });

    const noVacancy = applyPoliceCareerProgress({
      beforeState: trained.state,
      afterState: trained.state,
      patch: {
        kind: 'posting',
        routeId: 'hk1988_uniform_to_cid',
        requestedStage: 'approved_waiting_report',
        reason: '没有新空缺事实，不能获批。',
        events: []
      },
      turnId: turn('turn_cid_no_vacancy')
    });

    expect(noVacancy.state.policePanel.careerPath.postingProgress?.processStage).toBe(
      'awaiting_vacancy'
    );
    expect(noVacancy.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'police_posting_stage_rejected' })])
    );
  });

  it('blocks progress while paused and deduplicates accepted procedural event ids', () => {
    const paused = boundState('paused');
    const patch: PoliceCareerProgressPatch = {
      kind: 'promotion',
      routeId: 'hk1988_pc_to_sgt',
      reason: '不应在暂停状态推进。',
      events: []
    };
    const blocked = applyPoliceCareerProgress({
      beforeState: paused,
      afterState: paused,
      patch,
      turnId: turn('turn_11')
    });
    expect(blocked.diagnostics.some((item) => item.code === 'police_career_progress_inactive')).toBe(
      true
    );

    const active = withPromotionProgram(boundState(), { processStage: 'exam_or_course' });
    const examPatch: PoliceCareerProgressPatch = {
      kind: 'promotion',
      routeId: 'hk1988_pc_to_sgt',
      reason: '记录考试。',
      events: [
        {
          eventId: 'exam-dedupe-1',
          eventType: 'exam_passed',
          summary: '通过考试。'
        }
      ]
    };
    const first = applyPoliceCareerProgress({
      beforeState: active,
      afterState: active,
      patch: examPatch,
      turnId: turn('turn_12')
    });
    const second = applyPoliceCareerProgress({
      beforeState: first.state,
      afterState: first.state,
      patch: examPatch,
      turnId: turn('turn_13')
    });
    expect(first.state.policePanel.careerPath.promotionProgress?.processedEventIds).toContain(
      'exam-dedupe-1'
    );
    expect(second.diagnostics.some((item) => item.code === 'police_career_duplicate_event_ignored')).toBe(
      true
    );
    expect(
      second.state.policePanel.careerPath.promotionProgress?.evidence.filter(
        (item) => item.refId === 'exam-dedupe-1'
      )
    ).toHaveLength(1);
  });

  it('records and blocks direct rank bypass attempts only for bound saves', () => {
    const bound = boundState();
    const blocked = applyPoliceCareerProgress({
      beforeState: bound,
      afterState: bound,
      attemptedDirectRank: '警长',
      turnId: turn('turn_14')
    });
    expect(resolvePoliceRankCode(blocked.state.lawIdentity.rank)).toBe('pc');
    expect(blocked.diagnostics.some((item) => item.code === 'police_rank_direct_write_blocked')).toBe(
      true
    );

    const unbound = createInitialRuntimeState();
    const unchanged = applyPoliceCareerProgress({
      beforeState: unbound,
      afterState: unbound,
      attemptedDirectRank: '警长',
      turnId: turn('turn_14')
    });
    expect(unchanged.state).toBe(unbound);
    expect(unchanged.diagnostics).toEqual([]);
  });
});
