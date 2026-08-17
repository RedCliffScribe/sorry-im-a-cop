import { selectActiveNpcMemoryLayers } from '../memory/npcMemoryLayers';
import type { MemoryItem, NpcEvolutionTrack, RuntimeState } from '../runtime/types';
import { isCurrentSignal } from '../dynamic/signalLifecycle';
import {
  describeGameTimeRelativeTo,
  formatGameTimeWithWeekday,
  formatTimeReferenceFrame
} from '../time/gameTime';
import {
  formatMemoryTemporalReferences,
  normalizeMemoryTemporalText,
  projectMemoryTemporalContext
} from '../time/memoryTemporal';
import { selectEverydayEmployerTemplates } from '../worldpack/hk1980sLivelihood';
import { backgroundTrackMemoryPrefix } from './ids';
import type {
  BackgroundEvolutionSelection,
  BackgroundNpcCandidate,
  BackgroundOrganizationCandidate
} from './selection';
import { addGameHours } from './time';

const MAX_BACKGROUND_RECENT_OUTCOMES = 4;
const MAX_BACKGROUND_CHRONICLE = 2;
const MAX_PROMPT_TEXT = 36_000;

function newest<T>(items: T[], count: number): T[] {
  return items.slice(Math.max(0, items.length - count)).reverse();
}

function compactMemory(memory: MemoryItem, currentTime: RuntimeState['time']) {
  const temporalProjection = projectMemoryTemporalContext(memory);
  return {
    memoryId: memory.memoryId,
    text: temporalProjection.text.slice(0, 420),
    tier: memory.tier ?? 'short_term',
    gameTime: memory.gameTime,
    periodStart: memory.periodStart,
    periodEnd: memory.periodEnd,
    certainty: memory.certainty,
    relatedCaseIds: memory.relatedCaseIds,
    relatedPlaceIds: memory.relatedPlaceIds,
    temporalReferences: formatMemoryTemporalReferences(temporalProjection.temporalReferences, currentTime)
  };
}

function selectedMemories(state: RuntimeState, candidate: BackgroundNpcCandidate, track?: NpcEvolutionTrack) {
  const layers = selectActiveNpcMemoryLayers(state.memories, candidate.actorId, {
    includeHidden: true,
    includePrivate: true
  });
  const activeTrackMemoryPrefix = track ? backgroundTrackMemoryPrefix(track.trackId) : undefined;
  const withoutActiveStartDuplicate = (memory: MemoryItem) =>
    !activeTrackMemoryPrefix || !memory.memoryId.startsWith(`${activeTrackMemoryPrefix}created_`);
  return {
    shortTerm: newest(layers.shortTerm.filter(withoutActiveStartDuplicate), 4).map((memory) =>
      compactMemory(memory, state.time)
    ),
    midTerm: newest(layers.midTerm, 2).map((memory) => compactMemory(memory, state.time)),
    longTerm: newest(layers.longTerm, 1).map((memory) => compactMemory(memory, state.time))
  };
}

function actorPacket(state: RuntimeState, candidate: BackgroundNpcCandidate) {
  const actor = state.actors[candidate.actorId];
  const track = candidate.trackId ? state.backgroundEvolution.npcTracks[candidate.trackId] : undefined;
  if (!actor) return undefined;
  const memories = selectedMemories(state, candidate, track);
  const latestStructuredMemory = memories.shortTerm[0] ?? memories.midTerm[0] ?? memories.longTerm[0];
  const fallbackReferenceTime = actor.lastSeenAt;
  const fallbackRecentMemory = actor.recentInteractionMemory
    ? fallbackReferenceTime
      ? (() => {
          const normalized = normalizeMemoryTemporalText(actor.recentInteractionMemory, fallbackReferenceTime);
          return {
            text: normalized.text,
            gameTime: fallbackReferenceTime,
            relative: describeGameTimeRelativeTo(fallbackReferenceTime, state.time),
            temporalReferences: formatMemoryTemporalReferences(normalized.temporalReferences, state.time),
            source: 'legacy_actor_cache'
          };
        })()
      : {
          text: actor.recentInteractionMemory,
          source: 'legacy_unanchored_actor_cache',
          warning: '没有可靠形成时间；其中相对时间词不得解释为当前日期。'
        }
    : undefined;
  return {
    actor: {
      actorId: actor.actorId,
      name: actor.name,
      publicIdentity: actor.publicIdentity,
      positionSummary: actor.positionSummary,
      profileSummary: actor.profileSummary,
      currentPlaceId: actor.currentPlaceId,
      presence: actor.presence,
      statusSummary: actor.statusSummary,
      relationshipSummary: actor.relationshipSummary,
      // The latest structured memory is already present in `memories`; only expose
      // the legacy actor cache when no timestamped memory exists, avoiding duplicate
      // evidence and duplicate token cost.
      recentInteractionMemory: latestStructuredMemory ? undefined : fallbackRecentMemory,
      personality: actor.personality,
      motivation: actor.motivation,
      longTermGoal: actor.longTermGoal,
      organizationIds: actor.organizationIds,
      visibility: actor.visibility,
      importance: actor.importance
    },
    review: {
      reviewKey: candidate.reviewKey,
      trigger: candidate.trigger,
      allowMaterialProgress: candidate.allowMaterialProgress,
      visibilityHint: candidate.visibilityHint
    },
    currentTrack: track,
    memories,
    cases: candidate.relatedCaseIds
      .map((caseId) => state.cases[caseId])
      .filter(Boolean)
      .map((caseFile) => ({
        caseId: caseFile.caseId,
        title: caseFile.title,
        status: caseFile.status,
        playerRole: caseFile.playerRole,
        leadActorId: caseFile.leadActorId,
        summary: caseFile.summary,
        currentFocus: caseFile.currentFocus,
        internalProgressSummary: caseFile.internalProgressSummary,
        recentActivity: newest(caseFile.activityLog, 3),
        relatedActorIds: caseFile.relatedActorIds,
        relatedPlaceIds: caseFile.relatedPlaceIds,
        relatedOrganizationIds: caseFile.relatedOrganizationIds,
        evidenceIds: caseFile.evidenceIds
      })),
    relationships: candidate.relatedRelationshipThreadIds
      .map((threadId) => state.relationshipThreads[threadId])
      .filter(Boolean)
      .map((thread) => ({
        threadId: thread.threadId,
        kind: thread.kind,
        status: thread.status,
        relationshipRole: thread.relationshipRole,
        summary: thread.summary,
        currentPull: thread.currentPull,
        promiseSummary: thread.promiseSummary,
        conflictSummary: thread.conflictSummary,
        riskSummary: thread.riskSummary,
        nextNaturalBeatHint: thread.nextNaturalBeatHint,
        visibility: thread.visibility,
        relatedActorIds: thread.relatedActorIds
      }))
  };
}

