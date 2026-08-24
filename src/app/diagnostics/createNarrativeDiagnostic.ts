import type { AssetCategory, AssetItem, RuntimeState, StoryEntry } from '../../domain/runtime/types';
import { selectContext } from '../../domain/context/selectContext';
import { selectNpcSimulationMemoryProjection } from '../../domain/npc/npcSimulation';
import type {
  NarratorAttemptRecord,
  NarratorAttemptStartRecord
} from '../../domain/narrator/NarratorClient';
import type { JudgementRecoveryTrace } from '../../domain/conflict/judgementRecoveryTrace';
import { formatGameTimeWithWeekday } from '../../domain/time/gameTime';
import { collectUnresolvedPartialWritebackDiagnostics } from '../../domain/writeback/writebackDiagnostics';
import type { OfficialDlcDramaAuditRecord } from '../../domain/dlc/dramaAudit';
import { POLICE_PROMOTION_DLC_ID } from '../../domain/police/policePromotionRules';

const DIAGNOSTIC_STORY_TURN_LIMIT = 10;

interface CreateNarrativeDiagnosticInput {
  state: RuntimeState;
  saveId?: string;
  streamingText?: string;
  lastError?: string | null;
  lastRawNarratorResponse?: string | null;
  lastNarratorAttempts?: NarratorAttemptRecord[];
  lastTurnNarratorAttemptStarts?: NarratorAttemptStartRecord[];
  lastTurnNarratorAttempts?: NarratorAttemptRecord[];
  lastTurnExecution?: TurnExecutionDiagnostic | null;
  lastPlayerInput?: string;
  lastJudgementRecoveryTrace?: JudgementRecoveryTrace | null;
  lastOfficialDlcDramaAudit?: OfficialDlcDramaAuditRecord[];
}

export interface TurnExecutionDiagnostic {
  requestId: string;
  turnId: string;
  status: 'running' | 'succeeded' | 'failed' | 'aborted';
  stage: string;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  stages?: TurnExecutionStageDiagnostic[];
}

export interface TurnExecutionStageDiagnostic {
  stage: string;
  startedAt: string;
  finishedAt?: string;
}

function formatGameTime(time: RuntimeState['time']): string {
  return formatGameTimeWithWeekday(time);
}

function classifyNarratorAttemptFailure(errorMessage: string): string {
  if (/abort|已中止/i.test(errorMessage)) {
    return 'aborted（请求被玩家或界面中止）';
  }
  if (/timeout|timed out|超时/i.test(errorMessage)) {
    return 'timeout（接口在本地超时门槛内没有完成）';
  }
  const httpStatus = errorMessage.match(
    /(?:请求失败|http(?:\s+status)?)[：:\s]+(\d{3})/i
  )?.[1];
  if (httpStatus) {
    return `http_${httpStatus}（服务商已返回明确 HTTP 状态）`;
  }
  if (
    /failed to fetch|fetch failed|network ?error|network request failed|econn|enotfound|网络连接|连接失败/i.test(
      errorMessage
    )
  ) {
    return 'browser_transport_or_cors（浏览器没有取得可用 HTTP 响应；可能是网络、代理或 CORS）';
  }
  if (/json|schema|parse|解析|格式|校验|验证/i.test(errorMessage)) {
    return 'response_format（已收到内容，但返回格式未通过处理）';
  }
  return 'unknown（现有信息不足以归类）';
}

function formatNarratorAttempt(
  attempt: NarratorAttemptRecord,
  index: number,
  scope: '开局' | '本次主回合'
): string {
  const usage = attempt.usage
    ? [
        attempt.usage.promptTokens === undefined
          ? null
          : `prompt_tokens=${attempt.usage.promptTokens}`,
        attempt.usage.completionTokens === undefined
          ? null
          : `completion_tokens=${attempt.usage.completionTokens}`
      ]
        .filter((item): item is string => Boolean(item))
        .join(' ')
    : '';

  const outputBudget = attempt.outputBudget;
  const isOpeningRepair =
    attempt.purpose.startsWith('opening_') &&
    attempt.purpose.includes('repair');
  const budgetLines = outputBudget
    ? [
        `玩家线路上限：${outputBudget.configuredMaxTokens}${
          outputBudget.configuredMaxTokensSource === 'system_default'
            ? '（系统默认）'
            : ''
        }`,
        `${isOpeningRepair ? '当前修复可用上限' : '当前阶段预算'}：${
          outputBudget.stageMaxTokens ?? '未声明'
        }`,
        `服务商能力上限：${outputBudget.providerMaxOutputTokens ?? '未声明'}`,
        `最终请求上限：${outputBudget.requestedMaxTokens}`,
        `限制来源：${
          outputBudget.limitingSource === 'configured_max_tokens'
            ? '玩家线路上限'
            : outputBudget.limitingSource === 'stage_budget'
              ? '当前阶段预算'
              : '服务商能力上限'
        }`,
        ...(isOpeningRepair
          ? ['预算策略：局部修复继承线路上限；实际输出量以 completion_tokens 为准。']
          : [])
      ]
    : [`最大输出：${attempt.requestedMaxTokens ?? '未记录'}`];

  return [
    `## ${scope}请求尝试 ${index + 1}`,
    `请求状态：${attempt.errorMessage ? '失败' : '成功'}`,
    `阶段：${attempt.purpose}`,
    `尝试编号：${attempt.attemptId}`,
    `流式：${attempt.stream ? 'true' : 'false'}`,
    ...budgetLines,
    `finish_reason：${attempt.finishReason}`,
    `解析结果：${attempt.parseStatus}`,
    `本地 JSON 修复：${attempt.localJsonRepairApplied ? '是' : '否'}`,
    `原始字符数：${attempt.rawText.length}`,
    `开始时间：${attempt.startedAt}`,
    `完成时间：${attempt.finishedAt}`,
    usage ? `usage：${usage}` : 'usage：未提供',
    ...(attempt.errorMessage
      ? [`失败分类：${classifyNarratorAttemptFailure(attempt.errorMessage)}`]
      : []),
    attempt.errorMessage ? `错误：${attempt.errorMessage}` : '错误：无',
    '',
    attempt.rawText.trim() || '- 空响应'
  ].join('\n');
}

function formatPendingNarratorAttempt(
  attempt: NarratorAttemptStartRecord,
  index: number
): string {
  return [
    `## 本次主回合请求尝试 ${index + 1}`,
    '请求状态：进行中',
    `阶段：${attempt.purpose}`,
    `尝试编号：${attempt.attemptId}`,
    `流式：${attempt.stream ? 'true' : 'false'}`,
    `最大输出：${attempt.requestedMaxTokens ?? '未记录'}`,
    `开始时间：${attempt.startedAt}`,
    '完成时间：未完成',
    '说明：该请求尚未产生完成或失败记录，不能据此判断为网络错误。'
  ].join('\n');
}

function formatTurnNarratorAttempts(
  starts: NarratorAttemptStartRecord[],
  attempts: NarratorAttemptRecord[]
): string {
  const completedById = new Map(
    attempts.map((attempt) => [attempt.attemptId, attempt])
  );
  const ordered = starts.map((start) => ({
    startedAt: start.startedAt,
    start,
    attempt: completedById.get(start.attemptId)
  }));
  const knownIds = new Set(starts.map((start) => start.attemptId));
  for (const attempt of attempts) {
    if (knownIds.has(attempt.attemptId)) continue;
    ordered.push({
      startedAt: attempt.startedAt,
      start: attempt,
      attempt
    });
  }
  ordered.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  if (ordered.length === 0) return '- 无';
  return ordered
    .map(({ start, attempt }, index) =>
      attempt
        ? formatNarratorAttempt(attempt, index, '本次主回合')
        : formatPendingNarratorAttempt(start, index)
    )
    .join('\n\n');
}

