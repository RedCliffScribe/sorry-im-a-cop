import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { createNarrativeDiagnostic } from '../diagnostics/createNarrativeDiagnostic';
import { GameScreen } from './GameScreen';

vi.mock('../diagnostics/createNarrativeDiagnostic', () => ({
  createNarrativeDiagnostic: vi.fn(() => 'diagnostic text')
}));

const createNarrativeDiagnosticMock = vi.mocked(createNarrativeDiagnostic);

function createProps(state = createInitialRuntimeState()) {
  return {
    state,
    onStateChange: vi.fn(),
    createNarrator: vi.fn(),
    onSave: vi.fn(),
    onAutoSave: vi.fn(async () => undefined),
    onLoad: vi.fn(),
    onSettings: vi.fn(),
    onHome: vi.fn()
  };
}

describe('GameScreen diagnostics', () => {
  beforeEach(() => {
    createNarrativeDiagnosticMock.mockClear();
  });

  it('builds the diagnostic only after the export modal is opened', () => {
    const initialState = createInitialRuntimeState();
    const props = createProps(initialState);
    const view = render(<GameScreen {...props} />);

    expect(createNarrativeDiagnosticMock).not.toHaveBeenCalled();

    const updatedState = { ...initialState, turnCounter: initialState.turnCounter + 1 };
    view.rerender(<GameScreen {...props} state={updatedState} />);
    expect(createNarrativeDiagnosticMock).not.toHaveBeenCalled();

    view.rerender(<GameScreen {...props} state={updatedState} openingStreamText="流式正文片段一" />);
    view.rerender(<GameScreen {...props} state={updatedState} openingStreamText="流式正文片段一，片段二" />);
    expect(createNarrativeDiagnosticMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '诊断导出' }));

    expect(createNarrativeDiagnosticMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('diagnostic text')).toBeInTheDocument();
  });

  it('shows a player-facing warning only for actual partial writeback loss', () => {
    const state = createInitialRuntimeState();
    state.storyLog.push({
      turnId: 'turn_1',
      speaker: 'narrator',
      text: '正文正常完成。',
      gameTime: state.time,
      writebackDiagnostics: [
        {
          path: ['playerPatch', 'economy', 'bankBalance'],
          code: 'too_big',
          message: '金额超过产品上限。'
        }
      ]
    });

    render(<GameScreen {...createProps(state)} />);

    expect(screen.getByText(/仍有1 项状态未能写入/)).toBeInTheDocument();
  });

  it('does not keep warning after the same writeback domain is repaired', () => {
    const state = createInitialRuntimeState();
    state.storyLog.push({
      turnId: 'turn_1',
      speaker: 'narrator',
      text: '正文和资产写回均已完成。',
      gameTime: state.time,
      writebackDiagnostics: [
        {
          path: ['writeback', 'assetPatch', 'upsertItems', 0, 'accessSummary'],
          code: 'invalid_type',
          message: '主响应的车辆权限字段类型错误。'
        },
        {
          path: ['writeback', 'assetPatch'],
          code: 'writeback_repair_applied',
          message: '资产修复结果已通过并应用。'
        }
      ]
    });

    render(<GameScreen {...createProps(state)} />);

    expect(screen.queryByText(/状态未能写入/)).not.toBeInTheDocument();
  });

  it('still warns when a later item in a partially repaired domain remains queued', () => {
    const state = createInitialRuntimeState();
    state.storyLog.push({
      turnId: 'turn_1',
      speaker: 'narrator',
      text: '正文完成，部分人物结构仍待恢复。',
      gameTime: state.time,
      writebackDiagnostics: [
        {
          path: ['writeback', 'actorPatches', 0, 'currentIdentity'],
          code: 'invalid_type',
          message: '首名人物身份字段无效。'
        },
        {
          path: ['writeback', 'actorPatches'],
          code: 'actor_writeback_recovery_applied',
          message: '已恢复一名人物。'
        },
        {
          path: ['writeback', 'actorPatches'],
          code: 'actor_writeback_recovery_queued',
          message: '仍有一名人物进入后续恢复队列。'
        }
      ]
    });

    render(<GameScreen {...createProps(state)} />);

    expect(screen.getByText(/仍有1 项状态未能写入/)).toBeInTheDocument();
  });

  it('does not warn for a relationship proposal rejected by evidence guardrails', () => {
    const state = createInitialRuntimeState();
    state.storyLog.push({
      turnId: 'turn_1',
      speaker: 'narrator',
      text: '普通接触未建立长期人脉。',
      gameTime: state.time,
      writebackDiagnostics: [
        {
          path: ['writeback', 'relationshipThreadPatches', 0],
          code: 'relationship_creation_rejected',
          message: '证据不足，未建立长期关系线。'
        }
      ]
    });

    render(<GameScreen {...createProps(state)} />);

    expect(screen.queryByText(/状态未能写入/)).not.toBeInTheDocument();
  });

  it('does not misreport informational evolution diagnostics as writeback loss', () => {
    const state = createInitialRuntimeState();
    state.storyLog.push({
      turnId: 'turn_1',
      speaker: 'narrator',
      text: '正文正常完成。',
      gameTime: state.time,
      writebackDiagnostics: [
        {
          path: ['citySituationTracks'],
          code: 'city_situation_track_review',
          message: 'Advanced one city situation track.'
        }
      ]
    });

    render(<GameScreen {...createProps(state)} />);

    expect(screen.queryByText(/部分状态未能写入/)).not.toBeInTheDocument();
  });

  it('does not misreport successful local judgement normalization as writeback loss', () => {
    const state = createInitialRuntimeState();
    state.storyLog.push({
      turnId: 'turn_1',
      speaker: 'narrator',
      text: '正文与本地判定均已完成。',
      gameTime: state.time,
      writebackDiagnostics: [
        {
          path: ['writeback', 'judgementCheckPatches', 0, 'factors', 0],
          code: 'local_judgement_factor_rejected',
          message: '未证实的判定修正未被采用，本地判定已重新计算。'
        }
      ]
    });

    render(<GameScreen {...createProps(state)} />);

    expect(screen.queryByText(/部分状态未能写入/)).not.toBeInTheDocument();
  });
});
