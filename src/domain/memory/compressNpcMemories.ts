import type { NarratorClient } from '../narrator/NarratorClient';
import { resolvePromptText } from '../prompts/promptRegistry';
import type { GameTime, MemoryId, MemoryItem, RuntimeState, StoryDiagnosticIssue } from '../runtime/types';
import type { PromptSettings } from '../settings/types';
import { mergeMemoryTemporalReferences } from '../time/memoryTemporal';
import {
  NPC_MEMORY_ACTIVE_LIMITS,
  NPC_MEMORY_COMPRESSION_BATCH_SIZES,
  NPC_MEMORY_MAX_COMPRESSION_OPERATIONS_PER_TURN,
  indexActiveNpcMemories,
  type NpcMemoryTier,
  synchronizeNpcMemoryCaches
} from './npcMemoryLayers';

interface ParsedNpcMemorySummary {
  text: string;
  certainty?: MemoryItem['certainty'];
}

interface NpcMemoryCompressionOperation {
  actorId: string;
  sourceTier: NpcMemoryTier;
  targetTier: Exclude<NpcMemoryTier, 'short_term'>;
  sourceMemories: MemoryItem[];
  overflow: number;
  signature: string;
}

export interface CompressNpcMemoriesOptions {
  maxOperations?: number;
}

export interface CompressNpcMemoriesResult {
  state: RuntimeState;
  diagnostics: StoryDiagnosticIssue[];
  operationCount: number;
}

const memoryCertainties: MemoryItem['certainty'][] = ['fact', 'claim', 'rumor', 'disputed', 'unknown'];

function memoryStart(memory: MemoryItem): GameTime {
  return memory.periodStart ?? memory.gameTime;
}

function memoryEnd(memory: MemoryItem): GameTime {
  return memory.periodEnd ?? memory.gameTime;
}

function timeValue(time: GameTime): number {
  const { year, month, day, hour, minute } = time;
  return (((year * 100 + month) * 100 + day) * 100 + hour) * 100 + minute;
}

function elapsedDays(start: GameTime, end: GameTime): number {
  const startMs = Date.UTC(start.year, start.month - 1, start.day, start.hour, start.minute);
  const endMs = Date.UTC(end.year, end.month - 1, end.day, end.hour, end.minute);
  return Math.max(0, endMs - startMs) / 86_400_000;
}

function nextAvailableMemoryId(existing: Record<MemoryId, MemoryItem>, prefix: string): MemoryId {
  let index = Object.keys(existing).length + 1;
  let memoryId = `${prefix}_${String(index).padStart(4, '0')}`;
  while (memoryId in existing) {
    index += 1;
    memoryId = `${prefix}_${String(index).padStart(4, '0')}`;
  }
  return memoryId;
}

function mergeUnique(values: string[][]): string[] {
  return Array.from(new Set(values.flat().filter(Boolean)));
}

function mergeVisibility(sourceMemories: MemoryItem[]): MemoryItem['visibility'] {
  if (sourceMemories.some((memory) => memory.visibility === 'public')) return 'public';
  if (sourceMemories.some((memory) => memory.visibility === 'player_known')) return 'player_known';
  if (sourceMemories.some((memory) => memory.visibility === 'private')) return 'private';
  return 'hidden';
}

function buildNpcSummaryPrompt(
  state: RuntimeState,
  operation: NpcMemoryCompressionOperation,
  promptSettings?: PromptSettings
): string {
  const actor = state.actors[operation.actorId];
  return [
    resolvePromptText('memory.compression', promptSettings),
    'MEMORY_SUBJECT=NPC',
    `actorId=${operation.actorId}`,
    `actorName=${actor?.name ?? operation.actorId}`,
    `sourceTier=${operation.sourceTier}`,
    `targetTier=${operation.targetTier}`,
    '把完整批次压缩成一条人物记忆。只保留未来仍会影响该人物行为、关系、承诺、戒备、恩怨或对话承接的事实。',
    '不得填写重要度，不得创造源条目之外的事实或新的 ID。',
    '使用绝对日期或明确日期范围，不使用今天、昨天、明天、今晚等相对时间。',
    'Return JSON only: {"summary":{"text":"...","certainty":"fact"}}',
    '',
    'Source NPC memories:',
    JSON.stringify(
      operation.sourceMemories.map((memory) => ({
        memoryId: memory.memoryId,
        text: memory.text,
        relatedTurnId: memory.relatedTurnId,
        periodStart: memoryStart(memory),
        periodEnd: memoryEnd(memory),
        temporalReferences: memory.temporalReferences?.map((reference) => ({
          resolvedStart: reference.resolvedStart,
          resolvedEnd: reference.resolvedEnd,
          precision: reference.precision
        })),
        certainty: memory.certainty
      })),
      null,
      2
    )
  ].join('\n');
}

