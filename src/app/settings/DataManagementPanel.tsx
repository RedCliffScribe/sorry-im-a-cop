import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RuntimeSaveSummary } from '../../domain/persistence/SaveRepository';
import type { AiSettings } from '../../domain/settings/types';
import {
  countLocalInterfaceRecords,
  readCustomOriginCount,
  type DataClearTarget
} from './dataManagement';

interface DataManagementPanelProps {
  settings: AiSettings;
  saves: RuntimeSaveSummary[];
  hasActiveGame: boolean;
  onClear: (target: DataClearTarget) => Promise<void>;
}

interface DataActionDefinition {
  target: DataClearTarget;
  title: string;
  description: string;
  status: string;
  firstWarning: string;
  finalWarning: string;
  successMessage: string;
  buttonLabel?: string;
  preserveNote?: string;
  dangerLevel?: 'standard' | 'critical';
}

interface ConfirmationState {
  action: DataActionDefinition;
  stage: 1 | 2;
}

function formatCount(count: number, unit: string, emptyLabel: string): string {
  return count > 0 ? `${count} ${unit}` : `暂无${emptyLabel}`;
}

export function DataManagementPanel({ settings, saves, hasActiveGame, onClear }: DataManagementPanelProps) {
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const promptOverrideCount = Object.values(settings.prompts.overrides).filter((value) => value.trim()).length;
  const persistentPromptCount = settings.prompts.persistentPrompts?.length ?? 0;
  const tavernPresetCount = settings.tavern.entries.length;
  const customOriginCount = readCustomOriginCount();
  const localRecordCount = countLocalInterfaceRecords();

  const actions = useMemo<DataActionDefinition[]>(() => [
    {
      target: 'gameData',
      title: '游戏存档与回溯记录',
      description: '清除全部手动/自动存档、剧情与世界状态、回合快照、文生图资产和自动触发记录。人物记忆、案件、关系和图册等随存档保存的内容也会一并删除。',
      status: `${formatCount(saves.length, '份存档', '存档')}${hasActiveGame ? ' · 当前有进行中的游戏' : ''}`,
      firstWarning: '全部存档、回合快照和当前正在进行的游戏都会被删除。',
      finalWarning: '完成后无法读取现有角色或恢复本次游戏，设置与 API 配置不会受影响。',
      successMessage: '游戏存档、回溯记录、文生图资产与当前游戏已清空。'
    },
    {
      target: 'apiSettings',
      title: 'API 与模型配置',
      description: '清除主剧情与文生图的 API 地址、密钥、接口类型、模型/工作流、模型路由、图片测试证据及关联生成预设。',
      status: `${formatCount(settings.apiProfiles.length, '份 API 档案', ' API 档案')}${settings.mainNarrator ? ' · 已选择主剧情模型' : ''}`,
      firstWarning: '保存的主剧情及文生图 API 档案、凭据、模型路由和关联生成预设将被移除。',
      finalWarning: '清空后必须重新填写 API 并选择主剧情及文生图模型，才能继续生成新剧情或图片；已生成图片不受影响。',
      successMessage: 'API 与模型配置已清空。'
    },
    {
      target: 'promptSettings',
      title: '提示词修改与永久提示词',
      description: '恢复内置剧情及文生图转换提示词，清除玩家对剧情提示词、图片通用提示词的修改，以及行动栏中保存的永久提示词。',
      status: `${formatCount(promptOverrideCount, '项提示词修改', '提示词修改')} · ${formatCount(persistentPromptCount, '条永久提示词', '永久提示词')}`,
      firstWarning: '全部剧情及图片自定义提示词修改和永久提示词将被删除。',
      finalWarning: '此操作不会删除酒馆预设、API、存档或其他游戏设置。',
      successMessage: '提示词修改与永久提示词已清空。'
    },
    {
      target: 'tavernSettings',
      title: '酒馆预设与自定义 CoT',
      description: '清除导入的 SillyTavern 预设、逐条开关与改写、自定义 CoT 和推理输出设置。',
      status: `${formatCount(tavernPresetCount, '份酒馆预设', '酒馆预设')}${settings.tavern.customCot.enabled ? ' · 自定义 CoT 已启用' : ''}`,
      firstWarning: '全部酒馆预设及其独立开关、改写和 CoT 设置将被删除。',
      finalWarning: '原始预设文件不会受影响，但游戏内的管理配置无法恢复。',
      successMessage: '酒馆预设与自定义 CoT 已清空。'
    },
    {
      target: 'gameSettings',
      title: '游戏与叙事设置',
      description: '重置语言、正文篇幅、人称、演绎风格、自动存档、回溯数量及怀孕机制强度。',
      status: '已保存本机参数',
      firstWarning: '游戏与叙事参数将恢复为默认值。',
      finalWarning: '现有存档不会被删除，但之后生成与显示将使用默认游戏参数。',
      successMessage: '游戏与叙事设置已恢复默认。'
    },
    {
      target: 'displaySettings',
      title: '显示设置',
      description: '重置界面主题、界面字体、正文/对白字体与字号。',
      status: settings.display.uiTheme === 'light' ? '当前使用明快主题' : '当前使用暗色主题',
      firstWarning: '显示参数将恢复为默认暗色主题与默认字体。',
      finalWarning: '此操作只影响显示，不会删除存档、API 或剧情内容。',
      successMessage: '显示设置已恢复默认。'
    },
    {
      target: 'memorySettings',
      title: '记忆压缩参数',
      description: '重置近期回合、分批压缩与长期记忆投喂预算。这里仅清参数；NPC 已有记忆属于游戏存档。',
      status: settings.memory.autoCompressionEnabled ? '自动压缩已启用' : '自动压缩已关闭',
      firstWarning: '记忆压缩与投喂参数将恢复为默认值。',
      finalWarning: '不会删除存档中的 NPC 记忆；后续回合将按默认压缩策略运行。',
      successMessage: '记忆压缩参数已恢复默认。'
    },
    {
      target: 'customOrigins',
      title: '自定义开局背景',
      description: '清除开局向导中由玩家保存的自定义出身；内置香港世界包与开局选项不受影响。',
      status: formatCount(customOriginCount, '份自定义出身', '自定义出身'),
      firstWarning: '全部自定义开局背景将被删除。',
      finalWarning: '已使用这些背景建立的现有存档仍可读取，但开局向导中不能再重新选择已删除的自定义背景。',
      successMessage: '自定义开局背景已清空。'
    },
    {
      target: 'localRecords',
      title: '本地引导与匿名识别记录',
      description: '清除更新日志阅读状态、首次使用引导、法律声明确认记录，以及不含剧情内容的匿名访问/会话标识。',
      status: formatCount(localRecordCount, '项本地记录', '本地记录'),
      firstWarning: '本机上的引导阅读状态与匿名标识将被删除。',
      finalWarning: '下次使用时可能重新显示法律声明、新手引导和更新日志，并生成新的匿名统计标识。',
      successMessage: '本地引导与匿名识别记录已清空。'
    }
  ], [
    customOriginCount,
    hasActiveGame,
    localRecordCount,
    persistentPromptCount,
    promptOverrideCount,
    saves.length,
    settings.apiProfiles.length,
    settings.display.uiTheme,
    settings.mainNarrator,
    settings.memory.autoCompressionEnabled,
    settings.tavern.customCot.enabled,
    tavernPresetCount
  ]);

  const resetActions = useMemo<DataActionDefinition[]>(() => [
    {
      target: 'allExceptApi',
      title: '清空全部数据（保留 API 设置）',
      description: '清除存档、图片资产、回溯、当前游戏、提示词/酒馆预设、文生图自动化与生成参数、自定义出身和本地界面记录。',
      status: '保留主剧情及文生图 API 档案、凭据、模型与工作流',
      firstWarning: '除 API 与模型配置外，项目在本机保存的其他数据都会被清除或恢复默认。',
      finalWarning: '存档、当前剧情、自定义提示词、酒馆预设和自定义出身将永久删除。',
      preserveNote: '保留：主剧情及文生图 API 地址与密钥、模型列表、ComfyUI 工作流、主剧情模型、辅助功能模型路由。',
      successMessage: '除 API 与模型配置外，全部本地数据已清空。',
      buttonLabel: '清空全部数据（保留 API）',
      dangerLevel: 'critical'
    },
    {
      target: 'allData',
      title: '彻底清空全部本地数据',
      description: '清除本项目在浏览器中保存的全部游戏数据、图片资产、主剧情与文生图配置，并恢复首次使用状态。',
      status: '包括 API 密钥与全部模型配置',
      firstWarning: '本项目的全部本地数据都会被删除，不保留 API 或存档。',
      finalWarning: '这是完全重置：API 密钥、存档、剧情、预设、参数和本地记录均无法恢复。',
      successMessage: '全部本地数据已清空，游戏已恢复首次使用状态。',
      buttonLabel: '彻底清空全部本地数据',
      dangerLevel: 'critical'
    }
  ], []);

  useEffect(() => {
    if (!confirmation) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isClearing) setConfirmation(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmation, isClearing]);

  async function executeClear() {
    if (!confirmation || confirmation.stage !== 2) return;
    setIsClearing(true);
    setFeedback(null);
    try {
      await onClear(confirmation.action.target);
      setFeedback(confirmation.action.successMessage);
      setConfirmation(null);
    } catch {
      setFeedback(`清空失败：“${confirmation.action.title}”仍可能保留部分数据，请刷新后检查或重试。`);
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <section className="settings-panel settings-panel-with-scroll data-management-panel">
      <header className="settings-topline">
        <div>
          <h2>数据管理</h2>
          <p>管理《对唔住，我系差人》保存在当前浏览器中的游戏数据与配置。所有清空操作均需连续确认两次。</p>
        </div>
        <span className="data-management-local-badge">仅限本地设备</span>
      </header>

      <div className="settings-page-scroll data-management-scroll" aria-label="数据管理内容">
        {feedback ? <p className="data-management-feedback" role="status">{feedback}</p> : null}

        <section className="data-management-summary" aria-label="本地数据概览">
          <div>
            <span>游戏存档</span>
            <strong>{saves.length}</strong>
          </div>
          <div>
            <span>API 档案</span>
            <strong>{settings.apiProfiles.length}</strong>
          </div>
          <div>
            <span>酒馆预设</span>
            <strong>{tavernPresetCount}</strong>
          </div>
          <div>
            <span>自定义出身</span>
            <strong>{customOriginCount}</strong>
          </div>
        </section>

        <section className="data-management-section" aria-labelledby="data-management-categories-title">
          <div className="data-management-section-heading">
            <div>
              <h3 id="data-management-categories-title">分类管理</h3>
              <p>每项只清理对应范围，不会调用浏览器的全局“清除网站数据”。</p>
            </div>
          </div>
          <div className="data-management-grid" role="list">
            {actions.map((action, index) => (
              <article className="data-management-card" role="listitem" key={action.target}>
                <div className="data-management-card-icon" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
                <div className="data-management-card-copy">
                  <h4>{action.title}</h4>
                  <p>{action.description}</p>
                  <span>{action.status}</span>
                </div>
                <button
                  type="button"
                  className="data-management-clear-button"
                  onClick={() => {
                    setFeedback(null);
                    setConfirmation({ action, stage: 1 });
                  }}
                >
                  清空
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="data-management-danger-zone" aria-labelledby="data-management-danger-title">
          <div className="data-management-section-heading">
            <div>
              <span>危险操作</span>
              <h3 id="data-management-danger-title">整体重置</h3>
              <p>以下操作会同时清除多类数据，请先导出需要保留的存档或 API 设置。</p>
            </div>
          </div>
          <div className="data-management-reset-list">
            {resetActions.map((action) => (
              <article key={action.target} className="data-management-reset-card">
                <div>
                  <h4>{action.title}</h4>
                  <p>{action.description}</p>
                  <span>{action.status}</span>
                </div>
                <button
                  type="button"
                  className="danger-button data-management-reset-button"
                  onClick={() => {
                    setFeedback(null);
                    setConfirmation({ action, stage: 1 });
                  }}
                >
                  {action.buttonLabel}
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>

      {confirmation ? createPortal((
        <div
          className="data-clear-confirmation-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isClearing) setConfirmation(null);
          }}
        >
          <section
            className="data-clear-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-clear-confirmation-title"
          >
            <div className="data-clear-confirmation-step" aria-label={`第 ${confirmation.stage} 次确认，共 2 次`}>
              <span className={confirmation.stage >= 1 ? 'active' : ''}>1</span>
              <i />
              <span className={confirmation.stage >= 2 ? 'active' : ''}>2</span>
            </div>
            <span className="data-clear-confirmation-kicker">
              第 {confirmation.stage} 次确认 · 共 2 次
            </span>
            <h3 id="data-clear-confirmation-title">
              {confirmation.stage === 1 ? `准备清空：${confirmation.action.title}` : '最后确认：此操作无法撤销'}
            </h3>
            <p className="data-clear-confirmation-warning">
              {confirmation.stage === 1 ? confirmation.action.firstWarning : confirmation.action.finalWarning}
            </p>
            {confirmation.action.preserveNote ? (
              <p className="data-clear-preserve-note">{confirmation.action.preserveNote}</p>
            ) : null}
            <p className="data-clear-confirmation-note">
              {confirmation.stage === 1
                ? '此时尚未删除任何内容；继续后还需要再确认一次。'
                : '执行后页面会立即更新，请确认需要保留的内容已经导出。'}
            </p>
            <div className="data-clear-confirmation-actions">
              <button type="button" disabled={isClearing} onClick={() => setConfirmation(null)}>
                取消
              </button>
              {confirmation.stage === 1 ? (
                <button
                  type="button"
                  className="danger-button"
                  autoFocus
                  onClick={() => setConfirmation({ ...confirmation, stage: 2 })}
                >
                  继续，进入第二次确认
                </button>
              ) : (
                <button
                  type="button"
                  className="danger-button data-clear-final-button"
                  autoFocus
                  disabled={isClearing}
                  onClick={() => void executeClear()}
                >
                  {isClearing ? '正在清空…' : `确认清空：${confirmation.action.title}`}
                </button>
              )}
            </div>
          </section>
        </div>
      ), document.body) : null}
    </section>
  );
}
