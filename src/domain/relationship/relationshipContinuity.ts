import type {
  ActorId,
  RelationshipThread,
  RelationshipThreadMilestone,
  RuntimeState,
  StoryDiagnosticIssue
} from '../runtime/types';

export interface RelationshipContinuityResult {
  state: RuntimeState;
  diagnostics: StoryDiagnosticIssue[];
}

function uniqueExistingActorIds(actorIds: ActorId[], state: RuntimeState): ActorId[] {
  return [...new Set(actorIds)].filter(
    (actorId) => actorId === 'player' || actorId === state.player.actorId || Boolean(state.actors[actorId])
  );
}

function mergeMilestoneHistory(
  previous: RelationshipThreadMilestone[],
  next: RelationshipThreadMilestone[]
): RelationshipThreadMilestone[] {
  const milestones = new Map(previous.map((milestone) => [milestone.milestoneId, milestone]));
  for (const milestone of next) milestones.set(milestone.milestoneId, milestone);
  return [...milestones.values()].sort((left, right) => {
    const leftTime = (((left.gameTime.year * 12 + left.gameTime.month) * 31 + left.gameTime.day) * 24 + left.gameTime.hour) * 60 + left.gameTime.minute;
    const rightTime = (((right.gameTime.year * 12 + right.gameTime.month) * 31 + right.gameTime.day) * 24 + right.gameTime.hour) * 60 + right.gameTime.minute;
    return rightTime - leftTime || right.importance - left.importance || left.milestoneId.localeCompare(right.milestoneId);
  });
}

function hasSurvivingNonPlayerActor(thread: RelationshipThread, state: RuntimeState): boolean {
  return [thread.primaryActorId, ...thread.relatedActorIds].some(
    (actorId) => Boolean(actorId) && actorId !== 'player' && actorId !== state.player.actorId && Boolean(state.actors[actorId!])
  );
}

function preserveKnownThread(
  previous: RelationshipThread,
  next: RelationshipThread,
  state: RuntimeState
): RelationshipThread {
  const relatedActorIds = uniqueExistingActorIds(
    [...previous.relatedActorIds, ...next.relatedActorIds],
    state
  );
  const previousPrimaryStillExists = Boolean(
    previous.primaryActorId &&
      (previous.primaryActorId === 'player' ||
        previous.primaryActorId === state.player.actorId ||
        state.actors[previous.primaryActorId])
  );

  return {
    ...next,
    kind: previous.kind === 'fate' || next.kind === 'fate' ? 'fate' : 'network',
    primaryActorId: previousPrimaryStillExists ? previous.primaryActorId : next.primaryActorId,
    relatedActorIds,
    visibility:
      previous.visibility !== 'hidden' && next.visibility === 'hidden'
        ? previous.visibility
        : next.visibility,
    milestones: mergeMilestoneHistory(previous.milestones, next.milestones),
    createdAt: { ...previous.createdAt }
  };
}

function primaryNonPlayerAnchor(thread: RelationshipThread, state: RuntimeState): ActorId | undefined {
  const isPlayer = (actorId: ActorId | undefined) =>
    !actorId || actorId === 'player' || actorId === state.player.actorId;
  if (!isPlayer(thread.primaryActorId)) return thread.primaryActorId;
  return thread.relatedActorIds.find((actorId) => !isPlayer(actorId));
}

function remapThreadIds(values: string[], aliases: ReadonlyMap<string, string>): string[] {
  return [...new Set(values.map((value) => aliases.get(value) ?? value))];
}

function remapSourceRefs<T extends { relationshipThreadIds: string[] } | undefined>(
  refs: T,
  aliases: ReadonlyMap<string, string>
): T {
  if (!refs) return refs;
  return {
    ...refs,
    relationshipThreadIds: remapThreadIds(refs.relationshipThreadIds, aliases)
  } as T;
}

function remapBackgroundRelationshipThreadIds(
  state: RuntimeState,
  aliases: ReadonlyMap<string, string>
): RuntimeState {
  if (aliases.size === 0) return state;
  return {
    ...state,
    backgroundEvolution: {
      ...state.backgroundEvolution,
      npcTracks: Object.fromEntries(
        Object.entries(state.backgroundEvolution.npcTracks).map(([trackId, track]) => [
          trackId,
          {
            ...track,
            relatedRelationshipThreadIds: remapThreadIds(track.relatedRelationshipThreadIds, aliases),
            sourceRefs: remapSourceRefs(track.sourceRefs, aliases)
          }
        ])
      ),
      organizationTracks: Object.fromEntries(
        Object.entries(state.backgroundEvolution.organizationTracks).map(([trackId, track]) => [
          trackId,
          { ...track, sourceRefs: remapSourceRefs(track.sourceRefs, aliases) }
        ])
      ),
      recentOutcomes: state.backgroundEvolution.recentOutcomes.map((outcome) => ({
        ...outcome,
        relatedRelationshipThreadIds: remapThreadIds(outcome.relatedRelationshipThreadIds, aliases),
        sourceRefs: remapSourceRefs(outcome.sourceRefs, aliases)
      })),
      chronicle: state.backgroundEvolution.chronicle.map((entry) => ({
        ...entry,
        sourceRefs: remapSourceRefs(entry.sourceRefs, aliases)
      }))
    }
  };
}

