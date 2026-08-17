import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { parseRuntimeSaveRecord } from '../../src/domain/persistence/saveArchiveSchema';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type { GameTime, RuntimeState } from '../../src/domain/runtime/types';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import { refreshWeatherIfExpired } from '../../src/domain/weather/weather';

const shouldRun = process.env.COPV2_RUN_WEATHER_REAL_API === '1';
const settingsPath =
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
  'sorry-im-a-cop-v2-api-settings.json';
const outputPath = path.resolve(
  process.env.COPV2_WEATHER_REAL_API_OUTPUT_PATH ??
    path.join('output', 'weather-real-api', 'latest.json')
);
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_WEATHER_REQUEST_TIMEOUT_MS ?? 900_000)
);

interface RouteChoice {
  id: 'grok' | 'gemini' | 'mimo' | 'mimo-fallback';
  profileId: string;
  profileName: string;
  model: string;
}

interface Scenario {
  id: string;
  routeId: RouteChoice['id'];
  title: string;
  playerInput: string;
}

const routes: RouteChoice[] = [
  {
    id: 'grok',
    profileId: 'api_nanaaa',
    profileName: 'nanaaa',
    model: 'grok-chat-fast'
  },
  {
    id: 'gemini',
    profileId: 'api_yuqing',
    profileName: 'yuqing',
    model: '企业cli-gemini-3-flash-preview'
  },
  {
    id: 'mimo',
    profileId: 'api_xiaomi_mimo',
    profileName: 'xiaomi-mimo',
    model: 'mimo-v2.5'
  },
  {
    id: 'mimo-fallback',
    profileId: 'api_tianbohe',
    profileName: 'tianbohe',
    model: 'ocz-mimo-v2.5-free'
  }
];

const scenarioSeeds = [
  ['outdoor_patrol', '沿着弥敦道步行巡逻十分钟，留意被细雨打湿的路面和行人。'],
  ['slow_drive', '驾驶巡逻车低速经过湿滑路口十五分钟，保持安全车距。'],
  ['covered_arcade', '从有遮棚的骑楼下步行到下一个街口，观察店铺是否正常营业。'],
  ['harbour_check', '在码头有遮挡的位置核对一轮泊位编号，不离开现有区域。'],
  ['traffic_observation', '站在路边安全位置观察十分钟车流，记录拥堵方向。'],
  ['short_follow', '隔着一段安全距离跟随目标一个街口，不奔跑也不接触。'],
  ['bus_stop', '到附近巴士站查看一次路线牌，然后返回原位。'],
  ['shop_visit', '进入街角店铺询问营业时间，几分钟后回到门外。'],
  ['radio_check', '在屋檐下完成一次对讲机通话并记录值班信息。'],
  ['building_entry', '从街面进入同一栋唐楼的大堂，查看门牌后停下。'],
  ['garage_walk', '在停车场有遮挡的通道巡看一圈，不处理任何案件。'],
  ['market_passage', '穿过仍在营业的市场通道，留意地面积水但不改变路线。'],
  ['taxi_queue', '查看的士站排队秩序十分钟，没有冲突便离开。'],
  ['warehouse_gate', '在货仓门口核对一次封条编号，不开启大门。'],
  ['indoor_handover', '回到室内值班台完成简短交接，窗外天气仍维持原状。']
] as const;

const scenarios: Scenario[] = scenarioSeeds.map(
  ([id, action], index): Scenario => ({
    id,
    routeId: (['grok', 'gemini', 'mimo'] as const)[index % 3],
    title: `天气黏滞验收：${id}`,
    playerInput: `${action} 当前只是持续细雨，没有转强、转弱、停雨或其他实际气象变化；请服从本地天气事实，不要为了气氛建立天气变化写回。本回合是普通短行动，不需要判定。`
  })
);

function addMinutes(time: GameTime, minutes: number): GameTime {
  const value = Date.UTC(
    time.year,
    time.month - 1,
    time.day,
    time.hour,
    time.minute
  );
  const next = new Date(value + minutes * 60_000);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: next.getUTCHours(),
    minute: next.getUTCMinutes()
  };
}

