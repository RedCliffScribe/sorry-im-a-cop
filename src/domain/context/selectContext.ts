import { getCurrentPlace, getCurrentScene, getPresentActors } from '../runtime/selectors';
import { projectFemaleProfileForPrompt } from '../runtime/femaleProfile';
import { projectMapContext, type MapContextProjection } from '../map/mapContextProjector';
import { projectFinanceContext, type FinanceProjection } from '../finance/financeContextProjector';
import { formatCurrencyAmount } from '../worldpack/economyConfig';
import { isGameTimeDue, selectDueDeferredEvents } from '../deferred/deferredEventProjector';
import { projectPolicePanelContext, type PolicePanelProjection } from '../police/policePanelContextProjector';
import { formatNotorietyLevel, formatReputationTone } from '../reputation/reputation';
import { projectReputationContext, type ReputationProjection } from '../reputation/reputationContextProjector';
import { projectGrayNetworkContext, type GrayNetworkProjection } from '../grayNetwork/grayNetworkContextProjector';
import { projectInstitutionContext, type InstitutionContextProjection } from '../institution/institutionContextProjector';
import { projectRelationshipContext, type RelationshipContextProjection } from '../relationship/relationshipContextProjector';
import { projectDynamicContext, type DynamicContextProjection } from '../dynamic/dynamicContextProjector';
import { projectConflictContext, type ConflictContextProjection } from '../conflict/conflictContextProjector';
import { projectWeatherContext, type WeatherProjection } from '../weather/weather';
import { projectStorypackContext } from '../storypack/storypackProjector';
import type { StorypackProjection } from '../storypack/storypackTypes';
import { projectEraSeedFigureContext } from '../eraSeed/eraSeedFigureProjector';
import type { EraSeedFigureProjection } from '../eraSeed/eraSeedFigureTypes';
import { projectPoliceDutyContext, type PoliceDutyContextProjection } from '../police/policeDutyContext';
import { describeGameTimeRelativeTo, formatGameTimeWithWeekday } from '../time/gameTime';
import { projectCityPowerContext } from '../cityPower/cityPowerProjector';
import type { CityPowerProjection } from '../cityPower/cityPowerTypes';
import { estimateNarrativeTokens } from '../narrator/estimateNarrativeTokens';
import { selectPlayerMemoryLayers } from '../memory/playerMemoryLayers';
import { indexActiveNpcMemories, type NpcMemoryTier } from '../memory/npcMemoryLayers';
import type { MemoryCompressionSettings } from '../settings/types';
import {
  projectCitySituationTrackContext,
  type CitySituationTrackProjection
} from '../cityPower/citySituationTrackProjector';
import {
  projectPresentActorReactions,
  type PresentActorReactionProjection
} from '../npc/presentActorReactionProjector';
import {
  projectRemoteNpcPresence,
  type RemoteNpcPresenceProjection
} from '../npc/remoteNpcPresenceProjector';
import {
  projectBackgroundEvolutionContext,
  type BackgroundEvolutionContextProjection
} from '../backgroundEvolution/contextProjector';
import {
  projectActorActualIdentitySummary,
  projectPlayerIdentityContext,
  projectPublicActorRoleProfiles,
  projectVisibleActorOrganizationIds,
  projectVisibleActorOrganizationRelations,
  type PlayerIdentityContextProjection
} from '../identity/identityContextProjector';
import type {
  Actor,
  ActorOrganizationRelation,
  ActorRoleProfiles,
  AssetItem,
  CaseActivityEntry,
  CaseEvidence,
  CaseFile,
  ClothingMode,
  DeferredEvent,
  MemoryItem,
  PlayerReputationState,
  Place,
  PressureHook,
  RuntimeState,
  Scene,
  StoryEntry
} from '../runtime/types';

export const MAX_MEMORIES = 6;
export const MAX_RECENT_STORY_RAW_ENTRIES = 12;
export const MAX_RECENT_STORY_RAW_TEXT_CHARS = 2200;
export const MAX_RECENT_STORY_SUMMARY_TEXT_CHARS = 520;
export const MAX_STORY_VECTOR_ENTRIES = 16;
export const MAX_STORY_VECTOR_PROMPT_ESTIMATED_TOKENS = 24000;
export const MAX_STORY_VECTOR_TOTAL_TEXT_CHARS = 24000;
export const MAX_STORY_VECTOR_ENTRY_TEXT_CHARS = 1500;
export const MAX_VECTOR_MEMORY_ENTRIES = 24;
export const MAX_VECTOR_MEMORY_PROMPT_ESTIMATED_TOKENS = 12000;
export const MAX_VECTOR_MEMORY_TOTAL_TEXT_CHARS = 12000;
export const MAX_VECTOR_MEMORY_ENTRY_TEXT_CHARS = 700;
export const MIN_VECTOR_MATCH_SCORE = 0.25;
export const MAX_NPC_MEMORY_ENTRIES = 80;
export const MAX_NPC_MEMORY_PROMPT_ESTIMATED_TOKENS = 20000;
export const MAX_NPC_MEMORY_TOTAL_TEXT_CHARS = 30000;
export const MAX_NPC_MEMORY_ENTRY_TEXT_CHARS = 400;
export const MAX_NPC_MEMORY_PRESENT_ACTORS = 8;
export const MAX_NPC_MEMORY_MENTIONED_ACTORS = 4;
export const MAX_PRESSURES = 1;
export const MAX_CASES = 3;
export const MAX_CASE_EVIDENCE = 8;
export const MAX_CASE_ACTIVITIES = 3;
export const MAX_DUE_DEFERRED_EVENTS = 3;
export const MAX_PRESENT_ACTORS = 8;
export const MAX_ASSET_CONTEXT_ITEMS = 6;

export interface ActorContextPacket {
  actorId: string;
  name: string;
  englishName?: string;
  aliases: string[];
  callName?: string;
  gender: Actor['gender'];
  computedAge?: number;
  visualAgeAnchor?: string;
  currentIdentity: Actor['currentIdentity'];
  publicIdentity?: string;
  actualIdentitySummary?: string;
  roleProfiles: ActorRoleProfiles;
  organizationIds: string[];
  organizationRelations: ActorOrganizationRelation[];
  presence: Actor['presence'];
  profileSummary: string;
  appearance: string;
  clothing: string;
  equipment: string[];
  personality: string;
  speechStyle: string;
  motivation: string;
  longTermGoal: string;
  values: string;
  attributes: Actor['attributes'];
  activeTraits: Actor['activeTraits'];
  traitProgress: Actor['traitProgress'];
  relationshipSummary: string;
  attitudeTowardPlayer: string;
  interactionScore: number;
  trustTendency: string;
  entanglementSummary: string;
  statusSummary: string;
  bodyConditionSummary?: string;
  longTermMemorySummary: string;
  recentInteractionMemory: string;
  femaleProfile?: Actor['femaleProfile'];
  visibility: Actor['visibility'];
  importance: number;
  detailLevel: 'full' | 'summary';
}

export interface PromptContext {
  worldpackId: string;
  openingPressure: RuntimeState['world']['openingPressure'];
  turnCounter: number;
  currentTime: RuntimeState['time'];
  timeLabel: string;
  playerSummary: string;
  lawIdentitySummary: string;
  identityProjection: PlayerIdentityContextProjection;
  currentPlace?: Place;
  currentScene?: Scene;
  presentActors: Actor[];
  actorPackets: ActorContextPacket[];
  relevantCases: CaseFile[];
  caseProjection: CaseProjection;
  deferredProjection: DeferredProjection;
  pressures: PressureHook[];
  memories: MemoryItem[];
  memoryProjection: MemoryProjectionEntry[];
  memoryLayerProjection: MemoryLayerProjection;
  npcMemoryProjection: NpcMemoryProjection;
  recentStoryProjection: RecentStoryProjection;
  storyVectorProjection: StoryVectorProjection;
  vectorMemoryProjection: VectorMemoryProjection;
  mapProjection: MapContextProjection;
  weatherProjection: WeatherProjection;
  assetProjection: AssetProjection;
  financeProjection: FinanceProjection;
  policeProjection: PolicePanelProjection;
  policeDutyProjection: PoliceDutyContextProjection;
  reputationProjection: ReputationProjection;
  grayNetworkProjection: GrayNetworkProjection;
  institutionProjection: InstitutionContextProjection;
  relationshipProjection: RelationshipContextProjection;
  dynamicProjection: DynamicContextProjection;
  eraSeedFigureProjection: EraSeedFigureProjection;
  storypackProjection: StorypackProjection;
  cityPowerProjection: CityPowerProjection;
  citySituationTrackProjection: CitySituationTrackProjection;
  presentActorReactionProjection: PresentActorReactionProjection;
  remoteNpcPresenceProjection: RemoteNpcPresenceProjection;
  backgroundEvolutionProjection: BackgroundEvolutionContextProjection;
  conflictProjection: ConflictContextProjection;
}

