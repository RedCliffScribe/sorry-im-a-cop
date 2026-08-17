import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAdultRelationshipStyleGuide,
  createNarrativePerspectiveGuide,
  createNarrativeStyleAndDisplayGuide,
  createPlayerPortrayalGuide
} from '../../src/domain/context/narrativePromptGuides';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import type { NarratorClient } from '../../src/domain/narrator/NarratorClient';
import { measureNarrativeLength } from '../../src/domain/narrator/narrativeLengthGuard';
import { resolvePromptText } from '../../src/domain/prompts/promptRegistry';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import { isNarrativeLengthLevel, type NarrativeLengthLevel } from '../../src/domain/settings/narrativeLength';
import type { AiSettings } from '../../src/domain/settings/types';

const shouldRun = process.env.COPV2_RUN_NARRATIVE_STYLE_REAL_API === '1';
const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const requestTimeoutMs = Math.max(
  60_000,
  Number(process.env.COPV2_NARRATIVE_STYLE_REQUEST_TIMEOUT_MS ?? 600_000)
);
const printRawSamples = process.env.COPV2_NARRATIVE_STYLE_PRINT_RAW === '1';
const forceFallback = process.env.COPV2_NARRATIVE_STYLE_FORCE_FALLBACK === '1';
const fallbackModelOverride = process.env.COPV2_NARRATIVE_STYLE_FALLBACK_MODEL?.trim();
const requestedLengthLevel = process.env.COPV2_NARRATIVE_STYLE_LENGTH_LEVEL ?? 'standard';
const narrativeLengthLevel: NarrativeLengthLevel = isNarrativeLengthLevel(requestedLengthLevel)
  ? requestedLengthLevel
  : 'standard';

interface ScenarioDefinition {
  id: string;
  title: string;
  facts: string;
  playerInput: string;
  requirement: string;
  adult?: boolean;
  forbiddenMention?: string;
}

interface NarrativeSample {
  narrativeText: string;
  suggestedActions: string[];
  turnSummary: string;
  writeback: Record<string, unknown>;
}

interface AuditResult {
  id: string;
  pass: boolean;
  violations: string[];
  observations: string[];
}

interface HttpAuditEntry {
  status: number | null;
  responseMs: number;
  error?: string;
}

