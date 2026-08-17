import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WorkshopApiClient,
  type LoadedWorkshopPackage,
  type WorkshopMemberApiClientLike,
  type WorkshopSession,
  loadImageGenerationWorkshopPackage,
  type WorkshopMemberItemV1
} from '../../domain/workshop';
import { WorkshopTurnstile } from './WorkshopTurnstile';

interface WorkshopMemberScreenProps {
  client?: WorkshopMemberApiClientLike;
  turnstileSiteKey?: string;
  onSessionChange?: (session: WorkshopSession) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const statusLabels: Record<WorkshopMemberItemV1['status'], string> = {
  published: '已公开',
  unlisted: '已下架',
  disabled: '管理员停用',
  deleted: '已删除'
};

interface UploadDraft {
  loadedPackage?: LoadedWorkshopPackage;
  fileName?: string;
  changelog: string;
  rightsConfirmed: boolean;
  idempotencyKey: string;
}

function emptyUploadDraft(): UploadDraft {
  return { changelog: '', rightsConfirmed: false, idempotencyKey: createIdempotencyKey() };
}

export function WorkshopMemberScreen({
  client: suppliedClient,
  turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY,
  onSessionChange
}: WorkshopMemberScreenProps) {
  const client = useMemo(() => suppliedClient ?? new WorkshopApiClient(), [suppliedClient]);
  const [session, setSession] = useState<WorkshopSession>();
  const [items, setItems] = useState<WorkshopMemberItemV1[]>([]);
  const [status, setStatus] = useState('正在读取登录状态……');
  const [loginToken, setLoginToken] = useState('');
  const [uploadToken, setUploadToken] = useState('');
  const [loginReset, setLoginReset] = useState(0);
  const [uploadReset, setUploadReset] = useState(0);
  const [createDraft, setCreateDraft] = useState<UploadDraft>(emptyUploadDraft);
  const [revisionDraft, setRevisionDraft] = useState<UploadDraft>(emptyUploadDraft);
  const [revisionItemId, setRevisionItemId] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshItems = useCallback(async () => {
    const next = await client.listMyItems();
    setItems(next);
    if (!revisionItemId && next.length) setRevisionItemId(next[0].itemId);
  }, [client, revisionItemId]);

  useEffect(() => {
    let active = true;
    void client.getSession().then(async (next) => {
      if (!active) return;
      setSession(next);
      onSessionChange?.(next);
      if (next.authenticated) {
        setStatus(`已登录：${next.user.displayName}`);
        const mine = await client.listMyItems();
        if (!active) return;
        setItems(mine);
        if (mine.length) setRevisionItemId(mine[0].itemId);
      } else {
        setStatus('登录后可以发布和管理自己的文生图预设。');
      }
    }).catch((error) => {
      if (active) setStatus(`登录状态读取失败：${errorMessage(error)}`);
    });
    return () => { active = false; };
  }, [client, onSessionChange]);

  const loadDraftFile = async (
    file: File | undefined,
    setter: React.Dispatch<React.SetStateAction<UploadDraft>>
  ): Promise<void> => {
    if (!file) return;
    try {
      const loadedPackage = await loadImageGenerationWorkshopPackage(await file.text());
      setter((current) => ({
        ...current,
        loadedPackage,
        fileName: file.name,
        idempotencyKey: createIdempotencyKey()
      }));
      setStatus(`已在本地校验：${loadedPackage.workshopPackage.manifest.title}`);
    } catch (error) {
      setter((current) => ({ ...current, loadedPackage: undefined, fileName: undefined }));
      setStatus(`分享包无效：${errorMessage(error)}`);
    }
  };

  const startLogin = async (): Promise<void> => {
    if (!loginToken) return;
    setBusy(true);
    setStatus('正在前往 Discord 登录……');
    try {
      const authorizationUrl = await client.startDiscordLogin(loginToken);
      window.location.assign(authorizationUrl);
    } catch (error) {
      setStatus(`登录未开始：${errorMessage(error)}`);
      setLoginReset((value) => value + 1);
      setBusy(false);
    }
  };

  const logout = async (): Promise<void> => {
    setBusy(true);
    try {
      await client.logout();
      const loggedOutSession = { authenticated: false } as const;
      setSession(loggedOutSession);
      onSessionChange?.(loggedOutSession);
      setItems([]);
      setStatus('已退出创意工坊登录。');
    } catch (error) {
      setStatus(`退出失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const publish = async (mode: 'create' | 'revision'): Promise<void> => {
    const draft = mode === 'create' ? createDraft : revisionDraft;
    if (!draft.loadedPackage || !draft.rightsConfirmed || !draft.changelog.trim() || !uploadToken) return;
    setBusy(true);
    setStatus(mode === 'create' ? '正在发布新条目……' : '正在发布不可变新修订……');
    try {
      const input = {
        changelog: draft.changelog.trim(),
        rightsConfirmed: true as const,
        turnstileToken: uploadToken,
        idempotencyKey: draft.idempotencyKey
      };
      const result = mode === 'create'
        ? await client.createItem(draft.loadedPackage, input)
        : await client.createRevision(revisionItemId, draft.loadedPackage, input);
      setStatus(`发布完成：revision ${result.revisionNumber}。`);
      if (mode === 'create') setCreateDraft(emptyUploadDraft());
      else setRevisionDraft(emptyUploadDraft());
      await refreshItems();
    } catch (error) {
      setStatus(`发布失败：${errorMessage(error)} 原分享包和防重复标识已保留，可直接重试。`);
    } finally {
      setUploadReset((value) => value + 1);
      setBusy(false);
    }
  };

  const mutateStatus = async (
    item: WorkshopMemberItemV1,
    action: 'publish' | 'unpublish' | 'delete'
  ): Promise<void> => {
    if (action === 'delete' && !window.confirm(`确定删除“${item.title}”吗？这是软删除，不会立即清理历史修订。`)) return;
    setBusy(true);
    try {
      if (action === 'publish') await client.publishItem(item.itemId);
      else if (action === 'unpublish') await client.unpublishItem(item.itemId);
      else await client.deleteItem(item.itemId);
      await refreshItems();
      setStatus(action === 'publish' ? '条目已重新公开。' : action === 'unpublish' ? '条目已下架。' : '条目已软删除。');
    } catch (error) {
      setStatus(`操作失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!session) return <section className="workshop-member-panel"><p role="status">{status}</p></section>;

  if (!session.authenticated) {
    return (
      <section className="workshop-member-panel" aria-label="Discord 登录">
        <h2>我的上传</h2>
        <p>Discord 只用于确认上传者身份，授权范围仅为基础身份信息。游客浏览和下载不需要登录。</p>
        <WorkshopTurnstile
          siteKey={turnstileSiteKey}
          action="workshop_login"
          resetKey={loginReset}
          onTokenChange={setLoginToken}
        />
        <button type="button" disabled={busy || !loginToken} onClick={() => void startLogin()}>
          使用 Discord 登录
        </button>
        <p role="status" className="settings-feedback">{status}</p>
      </section>
    );
  }

  return (
    <section className="workshop-member-panel" aria-label="我的上传">
      <div className="workshop-member-heading">
        <div>
          <h2>我的上传</h2>
          <p>{session.user.displayName} · {session.user.role === 'admin' ? '管理员' : '成员'}</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void logout()}>退出登录</button>
      </div>

      <div className="workshop-upload-grid">
        <section className="workshop-upload-card">
          <h3>发布新条目</h3>
          <label>选择已脱敏分享包
            <input type="file" accept="application/json,.json" onChange={(event) => void loadDraftFile(event.target.files?.[0], setCreateDraft)} />
          </label>
          {createDraft.fileName ? <small>{createDraft.fileName}</small> : null}
          <label>首个修订说明
            <textarea value={createDraft.changelog} maxLength={2000} onChange={(event) => setCreateDraft((current) => ({ ...current, changelog: event.target.value }))} />
          </label>
          <label className="settings-checkbox-line">
            <input type="checkbox" checked={createDraft.rightsConfirmed} onChange={(event) => setCreateDraft((current) => ({ ...current, rightsConfirmed: event.target.checked }))} />
            <span>我确认有权分享该内容，并同意公开标题、摘要、标签及包内预设。</span>
          </label>
          <button type="button" disabled={busy || !createDraft.loadedPackage || !createDraft.changelog.trim() || !createDraft.rightsConfirmed || !uploadToken} onClick={() => void publish('create')}>
            校验并即时发布
          </button>
        </section>

        <section className="workshop-upload-card">
          <h3>发布新修订</h3>
          <label>目标条目
            <select value={revisionItemId} onChange={(event) => setRevisionItemId(event.target.value)}>
              <option value="">请选择</option>
              {items.filter((item) => item.status === 'published' || item.status === 'unlisted').map((item) => (
                <option key={item.itemId} value={item.itemId}>{item.title}</option>
              ))}
            </select>
          </label>
          <label>选择新分享包
            <input type="file" accept="application/json,.json" onChange={(event) => void loadDraftFile(event.target.files?.[0], setRevisionDraft)} />
          </label>
          <label>修订说明
            <textarea value={revisionDraft.changelog} maxLength={2000} onChange={(event) => setRevisionDraft((current) => ({ ...current, changelog: event.target.value }))} />
          </label>
          <label className="settings-checkbox-line">
            <input type="checkbox" checked={revisionDraft.rightsConfirmed} onChange={(event) => setRevisionDraft((current) => ({ ...current, rightsConfirmed: event.target.checked }))} />
            <span>我确认本修订仍符合公开分享规则。</span>
          </label>
          <button type="button" disabled={busy || !revisionItemId || !revisionDraft.loadedPackage || !revisionDraft.changelog.trim() || !revisionDraft.rightsConfirmed || !uploadToken} onClick={() => void publish('revision')}>
            发布不可变新修订
          </button>
        </section>
      </div>

      <WorkshopTurnstile
        siteKey={turnstileSiteKey}
        action="workshop_upload"
        resetKey={uploadReset}
        onTokenChange={setUploadToken}
      />

      <div className="workshop-owned-list">
        <h3>已创建条目</h3>
        {items.length ? items.map((item) => (
          <article key={item.itemId} className={`workshop-owned-item workshop-owned-item--${item.status}`}>
            <div>
              <strong>{item.title}</strong>
              <small>{statusLabels[item.status]} · revision {item.latestRevision?.revisionNumber ?? '—'}</small>
              <p>{item.summary}</p>
              {item.disabledReason ? <p className="workshop-item-warning">停用原因：{item.disabledReason}</p> : null}
            </div>
            <div className="workshop-owned-actions">
              {item.status === 'published' ? (
                <button type="button" disabled={busy} onClick={() => void mutateStatus(item, 'unpublish')}>下架</button>
              ) : item.status === 'unlisted' ? (
                <button type="button" disabled={busy} onClick={() => void mutateStatus(item, 'publish')}>重新公开</button>
              ) : null}
              {(item.status === 'published' || item.status === 'unlisted') ? (
                <button type="button" className="danger-button" disabled={busy} onClick={() => void mutateStatus(item, 'delete')}>删除</button>
              ) : null}
            </div>
          </article>
        )) : <p>你还没有发布过内容。</p>}
      </div>
      <p role="status" className="settings-feedback">{status}</p>
    </section>
  );
}
