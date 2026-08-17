import type {
  CustomCharacterAsset,
  CustomCharacterRevision,
  CustomAssetLifecycle,
  CustomContentDependency,
  CustomContentProjectAsset,
  CustomContentProjectRevision,
  CustomEventGroupAsset,
  CustomEventGroupRevision
} from '../../domain/customContent/assetTypes';
import type { IndexedDbCustomContentRepository } from '../../domain/customContent/IndexedDbCustomContentRepository';
import type { CustomContentWorldDeployment } from '../../domain/customContent/worldAdaptation';
import { createCustomContentRevisionRef } from '../../domain/customContent/assetFoundation';
import type { CustomCharacterWorkingDraftRecord } from '../../domain/customContent/characterWorkingDraft';

export type CustomContentWorkshopKind = 'characters' | 'events';

export interface CustomContentWorkshopEntry {
  id: string;
  kind: CustomContentWorkshopKind;
  title: string;
  summary: string;
  revision: number;
  lifecycle: CustomAssetLifecycle;
  deployments: CustomContentWorldDeployment[];
  projectIds: string[];
  global?: boolean;
  updatedAt: string;
  characterAsset?: CustomCharacterAsset;
  characterRevision?: CustomCharacterRevision;
  characterWorkingDraft?: CustomCharacterWorkingDraftRecord;
  eventGroupAsset?: CustomEventGroupAsset;
  eventGroupRevision?: CustomEventGroupRevision;
  projectAsset?: CustomContentProjectAsset;
  projectRevision?: CustomContentProjectRevision;
  incomingReferences: CustomContentDependency[];
}

async function loadCharacterWorkingDraftEntry(
  repository: IndexedDbCustomContentRepository,
  workingDraft: CustomCharacterWorkingDraftRecord
): Promise<CustomContentWorkshopEntry> {
  const sourceAsset = workingDraft.sourceCharacterAssetId
    ? await repository.getCharacterAsset(workingDraft.sourceCharacterAssetId)
    : null;
  return {
    id: workingDraft.workingDraftId,
    kind: 'characters',
    title: workingDraft.draft.displayName || '未命名人物草稿',
    summary:
      workingDraft.draft.profileSummary ||
      workingDraft.description ||
      '尚未填写人物摘要。',
    revision: 0,
    lifecycle: {
      generationStatus: 'idle',
      reviewStatus: 'draft',
      availabilityStatus: 'disabled'
    },
    deployments: workingDraft.deployments.map((item) => ({ ...item })),
    projectIds: [...workingDraft.projectIds],
    global: workingDraft.global,
    updatedAt: workingDraft.updatedAt,
    characterAsset: sourceAsset ?? undefined,
    characterWorkingDraft: workingDraft,
    incomingReferences: []
  };
}

export interface CustomContentWorkshopProject {
  id: string;
  title: string;
  revision: number;
}

export interface CustomContentWorkshopLibrary {
  characters: CustomContentWorkshopEntry[];
  events: CustomContentWorkshopEntry[];
  projects: CustomContentWorkshopProject[];
  projectCount: number;
}

function byUpdatedAtDescending(
  left: CustomContentWorkshopEntry,
  right: CustomContentWorkshopEntry
): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

async function loadProjectDeployments(
  repository: IndexedDbCustomContentRepository,
  assets: readonly CustomContentProjectAsset[]
): Promise<{
  projects: CustomContentWorkshopProject[];
  details: Map<
    string,
    {
      asset: CustomContentProjectAsset;
      revision: CustomContentProjectRevision;
    }
  >;
}> {
  const entries = await Promise.all(
    assets.map(async (asset) => {
      const revision = await repository.getProjectRevision(
        asset.projectId,
        asset.latestRevision
      );
      return {
        projectId: asset.projectId,
        revision
      };
    })
  );
  const details = new Map<
    string,
    {
      asset: CustomContentProjectAsset;
      revision: CustomContentProjectRevision;
    }
  >();
  for (const entry of entries) {
    const asset = assets.find((item) => item.projectId === entry.projectId);
    if (asset && entry.revision) {
      details.set(entry.projectId, {
        asset,
        revision: entry.revision
      });
    }
  }
  return {
    details,
    projects: entries.flatMap((entry) =>
      entry.revision
        ? [
            {
              id: entry.projectId,
              title: entry.revision.title,
              revision: entry.revision.revision
            }
          ]
        : []
    )
  };
}

