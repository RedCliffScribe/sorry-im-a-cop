import 'fake-indexeddb/auto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_NPC_MEMORY_ENTRIES,
  MAX_NPC_MEMORY_TOTAL_TEXT_CHARS,
  selectContext
} from '../../src/domain/context/selectContext';
import { compressNpcMemories } from '../../src/domain/memory/compressNpcMemories';
import {
  NPC_MEMORY_ACTIVE_LIMITS,
  countActiveNpcMemories,
  indexActiveNpcMemories
} from '../../src/domain/memory/npcMemoryLayers';
import type { NarratorClient } from '../../src/domain/narrator/NarratorClient';
import {
  MAX_NPC_SIMULATION_MEMORY_ENTRIES,
  selectNpcSimulationMemoryProjection
} from '../../src/domain/npc/npcSimulation';
import { IndexedDbSaveRepository } from '../../src/domain/persistence/IndexedDbSaveRepository';
import { createPortableSaveRecord } from '../../src/domain/persistence/portableSaveArchive';
import { parseRuntimeSaveRecord } from '../../src/domain/persistence/saveArchiveSchema';
import type { RuntimeSaveRecord } from '../../src/domain/persistence/SaveRepository';
import { createActorDefaults } from '../../src/domain/runtime/actorFactory';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type {
  GameTime,
  MemoryItem,
  RuntimeState,
  StoryDiagnosticIssue
} from '../../src/domain/runtime/types';

const shouldRun = process.env.COPV2_RUN_NPC_MEMORY_LONG_LOAD === '1';
const TURN_COUNT = 1000;
const NPC_COUNT = 48;
const MEMORIES_PER_TURN = 6;
const PERSISTENCE_INTERVAL = 100;
const VECTOR_DIMENSIONS = 32;

interface LoadCheckpoint {
  turn: number;
  totalMemories: number;
  activeMemories: number;
  coldMemories: number;
  stateBytes: number;
  portableStateBytes: number;
  heapUsedBytes: number;
  summaryCalls: number;
  injectedFailures: number;
}

class LoadSummaryClient implements NarratorClient {
  callCount = 0;
  failureCount = 0;

  constructor(private readonly failEvery: number) {}

