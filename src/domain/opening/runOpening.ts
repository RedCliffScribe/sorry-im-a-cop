import { z } from 'zod';
import type {
  NarratorAttemptRecord,
  NarratorClient,
  NarratorDetailedCompletion,
  NarratorInput,
  NarratorRequestPurpose,
  NarratorStreamOptions
} from '../narrator/NarratorClient';
import { NarratorAttemptError, NarratorTruncatedError } from '../narrator/NarratorErrors';
import { estimateNarrativeTokens } from '../narrator/estimateNarrativeTokens';
import {
  createNarrativeLengthRetryPrompt,
  measureNarrativeLength,
  type NarrativeLengthMeasurement
} from '../narrator/narrativeLengthGuard';
import { resolveOpeningOutputBudget } from '../narrator/narratorLimits';
import { createInitialRuntimeState, type OpeningSetup } from '../runtime/initialState';
import type { RuntimeState } from '../runtime/types';
import type { NarrativeLengthLevel } from '../settings/narrativeLength';
import type {
  NarrativePerspective,
  PlayerPortrayalMode,
  PromptSettings,
  TavernManagementSettings
} from '../settings/types';
import { compileCreativeNarratorRequest } from '../prompts/creativePromptCompiler';
import { recordDramaTurn } from '../drama/runtime';
import { resolveOpeningCustomContentSupport } from '../drama/customContentProviders';
import { applyCustomContentDramaExecution } from '../customContent/dramaExecution';
import type { AppLocale } from '../localization/appLocale';
import { applyOpeningNarratorResponse } from './applyOpeningResponse';
import {
  composeOpeningBlueprintPrompt,
  createOpeningBlueprintRetryPrompt
} from './composeOpeningBlueprintPrompt';
import {
  composeOpeningInitializationPrompt,
  createOpeningInitializationRetryPrompt
} from './composeOpeningInitializationPrompt';
import { extractCompleteOpeningActionPreview } from './extractOpeningActionPreview';
import { mergeOpeningPhases } from './mergeOpeningPhases';
import {
  validateOpeningBlueprint,
  getOpeningNonCoreFallbacks,
  type OpeningBlueprint
} from './openingBlueprintSchema';
import {
  OpeningBlueprintQualityError,
  validateOpeningBlueprintQuality
} from './openingBlueprintQualityGate';
import {
  applyOpeningBlueprintFieldRepairs,
  createOpeningBlueprintFieldRepairPrompt,
  describeOpeningBlueprintNormalization,
  normalizeOpeningBlueprintCandidate,
  normalizeOpeningBlueprintRepairPaths
} from './openingBlueprintRecovery';
import type { OpeningExecutionStage } from './openingExecutionStage';
import { normalizeDramaticContentSettings } from '../drama/settings';
import type { DramaticContentSettings } from '../drama/types';
import {
  createOpeningDramaReceipt,
  dramaDiagnosticsToStoryIssues,
  normalizeOpeningDramaPlan,
  validateOpeningDramaExecutionTrace,
  validateOpeningDramaPlan
} from './openingDrama';
import {
  validateOpeningInitialization,
  type OpeningInitialization
} from './openingInitializationSchema';
import {
  OpeningPhaseConsistencyError,
  validateOpeningPhaseConsistency
} from './validateOpeningPhaseConsistency';

export interface RunOpeningInput {
  setup?: OpeningSetup;
  initialState?: RuntimeState;
  narrator: NarratorClient;
  repairNarrator?: NarratorClient;
  narrativeLengthLevel?: NarrativeLengthLevel;
  narrativePerspective?: NarrativePerspective;
  playerPortrayalMode?: PlayerPortrayalMode;
  locale?: AppLocale;
  promptSettings?: PromptSettings;
  tavernSettings?: TavernManagementSettings;
  dramaticContentSettings?: DramaticContentSettings;
  onNarrativeDelta?: (delta: string) => void;
  onNarrativeReset?: () => void;
  onRawText?: (rawText: string) => void;
  onStageChange?: (stage: OpeningExecutionStage) => void;
  onStageDetail?: (message: string | null) => void;
  onActionPreview?: (actions: string[]) => void;
  onAttempt?: (attempt: NarratorAttemptRecord) => void;
  onReasoningText?: (reasoningText: string) => void;
}

