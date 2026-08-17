import { z } from 'zod';
import type { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision,
  CustomContentRevisionRef
} from './assetTypes';
import { createCustomContentRevisionRef } from './assetFoundation';
import { createCustomContentChecksum } from './checksum';
import {
  customCharacterTemporalPolicies,
  customContentWorldDeploymentModes
} from './worldAdaptation';

export const CUSTOM_CHARACTER_PACKAGE_FORMAT =
  'sorry-im-a-cop-v2-custom-content';
export const CUSTOM_CHARACTER_PACKAGE_SCHEMA_VERSION = 1;
export const MAX_CUSTOM_CHARACTER_PACKAGE_BYTES = 1_000_000;

const lifecycleSchema = z.strictObject({
  generationStatus: z.enum(['idle', 'processing', 'ready', 'failed']),
  reviewStatus: z.enum(['draft', 'needs_review', 'approved']),
  availabilityStatus: z.enum(['enabled', 'disabled', 'archived'])
});

const deploymentSchema = z.strictObject({
  worldpackId: z.string().trim().min(1),
  mode: z.enum(customContentWorldDeploymentModes),
  defaultEnabledForNewGame: z.boolean()
});

const sourceSpanSchema = z.strictObject({
  sourceDocumentId: z.string().trim().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  chapterId: z.string().trim().min(1).optional(),
  sequence: z.number().int().nonnegative(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/)
});

