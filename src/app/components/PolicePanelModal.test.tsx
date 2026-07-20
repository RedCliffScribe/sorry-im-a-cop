import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { PolicePanelModal } from './PolicePanelModal';

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
});
