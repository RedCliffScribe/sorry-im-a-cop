import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { OpenAiCompatibleNarratorClient } from '../../src/domain/narrator/OpenAiCompatibleNarratorClient';
import { compileCreativeNarratorRequest } from '../../src/domain/prompts/creativePromptCompiler';
import {
  getTavernSlotKey,
  importTavernPreset,
  TAVERN_RESERVED_RUNTIME_SLOTS
} from '../../src/domain/prompts/tavernPreset';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';

const shouldRun = process.env.COPV2_RUN_TAVERN_REAL_API === '1';
const baseUrl = process.env.COPV2_TAVERN_REAL_API_BASE_URL ?? '';
const apiKey = process.env.COPV2_TAVERN_REAL_API_KEY ?? '';
const model = process.env.COPV2_TAVERN_REAL_API_MODEL ?? '';
const presetPath = process.env.COPV2_TAVERN_REAL_PRESET_PATH ?? '';
const timeoutMs = Math.max(30_000, Number(process.env.COPV2_TAVERN_REAL_TIMEOUT_MS ?? 600_000));

const TAVERN_MARKER = 'IZUMI_ACTIVE_20260724';
const COT_MARKER = 'CUSTOM_COT_ACTIVE_20260724';
const REASONING_MARKER = 'ISOLATED_REASONING_20260724';

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

describe.skipIf(!shouldRun)('managed Tavern preset and custom CoT through a real API', () => {
  it('causally verifies Izumi injection and isolates optional reasoning from the parsed value', async () => {
    expect(baseUrl).not.toBe('');
    expect(apiKey).not.toBe('');
    expect(model).not.toBe('');
    expect(presetPath).not.toBe('');

    const imported = importTavernPreset(
      await readFile(presetPath, 'utf8'),
      'real-api-preset.json',
      '2026-07-24T00:00:00.000Z'
    ).entry;
    const order = imported.preset.promptOrder.find(
      (candidate) => candidate.characterId === imported.selectedCharacterId
    );
    expect(order).toBeDefined();

    const promptMap = new Map(imported.preset.prompts.map((prompt) => [prompt.identifier, prompt]));
    const markerOrderIndex = order!.order.findIndex((slot) => {
      const prompt = promptMap.get(slot.identifier);
      return (
        slot.enabled
        && prompt?.role === 'system'
        && !TAVERN_RESERVED_RUNTIME_SLOTS.has(slot.identifier.toLocaleLowerCase())
        && Boolean(prompt.content.trim())
      );
    });
    expect(markerOrderIndex).toBeGreaterThanOrEqual(0);

    const markerSlot = order!.order[markerOrderIndex];
    const markerSlotKey = getTavernSlotKey(markerOrderIndex, markerSlot.identifier);
    const activeEntry = {
      ...imported,
      customization: {
        ...imported.customization,
        itemOverrides: {
          ...imported.customization.itemOverrides,
          [markerSlotKey]: {
            enabled: true,
            contentOverride: [
              '这是酒馆预设的真实 API 验收指令。',
              `最终 JSON 顶层必须包含 "tavernVerification": "${TAVERN_MARKER}"。`
            ].join('\n')
          }
        }
      }
    };

    const defaults = createDefaultAiSettings();
    const activeTavern = {
      ...defaults.tavern,
      enabled: true,
      activePresetId: activeEntry.id,
      entries: [activeEntry],
      customCot: {
        enabled: true,
        scope: 'both' as const,
        templateId: 'custom' as const,
        content: [
          '在同一次主剧情请求中核对结构化输出。',
          `最终 JSON 顶层必须包含 "cotVerification": "${COT_MARKER}"。`,
          `同时返回 "reasoningText": "${REASONING_MARKER}"，用于验证隔离通道。`
        ].join('\n')
      },
      reasoningOutput: {
        mode: 'json' as const,
        maxCharacters: 512,
        showInUi: true
      }
    };
    const runtimePrompt = [
      '这是一次无存档写入的连接验收。',
      '只返回 JSON object，包含 narrativeText、suggestedActions 和 runtimeVerification。',
      'narrativeText 用两句简体中文说明已读取创作规则，不引用或复述任何预设原文。',
      'suggestedActions 必须是空数组。',
      'runtimeVerification 必须为 "RUNTIME_OK"。'
    ].join('\n');
    const controlCompilation = compileCreativeNarratorRequest({
      runtimePrompt,
      tavernSettings: defaults.tavern,
      scope: 'turn',
      playerName: '验收玩家'
    });
    const activeCompilation = compileCreativeNarratorRequest({
      runtimePrompt,
      tavernSettings: activeTavern,
      scope: 'turn',
      playerName: '验收玩家'
    });
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl,
      apiKey,
      model,
      maxTokens: 4096,
      temperature: 0,
      requestTimeoutMs: timeoutMs
    });

    const control = await client.completeDetailed(controlCompilation.request, {
      requestPurpose: 'auxiliary'
    });
    const controlValue = asRecord(control.value);
    expect(controlValue.runtimeVerification).toBe('RUNTIME_OK');
    expect(controlValue.tavernVerification).toBeUndefined();
    expect(controlValue.cotVerification).toBeUndefined();
    expect(control.reasoningText).toBeUndefined();

    const active = await client.completeDetailed(activeCompilation.request, {
      requestPurpose: 'auxiliary'
    });
    const activeValue = asRecord(active.value);
    expect(activeValue.runtimeVerification).toBe('RUNTIME_OK');
    expect(activeValue.tavernVerification).toBe(TAVERN_MARKER);
    expect(activeValue.cotVerification).toBe(COT_MARKER);
    expect(activeValue.reasoningText).toBeUndefined();
    expect(active.reasoningText).toBe(REASONING_MARKER);
    expect(active.attempt.reasoningText).toBe(REASONING_MARKER);

    console.log(JSON.stringify({
      model,
      sourceHash: imported.sourceHash,
      orderedItems: order!.order.length,
      injectedItems: activeCompilation.tavern.items.filter((item) => item.status === 'included').length,
      injectedCharacters: activeCompilation.tavern.includedCharacters,
      messageRoles: activeCompilation.messages.map((message) => message.role),
      control: {
        finishReason: control.attempt.finishReason,
        markerPresent: Boolean(controlValue.tavernVerification || controlValue.cotVerification)
      },
      active: {
        finishReason: active.attempt.finishReason,
        tavernMarkerPresent: activeValue.tavernVerification === TAVERN_MARKER,
        cotMarkerPresent: activeValue.cotVerification === COT_MARKER,
        reasoningIsolated: (
          activeValue.reasoningText === undefined
          && active.reasoningText === REASONING_MARKER
        )
      }
    }));
  }, timeoutMs * 2 + 30_000);
});
