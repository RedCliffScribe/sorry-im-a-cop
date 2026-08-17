import { z } from 'zod';
import type { NarratorClient } from '../narrator/NarratorClient';
import { dramaSourceKey, type DramaPlan, type DramaPlanningContext, type DramaPlanningDiagnostic } from './types';
import { describeDramaPacing } from './settings';
import { allDramaPlanningSources } from './assemblePlanningContext';
import { sourcesShareHardRelation } from './coherence';

const sourceRefSchema = z.object({
  providerId: z.string().min(1),
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  dlcId: z.string().min(1).optional()
}).strict();

const oneSentenceSummarySchema = z.string().max(160).refine(
  (value) => !/[\r\n]/.test(value),
  '摘要只能是一句无换行文本。'
);

export const dramaPlanSchema = z.object({
  planId: z.string().min(1),
  planningScope: z.enum(['opening', 'turn']),
  mode: z.enum([
    'quiet',
    'continue_existing',
    'foreshadow',
    'surface',
    'escalate',
    'aftershock',
    'payoff'
  ]),
  primarySource: sourceRefSchema.nullable(),
  supportSources: z.array(sourceRefSchema),
  sceneFunction: z.enum([
    'rest',
    'texture',
    'information',
    'relationship',
    'pressure',
    'foreshadow',
    'choice',
    'aftershock',
    'payoff'
  ]),
  intensity: z.enum(['none', 'low', 'medium', 'high']),
  playerMayIgnore: z.boolean(),
  maxNewActors: z.number().int().min(0).max(4),
  adaptationSummary: oneSentenceSummarySchema.optional(),
  reasonSummary: oneSentenceSummarySchema
}).strict();

