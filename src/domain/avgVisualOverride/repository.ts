import {
  avgActorIdentityKey,
  avgActorOutfitOverrideKey,
  avgActorOverrideKey,
  avgSceneOverrideKey,
  avgUserOutfitKey,
  createAvgOverrideAssetId,
  createAvgUserOutfitId
} from './keys';
import type {
  AvgActorOutfitSelectionLookup,
  AvgActorOutfitSelectionState,
  AvgActorOutfitVisualOverride,
  AvgActorOutfitVisualOverrideKey,
  AvgActorOutfitVisualOverrideLookup,
  AvgActorVisualOverride,
  AvgActorVisualOverrideKey,
  AvgActorVisualOverrideLookup,
  AvgOverrideAssetMetadata,
  AvgOutfitSelection,
  AvgSceneVisualOverride,
  AvgSceneVisualOverrideKey,
  AvgSceneVisualOverrideLookup,
  AvgValidatedOverrideImage,
  AvgUserOutfitDefinition,
  AvgUserOutfitDraft,
  AvgVisualOverridePartitionSnapshot,
  AvgVisualOverrideRepository
} from './types';

export const DEFAULT_AVG_VISUAL_OVERRIDE_DB_NAME = 'sorry-im-a-cop-v2-avg-visual-overrides';
const DB_VERSION = 2;
const ASSET_STORE = 'override-assets';
const ACTOR_STORE = 'actor-visual-overrides';
const SCENE_STORE = 'scene-visual-overrides';
const USER_OUTFIT_STORE = 'actor-user-outfits';
const OUTFIT_SELECTION_STORE = 'actor-outfit-selections';
const OUTFIT_OVERRIDE_STORE = 'actor-outfit-visual-overrides';
const PARTITION_INDEX = 'by-visual-partition';
const ASSET_INDEX = 'by-asset-id';
const PARTITION_HASH_INDEX = 'by-partition-hash';
const ACTOR_INDEX = 'by-actor-key';

interface StoredAsset extends AvgOverrideAssetMetadata {
  bytes: ArrayBuffer;
}

interface StoredActorOverride extends AvgActorVisualOverride {
  mappingKey: string;
}

interface StoredSceneOverride extends AvgSceneVisualOverride {
  mappingKey: string;
  anchorType: AvgSceneVisualOverride['anchor']['type'];
  anchorId: string;
}

interface StoredUserOutfit extends AvgUserOutfitDefinition {
  outfitKey: string;
  actorKey: string;
}

interface StoredOutfitSelection extends AvgActorOutfitSelectionState {
  actorKey: string;
}

interface StoredOutfitOverride extends AvgActorOutfitVisualOverride {
  mappingKey: string;
  actorKey: string;
  outfitType: AvgActorOutfitVisualOverride['outfit']['type'];
  basePackId?: string;
  outfitId: string;
}

function assetMetadata(asset: StoredAsset): AvgOverrideAssetMetadata {
  const { bytes: _bytes, ...metadata } = asset;
  return metadata;
}

function storedAssetBlob(asset: StoredAsset): Blob | undefined {
  if (
    Object.prototype.toString.call(asset.bytes) !== '[object ArrayBuffer]' ||
    asset.bytes.byteLength !== asset.byteLength
  ) return undefined;
  return new Blob([asset.bytes], { type: asset.mediaType });
}

function requestToPromise<T>(request: IDBRequest<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(message));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error ?? new Error('AVG 自定义视觉资料事务失败。')
    );
    transaction.onabort = () => reject(
      transaction.error ?? new Error('AVG 自定义视觉资料事务已中止。')
    );
  });
}

function stripActorRow(row: StoredActorOverride): AvgActorVisualOverride {
  const { mappingKey: _mappingKey, ...mapping } = row;
  return mapping;
}

function stripSceneRow(row: StoredSceneOverride): AvgSceneVisualOverride {
  const {
    mappingKey: _mappingKey,
    anchorType: _anchorType,
    anchorId: _anchorId,
    ...mapping
  } = row;
  return mapping;
}

function stripUserOutfitRow(row: StoredUserOutfit): AvgUserOutfitDefinition {
  const { outfitKey: _outfitKey, actorKey: _actorKey, ...definition } = row;
  return definition;
}

function stripOutfitSelectionRow(
  row: StoredOutfitSelection
): AvgActorOutfitSelectionState {
  const { actorKey: _actorKey, ...state } = row;
  return state;
}

function stripOutfitOverrideRow(
  row: StoredOutfitOverride
): AvgActorOutfitVisualOverride {
  const {
    mappingKey: _mappingKey,
    actorKey: _actorKey,
    outfitType: _outfitType,
    basePackId: _basePackId,
    outfitId: _outfitId,
    ...mapping
  } = row;
  return mapping;
}

function storedActor(mapping: AvgActorVisualOverride): StoredActorOverride {
  return {
    ...mapping,
    mappingKey: avgActorOverrideKey(mapping)
  };
}

function storedScene(mapping: AvgSceneVisualOverride): StoredSceneOverride {
  return {
    ...mapping,
    mappingKey: avgSceneOverrideKey(mapping),
    anchorType: mapping.anchor.type,
    anchorId: mapping.anchor.id
  };
}

function storedUserOutfit(definition: AvgUserOutfitDefinition): StoredUserOutfit {
  return {
    ...definition,
    outfitKey: avgUserOutfitKey(definition, definition.outfitId),
    actorKey: avgActorIdentityKey(definition)
  };
}

function storedOutfitSelection(
  state: AvgActorOutfitSelectionState
): StoredOutfitSelection {
  return { ...state, actorKey: avgActorIdentityKey(state) };
}

function storedOutfitOverride(
  mapping: AvgActorOutfitVisualOverride
): StoredOutfitOverride {
  return {
    ...mapping,
    mappingKey: avgActorOutfitOverrideKey(mapping),
    actorKey: avgActorIdentityKey(mapping),
    outfitType: mapping.outfit.type,
    ...(mapping.outfit.type === 'resource_outfit'
      ? { basePackId: mapping.outfit.basePackId }
      : {}),
    outfitId: mapping.outfit.outfitId
  };
}

function cleanOutfitDraft(draft: AvgUserOutfitDraft): AvgUserOutfitDraft {
  const displayName = draft.displayName.replace(/\s+/gu, ' ').trim().slice(0, 80);
  if (!displayName) throw new Error('自定义服装需要名称。');
  const visualDescription = draft.visualDescription?.replace(/\s+/gu, ' ').trim().slice(0, 1200);
  const semanticTags = draft.semanticTags
    ?.map((tag) => tag.replace(/\s+/gu, ' ').trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 24);
  return {
    displayName,
    ...(visualDescription ? { visualDescription } : {}),
    ...(semanticTags?.length ? { semanticTags: [...new Set(semanticTags)] } : {})
  };
}

