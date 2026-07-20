import type { CityOrganizationAnchor, CityPowerFigureAnchor, CityPowerValidationResult } from './cityPowerTypes';

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function promptVisibleFigureText(figure: CityPowerFigureAnchor): string {
  return [
    figure.displayName,
    figure.englishName,
    ...figure.recognitionAliases,
    figure.publicRole,
    figure.promptSafeProfile,
    ...figure.promptSafeHooks,
    figure.identityHooks.police,
    figure.identityHooks.civilian,
    figure.identityHooks.gang_member,
    ...figure.accessRoutes
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n');
}

export function validateCityPowerAnchors(
  organizations: CityOrganizationAnchor[],
  figures: CityPowerFigureAnchor[]
): CityPowerValidationResult {
  const errors: string[] = [];
  const organizationIds = new Set<string>();
  const figureIds = new Set<string>();
  const runtimeActorIds = new Set<string>();

  organizations.forEach((organization, index) => {
    if (organization.type !== 'CityOrganizationAnchor') errors.push(`organization ${index + 1}: invalid type`);
    if (!hasText(organization.organizationId)) errors.push(`organization ${index + 1}: missing organizationId`);
    if (organizationIds.has(organization.organizationId)) errors.push(`${organization.organizationId}: duplicate organizationId`);
    organizationIds.add(organization.organizationId);
    if (!hasText(organization.displayName)) errors.push(`${organization.organizationId}: missing displayName`);
    if (!hasText(organization.publicKnowledge)) errors.push(`${organization.organizationId}: missing publicKnowledge`);
    if (!hasText(organization.promptSafeProfile)) errors.push(`${organization.organizationId}: missing promptSafeProfile`);
    if (organization.activeYears.from > organization.activeYears.to) errors.push(`${organization.organizationId}: invalid activeYears`);
    if (organization.influence < 0 || organization.influence > 100) errors.push(`${organization.organizationId}: invalid influence`);
    for (const relatedOrganizationId of organization.relatedOrganizationIds) {
      if (!organizationIds.has(relatedOrganizationId) && !organizations.some((item) => item.organizationId === relatedOrganizationId)) {
        errors.push(`${organization.organizationId}: missing related organization ${relatedOrganizationId}`);
      }
    }
  });

  figures.forEach((figure, index) => {
    if (figure.type !== 'CityPowerFigureAnchor') errors.push(`figure ${index + 1}: invalid type`);
    if (!hasText(figure.canonicalSeedId)) errors.push(`figure ${index + 1}: missing canonicalSeedId`);
    if (figureIds.has(figure.canonicalSeedId)) errors.push(`${figure.canonicalSeedId}: duplicate canonicalSeedId`);
    figureIds.add(figure.canonicalSeedId);
    if (!hasText(figure.runtimeActorId)) errors.push(`${figure.canonicalSeedId}: missing runtimeActorId`);
    if (runtimeActorIds.has(figure.runtimeActorId)) errors.push(`${figure.canonicalSeedId}: duplicate runtimeActorId`);
    runtimeActorIds.add(figure.runtimeActorId);
    if (!hasText(figure.displayName)) errors.push(`${figure.canonicalSeedId}: missing displayName`);
    if (figure.activeYears.from > figure.activeYears.to) errors.push(`${figure.canonicalSeedId}: invalid activeYears`);
    if (!hasText(figure.publicRole)) errors.push(`${figure.canonicalSeedId}: missing publicRole`);
    if (!hasText(figure.promptSafeProfile)) errors.push(`${figure.canonicalSeedId}: missing promptSafeProfile`);
    if (figure.recognitionAliases.length === 0) errors.push(`${figure.canonicalSeedId}: missing recognitionAliases`);
    if (figure.promptSafeHooks.length === 0) errors.push(`${figure.canonicalSeedId}: missing promptSafeHooks`);
    if (!figure.identityHooks.police || !figure.identityHooks.civilian || !figure.identityHooks.gang_member) {
      errors.push(`${figure.canonicalSeedId}: missing identity hooks`);
    }
    for (const organizationId of [...figure.affiliationOrganizationIds, ...figure.relatedOrganizationIds]) {
      if (!organizationIds.has(organizationId)) errors.push(`${figure.canonicalSeedId}: missing organization reference ${organizationId}`);
    }
    const promptText = promptVisibleFigureText(figure);
    const leakedName = figure.protectedRealNames?.find((protectedName) => protectedName.trim() && promptText.includes(protectedName));
    if (leakedName) errors.push(`${figure.canonicalSeedId}: protected name leak ${leakedName}`);
    if (figure.category === 'triad_leader' && figure.defaultVisibility === 'public') {
      errors.push(`${figure.canonicalSeedId}: triad leader cannot default to public`);
    }
  });

  return {
    organizationCount: organizations.length,
    figureCount: figures.length,
    errors
  };
}
