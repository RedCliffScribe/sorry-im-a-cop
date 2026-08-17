import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackgroundEvolutionClientFromSettings } from '../../src/domain/backgroundEvolution/createBackgroundEvolutionClientFromSettings';
import { projectLivelihoodContext } from '../../src/domain/livelihood/livelihoodProjector';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { runOpening } from '../../src/domain/opening/runOpening';
import type { OpeningSetup } from '../../src/domain/runtime/initialState';
import type {
  CivilianRoleProfile,
  FinanceCashflowItem,
  RuntimeState,
  TurnApiRoute
} from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import { createWritebackRepairClientFromSettings } from '../../src/domain/writeback/createWritebackRepairClientFromSettings';

const shouldRun =
  process.env.COPV2_RUN_CIVILIAN_LIVELIHOOD_LIFECYCLE_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const publicProfileName =
  process.env.COPV2_LIVELIHOOD_LIFECYCLE_PROFILE_NAME ?? 'ggchan';
const publicModelName =
  process.env.COPV2_LIVELIHOOD_LIFECYCLE_MODEL ??
  'gemini-3.1-pro-preview';
const overrideBaseUrl =
  process.env.COPV2_LIVELIHOOD_LIFECYCLE_BASE_URL?.trim();
const overrideApiKey =
  process.env.COPV2_LIVELIHOOD_LIFECYCLE_API_KEY?.trim();
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_LIVELIHOOD_LIFECYCLE_TIMEOUT_MS ?? 600_000)
);
const turnDelayMs = Math.max(
  0,
  Number(process.env.COPV2_LIVELIHOOD_LIFECYCLE_DELAY_MS ?? 3_000)
);
const maxAttempts = Math.min(
  5,
  Math.max(
    1,
    Number(process.env.COPV2_LIVELIHOOD_LIFECYCLE_MAX_ATTEMPTS ?? 3)
  )
);
const outputDirectory =
  process.env.COPV2_LIVELIHOOD_LIFECYCLE_OUTPUT_DIR ??
  path.join('output', 'civilian-livelihood-lifecycle-real-api');

interface HttpAuditEntry {
  route: TurnApiRoute;
  status: number | null;
  responseMs: number;
  error?: string;
}

interface StateSnapshot {
  label: string;
  turn: number;
  time: string;
  publicOccupation?: string;
  employmentStatusId?: string;
  employerOrganizationId?: string;
  employerOrganizationName?: string;
  workplacePlaceId?: string;
  positionSummary?: string;
  activeCivilianIncome: Array<{
    itemId: string;
    title: string;
    amount: number;
  }>;
  pausedOrEndedCivilianIncome: Array<{
    itemId: string;
    status: string;
    amount: number;
  }>;
  livelihoodMatterCount: number;
  workRelationCount: number;
  employerTrackCount: number;
  projectionUsesEmployerOrganization: boolean;
  diagnosticCodes: string[];
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]')
    .replace(/codex-\d+/gi, '[REDACTED]')
    .slice(0, 800);
}

function sleep(ms: number): Promise<void> {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}