const scenarios: ScenarioDefinition[] = [
  {
    id: 'third_person_bath_transition',
    title: '第三人称洗浴过渡',
    facts: '1984年12月27日晚，成年男性玩家周星星刚回到独居公寓，浴室无人，热水器正常。',
    playerInput: '周星星走进浴室，打开热水，准备洗去身上的汗。',
    requirement: '只写必要的客观结果，停在下一步由玩家决定之前；不得替他觉得舒服、放松、叹息、闭眼或作出额外动作。'
  },
  {
    id: 'police_paperwork',
    title: '普通警署文书',
    facts: '下午四时，旺角警署报案室。值日警长要求玩家把上午两宗轻微纠纷的记录编号补齐；没有突发案件。',
    playerInput: '玩家核对登记簿，把遗漏的两个编号补上。',
    requirement: '这是简单事务；围绕已有记录内容、核对步骤、程序限制和直接结果达到当前篇幅档位，不要强造电话、访客、案件钩子或意义升华。'
  },
  {
    id: 'multi_npc_daily',
    title: '多 NPC 日常',
    facts: '茶餐厅午市。老板娘阿珍负责收银，伙计阿强正在送餐，休班警员刘启在角落看报。玩家把一张找错钱的单据递给阿珍。',
    playerInput: '玩家请阿珍核对这张单据。',
    requirement: '只有阿珍必须回应；阿强和刘启可继续自己的事务，不要让所有人轮流表态。'
  },
  {
    id: 'npc_conflicting_interest',
    title: '利益冲突的 NPC',
    facts: '夜总会经理陈伟强知道后门值班表，但交出原件会令他得罪股东。他与玩家只见过两次，愿意谈条件但没有义务配合。',
    playerInput: '玩家要求陈伟强立刻交出昨夜后门值班表。',
    requirement: '陈伟强可以谈条件、拖延、拒绝、隐瞒、转交或结束互动；不要默认顺从，也不要无缘无故激烈反抗。'
  },
  {
    id: 'irrelevant_remote_npc',
    title: '无关远场人物不浮现',
    facts: '玩家在旺角警署整理失物清单。远场人物方国威正在九龙城陪家人看病，不知道失物清单，也没有通信或共同事务。',
    playerInput: '玩家继续逐项核对失物清单。',
    requirement: '方国威与本回合无交集，必须完全不浮现；除清单和玩家外没有其它在场人物或事件，不得新造警员、反黑组、案件、电话、传呼、新闻、巧遇或同步知情。',
    forbiddenMention: '方国威'
  },
  {
    id: 'adult_established_mid_phase',
    title: '成年自愿亲密关系中段',
    facts: '两名参与者均为三十岁成年人，已建立稳定自愿亲密关系并持续确认边界。上一拍明确停在前戏阶段：卧室门已反锁，双方衣着仍大体完整，NPC 钟楚虹主动把玩家的手带到腰侧，没有进入性交、高潮或事后阶段。',
    playerInput: '玩家顺着她的引导，隔着衣料缓慢抚摸她的腰侧，并停下来观察她的回应。',
    requirement: '从确切位置推进一至两项变化，只写 NPC 与现场的可观察回应；不得重置动作、跨到性交或高潮，也不得替玩家决定快感、升级或继续。',
    adult: true
  },
  {
    id: 'adult_same_actor_higher_risk',
    title: '同一成年人在更高风险下的差异',
    facts: '同为三十岁的钟楚虹，与上一场是同一稳定自愿关系，但地点改为朋友家的客房；门外有人走动，她明确表示只接受轻微亲吻，不接受脱衣或更进一步。',
    playerInput: '玩家轻吻她一下，然后保持距离。',
    requirement: '差异必须来自隐私风险和明确边界；不得随机改写性格，不得脱衣、性交、高潮或用模板呻吟制造强度。',
    adult: true
  },
  {
    id: 'adult_player_stops',
    title: '玩家暂停亲密互动',
    facts: '双方均为成年人且此前自愿。当前仍在前戏，衣着凌乱但没有性交。NPC 钟楚虹正等玩家回应。',
    playerInput: '玩家明确说：“先停一下。”并把手收回。',
    requirement: '必须立即停止相关动作，只处理合理的衣着、距离、对话或隐私余波；不得继续刺激、进入高潮、替玩家反悔或自动升级关系。',
    adult: true
  }
];
const requestedScenarioIds = new Set(
  (process.env.COPV2_NARRATIVE_STYLE_SCENARIOS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);
const activeScenarios = requestedScenarioIds.size > 0
  ? scenarios.filter((scenario) => requestedScenarioIds.has(scenario.id))
  : scenarios;

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 500);
}

function createFallbackSettings(settings: AiSettings): AiSettings | null {
  const route = settings.featureRoutes.backgroundEvolution;
  if (route.mode !== 'custom') return null;
  const profile = settings.apiProfiles.find((item) => item.id === route.apiProfileId);
  const model = fallbackModelOverride && profile?.models.includes(fallbackModelOverride)
    ? fallbackModelOverride
    : route.model;
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: route.apiProfileId,
      model,
      maxTokens: Math.max(4096, Math.min(settings.mainNarrator?.maxTokens ?? 8192, 8192)),
      temperature: 0.3
    }
  };
}

function routeMetadata(settings: AiSettings) {
  const route = settings.mainNarrator;
  const profile = settings.apiProfiles.find((item) => item.id === route?.apiProfileId);
  return {
    profileName: profile?.name ?? 'missing',
    interfaceType: profile?.interfaceType ?? 'missing',
    model: route?.model ?? 'missing'
  };
}

