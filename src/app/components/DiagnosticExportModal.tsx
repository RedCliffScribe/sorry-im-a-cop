import { useState } from 'react';

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export function DiagnosticExportModal({
  text,
  onClose
}: {
  text: string;
  onClose: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function handleCopy() {
    try {
      await copyText(text);
      setCopyStatus('已复制。');
    } catch {
      setCopyStatus('复制失败，请手动选择文本。');
    }
  }

  return (
    <div className="diagnostic-backdrop">
      <section
        className="diagnostic-modal feature-modal-frame feature-modal-frame--utility"
        role="dialog"
        aria-modal="true"
        aria-label="诊断导出"
      >
        <header>
          <div>
            <h2>诊断导出</h2>
            <p>NARRATIVE DIAGNOSTIC</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        <p className="diagnostic-help">
          当前剧情正文、流式正文、最近错误和 runtime 快照会整理在这里，方便复制给我排查。
        </p>
        <textarea aria-label="诊断导出原文" readOnly value={text} />
        <footer>
          <button type="button" onClick={handleCopy}>
            复制全部
          </button>
          {copyStatus ? <span role="status">{copyStatus}</span> : null}
        </footer>
      </section>
    </div>
  );
}
