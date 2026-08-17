import { useMemo, useState } from 'react';
import type { RuntimeState } from '../../domain/runtime/types';
import type {
  CurrentSaveContentEntry,
  CurrentSaveContentKind
} from '../customContent/currentSaveLibrary';
import { projectRuntimeCustomContentLibrary } from '../customContent/currentSaveLibrary';

export interface CurrentSaveCustomContentTarget {
  kind: 'character' | 'event_group';
  assetId: string;
}

export interface CurrentSaveCustomContentPriorityChange
  extends CurrentSaveCustomContentTarget {
  prioritized: boolean;
}

export interface CurrentSaveCustomContentPausedChange
  extends CurrentSaveCustomContentTarget {
  paused: boolean;
}

export interface CurrentSaveCustomContentAdaptationRequest {
  eventGroupId: string;
  characterAssetId: string;
}

interface CurrentSaveCustomContentSettingsPanelProps {
  runtimeState: RuntimeState;
  onOpenContentLibrary?: () => void;
  onPriorityChange: (
    change: CurrentSaveCustomContentPriorityChange
  ) => Promise<void>;
  onPausedChange: (
    change: CurrentSaveCustomContentPausedChange
  ) => Promise<void>;
  onAdaptationRequest?: (
    request: CurrentSaveCustomContentAdaptationRequest
  ) => Promise<void>;
}

const characterStatusLabels = {
  queued: '等待合理入口',
  seeking_anchor: '正在寻找登场机会',
  known_of: '玩家已听闻',
  contactable: '已经可以联系',
  met: '已经正式登场',
  established: '已经建立稳定关系',
  paused: '已暂停主动推进',
  cancelled: '已取消推进'
} as const;

const eventStatusLabels = {
  queued: '等待合理入口',
  seeking_anchor: '正在寻找切入点',
  anchored: '已经进入剧情',
  engaged: '玩家已经介入',
  paused: '已暂停主动推进',
  cancelled: '已取消推进'
} as const;

function targetKind(entry: CurrentSaveContentEntry): CurrentSaveCustomContentTarget['kind'] {
  return entry.kind === 'characters' ? 'character' : 'event_group';
}

function isPaused(entry: CurrentSaveContentEntry): boolean {
  return (
    entry.intent?.status === 'paused' ||
    entry.priorityStatus === 'paused' ||
    (entry.kind === 'events' && entry.instance?.status === 'paused')
  );
}

function isEntryComplete(entry: CurrentSaveContentEntry): boolean {
  if (
    entry.priorityStatus === 'completed' ||
    entry.priorityStatus === 'cancelled'
  ) {
    return true;
  }
  if (entry.kind === 'characters') {
    return (
      entry.intent?.status === 'met' ||
      entry.intent?.status === 'established' ||
      entry.intent?.status === 'cancelled'
    );
  }
  return (
    entry.intent?.status === 'anchored' ||
    entry.intent?.status === 'engaged' ||
    entry.intent?.status === 'cancelled' ||
    entry.instance?.status === 'anchored' ||
    entry.instance?.status === 'active' ||
    entry.instance?.status === 'completed' ||
    entry.instance?.status === 'diverged' ||
    entry.instance?.status === 'abandoned'
  );
}

function progressionLabel(entry: CurrentSaveContentEntry): string {
  if (entry.kind === 'characters') {
    return entry.intent
      ? characterStatusLabels[entry.intent.status]
      : '尚未建立登场意图';
  }
  if (entry.intent) return eventStatusLabels[entry.intent.status];
  if (entry.instance?.status === 'completed') return '事件已经完成';
  if (entry.instance?.status === 'abandoned') return '已放弃后续推进';
  return '尚未建立事件意图';
}

function typeLabel(kind: CurrentSaveContentKind): string {
  return kind === 'characters' ? '人物' : '事件';
}

