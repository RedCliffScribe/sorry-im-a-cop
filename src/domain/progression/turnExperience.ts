import type {
  CaseStatus,
  ExperienceAwardSource,
  JudgementCheck,
  RuntimeState,
  TurnExperienceAward,
  TurnId
} from '../runtime/types';
import type { NarratorResponse } from '../writeback/schema';
import { applyExperienceGain } from './playerProgression';

const judgementDifficultyExperience = {
  easy: 2,
  standard: 4,
  hard: 6,
  dangerous: 8,
  extreme: 10
} as const;

const judgementOutcomeExperience = {
  critical_failure: 0,
  failure: 0,
  partial_success: 2,
  success: 4,
  critical_success: 6
} as const;

const caseStageExperience: Partial<Record<CaseStatus, number>> = {
  submitted_to_prosecutions: 12,
  prosecution_review: 12,
  charged: 16,
  court_scheduled: 16,
  tried: 20,
  sentenced: 20,
  archived: 30
};

const caseStageOrder: Partial<Record<CaseStatus, number>> = {
  intake: 0,
  investigating: 1,
  submitted_to_prosecutions: 2,
  prosecution_review: 3,
  charged: 4,
  court_scheduled: 5,
  tried: 6,
  sentenced: 7,
  archived: 8
};

const playerActiveCaseRoles = new Set(['lead', 'assist', 'execute', 'involved']);

export interface SettleTurnExperienceInput {
  beforeState: RuntimeState;
  afterState: RuntimeState;
  response: NarratorResponse;
  turnId: TurnId;
}

