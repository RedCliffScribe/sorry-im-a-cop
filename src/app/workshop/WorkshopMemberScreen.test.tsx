import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  WorkshopMemberApiClientLike,
  WorkshopMemberItemV1,
  WorkshopSession
} from '../../domain/workshop';
import { WorkshopMemberScreen } from './WorkshopMemberScreen';

function memberClient(overrides: Partial<WorkshopMemberApiClientLike> = {}): WorkshopMemberApiClientLike {
  return {
    getSession: vi.fn(async (): Promise<WorkshopSession> => ({
      authenticated: true,
      user: { userId: 'user_1', displayName: '测试上传者', avatarRef: null, role: 'member' }
    })),
    startDiscordLogin: vi.fn(),
    logout: vi.fn(),
    listMyItems: vi.fn(async (): Promise<WorkshopMemberItemV1[]> => [{
      itemId: 'item_1',
      kind: 'image-generation-preset',
      title: '人物 CG 风格',
      summary: '一个公开测试条目。',
      language: 'zh-CN',
      contentRating: 'general',
      tags: ['人物'],
      status: 'published',
      disabledReason: null,
      latestRevision: {
        revisionId: 'revision_1',
        revisionNumber: 2,
        schemaVersion: 1,
        packageSha256: 'a'.repeat(64),
        byteSize: 200,
        changelog: '第二版。',
        createdAt: '2026-08-02T00:00:00.000Z'
      },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z'
    }]),
    createItem: vi.fn(),
    createRevision: vi.fn(),
    updateItem: vi.fn(),
    publishItem: vi.fn(),
    unpublishItem: vi.fn(async () => undefined),
    deleteItem: vi.fn(),
    ...overrides
  };
}

describe('WorkshopMemberScreen', () => {
  it('shows only the signed-in member own uploads and owner actions', async () => {
    const client = memberClient();
    render(<WorkshopMemberScreen client={client} />);

    expect(await screen.findByText('测试上传者 · 成员')).toBeInTheDocument();
    expect(screen.getAllByText('人物 CG 风格')).toHaveLength(2);
    expect(screen.getByText('已公开 · revision 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下架' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
  });

  it('uses the owner API when unpublishing and refreshes the list', async () => {
    const client = memberClient();
    render(<WorkshopMemberScreen client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: '下架' }));

    await waitFor(() => expect(client.unpublishItem).toHaveBeenCalledWith('item_1'));
    await waitFor(() => expect(client.listMyItems).toHaveBeenCalledTimes(2));
  });
});
