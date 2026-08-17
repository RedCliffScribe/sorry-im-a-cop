import { useEffect, useRef, useState } from 'react';
import {
  importPngStyleFile,
  parsePngStyleLibraryArchive,
  pngStyleLibrarySettingsSchema,
  pngStylePresetSchema,
  serializePngStyleLibrary,
  tokenizePrompt,
  type PngStyleImportDraft,
  type PngStyleLibrarySettings,
  type PngStyleParameterDraft,
  type PngStylePreset,
  type PngStyleRepository
} from '../../domain/imageGeneration/pngStyle';

interface PngStyleLibraryPanelProps {
  repository: PngStyleRepository;
  onApplyParameterDraft?: (draft: PngStyleParameterDraft, presetName: string) => string;
  canApplyParameterDraft: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'PNG 画风操作失败。';
}

function replacePreset(
  settings: PngStyleLibrarySettings,
  preset: PngStylePreset
): PngStyleLibrarySettings {
  const exists = settings.presets.some((item) => item.pngStylePresetId === preset.pngStylePresetId);
  return {
    ...settings,
    presets: exists
      ? settings.presets.map((item) =>
          item.pngStylePresetId === preset.pngStylePresetId ? preset : item)
      : [...settings.presets, preset]
  };
}

function downloadText(contents: string, name: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function commaTokens(value: string): string[] {
  return tokenizePrompt(value)
    .filter((token, index, values) =>
      values.findIndex((candidate) =>
        candidate.toLocaleLowerCase('en-US') === token.toLocaleLowerCase('en-US')
      ) === index);
}

export function PngStyleLibraryPanel({
  repository,
  onApplyParameterDraft,
  canApplyParameterDraft
}: PngStyleLibraryPanelProps) {
  const [settings, setSettings] = useState<PngStyleLibrarySettings>();
  const [draft, setDraft] = useState<PngStyleImportDraft>();
  const [status, setStatus] = useState('正在读取 PNG 画风库。');
  const [busy, setBusy] = useState(false);
  const libraryImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void repository.load().then((loaded) => {
      if (!active) return;
      setSettings(loaded);
      setStatus(loaded.presets.length ? `已载入 ${loaded.presets.length} 套 PNG 画风。` : 'PNG 画风库为空。');
    }).catch((error) => {
      if (active) setStatus(errorMessage(error));
    });
    return () => { active = false; };
  }, [repository]);

  const saveSettings = async (
    candidate: PngStyleLibrarySettings,
    message: string
  ): Promise<PngStyleLibrarySettings> => {
    const now = new Date().toISOString();
    const next = pngStyleLibrarySettingsSchema.parse({
      ...candidate,
      revision: candidate.revision + 1,
      updatedAt: now
    });
    await repository.save(next);
    setSettings(next);
    setStatus(message.replace('{revision}', String(next.revision)));
    return next;
  };

  const importPng = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus('正在本地读取 PNG 元数据；不会上传图片或执行其中的 workflow。');
    try {
      const imported = await importPngStyleFile(file);
      setDraft(imported);
      setStatus('PNG 已解析为待确认画风草稿；尚未保存或启用。');
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const updateDraftPreset = (update: (preset: PngStylePreset) => PngStylePreset) => {
    setDraft((current) => current
      ? { ...current, preset: update(structuredClone(current.preset)) }
      : current);
  };

  const saveDraft = async () => {
    if (!settings || !draft) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const preset = pngStylePresetSchema.parse({
        ...draft.preset,
        updatedAt: now
      });
      await saveSettings(
        replacePreset(settings, preset),
        `PNG 画风“${preset.name}”已保存；库修订 {revision}。`
      );
      setDraft(undefined);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const editPreset = (preset: PngStylePreset) => {
    setDraft({
      preset: structuredClone(preset),
      classification: {
        artistTokens: structuredClone(preset.artistTokens),
        reusableStyleTokens: commaTokens(preset.tagStyle.positive),
        qualityTokens: [],
        excludedSubjectTokens: [],
        unclassifiedTokens: [],
        negativeStyleTokens: commaTokens(preset.tagStyle.negative)
      },
      warnings: ['正在编辑已保存预设；保存后只影响之后新建的图片任务。']
    });
  };

  const deletePreset = async (presetId: string) => {
    if (!settings) return;
    const presets = settings.presets.filter((preset) => preset.pngStylePresetId !== presetId);
    const selection = Object.fromEntries(
      Object.entries(settings.selection).filter(([, value]) => value !== presetId)
    );
    try {
      await saveSettings({ ...settings, presets, selection }, 'PNG 画风已删除；库修订 {revision}。');
      if (draft?.preset.pngStylePresetId === presetId) setDraft(undefined);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const updateSelection = (
    key: keyof PngStyleLibrarySettings['selection'],
    value: string
  ) => {
    setSettings((current) => current ? {
      ...current,
      selection: {
        ...current.selection,
        [key]: value || undefined
      }
    } : current);
    setStatus('PNG 画风选择有未保存修改。');
  };

  const importLibrary = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const imported = parsePngStyleLibraryArchive(await file.text());
      const next = pngStyleLibrarySettingsSchema.parse({
        ...imported,
        revision: (settings?.revision ?? imported.revision) + 1,
        updatedAt: new Date().toISOString()
      });
      await repository.save(next);
      setSettings(next);
      setDraft(undefined);
      setStatus(`PNG 画风库已导入并保存，当前修订 ${next.revision}。`);
    } catch (error) {
      setStatus(`导入失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
      if (libraryImportRef.current) libraryImportRef.current.value = '';
    }
  };

  if (!settings) {
    return <p className="image-settings-gate-note" role="status">{status}</p>;
  }

  const renderSelectionOptions = () => (
    <>
      <option value="">不使用 PNG 画风</option>
      {settings.presets.map((preset) => (
        <option key={preset.pngStylePresetId} value={preset.pngStylePresetId}>{preset.name}</option>
      ))}
    </>
  );

  return (
    <section className="png-style-library" aria-label="PNG 画风库">
      <div className="image-settings-section-heading">
        <div>
          <p className="image-settings-kicker">PNG STYLE ASSETS</p>
          <h3>PNG 画风库</h3>
        </div>
        <span>{settings.presets.length} 套 · 修订 {settings.revision}</span>
      </div>
      <p>
        本功能只在本机读取 PNG 元数据并建立可编辑画风资产。ComfyUI workflow、checkpoint、模型、seed 与 LoRA
        都不会被执行或自动加载；LoRA 触发词会隔离并默认停用。
      </p>

      <div className="png-style-toolbar">
        <label className="image-settings-file">
          导入 PNG 画风
          <input
            aria-label="导入 PNG 画风文件"
            type="file"
            accept="image/png,.png"
            disabled={busy}
            onChange={(event) => void importPng(event.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => downloadText(
            serializePngStyleLibrary(settings),
            `sorry-im-a-cop-v2-png-styles-${new Date().toISOString().slice(0, 10)}.json`
          )}
        >
          导出画风库
        </button>
        <button type="button" disabled={busy} onClick={() => libraryImportRef.current?.click()}>
          导入画风库
        </button>
        <input
          ref={libraryImportRef}
          aria-label="导入 PNG 画风库文件"
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void importLibrary(event.target.files?.[0])}
        />
      </div>

      {draft ? (
        <section className="png-style-editor" aria-label="PNG 画风草稿">
          <div className="image-settings-section-heading">
            <div><p className="image-settings-kicker">REVIEW BEFORE SAVE</p><h4>确认画风草稿</h4></div>
            <span>{draft.preset.source.format}</span>
          </div>
          {draft.warnings.map((warning) => (
            <p key={warning} className="image-settings-gate-note">{warning}</p>
          ))}
          <div className="png-style-grid">
            <label>预设名称<input
              value={draft.preset.name}
              onChange={(event) => updateDraftPreset((preset) => ({ ...preset, name: event.target.value }))}
            /></label>
            <label>画师标签（逗号分隔，原文保存）<textarea
              value={draft.preset.artistTokens.join(', ')}
              onChange={(event) => updateDraftPreset((preset) => ({
                ...preset,
                artistTokens: commaTokens(event.target.value)
              }))}
            /></label>
            <label>Tag 模型正向画风<textarea
              value={draft.preset.tagStyle.positive}
              onChange={(event) => updateDraftPreset((preset) => ({
                ...preset,
                tagStyle: { ...preset.tagStyle, positive: event.target.value }
              }))}
            /></label>
            <label>Tag 模型负向画风<textarea
              value={draft.preset.tagStyle.negative}
              onChange={(event) => updateDraftPreset((preset) => ({
                ...preset,
                tagStyle: { ...preset.tagStyle, negative: event.target.value }
              }))}
            /></label>
            <label>自然语言全局正向<textarea
              value={draft.preset.naturalLanguageStyle.global.positive}
              onChange={(event) => updateDraftPreset((preset) => ({
                ...preset,
                naturalLanguageStyle: {
                  ...preset.naturalLanguageStyle,
                  global: { ...preset.naturalLanguageStyle.global, positive: event.target.value }
                }
              }))}
            /></label>
            <label>自然语言全局负向<textarea
              value={draft.preset.naturalLanguageStyle.global.negative}
              onChange={(event) => updateDraftPreset((preset) => ({
                ...preset,
                naturalLanguageStyle: {
                  ...preset.naturalLanguageStyle,
                  global: { ...preset.naturalLanguageStyle.global, negative: event.target.value }
                }
              }))}
            /></label>
            <label>人物图补充正向<textarea
              value={draft.preset.naturalLanguageStyle.character.positive}
              onChange={(event) => updateDraftPreset((preset) => ({
                ...preset,
                naturalLanguageStyle: {
                  ...preset.naturalLanguageStyle,
                  character: { ...preset.naturalLanguageStyle.character, positive: event.target.value }
                }
              }))}
            /></label>
            <label>人物图补充负向<textarea
              value={draft.preset.naturalLanguageStyle.character.negative}
              onChange={(event) => updateDraftPreset((preset) => ({
                ...preset,
                naturalLanguageStyle: {
                  ...preset.naturalLanguageStyle,
                  character: { ...preset.naturalLanguageStyle.character, negative: event.target.value }
                }
              }))}
            /></label>
            <label>场景图补充正向<textarea
              value={draft.preset.naturalLanguageStyle.scene.positive}
              onChange={(event) => updateDraftPreset((preset) => ({
                ...preset,
                naturalLanguageStyle: {
                  ...preset.naturalLanguageStyle,
                  scene: { ...preset.naturalLanguageStyle.scene, positive: event.target.value }
                }
              }))}
            /></label>
            <label>场景图补充负向<textarea
              value={draft.preset.naturalLanguageStyle.scene.negative}
              onChange={(event) => updateDraftPreset((preset) => ({
                ...preset,
                naturalLanguageStyle: {
                  ...preset.naturalLanguageStyle,
                  scene: { ...preset.naturalLanguageStyle.scene, negative: event.target.value }
                }
              }))}
            /></label>
          </div>

          {draft.preset.protectedTokens.length ? (
            <fieldset>
              <legend>受保护触发词（默认停用）</legend>
              {draft.preset.protectedTokens.map((token, index) => (
                <label key={`${token.kind}:${token.value}`}>
                  <input
                    type="checkbox"
                    checked={token.enabled}
                    onChange={(event) => updateDraftPreset((preset) => ({
                      ...preset,
                      protectedTokens: preset.protectedTokens.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, enabled: event.target.checked } : item)
                    }))}
                  />
                  {token.value} · {token.kind === 'lora-trigger' ? 'LoRA 触发词' : '模型触发词'}
                </label>
              ))}
              <p className="muted">启用只会把原文写入兼容 Tag 提示词；仍不会加载任何模型资产。</p>
            </fieldset>
          ) : null}

          <details>
            <summary>查看被排除与未分类的原图内容词</summary>
            <p><strong>已排除主体词：</strong>{draft.classification.excludedSubjectTokens.join('、') || '无'}</p>
            <p><strong>未分类：</strong>{draft.classification.unclassifiedTokens.join('、') || '无'}</p>
          </details>

          {draft.preset.parameterDraft ? (
            <p className="image-settings-gate-note">
              参数草稿：采样器 {draft.preset.parameterDraft.sampler ?? '未提供'} ·
              Steps {draft.preset.parameterDraft.steps ?? '未提供'} ·
              CFG {draft.preset.parameterDraft.cfg ?? '未提供'} ·
              Clip skip {draft.preset.parameterDraft.clipSkip ?? '未提供'}
            </p>
          ) : null}
          <div className="image-profile-save-actions">
            <button type="button" className="image-settings-primary" disabled={busy} onClick={() => void saveDraft()}>
              保存为 PNG 画风
            </button>
            <button type="button" disabled={busy} onClick={() => setDraft(undefined)}>取消草稿</button>
          </div>
        </section>
      ) : null}

      <section aria-label="PNG 画风启用选择">
        <div className="png-style-grid">
          <label>全局 PNG 画风<select
            value={settings.selection.globalPngStylePresetId ?? ''}
            onChange={(event) => updateSelection('globalPngStylePresetId', event.target.value)}
          >{renderSelectionOptions()}</select></label>
          <label>人物图 PNG 画风<select
            value={settings.selection.characterPngStylePresetId ?? ''}
            onChange={(event) => updateSelection('characterPngStylePresetId', event.target.value)}
          >{renderSelectionOptions()}</select></label>
          <label>场景图 PNG 画风<select
            value={settings.selection.narrativeScenePngStylePresetId ?? ''}
            onChange={(event) => updateSelection('narrativeScenePngStylePresetId', event.target.value)}
          >{renderSelectionOptions()}</select></label>
        </div>
        <button
          type="button"
          className="image-settings-primary"
          disabled={busy}
          onClick={() => void saveSettings(settings, 'PNG 画风选择已保存；库修订 {revision}。')}
        >
          保存启用选择
        </button>
      </section>

      <div className="png-style-card-grid">
        {settings.presets.map((preset) => (
          <article key={preset.pngStylePresetId} className="png-style-card">
            <h4>{preset.name}</h4>
            <p>{preset.source.format} · {preset.source.imageHash.slice(0, 12)}… · parser {preset.source.parserVersion}</p>
            <p><strong>画师标签：</strong>{preset.artistTokens.join('、') || '无明确标签'}</p>
            <p><strong>Tag 画风：</strong>{preset.tagStyle.positive || '未设置'}</p>
            <div className="image-profile-save-actions">
              <button type="button" onClick={() => editPreset(preset)}>编辑</button>
              <button type="button" onClick={() => void deletePreset(preset.pngStylePresetId)}>删除</button>
              {preset.parameterDraft ? (
                <button
                  type="button"
                  disabled={!canApplyParameterDraft || !onApplyParameterDraft}
                  onClick={() => {
                    if (!onApplyParameterDraft || !preset.parameterDraft) return;
                    setStatus(onApplyParameterDraft(preset.parameterDraft, preset.name));
                  }}
                >
                  参数草稿放入当前生成预设
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {settings.presets.length === 0 ? <p className="image-settings-empty">尚未保存 PNG 画风。</p> : null}
      <p className="image-settings-gate-note" role="status">{status}</p>
    </section>
  );
}
