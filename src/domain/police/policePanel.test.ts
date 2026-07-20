import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { applyPolicePanelPatch } from './policePanel';

describe('police panel state', () => {
  it('creates a police panel from the opening law identity', () => {
    const state = createInitialRuntimeState({
      lawIdentity: {
        rank: 'Senior Constable (SPC)',
        stationOrPost: 'Wan Chai Police Station',
        department: 'Uniform Branch',
        assignmentSummary: 'Street patrol'
      }
    });

    expect(state.policePanel.institutionName).toBe('皇家香港警察');
    expect(state.policePanel.unitName).toContain('湾仔警署');
    expect(state.policePanel.unitName).toContain('军装巡逻');
    expect(state.policePanel.careerPath.currentRank).toBe('高级警员（SPC）');
    expect(state.policePanel.careerPath.targetRank).toBe('警长（SGT）');
    expect(state.policePanel.careerPath.routeSummary).toContain('当前可见晋升路径');
    expect(state.policePanel.rankBoundary.cannot.join(' ')).toContain('不能');
    expect(state.policePanel.rankBoundary.cannot.join(' ')).not.toContain('rank');
    expect(JSON.stringify(state.policePanel)).not.toContain('Current visible route');
    expect(JSON.stringify(state.policePanel)).not.toContain('Handle routine duties');
    expect(JSON.stringify(state.policePanel)).not.toContain('Direct supervisor');
    expect(JSON.stringify(state.policePanel)).not.toContain('Subject to chain of command');
    expect(JSON.stringify(state.policePanel)).not.toContain('New or lightly known within the force');
  });

  it('does not seed a police rank or player relation for a civilian with no law identity', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });

    expect(state.lawIdentity.status).toBe('none');
    expect(state.policePanel.careerPath.currentRank).toBe('无警务职级');
    expect(state.policePanel.careerPath.targetRank).toBeUndefined();
    expect(state.policePanel.relatedActorIds).toEqual([]);
    expect(state.policePanel.actionHints).toEqual([]);
  });

  it('merges dynamic police progress without replacing the whole panel', () => {
    const state = createInitialRuntimeState({
      lawIdentity: {
        rank: 'Constable (PC)',
        stationOrPost: 'Mong Kok Police Station',
        department: 'Uniform Branch',
        assignmentSummary: 'Patrol Constable'
      }
    });

    const next = applyPolicePanelPatch(
      state.policePanel,
      {
        careerPath: {
          dynamicAssessment: {
            supervisor: 'The duty sergeant thinks he is careful but still green.',
            commendation: 'No formal commendation yet.'
          },
          opportunities: ['Ask the patrol supervisor for a written performance note.']
        },
        climate: [
          {
            key: 'discipline_pressure',
            label: 'Discipline pressure',
            level: 'medium',
            summary: 'Recent complaints make supervisors more cautious.'
          }
        ],
        actionHints: ['Ask the duty sergeant what performance record matters for promotion.']
      },
      state.time
    );

    expect(next.unitName).toContain('旺角警署');
    expect(next.careerPath.dynamicAssessment.supervisor).toContain('careful');
    expect(next.careerPath.dynamicAssessment.commendation).toContain('No formal');
    expect(next.climate.find((entry) => entry.key === 'discipline_pressure')?.summary).toContain('complaints');
    expect(next.actionHints[0]).toContain('duty sergeant');
  });

  it('keeps senior police rank promotion targets distinct after localization', () => {
    const state = createInitialRuntimeState({
      lawIdentity: {
        rank: 'Chief Inspector（总督察）',
        stationOrPost: 'Wan Chai Police Station',
        department: 'Uniform Branch',
        assignmentSummary: 'Report room supervisor'
      }
    });

    expect(state.policePanel.careerPath.currentRank).toBe('总督察');
    expect(state.policePanel.careerPath.targetRank).toBe('警司');
  });
});
