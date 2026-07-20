import type { RuntimeSaveSummary } from '../../domain/persistence/SaveRepository';

interface SaveListScreenProps {
  saves: RuntimeSaveSummary[];
  isLoading: boolean;
  error: string | null;
  onLoadSave: (saveId: string) => void;
  onDeleteSave: (saveId: string) => void;
  onBack: () => void;
}

export function SaveListScreen({
  saves,
  isLoading,
  error,
  onLoadSave,
  onDeleteSave,
  onBack
}: SaveListScreenProps) {
  return (
    <main className="menu-screen save-list-screen">
      <section className="menu-panel save-list-panel">
        <div className="screen-title-row">
          <div>
            <p className="home-kicker">Save Archive</p>
            <h1>读取游戏</h1>
          </div>
          <button type="button" onClick={onBack}>
            返回
          </button>
        </div>

        {isLoading ? <p className="muted">正在读取存档...</p> : null}
        {error ? (
          <p className="command-error" role="status">
            {error}
          </p>
        ) : null}
        {!isLoading && saves.length === 0 ? <p className="empty-state">还没有存档。</p> : null}

        <ul className="save-list">
          {saves.map((save) => (
            <li key={save.saveId} className="save-list-item">
              <div className="save-list-item-summary">
                <strong>
                  {save.playerName || '未知玩家'} · 回合 {save.turnCounter}
                </strong>
                <span>游戏时间：{save.gameDateLabel}</span>
                <small>保存时间：{new Date(save.updatedAt).toLocaleString()}</small>
              </div>
              <div className="save-actions">
                <button type="button" onClick={() => onLoadSave(save.saveId)}>
                  读取
                </button>
                <button type="button" onClick={() => onDeleteSave(save.saveId)}>
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
