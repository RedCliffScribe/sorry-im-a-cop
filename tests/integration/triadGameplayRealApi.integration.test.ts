import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackgroundEvolutionClientFromSettings } from '../../src/domain/backgroundEvolution/createBackgroundEvolutionClientFromSettings';
import { runBackgroundEvolution } from '../../src/domain/backgroundEvolution/runBackgroundEvolution';
import { selectBackgroundEvolutionCandidates } from '../../src/domain/backgroundEvolution/selection';
import { addGameHours } from '../../src/domain/backgroundEvolution/time';
import { createCityPowerInstitutionView } from '../../src/domain/cityPower/cityPowerDatabaseView';
import { projectGrayNetworkContext } from '../../src/domain/grayNetwork/grayNetworkContextProjector';
import {
  projectPlayerIdentityContext,
  projectPublicActorRoleProfiles
} from '../../src/domain/identity/identityContextProjector';
import { applyPlayerIdentityContextPatch } from '../../src/domain/identity/playerIdentityContext';
import type { NarratorClient } from '../../src/domain/narrator/NarratorClient';
import { projectPolicePanelContext } from '../../src/domain/police/policePanelContextProjector';
import { createActorDefaults } from '../../src/domain/runtime/actorFactory';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type { CurrentIdentity, RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';

const shouldRun = process.env.COPV2_RUN_TRIAD_GAMEPLAY_REAL_API === '1';
const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_TRIAD_REAL_REQUEST_TIMEOUT_MS ?? 600_000)
);

type ScenarioKind =
  | 'triad_direct'
  | 'civilian_contact'
  | 'police_contact'
  | 'police_undercover_triad'
  | 'triad_undercover_police';

interface ScenarioDefinition {
  kind: ScenarioKind;
  targetOrganizationId: string;
  initialIdentity: CurrentIdentity;
  expectedPublicIdentity: CurrentIdentity;
  coverTarget?: 'police' | 'gang_member';
  forbiddenPromptMarkers: string[];
}

interface HttpAuditEntry {
  route: TurnApiRoute;
  path: string;
  status: number | null;
  responseMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  error?: string;
}

interface ScenarioResult {
  scenario: ScenarioKind;
  targetOrganizationId: string;
  selectedOrganizationIds: string[];
  selectionTrigger: string | null;
  status: string;
  appliedPatchCount: number;
  droppedPatchCount: number;
  diagnosticCodes: string[];
  diagnosticDetails: string[];
  promptHasTargetOrganization: boolean;
  promptHasTriadProfile: boolean;
  promptHasTriadState: boolean;
  promptHasForbiddenPrivateMarker: boolean;
  playerBoundaryProtected: boolean;
  publicIdentityProjectionMatches: boolean;
  publicRoleProjectionMatches: boolean;
  policePanelProjectionMatches: boolean;
  grayNetworkProjectionMatches: boolean;
  institutionExcludesTriads: boolean;
  privateIdentityFactsNotPublic: boolean;
  triadProfileProtected: boolean;
  nonTargetTriadsProtected: boolean;
  triadStateChanged: boolean;
  organizationTrackApplied: boolean;
  organizationMemoryCount: number;
}

const scenarios: ScenarioDefinition[] = [
  {
    kind: 'triad_direct',
    targetOrganizationId: 'org_wo_shing_wo',
    initialIdentity: 'gang_member',
    expectedPublicIdentity: 'gang_member',
    forbiddenPromptMarkers: []
  },
  {
    kind: 'civilian_contact',
    targetOrganizationId: 'org_sun_yee_on',
    initialIdentity: 'civilian',
    expectedPublicIdentity: 'civilian',
    forbiddenPromptMarkers: []
  },
  {
    kind: 'police_contact',
    targetOrganizationId: 'org_14k',
    initialIdentity: 'police',
    expectedPublicIdentity: 'police',
    forbiddenPromptMarkers: []
  },
  {
    kind: 'police_undercover_triad',
    targetOrganizationId: 'org_shui_fong',
    initialIdentity: 'police',
    expectedPublicIdentity: 'gang_member',
    coverTarget: 'gang_member',
    forbiddenPromptMarkers: ['皇家香港警察卧底人员', '真实警察身份']
  },
  {
    kind: 'triad_undercover_police',
    targetOrganizationId: 'org_wo_hop_to',
    initialIdentity: 'gang_member',
    expectedPublicIdentity: 'police',
    coverTarget: 'police',
    forbiddenPromptMarkers: ['真实效忠和合图', '和合图成员，奉命']
  }
];

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 500);
}

