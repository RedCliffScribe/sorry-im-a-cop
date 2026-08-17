import { useEffect, useMemo, useState } from 'react';
import {
  countStoryExportEntries,
  createStoryExport,
  type StoryExportArtifact,
  type StoryExportFormat,
  type StoryExportOptions,
  type StoryExportRange
} from '../../domain/storyExport/storyExport';
import type { RuntimeState } from '../../domain/runtime/types';

const RANGE_OPTIONS: Array<{ value: StoryExportRange; label: string; description: string }> = [
  {
    value: 'currentChapter',
    label: '当前章节',
    description: '导出最近一个完整回合，包括该回合的玩家行动与剧情结果。'
  },
  {
    value: 'currentSave',
    label: '当前存档全部正文',
    description: '导出当前存档中已经保存的全部玩家可见剧情。'
  },
  {
    value: 'fromOpening',
    label: '从开局至今',
    description: '当前版本与“当前存档全部正文”范围一致，为未来分卷人生档案预留。'
  }
];

const FORMAT_OPTIONS: Array<{ value: StoryExportFormat; label: string; description: string }> = [
  { value: 'markdown', label: 'Markdown (.md)', description: '适合保存、Discord 分享与二次整理。' },
  { value: 'text', label: '纯文本 (.txt)', description: '兼容多数文字编辑器。' },
  { value: 'html', label: 'HTML (.html)', description: '生成可直接用浏览器阅读的单文件版本。' }
];

const DEFAULT_OPTIONS: StoryExportOptions = {
  range: 'currentChapter',
  format: 'markdown',
  includeTimeLocation: true,
  includeCharacterNames: true,
  includeChapterSeparators: true,
  includePlayerActions: true
};

export function downloadStoryExportArtifact(artifact: StoryExportArtifact): void {
  const blob = new Blob(['\ufeff', artifact.content], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = artifact.fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function StoryExportModal({
  state,
  onClose,
  onDownload = downloadStoryExportArtifact
}: {
  state: RuntimeState;
  onClose: () => void;
  onDownload?: (artifact: StoryExportArtifact) => void;
}) {
  const [options, setOptions] = useState<StoryExportOptions>(DEFAULT_OPTIONS);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const entryCount = useMemo(
    () => countStoryExportEntries(state, options),
    [state, options]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function setRange(range: StoryExportRange) {
    setOptions((current) => ({ ...current, range }));
    setExportStatus(null);
  }

  function setFormat(format: StoryExportFormat) {
    setOptions((current) => ({ ...current, format }));
    setExportStatus(null);
  }

  function setToggle(key: keyof Pick<StoryExportOptions,
    'includeTimeLocation' | 'includeCharacterNames' | 'includeChapterSeparators' | 'includePlayerActions'>) {
    setOptions((current) => ({ ...current, [key]: !current[key] }));
    setExportStatus(null);
  }

  function handleExport() {
    const artifact = createStoryExport(state, options);
    onDownload(artifact);
    setExportStatus(`已生成 ${artifact.fileName}`);
  }

  return (
    <div
      className="diagnostic-backdrop story-export-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="story-export-modal feature-modal-frame feature-modal-frame--utility"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-export-title"
      >
        <header className="story-export-header">
          <div>
            <h2 id="story-export-title">导出剧情</h2>
            <p>STORY EXPORT</p>
          </div>
          <button type="button" onClick={onClose}>关闭</button>
        </header>

        <div className="story-export-body">
          <p className="story-export-intro">
            只导出玩家已经看到的正文与行动，不包含 API 配置、系统提示词、状态补丁或诊断资料。
          </p>

          <fieldset className="story-export-group">
            <legend>导出范围</legend>
            <div className="story-export-option-list">
              {RANGE_OPTIONS.map((option) => (
                <label className="story-export-option" key={option.value}>
                  <input
                    type="radio"
                    name="story-export-range"
                    value={option.value}
                    checked={options.range === option.value}
                    onChange={() => setRange(option.value)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="story-export-group">
            <legend>导出格式</legend>
            <div className="story-export-format-grid">
              {FORMAT_OPTIONS.map((option) => (
                <label className="story-export-option story-export-format-option" key={option.value}>
                  <input
                    type="radio"
                    name="story-export-format"
                    value={option.value}
                    checked={options.format === option.value}
                    onChange={() => setFormat(option.value)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="story-export-group">
            <legend>附加内容</legend>
            <div className="story-export-toggle-grid">
              <label>
                <input
                  type="checkbox"
                  checked={options.includeTimeLocation}
                  onChange={() => setToggle('includeTimeLocation')}
                />
                包含时间地点
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={options.includeCharacterNames}
                  onChange={() => setToggle('includeCharacterNames')}
                />
                包含角色名
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={options.includeChapterSeparators}
                  onChange={() => setToggle('includeChapterSeparators')}
                />
                包含章节分隔
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={options.includePlayerActions}
                  onChange={() => setToggle('includePlayerActions')}
                />
                包含玩家行动
              </label>
            </div>
          </fieldset>

          <aside className="story-export-note">
            <strong>地点记录说明</strong>
            <p>
              现有存档未逐回合保存地点快照。导出会写入真实回合时间，并把当前位置标为“导出时地点”，不会把它误写成历史地点。
            </p>
          </aside>
        </div>

        <footer className="story-export-footer">
          <div>
            <strong>{entryCount > 0 ? `将导出 ${entryCount} 条剧情记录` : '当前没有可导出的剧情记录'}</strong>
            {exportStatus ? <span role="status">{exportStatus}</span> : null}
          </div>
          <button type="button" disabled={entryCount === 0} onClick={handleExport}>
            生成并下载
          </button>
        </footer>
      </section>
    </div>
  );
}