function buildPlannerPrompt(context: DramaPlanningContext): string {
  const candidates = allDramaPlanningSources(context);
  const recentExecutionSummary = context.recentExecutions.map((receipt) => ({
    turnCounter: receipt.turnCounter,
    planMode: receipt.planMode,
    traceStatus: receipt.traceStatus,
    primarySourceRef: receipt.primarySourceRef
  }));
  const pacingDecisionGuide =
    context.planningMode === 'official_dlc_only'
      ? '当前是玩家主动选择的官方 DLC 首次曝光窄规划：只能在官方 DLC 轻量来源与必要的当前动态之间决定是否自然接触 DLC。它不是强制任务；玩家当前行动、现场真值和 mandatory 来源优先，若本回合没有自然入口必须返回 quiet。不要发送或假设完整 DLC 阶段、人物档案或新闻模板已经发生。'
    : context.planningMode === 'custom_intent_only'
      ? '当前是原创节奏下的自定义意图窄规划：只能决定是否自然承接 user_requested 候选。它高于普通随机种子，但低于玩家当前行动、现场真值和 mandatory 来源；可以延后，不得把它改成必然发生。若本回合没有自然入口，应返回 quiet。'
      : context.pacing === 'dramatic' || context.pacing === 'cinematic'
      ? '当前节奏要求世界更主动：只要存在与玩家当前生活自然相交、且不冲突于现场真值的合适来源，应优先选择非 quiet 计划；quiet 只用于确实需要留白、当前行动应独占焦点或候选都不适合的回合。不要机械连续返回 quiet。'
      : context.pacing === 'balanced'
        ? '当前节奏要求日常与事件平衡：相关的到期事项、既有动态或自然交集应适时回到前台；不要在已有合适来源时机械连续返回 quiet，也不要为避免 quiet 而强行制造事件。'
        : context.pacing === 'life'
          ? '当前节奏允许较长安静空间；但已到期、直接相关或自然进入当前生活场景的既有动态仍应适时回流。'
          : '根据当前自定义节奏与候选事实作出轻量决定；quiet 是合法选择，但不能脱离最近编排结果机械重复。';
  const modeSemanticsGuide =
    'mode 必须描述来源在本回合的真实前台阶段：surface 只用于尚未在最近编排中进入前台的来源；同一来源已经出现后，应按事实选择 continue_existing、escalate、aftershock、payoff 或 quiet。没有新变化时可以 quiet，不得为了节奏或形式变化机械轮换 mode，也不得连续把同一来源重复标记为 surface。';
  return [
    '你是《对唔住，我系差人》的轻量前台编排器，只决定本回合是否需要突出某些既有事实或候选素材。',
    '你不是叙事模型，不写正文，不创造世界事实，不生成 NPC 档案。',
    '必须返回一个合法 JSON object，不要 Markdown。',
    '允许 mode=quiet。最多一个 primarySource；supportSources 不得超过预算。',
    '如果 candidates 中存在 mandatory=true 的来源，本回合不得返回 quiet，primarySource 必须引用其中一项强制来源；玩家明确行动仍决定该来源以何种方式进入现场，而不是让强制来源替玩家作决定。',
    'priorityClass=user_requested 表示玩家明确要求尽快呈现，但 mandatory 必须仍为 false。它高于普通随机静态种子、低于玩家当前行动和 mandatory 来源；可以因现场不合适而延后，但不可无理由永久忽略。',
    '只能引用 candidates 中完整存在的 ref。动态必需项优先；静态种子不能被当成已经发生的事实。',
    '玩家明确行动与当前现场真值优先。非强制内容必须允许玩家无视。',
    '不要输出思维链、正文、对白、状态 Patch，也不要宣布候选事件已经发生。',
    `长期节奏：${context.pacing}`,
    `规划模式：${context.planningMode}`,
    `规划路由：${context.planningRoute ?? 'auto'}`,
    `节奏偏好：${describeDramaPacing(context.settings)}`,
    `节奏决策要求：${pacingDecisionGuide}`,
    `模式语义要求：${modeSemanticsGuide}`,
    `最近编排结果：${JSON.stringify(recentExecutionSummary)}`,
    `支持素材上限：${context.materialBudget.supportLimit}`,
    `玩家输入：${context.playerInput ?? ''}`,
    `玩家角色：${JSON.stringify(context.playerRoleContext)}`,
    `最近回合摘要：${JSON.stringify(context.recentTurnSummaries)}`,
    `已曝光剧情弧摘要：${JSON.stringify((context.narrativeArcSummaries ?? []).map((arc) => ({
      arcInstanceId: arc.arcInstanceId,
      sourceRef: arc.sourceRef,
      arcType: arc.arcType,
      status: arc.status,
      currentStageId: arc.currentStageId,
      summary: arc.summary,
      lastProgressTurn: arc.lastProgressTurn
    })))}`,
    '已曝光剧情弧只提供紧凑摘要；不要把它当成强制任务。只有玩家行动存在自然入口时才可选择，否则返回 quiet；阶段推进只能引用本回合候选与回执中的结构化来源。',
    `官方 DLC 轻量来源：${JSON.stringify((context.officialDlcSources ?? []).map((candidate) => ({
      ref: candidate.ref,
      title: candidate.title,
      plannerSummary: candidate.plannerSummary,
      sourceStatus: candidate.sourceStatus,
      priorityClass: candidate.priorityClass,
      relatedActorIds: candidate.relatedActorIds,
      relatedPlaceIds: candidate.relatedPlaceIds
    })))}`,
    `候选：${JSON.stringify(candidates.map((candidate) => ({
      ref: candidate.ref,
      arcKey: candidate.arcKey,
      evidenceRefs: candidate.evidenceRefs,
      title: candidate.title,
      plannerSummary: candidate.plannerSummary,
      sourceStatus: candidate.sourceStatus,
      priorityClass: candidate.priorityClass,
      mandatory: candidate.mandatory,
      score: candidate.score,
      relatedActorIds: candidate.relatedActorIds,
      relatedOrganizationIds: candidate.relatedOrganizationIds,
      relatedPlaceIds: candidate.relatedPlaceIds,
      relatedCaseIds: candidate.relatedCaseIds
    })))}`,
    `planId 必须填写 "drama_plan_turn_${context.turnCounter}"。`,
    'planningScope 必须填写 "turn"。',
    '普通回合 maxNewActors 不得超过 2；reasonSummary 与 adaptationSummary 各最多一句。',
    '返回结构：{"planId":"drama_plan_turn_N","planningScope":"turn","mode":"quiet|continue_existing|foreshadow|surface|escalate|aftershock|payoff","primarySource":null,"supportSources":[],"sceneFunction":"rest|texture|information|relationship|pressure|foreshadow|choice|aftershock|payoff","intensity":"none|low|medium|high","playerMayIgnore":true,"maxNewActors":0,"reasonSummary":"一句话"}'
  ].join('\n');
}

function unwrapPlanningSourceRef(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return record.ref && typeof record.ref === 'object' && !Array.isArray(record.ref)
    ? record.ref
    : value;
}

function normalizePlannerResponse(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return {
    ...record,
    primarySource:
      record.primarySource == null
        ? null
        : unwrapPlanningSourceRef(record.primarySource),
    supportSources: Array.isArray(record.supportSources)
      ? record.supportSources.map(unwrapPlanningSourceRef)
      : record.supportSources,
    ...(record.adaptationSummary === null ? { adaptationSummary: undefined } : {})
  };
}