function numberField(record: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function usageFromPayload(payload: unknown): Pick<HttpAuditEntry, 'promptTokens' | 'completionTokens' | 'totalTokens'> {
  if (!payload || typeof payload !== 'object') return {};
  const source = payload as Record<string, unknown>;
  const usageCandidate = source.usage ?? source.usageMetadata ?? source.usage_metadata;
  const usage = usageCandidate && typeof usageCandidate === 'object'
    ? (usageCandidate as Record<string, unknown>)
    : undefined;
  return {
    promptTokens: numberField(usage, 'prompt_tokens', 'promptTokenCount', 'input_tokens'),
    completionTokens: numberField(usage, 'completion_tokens', 'candidatesTokenCount', 'output_tokens'),
    totalTokens: numberField(usage, 'total_tokens', 'totalTokenCount')
  };
}

function createAuditedFetch(audits: HttpAuditEntry[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    let requestPath = 'unknown';
    try {
      requestPath = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
    } catch {
      // The URL itself is intentionally not written to the report.
    }
    try {
      const response = await fetch(input, init);
      let usage: ReturnType<typeof usageFromPayload> = {};
      if (response.ok) {
        try {
          usage = usageFromPayload(await response.clone().json());
        } catch {
          usage = {};
        }
      }
      audits.push({
        route: 'backgroundEvolution',
        path: requestPath,
        status: response.status,
        responseMs: Math.round(performance.now() - startedAt),
        ...usage
      });
      return response;
    } catch (error) {
      audits.push({
        route: 'backgroundEvolution',
        path: requestPath,
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

function routeMetadata(settings: AiSettings) {
  const route = settings.featureRoutes.backgroundEvolution;
  if (route.mode !== 'custom') return { routeId: 'backgroundEvolution', mode: route.mode };
  const profile = settings.apiProfiles.find((item) => item.id === route.apiProfileId);
  return {
    routeId: 'backgroundEvolution',
    mode: route.mode,
    profileName: profile?.name ?? 'missing',
    interfaceType: profile?.interfaceType ?? 'missing',
    model: route.model,
    maxTokens: route.maxTokens ?? profile?.defaultMaxTokens
  };
}

function scenarioSetup(definition: ScenarioDefinition) {
  const base = {
    playerName: `验收玩家-${definition.kind}`,
    currentIdentity: definition.initialIdentity,
    startTime: { year: 1984, month: 12, day: 27, hour: 9, minute: 0 },
    openingPressure: 'routine' as const,
    storypackInfluence: 'medium' as const
  };
  if (definition.initialIdentity !== 'gang_member') return base;
  const temporary = createInitialRuntimeState(base);
  const areaId = temporary.organizations[definition.targetOrganizationId]?.triadProfile?.activityAreas[0]?.placeId;
  return {
    ...base,
    triadSocietyId: definition.targetOrganizationId,
    triadTerritoryPlaceId: areaId,
    triadRankId: 'crew_lead' as const
  };
}

function enterUndercoverIdentity(
  state: RuntimeState,
  target: 'police' | 'gang_member',
  targetOrganizationId: string
): RuntimeState {
  const fromIdentity = state.player.currentIdentity;
  const organization = state.organizations[targetOrganizationId];
  if (fromIdentity === target || !organization) throw new Error('Invalid undercover scenario seed.');
  const isPoliceCover = target === 'police';
  const result = applyPlayerIdentityContextPatch(state, {
    transitionId: `transition_triad_real_${fromIdentity}_to_${target}`,
    kind: 'cover_enter',
    fromIdentity,
    toIdentity: target,
    publicIdentity: isPoliceCover ? '皇家香港警察基层警员' : `${organization.name}地区联络`,
    policeNumber: isPoliceCover ? '4821' : undefined,
    actualIdentitySummary: isPoliceCover
      ? `${organization.name}成员，奉命以警察身份担任内线。`
      : '皇家香港警察卧底人员。',
    reason: isPoliceCover ? '社团安排玩家以公开警察身份进入警队。' : '警队批准玩家以公开社团身份执行卧底任务。',
    targetRoleProfile: isPoliceCover
      ? {
          identity: 'police',
          profile: {
            status: 'cover',
            agencyId: 'org_hk_police',
            stationOrPost: 'Mong Kok Police Station（旺角警署）',
            department: 'Uniform Branch（军装巡逻）',
            rank: 'Police Constable（警员）',
            assignmentSummary: 'Street Patrol Officer（街面巡逻）',
            postRole: '基层巡逻警员',
            supervisorActorIds: [],
            peerActorIds: [],
            authoritySummary: '拥有当前警阶对应的基层警务权限。',
            accessSummary: '只能接触基层勤务和公开资料。',
            dutySummary: '维持街面秩序，处理当值期间遇到的事件。',
            institutionalReputation: '新入职警员，尚未形成稳定评价。',
            disciplinePressureSummary: '必须维持公开警察身份并接受纪律约束。',
            covertStatus: '真实社团效忠仅存在于秘密事实。'
          }
        }
      : {
          identity: 'gang_member',
          profile: {
            status: 'cover',
            organizationId: targetOrganizationId,
            societyName: organization.name,
            roleTitle: '地区基层联络',
            rankSummary: '基层成员',
            territorySummary: organization.triadProfile?.activityAreas[0]?.label ?? '油尖旺一带',
            patronActorIds: [],
            peerActorIds: [],
            rivalActorIds: [],
            coverIdentitySummary: `公开身份为${organization.name}地区基层联络。`,
            obligationSummary: '只处理上线明确交代的基层事务。',
            riskSummary: '真实警察身份一旦暴露会危及任务和人身安全。'
          }
        },
    secretFactPatches: [
      {
        operation: 'upsert',
        fact: {
          secretId: `secret_triad_real_${fromIdentity}_to_${target}`,
          ownerType: 'player',
          ownerId: state.player.actorId,
          kind: 'identity',
          summary: isPoliceCover
            ? `玩家真实效忠${organization.name}，公开身份是警察。`
            : '玩家真实身份是皇家香港警察，公开身份是社团成员。',
          playerCharacterKnown: true,
          publicKnown: false,
          knownByActorIds: [state.player.actorId],
          revealState: 'known_to_player_character',
          revealConditions: ['身份暴露或主动公开'],
          visibility: 'player_known',
          importance: 100
        }
      }
    ]
  });
  if (!result.applied) throw new Error(result.diagnostic ?? 'Failed to seed undercover state.');
  return result.state;
}

function addPlayerContact(state: RuntimeState, definition: ScenarioDefinition): void {
  if (definition.kind !== 'civilian_contact' && definition.kind !== 'police_contact') return;
  state.actors[state.player.actorId].organizationRelations.push({
    organizationId: definition.targetOrganizationId,
    relationType: definition.kind === 'police_contact' ? 'investigator' : 'contact',
    roleTitle: definition.kind === 'police_contact' ? '案件接触' : '街坊接触',
    summary:
      definition.kind === 'police_contact'
        ? '玩家因一次未结调查接触过该社团的外围线索，不是其成员。'
        : '玩家只通过工作或街坊关系接触过该社团外围人物，不是其成员。',
    visibility: 'player_known'
  });
}

function prepareScenarioState(definition: ScenarioDefinition, index: number): { state: RuntimeState; actorId: string } {
  let state = createInitialRuntimeState(scenarioSetup(definition));
  if (definition.coverTarget) {
    state = enterUndercoverIdentity(state, definition.coverTarget, definition.targetOrganizationId);
  }
  addPlayerContact(state, definition);
  state.time = addGameHours(state.time, index * 72);
  state.cases = {};
  state.relationshipThreads = {};
  state.citySituationTracks = {};
  state.deferredEvents = {};
  state.dynamicEvents = { currentMatters: {}, signals: {}, newsIssues: {} };
  state.grayNetworks = { byAreaId: {} };
  state.backgroundEvolution = {
    npcTracks: {},
    organizationTracks: {},
    recentOutcomes: [],
    chronicle: []
  };

  const organization = state.organizations[definition.targetOrganizationId];
  const targetArea = organization?.triadProfile?.activityAreas[0];
  if (!organization?.triadState || !targetArea) throw new Error(`Missing triad profile: ${definition.targetOrganizationId}`);
  const actorId = `npc_triad_real_${index}`;
  state.actors[actorId] = createActorDefaults({
    actorId,
    name: `地区协调候选人${index}`,
    gender: 'male',
    currentIdentity: 'gang_member',
    publicIdentity: `${organization.name}地区协调人`,
    positionSummary: `负责${targetArea.label}一带的场所联络。`,
    currentPlaceId: targetArea.placeId,
    presence: 'absent',
    statusSummary: '正在等待内部议事确认是否获得临时主持权限。',
    personality: '谨慎、讲规矩。',
    motivation: '在不引来警方高压的前提下稳定本区关系。',
    longTermGoal: '取得地区线的持续认可。',
    organizationIds: [definition.targetOrganizationId],
    organizationRelations: [
      {
        organizationId: definition.targetOrganizationId,
        relationType: 'member',
        roleTitle: '地区协调候选人',
        summary: `参与${targetArea.label}地区事务，当前权限仍待内部确认。`,
        visibility: 'player_known'
      }
    ]
  });
  organization.relatedActorIds = [actorId];
  organization.triadState = {
    leadership: {
      phase: 'consultation',
      visibleSummary: `${organization.name}的资深关系人正在评估是否让一名地区人物暂代${targetArea.label}协调事务。`,
      nextMilestone: '本轮议事将决定是否形成临时授权，结果也可能是延后或受阻。',
      knownCandidateActorIds: [actorId],
      confidence: 'medium'
    },
    activityAreas: organization.triadState.activityAreas.map((area) =>
      area.placeId === targetArea.placeId
        ? {
            ...area,
            statusSummary: `${targetArea.label}近期出现越权传话与场所摩擦，内部正在重整联络口径。`,
            confidence: 'medium'
          }
        : area
    )
  };

  const trackId = `track_triad_real_${index}`;
  state.backgroundEvolution.organizationTracks[trackId] = {
    trackId,
    organizationId: definition.targetOrganizationId,
    status: 'active',
    objective: `决定是否让${state.actors[actorId].name}暂代${targetArea.label}地区协调职责。`,
    currentAction: '资深关系人正在复核其人手、规矩信用和最近场所摩擦，准备形成一次有限授权或明确搁置。',
    currentStatus: '意见已经收齐，现已到应作出本阶段决定的复核节点；结果不保证成功。',
    startedAt: addGameHours(state.time, -72),
    expectedEndAt: addGameHours(state.time, -2),
    nextReviewAt: addGameHours(state.time, -1),
    relatedActorIds: [actorId],
    relatedPlaceIds: [targetArea.placeId],
    relatedCaseIds: [],
    relatedCityTrackIds: [],
    lastEvolvedAt: addGameHours(state.time, -72),
    visibility: 'player_known'
  };
  return { state, actorId };
}

function expectedPublicRoleKey(identity: CurrentIdentity): 'police' | 'triad' | 'civilian' {
  return identity === 'gang_member' ? 'triad' : identity;
}

function boundarySnapshot(state: RuntimeState) {
  const actor = state.actors[state.player.actorId];
  return JSON.stringify({
    player: state.player,
    playerActor: actor,
    lawIdentity: state.lawIdentity,
    policePanel: state.policePanel,
    finance: state.finance
  });
}

function projectionChecks(state: RuntimeState, expectedIdentity: CurrentIdentity) {
  const actor = state.actors[state.player.actorId];
  const identityProjection = projectPlayerIdentityContext(state);
  const publicFacts = JSON.stringify(identityProjection.publicFacts);
  const privateSummaries = [
    ...identityProjection.directorOnlyFacts.map((fact) => fact.summary),
    ...identityProjection.protagonistPrivateKnowledge.facts.map((fact) => fact.summary)
  ].filter(Boolean);
  const institutionView = createCityPowerInstitutionView(
    state.organizations,
    state.player.currentIdentity,
    undefined,
    actor
      ? { actorId: state.player.actorId, organizationRelations: actor.organizationRelations }
      : undefined
  );
  return {
    publicIdentityProjectionMatches: state.player.currentIdentity === expectedIdentity,
    publicRoleProjectionMatches:
      Boolean(actor) &&
      JSON.stringify(Object.keys(projectPublicActorRoleProfiles(actor)).sort()) ===
        JSON.stringify([expectedPublicRoleKey(expectedIdentity)]),
    policePanelProjectionMatches: projectPolicePanelContext(state).available === (expectedIdentity === 'police'),
    grayNetworkProjectionMatches: projectGrayNetworkContext(state).perspective === expectedIdentity,
    institutionExcludesTriads: !institutionView.some((organization) => organization.type === 'triad'),
    privateIdentityFactsNotPublic: privateSummaries.every((summary) => !publicFacts.includes(summary))
  };
}

function allOtherTriadsSnapshot(state: RuntimeState, targetOrganizationId: string): string {
  return JSON.stringify(
    Object.values(state.organizations)
      .filter((organization) => organization.type === 'triad' && organization.organizationId !== targetOrganizationId)
      .sort((left, right) => left.organizationId.localeCompare(right.organizationId))
  );
}

function percentile(values: number[], percentage: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)];
}

describe.skipIf(!shouldRun)('triad gameplay real API identity matrix', () => {
  it('evolves triads without crossing public-identity or organization boundaries', async () => {
    const settings = importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'));
    const audits: HttpAuditEntry[] = [];
    const baseClient = createBackgroundEvolutionClientFromSettings(settings, createAuditedFetch(audits));
    if (!baseClient) throw new Error('The configured backgroundEvolution route is disabled or incomplete.');
    const results: ScenarioResult[] = [];

    for (const [index, definition] of scenarios.entries()) {
      const prepared = prepareScenarioState(definition, index + 1);
      const state = prepared.state;
      const targetBefore = structuredClone(state.organizations[definition.targetOrganizationId]);
      const triadProfileBefore = JSON.stringify(targetBefore.triadProfile);
      const triadStateBefore = JSON.stringify(targetBefore.triadState);
      const otherTriadsBefore = allOtherTriadsSnapshot(state, definition.targetOrganizationId);
      const playerBoundaryBefore = boundarySnapshot(state);
      const selection = selectBackgroundEvolutionCandidates({
        state,
        foregroundTurnId: `triad_real_${definition.kind}`,
        manual: false
      });
      const selectedOrganizationIds = selection.organizationCandidates.map((candidate) => candidate.organizationId);
      const targetCandidate = selection.organizationCandidates.find(
        (candidate) => candidate.organizationId === definition.targetOrganizationId
      );
      expect(targetCandidate).toBeDefined();

      let capturedPrompt = '';
      const client: NarratorClient = {
        complete: async (prompt, options) => {
          capturedPrompt = prompt;
          return baseClient.complete(prompt, options);
        }
      };
      const result = await runBackgroundEvolution({
        state,
        selection,
        client,
        foregroundTurnId: `triad_real_${definition.kind}`,
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
      const afterOrganization = result.state.organizations[definition.targetOrganizationId];
      const projections = projectionChecks(result.state, definition.expectedPublicIdentity);
      const organizationMemoryCount = Object.values(result.state.memories).filter(
        (memory) =>
          memory.kind === 'actor' &&
          memory.relatedActorIds.includes(prepared.actorId) &&
          memory.relatedOrganizationIds.includes(definition.targetOrganizationId)
      ).length;
      const scenarioResult: ScenarioResult = {
        scenario: definition.kind,
        targetOrganizationId: definition.targetOrganizationId,
        selectedOrganizationIds,
        selectionTrigger: targetCandidate?.trigger ?? null,
        status: result.status,
        appliedPatchCount: result.state.backgroundEvolution.lastRun?.appliedPatchCount ?? 0,
        droppedPatchCount: result.state.backgroundEvolution.lastRun?.droppedPatchCount ?? 0,
        diagnosticCodes: result.diagnostics.map((issue) => issue.code),
        diagnosticDetails: result.diagnostics.map(
          (issue) => `${issue.path.join('.')}:${issue.code}:${issue.message.slice(0, 240)}`
        ),
        promptHasTargetOrganization: capturedPrompt.includes(`"organizationId":"${definition.targetOrganizationId}"`),
        promptHasTriadProfile: capturedPrompt.includes('"triadProfile":{'),
        promptHasTriadState: capturedPrompt.includes('"triadState":{'),
        promptHasForbiddenPrivateMarker: definition.forbiddenPromptMarkers.some((marker) => capturedPrompt.includes(marker)),
        playerBoundaryProtected: boundarySnapshot(result.state) === playerBoundaryBefore,
        ...projections,
        triadProfileProtected: JSON.stringify(afterOrganization.triadProfile) === triadProfileBefore,
        nonTargetTriadsProtected: allOtherTriadsSnapshot(result.state, definition.targetOrganizationId) === otherTriadsBefore,
        triadStateChanged: JSON.stringify(afterOrganization.triadState) !== triadStateBefore,
        organizationTrackApplied: Boolean(
          Object.values(result.state.backgroundEvolution.organizationTracks).find(
            (track) => track.organizationId === definition.targetOrganizationId && track.lastAppliedReviewKey
          )
        ),
        organizationMemoryCount
      };
      results.push(scenarioResult);
      console.log(
        `[triad-real-api] ${definition.kind}/${definition.targetOrganizationId}: ` +
          `status=${scenarioResult.status} applied=${scenarioResult.appliedPatchCount} ` +
          `stateChanged=${scenarioResult.triadStateChanged} memories=${organizationMemoryCount} ` +
          `diagnostics=${scenarioResult.diagnosticCodes.join(',') || 'none'}`
      );
    }

    const unlinkedState = createInitialRuntimeState({ currentIdentity: 'civilian' });
    unlinkedState.backgroundEvolution = {
      npcTracks: {},
      organizationTracks: {},
      recentOutcomes: [],
      chronicle: []
    };
    unlinkedState.grayNetworks = { byAreaId: {} };
    unlinkedState.cases = {};
    unlinkedState.relationshipThreads = {};
    unlinkedState.citySituationTracks = {};
    const unlinkedSelection = selectBackgroundEvolutionCandidates({
      state: unlinkedState,
      foregroundTurnId: 'triad_real_unlinked_control',
      manual: false
    });
    const unlinkedTriadCandidates = unlinkedSelection.organizationCandidates.filter((candidate) =>
      unlinkedState.organizations[candidate.organizationId]?.type === 'triad'
    );

    const report = {
      test: 'triad-gameplay-real-api-identity-matrix',
      generatedAt: new Date().toISOString(),
      settingsFile: path.basename(settingsPath),
      credentialSafety: {
        keysLoadedInMemory: settings.apiProfiles.some((profile) => Boolean(profile.apiKey)),
        keyValuesRecorded: false,
        rawPromptsRecorded: false,
        rawResponsesRecorded: false
      },
      route: routeMetadata(settings),
      requestPlan: {
        liveRequests: scenarios.length,
        sequential: true,
        timeoutMsPerRequest: requestTimeoutMs,
        scenarios: scenarios.map(({ kind, targetOrganizationId, initialIdentity, expectedPublicIdentity }) => ({
          kind,
          targetOrganizationId,
          initialIdentity,
          expectedPublicIdentity
        })),
        unlinkedControlUsesApi: false
      },
      summary: {
        succeeded: results.filter((item) => item.status === 'succeeded').length,
        appliedOrganizationTracks: results.filter((item) => item.organizationTrackApplied).length,
        changedTriadStates: results.filter((item) => item.triadStateChanged).length,
        actorMemoriesWritten: results.reduce((sum, item) => sum + item.organizationMemoryCount, 0),
        allPromptsContainTargetProfileAndState: results.every(
          (item) => item.promptHasTargetOrganization && item.promptHasTriadProfile && item.promptHasTriadState
        ),
        allPrivateMarkersRedacted: results.every((item) => !item.promptHasForbiddenPrivateMarker),
        allIdentityBoundariesProtected: results.every(
          (item) =>
            item.playerBoundaryProtected &&
            item.publicIdentityProjectionMatches &&
            item.publicRoleProjectionMatches &&
            item.policePanelProjectionMatches &&
            item.grayNetworkProjectionMatches &&
            item.privateIdentityFactsNotPublic
        ),
        allInstitutionPanelsExcludeTriads: results.every((item) => item.institutionExcludesTriads),
        allTriadProfilesProtected: results.every((item) => item.triadProfileProtected),
        allNonTargetTriadsProtected: results.every((item) => item.nonTargetTriadsProtected),
        unlinkedTriadCandidateCount: unlinkedTriadCandidates.length
      },
      http: {
        requestCount: audits.length,
        statusCounts: Object.fromEntries(
          [...new Set(audits.map((audit) => (audit.status === null ? 'network_error' : String(audit.status))))].map(
            (status) => [status, audits.filter((audit) => (audit.status === null ? 'network_error' : String(audit.status)) === status).length]
          )
        ),
        responseMs: {
          p50: percentile(audits.map((audit) => audit.responseMs), 0.5),
          p95: percentile(audits.map((audit) => audit.responseMs), 0.95),
          max: Math.max(0, ...audits.map((audit) => audit.responseMs))
        },
        tokenTotals: {
          prompt: audits.reduce((sum, audit) => sum + (audit.promptTokens ?? 0), 0),
          completion: audits.reduce((sum, audit) => sum + (audit.completionTokens ?? 0), 0),
          total: audits.reduce((sum, audit) => sum + (audit.totalTokens ?? 0), 0)
        },
        errors: audits.filter((audit) => audit.error).map((audit) => audit.error)
      },
      results
    };
    const outputDirectory = path.resolve('output', 'triad-gameplay');
    await mkdir(outputDirectory, { recursive: true });
    const reportPath = path.join(outputDirectory, `real-api-${report.generatedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[triad-real-api] report: ${reportPath}`);

    expect(audits).toHaveLength(scenarios.length);
    expect(audits.every((audit) => audit.status !== null && audit.status >= 200 && audit.status < 300)).toBe(true);
    expect(results.every((item) => item.status === 'succeeded')).toBe(true);
    expect(results.every((item) => item.organizationTrackApplied)).toBe(true);
    expect(results.filter((item) => item.triadStateChanged).length).toBeGreaterThanOrEqual(3);
    expect(results.reduce((sum, item) => sum + item.organizationMemoryCount, 0)).toBeGreaterThanOrEqual(1);
    expect(report.summary.allPromptsContainTargetProfileAndState).toBe(true);
    expect(report.summary.allPrivateMarkersRedacted).toBe(true);
    expect(report.summary.allIdentityBoundariesProtected).toBe(true);
    expect(report.summary.allInstitutionPanelsExcludeTriads).toBe(true);
    expect(report.summary.allTriadProfilesProtected).toBe(true);
    expect(report.summary.allNonTargetTriadsProtected).toBe(true);
    expect(unlinkedTriadCandidates).toHaveLength(0);
  }, 3_600_000);
});
