import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { fetchAvailableModels } from '../../domain/settings/modelCatalog';
import { exportApiSettings, importApiSettings } from '../../domain/settings/apiSettingsTransfer';
import {
  apiInterfaceTypes,
  getApiCapabilities,
  supportsMainNarration
} from '../../domain/settings/apiCapabilities';
import {
  deleteApiProfile,
  setMainNarratorRoute,
  updateApiProfileModels,
  upsertApiProfile
} from '../../domain/settings/settingsOperations';
import type { AiSettings, ApiInterfaceType, ApiProfile } from '../../domain/settings/types';
import { ModelRecommendation } from './ModelRecommendation';

interface ApiConfigPanelProps {
  settings: AiSettings;
  onChange: (settings: AiSettings) => void;
}

interface ApiFormState {
  name: string;
  interfaceType: ApiInterfaceType;
  baseUrl: string;
  apiKey: string;
  modelsText: string;
  maxTokens: string;
  temperature: string;
}

const emptyForm: ApiFormState = {
  name: '',
  interfaceType: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  modelsText: '',
  maxTokens: '8192',
  temperature: ''
};

const tokenPresets = [
  { label: '8K', value: '8192' },
  { label: '32K', value: '32768' },
  { label: '64K', value: '65536' }
];

const interfaceTypeOptions: Array<{ value: ApiInterfaceType; label: string }> = apiInterfaceTypes.map((value) => ({
  value,
  label: getApiCapabilities(value).label
}));

function createProfileId(name: string) {
  return `api_${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') || Date.now()}`;
}

function getInterfaceTypeLabel(interfaceType: ApiInterfaceType | undefined) {
  return interfaceType ? getApiCapabilities(interfaceType).label : 'OpenAI 兼容';
}

function formFromProfile(profile: ApiProfile): ApiFormState {
  return {
    name: profile.name,
    interfaceType: profile.interfaceType ?? 'openai-compatible',
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    modelsText: profile.models.join(', '),
    maxTokens: String(profile.defaultMaxTokens ?? 8192),
    temperature: profile.defaultTemperature === undefined ? '' : String(profile.defaultTemperature)
  };
}

function parseModels(modelsText: string) {
  return modelsText
    .split(/\r?\n|,/)
    .map((model) => model.trim())
    .filter(Boolean);
}

function maskSecret(value: string) {
  if (!value) {
    return '未填写密钥';
  }
  return value.length <= 8 ? '已保存密钥' : `${value.slice(0, 3)}...${value.slice(-4)}`;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('API 设置文件读取失败。'));
    reader.readAsText(file);
  });
}