export type MemoryProjectionReason =
  | 'current_place'
  | 'present_actor'
  | 'player_input'
  | 'high_importance'
  | 'vector_match';
export type MemoryVector = number[];

export interface MemoryProjectionEntry {
  memory: MemoryItem;
  score: number;
  reasons: MemoryProjectionReason[];
  vectorScore?: number;
}

export type MemoryTier = NonNullable<MemoryItem['tier']>;

export interface MemoryLayerProjection {
  shortTerm: MemoryProjectionEntry[];
  midTerm: MemoryProjectionEntry[];
  longTerm: MemoryProjectionEntry[];
  diagnostics: {
    selectedMemoryIds: string[];
    omittedMemoryCount: number;
  };
}

export type NpcMemoryProjectionRoute = 'present' | 'mentioned' | 'remote';
export type NpcMemoryProjectionReason =
  | 'present_actor'
  | 'player_input_mention'
  | 'remote_presence'
  | 'latest_anchor'
  | 'memory_text_match'
  | 'vector_match'
  | 'short_term'
  | 'mid_term'
  | 'long_term';

export interface NpcMemoryProjectionEntry {
  actorId: string;
  actorName: string;
  route: NpcMemoryProjectionRoute;
  coreActor: boolean;
  memoryId: string;
  text: string;
  gameTime: MemoryItem['gameTime'];
  relativeLabel: string;
  tier: NpcMemoryTier;
  certainty: MemoryItem['certainty'];
  score: number;
  reasons: NpcMemoryProjectionReason[];
  vectorScore?: number;
}

export interface NpcMemoryProjection {
  entries: NpcMemoryProjectionEntry[];
  diagnostics: {
    selectedMemoryIds: string[];
    selectedActorIds: string[];
    routeCounts: Record<NpcMemoryProjectionRoute, number>;
    tierCounts: Record<NpcMemoryTier, number>;
    routedActors: Array<{
      actorId: string;
      actorName: string;
      route: NpcMemoryProjectionRoute;
      coreActor: boolean;
      candidateCounts: Record<NpcMemoryTier, number>;
      selectedCounts: Record<NpcMemoryTier, number>;
    }>;
    candidateMemoryCount: number;
    selectedTextChars: number;
    estimatedTokenBudget: number;
    omittedMemoryCount: number;
  };
}

export interface RecentStoryRawEntry {
  turnId: string;
  timeLabel: string;
  relativeLabel: string;
  playerInput?: string;
  text: string;
  suggestedActions: string[];
  judgementCheckIds: string[];
  combatEventIds: string[];
}

export interface RecentStorySummaryEntry {
  turnId: string;
  timeLabel: string;
  relativeLabel: string;
  playerInput?: string;
  summaryText: string;
  suggestedActions: string[];
  judgementCheckIds: string[];
  combatEventIds: string[];
}

export interface RecentStoryProjection {
  rawEntries: RecentStoryRawEntry[];
  summaryEntries: RecentStorySummaryEntry[];
  diagnostics: {
    totalNarratorEntries: number;
    rawEntryCount: number;
    summaryEntryCount: number;
    omittedEarlierCount: number;
  };
}

export type StoryVectorProjectionReason = 'vector_match' | 'player_input' | 'context_anchor';

export interface StoryVectorProjectionEntry {
  turnId: string;
  timeLabel: string;
  relativeLabel: string;
  text: string;
  score: number;
  vectorScore: number;
  reasons: StoryVectorProjectionReason[];
  suggestedActions: string[];
  judgementCheckIds: string[];
  combatEventIds: string[];
}

export interface StoryVectorProjection {
  entries: StoryVectorProjectionEntry[];
  diagnostics: {
    selectedTurnIds: string[];
    excludedRecentTurnIds: string[];
    selectedTextChars: number;
    estimatedTokenBudget: number;
    omittedCandidateCount: number;
    missingVectorCount: number;
  };
}

export type VectorMemoryProjectionReason =
  | 'vector_match'
  | 'player_input'
  | 'current_place'
  | 'high_importance';

export interface VectorMemoryProjectionEntry {
  memoryId: string;
  kind: MemoryItem['kind'];
  tier: MemoryItem['tier'];
  text: string;
  gameTime: MemoryItem['gameTime'];
  importance: number;
  certainty: MemoryItem['certainty'];
  score: number;
  vectorScore: number;
  reasons: VectorMemoryProjectionReason[];
}

export interface VectorMemoryProjection {
  entries: VectorMemoryProjectionEntry[];
  diagnostics: {
    selectedMemoryIds: string[];
    selectedTextChars: number;
    estimatedTokenBudget: number;
    omittedCandidateCount: number;
    missingVectorCount: number;
  };
}

export interface AssetProjection {
  items: AssetItem[];
  diagnostics: {
    selectedItemIds: string[];
    omittedItemCount: number;
  };
}

export interface CaseContextPacket {
  caseFile: CaseFile;
  evidence: CaseEvidence[];
  visibleActivities: CaseActivityEntry[];
}

export interface CaseProjection {
  cases: CaseContextPacket[];
  diagnostics: {
    selectedCaseIds: string[];
    selectedEvidenceIds: string[];
    omittedEvidenceCount: number;
  };
}

export interface DeferredProjection {
  dueEvents: DeferredEvent[];
  diagnostics: {
    pendingEventIds: string[];
    dueEventIds: string[];
    omittedDueEventCount: number;
  };
}

export interface ContextSelectionOptions {
  queryEmbedding?: MemoryVector;
  memorySettings?: MemoryCompressionSettings;
}

interface SelectionSignals {
  currentPlaceId: string;
  presentActorIds: Set<string>;
  inputTokens: string[];
  storyRecallTokens: string[];
  queryEmbedding?: MemoryVector;
  equippedItemIds: Set<string>;
  clothingSourceItemId?: string;
}

function formatTime(state: RuntimeState): string {
  return formatGameTimeWithWeekday(state.time);
}

function formatClothingMode(mode: ClothingMode | undefined): string | undefined {
  if (!mode) return undefined;
  const labels: Record<ClothingMode, string> = {
    duty_uniform: '军装制服',
    off_duty_plain: '便服',
    formal: '正装',
    disguise: '伪装',
    special: '特殊衣物',
    sleepwear: '睡衣',
    other: '其他'
  };
  return labels[mode];
}

function formatEntryTime(entry: StoryEntry): string {
  return formatGameTimeWithWeekday(entry.gameTime);
}

function normalizePromptText(text: string, maxChars: number): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function findPlayerEntryForTurn(storyLog: StoryEntry[], turnId: string): StoryEntry | undefined {
  return storyLog.find((entry) => entry.turnId === turnId && entry.speaker === 'player' && entry.text.trim());
}

function createRecentStoryRawEntry(
  entry: StoryEntry,
  currentTime: RuntimeState['time'],
  playerEntry?: StoryEntry
): RecentStoryRawEntry {
  return {
    turnId: entry.turnId,
    timeLabel: formatEntryTime(entry),
    relativeLabel: describeGameTimeRelativeTo(entry.gameTime, currentTime),
    playerInput: playerEntry ? normalizePromptText(playerEntry.text, MAX_RECENT_STORY_SUMMARY_TEXT_CHARS) : undefined,
    text: normalizePromptText(entry.text, MAX_RECENT_STORY_RAW_TEXT_CHARS),
    suggestedActions: [...(entry.suggestedActions ?? [])],
    judgementCheckIds: [...(entry.judgementCheckIds ?? [])],
    combatEventIds: [...(entry.combatEventIds ?? [])]
  };
}

