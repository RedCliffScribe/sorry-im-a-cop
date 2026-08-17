import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { runOpening } from '../../src/domain/opening/runOpening';
import { deriveActorAgeAt, normalizeActorBirthDate } from '../../src/domain/runtime/actorAge';
import type { OpeningSetup } from '../../src/domain/runtime/initialState';
import type { GameTime, RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';

const shouldRun = process.env.COPV2_RUN_ACTOR_AGE_REAL_API === '1';
const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const requestedTurns = Math.trunc(Number(process.env.COPV2_ACTOR_AGE_TURNS ?? 24)) || 24;
const turnCount = Math.min(30, Math.max(20, requestedTurns));
const turnDelayMs = Math.max(0, Number(process.env.COPV2_ACTOR_AGE_TURN_DELAY_MS ?? 1200));
const requestTimeoutMs = Math.max(60_000, Number(process.env.COPV2_ACTOR_AGE_REQUEST_TIMEOUT_MS ?? 600_000));
const mainProfileOverride = process.env.COPV2_ACTOR_AGE_MAIN_PROFILE?.trim();
const mainModelOverride = process.env.COPV2_ACTOR_AGE_MAIN_MODEL?.trim();
const maxAttempts = Math.min(5, Math.max(1, Number(process.env.COPV2_ACTOR_AGE_MAX_ATTEMPTS ?? 3)));
const retryBackoffMs = Math.max(1_000, Number(process.env.COPV2_ACTOR_AGE_RETRY_BACKOFF_MS ?? 10_000));

interface HttpAuditEntry {
  route: TurnApiRoute;
  status: number | null;
  responseMs: number;
  error?: string;
}

interface AgeSnapshot {
  turn: number;
  time: GameTime;
  playerAge: number | null;
  datedNpcCount: number;
  actors: Array<{
    actorId: string;
    name: string;
    birthDate: string;
    computedAge: number | null;
    derivedAge: number | null;
  }>;
  diagnostics: string[];
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 500);
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function withMainRouteOverride(settings: AiSettings): AiSettings {
  if (!mainProfileOverride && !mainModelOverride) return settings;
  const profileId = mainProfileOverride || settings.mainNarrator?.apiProfileId;
  const model = mainModelOverride || settings.mainNarrator?.model;
  if (!profileId || !model) throw new Error('Real API main-route override is incomplete.');
  const profile = settings.apiProfiles.find((item) => item.id === profileId);
  if (!profile) throw new Error(`Real API profile override does not exist: ${profileId}`);
  if (!profile.models.includes(model)) {
    throw new Error(`Real API model override is not present in profile ${profileId}: ${model}`);
  }
  return {
    ...settings,
    mainNarrator: {
      ...settings.mainNarrator,
      apiProfileId: profileId,
      model
    }
  };
}

async function runWithRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.log(`[actor-age-real] ${label} attempt=${attempt}/${maxAttempts} error=${safeError(error)}`);
      if (attempt < maxAttempts) await sleep(retryBackoffMs * attempt);
    }
  }
  throw lastError;
}

