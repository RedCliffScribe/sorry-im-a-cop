import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  WorkshopApiClient,
  WorkshopApiError,
  type DownloadedWorkshopPackage,
  type WorkshopApiClientLike,
  type WorkshopPublicContentRating,
  type WorkshopPublicItem
} from '../../domain/workshop';

interface WorkshopBrowseScreenProps {
  apiClient?: WorkshopApiClientLike;
  onPackageDownloaded: (downloaded: DownloadedWorkshopPackage) => void;
}

function messageFor(error: unknown): string {
  if (error instanceof WorkshopApiError) {
    const request = error.requestId ? `（请求 ${error.requestId}）` : '';
    return `${error.message}${request}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(value: number): string {
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KiB`;
}

function formatDownloads(value: number): string {
  return value.toLocaleString('zh-CN');
}

const providerLabels: Record<string, string> = {
  'openai-images': 'OpenAI',
  'xai-images': 'xAI',
  'gemini-image': 'Gemini',
  'alibaba-model-studio': '阿里云百炼',
  'novelai-image': 'NovelAI',
  'comfyui-workflow': 'ComfyUI',
  'sd-webui': 'SD WebUI'
};

const purposeLabels: Record<string, string> = {
  'avatar-close-up': '头像近景',
  'half-body-medium': '半身',
  'knee-up-medium-full': '膝上',
  'full-body': '全身',
  'narrative-scene': '剧情场景'
};

function compactLabels(values: string[], labels: Record<string, string>): string {
  return values.length ? values.map((value) => labels[value] ?? value).join('、') : '未声明';
}

export function WorkshopBrowseScreen({
  apiClient,
  onPackageDownloaded
}: WorkshopBrowseScreenProps) {
  const client = useMemo(() => apiClient ?? new WorkshopApiClient(), [apiClient]);
  const [items, setItems] = useState<WorkshopPublicItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [purpose, setPurpose] = useState('');
  const [rating, setRating] = useState<WorkshopPublicContentRating>('general');
  const [selected, setSelected] = useState<WorkshopPublicItem>();
  const [status, setStatus] = useState('正在读取公开工坊……');
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (cursor?: string): Promise<void> => {
    setBusy(true);
    setStatus(cursor ? '正在读取更多内容……' : '正在读取公开工坊……');
    try {
      const result = await client.listItems({
        q: query,
        provider: provider || undefined,
        purpose: purpose || undefined,
        rating,
        cursor,
        limit: 20
      });
      setItems((current) => cursor ? [...current, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
      setStatus(result.items.length
        ? `已读取 ${result.items.length} 个公开预设。`
        : '当前筛选条件下没有公开预设。');
    } catch (error) {
      if (!cursor) setItems([]);
      setStatus(messageFor(error));
    } finally {
      setBusy(false);
    }
  }, [client, provider, purpose, query, rating]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = (event: FormEvent): void => {
    event.preventDefault();
    setSelected(undefined);
    void load();
  };

  const showDetail = async (item: WorkshopPublicItem): Promise<void> => {
    setStatus(`正在读取「${item.title}」详情……`);
    try {
      const detail = await client.getItem(item.itemId);
      setSelected(detail);
      setStatus('详情已读取。');
    } catch (error) {
      setStatus(messageFor(error));
    }
  };

  const download = async (item: WorkshopPublicItem): Promise<void> => {
    setBusy(true);
    setStatus(`正在下载并校验「${item.title}」……`);
    try {
      const downloaded = await client.downloadItem(item);
      setItems((current) => current.map((entry) => entry.itemId === item.itemId
        ? { ...entry, downloadCount: entry.downloadCount + 1 }
        : entry));
      setSelected((current) => current?.itemId === item.itemId
        ? { ...current, downloadCount: current.downloadCount + 1 }
        : current);
      onPackageDownloaded(downloaded);
      setStatus('分享包已下载并通过完整性校验，请在下方选择本地 API 档案后导入。');
    } catch (error) {
      setStatus(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workshop-online-browser" aria-labelledby="workshop-online-heading">
      <div className="workshop-online-heading-row">
        <div>
          <p className="creative-workshop-kicker">PUBLIC LIBRARY</p>
          <h2 id="workshop-online-heading">浏览公开预设</h2>
          <p>匿名只读浏览。成熟内容默认隐藏；下载后仍需映射到你自己的 API 档案。</p>
        </div>
      </div>

      <form className="workshop-browser-filters" onSubmit={submitSearch}>
        <label>
          搜索
          <input value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          供应商
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="">全部</option>
            <option value="openai-images">OpenAI Images</option>
            <option value="xai-images">xAI Images</option>
            <option value="gemini-image">Gemini Image</option>
            <option value="alibaba-model-studio">阿里云百炼</option>
            <option value="novelai-image">NovelAI</option>
            <option value="comfyui-workflow">ComfyUI</option>
            <option value="sd-webui">SD WebUI</option>
          </select>
        </label>
        <label>
          用途
          <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
            <option value="">全部</option>
            <option value="avatar-close-up">头像近景</option>
            <option value="half-body-medium">半身</option>
            <option value="knee-up-medium-full">膝上</option>
            <option value="full-body">全身</option>
            <option value="narrative-scene">剧情场景</option>
          </select>
        </label>
        <label>
          内容分级
          <select
            value={rating}
            onChange={(event) => setRating(event.target.value as WorkshopPublicContentRating)}
          >
            <option value="general">通用（默认）</option>
            <option value="mature">成熟内容</option>
          </select>
        </label>
        <button type="submit" disabled={busy}>应用筛选</button>
      </form>

      <p className="workshop-browser-status" role="status">{status}</p>

      {items.length ? (
        <div className="workshop-public-list" role="list" aria-label="公开预设条目">
          {items.map((item) => (
            <article key={item.itemId} className="workshop-public-row" role="listitem">
              <div className="workshop-public-row-main">
                <div className="workshop-public-row-heading">
                  <span>{item.contentRating === 'mature' ? '成熟' : '通用'}</span>
                  <h3 title={item.title}>{item.title}</h3>
                </div>
                <p title={item.summary}>{item.summary}</p>
                <small>
                  上传者：{item.author.displayName} · 下载 {formatDownloads(item.downloadCount)} 次 · 修订 {item.latestRevision.revisionNumber}
                </small>
              </div>
              <div className="workshop-public-row-compatibility">
                <span title={item.latestRevision.compatibility.providerTypes.join(' / ')}>
                  <small>供应商</small>
                  <strong>{compactLabels(item.latestRevision.compatibility.providerTypes, providerLabels)}</strong>
                </span>
                <span title={item.latestRevision.compatibility.purposes.join(' / ')}>
                  <small>用途</small>
                  <strong>{compactLabels(item.latestRevision.compatibility.purposes, purposeLabels)}</strong>
                </span>
              </div>
              <div className="workshop-public-row-size">
                <small>大小</small>
                <strong>{formatBytes(item.latestRevision.byteSize)}</strong>
              </div>
              <div className="workshop-public-row-actions">
                <button type="button" onClick={() => void showDetail(item)}>查看详情</button>
                <button type="button" disabled={busy} onClick={() => void download(item)}>下载并校验</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {nextCursor ? (
        <button type="button" className="workshop-load-more" disabled={busy} onClick={() => void load(nextCursor)}>
          读取更多
        </button>
      ) : null}

      {selected ? (
        <aside className="workshop-public-detail" aria-label="公开预设详情">
          <div>
            <strong>{selected.title}</strong>
            <button type="button" onClick={() => setSelected(undefined)}>关闭详情</button>
          </div>
          <p>{selected.summary}</p>
          <p>上传者：{selected.author.displayName}</p>
          <p>成功下载：{formatDownloads(selected.downloadCount)} 次</p>
          <p>变更说明：{selected.latestRevision.changelog}</p>
          <p>最低版本：{selected.latestRevision.compatibility.minAppVersion}</p>
          <p className="workshop-public-hash">SHA-256：{selected.latestRevision.packageSha256}</p>
        </aside>
      ) : null}
    </section>
  );
}
