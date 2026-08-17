import { describe, expect, it } from 'vitest';
import {
  evaluateRelationshipCreationEvidence,
  normalizeRelationshipEvidenceKind,
  normalizeRelationshipEvidenceRefs
} from './relationshipEvidence';

const stores = {
  memories: { memory_history: {} },
  cases: { case_known: {} },
  deferredEvents: { event_known: {} }
};

describe('relationship evidence recovery', () => {
  it.each([
    ['currentTurn', 'current_turn'],
    ['current-turn', 'current_turn'],
    ['本回合', 'current_turn'],
    ['memories', 'memory'],
    ['actor_memory', 'memory'],
    ['记忆', 'memory'],
    ['case_record', 'case'],
    ['案件', 'case'],
    ['deferredEvent', 'deferred_event'],
    ['event', 'deferred_event'],
    ['延期事件', 'deferred_event']
  ])('normalizes the finite alias %s', (input, expected) => {
    expect(normalizeRelationshipEvidenceKind(input)).toBe(expected);
  });

  it('keeps valid siblings when one evidence kind is invalid', () => {
    const result = normalizeRelationshipEvidenceRefs(
      [
        { kind: 'current_turn', refId: 'current_turn', summary: '本回合形成承诺。' },
        { kind: 'unknown_value', refId: 'memory_history', summary: '过去曾接触。' }
      ],
      ['writeback', 'relationshipThreadPatches', 0, 'evidenceRefs']
    );

    expect(result.evidenceRefs).toEqual([
      { kind: 'current_turn', refId: 'current_turn', summary: '本回合形成承诺。' }
    ]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_evidence_ref_removed' })
      ])
    );
  });

  it('requires a historical reference for repeated contact', () => {
    const result = evaluateRelationshipCreationEvidence(
      {
        threadId: 'rel_repeat',
        creationBasis: 'repeated_contact',
        evidenceRefs: [
          { kind: 'current_turn', refId: 'current_turn', summary: '本回合再次接触。' },
          { kind: 'current_turn', refId: 'current_turn', summary: '本回合另一个描述。' }
        ]
      },
      stores
    );

    expect(result.sufficient).toBe(false);
    expect(result.validCount).toBe(1);
    expect(result.historicalCount).toBe(0);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'relationship_evidence_ref_removed' }),
        expect.objectContaining({ code: 'relationship_evidence_insufficient' })
      ])
    );
  });

  it('accepts repeated contact only with two distinct real references', () => {
    const result = evaluateRelationshipCreationEvidence(
      {
        threadId: 'rel_repeat',
        creationBasis: 'repeated_contact',
        evidenceRefs: [
          { kind: 'current_turn', refId: 'current_turn', summary: '本回合再次接触。' },
          { kind: 'memory', refId: 'memory_history', summary: '此前已有一次接触。' }
        ]
      },
      stores
    );

    expect(result.sufficient).toBe(true);
    expect(result.validCount).toBe(2);
    expect(result.historicalCount).toBe(1);
  });

  it('does not count nonexistent memory, case, or deferred-event ids', () => {
    const result = evaluateRelationshipCreationEvidence(
      {
        threadId: 'rel_fake',
        creationBasis: 'repeated_contact',
        evidenceRefs: [
          { kind: 'memory', refId: 'memory_missing', summary: '不存在的记忆。' },
          { kind: 'case', refId: 'case_missing', summary: '不存在的案件。' },
          { kind: 'deferred_event', refId: 'event_missing', summary: '不存在的延期事件。' }
        ]
      },
      stores
    );

    expect(result.sufficient).toBe(false);
    expect(result.validRefs).toEqual([]);
    expect(result.diagnostics.filter((issue) => issue.code === 'relationship_evidence_ref_removed')).toHaveLength(3);
  });

  it('accepts an explicitly proposed same-turn case or deferred event id', () => {
    const result = evaluateRelationshipCreationEvidence(
      {
        threadId: 'rel_joint_case',
        creationBasis: 'ongoing_joint_matter',
        evidenceRefs: [
          { kind: 'case', refId: 'case_same_turn', summary: '本回合已建立的共同案件。' }
        ]
      },
      {
        ...stores,
        additionalCaseIds: ['case_same_turn']
      }
    );

    expect(result.sufficient).toBe(true);
  });
});
