import type {
  CurrentSaveContentEntry,
  CurrentSaveContentLibrary
} from './currentSaveLibrary';

interface CurrentSaveInspectorProps {
  entry?: CurrentSaveContentEntry;
  library: CurrentSaveContentLibrary;
  busy: boolean;
  onApprove: (entry: CurrentSaveContentEntry) => void;
  onSetPriority: (
    entry: CurrentSaveContentEntry,
    prioritized: boolean
  ) => void;
  onSetPaused: (entry: CurrentSaveContentEntry, paused: boolean) => void;
  onAbandonEvent: (entry: CurrentSaveContentEntry) => void;
}

function statusLabel(entry: CurrentSaveContentEntry): string {
  if (entry.adaptationStatus === 'ready') return '适配已就绪';
  if (entry.adaptationStatus === 'needs_review') return '适配待玩家审核';
  return '与当前世界包不兼容';
}

function isPaused(entry: CurrentSaveContentEntry): boolean {
  return (
    entry.intent?.status === 'paused' ||
    entry.priorityStatus === 'paused' ||
    (entry.kind === 'events' && entry.instance?.status === 'paused')
  );
}

export function CurrentSaveInspector({
  entry,
  library,
  busy,
  onApprove,
  onSetPriority,
  onSetPaused,
  onAbandonEvent
}: CurrentSaveInspectorProps) {
  if (!entry) {
    return (
      <>
        <div className="ccw-selected-summary is-empty">
          <span>存档绑定</span>
          <strong>请选择一个已绑定内容</strong>
          <small>绑定 revision 与适配快照都保存在存档内</small>
        </div>
        <p className="ccw-inspector-note">
          加入存档不会创建人物、事项、案件或新闻；真正发生的事实仍由现有
          Runtime 写回维护。
        </p>
      </>
    );
  }

  const paused = isPaused(entry);
  const abandoned =
    entry.kind === 'events' && entry.instance?.status === 'abandoned';
  const eventProgress =
    entry.kind === 'events' && entry.instance
      ? {
          status: entry.instance.status,
          currentStage:
            entry.revisionPayload.stages.find(
              (stage) => stage.stageId === entry.instance?.currentStageId
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
  return (
    <>
      <div className="ccw-selected-summary">
        <span>{entry.kind === 'characters' ? '本局人物' : '本局事件'}</span>
        <strong>{entry.title}</strong>
        <small>
          固定 revision {entry.revision} · {statusLabel(entry)}
        </small>
      </div>

      <div className="ccw-character-actions ccw-save-actions">
        {entry.adaptationStatus === 'needs_review' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(entry)}
          >
            审核并确认适配
          </button>
        ) : null}
        {entry.adaptationStatus === 'ready' && !abandoned ? (
          <>
            <button
              type="button"
              disabled={
                busy ||
                (!entry.prioritized && library.priorityCount >= 3)
              }
              onClick={() => onSetPriority(entry, !entry.prioritized)}
            >
              {entry.prioritized ? '取消本局重点' : '设为本局重点'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSetPaused(entry, !paused)}
            >
              {paused ? '恢复主动推进' : '暂停主动推进'}
            </button>
          </>
        ) : null}
        {entry.kind === 'events' && !abandoned ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAbandonEvent(entry)}
          >
            放弃后续推进
          </button>
        ) : null}
      </div>

      <div className="ccw-character-references ccw-save-details">
        <h3>绑定与世界事实</h3>
        <dl>
          <div>
            <dt>稳定资产 ID</dt>
            <dd>{entry.assetId}</dd>
          </div>
          <div>
            <dt>checksum</dt>
            <dd>{entry.checksum}</dd>
          </div>
          <div>
            <dt>所属项目</dt>
            <dd>{entry.projectTitle ?? '独立人物'}</dd>
          </div>
          <div>
            <dt>进入倾向</dt>
            <dd>{entry.intent?.mode ?? '无'}</dd>
          </div>
          <div>
            <dt>意图 / 实例状态</dt>
            <dd>
              {entry.intent?.status ?? '无'}
              {entry.kind === 'events' && entry.instance
                ? ` / ${entry.instance.status}`
                : ''}
            </dd>
          </div>
          <div>
            <dt>已成为世界事实</dt>
            <dd>{entry.hasWorldFacts ? '是；既有后果不会被删除' : '否'}</dd>
          </div>
        </dl>
      </div>

      {entry.kind === 'characters' && entry.adaptation ? (
        <div className="ccw-save-adaptation">
          <h3>人物适配快照</h3>
          <p>{entry.adaptation.adaptedPublicIdentity}</p>
          <dl>
            <div>
              <dt>职业</dt>
              <dd>{entry.adaptation.adaptedOccupation}</dd>
            </div>
            <div>
              <dt>社会位置</dt>
              <dd>{entry.adaptation.adaptedSocialPosition}</dd>
            </div>
            <div>
              <dt>出生 / 年龄</dt>
              <dd>
                {entry.adaptation.adaptedBirthDate ?? '未固定'}
                {' / '}
                {entry.adaptation.adaptedAgeAtAnchor ?? '未固定'}
              </dd>
            </div>
            <div>
              <dt>Runtime Actor ID</dt>
              <dd>{entry.adaptation.runtimeActorId}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {entry.kind === 'events' && entry.adaptation ? (
        <div className="ccw-save-adaptation">
          <h3>事件适配快照</h3>
          <p>{entry.adaptation.adaptedSummary}</p>
          <dl>
            <div>
              <dt>不变量</dt>
              <dd>
                {entry.adaptation.adaptedInvariantCore.join('、') || '无'}
              </dd>
            </div>
            <div>
              <dt>进入路径</dt>
              <dd>
                {entry.adaptation.adaptedEntryRoutes.join('、') || '待规划'}
              </dd>
            </div>
            <div>
              <dt>未解决冲突</dt>
              <dd>
                {entry.adaptation.unresolvedConflicts.join('、') || '无'}
              </dd>
            </div>
            <div>
              <dt>项目基线</dt>
              <dd>
                {entry.projectAdaptation
                  ? `v${entry.projectAdaptation.worldpackDescriptorVersion} · ${entry.projectAdaptation.status}`
                  : '缺失'}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {eventProgress ? (
        <div className="ccw-save-adaptation">
          <h3>本局事件进展</h3>
          <dl>
            <div>
              <dt>当前阶段</dt>
              <dd>
                {eventProgress.status === 'completed'
                  ? '事件已完成'
                  : eventProgress.status === 'diverged'
                    ? '已偏转为本局独立发展'
                    : eventProgress.currentStage?.title ?? '暂无可用阶段'}
              </dd>
            </div>
            <div>
              <dt>阶段 / 节点进度</dt>
              <dd>
                {eventProgress.completedStageCount} /{' '}
                {eventProgress.totalStageCount} 阶段 · 已采用{' '}
                {eventProgress.usedNodeCount} 个节点
              </dd>
            </div>
            <div>
              <dt>本局事实状态</dt>
              <dd>
                已成立 {eventProgress.establishedFactCount} · 已失效{' '}
                {eventProgress.invalidatedFactCount}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <p className="ccw-inspector-note">
        存档中的快照不可变；全局新 revision 不会自动覆盖当前绑定。
      </p>
    </>
  );
}
