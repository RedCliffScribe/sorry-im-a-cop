import { describe, expect, it } from 'vitest';
import type { StoryDiagnosticIssue } from '../runtime/types';
import {
  collectUnresolvedPartialWritebackDiagnostics,
  isPartialWritebackDiagnostic
} from './writebackDiagnostics';

function issue(
  path: Array<string | number>,
  code: string,
  message = code
): StoryDiagnosticIssue {
  return { path, code, message };
}

describe('writeback diagnostics final reconciliation', () => {
  it('keeps a genuinely unresolved validation loss', () => {
    const invalid = issue(
      ['writeback', 'financePatch', 'ledgerEntries', 0, 'amount'],
      'invalid_type'
    );

    expect(isPartialWritebackDiagnostic(invalid)).toBe(true);
    expect(collectUnresolvedPartialWritebackDiagnostics([invalid])).toEqual([invalid]);
  });

  it('suppresses an older validation warning after the same domain is repaired', () => {
    const invalid = issue(
      ['writeback', 'assetPatch', 'upsertItems', 0, 'accessSummary'],
      'invalid_type'
    );
    const repaired = issue(
      ['writeback', 'assetPatch'],
      'writeback_repair_applied'
    );

    expect(collectUnresolvedPartialWritebackDiagnostics([invalid, repaired])).toEqual([]);
  });

  it('does not let a repair receipt hide a later failure from the same domain', () => {
    const invalid = issue(
      ['writeback', 'actorPatches', 0, 'currentIdentity'],
      'invalid_type'
    );
    const repaired = issue(
      ['writeback', 'actorPatches'],
      'actor_writeback_recovery_applied'
    );
    const queued = issue(
      ['writeback', 'actorPatches'],
      'actor_writeback_recovery_queued'
    );

    expect(collectUnresolvedPartialWritebackDiagnostics([invalid, repaired, queued])).toEqual([queued]);
  });

  it('does not apply a recovery receipt to a different domain', () => {
    const invalidFinance = issue(
      ['writeback', 'financePatch', 'ledgerEntries', 0],
      'invalid_type'
    );
    const repairedAsset = issue(
      ['writeback', 'assetPatch'],
      'asset_writeback_applied'
    );

    expect(collectUnresolvedPartialWritebackDiagnostics([invalidFinance, repairedAsset])).toEqual([
      invalidFinance
    ]);
  });

  it('treats local guardrail rejections as diagnostics rather than writeback loss', () => {
    const invalidBirthDate = issue(
      ['writeback', 'actorPatches', 0, 'birthDate'],
      'actor_invalid_birth_date_ignored'
    );
    const rejectedRelationship = issue(
      ['writeback', 'relationshipThreadPatches', 0],
      'relationship_creation_rejected'
    );

    expect(collectUnresolvedPartialWritebackDiagnostics([
      invalidBirthDate,
      rejectedRelationship
    ])).toEqual([]);
  });

  it('deduplicates repeated unresolved diagnostics without hiding their loss', () => {
    const invalid = issue(
      ['writebackRepair', 'location', 'locationPatch', 'currentPlaceId'],
      'writeback_repair_unknown_location'
    );

    expect(collectUnresolvedPartialWritebackDiagnostics([invalid, { ...invalid }])).toEqual([invalid]);
  });
});
