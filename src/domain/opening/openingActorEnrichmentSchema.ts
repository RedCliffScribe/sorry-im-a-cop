import { z } from 'zod';
import type { RuntimeState } from '../runtime/types';
import {
  openingCoreActorSchema,
  type OpeningCoreActor
} from './openingBlueprintSchema';
import type { OpeningRecoveryCode } from './openingFailureClassification';
import { openingActorMemorySeedSchema } from './openingSchema';
import {
  getOpeningActorQualityIssues,
  getOpeningActorQualityRepairPaths
} from './openingBlueprintQualityGate';
import type {
  LockedOpeningCast,
  LockedOpeningCastActor
} from './openingCastDraft';
import {
  resolveOpeningCivilianEmployerContract,
  type OpeningCivilianEmployerDiagnostic,
  type OpeningCivilianEmployerResolutionStatus
} from './openingCivilianEmployerContract';

const enrichmentItemEnvelopeSchema = z
  .object({
    actorSlotId: z.string().min(1),
    profile: z.record(z.string(), z.unknown())
  })
  .strict();

export const openingActorEnrichmentBatchEnvelopeSchema = z
  .object({
    openingSessionId: z.string().min(1),
    actors: z.array(z.unknown()).min(1).max(4)
  })
  .strict();

export const openingActorEnrichmentRepairSchema = z
  .object({
    actorSlotId: z.string().min(1),
    repairs: z
      .array(
        z
          .object({
            path: z.string().min(1),
            value: z
              .unknown()
              .refine((value) => value !== undefined, 'value 必须明确提供')
          })
          .strict()
      )
      .min(1)
      .max(24)
  })
  .strict();

export type OpeningActorEnrichmentRepair = z.infer<
  typeof openingActorEnrichmentRepairSchema
>;

const lockedActorKeys = new Set([
  'actorId',
  'name',
  'gender',
  'currentIdentity',
  'publicIdentity',
  'actualIdentitySummary',
  'playerRoleRelation',
  'organizationIds',
  'positionSummary',
  'presence',
  'currentPlaceId',
  'currentSceneId'
]);

const allowedProfileKeys = new Set([
  'englishName',
  'aliases',
  'callName',
  'birthDate',
  'computedAge',
  'visualAgeAnchor',
  'roleProfiles',
  'profileSummary',
  'appearance',
  'clothing',
  'equipment',
  'personality',
  'speechStyle',
  'motivation',
  'longTermGoal',
  'values',
  'attributes',
  'relationshipSummary',
  'attitudeTowardPlayer',
  'interactionScore',
  'trustTendency',
  'entanglementSummary',
  'longTermMemorySummary',
  'recentInteractionMemory',
  'statusSummary',
  'bodyConditionSummary',
  'visibility',
  'importance',
  'femaleProfile',
  'keyMemories',
  'worldpackActorData'
]);

export interface OpeningActorEnrichmentCandidate {
  actorSlotId: string;
  rawProfile: Record<string, unknown>;
}

export interface OpeningActorEnrichmentValidation {
  actorSlotId: string;
  actor?: OpeningCoreActor;
  issues: string[];
  repairPaths: string[];
  discardedPaths: string[];
  normalizedProfile: Record<string, unknown>;
  keyMemoryDiagnostics: OpeningKeyMemoryNormalizationDiagnostic[];
  recentInteractionMemoryDiagnostics: OpeningKeyMemoryNormalizationDiagnostic[];
  employerContractStatus: OpeningCivilianEmployerResolutionStatus;
  allowedEmployerOrganizationIds: string[];
  employerDiagnostics: OpeningCivilianEmployerDiagnostic[];
}

export interface OpeningKeyMemoryNormalizationDiagnostic {
  code: OpeningRecoveryCode;
  path: Array<string | number>;
  message: string;
}

