import type { OpeningBlueprint } from './openingBlueprintSchema';
import type { OpeningInitialization } from './openingInitializationSchema';

export type OpeningCurrentMatterPatch = NonNullable<
  OpeningInitialization['currentMatterPatches']
>[number];

export interface OpeningIdentityMatterContractIssue {
  path: string;
  message: string;
}

export interface OpeningIdentityMatterContractResolution {
  matters: OpeningCurrentMatterPatch[];
  normalizedPaths: string[];
  issues: OpeningIdentityMatterContractIssue[];
}

export interface OpeningIdentityMatterCandidateNormalization {
  matters: unknown[];
  normalizedPaths: string[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRawMatterAt(
  matters: unknown[],
  index: number,
  patch: Record<string, unknown>,
  normalizedPaths: string[]
): unknown[] {
  const current = matters[index];
  if (!isRecord(current)) return matters;
  const next = { ...current };
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (next[key] === value) continue;
    next[key] = value;
    changed = true;
    normalizedPaths.push(`currentMatterPatches.${index}.${key}`);
  }
  if (!changed) return matters;
  const result = [...matters];
  result[index] = next;
  return result;
}

export function preNormalizeOpeningIdentityMatterCandidates({
  identity,
  matters
}: {
  identity: 'civilian' | 'gang_member' | 'police';
  matters: readonly unknown[];
}): OpeningIdentityMatterCandidateNormalization {
  let normalizedMatters = [...matters];
  const normalizedPaths: string[] = [];

  // Only one unambiguous candidate can inherit an identity-owned opening
  // matter contract. Multiple candidates still require a scoped repair so the
  // model cannot make a first-act character replace the player's own matter.
  if (normalizedMatters.length !== 1 || !isRecord(normalizedMatters[0])) {
    return { matters: normalizedMatters, normalizedPaths };
  }

  if (identity === 'civilian') {
    normalizedMatters = normalizeRawMatterAt(
      normalizedMatters,
      0,
      {
        matterKind: 'livelihood',
        status: 'active',
        visibility: 'known'
      },
      normalizedPaths
    );
  } else if (identity === 'gang_member') {
    normalizedMatters = normalizeRawMatterAt(
      normalizedMatters,
      0,
      {
        source: 'triad_responsibility',
        matterKind: 'social',
        status: 'active',
        visibility: 'known'
      },
      normalizedPaths
    );
  }

  return { matters: normalizedMatters, normalizedPaths };
}

function actorIdsForRelations(
  blueprint: OpeningBlueprint,
  relations: readonly string[]
): string[] {
  const allowed = new Set(relations);
  return blueprint.initialActors
    .filter(
      (actor) =>
        actor.playerRoleRelation !== undefined &&
        allowed.has(actor.playerRoleRelation)
    )
    .map((actor) => actor.actorId);
}

function normalizeMatterAt(
  matters: OpeningCurrentMatterPatch[],
  index: number,
  patch: Partial<OpeningCurrentMatterPatch>,
  normalizedPaths: string[]
): OpeningCurrentMatterPatch[] {
  const current = matters[index];
  const next = { ...current, ...patch };
  if (JSON.stringify(current) === JSON.stringify(next)) return matters;
  const result = [...matters];
  result[index] = next;
  for (const key of Object.keys(patch)) {
    normalizedPaths.push(`currentMatterPatches.${index}.${key}`);
  }
  return result;
}

function resolveGangMatterContract(
  blueprint: OpeningBlueprint,
  inputMatters: readonly OpeningCurrentMatterPatch[]
): OpeningIdentityMatterContractResolution {
  let matters = [...inputMatters];
  const normalizedPaths: string[] = [];
  const issues: OpeningIdentityMatterContractIssue[] = [];
  const patronIds = actorIdsForRelations(blueprint, ['triad_patron']);
  const peerIds = actorIdsForRelations(blueprint, ['triad_peer']);
  const requiredActorIds = unique([...patronIds, ...peerIds]);

  if (patronIds.length !== 1) {
    issues.push({
      path: 'currentMatterPatches.relatedActorIds',
      message: '社团开局蓝图必须锁定一名直属上线'
    });
  }
  if (peerIds.length !== 1) {
    issues.push({
      path: 'currentMatterPatches.relatedActorIds',
      message: '社团开局蓝图必须锁定一名同组成员'
    });
  }

  const responsibilityIndexes = matters
    .map((matter, index) => ({ matter, index }))
    .filter(({ matter }) => matter.source === 'triad_responsibility')
    .map(({ index }) => index);
  const candidateIndex =
    responsibilityIndexes.length === 1
      ? responsibilityIndexes[0]
      : responsibilityIndexes.length === 0 && matters.length === 1
        ? 0
        : undefined;

  if (candidateIndex === undefined) {
    issues.push({
      path: 'currentMatterPatches',
      message:
        responsibilityIndexes.length > 1
          ? '社团开局存在多条组织责任，无法在本地确定唯一事项'
          : '社团开局缺少可确定的唯一组织责任事项'
    });
    return { matters, normalizedPaths, issues };
  }

  const matter = matters[candidateIndex];
  matters = normalizeMatterAt(
    matters,
    candidateIndex,
    {
      source: 'triad_responsibility',
      matterKind: 'social',
      status: 'active',
      visibility: 'known',
      relatedActorIds: unique([
        ...(matter.relatedActorIds ?? []),
        ...requiredActorIds
      ])
    },
    normalizedPaths
  );
  return { matters, normalizedPaths, issues };
}

function resolveCivilianMatterContract(
  blueprint: OpeningBlueprint,
  inputMatters: readonly OpeningCurrentMatterPatch[]
): OpeningIdentityMatterContractResolution {
  let matters = [...inputMatters];
  const normalizedPaths: string[] = [];
  const issues: OpeningIdentityMatterContractIssue[] = [];
  const relationIds = actorIdsForRelations(blueprint, [
    'civilian_work_relation',
    'civilian_social_relation'
  ]);
  const livelihoodIndexes = matters
    .map((matter, index) => ({ matter, index }))
    .filter(({ matter }) => matter.matterKind === 'livelihood')
    .map(({ index }) => index);
  const candidateIndex =
    livelihoodIndexes.length === 1
      ? livelihoodIndexes[0]
      : livelihoodIndexes.length === 0 && matters.length === 1
        ? 0
        : undefined;

  if (candidateIndex === undefined) {
    issues.push({
      path: 'currentMatterPatches',
      message:
        livelihoodIndexes.length > 1
          ? '市民开局存在多条营生事项，无法在本地确定唯一事项'
          : '市民开局缺少可确定的唯一营生事项'
    });
    return { matters, normalizedPaths, issues };
  }

  const matter = matters[candidateIndex];
  const relatedActorIds = matter.relatedActorIds ?? [];
  const hasRelationAnchor = relationIds.some((actorId) =>
    relatedActorIds.includes(actorId)
  );
  if (!hasRelationAnchor && relationIds.length > 1) {
    issues.push({
      path: `currentMatterPatches.${candidateIndex}.relatedActorIds`,
      message: '市民开局有多个关系人物，无法在本地猜测营生事项应关联哪一人'
    });
    return { matters, normalizedPaths, issues };
  }

  matters = normalizeMatterAt(
    matters,
    candidateIndex,
    {
      source:
        matter.source?.trim() ||
        'opening_livelihood',
      matterKind: 'livelihood',
      status: 'active',
      visibility: 'known',
      relatedActorIds:
        !hasRelationAnchor && relationIds.length === 1
          ? unique([...relatedActorIds, relationIds[0]])
          : relatedActorIds
    },
    normalizedPaths
  );
  return { matters, normalizedPaths, issues };
}

export function resolveOpeningIdentityMatterContract({
  identity,
  blueprint,
  matters
}: {
  identity: 'civilian' | 'gang_member' | 'police';
  blueprint: OpeningBlueprint;
  matters: readonly OpeningCurrentMatterPatch[];
}): OpeningIdentityMatterContractResolution {
  if (identity === 'gang_member') {
    return resolveGangMatterContract(blueprint, matters);
  }
  if (identity === 'civilian') {
    return resolveCivilianMatterContract(blueprint, matters);
  }
  return { matters: [...matters], normalizedPaths: [], issues: [] };
}