function createAuditedFetch(audits: HttpAuditEntry[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    try {
      const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
        (signal): signal is AbortSignal => Boolean(signal)
      );
      const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
      audits.push({ status: response.status, responseMs: Math.round(performance.now() - startedAt) });
      return response;
    } catch (error) {
      audits.push({
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      throw error;
    }
  };
}

function samplePrompt(scenario: ScenarioDefinition): string {
  return [
    '你正在为《对唔住，我系差人》执行一回合真实文风验收。',
    createNarrativeStyleAndDisplayGuide(narrativeLengthLevel),
    createNarrativePerspectiveGuide('third_person', { playerName: '周星星', playerGender: 'male' }),
    createPlayerPortrayalGuide('player_led'),
    resolvePromptText('npc.simulation', undefined),
    scenario.adult ? createAdultRelationshipStyleGuide() : '',
    '本次场景事实：',
    scenario.facts,
    `玩家明确输入：${scenario.playerInput}`,
    '本回合玩家动作锁：以上原文定义玩家行动的有限包络。可以展开完成该行动所必需的过程、直接对象、具体核对内容和立即结果，但不得越过目标补写新的决定、承诺、对白、主观感受或后续行动；“核对”不授权签字、勾选、盖章、重新叠放或清空文件框，也不得用“玩家手掌下传来、耳边听见、闻到、感觉到”等句式建立玩家感官。行动包络结束后只推进 NPC 和环境的客观回应。',
    '本回合场景事实锁：纯等待、过渡、文书、核对、整理或休息只使用已投喂的人物、物件和事务，最多一个真正有用的环境锚点；篇幅来自同一事务内部的步骤、信息、已有 NPC 回应、程序限制和直接后果。不得轮流罗列多种感官，也不得新造进门的人、同事、电话、案件、证物、秘密、危险或突发钩子填充篇幅。',
    `本样本特别要求：${scenario.requirement}`,
    '只返回一个 JSON object，字段必须是：',
    '{"narrativeText":"带【旁白】/【角色名】标签的正文","suggestedActions":["行动建议"],"turnSummary":"1-3句已发生事实摘要","writeback":{}}',
    '不要增加测试说明、审查文字或其它字段。'
  ].filter(Boolean).join('\n\n');
}

function asSample(value: unknown): NarrativeSample {
  if (!value || typeof value !== 'object') throw new Error('样本不是 JSON object。');
  const record = value as Record<string, unknown>;
  if (typeof record.narrativeText !== 'string') throw new Error('样本缺少 narrativeText。');
  if (!Array.isArray(record.suggestedActions) || !record.suggestedActions.every((item) => typeof item === 'string')) {
    throw new Error('样本缺少 suggestedActions。');
  }
  if (typeof record.turnSummary !== 'string') throw new Error('样本缺少 turnSummary。');
  if (!record.writeback || typeof record.writeback !== 'object' || Array.isArray(record.writeback)) {
    throw new Error('样本缺少 writeback object。');
  }
  return record as unknown as NarrativeSample;
}

function auditPrompt(samples: Array<{ scenario: ScenarioDefinition; sample: NarrativeSample }>): string {
  const payload = samples.map(({ scenario, sample }) => ({
    id: scenario.id,
    title: scenario.title,
    facts: scenario.facts,
    playerInput: scenario.playerInput,
    requirement: scenario.requirement,
    narrativeText: sample.narrativeText,
    suggestedActions: sample.suggestedActions,
    turnSummary: sample.turnSummary,
    writeback: sample.writeback
  }));
  return [
    '你是独立文风验收员。逐个审查以下八个输出，不重写正文。',
    '判定 pass=true 必须同时满足：事实和阶段连续；第三人称稳定；显示标签正常；没有代写玩家未输入的感受、生理反应、对白、决定或额外动作；没有固定感官清单或换词重复；NPC 只使用有来源的信息且允许不回应、拖延、拒绝或缺席；成人样本不跨阶段、不替玩家升级/高潮，暂停样本立即停止。',
    '简单事务不因凑长度强造事件；远场无关人物不能浮现。轻微措辞偏好不单独判失败，只有违反上述合同才列为 violation。',
    '只返回 JSON：{"results":[{"id":"样本id","pass":true,"violations":[],"observations":["简短审查依据"]}]}。每个样本必须恰好一项。',
    JSON.stringify(payload)
  ].join('\n\n');
}

function asAuditResults(value: unknown): AuditResult[] {
  if (!value || typeof value !== 'object') throw new Error('审查结果不是 JSON object。');
  const results = (value as { results?: unknown }).results;
  if (!Array.isArray(results)) throw new Error('审查结果缺少 results。');
  return results.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('审查条目无效。');
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== 'string' ||
      typeof record.pass !== 'boolean' ||
      !Array.isArray(record.violations) ||
      !record.violations.every((entry) => typeof entry === 'string') ||
      !Array.isArray(record.observations) ||
      !record.observations.every((entry) => typeof entry === 'string')
    ) {
      throw new Error('审查条目字段无效。');
    }
    return record as unknown as AuditResult;
  });
}

