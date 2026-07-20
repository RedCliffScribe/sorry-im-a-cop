import { z } from 'zod';
import type { RuntimeSaveRecord } from './SaveRepository';

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
    gameTime: gameTimeSchema
  })
  .passthrough();

const runtimeStateSchema = z
  .object({
    runtimeVersion: z.literal(1),
    world: z
      .object({
        worldpackId: z.string().min(1),
        storypackInfluence: z.enum(['off', 'low', 'medium', 'high']),
        openingPressure: z.enum(['relaxed', 'routine', 'standard', 'tense', 'high'])
      })
      .passthrough(),
    time: gameTimeSchema,
    player: playerSchema,
    storyLog: z.array(storyEntrySchema),
    turnCounter: z.number().int().nonnegative()
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
  return saveArchiveSchema.parse(value) as unknown as SaveArchive;
}

export function parseRuntimeSaveRecord(value: unknown): RuntimeSaveRecord {
  return runtimeSaveRecordSchema.parse(value) as unknown as RuntimeSaveRecord;
}
