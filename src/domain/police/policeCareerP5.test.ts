import { describe, expect, it } from 'vitest';
import type {
  GameTime,
  PoliceCareerEvidenceState,
  PolicePostingProgramState,
  RuntimeState,
  TurnId
} from '../runtime/types';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { PlayerPoliceRoleProfilePatch } from '../identity/playerPoliceRoleProfile';
import {
  applyPoliceCareerProgress,
  normalizePoliceCareerProgress,
  type PoliceCareerProgressPatch
} from './policeCareerProgress';
import { projectPolicePostingOpportunities } from './policePostingContent';
import { POLICE_PROMOTION_DLC_ID } from './policePromotionRules';
import { resolvePoliceRankCode } from './policeRankCatalog';

const turn = (value: string) => value as TurnId;

function addDays(time: GameTime, days: number): GameTime {
  const value = new Date(
    Date.UTC(time.year, time.month - 1, time.day + days, time.hour, time.minute)
  );
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: value.getUTCHours(),
    minute: value.getUTCMinutes()
  };
}

function boundState(): RuntimeState {
  const base = createInitialRuntimeState();
  return normalizePoliceCareerProgress({
    ...base,
    world: {
      ...base.world,
      officialDlcBindings: [
        { dlcId: POLICE_PROMOTION_DLC_ID, version: '0.1.0', status: 'active' }
      ]
    }
  });
}

function evidence(
  kind: PoliceCareerEvidenceState['kind'],
  refId: string,
  tags: string[],
  turnId?: string
): PoliceCareerEvidenceState {
  return {
    kind,
    refId,
    canonicalRefId: refId,
    canonicalFactId: `career:${refId}`,
    result: 'successful',
    tags,
    ...(turnId ? { turnId: turn(turnId) } : {})
  };
}

function withSupervisor(state: RuntimeState): { state: RuntimeState; supervisorId: string } {
  const supervisorId = 'npc_police_career_supervisor';
  const playerActor = state.actors[state.player.actorId];
  return {
    supervisorId,
    state: {
      ...state,
      actors: {
        ...state.actors,
        [supervisorId]: {
          ...playerActor,
          actorId: supervisorId,
          name: '陈国强',
          aliases: ['陈沙展']
        }
      },
      lawIdentity: {
        ...state.lawIdentity,
        supervisorActorIds: [supervisorId]
      }
    }
  };
}

function ptuState(): RuntimeState {
  const base = boundState();
  const reviewNotBefore = addDays(base.time, 21);
  const postingProgress: PolicePostingProgramState = {
    routeId: 'hk1988_uniform_to_ptu_rotation',
    worldpackId: 'hk_1988',
    sourceDepartment: 'uniform',
    targetDepartment: 'ptu',
    processStage: 'effective',
    vacancyStatus: 'allocated',
    evidence: [],
    processedEventIds: ['ptu-posting-effective'],
    completedEvidenceTags: [
      'physical_discipline_clear',
      'ptu_training_slot',
      'ptu_course_completed',
      'rotation_arranged'
    ],
    blockingReasons: [],
    reviewNotBefore,
    lastEvaluatedAt: { ...base.time },
    lastProgressTurnId: turn('turn_ptu_effective')
  };
  const playerActor = base.actors[base.player.actorId];
  return {
    ...base,
    lawIdentity: {
      ...base.lawIdentity,
      stationOrPost: '警察机动部队驻队基地',
      department: 'Police Tactical Unit (PTU)',
      assignmentSummary: 'PTU 阶段性驻队与公共秩序支援',
      dutySummary: '执行 PTU 训练、公共秩序和区域增援轮班。'
    },
    actors: {
      ...base.actors,
      [base.player.actorId]: {
        ...playerActor,
        roleProfiles: {
          ...playerActor.roleProfiles,
          police: {
            ...playerActor.roleProfiles.police!,
            stationOrPost: '警察机动部队驻队基地',
            department: 'Police Tactical Unit (PTU)',
            assignmentSummary: 'PTU 阶段性驻队与公共秩序支援',
            dutySummary: '执行 PTU 训练、公共秩序和区域增援轮班。'
          }
        }
      }
    },
    policePanel: {
      ...base.policePanel,
      careerPath: {
        ...base.policePanel.careerPath,
        postingProgress
      }
    }
  };
}

function applyPostingStep(
  state: RuntimeState,
  patch: PoliceCareerProgressPatch,
  turnId: string,
  roleProfilePatch?: PlayerPoliceRoleProfilePatch
): RuntimeState {
  return applyPoliceCareerProgress({
    beforeState: state,
    afterState: state,
    patch,
    roleProfilePatch,
    turnId: turn(turnId)
  }).state;
}

