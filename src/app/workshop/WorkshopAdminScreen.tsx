import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WorkshopApiClient,
  type WorkshopAdminApiClientLike,
  type WorkshopAdminAuditEntryV1,
  type WorkshopAdminItemV1,
  type WorkshopAdminUserV1
} from '../../domain/workshop';

interface WorkshopAdminScreenProps {
  client?: WorkshopAdminApiClientLike;
  currentUserId: string;
}

const itemStatusLabels: Record<WorkshopAdminItemV1['status'], string> = {
  published: '公开',
  unlisted: '未公开',
  disabled: '管理员停用',
  deleted: '用户已删除'
};

const auditLabels: Record<WorkshopAdminAuditEntryV1['action'], string> = {
  item_disabled: '停用条目',
  item_restored: '恢复条目',
  user_suspended: '停用用户',
  user_restored: '恢复用户'
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

export function WorkshopAdminScreen({
  client: suppliedClient,
  currentUserId
}: WorkshopAdminScreenProps) {
  const client = useMemo(() => suppliedClient ?? new WorkshopApiClient(), [suppliedClient]);
  const [items, setItems] = useState<WorkshopAdminItemV1[]>([]);
  const [users, setUsers] = useState<WorkshopAdminUserV1[]>([]);
  const [audit, setAudit] = useState<WorkshopAdminAuditEntryV1[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('正在读取管理员资料……');
  const [busyTarget, setBusyTarget] = useState<string>();

  const refresh = useCallback(async () => {
    const [nextItems, nextUsers, nextAudit] = await Promise.all([
      client.listAdminItems(),
      client.listAdminUsers(),
      client.listAdminAudit()
    ]);
    setItems(nextItems);
    setUsers(nextUsers);
    setAudit(nextAudit);
    setStatus(`已读取 ${nextItems.length} 个条目、${nextUsers.length} 名用户和 ${nextAudit.length} 条审计记录。`);
  }, [client]);

  useEffect(() => {
    let active = true;
    void refresh().catch((error) => {
      if (active) setStatus(`管理员资料读取失败：${errorMessage(error)}`);
    });
    return () => { active = false; };
  }, [refresh]);

  const runAction = async (
    targetId: string,
    label: string,
    action: (reason: string) => Promise<void>
  ): Promise<void> => {
    const reason = reasons[targetId]?.trim() ?? '';
    if (reason.length < 3) {
      setStatus('请先填写至少 3 个字符的管理原因。');
      return;
    }
    if (!window.confirm(`确认${label}？\n\n目标：${targetId}\n原因：${reason}\n\n该操作会写入管理员审计记录。`)) return;
    setBusyTarget(targetId);
    setStatus(`正在${label}……`);
    try {
      await action(reason);
      setReasons((current) => ({ ...current, [targetId]: '' }));
      await refresh();
      setStatus(`${label}完成，管理员审计已写入。`);
    } catch (error) {
      setStatus(`${label}失败：${errorMessage(error)}`);
    } finally {
      setBusyTarget(undefined);
    }
  };

  return (
    <section className="workshop-admin-panel" aria-label="创意工坊管理员">
      <header className="workshop-admin-heading">
        <div>
          <h2>管理员治理</h2>
          <p>下架、恢复和用户停用均由服务端重新校验权限，并写入独立审计记录。</p>
        </div>
        <button type="button" disabled={Boolean(busyTarget)} onClick={() => void refresh()}>刷新</button>
      </header>

      <aside className="workshop-admin-safety-note">
        <strong>紧急停用边界</strong>
        <span>如需立即停止全部新上传，请在服务端关闭 WORKSHOP_UPLOAD_ENABLED；管理员下架仍然可用。</span>
      </aside>

      <section className="workshop-admin-section">
        <h3>公开内容与下架</h3>
        <div className="workshop-admin-list">
          {items.length ? items.map((item) => {
            const canDisable = item.status === 'published' || item.status === 'unlisted';
            const canRestore = item.status === 'disabled';
            return (
              <article key={item.itemId} className={`workshop-admin-card workshop-admin-card--${item.status}`}>
                <div className="workshop-admin-card-copy">
                  <strong>{item.title}</strong>
                  <small>{itemStatusLabels[item.status]} · {item.owner.displayName} · {item.itemId}</small>
                  {item.disabledReason ? <p>停用原因：{item.disabledReason}</p> : null}
                </div>
                {(canDisable || canRestore) ? (
                  <div className="workshop-admin-action">
                    <label>管理原因
                      <input
                        value={reasons[item.itemId] ?? ''}
                        maxLength={1000}
                        onChange={(event) => setReasons((current) => ({ ...current, [item.itemId]: event.target.value }))}
                      />
                    </label>
                    <button
                      type="button"
                      className={canDisable ? 'danger-button' : undefined}
                      disabled={Boolean(busyTarget)}
                      onClick={() => void runAction(
                        item.itemId,
                        canDisable ? `停用“${item.title}”` : `恢复“${item.title}”`,
                        (reason) => canDisable
                          ? client.disableAdminItem(item.itemId, reason)
                          : client.restoreAdminItem(item.itemId, reason)
                      )}
                    >
                      {canDisable ? '停用并阻止下载' : '恢复原可见状态'}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          }) : <p>当前没有工坊条目。</p>}
        </div>
      </section>

      <section className="workshop-admin-section">
        <h3>上传者账号</h3>
        <div className="workshop-admin-list">
          {users.length ? users.map((user) => {
            const protectedRole = user.role === 'admin';
            const isCurrentUser = user.userId === currentUserId;
            return (
              <article key={user.userId} className={`workshop-admin-card workshop-admin-card--${user.status}`}>
                <div className="workshop-admin-card-copy">
                  <strong>{user.displayName}</strong>
                  <small>
                    {protectedRole ? '管理员' : '成员'} · {user.status === 'active' ? '正常' : '已停用'} ·
                    {' '}{user.itemCount} 个条目 / {user.revisionCount} 个修订 / {formatBytes(user.storedBytes)}
                  </small>
                  {protectedRole ? <p>管理员角色受保护；角色变更只能通过受控运维完成。</p> : null}
                </div>
                {!protectedRole && !isCurrentUser ? (
                  <div className="workshop-admin-action">
                    <label>管理原因
                      <input
                        value={reasons[user.userId] ?? ''}
                        maxLength={1000}
                        onChange={(event) => setReasons((current) => ({ ...current, [user.userId]: event.target.value }))}
                      />
                    </label>
                    <button
                      type="button"
                      className={user.status === 'active' ? 'danger-button' : undefined}
                      disabled={Boolean(busyTarget)}
                      onClick={() => void runAction(
                        user.userId,
                        user.status === 'active' ? `停用用户“${user.displayName}”` : `恢复用户“${user.displayName}”`,
                        (reason) => user.status === 'active'
                          ? client.suspendAdminUser(user.userId, reason)
                          : client.restoreAdminUser(user.userId, reason)
                      )}
                    >
                      {user.status === 'active' ? '停用并撤销会话' : '恢复账号'}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          }) : <p>当前没有工坊用户。</p>}
        </div>
      </section>

      <section className="workshop-admin-section">
        <h3>最近管理员审计</h3>
        <div className="workshop-admin-audit-list">
          {audit.length ? audit.map((entry) => (
            <article key={entry.actionId}>
              <strong>{auditLabels[entry.action]}</strong>
              <span>{entry.actor.displayName} · {entry.targetType}:{entry.targetId}</span>
              <p>{entry.reason}</p>
              <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
            </article>
          )) : <p>尚无管理员审计记录。</p>}
        </div>
      </section>

      <p role="status" className="settings-feedback">{status}</p>
    </section>
  );
}
