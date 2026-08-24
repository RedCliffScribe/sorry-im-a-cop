import { describe, expect, it } from 'vitest';
import {
  dedupePolicePromotionEvidence,
  evaluatePolicePosting,
  evaluatePolicePromotion,
  getPolicePromotionRoute,
  normalizePolicePromotionRank,
  type PolicePromotionEvaluationInput,
  type PolicePromotionEvidence
} from './policePromotionRules';

function evidence(
  kind: PolicePromotionEvidence['kind'],
  refId: string,
  options: Partial<PolicePromotionEvidence> = {}
): PolicePromotionEvidence {
  return {
    kind,
    refId,
    applied: true,
    result: 'successful',
    ...options
  };
}

function promotionInput(
  overrides: Partial<PolicePromotionEvaluationInput> = {}
): PolicePromotionEvaluationInput {
  return {
    enabled: true,
    worldpackId: 'hk_1988',
    currentRank: 'Police Constable（警员 PC）',
    serviceBasis: 'new_recruit',
    daysInCurrentRank: 30,
    vacancyStatus: 'unknown',
    evidence: [],
    ...overrides
  };
}

function completedPcEvidence(): PolicePromotionEvidence[] {
  return [
    evidence('case_activity', 'case-1', { turnId: 'turn-1' }),
    evidence('judgement', 'check-1', { turnId: 'turn-2' }),
    evidence('matter_progress', 'matter-1', { turnId: 'turn-3' }),
    evidence('exam', 'exam-1', { tags: ['promotion_exam_passed'] }),
    evidence('course', 'course-1', { tags: ['promotion_course_completed'] }),
    evidence('supervisor_assessment', 'assessment-1', {
      tags: ['formal_recommendation']
    }),
    evidence('selection', 'selection-1', { tags: ['promotion_selection_passed'] }),
    evidence('appointment', 'appointment-1', { tags: ['appointment_effective'] })
  ];
}

