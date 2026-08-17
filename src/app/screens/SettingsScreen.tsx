import { useState } from 'react';
import type { RuntimeSaveSummary } from '../../domain/persistence/SaveRepository';
import type {
  CantoneseFlavorLevel,
  GameDifficultyLevel,
  RuntimeState
} from '../../domain/runtime/types';
import type { AiSettings } from '../../domain/settings/types';
import type { DramaticContentSettings } from '../../domain/drama/types';
import type { AvgResourcePackManagerApi } from '../../domain/avgResourcePack';
import { ApiConfigPanel } from '../settings/ApiConfigPanel';
import { AvgResourcePackSettingsPanel } from '../settings/AvgResourcePackSettingsPanel';
import { DataManagementPanel } from '../settings/DataManagementPanel';
import type { DataClearTarget } from '../settings/dataManagement';
import { DisplaySettingsPanel } from '../settings/DisplaySettingsPanel';
import { FeatureConfigPanel, type FeatureSettingsPage } from '../settings/FeatureConfigPanel';
import { GameSettingsPanel } from '../settings/GameSettingsPanel';
import type {
  CurrentSaveCustomContentAdaptationRequest,
  CurrentSaveCustomContentPausedChange,
  CurrentSaveCustomContentPriorityChange
} from '../settings/CurrentSaveCustomContentSettingsPanel';
import { ImageGenerationSettingsPanel } from '../settings/ImageGenerationSettingsPanel';
import { PromptManagementPanel } from '../settings/PromptManagementPanel';
import { TavernManagementPanel } from '../settings/TavernManagementPanel';
import { TokenEstimatePanel } from '../settings/TokenEstimatePanel';
import type { SettingsDestination } from '../settings/settingsNavigation';

type SettingsPage =
  | 'game'
  | 'gameplay'
  | 'display'
  | 'api'
  | 'avgResources'
  | 'imageGeneration'
  | 'features'
  | 'prompts'
  | 'tavern'
  | 'tokens'
  | 'data';

const menuItems: Array<{ id: SettingsPage; label: string }> = [
  { id: 'game', label: '游戏设置' },
  { id: 'gameplay', label: '玩法设置' },
  { id: 'display', label: '显示设置' },
  { id: 'api', label: 'API 配置' },
  { id: 'avgResources', label: 'AVG 演出资源' },
  { id: 'imageGeneration', label: '文生图设置' },
  { id: 'features', label: '功能配置' },
  { id: 'prompts', label: '提示词管理' },
  { id: 'tavern', label: '酒馆预设与 CoT' },
  { id: 'tokens', label: 'Token 估算' },
  { id: 'data', label: '数据管理' }
];

interface SettingsScreenProps {
  initialDestination?: SettingsDestination;
  settings: AiSettings;
  runtimeState?: RuntimeState | null;
  saves: RuntimeSaveSummary[];
  onSettingsChange: (settings: AiSettings) => void;
  onRuntimeDramaticContentChange: (settings: DramaticContentSettings) => void;
  onRuntimeCantoneseFlavorChange: (flavor: CantoneseFlavorLevel) => void;
  onRuntimeGameDifficultyChange?: (difficulty: GameDifficultyLevel) => void;
  onOpenCurrentSaveCustomContentLibrary?: () => void;
  onRuntimeCustomContentPriorityChange?: (
    change: CurrentSaveCustomContentPriorityChange
  ) => Promise<void>;
  onRuntimeCustomContentPausedChange?: (
    change: CurrentSaveCustomContentPausedChange
  ) => Promise<void>;
  onRuntimeCustomContentAdaptationRequest?: (
    request: CurrentSaveCustomContentAdaptationRequest
  ) => Promise<void>;
  onClearData: (target: DataClearTarget) => Promise<void>;
  avgResourcePackManager?: AvgResourcePackManagerApi;
  onAvgResourceChange?: () => void;
  onBack: () => void;
}

function resolveInitialPage(destination: SettingsDestination): SettingsPage {
  if (destination === 'imageGeneration') return 'imageGeneration';
  if (destination === 'avgResources') return 'avgResources';
  return destination === 'api' ? 'api' : 'features';
}

