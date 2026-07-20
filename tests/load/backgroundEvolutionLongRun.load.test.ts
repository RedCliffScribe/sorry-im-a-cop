import 'fake-indexeddb/auto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runBackgroundEvolution } from '../../src/domain/backgroundEvolution/runBackgroundEvolution';
import {
  MAX_BACKGROUND_CITY_CANDIDATES,
  MAX_BACKGROUND_NPC_CANDIDATES,
  MAX_BACKGROUND_ORGANIZATION_CANDIDATES,
  selectBackgroundEvolutionCandidates
} from '../../src/domain/backgroundEvolution/selection';
import { addGameHours, addGameMinutes, gameDateKey } from '../../src/domain/backgroundEvolution/time';
import type { NarratorClient } from '../../src/domain/narrator/NarratorClient';
import { IndexedDbSaveRepository } from '../../src/domain/persistence/IndexedDbSaveRepository';
import { createPortableSaveRecord } from '../../src/domain/persistence/portableSaveArchive';
import { parseRuntimeSaveRecord } from '../../src/domain/persistence/saveArchiveSchema';
import type { RuntimeSaveRecord } from '../../src/domain/persistence/SaveRepository';
import { createActorDefaults } from '../../src/domain/runtime/actorFactory';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type {
  CaseFile,
  GameTime,
  NpcEvolutionOutcomeKind,
  Organization,
  RuntimeState
} from '../../src/domain/runtime/types';

const shouldRun = process.env.COPV2_RUN_BACKGROUND_EVOLUTION_LONG_LOAD === '1';
const STEP_COUNT = 1000;
const NPC_COUNT = 64;
const ORGANIZATION_COUNT = 32;
const ACTIVATED_ORGANIZATION_COUNT = 12;
const RELATIONSHIP_COUNT = 30;
const CASE_COUNT = 20;
const CITY_TRACK_COUNT = 16;
const PERSISTENCE_INTERVAL = 100;

const outcomeCycle: NpcEvolutionOutcomeKind[] = [
  'progress',
  'no_result',
  'blocked',
  'failed',
  'handoff',
  'abandoned'
];

interface TechnicalCheckpoint {
  step: number;
  gameTime: GameTime;
  activeNpcTracks: number;
  activeOrganizationTracks: number;
  recentOutcomes: number;
  chronicleEntries: number;
  actorMemories: number;
  stateBytes: number;
  heapUsedBytes: number;
}

function percentile(values: number[], percentage: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)];
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function createSaveRecord(state: RuntimeState, now: string): RuntimeSaveRecord {
  return {
    saveId: 'background-evolution-long-load',
    saveName: 'Background evolution long load',
    saveKind: 'manual',
    createdAt: now,
    updatedAt: now,
    playerName: state.player.name,
    worldpackId: state.world.worldpackId,
    gameDateLabel: gameDateKey(state.time),
    turnCounter: state.turnCounter,
    runtimeState: state
  };
}

function addSeedActors(state: RuntimeState): string[] {
  const actorIds: string[] = [];
  const placeIds = Object.keys(state.places);
  for (let index = 0; index < NPC_COUNT; index += 1) {
    const actorId = `npc_background_load_${String(index + 1).padStart(2, '0')}`;
    actorIds.push(actorId);
    state.actors[actorId] = createActorDefaults({
      actorId,
      name: `远场人物${String(index + 1).padStart(2, '0')}`,
      currentIdentity: index % 3 === 0 ? 'police' : 'civilian',
      publicIdentity: index % 3 === 0 ? '便衣探员' : index % 3 === 1 ? '机构职员' : '街坊联系人',
      positionSummary: '在远场处理自己的事务。',
      currentPlaceId: placeIds[index % placeIds.length],
      presence: 'absent',
      statusSummary: '保持正常生活与工作节奏。',
      relationshipSummary: '与玩家存在结构化但不一定亲近的联系。',
      visibility: 'player_known'
    });
  }
  return actorIds;
}

