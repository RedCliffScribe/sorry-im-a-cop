import { z } from 'zod';
import { resolveOpeningCustomContentSupport } from '../drama/customContentProviders';
import type { RuntimeState } from '../runtime/types';
import { validateOpeningDramaPlan } from './openingDrama';
import {
  openingLocalSkeletonSchema,
  openingPlayerRoleRelationSchema,
  type OpeningLocalSkeleton
} from './openingLocalSkeleton';

const optionalNonEmptyStringSchema = z.preprocess(
  (value) =>
    value === null || (typeof value === 'string' && value.trim().length === 0)
      ? undefined
      : value,
  z.string().min(1).optional()
);

export const openingCastActorSchema = z
  .object({
    slotId: z.string().min(1),
    name: z.string().min(1),
    gender: z.enum(['male', 'female', 'nonbinary']),
    currentIdentity: z.enum(['civilian', 'gang_member', 'police']),
    publicIdentity: z.string().min(1),
    actualIdentitySummary: z.string().min(1),
    playerRoleRelation: openingPlayerRoleRelationSchema.optional(),
    organizationIds: z.array(z.string().min(1)),
    positionSummary: z.string().min(1),
    profileSummary: z.string().min(1),
    personality: z.string().min(1),
    speechStyle: z.string().min(1),
    motivation: z.string().min(1),
    presence: z.enum(['present', 'nearby', 'mentioned', 'absent']),
    currentPlaceId: optionalNonEmptyStringSchema,
    currentSceneId: optionalNonEmptyStringSchema
  })
  .strict()
  .superRefine((actor, context) => {
    const projected = actor.presence === 'present' || actor.presence === 'nearby';
    if (projected && !actor.currentPlaceId) {
      context.addIssue({
        code: 'custom',
        path: ['currentPlaceId'],
        message: 'present/nearby 人物必须填写 currentPlaceId'
      });
    }
    if (projected && !actor.currentSceneId) {
      context.addIssue({
        code: 'custom',
        path: ['currentSceneId'],
        message: 'present/nearby 人物必须填写 currentSceneId'
      });
    }
    if (!actor.currentPlaceId && actor.currentSceneId) {
      context.addIssue({
        code: 'custom',
        path: ['currentSceneId'],
        message: '填写 currentSceneId 时必须同时填写 currentPlaceId'
      });
    }
  });

export const openingCastDraftSchema = z
  .object({
    openingSessionId: z.string().min(1),
    openingFacts: z
      .object({
        situationSummary: z.string().min(1),
        centralMatter: z.string().min(1),
        playerDecisionBoundary: z.string().min(1)
      })
      .strict(),
    actors: z.array(openingCastActorSchema).min(1).max(4),
    actionIntents: z
      .array(
        z
          .object({
            actionId: z.string().min(1),
            intent: z.string().min(1),
            relatedActorSlotIds: z.array(z.string().min(1)),
            requiredFacts: z.array(z.string().min(1))
          })
          .strict()
      )
      .min(2)
      .max(4),
    dramaPlan: z.unknown().optional()
  })
  .strict();

export type OpeningCastActor = z.infer<typeof openingCastActorSchema>;
export type OpeningCastDraft = z.infer<typeof openingCastDraftSchema>;

export interface LockedOpeningCastActor extends OpeningCastActor {
  actorId: string;
}

export interface LockedOpeningCast {
  openingSessionId: string;
  openingFacts: OpeningCastDraft['openingFacts'];
  actors: LockedOpeningCastActor[];
  actionIntents: OpeningCastDraft['actionIntents'];
  dramaPlan?: unknown;
}

export class OpeningCastContractError extends Error {
  constructor(readonly issues: string[]) {
    super(`最小人物蓝图未通过本地骨架合同：${issues.join('；')}`);
    this.name = 'OpeningCastContractError';
  }
}

export interface OpeningCastRepairIssue {
  path: string;
  message: string;
}

export interface OpeningCastNormalizationResult {
  value: unknown;
  changes: string[];
}