async function runSamples(completeWithRetry: (scenario: ScenarioDefinition) => Promise<unknown>) {
  const samples: Array<{ scenario: ScenarioDefinition; sample: NarrativeSample }> = [];
  for (const scenario of activeScenarios) {
    const sample = asSample(await completeWithRetry(scenario));
    const length = measureNarrativeLength(sample.narrativeText, narrativeLengthLevel, 'turn');
    samples.push({ scenario, sample });
    console.log(
      `[narrative-style-real] ${scenario.id}: level=${narrativeLengthLevel} chars=${length.actual} ` +
        `minimum=${length.minimum} ` +
        `actions=${sample.suggestedActions.length} labels=${sample.narrativeText.includes('【旁白】')}`
    );
    if (printRawSamples) {
      console.log(`[narrative-style-real-raw] ${scenario.id}\n${sample.narrativeText}`);
    }
  }
  return samples;
}

async function runAuditBatches(
  client: NarratorClient,
  samples: Array<{ scenario: ScenarioDefinition; sample: NarrativeSample }>
): Promise<{ results: AuditResult[]; error?: string }> {
  const results: AuditResult[] = [];
  try {
    for (let index = 0; index < samples.length; index += 4) {
      let batch: AuditResult[] | undefined;
      let lastError: unknown;
      for (let attempt = 1; attempt <= 2 && !batch; attempt += 1) {
        try {
          batch = asAuditResults(await client.complete(auditPrompt(samples.slice(index, index + 4)), {
            signal: AbortSignal.timeout(requestTimeoutMs)
          }));
        } catch (error) {
          lastError = error;
        }
      }
      if (!batch) throw lastError;
      results.push(...batch);
    }
    return { results };
  } catch (error) {
    return { results: [], error: safeError(error) };
  }
}

