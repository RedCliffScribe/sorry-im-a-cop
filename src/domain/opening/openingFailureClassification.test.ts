import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { NarratorAttemptRecord } from '../narrator/NarratorClient';
import { NarratorTruncatedError } from '../narrator/NarratorErrors';
import { OpeningBlueprintQualityError } from './openingBlueprintQualityGate';
import {
  classifyOpeningFailure,
  openingFailureCodeSchema,
  judgementFailureCodeSchema
} from './openingFailureClassification';
import { OpeningPhaseConsistencyError } from './validateOpeningPhaseConsistency';
import { OpeningCivilianEmployerContractError } from './openingCivilianEmployerContract';

function createAttempt(
  parseStatus: NarratorAttemptRecord['parseStatus']
): NarratorAttemptRecord {
  return {
    attemptId: 'attempt_test',
    purpose: 'opening_blueprint',
    stream: false,
    requestedMaxTokens: 8192,
    finishReason: parseStatus === 'truncated' ? 'length' : 'stop',
    rawText: '{}',
    parseStatus,
    startedAt: '2026-07-28T00:00:00.000Z',
    finishedAt: '2026-07-28T00:00:01.000Z'
  };
}

describe('opening failure classification', () => {
  it('keeps the documented opening and judgement taxonomies closed', () => {
    expect(openingFailureCodeSchema.options).toEqual([
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
    expect(judgementFailureCodeSchema.options).toHaveLength(5);
  });

  it('distinguishes truncation, malformed JSON, schema, quality, and cross-phase failures', () => {
    const truncatedAttempt = createAttempt('truncated');
    expect(
      classifyOpeningFailure({
        stage: 'cast',
        error: new NarratorTruncatedError(truncatedAttempt),
        attempt: truncatedAttempt
      })
    ).toBe('opening_truncated');
    expect(
      classifyOpeningFailure({
        stage: 'cast',
        attempt: createAttempt('malformed_json')
      })
    ).toBe('opening_malformed_json');
    expect(
      classifyOpeningFailure({
        stage: 'cast',
        error: z.object({ value: z.string() }).safeParse({}).error
      })
    ).toBe('opening_schema_failed');
    expect(
      classifyOpeningFailure({
        stage: 'cast',
        error: new OpeningBlueprintQualityError(['人物资料重复'], [])
      })
    ).toBe('opening_quality_gate_failed');
    expect(
      classifyOpeningFailure({
        stage: 'consistency',
        error: new OpeningPhaseConsistencyError(['会话不一致'])
      })
    ).toBe('opening_cross_phase_failed');
    expect(
      classifyOpeningFailure({
        stage: 'profiles',
        error: new OpeningCivilianEmployerContractError({
          actorId: 'opening_actor_civilian_work_relation_1',
          name: '梁锦青'
        })
      })
    ).toBe('opening_employer_contract_failed');
  });

  it('does not disguise provider capability and narrative-length failures as schema failures', () => {
    expect(
      classifyOpeningFailure({
        stage: 'cast',
        error: new Error('HTTP 422 response_format is unsupported')
      })
    ).toBe('opening_provider_capability_rejected');
    expect(
      classifyOpeningFailure({
        stage: 'narrative',
        narrativeTooShort: true
      })
    ).toBe('opening_narrative_too_short');
    expect(
      classifyOpeningFailure({
        stage: 'runtime',
        error: new Error('network disconnected')
      })
    ).toBe('opening_transport_failed');
    expect(
      classifyOpeningFailure({
        stage: 'runtime',
        error: new Error('memory domain invalid'),
        runtimeDomainFailed: true
      })
    ).toBe('opening_runtime_domain_failed');
  });
});
