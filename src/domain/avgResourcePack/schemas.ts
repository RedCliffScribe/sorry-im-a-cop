import { z } from 'zod';
import { STABLE_IDENTITY_KINDS } from './types';

const identifierSchema = z.string().trim().min(1).max(240);
const sha256Schema = z.string().trim().regex(/^[a-f0-9]{64}$/iu, '必须是 64 位 SHA-256');

export function isSafePackRelativePath(path: string): boolean {
  if (
    !path ||
    path.length > 240 ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.startsWith('/') ||
    /^[a-zA-Z]:/u.test(path)
  ) {
    return false;
  }
  return path.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

export const packRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine(isSafePackRelativePath, '必须是安全的资源包相对路径');

export const stableIdentityRefSchema = z
  .object({
    worldpackId: identifierSchema,
    kind: z.enum(STABLE_IDENTITY_KINDS),
    canonicalId: identifierSchema
  })
  .strict();

export const avgAssetProvenanceSchema = z
  .object({
    status: z.enum(['generated', 'technical_pass', 'qa_candidate', 'user_accepted']),
    sourceRecordId: identifierSchema.optional(),
    userAcceptanceEvidence: z.string().trim().min(1).optional(),
    acceptanceMode: z.enum(['explicit_version', 'default_scope_acceptance']).optional()
  })
  .strict();

export const avgImageAssetRefSchema = z
  .object({
    assetId: identifierSchema,
    path: packRelativePathSchema,
    mediaType: z.enum(['image/png', 'image/webp']),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    byteLength: z.number().int().nonnegative().optional(),
    sha256: sha256Schema.optional(),
    provenance: avgAssetProvenanceSchema.optional()
  })
  .strict()
  .superRefine((asset, context) => {
    const expectedExtension = asset.mediaType === 'image/png' ? '.png' : '.webp';
    if (!asset.path.toLocaleLowerCase('en-US').endsWith(expectedExtension)) {
      context.addIssue({
        code: 'custom',
        path: ['path'],
        message: `路径扩展名必须与 ${asset.mediaType} 一致`
      });
    }
  });

export const avgPortraitVariantEntrySchema = z
  .object({
    variantId: identifierSchema,
    emotionId: identifierSchema,
    image: avgImageAssetRefSchema
  })
  .strict();

export const avgPortraitOutfitEntrySchema = z
  .object({
    outfitId: identifierSchema,
    defaultVariantId: identifierSchema,
    variants: z.record(identifierSchema, avgPortraitVariantEntrySchema)
  })
  .strict()
  .superRefine((outfit, context) => {
    const variants = Object.entries(outfit.variants);
    if (variants.length === 0) {
      context.addIssue({ code: 'custom', path: ['variants'], message: '至少需要一个表现变体' });
    }
    if (!outfit.variants[outfit.defaultVariantId]) {
      context.addIssue({
        code: 'custom',
        path: ['defaultVariantId'],
        message: '默认表现变体不存在'
      });
    }
    for (const [variantId, variant] of variants) {
      if (variant.variantId !== variantId) {
        context.addIssue({
          code: 'custom',
          path: ['variants', variantId, 'variantId'],
          message: 'variantId 必须与 Registry key 一致'
        });
      }
    }
  });

function validateOutfits(
  entry: { defaultOutfitId: string; outfits: Record<string, z.infer<typeof avgPortraitOutfitEntrySchema>> },
  context: z.RefinementCtx
): void {
  if (!entry.outfits[entry.defaultOutfitId]) {
    context.addIssue({
      code: 'custom',
      path: ['defaultOutfitId'],
      message: '默认服装不存在'
    });
  }
  for (const [outfitId, outfit] of Object.entries(entry.outfits)) {
    if (outfit.outfitId !== outfitId) {
      context.addIssue({
        code: 'custom',
        path: ['outfits', outfitId, 'outfitId'],
        message: 'outfitId 必须与 Registry key 一致'
      });
    }
  }
}

export const fixedCharacterPortraitEntrySchema = z
  .object({
    stableIdentity: stableIdentityRefSchema,
    portraitSetId: identifierSchema,
    displayName: z.string().trim().min(1).optional(),
    defaultOutfitId: identifierSchema,
    outfits: z.record(identifierSchema, avgPortraitOutfitEntrySchema)
  })
  .strict()
  .superRefine(validateOutfits);

export const genericPortraitProfileSchema = z
  .object({
    gender: identifierSchema.optional(),
    visualAgeBand: identifierSchema.optional(),
    roleFamily: identifierSchema,
    roleSubtype: identifierSchema.optional(),
    roleTier: identifierSchema.optional(),
    outfitMode: identifierSchema.optional(),
    bodyBuild: identifierSchema.optional(),
    demeanor: z.array(identifierSchema).optional(),
    stableFeatureTags: z.array(identifierSchema).optional()
  })
  .strict();

export const genericPortraitSetEntrySchema = z
  .object({
    portraitSetId: identifierSchema,
    displayName: z.string().trim().min(1).optional(),
    profile: genericPortraitProfileSchema,
    defaultOutfitId: identifierSchema,
    outfits: z.record(identifierSchema, avgPortraitOutfitEntrySchema),
    reusePolicy: z.enum(['unique_per_save', 'limited_reuse', 'background_reusable']),
    priority: z.number().int().optional()
  })
  .strict()
  .superRefine(validateOutfits);

export const avgSceneAssetEntrySchema = z
  .object({
    sceneAssetId: identifierSchema,
    worldpackId: identifierSchema,
    displayName: z.string().trim().min(1).optional(),
    runtimeSceneIds: z.array(identifierSchema).optional(),
    runtimePlaceIds: z.array(identifierSchema).optional(),
    tags: z.array(identifierSchema),
    image: avgImageAssetRefSchema,
    priority: z.number().int().optional(),
    reusePolicy: z.enum(['specific', 'generic']).optional()
  })
  .strict();

export const avgFixedCharacterRegistryV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    worldpackId: identifierSchema,
    entries: z.array(fixedCharacterPortraitEntrySchema)
  })
  .strict();

