import type { DynamicContextProjection } from '../dynamic/dynamicContextProjector';
import type { RelationshipContextProjection } from '../relationship/relationshipContextProjector';
import type { Actor, RuntimeState } from '../runtime/types';

export type RemoteNpcPresenceSource =
  | 'relationshipHeartbeat'
  | 'currentMatter'
  | 'signal'
  | 'news'
  | 'dueDynamicEvent';

export interface RemoteNpcPresenceCandidate {
  actorId: string;
  actorName: string;
  source: RemoteNpcPresenceSource;
  sourceId: string;
  title: string;
  triggerReasons: string[];
  basis: string[];
  presenceHint: string;
  score: number;
}

export interface RemoteNpcPresenceProjection {
  candidates: RemoteNpcPresenceCandidate[];
  diagnostics: {
    selectedActorIds: string[];
    selectedCandidateIds: string[];
    omittedCandidateCount: number;
    missingActorRefs: string[];
  };
}

export interface RemoteNpcPresenceOptions {
  playerInput?: string;
  maxCandidates?: number;
}

const DEFAULT_MAX_CANDIDATES = 4;

const sourceBaseScore: Record<RemoteNpcPresenceSource, number> = {
  relationshipHeartbeat: 500,
  dueDynamicEvent: 450,
  currentMatter: 350,
  signal: 300,
  news: 250
};

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function compact(values: Array<string | undefined>): string[] {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function actorSearchValues(actor: Actor): string[] {
  return compact([actor.actorId, actor.name, actor.englishName, actor.callName, ...actor.aliases]);
}

function isMentioned(actor: Actor, text: string): boolean {
  const normalizedText = normalize(text);
  if (!normalizedText) return false;
  return actorSearchValues(actor).some((value) => normalizedText.includes(normalize(value)));
}

function isRemoteVisibleActor(state: RuntimeState, actor: Actor | undefined): actor is Actor {
  if (!actor) return false;
  if (actor.actorId === state.player.actorId) return false;
  if (actor.visibility === 'hidden') return false;
  if (actor.presence === 'present' || actor.presence === 'nearby') return false;
  const currentScene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  if (currentScene?.presentActorIds.includes(actor.actorId)) return false;
  return true;
}

function actorBasis(actor: Actor): string[] {
  return compact([
    actor.statusSummary ? `远场状态: ${actor.statusSummary}` : undefined,
    actor.motivation ? `动机: ${actor.motivation}` : undefined,
    actor.relationshipSummary ? `与玩家关系: ${actor.relationshipSummary}` : undefined,
    actor.attitudeTowardPlayer ? `对玩家态度: ${actor.attitudeTowardPlayer}` : undefined,
    actor.trustTendency ? `信任/戒备: ${actor.trustTendency}` : undefined,
    actor.entanglementSummary ? `牵连: ${actor.entanglementSummary}` : undefined
  ]);
}

function channelForSource(source: RemoteNpcPresenceSource): string {
  if (source === 'relationshipHeartbeat') return '电话、传呼、托人带话、街边偶遇或旧记忆回响';
  if (source === 'dueDynamicEvent') return '已到期的动态事件、传呼、电话或他人转述';
  if (source === 'currentMatter') return '当前事项压力、未处理牵连或他人提醒';
  if (source === 'signal') return '街头传闻、警署口风、组织消息或媒体线索';
  return '报纸、杂志、广播新闻或旁人提及';
}

function presenceHint(actor: Actor, source: RemoteNpcPresenceSource, title: string): string {
  return `未裁定建议：${actor.name}可通过${channelForSource(source)}在本回合形成远场存在感，围绕「${title}」轻触剧情；只有正文自然采纳后，才允许写回关系、记忆、当前事项、新闻或延迟事件。`;
}

function buildTriggerReasons(source: RemoteNpcPresenceSource, actor: Actor, sourceText: string, playerInput: string): string[] {
  const reasons: string[] = [source];
  const normalizedInput = normalize(playerInput);
  if (normalizedInput && (isMentioned(actor, playerInput) || normalize(sourceText).includes(normalizedInput))) {
    reasons.push('player_input_mention');
  }
  if (actor.importance >= 70) reasons.push('high_importance');
  if (actor.relationshipSummary || actor.attitudeTowardPlayer) reasons.push('relationship_context');
  return reasons;
}

function candidateScore(
  source: RemoteNpcPresenceSource,
  actor: Actor,
  sourceImportance: number,
  triggerReasons: string[]
): number {
  return (
    sourceBaseScore[source] +
    actor.importance +
    sourceImportance +
    (triggerReasons.includes('player_input_mention') ? 120 : 0) +
    (triggerReasons.includes('relationship_context') ? 10 : 0)
  );
}

function selectActorRefs(
  state: RuntimeState,
  actorIds: string[],
  omitted: { count: number },
  missingActorRefs: Set<string>
): Actor[] {
  const actors: Actor[] = [];
  for (const actorId of actorIds) {
    const actor = state.actors[actorId];
    if (!actor) {
      missingActorRefs.add(actorId);
      omitted.count += 1;
      continue;
    }
    if (!isRemoteVisibleActor(state, actor)) {
      omitted.count += 1;
      continue;
    }
    actors.push(actor);
  }
  return actors;
}

function upsertByActor(
  byActor: Map<string, RemoteNpcPresenceCandidate>,
  candidate: RemoteNpcPresenceCandidate
): void {
  const existing = byActor.get(candidate.actorId);
  if (!existing || candidate.score > existing.score) {
    byActor.set(candidate.actorId, candidate);
  }
}

export function projectRemoteNpcPresence(
  state: RuntimeState,
  relationshipProjection: RelationshipContextProjection,
  dynamicProjection: DynamicContextProjection,
  options: RemoteNpcPresenceOptions = {}
): RemoteNpcPresenceProjection {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const playerInput = options.playerInput ?? '';
  const omitted = { count: 0 };
  const missingActorRefs = new Set<string>();
  const byActor = new Map<string, RemoteNpcPresenceCandidate>();

  for (const heartbeat of relationshipProjection.heartbeatCandidates) {
    const sourceText = `${heartbeat.title} ${heartbeat.summary} ${heartbeat.reason}`;
    for (const actor of selectActorRefs(state, heartbeat.relatedActorIds, omitted, missingActorRefs)) {
      const basis = compact([
        `关系心跳: ${heartbeat.title}`,
        `beatType: ${heartbeat.beatType}`,
        `reason: ${heartbeat.reason}`,
        `summary: ${heartbeat.summary}`,
        ...actorBasis(actor)
      ]);
      const triggerReasons = buildTriggerReasons('relationshipHeartbeat', actor, sourceText, playerInput);
      upsertByActor(byActor, {
        actorId: actor.actorId,
        actorName: actor.name,
        source: 'relationshipHeartbeat',
        sourceId: heartbeat.threadId,
        title: heartbeat.title,
        triggerReasons,
        basis,
        presenceHint: presenceHint(actor, 'relationshipHeartbeat', heartbeat.title),
        score: candidateScore('relationshipHeartbeat', actor, heartbeat.importance, triggerReasons)
      });
    }
  }

  for (const matter of dynamicProjection.currentMatters) {
    const sourceText = `${matter.title} ${matter.summary} ${matter.currentHook ?? ''} ${matter.consequenceHint ?? ''}`;
    for (const actor of selectActorRefs(state, matter.relatedActorIds, omitted, missingActorRefs)) {
      const basis = compact([
        `当前事项: ${matter.title}`,
        `summary: ${matter.summary}`,
        matter.currentHook ? `currentHook: ${matter.currentHook}` : undefined,
        matter.consequenceHint ? `consequenceHint: ${matter.consequenceHint}` : undefined,
        ...actorBasis(actor)
      ]);
      const triggerReasons = buildTriggerReasons('currentMatter', actor, sourceText, playerInput);
      upsertByActor(byActor, {
        actorId: actor.actorId,
        actorName: actor.name,
        source: 'currentMatter',
        sourceId: matter.id,
        title: matter.title,
        triggerReasons,
        basis,
        presenceHint: presenceHint(actor, 'currentMatter', matter.title),
        score: candidateScore('currentMatter', actor, matter.priority, triggerReasons)
      });
    }
  }

  for (const signal of dynamicProjection.signals) {
    const sourceText = `${signal.title} ${signal.summary}`;
    for (const actor of selectActorRefs(state, signal.relatedActorIds, omitted, missingActorRefs)) {
      const basis = compact([
        `信号: ${signal.title}`,
        `type: ${signal.signalType}`,
        `reliability: ${signal.reliability}`,
        `summary: ${signal.summary}`,
        ...actorBasis(actor)
      ]);
      const triggerReasons = buildTriggerReasons('signal', actor, sourceText, playerInput);
      upsertByActor(byActor, {
        actorId: actor.actorId,
        actorName: actor.name,
        source: 'signal',
        sourceId: signal.id,
        title: signal.title,
        triggerReasons,
        basis,
        presenceHint: presenceHint(actor, 'signal', signal.title),
        score: candidateScore('signal', actor, signal.reliability === 'high' ? 30 : 15, triggerReasons)
      });
    }
  }

  for (const issue of dynamicProjection.newsIssues) {
    for (const article of issue.articles) {
      const sourceText = `${issue.headline} ${issue.summary} ${article.headline} ${article.body}`;
      for (const actor of selectActorRefs(state, article.relatedActorIds, omitted, missingActorRefs)) {
        const basis = compact([
          `新闻: ${issue.outletName} - ${issue.headline}`,
          `article: ${article.headline}`,
          `body: ${article.body}`,
          ...actorBasis(actor)
        ]);
        const triggerReasons = buildTriggerReasons('news', actor, sourceText, playerInput);
        upsertByActor(byActor, {
          actorId: actor.actorId,
          actorName: actor.name,
          source: 'news',
          sourceId: `${issue.id}:${article.id}`,
          title: article.headline,
          triggerReasons,
          basis,
          presenceHint: presenceHint(actor, 'news', article.headline),
          score: candidateScore('news', actor, article.playerRelated ? 30 : 10, triggerReasons)
        });
      }
    }
  }

  for (const event of dynamicProjection.dueDeferredEvents) {
    const actorId = event.relatedIds.actorId;
    if (!actorId) continue;
    const sourceText = `${event.title} ${event.summary} ${event.promptInstruction}`;
    for (const actor of selectActorRefs(state, [actorId], omitted, missingActorRefs)) {
      const basis = compact([
        `到期动态事件: ${event.title}`,
        `summary: ${event.summary}`,
        `instruction: ${event.promptInstruction}`,
        ...actorBasis(actor)
      ]);
      const triggerReasons = buildTriggerReasons('dueDynamicEvent', actor, sourceText, playerInput);
      upsertByActor(byActor, {
        actorId: actor.actorId,
        actorName: actor.name,
        source: 'dueDynamicEvent',
        sourceId: event.eventId,
        title: event.title,
        triggerReasons,
        basis,
        presenceHint: presenceHint(actor, 'dueDynamicEvent', event.title),
        score: candidateScore('dueDynamicEvent', actor, 70, triggerReasons)
      });
    }
  }

  const candidates = [...byActor.values()]
    .sort((left, right) => right.score - left.score || left.actorId.localeCompare(right.actorId))
    .slice(0, maxCandidates);

  return {
    candidates,
    diagnostics: {
      selectedActorIds: candidates.map((candidate) => candidate.actorId),
      selectedCandidateIds: candidates.map((candidate) => `${candidate.source}:${candidate.sourceId}:${candidate.actorId}`),
      omittedCandidateCount: omitted.count + Math.max(0, byActor.size - candidates.length),
      missingActorRefs: [...missingActorRefs].sort()
    }
  };
}
