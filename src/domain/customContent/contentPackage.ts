import { strToU8, zip } from 'fflate';
import { z } from 'zod';
import {
  IMPORTED_CUSTOM_ASSET_LIFECYCLE,
  createCustomContentRevisionRef,
  customContentRevisionIdentityKey,
  customContentRevisionRefKey
} from './assetFoundation';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision,
  CustomContentDependency,
  CustomContentProcessingTask,
  CustomContentProcessingUnit,
  CustomContentProjectAsset,
  CustomContentProjectRevision,
  CustomContentRevisionRef,
  CustomEventGroupAsset,
  CustomEventGroupRevision,
  CustomLocalExtractionResult,
  CustomSourceAggregationResult,
  CustomSourceCarryLedgerEntry,
  CustomSourceDocument,
  CustomSourceSpan,
  CustomSourceStructure
} from './assetTypes';
import { createCustomContentChecksum } from './checksum';
import {
  customContentPackageManifestSchema,
  customContentProcessingTaskSchema,
  customContentProcessingUnitSchema,
  customContentRevisionBundleSchema,
  customEventGroupJsonPackageSchema,
  customSourceDocumentSchema
} from './contentPackageSchemas';
import {
  customLocalExtractionResultSchema,
  parseCustomLocalExtractionResult
} from './sourceExtractionSchemas';
import {
  customSourceAggregationResultSchema,
  customSourceCarryLedgerEntrySchema,
  parseCustomSourceAggregationResult,
  parseCustomSourceCarryLedgerEntry
} from './sourceAggregationSchemas';
import {
  customSourceStructureSchema,
  parseCustomSourceStructure
} from './sourceStructureSchemas';
import {
  parseCustomSourceProjectDraftResult,
  type CustomSourceProjectDraftResult
} from './sourceProjectBuildSchemas';
import {
  assessCustomContentDependencyGraph,
  createCustomContentDependencyId
} from './dependencyGraph';
import type {
  IndexedDbCustomContentRepository,
  SaveCustomContentRevisionBundle
} from './IndexedDbCustomContentRepository';
import {
  assertSafeZipEntryPath,
  readZipSafely as readZipWithSafetyLimits
} from './safeZip';

export const CUSTOM_CONTENT_PACKAGE_FORMAT =
  'sorry-im-a-cop-v2-custom-content';
export const CUSTOM_CONTENT_PACKAGE_SCHEMA_VERSION = 1;

export const customContentPackageLimits = Object.freeze({
  maxArchiveBytes: 20 * 1024 * 1024,
  maxEntryCount: 256,
  maxEntryBytes: 16 * 1024 * 1024,
  maxJsonEntryBytes: 2 * 1024 * 1024,
  maxManifestBytes: 1024 * 1024,
  maxExpandedBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 100
});

export type CustomContentPackageManifest = z.infer<
  typeof customContentPackageManifestSchema
>;
export type CustomContentPackageRevisionBundle = z.infer<
  typeof customContentRevisionBundleSchema
>;
export type CustomEventGroupJsonPackage = z.infer<
  typeof customEventGroupJsonPackageSchema
>;

export interface ParsedCustomContentPackage {
  manifest: Omit<CustomContentPackageManifest, 'entries'> & {
    entries?: CustomContentPackageManifest['entries'];
  };
  bundles: CustomContentPackageRevisionBundle[];
  sourceDocuments: Array<{
    document: CustomSourceDocument;
    bytes: Uint8Array;
  }>;
  sourceStructures: CustomSourceStructure[];
  processingTasks: CustomContentProcessingTask[];
  processingUnits: CustomContentProcessingUnit[];
  extractionResults: CustomLocalExtractionResult[];
  carryLedgerEntries: CustomSourceCarryLedgerEntry[];
  aggregationResults: CustomSourceAggregationResult[];
  projectDraftResults: CustomSourceProjectDraftResult[];
}

export type CustomContentImportConflictKind =
  | 'exact_local'
  | 'exact_imported'
  | 'new_asset'
  | 'new_revision'
  | 'lineage_conflict'
  | 'name_collision';

export interface CustomContentImportConflict {
  kind: CustomContentImportConflictKind;
  assetKind: CustomContentRevisionRef['assetKind'];
  assetId: string;
  revision: number;
  message: string;
}

export interface CustomContentImportInspection {
  requiresRemap: boolean;
  conflicts: CustomContentImportConflict[];
  warnings: string[];
}

export interface CustomContentImportResult {
  importedRevisionCount: number;
  skippedRevisionCount: number;
  remapped: boolean;
  assetIdMap: Record<string, string>;
  sourceDocumentIdMap: Record<string, string>;
  warnings: string[];
}

interface CollectedBundle {
  assetKind: CustomContentPackageRevisionBundle['assetKind'];
  sourceRevisionRef: CustomContentRevisionRef;
  asset:
    | CustomContentProjectAsset
    | CustomCharacterAsset
    | CustomEventGroupAsset;
  revision:
    | CustomContentProjectRevision
    | CustomCharacterRevision
    | CustomEventGroupRevision;
  dependencies: CustomContentDependency[];
}

interface ExportOptions {
  repository: IndexedDbCustomContentRepository;
  rootRevisionRef: CustomContentRevisionRef;
  packageKind?: 'character' | 'event_group' | 'project';
  packageId?: string;
  exportedAt?: string;
}

interface AuthorBackupOptions {
  repository: IndexedDbCustomContentRepository;
  projectRevisionRef: CustomContentRevisionRef;
  includeSourceText: true;
  packageId?: string;
  exportedAt?: string;
}

const jsonMediaType = 'application/json';
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function cloneLifecycle() {
  return { ...IMPORTED_CUSTOM_ASSET_LIFECYCLE };
}

function createPackageId(): string {
  return `package-${globalThis.crypto.randomUUID()}`;
}

function createRemappedId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replaceAll('%', '_');
}

function bundlePath(bundle: CollectedBundle): string {
  return `assets/${bundle.assetKind}/${encodePathSegment(
    bundle.sourceRevisionRef.assetId
  )}/${bundle.sourceRevisionRef.revision}.json`;
}

function assertSafeArchivePath(path: string): void {
  assertSafeZipEntryPath(path, '内容包');
}