export interface OpeningKeyMemoryNormalizationResult {
  profile: Record<string, unknown>;
  diagnostics: OpeningKeyMemoryNormalizationDiagnostic[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const keyMemoryTextFields = [
  'text',
  'content',
  'memory',
  'summary',
  'description'
] as const;

function readRecoverableMemoryText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const text = value.trim();
    return text || undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const texts = [
    ...new Set(
      keyMemoryTextFields
        .map((field) =>
          typeof record[field] === 'string' ? record[field].trim() : ''
        )
        .filter(Boolean)
    )
  ];
  return texts.length === 1 ? texts[0] : undefined;
}

export function normalizeOpeningActorRecentInteractionMemory(
  rawProfile: Record<string, unknown>
): OpeningKeyMemoryNormalizationResult {
  const profile = clone(rawProfile);
  const raw = profile.recentInteractionMemory;
  const diagnostics: OpeningKeyMemoryNormalizationDiagnostic[] = [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed && trimmed !== raw) {
      profile.recentInteractionMemory = trimmed;
      diagnostics.push({
        code: 'opening_recent_memory_trimmed',
        path: ['recentInteractionMemory'],
        message: 'recentInteractionMemory 已去除首尾空白。'
      });
    }
    return { profile, diagnostics };
  }
  if (Array.isArray(raw)) {
    const texts = raw.map(readRecoverableMemoryText);
    if (texts.length > 0 && texts.every((text): text is string => Boolean(text))) {
      profile.recentInteractionMemory = [...new Set(texts)].join('；');
      diagnostics.push({
        code: 'opening_recent_memory_array_normalized',
        path: ['recentInteractionMemory'],
        message:
          'recentInteractionMemory 的数组内容已在不新增事实的情况下合并为近期互动摘要。'
      });
    }
    return { profile, diagnostics };
  }
  const text = readRecoverableMemoryText(raw);
  if (text) {
    profile.recentInteractionMemory = text;
    diagnostics.push({
      code: 'opening_recent_memory_alias_normalized',
      path: ['recentInteractionMemory'],
      message:
        'recentInteractionMemory 的明确文字别名已在不改变内容的情况下转换为摘要字符串。'
    });
  }
  return { profile, diagnostics };
}

const visibilityAliases = new Map<string, 'public' | 'player_known' | 'private' | 'hidden'>([
  ['public', 'public'],
  ['player_known', 'player_known'],
  ['private', 'private'],
  ['hidden', 'hidden'],
  ['known', 'player_known'],
  ['playerknown', 'player_known'],
  ['玩家已知', 'player_known'],
  ['public_known', 'public'],
  ['公开', 'public'],
  ['private_memory', 'private'],
  ['私密', 'private'],
  ['secret', 'hidden'],
  ['隐藏', 'hidden']
]);

function normalizeKeyMemoryVisibility(
  value: unknown
): 'public' | 'player_known' | 'private' | 'hidden' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return visibilityAliases.get(normalized);
}

function normalizedImportance(value: unknown): {
  value: number;
  defaulted: boolean;
} {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return { value: 50, defaulted: true };
  const normalized = Math.max(0, Math.min(100, Math.round(parsed)));
  return {
    value: normalized,
    defaulted: value !== normalized
  };
}