function effectiveOutfitSelection(
  state: AvgActorOutfitSelectionState | undefined,
  basePackId: string,
  userOutfitExists: boolean
): AvgActorOutfitSelectionLookup {
  if (state?.activeUserOutfitId && userOutfitExists) {
    return {
      selection: { type: 'user_outfit', outfitId: state.activeUserOutfitId },
      state,
      status: 'ready'
    };
  }
  const resourceOutfitId = state?.resourceOutfitIdsByBasePack[basePackId];
  const fallback = resourceOutfitId
    ? { type: 'resource_outfit' as const, basePackId, outfitId: resourceOutfitId }
    : { type: 'resource_default' as const };
  return {
    selection: fallback,
    ...(state ? { state } : {}),
    status: state?.activeUserOutfitId ? 'user_outfit_missing' : 'ready',
    ...(state?.activeUserOutfitId
      ? { missingUserOutfitId: state.activeUserOutfitId }
      : {})
  };
}

async function deleteByIndex(
  store: IDBObjectStore,
  indexName: string,
  value: IDBValidKey,
  message: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = store.index(indexName).openKeyCursor(IDBKeyRange.only(value));
    request.onerror = () => reject(request.error ?? new Error(message));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

async function maybeDeleteOrphan(
  transaction: IDBTransaction,
  assetId: string
): Promise<void> {
  const actorReferences = await requestToPromise(
    transaction.objectStore(ACTOR_STORE).index(ASSET_INDEX).getAllKeys(IDBKeyRange.only(assetId)),
    '无法检查人物自定义图片引用。'
  );
  const sceneReferences = await requestToPromise(
    transaction.objectStore(SCENE_STORE).index(ASSET_INDEX).getAllKeys(IDBKeyRange.only(assetId)),
    '无法检查场景自定义图片引用。'
  );
  const outfitReferences = await requestToPromise(
    transaction.objectStore(OUTFIT_OVERRIDE_STORE).index(ASSET_INDEX).getAllKeys(
      IDBKeyRange.only(assetId)
    ),
    '无法检查服装自定义图片引用。'
  );
  if (!actorReferences.length && !sceneReferences.length && !outfitReferences.length) {
    transaction.objectStore(ASSET_STORE).delete(assetId);
  }
}

export class IndexedDbAvgVisualOverrideRepository implements AvgVisualOverrideRepository {
  constructor(private readonly dbName = DEFAULT_AVG_VISUAL_OVERRIDE_DB_NAME) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const assets = db.objectStoreNames.contains(ASSET_STORE)
          ? request.transaction!.objectStore(ASSET_STORE)
          : db.createObjectStore(ASSET_STORE, { keyPath: 'assetId' });
        if (!assets.indexNames.contains(PARTITION_INDEX)) {
          assets.createIndex(PARTITION_INDEX, 'visualPartitionId');
        }
        if (!assets.indexNames.contains(PARTITION_HASH_INDEX)) {
          assets.createIndex(PARTITION_HASH_INDEX, ['visualPartitionId', 'sha256']);
        }

        const actors = db.objectStoreNames.contains(ACTOR_STORE)
          ? request.transaction!.objectStore(ACTOR_STORE)
          : db.createObjectStore(ACTOR_STORE, { keyPath: 'mappingKey' });
        if (!actors.indexNames.contains(PARTITION_INDEX)) {
          actors.createIndex(PARTITION_INDEX, 'visualPartitionId');
        }
        if (!actors.indexNames.contains(ASSET_INDEX)) {
          actors.createIndex(ASSET_INDEX, 'assetId');
        }

        const scenes = db.objectStoreNames.contains(SCENE_STORE)
          ? request.transaction!.objectStore(SCENE_STORE)
          : db.createObjectStore(SCENE_STORE, { keyPath: 'mappingKey' });
        if (!scenes.indexNames.contains(PARTITION_INDEX)) {
          scenes.createIndex(PARTITION_INDEX, 'visualPartitionId');
        }
        if (!scenes.indexNames.contains(ASSET_INDEX)) {
          scenes.createIndex(ASSET_INDEX, 'assetId');
        }

        const userOutfits = db.objectStoreNames.contains(USER_OUTFIT_STORE)
          ? request.transaction!.objectStore(USER_OUTFIT_STORE)
          : db.createObjectStore(USER_OUTFIT_STORE, { keyPath: 'outfitKey' });
        if (!userOutfits.indexNames.contains(PARTITION_INDEX)) {
          userOutfits.createIndex(PARTITION_INDEX, 'visualPartitionId');
        }
        if (!userOutfits.indexNames.contains(ACTOR_INDEX)) {
          userOutfits.createIndex(ACTOR_INDEX, 'actorKey');
        }

        const selections = db.objectStoreNames.contains(OUTFIT_SELECTION_STORE)
          ? request.transaction!.objectStore(OUTFIT_SELECTION_STORE)
          : db.createObjectStore(OUTFIT_SELECTION_STORE, { keyPath: 'actorKey' });
        if (!selections.indexNames.contains(PARTITION_INDEX)) {
          selections.createIndex(PARTITION_INDEX, 'visualPartitionId');
        }

        const outfitOverrides = db.objectStoreNames.contains(OUTFIT_OVERRIDE_STORE)
          ? request.transaction!.objectStore(OUTFIT_OVERRIDE_STORE)
          : db.createObjectStore(OUTFIT_OVERRIDE_STORE, { keyPath: 'mappingKey' });
        if (!outfitOverrides.indexNames.contains(PARTITION_INDEX)) {
          outfitOverrides.createIndex(PARTITION_INDEX, 'visualPartitionId');
        }
        if (!outfitOverrides.indexNames.contains(ACTOR_INDEX)) {
          outfitOverrides.createIndex(ACTOR_INDEX, 'actorKey');
        }
        if (!outfitOverrides.indexNames.contains(ASSET_INDEX)) {
          outfitOverrides.createIndex(ASSET_INDEX, 'assetId');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error ?? new Error('无法打开 AVG 自定义视觉资料数据库。')
      );
    });
  }

  async getActorOverride(
    key: AvgActorVisualOverrideKey
  ): Promise<AvgActorVisualOverrideLookup | undefined> {
    const db = await this.open();
    try {
      const transaction = db.transaction([ACTOR_STORE, ASSET_STORE], 'readonly');
      const row = await requestToPromise<StoredActorOverride | undefined>(
        transaction.objectStore(ACTOR_STORE).get(avgActorOverrideKey(key)),
        '无法读取人物 AVG 自定义立绘。'
      );
      if (!row) {
        await transactionDone(transaction);
        return undefined;
      }
      const asset = await requestToPromise<StoredAsset | undefined>(
        transaction.objectStore(ASSET_STORE).get(row.assetId),
        '无法读取人物 AVG 自定义图片。'
      );
      await transactionDone(transaction);
      const validAsset = asset && storedAssetBlob(asset) ? asset : undefined;
      return {
        mapping: stripActorRow(row),
        ...(validAsset ? { asset: assetMetadata(validAsset) } : {}),
        status: validAsset ? 'ready' : 'asset_missing'
      };
    } finally {
      db.close();
    }
  }

  async getSceneOverride(
    key: AvgSceneVisualOverrideKey
  ): Promise<AvgSceneVisualOverrideLookup | undefined> {
    const db = await this.open();
    try {
      const transaction = db.transaction([SCENE_STORE, ASSET_STORE], 'readonly');
      const row = await requestToPromise<StoredSceneOverride | undefined>(
        transaction.objectStore(SCENE_STORE).get(avgSceneOverrideKey(key)),
        '无法读取场景 AVG 自定义背景。'
      );
      if (!row) {
        await transactionDone(transaction);
        return undefined;
      }
      const asset = await requestToPromise<StoredAsset | undefined>(
        transaction.objectStore(ASSET_STORE).get(row.assetId),
        '无法读取场景 AVG 自定义图片。'
      );
      await transactionDone(transaction);
      const validAsset = asset && storedAssetBlob(asset) ? asset : undefined;
      return {
        mapping: stripSceneRow(row),
        ...(validAsset ? { asset: assetMetadata(validAsset) } : {}),
        status: validAsset ? 'ready' : 'asset_missing'
      };
    } finally {
      db.close();
    }
  }

  async listUserOutfits(
    key: AvgActorVisualOverrideKey
  ): Promise<AvgUserOutfitDefinition[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction(USER_OUTFIT_STORE, 'readonly');
      const rows = await requestToPromise<StoredUserOutfit[]>(
        transaction.objectStore(USER_OUTFIT_STORE).index(ACTOR_INDEX).getAll(
          IDBKeyRange.only(avgActorIdentityKey(key))
        ),
        '无法读取人物自定义服装。'
      );
      await transactionDone(transaction);
      return rows.map(stripUserOutfitRow).sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt)
      );
    } finally {
      db.close();
    }
  }

  async createUserOutfit(
    key: AvgActorVisualOverrideKey,
    draft: AvgUserOutfitDraft
  ): Promise<AvgUserOutfitDefinition> {
    const cleaned = cleanOutfitDraft(draft);
    const now = new Date().toISOString();
    const definition: AvgUserOutfitDefinition = {
      ...key,
      outfitId: createAvgUserOutfitId(),
      ...cleaned,
      createdAt: now,
      updatedAt: now
    };
    const db = await this.open();
    try {
      const transaction = db.transaction(USER_OUTFIT_STORE, 'readwrite');
      transaction.objectStore(USER_OUTFIT_STORE).add(storedUserOutfit(definition));
      await transactionDone(transaction);
      return definition;
    } finally {
      db.close();
    }
  }

  async updateUserOutfit(
    key: AvgActorVisualOverrideKey,
    outfitId: string,
    draft: AvgUserOutfitDraft
  ): Promise<AvgUserOutfitDefinition> {
    const cleaned = cleanOutfitDraft(draft);
    const db = await this.open();
    try {
      const transaction = db.transaction(USER_OUTFIT_STORE, 'readwrite');
      const store = transaction.objectStore(USER_OUTFIT_STORE);
      const row = await requestToPromise<StoredUserOutfit | undefined>(
        store.get(avgUserOutfitKey(key, outfitId)),
        '无法读取待修改的自定义服装。'
      );
      if (!row) {
        transaction.abort();
        throw new Error('找不到要修改的自定义服装。');
      }
      const definition: AvgUserOutfitDefinition = {
        ...stripUserOutfitRow(row),
        ...cleaned,
        updatedAt: new Date().toISOString()
      };
      store.put(storedUserOutfit(definition));
      await transactionDone(transaction);
      return definition;
    } finally {
      db.close();
    }
  }

  async removeUserOutfit(
    key: AvgActorVisualOverrideKey,
    outfitId: string,
    activeBasePackId?: string
  ): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          ASSET_STORE,
          ACTOR_STORE,
          SCENE_STORE,
          USER_OUTFIT_STORE,
          OUTFIT_SELECTION_STORE,
          OUTFIT_OVERRIDE_STORE
        ],
        'readwrite'
      );
      const userStore = transaction.objectStore(USER_OUTFIT_STORE);
      userStore.delete(avgUserOutfitKey(key, outfitId));

      const selectionStore = transaction.objectStore(OUTFIT_SELECTION_STORE);
      const actorKey = avgActorIdentityKey(key);
      const selectionRow = await requestToPromise<StoredOutfitSelection | undefined>(
        selectionStore.get(actorKey),
        '无法读取自定义服装选择。'
      );
      if (selectionRow?.activeUserOutfitId === outfitId) {
        const { activeUserOutfitId: _removed, ...remaining } = stripOutfitSelectionRow(selectionRow);
        const resourceOutfitIdsByBasePack = { ...remaining.resourceOutfitIdsByBasePack };
        if (activeBasePackId) delete resourceOutfitIdsByBasePack[activeBasePackId];
        selectionStore.put(storedOutfitSelection({
          ...remaining,
          resourceOutfitIdsByBasePack,
          updatedAt: new Date().toISOString()
        }));
      }

      const overrideKey: AvgActorOutfitVisualOverrideKey = {
        ...key,
        outfit: { type: 'user_outfit', outfitId }
      };
      const overrideStore = transaction.objectStore(OUTFIT_OVERRIDE_STORE);
      const mappingKey = avgActorOutfitOverrideKey(overrideKey);
      const overrideRow = await requestToPromise<StoredOutfitOverride | undefined>(
        overrideStore.get(mappingKey),
        '无法读取自定义服装图片映射。'
      );
      overrideStore.delete(mappingKey);
      if (overrideRow) await maybeDeleteOrphan(transaction, overrideRow.assetId);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async getActorOutfitSelection(
    key: AvgActorVisualOverrideKey,
    basePackId: string
  ): Promise<AvgActorOutfitSelectionLookup> {
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [USER_OUTFIT_STORE, OUTFIT_SELECTION_STORE],
        'readonly'
      );
      const row = await requestToPromise<StoredOutfitSelection | undefined>(
        transaction.objectStore(OUTFIT_SELECTION_STORE).get(avgActorIdentityKey(key)),
        '无法读取人物服装选择。'
      );
      const state = row ? stripOutfitSelectionRow(row) : undefined;
      const userOutfit = state?.activeUserOutfitId
        ? await requestToPromise<StoredUserOutfit | undefined>(
            transaction.objectStore(USER_OUTFIT_STORE).get(
              avgUserOutfitKey(key, state.activeUserOutfitId)
            ),
            '无法验证人物自定义服装。'
          )
        : undefined;
      await transactionDone(transaction);
      return effectiveOutfitSelection(state, basePackId, Boolean(userOutfit));
    } finally {
      db.close();
    }
  }

  async setActorOutfitSelection(
    key: AvgActorVisualOverrideKey,
    selection: AvgOutfitSelection,
    activeBasePackId: string
  ): Promise<AvgActorOutfitSelectionLookup> {
    if (
      selection.type === 'resource_outfit' &&
      selection.basePackId !== activeBasePackId
    ) throw new Error('只能选择当前 AVG 资源包内的服装。');
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [USER_OUTFIT_STORE, OUTFIT_SELECTION_STORE],
        'readwrite'
      );
      if (selection.type === 'user_outfit') {
        const definition = await requestToPromise<StoredUserOutfit | undefined>(
          transaction.objectStore(USER_OUTFIT_STORE).get(
            avgUserOutfitKey(key, selection.outfitId)
          ),
          '无法验证要选择的自定义服装。'
        );
        if (!definition) {
          transaction.abort();
          throw new Error('找不到要选择的自定义服装。');
        }
      }
      const store = transaction.objectStore(OUTFIT_SELECTION_STORE);
      const actorKey = avgActorIdentityKey(key);
      const row = await requestToPromise<StoredOutfitSelection | undefined>(
        store.get(actorKey),
        '无法读取原人物服装选择。'
      );
      const now = new Date().toISOString();
      const previous = row ? stripOutfitSelectionRow(row) : undefined;
      const resourceOutfitIdsByBasePack = {
        ...(previous?.resourceOutfitIdsByBasePack ?? {})
      };
      if (selection.type === 'resource_outfit') {
        resourceOutfitIdsByBasePack[activeBasePackId] = selection.outfitId;
      } else if (selection.type === 'resource_default') {
        delete resourceOutfitIdsByBasePack[activeBasePackId];
      }
      const state: AvgActorOutfitSelectionState = {
        ...key,
        ...(selection.type === 'user_outfit'
          ? { activeUserOutfitId: selection.outfitId }
          : {}),
        resourceOutfitIdsByBasePack,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now
      };
      store.put(storedOutfitSelection(state));
      await transactionDone(transaction);
      return effectiveOutfitSelection(
        state,
        activeBasePackId,
        selection.type === 'user_outfit'
      );
    } finally {
      db.close();
    }
  }

  async getActorOutfitOverride(
    key: AvgActorOutfitVisualOverrideKey
  ): Promise<AvgActorOutfitVisualOverrideLookup | undefined> {
    const db = await this.open();
    try {
      const transaction = db.transaction([OUTFIT_OVERRIDE_STORE, ASSET_STORE], 'readonly');
      const row = await requestToPromise<StoredOutfitOverride | undefined>(
        transaction.objectStore(OUTFIT_OVERRIDE_STORE).get(avgActorOutfitOverrideKey(key)),
        '无法读取服装专用自定义立绘。'
      );
      if (!row) {
        await transactionDone(transaction);
        return undefined;
      }
      const asset = await requestToPromise<StoredAsset | undefined>(
        transaction.objectStore(ASSET_STORE).get(row.assetId),
        '无法读取服装专用自定义图片。'
      );
      await transactionDone(transaction);
      const validAsset = asset && storedAssetBlob(asset) ? asset : undefined;
      return {
        mapping: stripOutfitOverrideRow(row),
        ...(validAsset ? { asset: assetMetadata(validAsset) } : {}),
        status: validAsset ? 'ready' : 'asset_missing'
      };
    } finally {
      db.close();
    }
  }

  async replaceActorOutfitOverride(
    key: AvgActorOutfitVisualOverrideKey,
    image: AvgValidatedOverrideImage
  ): Promise<AvgActorOutfitVisualOverrideLookup> {
    const imageBytes = await image.blob.arrayBuffer();
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [ASSET_STORE, ACTOR_STORE, SCENE_STORE, OUTFIT_OVERRIDE_STORE],
        'readwrite'
      );
      const store = transaction.objectStore(OUTFIT_OVERRIDE_STORE);
      const mappingKey = avgActorOutfitOverrideKey(key);
      const existing = await requestToPromise<StoredOutfitOverride | undefined>(
        store.get(mappingKey),
        '无法读取原服装专用自定义映射。'
      );
      const duplicateAssets = await requestToPromise<StoredAsset[]>(
        transaction.objectStore(ASSET_STORE).index(PARTITION_HASH_INDEX).getAll(
          IDBKeyRange.only([key.visualPartitionId, image.sha256])
        ),
        '无法检查重复 AVG 自定义图片。'
      );
      const reusable = duplicateAssets.find((asset) =>
        asset.byteLength === image.byteLength &&
        asset.mediaType === image.mediaType &&
        Boolean(storedAssetBlob(asset))
      );
      const now = new Date().toISOString();
      const asset: StoredAsset = reusable ?? {
        assetId: createAvgOverrideAssetId(),
        visualPartitionId: key.visualPartitionId,
        bytes: imageBytes,
        mediaType: image.mediaType,
        width: image.width,
        height: image.height,
        byteLength: image.byteLength,
        sha256: image.sha256,
        ...(image.source ? { source: image.source } : {}),
        ...(image.sourceTaskId ? { sourceTaskId: image.sourceTaskId } : {}),
        ...(image.originalFileName ? { originalFileName: image.originalFileName } : {}),
        createdAt: now
      };
      if (!reusable) transaction.objectStore(ASSET_STORE).put(asset);
      const mapping: AvgActorOutfitVisualOverride = {
        ...key,
        scope: 'actor_outfit_all_variants',
        assetId: asset.assetId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      store.put(storedOutfitOverride(mapping));
      if (existing && existing.assetId !== asset.assetId) {
        await maybeDeleteOrphan(transaction, existing.assetId);
      }
      await transactionDone(transaction);
      return (await this.getActorOutfitOverride(key))!;
    } finally {
      db.close();
    }
  }

  async removeActorOutfitOverride(
    key: AvgActorOutfitVisualOverrideKey
  ): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [ASSET_STORE, ACTOR_STORE, SCENE_STORE, OUTFIT_OVERRIDE_STORE],
        'readwrite'
      );
      const store = transaction.objectStore(OUTFIT_OVERRIDE_STORE);
      const mappingKey = avgActorOutfitOverrideKey(key);
      const existing = await requestToPromise<StoredOutfitOverride | undefined>(
        store.get(mappingKey),
        '无法读取待移除的服装专用自定义映射。'
      );
      store.delete(mappingKey);
      if (existing) await maybeDeleteOrphan(transaction, existing.assetId);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async getAssetBlob(assetId: string): Promise<Blob | undefined> {
    const db = await this.open();
    try {
      const transaction = db.transaction(ASSET_STORE, 'readonly');
      const asset = await requestToPromise<StoredAsset | undefined>(
        transaction.objectStore(ASSET_STORE).get(assetId),
        '无法读取 AVG 自定义图片。'
      );
      await transactionDone(transaction);
      return asset ? storedAssetBlob(asset) : undefined;
    } finally {
      db.close();
    }
  }

  private async replaceOverride(
    kind: 'actor' | 'scene',
    key: AvgActorVisualOverrideKey | AvgSceneVisualOverrideKey,
    image: AvgValidatedOverrideImage
  ): Promise<AvgActorVisualOverrideLookup | AvgSceneVisualOverrideLookup> {
    const imageBytes = await image.blob.arrayBuffer();
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [ASSET_STORE, ACTOR_STORE, SCENE_STORE, OUTFIT_OVERRIDE_STORE],
        'readwrite'
      );
      const mappingStore = transaction.objectStore(kind === 'actor' ? ACTOR_STORE : SCENE_STORE);
      const mappingKey = kind === 'actor'
        ? avgActorOverrideKey(key as AvgActorVisualOverrideKey)
        : avgSceneOverrideKey(key as AvgSceneVisualOverrideKey);
      const existing = await requestToPromise<StoredActorOverride | StoredSceneOverride | undefined>(
        mappingStore.get(mappingKey),
        '无法读取原有 AVG 自定义映射。'
      );
      const duplicateAssets = await requestToPromise<StoredAsset[]>(
        transaction.objectStore(ASSET_STORE).index(PARTITION_HASH_INDEX).getAll(
          IDBKeyRange.only([key.visualPartitionId, image.sha256])
        ),
        '无法检查重复 AVG 自定义图片。'
      );
      const reusable = duplicateAssets.find((asset) =>
        asset.byteLength === image.byteLength &&
        asset.mediaType === image.mediaType &&
        Boolean(storedAssetBlob(asset))
      );
      const now = new Date().toISOString();
      const asset: StoredAsset = reusable ?? {
        assetId: createAvgOverrideAssetId(),
        visualPartitionId: key.visualPartitionId,
        bytes: imageBytes,
        mediaType: image.mediaType,
        width: image.width,
        height: image.height,
        byteLength: image.byteLength,
        sha256: image.sha256,
        ...(image.source ? { source: image.source } : {}),
        ...(image.sourceTaskId ? { sourceTaskId: image.sourceTaskId } : {}),
        ...(image.originalFileName ? { originalFileName: image.originalFileName } : {}),
        createdAt: now
      };
      if (!reusable) transaction.objectStore(ASSET_STORE).put(asset);

      if (kind === 'actor') {
        const actorKey = key as AvgActorVisualOverrideKey;
        const mapping: AvgActorVisualOverride = {
          ...actorKey,
          scope: 'actor_all_variants',
          assetId: asset.assetId,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        };
        mappingStore.put(storedActor(mapping));
      } else {
        const sceneKey = key as AvgSceneVisualOverrideKey;
        const mapping: AvgSceneVisualOverride = {
          ...sceneKey,
          assetId: asset.assetId,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        };
        mappingStore.put(storedScene(mapping));
      }

      if (existing && existing.assetId !== asset.assetId) {
        await maybeDeleteOrphan(transaction, existing.assetId);
      }
      await transactionDone(transaction);
      return kind === 'actor'
        ? (await this.getActorOverride(key as AvgActorVisualOverrideKey))!
        : (await this.getSceneOverride(key as AvgSceneVisualOverrideKey))!;
    } finally {
      db.close();
    }
  }

  replaceActorOverride(
    key: AvgActorVisualOverrideKey,
    image: AvgValidatedOverrideImage
  ): Promise<AvgActorVisualOverrideLookup> {
    return this.replaceOverride('actor', key, image) as Promise<AvgActorVisualOverrideLookup>;
  }

  replaceSceneOverride(
    key: AvgSceneVisualOverrideKey,
    image: AvgValidatedOverrideImage
  ): Promise<AvgSceneVisualOverrideLookup> {
    return this.replaceOverride('scene', key, image) as Promise<AvgSceneVisualOverrideLookup>;
  }

  private async removeOverride(
    kind: 'actor' | 'scene',
    key: AvgActorVisualOverrideKey | AvgSceneVisualOverrideKey
  ): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [ASSET_STORE, ACTOR_STORE, SCENE_STORE, OUTFIT_OVERRIDE_STORE],
        'readwrite'
      );
      const store = transaction.objectStore(kind === 'actor' ? ACTOR_STORE : SCENE_STORE);
      const mappingKey = kind === 'actor'
        ? avgActorOverrideKey(key as AvgActorVisualOverrideKey)
        : avgSceneOverrideKey(key as AvgSceneVisualOverrideKey);
      const existing = await requestToPromise<StoredActorOverride | StoredSceneOverride | undefined>(
        store.get(mappingKey),
        '无法读取待移除的 AVG 自定义映射。'
      );
      store.delete(mappingKey);
      if (existing) await maybeDeleteOrphan(transaction, existing.assetId);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  removeActorOverride(key: AvgActorVisualOverrideKey): Promise<void> {
    return this.removeOverride('actor', key);
  }

  removeSceneOverride(key: AvgSceneVisualOverrideKey): Promise<void> {
    return this.removeOverride('scene', key);
  }

  async exportPartition(visualPartitionId: string): Promise<AvgVisualOverridePartitionSnapshot> {
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          ASSET_STORE,
          ACTOR_STORE,
          SCENE_STORE,
          USER_OUTFIT_STORE,
          OUTFIT_SELECTION_STORE,
          OUTFIT_OVERRIDE_STORE
        ],
        'readonly'
      );
      const [
        assetRows,
        actorRows,
        sceneRows,
        userOutfitRows,
        selectionRows,
        outfitOverrideRows
      ] = await Promise.all([
        requestToPromise<StoredAsset[]>(
          transaction.objectStore(ASSET_STORE).index(PARTITION_INDEX).getAll(
            IDBKeyRange.only(visualPartitionId)
          ),
          '无法导出 AVG 自定义图片。'
        ),
        requestToPromise<StoredActorOverride[]>(
          transaction.objectStore(ACTOR_STORE).index(PARTITION_INDEX).getAll(
            IDBKeyRange.only(visualPartitionId)
          ),
          '无法导出人物 AVG 自定义映射。'
        ),
        requestToPromise<StoredSceneOverride[]>(
          transaction.objectStore(SCENE_STORE).index(PARTITION_INDEX).getAll(
            IDBKeyRange.only(visualPartitionId)
          ),
          '无法导出场景 AVG 自定义映射。'
        ),
        requestToPromise<StoredUserOutfit[]>(
          transaction.objectStore(USER_OUTFIT_STORE).index(PARTITION_INDEX).getAll(
            IDBKeyRange.only(visualPartitionId)
          ),
          '无法导出人物自定义服装。'
        ),
        requestToPromise<StoredOutfitSelection[]>(
          transaction.objectStore(OUTFIT_SELECTION_STORE).index(PARTITION_INDEX).getAll(
            IDBKeyRange.only(visualPartitionId)
          ),
          '无法导出人物服装选择。'
        ),
        requestToPromise<StoredOutfitOverride[]>(
          transaction.objectStore(OUTFIT_OVERRIDE_STORE).index(PARTITION_INDEX).getAll(
            IDBKeyRange.only(visualPartitionId)
          ),
          '无法导出服装专用自定义映射。'
        )
      ]);
      await transactionDone(transaction);
      return {
        visualPartitionId,
        assets: assetRows.map(assetMetadata),
        actorOverrides: actorRows.map(stripActorRow),
        sceneOverrides: sceneRows.map(stripSceneRow),
        userOutfits: userOutfitRows.map(stripUserOutfitRow),
        outfitSelections: selectionRows.map(stripOutfitSelectionRow),
        outfitOverrides: outfitOverrideRows.map(stripOutfitOverrideRow)
      };
    } finally {
      db.close();
    }
  }

  async replacePartitionFromArchive(
    snapshot: AvgVisualOverridePartitionSnapshot,
    blobs: ReadonlyMap<string, Blob>
  ): Promise<void> {
    if (
      snapshot.assets.some((asset) => asset.visualPartitionId !== snapshot.visualPartitionId) ||
      snapshot.actorOverrides.some((item) => item.visualPartitionId !== snapshot.visualPartitionId) ||
      snapshot.sceneOverrides.some((item) => item.visualPartitionId !== snapshot.visualPartitionId) ||
      snapshot.userOutfits.some((item) => item.visualPartitionId !== snapshot.visualPartitionId) ||
      snapshot.outfitSelections.some((item) => item.visualPartitionId !== snapshot.visualPartitionId) ||
      snapshot.outfitOverrides.some((item) => item.visualPartitionId !== snapshot.visualPartitionId)
    ) throw new Error('AVG 自定义视觉资料分区不一致。');
    const assetIds = new Set(snapshot.assets.map((asset) => asset.assetId));
    if (
      snapshot.actorOverrides.some((item) => !assetIds.has(item.assetId)) ||
      snapshot.sceneOverrides.some((item) => !assetIds.has(item.assetId)) ||
      snapshot.outfitOverrides.some((item) => !assetIds.has(item.assetId)) ||
      snapshot.assets.some((asset) => !blobs.has(asset.assetId))
    ) throw new Error('AVG 自定义视觉资料缺少图片。');

    const assetBytes = new Map<string, ArrayBuffer>();
    for (const asset of snapshot.assets) {
      assetBytes.set(asset.assetId, await blobs.get(asset.assetId)!.arrayBuffer());
    }

    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          ASSET_STORE,
          ACTOR_STORE,
          SCENE_STORE,
          USER_OUTFIT_STORE,
          OUTFIT_SELECTION_STORE,
          OUTFIT_OVERRIDE_STORE
        ],
        'readwrite'
      );
      await Promise.all([
        deleteByIndex(
          transaction.objectStore(ASSET_STORE), PARTITION_INDEX, snapshot.visualPartitionId,
          '无法清理原 AVG 自定义图片。'
        ),
        deleteByIndex(
          transaction.objectStore(ACTOR_STORE), PARTITION_INDEX, snapshot.visualPartitionId,
          '无法清理原人物 AVG 自定义映射。'
        ),
        deleteByIndex(
          transaction.objectStore(SCENE_STORE), PARTITION_INDEX, snapshot.visualPartitionId,
          '无法清理原场景 AVG 自定义映射。'
        ),
        deleteByIndex(
          transaction.objectStore(USER_OUTFIT_STORE), PARTITION_INDEX, snapshot.visualPartitionId,
          '无法清理原人物自定义服装。'
        ),
        deleteByIndex(
          transaction.objectStore(OUTFIT_SELECTION_STORE), PARTITION_INDEX, snapshot.visualPartitionId,
          '无法清理原人物服装选择。'
        ),
        deleteByIndex(
          transaction.objectStore(OUTFIT_OVERRIDE_STORE), PARTITION_INDEX, snapshot.visualPartitionId,
          '无法清理原服装专用自定义映射。'
        )
      ]);
      const assetStore = transaction.objectStore(ASSET_STORE);
      for (const asset of snapshot.assets) {
        assetStore.put({ ...asset, bytes: assetBytes.get(asset.assetId)! } satisfies StoredAsset);
      }
      const actorStore = transaction.objectStore(ACTOR_STORE);
      snapshot.actorOverrides.forEach((mapping) => actorStore.put(storedActor(mapping)));
      const sceneStore = transaction.objectStore(SCENE_STORE);
      snapshot.sceneOverrides.forEach((mapping) => sceneStore.put(storedScene(mapping)));
      const userOutfitStore = transaction.objectStore(USER_OUTFIT_STORE);
      snapshot.userOutfits.forEach((definition) =>
        userOutfitStore.put(storedUserOutfit(definition))
      );
      const selectionStore = transaction.objectStore(OUTFIT_SELECTION_STORE);
      snapshot.outfitSelections.forEach((selection) =>
        selectionStore.put(storedOutfitSelection(selection))
      );
      const outfitOverrideStore = transaction.objectStore(OUTFIT_OVERRIDE_STORE);
      snapshot.outfitOverrides.forEach((mapping) =>
        outfitOverrideStore.put(storedOutfitOverride(mapping))
      );
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async clearPartition(visualPartitionId: string): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          ASSET_STORE,
          ACTOR_STORE,
          SCENE_STORE,
          USER_OUTFIT_STORE,
          OUTFIT_SELECTION_STORE,
          OUTFIT_OVERRIDE_STORE
        ],
        'readwrite'
      );
      await Promise.all([
        deleteByIndex(transaction.objectStore(ASSET_STORE), PARTITION_INDEX, visualPartitionId, '无法清理 AVG 自定义图片。'),
        deleteByIndex(transaction.objectStore(ACTOR_STORE), PARTITION_INDEX, visualPartitionId, '无法清理人物 AVG 自定义映射。'),
        deleteByIndex(transaction.objectStore(SCENE_STORE), PARTITION_INDEX, visualPartitionId, '无法清理场景 AVG 自定义映射。'),
        deleteByIndex(transaction.objectStore(USER_OUTFIT_STORE), PARTITION_INDEX, visualPartitionId, '无法清理人物自定义服装。'),
        deleteByIndex(transaction.objectStore(OUTFIT_SELECTION_STORE), PARTITION_INDEX, visualPartitionId, '无法清理人物服装选择。'),
        deleteByIndex(transaction.objectStore(OUTFIT_OVERRIDE_STORE), PARTITION_INDEX, visualPartitionId, '无法清理服装专用自定义映射。')
      ]);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async clearAll(): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(
        [
          ASSET_STORE,
          ACTOR_STORE,
          SCENE_STORE,
          USER_OUTFIT_STORE,
          OUTFIT_SELECTION_STORE,
          OUTFIT_OVERRIDE_STORE
        ],
        'readwrite'
      );
      transaction.objectStore(ASSET_STORE).clear();
      transaction.objectStore(ACTOR_STORE).clear();
      transaction.objectStore(SCENE_STORE).clear();
      transaction.objectStore(USER_OUTFIT_STORE).clear();
      transaction.objectStore(OUTFIT_SELECTION_STORE).clear();
      transaction.objectStore(OUTFIT_OVERRIDE_STORE).clear();
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }
}

