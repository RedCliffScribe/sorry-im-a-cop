export const customContentWorldDeploymentModes = [
  'disabled',
  'native',
  'ai_adapted'
] as const;

export type CustomContentWorldDeploymentMode =
  (typeof customContentWorldDeploymentModes)[number];

export interface CustomContentWorldDeployment {
  worldpackId: string;
  mode: CustomContentWorldDeploymentMode;
  defaultEnabledForNewGame: boolean;
}

export const customCharacterTemporalPolicies = [
  'preserve_life_stage',
  'preserve_exact_age',
  'preserve_birth_date',
  'manual'
] as const;

export type CustomCharacterTemporalPolicy =
  (typeof customCharacterTemporalPolicies)[number];

export const customContentAdaptationStatuses = [
  'ready',
  'needs_review',
  'incompatible'
] as const;

export type CustomContentAdaptationStatus =
  (typeof customContentAdaptationStatuses)[number];

export interface CustomCharacterAdaptationPolicy {
  temporalPolicy: CustomCharacterTemporalPolicy;
  lockedFields: string[];
  adaptableFields: string[];
  identityAnchors?: string[];
  permittedTransformations?: string[];
  forbiddenTransformations?: string[];
  conflictNotes?: string[];
}

export interface CustomCharacterAdaptationPolicyAssessment {
  status: Extract<CustomContentAdaptationStatus, 'ready' | 'needs_review'>;
  conflictingFields: string[];
}

export const DEFAULT_CUSTOM_CHARACTER_TEMPORAL_POLICY: CustomCharacterTemporalPolicy =
  'preserve_life_stage';

export const DEFAULT_CUSTOM_CHARACTER_LOCKED_FIELDS = Object.freeze([
  'displayName',
  'gender',
  'corePersonality',
  'values',
  'coreMotivations',
  'majorRelationships'
]);

export const DEFAULT_CUSTOM_CHARACTER_ADAPTABLE_FIELDS = Object.freeze([
  'birthDate',
  'birthYear',
  'ageAtAnchor',
  'occupation',
  'organizationRefs',
  'residencePlaceRef',
  'education',
  'communication',
  'transportation',
  'currencyAndIncome',
  'legalAndSocialContext',
  'playerContactRoutes'
]);

function uniqueNonEmpty(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function normalizeDeployment(
  deployment: CustomContentWorldDeployment
): CustomContentWorldDeployment {
  return {
    ...deployment,
    defaultEnabledForNewGame:
      deployment.mode === 'disabled' ? false : deployment.defaultEnabledForNewGame
  };
}

/**
 * Materializes deployment rows for the currently installed worldpacks.
 * Missing rows are intentionally disabled, including worldpacks installed
 * after an asset revision was created.
 */
export function reconcileCustomContentWorldDeployments({
  installedWorldpackIds,
  deployments = [],
  nativeWorldpackId
}: {
  installedWorldpackIds: readonly string[];
  deployments?: readonly CustomContentWorldDeployment[];
  nativeWorldpackId?: string;
}): CustomContentWorldDeployment[] {
  const existingByWorldpackId = new Map(
    deployments.map((deployment) => [
      deployment.worldpackId,
      normalizeDeployment(deployment)
    ])
  );

  return uniqueNonEmpty(installedWorldpackIds).map((worldpackId) => {
    const existing = existingByWorldpackId.get(worldpackId);
    if (existing) return { ...existing };
    if (worldpackId === nativeWorldpackId) {
      return {
        worldpackId,
        mode: 'native',
        defaultEnabledForNewGame: true
      };
    }
    return {
      worldpackId,
      mode: 'disabled',
      defaultEnabledForNewGame: false
    };
  });
}

export function resolveCustomContentWorldDeployment(
  deployments: readonly CustomContentWorldDeployment[],
  worldpackId: string
): CustomContentWorldDeployment {
  const existing = deployments.find(
    (deployment) => deployment.worldpackId === worldpackId
  );
  return existing
    ? normalizeDeployment(existing)
    : {
        worldpackId,
        mode: 'disabled',
        defaultEnabledForNewGame: false
      };
}

export function hasPublishableWorldDeployment(
  deployments: readonly CustomContentWorldDeployment[]
): boolean {
  return deployments.some((deployment) => deployment.mode !== 'disabled');
}

export function createDefaultCustomCharacterAdaptationPolicy(
  overrides: Partial<CustomCharacterAdaptationPolicy> = {}
): CustomCharacterAdaptationPolicy {
  return {
    temporalPolicy:
      overrides.temporalPolicy ?? DEFAULT_CUSTOM_CHARACTER_TEMPORAL_POLICY,
    lockedFields: uniqueNonEmpty(
      overrides.lockedFields ?? DEFAULT_CUSTOM_CHARACTER_LOCKED_FIELDS
    ),
    adaptableFields: uniqueNonEmpty(
      overrides.adaptableFields ?? DEFAULT_CUSTOM_CHARACTER_ADAPTABLE_FIELDS
    ),
    identityAnchors: uniqueNonEmpty(overrides.identityAnchors ?? []),
    permittedTransformations: uniqueNonEmpty(
      overrides.permittedTransformations ?? []
    ),
    forbiddenTransformations: uniqueNonEmpty(
      overrides.forbiddenTransformations ?? []
    ),
    conflictNotes: uniqueNonEmpty(overrides.conflictNotes ?? [])
  };
}

export function assessCustomCharacterAdaptationPolicy(
  policy: CustomCharacterAdaptationPolicy
): CustomCharacterAdaptationPolicyAssessment {
  const adaptableFields = new Set(uniqueNonEmpty(policy.adaptableFields));
  const conflictingFields = uniqueNonEmpty(policy.lockedFields).filter((field) =>
    adaptableFields.has(field)
  );
  return {
    status: conflictingFields.length > 0 ? 'needs_review' : 'ready',
    conflictingFields
  };
}
