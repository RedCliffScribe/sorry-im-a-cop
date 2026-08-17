import { getNarrativeLengthProfile } from '../settings/narrativeLength';
import type { NarrativeLengthLevel } from '../settings/narrativeLength';
import { dramaPlanSchema } from '../drama/planner';
import {
  dramaSourceKey,
  type DramaExecutionTrace,
  type DramaSourceRef
} from '../drama/types';
import { dramaExecutionTraceSchema } from '../writeback/schema';
import type { OpeningCoreActor } from './openingBlueprintSchema';
import type { LockedOpeningCast } from './openingCastDraft';
import type { OpeningLocalSkeleton } from './openingLocalSkeleton';
import {
  openingNarrativeDraftSchema,
  type OpeningNarrativeDraft
} from './openingSessionDraft';
import { composeOpeningPrompt } from './composeOpeningPrompt';

type ComposeOpeningPromptInput = Parameters<typeof composeOpeningPrompt>[0];

export class OpeningNarrativeContractError extends Error {
  constructor(readonly issues: string[]) {
    super(`开局正文阶段未通过合同：${issues.join('；')}`);
    this.name = 'OpeningNarrativeContractError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function dramaTraceContract(cast: LockedOpeningCast): {
  planId: string;
  allowedSourceRefs: DramaSourceRef[];
} | undefined {
  const parsed = dramaPlanSchema.safeParse(cast.dramaPlan);
  if (!parsed.success) return undefined;
  return {
    planId: parsed.data.planId,
    allowedSourceRefs: [
      ...(parsed.data.primarySource ? [parsed.data.primarySource] : []),
      ...parsed.data.supportSources
    ]
  };
}

function traceExample(cast: LockedOpeningCast): string {
  const contract = dramaTraceContract(cast);
  if (!contract) return '';
  return `,\n  "dramaExecutionTrace": {
    "planId": ${JSON.stringify(contract.planId)},
    "status": "not_used|used_as_texture|partially_used",
    "usedSourceRefs": [],
    "resultingWritebackRefs": []
  }`;
}

export function composeOpeningNarrativePhasePrompt({
  input,
  skeleton,
  cast,
  actorProfiles,
  narrativeLengthLevel
}: {
  input: ComposeOpeningPromptInput;
  skeleton: OpeningLocalSkeleton;
  cast: LockedOpeningCast;
  actorProfiles: OpeningCoreActor[];
  narrativeLengthLevel?: NarrativeLengthLevel;
}): string {
  const base = composeOpeningPrompt(input);
  const contextEnd = base.indexOf('\n生成目标：');
  const context = contextEnd >= 0 ? base.slice(0, contextEnd) : base;
  const profile = getNarrativeLengthProfile(narrativeLengthLevel);
  const safeTarget = Math.ceil((profile.openingMinimum * 1.25) / 50) * 50;

  return `${context}

## 开局 V2 第三阶段：只生成正文与行动

本地稳定骨架：
${JSON.stringify(skeleton)}

已锁定最小人物蓝图：
${JSON.stringify(cast)}

已逐人物通过严格校验的完整档案：
${JSON.stringify(actorProfiles)}

本阶段只写第一幕正文、轻量 presentationHints、对应行动文案和可选 DramaExecutionTrace。
不得输出或修改经济、住所、人物档案、人物数量、案件、资产、事项、记忆、压力、
延迟事件或其他 Runtime 写回。

正文目标约 ${profile.openingTarget} 个可见中文字符，安全目标 ${safeTarget}，
最低 ${profile.openingMinimum}。不得灌水，不得替玩家做出行动选项之外的新决定。
正文只能使用已经锁定的人物；身份、关系、动机、说话方式和在场位置必须服从档案。
suggestedActions 必须按 actionIntents 原顺序一一对应，只把 intent 改写成自然、
具体、可点击的玩家行动。
${
  dramaTraceContract(cast)
    ? `本次存在已验证 DramaPlan，必须返回 dramaExecutionTrace：
- planId 必须逐字使用本地计划值；
- status 只允许 not_used、used_as_texture、partially_used；
- not_used 时 usedSourceRefs 必须为 []；其余状态只能逐字引用 DramaPlan 的 primarySource/supportSources；
- 本阶段尚未生成 Runtime 写回，resultingWritebackRefs 必须为 []；
- 不得返回 used_persistently 或 customEventProgress。`
    : '本次没有 DramaPlan，必须完全省略 dramaExecutionTrace。'
}

只返回严格 JSON：
{
  "openingSessionId": ${JSON.stringify(skeleton.openingSessionId)},
  "narrativeText": "完整第一幕正文",
  "presentationHints": {
    "dialogueEmotions": ["serious", "worried"],
    "innerMonologueEmotions": []
  },
  "suggestedActions": ${JSON.stringify(
    cast.actionIntents.map((action) => ({
      actionId: action.actionId,
      text: `与“${action.intent}”对应的自然行动文案`
    }))
  )}${traceExample(cast)}
}

presentationHints 可省略；提供时两个数组分别按正文中对话与【内心】的出现顺序填写。
emotion 只允许 neutral/happy/excited/ecstatic/sad/angry/surprised/serious/worried/afraid/embarrassed/shy/tired/thinking/secretive。
不得在 presentationHints 中复制正文、角色名或 Runtime actorId。`;
}

export function validateOpeningNarrativeDraft(
  raw: unknown,
  skeleton: OpeningLocalSkeleton,
  cast: LockedOpeningCast
): OpeningNarrativeDraft {
  const parsed = openingNarrativeDraftSchema.parse(raw);
  const issues: string[] = [];
  if (parsed.openingSessionId !== skeleton.openingSessionId) {
    issues.push('openingSessionId 与本地骨架不一致');
  }
  const expected = cast.actionIntents.map((action) => action.actionId);
  const expectedSet = new Set(expected);
  const byExpectedId = new Map(
    parsed.suggestedActions
      .filter((action) => expectedSet.has(action.actionId))
      .map((action) => [action.actionId, action])
  );
  const unused = parsed.suggestedActions.filter(
    (action) => !expectedSet.has(action.actionId)
  );
  const suggestedActions = cast.actionIntents.map((intent, index) => {
    const matched = byExpectedId.get(intent.actionId);
    if (matched) return matched;
    const positional = unused.shift();
    if (positional) {
      return { ...positional, actionId: intent.actionId };
    }
    return {
      actionId: intent.actionId,
      text: intent.intent
    };
  });
  if (issues.length > 0) throw new OpeningNarrativeContractError(issues);
  return { ...parsed, suggestedActions };
}

export function createOpeningNarrativePhaseRetryPrompt({
  originalPrompt,
  issues,
  compact = false
}: {
  originalPrompt: string;
  issues: readonly string[];
  compact?: boolean;
}): string {
  return `${originalPrompt}

## 只重试正文阶段

上一份正文候选不会写入正式存档，人物蓝图和完整人物档案已经保留，禁止重新生成。
需要修复：
${issues.map((issue) => `- ${issue}`).join('\n')}

重新返回完整正文阶段 JSON。${
    compact
      ? '使用紧凑 JSON，不输出缩进和额外空白；不得降低正文最低篇幅。'
      : '不得返回运行态字段。'
  }`;
}

function normalizeTraceStatus(
  value: unknown
): 'not_used' | 'used_as_texture' | 'partially_used' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLocaleLowerCase();
  if (['not_used', 'unused', '未使用', '未采用'].includes(normalized)) {
    return 'not_used';
  }
  if (
    ['used_as_texture', 'texture', 'used', '作为氛围使用', '作为质感使用'].includes(
      normalized
    )
  ) {
    return 'used_as_texture';
  }
  if (
    ['partially_used', 'partial', 'partially', '部分使用', '部分采用'].includes(
      normalized
    )
  ) {
    return 'partially_used';
  }
  if (normalized === 'used_persistently') return 'partially_used';
  return undefined;
}