export class MemoryAvgVisualOverrideRepository implements AvgVisualOverrideRepository {
  private readonly assets = new Map<string, { metadata: AvgOverrideAssetMetadata; blob: Blob }>();
  private readonly actorOverrides = new Map<string, AvgActorVisualOverride>();
  private readonly sceneOverrides = new Map<string, AvgSceneVisualOverride>();
  private readonly userOutfits = new Map<string, AvgUserOutfitDefinition>();
  private readonly outfitSelections = new Map<string, AvgActorOutfitSelectionState>();
  private readonly outfitOverrides = new Map<string, AvgActorOutfitVisualOverride>();

  private findAsset(assetId: string): AvgOverrideAssetMetadata | undefined {
    return this.assets.get(assetId)?.metadata;
  }

  getActorOverride(
    key: AvgActorVisualOverrideKey
  ): Promise<AvgActorVisualOverrideLookup | undefined> {
    const mapping = this.actorOverrides.get(avgActorOverrideKey(key));
    if (!mapping) return Promise.resolve(undefined);
    const asset = this.findAsset(mapping.assetId);
    return Promise.resolve({ mapping, ...(asset ? { asset } : {}), status: asset ? 'ready' : 'asset_missing' });
  }

  getSceneOverride(
    key: AvgSceneVisualOverrideKey
  ): Promise<AvgSceneVisualOverrideLookup | undefined> {
    const mapping = this.sceneOverrides.get(avgSceneOverrideKey(key));
    if (!mapping) return Promise.resolve(undefined);
    const asset = this.findAsset(mapping.assetId);
    return Promise.resolve({ mapping, ...(asset ? { asset } : {}), status: asset ? 'ready' : 'asset_missing' });
  }