function createScenarioState(): RuntimeState {
  const state = createInitialRuntimeState({
    playerName: '周启明',
    englishName: 'Chow Kai-ming',
    age: 29,
    currentIdentity: 'police',
    policePostingId: 'mk_uniform_patrol',
    screenCharacterSeedsEnabled: false,
    openingPressure: 'routine'
  });
  state.environment = {
    weather: {
      condition: 'light_rain',
      label: '细雨',
      intensity: 35,
      impactSummary: '路面湿滑，视线稍受影响，但交通仍然运作。',
      startedAt: { ...state.time },
      validUntil: addMinutes(state.time, 240),
      source: 'seasonal',
      tags: ['wet_road', 'reduced_visibility']
    },
    recentConditions: ['cloudy', 'light_rain']
  };
  return state;
}

function createRouteSettings(
  settings: AiSettings,
  route: RouteChoice
): AiSettings {
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: route.profileId,
      model: route.model,
      maxTokensMode: 'custom',
      maxTokens: 12_288,
      temperature: 0.2
    }
  };
}

function requireRoute(settings: AiSettings, route: RouteChoice): void {
  const profile = settings.apiProfiles.find(
    (candidate) => candidate.id === route.profileId
  );
  if (!profile || !profile.models.includes(route.model)) {
    throw new Error(`缺少真实验收线路：${route.profileName}/${route.model}`);
  }
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key|tp|pst)-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]')
    .slice(0, 800);
}

function isExternalFailure(message: string): boolean {
  return /(?:HTTP\s*(?:429|5\d\d)|timeout|超时|network|fetch failed|ECONN|socket)/i.test(
    message
  );
}

async function loadPreviousResults(): Promise<Array<Record<string, unknown>>> {
  try {
    const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as {
      results?: unknown;
    };
    return Array.isArray(parsed.results)
      ? parsed.results.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : [];
  } catch {
    return [];
  }
}

