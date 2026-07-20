import { useEffect, useId } from 'react';
import type { AiSettings, FeatureRouteId } from '../../domain/settings/types';
import {
  describeFeatureRouteStatus,
  isMainNarratorReady
} from '../onboarding/firstUseGuide';
import type { SettingsDestination } from '../settings/settingsNavigation';

interface FirstUseGuideHintProps {
  onDismiss: () => void;
  onOpen: () => void;
}
export function FirstUseGuideHint({ onDismiss, onOpen }: FirstUseGuideHintProps) {
  return (
    <aside className="first-use-home-hint" aria-label="首次使用提示">
      <div>
        <strong>首次使用</strong>
        <span>主剧情 API 尚未配置，完成引导后才能生成开局。</span>
      </div>
      <div className="first-use-home-hint__actions">
        <button type="button" onClick={onOpen}>打开新手引导</button>
        <button type="button" onClick={onDismiss}>暂时关闭提示</button>
      </div>
    </aside>
  );
}

interface GuideFeature {
  id: FeatureRouteId;
  title: string;
  destination: SettingsDestination;
  purpose: string;
  guidance: string;
}

const guideFeatures: GuideFeature[] = [
  {
    id: 'writebackRepair',
    title: '写回修复',
    destination: 'writebackRepair',
    purpose: '主剧情返回的 JSON 或协议字段不合法时，修复结构后再写入存档。',
    guidance: '建议启用。先跟随主剧情即可；追求速度时再独立使用轻量、结构化输出稳定的模型。'
  },
  {
    id: 'memorySummary',
    title: '记忆总结',
    destination: 'memorySummary',
    purpose: '把较早的正文与人物经历压缩成短期、中期和长期记忆，控制长期游玩的上下文。',
    guidance: '建议启用。可跟随主剧情，也可独立使用擅长长文本归纳和事实去重的中档模型。'
  },
  {
    id: 'memoryVector',
    title: '向量检索',
    destination: 'memoryVector',
    purpose: '用语义相似度召回相关旧记忆，补充人物、地点与关键词规则检索。',
    guidance: '可选功能，必须单独选择 embedding 向量模型，不能使用普通生成模型或“跟随主剧情”。'
  },
  {
    id: 'npcSimulation',
    title: 'NPC 模拟',
    destination: 'npcSimulation',
    purpose: '为在场人物和重要人物生成未裁定的行为建议，最终仍由主剧情模型决定。',
    guidance: '跟随主剧情时不会多发一次请求；只有配置独立 API，才会在正文前单独模拟。'
  },
  {
    id: 'backgroundEvolution',
    title: '远场演化',
    destination: 'backgroundEvolution',
    purpose: '按游戏时间推进重要远场 NPC、非玩家承办案件、社团、机构与城市轨道。',
    guidance: '建议保留。可跟随主剧情；需要把低频后台演化与正文能力、费用分开时再配置独立模型。'
  },
  {
    id: 'auxiliaryGeneration',
    title: '辅助生成',
    destination: 'auxiliaryGeneration',
    purpose: '生成报纸、城市侧写和其他低频背景材料，不接管主剧情裁定。',
    guidance: '可跟随主剧情，也可独立使用快速、低成本的轻量生成模型。'
  }
];

interface FirstUseGuideModalProps {
  settings: AiSettings;
  onClose: () => void;
  onComplete: () => void;
  onOpenSettings: (destination: SettingsDestination) => void;
}

export function FirstUseGuideModal({
  settings,
  onClose,
  onComplete,
  onOpenSettings
}: FirstUseGuideModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const isMainReady = isMainNarratorReady(settings);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="first-use-guide-backdrop">
      <section
        className="first-use-guide-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="first-use-guide-header">
          <div>
            <span className="first-use-guide-kicker">FIRST RUN · API SETUP</span>
            <h2 id={titleId}>首次使用引导</h2>
            <p id={descriptionId}>先接通主剧情，再按需要决定辅助功能是否复用同一套 API。</p>
          </div>
          <button className="first-use-guide-close" type="button" aria-label="关闭新手引导" onClick={onClose}>×</button>
        </header>

        <div className="first-use-guide-copy">
          <section className="first-use-guide-overview" aria-label="配置原则">
            <div>
              <strong>一份 API 档案可以复用</strong>
              <p>无需为六个辅助功能各准备一把密钥。先建立一个 API 档案并设为主剧情，辅助功能默认可以跟随它。</p>
            </div>
            <div className={`first-use-guide-main-status${isMainReady ? ' is-ready' : ''}`}>
              <span>主剧情 API</span>
              <strong>{isMainReady ? '已完成' : '尚未完成'}</strong>
              <small>已保存 {settings.apiProfiles.length} 个 API 档案</small>
            </div>
          </section>

          <section className="first-use-guide-required" aria-label="主剧情 API 配置步骤">
            <div className="first-use-guide-section-heading">
              <div>
                <span>必填 · 01</span>
                <h3>先配置主剧情 API</h3>
              </div>
              <button type="button" onClick={() => onOpenSettings('api')}>前往主剧情 API 配置</button>
            </div>
            <ol>
              <li><strong>建立 API 档案</strong><span>填写配置名称、接口类型、Base URL 与 API Key。</span></li>
              <li><strong>取得或填写模型</strong><span>点击“获取模型”，也可以手动填写服务商提供的模型 ID。</span></li>
              <li><strong>保存主剧情模型</strong><span>先保存 API 档案，再在下方选择“主剧情 API”和模型并保存。</span></li>
            </ol>
            <p className="first-use-guide-security-note">API 配置保存在本机浏览器。导出的 API 设置会包含密钥，请只用于自己的私有备份，不要上传公开仓库。</p>
          </section>

          <section className="first-use-guide-optional" aria-label="辅助 API 功能说明">
            <div className="first-use-guide-section-heading">
              <div>
                <span>按需 · 02</span>
                <h3>了解六类辅助 API</h3>
              </div>
              <p>每张卡片都显示当前真实路由状态。</p>
            </div>
            <div className="first-use-guide-grid">
              {guideFeatures.map((feature) => (
                <article key={feature.id} className="first-use-guide-card">
                  <div className="first-use-guide-card__topline">
                    <h4>{feature.title}</h4>
                    <span>{describeFeatureRouteStatus(settings, feature.id)}</span>
                  </div>
                  <p>{feature.purpose}</p>
                  <small>{feature.guidance}</small>
                  <button type="button" onClick={() => onOpenSettings(feature.destination)}>配置{feature.title}</button>
                </article>
              ))}
            </div>
          </section>
        </div>

        <footer className="first-use-guide-footer">
          <p>{isMainReady ? '主剧情已接通；辅助功能以后仍可随时调整。' : '可以先关闭引导，首页的“新手引导”按钮会一直保留。'}</p>
          <div>
            <button type="button" onClick={onClose}>返回首页</button>
            <button type="button" onClick={onComplete}>{isMainReady ? '完成引导' : '稍后再说'}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
