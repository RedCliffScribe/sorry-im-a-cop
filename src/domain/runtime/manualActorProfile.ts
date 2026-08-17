import { deriveActorAgeAt, normalizeActorBirthDate } from './actorAge';
import type {
  Actor,
  ActorManualProfileField,
  RuntimeState
} from './types';

export interface ManualActorProfileDraft {
  name: string;
  englishName: string;
  aliases: string[];
  callName: string;
  gender: Actor['gender'];
  birthDate: string;
  publicIdentity: string;
  actualIdentitySummary: string;
  positionSummary: string;
  profileSummary: string;
  appearance: string;
  clothing: string;
  equipment: string[];
  personality: string;
  speechStyle: string;
  motivation: string;
  longTermGoal: string;
  values: string;
  relationshipSummary: string;
  attitudeTowardPlayer: string;
  trustTendency: string;
  entanglementSummary: string;
}

const manualActorProfileFields = [
  'name',
  'englishName',
  'aliases',
  'callName',
  'gender',
  'birthDate',
  'publicIdentity',
  'actualIdentitySummary',
  'positionSummary',
  'profileSummary',
  'appearance',
  'clothing',
  'equipment',
  'personality',
  'speechStyle',
  'motivation',
  'longTermGoal',
  'values',
  'relationshipSummary',
  'attitudeTowardPlayer',
  'trustTendency',
  'entanglementSummary'
] as const satisfies readonly ActorManualProfileField[];

const stableManualProfileFields = new Set<ActorManualProfileField>([
  'name',
  'englishName',
  'aliases',
  'callName',
  'gender',
  'birthDate',
  'actualIdentitySummary',
  'profileSummary',
  'appearance',
  'personality',
  'speechStyle',
  'motivation',
  'longTermGoal',
  'values'
]);

const textLimits: Partial<Record<ActorManualProfileField, number>> = {
  name: 60,
  englishName: 100,
  callName: 60,
  publicIdentity: 160,
  actualIdentitySummary: 600,
  positionSummary: 300,
  profileSummary: 1200,
  appearance: 1200,
  clothing: 800,
  personality: 600,
  speechStyle: 600,
  motivation: 600,
  longTermGoal: 600,
  values: 600,
  relationshipSummary: 800,
  attitudeTowardPlayer: 600,
  trustTendency: 600,
  entanglementSummary: 800
};

function normalizeText(value: string, field: ActorManualProfileField): string {
  const normalized = value.trim();
  const limit = textLimits[field];
  if (limit !== undefined && normalized.length > limit) {
    throw new Error(`字段内容过长（最多 ${limit} 个字符）。`);
  }
  return normalized;
}

function normalizeList(values: string[], label: string, maxItems: number, maxLength: number): string[] {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (normalized.length > maxItems) {
    throw new Error(`${label}最多保留 ${maxItems} 项。`);
  }
  if (normalized.some((value) => value.length > maxLength)) {
    throw new Error(`${label}单项最多 ${maxLength} 个字符。`);
  }
  return normalized;
}

export function createManualActorProfileDraft(actor: Actor): ManualActorProfileDraft {
  return {
    name: actor.name,
    englishName: actor.englishName ?? '',
    aliases: [...actor.aliases],
    callName: actor.callName ?? '',
    gender: actor.gender,
    birthDate: actor.birthDate ?? '',
    publicIdentity: actor.publicIdentity ?? '',
    actualIdentitySummary: actor.actualIdentitySummary ?? '',
    positionSummary: actor.positionSummary,
    profileSummary: actor.profileSummary,
    appearance: actor.appearance,
    clothing: actor.clothing,
    equipment: [...actor.equipment],
    personality: actor.personality,
    speechStyle: actor.speechStyle,
    motivation: actor.motivation,
    longTermGoal: actor.longTermGoal,
    values: actor.values,
    relationshipSummary: actor.relationshipSummary,
    attitudeTowardPlayer: actor.attitudeTowardPlayer,
    trustTendency: actor.trustTendency,
    entanglementSummary: actor.entanglementSummary
  };
}

