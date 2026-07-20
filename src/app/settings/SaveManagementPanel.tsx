import type { RuntimeSaveSummary } from '../../domain/persistence/SaveRepository';

export function SaveManagementPanel({ saves }: { saves: RuntimeSaveSummary[] }) {
  return (
    <section className="settings-panel">
      <h2>存档管理</h2>
      {saves.length === 0 ? <p className="empty-state">还没有存档。</p> : null}
      <ul className="compact-list">
        {saves.map((save) => (
          <li key={save.saveId}>
            <strong>{save.saveName}</strong>
            <span>回合 {save.turnCounter}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