function addSeedOrganizations(state: RuntimeState, actorIds: string[]): string[] {
  const template = Object.values(state.organizations)[0] as Organization;
  const ids: string[] = [];
  for (let index = 0; index < ORGANIZATION_COUNT; index += 1) {
    const organizationId = `org_background_load_${String(index + 1).padStart(2, '0')}`;
    ids.push(organizationId);
    state.organizations[organizationId] = {
      ...structuredClone(template),
      organizationId,
      name: `长期负载机构${String(index + 1).padStart(2, '0')}`,
      type: index % 4 === 0 ? 'media' : index % 4 === 1 ? 'business' : index % 4 === 2 ? 'entertainment' : 'community',
      relatedActorIds: [actorIds[index]],
      visibility: 'player_known'
    };
    state.actors[actorIds[index]].organizationIds = [organizationId];
    if (index < ACTIVATED_ORGANIZATION_COUNT) {
      state.actors[actorIds[index]].organizationRelations = [
        {
          organizationId,
          relationType: 'employee',
          roleTitle: '负载测试职员',
          summary: '该人物与机构存在稳定工作关系。',
          visibility: 'player_known'
        }
      ];
      state.actors.player.organizationRelations.push({
        organizationId,
        relationType: 'contractor',
        summary: '玩家与该机构已有结构化工作交集。',
        visibility: 'player_known'
      });
    }
  }
  return ids;
}

function addSeedRelationships(state: RuntimeState, actorIds: string[]): void {
  for (let index = 0; index < RELATIONSHIP_COUNT; index += 1) {
    const actorId = actorIds[index];
    const threadId = `relationship_background_load_${String(index + 1).padStart(2, '0')}`;
    state.relationshipThreads[threadId] = {
      threadId,
      kind: index % 5 === 0 ? 'fate' : 'network',
      title: `远场关系${String(index + 1).padStart(2, '0')}`,
      summary: '双方存在会继续产生现实影响的长期联系。',
      relatedActorIds: [actorId],
      primaryActorId: actorId,
      relationshipRole: index % 2 === 0 ? '正式线人' : '长期事务联系人',
      status: index % 7 === 0 ? 'strained' : 'active',
      promiseSummary: '对方答应在有实质消息时再联系。',
      riskSummary: index % 7 === 0 ? '频繁接触可能引来外界注意。' : undefined,
      currentPull: '对方仍有一件自己的事务需要处理。',
      nextNaturalBeatHint: '可通过电话、同事或公开消息自然回响。',
      creationBasis: index % 2 === 0 ? 'formal_informant' : 'ongoing_joint_matter',
      evidenceRefs: [
        {
          kind: 'current_turn',
          refId: 'current_turn',
          summary: '负载种子使用已验证的正式长期联系。'
        }
      ],
      milestones: [],
      visibility: 'player_known',
      importance: 50,
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };
  }
}

function addSeedCases(state: RuntimeState, actorIds: string[], organizationIds: string[]): void {
  const placeIds = Object.keys(state.places);
  for (let index = 0; index < CASE_COUNT; index += 1) {
    const caseId = `case_background_load_${String(index + 1).padStart(2, '0')}`;
    const actorId = actorIds[RELATIONSHIP_COUNT + index];
    const caseFile: CaseFile = {
      caseId,
      title: `远场案件${String(index + 1).padStart(2, '0')}`,
      caseType: index % 2 === 0 ? 'theft' : 'fraud',
      status: 'investigating',
      playerRole: 'aware',
      leadActorId: actorId,
      leadActorName: state.actors[actorId].name,
      summary: '案件由非玩家主办人负责，玩家只保留合理知情。',
      currentFocus: '核对证词、文件与现场时间线。',
      playerVisibleProgress: '主办人仍在调查。',
      internalProgressSummary: '现有材料不足以保证案件能够侦破。',
      relatedActorIds: [actorId],
      relatedPlaceIds: [placeIds[index % placeIds.length]],
      relatedOrganizationIds: [organizationIds[index % organizationIds.length]],
      evidenceIds: [],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'player_known',
      createdAt: { ...state.time },
      updatedAt: { ...state.time }
    };
    state.cases[caseId] = caseFile;
  }
}

