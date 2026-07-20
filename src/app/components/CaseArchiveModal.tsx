import { useMemo, useState } from 'react';
import { isNpcEvolutionTrackProjectable } from '../../domain/backgroundEvolution/trackVisibility';
import { submitAssetEvidenceToCase } from '../../domain/cases/submitEvidence';
import { gameTimeToEpochMinutes } from '../../domain/backgroundEvolution/time';
import type { AssetItem, CaseEvidenceType, CaseFile, GameTime, RuntimeState } from '../../domain/runtime/types';

interface CaseArchiveModalProps {
  state: RuntimeState;
  onClose: () => void;
  onStateChange?: (state: RuntimeState) => void;
  onDraftPlayerAction?: (actionText: string) => void;
}

const activeStatuses = new Set<CaseFile['status']>([
  'intake',
  'investigating',
  'submitted_to_prosecutions',
  'prosecution_review',
  'charged',
  'court_scheduled',
  'tried',
  'sentenced',
  'returned',
  'cold'
]);

const roleLabels: Record<CaseFile['playerRole'], string> = {
  lead: '主办',
  assist: '协办',
  execute: '执行',
  involved: '关联',
  aware: '知情'
};

const playerOwnedRoles = new Set<CaseFile['playerRole']>(['lead', 'assist', 'execute']);
const relatedRoles = new Set<CaseFile['playerRole']>(['involved', 'aware']);

const statusLabels: Record<CaseFile['status'], string> = {
  intake: '受理中',
  investigating: '办理中',
  submitted_to_prosecutions: '已提交检控意见',
  prosecution_review: '检控审查中',
  charged: '已提出控罪',
  court_scheduled: '已排期开庭',
  tried: '已审理',
  sentenced: '已判决',
  returned: '退回补充',
  archived: '已归档',
  cold: '暂缓'
};

const evidenceTypeLabels: Record<CaseEvidenceType, string> = {
  physical: '实物',
  document: '文件',
  statement: '口供',
  photo: '照片',
  recording: '录音',
  scene_record: '现场记录',
  report: '报告',
  other: '其他'
};