  async complete(prompt: string): Promise<unknown> {
    this.callCount += 1;
    if (this.failEvery > 0 && this.callCount % this.failEvery === 0) {
      this.failureCount += 1;
      throw new Error(`Injected load-test summary failure ${this.failureCount}`);
    }

    const actorId = prompt.match(/^actorId=(.+)$/m)?.[1]?.trim() ?? 'unknown_actor';
    const sourceTier = prompt.match(/^sourceTier=(.+)$/m)?.[1]?.trim() ?? 'unknown';
    const targetTier = prompt.match(/^targetTier=(.+)$/m)?.[1]?.trim() ?? 'unknown';
    const firstDate = prompt.match(/"periodStart"\s*:\s*\{[\s\S]*?"year"\s*:\s*(\d+)[\s\S]*?"month"\s*:\s*(\d+)[\s\S]*?"day"\s*:\s*(\d+)/)?.slice(1, 4);
    const dateLabel = firstDate?.length === 3
      ? `${firstDate[0]}年${firstDate[1]}月${firstDate[2]}日以后`
      : '1984年以后';

    return {
      summary: {
        text: `${dateLabel}，${actorId}的${sourceTier}人物记忆被归并为${targetTier}承接：其与玩家之间已形成会持续影响信任、戒备和后续对话的约定（负载批次${this.callCount}）。`,
        certainty: 'fact'
      }
    };
  }
}

function timeForTurn(turn: number): GameTime {
  const date = new Date(Date.UTC(1984, 0, 1, 8, 0) + turn * 6 * 60 * 60 * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function dateLabel(time: GameTime): string {
  return `${time.year}年${time.month}月${time.day}日 ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function vectorForActor(actorIndex: number): number[] {
  return Array.from({ length: VECTOR_DIMENSIONS }, (_, index) => {
    if (index === actorIndex % VECTOR_DIMENSIONS) return 1;
    if (index === (actorIndex * 7 + 3) % VECTOR_DIMENSIONS) return 0.25;
    return 0.001;
  });
}

function createLoadMemory(
  actorId: string,
  actorName: string,
  actorIndex: number,
  turn: number,
  slot: number,
  time: GameTime
): MemoryItem {
  const memoryId = `load_memory_${String(turn).padStart(4, '0')}_${String(slot).padStart(2, '0')}_${actorId}`;
  const text = `${dateLabel(time)}，${actorName}与玩家完成第${turn}回合第${slot + 1}次有持续价值的互动：双方确认一项后续仍需遵守的联络、保密或互助约定。`;
  return {
    memoryId,
    text,
    kind: 'actor',
    tier: 'short_term',
    relatedActorIds: [actorId],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    relatedTurnId: `turn_${turn}`,
    gameTime: { ...time },
    importance: 50,
    visibility: 'player_known',
    certainty: 'fact',
    embeddingText: text,
    embeddingVector: vectorForActor(actorIndex),
    embeddingModel: 'load-test-vector-32',
    embeddingUpdatedAt: '2026-07-17T00:00:00.000Z'
  };
}

function percentile(values: number[], percentage: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)];
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function createSaveRecord(state: RuntimeState, now: string): RuntimeSaveRecord {
  return {
    saveId: 'npc-memory-long-load',
    saveName: 'NPC memory long load',
    saveKind: 'manual',
    createdAt: now,
    updatedAt: now,
    playerName: state.player.name,
    worldpackId: state.world.worldpackId,
    gameDateLabel: dateLabel(state.time),
    turnCounter: state.turnCounter,
    runtimeState: state
  };
}

function memoryCounts(state: RuntimeState) {
  const memories = Object.values(state.memories);
  const active = memories.filter((memory) => memory.kind === 'actor' && !memory.compressedIntoMemoryId);
  const cold = memories.filter((memory) => Boolean(memory.compressedIntoMemoryId));
  return {
    total: memories.length,
    active: active.length,
    cold: cold.length
  };
}

function inspectCompressionChains(state: RuntimeState) {
  let missingTargets = 0;
  let cycles = 0;
  let maxDepth = 0;
  const coldSources = Object.values(state.memories).filter((memory) => Boolean(memory.compressedIntoMemoryId));

  for (const source of coldSources) {
    const seen = new Set<string>([source.memoryId]);
    let current = source;
    let depth = 0;
    while (current.compressedIntoMemoryId) {
      depth += 1;
      const targetId = current.compressedIntoMemoryId;
      if (seen.has(targetId)) {
        cycles += 1;
        break;
      }
      seen.add(targetId);
      const target = state.memories[targetId];
      if (!target) {
        missingTargets += 1;
        break;
      }
      current = target;
    }
    maxDepth = Math.max(maxDepth, depth);
  }

  return {
    coldSourceCount: coldSources.length,
    coldSourcesWithoutEmbeddingCache: coldSources.filter(
      (memory) => !memory.embeddingText && !memory.embeddingVector && !memory.embeddingModel && !memory.embeddingUpdatedAt
    ).length,
    missingTargets,
    cycles,
    maxDepth
  };
}

function diagnosticKey(diagnostic: StoryDiagnosticIssue): string | null {
  if (diagnostic.path[0] !== 'npcMemoryCompression') return null;
  const actorId = diagnostic.path[1];
  const tier = diagnostic.path[2];
  return typeof actorId === 'string' && typeof tier === 'string' ? `${actorId}:${tier}` : null;
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete load-test database.'));
    request.onblocked = () => reject(new Error('Load-test database deletion was blocked.'));
  });
}

describe.skipIf(!shouldRun)('NPC memory long-run technical load', () => {
  it('runs 1000 multi-NPC turns through compression, recall and persistence', async () => {
    const startedAt = performance.now();
    const baselineHeap = process.memoryUsage().heapUsed;
    const dbName = `copv2-npc-memory-load-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const repository = new IndexedDbSaveRepository(dbName);
    const summaryClient = new LoadSummaryClient(97);
    const recoveryClient = new LoadSummaryClient(0);
    const actorIds = Array.from({ length: NPC_COUNT }, (_, index) => `npc_load_${String(index + 1).padStart(2, '0')}`);
    const actorNames = actorIds.map((_, index) => `长期负载人物${String(index + 1).padStart(2, '0')}`);
    const turnDurations: number[] = [];
    const checkpoints: LoadCheckpoint[] = [];
    const pendingFailures = new Map<string, number>();
    const failureRecoveryTurns: number[] = [];
    let state = createInitialRuntimeState();
    const initialStoryEntryCount = state.storyLog.length;
    let persistenceRoundTrips = 0;
    let persistenceValidationFailures = 0;
    let rawMemoryWrites = 0;
    let projectionCapViolations = 0;
    let simulationSubsetViolations = 0;
    let maxProjectionEntries = 0;
    let maxProjectionTextChars = 0;
    let maxSimulationEntries = 0;
    let vectorMatchSelections = 0;
    let transientCapOverflowChecks = 0;
    let maxTransientActivePerActor = 0;
    let memoryCountRegressions = 0;
    let previousMemoryCount = Object.keys(state.memories).length;
    let peakStateBytes = byteLength(state);
    let peakHeapUsed = baselineHeap;

    const sceneId = state.location.currentSceneId!;
    for (let index = 0; index < actorIds.length; index += 1) {
      const actorId = actorIds[index];
      state.actors[actorId] = createActorDefaults({
        actorId,
        name: actorNames[index],
        aliases: [`负载${index + 1}`],
        currentIdentity: index % 5 === 0 ? 'police' : index % 3 === 0 ? 'gang_member' : 'civilian',
        profileSummary: `长期技术负载中的第${index + 1}名 NPC。`,
        relationshipSummary: '与玩家存在需要记忆持续承接的工作、信任或风险关系。',
        attitudeTowardPlayer: index % 2 === 0 ? '谨慎信任' : '礼貌观察',
        currentPlaceId: state.location.currentPlaceId,
        currentSceneId: undefined,
        presence: 'mentioned',
        visibility: 'player_known',
        importance: 40 + (index % 50)
      });
    }

    try {
      for (let turn = 1; turn <= TURN_COUNT; turn += 1) {
        const turnStartedAt = performance.now();
        const time = timeForTurn(turn);
        const selectedActorIndexes = Array.from(
          { length: MEMORIES_PER_TURN },
          (_, slot) => (turn + slot * Math.floor(NPC_COUNT / MEMORIES_PER_TURN)) % NPC_COUNT
        );
        const selectedActorIds = selectedActorIndexes.map((index) => actorIds[index]);

        state.turnCounter = turn;
        state.time = time;
        state.scenes[sceneId] = {
          ...state.scenes[sceneId],
          presentActorIds: [state.player.actorId, ...selectedActorIds.slice(0, 3)]
        };
        for (let index = 0; index < actorIds.length; index += 1) {
          const actorId = actorIds[index];
          const presentIndex = selectedActorIds.indexOf(actorId);
          const actor = state.actors[actorId];
          state.actors[actorId] = {
            ...actor,
            currentPlaceId: presentIndex >= 0 && presentIndex < 3 ? state.location.currentPlaceId : actor.currentPlaceId,
            currentSceneId: presentIndex >= 0 && presentIndex < 3 ? sceneId : undefined,
            presence: presentIndex >= 0 && presentIndex < 3 ? 'present' : 'mentioned'
          };
        }

        for (let slot = 0; slot < selectedActorIndexes.length; slot += 1) {
          const actorIndex = selectedActorIndexes[slot];
          const memory = createLoadMemory(
            actorIds[actorIndex],
            actorNames[actorIndex],
            actorIndex,
            turn,
            slot,
            time
          );
          state.memories[memory.memoryId] = memory;
          rawMemoryWrites += 1;
        }
        state.storyLog.push(
          {
            turnId: `turn_${turn}_player`,
            speaker: 'player',
            text: `第${turn}回合，与${actorNames[selectedActorIndexes[3]]}核对先前的长期约定。`,
            gameTime: { ...time }
          },
          {
            turnId: `turn_${turn}_narrator`,
            speaker: 'narrator',
            text: `第${turn}回合技术负载正文占位；结构化人物记忆由正式记忆管线处理。`,
            gameTime: { ...time }
          }
        );

        const compression = await compressNpcMemories(state, summaryClient);
        state = compression.state;
        for (const diagnostic of compression.diagnostics) {
          const key = diagnosticKey(diagnostic);
          if (!key) continue;
          if (diagnostic.code === 'npc_memory_compression_failed') {
            if (!pendingFailures.has(key)) pendingFailures.set(key, turn);
          } else if (diagnostic.code === 'npc_memory_compressed' && pendingFailures.has(key)) {
            failureRecoveryTurns.push(turn - pendingFailures.get(key)!);
            pendingFailures.delete(key);
          }
        }

        const mentionedActorIndex = selectedActorIndexes[3];
        const input = `我与${actorNames[mentionedActorIndex]}核对之前的保密和互助承诺。`;
        const context = selectContext(state, input, {
          queryEmbedding: vectorForActor(mentionedActorIndex)
        });
        const simulationProjection = selectNpcSimulationMemoryProjection(context);
        const mainIds = new Set(context.npcMemoryProjection.diagnostics.selectedMemoryIds);
        maxProjectionEntries = Math.max(maxProjectionEntries, context.npcMemoryProjection.entries.length);
        maxProjectionTextChars = Math.max(
          maxProjectionTextChars,
          context.npcMemoryProjection.diagnostics.selectedTextChars
        );
        maxSimulationEntries = Math.max(maxSimulationEntries, simulationProjection.entries.length);
        vectorMatchSelections += context.npcMemoryProjection.entries.filter((entry) =>
          entry.reasons.includes('vector_match')
        ).length;
        if (
          context.npcMemoryProjection.entries.length > MAX_NPC_MEMORY_ENTRIES ||
          context.npcMemoryProjection.diagnostics.selectedTextChars > MAX_NPC_MEMORY_TOTAL_TEXT_CHARS
        ) {
          projectionCapViolations += 1;
        }
        if (
          simulationProjection.entries.length > MAX_NPC_SIMULATION_MEMORY_ENTRIES ||
          !simulationProjection.diagnostics.selectedMemoryIds.every((memoryId) => mainIds.has(memoryId))
        ) {
          simulationSubsetViolations += 1;
        }

        const activeIndex = indexActiveNpcMemories(state.memories, {
          includeHidden: true,
          includePrivate: true
        });
        for (const layers of activeIndex.values()) {
          const activeCount = countActiveNpcMemories(layers);
          maxTransientActivePerActor = Math.max(maxTransientActivePerActor, activeCount);
          if (
            layers.shortTerm.length > NPC_MEMORY_ACTIVE_LIMITS.short_term ||
            layers.midTerm.length > NPC_MEMORY_ACTIVE_LIMITS.mid_term ||
            layers.longTerm.length > NPC_MEMORY_ACTIVE_LIMITS.long_term
          ) {
            transientCapOverflowChecks += 1;
          }
        }

        const currentMemoryCount = Object.keys(state.memories).length;
        if (currentMemoryCount < previousMemoryCount) memoryCountRegressions += 1;
        previousMemoryCount = currentMemoryCount;

        if (turn % PERSISTENCE_INTERVAL === 0) {
          const now = new Date(Date.UTC(2026, 6, 17, 0, 0, turn / PERSISTENCE_INTERVAL)).toISOString();
          const record = createSaveRecord(state, now);
          await repository.save(record);
          const loaded = await repository.load(record.saveId);
          if (!loaded) {
            persistenceValidationFailures += 1;
          } else {
            const parsed = parseRuntimeSaveRecord(loaded);
            const portable = createPortableSaveRecord(parsed);
            const portableRoundTrip = parseRuntimeSaveRecord(JSON.parse(JSON.stringify(portable)));
            if (
              parsed.runtimeState.turnCounter !== turn ||
              portableRoundTrip.runtimeState.turnCounter !== turn ||
              Object.keys(parsed.runtimeState.memories).length !== Object.keys(state.memories).length
            ) {
              persistenceValidationFailures += 1;
            }
            state = parsed.runtimeState;
          }
          persistenceRoundTrips += 1;

          const counts = memoryCounts(state);
          const stateBytes = byteLength(state);
          const portableStateBytes = byteLength(createPortableSaveRecord(createSaveRecord(state, now)).runtimeState);
          const heapUsedBytes = process.memoryUsage().heapUsed;
          peakStateBytes = Math.max(peakStateBytes, stateBytes);
          peakHeapUsed = Math.max(peakHeapUsed, heapUsedBytes);
          checkpoints.push({
            turn,
            totalMemories: counts.total,
            activeMemories: counts.active,
            coldMemories: counts.cold,
            stateBytes,
            portableStateBytes,
            heapUsedBytes,
            summaryCalls: summaryClient.callCount,
            injectedFailures: summaryClient.failureCount
          });
          console.log(
            `[long-load] turn ${turn}/${TURN_COUNT}: memories=${counts.total}, active=${counts.active}, ` +
            `stateMiB=${(stateBytes / 1024 / 1024).toFixed(2)}, summaryCalls=${summaryClient.callCount}`
          );
        }

        turnDurations.push(performance.now() - turnStartedAt);
      }

      for (let pass = 1; pass <= 100; pass += 1) {
        const compression = await compressNpcMemories(state, recoveryClient);
        state = compression.state;
        for (const diagnostic of compression.diagnostics) {
          const key = diagnosticKey(diagnostic);
          if (key && diagnostic.code === 'npc_memory_compressed' && pendingFailures.has(key)) {
            failureRecoveryTurns.push(pass);
            pendingFailures.delete(key);
          }
        }
        if (compression.operationCount === 0) break;
      }

      const finalLayers = indexActiveNpcMemories(state.memories, {
        includeHidden: true,
        includePrivate: true
      });
      const finalLayerViolations: Array<Record<string, number | string>> = [];
      let finalActiveMemoryCount = 0;
      for (const actorId of actorIds) {
        const layers = finalLayers.get(actorId) ?? { shortTerm: [], midTerm: [], longTerm: [] };
        const active = countActiveNpcMemories(layers);
        finalActiveMemoryCount += active;
        if (
          layers.shortTerm.length > NPC_MEMORY_ACTIVE_LIMITS.short_term ||
          layers.midTerm.length > NPC_MEMORY_ACTIVE_LIMITS.mid_term ||
          layers.longTerm.length > NPC_MEMORY_ACTIVE_LIMITS.long_term ||
          active > 28
        ) {
          finalLayerViolations.push({
            actorId,
            shortTerm: layers.shortTerm.length,
            midTerm: layers.midTerm.length,
            longTerm: layers.longTerm.length,
            active
          });
        }
      }

      const chains = inspectCompressionChains(state);
      const finalCounts = memoryCounts(state);
      const finalStateBytes = byteLength(state);
      const finalHeap = process.memoryUsage().heapUsed;
      peakStateBytes = Math.max(peakStateBytes, finalStateBytes);
      peakHeapUsed = Math.max(peakHeapUsed, finalHeap);
      const durationMs = performance.now() - startedAt;
      const report = {
        test: 'npc-memory-long-run-technical-load',
        generatedAt: new Date().toISOString(),
        scope: {
          technicalTurns: TURN_COUNT,
          npcCount: NPC_COUNT,
          memoriesPerTurn: MEMORIES_PER_TURN,
          rawMemoryWrites,
          realApiCalls: 0,
          summaryClient: 'deterministic fake with injected failures',
          disclaimer: 'This is a technical state-pipeline load test, not 1000 real-API gameplay turns.'
        },
        compression: {
          summaryCalls: summaryClient.callCount + recoveryClient.callCount,
          mainPhaseSummaryCalls: summaryClient.callCount,
          recoverySummaryCalls: recoveryClient.callCount,
          injectedFailures: summaryClient.failureCount,
          pendingFailuresAfterDrain: pendingFailures.size,
          recoveredFailureCount: failureRecoveryTurns.length,
          maxFailureRecoveryTurns: Math.max(0, ...failureRecoveryTurns),
          transientCapOverflowChecks,
          maxTransientActivePerActor,
          finalLayerViolations,
          finalActiveMemoryCount
        },
        recall: {
          maxMainProjectionEntries: maxProjectionEntries,
          maxMainProjectionTextChars: maxProjectionTextChars,
          maxSimulationEntries,
          vectorMatchSelections,
          projectionCapViolations,
          simulationSubsetViolations
        },
        persistence: {
          indexedDbRoundTrips: persistenceRoundTrips,
          schemaAndPortableRoundTrips: persistenceRoundTrips,
          validationFailures: persistenceValidationFailures,
          initialStoryEntries: initialStoryEntryCount,
          addedStoryEntries: state.storyLog.length - initialStoryEntryCount,
          finalStoryEntries: state.storyLog.length,
          memoryCountRegressions
        },
        memoryIntegrity: {
          finalTotalMemories: finalCounts.total,
          finalActiveMemories: finalCounts.active,
          finalColdMemories: finalCounts.cold,
          ...chains
        },
        performance: {
          durationMs: Math.round(durationMs),
          turnMs: {
            p50: Number(percentile(turnDurations, 0.5).toFixed(2)),
            p95: Number(percentile(turnDurations, 0.95).toFixed(2)),
            p99: Number(percentile(turnDurations, 0.99).toFixed(2)),
            max: Number(Math.max(0, ...turnDurations).toFixed(2))
          },
          baselineHeapBytes: baselineHeap,
          finalHeapBytes: finalHeap,
          peakObservedHeapBytes: peakHeapUsed,
          finalStateBytes,
          peakObservedStateBytes: peakStateBytes
        },
        checkpoints
      };

      const outputDirectory = path.resolve('output', 'npc-memory');
      await mkdir(outputDirectory, { recursive: true });
      const timestamp = report.generatedAt.replace(/[:.]/g, '-');
      const reportPath = path.join(outputDirectory, `long-load-${timestamp}.json`);
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(`[long-load] report: ${reportPath}`);

      expect(rawMemoryWrites).toBe(TURN_COUNT * MEMORIES_PER_TURN);
      expect(summaryClient.callCount + recoveryClient.callCount).toBeGreaterThan(500);
      expect(summaryClient.failureCount).toBeGreaterThan(0);
      expect(pendingFailures.size).toBe(0);
      expect(finalLayerViolations).toHaveLength(0);
      expect(finalActiveMemoryCount).toBeLessThanOrEqual(NPC_COUNT * 28);
      expect(chains.coldSourceCount).toBeGreaterThan(5000);
      expect(chains.coldSourcesWithoutEmbeddingCache).toBe(chains.coldSourceCount);
      expect(chains.missingTargets).toBe(0);
      expect(chains.cycles).toBe(0);
      expect(projectionCapViolations).toBe(0);
      expect(simulationSubsetViolations).toBe(0);
      expect(maxProjectionEntries).toBeLessThanOrEqual(MAX_NPC_MEMORY_ENTRIES);
      expect(maxProjectionTextChars).toBeLessThanOrEqual(MAX_NPC_MEMORY_TOTAL_TEXT_CHARS);
      expect(maxSimulationEntries).toBeLessThanOrEqual(MAX_NPC_SIMULATION_MEMORY_ENTRIES);
      expect(persistenceRoundTrips).toBe(TURN_COUNT / PERSISTENCE_INTERVAL);
      expect(persistenceValidationFailures).toBe(0);
      expect(memoryCountRegressions).toBe(0);
      expect(state.storyLog).toHaveLength(initialStoryEntryCount + TURN_COUNT * 2);
      expect(peakStateBytes).toBeLessThan(64 * 1024 * 1024);
      expect(durationMs).toBeLessThan(180_000);
    } finally {
      await deleteDatabase(dbName);
    }
  });
});