function addSeedCityTracks(state: RuntimeState, actorIds: string[], organizationIds: string[]): void {
  const placeIds = Object.keys(state.places);
  for (let index = 0; index < CITY_TRACK_COUNT; index += 1) {
    const trackId = `city_background_load_${String(index + 1).padStart(2, '0')}`;
    state.citySituationTracks[trackId] = {
      trackId,
      title: `城市演化轨道${String(index + 1).padStart(2, '0')}`,
      trackType: index % 2 === 0 ? 'market_pressure' : 'public_safety',
      status: index % 3 === 0 ? 'latent' : 'active',
      pressureLevel: 1 + (index % 4),
      visibility: index % 4 === 0 ? 'rumor' : 'public',
      startedAt: { ...state.time },
      nextReviewAt: addGameHours(state.time, 6 + (index % 4) * 6),
      cadenceDays: 1 + (index % 4),
      relatedOrganizationIds: [organizationIds[index % organizationIds.length]],
      relatedPowerFigureIds: [],
      relatedPlaceIds: [placeIds[index % placeIds.length]],
      relatedActorIds: [actorIds[index]],
      summary: '这是一条低频城市局势，不要求每回合进入正文。',
      currentBeat: '相关人物和机构正在观察局势。',
      possibleDevelopments: ['升温', '维持', '转冷']
    };
  }
}

function sourceRefs(packet: any, cityTrackId?: string) {
  const actorId = packet?.actor?.actorId;
  return {
    actorIds: actorId ? [actorId] : [],
    caseIds: packet?.cases?.map((item: any) => item.caseId) ?? [],
    placeIds: [packet?.actor?.currentPlaceId, ...(packet?.cases?.flatMap((item: any) => item.relatedPlaceIds) ?? [])].filter(Boolean),
    organizationIds: packet?.actor?.organizationIds ?? [],
    relationshipThreadIds: packet?.relationships?.map((item: any) => item.threadId) ?? [],
    cityTrackIds: cityTrackId ? [cityTrackId] : [],
    deferredEventIds: [],
    outcomeIds: []
  };
}

function organizationSourceRefs(packet: any) {
  return {
    actorIds: packet?.actors?.map((item: any) => item.actorId) ?? [],
    caseIds: packet?.cases?.map((item: any) => item.caseId) ?? [],
    placeIds: packet?.places?.map((item: any) => item.placeId) ?? [],
    organizationIds: packet?.organization?.organizationId ? [packet.organization.organizationId] : [],
    relationshipThreadIds: [],
    cityTrackIds: packet?.cityTracks?.map((item: any) => item.trackId) ?? [],
    deferredEventIds: [],
    outcomeIds: []
  };
}

function safeCityStatus(status: string, callCount: number): string {
  if (status === 'latent') return 'active';
  if (status === 'active') return callCount % 2 === 0 ? 'escalating' : 'cooling';
  if (status === 'escalating' || status === 'cooling') return 'active';
  return status;
}

class DeterministicBackgroundClient implements NarratorClient {
  callCount = 0;
  injectedFailures = 0;
  invalidPayloads = 0;
  maxPromptChars = 0;
  materialOutcomeKinds = new Set<NpcEvolutionOutcomeKind>();