function createAuditedFetch(route: TurnApiRoute, audits: HttpAuditEntry[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
      (signal): signal is AbortSignal => Boolean(signal)
    );
    try {
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

function createClients(settings: AiSettings, audits: HttpAuditEntry[]) {
  return {
    narrator: createNarratorClientFromSettings(settings, createAuditedFetch('mainNarrator', audits))
  };
}

function compareTime(left: GameTime, right: GameTime): number {
  const leftValue = Date.UTC(left.year, left.month - 1, left.day, left.hour, left.minute);
  const rightValue = Date.UTC(right.year, right.month - 1, right.day, right.hour, right.minute);
  return leftValue - rightValue;
}

function inspectAgeInvariant(state: RuntimeState): { errors: string[]; datedNpcIds: string[] } {
  const errors: string[] = [];
  const datedNpcIds: string[] = [];
  const playerActor = state.actors[state.player.actorId];
  if (!playerActor) errors.push('player actor is missing');
  if (normalizeActorBirthDate(state.player.birthDate) !== normalizeActorBirthDate(playerActor?.birthDate)) {
    errors.push(`player birthDate mirror mismatch: profile=${state.player.birthDate} actor=${playerActor?.birthDate}`);
  }

  for (const actor of Object.values(state.actors)) {
    const birthDate = normalizeActorBirthDate(actor.birthDate);
    if (!birthDate) continue;
    const derivedAge = deriveActorAgeAt(actor, state.time);
    if (derivedAge === undefined) {
      errors.push(`${actor.actorId} has an invalid or future birthDate ${actor.birthDate}`);
      continue;
    }
    if (actor.computedAge !== derivedAge) {
      errors.push(`${actor.actorId} cached=${actor.computedAge ?? 'missing'} derived=${derivedAge}`);
    }
    if (actor.actorId !== state.player.actorId) datedNpcIds.push(actor.actorId);
  }

  return { errors, datedNpcIds };
}

function createSnapshot(state: RuntimeState): AgeSnapshot {
  const actors = Object.values(state.actors)
    .filter((actor) => normalizeActorBirthDate(actor.birthDate))
    .map((actor) => ({
      actorId: actor.actorId,
      name: actor.name,
      birthDate: normalizeActorBirthDate(actor.birthDate)!,
      computedAge: actor.computedAge ?? null,
      derivedAge: deriveActorAgeAt(actor, state.time) ?? null
    }))
    .sort((left, right) => left.actorId.localeCompare(right.actorId));
  return {
    turn: state.turnCounter,
    time: { ...state.time },
    playerAge: state.actors[state.player.actorId]?.computedAge ?? null,
    datedNpcCount: actors.filter((actor) => actor.actorId !== state.player.actorId).length,
    actors,
    diagnostics: [...new Set((state.storyLog.at(-1)?.writebackDiagnostics ?? []).map((item) => item.code ?? 'unknown'))]
  };
}

function statusCounts(audits: HttpAuditEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const audit of audits) {
    const key = `${audit.route}:${audit.status === null ? 'network_error' : audit.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

const actions = [
  '我先核对值日室人事卡：当值警长陈伟强，男，出生日期1960年1月10日。请他本人确认姓名、职务和生日资料，再交代今天的普通值更；这个明确生日需要进入人物档案。',
  '我与陈伟强警长一起整理年末值更表，确认当前仍是1988年12月20日，并约好年底前完成一次普通巡逻交接。',
  '我在12月22日继续当值，向陈伟强警长汇报两天来的例行巡逻，不增加新案件。',
  '我按正常排班生活到1988年12月26日上午，再和陈伟强警长核对圣诞值更交接。',
  '我继续正常生活和当值到1988年12月30日下午，整理年末文书并确认大家年龄资料没有被改动。',
  '我跨年后于1989年1月5日上午回到警署，向陈伟强警长问候并安排下一周的普通值更。',
  '我正常生活到1989年1月9日下午，与陈伟强警长核对次日排班，不提前替任何人增加年龄。',
  '我在1989年1月10日上午当面祝陈伟强警长生日快乐，继续处理普通交接，不改变他的姓名、身份或出生日期。',
  '我正常当值到1989年1月14日，陈伟强警长提醒我明天是我的生日，今天仍按原年龄处理。',
  '我在1989年1月15日上午过生日，之后到警署报到，请陈伟强警长安排一项普通巡逻。',
  '我正常生活到1989年1月20日，再与陈伟强警长复核本月值更记录和人事资料。',
  '我在1989年2月1日上午继续当值，处理一小时普通文书后与陈伟强警长交接。',
  '我正常排班到1989年3月1日，回署向陈伟强警长汇报街面日常情况。',
  '我正常生活到1989年4月1日，继续普通巡逻，不新增重大案件。',
  '我正常生活到1989年5月1日，与陈伟强警长整理一份季度值更摘要。',
  '我正常生活到1989年6月1日，回署处理积存文书并确认人物档案仍一致。',
  '我正常生活到1989年7月1日，与陈伟强警长进行普通交班。',
  '我正常生活到1989年8月1日，继续一轮低压力街面巡逻。',
  '我正常生活到1989年9月1日，回署记录街坊的普通治安意见。',
  '我正常生活到1989年10月1日，与陈伟强警长核对值更安排。',
  '我正常生活到1989年11月1日，完成一次普通交接和文书整理。',
  '我正常生活到1989年12月1日，继续日常当值，不改变任何人的生日资料。',
  '我正常生活到1989年12月31日下午，与陈伟强警长完成年末值更总结。',
  '我在1990年1月16日上午回到警署，和陈伟强警长分别确认各自刚过完新一年的生日，档案只保留真实出生日期与当前年龄。'
];

describe.skipIf(!shouldRun)('actor age cross-year real API acceptance', () => {
  it(`runs a fresh opening plus ${turnCount} sequential cross-year turns`, async () => {
    const settings = withMainRouteOverride(
      importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'))
    );
    if (!settings.mainNarrator) throw new Error('Main narrator route is not configured.');
    const audits: HttpAuditEntry[] = [];
    const clients = createClients(settings, audits);
    const outputDir = path.resolve('output', 'actor-age-real-api');
    const progressPath = path.join(outputDir, 'progress.json');
    await mkdir(outputDir, { recursive: true });
    console.log(
      `[actor-age-real] route profile=${settings.mainNarrator.apiProfileId} model=${settings.mainNarrator.model} ` +
        `turns=${turnCount} timeoutMs=${requestTimeoutMs}`
    );
    const setup: OpeningSetup = {
      playerName: '林振声',
      englishName: 'Vincent Lam',
      gender: 'male',
      birthDate: '1967-01-15',
      currentIdentity: 'police',
      policeNumber: '2847',
      personality: '谨慎、耐心，重视档案前后一致。',
      appearance: '身形中等，神情专注。',
      startTime: { year: 1988, month: 12, day: 20, hour: 8, minute: 30 },
      openingPressure: 'routine',
      openingNote:
        '这是年末普通值更开局。必须让当值警长陈伟强在场并建立稳定 Actor：男性，出生日期1960-01-10，公开身份为旺角警署当值警长。生日是明确人事档案事实，不是估算年龄。'
    };
    let state = await runWithRetry('opening', () =>
      runOpening({
        setup,
        narrator: clients.narrator,
        narrativeLengthLevel: 'compact',
        narrativePerspective: settings.game.narrativePerspective,
        playerPortrayalMode: settings.game.playerPortrayalMode,
        locale: settings.game.language,
        promptSettings: settings.prompts
      })
    );
    expect(state.turnCounter).toBe(0);
    expect(state.actors.player.computedAge).toBe(21);

    const openingInvariant = inspectAgeInvariant(state);
    expect(openingInvariant.errors).toEqual([]);
    const snapshots: AgeSnapshot[] = [createSnapshot(state)];
    await writeFile(
      progressPath,
      JSON.stringify({ status: 'running', completedTurns: 0, snapshot: snapshots[0] }, null, 2),
      'utf8'
    );
    console.log(
      `[actor-age-real] opening time=${state.time.year}-${state.time.month}-${state.time.day} ` +
        `playerAge=${state.actors.player.computedAge ?? 'missing'} datedNpc=${openingInvariant.datedNpcIds.length}`
    );
    const transitions = new Map<string, Array<{ turn: number; from: number; to: number }>>();
    const previousAges = new Map(
      Object.values(state.actors)
        .filter((actor) => actor.computedAge !== undefined)
        .map((actor) => [actor.actorId, actor.computedAge!])
    );

    for (let index = 0; index < turnCount; index += 1) {
      const action = actions[index] ?? actions.at(-1)!;
      state = await runWithRetry(`turn=${index + 1}`, () =>
        runPlayerTurn({
            state,
            playerInput: action,
            ...clients,
            writebackRepairMode: 'disabled',
            gameSettings: { ...settings.game, narrativeLengthLevel: 'compact' },
            promptSettings: settings.prompts,
          })
      );

      const invariant = inspectAgeInvariant(state);
      expect(invariant.errors, `turn ${state.turnCounter} age invariant`).toEqual([]);
      for (const actor of Object.values(state.actors)) {
        if (actor.computedAge === undefined) continue;
        const previous = previousAges.get(actor.actorId);
        if (previous !== undefined && previous !== actor.computedAge) {
          transitions.set(actor.actorId, [
            ...(transitions.get(actor.actorId) ?? []),
            { turn: state.turnCounter, from: previous, to: actor.computedAge }
          ]);
        }
        previousAges.set(actor.actorId, actor.computedAge);
      }
      const snapshot = createSnapshot(state);
      snapshots.push(snapshot);
      await writeFile(
        progressPath,
        JSON.stringify(
          {
            status: 'running',
            completedTurns: state.turnCounter,
            requestedTurns: turnCount,
            snapshot,
            httpStatusCounts: statusCounts(audits)
          },
          null,
          2
        ),
        'utf8'
      );
      console.log(
        `[actor-age-real] turn=${snapshot.turn}/${turnCount} time=${snapshot.time.year}-${snapshot.time.month}-${snapshot.time.day} ` +
          `playerAge=${snapshot.playerAge} datedNpc=${snapshot.datedNpcCount} diagnostics=${snapshot.diagnostics.join(',') || 'none'}`
      );
      await sleep(turnDelayMs);
    }

    const finalInvariant = inspectAgeInvariant(state);
    const datedNpcs = Object.values(state.actors).filter(
      (actor) => actor.actorId !== state.player.actorId && normalizeActorBirthDate(actor.birthDate)
    );
    const playerTransitions = transitions.get(state.player.actorId) ?? [];
    const npcTransitions = [...transitions.entries()]
      .filter(([actorId]) => actorId !== state.player.actorId)
      .flatMap(([actorId, items]) => items.map((item) => ({ actorId, ...item })));
    const report = {
      generatedAt: new Date().toISOString(),
      requestedTurns: turnCount,
      completedTurns: state.turnCounter,
      mainRoute: {
        apiProfileId: settings.mainNarrator.apiProfileId,
        model: settings.mainNarrator.model
      },
      finalTime: state.time,
      finalInvariantErrors: finalInvariant.errors,
      playerTransitions,
      npcTransitions,
      datedNpcDirectory: datedNpcs.map((actor) => ({
        actorId: actor.actorId,
        name: actor.name,
        birthDate: actor.birthDate,
        computedAge: actor.computedAge
      })),
      httpStatusCounts: statusCounts(audits),
      snapshots
    };
    await writeFile(path.join(outputDir, 'latest.json'), JSON.stringify(report, null, 2), 'utf8');
    await writeFile(
      progressPath,
      JSON.stringify({ status: 'completed', completedTurns: state.turnCounter, requestedTurns: turnCount }, null, 2),
      'utf8'
    );

    expect(state.turnCounter).toBe(turnCount);
    expect(compareTime(state.time, { year: 1989, month: 1, day: 15, hour: 0, minute: 0 })).toBeGreaterThanOrEqual(0);
    expect(state.actors.player.computedAge).toBeGreaterThanOrEqual(22);
    expect(finalInvariant.errors).toEqual([]);
    expect(datedNpcs.length).toBeGreaterThanOrEqual(1);
    expect(playerTransitions.some((item) => item.from === 21 && item.to === 22)).toBe(true);
    expect(npcTransitions.some((item) => item.to === item.from + 1)).toBe(true);
    expect(audits.some((audit) => audit.route === 'mainNarrator' && audit.status === 200)).toBe(true);
  });
});
