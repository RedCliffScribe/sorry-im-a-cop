import type { NarratorClient } from '../narrator/NarratorClient';
import { resolvePromptText } from '../prompts/promptRegistry';
import type { MemoryCompressionSettings, PromptSettings } from '../settings/types';
import type { GameTime, MemoryId, MemoryItem, RuntimeState, StoryDiagnosticIssue } from '../runtime/types';
import { selectPlayerMemoryLayers, type PlayerMemoryTier } from './playerMemoryLayers';
import { compressNpcMemories } from './compressNpcMemories';

interface CompressionStage {
  sourceTier: PlayerMemoryTier;
  targetTier: Exclude<PlayerMemoryTier, 'short_term'>;
  batchSize: number;
}

interface ParsedSummary {
  text: string;
  importance?: number;
  certainty?: MemoryItem['certainty'];
}

export interface CompressRuntimeMemoriesResult {
  state: RuntimeState;
  diagnostics: StoryDiagnosticIssue[];
}

const memoryCertainties: MemoryItem['certainty'][] = ['fact', 'claim', 'rumor', 'disputed', 'unknown'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function timeValue(time: GameTime): number {
  const { year, month, day, hour, minute } = time;
  return (((year * 100 + month) * 100 + day) * 100 + hour) * 100 + minute;
}

function memoryStart(memory: MemoryItem): GameTime {
  return memory.periodStart ?? memory.gameTime;
}

function memoryEnd(memory: MemoryItem): GameTime {
  return memory.periodEnd ?? memory.gameTime;
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

function buildSummaryPrompt(
  targetTier: CompressionStage['targetTier'],
  sourceMemories: MemoryItem[],
  promptSettings?: PromptSettings
): string {
  const targetLabel = targetTier === 'mid_term' ? 'mid-term' : 'long-term';
  return [
    resolvePromptText('memory.compression', promptSettings),
    `Target layer: ${targetLabel}.`,
    'Return exactly one memory summary for the complete source batch.',
    'Return JSON only.',
    '',
    'Expected JSON:',
    '{"summary":{"text":"...","importance":60,"certainty":"fact"}}',
    '关联 Actor / Case / Place / Organization ID 由系统从源记忆的有效结构化引用继承；不得自行输出或创造 ID。',
    '',
    'Source memories:',
    JSON.stringify(
      sourceMemories.map((memory) => ({
        memoryId: memory.memoryId,
        text: memory.text,
        relatedTurnId: memory.relatedTurnId,
        periodStart: memoryStart(memory),
        periodEnd: memoryEnd(memory),
        relatedActorIds: memory.relatedActorIds,
        relatedCaseIds: memory.relatedCaseIds,
        relatedPlaceIds: memory.relatedPlaceIds,
        relatedOrganizationIds: memory.relatedOrganizationIds,
        importance: memory.importance,
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

function parseSummary(raw: unknown): ParsedSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const text = typeof record.text === 'string' ? record.text.trim() : '';
  if (!text) return null;
  const rawCertainty = typeof record.certainty === 'string' ? record.certainty : undefined;
  const rawImportance = typeof record.importance === 'number' ? record.importance : undefined;
  return {
    text,
    certainty: memoryCertainties.includes(rawCertainty as MemoryItem['certainty'])
      ? (rawCertainty as MemoryItem['certainty'])
      : undefined,
    importance: rawImportance === undefined ? undefined : clamp(Math.round(rawImportance), 1, 100)
  };
}

function sourceImportance(sourceMemories: MemoryItem[]): number {
  return clamp(Math.round(Math.max(...sourceMemories.map((memory) => memory.importance))), 1, 100);
}

function createSummaryMemory(
  state: RuntimeState,
  memoryId: MemoryId,
  targetTier: CompressionStage['targetTier'],
  sourceMemories: MemoryItem[],
  summary: ParsedSummary
): MemoryItem {
  const chronological = [...sourceMemories].sort(
    (left, right) => timeValue(memoryStart(left)) - timeValue(memoryStart(right)) || left.memoryId.localeCompare(right.memoryId)
  );
  const first = chronological[0];
  const last = chronological[chronological.length - 1];
  const periodStart = { ...memoryStart(first) };
  const periodEnd = { ...memoryEnd(last) };
  return {
    memoryId,
    text: summary.text,
    kind: 'turn',
    tier: targetTier,
    relatedActorIds: mergeUnique(sourceMemories.map((memory) => memory.relatedActorIds)).filter(
      (actorId) => Boolean(state.actors[actorId])
    ),
    relatedCaseIds: mergeUnique(sourceMemories.map((memory) => memory.relatedCaseIds)).filter(
      (caseId) => Boolean(state.cases[caseId])
    ),
    relatedPlaceIds: mergeUnique(sourceMemories.map((memory) => memory.relatedPlaceIds)).filter(
      (placeId) => Boolean(state.places[placeId])
    ),
    relatedOrganizationIds: mergeUnique(sourceMemories.map((memory) => memory.relatedOrganizationIds)).filter(
      (organizationId) => Boolean(state.organizations[organizationId])
    ),
    relatedTurnId: last.relatedTurnId,
    gameTime: { ...periodEnd },
    periodStart,
    periodEnd,
    importance: summary.importance ?? sourceImportance(sourceMemories),
    visibility: 'player_known',
    certainty: summary.certainty ?? 'fact',
    embeddingText: summary.text
  };
}

async function runCompressionStage(
  state: RuntimeState,
  memorySummary: NarratorClient,
  stage: CompressionStage,
  recentRawTurnLimit: number,
  promptSettings?: PromptSettings
): Promise<CompressRuntimeMemoriesResult> {
  const batchSize = normalizePositiveInteger(stage.batchSize, 0);
  if (batchSize <= 0) return { state, diagnostics: [] };

  const layers = selectPlayerMemoryLayers(state, recentRawTurnLimit);
  const candidates = stage.sourceTier === 'short_term' ? layers.shortTerm : layers.midTerm;
  if (candidates.length < batchSize) return { state, diagnostics: [] };
  const sourceMemories = candidates.slice(0, batchSize);

  try {
    const rawResponse = await memorySummary.complete(buildSummaryPrompt(stage.targetTier, sourceMemories, promptSettings));
    const summary = parseSummary(summaryCandidate(rawResponse));
    if (!summary) {
      return {
        state,
        diagnostics: [
          {
            path: ['memoryCompression', stage.sourceTier],
            code: 'memory_compression_empty',
            message: `Memory compression returned no usable ${stage.targetTier} summary.`
          }
        ]
      };
    }

    const memories = { ...state.memories };
    const summaryId = nextAvailableMemoryId(memories, `memory_${stage.targetTier}_summary`);
    memories[summaryId] = createSummaryMemory(state, summaryId, stage.targetTier, sourceMemories, summary);

    for (const sourceMemory of sourceMemories) {
      const {
        embeddingText: _embeddingText,
        embeddingVector: _embeddingVector,
        embeddingModel: _embeddingModel,
        embeddingUpdatedAt: _embeddingUpdatedAt,
        ...sourceWithoutEmbeddingCache
      } = memories[sourceMemory.memoryId];
      memories[sourceMemory.memoryId] = {
        ...sourceWithoutEmbeddingCache,
        compressedIntoMemoryId: summaryId,
        compressedAtTurnId: `turn_${state.turnCounter}`
      };
    }

    return { state: { ...state, memories }, diagnostics: [] };
  } catch (error) {
    return {
      state,
      diagnostics: [
        {
          path: ['memoryCompression', stage.sourceTier],
          code: 'memory_compression_failed',
          message: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
}

export async function compressRuntimeMemories(
  state: RuntimeState,
  memorySummary: NarratorClient | null | undefined,
  settings: MemoryCompressionSettings,
  promptSettings?: PromptSettings
): Promise<CompressRuntimeMemoriesResult> {
  if (!settings.autoCompressionEnabled || !memorySummary) return { state, diagnostics: [] };

  const diagnostics: StoryDiagnosticIssue[] = [];
  const shortStage = await runCompressionStage(
    state,
    memorySummary,
    { sourceTier: 'short_term', targetTier: 'mid_term', batchSize: settings.shortTermBatchSize },
    settings.recentRawTurnLimit,
    promptSettings
  );
  diagnostics.push(...shortStage.diagnostics);

  const midStage = await runCompressionStage(
    shortStage.state,
    memorySummary,
    { sourceTier: 'mid_term', targetTier: 'long_term', batchSize: settings.midTermBatchSize },
    settings.recentRawTurnLimit,
    promptSettings
  );
  diagnostics.push(...midStage.diagnostics);

  const npcStage = await compressNpcMemories(midStage.state, memorySummary, promptSettings);
  diagnostics.push(...npcStage.diagnostics);

  return { state: npcStage.state, diagnostics };
}