async function checksumBytes(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(bytes).buffer
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

async function withFreshChecksum<T extends { checksum: string }>(
  revision: T
): Promise<T> {
  const { checksum: _checksum, ...payload } = revision;
  return {
    ...revision,
    checksum: await createCustomContentChecksum(payload)
  };
}

function mapSourceSpan(
  span: CustomSourceSpan,
  sourceDocumentIdMap: ReadonlyMap<string, string>,
  identityMap: ReadonlyMap<string, string> = new Map()
): CustomSourceSpan {
  return {
    ...span,
    sourceDocumentId:
      sourceDocumentIdMap.get(span.sourceDocumentId) ?? span.sourceDocumentId,
    chapterId: span.chapterId
      ? identityMap.get(span.chapterId) ?? span.chapterId
      : undefined
  };
}

function mapRevisionRef(
  ref: CustomContentRevisionRef,
  revisionRefMap: ReadonlyMap<string, CustomContentRevisionRef>
): CustomContentRevisionRef {
  const mapped = revisionRefMap.get(customContentRevisionRefKey(ref));
  if (!mapped) {
    throw new Error(
      `内容包内部引用未纳入依赖闭包：${customContentRevisionRefKey(ref)}`
    );
  }
  return mapped;
}

function validateBundleIdentities(
  bundles: readonly CustomContentPackageRevisionBundle[]
): void {
  const sourceKeys = new Set<string>();
  const packageRefs: CustomContentRevisionRef[] = [];
  const dependencies: CustomContentDependency[] = [];
  for (const bundle of bundles) {
    const packageRef = createCustomContentRevisionRef(bundle.revision);
    if (
      bundle.sourceRevisionRef.assetKind !== bundle.assetKind ||
      packageRef.assetKind !== bundle.assetKind ||
      bundle.sourceRevisionRef.assetId !== packageRef.assetId ||
      bundle.sourceRevisionRef.revision !== packageRef.revision
    ) {
      throw new Error('内容包 revision bundle 的资产身份不一致。');
    }
    const sourceKey = customContentRevisionRefKey(bundle.sourceRevisionRef);
    if (sourceKeys.has(sourceKey)) {
      throw new Error(`内容包包含重复 revision：${sourceKey}`);
    }
    sourceKeys.add(sourceKey);
    packageRefs.push(packageRef);
    dependencies.push(...bundle.dependencies);
  }
  const assessment = assessCustomContentDependencyGraph({
    availableRevisions: packageRefs,
    dependencies
  });
  if (!assessment.valid) {
    throw new Error(
      `内容包依赖图无效：${assessment.diagnostics
        .map((item) => item.message)
        .join('；')}`
    );
  }
}

async function loadCollectedBundle(
  repository: IndexedDbCustomContentRepository,
  ref: CustomContentRevisionRef
): Promise<CollectedBundle> {
  if (ref.assetKind === 'character') {
    const [asset, revision, dependencies] = await Promise.all([
      repository.getCharacterAsset(ref.assetId),
      repository.getCharacterRevision(ref.assetId, ref.revision),
      repository.listDependenciesForOwner(ref)
    ]);
    if (!asset || !revision) throw new Error('找不到待导出的自定义人物 revision。');
    const actualRef = createCustomContentRevisionRef(revision);
    if (customContentRevisionRefKey(actualRef) !== customContentRevisionRefKey(ref)) {
      throw new Error('待导出人物 revision 的 checksum 与引用不一致。');
    }
    return {
      assetKind: 'character',
      sourceRevisionRef: actualRef,
      asset,
      revision,
      dependencies
    };
  }
  if (ref.assetKind === 'event_group') {
    const [asset, revision, dependencies] = await Promise.all([
      repository.getEventGroupAsset(ref.assetId),
      repository.getEventGroupRevision(ref.assetId, ref.revision),
      repository.listDependenciesForOwner(ref)
    ]);
    if (!asset || !revision) throw new Error('找不到待导出的事件组 revision。');
    const actualRef = createCustomContentRevisionRef(revision);
    if (customContentRevisionRefKey(actualRef) !== customContentRevisionRefKey(ref)) {
      throw new Error('待导出事件组 revision 的 checksum 与引用不一致。');
    }
    return {
      assetKind: 'event_group',
      sourceRevisionRef: actualRef,
      asset,
      revision,
      dependencies
    };
  }
  const [asset, revision, dependencies] = await Promise.all([
    repository.getProjectAsset(ref.assetId),
    repository.getProjectRevision(ref.assetId, ref.revision),
    repository.listDependenciesForOwner(ref)
  ]);
  if (!asset || !revision) throw new Error('找不到待导出的内容项目 revision。');
  const actualRef = createCustomContentRevisionRef(revision);
  if (customContentRevisionRefKey(actualRef) !== customContentRevisionRefKey(ref)) {
    throw new Error('待导出内容项目 revision 的 checksum 与引用不一致。');
  }
  return {
    assetKind: 'content_project',
    sourceRevisionRef: actualRef,
    asset,
    revision,
    dependencies
  };
}

async function collectDependencyClosure(
  repository: IndexedDbCustomContentRepository,
  rootRevisionRef: CustomContentRevisionRef
): Promise<CollectedBundle[]> {
  const bundles = new Map<string, CollectedBundle>();
  const queue = [rootRevisionRef];
  while (queue.length > 0) {
    const ref = queue.shift();
    if (!ref) break;
    const key = customContentRevisionRefKey(ref);
    if (bundles.has(key)) continue;
    const bundle = await loadCollectedBundle(repository, ref);
    bundles.set(key, bundle);
    for (const dependency of bundle.dependencies) queue.push(dependency.target);
  }
  return [...bundles.values()];
}

async function collectExportBundles(
  repository: IndexedDbCustomContentRepository,
  rootRevisionRef: CustomContentRevisionRef
): Promise<CollectedBundle[]> {
  const closure = await collectDependencyClosure(repository, rootRevisionRef);
  if (rootRevisionRef.assetKind !== 'event_group') return closure;

  const eventBundle = closure.find(
    (bundle) =>
      customContentRevisionRefKey(bundle.sourceRevisionRef) ===
      customContentRevisionRefKey(rootRevisionRef)
  );
  if (!eventBundle || eventBundle.assetKind !== 'event_group') {
    throw new Error('事件组内容包缺少根事件。');
  }
  const eventRevision = eventBundle.revision as CustomEventGroupRevision;
  const projectAsset = await repository.getProjectAsset(eventRevision.projectId);
  if (!projectAsset) throw new Error('事件组所属轻量项目不存在。');
  const projectRevision = await repository.getProjectRevision(
    projectAsset.projectId,
    projectAsset.latestRevision
  );
  if (!projectRevision) throw new Error('事件组所属轻量项目 revision 不存在。');
  const projectRef = createCustomContentRevisionRef(projectRevision);
  const characterBundles = closure.filter(
    (bundle) => bundle.assetKind === 'character'
  );
  const projectTargets = [
    eventBundle.sourceRevisionRef,
    ...characterBundles.map((bundle) => bundle.sourceRevisionRef)
  ];
  const lightweightRevision: CustomContentProjectRevision = {
    ...projectRevision,
    characterAssetIds: characterBundles.map(
      (bundle) => bundle.sourceRevisionRef.assetId
    ),
    eventGroupIds: [eventRevision.eventGroupId]
  };
  const lightweightProject: CollectedBundle = {
    assetKind: 'content_project',
    sourceRevisionRef: projectRef,
    asset: projectAsset,
    revision: lightweightRevision,
    dependencies: projectTargets.map((target) => ({
      dependencyId: createCustomContentDependencyId(
        projectRef,
        target,
        'required'
      ),
      owner: projectRef,
      target,
      kind: 'required'
    }))
  };
  return [...closure, lightweightProject];
}

async function quarantineExportBundles(
  collected: readonly CollectedBundle[]
): Promise<CustomContentPackageRevisionBundle[]> {
  const refMap = new Map<string, CustomContentRevisionRef>();
  const result: CustomContentPackageRevisionBundle[] = [];
  const ordered = [...collected].sort((left, right) => {
    const order = { character: 0, event_group: 1, content_project: 2 };
    return order[left.assetKind] - order[right.assetKind];
  });

  for (const bundle of ordered) {
    if (bundle.assetKind === 'character') {
      const source = bundle.revision as CustomCharacterRevision;
      const revision = await withFreshChecksum({
        ...source,
        sourceSpans: source.sourceSpans.map((span) => ({ ...span })),
        lifecycle: cloneLifecycle()
      });
      const packageRef = createCustomContentRevisionRef(revision);
      refMap.set(customContentRevisionRefKey(bundle.sourceRevisionRef), packageRef);
      result.push({
        assetKind: 'character',
        sourceRevisionRef: bundle.sourceRevisionRef,
        asset: {
          ...(bundle.asset as CustomCharacterAsset),
          latestRevision: revision.revision
        },
        revision,
        dependencies: []
      });
      continue;
    }
    if (bundle.assetKind === 'event_group') {
      const source = bundle.revision as CustomEventGroupRevision;
      const revision = await withFreshChecksum({
        ...source,
        characterRefs: source.characterRefs.map((ref) =>
          mapRevisionRef(ref, refMap)
        ),
        roleSlots: source.roleSlots.map((slot) => ({
          ...slot,
          fixedCharacterRef: slot.fixedCharacterRef
            ? mapRevisionRef(slot.fixedCharacterRef, refMap)
            : undefined
        })),
        stages: source.stages.map((stage) => ({
          ...stage,
          establishedSourceFacts: stage.establishedSourceFacts.map((fact) => ({
            ...fact,
            sourceSpans: fact.sourceSpans.map((span) => ({ ...span }))
          })),
          continuationSourceFacts: stage.continuationSourceFacts.map((fact) => ({
            ...fact,
            sourceSpans: fact.sourceSpans.map((span) => ({ ...span }))
          })),
          hardSourceConstraints: stage.hardSourceConstraints.map((fact) => ({
            ...fact,
            sourceSpans: fact.sourceSpans.map((span) => ({ ...span }))
          })),
          eventNodes: stage.eventNodes.map((node) => ({
            ...node,
            characterUsages: node.characterUsages.map((usage) => ({
              ...usage,
              characterRef: usage.characterRef
                ? mapRevisionRef(usage.characterRef, refMap)
                : undefined
            }))
          }))
        })),
        sourceSpans: source.sourceSpans.map((span) => ({ ...span })),
        lifecycle: cloneLifecycle()
      });
      const packageRef = createCustomContentRevisionRef(revision);
      refMap.set(customContentRevisionRefKey(bundle.sourceRevisionRef), packageRef);
      result.push({
        assetKind: 'event_group',
        sourceRevisionRef: bundle.sourceRevisionRef,
        asset: {
          ...(bundle.asset as CustomEventGroupAsset),
          latestRevision: revision.revision
        },
        revision,
        dependencies: []
      });
      continue;
    }
    const source = bundle.revision as CustomContentProjectRevision;
    const revision = await withFreshChecksum({
      ...source,
      lifecycle: cloneLifecycle()
    });
    const packageRef = createCustomContentRevisionRef(revision);
    refMap.set(customContentRevisionRefKey(bundle.sourceRevisionRef), packageRef);
    result.push({
      assetKind: 'content_project',
      sourceRevisionRef: bundle.sourceRevisionRef,
      asset: {
        ...(bundle.asset as CustomContentProjectAsset),
        latestRevision: revision.revision
      },
      revision,
      dependencies: []
    });
  }

  const collectedBySource = new Map(
    collected.map((bundle) => [
      customContentRevisionRefKey(bundle.sourceRevisionRef),
      bundle
    ])
  );
  return result.map((bundle) => {
    const source = collectedBySource.get(
      customContentRevisionRefKey(bundle.sourceRevisionRef)
    );
    if (!source) throw new Error('内容包导出阶段丢失源 revision。');
    const owner = createCustomContentRevisionRef(bundle.revision);
    return {
      ...bundle,
      dependencies: source.dependencies.map((dependency) => {
        const target = mapRevisionRef(dependency.target, refMap);
        return {
          dependencyId: createCustomContentDependencyId(
            owner,
            target,
            dependency.kind
          ),
          owner,
          target,
          kind: dependency.kind
        };
      })
    } as CustomContentPackageRevisionBundle;
  });
}

function inferPackageKind(
  ref: CustomContentRevisionRef
): 'character' | 'event_group' | 'project' {
  if (ref.assetKind === 'character') return 'character';
  if (ref.assetKind === 'event_group') return 'event_group';
  return 'project';
}

async function prepareSharePackage(options: ExportOptions): Promise<{
  manifestBase: Omit<CustomContentPackageManifest, 'entries'>;
  bundles: CustomContentPackageRevisionBundle[];
}> {
  const packageKind =
    options.packageKind ?? inferPackageKind(options.rootRevisionRef);
  if (packageKind !== inferPackageKind(options.rootRevisionRef)) {
    throw new Error('内容包类型与根 revision 类型不一致。');
  }
  const collected = await collectExportBundles(
    options.repository,
    options.rootRevisionRef
  );
  const bundles = await quarantineExportBundles(collected);
  validateBundleIdentities(bundles);
  const rootKey = customContentRevisionRefKey(options.rootRevisionRef);
  const sourceRefs = bundles.map((bundle) => bundle.sourceRevisionRef);
  if (!sourceRefs.some((ref) => customContentRevisionRefKey(ref) === rootKey)) {
    throw new Error('内容包依赖闭包不包含根 revision。');
  }
  return {
    manifestBase: {
      format: CUSTOM_CONTENT_PACKAGE_FORMAT,
      schemaVersion: CUSTOM_CONTENT_PACKAGE_SCHEMA_VERSION,
      packageKind,
      packageId: options.packageId ?? createPackageId(),
      exportedAt: options.exportedAt ?? new Date().toISOString(),
      rootRevisionRefs: [options.rootRevisionRef],
      dependencies: sourceRefs.filter(
        (ref) => customContentRevisionRefKey(ref) !== rootKey
      ),
      includesSourceText: false
    },
    bundles
  };
}

function createZip(
  files: Record<string, Uint8Array>
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, bytes) => {
      if (error) reject(error);
      else resolve(bytes);
    });
  });
}

