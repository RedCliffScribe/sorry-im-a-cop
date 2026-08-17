import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectLivelihoodContext } from '../../src/domain/livelihood/livelihoodProjector';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { runOpening } from '../../src/domain/opening/runOpening';
import { createInitialRuntimeState, type OpeningSetup } from '../../src/domain/runtime/initialState';
import type { RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import { getCivilianOpeningProfile } from '../../src/domain/worldpack/hk1980sOpening';

const shouldRun = process.env.COPV2_RUN_CIVILIAN_LIVELIHOOD_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const profileName = process.env.COPV2_CIVILIAN_LIVELIHOOD_PROFILE_NAME ?? 'ggchan';
const modelName =
  process.env.COPV2_CIVILIAN_LIVELIHOOD_MODEL ?? 'gemini-3.1-pro-preview';
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_CIVILIAN_LIVELIHOOD_TIMEOUT_MS ?? 600_000)
);
const maxAttempts = Math.min(
  5,
  Math.max(
    1,
    Number(process.env.COPV2_CIVILIAN_LIVELIHOOD_MAX_ATTEMPTS ?? 3)
  )
);
const retryDelayMs = Math.max(
  0,
  Number(process.env.COPV2_CIVILIAN_LIVELIHOOD_RETRY_DELAY_MS ?? 4_000)
);
const outputDirectory =
  process.env.COPV2_CIVILIAN_LIVELIHOOD_OUTPUT_DIR ??
  path.join('output', 'civilian-livelihood-real-api');

interface HttpAuditEntry {
  route: TurnApiRoute;
  status: number | null;
  responseMs: number;
  error?: string;
}

interface ScenarioDefinition {
  id: string;
  label: string;
  playerName: string;
  profileId: string;
  openingNote: string;
  customProfile?: OpeningSetup['civilianCustomProfile'];
}

interface ScenarioReport {
  id: string;
  label: string;
  passed: boolean;
  attempts: number;
  responseMs?: number;
  occupation?: string;
  employmentStatus?: string;
  workplacePlaceId?: string;
  employerOrganizationId?: string;
  employerResolved?: boolean;
  workRelations?: Array<{
    actorId: string;
    name: string;
    publicIdentity: string;
  }>;
  livelihoodMatters?: Array<{
    id: string;
    title: string;
    source: string;
  }>;
  activeCivilianIncomeCount?: number;
  organizationTrackCount?: number;
  narrativeCharacters?: number;
  checks: string[];
  warnings: string[];
  error?: string;
}