function formatTurnExecutionDiagnostic(
  execution: TurnExecutionDiagnostic | null | undefined
): string {
  if (!execution) return '- 本次界面会话没有主回合执行记录。';
  const statusLabel = {
    running: '进行中',
    succeeded: '成功',
    failed: '失败',
    aborted: '玩家中止'
  }[execution.status];
  const stageTimeline = execution.stages?.length
    ? execution.stages.map((stage, index) => [
        `${index + 1}. ${stage.stage}`,
        `startedAt=${stage.startedAt}`,
        `finishedAt=${stage.finishedAt ?? (index === execution.stages!.length - 1 ? execution.finishedAt ?? '未完成' : '未记录')}`
      ].join(' · ')).join('\n')
    : '- 未记录阶段时间线';
  return [
    `requestId=${execution.requestId}`,
    `turnId=${execution.turnId}`,
    `status=${execution.status}（${statusLabel}）`,
    `stage=${execution.stage}`,
    `startedAt=${execution.startedAt}`,
    `finishedAt=${execution.finishedAt ?? '未完成'}`,
    execution.errorMessage
      ? `error=${execution.errorMessage}`
      : execution.status === 'running'
        ? '说明=本回合仍在执行，尚未产生失败结论。'
        : 'error=无',
    'stageTimeline=',
    stageTimeline
  ].join('\n');
}

function formatJudgementRecoveryTrace(trace: JudgementRecoveryTrace | null | undefined): string {
  if (!trace) return '- 本次界面会话没有判定恢复记录。';
  const stageLines = trace.stages.map((stage) => [
    `stage=${stage.stage}`,
    `status=${stage.status}`,
    `occurredAt=${stage.occurredAt}`,
    `detail=${stage.detail}`,
    stage.paths?.length ? `paths=${stage.paths.join(',')}` : null
  ].filter((line): line is string => Boolean(line)).join('\n'));
  return [
    `requestId=${trace.requestId}`,
    `turnId=${trace.turnId}`,
    `startedAt=${trace.startedAt}`,
    `finishedAt=${trace.finishedAt ?? '未完成'}`,
    `terminalStatus=${trace.terminalStatus ?? (trace.persisted ? 'persisted' : 'unknown')}`,
    trace.terminalError ? `terminalError=${trace.terminalError}` : null,
    `persisted=${trace.persisted}`,
    `presetRoll=${trace.presetRoll}`,
    'rawPreflight=',
    trace.rawPreflight === undefined
      ? '- none'
      : JSON.stringify(trace.rawPreflight, null, 2),
    'rawPreflightAttempts=',
    trace.rawPreflightAttempts === undefined
      ? '- none'
      : JSON.stringify(trace.rawPreflightAttempts, null, 2),
    'rawJudgementPatches=',
    JSON.stringify(trace.rawJudgementPatches, null, 2),
    'stages=',
    stageLines.join('\n\n') || '- none'
  ].filter((line): line is string => line !== null).join('\n');
}

function formatStoryEntry(entry: StoryEntry, index: number): string {
  const speaker = entry.speaker === 'player' ? '玩家' : '叙事';
  const suggestions = entry.suggestedActions?.length
    ? `\n建议行动：${entry.suggestedActions.map((action) => `「${action}」`).join(' / ')}`
    : '';
  return `### ${index + 1}. ${speaker} | ${entry.turnId} | ${formatGameTime(entry.gameTime)}\n${entry.text}${suggestions}`;
}

function formatLatestExperienceAward(state: RuntimeState): string {
  const entry = [...state.storyLog]
    .reverse()
    .find((candidate) => candidate.speaker === 'narrator' && candidate.experienceAward);
  const award = entry?.experienceAward;
  if (!entry || !award) return '- 无';
  return [
    `turnId=${entry.turnId}`,
    `gameTime=${formatGameTime(entry.gameTime)}`,
    `awardId=${award.awardId}`,
    `total=${award.total}`,
    `sources=${award.sources
      .map(
        (source) =>
          `${source.sourceId ?? source.kind}(${source.amount}) ${source.reason}`
      )
      .join(' / ')}`,
    `modelSuggestedGain=${award.modelSuggestedGain ?? 0}`,
    `capped=${award.capped}`,
    `levelsGained=${award.levelsGained}`,
    `attributePointsGained=${award.attributePointsGained}`
  ].join('\n');
}

function formatPoliceCareerProgramDiagnostics(state: RuntimeState): string {
  const binding = state.world.officialDlcBindings?.find(
    (candidate) => candidate.dlcId === POLICE_PROMOTION_DLC_ID
  );
  if (!binding) return '- 当前存档未绑定警队晋升与调动 DLC。';

  const promotion = state.policePanel.careerPath.promotionProgress;
  const posting = state.policePanel.careerPath.postingProgress;
  const recentIssues = [...state.storyLog]
    .reverse()
    .flatMap((entry) =>
      (entry.writebackDiagnostics ?? [])
        .filter((issue) => issue.code?.startsWith('police_'))
        .map((issue) => ({ turnId: entry.turnId, issue }))
    )
    .slice(0, 20);
  const lines = [
    `bindingStatus=${binding.status}`,
    `bindingVersion=${binding.version}`,
    promotion
      ? [
          `promotion route=${promotion.routeId}`,
          `stage=${promotion.processStage}`,
          `rank=${promotion.currentRankCode}`,
          `target=${promotion.targetRankCode}`,
          `vacancy=${promotion.vacancyStatus}`,
          `reviewNotBefore=${promotion.reviewNotBefore ? formatGameTime(promotion.reviewNotBefore) : 'none'}`,
          `lawfulNext=${promotion.lawfulNextStages.join(',') || 'none'}`,
          `blocking=${promotion.blockingReasons.join(',') || 'none'}`,
          `evidence=${promotion.evidence
            .slice(-20)
            .map((item) => `${item.kind}:${item.canonicalRefId ?? item.refId}`)
            .join(',') || 'none'}`,
          `processedEventIds=${promotion.processedEventIds?.slice(-20).join(',') || 'none'}`,
          `lastProgressTurnId=${promotion.lastProgressTurnId ?? 'none'}`
        ].join(' ')
      : 'promotion=not_initialized',
    posting
      ? [
          `posting route=${posting.routeId}`,
          `stage=${posting.processStage}`,
          `source=${posting.sourceDepartment}`,
          `target=${posting.targetDepartment}`,
          `vacancy=${posting.vacancyStatus}`,
          `reviewNotBefore=${posting.reviewNotBefore ? formatGameTime(posting.reviewNotBefore) : 'none'}`,
          `blocking=${posting.blockingReasons.join(',') || 'none'}`,
          `evidence=${posting.evidence
            .slice(-20)
            .map((item) => `${item.kind}:${item.canonicalRefId ?? item.refId}`)
            .join(',') || 'none'}`,
          `processedEventIds=${posting.processedEventIds?.slice(-20).join(',') || 'none'}`,
          `lastProgressTurnId=${posting.lastProgressTurnId ?? 'none'}`
        ].join(' ')
      : 'posting=not_started',
    'recentDiagnostics:',
    recentIssues.length
      ? recentIssues
          .map(
            ({ turnId, issue }) =>
              `turnId=${turnId} code=${issue.code} path=${issue.path.join('.')} message=${issue.message}`
          )
          .join('\n')
      : '- none'
  ];
  return lines.join('\n');
}

function getStoryEntryTurnNumber(entry: StoryEntry): number | null {
  const match = /^(?:player|turn)_(\d+)$/.exec(entry.turnId);
  if (!match) return null;
  return Number(match[1]);
}

function selectRecentStoryEntries(storyLog: StoryEntry[], turnLimit = DIAGNOSTIC_STORY_TURN_LIMIT): StoryEntry[] {
  const recentEntryStartIndex = Math.max(0, storyLog.length - turnLimit);
  const numberedTurns = storyLog
    .map(getStoryEntryTurnNumber)
    .filter((turnNumber): turnNumber is number => turnNumber !== null && Number.isFinite(turnNumber));

  if (numberedTurns.length === 0) {
    return storyLog.slice(-turnLimit).filter((entry) => entry.text.trim().length > 0);
  }

  const recentTurnNumbers = [...new Set(numberedTurns)].sort((left, right) => left - right).slice(-turnLimit);
  const recentTurnSet = new Set(recentTurnNumbers);

  return storyLog.filter((entry, index) => {
    if (!entry.text.trim()) return false;
    const turnNumber = getStoryEntryTurnNumber(entry);
    return turnNumber !== null ? recentTurnSet.has(turnNumber) : index >= recentEntryStartIndex;
  });
}

