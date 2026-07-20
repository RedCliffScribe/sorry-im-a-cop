export function InactiveSettingsPanel({ title }: { title: string }) {
  return (
    <section className="settings-panel">
      <h2>{title}</h2>
      <p className="muted">这个页面会在对应系统接入时开放。</p>
    </section>
  );
}
