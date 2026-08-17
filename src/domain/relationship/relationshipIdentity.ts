import type { RelationshipThread, StoryDiagnosticIssue } from '../runtime/types';
import type { RelationshipThreadPatch } from './relationshipThread';

export interface RelationshipIdentityResolution {
  patch: RelationshipThreadPatch;
  diagnostics: StoryDiagnosticIssue[];
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function isPlayerActorId(actorId: string | undefined, playerActorId: string): boolean {
  return !actorId || actorId === 'player' || actorId === playerActorId;
}

function nonPlayerAnchors(
  value: Pick<RelationshipThreadPatch, 'primaryActorId' | 'relatedActorIds'>,
  playerActorId: string
): string[] {
  return uniqueStrings([value.primaryActorId, ...(value.relatedActorIds ?? [])]).filter(
    (actorId) => !isPlayerActorId(actorId, playerActorId)
  );
}

function primaryNonPlayerAnchor(
  value: Pick<RelationshipThreadPatch, 'primaryActorId' | 'relatedActorIds'>,
  playerActorId: string
): string | undefined {
  return isPlayerActorId(value.primaryActorId, playerActorId)
    ? nonPlayerAnchors(value, playerActorId)[0]
    : value.primaryActorId;
}

function identitiesMatch(
  thread: RelationshipThread,
  patch: RelationshipThreadPatch,
  playerActorId: string
): boolean {
  const patchPrimary = primaryNonPlayerAnchor(patch, playerActorId);
  const threadPrimary = primaryNonPlayerAnchor(thread, playerActorId);
  if (patchPrimary && threadPrimary) return patchPrimary === threadPrimary;

  const patchAnchors = nonPlayerAnchors(patch, playerActorId);
  const threadAnchors = nonPlayerAnchors(thread, playerActorId);
  return patchAnchors.length > 0 && patchAnchors.some((actorId) => threadAnchors.includes(actorId));
}

function resolveRelationshipKind(
  existingKind: RelationshipThread['kind'],
  requestedKind: RelationshipThreadPatch['kind']
): RelationshipThread['kind'] {
  // 缘分是同一人物关系线在人脉之上的细分，而不是第二条并行关系。
  // 已经进入缘分后也不能被一次普通 network 写回降级。
  return existingKind === 'fate' || requestedKind === 'fate' ? 'fate' : 'network';
}

function safeIdToken(value: string): string {
  const token = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return token || 'actor';
}

function allocateCollisionId(
  threads: Record<string, RelationshipThread>,
  patch: RelationshipThreadPatch,
  playerActorId: string
): string {
  const primaryActorId = primaryNonPlayerAnchor(patch, playerActorId) ?? 'group';
  const base = `${patch.threadId}__${patch.kind ?? 'network'}_${safeIdToken(primaryActorId)}`;
  let candidate = base;
  let suffix = 2;
  while (threads[candidate]) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function protectExistingIdentity(
  existing: RelationshipThread,
  patch: RelationshipThreadPatch,
  path: Array<string | number>
): RelationshipIdentityResolution {
  const diagnostics: StoryDiagnosticIssue[] = [];
  const relatedActorIds = uniqueStrings([...existing.relatedActorIds, ...(patch.relatedActorIds ?? [])]);
  let visibility = patch.visibility;
  const kind = resolveRelationshipKind(existing.kind, patch.kind);

  if (existing.kind === 'network' && patch.kind === 'fate') {
    diagnostics.push({
      path: [...path, 'kind'],
      code: 'relationship_thread_promoted_to_fate',
      message: `关系线 "${existing.threadId}" 已沿用原人物锚点从人脉升级为缘分，不会为同一人物建立第二条关系。`
    });
  } else if (existing.kind === 'fate' && patch.kind === 'network') {
    diagnostics.push({
      path: [...path, 'kind'],
      code: 'relationship_thread_kind_downgrade_blocked',
      message: `关系线 "${existing.threadId}" 已是缘分；本回合普通人脉写回不会把它降级。`
    });
  }
  if (patch.primaryActorId && patch.primaryActorId !== existing.primaryActorId) {
    diagnostics.push({
      path: [...path, 'primaryActorId'],
      code: 'relationship_thread_anchor_change_blocked',
      message: `关系线 "${existing.threadId}" 的核心人物锚点不会从 ${existing.primaryActorId ?? '未指定'} 改为 ${patch.primaryActorId}。`
    });
  }
  if (existing.visibility !== 'hidden' && patch.visibility === 'hidden') {
    visibility = existing.visibility;
    diagnostics.push({
      path: [...path, 'visibility'],
      code: 'relationship_visibility_downgrade_blocked',
      message: `玩家已知关系线 "${existing.threadId}" 不会因一次普通写回被隐藏。`
    });
  }

  return {
    patch: {
      ...patch,
      threadId: existing.threadId,
      kind,
      relatedActorIds,
      primaryActorId: existing.primaryActorId ?? patch.primaryActorId,
      visibility
    },
    diagnostics
  };
}

export function resolveRelationshipThreadIdentity(
  threads: Record<string, RelationshipThread>,
  patch: RelationshipThreadPatch,
  playerActorId: string,
  path: Array<string | number> = ['writeback', 'relationshipThreadPatches']
): RelationshipIdentityResolution {
  const sameId = threads[patch.threadId];
  const patchHasNoNonPlayerAnchor = nonPlayerAnchors(patch, playerActorId).length === 0;
  if (
    sameId &&
    (identitiesMatch(sameId, patch, playerActorId) ||
      (patchHasNoNonPlayerAnchor && (!patch.kind || patch.kind === sameId.kind)))
  ) {
    return protectExistingIdentity(sameId, patch, path);
  }

  const semanticMatch = Object.values(threads)
    .filter((thread) => identitiesMatch(thread, patch, playerActorId))
    .sort((left, right) => left.threadId.localeCompare(right.threadId))[0];
  if (semanticMatch) {
    const protectedResolution = protectExistingIdentity(semanticMatch, patch, path);
    return {
      patch: protectedResolution.patch,
      diagnostics: [
        {
          path: [...path, 'threadId'],
          code: 'relationship_thread_id_reused',
          message: `关系写回已按稳定人物锚点复用现有关系线 "${semanticMatch.threadId}"，不会创建重复条目。`
        },
        ...protectedResolution.diagnostics
      ]
    };
  }

  if (!sameId) return { patch, diagnostics: [] };

  const reassignedThreadId = allocateCollisionId(threads, patch, playerActorId);
  return {
    patch: { ...patch, threadId: reassignedThreadId },
    diagnostics: [
      {
        path: [...path, 'threadId'],
        code: 'relationship_thread_id_collision_reassigned',
        message: `关系线 ID "${patch.threadId}" 已属于其他人物；本次新关系改用 "${reassignedThreadId}"，旧关系不会被覆盖。`
      }
    ]
  };
}