function normalizeDraft(state: RuntimeState, draft: ManualActorProfileDraft): ManualActorProfileDraft {
  const name = normalizeText(draft.name, 'name');
  if (!name) throw new Error('姓名不能为空。');

  const birthDateText = draft.birthDate.trim();
  const birthDate = birthDateText ? normalizeActorBirthDate(birthDateText) : undefined;
  if (birthDateText && !birthDate) {
    throw new Error('出生日期必须是有效的 YYYY-MM-DD 日期。');
  }
  if (birthDate) {
    const age = deriveActorAgeAt({ birthDate }, state.time);
    if (age === undefined || age > 130) {
      throw new Error('出生日期与当前游戏时间不相容，人物年龄必须在 0–130 岁之间。');
    }
  }

  return {
    name,
    englishName: normalizeText(draft.englishName, 'englishName'),
    aliases: normalizeList(draft.aliases, '别名', 20, 60),
    callName: normalizeText(draft.callName, 'callName'),
    gender: draft.gender,
    birthDate: birthDate ?? '',
    publicIdentity: normalizeText(draft.publicIdentity, 'publicIdentity'),
    actualIdentitySummary: normalizeText(draft.actualIdentitySummary, 'actualIdentitySummary'),
    positionSummary: normalizeText(draft.positionSummary, 'positionSummary'),
    profileSummary: normalizeText(draft.profileSummary, 'profileSummary'),
    appearance: normalizeText(draft.appearance, 'appearance'),
    clothing: normalizeText(draft.clothing, 'clothing'),
    equipment: normalizeList(draft.equipment, '装备', 40, 120),
    personality: normalizeText(draft.personality, 'personality'),
    speechStyle: normalizeText(draft.speechStyle, 'speechStyle'),
    motivation: normalizeText(draft.motivation, 'motivation'),
    longTermGoal: normalizeText(draft.longTermGoal, 'longTermGoal'),
    values: normalizeText(draft.values, 'values'),
    relationshipSummary: normalizeText(draft.relationshipSummary, 'relationshipSummary'),
    attitudeTowardPlayer: normalizeText(draft.attitudeTowardPlayer, 'attitudeTowardPlayer'),
    trustTendency: normalizeText(draft.trustTendency, 'trustTendency'),
    entanglementSummary: normalizeText(draft.entanglementSummary, 'entanglementSummary')
  };
}

function actorFieldValue(actor: Actor, field: ActorManualProfileField): unknown {
  return actor[field];
}

function draftFieldValue(draft: ManualActorProfileDraft, field: ActorManualProfileField): unknown {
  const value = draft[field];
  if (field === 'birthDate' || field === 'englishName' || field === 'callName' || field === 'publicIdentity' || field === 'actualIdentitySummary') {
    return value || undefined;
  }
  return value;
}

function equalFieldValues(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

export function applyManualActorProfileEdit(
  state: RuntimeState,
  actorId: string,
  draft: ManualActorProfileDraft
): RuntimeState {
  const actor = state.actors[actorId];
  if (!actor || actorId === state.player.actorId) {
    throw new Error('该人物不存在，或不允许从人物志修改。');
  }

  const normalized = normalizeDraft(state, draft);
  const changedFields = manualActorProfileFields.filter((field) =>
    !equalFieldValues(actorFieldValue(actor, field), draftFieldValue(normalized, field))
  );
  if (changedFields.length === 0) return state;

  const newlyLockedFields = changedFields.filter((field) => stableManualProfileFields.has(field));
  const lockedFields = [...new Set([
    ...(actor.manualProfileOverride?.lockedFields ?? []),
    ...newlyLockedFields
  ])];
  const birthDateChanged = changedFields.includes('birthDate');

  const nextActor: Actor = {
    ...actor,
    name: normalized.name,
    englishName: normalized.englishName || undefined,
    aliases: [...normalized.aliases],
    callName: normalized.callName || undefined,
    gender: normalized.gender,
    birthDate: normalized.birthDate || undefined,
    ...(birthDateChanged ? { computedAge: undefined } : {}),
    publicIdentity: normalized.publicIdentity || undefined,
    actualIdentitySummary: normalized.actualIdentitySummary || undefined,
    positionSummary: normalized.positionSummary,
    profileSummary: normalized.profileSummary,
    appearance: normalized.appearance,
    clothing: normalized.clothing,
    equipment: [...normalized.equipment],
    personality: normalized.personality,
    speechStyle: normalized.speechStyle,
    motivation: normalized.motivation,
    longTermGoal: normalized.longTermGoal,
    values: normalized.values,
    relationshipSummary: normalized.relationshipSummary,
    attitudeTowardPlayer: normalized.attitudeTowardPlayer,
    trustTendency: normalized.trustTendency,
    entanglementSummary: normalized.entanglementSummary,
    ...(lockedFields.length > 0
      ? { manualProfileOverride: { lockedFields, updatedAt: { ...state.time } } }
      : {})
  };

  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: nextActor
    }
  };
}

export function filterManuallyLockedActorPatch<T extends Record<string, unknown>>(
  actor: Actor,
  patch: T
): { patch: T; blockedFields: ActorManualProfileField[] } {
  const lockedFields = actor.manualProfileOverride?.lockedFields ?? [];
  const blockedFields = lockedFields.filter((field) => Object.prototype.hasOwnProperty.call(patch, field));
  if (blockedFields.length === 0) return { patch, blockedFields };

  const nextPatch = { ...patch };
  for (const field of blockedFields) {
    delete nextPatch[field];
  }
  return { patch: nextPatch, blockedFields };
}
