import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYER_POLICE_SALARY_CASHFLOW_ID } from '../../src/domain/finance/playerSalaryCashflow';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { runOpening } from '../../src/domain/opening/runOpening';
import { importTavernPreset } from '../../src/domain/prompts/tavernPreset';
import type { OpeningSetup } from '../../src/domain/runtime/initialState';
import type {
  CurrentIdentity,
  FinanceCashflowItem,
  PlayerIdentityTransitionKind,
  RuntimeState,
  TurnApiRoute
} from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings, TavernManagementSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import { createWritebackRepairClientFromSettings } from '../../src/domain/writeback/createWritebackRepairClientFromSettings';

const shouldRun = process.env.COPV2_RUN_INCOME_IDENTITY_TAVERN_REAL_API === '1';
const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const requestTimeoutMs = Math.max(30_000, Number(process.env.COPV2_INCOME_TEST_TIMEOUT_MS ?? 180_000));
const turnDelayMs = Math.max(0, Number(process.env.COPV2_INCOME_TEST_DELAY_MS ?? 1200));
const maxAttempts = Math.min(4, Math.max(2, Number(process.env.COPV2_INCOME_TEST_MAX_ATTEMPTS ?? 3)));
const forceFallback = process.env.COPV2_INCOME_TEST_FORCE_FALLBACK === '1';

interface HttpAuditEntry {
  route: TurnApiRoute;
  status: number | null;
  responseMs: number;
  error?: string;
}

interface IncomeSnapshot {
  itemId: string;
  title: string;
  amount: number;
  account: string;
  identityBinding?: CurrentIdentity;
  status: string;
}

interface ScenarioResult {
  scenario: string;
  passed: boolean;
  completedTurns: number;
  finalIdentity?: CurrentIdentity;
  transitionKinds: PlayerIdentityTransitionKind[];
  income: IncomeSnapshot[];
  checks: string[];
  error?: string;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 600);
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
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
    personality: '谨慎、重承诺，遇到人生选择会先确认条件再明确表态。',
    appearance: '二十五岁香港男子，衣着朴素整洁，神情清醒。'
  };
}

function incomeSnapshot(state: RuntimeState): IncomeSnapshot[] {
  return Object.values(state.finance.cashflows)
    .filter((item) => item.direction === 'income')
    .map((item) => ({
      itemId: item.itemId,
      title: item.title,
      amount: item.amount,
      account: item.account,
      identityBinding: item.identityBinding,
      status: item.status
    }))
    .sort((left, right) => left.itemId.localeCompare(right.itemId));
}

function findBoundIncome(
  state: RuntimeState,
  identity: CurrentIdentity,
  status: FinanceCashflowItem['status']
): FinanceCashflowItem | undefined {
  return Object.values(state.finance.cashflows).find(
    (item) => item.direction === 'income' && item.identityBinding === identity && item.status === status
  );
}

function hasTransitionSince(
  state: RuntimeState,
  historyLength: number,
  kind: PlayerIdentityTransitionKind,
  toIdentity: CurrentIdentity
): boolean {
  return state.player.identityHistory
    .slice(historyLength)
    .some((item) => item.kind === kind && item.toIdentity === toIdentity);
}

function tavernSettingsWithLiveMarker(settings: AiSettings): TavernManagementSettings {
  const markerPreset = importTavernPreset(JSON.stringify({
    name: '真实 API 酒馆注入验收',
    prompts: [{
      identifier: 'main',
      name: '注入暗号',
      role: 'system',
      system_prompt: true,
      content: '这是酒馆预设的真实注入验收：本次正文第一段必须自然且完整写出短语「铜绿雨燕」，不要解释测试。'
    }],
    prompt_order: [{
      character_id: 100001,
      order: [{ identifier: 'main', enabled: true }]
    }]
  }), 'live-tavern-preset.json', '2026-07-20T12:00:00.000Z').entry;
  return {
    ...settings.tavern,
    enabled: true,
    activePresetId: markerPreset.id,
    entries: [markerPreset]
  };
}

