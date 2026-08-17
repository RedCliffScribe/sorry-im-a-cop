export const DEFAULT_API_MAX_TOKENS = 32_768;
export const MIN_OPENING_OUTPUT_TOKENS = 32_768;

export type RequestOutputBudgetLimitingSource =
  | 'configured_max_tokens'
  | 'stage_budget'
  | 'provider_capability';

export interface RequestOutputBudget {
  configuredMaxTokens: number;
  configuredMaxTokensSource: 'player_route' | 'system_default';
  stageMaxTokens?: number;
  providerMaxOutputTokens?: number;
  requestedMaxTokens: number;
  limitingSource: RequestOutputBudgetLimitingSource;
}

function normalizePositiveTokenLimit(
  value: number | undefined
): number | undefined {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return undefined;
  }
  return Math.max(1, Math.floor(value));
}

export function resolveRequestOutputBudget({
  configuredMaxTokens,
  stageMaxTokens,
  providerMaxOutputTokens
}: {
  configuredMaxTokens?: number;
  stageMaxTokens?: number;
  providerMaxOutputTokens?: number;
}): RequestOutputBudget {
  const configured =
    normalizePositiveTokenLimit(configuredMaxTokens) ??
    DEFAULT_API_MAX_TOKENS;
  const stage = normalizePositiveTokenLimit(stageMaxTokens);
  const provider = normalizePositiveTokenLimit(providerMaxOutputTokens);
  const requested = Math.min(
    configured,
    stage ?? Number.POSITIVE_INFINITY,
    provider ?? Number.POSITIVE_INFINITY
  );
  const limitingSource: RequestOutputBudgetLimitingSource =
    provider !== undefined &&
    provider < configured &&
    provider < (stage ?? Infinity)
      ? 'provider_capability'
      : configured <= (stage ?? Infinity) &&
          (provider === undefined || configured <= provider)
        ? 'configured_max_tokens'
        : stage !== undefined
          ? 'stage_budget'
          : 'configured_max_tokens';

  return {
    configuredMaxTokens: configured,
    configuredMaxTokensSource:
      normalizePositiveTokenLimit(configuredMaxTokens) === undefined
        ? 'system_default'
        : 'player_route',
    ...(stage === undefined ? {} : { stageMaxTokens: stage }),
    ...(provider === undefined ? {} : { providerMaxOutputTokens: provider }),
    requestedMaxTokens: requested,
    limitingSource
  };
}

export function resolveOpeningRepairStageBudget(
  configuredMaxTokens?: number
): number {
  return (
    normalizePositiveTokenLimit(configuredMaxTokens) ?? DEFAULT_API_MAX_TOKENS
  );
}

export function resolveOpeningOutputBudget(configuredMaxTokens?: number): number {
  return Math.max(
    configuredMaxTokens ?? DEFAULT_API_MAX_TOKENS,
    MIN_OPENING_OUTPUT_TOKENS
  );
}
