import { useEffect, useMemo, useState } from 'react';
import type {
  DownloadedWorkshopPackage,
  WorkshopAdminApiClientLike,
  WorkshopApiClientLike,
  WorkshopMemberApiClientLike,
  WorkshopSession
} from '../../domain/workshop';
import { WorkshopApiClient } from '../../domain/workshop';
import { WorkshopPresetTransferPanel } from '../settings/WorkshopPresetTransferPanel';
import { WorkshopBrowseScreen } from './WorkshopBrowseScreen';
import { WorkshopMemberScreen } from './WorkshopMemberScreen';
import { WorkshopAdminScreen } from './WorkshopAdminScreen';

interface OnlineWorkshopPageProps {
  onBack?: () => void;
  apiClient?: WorkshopApiClientLike;
  memberApiClient?: WorkshopMemberApiClientLike;
  adminApiClient?: WorkshopAdminApiClientLike;
  turnstileSiteKey?: string;
}

function returnHome(): void {
  window.location.assign('/');
}

export function OnlineWorkshopPage({
  onBack = returnHome,
  apiClient,
  memberApiClient,
  adminApiClient,
  turnstileSiteKey
}: OnlineWorkshopPageProps) {
  const defaultMemberClient = useMemo(() => new WorkshopApiClient(), []);
  const sessionClient = memberApiClient ?? defaultMemberClient;
  const resolvedAdminClient = adminApiClient ?? defaultMemberClient;
  const [downloadedPackage, setDownloadedPackage] = useState<DownloadedWorkshopPackage>();
  const [session, setSession] = useState<WorkshopSession>();
  const [tab, setTab] = useState<'browse' | 'mine' | 'local' | 'admin'>(() => {
    const query = new URLSearchParams(window.location.search).get('tab');
    return query === 'mine' || query === 'local' || query === 'admin' ? query : 'browse';
  });
  useEffect(() => {
    let active = true;
    void sessionClient.getSession().then((next) => {
      if (!active) return;
      setSession(next);
      if (tab === 'admin' && (!next.authenticated || next.user.role !== 'admin')) setTab('browse');
    }).catch(() => {
      if (active && tab === 'admin') setTab('browse');
    });
    return () => { active = false; };
  }, [sessionClient, tab]);
  const acceptDownloadedPackage = (value: DownloadedWorkshopPackage): void => {
    setDownloadedPackage(value);
    setTab('local');
  };
  return (
    <main className="creative-workshop-screen">
      <div className="creative-workshop-shell">
        <header className="creative-workshop-header">
          <div>
            <p className="creative-workshop-kicker">COMMUNITY CREATIONS</p>
            <h1>创意工坊</h1>
            <p>
              分享、导入和管理可复用的玩家创作。游客可以直接浏览和下载；
              登录成员可以管理自己的文生图预设修订。
            </p>
          </div>
          <button type="button" className="creative-workshop-back" onClick={onBack}>
            返回首页
          </button>
        </header>

        <nav className="creative-workshop-catalog" aria-label="创意工坊内容类型">
          <article className="creative-workshop-catalog-card creative-workshop-catalog-card--active">
            <span>当前开放</span>
            <h2>文生图预设</h2>
            <p>导出脱敏分享包，或把其他玩家的分享包映射到自己的 API 档案。</p>
          </article>
          <article className="creative-workshop-catalog-card">
            <span>后续开放</span>
            <h2>自定义人物</h2>
            <p>预留人物修订、依赖关系与世界适配后的分享入口。</p>
          </article>
          <article className="creative-workshop-catalog-card">
            <span>后续开放</span>
            <h2>自定义事件</h2>
            <p>预留事件项目、人物依赖和版本更新后的分享入口。</p>
          </article>
        </nav>

        <div className="creative-workshop-tabs" role="tablist" aria-label="创意工坊功能">
          <button type="button" role="tab" aria-selected={tab === 'browse'} onClick={() => setTab('browse')}>浏览</button>
          <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>我的上传</button>
          <button type="button" role="tab" aria-selected={tab === 'local'} onClick={() => setTab('local')}>本地导入／导出</button>
          {session?.authenticated && session.user.role === 'admin' ? (
            <button type="button" role="tab" aria-selected={tab === 'admin'} onClick={() => setTab('admin')}>管理员</button>
          ) : null}
        </div>

        {tab === 'browse' ? (
          <WorkshopBrowseScreen apiClient={apiClient} onPackageDownloaded={acceptDownloadedPackage} />
        ) : null}
        {tab === 'mine' ? (
          <WorkshopMemberScreen
            client={sessionClient}
            turnstileSiteKey={turnstileSiteKey}
            onSessionChange={setSession}
          />
        ) : null}
        {tab === 'local' ? (
          <>
            <section className="creative-workshop-local-notice" aria-label="本地导入边界">
              <strong>本地资料与公开上传严格分离</strong>
              <span>本地导出不会自动上传；公开包下载后也必须由你确认映射和导入。</span>
            </section>
            <WorkshopPresetTransferPanel initialRemotePackage={downloadedPackage} />
          </>
        ) : null}
        {tab === 'admin' && session?.authenticated && session.user.role === 'admin' ? (
          <WorkshopAdminScreen client={resolvedAdminClient} currentUserId={session.user.userId} />
        ) : null}
      </div>
    </main>
  );
}
