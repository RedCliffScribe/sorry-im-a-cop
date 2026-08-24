import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type {
  PolicePostingProgramState,
  PolicePromotionProgramState,
  RuntimeState
} from '../../domain/runtime/types';
import { normalizePoliceCareerProgress } from '../../domain/police/policeCareerProgress';
import { POLICE_PROMOTION_DLC_ID } from '../../domain/police/policePromotionRules';
import { PolicePanelModal } from './PolicePanelModal';

function createBoundPoliceCareerState(): RuntimeState {
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

describe('PolicePanelModal', () => {
  it('renders police institution context in player-facing Chinese and turns action hints into player drafts', () => {
    const state = createInitialRuntimeState({
      lawIdentity: {
        rank: 'Senior Constable（高级警员 SPC）',
        stationOrPost: 'Mong Kok Police Station（旺角警署）',
        department: 'Uniform Branch（军装巡逻）',
        assignmentSummary: 'Beat Constable（街面巡逻警）'
      }
    });
    state.time = { year: 1988, month: 9, day: 12, hour: 22, minute: 13 };
    state.policePanel.actionHints = ['Ask the duty sergeant how promotion recommendations work.'];
    const onDraftPlayerAction = vi.fn();
    const onClose = vi.fn();

    render(<PolicePanelModal state={state} onClose={onClose} onDraftPlayerAction={onDraftPlayerAction} />);

    expect(screen.getByRole('dialog', { name: '警队' })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: '警队' });
    expect(dialog).toHaveTextContent('皇家香港警察');
    expect(dialog).toHaveTextContent('高级警员（SPC）');
    expect(dialog).toHaveTextContent('警长（SGT）');
    expect(dialog).toHaveTextContent('旺角警署');
    expect(dialog).toHaveTextContent('军装巡逻');
    expect(dialog).toHaveTextContent('街面巡逻警');
    expect(dialog).toHaveTextContent('值班安排');
    expect(dialog).toHaveTextContent('当前值班 临近交班 · 晚更');
    expect(dialog).toHaveTextContent('14:00–22:45');
    expect(dialog).toHaveTextContent('1988年9月13日 星期二 晚更 14:00–22:45');
    expect(dialog).toHaveTextContent('4天晚更 → 2天轮休');
    expect(dialog).toHaveTextContent('当前可见晋升路径');
    expect(dialog).toHaveTextContent('年资');
    expect(dialog).not.toHaveTextContent('Royal Hong Kong Police');
    expect(dialog).not.toHaveTextContent('Current visible route');
    expect(dialog).not.toHaveTextContent('Handle routine duties');
    expect(dialog).not.toHaveTextContent('Direct supervisor');
    expect(dialog).not.toHaveTextContent('seniority');

    fireEvent.click(screen.getByRole('button', { name: /询问值日警长/ }));

    expect(onDraftPlayerAction).toHaveBeenCalledWith('询问值日警长，晋升推荐通常看哪些记录。');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders structured promotion and posting progress without exposing a career experience system', () => {
    const state = createBoundPoliceCareerState();
    const baseProgram = state.policePanel.careerPath.promotionProgress;
    if (!baseProgram) throw new Error('expected bound police promotion program');

    const promotionProgress: PolicePromotionProgramState = {
      ...baseProgram,
      processStage: 'awaiting_recommendation',
      vacancyStatus: 'unavailable',
      requirements: [
        {
          requirementId: 'service_eligibility',
          status: 'completed',
          evidenceRefs: [],
          summary: '服务或任职资格：已达到最低服务要求。'
        },
        {
          requirementId: 'promotion_exam',
          status: 'in_progress',
          evidenceRefs: ['exam:exam_record_1'],
          summary: '适用晋升考试：考试正在安排。',
          blockingReason: '尚待完成考试。'
        },
        {
          requirementId: 'supervisor_recommendation',
          status: 'pending',
          evidenceRefs: [],
          summary: '直属上级正式推荐：尚无有据正式推荐。'
        },
        {
          requirementId: 'vacancy_or_post',
          status: 'blocked',
          evidenceRefs: [],
          summary: '可用职位或轮调名额：正式信息确认当前暂无空缺。',
          blockingReason: '当前没有可用职位。'
        }
      ],
      blockingReasons: ['当前没有可用职位。']
    };
    const postingProgress: PolicePostingProgramState = {
      routeId: 'hk1988_uniform_to_cid',
      worldpackId: 'hk_1988',
      sourceDepartment: 'uniform',
      targetDepartment: 'cid',
      processStage: 'training',
      vacancyStatus: 'expected',
      evidence: [],
      completedEvidenceTags: ['reliable_service'],
      blockingReasons: [
        '缺少调动证据：formal_recommendation、detective_training。',
        '没有已确认可用或已分配的职位、名额或轮调席位。'
      ],
      lastEvaluatedAt: { ...state.time }
    };
    const structuredState: RuntimeState = {
      ...state,
      policePanel: {
        ...state.policePanel,
        careerPath: {
          ...state.policePanel.careerPath,
          promotionProgress,
          postingProgress
        }
      }
    };

    render(<PolicePanelModal state={structuredState} onClose={vi.fn()} />);

    const promotion = screen.getByLabelText('晋升程序');
    expect(promotion).toHaveTextContent('警长（SGT）');
    expect(promotion).toHaveTextContent('等待直属上级推荐');
    expect(promotion).toHaveTextContent('已完成 1 / 4');
    expect(within(promotion).getByRole('progressbar', { name: '晋升条件完成进度' })).toHaveAttribute(
      'aria-valuenow',
      '1'
    );
    expect(within(promotion).getByLabelText('已完成')).toBeInTheDocument();
    expect(within(promotion).getByLabelText('进行中')).toBeInTheDocument();
    expect(within(promotion).getByLabelText('待完成')).toBeInTheDocument();
    expect(within(promotion).getByLabelText('受阻')).toBeInTheDocument();
    expect(promotion).toHaveTextContent('当前没有可用职位');
    expect(promotion).toHaveTextContent('查看依据（1 项）');
    expect(promotion).toHaveTextContent('考试记录');

    const posting = screen.getByLabelText('部门调动程序');
    expect(posting).toHaveTextContent('刑事侦缉处（CID）');
    expect(posting).toHaveTextContent('训练中');
    expect(posting).toHaveTextContent('已完成 1 / 4');
    expect(posting).toHaveTextContent('稳定勤务记录');
    expect(posting).toHaveTextContent('直属上级正式推荐');
    expect(posting).toHaveTextContent('预计有空缺');
    expect(posting).toHaveTextContent('尚缺调动条件：直属上级正式推荐、侦缉训练。');
    expect(screen.getByRole('dialog', { name: '警队' })).not.toHaveTextContent('职业经验');
  });

  it('keeps posting empty state inside the existing career card when no transfer has been started', () => {
    const state = createBoundPoliceCareerState();

    render(<PolicePanelModal state={state} onClose={vi.fn()} />);

    const career = screen.getByText('晋升路径').closest('section');
    expect(career).not.toBeNull();
    expect(career).toHaveTextContent('暂无调动申请');
    expect(career).toHaveTextContent('调动与正式警衔晋升分开记录');
  });

  it('renders an active posting program even when no promotion program exists', () => {
    const state = createBoundPoliceCareerState();
    const postingProgress: PolicePostingProgramState = {
      routeId: 'hk1988_uniform_to_traffic',
      worldpackId: 'hk_1988',
      sourceDepartment: 'uniform',
      targetDepartment: 'traffic',
      processStage: 'eligible',
      vacancyStatus: 'unknown',
      evidence: [],
      completedEvidenceTags: ['road_or_accident_record'],
      blockingReasons: ['缺少调动证据：traffic_training。'],
      lastEvaluatedAt: { ...state.time }
    };
    const postingOnlyState: RuntimeState = {
      ...state,
      policePanel: {
        ...state.policePanel,
        careerPath: {
          ...state.policePanel.careerPath,
          promotionProgress: undefined,
          postingProgress
        }
      }
    };

    render(<PolicePanelModal state={postingOnlyState} onClose={vi.fn()} />);

    expect(screen.queryByLabelText('晋升程序')).not.toBeInTheDocument();
    const posting = screen.getByLabelText('部门调动程序');
    expect(posting).toHaveTextContent('交通部');
    expect(posting).toHaveTextContent('已具备调动资格');
    expect(posting).toHaveTextContent('道路或事故处置记录');
    expect(posting).toHaveTextContent('交通训练');
  });
});
