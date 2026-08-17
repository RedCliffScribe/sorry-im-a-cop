import {
  avgFixedCharacterRegistryV1Schema,
  avgGenericPortraitRegistryV1Schema,
  avgResourcePackManifestV1Schema,
  avgSceneRegistryV1Schema
} from './schemas';
import { toStableIdentityKey } from './stableIdentity';
import type {
  AvgImageAssetRef,
  AvgLoadedResourcePack,
  AvgResourcePackManifestV1
} from './types';

export interface AvgResourcePackValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

export interface AvgResourcePackValidationReport {
  valid: boolean;
  issues: AvgResourcePackValidationIssue[];
  assetCount: number;
  totalByteLength: number;
}

export class AvgResourcePackValidationError extends Error {
  constructor(readonly report: AvgResourcePackValidationReport) {
    super(
      report.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('；') || 'AVG 资源包校验失败'
    );
    this.name = 'AvgResourcePackValidationError';
  }
}

function error(
  issues: AvgResourcePackValidationIssue[],
  code: string,
  path: string,
  message: string
): void {
  issues.push({ severity: 'error', code, path, message });
}

function warning(
  issues: AvgResourcePackValidationIssue[],
  code: string,
  path: string,
  message: string
): void {
  issues.push({ severity: 'warning', code, path, message });
}

function checkUnique(
  values: Array<{ value: string; path: string }>,
  code: string,
  label: string,
  issues: AvgResourcePackValidationIssue[]
): void {
  const firstPath = new Map<string, string>();
  for (const item of values) {
    const previous = firstPath.get(item.value);
    if (previous) {
      error(
        issues,
        code,
        item.path,
        `${label} 重复：${item.value}；首次出现于 ${previous}`
      );
    } else {
      firstPath.set(item.value, item.path);
    }
  }
}

function collectPortraitAssets(
  prefix: string,
  entries: Array<{ outfits: Record<string, { variants: Record<string, { image: AvgImageAssetRef }> }> }>
): Array<{ asset: AvgImageAssetRef; path: string }> {
  const result: Array<{ asset: AvgImageAssetRef; path: string }> = [];
  entries.forEach((entry, entryIndex) => {
    Object.entries(entry.outfits).forEach(([outfitId, outfit]) => {
      Object.entries(outfit.variants).forEach(([variantId, variant]) => {
        result.push({
          asset: variant.image,
          path: `${prefix}.entries.${entryIndex}.outfits.${outfitId}.variants.${variantId}.image`
        });
      });
    });
  });
  return result;
}

export function collectAvgResourcePackAssets(
  pack: AvgLoadedResourcePack
): Array<{ asset: AvgImageAssetRef; path: string }> {
  return [
    ...collectPortraitAssets('fixedCharacters', pack.fixedCharacters.entries),
    ...collectPortraitAssets('genericPortraits', pack.genericPortraits.entries),
    ...pack.scenes.entries.map((entry, index) => ({
      asset: entry.image,
      path: `scenes.entries.${index}.image`
    }))
  ];
}

export function parseAvgLoadedResourcePack(input: {
  manifest: unknown;
  fixedCharacters: unknown;
  genericPortraits: unknown;
  scenes: unknown;
}): AvgLoadedResourcePack {
  return {
    manifest: avgResourcePackManifestV1Schema.parse(input.manifest),
    fixedCharacters: avgFixedCharacterRegistryV1Schema.parse(input.fixedCharacters),
    genericPortraits: avgGenericPortraitRegistryV1Schema.parse(input.genericPortraits),
    scenes: avgSceneRegistryV1Schema.parse(input.scenes)
  };
}