function createConfiguredFallback(settings: AiSettings): AiSettings | null {
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

describe.skipIf(!shouldRun)('income, identity restoration and tavern preset through real APIs', () => {
  it('verifies civilian, police and triad income across real identity transitions', async () => {
    const importedSettings = importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'));
    const fallbackSettings = createConfiguredFallback(importedSettings);
    let activeSettings = forceFallback && fallbackSettings ? fallbackSettings : importedSettings;
    let fallbackActivated = forceFallback && Boolean(fallbackSettings);
    const audits: HttpAuditEntry[] = [];
    const scenarios: ScenarioResult[] = [];

    function auditedFetch(route: TurnApiRoute) {
      return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const startedAt = performance.now();
        try {
          const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
            (signal): signal is AbortSignal => Boolean(signal)
          );
          const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
          audits.push({ route, status: response.status, responseMs: Math.round(performance.now() - startedAt) });
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
        narrator: createNarratorClientFromSettings(activeSettings, auditedFetch('mainNarrator')),
        writebackRepair: createWritebackRepairClientFromSettings(
          activeSettings,
          auditedFetch('writebackRepair')
        ) ?? undefined
      };
    }

    async function retry<T>(label: string, operation: () => Promise<T>): Promise<T> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const auditStart = audits.length;
        try {
          return await operation();
        } catch (error) {
          lastError = error;
          console.log(`[income-identity-real] ${label} attempt=${attempt} error=${safeError(error)}`);
          const mainRouteUnavailable = audits.slice(auditStart).some(
            (entry) => entry.route === 'mainNarrator' && (entry.status === null || entry.status >= 500)
          );
          if (!fallbackActivated && fallbackSettings && mainRouteUnavailable) {
            activeSettings = fallbackSettings;
            fallbackActivated = true;
            console.log(`[income-identity-real] ${label} switched to configured background-evolution route`);
          }
          if (attempt < maxAttempts) await sleep(Math.max(turnDelayMs, 1500));
        }
      }
      throw lastError;
    }

    async function open(
      setup: OpeningSetup,
      tavernSettings: TavernManagementSettings = activeSettings.tavern
    ): Promise<RuntimeState> {
      const state = await retry(`opening:${setup.playerName}`, async () => runOpening({
        setup,
        narrator: createClients().narrator,
        narrativeLengthLevel: 'compact',
        promptSettings: activeSettings.prompts,
        tavernSettings
      }));
      console.log(`[income-identity-real] opening:${setup.playerName} identity=${state.player.currentIdentity}`);
      await sleep(turnDelayMs);
      return state;
    }

    async function turn(state: RuntimeState, input: string, label: string): Promise<RuntimeState> {
      const next = await retry(label, async () => runPlayerTurn({
        state,
        playerInput: input,
        ...createClients(),
        gameSettings: { ...activeSettings.game, narrativeLengthLevel: 'compact' },
        promptSettings: activeSettings.prompts,
        tavernSettings: activeSettings.tavern
      }));
      console.log(`[income-identity-real] ${label} turn=${next.turnCounter} identity=${next.player.currentIdentity}`);
      await sleep(turnDelayMs);
      return next;
    }

    async function runActionsUntil(
      initialState: RuntimeState,
      label: string,
      actions: string[],
      accepted: (state: RuntimeState) => boolean
    ): Promise<RuntimeState> {
      let state = structuredClone(initialState);
      for (let index = 0; index < actions.length; index += 1) {
        state = await turn(state, actions[index], `${label}:${index + 1}`);
        if (accepted(state)) return state;
      }
      throw new Error(`${label} did not reach the expected durable state.`);
    }

    async function scenario(name: string, body: () => Promise<{ state: RuntimeState; checks: string[] }>) {
      try {
        const { state, checks } = await body();
        scenarios.push({
          scenario: name,
          passed: true,
          completedTurns: state.turnCounter,
          finalIdentity: state.player.currentIdentity,
          transitionKinds: state.player.identityHistory.map((item) => item.kind),
          income: incomeSnapshot(state),
          checks
        });
      } catch (error) {
        scenarios.push({
          scenario: name,
          passed: false,
          completedTurns: 0,
          transitionKinds: [],
          income: [],
          checks: [],
          error: safeError(error)
        });
      }
    }

    await scenario('tavern_preset_live_injection', async () => {
      const state = await open({
        ...commonSetup('civilian', '苏文朗'),
        civilianProfileId: 'unemployed',
        openingNote: '从一个普通清晨开始，不要让玩家立即加入任何组织。'
      }, tavernSettingsWithLiveMarker(activeSettings));
      const markerObserved = state.storyLog.at(-1)?.text.includes('铜绿雨燕') === true;
      if (!markerObserved) throw new Error('The real model response did not contain the tavern preset marker.');
      return { state, checks: ['酒馆预设暗号出现在真实 API 正文'] };
    });

    let employedCivilian: RuntimeState | undefined;
    await scenario('civilian_finds_stable_job', async () => {
      let state = await open({
        ...commonSetup('civilian', '梁志文'),
        civilianProfileId: 'unemployed',
        openingNote: '玩家目前无业，准备寻找一份符合 1984 年香港背景的稳定受雇工作。'
      });
      if (findBoundIncome(state, 'civilian', 'active')) {
        throw new Error('Unemployed opening incorrectly created active civilian recurring income.');
      }
      state = await runActionsUntil(state, 'civilian_job', [
        '我查看招聘广告，去九龙巴士公司询问有固定雇主、固定岗位和按月发薪的售票员空缺，先确认工时、月薪和报到要求。',
        '我按约参加面试并提交所需资料；如果对方愿意录用，请明确约定正式岗位、每月工资、发薪方式和到职日期。',
        '我接受这份长期受雇工作，完成录用手续并按通知正式到职。若固定雇佣已经成立，请写入一条绑定 civilian、可持续按月结算的固定工资，不要只写在正文。',
        '时间推进到正式上班日。我完成第一班工作并确认雇佣关系与月薪已经生效；请使用稳定 itemId 保存这份市民工资。'
      ], (next) => Boolean(findBoundIncome(next, 'civilian', 'active')));
      employedCivilian = state;
      return { state, checks: ['无业开局没有伪造工资', '真实剧情找到固定工作并建立 civilian 月收入'] };
    });

    await scenario('civilian_job_to_police', async () => {
      if (!employedCivilian) throw new Error('Stable civilian job scenario failed.');
      const startHistory = employedCivilian.player.identityHistory.length;
      const state = await runActionsUntil(employedCivilian, 'civilian_to_police', [
        '我在不隐瞒现有工作的前提下到警队招募处询问正式入职流程，并提交申请。',
        '我完成体检、背景审查、面试和所需训练；如果仍未完成就如实推进，不要提前切换身份。',
        '时间推进到获正式任命的报到日。我接受任命、宣誓、领取警号并正式成为基层警员；事实成立时请写 join 身份补丁。',
        '我完成警署报到和岗位交接，确认原市民雇佣已经暂停，开始领取警队月薪。'
      ], (next) => next.player.currentIdentity === 'police' && hasTransitionSince(next, startHistory, 'join', 'police'));
      if (!findBoundIncome(state, 'civilian', 'paused')) throw new Error('Civilian income was not paused after joining police.');
      const policeSalary = state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID];
      if (!policeSalary || policeSalary.status !== 'active') throw new Error('Police salary is not active after civilian joined police.');
      return { state, checks: ['市民工资暂停', '警队工资建立并生效'] };
    });

    await scenario('civilian_job_to_triad', async () => {
      if (!employedCivilian) throw new Error('Stable civilian job scenario failed.');
      const startHistory = employedCivilian.player.identityHistory.length;
      const state = await runActionsUntil(employedCivilian, 'civilian_to_triad', [
        '我听旧友把固定加入社团的字头、活动区域、上线、职务与风险说清楚，目前只了解条件。',
        '我确认对方提供的是正式基层成员身份，而不是一次跑腿，并要求明确固定职责和是否有稳定月例。',
        '在条件和义务已经确认后，我明确接受正式加入，完成必要仪式并成为有固定上线的基层成员；事实成立时请写 join 身份补丁。',
        '我以社团成员身份正式向上线报到，原市民工作暂停；若当前固定职责确有月例，请建立绑定 gang_member 的固定收入。'
      ], (next) => next.player.currentIdentity === 'gang_member' && hasTransitionSince(next, startHistory, 'join', 'gang_member'));
      if (!findBoundIncome(state, 'civilian', 'paused')) throw new Error('Civilian income was not paused after joining triad.');
      return { state, checks: ['市民工资暂停', '正式切换为社团身份'] };
    });

    await scenario('police_cover_to_triad_and_back', async () => {
      let state = await open({
        ...commonSetup('police', '陈启明'),
        policeNumber: '7316',
        policePostingId: 'mong_kok_police_station',
        lawIdentity: {
          rank: 'Senior Police Constable（高级警员）',
          department: 'Uniform Branch（军装巡逻）',
          stationOrPost: 'Mong Kok Police Station（旺角警署）',
          assignmentSummary: 'Street Patrol Officer（街面巡逻）'
        }
      });
      const salary = state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID];
      if (!salary || salary.status !== 'active') throw new Error('Police opening salary is not active.');
      const enterHistory = state.player.identityHistory.length;
      state = await runActionsUntil(state, 'police_cover_enter', [
        '直属上级已正式批准我执行社团卧底任务，并完成保密简报、联络和撤离安排。今天我按批准方案以基层社团成员公开身份进入目标；请写 cover_enter，把真实警察身份保存为秘密事实。',
        '我以已批准的社团公开身份向上线报到；如果公开身份尚未原子切换，请现在完成 cover_enter。'
      ], (next) => next.player.currentIdentity === 'gang_member' && hasTransitionSince(next, enterHistory, 'cover_enter', 'gang_member'));
      if (state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.status !== 'active') {
        throw new Error('Real police salary stopped during police-origin triad cover.');
      }
      const exitHistory = state.player.identityHistory.length;
      state = await runActionsUntil(state, 'police_cover_exit', [
        '卧底任务目标已经完成，直属上级正式下令结束掩护并安全撤离。我回警署完成复职手续；请写 cover_exit，从当前社团公开身份恢复原警察身份和原警务档案。',
        '撤离和复职手续已经完成。我恢复原警号、警衔和单位；如果尚未切回，请现在完成 cover_exit。'
      ], (next) => next.player.currentIdentity === 'police' && hasTransitionSince(next, exitHistory, 'cover_exit', 'police'));
      if (state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.status !== 'active') {
        throw new Error('Police salary did not remain active after cover exit.');
      }
      return { state, checks: ['警队工资开局生效', '卧底社团期间警薪继续', 'cover_exit 恢复原警察身份与工资'] };
    });

    await scenario('triad_cover_to_police_and_back', async () => {
      let state = await open({
        ...commonSetup('gang_member', '林志森'),
        triadSocietyId: 'org_wo_shing_wo',
        triadTerritoryPlaceId: 'place_temple_street_night_market',
        triadRankId: 'district_cadre',
        triadRoleId: 'district_affairs_coordinator',
        openingNote: '玩家承担长期区域协调职责，若事实合理可有明确稳定月例，但不要因为社团职级本身虚构工资。'
      });
      const triadIncome = findBoundIncome(state, 'gang_member', 'active');
      if (!triadIncome) throw new Error('Eligible triad opening did not create stable role income.');
      const enterHistory = state.player.identityHistory.length;
      state = await runActionsUntil(state, 'triad_cover_enter', [
        '固定上线已经正式安排我以公开警察身份进入警队担任内线，报名、审查、训练和任命程序都已完成。今天我领取警号并报到；请写 cover_enter，把真实社团效忠保存为秘密事实。',
        '我以获任命的基层警员公开身份完成报到；如果身份尚未原子切换，请现在完成 cover_enter。'
      ], (next) => next.player.currentIdentity === 'police' && hasTransitionSince(next, enterHistory, 'cover_enter', 'police'));
      if (!findBoundIncome(state, 'gang_member', 'active')) throw new Error('Real triad income stopped during police cover.');
      if (state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.status !== 'active') {
        throw new Error('Police cover salary was not established.');
      }
      const exitHistory = state.player.identityHistory.length;
      state = await runActionsUntil(state, 'triad_cover_exit', [
        '这项警队内线任务已经由原上线正式结束，我完成安全脱离并回到原社团岗位；请写 cover_exit，从当前警察公开身份恢复原社团身份和原职务。',
        '脱离和回归手续已经完成。我恢复原社团身份、上线和区域职责；如果尚未切回，请现在完成 cover_exit。'
      ], (next) => next.player.currentIdentity === 'gang_member' && hasTransitionSince(next, exitHistory, 'cover_exit', 'gang_member'));
      if (!findBoundIncome(state, 'gang_member', 'active')) throw new Error('Triad income did not remain active after cover exit.');
      if (state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.status !== 'paused') {
        throw new Error('Police cover salary was not paused after returning to triad.');
      }
      return { state, checks: ['社团固定月例开局生效', '警察掩护期间两份真实收入边界正确', 'cover_exit 恢复社团收入并暂停警察工资'] };
    });

    const generatedAt = new Date().toISOString();
    const statusCounts = audits.reduce<Record<string, number>>((counts, audit) => {
      const key = audit.status === null ? 'network_error' : String(audit.status);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    const report = {
      test: 'income-identity-tavern-real-api-acceptance',
      generatedAt,
      settingsFile: path.basename(settingsPath),
      credentialSafety: {
        settingsLoadedInMemory: true,
        keyValuesRecorded: false,
        requestBodiesRecorded: false,
        rawModelResponsesRecorded: false,
        runtimeStatesRecorded: false
      },
      configuredRoute: {
        interfaceType: importedSettings.apiProfiles.find(
          (profile) => profile.id === importedSettings.mainNarrator?.apiProfileId
        )?.interfaceType,
        model: importedSettings.mainNarrator?.model
      },
      effectiveRoute: {
        interfaceType: activeSettings.apiProfiles.find(
          (profile) => profile.id === activeSettings.mainNarrator?.apiProfileId
        )?.interfaceType,
        model: activeSettings.mainNarrator?.model,
        fallbackActivated
      },
      summary: {
        scenarioCount: scenarios.length,
        passedScenarioCount: scenarios.filter((item) => item.passed).length,
        allScenariosPassed: scenarios.every((item) => item.passed),
        httpRequestCount: audits.length,
        statusCounts
      },
      scenarios,
      http: audits
    };
    const outputDirectory = path.resolve('output', 'income-identity-real-api');
    await mkdir(outputDirectory, { recursive: true });
    const reportPath = path.join(outputDirectory, `income-identity-${generatedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[income-identity-real] report: ${reportPath}`);

    expect(scenarios).toHaveLength(6);
    expect(scenarios.every((item) => item.passed), JSON.stringify(scenarios, null, 2)).toBe(true);
  }, 3_600_000);
});