function summaryCandidate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (record.summary && typeof record.summary === 'object') return record.summary;
  const arrays = [record.summaries, record.memories, record.midTermMemories, record.longTermMemories];
  for (const candidate of arrays) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate[0];
  }
  return null;
}

function parseNpcSummary(raw: unknown): ParsedNpcMemorySummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const text = typeof record.text === 'string' ? record.text.trim() : '';
  if (!text) return null;
  const certainty =
    typeof record.certainty === 'string' && memoryCertainties.includes(record.certainty as MemoryItem['certainty'])
      ? (record.certainty as MemoryItem['certainty'])
      : undefined;
  return { text, certainty };
}

function createNpcSummaryMemory(
  memoryId: MemoryId,
  operation: NpcMemoryCompressionOperation,
  summary: ParsedNpcMemorySummary
): MemoryItem {
  const chronological = [...operation.sourceMemories].sort(
    (left, right) => timeValue(memoryStart(left)) - timeValue(memoryStart(right)) || left.memoryId.localeCompare(right.memoryId)
  );
  const first = chronological[0];
  const last = chronological.at(-1) ?? first;
  const periodStart = { ...memoryStart(first) };
  const periodEnd = { ...memoryEnd(last) };

  return {
    memoryId,
    text: summary.text,
    kind: 'actor',
    tier: operation.targetTier,
    relatedActorIds: [operation.actorId],
    relatedCaseIds: mergeUnique(operation.sourceMemories.map((memory) => memory.relatedCaseIds)),
    relatedPlaceIds: mergeUnique(operation.sourceMemories.map((memory) => memory.relatedPlaceIds)),
    relatedOrganizationIds: mergeUnique(operation.sourceMemories.map((memory) => memory.relatedOrganizationIds)),
    relatedTurnId: last.relatedTurnId,
    gameTime: { ...periodEnd },
    periodStart,
    periodEnd,
    importance: 50,
    visibility: mergeVisibility(operation.sourceMemories),
    certainty: summary.certainty ?? 'fact',
    embeddingText: summary.text,
    temporalReferences: mergeMemoryTemporalReferences(operation.sourceMemories)
  };
}

function operationForTier(
  actorId: string,
  tier: NpcMemoryTier,
  memories: MemoryItem[]
): NpcMemoryCompressionOperation | null {
  const limit = NPC_MEMORY_ACTIVE_LIMITS[tier];
  const batchSize = NPC_MEMORY_COMPRESSION_BATCH_SIZES[tier];
  const overflowByCount = memories.length - limit;
  const oldest = memories[0];
  const newest = memories.at(-1);
  const dueByAge =
    tier === 'short_term' &&
    memories.length >= batchSize &&
    Boolean(oldest && newest && elapsedDays(memoryStart(oldest), memoryEnd(newest)) > 7);
  const overflow = overflowByCount > 0 ? overflowByCount : dueByAge ? 1 : 0;
  if (overflow <= 0) return null;
  const sourceMemories = memories.slice(0, batchSize);
  if (sourceMemories.length < batchSize) return null;
  const targetTier = tier === 'short_term' ? 'mid_term' : 'long_term';
  return {
    actorId,
    sourceTier: tier,
    targetTier,
    sourceMemories,
    overflow,
    signature: `${actorId}:${tier}:${sourceMemories.map((memory) => memory.memoryId).join(',')}`
  };
}

