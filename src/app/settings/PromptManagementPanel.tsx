import { useMemo, useRef, useState } from 'react';
import {
  createPromptTemplates,
  normalizePromptOverrides,
  promptCategories,
  type PromptCategoryId,
  type PromptTemplateId
} from '../../domain/prompts/promptRegistry';
import type { AiSettings } from '../../domain/settings/types';

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function parsePromptImportPayload(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object') return {};
  const candidate = payload as { prompts?: { overrides?: unknown }; overrides?: unknown; templates?: unknown };
  return normalizePromptOverrides(candidate.prompts?.overrides ?? candidate.overrides ?? candidate.templates);
}

export function PromptManagementPanel({
  settings,
  onChange
}: {
  settings: AiSettings;
  onChange: (settings: AiSettings) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const templates = useMemo(
    () => createPromptTemplates(settings.game.narrativeLengthLevel),
    [settings.game.narrativeLengthLevel]
  );
  const [categoryId, setCategoryId] = useState<PromptCategoryId>('narrative');
  const [templateId, setTemplateId] = useState<PromptTemplateId>('narrative.styleAndDisplay');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const visibleTemplates = templates.filter((template) => template.categoryId === categoryId);
  const selectedTemplate = templates.find((template) => template.id === templateId) ?? templates[0];
  const selectedText = settings.prompts.overrides[selectedTemplate.id] ?? selectedTemplate.defaultText;
  const isOverridden = Object.prototype.hasOwnProperty.call(settings.prompts.overrides, selectedTemplate.id);

  function selectCategory(nextCategoryId: PromptCategoryId) {
    setCategoryId(nextCategoryId);
    const firstTemplate = templates.find((template) => template.categoryId === nextCategoryId);
    if (firstTemplate) setTemplateId(firstTemplate.id);
  }

  function updateSelectedPrompt(text: string) {
    onChange({
      ...settings,
      prompts: {
        ...settings.prompts,
        overrides: {
          ...settings.prompts.overrides,
          [selectedTemplate.id]: text
        }
      }
    });
  }

  function resetSelectedPrompt() {
    const { [selectedTemplate.id]: _removed, ...overrides } = settings.prompts.overrides;
    onChange({
      ...settings,
      prompts: {
        ...settings.prompts,
        overrides
      }
    });
  }

  function resetAllPrompts() {
    onChange({
      ...settings,
      prompts: {
        ...settings.prompts,
        overrides: {}
      }
    });
  }

  function exportPrompts() {
    const effectivePrompts = Object.fromEntries(
      templates.map((template) => [template.id, settings.prompts.overrides[template.id] ?? template.defaultText])
    );
    downloadJson(`cop-v2-prompts-${Date.now()}.json`, {
      version: 1,
      exportedAt: new Date().toISOString(),
      prompts: {
        overrides: effectivePrompts
      },
      templates: effectivePrompts
    });
  }

  async function importPromptFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const overrides = parsePromptImportPayload(JSON.parse(text));
      onChange({
        ...settings,
        prompts: {
          ...settings.prompts,
          overrides
        }
      });
      setImportMessage(`已导入 ${Object.keys(overrides).length} 条提示词覆盖。`);
    } catch {
      setImportMessage('导入失败：文件不是有效提示词 JSON。');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <section className="settings-panel settings-panel-with-scroll">
      <div className="settings-topline">
        <div>
          <h2>提示词管理</h2>
          <p className="muted">管理已接入的静态提示词模块；运行时地图、记忆、天气、资产等状态投影仍由系统生成。</p>
        </div>
        <div className="settings-action-row">
          <button type="button" onClick={exportPrompts}>
            导出提示词
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            导入提示词
          </button>
          <button type="button" onClick={resetAllPrompts}>
            全部重置为默认
          </button>
          <input
            ref={fileInputRef}
            aria-label="导入提示词文件"
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => void importPromptFile(event.target.files?.[0])}
          />
        </div>
      </div>

      <div className="settings-page-scroll">
        <div className="prompt-manager-layout">
        <aside className="prompt-manager-rail" aria-label="提示词分类">
          {promptCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={category.id === categoryId ? 'active' : ''}
              onClick={() => selectCategory(category.id)}
            >
              <strong>{category.label}</strong>
              <span>{category.description}</span>
            </button>
          ))}
        </aside>

        <section className="settings-section prompt-editor-section" aria-label="提示词编辑">
          <div className="prompt-template-tabs" role="tablist" aria-label="提示词模块">
            {visibleTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                role="tab"
                aria-selected={template.id === selectedTemplate.id}
                className={template.id === selectedTemplate.id ? 'active' : ''}
                onClick={() => setTemplateId(template.id)}
              >
                {template.title}
              </button>
            ))}
          </div>
          <div className="prompt-editor-heading">
            <div>
              <h3>{selectedTemplate.title}</h3>
              <p className="muted">{selectedTemplate.description}</p>
            </div>
            <button type="button" disabled={!isOverridden} onClick={resetSelectedPrompt}>
              重置当前项
            </button>
          </div>
          <textarea
            aria-label="提示词正文"
            value={selectedText}
            spellCheck={false}
            onChange={(event) => updateSelectedPrompt(event.target.value)}
          />
          {importMessage ? <p className="muted">{importMessage}</p> : null}
        </section>
        </div>
      </div>
    </section>
  );
}