const allScenarios: ScenarioDefinition[] = [
  {
    id: 'hospital_nurse',
    label: '大型医院护士',
    playerName: '林美仪',
    profileId: 'hospital_nurse',
    openingNote:
      '从一次普通医院轮班开始，让具体同事和一件确实落到玩家手上的护理事务自然出现；不要强行引入警队或社团。'
  },
  {
    id: 'news_production_staff',
    label: '报馆／新闻记者',
    playerName: '陈志明',
    profileId: 'news_production_staff',
    openingNote:
      '从一次普通新闻工作日开始，让编辑、摄影或消息来源中的实际职业联系人出现；不要把机构方向直接等同于玩家任务。'
  },
  {
    id: 'tea_restaurant_clerk',
    label: '茶餐厅伙计',
    playerName: '黄家强',
    profileId: 'tea_restaurant_clerk',
    openingNote:
      '从茶餐厅一次普通轮班开始，通过老板娘、同班伙计、供货商或熟客形成真实职业关系和手头事务。'
  },
  {
    id: 'factory_worker',
    label: '工厂职员',
    playerName: '李淑芬',
    profileId: 'factory_worker',
    openingNote:
      '从工厂普通轮班开始，让管工、工友、货运或包装线中的稳定工作关系和具体事务自然出现。'
  },
  {
    id: 'self_employed_merchant',
    label: '自营商户',
    playerName: '何国荣',
    profileId: 'self_employed_merchant',
    openingNote:
      '从店铺开门营业开始，让供货商、熟客、伙计或房东中的真实关系出现；玩家只经营一间小店。'
  },
  {
    id: 'freelance_reporter_photographer',
    label: '自由职业者',
    playerName: '苏静雯',
    profileId: 'freelance_reporter_photographer',
    openingNote:
      '从一次自由采访或供稿安排开始，让编辑、摄影合作方、消息来源或委托人中的稳定职业关系出现。'
  },
  {
    id: 'unemployed',
    label: '无业市民',
    playerName: '周德华',
    profileId: 'unemployed',
    openingNote:
      '从一个没有固定班要上的普通早晨开始，让旧同事、散工介绍人或求职联系人自然出现；不得生成固定雇主或固定月薪。'
  },
  {
    id: 'custom_occupation',
    label: '自定义职业',
    playerName: '梁晓晴',
    profileId: 'custom_occupation',
    customProfile: {
      publicOccupation: '九龙独立婚礼花艺师',
      workplacePlaceId: 'place_jordan_road',
      workplaceLabel: '佐敦一间合租花艺工作室',
      employerName: '晴艺花房',
      communitySummary:
        '长期接触花材供货商、酒店宴会部、婚礼摄影师和临时助手。'
    },
    openingNote:
      '严格保留玩家填写的职业与工作地点，从一次普通订单准备开始；不要把自定义职业改写成预设职业。'
  }
];
const scenarioFilter = new Set(
  (process.env.COPV2_CIVILIAN_LIVELIHOOD_SCENARIOS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const scenarios =
  scenarioFilter.size > 0
    ? allScenarios.filter((scenario) => scenarioFilter.has(scenario.id))
    : allScenarios;

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

function createSetup(scenario: ScenarioDefinition): OpeningSetup {
  return {
    playerName: scenario.playerName,
    englishName: '',
    gender: scenario.id === 'hospital_nurse' || scenario.id === 'factory_worker'
      || scenario.id === 'freelance_reporter_photographer'
      || scenario.id === 'custom_occupation'
      ? 'female'
      : 'male',
    age: 25,
    currentIdentity: 'civilian',
    civilianProfileId: scenario.profileId,
    civilianCustomProfile: scenario.customProfile,
    startTime: { year: 1984, month: 12, day: 27, hour: 8, minute: 30 },
    openingPressure: 'routine',
    cantoneseFlavor: 'medium',
    personality: '做事认真，重视具体条件和现实生活，不会轻易替别人作决定。',
    appearance: '二十五岁香港市民，衣着符合自己的职业与当日工作环境。',
    openingNote: scenario.openingNote
  };
}

function selectSettings(imported: AiSettings): AiSettings {
  const targetName = profileName.trim().toLocaleLowerCase();
  const profile =
    imported.apiProfiles.find(
      (candidate) => candidate.name.trim().toLocaleLowerCase() === targetName
    ) ??
    imported.apiProfiles.find((candidate) =>
      candidate.name.trim().toLocaleLowerCase().includes(targetName)
    );
  if (!profile) {
    throw new Error(`找不到名为“${profileName}”的本地 API 档案。`);
  }
  return {
    ...imported,
    mainNarrator: {
      apiProfileId: profile.id,
      model: modelName,
      maxTokens: Math.max(8_192, imported.mainNarrator?.maxTokens ?? 8_192),
      temperature: 0.35
    }
  };
}

function auditFetch(audits: HttpAuditEntry[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
        route: 'mainNarrator',
        status: response.status,
        responseMs: Math.round(performance.now() - startedAt)
      });
      return response;
    } catch (error) {
      audits.push({
        route: 'mainNarrator',
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

function validateScenario(
  scenario: ScenarioDefinition,
  setup: OpeningSetup,
  state: RuntimeState
): Omit<ScenarioReport, 'id' | 'label' | 'passed' | 'attempts' | 'responseMs'> {
  const playerActor = state.actors[state.player.actorId];
  const profile = playerActor?.roleProfiles.civilian;
  const initialState = createInitialRuntimeState(setup);
  const expectedProfile =
    initialState.actors[initialState.player.actorId]?.roleProfiles.civilian;
  const expectedOpeningProfile = getCivilianOpeningProfile(
    scenario.profileId,
    scenario.customProfile
  );
  if (state.player.currentIdentity !== 'civilian') {
    throw new Error('开局后当前身份不是 civilian。');
  }
  if (!playerActor || !profile || !expectedProfile) {
    throw new Error('开局后缺少玩家 CivilianRoleProfile。');
  }
  if (playerActor.roleProfiles.police || playerActor.roleProfiles.triad) {
    throw new Error('市民玩家角色被警察或社团 RoleProfile 污染。');
  }
  if (profile.publicOccupation !== expectedProfile.publicOccupation) {
    throw new Error(
      `职业锚点发生漂移：expected=${expectedProfile.publicOccupation} actual=${profile.publicOccupation}`
    );
  }
  if (profile.workplacePlaceId !== expectedProfile.workplacePlaceId) {
    throw new Error(
      `工作地点锚点发生漂移：expected=${expectedProfile.workplacePlaceId} actual=${profile.workplacePlaceId}`
    );
  }
  if (profile.employerOrganizationId !== expectedProfile.employerOrganizationId) {
    throw new Error('雇主 Organization ID 未保持开局结构化锚点。');
  }
  if (
    profile.employerOrganizationId &&
    !state.organizations[profile.employerOrganizationId]
  ) {
    throw new Error('CivilianRoleProfile 指向的雇主 Organization 未实例化。');
  }

  const projection = projectLivelihoodContext(state);
  if (!projection.available || !projection.roleProfile) {
    throw new Error('营生投影不可用。');
  }
  const relationActorIds = profile.livelihoodActorIds.filter(
    (actorId) => actorId !== state.player.actorId && Boolean(state.actors[actorId])
  );
  if (relationActorIds.length === 0 || projection.workRelations.length === 0) {
    throw new Error('本次开局没有形成至少一名稳定职业关系人物。');
  }
  const livelihoodMatters = Object.values(state.dynamicEvents.currentMatters).filter(
    (matter) =>
      matter.matterKind === 'livelihood' &&
      matter.visibility !== 'hidden' &&
      matter.status === 'active'
  );
  if (livelihoodMatters.length === 0 || projection.activeMatters.length === 0) {
    throw new Error('本次开局没有形成一项具体落到玩家手上的营生事务。');
  }

  const activeCivilianIncome = Object.values(state.finance.cashflows).filter(
    (cashflow) =>
      cashflow.direction === 'income' &&
      cashflow.status === 'active' &&
      cashflow.identityBinding === 'civilian'
  );
  if (scenario.profileId === 'unemployed' && activeCivilianIncome.length > 0) {
    throw new Error('无业开局错误生成了市民固定收入。');
  }
  if (
    expectedOpeningProfile.suggestedMonthlyIncome &&
    activeCivilianIncome.length === 0
  ) {
    throw new Error('具有固定收入基准的开局没有建立市民固定收入。');
  }

  const warnings: string[] = [];
  if (!profile.decisionScopeSummary) warnings.push('职业决定范围仍为空。');
  if (!profile.accessSummary) warnings.push('职业接触范围仍为空。');
  if (!profile.dutySummary) warnings.push('职业分工摘要仍为空。');
  const organizationTrackCount = profile.employerOrganizationId
    ? Object.values(state.backgroundEvolution.organizationTracks).filter(
        (track) => track.organizationId === profile.employerOrganizationId
      ).length
    : 0;
  if (profile.employerOrganizationId && organizationTrackCount === 0) {
    warnings.push('开局尚未生成雇主组织轨道；可由后续后台演化建立。');
  }

  return {
    occupation: profile.publicOccupation,
    employmentStatus: profile.employmentStatusId,
    workplacePlaceId: profile.workplacePlaceId,
    employerOrganizationId: profile.employerOrganizationId,
    employerResolved: profile.employerOrganizationId
      ? Boolean(state.organizations[profile.employerOrganizationId])
      : true,
    workRelations: projection.workRelations.map((relation) => ({
      actorId: relation.actorId,
      name: relation.name,
      publicIdentity: relation.publicIdentity
    })),
    livelihoodMatters: projection.activeMatters.map((matter) => ({
      id: matter.id,
      title: matter.title,
      source: matter.source
    })),
    activeCivilianIncomeCount: activeCivilianIncome.length,
    organizationTrackCount,
    narrativeCharacters: state.storyLog.at(-1)?.text.length ?? 0,
    checks: [
      'civilian 身份与 RoleProfile 隔离正常',
      '职业、地点和雇主结构化锚点保持不变',
      '至少一名稳定职业关系人物已写入',
      '至少一项 livelihood 事务已写入并可投影',
      '营生面板投影可用',
      scenario.profileId === 'unemployed'
        ? '无业开局未生成固定收入'
        : '固定收入规则与职业资料一致'
    ],
    warnings
  };
}

describe.skipIf(!shouldRun)('civilian livelihood openings through a real API', () => {
  it('accepts eight civilian livelihood shapes without identity contamination', async () => {
    const imported = importApiSettings(
      createDefaultAiSettings(),
      await readFile(settingsPath, 'utf8')
    );
    const settings = selectSettings(imported);
    const audits: HttpAuditEntry[] = [];
    const results: ScenarioReport[] = [];

    for (const [index, scenario] of scenarios.entries()) {
      const setup = createSetup(scenario);
      let lastError: unknown;
      let accepted: RuntimeState | undefined;
      let acceptedResponseMs: number | undefined;
      let attempts = 0;
      console.log(
        `[civilian-livelihood-real] ${index + 1}/${scenarios.length} start ${scenario.id}`
      );
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        attempts = attempt;
        const startedAt = Date.now();
        try {
          const state = await runOpening({
            setup,
            narrator: createNarratorClientFromSettings(
              settings,
              auditFetch(audits)
            ),
            narrativeLengthLevel: 'compact',
            promptSettings: settings.prompts
          });
          validateScenario(scenario, setup, state);
          accepted = state;
          acceptedResponseMs = Date.now() - startedAt;
          break;
        } catch (error) {
          lastError = error;
          console.log(
            `[civilian-livelihood-real] ${scenario.id} attempt=${attempt} error=${safeError(error)}`
          );
          if (attempt < maxAttempts) await sleep(retryDelayMs * attempt);
        }
      }

      if (accepted) {
        const details = validateScenario(scenario, setup, accepted);
        results.push({
          id: scenario.id,
          label: scenario.label,
          passed: true,
          attempts,
          responseMs: acceptedResponseMs,
          ...details
        });
        console.log(
          `[civilian-livelihood-real] ${scenario.id} passed attempts=${attempts} relations=${details.workRelations?.length ?? 0} matters=${details.livelihoodMatters?.length ?? 0}`
        );
      } else {
        results.push({
          id: scenario.id,
          label: scenario.label,
          passed: false,
          attempts,
          checks: [],
          warnings: [],
          error: safeError(lastError)
        });
        console.log(`[civilian-livelihood-real] ${scenario.id} failed`);
      }
      await sleep(1_000);
    }

    const statusCounts = audits.reduce<Record<string, number>>((counts, audit) => {
      const key = audit.status === null ? 'network_error' : String(audit.status);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    const report = {
      generatedAt: new Date().toISOString(),
      route: {
        profileName,
        model: modelName
      },
      summary: {
        scenarios: results.length,
        passed: results.filter((result) => result.passed).length,
        failed: results.filter((result) => !result.passed).length,
        requests: audits.length,
        statusCounts
      },
      scenarios: results,
      httpAudit: audits
    };
    await mkdir(outputDirectory, { recursive: true });
    const reportPath = path.join(outputDirectory, 'latest.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`[civilian-livelihood-real] report=${reportPath}`);

    expect(
      results.filter((result) => !result.passed),
      JSON.stringify(results.filter((result) => !result.passed), null, 2)
    ).toHaveLength(0);
  });
});