interface PhaseRequestCallbacks {
  onNarrativeDelta?: (delta: string) => void;
  onRawDelta?: (delta: string) => void;
  onRawText?: (rawText: string) => void;
  onReasoningText?: (reasoningText: string) => void;
}

interface PhaseExecutionOptions<T> {
  phase: 'blueprint' | 'initialization';
  prompt: string;
  narrator: NarratorClient;
  repairNarrator: NarratorClient;
  maxTokens: number;
  validate: (
    raw: unknown,
    context: { isRetry: boolean; purpose: NarratorRequestPurpose }
  ) => T;
  createRetryPrompt: (prompt: string, issues: string[], compact?: boolean) => string;
  createFieldRepairPrompt?: (issues: string[], repairPaths: string[]) => string;
  getValidationSource?: () => unknown;
  callbacks: PhaseRequestCallbacks;
  onAttempt?: (attempt: NarratorAttemptRecord) => void;
  onStageChange?: (stage: OpeningExecutionStage) => void;
  onStageDetail?: (message: string | null) => void;
  onBeforeRetry?: () => void;
  onPrompt?: (prompt: string) => void;
  compilePrompt?: (prompt: string) => NarratorInput;
}

class PhaseValidationError extends Error {
  constructor(
    readonly causeError: unknown,
    readonly issues: string[],
    readonly repairPaths: string[]
  ) {
    super(issues.join('；'));
    this.name = 'PhaseValidationError';
  }
}

class NarrativeLengthRetryError extends Error {
  constructor(readonly measurement: NarrativeLengthMeasurement) {
    super(
      `开局正文 ${measurement.actual} 字，低于重生成阈值 ${measurement.retryBelow} 字`
    );
    this.name = 'NarrativeLengthRetryError';
  }
}

