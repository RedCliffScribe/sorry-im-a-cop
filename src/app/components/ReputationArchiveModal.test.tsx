import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { ReputationArchiveModal } from './ReputationArchiveModal';

describe('ReputationArchiveModal', () => {
  it('renders overall reputation, six circle rows, and recent reputation logs', () => {
    const state = createInitialRuntimeState();
    state.player.reputation = {
      ...state.player.reputation,
      notoriety: 235,
      overallReputation: -12,
      summary: '在旺角附近开始有人知道他，但整体评价仍有争议。',
      circles: {
        ...state.player.reputation.circles,
        neighborhoodMedia: {
          visibility: 45,
          standing: -50,
          summary: '附近街坊知道他，但觉得他做事太硬。'
        },
        entertainment: {
          visibility: 15,
          standing: 10,
          summary: '少数夜场和片场边缘人听过他的名字。'
        }
      },
      logs: [
        {
          logId: 'reputation_log_0001',
          gameTime: state.time,
          kind: 'circle',
          circle: 'neighborhoodMedia',
          visibilityDelta: 45,
          standingDelta: -50,
          summary: '街坊开始知道他。',
          reason: '处理醉酒纠纷时态度太硬。'
        }
      ]
    };

    render(<ReputationArchiveModal state={state} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '口碑' });
    expect(dialog).toHaveTextContent('整体知名度');
    expect(dialog).toHaveTextContent('235/1000');
    expect(dialog).toHaveTextContent('整体口碑');
    expect(dialog).toHaveTextContent('-12');
    expect(dialog).toHaveTextContent('在旺角附近开始有人知道他');
    expect(dialog).toHaveTextContent('整体口碑由各圈层的知名度与评价在本地综合');

    const circles = within(dialog).getByLabelText('圈层口碑');
    expect(circles).toHaveTextContent('警队');
    expect(circles).toHaveTextContent('街坊/公众媒体');
    expect(circles).toHaveTextContent('娱乐圈');
    expect(circles).toHaveTextContent('社团');
    expect(circles).toHaveTextContent('商业');
    expect(circles).toHaveTextContent('政界');
    expect(circles).toHaveTextContent('45/1000');
    expect(circles).toHaveTextContent('-50');

    const logs = within(dialog).getByLabelText('口碑变动记录');
    expect(logs).toHaveTextContent('街坊开始知道他。');
    expect(logs).toHaveTextContent('处理醉酒纠纷时态度太硬。');
  });
  it('limits reputation log display with the same display count choices', () => {
    const state = createInitialRuntimeState();
    state.player.reputation = {
      ...state.player.reputation,
      logs: Array.from({ length: 35 }, (_, index) => ({
        logId: `rep_log_${index + 1}`,
        gameTime: state.time,
        kind: 'circle' as const,
        circle: 'police' as const,
        visibilityDelta: 1,
        standingDelta: 1,
        summary: `Reputation summary ${index + 1}`,
        reason: `Reputation reason ${index + 1}`
      }))
    };

    const { container } = render(<ReputationArchiveModal state={state} onClose={vi.fn()} />);

    expect(screen.getByText('Reputation summary 35')).toBeInTheDocument();
    expect(screen.getByText('Reputation summary 26')).toBeInTheDocument();
    expect(screen.queryByText('Reputation summary 25')).not.toBeInTheDocument();

    const select = container.querySelector('.archive-limit-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '30' } });

    expect(screen.getByText('Reputation summary 6')).toBeInTheDocument();
    expect(screen.queryByText('Reputation summary 5')).not.toBeInTheDocument();
    expect(state.player.reputation.logs).toHaveLength(35);
    expect(container.querySelector('.reputation-log-scroll')).toBeInTheDocument();
  });
});
