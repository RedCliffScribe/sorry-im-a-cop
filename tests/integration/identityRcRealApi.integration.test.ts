import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackgroundEvolutionClientFromSettings } from '../../src/domain/backgroundEvolution/createBackgroundEvolutionClientFromSettings';
import { createCityPowerInstitutionView } from '../../src/domain/cityPower/cityPowerDatabaseView';
import { projectGrayNetworkContext } from '../../src/domain/grayNetwork/grayNetworkContextProjector';
import {
  projectPlayerIdentityContext,
  projectPublicActorRoleProfiles,
  projectVisibleActorOrganizationIds,
  projectVisibleActorOrganizationRelations
} from '../../src/domain/identity/identityContextProjector';
import { applyPlayerIdentityContextPatch } from '../../src/domain/identity/playerIdentityContext';
import { createMemoryEmbeddingClientFromSettings } from '../../src/domain/memory/createMemoryEmbeddingClientFromSettings';
import { createMemorySummaryClientFromSettings } from '../../src/domain/memory/createMemorySummaryClientFromSettings';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { createAuxiliaryGenerationClientFromSettings } from '../../src/domain/news/createAuxiliaryGenerationClientFromSettings';
import { createNpcSimulationClientFromSettings } from '../../src/domain/npc/createNpcSimulationClientFromSettings';
import { projectPolicePanelContext } from '../../src/domain/police/policePanelContextProjector';
import { projectRelationshipContext } from '../../src/domain/relationship/relationshipContextProjector';
import { runOpening } from '../../src/domain/opening/runOpening';
import type { OpeningSetup } from '../../src/domain/runtime/initialState';
import type { CurrentIdentity, RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import { createWritebackRepairClientFromSettings } from '../../src/domain/writeback/createWritebackRepairClientFromSettings';

const shouldRun = process.env.COPV2_RUN_IDENTITY_RC_REAL_API === '1';
const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const turnDelayMs = Math.max(0, Number(process.env.COPV2_IDENTITY_RC_TURN_DELAY_MS ?? 1200));
const requestTimeoutMs = Math.max(30_000, Number(process.env.COPV2_IDENTITY_RC_REQUEST_TIMEOUT_MS ?? 180_000));
const featureMode = process.env.COPV2_IDENTITY_RC_FEATURE_MODE === 'core' ? 'core' : 'all';
const forceFlashFallback = process.env.COPV2_IDENTITY_RC_FORCE_FLASH === '1';
const traceHttp = process.env.COPV2_IDENTITY_RC_TRACE_HTTP === '1';
const maxAttempts = Math.min(
  5,
  Math.max(2, Math.trunc(Number(process.env.COPV2_IDENTITY_RC_MAX_ATTEMPTS ?? 2)) || 2)
);
const directTurnCount = Math.max(3, Number(process.env.COPV2_IDENTITY_RC_DIRECT_TURNS ?? 15));
const civilianTurnCount = Math.min(
  12,
  Math.max(8, Math.trunc(Number(process.env.COPV2_IDENTITY_RC_CIVILIAN_TURNS ?? 10)) || 10)
);
const postJoinTurnCount = Math.max(2, Number(process.env.COPV2_IDENTITY_RC_POST_JOIN_TURNS ?? 5));
const undercoverTurnCount = Math.max(3, Number(process.env.COPV2_IDENTITY_RC_UNDERCOVER_TURNS ?? 8));

const allRouteIds = [
  'police_direct',
  'police_undercover_triad',
  'triad_direct',
  'triad_undercover_police',
  'civilian_to_police',
  'civilian_direct',
  'civilian_to_triad'
] as const;
type RcRouteId = (typeof allRouteIds)[number];
const configuredRouteIds = (process.env.COPV2_IDENTITY_RC_ROUTES ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value): value is RcRouteId => allRouteIds.includes(value as RcRouteId));
const requestedRouteIds = new Set<RcRouteId>(configuredRouteIds.length > 0 ? configuredRouteIds : allRouteIds);

function traceRc(message: string): void {
  if (traceHttp) process.stdout.write(`[identity-rc] ${message}\n`);
}

interface HttpAuditEntry {
  route: TurnApiRoute;
  status: number | null;
  responseMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  error?: string;
}

interface BoundarySnapshot {
  label: string;
  turn: number;
  expectedIdentity: CurrentIdentity;
  actualIdentity: CurrentIdentity;
  originIdentity: CurrentIdentity;
  playerActorIdentityMatches: boolean;
  publicRoleKeys: string[];
  publicRoleMatches: boolean;
  visibleOrganizationIds: string[];
  hiddenRelationCount: number;
  lawStatus: string;
  policeSalaryActive: boolean;
  policeBoundaryMatches: boolean;
  publicDirectorFactLeak: boolean;
  policePanelAvailable: boolean;
  grayNetworkPerspective: CurrentIdentity;
  institutionHasTriadOrganization: boolean;
  institutionHiddenRelationsSanitized: boolean;
  dynamicPanelPrivateFactLeak: boolean;
  featureProjectionMatches: boolean;
  diagnostics: string[];
  diagnosticDetails: string[];
  accepted: boolean;
}