async function writeSanitizedResults(
  results: Array<Record<string, unknown>>,
  completed: boolean
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        acceptedTurnCount: results.filter((result) => result.accepted).length,
        routes: routes.map(({ profileName, model }) => ({
          profileName,
          model
        })),
        results
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function assertSaveRoundTrip(after: RuntimeState, scenario: Scenario): void {
  const now = new Date().toISOString();
  const loaded = parseRuntimeSaveRecord(
    JSON.parse(
      JSON.stringify({
        saveId: `save_weather_${scenario.id}`,
        saveName: scenario.title,
        saveKind: 'manual',
        createdAt: now,
        updatedAt: now,
        playerName: after.player.name,
        worldpackId: after.world.worldpackId,
        gameDateLabel: `${after.time.year}-${after.time.month}-${after.time.day}`,
        turnCounter: after.turnCounter,
        runtimeState: after
      })
    )
  ).runtimeState;
  expect(loaded.environment).toEqual(after.environment);
}

describe.skipIf(!shouldRun)('weather persistence through real APIs', () => {
  it(
    'completes fifteen accepted weather-sensitive turns without extending repeated rain',
    async () => {
      const settings = importApiSettings(
        createDefaultAiSettings(),
        await readFile(settingsPath, 'utf8')
      );
      routes.forEach((route) => requireRoute(settings, route));
      const routeKeys = new Set(
        routes.map((route) => `${route.profileName}:${route.model}`)
      );
      const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
      const results = (await loadPreviousResults()).filter(
        (result) =>
          scenarioIds.has(String(result.scenario)) &&
          routeKeys.has(`${String(result.route)}:${String(result.model)}`)
      );
      await writeSanitizedResults(results, false);

      for (const scenario of scenarios) {
        const route = routes.find(
          (candidate) => candidate.id === scenario.routeId
        )!;
        if (
          results.some(
            (result) =>
              result.scenario === scenario.id && result.accepted === true
          )
        ) {
          continue;
        }

        let accepted = false;
        let lastFailure = '';
        for (let attempt = 1; attempt <= 6 && !accepted; attempt += 1) {
          const activeRoute =
            scenario.routeId === 'mimo' && attempt >= 2
              ? routes.find((candidate) => candidate.id === 'mimo-fallback')!
              : route;
          const before = createScenarioState();
          const originalWeather = structuredClone(before.environment.weather);
          const startedAt = performance.now();
          let rawTextLength = 0;
          try {
            const narrator = createNarratorClientFromSettings(
              createRouteSettings(settings, activeRoute)
            );
            const after = await runPlayerTurn({
              state: before,
              playerInput: scenario.playerInput,
              narrator,
              judgementRoll: 50,
              enableJudgementPreflight: true,
              gameSettings: {
                ...createDefaultAiSettings().game,
                narrativeLengthLevel: 'brief',
                pregnancyMode: 'off',
                dramaticContent: {
                  ...createDefaultAiSettings().game.dramaticContent,
                  enabled: false
                }
              },
              onRawText: (rawText) => {
                rawTextLength = rawText.length;
              },
              signal: AbortSignal.timeout(requestTimeoutMs * 3)
            });

            expect(after.turnCounter).toBe(before.turnCounter + 1);
            expect(after.environment.weather.condition).toBe('light_rain');
            expect(after.environment.weather.startedAt).toEqual(
              originalWeather.startedAt
            );
            expect(after.environment.weather.validUntil).toEqual(
              originalWeather.validUntil
            );
            expect(after.environment.recentConditions).toEqual([
              'cloudy',
              'light_rain'
            ]);
            assertSaveRoundTrip(after, scenario);

            const refreshed = refreshWeatherIfExpired(
              after.environment,
              originalWeather.validUntil
            );
            expect(refreshed.weather.startedAt).toEqual(
              originalWeather.validUntil
            );
            expect(refreshed.recentConditions?.at(-1)).toBe(
              refreshed.weather.condition
            );
            expect(refreshed.recentConditions?.length).toBeLessThanOrEqual(4);

            const weatherDiagnostic = [...after.storyLog]
              .reverse()
              .flatMap((entry) => entry.writebackDiagnostics ?? [])
              .find(
                (diagnostic) =>
                  diagnostic.code === 'weather_same_condition_not_extended'
              );
            results.push({
              scenario: scenario.id,
              route: activeRoute.profileName,
              model: activeRoute.model,
              accepted: true,
              attempt,
              durationMs: Math.round(performance.now() - startedAt),
              rawTextLength,
              sameConditionPatchBlocked: Boolean(weatherDiagnostic),
              originalCondition: originalWeather.condition,
              originalValidUntil: originalWeather.validUntil,
              finalCondition: after.environment.weather.condition,
              finalValidUntil: after.environment.weather.validUntil,
              expiredRefreshCondition: refreshed.weather.condition,
              expiredRefreshStartedAt: refreshed.weather.startedAt,
              saveRoundTrip: true
            });
            accepted = true;
          } catch (error) {
            lastFailure = safeError(error);
            results.push({
              scenario: scenario.id,
              route: activeRoute.profileName,
              model: activeRoute.model,
              accepted: false,
              attempt,
              externalFailure: isExternalFailure(lastFailure),
              durationMs: Math.round(performance.now() - startedAt),
              rawTextLength,
              error: lastFailure
            });
          }
          await writeSanitizedResults(results, false);
        }

        if (!accepted) {
          await writeSanitizedResults(results, false);
          throw new Error(`${scenario.id} 未取得有效通过回合：${lastFailure}`);
        }
      }

      await writeSanitizedResults(results, true);
      const acceptedResults = results.filter((result) => result.accepted);
      expect(acceptedResults).toHaveLength(15);
      for (const routeId of ['grok', 'gemini', 'mimo'] as const) {
        const scenarioIdSet = new Set(
          scenarios
            .filter((scenario) => scenario.routeId === routeId)
            .map((scenario) => scenario.id)
        );
        expect(
          acceptedResults.filter((result) =>
            scenarioIdSet.has(String(result.scenario))
          )
        ).toHaveLength(5);
      }
    },
    14_400_000
  );
});