export function normalizeOpeningActorKeyMemories(
  rawProfile: Record<string, unknown>
): OpeningKeyMemoryNormalizationResult {
  const profile = clone(rawProfile);
  const diagnostics: OpeningKeyMemoryNormalizationDiagnostic[] = [];
  const rawMemories = profile.keyMemories;

  if (rawMemories === undefined || rawMemories === null) {
    profile.keyMemories = [];
    diagnostics.push({
      code: 'opening_key_memory_defaulted',
      path: ['keyMemories'],
      message: 'keyMemories 缺失或为 null，已归一化为空数组。'
    });
    return { profile, diagnostics };
  }

  if (!Array.isArray(rawMemories)) {
    profile.keyMemories = [];
    diagnostics.push({
      code: 'opening_key_memories_cleared',
      path: ['keyMemories'],
      message: 'keyMemories 不是数组，无法安全解释，已清空该非核心补充。'
    });
    return { profile, diagnostics };
  }

  const normalizedMemories: Array<{
    text: string;
    importance: number;
    visibility: 'public' | 'player_known' | 'private' | 'hidden';
  }> = [];

  rawMemories.forEach((rawMemory, index) => {
    const path = ['keyMemories', index] as Array<string | number>;
    if (typeof rawMemory === 'string') {
      const text = rawMemory.trim();
      if (!text) {
        diagnostics.push({
          code: 'opening_key_memory_item_removed',
          path,
          message: `keyMemories[${index}] 是空字符串，已移除。`
        });
        return;
      }
      normalizedMemories.push({
        text,
        importance: 50,
        visibility: 'player_known'
      });
      diagnostics.push({
        code: 'opening_key_memory_string_normalized',
        path,
        message: `keyMemories[${index}] 为字符串，已在不改变内容的情况下转换为结构化记忆。`
      });
      return;
    }

    if (!rawMemory || typeof rawMemory !== 'object' || Array.isArray(rawMemory)) {
      diagnostics.push({
        code: 'opening_key_memory_item_removed',
        path,
        message: `keyMemories[${index}] 不是可恢复的记忆对象，已移除。`
      });
      return;
    }

    const record = rawMemory as Record<string, unknown>;
    const textCandidates = keyMemoryTextFields
      .map((field) => ({
        field,
        text: typeof record[field] === 'string' ? record[field].trim() : ''
      }))
      .filter((candidate) => candidate.text.length > 0);
    const uniqueTexts = [...new Set(textCandidates.map((candidate) => candidate.text))];
    if (uniqueTexts.length !== 1) {
      diagnostics.push({
        code: 'opening_key_memory_item_removed',
        path,
        message:
          uniqueTexts.length === 0
            ? `keyMemories[${index}] 没有可用文字内容，已移除。`
            : `keyMemories[${index}] 含有冲突的文字字段，无法安全选择，已移除。`
      });
      return;
    }

    const textCandidate = textCandidates.find(
      (candidate) => candidate.text === uniqueTexts[0]
    )!;
    const importance = normalizedImportance(record.importance);
    const hasVisibility = Object.hasOwn(record, 'visibility');
    const visibility = hasVisibility
      ? normalizeKeyMemoryVisibility(record.visibility)
      : 'player_known';
    if (!visibility) {
      diagnostics.push({
        code: 'opening_key_memory_item_removed',
        path: [...path, 'visibility'],
        message: `keyMemories[${index}] 的 visibility 无法安全识别，已移除以避免泄露私密记忆。`
      });
      return;
    }

    const normalized = {
      text: uniqueTexts[0],
      importance: importance.value,
      visibility
    };
    const strictlyValid = openingActorMemorySeedSchema.safeParse(rawMemory);
    normalizedMemories.push(
      strictlyValid.success && JSON.stringify(strictlyValid.data) === JSON.stringify(rawMemory)
        ? clone(rawMemory as typeof normalized)
        : normalized
    );
    if (textCandidate.field !== 'text') {
      diagnostics.push({
        code: 'opening_key_memory_alias_normalized',
        path,
        message: `keyMemories[${index}].${textCandidate.field} 已确定性转换为 text。`
      });
    }
    if (importance.defaulted || !hasVisibility) {
      diagnostics.push({
        code: 'opening_key_memory_defaulted',
        path,
        message: `keyMemories[${index}] 的非核心元数据已补为安全默认值或合法范围。`
      });
    }
  });

  profile.keyMemories = normalizedMemories;
  if (rawMemories.length > 0 && normalizedMemories.length === 0) {
    diagnostics.push({
      code: 'opening_key_memories_cleared',
      path: ['keyMemories'],
      message: 'keyMemories 中没有可安全恢复的项目，已清空；人物其他记忆摘要保持不变。'
    });
  }
  return { profile, diagnostics };
}

function formatZodIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.join('.') || 'profile';
  return issue.code === 'invalid_type'
    ? `${path}：必填字段缺失或类型非法（${issue.message}）`
    : `${path}：${issue.message}`;
}

function normalizePath(path: PropertyKey[]): string {
  return path.map(String).join('.');
}

function createFullActorCandidate(
  locked: LockedOpeningCastActor,
  rawProfile: Record<string, unknown>
): { candidate: Record<string, unknown>; discardedPaths: string[] } {
  const profile = clone(rawProfile);
  const discardedPaths: string[] = [];
  for (const key of Object.keys(profile)) {
    if (allowedProfileKeys.has(key)) continue;
    delete profile[key];
    discardedPaths.push(
      lockedActorKeys.has(key)
        ? `${key}（本地锁定字段）`
        : `${key}（未授权字段）`
    );
  }

  return {
    candidate: {
      actorId: locked.actorId,
      name: locked.name,
      gender: locked.gender,
      currentIdentity: locked.currentIdentity,
      publicIdentity: locked.publicIdentity,
      actualIdentitySummary: locked.actualIdentitySummary,
      playerRoleRelation: locked.playerRoleRelation,
      organizationIds: locked.organizationIds,
      positionSummary: locked.positionSummary,
      presence: locked.presence,
      currentPlaceId: locked.currentPlaceId,
      currentSceneId: locked.currentSceneId,
      profileSummary: locked.profileSummary,
      personality: locked.personality,
      speechStyle: locked.speechStyle,
      motivation: locked.motivation,
      ...profile
    },
    discardedPaths
  };
}