async function serializeZipPackage(
  manifestBase: Omit<CustomContentPackageManifest, 'entries'>,
  bundles: readonly CustomContentPackageRevisionBundle[],
  extras: Array<{
    path: string;
    entryKind: CustomContentPackageManifest['entries'][number]['entryKind'];
    mediaType: string;
    bytes: Uint8Array;
    sourceDocumentId?: string;
    sourceStructureId?: string;
    taskId?: string;
    unitId?: string;
  }> = []
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const entries: CustomContentPackageManifest['entries'] = [];
  for (const bundle of bundles) {
    const collected = bundle as unknown as CollectedBundle;
    const path = bundlePath(collected);
    if (files[path]) throw new Error(`内容包路径重复：${path}`);
    const bytes = strToU8(JSON.stringify(bundle));
    files[path] = bytes;
    entries.push({
      path,
      entryKind: 'revision_bundle',
      mediaType: jsonMediaType,
      checksum: await checksumBytes(bytes),
      byteLength: bytes.byteLength,
      assetKind: bundle.assetKind,
      assetId: bundle.sourceRevisionRef.assetId,
      revision: bundle.sourceRevisionRef.revision
    });
  }
  for (const extra of extras) {
    assertSafeArchivePath(extra.path);
    if (files[extra.path]) throw new Error(`内容包路径重复：${extra.path}`);
    files[extra.path] = extra.bytes;
    entries.push({
      path: extra.path,
      entryKind: extra.entryKind,
      mediaType: extra.mediaType,
      checksum: await checksumBytes(extra.bytes),
      byteLength: extra.bytes.byteLength,
      sourceDocumentId: extra.sourceDocumentId,
      sourceStructureId: extra.sourceStructureId,
      taskId: extra.taskId,
      unitId: extra.unitId
    });
  }
  const manifest = customContentPackageManifestSchema.parse({
    ...manifestBase,
    entries
  });
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  return createZip(files);
}

export async function createCustomContentSharePackage(
  options: ExportOptions
): Promise<Uint8Array> {
  const prepared = await prepareSharePackage(options);
  return serializeZipPackage(prepared.manifestBase, prepared.bundles);
}

export async function createCustomEventGroupJsonPackage(
  options: Omit<ExportOptions, 'packageKind'>
): Promise<CustomEventGroupJsonPackage> {
  if (options.rootRevisionRef.assetKind !== 'event_group') {
    throw new Error('单事件 JSON 的根 revision 必须是事件组。');
  }
  const prepared = await prepareSharePackage({
    ...options,
    packageKind: 'event_group'
  });
  return customEventGroupJsonPackageSchema.parse({
    ...prepared.manifestBase,
    packageKind: 'event_group',
    bundles: prepared.bundles
  });
}

export function serializeCustomEventGroupJsonPackage(
  value: CustomEventGroupJsonPackage
): string {
  return JSON.stringify(customEventGroupJsonPackageSchema.parse(value), null, 2);
}

function sourceDocumentIdsForBundles(
  bundles: readonly CustomContentPackageRevisionBundle[]
): Set<string> {
  const result = new Set<string>();
  const includeSpans = (spans: readonly CustomSourceSpan[]) => {
    for (const span of spans) result.add(span.sourceDocumentId);
  };
  for (const bundle of bundles) {
    if (bundle.assetKind === 'content_project') {
      for (const id of bundle.revision.sourceDocumentIds) result.add(id);
    } else if (bundle.assetKind === 'character') {
      includeSpans(bundle.revision.sourceSpans);
    } else {
      includeSpans(bundle.revision.sourceSpans);
      for (const stage of bundle.revision.stages) {
        for (const fact of [
          ...stage.establishedSourceFacts,
          ...stage.continuationSourceFacts,
          ...stage.hardSourceConstraints
        ]) {
          includeSpans(fact.sourceSpans);
        }
      }
    }
  }
  return result;
}

export async function createCustomContentAuthorBackup(
  options: AuthorBackupOptions
): Promise<Uint8Array> {
  if (
    !options.includeSourceText ||
    options.projectRevisionRef.assetKind !== 'content_project'
  ) {
    throw new Error('作者备份必须由用户明确选择包含项目原文。');
  }
  const prepared = await prepareSharePackage({
    repository: options.repository,
    rootRevisionRef: options.projectRevisionRef,
    packageKind: 'project',
    packageId: options.packageId,
    exportedAt: options.exportedAt
  });
  const projectBundle = prepared.bundles.find(
    (bundle) =>
      bundle.assetKind === 'content_project' &&
      bundle.sourceRevisionRef.assetId === options.projectRevisionRef.assetId
  );
  if (!projectBundle || projectBundle.assetKind !== 'content_project') {
    throw new Error('作者备份缺少根项目 revision。');
  }

  const extras: Parameters<typeof serializeZipPackage>[2] = [];
  const sourceIds = sourceDocumentIdsForBundles(prepared.bundles);
  for (const sourceDocumentId of sourceIds) {
    const source = await options.repository.loadSourceDocument(sourceDocumentId);
    if (!source) {
      throw new Error(`作者备份缺少原文：${sourceDocumentId}`);
    }
    const metadata = customSourceDocumentSchema.parse(source.document);
    const sourceBytes = new Uint8Array(await source.blob.arrayBuffer());
    if (await checksumBytes(sourceBytes) !== metadata.checksum) {
      throw new Error(`作者原文 checksum 不一致：${sourceDocumentId}`);
    }
    const base = `source/${encodePathSegment(sourceDocumentId)}`;
    extras.push({
      path: `${base}/document.json`,
      entryKind: 'source_document',
      mediaType: jsonMediaType,
      bytes: strToU8(JSON.stringify(metadata)),
      sourceDocumentId
    });
    extras.push({
      path: `${base}/original.bin`,
      entryKind: 'source_blob',
      mediaType: metadata.mediaType,
      bytes: sourceBytes,
      sourceDocumentId
    });
    for (const structure of await options.repository.listSourceStructures(
      sourceDocumentId
    )) {
      const parsed = customSourceStructureSchema.parse(structure);
      extras.push({
        path: `${base}/structures/${encodePathSegment(
          parsed.sourceStructureId
        )}.json`,
        entryKind: 'source_structure',
        mediaType: jsonMediaType,
        bytes: strToU8(JSON.stringify(parsed)),
        sourceDocumentId,
        sourceStructureId: parsed.sourceStructureId
      });
    }
  }

  const tasks = (await options.repository.listProcessingTasks()).filter(
    (task) =>
      task.projectId === options.projectRevisionRef.assetId ||
      (task.sourceDocumentId && sourceIds.has(task.sourceDocumentId))
  );
  for (const task of tasks) {
    customContentProcessingTaskSchema.parse(task);
    extras.push({
      path: `tasks/${encodePathSegment(task.taskId)}.json`,
      entryKind: 'processing_task',
      mediaType: jsonMediaType,
      bytes: strToU8(JSON.stringify(task)),
      taskId: task.taskId
    });
    const units = (
      await options.repository.listProcessingUnits(task.taskId)
    ).map((unit) => customContentProcessingUnitSchema.parse(unit));
    if (units.length > 0) {
      extras.push({
        path: `tasks/${encodePathSegment(task.taskId)}/units.json`,
        entryKind: 'processing_units',
        mediaType: jsonMediaType,
        bytes: strToU8(JSON.stringify(units)),
        taskId: task.taskId
      });
    }
    const extractionResults =
      await options.repository.listExtractionResultsForTask(task.taskId);
    if (extractionResults.length > 0) {
      extractionResults.forEach((result) =>
        customLocalExtractionResultSchema.parse(result)
      );
      extras.push({
        path: `tasks/${encodePathSegment(task.taskId)}/extraction-results.json`,
        entryKind: 'extraction_results',
        mediaType: jsonMediaType,
        bytes: strToU8(JSON.stringify(extractionResults)),
        taskId: task.taskId
      });
    }
    const carryLedgerEntries =
      await options.repository.listCarryLedgerEntriesForTask(task.taskId);
    if (carryLedgerEntries.length > 0) {
      carryLedgerEntries.forEach((entry) =>
        customSourceCarryLedgerEntrySchema.parse(entry)
      );
      extras.push({
        path: `tasks/${encodePathSegment(task.taskId)}/carry-ledger.json`,
        entryKind: 'carry_ledger_entries',
        mediaType: jsonMediaType,
        bytes: strToU8(JSON.stringify(carryLedgerEntries)),
        taskId: task.taskId
      });
    }
    const aggregationResults =
      await options.repository.listAggregationResultsForTask(task.taskId);
    if (aggregationResults.length > 0) {
      aggregationResults.forEach((result) =>
        customSourceAggregationResultSchema.parse(result)
      );
      extras.push({
        path: `tasks/${encodePathSegment(task.taskId)}/aggregation-results.json`,
        entryKind: 'aggregation_results',
        mediaType: jsonMediaType,
        bytes: strToU8(JSON.stringify(aggregationResults)),
        taskId: task.taskId
      });
    }
    const projectDraftResult =
      await options.repository.loadProjectDraftResultForTask(task.taskId);
    if (projectDraftResult) {
      const parsed = parseCustomSourceProjectDraftResult(projectDraftResult);
      extras.push({
        path: `tasks/${encodePathSegment(task.taskId)}/project-draft-result.json`,
        entryKind: 'project_draft_result',
        mediaType: jsonMediaType,
        bytes: strToU8(JSON.stringify(parsed)),
        taskId: task.taskId
      });
    }
  }

  return serializeZipPackage(
    {
      ...prepared.manifestBase,
      packageKind: 'author_backup',
      includesSourceText: true
    },
    prepared.bundles,
    extras
  );
}

function readZipSafely(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  return readZipWithSafetyLimits(bytes, {
    archiveLabel: '内容包',
    limits: customContentPackageLimits,
    allowNestedArchive: (path) => {
      const lower = path.toLowerCase();
      return lower.startsWith('source/') && lower.endsWith('/original.bin');
    }
  });
}