export function CurrentSaveCustomContentSettingsPanel({
  runtimeState,
  onOpenContentLibrary,
  onPriorityChange,
  onPausedChange,
  onAdaptationRequest = async () => undefined
}: CurrentSaveCustomContentSettingsPanelProps) {
  const library = useMemo(
    () => projectRuntimeCustomContentLibrary(runtimeState),
    [runtimeState]
  );
  const [busyTarget, setBusyTarget] = useState<string>();
  const [operationMessage, setOperationMessage] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const entries = [
    ...library.characters.filter((entry) => entry.intent),
    ...library.events
  ];

  async function runOperation(
    entry: CurrentSaveContentEntry,
    operation: () => Promise<void>,
    successMessage: string
  ) {
    setBusyTarget(entry.bindingId);
    setOperationMessage(undefined);
    setOperationError(undefined);
    try {
      await operation();
      setOperationMessage(successMessage);
    } catch (error) {
      setOperationError(
        error instanceof Error ? error.message : '本局自定义内容设置保存失败。'
      );
    } finally {
      setBusyTarget(undefined);
    }
  }

  return (
    <section
      className="settings-section current-save-custom-content-settings"
      aria-label="本局自定义内容推进"
    >
      <div className="current-save-custom-content-heading">
        <div>
          <h3>本局自定义内容推进</h3>
          <p className="muted">
            这里只调整当前存档之后的登场优先级，不编辑人物或事件 revision。
          </p>
        </div>
        <div className="current-save-custom-content-heading-actions">
          <strong aria-label={`本局重点 ${library.priorityCount} / 3`}>
            本局重点 {library.priorityCount} / 3
          </strong>
          {onOpenContentLibrary ? (
            <button type="button" onClick={onOpenContentLibrary}>
              管理／加入本局内容
            </button>
          ) : null}
        </div>
      </div>

      {operationMessage ? (
        <p className="current-save-custom-content-message" role="status">
          {operationMessage}
        </p>
      ) : null}
      {operationError ? (
        <p className="current-save-custom-content-error" role="alert">
          {operationError}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <div className="current-save-custom-content-empty">
          <strong>本局没有绑定自定义人物或事件</strong>
          <p>
            新开局时可在“本局自定义内容”页选择；已经开始的存档也可用上方按钮明确加入，但不会自动吸收全局内容库的新 revision。
          </p>
        </div>
      ) : (
        <div className="current-save-custom-content-list">
          {entries.map((entry) => {
            const paused = isPaused(entry);
            const complete = isEntryComplete(entry);
            const eventProgress =
              entry.kind === 'events' && entry.instance
                ? {
                    status: entry.instance.status,
                    currentStage:
                      entry.revisionPayload.stages.find(
                        (stage) =>
                          stage.stageId === entry.instance?.currentStageId
                      ) ??
                      entry.revisionPayload.stages.find(
                        (stage) =>
                          !entry.instance?.usedStageIds.includes(stage.stageId)
                      ),
                    completedStageCount: entry.instance.usedStageIds.length,
                    totalStageCount: entry.revisionPayload.stages.length,
                    usedNodeCount: entry.instance.usedNodeIds.length,
                    establishedFactCount: Object.values(
                      entry.instance.factStateOverrides ?? {}
                    ).filter((state) => state === 'established_in_save').length,
                    invalidatedFactCount: Object.values(
                      entry.instance.factStateOverrides ?? {}
                    ).filter((state) => state === 'invalidated_in_save').length
                  }
                : undefined;
            const hasPriority =
              entry.priorityStatus === 'active' ||
              entry.priorityStatus === 'paused';
            const ready = entry.adaptationStatus === 'ready';
            const busy = busyTarget !== undefined;
            const target = {
              kind: targetKind(entry),
              assetId: entry.assetId
            };
            return (
              <article
                key={`${entry.kind}:${entry.bindingId}`}
                className="current-save-custom-content-card"
              >
                <header>
                  <div>
                    <span>{typeLabel(entry.kind)}</span>
                    <strong>{entry.title}</strong>
                  </div>
                  <span
                    className={
                      complete
                        ? 'is-complete'
                        : paused
                          ? 'is-paused'
                          : hasPriority
                            ? 'is-priority'
                            : undefined
                    }
                  >
                    {progressionLabel(entry)}
                  </span>
                </header>
                <p>{entry.summary}</p>
                <dl>
                  <div>
                    <dt>固定版本</dt>
                    <dd>revision {entry.revision}</dd>
                  </div>
                  <div>
                    <dt>所属内容</dt>
                    <dd>
                      {entry.projectTitle ??
                        (entry.kind === 'characters' ? '独立人物' : '独立事件')}
                    </dd>
                  </div>
                  <div>
                    <dt>世界事实</dt>
                    <dd>{entry.hasWorldFacts ? '已经形成' : '尚未形成'}</dd>
                  </div>
                  {eventProgress ? (
                    <>
                      <div>
                        <dt>当前阶段</dt>
                        <dd>
                          {eventProgress.status === 'completed'
                            ? '事件已完成'
                            : eventProgress.status === 'diverged'
                              ? '已偏转为本局发展'
                              : eventProgress.currentStage?.title ??
                                '暂无可用阶段'}
                        </dd>
                      </div>
                      <div>
                        <dt>阶段 / 节点</dt>
                        <dd>
                          {eventProgress.completedStageCount} /{' '}
                          {eventProgress.totalStageCount} 阶段 · 已采用{' '}
                          {eventProgress.usedNodeCount} 个节点
                        </dd>
                      </div>
                      <div>
                        <dt>事实状态</dt>
                        <dd>
                          已成立 {eventProgress.establishedFactCount} · 已失效{' '}
                          {eventProgress.invalidatedFactCount}
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>

                {entry.kind === 'events' &&
                (entry.lazyCharacters?.length ?? 0) > 0 ? (
                  <div className="current-save-custom-content-lazy-characters">
                    <strong>项目人物按需适配</strong>
                    <p className="muted">
                      当前阶段引用的人物才会进入适配；其余人物保持冻结 revision，不会提前生成 Actor。
                    </p>
                    <ul>
                      {entry.lazyCharacters?.map((character) => (
                        <li key={character.characterAssetId}>
                          <span>
                            {character.displayName}
                            {character.currentStageReferenced
                              ? ' · 当前阶段'
                              : ' · 后续候选'}
                          </span>
                          {character.adaptationStatus ? (
                            <small>
                              {character.adaptationStatus === 'ready'
                                ? '适配就绪'
                                : character.adaptationStatus === 'needs_review'
                                  ? '适配待审核'
                                  : '适配不兼容'}
                            </small>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void runOperation(
                                  entry,
                                  () =>
                                    onAdaptationRequest({
                                      eventGroupId: entry.assetId,
                                      characterAssetId:
                                        character.characterAssetId
                                    }),
                                  `已为“${character.displayName}”创建并保存本局适配；稳定人物 ID 保持不变。`
                                )
                              }
                            >
                              {character.currentStageReferenced
                                ? '适配当前阶段人物'
                                : '手动要求适配'}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {!ready ? (
                  <p className="current-save-custom-content-note">
                    世界适配尚未就绪，完成审核前不能主动推进。
                  </p>
                ) : complete ? (
                  <p className="current-save-custom-content-note">
                    初次登场目标已经完成；后续由本局现有人物关系、事项和事件事实继续推进。
                  </p>
                ) : (
                  <div className="current-save-custom-content-actions">
                    <button
                      type="button"
                      disabled={
                        busy ||
                        (!hasPriority && library.priorityCount >= 3)
                      }
                      onClick={() =>
                        void runOperation(
                          entry,
                          () =>
                            onPriorityChange({
                              ...target,
                              prioritized: !hasPriority
                            }),
                          hasPriority
                            ? `已取消“${entry.title}”的本局重点；冻结 revision 保持不变。`
                            : `已将“${entry.title}”设为本局重点。`
                        )
                      }
                    >
                      {hasPriority ? '取消本局重点' : '设为本局重点'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runOperation(
                          entry,
                          () =>
                            onPausedChange({
                              ...target,
                              paused: !paused
                            }),
                          paused
                            ? `已恢复“${entry.title}”的主动推进。`
                            : `已暂停“${entry.title}”的主动推进。`
                        )
                      }
                    >
                      {paused ? '恢复主动推进' : '暂停主动推进'}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="muted current-save-custom-content-boundary">
        本局重点表达“尽快寻找合理入口”，不是强制下一回合登场；玩家行动、当前场景和已经到期的事实仍然优先。
      </p>
    </section>
  );
}
