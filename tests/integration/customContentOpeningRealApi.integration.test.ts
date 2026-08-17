import 'fake-indexeddb/auto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import type {
  NarratorClient,
  NarratorRequestPurpose
} from '../../src/domain/narrator/NarratorClient';
import { runOpening } from '../../src/domain/opening/runOpening';
import { IndexedDbOpeningSessionRepository } from '../../src/domain/opening/IndexedDbOpeningSessionRepository';
import { runOpeningV2 } from '../../src/domain/opening/runOpeningV2';
import {
  runPlayerTurn,
  type TurnExecutionStage
} from '../../src/domain/turn/TurnEngine';
import {
  createInitialRuntimeState,
  type OpeningSetup
} from '../../src/domain/runtime/initialState';
import type { RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings, ApiProfile } from '../../src/domain/settings/types';
import {
  createCustomContentRevisionRef,
  customContentRevisionRefKey
} from '../../src/domain/customContent/assetFoundation';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision,
  CustomContentDependency,
  CustomContentProjectAsset,
  CustomContentProjectRevision,
  CustomEventGroupAsset,
  CustomEventGroupRevision
} from '../../src/domain/customContent/assetTypes';
import { IndexedDbCustomContentRepository } from '../../src/domain/customContent/IndexedDbCustomContentRepository';
import {
  approvePreparedNewGameCustomContent,
  createNewGameCustomContentSelectionKey,
  prepareNewGameCustomContent,
  type NewGameCustomContentSelection
} from '../../src/domain/customContent/newGameSelection';
import { createDefaultCustomCharacterAdaptationPolicy } from '../../src/domain/customContent/worldAdaptation';
import { projectCustomContentContext } from '../../src/domain/customContent/runtimeProjection';
import { IndexedDbSaveRepository } from '../../src/domain/persistence/IndexedDbSaveRepository';
import type {
  DramaExecutionReceipt,
  DramaSourceRef,
  DramaticContentSettings
} from '../../src/domain/drama/types';
import { defaultDramaChannels } from '../../src/domain/drama/settings';

const shouldRun =
  process.env.COPV2_RUN_CUSTOM_CONTENT_OPENING_REAL_API === '1';
const shouldRunClassicCharacterOpening =
  process.env.COPV2_RUN_CLASSIC_CHARACTER_OPENING_REAL_API === '1';
const shouldRunFiftyTurns =
  process.env.COPV2_RUN_CUSTOM_CONTENT_FIFTY_TURN_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const outputPath = path.resolve(
  process.env.COPV2_CUSTOM_CONTENT_OPENING_REAL_API_OUTPUT_PATH ??
    path.join('output', 'custom-content-opening-real-api', 'latest.json')
);
const classicCharacterOutputPath = path.resolve(
  process.env.COPV2_CLASSIC_CHARACTER_OPENING_REAL_API_OUTPUT_PATH ??
    path.join(
      'output',
      'classic-character-opening-real-api',
      'latest.json'
    )
);
const classicCharacterSuccessTarget = Math.min(
  5,
  Math.max(
    3,
    Math.trunc(
      Number(
        process.env.COPV2_CLASSIC_CHARACTER_OPENING_REAL_API_SUCCESS_TARGET ?? 3
      )
    ) || 3
  )
);
const classicCharacterMaxAttempts = Math.max(
  classicCharacterSuccessTarget,
  Math.min(
    10,
    Math.trunc(
      Number(
        process.env.COPV2_CLASSIC_CHARACTER_OPENING_REAL_API_MAX_ATTEMPTS ?? 6
      )
    ) || 6
  )
);
const fiftyTurnOutputPath = path.resolve(
  process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_OUTPUT_PATH ??
    path.join('output', 'custom-content-fifty-turn-real-api', 'latest.json')
);
const fiftyTurnCheckpointPath = path.resolve(
  process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_CHECKPOINT_PATH ??
    path.join(
      'output',
      'custom-content-fifty-turn-real-api',
      'checkpoint.json'
    )
);
const fiftyTurnProgressPath = path.resolve(
  process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_PROGRESS_PATH ??
    path.join('output', 'custom-content-fifty-turn-real-api', 'progress.json')
);
const fiftyTurnTarget = Math.min(
  200,
  Math.max(
    1,
    Math.trunc(
      Number(process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_TARGET ?? 50)
    ) || 50
  )
);
const resumeFiftyTurnRun =
  process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_RESUME === '1';
const allowFiftyTurnRouteMigration =
  process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_ALLOW_ROUTE_MIGRATION === '1';
const fiftyTurnDelayMs = Math.max(
  0,
  Number(process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_DELAY_MS ?? 800)
);
const requestTimeoutMs = Math.max(
  60_000,
  Number(
    process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_REQUEST_TIMEOUT_MS ??
      process.env.COPV2_CUSTOM_CONTENT_OPENING_REAL_API_REQUEST_TIMEOUT_MS ??
      600_000
  )
);
const maxOperationAttempts = Math.min(
  2,
  Math.max(
    1,
    Math.trunc(
      Number(
        process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_MAX_ATTEMPTS ??
          process.env.COPV2_CUSTOM_CONTENT_OPENING_REAL_API_MAX_ATTEMPTS ??
          2
      )
    ) || 2
  )
);

interface RouteChoice {
  profile: ApiProfile;
  model: string;
  label: string;
}

interface HttpAuditEntry {
  route: TurnApiRoute;
  provider: string;
  status: number | null;
  responseMs: number;
  error?: string;
}

interface ModelCallAuditEntry {
  provider: string;
  purpose: NarratorRequestPurpose;
  mode: 'complete' | 'completeDetailed';
  succeeded: boolean;
  error?: string;
}

interface ScenarioResult {
  id: 'ai_adapted_dramatic_opening' | 'native_natural_opening';
  accepted: boolean;
  modelCallCount: number;
  modelPurposeCounts: Record<string, number>;
  httpRequestCount: number;
  httpStatusCounts: Record<string, number>;
  reviewRequired: boolean;
  approvalReady: boolean;
  openingSupportBound: boolean;
  selectedSupportPlanned: boolean;
  selectedSupportUsed: boolean;
  traceStatus?: string;
  eventIntentStatus?: string;
  eventInstanceStatus?: string;
  priorityStatus?: string;
  dramaDiagnosticCodes: string[];
  storyEntryCount: number;
  error?: string;
}

interface CustomLifecycleSnapshot {
  projectedUserPriorityCount: number;
  eventIntentStatus?: string;
  eventInstanceStatus?: string;
  priorityStatus?: string;
  resultingWritebackCount: number;
  primaryRuntimeArcKind?: string;
}

interface FiftyTurnAudit {
  ordinal: number;
  turnCounterBefore: number;
  turnCounterAfter: number;
  actionSource: 'guided' | 'suggested' | 'controlled' | 'fallback';
  storyEntryDelta: number;
  httpRequestCount: number;
  modelCallCount: number;
  judgementPreflightCallCount: number;
  judgementRegenerated: boolean;
  planningCalled: boolean;
  planningSucceeded: boolean;
  planningMode?: string;
  planOrigin?: string;
  planMode?: string;
  customSourcePlanned: boolean;
  customSourceUsed: boolean;
  unexpectedCustomSourceUsed: boolean;
  traceStatus?: string;
  persistentWriteCount: number;
  dramaDiagnosticCodes: string[];
  before: CustomLifecycleSnapshot;
  after: CustomLifecycleSnapshot;
}

interface OperationRetryAudit {
  scope: 'opening' | 'turn';
  ordinal?: number;
  failedAttempt: number;
  errorName: string;
  category:
    | 'request_timeout'
    | 'network_error'
    | 'response_validation'
    | 'runtime_contract'
    | 'operation_rejected';
}

interface FiftyTurnCheckpoint {
  schemaVersion: 1;
  generatedAt: string;
  route: string;
  routeHistory?: string[];
  targetTurns: number;
  completedTurns: number;
  openingHttpRequestCount: number;
  openingModelCallCount: number;
  state: RuntimeState;
  turnAudits: FiftyTurnAudit[];
  httpAudits: HttpAuditEntry[];
  modelAudits: ModelCallAuditEntry[];
  operationRetryAudits?: OperationRetryAudit[];
}