export function normalizeOpeningNarrativeDramaTrace(
  rawTrace: unknown,
  cast: LockedOpeningCast
): {
  trace?: DramaExecutionTrace;
  issues: string[];
  locallyNormalized: boolean;
} {
  const contract = dramaTraceContract(cast);
  if (!contract) {
    return {
      trace: undefined,
      issues: [],
      locallyNormalized: rawTrace !== undefined
    };
  }
  if (!isRecord(rawTrace)) {
    return {
      issues: ['dramaExecutionTrace 缺失或不是 object'],
      locallyNormalized: false
    };
  }
  const status = normalizeTraceStatus(rawTrace.status);
  if (!status) {
    return {
      issues: ['dramaExecutionTrace.status 无法识别'],
      locallyNormalized: false
    };
  }
  const allowedSources = new Map(
    contract.allowedSourceRefs.map((ref) => [dramaSourceKey(ref), ref])
  );
  const returnedSources = Array.isArray(rawTrace.usedSourceRefs)
    ? rawTrace.usedSourceRefs.flatMap((ref) => {
        if (!isRecord(ref)) return [];
        const key = dramaSourceKey({
          providerId: String(ref.providerId ?? ''),
          sourceType: String(ref.sourceType ?? ''),
          sourceId: String(ref.sourceId ?? '')
        });
        const allowed = allowedSources.get(key);
        return allowed ? [allowed] : [];
      })
    : [];
  const usedSourceRefs =
    status === 'not_used'
      ? []
      : returnedSources.length > 0
        ? [...new Map(returnedSources.map((ref) => [dramaSourceKey(ref), ref])).values()]
        : contract.allowedSourceRefs.slice(0, 1);
  const candidate = {
    planId: contract.planId,
    status,
    usedSourceRefs,
    resultingWritebackRefs: []
  };
  const parsed = dramaExecutionTraceSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'dramaExecutionTrace'} ${issue.message}`
      ),
      locallyNormalized: false
    };
  }
  return {
    trace: parsed.data,
    issues: [],
    locallyNormalized: JSON.stringify(parsed.data) !== JSON.stringify(rawTrace)
  };
}

export function createOpeningNarrativeTraceRepairPrompt({
  cast,
  narrative,
  issues
}: {
  cast: LockedOpeningCast;
  narrative: OpeningNarrativeDraft;
  issues: readonly string[];
}): string {
  const contract = dramaTraceContract(cast);
  if (!contract) throw new Error('当前开局没有可修复的 DramaPlan');
  return `只判断以下已经生成的第一幕正文是否采用了已锁定 DramaPlan，并修复执行回执。
