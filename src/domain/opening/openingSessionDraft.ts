import { z } from 'zod';
import type { OpeningSetup } from '../runtime/initialState';
import {
  openingCastDraftSchema,
  type OpeningCastDraft
} from './openingCastDraft';
import {
  openingBlueprintSchema,
  openingCoreActorSchema,
  type OpeningCoreActor
} from './openingBlueprintSchema';
import {
  openingLocalSkeletonSchema,
  type OpeningLocalSkeleton
} from './openingLocalSkeleton';
import { openingInitializationSchema } from './openingInitializationSchema';
import {
  openingRecoveryCodeSchema,
  openingFailureCodeSchema,
  type OpeningDiagnosticStage
} from './openingFailureClassification';

export const openingSessionStageSchema = z.enum([
  'skeleton_ready',
  'cast_ready',
  'profiles_ready',
  'narrative_ready',
  'runtime_ready',
  'committed'
]);

export type OpeningSessionStage = z.infer<typeof openingSessionStageSchema>;

export const openingStageDiagnosticSchema = z
  .object({
    diagnosticId: z.string().min(1),
    requestId: z.string().min(1).optional(),
    stage: z.enum([
      'skeleton',
      'cast',
      'profiles',
      'narrative',
      'runtime',
      'consistency',
      'commit'
    ]),
    status: z.enum(['started', 'succeeded', 'recovered', 'failed']),
    occurredAt: z.string().datetime(),
    code: z
      .union([openingFailureCodeSchema, openingRecoveryCodeSchema])
      .optional(),
    path: z.array(z.union([z.string(), z.number().int()])).optional(),
    message: z.string().min(1)
  })
  .strict();

export type OpeningStageDiagnostic = z.infer<
  typeof openingStageDiagnosticSchema
>;

const pendingActorProfileSchema = z
  .object({
    status: z.literal('pending'),
    actorSlotId: z.string().min(1),
    actorId: z.string().min(1)
  })
  .strict();

const readyActorProfileSchema = z
  .object({
    status: z.literal('ready'),
    actorSlotId: z.string().min(1),
    actorId: z.string().min(1),
    profile: openingCoreActorSchema
  })
  .strict();

export const openingActorProfileCheckpointSchema = z.discriminatedUnion(
  'status',
  [pendingActorProfileSchema, readyActorProfileSchema]
);

export type OpeningActorProfileCheckpoint = z.infer<
  typeof openingActorProfileCheckpointSchema
>;

export const openingNarrativeDraftSchema = z
  .object({
    openingSessionId: z.string().min(1),
    narrativeText: z.string().min(1),
    presentationHints: openingInitializationSchema.shape.presentationHints,
    suggestedActions: z
      .array(
        z
          .object({
            actionId: z.string().min(1),
            text: z.string().min(1)
          })
          .strict()
      )
      .min(2)
      .max(4),
    dramaExecutionTrace: z.unknown().optional()
  })
  .strict();

export type OpeningNarrativeDraft = z.infer<
  typeof openingNarrativeDraftSchema
>;

export const openingRuntimeDraftSchema = openingInitializationSchema
  .omit({
    narrativeText: true,
    presentationHints: true,
    suggestedActions: true,
    dramaExecutionTrace: true
  })
  .extend({
    playerPresentationPatch:
      openingBlueprintSchema.shape.playerPresentationPatch
  });

export type OpeningRuntimeDraft = z.infer<typeof openingRuntimeDraftSchema>;

const stageOrder: Record<OpeningSessionStage, number> = {
  skeleton_ready: 0,
  cast_ready: 1,
  profiles_ready: 2,
  narrative_ready: 3,
  runtime_ready: 4,
  committed: 5
};