const approvedLifecycle = {
  generationStatus: 'ready' as const,
  reviewStatus: 'approved' as const,
  availabilityStatus: 'enabled' as const
};
const databaseNames: string[] = [];

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .slice(0, 500);
}

function countValues(values: Array<string | undefined>): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => {
    if (value) result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function sameSourceRef(
  left: DramaSourceRef | undefined,
  right: DramaSourceRef | undefined
): boolean {
  return Boolean(
    left &&
      right &&
      left.providerId === right.providerId &&
      left.sourceType === right.sourceType &&
      left.sourceId === right.sourceId
  );
}

function resolveRouteChoice(settings: AiSettings): RouteChoice {
  const explicitProfile =
    process.env.COPV2_CUSTOM_CONTENT_OPENING_REAL_API_PROFILE?.trim();
  const explicitModel =
    process.env.COPV2_CUSTOM_CONTENT_OPENING_REAL_API_MODEL?.trim();
  if (explicitProfile || explicitModel) {
    if (!explicitProfile || !explicitModel) {
      throw new Error('真实 API 指定路由必须同时提供档案和模型。');
    }
    const profile = settings.apiProfiles.find(
      (item) =>
        item.id === explicitProfile ||
        item.name.toLowerCase() === explicitProfile.toLowerCase()
    );
    if (!profile) {
      throw new Error('找不到指定的真实 API 档案。');
    }
    return {
      profile,
      model: explicitModel,
      label: `${profile.name}/${explicitModel}`
    };
  }

  const route = settings.mainNarrator;
  if (!route) {
    throw new Error('现有本地设置没有可用的主剧情路由。');
  }
  const profile = settings.apiProfiles.find(
    (item) => item.id === route.apiProfileId
  );
  if (!profile) {
    throw new Error('现有主剧情路由引用的 API 档案不存在。');
  }
  return {
    profile,
    model: route.model,
    label: `${profile.name}/${route.model}`
  };
}

function createDramaSettings(): DramaticContentSettings {
  return {
    pacing: 'balanced',
    materialLevel: 'standard',
    planningRoute: 'auto',
    channels: { ...defaultDramaChannels }
  };
}

function createOriginalPriorityDramaSettings(): DramaticContentSettings {
  return {
    pacing: 'original',
    materialLevel: 'standard',
    planningRoute: 'follow-main',
    channels: { ...defaultDramaChannels }
  };
}

function settingsForRoute(
  source: AiSettings,
  route: RouteChoice,
  dramaticContent: DramaticContentSettings
): AiSettings {
  return {
    ...source,
    mainNarrator: {
      apiProfileId: route.profile.id,
      model: route.model,
      maxTokensMode: 'custom',
      maxTokens: 32768,
      temperature: 0.45
    },
    featureRoutes: {
      ...source.featureRoutes,
      writebackRepair: { mode: 'follow-main' },
      memorySummary: { mode: 'disabled' },
      memoryVector: { mode: 'disabled' },
      npcSimulation: { mode: 'disabled' },
      backgroundEvolution: { mode: 'disabled' },
      auxiliaryGeneration: {
        mode: 'custom',
        apiProfileId: route.profile.id,
        model: route.model,
        maxTokens: 4096,
        temperature: 0.2
      }
    },
    game: {
      ...source.game,
      narrativeLengthLevel: 'compact',
      dramaticContent
    }
  };
}

function createAuditedFetch(
  audits: HttpAuditEntry[],
  route: TurnApiRoute,
  provider: string
) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const startedAt = performance.now();
    try {
      const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
        (signal): signal is AbortSignal => Boolean(signal)
      );
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.any(signals)
      });
      audits.push({
        route,
        provider,
        status: response.status,
        responseMs: Math.round(performance.now() - startedAt)
      });
      return response;
    } catch (error) {
      audits.push({
        route,
        provider,
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

function auditNarratorClient(
  client: NarratorClient,
  audits: ModelCallAuditEntry[],
  provider: string
): NarratorClient {
  return {
    configuredMaxTokens: client.configuredMaxTokens,
    complete: async (input, options) => {
      const audit: ModelCallAuditEntry = {
        provider,
        purpose: options?.requestPurpose ?? 'main_turn',
        mode: 'complete',
        succeeded: false
      };
      audits.push(audit);
      try {
        const value = await client.complete(input, options);
        audit.succeeded = true;
        return value;
      } catch (error) {
        audit.error = safeError(error);
        throw error;
      }
    },
    ...(client.completeDetailed
      ? {
          completeDetailed: async (input, options) => {
            const audit: ModelCallAuditEntry = {
              provider,
              purpose: options?.requestPurpose ?? 'main_turn',
              mode: 'completeDetailed',
              succeeded: false
            };
            audits.push(audit);
            try {
              const value = await client.completeDetailed!(input, options);
              audit.succeeded = true;
              return value;
            } catch (error) {
              audit.error = safeError(error);
              throw error;
            }
          }
        }
      : {})
  };
}

function operationErrorAudit(
  error: unknown,
  scope: OperationRetryAudit['scope'],
  failedAttempt: number,
  ordinal?: number
): OperationRetryAudit {
  const errorName = error instanceof Error ? error.name : typeof error;
  const message = safeError(error).toLowerCase();
  let category: OperationRetryAudit['category'] = 'operation_rejected';
  if (message.includes('timeout') || message.includes('aborted')) {
    category = 'request_timeout';
  } else if (
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('socket')
  ) {
    category = 'network_error';
  } else if (
    message.includes('json') ||
    message.includes('schema') ||
    message.includes('parse') ||
    message.includes('invalid response')
  ) {
    category = 'response_validation';
  } else if (
    message.includes('patch') ||
    message.includes('writeback') ||
    message.includes('contract') ||
    message.includes('runtime')
  ) {
    category = 'runtime_contract';
  }
  return {
    scope,
    ordinal,
    failedAttempt,
    errorName,
    category
  };
}

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  onRetry?: (error: unknown, failedAttempt: number) => void
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxOperationAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxOperationAttempts) {
        onRetry?.(error, attempt);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  }
  throw lastError;
}

function policeOpeningSetup(dramaticOpeningId?: string): OpeningSetup {
  return {
    playerName: '周启明',
    englishName: 'Michael Chow',
    gender: 'male',
    age: 29,
    currentIdentity: 'police',
    policeNumber: '18427',
    policePostingId: 'mong_kok_police_station',
    personality: '做事谨慎，先核对证据，再判断是否升级处置。',
    appearance: '衣着与气质符合1988年香港基层警务环境。',
    startTime: {
      year: 1988,
      month: 9,
      day: 12,
      hour: 21,
      minute: 0
    },
    openingPressure: 'routine',
    storypackInfluence: 'high',
    screenCharacterSeedsEnabled: true,
    dramaticOpeningId,
    lawIdentity: {
      stationOrPost: '旺角警署',
      department: '军装巡逻',
      rank: '警长',
      assignmentSummary: '负责本更巡逻车组与一般现场初动。',
      authoritySummary: '可指挥本车人员并请求增援，不能擅自调动跨区资源。',
      accessSummary: '可接触本更任务、电台调派和现场基本资料。',
      dutySummary: '巡逻、一般紧急响应、现场控制、报告与交接。'
    }
  };
}

function dependency(
  owner: ReturnType<typeof createCustomContentRevisionRef>,
  target: ReturnType<typeof createCustomContentRevisionRef>
): CustomContentDependency {
  return {
    dependencyId: `dependency:${customContentRevisionRefKey(owner)}:${customContentRevisionRefKey(target)}`,
    owner,
    target,
    kind: 'required'
  };
}

async function seedRepository(
  databaseName: string,
  deploymentMode: 'native' | 'ai_adapted'
): Promise<IndexedDbCustomContentRepository> {
  databaseNames.push(databaseName);
  const deployment = {
    worldpackId: 'hk_1988',
    mode: deploymentMode,
    defaultEnabledForNewGame: true
  } as const;
  const characterAsset: CustomCharacterAsset = {
    characterAssetId: 'character-forensic-lam',
    latestRevision: 1,
    revisionCount: 1,
    global: true,
    projectIds: ['project-night-seal'],
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z'
  };
  const characterRevision: CustomCharacterRevision = {
    characterAssetId: characterAsset.characterAssetId,
    revision: 1,
    checksum: 'checksum-character-forensic-lam-v1',
    displayName: '林法证',
    aliases: [],
    gender: 'female',
    profileSummary: '熟悉夜班证物封存、编号与交接流程。',
    backgroundSummary: '长期在法证链路处理封条和交接记录。',
    corePersonality: ['冷静', '谨慎'],
    values: ['真相', '程序正义'],
    coreMotivations: ['保护证据链'],
    majorRelationships: [
      {
        relationshipId: 'relationship-lam-wong',
        targetCharacterAssetId: 'character-reporter-wong',
        label: '旧同学',
        summary: '两人会交换经过核验的公开资料，但各自保留职业边界。'
      },
      {
        relationshipId: 'relationship-lam-ho',
        targetCharacterAssetId: 'character-clerk-ho',
        label: '表姐妹',
        summary: '平日保持来往，不会替对方承诺或确认与玩家的关系。'
      }
    ],
    entryMode: 'follow_project',
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy(),
    deployments: [deployment],
    sourceSpans: [],
    lifecycle: approvedLifecycle
  };
  const characterRef = createCustomContentRevisionRef(characterRevision);
  const relatedCharacters: Array<{
    asset: CustomCharacterAsset;
    revision: CustomCharacterRevision;
  }> = [
    {
      asset: {
        characterAssetId: 'character-reporter-wong',
        latestRevision: 1,
        revisionCount: 1,
        global: true,
        projectIds: [],
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z'
      },
      revision: {
        characterAssetId: 'character-reporter-wong',
        revision: 1,
        checksum: 'checksum-character-reporter-wong-v1',
        displayName: '黄静雯',
        aliases: [],
        gender: 'female',
        profileSummary: '关注社区与警务程序的本地记者。',
        backgroundSummary: '长期采访街坊和公共机构，只采用能够核验的资料。',
        corePersonality: ['敏锐', '克制'],
        values: ['事实', '公众知情'],
        coreMotivations: ['追查可靠线索'],
        majorRelationships: [
          {
            relationshipId: 'relationship-wong-lam',
            targetCharacterAssetId: characterAsset.characterAssetId,
            label: '旧同学',
            summary: '尊重林法证的证据边界，不会要求对方泄露机密。'
          }
        ],
        entryMode: 'asap_contact',
        adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy(),
        deployments: [deployment],
        sourceSpans: [],
        lifecycle: approvedLifecycle
      }
    },
    {
      asset: {
        characterAssetId: 'character-clerk-ho',
        latestRevision: 1,
        revisionCount: 1,
        global: true,
        projectIds: [],
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z'
      },
      revision: {
        characterAssetId: 'character-clerk-ho',
        revision: 1,
        checksum: 'checksum-character-clerk-ho-v1',
        displayName: '何秀兰',
        aliases: [],
        gender: 'female',
        profileSummary: '熟悉旺角街坊与商户日常往来的文员。',
        backgroundSummary: '在区内工作多年，认识林法证，但尚未认识玩家。',
        corePersonality: ['稳重', '细心'],
        values: ['家庭', '守信'],
        coreMotivations: ['维持安稳生活'],
        majorRelationships: [
          {
            relationshipId: 'relationship-ho-lam',
            targetCharacterAssetId: characterAsset.characterAssetId,
            label: '表姐妹',
            summary: '与林法证保持家庭来往，但各自拥有独立生活。'
          }
        ],
        entryMode: 'natural',
        adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy(),
        deployments: [deployment],
        sourceSpans: [],
        lifecycle: approvedLifecycle
      }
    }
  ];
  const projectAsset: CustomContentProjectAsset = {
    projectId: 'project-night-seal',
    latestRevision: 1,
    revisionCount: 1,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z'
  };
  const projectRevision: CustomContentProjectRevision = {
    projectId: projectAsset.projectId,
    revision: 1,
    checksum: 'checksum-project-night-seal-v1',
    title: '夜班证物疑云',
    summary: '只把当前封条异常作为可拒绝的第一幕入口。',
    conversionMode: 'structural_adaptation',
    characterAssetIds: [characterAsset.characterAssetId],
    eventGroupIds: ['event-seal-anomaly'],
    deployments: [deployment],
    sourceDocumentIds: [],
    lifecycle: approvedLifecycle
  };
  const eventAsset: CustomEventGroupAsset = {
    eventGroupId: 'event-seal-anomaly',
    projectId: projectAsset.projectId,
    latestRevision: 1,
    revisionCount: 1,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z'
  };
  const eventRevision: CustomEventGroupRevision = {
    eventGroupId: eventAsset.eventGroupId,
    projectId: projectAsset.projectId,
    revision: 1,
    checksum: 'checksum-event-seal-anomaly-v1',
    title: '封条异常',
    summary: '一份尚未交给玩家的交接记录显示证物封条编号异常。',
    invariantCore: ['封条编号存在可追查的不一致'],
    mutableSlots: ['由谁先发现异常', '玩家是否接受追查入口'],
    forbiddenAdaptations: [
      '不得预设玩家已经接案',
      '不得把来源素材写成已经成立的存档事实'
    ],
    characterRefs: [characterRef],
    roleSlots: [
      {
        roleSlotId: 'forensic_contact',
        title: '法证联系人',
        summary: '提供证物流程入口，但不替玩家作决定。',
        bindingMode: 'fixed_character',
        fixedCharacterRef: characterRef,
        requirements: ['必须复用稳定 Runtime Actor ID']
      }
    ],
    stages: [
      {
        stageId: 'stage-seal-entry',
        title: '异常入口',
        summary: '只建立一个可以被拒绝或延后的调查入口。',
        establishedSourceFacts: [],
        continuationSourceFacts: [
          {
            factId: 'source-fact-seal-mismatch',
            summary: '来源素材中存在一处封条编号不一致。',
            state: 'source_only',
            sourceSpans: []
          }
        ],
        hardSourceConstraints: [],
        foreshadowingOptions: ['交接簿上的编号差异'],
        eventNodes: [
          {
            nodeId: 'node-review-seal-log',
            title: '核对交接记录',
            summary: '法证联系人可以提供核对记录的现实入口。',
            prerequisites: [],
            entryConditions: ['玩家在值勤流程中接触到一条可核验的交接异常'],
            blockers: ['玩家明确拒绝或当前紧急勤务优先'],
            characterUsages: [
              {
                usageId: 'usage-forensic-contact',
                roleSlotId: 'forensic_contact',
                characterRef,
                usageSummary: '只作为证物流程联系人。',
                required: true
              }
            ],
            knowledgeBoundary: {
              knownBy: ['林法证'],
              hiddenFrom: ['player'],
              readerOnly: false
            },
            possibleOutcomes: ['玩家接受核对', '玩家延后', '玩家拒绝'],
            downstreamEffects: ['若玩家接受，可形成一项证物核对事项']
          }
        ],
        completionHints: ['玩家已经明确接受、延后或拒绝该入口'],
        nextStageHints: []
      }
    ],
    entryMode: 'asap',
    reusePolicy: 'save_single_use',
    inheritProjectDeployments: true,
    sourceSpans: [],
    lifecycle: approvedLifecycle
  };

  const projectRef = createCustomContentRevisionRef(projectRevision);
  const eventRef = createCustomContentRevisionRef(eventRevision);
  const repository = new IndexedDbCustomContentRepository(databaseName);
  await repository.saveRevisionBundles([
    {
      assetKind: 'content_project',
      asset: projectAsset,
      revision: projectRevision,
      dependencies: [
        dependency(projectRef, characterRef),
        dependency(projectRef, eventRef)
      ]
    },
    {
      assetKind: 'character',
      asset: characterAsset,
      revision: characterRevision
    },
    ...relatedCharacters.map(({ asset, revision }) => ({
      assetKind: 'character' as const,
      asset,
      revision
    })),
    {
      assetKind: 'event_group',
      asset: eventAsset,
      revision: eventRevision,
      dependencies: [dependency(eventRef, characterRef)]
    }
  ]);
  return repository;
}

function projectSelection(): NewGameCustomContentSelection {
  const draft = {
    kind: 'content_project' as const,
    assetId: 'project-night-seal',
    revision: 1,
    focusEventGroupId: 'event-seal-anomaly',
    focusEventGroupRevision: 1
  };
  return {
    ...draft,
    selectionKey: createNewGameCustomContentSelectionKey(draft)
  };
}

function classicCharacterSelections(): NewGameCustomContentSelection[] {
  return [
    'character-forensic-lam',
    'character-reporter-wong',
    'character-clerk-ho'
  ].map((assetId) => {
    const draft = {
      kind: 'character' as const,
      assetId,
      revision: 1,
      prioritized: true
    };
    return {
      ...draft,
      selectionKey: createNewGameCustomContentSelectionKey(draft)
    };
  });
}

function latestReceipt(state: RuntimeState): DramaExecutionReceipt | undefined {
  return state.dramaticContent?.recentExecutions?.at(-1);
}

function latestNarratorEntry(state: RuntimeState) {
  return [...state.storyLog]
    .reverse()
    .find((entry) => entry.speaker === 'narrator');
}

function fiftyTurnAction(
  state: RuntimeState,
  index: number
): {
  text: string;
  source: FiftyTurnAudit['actionSource'];
} {
  const guided = [
    '按本更程序处理眼前勤务；若出现可信的交接异常，先核对来源，不预设结论。',
    '继续完成值勤和记录，允许现实中的同事或流程自然带来联系，但不主动制造巧合。',
    '先回应已经到期或能够核验的事项；没有成立证据就保持普通节奏。'
  ];
  if (index < guided.length) {
    return { text: guided[index], source: 'guided' };
  }
  const controlled = [
    '我主动核对本更交接簿和证物封存记录，确认是否存在能够复核的编号差异；没有证据就不预设异常成立。',
    '如果记录确实显示封条编号不一致，就按程序登记差异，并联络熟悉夜班证物流程的法证人员核对来源。',
    '若法证联系人确认这是可追查的现实入口，我接受继续核查，但要求每一步都保留证据链和退出选择。',
    '继续按已经核验的事实推进；未证实的部分保持未知，并明确记录接受、延后或拒绝该入口的决定。'
  ];
  if (index >= 10 && index < 10 + controlled.length) {
    return {
      text: controlled[index - 10],
      source: 'controlled'
    };
  }
  const suggested = latestNarratorEntry(state)?.suggestedActions?.filter(
    (item) => item.trim()
  );
  if (suggested && suggested.length > 0) {
    return {
      text: suggested[index % suggested.length],
      source: 'suggested'
    };
  }
  return {
    text: '继续按现实程序处理眼前事项，保留观察、核验、延后或拒绝的选择。',
    source: 'fallback'
  };
}

function customLifecycleSnapshot(
  state: RuntimeState
): CustomLifecycleSnapshot {
  const customContent = state.customContent;
  const eventIntent = customContent?.eventEntryIntents[0];
  const eventInstance = customContent?.eventInstances[0];
  const priority = customContent?.priorityItems[0];
  return {
    projectedUserPriorityCount:
      projectCustomContentContext(state).userPrioritySources.length,
    eventIntentStatus: eventIntent?.status,
    eventInstanceStatus: eventInstance?.status,
    priorityStatus: priority?.status,
    resultingWritebackCount:
      eventInstance?.resultingWritebackRefs.length ?? 0,
    primaryRuntimeArcKind: eventInstance?.primaryRuntimeArcRef?.kind
  };
}

function selectedCustomEventRef(state: RuntimeState): DramaSourceRef | undefined {
  const instance = state.customContent?.eventInstances[0];
  return instance
    ? {
        providerId: 'custom-event-group',
        sourceType: 'custom_event_group_instance',
        sourceId: instance.instanceId
      }
    : undefined;
}

function refListContains(
  refs: readonly DramaSourceRef[],
  target: DramaSourceRef | undefined
): boolean {
  return Boolean(target && refs.some((ref) => sameSourceRef(ref, target)));
}

async function writeFiftyTurnProgress({
  route,
  completedTurns,
  targetTurns,
  httpRequestCount,
  modelCallCount,
  lastTurn,
  status,
  error
}: {
  route: string;
  completedTurns: number;
  targetTurns: number;
  httpRequestCount: number;
  modelCallCount: number;
  lastTurn?: FiftyTurnAudit;
  status: 'initializing' | 'running' | 'completed' | 'failed';
  error?: string;
}): Promise<void> {
  await mkdir(path.dirname(fiftyTurnProgressPath), { recursive: true });
  await writeFile(
    fiftyTurnProgressPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        route,
        status,
        completedTurns,
        targetTurns,
        httpRequestCount,
        modelCallCount,
        lastTurn,
        error
      },
      null,
      2
    ),
    'utf8'
  );
}

