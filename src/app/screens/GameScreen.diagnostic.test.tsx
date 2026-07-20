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

    fireEvent.click(screen.getByRole('button', { name: '导出原文' }));

    expect(createNarrativeDiagnosticMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('diagnostic text')).toBeInTheDocument();
  });
});
