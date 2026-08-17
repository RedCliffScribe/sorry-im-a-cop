import type { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import {
  promoteCustomCharacterAssetToGlobal
} from './assetFoundation';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision
} from './assetTypes';
import type { CustomCharacterDraft } from './characterCreation';
import type {
  CustomCharacterGenerationDiagnostics,
  CustomCharacterGenerationIssue,
  CustomCharacterGenerationRecovery
} from './characterCreation';
import type { CustomCharacterWorkingDraftRecord } from './characterWorkingDraft';
import { createCustomContentChecksum } from './checksum';
import {
  assessCustomCharacterAdaptationPolicy,
  hasPublishableWorldDeployment,
  type CustomContentWorldDeployment
} from './worldAdaptation';

export type CustomCharacterSaveMode = 'needs_review' | 'publish';

export interface SaveCustomCharacterInput {
  draft: CustomCharacterDraft;
  deployments: CustomContentWorldDeployment[];
  global: boolean;
  projectIds: string[];
  mode: CustomCharacterSaveMode;
  existingAsset?: CustomCharacterAsset;
}

export interface CharacterManagementDependencies {
  now?: () => string;
  createId?: () => string;
}

export class CustomCharacterPublishValidationError extends Error {
  constructor(
    message: string,
    public readonly paths: readonly string[]
  ) {
    super(message);
    this.name = 'CustomCharacterPublishValidationError';
  }
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function defaultCharacterId(): string {
  return `character-${globalThis.crypto.randomUUID()}`;
}

async function revisionWithChecksum(
  value: Omit<CustomCharacterRevision, 'checksum'>
): Promise<CustomCharacterRevision> {
  return {
    ...value,
    checksum: await createCustomContentChecksum(value)
  };
}

function validateCharacterSave(
  input: SaveCustomCharacterInput
): void {
  const problems: Array<{ path: string; summary: string }> = [];
  const requiredTextFields = [
    ['displayName', '人物姓名', input.draft.displayName],
    ['gender', '性别', input.draft.gender],
    ['profileSummary', '人物摘要', input.draft.profileSummary],
    ['backgroundSummary', '背景摘要', input.draft.backgroundSummary]
  ] as const;
  for (const [path, label, value] of requiredTextFields) {
    if (!value.trim()) {
      problems.push({ path, summary: `${label}不能为空` });
    }
  }
  const requiredLists = [
    ['corePersonality', '核心性格', input.draft.corePersonality],
    ['values', '价值观', input.draft.values],
    ['coreMotivations', '核心动机', input.draft.coreMotivations]
  ] as const;
  for (const [path, label, values] of requiredLists) {
    if (uniqueNonEmpty(values).length === 0) {
      problems.push({ path, summary: `${label}至少需要一项` });
    }
  }
  input.draft.majorRelationships.forEach((relationship, index) => {
    if (
      !relationship.relationshipId.trim() ||
      !relationship.label.trim() ||
      !relationship.summary.trim()
    ) {
      problems.push({
        path: `majorRelationships.${index}`,
        summary: `主要关系第 ${index + 1} 项必须同时填写关系名称与摘要`
      });
    }
  });
  if (problems.length > 0) {
    throw new CustomCharacterPublishValidationError(
      `人物仍有 ${problems.length} 项待补：${problems
        .map((problem) => problem.summary)
        .join('；')}。`,
      problems.map((problem) => problem.path)
    );
  }
  if (!input.global && uniqueNonEmpty(input.projectIds).length === 0) {
    throw new Error('项目人物必须至少属于一个内容项目。');
  }
  const policyAssessment = assessCustomCharacterAdaptationPolicy(
    input.draft.adaptationPolicy
  );
  if (policyAssessment.status === 'needs_review') {
    throw new Error(
      `锁定字段与可适配字段冲突：${policyAssessment.conflictingFields.join('、')}`
    );
  }
  if (
    input.mode === 'publish' &&
    !hasPublishableWorldDeployment(input.deployments)
  ) {
    throw new Error('发布前必须至少启用一个世界包。');
  }
}

export interface SaveCustomCharacterWorkingDraftInput {
  workingDraftId?: string;
  sourceCharacterAssetId?: string;
  description: string;
  draft: CustomCharacterDraft;
  deployments: CustomContentWorldDeployment[];
  global: boolean;
  projectIds: string[];
  generationIssues?: CustomCharacterGenerationIssue[];
  generationRecovery?: CustomCharacterGenerationRecovery;
  generationDiagnostics?: CustomCharacterGenerationDiagnostics;
}

export async function saveCustomCharacterWorkingDraft({
  repository,
  input,
  dependencies = {}
}: {
  repository: IndexedDbCustomContentRepository;
  input: SaveCustomCharacterWorkingDraftInput;
  dependencies?: CharacterManagementDependencies;
}): Promise<CustomCharacterWorkingDraftRecord> {
  const now = dependencies.now?.() ?? new Date().toISOString();
  const existing = input.workingDraftId
    ? await repository.getCharacterWorkingDraft(input.workingDraftId)
    : null;
  const workingDraftId =
    existing?.workingDraftId ??
    input.workingDraftId ??
    `character-working-draft-${globalThis.crypto.randomUUID()}`;
  const record: CustomCharacterWorkingDraftRecord = {
    workingDraftId,
    sourceCharacterAssetId:
      input.sourceCharacterAssetId ?? existing?.sourceCharacterAssetId,
    description: input.description,
    draft: structuredClone(input.draft),
    deployments: input.deployments.map((item) => ({ ...item })),
    global: input.global,
    projectIds: uniqueNonEmpty(input.projectIds),
    generationIssues: (input.generationIssues ?? []).map((issue) => ({
      ...issue
    })),
    generationRecovery: input.generationRecovery,
    generationDiagnostics: input.generationDiagnostics
      ? {
          ...input.generationDiagnostics,
          removedPaths: [...input.generationDiagnostics.removedPaths]
        }
      : undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await repository.saveCharacterWorkingDraft(record);
  return record;
}

export async function saveCustomCharacterRevision({
  repository,
  input,
  dependencies = {}
}: {
  repository: IndexedDbCustomContentRepository;
  input: SaveCustomCharacterInput;
  dependencies?: CharacterManagementDependencies;
}): Promise<{
  asset: CustomCharacterAsset;
  revision: CustomCharacterRevision;
}> {
  validateCharacterSave(input);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const characterAssetId =
    input.existingAsset?.characterAssetId ??
    dependencies.createId?.() ??
    defaultCharacterId();
  const revisionNumber = (input.existingAsset?.latestRevision ?? 0) + 1;
  const revision = await revisionWithChecksum({
    characterAssetId,
    revision: revisionNumber,
    displayName: input.draft.displayName.trim(),
    aliases: uniqueNonEmpty(input.draft.aliases),
    gender: input.draft.gender.trim(),
    profileSummary: input.draft.profileSummary.trim(),
    backgroundSummary: input.draft.backgroundSummary.trim(),
    corePersonality: uniqueNonEmpty(input.draft.corePersonality),
    values: uniqueNonEmpty(input.draft.values),
    coreMotivations: uniqueNonEmpty(input.draft.coreMotivations),
    majorRelationships: input.draft.majorRelationships.map((relationship) => ({
      ...relationship,
      relationshipId: relationship.relationshipId.trim(),
      targetCharacterAssetId:
        relationship.targetCharacterAssetId?.trim() || undefined,
      label: relationship.label.trim(),
      summary: relationship.summary.trim()
    })),
    sourceProfile: input.draft.sourceProfile
      ? {
          temporalAnchor: input.draft.sourceProfile.temporalAnchor
            ? {
                lifeStage:
                  input.draft.sourceProfile.temporalAnchor.lifeStage?.trim() ||
                  undefined,
                exactAge: input.draft.sourceProfile.temporalAnchor.exactAge,
                birthDate:
                  input.draft.sourceProfile.temporalAnchor.birthDate?.trim() ||
                  undefined
              }
            : undefined,
          publicIdentity:
            input.draft.sourceProfile.publicIdentity?.trim() || undefined,
          occupation:
            input.draft.sourceProfile.occupation?.trim() || undefined,
          socialPosition:
            input.draft.sourceProfile.socialPosition?.trim() || undefined,
          appearance:
            input.draft.sourceProfile.appearance?.trim() || undefined,
          speechStyle:
            input.draft.sourceProfile.speechStyle?.trim() || undefined,
          longTermGoal:
            input.draft.sourceProfile.longTermGoal?.trim() || undefined,
          usualPlaceHints: uniqueNonEmpty(
            input.draft.sourceProfile.usualPlaceHints
          ),
          contactRoutes: uniqueNonEmpty(input.draft.sourceProfile.contactRoutes)
        }
      : undefined,
    entryMode: input.global
      ? input.draft.entryMode === 'follow_project'
        ? 'natural'
        : input.draft.entryMode
      : 'follow_project',
    adaptationPolicy: {
      temporalPolicy: input.draft.adaptationPolicy.temporalPolicy,
      lockedFields: uniqueNonEmpty(input.draft.adaptationPolicy.lockedFields),
      adaptableFields: uniqueNonEmpty(
        input.draft.adaptationPolicy.adaptableFields
      ),
      identityAnchors: uniqueNonEmpty(
        input.draft.adaptationPolicy.identityAnchors ?? []
      ),
      permittedTransformations: uniqueNonEmpty(
        input.draft.adaptationPolicy.permittedTransformations ?? []
      ),
      forbiddenTransformations: uniqueNonEmpty(
        input.draft.adaptationPolicy.forbiddenTransformations ?? []
      ),
      conflictNotes: uniqueNonEmpty(
        input.draft.adaptationPolicy.conflictNotes ?? []
      )
    },
    deployments: input.deployments.map((deployment) => ({
      ...deployment,
      defaultEnabledForNewGame:
        deployment.mode === 'disabled'
          ? false
          : deployment.defaultEnabledForNewGame
    })),
    sourceSpans: [],
    lifecycle:
      input.mode === 'publish'
        ? {
            generationStatus: 'ready',
            reviewStatus: 'approved',
            availabilityStatus: 'enabled'
          }
        : {
            generationStatus: 'ready',
            reviewStatus: 'needs_review',
            availabilityStatus: 'disabled'
          }
  });
  const previousProjects = input.existingAsset?.projectIds ?? [];
  const asset: CustomCharacterAsset = {
    characterAssetId,
    latestRevision: revisionNumber,
    revisionCount: (input.existingAsset?.revisionCount ?? 0) + 1,
    global: input.global || input.existingAsset?.global === true,
    projectIds: uniqueNonEmpty([...previousProjects, ...input.projectIds]),
    createdAt: input.existingAsset?.createdAt ?? now,
    updatedAt: now
  };

  await repository.saveRevisionBundle({
    assetKind: 'character',
    asset,
    revision
  });
  return { asset, revision };
}

export async function setCustomCharacterAvailability({
  repository,
  asset,
  availabilityStatus,
  now
}: {
  repository: IndexedDbCustomContentRepository;
  asset: CustomCharacterAsset;
  availabilityStatus: 'enabled' | 'disabled' | 'archived';
  now?: () => string;
}): Promise<{
  asset: CustomCharacterAsset;
  revision: CustomCharacterRevision;
}> {
  const result = await buildAvailabilityRevision({
    repository,
    asset,
    availabilityStatus,
    updatedAt: now?.() ?? new Date().toISOString()
  });
  await repository.saveRevisionBundle({
    assetKind: 'character',
    asset: result.asset,
    revision: result.revision
  });
  return result;
}

async function buildAvailabilityRevision({
  repository,
  asset,
  availabilityStatus,
  updatedAt
}: {
  repository: IndexedDbCustomContentRepository;
  asset: CustomCharacterAsset;
  availabilityStatus: 'enabled' | 'disabled' | 'archived';
  updatedAt: string;
}): Promise<{
  asset: CustomCharacterAsset;
  revision: CustomCharacterRevision;
}> {
  const current = await repository.getCharacterRevision(
    asset.characterAssetId,
    asset.latestRevision
  );
  if (!current) {
    throw new Error('找不到人物最新 revision。');
  }
  if (
    availabilityStatus === 'enabled' &&
    (current.lifecycle.generationStatus !== 'ready' ||
      current.lifecycle.reviewStatus !== 'approved' ||
      !hasPublishableWorldDeployment(current.deployments))
  ) {
    throw new Error('只有已审核且至少投放一个世界包的人物才能启用。');
  }
  const revision = await revisionWithChecksum({
    ...current,
    revision: current.revision + 1,
    lifecycle: {
      ...current.lifecycle,
      availabilityStatus
    }
  });
  const nextAsset: CustomCharacterAsset = {
    ...asset,
    latestRevision: revision.revision,
    revisionCount: asset.revisionCount + 1,
    updatedAt
  };
  return { asset: nextAsset, revision };
}

export async function setManyCustomCharacterAvailability({
  repository,
  assets,
  availabilityStatus,
  now
}: {
  repository: IndexedDbCustomContentRepository;
  assets: readonly CustomCharacterAsset[];
  availabilityStatus: 'enabled' | 'disabled' | 'archived';
  now?: () => string;
}): Promise<void> {
  const updatedAt = now?.() ?? new Date().toISOString();
  const revisions = [];
  for (const asset of assets) {
    revisions.push(await buildAvailabilityRevision({
      repository,
      asset,
      availabilityStatus,
      updatedAt
    }));
  }
  await repository.saveCharacterRevisionBundles(
    revisions.map((item) => ({
      assetKind: 'character' as const,
      asset: item.asset,
      revision: item.revision
    }))
  );
}

export async function promoteCustomCharacterToGlobal({
  repository,
  asset,
  now
}: {
  repository: IndexedDbCustomContentRepository;
  asset: CustomCharacterAsset;
  now?: () => string;
}): Promise<CustomCharacterAsset> {
  if (asset.global) return asset;
  const promoted = promoteCustomCharacterAssetToGlobal(
    asset,
    now?.() ?? new Date().toISOString()
  );
  await repository.saveCharacterAsset(promoted);
  return promoted;
}
