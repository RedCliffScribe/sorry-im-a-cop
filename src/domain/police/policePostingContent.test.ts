import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { RuntimeState } from '../runtime/types';
import { normalizePoliceCareerProgress } from './policeCareerProgress';
import {
  auditPolicePostingEventTags,
  HK_1988_POLICE_POSTING_CONTENT,
  projectPolicePostingOpportunities
} from './policePostingContent';
import {
  HK_1988_POLICE_POSTING_ROUTES,
  POLICE_PROMOTION_DLC_ID
} from './policePromotionRules';

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

describe('police posting content projection', () => {
  it('keeps one content contract for every launch route and every required evidence tag', () => {
    expect(HK_1988_POLICE_POSTING_CONTENT.map((route) => route.routeId).sort()).toEqual(
      HK_1988_POLICE_POSTING_ROUTES.map((route) => route.routeId).sort()
    );

    for (const rule of HK_1988_POLICE_POSTING_ROUTES) {
      const content = HK_1988_POLICE_POSTING_CONTENT.find(
        (candidate) => candidate.routeId === rule.routeId
      );
      expect(content).toBeDefined();
      expect(content?.resultKind).toBe(rule.resultKind);
      expect(content?.evidenceContracts.map((contract) => contract.tag).sort()).toEqual(
        [...rule.requiredEvidenceTags].sort()
      );
    }
  });

  it('projects a compact route index but expands only routes relevant to the current action', () => {
    const projection = projectPolicePostingOpportunities(
      boundState(),
      '处理完弥敦道交通事故现场。'
    );

    expect(projection.routeIndex.map((route) => route.routeId)).toEqual([
      'hk1988_uniform_to_cid',
      'hk1988_uniform_or_cid_to_traffic',
      'hk1988_uniform_to_eu',
      'hk1988_uniform_to_ptu_rotation'
    ]);
    expect(projection.opportunities).toHaveLength(1);
    expect(projection.opportunities[0]).toMatchObject({
      routeId: 'hk1988_uniform_or_cid_to_traffic',
      mode: 'available_to_explore',
      resultKind: 'lateral_transfer'
    });
  });

  it('keeps a CID specialist inquiry uniquely projected across natural wording variants', () => {
    const state = boundState();
    state.lawIdentity.department = 'Criminal Investigation Department（刑事侦缉处 CID）';

    for (const input of [
      '我想了解自己日后转入专门调查组的正规途径。',
      '我继续核对这条专业调查岗位路线还缺哪些正式条件。'
    ]) {
      const projection = projectPolicePostingOpportunities(state, input);
      expect(projection.opportunities.map((route) => route.routeId)).toEqual([
        'hk1988_cid_to_specialist'
      ]);
    }
  });

  it('projects only the current unfinished posting program and never silently switches route', () => {
    const state = boundState();
    const seeded: RuntimeState = {
      ...state,
      policePanel: {
        ...state.policePanel,
        careerPath: {
          ...state.policePanel.careerPath,
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
            lastEvaluatedAt: { ...state.time }
          }
        }
      }
    };

    const projection = projectPolicePostingOpportunities(
      seeded,
      '我想去处理交通事故，顺便打听交通部。'
    );

    expect(projection.routeIndex.map((route) => route.routeId)).toEqual([
      'hk1988_uniform_to_cid'
    ]);
    expect(projection.opportunities).toEqual([
      expect.objectContaining({
        routeId: 'hk1988_uniform_to_cid',
        mode: 'active_program',
        currentStage: 'training'
      })
    ]);
  });

  it('does not project posting content for paused, completed, unbound or non-police states', () => {
    expect(projectPolicePostingOpportunities(boundState('paused'), '了解 CID')).toEqual({
      routeIndex: [],
      opportunities: []
    });
    expect(projectPolicePostingOpportunities(boundState('completed'), '了解 CID')).toEqual({
      routeIndex: [],
      opportunities: []
    });
    expect(projectPolicePostingOpportunities(createInitialRuntimeState(), '了解 CID')).toEqual({
      routeIndex: [],
      opportunities: []
    });
    const police = boundState();
    expect(
      projectPolicePostingOpportunities(
        {
          ...police,
          player: { ...police.player, currentIdentity: 'civilian' }
        },
        '了解 CID'
      )
    ).toEqual({ routeIndex: [], opportunities: [] });
  });
});

describe('police posting evidence tag contracts', () => {
  it('accepts a route tag only from the event type assigned by that route contract', () => {
    expect(
      auditPolicePostingEventTags({
        routeId: 'hk1988_uniform_to_cid',
        eventType: 'course_completed',
        tags: ['detective_training']
      })
    ).toEqual({ acceptedTags: ['detective_training'], rejectedTags: [] });

    expect(
      auditPolicePostingEventTags({
        routeId: 'hk1988_uniform_to_cid',
        eventType: 'commendation_recorded',
        tags: ['detective_training']
      })
    ).toEqual({
      acceptedTags: [],
      rejectedTags: [{ tag: 'detective_training', reason: 'event_type_mismatch' }]
    });
  });

  it('rejects evidence tags from another posting route without using fuzzy matching', () => {
    expect(
      auditPolicePostingEventTags({
        routeId: 'hk1988_uniform_to_ptu_rotation',
        eventType: 'course_completed',
        tags: ['detective_training', 'ptu_course_completed']
      })
    ).toEqual({
      acceptedTags: ['ptu_course_completed'],
      rejectedTags: [{ tag: 'detective_training', reason: 'not_required_by_route' }]
    });
  });
});