export interface SettleTurnExperienceResult {
  state: RuntimeState;
  award?: TurnExperienceAward;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function normalizeModelSuggestedGain(response: NarratorResponse): number | undefined {
  const raw = response.writeback.playerPatch?.progression?.experienceGain;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return undefined;
  return Math.min(1_000, raw);
}

function describeJudgement(check: JudgementCheck): string {
  const difficultyLabels = {
    easy: '简单',
    standard: '标准',
    hard: '困难',
    dangerous: '危险',
    extreme: '极限'
  } as const;
  const outcomeLabels = {
    critical_failure: '大失败',
    failure: '失败',
    partial_success: '有限成功',
    success: '成功',
    critical_success: '大成功'
  } as const;
  return `${difficultyLabels[check.difficultyTier ?? 'standard']}${check.title}判定${outcomeLabels[check.outcome]}`;
}

function addUniqueSource(
  sources: ExperienceAwardSource[],
  seenSourceIds: Set<string>,
  source: ExperienceAwardSource
): void {
  if (source.amount <= 0) return;
  if (source.sourceId) {
    if (seenSourceIds.has(source.sourceId)) return;
    seenSourceIds.add(source.sourceId);
  }
  sources.push(source);
}

function collectJudgementSources(
  state: RuntimeState,
  turnId: TurnId,
  sources: ExperienceAwardSource[],
  seenSourceIds: Set<string>
): void {
  for (const check of Object.values(state.judgementChecks ?? {})) {
    if (
      check.turnId !== turnId ||
      check.rulesetVersion !== 'v1.1-local-d100' ||
      !check.difficultyTier
    ) {
      continue;
    }
    addUniqueSource(sources, seenSourceIds, {
      kind: 'judgement',
      sourceId: `judgement:${check.checkId}`,
      amount:
        judgementDifficultyExperience[check.difficultyTier] +
        judgementOutcomeExperience[check.outcome],
      reason: describeJudgement(check)
    });
  }
}

function collectCombatSources(
  state: RuntimeState,
  turnId: TurnId,
  sources: ExperienceAwardSource[],
  seenSourceIds: Set<string>
): void {
  for (const combat of Object.values(state.combatEvents ?? {})) {
    const involvesPlayer =
      combat.relatedActorIds.includes(state.player.actorId) ||
      combat.participants.some(
        (participant) =>
          participant.side === 'player' ||
          participant.actorId === state.player.actorId
      );
    if (combat.turnId !== turnId || !involvesPlayer) continue;
    const amount = clampInteger(2 + Math.floor(Math.max(0, combat.intensity) / 20), 2, 8);
    addUniqueSource(sources, seenSourceIds, {
      kind: 'combat',
      sourceId: `combat:${combat.combatId}`,
      amount,
      reason: `经历${combat.title}`
    });
  }
}

function collectCaseEvidenceSources(
  beforeState: RuntimeState,
  afterState: RuntimeState,
  response: NarratorResponse,
  sources: ExperienceAwardSource[],
  seenSourceIds: Set<string>
): void {
  let awarded = 0;
  for (const patch of response.writeback.caseEvidencePatches) {
    if (awarded >= 8 || beforeState.caseEvidence[patch.evidenceId]) continue;
    const evidence = afterState.caseEvidence[patch.evidenceId];
    const caseFile = evidence ? afterState.cases[evidence.caseId] : undefined;
    if (!evidence || !caseFile || !playerActiveCaseRoles.has(caseFile.playerRole)) continue;
    const amount = Math.min(4, 8 - awarded);
    addUniqueSource(sources, seenSourceIds, {
      kind: 'case_progress',
      sourceId: `case-evidence:${evidence.evidenceId}`,
      amount,
      reason: `确认案件证据：${evidence.title}`
    });
    awarded += amount;
  }
}

function collectMatterSources(
  beforeState: RuntimeState,
  afterState: RuntimeState,
  response: NarratorResponse,
  sources: ExperienceAwardSource[],
  seenSourceIds: Set<string>
): void {
  for (const patch of response.writeback.currentMatterPatches) {
    const beforeMatter = beforeState.dynamicEvents.currentMatters[patch.id];
    const afterMatter = afterState.dynamicEvents.currentMatters[patch.id];
    if (
      !beforeMatter ||
      !afterMatter ||
      !['active', 'dormant'].includes(beforeMatter.status) ||
      afterMatter.status !== 'resolved'
    ) {
      continue;
    }
    addUniqueSource(sources, seenSourceIds, {
      kind: 'matter_resolved',
      sourceId: `matter:${patch.id}:resolved`,
      amount: 10,
      reason: `完成事项：${afterMatter.title}`
    });
  }
}

function collectCaseStageSources(
  beforeState: RuntimeState,
  afterState: RuntimeState,
  response: NarratorResponse,
  sources: ExperienceAwardSource[],
  seenSourceIds: Set<string>
): boolean {
  let hasMajorProgress = false;
  for (const patch of response.writeback.casePatches) {
    const beforeCase = beforeState.cases[patch.caseId];
    const afterCase = afterState.cases[patch.caseId];
    if (
      !beforeCase ||
      !afterCase ||
      beforeCase.status === afterCase.status ||
      !playerActiveCaseRoles.has(afterCase.playerRole) ||
      (caseStageOrder[afterCase.status] ?? -1) <=
        (caseStageOrder[beforeCase.status] ?? -1)
    ) {
      continue;
    }
    const amount = caseStageExperience[afterCase.status];
    if (!amount) continue;
    hasMajorProgress ||= amount >= 30;
    addUniqueSource(sources, seenSourceIds, {
      kind: 'case_progress',
      sourceId: `case:${afterCase.caseId}:${afterCase.status}`,
      amount,
      reason: `案件进入新阶段：${afterCase.title}`
    });
  }
  return hasMajorProgress;
}

function collectRelationshipSources(
  beforeState: RuntimeState,
  afterState: RuntimeState,
  response: NarratorResponse,
  sources: ExperienceAwardSource[],
  seenSourceIds: Set<string>
): void {
  for (const patch of response.writeback.relationshipThreadPatches) {
    const afterThread = afterState.relationshipThreads[patch.threadId];
    if (
      !afterThread ||
      !afterThread.relatedActorIds.includes(afterState.player.actorId)
    ) {
      continue;
    }
    const priorMilestones = new Set(
      beforeState.relationshipThreads[patch.threadId]?.milestones.map(
        (milestone) => milestone.milestoneId
      ) ?? []
    );
    const proposedMilestones = new Set(
      patch.milestoneUpdates.map((milestone) => milestone.milestoneId)
    );
    for (const milestone of afterThread.milestones) {
      if (
        priorMilestones.has(milestone.milestoneId) ||
        !proposedMilestones.has(milestone.milestoneId)
      ) {
        continue;
      }
      addUniqueSource(sources, seenSourceIds, {
        kind: 'relationship_milestone',
        sourceId: `relationship:${afterThread.threadId}:${milestone.milestoneId}`,
        amount: 8 + Math.round((clampInteger(milestone.importance, 0, 100) * 7) / 100),
        reason: `关系里程碑：${milestone.summary}`
      });
    }
  }
}

function findNarratorEntryIndex(state: RuntimeState, turnId: TurnId): number {
  return state.storyLog.findIndex(
    (entry) => entry.turnId === turnId && entry.speaker === 'narrator'
  );
}

export function settleTurnExperience({
  beforeState,
  afterState,
  response,
  turnId
}: SettleTurnExperienceInput): SettleTurnExperienceResult {
  const narratorIndex = findNarratorEntryIndex(afterState, turnId);
  if (narratorIndex < 0) return { state: afterState };
  const existingAward = afterState.storyLog[narratorIndex]?.experienceAward;
  if (existingAward?.awardId === `xp:${turnId}`) {
    return { state: afterState, award: existingAward };
  }

  const sources: ExperienceAwardSource[] = [];
  const seenSourceIds = new Set<string>();
  collectJudgementSources(afterState, turnId, sources, seenSourceIds);
  collectCombatSources(afterState, turnId, sources, seenSourceIds);
  collectCaseEvidenceSources(beforeState, afterState, response, sources, seenSourceIds);
  collectMatterSources(beforeState, afterState, response, sources, seenSourceIds);
  const hasMajorProgress = collectCaseStageSources(
    beforeState,
    afterState,
    response,
    sources,
    seenSourceIds
  );
  collectRelationshipSources(beforeState, afterState, response, sources, seenSourceIds);

  const localTotal = sources.reduce((sum, source) => sum + source.amount, 0);
  const modelSuggestedGain = normalizeModelSuggestedGain(response);
  const uncappedTotal = Math.max(localTotal, modelSuggestedGain ?? 0);
  const turnCap = localTotal === 0 ? 8 : hasMajorProgress ? 60 : 30;
  const total = Math.min(turnCap, uncappedTotal);
  if (total <= 0) return { state: afterState };

  if ((modelSuggestedGain ?? 0) > localTotal) {
    addUniqueSource(sources, seenSourceIds, {
      kind: 'model_proposal',
      sourceId: `model-proposal:${turnId}`,
      amount: total - localTotal,
      reason:
        response.writeback.playerPatch?.progression?.reason?.trim() ||
        '本回合获得了难以由结构化记录表达的成长'
    });
  }

  const progressionResult = applyExperienceGain(afterState.player.progression, total);
  const award: TurnExperienceAward = {
    awardId: `xp:${turnId}`,
    turnId,
    total,
    sources,
    ...(modelSuggestedGain !== undefined ? { modelSuggestedGain } : {}),
    capped: uncappedTotal > turnCap,
    levelsGained: progressionResult.levelsGained,
    attributePointsGained: progressionResult.attributePointsGained,
    levelAfter: progressionResult.progression.level
  };
  const storyLog = [...afterState.storyLog];
  storyLog[narratorIndex] = {
    ...storyLog[narratorIndex]!,
    experienceAward: award
  };

  return {
    state: {
      ...afterState,
      player: {
        ...afterState.player,
        progression: progressionResult.progression
      },
      storyLog
    },
    award
  };
}