describe('police promotion rules', () => {
  it('normalizes SPC to formal PC with a designation and shares the PC-to-SGT route', () => {
    expect(normalizePolicePromotionRank('Senior Police Constable（SPC）')).toEqual({
      inputRankCode: 'spc',
      formalRankCode: 'pc',
      designation: 'senior_police_constable'
    });
    expect(getPolicePromotionRoute('Police Constable（PC）')?.routeId).toBe('hk1988_pc_to_sgt');
    expect(getPolicePromotionRoute('Senior Police Constable（SPC）')?.routeId).toBe(
      'hk1988_pc_to_sgt'
    );
  });

  it.each([
    ['Police Constable（PC）', 'sgt'],
    ['Senior Police Constable（SPC）', 'sgt'],
    ['Sergeant（SGT）', 'ssgt'],
    ['Station Sergeant（SSGT）', 'pi'],
    ['Probationary Inspector（PI）', 'ip']
  ] as const)('maps %s to the supported formal target %s', (rank, targetRankCode) => {
    const result = evaluatePolicePromotion(
      promotionInput({
        currentRank: rank,
        serviceBasis: rank.includes('PC') ? 'established_service' : 'appointed_in_save',
        daysInCurrentRank: 100
      })
    );
    expect(result.targetRankCode).toBe(targetRankCode);
  });

  it.each(['Inspector（IP）', 'Senior Inspector（SIP）', 'Chief Inspector（CIP）']) (
    'keeps %s compatible without inventing a V1 promotion program',
    (rank) => {
      const result = evaluatePolicePromotion(promotionInput({ currentRank: rank }));
      expect(result.active).toBe(true);
      expect(result.routeId).toBeUndefined();
      expect(result.targetRankCode).toBeUndefined();
      expect(result.eligible).toBe(false);
    }
  );

  it('does not run the structured evaluator when the DLC is disabled', () => {
    const result = evaluatePolicePromotion(promotionInput({ enabled: false }));
    expect(result.active).toBe(false);
    expect(result.routeId).toBeUndefined();
    expect(result.requirements).toEqual([]);
    expect(result.lawfulNextStages).toEqual([]);
  });

  it('blocks a new recruit before 30 days even when other evidence exists', () => {
    const result = evaluatePolicePromotion(
      promotionInput({ daysInCurrentRank: 29, evidence: completedPcEvidence() })
    );
    expect(result.eligible).toBe(false);
    expect(
      result.requirements.find((item) => item.requirementId === 'service_eligibility')?.status
    ).toBe('in_progress');
    expect(result.lawfulNextStages).toEqual([]);
  });

  it('does not make time alone satisfy the three-turn and two-kind evidence rule', () => {
    const result = evaluatePolicePromotion(
      promotionInput({ daysInCurrentRank: 365, evidence: [] })
    );
    expect(result.eligible).toBe(false);
    expect(
      result.requirements.find((item) => item.requirementId === 'performance_evidence')?.status
    ).toBe('pending');
  });

  it('counts three records from one turn as one performance turn', () => {
    const result = evaluatePolicePromotion(
      promotionInput({
        evidence: [
          evidence('case_activity', 'case-1', { turnId: 'turn-1' }),
          evidence('judgement', 'check-1', { turnId: 'turn-1' }),
          evidence('matter_progress', 'matter-1', { turnId: 'turn-1' })
        ]
      })
    );
    const requirement = result.requirements.find(
      (item) => item.requirementId === 'performance_evidence'
    );
    expect(requirement?.status).toBe('pending');
    expect(requirement?.summary).toContain('当前为 1 个回合');
  });

  it('collapses Matter, StoryEntry and ActorMemory mirrors through a canonical fact id', () => {
    const mirrored = [
      evidence('matter_progress', 'matter-1', {
        canonicalFactId: 'fact-case-handover',
        turnId: 'turn-1'
      }),
      evidence('story_entry', 'story-1', {
        canonicalFactId: 'fact-case-handover',
        turnId: 'turn-1'
      }),
      evidence('actor_memory', 'memory-1', {
        canonicalFactId: 'fact-case-handover',
        turnId: 'turn-1'
      })
    ];
    const deduped = dedupePolicePromotionEvidence(mirrored);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].kind).toBe('matter_progress');
  });

  it('ignores rejected or unapplied evidence and never lets narrative mirrors prove performance', () => {
    const result = evaluatePolicePromotion(
      promotionInput({
        evidence: [
          evidence('case_activity', 'case-rejected', { applied: false, turnId: 'turn-1' }),
          evidence('story_entry', 'story-1', { turnId: 'turn-2' }),
          evidence('actor_memory', 'memory-1', { turnId: 'turn-3' })
        ]
      })
    );
    expect(result.evidence.map((item) => item.refId)).not.toContain('case-rejected');
    expect(
      result.requirements.find((item) => item.requirementId === 'performance_evidence')?.status
    ).toBe('pending');
  });

  it('requires formal supervision evidence for SGT-to-SSGT', () => {
    const result = evaluatePolicePromotion(
      promotionInput({
        currentRank: 'Sergeant（SGT）',
        serviceBasis: 'appointed_in_save',
        daysInCurrentRank: 45,
        evidence: [
          evidence('case_activity', 'case-1', { turnId: 'turn-1' }),
          evidence('judgement', 'check-1', { turnId: 'turn-2' })
        ]
      })
    );
    expect(
      result.requirements.find((item) => item.requirementId === 'supervision_evidence')?.status
    ).toBe('pending');
    expect(result.eligible).toBe(false);
  });

  it('requires both leadership and complex policing evidence for SSGT-to-PI', () => {
    const result = evaluatePolicePromotion(
      promotionInput({
        currentRank: 'Station Sergeant（SSGT）',
        serviceBasis: 'appointed_in_save',
        daysInCurrentRank: 75,
        evidence: [
          evidence('leadership', 'lead-1', { turnId: 'turn-1', tags: ['leadership'] }),
          evidence('judgement', 'check-1', { turnId: 'turn-2' })
        ]
      })
    );
    expect(
      result.requirements.find((item) => item.requirementId === 'supervision_evidence')?.status
    ).toBe('completed');
    expect(
      result.requirements.find((item) => item.requirementId === 'performance_evidence')?.status
    ).toBe('pending');
  });

  it('does not treat relationship praise or memory as a formal recommendation', () => {
    const result = evaluatePolicePromotion(
      promotionInput({
        evidence: [
          evidence('actor_memory', 'praise-1', { tags: ['formal_recommendation'] }),
          evidence('turn_summary', 'praise-2', { tags: ['formal_recommendation'] })
        ]
      })
    );
    expect(
      result.requirements.find((item) => item.requirementId === 'supervisor_recommendation')
        ?.status
    ).toBe('pending');
  });

  it.each(['unknown', 'unavailable'] as const)(
    'does not complete appointment when vacancy status is %s',
    (vacancyStatus) => {
      const result = evaluatePolicePromotion(
        promotionInput({
          processStage: 'awaiting_vacancy',
          vacancyStatus,
          evidence: completedPcEvidence()
        })
      );
      expect(
        result.requirements.find((item) => item.requirementId === 'vacancy_or_post')?.status
      ).not.toBe('completed');
      expect(result.lawfulNextStages).toEqual([]);
    }
  );

  it('only exposes the immediate lawful next process stage', () => {
    const result = evaluatePolicePromotion(
      promotionInput({
        processStage: 'not_eligible',
        vacancyStatus: 'allocated',
        evidence: completedPcEvidence()
      })
    );
    expect(result.eligible).toBe(true);
    expect(result.lawfulNextStages).toEqual(['eligible']);
  });

  it('does not mutate the evaluation input or evidence', () => {
    const item = evidence('case_activity', 'case-1', {
      turnId: 'turn-1',
      tags: ['reliable_service']
    });
    const input = promotionInput({ evidence: [item] });
    const before = JSON.stringify(input);
    evaluatePolicePromotion(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('police posting rules', () => {
  const cidEvidence = [
    evidence('case_activity', 'service-1', { tags: ['reliable_service'] }),
    evidence('supervisor_assessment', 'recommendation-1', {
      tags: ['formal_recommendation']
    }),
    evidence('training', 'detective-training-1', { tags: ['detective_training'] })
  ];

  it('allows a qualified lateral CID posting without changing formal rank', () => {
    const result = evaluatePolicePosting({
      enabled: true,
      worldpackId: 'hk_1988',
      routeId: 'hk1988_uniform_to_cid',
      currentDepartment: 'uniform',
      currentRank: 'Senior Police Constable（SPC）',
      requestedTargetRank: 'Police Constable（PC）',
      vacancyStatus: 'available',
      evidence: cidEvidence
    });
    expect(result.eligible).toBe(true);
    expect(result.formalRankCode).toBe('pc');
    expect(result.resultingFormalRankCode).toBe('pc');
    expect(result.designation).toBe('senior_police_constable');
    expect(result.targetDepartment).toBe('cid');
  });

  it('treats PTU as a training rotation rather than a promotion', () => {
    const result = evaluatePolicePosting({
      enabled: true,
      worldpackId: 'hk_1988',
      routeId: 'hk1988_uniform_to_ptu_rotation',
      currentDepartment: 'uniform',
      currentRank: 'Police Constable（PC）',
      vacancyStatus: 'allocated',
      evidence: [
        evidence('training', 'physical-1', { tags: ['physical_discipline_clear'] }),
        evidence('training', 'slot-1', { tags: ['ptu_training_slot'] }),
        evidence('course', 'course-1', { tags: ['ptu_course_completed'] }),
        evidence('posting', 'rotation-1', { tags: ['rotation_arranged'] })
      ]
    });
    expect(result.eligible).toBe(true);
    expect(result.resultKind).toBe('training_rotation');
    expect(result.resultingFormalRankCode).toBe('pc');
  });

  it.each([
    {
      name: 'unsupported worldpack',
      worldpackId: 'shanghai_1943',
      currentDepartment: 'uniform',
      requestedTargetRank: 'Police Constable（PC）'
    },
    {
      name: 'wrong source department',
      worldpackId: 'hk_1988',
      currentDepartment: 'traffic',
      requestedTargetRank: 'Police Constable（PC）'
    },
    {
      name: 'rank-changing request',
      worldpackId: 'hk_1988',
      currentDepartment: 'uniform',
      requestedTargetRank: 'Sergeant（SGT）'
    }
  ])('rejects $name', ({ worldpackId, currentDepartment, requestedTargetRank }) => {
    const result = evaluatePolicePosting({
      enabled: true,
      worldpackId,
      routeId: 'hk1988_uniform_to_cid',
      currentDepartment,
      currentRank: 'Police Constable（PC）',
      requestedTargetRank,
      vacancyStatus: 'available',
      evidence: cidEvidence
    });
    expect(result.eligible).toBe(false);
  });

  it('requires an available slot and all local evidence tags', () => {
    const result = evaluatePolicePosting({
      enabled: true,
      worldpackId: 'hk_1988',
      routeId: 'hk1988_uniform_to_cid',
      currentDepartment: 'uniform',
      currentRank: 'Police Constable（PC）',
      vacancyStatus: 'unknown',
      evidence: cidEvidence.slice(0, 1)
    });
    expect(result.eligible).toBe(false);
    expect(result.blockingReasons.join(' ')).toContain('detective_training');
    expect(result.blockingReasons.join(' ')).toContain('职位、名额或轮调席位');
  });

  it('does not let failed training satisfy a posting requirement', () => {
    const result = evaluatePolicePosting({
      enabled: true,
      worldpackId: 'hk_1988',
      routeId: 'hk1988_uniform_to_cid',
      currentDepartment: 'uniform',
      currentRank: 'Police Constable（PC）',
      vacancyStatus: 'available',
      evidence: [
        ...cidEvidence.slice(0, 2),
        evidence('training', 'failed-training', {
          result: 'failed',
          tags: ['detective_training']
        })
      ]
    });
    expect(result.eligible).toBe(false);
    expect(result.completedEvidenceTags).not.toContain('detective_training');
  });
});