function parseJsonBytes(path: string, bytes: Uint8Array): unknown {
  const limit =
    path === 'manifest.json'
      ? customContentPackageLimits.maxManifestBytes
      : customContentPackageLimits.maxJsonEntryBytes;
  if (bytes.byteLength > limit) throw new Error(`JSON 条目超过大小上限：${path}`);
  try {
    return JSON.parse(utf8Decoder.decode(bytes));
  } catch (error) {
    throw new Error(
      `无法解析内容包 JSON：${path}（${
        error instanceof Error ? error.message : String(error)
      }）`,
      { cause: error }
    );
  }
}

function assertManifestRoots(
  manifest: Pick<
    CustomContentPackageManifest,
    'rootRevisionRefs' | 'dependencies'
  >,
  bundles: readonly CustomContentPackageRevisionBundle[]
): void {
  const sourceKeys = new Set(
    bundles.map((bundle) =>
      customContentRevisionRefKey(bundle.sourceRevisionRef)
    )
  );
  for (const ref of [...manifest.rootRevisionRefs, ...manifest.dependencies]) {
    if (!sourceKeys.has(customContentRevisionRefKey(ref))) {
      throw new Error(
        `Manifest 引用了不存在的 revision：${customContentRevisionRefKey(ref)}`
      );
    }
  }
  const declaredKeys = new Set(
    [...manifest.rootRevisionRefs, ...manifest.dependencies].map(
      customContentRevisionRefKey
    )
  );
  if (
    declaredKeys.size !== sourceKeys.size ||
    [...sourceKeys].some((key) => !declaredKeys.has(key))
  ) {
    throw new Error('Manifest 根 revision 与依赖列表未完整覆盖内容包资产。');
  }
}

export async function parseCustomContentPackageZip(
  bytes: Uint8Array
): Promise<ParsedCustomContentPackage> {
  const files = await readZipSafely(bytes);
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) throw new Error('内容包缺少 manifest.json。');
  const manifest = customContentPackageManifestSchema.parse(
    parseJsonBytes('manifest.json', manifestBytes)
  );
  if (manifest.entries.length !== files.size - 1) {
    throw new Error('Manifest 条目数量与压缩包内容不一致。');
  }

  const declaredPaths = new Set<string>();
  const bundles: CustomContentPackageRevisionBundle[] = [];
  const sourceMetadata = new Map<string, CustomSourceDocument>();
  const sourceBytes = new Map<string, Uint8Array>();
  const sourceStructures: CustomSourceStructure[] = [];
  const processingTasks: CustomContentProcessingTask[] = [];
  const processingUnits: CustomContentProcessingUnit[] = [];
  const extractionResults: CustomLocalExtractionResult[] = [];
  const carryLedgerEntries: CustomSourceCarryLedgerEntry[] = [];
  const aggregationResults: CustomSourceAggregationResult[] = [];
  const projectDraftResults: CustomSourceProjectDraftResult[] = [];
  for (const entry of manifest.entries) {
    assertSafeArchivePath(entry.path);
    if (declaredPaths.has(entry.path)) {
      throw new Error(`Manifest 路径重复：${entry.path}`);
    }
    declaredPaths.add(entry.path);
    const value = files.get(entry.path);
    if (!value) throw new Error(`Manifest 条目不存在：${entry.path}`);
    if (
      value.byteLength !== entry.byteLength ||
      (await checksumBytes(value)) !== entry.checksum
    ) {
      throw new Error(`内容包条目校验失败：${entry.path}`);
    }
    if (entry.entryKind !== 'source_blob' && entry.mediaType !== jsonMediaType) {
      throw new Error(`JSON 条目的 mediaType 无效：${entry.path}`);
    }
    if (entry.entryKind === 'revision_bundle') {
      const bundle = customContentRevisionBundleSchema.parse(
        parseJsonBytes(entry.path, value)
      );
      if (
        entry.assetKind !== bundle.assetKind ||
        entry.assetId !== bundle.sourceRevisionRef.assetId ||
        entry.revision !== bundle.sourceRevisionRef.revision
      ) {
        throw new Error(`Manifest revision 元数据不一致：${entry.path}`);
      }
      bundles.push(bundle);
    } else if (entry.entryKind === 'source_document') {
      const document = customSourceDocumentSchema.parse(
        parseJsonBytes(entry.path, value)
      );
      if (entry.sourceDocumentId !== document.sourceDocumentId) {
        throw new Error(`Manifest 原文元数据不一致：${entry.path}`);
      }
      sourceMetadata.set(document.sourceDocumentId, document);
    } else if (entry.entryKind === 'source_blob') {
      if (!entry.sourceDocumentId) {
        throw new Error(`原文 Blob 缺少 sourceDocumentId：${entry.path}`);
      }
      sourceBytes.set(entry.sourceDocumentId, value);
    } else if (entry.entryKind === 'source_structure') {
      const structure = parseCustomSourceStructure(
        parseJsonBytes(entry.path, value)
      );
      if (
        entry.sourceDocumentId !== structure.sourceDocumentId ||
        entry.sourceStructureId !== structure.sourceStructureId
      ) {
        throw new Error(`Manifest 来源结构元数据不一致：${entry.path}`);
      }
      sourceStructures.push(structure);
    } else if (entry.entryKind === 'processing_task') {
      const task = customContentProcessingTaskSchema.parse(
        parseJsonBytes(entry.path, value)
      );
      if (entry.taskId !== task.taskId) {
        throw new Error(`Manifest 处理任务元数据不一致：${entry.path}`);
      }
      processingTasks.push(task);
    } else if (entry.entryKind === 'processing_unit') {
      const unit = customContentProcessingUnitSchema.parse(
        parseJsonBytes(entry.path, value)
      );
      if (entry.taskId !== unit.taskId || entry.unitId !== unit.unitId) {
        throw new Error(`Manifest 处理单元元数据不一致：${entry.path}`);
      }
      processingUnits.push(unit);
    } else if (entry.entryKind === 'processing_units') {
      const units = z
        .array(customContentProcessingUnitSchema)
        .min(1)
        .parse(parseJsonBytes(entry.path, value));
      if (!entry.taskId || units.some((unit) => unit.taskId !== entry.taskId)) {
        throw new Error(`Manifest 处理单元批次元数据不一致：${entry.path}`);
      }
      processingUnits.push(...units);
    } else if (entry.entryKind === 'extraction_results') {
      const results = z
        .array(customLocalExtractionResultSchema)
        .min(1)
        .parse(parseJsonBytes(entry.path, value));
      if (
        !entry.taskId ||
        results.some((result) => result.taskId !== entry.taskId)
      ) {
        throw new Error(`Manifest 局部提取结果元数据不一致：${entry.path}`);
      }
      extractionResults.push(...results);
    } else if (entry.entryKind === 'carry_ledger_entries') {
      const entries = z
        .array(customSourceCarryLedgerEntrySchema)
        .min(1)
        .parse(parseJsonBytes(entry.path, value));
      if (
        !entry.taskId ||
        entries.some((item) => item.extractionTaskId !== entry.taskId)
      ) {
        throw new Error(`Manifest 承接账本元数据不一致：${entry.path}`);
      }
      carryLedgerEntries.push(...entries);
    } else if (entry.entryKind === 'aggregation_results') {
      const results = z
        .array(customSourceAggregationResultSchema)
        .min(1)
        .parse(parseJsonBytes(entry.path, value));
      if (
        !entry.taskId ||
        results.some((result) => result.taskId !== entry.taskId)
      ) {
        throw new Error(`Manifest 聚合结果元数据不一致：${entry.path}`);
      }
      aggregationResults.push(...results);
    } else {
      const result = parseCustomSourceProjectDraftResult(
        parseJsonBytes(entry.path, value)
      );
      if (!entry.taskId || result.taskId !== entry.taskId) {
        throw new Error(`Manifest 项目草稿结果元数据不一致：${entry.path}`);
      }
      projectDraftResults.push(result);
    }
  }
  for (const path of files.keys()) {
    if (path !== 'manifest.json' && !declaredPaths.has(path)) {
      throw new Error(`内容包包含 Manifest 未声明条目：${path}`);
    }
  }

  validateBundleIdentities(bundles);
  assertManifestRoots(manifest, bundles);
  const sourceDocuments = [...sourceMetadata.values()].map((document) => {
    const value = sourceBytes.get(document.sourceDocumentId);
    if (!value) throw new Error(`作者备份缺少原文 Blob：${document.fileName}`);
    if (value.byteLength !== document.byteLength) {
      throw new Error(`作者原文 byteLength 不一致：${document.fileName}`);
    }
    return { document, bytes: value };
  });
  if (
    manifest.packageKind === 'author_backup' &&
    (!manifest.includesSourceText || sourceDocuments.length === 0)
  ) {
    throw new Error('作者备份必须包含明确声明的原文。');
  }
  if (
    manifest.packageKind !== 'author_backup' &&
    (manifest.includesSourceText ||
      sourceMetadata.size > 0 ||
      sourceBytes.size > 0 ||
      sourceStructures.length > 0 ||
      processingTasks.length > 0 ||
      processingUnits.length > 0 ||
      extractionResults.length > 0 ||
      carryLedgerEntries.length > 0 ||
      aggregationResults.length > 0 ||
      projectDraftResults.length > 0)
  ) {
    throw new Error('分享内容包不得包含原文或作者处理进度。');
  }
  if (sourceMetadata.size !== sourceBytes.size) {
    throw new Error('作者备份的原文元数据与 Blob 不成对。');
  }
  const taskIds = new Set(processingTasks.map((task) => task.taskId));
  if (processingUnits.some((unit) => !taskIds.has(unit.taskId))) {
    throw new Error('作者备份包含无所属任务的处理单元。');
  }
  const sourceIds = new Set(sourceDocuments.map(({ document }) => document.sourceDocumentId));
  if (
    sourceStructures.some(
      (structure) => !sourceIds.has(structure.sourceDocumentId)
    )
  ) {
    throw new Error('作者备份包含无所属原文的章节/分块结构。');
  }
  if (
    extractionResults.some((result) => !taskIds.has(result.taskId)) ||
    carryLedgerEntries.some((entry) => !taskIds.has(entry.extractionTaskId)) ||
    aggregationResults.some((result) => !taskIds.has(result.taskId)) ||
    projectDraftResults.some((result) => !taskIds.has(result.taskId))
  ) {
    throw new Error('作者备份包含无所属任务的 AI 中间结果。');
  }
  const extractionResultIds = new Set(
    extractionResults.map((result) => result.extractionResultId)
  );
  if (
    carryLedgerEntries.some(
      (entry) => !extractionResultIds.has(entry.extractionResultId)
    )
  ) {
    throw new Error('作者备份的承接账本缺少对应局部提取结果。');
  }
  const taskById = new Map(
    processingTasks.map((task) => [task.taskId, task] as const)
  );
  const unitById = new Map(
    processingUnits.map((unit) => [unit.unitId, unit] as const)
  );
  const sourceStructureIds = new Set(
    sourceStructures.map((structure) => structure.sourceStructureId)
  );
  const arcAggregationResultIds = new Set(
    aggregationResults
      .filter((result) => result.aggregationLevel === 'arc')
      .map((result) => result.aggregationResultId)
  );
  const storyArcIds = new Set(
    aggregationResults.flatMap(
      (result) => result.storyArcs?.map((arc) => arc.storyArcId) ?? []
    )
  );
  const aggregationObservationIds = new Set(
    aggregationResults.flatMap((result) =>
      [
        ...result.establishedFacts,
        ...result.eventThreads,
        ...result.informationVisibility,
        ...result.unresolvedContradictions,
        ...result.contentGaps
      ].map((item) => item.observationId)
    )
  );
  const mergeSuggestionIds = new Set(
    aggregationResults.flatMap((result) =>
      result.characterMergeSuggestions.map(
        (suggestion) => suggestion.suggestionId
      )
    )
  );
  if (
    projectDraftResults.some((result) => {
      const task = taskById.get(result.taskId);
      const unit = unitById.get(result.unitId);
      return (
        task?.taskKind !== 'build_project' ||
        unit?.taskId !== result.taskId ||
        unit.resultRef !== result.projectDraftResultId ||
        !sourceIds.has(result.sourceDocumentId) ||
        !sourceStructureIds.has(result.sourceStructureId) ||
        result.sourceAggregationResultRefs.some(
          (id) => !arcAggregationResultIds.has(id)
        ) ||
        result.storyArcIds.some((id) => !storyArcIds.has(id)) ||
        result.sourceObservationIds.some(
          (id) => !aggregationObservationIds.has(id)
        ) ||
        result.characterMergeSuggestionIds.some(
          (id) => !mergeSuggestionIds.has(id)
        )
      );
    })
  ) {
    throw new Error('作者备份的项目草稿结果存在无所属或越界来源引用。');
  }
  return {
    manifest,
    bundles,
    sourceDocuments,
    sourceStructures,
    processingTasks,
    processingUnits,
    extractionResults,
    carryLedgerEntries,
    aggregationResults,
    projectDraftResults
  };
}