function organizationPacket(state: RuntimeState, candidate: BackgroundOrganizationCandidate) {
  const organization = state.organizations[candidate.organizationId];
  if (!organization) return undefined;
  const track = candidate.trackId ? state.backgroundEvolution.organizationTracks[candidate.trackId] : undefined;
  const hiddenPlayerRelation = state.actors[state.player.actorId]?.organizationRelations.some(
    (relation) => relation.organizationId === candidate.organizationId && relation.visibility === 'hidden'
  );
  const visibilityCeiling =
    hiddenPlayerRelation && candidate.trigger === 'foreground-impact'
      ? 'player_known'
      : organization.visibility === 'public'
        ? 'public'
        : organization.visibility === 'player_known'
          ? 'player_known'
          : 'hidden';
  const relatedMatters = Object.values(state.dynamicEvents.currentMatters)
    .filter((matter) => matter.relatedOrganizationIds.includes(candidate.organizationId))
    .sort((left, right) => right.updatedAt.year - left.updatedAt.year || right.updatedAt.month - left.updatedAt.month || right.updatedAt.day - left.updatedAt.day);
  const currentMatters = relatedMatters
    .slice(0, 2)
    .map((matter) => ({ id: matter.id, title: matter.title, status: matter.status, summary: matter.summary }));
  const playerTriadProfile =
    state.player.currentIdentity === 'gang_member'
      ? state.actors[state.player.actorId]?.roleProfiles.triad
      : undefined;
  const playerCivilianProfile =
    state.player.currentIdentity === 'civilian'
      ? state.actors[state.player.actorId]?.roleProfiles.civilian
      : undefined;
  const triadPlayerRoleContext =
    playerTriadProfile &&
    (playerTriadProfile.status === 'active' || playerTriadProfile.status === 'cover') &&
    playerTriadProfile.organizationId === candidate.organizationId
      ? {
          kind: 'triad' as const,
          roleTitle: playerTriadProfile.roleTitle,
          rankSummary: playerTriadProfile.rankSummary,
          territorySummary: playerTriadProfile.territorySummary,
          obligationSummary: playerTriadProfile.obligationSummary,
          riskSummary: playerTriadProfile.riskSummary,
          patronActorIds: playerTriadProfile.patronActorIds.filter((actorId) => Boolean(state.actors[actorId])),
          peerActorIds: playerTriadProfile.peerActorIds.filter((actorId) => Boolean(state.actors[actorId])),
          currentResponsibilities: relatedMatters
            .filter(
              (matter) =>
                matter.source === 'triad_responsibility' &&
                matter.visibility === 'known' &&
                (matter.status === 'active' || matter.status === 'dormant')
            )
            .slice(0, 2)
            .map((matter) => ({
              id: matter.id,
              title: matter.title,
              status: matter.status,
              summary: matter.summary,
              currentHook: matter.currentHook,
              relatedActorIds: matter.relatedActorIds
            }))
        }
      : undefined;
  const civilianPlayerRoleContext =
    playerCivilianProfile &&
    (playerCivilianProfile.status === 'active' ||
      playerCivilianProfile.status === 'cover') &&
    playerCivilianProfile.employerOrganizationId === candidate.organizationId
      ? {
          kind: 'civilian' as const,
          publicOccupation: playerCivilianProfile.publicOccupation,
          employmentStatusId: playerCivilianProfile.employmentStatusId,
          workplacePlaceId: playerCivilianProfile.workplacePlaceId,
          workUnitSummary: playerCivilianProfile.workUnitSummary,
          positionSummary: playerCivilianProfile.positionSummary,
          dutySummary: playerCivilianProfile.dutySummary,
          decisionScopeSummary: playerCivilianProfile.decisionScopeSummary,
          accessSummary: playerCivilianProfile.accessSummary,
          familyEconomicSummary: playerCivilianProfile.familyEconomicSummary,
          livelihoodActorIds: (playerCivilianProfile.livelihoodActorIds ?? []).filter(
            (actorId) => Boolean(state.actors[actorId])
          ),
          employerTemplateCandidates: selectEverydayEmployerTemplates({
            year: state.time.year,
            sectorIds: playerCivilianProfile.sectorIds,
            roleTags: playerCivilianProfile.roleTags,
            limit: 3
          }).map((template) => ({
            templateId: template.templateId,
            directionThemes: template.directionThemes,
            pressureThemes: template.pressureThemes,
            matterThemes: template.matterThemes,
            workRelationFunctions: template.workRelationFunctions
          })),
          currentLivelihoodMatters: relatedMatters
            .filter(
              (matter) =>
                matter.matterKind === 'livelihood' &&
                matter.visibility === 'known' &&
                (matter.status === 'active' || matter.status === 'dormant')
            )
            .slice(0, 2)
            .map((matter) => ({
              id: matter.id,
              title: matter.title,
              status: matter.status,
              summary: matter.summary,
              currentHook: matter.currentHook,
              relatedActorIds: matter.relatedActorIds
            }))
        }
      : undefined;
  const playerRoleContext =
    triadPlayerRoleContext ?? civilianPlayerRoleContext;
  const signals = Object.values(state.dynamicEvents.signals)
    .filter(
      (signal) =>
        isCurrentSignal(signal, state.time) &&
        signal.relatedOrganizationIds.includes(candidate.organizationId)
    )
    .slice(0, Math.max(0, 2 - currentMatters.length))
    .map((signal) => ({ id: signal.id, title: signal.title, status: signal.status, summary: signal.summary }));
  return {
    organization: {
      organizationId: organization.organizationId,
      name: organization.name,
      type: organization.type,
      summary: organization.summary,
      publicKnowledge: organization.publicKnowledge,
      currentState: organization.currentState,
      stanceTowardPlayer: hiddenPlayerRelation ? '当前公开身份下没有直接关系。' : organization.stanceTowardPlayer,
      pressureSummary: hiddenPlayerRelation ? undefined : organization.pressureSummary,
      triadProfile: organization.triadProfile,
      triadState: organization.triadState,
      visibility: organization.visibility
    },
    review: {
      reviewKey: candidate.reviewKey,
      trigger: candidate.trigger,
      allowMaterialProgress: candidate.allowMaterialProgress,
      allowPlayerStanceChange: candidate.allowPlayerStanceChange,
      visibilityCeiling,
      earliestNextReviewAt: addGameHours(state.time, 24)
    },
    currentTrack: track,
    playerRoleContext,
    actors: candidate.relatedActorIds
      .map((actorId) => state.actors[actorId])
      .filter(Boolean)
      .map((actor) => ({
        actorId: actor.actorId,
        name: actor.name,
        publicIdentity: actor.publicIdentity,
        positionSummary: actor.positionSummary,
        currentPlaceId: actor.currentPlaceId,
        statusSummary: actor.statusSummary,
        organizationRelations: actor.organizationRelations.filter(
          (relation) => relation.organizationId === candidate.organizationId && relation.visibility !== 'hidden'
        )
      })),
    places: candidate.relatedPlaceIds
      .map((placeId) => state.places[placeId])
      .filter(Boolean)
      .map((place) => ({ placeId: place.placeId, name: place.nameZh ?? place.name, currentState: place.currentState })),
    cases: candidate.relatedCaseIds
      .map((caseId) => state.cases[caseId])
      .filter(Boolean)
      .map((caseFile) => ({
        caseId: caseFile.caseId,
        title: caseFile.title,
        status: caseFile.status,
        playerRole: caseFile.playerRole,
        leadActorId: caseFile.leadActorId,
        currentFocus: caseFile.currentFocus,
        internalProgressSummary: caseFile.internalProgressSummary
      })),
    cityTracks: candidate.relatedCityTrackIds.map((trackId) => state.citySituationTracks[trackId]).filter(Boolean),
    currentDynamics: [...currentMatters, ...signals],
    recentOutcomes: state.backgroundEvolution.recentOutcomes
      .filter(
        (outcome) =>
          outcome.sourceKind === 'organization' && outcome.sourceId === candidate.organizationId ||
          outcome.relatedOrganizationIds.includes(candidate.organizationId)
      )
      .slice(-2),
    chronicle: state.backgroundEvolution.chronicle
      .filter((entry) => entry.relatedOrganizationIds.includes(candidate.organizationId))
      .slice(-1)
  };
}

