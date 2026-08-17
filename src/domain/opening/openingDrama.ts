import type { StoryDiagnosticIssue } from '../runtime/types';
import { dramaPlanSchema } from '../drama/planner';
import { getDramaticOpeningSourceRef } from '../drama/openingRegistry';
import {
  dramaSourceKey,
  type DramaExecutionReceipt,
  type DramaExecutionTrace,
  type DramaPlan,
  type DramaPlanningDiagnostic,
  type DramaSourceRef,
  type DramaWritebackRef,
  type DramaticContentSettings
} from '../drama/types';
import { dramaExecutionTraceSchema } from '../writeback/schema';
import type { OpeningBlueprint } from './openingBlueprintSchema';
import type { OpeningInitialization } from './openingInitializationSchema';

function writebackRefKey(ref: DramaWritebackRef): string {
  return `${ref.kind}:${ref.id}`;
}

function addRef(
  refs: Map<string, DramaWritebackRef>,
  kind: string,
  id: string | undefined
): void {
  if (!id) return;
  const ref = { kind, id };
  refs.set(writebackRefKey(ref), ref);
}

export function collectOpeningDramaWritebackRefs(
  blueprint: OpeningBlueprint,
  initialization: OpeningInitialization
): DramaWritebackRef[] {
  const refs = new Map<string, DramaWritebackRef>();
  blueprint.initialActors.forEach((actor) => addRef(refs, 'actor', actor.actorId));
  initialization.casePatches?.forEach((patch) => addRef(refs, 'case', patch.caseId));
  initialization.caseEvidencePatches?.forEach((patch) =>
    addRef(refs, 'case_evidence', patch.evidenceId)
  );
  initialization.currentMatterPatches?.forEach((patch) =>
    addRef(refs, 'current_matter', patch.id)
  );
  initialization.deferredEventPatches?.forEach((patch) =>
    addRef(refs, 'deferred_event', patch.eventId)
  );
  initialization.pressureSeeds?.forEach((seed) =>
    addRef(refs, 'pressure', seed.pressureId)
  );
  initialization.secretFacts?.forEach((fact) =>
    addRef(refs, 'secret_fact', fact.secretId)
  );
  if (initialization.playerStatePatch) addRef(refs, 'player', 'player');
  if (initialization.financePatch) addRef(refs, 'finance', 'player');
  if (initialization.assetPatch) addRef(refs, 'asset', 'player');
  return [...refs.values()];
}

function createDiagnostic(
  code: DramaPlanningDiagnostic['code'],
  message: string
): DramaPlanningDiagnostic {
  return {
    code,
    message,
    turnCounter: 0
  };
}