describe('police career P5 long-run contracts', () => {
  it('leaves the career state untouched when the player declines a projected transfer', () => {
    const state = boundState();
    expect(
      projectPolicePostingOpportunities(state, '我只想了解CID调动，但这次明确拒绝申请。')
        .opportunities
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ routeId: 'hk1988_uniform_to_cid' })])
    );

    const result = applyPoliceCareerProgress({
      beforeState: state,
      afterState: state,
      turnId: turn('turn_decline_posting')
    });
    expect(result.state.policePanel.careerPath.postingProgress).toBeUndefined();
    expect(result.state.lawIdentity.department).toBe(state.lawIdentity.department);
    expect(result.diagnostics).toEqual([]);
  });

  it('completes PC to SGT through evidence, waiting, allocation and one atomic appointment', () => {
    const base = boundState();
    const program = base.policePanel.careerPath.promotionProgress!;
    const { state: supervised, supervisorId } = withSupervisor({
      ...base,
      policePanel: {
        ...base.policePanel,
        careerPath: {
          ...base.policePanel.careerPath,
          promotionProgress: {
            ...program,
            evidence: [
              evidence('case_activity', 'promotion-case-record', [], 'turn_perf_1'),
              evidence('judgement', 'promotion-judgement-record', [], 'turn_perf_2')
            ]
          }
        }
      }
    });
    let state = normalizePoliceCareerProgress(supervised);

    const advance = (
      requestedStage: NonNullable<Extract<PoliceCareerProgressPatch, { kind: 'promotion' }>['requestedStage']>,
      events: Extract<PoliceCareerProgressPatch, { kind: 'promotion' }>['events'],
      turnId: string,
      roleProfilePatch?: PlayerPoliceRoleProfilePatch
    ) => {
      const result = applyPoliceCareerProgress({
        beforeState: state,
        afterState: state,
        patch: {
          kind: 'promotion',
          routeId: 'hk1988_pc_to_sgt',
          requestedStage,
          events,
          reason: `推进至 ${requestedStage} 的真实程序事实。`
        },
        roleProfilePatch,
        turnId: turn(turnId)
      });
      state = result.state;
      return result;
    };

    expect(state.policePanel.careerPath.promotionProgress?.lawfulNextStages).toContain('eligible');
    advance('eligible', [], 'turn_stage_eligible');
    advance('exam_or_course', [], 'turn_stage_exam');
    advance(
      'awaiting_recommendation',
      [
        {
          eventId: 'promotion-exam-pass',
          eventType: 'exam_passed',
          summary: '适用晋升考试已经通过。'
        },
        {
          eventId: 'promotion-course-pass',
          eventType: 'course_completed',
          summary: '适用晋升课程已经完成。'
        }
      ],
      'turn_stage_recommendation'
    );
    advance(
      'selection',
      [
        {
          eventId: 'promotion-formal-recommendation',
          eventType: 'formal_recommendation',
          actorId: supervisorId,
          summary: '直属上级提交正式推荐。'
        }
      ],
      'turn_stage_selection'
    );
    advance(
      'awaiting_vacancy',
      [
        {
          eventId: 'promotion-selection-pass',
          eventType: 'selection_passed',
          summary: '适用遴选已经通过。'
        }
      ],
      'turn_stage_waiting_vacancy'
    );

    const unavailable = advance(
      'approved_waiting_post',
      [
        {
          eventId: 'promotion-vacancy-unavailable',
          eventType: 'vacancy_unavailable',
          summary: '本轮没有可以分配的警长职位。'
        }
      ],
      'turn_stage_vacancy_unavailable'
    );
    expect(unavailable.state.policePanel.careerPath.promotionProgress).toMatchObject({
      processStage: 'awaiting_vacancy',
      vacancyStatus: 'unavailable',
      reviewNotBefore: addDays(base.time, 7)
    });

    state = normalizePoliceCareerProgress({ ...state, time: addDays(base.time, 7) });
    advance(
      'approved_waiting_post',
      [
        {
          eventId: 'promotion-vacancy-allocated',
          eventType: 'vacancy_allocated',
          summary: '一个警长职位已经正式分配给玩家。'
        }
      ],
      'turn_stage_post_allocated'
    );
    const appointed = advance(
      'appointed',
      [
        {
          eventId: 'promotion-appointment-effective',
          eventType: 'appointment_effective',
          summary: '警长任命与新岗位报到正式生效。'
        }
      ],
      'turn_stage_appointed',
      {
        reason: '正式晋升后在原军装单位担任巡逻警长。',
        stationOrPost: '旺角警署',
        department: 'Uniform Branch',
        assignmentSummary: '带领军装巡逻小队并负责当值现场协调',
        postRole: 'Patrol Sergeant',
        dutySummary: '带领巡逻小队、分派现场任务、审核交接并承担警长职责。'
      }
    );

    expect(appointed.state.policePanel.careerPath.promotionProgress?.processStage).toBe(
      'appointed'
    );
    expect(resolvePoliceRankCode(appointed.state.lawIdentity.rank)).toBe('sgt');
    expect(appointed.state.actors[appointed.state.player.actorId].roleProfiles.police?.postRole).toBe(
      'Patrol Sergeant'
    );
    expect(appointed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'police_promotion_appointment_applied' })
      ])
    );
  });

  it('keeps valid conditions after a declined recommendation and reopens review after seven days', () => {
    const seeded = boundState();
    const promotion = seeded.policePanel.careerPath.promotionProgress!;
    const prepared: RuntimeState = {
      ...seeded,
      policePanel: {
        ...seeded.policePanel,
        careerPath: {
          ...seeded.policePanel.careerPath,
          promotionProgress: {
            ...promotion,
            processStage: 'awaiting_recommendation',
            evidence: [
              evidence('exam', 'exam-pass-existing', ['promotion_exam_passed']),
              evidence('course', 'course-pass-existing', ['promotion_course_completed'])
            ]
          }
        }
      }
    };
    const { state: before, supervisorId } = withSupervisor(prepared);
    const declined = applyPoliceCareerProgress({
      beforeState: before,
      afterState: before,
      patch: {
        kind: 'promotion',
        routeId: 'hk1988_pc_to_sgt',
        requestedStage: 'selection',
        reason: '直属上级本轮没有给予正式推荐，等待下一次评估。',
        events: [
          {
            eventId: 'recommendation-declined-1',
            eventType: 'recommendation_declined',
            actorId: supervisorId,
            summary: '直属上级确认本轮暂不推荐。'
          }
        ]
      },
      turnId: turn('turn_recommendation_declined')
    });

    expect(declined.state.policePanel.careerPath.promotionProgress).toMatchObject({
      processStage: 'awaiting_recommendation',
      reviewNotBefore: addDays(before.time, 7)
    });
    expect(
      declined.state.policePanel.careerPath.promotionProgress?.evidence.map((item) => item.refId)
    ).toEqual(expect.arrayContaining(['exam-pass-existing', 'course-pass-existing']));
    expect(declined.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'police_career_review_cooldown' })])
    );

    const duringCooldown: RuntimeState = {
      ...declined.state,
      time: addDays(before.time, 1)
    };
    const recommended = applyPoliceCareerProgress({
      beforeState: duringCooldown,
      afterState: duringCooldown,
      patch: {
        kind: 'promotion',
        routeId: 'hk1988_pc_to_sgt',
        requestedStage: 'selection',
        reason: '推荐事实可以记录，但冷却期内不能推进程序。',
        events: [
          {
            eventId: 'recommendation-later-1',
            eventType: 'formal_recommendation',
            actorId: supervisorId,
            summary: '直属上级随后提交了正式推荐。'
          }
        ]
      },
      turnId: turn('turn_recommendation_during_cooldown')
    });
    expect(recommended.state.policePanel.careerPath.promotionProgress?.processStage).toBe(
      'awaiting_recommendation'
    );

    const reviewDate = normalizePoliceCareerProgress({
      ...recommended.state,
      time: addDays(before.time, 7)
    });
    expect(reviewDate.policePanel.careerPath.promotionProgress?.reviewNotBefore).toBeUndefined();
    expect(reviewDate.policePanel.careerPath.promotionProgress?.lawfulNextStages).toContain(
      'selection'
    );

    const resumed = applyPoliceCareerProgress({
      beforeState: reviewDate,
      afterState: reviewDate,
      patch: {
        kind: 'promotion',
        routeId: 'hk1988_pc_to_sgt',
        requestedStage: 'selection',
        reason: '复评日期已到，沿用有效条件进入遴选。',
        events: []
      },
      turnId: turn('turn_recommendation_review_reopened')
    });
    expect(resumed.state.policePanel.careerPath.promotionProgress?.processStage).toBe(
      'selection'
    );
  });

  it('holds a PTU rotation for its minimum period and returns through the same posting gate', () => {
    const initial = ptuState();
    expect(projectPolicePostingOpportunities(initial, '我想问归队安排')).toEqual({
      routeIndex: [],
      opportunities: []
    });

    const tooEarly = applyPoliceCareerProgress({
      beforeState: initial,
      afterState: initial,
      patch: {
        kind: 'posting',
        routeId: 'hk1988_ptu_rotation_return_to_uniform',
        requestedStage: 'interested',
        reason: '尚未到最早归队评估日期。',
        events: []
      },
      turnId: turn('turn_ptu_return_too_early')
    });
    expect(tooEarly.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'police_posting_review_cooldown' })])
    );
    expect(tooEarly.state.policePanel.careerPath.postingProgress?.routeId).toBe(
      'hk1988_uniform_to_ptu_rotation'
    );

    let state: RuntimeState = {
      ...initial,
      time: addDays(initial.time, 21)
    };
    expect(
      projectPolicePostingOpportunities(state, '核对PTU轮调结束后的归队安排').opportunities
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ routeId: 'hk1988_ptu_rotation_return_to_uniform' })
      ])
    );

    state = applyPostingStep(
      state,
      {
        kind: 'posting',
        routeId: 'hk1988_ptu_rotation_return_to_uniform',
        requestedStage: 'interested',
        reason: '询问归队程序。',
        events: []
      },
      'turn_ptu_return_interest'
    );
    state = applyPostingStep(
      state,
      {
        kind: 'posting',
        routeId: 'hk1988_ptu_rotation_return_to_uniform',
        requestedStage: 'eligible',
        reason: '当前正式警衔与来源部门符合归队路线。',
        events: []
      },
      'turn_ptu_return_eligible'
    );
    state = applyPostingStep(
      state,
      {
        kind: 'posting',
        routeId: 'hk1988_ptu_rotation_return_to_uniform',
        requestedStage: 'training',
        reason: '进入轮调完成和归队安排核验阶段。',
        events: []
      },
      'turn_ptu_return_training'
    );
    state = applyPostingStep(
      state,
      {
        kind: 'posting',
        routeId: 'hk1988_ptu_rotation_return_to_uniform',
        requestedStage: 'awaiting_vacancy',
        reason: '轮调完成且正式归队安排已经形成。',
        events: [
          {
            eventId: 'ptu-rotation-completed-1',
            eventType: 'training_completed',
            summary: 'PTU 阶段性驻队和轮调内容完成。',
            tags: ['ptu_rotation_completed']
          },
          {
            eventId: 'ptu-return-arranged-1',
            eventType: 'rotation_arranged',
            summary: '指挥链已经安排返回原属军装单位。',
            tags: ['return_arranged']
          }
        ]
      },
      'turn_ptu_return_evidence'
    );
    state = applyPostingStep(
      state,
      {
        kind: 'posting',
        routeId: 'hk1988_ptu_rotation_return_to_uniform',
        requestedStage: 'approved_waiting_report',
        reason: '归队获批，等待正式报到。',
        events: []
      },
      'turn_ptu_return_approved'
    );

    const rankBeforeReturn = resolvePoliceRankCode(state.lawIdentity.rank);
    const returned = applyPoliceCareerProgress({
      beforeState: state,
      afterState: state,
      patch: {
        kind: 'posting',
        routeId: 'hk1988_ptu_rotation_return_to_uniform',
        requestedStage: 'effective',
        reason: '已返回旺角警署军装巡逻岗位报到。',
        events: [
          {
            eventId: 'ptu-return-effective-1',
            eventType: 'posting_effective',
            summary: '归队和军装岗位报到正式生效。'
          }
        ]
      },
      roleProfilePatch: {
        reason: 'PTU 轮调结束，正式返回原属军装单位。',
        stationOrPost: '旺角警署',
        department: 'Uniform Branch',
        assignmentSummary: '军装巡逻与警署日常响应',
        postRole: 'Uniform Patrol Officer',
        dutySummary: '负责军装巡逻、报案处理、现场支援和获派警务工作。'
      },
      turnId: turn('turn_ptu_return_effective')
    });

    expect(returned.state.policePanel.careerPath.postingProgress).toMatchObject({
      routeId: 'hk1988_ptu_rotation_return_to_uniform',
      processStage: 'effective',
      reviewNotBefore: addDays(state.time, 14)
    });
    expect(returned.state.lawIdentity.department).toBe('Uniform Branch');
    expect(resolvePoliceRankCode(returned.state.lawIdentity.rank)).toBe(rankBeforeReturn);
    expect(returned.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'police_posting_applied' })])
    );
  });
});