function projectForegroundDelta(state: RuntimeState, selection: BackgroundEvolutionSelection) {
  const delta = selection.foregroundDelta;
  if (!delta) return undefined;
  const hiddenOrganizationIds = new Set(
    delta.touched.organizationIds.filter((organizationId) =>
      state.actors[state.player.actorId]?.organizationRelations.some(
        (relation) => relation.organizationId === organizationId && relation.visibility === 'hidden'
      )
    )
  );
  if (hiddenOrganizationIds.size === 0) return delta;
  return {
    ...delta,
    turnSummary: '',
    hiddenForegroundRedacted: true,
    touched: {
      ...delta.touched,
      organizationIds: delta.touched.organizationIds.filter((organizationId) => !hiddenOrganizationIds.has(organizationId))
    },
    canonicalSnapshots: {
      ...delta.canonicalSnapshots,
      organizations: delta.canonicalSnapshots.organizations.filter(
        (organization) => !hiddenOrganizationIds.has(organization.organizationId)
      )
    }
  };
}

function relatedToSelection(ids: string[], selectedIds: Set<string>): boolean {
  return ids.some((id) => selectedIds.has(id));
}

function createContextPacket(state: RuntimeState, selection: BackgroundEvolutionSelection) {
  const actorIds = new Set(selection.npcCandidates.map((candidate) => candidate.actorId));
  const caseIds = new Set(selection.npcCandidates.flatMap((candidate) => candidate.relatedCaseIds));
  const relationshipIds = new Set(selection.npcCandidates.flatMap((candidate) => candidate.relatedRelationshipThreadIds));
  const organizationIds = new Set(selection.organizationCandidates.map((candidate) => candidate.organizationId));
  const cityTrackIds = new Set(selection.cityCandidates.map((candidate) => candidate.trackId));
  const npcPackets = selection.npcCandidates.map((candidate) => actorPacket(state, candidate)).filter(Boolean);
  const organizationPackets = selection.organizationCandidates
    .map((candidate) => organizationPacket(state, candidate))
    .filter(Boolean);
  const referencedPlaceIds = new Set<string>();
  const referencedOrganizationIds = new Set<string>();
  for (const packet of npcPackets) {
    if (!packet) continue;
    if (packet.actor.currentPlaceId) referencedPlaceIds.add(packet.actor.currentPlaceId);
    for (const organizationId of packet.actor.organizationIds) referencedOrganizationIds.add(organizationId);
    for (const caseFile of packet.cases) {
      for (const placeId of caseFile.relatedPlaceIds) referencedPlaceIds.add(placeId);
      for (const organizationId of caseFile.relatedOrganizationIds) referencedOrganizationIds.add(organizationId);
    }
  }
  for (const candidate of selection.organizationCandidates) {
    referencedOrganizationIds.add(candidate.organizationId);
    for (const actorId of candidate.relatedActorIds) actorIds.add(actorId);
    for (const placeId of candidate.relatedPlaceIds) referencedPlaceIds.add(placeId);
    for (const caseId of candidate.relatedCaseIds) caseIds.add(caseId);
    for (const trackId of candidate.relatedCityTrackIds) cityTrackIds.add(trackId);
  }
  for (const trackId of cityTrackIds) {
    const track = state.citySituationTracks[trackId];
    if (!track) continue;
    for (const placeId of track.relatedPlaceIds) referencedPlaceIds.add(placeId);
    for (const organizationId of track.relatedOrganizationIds) referencedOrganizationIds.add(organizationId);
  }

  const recentOutcomes = state.backgroundEvolution.recentOutcomes
    .filter(
      (outcome) =>
        relatedToSelection(outcome.relatedActorIds, actorIds) ||
        relatedToSelection(outcome.relatedCaseIds, caseIds) ||
        relatedToSelection(outcome.relatedRelationshipThreadIds, relationshipIds) ||
        relatedToSelection(outcome.relatedOrganizationIds, organizationIds) ||
        (outcome.sourceKind === 'organization' && organizationIds.has(outcome.sourceId)) ||
        (outcome.sourceKind === 'city' && cityTrackIds.has(outcome.sourceId))
    )
    .slice(-MAX_BACKGROUND_RECENT_OUTCOMES);
  const recentOutcomeIds = new Set(recentOutcomes.map((outcome) => outcome.outcomeId));
  const chronicle = state.backgroundEvolution.chronicle
    .filter(
      (entry) =>
        entry.sourceOutcomeIds.some((outcomeId) => recentOutcomeIds.has(outcomeId)) ||
        relatedToSelection(entry.relatedActorIds, actorIds) ||
        relatedToSelection(entry.relatedCaseIds, caseIds) ||
        relatedToSelection(entry.relatedOrganizationIds, organizationIds)
    )
    .slice(-MAX_BACKGROUND_CHRONICLE);

  return {
    foregroundDelta: projectForegroundDelta(state, selection),
    currentTime: state.time,
    currentTimeLabel: formatGameTimeWithWeekday(state.time),
    reason: selection.reason,
    excludedActorIds: selection.excludedActorIds,
    npcCandidates: npcPackets,
    organizationCandidates: organizationPackets,
    cityCandidates: selection.cityCandidates.map((candidate) => ({
      reviewKey: candidate.reviewKey,
      trigger: candidate.trigger,
      track: state.citySituationTracks[candidate.trackId]
    })),
    places: [...referencedPlaceIds]
      .slice(0, 3)
      .map((placeId) => state.places[placeId])
      .filter(Boolean)
      .map((place) => ({ placeId: place.placeId, name: place.nameZh ?? place.name, summary: place.summary })),
    organizations: [...referencedOrganizationIds]
      .filter((organizationId) => !organizationIds.has(organizationId))
      .slice(0, 3)
      .map((organizationId) => state.organizations[organizationId])
      .filter(Boolean)
      .map((organization) => ({
        organizationId: organization.organizationId,
        name: organization.name,
        type: organization.type,
        currentState: organization.currentState,
        pressureSummary: organization.pressureSummary
      })),
    dueDeferredEvents: Object.values(state.deferredEvents)
      .filter((event) => event.status === 'pending')
      .filter(
        (event) =>
          Boolean(event.relatedIds.actorId && actorIds.has(event.relatedIds.actorId)) ||
          Boolean(event.relatedIds.caseId && caseIds.has(event.relatedIds.caseId)) ||
          Boolean(event.relatedIds.organizationId && referencedOrganizationIds.has(event.relatedIds.organizationId))
      )
      .slice(0, 4),
    recentOutcomes,
    chronicle,
    diagnostics: {
      selectedReviewKeys: selection.selectedReviewKeys,
      truncatedNpcCount: selection.truncatedNpcCount,
      truncatedOrganizationCount: selection.truncatedOrganizationCount,
      truncatedCityCount: selection.truncatedCityCount,
      contextCompaction: undefined as string | undefined
    }
  };
}

