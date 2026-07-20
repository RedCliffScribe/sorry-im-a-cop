import { useState } from 'react';
import { supportsFeatureRoute } from '../../domain/settings/apiCapabilities';
import { fetchAvailableModels } from '../../domain/settings/modelCatalog';
import {
  setFeatureRoute,
  setMemoryCompressionSettings,
  updateApiProfileModels
} from '../../domain/settings/settingsOperations';
import type { AiSettings, FeatureRouteId, FeatureModelRoute } from '../../domain/settings/types';
import { ModelRecommendation } from './ModelRecommendation';

export type FeatureSettingsPage =
  | 'writebackRepair'
  | 'memorySummary'
  | 'npcSimulation'
  | 'backgroundEvolution'
  | 'auxiliaryGeneration';

interface FeatureConfigPanelProps {
  page: FeatureSettingsPage;
  settings: AiSettings;
  onChange: (settings: AiSettings) => void;
  onOpenApiConfig: () => void;
}

interface FeatureRouteSelectorProps {
  label: string;
  description: string;
  recommendation: {
    tier: string;
    description: string;
    examples: readonly [string, string, string];
  };
  routeId: FeatureRouteId;
  route: FeatureModelRoute;
  settings: AiSettings;
  onChange: (settings: AiSettings) => void;
  allowFollowMain?: boolean;
  allowDisable?: boolean;
}