function consolidateRelationshipSubtypes(
  state: RuntimeState,
  relationshipThreads: Record<string, RelationshipThread>,
  diagnostics: StoryDiagnosticIssue[]
): { state: RuntimeState; relationshipThreads: Record<string, RelationshipThread> } {
  const byActor = new Map<string, RelationshipThread[]>();
  for (const thread of Object.values(relationshipThreads)) {
    const anchor = primaryNonPlayerAnchor(thread, state);
    if (!anchor) continue;
    const group = byActor.get(anchor) ?? [];
    group.push(thread);
    byActor.set(anchor, group);
  }

  const aliases = new Map<string, string>();
  for (const [actorId, threads] of byActor) {
    if (!threads.some((thread) => thread.kind === 'network') || !threads.some((thread) => thread.kind === 'fate')) {
      continue;
    }
    const sorted = [...threads].sort((left, right) =>
      left.createdAt.year - right.createdAt.year ||
      left.createdAt.month - right.createdAt.month ||
      left.createdAt.day - right.createdAt.day ||
      left.createdAt.hour - right.createdAt.hour ||
      left.createdAt.minute - right.createdAt.minute ||
      left.threadId.localeCompare(right.threadId)
    );
    const canonical = sorted[0];
    const fate = [...sorted].reverse().find((thread) => thread.kind === 'fate')!;
    const merged = sorted.reduce((current, thread) => ({
      ...current,
      kind: 'fate' as const,
      title: thread.kind === 'fate' ? thread.title : current.title,
      summary: thread.kind === 'fate' ? thread.summary : current.summary,
      relatedActorIds: uniqueExistingActorIds(
        [...current.relatedActorIds, ...thread.relatedActorIds],
        state
      ),
      relationshipRole: thread.kind === 'fate' ? thread.relationshipRole : current.relationshipRole,
      creationBasis: thread.creationBasis ?? current.creationBasis,
      evidenceRefs: thread.evidenceRefs ?? current.evidenceRefs,
      status: thread.status,
      intimacySummary: thread.intimacySummary ?? current.intimacySummary,
      trustSummary: thread.trustSummary ?? current.trustSummary,
      conflictSummary: thread.conflictSummary ?? current.conflictSummary,
      promiseSummary: thread.promiseSummary ?? current.promiseSummary,
      riskSummary: thread.riskSummary ?? current.riskSummary,
      currentPull: thread.currentPull ?? current.currentPull,
      nextNaturalBeatHint: thread.nextNaturalBeatHint ?? current.nextNaturalBeatHint,
      milestones: mergeMilestoneHistory(current.milestones, thread.milestones),
      visibility:
        current.visibility !== 'hidden' || thread.visibility !== 'hidden'
          ? current.visibility !== 'hidden'
            ? current.visibility
            : thread.visibility
          : 'hidden',
      importance: Math.max(current.importance, thread.importance),
      updatedAt: { ...fate.updatedAt },
      createdAt: { ...canonical.createdAt }
    }), canonical);
    relationshipThreads[canonical.threadId] = merged;
    for (const duplicate of sorted.slice(1)) {
      aliases.set(duplicate.threadId, canonical.threadId);
      delete relationshipThreads[duplicate.threadId];
    }
    diagnostics.push({
      path: ['relationshipThreads', canonical.threadId],
      code: 'relationship_thread_subtype_consolidated',
      message: `人物 ${actorId} 的人脉与缘分重复条目已合并为同一条缘分关系，历史里程碑和后台引用均已保留。`
    });
  }

  return {
    state: remapBackgroundRelationshipThreadIds(state, aliases),
    relationshipThreads
  };
}

/**
 * Forward turns are not allowed to erase relationship history implicitly.
 * Explicit actor deletion remains possible: a thread is not restored when none
 * of its non-player actors survive in the candidate state.
 */
export function preserveRelationshipContinuity(
  previousState: RuntimeState,
  candidateState: RuntimeState
): RelationshipContinuityResult {
  const relationshipThreads = { ...candidateState.relationshipThreads };
  const diagnostics: StoryDiagnosticIssue[] = [];

  for (const [threadId, previousThread] of Object.entries(previousState.relationshipThreads ?? {})) {
    const candidateThread = relationshipThreads[threadId];
    if (candidateThread) {
      relationshipThreads[threadId] = preserveKnownThread(previousThread, candidateThread, candidateState);
      continue;
    }
    if (!hasSurvivingNonPlayerActor(previousThread, candidateState)) continue;

    relationshipThreads[threadId] = {
      ...previousThread,
      relatedActorIds: uniqueExistingActorIds(previousThread.relatedActorIds, candidateState),
      milestones: previousThread.milestones.map((milestone) => ({
        ...milestone,
        gameTime: { ...milestone.gameTime },
        relatedActorIds: uniqueExistingActorIds(milestone.relatedActorIds, candidateState)
      })),
      createdAt: { ...previousThread.createdAt },
      updatedAt: { ...previousThread.updatedAt },
      lastHeartbeatAt: previousThread.lastHeartbeatAt ? { ...previousThread.lastHeartbeatAt } : undefined,
      heartbeatCooldownUntil: previousThread.heartbeatCooldownUntil
        ? { ...previousThread.heartbeatCooldownUntil }
        : undefined
    };
    diagnostics.push({
      path: ['relationshipThreads', threadId],
      code: 'relationship_thread_history_restored',
      message: `人脉“${previousThread.title}”在回合后处理结果中缺失，已从回合前状态恢复；旧关系不会因新增人物或后台处理而消失。`
    });
  }

  const consolidated = consolidateRelationshipSubtypes(candidateState, relationshipThreads, diagnostics);
  return {
    state: { ...consolidated.state, relationshipThreads: consolidated.relationshipThreads },
    diagnostics
  };
}
