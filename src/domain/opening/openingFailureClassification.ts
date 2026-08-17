import { z } from 'zod';
import type { NarratorAttemptRecord } from '../narrator/NarratorClient';
import { NarratorTruncatedError } from '../narrator/NarratorErrors';
import { OpeningBlueprintQualityError } from './openingBlueprintQualityGate';
import { OpeningCivilianEmployerContractError } from './openingCivilianEmployerContract';
import { OpeningPhaseConsistencyError } from './validateOpeningPhaseConsistency';

export const openingFailureCodeSchema = z.enum([
  'opening_transport_failed',
  'opening_provider_capability_rejected',
  'opening_truncated',
  'opening_malformed_json',
  'opening_schema_failed',
  'opening_quality_gate_failed',
  'opening_cross_phase_failed',
  'opening_narrative_too_short',
  'opening_runtime_domain_failed',
  'opening_employer_contract_failed'
]);

export type OpeningFailureCode = z.infer<typeof openingFailureCodeSchema>;

export const openingRecoveryCodeSchema = z.enum([
  'opening_key_memory_string_normalized',
  'opening_key_memory_alias_normalized',
  'opening_key_memory_defaulted',
  'opening_key_memory_item_removed',
  'opening_key_memories_cleared',
  'opening_recent_memory_trimmed',
  'opening_recent_memory_alias_normalized',
  'opening_recent_memory_array_normalized',
  'opening_civilian_employer_invalid_removed',
  'opening_civilian_employer_inferred',
  'opening_civilian_employer_unresolved_allowed',
  'opening_unknown_optional_organization_removed',
  'opening_employer_contract_missing_upstream',
  'opening_cast_rebuilt_for_employer_contract'
]);

export type OpeningRecoveryCode = z.infer<typeof openingRecoveryCodeSchema>;

export const judgementFailureCodeSchema = z.enum([
  'judgement_intent_failed',
  'judgement_evidence_rejected',
  'judgement_resolution_failed',
  'judgement_narrative_conflict',
  'judgement_narrative_repair_failed'
]);

export type JudgementFailureCode = z.infer<typeof judgementFailureCodeSchema>;

export type StabilityFailureCode = OpeningFailureCode | JudgementFailureCode;

export type OpeningDiagnosticStage =
  | 'skeleton'
  | 'cast'
  | 'profiles'
  | 'narrative'
  | 'runtime'
  | 'consistency'
  | 'commit';

export interface OpeningFailureClassificationInput {
  stage: OpeningDiagnosticStage;
  error?: unknown;
  attempt?: NarratorAttemptRecord;
  providerCapabilityRejected?: boolean;
  narrativeTooShort?: boolean;
  runtimeDomainFailed?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

export function classifyOpeningFailure({
  stage,
  error,
  attempt,
  providerCapabilityRejected = false,
  narrativeTooShort = false,
  runtimeDomainFailed = false
}: OpeningFailureClassificationInput): OpeningFailureCode {
  if (providerCapabilityRejected) return 'opening_provider_capability_rejected';
  if (error instanceof NarratorTruncatedError || attempt?.parseStatus === 'truncated') {
    return 'opening_truncated';
  }
  if (attempt?.parseStatus === 'malformed_json') return 'opening_malformed_json';
  if (error instanceof OpeningBlueprintQualityError) return 'opening_quality_gate_failed';
  if (error instanceof OpeningCivilianEmployerContractError) {
    return 'opening_employer_contract_failed';
  }
  if (error instanceof OpeningPhaseConsistencyError || stage === 'consistency') {
    return 'opening_cross_phase_failed';
  }
  if (narrativeTooShort) return 'opening_narrative_too_short';
  if (runtimeDomainFailed) {
    return 'opening_runtime_domain_failed';
  }
  if (error instanceof z.ZodError || attempt?.parseStatus === 'schema_failed') {
    return 'opening_schema_failed';
  }

  const message = errorMessage(error);
  if (/response_format|max_tokens|capabilit|不支持|400|413|422/i.test(message)) {
    return 'opening_provider_capability_rejected';
  }
  return 'opening_transport_failed';
}