type BackgroundEvolutionContextPacket = ReturnType<typeof createContextPacket>;

function preserveContextString(key: string): boolean {
  return /(?:Id|Ids|Key|Keys)$/.test(key);
}

function stringifyContextWithTextLimit(
  packet: unknown,
  textLimit: number
): string {
  return JSON.stringify(packet, (key, value) => {
    if (
      typeof value !== 'string' ||
      value.length <= textLimit ||
      preserveContextString(key)
    ) {
      return value;
    }
    return `${value.slice(0, Math.max(1, textLimit - 1))}…`;
  });
}

function reduceContextHistory(
  packet: BackgroundEvolutionContextPacket
): BackgroundEvolutionContextPacket {
  return {
    ...packet,
    npcCandidates: packet.npcCandidates.flatMap((candidate) =>
      candidate
        ? [{
            ...candidate,
            memories: {
              shortTerm: candidate.memories.shortTerm.slice(0, 2),
              midTerm: candidate.memories.midTerm.slice(0, 1),
              longTerm: candidate.memories.longTerm.slice(0, 1)
            },
            cases: candidate.cases.slice(0, 1),
            relationships: candidate.relationships.slice(0, 2)
          }]
        : []
    ),
    organizationCandidates: packet.organizationCandidates.flatMap((candidate) =>
      candidate
        ? [{
            ...candidate,
            actors: candidate.actors.slice(0, 4),
            places: candidate.places.slice(0, 3),
            cases: candidate.cases.slice(0, 1),
            cityTracks: candidate.cityTracks.slice(0, 2),
            currentDynamics: candidate.currentDynamics.slice(0, 1),
            recentOutcomes: candidate.recentOutcomes.slice(-1),
            chronicle: []
          }]
        : []
    ),
    places: packet.places.slice(0, 2),
    organizations: packet.organizations.slice(0, 2),
    dueDeferredEvents: packet.dueDeferredEvents.slice(0, 2),
    recentOutcomes: packet.recentOutcomes.slice(-2),
    chronicle: packet.chronicle.slice(-1),
    diagnostics: {
      ...packet.diagnostics,
      contextCompaction: 'history-reduced'
    }
  };
}

