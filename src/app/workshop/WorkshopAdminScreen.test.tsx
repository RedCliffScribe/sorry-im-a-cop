import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  WorkshopAdminApiClientLike,
  WorkshopAdminAuditEntryV1,
  WorkshopAdminItemV1,
  WorkshopAdminUserV1
} from '../../domain/workshop';
import { WorkshopAdminScreen } from './WorkshopAdminScreen';

const item: WorkshopAdminItemV1 = {
  itemId: 'item_1',
  title: '测试公开预设',
  status: 'published',
  disabledReason: null,
  previousStatus: null,
  owner: {
    userId: 'member_1',
    displayName: '上传者',
    role: 'member',
    status: 'active'
  },
  updatedAt: '2026-08-03T00:00:00.000Z'
};

const users: WorkshopAdminUserV1[] = [{
  userId: 'admin_1',
  displayName: '管理员甲',
  avatarRef: null,
  role: 'admin',
  status: 'active',
  itemCount: 0,
  revisionCount: 0,
  storedBytes: 0,
  createdAt: '2026-08-03T00:00:00.000Z',
  lastLoginAt: '2026-08-03T00:00:00.000Z'
}, {
  userId: 'member_1',
  displayName: '上传者',
  avatarRef: null,
  role: 'member',
  status: 'active',
  itemCount: 1,
  revisionCount: 2,
  storedBytes: 4096,
  createdAt: '2026-08-03T00:00:00.000Z',
  lastLoginAt: null
}];

const audit: WorkshopAdminAuditEntryV1[] = [{
  actionId: 'admin_action_1',
  actor: { userId: 'admin_1', displayName: '管理员甲' },
  action: 'item_disabled',
  targetType: 'item',
  targetId: 'item_old',
  reason: '历史违规内容。',
  beforeSummary: { status: 'published' },
  afterSummary: { status: 'disabled' },
  createdAt: '2026-08-03T00:00:00.000Z'
}];

function adminClient(): WorkshopAdminApiClientLike {
  return {
    listAdminItems: vi.fn(async () => [item]),
    listAdminUsers: vi.fn(async () => users),
    listAdminAudit: vi.fn(async () => audit),
    disableAdminItem: vi.fn(async () => undefined),
    restoreAdminItem: vi.fn(async () => undefined),
    suspendAdminUser: vi.fn(async () => undefined),
    restoreAdminUser: vi.fn(async () => undefined)
  };
}

describe('WorkshopAdminScreen', () => {
  it('shows server-confirmed governance data and protects administrator roles', async () => {
    render(<WorkshopAdminScreen client={adminClient()} currentUserId="admin_1" />);

    expect(await screen.findByText('测试公开预设')).toBeInTheDocument();
    expect(screen.getByText('历史违规内容。')).toBeInTheDocument();
    expect(screen.getByText('管理员角色受保护；角色变更只能通过受控运维完成。')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '停用并撤销会话' })).toHaveLength(1);
  });

  it('requires a reason and confirmation before disabling an item', async () => {
    const client = adminClient();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<WorkshopAdminScreen client={client} currentUserId="admin_1" />);
    await screen.findByText('测试公开预设');

    fireEvent.click(screen.getByRole('button', { name: '停用并阻止下载' }));
    expect(screen.getByRole('status')).toHaveTextContent('请先填写至少 3 个字符');
    expect(client.disableAdminItem).not.toHaveBeenCalled();

    fireEvent.change(screen.getAllByLabelText('管理原因')[0], {
      target: { value: '公开内容违反工坊规则。' }
    });
    fireEvent.click(screen.getByRole('button', { name: '停用并阻止下载' }));

    await waitFor(() => expect(client.disableAdminItem).toHaveBeenCalledWith(
      'item_1',
      '公开内容违反工坊规则。'
    ));
  });
});
