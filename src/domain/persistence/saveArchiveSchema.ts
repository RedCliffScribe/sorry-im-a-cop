import { z } from 'zod';
import { runtimeCustomContentStateSchema } from '../customContent/saveSchema';
import type { RuntimeSaveRecord } from './SaveRepository';
import { normalizeNarrativeArcs } from '../drama/narrativeArc';
import { storyBlockSchema } from '../runtime/storyBlocks';

const saveDlcBindingSchema = z.object({
  dlcId: z.string().min(1),
  version: z.string().min(1),
  status: z.enum(['active', 'paused', 'completed']),
  planningEnabled: z.boolean().optional(),
  activatedAt: z.string().min(1).optional()
});

export interface SaveArchive {
  version: 1;
  exportedAt?: string;
  saves: RuntimeSaveRecord[];
}

const gameTimeSchema = z
  .object({
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59)
  })
  .passthrough();

const playerSchema = z
  .object({
    actorId: z.string().min(1),
    name: z.string(),
    currentIdentity: z.enum(['civilian', 'gang_member', 'police'])
  })
  .passthrough();

const storyEntrySchema = z
  .object({
    turnId: z.string().min(1),
    speaker: z.enum(['player', 'narrator']),
    text: z.string(),
    gameTime: gameTimeSchema,
    blocks: z.array(storyBlockSchema).optional()
  })
  .passthrough();

const narrativeArcInstanceSchema = z
  .object({
    arcInstanceId: z.string().min(1),
    sourceRef: z
      .object({
        providerId: z.string().min(1),
        sourceType: z.string().min(1),
        sourceId: z.string().min(1),
        dlcId: z.string().min(1).optional()
      })
      .strict(),
    arcType: z.enum(['official_dlc', 'custom_content', 'storypack', 'dynamic_event']),
    status: z.enum(['active', 'paused', 'completed', 'abandoned']),
    currentStageId: z.string().min(1).optional(),
    previousStageId: z.string().min(1).optional(),
    usedNodeIds: z.array(z.string().min(1)),
    createdTurn: z.number().int().nonnegative(),
    lastProgressTurn: z.number().int().nonnegative(),
    writebackRefs: z.array(z.object({ kind: z.string().min(1), id: z.string().min(1) }).strict()),
    lastSummary: z.string().optional()
  })
  .strict();

const runtimeStateSchema = z
  .object({
    runtimeVersion: z.literal(1),
    world: z
      .object({
        worldpackId: z.string().min(1),
        storypackInfluence: z.enum(['off', 'low', 'medium', 'high']),
        openingPressure: z.enum(['relaxed', 'routine', 'standard', 'tense', 'high']),
        screenCharacterSeedsEnabled: z.boolean().optional(),
        dramaticOpeningId: z.string().optional(),
        officialDlcBindings: z.array(saveDlcBindingSchema).optional()
      })
      .passthrough(),
    time: gameTimeSchema,
    player: playerSchema,
    storyLog: z.array(storyEntrySchema),
    turnCounter: z.number().int().nonnegative(),
    narrativeArcs: z.array(narrativeArcInstanceSchema).optional(),
    customContent: runtimeCustomContentStateSchema.optional()
  })
  .passthrough();

const runtimeSaveRecordSchema = z
  .object({
    saveId: z.string().min(1),
    rollbackChainId: z.string().min(1).optional(),
    saveName: z.string(),
    saveKind: z.enum(['manual', 'auto']).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    playerName: z.string(),
    worldpackId: z.string().min(1),
    gameDateLabel: z.string(),
    turnCounter: z.number().int().nonnegative(),
    runtimeState: runtimeStateSchema
  })
  .passthrough();

const saveArchiveSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.string().min(1).optional(),
    saves: z.array(runtimeSaveRecordSchema)
  })
  .passthrough();

export function parseSaveArchive(value: unknown): SaveArchive {
  const parsed = saveArchiveSchema.parse(value) as unknown as SaveArchive;
  return {
    ...parsed,
    saves: parsed.saves.map((save) => ({
      ...save,
      runtimeState: {
        ...save.runtimeState,
        narrativeArcs: normalizeNarrativeArcs(save.runtimeState.narrativeArcs)
      }
    }))
  };
}

export function parseRuntimeSaveRecord(value: unknown): RuntimeSaveRecord {
  const parsed = runtimeSaveRecordSchema.parse(value) as unknown as RuntimeSaveRecord;
  return {
    ...parsed,
    runtimeState: {
      ...parsed.runtimeState,
      narrativeArcs: normalizeNarrativeArcs(parsed.runtimeState.narrativeArcs)
    }
  };
}