function storySummarySource(entry: StoryEntry): string {
  return entry.summaryText?.trim() || entry.embeddingText?.trim() || entry.text;
}

function createRecentStorySummaryEntry(
  entry: StoryEntry,
  currentTime: RuntimeState['time'],
  playerEntry?: StoryEntry
): RecentStorySummaryEntry {
  return {
    turnId: entry.turnId,
    timeLabel: formatEntryTime(entry),
    relativeLabel: describeGameTimeRelativeTo(entry.gameTime, currentTime),
    playerInput: playerEntry ? normalizePromptText(playerEntry.text, MAX_RECENT_STORY_SUMMARY_TEXT_CHARS) : undefined,
    summaryText: normalizePromptText(storySummarySource(entry), MAX_RECENT_STORY_SUMMARY_TEXT_CHARS),
    suggestedActions: [...(entry.suggestedActions ?? [])],
    judgementCheckIds: [...(entry.judgementCheckIds ?? [])],
    combatEventIds: [...(entry.combatEventIds ?? [])]
  };
}

function selectRecentStoryProjection(state: RuntimeState, recentRawTurnLimit: number): RecentStoryProjection {
  const narratorEntries = state.storyLog.filter((entry) => entry.speaker === 'narrator' && entry.text.trim());
  const normalizedLimit = Math.max(0, Math.floor(Number.isFinite(recentRawTurnLimit) ? recentRawTurnLimit : MAX_RECENT_STORY_RAW_ENTRIES));
  const rawStart = Math.max(0, narratorEntries.length - normalizedLimit);
  const rawSource = narratorEntries.slice(rawStart);

  return {
    rawEntries: rawSource.map((entry) =>
      createRecentStoryRawEntry(entry, state.time, findPlayerEntryForTurn(state.storyLog, entry.turnId))
    ),
    summaryEntries: [],
    diagnostics: {
      totalNarratorEntries: narratorEntries.length,
      rawEntryCount: rawSource.length,
      summaryEntryCount: 0,
      omittedEarlierCount: rawStart
    }
  };
}

function createStoryVectorText(entry: StoryEntry, playerEntry?: StoryEntry): string {
  const parts: string[] = [];
  if (playerEntry) {
    parts.push(`玩家输入：${playerEntry.text}`);
  }
  if (entry.summaryText?.trim()) {
    parts.push(`回合摘要：${entry.summaryText}`);
  }
  parts.push(`AI正文：${entry.text}`);
  return parts.join('\n');
}

type ScoredStoryVectorEntry = StoryVectorProjectionEntry & {
  timeValue: number;
};

function storyTimeValue(entry: StoryEntry): number {
  const { year, month, day, hour, minute } = entry.gameTime;
  return (((year * 100 + month) * 100 + day) * 100 + hour) * 100 + minute;
}

function selectStoryVectorProjection(
  state: RuntimeState,
  recentStoryProjection: RecentStoryProjection,
  signals: SelectionSignals
): StoryVectorProjection {
  const excludedRecentTurnIds = new Set([
    ...recentStoryProjection.rawEntries.map((entry) => entry.turnId)
  ]);
  let missingVectorCount = 0;
  const candidates: ScoredStoryVectorEntry[] = [];

  for (const entry of state.storyLog) {
    if (entry.speaker !== 'narrator' || !entry.text.trim()) continue;
    if (excludedRecentTurnIds.has(entry.turnId)) continue;

    const playerEntry = findPlayerEntryForTurn(state.storyLog, entry.turnId);
    const recallText = createStoryVectorText(entry, playerEntry);
    const searchableText = [recallText, entry.summaryText ?? '', entry.embeddingText ?? '', playerEntry?.text ?? ''];
    const playerInputMatch = includesToken(searchableText, signals.inputTokens);
    const contextAnchorMatch = includesToken(searchableText, signals.storyRecallTokens);
    let vectorScore = 0;
    let vectorMatch = false;
    if (signals.queryEmbedding) {
      if (!entry.embeddingVector) {
        missingVectorCount += 1;
      } else {
        const similarity = cosineSimilarity(signals.queryEmbedding, entry.embeddingVector);
        if (similarity !== undefined) {
          vectorScore = similarity;
          vectorMatch = similarity >= MIN_VECTOR_MATCH_SCORE;
        }
      }
    }

    if (!vectorMatch && !contextAnchorMatch) continue;

    const reasons: StoryVectorProjectionReason[] = [];
    let score = 0;
    if (vectorMatch) {
      score += Math.round(vectorScore * 1000);
      reasons.push('vector_match');
    }
    if (contextAnchorMatch) {
      score += 700;
      reasons.push('context_anchor');
    }
    if (playerInputMatch) {
      score += 100;
      reasons.push('player_input');
    }

    candidates.push({
      turnId: entry.turnId,
      timeLabel: formatEntryTime(entry),
      relativeLabel: describeGameTimeRelativeTo(entry.gameTime, state.time),
      text: normalizePromptText(recallText, MAX_STORY_VECTOR_ENTRY_TEXT_CHARS),
      score,
      vectorScore,
      reasons,
      suggestedActions: [...(entry.suggestedActions ?? [])],
      judgementCheckIds: [...(entry.judgementCheckIds ?? [])],
      combatEventIds: [...(entry.combatEventIds ?? [])],
      timeValue: storyTimeValue(entry)
    });
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      right.vectorScore - left.vectorScore ||
      right.timeValue - left.timeValue ||
      left.turnId.localeCompare(right.turnId)
  );

  const selected: StoryVectorProjectionEntry[] = [];
  let selectedTextChars = 0;
  for (const candidate of candidates) {
    if (selected.length >= MAX_STORY_VECTOR_ENTRIES) break;
    const nextTextChars = selectedTextChars + candidate.text.length;
    if (nextTextChars > MAX_STORY_VECTOR_TOTAL_TEXT_CHARS) break;
    selectedTextChars = nextTextChars;
    const { timeValue, ...projectionEntry } = candidate;
    selected.push(projectionEntry);
  }

  return {
    entries: selected,
    diagnostics: {
      selectedTurnIds: selected.map((entry) => entry.turnId),
      excludedRecentTurnIds: [...excludedRecentTurnIds],
      selectedTextChars,
      estimatedTokenBudget: MAX_STORY_VECTOR_PROMPT_ESTIMATED_TOKENS,
      omittedCandidateCount: Math.max(0, candidates.length - selected.length),
      missingVectorCount
    }
  };
}

type ScoredVectorMemoryProjectionEntry = VectorMemoryProjectionEntry & {
  timeValue: number;
};

function selectVectorMemoryProjection(
  visibleMemories: MemoryItem[],
  signals: SelectionSignals
): VectorMemoryProjection {
  let missingVectorCount = 0;
  const candidates: ScoredVectorMemoryProjectionEntry[] = [];

  if (signals.queryEmbedding) {
    for (const memory of visibleMemories) {
      if (memory.kind === 'actor' || memory.kind === 'turn') continue;
      if (!memory.embeddingVector) {
        missingVectorCount += 1;
        continue;
      }
      const vectorScore = cosineSimilarity(signals.queryEmbedding, memory.embeddingVector);
      if (vectorScore === undefined || vectorScore < MIN_VECTOR_MATCH_SCORE) continue;
      const reasons: VectorMemoryProjectionReason[] = ['vector_match'];
      let score = Math.round(vectorScore * 1000) + memory.importance;
      if (includesToken([memory.text, memory.embeddingText ?? ''], signals.inputTokens)) {
        score += 100;
        reasons.push('player_input');
      }
      if (memory.relatedPlaceIds.includes(signals.currentPlaceId)) {
        score += 60;
        reasons.push('current_place');
      }
      if (memory.importance >= 70) {
        score += 40;
        reasons.push('high_importance');
      }
      candidates.push({
        memoryId: memory.memoryId,
        kind: memory.kind,
        tier: memory.tier,
        text: normalizePromptText(memory.text, MAX_VECTOR_MEMORY_ENTRY_TEXT_CHARS),
        gameTime: { ...memory.gameTime },
        importance: memory.importance,
        certainty: memory.certainty,
        score,
        vectorScore,
        reasons,
        timeValue: memoryTimeValue(memory)
      });
    }
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      right.vectorScore - left.vectorScore ||
      right.timeValue - left.timeValue ||
      left.memoryId.localeCompare(right.memoryId)
  );

  const selected: VectorMemoryProjectionEntry[] = [];
  let selectedTextChars = 0;
  for (const candidate of candidates) {
    if (selected.length >= MAX_VECTOR_MEMORY_ENTRIES) break;
    const nextTextChars = selectedTextChars + candidate.text.length;
    if (nextTextChars > MAX_VECTOR_MEMORY_TOTAL_TEXT_CHARS) break;
    selectedTextChars = nextTextChars;
    const { timeValue, ...projectionEntry } = candidate;
    selected.push(projectionEntry);
  }

  return {
    entries: selected,
    diagnostics: {
      selectedMemoryIds: selected.map((entry) => entry.memoryId),
      selectedTextChars,
      estimatedTokenBudget: MAX_VECTOR_MEMORY_PROMPT_ESTIMATED_TOKENS,
      omittedCandidateCount: Math.max(0, candidates.length - selected.length),
      missingVectorCount
    }
  };
}