function formatGameTime(time?: GameTime): string {
  if (!time) return '未知时间';
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function formatRemainingTime(now: GameTime, expectedEndAt?: GameTime): string {
  if (!expectedEndAt) return '未设预计时间';
  const remainingMinutes = gameTimeToEpochMinutes(expectedEndAt) - gameTimeToEpochMinutes(now);
  if (remainingMinutes <= 0) return '等待复核';
  if (remainingMinutes < 24 * 60) return `预计剩余约 ${Math.max(1, Math.ceil(remainingMinutes / 60))} 小时`;
  return `预计剩余约 ${Math.max(1, Math.ceil(remainingMinutes / (24 * 60)))} 天`;
}

function sortCases(left: CaseFile, right: CaseFile): number {
  const leftTime = left.lastActivityAt ?? left.updatedAt;
  const rightTime = right.lastActivityAt ?? right.updatedAt;
  return formatGameTime(rightTime).localeCompare(formatGameTime(leftTime)) || left.title.localeCompare(right.title);
}

function isActiveCase(caseFile: CaseFile): boolean {
  return activeStatuses.has(caseFile.status) && caseFile.status !== 'archived';
}

function isPlayerActiveCase(caseFile: CaseFile): boolean {
  return isActiveCase(caseFile) && playerOwnedRoles.has(caseFile.playerRole);
}

function isRelatedCase(caseFile: CaseFile): boolean {
  return isActiveCase(caseFile) && relatedRoles.has(caseFile.playerRole);
}

function canSubmitEvidence(caseFile: CaseFile): boolean {
  return playerOwnedRoles.has(caseFile.playerRole);
}

function canUseLeadActions(caseFile: CaseFile): boolean {
  return caseFile.playerRole === 'lead';
}

function createProsecutionAction(caseFile: CaseFile): string {
  return `我整理案件材料，向检控部门提交对【${caseFile.title}】的检控意见。`;
}

function createArchiveAction(caseFile: CaseFile): string {
  return `我申请将【${caseFile.title}】归档，并说明理由。`;
}

function itemCanSubmitToCase(item: AssetItem, caseId: string): boolean {
  return (
    ['equipment', 'general', 'document', 'valuable'].includes(item.category) &&
    Boolean(item.evidence) &&
    item.evidence?.caseId === caseId
  );
}

export function CaseArchiveModal({ state, onClose, onStateChange, onDraftPlayerAction }: CaseArchiveModalProps) {
  const cases = useMemo(() => Object.values(state.cases).sort(sortCases), [state.cases]);
  const activeCases = cases.filter(isPlayerActiveCase);
  const relatedCases = cases.filter(isRelatedCase);
  const archivedCases = cases.filter((caseFile) => !isActiveCase(caseFile));
  const [selectedCaseId, setSelectedCaseId] = useState(
    activeCases[0]?.caseId ?? relatedCases[0]?.caseId ?? archivedCases[0]?.caseId ?? ''
  );
  const [isEvidencePickerOpen, setIsEvidencePickerOpen] = useState(false);
  const selectedCase = state.cases[selectedCaseId] ?? activeCases[0] ?? relatedCases[0] ?? archivedCases[0];
  const activeCaseTrack = selectedCase
    ? Object.values(state.backgroundEvolution.npcTracks).find(
          (track) =>
            track.visibility !== 'hidden' &&
            isNpcEvolutionTrackProjectable(state, track) &&
            track.relatedCaseIds.includes(selectedCase.caseId) &&
          (!selectedCase.leadActorId || track.actorId === selectedCase.leadActorId)
      )
    : undefined;
  const matchingEvidenceItems = useMemo(
    () => Object.values(state.assets.items).filter((item) => selectedCase && itemCanSubmitToCase(item, selectedCase.caseId)),
    [selectedCase, state.assets.items]
  );

  function selectCase(caseId: string) {
    setSelectedCaseId(caseId);
    setIsEvidencePickerOpen(false);

    const caseFile = state.cases[caseId];
    if (!caseFile || caseFile.unreadActivityCount <= 0 || !onStateChange) return;

    onStateChange({
      ...state,
      cases: {
        ...state.cases,
        [caseId]: {
          ...caseFile,
          unreadActivityCount: 0,
          lastSeenActivityAt: state.time
        }
      }
    });
  }

  function submitEvidence(itemId: string) {
    if (!selectedCase || !onStateChange) return;
    const nextState = submitAssetEvidenceToCase(state, { caseId: selectedCase.caseId, itemId });
    setIsEvidencePickerOpen(false);
    onStateChange(nextState);
  }

  function draftLeadCaseAction(actionText: string) {
    if (!onDraftPlayerAction) return;
    onDraftPlayerAction(actionText);
    onClose();
  }

  function renderCaseList(sectionKey: 'active' | 'related' | 'archived', title: string, list: CaseFile[]) {
    return (
      <section className={`case-archive-list-section case-archive-list-section--${sectionKey}`} aria-label={title}>
        <h3>
          <span>{title}</span>
          <strong>{list.length}</strong>
        </h3>
        {list.length === 0 ? <p className="case-archive-empty">暂无案件</p> : null}
        {list.map((caseFile) => (
          <button
            key={caseFile.caseId}
            type="button"
            className={`case-archive-row${caseFile.caseId === selectedCase?.caseId ? ' active' : ''}`}
            onClick={() => selectCase(caseFile.caseId)}
          >
            <span>
              <strong>{caseFile.title}</strong>
              <small>{statusLabels[caseFile.status]}</small>
            </span>
            <div className="case-row-side">
              <b>{roleLabels[caseFile.playerRole]}</b>
              {caseFile.unreadActivityCount > 0 ? (
                <em>
                  <i className="case-row-red-dot" aria-hidden="true" />
                  未读 {caseFile.unreadActivityCount}
                </em>
              ) : null}
            </div>
          </button>
        ))}
      </section>
    );
  }

  return (
    <div className="character-archive-backdrop" role="presentation">
      <section
        className="case-archive-modal archive-info-modal archive-info-modal--case feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="案件"
      >
        <header className="character-archive-header">
          <div>
            <h2>案件</h2>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="case-archive-body">
          <aside className="case-archive-sidebar">
            {renderCaseList('active', '办理中', activeCases)}
            {renderCaseList('related', '相关案件', relatedCases)}
            {renderCaseList('archived', '已归档', archivedCases)}
          </aside>

          <section className="case-archive-detail">
            {selectedCase ? (
              <>
                <div className="case-archive-detail-header">
                  <div>
                    <h3>{selectedCase.title}</h3>
                    <div className="case-detail-status-row">
                      <span>{statusLabels[selectedCase.status]}</span>
                      <span>{roleLabels[selectedCase.playerRole]}</span>
                    </div>
                  </div>
                  <div className="case-archive-actions">
                    {canSubmitEvidence(selectedCase) ? (
                      <button type="button" onClick={() => setIsEvidencePickerOpen((current) => !current)}>
                        提交证据
                      </button>
                    ) : null}
                    {canUseLeadActions(selectedCase) ? (
                      <>
                        <button
                          type="button"
                          disabled={!onDraftPlayerAction}
                          title={!onDraftPlayerAction ? '下一步接入行动输入后启用' : undefined}
                          onClick={() => draftLeadCaseAction(createProsecutionAction(selectedCase))}
                        >
                          提交检控意见
                        </button>
                        <button
                          type="button"
                          disabled={!onDraftPlayerAction}
                          title={!onDraftPlayerAction ? '下一步接入行动输入后启用' : undefined}
                          onClick={() => draftLeadCaseAction(createArchiveAction(selectedCase))}
                        >
                          申请归档
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {isEvidencePickerOpen ? (
                  <section className="case-evidence-picker" aria-label="可提交证据">
                    <h4>可提交证据</h4>
                    {matchingEvidenceItems.length === 0 ? <p>暂无可提交证据</p> : null}
                    {matchingEvidenceItems.map((item) => (
                      <button key={item.itemId} type="button" onClick={() => submitEvidence(item.itemId)}>
                        <strong>{item.name}</strong>
                        <span>{item.evidence?.summary ?? item.summary}</span>
                      </button>
                    ))}
                  </section>
                ) : null}

                <div className="case-detail-overview">
                  <section className="case-detail-summary">
                    <h4>案件简介</h4>
                    <p>{selectedCase.summary}</p>
                  </section>
                  <section className="case-detail-owner">
                    <h4>主办者</h4>
                    <p>{selectedCase.leadActorName ?? selectedCase.leadActorId ?? '未明确'}</p>
                  </section>
                </div>

                <div className="case-detail-focus-grid">
                  <section className="case-detail-focus">
                    <h4>案件提示</h4>
                    <p>{selectedCase.currentFocus || '暂无明确提示'}</p>
                  </section>
                  <section className="case-detail-progress">
                    <h4>玩家进展</h4>
                    <p>{selectedCase.playerVisibleProgress || '暂无记录'}</p>
                  </section>
                </div>

                <section className="case-evidence-list">
                  <h4>已掌握证据</h4>
                  {selectedCase.evidenceIds.length === 0 ? <p>暂无证据</p> : null}
                  {selectedCase.evidenceIds.map((evidenceId) => {
                    const evidence = state.caseEvidence[evidenceId];
                    if (!evidence) return null;
                    return (
                      <article key={evidence.evidenceId}>
                        <strong>{evidence.title}</strong>
                        <small>
                          {evidenceTypeLabels[evidence.evidenceType]} · {formatGameTime(evidence.submittedAt ?? evidence.createdAt)}
                        </small>
                        <p>{evidence.summary}</p>
                        {evidence.disputeSummary ? <em>{evidence.disputeSummary}</em> : null}
                      </article>
                    );
                  })}
                </section>

                <section className="case-activity-list">
                  <h4>案件动态</h4>
                  {activeCaseTrack ? (
                    <article className="case-current-handler-action" aria-label="主办人当前行动">
                      <header>
                        <strong>
                          {state.actors[activeCaseTrack.actorId]?.name ?? selectedCase.leadActorName ?? activeCaseTrack.actorId}
                          {' · '}
                          {selectedCase.leadActorId === activeCaseTrack.actorId ? '主办人' : '承办人'}
                        </strong>
                        <span>{activeCaseTrack.currentStatus}</span>
                      </header>
                      <p>
                        {activeCaseTrack.currentPlaceId
                          ? `${state.places[activeCaseTrack.currentPlaceId]?.nameZh ?? state.places[activeCaseTrack.currentPlaceId]?.name ?? activeCaseTrack.currentPlaceId}｜`
                          : ''}
                        {activeCaseTrack.currentAction}
                      </p>
                      <small>
                        {activeCaseTrack.startedAt ? `${formatGameTime(activeCaseTrack.startedAt)} 开始 · ` : ''}
                        {formatRemainingTime(state.time, activeCaseTrack.expectedEndAt)}
                      </small>
                    </article>
                  ) : (
                    <p className="case-current-handler-empty">当前暂无进一步办理行动</p>
                  )}
                  {selectedCase.activityLog.filter((activity) => activity.visibleToPlayer).length === 0 ? <p>暂无动态</p> : null}
                  {selectedCase.activityLog
                    .filter((activity) => activity.visibleToPlayer)
                    .map((activity) => (
                      <article key={activity.activityId}>
                        <small>{formatGameTime(activity.gameTime)}</small>
                        <p>{activity.summary}</p>
                      </article>
                    ))}
                </section>
              </>
            ) : (
              <p className="case-archive-empty">暂无案件</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
