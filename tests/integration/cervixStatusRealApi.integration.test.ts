import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { runOpening } from '../../src/domain/opening/runOpening';
import { applyPregnancyLifecycle } from '../../src/domain/pregnancy/pregnancyLifecycle';
import type { OpeningSetup } from '../../src/domain/runtime/initialState';
import type { Actor, GameTime, RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import { createWritebackRepairClientFromSettings } from '../../src/domain/writeback/createWritebackRepairClientFromSettings';

const shouldRun = process.env.COPV2_RUN_CERVIX_STATUS_REAL_API === '1';
const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const requestTimeoutMs = Math.max(60_000, Number(process.env.COPV2_CERVIX_STATUS_TIMEOUT_MS ?? 240_000));

interface HttpAuditEntry {
  route: TurnApiRoute;
  status: number | null;
  responseMs: number;
  error?: string;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 600);
}

function createFastRealApiSettings(settings: AiSettings): AiSettings {
  const profile = settings.apiProfiles.find((item) => item.name === 'ggchan');
  if (!profile?.models.includes('gemini-3.1-pro-preview')) {
    throw new Error('The configured ggchan profile does not expose gemini-3.1-pro-preview.');
  }
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: profile.id,
      model: 'gemini-3.1-pro-preview',
      maxTokens: 8192,
      temperature: 0.25
    }
  };
}

function createAuditedFetch(audits: HttpAuditEntry[], route: TurnApiRoute) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    try {
      const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
        (signal): signal is AbortSignal => Boolean(signal)
      );
      const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
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

function addGameHours(time: GameTime, hours: number): GameTime {
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour + hours, time.minute));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function findOpeningGirlfriend(state: RuntimeState): Actor | undefined {
  return Object.values(state.actors).find(
    (actor) =>
      actor.actorId !== state.player.actorId &&
      actor.gender === 'female' &&
      (actor.name.includes('林美仪') ||
        /女友|伴侣|同居/u.test(
          [actor.publicIdentity, actor.relationshipSummary, actor.actualIdentitySummary].join(' ')
        ))
  );
}

function seedExistingPrivateDossier(state: RuntimeState, actorId: string): RuntimeState {
  const actor = state.actors[actorId];
  if (!actor) throw new Error(`Missing actor ${actorId}.`);
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...actor,
        femaleProfile: {
          ...(actor.femaleProfile ?? {}),
          updatedAt: { ...state.time },
          source: actor.femaleProfile?.source ?? 'imported',
          adultPrivateProfile: {
            enabled: true,
            ageConfirmedAdult: true,
            profileStatus: 'developing',
            womb: {
              status: '未受孕',
              cervixStatus: '紧闭',
              records: []
            },
            updatedAt: { ...state.time },
            source: 'imported'
          }
        }
      }
    }
  };
}

describe.skipIf(!shouldRun)('cervix status through real opening and main narrator API', () => {
  it(
    'writes a short-term status for an established adult girlfriend and settles it locally after 12 hours',
    async () => {
      const imported = importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'));
      const settings = createFastRealApiSettings(imported);
      const audits: HttpAuditEntry[] = [];
      const narrator = createNarratorClientFromSettings(settings, createAuditedFetch(audits, 'mainNarrator'));
      const writebackRepair =
        createWritebackRepairClientFromSettings(settings, createAuditedFetch(audits, 'writebackRepair')) ?? undefined;
      const setup: OpeningSetup = {
        playerName: '陈志明',
        englishName: 'Chan Chi Ming',
        gender: 'male',
        age: 30,
        currentIdentity: 'civilian',
        civilianProfileId: 'office_clerk',
        personality: '冷静、体贴，尊重伴侣明确表达的边界。',
        appearance: '三十岁香港男子，衣着整洁，神情沉稳。',
        startTime: { year: 1984, month: 12, day: 27, hour: 20, minute: 0 },
        openingPressure: 'routine',
        openingNote:
          '这是已经成立的开局关系事实：玩家与三十岁的成年女友林美仪稳定交往并同居三年，双方关系自愿、亲密且会明确确认边界。林美仪必须作为 initialActors 中的稳定女性 NPC 出场，姓名必须保留为林美仪，关系字段明确写她是玩家的成年同居女友。开局场景是两人在共同住所度过普通安静的夜晚，不制造案件、危险或突发来客。'
      };

      const opened = await runOpening({
        setup,
        narrator,
        repairNarrator: writebackRepair ?? narrator,
        narrativeLengthLevel: 'compact',
        narrativePerspective: 'third_person',
        playerPortrayalMode: 'natural',
        locale: 'zh-CN',
        promptSettings: settings.prompts,
        tavernSettings: settings.tavern
      });
      const girlfriend = findOpeningGirlfriend(opened);
      expect(girlfriend).toBeDefined();
      expect(girlfriend?.computedAge).toBeGreaterThanOrEqual(18);

      const prepared = seedExistingPrivateDossier(opened, girlfriend!.actorId);
      const changed = await runPlayerTurn({
        state: prepared,
        playerInput:
          '两名三十岁成年同居伴侣已经再次明确同意。陈志明与林美仪在反锁卧室中完成一次双方自愿、没有避孕措施的成人亲密行为，结束后相拥休息。请完整承接这项已经明确的行动，不替玩家追加新的决定。',
        narrator,
        writebackRepair,
        gameSettings: {
          ...settings.game,
          narrativeLengthLevel: 'compact',
          narrativePerspective: 'third_person',
          playerPortrayalMode: 'natural',
          pregnancyMode: 'standard'
        },
        promptSettings: settings.prompts,
        tavernSettings: settings.tavern
      });

      const changedWomb = changed.actors[girlfriend!.actorId].femaleProfile?.adultPrivateProfile?.womb;
      expect(changedWomb?.cervixStatus).not.toBe('紧闭');
      expect(changedWomb?.cervixStatusUpdatedAt).toEqual(changed.time);

      const settledAt = addGameHours(changed.time, 12);
      const settled = applyPregnancyLifecycle({
        actors: changed.actors,
        relationshipThreads: changed.relationshipThreads,
        currentTime: settledAt,
        worldpackId: changed.world.worldpackId,
        playerActorId: changed.player.actorId,
        mode: 'standard'
      });
      const settledWomb = settled.actors[girlfriend!.actorId].femaleProfile?.adultPrivateProfile?.womb;
      expect(settledWomb?.cervixStatus).toBe('紧闭');
      expect(settledWomb?.cervixStatusUpdatedAt).toEqual(settledAt);

      console.log(
        `[cervix-status-real] ${JSON.stringify({
          route: {
            profile: settings.mainNarrator?.apiProfileId,
            model: settings.mainNarrator?.model
          },
          opening: {
            turnCounter: opened.turnCounter,
            girlfriendCreated: Boolean(girlfriend),
            girlfriendAdult: (girlfriend?.computedAge ?? 0) >= 18
          },
          writeback: {
            turnCounter: changed.turnCounter,
            statusChanged: changedWomb?.cervixStatus !== '紧闭',
            timestampWritten: Boolean(changedWomb?.cervixStatusUpdatedAt)
          },
          settlement: {
            elapsedHours: 12,
            restoredNormal: settledWomb?.cervixStatus === '紧闭'
          },
          http: audits
        })}`
      );
    },
    600_000
  );
});