function parsePlannerResponse(raw: unknown): DramaPlan {
  let value = raw;
  if (typeof raw === 'string') {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first < 0 || last < first) throw new Error('规划接口没有返回 JSON object。');
    value = JSON.parse(raw.slice(first, last + 1));
  }
  const plan = dramaPlanSchema.parse(normalizePlannerResponse(value));
  // `quiet` is the conservative choice. Some providers echo the candidate
  // envelope they considered even after deciding not to surface it. Keep the
  // quiet decision and discard those non-executing references; unknown refs
  // in any non-quiet plan still fail normal source validation below.
  return plan.mode === 'quiet'
    ? {
        ...plan,
        primarySource: null,
        supportSources: [],
        sceneFunction: 'rest',
        intensity: 'none',
        maxNewActors: 0
      }
    : plan;
}

function normalizePlanForSourceLifecycle(
  plan: DramaPlan,
  context: DramaPlanningContext
): { plan: DramaPlan; diagnostic?: DramaPlanningDiagnostic } {
  if (!plan.primarySource || !['surface', 'foreshadow'].includes(plan.mode)) {
    return { plan };
  }
  const primary = allDramaPlanningSources(context).find(
    (candidate) => dramaSourceKey(candidate.ref) === dramaSourceKey(plan.primarySource!)
  );
  if (primary?.sourceStatus !== 'active_process') {
    return { plan };
  }
  return {
    plan: {
      ...plan,
      mode: 'continue_existing',
      maxNewActors: 0
    },
    diagnostic: {
      code: 'planning_mode_normalized',
      message: '已曝光的持续剧情来源被规划为首次曝光模式；本地已改为继续既有事件，并禁止据此新增人物。',
      turnCounter: context.turnCounter
    }
  };
}

export function validateDramaPlanAgainstContext(
  plan: DramaPlan,
  context: DramaPlanningContext
): void {
  if (plan.planId !== `drama_plan_turn_${context.turnCounter}`) {
    throw new Error('规划接口返回的 planId 与当前回合不匹配。');
  }
  if (plan.planningScope !== context.planningScope) {
    throw new Error('规划接口返回的 planningScope 与当前调用不匹配。');
  }
  if (plan.planningScope === 'turn' && plan.maxNewActors > 2) {
    throw new Error('普通回合最多只能引入两名新人物。');
  }
  const candidateKeys = new Set(allDramaPlanningSources(context).map((candidate) => dramaSourceKey(candidate.ref)));
  const refs = [
    ...(plan.primarySource ? [plan.primarySource] : []),
    ...plan.supportSources
  ];
  if (refs.some((ref) => !candidateKeys.has(dramaSourceKey(ref)))) {
    throw new Error('规划接口引用了候选列表之外的来源。');
  }
  if (plan.supportSources.length > context.materialBudget.supportLimit) {
    throw new Error('规划接口返回的支持素材超过当前预算。');
  }
  const requiredSourceKeys = new Set(
    context.requiredContextSources.map((candidate) => dramaSourceKey(candidate.ref))
  );
  if (requiredSourceKeys.size > 0) {
    if (
      plan.mode === 'quiet' ||
      !plan.primarySource ||
      !requiredSourceKeys.has(dramaSourceKey(plan.primarySource))
    ) {
      throw new Error('规划遗漏了到期或必须进入前台的来源。');
    }
  }
  if (plan.primarySource && context.userPrioritySources.length > 0) {
    const ordinaryStaticKeys = new Set(
      context.staticSeedSources.map((candidate) => dramaSourceKey(candidate.ref))
    );
    if (ordinaryStaticKeys.has(dramaSourceKey(plan.primarySource))) {
      throw new Error('规划不能让普通静态种子越过玩家明确要求的本局重点。');
    }
  }
  if (plan.mode !== 'quiet' && !plan.primarySource) {
    throw new Error('非安静计划必须提供一个 primarySource。');
  }
  if (plan.mode === 'quiet' && (plan.primarySource || plan.supportSources.length > 0)) {
    throw new Error('quiet 计划不应携带需要执行的来源。');
  }
  if (plan.primarySource) {
    const candidates = allDramaPlanningSources(context);
    const primary = candidates.find(
      (candidate) => dramaSourceKey(candidate.ref) === dramaSourceKey(plan.primarySource!)
    );
    if (!primary) throw new Error('规划接口的 primarySource 不存在。');
    for (const supportRef of plan.supportSources) {
      const support = candidates.find(
        (candidate) => dramaSourceKey(candidate.ref) === dramaSourceKey(supportRef)
      );
      if (!support || !sourcesShareHardRelation(primary, support)) {
        throw new Error('支持素材与主素材没有直接人物、案件、地点或同一弧线关联。');
      }
      if (support.arcKey && primary.arcKey && support.arcKey === primary.arcKey) {
        throw new Error('同一剧情弧线不能同时作为主素材和支持素材重复进入前台。');
      }
    }
  }
}

