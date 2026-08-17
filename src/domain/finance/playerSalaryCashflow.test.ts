import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  PLAYER_POLICE_SALARY_CASHFLOW_ID,
  syncPlayerPoliceSalaryCashflow
} from './playerSalaryCashflow';

function createPoliceState(rank: string) {
  return createInitialRuntimeState({
    startTime: { year: 1988, month: 10, day: 1, hour: 9, minute: 0 },
    lawIdentity: {
      rank,
      stationOrPost: 'Police Headquarters',
      department: 'Force Headquarters',
      assignmentSummary: 'Command duties'
    }
  });
}

describe('player police salary cashflow', () => {
  it.each([
    ['Superintendent（警司 SP）', 9200],
    ['Senior Superintendent（高级警司 SSP）', 10700],
    ['Chief Superintendent（总警司 CSP）', 12500],
    ['Assistant Commissioner of Police（助理处长 ACP）', 14100],
    ['Senior Assistant Commissioner of Police（高级助理处长 SACP）', 16400],
    ['Deputy Commissioner of Police（副处长 DCP）', 18600],
    ['Commissioner of Police（警务处长 CP）', 21800]
  ] as const)('assigns the 1988 senior-command salary band for %s', (rank, amount) => {
    const state = createPoliceState(rank);

    expect(state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.amount).toBe(amount);
  });

  it('recalculates an existing salary when the player enters a senior-command rank', () => {
    const state = createPoliceState('Chief Inspector（总督察 CIP）');
    const nextLawIdentity = {
      ...state.lawIdentity,
      rank: 'Chief Superintendent（总警司 CSP）'
    };

    const finance = syncPlayerPoliceSalaryCashflow({
      finance: state.finance,
      time: state.time,
      currentIdentity: state.player.currentIdentity,
      lawIdentity: nextLawIdentity,
      identityHistory: state.player.identityHistory
    });

    expect(finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.amount).toBe(12500);
    expect(finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.summary).toContain(
      'Chief Superintendent'
    );
  });
});
