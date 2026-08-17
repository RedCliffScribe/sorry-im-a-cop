import type {
  CurrentSaveContentEntry,
  CurrentSaveContentKind,
  CurrentSaveContentLibrary
} from './currentSaveLibrary';

interface CurrentSaveLibraryPanelProps {
  library: CurrentSaveContentLibrary;
  kind: CurrentSaveContentKind;
  selectedId: string | null;
  onSelect: (entry: CurrentSaveContentEntry) => void;
  operationMessage?: string;
  operationError?: string;
}

function adaptationLabel(entry: CurrentSaveContentEntry): string {
  if (entry.adaptationStatus === 'incompatible') return '不兼容';
  if (entry.adaptationStatus === 'needs_review') return '待审核适配';
  if (entry.hasWorldFacts) return '已成为世界事实';
  if (
    entry.kind === 'events' &&
    entry.instance?.status === 'abandoned'
  ) {
    return '已放弃推进';
  }
  if (
    entry.intent?.status === 'paused' ||
    entry.priorityStatus === 'paused'
  ) {
    return '已暂停';
  }
  return entry.prioritized ? '本局重点' : '已绑定';
}

export function CurrentSaveLibraryPanel({
  library,
  kind,
  selectedId,
  onSelect,
  operationMessage,
  operationError
}: CurrentSaveLibraryPanelProps) {
  const entries =
    kind === 'characters' ? library.characters : library.events;
  return (
    <>
      <div className="ccw-save-context">
        <div>
          <span>当前存档</span>
          <strong>{library.save.saveName}</strong>
          <small>
            {library.save.playerName} · {library.save.gameDateLabel} · 第{' '}
            {library.save.turnCounter} 回合
          </small>
        </div>
        <dl>
          <div>
            <dt>世界包</dt>
            <dd>{library.save.worldpackId}</dd>
          </div>
          <div>
            <dt>本局重点</dt>
            <dd>{library.priorityCount} / 3</dd>
          </div>
          <div>
            <dt>诊断</dt>
            <dd>{library.diagnosticCount}</dd>
          </div>
        </dl>
      </div>

      <div className="ccw-library-toolbar ccw-save-toolbar">
        <div>
          <h2>{kind === 'characters' ? '本局人物绑定' : '本局事件绑定'}</h2>
          <p>这里显示复制进存档的不可变 revision，不依赖全局内容库运行。</p>
        </div>
      </div>

      {operationMessage ? (
        <div className="ccw-operation-message" role="status">
          {operationMessage}
        </div>
      ) : null}
      {operationError ? (
        <div className="ccw-operation-error" role="alert">
          {operationError}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="ccw-empty-state" data-empty-kind="current-save-bound">
          <span className="ccw-empty-glyph" aria-hidden="true">◇</span>
          <h2>
            {kind === 'characters'
              ? '当前存档还没有人物绑定'
              : '当前存档还没有事件绑定'}
          </h2>
          <p>切回“全局内容库”，选择已审核 revision 后加入当前存档。</p>
        </div>
      ) : (
        <div className="ccw-entry-list">
          {entries.map((entry) => (
            <div
              key={entry.bindingId}
              className={`ccw-entry-row${
                selectedId === entry.assetId ? ' active' : ''
              }`}
            >
              <button
                type="button"
                aria-pressed={selectedId === entry.assetId}
                onClick={() => onSelect(entry)}
              >
                <span className="ccw-entry-monogram" aria-hidden="true">
                  {entry.title.slice(0, 1)}
                </span>
                <span className="ccw-entry-copy">
                  <span>
                    <strong>{entry.title}</strong>
                    <small>
                      存档绑定 · revision {entry.revision}
                    </small>
                  </span>
                  <p>{entry.summary}</p>
                </span>
                <span
                  className={`ccw-lifecycle ccw-save-status-${entry.adaptationStatus}`}
                >
                  {adaptationLabel(entry)}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
