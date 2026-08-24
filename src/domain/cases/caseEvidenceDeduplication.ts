import type { CaseEvidence, CaseFile, GameTime, RuntimeState } from '../runtime/types';

export interface CaseEvidenceDeduplicationResult {
  cases: RuntimeState['cases'];
  caseEvidence: RuntimeState['caseEvidence'];
  canonicalEvidenceIds: Readonly<Record<string, string>>;
  removedEvidenceIds: string[];
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function gameTimeKey(time: GameTime | undefined): string {
  if (!time) return '';
  return [time.year, time.month, time.day, time.hour, time.minute].join('-');
}

function sortedList(values: readonly string[]): string {
  return [...new Set(values)].sort().join(',');
}

function exactEvidenceFingerprint(evidence: CaseEvidence): string | undefined {
  const title = normalizeText(evidence.title);
  const summary = normalizeText(evidence.summary);
  const sourceSummary = normalizeText(evidence.sourceSummary);
  if (!title || (!summary && !sourceSummary)) return undefined;
  return JSON.stringify([
    evidence.caseId,
    title,
    evidence.evidenceType,
    summary,
    sourceSummary,
    evidence.submittedByActorId ?? '',
    evidence.relatedAssetItemId ?? '',
    normalizeText(evidence.disputeSummary),
    evidence.visibility,
    sortedList(evidence.relatedActorIds),
    sortedList(evidence.relatedPlaceIds),
    gameTimeKey(evidence.submittedAt ?? evidence.createdAt)
  ]);
}

function orderedEvidenceIds(
  cases: RuntimeState['cases'],
  evidence: RuntimeState['caseEvidence']
): string[] {
  const ordered = Object.values(cases).flatMap((caseFile) => caseFile.evidenceIds);
  return [...new Set([...ordered, ...Object.keys(evidence).sort()])];
}

function remapUnique(ids: readonly string[], canonicalIds: ReadonlyMap<string, string>): string[] {
  return [...new Set(ids.map((id) => canonicalIds.get(id) ?? id))];
}

function remapCaseEvidenceReferences(
  caseFile: CaseFile,
  canonicalIds: ReadonlyMap<string, string>
): CaseFile {
  return {
    ...caseFile,
    evidenceIds: remapUnique(caseFile.evidenceIds, canonicalIds),
    activityLog: caseFile.activityLog.map((activity) => ({
      ...activity,
      relatedEvidenceIds: remapUnique(activity.relatedEvidenceIds, canonicalIds)
    }))
  };
}

export function deduplicateExactCaseEvidence(
  cases: RuntimeState['cases'],
  caseEvidence: RuntimeState['caseEvidence']
): CaseEvidenceDeduplicationResult {
  const fingerprintToCanonicalId = new Map<string, string>();
  const canonicalIds = new Map<string, string>();
  const removedEvidenceIds: string[] = [];

  for (const evidenceId of orderedEvidenceIds(cases, caseEvidence)) {
    const evidence = caseEvidence[evidenceId];
    if (!evidence) continue;
    const fingerprint = exactEvidenceFingerprint(evidence);
    const canonicalId = fingerprint ? fingerprintToCanonicalId.get(fingerprint) : undefined;
    if (!canonicalId) {
      canonicalIds.set(evidenceId, evidenceId);
      if (fingerprint) fingerprintToCanonicalId.set(fingerprint, evidenceId);
      continue;
    }
    canonicalIds.set(evidenceId, canonicalId);
    removedEvidenceIds.push(evidenceId);
  }

  const nextEvidence = Object.fromEntries(
    Object.entries(caseEvidence).filter(([evidenceId]) => !removedEvidenceIds.includes(evidenceId))
  ) as RuntimeState['caseEvidence'];
  const nextCases = Object.fromEntries(
    Object.entries(cases).map(([caseId, caseFile]) => [
      caseId,
      remapCaseEvidenceReferences(caseFile, canonicalIds)
    ])
  ) as RuntimeState['cases'];

  return {
    cases: nextCases,
    caseEvidence: nextEvidence,
    canonicalEvidenceIds: Object.fromEntries(canonicalIds),
    removedEvidenceIds
  };
}