export function parseCustomEventGroupJsonPackage(
  text: string
): ParsedCustomContentPackage {
  if (strToU8(text).byteLength > 8 * 1024 * 1024) {
    throw new Error('单事件 JSON 超过 8 MB 上限。');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('单事件 JSON 无法解析。');
  }
  const value = customEventGroupJsonPackageSchema.parse(raw);
  validateBundleIdentities(value.bundles);
  assertManifestRoots(value, value.bundles);
  return {
    manifest: {
      format: value.format,
      schemaVersion: value.schemaVersion,
      packageKind: value.packageKind,
      packageId: value.packageId,
      exportedAt: value.exportedAt,
      rootRevisionRefs: value.rootRevisionRefs,
      dependencies: value.dependencies,
      includesSourceText: false
    },
    bundles: value.bundles,
    sourceDocuments: [],
    sourceStructures: [],
    processingTasks: [],
    processingUnits: [],
    extractionResults: [],
    carryLedgerEntries: [],
    aggregationResults: [],
    projectDraftResults: []
  };
}

async function getLocalRevision(
  repository: IndexedDbCustomContentRepository,
  ref: Pick<CustomContentRevisionRef, 'assetKind' | 'assetId' | 'revision'>
): Promise<
  CustomCharacterRevision | CustomEventGroupRevision | CustomContentProjectRevision | null
> {
  if (ref.assetKind === 'character') {
    return repository.getCharacterRevision(ref.assetId, ref.revision);
  }
  if (ref.assetKind === 'event_group') {
    return repository.getEventGroupRevision(ref.assetId, ref.revision);
  }
  return repository.getProjectRevision(ref.assetId, ref.revision);
}

async function getLocalAsset(
  repository: IndexedDbCustomContentRepository,
  ref: Pick<CustomContentRevisionRef, 'assetKind' | 'assetId'>
) {
  if (ref.assetKind === 'character') {
    return repository.getCharacterAsset(ref.assetId);
  }
  if (ref.assetKind === 'event_group') {
    return repository.getEventGroupAsset(ref.assetId);
  }
  return repository.getProjectAsset(ref.assetId);
}

function bundleDisplayName(bundle: CustomContentPackageRevisionBundle): string {
  if (bundle.assetKind === 'character') return bundle.revision.displayName;
  return bundle.revision.title;
}

export async function inspectCustomContentPackageImport({
  repository,
  packageValue
}: {
  repository: IndexedDbCustomContentRepository;
  packageValue: ParsedCustomContentPackage;
}): Promise<CustomContentImportInspection> {
  const conflicts: CustomContentImportConflict[] = [];
  let requiresRemap = false;
  const localNames = new Map<string, string[]>();
  const [characters, events, projects] = await Promise.all([
    repository.listCharacterAssets(),
    repository.listEventGroupAssets(),
    repository.listProjectAssets()
  ]);
  for (const asset of characters) {
    const revision = await repository.getCharacterRevision(
      asset.characterAssetId,
      asset.latestRevision
    );
    if (revision) {
      const names = localNames.get(revision.displayName) ?? [];
      names.push(asset.characterAssetId);
      localNames.set(revision.displayName, names);
    }
  }
  for (const asset of events) {
    const revision = await repository.getEventGroupRevision(
      asset.eventGroupId,
      asset.latestRevision
    );
    if (revision) {
      const names = localNames.get(revision.title) ?? [];
      names.push(asset.eventGroupId);
      localNames.set(revision.title, names);
    }
  }
  for (const asset of projects) {
    const revision = await repository.getProjectRevision(
      asset.projectId,
      asset.latestRevision
    );
    if (revision) {
      const names = localNames.get(revision.title) ?? [];
      names.push(asset.projectId);
      localNames.set(revision.title, names);
    }
  }

  for (const bundle of packageValue.bundles) {
    const sourceLocal = await getLocalRevision(
      repository,
      bundle.sourceRevisionRef
    );
    const packageRef = createCustomContentRevisionRef(bundle.revision);
    const packageLocal = await getLocalRevision(repository, packageRef);
    const asset = await getLocalAsset(repository, bundle.sourceRevisionRef);
    if (sourceLocal?.checksum === bundle.sourceRevisionRef.checksum) {
      conflicts.push({
        kind: 'exact_local',
        assetKind: bundle.assetKind,
        assetId: bundle.sourceRevisionRef.assetId,
        revision: bundle.sourceRevisionRef.revision,
        message: `本地已有完全相同的原始 revision：${bundleDisplayName(bundle)}`
      });
    } else if (packageLocal?.checksum === packageRef.checksum) {
      conflicts.push({
        kind: 'exact_imported',
        assetKind: bundle.assetKind,
        assetId: packageRef.assetId,
        revision: packageRef.revision,
        message: `本地已有完全相同的隔离导入 revision：${bundleDisplayName(bundle)}`
      });
    } else if (!asset) {
      conflicts.push({
        kind: 'new_asset',
        assetKind: bundle.assetKind,
        assetId: bundle.sourceRevisionRef.assetId,
        revision: bundle.sourceRevisionRef.revision,
        message: `将导入新资产：${bundleDisplayName(bundle)}`
      });
    } else if (bundle.sourceRevisionRef.revision > asset.latestRevision) {
      conflicts.push({
        kind: 'new_revision',
        assetKind: bundle.assetKind,
        assetId: bundle.sourceRevisionRef.assetId,
        revision: bundle.sourceRevisionRef.revision,
        message: `将追加新 revision：${bundleDisplayName(bundle)}`
      });
    } else {
      requiresRemap = true;
      conflicts.push({
        kind: 'lineage_conflict',
        assetKind: bundle.assetKind,
        assetId: bundle.sourceRevisionRef.assetId,
        revision: bundle.sourceRevisionRef.revision,
        message: `同一资产 ID 与 revision 属于不同谱系：${bundleDisplayName(bundle)}`
      });
    }

    const sameNameIds = (localNames.get(bundleDisplayName(bundle)) ?? []).filter(
      (id) => id !== bundle.sourceRevisionRef.assetId
    );
    if (sameNameIds.length > 0) {
      conflicts.push({
        kind: 'name_collision',
        assetKind: bundle.assetKind,
        assetId: bundle.sourceRevisionRef.assetId,
        revision: bundle.sourceRevisionRef.revision,
        message: `同名资产仅提示、不自动合并：${bundleDisplayName(bundle)}`
      });
    }
  }
  for (const { document } of packageValue.sourceDocuments) {
    const local = await repository.loadSourceDocument(
      document.sourceDocumentId
    );
    if (!local) continue;
    const localBytes = new Uint8Array(await local.blob.arrayBuffer());
    if (
      local.document.checksum !== document.checksum ||
      local.document.byteLength !== document.byteLength ||
      (await checksumBytes(localBytes)) !== document.checksum
    ) {
      requiresRemap = true;
      conflicts.push({
        kind: 'lineage_conflict',
        assetKind: 'content_project',
        assetId: document.sourceDocumentId,
        revision: 1,
        message: `同一原文 ID 指向不同内容：${document.fileName}`
      });
    }
  }
  for (const task of packageValue.processingTasks) {
    const local = await repository.loadProcessingTask(task.taskId);
    if (
      local &&
      (await createCustomContentChecksum(local)) !==
        (await createCustomContentChecksum(task))
    ) {
      requiresRemap = true;
      conflicts.push({
        kind: 'lineage_conflict',
        assetKind: 'content_project',
        assetId: task.taskId,
        revision: 1,
        message: `同一处理任务 ID 指向不同进度：${task.taskId}`
      });
    }
    const localUnits = new Map(
      (await repository.listProcessingUnits(task.taskId)).map((unit) => [
        unit.unitId,
        unit
      ])
    );
    for (const unit of packageValue.processingUnits.filter(
      (item) => item.taskId === task.taskId
    )) {
      const localUnit = localUnits.get(unit.unitId);
      if (
        localUnit &&
        (await createCustomContentChecksum(localUnit)) !==
          (await createCustomContentChecksum(unit))
      ) {
        requiresRemap = true;
        conflicts.push({
          kind: 'lineage_conflict',
          assetKind: 'content_project',
          assetId: unit.unitId,
          revision: 1,
          message: `同一处理单元 ID 指向不同结果：${unit.unitId}`
        });
      }
    }
  }
  return {
    requiresRemap,
    conflicts,
    warnings: conflicts
      .filter((item) => item.kind === 'name_collision')
      .map((item) => item.message)
  };
}

