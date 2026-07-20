import { useState } from 'react';
import type { RuntimeSaveSummary } from '../../domain/persistence/SaveRepository';
import type { RuntimeState } from '../../domain/runtime/types';
import type { AiSettings } from '../../domain/settings/types';
import { ApiConfigPanel } from '../settings/ApiConfigPanel';
import { DisplaySettingsPanel } from '../settings/DisplaySettingsPanel';
import { FeatureConfigPanel, type FeatureSettingsPage } from '../settings/FeatureConfigPanel';
import { GameSettingsPanel } from '../settings/GameSettingsPanel';
import { PromptManagementPanel } from '../settings/PromptManagementPanel';
import { SaveManagementPanel } from '../settings/SaveManagementPanel';
import { TokenEstimatePanel } from '../settings/TokenEstimatePanel';
import type { SettingsDestination } from '../settings/settingsNavigation';

type SettingsPage = 'game' | 'display' | 'api' | 'features' | 'prompts' | 'tokens' | 'saves';

const menuItems: Array<{ id: SettingsPage; label: string }> = [
  { id: 'game', label: '游戏设置' },
  { id: 'display', label: '显示设置' },
  { id: 'api', label: 'API 配置' },
  { id: 'features', label: '功能配置' },
  { id: 'prompts', label: '提示词管理' },
  { id: 'tokens', label: 'Token 估算' },
  { id: 'saves', label: '存档管理' }
];

interface SettingsScreenProps {
  initialDestination?: SettingsDestination;
  settings: AiSettings;
  runtimeState?: RuntimeState | null;
  saves: RuntimeSaveSummary[];
  onSettingsChange: (settings: AiSettings) => void;
  onBack: () => void;
}

function resolveInitialPage(destination: SettingsDestination): SettingsPage {
  return destination === 'api' ? 'api' : 'features';
}

function resolveInitialFeaturePage(destination: SettingsDestination): FeatureSettingsPage {
  if (destination === 'api' || destination === 'memoryVector') return 'memorySummary';
  return destination;
}

export function SettingsScreen({
  initialDestination = 'api',
  settings,
  runtimeState,
  saves,
  onSettingsChange,
  onBack
}: SettingsScreenProps) {
  const [page, setPage] = useState<SettingsPage>(() => resolveInitialPage(initialDestination));
  const [featurePage, setFeaturePage] = useState<FeatureSettingsPage>(() => resolveInitialFeaturePage(initialDestination));
  const isFeatureActive = page === 'features';

  return (
    <main className="settings-screen">
      <aside className="settings-sidebar">
        <h1>设置</h1>
        <nav>
          {menuItems.map((item) => (
            <div key={item.id} className="settings-nav-group">
              <button
                type="button"
                className={page === item.id ? 'active' : ''}
                onClick={() => {
                  setPage(item.id);
                  if (item.id === 'features') {
                    setFeaturePage('memorySummary');
                  }
                }}
              >
                {item.label}
              </button>
              {item.id === 'features' && isFeatureActive ? (
                <div className="settings-subnav" aria-label="功能配置子菜单">
                  <button
                    type="button"
                    className={featurePage === 'writebackRepair' ? 'active' : ''}
                    onClick={() => setFeaturePage('writebackRepair')}
                  >
                    写回修复
                  </button>
                  <button
                    type="button"
                    className={featurePage === 'memorySummary' ? 'active' : ''}
                    onClick={() => setFeaturePage('memorySummary')}
                  >
                    记忆总结
                  </button>
                  <button
                    type="button"
                    className={featurePage === 'npcSimulation' ? 'active' : ''}
                    onClick={() => setFeaturePage('npcSimulation')}
                  >
                    NPC 模拟
                  </button>
                  <button
                    type="button"
                    className={featurePage === 'backgroundEvolution' ? 'active' : ''}
                    onClick={() => setFeaturePage('backgroundEvolution')}
                  >
                    远场演化
                  </button>
                  <button
                    type="button"
                    className={featurePage === 'auxiliaryGeneration' ? 'active' : ''}
                    onClick={() => setFeaturePage('auxiliaryGeneration')}
                  >
                    辅助生成
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </nav>
        <button type="button" className="settings-close" onClick={onBack}>
          关闭设置
        </button>
      </aside>
      <section className="settings-content">
        {page === 'api' ? <ApiConfigPanel settings={settings} onChange={onSettingsChange} /> : null}
        {page === 'features' ? (
          <FeatureConfigPanel
            page={featurePage}
            settings={settings}
            onChange={onSettingsChange}
            onOpenApiConfig={() => setPage('api')}
          />
        ) : null}
        {page === 'saves' ? <SaveManagementPanel saves={saves} /> : null}
        {page === 'game' ? <GameSettingsPanel settings={settings} onChange={onSettingsChange} /> : null}
        {page === 'display' ? <DisplaySettingsPanel settings={settings} onChange={onSettingsChange} /> : null}
        {page === 'prompts' ? <PromptManagementPanel settings={settings} onChange={onSettingsChange} /> : null}
        {page === 'tokens' ? <TokenEstimatePanel settings={settings} runtimeState={runtimeState} /> : null}
      </section>
    </main>
  );
}