async function writeFiftyTurnCheckpoint(
  checkpoint: FiftyTurnCheckpoint
): Promise<void> {
  await mkdir(path.dirname(fiftyTurnCheckpointPath), { recursive: true });
  await writeFile(
    fiftyTurnCheckpointPath,
    JSON.stringify(checkpoint),
    'utf8'
  );
}

function scenarioHttpSummary(
  entries: HttpAuditEntry[],
  start: number
): Pick<ScenarioResult, 'httpRequestCount' | 'httpStatusCounts'> {
  const current = entries.slice(start);
  return {
    httpRequestCount: current.length,
    httpStatusCounts: countValues(
      current.map((entry) =>
        entry.status === null ? 'network_error' : String(entry.status)
      )
    )
  };
}

function scenarioModelSummary(
  entries: ModelCallAuditEntry[],
  start: number
): Pick<ScenarioResult, 'modelCallCount' | 'modelPurposeCounts'> {
  const current = entries.slice(start);
  return {
    modelCallCount: current.length,
    modelPurposeCounts: countValues(
      current.map((entry) => entry.purpose)
    )
  };
}

async function removeDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

afterAll(async () => {
  await Promise.all(databaseNames.splice(0).map(removeDatabase));
});

describe.skipIf(!shouldRun)(
  'custom content opening through a real API',
  () => {
    it(
      'audits adaptation review, dramatic opening binding and natural opening bypass',
      async () => {
        const httpAudits: HttpAuditEntry[] = [];
        const modelAudits: ModelCallAuditEntry[] = [];
        const scenarios: ScenarioResult[] = [];
        let fatalError: string | undefined;
        let routeLabel = 'unresolved';

        try {
          const importedSettings = importApiSettings(
            createDefaultAiSettings(),
            await readFile(settingsPath, 'utf8')
          );
          const route = resolveRouteChoice(importedSettings);
          routeLabel = route.label;
          const dramaSettings = createDramaSettings();
          const settings = settingsForRoute(
            importedSettings,
            route,
            dramaSettings
          );
          const narrator = auditNarratorClient(
            createNarratorClientFromSettings(
              settings,
              createAuditedFetch(httpAudits, 'mainNarrator', route.label)
            ),
            modelAudits,
            route.label
          );
          const selected = projectSelection();

          {
            const httpStart = httpAudits.length;
            const modelStart = modelAudits.length;
            let result: ScenarioResult;
            try {
              const repository = await seedRepository(
                `custom-opening-ai-${crypto.randomUUID()}`,
                'ai_adapted'
              );
              const setup = policeOpeningSetup('mentor_lead');
              const prepared = await executeWithRetry(() =>
                prepareNewGameCustomContent({
                  repository,
                  state: createInitialRuntimeState(setup),
                  selections: [selected],
                  openingSupportSelectionKey: selected.selectionKey,
                  client: narrator,
                  now: '2026-07-26T13:00:00.000Z'
                })
              );
              const reviewRequired =
                prepared.reviewItems.length === 1 &&
                prepared.reviewItems[0].status === 'needs_review';
              const modelCallsBeforeApproval = modelAudits.length;
              const approved = approvePreparedNewGameCustomContent({
                state: prepared.state,
                selections: [selected],
                now: '2026-07-26T13:01:00.000Z'
              });
              const approvalDidNotRegenerate =
                modelAudits.length === modelCallsBeforeApproval;
              const approvalReady = [
                ...Object.values(
                  approved.customContent?.projectAdaptations ?? {}
                ),
                ...Object.values(
                  approved.customContent?.characterAdaptations ?? {}
                ),
                ...Object.values(
                  approved.customContent?.eventGroupAdaptations ?? {}
                )
              ].every((adaptation) => adaptation.status === 'ready');
              const supportRef =
                approved.dramaticContent?.openingSupportSourceRef;
              const openingSupportBound =
                supportRef?.providerId === 'custom-event-group' &&
                supportRef.sourceType === 'custom_event_group_instance';
              const opened = await executeWithRetry(() =>
                runOpening({
                  setup,
                  initialState: approved,
                  narrator,
                  repairNarrator: narrator,
                  narrativeLengthLevel: 'compact',
                  promptSettings: settings.prompts,
                  dramaticContentSettings: dramaSettings
                })
              );
              const receipt = latestReceipt(opened);
              const selectedSupportPlanned = Boolean(
                supportRef &&
                  receipt?.supportSourceRefs.some((ref) =>
                    sameSourceRef(ref, supportRef)
                  )
              );
              const selectedSupportUsed = Boolean(
                supportRef &&
                  receipt?.usedSourceRefs.some((ref) =>
                    sameSourceRef(ref, supportRef)
                  )
              );
              const eventIntent =
                opened.customContent?.eventEntryIntents[0];
              const eventInstance =
                opened.customContent?.eventInstances[0];
              const priority =
                opened.customContent?.priorityItems[0];
              const accepted =
                reviewRequired &&
                approvalReady &&
                approvalDidNotRegenerate &&
                openingSupportBound &&
                selectedSupportPlanned &&
                opened.storyLog.length > 0;
              result = {
                id: 'ai_adapted_dramatic_opening',
                accepted,
                ...scenarioModelSummary(modelAudits, modelStart),
                ...scenarioHttpSummary(httpAudits, httpStart),
                reviewRequired,
                approvalReady,
                openingSupportBound,
                selectedSupportPlanned,
                selectedSupportUsed,
                traceStatus: receipt?.traceStatus,
                eventIntentStatus: eventIntent?.status,
                eventInstanceStatus: eventInstance?.status,
                priorityStatus: priority?.status,
                dramaDiagnosticCodes:
                  opened.dramaticContent?.recentDiagnostics.map(
                    (diagnostic) => diagnostic.code
                  ) ?? [],
                storyEntryCount: opened.storyLog.length
              };
            } catch (error) {
              result = {
                id: 'ai_adapted_dramatic_opening',
                accepted: false,
                ...scenarioModelSummary(modelAudits, modelStart),
                ...scenarioHttpSummary(httpAudits, httpStart),
                reviewRequired: false,
                approvalReady: false,
                openingSupportBound: false,
                selectedSupportPlanned: false,
                selectedSupportUsed: false,
                dramaDiagnosticCodes: [],
                storyEntryCount: 0,
                error: safeError(error)
              };
            }
            scenarios.push(result);
          }

          {
            const httpStart = httpAudits.length;
            const modelStart = modelAudits.length;
            let result: ScenarioResult;
            try {
              const repository = await seedRepository(
                `custom-opening-native-${crypto.randomUUID()}`,
                'native'
              );
              const setup = policeOpeningSetup();
              const prepared = await prepareNewGameCustomContent({
                repository,
                state: createInitialRuntimeState(setup),
                selections: [selected],
                openingSupportSelectionKey: selected.selectionKey,
                client: narrator,
                now: '2026-07-26T14:00:00.000Z'
              });
              const openingSupportBound = Boolean(
                prepared.state.dramaticContent?.openingSupportSourceRef
              );
              const adaptationCallCount = modelAudits.length - modelStart;
              const opened = await executeWithRetry(() =>
                runOpening({
                  setup,
                  initialState: prepared.state,
                  narrator,
                  repairNarrator: narrator,
                  narrativeLengthLevel: 'compact',
                  promptSettings: settings.prompts,
                  dramaticContentSettings: dramaSettings
                })
              );
              const customSourceWasRecorded = (
                opened.dramaticContent?.recentExecutions ?? []
              ).some((receipt) =>
                [
                  receipt.primarySourceRef,
                  ...receipt.supportSourceRefs,
                  ...receipt.usedSourceRefs
                ].some(
                  (ref) =>
                    ref?.providerId === 'custom-event-group' ||
                    ref?.providerId === 'custom-character'
                )
              );
              const eventIntent =
                opened.customContent?.eventEntryIntents[0];
              const eventInstance =
                opened.customContent?.eventInstances[0];
              const priority =
                opened.customContent?.priorityItems[0];
              const accepted =
                prepared.reviewItems.length === 0 &&
                adaptationCallCount === 0 &&
                !openingSupportBound &&
                !customSourceWasRecorded &&
                eventIntent?.status === 'seeking_anchor' &&
                eventInstance?.status === 'seeking_anchor' &&
                priority?.status === 'active' &&
                opened.storyLog.length > 0;
              result = {
                id: 'native_natural_opening',
                accepted,
                ...scenarioModelSummary(modelAudits, modelStart),
                ...scenarioHttpSummary(httpAudits, httpStart),
                reviewRequired: false,
                approvalReady: true,
                openingSupportBound,
                selectedSupportPlanned: false,
                selectedSupportUsed: false,
                eventIntentStatus: eventIntent?.status,
                eventInstanceStatus: eventInstance?.status,
                priorityStatus: priority?.status,
                dramaDiagnosticCodes:
                  opened.dramaticContent?.recentDiagnostics.map(
                    (diagnostic) => diagnostic.code
                  ) ?? [],
                storyEntryCount: opened.storyLog.length
              };
            } catch (error) {
              result = {
                id: 'native_natural_opening',
                accepted: false,
                ...scenarioModelSummary(modelAudits, modelStart),
                ...scenarioHttpSummary(httpAudits, httpStart),
                reviewRequired: false,
                approvalReady: false,
                openingSupportBound: false,
                selectedSupportPlanned: false,
                selectedSupportUsed: false,
                dramaDiagnosticCodes: [],
                storyEntryCount: 0,
                error: safeError(error)
              };
            }
            scenarios.push(result);
          }
        } catch (error) {
          fatalError = safeError(error);
        }

        const report = {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          scope: [
            'ai_adapted_review_and_approval',
            'dramatic_opening_two_phase_binding',
            'natural_opening_custom_content_bypass',
            'trace_and_runtime_lifecycle_audit'
          ],
          route: routeLabel,
          accepted:
            !fatalError &&
            scenarios.length === 2 &&
            scenarios.every((scenario) => scenario.accepted),
          scenarios,
          http: {
            requestCount: httpAudits.length,
            statusCounts: countValues(
              httpAudits.map((entry) =>
                entry.status === null
                  ? 'network_error'
                  : String(entry.status)
              )
            ),
            providerCounts: countValues(
              httpAudits.map((entry) => entry.provider)
            )
          },
          modelCalls: {
            count: modelAudits.length,
            purposeCounts: countValues(
              modelAudits.map((entry) => entry.purpose)
            ),
            failedCount: modelAudits.filter((entry) => !entry.succeeded)
              .length
          },
          fatalError
        };
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

        expect(fatalError).toBeUndefined();
        expect(scenarios).toHaveLength(2);
        expect(
          scenarios.map((scenario) => ({
            id: scenario.id,
            accepted: scenario.accepted,
            error: scenario.error
          }))
        ).toEqual([
          {
            id: 'ai_adapted_dramatic_opening',
            accepted: true,
            error: undefined
          },
          {
            id: 'native_natural_opening',
            accepted: true,
            error: undefined
          }
        ]);
      },
      1_800_000
    );
  }
);