const characterAssetSchema = z.strictObject({
  characterAssetId: z.string().trim().min(1),
  latestRevision: z.number().int().positive(),
  revisionCount: z.number().int().positive(),
  global: z.boolean(),
  projectIds: z.array(z.string().trim().min(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const characterRevisionSchema = z.strictObject({
  characterAssetId: z.string().trim().min(1),
  revision: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  displayName: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)),
  gender: z.string().trim().min(1),
  profileSummary: z.string().trim().min(1),
  backgroundSummary: z.string().trim().min(1),
  corePersonality: z.array(z.string().trim().min(1)),
  values: z.array(z.string().trim().min(1)),
  coreMotivations: z.array(z.string().trim().min(1)),
  majorRelationships: z.array(
    z.strictObject({
      relationshipId: z.string().trim().min(1),
      targetCharacterAssetId: z.string().trim().min(1).optional(),
      label: z.string().trim().min(1),
      summary: z.string().trim().min(1)
    })
  ),
  sourceProfile: z
    .strictObject({
      temporalAnchor: z
        .strictObject({
          lifeStage: z.string().trim().min(1).optional(),
          exactAge: z.number().int().min(0).max(130).optional(),
          birthDate: z.string().trim().min(1).optional()
        })
        .optional(),
      publicIdentity: z.string().trim().min(1).optional(),
      occupation: z.string().trim().min(1).optional(),
      socialPosition: z.string().trim().min(1).optional(),
      appearance: z.string().trim().min(1).optional(),
      speechStyle: z.string().trim().min(1).optional(),
      longTermGoal: z.string().trim().min(1).optional(),
      usualPlaceHints: z.array(z.string().trim().min(1)),
      contactRoutes: z.array(z.string().trim().min(1))
    })
    .optional(),
  entryMode: z.enum([
    'manual',
    'natural',
    'priority',
    'asap_contact',
    'follow_project'
  ]),
  adaptationPolicy: z.strictObject({
    temporalPolicy: z.enum(customCharacterTemporalPolicies),
    lockedFields: z.array(z.string().trim().min(1)),
    adaptableFields: z.array(z.string().trim().min(1)),
    identityAnchors: z.array(z.string().trim().min(1)).optional(),
    permittedTransformations: z
      .array(z.string().trim().min(1))
      .optional(),
    forbiddenTransformations: z
      .array(z.string().trim().min(1))
      .optional(),
    conflictNotes: z.array(z.string().trim().min(1)).optional()
  }),
  deployments: z.array(deploymentSchema),
  sourceSpans: z.array(sourceSpanSchema),
  lifecycle: lifecycleSchema
});

const revisionRefSchema = z.strictObject({
  assetKind: z.literal('character'),
  assetId: z.string().trim().min(1),
  revision: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/)
});

const characterPackageSchema = z.strictObject({
  format: z.literal(CUSTOM_CHARACTER_PACKAGE_FORMAT),
  schemaVersion: z.literal(CUSTOM_CHARACTER_PACKAGE_SCHEMA_VERSION),
  packageKind: z.literal('character'),
  exportedAt: z.string().datetime(),
  sourceRevisionRef: revisionRefSchema,
  asset: characterAssetSchema,
  revision: characterRevisionSchema
});

export interface CustomCharacterPackage {
  format: typeof CUSTOM_CHARACTER_PACKAGE_FORMAT;
  schemaVersion: typeof CUSTOM_CHARACTER_PACKAGE_SCHEMA_VERSION;
  packageKind: 'character';
  exportedAt: string;
  sourceRevisionRef: CustomContentRevisionRef & { assetKind: 'character' };
  asset: CustomCharacterAsset;
  revision: CustomCharacterRevision;
}

async function checksumRevision(
  revision: Omit<CustomCharacterRevision, 'checksum'>
): Promise<string> {
  return createCustomContentChecksum(revision);
}

export async function createCustomCharacterPackage({
  asset,
  revision,
  exportedAt = new Date().toISOString()
}: {
  asset: CustomCharacterAsset;
  revision: CustomCharacterRevision;
  exportedAt?: string;
}): Promise<CustomCharacterPackage> {
  if (
    asset.characterAssetId !== revision.characterAssetId ||
    asset.latestRevision !== revision.revision
  ) {
    throw new Error('只能导出人物资产当前的最新 revision。');
  }
  const { checksum: _checksum, ...revisionPayload } = revision;
  const quarantinedPayload: Omit<CustomCharacterRevision, 'checksum'> = {
    ...revisionPayload,
    lifecycle: {
      generationStatus: 'ready',
      reviewStatus: 'needs_review',
      availabilityStatus: 'disabled'
    }
  };
  const quarantinedRevision: CustomCharacterRevision = {
    ...quarantinedPayload,
    checksum: await checksumRevision(quarantinedPayload)
  };
  return {
    format: CUSTOM_CHARACTER_PACKAGE_FORMAT,
    schemaVersion: CUSTOM_CHARACTER_PACKAGE_SCHEMA_VERSION,
    packageKind: 'character',
    exportedAt,
    sourceRevisionRef: createCustomContentRevisionRef(revision) as
      CustomContentRevisionRef & { assetKind: 'character' },
    asset: {
      ...asset,
      revisionCount: 1,
      projectIds: [...asset.projectIds]
    },
    revision: quarantinedRevision
  };
}

export function serializeCustomCharacterPackage(
  value: CustomCharacterPackage
): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function parseCustomCharacterPackage(
  input: string
): Promise<CustomCharacterPackage> {
  const byteLength = new TextEncoder().encode(input).byteLength;
  if (byteLength > MAX_CUSTOM_CHARACTER_PACKAGE_BYTES) {
    throw new Error('人物包超过 1 MB 限制。');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    throw new Error('人物包不是有效 JSON。');
  }
  const parsed = characterPackageSchema.parse(raw);
  if (
    parsed.asset.characterAssetId !== parsed.revision.characterAssetId ||
    parsed.asset.latestRevision !== parsed.revision.revision ||
    parsed.sourceRevisionRef.assetId !== parsed.revision.characterAssetId ||
    parsed.sourceRevisionRef.revision !== parsed.revision.revision
  ) {
    throw new Error('人物包中的资产、revision 与来源引用不一致。');
  }
  const { checksum, ...payload } = parsed.revision;
  const actualChecksum = await checksumRevision(payload);
  if (checksum !== actualChecksum) {
    throw new Error('人物包 checksum 校验失败。');
  }
  return parsed;
}

export async function importCustomCharacterPackage({
  repository,
  input,
  importedAt = new Date().toISOString()
}: {
  repository: IndexedDbCustomContentRepository;
  input: string;
  importedAt?: string;
}): Promise<'imported' | 'already_present'> {
  const packageValue = await parseCustomCharacterPackage(input);
  const existingAsset = await repository.getCharacterAsset(
    packageValue.asset.characterAssetId
  );
  if (existingAsset) {
    const existingRevision = await repository.getCharacterRevision(
      packageValue.revision.characterAssetId,
      packageValue.revision.revision
    );
    if (existingRevision?.checksum === packageValue.revision.checksum) {
      return 'already_present';
    }
    throw new Error(
      '人物包与本地相同 assetId/revision 的 checksum 冲突，未执行自动合并。'
    );
  }
  await repository.saveRevisionBundle({
    assetKind: 'character',
    asset: {
      ...packageValue.asset,
      projectIds: [...packageValue.asset.projectIds],
      updatedAt: importedAt
    },
    revision: packageValue.revision
  });
  return 'imported';
}