function FeatureRouteSelector({
  label,
  description,
  recommendation,
  routeId,
  route,
  settings,
  onChange,
  allowFollowMain = true,
  allowDisable = false
}: FeatureRouteSelectorProps) {
  const [apiProfileId, setApiProfileId] = useState(route.mode === 'custom' ? route.apiProfileId : '');
  const [model, setModel] = useState(route.mode === 'custom' ? route.model : '');
  const [message, setMessage] = useState<string | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const selectedProfile = settings.apiProfiles.find((profile) => profile.id === apiProfileId) ?? null;
  const activeProfile = route.mode === 'custom' ? settings.apiProfiles.find((profile) => profile.id === route.apiProfileId) : null;
  const currentRouteText =
    route.mode === 'disabled'
      ? '当前：关闭'
      : route.mode === 'follow-main'
        ? '当前：跟随主剧情'
        : `当前：${activeProfile?.name ?? '未知 API'} / ${route.model}`;

  async function handleFetchModels() {
    if (!selectedProfile) {
      setMessage('请先选择 API 配置。');
      return;
    }

    setIsFetchingModels(true);
    setMessage(null);
    try {
      const models = await fetchAvailableModels({
        interfaceType: selectedProfile.interfaceType,
        baseUrl: selectedProfile.baseUrl,
        apiKey: selectedProfile.apiKey
      });
      onChange(updateApiProfileModels(settings, selectedProfile.id, models));
      setModel(models[0] ?? '');
      setMessage(`已获取 ${models.length} 个模型。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模型列表获取失败。');
    } finally {
      setIsFetchingModels(false);
    }
  }

  function handleSaveRoute() {
    if (!selectedProfile || !model) {
      setMessage('请先选择 API 配置和模型。');
      return;
    }

    try {
      onChange(setFeatureRoute(settings, routeId, { mode: 'custom', apiProfileId: selectedProfile.id, model }));
      setMessage('功能模型已保存。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '功能模型保存失败。');
    }
  }

  function handleFollowMain() {
    onChange(setFeatureRoute(settings, routeId, { mode: 'follow-main' }));
    setMessage('已切回跟随主剧情。');
  }

  function handleDisable() {
    onChange(setFeatureRoute(settings, routeId, { mode: 'disabled' }));
    setMessage('已关闭该功能模型。');
  }

  return (
    <div className="route-row" role="region" aria-label={`${label} API 路由`}>
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
        <ModelRecommendation
          subject={label}
          tier={recommendation.tier}
          description={recommendation.description}
          examples={recommendation.examples}
        />
        <p className="field-note">{currentRouteText}</p>
      </div>
      <div className="route-control-grid">
        <label>
          API 配置
          <select
            aria-label={`${label} API 配置`}
            value={apiProfileId}
            onChange={(event) => {
              const nextProfileId = event.target.value;
              const nextProfile = settings.apiProfiles.find((profile) => profile.id === nextProfileId);
              setApiProfileId(nextProfileId);
              setModel(nextProfile?.models[0] ?? '');
              setMessage(null);
            }}
          >
            <option value="">未选择</option>
            {settings.apiProfiles.map((profile) => {
              const supported = supportsFeatureRoute(profile.interfaceType, routeId);
              return (
                <option key={profile.id} value={profile.id} disabled={!supported}>
                  {profile.name}
                  {supported
                    ? ''
                    : routeId === 'memoryVector'
                      ? '（暂不支持向量调用）'
                      : '（暂不支持叙事调用）'}
                </option>
              );
            })}
          </select>
        </label>
        <div className="route-model-field">
          <label>
            模型
            <select aria-label={`${label} 模型`} value={model} onChange={(event) => setModel(event.target.value)}>
              <option value="">未选择</option>
              {(selectedProfile?.models ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={isFetchingModels || !selectedProfile} onClick={handleFetchModels}>
            {isFetchingModels ? '获取中' : '获取模型'}
          </button>
        </div>
        <div className="route-action-row">
          <button type="button" onClick={handleSaveRoute}>
            保存
          </button>
          {allowFollowMain ? (
            <button type="button" className="ghost-button" onClick={handleFollowMain}>
              跟随主剧情
            </button>
          ) : null}
          {allowDisable ? (
            <button type="button" className="ghost-button" onClick={handleDisable}>
              关闭
            </button>
          ) : null}
        </div>
        {message ? (
          <p className="field-note" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StatusChips({ items }: { items: Array<[string, number]> }) {
  return (
    <div className="status-chip-list">
      {items.map(([label, count]) => (
        <span key={label}>
          {label} {count}
        </span>
      ))}
    </div>
  );
}

function ToggleCard({
  title,
  description,
  checked = true,
  onChange
}: {
  title: string;
  description: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="option-card">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        {...(onChange
          ? { checked, onChange: (event) => onChange(event.target.checked) }
          : { defaultChecked: checked })}
      />
    </label>
  );
}

function NumericCard({
  title,
  description,
  value,
  min = 0,
  onChange
}: {
  title: string;
  description: string;
  value: number;
  min?: number;
  onChange?: (value: number) => void;
}) {
  return (
    <label className="option-card option-card-input">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        aria-label={title}
        type="number"
        min={min}
        {...(onChange
          ? { value, onChange: (event) => onChange(Number(event.target.value)) }
          : { defaultValue: value })}
      />
    </label>
  );
}

function MemorySummaryPage({ settings, onChange, onOpenApiConfig }: Omit<FeatureConfigPanelProps, 'page'>) {
  return (
    <section className="settings-panel settings-panel-with-scroll">
      <div className="settings-topline">
        <div>
          <h2>记忆总结</h2>
          <p className="muted">近期正文保留原文；更早内容依次由短期、中期和长期摘要接替，避免同一段经历重复投喂。</p>
        </div>
        <button type="button" onClick={onOpenApiConfig}>
          新建 API 配置
        </button>
      </div>

      <div className="settings-page-scroll" role="region" aria-label="记忆总结设置内容">
        <section className="settings-section">
          <h3>功能 API 路由</h3>
          <p className="muted">这里只选择该功能使用的 API。API 档案统一保存在 API 配置中。</p>
          <FeatureRouteSelector
            label="记忆压缩/摘要"
            description="近期记忆压缩、中期摘要、长期事实与 NPC/地点记忆总结。"
            recommendation={{
              tier: '中档通用模型',
              description: '重视长文本归纳、事实去重和稳定 JSON；低至中等推理强度即可，不必占用最昂贵的主剧情模型。',
              examples: ['GPT-5.6 Terra', 'Claude Sonnet 5', 'Gemini 3.5 Flash']
            }}
            routeId="memorySummary"
            route={settings.featureRoutes.memorySummary}
            settings={settings}
            onChange={onChange}
          />
          <FeatureRouteSelector
            label="向量检索"
            description="用于计算记忆 embedding，让相关旧记忆能在地点、人物和关键词之外被召回；未配置时保持关闭并使用规则投影。"
            recommendation={{
              tier: '小型 / 中型专用向量模型',
              description: '选择中文或多语言语义检索表现可靠的 embedding 模型；约 0.6B–4B 通常已经够用，无需使用生成模型。',
              examples: ['Qwen3-Embedding-0.6B', 'BAAI/bge-m3', 'text-embedding-3-small']
            }}
            routeId="memoryVector"
            route={settings.featureRoutes.memoryVector}
            settings={settings}
            onChange={onChange}
            allowFollowMain={false}
            allowDisable
          />
        </section>

        <section className="settings-section">
          <h3>正文回忆分层</h3>
          <p className="muted">每段过往正文只由一层负责：近期原文、短期记忆、中期记忆或长期记忆。</p>
          <div className="option-grid">
            <ToggleCard
              title="自动分层压缩"
              description="关闭后不再把旧短期记忆合并为中期、长期记忆。"
              checked={settings.memory.autoCompressionEnabled}
              onChange={(checked) => onChange(setMemoryCompressionSettings(settings, { autoCompressionEnabled: checked }))}
            />
            <NumericCard
              title="近期原文回合数"
              description="最近多少回合直接投喂玩家输入和正文原文；对应短期记忆暂不重复投喂。"
              value={settings.memory.recentRawTurnLimit}
              min={1}
              onChange={(value) =>
                onChange(setMemoryCompressionSettings(settings, { recentRawTurnLimit: value }))
              }
            />
            <NumericCard
              title="短期合并数量"
              description="积满多少条已离开近期原文窗口的短期记忆后，合并成一条中期记忆。"
              value={settings.memory.shortTermBatchSize}
              min={5}
              onChange={(value) => onChange(setMemoryCompressionSettings(settings, { shortTermBatchSize: value }))}
            />
            <NumericCard
              title="中期合并数量"
              description="积满多少条中期记忆后，合并成一条长期记忆。"
              value={settings.memory.midTermBatchSize}
              min={5}
              onChange={(value) =>
                onChange(setMemoryCompressionSettings(settings, { midTermBatchSize: value }))
              }
            />
            <NumericCard
              title="长期投喂上限"
              description="每回合最多给主剧情投喂多少 token 的长期记忆；优先保留较新的长期段落。"
              value={settings.memory.longTermPromptTokenBudget}
              min={1000}
              onChange={(value) => onChange(setMemoryCompressionSettings(settings, { longTermPromptTokenBudget: value }))}
            />
          </div>
        </section>
      </div>
    </section>
  );
}

function WritebackRepairPage({ settings, onChange, onOpenApiConfig }: Omit<FeatureConfigPanelProps, 'page'>) {
  return (
    <section className="settings-panel">
      <div className="settings-topline">
        <div>
          <h2>写回修复</h2>
          <p className="muted">只处理结构化写回的格式、字段、协议冲突和数值边界，不从正文抓取真值。</p>
        </div>
        <button type="button" onClick={onOpenApiConfig}>
          新建 API 配置
        </button>
      </div>

      <section className="settings-section">
        <h3>功能 API 路由</h3>
        <FeatureRouteSelector
          label="写回修复"
          description="主剧情返回格式不合法时，用该路由修复 JSON 结构和协议字段。"
          recommendation={{
            tier: '轻量 / 中档结构化模型',
            description: '优先选择 JSON 与指令遵循稳定、响应快的模型；低推理强度通常足够，不需要强文学能力。',
            examples: ['GPT-5.4 mini', 'Claude Haiku 4.5', 'Gemini 3.1 Flash-Lite']
          }}
          routeId="writebackRepair"
          route={settings.featureRoutes.writebackRepair}
          settings={settings}
          onChange={onChange}
        />
      </section>

      <section className="settings-section">
        <h3>修复边界</h3>
        <div className="option-grid">
          <ToggleCard title="启用写回修复" description="关闭后主剧情写回不合法时直接失败，不尝试修复。" />
          <ToggleCard title="只修复结构协议" description="禁止根据正文自由补事实，只能修复字段、格式和范围。" />
          <ToggleCard title="失败后不改状态" description="修复失败时保留原 runtime state，不写入半成品。" />
          <NumericCard title="最大修复次数" description="单回合最多尝试修复的次数。" value={1} />
        </div>
      </section>

      <section className="settings-section">
        <h3>校准范围</h3>
        <StatusChips
          items={[
            ['字段名', 1],
            ['枚举值', 1],
            ['数值边界', 1],
            ['缺失必填项', 1],
            ['正文推断', 0]
          ]}
        />
      </section>
    </section>
  );
}

function NpcSimulationPage({ settings, onChange, onOpenApiConfig }: Omit<FeatureConfigPanelProps, 'page'>) {
  return (
    <section className="settings-panel">
      <div className="settings-topline">
        <div>
          <h2>NPC 动态模拟</h2>
          <p className="muted">正文前隐藏模拟在场 NPC 反应和远场存在感；未配置独立 API 时由主剧情 prompt 内模拟。</p>
        </div>
        <button type="button" onClick={onOpenApiConfig}>
          新建 API 配置
        </button>
      </div>

      <section className="settings-section">
        <h3>功能 API 路由</h3>
        <FeatureRouteSelector
          label="NPC 动态模拟"
          description="配置独立 API 时，会在主叙事前生成一份未裁定建议包；跟随主剧情时不额外预调用，只把本地候选交给主剧情模型。"
          recommendation={{
            tier: '中高档通用模型',
            description: '需要人物动机、关系和因果保持一致，建议中等推理强度；预算敏感时可直接跟随主剧情。',
            examples: ['GPT-5.6 Terra', 'Claude Sonnet 5', 'DeepSeek-V4-Pro']
          }}
          routeId="npcSimulation"
          route={settings.featureRoutes.npcSimulation}
          settings={settings}
          onChange={onChange}
        />
      </section>

      <section className="settings-section">
        <h3>运行边界</h3>
        <div className="option-grid">
          <ToggleCard title="只生成未裁定建议" description="辅助 API 不写正文、不判定结果、不改变本地状态。" />
          <ToggleCard title="保留主剧情裁量" description="主剧情模型可以采纳、改写或忽略辅助模拟包。" />
          <ToggleCard title="失败后继续回合" description="独立 API 失败时回落到主 prompt 内的本地 NPC 候选。" />
        </div>
      </section>
    </section>
  );
}

function BackgroundEvolutionPage({ settings, onChange, onOpenApiConfig }: Omit<FeatureConfigPanelProps, 'page'>) {
  return (
    <section className="settings-panel">
      <div className="settings-topline">
        <div>
          <h2>远场演化</h2>
          <p className="muted">主剧情结算后，按游戏时间复核重要远场 NPC、承办案件与城市轨道；没有到期候选时不会调用 API。</p>
        </div>
        <button type="button" onClick={onOpenApiConfig}>
          新建 API 配置
        </button>
      </div>

      <section className="settings-section">
        <h3>功能 API 路由</h3>
        <FeatureRouteSelector
          label="远场演化"
          description="默认复用主剧情 API，也可使用独立模型或关闭。独立调用只接收本轮入选对象的有界资料包。"
          recommendation={{
            tier: '中档 / 中高档通用模型',
            description: '重视多步因果、时间推进和结构化结果，建议中等推理强度；调用低频，可比主剧情低一档。',
            examples: ['GPT-5.6 Terra', 'Claude Sonnet 5', 'Gemini 3.5 Flash']
          }}
          routeId="backgroundEvolution"
          route={settings.featureRoutes.backgroundEvolution}
          settings={settings}
          onChange={onChange}
          allowDisable
        />
      </section>

      <section className="settings-section">
        <h3>运行边界</h3>
        <div className="option-grid">
          <ToggleCard title="按游戏时间复核" description="普通短回合不会推动远场行动；默认至少间隔六个游戏小时。" />
          <ToggleCard title="案件不保证办成" description="允许无结果、受阻、失败、移交或放弃，行动完成不等于案件状态前进。" />
          <ToggleCard title="主回合优先" description="远场演化失败或中止时整批不写入，已经完成的主回合仍会保存。" />
          <ToggleCard title="确定性记忆投影" description="正式案件行动的开始与结果会写入承办 NPC 记忆和既有案件动态。" />
        </div>
      </section>
    </section>
  );
}

function AuxiliaryGenerationPage({ settings, onChange, onOpenApiConfig }: Omit<FeatureConfigPanelProps, 'page'>) {
  return (
    <section className="settings-panel">
      <div className="settings-topline">
        <div>
          <h2>辅助生成 API</h2>
          <p className="muted">生成报纸、城市侧写和低频背景材料；它只写资料，不接管主剧情。</p>
        </div>
        <button type="button" onClick={onOpenApiConfig}>
          新建 API 配置
        </button>
      </div>

      <section className="settings-section">
        <h3>功能 API 路由</h3>
        <FeatureRouteSelector
          label="辅助生成 API"
          description="用于买报纸、隔日城市新闻和类似侧栏内容。跟随主剧情时会复用主 API；配置独立 API 时可降低主剧情负担。"
          recommendation={{
            tier: '轻量 / 中档生成模型',
            description: '优先速度、成本和中文表达，低推理强度即可；它不裁定主剧情，无需使用旗舰模型。',
            examples: ['GPT-5.6 Luna', 'Claude Haiku 4.5', 'Gemini 3.1 Flash-Lite']
          }}
          routeId="auxiliaryGeneration"
          route={settings.featureRoutes.auxiliaryGeneration}
          settings={settings}
          onChange={onChange}
        />
      </section>

      <section className="settings-section">
        <h3>运行边界</h3>
        <div className="option-grid">
          <ToggleCard title="只生成资料" description="辅助生成不写正文、不判定行动、不直接改变人物或案件。" />
          <ToggleCard title="使用真实报纸名" description="报纸名可直接使用大公报、明报、成报、星岛日报等真实名称。" />
          <ToggleCard title="失败后继续回合" description="辅助生成失败只留下诊断，不让玩家行动失败。" />
        </div>
      </section>
    </section>
  );
}

export function FeatureConfigPanel(props: FeatureConfigPanelProps) {
  if (props.page === 'writebackRepair') {
    return <WritebackRepairPage settings={props.settings} onChange={props.onChange} onOpenApiConfig={props.onOpenApiConfig} />;
  }

  if (props.page === 'npcSimulation') {
    return <NpcSimulationPage settings={props.settings} onChange={props.onChange} onOpenApiConfig={props.onOpenApiConfig} />;
  }

  if (props.page === 'backgroundEvolution') {
    return (
      <BackgroundEvolutionPage
        settings={props.settings}
        onChange={props.onChange}
        onOpenApiConfig={props.onOpenApiConfig}
      />
    );
  }

  if (props.page === 'auxiliaryGeneration') {
    return (
      <AuxiliaryGenerationPage settings={props.settings} onChange={props.onChange} onOpenApiConfig={props.onOpenApiConfig} />
    );
  }

  return <MemorySummaryPage settings={props.settings} onChange={props.onChange} onOpenApiConfig={props.onOpenApiConfig} />;
}
