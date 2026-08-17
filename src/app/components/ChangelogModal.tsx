import { useState } from 'react';
import { releaseNotes } from '../changelog/releaseNotes';
import { APP_VERSION_LABEL } from '../releaseIdentity';

export function ChangelogModal({ onClose }: { onClose: () => void }) {
  const [entryIndex, setEntryIndex] = useState(0);
  const entry = releaseNotes[entryIndex];

  if (!entry) return null;

  const hasNewer = entryIndex > 0;
  const hasOlder = entryIndex < releaseNotes.length - 1;
  const hasMultipleEntries = releaseNotes.length > 1;

  return (
    <div className="changelog-backdrop">
      <section
        className={`changelog-modal${hasMultipleEntries ? '' : ' changelog-modal--single'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
      >
        <header className="changelog-header">
          <div>
            <p>RELEASE NOTES</p>
            <h2 id="changelog-title">更新日志</h2>
          </div>
          <button type="button" aria-label="关闭更新日志" onClick={onClose}>
            ×
          </button>
        </header>

        <article className="changelog-entry" aria-live="polite">
          <div className="changelog-entry-heading">
            <time>{entry.date}</time>
            <span>{hasMultipleEntries ? `${entryIndex + 1} / ${releaseNotes.length}` : APP_VERSION_LABEL}</span>
          </div>
          <div className="changelog-update-list">
            {entry.updates.map((update) => (
              <section className="changelog-update" key={update.id} aria-labelledby={`${update.id}-title`}>
                <div className="changelog-update-heading">
                  <time dateTime={`${entry.id}T${update.time}:00+08:00`}>{update.time}</time>
                  <span>{update.version}</span>
                </div>
                <h3 id={`${update.id}-title`}>{update.title}</h3>
                <p>{update.summary}</p>
                <ul>
                  {update.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            ))}
          </div>
        </article>

        {hasMultipleEntries ? (
          <footer className="changelog-footer">
            <button type="button" disabled={!hasNewer} onClick={() => setEntryIndex((value) => value - 1)}>
              ← 较新一条
            </button>
            <div className="changelog-dots" aria-label="更新日志页码">
              {releaseNotes.map((note, index) => (
                <button
                  key={note.id}
                  type="button"
                  className={index === entryIndex ? 'active' : ''}
                  aria-label={`查看${note.date}更新，共${note.updates.length}项`}
                  aria-current={index === entryIndex ? 'page' : undefined}
                  onClick={() => setEntryIndex(index)}
                />
              ))}
            </div>
            <button type="button" disabled={!hasOlder} onClick={() => setEntryIndex((value) => value + 1)}>
              较早一条 →
            </button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