const relationAliases: Record<string, z.infer<typeof openingPlayerRoleRelationSchema>> = {
  supervisor: 'police_supervisor',
  police_supervisor: 'police_supervisor',
  'police-supervisor': 'police_supervisor',
  上司: 'police_supervisor',
  直属上司: 'police_supervisor',
  peer: 'police_peer',
  colleague: 'police_peer',
  police_peer: 'police_peer',
  'police-peer': 'police_peer',
  同僚: 'police_peer',
  同事: 'police_peer',
  patron: 'triad_patron',
  triad_patron: 'triad_patron',
  'triad-patron': 'triad_patron',
  上线: 'triad_patron',
  triad_peer: 'triad_peer',
  'triad-peer': 'triad_peer',
  同组成员: 'triad_peer',
  civilian_work_relation: 'civilian_work_relation',
  'civilian-work-relation': 'civilian_work_relation',
  工作关系: 'civilian_work_relation',
  civilian_social_relation: 'civilian_social_relation',
  'civilian-social-relation': 'civilian_social_relation',
  社会关系: 'civilian_social_relation',
  社交关系: 'civilian_social_relation'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimNonEmptyString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeStringArray(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ];
}

function pushChange(changes: string[], message: string): void {
  if (!changes.includes(message)) changes.push(message);
}

function normalizeRelation(
  value: unknown
): z.infer<typeof openingPlayerRoleRelationSchema> | undefined | unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  const normalizedValue = value.trim().toLocaleLowerCase();
  if (!normalizedValue || ['none', 'null', '无', '没有', '不适用'].includes(normalizedValue)) {
    return undefined;
  }
  return relationAliases[normalizedValue] ?? value.trim();
}

function normalizeLockedCharacterGender(
  value: string
): 'male' | 'female' | 'nonbinary' | undefined {
  const normalizedValue = value.trim().toLocaleLowerCase();
  if (['male', 'man', '男', '男性'].includes(normalizedValue)) return 'male';
  if (['female', 'woman', '女', '女性'].includes(normalizedValue)) {
    return 'female';
  }
  if (
    ['nonbinary', 'non-binary', '非二元', '非二元性别'].includes(
      normalizedValue
    )
  ) {
    return 'nonbinary';
  }
  return undefined;
}

function getLockedCustomCharacter(
  state: RuntimeState,
  runtimeActorId: string
) {
  const customContent = state.customContent;
  if (!customContent) return undefined;
  const adaptation = Object.values(
    customContent.characterAdaptations
  ).find(
    (candidate) =>
      candidate.runtimeActorId === runtimeActorId &&
      candidate.worldpackId === state.world.worldpackId &&
      candidate.status === 'ready'
  );
  if (!adaptation) return undefined;
  const binding = customContent.characterBindings.find(
    (candidate) =>
      candidate.assetKind === 'character' &&
      candidate.assetId === adaptation.characterAssetId &&
      candidate.revision === adaptation.sourceRevision
  );
  return binding ? { adaptation, revision: binding.payload } : undefined;
}