export const openingSessionDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    openingSessionId: z.string().min(1),
    setupHash: z.string().min(1),
    worldpackId: z.string().min(1),
    stage: openingSessionStageSchema,
    skeleton: openingLocalSkeletonSchema,
    castDraft: openingCastDraftSchema.optional(),
    actorProfiles: z.record(
      z.string().min(1),
      openingActorProfileCheckpointSchema
    ),
    narrativeDraft: openingNarrativeDraftSchema.optional(),
    runtimeDraft: openingRuntimeDraftSchema.optional(),
    diagnostics: z.array(openingStageDiagnosticSchema).max(200),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict()
  .superRefine((draft, context) => {
    if (
      draft.openingSessionId !== draft.skeleton.openingSessionId ||
      draft.worldpackId !== draft.skeleton.worldpackId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['skeleton'],
        message: '草稿头与本地骨架标识不一致'
      });
    }
    if (
      draft.castDraft &&
      draft.castDraft.openingSessionId !== draft.openingSessionId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['castDraft', 'openingSessionId'],
        message: '最小人物蓝图不属于当前开局会话'
      });
    }
    if (
      draft.narrativeDraft &&
      draft.narrativeDraft.openingSessionId !== draft.openingSessionId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['narrativeDraft', 'openingSessionId'],
        message: '正文草稿不属于当前开局会话'
      });
    }
    if (
      draft.runtimeDraft &&
      draft.runtimeDraft.openingSessionId !== draft.openingSessionId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['runtimeDraft', 'openingSessionId'],
        message: '运行态草稿不属于当前开局会话'
      });
    }

    const order = stageOrder[draft.stage];
    if (order >= stageOrder.cast_ready && !draft.castDraft) {
      context.addIssue({
        code: 'custom',
        path: ['castDraft'],
        message: 'cast_ready 之后必须保留最小人物蓝图'
      });
    }
    const castSlotIds = new Set(
      draft.castDraft?.actors.map((actor) => actor.slotId) ?? []
    );
    for (const [slotId, checkpoint] of Object.entries(draft.actorProfiles)) {
      if (slotId !== checkpoint.actorSlotId) {
        context.addIssue({
          code: 'custom',
          path: ['actorProfiles', slotId],
          message: '人物档案字典键与 actorSlotId 不一致'
        });
      }
      if (draft.castDraft && !castSlotIds.has(slotId)) {
        context.addIssue({
          code: 'custom',
          path: ['actorProfiles', slotId],
          message: '人物档案引用了不在最小蓝图中的槽位'
        });
      }
      if (
        checkpoint.status === 'ready' &&
        checkpoint.profile.actorId !== checkpoint.actorId
      ) {
        context.addIssue({
          code: 'custom',
          path: ['actorProfiles', slotId, 'profile', 'actorId'],
          message: '完整人物档案不得更改本地稳定 actorId'
        });
      }
    }
    if (order >= stageOrder.profiles_ready) {
      const allProfilesReady =
        castSlotIds.size > 0 &&
        [...castSlotIds].every(
          (slotId) => draft.actorProfiles[slotId]?.status === 'ready'
        );
      if (!allProfilesReady) {
        context.addIssue({
          code: 'custom',
          path: ['actorProfiles'],
          message: 'profiles_ready 之后蓝图内每名人物都必须完成独立档案'
        });
      }
    }
    if (order >= stageOrder.narrative_ready && !draft.narrativeDraft) {
      context.addIssue({
        code: 'custom',
        path: ['narrativeDraft'],
        message: 'narrative_ready 之后必须保留正文草稿'
      });
    }
    if (order >= stageOrder.runtime_ready && !draft.runtimeDraft) {
      context.addIssue({
        code: 'custom',
        path: ['runtimeDraft'],
        message: 'runtime_ready 之后必须保留运行态草稿'
      });
    }
  });

export type OpeningSessionDraft = z.infer<typeof openingSessionDraftSchema>;

function normalizeForHash(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (typeof value !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, child]) => {
        const normalized = normalizeForHash(child);
        return normalized === undefined ? [] : [[key, normalized]];
      })
  );
}

export function canonicalizeOpeningSetup(setup: OpeningSetup): string {
  return JSON.stringify(normalizeForHash(setup));
}

export async function createOpeningSetupHash(
  setup: OpeningSetup
): Promise<string> {
  const input = new TextEncoder().encode(canonicalizeOpeningSetup(setup));
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
  }

  let hash = 0x811c9dc5;
  for (const byte of input) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export async function createOpeningSessionDraft({
  setup,
  skeleton,
  now = new Date().toISOString()
}: {
  setup: OpeningSetup;
  skeleton: OpeningLocalSkeleton;
  now?: string;
}): Promise<OpeningSessionDraft> {
  return openingSessionDraftSchema.parse({
    schemaVersion: 1,
    openingSessionId: skeleton.openingSessionId,
    setupHash: await createOpeningSetupHash(setup),
    worldpackId: skeleton.worldpackId,
    stage: 'skeleton_ready',
    skeleton,
    actorProfiles: {},
    diagnostics: [],
    createdAt: now,
    updatedAt: now
  });
}

function assertCanAdvance(
  current: OpeningSessionStage,
  next: OpeningSessionStage
): void {
  if (stageOrder[next] < stageOrder[current]) {
    throw new Error(`开局阶段不能从 ${current} 回退到 ${next}`);
  }
}

function stableActorIdForSlot(
  skeleton: OpeningLocalSkeleton,
  slotId: string
): string {
  const slot = skeleton.actorSlots.find((candidate) => candidate.slotId === slotId);
  if (!slot) throw new Error(`未知开局人物槽位 ${slotId}`);
  return slot.actorId;
}

