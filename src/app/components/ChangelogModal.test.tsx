import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangelogModal } from './ChangelogModal';

describe('ChangelogModal', () => {
  it('shows the single formal launch entry without an empty pager', () => {
    const onClose = vi.fn();
    render(<ChangelogModal onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: '更新日志' });
    expect(within(dialog).getByRole('heading', { name: '简体中文 v1.0.0 正式上线' })).toBeInTheDocument();
    expect(within(dialog).getByText('v1.0.0')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /较新一条/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '较早一条 →' })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('更新日志页码')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '关闭更新日志' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
