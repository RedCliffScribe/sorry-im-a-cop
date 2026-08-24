import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState, withRuntimeDefaults } from '../runtime/initialState';
import { POLICE_PROMOTION_DLC_ID } from '../police/policePromotionRules';
import { resolvePoliceRankCode } from '../police/policeRankCatalog';
import { PLAYER_POLICE_SALARY_CASHFLOW_ID } from '../finance/playerSalaryCashflow';
import type { PoliceCareerEvidenceState, TurnId } from '../runtime/types';
import { applyNarratorResponse } from './applyWriteback';
import { validateNarratorResponse } from './validateWriteback';

function bindPromotionDlc() {
  const state = createInitialRuntimeState();
  return withRuntimeDefaults({
    ...state,
    world: {
      ...state.world,
      officialDlcBindings: [
        {
          dlcId: POLICE_PROMOTION_DLC_ID,
          version: '0.1.0',
          status: 'active'
        }
      ]
    }
  });
}

describe('police career writeback integration', () => {
  it('soft-drops an invalid career module without discarding the turn', () => {
    const response = validateNarratorResponse({
      narrativeText: '值日官只记录了这次谈话，正式程序没有发生变化。',
      turnSummary: '玩家询问晋升条件。',
      writeback: {
        policeCareerProgressPatch: {
          kind: 'promotion',
          routeId: 'hk1988_pc_to_sgt',
          reason: '无效测试。',
          events: [
            {
              eventId: 'invalid-event',
              eventType: 'rank_up_immediately',
              summary: '非法事件类型。'
            }
          ]
        }
      }
    });
    expect(response.narrativeText).toContain('值日官');
    expect(response.writeback.policeCareerProgressPatch).toBeUndefined();
    expect(response.validationWarnings).toContainEqual(
      expect.objectContaining({
        path: expect.arrayContaining(['writeback', 'policeCareerProgressPatch'])
      })
    );
  });

  it('accepts the bounded posting qualification and allocation event vocabulary', () => {
    const response = validateNarratorResponse({
      narrativeText: '训练部门分别确认了资格、名额与轮调安排。',
      turnSummary: '本回合形成了可核验的岗位程序事实。',
      writeback: {
        policeCareerProgressPatch: {
          kind: 'posting',
          routeId: 'hk1988_uniform_to_ptu_rotation',
          reason: '记录本回合已经发生的程序事实。',
          events: [
            {
              eventId: 'qualification-1',
              eventType: 'qualification_confirmed',
              summary: '体能与纪律适任已确认。',
              tags: ['physical_discipline_clear']
            },
            {
              eventId: 'slot-1',
              eventType: 'training_slot_allocated',
              summary: '训练名额已正式分配。',
              tags: ['ptu_training_slot']
            },
            {
              eventId: 'rotation-1',
              eventType: 'rotation_arranged',
              summary: '驻队轮调安排已成立。',
              tags: ['rotation_arranged']
            },
            {
              eventId: 'unit-need-1',
              eventType: 'unit_need_confirmed',
              summary: '单位岗位需要已正式确认。',
              tags: ['unit_need']
            }
          ]
        }
      }
    });

    expect(response.writeback.policeCareerProgressPatch?.events.map((event) => event.eventType)).toEqual([
      'qualification_confirmed',
      'training_slot_allocated',
      'rotation_arranged',
      'unit_need_confirmed'
    ]);
  });

  it('accepts an explicit declined recommendation as a bounded career event', () => {
    const response = validateNarratorResponse({
      narrativeText: '直属上级说明本轮不会提交推荐，但既有考试和表现记录仍然保留。',
      turnSummary: '本轮推荐未通过，等待后续复评。',
      writeback: {
        policeCareerProgressPatch: {
          kind: 'promotion',
          routeId: 'hk1988_pc_to_sgt',
          reason: '记录本回合已经发生的推荐结果。',
          events: [
            {
              eventId: 'recommendation-declined-schema-1',
              eventType: 'recommendation_declined',
              actorId: 'npc_supervisor',
              summary: '直属上级正式确认本轮暂不推荐。'
            }
          ]
        }
      }
    });

    expect(response.writeback.policeCareerProgressPatch?.events).toEqual([
      expect.objectContaining({ eventType: 'recommendation_declined' })
    ]);
  });

  it('blocks direct rank writeback for a bound save while preserving other panel updates', () => {
    const state = bindPromotionDlc();
    const response = validateNarratorResponse({
      narrativeText: '上级说明仍需走正式程序。',
      turnSummary: '玩家获得一条口头评价，但没有正式任命。',
      writeback: {
        playerPatch: {
          policePanel: {
            careerPath: {
              currentRank: '警长 / Sergeant',
              dynamicAssessment: {
                supervisor: '直属上级认为玩家表现稳健。'
              }
            }
          }
        }
      }
    });
    const next = applyNarratorResponse(state, response);
    expect(resolvePoliceRankCode(next.lawIdentity.rank)).toBe('pc');
    expect(next.policePanel.careerPath.dynamicAssessment.supervisor).toContain('表现稳健');
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'police_rank_direct_write_blocked' })
    );
  });

  it('keeps legacy direct rank synchronization unchanged when the DLC is not bound', () => {
    const state = createInitialRuntimeState();
    const response = validateNarratorResponse({
      narrativeText: '旧路径的正式晋升公告生效。',
      turnSummary: '未绑定 DLC 的兼容存档沿用原有写回。',
      writeback: {
        playerPatch: {
          policePanel: {
            careerPath: {
              currentRank: '警长 / Sergeant'
            }
          }
        }
      }
    });
    const next = applyNarratorResponse(state, response);
    expect(resolvePoliceRankCode(next.lawIdentity.rank)).toBe('sgt');
    expect(resolvePoliceRankCode(next.actors.player.roleProfiles.police?.rank)).toBe('sgt');
  });

  it('atomically applies a formal appointment across rank mirrors, program state and salary', () => {
    const state = bindPromotionDlc();
    const program = state.policePanel.careerPath.promotionProgress;
    if (!program) throw new Error('expected a bound promotion program');
    const evidence: PoliceCareerEvidenceState[] = [
      {
        kind: 'case_activity',
        refId: 'case-activity-1',
        canonicalRefId: 'case-activity-1',
        canonicalFactId: 'case_activity:case-activity-1',
        turnId: 'turn_evidence_1' as TurnId,
        result: 'successful'
      },
      {
        kind: 'judgement',
        refId: 'judgement-1',
        canonicalRefId: 'judgement-1',
        canonicalFactId: 'judgement:judgement-1',
        turnId: 'turn_evidence_2' as TurnId,
        result: 'successful'
      },
      {
        kind: 'exam',
        refId: 'exam-1',
        canonicalRefId: 'exam-1',
        canonicalFactId: 'police_career:exam-1',
        result: 'successful',
        tags: ['promotion_exam_passed']
      },
      {
        kind: 'course',
        refId: 'course-1',
        canonicalRefId: 'course-1',
        canonicalFactId: 'police_career:course-1',
        result: 'successful',
        tags: ['promotion_course_completed']
      },
      {
        kind: 'supervisor_assessment',
        refId: 'recommendation-1',
        canonicalRefId: 'recommendation-1',
        canonicalFactId: 'police_career:recommendation-1',
        result: 'successful',
        tags: ['formal_recommendation']
      },
      {
        kind: 'selection',
        refId: 'selection-1',
        canonicalRefId: 'selection-1',
        canonicalFactId: 'police_career:selection-1',
        result: 'successful',
        tags: ['promotion_selection_passed']
      }
    ];
    state.policePanel.careerPath.promotionProgress = {
      ...program,
      processStage: 'approved_waiting_post',
      vacancyStatus: 'allocated',
      evidence
    };

    const response = validateNarratorResponse({
      narrativeText: '正式任命令宣读后，玩家以警长身份到原单位报到。',
      turnSummary: '警长任命在本回合正式生效。',
      writeback: {
        policeCareerProgressPatch: {
          kind: 'promotion',
          routeId: 'hk1988_pc_to_sgt',
          requestedStage: 'appointed',
          events: [
            {
              eventId: 'appointment-effective-1',
              eventType: 'appointment_effective',
              summary: '正式警长任命与报到同时生效。'
            }
          ],
          reason: '正式任命令已经生效。'
        }
      }
    });
    const next = applyNarratorResponse(state, response);

    expect(resolvePoliceRankCode(next.lawIdentity.rank)).toBe('sgt');
    expect(resolvePoliceRankCode(next.policePanel.careerPath.currentRank)).toBe('sgt');
    expect(resolvePoliceRankCode(next.actors.player.roleProfiles.police?.rank)).toBe('sgt');
    expect(next.policePanel.careerPath.promotionProgress?.processStage).toBe('appointed');
    expect(next.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.amount).toBe(5200);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'police_promotion_appointment_applied' })
    );
  });
});