function formatReputationOverallForPrompt(reputation: PlayerReputationState): string {
  return `整体知名度${reputation.notoriety}/1000（${formatNotorietyLevel(reputation.notoriety)}），整体口碑${reputation.overallReputation}（-100到100），${formatReputationTone(reputation.overallReputation)}，${reputation.summary}`;
}

function tokenizeInput(playerInput: string): string[] {
  const normalized = playerInput.trim().toLowerCase();
  if (!normalized) return [];

  return Array.from(
    new Set([
      normalized,
      ...normalized.split(/[^\p{L}\p{N}_]+/u).filter(Boolean)
    ])
  );
}

function uniqueNonEmptyStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function createChineseNgrams(text: string): string[] {
  const chunks = text.match(/[\p{Script=Han}]{3,12}/gu) ?? [];
  const tokens: string[] = [];

  for (const chunk of chunks) {
    const maxLength = Math.min(8, chunk.length);
    for (let size = 3; size <= maxLength; size += 1) {
      for (let index = 0; index + size <= chunk.length; index += 1) {
        tokens.push(chunk.slice(index, index + size));
      }
    }
  }

  return tokens;
}

function createStoryRecallText(
  playerInput: string,
  currentPlace: Place | undefined,
  currentScene: Scene | undefined,
  presentActors: Actor[]
): string {
  return uniqueNonEmptyStrings([
    playerInput,
    currentPlace?.name,
    currentPlace?.nameZh,
    currentPlace?.nameEn,
    ...(currentPlace?.aliases ?? []),
    currentPlace?.streetAddressText,
    ...(currentPlace?.roadAnchors ?? []),
    currentScene?.name,
    ...presentActors.flatMap((actor) => [
      actor.name,
      actor.englishName,
      actor.callName,
      ...actor.aliases,
      actor.publicIdentity,
      actor.positionSummary,
      actor.actualIdentitySummary
    ])
  ]).join('\n');
}

function tokenizeStoryRecallText(text: string): string[] {
  const normalized = text
    .replace(/报过警|报了警|报警了|报过案|报了案|报案了/gu, '报警')
    .trim()
    .toLowerCase();
  if (!normalized) return [];

  const exactTokens = tokenizeInput(normalized).filter((token) => token.length >= 2);
  const ngrams = createChineseNgrams(normalized);
  return uniqueNonEmptyStrings([...exactTokens, ...ngrams]).slice(0, 240);
}

const CITY_POWER_EXPANSION_PATTERN =
  /警务处|处长|一哥|总部|高层|廉署|icac|律政|投诉科|capo|社团|字头|和胜和|新义安|十四k|江湖|龙头|坐馆|话事|片场|嘉禾|tvb|电视|报馆|记者|媒体|汇丰|银行|金融|证券|地产|长江|政府|总督|压力|情报|风声|机构|公司|夜场|保护费/i;

function shouldExpandCityPowerProjection(playerInput: string): boolean {
  return CITY_POWER_EXPANSION_PATTERN.test(playerInput);
}

function includesToken(values: string[], tokens: string[]): boolean {
  return values.some((value) => {
    const normalized = value.toLowerCase();
    return tokens.some((token) => normalized.includes(token));
  });
}

function inputMentionsValue(values: string[], tokens: string[]): boolean {
  return values.some((value) => {
    const normalized = value.trim().toLowerCase();
    return normalized.length >= 2 && tokens.some((token) => token.includes(normalized));
  });
}

function intersects(values: string[], lookup: Set<string>): boolean {
  return values.some((value) => lookup.has(value));
}

function actorSearchValues(actor: Actor): string[] {
  return [
    actor.actorId,
    actor.name,
    actor.englishName ?? '',
    actor.callName ?? '',
    ...actor.aliases
  ].filter(Boolean);
}

function inputMentionsActor(actor: Actor, playerInput: string): boolean {
  const normalizedInput = playerInput.trim().toLowerCase();
  if (!normalizedInput) return false;
  return actorSearchValues(actor).some((value) => {
    const normalizedValue = value.trim().toLowerCase();
    return normalizedValue.length > 0 && normalizedInput.includes(normalizedValue);
  });
}

