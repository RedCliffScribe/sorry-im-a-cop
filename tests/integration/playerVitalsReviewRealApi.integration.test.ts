import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import type {
  NarratorClient,
  NarratorInput,
  NarratorStreamOptions
} from '../../src/domain/narrator/NarratorClient';
import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import { createWritebackRepairClientFromSettings } from '../../src/domain/writeback/createWritebackRepairClientFromSettings';

const shouldRun = process.env.COPV2_RUN_PLAYER_VITALS_REAL_API === '1';
const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_PLAYER_VITALS_REQUEST_TIMEOUT_MS ?? 600_000)
);
const useWritebackRouteAsMain =
  process.env.COPV2_PLAYER_VITALS_USE_WRITEBACK_ROUTE_AS_MAIN === '1';

interface HttpAuditEntry {
  route: 'mainNarrator' | 'writebackRepair';
  status: number | null;
  responseMs: number;
  error?: string;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 500);
}

function createAuditedFetch(route: HttpAuditEntry['route'], audits: HttpAuditEntry[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
      (signal): signal is AbortSignal => Boolean(signal)
    );
    try {
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

class CapturingNarratorClient implements NarratorClient {
  readonly configuredMaxTokens?: number;
  readonly responses: unknown[] = [];

  constructor(private readonly inner: NarratorClient) {
    this.configuredMaxTokens = inner.configuredMaxTokens;
  }

  async complete(input: NarratorInput, options?: NarratorStreamOptions): Promise<unknown> {
    const response = await this.inner.complete(input, options);
    this.responses.push(response);
    return response;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function latestDiagnosticCodes(state: Awaited<ReturnType<typeof runPlayerTurn>>): string[] {
  return (state.storyLog.at(-1)?.writebackDiagnostics ?? [])
    .map((issue) => issue.code ?? 'unclassified')
    .sort();
}

function selectRealTestSettings(settings: AiSettings): AiSettings {
  if (!useWritebackRouteAsMain) return settings;
  const route = settings.featureRoutes.writebackRepair;
  if (route.mode !== 'custom') {
    throw new Error('The configured writeback repair route is not available as a real-test fallback.');
  }
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: route.apiProfileId,
      model: route.model,
      maxTokens: Math.max(8192, route.maxTokens ?? 8192),
      temperature: route.temperature ?? 0.3
    }
  };
}

describe.skipIf(!shouldRun)('player vitals structured review real API acceptance', () => {
  it('distinguishes a static turn from explicit physical exertion without local prose scanning', async () => {
    const importedSettings = importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'));
    const settings = selectRealTestSettings(importedSettings);
    const audits: HttpAuditEntry[] = [];
    const narrator = new CapturingNarratorClient(
      createNarratorClientFromSettings(settings, createAuditedFetch('mainNarrator', audits))
    );
    const writebackRepair = createWritebackRepairClientFromSettings(
      settings,
      createAuditedFetch('writebackRepair', audits)
    );

    expect(writebackRepair).not.toBeNull();

    const staticState = createInitialRuntimeState({ currentIdentity: 'police' });
    const staticNext = await runPlayerTurn({
      state: staticState,
      playerInput: '继续坐在值班桌后核对五分钟巡逻记录，不起身，也不做其它事情。',
      narrator,
      writebackRepair,
      gameSettings: settings.game,
      promptSettings: settings.prompts,
      tavernSettings: settings.tavern
    });
    const staticRaw = asRecord(narrator.responses.at(-1));
    const staticReview = asRecord(staticRaw.playerVitalsReview);

    console.log(
      JSON.stringify(
        {
          phase: 'static',
          mainModel: settings.mainNarrator?.model,
          review: staticReview,
          vitals: staticNext.player.vitals,
          diagnostics: latestDiagnosticCodes(staticNext),
          http: audits
        },
        null,
        2
      )
    );

    expect(staticRaw.writebackVersion).toBe('1.6');
    expect(staticReview.changed).toBe(false);
    expect(staticNext.player.vitals).toEqual(staticState.player.vitals);
    expect(latestDiagnosticCodes(staticNext)).not.toContain('writeback_repair_missing_vitals_patch');

    const exertionState = createInitialRuntimeState({ currentIdentity: 'police' });
    const exertionNext = await runPlayerTurn({
      state: exertionState,
      playerInput:
        '沿后巷连续全力冲刺追赶逃跑者，扑上去扭打并把他按倒；过程中膝盖撞上石阶擦伤，停下时明显喘不过气。',
      narrator,
      writebackRepair,
      gameSettings: settings.game,
      promptSettings: settings.prompts,
      tavernSettings: settings.tavern
    });
    const exertionRaw = asRecord(narrator.responses.at(-1));
    const exertionReview = asRecord(exertionRaw.playerVitalsReview);

    expect(exertionRaw.writebackVersion).toBe('1.6');
    expect(exertionReview.changed).toBe(true);
    expect(
      exertionNext.player.vitals.health < exertionState.player.vitals.health ||
        exertionNext.player.vitals.stamina < exertionState.player.vitals.stamina ||
        exertionNext.player.vitals.conditionSummary !== exertionState.player.vitals.conditionSummary
    ).toBe(true);
    expect(latestDiagnosticCodes(exertionNext)).not.toContain('writeback_repair_missing_vitals_patch');
    expect(latestDiagnosticCodes(exertionNext)).not.toContain('writeback_repair_empty_vitals_patch');
    expect(audits.filter((entry) => entry.route === 'mainNarrator' && entry.status === 200)).toHaveLength(2);

    console.log(
      JSON.stringify(
        {
          mainModel: settings.mainNarrator?.model,
          staticReview,
          staticVitals: staticNext.player.vitals,
          staticDiagnostics: latestDiagnosticCodes(staticNext),
          exertionReview,
          exertionVitals: exertionNext.player.vitals,
          exertionDiagnostics: latestDiagnosticCodes(exertionNext),
          http: audits
        },
        null,
        2
      )
    );
  });
});