function createFallbackAttempt(
  purpose: NarratorRequestPurpose,
  maxTokens: number,
  rawText: string
): NarratorAttemptRecord {
  const now = new Date().toISOString();
  return {
    attemptId: `attempt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    purpose,
    stream: false,
    requestedMaxTokens: maxTokens,
    finishReason: 'unknown',
    rawText,
    parseStatus: 'success',
    startedAt: now,
    finishedAt: now
  };
}

async function requestDetailed(
  narrator: NarratorClient,
  input: NarratorInput,
  purpose: NarratorRequestPurpose,
  maxTokens: number,
  callbacks: PhaseRequestCallbacks
): Promise<NarratorDetailedCompletion> {
  const options: NarratorStreamOptions = {
    requestPurpose: purpose,
    maxTokensOverride: maxTokens,
    onTextDelta: callbacks.onNarrativeDelta,
    onRawDelta: callbacks.onRawDelta,
    onRawText: callbacks.onRawText,
    onReasoningText: callbacks.onReasoningText
  };
  if (narrator.completeDetailed) {
    return narrator.completeDetailed(input, options);
  }

  let rawText = '';
  const value = await narrator.complete(input, {
    ...options,
    onRawText: (text) => {
      rawText = text;
      callbacks.onRawText?.(text);
    }
  });
  const serialized = rawText || JSON.stringify(value);
  return {
    value,
    attempt: createFallbackAttempt(purpose, maxTokens, serialized)
  };
}

function readIssuePath(
  raw: unknown,
  path: PropertyKey[]
): { exists: boolean; value: unknown } {
  let current = raw;
  for (const segment of path) {
    if (
      current === null ||
      current === undefined ||
      (typeof current !== 'object' && !Array.isArray(current)) ||
      !Object.hasOwn(current, segment)
    ) {
      return { exists: false, value: undefined };
    }
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return { exists: true, value: current };
}

function getValidationIssues(error: unknown, raw?: unknown): string[] {
  if (
    error instanceof OpeningBlueprintQualityError ||
    error instanceof OpeningPhaseConsistencyError
  ) {
    return error.issues;
  }
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => {
      const path = issue.path.join('.') || 'response';
      const rawValue = readIssuePath(raw, issue.path);
      if (issue.code === 'invalid_type' && (!rawValue.exists || rawValue.value === undefined)) {
        return `${path}：必填字段缺失`;
      }
      if (issue.code === 'invalid_type') {
        return `${path}：字段类型不符合要求（${issue.message}）`;
      }
      return `${path}：${issue.message}`;
    });
  }
  return [error instanceof Error ? error.message : String(error)];
}

function getValidationRepairPaths(error: unknown): string[] {
  if (error instanceof OpeningBlueprintQualityError) {
    return normalizeOpeningBlueprintRepairPaths(error.repairPaths);
  }
  if (error instanceof z.ZodError) {
    return normalizeOpeningBlueprintRepairPaths(
      error.issues.map((issue) => issue.path.join('.')).filter(Boolean)
    );
  }
  return [];
}

function markSchemaFailure(
  attempt: NarratorAttemptRecord,
  issues: string[]
): NarratorAttemptRecord {
  return {
    ...attempt,
    parseStatus: 'schema_failed',
    errorMessage: issues.join('；')
  };
}

function createJsonRepairPrompt(rawText: string, phase: 'blueprint' | 'initialization'): string {
  return `只修复以下 ${phase === 'blueprint' ? 'OpeningBlueprint' : 'OpeningInitialization'} 的 JSON 语法与结构边界。
不得改写正文、人物、关系、记忆、行动含义或任何事实；不得补写新的创作内容。
只返回修复后的完整 JSON object。

待修复原文：
${rawText}`;
}

async function executeOpeningPhase<T>(options: PhaseExecutionOptions<T>): Promise<T> {
  const primaryPurpose: NarratorRequestPurpose =
    options.phase === 'blueprint' ? 'opening_blueprint' : 'opening_initialization';

  const validateCompletion = (
    completion: NarratorDetailedCompletion,
    isRetry: boolean,
    purpose: NarratorRequestPurpose
  ): T => {
    if (completion.attempt.localJsonRepairApplied) {
      options.onStageChange?.('repairing_opening_json');
      options.onStageDetail?.('结构化结果修复中（本地语法修复）。');
    }
    try {
      const value = options.validate(completion.value, { isRetry, purpose });
      options.onAttempt?.(completion.attempt);
      return value;
    } catch (error) {
      if (error instanceof NarrativeLengthRetryError) {
        options.onAttempt?.(completion.attempt);
        throw error;
      }
      const issues = getValidationIssues(
        error,
        options.getValidationSource?.() ?? completion.value
      );
      const repairPaths = getValidationRepairPaths(error);
      options.onAttempt?.(markSchemaFailure(completion.attempt, issues));
      throw new PhaseValidationError(error, issues, repairPaths);
    }
  };

  let firstError: unknown;
  try {
    options.onPrompt?.(options.prompt);
    const first = await requestDetailed(
      options.narrator,
      options.compilePrompt?.(options.prompt) ?? options.prompt,
      primaryPurpose,
      options.maxTokens,
      options.callbacks
    );
    return validateCompletion(first, false, primaryPurpose);
  } catch (error) {
    firstError = error;
    if (error instanceof NarratorAttemptError) options.onAttempt?.(error.attempt);
  }

  const canRepairMalformedJson =
    firstError instanceof NarratorAttemptError &&
    !(firstError instanceof NarratorTruncatedError) &&
    firstError.attempt.parseStatus === 'malformed_json' &&
    firstError.attempt.rawText.trim().length > 0;

  if (
    firstError instanceof NarratorAttemptError &&
    !(firstError instanceof NarratorTruncatedError) &&
    !canRepairMalformedJson
  ) {
    throw firstError;
  }

  options.onBeforeRetry?.();
  options.onStageChange?.(
    canRepairMalformedJson
      ? 'repairing_opening_json'
      : firstError instanceof NarrativeLengthRetryError
        ? 'regenerating_opening_narrative'
      : 'retrying_opening_phase'
  );

  let retryNarrator = options.narrator;
  let retryPurpose: NarratorRequestPurpose = primaryPurpose;
  let retryPrompt: string;

  if (firstError instanceof NarratorTruncatedError) {
    options.onStageDetail?.(
      '输出长度不足，JSON 被截断。正在使用压缩结构重新生成当前阶段（第 1/1 次）。'
    );
    retryPurpose = 'opening_compact_retry';
    retryPrompt = options.createRetryPrompt(
      options.prompt,
      ['上一份输出因 finish_reason=length 被截断'],
      true
    );
  } else if (canRepairMalformedJson && firstError instanceof NarratorAttemptError) {
    options.onStageDetail?.('结构化结果修复中（模型修复第 1/1 次）。');
    retryNarrator = options.repairNarrator;
    retryPurpose = 'opening_json_repair';
    retryPrompt = createJsonRepairPrompt(firstError.attempt.rawText, options.phase);
  } else if (firstError instanceof NarrativeLengthRetryError) {
    options.onStageDetail?.('正文篇幅严重不足，正在完整重新生成正文（第 1/1 次）。');
    retryPrompt = createNarrativeLengthRetryPrompt(
      options.prompt,
      firstError.measurement
    );
  } else if (firstError instanceof PhaseValidationError) {
    if (options.phase === 'blueprint') {
      if (!options.createFieldRepairPrompt || firstError.repairPaths.length === 0) {
        throw new Error(
          `开局人物蓝图包含无法安全局部修复的问题：${firstError.issues.join('；')}`,
          { cause: firstError }
        );
      }
      options.onStageChange?.('repairing_opening_blueprint_fields');
      options.onStageDetail?.(
        '人物蓝图的核心资料缺失或非法，正在只补齐指定字段（第 1/1 次）。'
      );
      retryNarrator = options.repairNarrator;
      retryPurpose = 'opening_blueprint_field_repair';
      retryPrompt = options.createFieldRepairPrompt(
        firstError.issues,
        firstError.repairPaths
      );
    } else {
      options.onStageDetail?.(
        '开局运行状态未通过校验，正在重新生成运行状态（第 1/1 次）。'
      );
      retryPrompt = options.createRetryPrompt(options.prompt, firstError.issues);
    }
  } else {
    throw firstError;
  }

  try {
    options.onPrompt?.(retryPrompt);
    const retry = await requestDetailed(
      retryNarrator,
      retryPurpose === 'opening_json_repair' ||
        retryPurpose === 'opening_blueprint_field_repair'
        ? retryPrompt
        : options.compilePrompt?.(retryPrompt) ?? retryPrompt,
      retryPurpose,
      options.maxTokens,
      retryPurpose === 'opening_json_repair' ||
        retryPurpose === 'opening_blueprint_field_repair'
        ? {}
        : options.callbacks
    );
    const value = validateCompletion(retry, true, retryPurpose);
    options.onStageDetail?.(null);
    return value;
  } catch (error) {
    if (error instanceof NarratorAttemptError) options.onAttempt?.(error.attempt);
    const issues =
      error instanceof PhaseValidationError
        ? error.issues
        : [error instanceof Error ? error.message : String(error)];
    throw new Error(
      `${options.phase === 'blueprint' ? '开局人物蓝图' : '开局正文与运行状态'}在第 1/1 次恢复后仍失败：${issues.join('；')}`,
      { cause: error }
    );
  }
}

export async function runOpening({
  setup = {},
  initialState,
  narrator,
  repairNarrator = narrator,
  narrativeLengthLevel,
  narrativePerspective,
  playerPortrayalMode,
  locale,
  promptSettings,
  tavernSettings,
  dramaticContentSettings,
  onNarrativeDelta,
  onNarrativeReset,
  onRawText,
  onStageChange,
  onStageDetail,
  onActionPreview,
  onAttempt,
  onReasoningText
}: RunOpeningInput): Promise<RuntimeState> {
  const baseOpeningState = initialState ?? createInitialRuntimeState(setup);
  const openingState: RuntimeState = dramaticContentSettings
    ? {
        ...baseOpeningState,
        dramaticContent: {
          ...(baseOpeningState.dramaticContent ?? {
            instances: [],
            recentDiagnostics: []
          }),
          settings: normalizeDramaticContentSettings(dramaticContentSettings)
        }
      }
    : baseOpeningState;
  const openingMaxTokens = resolveOpeningOutputBudget(narrator.configuredMaxTokens);
  const effectiveDramaticContentSettings = normalizeDramaticContentSettings(
    openingState.dramaticContent?.settings ?? dramaticContentSettings
  );
  const requestStartedAt = Date.now();
  let narratorInputTokens = 0;
  let narratorOutputTokens = 0;
  let initializationRawText = '';
  let blueprintFallbacks: ReturnType<typeof getOpeningNonCoreFallbacks> = [];
  let blueprintRepairCandidate: unknown;
  let blueprintRepairPaths: string[] = [];
  const blueprintNormalizationPaths = new Set<string>();
  let blueprintFieldRepairApplied = false;
  const compileOpeningPrompt = (prompt: string): NarratorInput => {
    const compilation = compileCreativeNarratorRequest({
      runtimePrompt: prompt,
      promptSettings,
      tavernSettings,
      scope: 'opening',
      playerName: openingState.player.name
    });
    narratorInputTokens += estimateNarrativeTokens(
      compilation.messages.map((message) => message.content).join('\n')
    );
    return compilation.request;
  };

  const recordAttempt = (attempt: NarratorAttemptRecord) => {
    narratorOutputTokens += estimateNarrativeTokens(attempt.rawText);
    onAttempt?.(attempt);
  };

  onStageChange?.('preparing_opening');
  onStageDetail?.(null);
  onActionPreview?.([]);

  const blueprintPrompt = composeOpeningBlueprintPrompt({
    setup,
    initialState: openingState,
    narrativeLengthLevel,
    narrativePerspective,
    playerPortrayalMode,
    locale,
    promptSettings
  });
  onStageChange?.('generating_opening_blueprint');
  const openingDramaPlanningStartedAt = Date.now();
  const rawBlueprint = await executeOpeningPhase<OpeningBlueprint>({
    phase: 'blueprint',
    prompt: blueprintPrompt,
    narrator,
    repairNarrator,
    maxTokens: openingMaxTokens,
    validate: (raw, { purpose }) => {
      onStageChange?.('validating_opening_blueprint');
      const candidate =
        purpose === 'opening_blueprint_field_repair'
          ? applyOpeningBlueprintFieldRepairs(
              blueprintRepairCandidate,
              raw,
              blueprintRepairPaths
            )
          : raw;
      const normalized = normalizeOpeningBlueprintCandidate(candidate);
      blueprintRepairCandidate = normalized.value;
      normalized.repairedPaths.forEach((path) => blueprintNormalizationPaths.add(path));
      const parsed = validateOpeningBlueprint(normalized.value);
      const validated = validateOpeningBlueprintQuality(parsed, openingState);
      blueprintFallbacks = getOpeningNonCoreFallbacks(candidate, validated);
      if (purpose === 'opening_blueprint_field_repair') {
        blueprintFieldRepairApplied = true;
      }
      const detail = describeOpeningBlueprintNormalization(normalized.repairedPaths);
      if (detail) onStageDetail?.(detail);
      return validated;
    },
    createRetryPrompt: createOpeningBlueprintRetryPrompt,
    createFieldRepairPrompt: (issues, repairPaths) => {
      blueprintRepairPaths = normalizeOpeningBlueprintRepairPaths(repairPaths);
      const prompt = createOpeningBlueprintFieldRepairPrompt({
        candidate: blueprintRepairCandidate,
        issues,
        allowedPaths: blueprintRepairPaths
      });
      narratorInputTokens += estimateNarrativeTokens(prompt);
      return prompt;
    },
    getValidationSource: () => blueprintRepairCandidate,
    callbacks: { onRawText, onReasoningText },
    onAttempt: recordAttempt,
    onStageChange,
    onStageDetail,
    compilePrompt: compileOpeningPrompt
  });
  const openingCustomSupport = resolveOpeningCustomContentSupport({
    state: openingState
  });
  const openingDramaPlanResult = validateOpeningDramaPlan({
    openingId: openingState.world.dramaticOpeningId,
    rawPlan: rawBlueprint.dramaPlan,
    allowedSupportSourceRef: openingCustomSupport?.source.ref
  });
  const blueprint = normalizeOpeningDramaPlan(
    rawBlueprint,
    openingDramaPlanResult.plan
  );
  const openingDramaPlanningDurationMs = Date.now() - openingDramaPlanningStartedAt;
  let openingDramaDiagnostics = [...openingDramaPlanResult.diagnostics];

  const initializationPrompt = composeOpeningInitializationPrompt(
    blueprint,
    narrativeLengthLevel,
    {
      playerActorId: openingState.player.actorId,
      currentIdentity: openingState.player.currentIdentity,
      originBackground: openingState.player.originBackground,
      currentRoleProfile:
        openingState.actors[openingState.player.actorId]?.roleProfiles[
          openingState.player.currentIdentity
        ],
      lawIdentity:
        openingState.player.currentIdentity === 'police'
          ? openingState.lawIdentity
          : undefined,
      initialEconomy: openingState.player.economy,
      openingNote: setup.openingNote,
      initialActorIds: Object.keys(openingState.actors),
      initialOrganizationIds: Object.keys(openingState.organizations),
      openingCustomSupport: openingDramaPlanResult.plan
        ? openingCustomSupport?.payload
        : undefined
    }
  );
  let streamedRawText = '';
  let firstLengthMeasurement: NarrativeLengthMeasurement | undefined;
  let acceptedLengthMeasurement: NarrativeLengthMeasurement | undefined;
  let narrativeWasRegenerated = false;
  const handleInitializationRawDelta = (delta: string) => {
    streamedRawText += delta;
    const preview = extractCompleteOpeningActionPreview(streamedRawText);
    if (preview.length > 0) {
      onStageChange?.('preparing_action_preview');
      onActionPreview?.(preview);
    }
  };

  onStageChange?.('generating_opening_narrative');
  const initialization = await executeOpeningPhase<OpeningInitialization>({
    phase: 'initialization',
    prompt: initializationPrompt,
    narrator,
    repairNarrator,
    maxTokens: openingMaxTokens,
    validate: (raw, { isRetry }) => {
      onStageChange?.('generating_opening_state');
      const parsed = validateOpeningInitialization(raw);
      onStageChange?.('validating_opening_data');
      const validated = validateOpeningPhaseConsistency(
        openingState,
        blueprint,
        parsed
      );
      const length = measureNarrativeLength(
        validated.narrativeText,
        narrativeLengthLevel ?? 'standard',
        'opening'
      );
      acceptedLengthMeasurement = length;
      if (!isRetry) {
        firstLengthMeasurement = length;
        if (length.severelyShort) {
          narrativeWasRegenerated = true;
          throw new NarrativeLengthRetryError(length);
        }
      }
      return validated;
    },
    createRetryPrompt: createOpeningInitializationRetryPrompt,
    callbacks: {
      onNarrativeDelta,
      onRawDelta: handleInitializationRawDelta,
      onRawText: (rawText) => {
        initializationRawText = rawText;
        onRawText?.(rawText);
      },
      onReasoningText
    },
    onAttempt: recordAttempt,
    onStageChange,
    onStageDetail,
    compilePrompt: compileOpeningPrompt,
    onBeforeRetry: () => {
      streamedRawText = '';
      onNarrativeReset?.();
      onActionPreview?.([]);
    }
  });
  const openingDramaTraceResult = validateOpeningDramaExecutionTrace({
    rawTrace: initialization.dramaExecutionTrace,
    plan: openingDramaPlanResult.plan,
    blueprint,
    initialization
  });
  openingDramaDiagnostics = [
    ...openingDramaDiagnostics,
    ...openingDramaTraceResult.diagnostics
  ];

  onNarrativeReset?.();
  onNarrativeDelta?.(initialization.narrativeText);
  onActionPreview?.(initialization.suggestedActions.map((action) => action.text));

  const merged = mergeOpeningPhases(blueprint, initialization);
  if (narrativeWasRegenerated && firstLengthMeasurement) {
    merged.validationWarnings = [
      ...(merged.validationWarnings ?? []),
      {
        path: ['narrativeText'],
        code: 'narrative_length_regenerated',
        message: `首份开局正文 ${firstLengthMeasurement.actual} 字，低于重生成阈值 ${firstLengthMeasurement.retryBelow} 字，已完整重生成一次。`
      }
    ];
  }
  if (
    acceptedLengthMeasurement &&
    acceptedLengthMeasurement.actual < acceptedLengthMeasurement.minimum
  ) {
    merged.validationWarnings = [
      ...(merged.validationWarnings ?? []),
      {
        path: ['narrativeText'],
        code: 'narrative_length_below_minimum',
        message: `最终开局正文 ${acceptedLengthMeasurement.actual} 字，低于当前档位最低 ${acceptedLengthMeasurement.minimum} 字。`
      }
    ];
  }
  const openingDramaStoryIssues = dramaDiagnosticsToStoryIssues(
    openingDramaDiagnostics
  );
  if (openingDramaStoryIssues.length > 0) {
    merged.validationWarnings = [
      ...(merged.validationWarnings ?? []),
      ...openingDramaStoryIssues
    ];
  }
  if (blueprintFallbacks.length > 0) {
    merged.validationWarnings = [
      ...(merged.validationWarnings ?? []),
      {
        path: ['initialActors'],
        code: 'opening_non_core_fallback_applied',
        message: `开局人物仅对允许的非核心字段应用本地兜底：${blueprintFallbacks
          .map((fallback) => `${fallback.actorId}.${fallback.field}`)
          .join('、')}`
      }
    ];
  }
  if (blueprintNormalizationPaths.size > 0) {
    merged.validationWarnings = [
      ...(merged.validationWarnings ?? []),
      {
        path: ['initialActors'],
        code: 'opening_blueprint_local_normalization',
        message: `已在本地规范化可确定的开局蓝图格式：${[
          ...blueprintNormalizationPaths
        ].join('、')}`
      }
    ];
  }
  if (blueprintFieldRepairApplied) {
    merged.validationWarnings = [
      ...(merged.validationWarnings ?? []),
      {
        path: ['initialActors'],
        code: 'opening_blueprint_field_repaired',
        message: `开局蓝图只补齐了校验指定的核心字段：${blueprintRepairPaths.join('、')}`
      }
    ];
  }
  onStageChange?.('applying_opening');
  const appliedState = applyOpeningNarratorResponse(openingState, merged, {
    rawNarratorResponse: initializationRawText,
    turnMetrics: {
      inputTokens: narratorInputTokens,
      outputTokens: narratorOutputTokens,
      responseMs: Date.now() - requestStartedAt
    }
  });
  const stateWithCustomExecution = applyCustomContentDramaExecution({
    stateBeforeWriteback: openingState,
    stateAfterWriteback: appliedState,
    plan: openingDramaPlanResult.plan,
    trace: openingDramaTraceResult.trace
  });
  const openingId = openingState.world.dramaticOpeningId;
  if (!openingId && openingDramaDiagnostics.length === 0) {
    return stateWithCustomExecution;
  }
  return recordDramaTurn(
    stateWithCustomExecution,
    openingDramaTraceResult.trace,
    openingDramaDiagnostics,
    openingId
      ? createOpeningDramaReceipt({
          settings: effectiveDramaticContentSettings,
          plan: openingDramaPlanResult.plan,
          trace: openingDramaTraceResult.trace,
          diagnostics: openingDramaDiagnostics,
          inputCharacterCount: blueprintPrompt.length,
          planningDurationMs: openingDramaPlanningDurationMs,
          storypackInfluence: openingState.world.storypackInfluence,
          screenCharacterSeedsEnabled:
            openingState.world.screenCharacterSeedsEnabled !== false
        })
      : undefined
  );
}

export { runOpeningV2 } from './runOpeningV2';