interface RouteResult {
  routeId: string;
  startOrigin: CurrentIdentity;
  expectedFinalIdentity: CurrentIdentity;
  openingSucceeded: boolean;
  attemptedInputs: number;
  completedTurns: number;
  transitionObserved: boolean;
  transitionSource?: 'real_api_writeback' | 'seeded_production_patch';
  transitionKind?: string;
  finalIdentity?: CurrentIdentity;
  identityHistoryLength?: number;
  boundaryChecks: BoundarySnapshot[];
  accepted: boolean;
  error?: string;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
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
  const candidate = source.usage ?? source.usageMetadata ?? source.usage_metadata;
  const usage = candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>) : undefined;
  return {
    promptTokens: numberField(usage, 'prompt_tokens', 'promptTokenCount', 'input_tokens'),
    completionTokens: numberField(usage, 'completion_tokens', 'candidatesTokenCount', 'output_tokens'),
    totalTokens: numberField(usage, 'total_tokens', 'totalTokenCount')
  };
}

function createAuditedFetch(audits: HttpAuditEntry[], route: TurnApiRoute) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    traceRc(`http:start route=${route}`);
    try {
      const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
        (signal): signal is AbortSignal => Boolean(signal)
      );
      const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
      traceRc(`http:headers route=${route} status=${response.status}`);
      const audit: HttpAuditEntry = {
        route,
        status: response.status,
        responseMs: Math.round(performance.now() - startedAt)
      };
      audits.push(audit);
      const recordPayload = (payload: unknown) => {
        Object.assign(audit, usageFromPayload(payload));
        audit.responseMs = Math.round(performance.now() - startedAt);
      };
      const recordBodyError = (error: unknown) => {
        audit.error = safeError(error);
        audit.responseMs = Math.round(performance.now() - startedAt);
      };
      const originalJson = response.json.bind(response);
      response.json = async () => {
        try {
          const payload = await originalJson();
          recordPayload(payload);
          traceRc(`http:body route=${route} mode=json`);
          return payload;
        } catch (error) {
          recordBodyError(error);
          throw error;
        }
      };
      const originalText = response.text.bind(response);
      response.text = async () => {
        try {
          const body = await originalText();
          try {
            recordPayload(JSON.parse(body));
          } catch {
            audit.responseMs = Math.round(performance.now() - startedAt);
          }
          traceRc(`http:body route=${route} mode=text`);
          return body;
        } catch (error) {
          recordBodyError(error);
          throw error;
        }
      };
      return response;
    } catch (error) {
      traceRc(`http:error route=${route} error=${safeError(error)}`);
      audits.push({
        route,
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function routeMetadata(settings: AiSettings) {
  const route = settings.mainNarrator;
  const profile = settings.apiProfiles.find((item) => item.id === route?.apiProfileId);
  return {
    profileName: profile?.name ?? 'missing',
    interfaceType: profile?.interfaceType ?? 'missing',
    model: route?.model ?? 'missing',
    maxTokens: route?.maxTokens
  };
}

function createFlashFallbackSettings(settings: AiSettings): AiSettings | null {
  const route = settings.featureRoutes.backgroundEvolution;
  if (route.mode !== 'custom') return null;
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: route.apiProfileId,
      model: route.model,
      maxTokens: Math.max(4096, Math.min(settings.mainNarrator?.maxTokens ?? 8192, 8192)),
      temperature: 0.2
    }
  };
}

function activePoliceSalary(state: RuntimeState): boolean {
  return Object.values(state.finance.cashflows).some(
    (cashflow) => cashflow.kind === 'salary' && cashflow.title === '警队月薪' && cashflow.status === 'active'
  );
}

function expectedPublicRoleKey(identity: CurrentIdentity): 'police' | 'triad' | 'civilian' {
  return identity === 'gang_member' ? 'triad' : identity;
}

function collectBoundarySnapshot(
  state: RuntimeState,
  expectedIdentity: CurrentIdentity,
  label: string
): BoundarySnapshot {
  const actor = state.actors[state.player.actorId];
  const publicRoleKeys = actor ? Object.keys(projectPublicActorRoleProfiles(actor)).sort() : [];
  const visibleRelations = actor ? projectVisibleActorOrganizationRelations(actor) : [];
  const visibleOrganizationIds = actor ? projectVisibleActorOrganizationIds(actor, visibleRelations).sort() : [];
  const identityProjection = projectPlayerIdentityContext(state);
  const publicFactText = JSON.stringify(identityProjection.publicFacts);
  const privateSummaries = [
    ...identityProjection.directorOnlyFacts.map((fact) => fact.summary),
    ...identityProjection.protagonistPrivateKnowledge.facts.map((fact) => fact.summary)
  ].filter(Boolean);
  const publicDirectorFactLeak = privateSummaries.some((summary) => publicFactText.includes(summary));
  const policePanelProjection = projectPolicePanelContext(state);
  const grayNetworkProjection = projectGrayNetworkContext(state);
  const institutionProjection = createCityPowerInstitutionView(
    state.organizations,
    state.player.currentIdentity,
    undefined,
    actor
      ? {
          actorId: state.player.actorId,
          organizationRelations: actor.organizationRelations
        }
      : undefined
  );
  const relationshipProjection = projectRelationshipContext(state);
  const institutionHasTriadOrganization = institutionProjection.some((organization) => organization.type === 'triad');
  const institutionHiddenRelationsSanitized = institutionProjection
    .filter((organization) => organization.playerRelationScope === 'hidden')
    .every(
      (organization) =>
        organization.stanceTowardPlayer === '当前身份下没有公开的直接关系。' &&
        organization.relatedCaseIds.length === 0 &&
        !organization.relatedActorIds.includes(state.player.actorId)
    );
  const dynamicPanelProjectionText = JSON.stringify({
    currentMatters: Object.values(state.dynamicEvents.currentMatters).filter((matter) => matter.visibility !== 'hidden'),
    signals: Object.values(state.dynamicEvents.signals).filter((signal) => signal.visibility !== 'hidden'),
    npcTracks: Object.values(state.backgroundEvolution.npcTracks).filter((track) => track.visibility !== 'hidden'),
    cityTracks: Object.values(state.citySituationTracks).filter((track) => track.visibility !== 'hidden'),
    organizationTracks: Object.values(state.backgroundEvolution.organizationTracks).filter(
      (track) => track.visibility !== 'hidden'
    ),
    recentOutcomes: state.backgroundEvolution.recentOutcomes.filter((outcome) => outcome.visibility !== 'hidden'),
    chronicle: state.backgroundEvolution.chronicle.filter((entry) => entry.visibility !== 'hidden'),
    relationships: relationshipProjection.threads,
    grayNetwork: grayNetworkProjection,
    institutions: institutionProjection,
    police: policePanelProjection.available ? policePanelProjection : { available: false }
  });
  const dynamicPanelPrivateFactLeak = privateSummaries.some((summary) => dynamicPanelProjectionText.includes(summary));
  const featureProjectionMatches =
    policePanelProjection.available === (expectedIdentity === 'police') &&
    grayNetworkProjection.perspective === expectedIdentity &&
    !institutionHasTriadOrganization &&
    institutionHiddenRelationsSanitized &&
    !dynamicPanelPrivateFactLeak;
  const policeSalaryActive = activePoliceSalary(state);
  const policeBoundaryMatches =
    expectedIdentity === 'police'
      ? state.lawIdentity.status === 'active' && policeSalaryActive && Boolean(state.player.policeNumber)
      : state.lawIdentity.status !== 'active' && !policeSalaryActive;
  const diagnostics = state.storyLog.at(-1)?.writebackDiagnostics?.map((issue) => issue.code ?? issue.message) ?? [];
  const diagnosticDetails = state.storyLog.at(-1)?.writebackDiagnostics?.map((issue) => issue.message) ?? [];
  const publicRoleMatches =
    publicRoleKeys.length === 1 && publicRoleKeys[0] === expectedPublicRoleKey(expectedIdentity);
  const playerActorIdentityMatches =
    state.player.currentIdentity === expectedIdentity && actor?.currentIdentity === expectedIdentity;
  const accepted =
    playerActorIdentityMatches &&
    publicRoleMatches &&
    policeBoundaryMatches &&
    !publicDirectorFactLeak &&
    featureProjectionMatches &&
    identityProjection.routeSource === 'player.currentIdentity';

  return {
    label,
    turn: state.turnCounter,
    expectedIdentity,
    actualIdentity: state.player.currentIdentity,
    originIdentity: state.player.originIdentity,
    playerActorIdentityMatches,
    publicRoleKeys,
    publicRoleMatches,
    visibleOrganizationIds,
    hiddenRelationCount: actor?.organizationRelations.filter((relation) => relation.visibility === 'hidden').length ?? 0,
    lawStatus: state.lawIdentity.status,
    policeSalaryActive,
    policeBoundaryMatches,
    publicDirectorFactLeak,
    policePanelAvailable: policePanelProjection.available,
    grayNetworkPerspective: grayNetworkProjection.perspective,
    institutionHasTriadOrganization,
    institutionHiddenRelationsSanitized,
    dynamicPanelPrivateFactLeak,
    featureProjectionMatches,
    diagnostics,
    diagnosticDetails,
    accepted
  };
}

function commonSetup(currentIdentity: CurrentIdentity, playerName: string): OpeningSetup {
  return {
    playerName,
    englishName: '',
    gender: 'male',
    age: 25,
    currentIdentity,
    startTime: { year: 1984, month: 12, day: 27, hour: 8, minute: 30 },
    openingPressure: 'routine',
    cantoneseFlavor: 'medium',
    personality: '谨慎、重人情，但遇到关键选择会明确表态。',
    appearance: '二十五岁香港男子，衣着整洁，神情警醒。'
  };
}

function seedUndercoverState(state: RuntimeState, target: 'police' | 'gang_member'): RuntimeState {
  const fromIdentity = state.player.currentIdentity;
  if (fromIdentity === target) throw new Error('Undercover target must differ from the current public identity.');
  const isPoliceCover = target === 'police';
  const secretId = isPoliceCover ? 'secret_rc_triad_loyalty' : 'secret_rc_police_identity';
  const result = applyPlayerIdentityContextPatch(state, {
    transitionId: isPoliceCover ? 'transition_rc_triad_to_police_cover' : 'transition_rc_police_to_triad_cover',
    kind: 'cover_enter',
    fromIdentity,
    toIdentity: target,
    publicIdentity: isPoliceCover ? '皇家香港警察基层警员' : '和胜和庙街基层成员',
    policeNumber: isPoliceCover ? '4821' : undefined,
    actualIdentitySummary: isPoliceCover ? '和胜和成员，奉命以警察身份担任内线。' : '皇家香港警察卧底人员。',
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
            organizationId: 'org_wo_shing_wo',
            societyName: '和胜和',
            roleTitle: '庙街基层联络',
            rankSummary: '基层成员',
            territorySummary: '庙街与油麻地一带',
            patronActorIds: [],
            peerActorIds: [],
            rivalActorIds: [],
            coverIdentitySummary: '公开身份为和胜和庙街基层联络。',
            obligationSummary: '只处理上线明确交代的基层事务。',
            riskSummary: '真实警察身份一旦暴露会危及任务和人身安全。'
          }
        },
    secretFactPatches: [
      {
        operation: 'upsert',
        fact: {
          secretId,
          ownerType: 'player',
          ownerId: state.player.actorId,
          kind: 'identity',
          summary: isPoliceCover ? '玩家真实效忠和胜和，公开身份是警察。' : '玩家真实身份是皇家香港警察，公开身份是社团成员。',
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
  if (!result.applied) throw new Error(result.diagnostic ?? 'Failed to seed undercover identity through production patch.');
  return result.state;
}

const policeActions = [
  '先向值日警长确认今日任务、权限和要交接的事项。',
  '按安排到辖区步行巡逻，先观察街面和商户情况。',
  '处理一宗普通街坊求助，记录事实，不夸大为大案。',
  '向同僚核对刚才的记录和后续交接方式。',
  '回警署整理笔记，并确认是否有需要继续跟进的事项。',
  '利用休息时间与一名熟悉辖区的同僚聊聊近期街面变化。',
  '按时继续当值，优先处理一项合理的基层勤务。',
  '对一条未经证实的消息只做登记和核实，不先下结论。',
  '向上级汇报目前事实，并接受符合职级的下一步安排。',
  '完成本阶段工作后回到报案室，检查有没有遗漏。',
  '下班前与接班同僚做清楚交接。',
  '下班后回住处，处理家庭和个人生活中的普通事务。',
  '第二天按时回到岗位，查看新的值日安排。',
  '继续处理一项日常警务接触，保持程序和权限边界。',
  '把本轮已经确认的事实写进记录，再决定下一步。',
  '与直接上级复盘近日工作，并听取一项合理的新安排。',
  '完成一次辖区巡查后回署交接。',
  '保持正常生活节奏，处理工作之外的一件小事。',
  '重新回到岗位，核对仍未解决的事项。',
  '按当前权限推进一项普通工作，不替任何人越权决定。'
];

const triadActions = [
  '先向上线问清今日交代、期限、可用人手和权限边界。',
  '到所属活动区域走一圈，只处理当前职务覆盖的事务。',
  '与一名熟悉场所的联系人核对情况，不主动升级冲突。',
  '把已确认的情况向上线交代，说明仍不确定的部分。',
  '处理一项普通场所或人情事务，避免无意义暴力。',
  '核对本区近期警方压力和内部规矩。',
  '在权限范围内协调一次具体的小事。',
  '拒绝替别人作超出职级的承诺，并要求上报。',
  '把本阶段结果交给上线，听取合理的后续安排。',
  '离开场所后回住处，处理个人生活。',
  '第二天回到活动区域，先查看有没有新的交代。',
  '与同伴核对一条传闻，只保留能够确认的事实。',
  '继续完成当前职责内的一项具体事务。',
  '向上线报告街面变化和风险，不夸大成果。',
  '结束本轮事务并做好交接。',
  '与一名长期联系人维持正常往来，了解近况。',
  '检查活动区域的普通生意和人情关系。',
  '在不越权的前提下解决一个小矛盾。',
  '把无法确认的内容留待以后，不强行制造结论。',
  '完成今日交代后离开，保持正常生活节奏。'
];

const civilianToPoliceActions = [
  '先完成今天的工作，再向街口当值警员询问警队招募条件；目前只了解流程，不替我决定加入。',
  '我认真考虑后，主动到招募处领取并提交申请，按真实流程接受下一步安排。',
  '按通知参加体检、背景审查和面试；若仍需等待就如实写明，不要提前转职。',
  '继续完成招募程序和必要训练，并确认正式报到日期。',
  '如果录取、训练和任命条件已经完成，我明确接受任命并以基层警员身份正式报到；只有身份真正成立时才写 join 身份补丁。',
  '时间推进到已经通知的正式报到日。我携带文件到警署完成宣誓、领取警号并正式入职；请在事实成立时原子切换为警察身份。',
  '我明确接受已经完成审批的警队任命，今天正式成为基层警员并开始第一天岗位交接。'
];

const civilianActions = [
  '先按时完成今天的巴士售票工作，记录一件普通乘客求助，不主动卷入警队或社团。',
  '下班后回家处理家用和邻里小事，保持普通市民身份。',
  '第二天向同事了解路线调整，只处理工作职责内的问题。',
  '休息时去附近街市采购，与熟悉的街坊聊聊近况，不接受任何入会或招募安排。',
  '继续正常上班，协助司机处理一次普通乘车纠纷，必要时只按市民身份求助。',
  '下班后核对本月开支，并和家人讨论一项现实生活压力。',
  '利用休息日拜访一位旧友，只维持普通私人往来。',
  '今天休假留在家里整理生活账目，不接触警队或社团事务，继续保持普通市民身份。',
  '继续完成本职工作，并拒绝一项来历不清、可能改变身份的邀约。',
  '回到住处安排下一周生活，继续以普通市民身份生活。',
  '按原计划上班，处理一件与同事或乘客有关的小事。',
  '在不加入警队或社团的前提下，继续维护家庭、工作和街坊关系。'
];

const civilianToTriadActions = [
  '先完成今天的工作，再听一位旧友说清楚他所谓的街面帮忙；目前只了解具体事情，不替我决定加入社团。',
  '我愿意先做一件合法边缘、低风险的小事，以便看清对方和规矩，但仍未答应加入。',
  '把已经完成的小事交代清楚，并直接询问对方是否要我成为固定成员、需要承担什么义务。',
  '我要求把字头、活动区域、上线和职责说清楚，再决定是否正式加入。',
  '在条件已经说清且双方都确认后，我明确接受入会，完成必要仪式并成为有固定上线的基层成员；只有身份真正成立时才写 join 身份补丁。',
  '今天是双方已经约定的正式入会日。我确认承担具体职责、接受固定上线与区域边界；请在事实成立时原子切换为社团身份。',
  '我明确接受已经谈妥的基层社团身份，正式开始履行限定在本区的职务。'
];

const policeUndercoverActions = [
  '我向直属上级申请参与一项针对街面社团的卧底任务，先听清目标、审批和风险，不擅自开始。',
  '如果任务已获批准，我接受保密简报、联络规则和撤离条件，并确认将使用一个基层社团公开身份。',
  '我完成必要准备，今天按批准方案以社团成员公开身份进入目标区域；卧底公开身份正式成立时请写 cover_enter，并把真实警察身份放进秘密事实。',
  '以当前公开身份向上线报到，只处理符合基层身份的小事。',
  '维持公开社团身份，与接头警员只按保密规则联络。',
  '在不暴露真实身份的前提下观察场所和人物关系。',
  '完成一次普通交代并向上线报告，不越权。',
  '把可用情报通过安全渠道交给联络警员，公开层不泄露真实身份。',
  '继续维持社团公开身份和日常关系。',
  '处理一项低风险事务，同时留意是否有人怀疑我的来历。',
  '按既定规则暂停联络，先稳住公开身份。'
];

const triadUndercoverActions = [
  '我向固定上线确认是否要我以公开警察身份进入警队充当内线，先听清安排、风险和边界，不擅自开始。',
  '如果这项安排已经确定，我按公开程序完成报名、审查和训练，同时把真实效忠严格保密。',
  '今天我完成任命并以基层警员公开身份正式报到；公开警察身份成立时请写 cover_enter，并把真实社团效忠放进秘密事实。',
  '以当前公开警察身份完成岗位交接，严格按基层权限行事。',
  '处理一项普通警务接触，不在公开层暴露真实社团关系。',
  '与同僚正常协作，同时只通过安全方式向原上线传递有限信息。',
  '完成值日记录，保持警察公开身份可信。',
  '对涉及原社团的传闻只按程序核实，避免异常偏袒。',
  '继续正常当值，不让真实效忠进入公开警队资料。',
  '下班后按既定保密规则处理一次联络。',
  '第二天按时回署，维持公开警察身份。'
];

describe.skipIf(!shouldRun)('RC-2 identity routes through real APIs', () => {
  it('samples identity routes without public/private identity contamination', async () => {
    traceRc('test:start');
    const importedSettings = importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'));
    traceRc('settings:loaded');
    const fallbackSettings = createFlashFallbackSettings(importedSettings);
    let activeSettings = forceFlashFallback && fallbackSettings ? fallbackSettings : importedSettings;
    let fallbackActivated = forceFlashFallback && Boolean(fallbackSettings);
    const audits: HttpAuditEntry[] = [];
    const routes: RouteResult[] = [];

    const createClients = () => ({
      narrator: createNarratorClientFromSettings(activeSettings, createAuditedFetch(audits, 'mainNarrator')),
      memoryEmbedding: featureMode === 'all'
        ? createMemoryEmbeddingClientFromSettings(activeSettings, createAuditedFetch(audits, 'memoryEmbedding')) ?? undefined
        : undefined,
      memorySummary: featureMode === 'all'
        ? createMemorySummaryClientFromSettings(activeSettings, createAuditedFetch(audits, 'memorySummary')) ?? undefined
        : undefined,
      writebackRepair: createWritebackRepairClientFromSettings(
        activeSettings,
        createAuditedFetch(audits, 'writebackRepair')
      ) ?? undefined,
      npcSimulation: featureMode === 'all'
        ? createNpcSimulationClientFromSettings(activeSettings, createAuditedFetch(audits, 'npcSimulation')) ?? undefined
        : undefined,
      backgroundEvolution: featureMode === 'all'
        ? createBackgroundEvolutionClientFromSettings(
            activeSettings,
            createAuditedFetch(audits, 'backgroundEvolution')
          ) ?? undefined
        : undefined,
      auxiliaryGeneration: featureMode === 'all'
        ? createAuxiliaryGenerationClientFromSettings(
            activeSettings,
            createAuditedFetch(audits, 'auxiliaryGeneration')
          ) ?? undefined
        : undefined
    });

    async function executeWithRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const auditStart = audits.length;
        try {
          return await operation();
        } catch (error) {
          lastError = error;
          const failedAudits = audits.slice(auditStart);
          const mainFailure = [...failedAudits]
            .reverse()
            .find((entry) => entry.route === 'mainNarrator' && (entry.status === null || entry.status >= 500));
          if (!fallbackActivated && fallbackSettings && mainFailure) {
            activeSettings = fallbackSettings;
            fallbackActivated = true;
            console.log(`[identity-rc] ${label}: configured main route failed; activating in-memory flash fallback`);
          } else {
            console.log(`[identity-rc] ${label}: attempt=${attempt} error=${safeError(error)}`);
          }
          if (attempt < maxAttempts) await sleep(Math.max(turnDelayMs, 1500));
        }
      }
      throw lastError;
    }

    async function openRoute(routeId: string, setup: OpeningSetup): Promise<RuntimeState> {
      return executeWithRetry(`${routeId}:opening`, async () => {
        const clients = createClients();
        const state = await runOpening({
          setup,
          narrator: clients.narrator,
          narrativeLengthLevel: 'compact',
          promptSettings: activeSettings.prompts
        });
        console.log(`[identity-rc] ${routeId}:opening completed identity=${state.player.currentIdentity}`);
        return state;
      });
    }

    async function playTurn(state: RuntimeState, input: string, label: string): Promise<RuntimeState> {
      const next = await executeWithRetry(label, async () => {
        const clients = createClients();
        return runPlayerTurn({
          state,
          playerInput: input,
          ...clients,
          gameSettings: { ...activeSettings.game, narrativeLengthLevel: 'compact' },
          promptSettings: activeSettings.prompts,
          memoryCompression: featureMode === 'all' ? activeSettings.memory : undefined,
          onStageChange: (stage) => console.log(`[identity-rc] ${label}:stage=${stage}`)
        });
      });
      console.log(`[identity-rc] ${label}: turn=${next.turnCounter} identity=${next.player.currentIdentity}`);
      await sleep(turnDelayMs);
      return next;
    }

    async function runFixedRoute(input: {
      routeId: string;
      setup: OpeningSetup;
      actions: string[];
      expectedIdentity: CurrentIdentity;
    }): Promise<{ state?: RuntimeState; result: RouteResult }> {
      const result: RouteResult = {
        routeId: input.routeId,
        startOrigin: input.setup.currentIdentity ?? 'police',
        expectedFinalIdentity: input.expectedIdentity,
        openingSucceeded: false,
        attemptedInputs: 0,
        completedTurns: 0,
        transitionObserved: false,
        boundaryChecks: [],
        accepted: false
      };
      try {
        let state = await openRoute(input.routeId, input.setup);
        result.openingSucceeded = true;
        result.boundaryChecks.push(collectBoundarySnapshot(state, input.expectedIdentity, 'opening'));
        for (let index = 0; index < input.actions.length; index += 1) {
          result.attemptedInputs += 1;
          state = await playTurn(state, input.actions[index], `${input.routeId}:${index + 1}`);
          result.completedTurns += 1;
          result.boundaryChecks.push(collectBoundarySnapshot(state, input.expectedIdentity, `turn_${state.turnCounter}`));
        }
        result.finalIdentity = state.player.currentIdentity;
        result.identityHistoryLength = state.player.identityHistory.length;
        result.accepted =
          state.player.currentIdentity === input.expectedIdentity && result.boundaryChecks.every((check) => check.accepted);
        return { state, result };
      } catch (error) {
        result.error = safeError(error);
        return { result };
      }
    }

    async function runTransitionRoute(input: {
      routeId: string;
      initialState?: RuntimeState;
      setup?: OpeningSetup;
      transitionActions: string[];
      postActions: string[];
      expectedIdentity: CurrentIdentity;
      expectedOrigin: CurrentIdentity;
      expectedKind: 'join' | 'cover_enter';
      transitionSource?: 'real_api_writeback' | 'seeded_production_patch';
    }): Promise<{ state?: RuntimeState; result: RouteResult }> {
      const result: RouteResult = {
        routeId: input.routeId,
        startOrigin: input.expectedOrigin,
        expectedFinalIdentity: input.expectedIdentity,
        openingSucceeded: Boolean(input.initialState),
        attemptedInputs: 0,
        completedTurns: 0,
        transitionObserved: false,
        transitionSource: input.transitionSource ?? 'real_api_writeback',
        boundaryChecks: [],
        accepted: false
      };
      try {
        let state = input.initialState ? structuredClone(input.initialState) : await openRoute(input.routeId, input.setup!);
        result.openingSucceeded = true;
        result.boundaryChecks.push(
          collectBoundarySnapshot(state, state.player.currentIdentity, input.initialState ? 'inherited_state' : 'opening')
        );
        const existingTransition = state.player.identityHistory.at(-1);
        result.transitionObserved =
          state.player.currentIdentity === input.expectedIdentity && existingTransition?.kind === input.expectedKind;
        for (let index = 0; !result.transitionObserved && index < input.transitionActions.length; index += 1) {
          result.attemptedInputs += 1;
          state = await playTurn(state, input.transitionActions[index], `${input.routeId}:transition_${index + 1}`);
          result.completedTurns += 1;
          const expectedNow = state.player.currentIdentity === input.expectedIdentity ? input.expectedIdentity : input.expectedOrigin;
          result.boundaryChecks.push(collectBoundarySnapshot(state, expectedNow, `turn_${state.turnCounter}`));
          if (state.player.currentIdentity === input.expectedIdentity) {
            result.transitionObserved = true;
            break;
          }
        }
        if (!result.transitionObserved) throw new Error(`No ${input.expectedKind} transition was observed.`);
        for (let index = 0; index < input.postActions.length; index += 1) {
          result.attemptedInputs += 1;
          state = await playTurn(state, input.postActions[index], `${input.routeId}:post_${index + 1}`);
          result.completedTurns += 1;
          result.boundaryChecks.push(collectBoundarySnapshot(state, input.expectedIdentity, `turn_${state.turnCounter}`));
        }
        const latestTransition = state.player.identityHistory.at(-1);
        result.transitionKind = latestTransition?.kind;
        result.finalIdentity = state.player.currentIdentity;
        result.identityHistoryLength = state.player.identityHistory.length;
        const actor = state.actors[state.player.actorId];
        const hasBothProfiles =
          input.expectedKind !== 'cover_enter' || Boolean(actor.roleProfiles.police && actor.roleProfiles.triad);
        const hasPrivateIdentityFact =
          input.expectedKind !== 'cover_enter' ||
          Object.values(state.secretFacts).some(
            (fact) =>
              !fact.publicKnown &&
              (fact.kind === 'identity' || fact.kind === 'loyalty') &&
              (fact.ownerId === state.player.actorId || fact.ownerType === 'player')
          );
        result.accepted =
          state.player.currentIdentity === input.expectedIdentity &&
          state.player.originIdentity === input.expectedOrigin &&
          latestTransition?.kind === input.expectedKind &&
          hasBothProfiles &&
          hasPrivateIdentityFact &&
          result.boundaryChecks.every((check) => check.accepted);
        return { state, result };
      } catch (error) {
        result.error = safeError(error);
        return { result };
      }
    }

    let policeDirect: Awaited<ReturnType<typeof runFixedRoute>> | undefined;
    if (requestedRouteIds.has('police_direct') || requestedRouteIds.has('police_undercover_triad')) {
      policeDirect = await runFixedRoute({
        routeId: 'police_direct',
        setup: {
          ...commonSetup('police', '陈启明'),
          policeNumber: '7316',
          policePostingId: 'mong_kok_police_station',
          lawIdentity: {
            rank: 'Senior Police Constable（高级警员）',
            department: 'Uniform Branch（军装巡逻）',
            stationOrPost: 'Mong Kok Police Station（旺角警署）',
            assignmentSummary: 'Street Patrol Officer（街面巡逻）'
          }
        },
        actions: policeActions.slice(0, directTurnCount),
        expectedIdentity: 'police'
      });
      if (requestedRouteIds.has('police_direct')) routes.push(policeDirect.result);
    }

    if (requestedRouteIds.has('police_undercover_triad')) {
      const policeUndercover = policeDirect?.state
        ? await runTransitionRoute({
            routeId: 'police_undercover_triad',
            initialState: seedUndercoverState(policeDirect.state, 'gang_member'),
            transitionActions: [],
            postActions: policeUndercoverActions.slice(3, 3 + undercoverTurnCount),
            expectedIdentity: 'gang_member',
            expectedOrigin: 'police',
            expectedKind: 'cover_enter',
            transitionSource: 'seeded_production_patch'
          })
        : undefined;
      routes.push(policeUndercover?.result ?? {
        routeId: 'police_undercover_triad',
        startOrigin: 'police',
        expectedFinalIdentity: 'gang_member',
        openingSucceeded: false,
        attemptedInputs: 0,
        completedTurns: 0,
        transitionObserved: false,
        boundaryChecks: [],
        accepted: false,
        error: 'Skipped because police_direct failed.'
      });
    }

    let triadDirect: Awaited<ReturnType<typeof runFixedRoute>> | undefined;
    if (requestedRouteIds.has('triad_direct') || requestedRouteIds.has('triad_undercover_police')) {
      triadDirect = await runFixedRoute({
        routeId: 'triad_direct',
        setup: {
          ...commonSetup('gang_member', '林志森'),
          triadSocietyId: 'org_wo_shing_wo',
          triadTerritoryPlaceId: 'place_temple_street_night_market',
          triadRankId: 'district_cadre',
          triadRoleId: 'district_affairs_coordinator'
        },
        actions: triadActions.slice(0, directTurnCount),
        expectedIdentity: 'gang_member'
      });
      if (requestedRouteIds.has('triad_direct')) routes.push(triadDirect.result);
    }

    if (requestedRouteIds.has('triad_undercover_police')) {
      const triadUndercover = triadDirect?.state
        ? await runTransitionRoute({
            routeId: 'triad_undercover_police',
            initialState: seedUndercoverState(triadDirect.state, 'police'),
            transitionActions: [],
            postActions: triadUndercoverActions.slice(3, 3 + undercoverTurnCount),
            expectedIdentity: 'police',
            expectedOrigin: 'gang_member',
            expectedKind: 'cover_enter',
            transitionSource: 'seeded_production_patch'
          })
        : undefined;
      routes.push(triadUndercover?.result ?? {
        routeId: 'triad_undercover_police',
        startOrigin: 'gang_member',
        expectedFinalIdentity: 'police',
        openingSucceeded: false,
        attemptedInputs: 0,
        completedTurns: 0,
        transitionObserved: false,
        boundaryChecks: [],
        accepted: false,
        error: 'Skipped because triad_direct failed.'
      });
    }

    if (requestedRouteIds.has('civilian_to_police')) {
      const civilianToPolice = await runTransitionRoute({
        routeId: 'civilian_to_police',
        setup: {
          ...commonSetup('civilian', '何家俊'),
          civilianProfileId: 'custom_occupation',
          civilianCustomProfile: {
            publicOccupation: '九龙巴士售票员',
            workplacePlaceId: 'place_mong_kok',
            workplaceLabel: '旺角巴士路线与总站',
            communitySummary: '同事、司机、乘客和旺角街坊构成日常关系。'
          }
        },
        transitionActions: civilianToPoliceActions,
        postActions: policeActions.slice(0, postJoinTurnCount),
        expectedIdentity: 'police',
        expectedOrigin: 'civilian',
        expectedKind: 'join'
      });
      routes.push(civilianToPolice.result);
    }

    if (requestedRouteIds.has('civilian_direct')) {
      const civilianDirect = await runFixedRoute({
        routeId: 'civilian_direct',
        setup: {
          ...commonSetup('civilian', '梁志文'),
          civilianProfileId: 'custom_occupation',
          civilianCustomProfile: {
            publicOccupation: '九龙巴士售票员',
            workplacePlaceId: 'place_mong_kok',
            workplaceLabel: '旺角巴士路线与总站',
            communitySummary: '同事、司机、乘客和旺角街坊构成日常关系。'
          }
        },
        actions: civilianActions.slice(0, civilianTurnCount),
        expectedIdentity: 'civilian'
      });
      routes.push(civilianDirect.result);
    }

    if (requestedRouteIds.has('civilian_to_triad')) {
      const civilianToTriad = await runTransitionRoute({
        routeId: 'civilian_to_triad',
        setup: { ...commonSetup('civilian', '郭文康'), civilianProfileId: 'unemployed' },
        transitionActions: civilianToTriadActions,
        postActions: triadActions.slice(0, postJoinTurnCount),
        expectedIdentity: 'gang_member',
        expectedOrigin: 'civilian',
        expectedKind: 'join'
      });
      routes.push(civilianToTriad.result);
    }

    const statusCounts: Record<string, number> = {};
    for (const audit of audits) {
      const key = audit.status === null ? 'network_error' : String(audit.status);
      statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    }
    const generatedAt = new Date().toISOString();
    const report = {
      test: 'v1-rc-2-identity-route-real-api-acceptance',
      generatedAt,
      settingsFile: path.basename(settingsPath),
      credentialSafety: {
        settingsLoadedInMemory: true,
        keyValuesRecorded: false,
        requestBodiesRecorded: false,
        rawModelResponsesRecorded: false,
        runtimeStatesRecorded: false
      },
      configuredMainRoute: routeMetadata(importedSettings),
      effectiveMainRoute: routeMetadata(activeSettings),
      fallbackActivated,
      limits: {
        directTurnCount,
        civilianTurnCount,
        postJoinTurnCount,
        undercoverTurnCount,
        turnDelayMs,
        requestTimeoutMs,
        maxAttempts,
        featureMode,
        forceFlashFallback,
        traceHttp,
        requestedRouteIds: [...requestedRouteIds]
      },
      summary: {
        routeCount: routes.length,
        acceptedRouteCount: routes.filter((route) => route.accepted).length,
        allRoutesAccepted: routes.every((route) => route.accepted),
        httpRequestCount: audits.length,
        allHttpSuccessful: audits.every((audit) => audit.status !== null && audit.status >= 200 && audit.status < 300),
        statusCounts,
        tokenTotals: {
          prompt: audits.reduce((sum, audit) => sum + (audit.promptTokens ?? 0), 0),
          completion: audits.reduce((sum, audit) => sum + (audit.completionTokens ?? 0), 0),
          total: audits.reduce((sum, audit) => sum + (audit.totalTokens ?? 0), 0)
        }
      },
      routes,
      http: audits
    };
    const outputDirectory = path.resolve('output', 'identity-rc');
    await mkdir(outputDirectory, { recursive: true });
    const reportPath = path.join(outputDirectory, `identity-rc-${generatedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[identity-rc] report: ${reportPath}`);

    expect(routes.map((route) => route.routeId)).toEqual(allRouteIds.filter((routeId) => requestedRouteIds.has(routeId)));
    expect(routes.every((route) => route.accepted), JSON.stringify(routes, null, 2)).toBe(true);
  }, 3_600_000);
});