export function validateOpeningDramaPlan({
  openingId,
  rawPlan,
  allowedSupportSourceRef
}: {
  openingId: string | undefined;
  rawPlan: unknown;
  allowedSupportSourceRef?: DramaSourceRef;
}): { plan?: DramaPlan; diagnostics: DramaPlanningDiagnostic[] } {
  if (!openingId) {
    return rawPlan === undefined
      ? { diagnostics: [] }
      : {
          diagnostics: [
            createDiagnostic(
              'planning_schema_invalid',
              '未开启戏剧化开局，但人物蓝图返回了 DramaPlan；已忽略该计划。'
            )
          ]
        };
  }

  if (rawPlan === undefined) {
    return {
      diagnostics: [
        createDiagnostic(
          'planning_schema_invalid',
          '戏剧化开局人物蓝图未返回 DramaPlan；已按普通两阶段开局继续。'
        )
      ]
    };
  }

  const parsed = dramaPlanSchema.safeParse(rawPlan);
  if (!parsed.success) {
    return {
      diagnostics: [
        createDiagnostic(
          'planning_schema_invalid',
          `开局 DramaPlan 格式无效，已忽略计划：${parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'plan'} ${issue.message}`)
            .join('；')}`
        )
      ]
    };
  }

  const plan = parsed.data;
  const expectedRef = getDramaticOpeningSourceRef(openingId);
  const expectedPlanId = `drama_plan_opening_${openingId}`;
  const issues: string[] = [];
  if (!expectedRef) issues.push('开局结构未在注册表中找到');
  if (plan.planId !== expectedPlanId) issues.push(`planId 应为 ${expectedPlanId}`);
  if (plan.planningScope !== 'opening') issues.push('planningScope 必须为 opening');
  if (plan.mode === 'quiet') issues.push('已选择的戏剧化开局不能返回 quiet');
  if (!plan.primarySource || !expectedRef) {
    issues.push('primarySource 必须引用当前开局结构');
  } else if (dramaSourceKey(plan.primarySource) !== dramaSourceKey(expectedRef)) {
    issues.push('primarySource 与当前开局结构不一致');
  }
  if (plan.supportSources.length > 1) {
    issues.push('开局最多允许一个自定义支持来源');
  } else if (allowedSupportSourceRef) {
    if (plan.supportSources.length !== 1) {
      issues.push('玩家已选择第一幕支持内容，supportSources 必须包含该唯一来源');
    } else if (
      dramaSourceKey(plan.supportSources[0]) !==
      dramaSourceKey(allowedSupportSourceRef)
    ) {
      issues.push('supportSources 不是玩家选择并通过适配的自定义来源');
    }
  } else if (plan.supportSources.length > 0) {
    issues.push('当前没有获授权的开局支持内容，supportSources 必须为空');
  }
  if (!plan.playerMayIgnore) issues.push('戏剧化开局必须允许玩家不继续追随');
  if (plan.maxNewActors > 4) issues.push('开局最多允许四名新人物');
  if (plan.intensity === 'none') issues.push('已选择的戏剧化开局 intensity 不能为 none');

  return issues.length > 0
    ? {
        diagnostics: [
          createDiagnostic(
            'plan_source_missing',
            `开局 DramaPlan 未通过本地边界校验，已忽略计划：${issues.join('；')}`
          )
        ]
      }
    : { plan, diagnostics: [] };
}

export function normalizeOpeningDramaPlan(
  blueprint: OpeningBlueprint,
  plan: DramaPlan | undefined
): OpeningBlueprint {
  const { dramaPlan: _ignored, ...rest } = blueprint;
  return plan ? { ...rest, dramaPlan: plan } : rest;
}

export function validateOpeningDramaExecutionTrace({
  rawTrace,
  plan,
  blueprint,
  initialization
}: {
  rawTrace: unknown;
  plan: DramaPlan | undefined;
  blueprint: OpeningBlueprint;
  initialization: OpeningInitialization;
}): { trace?: DramaExecutionTrace; diagnostics: DramaPlanningDiagnostic[] } {
  if (!plan) {
    return rawTrace === undefined
      ? { diagnostics: [] }
      : {
          diagnostics: [
            createDiagnostic(
              'execution_trace_plan_mismatch',
              '当前开局没有有效 DramaPlan，但第二阶段返回了执行回执；已忽略回执。'
            )
          ]
        };
  }

  if (rawTrace === undefined) {
    return {
      diagnostics: [
        createDiagnostic(
          'execution_trace_plan_mismatch',
          '开局第二阶段未返回 DramaExecutionTrace；正文与合法写回已保留。'
        )
      ]
    };
  }

  const parsed = dramaExecutionTraceSchema.safeParse(rawTrace);
  if (!parsed.success) {
    return {
      diagnostics: [
        createDiagnostic(
          'execution_trace_schema_invalid',
          `开局 DramaExecutionTrace 格式无效，已忽略回执：${parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'trace'} ${issue.message}`)
            .join('；')}`
        )
      ]
    };
  }

  const trace = parsed.data;
  const issues: Array<{ code: DramaPlanningDiagnostic['code']; message: string }> = [];
  if (trace.planId !== plan.planId) {
    issues.push({
      code: 'execution_trace_plan_mismatch',
      message: `回执 planId "${trace.planId}" 与开局计划 "${plan.planId}" 不一致`
    });
  }

  const allowedSourceKeys = new Set(
    [plan.primarySource, ...plan.supportSources]
      .filter((ref): ref is NonNullable<DramaPlan['primarySource']> => Boolean(ref))
      .map(dramaSourceKey)
  );
  const invalidSource = trace.usedSourceRefs.find(
    (ref) => !allowedSourceKeys.has(dramaSourceKey(ref))
  );
  if (invalidSource) {
    issues.push({
      code: 'execution_trace_source_missing',
      message: `回执引用了计划之外的来源 ${dramaSourceKey(invalidSource)}`
    });
  }

  const actualWritebackKeys = new Set(
    collectOpeningDramaWritebackRefs(blueprint, initialization).map(writebackRefKey)
  );
  const invalidWriteback = trace.resultingWritebackRefs.find(
    (ref) => !actualWritebackKeys.has(writebackRefKey(ref))
  );
  if (invalidWriteback) {
    issues.push({
      code: 'execution_trace_writeback_missing',
      message: `回执引用了本次开局并未提交的写回 ${writebackRefKey(invalidWriteback)}`
    });
  }

  const persistentWithoutWriteback =
    trace.status === 'used_persistently' && trace.resultingWritebackRefs.length === 0;
  const nonPersistentWithWriteback =
    trace.status !== 'used_persistently' && trace.resultingWritebackRefs.length > 0;
  const unusedWithSources =
    trace.status === 'not_used' && trace.usedSourceRefs.length > 0;
  if (persistentWithoutWriteback || nonPersistentWithWriteback || unusedWithSources) {
    issues.push({
      code: 'execution_trace_status_invalid',
      message: persistentWithoutWriteback
        ? '持久使用必须引用至少一条真实写回'
        : nonPersistentWithWriteback
          ? '非持久使用不能声明持久写回引用'
          : 'not_used 不能声明已经使用的来源'
    });
  }
  const usedCustomEventInstanceIds = new Set(
    trace.usedSourceRefs
      .filter(
        (ref) =>
          ref.providerId === 'custom-event-group' &&
          ref.sourceType === 'custom_event_group_instance'
      )
      .map((ref) => ref.sourceId)
  );
  const resultingWritebackKeys = new Set(
    trace.resultingWritebackRefs.map(writebackRefKey)
  );
  const seenProgressInstanceIds = new Set<string>();
  const invalidProgress = trace.customEventProgress?.find((progress) => {
    const valid =
      trace.status === 'used_persistently' &&
      usedCustomEventInstanceIds.has(progress.instanceId) &&
      !seenProgressInstanceIds.has(progress.instanceId) &&
      progress.supportingWritebackRefs.every((ref) =>
        resultingWritebackKeys.has(writebackRefKey(ref))
      ) &&
      progress.factStateChanges.every((change) =>
        change.supportingWritebackRefs.every((ref) =>
          resultingWritebackKeys.has(writebackRefKey(ref))
        )
      );
    if (valid) seenProgressInstanceIds.add(progress.instanceId);
    return !valid;
  });
  if (invalidProgress) {
    issues.push({
      code: 'execution_trace_custom_progress_invalid',
      message:
        '开局自定义事件进度必须对应实际使用的事件，且只能引用本次已声明的真实写回'
    });
  }

  return issues.length > 0
    ? {
        diagnostics: issues.map((issue) => createDiagnostic(issue.code, issue.message))
      }
    : { trace, diagnostics: [] };
}