function selectNextOperation(
  state: RuntimeState,
  attemptedSignatures: Set<string>
): NpcMemoryCompressionOperation | null {
  const index = indexActiveNpcMemories(state.memories, { includeHidden: true, includePrivate: true });
  const operations: NpcMemoryCompressionOperation[] = [];

  for (const [actorId, layers] of index) {
    if (!state.actors[actorId]) continue;
    const candidates = [
      operationForTier(actorId, 'short_term', layers.shortTerm),
      operationForTier(actorId, 'mid_term', layers.midTerm),
      operationForTier(actorId, 'long_term', layers.longTerm)
    ].filter((operation): operation is NpcMemoryCompressionOperation => Boolean(operation));
    operations.push(...candidates.filter((operation) => !attemptedSignatures.has(operation.signature)));
  }

  return (
    operations.sort(
      (left, right) =>
        right.overflow - left.overflow ||
        (left.sourceTier === 'short_term' ? -1 : left.sourceTier === 'mid_term' ? 0 : 1) -
          (right.sourceTier === 'short_term' ? -1 : right.sourceTier === 'mid_term' ? 0 : 1) ||
        left.actorId.localeCompare(right.actorId)
    )[0] ?? null
  );
}

async function runOperation(
  state: RuntimeState,
  memorySummary: NarratorClient,
  operation: NpcMemoryCompressionOperation,
  promptSettings?: PromptSettings
): Promise<{ state: RuntimeState; diagnostic: StoryDiagnosticIssue; changed: boolean }> {
  try {
    const rawResponse = await memorySummary.complete(buildNpcSummaryPrompt(state, operation, promptSettings));
    const summary = parseNpcSummary(summaryCandidate(rawResponse));
    if (!summary) {
      return {
        state,
        changed: false,
        diagnostic: {
          path: ['npcMemoryCompression', operation.actorId, operation.sourceTier],
          code: 'npc_memory_compression_empty',
          message: `NPC memory compression returned no usable ${operation.targetTier} summary for ${operation.actorId}.`
        }
      };
    }

    const memories = { ...state.memories };
    const summaryId = nextAvailableMemoryId(memories, `memory_actor_${operation.targetTier}_summary`);
    memories[summaryId] = createNpcSummaryMemory(summaryId, operation, summary);

    for (const sourceMemory of operation.sourceMemories) {
      const stored = memories[sourceMemory.memoryId];
      if (!stored) continue;
      const {
        embeddingText: _embeddingText,
        embeddingVector: _embeddingVector,
        embeddingModel: _embeddingModel,
        embeddingUpdatedAt: _embeddingUpdatedAt,
        ...coldSource
      } = stored;
      memories[sourceMemory.memoryId] = {
        ...coldSource,
        compressedIntoMemoryId: summaryId,
        compressedAtTurnId: `turn_${state.turnCounter}`
      };
    }

    return {
      state: synchronizeNpcMemoryCaches({ ...state, memories }),
      changed: true,
      diagnostic: {
        path: ['npcMemoryCompression', operation.actorId, operation.sourceTier],
        code: 'npc_memory_compressed',
        message: `Compressed ${operation.sourceMemories.length} ${operation.sourceTier} NPC memories for ${operation.actorId} into ${summaryId} (${operation.targetTier}).`
      }
    };
  } catch (error) {
    return {
      state,
      changed: false,
      diagnostic: {
        path: ['npcMemoryCompression', operation.actorId, operation.sourceTier],
        code: 'npc_memory_compression_failed',
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export async function compressNpcMemories(
  state: RuntimeState,
  memorySummary: NarratorClient | null | undefined,
  promptSettings?: PromptSettings,
  options: CompressNpcMemoriesOptions = {}
): Promise<CompressNpcMemoriesResult> {
  const synchronizedState = synchronizeNpcMemoryCaches(state);
  if (!memorySummary) return { state: synchronizedState, diagnostics: [], operationCount: 0 };

  const maxOperations = Math.max(
    0,
    Math.floor(options.maxOperations ?? NPC_MEMORY_MAX_COMPRESSION_OPERATIONS_PER_TURN)
  );
  const diagnostics: StoryDiagnosticIssue[] = [];
  const attemptedSignatures = new Set<string>();
  let nextState = synchronizedState;
  let operationCount = 0;
  let attemptCount = 0;

  while (attemptCount < maxOperations) {
    const operation = selectNextOperation(nextState, attemptedSignatures);
    if (!operation) break;
    attemptedSignatures.add(operation.signature);
    attemptCount += 1;
    const result = await runOperation(nextState, memorySummary, operation, promptSettings);
    diagnostics.push(result.diagnostic);
    if (result.changed) {
      nextState = result.state;
      operationCount += 1;
    }
  }

  return { state: nextState, diagnostics, operationCount };
}
