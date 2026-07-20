import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileGameRegionSwitcher } from './GameScreen';

describe('GameScreen mobile region switcher', () => {
  it('exposes identity, narrative and feature workspaces with one active region', () => {
    const onSelect = vi.fn();
    render(<MobileGameRegionSwitcher activeRegion="narrative" onSelect={onSelect} />);

    const switcher = screen.getByRole('navigation', { name: '移动端主界面区域' });
    expect(switcher).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '身份' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '正文' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '功能' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '功能' }));
    expect(onSelect).toHaveBeenCalledWith('systems');
  });
});