export function readOpeningActorEnrichmentCandidates(
  raw: unknown,
  openingSessionId: string
): OpeningActorEnrichmentCandidate[] {
  const envelope = openingActorEnrichmentBatchEnvelopeSchema.parse(raw);
  if (envelope.openingSessionId !== openingSessionId) {
    throw new Error('人物补全 openingSessionId 与本地开局会话不一致');
  }
  return envelope.actors.map((item) => {
    const parsed = enrichmentItemEnvelopeSchema.parse(item);
    return {
      actorSlotId: parsed.actorSlotId,
      rawProfile: parsed.profile
    };
  });
}

export function validateOpeningActorEnrichment(
  candidate: OpeningActorEnrichmentCandidate,
  cast: LockedOpeningCast,
  state: RuntimeState
): OpeningActorEnrichmentValidation {
  const locked = cast.actors.find(
    (actor) => actor.slotId === candidate.actorSlotId
  );
  if (!locked) {
    return {
      actorSlotId: candidate.actorSlotId,
      issues: ['actorSlotId：引用了未授权人物槽位'],
      repairPaths: [],
      discardedPaths: [],
      normalizedProfile: clone(candidate.rawProfile),
      keyMemoryDiagnostics: [],
      recentInteractionMemoryDiagnostics: [],
      employerContractStatus: 'not_applicable',
      allowedEmployerOrganizationIds: [],
      employerDiagnostics: []
    };
  }

  const keyMemoryNormalization = normalizeOpeningActorKeyMemories(
    candidate.rawProfile
  );
  const recentMemoryNormalization =
    normalizeOpeningActorRecentInteractionMemory(
      keyMemoryNormalization.profile
    );
  const full = createFullActorCandidate(
    locked,
    recentMemoryNormalization.profile
  );
  const parsed = openingCoreActorSchema.safeParse(full.candidate);
  if (!parsed.success) {
    return {
      actorSlotId: candidate.actorSlotId,
      issues: parsed.error.issues.map(formatZodIssue),
      repairPaths: [
        ...new Set(
          parsed.error.issues
            .map((issue) => normalizePath(issue.path))
            .filter((path) => allowedProfileKeys.has(path.split('.')[0]))
        )
      ],
      discardedPaths: full.discardedPaths,
      normalizedProfile: recentMemoryNormalization.profile,
      keyMemoryDiagnostics: keyMemoryNormalization.diagnostics,
      recentInteractionMemoryDiagnostics:
        recentMemoryNormalization.diagnostics,
      employerContractStatus: 'not_applicable',
      allowedEmployerOrganizationIds: [],
      employerDiagnostics: []
    };
  }

  const employerResolution = resolveOpeningCivilianEmployerContract({
    actor: parsed.data,
    state
  });
  const qualityIssues = getOpeningActorQualityIssues(
    employerResolution.actor,
    state,
    new Set([
      ...Object.keys(state.actors),
      ...cast.actors.map((candidate) => candidate.actorId)
    ])
  );
  const repairPaths = getOpeningActorQualityRepairPaths(
    employerResolution.actor,
    qualityIssues
  );
  if (employerResolution.status === 'upstream_contract_invalid') {
    const employerPath = 'roleProfiles.civilian.employerOrganizationId';
    const index = repairPaths.indexOf(employerPath);
    if (index >= 0) repairPaths.splice(index, 1);
  }
  return {
    actorSlotId: candidate.actorSlotId,
    actor: qualityIssues.length === 0 ? employerResolution.actor : undefined,
    issues: qualityIssues,
    repairPaths,
    discardedPaths: full.discardedPaths,
    normalizedProfile: recentMemoryNormalization.profile,
    keyMemoryDiagnostics: keyMemoryNormalization.diagnostics,
    recentInteractionMemoryDiagnostics:
      recentMemoryNormalization.diagnostics,
    employerContractStatus: employerResolution.status,
    allowedEmployerOrganizationIds:
      employerResolution.allowedEmployerOrganizationIds,
    employerDiagnostics: employerResolution.diagnostics
  };
}

