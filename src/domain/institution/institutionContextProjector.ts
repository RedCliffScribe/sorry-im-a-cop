import type {
  Actor,
  ActorOrganizationRelation,
  CaseFile,
  Organization,
  OrganizationId,
  OrganizationStructureNode,
  RuntimeState,
  TriadOrganizationProfile,
  TriadOrganizationState
} from '../runtime/types';

export interface ProjectedInstitution {
  organizationId: string;
  name: string;
  aliases: string[];
  type: string;
  summary: string;
  publicKnowledge: string;
  currentState: string;
  stanceTowardPlayer: string;
  pressureSummary: string;
  structureTree?: OrganizationStructureNode[];
  triadProfile?: TriadOrganizationProfile;
  triadState?: TriadOrganizationState;
  relatedActorIds: string[];
  relatedPlaceIds: string[];
  relatedCaseIds: string[];
  importance: number;
  reasons: string[];
}

export interface ProjectedActorOrganizationRelation {
  actorId: string;
  actorName: string;
  organizationId: string;
  organizationName: string;
  relationType: string;
  roleTitle?: string;
  departmentOrUnit?: string;
  summary: string;
  visibility: 'public' | 'player_known';
  isPrimary?: boolean;
}

export interface InstitutionProjectionDiagnostics {
  sourceOrganizationCount: number;
  projectedOrganizationCount: number;
  projectedOrganizationIds: string[];
  omittedHiddenCount: number;
  omittedIrrelevantCount: number;
  missingOrganizationRefs: string[];
}

export interface InstitutionContextProjection {
  organizations: ProjectedInstitution[];
  actorRelations: ProjectedActorOrganizationRelation[];
  diagnostics: InstitutionProjectionDiagnostics;
}

export interface InstitutionProjectionOptions {
  maxOrganizations?: number;
}

interface CandidateScore {
  organizationId: OrganizationId;
  score: number;
  reasons: Set<string>;
}

const DEFAULT_MAX_ORGANIZATIONS = 6;

function addCandidate(
  candidates: Map<string, CandidateScore>,
  organizationId: OrganizationId | undefined,
  score: number,
  reason: string
): void {
  if (!organizationId) return;

  const existing = candidates.get(organizationId);
  if (existing) {
    existing.score += score;
    existing.reasons.add(reason);
    return;
  }

  candidates.set(organizationId, {
    organizationId,
    score,
    reasons: new Set([reason])
  });
}

function isOrganizationVisible(organization: Organization | undefined): organization is Organization {
  return organization !== undefined && organization.visibility !== 'hidden';
}

function isCaseVisible(caseFile: CaseFile): boolean {
  return caseFile.visibility !== 'hidden' && caseFile.status !== 'archived' && caseFile.status !== 'cold';
}

function activeActorIds(state: RuntimeState): Set<string> {
  const ids = new Set<string>([state.player.actorId]);
  const currentScene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  for (const actorId of currentScene?.presentActorIds ?? []) ids.add(actorId);
  for (const actor of Object.values(state.actors)) {
    if (actor.presence === 'present' || actor.presence === 'nearby') ids.add(actor.actorId);
  }
  return ids;
}

function projectOrganization(organization: Organization, reasons: string[]): ProjectedInstitution {
  return {
    organizationId: organization.organizationId,
    name: organization.name,
    aliases: [...(organization.aliases ?? [])],
    type: organization.type,
    summary: organization.summary,
    publicKnowledge: organization.publicKnowledge,
    currentState: organization.currentState,
    stanceTowardPlayer: organization.stanceTowardPlayer,
    pressureSummary: organization.pressureSummary,
    structureTree: organization.structureTree,
    triadProfile: organization.triadProfile
      ? {
          ...organization.triadProfile,
          operatingLines: [...organization.triadProfile.operatingLines],
          customaryRules: [...organization.triadProfile.customaryRules],
          internalFaultLines: [...organization.triadProfile.internalFaultLines],
          activityAreas: organization.triadProfile.activityAreas.map((area) => ({ ...area }))
        }
      : undefined,
    triadState: organization.triadState
      ? {
          leadership: {
            ...organization.triadState.leadership,
            knownCandidateActorIds: [...organization.triadState.leadership.knownCandidateActorIds]
          },
          activityAreas: organization.triadState.activityAreas.map((area) => ({ ...area }))
        }
      : undefined,
    relatedActorIds: [...organization.relatedActorIds],
    relatedPlaceIds: [...organization.relatedPlaceIds],
    relatedCaseIds: [...organization.relatedCaseIds],
    importance: organization.importance,
    reasons
  };
}

function relationKey(actorId: string, relation: ActorOrganizationRelation): string {
  return [actorId, relation.organizationId, relation.relationType, relation.roleTitle ?? ''].join('\u0000');
}

