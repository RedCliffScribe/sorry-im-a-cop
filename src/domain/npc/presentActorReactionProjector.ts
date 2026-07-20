import type { Actor } from '../runtime/types';

export interface PresentActorReactionCandidate {
  actorId: string;
  actorName: string;
  triggerReasons: string[];
  basis: string[];
  reactionHint: string;
  score: number;
}

export interface PresentActorReactionProjection {
  candidates: PresentActorReactionCandidate[];
  diagnostics: {
    sourceActorCount: number;
    selectedActorIds: string[];
    omittedActorCount: number;
  };
}

export interface PresentActorReactionOptions {
  playerActorId?: string;
  playerInput?: string;
  currentSceneSummary?: string;
  maxCandidates?: number;
}

const DEFAULT_MAX_CANDIDATES = 5;

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function compact(values: Array<string | undefined>): string[] {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function actorSearchValues(actor: Actor): string[] {
  return compact([actor.actorId, actor.name, actor.englishName, actor.callName, ...actor.aliases]);
}

function isActorMentioned(actor: Actor, playerInput: string): boolean {
  const input = normalize(playerInput);
  if (!input) return false;
  return actorSearchValues(actor).some((value) => input.includes(normalize(value)));
}

function buildBasis(actor: Actor, currentSceneSummary: string | undefined): string[] {
  return compact([
    currentSceneSummary ? `当前场景: ${currentSceneSummary}` : undefined,
    actor.statusSummary ? `当前状态: ${actor.statusSummary}` : undefined,
    actor.personality ? `性格: ${actor.personality}` : undefined,
    actor.speechStyle ? `说话风格: ${actor.speechStyle}` : undefined,
    actor.motivation ? `动机: ${actor.motivation}` : undefined,
    actor.longTermGoal ? `长期目标: ${actor.longTermGoal}` : undefined,
    actor.values ? `价值观: ${actor.values}` : undefined,
    actor.relationshipSummary ? `与玩家关系: ${actor.relationshipSummary}` : undefined,
    actor.attitudeTowardPlayer ? `对玩家态度: ${actor.attitudeTowardPlayer}` : undefined,
    actor.trustTendency ? `信任/戒备: ${actor.trustTendency}` : undefined,
    actor.entanglementSummary ? `牵连: ${actor.entanglementSummary}` : undefined
  ]);
}

function buildTriggerReasons(actor: Actor, mentioned: boolean): string[] {
  const reasons = ['scene_present'];
  if (mentioned) reasons.push('player_input_mention');
  if (actor.importance >= 70) reasons.push('high_importance');
  if (actor.relationshipSummary || actor.attitudeTowardPlayer || actor.trustTendency) reasons.push('relationship_context');
  if (actor.statusSummary || actor.motivation) reasons.push('current_intent_context');
  return reasons;
}

function scoreActor(actor: Actor, mentioned: boolean): number {
  return (
    actor.importance +
    Math.round(actor.interactionScore / 2) +
    (mentioned ? 120 : 0) +
    (actor.relationshipSummary || actor.attitudeTowardPlayer ? 12 : 0) +
    (actor.statusSummary || actor.motivation ? 8 : 0)
  );
}

function reactionHint(actor: Actor): string {
  const style = actor.speechStyle || '其既有人设';
  const posture = compact([actor.motivation, actor.attitudeTowardPlayer, actor.statusSummary]).join('；') || '当前场景压力';
  return `未裁定建议：${actor.name}可基于「${posture}」作出短促反应；正文可用${style}表现其观察、追问、打断、提醒、沉默或退让，但不要把该候选当成已发生事实。`;
}

export function projectPresentActorReactions(
  actors: Actor[],
  options: PresentActorReactionOptions = {}
): PresentActorReactionProjection {
  const playerActorId = options.playerActorId ?? 'player';
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  const candidates = actors
    .filter((actor) => actor.actorId !== playerActorId)
    .filter((actor) => actor.visibility !== 'hidden')
    .filter((actor) => actor.presence === 'present')
    .map((actor) => {
      const mentioned = isActorMentioned(actor, options.playerInput ?? '');
      return {
        actorId: actor.actorId,
        actorName: actor.name,
        triggerReasons: buildTriggerReasons(actor, mentioned),
        basis: buildBasis(actor, options.currentSceneSummary),
        reactionHint: reactionHint(actor),
        score: scoreActor(actor, mentioned)
      };
    })
    .sort((left, right) => right.score - left.score || right.actorId.localeCompare(left.actorId))
    .slice(0, maxCandidates);

  return {
    candidates,
    diagnostics: {
      sourceActorCount: actors.length,
      selectedActorIds: candidates.map((candidate) => candidate.actorId),
      omittedActorCount: Math.max(0, actors.length - candidates.length)
    }
  };
}