  async complete(prompt: string): Promise<unknown> {
    this.callCount += 1;
    this.maxPromptChars = Math.max(this.maxPromptChars, prompt.length);
    if (this.callCount % 137 === 0) {
      this.injectedFailures += 1;
      throw new Error(`Injected background API failure ${this.callCount}`);
    }
    if (this.callCount % 173 === 0) {
      this.invalidPayloads += 1;
      return 'invalid background payload';
    }

    const marker = 'BACKGROUND_EVOLUTION_CONTEXT\n';
    const markerIndex = prompt.lastIndexOf(marker);
    if (markerIndex < 0) throw new Error('Missing background context packet.');
    const context = JSON.parse(prompt.slice(markerIndex + marker.length));
    const npcTrackPatches: any[] = [];
    let automaticOutcomeCount = 0;

    for (const candidate of context.npcCandidates as any[]) {
      const actorId = candidate.actor.actorId as string;
      const reviewKey = candidate.review.reviewKey as string;
      const refs = sourceRefs(candidate);
      if (!candidate.currentTrack) {
        const relatedCaseIds = candidate.cases.map((item: any) => item.caseId);
        npcTrackPatches.push({
          operation: 'create',
          trackId: `track_${actorId}_${String(this.callCount).padStart(4, '0')}`,
          actorId,
          status: 'active',
          actionKind: relatedCaseIds.length > 0 ? 'case' : candidate.relationships.length > 0 ? 'relationship' : 'work',
          objective: relatedCaseIds.length > 0 ? '完成下一轮案件核查' : '处理一项会持续影响其现实处境的事务',
          currentAction: relatedCaseIds.length > 0 ? '走访相关人员并核对现有材料' : '在当前生活轨迹中处理既有事务',
          currentStatus: '行动刚刚开始，尚无结果',
          currentPlaceId: candidate.actor.currentPlaceId,
          startedAt: context.currentTime,
          expectedEndAt: relatedCaseIds.length > 0 ? addGameHours(context.currentTime, 24 + (this.callCount % 3) * 12) : undefined,
          nextReviewAt: addGameHours(context.currentTime, 6),
          relatedActorIds: [actorId],
          relatedOrganizationIds: candidate.actor.organizationIds,
          relatedPlaceIds: candidate.actor.currentPlaceId ? [candidate.actor.currentPlaceId] : [],
          relatedCaseIds,
          relatedRelationshipThreadIds: candidate.relationships.map((item: any) => item.threadId),
          relatedCityTrackIds: [],
          relatedDeferredEventIds: [],
          visibility: 'player_known',
          reviewKey,
          reason: '确定性负载客户端建立一个受限远场行动。',
          sourceRefs: refs
        });
      } else if (candidate.review.allowMaterialProgress) {
        const outcomeKind = outcomeCycle[(this.callCount + npcTrackPatches.length) % outcomeCycle.length];
        this.materialOutcomeKinds.add(outcomeKind);
        automaticOutcomeCount += 1;
        npcTrackPatches.push({
          operation: outcomeKind === 'abandoned' ? 'cancel' : 'settle',
          trackId: candidate.currentTrack.trackId,
          actorId,
          outcomeKind,
          outcomeSummary: `本轮行动得到 ${outcomeKind} 结果；该结果不自动等同于案件侦破或关系升温。`,
          consequence: outcomeKind === 'progress' ? '形成有限新线索，后续仍需另行判断。' : '保留真实受阻或无果经历。',
          reviewKey,
          reason: '游戏时间已达到复核门槛，只结算一个行动节点。',
          sourceRefs: refs
        });
      } else {
        npcTrackPatches.push({
          operation: 'update',
          trackId: candidate.currentTrack.trackId,
          actorId,
          currentStatus: '仍在执行原行动，没有产生可结算结果',
          nextReviewAt: addGameHours(context.currentTime, 6),
          reviewKey,
          reason: '尚未达到实质推进门槛，只更新下一次复核时间。',
          sourceRefs: refs
        });
      }
    }

    const organizationEvolutionPatches: any[] = [];
    for (const candidate of context.organizationCandidates as any[]) {
      const organizationId = candidate.organization.organizationId as string;
      const reviewKey = candidate.review.reviewKey as string;
      const refs = organizationSourceRefs(candidate);
      const currentTrack = candidate.currentTrack;
      if (!currentTrack || currentTrack.status === 'quiet') {
        organizationEvolutionPatches.push({
          operation: 'activate',
          trackId: currentTrack?.trackId ?? `organization_track_${organizationId}`,
          organizationId,
          status: 'active',
          objective: '完成一个低频、有限的机构行动节点',
          currentAction: '协调相关人员处理一项既有机构事务',
          currentStatus: '行动刚刚开始，尚未形成结果',
          startedAt: context.currentTime,
          expectedEndAt: addGameHours(context.currentTime, 48),
          nextReviewAt: addGameHours(context.currentTime, 24),
          relatedActorIds: refs.actorIds,
          relatedPlaceIds: refs.placeIds,
          relatedCaseIds: refs.caseIds,
          relatedCityTrackIds: refs.cityTrackIds,
          currentState: '相关人员正在处理一项既有机构事务。',
          pressureSummary: '行动仍处于有限协调阶段，没有逐日经营结算。',
          visibility: 'player_known',
          reviewKey,
          reason: '确定性负载客户端激活一条受限组织心跳。',
          sourceRefs: refs
        });
      } else if (candidate.review.allowMaterialProgress) {
        const outcomeKind = outcomeCycle[(this.callCount + organizationEvolutionPatches.length) % outcomeCycle.length];
        this.materialOutcomeKinds.add(outcomeKind);
        automaticOutcomeCount += 1;
        organizationEvolutionPatches.push({
          operation: 'settle',
          trackId: currentTrack.trackId,
          organizationId,
          outcomeKind,
          outcomeSummary: `该机构行动得到 ${outcomeKind} 结果，不保证成功，也不触发逐日补算。`,
          consequence: outcomeKind === 'progress' ? '形成一个有限后续方向。' : '保留真实的无果、受阻或失败。',
          nextReviewAt: addGameHours(context.currentTime, 24 * 7),
          currentState: `机构本轮行动已以 ${outcomeKind} 结束，等待下一次自然触发。`,
          pressureSummary: '该节点已经结算，不会在同一天再次物质推进。',
          reviewKey,
          reason: '游戏时间达到组织复核门，只结算一个行动节点。',
          sourceRefs: refs
        });
      } else {
        organizationEvolutionPatches.push({
          operation: 'update',
          trackId: currentTrack.trackId,
          organizationId,
          currentStatus: '仍在执行原行动，没有产生可结算结果',
          nextReviewAt: addGameHours(context.currentTime, 24),
          reviewKey,
          reason: '尚未达到组织物质推进门，只调整下一次复核。',
          sourceRefs: refs
        });
      }
    }

    const citySituationTrackPatches: any[] = [];
    const outcomeRecords: any[] = [];
    for (const candidate of context.cityCandidates as any[]) {
      const track = candidate.track;
      const refs = sourceRefs(undefined, track.trackId);
      citySituationTrackPatches.push({
        operation: 'update',
        trackId: track.trackId,
        status: safeCityStatus(track.status, this.callCount),
        pressureLevel: track.pressureLevel,
        currentBeat: `第 ${this.callCount} 次技术复核后，局势保持有限变化。`,
        nextReviewAt: addGameHours(context.currentTime, 6 + (this.callCount % 4) * 6),
        reviewKey: candidate.reviewKey,
        reason: '按城市轨道既有状态做单阶段演化。',
        sourceRefs: refs
      });
      if (automaticOutcomeCount + outcomeRecords.length < 4) {
        outcomeRecords.push({
          outcomeId: `outcome_city_${this.callCount}_${track.trackId}`,
          sourceKind: 'city',
          sourceId: track.trackId,
          title: `${track.title}完成一次复核`,
          summary: '城市局势产生了一次有限、可追溯的已知变化。',
          relatedActorIds: track.relatedActorIds,
          relatedOrganizationIds: track.relatedOrganizationIds,
          relatedPlaceIds: track.relatedPlaceIds,
          relatedCaseIds: [],
          relatedRelationshipThreadIds: [],
          visibility: track.visibility,
          significance: this.callCount % 25 === 0 ? 'historic' : 'routine',
          reviewKey: candidate.reviewKey,
          reason: '为已验证城市变化建立近期结算。',
          sourceRefs: refs
        });
      }
    }

    const chronicleEntries = this.callCount % 25 === 0 && outcomeRecords[0]
      ? [
          {
            entryId: `chronicle_background_${this.callCount}`,
            title: `第 ${this.callCount} 次长期城市变化`,
            summary: '一条反复出现的城市变化已经具备长期记录价值。',
            longTermImpact: '后续人物和案件可把这项变化作为既有城市背景，而不需要保留全部短期过程。',
            sourceOutcomeIds: [outcomeRecords[0].outcomeId],
            relatedActorIds: outcomeRecords[0].relatedActorIds,
            relatedOrganizationIds: outcomeRecords[0].relatedOrganizationIds,
            relatedPlaceIds: outcomeRecords[0].relatedPlaceIds,
            relatedCaseIds: [],
            visibility: 'public',
            reviewKey: outcomeRecords[0].reviewKey,
            reason: '该结算被确定性负载场景标记为长期影响。',
            sourceRefs: outcomeRecords[0].sourceRefs
          }
        ]
      : [];

    if (this.callCount % 211 === 0 && context.npcCandidates[0]) {
      const candidate = context.npcCandidates[0];
      return {
        backgroundActorPatches: [
          {
            actorId: 'player',
            statusSummary: '越权修改不得生效',
            reviewKey: candidate.review.reviewKey,
            reason: '注入越权 patch。',
            sourceRefs: sourceRefs(candidate)
          }
        ]
      };
    }

    return { npcTrackPatches, organizationEvolutionPatches, citySituationTrackPatches, outcomeRecords, chronicleEntries };
  }
}

