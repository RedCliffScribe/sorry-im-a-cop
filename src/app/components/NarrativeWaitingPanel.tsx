export function NarrativeWaitingPanel() {
  return (
    <div className="narrative-waiting-panel" role="status" aria-live="polite">
      <div className="narrative-waiting-card">
        <div className="narrative-waiting-objects" aria-hidden="true">
          <div className="narrative-radio">
            <div className="narrative-radio-antenna" />
            <div className="narrative-radio-knobs">
              <span />
              <span />
            </div>
            <div className="narrative-radio-speaker">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="narrative-radio-screen">
              <strong>CH 03</strong>
              <span>RX</span>
              <i />
            </div>
            <div className="narrative-radio-light" />
          </div>
          <div className="narrative-case-note">
            <div className="narrative-case-clip" />
            <strong>案件记录</strong>
            <span className="narrative-note-rule" />
            <span className="narrative-note-line narrative-note-line-1" />
            <span className="narrative-note-line narrative-note-line-2" />
            <span className="narrative-note-line narrative-note-line-3" />
            <span className="narrative-note-line narrative-note-line-4" />
            <span className="narrative-note-line narrative-note-line-5">
              <i />
            </span>
          </div>
        </div>
        <p className="narrative-waiting-primary">正在整理记录……</p>
        <p className="narrative-waiting-secondary">无线电仍在沙沙作响</p>
      </div>
    </div>
  );
}