async function loadCharacterEntry(
  repository: IndexedDbCustomContentRepository,
  asset: CustomCharacterAsset
): Promise<CustomContentWorkshopEntry | null> {
  const revision = await repository.getCharacterRevision(
    asset.characterAssetId,
    asset.latestRevision
  );
  if (!revision) return null;
  const incomingReferences = await repository.listDependenciesForTarget(
    createCustomContentRevisionRef(revision)
  );
  return {
    id: asset.characterAssetId,
    kind: 'characters',
    title: revision.displayName,
    summary: revision.profileSummary,
    revision: revision.revision,
    lifecycle: revision.lifecycle,
    deployments: revision.deployments,
    projectIds: [...asset.projectIds],
    global: asset.global,
    updatedAt: asset.updatedAt,
    characterAsset: asset,
    characterRevision: revision,
    incomingReferences
  };
}

async function loadEventEntry(
  repository: IndexedDbCustomContentRepository,
  asset: CustomEventGroupAsset,
  projects: ReadonlyMap<
    string,
    {
      asset: CustomContentProjectAsset;
      revision: CustomContentProjectRevision;
    }
  >
): Promise<CustomContentWorkshopEntry | null> {
  const revision = await repository.getEventGroupRevision(
    asset.eventGroupId,
    asset.latestRevision
  );
  if (!revision) return null;
  const project = projects.get(revision.projectId);
  const incomingReferences = await repository.listDependenciesForTarget(
    createCustomContentRevisionRef(revision)
  );
  return {
    id: asset.eventGroupId,
    kind: 'events',
    title: revision.title,
    summary: revision.summary,
    revision: revision.revision,
    lifecycle: revision.lifecycle,
    deployments:
      revision.inheritProjectDeployments
        ? [...(project?.revision.deployments ?? [])]
        : [...(revision.deployments ?? [])],
    projectIds: [revision.projectId],
    updatedAt: asset.updatedAt,
    eventGroupAsset: asset,
    eventGroupRevision: revision,
    projectAsset: project?.asset,
    projectRevision: project?.revision,
    incomingReferences
  };
}

function present<T>(value: T | null): value is T {
  return value !== null;
}

export async function loadCustomContentWorkshopLibrary(
  repository: IndexedDbCustomContentRepository
): Promise<CustomContentWorkshopLibrary> {
  const [projectAssets, characterAssets, characterWorkingDrafts, eventAssets] = await Promise.all([
    repository.listProjectAssets(),
    repository.listCharacterAssets(),
    typeof repository.listCharacterWorkingDrafts === 'function'
      ? repository.listCharacterWorkingDrafts()
      : Promise.resolve([]),
    repository.listEventGroupAssets()
  ]);
  const projectLibrary = await loadProjectDeployments(
    repository,
    projectAssets
  );
  const [characters, workingDraftCharacters, events] = await Promise.all([
    Promise.all(characterAssets.map((asset) => loadCharacterEntry(repository, asset))),
    Promise.all(
      characterWorkingDrafts.map((draft) =>
        loadCharacterWorkingDraftEntry(repository, draft)
      )
    ),
    Promise.all(
      eventAssets.map((asset) =>
        loadEventEntry(
          repository,
          asset,
          projectLibrary.details
        )
      )
    )
  ]);

  return {
    characters: [...characters.filter(present), ...workingDraftCharacters].sort(
      byUpdatedAtDescending
    ),
    events: events.filter(present).sort(byUpdatedAtDescending),
    projects: projectLibrary.projects,
    projectCount: projectAssets.length
  };
}