  listUserOutfits(key: AvgActorVisualOverrideKey): Promise<AvgUserOutfitDefinition[]> {
    const actorKey = avgActorIdentityKey(key);
    return Promise.resolve([...this.userOutfits.values()]
      .filter((definition) => avgActorIdentityKey(definition) === actorKey)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
  }

  createUserOutfit(
    key: AvgActorVisualOverrideKey,
    draft: AvgUserOutfitDraft
  ): Promise<AvgUserOutfitDefinition> {
    const now = new Date().toISOString();
    const definition: AvgUserOutfitDefinition = {
      ...key,
      outfitId: createAvgUserOutfitId(),
      ...cleanOutfitDraft(draft),
      createdAt: now,
      updatedAt: now
    };
    this.userOutfits.set(avgUserOutfitKey(key, definition.outfitId), definition);
    return Promise.resolve(definition);
  }

  updateUserOutfit(
    key: AvgActorVisualOverrideKey,
    outfitId: string,
    draft: AvgUserOutfitDraft
  ): Promise<AvgUserOutfitDefinition> {
    const storageKey = avgUserOutfitKey(key, outfitId);
    const previous = this.userOutfits.get(storageKey);
    if (!previous) return Promise.reject(new Error('找不到要修改的自定义服装。'));
    const definition: AvgUserOutfitDefinition = {
      ...previous,
      ...cleanOutfitDraft(draft),
      updatedAt: new Date().toISOString()
    };
    this.userOutfits.set(storageKey, definition);
    return Promise.resolve(definition);
  }

  async removeUserOutfit(
    key: AvgActorVisualOverrideKey,
    outfitId: string,
    activeBasePackId?: string
  ): Promise<void> {
    this.userOutfits.delete(avgUserOutfitKey(key, outfitId));
    const actorKey = avgActorIdentityKey(key);
    const state = this.outfitSelections.get(actorKey);
    if (state?.activeUserOutfitId === outfitId) {
      const { activeUserOutfitId: _removed, ...remaining } = state;
      const resourceOutfitIdsByBasePack = { ...remaining.resourceOutfitIdsByBasePack };
      if (activeBasePackId) delete resourceOutfitIdsByBasePack[activeBasePackId];
      this.outfitSelections.set(actorKey, {
        ...remaining,
        resourceOutfitIdsByBasePack,
        updatedAt: new Date().toISOString()
      });
    }
    const overrideKey = avgActorOutfitOverrideKey({
      ...key,
      outfit: { type: 'user_outfit', outfitId }
    });
    const previous = this.outfitOverrides.get(overrideKey);
    this.outfitOverrides.delete(overrideKey);
    if (previous) this.cleanupAsset(previous.assetId);
  }

  getActorOutfitSelection(
    key: AvgActorVisualOverrideKey,
    basePackId: string
  ): Promise<AvgActorOutfitSelectionLookup> {
    const state = this.outfitSelections.get(avgActorIdentityKey(key));
    const userOutfitExists = Boolean(
      state?.activeUserOutfitId &&
      this.userOutfits.has(avgUserOutfitKey(key, state.activeUserOutfitId))
    );
    return Promise.resolve(effectiveOutfitSelection(state, basePackId, userOutfitExists));
  }

  setActorOutfitSelection(
    key: AvgActorVisualOverrideKey,
    selection: AvgOutfitSelection,
    activeBasePackId: string
  ): Promise<AvgActorOutfitSelectionLookup> {
    if (
      selection.type === 'resource_outfit' &&
      selection.basePackId !== activeBasePackId
    ) return Promise.reject(new Error('只能选择当前 AVG 资源包内的服装。'));
    if (
      selection.type === 'user_outfit' &&
      !this.userOutfits.has(avgUserOutfitKey(key, selection.outfitId))
    ) return Promise.reject(new Error('找不到要选择的自定义服装。'));
    const actorKey = avgActorIdentityKey(key);
    const previous = this.outfitSelections.get(actorKey);
    const resourceOutfitIdsByBasePack = {
      ...(previous?.resourceOutfitIdsByBasePack ?? {})
    };
    if (selection.type === 'resource_outfit') {
      resourceOutfitIdsByBasePack[activeBasePackId] = selection.outfitId;
    } else if (selection.type === 'resource_default') {
      delete resourceOutfitIdsByBasePack[activeBasePackId];
    }
    const now = new Date().toISOString();
    const state: AvgActorOutfitSelectionState = {
      ...key,
      ...(selection.type === 'user_outfit'
        ? { activeUserOutfitId: selection.outfitId }
        : {}),
      resourceOutfitIdsByBasePack,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    this.outfitSelections.set(actorKey, state);
    return Promise.resolve(effectiveOutfitSelection(
      state,
      activeBasePackId,
      selection.type === 'user_outfit'
    ));
  }

  getActorOutfitOverride(
    key: AvgActorOutfitVisualOverrideKey
  ): Promise<AvgActorOutfitVisualOverrideLookup | undefined> {
    const mapping = this.outfitOverrides.get(avgActorOutfitOverrideKey(key));
    if (!mapping) return Promise.resolve(undefined);
    const asset = this.findAsset(mapping.assetId);
    return Promise.resolve({
      mapping,
      ...(asset ? { asset } : {}),
      status: asset ? 'ready' : 'asset_missing'
    });
  }

  async replaceActorOutfitOverride(
    key: AvgActorOutfitVisualOverrideKey,
    image: AvgValidatedOverrideImage
  ): Promise<AvgActorOutfitVisualOverrideLookup> {
    const mappingKey = avgActorOutfitOverrideKey(key);
    const previous = this.outfitOverrides.get(mappingKey);
    const asset = this.storeImage(key.visualPartitionId, image);
    const now = new Date().toISOString();
    const mapping: AvgActorOutfitVisualOverride = {
      ...key,
      scope: 'actor_outfit_all_variants',
      assetId: asset.assetId,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    this.outfitOverrides.set(mappingKey, mapping);
    if (previous && previous.assetId !== asset.assetId) this.cleanupAsset(previous.assetId);
    return { mapping, asset, status: 'ready' };
  }

  async removeActorOutfitOverride(
    key: AvgActorOutfitVisualOverrideKey
  ): Promise<void> {
    const mappingKey = avgActorOutfitOverrideKey(key);
    const previous = this.outfitOverrides.get(mappingKey);
    this.outfitOverrides.delete(mappingKey);
    if (previous) this.cleanupAsset(previous.assetId);
  }

  getAssetBlob(assetId: string): Promise<Blob | undefined> {
    return Promise.resolve(this.assets.get(assetId)?.blob);
  }

  private storeImage(
    visualPartitionId: string,
    image: AvgValidatedOverrideImage
  ): AvgOverrideAssetMetadata {
    const reusable = [...this.assets.values()].find((candidate) =>
      candidate.metadata.visualPartitionId === visualPartitionId &&
      candidate.metadata.sha256 === image.sha256 &&
      candidate.metadata.mediaType === image.mediaType &&
      candidate.metadata.byteLength === image.byteLength
    );
    if (reusable) return reusable.metadata;
    const metadata: AvgOverrideAssetMetadata = {
      assetId: createAvgOverrideAssetId(),
      visualPartitionId,
      mediaType: image.mediaType,
      width: image.width,
      height: image.height,
      byteLength: image.byteLength,
      sha256: image.sha256,
      ...(image.source ? { source: image.source } : {}),
      ...(image.sourceTaskId ? { sourceTaskId: image.sourceTaskId } : {}),
      ...(image.originalFileName ? { originalFileName: image.originalFileName } : {}),
      createdAt: new Date().toISOString()
    };
    this.assets.set(metadata.assetId, { metadata, blob: image.blob });
    return metadata;
  }

  private cleanupAsset(assetId: string): void {
    const referenced = [
      ...this.actorOverrides.values(),
      ...this.sceneOverrides.values(),
      ...this.outfitOverrides.values()
    ]
      .some((mapping) => mapping.assetId === assetId);
    if (!referenced) this.assets.delete(assetId);
  }

  async replaceActorOverride(
    key: AvgActorVisualOverrideKey,
    image: AvgValidatedOverrideImage
  ): Promise<AvgActorVisualOverrideLookup> {
    const mappingKey = avgActorOverrideKey(key);
    const previous = this.actorOverrides.get(mappingKey);
    const asset = this.storeImage(key.visualPartitionId, image);
    const now = new Date().toISOString();
    const mapping: AvgActorVisualOverride = {
      ...key,
      scope: 'actor_all_variants',
      assetId: asset.assetId,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    this.actorOverrides.set(mappingKey, mapping);
    if (previous && previous.assetId !== asset.assetId) this.cleanupAsset(previous.assetId);
    return { mapping, asset, status: 'ready' };
  }

  async replaceSceneOverride(
    key: AvgSceneVisualOverrideKey,
    image: AvgValidatedOverrideImage
  ): Promise<AvgSceneVisualOverrideLookup> {
    const mappingKey = avgSceneOverrideKey(key);
    const previous = this.sceneOverrides.get(mappingKey);
    const asset = this.storeImage(key.visualPartitionId, image);
    const now = new Date().toISOString();
    const mapping: AvgSceneVisualOverride = {
      ...key,
      assetId: asset.assetId,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    this.sceneOverrides.set(mappingKey, mapping);
    if (previous && previous.assetId !== asset.assetId) this.cleanupAsset(previous.assetId);
    return { mapping, asset, status: 'ready' };
  }

  async removeActorOverride(key: AvgActorVisualOverrideKey): Promise<void> {
    const mappingKey = avgActorOverrideKey(key);
    const previous = this.actorOverrides.get(mappingKey);
    this.actorOverrides.delete(mappingKey);
    if (previous) this.cleanupAsset(previous.assetId);
  }

  async removeSceneOverride(key: AvgSceneVisualOverrideKey): Promise<void> {
    const mappingKey = avgSceneOverrideKey(key);
    const previous = this.sceneOverrides.get(mappingKey);
    this.sceneOverrides.delete(mappingKey);
    if (previous) this.cleanupAsset(previous.assetId);
  }

  exportPartition(visualPartitionId: string): Promise<AvgVisualOverridePartitionSnapshot> {
    return Promise.resolve({
      visualPartitionId,
      assets: [...this.assets.values()].map((item) => item.metadata)
        .filter((asset) => asset.visualPartitionId === visualPartitionId),
      actorOverrides: [...this.actorOverrides.values()]
        .filter((mapping) => mapping.visualPartitionId === visualPartitionId),
      sceneOverrides: [...this.sceneOverrides.values()]
        .filter((mapping) => mapping.visualPartitionId === visualPartitionId),
      userOutfits: [...this.userOutfits.values()]
        .filter((definition) => definition.visualPartitionId === visualPartitionId),
      outfitSelections: [...this.outfitSelections.values()]
        .filter((selection) => selection.visualPartitionId === visualPartitionId),
      outfitOverrides: [...this.outfitOverrides.values()]
        .filter((mapping) => mapping.visualPartitionId === visualPartitionId)
    });
  }

  async replacePartitionFromArchive(
    snapshot: AvgVisualOverridePartitionSnapshot,
    blobs: ReadonlyMap<string, Blob>
  ): Promise<void> {
    const assetIds = new Set(snapshot.assets.map((asset) => asset.assetId));
    if (
      snapshot.assets.some((asset) => !blobs.has(asset.assetId)) ||
      snapshot.actorOverrides.some((mapping) => !assetIds.has(mapping.assetId)) ||
      snapshot.sceneOverrides.some((mapping) => !assetIds.has(mapping.assetId)) ||
      snapshot.outfitOverrides.some((mapping) => !assetIds.has(mapping.assetId))
    ) throw new Error('AVG 自定义视觉资料缺少图片。');
    await this.clearPartition(snapshot.visualPartitionId);
    snapshot.assets.forEach((asset) => this.assets.set(asset.assetId, {
      metadata: asset,
      blob: blobs.get(asset.assetId)!
    }));
    snapshot.actorOverrides.forEach((mapping) =>
      this.actorOverrides.set(avgActorOverrideKey(mapping), mapping)
    );
    snapshot.sceneOverrides.forEach((mapping) =>
      this.sceneOverrides.set(avgSceneOverrideKey(mapping), mapping)
    );
    snapshot.userOutfits.forEach((definition) =>
      this.userOutfits.set(avgUserOutfitKey(definition, definition.outfitId), definition)
    );
    snapshot.outfitSelections.forEach((selection) =>
      this.outfitSelections.set(avgActorIdentityKey(selection), selection)
    );
    snapshot.outfitOverrides.forEach((mapping) =>
      this.outfitOverrides.set(avgActorOutfitOverrideKey(mapping), mapping)
    );
  }

  async clearPartition(visualPartitionId: string): Promise<void> {
    for (const [key, mapping] of this.actorOverrides) {
      if (mapping.visualPartitionId === visualPartitionId) this.actorOverrides.delete(key);
    }
    for (const [key, mapping] of this.sceneOverrides) {
      if (mapping.visualPartitionId === visualPartitionId) this.sceneOverrides.delete(key);
    }
    for (const [key, definition] of this.userOutfits) {
      if (definition.visualPartitionId === visualPartitionId) this.userOutfits.delete(key);
    }
    for (const [key, selection] of this.outfitSelections) {
      if (selection.visualPartitionId === visualPartitionId) this.outfitSelections.delete(key);
    }
    for (const [key, mapping] of this.outfitOverrides) {
      if (mapping.visualPartitionId === visualPartitionId) this.outfitOverrides.delete(key);
    }
    for (const [key, asset] of this.assets) {
      if (asset.metadata.visualPartitionId === visualPartitionId) this.assets.delete(key);
    }
  }

  async clearAll(): Promise<void> {
    this.assets.clear();
    this.actorOverrides.clear();
    this.sceneOverrides.clear();
    this.userOutfits.clear();
    this.outfitSelections.clear();
    this.outfitOverrides.clear();
  }

  /** Test-only corruption helper: keeps the mapping while removing its Blob/metadata. */
  removeAssetForTest(assetId: string): void {
    this.assets.delete(assetId);
  }
}
