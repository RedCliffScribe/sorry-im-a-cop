import { applyActorFemaleProfilePatch } from '../runtime/femaleProfile';
import { normalizePlayerReputationState } from '../reputation/reputation';
import { syncPlayerEquipmentAssetsFromNames } from '../assets/equipmentSlots';
import { syncHomeBaseAssetAndFinance } from '../assets/homeBaseAsset';
import { applyFinancePatch } from '../finance/applyFinancePatch';
import { syncPlayerPoliceSalaryCashflow } from '../finance/playerSalaryCashflow';
import { synchronizeNpcMemoryCaches, type NpcMemoryTier } from '../memory/npcMemoryLayers';
import { applyAssetPatch, applyCaseEvidencePatch, applyCasePatch, applyDeferredEventPatch } from '../writeback/applyWriteback';
import type { Actor, GrayLedgerEntry, MemoryItem, Place, PressureHook, RuntimeState, StoryTurnMetrics } from '../runtime/types';
import type { OpeningNarratorResponse } from './openingSchema';

function cloneTime(time: RuntimeState['time']): RuntimeState['time'] {
  return { ...time };
}

function normalizePoliceNumber(policeNumber: string | undefined): string | undefined {
  const digits = policeNumber?.replace(/\D/g, '').slice(0, 4) ?? '';
  return digits.length === 4 ? digits : undefined;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function nextAvailableId(prefix: string, existing: Record<string, unknown>): string {
  let index = Object.keys(existing).length + 1;
  let id = `${prefix}_${String(index).padStart(4, '0')}`;
  while (id in existing) {
    index += 1;
    id = `${prefix}_${String(index).padStart(4, '0')}`;
  }
  return id;
}

function nextLedgerId(existing: GrayLedgerEntry[]): string {
  let index = existing.length + 1;
  let id = `gray_${String(index).padStart(4, '0')}`;
  while (existing.some((entry) => entry.ledgerId === id)) {
    index += 1;
    id = `gray_${String(index).padStart(4, '0')}`;
  }
  return id;
}

function appendOpeningActorMemory(
  memories: Record<string, MemoryItem>,
  actorId: string,
  time: RuntimeState['time'],
  seed: { text: string; visibility: MemoryItem['visibility']; tier: NpcMemoryTier }
): void {
  const duplicate = Object.values(memories).some(
    (memory) =>
      memory.kind === 'actor' &&
      memory.relatedTurnId === 'turn_0' &&
      memory.relatedActorIds.includes(actorId) &&
      memory.text.trim().replace(/\s+/g, ' ') === seed.text.trim().replace(/\s+/g, ' ')
  );
  if (duplicate) return;
  const memoryId = nextAvailableId('memory', memories);
  memories[memoryId] = {
    memoryId,
    text: seed.text,
    kind: 'actor',
    tier: seed.tier,
    relatedActorIds: [actorId],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    relatedTurnId: 'turn_0',
    gameTime: cloneTime(time),
    importance: 50,
    visibility: seed.visibility,
    certainty: 'claim',
    embeddingText: seed.text
  };
}

const defaultActorAttributes: Actor['attributes'] = {
  body: 50,
  action: 50,
  perception: 50,
  thinking: 50,
  negotiation: 50,
  will: 50
};

function createHomePlace(seed: NonNullable<OpeningNarratorResponse['playerPatch']['homeBase']>): Place {
  return {
    placeId: seed.placeId,
    name: seed.placeName,
    regionId: seed.regionId,
    type: 'home',
    summary: seed.summary,
    publicKnowledge: '这是玩家的私人住所，普通人不一定知道其具体位置。',
    currentState: seed.summary,
    relatedActorIds: ['player'],
    relatedCaseIds: [],
    relatedPressureIds: []
  };
}

function createOpeningActor(
  state: RuntimeState,
  seed: OpeningNarratorResponse['initialActors'][number],
  existingActors: Record<string, Actor>
): Actor {
  const actorId = seed.actorId && !(seed.actorId in existingActors) ? seed.actorId : nextAvailableId('actor_opening', existingActors);
  const currentPlaceId = seed.currentPlaceId ?? state.location.currentPlaceId;
  const currentSceneId = seed.currentSceneId ?? state.location.currentSceneId;

  const actor: Actor = {
    actorId,
    name: seed.name,
    englishName: seed.englishName,
    aliases: unique([...(seed.aliases ?? []), seed.englishName ?? '', seed.callName ?? '']),
    callName: seed.callName,
    gender: seed.gender,
    currentIdentity: seed.currentIdentity,
    birthDate: seed.birthDate,
    computedAge: seed.computedAge,
    visualAgeAnchor: seed.visualAgeAnchor ?? `${seed.computedAge}岁左右`,
    publicIdentity: seed.publicIdentity,
    actualIdentitySummary: seed.actualIdentitySummary ?? seed.publicIdentity ?? seed.positionSummary,
    roleProfiles: seed.roleProfiles as Actor['roleProfiles'],
    organizationIds: unique([...(seed.organizationIds ?? []), ...(seed.currentIdentity === 'police' ? ['org_hk_police'] : [])]),
    organizationRelations: [],
    positionSummary: seed.positionSummary,
    currentPlaceId,
    currentSceneId,
    presence: seed.presence,
    lastSeenAt: cloneTime(state.time),
    lastSeenPlaceId: currentPlaceId,
    profileSummary: seed.profileSummary,
    appearance: seed.appearance,
    clothing: seed.clothing,
    equipment: [...seed.equipment],
    personality: seed.personality,
    speechStyle: seed.speechStyle,
    motivation: seed.motivation,
    longTermGoal: seed.longTermGoal,
    values: seed.values,
    attributes: seed.attributes ? { ...seed.attributes } : { ...defaultActorAttributes },
    activeTraits: seed.activeTraits.map((trait) => ({
      ...trait,
      scopes: [...trait.scopes]
    })),
    traitProgress: [],
    statusSummary: seed.statusSummary,
    bodyConditionSummary: seed.bodyConditionSummary ?? seed.statusSummary,
    relationshipSummary: seed.relationshipSummary,
    attitudeTowardPlayer: seed.attitudeTowardPlayer,
    interactionScore: seed.interactionScore,
    trustTendency: seed.trustTendency,
    entanglementSummary: seed.entanglementSummary,
    longTermMemorySummary: seed.longTermMemorySummary,
    recentInteractionMemory: seed.recentInteractionMemory,
    keyMemories: [],
    visibility: seed.visibility,
    importance: seed.importance,
    worldpackActorData: { ...seed.worldpackActorData }
  };

  return applyActorFemaleProfilePatch(actor, seed.femaleProfile, state.time, 'opening');
}

export function applyOpeningNarratorResponse(
  state: RuntimeState,
  response: OpeningNarratorResponse,
  meta: { rawNarratorResponse?: string; turnMetrics?: StoryTurnMetrics } = {}
): RuntimeState {
  let player = { ...state.player };
  let playerActor = { ...state.actors[state.player.actorId] };
  const patchedName = response.playerPatch.name?.trim();
  const patchedEnglishName = response.playerPatch.englishName?.trim() || player.englishName;
  const patchedPoliceNumber =
    player.currentIdentity === 'police'
      ? normalizePoliceNumber(response.playerPatch.policeNumber) ?? player.policeNumber
      : undefined;

  if (patchedName) {
    player.name = patchedName;
    playerActor.name = patchedName;
  }
  if (patchedEnglishName) {
    player.englishName = patchedEnglishName;
    playerActor.englishName = patchedEnglishName;
  }
  if (patchedPoliceNumber) {
    player.policeNumber = patchedPoliceNumber;
    playerActor.policeNumber = patchedPoliceNumber;
  } else if (player.currentIdentity !== 'police') {
    player.policeNumber = undefined;
    playerActor.policeNumber = undefined;
  }
  if (response.playerPatch.clothing) {
    player.clothing = response.playerPatch.clothing;
    playerActor.clothing = response.playerPatch.clothing;
  }
  if (response.playerPatch.equipment) {
    player.equipment = [...response.playerPatch.equipment];
    playerActor.equipment = [...response.playerPatch.equipment];
  }
  if (response.playerPatch.vitals) {
    player.vitals = { ...response.playerPatch.vitals };
    playerActor.vitals = { ...response.playerPatch.vitals };
  }
  if (response.playerPatch.economy) {
    player.economy = { ...response.playerPatch.economy };
  }
  if (response.playerPatch.reputation || response.playerPatch.reputationByCircle) {
    player.reputation = normalizePlayerReputationState(
      response.playerPatch.reputation ?? { circles: response.playerPatch.reputationByCircle },
      player.reputation
    );
  }
  if (response.playerPatch.homeBase) {
    player.homeBase = { ...response.playerPatch.homeBase };
  }
  if (response.playerPatch.statusSummary) {
    playerActor.statusSummary = response.playerPatch.statusSummary;
  }
  if (response.playerPatch.longTermMemorySummary) {
    playerActor.longTermMemorySummary = response.playerPatch.longTermMemorySummary;
  }
  if (response.playerPatch.recentInteractionMemory) {
    playerActor.recentInteractionMemory = response.playerPatch.recentInteractionMemory;
  }
  playerActor.aliases = unique([
    ...playerActor.aliases,
    patchedEnglishName ?? '',
    patchedPoliceNumber ?? ''
  ]);

  const actors: RuntimeState['actors'] = {
    ...state.actors,
    [player.actorId]: playerActor
  };

  const scenes: RuntimeState['scenes'] = Object.fromEntries(
    Object.entries(state.scenes).map(([sceneId, scene]) => [sceneId, { ...scene, presentActorIds: [...scene.presentActorIds] }])
  );
  const places: RuntimeState['places'] = { ...state.places };
  const openingActorMemories: Array<{
    actorId: string;
    memory: { text: string; visibility: MemoryItem['visibility']; tier: NpcMemoryTier };
  }> = [];

  if (response.playerPatch.homeBase && !(response.playerPatch.homeBase.placeId in places)) {
    places[response.playerPatch.homeBase.placeId] = createHomePlace(response.playerPatch.homeBase);
  }

  for (const seed of response.initialActors) {
    const actor = createOpeningActor(state, seed, actors);
    actors[actor.actorId] = actor;
    for (const memory of seed.keyMemories) {
      openingActorMemories.push({
        actorId: actor.actorId,
        memory: { text: memory.text, visibility: memory.visibility, tier: 'short_term' }
      });
    }
    if (seed.recentInteractionMemory !== '开局与主角产生联系。') {
      openingActorMemories.push({
        actorId: actor.actorId,
        memory: { text: seed.recentInteractionMemory, visibility: seed.visibility, tier: 'short_term' }
      });
    }
    if (seed.longTermMemorySummary !== '开局生成人物。') {
      openingActorMemories.push({
        actorId: actor.actorId,
        memory: { text: seed.longTermMemorySummary, visibility: seed.visibility, tier: 'long_term' }
      });
    }
    if ((actor.presence === 'present' || actor.presence === 'nearby') && actor.currentSceneId && scenes[actor.currentSceneId]) {
      scenes[actor.currentSceneId].presentActorIds = unique([...scenes[actor.currentSceneId].presentActorIds, actor.actorId]);
    }
  }

  const memories = { ...state.memories };
  for (const { actorId, memory } of openingActorMemories) {
    appendOpeningActorMemory(memories, actorId, state.time, memory);
  }

  const secretFacts: RuntimeState['secretFacts'] = { ...state.secretFacts };
  for (const seed of response.secretFacts) {
    const existing = secretFacts[seed.secretId];
    secretFacts[seed.secretId] = {
      ...seed,
      knownByActorIds: unique(seed.knownByActorIds),
      revealConditions: unique(seed.revealConditions),
      createdAt: cloneTime(existing?.createdAt ?? seed.createdAt ?? state.time),
      updatedAt: cloneTime(seed.updatedAt ?? state.time)
    };
  }
  const openingTurnSummary = response.memories.find((seed) => seed.kind === 'turn')?.text.trim();
  let openingTurnMemoryWritten = false;
  for (const seed of response.memories) {
    if (seed.kind === 'turn') {
      if (openingTurnMemoryWritten) continue;
      openingTurnMemoryWritten = true;
    }
    const memoryId = nextAvailableId('memory', memories);
    const memory: MemoryItem = {
      memoryId,
      text: seed.text,
      kind: seed.kind,
      ...(seed.kind === 'turn' ? { tier: 'short_term' as const } : {}),
      relatedActorIds: seed.relatedActorIds,
      relatedCaseIds: seed.relatedCaseIds,
      relatedPlaceIds: seed.relatedPlaceIds,
      relatedOrganizationIds: seed.relatedOrganizationIds,
      relatedTurnId: 'turn_0',
      gameTime: cloneTime(state.time),
      importance: seed.importance,
      visibility: seed.visibility,
      certainty: seed.certainty,
      embeddingText: seed.text
    };
    memories[memoryId] = memory;
  }

  const pressures = { ...state.pressures };
  for (const seed of response.pressureSeeds) {
    const pressureId =
      seed.pressureId && !(seed.pressureId in pressures) ? seed.pressureId : nextAvailableId('pressure_opening', pressures);
    const pressure: PressureHook = {
      pressureId,
      kind: seed.kind,
      summary: seed.summary,
      status: 'hinted',
      severity: seed.severity,
      exposureLikelihood: seed.exposureLikelihood,
      visibility: seed.visibility,
      knownByActorIds: [],
      sourceSummary: seed.sourceSummary,
      relatedActorIds: seed.relatedActorIds,
      relatedCaseIds: seed.relatedCaseIds,
      relatedOrganizationIds: seed.relatedOrganizationIds,
      relatedPlaceIds: seed.relatedPlaceIds,
      allowedUses: seed.allowedUses,
      forbiddenUses: seed.forbiddenUses,
      escalationConditions: seed.escalationConditions,
      cooldownTurns: 2
    };
    pressures[pressureId] = pressure;
  }

  const grayLedger = [...state.grayLedger];
  for (const seed of response.grayLedger) {
    grayLedger.push({
      ledgerId: seed.ledgerId ?? nextLedgerId(grayLedger),
      gameTime: cloneTime(state.time),
      kind: seed.kind,
      amount: seed.amount,
      itemSummary: seed.itemSummary,
      fromActorId: seed.fromActorId,
      fromSummary: seed.fromSummary,
      relatedActorIds: [...seed.relatedActorIds],
      relatedPlaceIds: [...seed.relatedPlaceIds],
      relatedCaseIds: [...seed.relatedCaseIds],
      summary: seed.summary,
      playerExplanation: seed.playerExplanation,
      exposureRisk: seed.exposureRisk,
      status: seed.status,
      visibility: seed.visibility
    });
  }

  const cases: RuntimeState['cases'] = { ...state.cases };
  const caseEvidence: RuntimeState['caseEvidence'] = { ...state.caseEvidence };
  const deferredEvents: RuntimeState['deferredEvents'] = { ...state.deferredEvents };
  let assets = applyAssetPatch(state.assets, response.assetPatch);
  let finance = applyFinancePatch(
    state.finance,
    response.playerPatch.economy
      ? {
          cashSet: response.playerPatch.economy.cashOnHand,
          bankSet: response.playerPatch.economy.bankBalance,
          summary: response.playerPatch.economy.financeSummary
        }
      : undefined,
    state.time
  );
  ({ assets, finance } = syncHomeBaseAssetAndFinance({
    assets,
    finance,
    homeBase: player.homeBase,
    economy: player.economy,
    time: state.time
  }));
  finance = syncPlayerPoliceSalaryCashflow({
    finance,
    time: state.time,
    currentIdentity: player.currentIdentity,
    lawIdentity: state.lawIdentity
  });

  for (const patch of response.casePatches) {
    cases[patch.caseId] = applyCasePatch(cases[patch.caseId], patch, 'turn_0', state.time);
  }

  for (const patch of response.caseEvidencePatches) {
    const evidence = applyCaseEvidencePatch(caseEvidence[patch.evidenceId], patch, state.time);
    caseEvidence[evidence.evidenceId] = evidence;
    if (cases[evidence.caseId] && !cases[evidence.caseId].evidenceIds.includes(evidence.evidenceId)) {
      cases[evidence.caseId] = {
        ...cases[evidence.caseId],
        evidenceIds: [...cases[evidence.caseId].evidenceIds, evidence.evidenceId],
        updatedAt: cloneTime(state.time)
      };
    }
  }

  for (const patch of response.deferredEventPatches) {
    const deferredEvent = applyDeferredEventPatch(deferredEvents[patch.eventId], patch, state.time);
    if (deferredEvent) {
      deferredEvents[deferredEvent.eventId] = deferredEvent;
    }
  }

  const nextState: RuntimeState = {
    ...state,
    player,
    actors,
    secretFacts,
    scenes,
    places,
    cases,
    caseEvidence,
    deferredEvents,
    assets,
    finance,
    memories,
    pressures,
    grayLedger,
    storyLog: [
      {
        turnId: 'turn_0',
        speaker: 'narrator',
        text: response.narrativeText,
        ...(openingTurnSummary ? { summaryText: openingTurnSummary } : {}),
        suggestedActions: response.suggestedActions,
        gameTime: cloneTime(state.time),
        ...(response.validationWarnings?.length ? { writebackDiagnostics: response.validationWarnings } : {}),
        ...(meta.rawNarratorResponse ? { rawNarratorResponse: meta.rawNarratorResponse } : {}),
        ...(meta.turnMetrics ? { turnMetrics: meta.turnMetrics } : {})
      }
    ],
    turnCounter: 0
  };
  return synchronizeNpcMemoryCaches(syncPlayerEquipmentAssetsFromNames(nextState, nextState.player.equipment));
}