describe.skipIf(!shouldRunClassicCharacterOpening)(
  'classic Hong Kong opening with first-act custom characters through a real API',
  () => {
    it(
      'completes three accepted first-act openings plus two controls without corrupting current matters',
      async () => {
        const httpAudits: HttpAuditEntry[] = [];
        const modelAudits: ModelCallAuditEntry[] = [];
        const attempts: Array<Record<string, unknown>> = [];
        const accepted: Array<Record<string, unknown>> = [];

        const importedSettings = importApiSettings(
          createDefaultAiSettings(),
          await readFile(settingsPath, 'utf8')
        );
        const route = resolveRouteChoice(importedSettings);
        const routeLabel = route.label;
        const dramaSettings = createDramaSettings();
        const settings = settingsForRoute(
          importedSettings,
          route,
          dramaSettings
        );
        const narrator = auditNarratorClient(
          createNarratorClientFromSettings(
            settings,
            createAuditedFetch(httpAudits, 'mainNarrator', route.label)
          ),
          modelAudits,
          route.label
        );
        const selections = classicCharacterSelections();
        const openingSupportSelectionKey = selections[0].selectionKey;
        const validMatterKinds = new Set([
          'personal',
          'police_work',
          'livelihood',
          'relationship',
          'family',
          'social',
          'risk',
          'opportunity',
          'case',
          'world'
        ]);

        async function runScenario({
          id,
          dramaticOpeningId,
          bindCharacters,
          useFirstAct
        }: {
          id: string;
          dramaticOpeningId?: string;
          bindCharacters: boolean;
          useFirstAct: boolean;
        }): Promise<Record<string, unknown>> {
          const httpStart = httpAudits.length;
          const modelStart = modelAudits.length;
          const setup = policeOpeningSetup(dramaticOpeningId);
          let openingState = createInitialRuntimeState(setup);
          let firstActActorId: string | undefined;
          if (bindCharacters) {
            const contentRepository = await seedRepository(
              `classic-character-content-${crypto.randomUUID()}`,
              'native'
            );
            const prepared = await prepareNewGameCustomContent({
              repository: contentRepository,
              state: openingState,
              selections,
              openingSupportSelectionKey: useFirstAct
                ? openingSupportSelectionKey
                : undefined,
              client: narrator,
              now: '2026-07-29T07:00:00.000Z'
            });
            openingState = prepared.state;
            firstActActorId = Object.values(
              openingState.customContent?.characterAdaptations ?? {}
            ).find(
              (adaptation) =>
                adaptation.characterAssetId === 'character-forensic-lam'
            )?.runtimeActorId;
          }

          const openingSessionDatabaseName =
            `classic-character-opening-session-${crypto.randomUUID()}`;
          databaseNames.push(openingSessionDatabaseName);
          const openingRepository =
            new IndexedDbOpeningSessionRepository(
              openingSessionDatabaseName
            );
          const opened = await runOpeningV2({
            setup,
            initialState: openingState,
            narrator,
            repairNarrator: narrator,
            sessionRepository: openingRepository,
            narrativeLengthLevel: 'compact',
            narrativePerspective: settings.game.narrativePerspective,
            playerPortrayalMode: settings.game.playerPortrayalMode,
            promptSettings: settings.prompts,
            tavernSettings: settings.tavern,
            dramaticContentSettings: dramaSettings
          });
          const receipt = latestReceipt(opened);
          const supportRef =
            openingState.dramaticContent?.openingSupportSourceRef;
          const supportPlanned = Boolean(
            supportRef &&
              receipt?.supportSourceRefs.some((ref) =>
                sameSourceRef(ref, supportRef)
              )
          );
          const supportUsed = Boolean(
            supportRef &&
              receipt?.usedSourceRefs.some((ref) =>
                sameSourceRef(ref, supportRef)
              )
          );
          const currentMatters = Object.values(
            opened.dynamicEvents.currentMatters
          );
          const currentMatterContractValid = currentMatters.every(
            (matter) =>
              Number.isInteger(matter.priority) &&
              matter.priority >= 0 &&
              matter.priority <= 100 &&
              (matter.visibility === 'known' ||
                matter.visibility === 'hidden') &&
              (!matter.matterKind ||
                validMatterKinds.has(matter.matterKind))
          );
          const matchingActors = firstActActorId
            ? Object.values(opened.actors).filter(
                (actor) => actor.name === '林法证'
              )
            : [];
          const firstActActor = firstActActorId
            ? opened.actors[firstActActorId]
            : undefined;
          const stableActorValid =
            !useFirstAct ||
            (Boolean(firstActActorId) &&
              matchingActors.length <= 1 &&
              matchingActors.every(
                (actor) => actor.actorId === firstActActorId
              ) &&
              (!firstActActor || firstActActor.name === '林法证'));
          const confirmedRelationshipCount = firstActActorId
            ? Object.values(opened.relationshipThreads).filter((thread) =>
                thread.relatedActorIds.includes(firstActActorId!)
              ).length
            : 0;

          const saveDatabaseName = `classic-character-save-${crypto.randomUUID()}`;
          databaseNames.push(saveDatabaseName);
          const saveRepository = new IndexedDbSaveRepository(saveDatabaseName);
          const saveId = `classic_character_${crypto.randomUUID()}`;
          await saveRepository.save({
            saveId,
            saveName: id,
            saveKind: 'manual',
            createdAt: '2026-07-29T07:30:00.000Z',
            updatedAt: '2026-07-29T07:30:00.000Z',
            playerName: opened.player.name,
            worldpackId: opened.worldpackId,
            gameDateLabel: `${opened.time.year}-${opened.time.month}-${opened.time.day}`,
            turnCounter: opened.turnCounter,
            runtimeState: opened
          });
          const loaded = await saveRepository.load(saveId);
          const saveReloadValid =
            loaded?.runtimeState.storyLog.length === opened.storyLog.length &&
            JSON.stringify(loaded.runtimeState.dynamicEvents.currentMatters) ===
              JSON.stringify(opened.dynamicEvents.currentMatters) &&
            (!firstActActorId ||
              loaded.runtimeState.customContent?.characterAdaptations[
                Object.keys(
                  opened.customContent?.characterAdaptations ?? {}
                ).find(
                  (key) =>
                    opened.customContent?.characterAdaptations[key]
                      .characterAssetId === 'character-forensic-lam'
                ) ?? ''
              ]?.runtimeActorId === firstActActorId);

          const result = {
            id,
            accepted:
              opened.storyLog.length > 0 &&
              currentMatterContractValid &&
              stableActorValid &&
              confirmedRelationshipCount === 0 &&
              saveReloadValid &&
              (useFirstAct
                ? Boolean(supportRef) && supportPlanned
                : !supportRef),
            storyEntryCount: opened.storyLog.length,
            currentMatterCount: currentMatters.length,
            currentMatterContractValid,
            firstActActorId,
            firstActActorCreated: Boolean(firstActActor),
            stableActorValid,
            supportPlanned,
            supportUsed,
            confirmedRelationshipCount,
            saveReloadValid,
            modelPurposeCounts: scenarioModelSummary(
              modelAudits,
              modelStart
            ).modelPurposeCounts,
            httpStatusCounts: scenarioHttpSummary(
              httpAudits,
              httpStart
            ).httpStatusCounts
          };
          return result;
        }

        for (
          let attempt = 1;
          attempt <= classicCharacterMaxAttempts &&
          accepted.length < classicCharacterSuccessTarget;
          attempt += 1
        ) {
          try {
            const result = await runScenario({
              id: `classic_first_act_${attempt}`,
              dramaticOpeningId: 'classic_hong_kong',
              bindCharacters: true,
              useFirstAct: true
            });
            attempts.push(result);
            if (result.accepted === true) accepted.push(result);
            console.info(
              `[classic-character-opening] ${result.id}: ${
                result.accepted === true ? 'accepted' : 'rejected'
              }`
            );
          } catch (error) {
            const failedAttempt = {
              id: `classic_first_act_${attempt}`,
              accepted: false,
              error: safeError(error)
            };
            attempts.push(failedAttempt);
            console.info(
              `[classic-character-opening] ${failedAttempt.id}: external-or-runtime-failure`
            );
          }
        }

        const controls: Array<Record<string, unknown>> = [];
        for (const control of [
          {
            id: 'classic_without_first_act',
            dramaticOpeningId: 'classic_hong_kong',
            bindCharacters: true,
            useFirstAct: false
          },
          {
            id: 'plain_without_dramatic_opening',
            dramaticOpeningId: undefined,
            bindCharacters: false,
            useFirstAct: false
          }
        ]) {
          try {
            const result = await executeWithRetry(() =>
              runScenario(control)
            );
            controls.push(result);
            console.info(
              `[classic-character-opening] ${result.id}: ${
                result.accepted === true ? 'accepted' : 'rejected'
              }`
            );
          } catch (error) {
            controls.push({
              id: control.id,
              accepted: false,
              error: safeError(error)
            });
            console.info(
              `[classic-character-opening] ${control.id}: external-or-runtime-failure`
            );
          }
        }

        const report = {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          route: routeLabel,
          successTarget: classicCharacterSuccessTarget,
          acceptedCount: accepted.length,
          attempts,
          controls,
          http: {
            requestCount: httpAudits.length,
            statusCounts: countValues(
              httpAudits.map((entry) =>
                entry.status === null
                  ? 'network_error'
                  : String(entry.status)
              )
            )
          },
          modelCalls: {
            count: modelAudits.length,
            purposeCounts: countValues(
              modelAudits.map((entry) => entry.purpose)
            )
          }
        };
        await mkdir(path.dirname(classicCharacterOutputPath), {
          recursive: true
        });
        await writeFile(
          classicCharacterOutputPath,
          JSON.stringify(report, null, 2),
          'utf8'
        );

        expect(accepted).toHaveLength(classicCharacterSuccessTarget);
        expect(controls).toEqual([
          expect.objectContaining({
            id: 'classic_without_first_act',
            accepted: true
          }),
          expect.objectContaining({
            id: 'plain_without_dramatic_opening',
            accepted: true
          })
        ]);
      },
      3_600_000
    );
  }
);