export const avgGenericPortraitRegistryV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    worldpackId: identifierSchema,
    entries: z.array(genericPortraitSetEntrySchema)
  })
  .strict();

export const avgSceneRegistryV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    worldpackId: identifierSchema,
    entries: z.array(avgSceneAssetEntrySchema)
  })
  .strict();

export const avgResourcePackManifestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    packId: identifierSchema,
    worldpackId: identifierSchema,
    version: identifierSchema,
    displayName: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    styleId: identifierSchema.optional(),
    packType: z.enum(['base', 'extension']),
    targetBasePackId: identifierSchema.optional(),
    loadOrder: z.number().int().optional(),
    compatibleGameVersion: z
      .object({
        min: identifierSchema.optional(),
        max: identifierSchema.optional()
      })
      .strict()
      .optional(),
    registries: z
      .object({
        fixedCharacters: packRelativePathSchema,
        genericPortraits: packRelativePathSchema,
        scenes: packRelativePathSchema
      })
      .strict(),
    assetRoot: packRelativePathSchema.optional(),
    overrides: z
      .object({
        fixedCharacters: z.array(identifierSchema).optional(),
        genericPortraits: z.array(identifierSchema).optional(),
        scenes: z.array(identifierSchema).optional()
      })
      .strict()
      .optional(),
    fallbacks: z
      .object({
        sceneAssetId: identifierSchema.optional()
      })
      .strict()
      .optional()
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.packType === 'base' && manifest.targetBasePackId) {
      context.addIssue({
        code: 'custom',
        path: ['targetBasePackId'],
        message: 'Base Pack 不得声明 targetBasePackId'
      });
    }
    if (manifest.packType === 'base' && manifest.overrides) {
      context.addIssue({
        code: 'custom',
        path: ['overrides'],
        message: 'Base Pack 不得声明扩展覆盖项'
      });
    }
  });

export type ParsedAvgResourcePackManifestV1 = z.infer<
  typeof avgResourcePackManifestV1Schema
>;
