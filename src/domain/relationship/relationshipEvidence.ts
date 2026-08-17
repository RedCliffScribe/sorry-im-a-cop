import type {
  RelationshipCreationBasis,
  RelationshipEvidenceRef,
  StoryDiagnosticIssue
} from '../runtime/types';
import type { RelationshipThreadPatch } from './relationshipThread';

export interface RelationshipEvidenceStores {
  memories: Record<string, unknown>;
  cases: Record<string, unknown>;
  deferredEvents: Record<string, unknown>;
  additionalCaseIds?: Iterable<string>;
  additionalDeferredEventIds?: Iterable<string>;
}

export interface RelationshipEvidenceEvaluation {
  requiredCount: number;
  validRefs: RelationshipEvidenceRef[];
  validCount: number;
  historicalCount: number;
  sufficient: boolean;
  issues: string[];
  diagnostics: StoryDiagnosticIssue[];
}

export interface NormalizedRelationshipEvidenceRefs {
  evidenceRefs: RelationshipEvidenceRef[];
  diagnostics: StoryDiagnosticIssue[];
}

const relationshipEvidenceKindAliases: Record<string, RelationshipEvidenceRef['kind']> = {
  current_turn: 'current_turn',
  currentturn: 'current_turn',
  '本回合': 'current_turn',
  memory: 'memory',
  memories: 'memory',
  actor_memory: 'memory',
  '记忆': 'memory',
  case: 'case',
  case_record: 'case',
  '案件': 'case',
  deferred_event: 'deferred_event',
  deferredevent: 'deferred_event',
  event: 'deferred_event',
  '延期事件': 'deferred_event'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAliasToken(value: string): string {
  return value.trim().replace(/[\s-]+/g, '_').toLowerCase();
}

function printableValue(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return (serialized ?? String(value)).slice(0, 120);
}

export function normalizeRelationshipEvidenceKind(value: unknown): RelationshipEvidenceRef['kind'] | undefined {
  if (typeof value !== 'string') return undefined;
  return relationshipEvidenceKindAliases[normalizeAliasToken(value)];
}

export function getRawRelationshipThreadPatches(value: unknown): unknown[] {
  if (!isRecord(value)) return [];
  const writeback = value.writeback;
  if (!isRecord(writeback)) return [];
  const patches = writeback.relationshipThreadPatches;
  if (patches === undefined) return [];
  return Array.isArray(patches) ? patches : [patches];
}

export function normalizeRelationshipEvidenceRefs(
  value: unknown,
  path: Array<string | number>
): NormalizedRelationshipEvidenceRefs {
  if (value === undefined) return { evidenceRefs: [], diagnostics: [] };
  if (!Array.isArray(value)) {
    return {
      evidenceRefs: [],
      diagnostics: [
        {
          path,
          code: 'relationship_evidence_ref_removed',
          message: 'Relationship evidenceRefs was not an array and was removed before strict validation.'
        }
      ]
    };
  }

  const evidenceRefs: RelationshipEvidenceRef[] = [];
  const diagnostics: StoryDiagnosticIssue[] = [];

  value.slice(0, 6).forEach((item, index) => {
    const itemPath = [...path, index];
    if (!isRecord(item)) {
      diagnostics.push({
        path: itemPath,
        code: 'relationship_evidence_ref_removed',
        message: 'Relationship evidence reference was not an object and was removed.'
      });
      return;
    }

    const kind = normalizeRelationshipEvidenceKind(item.kind);
    const refId = typeof item.refId === 'string' ? item.refId.trim() : '';
    const summary = typeof item.summary === 'string' ? item.summary.trim() : '';
    if (!kind || !refId || !summary || summary.length > 240) {
      diagnostics.push({
        path: itemPath,
        code: 'relationship_evidence_ref_removed',
        message: `Relationship evidence reference was removed because kind/refId/summary was invalid; raw kind=${printableValue(item.kind)}.`
      });
      return;
    }

    if (item.kind !== kind) {
      diagnostics.push({
        path: [...itemPath, 'kind'],
        code: 'relationship_evidence_kind_normalized',
        message: `Relationship evidence kind "${printableValue(item.kind)}" was normalized to "${kind}".`
      });
    }
    evidenceRefs.push({ kind, refId, summary });
  });

  if (value.length > 6) {
    diagnostics.push({
      path,
      code: 'relationship_evidence_ref_removed',
      message: `Relationship evidence exceeded the six-reference limit; ${value.length - 6} trailing reference(s) were removed.`
    });
  }

  return { evidenceRefs, diagnostics };
}

function requiredEvidenceCount(creationBasis: RelationshipCreationBasis | undefined): number {
  return creationBasis === 'repeated_contact' || creationBasis === 'sustained_conflict' ? 2 : 1;
}

function basisLabel(creationBasis: RelationshipCreationBasis | undefined): string {
  return creationBasis ?? 'missing_creation_basis';
}

export function evaluateRelationshipCreationEvidence(
  patch: Pick<RelationshipThreadPatch, 'threadId' | 'creationBasis' | 'evidenceRefs'>,
  stores: RelationshipEvidenceStores,
  path: Array<string | number> = ['writeback', 'relationshipThreadPatches']
): RelationshipEvidenceEvaluation {
  const requiredCount = requiredEvidenceCount(patch.creationBasis);
  const knownCaseIds = new Set([...Object.keys(stores.cases), ...(stores.additionalCaseIds ?? [])]);
  const knownDeferredEventIds = new Set([
    ...Object.keys(stores.deferredEvents),
    ...(stores.additionalDeferredEventIds ?? [])
  ]);
  const validRefs: RelationshipEvidenceRef[] = [];
  const validKeys = new Set<string>();
  const diagnostics: StoryDiagnosticIssue[] = [];

  for (const [index, ref] of (patch.evidenceRefs ?? []).entries()) {
    const refPath = [...path, 'evidenceRefs', index];
    const key = `${ref.kind}:${ref.refId}`;
    if (validKeys.has(key)) {
      diagnostics.push({
        path: refPath,
        code: 'relationship_evidence_ref_removed',
        message: `Duplicate relationship evidence "${key}" was not counted.`
      });
      continue;
    }

    const valid =
      (ref.kind === 'current_turn' && ref.refId === 'current_turn') ||
      (ref.kind === 'memory' && Boolean(stores.memories[ref.refId])) ||
      (ref.kind === 'case' && knownCaseIds.has(ref.refId)) ||
      (ref.kind === 'deferred_event' && knownDeferredEventIds.has(ref.refId));
    if (!valid) {
      diagnostics.push({
        path: refPath,
        code: 'relationship_evidence_ref_removed',
        message: `Relationship evidence "${key}" did not reference a verifiable fact and was not counted.`
      });
      continue;
    }

    validKeys.add(key);
    validRefs.push(ref);
  }

  const historicalCount = validRefs.filter((ref) => ref.kind !== 'current_turn').length;
  const requiresHistoricalEvidence =
    patch.creationBasis === 'repeated_contact' || patch.creationBasis === 'sustained_conflict';
  const issues: string[] = [];
  if (!patch.creationBasis) issues.push('creationBasis is missing');
  if (validRefs.length < requiredCount) {
    issues.push(`${basisLabel(patch.creationBasis)} requires ${requiredCount} distinct valid evidence reference(s), found ${validRefs.length}`);
  }
  if (requiresHistoricalEvidence && historicalCount === 0) {
    issues.push(`${basisLabel(patch.creationBasis)} requires at least one verifiable historical reference`);
  }

  const sufficient = issues.length === 0;
  if (!sufficient) {
    diagnostics.push({
      path,
      code: 'relationship_evidence_insufficient',
      message: `Relationship thread "${patch.threadId}" has insufficient creation evidence: ${issues.join('; ')}.`
    });
  }

  return {
    requiredCount,
    validRefs,
    validCount: validRefs.length,
    historicalCount,
    sufficient,
    issues,
    diagnostics
  };
}
