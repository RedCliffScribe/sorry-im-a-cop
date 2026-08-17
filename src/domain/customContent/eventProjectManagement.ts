import type {
  SaveCustomContentRevisionBundle
} from './IndexedDbCustomContentRepository';
import type { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import {
  createCustomContentRevisionRef,
  customContentRevisionRefKey
} from './assetFoundation';
import type {
  CustomAssetLifecycle,
  CustomCharacterAsset,
  CustomCharacterRevision,
  CustomContentDependency,
  CustomContentProjectAsset,
  CustomContentProjectRevision,
  CustomContentRevisionRef,
  CustomEventGroupAsset,
  CustomEventGroupRevision,
  CustomImportedFact
} from './assetTypes';
import { createCustomContentChecksum } from './checksum';
import type {
  CustomEventGroupDraft,
  CustomEventProjectDraft
} from './eventProjectCreation';
import {
  normalizeCustomEventProjectDraftReferences,
  validateCustomEventProjectDraftReferences
} from './eventProjectCreation';
import {
  assessCustomCharacterAdaptationPolicy,
  hasPublishableWorldDeployment,
  type CustomContentWorldDeployment
} from './worldAdaptation';

export type CustomEventProjectSaveMode = 'needs_review' | 'publish';

export interface ExistingCustomEventProjectState {
  projectAsset: CustomContentProjectAsset;
  projectRevision: CustomContentProjectRevision;
  characterAssets: Record<string, CustomCharacterAsset>;
  eventGroupAssets: Record<string, CustomEventGroupAsset>;
}

export interface SaveCustomEventProjectInput {
  draft: CustomEventProjectDraft;
  projectDeployments: CustomContentWorldDeployment[];
  eventDeploymentOverrides: Record<
    string,
    CustomContentWorldDeployment[] | undefined
  >;
  mode: CustomEventProjectSaveMode;
  existing?: ExistingCustomEventProjectState;
}

export interface EventProjectManagementDependencies {
  now?: () => string;
  createId?: (prefix: 'project' | 'character' | 'event-group') => string;
}

function defaultId(prefix: 'project' | 'character' | 'event-group'): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function normalizedDeployments(
  deployments: readonly CustomContentWorldDeployment[]
): CustomContentWorldDeployment[] {
  return deployments.map((deployment) => ({
    ...deployment,
    defaultEnabledForNewGame:
      deployment.mode === 'disabled'
        ? false
        : deployment.defaultEnabledForNewGame
  }));
}

function lifecycleForMode(
  mode: CustomEventProjectSaveMode
): CustomAssetLifecycle {
  return mode === 'publish'
    ? {
        generationStatus: 'ready',
        reviewStatus: 'approved',
        availabilityStatus: 'enabled'
      }
    : {
        generationStatus: 'ready',
        reviewStatus: 'needs_review',
        availabilityStatus: 'disabled'
      };
}

function requireText(label: string, value: string): void {
  if (!value.trim()) throw new Error(`${label}不能为空。`);
}

function validateCharacterCandidate(
  candidate: CustomEventProjectDraft['characterCandidates'][number]
): void {
  requireText('项目人物姓名', candidate.character.displayName);
  requireText('项目人物性别', candidate.character.gender);
  requireText('项目人物摘要', candidate.character.profileSummary);
  requireText('项目人物背景', candidate.character.backgroundSummary);
  if (uniqueNonEmpty(candidate.character.corePersonality).length === 0) {
    throw new Error(`项目人物“${candidate.character.displayName}”至少需要一项核心性格。`);
  }
  if (uniqueNonEmpty(candidate.character.values).length === 0) {
    throw new Error(`项目人物“${candidate.character.displayName}”至少需要一项价值观。`);
  }
  if (uniqueNonEmpty(candidate.character.coreMotivations).length === 0) {
    throw new Error(`项目人物“${candidate.character.displayName}”至少需要一项核心动机。`);
  }
  const assessment = assessCustomCharacterAdaptationPolicy(
    candidate.character.adaptationPolicy
  );
  if (assessment.status === 'needs_review') {
    throw new Error(
      `项目人物“${candidate.character.displayName}”的锁定字段与可适配字段冲突：${assessment.conflictingFields.join('、')}`
    );
  }
}

function validateEventGroup(group: CustomEventGroupDraft): void {
  requireText('事件组标题', group.title);
  requireText(`事件组“${group.title}”摘要`, group.summary);
  if (uniqueNonEmpty(group.invariantCore).length === 0) {
    throw new Error(`事件组“${group.title}”至少需要一项核心不变量。`);
  }
  if (group.stages.length === 0) {
    throw new Error(`事件组“${group.title}”至少需要一个阶段。`);
  }
  for (const slot of group.roleSlots) {
    requireText('角色槽标题', slot.title);
    requireText(`角色槽“${slot.title}”摘要`, slot.summary);
  }
  for (const stage of group.stages) {
    requireText('事件阶段标题', stage.title);
    requireText(`阶段“${stage.title}”摘要`, stage.summary);
    if (stage.eventNodes.length === 0) {
      throw new Error(`阶段“${stage.title}”至少需要一个事件节点。`);
    }
    for (const node of stage.eventNodes) {
      requireText('事件节点标题', node.title);
      requireText(`节点“${node.title}”摘要`, node.summary);
      if (uniqueNonEmpty(node.possibleOutcomes).length === 0) {
        throw new Error(`节点“${node.title}”至少需要一个可能结果。`);
      }
      for (const usage of node.characterUsages) {
        requireText('节点人物用途', usage.usageSummary);
      }
    }
  }
}

function validateSave(input: SaveCustomEventProjectInput): void {
  validateCustomEventProjectDraftReferences(input.draft);
  requireText('项目标题', input.draft.project.title);
  requireText('项目摘要', input.draft.project.summary);
  if (input.draft.eventGroups.length === 0) {
    throw new Error('轻量项目至少需要一个事件组。');
  }
  for (const candidate of input.draft.characterCandidates) {
    validateCharacterCandidate(candidate);
  }
  for (const group of input.draft.eventGroups) {
    validateEventGroup(group);
  }
  if (
    input.mode === 'publish' &&
    !hasPublishableWorldDeployment(input.projectDeployments)
  ) {
    throw new Error('发布项目前必须至少启用一个世界包。');
  }
  if (input.mode === 'publish') {
    for (const group of input.draft.eventGroups) {
      const override = input.eventDeploymentOverrides[group.eventGroupKey] ?? [];
      if (
        !group.inheritProjectDeployments &&
        !hasPublishableWorldDeployment(override)
      ) {
        throw new Error(
          `事件组“${group.title}”覆盖项目投放时必须至少启用一个世界包。`
        );
      }
    }
  }
}

async function withChecksum<T extends object>(
  value: T
): Promise<T & { checksum: string }> {
  return {
    ...value,
    checksum: await createCustomContentChecksum(value)
  };
}

function importedFacts(
  values: CustomEventGroupDraft['stages'][number]['establishedSourceFacts']
): CustomImportedFact[] {
  return values.map((fact) => ({
    factId: fact.factKey,
    summary: fact.summary.trim(),
    state: 'source_only',
    sourceSpans: []
  }));
}

function dependencyId(
  owner: CustomContentRevisionRef,
  target: CustomContentRevisionRef,
  kind: CustomContentDependency['kind']
): string {
  return `dependency:${kind}:${customContentRevisionRefKey(owner)}:${customContentRevisionRefKey(target)}`;
}

function dependenciesForTargets(
  owner: CustomContentRevisionRef,
  targets: readonly CustomContentRevisionRef[]
): CustomContentDependency[] {
  return Array.from(
    new Map(
      targets.map((target) => [
        customContentRevisionRefKey(target),
        {
          dependencyId: dependencyId(owner, target, 'required'),
          owner,
          target,
          kind: 'required' as const
        }
      ])
    ).values()
  );
}

export async function saveCustomEventProjectRevision({
  repository,
  input,
  dependencies = {}
}: {
  repository: IndexedDbCustomContentRepository;
  input: SaveCustomEventProjectInput;
  dependencies?: EventProjectManagementDependencies;
}): Promise<{
  projectAsset: CustomContentProjectAsset;
  projectRevision: CustomContentProjectRevision;
  characterAssets: CustomCharacterAsset[];
  characterRevisions: CustomCharacterRevision[];
  eventGroupAssets: CustomEventGroupAsset[];
  eventGroupRevisions: CustomEventGroupRevision[];
}> {
  const normalizedInput: SaveCustomEventProjectInput = {
    ...input,
    draft: normalizeCustomEventProjectDraftReferences(input.draft)
  };
  validateSave(normalizedInput);
  const draft = normalizedInput.draft;
  const now = dependencies.now?.() ?? new Date().toISOString();
  const createId = dependencies.createId ?? defaultId;
  const projectId =
    input.existing?.projectAsset.projectId ?? createId('project');
  const lifecycle = lifecycleForMode(input.mode);
  const projectDeployments = normalizedDeployments(input.projectDeployments);

  const characterAssets: CustomCharacterAsset[] = [];
  const characterRevisions: CustomCharacterRevision[] = [];
  const characterRefs = new Map<string, CustomContentRevisionRef>();
  const characterIds = new Map<string, string>();

  for (const candidate of draft.characterCandidates) {
    if (candidate.revisionRef) {
      const [asset, revision] = await Promise.all([
        repository.getCharacterAsset(candidate.revisionRef.assetId),
        repository.getCharacterRevision(
          candidate.revisionRef.assetId,
          candidate.revisionRef.revision
        )
      ]);
      if (!asset || !revision) {
        throw new Error(
          `人物库引用“${candidate.character.displayName}”的 revision 已不存在。`
        );
      }
      if (revision.checksum !== candidate.revisionRef.checksum) {
        throw new Error(
          `人物库引用“${candidate.character.displayName}”的 revision 校验值不一致。`
        );
      }
      characterIds.set(candidate.candidateKey, candidate.revisionRef.assetId);
      characterRefs.set(candidate.candidateKey, {
        ...candidate.revisionRef
      });
      continue;
    }
    const existingAsset = input.existing?.characterAssets[candidate.candidateKey];
    characterIds.set(
      candidate.candidateKey,
      existingAsset?.characterAssetId ?? createId('character')
    );
  }

  for (const candidate of draft.characterCandidates) {
    if (candidate.revisionRef) continue;
    const existingAsset = input.existing?.characterAssets[candidate.candidateKey];
    const characterAssetId = characterIds.get(candidate.candidateKey);
    if (!characterAssetId) {
      throw new Error(`找不到项目人物稳定 ID：${candidate.candidateKey}`);
    }
    const revisionNumber = (existingAsset?.latestRevision ?? 0) + 1;
    const revision = await withChecksum({
      characterAssetId,
      revision: revisionNumber,
      displayName: candidate.character.displayName.trim(),
      aliases: uniqueNonEmpty(candidate.character.aliases),
      gender: candidate.character.gender.trim(),
      profileSummary: candidate.character.profileSummary.trim(),
      backgroundSummary: candidate.character.backgroundSummary.trim(),
      corePersonality: uniqueNonEmpty(candidate.character.corePersonality),
      values: uniqueNonEmpty(candidate.character.values),
      coreMotivations: uniqueNonEmpty(candidate.character.coreMotivations),
      majorRelationships: candidate.character.majorRelationships.map(
        (relationship) => ({
          ...relationship,
          relationshipId: relationship.relationshipId.trim(),
          targetCharacterAssetId:
            characterIds.get(relationship.targetCharacterAssetId ?? '') ??
            relationship.targetCharacterAssetId?.trim() ??
            undefined,
          label: relationship.label.trim(),
          summary: relationship.summary.trim()
        })
      ),
      sourceProfile: candidate.character.sourceProfile
        ? {
            ...candidate.character.sourceProfile,
            temporalAnchor: candidate.character.sourceProfile.temporalAnchor
              ? { ...candidate.character.sourceProfile.temporalAnchor }
              : undefined,
            usualPlaceHints: uniqueNonEmpty(
              candidate.character.sourceProfile.usualPlaceHints
            ),
            contactRoutes: uniqueNonEmpty(
              candidate.character.sourceProfile.contactRoutes
            )
          }
        : undefined,
      entryMode: 'follow_project' as const,
      adaptationPolicy: {
        temporalPolicy: candidate.character.adaptationPolicy.temporalPolicy,
        lockedFields: uniqueNonEmpty(
          candidate.character.adaptationPolicy.lockedFields
        ),
        adaptableFields: uniqueNonEmpty(
          candidate.character.adaptationPolicy.adaptableFields
        ),
        identityAnchors: uniqueNonEmpty(
          candidate.character.adaptationPolicy.identityAnchors ?? []
        ),
        permittedTransformations: uniqueNonEmpty(
          candidate.character.adaptationPolicy.permittedTransformations ?? []
        ),
        forbiddenTransformations: uniqueNonEmpty(
          candidate.character.adaptationPolicy.forbiddenTransformations ?? []
        ),
        conflictNotes: uniqueNonEmpty(
          candidate.character.adaptationPolicy.conflictNotes ?? []
        )
      },
      deployments: projectDeployments.map((deployment) => ({ ...deployment })),
      sourceSpans: [],
      lifecycle: { ...lifecycle }
    });
    const asset: CustomCharacterAsset = {
      characterAssetId,
      latestRevision: revisionNumber,
      revisionCount: (existingAsset?.revisionCount ?? 0) + 1,
      global: existingAsset?.global ?? false,
      projectIds: uniqueNonEmpty([
        ...(existingAsset?.projectIds ?? []),
        projectId
      ]),
      createdAt: existingAsset?.createdAt ?? now,
      updatedAt: now
    };
    characterAssets.push(asset);
    characterRevisions.push(revision);
    characterRefs.set(
      candidate.candidateKey,
      createCustomContentRevisionRef(revision)
    );
  }

  const eventGroupAssets: CustomEventGroupAsset[] = [];
  const eventGroupRevisions: CustomEventGroupRevision[] = [];
  const eventBundles: SaveCustomContentRevisionBundle[] = [];

  for (const group of draft.eventGroups) {
    const existingAsset = input.existing?.eventGroupAssets[group.eventGroupKey];
    const eventGroupId =
      existingAsset?.eventGroupId ?? createId('event-group');
    const revisionNumber = (existingAsset?.latestRevision ?? 0) + 1;
    const referencedCharacterKeys = new Set(group.characterCandidateKeys);
    const currentPlayerRoleSlotKeys = new Set(
      group.roleSlots
        .filter((slot) => slot.bindingMode === 'current_player')
        .map((slot) => slot.roleSlotKey)
    );
    for (const slot of group.roleSlots) {
      if (slot.fixedCharacterKey) {
        referencedCharacterKeys.add(slot.fixedCharacterKey);
      }
    }
    for (const stage of group.stages) {
      for (const node of stage.eventNodes) {
        for (const usage of node.characterUsages) {
          if (
            usage.characterCandidateKey &&
            !(
              usage.roleSlotKey &&
              currentPlayerRoleSlotKeys.has(usage.roleSlotKey)
            )
          ) {
            referencedCharacterKeys.add(usage.characterCandidateKey);
          }
        }
      }
    }
    const referencedCharacters = [...referencedCharacterKeys].map((key) => {
      const ref = characterRefs.get(key);
      if (!ref) throw new Error(`找不到项目人物 revision：${key}`);
      return ref;
    });
    const override = normalizedDeployments(
      input.eventDeploymentOverrides[group.eventGroupKey] ?? []
    );
    const revision = await withChecksum({
      eventGroupId,
      projectId,
      revision: revisionNumber,
      title: group.title.trim(),
      summary: group.summary.trim(),
      invariantCore: uniqueNonEmpty(group.invariantCore),
      mutableSlots: uniqueNonEmpty(group.mutableSlots),
      forbiddenAdaptations: uniqueNonEmpty(group.forbiddenAdaptations),
      characterRefs: referencedCharacters,
      roleSlots: group.roleSlots.map((slot) => ({
        roleSlotId: slot.roleSlotKey,
        title: slot.title.trim(),
        summary: slot.summary.trim(),
        bindingMode: slot.bindingMode,
        fixedCharacterRef: slot.fixedCharacterKey
          ? characterRefs.get(slot.fixedCharacterKey)
          : undefined,
        requirements: uniqueNonEmpty(slot.requirements)
      })),
      stages: group.stages.map((stage) => ({
        stageId: stage.stageKey,
        title: stage.title.trim(),
        summary: stage.summary.trim(),
        establishedSourceFacts: importedFacts(stage.establishedSourceFacts),
        continuationSourceFacts: importedFacts(stage.continuationSourceFacts),
        hardSourceConstraints: importedFacts(stage.hardSourceConstraints),
        foreshadowingOptions: uniqueNonEmpty(stage.foreshadowingOptions),
        eventNodes: stage.eventNodes.map((node) => ({
          nodeId: node.nodeKey,
          title: node.title.trim(),
          summary: node.summary.trim(),
          prerequisites: uniqueNonEmpty(node.prerequisites),
          entryConditions: uniqueNonEmpty(node.entryConditions),
          blockers: uniqueNonEmpty(node.blockers),
          characterUsages: node.characterUsages.map((usage) => ({
            usageId: usage.usageKey,
            roleSlotId: usage.roleSlotKey,
            characterRef:
              usage.characterCandidateKey &&
              !(
                usage.roleSlotKey &&
                currentPlayerRoleSlotKeys.has(usage.roleSlotKey)
              )
              ? characterRefs.get(usage.characterCandidateKey)
              : undefined,
            usageSummary: usage.usageSummary.trim(),
            required: usage.required
          })),
          knowledgeBoundary: {
            knownBy: uniqueNonEmpty(node.knowledgeBoundary.knownBy),
            hiddenFrom: uniqueNonEmpty(node.knowledgeBoundary.hiddenFrom),
            readerOnly: node.knowledgeBoundary.readerOnly
          },
          possibleOutcomes: uniqueNonEmpty(node.possibleOutcomes),
          downstreamEffects: uniqueNonEmpty(node.downstreamEffects)
        })),
        completionHints: uniqueNonEmpty(stage.completionHints),
        nextStageHints: uniqueNonEmpty(stage.nextStageHints)
      })),
      entryMode: group.entryMode,
      reusePolicy: group.reusePolicy,
      deployments: group.inheritProjectDeployments ? undefined : override,
      inheritProjectDeployments: group.inheritProjectDeployments,
      sourceSpans: [],
      lifecycle: { ...lifecycle }
    });
    const asset: CustomEventGroupAsset = {
      eventGroupId,
      projectId,
      latestRevision: revisionNumber,
      revisionCount: (existingAsset?.revisionCount ?? 0) + 1,
      createdAt: existingAsset?.createdAt ?? now,
      updatedAt: now
    };
    const owner = createCustomContentRevisionRef(revision);
    eventGroupAssets.push(asset);
    eventGroupRevisions.push(revision);
    eventBundles.push({
      assetKind: 'event_group',
      asset,
      revision,
      dependencies: dependenciesForTargets(owner, referencedCharacters)
    });
  }

  const projectAsset: CustomContentProjectAsset = {
    projectId,
    latestRevision: (input.existing?.projectAsset.latestRevision ?? 0) + 1,
    revisionCount: (input.existing?.projectAsset.revisionCount ?? 0) + 1,
    createdAt: input.existing?.projectAsset.createdAt ?? now,
    updatedAt: now
  };
  const projectRevision = await withChecksum({
    projectId,
    revision: projectAsset.latestRevision,
    title: draft.project.title.trim(),
    summary: draft.project.summary.trim(),
    conversionMode: draft.project.conversionMode,
    characterAssetIds: Array.from(
      new Set([...characterRefs.values()].map((ref) => ref.assetId))
    ),
    eventGroupIds: eventGroupAssets.map((asset) => asset.eventGroupId),
    deployments: projectDeployments,
    sourceDocumentIds:
      input.existing?.projectRevision.sourceDocumentIds.map((id) => id) ?? [],
    lifecycle: { ...lifecycle }
  });
  const projectOwner = createCustomContentRevisionRef(projectRevision);
  const characterBundles: SaveCustomContentRevisionBundle[] =
    characterAssets.map((asset, index) => ({
      assetKind: 'character',
      asset,
      revision: characterRevisions[index]
    }));
  const projectTargets = [
    ...new Map(
      [...characterRefs.values()].map((ref) => [
        customContentRevisionRefKey(ref),
        ref
      ])
    ).values(),
    ...eventGroupRevisions.map(createCustomContentRevisionRef)
  ];
  await repository.saveRevisionBundles([
    {
      assetKind: 'content_project',
      asset: projectAsset,
      revision: projectRevision,
      dependencies: dependenciesForTargets(projectOwner, projectTargets)
    },
    ...characterBundles,
    ...eventBundles
  ]);

  return {
    projectAsset,
    projectRevision,
    characterAssets,
    characterRevisions,
    eventGroupAssets,
    eventGroupRevisions
  };
}

export async function setCustomEventGroupAvailability({
  repository,
  asset,
  availabilityStatus,
  now
}: {
  repository: IndexedDbCustomContentRepository;
  asset: CustomEventGroupAsset;
  availabilityStatus: 'enabled' | 'disabled' | 'archived';
  now?: () => string;
}): Promise<{
  asset: CustomEventGroupAsset;
  revision: CustomEventGroupRevision;
}> {
  const current = await repository.getEventGroupRevision(
    asset.eventGroupId,
    asset.latestRevision
  );
  if (!current) throw new Error('找不到事件组最新 revision。');
  if (availabilityStatus === 'enabled') {
    let effectiveDeployments = current.deployments ?? [];
    if (current.inheritProjectDeployments) {
      const projectAsset = await repository.getProjectAsset(current.projectId);
      const projectRevision = projectAsset
        ? await repository.getProjectRevision(
            projectAsset.projectId,
            projectAsset.latestRevision
          )
        : undefined;
      if (
        !projectRevision ||
        projectRevision.lifecycle.generationStatus !== 'ready' ||
        projectRevision.lifecycle.reviewStatus !== 'approved' ||
        projectRevision.lifecycle.availabilityStatus !== 'enabled'
      ) {
        throw new Error('所属项目尚未审核启用，不能启用事件组。');
      }
      effectiveDeployments = projectRevision.deployments;
    }
    if (
      current.lifecycle.generationStatus !== 'ready' ||
      current.lifecycle.reviewStatus !== 'approved' ||
      !hasPublishableWorldDeployment(effectiveDeployments)
    ) {
      throw new Error('只有已审核且至少投放一个世界包的事件组才能启用。');
    }
  }
  const revision = await withChecksum({
    ...current,
    revision: current.revision + 1,
    lifecycle: {
      ...current.lifecycle,
      availabilityStatus
    }
  });
  const nextAsset: CustomEventGroupAsset = {
    ...asset,
    latestRevision: revision.revision,
    revisionCount: asset.revisionCount + 1,
    updatedAt: now?.() ?? new Date().toISOString()
  };
  const previousDependencies = await repository.listDependenciesForOwner(
    createCustomContentRevisionRef(current)
  );
  const owner = createCustomContentRevisionRef(revision);
  await repository.saveRevisionBundle({
    assetKind: 'event_group',
    asset: nextAsset,
    revision,
    dependencies: previousDependencies.map((dependency) => ({
      ...dependency,
      dependencyId: dependencyId(owner, dependency.target, dependency.kind),
      owner
    }))
  });
  return { asset: nextAsset, revision };
}
