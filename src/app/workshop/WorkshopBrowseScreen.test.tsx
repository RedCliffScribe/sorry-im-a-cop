import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  DownloadedWorkshopPackage,
  WorkshopApiClientLike,
  WorkshopPublicItem
} from '../../domain/workshop';
import { WorkshopBrowseScreen } from './WorkshopBrowseScreen';

function publicItem(): WorkshopPublicItem {
  return {
    itemId: 'item_public_1',
    kind: 'image-generation-preset',
    slug: 'hong-kong-cg',
    title: '香港人物 CG 预设',
    summary: '适用于人物近景。',
    language: 'zh-CN',
    contentRating: 'general',
    tags: ['香港', '人物'],
    author: { authorId: 'author_1', displayName: '测试作者', avatarRef: null },
    downloadCount: 1286,
    latestRevision: {
      revisionId: 'revision_1',
      revisionNumber: 1,
      schemaVersion: 1,
      packageSha256: 'a'.repeat(64),
      byteSize: 2048,
      compatibility: {
        providerTypes: ['novelai-image'],
        purposes: ['avatar-close-up'],
        modelHints: ['nai-diffusion-4-5-curated'],
        requiredFeatures: [],
        minAppVersion: '1.7.49'
      },
      changelog: '首个公开修订。',
      createdAt: '2026-08-02T00:00:00.000Z'
    },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T01:00:00.000Z'
  };
}

describe('WorkshopBrowseScreen', () => {
  it('browses anonymously, keeps mature hidden by default and opens details', async () => {
    const item = publicItem();
    const client: WorkshopApiClientLike = {
      listItems: vi.fn(async () => ({ items: [item], nextCursor: null, requestId: 'request_1' })),
      getItem: vi.fn(async () => item),
      downloadItem: vi.fn()
    };
    render(<WorkshopBrowseScreen apiClient={client} onPackageDownloaded={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: item.title })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '公开预设条目' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('NovelAI');
    expect(screen.getByRole('listitem')).toHaveTextContent('头像近景');
    expect(screen.getByRole('listitem')).toHaveTextContent('2.0 KiB');
    expect(screen.getByRole('listitem')).toHaveTextContent('上传者：测试作者');
    expect(screen.getByRole('listitem')).toHaveTextContent('下载 1,286 次');
    expect(client.listItems).toHaveBeenCalledWith(expect.objectContaining({ rating: 'general' }));
    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
    expect(await screen.findByText(`变更说明：${item.latestRevision.changelog}`)).toBeInTheDocument();
    expect(screen.getByText('上传者：测试作者')).toBeInTheDocument();
    expect(screen.getByText('成功下载：1,286 次')).toBeInTheDocument();
    expect(screen.getByText(/SHA-256：a{64}/)).toBeInTheDocument();
  });

  it('hands a verified download to the local import boundary', async () => {
    const item = publicItem();
    const downloaded = {
      loadedPackage: { packageSha256: 'b'.repeat(64) },
      sourceMetadata: {
        itemId: item.itemId,
        revisionId: item.latestRevision.revisionId,
        authorDisplayName: item.author.displayName
      }
    } as DownloadedWorkshopPackage;
    const onPackageDownloaded = vi.fn();
    const client: WorkshopApiClientLike = {
      listItems: vi.fn(async () => ({ items: [item], nextCursor: null, requestId: 'request_1' })),
      getItem: vi.fn(async () => item),
      downloadItem: vi.fn(async () => downloaded)
    };
    render(<WorkshopBrowseScreen apiClient={client} onPackageDownloaded={onPackageDownloaded} />);

    fireEvent.click(await screen.findByRole('button', { name: '下载并校验' }));
    await waitFor(() => expect(onPackageDownloaded).toHaveBeenCalledWith(downloaded));
    expect(screen.getByRole('listitem')).toHaveTextContent('下载 1,287 次');
    expect(screen.getByText(/分享包已下载并通过完整性校验/)).toBeInTheDocument();
  });
});
