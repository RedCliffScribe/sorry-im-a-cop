import type { StoryDiagnosticIssue } from '../runtime/types';

const WRITEBACK_STATE_ROOTS = new Set([
  'assetPatch',
  'caseEvidencePatches',
  'casePatches',
  'currentMatterPatches',
  'deferredEventPatches',
  'financePatch',
  'grayLedger',
  'initialActors',
  'memories',
  'playerPatch',
  'pressureSeeds',
  'secretFacts',
  'writeback',
  'writebackRepair'
]);

const PARTIAL_WRITEBACK_CODE_PATTERN =
  /(?:failed|incomplete|invalid|missing|not_|overflow|queued|rejected|too_|unhandled|unknown|unsafe|unsupported)/i;

const SUCCESSFUL_WRITEBACK_RECOVERY_CODES = new Set([
  'actor_minimum_creation_applied',
  'actor_profile_enrichment_applied',
  'actor_profile_enrichment_main_fallback_applied',
  'actor_writeback_recovery_applied',
  'actor_writeback_repair_main_fallback_applied',
  'asset_repair_reconciled_from_raw',
  'asset_writeback_applied',
  'case_intent_recovered',
  'combat_event_structure_recovered',
  'player_vitals_lifecycle_review_applied',
  'relationship_omission_repair_applied',
  'relationship_structure_repair_applied',
  'writeback_location_reconciled',
  'writeback_repair_applied',
  'writeback_repair_reconciled'
]);

const EXPECTED_LOCAL_GUARDRAIL_CODES = new Set([
  'actor_identity_merge_rejected',
  'actor_invalid_birth_date_ignored',
  'relationship_creation_rejected',
  'writeback_repair_advisory_ignored',
  'writeback_repair_noop_payload_ignored'
]);

const WRITEBACK_REPAIR_DOMAIN_ALIASES: Record<string, string> = {
  actorPatches: 'actorPatches',
  actorProfileEnrichment: 'actorPatches',
  assetLifecycle: 'assetPatch',
  assetPatch: 'assetPatch',
  civilianLivelihood: 'civilianLivelihood',
  incidentOrigin: 'incidentOrigin',
  location: 'locationPatch',
  playerClothing: 'playerPatch',
  playerVitals: 'actorPatches',
  relationshipThreadPatches: 'relationshipThreadPatches',
  relationshipThreads: 'relationshipThreadPatches'
};

function writebackDomain(path: ReadonlyArray<string | number>): string | undefined {
  const root = String(path[0] ?? '');
  if (!root) return undefined;

  if (root === 'writeback') {
    const nested = String(path[1] ?? '');
    return nested || root;
  }
  if (root === 'writebackRepair') {
    const nested = String(path[1] ?? '');
    return WRITEBACK_REPAIR_DOMAIN_ALIASES[nested] ?? (nested || root);
  }
  return root;
}

function isSuccessfulWritebackRecovery(issue: StoryDiagnosticIssue): boolean {
  return Boolean(issue.code && SUCCESSFUL_WRITEBACK_RECOVERY_CODES.has(issue.code));
}

function isExpectedLocalGuardrail(issue: StoryDiagnosticIssue): boolean {
  return Boolean(issue.code && EXPECTED_LOCAL_GUARDRAIL_CODES.has(issue.code));
}

function diagnosticIdentity(issue: StoryDiagnosticIssue): string {
  return `${issue.path.map(String).join('.')}\u0000${issue.code ?? ''}\u0000${issue.message}`;
}

/**
 * Distinguishes actual state-loss warnings from informational diagnostics that
 * share StoryEntry.writebackDiagnostics, such as successful evolution reviews.
 */
export function isPartialWritebackDiagnostic(issue: StoryDiagnosticIssue): boolean {
  const root = String(issue.path?.[0] ?? '');
  if (!WRITEBACK_STATE_ROOTS.has(root)) return false;

  const code = issue.code?.trim();
  if (code?.startsWith('local_judgement_')) return false;
  if (isExpectedLocalGuardrail(issue)) return false;
  return !code || PARTIAL_WRITEBACK_CODE_PATTERN.test(code);
}

/**
 * Resolves the ordered diagnostic stream after all local/AI repair stages have
 * finished. A successful recovery receipt suppresses older validation errors
 * from the same writeback domain, while any later or still-queued failure stays
 * visible. This keeps the player banner tied to final state loss instead of a
 * transient first-pass schema warning.
 */
export function collectUnresolvedPartialWritebackDiagnostics(
  issues: StoryDiagnosticIssue[] | undefined
): StoryDiagnosticIssue[] {
  if (!issues?.length) return [];

  const unresolved = issues.filter((issue, index) => {
    if (!isPartialWritebackDiagnostic(issue)) return false;

    const domain = writebackDomain(issue.path);
    if (!domain) return true;

    return !issues.slice(index + 1).some((candidate) => (
      isSuccessfulWritebackRecovery(candidate) &&
      writebackDomain(candidate.path) === domain
    ));
  });

  const seen = new Set<string>();
  return unresolved.filter((issue) => {
    const identity = diagnosticIdentity(issue);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