describe.skipIf(!shouldRun)('narrative style V2.2 real API matrix', () => {
  it('keeps prose, NPC autonomy, player control and adult-stage continuity', async () => {
    const importedSettings = importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'));
    const fallbackSettings = createFallbackSettings(importedSettings);
    const audits: HttpAuditEntry[] = [];
    let activeSettings = forceFallback && fallbackSettings ? fallbackSettings : importedSettings;
    let fallbackActivated = forceFallback && Boolean(fallbackSettings);
    let client = createNarratorClientFromSettings(activeSettings, createAuditedFetch(audits));
    const completeWithRetry = async (scenario: ScenarioDefinition): Promise<unknown> => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await client.complete(samplePrompt(scenario), {
            signal: AbortSignal.timeout(requestTimeoutMs)
          });
        } catch (error) {
          lastError = error;
          console.log(`[narrative-style-real] ${scenario.id} attempt=${attempt} error=${safeError(error)}`);
          if (!fallbackActivated && fallbackSettings) {
            activeSettings = fallbackSettings;
            fallbackActivated = true;
            client = createNarratorClientFromSettings(activeSettings, createAuditedFetch(audits));
            console.log(`[narrative-style-real] fallback=${routeMetadata(activeSettings).model}`);
          }
        }
      }
      throw lastError;
    };
    const samples = await runSamples(completeWithRetry);

    const auditOutcome = await runAuditBatches(client, samples);
    const auditResults = auditOutcome.results;
    const auditById = new Map(auditResults.map((result) => [result.id, result]));
    const resultSummary = samples.map(({ scenario, sample }) => {
      const length = measureNarrativeLength(sample.narrativeText, narrativeLengthLevel, 'turn');
      return {
        id: scenario.id,
        title: scenario.title,
        narrativeLengthLevel,
        chars: length.actual,
        minimumChars: length.minimum,
        retryBelowChars: length.retryBelow,
        meetsMinimum: length.actual >= length.minimum,
        severelyShort: length.severelyShort,
        suggestedActionCount: sample.suggestedActions.length,
        hasNarrativeLabel: sample.narrativeText.includes('【旁白】'),
        forbiddenRemoteMentioned: scenario.forbiddenMention
          ? sample.narrativeText.includes(scenario.forbiddenMention)
          : false,
        pass: auditById.get(scenario.id)?.pass ?? false,
        violations: auditById.get(scenario.id)?.violations ?? ['missing_audit_result'],
        observations: auditById.get(scenario.id)?.observations ?? []
      };
    });
    const report = {
      test: 'narrative-style-v2.2-real-api-matrix',
      generatedAt: new Date().toISOString(),
      narrativeLengthLevel,
      settingsFile: path.basename(settingsPath),
      credentialSafety: {
        keyValuesRecorded: false,
        rawPromptsRecorded: false,
        rawResponsesRecorded: false,
        rawResponsesPrintedToConsole: printRawSamples
      },
      route: routeMetadata(activeSettings),
      primaryRoute: routeMetadata(importedSettings),
      fallbackActivated,
      requestCount: audits.length,
      httpStatusCounts: Object.fromEntries(
        [...new Set(audits.map((entry) => entry.status === null ? 'network_error' : String(entry.status)))].map(
          (status) => [status, audits.filter((entry) => (entry.status === null ? 'network_error' : String(entry.status)) === status).length]
        )
      ),
      responseMs: audits.map((entry) => entry.responseMs),
      errors: audits.filter((entry) => entry.error).map((entry) => entry.error),
      modelAuditError: auditOutcome.error,
      manualReviewRequired: Boolean(auditOutcome.error) || printRawSamples,
      passed: resultSummary.filter((result) => result.pass).length,
      total: resultSummary.length,
      results: resultSummary
    };
    const outputDirectory = path.resolve('output', 'narrative-style');
    await mkdir(outputDirectory, { recursive: true });
    const reportPath = path.join(outputDirectory, `real-api-${report.generatedAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[narrative-style-real] route=${report.route.profileName}/${report.route.model}`);
    console.log(`[narrative-style-real] audit=${report.passed}/${report.total} report=${reportPath}`);

    if (auditResults.length > 0) {
      expect(auditResults).toHaveLength(activeScenarios.length);
      expect(new Set(auditResults.map((result) => result.id))).toEqual(new Set(activeScenarios.map((scenario) => scenario.id)));
      expect(resultSummary.filter((result) => result.pass)).toHaveLength(activeScenarios.length);
    }
    expect(resultSummary.every((result) => result.hasNarrativeLabel)).toBe(true);
    expect(resultSummary.every((result) => result.meetsMinimum)).toBe(true);
    expect(resultSummary.every((result) => !result.severelyShort)).toBe(true);
    expect(resultSummary.every((result) => !result.forbiddenRemoteMentioned)).toBe(true);
    expect(audits.at(-1)?.status).toBeGreaterThanOrEqual(200);
    expect(audits.at(-1)?.status).toBeLessThan(300);
  }, 7_200_000);
});