function advanceForStep(time: GameTime, step: number): GameTime {
  if (step % 125 === 0) return addGameHours(time, 24 * 21);
  if (step % 40 === 0) return addGameHours(time, 24 * 3);
  if (step % 9 === 0) return addGameHours(time, 12);
  if (step % 3 === 0) return addGameHours(time, 1);
  return addGameMinutes(time, 5);
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete background load database.'));
    request.onblocked = () => reject(new Error('Background load database deletion was blocked.'));
  });
}

describe.skipIf(!shouldRun)('background evolution long-run technical load', () => {
  it('runs 1000 bounded state-pipeline steps with persistence and failure injection', async () => {
    const startedAt = performance.now();
    const baselineHeapBytes = process.memoryUsage().heapUsed;
    const dbName = `copv2-background-evolution-load-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const repository = new IndexedDbSaveRepository(dbName);
    const client = new DeterministicBackgroundClient();
    const durations: number[] = [];
    const checkpoints: TechnicalCheckpoint[] = [];
    let state = createInitialRuntimeState();
    const actorIds = addSeedActors(state);
    const organizationIds = addSeedOrganizations(state, actorIds);
    addSeedRelationships(state, actorIds);
    addSeedCases(state, actorIds, organizationIds);
    addSeedCityTracks(state, actorIds, organizationIds);
    const presentProtectedActorId = actorIds.at(-1)!;
    state.actors[presentProtectedActorId].presence = 'present';
    state.actors[presentProtectedActorId].statusSummary = '正在玩家当前场景，禁止后台并发修改。';
    const protectedActorSnapshot = structuredClone(state.actors[presentProtectedActorId]);
    let maxActiveNpcTracks = 0;
    let maxActiveOrganizationTracks = 0;
    let maxOrganizationTrackRecords = 0;
    let maxRecentOutcomes = 0;
    let maxChronicleEntries = 0;
    let maxSelectedNpcs = 0;
    let maxSelectedOrganizations = 0;
    let maxSelectedCities = 0;
    let persistenceFailures = 0;
    let persistenceRoundTrips = 0;
    let failedRuns = 0;
    let abortedRuns = 0;

    try {
      for (let step = 1; step <= STEP_COUNT; step += 1) {
        const stepStartedAt = performance.now();
        const previousTime = { ...state.time };
        state.time = advanceForStep(state.time, step);
        state.turnCounter = step;
        const touchedCaseId = step % 53 === 0 ? `case_background_load_${String((step % CASE_COUNT) + 1).padStart(2, '0')}` : undefined;
        const touchedRelationshipId = step % 71 === 0
          ? `relationship_background_load_${String((step % RELATIONSHIP_COUNT) + 1).padStart(2, '0')}`
          : undefined;
        const touchedOrganizationId = step % 83 === 0
          ? organizationIds[step % ACTIVATED_ORGANIZATION_COUNT]
          : undefined;
        const selection = selectBackgroundEvolutionCandidates({
          state,
          previousTime,
          foregroundTurnId: `load_turn_${step}`,
          foregroundTouchedCaseIds: touchedCaseId ? [touchedCaseId] : [],
          foregroundTouchedRelationshipThreadIds: touchedRelationshipId ? [touchedRelationshipId] : [],
          foregroundTouchedActorIds: step % 97 === 0 ? [actorIds[step % actorIds.length]] : [],
          foregroundTouchedOrganizationIds: touchedOrganizationId ? [touchedOrganizationId] : [],
          manual: step % 100 === 0
        });
        maxSelectedNpcs = Math.max(maxSelectedNpcs, selection.npcCandidates.length);
        maxSelectedOrganizations = Math.max(maxSelectedOrganizations, selection.organizationCandidates.length);
        maxSelectedCities = Math.max(maxSelectedCities, selection.cityCandidates.length);

        const result = await runBackgroundEvolution({
          state,
          selection,
          client,
          foregroundTurnId: `load_turn_${step}`
        });
        state = result.state;
        if (result.status === 'failed') failedRuns += 1;
        if (result.status === 'aborted') abortedRuns += 1;
        maxActiveNpcTracks = Math.max(maxActiveNpcTracks, Object.keys(state.backgroundEvolution.npcTracks).length);
        const activeOrganizationTracks = Object.values(state.backgroundEvolution.organizationTracks)
          .filter((track) => track.status !== 'quiet').length;
        maxActiveOrganizationTracks = Math.max(maxActiveOrganizationTracks, activeOrganizationTracks);
        maxOrganizationTrackRecords = Math.max(
          maxOrganizationTrackRecords,
          Object.keys(state.backgroundEvolution.organizationTracks).length
        );
        maxRecentOutcomes = Math.max(maxRecentOutcomes, state.backgroundEvolution.recentOutcomes.length);
        maxChronicleEntries = Math.max(maxChronicleEntries, state.backgroundEvolution.chronicle.length);

        const actorsWithTracks = Object.values(state.backgroundEvolution.npcTracks).map((track) => track.actorId);
        const organizationsWithTracks = Object.values(state.backgroundEvolution.organizationTracks).map(
          (track) => track.organizationId
        );
        expect(new Set(actorsWithTracks).size).toBe(actorsWithTracks.length);
        expect(new Set(organizationsWithTracks).size).toBe(organizationsWithTracks.length);
        expect(actorsWithTracks).not.toContain(presentProtectedActorId);
        expect(state.actors[presentProtectedActorId]).toEqual(protectedActorSnapshot);
        expect(state.backgroundEvolution.recentOutcomes.length).toBeLessThanOrEqual(24);
        expect(state.backgroundEvolution.chronicle.length).toBeLessThanOrEqual(256);
        expect(activeOrganizationTracks).toBeLessThanOrEqual(12);

        if (step % PERSISTENCE_INTERVAL === 0) {
          const now = new Date(Date.UTC(2026, 6, 17, 0, 0, step / PERSISTENCE_INTERVAL)).toISOString();
          const record = createSaveRecord(state, now);
          await repository.save(record);
          const loaded = await repository.load(record.saveId);
          if (!loaded) {
            persistenceFailures += 1;
          } else {
            const parsed = parseRuntimeSaveRecord(loaded);
            const portable = createPortableSaveRecord(parsed);
            const roundTrip = parseRuntimeSaveRecord(JSON.parse(JSON.stringify(portable)));
            if (
              roundTrip.runtimeState.turnCounter !== step ||
              Object.keys(roundTrip.runtimeState.backgroundEvolution.npcTracks).length !==
                Object.keys(state.backgroundEvolution.npcTracks).length ||
              Object.keys(roundTrip.runtimeState.backgroundEvolution.organizationTracks).length !==
                Object.keys(state.backgroundEvolution.organizationTracks).length ||
              roundTrip.runtimeState.backgroundEvolution.recentOutcomes.length !==
                state.backgroundEvolution.recentOutcomes.length
            ) {
              persistenceFailures += 1;
            }
            state = roundTrip.runtimeState;
          }
          persistenceRoundTrips += 1;
          checkpoints.push({
            step,
            gameTime: { ...state.time },
            activeNpcTracks: Object.keys(state.backgroundEvolution.npcTracks).length,
            activeOrganizationTracks: Object.values(state.backgroundEvolution.organizationTracks)
              .filter((track) => track.status !== 'quiet').length,
            recentOutcomes: state.backgroundEvolution.recentOutcomes.length,
            chronicleEntries: state.backgroundEvolution.chronicle.length,
            actorMemories: Object.values(state.memories).filter((memory) => memory.kind === 'actor').length,
            stateBytes: byteLength(state),
            heapUsedBytes: process.memoryUsage().heapUsed
          });
        }
        durations.push(performance.now() - stepStartedAt);
      }

      const caseResultMemoryCounts = new Map<string, number>();
      for (const memory of Object.values(state.memories)) {
        if (memory.kind !== 'actor' || memory.certainty !== 'fact' || !memory.periodEnd) continue;
        for (const caseId of memory.relatedCaseIds) {
          const key = `${caseId}:${gameDateKey(memory.periodEnd)}`;
          caseResultMemoryCounts.set(key, (caseResultMemoryCounts.get(key) ?? 0) + 1);
        }
      }
      const sameCaseDayViolations = [...caseResultMemoryCounts.entries()].filter(([, count]) => count > 1);
      const durationMs = performance.now() - startedAt;
      const finalStateBytes = byteLength(state);
      const finalHeapBytes = process.memoryUsage().heapUsed;
      const report = {
        test: 'background-evolution-long-run-technical',
        generatedAt: new Date().toISOString(),
        disclaimer: 'This is 1000 deterministic technical state-pipeline steps, not 1000 real-API gameplay turns.',
        topology: {
          steps: STEP_COUNT,
          npcs: NPC_COUNT,
          organizations: ORGANIZATION_COUNT,
          structurallyActivatedOrganizations: ACTIVATED_ORGANIZATION_COUNT,
          relationships: RELATIONSHIP_COUNT,
          cases: CASE_COUNT,
          cityTracks: CITY_TRACK_COUNT
        },
        bounds: {
          maxSelectedNpcs,
          maxSelectedOrganizations,
          maxSelectedCities,
          maxActiveNpcTracks,
          maxActiveOrganizationTracks,
          maxOrganizationTrackRecords,
          maxRecentOutcomes,
          maxChronicleEntries,
          maxPromptChars: client.maxPromptChars,
          sameCaseDayViolations: sameCaseDayViolations.length
        },
        outcomes: {
          observedKinds: [...client.materialOutcomeKinds].sort(),
          failedRuns,
          abortedRuns,
          injectedFailures: client.injectedFailures,
          invalidPayloads: client.invalidPayloads,
          finalCaseStatuses: Object.values(state.cases).reduce<Record<string, number>>((counts, item) => {
            counts[item.status] = (counts[item.status] ?? 0) + 1;
            return counts;
          }, {})
        },
        persistence: {
          roundTrips: persistenceRoundTrips,
          failures: persistenceFailures
        },
        performance: {
          durationMs: Math.round(durationMs),
          stepMs: {
            p50: Number(percentile(durations, 0.5).toFixed(2)),
            p95: Number(percentile(durations, 0.95).toFixed(2)),
            p99: Number(percentile(durations, 0.99).toFixed(2)),
            max: Number(Math.max(...durations).toFixed(2))
          },
          baselineHeapBytes,
          finalHeapBytes,
          finalStateBytes
        },
        checkpoints
      };
      const outputDirectory = path.resolve('output', 'background-evolution');
      await mkdir(outputDirectory, { recursive: true });
      const reportPath = path.join(outputDirectory, `long-load-${report.generatedAt.replace(/[:.]/g, '-')}.json`);
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(`[background-long-load] report: ${reportPath}`);

      expect(maxSelectedNpcs).toBeLessThanOrEqual(MAX_BACKGROUND_NPC_CANDIDATES);
      expect(maxSelectedOrganizations).toBeLessThanOrEqual(MAX_BACKGROUND_ORGANIZATION_CANDIDATES);
      expect(maxSelectedCities).toBeLessThanOrEqual(MAX_BACKGROUND_CITY_CANDIDATES);
      expect(maxActiveNpcTracks).toBeLessThanOrEqual(8);
      expect(maxActiveOrganizationTracks).toBeLessThanOrEqual(12);
      expect(maxOrganizationTrackRecords).toBe(ACTIVATED_ORGANIZATION_COUNT);
      expect(maxRecentOutcomes).toBeLessThanOrEqual(24);
      expect(maxChronicleEntries).toBeLessThanOrEqual(256);
      expect(client.maxPromptChars).toBeLessThanOrEqual(36_000);
      expect(client.materialOutcomeKinds).toEqual(new Set(outcomeCycle));
      expect(sameCaseDayViolations).toEqual([]);
      expect(Object.values(state.cases).every((caseFile) => caseFile.status === 'investigating')).toBe(true);
      expect(persistenceRoundTrips).toBe(STEP_COUNT / PERSISTENCE_INTERVAL);
      expect(persistenceFailures).toBe(0);
      expect(failedRuns).toBeGreaterThan(0);
      expect(abortedRuns).toBe(0);
      expect(finalStateBytes).toBeLessThan(16 * 1024 * 1024);
      expect(durationMs).toBeLessThan(180_000);
    } finally {
      await deleteDatabase(dbName);
    }
  });
});