export function dramaDiagnosticsToStoryIssues(
  diagnostics: DramaPlanningDiagnostic[]
): StoryDiagnosticIssue[] {
  return diagnostics.map((diagnostic) => ({
    path: ['dramaticContent'],
    code: diagnostic.code,
    message: diagnostic.message
  }));
}

export function createOpeningDramaReceipt({
  settings,
  plan,
  trace,
  diagnostics,
  inputCharacterCount,
  planningDurationMs,
  storypackInfluence,
  screenCharacterSeedsEnabled
}: {
  settings: DramaticContentSettings;
  plan: DramaPlan | undefined;
  trace: DramaExecutionTrace | undefined;
  diagnostics: DramaPlanningDiagnostic[];
  inputCharacterCount: number;
  planningDurationMs: number;
  storypackInfluence: DramaExecutionReceipt['storypackInfluence'];
  screenCharacterSeedsEnabled: boolean;
}): DramaExecutionReceipt {
  return {
    turnCounter: 0,
    pacing: settings.pacing,
    planningRoute: settings.planningRoute,
    materialLevel: settings.materialLevel,
    storypackInfluence,
    screenCharacterSeedsEnabled,
    planningCalled: true,
    planningSucceeded: Boolean(plan),
    planningDurationMs,
    inputCandidateCount: 1,
    inputCharacterCount,
    estimatedInputTokens: Math.ceil(inputCharacterCount / 2),
    planMode: plan?.mode,
    primarySourceRef: plan?.primarySource ?? undefined,
    supportSourceRefs: plan?.supportSources ?? [],
    usedSourceRefs: trace?.usedSourceRefs ?? [],
    traceStatus: trace?.status,
    persistentWriteCount: trace?.resultingWritebackRefs.length ?? 0,
    degradeReason:
      diagnostics.length > 0
        ? diagnostics.map((diagnostic) => diagnostic.code).join(',')
        : undefined,
    filterRuleIds: []
  };
}