export function ApiConfigPanel({ settings, onChange }: ApiConfigPanelProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(settings.apiProfiles[0]?.id ?? null);
  const [form, setForm] = useState<ApiFormState>(
    settings.apiProfiles[0] ? formFromProfile(settings.apiProfiles[0]) : emptyForm
  );
  const [mainProfileName, setMainProfileName] = useState(
    settings.mainNarrator
      ? (settings.apiProfiles.find((profile) => profile.id === settings.mainNarrator?.apiProfileId)?.name ?? '')
      : ''
  );
  const [mainModel, setMainModel] = useState(settings.mainNarrator?.model ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isFetchingMainModels, setIsFetchingMainModels] = useState(false);

  const selectedMainProfile = useMemo(
    () => settings.apiProfiles.find((profile) => profile.name === mainProfileName),
    [mainProfileName, settings.apiProfiles]
  );
  const formSupportsNarration = supportsMainNarration(form.interfaceType);

  const editingProfile = useMemo(
    () => settings.apiProfiles.find((profile) => profile.id === editingProfileId) ?? null,
    [editingProfileId, settings.apiProfiles]
  );

  function updateForm(patch: Partial<ApiFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function handleNewProfile() {
    setEditingProfileId(null);
    setForm(emptyForm);
    setMessage(null);
  }

  function syncEditorFromSettings(nextSettings: AiSettings) {
    const nextProfile = nextSettings.apiProfiles[0] ?? null;
    setEditingProfileId(nextProfile?.id ?? null);
    setForm(nextProfile ? formFromProfile(nextProfile) : emptyForm);

    const nextMainProfile = nextSettings.mainNarrator
      ? nextSettings.apiProfiles.find((profile) => profile.id === nextSettings.mainNarrator?.apiProfileId)
      : null;
    setMainProfileName(nextMainProfile?.name ?? '');
    setMainModel(nextSettings.mainNarrator?.model ?? '');
  }

  function handleSelectProfile(profile: ApiProfile) {
    setEditingProfileId(profile.id);
    setForm(formFromProfile(profile));
    setMessage(null);
  }

  function handleSaveProfile() {
    const now = new Date().toISOString();
    const profile: ApiProfile = {
      id: editingProfile?.id ?? createProfileId(form.name),
      name: form.name.trim(),
      providerLabel: getInterfaceTypeLabel(form.interfaceType),
      interfaceType: form.interfaceType,
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
      models: parseModels(form.modelsText),
      defaultMaxTokens: Number(form.maxTokens) || undefined,
      defaultTemperature: form.temperature === '' ? undefined : Number(form.temperature),
      createdAt: editingProfile?.createdAt ?? now,
      updatedAt: now
    };

    try {
      const next = upsertApiProfile(settings, profile);
      onChange(next);
      setEditingProfileId(profile.id);
      setForm(formFromProfile(profile));
      setMessage('API 档案已保存。');
      if (
        supportsMainNarration(profile.interfaceType) &&
        (!mainProfileName || selectedMainProfile?.id === profile.id)
      ) {
        setMainProfileName(profile.name);
        setMainModel(profile.models.includes(mainModel) ? mainModel : (profile.models[0] ?? ''));
      } else if (!supportsMainNarration(profile.interfaceType) && selectedMainProfile?.id === profile.id) {
        setMainProfileName('');
        setMainModel('');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'API 档案保存失败。');
    }
  }

  function handleDeleteProfile() {
    if (!editingProfileId) {
      return;
    }

    try {
      const next = deleteApiProfile(settings, editingProfileId);
      onChange(next);
      setEditingProfileId(null);
      setForm(emptyForm);
      if (selectedMainProfile?.id === editingProfileId) {
        setMainProfileName('');
        setMainModel('');
      }
      setMessage('API 档案已删除。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'API 档案删除失败。');
    }
  }

  function handleExportApiSettings() {
    const payload = exportApiSettings(settings);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sorry-im-a-cop-v2-api-settings.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMessage('API 设置已导出。');
  }

  async function handleImportApiSettings(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const rawJson = await readFileAsText(file);
      const next = importApiSettings(settings, rawJson);
      onChange(next);
      syncEditorFromSettings(next);
      setMessage('API 设置已导入。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'API 设置导入失败。');
    }
  }

  async function handleFetchModels() {
    setIsFetchingModels(true);
    setMessage(null);
    try {
      const models = await fetchAvailableModels({
        interfaceType: form.interfaceType,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey
      });
      updateForm({ modelsText: models.join(', ') });
      setMessage(`已获取 ${models.length} 个模型。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模型列表获取失败。');
    } finally {
      setIsFetchingModels(false);
    }
  }

  async function handleFetchMainModels() {
    if (!selectedMainProfile) {
      setMessage('请先选择主剧情 API。');
      return;
    }

    setIsFetchingMainModels(true);
    setMessage(null);
    try {
      const models = await fetchAvailableModels({
        interfaceType: selectedMainProfile.interfaceType,
        baseUrl: selectedMainProfile.baseUrl,
        apiKey: selectedMainProfile.apiKey
      });
      onChange(updateApiProfileModels(settings, selectedMainProfile.id, models));
      setMainModel(models[0] ?? '');
      setMessage(`已为 ${selectedMainProfile.name} 获取 ${models.length} 个模型。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模型列表获取失败。');
    } finally {
      setIsFetchingMainModels(false);
    }
  }

  function handleSaveMain() {
    try {
      const next = setMainNarratorRoute(
        settings,
        selectedMainProfile
          ? {
              apiProfileId: selectedMainProfile.id,
              model: mainModel,
              maxTokens: selectedMainProfile.defaultMaxTokens,
              temperature: selectedMainProfile.defaultTemperature
            }
          : null
      );
      onChange(next);
      setMessage('主剧情模型已保存。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '主剧情模型保存失败。');
    }
  }

  return (
    <section className="settings-panel api-settings-panel">
      <div className="settings-topline">
        <div>
          <h2>API 配置</h2>
          <p className="muted">保存 API 档案，并指定主剧情使用的模型。其他功能模型到功能配置里单独选择。</p>
          <p className="field-note">导出的 JSON 包含 API Key，只用于本机测试和私有备份。</p>
        </div>
        <div className="settings-topline-actions">
          <button type="button" onClick={handleNewProfile}>
            新建 API 配置
          </button>
          <button type="button" onClick={handleExportApiSettings}>
            导出 API 设置
          </button>
          <button type="button" onClick={() => importInputRef.current?.click()}>
            导入 API 设置
          </button>
          <input
            ref={importInputRef}
            aria-label="导入 API 设置文件"
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={handleImportApiSettings}
          />
        </div>
      </div>

      <div className="api-config-layout">
        <aside className="api-profile-rail" aria-label="API 档案列表">
          {settings.apiProfiles.length === 0 ? <p className="empty-state">还没有 API 档案。</p> : null}
          {settings.apiProfiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={profile.id === editingProfileId ? 'profile-card active' : 'profile-card'}
              onClick={() => handleSelectProfile(profile)}
            >
              <strong>{profile.name}</strong>
              <span>{getInterfaceTypeLabel(profile.interfaceType)}</span>
              <small>{profile.baseUrl}</small>
              <small>{maskSecret(profile.apiKey)}</small>
              {!supportsMainNarration(profile.interfaceType) ? <small>暂不支持叙事调用</small> : null}
            </button>
          ))}
        </aside>

        <div className="api-editor-stack">
          <section className="settings-section api-editor-panel" aria-label="API 档案">
            <div className="section-title-row">
              <div>
                <h3>API 档案</h3>
                <p className="muted">这里只保存服务商、地址、密钥和模型列表。</p>
              </div>
              {editingProfile ? <small className="field-note">正在编辑：{editingProfile.name}</small> : null}
            </div>

            <div className="compact-form-grid">
              <label>
                配置名称
                <input aria-label="配置名称" value={form.name} onChange={(event) => updateForm({ name: event.target.value })} />
              </label>
              <label>
                接口类型
                <select
                  aria-label="接口类型"
                  value={form.interfaceType}
                  onChange={(event) => updateForm({ interfaceType: event.target.value as ApiInterfaceType })}
                >
                  {interfaceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {!formSupportsNarration ? <small className="field-note">当前接口类型暂不支持叙事调用。</small> : null}
              </label>
              <label className="span-2">
                Base URL
                <input aria-label="Base URL" value={form.baseUrl} onChange={(event) => updateForm({ baseUrl: event.target.value })} />
              </label>
              <label className="span-2">
                API Key
                <input
                  aria-label="API Key"
                  type="password"
                  value={form.apiKey}
                  onChange={(event) => updateForm({ apiKey: event.target.value })}
                />
              </label>
              <div className="span-2 model-list-field">
                <label>
                  模型列表
                  <input
                    aria-label="模型列表"
                    value={form.modelsText}
                    onChange={(event) => updateForm({ modelsText: event.target.value })}
                    placeholder="例如 gpt-4.1, gemini-3.1-pro, deepseek-chat"
                  />
                </label>
                <button type="button" disabled={isFetchingModels} onClick={handleFetchModels}>
                  {isFetchingModels ? '获取中' : '获取模型'}
                </button>
              </div>
            </div>

            <div className="api-tuning-grid">
              <div>
                <h4>最大输出 Token（可选）</h4>
                <div className="token-preset-row" role="group" aria-label="最大输出 Token 快捷选择">
                  {tokenPresets.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={form.maxTokens === preset.value ? 'active' : ''}
                      onClick={() => updateForm({ maxTokens: preset.value })}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={!tokenPresets.some((preset) => preset.value === form.maxTokens) ? 'active' : ''}
                    onClick={() => updateForm({ maxTokens: '' })}
                  >
                    自定义
                  </button>
                </div>
                <input
                  aria-label="最大输出 Token"
                  value={form.maxTokens}
                  onChange={(event) => updateForm({ maxTokens: event.target.value })}
                  placeholder="留空按 8192 或模型默认"
                />
              </div>
              <label>
                温度 Temperature（留空自动）
                <input
                  aria-label="模型温度"
                  value={form.temperature}
                  onChange={(event) => updateForm({ temperature: event.target.value })}
                  placeholder="主剧情常用 0.7"
                />
              </label>
            </div>

            <div className="api-action-row">
              <button type="button" onClick={handleSaveProfile}>
                保存 API 档案
              </button>
              <button type="button" className="ghost-button" onClick={handleNewProfile}>
                清空新建
              </button>
              <button type="button" className="danger-button" disabled={!editingProfileId} onClick={handleDeleteProfile}>
                删除当前档案
              </button>
            </div>
          </section>

          <section className="settings-section main-route-panel" aria-label="主剧情模型配置">
            <div className="section-title-row">
              <div>
                <h3>主剧情模型</h3>
                <p className="muted">这里只选择主叙事模型。记忆总结、写回修复到功能配置里调整。</p>
              </div>
            </div>
            <ModelRecommendation
              subject="主剧情"
              tier="旗舰级 / 高阶通用模型"
              description="优先选择长上下文、中文叙事、指令遵循和结构化写回都稳定的主力模型。这是最值得投入能力与预算的一路；若可调推理强度，通常使用中等即可。"
              examples={['GPT-5.6 Sol', 'Claude Opus 4.8', 'Gemini 3.1 Pro Preview']}
            />
            <div className="main-route-grid">
              <label>
                主剧情 API
                <select
                  aria-label="主剧情 API"
                  value={mainProfileName}
                  onChange={(event) => {
                    const profileName = event.target.value;
                    const profile = settings.apiProfiles.find((item) => item.name === profileName);
                    setMainProfileName(profileName);
                    setMainModel(profile?.models[0] ?? '');
                  }}
                >
                  <option value="">未选择</option>
                  {settings.apiProfiles.map((profile) => {
                    const supported = supportsMainNarration(profile.interfaceType);
                    return (
                      <option key={profile.id} value={profile.name} disabled={!supported}>
                        {profile.name}
                        {supported ? '' : '（暂不支持叙事调用）'}
                      </option>
                    );
                  })}
                </select>
              </label>
              <div className="route-model-field">
                <label>
                  主剧情模型
                  <select aria-label="主剧情模型" value={mainModel} onChange={(event) => setMainModel(event.target.value)}>
                    <option value="">未选择</option>
                    {(selectedMainProfile?.models ?? []).map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" disabled={isFetchingMainModels || !selectedMainProfile} onClick={handleFetchMainModels}>
                  {isFetchingMainModels ? '获取中' : '获取模型'}
                </button>
              </div>
              <button type="button" onClick={handleSaveMain}>
                保存主剧情模型
              </button>
            </div>
          </section>

          {message ? (
            <p className="save-status" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