function collectActorRelations(
  actors: Actor[],
  organizations: Record<string, Organization>,
  projectedOrganizationIds: Set<string>
): ProjectedActorOrganizationRelation[] {
  const byKey = new Map<string, ProjectedActorOrganizationRelation>();

  for (const actor of actors) {
    for (const relation of actor.organizationRelations) {
      if (relation.visibility === 'hidden' || !projectedOrganizationIds.has(relation.organizationId)) continue;
      const organization = organizations[relation.organizationId];
      if (!organization) continue;

      byKey.set(relationKey(actor.actorId, relation), {
        actorId: actor.actorId,
        actorName: actor.name,
        organizationId: relation.organizationId,
        organizationName: organization.name,
        relationType: relation.relationType,
        roleTitle: relation.roleTitle,
        departmentOrUnit: relation.departmentOrUnit,
        summary: relation.summary,
        visibility: relation.visibility,
        isPrimary: relation.isPrimary
      });
    }
  }

  return Array.from(byKey.values());
}

function pushMissingRef(missingRefs: Set<string>, organizationId: string, source: string): void {
  missingRefs.add(`${organizationId} (${source})`);
}

export function projectInstitutionContext(
  state: RuntimeState,
  options: InstitutionProjectionOptions = {}
): InstitutionContextProjection {
  const maxOrganizations = options.maxOrganizations ?? DEFAULT_MAX_ORGANIZATIONS;
  const candidates = new Map<string, CandidateScore>();
  const missingOrganizationRefs = new Set<string>();
  let omittedHiddenCount = 0;

  const currentPlace = state.places[state.location.currentPlaceId];
  if (currentPlace?.owningOrganizationId) {
    if (state.organizations[currentPlace.owningOrganizationId]) {
      addCandidate(candidates, currentPlace.owningOrganizationId, 100, 'current_place');
    } else {
      pushMissingRef(missingOrganizationRefs, currentPlace.owningOrganizationId, 'current_place');
    }
  }

  const activeIds = activeActorIds(state);
  const activeActors = Array.from(activeIds)
    .map((actorId) => state.actors[actorId])
    .filter((actor): actor is Actor => Boolean(actor));
  for (const actor of activeActors) {
    for (const relation of actor.organizationRelations) {
      if (relation.visibility === 'hidden') {
        omittedHiddenCount += 1;
        continue;
      }
      const organization = state.organizations[relation.organizationId];
      if (!organization) {
        pushMissingRef(missingOrganizationRefs, relation.organizationId, `actor:${actor.actorId}`);
        continue;
      }
      addCandidate(candidates, relation.organizationId, relation.isPrimary ? 90 : 75, `actor:${actor.actorId}`);
    }
  }

  for (const caseFile of Object.values(state.cases)) {
    if (!isCaseVisible(caseFile)) continue;
    for (const organizationId of caseFile.relatedOrganizationIds) {
      if (state.organizations[organizationId]) {
        addCandidate(candidates, organizationId, 60, `case:${caseFile.caseId}`);
      } else {
        pushMissingRef(missingOrganizationRefs, organizationId, `case:${caseFile.caseId}`);
      }
    }
  }

  for (const deferredEvent of Object.values(state.deferredEvents)) {
    if (deferredEvent.status !== 'pending' || deferredEvent.visibility === 'hidden') continue;
    const organizationId = deferredEvent.relatedIds.organizationId;
    if (!organizationId) continue;
    if (state.organizations[organizationId]) {
      addCandidate(candidates, organizationId, 40, `deferred:${deferredEvent.eventId}`);
    } else {
      pushMissingRef(missingOrganizationRefs, organizationId, `deferred:${deferredEvent.eventId}`);
    }
  }

  for (const organization of Object.values(state.organizations)) {
    if (organization.visibility === 'hidden') {
      omittedHiddenCount += 1;
      continue;
    }
    if (organization.importance >= 90) {
      addCandidate(candidates, organization.organizationId, organization.importance / 2, 'high_importance');
    }
  }

  const visibleCandidates = Array.from(candidates.values()).filter((candidate) =>
    isOrganizationVisible(state.organizations[candidate.organizationId])
  );
  const sortedCandidates = visibleCandidates.sort((a, b) => {
    const orgA = state.organizations[a.organizationId];
    const orgB = state.organizations[b.organizationId];
    if (b.score !== a.score) return b.score - a.score;
    if ((orgB?.importance ?? 0) !== (orgA?.importance ?? 0)) return (orgB?.importance ?? 0) - (orgA?.importance ?? 0);
    return (orgA?.name ?? a.organizationId).localeCompare(orgB?.name ?? b.organizationId);
  });
  const selected = sortedCandidates.slice(0, maxOrganizations);
  const projectedOrganizationIds = new Set(selected.map((candidate) => candidate.organizationId));
  const organizations = selected.map((candidate) =>
    projectOrganization(state.organizations[candidate.organizationId]!, Array.from(candidate.reasons))
  );
  const actorRelations = collectActorRelations(activeActors, state.organizations, projectedOrganizationIds);
  const visibleOrganizationCount = Object.values(state.organizations).filter(isOrganizationVisible).length;

  return {
    organizations,
    actorRelations,
    diagnostics: {
      sourceOrganizationCount: visibleOrganizationCount,
      projectedOrganizationCount: organizations.length,
      projectedOrganizationIds: organizations.map((organization) => organization.organizationId),
      omittedHiddenCount,
      omittedIrrelevantCount: Math.max(0, visibleOrganizationCount - organizations.length),
      missingOrganizationRefs: Array.from(missingOrganizationRefs)
    }
  };
}