function resolveInitialFeaturePage(destination: SettingsDestination): FeatureSettingsPage {
  if (
    destination === 'api' ||
    destination === 'imageGeneration' ||
    destination === 'avgResources' ||
    destination === 'memoryVector'
  ) return 'memorySummary';
  return destination;
}

export function SettingsScreen({
  initialDestination = 'api',
  settings,
  runtimeState,
  saves,
  onSettingsChange,
  onRuntimeDramaticContentChange,
  onRuntimeCantoneseFlavorChange,
  onRuntimeGameDifficultyChange = () => undefined,
  onOpenCurrentSaveCustomContentLibrary,
  onRuntimeCustomContentPriorityChange = async () => undefined,
  onRuntimeCustomContentPausedChange = async () => undefined,
  onRuntimeCustomContentAdaptationRequest = async () => undefined,
  onClearData,
  avgResourcePackManager,
  onAvgResourceChange,
  onBack
}: SettingsScreenProps) {
  const [page, setPage] = useState<SettingsPage>(() => resolveInitialPage(initialDestination));
  const [featurePage, setFeaturePage] = useState<FeatureSettingsPage>(() => resolveInitialFeaturePage(initialDestination));
  const isFeatureActive = page === 'features';

  return (
    <main className={`settings-screen${page === 'avgResources' ? ' settings-screen--avg-resources' : ''}`}>
      <aside className="settings-sidebar">
        <h1>设置</h1>
        <nav>
          {menuItems.map((item) => (
            <div
              key={item.id}
              className={`settings-nav-group${page === item.id ? ' active-group' : ''}`}
            >
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
        {page === 'imageGeneration' ? <ImageGenerationSettingsPanel /> : null}
        {page === 'avgResources' ? (
          <AvgResourcePackSettingsPanel
            manager={avgResourcePackManager}
            onResourceChange={onAvgResourceChange}
            displaySettings={settings.display}
            onDisplaySettingsChange={(display) => onSettingsChange({
              ...settings,
              display
            })}
          />
        ) : null}
        {page === 'features' ? (
          <FeatureConfigPanel
            page={featurePage}
            settings={settings}
            onChange={onSettingsChange}
            onOpenApiConfig={() => setPage('api')}
          />
        ) : null}
        {page === 'data' ? (
          <DataManagementPanel
            settings={settings}
            saves={saves}
            hasActiveGame={Boolean(runtimeState)}
            onClear={onClearData}
          />
        ) : null}
        {page === 'game' ? (
          <GameSettingsPanel
            page="game"
            settings={settings}
            runtimeState={runtimeState}
            onChange={onSettingsChange}
            onRuntimeDramaticContentChange={onRuntimeDramaticContentChange}
            onRuntimeCantoneseFlavorChange={onRuntimeCantoneseFlavorChange}
            onRuntimeGameDifficultyChange={onRuntimeGameDifficultyChange}
            onOpenCurrentSaveCustomContentLibrary={
              onOpenCurrentSaveCustomContentLibrary
            }
            onRuntimeCustomContentPriorityChange={
              onRuntimeCustomContentPriorityChange
            }
            onRuntimeCustomContentPausedChange={
              onRuntimeCustomContentPausedChange
            }
            onRuntimeCustomContentAdaptationRequest={
              onRuntimeCustomContentAdaptationRequest
            }
          />
        ) : null}
        {page === 'gameplay' ? (
          <GameSettingsPanel
            page="gameplay"
            settings={settings}
            runtimeState={runtimeState}
            onChange={onSettingsChange}
            onRuntimeDramaticContentChange={onRuntimeDramaticContentChange}
          />
        ) : null}
        {page === 'display' ? <DisplaySettingsPanel settings={settings} onChange={onSettingsChange} /> : null}
        {page === 'prompts' ? <PromptManagementPanel settings={settings} onChange={onSettingsChange} /> : null}
        {page === 'tavern' ? <TavernManagementPanel settings={settings} onChange={onSettingsChange} /> : null}
        {page === 'tokens' ? <TokenEstimatePanel settings={settings} runtimeState={runtimeState} /> : null}
      </section>
    </main>
  );
}