function pathSegments(path: string): Array<string | number> {
  return path.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function writePath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = pathSegments(path);
  let current: unknown = target;
  for (const segment of segments.slice(0, -1)) {
    if (!current || typeof current !== 'object') {
      throw new Error(`无法定位人物补全修复字段 ${path}`);
    }
    const record = current as Record<string | number, unknown>;
    if (!record[segment] || typeof record[segment] !== 'object') {
      record[segment] = {};
    }
    current = record[segment];
  }
  (current as Record<string | number, unknown>)[segments.at(-1)!] = clone(value);
}

function readPath(
  source: unknown,
  path: string
): { found: boolean; value?: unknown } {
  let current = source;
  for (const segment of pathSegments(path)) {
    if (!current || typeof current !== 'object') return { found: false };
    const record = current as Record<string | number, unknown>;
    if (!(segment in record)) return { found: false };
    current = record[segment];
  }
  return { found: true, value: current };
}

export function createOpeningActorEnrichmentRepairStateSignature(
  rawProfile: Record<string, unknown>,
  repairPaths: readonly string[]
): string {
  return JSON.stringify(
    [...repairPaths]
      .sort()
      .map((path) => {
        const result = readPath(rawProfile, path);
        return [path, result.found ? result.value : '__missing__'];
      })
  );
}

export function applyOpeningActorEnrichmentRepair(
  rawProfile: Record<string, unknown>,
  rawRepair: unknown,
  actorSlotId: string,
  allowedPaths: readonly string[]
): Record<string, unknown> {
  const repair = openingActorEnrichmentRepairSchema.parse(rawRepair);
  if (repair.actorSlotId !== actorSlotId) {
    throw new Error('人物补全修复返回了其他 actorSlotId');
  }
  const allowed = new Set(
    allowedPaths.filter((path) => allowedProfileKeys.has(path.split('.')[0]))
  );
  const result = clone(rawProfile);
  const applied = new Map<string, unknown>();
  const applyAuthorizedPath = (path: string, value: unknown) => {
    if (applied.has(path)) {
      if (JSON.stringify(applied.get(path)) !== JSON.stringify(value)) {
        throw new Error(`人物补全修复对同一路径返回了冲突值：${path}`);
      }
      return;
    }
    applied.set(path, value);
    writePath(result, path, value);
  };
  for (const item of repair.repairs) {
    const path = item.path.replace(/^profile\./, '');
    if (allowed.has(path)) {
      applyAuthorizedPath(path, item.value);
      continue;
    }

    const authorizedDescendants = [...allowed].filter((allowedPath) =>
      allowedPath.startsWith(`${path}.`)
    );
    let projected = false;
    for (const allowedPath of authorizedDescendants) {
      const relativePath = allowedPath.slice(path.length + 1);
      const nested = readPath(item.value, relativePath);
      if (!nested.found) continue;
      applyAuthorizedPath(allowedPath, nested.value);
      projected = true;
    }
    if (projected) continue;

    const authorizedAncestor = [...allowed].find((allowedPath) =>
      path.startsWith(`${allowedPath}.`)
    );
    if (authorizedAncestor) {
      applyAuthorizedPath(path, item.value);
      continue;
    }

    if (!path.includes('.')) {
      const uniqueLeafMatch = [...allowed].filter(
        (allowedPath) => allowedPath.split('.').at(-1) === path
      );
      if (uniqueLeafMatch.length === 1) {
        applyAuthorizedPath(uniqueLeafMatch[0], item.value);
        continue;
      }
    }

    // A provider may echo a sibling field even though the repair prompt only
    // authorizes another path. Discard it and let the bounded validation loop
    // request any still-missing field again; never apply the unauthorized data.
  }
  return result;
}

export function extractOpeningActorEnrichmentProfile(
  actor: OpeningCoreActor
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(actor)
      .filter(([key]) => allowedProfileKeys.has(key))
      .map(([key, value]) => [key, clone(value)])
  );
}
