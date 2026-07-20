import type { AssetCategory, AssetItem, RuntimeState, StoryEntry } from '../../domain/runtime/types';
import { selectContext } from '../../domain/context/selectContext';
import { selectNpcSimulationMemoryProjection } from '../../domain/npc/npcSimulation';
import { formatGameTimeWithWeekday } from '../../domain/time/gameTime';

const DIAGNOSTIC_STORY_TURN_LIMIT = 10;

interface CreateNarrativeDiagnosticInput {
  state: RuntimeState;
  saveId?: string;
  streamingText?: string;
  lastError?: string | null;
  lastRawNarratorResponse?: string | null;
  lastPlayerInput?: string;
}

function formatGameTime(time: RuntimeState['time']): string {
  return formatGameTimeWithWeekday(time);
}

function formatStoryEntry(entry: StoryEntry, index: number): string {
  const speaker = entry.speaker === 'player' ? '玩家' : '叙事';
  const suggestions = entry.suggestedActions?.length
    ? `\n建议行动：${entry.suggestedActions.map((action) => `「${action}」`).join(' / ')}`
    : '';
  return `### ${index + 1}. ${speaker} | ${entry.turnId} | ${formatGameTime(entry.gameTime)}\n${entry.text}${suggestions}`;
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

function formatReputationProjection(context: ReturnType<typeof selectContext>): string {
  const { reputationProjection } = context;
  const circles = reputationProjection.circles.map(
    (entry) =>
      `- circle=${entry.circle} visibility=${entry.entry.visibility}/1000 standing=${entry.entry.standing} score=${entry.score} reasons=${entry.reasons.join(',') || 'none'} summary=${entry.entry.summary}`
  );
  const logs = reputationProjection.recentLogs.map(
    (log) => `- ${log.logId} kind=${log.kind}${log.circle ? ` circle=${log.circle}` : ''} reason=${log.reason} summary=${log.summary}`
  );

  return [
    `overall notoriety=${reputationProjection.overall.notoriety}/1000 overallReputation=${reputationProjection.overall.overallReputation} summary=${reputationProjection.overall.summary}`,
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

function formatWeatherProjectionDiagnostics(context: ReturnType<typeof selectContext>): string {
  const weather = context.weatherProjection;

  return [
    `condition=${weather.condition}`,
    `label=${weather.label}`,
    `intensity=${weather.intensity}`,
    `source=${weather.source}`,
    `validUntil=${formatGameTime(weather.validUntil)}`,
    `tags=${weather.tags.join(',') || 'none'}`,
    `impact=${weather.impactSummary}`,
    weather.reason ? `reason=${weather.reason}` : 'reason=none'
  ].join('\n');
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
  lastPlayerInput
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
  const reputationProjectionText = formatReputationProjection(context);
  const institutionProjectionText = formatInstitutionProjectionDiagnostics(context);
  const relationshipProjectionText = formatRelationshipProjectionDiagnostics(context);
  const npcDynamicProjectionText = formatNpcDynamicProjectionDiagnostics(context);
  const dynamicProjectionText = formatDynamicProjectionDiagnostics(context);
  const conflictProjectionText = formatConflictProjectionDiagnostics(context);
  const weatherProjectionText = formatWeatherProjectionDiagnostics(context);
  const dynamicRuntimeSnapshotText = formatDynamicRuntimeSnapshot(state);
  const grayNetworkProjectionText = formatGrayNetworkProjectionDiagnostics(context);
  const grayNetworkSnapshotText = formatGrayNetworkRuntimeSnapshot(state, context);
  const caseProjectionText = formatCaseProjectionDiagnostics(state, context);
  const deferredProjectionText = formatDeferredEventDiagnostics(context);
  const caseRuntimeSnapshotText = formatCaseRuntimeSnapshot(state);

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
    lastError?.trim() ? lastError.trim() : '- 无',
    '',
    '## 流式正文',
    streamingText?.trim() ? streamingText.trim() : '- 无',
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