function fallbackModeForSource(
  source: ReturnType<typeof allDramaPlanningSources>[number]
): DramaPlan['mode'] {
  if (source.sourceStatus === 'active_process' || source.sourceStatus === 'confirmed_fact') {
    return 'continue_existing';
  }
  if (source.sourceStatus === 'static_seed' || source.sourceStatus === 'undecided_suggestion') {
    return 'foreshadow';
  }
  return 'surface';
}

function fallbackSceneFunction(
  source: ReturnType<typeof allDramaPlanningSources>[number]
): DramaPlan['sceneFunction'] {
  if (source.channelIds.includes('relationships')) return 'relationship';
  if (source.channelIds.includes('cases_law') || source.channelIds.includes('organizations')) return 'pressure';
  if (source.sourceStatus === 'static_seed' || source.sourceStatus === 'undecided_suggestion') return 'foreshadow';
  return 'information';
}

export function createFallbackDramaPlan(context: DramaPlanningContext): DramaPlan {
  const required = context.requiredContextSources[0];
  const worldMayInitiate =
    context.pacing === 'balanced' ||
    context.pacing === 'dramatic' ||
    context.pacing === 'cinematic' ||
    (
      context.pacing === 'custom' &&
      (context.settings.custom?.worldInitiative === 'high' ||
        context.settings.custom?.worldInitiative === 'very_high')
    );
  const optional = worldMayInitiate ? context.optionalDynamicSources[0] : undefined;
  const primary = required ?? optional ?? context.officialDlcSources?.[0];
  if (!primary) {
    return {
      planId: `drama_plan_turn_${context.turnCounter}`,
      planningScope: 'turn',
      mode: 'quiet',
      primarySource: null,
      supportSources: [],
      sceneFunction: 'rest',
      intensity: 'none',
      playerMayIgnore: true,
      maxNewActors: 0,
      reasonSummary: '规划接口不可用，且没有必须进入前台的既有事项，本回合保留安静空间。'
    };
  }
  return {
    planId: `drama_plan_turn_${context.turnCounter}`,
    planningScope: 'turn',
    mode: fallbackModeForSource(primary),
    primarySource: { ...primary.ref },
    supportSources: [],
    sceneFunction: fallbackSceneFunction(primary),
    intensity: primary.mandatory ? 'medium' : 'low',
    playerMayIgnore: !primary.mandatory,
    maxNewActors: primary.sourceStatus === 'static_seed' ? 1 : 0,
    reasonSummary: primary.mandatory
      ? '规划接口不可用，确定性降级只承接当前到期或强制事项。'
      : '规划接口不可用，确定性降级只延续当前最高相关的既有动态。'
  };
}

export function parseDramaticPlanCandidate({
  raw,
  context
}: {
  raw: unknown;
  context: DramaPlanningContext;
}): { plan?: DramaPlan; diagnostics: DramaPlanningDiagnostic[] } {
  try {
    const normalized = normalizePlanForSourceLifecycle(
      parsePlannerResponse(raw),
      context
    );
    validateDramaPlanAgainstContext(normalized.plan, context);
    return {
      plan: normalized.plan,
      diagnostics: normalized.diagnostic ? [normalized.diagnostic] : []
    };
  } catch (error) {
    return {
      diagnostics: [{
        code: error instanceof z.ZodError ? 'planning_schema_invalid' : 'planning_failed',
        message: error instanceof Error ? error.message : '戏剧规划失败。',
        turnCounter: context.turnCounter
      }]
    };
  }
}

export async function planDramaticTurn({
  context,
  client,
  signal
}: {
  context: DramaPlanningContext;
  client: NarratorClient;
  signal?: AbortSignal;
}): Promise<{ plan?: DramaPlan; diagnostics: DramaPlanningDiagnostic[] }> {
  try {
    const raw = await client.complete(buildPlannerPrompt(context), {
      signal,
      requestPurpose: 'auxiliary'
    });
    return parseDramaticPlanCandidate({ raw, context });
  } catch (error) {
    return {
      diagnostics: [{
        code: error instanceof z.ZodError ? 'planning_schema_invalid' : 'planning_failed',
        message: error instanceof Error ? error.message : '戏剧规划失败。',
        turnCounter: context.turnCounter
      }]
    };
  }
}