function gameTimeLabel(state: RuntimeState): string {
  const time = state.time;
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(
    time.day
  ).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(
    time.minute
  ).padStart(2, '0')}`;
}

function civilianProfile(state: RuntimeState): CivilianRoleProfile | undefined {
  return state.actors[state.player.actorId]?.roleProfiles.civilian;
}

function civilianIncome(
  state: RuntimeState,
  status?: FinanceCashflowItem['status']
): FinanceCashflowItem[] {
  return Object.values(state.finance.cashflows).filter(
    (item) =>
      item.direction === 'income' &&
      item.identityBinding === 'civilian' &&
      (!status || item.status === status)
  );
}

function stateSnapshot(label: string, state: RuntimeState): StateSnapshot {
  const profile = civilianProfile(state);
  const projection = projectLivelihoodContext(state);
  const activeIncome = civilianIncome(state, 'active');
  const historicalIncome = civilianIncome(state).filter(
    (item) => item.status !== 'active'
  );
  const employerTrackCount = profile?.employerOrganizationId
    ? Object.values(state.backgroundEvolution.organizationTracks).filter(
        (track) =>
          track.organizationId === profile.employerOrganizationId
      ).length
    : 0;
  const latestStoryEntry = state.storyLog[state.storyLog.length - 1];
  return {
    label,
    turn: state.turnCounter,
    time: gameTimeLabel(state),
    publicOccupation: profile?.publicOccupation,
    employmentStatusId: profile?.employmentStatusId,
    employerOrganizationId: profile?.employerOrganizationId,
    employerOrganizationName: profile?.employerOrganizationId
      ? state.organizations[profile.employerOrganizationId]?.name
      : undefined,
    workplacePlaceId: profile?.workplacePlaceId,
    positionSummary: profile?.positionSummary,
    activeCivilianIncome: activeIncome.map((item) => ({
      itemId: item.itemId,
      title: item.title,
      amount: item.amount
    })),
    pausedOrEndedCivilianIncome: historicalIncome.map((item) => ({
      itemId: item.itemId,
      status: item.status,
      amount: item.amount
    })),
    livelihoodMatterCount: projection.activeMatters.length,
    workRelationCount: projection.workRelations.length,
    employerTrackCount,
    projectionUsesEmployerOrganization:
      Boolean(profile?.employerOrganizationId) &&
      projection.primaryOrganization?.organizationId ===
        profile?.employerOrganizationId,
    diagnosticCodes: Array.from(
      new Set(
        (latestStoryEntry?.writebackDiagnostics ?? [])
          .map((issue) => issue.code)
          .filter((code): code is string => Boolean(code))
      )
    )
  };
}

function selectPublicSettings(imported: AiSettings): AiSettings {
  if (Boolean(overrideBaseUrl) !== Boolean(overrideApiKey)) {
    throw new Error('本地反代覆盖必须同时提供 BASE_URL 和 API_KEY。');
  }
  if (overrideBaseUrl && overrideApiKey) {
    const now = new Date().toISOString();
    const localProfile = {
      id: 'real_api_lifecycle_override',
      name: 'local-lifecycle-override',
      providerLabel: 'OpenAI 兼容（本地反代）',
      interfaceType: 'openai-compatible' as const,
      baseUrl: overrideBaseUrl,
      apiKey: overrideApiKey,
      models: [publicModelName],
      createdAt: now,
      updatedAt: now
    };
    return {
      ...imported,
      apiProfiles: [
        ...imported.apiProfiles.filter(
          (candidate) => candidate.id !== localProfile.id
        ),
        localProfile
      ],
      mainNarrator: {
        apiProfileId: localProfile.id,
        model: publicModelName,
        maxTokens: Math.max(8_192, imported.mainNarrator?.maxTokens ?? 8_192),
        temperature: 0.25
      },
      featureRoutes: {
        ...imported.featureRoutes,
        writebackRepair: { mode: 'follow-main' },
        memorySummary: { mode: 'disabled' },
        memoryVector: { mode: 'disabled' },
        npcSimulation: { mode: 'disabled' },
        backgroundEvolution: { mode: 'follow-main' },
        auxiliaryGeneration: { mode: 'disabled' }
      }
    };
  }
  const requested = publicProfileName.trim().toLocaleLowerCase();
  const profile =
    imported.apiProfiles.find(
      (candidate) => candidate.name.trim().toLocaleLowerCase() === requested
    ) ??
    imported.apiProfiles.find((candidate) =>
      candidate.name.trim().toLocaleLowerCase().includes(requested)
    );
  if (!profile) {
    throw new Error(`找不到公益站 API 档案“${publicProfileName}”。`);
  }
  return {
    ...imported,
    mainNarrator: {
      apiProfileId: profile.id,
      model: publicModelName,
      maxTokens: Math.max(8_192, imported.mainNarrator?.maxTokens ?? 8_192),
      temperature: 0.25
    },
    featureRoutes: {
      ...imported.featureRoutes,
      writebackRepair: { mode: 'follow-main' },
      memorySummary: { mode: 'disabled' },
      memoryVector: { mode: 'disabled' },
      npcSimulation: { mode: 'disabled' },
      backgroundEvolution: { mode: 'follow-main' },
      auxiliaryGeneration: { mode: 'disabled' }
    }
  };
}

function createSetup(
  playerName: string,
  civilianProfileId: string,
  openingNote: string
): OpeningSetup {
  return {
    playerName,
    englishName: '',
    gender: 'male',
    age: 28,
    currentIdentity: 'civilian',
    civilianProfileId,
    startTime: {
      year: 1984,
      month: 1,
      day: 8,
      hour: 8,
      minute: 30
    },
    openingPressure: 'routine',
    cantoneseFlavor: 'medium',
    personality: '做事稳妥，重视正式手续、工资条件和长期生活安排。',
    appearance: '二十八岁香港男子，衣着朴素整洁。',
    openingNote
  };
}

describe.skipIf(!shouldRun)(
  'civilian livelihood lifecycle through real APIs',
  () => {
    it(
      'verifies employment, promotion and pay, employer change, resignation and self-employment transitions',
      async () => {
        const imported = importApiSettings(
          createDefaultAiSettings(),
          await readFile(settingsPath, 'utf8')
        );
        const settings = selectPublicSettings(imported);
        const audits: HttpAuditEntry[] = [];
        const snapshots: StateSnapshot[] = [];
        const checks: string[] = [];
        let ordinaryTurnCount = 0;

        function auditedFetch(route: TurnApiRoute) {
          return async (
            input: RequestInfo | URL,
            init?: RequestInit
          ): Promise<Response> => {
            const startedAt = performance.now();
            try {
              const signals = [
                init?.signal,
                AbortSignal.timeout(requestTimeoutMs)
              ].filter((signal): signal is AbortSignal => Boolean(signal));
              const response = await fetch(input, {
                ...init,
                signal: AbortSignal.any(signals)
              });
              audits.push({
                route,
                status: response.status,
                responseMs: Math.round(performance.now() - startedAt)
              });
              return response;
            } catch (error) {
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

        function createClients() {
          return {
            narrator: createNarratorClientFromSettings(
              settings,
              auditedFetch('mainNarrator')
            ),
            writebackRepair:
              createWritebackRepairClientFromSettings(
                settings,
                auditedFetch('writebackRepair')
              ) ?? undefined,
            backgroundEvolution:
              createBackgroundEvolutionClientFromSettings(
                settings,
                auditedFetch('backgroundEvolution')
              ) ?? undefined
          };
        }

        async function retry<T>(
          label: string,
          operation: () => Promise<T>
        ): Promise<T> {
          let lastError: unknown;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
              return await operation();
            } catch (error) {
              lastError = error;
              console.log(
                `[livelihood-lifecycle-real] ${label} attempt=${attempt} error=${safeError(
                  error
                )}`
              );
              if (attempt < maxAttempts) {
                await sleep(Math.max(turnDelayMs, 5_000) * attempt);
              }
            }
          }
          throw lastError;
        }

        async function open(setup: OpeningSetup): Promise<RuntimeState> {
          const state = await retry(`opening:${setup.playerName}`, () =>
            runOpening({
              setup,
              narrator: createClients().narrator,
              narrativeLengthLevel: 'compact',
              promptSettings: settings.prompts
            })
          );
          snapshots.push(stateSnapshot(`opening:${setup.playerName}`, state));
          console.log(
            `[livelihood-lifecycle-real] opening:${setup.playerName} occupation=${civilianProfile(
              state
            )?.publicOccupation ?? 'unknown'}`
          );
          await sleep(turnDelayMs);
          return state;
        }

        async function turn(
          state: RuntimeState,
          input: string,
          label: string
        ): Promise<RuntimeState> {
          const next = await retry(label, () =>
            runPlayerTurn({
              state,
              playerInput: input,
              ...createClients(),
              writebackRepairMode: 'follow-main',
              gameSettings: {
                ...settings.game,
                narrativeLengthLevel: 'compact'
              },
              promptSettings: settings.prompts
            })
          );
          ordinaryTurnCount += 1;
          snapshots.push(stateSnapshot(label, next));
          console.log(
            `[livelihood-lifecycle-real] ${label} turn=${next.turnCounter} occupation=${
              civilianProfile(next)?.publicOccupation ?? 'unknown'
            } income=${civilianIncome(next, 'active')
              .map((item) => `${item.itemId}:${item.amount}`)
              .join(',') || 'none'} diagnostics=${
              stateSnapshot(label, next).diagnosticCodes.join(',') || 'none'
            }`
          );
          await sleep(turnDelayMs);
          return next;
        }

        async function runUntil(
          state: RuntimeState,
          label: string,
          actions: string[],
          accepted: (candidate: RuntimeState) => boolean
        ): Promise<RuntimeState> {
          let current = state;
          for (let index = 0; index < actions.length; index += 1) {
            current = await turn(
              current,
              actions[index],
              `${label}:${index + 1}`
            );
            if (accepted(current)) return current;
          }
          throw new Error(`${label} 未形成要求的结构化持久状态。`);
        }

        let state = await open(
          createSetup(
            '梁志文',
            'unemployed',
            '玩家目前无业，准备寻找稳定工作；不要在玩家行动前替他建立雇佣或固定工资。'
          )
        );
        expect(civilianIncome(state, 'active')).toHaveLength(0);
        checks.push('无业开局未伪造固定工资');

        state = await runUntil(
          state,
          'join_kmb',
          [
            '我到九龙巴士正式询问售票员空缺，先确认部门、工作地点、工时、月薪和入职手续，不立即答应。',
            '我参加九龙巴士的正式面试并提交资料；如获录用，请把岗位、部门、工作地点、月薪和到职日期说清楚。',
            '我接受九龙巴士的正式长期雇佣，签妥手续并按通知报到。事实已经成立：请同时更新市民职业档案、同一 org_kmb 雇主关系和绑定 civilian 的固定月薪，不要只写正文。',
            '我完成第一班工作并向人事确认工资已经生效；请保持唯一一条有效市民固定工资，并建立实际工作关系和营生事项。'
          ],
          (candidate) => {
            const profile = civilianProfile(candidate);
            return Boolean(
              profile?.employerOrganizationId &&
                profile.employmentStatusId !== 'unemployed' &&
                civilianIncome(candidate, 'active').length === 1
            );
          }
        );
        const firstEmployerId = civilianProfile(state)?.employerOrganizationId;
        const firstSalary = civilianIncome(state, 'active')[0];
        const prePromotionPosition = civilianProfile(state)?.positionSummary;
        const prePromotionOccupation = civilianProfile(state)?.publicOccupation;
        if (!firstEmployerId || !firstSalary) {
          throw new Error('九龙巴士入职没有同时形成雇主和有效工资。');
        }
        if (!state.organizations[firstEmployerId]) {
          throw new Error('职业档案引用了不存在的雇主机构。');
        }
        if (
          projectLivelihoodContext(state).primaryOrganization?.organizationId !==
          firstEmployerId
        ) {
          throw new Error('营生面板没有引用职业档案的同一雇主机构。');
        }
        checks.push('正式入职同步职业档案、雇主机构、工作关系和唯一固定工资');

        state = await turn(
          state,
          '我照常完成两天轮班，和带班、同事及乘客处理日常工作，并留意公司目前的营运方向；不要无故晋升。',
          'ordinary_kmb_work'
        );
        state = await turn(
          state,
          '时间推进三个月。这段期间我持续正常出勤、熟悉线路并通过内部考核；请如实总结公司方向、工作关系和我是否具备晋升资格，但现在先不要宣布晋升。',
          'promotion_eligibility'
        );
        state = await runUntil(
          state,
          'promotion',
          [
            '我参加已经安排好的正式晋升面谈，确认新职位、职责、生效日期和新月薪；如果条件尚未满足就如实说明。',
            '晋升审批现已正式完成并从今天生效。我接受新岗位并向人事确认调薪。请同步更新同一市民职业档案和原固定工资条目的金额，不要另建第二条有效工资。',
            '我按新职位完成第一班工作，并核对工资单、权限和日常分工已经按正式晋升结果更新。'
          ],
          (candidate) => {
            const profile = civilianProfile(candidate);
            const incomes = civilianIncome(candidate, 'active');
            return Boolean(
                profile?.employerOrganizationId === firstEmployerId &&
                incomes.length === 1 &&
                incomes[0].amount !== firstSalary.amount &&
                (profile.positionSummary !== prePromotionPosition ||
                  profile.publicOccupation !== prePromotionOccupation)
            );
          }
        );
        const promotedSalary = civilianIncome(state, 'active')[0];
        if (!promotedSalary || promotedSalary.amount === firstSalary.amount) {
          throw new Error('职业晋升后工资金额没有同步变化。');
        }
        if (civilianIncome(state, 'active').length !== 1) {
          throw new Error('职业晋升后出现多条有效市民工资。');
        }
        checks.push('正式晋升同步职位与工资，且未产生重复有效工资');

        state = await runUntil(
          state,
          'change_employer',
          [
            '我利用休息时间向香港电话公司询问一份正式客户服务职位，先确认工作地点、职责和月薪，不隐瞒现职。',
            '我参加面试并取得正式书面录用条件；现在只核对新雇主、新岗位、工作地点、月薪和到职日期。',
            '我接受香港电话公司的正式录用，并依程序向九龙巴士辞职、完成交接。新工作今天正式生效；请结束旧雇佣，更新市民职业档案为新雇主，并确保只有新工作的固定月薪处于 active。',
            '我到香港电话公司完成第一天报到，确认新部门、工作关系、工资和手头事务已经生效。'
          ],
          (candidate) => {
            const profile = civilianProfile(candidate);
            return Boolean(
              profile?.employerOrganizationId &&
                profile.employerOrganizationId !== firstEmployerId &&
                civilianIncome(candidate, 'active').length === 1
            );
          }
        );
        const secondEmployerId = civilianProfile(state)?.employerOrganizationId;
        if (!secondEmployerId || !state.organizations[secondEmployerId]) {
          throw new Error('换工作后新雇主没有形成可解析的机构。');
        }
        if (
          projectLivelihoodContext(state).primaryOrganization?.organizationId !==
          secondEmployerId
        ) {
          throw new Error('换工作后营生面板仍指向旧雇主。');
        }
        checks.push('换工作结束旧雇佣并切换新雇主、工资及面板投影');

        state = await turn(
          state,
          '我在新岗位正常工作两天，处理客户、同事和部门安排；让公司整体方向与落到我手上的具体事务保持区分。',
          'ordinary_new_employer_work'
        );
        const resignedState = await runUntil(
          state,
          'resignation',
          [
            '我正式递交辞职信，和主管确认最后工作日、交接和工资结算；现在先完成程序。',
            '最后工作日和交接现已完成，我正式离职并暂时无业。请更新市民职业档案、结束雇主关系并停止固定工资，不要只写正文。',
            '我向家人说明目前已经没有固定雇主和固定月薪，接下来先休息并寻找机会。'
          ],
          (candidate) =>
            civilianProfile(candidate)?.employmentStatusId === 'unemployed' &&
            !civilianProfile(candidate)?.employerOrganizationId &&
            civilianIncome(candidate, 'active').length === 0
        );
        if (
          projectLivelihoodContext(resignedState).primaryOrganization !==
          undefined
        ) {
          throw new Error('离职后营生面板仍保留原主要雇主。');
        }
        checks.push('正式离职清除主要雇主并停止市民固定工资');

        let selfEmployed = await open(
          createSetup(
            '何国荣',
            'self_employed_merchant',
            '玩家经营一间小型街坊店铺，从普通开门营业开始；生成供货、熟客或伙计关系，但不要把他写成大型企业家。'
          )
        );
        selfEmployed = await turn(
          selfEmployed,
          '我照常开店一天，处理供货、熟客和账目，确认当前自营收入性质和经营关系。',
          'self_employed_ordinary'
        );
        const employedAfterSelfEmployment = await runUntil(
          selfEmployed,
          'self_employed_to_employee',
          [
            '我决定停止自营，先和房东、供货商及伙计商量结业和交接，同时向一家现有大型机构申请正式工作。',
            '店铺已经完成结业清算；我也取得一份正式受雇职位。请结束自营关系与收入，更新市民职业档案为受雇状态，并只保留新工作的有效固定工资。',
            '我到新雇主完成第一天报到，确认岗位、工作地点、工作关系和工资已生效。'
          ],
          (candidate) =>
            civilianProfile(candidate)?.employmentStatusId !==
              'self_employed' &&
            Boolean(civilianProfile(candidate)?.employerOrganizationId) &&
            civilianIncome(candidate, 'active').length === 1
        );
        if (
          projectLivelihoodContext(employedAfterSelfEmployment)
            .primaryOrganization?.organizationId !==
          civilianProfile(employedAfterSelfEmployment)?.employerOrganizationId
        ) {
          throw new Error('自营转受雇后营生面板没有切换至新雇主。');
        }
        checks.push('自营者可结束经营并转为正式受雇，收入与面板同步切换');

        const generatedAt = new Date().toISOString();
        const statusCounts = audits.reduce<Record<string, number>>(
          (counts, audit) => {
            const key =
              audit.status === null ? 'network_error' : String(audit.status);
            counts[key] = (counts[key] ?? 0) + 1;
            return counts;
          },
          {}
        );
        const organizationTrackObserved = snapshots.some(
          (snapshot) => snapshot.employerTrackCount > 0
        );
        const matterObserved = snapshots.some(
          (snapshot) => snapshot.livelihoodMatterCount > 0
        );
        const relationObserved = snapshots.some(
          (snapshot) => snapshot.workRelationCount > 0
        );
        if (!matterObserved) {
          throw new Error('多回合过程中没有形成任何营生事项。');
        }
        if (!relationObserved) {
          throw new Error('多回合过程中没有形成任何职业关系人物。');
        }
        if (!organizationTrackObserved) {
          throw new Error('多回合过程中没有形成雇主机构演化轨道。');
        }
        checks.push('营生事项、职业关系和雇主机构演化轨道均在真实回合中出现');

        const selectedProfile = settings.apiProfiles.find(
          (profile) => profile.id === settings.mainNarrator?.apiProfileId
        );
        const report = {
          test: 'civilian-livelihood-lifecycle-real-api',
          generatedAt,
          route: {
            profileName: selectedProfile?.name,
            provider: selectedProfile?.providerLabel,
            interfaceType: selectedProfile?.interfaceType,
            model: settings.mainNarrator?.model
          },
          credentialSafety: {
            settingsLoadedInMemory: true,
            apiKeysRecorded: false,
            promptsRecorded: false,
            narrativesRecorded: false,
            rawResponsesRecorded: false,
            runtimeStatesRecorded: false
          },
          summary: {
            ordinaryTurnCount,
            openingCount: 2,
            httpRequestCount: audits.length,
            statusCounts,
            organizationTrackObserved,
            matterObserved,
            relationObserved
          },
          checks,
          snapshots,
          http: audits
        };
        await mkdir(outputDirectory, { recursive: true });
        const reportPath = path.join(
          outputDirectory,
          `lifecycle-${generatedAt.replace(/[:.]/g, '-')}.json`
        );
        await writeFile(
          reportPath,
          `${JSON.stringify(report, null, 2)}\n`,
          'utf8'
        );
        await writeFile(
          path.join(outputDirectory, 'latest.json'),
          `${JSON.stringify(report, null, 2)}\n`,
          'utf8'
        );
        console.log(`[livelihood-lifecycle-real] report: ${reportPath}`);

        expect(ordinaryTurnCount).toBeGreaterThanOrEqual(15);
        expect(checks.length).toBeGreaterThanOrEqual(7);
      },
      10_800_000
    );
  }
);