describe.skipIf(!shouldRunFiftyTurns)(
  'custom content across fifty real API turns',
  () => {
    it(
      'keeps custom priority, trace and runtime lifecycle evidence consistent',
      async () => {
        const httpAudits: HttpAuditEntry[] = [];
        const modelAudits: ModelCallAuditEntry[] = [];
        const turnAudits: FiftyTurnAudit[] = [];
        const operationRetryAudits: OperationRetryAudit[] = [];
        let routeLabel = 'unresolved';
        let routeHistory: string[] = [];
        let completedTurns = 0;
        let openingHttpRequestCount = 0;
        let openingModelCallCount = 0;
        let state: RuntimeState | undefined;
        let fatalError: string | undefined;

        try {
          const importedSettings = importApiSettings(
            createDefaultAiSettings(),
            await readFile(settingsPath, 'utf8')
          );
          const route = resolveRouteChoice(importedSettings);
          routeLabel = route.label;
          const dramaSettings = createOriginalPriorityDramaSettings();
          const settings = settingsForRoute(
            importedSettings,
            route,
            dramaSettings
          );
          const narrator = auditNarratorClient(
            createNarratorClientFromSettings(
              settings,
              createAuditedFetch(httpAudits, 'mainNarrator', route.label)
            ),
            modelAudits,
            route.label
          );

          if (resumeFiftyTurnRun) {
            try {
              const checkpoint = JSON.parse(
                await readFile(fiftyTurnCheckpointPath, 'utf8')
              ) as FiftyTurnCheckpoint;
              if (checkpoint.schemaVersion !== 1) {
                throw new Error('50 回合断点版本不兼容。');
              }
              if (
                checkpoint.route !== route.label &&
                !allowFiftyTurnRouteMigration
              ) {
                throw new Error('50 回合断点使用的 API 路由与当前设置不一致。');
              }
              if (checkpoint.completedTurns > fiftyTurnTarget) {
                throw new Error('50 回合断点进度超过当前目标。');
              }
              state = checkpoint.state;
              completedTurns = checkpoint.completedTurns;
              openingHttpRequestCount = checkpoint.openingHttpRequestCount;
              openingModelCallCount = checkpoint.openingModelCallCount;
              turnAudits.push(...checkpoint.turnAudits);
              httpAudits.push(...checkpoint.httpAudits);
              modelAudits.push(...checkpoint.modelAudits);
              operationRetryAudits.push(
                ...(checkpoint.operationRetryAudits ?? [])
              );
              routeHistory = [
                ...new Set([
                  ...(checkpoint.routeHistory?.length
                    ? checkpoint.routeHistory
                    : [checkpoint.route]),
                  route.label
                ])
              ];
              if (checkpoint.route !== route.label) {
                process.stdout.write(
                  `[custom-content-50] route migrated: ${checkpoint.route} -> ${route.label}\n`
                );
              }
            } catch (error) {
              process.stdout.write(
                `[custom-content-50] resume skipped: ${safeError(error)}\n`
              );
            }
          }

          if (!state) {
            routeHistory = [route.label];
            await writeFiftyTurnProgress({
              route: route.label,
              completedTurns: 0,
              targetTurns: fiftyTurnTarget,
              httpRequestCount: 0,
              modelCallCount: 0,
              status: 'initializing'
            });
            const repository = await seedRepository(
              `custom-fifty-turn-${crypto.randomUUID()}`,
              'native'
            );
            const selected = projectSelection();
            const setup = policeOpeningSetup();
            const prepared = await prepareNewGameCustomContent({
              repository,
              state: createInitialRuntimeState(setup),
              selections: [selected],
              openingSupportSelectionKey: selected.selectionKey,
              client: narrator,
              now: '2026-07-27T01:00:00.000Z'
            });
            if (
              prepared.reviewItems.length > 0 ||
              prepared.state.dramaticContent?.openingSupportSourceRef
            ) {
              throw new Error('50 回合基线没有保持自然开局旁路。');
            }
            const openingHttpStart = httpAudits.length;
            const openingModelStart = modelAudits.length;
            const opened = await executeWithRetry(
              () =>
                runOpening({
                  setup,
                  initialState: prepared.state,
                  narrator,
                  repairNarrator: narrator,
                  narrativeLengthLevel: 'compact',
                  promptSettings: settings.prompts,
                  dramaticContentSettings: dramaSettings
                }),
              (error, failedAttempt) =>
                operationRetryAudits.push(
                  operationErrorAudit(error, 'opening', failedAttempt)
                )
            );
            openingHttpRequestCount = httpAudits.length - openingHttpStart;
            openingModelCallCount = modelAudits.length - openingModelStart;
            if (
              opened.storyLog.length === 0 ||
              customLifecycleSnapshot(opened).priorityStatus !== 'active'
            ) {
              throw new Error('自然开局后没有保留可继续推进的自定义重点。');
            }
            state = {
              ...opened,
              dramaticContent: {
                ...(opened.dramaticContent ?? {
                  instances: [],
                  recentDiagnostics: []
                }),
                settings: dramaSettings,
                recentDiagnostics: [],
                recentExecutions: []
              }
            };
            await writeFiftyTurnCheckpoint({
              schemaVersion: 1,
              generatedAt: new Date().toISOString(),
              route: route.label,
              routeHistory,
              targetTurns: fiftyTurnTarget,
              completedTurns,
              openingHttpRequestCount,
              openingModelCallCount,
              state,
              turnAudits,
              httpAudits,
              modelAudits,
              operationRetryAudits
            });
          }

          for (
            let index = completedTurns;
            index < fiftyTurnTarget;
            index += 1
          ) {
            const stateBeforeTurn = state;
            const customRef = selectedCustomEventRef(stateBeforeTurn);
            if (!customRef) {
              throw new Error('50 回合断点缺少自定义事件 Runtime 引用。');
            }
            const before = customLifecycleSnapshot(stateBeforeTurn);
            const action = fiftyTurnAction(stateBeforeTurn, index);
            const httpStart = httpAudits.length;
            const modelStart = modelAudits.length;
            const turnStages: TurnExecutionStage[] = [];
            const storyEntryCountBefore = stateBeforeTurn.storyLog.length;
            const nextState = await executeWithRetry(
              () =>
                runPlayerTurn({
                  state: stateBeforeTurn,
                  playerInput: action.text,
                  narrator,
                  enableJudgementPreflight: true,
                  judgementRoll: ((index * 37) % 100) + 1,
                  writebackRepairMode: 'follow-main',
                  gameSettings: settings.game,
                  promptSettings: settings.prompts,
                  tavernSettings: settings.tavern,
                  onStageChange: (stage) => turnStages.push(stage)
                }),
              (error, failedAttempt) =>
                operationRetryAudits.push(
                  operationErrorAudit(
                    error,
                    'turn',
                    failedAttempt,
                    index + 1
                  )
                )
            );
            if (nextState.turnCounter !== stateBeforeTurn.turnCounter + 1) {
              throw new Error('50 回合长测出现非原子回合推进。');
            }
            if (nextState.storyLog.length <= storyEntryCountBefore) {
              throw new Error('50 回合长测没有写入新 StoryLog。');
            }
            const narratorEntry = latestNarratorEntry(nextState);
            if (
              !narratorEntry?.text.trim() ||
              !narratorEntry.summaryText?.trim()
            ) {
              throw new Error('50 回合长测缺少正文或结构化回合摘要。');
            }
            const receipt = latestReceipt(nextState);
            if (!receipt) {
              throw new Error('50 回合长测缺少 DramaExecutionReceipt。');
            }
            const plannedRefs = [
              ...(receipt.primarySourceRef
                ? [receipt.primarySourceRef]
                : []),
              ...receipt.supportSourceRefs
            ];
            const customUsedRefs = receipt.usedSourceRefs.filter(
              (ref) =>
                ref.providerId === 'custom-event-group' ||
                ref.providerId === 'custom-character'
            );
            const after = customLifecycleSnapshot(nextState);
            const turnModelAudits = modelAudits.slice(modelStart);
            const audit: FiftyTurnAudit = {
              ordinal: index + 1,
              turnCounterBefore: stateBeforeTurn.turnCounter,
              turnCounterAfter: nextState.turnCounter,
              actionSource: action.source,
              storyEntryDelta:
                nextState.storyLog.length - storyEntryCountBefore,
              httpRequestCount: httpAudits.length - httpStart,
              modelCallCount: turnModelAudits.length,
              judgementPreflightCallCount: turnModelAudits.filter(
                (entry) =>
                  entry.purpose === 'main_turn_judgement_preflight' ||
                  entry.purpose === 'main_turn_judgement_preflight_repair'
              ).length,
              judgementRegenerated: turnStages.includes(
                'regenerating_judgement'
              ),
              planningCalled: receipt.planningCalled,
              planningSucceeded: receipt.planningSucceeded,
              planningMode: receipt.planningMode,
              planOrigin: receipt.planOrigin,
              planMode: receipt.planMode,
              customSourcePlanned: refListContains(plannedRefs, customRef),
              customSourceUsed: refListContains(
                receipt.usedSourceRefs,
                customRef
              ),
              unexpectedCustomSourceUsed: customUsedRefs.some(
                (ref) => !sameSourceRef(ref, customRef)
              ),
              traceStatus: receipt.traceStatus,
              persistentWriteCount: receipt.persistentWriteCount,
              dramaDiagnosticCodes: (
                nextState.dramaticContent?.recentDiagnostics ?? []
              )
                .filter(
                  (diagnostic) =>
                    diagnostic.turnCounter === receipt.turnCounter
                )
                .map((diagnostic) => diagnostic.code),
              before,
              after
            };
            turnAudits.push(audit);
            state = nextState;
            completedTurns = index + 1;
            await writeFiftyTurnCheckpoint({
              schemaVersion: 1,
              generatedAt: new Date().toISOString(),
              route: route.label,
              routeHistory,
              targetTurns: fiftyTurnTarget,
              completedTurns,
              openingHttpRequestCount,
              openingModelCallCount,
              state,
              turnAudits,
              httpAudits,
              modelAudits,
              operationRetryAudits
            });
            await writeFiftyTurnProgress({
              route: route.label,
              completedTurns,
              targetTurns: fiftyTurnTarget,
              httpRequestCount: httpAudits.length,
              modelCallCount: modelAudits.length,
              lastTurn: audit,
              status:
                completedTurns === fiftyTurnTarget
                  ? 'completed'
                  : 'running'
            });
            process.stdout.write(
              `[custom-content-50] completed=${completedTurns}/${fiftyTurnTarget} ` +
                `plan=${audit.planMode ?? 'none'} ` +
                `used=${audit.customSourceUsed} ` +
                `lifecycle=${audit.after.eventIntentStatus ?? 'none'}\n`
            );
            if (fiftyTurnDelayMs > 0) {
              await new Promise((resolve) =>
                setTimeout(resolve, fiftyTurnDelayMs)
              );
            }
          }
        } catch (error) {
          fatalError = safeError(error);
        }

        const finalLifecycle = state
          ? customLifecycleSnapshot(state)
          : undefined;
        const falsePriorityCompletionCount = turnAudits.filter(
          (audit) =>
            audit.after.priorityStatus === 'completed' &&
            audit.after.eventIntentStatus !== 'anchored' &&
            audit.after.eventIntentStatus !== 'engaged'
        ).length;
        const customPlannedCount = turnAudits.filter(
          (audit) => audit.customSourcePlanned
        ).length;
        const customUsedCount = turnAudits.filter(
          (audit) => audit.customSourceUsed
        ).length;
        const customPersistentUseCount = turnAudits.filter(
          (audit) =>
            audit.customSourceUsed &&
            audit.traceStatus === 'used_persistently'
        ).length;
        const unexpectedCustomUseCount = turnAudits.filter(
          (audit) => audit.unexpectedCustomSourceUsed
        ).length;
        const missingJudgementPreflightCount = turnAudits.filter(
          (audit) => audit.judgementPreflightCallCount < 1
        ).length;
        const judgementRegenerationCount = turnAudits.filter(
          (audit) => audit.judgementRegenerated
        ).length;
        const accepted =
          !fatalError &&
          completedTurns === fiftyTurnTarget &&
          turnAudits.length === fiftyTurnTarget &&
          customPlannedCount > 0 &&
          customUsedCount > 0 &&
          falsePriorityCompletionCount === 0 &&
          unexpectedCustomUseCount === 0 &&
          missingJudgementPreflightCount === 0 &&
          judgementRegenerationCount === 0;
        const report = {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          route: routeLabel,
          routeHistory,
          accepted,
          targetTurns: fiftyTurnTarget,
          completedTurns,
          opening: {
            httpRequestCount: openingHttpRequestCount,
            modelCallCount: openingModelCallCount
          },
          customContent: {
            plannedTurnCount: customPlannedCount,
            usedTurnCount: customUsedCount,
            persistentUseTurnCount: customPersistentUseCount,
            falsePriorityCompletionCount,
            unexpectedCustomUseCount,
            missingJudgementPreflightCount,
            judgementRegenerationCount,
            finalLifecycle
          },
          http: {
            requestCount: httpAudits.length,
            statusCounts: countValues(
              httpAudits.map((entry) =>
                entry.status === null
                  ? 'network_error'
                  : String(entry.status)
              )
            )
          },
          modelCalls: {
            count: modelAudits.length,
            purposeCounts: countValues(
              modelAudits.map((entry) => entry.purpose)
            ),
            failedCount: modelAudits.filter((entry) => !entry.succeeded)
              .length
          },
          operationRetries: {
            count: operationRetryAudits.length,
            entries: operationRetryAudits
          },
          finalState: state
            ? {
                turnCounter: state.turnCounter,
                storyEntryCount: state.storyLog.length,
                actorCount: Object.keys(state.actors).length,
                matterCount: Object.keys(
                  state.dynamicEvents.currentMatters
                ).length,
                signalCount: Object.keys(state.dynamicEvents.signals).length,
                caseCount: Object.keys(state.cases).length,
                relationshipCount: Object.keys(
                  state.relationshipThreads
                ).length
              }
            : undefined,
          turnAudits,
          fatalError
        };
        await mkdir(path.dirname(fiftyTurnOutputPath), {
          recursive: true
        });
        await writeFile(
          fiftyTurnOutputPath,
          JSON.stringify(report, null, 2),
          'utf8'
        );
        await writeFiftyTurnProgress({
          route: routeLabel,
          completedTurns,
          targetTurns: fiftyTurnTarget,
          httpRequestCount: httpAudits.length,
          modelCallCount: modelAudits.length,
          lastTurn: turnAudits.at(-1),
          status: accepted ? 'completed' : 'failed',
          error: fatalError
        });

        expect(fatalError).toBeUndefined();
        expect(completedTurns).toBe(fiftyTurnTarget);
        expect(turnAudits).toHaveLength(fiftyTurnTarget);
        expect(customPlannedCount).toBeGreaterThan(0);
        expect(customUsedCount).toBeGreaterThan(0);
        expect(falsePriorityCompletionCount).toBe(0);
        expect(unexpectedCustomUseCount).toBe(0);
        expect(missingJudgementPreflightCount).toBe(0);
        expect(judgementRegenerationCount).toBe(0);
      },
      86_400_000
    );
  }
);