function remapPrefix(kind: CustomContentRevisionRef['assetKind']): string {
  if (kind === 'character') return 'character';
  if (kind === 'event_group') return 'event-group';
  return 'project';
}

async function prepareImportedBundles({
  repository,
  packageValue,
  remapAll,
  inspection
}: {
  repository: IndexedDbCustomContentRepository;
  packageValue: ParsedCustomContentPackage;
  remapAll: boolean;
  inspection: CustomContentImportInspection;
}): Promise<{
  bundles: SaveCustomContentRevisionBundle[];
  skippedRevisionCount: number;
  assetIdMap: Map<string, string>;
  sourceDocumentIdMap: Map<string, string>;
}> {
  const assetIdMap = new Map<string, string>();
  for (const bundle of packageValue.bundles) {
    assetIdMap.set(
      bundle.sourceRevisionRef.assetId,
      remapAll
        ? createRemappedId(remapPrefix(bundle.assetKind))
        : bundle.sourceRevisionRef.assetId
    );
  }
  const sourceDocumentIdMap = new Map(
    packageValue.sourceDocuments.map(({ document }) => [
      document.sourceDocumentId,
      remapAll
        ? createRemappedId('source')
        : document.sourceDocumentId
    ])
  );
  const skipKeys = new Set(
    inspection.conflicts
      .filter(
        (item) =>
          !remapAll &&
          (item.kind === 'exact_local' || item.kind === 'exact_imported')
      )
      .map((item) =>
        customContentRevisionIdentityKey({
          assetKind: item.assetKind,
          assetId: item.assetId,
          revision: item.revision
        })
      )
  );
  const refMap = new Map<string, CustomContentRevisionRef>();
  let skippedRevisionCount = 0;
  for (const bundle of packageValue.bundles) {
    const packageRef = createCustomContentRevisionRef(bundle.revision);
    const sourceIdentity = customContentRevisionIdentityKey(
      bundle.sourceRevisionRef
    );
    if (skipKeys.has(sourceIdentity)) {
      const sourceLocal = await getLocalRevision(
        repository,
        bundle.sourceRevisionRef
      );
      const packageLocal = await getLocalRevision(repository, packageRef);
      const local =
        sourceLocal?.checksum === bundle.sourceRevisionRef.checksum
          ? createCustomContentRevisionRef(sourceLocal)
          : packageLocal?.checksum === packageRef.checksum
            ? createCustomContentRevisionRef(packageLocal)
            : undefined;
      if (!local) throw new Error('冲突预检结果已过期，请重新导入。');
      refMap.set(customContentRevisionRefKey(packageRef), local);
      skippedRevisionCount += 1;
    }
  }

  const pending = packageValue.bundles
    .filter(
      (bundle) =>
        !skipKeys.has(customContentRevisionIdentityKey(bundle.sourceRevisionRef))
    )
    .sort((left, right) => {
      const order = { character: 0, event_group: 1, content_project: 2 };
      return order[left.assetKind] - order[right.assetKind];
    });
  const drafts: Array<{
    original: CustomContentPackageRevisionBundle;
    asset:
      | CustomCharacterAsset
      | CustomEventGroupAsset
      | CustomContentProjectAsset;
    revision:
      | CustomCharacterRevision
      | CustomEventGroupRevision
      | CustomContentProjectRevision;
  }> = [];
  const now = new Date().toISOString();

  for (const bundle of pending) {
    const packageRef = createCustomContentRevisionRef(bundle.revision);
    const mappedId = assetIdMap.get(bundle.sourceRevisionRef.assetId);
    if (!mappedId) throw new Error('导入阶段缺少资产 ID 映射。');
    if (bundle.assetKind === 'character') {
      const source = bundle.revision;
      const revision = await withFreshChecksum({
        ...source,
        characterAssetId: mappedId,
        majorRelationships: source.majorRelationships.map((relationship) => ({
          ...relationship,
          targetCharacterAssetId: relationship.targetCharacterAssetId
            ? assetIdMap.get(relationship.targetCharacterAssetId) ??
              relationship.targetCharacterAssetId
            : undefined
        })),
        sourceSpans: source.sourceSpans.map((span) =>
          mapSourceSpan(span, sourceDocumentIdMap)
        ),
        lifecycle: cloneLifecycle()
      });
      const existing = remapAll
        ? null
        : await repository.getCharacterAsset(mappedId);
      const asset: CustomCharacterAsset = {
        ...bundle.asset,
        characterAssetId: mappedId,
        latestRevision: revision.revision,
        revisionCount: existing
          ? existing.revisionCount + 1
          : Math.max(1, bundle.asset.revisionCount),
        projectIds: bundle.asset.projectIds.map(
          (id) => assetIdMap.get(id) ?? id
        ),
        createdAt: existing?.createdAt ?? bundle.asset.createdAt,
        updatedAt: now
      };
      refMap.set(
        customContentRevisionRefKey(packageRef),
        createCustomContentRevisionRef(revision)
      );
      drafts.push({ original: bundle, asset, revision });
      continue;
    }
    if (bundle.assetKind === 'event_group') {
      const source = bundle.revision;
      const revision = await withFreshChecksum({
        ...source,
        eventGroupId: mappedId,
        projectId:
          assetIdMap.get(source.projectId) ?? source.projectId,
        characterRefs: source.characterRefs.map((ref) =>
          mapRevisionRef(ref, refMap)
        ),
        roleSlots: source.roleSlots.map((slot) => ({
          ...slot,
          fixedCharacterRef: slot.fixedCharacterRef
            ? mapRevisionRef(slot.fixedCharacterRef, refMap)
            : undefined
        })),
        stages: source.stages.map((stage) => ({
          ...stage,
          establishedSourceFacts: stage.establishedSourceFacts.map((fact) => ({
            ...fact,
            sourceSpans: fact.sourceSpans.map((span) =>
              mapSourceSpan(span, sourceDocumentIdMap)
            )
          })),
          continuationSourceFacts: stage.continuationSourceFacts.map((fact) => ({
            ...fact,
            sourceSpans: fact.sourceSpans.map((span) =>
              mapSourceSpan(span, sourceDocumentIdMap)
            )
          })),
          hardSourceConstraints: stage.hardSourceConstraints.map((fact) => ({
            ...fact,
            sourceSpans: fact.sourceSpans.map((span) =>
              mapSourceSpan(span, sourceDocumentIdMap)
            )
          })),
          eventNodes: stage.eventNodes.map((node) => ({
            ...node,
            characterUsages: node.characterUsages.map((usage) => ({
              ...usage,
              characterRef: usage.characterRef
                ? mapRevisionRef(usage.characterRef, refMap)
                : undefined
            }))
          }))
        })),
        sourceSpans: source.sourceSpans.map((span) =>
          mapSourceSpan(span, sourceDocumentIdMap)
        ),
        lifecycle: cloneLifecycle()
      });
      const existing = remapAll
        ? null
        : await repository.getEventGroupAsset(mappedId);
      const asset: CustomEventGroupAsset = {
        ...bundle.asset,
        eventGroupId: mappedId,
        projectId:
          assetIdMap.get(bundle.asset.projectId) ?? bundle.asset.projectId,
        latestRevision: revision.revision,
        revisionCount: existing
          ? existing.revisionCount + 1
          : Math.max(1, bundle.asset.revisionCount),
        createdAt: existing?.createdAt ?? bundle.asset.createdAt,
        updatedAt: now
      };
      refMap.set(
        customContentRevisionRefKey(packageRef),
        createCustomContentRevisionRef(revision)
      );
      drafts.push({ original: bundle, asset, revision });
      continue;
    }
    const source = bundle.revision;
    const revision = await withFreshChecksum({
      ...source,
      projectId: mappedId,
      characterAssetIds: source.characterAssetIds.map(
        (id) => assetIdMap.get(id) ?? id
      ),
      eventGroupIds: source.eventGroupIds.map(
        (id) => assetIdMap.get(id) ?? id
      ),
      sourceDocumentIds: source.sourceDocumentIds.map(
        (id) => sourceDocumentIdMap.get(id) ?? id
      ),
      lifecycle: cloneLifecycle()
    });
    const existing = remapAll
      ? null
      : await repository.getProjectAsset(mappedId);
    const asset: CustomContentProjectAsset = {
      ...bundle.asset,
      projectId: mappedId,
      latestRevision: revision.revision,
      revisionCount: existing
        ? existing.revisionCount + 1
        : Math.max(1, bundle.asset.revisionCount),
      createdAt: existing?.createdAt ?? bundle.asset.createdAt,
      updatedAt: now
    };
    refMap.set(
      customContentRevisionRefKey(packageRef),
      createCustomContentRevisionRef(revision)
    );
    drafts.push({ original: bundle, asset, revision });
  }

  const bundles: SaveCustomContentRevisionBundle[] = drafts.map((draft) => {
    const owner = createCustomContentRevisionRef(draft.revision);
    const dependencies = draft.original.dependencies.map((dependency) => {
      const target = mapRevisionRef(dependency.target, refMap);
      return {
        dependencyId: createCustomContentDependencyId(
          owner,
          target,
          dependency.kind
        ),
        owner,
        target,
        kind: dependency.kind
      };
    });
    if ('characterAssetId' in draft.revision) {
      return {
        assetKind: 'character',
        asset: draft.asset as CustomCharacterAsset,
        revision: draft.revision,
        dependencies
      };
    }
    if ('eventGroupId' in draft.revision) {
      return {
        assetKind: 'event_group',
        asset: draft.asset as CustomEventGroupAsset,
        revision: draft.revision,
        dependencies
      };
    }
    return {
      assetKind: 'content_project',
      asset: draft.asset as CustomContentProjectAsset,
      revision: draft.revision,
      dependencies
    };
  });
  return {
    bundles,
    skippedRevisionCount,
    assetIdMap,
    sourceDocumentIdMap
  };
}

