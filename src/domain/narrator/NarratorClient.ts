export type NarratorFinishReason =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_calls'
  | 'unknown';

export type NarratorRequestPurpose =
  | 'opening_blueprint'
  | 'opening_initialization'
  | 'opening_json_repair'
  | 'opening_compact_retry'
  | 'opening_blueprint_field_repair'
  | 'opening_cast'
  | 'opening_cast_field_repair'
  | 'opening_actor_enrichment'
  | 'opening_actor_enrichment_repair'
  | 'opening_narrative'
  | 'opening_narrative_trace_repair'
  | 'opening_runtime'
  | 'opening_runtime_domain_repair'
  | 'main_turn'
  | 'main_turn_judgement_preflight'
  | 'main_turn_judgement_preflight_repair'
  | 'main_turn_judgement_retry'
  | 'main_turn_judgement_structure_repair'
  | 'main_turn_judgement_narrative_repair'
  | 'main_turn_actor_writeback_repair'
  | 'main_turn_case_lead_repair'
  | 'main_turn_case_action_repair'
  | 'main_turn_json_repair'
  | 'save_actor_writeback_repair'
  | 'auxiliary';

export type NarratorMessageRole = 'system' | 'user' | 'assistant';
export type NarratorMessageSource =
  | 'game_protocol'
  | 'builtin_fallback'
  | 'tavern_preset'
  | 'custom_cot'
  | 'persistent_prompt'
  | 'runtime_context'
  | 'player_input'
  | 'repair_protocol';

export interface NarratorMessage {
  role: NarratorMessageRole;
  content: string;
  source: NarratorMessageSource;
  sourceId?: string;
}

export interface StructuredNarratorRequest {
  messages: NarratorMessage[];
  reasoningOutput?: {
    mode: 'off' | 'provider' | 'json';
    maxCharacters: number;
  };
}

export type NarratorInput = string | StructuredNarratorRequest;

export interface NarratorAttemptRecord {
  attemptId: string;
  purpose: NarratorRequestPurpose;
  stream: boolean;
  requestedMaxTokens?: number;
  outputBudget?: RequestOutputBudget;
  finishReason: NarratorFinishReason;
  rawText: string;
  parseStatus: 'success' | 'truncated' | 'malformed_json' | 'schema_failed' | 'empty';
  errorMessage?: string;
  localJsonRepairApplied?: boolean;
  reasoningText?: string;
  startedAt: string;
  finishedAt: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  providerCapabilityFallback?: {
    capability: 'json_object_response_format';
    action: 'retried_without_capability';
    rejectedStatus: 400 | 422;
  };
}

export type NarratorAttemptStartRecord = Pick<
  NarratorAttemptRecord,
  | 'attemptId'
  | 'purpose'
  | 'stream'
  | 'requestedMaxTokens'
  | 'outputBudget'
  | 'startedAt'
>;

export interface NarratorDetailedCompletion {
  value: unknown;
  attempt: NarratorAttemptRecord;
  reasoningText?: string;
}

export interface NarratorStreamOptions {
  onTextDelta?: (delta: string) => void;
  onRawDelta?: (delta: string) => void;
  onRawText?: (rawText: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onReasoningText?: (reasoningText: string) => void;
  onAttemptStart?: (attempt: NarratorAttemptStartRecord) => void;
  onAttempt?: (attempt: NarratorAttemptRecord) => void;
  signal?: AbortSignal;
  maxTokensOverride?: number;
  stageMaxTokens?: number;
  requestPurpose?: NarratorRequestPurpose;
}

export interface NarratorImageInput {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  dataUrl: string;
}

export interface NarratorClient {
  readonly configuredMaxTokens?: number;
  complete(input: NarratorInput, options?: NarratorStreamOptions): Promise<unknown>;
  completeDetailed?(
    input: NarratorInput,
    options?: NarratorStreamOptions
  ): Promise<NarratorDetailedCompletion>;
  completeWithImages?(
    prompt: string,
    images: readonly NarratorImageInput[],
    options?: NarratorStreamOptions
  ): Promise<unknown>;
}
import type { RequestOutputBudget } from './narratorLimits';
