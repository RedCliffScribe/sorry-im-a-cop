import {
  hkLateColonialTriadOrganizations,
  type LateColonialTriadOrganizationAnchor,
  type TriadStructureTierAnchor
} from '../cityPower/hkLateColonialTriadOrganizations';
import type {
  CurrentIdentity,
  Organization,
  OrganizationId,
  OrganizationStructureNode,
  TriadActivityAreaState,
  TriadOrganizationProfile,
  TriadOrganizationState
} from '../runtime/types';

function playerStance(identity: CurrentIdentity): string {
  if (identity === 'gang_member') return '视玩家背景而定，未确认字头前只保持试探。';
  if (identity === 'police') return '对玩家保持警惕；基层警员若频繁接触夜场、线人或外围成员，会逐渐进入对方视野。';
  return '暂无直接关系；普通市民通常只会在街面冲突、夜场或人情关系里间接接触。';
}

function initialCurrentState(anchor: LateColonialTriadOrganizationAnchor, openingYear: number): string {
  return `${openingYear}年，公开层面只确认“${anchor.displayName}”是香港街面传闻中的主要社团名号；本局尚无与你直接相关的具体动向，地区人事和当晚安排需要通过接触、线索和新闻逐步确认。`;
}

function initialPressureSummary(anchor: LateColonialTriadOrganizationAnchor): string {
  return `涉及${anchor.displayName}名号的夜场、街面、线人、外围营生或旧案牵连，都可能让你与其成员、外围或传闻发生接触。`;
}

function createInitialTriadOrganization(
  anchor: LateColonialTriadOrganizationAnchor,
  currentIdentity: CurrentIdentity,
  openingYear: number
): Organization {
  const stanceTowardPlayer = playerStance(currentIdentity);

  return {
    organizationId: anchor.organizationId,
    name: anchor.displayName,
    type: 'triad',
    summary: anchor.promptSafeProfile,
    publicKnowledge: anchor.publicKnowledge,
    currentState: initialCurrentState(anchor, openingYear),
    stanceTowardPlayer,
    pressureSummary: initialPressureSummary(anchor),
    structureTree: createTriadStructureTree(anchor.organizationId, anchor.structureTemplate),
    triadProfile: createTriadProfile(anchor),
    triadState: createTriadState(anchor),
    relatedActorIds: [],
    relatedPlaceIds: [...new Set([...anchor.headquartersPlaceIds, ...anchor.territoryPlaceIds])],
    relatedCaseIds: [],
    visibility: 'public',
    importance: anchor.influence
  };
}

export function createInitialTriadOrganizations(
  currentIdentity: CurrentIdentity,
  openingYear: number,
  anchors: LateColonialTriadOrganizationAnchor[] = hkLateColonialTriadOrganizations
): Record<OrganizationId, Organization> {
  return {
    ...Object.fromEntries(
      anchors
        .sort((left, right) => right.influence - left.influence || left.displayName.localeCompare(right.displayName))
        .map((anchor) => [anchor.organizationId, createInitialTriadOrganization(anchor, currentIdentity, openingYear)])
    )
  } satisfies Record<OrganizationId, Organization>;
}

function createTriadProfile(anchor: LateColonialTriadOrganizationAnchor): TriadOrganizationProfile {
  return {
    organizationStyle: anchor.organizationStyle,
    decisionCulture: anchor.decisionCulture,
    leadershipSelection: anchor.leadershipSelection,
    operatingLines: [...anchor.operatingLines],
    customaryRules: [...anchor.customaryRules],
    internalFaultLines: [...anchor.internalFaultLines],
    activityAreas: anchor.activityAreas.map((area) => ({ ...area }))
  };
}

function createAreaState(anchor: LateColonialTriadOrganizationAnchor): TriadActivityAreaState[] {
  return anchor.activityAreas.map((area) => ({
    placeId: area.placeId,
    statusSummary: `本局尚未确认与你直接相关的具体行动；已知这里只是${anchor.displayName}的一条活动线，并非排他控制。`,
    pressureSummary: area.localPressureSummary,
    confidence: 'low'
  }));
}

