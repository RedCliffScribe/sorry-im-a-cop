import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  WorkshopAdminApiClientLike,
  WorkshopApiClientLike,
  WorkshopMemberApiClientLike,
  WorkshopSession
} from '../../domain/workshop';
import { OnlineWorkshopPage } from './OnlineWorkshopPage';

const emptyApiClient: WorkshopApiClientLike = {
  listItems: vi.fn(async () => ({ items: [], nextCursor: null, requestId: 'request_empty' })),
  getItem: vi.fn(),
  downloadItem: vi.fn()
};

const loggedOutMemberClient: WorkshopMemberApiClientLike = {
  getSession: vi.fn(async (): Promise<WorkshopSession> => ({ authenticated: false })),
  startDiscordLogin: vi.fn(),
  logout: vi.fn(),
  listMyItems: vi.fn(async () => []),
  createItem: vi.fn(),
  createRevision: vi.fn(),
  updateItem: vi.fn(),
  publishItem: vi.fn(),
  unpublishItem: vi.fn(),
  deleteItem: vi.fn()
};

const emptyAdminClient: WorkshopAdminApiClientLike = {
  listAdminItems: vi.fn(async () => []),
  listAdminUsers: vi.fn(async () => []),
  listAdminAudit: vi.fn(async () => []),
  disableAdminItem: vi.fn(),
  restoreAdminItem: vi.fn(),
  suspendAdminUser: vi.fn(),
  restoreAdminUser: vi.fn()
};

describe('OnlineWorkshopPage', () => {
  it('presents the image preset transfer as the first workshop category', async () => {
    render(<OnlineWorkshopPage
      onBack={vi.fn()}
      apiClient={emptyApiClient}
      memberApiClient={loggedOutMemberClient}
    />);

    expect(screen.getByRole('heading', { name: '创意工坊' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '文生图预设' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '自定义人物' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '自定义事件' })).toBeInTheDocument();
    expect(await screen.findByText('当前筛选条件下没有公开预设。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '本地导入／导出' }));
    expect(await screen.findByText('当前尚未保存可导出的文生图生成预设。')).toBeInTheDocument();
    expect(screen.getByText('本地导出不会自动上传；公开包下载后也必须由你确认映射和导入。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '我的上传' }));
    expect(await screen.findByText('登录后可以发布和管理自己的文生图预设。')).toBeInTheDocument();
    expect(screen.getByText('此部署尚未配置登录与上传验证。')).toBeInTheDocument();
  });

  it('returns through the supplied home action', () => {
    const onBack = vi.fn();
    render(<OnlineWorkshopPage onBack={onBack} apiClient={emptyApiClient} />);

    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows the administrator tab only after the server session confirms the role', async () => {
    const adminMemberClient: WorkshopMemberApiClientLike = {
      ...loggedOutMemberClient,
      getSession: vi.fn(async (): Promise<WorkshopSession> => ({
        authenticated: true,
        user: { userId: 'admin_1', displayName: '管理员甲', avatarRef: null, role: 'admin' }
      }))
    };
    render(<OnlineWorkshopPage
      apiClient={emptyApiClient}
      memberApiClient={adminMemberClient}
      adminApiClient={emptyAdminClient}
    />);

    const adminTab = await screen.findByRole('tab', { name: '管理员' });
    fireEvent.click(adminTab);

    expect(await screen.findByRole('heading', { name: '管理员治理' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '我的上传' }));
    fireEvent.click(await screen.findByRole('button', { name: '退出登录' }));
    expect(await screen.findByText('已退出创意工坊登录。')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('tab', { name: '管理员' })).not.toBeInTheDocument());
  });
});