不得改写或返回正文、行动、人物、经济、住所或任何 Runtime 写回。不要 Markdown。

DramaPlan：
${JSON.stringify(cast.dramaPlan, null, 2)}

第一幕正文：
${narrative.narrativeText}

原回执问题：
${issues.map((issue) => `- ${issue}`).join('\n')}

只返回：
{
  "dramaExecutionTrace": {
    "planId": ${JSON.stringify(contract.planId)},
    "status": "not_used|used_as_texture|partially_used",
    "usedSourceRefs": [],
    "resultingWritebackRefs": []
  }
}

规则：
- 正文没有采用计划时 status=not_used 且 usedSourceRefs=[]。
- 正文确实使用计划作为氛围或局部结构时，status 使用 used_as_texture 或 partially_used，usedSourceRefs 只能从以下值逐项原样复制：
${JSON.stringify(contract.allowedSourceRefs, null, 2)}
- resultingWritebackRefs 必须为 []；不得返回 used_persistently 或 customEventProgress。`;
}

const openingNarrativeTraceRepairSchema = openingNarrativeDraftSchema
  .pick({ dramaExecutionTrace: true })
  .required({ dramaExecutionTrace: true })
  .strict();

export function applyOpeningNarrativeTraceRepair(
  rawRepair: unknown,
  cast: LockedOpeningCast
): DramaExecutionTrace {
  const repair = openingNarrativeTraceRepairSchema.parse(rawRepair);
  const normalized = normalizeOpeningNarrativeDramaTrace(
    repair.dramaExecutionTrace,
    cast
  );
  if (!normalized.trace || normalized.issues.length > 0) {
    throw new OpeningNarrativeContractError(normalized.issues);
  }
  return normalized.trace;
}

export function createConservativeOpeningNarrativeTrace(
  cast: LockedOpeningCast
): DramaExecutionTrace | undefined {
  const contract = dramaTraceContract(cast);
  return contract
    ? {
        planId: contract.planId,
        status: 'not_used',
        usedSourceRefs: [],
        resultingWritebackRefs: []
      }
    : undefined;
}
