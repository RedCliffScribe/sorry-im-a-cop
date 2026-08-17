import type { Actor } from '../runtime/types';
import type { CustomCharacterDraft } from './characterCreation';
import {
  saveCustomCharacterRevision,
  type CharacterManagementDependencies
} from './characterManagement';
import { createCustomContentChecksum } from './checksum';
import type { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import { createDefaultCustomCharacterAdaptationPolicy } from './worldAdaptation';

const IMPORT_PLACEHOLDER = '有待玩家在自定义人物库中补充';

export interface ImportRuntimeActorInput {
  repository: IndexedDbCustomContentRepository;
  worldpackId: string;
  actor: Actor;
  sourceCharacterAssetId?: string;
  dependencies?: CharacterManagementDependencies;
}

export type ImportRuntimeActorResult =
  | {
      status: 'imported';
      characterAssetId: string;
      revision: number;
    }
  | {
      status: 'already_exists';
      characterAssetId: string;
      revision: number;
    };

function uniqueNonEmpty(values: readonly (string | undefined)[]): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );
}

function splitReusableList(value: string): string[] {
  return uniqueNonEmpty(value.split(/[\n、，,；;|/]+/u));
}

function addLabeledFragment(
  fragments: string[],
  label: string,
  value: string | undefined
): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  fragments.push(`${label}：${trimmed}`);
}

export function createCustomCharacterDraftFromRuntimeActor(
  actor: Actor
): CustomCharacterDraft {
  const backgroundFragments = uniqueNonEmpty([
    actor.actualIdentitySummary,
    actor.publicIdentity,
    actor.positionSummary
  ]);
  addLabeledFragment(backgroundFragments, '年龄印象', actor.visualAgeAnchor);
  addLabeledFragment(backgroundFragments, '外貌', actor.appearance);
  addLabeledFragment(backgroundFragments, '常见衣着', actor.clothing);
  addLabeledFragment(backgroundFragments, '说话风格', actor.speechStyle);

  const corePersonality = splitReusableList(actor.personality);
  const values = splitReusableList(actor.values);
  const coreMotivations = uniqueNonEmpty([
    ...splitReusableList(actor.motivation),
    ...splitReusableList(actor.longTermGoal)
  ]);

  return {
    displayName: actor.name.trim() || '未命名人物',
    aliases: uniqueNonEmpty([
      ...actor.aliases,
      actor.callName,
      actor.englishName
    ]),
    gender:
      actor.gender === 'male'
        ? '男'
        : actor.gender === 'female'
          ? '女'
          : actor.gender === 'nonbinary'
            ? '非二元'
            : '未知',
    profileSummary:
      actor.profileSummary.trim() ||
      actor.publicIdentity?.trim() ||
      actor.positionSummary.trim() ||
      `${actor.name.trim() || '该人物'}的人物档案。`,
    backgroundSummary:
      backgroundFragments.join('；') || `${actor.name.trim() || '该人物'}的背景有待补充。`,
    corePersonality:
      corePersonality.length > 0 ? corePersonality : [IMPORT_PLACEHOLDER],
    values: values.length > 0 ? values : [IMPORT_PLACEHOLDER],
    coreMotivations:
      coreMotivations.length > 0 ? coreMotivations : [IMPORT_PLACEHOLDER],
    majorRelationships: [],
    entryMode: 'natural',
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy()
  };
}

export async function createRuntimeActorImportAssetId({
  worldpackId,
  actorId
}: {
  worldpackId: string;
  actorId: string;
}): Promise<string> {
  const checksum = await createCustomContentChecksum({
    kind: 'runtime_actor_import',
    schemaVersion: 1,
    worldpackId: worldpackId.trim(),
    actorId: actorId.trim()
  });
  return `character-runtime-${checksum.slice(0, 32)}`;
}

export async function importRuntimeActorToCustomLibrary({
  repository,
  worldpackId,
  actor,
  sourceCharacterAssetId,
  dependencies
}: ImportRuntimeActorInput): Promise<ImportRuntimeActorResult> {
  const existingSourceAsset = sourceCharacterAssetId
    ? await repository.getCharacterAsset(sourceCharacterAssetId)
    : null;
  if (existingSourceAsset) {
    return {
      status: 'already_exists',
      characterAssetId: existingSourceAsset.characterAssetId,
      revision: existingSourceAsset.latestRevision
    };
  }

  const characterAssetId = await createRuntimeActorImportAssetId({
    worldpackId,
    actorId: actor.actorId
  });
  const existingImport = await repository.getCharacterAsset(characterAssetId);
  if (existingImport) {
    return {
      status: 'already_exists',
      characterAssetId: existingImport.characterAssetId,
      revision: existingImport.latestRevision
    };
  }

  const imported = await saveCustomCharacterRevision({
    repository,
    input: {
      draft: createCustomCharacterDraftFromRuntimeActor(actor),
      deployments: [
        {
          worldpackId,
          mode: 'native',
          defaultEnabledForNewGame: false
        }
      ],
      global: true,
      projectIds: [],
      mode: 'needs_review'
    },
    dependencies: {
      ...dependencies,
      createId: () => characterAssetId
    }
  });

  return {
    status: 'imported',
    characterAssetId: imported.asset.characterAssetId,
    revision: imported.revision.revision
  };
}