export function normalizeOpeningCastCandidate(
  raw: unknown,
  skeleton: OpeningLocalSkeleton,
  state: RuntimeState
): OpeningCastNormalizationResult {
  openingLocalSkeletonSchema.parse(skeleton);
  if (!isRecord(raw)) return { value: raw, changes: [] };

  const changes: string[] = [];
  const normalizedCast: Record<string, unknown> = { ...raw };
  if (normalizedCast.openingSessionId !== skeleton.openingSessionId) {
    normalizedCast.openingSessionId = skeleton.openingSessionId;
    pushChange(changes, '使用本地 openingSessionId 覆盖模型回显');
  }

  const slots = new Map(skeleton.actorSlots.map((slot) => [slot.slotId, slot]));
  if (Array.isArray(normalizedCast.actors)) {
    const seenSlots = new Set<string>();
    normalizedCast.actors = normalizedCast.actors.flatMap((entry) => {
      if (!isRecord(entry)) return [entry];
      const actor: Record<string, unknown> = { ...entry };
      actor.slotId = trimNonEmptyString(actor.slotId);
      const slotId = typeof actor.slotId === 'string' ? actor.slotId : undefined;
      const slot = slotId ? slots.get(slotId) : undefined;
      if (slotId && !slot) {
        pushChange(changes, `移除未授权人物槽位 ${slotId}`);
        return [];
      }
      if (slotId && seenSlots.has(slotId)) {
        pushChange(changes, `移除重复人物槽位 ${slotId}`);
        return [];
      }
      if (slotId) seenSlots.add(slotId);

      if ('actorId' in actor) {
        delete actor.actorId;
        pushChange(changes, `${slotId ?? '未知槽位'} 移除模型提供的 actorId`);
      }

      const lockedCustomCharacter = slot
        ? getLockedCustomCharacter(state, slot.actorId)
        : undefined;
      if (lockedCustomCharacter) {
        const { adaptation, revision } = lockedCustomCharacter;
        actor.name = revision.displayName;
        actor.publicIdentity = adaptation.adaptedPublicIdentity;
        actor.actualIdentitySummary = adaptation.adaptedBackgroundSummary;
        actor.positionSummary =
          adaptation.adaptedOccupation ||
          adaptation.adaptedSocialPosition;
        actor.profileSummary = revision.profileSummary;
        if (revision.corePersonality.length > 0) {
          actor.personality = revision.corePersonality.join('；');
        }
        if (revision.coreMotivations.length > 0) {
          actor.motivation = revision.coreMotivations.join('；');
        }
        if (revision.sourceProfile?.speechStyle?.trim()) {
          actor.speechStyle = revision.sourceProfile.speechStyle.trim();
        }
        const lockedGender = normalizeLockedCharacterGender(
          revision.gender
        );
        if (lockedGender) actor.gender = lockedGender;
        actor.organizationIds = [...adaptation.adaptedOrganizationRefs];
        const hasIdentityOrganization =
          adaptation.adaptedOrganizationRefs.some((organizationId) => {
            const organization = state.organizations[organizationId];
            return (
              organization?.type === 'police_force' ||
              organization?.type === 'triad'
            );
          });
        if (!hasIdentityOrganization) {
          actor.currentIdentity = 'civilian';
        }
        pushChange(
          changes,
          `${slotId ?? '未知槽位'} 使用第一幕自定义人物的锁定档案`
        );
      }

      for (const key of [
        'name',
        'publicIdentity',
        'actualIdentitySummary',
        'positionSummary',
        'profileSummary',
        'personality',
        'speechStyle',
        'motivation',
        'currentPlaceId',
        'currentSceneId'
      ]) {
        actor[key] = trimNonEmptyString(actor[key]);
      }

      const relation = normalizeRelation(actor.playerRoleRelation);
      if (slot?.allowedPlayerRoleRelations.length === 0) {
        if (actor.playerRoleRelation !== undefined) {
          pushChange(changes, `${slot.slotId} 移除不适用的 playerRoleRelation`);
        }
        delete actor.playerRoleRelation;
      } else if (slot?.allowedPlayerRoleRelations.length === 1) {
        const requiredRelation = slot.allowedPlayerRoleRelations[0];
        if (relation !== requiredRelation) {
          pushChange(
            changes,
            `${slot.slotId} 使用本地唯一关系 ${requiredRelation}`
          );
        }
        actor.playerRoleRelation = requiredRelation;
      } else if (relation === undefined) {
        delete actor.playerRoleRelation;
      } else {
        if (relation !== actor.playerRoleRelation) {
          pushChange(changes, `${slotId ?? '未知槽位'} 规范化 playerRoleRelation`);
        }
        actor.playerRoleRelation = relation;
      }

      if (
        slot &&
        slot.allowedPlayerRoleRelations.length > 0 &&
        actor.currentIdentity !== skeleton.playerIdentity
      ) {
        actor.currentIdentity = skeleton.playerIdentity;
        pushChange(
          changes,
          `${slot.slotId} 使用本地身份关系槽位对应的 currentIdentity`
        );
      }

      const organizationIds = normalizeStringArray(actor.organizationIds);
      if (Array.isArray(organizationIds) && slot) {
        const knownOrganizationIds = organizationIds.filter(
          (organizationId) => {
            if (state.organizations[organizationId]) return true;
            pushChange(
              changes,
              `${slot.slotId} 移除模型提供的未知可选机构 ${organizationId}`
            );
            return false;
          }
        );
        const merged = [
          ...new Set([
            ...knownOrganizationIds,
            ...slot.requiredOrganizationIds
          ])
        ];
        if (JSON.stringify(merged) !== JSON.stringify(actor.organizationIds)) {
          pushChange(changes, `${slot.slotId} 规范化并补齐必需机构引用`);
        }
        actor.organizationIds = merged;
      } else {
        actor.organizationIds = organizationIds;
      }

      const projected =
        actor.presence === 'present' || actor.presence === 'nearby';
      if (projected) {
        if (
          actor.currentPlaceId !== skeleton.currentPlaceId ||
          actor.currentSceneId !== skeleton.currentSceneId
        ) {
          pushChange(changes, `${slotId ?? '未知槽位'} 对齐本地开局场景`);
        }
        actor.currentPlaceId = skeleton.currentPlaceId;
        actor.currentSceneId = skeleton.currentSceneId;
      } else {
        if (actor.currentPlaceId === '') delete actor.currentPlaceId;
        if (actor.currentSceneId === '') delete actor.currentSceneId;
      }
      return [actor];
    });
  }

  if (isRecord(normalizedCast.openingFacts)) {
    normalizedCast.openingFacts = Object.fromEntries(
      Object.entries(normalizedCast.openingFacts).map(([key, value]) => [
        key,
        trimNonEmptyString(value)
      ])
    );
  }

  if (Array.isArray(normalizedCast.actionIntents)) {
    normalizedCast.actionIntents = normalizedCast.actionIntents.map(
      (entry, index) => {
        if (!isRecord(entry)) return entry;
        const action = { ...entry };
        if (skeleton.actionIds[index] && action.actionId !== skeleton.actionIds[index]) {
          action.actionId = skeleton.actionIds[index];
          pushChange(changes, `第 ${index + 1} 个行动使用本地预留 actionId`);
        }
        action.intent = trimNonEmptyString(action.intent);
        action.relatedActorSlotIds = normalizeStringArray(
          action.relatedActorSlotIds
        );
        action.requiredFacts = normalizeStringArray(action.requiredFacts);
        return action;
      }
    );
  }

  if (!state.world.dramaticOpeningId && 'dramaPlan' in normalizedCast) {
    delete normalizedCast.dramaPlan;
    pushChange(changes, '未选择戏剧化开局，移除模型额外返回的 dramaPlan');
  }

  return { value: normalizedCast, changes };
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function getOpeningCastContractIssueDetails(
  cast: OpeningCastDraft,
  skeleton: OpeningLocalSkeleton,
  state: RuntimeState
): OpeningCastRepairIssue[] {
  const issues: OpeningCastRepairIssue[] = [];
  const add = (path: string, message: string) => {
    if (!issues.some((issue) => issue.path === path && issue.message === message)) {
      issues.push({ path, message });
    }
  };
  if (cast.openingSessionId !== skeleton.openingSessionId) {
    add('openingSessionId', 'openingSessionId 与本地骨架不一致');
  }

  const slots = new Map(skeleton.actorSlots.map((slot) => [slot.slotId, slot]));
  const actorSlotIds = cast.actors.map((actor) => actor.slotId);
  if (new Set(actorSlotIds).size !== actorSlotIds.length) {
    add('actors', '人物槽位重复');
  }
  for (const requiredSlot of skeleton.actorSlots.filter((slot) => slot.required)) {
    if (!actorSlotIds.includes(requiredSlot.slotId)) {
      add(
        `actors.${requiredSlot.slotId}`,
        `缺少必需人物槽位 ${requiredSlot.slotId}`
      );
    }
  }

  const names = new Map<string, string>();
  const identities = new Map<string, string>();
  for (const actor of cast.actors) {
    const slot = slots.get(actor.slotId);
    if (!slot) {
      add(`actors.${actor.slotId}`, `使用了未授权人物槽位 ${actor.slotId}`);
      continue;
    }
    const name = normalized(actor.name);
    if (names.has(name)) {
      add(`actors.${actor.slotId}.name`, `重复人物姓名 ${actor.name}`);
    }
    names.set(name, actor.slotId);
    const identity = normalized(
      `${actor.name}|${actor.publicIdentity}|${actor.positionSummary}`
    );
    if (identities.has(identity)) {
      add(
        `actors.${actor.slotId}.publicIdentity`,
        `重复稳定身份 ${actor.name}`
      );
    }
    identities.set(identity, actor.slotId);

    if (slot.allowedPlayerRoleRelations.length > 0) {
      if (
        !actor.playerRoleRelation ||
        !slot.allowedPlayerRoleRelations.includes(actor.playerRoleRelation)
      ) {
        add(
          `actors.${actor.slotId}.playerRoleRelation`,
          `${actor.slotId} 未满足指定玩家关系槽位`
        );
      }
    } else if (actor.playerRoleRelation) {
      add(
        `actors.${actor.slotId}.playerRoleRelation`,
        `${actor.slotId} 不得占用必需身份关系槽位`
      );
    }
    for (const organizationId of slot.requiredOrganizationIds) {
      if (!actor.organizationIds.includes(organizationId)) {
        add(
          `actors.${actor.slotId}.organizationIds`,
          `${actor.slotId} 未引用必需机构 ${organizationId}`
        );
      }
    }
    for (const organizationId of actor.organizationIds) {
      if (!state.organizations[organizationId]) {
        add(
          `actors.${actor.slotId}.organizationIds`,
          `${actor.slotId} 引用了未知机构 ${organizationId}`
        );
      }
    }
    if (
      (actor.presence === 'present' || actor.presence === 'nearby') &&
      (actor.currentPlaceId !== skeleton.currentPlaceId ||
        actor.currentSceneId !== skeleton.currentSceneId)
    ) {
      add(
        `actors.${actor.slotId}.currentPlaceId`,
        `${actor.slotId} 的在场地点与本地开局场景不一致`
      );
      add(
        `actors.${actor.slotId}.currentSceneId`,
        `${actor.slotId} 的在场地点与本地开局场景不一致`
      );
    }
  }

  const allowedActionIds = new Set(skeleton.actionIds);
  const actionIds = cast.actionIntents.map((action) => action.actionId);
  if (new Set(actionIds).size !== actionIds.length) {
    add('actionIntents', '行动 ID 重复');
  }
  for (const action of cast.actionIntents) {
    if (!allowedActionIds.has(action.actionId)) {
      add(
        `actionIntents.${action.actionId}.actionId`,
        `行动 ${action.actionId} 未使用本地预留 ID`
      );
    }
    for (const slotId of action.relatedActorSlotIds) {
      if (!actorSlotIds.includes(slotId)) {
        add(
          `actionIntents.${action.actionId}.relatedActorSlotIds`,
          `行动 ${action.actionId} 引用了未知人物槽位 ${slotId}`
        );
      }
    }
  }
  return issues;
}

export function getOpeningCastContractIssues(
  cast: OpeningCastDraft,
  skeleton: OpeningLocalSkeleton,
  state: RuntimeState
): string[] {
  return getOpeningCastContractIssueDetails(cast, skeleton, state).map(
    (issue) => issue.message
  );
}

function repairPathForZodIssue(
  path: PropertyKey[],
  normalizedRaw: unknown
): string {
  const [root, index, field] = path;
  if (root === 'dramaPlan') return 'dramaPlan';
  if (
    root === 'actors' &&
    typeof index === 'number' &&
    isRecord(normalizedRaw) &&
    Array.isArray(normalizedRaw.actors)
  ) {
    const actor = normalizedRaw.actors[index];
    const actorKey =
      isRecord(actor) && typeof actor.slotId === 'string'
        ? actor.slotId
        : String(index);
    return field === undefined
      ? `actors.${actorKey}`
      : `actors.${actorKey}.${String(field)}`;
  }
  if (
    root === 'actionIntents' &&
    typeof index === 'number' &&
    isRecord(normalizedRaw) &&
    Array.isArray(normalizedRaw.actionIntents)
  ) {
    const action = normalizedRaw.actionIntents[index];
    const actionKey =
      isRecord(action) && typeof action.actionId === 'string'
        ? action.actionId
        : String(index);
    return field === undefined
      ? `actionIntents.${actionKey}`
      : `actionIntents.${actionKey}.${String(field)}`;
  }
  return path.map(String).join('.') || 'cast';
}

export function getOpeningCastRepairIssues(
  raw: unknown,
  skeleton: OpeningLocalSkeleton,
  state: RuntimeState
): {
  normalized: unknown;
  localChanges: string[];
  issues: OpeningCastRepairIssue[];
} {
  const normalization = normalizeOpeningCastCandidate(raw, skeleton, state);
  const parsed = openingCastDraftSchema.safeParse(normalization.value);
  if (!parsed.success) {
    const issues = parsed.error.issues.flatMap((issue) => {
      const path = repairPathForZodIssue(issue.path, normalization.value);
      if (path !== 'openingFacts') {
        return [{ path, message: issue.message }];
      }
      return [
        'situationSummary',
        'centralMatter',
        'playerDecisionBoundary'
      ].map((field) => ({
        path: `openingFacts.${field}`,
        message: `openingFacts 缺失或类型非法；请只补回 ${field}`
      }));
    });
    const openingId = state.world.dramaticOpeningId;
    const customSupport = openingId
      ? resolveOpeningCustomContentSupport({ state })
      : undefined;
    const rawPlan = isRecord(normalization.value)
      ? normalization.value.dramaPlan
      : undefined;
    const dramaValidation = validateOpeningDramaPlan({
      openingId,
      rawPlan,
      allowedSupportSourceRef: customSupport?.source.ref
    });
    issues.push(
      ...dramaValidation.diagnostics.map((diagnostic) => ({
        path: 'dramaPlan',
        message: diagnostic.message
      }))
    );
    const uniqueIssues = new Map<string, string[]>();
    for (const issue of issues) {
      const messages = uniqueIssues.get(issue.path) ?? [];
      if (!messages.includes(issue.message)) messages.push(issue.message);
      uniqueIssues.set(issue.path, messages);
    }
    return {
      normalized: normalization.value,
      localChanges: normalization.changes,
      issues: [...uniqueIssues].map(([path, messages]) => ({
        path,
        message: messages.join('；')
      }))
    };
  }

  const issues = getOpeningCastContractIssueDetails(parsed.data, skeleton, state);
  const openingId = state.world.dramaticOpeningId;
  const customSupport = openingId
    ? resolveOpeningCustomContentSupport({ state })
    : undefined;
  const dramaValidation = validateOpeningDramaPlan({
    openingId,
    rawPlan: parsed.data.dramaPlan,
    allowedSupportSourceRef: customSupport?.source.ref
  });
  issues.push(
    ...dramaValidation.diagnostics.map((diagnostic) => ({
      path: 'dramaPlan',
      message: diagnostic.message
    }))
  );
  return {
    normalized: normalization.value,
    localChanges: normalization.changes,
    issues
  };
}

export function validateOpeningCastDraft(
  raw: unknown,
  skeleton: OpeningLocalSkeleton,
  state: RuntimeState
): OpeningCastDraft {
  openingLocalSkeletonSchema.parse(skeleton);
  const cast = openingCastDraftSchema.parse(raw);
  const issues = getOpeningCastContractIssueDetails(cast, skeleton, state).map(
    (issue) => issue.message
  );
  const openingId = state.world.dramaticOpeningId;
  const customSupport = openingId
    ? resolveOpeningCustomContentSupport({ state })
    : undefined;
  const dramaValidation = validateOpeningDramaPlan({
    openingId,
    rawPlan: cast.dramaPlan,
    allowedSupportSourceRef: customSupport?.source.ref
  });
  issues.push(
    ...dramaValidation.diagnostics.map((diagnostic) => diagnostic.message)
  );
  if (issues.length > 0) throw new OpeningCastContractError(issues);
  const { dramaPlan: _rawPlan, ...rest } = cast;
  return dramaValidation.plan
    ? { ...rest, dramaPlan: dramaValidation.plan }
    : rest;
}

const openingCastFieldRepairSchema = z
  .object({
    repairs: z
      .array(
        z
          .object({
            path: z.string().min(1),
            value: z.unknown()
          })
          .strict()
      )
      .min(1)
      .max(16)
  })
  .strict();

function findByStableKey(
  entries: unknown[],
  stableKey: string,
  property: 'slotId' | 'actionId'
): number {
  const numericIndex = Number(stableKey);
  if (Number.isInteger(numericIndex) && numericIndex >= 0) return numericIndex;
  return entries.findIndex(
    (entry) => isRecord(entry) && entry[property] === stableKey
  );
}

function applyRepairValue(
  candidate: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const [root, stableKey, field] = path.split('.');
  if (
    (root === 'actors' || root === 'actionIntents') &&
    stableKey === undefined
  ) {
    candidate[root] = value;
    return;
  }
  if (root === 'dramaPlan' && stableKey === undefined) {
    candidate.dramaPlan = value;
    return;
  }
  if (root === 'openingFacts' && stableKey === undefined) {
    candidate.openingFacts = value;
    return;
  }
  if (root === 'openingFacts' && stableKey && field === undefined) {
    const openingFacts = isRecord(candidate.openingFacts)
      ? { ...candidate.openingFacts }
      : {};
    openingFacts[stableKey] = value;
    candidate.openingFacts = openingFacts;
    return;
  }
  if ((root === 'actors' || root === 'actionIntents') && stableKey) {
    const entries = Array.isArray(candidate[root]) ? [...candidate[root]] : [];
    const property = root === 'actors' ? 'slotId' : 'actionId';
    const index = findByStableKey(entries, stableKey, property);
    if (field === undefined) {
      const replacement =
        isRecord(value) && value[property] === undefined
          ? { ...value, [property]: stableKey }
          : value;
      if (index >= 0) entries[index] = replacement;
      else entries.push(replacement);
    } else {
      if (index < 0 || !isRecord(entries[index])) {
        throw new Error(`判定结构修复无法定位 ${root}.${stableKey}`);
      }
      entries[index] = { ...entries[index], [field]: value };
    }
    candidate[root] = entries;
    return;
  }
  throw new Error(`不支持的开局人物蓝图修复路径 ${path}`);
}

export function applyOpeningCastFieldRepair(
  rawCast: unknown,
  rawRepair: unknown,
  allowedPaths: string[],
  skeleton: OpeningLocalSkeleton,
  state: RuntimeState
): unknown {
  const normalized = normalizeOpeningCastCandidate(rawCast, skeleton, state).value;
  if (!isRecord(normalized)) {
    throw new Error('开局人物蓝图不是可局部修复的 object');
  }
  const repair = openingCastFieldRepairSchema.parse(rawRepair);
  const allowed = new Set(allowedPaths);
  const candidate = { ...normalized };
  for (const patch of repair.repairs) {
    if (!allowed.has(patch.path)) {
      throw new Error(`开局人物蓝图修复越界：${patch.path}`);
    }
    applyRepairValue(candidate, patch.path, patch.value);
  }
  return normalizeOpeningCastCandidate(candidate, skeleton, state).value;
}

export function lockOpeningCastDraft(
  cast: unknown,
  skeleton: OpeningLocalSkeleton,
  state: RuntimeState
): LockedOpeningCast {
  const validated = validateOpeningCastDraft(cast, skeleton, state);
  const actorIds = new Map(
    skeleton.actorSlots.map((slot) => [slot.slotId, slot.actorId])
  );
  return {
    ...validated,
    actors: validated.actors.map((actor) => ({
      ...actor,
      actorId: actorIds.get(actor.slotId)!
    }))
  };
}