function summarizeMemories(state: RuntimeState) {
  const memories = Object.values(state.memories);
  const countBy = (key: 'kind' | 'tier') =>
    memories.reduce<Record<string, number>>((counts, memory) => {
      const value = memory[key] ?? 'unlayered';
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});

  return {
    total: memories.length,
    active: memories.filter((memory) => !memory.compressedIntoMemoryId).length,
    compressedSources: memories.filter((memory) => Boolean(memory.compressedIntoMemoryId)).length,
    withEmbeddingVector: memories.filter((memory) => Boolean(memory.embeddingVector?.length)).length,
    byKind: countBy('kind'),
    byTier: countBy('tier')
  };
}

function sanitizeStoryEntry(entry: StoryEntry): StoryEntry {
  const {
    embeddingText: _embeddingText,
    embeddingVector: _embeddingVector,
    embeddingModel: _embeddingModel,
    embeddingUpdatedAt: _embeddingUpdatedAt,
    rawNarratorResponse: _rawNarratorResponse,
    ...diagnosticEntry
  } = entry;
  return diagnosticEntry;
}

function summarizeActors(state: RuntimeState) {
  const actors = Object.values(state.actors);
  const currentScene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  const presentActorIds = new Set(currentScene?.presentActorIds ?? []);
  const visibleActors = actors.filter((actor) => actor.visibility !== 'hidden');

  return {
    total: actors.length,
    visible: visibleActors.length,
    presentActorIds: [...presentActorIds],
    notableActors: [...visibleActors]
      .sort(
        (left, right) =>
          Number(presentActorIds.has(right.actorId)) - Number(presentActorIds.has(left.actorId)) ||
          right.importance - left.importance ||
          right.interactionScore - left.interactionScore ||
          left.actorId.localeCompare(right.actorId)
      )
      .slice(0, 12)
      .map((actor) => ({
        actorId: actor.actorId,
        name: actor.name,
        englishName: actor.englishName,
        currentIdentity: actor.currentIdentity,
        publicIdentity: actor.publicIdentity,
        presence: actor.presence,
        currentPlaceId: actor.currentPlaceId,
        currentSceneId: actor.currentSceneId,
        importance: actor.importance,
        interactionScore: actor.interactionScore,
        statusSummary: actor.statusSummary
      }))
  };
}

function summarizePendingActorWritebacks(state: RuntimeState) {
  return (state.pendingActorWritebackRecoveries ?? []).map((pending) => ({
    recoveryId: pending.recoveryId,
    actorId: pending.actorId,
    sourceTurnId: pending.sourceTurnId,
    attemptCount: pending.attemptCount,
    lastAttemptTurn: pending.lastAttemptTurn ?? null,
    nextRetryTurn: pending.nextRetryTurn ?? null,
    consecutiveFailureCount: pending.consecutiveFailureCount ?? 0,
    lastFailureKind: pending.lastFailureKind ?? null,
    lastRouteMode: pending.lastRouteMode ?? null
  }));
}

function summarizeOrganizations(state: RuntimeState) {
  const organizations = Object.values(state.organizations);
  const visibleOrganizations = organizations.filter((organization) => organization.visibility !== 'hidden');

  return {
    total: organizations.length,
    visible: visibleOrganizations.length,
    notableOrganizations: [...visibleOrganizations]
      .sort(
        (left, right) =>
          right.importance - left.importance || left.organizationId.localeCompare(right.organizationId)
      )
      .slice(0, 12)
      .map((organization) => ({
        organizationId: organization.organizationId,
        name: organization.name,
        type: organization.type,
        visibility: organization.visibility,
        importance: organization.importance
      }))
  };
}

function createCollectionCounts(state: RuntimeState) {
  return {
    actors: Object.keys(state.actors).length,
    organizations: Object.keys(state.organizations).length,
    places: Object.keys(state.places).length,
    scenes: Object.keys(state.scenes).length,
    memories: Object.keys(state.memories).length,
    storyEntries: state.storyLog.length,
    currentMatters: Object.keys(state.dynamicEvents.currentMatters).length,
    signals: Object.keys(state.dynamicEvents.signals).length,
    newsIssues: Object.keys(state.dynamicEvents.newsIssues).length,
    citySituationTracks: Object.keys(state.citySituationTracks).length,
    relationshipThreads: Object.keys(state.relationshipThreads).length,
    judgementChecks: Object.keys(state.judgementChecks).length,
    combatEvents: Object.keys(state.combatEvents).length,
    cases: Object.keys(state.cases).length,
    caseEvidence: Object.keys(state.caseEvidence).length,
    deferredEvents: Object.keys(state.deferredEvents).length,
    narrativeArcs: state.narrativeArcs?.length ?? 0,
    pressures: Object.keys(state.pressures).length,
    assetItems: Object.keys(state.assets.items).length,
    financeLedgerEntries: state.finance.ledger.length,
    grayLedgerEntries: state.grayLedger.length,
    grayNetworkAreas: Object.keys(state.grayNetworks.byAreaId).length
  };
}

function createDiagnosticRuntimeSnapshot(state: RuntimeState, recentStoryEntries: StoryEntry[]) {
  return {
    runtimeVersion: state.runtimeVersion,
    world: state.world,
    time: state.time,
    environment: state.environment,
    location: state.location,
    turnCounter: state.turnCounter,
    player: state.player,
    lawIdentity: state.lawIdentity,
    policePanel: state.policePanel,
    currentPlace: state.places[state.location.currentPlaceId] ?? null,
    currentScene: state.location.currentSceneId ? (state.scenes[state.location.currentSceneId] ?? null) : null,
    actorSummary: summarizeActors(state),
    pendingActorWritebackSummary: summarizePendingActorWritebacks(state),
    organizationSummary: summarizeOrganizations(state),
    collectionCounts: createCollectionCounts(state),
    memorySummary: summarizeMemories(state),
    storyLog: recentStoryEntries.map(sanitizeStoryEntry)
  };
}

const omittedDiagnosticKeys = new Set([
  'embeddingText',
  'embeddingVector',
  'embeddingModel',
  'embeddingUpdatedAt',
  'rawNarratorResponse'
]);

function stringifyDiagnosticSnapshot(snapshot: ReturnType<typeof createDiagnosticRuntimeSnapshot>): string {
  return JSON.stringify(snapshot, (key, value) => (omittedDiagnosticKeys.has(key) ? undefined : value), 2);
}

function formatMemoryProjectionEntry(
  entry: ReturnType<typeof selectContext>['memoryProjection'][number],
  index: number
): string {
  const memory = entry.memory;
  const reasons = entry.reasons.length ? entry.reasons.join(',') : 'none';
  return [
    `### ${index + 1}. ${memory.memoryId}`,
    `时间=${formatGameTime(memory.gameTime)} kind=${memory.kind} 重要度=${memory.importance} 确定性=${memory.certainty} 原因=${reasons} 分数=${entry.score}`,
    memory.text
  ].join('\n');
}

