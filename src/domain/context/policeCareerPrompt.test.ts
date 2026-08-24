import { describe, expect, it } from 'vitest';
import { normalizePoliceCareerProgress } from '../police/policeCareerProgress';
import { POLICE_PROMOTION_DLC_ID } from '../police/policePromotionRules';
import { createInitialRuntimeState } from '../runtime/initialState';
import { composePrompt } from './composePrompt';
import { selectContext } from './selectContext';

function createPromotionBoundState() {
  const state = createInitialRuntimeState();
  return normalizePoliceCareerProgress({
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

describe('police career prompt contract', () => {
  it('projects the bound structured program and forbids direct rank writeback', () => {
    const state = createPromotionBoundState();
    const prompt = composePrompt(
      selectContext(state, '询问值日警长晋升程序下一步需要什么。'),
      '询问值日警长晋升程序下一步需要什么。'
    );

    expect(prompt).toContain('POLICE_CONTEXT_PROJECTION');
    expect(prompt).toContain('structuredCareerDlc=active; boundVersion=0.1.0');
    expect(prompt).toContain(
      'promotionProgram: route=hk1988_pc_to_sgt; stage=not_eligible; current=pc; target=sgt'
    );
    expect(prompt).toContain('policeCareerProgressPatch');
    expect(prompt).toContain('禁止直接写 playerPatch.policePanel.careerPath.currentRank');
    expect(prompt).toContain('每回合最多推进一个合法阶段');
    expect(prompt).toContain('正式调动/任命生效时再配套 policeRoleProfilePatch');
    expect(prompt).toContain('"kind": "promotion"');
  });

  it('keeps the legacy direct-rank contract for an unbound save', () => {
    const state = createInitialRuntimeState();
    const prompt = composePrompt(
      selectContext(state, '询问值日警长晋升程序下一步需要什么。'),
      '询问值日警长晋升程序下一步需要什么。'
    );

    expect(prompt).not.toContain('promotionProgram: route=hk1988_pc_to_sgt');
    expect(prompt).not.toContain('绑定结构化晋升系统后');
    expect(prompt).toContain(
      '警察玩家的正式晋升、降职、复职或职级纠正确已生效时，必须写 playerPatch.policePanel.careerPath.currentRank'
    );
  });

  it('projects only action-relevant posting content while keeping all structurally possible routes indexed', () => {
    const state = createPromotionBoundState();
    const prompt = composePrompt(
      selectContext(state, '处理完弥敦道交通事故现场，整理事故记录。'),
      '处理完弥敦道交通事故现场，整理事故记录。'
    );

    expect(prompt).toContain('postingRouteIndex: hk1988_uniform_to_cid->刑事侦缉队（CID）');
    expect(prompt).toContain('hk1988_uniform_or_cid_to_traffic->交通部');
    expect(prompt).toContain(
      'postingOpportunity[hk1988_uniform_or_cid_to_traffic]: mode=available_to_explore'
    );
    expect(prompt).not.toContain(
      'postingOpportunity[hk1988_uniform_to_cid]: mode=available_to_explore'
    );
    expect(prompt).toContain(
      'road_or_accident_record[道路或事故处置记录]<=case_activity_recorded|judgement_recorded|matter_progressed'
    );
    expect(prompt).toContain('training completion never creates a vacancy');
    expect(prompt).toContain('requestedStage=interested and events=[]');
    expect(prompt).toContain('这不代表已具备资格');
    expect(prompt).toContain('“只了解／先打听流程” still qualifies');
    expect(prompt).toContain('"kind": "posting"');
    expect(prompt).toContain('"routeId": "hk1988_uniform_or_cid_to_traffic"');
    expect(prompt).toContain('"requestedStage": "interested"');
  });
});