function createTriadState(anchor: LateColonialTriadOrganizationAnchor): TriadOrganizationState {
  return {
    leadership: {
      phase: 'stable',
      visibleSummary: `目前只知道${anchor.displayName}的既有主事关系仍在运作，具体人物和权力边界未确认。`,
      nextMilestone: '暂无玩家可见的交接或议事节点。',
      knownCandidateActorIds: [],
      confidence: 'unknown'
    },
    activityAreas: createAreaState(anchor)
  };
}

export function mergeInitialTriadDetails(
  organizations: Record<OrganizationId, Organization>,
  currentIdentity: CurrentIdentity,
  openingYear: number
): Record<OrganizationId, Organization> {
  const defaults = createInitialTriadOrganizations(currentIdentity, openingYear);
  const merged = { ...organizations };

  for (const [organizationId, fallback] of Object.entries(defaults)) {
    const existing = merged[organizationId];
    if (!existing) {
      merged[organizationId] = fallback;
      continue;
    }
    const shouldReplaceStructureTree = isLegacyDefaultTriadStructure(organizationId, existing.structureTree);
    const existingAreaStates = existing.triadState?.activityAreas ?? [];
    merged[organizationId] = {
      ...existing,
      structureTree: shouldReplaceStructureTree ? fallback.structureTree : (existing.structureTree ?? fallback.structureTree),
      triadProfile: existing.triadProfile ?? fallback.triadProfile,
      triadState: existing.triadState
        ? {
            leadership: {
              ...fallback.triadState!.leadership,
              ...existing.triadState.leadership,
              knownCandidateActorIds: [...(existing.triadState.leadership.knownCandidateActorIds ?? [])]
            },
            activityAreas: fallback.triadState!.activityAreas.map((fallbackArea) => ({
              ...fallbackArea,
              ...existingAreaStates.find((area) => area.placeId === fallbackArea.placeId)
            }))
          }
        : fallback.triadState
    };
  }

  return merged;
}

function isUnknownLegacyNode(node: OrganizationStructureNode | undefined, nodeId: string, label: string): boolean {
  return Boolean(
    node &&
      node.nodeId === nodeId &&
      node.label === label &&
      node.personName === '未知' &&
      node.status === '未知' &&
      node.confidence === 'unknown' &&
      !node.actorId
  );
}

function isLegacyDefaultTriadStructure(
  organizationId: OrganizationId,
  structureTree: OrganizationStructureNode[] | undefined
): boolean {
  if (!structureTree || structureTree.length !== 1) return false;

  const root = structureTree[0];
  const elders = root.children?.[0];
  const districtHeads = root.children?.[1];
  const outerMembers = districtHeads?.children?.[0];

  return (
    isUnknownLegacyNode(root, `${organizationId}_seat`, '坐馆') &&
    root.children?.length === 2 &&
    isUnknownLegacyNode(elders, `${organizationId}_elders`, '叔父辈') &&
    (elders?.children?.length ?? 0) === 0 &&
    isUnknownLegacyNode(districtHeads, `${organizationId}_district_heads`, '地区话事人') &&
    districtHeads?.children?.length === 1 &&
    isUnknownLegacyNode(outerMembers, `${organizationId}_outer_members`, '外围成员') &&
    (outerMembers?.children?.length ?? 0) === 0
  );
}

function unknownNode(
  nodeId: string,
  label: string,
  role: string,
  summary: string,
  children: OrganizationStructureNode[] = []
): OrganizationStructureNode {
  return {
    nodeId,
    label,
    role,
    personName: '未知',
    status: '未知',
    confidence: 'unknown',
    summary,
    children
  };
}

function createStructureNode(organizationId: OrganizationId, tier: TriadStructureTierAnchor): OrganizationStructureNode {
  return unknownNode(
    `${organizationId}_${tier.key}`,
    tier.label,
    tier.role,
    tier.summary,
    (tier.children ?? []).map((child) => createStructureNode(organizationId, child))
  );
}

function createTriadStructureTree(
  organizationId: OrganizationId,
  template: TriadStructureTierAnchor[]
): OrganizationStructureNode[] {
  return template.map((tier) => createStructureNode(organizationId, tier));
}