function cosineSimilarity(left: MemoryVector, right: MemoryVector): number | undefined {
  if (left.length === 0 || left.length !== right.length) return undefined;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return undefined;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function scoreMemory(memory: MemoryItem, signals: SelectionSignals): MemoryProjectionEntry {
  let score = 0;
  const reasons: MemoryProjectionReason[] = [];
  let vectorScore: number | undefined;
  if (memory.relatedPlaceIds.includes(signals.currentPlaceId)) {
    score += 100;
    reasons.push('current_place');
  }
  if (intersects(memory.relatedActorIds, signals.presentActorIds)) {
    score += 80;
    reasons.push('present_actor');
  }
  if (includesToken([memory.text, memory.embeddingText ?? ''], signals.inputTokens)) {
    score += 60;
    reasons.push('player_input');
  }
  if (memory.importance >= 70) {
    score += 30;
    reasons.push('high_importance');
  }
  if (signals.queryEmbedding && memory.embeddingVector) {
    vectorScore = cosineSimilarity(signals.queryEmbedding, memory.embeddingVector);
    if (vectorScore !== undefined && vectorScore >= 0.25) {
      score += Math.round(vectorScore * 130);
      reasons.push('vector_match');
    }
  }
  return { memory, score, reasons, vectorScore };
}

function scorePressure(pressure: PressureHook, signals: SelectionSignals): number {
  let score = 0;
  if (pressure.relatedPlaceIds.includes(signals.currentPlaceId)) score += 100;
  if (intersects(pressure.relatedActorIds, signals.presentActorIds)) score += 80;
  if (includesToken([pressure.summary, pressure.sourceSummary], signals.inputTokens)) score += 60;
  return score;
}

function isPlayerOwnedCaseRole(role: CaseFile['playerRole']): boolean {
  return role === 'lead' || role === 'assist' || role === 'execute';
}

function scoreCase(caseFile: CaseFile, signals: SelectionSignals): number {
  let score = 0;
  let directlyRelevant = false;
  const searchableValues = [
    caseFile.title,
    caseFile.summary,
    caseFile.caseType,
    caseFile.currentFocus,
    caseFile.playerVisibleProgress,
    caseFile.internalProgressSummary,
    caseFile.leadActorName ?? '',
    ...caseFile.activityLog.map((activity) => activity.summary)
  ];
  if (caseFile.relatedPlaceIds.includes(signals.currentPlaceId)) {
    score += 100;
    directlyRelevant = true;
  }
  if (intersects(caseFile.relatedActorIds, signals.presentActorIds)) {
    score += 80;
    directlyRelevant = true;
  }
  if (
    includesToken(searchableValues, signals.inputTokens) ||
    inputMentionsValue(searchableValues, signals.inputTokens)
  ) {
    score += 60;
    directlyRelevant = true;
  }
  if (isPlayerOwnedCaseRole(caseFile.playerRole)) {
    score += 40;
  } else if (directlyRelevant || caseFile.unreadActivityCount > 0) {
    score += 120;
  } else {
    score -= 120;
  }
  return score;
}

function scoreAsset(item: AssetItem, signals: SelectionSignals): number {
  let score = item.importance;
  if (signals.equippedItemIds.has(item.itemId)) score += 95;
  if (signals.clothingSourceItemId === item.itemId) score += 100;
  if (item.evidence) score += 80;
  if ((item.relatedPlaceIds ?? []).includes(signals.currentPlaceId)) score += 70;
  if (intersects(item.relatedActorIds ?? [], signals.presentActorIds)) score += 60;
  if (
    includesToken(
      [
        item.itemId,
        item.name,
        item.summary,
        item.detail ?? '',
        item.wearable?.wearSummary ?? '',
        item.wearable?.significance ?? '',
        ...(item.relatedCaseIds ?? []),
        item.evidence?.caseId ?? '',
        item.evidence?.caseTitle ?? '',
        item.evidence?.summary ?? '',
        item.evidence?.disputeSummary ?? ''
      ],
      signals.inputTokens
    )
  ) {
    score += 90;
  }
  return score;
}

function hasAssetProjectionRelevance(item: AssetItem, signals: SelectionSignals): boolean {
  if (signals.equippedItemIds.has(item.itemId)) return true;
  if (signals.clothingSourceItemId === item.itemId) return true;
  if (item.evidence) return true;
  if (item.importance >= 50) return true;
  if ((item.relatedPlaceIds ?? []).includes(signals.currentPlaceId)) return true;
  if (intersects(item.relatedActorIds ?? [], signals.presentActorIds)) return true;

  return includesToken(
    [
      item.itemId,
      item.name,
      item.summary,
      item.detail ?? '',
      item.wearable?.wearSummary ?? '',
      item.wearable?.significance ?? '',
      ...(item.relatedCaseIds ?? [])
    ],
    signals.inputTokens
  );
}

function compareScored(
  left: { score: number; tieBreaker: number; stableId: string },
  right: { score: number; tieBreaker: number; stableId: string }
): number {
  return right.score - left.score || right.tieBreaker - left.tieBreaker || right.stableId.localeCompare(left.stableId);
}

function selectAssetProjection(state: RuntimeState, signals: SelectionSignals): AssetProjection {
  const visibleItems = Object.values(state.assets?.items ?? {}).filter((item) => item.visibility !== 'hidden');
  const relevantItems = visibleItems.filter((item) => hasAssetProjectionRelevance(item, signals));
  const selected = relevantItems
    .map((item) => ({
      item,
      score: scoreAsset(item, signals),
      tieBreaker: item.importance,
      stableId: item.itemId
    }))
    .sort(compareScored)
    .slice(0, MAX_ASSET_CONTEXT_ITEMS)
    .map(({ item }) => item);

  return {
    items: selected,
    diagnostics: {
      selectedItemIds: selected.map((item) => item.itemId),
      omittedItemCount: Math.max(0, visibleItems.length - selected.length)
    }
  };
}

function selectCaseProjection(state: RuntimeState, relevantCases: CaseFile[]): CaseProjection {
  const selectedEvidenceIds = new Set<string>();
  let totalReferencedEvidence = 0;
  const cases = relevantCases.map((caseFile) => {
    const visibleEvidence = caseFile.evidenceIds
      .map((evidenceId) => state.caseEvidence[evidenceId])
      .filter((evidence): evidence is CaseEvidence => Boolean(evidence) && evidence.visibility !== 'hidden');
    totalReferencedEvidence += visibleEvidence.length;
    const evidence = visibleEvidence.slice(0, MAX_CASE_EVIDENCE);
    for (const item of evidence) {
      selectedEvidenceIds.add(item.evidenceId);
    }
    const visibleActivities = caseFile.activityLog
      .filter((activity) => activity.visibleToPlayer)
      .slice(-MAX_CASE_ACTIVITIES);

    return {
      caseFile,
      evidence,
      visibleActivities
    };
  });

  return {
    cases,
    diagnostics: {
      selectedCaseIds: cases.map((entry) => entry.caseFile.caseId),
      selectedEvidenceIds: [...selectedEvidenceIds],
      omittedEvidenceCount: Math.max(0, totalReferencedEvidence - selectedEvidenceIds.size)
    }
  };
}

function selectDeferredProjection(state: RuntimeState): DeferredProjection {
  const pendingEvents = Object.values(state.deferredEvents).filter((event) => event.status === 'pending');
  const duePendingEvents = pendingEvents.filter((event) => isGameTimeDue(event.triggerAt, state.time));
  const dueEvents = selectDueDeferredEvents(state, MAX_DUE_DEFERRED_EVENTS);

  return {
    dueEvents,
    diagnostics: {
      pendingEventIds: pendingEvents.map((event) => event.eventId),
      dueEventIds: dueEvents.map((event) => event.eventId),
      omittedDueEventCount: Math.max(0, duePendingEvents.length - dueEvents.length)
    }
  };
}

type ScoredMemoryProjectionEntry = MemoryProjectionEntry & {
  tieBreaker: number;
  stableId: string;
};

function memoryTimeValue(memory: MemoryItem): number {
  const { year, month, day, hour, minute } = memory.gameTime;
  return (((year * 100 + month) * 100 + day) * 100 + hour) * 100 + minute;
}

function compareRecentMemory(left: ScoredMemoryProjectionEntry, right: ScoredMemoryProjectionEntry): number {
  return (
    memoryTimeValue(right.memory) - memoryTimeValue(left.memory) ||
    right.memory.importance - left.memory.importance ||
    right.stableId.localeCompare(left.stableId)
  );
}

function stripScoredMemoryEntry(entry: ScoredMemoryProjectionEntry): MemoryProjectionEntry {
  const { tieBreaker, stableId, ...projection } = entry;
  return projection;
}

interface NpcMemoryRouteActor {
  actor: Actor;
  route: NpcMemoryProjectionRoute;
  coreActor: boolean;
  quotas: Record<NpcMemoryTier, number>;
  routeOrder: number;
}

type ScoredNpcMemoryProjectionEntry = Omit<NpcMemoryProjectionEntry, 'relativeLabel'> & {
  timeValue: number;
  recencyRank: number;
};

const npcMemoryRouteOrder: Record<NpcMemoryProjectionRoute, number> = {
  present: 3,
  mentioned: 2,
  remote: 1
};

const npcMemoryRouteBaseScore: Record<NpcMemoryProjectionRoute, number> = {
  present: 300,
  mentioned: 200,
  remote: 100
};

const npcMemoryMainQuotas = {
  corePresent: { short_term: 6, mid_term: 4, long_term: 2 },
  present: { short_term: 4, mid_term: 3, long_term: 1 },
  mentioned: { short_term: 3, mid_term: 2, long_term: 1 },
  remote: { short_term: 2, mid_term: 1, long_term: 1 }
} satisfies Record<string, Record<NpcMemoryTier, number>>;

function quotasForRoute(route: NpcMemoryProjectionRoute, coreActor: boolean): Record<NpcMemoryTier, number> {
  if (route === 'present') return coreActor ? npcMemoryMainQuotas.corePresent : npcMemoryMainQuotas.present;
  if (route === 'mentioned') return npcMemoryMainQuotas.mentioned;
  return npcMemoryMainQuotas.remote;
}

function emptyNpcTierCounts(): Record<NpcMemoryTier, number> {
  return { short_term: 0, mid_term: 0, long_term: 0 };
}

function routeReason(route: NpcMemoryProjectionRoute): NpcMemoryProjectionReason {
  if (route === 'present') return 'present_actor';
  if (route === 'mentioned') return 'player_input_mention';
  return 'remote_presence';
}

function upsertNpcMemoryRouteActor(
  actorsById: Map<string, NpcMemoryRouteActor>,
  actor: Actor,
  route: NpcMemoryProjectionRoute,
  coreActor = false
): void {
  const existing = actorsById.get(actor.actorId);
  const routeOrder = npcMemoryRouteOrder[route];
  if (!existing || routeOrder > existing.routeOrder) {
    actorsById.set(actor.actorId, {
      actor,
      route,
      coreActor,
      quotas: quotasForRoute(route, coreActor),
      routeOrder
    });
    return;
  }
  if (routeOrder === existing.routeOrder) {
    existing.coreActor = existing.coreActor || coreActor;
    existing.quotas = quotasForRoute(existing.route, existing.coreActor);
  }
}

function selectNpcMemoryRouteActors(
  state: RuntimeState,
  presentActors: Actor[],
  remoteNpcPresenceProjection: RemoteNpcPresenceProjection,
  playerInput: string
): NpcMemoryRouteActor[] {
  const actorsById = new Map<string, NpcMemoryRouteActor>();

  const eligiblePresentActors = presentActors.filter(
    (actor) => actor.actorId !== state.player.actorId && actor.visibility !== 'hidden'
  );
  const directlyMentionedPresentIds = new Set(
    eligiblePresentActors.filter((actor) => inputMentionsActor(actor, playerInput)).map((actor) => actor.actorId)
  );
  if (directlyMentionedPresentIds.size === 0 && eligiblePresentActors[0]) {
    directlyMentionedPresentIds.add(eligiblePresentActors[0].actorId);
  }

  for (const actor of eligiblePresentActors) {
    upsertNpcMemoryRouteActor(actorsById, actor, 'present', directlyMentionedPresentIds.has(actor.actorId));
  }

  const presentActorIds = new Set(presentActors.map((actor) => actor.actorId));
  const mentionedActors = Object.values(state.actors)
    .filter((actor) => actor.actorId !== state.player.actorId)
    .filter((actor) => actor.visibility !== 'hidden')
    .filter((actor) => !presentActorIds.has(actor.actorId))
    .filter((actor) => inputMentionsActor(actor, playerInput))
    .sort((left, right) => right.importance - left.importance || left.actorId.localeCompare(right.actorId))
    .slice(0, MAX_NPC_MEMORY_MENTIONED_ACTORS);

  for (const actor of mentionedActors) {
    upsertNpcMemoryRouteActor(actorsById, actor, 'mentioned');
  }

  for (const candidate of remoteNpcPresenceProjection.candidates) {
    const actor = state.actors[candidate.actorId];
    if (!actor || actor.actorId === state.player.actorId || actor.visibility === 'hidden') continue;
    if (presentActorIds.has(actor.actorId)) continue;
    upsertNpcMemoryRouteActor(actorsById, actor, 'remote');
  }

  return [...actorsById.values()].sort(
    (left, right) =>
      right.routeOrder - left.routeOrder ||
      right.actor.importance - left.actor.importance ||
      left.actor.actorId.localeCompare(right.actor.actorId)
  );
}

function scoreNpcMemory(
  memory: MemoryItem,
  routeActor: NpcMemoryRouteActor,
  signals: SelectionSignals,
  tier: NpcMemoryTier,
  recencyRank: number,
  latestAnchor: boolean
): ScoredNpcMemoryProjectionEntry {
  const reasons: NpcMemoryProjectionReason[] = [routeReason(routeActor.route), tier];
  const tierBaseScore = tier === 'short_term' ? 30 : tier === 'mid_term' ? 20 : 10;
  let score = npcMemoryRouteBaseScore[routeActor.route] + tierBaseScore + Math.max(0, 120 - recencyRank * 12);

  if (latestAnchor) {
    score += 180;
    reasons.push('latest_anchor');
  }
  if (includesToken([memory.text, memory.embeddingText ?? ''], signals.inputTokens)) {
    score += 240;
    reasons.push('memory_text_match');
  }
  let vectorScore: number | undefined;
  if (signals.queryEmbedding && memory.embeddingVector) {
    vectorScore = cosineSimilarity(signals.queryEmbedding, memory.embeddingVector);
    if (vectorScore !== undefined && vectorScore >= MIN_VECTOR_MATCH_SCORE) {
      score += Math.round(vectorScore * 700);
      reasons.push('vector_match');
    }
  }

  return {
    actorId: routeActor.actor.actorId,
    actorName: routeActor.actor.name,
    route: routeActor.route,
    coreActor: routeActor.coreActor,
    memoryId: memory.memoryId,
    text: normalizePromptText(memory.text, MAX_NPC_MEMORY_ENTRY_TEXT_CHARS),
    gameTime: { ...memory.gameTime },
    tier,
    certainty: memory.certainty,
    score,
    reasons,
    vectorScore,
    timeValue: memoryTimeValue(memory),
    recencyRank
  };
}

function compareScoredNpcMemory(
  left: ScoredNpcMemoryProjectionEntry,
  right: ScoredNpcMemoryProjectionEntry
): number {
  return right.score - left.score || right.timeValue - left.timeValue || left.memoryId.localeCompare(right.memoryId);
}

function isNpcMemoryEligibleBeyondAnchor(entry: ScoredNpcMemoryProjectionEntry): boolean {
  if (entry.reasons.includes('latest_anchor')) return true;
  if (entry.reasons.includes('memory_text_match') || entry.reasons.includes('vector_match')) return true;
  if (entry.tier === 'short_term') return entry.recencyRank < 4;
  if (entry.tier === 'mid_term') return entry.recencyRank < 2;
  return false;
}

function selectNpcMemoryProjection(
  state: RuntimeState,
  presentActors: Actor[],
  remoteNpcPresenceProjection: RemoteNpcPresenceProjection,
  playerInput: string,
  signals: SelectionSignals
): NpcMemoryProjection {
  const routeActors = selectNpcMemoryRouteActors(state, presentActors, remoteNpcPresenceProjection, playerInput);
  const memoryIndex = indexActiveNpcMemories(state.memories, { includePrivate: true });

  const selected: NpcMemoryProjectionEntry[] = [];
  const selectedIds = new Set<string>();
  const selectedTextKeys = new Set<string>();
  let selectedTextChars = 0;
  let totalCandidateCount = 0;
  const routedActors: NpcMemoryProjection['diagnostics']['routedActors'] = [];
  const tiers: NpcMemoryTier[] = ['short_term', 'mid_term', 'long_term'];

  for (const routeActor of routeActors) {
    const layers = memoryIndex.get(routeActor.actor.actorId) ?? { shortTerm: [], midTerm: [], longTerm: [] };
    const memoriesByTier: Record<NpcMemoryTier, MemoryItem[]> = {
      short_term: layers.shortTerm,
      mid_term: layers.midTerm,
      long_term: layers.longTerm
    };
    const candidateCounts = emptyNpcTierCounts();
    const selectedCounts = emptyNpcTierCounts();

    for (const tier of tiers) {
      const tierMemories = memoriesByTier[tier];
      candidateCounts[tier] = tierMemories.length;
      totalCandidateCount += tierMemories.length;
      const latestMemoryId = tierMemories.at(-1)?.memoryId;
      const scored = tierMemories
        .map((memory, index) =>
          scoreNpcMemory(
            memory,
            routeActor,
            signals,
            tier,
            tierMemories.length - index - 1,
            memory.memoryId === latestMemoryId
          )
        )
        .sort(compareScoredNpcMemory);

      for (const entry of scored) {
        if (selected.length >= MAX_NPC_MEMORY_ENTRIES) break;
        if (selectedCounts[tier] >= routeActor.quotas[tier]) break;
        if (!isNpcMemoryEligibleBeyondAnchor(entry) || selectedIds.has(entry.memoryId)) continue;
        const textKey = `${entry.actorId}:${entry.text.trim().replace(/\s+/g, ' ').toLowerCase()}`;
        if (selectedTextKeys.has(textKey)) continue;
        const nextTextChars = selectedTextChars + entry.text.length;
        if (nextTextChars > MAX_NPC_MEMORY_TOTAL_TEXT_CHARS) continue;
        selectedIds.add(entry.memoryId);
        selectedTextKeys.add(textKey);
        selectedTextChars = nextTextChars;
        selectedCounts[tier] += 1;
        const { timeValue, recencyRank: _recencyRank, ...projectionEntry } = entry;
        selected.push({
          ...projectionEntry,
          relativeLabel: describeGameTimeRelativeTo(projectionEntry.gameTime, state.time)
        });
      }
    }

    routedActors.push({
      actorId: routeActor.actor.actorId,
      actorName: routeActor.actor.name,
      route: routeActor.route,
      coreActor: routeActor.coreActor,
      candidateCounts,
      selectedCounts
    });
  }

  const routeCounts: Record<NpcMemoryProjectionRoute, number> = {
    present: 0,
    mentioned: 0,
    remote: 0
  };
  for (const entry of selected) {
    routeCounts[entry.route] += 1;
  }
  const tierCounts = emptyNpcTierCounts();
  for (const entry of selected) {
    tierCounts[entry.tier ?? 'short_term'] += 1;
  }

  return {
    entries: selected,
    diagnostics: {
      selectedMemoryIds: selected.map((entry) => entry.memoryId),
      selectedActorIds: Array.from(new Set(selected.map((entry) => entry.actorId))),
      routeCounts,
      tierCounts,
      routedActors,
      candidateMemoryCount: totalCandidateCount,
      selectedTextChars,
      estimatedTokenBudget: MAX_NPC_MEMORY_PROMPT_ESTIMATED_TOKENS,
      omittedMemoryCount: Math.max(0, totalCandidateCount - selected.length)
    }
  };
}

function selectMemoryLayerProjection(
  state: RuntimeState,
  scoredMemories: ScoredMemoryProjectionEntry[],
  recentRawTurnLimit: number,
  longTermPromptTokenBudget: number
): MemoryLayerProjection {
  const layers = selectPlayerMemoryLayers(state, recentRawTurnLimit);
  const scoredById = new Map(scoredMemories.map((entry) => [entry.memory.memoryId, entry]));
  const toProjection = (memory: MemoryItem): MemoryProjectionEntry => {
    const scored = scoredById.get(memory.memoryId);
    return scored ? stripScoredMemoryEntry(scored) : { memory, score: 0, reasons: [] };
  };
  const shortTerm = layers.shortTerm.map(toProjection);
  const midTerm = layers.midTerm.map(toProjection);
  const longBudget = Math.max(0, Math.floor(Number.isFinite(longTermPromptTokenBudget) ? longTermPromptTokenBudget : 24000));
  const selectedLongNewestFirst: MemoryProjectionEntry[] = [];
  let selectedLongTokens = 0;
  for (const memory of [...layers.longTerm].reverse()) {
    const tokens = estimateNarrativeTokens(memory.text);
    if (selectedLongNewestFirst.length > 0 && selectedLongTokens + tokens > longBudget) continue;
    if (selectedLongNewestFirst.length === 0 && tokens > longBudget && longBudget > 0) {
      selectedLongNewestFirst.push(toProjection(memory));
      selectedLongTokens += tokens;
      continue;
    }
    if (longBudget === 0) continue;
    selectedLongNewestFirst.push(toProjection(memory));
    selectedLongTokens += tokens;
  }
  const longTerm = selectedLongNewestFirst.reverse();
  const selectedIds = [...shortTerm, ...midTerm, ...longTerm].map((entry) => entry.memory.memoryId);
  const totalLayerMemories = layers.shortTerm.length + layers.midTerm.length + layers.longTerm.length;

  return {
    shortTerm,
    midTerm,
    longTerm,
    diagnostics: {
      selectedMemoryIds: selectedIds,
      omittedMemoryCount: Math.max(0, totalLayerMemories - selectedIds.length)
    }
  };
}

function isActor(actor: Actor | undefined): actor is Actor {
  return actor !== undefined;
}

function selectPresentActorsForContext(state: RuntimeState, currentScene: Scene | undefined): Actor[] {
  const presentActors = currentScene
    ? currentScene.presentActorIds.map((actorId) => state.actors[actorId]).filter(isActor)
    : getPresentActors(state).filter((actor) => actor.currentPlaceId === state.location.currentPlaceId);

  return presentActors
    .filter((actor) => actor.visibility !== 'hidden')
    .sort((a, b) => b.importance - a.importance)
    .slice(0, MAX_PRESENT_ACTORS);
}

function selectPresentNpcActorsForMemory(state: RuntimeState, currentScene: Scene | undefined): Actor[] {
  const presentActors = currentScene
    ? currentScene.presentActorIds.map((actorId) => state.actors[actorId]).filter(isActor)
    : getPresentActors(state).filter((actor) => actor.currentPlaceId === state.location.currentPlaceId);

  return presentActors
    .filter((actor) => actor.actorId !== state.player.actorId)
    .filter((actor) => actor.visibility !== 'hidden')
    .sort((a, b) => b.importance - a.importance)
    .slice(0, MAX_NPC_MEMORY_PRESENT_ACTORS);
}

function createActorContextPacket(
  state: RuntimeState,
  actor: Actor,
  currentTime: RuntimeState['time'],
  detailLevel: ActorContextPacket['detailLevel']
): ActorContextPacket {
  const organizationRelations = projectVisibleActorOrganizationRelations(actor);
  return {
    actorId: actor.actorId,
    name: actor.name,
    englishName: actor.englishName,
    aliases: [...actor.aliases],
    callName: actor.callName,
    gender: actor.gender,
    computedAge: actor.computedAge,
    visualAgeAnchor: actor.visualAgeAnchor,
    currentIdentity: actor.currentIdentity,
    publicIdentity: actor.publicIdentity,
    actualIdentitySummary: projectActorActualIdentitySummary(state, actor),
    roleProfiles: projectPublicActorRoleProfiles(actor),
    organizationIds: projectVisibleActorOrganizationIds(actor, organizationRelations),
    organizationRelations,
    presence: actor.presence,
    profileSummary: actor.profileSummary,
    appearance: actor.appearance,
    clothing: actor.clothing,
    equipment: [...actor.equipment],
    personality: actor.personality,
    speechStyle: actor.speechStyle,
    motivation: actor.motivation,
    longTermGoal: actor.longTermGoal,
    values: actor.values,
    attributes: { ...actor.attributes },
    activeTraits: actor.activeTraits
      .filter((trait) => trait.visibility !== 'hidden')
      .map((trait) => ({ ...trait, scopes: [...trait.scopes] })),
    traitProgress: actor.traitProgress.map((progress) => ({ ...progress })),
    relationshipSummary: actor.relationshipSummary,
    attitudeTowardPlayer: actor.attitudeTowardPlayer,
    interactionScore: actor.interactionScore,
    trustTendency: actor.trustTendency,
    entanglementSummary: actor.entanglementSummary,
    statusSummary: actor.statusSummary,
    bodyConditionSummary: actor.bodyConditionSummary,
    longTermMemorySummary: actor.longTermMemorySummary,
    recentInteractionMemory: actor.recentInteractionMemory,
    femaleProfile: projectFemaleProfileForPrompt(actor, currentTime),
    visibility: actor.visibility,
    importance: actor.importance,
    detailLevel
  };
}

export function selectContext(state: RuntimeState, playerInput: string, options: ContextSelectionOptions = {}): PromptContext {
  const currentPlace = getCurrentPlace(state);
  const currentScene = getCurrentScene(state);
  const presentActors = selectPresentActorsForContext(state, currentScene);
  const presentNpcMemoryActors = selectPresentNpcActorsForMemory(state, currentScene);
  const actorPackets = presentActors.map((actor) =>
    createActorContextPacket(state, actor, state.time, actor.actorId === state.player.actorId ? 'summary' : 'full')
  );
  const identityProjection = projectPlayerIdentityContext(state, {
    relevantActorIds: presentActors.map((actor) => actor.actorId)
  });
  const signals: SelectionSignals = {
    currentPlaceId: state.location.currentPlaceId,
    presentActorIds: new Set(presentActors.filter((actor) => actor.actorId !== state.player.actorId).map((actor) => actor.actorId)),
    inputTokens: tokenizeInput(playerInput),
    storyRecallTokens: tokenizeStoryRecallText(createStoryRecallText(playerInput, currentPlace, currentScene, presentActors)),
    queryEmbedding: options.queryEmbedding,
    equippedItemIds: new Set(state.assets?.equippedItemIds ?? []),
    clothingSourceItemId: state.player.clothingState?.sourceItemId
  };
  const pressures = Object.values(state.pressures)
    .filter((pressure) => pressure.status !== 'resolved' && pressure.visibility !== 'hidden')
    .map((pressure) => ({
      item: pressure,
      score: scorePressure(pressure, signals),
      tieBreaker: pressure.severity,
      stableId: pressure.pressureId
    }))
    .sort(compareScored)
    .slice(0, MAX_PRESSURES)
    .map(({ item }) => item);
  const relevantCases = Object.values(state.cases)
    .filter((caseFile) => caseFile.visibility !== 'hidden')
    .map((caseFile) => ({
      item: caseFile,
      score: scoreCase(caseFile, signals),
      tieBreaker: 0,
      stableId: caseFile.caseId
    }))
    .sort(compareScored)
    .slice(0, MAX_CASES)
    .map(({ item }) => item);
  const visibleMemories = Object.values(state.memories).filter(
    (memory) => memory.visibility !== 'hidden' && !memory.compressedIntoMemoryId
  );
  const scoredMemories = visibleMemories
    .filter((memory) => memory.kind !== 'actor')
    .map((memory) => ({
      ...scoreMemory(memory, signals),
      tieBreaker: memory.importance,
      stableId: memory.memoryId
    }));
  const memoryProjection = [...scoredMemories]
    .sort(compareScored)
    .slice(0, MAX_MEMORIES)
    .map(stripScoredMemoryEntry);
  const recentRawTurnLimit = options.memorySettings?.recentRawTurnLimit ?? MAX_RECENT_STORY_RAW_ENTRIES;
  const memoryLayerProjection = selectMemoryLayerProjection(
    state,
    scoredMemories,
    recentRawTurnLimit,
    options.memorySettings?.longTermPromptTokenBudget ?? 24000
  );
  const recentStoryProjection = selectRecentStoryProjection(state, recentRawTurnLimit);
  const storyVectorProjection = selectStoryVectorProjection(state, recentStoryProjection, signals);
  const vectorMemoryProjection = selectVectorMemoryProjection(visibleMemories, signals);
  const mapProjection = projectMapContext(state, playerInput);
  const eraSeedFigureProjection = projectEraSeedFigureContext(state, playerInput, {
    relatedPlaceIds: mapProjection.places.map((place) => place.placeId)
  });
  const storypackProjection = projectStorypackContext(state, playerInput, {
    relatedPlaceIds: mapProjection.places.map((place) => place.placeId)
  });
  const cityPowerProjection = shouldExpandCityPowerProjection(playerInput)
    ? projectCityPowerContext(state, playerInput, {
        relatedPlaceIds: mapProjection.places.map((place) => place.placeId),
        sectorHints: storypackProjection.cards.flatMap((card) => card.relatedSectors)
      })
    : projectCityPowerContext(state, playerInput);
  const citySituationTrackProjection = projectCitySituationTrackContext(state, playerInput, {
    relatedPlaceIds: mapProjection.places.map((place) => place.placeId),
    relatedOrganizationIds: cityPowerProjection.organizations.map((organization) => organization.organizationId),
    relatedActorIds: presentActors.map((actor) => actor.actorId)
  });
  const weatherProjection = projectWeatherContext(state);
  const assetProjection = selectAssetProjection(state, signals);
  const financeProjection = projectFinanceContext(state);
  const policeProjection = projectPolicePanelContext(state);
  const policeDutyProjection = projectPoliceDutyContext({
    time: state.time,
    currentIdentity: state.player.currentIdentity,
    lawIdentity: state.lawIdentity
  });
  const reputationProjection = projectReputationContext(state, playerInput);
  const grayNetworkProjection = projectGrayNetworkContext(state);
  const institutionProjection = projectInstitutionContext(state);
  const relationshipProjection = projectRelationshipContext(state, {
    presentActorIds: presentActors.map((actor) => actor.actorId)
  });
  const dynamicProjection = projectDynamicContext(state);
  const presentActorReactionProjection = projectPresentActorReactions(presentActors, {
    playerActorId: state.player.actorId,
    playerInput,
    currentSceneSummary: currentScene?.summary ?? currentPlace?.summary
  });
  const remoteNpcPresenceProjection = projectRemoteNpcPresence(state, relationshipProjection, dynamicProjection, {
    playerInput
  });
  const backgroundEvolutionProjection = projectBackgroundEvolutionContext(state, playerInput);
  const npcMemoryProjection = selectNpcMemoryProjection(
    state,
    presentNpcMemoryActors,
    remoteNpcPresenceProjection,
    playerInput,
    signals
  );
  const conflictProjection = projectConflictContext(state);
  const caseProjection = selectCaseProjection(state, relevantCases);
  const deferredProjection = selectDeferredProjection(state);
  const memories = memoryProjection.map(({ memory }) => memory);
  const policeNumberSummary =
    state.player.currentIdentity === 'police'
      ? state.player.policeNumber
        ? `警员编号：${state.player.policeNumber}。`
        : '警员编号：未填写，开局需要生成四位数字。'
      : '';
  const playerEnglishNameSummary = state.player.englishName ? `英文名：${state.player.englishName}。` : '';
  const playerEquipmentSummary = state.player.equipment.length ? `装备：${state.player.equipment.join('、')}。` : '';
  const clothingSourceItem = state.player.clothingState?.sourceItemId
    ? state.assets?.items?.[state.player.clothingState.sourceItemId]
    : undefined;
  const clothingSourceSummary =
    state.player.clothingState?.sourceItemSignificance ?? clothingSourceItem?.wearable?.significance ?? clothingSourceItem?.summary;
  const clothingModeSummary = formatClothingMode(state.player.clothingState?.mode);
  const clothingModeText = clothingModeSummary ? `衣着状态：${clothingModeSummary}。` : '';
  const clothingReasonText = state.player.clothingState?.lastChangedReason
    ? `上次衣着变化：${state.player.clothingState.lastChangedReason}`
    : '';
  const clothingSourceText = clothingSourceSummary
    ? `衣着关联：${clothingSourceItem?.name ?? state.player.clothingState?.sourceItemId}，${clothingSourceSummary}。`
    : '';
  const playerClothingSummary = `衣着：${state.player.clothing}。${clothingModeText}${clothingReasonText}${clothingSourceText}`;
  const vitalsSummary = `生命：${state.player.vitals.health}/${state.player.vitals.maxHealth}。体力：${state.player.vitals.stamina}/${state.player.vitals.maxStamina}。状态：${state.player.vitals.conditionSummary}`;
  const economySummary = `随身现金：${formatCurrencyAmount(financeProjection.cashOnHand, state.world.worldpackId)}。银行存款：${formatCurrencyAmount(financeProjection.bankBalance, state.world.worldpackId)}。${financeProjection.summary}`;
  const homeSummary = `固定住所：${state.player.homeBase.placeName ?? '未生成'}，${state.player.homeBase.housingType}。${state.player.homeBase.summary}${state.player.homeBase.householdSummary}`;
  const reputationSummary = `声誉：${formatReputationOverallForPrompt(state.player.reputation)}。`;

  return {
    worldpackId: state.world.worldpackId,
    openingPressure: state.world.openingPressure ?? 'relaxed',
    turnCounter: state.turnCounter,
    currentTime: { ...state.time },
    timeLabel: formatTime(state),
    playerSummary: `${state.player.name}，当前身份：${state.player.currentIdentity}。${playerEnglishNameSummary}${policeNumberSummary}${playerClothingSummary}${playerEquipmentSummary}状态：${vitalsSummary}。出身与背景：${state.player.originBackground.name}。${state.player.originBackground.definition}${state.player.originBackground.backgroundSummary}经济：${economySummary}住所：${homeSummary}${reputationSummary}`,
    lawIdentitySummary:
      state.player.currentIdentity === 'police' && state.lawIdentity.status === 'active'
        ? `${state.lawIdentity.status} ${state.lawIdentity.rank ?? ''} ${state.lawIdentity.stationOrPost ?? ''} ${state.lawIdentity.assignmentSummary ?? ''}`.trim()
        : '当前公开身份没有可用警务权限。',
    identityProjection,
    currentPlace,
    currentScene,
    presentActors,
    actorPackets,
    relevantCases,
    caseProjection,
    deferredProjection,
    pressures,
    memories,
    memoryProjection,
    memoryLayerProjection,
    npcMemoryProjection,
    recentStoryProjection,
    storyVectorProjection,
    vectorMemoryProjection,
    mapProjection,
    weatherProjection,
    assetProjection,
    financeProjection,
    policeProjection,
    policeDutyProjection,
    reputationProjection,
    grayNetworkProjection,
    institutionProjection,
    relationshipProjection,
    dynamicProjection,
    eraSeedFigureProjection,
    storypackProjection,
    cityPowerProjection,
    citySituationTrackProjection,
    presentActorReactionProjection,
    remoteNpcPresenceProjection,
    backgroundEvolutionProjection,
    conflictProjection
  };
}