function createMinimalContextPacket(packet: BackgroundEvolutionContextPacket) {
  return {
    foregroundDelta: packet.foregroundDelta,
    currentTime: packet.currentTime,
    currentTimeLabel: packet.currentTimeLabel,
    reason: packet.reason,
    excludedActorIds: packet.excludedActorIds,
    npcCandidates: packet.npcCandidates.flatMap((candidate) =>
      candidate
        ? [{
            actor: {
              actorId: candidate.actor.actorId,
              name: candidate.actor.name,
              publicIdentity: candidate.actor.publicIdentity,
              positionSummary: candidate.actor.positionSummary,
              profileSummary: candidate.actor.profileSummary,
              statusSummary: candidate.actor.statusSummary,
              visibility: candidate.actor.visibility,
              importance: candidate.actor.importance
            },
            review: candidate.review,
            currentTrack: candidate.currentTrack,
            cases: candidate.cases.slice(0, 1),
            relationships: candidate.relationships.slice(0, 1)
          }]
        : []
    ),
    organizationCandidates: packet.organizationCandidates.flatMap((candidate) =>
      candidate
        ? [{
            organization: {
              organizationId: candidate.organization.organizationId,
              name: candidate.organization.name,
              type: candidate.organization.type,
              currentState: candidate.organization.currentState,
              pressureSummary: candidate.organization.pressureSummary,
              visibility: candidate.organization.visibility
            },
            review: candidate.review,
            currentTrack: candidate.currentTrack,
            playerRoleContext: candidate.playerRoleContext,
            actors: candidate.actors.slice(0, 3),
            places: candidate.places.slice(0, 2),
            cases: candidate.cases.slice(0, 1),
            cityTracks: candidate.cityTracks.slice(0, 1),
            currentDynamics: candidate.currentDynamics.slice(0, 1)
          }]
        : []
    ),
    cityCandidates: packet.cityCandidates,
    places: packet.places.slice(0, 1),
    organizations: packet.organizations.slice(0, 1),
    dueDeferredEvents: packet.dueDeferredEvents.slice(0, 1),
    recentOutcomes: [],
    chronicle: [],
    diagnostics: {
      ...packet.diagnostics,
      contextCompaction: 'minimal'
    }
  };
}

function createIdentityOnlyContextPacket(packet: BackgroundEvolutionContextPacket) {
  return {
    currentTime: packet.currentTime,
    reason: packet.reason,
    npcCandidates: packet.npcCandidates.flatMap((candidate) =>
      candidate
        ? [{
            actor: {
              actorId: candidate.actor.actorId,
              name: candidate.actor.name
            },
            review: candidate.review,
            currentTrack: candidate.currentTrack
              ? {
                  trackId: candidate.currentTrack.trackId,
                  actorId: candidate.currentTrack.actorId,
                  status: candidate.currentTrack.status,
                  actionKind: candidate.currentTrack.actionKind,
                  objective: candidate.currentTrack.objective,
                  currentAction: candidate.currentTrack.currentAction,
                  currentStatus: candidate.currentTrack.currentStatus,
                  nextReviewAt: candidate.currentTrack.nextReviewAt
                }
              : undefined
          }]
        : []
    ),
    organizationCandidates: packet.organizationCandidates.flatMap((candidate) =>
      candidate
        ? [{
            organization: {
              organizationId: candidate.organization.organizationId,
              name: candidate.organization.name,
              type: candidate.organization.type
            },
            review: candidate.review,
            currentTrack: candidate.currentTrack
          }]
        : []
    ),
    cityCandidates: packet.cityCandidates.map((candidate) => ({
      reviewKey: candidate.reviewKey,
      trigger: candidate.trigger,
      track: candidate.track
        ? {
            trackId: candidate.track.trackId,
            title: candidate.track.title,
            trackType: candidate.track.trackType,
            status: candidate.track.status,
            pressureLevel: candidate.track.pressureLevel,
            visibility: candidate.track.visibility,
            currentBeat: candidate.track.currentBeat,
            nextReviewAt: candidate.track.nextReviewAt
          }
        : undefined
    })),
    diagnostics: {
      ...packet.diagnostics,
      contextCompaction: 'identity-only'
    }
  };
}