export function validateAvgLoadedResourcePack(
  pack: AvgLoadedResourcePack,
  options: { requireUserAcceptedProvenance?: boolean } = {}
): AvgResourcePackValidationReport {
  const issues: AvgResourcePackValidationIssue[] = [];
  const worldpackId = pack.manifest.worldpackId;
  for (const [name, registryWorldpackId] of [
    ['fixedCharacters', pack.fixedCharacters.worldpackId],
    ['genericPortraits', pack.genericPortraits.worldpackId],
    ['scenes', pack.scenes.worldpackId]
  ] as const) {
    if (registryWorldpackId !== worldpackId) {
      error(
        issues,
        'worldpack_mismatch',
        `${name}.worldpackId`,
        `Registry worldpackId ${registryWorldpackId} 与 Manifest ${worldpackId} 不一致`
      );
    }
  }

  checkUnique(
    pack.fixedCharacters.entries.map((entry, index) => ({
      value: toStableIdentityKey(entry.stableIdentity),
      path: `fixedCharacters.entries.${index}.stableIdentity`
    })),
    'duplicate_stable_identity',
    'stable identity',
    issues
  );
  checkUnique(
    pack.fixedCharacters.entries.map((entry, index) => ({
      value: entry.portraitSetId,
      path: `fixedCharacters.entries.${index}.portraitSetId`
    })),
    'duplicate_fixed_portrait_set_id',
    '固定人物 portraitSetId',
    issues
  );
  pack.fixedCharacters.entries.forEach((entry, index) => {
    if (entry.stableIdentity.worldpackId !== worldpackId) {
      error(
        issues,
        'fixed_identity_worldpack_mismatch',
        `fixedCharacters.entries.${index}.stableIdentity.worldpackId`,
        '固定人物稳定身份不属于本资源包世界'
      );
    }
  });

  checkUnique(
    pack.genericPortraits.entries.map((entry, index) => ({
      value: entry.portraitSetId,
      path: `genericPortraits.entries.${index}.portraitSetId`
    })),
    'duplicate_generic_portrait_set_id',
    '通用人物 portraitSetId',
    issues
  );
  checkUnique(
    pack.scenes.entries.map((entry, index) => ({
      value: entry.sceneAssetId,
      path: `scenes.entries.${index}.sceneAssetId`
    })),
    'duplicate_scene_asset_id',
    'sceneAssetId',
    issues
  );
  pack.scenes.entries.forEach((entry, index) => {
    if (entry.worldpackId !== worldpackId) {
      error(
        issues,
        'scene_worldpack_mismatch',
        `scenes.entries.${index}.worldpackId`,
        '场景不属于本资源包世界'
      );
    }
  });

  const assets = collectAvgResourcePackAssets(pack);
  checkUnique(
    assets.map(({ asset, path }) => ({ value: asset.assetId, path: `${path}.assetId` })),
    'duplicate_asset_id',
    'assetId',
    issues
  );
  checkUnique(
    assets.map(({ asset, path }) => ({ value: asset.path.toLocaleLowerCase('en-US'), path: `${path}.path` })),
    'duplicate_asset_path',
    '资源路径',
    issues
  );
  if (options.requireUserAcceptedProvenance) {
    for (const { asset, path } of assets) {
      if (asset.provenance?.status !== 'user_accepted') {
        error(
          issues,
          'asset_not_user_accepted',
          `${path}.provenance.status`,
          '正式官方包只允许 user_accepted 资产'
        );
      }
    }
  } else {
    for (const { asset, path } of assets) {
      if (asset.provenance && asset.provenance.status !== 'user_accepted') {
        warning(
          issues,
          'asset_provenance_not_user_accepted',
          `${path}.provenance.status`,
          `资源声明状态为 ${asset.provenance.status}`
        );
      }
    }
  }

  const registryPaths = Object.values(pack.manifest.registries);
  if (new Set(registryPaths.map((path) => path.toLocaleLowerCase('en-US'))).size !== registryPaths.length) {
    error(issues, 'duplicate_registry_path', 'manifest.registries', '三个 Registry 必须使用不同路径');
  }

  if (pack.manifest.fallbacks?.sceneAssetId) {
    const fallbackExists = pack.scenes.entries.some(
      (entry) => entry.sceneAssetId === pack.manifest.fallbacks!.sceneAssetId
    );
    if (!fallbackExists) {
      error(
        issues,
        'missing_scene_fallback',
        'manifest.fallbacks.sceneAssetId',
        'Manifest 指定的场景回退项不存在'
      );
    }
  }

  if (pack.manifest.packType === 'extension') {
    const fixedKeys = new Set(pack.fixedCharacters.entries.map((entry) => toStableIdentityKey(entry.stableIdentity)));
    const genericIds = new Set(pack.genericPortraits.entries.map((entry) => entry.portraitSetId));
    const sceneIds = new Set(pack.scenes.entries.map((entry) => entry.sceneAssetId));
    for (const [kind, declarations, entries] of [
      ['fixedCharacters', pack.manifest.overrides?.fixedCharacters ?? [], fixedKeys],
      ['genericPortraits', pack.manifest.overrides?.genericPortraits ?? [], genericIds],
      ['scenes', pack.manifest.overrides?.scenes ?? [], sceneIds]
    ] as const) {
      for (const id of declarations) {
        if (!entries.has(id)) {
          error(
            issues,
            'orphan_override_declaration',
            `manifest.overrides.${kind}`,
            `覆盖声明没有对应 Registry entry：${id}`
          );
        }
      }
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
    assetCount: assets.length,
    totalByteLength: assets.reduce((sum, item) => sum + (item.asset.byteLength ?? 0), 0)
  };
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

export function inspectAvgImageHeader(bytes: Uint8Array): {
  mediaType: 'image/png' | 'image/webp';
  width?: number;
  height?: number;
} | undefined {
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength >= 24 && pngSignature.every((value, index) => bytes[index] === value)) {
    return {
      mediaType: 'image/png',
      width: readUint32BigEndian(bytes, 16),
      height: readUint32BigEndian(bytes, 20)
    };
  }
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  if (bytes.byteLength < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return undefined;
  const chunkType = ascii(12, 4);
  if (chunkType === 'VP8X') {
    return {
      mediaType: 'image/webp',
      width: readUint24LittleEndian(bytes, 24) + 1,
      height: readUint24LittleEndian(bytes, 27) + 1
    };
  }
  if (chunkType === 'VP8L' && bytes[20] === 0x2f) {
    return {
      mediaType: 'image/webp',
      width: 1 + (bytes[21]! | ((bytes[22]! & 0x3f) << 8)),
      height: 1 + ((bytes[22]! >> 6) | (bytes[23]! << 2) | ((bytes[24]! & 0x0f) << 10))
    };
  }
  if (chunkType === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      mediaType: 'image/webp',
      width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
      height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff
    };
  }
  return { mediaType: 'image/webp' };
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持 Web Crypto SHA-256');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function validateAvgResourcePackFiles(
  pack: AvgLoadedResourcePack,
  readFile: (path: string) => Promise<Blob | undefined>,
  options: { requireUserAcceptedProvenance?: boolean } = {}
): Promise<AvgResourcePackValidationReport> {
  const report = validateAvgLoadedResourcePack(pack, options);
  const issues = [...report.issues];
  let totalByteLength = 0;
  for (const { asset, path } of collectAvgResourcePackAssets(pack)) {
    const blob = await readFile(asset.path);
    if (!blob) {
      error(issues, 'missing_asset_file', `${path}.path`, `资源文件不存在：${asset.path}`);
      continue;
    }
    totalByteLength += blob.size;
    if (asset.byteLength !== undefined && asset.byteLength !== blob.size) {
      error(
        issues,
        'asset_size_mismatch',
        `${path}.byteLength`,
        `声明 ${asset.byteLength} 字节，实际 ${blob.size} 字节`
      );
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const header = inspectAvgImageHeader(bytes.subarray(0, Math.min(bytes.byteLength, 64)));
    if (!header) {
      error(issues, 'invalid_image_header', `${path}.path`, '不是有效的 PNG/WebP 文件');
      continue;
    }
    if (header.mediaType !== asset.mediaType) {
      error(issues, 'asset_media_type_mismatch', `${path}.mediaType`, '图片头与声明媒体类型不一致');
    }
    if (asset.width !== undefined && header.width !== undefined && asset.width !== header.width) {
      error(issues, 'asset_width_mismatch', `${path}.width`, `声明 ${asset.width}，实际 ${header.width}`);
    }
    if (asset.height !== undefined && header.height !== undefined && asset.height !== header.height) {
      error(issues, 'asset_height_mismatch', `${path}.height`, `声明 ${asset.height}，实际 ${header.height}`);
    }
    if (asset.sha256) {
      const digest = await sha256Hex(bytes.buffer);
      if (digest.toLocaleLowerCase('en-US') !== asset.sha256.toLocaleLowerCase('en-US')) {
        error(issues, 'asset_sha256_mismatch', `${path}.sha256`, `SHA-256 不匹配：${asset.path}`);
      }
    }
  }
  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
    assetCount: report.assetCount,
    totalByteLength
  };
}

export function assertValidAvgResourcePack(report: AvgResourcePackValidationReport): void {
  if (!report.valid) throw new AvgResourcePackValidationError(report);
}

export function manifestRegistryPaths(manifest: AvgResourcePackManifestV1): string[] {
  return [
    manifest.registries.fixedCharacters,
    manifest.registries.genericPortraits,
    manifest.registries.scenes
  ];
}
