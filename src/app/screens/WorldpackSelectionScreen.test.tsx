import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorldpackSelectionScreen } from './WorldpackSelectionScreen';

describe('WorldpackSelectionScreen', () => {
  it('shows all four worldpacks and opens only the available Hong Kong guide', () => {
    const onBack = vi.fn();
    const onSelectHongKong = vi.fn();
    render(
      <WorldpackSelectionScreen
        onBack={onBack}
        onSelectHongKong={onSelectHongKong}
      />
    );

    expect(screen.getByRole('heading', { name: '选择世界包' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择香港 1988世界包' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看圣·德拉罗世界包预研状态' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看京崎 1999世界包预研状态' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看上海 1943世界包预研状态' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '选择香港 1988世界包' }));
    expect(onSelectHongKong).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '查看京崎 1999世界包预研状态' }));
    expect(onSelectHongKong).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      '京崎 1999仍在预研阶段，专用开局向导将在世界包完成后开放。'
    );

    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