function serializeContextWithinBudget(
  packet: BackgroundEvolutionContextPacket,
  budget: number
): string {
  const textCompacted = {
    ...packet,
    diagnostics: {
      ...packet.diagnostics,
      contextCompaction: 'text-truncated'
    }
  };
  for (const textLimit of [420, 300, 220, 160, 120]) {
    const serialized = stringifyContextWithTextLimit(textCompacted, textLimit);
    if (serialized.length <= budget) return serialized;
  }

  const reduced = reduceContextHistory(packet);
  for (const textLimit of [160, 120, 80]) {
    const serialized = stringifyContextWithTextLimit(reduced, textLimit);
    if (serialized.length <= budget) return serialized;
  }

  const minimal = createMinimalContextPacket(packet);
  for (const textLimit of [120, 80, 48]) {
    const serialized = stringifyContextWithTextLimit(minimal, textLimit);
    if (serialized.length <= budget) return serialized;
  }

  const identityOnly = stringifyContextWithTextLimit(
    createIdentityOnlyContextPacket(packet),
    48
  );
  if (identityOnly.length <= budget) return identityOnly;
  throw new Error('后台演化上下文的稳定 ID 投影超过安全提示词预算。');
}

export function createBackgroundEvolutionPrompt(
  state: RuntimeState,
  selection: BackgroundEvolutionSelection
): string {
  const contextPacket = createContextPacket(state, selection);
  const packet = JSON.stringify(contextPacket);
  const prompt = [
    'BACKGROUND_EVOLUTION_TASK',
    '你是主剧情完成后的后台演化裁定器。你不写故事正文，不替玩家行动，不推进游戏时间，只为本次明确入选的远场人物、组织与城市轨道返回受限 JSON patches。',
    '只可使用稳定 actorId / trackId / caseId / threadId / placeId / organizationId / eventId 定位；禁止用姓名、别名或数组下标定位。',
    '每个 patch 必须包含本次提供的 reviewKey、非空 reason，以及 sourceRefs。无法证明来源时返回空数组。',
    'foregroundDelta 是主回合完成后由结构化 writeback 与最终状态生成的紧凑增量，不含故事正文。先用 turnSummary 理解因果，再以 canonicalSnapshots 为准；两者冲突时必须服从 canonicalSnapshots，禁止补猜未提供的叙事事实。',
    'TIME_REFERENCE_FRAME',
    formatTimeReferenceFrame(state.time),
    '人物记忆中的 gameTime 是形成时间，temporalReferences 是从当时相对说法解析出的绝对日期。远场行动必须以这些绝对日期和当前时间为准，不得把旧记忆里的“昨天、明天、后天、下周”重新解释成当前回合的相对时间。',
    'recentInteractionMemory 若 source=legacy_unanchored_actor_cache，只能作为模糊互动摘要；其中任何相对时间都不得作为日期事实。',
    '若 foregroundDelta.hiddenForegroundRedacted=true，说明前台回合含隐藏身份或组织关系；不得补猜被遮蔽摘要，也不得据此生成公开事实。',
    '人物行动按游戏时间演化，不按玩家回合演化。allowMaterialProgress=false 时只能建立或调整计划，不能宣布行动完成、不能实质推进案件。',
    '每个没有 currentTrack 的入选 NPC 都已经通过本地事实门槛。只要 actor、relationships、cases 或 memories 足以支持一个克制的日常方向，就应返回一条 create；不要仅因没有案件就整批省略。确实缺乏任何结构化依据时才可省略，禁止为了凑数编造。',
    '新建 NPC 轨道省略 visibility 时，本地将采用 review.visibilityHint。它表示基于现有可见关系与档案得出的默认可见度；只有为保护上下文中明确存在的秘密时才应主动降低。',
    '新建行动通常不能在同一次响应内完成。一个 NPC 一次最多完成一个行动节点；跨越多日也只概括一次，不循环补算。',
    '案件只是入选主办 NPC 的上下文。行动结果可为 progress/no_result/blocked/failed/handoff/abandoned；行动完成不等于 CaseStatus 必然前进，不保证案件侦破、起诉或归档。',
    '时间流逝本身不得增加亲密、信任或建立羁绊。关系 patch 仅用于已有关系中的明确承诺、帮助、冲突、风险或里程碑。若这些已验证变化确实改变了关系的总体基线，必须同步更新 summary；只有具体事实足以改变亲密或信任判断时才更新 intimacySummary / trustSummary，不得按时间自动升温。',
    '后台 Actor 只允许写 currentPlaceId 和 statusSummary。backgroundActorPatches 只可针对 npcCandidates 中独立入选的人物；organizationCandidates.actors 只是组织上下文，未同时入选 npcCandidates 时不得为其写 Actor patch。不得写玩家、在场/附近/本回合前台触及人物，不得写属性、金钱、物品、身体、成人档案或怀孕状态。',
    '组织不是经营模拟。每个组织只有一条低频心跳：现在做什么、做到哪里、何时复核。不得生成资金、地盘、成员日程或逐日结算。',
    'organizationCandidates.playerRoleContext 只表示玩家当前公开身份在该组织中的既有社会位置。kind=triad 时包括位置、直属关系与责任；kind=civilian 时包括职业、工作单位、职责边界、职业联系人和既有营生事项。它不是后台向玩家派任务的授权。',
    '后台不得创建新的 triad_responsibility 或 livelihood 事项，也不得替直属上线、雇主或同事在场外宣布玩家已经接到交代。后台只推进组织整体方向；具体事项必须在前台由稳定 Actor、通知、现场安排或明确工作事实自然传到玩家。',
    '组织演化应提供可被前台叙事承接的方向、地区压力与人物处境。新的玩家责任只能在普通主剧情中由稳定 Actor 真实联系或当面交代后写入；已有责任的结果也必须服从前台结构化事实，不得由后台擅自判定玩家完成、拒绝或失败。',
    'organizationEvolutionPatches 只能写入本次 organizationCandidates 中已经存在的 organizationId。activate 建立行动；update 调整未完成行动；settle 结算一个节点并回到 quiet。allowMaterialProgress=false 时禁止 settle，也不得宣告行动已完成。',
    '组织资料只允许附带更新 currentState、pressureSummary；stanceTowardPlayer 只有 allowPlayerStanceChange=true 才能更新。禁止创建、改名、改类型、改 visibility/importance/publicKnowledge/structureTree/summary/triadProfile。hidden 行动不得更新这些玩家可见资料。',
    'triadProfile 是世界包提供的社团差异事实，只读。triadState 只保存玩家当前合理可见的权力阶段与活动区域状态；只有目标 organization.type=triad 且本次行动确实改变相关状态时才可稀疏更新。单次最多更新 leadership 和两个既有 placeId，禁止新增地盘、成员日程、收入数字或全知秘密。',
    'triadState.leadership.phase 只能是 stable / consultation / contested / transition。具体主事人或候选人只能引用该 organizationCandidates.actors 中已经提供的 actorId；不确定时只更新 visibleSummary、nextMilestone 与 confidence，不得凭空造人。',
    '组织行动若使候选 actors 中某人的持续身份、职责或未来行为发生变化，例如接任、暂代、被撤换、获授权主持一条地区线，应在 actorMemories 为最相关的一人写一条短期记忆；同一组织本次最多一条，例行开会、传话或未形成结果时省略。actorMemories 的记忆正文键必须叫 text，不得写成 summary/content/memory；最小合法形状为 {"actorId":"复制候选 actorId","text":"会持续影响其未来行为的事实","importance":60,"visibility":"player_known","certainty":"fact","relatedCaseIds":[],"relatedPlaceIds":[],"relatedOrganizationIds":["复制目标 organizationId"],"reviewKey":"复制组织候选 reviewKey","reason":"为何值得持续记忆","sourceRefs":{"actorIds":["复制候选 actorId"],"caseIds":[],"placeIds":[],"organizationIds":["复制目标 organizationId"],"relationshipThreadIds":[],"cityTrackIds":[],"deferredEventIds":[],"outcomeIds":[]}}。',
    'actorMemories.text 中可确定的相对日期必须改写为绝对年月日。形成未来具体时间的约定或后果时，另用 deferredEventPatches 写绝对 triggerAt；不得只把“明天、后天、下周”留在记忆正文里。',
    '组织候选的 review.visibilityCeiling 是硬上限。涉及玩家隐藏组织关系的前台影响最多为 player_known，绝不能写成 public；不确定时使用更低可见度。',
    '组织结算不保证成功，允许 no_result/blocked/failed/handoff/abandoned。跨越多日也只结算一个节点；预计结束后仍可失败或受阻。每个组织单次最多一条 patch。',
    '城市轨道只更新已入选 trackId；压力单次变化不超过 1，状态最多跨一个合理阶段。每个到期 cityCandidates 都应返回一条 update/resolve 并给出未来 nextReviewAt；只有结构化事实确实不允许变化时，才保持内容不变但仍安排下一次复核。公开投影必须来自同一响应中已经验证的公开/传闻结果。',
    '正式案件行动的开始与结果记忆由本地根据通过校验的行动字段确定性投影；不要为了重复这两条而额外填写 actorMemories。',
    '非案件行动只有在 settle/cancel 且结果会持续影响人物未来选择、关系、身份、组织立场或风险时，才可在该 npcTrackPatch 写 persistToMemory=true；每名 NPC 本次最多形成一条。例行移动、日常工作过程、无后续价值的失败保持省略。',
    'deferredEventPatches 只用于本次有效结果已经确立、但应在未来具体游戏时间浮现的后果。必须给出真实未来 triggerAt，并关联当前候选；不得为了制造热闹创建填充事件。',
    'newsIssuePatches 只投影已经公开且具有城市公共影响的结果。普通玩家的购物、买车买楼、搬家、恋爱、转职、一般社交和日常执勤不得成为新闻；后台也不得仅因某项结果涉及玩家就把它升级为报纸报道。',
    'signalPatches 只投影仍有现实承接点的新风声。若本次结构化结果已经查明、否定或取代上下文里的同一 stable signalId，更新原 signalId 为 resolved 或 stale；不得复制一条近义新风声让旧记录继续悬挂。',
    '',
    '输出一个 JSON object。允许字段：npcTrackPatches, organizationEvolutionPatches, citySituationTrackPatches, casePatches, backgroundRelationshipPatches, backgroundActorPatches, deferredEventPatches, actorMemories, outcomeRecords, chronicleEntries, currentMatterPatches, signalPatches, newsIssuePatches。所有字段均为数组。',
    '只输出真正有写入内容的顶层数组，其他字段直接省略。每个入选 NPC 本次最多一条 npcTrackPatches；settle/cancel 后不得在同一响应为该 NPC 新建后继行动。每个入选城市轨道最多一条 citySituationTrackPatches。文字保持简洁。',
    '案件行动开始/结算记忆与常规 outcome 由本地从已验证行动确定性生成，因此默认省略 actorMemories、outcomeRecords、chronicleEntries；不得把同一结果重复铺进这些数组。只有上下文明确要求且存在行动字段无法表达的独立长期历史时，才可额外写一条 chronicleEntries。',
    '严格输出契约：sourceRefs 永远是 object，绝不是数组。其完整形状为 {"actorIds":[],"caseIds":[],"placeIds":[],"organizationIds":[],"relationshipThreadIds":[],"cityTrackIds":[],"deferredEventIds":[],"outcomeIds":[]}；只填 BACKGROUND_EVOLUTION_CONTEXT 中实际提供的稳定 ID，其余保留空数组。',
    'actionKind 只能逐字取以下一个值：work / relationship / case / organization / movement / personal / risk / other。调查案件必须写 case，不得自造 investigation、case_investigation 等新值。',
    'npcTrackPatches.status 只能是 planned / active / blocked；outcomeKind 只能是 progress / no_result / blocked / failed / handoff / abandoned；visibility 只能是 hidden / rumor / public / player_known。',
    'citySituationTrackPatches 只更新已有轨道：operation 只能是 update / resolve，status 只能是 latent / active / escalating / cooling / resolved；不得输出 upsert 或自造 progress/advance 等 operation。backgroundRelationshipPatches.status 只能是 active / dormant / strained / ended。',
    '所有时间字段使用 {"year":1984,"month":12,"day":27,"hour":9,"minute":0} 这种 object；不得写自然语言日期。所有 patch 的 reviewKey 必须逐字复制其候选中的 review.reviewKey 或 cityCandidates.reviewKey。',
    'npcTrackPatches.operation 只能是 create/update/settle/cancel。create 需要 actorId, trackId, actionKind, objective, currentAction, currentStatus, nextReviewAt；case 行动还必须有 expectedEndAt 和 relatedCaseIds。settle/cancel 需要 outcomeKind 和 outcomeSummary；persistToMemory 只能在这两种终态操作中使用。',
    '受阻结算特别注意：blocked 是 outcomeKind，不是省略行动定位的理由。已有案件行动受阻时仍须用 settle 或 cancel，并逐字复制候选 currentTrack.trackId、actorId 与 reviewKey；不得只写 status=blocked，也不得漏写 trackId。',
    '受阻 npcTrackPatches 的最小合法形状是 {"operation":"settle","trackId":"逐字复制 currentTrack.trackId","actorId":"逐字复制 actor.actorId","outcomeKind":"blocked","outcomeSummary":"具体受阻结果","reviewKey":"逐字复制 review.reviewKey","reason":"依据当前案件事实结算受阻","sourceRefs":{"actorIds":["目标 actorId"],"caseIds":["目标 caseId"],"placeIds":[],"organizationIds":[],"relationshipThreadIds":[],"cityTrackIds":[],"deferredEventIds":[],"outcomeIds":[]}}。reason 和 sourceRefs 都不可省略。若人物位置或 statusSummary 没有独立变化，受阻结算不要输出 backgroundActorPatches；若确需输出，它也必须有 reviewKey、reason、sourceRefs。',
    'organizationEvolutionPatches.operation 只能是 activate/update/settle。activate 需要 organizationId, trackId, status, objective, currentAction, currentStatus, expectedEndAt, nextReviewAt；update 继续使用候选 currentTrack.trackId；settle 需要 outcomeKind、outcomeSummary、nextReviewAt，并且必须省略 status，不得把 quiet/settled/completed 写入 status。nextReviewAt 必须等于或晚于候选 review.earliestNextReviewAt。所有 organization patch 的 sourceRefs.organizationIds 必须包含目标 organizationId；relatedActorIds/relatedPlaceIds/relatedCaseIds/relatedCityTrackIds 只能复制该候选上下文中实际列出的 ID，不确定时省略这些 related 数组。triadState.activityAreas[].placeId 也只能复制该候选 organization.triadState 中已有的 placeId。',
    'casePatches 直接使用既有 CasePatch 字段，并额外提供 actorId, reviewKey, outcomeKind, reason, sourceRefs；只有人物行动已经产生实质结果时才写。它必须与同一响应中的一条 npcTrackPatches settle/cancel 成对：reviewKey、actorId、outcomeKind 完全相同，该行动 relatedCaseIds 与 sourceRefs.caseIds 都必须包含 caseId；若行动只是 create/update，casePatches 必须为空。',
    '',
    'BACKGROUND_EVOLUTION_CONTEXT',
    packet
  ].join('\n');

  if (prompt.length <= MAX_PROMPT_TEXT) return prompt;
  const prefix = prompt.slice(0, prompt.length - packet.length);
  return `${prefix}${serializeContextWithinBudget(
    contextPacket,
    MAX_PROMPT_TEXT - prefix.length
  )}`;
}