function formatMemoryLayerBucket(
  title: string,
  entries: ReturnType<typeof selectContext>['memoryLayerProjection']['shortTerm']
): string {
  if (entries.length === 0) return `### ${title}\n- none`;

  return [
    `### ${title}`,
    entries.map((entry, index) => formatMemoryProjectionEntry(entry, index).replace(/^### /, '#### ')).join('\n\n')
  ].join('\n');
}

function formatMemoryLayerProjection(context: ReturnType<typeof selectContext>): string {
  const { memoryLayerProjection } = context;
  return [
    `diagnostics: selected=${memoryLayerProjection.diagnostics.selectedMemoryIds.length} omitted=${memoryLayerProjection.diagnostics.omittedMemoryCount}`,
    formatMemoryLayerBucket('短期记忆 short_term_history', memoryLayerProjection.shortTerm),
    formatMemoryLayerBucket('中期记忆 mid_term_history', memoryLayerProjection.midTerm),
    formatMemoryLayerBucket('长期记忆 long_term_history', memoryLayerProjection.longTerm)
  ].join('\n\n');
}

function formatNpcMemoryProjectionDiagnostics(context: ReturnType<typeof selectContext>): string {
  const projection = context.npcMemoryProjection;
  const simulationProjection = selectNpcSimulationMemoryProjection(context);
  const routedActors = projection.diagnostics.routedActors.length
    ? projection.diagnostics.routedActors
        .map(
          (actor) =>
            `- actorId=${actor.actorId} name=${actor.actorName} route=${actor.route} core=${actor.coreActor} candidates=short:${actor.candidateCounts.short_term},mid:${actor.candidateCounts.mid_term},long:${actor.candidateCounts.long_term} selected=short:${actor.selectedCounts.short_term},mid:${actor.selectedCounts.mid_term},long:${actor.selectedCounts.long_term}`
        )
        .join('\n')
    : '- none';
  const selectedEntries = projection.entries.length
    ? projection.entries
        .map((entry, index) => {
          const vector = entry.vectorScore === undefined ? 'none' : entry.vectorScore.toFixed(3);
          return [
            `### ${index + 1}. ${entry.memoryId}`,
            `actorId=${entry.actorId} actor=${entry.actorName} route=${entry.route} core=${entry.coreActor} tier=${entry.tier}`,
            `time=${formatGameTime(entry.gameTime)} score=${entry.score} vectorScore=${vector} reasons=${entry.reasons.join(',') || 'none'}`,
            entry.text
          ].join('\n');
        })
        .join('\n\n')
    : '- none';

  return [
    `main selected=${projection.entries.length}/${projection.diagnostics.candidateMemoryCount} omitted=${projection.diagnostics.omittedMemoryCount} textChars=${projection.diagnostics.selectedTextChars}/${30000}`,
    `main routeCounts=present:${projection.diagnostics.routeCounts.present},mentioned:${projection.diagnostics.routeCounts.mentioned},remote:${projection.diagnostics.routeCounts.remote} tierCounts=short:${projection.diagnostics.tierCounts.short_term},mid:${projection.diagnostics.tierCounts.mid_term},long:${projection.diagnostics.tierCounts.long_term}`,
    `main memoryIds=${projection.diagnostics.selectedMemoryIds.join(',') || 'none'}`,
    `simulation selected=${simulationProjection.entries.length}/40 omittedFromMain=${simulationProjection.diagnostics.omittedMemoryCount}`,
    `simulation memoryIds=${simulationProjection.diagnostics.selectedMemoryIds.join(',') || 'none'}`,
    '',
    '### Routed actors',
    routedActors,
    '',
    '### Selected NPC memories',
    selectedEntries
  ].join('\n');
}

function formatAssetProjectionItem(item: AssetItem, index: number): string {
  const evidence = item.evidence
    ? ` evidence=${item.evidence.caseId}${item.evidence.disputed ? ' disputed=true' : ''}`
    : '';
  return [
    `### ${index + 1}. ${item.itemId}`,
    `category=${item.category} importance=${item.importance}${evidence}`,
    `${item.name}: ${item.summary}`
  ].join('\n');
}

function formatAssetProjection(context: ReturnType<typeof selectContext>): string {
  const { assetProjection } = context;
  if (assetProjection.items.length === 0) {
    return `diagnostics: selected=0 omitted=${assetProjection.diagnostics.omittedItemCount}\n- none`;
  }

  return [
    `diagnostics: selected=${assetProjection.diagnostics.selectedItemIds.length} omitted=${assetProjection.diagnostics.omittedItemCount}`,
    assetProjection.items.map(formatAssetProjectionItem).join('\n\n')
  ].join('\n\n');
}

const assetCategories: AssetCategory[] = ['equipment', 'general', 'document', 'valuable', 'fixedAsset', 'vehicle'];

function formatAssetSnapshot(state: RuntimeState): string {
  const items = Object.values(state.assets?.items ?? {});
  const categoryCounts = assetCategories.map((category) => {
    const count = items.filter((item) => item.category === category).length;
    return `${category}=${count}`;
  });
  const equipped = state.assets?.equippedItemIds?.length ? state.assets.equippedItemIds.join(',') : 'none';
  const important = [...items]
    .filter((item) => item.importance >= 70 || item.evidence)
    .sort((left, right) => right.importance - left.importance || right.itemId.localeCompare(left.itemId))
    .slice(0, 12)
    .map((item) => `- ${item.itemId} | ${item.category} | ${item.name} | importance=${item.importance}`)
    .join('\n');

  return [
    `total=${items.length} ${categoryCounts.join(' ')} equipped=${equipped}`,
    important || '- no high-importance/evidence assets'
  ].join('\n');
}

function formatFinanceProjection(context: ReturnType<typeof selectContext>): string {
  const { financeProjection } = context;
  return [
    `currency=${financeProjection.currency.code}/${financeProjection.currency.name}`,
    `cashOnHand=${financeProjection.cashOnHand}`,
    `bankBalance=${financeProjection.bankBalance}`,
    `monthlyIncome=${financeProjection.monthlyIncome}`,
    `monthlyExpense=${financeProjection.monthlyExpense}`,
    `netMonthly=${financeProjection.netMonthly}`,
    `activeCashflows source=${financeProjection.diagnostics.activeCashflowCount} projected=${financeProjection.diagnostics.projectedCashflowCount}`,
    `ledger source=${financeProjection.diagnostics.ledgerCount} projected=${financeProjection.diagnostics.projectedLedgerCount}`,
    `reports source=${financeProjection.diagnostics.reportCount} projected=${financeProjection.diagnostics.projectedReportCount}`
  ].join('\n');
}

function formatReputationProjection(context: ReturnType<typeof selectContext>, state: RuntimeState): string {
  const { reputationProjection } = context;
  const overallReputationBaseline =
    state.player.reputation.overallReputationBaseline ?? state.player.reputation.overallReputation;
  const circles = reputationProjection.circles.map(
    (entry) =>
      `- circle=${entry.circle} visibility=${entry.entry.visibility}/1000 standing=${entry.entry.standing} score=${entry.score} reasons=${entry.reasons.join(',') || 'none'} summary=${entry.entry.summary}`
  );
  const logs = reputationProjection.recentLogs.map(
    (log) => `- ${log.logId} kind=${log.kind}${log.circle ? ` circle=${log.circle}` : ''} reason=${log.reason} summary=${log.summary}`
  );

  return [
    `overall notoriety=${reputationProjection.overall.notoriety}/1000 overallReputation=${reputationProjection.overall.overallReputation} summary=${reputationProjection.overall.summary}`,
    `overallCalculation=local_circle_weighted baseline=${overallReputationBaseline}`,
    `selectedCircles=${reputationProjection.diagnostics.selectedCircles.join(',') || 'none'} omittedCircles=${reputationProjection.diagnostics.omittedCircleCount}`,
    `selectedLogs=${reputationProjection.diagnostics.selectedLogIds.join(',') || 'none'} omittedLogs=${reputationProjection.diagnostics.omittedLogCount}`,
    'circles:',
    circles.join('\n') || '- none',
    'recentLogs:',
    logs.join('\n') || '- none'
  ].join('\n');
}

function formatGrayNetworkProjectionDiagnostics(context: ReturnType<typeof selectContext>): string {
  const { grayNetworkProjection } = context;
  const { diagnostics } = grayNetworkProjection;

  return [
    `area=${grayNetworkProjection.areaId} name=${grayNetworkProjection.areaName}`,
    `perspective=${grayNetworkProjection.perspective} available=${grayNetworkProjection.available}`,
    `projectedClimate=${diagnostics.projectedClimate}`,
    `projectedOrganizations=${diagnostics.projectedOrganizations}`,
    `projectedPlaces=${diagnostics.projectedPlaces}`,
    `projectedPeople=${diagnostics.projectedPeople}`,
    `projectedClues=${diagnostics.projectedClues}`,
    `projectedRisks=${diagnostics.projectedRisks}`,
    `projectedActions=${diagnostics.projectedActions}`,
    `omittedHidden=${diagnostics.omittedHidden}`,
    `missingActors=${diagnostics.missingActorRefs.join(',') || 'none'}`,
    `missingPlaces=${diagnostics.missingPlaceRefs.join(',') || 'none'}`,
    `missingOrganizations=${diagnostics.missingOrganizationRefs.join(',') || 'none'}`
  ].join('\n');
}

function formatInstitutionProjectionDiagnostics(context: ReturnType<typeof selectContext>): string {
  const { institutionProjection } = context;
  const { diagnostics } = institutionProjection;

  return [
    `sourceOrganizationCount=${diagnostics.sourceOrganizationCount}`,
    `projectedOrganizationCount=${diagnostics.projectedOrganizationCount}`,
    `projectedOrganizationIds=${diagnostics.projectedOrganizationIds.join(',') || 'none'}`,
    `actorRelations=${institutionProjection.actorRelations.length}`,
    `omittedHidden=${diagnostics.omittedHiddenCount}`,
    `omittedIrrelevant=${diagnostics.omittedIrrelevantCount}`,
    `missingRefs=${diagnostics.missingOrganizationRefs.join(',') || 'none'}`
  ].join('\n');
}

function formatRelationshipProjectionDiagnostics(context: ReturnType<typeof selectContext>): string {
  const { relationshipProjection } = context;
  const { diagnostics } = relationshipProjection;

  return [
    `sourceThreadCount=${diagnostics.sourceThreadCount}`,
    `projectedThreadCount=${diagnostics.projectedThreadCount}`,
    `projectedThreadIds=${diagnostics.projectedThreadIds.join(',') || 'none'}`,
    `heartbeatCandidateCount=${diagnostics.heartbeatCandidateCount}`,
    `heartbeatThreadIds=${diagnostics.heartbeatCandidateThreadIds.join(',') || 'none'}`,
    `omittedHidden=${diagnostics.omittedHiddenCount}`,
    `omittedIrrelevant=${diagnostics.omittedIrrelevantCount}`,
    `missingActorRefs=${diagnostics.missingActorRefs.join(',') || 'none'}`
  ].join('\n');
}

function formatNpcDynamicProjectionDiagnostics(context: ReturnType<typeof selectContext>): string {
  const present = context.presentActorReactionProjection;
  const remote = context.remoteNpcPresenceProjection;

  return [
    `presentActorReactions selected=${present.diagnostics.selectedActorIds.join(',') || 'none'} omitted=${present.diagnostics.omittedActorCount} sourceActors=${present.diagnostics.sourceActorCount}`,
    `remoteNpcPresence selected=${remote.diagnostics.selectedActorIds.join(',') || 'none'} omitted=${remote.diagnostics.omittedCandidateCount} missingActorRefs=${remote.diagnostics.missingActorRefs.join(',') || 'none'}`,
    `remoteCandidateIds=${remote.diagnostics.selectedCandidateIds.join(',') || 'none'}`
  ].join('\n');
}

function formatDynamicProjectionDiagnostics(context: ReturnType<typeof selectContext>): string {
  const { dynamicProjection } = context;
  const { diagnostics } = dynamicProjection;

  return [
    `currentMatters source=${diagnostics.sourceCurrentMatterCount} projected=${diagnostics.projectedCurrentMatterCount} omitted=${diagnostics.omittedCurrentMatterCount} due=${diagnostics.dueCurrentMatterIds.length} ids=${diagnostics.currentMatterIds.join(',') || 'none'} dueIds=${diagnostics.dueCurrentMatterIds.join(',') || 'none'}`,
    `recentResolvedMatters source=${diagnostics.sourceRecentResolvedMatterCount} projected=${diagnostics.projectedRecentResolvedMatterCount} omitted=${diagnostics.omittedRecentResolvedMatterCount} ids=${diagnostics.recentResolvedMatterIds.join(',') || 'none'}`,
    `signals source=${diagnostics.sourceSignalCount} projected=${diagnostics.projectedSignalCount} omitted=${diagnostics.omittedSignalCount} ids=${diagnostics.signalIds.join(',') || 'none'}`,
    `newsIssues source=${diagnostics.sourceNewsIssueCount} projected=${diagnostics.projectedNewsIssueCount} omitted=${diagnostics.omittedNewsIssueCount} ids=${diagnostics.newsIssueIds.join(',') || 'none'}`,
    `omittedHidden=${diagnostics.omittedHiddenCount}`,
    `dueDynamicDeferredEvents ids=${diagnostics.dueDeferredEventIds.join(',') || 'none'} omitted=${diagnostics.omittedDueDeferredEventCount}`
  ].join('\n');
}

function formatConflictProjectionDiagnostics(context: ReturnType<typeof selectContext>): string {
  const { conflictProjection } = context;
  const { diagnostics } = conflictProjection;

  return [
    `combatEvents source=${diagnostics.sourceCount} projected=${diagnostics.projectedCount} omitted=${diagnostics.omittedCount} hidden=${diagnostics.hiddenCount}`,
    `projectedCombatIds=${diagnostics.projectedCombatIds.join(',') || 'none'}`,
    `projectedJudgementCheckIds=${diagnostics.projectedJudgementCheckIds.join(',') || 'none'}`
  ].join('\n');
}

function formatDynamicRuntimeSnapshot(state: RuntimeState): string {
  return JSON.stringify(state.dynamicEvents, null, 2);
}

function formatGrayNetworkRuntimeSnapshot(
  state: RuntimeState,
  context: ReturnType<typeof selectContext>
): string {
  const areaId = context.grayNetworkProjection.areaId;
  const profile = state.grayNetworks?.byAreaId[areaId];
  if (!profile) return `area=${areaId}\n- none`;

  return JSON.stringify(
    {
      areaId: profile.areaId,
      areaName: profile.areaName,
      counts: {
        climate: profile.climate.length,
        knownOrganizations: profile.knownOrganizations.length,
        keyPlaces: profile.keyPlaces.length,
        relatedPeople: profile.relatedPeople.length,
        relationClues: profile.relationClues.length,
        actionRisks: profile.actionRisks.length,
        suggestedActions: profile.suggestedActions.length
      },
      climate: profile.climate.slice(0, 8),
      knownOrganizations: profile.knownOrganizations.slice(0, 8),
      keyPlaces: profile.keyPlaces.slice(0, 8),
      relatedPeople: profile.relatedPeople.slice(0, 8),
      relationClues: profile.relationClues.slice(0, 8)
    },
    null,
    2
  );
}

function formatCaseProjectionDiagnostics(state: RuntimeState, context: ReturnType<typeof selectContext>): string {
  const activeCaseCount = Object.values(state.cases).filter(
    (caseFile) => caseFile.visibility !== 'hidden' && caseFile.status !== 'archived'
  ).length;
  const { diagnostics } = context.caseProjection;

  return [
    `activeCases=${activeCaseCount}`,
    `projectedCases=${context.caseProjection.cases.length}`,
    `selectedCaseIds=${diagnostics.selectedCaseIds.join(',') || 'none'}`,
    `selectedEvidenceIds=${diagnostics.selectedEvidenceIds.join(',') || 'none'}`,
    `omittedEvidence=${diagnostics.omittedEvidenceCount}`
  ].join('\n');
}

function formatDeferredEventDiagnostics(context: ReturnType<typeof selectContext>): string {
  const { diagnostics } = context.deferredProjection;

  return [
    `pendingEvents=${diagnostics.pendingEventIds.length}`,
    `dueEvents=${diagnostics.dueEventIds.length}`,
    `projectedDueEventIds=${diagnostics.dueEventIds.join(',') || 'none'}`,
    `omittedDueEvents=${diagnostics.omittedDueEventCount}`
  ].join('\n');
}

function formatWeatherProjectionDiagnostics(
  context: ReturnType<typeof selectContext>,
  state: RuntimeState
): string {
  const weather = context.weatherProjection;
  const recentConditions =
    state.environment.recentConditions?.length
      ? state.environment.recentConditions
      : [weather.condition];
  const wetConditions = new Set([
    'light_rain',
    'heavy_rain',
    'thunderstorm',
    'typhoon_signal'
  ]);
  let consecutiveWetSegments = 0;
  for (const condition of [...recentConditions].reverse()) {
    if (!wetConditions.has(condition)) break;
    consecutiveWetSegments += 1;
  }

  return [
    `condition=${weather.condition}`,
    `label=${weather.label}`,
    `intensity=${weather.intensity}`,
    `source=${weather.source}`,
    `startedAt=${formatGameTime(weather.startedAt)}`,
    `validUntil=${formatGameTime(weather.validUntil)}`,
    `recentConditions=${recentConditions.join(',')}`,
    `consecutiveWetSegments=${consecutiveWetSegments}`,
    `tags=${weather.tags.join(',') || 'none'}`,
    `impact=${weather.impactSummary}`,
    weather.reason ? `reason=${weather.reason}` : 'reason=none'
  ].join('\n');
}

function formatDramaExecutionDiagnostics(state: RuntimeState): string {
  const dramaticContent = state.dramaticContent;
  if (!dramaticContent) return '- 未启用或旧存档尚无戏剧化内容状态。';

  const settings = dramaticContent.settings;
  const executions = (dramaticContent.recentExecutions ?? []).slice(-20);
  const recentDiagnostics = dramaticContent.recentDiagnostics.slice(-20);
  const diagnosticCodes = recentDiagnostics.map((item) => item.code);
  const narrativeArcProgressDiagnostics = recentDiagnostics
    .filter((item) => item.narrativeArcProgressAudit)
    .map((item) => {
      const audit = item.narrativeArcProgressAudit as NonNullable<
        typeof item.narrativeArcProgressAudit
      >;
      const refs = audit.supportingWritebackRefs
        .map((ref) => {
          const stages = [
            `raw=${ref.presentInRawResponse}`,
            `schema=${ref.passedSchemaValidation}`,
            `accepted=${ref.acceptedByDomainGate}`,
            `applied=${ref.appliedToRuntime}`
          ].join('/');
          return `${ref.kind}:${ref.originalRefId}(${stages})`;
        })
        .join(',');
      const refSet = (items: readonly { kind: string; id: string }[]) =>
        items.map((ref) => `${ref.kind}:${ref.id}`).join(',') || 'none';
      const stagedRefs = audit.writebackReferenceAudit;
      return [
        `code=${item.code}`,
        `turn=${audit.turnId ?? 'unknown'}`,
        `requestId=${audit.requestId ?? 'unknown'}`,
        `arc=${audit.arcInstanceId ?? 'unknown'}`,
        `decision=${audit.decision ?? 'unknown'}`,
        `classification=${audit.classification}`,
        `accepted=${audit.accepted}`,
        `reasons=${audit.rejectionReasons.join(',') || 'none'}`,
        `advisory=${audit.advisoryReasons?.join(',') || 'none'}`,
        `beforeStage=${audit.beforeStageId ?? 'none'}`,
        `requestedCurrent=${audit.requestedCurrentStageId ?? 'none'}`,
        `requestedNext=${audit.requestedNextStageId ?? 'none'}`,
        `nodes=${audit.requestedNodeIds.join(',') || 'none'}`,
        `allowedNext=${audit.allowedNextStageIds?.join(',') || 'none'}`,
        `allowedNodes=${audit.allowedNodeIds?.join(',') || 'none'}`,
        `writebackRefs=${refs || 'none'}`,
        `refSets=raw[${refSet(stagedRefs.rawResponseRefs)}] schema[${refSet(stagedRefs.schemaValidatedRefs)}] accepted[${refSet(stagedRefs.acceptedWritebackRefs)}] applied[${refSet(stagedRefs.appliedWritebackRefs)}]`
      ].join(' ');
    });
  const executionLines = executions.map((receipt) =>
    [
      `turn=${receipt.turnCounter}`,
      `pacing=${receipt.pacing}`,
      `route=${receipt.planningRoute}`,
      `resolvedRoute=${receipt.resolvedPlanningRoute ?? 'auto'}`,
      `material=${receipt.materialLevel}`,
      `storypack=${receipt.storypackInfluence}`,
      `screenCharacters=${receipt.screenCharacterSeedsEnabled}`,
      `called=${receipt.planningCalled}`,
      `success=${receipt.planningSucceeded}`,
      `durationMs=${receipt.planningDurationMs}`,
      `candidates=${receipt.inputCandidateCount}`,
      `officialDlcSources=${receipt.officialDlcSourceCount ?? 0}`,
      `officialDlcSelected=${receipt.officialDlcSelected ?? false}`,
      `officialDlcExecuted=${receipt.officialDlcExecuted ?? false}`,
      `inputChars=${receipt.inputCharacterCount}`,
      `estimatedTokens=${receipt.estimatedInputTokens}`,
      `mode=${receipt.planMode ?? 'none'}`,
      `primary=${receipt.primarySourceRef ? `${receipt.primarySourceRef.providerId}:${receipt.primarySourceRef.sourceType}:${receipt.primarySourceRef.sourceId}` : 'none'}`,
      `support=${receipt.supportSourceRefs.length}`,
      `used=${receipt.usedSourceRefs.length}`,
      `trace=${receipt.traceStatus ?? 'none'}`,
      `persistentWrites=${receipt.persistentWriteCount}`,
      `arcProgress=${(receipt.narrativeArcProgressAudits ?? [])
        .map((audit) => `${audit.classification}:${audit.rejectionReasons.join(',') || 'none'}`)
        .join('|') || 'none'}`,
      `degrade=${receipt.degradeReason ?? 'none'}`,
      `filters=${receipt.filterRuleIds.join(',') || 'none'}`
    ].join(' ')
  );

  return [
    `openingId=${dramaticContent.openingId ?? 'none'}`,
    `pacing=${settings?.pacing ?? 'original'}`,
    `planningRoute=${settings?.planningRoute ?? 'auto'}`,
    `materialLevel=${settings?.materialLevel ?? 'standard'}`,
    `screenCharacterSeedsEnabled=${state.world.screenCharacterSeedsEnabled !== false}`,
    `storypackInfluence=${state.world.storypackInfluence ?? 'off'}`,
    `instanceCount=${dramaticContent.instances.length}`,
    `diagnosticCodes=${diagnosticCodes.join(',') || 'none'}`,
    'narrativeArcProgressDiagnostics:',
    narrativeArcProgressDiagnostics.join('\n') || '- none',
    'recentExecutions:',
    executionLines.join('\n') || '- none'
  ].join('\n');
}

function formatNarrativeArcDiagnostics(state: RuntimeState): string {
  const arcs = Array.isArray(state.narrativeArcs) ? state.narrativeArcs : [];
  if (arcs.length === 0) return '- 当前没有已持久化的剧情弧实例。';
  return arcs
    .slice(-30)
    .map((arc) => [
      `arcInstanceId=${arc.arcInstanceId}`,
      `arcType=${arc.arcType}`,
      `status=${arc.status}`,
      `source=${arc.sourceRef.providerId}:${arc.sourceRef.sourceType}:${arc.sourceRef.sourceId}`,
      `currentStageId=${arc.currentStageId ?? 'none'}`,
      `previousStageId=${arc.previousStageId ?? 'none'}`,
      `createdTurn=${arc.createdTurn}`,
      `lastProgressTurn=${arc.lastProgressTurn}`,
      `usedNodeIds=${arc.usedNodeIds.join(',') || 'none'}`,
      `writebackRefs=${arc.writebackRefs.map((ref) => `${ref.kind}:${ref.id}`).join(',') || 'none'}`,
      `summary=${arc.lastSummary ?? 'none'}`
    ].join(' '))
    .join('\n');
}

function formatOfficialDlcDramaAudit(
  records: readonly OfficialDlcDramaAuditRecord[] | undefined
): string {
  if (!records?.length) return '- 当前回合没有官方 DLC 来源审计记录。';
  return records
    .map((record) => [
      `requestId=${record.requestId}`,
      `turn=${record.turn}`,
      `dlcId=${record.dlcId}`,
      `status=${record.status}`,
      `sourceType=${record.sourceType}`,
      `sourceId=${record.sourceId}`,
      `generated=${record.sourceGenerated}`,
      `projected=${record.sourceProjected}`,
      `planningContext=${record.sourceInPlanningContext}`,
      `selected=${record.selected}`,
      `executionPayload=${record.executionPayloadCreated}`,
      `tracePresent=${record.executionTracePresent}`,
      `executed=${record.executed}`,
      `omittedReason=${record.omittedReason ?? 'none'}`,
      `createdAt=${record.createdAt}`
    ].join('\n'))
    .join('\n\n');
}

function formatCaseRuntimeSnapshot(state: RuntimeState): string {
  return JSON.stringify(
    {
      cases: state.cases,
      caseEvidence: state.caseEvidence,
      deferredEvents: state.deferredEvents
    },
    null,
    2
  );
}

export function createNarrativeDiagnostic({
  state,
  saveId,
  streamingText,
  lastError,
  lastRawNarratorResponse,
  lastNarratorAttempts = [],
  lastTurnNarratorAttemptStarts = [],
  lastTurnNarratorAttempts = [],
  lastTurnExecution,
  lastPlayerInput,
  lastJudgementRecoveryTrace,
  lastOfficialDlcDramaAudit
}: CreateNarrativeDiagnosticInput): string {
  const place = state.places[state.location.currentPlaceId];
  const scene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  const playerActor = state.actors[state.player.actorId];
  const recentStoryEntries = selectRecentStoryEntries(state.storyLog);
  const diagnosticRuntimeSnapshot = createDiagnosticRuntimeSnapshot(state, recentStoryEntries);
  const storyText = recentStoryEntries.length
    ? recentStoryEntries.map(formatStoryEntry).join('\n\n')
    : '- 当前还没有正式写入的剧情正文。';
  const context = selectContext(state, lastPlayerInput ?? '');
  const memoryProjectionText = formatMemoryLayerProjection(context);
  const npcMemoryProjectionText = formatNpcMemoryProjectionDiagnostics(context);
  const assetProjectionText = formatAssetProjection(context);
  const assetSnapshotText = formatAssetSnapshot(state);
  const financeProjectionText = formatFinanceProjection(context);
  const reputationProjectionText = formatReputationProjection(context, state);
  const institutionProjectionText = formatInstitutionProjectionDiagnostics(context);
  const relationshipProjectionText = formatRelationshipProjectionDiagnostics(context);
  const npcDynamicProjectionText = formatNpcDynamicProjectionDiagnostics(context);
  const dynamicProjectionText = formatDynamicProjectionDiagnostics(context);
  const conflictProjectionText = formatConflictProjectionDiagnostics(context);
  const weatherProjectionText = formatWeatherProjectionDiagnostics(context, state);
  const dynamicRuntimeSnapshotText = formatDynamicRuntimeSnapshot(state);
  const grayNetworkProjectionText = formatGrayNetworkProjectionDiagnostics(context);
  const grayNetworkSnapshotText = formatGrayNetworkRuntimeSnapshot(state, context);
  const caseProjectionText = formatCaseProjectionDiagnostics(state, context);
  const deferredProjectionText = formatDeferredEventDiagnostics(context);
  const caseRuntimeSnapshotText = formatCaseRuntimeSnapshot(state);
  const dramaExecutionDiagnosticText = formatDramaExecutionDiagnostics(state);
  const officialDlcDramaAuditText = formatOfficialDlcDramaAudit(lastOfficialDlcDramaAudit);
  const latestExperienceAwardText = formatLatestExperienceAward(state);
  const currentPlayerVitalsText = [
    `health=${state.player.vitals.health}/${state.player.vitals.maxHealth}`,
    `stamina=${state.player.vitals.stamina}/${state.player.vitals.maxStamina}`,
    `conditionSummary=${state.player.vitals.conditionSummary}`,
    `conditionPersistence=${state.player.vitals.conditionLifecycle?.persistence ?? 'unreviewed_legacy'}`,
    `establishedAt=${state.player.vitals.conditionLifecycle
      ? formatGameTime(state.player.vitals.conditionLifecycle.establishedAt)
      : '未记录'}`,
    `lastReviewedAt=${state.player.vitals.conditionLifecycle
      ? formatGameTime(state.player.vitals.conditionLifecycle.lastReviewedAt)
      : '未记录'}`
  ].join('\n');
  const latestWritebackIssue = [...state.storyLog]
    .reverse()
    .flatMap((entry) => [...(entry.writebackDiagnostics ?? [])].reverse())
    .find((issue) =>
      [
        'actor_writeback_repair_network_failed',
        'actor_writeback_repair_main_fallback_failed',
        'actor_writeback_recovery_queued'
      ].includes(issue.code ?? '')
    );
  const latestPartialWritebackRecord = [...state.storyLog]
    .reverse()
    .map((entry) => ({
      entry,
      issues: collectUnresolvedPartialWritebackDiagnostics(entry.writebackDiagnostics)
    }))
    .find(({ issues }) => issues.length > 0);
  const latestWeatherWritebackIssue = [...state.storyLog]
    .reverse()
    .flatMap((entry) => [...(entry.writebackDiagnostics ?? [])].reverse())
    .find((issue) => issue.code === 'weather_same_condition_not_extended');
  const latestPlayerVitalsDiagnosticEntry = [...state.storyLog]
    .reverse()
    .find((entry) =>
      entry.writebackDiagnostics?.some((issue) => issue.code?.startsWith('player_vitals_'))
    );
  const latestPlayerVitalsDiagnostics = (latestPlayerVitalsDiagnosticEntry?.writebackDiagnostics ?? [])
    .filter((issue) => issue.code?.startsWith('player_vitals_'))
    .slice(-10);
  const recentLocalJudgementDiagnostics = [...state.storyLog]
    .reverse()
    .flatMap((entry) => [...(entry.writebackDiagnostics ?? [])].reverse())
    .filter((issue) => issue.code?.startsWith('local_judgement_'))
    .slice(0, 10);
  const latestRelationshipRecoveryEntry = [...state.storyLog]
    .reverse()
    .find((entry) =>
      entry.speaker === 'narrator' &&
      entry.writebackDiagnostics?.some((issue) => issue.code?.startsWith('relationship_'))
    );
  const relationshipRecoveryDiagnostics = (latestRelationshipRecoveryEntry?.writebackDiagnostics ?? [])
    .filter((issue) => issue.code?.startsWith('relationship_'))
    .slice(-20);
  const latestInteractionScoreDiagnosticEntry = [...state.storyLog]
    .reverse()
    .find((entry) =>
      entry.speaker === 'narrator' &&
      entry.writebackDiagnostics?.some((issue) => issue.code === 'actor_interaction_score_decrease_preserved')
    );
  const interactionScoreDiagnostics = (latestInteractionScoreDiagnosticEntry?.writebackDiagnostics ?? [])
    .filter((issue) => issue.code === 'actor_interaction_score_decrease_preserved')
    .slice(-10);
  const recentErrorText = lastError?.trim()
    ? lastError.trim()
    : latestWritebackIssue
      ? `${latestWritebackIssue.code ?? 'writeback_issue'}: ${latestWritebackIssue.message}`
      : '- 无';
  const recentWritebackWarningText = latestPartialWritebackRecord
    ? [
        `sourceTurnId=${latestPartialWritebackRecord.entry.turnId}`,
        `sourceGameTime=${formatGameTime(latestPartialWritebackRecord.entry.gameTime)}`,
        ...(lastTurnExecution?.turnId && lastTurnExecution.turnId !== latestPartialWritebackRecord.entry.turnId
          ? ['scope=以下警告来自之前已写入的回合，不属于当前正在执行的请求。']
          : []),
        `unresolvedCount=${latestPartialWritebackRecord.issues.length}`,
        ...latestPartialWritebackRecord.issues.map((issue) => [
          `code=${issue.code ?? 'writeback_issue'}`,
          `path=${issue.path?.join('.') || '(root)'}`,
          `message=${issue.message}`
        ].join('\n'))
      ].join('\n')
    : '- 无';
  const recentWeatherWritebackText = latestWeatherWritebackIssue
    ? [
        `code=${latestWeatherWritebackIssue.code}`,
        `path=${latestWeatherWritebackIssue.path.join('.')}`,
        `message=${latestWeatherWritebackIssue.message}`
      ].join('\n')
    : '- 无';
  const latestPlayerVitalsDiagnosticText = latestPlayerVitalsDiagnosticEntry
    ? [
        `turnId=${latestPlayerVitalsDiagnosticEntry.turnId}`,
        `gameTime=${formatGameTime(latestPlayerVitalsDiagnosticEntry.gameTime)}`,
        ...latestPlayerVitalsDiagnostics.map((issue) =>
          [
            `code=${issue.code ?? 'player_vitals_diagnostic'}`,
            `path=${issue.path?.join('.') || '(root)'}`,
            `message=${issue.message}`
          ].join('\n')
        )
      ].join('\n\n')
    : '- 无';
  const recentLocalJudgementDiagnosticText = recentLocalJudgementDiagnostics.length
    ? recentLocalJudgementDiagnostics
        .map((issue) =>
          [
            `code=${issue.code ?? 'local_judgement_diagnostic'}`,
            `path=${issue.path?.join('.') || '(root)'}`,
            `message=${issue.message}`
          ].join('\n')
        )
        .join('\n\n')
    : '- 无';
  const relationshipRecoveryDiagnosticText = latestRelationshipRecoveryEntry
    ? [
        `turnId=${latestRelationshipRecoveryEntry.turnId}`,
        `gameTime=${formatGameTime(latestRelationshipRecoveryEntry.gameTime)}`,
        ...relationshipRecoveryDiagnostics.map((issue) =>
          [
            `code=${issue.code ?? 'relationship_recovery_diagnostic'}`,
            `path=${issue.path?.join('.') || '(root)'}`,
            `message=${issue.message}`
          ].join('\n')
        )
      ].join('\n\n')
    : '- 无';
  const interactionScoreDiagnosticText = latestInteractionScoreDiagnosticEntry
    ? [
        `turnId=${latestInteractionScoreDiagnosticEntry.turnId}`,
        `gameTime=${formatGameTime(latestInteractionScoreDiagnosticEntry.gameTime)}`,
        ...interactionScoreDiagnostics.map((issue) =>
          [
            `code=${issue.code}`,
            `path=${issue.path?.join('.') || '(root)'}`,
            `message=${issue.message}`
          ].join('\n')
        )
      ].join('\n\n')
    : '- 无';
  const currentJudgementRecoveryText = formatJudgementRecoveryTrace(
    lastJudgementRecoveryTrace
  );
  const openingAttemptsText = lastNarratorAttempts.length
    ? lastNarratorAttempts
        .map((attempt, index) => formatNarratorAttempt(attempt, index, '开局'))
        .join('\n\n')
    : '- 无';
  const turnNarratorAttemptsText = formatTurnNarratorAttempts(
    lastTurnNarratorAttemptStarts,
    lastTurnNarratorAttempts
  );

  return [
    '# Sorry, I’m a Cop V2 诊断导出',
    `导出时间：${new Date().toISOString()}`,
    `存档：${saveId ?? '未保存/临时开局'}`,
    `当前时间：${formatGameTime(state.time)}`,
    `当前位置：${place?.name ?? '未知地点'}${scene ? ` / ${scene.name}` : ''}`,
    `玩家：${state.player.name}${state.player.englishName ? ` / ${state.player.englishName}` : ''}`,
    `身份：${playerActor?.publicIdentity ?? state.player.currentIdentity}`,
    '',
    '## 最近错误',
    recentErrorText,
    '',
    '## 最近部分写回警告',
    recentWritebackWarningText,
    '',
    '## 当前玩家身体状态',
    currentPlayerVitalsText,
    '',
    '## 最近玩家状态复核诊断',
    latestPlayerVitalsDiagnosticText,
    '',
    '## 本次主回合执行状态',
    formatTurnExecutionDiagnostic(lastTurnExecution),
    '',
    '## 本次主回合 API 请求',
    turnNarratorAttemptsText,
    '',
    '## 本次判定请求恢复诊断',
    currentJudgementRecoveryText,
    '',
    '## 已写入回合的本地判定校正诊断',
    lastError?.trim()
      ? '注意：以下内容来自之前已经成功写入存档的回合，不代表上方当前失败请求。'
      : '以下内容只来自已经成功写入存档的回合。',
    recentLocalJudgementDiagnosticText,
    '',
    '## 最近已写入回合的关系证据恢复诊断',
    relationshipRecoveryDiagnosticText,
    '',
    '## 最近往来度写回诊断',
    interactionScoreDiagnosticText,
    '',
    '## 警队晋升与调动程序诊断',
    formatPoliceCareerProgramDiagnostics(state),
    '',
    '## 最近经验结算',
    latestExperienceAwardText,
    '',
    '## 最近天气写回诊断',
    recentWeatherWritebackText,
    '',
    '## 流式正文',
    streamingText?.trim() ? streamingText.trim() : '- 无',
    '',
    '## 最近开局 API 请求',
    openingAttemptsText,
    '',
    '## 最近原始返回',
    lastRawNarratorResponse?.trim() ? lastRawNarratorResponse.trim() : '- 无',
    '',
    `## 剧情正文（最近 ${DIAGNOSTIC_STORY_TURN_LIMIT} 回合）`,
    storyText,
    '',
    '## 记忆投喂投影',
    memoryProjectionText,
    '',
    '## NPC Memory Projection / NPC 记忆投喂诊断',
    npcMemoryProjectionText,
    '',
    '## Asset Projection',
    assetProjectionText,
    '',
    '## Asset Inventory Snapshot',
    assetSnapshotText,
    '',
    '## Finance Projection / 金钱投影',
    financeProjectionText,
    '',
    '## Finance Snapshot / 金钱状态',
    JSON.stringify(state.finance, null, 2),
    '',
    '## Reputation Projection',
    reputationProjectionText,
    '',
    '## Reputation Snapshot',
    JSON.stringify(state.player.reputation, null, 2),
    '',
    '## Institution Projection Diagnostics / 社会机构投影诊断',
    institutionProjectionText,
    '',
    '## Relationship Projection Diagnostics / 人脉缘份投影诊断',
    relationshipProjectionText,
    '',
    '## NPC Dynamic Simulation Diagnostics / NPC 动态模拟投影诊断',
    npcDynamicProjectionText,
    '',
    '## Dynamic Projection Diagnostics / 动态事项与新闻投影诊断',
    dynamicProjectionText,
    '',
    '## Conflict Projection Diagnostics / 对抗与判定投影诊断',
    conflictProjectionText,
    '',
    '## Weather Projection',
    weatherProjectionText,
    '',
    '## Dramatic Content Execution Diagnostics / 戏剧化内容执行诊断',
    dramaExecutionDiagnosticText,
    '',
    '## Official DLC Drama Source Audit / 官方 DLC 剧情来源审计',
    officialDlcDramaAuditText,
    '',
    '## Narrative Arc Progress / 通用剧情弧推进',
    formatNarrativeArcDiagnostics(state),
    '',
    '## Dynamic Runtime Snapshot / 动态事项与新闻状态',
    dynamicRuntimeSnapshotText,
    '',
    '## Gray Network Projection Diagnostics / 社团投影诊断',
    grayNetworkProjectionText,
    '',
    '## Gray Network Runtime Snapshot / 社团运行态快照',
    grayNetworkSnapshotText,
    '',
    '## Case Projection Diagnostics',
    caseProjectionText,
    '',
    '## Deferred Event Diagnostics',
    deferredProjectionText,
    '',
    '## Case Runtime Snapshot',
    caseRuntimeSnapshotText,
    '',
    '## Runtime State Snapshot',
    stringifyDiagnosticSnapshot(diagnosticRuntimeSnapshot)
  ].join('\n');
}
