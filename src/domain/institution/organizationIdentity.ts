import type {
  Organization,
  RuntimeState,
  StoryDiagnosticIssue
} from '../runtime/types';
import type { NarratorResponse } from '../writeback/schema';

type OrganizationPatch = NarratorResponse['writeback']['organizationPatches'][number];

const ORGANIZATION_ID_SCALAR_FIELDS = new Set([
  'organizationId',
  'employerOrganizationId',
  'owningOrganizationId'
]);
const ORGANIZATION_ID_ARRAY_FIELDS = new Set([
  'organizationIds',
  'relatedOrganizationIds',
  'affiliationOrganizationIds'
]);
const ORGANIZATION_NAME_SUFFIX_PATTERN =
  /(股份有限公司|有限责任公司|有限公司|控股集团|控股公司|企业集团|集团公司|家族企业|家族公司|企业|公司|集团|机构|家族)$/u;

interface OrganizationIdentityMatch {
  organizationId: string;
  reason: 'exact_name_or_alias' | 'player_linked_name_core';
}

export interface OrganizationIdentityResolutionResult {
  response: NarratorResponse;
  diagnostics: StoryDiagnosticIssue[];
}

function mergeUniqueStrings(...groups: Array<string[] | undefined>): string[] {
  return [...new Set(groups.flatMap((group) => group ?? []))];
}

function normalizeOrganizationIdentityName(name: string): string {
  return name
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function organizationIdentityNameCore(name: string): string {
  let core = normalizeOrganizationIdentityName(name);
  let previous = '';
  while (core && core !== previous) {
    previous = core;
    core = core.replace(ORGANIZATION_NAME_SUFFIX_PATTERN, '');
  }
  return core;
}

function organizationIdentityNames(organization: Organization): string[] {
  return mergeUniqueStrings([organization.name], organization.aliases).filter(
    (name) => name.trim().length > 0
  );
}

function playerLinkedOrganizationIds(state: RuntimeState): Set<string> {
  const playerActor = state.actors[state.player.actorId];
  const ids = new Set<string>(playerActor?.organizationIds ?? []);
  for (const relation of playerActor?.organizationRelations ?? []) ids.add(relation.organizationId);
  const employerOrganizationId = playerActor?.roleProfiles.civilian?.employerOrganizationId;
  if (employerOrganizationId) ids.add(employerOrganizationId);
  return ids;
}

function uniqueOrganizationIdentityMatch(
  matches: Array<{ organizationId: string; reason: OrganizationIdentityMatch['reason'] }>
): OrganizationIdentityMatch | undefined {
  const byId = new Map(matches.map((match) => [match.organizationId, match]));
  return byId.size === 1 ? [...byId.values()][0] : undefined;
}

function findCanonicalOrganizationIdentity(
  state: RuntimeState,
  patch: OrganizationPatch,
  linkedOrganizationIds: Set<string>
): OrganizationIdentityMatch | undefined {
  if (state.organizations[patch.organizationId]) return undefined;
  const incomingNames = [patch.name, ...(patch.aliases ?? [])].filter(
    (name): name is string => typeof name === 'string' && name.trim().length > 0
  );
  if (incomingNames.length === 0) return undefined;

  const normalizedIncomingNames = new Set(incomingNames.map(normalizeOrganizationIdentityName));
  const exactMatch = uniqueOrganizationIdentityMatch(
    Object.values(state.organizations)
      .filter((organization) =>
        organizationIdentityNames(organization).some((name) =>
          normalizedIncomingNames.has(normalizeOrganizationIdentityName(name))
        )
      )
      .map((organization) => ({
        organizationId: organization.organizationId,
        reason: 'exact_name_or_alias' as const
      }))
  );
  if (exactMatch) return exactMatch;

  const incomingCores = new Set(
    incomingNames.map(organizationIdentityNameCore).filter((core) => core.length >= 2)
  );
  if (incomingCores.size === 0) return undefined;
  return uniqueOrganizationIdentityMatch(
    [...linkedOrganizationIds]
      .map((organizationId) => state.organizations[organizationId])
      .filter((organization): organization is Organization => Boolean(organization))
      .filter((organization) =>
        organizationIdentityNames(organization).some((name) =>
          incomingCores.has(organizationIdentityNameCore(name))
        )
      )
      .map((organization) => ({
        organizationId: organization.organizationId,
        reason: 'player_linked_name_core' as const
      }))
  );
}

function remapOrganizationReferenceValue(
  value: unknown,
  organizationIdAliases: Map<string, string>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => remapOrganizationReferenceValue(item, organizationIdAliases));
  }
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => {
      if (ORGANIZATION_ID_SCALAR_FIELDS.has(key) && typeof item === 'string') {
        return [key, organizationIdAliases.get(item) ?? item];
      }
      if (ORGANIZATION_ID_ARRAY_FIELDS.has(key) && Array.isArray(item)) {
        return [
          key,
          item.map((id) =>
            typeof id === 'string'
              ? organizationIdAliases.get(id) ?? id
              : remapOrganizationReferenceValue(id, organizationIdAliases)
          )
        ];
      }
      if (key === 'ownerId' && record.ownerType === 'organization' && typeof item === 'string') {
        return [key, organizationIdAliases.get(item) ?? item];
      }
      if (key === 'sourceId' && record.sourceKind === 'organization' && typeof item === 'string') {
        return [key, organizationIdAliases.get(item) ?? item];
      }
      return [key, remapOrganizationReferenceValue(item, organizationIdAliases)];
    })
  );
}

export function resolveOrganizationWritebackIdentity(
  state: RuntimeState,
  response: NarratorResponse
): OrganizationIdentityResolutionResult {
  const organizationIdAliases = new Map<string, string>();
  const diagnostics: StoryDiagnosticIssue[] = [];
  const linkedOrganizationIds = playerLinkedOrganizationIds(state);

  for (const [index, patch] of response.writeback.organizationPatches.entries()) {
    const match = findCanonicalOrganizationIdentity(state, patch, linkedOrganizationIds);
    if (!match || match.organizationId === patch.organizationId) continue;
    organizationIdAliases.set(patch.organizationId, match.organizationId);
    diagnostics.push({
      path: ['writeback', 'organizationPatches', index, 'organizationId'],
      code: 'organization_identity_id_remapped',
      message: `Organization patch "${patch.organizationId}" was remapped to canonical organization "${match.organizationId}" (${match.reason}).`
    });
  }

  if (organizationIdAliases.size === 0) return { response, diagnostics };
  const remappedResponse = remapOrganizationReferenceValue(
    response,
    organizationIdAliases
  ) as NarratorResponse;
  remappedResponse.writeback.organizationPatches =
    remappedResponse.writeback.organizationPatches.map((patch, index) => {
      const originalPatch = response.writeback.organizationPatches[index];
      const canonicalOrganizationId = organizationIdAliases.get(originalPatch.organizationId);
      if (!canonicalOrganizationId) return patch;
      const existing = state.organizations[canonicalOrganizationId];
      const incomingAliases = [
        ...(originalPatch.aliases ?? []),
        ...(originalPatch.name && originalPatch.name !== existing?.name ? [originalPatch.name] : [])
      ];
      return {
        ...patch,
        name: existing?.name ?? patch.name,
        aliases: mergeUniqueStrings(existing?.aliases, incomingAliases)
      };
    });

  return { response: remappedResponse, diagnostics };
}