export function saveOpeningCastCheckpoint(
  draft: OpeningSessionDraft,
  castDraft: OpeningCastDraft,
  now = new Date().toISOString()
): OpeningSessionDraft {
  assertCanAdvance(draft.stage, 'cast_ready');
  const actorProfiles = Object.fromEntries(
    castDraft.actors.map((actor) => {
      const existing = draft.actorProfiles[actor.slotId];
      return [
        actor.slotId,
        existing ?? {
          status: 'pending',
          actorSlotId: actor.slotId,
          actorId: stableActorIdForSlot(draft.skeleton, actor.slotId)
        }
      ];
    })
  );
  return openingSessionDraftSchema.parse({
    ...draft,
    stage: stageOrder[draft.stage] > stageOrder.cast_ready ? draft.stage : 'cast_ready',
    castDraft,
    actorProfiles,
    updatedAt: now
  });
}

export function saveOpeningActorProfileCheckpoint(
  draft: OpeningSessionDraft,
  actorSlotId: string,
  profile: OpeningCoreActor,
  now = new Date().toISOString()
): OpeningSessionDraft {
  if (!draft.castDraft) throw new Error('必须先完成最小人物蓝图');
  const actorId = stableActorIdForSlot(draft.skeleton, actorSlotId);
  const actorProfiles = {
    ...draft.actorProfiles,
    [actorSlotId]: {
      status: 'ready' as const,
      actorSlotId,
      actorId,
      profile
    }
  };
  const allReady = draft.castDraft.actors.every(
    (actor) => actorProfiles[actor.slotId]?.status === 'ready'
  );
  const nextStage =
    allReady && stageOrder[draft.stage] < stageOrder.profiles_ready
      ? 'profiles_ready'
      : draft.stage;
  assertCanAdvance(draft.stage, nextStage);
  return openingSessionDraftSchema.parse({
    ...draft,
    stage: nextStage,
    actorProfiles,
    updatedAt: now
  });
}

export function saveOpeningNarrativeCheckpoint(
  draft: OpeningSessionDraft,
  narrativeDraft: OpeningNarrativeDraft,
  now = new Date().toISOString()
): OpeningSessionDraft {
  assertCanAdvance(draft.stage, 'narrative_ready');
  return openingSessionDraftSchema.parse({
    ...draft,
    stage:
      stageOrder[draft.stage] > stageOrder.narrative_ready
        ? draft.stage
        : 'narrative_ready',
    narrativeDraft,
    updatedAt: now
  });
}

export function saveOpeningRuntimeCheckpoint(
  draft: OpeningSessionDraft,
  runtimeDraft: OpeningRuntimeDraft,
  now = new Date().toISOString()
): OpeningSessionDraft {
  assertCanAdvance(draft.stage, 'runtime_ready');
  return openingSessionDraftSchema.parse({
    ...draft,
    stage:
      stageOrder[draft.stage] > stageOrder.runtime_ready
        ? draft.stage
        : 'runtime_ready',
    runtimeDraft,
    updatedAt: now
  });
}

export function markOpeningSessionCommitted(
  draft: OpeningSessionDraft,
  now = new Date().toISOString()
): OpeningSessionDraft {
  assertCanAdvance(draft.stage, 'committed');
  return openingSessionDraftSchema.parse({
    ...draft,
    stage: 'committed',
    updatedAt: now
  });
}

export function appendOpeningStageDiagnostic(
  draft: OpeningSessionDraft,
  diagnostic: OpeningStageDiagnostic
): OpeningSessionDraft {
  return openingSessionDraftSchema.parse({
    ...draft,
    diagnostics: [...draft.diagnostics, diagnostic].slice(-200),
    updatedAt: diagnostic.occurredAt
  });
}

export function createOpeningStageDiagnostic({
  stage,
  status,
  message,
  code,
  requestId,
  path,
  occurredAt = new Date().toISOString()
}: {
  stage: OpeningDiagnosticStage;
  status: OpeningStageDiagnostic['status'];
  message: string;
  code?: OpeningStageDiagnostic['code'];
  requestId?: string;
  path?: OpeningStageDiagnostic['path'];
  occurredAt?: string;
}): OpeningStageDiagnostic {
  const diagnosticId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? `opening_diag_${globalThis.crypto.randomUUID()}`
      : `opening_diag_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return openingStageDiagnosticSchema.parse({
    diagnosticId,
    requestId,
    stage,
    status,
    occurredAt,
    code,
    path,
    message
  });
}