export async function importCustomContentPackage({
  repository,
  packageValue,
  conflictStrategy = 'cancel'
}: {
  repository: IndexedDbCustomContentRepository;
  packageValue: ParsedCustomContentPackage;
  conflictStrategy?: 'cancel' | 'remap';
}): Promise<CustomContentImportResult> {
  const inspection = await inspectCustomContentPackageImport({
    repository,
    packageValue
  });
  if (inspection.requiresRemap && conflictStrategy !== 'remap') {
    throw new Error('内容包存在不同谱系的同 ID 冲突；请取消或选择复制并重映射。');
  }
  const remapAll = inspection.requiresRemap && conflictStrategy === 'remap';
  const prepared = await prepareImportedBundles({
    repository,
    packageValue,
    remapAll,
    inspection
  });
  const taskIdMap = new Map(
    packageValue.processingTasks.map((task) => [
      task.taskId,
      remapAll ? createRemappedId('task') : task.taskId
    ])
  );
  const unitIdMap = new Map(
    packageValue.processingUnits.map((unit) => [
      unit.unitId,
      remapAll ? createRemappedId('unit') : unit.unitId
    ])
  );
  const intermediateIdMap = new Map<string, string>([
    ...packageValue.sourceStructures.flatMap((structure) => [
      [
        structure.sourceStructureId,
        remapAll
          ? createRemappedId('source-structure')
          : structure.sourceStructureId
      ] as const,
      ...structure.chapters.map(
        (chapter) =>
          [
            chapter.chapterId,
            remapAll ? createRemappedId('chapter') : chapter.chapterId
          ] as const
      ),
      ...structure.chunks.map(
        (chunk) =>
          [
            chunk.chunkId,
            remapAll ? createRemappedId('chunk') : chunk.chunkId
          ] as const
      )
    ]),
    ...packageValue.extractionResults.flatMap((result) => [
      [
        result.extractionResultId,
        remapAll
          ? createRemappedId('source-extraction')
          : result.extractionResultId
      ] as const,
      ...[
        ...result.establishedFacts,
        ...result.characterObservations,
        ...result.eventObservations,
        ...result.informationVisibility,
        ...result.unresolvedContradictions
      ].map(
        (item) =>
          [
            item.observationId,
            remapAll
              ? createRemappedId('observation')
              : item.observationId
          ] as const
      )
    ]),
    ...packageValue.carryLedgerEntries.map(
      (entry) =>
        [
          entry.carryLedgerEntryId,
          remapAll
            ? createRemappedId('source-carry')
            : entry.carryLedgerEntryId
        ] as const
    ),
    ...packageValue.aggregationResults.flatMap((result) => [
      [
        result.aggregationResultId,
        remapAll
          ? createRemappedId('source-aggregation')
          : result.aggregationResultId
      ] as const,
      ...[
        ...result.establishedFacts,
        ...result.eventThreads,
        ...result.informationVisibility,
        ...result.unresolvedContradictions,
        ...result.contentGaps
      ].map(
        (item) =>
          [
            item.observationId,
            remapAll
              ? createRemappedId('observation')
              : item.observationId
          ] as const
      ),
      ...result.characterMergeSuggestions.map(
        (item) =>
          [
            item.suggestionId,
            remapAll ? createRemappedId('merge-suggestion') : item.suggestionId
          ] as const
      ),
      ...(result.storyArcs ?? []).map(
        (arc) =>
          [
            arc.storyArcId,
            remapAll ? createRemappedId('story-arc') : arc.storyArcId
          ] as const
      )
    ]),
    ...packageValue.projectDraftResults.map(
      (result) =>
        [
          result.projectDraftResultId,
          remapAll
            ? createRemappedId('source-project-draft')
            : result.projectDraftResultId
        ] as const
    )
  ]);
  const sourceDocuments = [];
  for (const { document, bytes } of packageValue.sourceDocuments) {
    if (!remapAll) {
      const local = await repository.loadSourceDocument(
        document.sourceDocumentId
      );
      if (local) {
        const localBytes = new Uint8Array(await local.blob.arrayBuffer());
        if (
          local.document.checksum !== document.checksum ||
          (await checksumBytes(localBytes)) !== document.checksum
        ) {
          throw new Error('原文冲突预检结果已过期，请重新导入。');
        }
        continue;
      }
    }
    sourceDocuments.push({
      document: {
        ...document,
        sourceDocumentId:
          prepared.sourceDocumentIdMap.get(document.sourceDocumentId) ??
          document.sourceDocumentId,
        projectId: document.projectId
          ? prepared.assetIdMap.get(document.projectId) ?? document.projectId
          : undefined
      },
      blob: new Blob([Uint8Array.from(bytes).buffer], {
        type: document.mediaType
      })
    });
  }
  const processingTasks: CustomContentProcessingTask[] = [];
  for (const task of packageValue.processingTasks) {
    if (!remapAll) {
      const local = await repository.loadProcessingTask(task.taskId);
      if (local) {
        if (
          (await createCustomContentChecksum(local)) !==
          (await createCustomContentChecksum(task))
        ) {
          throw new Error('任务冲突预检结果已过期，请重新导入。');
        }
        continue;
      }
    }
    processingTasks.push({
      ...task,
      taskId: taskIdMap.get(task.taskId) ?? task.taskId,
      projectId: task.projectId
        ? prepared.assetIdMap.get(task.projectId) ?? task.projectId
        : undefined,
      sourceDocumentId: task.sourceDocumentId
        ? prepared.sourceDocumentIdMap.get(task.sourceDocumentId) ??
          task.sourceDocumentId
        : undefined,
      cursor: task.cursor
        ? unitIdMap.get(task.cursor) ?? task.cursor
        : undefined,
      aiProcessing: task.aiProcessing
        ? {
            ...task.aiProcessing,
            sourceStructureId:
              intermediateIdMap.get(task.aiProcessing.sourceStructureId) ??
              task.aiProcessing.sourceStructureId,
            inputTaskIds: task.aiProcessing.inputTaskIds?.map(
              (taskId) => taskIdMap.get(taskId) ?? taskId
            )
          }
        : undefined
    });
  }
  const localUnitsByTask = new Map<
    string,
    Map<string, CustomContentProcessingUnit>
  >();
  const processingUnits: CustomContentProcessingUnit[] = [];
  for (const unit of packageValue.processingUnits) {
    if (!remapAll) {
      let localUnits = localUnitsByTask.get(unit.taskId);
      if (!localUnits) {
        localUnits = new Map(
          (await repository.listProcessingUnits(unit.taskId)).map((item) => [
            item.unitId,
            item
          ])
        );
        localUnitsByTask.set(unit.taskId, localUnits);
      }
      const local = localUnits.get(unit.unitId);
      if (local) {
        if (
          (await createCustomContentChecksum(local)) !==
          (await createCustomContentChecksum(unit))
        ) {
          throw new Error('处理单元冲突预检结果已过期，请重新导入。');
        }
        continue;
      }
    }
    const exactRefMap = new Map<string, string>([
      ...prepared.assetIdMap,
      ...prepared.sourceDocumentIdMap,
      ...taskIdMap,
      ...unitIdMap,
      ...intermediateIdMap
    ]);
    processingUnits.push({
      ...unit,
      unitId: unitIdMap.get(unit.unitId) ?? unit.unitId,
      taskId: taskIdMap.get(unit.taskId) ?? unit.taskId,
      sourceSpan: unit.sourceSpan
        ? mapSourceSpan(
            unit.sourceSpan,
            prepared.sourceDocumentIdMap,
            intermediateIdMap
          )
        : undefined,
      inputRefs: unit.inputRefs?.map(
        (ref) => intermediateIdMap.get(ref) ?? ref
      ),
      resultRef: unit.resultRef
        ? exactRefMap.get(unit.resultRef) ?? unit.resultRef
        : undefined
    });
  }

  const sourceStructures: CustomSourceStructure[] = [];
  for (const structure of packageValue.sourceStructures) {
    const mapped = parseCustomSourceStructure({
      ...structure,
      sourceStructureId:
        intermediateIdMap.get(structure.sourceStructureId) ??
        structure.sourceStructureId,
      sourceDocumentId:
        prepared.sourceDocumentIdMap.get(structure.sourceDocumentId) ??
        structure.sourceDocumentId,
      chapters: structure.chapters.map((chapter) => ({
        ...chapter,
        chapterId:
          intermediateIdMap.get(chapter.chapterId) ?? chapter.chapterId,
        sourceStructureId:
          intermediateIdMap.get(chapter.sourceStructureId) ??
          chapter.sourceStructureId,
        sourceDocumentId:
          prepared.sourceDocumentIdMap.get(chapter.sourceDocumentId) ??
          chapter.sourceDocumentId,
        sourceSpan: mapSourceSpan(
          chapter.sourceSpan,
          prepared.sourceDocumentIdMap,
          intermediateIdMap
        )
      })),
      chunks: structure.chunks.map((chunk) => ({
        ...chunk,
        chunkId: intermediateIdMap.get(chunk.chunkId) ?? chunk.chunkId,
        sourceStructureId:
          intermediateIdMap.get(chunk.sourceStructureId) ??
          chunk.sourceStructureId,
        sourceDocumentId:
          prepared.sourceDocumentIdMap.get(chunk.sourceDocumentId) ??
          chunk.sourceDocumentId,
        chapterId:
          intermediateIdMap.get(chunk.chapterId) ?? chunk.chapterId,
        sourceSpan: mapSourceSpan(
          chunk.sourceSpan,
          prepared.sourceDocumentIdMap,
          intermediateIdMap
        )
      }))
    });
    const local = await repository.loadSourceStructure(
      mapped.sourceStructureId
    );
    if (local) {
      if (
        (await createCustomContentChecksum(local)) !==
        (await createCustomContentChecksum(mapped))
      ) {
        throw new Error('来源结构冲突预检结果已过期，请重新导入。');
      }
      continue;
    }
    sourceStructures.push(mapped);
  }

  const extractionResults: CustomLocalExtractionResult[] = [];
  for (const result of packageValue.extractionResults) {
    const mapObservation = <T extends { observationId: string }>(item: T) => ({
      ...item,
      observationId:
        intermediateIdMap.get(item.observationId) ?? item.observationId
    });
    const mapped = parseCustomLocalExtractionResult({
      ...result,
      extractionResultId:
        intermediateIdMap.get(result.extractionResultId) ??
        result.extractionResultId,
      taskId: taskIdMap.get(result.taskId) ?? result.taskId,
      unitId: unitIdMap.get(result.unitId) ?? result.unitId,
      sourceDocumentId:
        prepared.sourceDocumentIdMap.get(result.sourceDocumentId) ??
        result.sourceDocumentId,
      sourceStructureId:
        intermediateIdMap.get(result.sourceStructureId) ??
        result.sourceStructureId,
      chunkId: intermediateIdMap.get(result.chunkId) ?? result.chunkId,
      sourceSpan: mapSourceSpan(
        result.sourceSpan,
        prepared.sourceDocumentIdMap,
        intermediateIdMap
      ),
      establishedFacts: result.establishedFacts.map(mapObservation),
      characterObservations: result.characterObservations.map(mapObservation),
      eventObservations: result.eventObservations.map(mapObservation),
      informationVisibility: result.informationVisibility.map(mapObservation),
      unresolvedContradictions:
        result.unresolvedContradictions.map(mapObservation)
    });
    const local = await repository.loadExtractionResult(
      mapped.extractionResultId
    );
    if (local) {
      if (
        (await createCustomContentChecksum(local)) !==
        (await createCustomContentChecksum(mapped))
      ) {
        throw new Error('局部提取结果冲突预检结果已过期，请重新导入。');
      }
      continue;
    }
    extractionResults.push(mapped);
  }

  const carryLedgerEntries: CustomSourceCarryLedgerEntry[] = [];
  for (const entry of packageValue.carryLedgerEntries) {
    const mapped = parseCustomSourceCarryLedgerEntry({
      ...entry,
      carryLedgerEntryId:
        intermediateIdMap.get(entry.carryLedgerEntryId) ??
        entry.carryLedgerEntryId,
      extractionTaskId:
        taskIdMap.get(entry.extractionTaskId) ?? entry.extractionTaskId,
      extractionResultId:
        intermediateIdMap.get(entry.extractionResultId) ??
        entry.extractionResultId,
      unitId: unitIdMap.get(entry.unitId) ?? entry.unitId,
      sourceDocumentId:
        prepared.sourceDocumentIdMap.get(entry.sourceDocumentId) ??
        entry.sourceDocumentId,
      sourceStructureId:
        intermediateIdMap.get(entry.sourceStructureId) ??
        entry.sourceStructureId,
      chunkId: intermediateIdMap.get(entry.chunkId) ?? entry.chunkId,
      sourceSpan: mapSourceSpan(
        entry.sourceSpan,
        prepared.sourceDocumentIdMap,
        intermediateIdMap
      ),
      characterObservationIds: entry.characterObservationIds.map(
        (id) => intermediateIdMap.get(id) ?? id
      ),
      eventObservationIds: entry.eventObservationIds.map(
        (id) => intermediateIdMap.get(id) ?? id
      ),
      unresolvedContradictionObservationIds:
        entry.unresolvedContradictionObservationIds.map(
          (id) => intermediateIdMap.get(id) ?? id
        )
    });
    const local = await repository.loadCarryLedgerEntry(
      mapped.carryLedgerEntryId
    );
    if (local) {
      if (
        (await createCustomContentChecksum(local)) !==
        (await createCustomContentChecksum(mapped))
      ) {
        throw new Error('承接账本冲突预检结果已过期，请重新导入。');
      }
      continue;
    }
    carryLedgerEntries.push(mapped);
  }

  const aggregationResults: CustomSourceAggregationResult[] = [];
  for (const result of packageValue.aggregationResults) {
    const mapObservation = <T extends { observationId: string }>(item: T) => ({
      ...item,
      observationId:
        intermediateIdMap.get(item.observationId) ?? item.observationId
    });
    const mapped = parseCustomSourceAggregationResult({
      ...result,
      aggregationResultId:
        intermediateIdMap.get(result.aggregationResultId) ??
        result.aggregationResultId,
      taskId: taskIdMap.get(result.taskId) ?? result.taskId,
      unitId: unitIdMap.get(result.unitId) ?? result.unitId,
      sourceDocumentId:
        prepared.sourceDocumentIdMap.get(result.sourceDocumentId) ??
        result.sourceDocumentId,
      sourceStructureId:
        intermediateIdMap.get(result.sourceStructureId) ??
        result.sourceStructureId,
      sourceSpans: result.sourceSpans.map((span) =>
        mapSourceSpan(
          span,
          prepared.sourceDocumentIdMap,
          intermediateIdMap
        )
      ),
      lowerResultRefs: result.lowerResultRefs.map(
        (ref) => intermediateIdMap.get(ref) ?? ref
      ),
      chapterIds: result.chapterIds.map(
        (id) => intermediateIdMap.get(id) ?? id
      ),
      establishedFacts: result.establishedFacts.map(mapObservation),
      characterMergeSuggestions: result.characterMergeSuggestions.map(
        (suggestion) => ({
          ...suggestion,
          suggestionId:
            intermediateIdMap.get(suggestion.suggestionId) ??
            suggestion.suggestionId,
          sourceObservationIds: suggestion.sourceObservationIds.map(
            (id) => intermediateIdMap.get(id) ?? id
          )
        })
      ),
      eventThreads: result.eventThreads.map(mapObservation),
      informationVisibility: result.informationVisibility.map(mapObservation),
      unresolvedContradictions:
        result.unresolvedContradictions.map(mapObservation),
      contentGaps: result.contentGaps.map(mapObservation),
      storyArcs: result.storyArcs?.map((arc) => ({
        ...arc,
        storyArcId:
          intermediateIdMap.get(arc.storyArcId) ?? arc.storyArcId,
        sourceResultRefs: arc.sourceResultRefs.map(
          (id) => intermediateIdMap.get(id) ?? id
        ),
        sourceObservationIds: arc.sourceObservationIds.map(
          (id) => intermediateIdMap.get(id) ?? id
        ),
        characterMergeSuggestionIds: arc.characterMergeSuggestionIds.map(
          (id) => intermediateIdMap.get(id) ?? id
        )
      }))
    });
    const local = await repository.loadAggregationResult(
      mapped.aggregationResultId
    );
    if (local) {
      if (
        (await createCustomContentChecksum(local)) !==
        (await createCustomContentChecksum(mapped))
      ) {
        throw new Error('聚合结果冲突预检结果已过期，请重新导入。');
      }
      continue;
    }
    aggregationResults.push(mapped);
  }

  const projectDraftResults: CustomSourceProjectDraftResult[] = [];
  for (const result of packageValue.projectDraftResults) {
    const mapped = parseCustomSourceProjectDraftResult({
      ...result,
      projectDraftResultId:
        intermediateIdMap.get(result.projectDraftResultId) ??
        result.projectDraftResultId,
      taskId: taskIdMap.get(result.taskId) ?? result.taskId,
      unitId: unitIdMap.get(result.unitId) ?? result.unitId,
      sourceDocumentId:
        prepared.sourceDocumentIdMap.get(result.sourceDocumentId) ??
        result.sourceDocumentId,
      sourceStructureId:
        intermediateIdMap.get(result.sourceStructureId) ??
        result.sourceStructureId,
      sourceAggregationResultRefs: result.sourceAggregationResultRefs.map(
        (id) => intermediateIdMap.get(id) ?? id
      ),
      storyArcIds: result.storyArcIds.map(
        (id) => intermediateIdMap.get(id) ?? id
      ),
      sourceObservationIds: result.sourceObservationIds.map(
        (id) => intermediateIdMap.get(id) ?? id
      ),
      characterMergeSuggestionIds: result.characterMergeSuggestionIds.map(
        (id) => intermediateIdMap.get(id) ?? id
      ),
      eventGroupSources: result.eventGroupSources.map((source) => ({
        ...source,
        storyArcIds: source.storyArcIds.map(
          (id) => intermediateIdMap.get(id) ?? id
        )
      })),
      characterCandidateSources: result.characterCandidateSources.map(
        (source) => ({
          ...source,
          sourceObservationIds: source.sourceObservationIds.map(
            (id) => intermediateIdMap.get(id) ?? id
          ),
          characterMergeSuggestionIds:
            source.characterMergeSuggestionIds.map(
              (id) => intermediateIdMap.get(id) ?? id
            )
        })
      )
    });
    const local = await repository.loadProjectDraftResult(
      mapped.projectDraftResultId
    );
    if (local) {
      if (
        (await createCustomContentChecksum(local)) !==
        (await createCustomContentChecksum(mapped))
      ) {
        throw new Error('项目草稿结果冲突预检结果已过期，请重新导入。');
      }
      continue;
    }
    projectDraftResults.push(mapped);
  }

  await repository.saveImportBatch({
    bundles: prepared.bundles,
    sourceDocuments,
    sourceStructures,
    processingTasks,
    processingUnits,
    extractionResults,
    carryLedgerEntries,
    aggregationResults,
    projectDraftResults
  });
  return {
    importedRevisionCount: prepared.bundles.length,
    skippedRevisionCount: prepared.skippedRevisionCount,
    remapped: remapAll,
    assetIdMap: Object.fromEntries(prepared.assetIdMap),
    sourceDocumentIdMap: Object.fromEntries(prepared.sourceDocumentIdMap),
    warnings: inspection.warnings
  };
}
